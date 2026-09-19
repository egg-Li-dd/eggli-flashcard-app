import { Capacitor } from '@capacitor/core'

/**
 * 系统悬浮窗服务封装
 * 仅在 Android 原生平台可用，Web浏览器自动降级为应用内悬浮窗
 */
export async function isSystemFloatingSupported() {
  try {
    return Capacitor.isNativePlatform()
  } catch (_) {
    return false
  }
}

export async function canDrawOverlays() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { default: SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    const result = await SystemFloatingWindow.canDrawOverlays()
    return result.granted
  } catch (_) {
    return false
  }
}

export async function requestOverlayPermission() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { default: SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    const result = await SystemFloatingWindow.requestPermission()
    return result.granted || false
  } catch (_) {
    return false
  }
}

export async function showSystemFloating() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { default: SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    await SystemFloatingWindow.show()
    return true
  } catch (e) {
    console.warn('[SystemFloating] show failed:', e)
    return false
  }
}

export async function hideSystemFloating() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { default: SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    await SystemFloatingWindow.hide()
    return true
  } catch (_) {
    return false
  }
}

export async function isSystemFloatingShowing() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { default: SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    const result = await SystemFloatingWindow.isShowing()
    return result.showing
  } catch (_) {
    return false
  }
}
