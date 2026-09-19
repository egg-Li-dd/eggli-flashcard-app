import { useState, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { saveDraft } from '../services/draftService'
import InputBar from './InputBar'

export default function FloatingInputBar() {
  const { state, refreshDraftCount } = useApp()
  const [open, setOpen] = useState(false)
  const [posY, setPosY] = useState(50)
  const [inputValue, setInputValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const dragRef = useRef(null)
  const dragStartY = useRef(0)
  const dragStartPosY = useRef(50)
  const dragging = useRef(false)

  // 拖拽逻辑
  const handlePointerDown = useCallback((e) => {
    if (!open) return
    dragging.current = true
    dragStartY.current = e.clientY
    dragStartPosY.current = posY
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [open, posY])

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return
    const dy = e.clientY - dragStartY.current
    const vh = window.innerHeight
    const newPercent = Math.max(10, Math.min(90, dragStartPosY.current + (dy / vh) * 100))
    setPosY(newPercent)
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const toggleOpen = useCallback((e) => {
    e?.stopPropagation()
    setOpen(o => !o)
  }, [])

  // 提交草稿
  const handleSubmit = useCallback(async (text) => {
    const content = (text || '').trim()
    if (!content) return

    setSubmitting(true)
    try {
      await saveDraft({
        content,
        categoryId: null,
        source: 'floating',
      })
      setInputValue('')
      refreshDraftCount()
      setOpen(false)
      if (navigator.vibrate) navigator.vibrate(50)
    } catch (e) {
      alert('保存失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }, [refreshDraftCount])

  return (
    <>
      {open && <div className="floating-inputbar-backdrop" onClick={() => setOpen(false)} />}
      <div
        className={'floating-inputbar-wrapper' + (open ? ' floating-inputbar-wrapper-open' : '')}
        style={{ top: posY + '%' }}
      >
        {open ? (
          <div className="floating-inputbar-panel">
            {/* 模块1：控制栏 */}
            <div
              className="floating-inputbar-handle"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <span className="floating-inputbar-handle-bar" />
              <span className="floating-inputbar-handle-hint">⠿</span>
            </div>
            <button className="floating-inputbar-close-btn" onClick={toggleOpen} aria-label="收起">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              </svg>
            </button>

            <div className="floating-inputbar-body">
              {/* 输入栏（复用 InputBar） */}
              <div className="floating-inputbar-inputbar-wrapper">
                <InputBar
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  disabled={submitting}
                  apiKey={state.apiKey}
                  model={state.model}
                  onToast={() => {}}
                />
              </div>
            </div>
          </div>
        ) : (
          <button className="floating-inputbar-tab" onClick={toggleOpen} aria-label="展开输入栏">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 7l-5 5 5 5M17 7l-5 5 5 5" />
            </svg>
          </button>
        )}
      </div>
    </>
  )
}
