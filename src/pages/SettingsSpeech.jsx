import { useApp } from '../context/AppContext'
import { SPEECH_MODES } from '../utils/constants'
import { useBackgroundTask, TASK_STATUS, TASK_TYPE } from '../context/BackgroundTaskContext'
import {
  testSpeechApiConnection,
  testIflytekConnection,
  testDashscopeSpeechConnection,
  testIflytekBigModelConnection,
  testIflytekRtasrStdConnection,
  testIflytekRtasrLlmConnection,
  testIflytekOstConnection,
  transcribeWithWhisperAPI,
  transcribeWithIflytek,
  transcribeWithDashscope,
  transcribeWithIflytekBigModel,
  transcribeWithIflytekRtasrStd,
  transcribeWithIflytekRtasrLlm,
  transcribeWithIflytekOst,
} from '../services/transcribe'
import { isVoskAvailable, checkVoskModel, VOSK_MODELS, downloadVoskModel, downloadVoskModelWithFallback, cancelVoskDownload, deleteVoskModel, addVoskDownloadListener, importVoskModel, loadVoskModel, getVoskDownloadStatus, getOrderedSources, getDefaultSourceKey, VOSK_DOWNLOAD_PAGE_URL, startVoskListening, stopVoskListening, addVoskResultListener } from '../services/voskService'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SettingsSpeech() {
  const {
    state,
    setSpeechMode,
    setSpeechApiUrl,
    setSpeechApiKey,
    setIflytekIatAppId,
    setIflytekIatApiKey,
    setIflytekIatApiSecret,
    setIflytekBigModelAppId,
    setIflytekBigModelApiKey,
    setIflytekBigModelApiSecret,
    setIflytekRtasrStdAppId,
    setIflytekRtasrStdApiKey,
    setIflytekRtasrLlmAppId,
    setIflytekRtasrLlmAccessKeyId,
    setIflytekRtasrLlmAccessKeySecret,
    setIflytekOstAppId,
    setIflytekOstApiKey,
    setIflytekOstApiSecret,
    setDashscopeApiKey,
    showToast,
  } = useApp()
  const navigate = useNavigate()
  const { startTask } = useBackgroundTask()

  // 语音识别相关本地状态 - OpenAI Whisper API
  const [localSpeechApiUrl, setLocalSpeechApiUrl] = useState(state.speechApiUrl)
  const [localSpeechApiKey, setLocalSpeechApiKey] = useState(state.speechApiKey)
  const [localSpeechApiKeyShow, setLocalSpeechApiKeyShow] = useState(false)
  const [speechTestTesting, setSpeechTestTesting] = useState(false)
  const [speechTestStatus, setSpeechTestStatus] = useState(null)

  // 语音识别服务 - 讯飞语音听写(IAT)独立配置
  const [localIflytekIatAppId, setLocalIflytekIatAppId] = useState(state.iflytekIatAppId)
  const [localIflytekIatApiKey, setLocalIflytekIatApiKey] = useState(state.iflytekIatApiKey)
  const [localIflytekIatApiSecret, setLocalIflytekIatApiSecret] = useState(state.iflytekIatApiSecret)
  const [localIflytekIatApiSecretShow, setLocalIflytekIatApiSecretShow] = useState(false)
  const [iflytekTestTesting, setIflytekTestTesting] = useState(false)
  const [iflytekTestStatus, setIflytekTestStatus] = useState(null)

  // 讯飞中英识别大模型
  const [localIflytekBigModelAppId, setLocalIflytekBigModelAppId] = useState(state.iflytekBigModelAppId)
  const [localIflytekBigModelApiKey, setLocalIflytekBigModelApiKey] = useState(state.iflytekBigModelApiKey)
  const [localIflytekBigModelApiSecret, setLocalIflytekBigModelApiSecret] = useState(state.iflytekBigModelApiSecret)
  const [localIflytekBigModelApiSecretShow, setLocalIflytekBigModelApiSecretShow] = useState(false)
  const [iflytekBigModelTestTesting, setIflytekBigModelTestTesting] = useState(false)
  const [iflytekBigModelTestStatus, setIflytekBigModelTestStatus] = useState(null)

  // 讯飞实时语音转写标准版
  const [localIflytekRtasrStdAppId, setLocalIflytekRtasrStdAppId] = useState(state.iflytekRtasrStdAppId)
  const [localIflytekRtasrStdApiKey, setLocalIflytekRtasrStdApiKey] = useState(state.iflytekRtasrStdApiKey)
  const [localIflytekRtasrStdApiKeyShow, setLocalIflytekRtasrStdApiKeyShow] = useState(false)
  const [iflytekRtasrStdTestTesting, setIflytekRtasrStdTestTesting] = useState(false)
  const [iflytekRtasrStdTestStatus, setIflytekRtasrStdTestStatus] = useState(null)

  // 讯飞实时语音转写大模型
  const [localIflytekRtasrLlmAppId, setLocalIflytekRtasrLlmAppId] = useState(state.iflytekRtasrLlmAppId)
  const [localIflytekRtasrLlmAccessKeyId, setLocalIflytekRtasrLlmAccessKeyId] = useState(state.iflytekRtasrLlmAccessKeyId)
  const [localIflytekRtasrLlmAccessKeySecret, setLocalIflytekRtasrLlmAccessKeySecret] = useState(state.iflytekRtasrLlmAccessKeySecret)
  const [localIflytekRtasrLlmAccessKeySecretShow, setLocalIflytekRtasrLlmAccessKeySecretShow] = useState(false)
  const [iflytekRtasrLlmTestTesting, setIflytekRtasrLlmTestTesting] = useState(false)
  const [iflytekRtasrLlmTestStatus, setIflytekRtasrLlmTestStatus] = useState(null)

  // 讯飞极速录音转写大模型
  const [localIflytekOstAppId, setLocalIflytekOstAppId] = useState(state.iflytekOstAppId)
  const [localIflytekOstApiKey, setLocalIflytekOstApiKey] = useState(state.iflytekOstApiKey)
  const [localIflytekOstApiSecret, setLocalIflytekOstApiSecret] = useState(state.iflytekOstApiSecret)
  const [localIflytekOstApiSecretShow, setLocalIflytekOstApiSecretShow] = useState(false)
  const [iflytekOstTestTesting, setIflytekOstTestTesting] = useState(false)
  const [iflytekOstTestStatus, setIflytekOstTestStatus] = useState(null)

  // 阿里云千问语音识别（Paraformer）— 复用 DashScope API Key
  const [localDashscopeAsrKey, setLocalDashscopeAsrKey] = useState(state.dashscopeApiKey)
  const [localDashscopeAsrKeyShow, setLocalDashscopeAsrKeyShow] = useState(false)
  const [dashscopeAsrTestTesting, setDashscopeAsrTestTesting] = useState(false)
  const [dashscopeAsrTestStatus, setDashscopeAsrTestStatus] = useState(null)

  // Vosk 状态提前声明（供测试面板引用，避免暂时性死区）
  const [voskAvailable, setVoskAvailable] = useState(false)
  const [voskModelInfo, setVoskModelInfo] = useState(null)

  // 语音识别功能测试面板
  const [testRecording, setTestRecording] = useState(false)
  const [testTranscribing, setTestTranscribing] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [testError, setTestError] = useState('')
  const [testRealTimeText, setTestRealTimeText] = useState('')
  const [testLogs, setTestLogs] = useState([])
  const [testLogOpen, setTestLogOpen] = useState(false)
  const testRecorderRef = useRef(null)
  const testResultListenerRef = useRef(null)
  const testPartialListenerRef = useRef(null)
  const testStartTimeRef = useRef(null)

  const addTestLog = (level, step, message, detail = null) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0')
    setTestLogs((prev) => [...prev, { level, step, message, detail, timestamp }])
  }

  // 实时语音模式判断
  const isRealTimeMode = (() => {
    const mode = state.speechMode
    return mode === 'vosk-offline' || mode === 'web-speech' ||
           mode === 'iflytek-rtasr-std' || mode === 'iflytek-rtasr-llm'
  })()

  const testMediaStreamRef = useRef(null)

  const startTestRecording = useCallback(async () => {
    setTestResult('')
    setTestError('')
    setTestRealTimeText('')
    setTestLogs([])
    setTestLogOpen(true)
    testStartTimeRef.current = Date.now()
    const mode = state.speechMode
    addTestLog('info', '初始化', `当前模式: ${mode}`)
    addTestLog('info', '配置', `实时模式: ${isRealTimeMode ? '是' : '否'}`)

    if (mode === 'vosk-offline') {
      if (!voskAvailable || !voskModelInfo?.hasModel) {
        addTestLog('error', '模型检查', 'Vosk 模型未就绪，请先下载模型')
        showToast('Vosk 模型未就绪，请先下载模型', 'warn')
        return
      }
      addTestLog('info', '模型检查', `Vosk 模型就绪: ${voskModelInfo?.modelName || 'unknown'}`)
      try {
        addTestLog('info', '录音启动', '正在启动 Vosk 实时识别...')
        setTestRecording(true)
        testResultListenerRef.current = addVoskResultListener((text) => {
          if (text) {
            setTestRealTimeText((prev) => prev + text)
          }
        })
        await startVoskListening()
        addTestLog('success', '录音启动', 'Vosk 实时识别已启动，开始说话...')
      } catch (e) {
        const errDetail = {
          name: e?.name || 'Error',
          message: e?.message || '启动录音失败',
          stack: e?.stack || '',
        }
        addTestLog('error', '录音启动', '启动录音失败: ' + (e?.message || '未知错误'), errDetail)
        console.error('[语音测试] 启动Vosk失败:', e)
        setTestRecording(false)
        setTestError(e?.message || '启动录音失败')
        showToast('启动录音失败：' + (e?.message || '未知错误'), 'error')
      }
      return
    }

    // Web Speech 或其他非 Vosk 模式：用 MediaRecorder 录音
    try {
      addTestLog('info', '麦克风', '正在请求麦克风权限...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      testMediaStreamRef.current = stream
      addTestLog('success', '麦克风', '麦克风权限已获取')
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      addTestLog('info', '录音启动', `使用编码: ${mimeType}`)
      const recorder = new MediaRecorder(stream, { mimeType })
      testRecorderRef.current = recorder
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        const duration = ((Date.now() - testStartTimeRef.current) / 1000).toFixed(2)
        stream.getTracks().forEach((t) => t.stop())
        testMediaStreamRef.current = null
        const blob = new Blob(chunks, { type: mimeType })
        addTestLog('info', '录音结束', `录音结束，时长 ${duration}s，文件大小 ${(blob.size / 1024).toFixed(1)} KB`)
        await handleTestTranscribe(blob, mimeType)
      }
      recorder.start()
      setTestRecording(true)
      addTestLog('success', '录音启动', '录音已开始，请说话...')
    } catch (e) {
      const errDetail = {
        name: e?.name || 'Error',
        message: e?.message || '无法访问麦克风',
        stack: e?.stack || '',
      }
      addTestLog('error', '麦克风', '无法访问麦克风: ' + (e?.message || '未知错误'), errDetail)
      console.error('[语音测试] 麦克风访问失败:', e)
      setTestError(e?.message || '无法访问麦克风')
      showToast('无法访问麦克风：' + (e?.message || '未知错误'), 'error')
    }
  }, [state.speechMode, voskAvailable, voskModelInfo, showToast, isRealTimeMode])

  const stopTestRecording = useCallback(async () => {
    const mode = state.speechMode
    if (mode === 'vosk-offline') {
      try {
        await stopVoskListening()
        const duration = ((Date.now() - testStartTimeRef.current) / 1000).toFixed(2)
        addTestLog('info', '录音结束', `录音结束，时长 ${duration}s`)
      } catch (e) {
        addTestLog('error', '录音结束', '停止录音失败: ' + (e?.message || '未知错误'))
      }
      if (testResultListenerRef.current) {
        testResultListenerRef.current()
        testResultListenerRef.current = null
      }
      setTestRecording(false)
      setTestResult(testRealTimeText || '(无识别结果)')
      if (testRealTimeText) {
        addTestLog('success', '识别完成', `实时识别完成，结果长度: ${testRealTimeText.length} 字符`, testRealTimeText)
      } else {
        addTestLog('warn', '识别完成', '未检测到语音输入')
      }
      return
    }
    const recorder = testRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      setTestRecording(false)
    }
  }, [state.speechMode, testRealTimeText])

  const handleTestTranscribe = useCallback(async (blob, mimeType) => {
    setTestTranscribing(true)
    setTestError('')
    const transcribeStart = Date.now()
    try {
      const mode = state.speechMode
      let text = ''
      const fileName = `test_${Date.now()}.${mimeType.includes('webm') ? 'webm' : 'm4a'}`
      addTestLog('info', '识别开始', `调用 ${mode} 识别接口...`)

      if (mode === 'whisper-api') {
        addTestLog('info', '接口配置', `API地址: ${state.speechApiUrl}, 使用备用Key: ${state.speechApiKey ? '否' : '是(走主Key)'}`)
        text = await transcribeWithWhisperAPI({
          blob,
          fileName,
          apiUrl: state.speechApiUrl,
          apiKey: state.speechApiKey,
          fallbackApiKey: state.apiKey,
          language: 'zh',
        })
      } else if (mode === 'iflytek-iat') {
        addTestLog('info', '接口配置', `AppID: ${state.iflytekIatAppId ? '已配置' : '未配置'}`)
        text = await transcribeWithIflytek({
          blob,
          appId: state.iflytekIatAppId,
          apiKey: state.iflytekIatApiKey,
          apiSecret: state.iflytekIatApiSecret,
        })
      } else if (mode === 'iflytek-bigmodel') {
        addTestLog('info', '接口配置', `AppID: ${state.iflytekBigModelAppId ? '已配置' : '未配置'}`)
        text = await transcribeWithIflytekBigModel({
          blob,
          appId: state.iflytekBigModelAppId,
          apiKey: state.iflytekBigModelApiKey,
          apiSecret: state.iflytekBigModelApiSecret,
        })
      } else if (mode === 'iflytek-rtasr-std') {
        addTestLog('info', '接口配置', `AppID: ${state.iflytekRtasrStdAppId ? '已配置' : '未配置'}`)
        text = await transcribeWithIflytekRtasrStd({
          blob,
          appId: state.iflytekRtasrStdAppId,
          apiKey: state.iflytekRtasrStdApiKey,
        })
      } else if (mode === 'iflytek-rtasr-llm') {
        addTestLog('info', '接口配置', `AppID: ${state.iflytekRtasrLlmAppId ? '已配置' : '未配置'}`)
        text = await transcribeWithIflytekRtasrLlm({
          blob,
          appId: state.iflytekRtasrLlmAppId,
          accessKeyId: state.iflytekRtasrLlmAccessKeyId,
          accessKeySecret: state.iflytekRtasrLlmAccessKeySecret,
        })
      } else if (mode === 'iflytek-ost') {
        addTestLog('info', '接口配置', `AppID: ${state.iflytekOstAppId ? '已配置' : '未配置'}`)
        text = await transcribeWithIflytekOst({
          blob,
          appId: state.iflytekOstAppId,
          apiKey: state.iflytekOstApiKey,
          apiSecret: state.iflytekOstApiSecret,
          language: 'zh',
        })
      } else if (mode === 'dashscope-asr') {
        addTestLog('info', '接口配置', `DashScope Key: ${state.dashscopeApiKey ? '已配置' : '未配置'}`)
        text = await transcribeWithDashscope({
          blob,
          fileName,
          apiKey: state.dashscopeApiKey,
          language: 'zh',
        })
      } else if (mode === 'web-speech') {
        text = '（浏览器语音模式请在输入栏直接使用，测试面板暂不支持该模式）'
        addTestLog('info', '模式说明', text)
      } else {
        text = '（当前模式暂不支持测试）'
        addTestLog('warn', '模式说明', text)
      }

      const duration = ((Date.now() - transcribeStart) / 1000).toFixed(2)
      setTestResult(text || '(无识别结果)')
      addTestLog('success', '识别完成', `识别成功，耗时 ${duration}s，结果长度: ${text?.length || 0} 字符`, text)
      showToast('识别完成', 'success')
    } catch (e) {
      const duration = ((Date.now() - transcribeStart) / 1000).toFixed(2)
      const errMsg = e?.message || '识别失败'
      const errDetail = {
        name: e?.name || 'Error',
        message: errMsg,
        stack: e?.stack || '',
        status: e?.status || e?.statusCode || e?.code || null,
        ...(typeof e === 'object' && e !== null ? Object.fromEntries(Object.entries(e).filter(([k]) => !['stack', 'message', 'name', 'status', 'statusCode', 'code'].includes(k))) : {}),
      }
      setTestError(errMsg)
      addTestLog('error', '识别失败', `识别失败，耗时 ${duration}s，错误: ${errMsg}`, errDetail)
      console.error('[语音测试] 识别失败:', e)
      showToast('识别失败：' + errMsg, 'error')
    } finally {
      setTestTranscribing(false)
    }
  }, [state, showToast])

  // Vosk 离线语音识别
  const [voskChecking, setVoskChecking] = useState(false)
  const [voskDownloading, setVoskDownloading] = useState(false)
  const [voskDownloadProgress, setVoskDownloadProgress] = useState(0)
  const [voskDownloadedMB, setVoskDownloadedMB] = useState('')
  const [voskDownloadStage, setVoskDownloadStage] = useState('')
  const [voskDownloadError, setVoskDownloadError] = useState('')
  const [voskDownloadErrorCode, setVoskDownloadErrorCode] = useState('')
  const [voskDownloadSuggestion, setVoskDownloadSuggestion] = useState('')
  const [selectedVoskModel, setSelectedVoskModel] = useState(VOSK_MODELS[0].id)
  const [voskModelSwitchOpen, setVoskModelSwitchOpen] = useState(false)
  const [voskDownloadListener, setVoskDownloadListener] = useState(null)
  const [downloadSource, setDownloadSource] = useState(getDefaultSourceKey(VOSK_MODELS[0].id)) // primary | archive | lanzou
  const [voskDownloadStatus, setVoskDownloadStatus] = useState('') // 自定义状态文本（如蓝奏云解析中）
  const [currentDownloadSource, setCurrentDownloadSource] = useState('') // 当前正在使用的下载源名称
  // 下载速度计算（基于 downloaded 字节增量与时间差）
  const [downloadSpeedText, setDownloadSpeedText] = useState('')
  const lastDownloadSnapRef = useRef(null) // { bytes, time }

  // 用 ref 存储最新的状态值，供 setInterval 回调使用（避免闭包陷阱）
  const stateRef = useRef({ voskDownloadStage: '', voskDownloading: false })
  stateRef.current = { voskDownloadStage, voskDownloading }

  // 轮询定时器引用
  const pollIntervalRef = useRef(null)

  useEffect(() => {
    try {
      const available = isVoskAvailable()
      setVoskAvailable(available)
      if (available) {
        checkModelStatus()
        const listener = addVoskDownloadListener(handleDownloadProgress)
        setVoskDownloadListener(listener)
        return () => {
          if (listener) listener()
          stopPolling()
        }
      }
    } catch (e) {
      console.error('[SettingsSpeech] 初始化失败:', e)
    }
  }, [])

  const checkModelStatus = async () => {
    setVoskChecking(true)
    try {
      const info = await checkVoskModel()
      setVoskModelInfo(info)
    } catch (e) {
      console.error('检查Vosk模型失败:', e)
    } finally {
      setVoskChecking(false)
    }
  }

  const handleDownloadProgress = (data) => {
    if (data.sourceChanged && data.toSource) {
      setCurrentDownloadSource(data.toSource)
    }
    if (data.source) {
      setCurrentDownloadSource(data.source)
    }
    if (data.stage === 'downloading' || data.stage === 'importing') {
      setVoskDownloadStage(data.stage)
      // 保留 -1 表示总大小未知，由 UI 层用 downloadedMB 展示
      setVoskDownloadProgress(typeof data.progress === 'number' ? data.progress : 0)
      setVoskDownloadedMB(data.downloadedMB || '')
      // 自定义状态文本（蓝奏云解析阶段会带 status 字段）
      setVoskDownloadStatus(data.status || '')

      // 计算下载速度（仅在 downloading 阶段，且 downloaded 是有效数字）
      if (data.stage === 'downloading' && typeof data.downloaded === 'number' && data.downloaded >= 0) {
        const now = Date.now()
        const last = lastDownloadSnapRef.current
        if (last && now > last.time) {
          const dt = (now - last.time) / 1000 // 秒
          const db = data.downloaded - last.bytes // 字节增量
          if (dt > 0 && db >= 0) {
            const bps = db / dt // bytes per second
            let speedText = ''
            if (bps >= 1024 * 1024) speedText = (bps / (1024 * 1024)).toFixed(2) + ' MB/s'
            else if (bps >= 1024) speedText = (bps / 1024).toFixed(1) + ' KB/s'
            else speedText = bps.toFixed(0) + ' B/s'
            setDownloadSpeedText(speedText)
          }
        }
        // 更新快照（每 500ms 更新一次，避免过密）
        if (!last || now - last.time > 500) {
          lastDownloadSnapRef.current = { bytes: data.downloaded, time: now }
        }
      }
    } else if (data.stage === 'extracting') {
      setVoskDownloadStage('extracting')
      setVoskDownloadProgress(100)
      setDownloadSpeedText('')
      setVoskDownloadStatus('')
    } else if (data.stage === 'completed') {
      setVoskDownloading(false)
      setVoskDownloadStage('completed')
      setVoskDownloadProgress(100)
      setDownloadSpeedText('')
      setVoskDownloadStatus('')
      setCurrentDownloadSource('')
      lastDownloadSnapRef.current = null
      stopPolling && stopPolling()
      setVoskModelInfo({
        hasModel: true,
        modelPath: data.modelPath,
        modelSize: data.modelSize,
      })
      showToast('语音模型下载完成！', 'success')
      // 自动部署：加载已下载的模型
      if (data.modelPath) {
        loadVoskModel(data.modelPath).catch(err => {
          console.warn('[Vosk] 自动部署失败:', err)
        })
      }
    } else if (data.stage === 'error') {
      setVoskDownloading(false)
      setVoskDownloadStage('error')
      setVoskDownloadError(data.error || data.errorMessage || '下载失败')
      setVoskDownloadErrorCode(data.errorCode || '')
      setVoskDownloadSuggestion(data.suggestion || '')
      setDownloadSpeedText('')
      setVoskDownloadStatus('')
      setCurrentDownloadSource('')
      lastDownloadSnapRef.current = null
      stopPolling && stopPolling()
      showToast('模型下载失败：' + (data.errorMessage || data.error || '未知错误'), 'error')
    } else if (data.cancelled) {
      // 前端已在 handleCancelDownload 中立即更新了 UI，这里只做兜底
      setVoskDownloading(false)
      setVoskDownloadStage('')
      setVoskDownloadProgress(0)
      setVoskDownloadedMB('')
      setDownloadSpeedText('')
      setVoskDownloadStatus('')
      setCurrentDownloadSource('')
      lastDownloadSnapRef.current = null
    }
  }

  // 停止轮询
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  // 轮询后备方案：每 500ms 查询原生端状态，防止事件监听失效
  const startPolling = () => {
    if (pollIntervalRef.current) return
    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await getVoskDownloadStatus()
        if (!status) return

        // 从 ref 获取最新状态（避免闭包陷阱）
        const { voskDownloadStage: curStage, voskDownloading: curDownloading } = stateRef.current

        // 如果后端报告已完成或出错，但前端还不知道，主动更新
        if (status.stage === 'completed' && curStage !== 'completed') {
          setVoskDownloading(false)
          setVoskDownloadStage('completed')
          setVoskDownloadProgress(100)
          setDownloadSpeedText('')
          setVoskDownloadStatus('')
          setCurrentDownloadSource('')
          setVoskModelInfo({
            hasModel: true,
            modelPath: status.modelPath || '',
            modelSize: status.modelSize || 0,
          })
          stopPolling()
        } else if (status.stage === 'error' && curStage !== 'error') {
          setVoskDownloading(false)
          setVoskDownloadStage('error')
          setVoskDownloadError(status.errorMessage || status.error || '下载失败')
          setVoskDownloadErrorCode(status.errorCode || '')
          setVoskDownloadSuggestion(status.suggestion || '')
          setDownloadSpeedText('')
          setVoskDownloadStatus('')
          setCurrentDownloadSource('')
          stopPolling()
        } else if (status.isDownloading || status.isImporting) {
          // 正在下载/导入中，仅在事件失效时兜底（不覆盖事件驱动的精确状态）
          // 只在前端 stage 为空时才用轮询数据填充
          if (status.stage && !curStage) {
            setVoskDownloadStage(status.stage)
          }
          // 仅在前端 progress 为 0 且后端有非零进度时兜底
          if (typeof status.progress === 'number' && status.progress > 0) {
            setVoskDownloadProgress((prev) => (prev > 0 ? prev : status.progress))
          }
          // downloadedMB 只在为空时填充
          if (status.downloadedMB) {
            setVoskDownloadedMB((prev) => (prev ? prev : status.downloadedMB))
          }
          // 注意：currentDownloadSource 和 voskDownloadStatus 只由事件驱动更新，轮询不覆盖
        } else if (!status.isDownloading && !status.isImporting && curDownloading) {
          // 后端已停止但前端还在下载状态，重置
          setVoskDownloading(false)
          setVoskDownloadStage('')
          stopPolling()
        }
      } catch (e) {
        console.error('[SettingsSpeech] 轮询查询状态失败:', e)
      }
    }, 1000)
  }

  const handleDownloadModel = async () => {
    const model = VOSK_MODELS.find(m => m.id === selectedVoskModel)
    if (!model) return

    try {
      setVoskDownloading(true)
      setVoskDownloadStage('downloading')
      setVoskDownloadProgress(0)
      setVoskDownloadedMB('')
      setVoskDownloadError('')
      setVoskDownloadErrorCode('')
      setVoskDownloadSuggestion('')
      setDownloadSpeedText('')
      setVoskDownloadStatus('')
      setCurrentDownloadSource('')
      lastDownloadSnapRef.current = null
      startPolling() // 启动轮询后备方案

      // 构建下载源列表（按国内网络环境优化的默认顺序 + 用户选中优先）
      const availableSources = getOrderedSources(model.id, downloadSource)

      if (availableSources.length === 0) {
        showToast('该模型没有可用的下载源', 'warn')
        setVoskDownloading(false)
        setVoskDownloadStage('')
        return
      }

      const urls = availableSources.map(s => s.url)
      const labels = availableSources.map(s => s.label)
      setCurrentDownloadSource(availableSources[0].label)

      await downloadVoskModelWithFallback(urls, labels, model.sizeBytes, model.id)
    } catch (e) {
      setVoskDownloading(false)
      setVoskDownloadStage('')
      showToast('启动下载失败：' + e.message, 'error')
    }
  }

  // 从本地文件导入 Vosk 模型 ZIP（调用原生文件选择器）
  const handleImportModel = async () => {
    if (!isVoskAvailable()) {
      showToast('导入模型仅在 APP 中可用', 'warn')
      return
    }
    try {
      setVoskDownloading(true)
      setVoskDownloadStage('importing')
      setVoskDownloadProgress(0)
      setVoskDownloadedMB('')
      setVoskDownloadError('')
      setVoskDownloadErrorCode('')
      setVoskDownloadSuggestion('')
      setDownloadSpeedText('')
      lastDownloadSnapRef.current = null
      startPolling() // 启动轮询后备方案
      showToast('请选择 Vosk 模型 ZIP 文件', 'info')
      const { Capacitor } = await import('@capacitor/core')
      const voskPlugin = Capacitor.Plugins?.VoskASR
      if (!voskPlugin || !voskPlugin.pickAndImportModel) {
        showToast('当前版本不支持文件导入，请更新 APP', 'warn')
        setVoskDownloading(false)
        setVoskDownloadStage('')
        return
      }
      await voskPlugin.pickAndImportModel()
    } catch (e) {
      setVoskDownloading(false)
      setVoskDownloadStage('')
      if (e.message?.includes('cancel') || e.message?.includes('取消')) {
        showToast('已取消导入', 'info')
      } else {
        showToast('导入失败：' + e.message, 'error')
      }
    }
  }

  const handleCancelDownload = async () => {
    // 立即更新 UI，让用户感受到响应（不依赖后端 cancelled 事件）
    setVoskDownloading(false)
    setVoskDownloadStage('')
    setVoskDownloadProgress(0)
    setVoskDownloadedMB('')
    setVoskDownloadError('')
    setVoskDownloadErrorCode('')
    setVoskDownloadSuggestion('')
    setCurrentDownloadSource('')
    stopPolling() // 停止轮询
    showToast('已取消', 'info')
    try {
      await cancelVoskDownload()
    } catch (e) {
      console.error('取消下载失败:', e)
    }
  }

  const handleDeleteModel = async () => {
    if (!window.confirm('确定要删除语音模型吗？删除后需要重新下载才能使用离线语音识别。')) {
      return
    }
    try {
      await deleteVoskModel()
      setVoskModelInfo({ hasModel: false, modelPath: null, modelSize: 0 })
      setVoskModelSwitchOpen(false)
      showToast('模型已删除', 'success')
    } catch (e) {
      showToast('删除失败：' + e.message, 'error')
    }
  }

  const handleSwitchModel = () => {
    setVoskModelSwitchOpen(true)
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleSpeechApiTest = async () => {
    const url = localSpeechApiUrl.trim()
    const key = localSpeechApiKey.trim()
    const fallbackKey = state.apiKey
    if (!key && !fallbackKey) {
      showToast('请先填写语音服务 API Key，或先配置 DeepSeek API Key', 'warn')
      return
    }
    setSpeechTestTesting(true)
    setSpeechTestStatus(null)
    try {
      const result = await testSpeechApiConnection({
        apiUrl: url,
        apiKey: key,
        fallbackApiKey: fallbackKey,
      })
      setSpeechTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setSpeechTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setSpeechTestTesting(false)
    }
  }

  const handleIflytekTest = async () => {
    const appId = localIflytekIatAppId.trim()
    const apiKey = localIflytekIatApiKey.trim()
    const apiSecret = localIflytekIatApiSecret.trim()
    if (!appId || !apiKey || !apiSecret) {
      showToast('请完整填写讯飞语音听写的 APPID、APIKey 和 APISecret', 'warn')
      return
    }
    setIflytekTestTesting(true)
    setIflytekTestStatus(null)
    try {
      const result = await testIflytekConnection({ appId, apiKey, apiSecret })
      setIflytekTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setIflytekTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setIflytekTestTesting(false)
    }
  }

  const handleIflytekBigModelTest = async () => {
    const appId = localIflytekBigModelAppId.trim()
    const apiKey = localIflytekBigModelApiKey.trim()
    const apiSecret = localIflytekBigModelApiSecret.trim()
    if (!appId || !apiKey || !apiSecret) {
      showToast('请完整填写讯飞中英识别大模型的 APPID、APIKey 和 APISecret', 'warn')
      return
    }
    setIflytekBigModelTestTesting(true)
    setIflytekBigModelTestStatus(null)
    try {
      const result = await testIflytekBigModelConnection({ appId, apiKey, apiSecret })
      setIflytekBigModelTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setIflytekBigModelTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setIflytekBigModelTestTesting(false)
    }
  }

  const handleIflytekRtasrStdTest = async () => {
    const appId = localIflytekRtasrStdAppId.trim()
    const apiKey = localIflytekRtasrStdApiKey.trim()
    if (!appId || !apiKey) {
      showToast('请完整填写讯飞实时语音转写标准版的 APPID 和 APIKey', 'warn')
      return
    }
    setIflytekRtasrStdTestTesting(true)
    setIflytekRtasrStdTestStatus(null)
    try {
      const result = await testIflytekRtasrStdConnection({ appId, apiKey })
      setIflytekRtasrStdTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setIflytekRtasrStdTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setIflytekRtasrStdTestTesting(false)
    }
  }

  const handleIflytekRtasrLlmTest = async () => {
    const appId = localIflytekRtasrLlmAppId.trim()
    const accessKeyId = localIflytekRtasrLlmAccessKeyId.trim()
    const accessKeySecret = localIflytekRtasrLlmAccessKeySecret.trim()
    if (!appId || !accessKeyId || !accessKeySecret) {
      showToast('请完整填写讯飞实时语音转写大模型的 APPID、AccessKeyId 和 AccessKeySecret', 'warn')
      return
    }
    setIflytekRtasrLlmTestTesting(true)
    setIflytekRtasrLlmTestStatus(null)
    try {
      const result = await testIflytekRtasrLlmConnection({ appId, accessKeyId, accessKeySecret })
      setIflytekRtasrLlmTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setIflytekRtasrLlmTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setIflytekRtasrLlmTestTesting(false)
    }
  }

  const handleIflytekOstTest = async () => {
    const appId = localIflytekOstAppId.trim()
    const apiKey = localIflytekOstApiKey.trim()
    const apiSecret = localIflytekOstApiSecret.trim()
    if (!appId || !apiKey || !apiSecret) {
      showToast('请完整填写讯飞极速录音转写的 APPID、APIKey 和 APISecret', 'warn')
      return
    }
    setIflytekOstTestTesting(true)
    setIflytekOstTestStatus(null)
    try {
      const result = await testIflytekOstConnection({ appId, apiKey, apiSecret })
      setIflytekOstTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setIflytekOstTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setIflytekOstTestTesting(false)
    }
  }

  const handleDashscopeAsrTest = async () => {
    const key = localDashscopeAsrKey.trim() || state.dashscopeApiKey?.trim()
    if (!key) {
      showToast('请先填写阿里云千问 API Key', 'warn')
      return
    }
    setDashscopeAsrTestTesting(true)
    setDashscopeAsrTestStatus(null)
    try {
      const result = await testDashscopeSpeechConnection({ apiKey: key })
      setDashscopeAsrTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setDashscopeAsrTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setDashscopeAsrTestTesting(false)
    }
  }

  const EyeSmall = ({ on }) => on ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  )

  const Arrow = () => (
    <svg className="settings-row-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
    </svg>
  )

  const BackArrow = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
    </svg>
  )

  const currentSpeech = SPEECH_MODES.find(m => m.value === state.speechMode)

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <>
      <style>{`
        @keyframes voskProgressPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      onContextMenu={preventTextMenu}
      
    >
      <div className="settings-sub-header">
        <button className="settings-back-btn" onClick={() => navigate('/settings')}>
          <BackArrow />
        </button>
        <span className="settings-sub-title">语音识别</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        <div className="settings-section">
          <div className="settings-row settings-row-clickable card-interactive" onClick={() => {
            const idx = SPEECH_MODES.findIndex(m => m.value === state.speechMode)
            const next = SPEECH_MODES[(idx + 1) % SPEECH_MODES.length]
            setSpeechMode(next.value)
            showToast('语音识别模式已切换为：' + next.label)
          }}>
            <span className="settings-row-label">识别模式</span>
            <span className="settings-row-value">{currentSpeech?.label || '浏览器语音'}</span>
            <Arrow />
          </div>

          {/* 语音识别功能测试面板 */}
          <div className="settings-block" style={{ marginTop: '12px' }}>
            <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              功能测试
            </div>
            <div style={{
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: isRealTimeMode ? 'var(--color-success-light)' : 'var(--color-bg-secondary)',
              marginBottom: '12px',
              fontSize: '13px',
              color: isRealTimeMode ? 'var(--color-success-dark)' : 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>{isRealTimeMode ? '✅' : '⏱️'}</span>
              <span>
                <strong>{isRealTimeMode ? '支持实时语音转文字' : '非实时模式（录音后识别）'}</strong>
                <div style={{ fontSize: '12px', marginTop: '2px', opacity: 0.8 }}>
                  {isRealTimeMode ? '说话时文字实时上屏' : '录音结束后一次性返回识别结果'}
                </div>
              </span>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
            }}>
              <button
                onMouseDown={(e) => { e.preventDefault(); startTestRecording() }}
                onMouseUp={(e) => { e.preventDefault(); stopTestRecording() }}
                onMouseLeave={() => { if (testRecording) stopTestRecording() }}
                onTouchStart={(e) => { e.preventDefault(); startTestRecording() }}
                onTouchEnd={(e) => { e.preventDefault(); stopTestRecording() }}
                onTouchCancel={(e) => { e.preventDefault(); if (testRecording) stopTestRecording() }}
                disabled={testTranscribing}
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  border: 'none',
                  cursor: testTranscribing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: testRecording ? 'var(--color-danger)' : 'var(--color-primary)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  transition: '0.15s',
                  opacity: testTranscribing ? 0.6 : 1,
                  boxShadow: testRecording ? '0 0 0 8px rgba(239, 68, 68, 0.2)' : '0 2px 10px rgba(0,0,0,0.15)',
                }}
              >
                {testRecording ? '松开结束' : testTranscribing ? '识别中' : '按住说话'}
              </button>
              {testRecording && (
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: 'var(--color-danger)',
                    animation: 'voskProgressPulse 1s ease-in-out infinite',
                  }}></span>
                  正在录音…
                </div>
              )}
            </div>
            {testRealTimeText && (
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-info-light)',
                color: 'var(--color-info-dark)',
                fontSize: '13px',
                lineHeight: 1.6,
                maxHeight: '120px',
                overflowY: 'auto',
                marginBottom: '10px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '12px' }}>实时识别：</div>
                {testRealTimeText}
              </div>
            )}
            {testResult && (
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-success-light)',
                color: 'var(--color-success-dark)',
                fontSize: '13px',
                lineHeight: 1.6,
                maxHeight: '160px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>识别结果：</div>
                {testResult}
              </div>
            )}
            {testError && (
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                fontSize: '13px',
                lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>错误：</div>
                {testError}
              </div>
            )}
            {testLogs.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={() => setTestLogOpen(!testLogOpen)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>📋 详细日志 ({testLogs.length} 条)</span>
                  <span style={{ transform: testLogOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>▼</span>
                </button>
                {testLogOpen && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: '#0f172a',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    lineHeight: 1.6,
                    maxHeight: '240px',
                    overflowY: 'auto',
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {testLogs.map((log, idx) => (
                      <div key={idx} style={{ marginBottom: '6px', borderBottom: idx < testLogs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '2px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#64748b', flexShrink: 0 }}>[{log.timestamp}]</span>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 600,
                            flexShrink: 0,
                            ...(log.level === 'error' ? { background: '#ef4444', color: '#fff' } :
                                log.level === 'success' ? { background: '#22c55e', color: '#fff' } :
                                log.level === 'warn' ? { background: '#f59e0b', color: '#fff' } :
                                { background: '#3b82f6', color: '#fff' }),
                          }}>{log.step}</span>
                          <span style={{
                            color: log.level === 'error' ? '#fca5a5' :
                                   log.level === 'success' ? '#86efac' :
                                   log.level === 'warn' ? '#fcd34d' : '#93c5fd',
                            flex: 1,
                            minWidth: 0,
                          }}>
                            {log.message}
                          </span>
                        </div>
                        {log.detail && (
                          <div style={{
                            marginTop: '4px',
                            padding: '6px 8px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '4px',
                            color: '#94a3b8',
                            overflowX: 'auto',
                          }}>
                            {typeof log.detail === 'object' ? JSON.stringify(log.detail, null, 2) : String(log.detail)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
              💡 按住按钮说话，松开后识别。实时模式下说话时文字实时显示。
            </div>
          </div>

          {state.speechMode === 'vosk-offline' && (
            <div className="settings-block">
              <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                Vosk 离线语音识别
              </div>
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-bg-secondary)',
                marginBottom: '12px',
                fontSize: '13px',
                lineHeight: '1.6',
                color: 'var(--color-text-secondary)',
              }}>
                <p style={{ margin: '0 0 8px 0' }}>✅ <strong>特点：</strong>完全离线运行，无需网络，隐私安全，无费用</p>
                <p style={{ margin: '0 0 8px 0' }}>📱 <strong>适用：</strong>仅 APP 端可用，Web 端不支持</p>
                <p style={{ margin: 0 }}>🔊 <strong>识别：</strong>实时流式识别，支持中文普通话</p>
              </div>
              
              {!voskAvailable ? (
                <div className="settings-status" style={{
                  marginTop: '10px',
                  backgroundColor: 'var(--color-warning-light)',
                  color: 'var(--color-warning-dark)',
                }}>
                  <span>⚠️</span>
                  <span>Vosk 离线识别仅在 APP 中可用，请使用 APP 访问此功能</span>
                </div>
              ) : voskDownloading ? (
                <>
                  <div className="settings-status" style={{
                    marginTop: '10px',
                    backgroundColor: 'var(--color-info-light)',
                    color: 'var(--color-info-dark)',
                  }}>
                    <span>
                      {voskDownloadStage === 'extracting' ? '正在解压模型…（请稍候）'
                        : voskDownloadStage === 'importing'
                          ? (voskDownloadedMB
                              ? '正在导入模型… 已导入 ' + voskDownloadedMB + ' MB'
                              : '正在读取文件…（大模型可能需要数秒）')
                          : (voskDownloadStatus
                              ? voskDownloadStatus
                              : (voskDownloadedMB
                                  ? '正在下载模型… 已下载 ' + voskDownloadedMB + ' MB'
                                      + (downloadSpeedText ? '（' + downloadSpeedText + '）' : '')
                                  : (voskDownloadProgress > 0
                                      ? '正在下载模型… ' + voskDownloadProgress + '%'
                                          + (downloadSpeedText ? '（' + downloadSpeedText + '）' : '')
                                      : '正在连接服务器…')))}
                    </span>
                  </div>
                  {currentDownloadSource && voskDownloadStage === 'downloading' && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      📡 当前下载源：{currentDownloadSource}
                    </div>
                  )}
                  <div style={{
                    marginTop: '12px',
                    width: '100%',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: voskDownloadStage === 'extracting' ? '100%'
                        : (voskDownloadProgress < 0 || (!voskDownloadedMB && voskDownloadProgress <= 0)) ? '30%'
                        : (voskDownloadProgress > 0 ? voskDownloadProgress + '%' : '30%'),
                      backgroundColor: voskDownloadStage === 'importing' ? 'var(--color-success)' : 'var(--color-primary)',
                      transition: 'width 0.2s ease',
                      ...(voskDownloadStage === 'extracting' || voskDownloadProgress < 0 || (!voskDownloadedMB && voskDownloadProgress <= 0)
                        ? { animation: 'voskProgressPulse 1.5s ease-in-out infinite' } : {}),
                    }} />
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                    {voskDownloadStage === 'downloading' && !voskDownloadedMB && voskDownloadProgress <= 0
                      ? '💡 若长时间无进度，可点取消后切换"蓝奏云"或"kkgithub 镜像"下载源（国内推荐）或用浏览器下载后点"导入模型"'
                      : voskDownloadStage === 'importing' && !voskDownloadedMB && voskDownloadProgress <= 0
                        ? '💡 正在读取文件，大模型可能需要数秒'
                        : ''}
                  </div>
                  <div className="settings-btn-row" style={{ marginTop: '12px' }}>
                    <button onClick={handleCancelDownload} className="settings-btn-sm"
                      style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                      取消
                    </button>
                  </div>
                </>
              ) : voskDownloadStage === 'error' ? (
                <>
                  <div className="settings-status" style={{
                    marginTop: '10px',
                    backgroundColor: 'var(--color-danger-light)',
                    color: 'var(--color-danger)',
                  }}>
                    <span>❌</span>
                    <span>{voskDownloadError || '下载失败'}</span>
                  </div>
                  {voskDownloadSuggestion && (
                    <div style={{
                      marginTop: '8px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-info-light)',
                      color: 'var(--color-info-dark)',
                      fontSize: '13px',
                      lineHeight: '1.6',
                    }}>
                      💡 建议：{voskDownloadSuggestion}
                    </div>
                  )}
                  <div className="settings-btn-row" style={{ marginTop: '12px' }}>
                    <button onClick={handleDownloadModel} className="settings-btn-sm"
                      style={{ background: 'var(--color-primary)', color: '#fff', flex: 1 }}>
                      重新下载
                    </button>
                  </div>
                </>
              ) : voskModelInfo?.hasModel ? (
                <>
                  <div className="settings-status" style={{
                    marginTop: '10px',
                    backgroundColor: 'var(--color-success-light)',
                    color: 'var(--color-success-dark)',
                  }}>
                    <span>✅</span>
                    <span>语音模型已就绪</span>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                    <p style={{ margin: '4px 0' }}>模型大小：{formatFileSize(voskModelInfo.modelSize)}</p>
                    <p style={{ margin: '4px 0' }}>模型路径：{voskModelInfo.modelPath}</p>
                  </div>
                  <div className="settings-btn-row" style={{ marginTop: '12px' }}>
                    <button onClick={checkModelStatus} disabled={voskChecking} className="settings-btn-sm"
                      style={{ background: 'var(--color-primary)', color: '#fff' }}>
                      {voskChecking ? '检测中…' : '刷新检测'}
                    </button>
                    <button onClick={handleSwitchModel} className="settings-btn-sm"
                      style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent-dark)' }}>
                      切换模型
                    </button>
                  </div>
                  {voskModelSwitchOpen && (
                    <div style={{ marginTop: '16px', padding: '12px', borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                        选择要切换的模型
                      </div>
                      {VOSK_MODELS.map((m) => (
                        <div
                          key={m.id}
                          onClick={async () => {
                            setSelectedVoskModel(m.id)
                            setDownloadSource(getDefaultSourceKey(m.id))
                            setVoskModelSwitchOpen(false)
                            await handleDeleteModel()
                          }}
                          style={{
                            padding: '10px 12px', borderRadius: '8px', border: '1px solid',
                            borderColor: selectedVoskModel === m.id ? 'var(--color-primary)' : 'var(--color-border)',
                            backgroundColor: 'transparent', marginBottom: '8px', cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--color-text)' }}>{m.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {m.description} · {m.size}
                          </div>
                        </div>
                      ))}
                      <button onClick={() => setVoskModelSwitchOpen(false)} className="settings-btn-sm"
                        style={{ marginTop: '8px', background: 'var(--color-border-light)', color: 'var(--color-text-secondary)' }}>
                        取消
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                      选择模型
                    </div>
                    {VOSK_MODELS.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => {
                          setSelectedVoskModel(m.id)
                          // 切换模型时自动调整默认下载源（小模型→蓝奏云，大模型→kkgithub）
                          setDownloadSource(getDefaultSourceKey(m.id))
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: selectedVoskModel === m.id ? 'var(--color-primary)' : 'var(--color-border)',
                          backgroundColor: selectedVoskModel === m.id ? 'var(--color-primary-light)' : 'transparent',
                          marginBottom: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{m.name}</span>
                          <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{m.size}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>{m.description}</p>
                      </div>
                    ))}
                  </div>
                  <div className="settings-btn-row">
                    <button onClick={handleDownloadModel} className="settings-btn-sm"
                      style={{ background: 'var(--color-primary)', color: '#fff', flex: 1 }}>
                      下载模型
                    </button>
                    <button onClick={handleImportModel} className="settings-btn-sm"
                      style={{ background: 'var(--color-success)', color: '#fff' }}>
                      导入模型
                    </button>
                  </div>
                  {/* 下载源切换：主源 / 镜像源 / 蓝奏云 */}
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>选择下载源：</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(() => {
                        const model = VOSK_MODELS.find(m => m.id === selectedVoskModel) || VOSK_MODELS[0]
                        const sources = [
                          { key: 'primary', label: 'alphacephei 主源', available: !!model.url },
                          { key: 'archive', label: '镜像源 (nightvoid)', available: !!model.archiveUrl },
                          { key: 'lanzou', label: '蓝奏云', available: !!model.lanzouUrl },
                        ]
                        return sources.map(s => (
                          <button key={s.key} type="button"
                            disabled={!s.available}
                            onClick={() => setDownloadSource(s.key)}
                            className="settings-btn-sm"
                            style={{
                              flex: '1 1 auto',
                              minWidth: '90px',
                              padding: '6px 8px',
                              fontSize: '12px',
                              cursor: s.available ? 'pointer' : 'not-allowed',
                              background: downloadSource === s.key ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                              color: downloadSource === s.key ? '#fff' : 'var(--color-text-secondary)',
                              opacity: s.available ? 1 : 0.5,
                              border: '1px solid var(--color-border)',
                            }}>
                            {s.label}
                          </button>
                        ))
                      })()}
                    </div>
                    {downloadSource === 'lanzou' && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        💡 蓝奏云分享链接需要解析真实下载地址，下载会先显示"正在解析蓝奏云链接..."
                      </div>
                    )}
                    {downloadSource === 'archive' && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        💡 第三方镜像源，支持 Range 请求和断点续传
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-tertiary)', lineHeight: '1.6' }}>
                    <p style={{ margin: '4px 0' }}>💡 下载完成后即可使用离线语音识别</p>
                    <p style={{ margin: '4px 0' }}>📦 <strong>导入模型：</strong>从浏览器下载模型 ZIP 后，点"导入模型"选择文件</p>
                    <a href={VOSK_DOWNLOAD_PAGE_URL} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--color-primary)', fontSize: '12px', textDecoration: 'none' }}>
                      🌐 前往 Vosk 官网下载模型
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
          {state.speechMode === 'whisper-api' && (
            <div className="settings-block">
              <input type="text" value={localSpeechApiUrl}
                onChange={(e) => { setLocalSpeechApiUrl(e.target.value); setSpeechApiUrl(e.target.value) }}
                placeholder="语音服务 URL"
                className="settings-input settings-mb-8"
              />
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={localSpeechApiKeyShow ? 'text' : 'password'} value={localSpeechApiKey}
                  onChange={(e) => { setLocalSpeechApiKey(e.target.value); setSpeechApiKey(e.target.value) }}
                  placeholder="语音服务 API Key"
                  className="settings-input settings-input-eye"
                />
                <button type="button" className="settings-eye-btn" onClick={() => setLocalSpeechApiKeyShow(!localSpeechApiKeyShow)}>
                  <EyeSmall on={localSpeechApiKeyShow} />
                </button>
              </div>
              <div className="settings-btn-row">
                <button onClick={handleSpeechApiTest} disabled={speechTestTesting} className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  {speechTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {speechTestStatus && (
                <div className="settings-status" style={{
                  marginTop: '10px',
                  backgroundColor: speechTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: speechTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{speechTestStatus.ok ? '✅' : '❌'}</span>
                  <span>{speechTestStatus.message}{speechTestStatus.detail ? `（${speechTestStatus.detail}）` : ''}</span>
                </div>
              )}
              <a href="https://platform.openai.com/docs/guides/speech-to-text" target="_blank" rel="noopener noreferrer"
                className="settings-link-btn">
                <span>了解 OpenAI Whisper API</span>
                <Arrow />
              </a>
            </div>
          )}
          {state.speechMode === 'iflytek-iat' && (
            <div className="settings-block">
              <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                讯飞语音听写配置
              </div>
              <input type="text" value={localIflytekIatAppId}
                onChange={(e) => { setLocalIflytekIatAppId(e.target.value); setIflytekIatAppId(e.target.value) }}
                placeholder="讯飞 APPID"
                className="settings-input settings-mb-8"
              />
              <input type="text" value={localIflytekIatApiKey}
                onChange={(e) => { setLocalIflytekIatApiKey(e.target.value); setIflytekIatApiKey(e.target.value) }}
                placeholder="讯飞 APIKey"
                className="settings-input settings-mb-8"
              />
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={localIflytekIatApiSecretShow ? 'text' : 'password'} value={localIflytekIatApiSecret}
                  onChange={(e) => { setLocalIflytekIatApiSecret(e.target.value); setIflytekIatApiSecret(e.target.value) }}
                  placeholder="讯飞 APISecret"
                  className="settings-input settings-input-eye"
                />
                <button type="button" className="settings-eye-btn" onClick={() => setLocalIflytekIatApiSecretShow(!localIflytekIatApiSecretShow)}>
                  <EyeSmall on={localIflytekIatApiSecretShow} />
                </button>
              </div>
              <div className="settings-btn-row">
                <button onClick={handleIflytekTest} disabled={iflytekTestTesting} className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  {iflytekTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {iflytekTestStatus && (
                <div className="settings-status" style={{
                  marginTop: '10px',
                  backgroundColor: iflytekTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: iflytekTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{iflytekTestStatus.ok ? '✅' : '❌'}</span>
                  <span>{iflytekTestStatus.message}{iflytekTestStatus.detail ? `（${iflytekTestStatus.detail}）` : ''}</span>
                </div>
              )}
              <a href="https://console.xfyun.cn/services/iat" target="_blank" rel="noopener noreferrer"
                className="settings-link-btn">
                <span>前往讯飞开放平台获取语音听写凭证</span>
                <Arrow />
              </a>
            </div>
          )}
          {state.speechMode === 'iflytek-bigmodel' && (
            <div className="settings-block">
              <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                讯飞中英识别大模型配置
              </div>
              <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  支持中文、英文及202种方言免切换识别，短句识别（≤60秒）。
                </span>
              </p>
              <input type="text" value={localIflytekBigModelAppId}
                onChange={(e) => { setLocalIflytekBigModelAppId(e.target.value); setIflytekBigModelAppId(e.target.value) }}
                placeholder="讯飞 APPID"
                className="settings-input settings-mb-8"
              />
              <input type="text" value={localIflytekBigModelApiKey}
                onChange={(e) => { setLocalIflytekBigModelApiKey(e.target.value); setIflytekBigModelApiKey(e.target.value) }}
                placeholder="讯飞 APIKey"
                className="settings-input settings-mb-8"
              />
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={localIflytekBigModelApiSecretShow ? 'text' : 'password'} value={localIflytekBigModelApiSecret}
                  onChange={(e) => { setLocalIflytekBigModelApiSecret(e.target.value); setIflytekBigModelApiSecret(e.target.value) }}
                  placeholder="讯飞 APISecret"
                  className="settings-input settings-input-eye"
                />
                <button type="button" className="settings-eye-btn" onClick={() => setLocalIflytekBigModelApiSecretShow(!localIflytekBigModelApiSecretShow)}>
                  <EyeSmall on={localIflytekBigModelApiSecretShow} />
                </button>
              </div>
              <div className="settings-btn-row">
                <button onClick={handleIflytekBigModelTest} disabled={iflytekBigModelTestTesting} className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  {iflytekBigModelTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {iflytekBigModelTestStatus && (
                <div className="settings-status" style={{
                  marginTop: '10px',
                  backgroundColor: iflytekBigModelTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: iflytekBigModelTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{iflytekBigModelTestStatus.ok ? '✅' : '❌'}</span>
                  <span>{iflytekBigModelTestStatus.message}{iflytekBigModelTestStatus.detail ? `（${iflytekBigModelTestStatus.detail}）` : ''}</span>
                </div>
              )}
              <a href="https://console.xfyun.cn/services/iat" target="_blank" rel="noopener noreferrer"
                className="settings-link-btn">
                <span>前往讯飞开放平台获取凭证</span>
                <Arrow />
              </a>
            </div>
          )}
          {state.speechMode === 'iflytek-rtasr-std' && (
            <div className="settings-block">
              <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                讯飞实时语音转写（标准版）配置
              </div>
              <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  长音频实时转写，基于深度卷积神经网络，低延迟高稳定。
                </span>
              </p>
              <input type="text" value={localIflytekRtasrStdAppId}
                onChange={(e) => { setLocalIflytekRtasrStdAppId(e.target.value); setIflytekRtasrStdAppId(e.target.value) }}
                placeholder="讯飞 APPID"
                className="settings-input settings-mb-8"
              />
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={localIflytekRtasrStdApiKeyShow ? 'text' : 'password'} value={localIflytekRtasrStdApiKey}
                  onChange={(e) => { setLocalIflytekRtasrStdApiKey(e.target.value); setIflytekRtasrStdApiKey(e.target.value) }}
                  placeholder="讯飞 APIKey"
                  className="settings-input settings-input-eye"
                />
                <button type="button" className="settings-eye-btn" onClick={() => setLocalIflytekRtasrStdApiKeyShow(!localIflytekRtasrStdApiKeyShow)}>
                  <EyeSmall on={localIflytekRtasrStdApiKeyShow} />
                </button>
              </div>
              <div className="settings-btn-row">
                <button onClick={handleIflytekRtasrStdTest} disabled={iflytekRtasrStdTestTesting} className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  {iflytekRtasrStdTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {iflytekRtasrStdTestStatus && (
                <div className="settings-status" style={{
                  marginTop: '10px',
                  backgroundColor: iflytekRtasrStdTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: iflytekRtasrStdTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{iflytekRtasrStdTestStatus.ok ? '✅' : '❌'}</span>
                  <span>{iflytekRtasrStdTestStatus.message}{iflytekRtasrStdTestStatus.detail ? `（${iflytekRtasrStdTestStatus.detail}）` : ''}</span>
                </div>
              )}
              <a href="https://console.xfyun.cn/services/rtasr" target="_blank" rel="noopener noreferrer"
                className="settings-link-btn">
                <span>前往讯飞开放平台获取实时转写凭证</span>
                <Arrow />
              </a>
            </div>
          )}
          {state.speechMode === 'iflytek-rtasr-llm' && (
            <div className="settings-block">
              <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                讯飞实时语音转写（大模型版）配置
              </div>
              <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  基于星火大模型，支持202种方言+37语种免切识别，智能断句标点。
                </span>
              </p>
              <input type="text" value={localIflytekRtasrLlmAppId}
                onChange={(e) => { setLocalIflytekRtasrLlmAppId(e.target.value); setIflytekRtasrLlmAppId(e.target.value) }}
                placeholder="讯飞 APPID"
                className="settings-input settings-mb-8"
              />
              <input type="text" value={localIflytekRtasrLlmAccessKeyId}
                onChange={(e) => { setLocalIflytekRtasrLlmAccessKeyId(e.target.value); setIflytekRtasrLlmAccessKeyId(e.target.value) }}
                placeholder="AccessKeyId"
                className="settings-input settings-mb-8"
              />
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={localIflytekRtasrLlmAccessKeySecretShow ? 'text' : 'password'} value={localIflytekRtasrLlmAccessKeySecret}
                  onChange={(e) => { setLocalIflytekRtasrLlmAccessKeySecret(e.target.value); setIflytekRtasrLlmAccessKeySecret(e.target.value) }}
                  placeholder="AccessKeySecret"
                  className="settings-input settings-input-eye"
                />
                <button type="button" className="settings-eye-btn" onClick={() => setLocalIflytekRtasrLlmAccessKeySecretShow(!localIflytekRtasrLlmAccessKeySecretShow)}>
                  <EyeSmall on={localIflytekRtasrLlmAccessKeySecretShow} />
                </button>
              </div>
              <div className="settings-btn-row">
                <button onClick={handleIflytekRtasrLlmTest} disabled={iflytekRtasrLlmTestTesting} className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  {iflytekRtasrLlmTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {iflytekRtasrLlmTestStatus && (
                <div className="settings-status" style={{
                  marginTop: '10px',
                  backgroundColor: iflytekRtasrLlmTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: iflytekRtasrLlmTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{iflytekRtasrLlmTestStatus.ok ? '✅' : '❌'}</span>
                  <span>{iflytekRtasrLlmTestStatus.message}{iflytekRtasrLlmTestStatus.detail ? `（${iflytekRtasrLlmTestStatus.detail}）` : ''}</span>
                </div>
              )}
              <a href="https://console.xfyun.cn/services/rtasr" target="_blank" rel="noopener noreferrer"
                className="settings-link-btn">
                <span>前往讯飞开放平台获取实时转写大模型凭证</span>
                <Arrow />
              </a>
            </div>
          )}
          {state.speechMode === 'iflytek-ost' && (
            <div className="settings-block">
              <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                讯飞极速录音转写大模型配置
              </div>
              <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  长音频文件极速转写（5小时内），1小时音频约20秒出结果。注意：这是异步转写，识别需要等待时间。
                </span>
              </p>
              <input type="text" value={localIflytekOstAppId}
                onChange={(e) => { setLocalIflytekOstAppId(e.target.value); setIflytekOstAppId(e.target.value) }}
                placeholder="讯飞 APPID"
                className="settings-input settings-mb-8"
              />
              <input type="text" value={localIflytekOstApiKey}
                onChange={(e) => { setLocalIflytekOstApiKey(e.target.value); setIflytekOstApiKey(e.target.value) }}
                placeholder="讯飞 APIKey"
                className="settings-input settings-mb-8"
              />
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={localIflytekOstApiSecretShow ? 'text' : 'password'} value={localIflytekOstApiSecret}
                  onChange={(e) => { setLocalIflytekOstApiSecret(e.target.value); setIflytekOstApiSecret(e.target.value) }}
                  placeholder="讯飞 APISecret"
                  className="settings-input settings-input-eye"
                />
                <button type="button" className="settings-eye-btn" onClick={() => setLocalIflytekOstApiSecretShow(!localIflytekOstApiSecretShow)}>
                  <EyeSmall on={localIflytekOstApiSecretShow} />
                </button>
              </div>
              <div className="settings-btn-row">
                <button onClick={handleIflytekOstTest} disabled={iflytekOstTestTesting} className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  {iflytekOstTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {iflytekOstTestStatus && (
                <div className="settings-status" style={{
                  marginTop: '10px',
                  backgroundColor: iflytekOstTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: iflytekOstTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{iflytekOstTestStatus.ok ? '✅' : '❌'}</span>
                  <span>{iflytekOstTestStatus.message}{iflytekOstTestStatus.detail ? `（${iflytekOstTestStatus.detail}）` : ''}</span>
                </div>
              )}
              <a href="https://console.xfyun.cn/services/ost" target="_blank" rel="noopener noreferrer"
                className="settings-link-btn">
                <span>前往讯飞开放平台获取极速转写凭证</span>
                <Arrow />
              </a>
            </div>
          )}
          {state.speechMode === 'dashscope-asr' && (
            <div className="settings-block">
              <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                阿里云千问语音识别
              </div>
              <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  填入阿里云 DashScope 的 API Key。高质量中文语音识别（Paraformer）。如已在「AI 服务」中配置千问，此处将自动复用。
                </span>
              </p>
              <div className="settings-status" style={{
                backgroundColor: 'var(--color-primary-light, #e8f0fe)',
                color: 'var(--color-primary, #1a73e8)',
                marginBottom: '10px',
                fontSize: '12px',
              }}>
                <span>ℹ️</span>
                <span>此 API Key 与「AI 服务 → 阿里云千问」共享，修改会同步影响两处。</span>
              </div>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <input type={localDashscopeAsrKeyShow ? 'text' : 'password'} value={localDashscopeAsrKey}
                    onChange={(e) => { setLocalDashscopeAsrKey(e.target.value); setDashscopeApiKey(e.target.value) }}
                    placeholder="API Key (sk-...)"
                    className="settings-input settings-input-eye"
                  />
                  <button type="button" className="settings-eye-btn" onClick={() => setLocalDashscopeAsrKeyShow(!localDashscopeAsrKeyShow)}>
                    <EyeSmall on={localDashscopeAsrKeyShow} />
                  </button>
                </div>
                <div className="settings-btn-row">
                  <button onClick={handleDashscopeAsrTest} disabled={dashscopeAsrTestTesting || !(localDashscopeAsrKey.trim() || state.dashscopeApiKey?.trim())} className="settings-btn-sm"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    {dashscopeAsrTestTesting ? '测试中…' : '测试连接'}
                  </button>
                </div>
                {dashscopeAsrTestStatus && (
                  <div className="settings-status" style={{
                    marginTop: '10px',
                    backgroundColor: dashscopeAsrTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                    color: dashscopeAsrTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                  }}>
                    <span>{dashscopeAsrTestStatus.ok ? '✅' : '❌'}</span>
                    <span>{dashscopeAsrTestStatus.message}{dashscopeAsrTestStatus.detail ? `（${dashscopeAsrTestStatus.detail}）` : ''}</span>
                  </div>
                )}
                <a href="https://bailian.console.aliyun.com/cn-beijing?spm=5176.12818093_47.overview_recent.1.86b216d0qVYRgH&tab=model#/api-key" target="_blank" rel="noopener noreferrer"
                  className="settings-link-btn">
                  <span>前往阿里云百炼（DashScope）获取 API Key</span>
                  <Arrow />
                </a>
              </div>
            )}
        </div>
      </div>
    </div>
    </>
  )
}