package com.eggli.flashcards.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.system.OsConstants
import android.util.Log
import com.eggli.flashcards.MainActivity
import libtailscale.Libtailscale
import libtailscale.VPNServiceBuilder
import java.util.UUID

/**
 * Tailscale VPN Service
 *
 * 继承 VpnService 并实现 libtailscale.IPNService 接口。
 * 必须在主进程中运行，VpnService.Builder.establish() 才能正常工作。
 *
 * 关键作用：
 * 1. 提供 VPN 隧道建立能力（通过 VpnService.Builder）
 * 2. 注册到 Go 引擎（通过 Libtailscale.requestVPN），解除 blockEngineUpdates 阻塞
 * 3. 使控制客户端（authRoutine）可以正常运行，生成 AuthURL
 */
class TailscaleVPNService : VpnService(), libtailscale.IPNService {

    private val TAG = "TailscaleVPNSvc"
    private val randomID: String = UUID.randomUUID().toString()
    private var closed = false

    companion object {
        private const val NOTIFICATION_CHANNEL_ID = "tailscale_vpn"
        private const val NOTIFICATION_ID = 1
        const val ACTION_START_VPN = "com.eggli.flashcards.START_VPN"
        const val ACTION_STOP_VPN = "com.eggli.flashcards.STOP_VPN"
    }

    override fun id(): String {
        return randomID
    }

    override fun updateVpnStatus(status: Boolean) {
        Log.i(TAG, "updateVpnStatus: $status")
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "TailscaleVPNService created in process: ${applicationInfo.processName}")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "onStartCommand: intent=${intent?.action}")

        // 启动前台服务通知，防止被系统杀死
        // VpnService 必须作为前台服务运行，否则 Android 8+ 会在后台杀死进程
        try {
            startForeground(NOTIFICATION_ID, createNotification())
            Log.i(TAG, "startForeground called successfully")
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed", e)
        }

        // 注册到 Go 引擎
        try {
            Libtailscale.requestVPN(this)
            Log.i(TAG, "requestVPN called successfully")
        } catch (e: Exception) {
            Log.e(TAG, "requestVPN failed", e)
        }

        when (intent?.action) {
            ACTION_STOP_VPN -> {
                close()
                return START_NOT_STICKY
            }
            else -> {
                return START_STICKY
            }
        }
    }

    override fun close() {
        if (closed) return
        closed = true
        Log.i(TAG, "close() called")
        disconnectVPN()
        try {
            Libtailscale.serviceDisconnect(this)
        } catch (e: Exception) {
            Log.e(TAG, "serviceDisconnect failed", e)
        }
    }

    override fun disconnectVPN() {
        stopSelf()
    }

    override fun onDestroy() {
        close()
        updateVpnStatus(false)
        super.onDestroy()
        Log.i(TAG, "onDestroy")
    }

    override fun onRevoke() {
        Log.i(TAG, "onRevoke - VPN permission revoked or network changed, attempting reconnect...")
        // 不立即 close，而是尝试重连
        // 网络切换时 Android 会调用 onRevoke，此时应该重新建立隧道
        try {
            // 通知 Go 引擎重新配置
            Libtailscale.serviceDisconnect(this)
            // 短暂等待后重新注册
            Thread.sleep(500)
            Libtailscale.requestVPN(this)
            Log.i(TAG, "onRevoke: Reconnect attempted")
        } catch (e: Exception) {
            Log.e(TAG, "onRevoke: Reconnect failed", e)
            close()
            updateVpnStatus(false)
            super.onRevoke()
        }
    }

    override fun newBuilder(): VPNServiceBuilder {
        Log.i(TAG, "newBuilder() called")
        val b: Builder = Builder()
            .setConfigureIntent(configIntent())
            .allowFamily(OsConstants.AF_INET)
            .allowFamily(OsConstants.AF_INET6)
        b.setUnderlyingNetworks(null) // 使用所有可用网络
        return VPNServiceBuilderImpl(b)
    }

    override fun protect(fd: Int): Boolean {
        return super.protect(fd)
    }

    private fun configIntent(): PendingIntent {
        return PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Tailscale VPN",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Tailscale VPN 连接状态"
                enableVibration(false)
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return androidx.core.app.NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(com.eggli.flashcards.R.mipmap.ic_launcher)
            .setContentTitle("Tailscale VPN")
            .setContentText("VPN 服务运行中")
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setCategory(androidx.core.app.NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
}

