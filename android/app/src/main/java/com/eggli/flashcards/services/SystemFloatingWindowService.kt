package com.eggli.flashcards.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat

class SystemFloatingWindowService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 2
        private const val CHANNEL_ID = "system_floating_window"
        private const val CHANNEL_NAME = "系统悬浮窗"
        private var windowManager: WindowManager? = null
        private var floatingView: View? = null
        private var webView: WebView? = null
        private var isShowing = false

        fun isShowing(): Boolean = isShowing

        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

        fun startService(context: Context) {
            if (!canDrawOverlays(context)) return
            val intent = Intent(context, SystemFloatingWindowService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, SystemFloatingWindowService::class.java)
            context.stopService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        showFloatingWindow()
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        hideFloatingWindow()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "系统悬浮窗快速录入服务"
                enableVibration(false)
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("快速录入已开启")
            .setContentText("点击其他应用的悬浮窗录入知识点")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()
    }

    private fun showFloatingWindow() {
        if (isShowing) return
        if (!canDrawOverlays(this)) return

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        // 计算悬浮窗尺寸（dp → px）
        val widthDp = 280
        val heightDp = 480
        val widthPx = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, widthDp.toFloat(), resources.displayMetrics
        ).toInt()
        val heightPx = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, heightDp.toFloat(), resources.displayMetrics
        ).toInt()

        // 创建 WebView
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            webChromeClient = WebChromeClient()
            webViewClient = WebViewClient()
            // 加载本地打包后的悬浮窗页面（Capacitor built 路径）
            loadUrl("file:///android_asset/public/floating-window.html")
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
        }

        // WindowManager.LayoutParams
        val layoutParams = WindowManager.LayoutParams(
            widthPx,
            heightPx,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            x = 0
            y = 0
        }

        // 设置触摸拖拽
        setupDragListener(webView!!, layoutParams)

        windowManager?.addView(webView, layoutParams)
        floatingView = webView
        isShowing = true
    }

    private fun setupDragListener(view: View, params: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        isDragging = true
                        params.x = initialX - dx.toInt()
                        params.y = initialY + dy.toInt()
                        windowManager?.updateViewLayout(view, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    // 如果未拖动，则视为点击，交给 WebView 处理
                    !isDragging
                }
                else -> false
            }
        }
    }

    private fun hideFloatingWindow() {
        floatingView?.let {
            windowManager?.removeView(it)
        }
        floatingView = null
        webView?.destroy()
        webView = null
        isShowing = false
    }

    /**
     * 切换悬浮窗显示/隐藏（通过 JS Bridge 调用）
     */
    fun toggleVisibility() {
        if (isShowing) {
            hideFloatingWindow()
        } else {
            showFloatingWindow()
        }
    }
}
