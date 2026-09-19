package com.eggli.flashcards.plugins

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.util.Log
import libtailscale.AppContext
import java.net.NetworkInterface

class AndroidAppContext(private val context: Context) : AppContext {

    private val prefsName = "tailscale_prefs"
    private val prefs: SharedPreferences

    init {
        prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        Log.i(TAG, "AndroidAppContext initialized")
    }

    override fun log(tag: String, logLine: String) {
        Log.i("Tailscale-$tag", logLine)
    }

    override fun encryptToPref(key: String?, value: String?) {
        try {
            Log.i(TAG, "encryptToPref: key=$key")
            val k = if (key != null) "statestore-$key" else "statestore-null"
            prefs.edit().putString(k, value).commit()
        } catch (e: Exception) {
            Log.e(TAG, "encryptToPref failed: ${e.message}")
        }
    }

    override fun decryptFromPref(key: String?): String? {
        try {
            Log.i(TAG, "decryptFromPref: key=$key")
            val k = if (key != null) "statestore-$key" else "statestore-null"
            return prefs.getString(k, null)
        } catch (e: Exception) {
            Log.e(TAG, "decryptFromPref failed: ${e.message}")
            return null
        }
    }

    override fun getStateStoreKeysJSON(): String {
        try {
            Log.i(TAG, "getStateStoreKeysJSON")
            val keys = prefs.all.keys
                .filter { it.startsWith("statestore-") }
                .map { it.removePrefix("statestore-") }
            val result = if (keys.isEmpty()) "[]" else keys.joinToString(prefix = "[", postfix = "]") { "\"$it\"" }
            Log.i(TAG, "getStateStoreKeysJSON result: $result")
            return result
        } catch (e: Exception) {
            Log.e(TAG, "getStateStoreKeysJSON failed: ${e.message}")
            return "[]"
        }
    }

    override fun getOSVersion(): String {
        return try {
            val v = Build.VERSION.RELEASE ?: "Unknown"
            Log.i(TAG, "getOSVersion: $v")
            v
        } catch (e: Exception) {
            Log.e(TAG, "getOSVersion failed: ${e.message}")
            "Unknown"
        }
    }

    override fun getSDKInt(): Long {
        return try {
            val v = Build.VERSION.SDK_INT.toLong()
            Log.i(TAG, "getSDKInt: $v")
            v
        } catch (e: Exception) {
            Log.e(TAG, "getSDKInt failed: ${e.message}")
            0L
        }
    }

    override fun getDeviceName(): String {
        return try {
            val deviceName = Settings.Global.getString(
                context.contentResolver,
                Settings.Global.DEVICE_NAME
            )
            val result = if (!deviceName.isNullOrEmpty()) deviceName else (Build.MODEL ?: "Android Device")
            Log.i(TAG, "getDeviceName: $result")
            result
        } catch (e: Exception) {
            Log.e(TAG, "getDeviceName failed: ${e.message}")
            "Android Device"
        }
    }

    override fun getInstallSource(): String {
        return try {
            val pm = context.packageManager
            val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                pm.getInstallSourceInfo(context.packageName).installingPackageName ?: "sideload"
            } else {
                @Suppress("DEPRECATION")
                pm.getInstallerPackageName(context.packageName) ?: "sideload"
            }
            Log.i(TAG, "getInstallSource: $result")
            result
        } catch (e: Exception) {
            "sideload"
        }
    }

    override fun shouldUseGoogleDNSFallback(): Boolean {
        return true
    }

    override fun isChromeOS(): Boolean {
        return try {
            context.packageManager.hasSystemFeature("org.chromium.arc.device_management")
        } catch (e: Exception) {
            false
        }
    }

    override fun isClientLoggingEnabled(): Boolean {
        return true
    }

    override fun getInterfacesAsJson(): String {
        return try {
            Log.i(TAG, "getInterfacesAsJson")
            val ifaces = NetworkInterface.getNetworkInterfaces()
            val list = mutableListOf<String>()
            if (ifaces != null) {
                while (ifaces.hasMoreElements()) {
                    try {
                        val iface = ifaces.nextElement()
                        if (iface.isUp && !iface.isLoopback) {
                            val name = iface.name
                            list.add("""{"Name":"$name","HardwareAddr":"","Addrs":[]}""")
                        }
                    } catch (e: Exception) {
                        // skip
                    }
                }
            }
            val result = if (list.isEmpty()) "[]" else list.joinToString(prefix = "[", postfix = "]")
            Log.i(TAG, "getInterfacesAsJson result: $result")
            result
        } catch (e: Exception) {
            Log.e(TAG, "getInterfacesAsJson failed: ${e.message}")
            "[]"
        }
    }

    override fun getPlatformDNSConfig(): String {
        return try {
            Log.i(TAG, "getPlatformDNSConfig")
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE)
                    as? android.net.ConnectivityManager
            val activeNetwork = connectivityManager?.activeNetwork
            val linkProperties = connectivityManager?.getLinkProperties(activeNetwork)
            val dnsServers = linkProperties?.dnsServers?.mapNotNull { it.hostAddress } ?: emptyList()
            val result = if (dnsServers.isEmpty()) {
                "{\"Nameservers\":[\"8.8.8.8\",\"8.8.4.4\"]}"
            } else {
                "{\"Nameservers\":[${dnsServers.joinToString { "\"$it\"" }}]}"
            }
            Log.i(TAG, "getPlatformDNSConfig result: $result")
            result
        } catch (e: Exception) {
            Log.e(TAG, "getPlatformDNSConfig failed: ${e.message}")
            "{\"Nameservers\":[\"8.8.8.8\",\"8.8.4.4\"]}"
        }
    }

    override fun getSyspolicyStringValue(key: String): String {
        return ""
    }

    override fun getSyspolicyBooleanValue(key: String): Boolean {
        return false
    }

    override fun getSyspolicyStringArrayJSONValue(key: String): String {
        return "[]"
    }

    override fun hardwareAttestationKeySupported(): Boolean {
        Log.i(TAG, "hardwareAttestationKeySupported: false")
        return false
    }

    override fun hardwareAttestationKeyCreate(): String {
        return ""
    }

    override fun hardwareAttestationKeyRelease(id: String) {}

    override fun hardwareAttestationKeyPublic(id: String): ByteArray {
        return ByteArray(0)
    }

    override fun hardwareAttestationKeySign(id: String, data: ByteArray): ByteArray {
        return ByteArray(0)
    }

    override fun hardwareAttestationKeyLoad(id: String) {}

    override fun bindSocketToNetwork(fd: Int): Boolean {
        if (fd <= 0) return false
        return try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE)
                    as? android.net.ConnectivityManager
            val activeNetwork = connectivityManager?.activeNetwork
            if (activeNetwork != null) {
                // 使用 ParcelFileDescriptor 包装原始 fd，绑定到活动网络后释放所有权
                val pfd = android.os.ParcelFileDescriptor.adoptFd(fd)
                try {
                    activeNetwork.bindSocket(pfd.fileDescriptor)
                    Log.i(TAG, "bindSocketToNetwork: success, fd=$fd")
                    true
                } finally {
                    // detachFd() 释放所有权但不关闭 fd（fd 由 Go 侧管理）
                    pfd.detachFd()
                }
            } else {
                Log.w(TAG, "bindSocketToNetwork: no active network")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "bindSocketToNetwork failed: ${e.message}")
            false
        }
    }

    override fun getUserCACertsPEM(): ByteArray {
        return ByteArray(0)
    }

    companion object {
        private const val TAG = "AndroidAppContext"
    }
}
