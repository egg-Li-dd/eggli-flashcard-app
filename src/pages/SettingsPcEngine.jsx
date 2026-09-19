import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  getPcEngineConfig,
  setPcEngineConfig,
  healthCheck,
  listEngines,
} from '../services/pcEngine'

const BackArrow = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
  </svg>
)

const ENGINES = {
  ocr: [
    { id: 'paddleocr', name: 'PaddleOCR', desc: '速度快，80+语言' },
    { id: 'paddleocr-vl', name: 'PaddleOCR-VL', desc: 'VL模型，文档级OCR，表格/公式' },
    { id: 'qwen2-vl', name: 'Qwen2-VL', desc: '多模态VLM，图像理解+OCR' },
  ],
  doc: [
    { id: 'mineru', name: 'MinerU', desc: 'PDF/Office，版面分析强' },
    { id: 'docling', name: 'docling', desc: '多格式，支持HTML/EPUB' },
  ],
  asr: [
    { id: 'voice', name: 'Vosk', desc: '体积小，50MB模型' },
    { id: 'sherpa', name: 'Sherpa-ONNX', desc: '移动端首选，多模型' },
    { id: 'whisper', name: 'Faster-Whisper', desc: '99种语言，速度快' },
    { id: 'funasr', name: 'FunASR', desc: '中文最优，含标点' },
  ],
  transcribe: [
    { id: 'sherpa', name: 'Sherpa-ONNX', desc: '文件转写，移动端友好' },
    { id: 'whisper', name: 'Faster-Whisper', desc: '文件转写，99种语言' },
    { id: 'funasr', name: 'FunASR', desc: '文件转写，中文最优' },
  ],
}

export default function SettingsPcEngine() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(getPcEngineConfig())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [engines, setEngines] = useState(null)
  const [loadingEngines, setLoadingEngines] = useState(false)

  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    if (config.host && config.token) {
      // 自动检测连接
      handleTestConnection()
    }
  }, [])

  const handleSave = (patch) => {
    const newConfig = setPcEngineConfig(patch)
    setConfig(newConfig)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await healthCheck()
      if (result) {
        setTestResult({
          ok: true,
          message: `连接成功！${result.name} v${result.version}`,
        })
        // 尝试获取引擎列表
        setLoadingEngines(true)
        try {
          const data = await listEngines()
          setEngines(data)
        } catch (e) {
          // 忽略
        }
        setLoadingEngines(false)
      } else {
        setTestResult({
          ok: false,
          message: '连接失败，请检查 IP/Token 或 Tailscale 是否已连接',
        })
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message: e.message || '连接失败',
      })
    }
    setTesting(false)
  }

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
        <span className="settings-sub-title">💻 PC 引擎连接</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        {!isNative && (
          <div style={{
            background: 'var(--color-warning-light)',
            color: 'var(--color-warning-dark)',
            padding: '12px 16px',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            ⚠️ PC 引擎连接功能仅支持 Android APP，请在手机端使用
          </div>
        )}

        {/* 连接配置卡片 */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 12 }}>
            🔧 连接配置
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
              电脑 Tailscale IP / 域名
            </label>
            <input
              className="input"
              type="text"
              value={config.host}
              onChange={(e) => handleSave({ host: e.target.value.trim() })}
              placeholder="100.101.102.103 或 myserver.tailnet.ts.net"
              style={{
                width: '100%',
                minHeight: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Tailscale IP 或域名
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
              端口
            </label>
            <input
              className="input"
              type="text"
              value={config.port}
              onChange={(e) => handleSave({ port: e.target.value.trim() })}
              placeholder="19000"
              style={{
                width: '100%',
                minHeight: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              默认 19000，管理台的 API 端口号
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
              访问 Token
            </label>
            <input
              className="input"
              type="password"
              value={config.token}
              onChange={(e) => handleSave({ token: e.target.value.trim() })}
              placeholder="在管理台「引擎配置」中查看"
              style={{
                width: '100%',
                minHeight: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={handleTestConnection}
            disabled={testing || !config.host || !config.token}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              background: testing ? 'var(--color-border-light)' : 'var(--color-primary-light)',
              color: testing ? 'var(--color-text-muted)' : 'var(--color-primary-dark)',
              border: 'none',
              borderRadius: 8,
              cursor: testing || !config.host || !config.token ? 'not-allowed' : 'pointer',
            }}
          >
            {testing ? '测试中...' : '🔍 测试连接'}
          </button>

          {testResult && (
            <div style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              background: testResult.ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
              color: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
            }}>
              {testResult.ok ? '✅' : '❌'} {testResult.message}
            </div>
          )}
        </div>

        {/* 引擎选择卡片 */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 12 }}>
            ⚙️ 默认引擎选择
          </div>

          <EngineSelector
            title="图片 OCR"
            engines={ENGINES.ocr}
            value={config.ocrEngine}
            onChange={(v) => handleSave({ ocrEngine: v })}
          />
          <EngineSelector
            title="文档解析"
            engines={ENGINES.doc}
            value={config.docEngine}
            onChange={(v) => handleSave({ docEngine: v })}
          />
          <EngineSelector
            title="实时语音识别"
            engines={ENGINES.asr}
            value={config.asrEngine}
            onChange={(v) => handleSave({ asrEngine: v })}
          />
          <EngineSelector
            title="文件转写"
            engines={ENGINES.transcribe}
            value={config.transcribeEngine}
            onChange={(v) => handleSave({ transcribeEngine: v })}
          />
        </div>

        {/* 引擎状态列表 */}
        {testResult?.ok && (
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 12 }}>
              📊 PC 端引擎状态
            </div>
            {loadingEngines ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
                加载中...
              </div>
            ) : engines?.engines ? (
              engines.engines.map((engine, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: idx < engines.engines.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500 }}>
                      {engine.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {engine.capabilities?.slice(0, 3).join(' · ') || ''}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 12,
                    background: engine.status === 'running'
                      ? 'var(--color-success-light)'
                      : 'var(--color-bg-secondary)',
                    color: engine.status === 'running'
                      ? 'var(--color-success)'
                      : 'var(--color-text-muted)',
                  }}>
                    {engine.status === 'running' ? '运行中' : '已停止'}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
                无法获取引擎列表
              </div>
            )}
          </div>
        )}

        {/* 使用说明 */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>
            📖 使用说明
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.8 }}>
            1. 确保手机和电脑都已连接 Tailscale<br/>
            2. 电脑端启动 OCR 引擎管理台<br/>
            3. 在管理台「引擎配置」获取 Token<br/>
            4. 填写电脑的 Tailscale IP 和 Token<br/>
            5. 点击「测试连接」验证<br/>
            6. 在功能页面使用 PC 引擎功能
          </div>
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function EngineSelector({ title, engines, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {engines.map((engine) => (
          <button
            key={engine.id}
            onClick={() => onChange(engine.id)}
            style={{
              flex: '1 1 auto',
              minHeight: 44,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: value === engine.id ? 600 : 400,
              background: value === engine.id ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
              color: value === engine.id ? 'white' : 'var(--color-text-secondary)',
              border: '1px solid',
              borderColor: value === engine.id ? 'var(--color-primary)' : 'var(--color-border-light)',
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
              minWidth: 0,
            }}
          >
            <div>{engine.name}</div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{engine.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
