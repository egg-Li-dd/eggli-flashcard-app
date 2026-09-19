package com.eggli.flashcards.plugins

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.eggli.flashcards.services.SystemFloatingWindowService

@CapacitorPlugin(name = "SystemFloatingWindow")
class SystemFloatingWindowPlugin : Plugin() {

    @PluginMethod
    fun canDrawOverlays(call: PluginCall) {
        val result = JSObject()
        result.put("granted", SystemFloatingWindowService.canDrawOverlays(context))
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(context)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + context.packageName)
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                call.resolve(JSObject().put("opened", true))
            } else {
                call.resolve(JSObject().put("opened", false).put("granted", true))
            }
        } else {
            call.resolve(JSObject().put("opened", false).put("granted", true))
        }
    }

    @PluginMethod
    fun show(call: PluginCall) {
        if (!SystemFloatingWindowService.canDrawOverlays(context)) {
            call.reject("未授权 SYSTEM_ALERT_WINDOW 权限")
            return
        }
        SystemFloatingWindowService.startService(context)
        call.resolve(JSObject().put("shown", true))
    }

    @PluginMethod
    fun hide(call: PluginCall) {
        SystemFloatingWindowService.stopService(context)
        call.resolve(JSObject().put("hidden", true))
    }

    @PluginMethod
    fun isShowing(call: PluginCall) {
        call.resolve(JSObject().put("showing", SystemFloatingWindowService.isShowing()))
    }
}
