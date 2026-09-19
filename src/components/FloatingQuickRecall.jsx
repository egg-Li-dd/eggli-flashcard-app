import { useState, useEffect } from 'react'
import { getRecentDrafts, deleteDraft } from '../services/db'

/**
 * 快速回忆条：显示最近3条草稿
 * 点击 → 复用内容到输入框
 * 长按 → 删除
 */
export default function FloatingQuickRecall({ onRecall, refreshKey }) {
  const [drafts, setDrafts] = useState([])
  const [longPressTimer, setLongPressTimer] = useState(null)

  const loadDrafts = async () => {
    try {
      const list = await getRecentDrafts(3)
      setDrafts(list)
    } catch (e) {
      console.warn('[QuickRecall] load failed:', e)
    }
  }

  useEffect(() => {
    loadDrafts()
  }, [refreshKey])

  if (drafts.length === 0) return null

  const handleTouchStart = (draft) => {
    const timer = setTimeout(() => {
      if (confirm(`删除这条草稿？\n\n${draft.content.slice(0, 40)}...`)) {
        deleteDraft(draft.id).then(loadDrafts)
      }
    }, 600)
    setLongPressTimer(timer)
  }

  const handleTouchEnd = (draft) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  const handleClick = (draft) => {
    onRecall(draft.content)
  }

  return (
    <div className="floating-recall">
      <div className="floating-recall-label">📝 最近：</div>
      <div className="floating-recall-list">
        {drafts.map(d => (
          <div
            key={d.id}
            className="floating-recall-item"
            onClick={() => handleClick(d)}
            onTouchStart={() => handleTouchStart(d)}
            onTouchEnd={() => handleTouchEnd(d)}
            title={d.content}
          >
            {d.content.length > 18 ? d.content.slice(0, 18) + '...' : d.content}
          </div>
        ))}
      </div>
    </div>
  )
}
