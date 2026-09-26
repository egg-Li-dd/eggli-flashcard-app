import { useApp } from '../context/AppContext'
import { MODELS, AI_SERVICE_MODES, IFLYTEK_SPARK_MODELS, VOLCANO_ENGINE_MODELS, DASHSCOPE_MODELS } from '../utils/constants'
import { testAiConnection } from '../services/aiService'
import { getAiCallLogs, getAiCallStats, clearAiCallLogs, getPurposeLabel, formatTimestamp, formatCost, getModelLabel, resolveModelName, getUniqueModelNames, filterLogsByModel, getStatsByModel } from '../services/aiCallLog'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const FONT_OPTIONS = [
  { value: 'small', label: '小', description: '紧凑显示' },
  { value: 'normal', label: '标准', description: '默认大小' },
  { value: 'large', label: '大', description: '更大字号' },
]

export default function SettingsAiService() {
  const {
    state,
    setApiKey,
    setModel,
    setAiServiceMode,
    setIflytekSparkApiKey,
    setIflytekSparkModel,
    setVolcanoApiKey,
    setVolcanoModel,
    setDashscopeApiKey,
    setDashscopeModel,
    showToast,
  } = useApp()
  const navigate = useNavigate()

  const [apiKey, setLocalApiKey] = useState(state.apiKey)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)

  // 讯飞星火配置 - 只需一个 APIPassword，与全局 state.iflytekSparkApiKey 保持一致
  const [localSparkApiPassword, setLocalSparkApiPassword] = useState(state.iflytekSparkApiKey || '')

  const [sparkTestTesting, setSparkTestTesting] = useState(false)
  const [sparkTestStatus, setSparkTestStatus] = useState(null)

  // 模型切换时清空测试结果（方便重新测试）
  useEffect(() => {
    setSparkTestStatus(null)
  }, [state.iflytekSparkModel])

  // 火山引擎豆包配置状态
  const [localVolcanoApiKey, setLocalVolcanoApiKey] = useState(state.volcanoApiKey)
  const [localVolcanoApiKeyShow, setLocalVolcanoApiKeyShow] = useState(false)
  const [volcanoTestTesting, setVolcanoTestTesting] = useState(false)
  const [volcanoTestStatus, setVolcanoTestStatus] = useState(null)

  // 阿里云千问配置状态
  const [localDashscopeApiKey, setLocalDashscopeApiKey] = useState(state.dashscopeApiKey)
  const [localDashscopeApiKeyShow, setLocalDashscopeApiKeyShow] = useState(false)
  const [dashscopeTestTesting, setDashscopeTestTesting] = useState(false)
  const [dashscopeTestStatus, setDashscopeTestStatus] = useState(null)

  // DeepSeek API 测试状态
  const [apiTestStatus, setApiTestStatus] = useState(null) // null | 'success' | 'fail'

  // AI 调用日志
  const [aiLogs, setAiLogs] = useState([])
  const [aiStats, setAiStats] = useState({ total: 0, success: 0, failed: 0, totalCost: 0 })
  const [refreshTick, setRefreshTick] = useState(0)
  const [viewLog, setViewLog] = useState(null) // 查看 AI 内容弹窗
  const [selectedModel, setSelectedModel] = useState(null) // 按模型筛选日志
  const [showServicePicker, setShowServicePicker] = useState(false) // AI 服务提供商选择菜单
  const lastAutoModel = useRef(null) // 追踪上一次自动设置的模型名

  // 计算当前激活的模型名（根据 aiServiceMode + 对应 model）
  const currentActiveModel = useMemo(() => resolveModelName(state.aiServiceMode,
    state.aiServiceMode === 'iflytek-spark' ? state.iflytekSparkModel :
    state.aiServiceMode === 'volcano' ? state.volcanoModel :
    state.aiServiceMode === 'dashscope' ? state.dashscopeModel :
    state.model
  ), [state.aiServiceMode, state.iflytekSparkModel, state.volcanoModel, state.dashscopeModel, state.model])

  useEffect(() => {
    try {
      const all = getAiCallLogs() || []
      // 如果当前有模型筛选，则过滤；否则显示全部
      const filtered = selectedModel ? filterLogsByModel(all, selectedModel) : all
      setAiLogs(filtered)
      setAiStats(selectedModel ? getStatsByModel(all, selectedModel) : getAiCallStats())
    } catch (_) {}
  }, [refreshTick, selectedModel])

  // 当 AI 服务或模型切换时，自动跳转到对应模型的日志
  useEffect(() => {
    const active = currentActiveModel
    // 切换服务商/模型时，始终自动切换到对应模型的日志视图（即使该模型暂无日志）
    if (active !== lastAutoModel.current) {
      lastAutoModel.current = active
      setSelectedModel(active)
    }
  }, [state.aiServiceMode, state.model, state.iflytekSparkModel, state.volcanoModel, state.dashscopeModel, currentActiveModel])

  const handleClearLogs = () => {
    if (clearAiCallLogs()) {
      setAiLogs([])
      setAiStats({ total: 0, success: 0, failed: 0, totalCost: 0 })
      setSelectedModel(null)
      showToast('日志已清空')
    }
  }

  const handleRefreshLogs = () => {
    setRefreshTick(t => t + 1)
  }

  const handleSaveKey = () => {
    const trimmed = apiKey.trim()
    if (trimmed && !trimmed.startsWith('sk-')) {
      showToast('API Key 格式可能不正确，通常以 sk- 开头', 'error')
    }
    setApiKey(trimmed)
    setApiTestStatus(null)
    showToast('API 设置已保存')
  }

  const handleTest = async () => {
    const key = apiKey.trim()
    if (!key) {
      showToast('请先填写 API Key', 'error')
      return
    }
    setTesting(true)
    setApiTestStatus(null)
    try {
      const result = await testAiConnection(key, 'deepseek')
      const ok =
        (typeof result === 'object' && (result.ok === true || result.success === true)) ||
        result === true
      setApiTestStatus(ok ? 'success' : 'fail')
      showToast(ok ? '✅ 测试成功！API Key 有效' : '测试失败，请检查 Key', ok ? 'success' : 'error')
    } catch (e) {
      setApiTestStatus('fail')
      showToast(`❌ 测试失败：${e.message || '连接失败'}`, 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleSparkTest = async () => {
    const sparkPassword = localSparkApiPassword.trim()

    if (!sparkPassword) {
      showToast('请先填写讯飞星火的 APIPassword', 'warn')
      return
    }
    setSparkTestTesting(true)
    setSparkTestStatus(null)
    try {
      const modelToTest = state.iflytekSparkModel || 'lite'
      const result = await testAiConnection(null, 'iflytek-spark', modelToTest, sparkPassword, '')
      setSparkTestStatus(result)
      showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error')
    } catch (e) {
      const fail = { ok: false, message: e?.message || '连接失败' }
      setSparkTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    }
    setSparkTestTesting(false)
  }

  const handleVolcanoTest = async () => {
    const volcanoKey = localVolcanoApiKey.trim()
    if (!volcanoKey) {
      showToast('请先填写火山引擎的 API Key', 'warn')
      return
    }
    setVolcanoTestTesting(true)
    setVolcanoTestStatus(null)
    try {
      const modelToTest = state.volcanoModel || 'doubao-pro-32k'
      await testAiConnection(null, 'volcano', modelToTest, null, null, volcanoKey)
      setVolcanoTestStatus({ ok: true, message: '连接成功！API Key 有效' })
      showToast('✅ 火山引擎连接成功！', 'success')
    } catch (e) {
      const fail = { ok: false, message: e?.message || '连接失败' }
      setVolcanoTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    }
    setVolcanoTestTesting(false)
  }

  const handleDashscopeTest = async () => {
    const dashscopeKey = localDashscopeApiKey.trim()
    if (!dashscopeKey) {
      showToast('请先填写阿里云千问的 API Key', 'warn')
      return
    }
    setDashscopeTestTesting(true)
    setDashscopeTestStatus(null)
    try {
      const modelToTest = state.dashscopeModel || 'qwen3.5-plus-2026-04-20'
      await testAiConnection(null, 'dashscope', modelToTest, null, null, null, dashscopeKey)
      setDashscopeTestStatus({ ok: true, message: '连接成功！API Key 有效' })
      showToast('✅ 千问连接成功！', 'success')
    } catch (e) {
      const fail = { ok: false, message: e?.message || '连接失败' }
      setDashscopeTestStatus(fail)
      showToast(`❌ ${fail.message}`, 'error')
    }
    setDashscopeTestTesting(false)
  }

  const handleModelChange = (model) => {
    setModel(model)
    showToast('模型已切换')
  }

  const EyeIcon = ({ on }) => on ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  )

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

  const currentModel = MODELS.find(m => m.value === state.model)
  const currentAiService = AI_SERVICE_MODES.find(m => m.value === state.aiServiceMode)
  const currentSparkModel = IFLYTEK_SPARK_MODELS.find(m => m.value === state.iflytekSparkModel)
  const currentVolcanoModel = VOLCANO_ENGINE_MODELS.find(m => m.value === state.volcanoModel)
  const currentDashscopeModel = DASHSCOPE_MODELS.find(m => m.value === state.dashscopeModel)

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
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
        <span className="settings-sub-title">AI 服务</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        <div className="settings-section">
          {/* AI 服务提供商切换 */}
          <div className="settings-row settings-row-clickable card-interactive" onClick={() => setShowServicePicker(true)}>
            <span className="settings-row-label">服务提供商</span>
            <span className="settings-row-value">{currentAiService?.label || 'DeepSeek'}</span>
            <Arrow />
          </div>

          {/* DeepSeek 配置区 */}
          {state.aiServiceMode === 'deepseek' && (
            <>
              <div className="settings-block">
                <div className="settings-mb-10" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>DeepSeek API Key</div>
                <div style={{ position: 'relative' }}>
                  <input type={showKey ? 'text' : 'password'} value={apiKey}
                    onChange={(e) => setLocalApiKey(e.target.value)} onBlur={handleSaveKey}
                    placeholder="sk-xxxxxxxxxxxxxxxx"
                    className="settings-input settings-input-eye"
                  />
                  <button type="button" className="settings-eye-btn" onClick={() => setShowKey(!showKey)}>
                    <EyeIcon on={showKey} />
                  </button>
                </div>
                <div className="settings-btn-row">
                  <button onClick={handleSaveKey} className="settings-btn-sm"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>保存</button>
                  <button onClick={handleTest} disabled={testing || !apiKey.trim()} className="settings-btn-sm"
                    style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>
                    {testing ? '测试中...' : '测试连接'}
                  </button>
                </div>
                {apiTestStatus && (
                  <div className="settings-status" style={{
                    backgroundColor: apiTestStatus === 'success' ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                    color: apiTestStatus === 'success' ? 'var(--color-success-dark)' : 'var(--color-danger)',
                  }}>
                    <span>{apiTestStatus === 'success' ? '✅' : '❌'}</span>
                    <span>{apiTestStatus === 'success' ? 'API Key 有效' : '测试失败，请检查 Key'}</span>
                  </div>
                )}
                <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer"
                  className="settings-link-btn">
                  <span>前往 DeepSeek 官网获取 API Key</span>
                  <Arrow />
                </a>
              </div>
              <div className="settings-row settings-row-clickable card-interactive" onClick={() => {
                const idx = MODELS.findIndex(m => m.value === state.model)
                const next = MODELS[(idx + 1) % MODELS.length]
                setModel(next.value)
                showToast('模型已切换为：' + next.label)
              }}>
                <span className="settings-row-label">模型</span>
                <span className="settings-row-value">{currentModel?.label || 'DeepSeek-V3'}</span>
                <Arrow />
              </div>
            </>
          )}

          {/* 讯飞星火配置区 */}
          {state.aiServiceMode === 'iflytek-spark' && (
            <>
              <div className="settings-block">
                <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  讯飞星火配置
                </div>
                <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    填入讯飞星火大模型的 <b>APIPassword</b>。前往讯飞星火控制台（xinghuo.xfyun.cn/sparkapi）→ 选择模型（如 Spark-Lite、Spark-Pro、Spark-Max、Spark 4.0 Ultra）→ 查看接口认证信息中的 APIPassword 即可。
                  </span>
                </p>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <input type="text" value={localSparkApiPassword}
                    onChange={(e) => {
                      const newValue = e.target.value
                      setLocalSparkApiPassword(newValue)
                      // 同步保存到全局 state.iflytekSparkApiKey（供 AI 服务调用）
                      setIflytekSparkApiKey(newValue)
                    }}
                    placeholder="APIPassword（必填）"
                    className="settings-input"
                  />
                </div>
                <div className="settings-btn-row">
                  <button onClick={handleSparkTest}
                    disabled={sparkTestTesting || !localSparkApiPassword.trim()}
                    className="settings-btn-sm"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    {sparkTestTesting ? '测试中...' : '测试连接'}
                  </button>
                </div>
                {sparkTestStatus && (
                  <div className="settings-status" style={{
                    marginTop: '10px',
                    backgroundColor: sparkTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                    color: sparkTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                  }}>
                    <span>{sparkTestStatus.ok ? '✅' : '❌'}</span>
                    <span>{sparkTestStatus.message}{sparkTestStatus.detail ? `（${sparkTestStatus.detail}）` : ''}</span>
                  </div>
                )}
                <a href="https://console.xfyun.cn/services/bm35" target="_blank" rel="noopener noreferrer"
                  className="settings-link-btn">
                  <span>前往讯飞开放平台获取 APIPassword</span>
                  <Arrow />
                </a>
              </div>
              <div className="settings-row settings-row-clickable card-interactive" onClick={() => {
                const idx = IFLYTEK_SPARK_MODELS.findIndex(m => m.value === state.iflytekSparkModel)
                const next = IFLYTEK_SPARK_MODELS[(idx + 1) % IFLYTEK_SPARK_MODELS.length]
                setIflytekSparkModel(next.value)
                showToast('星火模型已切换为：' + next.label)
              }}>
                <span className="settings-row-label">星火模型</span>
                <span className="settings-row-value">{currentSparkModel?.label || 'Spark Lite'}</span>
                <Arrow />
              </div>
            </>
          )}

          {/* 火山引擎豆包大模型配置区 */}
          {state.aiServiceMode === 'volcano' && (
            <>
              <div className="settings-block">
                <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  火山引擎豆包大模型配置
                </div>
                <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    填入火山引擎的 API Key（Ark API Key）。国内直连，无需代理，支持豆包 Pro/Lite 等多种模型。
                  </span>
                </p>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <input type={localVolcanoApiKeyShow ? 'text' : 'password'} value={localVolcanoApiKey}
                    onChange={(e) => {
                      setLocalVolcanoApiKey(e.target.value)
                      setVolcanoApiKey(e.target.value)
                    }}
                    placeholder="API Key"
                    className="settings-input settings-input-eye"
                  />
                  <button type="button" className="settings-eye-btn" onClick={() => setLocalVolcanoApiKeyShow(!localVolcanoApiKeyShow)}>
                    <EyeSmall on={localVolcanoApiKeyShow} />
                  </button>
                </div>
                <div className="settings-btn-row">
                  <button onClick={handleVolcanoTest}
                    disabled={volcanoTestTesting || !localVolcanoApiKey.trim()}
                    className="settings-btn-sm"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    {volcanoTestTesting ? '测试中...' : '测试连接'}
                  </button>
                </div>
                {volcanoTestStatus && (
                  <div className="settings-status" style={{
                    marginTop: '10px',
                    backgroundColor: volcanoTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                    color: volcanoTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                  }}>
                    <span>{volcanoTestStatus.ok ? '✅' : '❌'}</span>
                    <span>{volcanoTestStatus.message}</span>
                  </div>
                )}
                <a href="https://console.volcengine.com/ark" target="_blank" rel="noopener noreferrer"
                  className="settings-link-btn">
                  <span>前往火山引擎 Ark 平台获取 API Key</span>
                  <Arrow />
                </a>
              </div>
              <div className="settings-row settings-row-clickable card-interactive" onClick={() => {
                const idx = VOLCANO_ENGINE_MODELS.findIndex(m => m.value === state.volcanoModel)
                const next = VOLCANO_ENGINE_MODELS[(idx + 1) % VOLCANO_ENGINE_MODELS.length]
                setVolcanoModel(next.value)
                showToast('豆包模型已切换为：' + next.label)
              }}>
                <span className="settings-row-label">豆包模型</span>
                <span className="settings-row-value">{currentVolcanoModel?.label || '豆包 Pro-32K'}</span>
                <Arrow />
              </div>
            </>
          )}

          {/* 阿里云千问大模型配置区 */}
          {state.aiServiceMode === 'dashscope' && (
            <>
              <div className="settings-block">
                <div className="settings-block-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  阿里云千问大模型配置
                </div>
                <p className="settings-hint" style={{ marginTop: -5, marginBottom: 10 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    填入阿里云 DashScope 的 API Key。国内直连，无需代理，支持 Qwen-Turbo/Qwen-Plus/Qwen-Max/Qwen-Long 等多种模型。
                  </span>
                </p>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <input type={localDashscopeApiKeyShow ? 'text' : 'password'} value={localDashscopeApiKey}
                    onChange={(e) => {
                      setLocalDashscopeApiKey(e.target.value)
                      setDashscopeApiKey(e.target.value)
                    }}
                    placeholder="API Key (sk-...)"
                    className="settings-input settings-input-eye"
                  />
                  <button type="button" className="settings-eye-btn" onClick={() => setLocalDashscopeApiKeyShow(!localDashscopeApiKeyShow)}>
                    <EyeSmall on={localDashscopeApiKeyShow} />
                  </button>
                </div>
                <div className="settings-btn-row">
                  <button onClick={handleDashscopeTest}
                    disabled={dashscopeTestTesting || !localDashscopeApiKey.trim()}
                    className="settings-btn-sm"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    {dashscopeTestTesting ? '测试中...' : '测试连接'}
                  </button>
                </div>
                {dashscopeTestStatus && (
                  <div className="settings-status" style={{
                    marginTop: '10px',
                    backgroundColor: dashscopeTestStatus.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                    color: dashscopeTestStatus.ok ? 'var(--color-success-dark)' : 'var(--color-danger)',
                  }}>
                    <span>{dashscopeTestStatus.ok ? '✅' : '❌'}</span>
                    <span>{dashscopeTestStatus.message}</span>
                  </div>
                )}
                <a href="https://bailian.console.aliyun.com/cn-beijing?spm=5176.12818093_47.overview_recent.1.86b216d0qVYRgH&tab=model#/api-key" target="_blank" rel="noopener noreferrer"
                  className="settings-link-btn">
                  <span>前往阿里云百炼（DashScope）获取 API Key</span>
                  <Arrow />
                </a>
              </div>
              <div className="settings-row settings-row-clickable card-interactive" onClick={() => {
                const idx = DASHSCOPE_MODELS.findIndex(m => m.value === state.dashscopeModel)
                const next = DASHSCOPE_MODELS[(idx + 1) % DASHSCOPE_MODELS.length]
                setDashscopeModel(next.value)
                showToast('千问模型已切换为：' + next.label)
              }}>
                <span className="settings-row-label">千问模型</span>
                <span className="settings-row-value">{currentDashscopeModel?.label || 'Qwen-Turbo'}</span>
                <Arrow />
              </div>
            </>
          )}
        </div>

        {/* AI 调用日志区块 */}
        <div className="settings-section" style={{ marginTop: '16px' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '28px',
          }}>
            <span>AI 调用日志</span>
            <span style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleRefreshLogs}
                className="settings-btn-sm"
                style={{
                  background: 'var(--color-border-strong)',
                  color: 'var(--color-text)',
                  minHeight: '36px',
                  padding: '0 12px',
                }}
              >
                刷新
              </button>
              <button
                onClick={handleClearLogs}
                disabled={aiLogs.length === 0}
                className="settings-btn-sm"
                style={{
                  background: aiLogs.length === 0 ? 'var(--color-border)' : 'var(--color-danger-light)',
                  color: aiLogs.length === 0 ? 'var(--color-text-secondary)' : 'var(--color-danger)',
                  minHeight: '36px',
                  padding: '0 12px',
                }}
              >
                清空
              </button>
            </span>
          </div>

          {/* 模型筛选芯片 */}
          {(() => {
            const modelNames = getUniqueModelNames(getAiCallLogs())
            // 确保当前激活模型始终出现在筛选列表中（即使没有日志）
            if (!modelNames.includes(currentActiveModel)) {
              modelNames.push(currentActiveModel)
            }
            if (modelNames.length === 0) return null
            return (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginBottom: '12px',
              }}>
                <button
                  onClick={() => setSelectedModel(null)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '16px',
                    border: '1px solid ' + (selectedModel === null ? 'var(--color-primary)' : 'var(--color-border)'),
                    background: selectedModel === null ? 'var(--color-primary)' : 'var(--color-bg-card)',
                    color: selectedModel === null ? '#fff' : 'var(--color-text)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '32px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  全部
                </button>
                {modelNames.map(m => {
                  const isActive = selectedModel === m
                  const isCurrent = m === currentActiveModel
                  return (
                    <button
                      key={m}
                      onClick={() => setSelectedModel(m)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '16px',
                        border: '1px solid ' + (isActive ? 'var(--color-primary)' : 'var(--color-border)'),
                        background: isActive ? 'var(--color-primary)' : 'var(--color-bg-card)',
                        color: isActive ? '#fff' : 'var(--color-text)',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        minHeight: '32px',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {getModelLabel(m)}
                      {isCurrent && (
                        <span style={{
                          fontSize: '10px',
                          opacity: isActive ? 0.9 : 0.6,
                        }}>
                          ·当前
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* 统计卡片 */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '12px',
            flexWrap: 'wrap',
          }}>
            <div style={{
              flex: '1 1 0',
              minWidth: '90px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '10px 8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>{aiStats.total}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>总调用</div>
            </div>
            <div style={{
              flex: '1 1 0',
              minWidth: '90px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '10px 8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success-dark)', lineHeight: 1.2 }}>{aiStats.success}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>成功</div>
            </div>
            <div style={{
              flex: '1 1 0',
              minWidth: '90px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '10px 8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-danger)', lineHeight: 1.2 }}>{aiStats.failed}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>失败</div>
            </div>
            <div style={{
              flex: '1 1 0',
              minWidth: '90px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '10px 8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1.2 }}>
                {formatCost(aiStats.totalCost)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>估算花费</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>基于 token 用量估算</div>
            </div>
          </div>

          {/* 日志列表 */}
          <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
            background: 'var(--color-bg-card)',
          }}>
            {aiLogs.length === 0 ? (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: '14px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                <div>暂无 AI 调用记录</div>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                  生成卡片、识别图片或整理语音后会显示在这里
                </div>
              </div>
            ) : (
              aiLogs.map((log, idx) => (
                <div
                  key={log.id || ('log-' + idx)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: idx < aiLogs.length - 1 ? '1px solid var(--color-border)' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    minHeight: '44px',
                  }}
                >
                  <div style={{
                    fontSize: '16px',
                    lineHeight: '20px',
                    marginTop: '1px',
                    flexShrink: 0,
                  }}>
                    {log.status === 'error' ? '⚠️' : '✅'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '3px',
                      gap: '8px',
                    }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {getPurposeLabel(log.purpose)}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: log.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                        flexShrink: 0,
                      }}>
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--color-text-secondary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <span style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                      }}>
                        模型：{getModelLabel(log.modelName)}
                      </span>
                      <span style={{ flexShrink: 0 }}>
                        耗时 {Number(log.durationMs) || 0} ms
                      </span>
                    </div>
                    {log.errorMessage ? (
                      <div style={{
                        fontSize: '12px',
                        color: 'var(--color-danger)',
                        marginTop: '4px',
                        lineHeight: 1.4,
                      }}>
                        {String(log.errorMessage)}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
                    <button
                      onClick={() => setViewLog(log)}
                      style={{
                        width: '36px',
                        height: '36px',
                        minWidth: '36px',
                        minHeight: '36px',
                        border: 'none',
                        borderRadius: '8px',
                        background: 'var(--color-border-light)',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        transition: 'background 0.15s',
                        touchAction: 'manipulation',
                      }}
                      title="查看 AI 交互内容"
                      aria-label="查看 AI 交互内容"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* AI 内容查看弹窗 */}
      {viewLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={() => setViewLog(null)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
            }}
          />
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              background: 'var(--color-bg)',
              borderRadius: '16px 16px 0 0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'slideUp 0.25s ease',
            }}
          >
            {/* 弹窗标题栏 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-border-light)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>
                  {getPurposeLabel(viewLog.purpose)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  模型：{getModelLabel(viewLog.modelName)} · {formatTimestamp(viewLog.timestamp)}
                </div>
              </div>
              <button
                onClick={() => setViewLog(null)}
                style={{
                  width: '36px', height: '36px',
                  minWidth: '36px', minHeight: '36px',
                  border: 'none', borderRadius: '8px',
                  background: 'var(--color-border-light)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation',
                }}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {/* 弹窗内容区 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {/* 提示词 */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                    }} />
                    AI 请求（Prompt）
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                      {viewLog.prompt ? `(${viewLog.prompt.length} 字符)` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (viewLog.prompt) {
                        const text = viewLog.prompt
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(text).catch(() => {
                            const ta = document.createElement('textarea')
                            ta.value = text
                            document.body.appendChild(ta)
                            ta.select()
                            document.execCommand('copy')
                            document.body.removeChild(ta)
                          })
                        } else {
                          const ta = document.createElement('textarea')
                          ta.value = text
                          document.body.appendChild(ta)
                          ta.select()
                          document.execCommand('copy')
                          document.body.removeChild(ta)
                        }
                      }
                    }}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-primary)',
                      background: 'transparent',
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 500,
                    }}
                    disabled={!viewLog.prompt}
                  >
                    复制
                  </button>
                </div>
                <div style={{
                  background: 'var(--color-primary-light)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  color: 'var(--color-text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  WebkitUserSelect: 'text',
                  userSelect: 'text',
                  WebkitTouchCallout: 'default',
                }}>
                  {viewLog.prompt || '暂无记录'}
                </div>
              </div>

              {/* AI 响应 */}
              <div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--color-success)',
                    }} />
                    AI 响应（Response）
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                      {viewLog.response ? `(${viewLog.response.length} 字符)` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (viewLog.response) {
                        const text = viewLog.response
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(text).catch(() => {
                            const ta = document.createElement('textarea')
                            ta.value = text
                            document.body.appendChild(ta)
                            ta.select()
                            document.execCommand('copy')
                            document.body.removeChild(ta)
                          })
                        } else {
                          const ta = document.createElement('textarea')
                          ta.value = text
                          document.body.appendChild(ta)
                          ta.select()
                          document.execCommand('copy')
                          document.body.removeChild(ta)
                        }
                      }
                    }}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-success)',
                      background: 'transparent',
                      color: 'var(--color-success)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 500,
                    }}
                    disabled={!viewLog.response}
                  >
                    复制
                  </button>
                </div>
                <div style={{
                  background: 'var(--color-success-light)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  color: 'var(--color-text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  WebkitUserSelect: 'text',
                  userSelect: 'text',
                  WebkitTouchCallout: 'default',
                }}>
                  {viewLog.response || '暂无记录'}
                </div>
              </div>

              {(viewLog.prompt || viewLog.response) ? null : (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'var(--color-text-secondary)',
                  fontSize: '14px',
                }}>
                  暂无 AI 交互内容记录<br />
                  <span style={{ fontSize: '12px', marginTop: '8px', display: 'block' }}>
                    新生成的调用将自动记录内容
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI 服务提供商选择菜单 */}
      {showServicePicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={() => setShowServicePicker(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
            }}
          />
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '600px',
              background: 'var(--color-bg)',
              borderRadius: '16px 16px 0 0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'slideUp 0.25s ease',
            }}
          >
            <div style={{
              padding: '16px',
              borderBottom: '1px solid var(--color-border-light)',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--color-text)',
              textAlign: 'center',
            }}>
              选择 AI 服务提供商
            </div>
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {AI_SERVICE_MODES.map((mode) => {
                const isActive = state.aiServiceMode === mode.value
                return (
                  <button
                    key={mode.value}
                    onClick={() => {
                      setAiServiceMode(mode.value)
                      showToast('AI 服务已切换为：' + mode.label)
                      setShowServicePicker(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border-light)',
                      background: isActive ? 'var(--color-primary-light, #e8f0fe)' : 'transparent',
                      color: isActive ? 'var(--color-primary, #1a73e8)' : 'var(--color-text)',
                      fontSize: '15px',
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      minHeight: '48px',
                      touchAction: 'manipulation',
                    }}
                  >
                    <span>{mode.label}</span>
                    {isActive && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setShowServicePicker(false)}
              style={{
                padding: '14px',
                border: 'none',
                borderTop: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: '15px',
                cursor: 'pointer',
                minHeight: '48px',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}