package com.eggli.flashcards.plugins;

import android.Manifest;
import android.content.Context;
import android.database.Cursor;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

import android.content.Intent;
import androidx.activity.result.ActivityResult;

@CapacitorPlugin(
    name = "VoskASR",
    permissions = {
        @Permission(
            strings = {Manifest.permission.RECORD_AUDIO},
            alias = "microphone"
        ),
        @Permission(
            strings = {Manifest.permission.ACCESS_NETWORK_STATE},
            alias = "network_state"
        )
    }
)
public class VoskASRPlugin extends Plugin {

    private static final String TAG = "VoskASRPlugin";
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;

    private static final int LANZOU_PARSE_TIMEOUT_MS = 15000;
    private static final int LANZOU_PARSE_PROGRESS_INTERVAL_MS = 2000;

    // 文件导入超时：30秒（从 Content URI 读取文件到临时目录的最大时间）
    private static final int FILE_IMPORT_TIMEOUT_MS = 30000;

    // 多连接分片下载的并行连接数（12 连接，海外高延迟服务器需更多并行）
    private static final int NUM_SEGMENTS = 12;

    // 错误类型常量
    private static final String ERROR_NETWORK_DISCONNECTED = "network_disconnected";
    private static final String ERROR_DNS_FAILED = "dns_failed";
    private static final String ERROR_CONNECTION_TIMEOUT = "connection_timeout";
    private static final String ERROR_CONNECTION_REFUSED = "connection_refused";
    private static final String ERROR_SERVER_ERROR = "server_error";
    private static final String ERROR_LANZOU_PARSE_FAILED = "lanzou_parse_failed";
    private static final String ERROR_LANZOU_PARSE_TIMEOUT = "lanzou_parse_timeout";
    private static final String ERROR_DOWNLOAD_INCOMPLETE = "download_incomplete";
    private static final String ERROR_UNZIP_FAILED = "unzip_failed";
    private static final String ERROR_FILE_IMPORT_TIMEOUT = "file_import_timeout"; // 文件导入超时
    private static final String ERROR_FILE_OPEN_FAILED = "file_open_failed"; // 打开文件失败
    private static final String ERROR_UNKNOWN = "unknown_error";

    // OkHttp 客户端（单例，支持 HTTP/2、连接池、keep-alive）
    private static OkHttpClient okHttpClient = null;

    private static synchronized OkHttpClient getOkHttpClient() {
        if (okHttpClient == null) {
            okHttpClient = new OkHttpClient.Builder()
                    .connectTimeout(8, TimeUnit.SECONDS)
                    .readTimeout(45, TimeUnit.SECONDS)
                    .writeTimeout(45, TimeUnit.SECONDS)
                    .followRedirects(true)
                    .followSslRedirects(true)
                    .retryOnConnectionFailure(true)
                    .connectionPool(new okhttp3.ConnectionPool(8, 5, TimeUnit.MINUTES))
                    .build();
        }
        return okHttpClient;
    }

    private Model model;
    private Recognizer recognizer;
    private AudioRecord audioRecord;
    private volatile boolean isListening = false;
    private Thread recognitionThread;
    private PluginCall currentCall;
    private String finalResult = "";

    // recognizer 生命周期互斥锁：防止 recognitionThread 边用边被 close 导致 native SIGSEGV
    private final Object recognizerLock = new Object();
    // 标记 recognizer 是否已被销毁，recognitionThread 读取此标志后立即停止访问
    private volatile boolean recognizerDestroyed = false;
    
    private volatile boolean isDownloading = false;
    private Thread downloadThread;
    private volatile boolean downloadCancelled = false;
    private volatile boolean countdownRunning = false;
    private Thread countdownThread;

    // 导入相关字段
    private volatile boolean isImporting = false;
    private Thread importThread;

    // 当前下载/导入状态（供前端轮询查询，作为事件监听的后备方案）
    private volatile String currentStatusStage = "";     // downloading | importing | extracting | completed | error | ""
    private volatile String currentStatusText = "";       // 人类可读的状态文本
    private volatile long currentDownloadedBytes = 0;     // 已下载/已读取字节数
    private volatile long currentTotalBytes = 0;          // 总字节数（0 表示未知）
    private volatile int currentProgress = 0;             // 进度百分比（-1 表示未知）
    private volatile String currentDownloadedMB = "";     // 已下载 MB 文本
    private volatile String currentSourceLabel = "";      // 当前下载源名称
    private volatile String currentErrorCode = "";        // 错误码
    private volatile String currentErrorMessage = "";     // 错误消息
    private volatile String currentErrorSuggestion = "";  // 错误建议

    // 当前活动的输入/输出流引用，用于取消时强制关闭，打断阻塞 IO
    private volatile InputStream currentInputStream;
    private volatile FileOutputStream currentOutputStream;
    private final Object streamLock = new Object();

    @PluginMethod
    public void loadModel(PluginCall call) {
        try {
            String modelPath = call.getString("modelPath");

            if (modelPath == null || modelPath.isEmpty()) {
                File appModelDir = new File(getContext().getFilesDir(), "vosk-model");
                if (isValidModelDir(appModelDir)) {
                    modelPath = appModelDir.getAbsolutePath();
                } else {
                    call.reject("模型不存在，请先下载或放置语音模型");
                    return;
                }
            }

            File modelDir = new File(modelPath);
            if (!modelDir.exists()) {
                call.reject("模型路径不存在: " + modelPath);
                return;
            }

            // 严格验证模型完整性，避免 native 层 SIGSEGV 崩溃
            String validateError = validateModelFiles(modelDir);
            if (validateError != null) {
                Log.e(TAG, "模型完整性验证失败: " + validateError);
                call.reject("模型文件不完整: " + validateError);
                return;
            }

            LibVosk.setLogLevel(LogLevel.INFO);
            model = new Model(modelPath);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("modelPath", modelPath);
            call.resolve(result);
        } catch (Throwable e) {
            Log.e(TAG, "加载模型失败(native)", e);
            call.reject("加载模型失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkModel(PluginCall call) {
        boolean hasModel = false;
        String modelPath = null;

        File appModelDir = new File(getContext().getFilesDir(), "vosk-model");
        if (isValidModelDir(appModelDir)) {
            hasModel = true;
            modelPath = appModelDir.getAbsolutePath();
        }

        JSObject result = new JSObject();
        result.put("hasModel", hasModel);
        result.put("modelPath", modelPath);
        result.put("modelSize", hasModel ? getDirSize(appModelDir) : 0);
        call.resolve(result);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (isListening) {
            call.reject("已经在识别中");
            return;
        }

        if (model == null) {
            try {
                File appModelDir = new File(getContext().getFilesDir(), "vosk-model");
                if (!isValidModelDir(appModelDir)) {
                    call.reject("语音模型未加载，请先下载或导入模型");
                    return;
                }
                // 严格验证模型完整性，避免 native 层 SIGSEGV 崩溃
                String validateError = validateModelFiles(appModelDir);
                if (validateError != null) {
                    Log.e(TAG, "模型完整性验证失败: " + validateError);
                    call.reject("模型文件不完整: " + validateError);
                    return;
                }
                LibVosk.setLogLevel(LogLevel.INFO);
                model = new Model(appModelDir.getAbsolutePath());
            } catch (Throwable e) {
                Log.e(TAG, "加载模型失败(native)", e);
                call.reject("加载模型失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                return;
            }
        }

        try {
            synchronized (recognizerLock) {
                recognizer = new Recognizer(model, SAMPLE_RATE);
                recognizerDestroyed = false;
            }
            finalResult = "";

            int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
                call.reject("无法获取录音缓冲区大小");
                return;
            }

            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize * 4 // 大模型优化：4 倍缓冲区降低 acceptWaveForm 调用频率
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                call.reject("录音器初始化失败，请检查麦克风权限");
                return;
            }

            // 使用 final 局部变量持有 recognizer 引用，避免循环中读取被并发置空的字段
            final Recognizer localRecognizer = recognizer;
            isListening = true;
            currentCall = call;
            audioRecord.startRecording();

            recognitionThread = new Thread(() -> {
                android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO);
                byte[] buffer = new byte[bufferSize * 2];
                while (isListening && !recognizerDestroyed && !Thread.currentThread().isInterrupted()) {
                    int bytesRead;
                    try {
                        bytesRead = audioRecord.read(buffer, 0, buffer.length);
                    } catch (IllegalStateException ise) {
                        // audioRecord 被并发 release
                        Log.e(TAG, "audioRecord.read 失败（可能已被释放）", ise);
                        break;
                    }
                    if (bytesRead > 0) {
                        // Vosk 要求 16bit PCM，字节长度必须为偶数（2 字节对齐）
                        if ((bytesRead & 1) != 0) {
                            bytesRead -= 1;
                        }
                        if (bytesRead == 0) {
                            continue;
                        }
                        // 再次检查 recognizer 是否已被销毁，避免访问已释放的 native 对象
                        if (recognizerDestroyed) {
                            break;
                        }
                        try {
                            boolean isFinal = localRecognizer.acceptWaveForm(buffer, bytesRead);
                            if (isFinal) {
                                String resultJson = localRecognizer.getResult();
                                JSONObject json = new JSONObject(resultJson);
                                String text = json.optString("text", "");
                                if (!text.isEmpty()) {
                                    if (!finalResult.isEmpty()) {
                                        finalResult += " ";
                                    }
                                    finalResult += text;
                                }

                                JSObject partial = new JSObject();
                                partial.put("isFinal", true);
                                partial.put("text", text);
                                partial.put("fullText", finalResult);
                                notifyListeners("voskPartialResult", partial);
                            } else {
                                String partialJson = localRecognizer.getPartialResult();
                                JSONObject json = new JSONObject(partialJson);
                                String partial = json.optString("partial", "");

                                JSObject partialResult = new JSObject();
                                partialResult.put("isFinal", false);
                                partialResult.put("partial", partial);
                                partialResult.put("fullText", finalResult + (partial.isEmpty() ? "" : " " + partial));
                                notifyListeners("voskPartialResult", partialResult);
                            }
                        } catch (Throwable e) {
                            Log.e(TAG, "识别处理失败", e);
                            // 若为 native 层异常（Error/RuntimeException），立即停止避免连续崩溃
                            if (e instanceof Error || e instanceof IllegalStateException) {
                                break;
                            }
                        }
                    } else if (bytesRead == AudioRecord.ERROR_INVALID_OPERATION
                            || bytesRead == AudioRecord.ERROR_BAD_VALUE) {
                        break;
                    }
                }
            });
            recognitionThread.setPriority(Thread.MAX_PRIORITY);
            recognitionThread.start();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (SecurityException e) {
            // 异常路径：释放已分配的 audioRecord 和 recognizer，防止资源泄漏
            isListening = false;
            recognizerDestroyed = true;
            if (audioRecord != null) {
                try { audioRecord.release(); } catch (Exception ignore) {}
                audioRecord = null;
            }
            synchronized (recognizerLock) {
                if (recognizer != null) {
                    try { recognizer.close(); } catch (Exception ignore) {}
                    recognizer = null;
                }
            }
            call.reject("麦克风权限被拒绝，请在系统设置中允许");
        } catch (Throwable e) {
            Log.e(TAG, "启动识别失败(native)", e);
            // 异常路径：释放已分配的 audioRecord 和 recognizer，防止资源泄漏
            isListening = false;
            recognizerDestroyed = true;
            if (audioRecord != null) {
                try { audioRecord.release(); } catch (Exception ignore) {}
                audioRecord = null;
            }
            synchronized (recognizerLock) {
                if (recognizer != null) {
                    try { recognizer.close(); } catch (Exception ignore) {}
                    recognizer = null;
                }
            }
            call.reject("启动识别失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (!isListening) {
            call.reject("当前未在识别");
            return;
        }

        // 先置位标志，让 recognitionThread 自行退出循环，避免边用边关
        isListening = false;
        recognizerDestroyed = true;

        Thread t = recognitionThread;
        if (t != null) {
            try {
                t.join(2000);
                if (t.isAlive()) {
                    t.interrupt();
                    t.join(500);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        try {
            if (audioRecord != null) {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
                audioRecord = null;
            }
        } catch (Exception e) {
            // ignore
        }

        // 在锁内安全 close recognizer，防止 recognitionThread 残留访问
        synchronized (recognizerLock) {
            try {
                if (recognizer != null) {
                    String finalJson = recognizer.getFinalResult();
                    JSONObject json = new JSONObject(finalJson);
                    String text = json.optString("text", "");
                    if (!text.isEmpty()) {
                        if (!finalResult.isEmpty()) {
                            finalResult += " ";
                        }
                        finalResult += text;
                    }
                    recognizer.close();
                    recognizer = null;
                }
            } catch (Throwable e) {
                Log.e(TAG, "获取最终结果失败", e);
            } finally {
                recognitionThread = null;
            }
        }

        JSObject result = new JSObject();
        result.put("text", finalResult);
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        if (!isListening) {
            call.resolve();
            return;
        }

        isListening = false;
        recognizerDestroyed = true;

        Thread t = recognitionThread;
        if (t != null) {
            try {
                t.join(2000);
                if (t.isAlive()) {
                    t.interrupt();
                    t.join(500);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        try {
            if (audioRecord != null) {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
                audioRecord = null;
            }
        } catch (Exception e) {
            // ignore
        }

        synchronized (recognizerLock) {
            try {
                if (recognizer != null) {
                    recognizer.close();
                    recognizer = null;
                }
            } catch (Throwable e) {
                // ignore
            } finally {
                recognitionThread = null;
            }
        }

        finalResult = "";
        call.resolve();
    }

    @PluginMethod
    public void releaseModel(PluginCall call) {
        if (isListening) {
            call.reject("请先停止识别");
            return;
        }

        if (model != null) {
            model.close();
            model = null;
        }

        call.resolve();
    }

    /**
     * 打开当前应用的系统设置页面，引导用户授权麦克风/相机等权限。
     * 当权限被永久拒绝（shouldShowRequestPermissionRationale 返回 false）时调用。
     */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("success", true));
        } catch (Exception e) {
            Log.e(TAG, "打开应用设置失败", e);
            call.reject("无法打开应用设置: " + e.getMessage());
        }
    }

    /**
     * 检查麦克风权限是否已授予
     */
    @PluginMethod
    public void checkMicrophonePermission(PluginCall call) {
        try {
            int granted = getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO);
            JSObject result = new JSObject();
            result.put("granted", granted == android.content.pm.PackageManager.PERMISSION_GRANTED);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("检查权限失败: " + e.getMessage());
        }
    }

    /**
     * 查询当前下载/导入状态（供前端轮询，作为事件监听的后备方案）
     */
    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        JSObject status = new JSObject();
        status.put("isDownloading", isDownloading);
        status.put("isImporting", isImporting);
        status.put("stage", currentStatusStage);
        status.put("status", currentStatusText);
        status.put("downloaded", currentDownloadedBytes);
        status.put("total", currentTotalBytes);
        status.put("progress", currentProgress);
        status.put("downloadedMB", currentDownloadedMB);
        status.put("source", currentSourceLabel);
        status.put("errorCode", currentErrorCode);
        status.put("errorMessage", currentErrorMessage);
        status.put("suggestion", currentErrorSuggestion);
        call.resolve(status);
    }

    /**
     * 更新当前状态并发送事件（统一入口，确保状态字段和事件同步）
     */
    private void updateStatusAndNotify(String stage, String statusText, long downloaded, long total,
                                        int progress, String downloadedMB, String sourceLabel) {
        // 更新状态字段
        currentStatusStage = stage;
        currentStatusText = statusText;
        currentDownloadedBytes = downloaded;
        currentTotalBytes = total;
        currentProgress = progress;
        currentDownloadedMB = downloadedMB;
        currentSourceLabel = sourceLabel;

        // 发送事件
        JSObject event = new JSObject();
        event.put("stage", stage);
        if (statusText != null) event.put("status", statusText);
        event.put("downloaded", downloaded);
        event.put("total", total);
        event.put("progress", progress);
        if (downloadedMB != null) event.put("downloadedMB", downloadedMB);
        if (sourceLabel != null) event.put("source", sourceLabel);
        notifyListeners("voskDownloadProgress", event);
    }

    /**
     * 重置状态字段
     */
    private void resetStatus() {
        currentStatusStage = "";
        currentStatusText = "";
        currentDownloadedBytes = 0;
        currentTotalBytes = 0;
        currentProgress = 0;
        currentDownloadedMB = "";
        currentSourceLabel = "";
        currentErrorCode = "";
        currentErrorMessage = "";
        currentErrorSuggestion = "";
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        if (isDownloading) {
            call.reject("正在下载中，请稍候");
            return;
        }

        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("下载地址不能为空");
            return;
        }

        // 获取预设的文件大小（bytes），用于 Content-Length 未知时估算进度
        final long expectedSize;
        Integer expectedSizeObj = call.getInt("expectedSize");
        if (expectedSizeObj != null) {
            expectedSize = expectedSizeObj.longValue();
        } else {
            expectedSize = 0;
        }

        isDownloading = true;
        downloadCancelled = false;
        resetStatus();

        // 防止跨模型断点续传损坏：检查已有下载文件是否属于当前模型
        final String modelId = call.getString("modelId", "");
        try {
            File metaFile = new File(getContext().getFilesDir(), "vosk-model-download.meta");
            File existingZip = new File(getContext().getFilesDir(), "vosk-model-download.zip");
            if (existingZip.exists() && existingZip.length() > 0) {
                if (modelId != null && !modelId.isEmpty()) {
                    String savedId = null;
                    if (metaFile.exists()) {
                        java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.FileReader(metaFile));
                        savedId = reader.readLine();
                        reader.close();
                    }
                    if (savedId == null || !savedId.equals(modelId)) {
                        // 模型不匹配，删除旧文件重新下载
                        existingZip.delete();
                        if (metaFile.exists()) metaFile.delete();
                        android.util.Log.i("VoskASRPlugin", "Cleared stale download file (model mismatch: saved=" + savedId + " current=" + modelId + ")");
                    }
                }
            }
            // 保存当前模型 ID
            if (modelId != null && !modelId.isEmpty()) {
                java.io.FileWriter writer = new java.io.FileWriter(metaFile);
                writer.write(modelId);
                writer.close();
            }
        } catch (Exception e) {
            android.util.Log.w("VoskASRPlugin", "Model ID check failed: " + e.getMessage());
        }

        downloadThread = new Thread(() -> {
            File zipFile = null;
            try {
                // 立即发送初始进度事件（同时更新状态字段，供前端轮询）
                updateStatusAndNotify("downloading", "正在连接服务器...", 0L, expectedSize, -1, "", null);

                // 如果是蓝奏云分享链接，先解析出真实下载 URL
                String finalUrl = urlStr;
                if (isLanzouShareUrl(urlStr)) {
                    Log.i(TAG, "检测到蓝奏云链接，开始解析: " + urlStr);
                    JSObject parsingEvent = new JSObject();
                    parsingEvent.put("stage", "downloading");
                    parsingEvent.put("downloaded", 0L);
                    parsingEvent.put("progress", -1);
                    parsingEvent.put("downloadedMB", "");
                    parsingEvent.put("status", "正在解析蓝奏云链接...");
                    notifyListeners("voskDownloadProgress", parsingEvent);

                    try {
                        finalUrl = resolveLanzouDownloadUrlWithTimeout(urlStr, null);
                        Log.i(TAG, "蓝奏云解析成功，真实下载 URL: " + finalUrl);
                    } catch (DownloadException e) {
                        Log.e(TAG, "蓝奏云解析失败: " + e.getErrorCode(), e);
                        throw e;
                    } catch (Exception e) {
                        Log.e(TAG, "蓝奏云解析失败", e);
                        String errorCode = ERROR_LANZOU_PARSE_FAILED;
                        if (e.getMessage() != null && (e.getMessage().contains("timeout") || e.getMessage().contains("超时"))) {
                            errorCode = ERROR_LANZOU_PARSE_TIMEOUT;
                        }
                        throw new DownloadException(errorCode, "蓝奏云解析失败");
                    }
                }

                URL url = new URL(finalUrl);
                HttpURLConnection connection = null;
                int responseCode = -1;
                int connectRetryCount = 0;
                final int MAX_CONNECT_RETRIES = 3;
                final int CONNECT_TIMEOUT_MS = 10000; // 10 秒连接超时
                String lastConnectErrorCode = ERROR_UNKNOWN;

                // 连接重试逻辑（最多重试 3 次），采用指数退避策略
                while (connectRetryCount < MAX_CONNECT_RETRIES && responseCode != HttpURLConnection.HTTP_OK && !downloadCancelled) {
                    try {
                        if (connectRetryCount > 0) {
                            Log.i(TAG, "连接失败，正在重试 (" + connectRetryCount + "/" + MAX_CONNECT_RETRIES + ")");
                            // 指数退避：1s, 2s, 4s（最大 5s）
                            long backoffMs = Math.min(1000L * (1L << (connectRetryCount - 1)), 5000L);
                            Log.i(TAG, "等待 " + backoffMs + "ms 后重试...");
                            Thread.sleep(backoffMs);
                        }

                        // 启动倒计时线程
                        countdownRunning = true;
                        final int currentRetry = connectRetryCount;
                        countdownThread = new Thread(() -> {
                            try {
                                for (int i = 10; i >= 1 && countdownRunning; i--) {
                                    JSObject countdownEvent = new JSObject();
                                    countdownEvent.put("stage", "downloading");
                                    countdownEvent.put("status", "正在连接服务器...（" + i + "秒 / 第" + currentRetry + "次重试）");
                                    countdownEvent.put("countdown", i);
                                    countdownEvent.put("retryCount", currentRetry);
                                    countdownEvent.put("maxRetries", MAX_CONNECT_RETRIES);
                                    countdownEvent.put("progress", -1);
                                    countdownEvent.put("downloaded", 0L);
                                    countdownEvent.put("downloadedMB", "");
                                    notifyListeners("voskDownloadProgress", countdownEvent);
                                    Thread.sleep(1000);
                                }
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                        });
                        countdownThread.start();

                        connection = (HttpURLConnection) url.openConnection();
                        connection.setRequestMethod("GET");
                        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                        connection.setReadTimeout(30000);
                        connection.setInstanceFollowRedirects(true);
                        connection.setUseCaches(false);

                        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                        connection.setRequestProperty("Accept", "*/*");
                        connection.setRequestProperty("Accept-Encoding", "identity");
                        connection.setRequestProperty("Connection", "keep-alive");
                        connection.connect();

                        // 连接成功，停止倒计时
                        countdownRunning = false;
                        if (countdownThread != null) {
                            countdownThread.interrupt();
                            try {
                                countdownThread.join(500);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                            countdownThread = null;
                        }

                        responseCode = connection.getResponseCode();

                        // 处理重定向
                        if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                            responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                            responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                            responseCode == 307 || responseCode == 308) {
                            String redirectUrl = connection.getHeaderField("Location");
                            connection.disconnect();
                            connection = null;
                            if (redirectUrl != null) {
                                Log.i(TAG, "重定向到: " + redirectUrl);
                                JSObject redirectEvent = new JSObject();
                                redirectEvent.put("stage", "downloading");
                                redirectEvent.put("downloaded", 0L);
                                redirectEvent.put("progress", -1);
                                redirectEvent.put("downloadedMB", "");
                                redirectEvent.put("status", "正在重定向...");
                                notifyListeners("voskDownloadProgress", redirectEvent);
                                url = new URL(redirectUrl);
                                connectRetryCount++; // 重定向也算一次重试
                                continue;
                            }
                        }

                        if (responseCode == HttpURLConnection.HTTP_OK) {
                            break; // 连接成功，跳出重试循环
                        }

                        // 非 HTTP_OK 状态码，继续重试
                        Log.w(TAG, "HTTP 状态码异常: " + responseCode);
                        lastConnectErrorCode = ERROR_SERVER_ERROR;
                        if (connection != null) {
                            connection.disconnect();
                            connection = null;
                        }
                        connectRetryCount++;

                    } catch (java.net.SocketTimeoutException e) {
                        // 连接超时，停止倒计时
                        countdownRunning = false;
                        if (countdownThread != null) {
                            countdownThread.interrupt();
                            try {
                                countdownThread.join(500);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                            }
                            countdownThread = null;
                        }
                        Log.w(TAG, "连接超时 (" + connectRetryCount + "): " + e.getMessage());
                        lastConnectErrorCode = ERROR_CONNECTION_TIMEOUT;
                        if (connection != null) {
                            connection.disconnect();
                            connection = null;
                        }
                        connectRetryCount++;
                    } catch (java.net.UnknownHostException e) {
                        // DNS 解析失败，停止倒计时
                        countdownRunning = false;
                        if (countdownThread != null) {
                            countdownThread.interrupt();
                            try {
                                countdownThread.join(500);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                            }
                            countdownThread = null;
                        }
                        Log.w(TAG, "DNS 解析失败 (" + connectRetryCount + "): " + e.getMessage());
                        lastConnectErrorCode = ERROR_DNS_FAILED;
                        if (connection != null) {
                            connection.disconnect();
                            connection = null;
                        }
                        connectRetryCount++;
                    } catch (java.net.ConnectException e) {
                        // 连接被拒绝，停止倒计时
                        countdownRunning = false;
                        if (countdownThread != null) {
                            countdownThread.interrupt();
                            try {
                                countdownThread.join(500);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                            }
                            countdownThread = null;
                        }
                        Log.w(TAG, "连接被拒绝 (" + connectRetryCount + "): " + e.getMessage());
                        lastConnectErrorCode = ERROR_CONNECTION_REFUSED;
                        if (connection != null) {
                            connection.disconnect();
                            connection = null;
                        }
                        connectRetryCount++;
                    } catch (Exception e) {
                        // 连接异常，停止倒计时
                        countdownRunning = false;
                        if (countdownThread != null) {
                            countdownThread.interrupt();
                            try {
                                countdownThread.join(500);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                            }
                            countdownThread = null;
                        }
                        Log.w(TAG, "连接异常 (" + connectRetryCount + "): " + e.getMessage());
                        lastConnectErrorCode = ERROR_UNKNOWN;
                        if (connection != null) {
                            connection.disconnect();
                            connection = null;
                        }
                        connectRetryCount++;
                    }
                }

                // 确保倒计时线程已停止
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }

                // 如果重试全部失败
                if (responseCode != HttpURLConnection.HTTP_OK || connection == null) {
                    if (downloadCancelled) {
                        throw new Exception("下载已取消");
                    }
                    throw new DownloadException(lastConnectErrorCode, "连接失败");
                }

                long contentLength = connection.getContentLengthLong();
                // 如果服务器未返回 Content-Length，使用预设大小
                if (contentLength <= 0 && expectedSize > 0) {
                    contentLength = expectedSize;
                }
                final long fileLength = contentLength;

                Log.i(TAG, "开始下载模型, URL=" + finalUrl + ", Content-Length=" + fileLength + ", expectedSize=" + expectedSize);

                zipFile = new File(getContext().getFilesDir(), "vosk-model-download.zip");
                
                // 断点续传：检查已下载的临时文件
                long existingSize = 0;
                boolean resumeDownload = false;
                if (zipFile.exists() && fileLength > 0) {
                    existingSize = zipFile.length();
                    boolean shouldDelete = false;
                    String deleteReason = "";

                    if (existingSize > fileLength) {
                        shouldDelete = true;
                        deleteReason = "文件大小大于预期（" + existingSize + " > " + fileLength + "）";
                    } else if (existingSize > 0 && existingSize < 1024) {
                        shouldDelete = true;
                        deleteReason = "文件过小，可能已损坏（" + existingSize + " bytes < 1KB）";
                    }

                    if (shouldDelete && isFileInPrivateDir(zipFile)) {
                        Log.i(TAG, "检测到不完整文件，重新开始下载: " + deleteReason);

                        JSObject rebuildEvent = new JSObject();
                        rebuildEvent.put("stage", "downloading");
                        rebuildEvent.put("downloaded", 0L);
                        rebuildEvent.put("total", fileLength);
                        rebuildEvent.put("progress", 0);
                        rebuildEvent.put("downloadedMB", "0.0");
                        rebuildEvent.put("status", "检测到不完整文件，重新开始下载...");
                        notifyListeners("voskDownloadProgress", rebuildEvent);

                        zipFile.delete();
                        existingSize = 0;
                    } else if (existingSize > 0 && existingSize < fileLength) {
                        Log.i(TAG, "检测到已下载文件，继续下载: " + existingSize + " / " + fileLength);
                        resumeDownload = true;
                        
                        // 发送继续下载状态
                        JSObject resumeEvent = new JSObject();
                        resumeEvent.put("stage", "downloading");
                        resumeEvent.put("downloaded", existingSize);
                        resumeEvent.put("total", fileLength);
                        resumeEvent.put("progress", (int)(existingSize * 100 / fileLength));
                        resumeEvent.put("downloadedMB", String.format("%.1f", existingSize / (1024.0 * 1024.0)));
                        resumeEvent.put("status", "继续下载...");
                        notifyListeners("voskDownloadProgress", resumeEvent);
                    } else if (existingSize >= fileLength) {
                        // 已下载文件大小等于或超过预期，删除重新下载
                        Log.i(TAG, "已下载文件异常（" + existingSize + " >= " + fileLength + "），删除并重新下载");
                        if (isFileInPrivateDir(zipFile)) {
                            zipFile.delete();
                        }
                        existingSize = 0;
                    }
                }

                // 打开连接进行下载（支持断点续传）
                connection.disconnect();
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(300000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                connection.setRequestProperty("Accept", "*/*");
                connection.setRequestProperty("Accept-Encoding", "identity");
                
                // 断点续传：添加 Range 请求头
                if (resumeDownload && existingSize > 0) {
                    connection.setRequestProperty("Range", "bytes=" + existingSize + "-");
                    Log.i(TAG, "请求 Range: bytes=" + existingSize + "-");
                }

                int resumeResponseCode = connection.getResponseCode();
                Log.i(TAG, "下载响应码: " + resumeResponseCode + " (200=全新下载, 206=断点续传, 416=范围无效需重新下载)");

                // 206 Partial Content 表示服务器支持断点续传
                // 416 Range Not Satisfiable 表示请求的范围无效，需要重新下载
                if (resumeDownload && resumeResponseCode == 416) {
                    Log.w(TAG, "服务器不支持该下载范围，删除临时文件重新下载");

                    JSObject restartEvent = new JSObject();
                    restartEvent.put("stage", "downloading");
                    restartEvent.put("downloaded", 0L);
                    restartEvent.put("total", fileLength);
                    restartEvent.put("progress", 0);
                    restartEvent.put("downloadedMB", "0.0");
                    restartEvent.put("status", "检测到不完整文件，重新开始下载...");
                    notifyListeners("voskDownloadProgress", restartEvent);

                    if (isFileInPrivateDir(zipFile)) {
                        zipFile.delete();
                    }
                    existingSize = 0;
                    resumeDownload = false;
                    
                    // 重新打开连接不使用 Range
                    connection.disconnect();
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                    connection.setReadTimeout(300000);
                    connection.setInstanceFollowRedirects(true);
                    connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                    connection.setRequestProperty("Accept", "*/*");
                    connection.setRequestProperty("Accept-Encoding", "identity");
                    
                    int newResponseCode = connection.getResponseCode();
                    if (newResponseCode != HttpURLConnection.HTTP_OK) {
                        throw new DownloadException(ERROR_SERVER_ERROR, "服务器返回错误");
                    }
                } else if (!resumeDownload && resumeResponseCode != HttpURLConnection.HTTP_OK) {
                    throw new DownloadException(ERROR_SERVER_ERROR, "服务器返回错误");
                }

                // 使用 8MB 大 buffer 的 BufferedInputStream，大幅提升网络读取速度
                InputStream input = new BufferedInputStream(connection.getInputStream(), 8 * 1024 * 1024);
                
                // 断点续传时使用追加模式的 FileOutputStream
                FileOutputStream output = new FileOutputStream(zipFile, resumeDownload);

                // 保存流引用，用于取消时强制关闭以打断阻塞 IO
                synchronized (streamLock) {
                    currentInputStream = input;
                    currentOutputStream = output;
                }

                // 使用 4MB 大 buffer，最大限度减少 read 系统调用，提升下载速度
                byte[] buffer = new byte[128 * 1024]; // 128KB 缓冲区
                long total = existingSize; // 从已下载大小开始
                int count;
                long lastNotifyTime = 0;
                long startTime = System.currentTimeMillis();

                while (!downloadCancelled && (count = input.read(buffer)) != -1) {

                    total += count;
                    output.write(buffer, 0, count);

                    long now = System.currentTimeMillis();
                    if (now - lastNotifyTime > 500) {
                        lastNotifyTime = now;
                        int progress = 0;
                        if (fileLength > 0) {
                            progress = (int)(total * 100 / fileLength);
                        } else {
                            // 未知总大小，显示已下载的 MB 数
                            progress = -1;
                        }
                        JSObject jsProgress = new JSObject();
                        jsProgress.put("stage", "downloading");
                        jsProgress.put("downloaded", total);
                        jsProgress.put("total", fileLength);
                        jsProgress.put("progress", progress);
                        jsProgress.put("downloadedMB", String.format("%.1f", total / (1024.0 * 1024.0)));
                        notifyListeners("voskDownloadProgress", jsProgress);
                    }
                }

                try { output.flush(); } catch (Exception ignore) {}
                try { output.close(); } catch (Exception ignore) {}
                try { input.close(); } catch (Exception ignore) {}
                try { connection.disconnect(); } catch (Exception ignore) {}
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }

                // 如果是被取消的，清理临时文件并通知前端
                if (downloadCancelled) {
                    if (zipFile.exists() && isFileInPrivateDir(zipFile)) zipFile.delete();
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    return;
                }

                Log.i(TAG, "模型下载完成, total=" + total + " bytes, time=" + (System.currentTimeMillis() - startTime) + "ms");

                // 验证下载文件大小
                long downloadedSize = zipFile.length();
                if (fileLength > 0 && downloadedSize < fileLength * 0.9) {
                    Log.w(TAG, "文件下载不完整: 下载了 " + downloadedSize + " bytes, 预期 " + fileLength + " bytes");
                    if (zipFile.exists() && isFileInPrivateDir(zipFile)) {
                        zipFile.delete();
                    }
                    throw new DownloadException(ERROR_DOWNLOAD_INCOMPLETE, "文件下载不完整");
                }

                // 解压并安装模型（使用统一的安装方法）
                extractAndInstallModel(zipFile);

            } catch (Exception e) {
                Log.e(TAG, "下载模型失败", e);
                // 清理流引用
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                // 如果是取消导致的异常，发送 cancelled 事件而非 error
                if (downloadCancelled) {
                    if (zipFile != null && zipFile.exists() && isFileInPrivateDir(zipFile)) {
                        zipFile.delete();
                    }
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                } else {
                    String errorCode = inferErrorCode(e);
                    JSObject error = buildErrorEvent(errorCode);
                    notifyListeners("voskDownloadProgress", error);
                    if (zipFile != null && zipFile.exists() && isFileInPrivateDir(zipFile)) {
                        zipFile.delete();
                    }
                }
            } finally {
                // 确保倒计时线程已停止
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                isDownloading = false;
                downloadThread = null;
            }
        });
        downloadThread.start();

        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadModelWithFallback(PluginCall call) {
        if (isDownloading) {
            call.reject("正在下载中，请稍候");
            return;
        }

        // 网络预检查：避免无网络时等待 38 秒超时
        if (!isNetworkAvailable()) {
            call.reject("无网络连接，请检查网络设置");
            return;
        }

        String urlsStr = call.getString("urls");
        String labelsStr = call.getString("labels");
        if (urlsStr == null || urlsStr.isEmpty()) {
            call.reject("下载地址不能为空");
            return;
        }

        JSONArray urlsArray;
        JSONArray labelsArray;
        try {
            urlsArray = new JSONArray(urlsStr);
            if (labelsStr != null && !labelsStr.isEmpty()) {
                labelsArray = new JSONArray(labelsStr);
            } else {
                labelsArray = new JSONArray();
                for (int i = 0; i < urlsArray.length(); i++) {
                    labelsArray.put("下载源" + (i + 1));
                }
            }
        } catch (Exception e) {
            call.reject("参数格式错误: " + e.getMessage());
            return;
        }

        if (urlsArray.length() == 0) {
            call.reject("下载地址列表不能为空");
            return;
        }

        if (labelsArray.length() != urlsArray.length()) {
            call.reject("URL 数量与标签数量不匹配");
            return;
        }

        final long expectedSize;
        Integer expectedSizeObj = call.getInt("expectedSize");
        if (expectedSizeObj != null) {
            expectedSize = expectedSizeObj.longValue();
        } else {
            expectedSize = 0;
        }

        isDownloading = true;
        downloadCancelled = false;
        resetStatus();

        // 防止跨模型断点续传损坏：检查已有下载文件是否属于当前模型
        final String modelId = call.getString("modelId", "");
        try {
            File metaFile = new File(getContext().getFilesDir(), "vosk-model-download.meta");
            File existingZip = new File(getContext().getFilesDir(), "vosk-model-download.zip");
            if (existingZip.exists() && existingZip.length() > 0) {
                if (modelId != null && !modelId.isEmpty()) {
                    String savedId = null;
                    if (metaFile.exists()) {
                        java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.FileReader(metaFile));
                        savedId = reader.readLine();
                        reader.close();
                    }
                    if (savedId == null || !savedId.equals(modelId)) {
                        existingZip.delete();
                        if (metaFile.exists()) metaFile.delete();
                        android.util.Log.i("VoskASRPlugin", "Cleared stale download (model mismatch)");
                    }
                }
            }
            if (modelId != null && !modelId.isEmpty()) {
                java.io.FileWriter writer = new java.io.FileWriter(metaFile);
                writer.write(modelId);
                writer.close();
            }
        } catch (Exception e) {
            android.util.Log.w("VoskASRPlugin", "Model ID check failed: " + e.getMessage());
        }

        final JSONArray finalUrlsArray = urlsArray;
        final JSONArray finalLabelsArray = labelsArray;

        downloadThread = new Thread(() -> {
            File zipFile = null;
            Exception lastException = null;
            try {
                zipFile = new File(getContext().getFilesDir(), "vosk-model-download.zip");

                for (int sourceIndex = 0; sourceIndex < finalUrlsArray.length(); sourceIndex++) {
                    if (downloadCancelled) {
                        throw new Exception("下载已取消");
                    }

                    String url = finalUrlsArray.getString(sourceIndex);
                    String label = finalLabelsArray.getString(sourceIndex);

                    if (sourceIndex > 0) {
                        String fromLabel = finalLabelsArray.getString(sourceIndex - 1);

                        JSObject switchEvent = new JSObject();
                        switchEvent.put("stage", "downloading");
                        switchEvent.put("status", "正在切换到 " + label + " 下载源...");
                        switchEvent.put("sourceChanged", true);
                        switchEvent.put("fromSource", fromLabel);
                        switchEvent.put("toSource", label);
                        switchEvent.put("progress", -1);
                        switchEvent.put("downloaded", 0L);
                        switchEvent.put("downloadedMB", "");
                        switchEvent.put("sourceIndex", sourceIndex);
                        switchEvent.put("totalSources", finalUrlsArray.length());
                        notifyListeners("voskDownloadProgress", switchEvent);

                        if (zipFile.exists() && isFileInPrivateDir(zipFile)) {
                            zipFile.delete();
                        }
                    }

                    try {
                        boolean success = downloadZipFromSingleSource(url, expectedSize, label, zipFile);
                        if (success) {
                            extractAndInstallModel(zipFile);
                            return;
                        }
                    } catch (Exception e) {
                        if (downloadCancelled) {
                            throw e;
                        }
                        Log.w(TAG, "下载源 " + label + " 异常: " + e.getMessage());
                        lastException = e;
                    }
                }

                if (downloadCancelled) {
                    throw new Exception("下载已取消");
                }

                String errorCode = ERROR_UNKNOWN;
                if (lastException != null) {
                    errorCode = inferErrorCode(lastException);
                }
                throw new DownloadException(errorCode, "所有下载源都失败了");

            } catch (Exception e) {
                Log.e(TAG, "下载模型失败", e);
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                if (downloadCancelled) {
                    if (zipFile != null && zipFile.exists() && isFileInPrivateDir(zipFile)) {
                        zipFile.delete();
                    }
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                } else {
                    String errorCode = inferErrorCode(e);
                    JSObject error = buildErrorEvent(errorCode);
                    notifyListeners("voskDownloadProgress", error);
                    if (zipFile != null && zipFile.exists() && isFileInPrivateDir(zipFile)) {
                        zipFile.delete();
                    }
                }
            } finally {
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                isDownloading = false;
                downloadThread = null;
            }
        });
        downloadThread.start();

        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    /**
     * 下载异常，携带错误码信息
     */
    private static class DownloadException extends Exception {
        private final String errorCode;

        public DownloadException(String errorCode, String message) {
            super(message);
            this.errorCode = errorCode;
        }

        public String getErrorCode() {
            return errorCode;
        }
    }

    /**
     * 根据错误码获取友好的错误消息
     */
    private String getErrorMessage(String errorCode) {
        switch (errorCode) {
            case ERROR_NETWORK_DISCONNECTED:
                return "无网络连接，请检查网络设置";
            case ERROR_DNS_FAILED:
                return "无法解析服务器地址，可能是 DNS 问题";
            case ERROR_CONNECTION_TIMEOUT:
                return "连接服务器超时，请检查网络";
            case ERROR_CONNECTION_REFUSED:
                return "连接被服务器拒绝";
            case ERROR_SERVER_ERROR:
                return "服务器返回错误，无法下载";
            case ERROR_LANZOU_PARSE_FAILED:
                return "蓝奏云链接解析失败";
            case ERROR_LANZOU_PARSE_TIMEOUT:
                return "蓝奏云链接解析超时";
            case ERROR_DOWNLOAD_INCOMPLETE:
                return "文件下载不完整";
            case ERROR_UNZIP_FAILED:
                return "解压模型文件失败";
            case ERROR_FILE_IMPORT_TIMEOUT:
                return "读取文件超时，请重试或使用其他方式导入";
            case ERROR_FILE_OPEN_FAILED:
                return "无法打开文件，请检查文件权限";
            default:
                return "下载失败，发生未知错误";
        }
    }

    /**
     * 根据错误码获取解决建议
     */
    private String getErrorSuggestion(String errorCode) {
        switch (errorCode) {
            case ERROR_NETWORK_DISCONNECTED:
                return "请检查 Wi-Fi 或移动数据是否开启，或切换到其他网络后重试";
            case ERROR_DNS_FAILED:
                return "请尝试切换网络（如 Wi-Fi 切到移动数据），或使用蓝奏云下载源";
            case ERROR_CONNECTION_TIMEOUT:
                return "请检查网络连接是否正常，或稍后重试，也可尝试切换下载源";
            case ERROR_CONNECTION_REFUSED:
                return "服务器可能暂时不可用，请稍后重试，或切换到其他下载源";
            case ERROR_SERVER_ERROR:
                return "服务器可能暂时故障，请稍后重试，或切换到其他下载源（推荐蓝奏云）";
            case ERROR_LANZOU_PARSE_FAILED:
                return "蓝奏云链接可能已失效，请尝试使用其他下载源";
            case ERROR_LANZOU_PARSE_TIMEOUT:
                return "蓝奏云解析超时，请稍后重试或切换到其他下载源";
            case ERROR_DOWNLOAD_INCOMPLETE:
                return "网络可能不稳定，请检查网络后重新下载，或切换到其他下载源";
            case ERROR_UNZIP_FAILED:
                return "下载的文件可能已损坏，请重新下载，或尝试其他下载源";
            case ERROR_FILE_IMPORT_TIMEOUT:
                return "文件读取超时，建议从手机内部存储选择文件，或尝试重新下载模型后导入";
            case ERROR_FILE_OPEN_FAILED:
                return "请确保已授予应用访问文件的权限，或从应用内部存储选择文件";
            default:
                return "请稍后重试，或切换下载源，也可以尝试从浏览器下载后导入模型";
        }
    }

    /**
     * 构建错误事件对象
     */
    private JSObject buildErrorEvent(String errorCode) {
        String errorMessage = getErrorMessage(errorCode);
        String suggestion = getErrorSuggestion(errorCode);
        // 更新状态字段（供前端轮询）
        currentStatusStage = "error";
        currentStatusText = errorMessage;
        currentErrorCode = errorCode;
        currentErrorMessage = errorMessage;
        currentErrorSuggestion = suggestion;
        JSObject error = new JSObject();
        error.put("stage", "error");
        error.put("errorCode", errorCode);
        error.put("errorMessage", errorMessage);
        error.put("suggestion", suggestion);
        error.put("error", errorMessage);
        return error;
    }

    /**
     * 从异常中推断错误码
     */
    private String inferErrorCode(Exception e) {
        if (e instanceof DownloadException) {
            return ((DownloadException) e).getErrorCode();
        }
        String msg = e.getMessage();
        if (msg == null) {
            return ERROR_UNKNOWN;
        }
        // 文件导入超时
        if (msg.contains("FILE_IMPORT_TIMEOUT")) {
            return ERROR_FILE_IMPORT_TIMEOUT;
        }
        if (msg.contains("DNS") || msg.contains("UnknownHost") || msg.contains("解析")) {
            return ERROR_DNS_FAILED;
        }
        if (msg.contains("timeout") || msg.contains("超时") || msg.contains("SocketTimeout")) {
            return ERROR_CONNECTION_TIMEOUT;
        }
        if (msg.contains("Connection refused") || msg.contains("连接被拒绝")) {
            return ERROR_CONNECTION_REFUSED;
        }
        if (msg.contains("HTTP") || msg.contains("服务器") || msg.contains("status code")) {
            return ERROR_SERVER_ERROR;
        }
        if (msg.contains("蓝奏云") && msg.contains("解析")) {
            if (msg.contains("超时")) {
                return ERROR_LANZOU_PARSE_TIMEOUT;
            }
            return ERROR_LANZOU_PARSE_FAILED;
        }
        if (msg.contains("不完整") || msg.contains("incomplete")) {
            return ERROR_DOWNLOAD_INCOMPLETE;
        }
        if (msg.contains("解压") || msg.contains("zip") || msg.contains("Zip")) {
            return ERROR_UNZIP_FAILED;
        }
        if (msg.contains("无法打开文件") || msg.contains("open failed") || msg.contains("Permission denied")) {
            return ERROR_FILE_OPEN_FAILED;
        }
        return ERROR_UNKNOWN;
    }

    /**
     * 检查文件是否在应用私有目录内，确保删除操作的安全性
     * @param file 要检查的文件
     * @return true 表示文件在应用私有目录内，可以安全删除
     */
    private boolean isFileInPrivateDir(File file) {
        if (file == null || !file.exists()) {
            return false;
        }
        try {
            String privateDirPath = getContext().getFilesDir().getCanonicalPath();
            String filePath = file.getCanonicalPath();
            return filePath.startsWith(privateDirPath);
        } catch (Exception e) {
            Log.w(TAG, "检查文件路径失败: " + e.getMessage());
            return false;
        }
    }

    /**
     * 多连接分片下载
     * @param finalUrl 下载 URL
     * @param zipFile 目标文件
     * @param fileLength 文件总大小
     * @param sourceLabel 下载源标签
     * @return true 如果下载成功
     */
    private boolean downloadWithMultipleConnections(String finalUrl, File zipFile, long fileLength, String sourceLabel) throws Exception {
        if (fileLength <= 0) {
            Log.i(TAG, "文件大小未知，跳过多连接下载");
            return false;
        }

        Log.i(TAG, "尝试多连接分片下载, URL=" + finalUrl + ", fileLength=" + fileLength + ", source=" + sourceLabel);

        // 跳过 <1MB 小文件（单连接更快）
        if (fileLength < 1024 * 1024) {
            Log.i(TAG, "文件过小（<1MB），使用单连接下载");
            return false;
        }

        // 使用 Range: bytes=0-0 快速探测 Range 支持（比 HEAD 请求更可靠且速度一致）
        Request.Builder probeBuilder = new Request.Builder()
                .url(finalUrl)
                .header("Range", "bytes=0-0")
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                .header("Accept", "*/*");
        if (finalUrl.contains("lanzou") || finalUrl.contains("lanrar") || finalUrl.contains("developer")) {
            probeBuilder.header("Referer", "https://wwaxr.lanzouw.com/");
        }
        Response probeResp = getOkHttpClient().newCall(probeBuilder.build()).execute();
        int probeCode = probeResp.code();
        probeResp.close();

        if (probeCode != 206) {
            Log.i(TAG, "服务器不支持 Range 请求 (响应码: " + probeCode + ")，回退到单连接下载");
            return false;
        }

        Log.i(TAG, "服务器支持 Range 请求，开始 " + NUM_SEGMENTS + " 连接分片下载");

        updateStatusAndNotify("downloading", "多连接下载中...", 0L, fileLength, 0, "0.0", sourceLabel);

        // 准备目标文件：删除已有文件并预分配大小
        if (zipFile.exists() && isFileInPrivateDir(zipFile)) {
            zipFile.delete();
        }
        RandomAccessFile preRaf = new RandomAccessFile(zipFile, "rw");
        preRaf.setLength(fileLength);
        preRaf.close();

        final long totalFileLength = fileLength;
        final long segmentSize = totalFileLength / NUM_SEGMENTS;
        final AtomicLong totalDownloaded = new AtomicLong(0);
        final AtomicBoolean hasError = new AtomicBoolean(false);
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        final CountDownLatch latch = new CountDownLatch(NUM_SEGMENTS);
        final Exception[] segmentError = new Exception[1];

        ExecutorService executor = Executors.newFixedThreadPool(NUM_SEGMENTS, r -> {
            Thread t = new Thread(r, "VoskDownloadSegment");
            t.setDaemon(true);
            return t;
        });

        // 进度聚合线程：每 500ms 发送一次聚合进度事件
        final AtomicBoolean progressRunning = new AtomicBoolean(true);
        Thread progressThread = new Thread(() -> {
            long lastSpeedTime = System.currentTimeMillis();
            long lastSpeedDownloaded = 0;
            while (progressRunning.get() && !Thread.currentThread().isInterrupted()) {
                try {
                    Thread.sleep(500);
                    if (!progressRunning.get()) break;

                    long now = System.currentTimeMillis();
                    long current = totalDownloaded.get();

                    // 速度计算：与 1 秒前的下载数据对比
                    double speedMBs = 0;
                    long elapsed = now - lastSpeedTime;
                    if (elapsed >= 1000) {
                        long diff = current - lastSpeedDownloaded;
                        speedMBs = diff / (1024.0 * 1024.0) / (elapsed / 1000.0);
                        lastSpeedTime = now;
                        lastSpeedDownloaded = current;
                    }

                    int progress = (int) (current * 100 / totalFileLength);
                    String downloadedMBStr = String.format("%.1f", current / (1024.0 * 1024.0));
                    String speedStr = String.format("%.2f", speedMBs);
                    String statusText = "多连接下载中 " + speedStr + " MB/s";
                    updateStatusAndNotify("downloading", statusText, current, totalFileLength, progress, downloadedMBStr, sourceLabel);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }, "VoskDownloadProgress");
        progressThread.start();

        // 提交分片下载任务
        for (int i = 0; i < NUM_SEGMENTS; i++) {
            final int segmentIndex = i;
            final long start = segmentSize * i;
            final long end = (i == NUM_SEGMENTS - 1) ? totalFileLength - 1 : start + segmentSize - 1;

            executor.submit(() -> {
                int retryCount = 0;
                try {
                    while (retryCount < 3 && !downloadCancelled && !cancelled.get()) {
                        Response response = null;
                        try {
                            Request.Builder reqBuilder = new Request.Builder()
                                    .url(finalUrl)
                                    .header("Range", "bytes=" + start + "-" + end)
                                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                                    .header("Accept", "*/*")
                                    .header("Accept-Encoding", "identity")
                                    .header("Connection", "keep-alive");
                            // 蓝奏云 CDN 需要 Referer 头才给满速
                            if (finalUrl.contains("lanzou") || finalUrl.contains("lanrar") || finalUrl.contains("developer")) {
                                reqBuilder.header("Referer", "https://wwaxr.lanzouw.com/");
                            }
                            Request req = reqBuilder.build();
                            response = getOkHttpClient().newCall(req).execute();

                            if (response.code() != 206 && response.code() != 200) {
                                throw new IOException("分片 " + segmentIndex + " 响应码: " + response.code());
                            }

                            ResponseBody body = response.body();
                            if (body == null) {
                                throw new IOException("分片 " + segmentIndex + " 响应体为空");
                            }

                            InputStream is = new BufferedInputStream(body.byteStream(), 256 * 1024);
                            RandomAccessFile raf = new RandomAccessFile(zipFile, "rw");
                            try {
                                raf.seek(start);

                                byte[] buffer = new byte[256 * 1024]; // 256KB 缓冲区
                                int count;
                                long segmentDownloaded = 0;
                                while (!downloadCancelled && !cancelled.get() && (count = is.read(buffer)) != -1) {
                                    raf.write(buffer, 0, count);
                                    segmentDownloaded += count;
                                    totalDownloaded.addAndGet(count);
                                }

                                // 验证分片下载完整性
                                long expected = end - start + 1;
                                if (segmentDownloaded < expected * 0.99) {
                                    throw new IOException("分片 " + segmentIndex + " 下载不完整: " + segmentDownloaded + "/" + expected);
                                }

                                Log.i(TAG, "分片 " + segmentIndex + " 下载完成: " + segmentDownloaded + " bytes");
                            } finally {
                                try { is.close(); } catch (Exception ignore) {}
                                try { raf.close(); } catch (Exception ignore) {}
                            }

                            return; // 成功
                        } catch (Exception e) {
                            retryCount++;
                            if (retryCount >= 3) {
                                throw new RuntimeException("分片 " + segmentIndex + " 下载失败: " + e.getMessage(), e);
                            }
                            Log.w(TAG, "分片 " + segmentIndex + " 下载异常 (重试 " + retryCount + "/3): " + e.getMessage());
                            // 指数退避：1s, 2s, 4s
                            Thread.sleep(1000L * (1 << (retryCount - 1)));
                        } finally {
                            try { if (response != null) response.close(); } catch (Exception ignore) {}
                        }
                    }
                } catch (Exception e) {
                    if (downloadCancelled || cancelled.get()) {
                        // 取消，不算错误
                    } else {
                        hasError.set(true);
                        cancelled.set(true);
                        synchronized (segmentError) {
                            if (segmentError[0] == null) {
                                segmentError[0] = new IOException("分片 " + segmentIndex + " 下载失败: " + e.getMessage(), e);
                            }
                        }
                        Log.e(TAG, "分片 " + segmentIndex + " 最终失败: " + e.getMessage(), e);
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        // 等待所有分片完成
        try {
            latch.await();
        } finally {
            // 停止进度线程
            progressRunning.set(false);
            progressThread.interrupt();
            try {
                progressThread.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            // 关闭线程池
            executor.shutdown();
            try {
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                    executor.shutdownNow();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                executor.shutdownNow();
            }
        }

        // 检查取消
        if (downloadCancelled) {
            throw new Exception("下载已取消");
        }

        // 检查错误
        if (hasError.get()) {
            if (segmentError[0] != null) {
                throw segmentError[0];
            }
            throw new IOException("多连接下载失败");
        }

        // 验证总大小
        long downloadedSize = zipFile.length();
        if (downloadedSize < fileLength * 0.99) {
            Log.w(TAG, "多连接下载不完整: " + downloadedSize + "/" + fileLength);
            throw new IOException("多连接下载不完整");
        }

        Log.i(TAG, "多连接下载完成, 总大小: " + downloadedSize + " bytes");

        // 发送最终进度
        String downloadedMBStr = String.format("%.1f", downloadedSize / (1024.0 * 1024.0));
        updateStatusAndNotify("downloading", null, downloadedSize, fileLength, 100, downloadedMBStr, sourceLabel);

        return true;
    }

    /**
     * 从单个下载源下载模型 ZIP 文件（包含重试逻辑）
     * @param urlStr 下载 URL
     * @param expectedSize 预期文件大小
     * @param sourceLabel 源标签名称（用于进度显示）
     * @param zipFile 目标 ZIP 文件
     * @return true 表示下载成功，false 表示该源失败（可切换到下一个源）
     * @throws Exception 如果是取消等不可恢复的错误
     */
    private boolean downloadZipFromSingleSource(String urlStr, long expectedSize, String sourceLabel, File zipFile) throws Exception {
        // 立即发送初始进度事件（同时更新状态字段）
        updateStatusAndNotify("downloading", "正在连接服务器...", 0L, expectedSize, -1, "", sourceLabel);

        // 如果是蓝奏云分享链接，先解析出真实下载 URL
        String finalUrl = urlStr;
        if (isLanzouShareUrl(urlStr)) {
            Log.i(TAG, "检测到蓝奏云链接，开始解析: " + urlStr);
            updateStatusAndNotify("downloading", "正在解析蓝奏云链接...", 0L, expectedSize, -1, "", sourceLabel);

            try {
                finalUrl = resolveLanzouDownloadUrlWithTimeout(urlStr, sourceLabel);
                Log.i(TAG, "蓝奏云解析成功，真实下载 URL: " + finalUrl);
            } catch (DownloadException e) {
                Log.e(TAG, "蓝奏云解析失败: " + e.getErrorCode(), e);
                throw e;
            } catch (Exception e) {
                Log.e(TAG, "蓝奏云解析失败", e);
                String errorCode = ERROR_LANZOU_PARSE_FAILED;
                if (e.getMessage() != null && (e.getMessage().contains("timeout") || e.getMessage().contains("超时"))) {
                    errorCode = ERROR_LANZOU_PARSE_TIMEOUT;
                }
                throw new DownloadException(errorCode, "蓝奏云解析失败");
            }
        }

        URL url = new URL(finalUrl);
        HttpURLConnection connection = null;
        int responseCode = -1;
        int connectRetryCount = 0;
        final int MAX_CONNECT_RETRIES = 3;
        final int CONNECT_TIMEOUT_MS = 10000;
        String lastConnectErrorCode = ERROR_UNKNOWN;

        // 连接重试逻辑（最多重试 3 次），采用指数退避策略
        while (connectRetryCount < MAX_CONNECT_RETRIES && responseCode != HttpURLConnection.HTTP_OK && !downloadCancelled) {
            try {
                if (connectRetryCount > 0) {
                    Log.i(TAG, "连接失败，正在重试 (" + connectRetryCount + "/" + MAX_CONNECT_RETRIES + ")");
                    long backoffMs = Math.min(1000L * (1L << (connectRetryCount - 1)), 5000L);
                    Log.i(TAG, "等待 " + backoffMs + "ms 后重试...");
                    Thread.sleep(backoffMs);
                }

                // 启动倒计时线程
                countdownRunning = true;
                final int currentRetry = connectRetryCount;
                final String countdownSourceLabel = sourceLabel;
                countdownThread = new Thread(() -> {
                    try {
                        for (int i = 10; i >= 1 && countdownRunning; i--) {
                            String countdownStatus = "正在连接服务器...（" + i + "秒 / 第" + currentRetry + "次重试）";
                            updateStatusAndNotify("downloading", countdownStatus, 0L, 0, -1, "", countdownSourceLabel);
                            Thread.sleep(1000);
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
                countdownThread.start();

                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(300000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                connection.setRequestProperty("Accept", "*/*");
                connection.setRequestProperty("Accept-Encoding", "identity");
                connection.connect();

                // 连接成功，停止倒计时
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }

                responseCode = connection.getResponseCode();

                // 连接成功，发送成功事件（同时更新状态字段）
                updateStatusAndNotify("downloading", "连接成功，开始下载...", 0L, 0, 0, "0.0", sourceLabel);

                // 处理重定向
                if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                    responseCode == 307 || responseCode == 308) {
                    String redirectUrl = connection.getHeaderField("Location");
                    connection.disconnect();
                    connection = null;
                    if (redirectUrl != null) {
                        Log.i(TAG, "重定向到: " + redirectUrl);
                        JSObject redirectEvent = new JSObject();
                        redirectEvent.put("stage", "downloading");
                        redirectEvent.put("downloaded", 0L);
                        redirectEvent.put("progress", -1);
                        redirectEvent.put("downloadedMB", "");
                        redirectEvent.put("status", "正在重定向...");
                        redirectEvent.put("source", sourceLabel);
                        notifyListeners("voskDownloadProgress", redirectEvent);
                        url = new URL(redirectUrl);
                        connectRetryCount++;
                        continue;
                    }
                }

                if (responseCode == HttpURLConnection.HTTP_OK) {
                    break;
                }

                // 非 HTTP_OK 状态码，继续重试
                Log.w(TAG, "HTTP 状态码异常: " + responseCode);
                lastConnectErrorCode = ERROR_SERVER_ERROR;
                if (connection != null) {
                    connection.disconnect();
                    connection = null;
                }
                connectRetryCount++;

            } catch (java.net.SocketTimeoutException e) {
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }
                Log.w(TAG, "连接超时 (" + connectRetryCount + "): " + e.getMessage());
                lastConnectErrorCode = ERROR_CONNECTION_TIMEOUT;
                if (connection != null) {
                    connection.disconnect();
                    connection = null;
                }
                connectRetryCount++;
            } catch (java.net.UnknownHostException e) {
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }
                Log.w(TAG, "DNS 解析失败 (" + connectRetryCount + "): " + e.getMessage());
                lastConnectErrorCode = ERROR_DNS_FAILED;
                if (connection != null) {
                    connection.disconnect();
                    connection = null;
                }
                connectRetryCount++;
            } catch (java.net.ConnectException e) {
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }
                Log.w(TAG, "连接被拒绝 (" + connectRetryCount + "): " + e.getMessage());
                lastConnectErrorCode = ERROR_CONNECTION_REFUSED;
                if (connection != null) {
                    connection.disconnect();
                    connection = null;
                }
                connectRetryCount++;
            } catch (Exception e) {
                countdownRunning = false;
                if (countdownThread != null) {
                    countdownThread.interrupt();
                    try {
                        countdownThread.join(500);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    countdownThread = null;
                }
                Log.w(TAG, "连接异常 (" + connectRetryCount + "): " + e.getMessage());
                lastConnectErrorCode = ERROR_UNKNOWN;
                if (connection != null) {
                    connection.disconnect();
                    connection = null;
                }
                connectRetryCount++;
            }
        }

        // 确保倒计时线程已停止
        countdownRunning = false;
        if (countdownThread != null) {
            countdownThread.interrupt();
            try {
                countdownThread.join(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            countdownThread = null;
        }

        // 如果重试全部失败
        if (responseCode != HttpURLConnection.HTTP_OK || connection == null) {
            if (downloadCancelled) {
                throw new Exception("下载已取消");
            }
            throw new DownloadException(lastConnectErrorCode, "连接失败");
        }

        long contentLength = connection.getContentLengthLong();
        if (contentLength <= 0 && expectedSize > 0) {
            contentLength = expectedSize;
        }
        final long fileLength = contentLength;

        Log.i(TAG, "开始下载模型, URL=" + finalUrl + ", Content-Length=" + fileLength + ", expectedSize=" + expectedSize + ", source=" + sourceLabel);

        // 断点续传：检查已下载的临时文件
        long existingSize = 0;
        boolean resumeDownload = false;
        if (zipFile.exists() && fileLength > 0) {
            existingSize = zipFile.length();
            boolean shouldDelete = false;
            String deleteReason = "";

            if (existingSize > fileLength) {
                shouldDelete = true;
                deleteReason = "文件大小大于预期（" + existingSize + " > " + fileLength + "）";
            } else if (existingSize > 0 && existingSize < 1024) {
                shouldDelete = true;
                deleteReason = "文件过小，可能已损坏（" + existingSize + " bytes < 1KB）";
            }

            if (shouldDelete && isFileInPrivateDir(zipFile)) {
                Log.i(TAG, "检测到不完整文件，重新开始下载: " + deleteReason);

                JSObject rebuildEvent = new JSObject();
                rebuildEvent.put("stage", "downloading");
                rebuildEvent.put("downloaded", 0L);
                rebuildEvent.put("total", fileLength);
                rebuildEvent.put("progress", 0);
                rebuildEvent.put("downloadedMB", "0.0");
                rebuildEvent.put("status", "检测到不完整文件，重新开始下载...");
                rebuildEvent.put("source", sourceLabel);
                notifyListeners("voskDownloadProgress", rebuildEvent);

                zipFile.delete();
                existingSize = 0;
            } else if (existingSize > 0 && existingSize < fileLength) {
                Log.i(TAG, "检测到已下载文件，继续下载: " + existingSize + " / " + fileLength);
                resumeDownload = true;

                JSObject resumeEvent = new JSObject();
                resumeEvent.put("stage", "downloading");
                resumeEvent.put("downloaded", existingSize);
                resumeEvent.put("total", fileLength);
                resumeEvent.put("progress", (int)(existingSize * 100 / fileLength));
                resumeEvent.put("downloadedMB", String.format("%.1f", existingSize / (1024.0 * 1024.0)));
                resumeEvent.put("status", "继续下载...");
                resumeEvent.put("source", sourceLabel);
                notifyListeners("voskDownloadProgress", resumeEvent);
            } else if (existingSize >= fileLength) {
                Log.i(TAG, "已下载文件异常（" + existingSize + " >= " + fileLength + "），删除并重新下载");
                if (isFileInPrivateDir(zipFile)) {
                    zipFile.delete();
                }
                existingSize = 0;
            }
        }

        // 尝试多连接分片下载（仅在不需要断点续传且文件大小已知时使用）
        if (!resumeDownload && fileLength > 0) {
            try {
                if (downloadWithMultipleConnections(finalUrl, zipFile, fileLength, sourceLabel)) {
                    return true;
                }
                // 返回 false 表示服务器不支持 Range，继续走单连接下载
            } catch (Exception e) {
                if (downloadCancelled) {
                    throw e;
                }
                Log.w(TAG, "多连接下载失败，回退到单连接下载: " + e.getMessage());
                // 清理多连接下载产生的临时文件
                if (zipFile.exists() && isFileInPrivateDir(zipFile)) {
                    zipFile.delete();
                }
                existingSize = 0;
                resumeDownload = false;
            }
        }

        // 使用 OkHttp 进行下载（支持 HTTP/2、连接池、keep-alive，速度更快）
        Request.Builder reqBuilder = new Request.Builder()
                .url(finalUrl)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                .header("Accept", "*/*")
                .header("Accept-Encoding", "identity")
                .header("Connection", "keep-alive");
        // 蓝奏云 CDN 需要 Referer 头才给满速
        if (finalUrl.contains("lanzou") || finalUrl.contains("lanrar") || finalUrl.contains("developer")) {
            reqBuilder.header("Referer", "https://wwaxr.lanzouw.com/");
        }

        if (resumeDownload && existingSize > 0) {
            reqBuilder.header("Range", "bytes=" + existingSize + "-");
            Log.i(TAG, "请求 Range: bytes=" + existingSize + "-");
        }

        Response response = getOkHttpClient().newCall(reqBuilder.build()).execute();
        int resumeResponseCode = response.code();
        Log.i(TAG, "下载响应码: " + resumeResponseCode + " (200=全新下载, 206=断点续传, 416=范围无效需重新下载)");

        if (resumeDownload && resumeResponseCode == 416) {
            Log.w(TAG, "服务器不支持该下载范围，删除临时文件重新下载");
            response.close();

            updateStatusAndNotify("downloading", "检测到不完整文件，重新开始下载...", 0L, fileLength, 0, "0.0", sourceLabel);

            if (isFileInPrivateDir(zipFile)) {
                zipFile.delete();
            }
            existingSize = 0;
            resumeDownload = false;

            Request newReq = new Request.Builder()
                    .url(finalUrl)
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                    .header("Accept", "*/*")
                    .build();
            response = getOkHttpClient().newCall(newReq).execute();
            if (response.code() != 200) {
                response.close();
                throw new DownloadException(ERROR_SERVER_ERROR, "服务器返回错误");
            }
        } else if (!resumeDownload && resumeResponseCode != 200) {
            response.close();
            throw new DownloadException(ERROR_SERVER_ERROR, "服务器返回错误");
        }

        ResponseBody body = response.body();
        if (body == null) {
            response.close();
            throw new DownloadException(ERROR_SERVER_ERROR, "服务器返回空响应");
        }

        InputStream input = new BufferedInputStream(body.byteStream(), 512 * 1024);
        FileOutputStream output = new FileOutputStream(zipFile, resumeDownload);

        synchronized (streamLock) {
            currentInputStream = input;
            currentOutputStream = output;
        }

        byte[] buffer = new byte[256 * 1024]; // 256KB 缓冲区
        long total = existingSize;
        int count;
        long lastNotifyTime = 0;
        long startTime = System.currentTimeMillis();

        while (!downloadCancelled && (count = input.read(buffer)) != -1) {
            total += count;
            output.write(buffer, 0, count);

            long now = System.currentTimeMillis();
            if (now - lastNotifyTime > 500) {
                lastNotifyTime = now;
                int progress = 0;
                if (fileLength > 0) {
                    progress = (int)(total * 100 / fileLength);
                } else {
                    progress = -1;
                }
                String downloadedMBStr = String.format("%.1f", total / (1024.0 * 1024.0));
                updateStatusAndNotify("downloading", null, total, fileLength, progress, downloadedMBStr, sourceLabel);
            }
        }

        try { output.flush(); } catch (Exception ignore) {}
        try { output.close(); } catch (Exception ignore) {}
        try { input.close(); } catch (Exception ignore) {}
        try { response.close(); } catch (Exception ignore) {}
        synchronized (streamLock) {
            currentInputStream = null;
            currentOutputStream = null;
        }

        if (downloadCancelled) {
            throw new Exception("下载已取消");
        }

        long elapsed = System.currentTimeMillis() - startTime;
        long speedKBs = elapsed > 0 ? (total - existingSize) / 1024 / (elapsed / 1000) : 0;
        Log.i(TAG, "模型下载完成, total=" + total + " bytes, time=" + elapsed + "ms, 速度约=" + speedKBs + " KB/s");

        // 验证下载文件大小
        long downloadedSize = zipFile.length();
        if (fileLength > 0 && downloadedSize < fileLength * 0.9) {
            Log.w(TAG, "文件下载不完整: 下载了 " + downloadedSize + " bytes, 预期 " + fileLength + " bytes");
            if (zipFile.exists() && isFileInPrivateDir(zipFile)) {
                zipFile.delete();
            }
            throw new DownloadException(ERROR_DOWNLOAD_INCOMPLETE, "文件下载不完整");
        }

        return true;
    }

    /**
     * 解压 ZIP 文件并安装模型
     */
    private void extractAndInstallModel(File zipFile) throws Exception {
        updateStatusAndNotify("extracting", "正在解压模型…", zipFile.length(), 0L, 100, "", null);

        File targetDir = new File(getContext().getFilesDir(), "vosk-model");
        if (targetDir.exists()) {
            deleteDir(targetDir);
        }

        // 使用临时目录解压，避免与 getFilesDir() 中的其他文件混淆
        File tempDir = new File(getContext().getFilesDir(), "vosk-model-tmp-" + System.currentTimeMillis());
        try {
            tempDir.mkdirs();
            unzip(zipFile, tempDir);
        } catch (Exception e) {
            Log.e(TAG, "解压失败: ZIP=" + zipFile.getAbsolutePath() + " (" + zipFile.length() + " bytes)", e);
            deleteDir(tempDir);
            String detail = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            throw new DownloadException(ERROR_UNZIP_FAILED, "解压失败: " + detail);
        }

        // 在临时目录中查找模型目录
        File extractedDir = findExtractedModelDir(tempDir);

        if (extractedDir != null) {
            if (extractedDir.equals(tempDir)) {
                // ZIP 无顶层目录，文件直接在 tempDir 中
                // 将 tempDir 重命名为 targetDir
                if (!tempDir.renameTo(targetDir)) {
                    // renameTo 失败，使用复制方式
                    if (copyDirRecursive(tempDir, targetDir)) {
                        deleteDir(tempDir);
                    } else {
                        Log.e(TAG, "复制模型文件失败");
                        deleteDir(tempDir);
                        throw new DownloadException(ERROR_UNZIP_FAILED, "模型文件安装失败");
                    }
                }
            } else if (!extractedDir.getName().equals("vosk-model")) {
                // 找到了模型子目录，重命名为 targetDir
                if (!extractedDir.renameTo(targetDir)) {
                    if (copyDirRecursive(extractedDir, targetDir)) {
                        deleteDir(tempDir);
                    } else {
                        Log.e(TAG, "复制模型文件失败");
                        deleteDir(tempDir);
                        throw new DownloadException(ERROR_UNZIP_FAILED, "模型文件安装失败");
                    }
                }
            }
        } else {
            // 列出临时目录内容用于诊断
            String tempDirContent = listDirContents(tempDir);
            Log.e(TAG, "未找到有效的模型目录，临时目录内容: " + tempDirContent);
            deleteDir(tempDir);
            throw new DownloadException(ERROR_UNZIP_FAILED, "ZIP 文件中未找到有效的模型（缺少 final.mdl 或 am/final.mdl）。解压目录内容: " + tempDirContent);
        }

        // 清理可能残留的临时目录
        if (tempDir.exists()) {
            deleteDir(tempDir);
        }

        // 验证安装结果（同时支持 V1 和 V2 布局）
        if (!isValidModelDir(targetDir)) {
            // 列出目标目录内容用于诊断
            String dirContent = listDirContents(targetDir);
            Log.e(TAG, "模型安装验证失败，targetDir 内容: " + dirContent);
            throw new DownloadException(ERROR_UNZIP_FAILED, "模型安装验证失败：未找到有效的模型文件（final.mdl 或 am/final.mdl）。目录内容: " + dirContent);
        }

        Log.i(TAG, "模型安装成功，路径: " + targetDir.getAbsolutePath() + ", 大小: " + getDirSize(targetDir) + " bytes");

        if (model != null) {
            try { model.close(); } catch (Exception e) { /* ignore */ }
            model = null;
        }

        // 更新状态字段并发送完成事件
        currentStatusStage = "completed";
        currentStatusText = "";
        JSObject complete = new JSObject();
        complete.put("stage", "completed");
        complete.put("success", true);
        complete.put("modelPath", targetDir.getAbsolutePath());
        complete.put("modelSize", getDirSize(targetDir));
        notifyListeners("voskDownloadProgress", complete);

        if (zipFile.exists() && isFileInPrivateDir(zipFile)) {
            zipFile.delete();
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        downloadCancelled = true;
        // 中断倒计时线程
        countdownRunning = false;
        if (countdownThread != null) {
            countdownThread.interrupt();
        }
        // 中断下载线程
        if (downloadThread != null) {
            downloadThread.interrupt();
        }
        // 中断导入线程
        if (importThread != null) {
            importThread.interrupt();
        }
        // 关闭活动的 IO 流，强制打断阻塞在 read() 上的 IO 操作
        // （常规 InputStream.read() 不响应 Thread.interrupt()，必须关闭流才能解除阻塞）
        synchronized (streamLock) {
            try {
                if (currentInputStream != null) {
                    try { currentInputStream.close(); } catch (Exception ignore) {}
                    currentInputStream = null;
                }
            } catch (Exception ignore) {}
            try {
                if (currentOutputStream != null) {
                    try { currentOutputStream.close(); } catch (Exception ignore) {}
                    currentOutputStream = null;
                }
            } catch (Exception ignore) {}
        }
        // 重置下载状态，防止取消后卡在 isDownloading=true 无法再次下载
        isDownloading = false;
        downloadThread = null;
        importThread = null;
        // 清理残留的临时目录（vosk-model-tmp-*），防止存储空间浪费
        try {
            File filesDir = getContext().getFilesDir();
            if (filesDir != null && filesDir.isDirectory()) {
                File[] files = filesDir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        if (f.isDirectory() && f.getName().startsWith("vosk-model-tmp-")) {
                            deleteDir(f);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "清理临时目录失败", e);
        }
        // 清理部分下载的 zip 文件
        try {
            File zipFile = new File(getContext().getFilesDir(), "vosk-model-download.zip");
            if (zipFile.exists()) {
                zipFile.delete();
            }
        } catch (Exception e) {
            Log.w(TAG, "清理部分下载文件失败", e);
        }
        call.resolve();
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        if (isListening) {
            call.reject("请先停止识别");
            return;
        }
        if (isDownloading) {
            call.reject("正在下载中，请稍候");
            return;
        }

        if (model != null) {
            try {
                model.close();
            } catch (Exception e) {
                // ignore
            }
            model = null;
        }

        File modelDir = new File(getContext().getFilesDir(), "vosk-model");
        boolean deleted = false;
        if (modelDir.exists()) {
            deleted = deleteDir(modelDir);
        }

        JSObject result = new JSObject();
        result.put("success", deleted);
        call.resolve(result);
    }

    /**
     * 打开系统文件选择器让用户选择 ZIP 模型文件，然后自动导入
     */
    private static final int PICK_FILE_REQUEST = 9001;
    private PluginCall pickFileCall = null;

    @PluginMethod
    public void pickAndImportModel(PluginCall call) {
        if (isImporting) {
            call.reject("正在导入中，请稍候");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("*/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream",
            "application/compressed"
        });

        pickFileCall = call;
        startActivityForResult(call, intent, "pickFileResult");
    }

    @ActivityCallback
    public void pickFileResult(PluginCall call, ActivityResult result) {
        Log.i(TAG, "pickFileResult called: resultCode=" + result.getResultCode() + ", data=" + result.getData());

        if (pickFileCall == null) {
            Log.w(TAG, "pickFileResult: pickFileCall is null, ignoring");
            return;
        }

        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            Log.i(TAG, "pickFileResult: 用户取消或未选择文件");
            pickFileCall.reject("用户取消了选择");
            pickFileCall = null;
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            pickFileCall.reject("未选择文件");
            pickFileCall = null;
            return;
        }

        // 保存 call，在 importModel 完成时 resolve
        final PluginCall originalCall = pickFileCall;
        pickFileCall = null;

        // 调用已有的 importModel 方法（但需要修改为可传 call）
        // 直接在这里启动导入线程
        isImporting = true;
        downloadCancelled = false;

        importThread = new Thread(() -> {
            File tempZip = null;
            try {
                Log.i(TAG, "pickAndImport: URI=" + uri);

                // 立即发送开始事件，让前端切换到"正在读取文件"状态（避免卡在"正在打开文件"）
                JSObject startEvent = new JSObject();
                startEvent.put("stage", "importing");
                startEvent.put("fileName", "vosk-model-import.zip");
                startEvent.put("fileSize", 0L);
                startEvent.put("downloaded", 0L);
                startEvent.put("downloadedMB", "0.0");
                startEvent.put("progress", 0);
                notifyListeners("voskDownloadProgress", startEvent);

                // 只查询文件名（不查询 SIZE，因为某些 ContentProvider 查询 SIZE 会扫描整个文件，非常慢）
                String fileName = "vosk-model-import.zip";
                try {
                    String[] projection = { OpenableColumns.DISPLAY_NAME };
                    Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, null);
                    if (cursor != null) {
                        if (cursor.moveToFirst()) {
                            int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            if (nameIndex >= 0) fileName = cursor.getString(nameIndex);
                        }
                        cursor.close();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "获取文件名失败: " + e.getMessage());
                }

                // 发送"已读取文件名"事件（让前端知道文件名查询完成，正在打开输入流）
                // 发送"已读取文件名"事件（同时更新状态字段）
                updateStatusAndNotify("importing", "正在读取文件...", 0L, 0L, 0, "", null);

                // 检查取消标志（用户可能在文件选择器返回前就点了取消）
                if (downloadCancelled) {
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    originalCall.reject("已取消导入");
                    return;
                }

                // 复制到临时文件
                tempZip = new File(getContext().getFilesDir(), "vosk-model-import.zip");
                InputStream rawInput = getContext().getContentResolver().openInputStream(uri);
                if (rawInput == null) {
                    throw new Exception("无法打开文件");
                }

                // 发送"开始读取文件"事件
                // 发送"开始读取文件"事件（同时更新状态字段）
                updateStatusAndNotify("importing", "正在读取文件...", 0L, 0L, 0, "", null);

                // 用 BufferedInputStream 包装，提高读取效率（256KB 预读缓存）
                InputStream input = new BufferedInputStream(rawInput, 256 * 1024);
                FileOutputStream output = new FileOutputStream(tempZip);
                // 保存流引用，用于取消时强制关闭以打断阻塞 IO
                synchronized (streamLock) {
                    currentInputStream = input;
                    currentOutputStream = output;
                }

                // 打开流后立即检查取消标志
                if (downloadCancelled) {
                    try { input.close(); } catch (Exception ignore) {}
                    try { output.close(); } catch (Exception ignore) {}
                    synchronized (streamLock) {
                        currentInputStream = null;
                        currentOutputStream = null;
                    }
                    if (tempZip.exists()) tempZip.delete();
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    originalCall.reject("已取消导入");
                    return;
                }

                // 使用 4MB 大 buffer，最大限度减少 read 系统调用，提升速度
                byte[] buffer = new byte[128 * 1024]; // 128KB 缓冲区
                long total = 0;
                int count;
                long lastNotifyTime = 0;
                long readStartTime = System.currentTimeMillis();
                long lastReadTime = readStartTime;

                Log.i(TAG, "开始读取文件到: " + tempZip.getAbsolutePath() + ", 超时: " + FILE_IMPORT_TIMEOUT_MS + "ms");

                while (!downloadCancelled && (count = input.read(buffer)) != -1) {
                    total += count;
                    output.write(buffer, 0, count);

                    // 检测读取是否卡住（超过 10 秒没有新数据则认为卡住）
                    long now = System.currentTimeMillis();
                    if (total > 0 && now - lastReadTime > 10000) {
                        Log.w(TAG, "检测到读取可能卡住，已读取: " + total + " bytes, 距上次读取: " + (now - lastReadTime) + "ms");
                    }
                    lastReadTime = now;

                    // 检测总超时
                    if (now - readStartTime > FILE_IMPORT_TIMEOUT_MS) {
                        Log.e(TAG, "文件读取超时，已读取: " + total + " bytes");
                        throw new Exception("FILE_IMPORT_TIMEOUT");
                    }

                    if (now - lastNotifyTime > 500) {
                        lastNotifyTime = now;
                        String downloadedMBStr = String.format("%.1f", total / (1024.0 * 1024.0));
                        String importStatus = "正在复制文件... 已读取 " + downloadedMBStr + " MB";
                        updateStatusAndNotify("importing", importStatus, total, 0L, -1, downloadedMBStr, null);
                    }
                }

                Log.i(TAG, "文件读取完成，总大小: " + total + " bytes (" + String.format("%.1f", total / (1024.0 * 1024.0)) + " MB), 耗时: " + (System.currentTimeMillis() - readStartTime) + "ms");

                try { output.flush(); } catch (Exception ignore) {}
                try { output.close(); } catch (Exception ignore) {}
                try { input.close(); } catch (Exception ignore) {}
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }

                // 如果是被取消的，清理临时文件并通知前端
                if (downloadCancelled) {
                    if (tempZip != null && tempZip.exists()) tempZip.delete();
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    originalCall.reject("已取消导入");
                    return;
                }

                // 解压并安装模型（使用统一的安装方法，支持临时目录和各种 ZIP 结构）
                extractAndInstallModel(tempZip);

                JSObject resultObj = new JSObject();
                resultObj.put("success", true);
                File installedDir = new File(getContext().getFilesDir(), "vosk-model");
                resultObj.put("modelPath", installedDir.getAbsolutePath());
                originalCall.resolve(resultObj);

            } catch (Exception e) {
                Log.e(TAG, "导入模型失败", e);
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                if (downloadCancelled) {
                    if (tempZip != null && tempZip.exists()) tempZip.delete();
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    originalCall.reject("已取消导入");
                } else {
                    // 检查是否为超时或其他特殊错误
                    String errorCode = inferErrorCode(e);
                    JSObject error = buildErrorEvent(errorCode);
                    notifyListeners("voskDownloadProgress", error);
                    originalCall.reject(error.getString("errorMessage"), errorCode);
                }
            } finally {
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                isImporting = false;
                importThread = null;
            }
        });
        importThread.start();
    }

    /**
     * 从用户选择的文件（Content URI）导入 Vosk 模型 ZIP 文件
     * 支持用户从文件管理器/下载目录选择已下载的 ZIP 模型
     */
    @PluginMethod
    public void importModel(PluginCall call) {
        if (isImporting) {
            call.reject("正在导入中，请稍候");
            return;
        }

        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("文件地址不能为空");
            return;
        }

        isImporting = true;
        downloadCancelled = false;

        importThread = new Thread(() -> {
            File tempZip = null;
            try {
                Uri uri = Uri.parse(uriStr);
                Log.i(TAG, "开始导入模型, URI=" + uriStr);

                // 立即发送开始事件，让前端切换到"正在读取文件"状态
                JSObject startEvent = new JSObject();
                startEvent.put("stage", "importing");
                startEvent.put("fileName", "vosk-model-import.zip");
                startEvent.put("fileSize", 0L);
                startEvent.put("downloaded", 0L);
                startEvent.put("downloadedMB", "0.0");
                startEvent.put("progress", 0);
                notifyListeners("voskDownloadProgress", startEvent);

                // 只查询文件名（不查询 SIZE，因为某些 ContentProvider 查询 SIZE 会扫描整个文件，非常慢）
                String fileName = "vosk-model-import.zip";
                try {
                    String[] projection = { OpenableColumns.DISPLAY_NAME };
                    Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, null);
                    if (cursor != null) {
                        if (cursor.moveToFirst()) {
                            int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            if (nameIndex >= 0) {
                                fileName = cursor.getString(nameIndex);
                            }
                        }
                        cursor.close();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "获取文件名失败: " + e.getMessage());
                }

                Log.i(TAG, "导入文件: " + fileName);

                // 发送"已读取文件名"事件
                // 发送"已读取文件名"事件（同时更新状态字段）
                updateStatusAndNotify("importing", "正在读取文件...", 0L, 0L, 0, "", null);

                // 检查取消标志
                if (downloadCancelled) {
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    call.reject("已取消导入");
                    return;
                }

                // 将 Content URI 的文件复制到临时 ZIP 文件
                tempZip = new File(getContext().getFilesDir(), "vosk-model-import.zip");
                InputStream rawInput = getContext().getContentResolver().openInputStream(uri);
                if (rawInput == null) {
                    throw new Exception("无法打开文件，请检查文件权限");
                }

                // 发送"开始读取文件"事件
                // 发送"开始读取文件"事件（同时更新状态字段）
                updateStatusAndNotify("importing", "正在读取文件...", 0L, 0L, 0, "", null);

                // 用 BufferedInputStream 包装，提高读取效率（256KB 预读缓存）
                InputStream input = new BufferedInputStream(rawInput, 256 * 1024);
                FileOutputStream output = new FileOutputStream(tempZip);
                // 保存流引用，用于取消时强制关闭以打断阻塞 IO
                synchronized (streamLock) {
                    currentInputStream = input;
                    currentOutputStream = output;
                }

                // 打开流后立即检查取消标志
                if (downloadCancelled) {
                    try { input.close(); } catch (Exception ignore) {}
                    try { output.close(); } catch (Exception ignore) {}
                    synchronized (streamLock) {
                        currentInputStream = null;
                        currentOutputStream = null;
                    }
                    if (tempZip.exists()) tempZip.delete();
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    call.reject("已取消导入");
                    return;
                }

                // 使用 4MB 大 buffer，最大限度减少 read 系统调用，提升速度
                byte[] buffer = new byte[128 * 1024]; // 128KB 缓冲区
                long total = 0;
                int count;
                long lastNotifyTime = 0;
                long readStartTime = System.currentTimeMillis();
                long lastReadTime = readStartTime;

                Log.i(TAG, "开始读取文件到: " + tempZip.getAbsolutePath() + ", 超时: " + FILE_IMPORT_TIMEOUT_MS + "ms");

                while (!downloadCancelled && (count = input.read(buffer)) != -1) {
                    total += count;
                    output.write(buffer, 0, count);

                    // 检测读取是否卡住（超过 10 秒没有新数据则认为卡住）
                    long now = System.currentTimeMillis();
                    if (total > 0 && now - lastReadTime > 10000) {
                        Log.w(TAG, "检测到读取可能卡住，已读取: " + total + " bytes, 距上次读取: " + (now - lastReadTime) + "ms");
                    }
                    lastReadTime = now;

                    // 检测总超时
                    if (now - readStartTime > FILE_IMPORT_TIMEOUT_MS) {
                        Log.e(TAG, "文件读取超时，已读取: " + total + " bytes");
                        throw new Exception("FILE_IMPORT_TIMEOUT");
                    }

                    if (now - lastNotifyTime > 500) {
                        lastNotifyTime = now;
                        String downloadedMBStr = String.format("%.1f", total / (1024.0 * 1024.0));
                        String importStatus = "正在复制文件... 已读取 " + downloadedMBStr + " MB";
                        updateStatusAndNotify("importing", importStatus, total, 0L, -1, downloadedMBStr, null);
                    }
                }

                Log.i(TAG, "文件读取完成，总大小: " + total + " bytes (" + String.format("%.1f", total / (1024.0 * 1024.0)) + " MB), 耗时: " + (System.currentTimeMillis() - readStartTime) + "ms");

                try { output.flush(); } catch (Exception ignore) {}
                try { output.close(); } catch (Exception ignore) {}
                try { input.close(); } catch (Exception ignore) {}
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }

                // 如果是被取消的，清理临时文件并通知前端
                if (downloadCancelled) {
                    if (tempZip != null && tempZip.exists()) tempZip.delete();
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    call.reject("已取消导入");
                    return;
                }

                // 解压并安装模型（使用统一的安装方法，支持 V1/V2 布局和临时目录）
                extractAndInstallModel(tempZip);

                JSObject result = new JSObject();
                result.put("success", true);
                File installedDir = new File(getContext().getFilesDir(), "vosk-model");
                result.put("modelPath", installedDir.getAbsolutePath());
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "导入模型失败", e);
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                if (downloadCancelled) {
                    if (tempZip != null && tempZip.exists()) tempZip.delete();
                    JSObject cancelResult = new JSObject();
                    cancelResult.put("cancelled", true);
                    notifyListeners("voskDownloadProgress", cancelResult);
                    call.reject("已取消导入");
                } else {
                    // 检查是否为超时或其他特殊错误
                    String errorCode = inferErrorCode(e);
                    JSObject error = buildErrorEvent(errorCode);
                    notifyListeners("voskDownloadProgress", error);
                    call.reject(error.getString("errorMessage"), errorCode);
                }
            } finally {
                synchronized (streamLock) {
                    currentInputStream = null;
                    currentOutputStream = null;
                }
                isImporting = false;
                importThread = null;
            }
        });
        importThread.start();
    }

    /**
     * 带超时保护和进度反馈的蓝奏云解析方法。
     * 使用 FutureTask + Callable + Thread 实现 15 秒总超时控制，
     * 每 2 秒发送一次进度事件让用户感知解析正在进行。
     *
     * @param shareUrl 蓝奏云分享链接
     * @param sourceLabel 下载源标签，可为 null
     * @return 真实下载 URL
     * @throws Exception 解析超时或解析失败时抛出异常
     */
    private String resolveLanzouDownloadUrlWithTimeout(String shareUrl, String sourceLabel) throws Exception {
        final String finalShareUrl = shareUrl;
        final String finalSourceLabel = sourceLabel;

        Callable<String> parseTask = new Callable<String>() {
            @Override
            public String call() throws Exception {
                return resolveLanzouDownloadUrl(finalShareUrl);
            }
        };

        FutureTask<String> futureTask = new FutureTask<String>(parseTask);
        Thread parseThread = new Thread(futureTask, "LanzouParseThread");
        parseThread.start();

        Thread progressThread = null;
        final boolean[] progressRunning = {true};

        try {
            progressThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    int elapsedSeconds = 0;
                    while (progressRunning[0] && !Thread.currentThread().isInterrupted()) {
                        try {
                            Thread.sleep(LANZOU_PARSE_PROGRESS_INTERVAL_MS);
                            elapsedSeconds += 2;
                            if (!progressRunning[0]) break;

                            JSObject progressEvent = new JSObject();
                            progressEvent.put("stage", "downloading");
                            progressEvent.put("downloaded", 0L);
                            progressEvent.put("progress", -1);
                            progressEvent.put("downloadedMB", "");
                            progressEvent.put("status", "正在解析蓝奏云链接...（" + elapsedSeconds + "秒）");
                            if (finalSourceLabel != null) {
                                progressEvent.put("source", finalSourceLabel);
                            }
                            notifyListeners("voskDownloadProgress", progressEvent);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            break;
                        }
                    }
                }
            }, "LanzouProgressThread");
            progressThread.start();

            String result = futureTask.get(LANZOU_PARSE_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            return result;

        } catch (TimeoutException e) {
            futureTask.cancel(true);
            if (parseThread != null) {
                parseThread.interrupt();
            }
            Log.w(TAG, "蓝奏云解析超时: " + shareUrl);
            throw new DownloadException(ERROR_LANZOU_PARSE_TIMEOUT, "蓝奏云链接解析超时");

        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception) {
                throw (Exception) cause;
            }
            throw new Exception("蓝奏云解析失败: " + cause.getMessage(), cause);

        } finally {
            progressRunning[0] = false;
            if (progressThread != null) {
                progressThread.interrupt();
                try {
                    progressThread.join(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            if (futureTask != null && !futureTask.isDone()) {
                futureTask.cancel(true);
            }
            if (parseThread != null && parseThread.isAlive()) {
                parseThread.interrupt();
                try {
                    parseThread.join(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    /**
     * 判断 URL 是否为蓝奏云分享链接（非直接下载链接）。
     * 分享链接形如 https://wwaxr.lanzouw.com/iBOnm3t9c8bi，
     * 直接下载链接形如 https://developerN.lanrar.com/file/?...
     */
    private boolean isLanzouShareUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase();
        // 分享链接：域名含 lanzou / lanzouw，路径是短 ID（非 /file/）
        boolean isLanzouDomain = lower.contains("lanzou.com") || lower.contains("lanzouw.com");
        boolean isLanrarDomain = lower.contains("lanrar.com");
        boolean isFileDownload = lower.contains("/file/");
        // 分享页只有 lanzou 域名且不是 /file/ 下载链接
        return (isLanzouDomain || isLanrarDomain) && !isFileDownload;
    }

    /**
     * 解析蓝奏云分享页，提取真实下载 URL。
     * 蓝奏云机制会变，这里采用多重正则兜底：
     *   1) href="https://developerN.lanrar.com/file/?..."
     *   2) 任意 /file/?... 形式 URL
     *   3) var surl='...' / var url='...' / var downloads='...'
     *   4) <iframe src="...">
     *   5) data-url="..." 或 postdown iframe
     *   6) 带签名参数的 direct URL
     * 如果都失败则抛出异常，由上层提示用户切换源。
     */
    private String resolveLanzouDownloadUrl(String shareUrl) throws Exception {
        return resolveLanzouDownloadUrl(shareUrl, 0);
    }

    private String resolveLanzouDownloadUrl(String shareUrl, int uaIndex) throws Exception {
        Log.i(TAG, "拉取蓝奏云分享页: " + shareUrl + " (UA #" + uaIndex + ")");

        // 使用更真实的浏览器 User-Agent 避免被拦截
        String[] userAgents = {
            "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (Linux; Android 12; Xiaomi 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36"
        };
        String userAgent = userAgents[uaIndex % userAgents.length];

        URL url = new URL(shareUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", userAgent);
        // 关键：添加 Referer 头，蓝奏云对无 Referer 请求可能返回人机验证页面
        conn.setRequestProperty("Referer", "https://wwaxr.lanzouw.com/");
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
        conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
        // 只使用 gzip，移除 br（brotli），因为 HttpURLConnection 不会自动解压 brotli
        conn.setRequestProperty("Accept-Encoding", "gzip, deflate");
        conn.setRequestProperty("Connection", "keep-alive");
        conn.setRequestProperty("Upgrade-Insecure-Requests", "1");
        conn.setRequestProperty("Sec-Fetch-Dest", "document");
        conn.setRequestProperty("Sec-Fetch-Mode", "navigate");
        conn.setRequestProperty("Sec-Fetch-Site", "none");
        conn.setRequestProperty("Sec-Fetch-User", "?1");

        int code = conn.getResponseCode();
        if (code != HttpURLConnection.HTTP_OK) {
            conn.disconnect();
            // 首个 UA 失败时尝试轮换其他 UA
            if (uaIndex < userAgents.length - 1) {
                Log.w(TAG, "蓝奏云分享页请求失败 HTTP " + code + "，尝试更换 UA 重试");
                return resolveLanzouDownloadUrl(shareUrl, uaIndex + 1);
            }
            throw new Exception("蓝奏云分享页请求失败: HTTP " + code);
        }

        // 处理 gzip 响应：检查 Content-Encoding 头
        String contentEncoding = conn.getContentEncoding();
        InputStream inputStream = conn.getInputStream();
        boolean isGzip = contentEncoding != null && contentEncoding.contains("gzip");
        java.io.InputStream decompressedStream = isGzip
            ? new java.util.zip.GZIPInputStream(inputStream)
            : inputStream;

        BufferedReader reader = new BufferedReader(
            new InputStreamReader(decompressedStream, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append('\n');
        }
        reader.close();
        decompressedStream.close();
        conn.disconnect();

        String html = sb.toString();
        Log.i(TAG, "蓝奏云分享页长度: " + html.length() + (isGzip ? " (gzip解压后)" : ""));

        String result = null;

        // Pattern 1: href="https://developerN.lanrar.com/file/?..." 或直接下载链接
        Pattern p1 = Pattern.compile("href\\s*=\\s*['\"]([^'\"]*lanrar\\.com[^'\"]*)['\"]");
        Matcher m1 = p1.matcher(html);
        while (m1.find()) {
            String href = m1.group(1);
            if (href.contains("/file/") || href.contains("download") || href.contains(".zip")) {
                Log.i(TAG, "蓝奏云解析（pattern 1 href）: " + href);
                result = href;
                break;
            }
        }
        if (result != null) return result;

        // Pattern 2: data-url="..." 或 data-src="..."
        Pattern p2 = Pattern.compile("(?:data-url|data-src)\\s*=\\s*['\"]([^'\"]+)['\"]");
        Matcher m2 = p2.matcher(html);
        if (m2.find()) {
            String dataUrl = m2.group(1);
            Log.i(TAG, "蓝奏云解析（pattern 2 data-url）: " + dataUrl);
            result = dataUrl;
        }
        if (result != null) return result;

        // Pattern 3: 任意 /file/?... 形式 URL（含签名的）
        Pattern p3 = Pattern.compile("(https?://[^'\"\\s<>]+/file/\\?[^'\"\\s<>]+)");
        Matcher m3 = p3.matcher(html);
        if (m3.find()) {
            String fileUrl = m3.group(1);
            Log.i(TAG, "蓝奏云解析（pattern 3 /file/）: " + fileUrl);
            result = fileUrl;
        }
        if (result != null) return result;

        // Pattern 4: var surl / var url / var downloads = 'xxxx' / postdown
        Pattern p4 = Pattern.compile("var\\s+(?:surl|url|downloads|postdown|ldown)\\s*=\\s*['\"]([^'\"]+)['\"]");
        Matcher m4 = p4.matcher(html);
        if (m4.find()) {
            String surl = m4.group(1);
            Log.i(TAG, "蓝奏云解析（pattern 4 变量）: " + surl);
            if (surl.startsWith("http://") || surl.startsWith("https://")) {
                return surl;
            }
            // 相对路径，拼接
            URL base = new URL(shareUrl);
            String fullUrl = base.getProtocol() + "://" + base.getHost() + surl;
            Log.i(TAG, "蓝奏云解析（pattern 4 拼接）: " + fullUrl);
            result = fullUrl;
        }
        if (result != null) return result;

        // Pattern 5: postdown iframe 或直接包含下载 URL 的 script
        Pattern p5 = Pattern.compile("(?:postdown|ldown|download)\\s*[=:]\\s*['\"]([^'\"]+)['\"]");
        Matcher m5 = p5.matcher(html);
        if (m5.find()) {
            String downUrl = m5.group(1);
            Log.i(TAG, "蓝奏云解析（pattern 5 postdown）: " + downUrl);
            result = downUrl;
        }
        if (result != null) return result;

        // Pattern 6: <iframe src="...">
        Pattern p6 = Pattern.compile("<iframe[^>]*src\\s*=\\s*['\"]([^'\"]+)['\"]");
        Matcher m6 = p6.matcher(html);
        while (m6.find()) {
            String iframeSrc = m6.group(1);
            Log.i(TAG, "蓝奏云解析（pattern 6 iframe）: " + iframeSrc);
            if (iframeSrc.startsWith("http://") || iframeSrc.startsWith("https://")) {
                if (iframeSrc.contains("/file/") || iframeSrc.contains("lanrar.com") || iframeSrc.contains("download")) {
                    result = iframeSrc;
                    break;
                }
                // 递归调用一次（防止无限递归）
                if (!iframeSrc.equals(shareUrl)) {
                    try {
                        result = resolveLanzouDownloadUrl(iframeSrc, uaIndex);
                        if (result != null) break;
                    } catch (Exception inner) {
                        Log.w(TAG, "蓝奏云 iframe 递归解析失败: " + inner.getMessage());
                    }
                }
            }
        }
        if (result != null) return result;

        // Pattern 7: 尝试从 JavaScript 代码中提取签名参数
        Pattern p7 = Pattern.compile("(?:sign|signs|sig|token|key)\\s*[=:]\\s*['\"]([^'\"]+)['\"]");
        Matcher m7 = p7.matcher(html);
        if (m7.find()) {
            Log.i(TAG, "蓝奏云解析（pattern 7 发现签名参数，但需要完整 URL）");
        }

        // Pattern 8: 直接匹配完整下载 URL（含域名）
        Pattern p8 = Pattern.compile("https?://[a-zA-Z0-9\\-]+\\.lanzou[si]?[a-z]?\\.com/[a-zA-Z0-9]+");
        Matcher m8 = p8.matcher(html);
        if (m8.find()) {
            String directUrl = m8.group(0);
            Log.i(TAG, "蓝奏云解析（pattern 8 直接 URL）: " + directUrl);
            result = directUrl;
        }
        if (result != null) return result;

        // 全部失败：尝试更换 UA 重试一次
        if (uaIndex < userAgents.length - 1) {
            Log.w(TAG, "蓝奏云解析全部 pattern 失败，尝试更换 UA 重试");
            return resolveLanzouDownloadUrl(shareUrl, uaIndex + 1);
        }

        // 全部失败：打印 HTML 片段方便排查
        String snippet = html.length() > 800 ? html.substring(0, 800) + "..." : html;
        Log.e(TAG, "蓝奏云分享页解析失败，HTML 片段:\n" + snippet);
        throw new Exception("无法从蓝奏云分享页中提取下载链接，蓝奏云可能已更换页面结构，请使用其他下载源");
    }

    private boolean deleteDir(File dir) {
        if (dir.isDirectory()) {
            File[] children = dir.listFiles();
            if (children != null) {
                for (File child : children) {
                    boolean success = deleteDir(child);
                    if (!success) return false;
                }
            }
        }
        return dir.delete();
    }

    /**
     * 递归复制目录及其内容到目标位置
     * 用于 renameTo 失败时的回退方案
     */
    private boolean copyDirRecursive(File source, File dest) {
        if (!dest.exists()) {
            if (!dest.mkdirs()) {
                Log.e(TAG, "创建目标目录失败: " + dest.getAbsolutePath());
                return false;
            }
        }

        File[] children = source.listFiles();
        if (children != null) {
            for (File child : children) {
                File destChild = new File(dest, child.getName());
                if (child.isDirectory()) {
                    if (!copyDirRecursive(child, destChild)) {
                        return false;
                    }
                } else {
                    try (FileInputStream fis = new FileInputStream(child);
                         FileOutputStream fos = new FileOutputStream(destChild)) {
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = fis.read(buffer)) > 0) {
                            fos.write(buffer, 0, len);
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "复制文件失败: " + child.getAbsolutePath(), e);
                        return false;
                    }
                }
            }
        }
        return true;
    }

    private void unzip(File zipFile, File targetDir) throws Exception {
        Log.i(TAG, "开始解压: " + zipFile.getAbsolutePath() + " (" + zipFile.length() + " bytes) -> " + targetDir.getAbsolutePath());

        int entryCount = 0;
        int dirCount = 0;
        int fileCount = 0;
        long totalBytes = 0;
        String currentEntryName = "";

        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile), 256 * 1024))) {
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024]; // 64KB 缓冲区

            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                currentEntryName = entry.getName();

                if (downloadCancelled) {
                    throw new Exception("下载已取消（已解压 " + entryCount + " 个条目）");
                }

                // 安全检查：防止 ZIP Slip 漏洞，确保文件路径在目标目录内
                File file = new File(targetDir, entry.getName());
                String canonicalTargetPath = targetDir.getCanonicalPath();
                String canonicalFilePath = file.getCanonicalPath();
                if (!canonicalFilePath.startsWith(canonicalTargetPath + File.separator) &&
                    !canonicalFilePath.equals(canonicalTargetPath)) {
                    Log.w(TAG, "跳过不安全的 ZIP 条目: " + entry.getName());
                    zis.closeEntry();
                    continue;
                }

                if (entry.isDirectory()) {
                    file.mkdirs();
                    dirCount++;
                } else {
                    File parent = file.getParentFile();
                    if (parent != null && !parent.exists()) {
                        parent.mkdirs();
                    }

                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            fos.write(buffer, 0, len);
                            totalBytes += len;
                        }
                    }
                    fileCount++;
                }
                zis.closeEntry();
            }
        } catch (Exception e) {
            Log.e(TAG, "解压失败: 已处理 " + entryCount + " 个条目 (目录=" + dirCount + ", 文件=" + fileCount + ", 字节=" + totalBytes + "), 失败条目: " + currentEntryName, e);
            throw new Exception("解压失败: " + e.getClass().getSimpleName() + " - " + e.getMessage() + " (已解压 " + entryCount + " 个条目, 当前条目: " + currentEntryName + ")", e);
        }

        Log.i(TAG, "解压完成: 共 " + entryCount + " 个条目 (目录=" + dirCount + ", 文件=" + fileCount + ", 总字节=" + totalBytes + ")");
    }

    /**
     * 检查目录是否是有效的 Vosk 模型目录。
     * 同时支持两种模型布局：
     *   V1 (Legacy): final.mdl 直接在模型根目录下
     *   V2 (Recommended): final.mdl 在 am/ 子目录下
     * Vosk SDK 的 Model 类会自动检测布局并加载，所以这里只需要判断目录是否有效，
     * 不需要关心具体是哪种布局。
     */
    private boolean isValidModelDir(File dir) {
        if (dir == null || !dir.exists() || !dir.isDirectory()) {
            return false;
        }
        // V1 布局：final.mdl 直接在根目录
        if (new File(dir, "final.mdl").exists()) {
            return true;
        }
        // V2 布局：final.mdl 在 am/ 子目录下（vosk-model-small-cn-0.22 等使用此布局）
        if (new File(dir, "am").exists() && new File(dir, "am/final.mdl").exists()) {
            return true;
        }
        return false;
    }

    /**
     * 严格验证模型目录完整性，检查 Vosk 模型运行所需的关键文件。
     * 在 new Model() 之前调用，避免因文件缺失导致 native 层 SIGSEGV 崩溃。
     * @return null 表示验证通过；非 null 表示错误描述（用于 reject 提示）
     */
    /**
     * 在指定目录中查找匹配指定目标文件名的文件，支持文件名变体。
     * 变体包括：大小写不敏感、重复后缀（如 words.txt.txt）、前缀干扰（如 word_HCLr.fst）
     * @param dir 搜索目录
     * @param targetName 目标文件名（如 "words.txt", "HCLr.fst"）
     * @return 匹配的文件，未找到返回 null
     */
    private File findFileWithVariants(File dir, String targetName) {
        if (!dir.exists() || !dir.isDirectory()) {
            return null;
        }
        File[] files = dir.listFiles();
        if (files == null) {
            return null;
        }
        String lowerTarget = targetName.toLowerCase();
        String targetBase = lowerTarget.contains(".") ? lowerTarget.substring(0, lowerTarget.lastIndexOf(".")) : lowerTarget;
        String targetExt = lowerTarget.contains(".") ? lowerTarget.substring(lowerTarget.lastIndexOf(".")) : "";
        
        for (File file : files) {
            if (!file.isFile()) continue;
            String fileName = file.getName().toLowerCase();
            
            // 精确匹配（优先级最高）
            if (fileName.equals(lowerTarget)) {
                return file;
            }
            
            // 大小写不敏感匹配
            if (fileName.equalsIgnoreCase(targetName)) {
                return file;
            }
            
            // 重复后缀匹配（如 words.txt.txt -> words.txt）
            if (fileName.equals(lowerTarget + targetExt)) {
                return file;
            }
            
            // 包含目标文件名（如 word_HCLr.fst -> HCLr.fst）
            if (fileName.contains(lowerTarget)) {
                return file;
            }
            
            // 基础名匹配（去掉后缀后相同）
            String fileBase = fileName.contains(".") ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
            if (fileBase.equals(targetBase)) {
                return file;
            }
        }
        return null;
    }
    
    /**
     * 修复模型目录中的常见文件名问题。
     * 如果检测到文件名变体，自动创建正确名称的副本。
     * @param dir 模型目录
     */
    private void fixModelFilenameVariants(File dir) {
        // 修复根目录 words.txt
        File wordsTxt = new File(dir, "words.txt");
        if (!wordsTxt.exists()) {
            File wordsTxtTxt = new File(dir, "words.txt.txt");
            if (wordsTxtTxt.exists()) {
                wordsTxtTxt.renameTo(wordsTxt);
                Log.i(TAG, "自动修复文件名: words.txt.txt -> words.txt");
            } else {
                // 尝试查找变体并复制
                File found = findFileWithVariants(dir, "words.txt");
                if (found != null && !found.getName().equals("words.txt")) {
                    try {
                        copyFile(found, wordsTxt);
                        Log.i(TAG, "自动修复文件名: " + found.getName() + " -> words.txt");
                    } catch (Exception e) {
                        Log.w(TAG, "修复 words.txt 失败: " + e.getMessage());
                    }
                }
            }
        }
        
        // 修复 graph 目录中的文件
        File graphDir = new File(dir, "graph");
        if (graphDir.exists()) {
            // 修复 HCLr.fst
            File hclrFst = new File(graphDir, "HCLr.fst");
            if (!hclrFst.exists()) {
                File found = findFileWithVariants(graphDir, "HCLr.fst");
                if (found != null && !found.getName().equals("HCLr.fst")) {
                    try {
                        copyFile(found, hclrFst);
                        Log.i(TAG, "自动修复文件名: " + found.getName() + " -> HCLr.fst");
                    } catch (Exception e) {
                        Log.w(TAG, "修复 HCLr.fst 失败: " + e.getMessage());
                    }
                }
            }
            
            // 修复 Gr.fst
            File grFst = new File(graphDir, "Gr.fst");
            if (!grFst.exists()) {
                File found = findFileWithVariants(graphDir, "Gr.fst");
                if (found != null && !found.getName().equals("Gr.fst")) {
                    try {
                        copyFile(found, grFst);
                        Log.i(TAG, "自动修复文件名: " + found.getName() + " -> Gr.fst");
                    } catch (Exception e) {
                        Log.w(TAG, "修复 Gr.fst 失败: " + e.getMessage());
                    }
                }
            }
            
            // 修复 graph/words.txt
            File graphWordsTxt = new File(graphDir, "words.txt");
            if (!graphWordsTxt.exists()) {
                File found = findFileWithVariants(graphDir, "words.txt");
                if (found != null && !found.getName().equals("words.txt")) {
                    try {
                        copyFile(found, graphWordsTxt);
                        Log.i(TAG, "自动修复文件名: " + found.getName() + " -> graph/words.txt");
                    } catch (Exception e) {
                        Log.w(TAG, "修复 graph/words.txt 失败: " + e.getMessage());
                    }
                }
            }
        }
    }
    
    /**
     * 复制文件
     */
    private void copyFile(File src, File dest) throws IOException {
        try (java.io.InputStream is = new java.io.FileInputStream(src);
             java.io.OutputStream os = new java.io.FileOutputStream(dest)) {
            byte[] buffer = new byte[64 * 1024];
            int len;
            while ((len = is.read(buffer)) > 0) {
                os.write(buffer, 0, len);
            }
        }
    }
    
    private String validateModelFiles(File dir) {
        if (dir == null || !dir.exists() || !dir.isDirectory()) {
            return "模型目录不存在或不是目录: " + (dir == null ? "null" : dir.getAbsolutePath());
        }

        boolean isV2 = new File(dir, "am/final.mdl").exists();
        boolean isV1 = new File(dir, "final.mdl").exists();

        if (!isV1 && !isV2) {
            return "模型缺少 final.mdl（V1 布局）或 am/final.mdl（V2 布局）。目录内容: " + listDirContents(dir);
        }

        fixModelFilenameVariants(dir);

        File graphDir = new File(dir, "graph");
        boolean hasGraphDir = graphDir.exists() && graphDir.isDirectory();

        boolean hasWordsTxt = false;
        if (hasGraphDir) {
            File wordsFileGraph = new File(dir, "graph/words.txt");
            File wordsFileRoot = new File(dir, "words.txt");
            if (wordsFileGraph.exists() && wordsFileGraph.length() > 0) {
                hasWordsTxt = true;
            } else if (wordsFileRoot.exists() && wordsFileRoot.length() > 0) {
                hasWordsTxt = true;
            } else {
                File foundGraph = findFileWithVariants(graphDir, "words.txt");
                File foundRoot = findFileWithVariants(dir, "words.txt");
                if (foundGraph != null) hasWordsTxt = true;
                else if (foundRoot != null) hasWordsTxt = true;
            }
        } else {
            File wordsFileRoot = new File(dir, "words.txt");
            if (wordsFileRoot.exists() && wordsFileRoot.length() > 0) {
                hasWordsTxt = true;
            } else {
                File foundRoot = findFileWithVariants(dir, "words.txt");
                if (foundRoot != null) hasWordsTxt = true;
            }
        }

        boolean hasIntegratedGraph = false;
        boolean hasDynamicGraph = false;

        if (hasGraphDir) {
            File hclgFst = new File(dir, "graph/HCLG.fst");
            File hclrFst = new File(dir, "graph/HCLr.fst");
            File grFst = new File(dir, "graph/Gr.fst");
            
            if (!hclgFst.exists() || hclgFst.length() == 0) {
                File found = findFileWithVariants(graphDir, "HCLG.fst");
                if (found != null) hclgFst = found;
            }
            if (!hclrFst.exists() || hclrFst.length() == 0) {
                File found = findFileWithVariants(graphDir, "HCLr.fst");
                if (found != null) hclrFst = found;
            }
            if (!grFst.exists() || grFst.length() == 0) {
                File found = findFileWithVariants(graphDir, "Gr.fst");
                if (found != null) grFst = found;
            }
            
            hasIntegratedGraph = (hclgFst.exists() && hclgFst.length() > 0);
            hasDynamicGraph = (hclrFst.exists() && hclrFst.length() > 0 && grFst.exists() && grFst.length() > 0);
        } else {
            File hclrFstRoot = new File(dir, "HCLr.fst");
            File grFstRoot = new File(dir, "Gr.fst");
            if (hclrFstRoot.exists() && hclrFstRoot.length() > 0 && grFstRoot.exists() && grFstRoot.length() > 0) {
                hasDynamicGraph = true;
            }
        }

        if (!hasIntegratedGraph && !hasDynamicGraph) {
            if (hasGraphDir) {
                return "模型缺少解码图文件（标准模型需要 HCLG.fst，small 模型需要 HCLr.fst + Gr.fst）。graph 目录内容: " + listDirContents(graphDir);
            } else {
                return "模型缺少解码图文件（需要 HCLr.fst + Gr.fst）。目录内容: " + listDirContents(dir);
            }
        }

        if (!hasWordsTxt) {
            File wordBoundaryFile = new File(dir, "word_boundary.int");
            if (!wordBoundaryFile.exists()) {
                wordBoundaryFile = hasGraphDir ? new File(graphDir, "word_boundary.int") : null;
            }
            if (wordBoundaryFile != null && wordBoundaryFile.exists()) {
                Log.w(TAG, "模型缺少 words.txt，但存在 word_boundary.int，可能是 Vosk v0.3+ 扁平化布局模型，尝试跳过验证");
            } else {
                if (hasGraphDir) {
                    return "模型缺少 words.txt 词汇表文件或文件为空（可能在根目录或 graph/ 目录下）。根目录文件: " + listDirContents(dir) + "。graph 目录内容: " + listDirContents(graphDir);
                } else {
                    return "模型缺少 words.txt 词汇表文件或文件为空。目录内容: " + listDirContents(dir);
                }
            }
        }

        Log.i(TAG, "模型完整性验证通过: " + dir.getAbsolutePath() + " (布局=" + (isV2 ? "V2" : "V1") + 
            ", 图类型=" + (hasIntegratedGraph ? "HCLG.fst" : "HCLr.fst+Gr.fst") + ")");
        return null;
    }

    private File findExtractedModelDir(File parentDir) {
        // 1. 检查是否已存在 vosk-model 目录且是有效模型目录
        File voskModelDir = new File(parentDir, "vosk-model");
        if (isValidModelDir(voskModelDir)) {
            return voskModelDir;
        }

        // 2. 检查所有子目录（不限制名称），找到有效的模型目录
        File[] files = parentDir.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory() && isValidModelDir(file)) {
                    return file;
                }
            }
        }

        // 3. 检查 parentDir 本身是否是有效模型目录（ZIP 无顶层目录的情况）
        if (isValidModelDir(parentDir)) {
            return parentDir;
        }

        // 4. 递归检查一层嵌套（处理 ZIP 解压后多了一层目录的情况，如 xxx/vosk-model-small-cn-0.22/am/final.mdl）
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    File[] subFiles = file.listFiles();
                    if (subFiles != null) {
                        for (File subFile : subFiles) {
                            if (subFile.isDirectory() && isValidModelDir(subFile)) {
                                return subFile;
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * 列出目录内容（用于错误诊断），最多显示 2 层深度，每层最多 20 个条目
     */
    private String listDirContents(File dir) {
        if (dir == null || !dir.exists()) {
            return "<目录不存在>";
        }
        StringBuilder sb = new StringBuilder();
        listDirContentsHelper(dir, sb, 0, 2);
        return sb.toString();
    }

    private void listDirContentsHelper(File dir, StringBuilder sb, int depth, int maxDepth) {
        if (depth > maxDepth) return;
        String indent = "";
        for (int i = 0; i < depth; i++) indent += "  ";
        File[] files = dir.listFiles();
        if (files == null) {
            sb.append(indent).append("<无法列出目录内容>");
            return;
        }
        int count = 0;
        for (File file : files) {
            if (count >= 20) {
                sb.append(indent).append("... 还有 ").append(files.length - count).append(" 个条目\n");
                break;
            }
            sb.append(indent);
            if (file.isDirectory()) {
                sb.append("[DIR] ").append(file.getName()).append("/\n");
                if (depth < maxDepth) {
                    listDirContentsHelper(file, sb, depth + 1, maxDepth);
                }
            } else {
                sb.append("[FILE] ").append(file.getName()).append(" (").append(file.length()).append(" bytes)\n");
            }
            count++;
        }
    }

    private long getDirSize(File dir) {
        long size = 0;
        if (dir.isDirectory()) {
            File[] files = dir.listFiles();
            if (files != null) {
                for (File file : files) {
                    size += getDirSize(file);
                }
            }
        } else {
            size = dir.length();
        }
        return size;
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) {
            return false;
        }
        try {
            NetworkCapabilities capabilities = cm.getNetworkCapabilities(cm.getActiveNetwork());
            if (capabilities != null) {
                return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
        } catch (Exception e) {
            Log.w(TAG, "使用 NetworkCapabilities 检查网络失败，回退到 NetworkInfo", e);
        }
        try {
            NetworkInfo networkInfo = cm.getActiveNetworkInfo();
            return networkInfo != null && networkInfo.isConnected();
        } catch (Exception e) {
            Log.e(TAG, "检查网络状态失败", e);
            return false;
        }
    }

    @Override
    protected void handleOnDestroy() {
        isListening = false;
        isDownloading = false;
        isImporting = false;
        downloadCancelled = true;
        if (recognitionThread != null) {
            recognitionThread.interrupt();
        }
        if (downloadThread != null) {
            downloadThread.interrupt();
        }
        if (importThread != null) {
            importThread.interrupt();
        }
        // 关闭活动的 IO 流
        synchronized (streamLock) {
            try {
                if (currentInputStream != null) {
                    try { currentInputStream.close(); } catch (Exception ignore) {}
                    currentInputStream = null;
                }
            } catch (Exception ignore) {}
            try {
                if (currentOutputStream != null) {
                    try { currentOutputStream.close(); } catch (Exception ignore) {}
                    currentOutputStream = null;
                }
            } catch (Exception ignore) {}
        }
        if (audioRecord != null) {
            try {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
            } catch (Exception e) {
                // ignore
            }
            audioRecord = null;
        }
        // 等待 recognitionThread 退出后再 close recognizer，防止 native 悬空访问
        recognizerDestroyed = true;
        Thread t = recognitionThread;
        if (t != null) {
            try {
                t.join(1500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        synchronized (recognizerLock) {
            if (recognizer != null) {
                try {
                    recognizer.close();
                } catch (Exception e) {
                    // ignore
                }
                recognizer = null;
            }
        }
        if (model != null) {
            try {
                model.close();
            } catch (Exception e) {
                // ignore
            }
            model = null;
        }
        super.handleOnDestroy();
    }
}
