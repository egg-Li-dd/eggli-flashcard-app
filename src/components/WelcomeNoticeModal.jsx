import { useEffect } from 'react'

export default function WelcomeNoticeModal({ visible, onClose, onGoToSettings }) {
  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  if (!visible) return null

  const handleOverlayClick = (e) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 320,
          textAlign: 'center',
          padding: 28,
        }}
      >
        <div
          style={{
            fontSize: 40,
            marginBottom: 16,
          }}
        >
          🤖
        </div>
        <h3
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-text)',
            marginBottom: 12,
          }}
        >
          欢迎使用 egg李
        </h3>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            marginBottom: 24,
            textAlign: 'left',
          }}
        >
          本应用的卡片生成、知识点识别、智能整理等核心功能
          <strong style={{ color: 'var(--color-primary)' }}>主要依靠 AI 服务</strong>
          来驱动。
          <br /><br />
          为了获得完整体验，请前往设置页面配置您的 AI 服务。
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ flex: 1 }}
          >
            稍后再说
          </button>
          <button
            type="button"
            onClick={onGoToSettings}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            去配置
          </button>
        </div>
      </div>
    </div>
  )
}
