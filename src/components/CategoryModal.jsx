import { useState, useEffect, useRef } from 'react'

export default function CategoryModal({ visible, title, initialValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(initialValue || '')
  const inputRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (visible) {
      setValue(initialValue || '')
      setTimeout(() => {
        if (mountedRef.current) inputRef.current?.focus()
      }, 100)
    }
  }, [visible, initialValue])

  useEffect(() => {
    return () => {
      if (visible && mountedRef.current && typeof onCancel === 'function') {
        onCancel()
      }
    }
  }, [visible, onCancel])

  if (!visible) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  const handleOverlayClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onCancel()
  }

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', marginBottom: 16, textAlign: 'center' }}>{title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="输入分类名称"
            maxLength={20}
            className="input"
            style={{ marginBottom: 16 }}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              确定
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
