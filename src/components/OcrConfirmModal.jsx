/**
 * OCR 确认对话框 — 替代 window.prompt
 * 在 Android WebView 中 window.prompt 无法正常显示预填文字，
 * 此组件使用 React 模态框确认识别结果，支持编辑后生成卡片。
 */
import { useState, useEffect, useRef } from 'react'

export default function OcrConfirmModal({
  open,
  text,
  loading,
  onConfirm,
  onCancel,
}) {
  const [editText, setEditText] = useState('')
  const textareaRef = useRef(null)

  // 每次打开时同步识别结果到编辑框
  useEffect(() => {
    if (open) {
      setEditText(text || '')
      // 下一个 tick 聚焦并全选，方便用户直接开始编辑
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.select()
        }
      })
    }
  }, [open, text])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: '16px',
      }}
      onClick={(e) => {
        // 点击遮罩层不关闭，防止误操作丢文字
        if (e.target === e.currentTarget) return
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg-card, #fff)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        {/* 头部 */}
        <div
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid var(--color-border-light, #eee)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text, #333)',
          }}
        >
          📝 确认识别结果
        </div>

        {/* 编辑区 */}
        <div style={{ padding: '12px 20px', flex: '1 1 auto', minHeight: 0 }}>
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={12}
            style={{
              width: '100%',
              minHeight: 280,
              padding: '12px 14px',
              fontSize: 14,
              lineHeight: 1.6,
              borderRadius: 10,
              border: '1px solid var(--color-border, #ddd)',
              backgroundColor: 'var(--color-bg-input, #f9f9f9)',
              color: 'var(--color-text, #333)',
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none',
            }}
            placeholder="识别结果将显示在这里…"
          />
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-text-muted, #999)',
              marginTop: 6,
              textAlign: 'right',
            }}
          >
            共 {editText.length} 字
          </div>
        </div>

        {/* 底部按钮 */}
        <div
          style={{
            padding: '12px 20px 16px',
            borderTop: '1px solid var(--color-border-light, #eee)',
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            onClick={() => onCancel?.(editText)}
            disabled={loading}
            style={{
              flex: 1,
              minHeight: 44,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 10,
              border: '1px solid var(--color-border, #ddd)',
              backgroundColor: 'var(--color-surface, #f5f5f5)',
              color: 'var(--color-text-secondary, #666)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            ✏️ 写入输入框
          </button>
          <button
            onClick={() => {
              const trimmed = editText.trim()
              if (!trimmed) return
              onConfirm?.(trimmed)
            }}
            disabled={loading || !editText.trim()}
            style={{
              flex: 1,
              minHeight: 44,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              border: 'none',
              backgroundColor: loading
                ? 'var(--color-primary-light, #dbeafe)'
                : 'var(--color-primary, #3b82f6)',
              color: loading
                ? 'var(--color-primary-dark, #1d4ed8)'
                : '#fff',
              cursor: loading || !editText.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !editText.trim() ? 0.6 : 1,
            }}
          >
            {loading ? '⏳ 生成中…' : '🚀 生成卡片'}
          </button>
        </div>
      </div>
    </div>
  )
}
