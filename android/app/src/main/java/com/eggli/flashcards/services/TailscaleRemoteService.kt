package com.eggli.flashcards.services

import android.app.Service
import android.content.Intent
import android.os.*
import android.util.Log
import com.eggli.flashcards.plugins.AndroidAppContext
import libtailscale.Libtailscale
import java.io.ByteArrayInputStream

/**
 * Tailscale 引擎服务
 * 
 * 运行在主进程中，与 TailscaleVPNService 在同一进程，
 * 使 Libtailscale JNI 调用可以正常工作。
 * 
 * 通过 Messenger 进行 IPC 通信。
 */
class TailscaleRemoteService : Service() {

    private val TAG = "TailscaleRemoteSvc"
    private var messenger: Messenger? = null
    private var tailscaleApp: libtailscale.Application? = null
    private var isRunning = false
    // 持久化 isRunning 状态，防止服务被系统销毁重建后丢失
    private val runningPrefs by lazy { getSharedPreferences("tailscale_running_state", MODE_PRIVATE) }
    private fun saveRunningState(running: Boolean) {
        runningPrefs.edit().putBoolean("isRunning", running).commit()
    }
    private fun restoreRunningState(): Boolean {
        return runningPrefs.getBoolean("isRunning", false)
    }
    private val handlerThread = HandlerThread("TailscaleWorker").apply { start() }

    companion object {
        const val MSG_START = 1
        const val MSG_STOP = 2
        const val MSG_CALL_LOCAL_API = 3
        const val MSG_IS_AVAILABLE = 4

        const val KEY_SUCCESS = "success"
        const val KEY_ERROR = "error"
        const val KEY_STATUS_CODE = "statusCode"
        const val KEY_BODY = "body"
        const val KEY_AVAILABLE = "available"
        const val KEY_RUNNING = "running"
        const val KEY_METHOD = "method"
        const val KEY_ENDPOINT = "endpoint"
        const val KEY_BODY_STR = "bodyStr"
        const val KEY_TIMEOUT = "timeout"
    }

    private val serviceHandler = object : Handler(handlerThread.looper) {
        override fun handleMessage(msg: Message) {
            when (msg.what) {
                MSG_START -> handleStart(msg)
                MSG_STOP -> handleStop(msg)
                MSG_CALL_LOCAL_API -> handleCallLocalAPI(msg)
                MSG_IS_AVAILABLE -> handleIsAvailable(msg)
                else -> super.handleMessage(msg)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "TailscaleRemoteService created in process: ${applicationInfo.processName}")
        // 恢复 isRunning 状态（服务可能被系统销毁重建）
        isRunning = restoreRunningState()
        Log.i(TAG, "onCreate: restored isRunning=$isRunning")
        messenger = Messenger(serviceHandler)
    }

    override fun onBind(intent: Intent?): IBinder? {
        Log.i(TAG, "onBind")
        return messenger?.binder
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "onStartCommand: isRunning=$isRunning, tailscaleApp=${if (tailscaleApp != null) "not null" else "null"}")

        // 如果 isRunning=true 但 tailscaleApp=null，说明服务被系统销毁重建
        // 需要主动恢复引擎，而不是仅返回 START_STICKY 等待用户手动触发
        if (isRunning && tailscaleApp == null) {
            Log.i(TAG, "onStartCommand: Engine was running but lost, auto-recovering...")
            // 在后台线程中恢复引擎，避免阻塞 onStartCommand
            handlerThread.looper.thread.let {
                Thread {
                    try {
                        val dataDir = filesDir.resolve("tailscale")
                        if (!dataDir.exists()) dataDir.mkdirs()

                        Libtailscale.touch()
                        try {
                            android.system.Os.setenv("TS_ASSUME_NETWORK_UP_FOR_TEST", "1", true)
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to set env: ${e.message}")
                        }

                        // 读取已保存的 Auth Key，用于自动恢复时认证
                        try {
                            val akFile = java.io.File(filesDir, "tailscale/auth_key")
                            if (akFile.exists()) {
                                val savedAuthKey = akFile.readText(Charsets.UTF_8).trim()
                                if (savedAuthKey.isNotEmpty()) {
                                    android.system.Os.setenv("TS_AUTH_KEY", savedAuthKey, true)
                                    Log.i(TAG, "onStartCommand: Restored TS_AUTH_KEY from file for auto-recovery")
                                }
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "onStartCommand: Failed to read auth_key file: ${e.message}")
                        }

                        val appCtx = AndroidAppContext(this)
                        val app = Libtailscale.start(
                            dataDir.absolutePath,
                            filesDir.absolutePath,
                            false,
                            appCtx
                        )
                        tailscaleApp = app
                        Log.i(TAG, "onStartCommand: Engine recovered successfully")

                        // 启动 VPN 服务
                        val vpnIntent = Intent(this, TailscaleVPNService::class.java)
                        vpnIntent.action = TailscaleVPNService.ACTION_START_VPN
                        startService(vpnIntent)
                        Thread.sleep(1000)

                        // 检查登录状态，设置 WantRunning=true
                        val statusResp = app.callLocalAPI(5000, "GET", "/localapi/v0/status", null)
                        val statusBody = statusResp.bodyBytes()
                        val statusStr = if (statusBody != null) String(statusBody, Charsets.UTF_8) else ""
                        val alreadyLoggedIn = statusStr.contains("\"BackendState\":\"Running\"") ||
                            statusStr.contains("\"BackendState\": \"Running\"") ||
                            statusStr.contains("\"BackendState\":\"Stopped\"") ||
                            statusStr.contains("\"BackendState\": \"Stopped\"") ||
                            statusStr.contains("\"BackendState\":\"Starting\"") ||
                            statusStr.contains("\"BackendState\": \"Starting\"")
                        Log.i(TAG, "onStartCommand: alreadyLoggedIn=$alreadyLoggedIn")

                        // 设置 WantRunning=true
                        val prefsJson = """{"WantRunning":true,"WantRunningSet":true,"LoggedOut":false,"LoggedOutSet":true}"""
                        val prefsStream: libtailscale.InputStream? = object : libtailscale.InputStream {
                            private val bais = ByteArrayInputStream(prefsJson.toByteArray(Charsets.UTF_8))
                            override fun read(): ByteArray? {
                                val b = ByteArray(4096)
                                val i = bais.read(b)
                                return if (i == -1) null else b.sliceArray(0 until i)
                            }
                            override fun close() { bais.close() }
                        }
                        app.callLocalAPI(10000, "PATCH", "/localapi/v0/prefs", prefsStream)

                        // 不再自动调用 login-interactive，由前端根据是否有 Auth Key 决定登录方式
                        if (!alreadyLoggedIn) {
                            Log.i(TAG, "onStartCommand: Not logged in, waiting for user to trigger login (Auth Key or browser)")
                        }
                        Log.i(TAG, "onStartCommand: Recovery complete")
                    } catch (e: Exception) {
                        Log.e(TAG, "onStartCommand: Recovery failed", e)
                    }
                }.start()
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "onDestroy")
        handlerThread.quitSafely()
    }

    private fun reply(msg: Message, data: Bundle) {
        try {
            val replyMsg = Message.obtain(null, msg.what, msg.arg1, 0)
            replyMsg.data = data
            msg.replyTo?.send(replyMsg)
        } catch (e: RemoteException) {
            Log.e(TAG, "reply failed: ${e.message}")
        }
    }

    private fun replyError(msg: Message, error: String) {
        val b = Bundle()
        b.putBoolean(KEY_SUCCESS, false)
        b.putString(KEY_ERROR, error)
        reply(msg, b)
    }

    private fun handleStart(msg: Message) {
        Log.i(TAG, "handleStart: isRunning=$isRunning, tailscaleApp=${if (tailscaleApp != null) "not null" else "null"}")
        // 读取可选的 authKey
        val authKey = msg.data?.getString("authKey", "") ?: ""
        if (authKey.isNotEmpty()) {
            Log.i(TAG, "handleStart: Auth key provided, will use for login")
        }
        if (isRunning && tailscaleApp != null) {
            val b = Bundle()
            b.putBoolean(KEY_SUCCESS, true)
            b.putBoolean(KEY_RUNNING, true)
            reply(msg, b)
            // 如果提供了 Auth Key 且引擎正在运行，设置 TS_AUTH_KEY 并重启引擎
            if (authKey.isNotEmpty()) {
                Log.i(TAG, "handleStart: Engine already running, restarting with TS_AUTH_KEY")
                try {
                    // 1. 设置环境变量 + 写入文件（文件方式可靠传递到 Go）
                    android.system.Os.setenv("TS_AUTH_KEY", authKey, true)
                    try {
                        val akFile = java.io.File(filesDir, "tailscale/auth_key")
                        akFile.parentFile?.mkdirs()
                        akFile.writeText(authKey, Charsets.UTF_8)
                    } catch (e: Exception) {
                        Log.w(TAG, "handleStart: Failed to write auth key file: ${e.message}")
                    }
                    // 2. 清理旧引擎
                    tailscaleApp = null
                    isRunning = false
                    saveRunningState(false)
                    Log.i(TAG, "handleStart: Engine cleaned, will re-initialize below")
                } catch (e: Exception) {
                    Log.e(TAG, "handleStart: Failed to restart engine with auth key", e)
                }
            }
            // 如果不需要重启，直接返回
            if (isRunning && tailscaleApp != null) {
                return
            }
        }
        // 如果 isRunning=true 但 tailscaleApp=null，说明服务被系统销毁重建
        // Go 引擎可能仍在运行，需要重新初始化 tailscaleApp 以恢复 local API 访问
        // 不清除 statestore 数据，让引擎从保存的登录状态恢复

        try {
            val dataDir = filesDir.resolve("tailscale")
            if (!dataDir.exists()) dataDir.mkdirs()

            // 注意：不再清除 statestore 数据！
            // 之前清除是为了解决 want=false 死锁问题，但现在已在 Go 源码 backend.go 中
            // 通过 WantRunning=true + AssumeNetworkUp 修复了死锁。
            // 保留 statestore 数据可以让引擎恢复登录状态，避免每次重启都需要重新登录。
            // 引擎会从 statestore-ipn-android 中读取已保存的 prefs 和登录凭据。

            Log.i(TAG, "Step 1: Libtailscale.touch()")
            Libtailscale.touch()
            Log.i(TAG, "Step 1 OK")

            // Step 1.5: 设置 TS_ASSUME_NETWORK_UP_FOR_TEST=1 环境变量
            // 根因分析（Tailscale 1.101.0 源码 ipnlocal/local.go）：
            // shouldPauseControlClientLocked() 在 interfaceState.AnyInterfaceUp() 返回 false 时
            // （Android 上网络监控器可能无法正确检测网络接口）返回 true，
            // 导致控制客户端以 StartPaused=true 启动，authRoutine 被暂停。
            // authRoutine 被暂停 → AuthURL 无法生成 → 状态停留在 NeedsLogin
            // → blockEngineUpdates(true) → 无法解除阻塞 → 死锁
            // 设置此环境变量使 AssumeNetworkUp() 返回 true，跳过网络检查
            try {
                android.system.Os.setenv("TS_ASSUME_NETWORK_UP_FOR_TEST", "1", true)
                Log.i(TAG, "Step 1.5: Set TS_ASSUME_NETWORK_UP_FOR_TEST=1")
            } catch (e: Exception) {
                Log.w(TAG, "Step 1.5: Failed to set env: ${e.message}")
            }

            // 如果提供了 Auth Key，设为环境变量让引擎启动时自动使用
            if (authKey.isNotEmpty()) {
                try {
                    android.system.Os.setenv("TS_AUTH_KEY", authKey, true)
                    Log.i(TAG, "Step 1.6: Set TS_AUTH_KEY for auto-login")
                    // 同时写入文件，作为跨 Go/Kotlin 边界的可靠传递机制
                    try {
                        val akFile = java.io.File(filesDir, "tailscale/auth_key")
                        akFile.parentFile?.mkdirs()
                        akFile.writeText(authKey, Charsets.UTF_8)
                        Log.i(TAG, "Step 1.6: Auth key written to file: ${akFile.absolutePath}")
                    } catch (e: Exception) {
                        Log.w(TAG, "Step 1.6: Failed to write auth key file: ${e.message}")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Step 1.6: Failed to set TS_AUTH_KEY: ${e.message}")
                }
            }

            Log.i(TAG, "Step 2: Create AndroidAppContext")
            val appCtx = AndroidAppContext(this)
            Log.i(TAG, "Step 2 OK")

            Log.i(TAG, "Step 3: Libtailscale.start()")
            Log.i(TAG, "  dataDir: ${dataDir.absolutePath}")
            Log.i(TAG, "  directFileRoot: ${filesDir.absolutePath}")
            val app = Libtailscale.start(
                dataDir.absolutePath,
                filesDir.absolutePath,
                false,
                appCtx
            )
            tailscaleApp = app
            isRunning = true
            saveRunningState(true)
            Log.i(TAG, "Step 3 OK: engine started")

            // Step 3.5: 启动 TailscaleVPNService 注册到 Go 引擎 + 设置 WantRunning=true
            // 关键流程：
            // 1. 启动 TailscaleVPNService（真正的 VpnService），调用 requestVPN 注册到 Go 引擎
            //    Go 引擎获得能建立 VPN 隧道的 IPNService（newBuilder 返回有效 builder）
            // 2. 设置 WantRunning=true，引擎尝试 reconfig → 调用 newBuilder → establish VPN 隧道
            //    → blockEngineUpdates(false) → setPaused(false) → authRoutine 运行 → 生成 AuthURL
            // 注意：SimpleIPNService 的 newBuilder 返回 null，引擎无法建立隧道，不会 unblock
            try {
                Log.i(TAG, "Step 3.5a: Starting TailscaleVPNService for real VPN tunnel")
                val vpnIntent = Intent(this, TailscaleVPNService::class.java)
                vpnIntent.action = TailscaleVPNService.ACTION_START_VPN
                startService(vpnIntent)
                Log.i(TAG, "Step 3.5a: TailscaleVPNService start requested, waiting for it...")
                // 等待 TailscaleVPNService 启动并调用 requestVPN
                Thread.sleep(1000)
                Log.i(TAG, "Step 3.5a OK: TailscaleVPNService should be registered now")
            } catch (e: Exception) {
                Log.e(TAG, "Step 3.5a failed: TailscaleVPNService start error", e)
            }

            // Step 3.5b: 检查引擎是否已从 statestore 恢复登录状态
            // 如果已登录（BackendState=Running/Stopped），仅设置 WantRunning=true 恢复隧道
            // 如果未登录（BackendState=NeedsLogin），才调用 login-interactive
            var alreadyLoggedIn = false
            try {
                Log.i(TAG, "Step 3.5b: Checking login status via LocalAPI")
                val statusResp = app.callLocalAPI(5000, "GET", "/localapi/v0/status", null)
                val statusBody = statusResp.bodyBytes()
                val statusStr = if (statusBody != null) String(statusBody, Charsets.UTF_8) else ""
                Log.i(TAG, "Step 3.5b: Status response: $statusStr")

                // 检查 BackendState
                if (statusStr.contains("\"BackendState\":\"Running\"") ||
                    statusStr.contains("\"BackendState\": \"Running\"") ||
                    statusStr.contains("\"BackendState\":\"Stopped\"") ||
                    statusStr.contains("\"BackendState\": \"Stopped\"") ||
                    statusStr.contains("\"BackendState\":\"Starting\"") ||
                    statusStr.contains("\"BackendState\": \"Starting\"")) {
                    alreadyLoggedIn = true
                    Log.i(TAG, "Step 3.5b: Already logged in (BackendState is Running/Stopped/Starting), skipping login-interactive")
                } else {
                    Log.i(TAG, "Step 3.5b: Not logged in (BackendState=${statusStr.substringAfter("BackendState").take(30)}), will call login-interactive")
                }

                // 无论如何都设置 WantRunning=true（恢复隧道）
                val prefsJson = if (authKey.isNotEmpty()) {
                    """{"WantRunning":true,"WantRunningSet":true,"LoggedOut":false,"LoggedOutSet":true,"AuthKey":"$authKey","AuthKeySet":true}"""
                } else {
                    """{"WantRunning":true,"WantRunningSet":true,"LoggedOut":false,"LoggedOutSet":true}"""
                }
                val prefsStream: libtailscale.InputStream? = object : libtailscale.InputStream {
                    private val bais = ByteArrayInputStream(prefsJson.toByteArray(Charsets.UTF_8))
                    override fun read(): ByteArray? {
                        val b = ByteArray(4096)
                        val i = bais.read(b)
                        return if (i == -1) null else b.sliceArray(0 until i)
                    }
                    override fun close() { bais.close() }
                }
                val prefsResp = app.callLocalAPI(10000, "PATCH", "/localapi/v0/prefs", prefsStream)
                val prefsBody = prefsResp.bodyBytes()
                val prefsStr = if (prefsBody != null) String(prefsBody, Charsets.UTF_8) else ""
                Log.i(TAG, "Step 3.5b OK: PATCH /prefs code=${prefsResp.statusCode()}, body=$prefsStr")
            } catch (e: Exception) {
                Log.e(TAG, "Step 3.5b failed: status check/setPrefs error", e)
            }

            // Step 3.5c-d: 如果提供了 Auth Key（引擎已用 TS_AUTH_KEY 启动），跳过
            // login-interactive 调用，因为它会触发浏览器式登录覆盖已有的 Auth Key 登录
            if (!alreadyLoggedIn) {
                if (authKey.isNotEmpty()) {
                    Log.i(TAG, "Step 3.5c-d: Auth key provided, engine will auto-login, skipping login-interactive calls")
                    // 等待引擎用 Auth Key 完成登录（最长 30 秒）
                    var autoLoginSucceeded = false
                    for (retry in 1..15) {
                        Thread.sleep(2000)
                        try {
                            val checkResp = app.callLocalAPI(5000, "GET", "/localapi/v0/status", null)
                            val checkBody = checkResp.bodyBytes()
                            val checkStr = if (checkBody != null) String(checkBody, Charsets.UTF_8) else ""
                            if (checkStr.contains("\"BackendState\":\"Running\"") ||
                                checkStr.contains("\"BackendState\": \"Running\"") ||
                                checkStr.contains("\"BackendState\":\"Stopped\"") ||
                                checkStr.contains("\"BackendState\": \"Stopped\"")) {
                                Log.i(TAG, "Step 3.5c-d: Auto-login succeeded! BackendState is Running/Stopped")
                                autoLoginSucceeded = true
                                break
                            }
                            Log.i(TAG, "Step 3.5c-d: Auto-login in progress (attempt $retry/15)...")
                        } catch (e: Exception) {
                            Log.w(TAG, "Step 3.5c-d: Status check failed: ${e.message}")
                        }
                    }
                    // 如果轮询超时仍未登录成功，尝试通过 login-interactive 使用 Auth Key 强制登录
                    if (!autoLoginSucceeded) {
                        Log.i(TAG, "Step 3.5c-d: Auto-login timeout, trying login-interactive with auth key...")
                        try {
                            val loginBody = """{"AuthKey":"$authKey","AuthKeySet":true}"""
                            val loginStream: libtailscale.InputStream? = object : libtailscale.InputStream {
                                private val bais = ByteArrayInputStream(loginBody.toByteArray(Charsets.UTF_8))
                                override fun read(): ByteArray? {
                                    val b = ByteArray(4096)
                                    val i = bais.read(b)
                                    return if (i == -1) null else b.sliceArray(0 until i)
                                }
                                override fun close() { bais.close() }
                            }
                            val loginResp = app.callLocalAPI(10000, "POST", "/localapi/v0/login-interactive", loginStream)
                            Log.i(TAG, "Step 3.5c-d: login-interactive with auth key code=${loginResp.statusCode()}")
                            // 等待登录完成
                            Thread.sleep(3000)
                        } catch (e: Exception) {
                            Log.e(TAG, "Step 3.5c-d: login-interactive with auth key failed", e)
                        }
                    }
                } else {
                    // 无 Auth Key：调用 login-interactive 生成 AuthURL（浏览器登录）
                    Log.i(TAG, "Step 3.5c: calling login-interactive")
                    val loginResp = app.callLocalAPI(10000, "POST", "/localapi/v0/login-interactive", null)
                    Log.i(TAG, "Step 3.5c OK: login-interactive code=${loginResp.statusCode()}")

                    // Step 3.5d: 等待 VPN tunnel 完全建立后，再次 editPrefs + login-interactive
                    try {
                        Log.i(TAG, "Step 3.5d: Waiting 3s for VPN tunnel to establish, then retry editPrefs + login")
                        Thread.sleep(3000)

                        val retryPrefsJson = if (authKey.isNotEmpty()) {
                            """{"WantRunning":true,"WantRunningSet":true,"LoggedOut":false,"LoggedOutSet":true,"AuthKey":"$authKey","AuthKeySet":true}"""
                        } else {
                            """{"WantRunning":true,"WantRunningSet":true,"LoggedOut":false,"LoggedOutSet":true}"""
                        }
                        val retryPrefsStream: libtailscale.InputStream? = object : libtailscale.InputStream {
                            private val bais = ByteArrayInputStream(retryPrefsJson.toByteArray(Charsets.UTF_8))
                            override fun read(): ByteArray? {
                                val b = ByteArray(4096)
                                val i = bais.read(b)
                                return if (i == -1) null else b.sliceArray(0 until i)
                            }
                            override fun close() { bais.close() }
                        }
                        val retryResp = app.callLocalAPI(10000, "PATCH", "/localapi/v0/prefs", retryPrefsStream)
                        Log.i(TAG, "Step 3.5d: Retry editPrefs code=${retryResp.statusCode()}")

                        val retryLoginResp = app.callLocalAPI(10000, "POST", "/localapi/v0/login-interactive", null)
                        Log.i(TAG, "Step 3.5d: Retry login-interactive code=${retryLoginResp.statusCode()}")

                        Thread.sleep(2000)

                        val statusResp = app.callLocalAPI(10000, "GET", "/localapi/v0/status", null)
                        val statusBody = statusResp.bodyBytes()
                        val statusStr = if (statusBody != null) String(statusBody, Charsets.UTF_8) else ""
                        val hasAuthURL = statusStr.contains("\"AuthURL\":") && !statusStr.contains("\"AuthURL\": \"\"")
                        Log.i(TAG, "Step 3.5d: AuthURL=${if (hasAuthURL) "FOUND" else "empty"}")
                    } catch (e: Exception) {
                        Log.e(TAG, "Step 3.5d failed", e)
                    }
                }
            } else {
                // 已登录：等待隧道建立，不需要 login-interactive
                Log.i(TAG, "Step 3.5c-d: Skipped (already logged in), waiting for VPN tunnel to establish...")
                Thread.sleep(2000)
                // 验证隧道是否已建立
                try {
                    val verifyResp = app.callLocalAPI(5000, "GET", "/localapi/v0/status", null)
                    val verifyBody = verifyResp.bodyBytes()
                    val verifyStr = if (verifyBody != null) String(verifyBody, Charsets.UTF_8) else ""
                    Log.i(TAG, "Step 3.5c-d: Post-restore status: ${verifyStr.take(200)}")
                } catch (e: Exception) {
                    Log.w(TAG, "Step 3.5c-d: Status verify failed: ${e.message}")
                }
            }

            // 启用控制客户端详细日志（用于诊断登录问题）
            try {
                app.setClientLoggingEnabled(true)
                Log.i(TAG, "Step 3.1: client logging enabled")
            } catch (e: Exception) {
                Log.w(TAG, "setClientLoggingEnabled failed: ${e.message}")
            }

            // 设置通知监听（mask=0 避免触发 NotifyRateLimit 兼容性错误）
            try {
                app.watchNotifications(0, object : libtailscale.NotificationCallback {
                    override fun onNotify(bytes: ByteArray?) {
                        if (bytes != null) {
                            Log.i(TAG, "Notification: ${String(bytes, Charsets.UTF_8)}")
                        }
                    }
                })
            } catch (e: Exception) {
                Log.w(TAG, "watchNotifications failed: ${e.message}")
            }

            val b = Bundle()
            b.putBoolean(KEY_SUCCESS, true)
            b.putBoolean(KEY_RUNNING, true)
            reply(msg, b)

        } catch (e: Exception) {
            Log.e(TAG, "handleStart failed", e)
            replyError(msg, e.message ?: "启动失败")
        } catch (e: Error) {
            Log.e(TAG, "handleStart native error", e)
            replyError(msg, "Native error: ${e.message}")
        }
    }

    private fun handleStop(msg: Message) {
        Log.i(TAG, "handleStop")
        tailscaleApp = null
        isRunning = false
        saveRunningState(false)
        val b = Bundle()
        b.putBoolean(KEY_SUCCESS, true)
        reply(msg, b)
    }

    private fun handleIsAvailable(msg: Message) {
        val b = Bundle()
        b.putBoolean(KEY_SUCCESS, true)
        b.putBoolean(KEY_AVAILABLE, true)
        b.putBoolean(KEY_RUNNING, isRunning)
        reply(msg, b)
    }

    private fun handleCallLocalAPI(msg: Message) {
        val app = tailscaleApp
        if (app == null) {
            replyError(msg, "Tailscale not running")
            return
        }

        val data = msg.data
        val method = data.getString(KEY_METHOD) ?: "GET"
        val endpoint = data.getString(KEY_ENDPOINT) ?: "/"
        val bodyStr = data.getString(KEY_BODY_STR) ?: ""
        val timeout = data.getLong(KEY_TIMEOUT, 30000L)

        try {
            // 创建 InputStream 适配器
            val bodyStream: libtailscale.InputStream? = if (bodyStr.isNotEmpty()) {
                object : libtailscale.InputStream {
                    private val bais = ByteArrayInputStream(bodyStr.toByteArray(Charsets.UTF_8))
                    override fun read(): ByteArray? {
                        val b = ByteArray(4096)
                        val i = bais.read(b)
                        return if (i == -1) null else b.sliceArray(0 until i)
                    }
                    override fun close() { bais.close() }
                }
            } else null

            Log.i(TAG, "LocalAPI: $method $endpoint")
            val response = app.callLocalAPI(timeout, method, endpoint, bodyStream)
            val b = Bundle()
            b.putBoolean(KEY_SUCCESS, true)
            b.putInt(KEY_STATUS_CODE, response.statusCode().toInt())
            val bodyBytes = response.bodyBytes()
            val bodyStr = if (bodyBytes != null) String(bodyBytes, Charsets.UTF_8) else ""
            // 截取前 500 字符记录日志，帮助诊断
            val logPreview = if (bodyStr.length > 500) bodyStr.substring(0, 500) + "..." else bodyStr
            Log.i(TAG, "LocalAPI response [$method $endpoint]: code=${response.statusCode()}, body=$logPreview")
            b.putString(KEY_BODY, bodyStr)
            reply(msg, b)
        } catch (e: Exception) {
            Log.e(TAG, "LocalAPI failed", e)
            replyError(msg, e.message ?: "LocalAPI failed")
        } catch (e: Error) {
            Log.e(TAG, "LocalAPI native error", e)
            replyError(msg, "Native error: ${e.message}")
        }
    }
}
