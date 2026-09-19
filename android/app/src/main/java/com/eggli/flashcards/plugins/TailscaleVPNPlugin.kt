package com.eggli.flashcards.plugins

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.VpnService
import android.os.*
import android.util.Log
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.ConcurrentHashMap

@CapacitorPlugin(name = "TailscaleVPN")
class TailscaleVPNPlugin : Plugin() {

    private var isRunning = false
    private var serviceMessenger: Messenger? = null
    private var serviceBound = false
    private val pendingCalls = ConcurrentHashMap<Int, PluginCall>()
    private var nextCallId = 1
    private val mainHandler = Handler(Looper.getMainLooper())

    companion object {
        private const val TAG = "TailscaleVPNPlugin"

        // IPC 消息类型
        const val MSG_START = 1
        const val MSG_STOP = 2
        const val MSG_CALL_LOCAL_API = 3
        const val MSG_IS_AVAILABLE = 4

        // Bundle keys
        const val KEY_METHOD = "method"
        const val KEY_ENDPOINT = "endpoint"
        const val KEY_BODY_STR = "bodyStr"
        const val KEY_TIMEOUT = "timeout"
        const val KEY_SUCCESS = "success"
        const val KEY_ERROR = "error"
        const val KEY_STATUS_CODE = "statusCode"
        const val KEY_BODY = "body"
        const val KEY_AVAILABLE = "available"
        const val KEY_RUNNING = "running"
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.i(TAG, "Service connected")
            serviceMessenger = Messenger(service)
            serviceBound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.i(TAG, "Service disconnected")
            serviceMessenger = null
            serviceBound = false
            isRunning = false
            // 通知前端
            notifyListeners("tailscaleDisconnected", JSObject().put("reason", "service_died"))
        }
    }

    private val replyHandler = object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            val data = msg.data
            val callId = msg.arg1
            val call = pendingCalls.remove(callId)
            if (call == null) {
                Log.w(TAG, "No pending call for id=$callId")
                return
            }

            try {
                val success = data.getBoolean(KEY_SUCCESS, false)
                if (!success) {
                    val error = data.getString(KEY_ERROR) ?: "Unknown error"
                    call.reject(error)
                    return
                }

                val ret = JSObject()
                when (msg.what) {
                    MSG_START -> {
                        val running = data.getBoolean(KEY_RUNNING, false)
                        isRunning = running
                        ret.put("success", true)
                        ret.put("running", running)
                    }
                    MSG_STOP -> {
                        isRunning = false
                        ret.put("success", true)
                    }
                    MSG_CALL_LOCAL_API -> {
                        ret.put("statusCode", data.getInt(KEY_STATUS_CODE, 0))
                        ret.put("body", data.getString(KEY_BODY, ""))
                    }
                    MSG_IS_AVAILABLE -> {
                        ret.put("available", data.getBoolean(KEY_AVAILABLE, false))
                        ret.put("running", data.getBoolean(KEY_RUNNING, false))
                    }
                }
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "handleMessage error", e)
                call.reject("IPC error: ${e.message}")
            }
        }
    }

    override fun load() {
        super.load()
        Log.i(TAG, "Plugin loaded")
    }

    private fun bindToService(): Boolean {
        if (serviceBound && serviceMessenger != null) return true
        return try {
            val intent = Intent(context, Class.forName("com.eggli.flashcards.services.TailscaleRemoteService"))
            context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            // 等待绑定完成（最多2秒）
            for (i in 0..20) {
                if (serviceBound) break
                Thread.sleep(100)
            }
            serviceBound
        } catch (e: Exception) {
            Log.e(TAG, "bindToService failed", e)
            false
        }
    }

    private fun unbindFromService() {
        try {
            if (serviceBound) {
                context.unbindService(serviceConnection)
                serviceBound = false
                serviceMessenger = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "unbindFromService failed", e)
        }
    }

    private fun sendIPC(msgType: Int, call: PluginCall, dataBuilder: (Bundle) -> Unit = {}): Boolean {
        val messenger = serviceMessenger
        if (messenger == null) {
            call.reject("Tailscale service not connected")
            return false
        }

        val callId = nextCallId++
        pendingCalls[callId] = call

        // 添加超时机制：30秒后如果没收到回复，自动reject
        mainHandler.postDelayed({
            val pending = pendingCalls.remove(callId)
            if (pending != null) {
                Log.w(TAG, "IPC timeout for callId=$callId, msgType=$msgType")
                pending.reject("IPC 请求超时，请重试")
            }
        }, 30000L)

        val msg = Message.obtain(null, msgType, callId, 0)
        msg.replyTo = Messenger(replyHandler)
        val data = Bundle()
        dataBuilder(data)
        msg.data = data

        try {
            messenger.send(msg)
            return true
        } catch (e: RemoteException) {
            pendingCalls.remove(callId)
            Log.e(TAG, "IPC send failed", e)
            call.reject("IPC error: ${e.message}")
            return false
        }
    }

    @PluginMethod
    fun prepare(call: PluginCall) {
        try {
            val ctx = context.applicationContext
            val intent = VpnService.prepare(ctx)

            if (intent != null) {
                startActivityForResult(call, intent, "handleVpnPermissionResult")
                Log.i(TAG, "VPN prepare: showing permission dialog")
            } else {
                val ret = JSObject()
                ret.put("prepared", true)
                call.resolve(ret)
            }
        } catch (e: Exception) {
            Log.e(TAG, "prepare failed", e)
            call.reject("Failed to prepare VPN: ${e.message}")
        }
    }

    @ActivityCallback
    fun handleVpnPermissionResult(call: PluginCall, result: ActivityResult) {
        val ret = JSObject()
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            ret.put("prepared", true)
            call.resolve(ret)
        } else {
            ret.put("prepared", false)
            ret.put("error", "VPN 权限被拒绝")
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        // 先检查VPN权限
        val ctx = context.applicationContext
        val intent = VpnService.prepare(ctx)
        if (intent != null) {
            call.reject("VPN 未授权，请先调用 prepare()")
            return
        }

        // 读取可选的 authKey 参数
        val authKey = call.getString("authKey") ?: ""

        // 绑定远程服务并发送start命令
        Thread {
            try {
                if (!bindToService()) {
                    mainHandler.post { call.reject("无法连接到 Tailscale 服务") }
                    return@Thread
                }

                mainHandler.post {
                    sendIPC(MSG_START, call) { data ->
                        if (authKey.isNotEmpty()) {
                            data.putString("authKey", authKey)
                        }
                    }
                }
            } catch (e: Exception) {
                mainHandler.post { call.reject("启动失败: ${e.message}") }
            }
        }.start()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        if (serviceBound) {
            sendIPC(MSG_STOP, call)
        } else {
            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        if (!serviceBound) {
            // 尝试绑定
            Thread {
                if (bindToService()) {
                    mainHandler.post {
                        sendIPC(MSG_IS_AVAILABLE, call)
                    }
                } else {
                    mainHandler.post {
                        val ret = JSObject()
                        ret.put("available", false)
                        ret.put("running", false)
                        call.resolve(ret)
                    }
                }
            }.start()
        } else {
            sendIPC(MSG_IS_AVAILABLE, call)
        }
    }

    @PluginMethod
    fun callLocalAPI(call: PluginCall) {
        val method = call.getString("method") ?: "GET"
        val endpoint = call.getString("endpoint") ?: "/"
        val bodyStr = call.getString("body") ?: ""
        val timeout = call.getInt("timeout") ?: 30000

        sendIPC(MSG_CALL_LOCAL_API, call) { data ->
            data.putString(KEY_METHOD, method)
            data.putString(KEY_ENDPOINT, endpoint)
            data.putString(KEY_BODY_STR, bodyStr)
            data.putLong(KEY_TIMEOUT, timeout.toLong())
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        callLocalAPIInternal(call, "GET", "/localapi/v0/status")
    }

    @PluginMethod
    fun getPrefs(call: PluginCall) {
        callLocalAPIInternal(call, "GET", "/localapi/v0/prefs")
    }

    @PluginMethod
    fun editPrefs(call: PluginCall) {
        val body = call.getString("body") ?: "{}"
        Log.i(TAG, "editPrefs body: $body")
        callLocalAPIInternal(call, "PATCH", "/localapi/v0/prefs", body)
    }

    @PluginMethod
    fun startLoginInteractive(call: PluginCall) {
        val authKey = call.getString("authKey") ?: ""
        if (authKey.isNotEmpty()) {
            val body = """{"AuthKey":"$authKey","AuthKeySet":true}"""
            Log.i(TAG, "startLoginInteractive with authKey")
            callLocalAPIInternal(call, "POST", "/localapi/v0/login-interactive", body)
        } else {
            callLocalAPIInternal(call, "POST", "/localapi/v0/login-interactive")
        }
    }

    @PluginMethod
    fun startLogout(call: PluginCall) {
        callLocalAPIInternal(call, "POST", "/localapi/v0/logout")
    }

    @PluginMethod
    fun listPeers(call: PluginCall) {
        callLocalAPIInternal(call, "GET", "/localapi/v0/status")
    }

    @PluginMethod
    fun up(call: PluginCall) {
        callLocalAPIInternal(call, "PATCH", "/localapi/v0/prefs", """{"WantRunning":true}""")
    }

    @PluginMethod
    fun down(call: PluginCall) {
        callLocalAPIInternal(call, "PATCH", "/localapi/v0/prefs", """{"WantRunning":false}""")
    }

    @PluginMethod
    fun getLastNotification(call: PluginCall) {
        val ret = JSObject()
        ret.put("data", "")
        call.resolve(ret)
    }

    private fun callLocalAPIInternal(call: PluginCall, method: String, endpoint: String, body: String = "") {
        sendIPC(MSG_CALL_LOCAL_API, call) { data ->
            data.putString(KEY_METHOD, method)
            data.putString(KEY_ENDPOINT, endpoint)
            data.putString(KEY_BODY_STR, body)
            data.putLong(KEY_TIMEOUT, 30000L)
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try { unbindFromService() } catch (_: Exception) {}
    }
}
