const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

let CapacitorSpeechReady = false
let CapacitorSpeech = null

const loadCapacitorSpeech = import('@capacitor-community/speech-recognition')
  .then(m => {
    CapacitorSpeech = m.SpeechRecognition
    CapacitorSpeechReady = true
    return m
  })
  .catch(() => { CapacitorSpeechReady = true })

function ensureCapacitorLoaded() {
  return loadCapacitorSpeech.then(() => CapacitorSpeech)
}

export function isSpeechSupported() {
  return !!SpeechRecognition
}

export async function isCapacitorSpeechAvailable() {
  await ensureCapacitorLoaded()
  if (!CapacitorSpeech) return false
  try {
    const result = await CapacitorSpeech.isAvailable()
    return result?.available !== false && result !== false
  } catch (e) {
    return !!CapacitorSpeech
  }
}

export async function isAnySpeechAvailable() {
  if (isSpeechSupported()) return true
  try {
    return await isCapacitorSpeechAvailable()
  } catch (e) {
    return false
  }
}

export async function requestSpeechPermission() {
  if (!CapacitorSpeech) return null
  try {
    const result = await CapacitorSpeech.requestPermission()
    if (result === true) return true
    if (result && typeof result === 'object') {
      if (result.granted === true) return true
      if (result.state === 'granted' || result.state === 'allowed') return true
      if (result.value === 'granted' || result.value === 'allowed') return true
      if (result.granted === false || result.state === 'denied' || result.state === 'denied' || result.value === 'denied') {
        return false
      }
    }
    // 对未知结构返回不确定值，由调用方通过实际启动操作判定
    return 'unknown'
  } catch (e) {
    console.warn('requestSpeechPermission error:', e)
    return 'unknown'
  }
}

export function createSpeechRecognition() {
  if (!SpeechRecognition) throw new Error('当前浏览器不支持语音识别')
  const recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.interimResults = false
  recognition.continuous = false
  recognition.maxAlternatives = 1
  return recognition
}

export function createNativeSpeechRecognition() {
  if (!CapacitorSpeech) throw new Error('Capacitor speech plugin not available')
  let resultText = ''
  let currentLang = 'zh-CN'
  let listenersAttached = false
  let listeners = []

  const api = {
    set lang(val) { currentLang = val },
    get lang() { return currentLang },
    onresult: null,
    onerror: null,
    onend: null,

    async start() {
      try {
        resultText = ''
        // 只在第一次调用 start 时注册监听器，避免重复监听
        if (!listenersAttached) {
          const l1 = await CapacitorSpeech.addListener('partialResult', (data) => {
            resultText = data.matches?.join('') || ''
          })
          const l2 = await CapacitorSpeech.addListener('onResult', (data) => {
            resultText = data.matches?.join('') || ''
            if (api.onresult) {
              api.onresult({ results: [[{ transcript: resultText }]] })
            }
          })
          listeners.push(l1, l2)
          listenersAttached = true
        }
        await CapacitorSpeech.start({
          language: currentLang,
          maxResults: 1,
          prompt: '',
          partialResults: false,
          popup: false,
        })
      } catch (e) {
        if (api.onerror) api.onerror({ error: e.message || 'unknown' })
      }
    },

    async stop() {
      try { await CapacitorSpeech.stop() } catch (e) {}
      if (api.onend) api.onend()
    },

    async destroy() {
      // 清理所有已注册的事件监听器
      for (const l of listeners) {
        try { await l.remove() } catch (e) {}
      }
      listeners = []
      listenersAttached = false
    },
  }
  return api
}
