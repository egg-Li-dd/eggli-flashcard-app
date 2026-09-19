import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getAiCallStats } from '../services/aiCallLog'

const BackArrow = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
  </svg>
)

export default function SettingsDeveloper() {
  const navigate = useNavigate()
  const { state, setDeveloperMode, setAiDebugPanel } = useApp()

  const stats = getAiCallStats()

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
      {/* 顶部导航 - 统一使用 settings-sub-header 样式 */}
      <div className="settings-sub-header">
        <button className="settings-back-btn" onClick={() => navigate('/settings')}>
          <BackArrow />
        </button>
        <span className="settings-sub-title">🔧 开发者选项</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        <div className="settings-section">
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
            开启开发者选项后可使用高级调试功能，仅建议开发者和高级用户使用。
          </div>

          {/* 开发者模式总开关 */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>开发者模式</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                  总开关，开启后才可使用以下功能
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={state.developerMode}
                  onChange={(e) => setDeveloperMode(e.target.checked)}
                />
                <span className="switch-slider" />
              </label>
            </div>
          </div>

          {/* AI 调试面板开关 */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
            opacity: state.developerMode ? 1 : 0.5,
            pointerEvents: state.developerMode ? 'auto' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>
                  AI 调试面板
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                  在记录界面悬浮显示最近 AI 调用的 Prompt 和 Response，方便调试 AI 生成效果
                </div>
                {!state.developerMode && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, opacity: 0.7 }}>
                    需要先开启开发者模式
                  </div>
                )}
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={state.aiDebugPanel}
                  onChange={(e) => setAiDebugPanel(e.target.checked)}
                  disabled={!state.developerMode}
                />
                <span className="switch-slider" />
              </label>
            </div>
          </div>

          {/* AI 调用统计概览 */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
            opacity: state.developerMode ? 1 : 0.5,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 10 }}>
              AI 调用统计
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 0', minWidth: '70px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>{stats.total}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>总调用</div>
              </div>
              <div style={{ flex: '1 1 0', minWidth: '70px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-success-dark)' }}>{stats.success}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>成功</div>
              </div>
              <div style={{ flex: '1 1 0', minWidth: '70px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-danger)' }}>{stats.failed}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>失败</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10, textAlign: 'center' }}>
              详细日志请前往「AI 服务」页面查看
            </div>
          </div>

          {/* 更多功能占位 */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            opacity: state.developerMode ? 1 : 0.5,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>
              更多功能
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              后续版本持续更新中...
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0 24px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          AI 背诵卡片
        </div>
      </div>
    </div>
  )
}
