import { useState, useEffect } from 'react'
import MathText from './MathText'

export default function KnowledgePointConfirm({ knowledgePoints, rawText, onConfirm, onCancel, loading, onBack, isFirstStep, onRegenerate }) {
  const [points, setPoints] = useState(() =>
    knowledgePoints.map((text, idx) => ({ id: Math.random().toString(36).slice(2, 8), text, originalIndex: idx }))
  )
  const [showRawText, setShowRawText] = useState(false)

  useEffect(() => {
    setPoints(knowledgePoints.map((text, idx) => ({ id: Math.random().toString(36).slice(2, 8), text, originalIndex: idx })))
  }, [knowledgePoints])

  function handleTextChange(id, newText) {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, text: newText } : p)))
  }

  function handleDelete(id) {
    setPoints((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((p) => p.id !== id)
    })
  }

  function handleAdd() {
    setPoints((prev) => [...prev, { id: Math.random().toString(36).slice(2, 8), text: '', originalIndex: -1 }])
  }

  function handleSubmit() {
    const filtered = points.map((p) => ({
      text: p.text.trim(),
      originalIndex: p.originalIndex,
    })).filter((p) => p.text)
    if (filtered.length === 0) return
    onConfirm(filtered)
  }

  return (
    <div
      className="dialog-overlay knowledge-point-confirm-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        padding: '12px',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
      onClick={onCancel}
    >
      <div
        className="dialog knowledge-point-confirm-dialog"
        style={{
          maxWidth: 480,
          width: '100%',
          height: 'min(calc(100dvh - 24px), 780px)',
          maxHeight: 'none',
          margin: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '14px 16px 0',
          boxSizing: 'border-box',
          borderRadius: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--color-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10,9 9,9 8,9" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
              确认原始知识点
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
              共 {points.length} 条，可编辑、删除或新增
            </p>
          </div>
        </div>

        {/* 公式提示 */}
        <div style={{
          fontSize: 11,
          color: 'var(--color-text-muted, #999)',
          padding: '6px 10px',
          marginBottom: 8,
          backgroundColor: 'var(--color-bg-secondary, #fafafa)',
          borderRadius: 6,
          lineHeight: 1.5,
        }}>
          💡 公式请在两边加 <code>$</code>，如 <code>$E=mc^2$</code>
        </div>

        {/* Raw text reference */}
        {rawText && (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowRawText(!showRawText); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: showRawText ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {showRawText ? '收起原始输入' : '查看原始输入文本（供对比参考）'}
            </button>
            {showRawText && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 120,
                  overflow: 'auto',
                }}
              >
                {rawText}
              </div>
            )}
          </div>
        )}

        {/* Scrollable list */}
        <div
          className="knowledge-point-confirm-list"
          style={{
            flex: '1 1 0',
            minHeight: 0,
            height: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: 4,
            paddingBottom: 12,
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {points.map((item, index) => (
              <div key={item.id}>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: 10,
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 6,
                  }}
                >
                  {index + 1}
                </span>
                <textarea
                  value={item.text}
                  onChange={(e) => handleTextChange(item.id, e.target.value)}
                  rows={4}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: '110px',
                    padding: '10px 12px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--color-text)',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={points.length <= 1}
                  title="删除此知识点"
                  style={{
                    flexShrink: 0,
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--color-danger-light)',
                    color: 'var(--color-danger)',
                    fontSize: 18,
                    cursor: points.length <= 1 ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: points.length <= 1 ? 0.3 : 1,
                    marginTop: 6,
                    touchAction: 'manipulation',
                  }}
                >
                  ×
                </button>
              </div>
              {/* 公式渲染预览区 */}
              {item.text && item.text.trim() && (
                <div style={{
                  marginLeft: 32,
                  marginBottom: 8,
                  padding: '8px 10px',
                  background: 'var(--color-bg)',
                  borderRadius: 8,
                  border: '1px dashed var(--color-border)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--color-text)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    渲染预览（含公式）
                  </div>
                  <MathText>{item.text}</MathText>
                </div>
              )}
              </div>
            ))}
          </div>

          {/* Add button */}
          <button
            onClick={handleAdd}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '10px 0',
              border: '2px dashed var(--color-border)',
              borderRadius: 10,
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              touchAction: 'manipulation',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加知识点
          </button>
        </div>

        {/* Actions */}
        <div
          className="dialog-actions knowledge-point-confirm-actions"
          style={{
            position: 'sticky',
            bottom: 0,
            flexShrink: 0,
            margin: '8px -16px 0',
            padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))',
            background: 'var(--color-surface)',
            borderTop: '1px solid var(--color-border-light)',
            boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.04)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onBack && onBack(); }}
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 42, fontSize: '13px', borderRadius: '10px' }}
            disabled={isFirstStep || loading}
            title={isFirstStep ? '已是第一步' : '返回上一步'}
          >
            ← 上一步
          </button>
          {onRegenerate && (
            <button
              onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
              className="btn btn-ghost btn-sm"
              style={{ minHeight: 42, fontSize: '13px', borderRadius: '10px' }}
              disabled={loading}
              title="重新生成知识点"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              重新生成
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 42, fontSize: '13px', borderRadius: '10px' }}
            disabled={loading}
          >
            取消
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
            className="btn btn-primary btn-sm"
            style={{ minHeight: 42, fontSize: '13px', borderRadius: '10px', fontWeight: 600 }}
            disabled={loading || points.every((p) => !p.text.trim())}
          >
            {loading ? '生成中...' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
