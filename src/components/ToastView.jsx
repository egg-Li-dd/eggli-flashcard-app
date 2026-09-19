import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

export default function ToastView() {
  const { state, hideToast } = useApp()
  const toast = state?.toast
  const [progress, setProgress] = useState(100)   // D-12：进度条百分比

  // D-12：根据 toast 持续时间显示倒计时进度条
  useEffect(() => {
    if (!toast) {
      setProgress(100)
      return
    }
    const duration = toast.duration || 3000
    const startTime = Date.now()
    setProgress(100)
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(pct)
      if (pct <= 0) clearInterval(timer)
    }, 50)
    return () => clearInterval(timer)
  }, [toast])

  if (!toast) return null

  const type = toast.type || 'success'
  const actions = toast.actions && toast.actions.length ? toast.actions : null

  return (
    <div
      className={
        'toast-container animate-toast-in toast-' +
        (type === 'error' ? 'error' : type === 'info' ? 'info' : (type === 'warn' || type === 'warning') ? 'warn' : 'success')
      }
      style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', overflow: 'hidden' }}
      onClick={() => {
        // 点击空白处可关闭
        if (!actions) hideToast && hideToast()
      }}
    >
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'left' }}>{toast.message}</span>
      {actions && (
        <div style={{ display: 'flex', flexShrink: 0, gap: 8 }}>
          {actions.map((a, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation()
                try {
                  if (typeof a.onClick === 'function') a.onClick()
                } finally {
                  hideToast && hideToast()
                }
              }}
              style={{
                padding: '6px 12px',
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255,255,255,0.45)',
                backgroundColor: 'rgba(255,255,255,0.12)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* D-12：底部进度条，提示用户 Toast 即将消失 */}
      {!actions && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: '2px',
            backgroundColor: 'rgba(255,255,255,0.6)',
            width: `${progress}%`,
            transition: 'width 50ms linear',
          }}
        />
      )}
    </div>
  )
}
