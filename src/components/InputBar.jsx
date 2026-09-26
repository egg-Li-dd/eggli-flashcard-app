import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SUMMARY_LEVELS } from '../utils/constants'
import { cleanUpSpeechText } from '../services/aiService'
import { Capacitor } from '@capacitor/core'
import { createAudioRecorder, isMediaRecorderSupported, isSecureContextForMic, resolveAvailableMode } from '../services/recorder'
import {
  isVoskAvailable, checkVoskModel, loadVoskModel, startVoskListening, stopVoskListening,
  cancelVoskListening, addVoskPartialListener, releaseVoskModel,
} from '../services/voskService'
import { transcribeWithWhisperAPI, transcribeWithIflytek, transcribeWithDashscope } from '../services/transcribe'
import ImageEditor from './ImageEditor'
import { createVoiceStateManager, TimerManager, createVoiceResourceManager } from '../utils/voiceState'
import { createAudioStreamRecorder, getMicrophoneStream, calculateAudioLevel } from '../services/audioUtils'
import { checkCameraPermission, checkPhotosPermission, openAppSettings, showPermissionDeniedDialog } from '../utils/permissionUtils'

const SpeechRecognitionGlobal =
  (typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
  null

let CapacitorSpeechReady = false
let CapacitorSpeechMod = null

const loadCapacitorSpeech = () => {
  if (CapacitorSpeechReady) return Promise.resolve(CapacitorSpeechMod)
  return import('@capacitor-community/speech-recognition')
    .then((m) => {
      CapacitorSpeechMod = m.SpeechRecognition
      CapacitorSpeechReady = true
      return CapacitorSpeechMod
    })
    .catch(() => {
      CapacitorSpeechReady = true
      return null
    })
}

export default function InputBar({
  value,
  onChange,
  onSubmit,
  onImageOCR,
  ocrLoading,
  summaryLevel,
  onSummaryLevelChange,
  disabled,
  apiKey,
  model,
  onToast,
}) {
  const { state } = useApp()
  const navigate = typeof useNavigate === 'function' ? useNavigate() : null

  const goSettings = useCallback(() => {
    if (navigate) navigate('/settings')
  }, [navigate])

  const [toolbarOpen, setToolbarOpen] = useState(false)
  const [expandOpen, setExpandOpen] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [imageEditorOpen, setImageEditorOpen] = useState(false)
  const [selectedImageFiles, setSelectedImageFiles] = useState([])
  const textareaRef = useRef(null)
  const panelTextareaRef = useRef(null)
  const [pauseDetected, setPauseDetected] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [partialText, setPartialText] = useState('')
  const recordingStartTimeRef = useRef(null)
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  const transcriptRef = useRef('')
  const partialTranscriptRef = useRef('')
  const lastVoiceTimeRef = useRef(0)
  const downgradeNotifiedRef = useRef(false)
  const iflytekFailuresRef = useRef(0)
  const pressStartTimeRef = useRef(0)
  const pressedRef = useRef(false)
  const stopRecognitionRef = useRef(null)
  const MAX_RECORDING_DURATION = 60 * 1000
  const AUTO_PAUSE_THRESHOLD = 1500

  const voiceState = useMemo(() => createVoiceStateManager(), [])
  const timerManager = useMemo(() => new TimerManager(), [])
  const resourceManager = useMemo(() => createVoiceResourceManager(), [])

  const [voiceStatus, setVoiceStatus] = useState(voiceState.getState())

  useEffect(() => {
    const unsubscribe = voiceState.addListener(setVoiceStatus)
    return unsubscribe
  }, [voiceState])

  useEffect(() => {
    if (expandOpen) {
      setDraftText(value)
    }
  }, [value, expandOpen])

  const recording = voiceState.isRecording()
  const starting = voiceState.isStarting()
  const cleaning = voiceState.isCleaning()
  const transcribing = voiceState.isTranscribing()
  const [audioLevel, setAudioLevel] = useState(0)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 22
    const maxHeight = lineHeight * 3 + 20
    const newHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = newHeight + 'px'
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    autoResize()
  }, [value, autoResize])

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const isSecureContext =
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1')

  const showMsg = useCallback(
    (msg, type, actions) => {
      if (typeof onToast === 'function') {
        onToast(msg, type, actions)
      } else {
        alert(msg)
      }
    },
    [onToast],
  )

  const createSpeechRecognition = useCallback(() => {
    if (!SpeechRecognitionGlobal) throw new Error('BROWSER_NOT_SUPPORTED')
    const rec = new SpeechRecognitionGlobal()
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1
    return rec
  }, [])

  const startNativeRecognition = useCallback(async () => {
    const mod = await loadCapacitorSpeech()
    if (!mod) return null
    let listenersAttached = false
    let onResultCb = null
    let onEndCb = null
    let onErrorCb = null
    const api = {
      set onresult(fn) { onResultCb = fn },
      set onend(fn) { onEndCb = fn },
      set onerror(fn) { onErrorCb = fn },
      async start() {
        try {
          if (!listenersAttached) {
            const l1 = await mod.addListener('partialResult', (data) => {
              const text = (data && data.matches && data.matches[0]) || ''
              if (onResultCb && text) onResultCb({ results: [[{ transcript: text, isFinal: false }]] })
            })
            const l2 = await mod.addListener('onResult', (data) => {
              const text =
                (data && data.matches && data.matches[0]) ||
                (data && data.text) ||
                ''
              if (onResultCb && text) onResultCb({ results: [[{ transcript: text, isFinal: true }]] })
            })
            api._listeners = [l1, l2]
            listenersAttached = true
          }
          await mod.start({
            language: 'zh-CN',
            maxResults: 1,
            prompt: '',
            partialResults: true,
            popup: false,
          })
        } catch (err) {
          const msg = (err && (err.message || err.code)) || 'unknown'
          if (onErrorCb) onErrorCb({ error: msg })
          else if (onEndCb) onEndCb()
        }
      },
      async stop() {
        try { await mod.stop() } catch (e) {}
        if (onEndCb) onEndCb()
      },
      async destroy() {
        if (api._listeners) {
          for (const l of api._listeners) {
            try { await l.remove() } catch (e) {}
          }
        }
      },
    }
    return api
  }, [])

  const handlePartialResult = useCallback((text) => {
    if (!text) return
    partialTranscriptRef.current = text
    lastVoiceTimeRef.current = Date.now()
    setPartialText(text)
    setPauseDetected(false)
    timerManager.clear('pause')
    timerManager.set('pause', () => {
      setPauseDetected(true)
      if (stopRecognitionRef.current) stopRecognitionRef.current()
    }, AUTO_PAUSE_THRESHOLD)
  }, [timerManager])

  const handleCleanupAndWrite = useCallback(
    async (rawTranscript) => {
      if (!rawTranscript) return
      const text = rawTranscript.trim()
      if (!text) return

      const isSparkMode = state.aiServiceMode === 'iflytek-spark'
      const isVolcanoMode = state.aiServiceMode === 'volcano'
      const isDashscopeMode = state.aiServiceMode === 'dashscope'
      const hasSparkCreds = !!state.iflytekSparkApiKey
      const hasVolcanoCreds = !!state.volcanoApiKey
      const hasDashscopeCreds = !!state.dashscopeApiKey
      const hasApiKey = !!apiKey
      const hasCreds = isSparkMode
        ? hasSparkCreds
        : isVolcanoMode
          ? hasVolcanoCreds
          : isDashscopeMode
            ? hasDashscopeCreds
            : hasApiKey

      if (!hasCreds) {
        onChange(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + text)
        let tip = '未设置 API Key，语音文本未做 AI 整理'
        if (isSparkMode) tip = '未设置讯飞星火 APIPassword，跳过 AI 整理'
        else if (isVolcanoMode) tip = '未设置火山引擎 API Key，跳过 AI 整理'
        else if (isDashscopeMode) tip = '未设置千问 API Key，跳过 AI 整理'
        showMsg(tip, 'warn')
        return
      }

      voiceState.transition(voiceState.states.CLEANING)
      try {
        const isVolcano = state.aiServiceMode === 'volcano'
        const isDashscope = state.aiServiceMode === 'dashscope'
        const effectiveModel = isSparkMode
          ? state.iflytekSparkModel
          : isVolcano
            ? state.volcanoModel
            : isDashscope
              ? state.dashscopeModel
              : (model || 'deepseek-v4-pro')
        const cleaned = await cleanUpSpeechText(
          text, apiKey, effectiveModel, state.aiServiceMode,
          state.iflytekSparkApiKey, state.iflytekSparkApiSecret,
          state.volcanoApiKey, state.dashscopeApiKey,
        )
        onChange(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + cleaned)
        showMsg('AI 整理完成', 'success')
      } catch (err) {
        const fillerPattern = /(嗯|啊|哦|呃|那个|就是说|我想想|对吧|然后呢|然后|这个|就是|反正|怎么说呢|你知道|你知道吗)/g
        let cleanedText = text
        try {
          let result = text.replace(fillerPattern, '')
          result = result.replace(/\s{2,}/g, ' ')
          result = result.replace(/([。！？])\s*/g, '$1\n')
          if (result.trim()) {
            cleanedText = result.trim()
          }
        } catch (_) {}
        onChange(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + cleanedText)
        showMsg('AI 整理失败：' + (err.message || '未知错误') + '，已使用本地整理', 'error')
      } finally {
        voiceState.transition(voiceState.states.IDLE)
      }
    },
    [apiKey, model, state, onChange, showMsg, voiceState],
  )

  const [resolvedMode, setResolvedMode] = useState({ mode: null, reason: null })

  useEffect(() => {
    (async () => {
      const resolved = state?.speechMode
        ? await resolveAvailableMode(state.speechMode)
        : await resolveAvailableMode('web-speech')
      setResolvedMode(resolved)
    })()
  }, [state?.speechMode])

  const effectiveMode = resolvedMode.mode
  const downgradeReason = resolvedMode.reason

  useEffect(() => {
    if (downgradeReason && !downgradeNotifiedRef.current) {
      downgradeNotifiedRef.current = true
      const timer = setTimeout(() => {
        showMsg(downgradeReason, 'info')
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [downgradeReason, showMsg])

  const startRecognition = useCallback(async () => {
    try {
      if (!voiceState.lockMutex()) {
        return
      }
      voiceState.transition(voiceState.states.STARTING)

      if (effectiveMode === 'web-speech') {
        const isTrueCapacitor = () => {
          if (typeof window === 'undefined') return false
          return !!(
            window.Capacitor?.isNativePlatform ||
            (window.Capacitor && window.Capacitor.isPluginAvailable &&
              window.Capacitor.isPluginAvailable('SpeechRecognition')) ||
            (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge) ||
            (window.location && window.location.protocol === 'capacitor:')
          )
        }

        let recognition = null
        let useCapacitor = false
        if (isTrueCapacitor()) {
          try {
            const mod = await loadCapacitorSpeech()
            if (mod) {
              const avail = await mod.available().catch(() => false)
              useCapacitor =
                avail === true ||
                (avail && typeof avail === 'object' && (avail.available === true || avail.supported === true))
            }
          } catch (_) {
            useCapacitor = false
          }
        }

        if (useCapacitor) {
          try {
            const mod = await loadCapacitorSpeech()
            if (mod?.requestPermission) {
              const perm = await mod.requestPermission().catch(() => null)
              const denied =
                perm === false ||
                (perm && typeof perm === 'object' && (perm.granted === false || perm.state === 'denied' || perm.value === 'denied'))
              if (denied) {
                showMsg('未获得麦克风权限，请在系统设置中为应用授权后重试', 'error')
                return
              }
            }
          } catch (_) {}
          recognition = await startNativeRecognition()
          if (!recognition) {
            showMsg('当前环境无法启动语音识别，请尝试使用 Chrome 浏览器', 'error')
            return
          }
        } else {
          if (!SpeechRecognitionGlobal) {
            showMsg('当前浏览器不支持 Web Speech 语音识别，请在「设置」中切换到「在线语音 API」模式', 'error', [{ label: '去设置', onClick: goSettings }])
            return
          }
          if (!isSecureContextForMic()) {
            showMsg('语音识别需要 HTTPS 环境，请在 HTTPS 或 localhost 下使用', 'error')
            return
          }
          try {
            recognition = createSpeechRecognition()
          } catch (err) {
            showMsg('创建语音识别失败：' + ((err && err.message) || '未知错误'), 'error')
            return
          }
        }

        transcriptRef.current = ''
        partialTranscriptRef.current = ''
        resourceManager.registerRecognition(recognition)

        let gotResult = false
        let started = false
        timerManager.clear('hangCheck')

        recognition.onstart = () => {
          started = true
          voiceState.transition(voiceState.states.RECORDING)
          recordingStartTimeRef.current = Date.now()
          setRecordingDuration(0)
          timerManager.set('duration', () => {
            setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000))
          }, 500)
        }
        recognition.onresult = (event) => {
          gotResult = true
          const result = event?.results?.[0]?.[0]
          if (result) {
            const transcript = result.transcript || ''
            if (transcript) {
              if (result.isFinal) {
                transcriptRef.current = transcript
              } else {
                handlePartialResult(transcript)
              }
            }
          }
        }
        if (typeof recognition.onnomatch !== 'undefined') {
          recognition.onnomatch = () => {}
        }
        recognition.onerror = (event) => {
          const code =
            (event && event.error) ||
            (event && event.message) ||
            (typeof event === 'string' && event) ||
            'unknown'
          const codeStr = String(code).toLowerCase()
          timerManager.clear('hangCheck')
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
          if (codeStr.includes('not-allowed') || codeStr.includes('permission') || codeStr.includes('notallowed')) {
            showMsg('麦克风权限被拒绝或语音识别服务被禁用，请在浏览器设置中允许后重试', 'error')
          } else if (codeStr.includes('service-not-allowed') || codeStr.includes('servicenotallowed')) {
            showMsg('语音识别服务被系统禁用，请检查浏览器的语音识别权限', 'error')
          } else if (codeStr.includes('no-speech') || codeStr.includes('nospeech')) {
            showMsg('未检测到语音，请靠近麦克风重新录制', 'error')
          } else if (codeStr.includes('audio-capture') || codeStr.includes('audiocapture')) {
            showMsg('未检测到麦克风设备，请检查硬件连接', 'error')
          } else if (codeStr.includes('language-not-supported') || codeStr.includes('languagenotsupported')) {
            showMsg('当前系统不支持中文语音识别', 'error')
          } else if (codeStr.includes('network')) {
            showMsg('语音识别需要网络连接，请检查网络后重试', 'error')
          } else if (codeStr.includes('aborted')) {
            return
          } else {
            showMsg('语音识别出现问题（' + code + '），请重试或切换到「在线语音 API」模式', 'error', [{ label: '去设置', onClick: goSettings }])
          }
        }
        recognition.onend = () => {
          timerManager.clear('hangCheck')
          const raw = transcriptRef.current || partialTranscriptRef.current
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
          if (raw) {
            handleCleanupAndWrite(raw)
          } else if (!gotResult) {
            if (started) {
              showMsg('未识别到语音内容，请重试或在「设置」中切换到「在线语音 API」模式', 'warn', [{ label: '去设置', onClick: goSettings }])
            } else {
              showMsg('语音识别未能启动，请重试或切换到「在线语音 API」模式', 'warn', [{ label: '去设置', onClick: goSettings }])
            }
          }
        }
        try {
          if (recognition.start) {
            await recognition.start()
          } else {
            throw new Error('recognition object has no start()')
          }
        } catch (err) {
          timerManager.clear('hangCheck')
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
          const msg = String((err && (err.message || err.name)) || 'unknown')
          const lowerMsg = msg.toLowerCase()
          if (lowerMsg.includes('notallowed') || lowerMsg.includes('permission') || lowerMsg.includes('not-allowed')) {
            showMsg('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问后重试', 'error')
          } else if (lowerMsg.includes('already started') || lowerMsg.includes('already')) {
            return
          } else {
            showMsg('语音识别启动失败（' + msg + '），请重试或切换到「在线语音 API」模式', 'error', [{ label: '去设置', onClick: goSettings }])
          }
          return
        }

        timerManager.set('hangCheck', () => {
          if (!started) {
            resourceManager.cleanupAll()
            voiceState.transition(voiceState.states.IDLE)
            voiceState.unlockMutex()
            showMsg('语音识别启动超时，请重试或切换到「在线语音 API」模式', 'warn', [{ label: '去设置', onClick: goSettings }])
            return
          }
          timerManager.set('hangCheck', () => {
            if (transcriptRef.current === '' && partialTranscriptRef.current === '') {
              resourceManager.cleanupAll()
              voiceState.transition(voiceState.states.IDLE)
              voiceState.unlockMutex()
              showMsg('语音识别响应超时，建议在「设置」中切换到「在线语音 API」模式', 'warn', [{ label: '去设置', onClick: goSettings }])
            }
          }, 15000)
        }, 5000)
        return
      }

      if (effectiveMode === 'whisper-api') {
        if (!isMediaRecorderSupported()) {
          voiceState.unlockMutex()
          showMsg('当前浏览器不支持录音功能，请尝试使用 Chrome / Edge', 'error')
          return
        }
        if (!isSecureContextForMic()) {
          voiceState.unlockMutex()
          showMsg('录音需要 HTTPS 环境，请在 HTTPS 或 localhost 下使用', 'error')
          return
        }
        const url = state?.speechApiUrl || ''
        const key = state?.speechApiKey || ''
        if (!url && !apiKey) {
          voiceState.unlockMutex()
          showMsg('语音识别需要配置 API Key，请在设置页面填写', 'warn', [{ label: '去设置', onClick: goSettings }])
          return
        }

        const recorder = createAudioRecorder(() => {})
        resourceManager.registerAudioRecorder(recorder)
        transcriptRef.current = ''
        try {
          await recorder.start()
          voiceState.transition(voiceState.states.RECORDING)
          recordingStartTimeRef.current = Date.now()
          setRecordingDuration(0)
          timerManager.set('duration', () => {
            setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000))
          }, 500)
        } catch (err) {
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
          showMsg(err?.message || '无法启动麦克风，请检查权限', 'error')
        }
        return
      }

      if (effectiveMode === 'iflytek-iat') {
        if (!isMediaRecorderSupported()) {
          voiceState.unlockMutex()
          showMsg('当前浏览器不支持录音功能，请尝试使用 Chrome / Edge', 'error')
          return
        }
        if (!isSecureContextForMic()) {
          voiceState.unlockMutex()
          showMsg('录音需要 HTTPS 环境，请在 HTTPS 或 localhost 下使用', 'error')
          return
        }
        if (!state.iflytekIatAppId || !state.iflytekIatApiKey || !state.iflytekIatApiSecret) {
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          showMsg('讯飞语音听写需要配置 APPID、APIKey 和 APISecret，请在设置中完成配置', 'error', [{ label: '去设置', onClick: goSettings }])
          return
        }

        const recorder = createAudioRecorder(() => {})
        resourceManager.registerAudioRecorder(recorder)
        transcriptRef.current = ''
        try {
          await recorder.start()
          voiceState.transition(voiceState.states.RECORDING)
          recordingStartTimeRef.current = Date.now()
          setRecordingDuration(0)
          timerManager.set('duration', () => {
            setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000))
          }, 500)
        } catch (err) {
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
          showMsg(err?.message || '无法启动麦克风，请检查权限', 'error')
        }
        return
      }

      if (effectiveMode === 'dashscope-asr') {
        if (!isMediaRecorderSupported()) {
          voiceState.unlockMutex()
          showMsg('当前浏览器不支持录音功能，请尝试使用 Chrome / Edge', 'error')
          return
        }
        if (!isSecureContextForMic()) {
          voiceState.unlockMutex()
          showMsg('录音需要 HTTPS 环境，请在 HTTPS 或 localhost 下使用', 'error')
          return
        }
        if (!state.dashscopeApiKey) {
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          showMsg('阿里云千问语音识别需要配置 API Key，请在「设置 → 语音识别」或「设置 → AI 服务」中完成配置', 'error', [{ label: '去设置', onClick: goSettings }])
          return
        }

        const recorder = createAudioRecorder(() => {})
        resourceManager.registerAudioRecorder(recorder)
        transcriptRef.current = ''
        try {
          await recorder.start()
          voiceState.transition(voiceState.states.RECORDING)
          recordingStartTimeRef.current = Date.now()
          setRecordingDuration(0)
          timerManager.set('duration', () => {
            setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000))
          }, 500)
        } catch (err) {
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
          showMsg(err?.message || '无法启动麦克风，请检查权限', 'error')
        }
        return
      }

      if (effectiveMode === 'vosk-offline') {
        if (!(await isVoskAvailable())) {
          voiceState.unlockMutex()
          showMsg('Vosk 离线识别插件不可用，请在「设置 → 语音识别」中检查', 'error', [{ label: '去设置', onClick: goSettings }])
          return
        }
        const modelInfo = await checkVoskModel()
        if (!modelInfo.hasModel) {
          voiceState.unlockMutex()
          showMsg('Vosk 语音模型未下载，请在「设置 → 语音识别」中下载模型', 'warn', [{ label: '去设置', onClick: goSettings }])
          return
        }
        if (!modelInfo.modelPath) {
          voiceState.unlockMutex()
          showMsg('Vosk 模型路径无效，请重新下载', 'error')
          return
        }
        try {
          await loadVoskModel(modelInfo.modelPath)
        } catch (e) {
          voiceState.unlockMutex()
          showMsg('加载 Vosk 模型失败: ' + (e.message || '未知错误'), 'error')
          return
        }
        transcriptRef.current = ''
        partialTranscriptRef.current = ''
        const removeListener = addVoskPartialListener((data) => {
          if (data.isFinal) {
            transcriptRef.current = data.text || ''
            setPartialText(data.text || '')
          } else {
            handlePartialResult(data.partial || '')
          }
        })
        resourceManager.registerVoskListener(removeListener)
        try {
          await startVoskListening()
          voiceState.transition(voiceState.states.RECORDING)
          recordingStartTimeRef.current = Date.now()
          setRecordingDuration(0)
          timerManager.set('duration', () => {
            setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000))
          }, 500)
        } catch (err) {
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
          showMsg('Vosk 启动失败: ' + (err?.message || '未知错误'), 'error')
        }
        return
      }

      voiceState.unlockMutex()
      showMsg(downgradeReason || '当前没有可用的语音识别方式，请在「设置」中切换语音识别模式', 'error', downgradeReason ? [] : [{ label: '去设置', onClick: goSettings }])
    } catch (e) {
      console.error('语音输入启动失败:', e)
      voiceState.transition(voiceState.states.IDLE)
      voiceState.unlockMutex()
      resourceManager.cleanupAll()
      showMsg('语音输入启动失败，请重试或切换到键盘输入', 'error')
    }
  }, [effectiveMode, state, showMsg, handleCleanupAndWrite, handlePartialResult, startNativeRecognition, goSettings, voiceState, resourceManager, timerManager])

  const stopRecognition = useCallback(() => {
    timerManager.clearAll()
    recordingStartTimeRef.current = null
    setAudioLevel(0)

    voiceState.transition(voiceState.states.CLEANING)

    if (effectiveMode === 'vosk-offline') {
      setPartialText('')
      stopVoskListening().then(text => {
        if (text && text.trim()) {
          transcriptRef.current = text
        }
      }).catch(() => {}).finally(() => {
        cancelVoskListening().catch(() => {})
        releaseVoskModel().catch(() => {})
        voiceState.transition(voiceState.states.IDLE)
        voiceState.unlockMutex()
        resourceManager.cleanupAll()
      })
      return
    }

    const arec = resourceManager.get('audio_recorder')
    if (arec) {
      voiceState.transition(voiceState.states.TRANSCRIBING)
      arec.stop()
        .then(async (result) => {
          if (!result || !result.blob) {
            voiceState.transition(voiceState.states.IDLE)
            voiceState.unlockMutex()
            resourceManager.cleanupAll()
            return
          }
          try {
            let text = ''
            const mode = state?.speechMode || effectiveMode
            if (mode === 'whisper-api') {
              const url = state?.speechApiUrl || ''
              const key = state?.speechApiKey || ''
              text = await transcribeWithWhisperAPI({
                blob: result.blob,
                fileName: result.fileName,
                apiUrl: url,
                apiKey: key,
                fallbackApiKey: apiKey,
                language: 'zh',
              })
              iflytekFailuresRef.current = 0
            } else if (mode === 'iflytek-iat') {
              text = await transcribeWithIflytek({
                blob: result.blob,
                appId: state.iflytekIatAppId,
                apiKey: state.iflytekIatApiKey,
                apiSecret: state.iflytekIatApiSecret,
              })
              iflytekFailuresRef.current = 0
            } else if (mode === 'dashscope-asr') {
              text = await transcribeWithDashscope({
                blob: result.blob,
                fileName: result.fileName,
                apiKey: state.dashscopeApiKey,
                language: 'zh',
              })
              iflytekFailuresRef.current = 0
            }
            if (!text) {
              showMsg('未识别到任何文字，请确保录音清晰后重试', 'error')
              voiceState.transition(voiceState.states.IDLE)
              voiceState.unlockMutex()
              resourceManager.cleanupAll()
              return
            }
            try {
              const isSparkMode = state.aiServiceMode === 'iflytek-spark'
              const isVolcanoMode = state.aiServiceMode === 'volcano'
              const isDashscopeMode = state.aiServiceMode === 'dashscope'
              const hasSparkCreds = !!state.iflytekSparkApiKey
              const hasVolcanoCreds = !!state.volcanoApiKey
              const hasDashscopeCreds = !!state.dashscopeApiKey
              const hasApiKey = !!apiKey
              const hasCreds = isSparkMode
                ? hasSparkCreds
                : isVolcanoMode
                  ? hasVolcanoCreds
                  : isDashscopeMode
                    ? hasDashscopeCreds
                    : hasApiKey

              if (hasCreds) {
                const effectiveModel = isSparkMode
                  ? state.iflytekSparkModel
                  : isVolcanoMode
                    ? state.volcanoModel
                    : isDashscopeMode
                      ? state.dashscopeModel
                      : (model || 'deepseek-v4-pro')
                const cleaned = await cleanUpSpeechText(
                  text, apiKey, effectiveModel, state.aiServiceMode,
                  state.iflytekSparkApiKey, state.iflytekSparkApiSecret,
                  state.volcanoApiKey, state.dashscopeApiKey,
                )
                onChange(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + cleaned)
                showMsg('识别完成，AI 已整理', 'success')
              } else {
                onChange(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + text)
                let tip = '识别完成（未配置 DeepSeek API Key，跳过整理）'
                if (isSparkMode) tip = '识别完成（未配置讯飞星火 APIPassword，跳过整理）'
                else if (isVolcanoMode) tip = '识别完成（未配置火山引擎 API Key，跳过整理）'
                else if (isDashscopeMode) tip = '识别完成（未配置千问 API Key，跳过整理）'
                showMsg(tip, 'success')
              }
            } catch (err) {
              onChange(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + text)
              showMsg('AI 整理失败：' + (err?.message || '未知错误') + '，已写入原始文本', 'error')
            }
          } catch (err) {
            const mode = state?.speechMode || effectiveMode
            let extraHint = ''
            if (mode === 'iflytek-iat') {
              iflytekFailuresRef.current += 1
              if (iflytekFailuresRef.current >= 2) {
                extraHint = '（讯飞连续失败，建议在设置中切换到浏览器内置语音识别或在线 Whisper API）'
              }
            }
            showMsg('语音识别失败：' + (err?.message || '未知错误') + extraHint, 'error')
          } finally {
            voiceState.transition(voiceState.states.IDLE)
            voiceState.unlockMutex()
            resourceManager.cleanupAll()
          }
        })
        .catch(() => {
          voiceState.transition(voiceState.states.IDLE)
          voiceState.unlockMutex()
          resourceManager.cleanupAll()
        })
      return
    }

    voiceState.transition(voiceState.states.IDLE)
    voiceState.unlockMutex()
    resourceManager.cleanupAll()
  }, [apiKey, model, onChange, state, showMsg, effectiveMode, voiceState, resourceManager, timerManager])

  // 保持 stopRecognitionRef 始终指向最新的 stopRecognition
  stopRecognitionRef.current = stopRecognition

  useEffect(() => {
    return () => {
      timerManager.clearAll()
      resourceManager.cleanupAll()
      voiceState.transition(voiceState.states.IDLE)
      voiceState.unlockMutex()
    }
  }, [timerManager, resourceManager, voiceState])

  useEffect(() => {
    if (!toolbarOpen) return
    const handleClickOutside = (e) => {
      setToolbarOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [toolbarOpen])

  const handleImageSelect = useCallback(
    (e, inputRef) => {
      const files = Array.from(e.target.files || [])
      if (!files.length) {
        showMsg('未选择图片', 'warn')
        return
      }

      const MAX_FILE_SIZE = 50 * 1024 * 1024
      const validFiles = files.filter(file => {
        const isValidType = file.type.startsWith('image/')
        const isValidSize = file.size <= MAX_FILE_SIZE
        if (!isValidType) {
          showMsg(`文件 "${file.name}" 不是有效的图片格式`, 'error')
        }
        if (!isValidSize) {
          showMsg(`文件 "${file.name}" 超过大小限制（50MB）`, 'error')
        }
        return isValidType && isValidSize
      })

      if (validFiles.length === 0) {
        showMsg('没有有效的图片文件', 'error')
        return
      }

      setToolbarOpen(false)
      setTimeout(() => { if (inputRef.current) inputRef.current.value = '' }, 200)
      setSelectedImageFiles(validFiles)
      setImageEditorOpen(true)
    },
    [showMsg],
  )

  const handleImageEditComplete = useCallback(
    async (editedBlob, currentIndex, totalCount) => {
      if (!editedBlob) {
        showMsg('图片处理失败', 'error')
        if (currentIndex === totalCount - 1) {
          setImageEditorOpen(false)
          setSelectedImageFiles([])
        } else {
          setSelectedImageFiles(prev => prev.slice(currentIndex + 1))
        }
        return
      }
      
      const file = new File([editedBlob], `edited_image_${currentIndex + 1}.jpg`, { type: 'image/jpeg' })
      
      try {
        await onImageOCR(file)
      } catch (err) {
        showMsg(`图片识别失败: ${err.message || '未知错误'}`, 'error')
      }
      
      if (currentIndex === totalCount - 1) {
        setImageEditorOpen(false)
        setSelectedImageFiles([])
      } else {
        setSelectedImageFiles(prev => prev.slice(currentIndex + 1))
      }
    },
    [onImageOCR, showMsg],
  )

  const handleImageEditCancel = useCallback(() => {
    setImageEditorOpen(false)
    setSelectedImageFiles([])
    showMsg('已取消图片编辑', 'info')
  }, [showMsg])

  const handleCamera = useCallback(async () => {
    const perm = await checkCameraPermission()
    if (perm.denied) {
      showPermissionDeniedDialog('相机权限被拒绝，无法拍照', openAppSettings)
      return
    }
    cameraInputRef.current?.click()
  }, [])

  const handleGallery = useCallback(async () => {
    const perm = await checkPhotosPermission()
    if (perm.denied) {
      showPermissionDeniedDialog('相册权限被拒绝，无法访问相册', openAppSettings)
      return
    }
    galleryInputRef.current?.click()
  }, [])


  const handleSubmit = () => {
    const t = value.trim()
    if (!t || ocrLoading || disabled || cleaning || starting) return
    const { prompt, text } = detectPrompt(t)
    onSubmit(text, { prompt })
  }

  const SUPPORTED_PROMPTS = [
    { key: '【总结】', label: '总结', description: '总结文本要点' },
    { key: '【问答】', label: '问答', description: '生成问答卡片' },
    { key: '【提炼】', label: '提炼', description: '提取知识点' },
    { key: '【翻译】', label: '翻译', description: '翻译文本' },
    { key: '【润色】', label: '润色', description: '优化文本表达' },
    { key: '【简化】', label: '简化', description: '简化复杂内容' },
  ]

  const detectPrompt = (text) => {
    for (const p of SUPPORTED_PROMPTS) {
      if (text.startsWith(p.key)) {
        return { prompt: p.key, text: text.slice(p.key.length).trim() }
      }
    }
    return { prompt: null, text }
  }

  const cancelRecording = useCallback(() => {
    timerManager.clearAll()
    voiceState.transition(voiceState.states.IDLE)
    voiceState.unlockMutex()
    resourceManager.cleanupAll()
    showMsg('已取消录音', 'info')
  }, [showMsg, voiceState, resourceManager, timerManager])

  const handleMicPointerDown = useCallback(async () => {
    if (disabled || cleaning || starting) return
    pressedRef.current = true
    pressStartTimeRef.current = Date.now()
    if (recording) return
    transcriptRef.current = ''
    partialTranscriptRef.current = ''
    voiceState.transition(voiceState.states.STARTING)
    await startRecognition()
    timerManager.set('longPress', () => {
      if (recording) {
        stopRecognition()
        showMsg('录音已自动停止（超过 60 秒）', 'info')
      }
    }, MAX_RECORDING_DURATION)
  }, [disabled, cleaning, recording, starting, stopRecognition, startRecognition, showMsg, voiceState, timerManager])

  const handleMicPointerUp = useCallback(() => {
    pressedRef.current = false
    if (!recording) return
    const elapsed = Date.now() - pressStartTimeRef.current
    if (elapsed >= 300) {
      // 长按（≥300ms）：松开即停止
      stopRecognition()
    }
    // 短按（<300ms）视为 tap，由 onClick 处理 toggle
  }, [recording, stopRecognition])

  const handleMicClick = useCallback(async () => {
    if (disabled || cleaning) return
    if (starting) {
      cancelRecording()
      return
    }
    const elapsed = Date.now() - pressStartTimeRef.current
    if (elapsed >= 300) {
      return
    }
    if (recording) {
      stopRecognition()
    } else {
      transcriptRef.current = ''
      partialTranscriptRef.current = ''
      voiceState.transition(voiceState.states.STARTING)
      await startRecognition()
      timerManager.set('longPress', () => {
        if (recording) {
          stopRecognition()
          showMsg('录音已自动停止（超过 60 秒）', 'info')
        }
      }, MAX_RECORDING_DURATION)
    }
  }, [disabled, cleaning, recording, starting, stopRecognition, startRecognition, showMsg, cancelRecording, voiceState, timerManager])

  const busy = recording || starting || cleaning || ocrLoading

  return (
    <>
      {/* ============ 辅行工具栏 ============ */}
      <div style={{
        maxHeight: toolbarOpen ? '100px' : '0',
        overflow: 'hidden',
        marginBottom: toolbarOpen ? '6px' : '0',
        opacity: toolbarOpen ? 1 : 0,
        transition: 'max-height 0.25s ease, margin-bottom 0.25s ease, opacity 0.2s ease',
        pointerEvents: toolbarOpen ? 'auto' : 'none',
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          width: '100%',
          marginBottom: '8px',
        }}>
          <button onClick={handleCamera} disabled={disabled || cleaning || ocrLoading} aria-label="拍照识别" style={{
            flex: 1, minHeight: '38px', padding: '6px 10px', borderRadius: '10px',
            backgroundColor: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
            color: 'var(--color-text)', fontSize: '12px', fontWeight: 500,
            cursor: (disabled || cleaning || ocrLoading) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            transition: 'all 0.15s ease', opacity: (disabled || cleaning || ocrLoading) ? 0.45 : 1,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            拍照
          </button>
          <button onClick={handleGallery} disabled={disabled || cleaning || ocrLoading} aria-label="从相册选取" style={{
            flex: 1, minHeight: '38px', padding: '6px 10px', borderRadius: '10px',
            backgroundColor: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
            color: 'var(--color-text)', fontSize: '12px', fontWeight: 500,
            cursor: (disabled || cleaning || ocrLoading) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            transition: 'all 0.15s ease', opacity: (disabled || cleaning || ocrLoading) ? 0.45 : 1,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            相册
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {SUMMARY_LEVELS.map((level) => {
            const isActive = summaryLevel === level.value
            return (
              <button key={level.value} onClick={() => onSummaryLevelChange && onSummaryLevelChange(level.value)} style={{
                flex: 1, minHeight: '32px', padding: '3px 4px', borderRadius: '8px',
                border: isActive ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                backgroundColor: isActive ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: isActive ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                fontSize: '11px', fontWeight: isActive ? 600 : 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}>{level.label}</button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {SUPPORTED_PROMPTS.map((p) => (
            <button
              key={p.key}
              onClick={() => onChange(() => p.key + ' ' + value)}
              style={{
                padding: '4px 10px', borderRadius: '16px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              title={p.description}
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>

      {/* ============ 主行 ============ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
        {/* [▾] 展开箭头 */}
        <button onClick={(e) => { e.stopPropagation(); setToolbarOpen(!toolbarOpen) }} disabled={disabled || cleaning || starting} aria-label={toolbarOpen ? '收起工具栏' : '展开工具栏'} style={{
          width: '28px', height: '44px', flexShrink: 0, borderRadius: '8px',
          backgroundColor: 'transparent', color: 'var(--color-text-muted)', border: 'none',
          cursor: (disabled || cleaning || starting) ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease', opacity: (disabled || cleaning) ? 0.45 : 1,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: toolbarOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}><path d="M6 9l6 6 6-6"/></svg>
        </button>

        {/* 输入框 */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <textarea 
            ref={textareaRef}
            value={value} 
            onChange={(e) => { onChange(() => e.target.value); setTimeout(autoResize, 0) }} 
            placeholder="输入背诵内容" 
            disabled={disabled || cleaning} 
            style={{
              width: '100%', boxSizing: 'border-box', padding: '11px 30px 11px 16px', borderRadius: '16px',
              backgroundColor: 'var(--color-bg)', border: '1.5px solid var(--color-border)',
              color: 'var(--color-text)', fontSize: '15px', lineHeight: 1.5, resize: 'none', outline: 'none',
              overflowY: 'hidden',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', transition: 'all 0.15s ease',
            }} 
            onFocus={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface)'; e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-alpha)' }} 
            onBlur={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg)'; e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none' }} 
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              setDraftText(value)
              setExpandOpen(true)
              setTimeout(() => panelTextareaRef.current?.focus(), 100)
            }}
            disabled={disabled || cleaning}
            aria-label="展开文本编辑"
            style={{
              position: 'absolute',
              right: '4px',
              top: '11px',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--color-text-muted)',
              border: 'none',
              cursor: (disabled || cleaning) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: (disabled || cleaning) ? 0.35 : 0.7,
              transition: 'opacity 0.15s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>

        {/* 麦克风按钮 */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button 
            onMouseDown={handleMicPointerDown}
            onMouseUp={handleMicPointerUp}
            onMouseLeave={() => { if (pressedRef.current) { pressedRef.current = false; if (recording || starting) stopRecognition() } }}
            onTouchStart={(e) => { e.preventDefault(); handleMicPointerDown() }}
            onTouchEnd={(e) => { e.preventDefault(); handleMicPointerUp() }}
            onTouchCancel={(e) => { e.preventDefault(); pressedRef.current = false; if (recording || starting) stopRecognition() }}
            onClick={handleMicClick}
            disabled={disabled || ocrLoading || cleaning} 
            aria-label={recording ? '停止录音' : '语音输入'} 
            style={{
              width: '44px', 
              height: '44px', 
              flexShrink: 0, 
              borderRadius: '50%',
              backgroundColor: recording ? 'var(--color-danger)' : (starting ? 'var(--color-primary-light)' : 'var(--color-surface)'), 
              color: recording ? '#ffffff' : 'var(--color-primary)',
              border: 'none', 
              cursor: (disabled || ocrLoading || cleaning) ? 'not-allowed' : 'pointer',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              transition: 'all 0.2s ease', 
              opacity: (disabled || ocrLoading || cleaning) ? 0.5 : 1,
              /* D-14：starting 状态保留可见性，用脉冲动画提示正在初始化 */
              boxShadow: recording ? '0 0 0 4px rgba(239,68,68,0.25), 0 2px 8px rgba(239,68,68,0.4)' : (starting ? '0 0 0 4px rgba(59,130,246,0.25), 0 2px 8px rgba(59,130,246,0.3)' : '0 2px 8px rgba(0,0,0,0.12)'),
              animation: recording ? 'mic-pulse 1.2s ease-in-out infinite' : (starting ? 'mic-pulse 0.8s ease-in-out infinite' : 'none'),
            }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {recording ? (<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="currentColor"/>) : (<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>)}
            </svg>
          </button>
          {/* D-14：starting 状态显示"准备中"小气泡 */}
          {starting && (
            <div style={{
              position: 'absolute', bottom: '-22px', left: '50%', transform: 'translateX(-50%)',
              fontSize: '10px', color: 'var(--color-primary)', whiteSpace: 'nowrap',
              padding: '2px 6px', backgroundColor: 'var(--color-primary-light)',
              borderRadius: '4px', pointerEvents: 'none',
            }}>
              准备中
            </div>
          )}
          
          {/* 录音计时器 */}
          {recording && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              translate: 'calc(100% + 4px) 0',
              fontSize: 11,
              fontWeight: 600,
              color: recordingDuration >= 60 ? 'var(--color-warning)' : 'var(--color-danger)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              animation: recordingDuration >= 60 ? 'blink 0.6s ease-in-out infinite' : 'none',
              pointerEvents: 'none',
            }}>
              {fmt(recordingDuration)}
            </div>
          )}
          
          {recording && (
            <div style={{
              position: 'absolute',
              left: '50%',
              bottom: '-24px',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '2px',
              height: '16px',
              padding: '2px 4px',
              backgroundColor: 'var(--color-surface)',
              borderRadius: '4px',
              pointerEvents: 'none',
            }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    width: '3px',
                    height: `${Math.max(2, Math.min(14, audioLevel * 14 * (i + 1) / 5))}px`,
                    backgroundColor: audioLevel > 0.6 ? 'var(--color-danger)' : 'var(--color-success)',
                    borderRadius: '1px',
                    transition: 'height 0.1s ease',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* [↑] 发送 */}
        <button onClick={handleSubmit} disabled={!value.trim() || ocrLoading || disabled || cleaning || starting} aria-label="生成卡片" style={{
          width: '44px', height: '44px', flexShrink: 0, borderRadius: '12px',
          backgroundColor: 'var(--color-success)', color: '#ffffff', border: 'none',
          cursor: (!value.trim() || ocrLoading || disabled || cleaning || starting) ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease', opacity: ((!value.trim() || ocrLoading || disabled || cleaning || starting)) ? 0.45 : 1,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>

      {/* 忙碌状态条 */}
      {busy && (
        <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '10px', backgroundColor: starting ? 'var(--color-warning-light)' : cleaning ? 'var(--color-primary-light)' : (recording ? 'var(--color-danger-light)' : 'var(--color-primary-light)'), color: starting ? 'var(--color-warning-dark)' : cleaning ? 'var(--color-primary-dark)' : (recording ? 'var(--color-danger)' : 'var(--color-primary-dark)'), fontSize: '12px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {starting && !recording && (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg><span>正在启动语音识别…</span></>)}
          {recording && (<><span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-danger)', animation: 'blink 0.8s ease-in-out infinite', flexShrink: 0 }} /><span>正在录音 {fmt(recordingDuration)}</span></>)}
          {recording && partialText && (
            <div style={{
              marginTop: '4px', padding: '6px 10px', borderRadius: '8px',
              backgroundColor: 'var(--color-bg)', color: 'var(--color-text)',
              fontSize: '13px', lineHeight: 1.5, width: '100%',
              wordBreak: 'break-all', textAlign: 'left',
            }}>
              {partialText}
            </div>
          )}
          {cleaning && !recording && !starting && (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg><span>{transcribing ? '正在识别语音…' : 'AI 正在整理...'}</span></>)}
          {ocrLoading && !recording && !cleaning && !starting && (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M4 12a8 8 0 018-8" fill="none"/></svg><span>正在识别图片...</span></>)}
        </div>
      )}

      {/* ============ 多行文本展开底部面板 ============ */}
      {expandOpen && (
        <div
          className="expand-panel-overlay"
          onClick={(e) => {
            e.stopPropagation()
            setExpandOpen(false)
          }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            animation: 'expandPanelFadeIn 0.2s ease',
          }}
        >
          <div
            className="expand-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '540px',
              maxHeight: '85vh',
              backgroundColor: 'var(--color-surface)',
              borderRadius: '20px 20px 0 0',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              animation: 'expandPanelSlideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* 标题栏 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px 10px',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>编辑文本</span>
              <button
                onClick={() => setExpandOpen(false)}
                aria-label="关闭"
                style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  backgroundColor: 'transparent', color: 'var(--color-text-muted)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px',
                }}
              >✕</button>
            </div>

            {/* 文本区域 */}
            <textarea
              ref={panelTextareaRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="输入背诵内容"
              className="expand-panel-textarea"
              style={{
                flex: 1,
                minHeight: '200px',
                padding: '14px 16px',
                border: 'none',
                outline: 'none',
                fontSize: '15px',
                lineHeight: 1.6,
                color: 'var(--color-text)',
                backgroundColor: 'var(--color-bg)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                resize: 'none',
                margin: '8px 12px',
                borderRadius: '12px',
              }}
            />

            {/* 底部按钮 */}
            <div style={{
              display: 'flex',
              gap: '10px',
              padding: '10px 16px 14px',
              borderTop: '1px solid var(--color-border)',
            }}>
              <button
                onClick={() => setExpandOpen(false)}
                style={{
                  flex: 1, minHeight: '44px', padding: '10px 16px',
                  borderRadius: '12px', border: '1.5px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)', color: 'var(--color-text)',
                  fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                }}
              >取消</button>
              <button
                onClick={() => {
                  onChange(() => draftText)
                  setExpandOpen(false)
                }}
                style={{
                  flex: 1, minHeight: '44px', padding: '10px 16px',
                  borderRadius: '12px', border: 'none',
                  backgroundColor: 'var(--color-primary)', color: '#ffffff',
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleImageSelect(e, cameraInputRef)} style={{ display: 'none' }}/>
      <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={(e) => handleImageSelect(e, galleryInputRef)} style={{ display: 'none' }}/>

      {/* 图片编辑界面 */}
      {imageEditorOpen && selectedImageFiles.length > 0 && (
        <ImageEditor
          imageFiles={selectedImageFiles}
          onComplete={handleImageEditComplete}
          onCancel={handleImageEditCancel}
        />
      )}
    </>
  )
}