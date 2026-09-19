import { useState, useEffect } from 'react'
import { getPendingDraftsByCategory, deleteDraft, getDraftsFromKnowledgeTree, deleteKnowledgeTreeNode } from '../services/db'
import { generateCardsFromDrafts } from '../services/draftService'

/**
 * Category 页面顶部草稿提醒条
 * 显示该分类下待生成的草稿数，提供「生成」和「查看」按钮
 */
export default function FloatingDraftBanner({
  categoryId,
  aiConfig,
  onGenerated,
  onToast,
}) {
  const [drafts, setDrafts] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const loadDrafts = async () => {
    if (!categoryId) return
    try {
      const ktDrafts = await getDraftsFromKnowledgeTree(categoryId)
      if (ktDrafts.length > 0) {
        setDrafts(ktDrafts.map(d => ({
          ...d,
          content: d.content || d.front || '',
        })))
        return
      }
      const list = await getPendingDraftsByCategory(categoryId)
      setDrafts(list)
    } catch (e) {
      console.warn('[DraftBanner] load failed:', e)
    }
  }

  useEffect(() => {
    loadDrafts()
  }, [categoryId])

  if (drafts.length === 0) return null

  const handleGenerate = async () => {
    setGenerating(true)
    setProgress({ current: 0, total: drafts.length })
    try {
      const result = await generateCardsFromDrafts(
        drafts.map(d => d.id),
        aiConfig,
        (current, total) => setProgress({ current, total }),
      )
      onToast?.(`生成完成：成功 ${result.success} 条，失败 ${result.failed} 条`, result.failed > 0 ? 'warn' : 'success')
      onGenerated?.()
      loadDrafts()
    } catch (e) {
      onToast?.('批量生成失败：' + e.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('删除这条草稿？')) return
    try {
      await deleteKnowledgeTreeNode(id)
    } catch (_) {
      await deleteDraft(id)
    }
    loadDrafts()
  }

  return (
    <div className="floating-draft-banner">
      <div className="floating-draft-banner-header">
        <span className="floating-draft-banner-text">
          📝 该分类下有 <strong>{drafts.length}</strong> 条草稿待生成
        </span>
        <div className="floating-draft-banner-actions">
          <button
            className="btn btn-xs btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? `生成中 ${progress.current}/${progress.total}` : '批量生成'}
          </button>
          <button
            className="btn btn-xs btn-outline"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? '收起' : '查看'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="floating-draft-banner-list">
          {drafts.map(d => (
            <div key={d.id} className="floating-draft-banner-item">
              <div className="floating-draft-banner-item-content" title={d.content}>
                {d.content.length > 60 ? d.content.slice(0, 60) + '...' : d.content}
              </div>
              <button
                className="floating-draft-banner-item-delete"
                onClick={() => handleDelete(d.id)}
                aria-label="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
