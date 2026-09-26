export const VOICE_STATE = {
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  TRANSCRIBING: 'transcribing',
  CLEANING: 'cleaning',
  ERROR: 'error',
}

export const VOICE_MODE = {
  WEB_SPEECH: 'web-speech',
  WHISPER_API: 'whisper-api',
  IFLYTEK_IAT: 'iflytek-iat',
  DASHSCOPE_ASR: 'dashscope-asr',
  VOSK_OFFLINE: 'vosk-offline',
}

export function createVoiceStateManager(initialState = VOICE_STATE.IDLE) {
  let currentState = initialState
  let listeners = []
  let mutexLocked = false

  const notify = () => {
    listeners.forEach(listener => listener(currentState))
  }

  const transition = (newState) => {
    if (currentState === newState) return false
    const prevState = currentState
    currentState = newState
    notify()
    return { prevState, newState }
  }

  const lockMutex = () => {
    if (mutexLocked) return false
    mutexLocked = true
    return true
  }

  const unlockMutex = () => {
    mutexLocked = false
  }

  const isMutexLocked = () => mutexLocked

  const canTransitionTo = (newState) => {
    switch (newState) {
      case VOICE_STATE.STARTING:
        return currentState === VOICE_STATE.IDLE && !mutexLocked
      case VOICE_STATE.RECORDING:
        return currentState === VOICE_STATE.STARTING || currentState === VOICE_STATE.IDLE
      case VOICE_STATE.TRANSCRIBING:
        return currentState === VOICE_STATE.RECORDING
      case VOICE_STATE.CLEANING:
        return currentState !== VOICE_STATE.IDLE
      case VOICE_STATE.IDLE:
        return currentState !== VOICE_STATE.IDLE
      case VOICE_STATE.ERROR:
        return true
      default:
        return false
    }
  }

  const tryTransition = (newState) => {
    if (!canTransitionTo(newState)) {
      return { success: false, currentState, targetState: newState }
    }
    const result = transition(newState)
    return { success: true, ...result }
  }

  const addListener = (listener) => {
    listeners.push(listener)
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }

  const getState = () => currentState

  const isRecording = () => currentState === VOICE_STATE.RECORDING
  const isStarting = () => currentState === VOICE_STATE.STARTING
  const isTranscribing = () => currentState === VOICE_STATE.TRANSCRIBING
  const isCleaning = () => currentState === VOICE_STATE.CLEANING
  const isBusy = () => currentState !== VOICE_STATE.IDLE && currentState !== VOICE_STATE.ERROR

  return {
    getState,
    transition,
    tryTransition,
    canTransitionTo,
    addListener,
    lockMutex,
    unlockMutex,
    isMutexLocked,
    isRecording,
    isStarting,
    isTranscribing,
    isCleaning,
    isBusy,
    states: VOICE_STATE,
    modes: VOICE_MODE,
  }
}

export class TimerManager {
  constructor() {
    this.timers = new Map()
  }

  set(name, callback, delay) {
    this.clear(name)
    const id = setTimeout(() => {
      this.timers.delete(name)
      callback()
    }, delay)
    this.timers.set(name, id)
    return id
  }

  clear(name) {
    const id = this.timers.get(name)
    if (id) {
      clearTimeout(id)
      this.timers.delete(name)
    }
  }

  clearAll() {
    this.timers.forEach(id => clearTimeout(id))
    this.timers.clear()
  }

  has(name) {
    return this.timers.has(name)
  }
}

export class ResourceManager {
  constructor() {
    this.resources = new Map()
  }

  register(key, resource, cleanupFn) {
    this.unregister(key)
    this.resources.set(key, { resource, cleanupFn })
  }

  unregister(key) {
    const item = this.resources.get(key)
    if (item) {
      try {
        if (typeof item.cleanupFn === 'function') {
          item.cleanupFn(item.resource)
        }
      } catch (_) {}
      this.resources.delete(key)
    }
  }

  get(key) {
    const item = this.resources.get(key)
    return item ? item.resource : null
  }

  cleanupAll() {
    this.resources.forEach((item, key) => {
      try {
        if (typeof item.cleanupFn === 'function') {
          item.cleanupFn(item.resource)
        }
      } catch (_) {}
    })
    this.resources.clear()
  }
}

export const VOICE_RESOURCE_KEYS = {
  RECOGNITION: 'recognition',
  AUDIO_RECORDER: 'audio_recorder',
  PC_SESSION: 'pc_session',
  PC_AUDIO_RECORDER: 'pc_audio_recorder',
  PC_STREAM_RECORDER: 'pc_stream_recorder',
  PC_MEDIA_STREAM: 'pc_media_stream',
  VOSK_LISTENER: 'vosk_listener',
  WEBSOCKET: 'websocket',
}

export function createVoiceResourceManager() {
  const manager = new ResourceManager()

  const registerRecognition = (recognition) => {
    manager.register(VOICE_RESOURCE_KEYS.RECOGNITION, recognition, (rec) => {
      try {
        if (typeof rec.stop === 'function') {
          const r = rec.stop()
          if (r && typeof r.then === 'function') r.catch(() => {})
        }
      } catch (_) {}
      try {
        if (typeof rec.destroy === 'function') {
          const r = rec.destroy()
          if (r && typeof r.then === 'function') r.catch(() => {})
        }
      } catch (_) {}
    })
  }

  const registerAudioRecorder = (recorder) => {
    manager.register(VOICE_RESOURCE_KEYS.AUDIO_RECORDER, recorder, (rec) => {
      try { rec.cancel() } catch (_) {}
    })
  }

  const registerPcSession = (session) => {
    manager.register(VOICE_RESOURCE_KEYS.PC_SESSION, session, (sess) => {
      try { sess.close() } catch (_) {}
    })
  }

  const registerPcAudioRecorder = (recorder) => {
    manager.register(VOICE_RESOURCE_KEYS.PC_AUDIO_RECORDER, recorder, (rec) => {
      try { rec.cancel() } catch (_) {}
    })
  }

  const registerPcStreamRecorder = (recorder) => {
    manager.register(VOICE_RESOURCE_KEYS.PC_STREAM_RECORDER, recorder, (rec) => {
      try { rec.stop() } catch (_) {}
    })
  }

  const registerPcMediaStream = (stream) => {
    manager.register(VOICE_RESOURCE_KEYS.PC_MEDIA_STREAM, stream, (str) => {
      try { str.getTracks().forEach(t => t.stop()) } catch (_) {}
    })
  }

  const registerVoskListener = (removeFn) => {
    manager.register(VOICE_RESOURCE_KEYS.VOSK_LISTENER, removeFn, (fn) => {
      try { fn() } catch (_) {}
    })
  }

  const cleanupAll = () => {
    manager.cleanupAll()
  }

  return {
    registerRecognition,
    registerAudioRecorder,
    registerPcSession,
    registerPcAudioRecorder,
    registerPcStreamRecorder,
    registerPcMediaStream,
    registerVoskListener,
    cleanupAll,
    get: (key) => manager.get(key),
  }
}