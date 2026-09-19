import { useApp } from '../context/AppContext'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { OCR_ENGINES, PADDLEOCR_LANGUAGES } from '../utils/constants'
import { TESSERACT_LANGUAGES, getTesseractOcrStatus, releaseTesseractWorker, testTesseractOcrConnection } from '../services/tesseractOcr'
import { testPaddleOcrConnection } from '../services/paddleOcr'
import { testBaiduOcrConnection } from '../services/baiduOcr'
import { testPaddleOcrLocalConnection, getPaddleOcrLocalStatus, diagnosePaddleOcrLocal } from '../services/paddleOcrLocal'
import { testVisionAiConnection } from '../services/visionAi'
import { extractTextFromImage } from '../services/aiService'

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

export default function SettingsOcr() {
  const {
    state,
    setOcrEngine,
    setOcrAutoGenerate,
    setPaddleocrServerUrl,
    setPaddleocrApiToken,
    setPaddleocrLanguage,
    setBaiduOcrApiKey,
    setBaiduOcrSecretKey,
    setTesseractLanguage,
    setVisionAiUrl,
    setVisionAiKey,
    setVisionAiModel,
    showToast,
  } = useApp()
  const navigate = useNavigate()

  // 本地编辑态（避免每次输入都触发全局 state）
  const [localServerUrl, setLocalServerUrl] = useState(state.paddleocrServerUrl || '')
  const [localApiToken, setLocalApiToken] = useState(state.paddleocrApiToken || '')
  const [localApiTokenShow, setLocalApiTokenShow] = useState(false)
  const [localBaiduAk, setLocalBaiduAk] = useState(state.baiduOcrApiKey || '')
  const [localBaiduSk, setLocalBaiduSk] = useState(state.baiduOcrSecretKey || '')
  const [localBaiduSkShow, setLocalBaiduSkShow] = useState(false)

  // 测试态
  const [paddleTestTesting, setPaddleTestTesting] = useState(false)
  const [paddleTestStatus, setPaddleTestStatus] = useState(null)
  const [baiduTestTesting, setBaiduTestTesting] = useState(false)
  const [baiduTestStatus, setBaiduTestStatus] = useState(null)
  // PaddleOCR 离线模式
  const [localTestTesting, setLocalTestTesting] = useState(false)
  const [localTestStatus, setLocalTestStatus] = useState(null)
  const [localInitStatus, setLocalInitStatus] = useState(getPaddleOcrLocalStatus().status)
  const [localDiagRunning, setLocalDiagRunning] = useState(false)
  const [localDiagResult, setLocalDiagResult] = useState(null)
  // Tesseract.js 离线 OCR
  const [tesseractTestTesting, setTesseractTestTesting] = useState(false)
  const [tesseractTestStatus, setTesseractTestStatus] = useState(null)
  const [tesseractInitStatus, setTesseractInitStatus] = useState(getTesseractOcrStatus().status)
  const [tesseractInitProgress, setTesseractInitProgress] = useState(0)
  const [selectedTesseractLang, setSelectedTesseractLang] = useState(state.tesseractLanguage || 'chi_sim+eng')

  // 通用AI视觉独立配置
  const [localVisionAiUrl, setLocalVisionAiUrl] = useState(state.visionAiUrl || '')
  const [localVisionAiKey, setLocalVisionAiKey] = useState(state.visionAiKey || '')
  const [localVisionAiKeyShow, setLocalVisionAiKeyShow] = useState(false)
  const [localVisionAiModel, setLocalVisionAiModel] = useState(state.visionAiModel || '')
  const [visionAiTestTesting, setVisionAiTestTesting] = useState(false)
  const [visionAiTestStatus, setVisionAiTestStatus] = useState(null)

  // OCR 功能测试面板
  const [testImagePreview, setTestImagePreview] = useState(null)
  const [testImageBase64, setTestImageBase64] = useState(null)
  const [testOcrRunning, setTestOcrRunning] = useState(false)
  const [testOcrResult, setTestOcrResult] = useState('')
  const [testOcrError, setTestOcrError] = useState('')
  const [testOcrLogs, setTestOcrLogs] = useState([])
  const [testOcrLogOpen, setTestOcrLogOpen] = useState(false)
  const testImageInputRef = useRef(null)
  const testOcrStartTimeRef = useRef(null)

  const addOcrLog = (level, step, message, detail = null) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0')
    setTestOcrLogs((prev) => [...prev, { level, step, message, detail, timestamp }])
  }

  const handleTestImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setTestOcrResult('')
    setTestOcrError('')
    setTestOcrLogs([])
    addOcrLog('info', '图片选择', `已选择文件: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      setTestImagePreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      setTestImageBase64(base64)
      addOcrLog('info', '图片加载', `图片加载成功，Base64 长度: ${base64.length} 字符`)
    }
    reader.onerror = () => {
      addOcrLog('error', '图片加载', '图片读取失败')
    }
    reader.readAsDataURL(file)
  }

  const handleTestOcr = async () => {
    if (!testImageBase64) {
      showToast('请先选择一张图片', 'warn')
      return
    }
    setTestOcrRunning(true)
    setTestOcrResult('')
    setTestOcrError('')
    setTestOcrLogs([])
    setTestOcrLogOpen(true)
    testOcrStartTimeRef.current = Date.now()
    const engine = state.ocrEngine || 'ai-model'
    addOcrLog('info', '初始化', `使用引擎: ${engine}`)
    addOcrLog('info', '配置', `AI服务: ${state.aiServiceMode}, 模型: ${state.model}`)
    try {
      addOcrLog('info', '开始识别', '正在调用识别接口...')
      const result = await extractTextFromImage(
        testImageBase64,
        state.apiKey,
        state.aiServiceMode,
        state.model,
        state.sparkApiKey,
        state.sparkApiSecret,
        state.volcanoApiKey,
        state.dashscopeApiKey,
        {
          ocrEngine: engine,
          paddleocrServerUrl: state.paddleocrServerUrl,
          paddleocrApiToken: state.paddleocrApiToken,
          paddleocrLanguage: state.paddleocrLanguage,
          baiduOcrApiKey: state.baiduOcrApiKey,
          baiduOcrSecretKey: state.baiduOcrSecretKey,
          tesseractLanguage: state.tesseractLanguage,
        },
        {
          visionAiUrl: state.visionAiUrl,
          visionAiKey: state.visionAiKey,
          visionAiModel: state.visionAiModel,
        }
      )
      const duration = ((Date.now() - testOcrStartTimeRef.current) / 1000).toFixed(2)
      setTestOcrResult(result || '(无识别结果)')
      addOcrLog('success', '识别完成', `识别成功，耗时 ${duration}s，结果长度: ${result?.length || 0} 字符`, result)
      showToast('识别完成', 'success')
    } catch (e) {
      const duration = ((Date.now() - testOcrStartTimeRef.current) / 1000).toFixed(2)
      const errMsg = e?.message || '识别失败'
      const errStack = e?.stack || ''
      const errDetail = {
        name: e?.name || 'Error',
        message: errMsg,
        stack: errStack,
        status: e?.status || e?.statusCode || null,
        ...(typeof e === 'object' && e !== null ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'stack' && k !== 'message')) : {}),
      }
      setTestOcrError(errMsg)
      addOcrLog('error', '识别失败', `识别失败，耗时 ${duration}s，错误: ${errMsg}`, errDetail)
      console.error('[OCR测试] 识别失败:', e)
      showToast('识别失败：' + errMsg, 'error')
    } finally {
      setTestOcrRunning(false)
    }
  }

  const handleClearTestImage = () => {
    setTestImagePreview(null)
    setTestImageBase64(null)
    setTestOcrResult('')
    setTestOcrError('')
    setTestOcrLogs([])
    setTestOcrLogOpen(false)
    if (testImageInputRef.current) {
      testImageInputRef.current.value = ''
    }
  }

  // OCR 缓存数量
  const [ocrCacheCount, setOcrCacheCount] = useState(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { ocrCache } = await import('../services/db')
        const count = await ocrCache.count()
        if (!cancelled) setOcrCacheCount(count)
      } catch (_) {
        if (!cancelled) setOcrCacheCount(0)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const currentEngine = OCR_ENGINES.find((e) => e.value === (state.ocrEngine || 'ai-model'))

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  const handleEngineSwitch = () => {
    const idx = OCR_ENGINES.findIndex((m) => m.value === state.ocrEngine)
    const next = OCR_ENGINES[(idx + 1) % OCR_ENGINES.length]
    setOcrEngine(next.value)
    showToast('图像识别引擎已切换为：' + next.label)
  }

  const handleLanguageSwitch = () => {
    const idx = PADDLEOCR_LANGUAGES.findIndex((m) => m.value === state.paddleocrLanguage)
    const next = PADDLEOCR_LANGUAGES[(idx + 1) % PADDLEOCR_LANGUAGES.length]
    setPaddleocrLanguage(next.value)
    showToast('PaddleOCR 语言已切换为：' + next.label)
  }

  const handleSavePaddleocr = () => {
    setPaddleocrServerUrl(localServerUrl.trim())
    setPaddleocrApiToken(localApiToken.trim())
    showToast('PaddleOCR 配置已保存', 'success')
  }

  const handleSaveBaidu = () => {
    setBaiduOcrApiKey(localBaiduAk.trim())
    setBaiduOcrSecretKey(localBaiduSk.trim())
    showToast('百度智能云 OCR 配置已保存', 'success')
  }

  const handleTestPaddleocr = async () => {
    if (!localServerUrl.trim()) {
      showToast('请先填写 PaddleOCR 服务地址', 'warn')
      return
    }
    // 先保存再测试
    setPaddleocrServerUrl(localServerUrl.trim())
    setPaddleocrApiToken(localApiToken.trim())
    setPaddleTestTesting(true)
    setPaddleTestStatus(null)
    try {
      const result = await testPaddleOcrConnection(localServerUrl.trim(), localApiToken.trim())
      setPaddleTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setPaddleTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setPaddleTestTesting(false)
    }
  }

  const handleTestBaidu = async () => {
    if (!localBaiduAk.trim() || !localBaiduSk.trim()) {
      showToast('请先填写百度智能云 OCR 的 API Key 和 Secret Key', 'warn')
      return
    }
    setBaiduOcrApiKey(localBaiduAk.trim())
    setBaiduOcrSecretKey(localBaiduSk.trim())
    setBaiduTestTesting(true)
    setBaiduTestStatus(null)
    try {
      const result = await testBaiduOcrConnection(localBaiduAk.trim(), localBaiduSk.trim())
      setBaiduTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setBaiduTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setBaiduTestTesting(false)
    }
  }

  const handleTestLocal = async () => {
    setLocalTestTesting(true)
    setLocalTestStatus(null)
    setLocalInitStatus('loading')
    setLocalDiagResult(null)
    try {
      const result = await testPaddleOcrLocalConnection()
      setLocalTestStatus(result)
      setLocalInitStatus(result.ok ? 'ready' : 'error')
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setLocalTestStatus(fail)
      setLocalInitStatus('error')
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setLocalTestTesting(false)
    }
  }

  // 详细诊断：检查 WebGL、模型 URL 可达性
  const handleDiagnoseLocal = async () => {
    setLocalDiagRunning(true)
    setLocalDiagResult(null)
    try {
      const result = await diagnosePaddleOcrLocal()
      setLocalDiagResult(result)
      showToast(result.ok ? '✅ 诊断完成' : '❌ 诊断完成，发现问题', result.ok ? 'success' : 'warn')
    } catch (e) {
      setLocalDiagResult({ ok: false, message: '诊断失败：' + (e?.message || '未知错误'), detail: null })
      showToast('诊断失败', 'error')
    } finally {
      setLocalDiagRunning(false)
    }
  }

  // Tesseract.js 测试：加载语言包
  const handleTestTesseract = async () => {
    setTesseractTestTesting(true)
    setTesseractTestStatus(null)
    setTesseractInitStatus('loading')
    setTesseractInitProgress(0)
    try {
      const result = await testTesseractOcrConnection(selectedTesseractLang)
      setTesseractTestStatus(result)
      setTesseractInitStatus(result.ok ? 'ready' : 'error')
      if (result.ok) {
        setTesseractLanguage(selectedTesseractLang)
      }
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setTesseractTestStatus(fail)
      setTesseractInitStatus('error')
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setTesseractTestTesting(false)
    }
  }

  // Tesseract.js 语言切换
  const handleTesseractLangSwitch = () => {
    const idx = TESSERACT_LANGUAGES.findIndex((l) => l.value === selectedTesseractLang)
    const next = TESSERACT_LANGUAGES[(idx + 1) % TESSERACT_LANGUAGES.length]
    setSelectedTesseractLang(next.value)
    setTesseractLanguage(next.value)
    showToast('Tesseract.js 语言已切换为：' + next.label)
  }

  // Tesseract.js 释放 worker
  const handleReleaseTesseract = async () => {
    try {
      await releaseTesseractWorker()
      setTesseractInitStatus('idle')
      setTesseractInitProgress(0)
      showToast('已释放 Tesseract.js worker', 'info')
    } catch (e) {
      showToast('释放失败：' + (e?.message || '未知错误'), 'error')
    }
  }

  // 通用AI视觉配置保存
  const handleSaveVisionAi = () => {
    setVisionAiUrl(localVisionAiUrl.trim())
    setVisionAiKey(localVisionAiKey.trim())
    setVisionAiModel(localVisionAiModel.trim())
    showToast('通用AI视觉配置已保存', 'success')
  }

  // 通用AI视觉连接测试
  const handleTestVisionAi = async () => {
    const url = localVisionAiUrl.trim()
    const key = localVisionAiKey.trim()
    const model = localVisionAiModel.trim()
    if (!url) { showToast('请先填写 API 地址', 'warn'); return }
    if (!key) { showToast('请先填写 API Key', 'warn'); return }
    if (!model) { showToast('请先填写模型名称', 'warn'); return }
    setVisionAiTestTesting(true)
    setVisionAiTestStatus(null)
    try {
      const result = await testVisionAiConnection(url, key, model)
      setVisionAiTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
      setVisionAiTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    } finally {
      setVisionAiTestTesting(false)
    }
  }

  return (
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
      onSelectStart={preventTextMenu}
    >
      <div className="settings-sub-header">
        <button className="settings-back-btn" onClick={() => navigate('/settings')}>
          <BackArrow />
        </button>
        <span className="settings-sub-title">图像识别</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        {/* 引擎选择 */}
        <div className="settings-section">
          <h3 className="settings-section-title">识别引擎</h3>
          <div className="settings-row settings-row-clickable card-interactive" onClick={handleEngineSwitch}>
            <span className="settings-row-label">当前引擎</span>
            <span className="settings-row-value">{currentEngine?.label || 'AI 大模型视觉'}</span>
            <Arrow />
          </div>
          <div style={{
            padding: '12px 14px',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: '8px',
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--color-text-secondary)',
            margin: '8px 0 0 0',
          }}>
            {currentEngine?.description}
          </div>
        </div>

        {/* 通用选项 */}
        <div className="settings-section">
          <h3 className="settings-section-title">通用</h3>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row-left">
                <span className="settings-row-label">OCR 后自动生成卡片</span>
                <span className="settings-row-desc">开启后图片识别完成自动触发卡片生成；关闭后识别结果写入输入框</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={state.ocrAutoGenerate}
                  onChange={(e) => setOcrAutoGenerate(e.target.checked)}
                />
                <span className="switch-slider" />
              </label>
            </div>
            <div className="settings-row">
              <div className="settings-row-left">
                <span className="settings-row-label">清理 OCR 缓存{ocrCacheCount !== null && ocrCacheCount > 0 ? `（${ocrCacheCount} 条）` : ''}</span>
                <span className="settings-row-desc">删除已缓存的图片识别结果，释放存储空间</span>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}
                disabled={ocrCacheCount === null || ocrCacheCount === 0}
                onClick={async () => {
                  try {
                    const { clearOcrCache } = await import('../services/db')
                    const count = await clearOcrCache()
                    setOcrCacheCount(0)
                    showToast('已清理 ' + count + ' 条 OCR 缓存', 'success')
                  } catch (e) {
                    showToast('清理失败：' + (e.message || '未知错误'), 'error')
                  }
                }}
              >
                {ocrCacheCount === null ? '加载中…' : ocrCacheCount === 0 ? '无缓存' : '清理'}
              </button>
            </div>
          </div>
        </div>

        {/* OCR 功能测试面板 */}
        <div className="settings-section">
          <h3 className="settings-section-title">功能测试</h3>
          <div className="settings-block">
            <div style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              marginBottom: '10px',
              lineHeight: 1.6,
            }}>
              上传一张图片，验证当前图像识别引擎是否正常工作。
            </div>
            <input
              ref={testImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleTestImageSelect}
              style={{ display: 'none' }}
            />
            {!testImagePreview ? (
              <button
                onClick={() => testImageInputRef.current?.click()}
                className="settings-btn-sm"
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '2px dashed var(--color-border)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>点击上传图片</span>
              </button>
            ) : (
              <>
                <div style={{
                  width: '100%',
                  maxHeight: '200px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  marginBottom: '10px',
                  backgroundColor: 'var(--color-bg-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <img src={testImagePreview} alt="测试图片" style={{ maxWidth: '100%', maxHeight: '200px', display: 'block' }} />
                </div>
                <div className="settings-btn-row" style={{ marginBottom: '10px' }}>
                  <button
                    onClick={handleTestOcr}
                    disabled={testOcrRunning}
                    className="settings-btn-sm"
                    style={{ background: 'var(--color-primary)', color: '#fff', flex: 1 }}
                  >
                    {testOcrRunning ? '识别中…' : '开始识别'}
                  </button>
                  <button onClick={handleClearTestImage} className="settings-btn-sm">
                    更换图片
                  </button>
                </div>
                {testOcrResult && (
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
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>识别结果：</div>
                    {testOcrResult}
                  </div>
                )}
                {testOcrError && (
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-danger-light)',
                    color: 'var(--color-danger)',
                    fontSize: '13px',
                    lineHeight: 1.6,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>识别失败：</div>
                    {testOcrError}
                  </div>
                )}
                {testOcrLogs.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => setTestOcrLogOpen(!testOcrLogOpen)}
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
                      <span>📋 详细日志 ({testOcrLogs.length} 条)</span>
                      <span style={{ transform: testOcrLogOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>▼</span>
                    </button>
                    {testOcrLogOpen && (
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
                        {testOcrLogs.map((log, idx) => (
                          <div key={idx} style={{ marginBottom: '6px', borderBottom: idx < testOcrLogs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingBottom: '6px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                              <span style={{ color: '#64748b', flexShrink: 0 }}>[{log.timestamp}]</span>
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '3px',
                                fontSize: '10px',
                                fontWeight: 600,
                                flexShrink: 0,
                                ...(log.level === 'error' ? { background: '#ef4444', color: '#fff' } :
                                    log.level === 'success' ? { background: '#22c55e', color: '#fff' } :
                                    { background: '#3b82f6', color: '#fff' }),
                              }}>{log.step}</span>
                              <span style={{ color: log.level === 'error' ? '#fca5a5' : log.level === 'success' ? '#86efac' : '#93c5fd' }}>
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
              </>
            )}
          </div>
        </div>


        {/* PaddleOCR 自建服务配置 */}
        {state.ocrEngine === 'paddleocr-server' && (
          <div className="settings-section">
            <h3 className="settings-section-title">PaddleOCR 自建服务</h3>
            <div className="settings-block">
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-bg-secondary)',
                marginBottom: '12px',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--color-text-secondary)',
              }}>
                <p style={{ margin: '0 0 6px 0' }}>✅ <strong>完全免费开源</strong>：基于百度 PaddleOCR（Apache 2.0）</p>
                <p style={{ margin: '0 0 6px 0' }}>🏠 <strong>自托管</strong>：需在本机或服务器运行 Python 服务</p>
                <p style={{ margin: 0 }}>📦 服务脚本：<code style={{ fontSize: 11 }}>paddleocr_server/server.py</code></p>
              </div>

              <label className="settings-label">服务地址</label>
              <input
                className="settings-input settings-mb-8"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="http://192.168.1.100:8000"
                value={localServerUrl}
                onChange={(e) => setLocalServerUrl(e.target.value)}
                onBlur={() => setPaddleocrServerUrl(localServerUrl.trim())}
              />

              <label className="settings-label">语言模型</label>
              <div className="settings-row settings-row-clickable card-interactive" onClick={handleLanguageSwitch} style={{ marginBottom: 10 }}>
                <span className="settings-row-label">语言</span>
                <span className="settings-row-value">
                  {PADDLEOCR_LANGUAGES.find((l) => l.value === state.paddleocrLanguage)?.label || '中英文（默认）'}
                </span>
                <Arrow />
              </div>

              <label className="settings-label">API Token（可选）</label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  className="settings-input settings-input-eye"
                  type={localApiTokenShow ? 'text' : 'password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="留空表示无需鉴权"
                  value={localApiToken}
                  onChange={(e) => setLocalApiToken(e.target.value)}
                  onBlur={() => setPaddleocrApiToken(localApiToken.trim())}
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setLocalApiTokenShow((v) => !v)}
                  aria-label={localApiTokenShow ? '隐藏' : '显示'}
                >
                  {localApiTokenShow ? '🙈' : '👁'}
                </button>
              </div>

              <div className="settings-btn-row" style={{ marginTop: 12 }}>
                <button onClick={handleSavePaddleocr} className="settings-btn-sm" disabled={paddleTestTesting}>
                  保存配置
                </button>
                <button
                  onClick={handleTestPaddleocr}
                  className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                  disabled={paddleTestTesting}
                >
                  {paddleTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {paddleTestStatus && (
                <div className="settings-status" style={{
                  marginTop: 10,
                  backgroundColor: paddleTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: paddleTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{paddleTestStatus.ok ? '✅' : '❌'} {paddleTestStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 百度智能云 OCR 配置 */}
        {state.ocrEngine === 'baidu-cloud' && (
          <div className="settings-section">
            <h3 className="settings-section-title">百度智能云 OCR</h3>
            <div className="settings-block">
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-bg-secondary)',
                marginBottom: 12,
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--color-text-secondary)',
              }}>
                <p style={{ margin: '0 0 6px 0' }}>☁️ <strong>商业云服务</strong>：基于 PaddleOCR 商业版，每月免费 1000 次</p>
                <p style={{ margin: 0 }}>📋 在 <a href="https://console.bce.baidu.com/ai/#/ai/ocr/app/list" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>百度智能云控制台</a> 创建文字识别应用获取 AK/SK</p>
              </div>

              <label className="settings-label">API Key</label>
              <input
                className="settings-input settings-mb-8"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="百度智能云 API Key"
                value={localBaiduAk}
                onChange={(e) => setLocalBaiduAk(e.target.value)}
                onBlur={() => setBaiduOcrApiKey(localBaiduAk.trim())}
              />

              <label className="settings-label">Secret Key</label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  className="settings-input settings-input-eye"
                  type={localBaiduSkShow ? 'text' : 'password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="百度智能云 Secret Key"
                  value={localBaiduSk}
                  onChange={(e) => setLocalBaiduSk(e.target.value)}
                  onBlur={() => setBaiduOcrSecretKey(localBaiduSk.trim())}
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setLocalBaiduSkShow((v) => !v)}
                  aria-label={localBaiduSkShow ? '隐藏' : '显示'}
                >
                  {localBaiduSkShow ? '🙈' : '👁'}
                </button>
              </div>

              <div className="settings-btn-row" style={{ marginTop: 12 }}>
                <button onClick={handleSaveBaidu} className="settings-btn-sm" disabled={baiduTestTesting}>
                  保存配置
                </button>
                <button
                  onClick={handleTestBaidu}
                  className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                  disabled={baiduTestTesting}
                >
                  {baiduTestTesting ? '测试中…' : '测试鉴权'}
                </button>
              </div>
              {baiduTestStatus && (
                <div className="settings-status" style={{
                  marginTop: 10,
                  backgroundColor: baiduTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: baiduTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{baiduTestStatus.ok ? '✅' : '❌'} {baiduTestStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI 大模型视觉 */}
        {state.ocrEngine === 'ai-model' && (
          <div className="settings-section">
            <h3 className="settings-section-title">AI 大模型视觉</h3>
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-bg-secondary)',
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
              marginBottom: '12px',
            }}>
              <p style={{ margin: '0 0 6px 0' }}>🤖 <strong>沿用 AI 服务设置</strong>：使用当前 AI 服务（DeepSeek/星火/火山/千问）的多模态视觉能力</p>
              <p style={{ margin: '0 0 6px 0' }}>⚙️ 请前往「设置 → AI 服务」配置对应的 API Key 与模型</p>
              <p style={{ margin: 0 }}>💡 如在下方案置了「通用AI视觉」，则图像识别优先调用该独立服务</p>
            </div>

            <div className="settings-block">
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-bg-secondary)',
                marginBottom: '12px',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--color-text-secondary)',
              }}>
                <p style={{ margin: 0 }}>🔄 <strong>通用AI视觉（独立配置）</strong>：配置后图像识别优先使用此服务，失败时自动降级到上方 AI 服务</p>
              </div>

              <label className="settings-label">API 地址</label>
              <input
                className="settings-input settings-mb-8"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="https://api.example.com"
                value={localVisionAiUrl}
                onChange={(e) => setLocalVisionAiUrl(e.target.value)}
                onBlur={() => setVisionAiUrl(localVisionAiUrl.trim())}
              />

              <label className="settings-label">API Key</label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  className="settings-input settings-input-eye"
                  type={localVisionAiKeyShow ? 'text' : 'password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="sk-xxx"
                  value={localVisionAiKey}
                  onChange={(e) => setLocalVisionAiKey(e.target.value)}
                  onBlur={() => setVisionAiKey(localVisionAiKey.trim())}
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setLocalVisionAiKeyShow((v) => !v)}
                  aria-label={localVisionAiKeyShow ? '隐藏' : '显示'}
                >
                  {localVisionAiKeyShow ? '🙈' : '👁'}
                </button>
              </div>

              <label className="settings-label">模型名称</label>
              <input
                className="settings-input settings-mb-8"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="gpt-4o / qwen-vl-max / doubao-vision-pro"
                value={localVisionAiModel}
                onChange={(e) => setLocalVisionAiModel(e.target.value)}
                onBlur={() => setVisionAiModel(localVisionAiModel.trim())}
              />

              <div className="settings-btn-row" style={{ marginTop: 12 }}>
                <button onClick={handleSaveVisionAi} className="settings-btn-sm" disabled={visionAiTestTesting}>
                  保存配置
                </button>
                <button
                  onClick={handleTestVisionAi}
                  className="settings-btn-sm"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                  disabled={visionAiTestTesting}
                >
                  {visionAiTestTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
              {visionAiTestStatus && (
                <div className="settings-status" style={{
                  marginTop: 10,
                  backgroundColor: visionAiTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  color: visionAiTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                }}>
                  <span>{visionAiTestStatus.ok ? '✅' : '❌'} {visionAiTestStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', padding: '16px 0 24px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          AI 背诵卡片
        </div>
      </div>
    </div>
  )
}
