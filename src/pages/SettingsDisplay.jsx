import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const FONT_OPTIONS = [
  { value: 'small', label: '小', description: '紧凑显示' },
  { value: 'normal', label: '标准', description: '默认大小' },
  { value: 'large', label: '大', description: '更大字号' },
]

const INPUT_BAR_MODES = [
  { value: 'fixed', label: '底部' },
  { value: 'floating', label: '应用内' },
  { value: 'system', label: '系统' },
]

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

export default function SettingsDisplay() {
  const {
    state,
    setFontSize,
    setEyeProtection,
    setInputBarMode,
    setTheme,
    showToast,
  } = useApp()
  const navigate = useNavigate()

  const handleFontSizeChange = (size) => {
    setFontSize(size)
  }

  const toggleEyeProtection = () => {
    setEyeProtection(!state.eyeProtection)
  }

  // 输入栏模式切换：fixed（底部固定）/ floating（应用内悬浮）/ system（系统悬浮窗，其他 App 可见）
  const handleInputBarModeChange = async (mode) => {
    if (mode === state.inputBarMode) return
    try {
      if (mode === 'system') {
        let isSystemFloatingSupported, canDrawOverlays, requestOverlayPermission, showSystemFloating
        try {
          const mod = await import('../services/systemFloatingWindow')
          isSystemFloatingSupported = mod.isSystemFloatingSupported
          canDrawOverlays = mod.canDrawOverlays
          requestOverlayPermission = mod.requestOverlayPermission
          showSystemFloating = mod.showSystemFloating
        } catch (e) {
          console.error('[SettingsDisplay] 加载系统悬浮窗模块失败:', e)
          showToast('系统悬浮窗模块加载失败，已切换为应用内悬浮', 'warn')
          setInputBarMode('floating')
          return
        }
        const supported = await isSystemFloatingSupported()
        if (!supported) {
          showToast('系统悬浮窗仅在 Android APP 中可用，已为您切换为应用内悬浮', 'warn')
          setInputBarMode('floating')
          return
        }
        let granted = false
        try {
          granted = await canDrawOverlays()
        } catch (e) {
          console.error('[SettingsDisplay] 检查悬浮窗权限失败:', e)
        }
        if (!granted) {
          // 先显示提示，再打开系统权限设置（避免 toast 被 Activity 切换覆盖）
          showToast('即将打开系统设置，请授权"显示在其他应用上层"', 'info')
          // 延迟 500ms 确保 toast 先渲染出来
          await new Promise(r => setTimeout(r, 500))
          let opened = false
          try {
            opened = await requestOverlayPermission()
          } catch (e) {
            console.error('[SettingsDisplay] 打开权限设置失败:', e)
          }
          if (!opened) {
            showToast('无法打开系统权限设置，已切换为应用内悬浮', 'warn')
            setInputBarMode('floating')
          }
          // opened=true 时：用户在系统设置中，回来后需再次点击"系统"按钮
          // 此时 canDrawOverlays 会重新检查权限
          return
        }
        // 权限已通过，启动系统悬浮窗服务
        try {
          await showSystemFloating()
          setInputBarMode('system')
          showToast('已切换为系统悬浮窗', 'success')
        } catch (e) {
          console.error('[SettingsDisplay] 启动悬浮窗服务失败:', e)
          showToast('启动悬浮窗失败：' + (e?.message || '未知错误'), 'error')
        }
      } else {
        // 切换到其他模式时，停止系统悬浮窗
        if (state.inputBarMode === 'system') {
          const { hideSystemFloating } = await import('../services/systemFloatingWindow')
          await hideSystemFloating()
        }
        setInputBarMode(mode)
        showToast('输入栏模式已切换为：' + (mode === 'floating' ? '应用内悬浮' : '底部固定栏'))
      }
    } catch (e) {
      console.error('[SettingsDisplay] 切换输入栏模式失败:', e)
      showToast('切换失败：' + (e?.message || '未知错误'), 'error')
    }
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
        <span className="settings-sub-title">显示与偏好</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        <div className="settings-section">
          <div className="settings-block">
            <div className="settings-mb-10" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>字体大小</div>
            <div className="settings-segmented">
              {FONT_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => handleFontSizeChange(opt.value)}
                  className={'settings-segmented-item' + (state.fontSize === opt.value ? ' active' : '')}
                  style={{ fontSize: opt.value === 'small' ? 'var(--text-sm)' : opt.value === 'large' ? 'var(--text-lg)' : 'var(--text-base)' }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {/* O-6：字体大小实时预览 */}
            <div style={{
              marginTop: '12px', padding: '14px 16px',
              backgroundColor: 'var(--color-bg-offset)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-light)',
            }}>
              <div style={{
                fontSize: state.fontSize === 'small' ? 'var(--text-sm)' : state.fontSize === 'large' ? 'var(--text-lg)' : 'var(--text-base)',
                color: 'var(--color-text)', lineHeight: 1.6, fontWeight: 500,
              }}>
                永远相信美好的事情即将发生
              </div>
              <div style={{
                fontSize: state.fontSize === 'small' ? '12px' : state.fontSize === 'large' ? '15px' : '13px',
                color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.5,
              }}>
                这是一段示例文字，用于预览当前字号在卡片中的显示效果。
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>护眼模式</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>切换暖色背景，减少眼睛疲劳</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={state.eyeProtection} onChange={toggleEyeProtection} />
              <span className="switch-slider" />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>主题模式</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>跟随系统、白天或暗夜</div>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--color-bg-offset)', borderRadius: 8 }}>
              {[
                { value: 'auto', label: '自动' },
                { value: 'light', label: '白天' },
                { value: 'dark', label: '暗夜' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setTheme(opt.value); showToast('主题已切换为：' + opt.label) }}
                  style={{
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    minHeight: 32,
                    cursor: 'pointer',
                    background: state.theme === opt.value ? 'var(--color-primary)' : 'transparent',
                    color: state.theme === opt.value ? '#fff' : 'var(--color-text-secondary)',
                    boxShadow: state.theme === opt.value ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row settings-row-clickable card-interactive" onClick={() => navigate('/settings/display/background')}>
            <span className="settings-row-label">背景与风格</span>
            <span className="settings-row-value">{state.activeStyleScheme?.startsWith('preset-') ? '预设方案' : state.activeStyleScheme?.startsWith('scheme-') ? '我的方案' : '默认方案'}</span>
            <Arrow />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>输入栏模式</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {state.inputBarMode === 'system' ? '系统悬浮（其他 App 可见）'
                  : state.inputBarMode === 'floating' ? '应用内悬浮窗'
                  : '底部固定栏'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--color-bg-offset)', borderRadius: 8 }}>
              {INPUT_BAR_MODES.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleInputBarModeChange(opt.value)}
                  style={{
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    minHeight: 32,
                    cursor: 'pointer',
                    background: state.inputBarMode === opt.value ? 'var(--color-primary)' : 'transparent',
                    color: state.inputBarMode === opt.value ? '#fff' : 'var(--color-text-secondary)',
                    boxShadow: state.inputBarMode === opt.value ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.2s',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {opt.label}
                </button>
              ))}
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