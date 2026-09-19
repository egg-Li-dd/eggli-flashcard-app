import { useState, useEffect, useRef } from 'react'

/**
 * 分类目的编辑弹窗
 * 用于设置分类的学习目的（如"考研"、"计算机考研"等）
 */
export default function PurposeModal({ visible, categoryName, initialPurpose, onConfirm, onCancel }) {
  const [purpose, setPurpose] = useState(initialPurpose || '')
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
      setPurpose(initialPurpose || '')
      setTimeout(() => {
        if (mountedRef.current) inputRef.current?.focus()
      }, 100)
    }
  }, [visible, initialPurpose])

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
    onConfirm(purpose.trim())
  }

  const handleOverlayClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onCancel()
  }

  const presets = ['考研', '考公', '期末考试', '职业技能', '兴趣爱好', '其他']

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 360 }}
      >
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', marginBottom: 8, textAlign: 'center' }}>
          设置学习目的
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 16, textAlign: 'center' }}>
          为「{categoryName}」设置学习目的，AI生成卡片时会作为参考
        </p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="例如：考研、计算机408、期末复习"
            maxLength={50}
            className="input"
            style={{ marginBottom: 12 }}
          />
          
          {/* 快捷预设标签 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPurpose(preset)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  border: purpose === preset ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  backgroundColor: purpose === preset ? 'var(--color-primary-light)' : 'transparent',
                  color: purpose === preset ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          
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
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
