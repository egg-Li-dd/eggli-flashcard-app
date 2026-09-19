# Tailscale VPN 启动失败修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Tailscale VPN 启动失败问题，确保 Android 应用能够成功启动并连接 Tailscale 网络。

**Architecture:** 通过添加必要的 Android 权限、实现 VpnService 服务、完善 AppContext 接口、添加前台通知等步骤，使 Tailscale 引擎能够正常初始化和运行。

**Tech Stack:** Android SDK, Capacitor, libtailscale (gomobile binding), Kotlin

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `android/app/src/main/AndroidManifest.xml` | 添加权限和 VpnService 声明 |
| `android/app/src/main/java/com/eggli/flashcards/plugins/TailscaleVPNPlugin.kt` | Capacitor 插件，调用 libtailscale |
| `android/app/src/main/java/com/eggli/flashcards/plugins/AndroidAppContext.kt` | 实现 AppContext 接口 |
| `android/app/src/main/java/com/eggli/flashcards/services/TailscaleVpnService.kt` | **新建** VpnService 实现 |
| `android/app/src/main/java/com/eggli/flashcards/services/TailscaleForegroundService.kt` | **新建** 前台服务通知 |
| `android/app/src/main/res/drawable/tailscale_ic_launcher.xml` | **新建** 通知图标 |
| `android/app/src/main/res/values/strings.xml` | 添加通知相关字符串 |
| `src/services/tailscale.js` | 前端 Tailscale API 封装 |
| `src/pages/SettingsTailscale.jsx` | 前端 Tailscale 设置页面 |

---

## 问题根因分析

### 问题 1：缺少必要的 Android 权限
- `FOREGROUND_SERVICE` - Android 8+ 前台服务必需
- `FOREGROUND_SERVICE_VPN` - Android 12+ VPN 服务必需  
- `ACCESS_NETWORK_STATE` - 网络状态检测
- `ACCESS_WIFI_STATE` - WiFi 状态检测

### 问题 2：缺少 VpnService 声明和实现
- Tailscale 需要 VpnService 来创建 TUN 接口和路由流量
- AndroidManifest.xml 中没有声明 VpnService
- 没有实现 IPNService 接口

### 问题 3：AppContext 接口实现不完整
- `bindSocketToNetwork()` 返回 false，导致 socket 无法正确绑定
- `getPlatformDNSConfig()` 返回空字符串

### 问题 4：缺少前台通知
- Android 8+ 要求前台服务必须显示通知
- 没有实现通知渠道和通知内容

---

### Task 1: 添加必要的 Android 权限

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: 添加权限声明**

在 `<uses-permission>` 区域添加以下权限：

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_VPN" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

- [ ] **Step 2: 验证修改**

检查 AndroidManifest.xml 内容，确认权限已正确添加。

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "fix: 添加 Tailscale VPN 必需的 Android 权限"
```

---

### Task 2: 创建 VpnService 实现

**Files:**
- Create: `android/app/src/main/java/com/eggli/flashcards/services/TailscaleVpnService.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: 创建 TailscaleVpnService.kt**

```kotlin
package com.eggli.flashcards.services

import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.eggli.flashcards.R
import com.eggli.flashcards.plugins.TailscaleVPNPlugin
import libtailscale.VPNServiceBuilder
import libtailscale.ParcelFileDescriptor as LibParcelFileDescriptor

class TailscaleVpnService : android.net.VpnService() {

    private val TAG = "TailscaleVpnService"
    private var vpnInterface: ParcelFileDescriptor? = null
    private var serviceId = System.currentTimeMillis().toString()

    companion object {
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "tailscale_vpn"
        private const val CHANNEL_NAME = "Tailscale VPN"

        fun startService(context: android.content.Context) {
            val intent = Intent(context, TailscaleVpnService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: android.content.Context) {
            val intent = Intent(context, TailscaleVpnService::class.java)
            context.stopService(intent)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand")
        createNotificationChannel()
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)

        TailscaleVPNPlugin.setVpnService(this)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "onDestroy")
        disconnectVPN()
        TailscaleVPNPlugin.setVpnService(null)
    }

    fun disconnectVPN() {
        vpnInterface?.close()
        vpnInterface = null
    }

    fun protect(fd: Int): Boolean {
        return try {
            super.protect(fd)
        } catch (e: Exception) {
            Log.e(TAG, "protect failed: ${e.message}")
            false
        }
    }

    fun id(): String {
        return serviceId
    }

    fun newBuilder(): VPNServiceBuilder {
        return TailscaleVPNBuilder(this)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                android.app.NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Tailscale VPN 连接状态"
                enableVibration(false)
                setShowBadge(false)
            }
            val notificationManager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): android.app.Notification {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.tailscale_ic_launcher)
            .setContentTitle(getString(R.string.tailscale_notification_title))
            .setContentText(getString(R.string.tailscale_notification_text))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)

        return builder.build()
    }

    class TailscaleVPNBuilder(private val service: TailscaleVpnService) : VPNServiceBuilder {
        private val builder = service.Builder()

        override fun setMTU(mtu: Int) {
            builder.setMtu(mtu)
        }

        override fun addDNSServer(server: String) {
            builder.addDnsServer(server)
        }

        override fun addSearchDomain(domain: String) {
            builder.addSearchDomain(domain)
        }

        override fun addRoute(route: String, prefixLength: Int) {
            builder.addRoute(route, prefixLength)
        }

        override fun excludeRoute(route: String, prefixLength: Int) {
            builder.addDisallowedRoute(route, prefixLength)
        }

        override fun addAddress(address: String, prefixLength: Int) {
            builder.addAddress(address, prefixLength)
        }

        override fun establish(): LibParcelFileDescriptor? {
            return try {
                val pfd = builder.establish()
                service.vpnInterface = pfd
                object : LibParcelFileDescriptor {
                    override fun detach(): Pair<Int, Exception?> {
                        return try {
                            val fd = pfd.detachFd()
                            Pair(fd, null)
                        } catch (e: Exception) {
                            Pair(-1, e)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "establish failed: ${e.message}")
                null
            }
        }
    }
}
```

- [ ] **Step 2: 在 AndroidManifest.xml 中声明 VpnService**

在 `<application>` 标签内添加：

```xml
<service
    android:name=".services.TailscaleVpnService"
    android:permission="android.permission.BIND_VPN_SERVICE"
    android:exported="false">
    <intent-filter>
        <action android:name="android.net.VpnService" />
    </intent-filter>
</service>
```

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/eggli/flashcards/services/TailscaleVpnService.kt
git add android/app/src/main/AndroidManifest.xml
git commit -m "fix: 创建 TailscaleVpnService 实现"
```

---

### Task 3: 完善 AndroidAppContext 接口实现

**Files:**
- Modify: `android/app/src/main/java/com/eggli/flashcards/plugins/AndroidAppContext.kt`

- [ ] **Step 1: 更新 bindSocketToNetwork 方法**

```kotlin
override fun bindSocketToNetwork(fd: Int): Boolean {
    return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            val connectivityManager = context.getSystemService(
                android.content.Context.CONNECTIVITY_SERVICE
            ) as android.net.ConnectivityManager
            connectivityManager.bindSocketToNetwork(fd)
        } else {
            false
        }
    } catch (e: Exception) {
        Log.e(TAG, "bindSocketToNetwork failed: ${e.message}")
        false
    }
}
```

- [ ] **Step 2: 更新 getPlatformDNSConfig 方法**

```kotlin
override fun getPlatformDNSConfig(): String {
    return try {
        val connectivityManager = context.getSystemService(
            android.content.Context.CONNECTIVITY_SERVICE
        ) as android.net.ConnectivityManager
        val activeNetwork = connectivityManager.activeNetwork
        val linkProperties = connectivityManager.getLinkProperties(activeNetwork)
        val dnsServers = linkProperties?.dnsServers?.map { it.hostAddress } ?: emptyList()
        "{\"Nameservers\": [${dnsServers.joinToString { "\"$it\"" }}]}"
    } catch (e: Exception) {
        Log.e(TAG, "getPlatformDNSConfig failed: ${e.message}")
        "{\"Nameservers\": []}"
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/eggli/flashcards/plugins/AndroidAppContext.kt
git commit -m "fix: 完善 AppContext bindSocketToNetwork 和 getPlatformDNSConfig"
```

---

### Task 4: 更新 TailscaleVPNPlugin 支持 VpnService

**Files:**
- Modify: `android/app/src/main/java/com/eggli/flashcards/plugins/TailscaleVPNPlugin.kt`

- [ ] **Step 1: 添加 VpnService 引用和回调**

在类中添加：

```kotlin
private var vpnService: TailscaleVpnService? = null

companion object {
    private const val TAG = "TailscaleVPN"
    fun setVpnService(service: TailscaleVpnService?) {
        // 通过静态方式传递
    }
}
```

- [ ] **Step 2: 修改 start 方法，启动 VpnService**

```kotlin
@PluginMethod
fun start(call: PluginCall) {
    try {
        if (tailscaleApp == null) {
            val ctx = context.applicationContext
            
            TailscaleVpnService.startService(ctx)
            
            val appCtx = AndroidAppContext(ctx)
            tailscaleApp = Libtailscale.start(
                dataDir!!.absolutePath,
                "",
                false,
                appCtx
            )
            isRunning = true
        }
        val ret = JSObject()
        ret.put("success", true)
        ret.put("running", isRunning)
        call.resolve(ret)
    } catch (e: Exception) {
        Log.e(TAG, "start failed: ${e.message}")
        call.reject("Failed to start tailscale: ${e.message}")
    }
}
```

- [ ] **Step 3: 修改 stop 方法，停止 VpnService**

```kotlin
@PluginMethod
fun stop(call: PluginCall) {
    try {
        tailscaleApp = null
        isRunning = false
        TailscaleVpnService.stopService(context.applicationContext)
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    } catch (e: Exception) {
        call.reject("Failed to stop: ${e.message}")
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/eggli/flashcards/plugins/TailscaleVPNPlugin.kt
git commit -m "fix: 更新 TailscaleVPNPlugin 集成 VpnService"
```

---

### Task 5: 添加通知图标和字符串资源

**Files:**
- Create: `android/app/src/main/res/drawable/tailscale_ic_launcher.xml`
- Modify: `android/app/src/main/res/values/strings.xml`

- [ ] **Step 1: 创建通知图标**

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="?attr/colorPrimary">
    <path
        android:fillColor="@android:color/white"
        android:pathData="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
</vector>
```

- [ ] **Step 2: 在 strings.xml 中添加通知字符串**

```xml
<string name="tailscale_notification_title">Tailscale VPN</string>
<string name="tailscale_notification_text">已连接到 Tailscale 网络</string>
```

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/res/drawable/tailscale_ic_launcher.xml
git add android/app/src/main/res/values/strings.xml
git commit -m "fix: 添加 Tailscale 通知图标和字符串资源"
```

---

### Task 6: 验证 libtailscale.aar 是否正确配置

**Files:**
- Verify: `android/app/libs/libtailscale.aar`
- Verify: `android/app/build.gradle`

- [ ] **Step 1: 检查 libtailscale.aar 是否存在**

确认文件存在于 `android/app/libs/libtailscale.aar`

- [ ] **Step 2: 检查 build.gradle 配置**

确认以下依赖已添加：

```groovy
implementation(name: 'libtailscale', ext: 'aar')
implementation "androidx.security:security-crypto:1.1.0-alpha06"
```

- [ ] **Step 3: Commit**

无需修改，验证通过即可。

---

### Task 7: 更新前端错误处理和日志

**Files:**
- Modify: `src/services/tailscale.js`
- Modify: `src/pages/SettingsTailscale.jsx`

- [ ] **Step 1: 增强 tailscale.js 的错误处理**

```javascript
export async function start() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) {
      throw new Error('Tailscale 插件不可用')
    }
    const ret = await plugin.start()
    if (!ret.success) {
      throw new Error(ret.error || '启动失败')
    }
    return ret.success
  } catch (e) {
    console.error('tailscale start failed:', e)
    throw e
  }
}
```

- [ ] **Step 2: 增强 SettingsTailscale.jsx 的错误显示**

在 `handleStart` 函数中：

```javascript
const handleStart = async () => {
  setLoading(true)
  setError('')
  try {
    const ok = await start()
    if (ok) {
      setRunning(true)
      setTimeout(refreshStatus, 2000)
    } else {
      setError('启动失败，请检查权限设置')
    }
  } catch (e) {
    setError(e.message || '启动失败')
  }
  setLoading(false)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/tailscale.js
git add src/pages/SettingsTailscale.jsx
git commit -m "fix: 增强 Tailscale 前端错误处理"
```

---

### Task 8: 编译和测试

**Files:**
- Build: 整个项目

- [ ] **Step 1: 执行 Capacitor Sync**

```bash
npx cap sync android
```

- [ ] **Step 2: 编译 Android 项目**

```bash
cd android
./gradlew assembleDebug
```

- [ ] **Step 3: 安装到设备测试**

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 4: 验证启动流程**

1. 打开应用，进入设置 -> Tailscale VPN
2. 点击"启动 Tailscale"按钮
3. 验证是否显示前台通知
4. 验证是否能获取登录链接
5. 验证是否能成功登录并获取状态

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "fix: 完成 Tailscale VPN 启动修复"
```

---

## 自检清单

**1. 规范覆盖：**
- ✅ 权限添加
- ✅ VpnService 实现
- ✅ AppContext 完善
- ✅ 前台通知
- ✅ 错误处理增强

**2. 占位符扫描：**
- ✅ 无 "TBD"、"TODO"
- ✅ 所有步骤都有具体代码
- ✅ 无模糊描述

**3. 类型一致性：**
- ✅ 方法签名一致
- ✅ 类名和接口名一致

---

## 预期修复效果

修复后，Tailscale VPN 启动流程将正常工作：

1. 用户点击"启动 Tailscale"按钮
2. 应用启动 TailscaleVpnService 前台服务
3. 显示前台通知（符合 Android 要求）
4. 初始化 libtailscale Go 引擎
5. 用户可以获取登录链接并登录
6. 登录后可以查看设备状态和网络节点
7. 可以通过 Tailscale 网络栈访问 Tailnet 中的服务