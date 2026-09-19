/**
 * Android 原生录音桥接模块
 *
 * 在 Capacitor Android 原生应用中，WebView 的 getUserMedia 不可用，
 * 通过自定义 AudioRecorderPlugin 原生插件录音，返回 16kHz 16bit mono PCM。
 */

const isNative = () => {
  if (typeof window === 'undefined') return false
  try {
    return !!(window.Capacitor?.isNativePlatform)
  } catch (_) {
    return false
  }
}

const findPluginByName = (name) => {
  if (!isNative()) return null
  try {
    const Capacitor = window.Capacitor
    if (!Capacitor) return null
    const plugins = Capacitor.Plugins || {}
    if (plugins[name]) return plugins[name]
    // 大小写不敏感 fallback
    const keys = Object.keys(plugins)
    const found = keys.find(k => k.toLowerCase() === name.toLowerCase())
    return found ? plugins[found] : null
  } catch (_) {
    return null
  }
}

// Capacitor 原生插件在 App 启动初期可能尚未注册完成，增加简单重试
const loadPlugin = async () => {
  if (!isNative()) return null
  let plugin = findPluginByName('AudioRecorder')
  if (plugin) return plugin
  // 重试最多 3 次，每次间隔 100ms
  for (let i = 0; i < 3; i++) {
    await new Promise(res => setTimeout(res, 100))
    plugin = findPluginByName('AudioRecorder')
    if (plugin) return plugin
  }
  return null
}

export async function hasNativeRecorder() {
  const plugin = await loadPlugin()
  return !!plugin
}

export async function nativeStartRecording(options = {}) {
  const plugin = await loadPlugin()
  if (!plugin) throw new Error('AudioRecorder 原生插件未加载')
  await plugin.start({ sampleRate: options.sampleRate || 16000 })
}

export async function nativeStopRecording() {
  const plugin = await loadPlugin()
  if (!plugin) throw new Error('AudioRecorder 原生插件未加载')
  return await plugin.stop()
}

export function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export { isNative }
