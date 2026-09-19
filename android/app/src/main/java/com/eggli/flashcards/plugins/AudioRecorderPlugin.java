package com.eggli.flashcards.plugins;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "AudioRecorder",
    permissions = {
        @Permission(
            strings = {Manifest.permission.RECORD_AUDIO},
            alias = "microphone"
        )
    }
)
public class AudioRecorderPlugin extends Plugin {

    private static final String TAG = "AudioRecorderPlugin";
    // 最大录音时长（秒），超过自动停止，防止 ByteArrayOutputStream 无限增长导致 OOM
    private static final int MAX_RECORDING_SECONDS = 120;
    // 缓冲区字节数硬上限（兜底保护，与采样率无关）
    private static final long MAX_BUFFER_BYTES = 8L * 1024 * 1024; // 8MB

    private AudioRecord audioRecord;
    private volatile boolean isRecording = false;
    private Thread recordingThread;
    private java.io.ByteArrayOutputStream audioBuffer;
    // 已录制字节数（独立计数，避免 ByteArrayOutputStream 内部计数依赖）
    private volatile long recordedBytes = 0;
    // 录音是否因达到上限而自动停止
    private volatile boolean autoStoppedByLimit = false;

    @PluginMethod
    public void start(PluginCall call) {
        if (isRecording) {
            call.reject("已经在录音中");
            return;
        }

        int sampleRate = call.getInt("sampleRate", 16000);
        int channelConfig = AudioFormat.CHANNEL_IN_MONO;
        int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
        int bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat);

        if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            call.reject("无法获取录音缓冲区大小");
            return;
        }

        // 根据采样率计算本次录音的缓冲区上限（字节）
        // 16bit mono: 每秒 = sampleRate * 2 字节
        final long maxBytesByDuration = (long) sampleRate * 2 * MAX_RECORDING_SECONDS;
        final long maxBytes = Math.min(maxBytesByDuration, MAX_BUFFER_BYTES);

        try {
            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize * 2
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                call.reject("录音器初始化失败，请检查麦克风权限");
                return;
            }

            audioBuffer = new java.io.ByteArrayOutputStream();
            recordedBytes = 0;
            autoStoppedByLimit = false;
            isRecording = true;
            audioRecord.startRecording();

            recordingThread = new Thread(() -> {
                android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO);
                byte[] buffer = new byte[bufferSize];
                while (isRecording) {
                    int bytesRead;
                    try {
                        bytesRead = audioRecord.read(buffer, 0, buffer.length);
                    } catch (IllegalStateException ise) {
                        // audioRecord 被并发 release
                        break;
                    }
                    if (bytesRead > 0) {
                        // 检查是否超过缓冲区上限，防止 OOM
                        if (recordedBytes + bytesRead > maxBytes) {
                            // 只写入剩余可容纳的部分，保证不超限
                            int remain = (int) Math.max(0, maxBytes - recordedBytes);
                            if (remain > 0) {
                                audioBuffer.write(buffer, 0, remain);
                                recordedBytes += remain;
                            }
                            autoStoppedByLimit = true;
                            isRecording = false;
                            break;
                        }
                        audioBuffer.write(buffer, 0, bytesRead);
                        recordedBytes += bytesRead;
                    } else if (bytesRead == AudioRecord.ERROR_INVALID_OPERATION) {
                        break;
                    } else if (bytesRead == AudioRecord.ERROR_BAD_VALUE) {
                        break;
                    }
                }
            });
            recordingThread.setPriority(Thread.MAX_PRIORITY);
            recordingThread.start();

            call.resolve();
        } catch (SecurityException e) {
            call.reject("麦克风权限被拒绝，请在系统设置中允许");
        } catch (Exception e) {
            call.reject("录音启动失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (!isRecording) {
            call.reject("当前未在录音");
            return;
        }

        isRecording = false;

        Thread t = recordingThread;
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
            // 释放资源时忽略异常
        }

        byte[] audioData = audioBuffer != null ? audioBuffer.toByteArray() : new byte[0];
        String base64Audio = Base64.encodeToString(audioData, Base64.NO_WRAP);

        JSObject result = new JSObject();
        result.put("data", base64Audio);
        result.put("size", audioData.length);
        result.put("sampleRate", 16000);
        result.put("channels", 1);
        result.put("bitsPerSample", 16);
        result.put("autoStopped", autoStoppedByLimit);
        if (autoStoppedByLimit) {
            result.put("message", "录音已达到最大时长，自动停止");
        }
        call.resolve(result);

        // 释放缓冲区内存
        if (audioBuffer != null) {
            try { audioBuffer.close(); } catch (Exception ignore) {}
            audioBuffer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        isRecording = false;
        Thread t = recordingThread;
        if (t != null) {
            try { t.join(1500); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
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
        if (audioBuffer != null) {
            try { audioBuffer.close(); } catch (Exception ignore) {}
            audioBuffer = null;
        }
        super.handleOnDestroy();
    }
}