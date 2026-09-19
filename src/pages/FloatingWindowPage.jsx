import { useState, useEffect, useCallback } from 'react'
import { saveDraft } from '../services/draftService'
import { getRecentDrafts, deleteDraft } from '../services/db'
import FloatingTargetSelector from '../components/FloatingTargetSelector'
import FloatingQuickRecall from '../components/FloatingQuickRecall'
import FloatingTemplates from '../components/FloatingTemplates'

/**
 * 系统悬浮窗 WebView 加载的独立页面（轻量级，无路由依赖）
 * 通过 URL 参数访问：/floating-window
 * 自适应透明背景（在 WebView 中渲染）
 */
export default function FloatingWindowPage() {
  const [inputValue, setInputValue] = useState('')
  const [currentTarget, setCurrentTarget] = useState(null)
  const [showTargetSelector, setShowTargetSelector] = useState(false)
  const [recentTargets, setRecentTargets] = useState([])
  const [recallRefreshKey, setRecallRefreshKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // 从 localStorage 加载归属
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('app_current_target') || 'null')
      setCurrentTarget(stored)
      const recent = JSON.parse(localStorage.getItem('app_recent_targets') || '[]')
      setRecentTargets(recent.slice(0, 3))
    } catch (_) {}
  }, [])

  // showToast 必须在 handleSubmit 之前定义（修正计划原文的顺序问题）
  const showToast = useCallback((msg) => {
    const toast = document.createElement('div')
    toast.style.cssText = `
      position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: white; padding: 6px 12px;
      border-radius: 6px; font-size: 12px; z-index: 9999;
    `
    toast.textContent = msg
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 1500)
  }, [])

  const handleSelectTarget = useCallback((target) => {
    setCurrentTarget(target)
    setShowTargetSelector(false)
    localStorage.setItem('app_current_target', JSON.stringify(target))
    setRecentTargets(prev => {
      const filtered = prev.filter(t =>
        !(t.categoryId === target.categoryId &&
          (t.chapterId || null) === (target.chapterId || null) &&
          (t.unitId || null) === (target.unitId || null))
      )
      const next = [target, ...filtered].slice(0, 3)
      localStorage.setItem('app_recent_targets', JSON.stringify(next))
      return next
    })
  }, [])

  const handleApplyTemplate = useCallback((content) => {
    setInputValue(prev => prev ? prev + '\n' + content : content)
  }, [])

  const handleSubmit = useCallback(async () => {
    const content = inputValue.trim()
    if (!content) return
    if (!currentTarget?.categoryId) {
      setShowTargetSelector(true)
      return
    }
    setSubmitting(true)
    try {
      await saveDraft({
        content,
        categoryId: currentTarget.categoryId,
        chapterId: currentTarget.chapterId,
        unitId: currentTarget.unitId,
        source: 'system-floating',
      })
      setInputValue('')
      setRecallRefreshKey(k => k + 1)
      // 系统悬浮窗场景不收起（保持快速录入状态）
      if (navigator.vibrate) navigator.vibrate(50)
      showToast('已保存草稿')
    } catch (e) {
      showToast('保存失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }, [inputValue, currentTarget, showToast])

  const targetText = currentTarget
    ? `📍 ${currentTarget.categoryName}${currentTarget.chapterName ? ' ▸ ' + currentTarget.chapterName : ''}${currentTarget.unitName ? ' ▸ ' + currentTarget.unitName : ''}`
    : '📍 点击选择归属'

  return (
    <div className="floating-window-page">
      {/* 控制栏 */}
      <div className="floating-window-header">
        <span className="floating-window-title">快速录入</span>
        <button
          className="floating-window-close"
          onClick={() => {
            if (window.Capacitor) {
              import('../services/systemFloatingWindow').then(m => m.hideSystemFloating())
            }
          }}
        >
          ×
        </button>
      </div>

      {/* 归属条 */}
      <div
        className={'floating-target-bar' + (!currentTarget ? ' floating-target-bar-empty' : '')}
        onClick={() => setShowTargetSelector(true)}
      >
        <span className="floating-target-bar-text">{targetText}</span>
        <span className="floating-target-bar-arrow">▼</span>
      </div>

      {showTargetSelector && (
        <FloatingTargetSelector
          currentTarget={currentTarget}
          recentTargets={recentTargets}
          onSelect={handleSelectTarget}
          onClose={() => setShowTargetSelector(false)}
        />
      )}

      {/* 输入区（轻量 textarea，不复用 InputBar 避免依赖过多） */}
      <textarea
        className="floating-window-textarea"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        placeholder="输入知识点..."
        rows={5}
        autoFocus
      />

      <button
        className="floating-window-submit-btn"
        onClick={handleSubmit}
        disabled={submitting || !inputValue.trim()}
      >
        {submitting ? '保存中...' : '↑ 保存草稿'}
      </button>

      <FloatingQuickRecall
        refreshKey={recallRefreshKey}
        onRecall={(text) => setInputValue(text)}
      />

      <FloatingTemplates onApply={handleApplyTemplate} />
    </div>
  )
}
