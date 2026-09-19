import { useState } from 'react'

export default function ConfirmDialog({ visible, title, message, confirmText = '删除', onConfirm, onCancel }) {
  const [closing, setClosing] = useState(false)
  const [loading, setLoading] = useState(false)   // D-11：增加 loading 态防止重复点击

  // 当 visible 从 true 变为 false 时，外部控制
  // 我们在此组件内部维护 closing 状态
  if (!visible) return null

  const handleClose = (callback) => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      callback && callback()
    }, 220)
  }

  // D-11：异步确认，期间禁用按钮并显示 loading 文案
  const handleConfirmClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (closing || loading) return
    setLoading(true)
    Promise.resolve(onConfirm && onConfirm())
      .finally(() => {
        setLoading(false)
      })
  }

  return (
    <div
      className={'dialog-overlay' + (closing ? ' closing' : '')}
      onClick={(e) => {
        e.preventDefault()
        if (closing || loading) return
        handleClose(onCancel)
      }}
    >
      <div
        className={'dialog' + (closing ? ' closing' : '')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-icon">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="dialog-title">{title}</p>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (closing || loading) return
              handleClose(onCancel)
            }}
            className="btn btn-secondary btn-sm"
            disabled={loading}
          >取消</button>
          <button
            onClick={handleConfirmClick}
            className="btn btn-danger btn-sm"
            disabled={loading}
          >{loading ? '处理中...' : confirmText}</button>
        </div>
      </div>
    </div>
  )
}
