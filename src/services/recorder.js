/**
 * MediaRecorder 录音服务
 *
 * 不依赖浏览器 Web Speech API（Chrome 独占）。
 * 基于 MediaRecorder + getUserMedia，任何有麦克风的现代浏览器都能用。
 * Android 原生 App 中通过自定义 AudioRecorderPlugin 录音（getUserMedia 在 WebView 中不可用）。
 *
 * 支持三种识别子方案（在设置中切换）：
 *   'web-speech'   → 原 Web Speech API（Chrome/Edge 可用，HTTPS 要求）
 *   'whisper-api'  → 录音后上传到 OpenAI Whisper API / OpenRouter Whisper / 自建兼容端点
 *   'iflytek-iat'  → 录音后通过 WebSocket 流式发送到讯飞语音听写 API
 */

// ---- 工具 ----
import { nativeStartRecording, nativeStopRecording, base64ToBytes, isNative, hasNativeRecorder } from './nativeRecorder'

const pickMimeType = () => {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return null
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mp4;codecs=opus',
    'audio/aac',
  ]
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch (_) { /* ignore */ }
  }
  return 'audio/webm'
}

const isNativeApp = () => {
  if (typeof window === 'undefined') return false
  try {
    return !!(window.Capacitor?.isNativePlatform)
  } catch (_) { return false }
}

/** 将 16kHz 16bit mono PCM 数据包装为 WAV Blob */
const pcmToWavBlob = (pcmBytes, sampleRate = 16000) => {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmBytes.length
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  const pcmView = new Uint8Array(buffer, headerSize)
  pcmView.set(pcmBytes)
  return new Blob([buffer], { type: 'audio/wav' })
}

// ---- 能力检测 ----
export const isSecureContextForMic = () => {
  if (typeof window === 'undefined') return false
  try {
    const host = location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '') return true
    if (window.Capacitor?.isNativePlatform) return true
    return !!window.isSecureContext
  } catch (_) {
    return false
  }
}

/**
 * 检测当前是否有活跃网络连接（用于在线语音/OCR 模式的预检）。
 * navigator.onLine 只反映系统网络接口状态，不能保证目标服务器可达，
 * 但足以在录音前拦截"完全离线"场景，避免录音后才报错。
 */
export const isNetworkAvailable = () => {
  if (typeof window === 'undefined') return false
  try {
    return !!navigator.onLine
  } catch (_) {
    return true // 无法检测时默认可用，不阻断流程
  }
}

export const isMediaRecorderSupported = () =>
  typeof window !== 'undefined' &&
  !!('MediaRecorder' in window) &&
  !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')

export const isWebSpeechSupported = () =>
  typeof window !== 'undefined' &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition)

/**
 * 用户选择的首选模式，但实际能走哪条路径要结合当前浏览器能力判断。
 */
export const resolveAvailableMode = async (preferred) => {
  const hasWebSpeech = isWebSpeechSupported() && isSecureContextForMic()
  const hasRecorder = isMediaRecorderSupported()
  // Android 原生 App 中，Vosk 和录音通过 native AudioRecord 实现，不依赖 Web API
  const hasNativeAudio = await hasNativeRecorder()

  // vosk-offline 在原生 App 中走 native AudioRecord，不受 Web MediaRecorder 限制
  if (preferred === 'vosk-offline' && (hasRecorder || hasNativeAudio)) {
    return { mode: 'vosk-offline', reason: null }
  }
  if (preferred === 'web-speech' && hasWebSpeech) return { mode: 'web-speech', reason: null }
  if (preferred === 'whisper-api' && (hasRecorder || hasNativeAudio)) return { mode: 'whisper-api', reason: null }
  if (preferred === 'iflytek-iat' && (hasRecorder || hasNativeAudio)) return { mode: 'iflytek-iat', reason: null }
  if (preferred === 'iflytek-bigmodel' && (hasRecorder || hasNativeAudio)) return { mode: 'iflytek-bigmodel', reason: null }
  if (preferred === 'iflytek-rtasr-std' && (hasRecorder || hasNativeAudio)) return { mode: 'iflytek-rtasr-std', reason: null }
  if (preferred === 'iflytek-rtasr-llm' && (hasRecorder || hasNativeAudio)) return { mode: 'iflytek-rtasr-llm', reason: null }
  if (preferred === 'iflytek-ost' && (hasRecorder || hasNativeAudio)) return { mode: 'iflytek-ost', reason: null }
  if (preferred === 'dashscope-asr' && (hasRecorder || hasNativeAudio)) return { mode: 'dashscope-asr', reason: null }
  if (preferred === 'pc-engine-voice') return { mode: 'pc-engine-voice', reason: null }

  if (!hasWebSpeech && !hasRecorder && !hasNativeAudio) {
    return { mode: null, reason: '当前设备没有可用的语音输入方式' }
  }

  // 用户的首选无法使用：顺序降级
  if (preferred === 'web-speech' && !hasWebSpeech && (hasRecorder || hasNativeAudio))
    return { mode: 'whisper-api', reason: '当前浏览器不支持浏览器内置语音识别，已自动切换为在线语音 API 模式' }
  if (preferred === 'whisper-api' && !hasRecorder && !hasNativeAudio && hasWebSpeech)
    return { mode: 'web-speech', reason: '当前浏览器不支持录音功能，已自动切换为浏览器内置语音识别' }
  const iflytekModes = ['iflytek-iat', 'iflytek-bigmodel', 'iflytek-rtasr-std', 'iflytek-rtasr-llm', 'iflytek-ost', 'dashscope-asr']
  if (iflytekModes.includes(preferred) && !hasRecorder && !hasNativeAudio && hasWebSpeech)
    return { mode: 'web-speech', reason: '当前浏览器不支持录音功能，所选语音识别模式不可用，已自动切换为浏览器内置语音识别' }
  if (preferred === 'vosk-offline' && !hasRecorder && !hasNativeAudio && hasWebSpeech)
    return { mode: 'web-speech', reason: '当前设备不支持录音功能，Vosk离线识别不可用，已自动切换为浏览器内置语音识别' }

  // 兜底
  if (hasWebSpeech) return { mode: 'web-speech', reason: null }
  if (hasRecorder || hasNativeAudio) return { mode: 'whisper-api', reason: null }
  return { mode: null, reason: '当前没有可用的语音识别方式' }
}

// ---- MediaRecorder 录音 ----
export function createAudioRecorder(onStateChange) {
  let mediaStream = null
  let recorder = null
  let chunks = []
  let startTs = 0
  let state = 'idle' // idle | recording | stopped
  let durationTimer = null

  const set = (next) => {
    state = next
    if (typeof onStateChange === 'function') onStateChange(next)
  }

  const clearAll = () => {
    if (durationTimer) {
      clearInterval(durationTimer)
      durationTimer = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => {
        try { t.stop() } catch (_) {}
      })
      mediaStream = null
    }
    recorder = null
    chunks = []
  }

  let _nativeRecording = false
  let _nativeStartTs = 0

  const start = async ({ maxDurationMs = 5 * 60 * 1000 } = {}) => {
    if (state === 'recording') throw new Error('已在录音中')

    // ---- Android 原生 App 路径 ----
    if (await hasNativeRecorder()) {
      try {
        await nativeStartRecording({ sampleRate: 16000 })
        _nativeRecording = true
        _nativeStartTs = Date.now()
        set('recording')

        if (maxDurationMs && maxDurationMs > 0) {
          durationTimer = setTimeout(() => {
            if (state === 'recording') {
              try { stop() } catch (_) {}
            }
          }, maxDurationMs)
        }
        return
      } catch (err) {
        throw new Error('录音启动失败：' + (err?.message || '未知错误'))
      }
    }

    // ---- 浏览器 Web API 路径 ----
    if (!isMediaRecorderSupported()) throw new Error('当前浏览器不支持录音功能，请改用 Chrome/Edge 浏览器')
    if (!isSecureContextForMic()) throw new Error('录音需要 HTTPS 环境，请在 HTTPS 或 localhost 下使用')

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err) {
    const name = (err && err.name) || ''
    const message = (err && err.message) || ''
    if (isNativeApp()) {
      // Android WebView 中 getUserMedia 不可用，且原生录音插件未加载
      throw new Error(
        '原生录音插件未加载，请重新构建 APK（运行 ./gradlew assembleDebug）。\n临时替代：在「设置 → 语音识别」中切换到「浏览器内置」模式'
      )
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问后重试')
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('未检测到麦克风设备，请检查硬件连接')
    if (name === 'NotSupportedError' || name === 'TypeError') {
      throw new Error('当前浏览器不支持录音功能，请使用 Chrome 浏览器')
    }
    throw new Error('无法启动麦克风：' + (message || '未知错误'))
  }

    const mimeType = pickMimeType()
    chunks = []
    try {
      recorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream)
    } catch (err) {
      clearAll()
      throw new Error('录音初始化失败：' + (err.message || '未知错误'))
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    recorder.onerror = (e) => {
      clearAll()
      set('idle')
    }

    startTs = Date.now()
    recorder.start()
    set('recording')

    if (maxDurationMs && maxDurationMs > 0) {
      durationTimer = setTimeout(() => {
        if (state === 'recording') {
          try { stop() } catch (_) {}
        }
      }, maxDurationMs)
    }
  }

  const stop = async () => {
    // ---- Android 原生 App 路径 ----
    if (_nativeRecording) {
      _nativeRecording = false
      const durationSec = (Date.now() - _nativeStartTs) / 1000
      if (durationTimer) { clearTimeout(durationTimer); durationTimer = null }
      try {
        const result = await nativeStopRecording()
        set('idle')
        if (!result || !result.data || result.size < 100) return null
        const pcmBytes = base64ToBytes(result.data)
        const blob = pcmToWavBlob(pcmBytes, result.sampleRate || 16000)
        return {
          blob,
          durationSec,
          mimeType: 'audio/wav',
          fileName: `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`,
        }
      } catch (err) {
        set('idle')
        throw new Error('停止录音失败：' + (err?.message || '未知错误'))
      }
    }

    // ---- 浏览器 Web API 路径 ----
    if (!recorder) {
      clearAll()
      return null
    }
    return new Promise((resolve) => {
      const finalMimeType = (recorder && recorder.mimeType) || pickMimeType() || 'audio/webm'
      recorder.onstop = () => {
        const durationSec = (Date.now() - startTs) / 1000
        const blob = chunks.length > 0 ? new Blob(chunks, { type: finalMimeType }) : null
        clearAll()
        set('idle')
        if (!blob || blob.size < 1000) resolve(null)
        else {
          const ext = finalMimeType.includes('mp4') || finalMimeType.includes('aac') ? 'm4a'
            : finalMimeType.includes('ogg') ? 'ogg'
            : 'webm'
          const fileName = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`
          resolve({ blob, durationSec, mimeType: finalMimeType, fileName })
        }
      }
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop()
        else resolve(null)
      } catch (_) {
        clearAll()
        set('idle')
        resolve(null)
      }
    })
  }

  const cancel = () => {
    try {
      if (_nativeRecording) {
        _nativeRecording = false
        nativeStopRecording().catch(() => {})
        set('idle')
      }
    } catch (_) {}
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    } catch (_) {}
    clearAll()
    set('idle')
  }

  const getState = () => state

  return { start, stop, cancel, getState }
}
