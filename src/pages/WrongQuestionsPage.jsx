import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getAllWrongAnswers, deleteWrongAnswer, clearAllWrongAnswers, getCategories, getUnitsByCategory, getChaptersByCategory, getCardsByIds } from '../services/db'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatTime } from '../utils/helpers'

// 错题本页面：支持按分类 → 章节 → 单元三层分组
export default function WrongQuestionsPage() {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const [wrongList, setWrongList] = useState([])
  const [categories, setCategories] = useState([])
  const [unitsMap, setUnitsMap] = useState({}) // { categoryId: [unit] }
  const [chaptersMap, setChaptersMap] = useState({}) // { categoryId: [chapter] }
  const [cardDetails, setCardDetails] = useState({}) // { cardId: card }
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showClearAll, setShowClearAll] = useState(false)
  // 展开状态：{ [categoryId]: true/false }
  const [expandedCategories, setExpandedCategories] = useState({})
  // 展开的章节：{ [chapterId]: true/false }
  const [expandedChapters, setExpandedChapters] = useState({})
  // 展开的单元：{ [unitId]: true/false }
  const [expandedUnits, setExpandedUnits] = useState({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [wrongs, cats] = await Promise.all([
        getAllWrongAnswers(),
        getCategories(),
      ])
      setWrongList(wrongs)
      setCategories(cats)

      // 获取所有单元（按分类索引）
      const unitsPromises = cats.map(cat => getUnitsByCategory(cat.id))
      const unitsResults = await Promise.all(unitsPromises)
      const unitsByCategory = {}
      cats.forEach((cat, idx) => {
        unitsByCategory[cat.id] = unitsResults[idx] || []
      })
      setUnitsMap(unitsByCategory)

      // 获取所有章节（按分类索引）
      const chaptersPromises = cats.map(cat => getChaptersByCategory(cat.id))
      const chaptersResults = await Promise.all(chaptersPromises)
      const chaptersByCategory = {}
      cats.forEach((cat, idx) => {
        chaptersByCategory[cat.id] = chaptersResults[idx] || []
      })
      setChaptersMap(chaptersByCategory)

      // 批量查询卡片详情
      const cardIds = wrongs.map(w => w.cardId).filter(Boolean)
      if (cardIds.length > 0) {
        const details = await getCardsByIds(cardIds)
        setCardDetails(details)
      }
    } catch (e) {
      console.warn('[WrongQuestions] 加载失败:', e?.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDeleteSingle = async (record) => {
    try {
      await deleteWrongAnswer(record.id)
      setWrongList(prev => prev.filter(w => w.id !== record.id))
      showToast('已删除错题记录')
    } catch (e) { showToast('删除失败', 'error') }
  }

  const handleClearAll = async () => {
    setShowClearAll(false)
    try {
      await clearAllWrongAnswers()
      setWrongList([])
      showToast('已清空所有错题')
    } catch (e) { showToast('清空失败', 'error') }
  }

  // 跳转到单元检测进行错题重做
  const handleRedoWrong = (categoryId, unitId = '', chapterId = '') => {
    if (!categoryId) {
      showToast('缺少分类信息', 'error')
      return
    }
    const catWrongs = wrongList.filter(w => {
      if (unitId) {
        return w.categoryId === categoryId && w.unitId === unitId
      }
      if (chapterId) {
        return w.categoryId === categoryId && w.chapterId === chapterId
      }
      return w.categoryId === categoryId
    })
    if (catWrongs.length === 0) {
      showToast('该范围下没有错题', 'info')
      return
    }
    const params = new URLSearchParams({
      mode: 'wrong',
      categoryId,
      ...(unitId ? { unitId } : {}),
      ...(chapterId && !unitId ? { chapterId } : {}),
    })
    navigate(`/test/unit?${params.toString()}`)
  }

  // 按 categoryId → chapterId → unitId 三层分组
  // 返回：{ [categoryId]: { id, name, chapters: { [chapterId]: { id, name, units: { [unitId]: { name, wrongs: [] } } } } } }
  const buildTree = () => {
    const catMap = {}
    for (const w of wrongList) {
      const catId = w.categoryId || ''
      const chapterId = w.chapterId || ''
      const unitId = w.unitId || ''
      if (!catMap[catId]) {
        const cat = categories.find(c => c.id === catId)
        catMap[catId] = {
          id: catId,
          name: cat?.name || '未命名分类',
          chapters: {},
        }
      }
      const catNode = catMap[catId]
      // 章节分组
      const chId = chapterId || '_ungrouped'
      if (!catNode.chapters[chId]) {
        let chapterName = '未分类'
        if (chapterId) {
          const chaptersOfCat = chaptersMap[catId] || []
          const ch = chaptersOfCat.find(x => x.id === chapterId)
          if (ch) chapterName = ch.name
          else chapterName = '未知章节'
        }
        catNode.chapters[chId] = {
          id: chapterId || '',
          name: chapterName,
          units: {},
        }
      }
      const chNode = catNode.chapters[chId]
      if (!chNode.units[unitId]) {
        let unitName = '未归入单元'
        if (unitId) {
          const unitsOfCat = unitsMap[catId] || []
          const u = unitsOfCat.find(x => x.id === unitId)
          if (u) unitName = u.name
          else unitName = '未知单元'
        }
        chNode.units[unitId] = {
          id: unitId,
          name: unitName,
          wrongs: [],
        }
      }
      chNode.units[unitId].wrongs.push(w)
    }
    // 计算每个分类每个章节的总错题数
    const tree = Object.values(catMap).map(cat => {
      const chapters = Object.values(cat.chapters).map(ch => {
        const total = Object.values(ch.units).reduce((sum, u) => sum + u.wrongs.length, 0)
        return { ...ch, total }
      })
      const total = chapters.reduce((sum, ch) => sum + ch.total, 0)
      return { ...cat, chapters, total }
    })
    // 按总错题数降序
    tree.sort((a, b) => b.total - a.total)
    return tree
  }

  const tree = buildTree()
  const totalCount = tree.reduce((sum, t) => sum + t.total, 0)

  return (
    <div className="page-animate-in" style={{ height: '100vh', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="app-header">
        <div className="app-header-inner">
          <button className="settings-back-btn" onClick={() => navigate('/')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="app-title" style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>错题本</span>
          {wrongList.length > 0 && (
            <button className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)', minHeight: 32 }}
              onClick={() => setShowClearAll(true)}>清空</button>
          )}
          {wrongList.length === 0 && <span style={{ width: 48 }} />}
        </div>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-secondary)' }}>加载中...</div>
        ) : wrongList.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
            <div className="empty-state-title">暂无错题</div>
            <div className="empty-state-desc">完成检测后，错题会自动收集到这里</div>
          </div>
        ) : (
          <>
            <div className="card wrong-questions-stat-card">
              <div>
                <div className="wrong-questions-stat-value">{totalCount}</div>
                <div className="wrong-questions-stat-label">错题总数</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{tree.length}</div>
                <div className="wrong-questions-stat-label">涉及分类</div>
              </div>
            </div>

            {tree.map(cat => {
              const catExpanded = !!expandedCategories[cat.id]
              const chapterEntries = cat.chapters || []
              // 按章节名排序：主要章节在前，"未分类"在最后
              const sortedChapters = [...chapterEntries].sort((a, b) => {
                if (a.name === '未分类') return 1
                if (b.name === '未分类') return -1
                return a.name.localeCompare(b.name)
              })
              return (
                <div key={cat.id} className="card wrong-questions-category-card">
                  <button className="wrong-questions-category-header"
                    style={{ minHeight: '44px' }}
                    onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !catExpanded }))}>
                    <span className="wrong-questions-category-name">{cat.name}</span>
                    <span className="badge badge-danger" style={{ flexShrink: 0 }}>{cat.total}题</span>
                    <button className="btn btn-primary btn-sm"
                      style={{ flexShrink: 0, minHeight: 32, fontSize: 'var(--text-xs)' }}
                      onClick={(e) => { e.stopPropagation(); handleRedoWrong(cat.id) }}>错题重做</button>
                    <svg className={`wrong-questions-category-arrow ${catExpanded ? 'wrong-questions-category-arrow--expanded' : ''}`}
                      width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {catExpanded && (
                    <div style={{ borderTop: '1px solid var(--color-border)', padding: '4px 0' }}>
                      {sortedChapters.map(ch => {
                        const chExpanded = ch.id ? !!expandedChapters[ch.id] : !!expandedChapters[`_ungrouped_${cat.id}`]
                        const chExpandKey = ch.id || `_ungrouped_${cat.id}`
                        const unitEntries = Object.values(ch.units)
                        return (
                          <div key={chExpandKey} style={{ margin: '4px 0' }}>
                            {/* 章节头部 */}
                            <div style={{
                              marginLeft: '8px',
                              padding: '6px 8px',
                              background: ch.id ? 'var(--color-primary-light)' : 'var(--color-border-light)',
                              borderRadius: '6px',
                              display: 'flex', alignItems: 'center', gap: '8px',
                            }}>
                              <button
                                style={{
                                  flex: '1 1 auto', minWidth: 0, textAlign: 'left',
                                  border: 'none', background: 'transparent', cursor: 'pointer',
                                  color: 'var(--color-text)', fontSize: 'var(--text-sm)',
                                  fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
                                  minHeight: '36px',
                                }}
                                onClick={() => setExpandedChapters(prev => ({ ...prev, [chExpandKey]: !chExpanded }))}>
                                <svg width="12" height="12" viewBox="0 0 24 24"
                                  fill="none" stroke="currentColor" strokeWidth={2}
                                  style={{ transform: chExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                                <span>{ch.name}</span>
                                <span className="badge badge-danger" style={{ marginLeft: 4, flexShrink: 0, padding: '1px 6px', fontSize: '11px' }}>{ch.total}题</span>
                              </button>
                              {ch.total > 0 && ch.id && (
                                <button className="btn btn-primary btn-sm"
                                  style={{ flexShrink: 0, minHeight: 28, fontSize: '11px', padding: '3px 10px' }}
                                  onClick={() => handleRedoWrong(cat.id, '', ch.id)}>重做</button>
                              )}
                              {ch.total > 0 && !ch.id && (
                                <button className="btn btn-primary btn-sm"
                                  style={{ flexShrink: 0, minHeight: 28, fontSize: '11px', padding: '3px 10px' }}
                                  onClick={() => handleRedoWrong(cat.id)}>重做</button>
                              )}
                            </div>

                            {/* 章节展开后的单元列表 */}
                            {chExpanded && (
                              <div style={{ marginLeft: '16px', padding: '2px 0' }}>
                                {unitEntries.map(u => {
                                  const unitExpanded = !!expandedUnits[u.id]
                                  return (
                                    <div key={u.id} style={{ margin: '6px 0' }}>
                                      <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 8px',
                                        background: u.id ? 'var(--color-surface-secondary)' : 'transparent',
                                        borderRadius: '6px',
                                      }}>
                                        <button
                                          style={{
                                            flex: '1 1 auto', minWidth: 0, textAlign: 'left',
                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                            color: 'var(--color-text)', fontSize: 'var(--text-sm)',
                                            fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px',
                                            minHeight: '36px',
                                          }}
                                          onClick={() => setExpandedUnits(prev => ({ ...prev, [u.id]: !unitExpanded }))}>
                                          <svg width="10" height="10" viewBox="0 0 24 24"
                                            fill="none" stroke="currentColor" strokeWidth={2}
                                            style={{ transform: unitExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                          </svg>
                                          <span>{u.name}</span>
                                          <span className="badge badge-danger" style={{ marginLeft: 4, flexShrink: 0, padding: '1px 6px', fontSize: '11px' }}>{u.wrongs.length}题</span>
                                        </button>
                                        {u.wrongs.length > 0 && u.id && (
                                          <button className="btn btn-primary btn-sm"
                                            style={{ flexShrink: 0, minHeight: 28, fontSize: '11px', padding: '3px 10px' }}
                                            onClick={() => handleRedoWrong(cat.id, u.id)}>重做</button>
                                        )}
                                        {u.wrongs.length > 0 && !u.id && (
                                          <button className="btn btn-primary btn-sm"
                                            style={{ flexShrink: 0, minHeight: 28, fontSize: '11px', padding: '3px 10px' }}
                                            onClick={() => handleRedoWrong(cat.id, '', ch.id)}>重做</button>
                                        )}
                                      </div>

                                      {unitExpanded && (
                                        <div style={{ padding: '4px 8px 4px 16px' }}>
                                          {u.wrongs.map(w => {
                                            const card = cardDetails[w.cardId]
                                            const front = w.stem || card?.front || '（卡片已删除）'
                                            return (
                                              <div key={w.id} className="wrong-questions-item">
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                  <div className="wrong-questions-item-front">
                                                    {front}
                                                  </div>
                                                  <div className="wrong-questions-item-meta">
                                                    错误 {w.count} 次 · 最后 {w.lastWrongAt ? formatTime(w.lastWrongAt) : ''}
                                                  </div>
                                                </div>
                                                <button className="wrong-questions-item-delete"
                                                  onClick={() => setDeleteTarget(w)}>删除</button>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      <ConfirmDialog visible={!!deleteTarget} title="删除错题记录"
        message="确定要删除此错题记录吗？" confirmText="删除"
        onConfirm={() => { if (deleteTarget) handleDeleteSingle(deleteTarget); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)} />

      <ConfirmDialog visible={showClearAll} title="清空所有错题"
        message="确定要清空所有错题记录吗？此操作不可撤销。" confirmText="清空全部"
        onConfirm={handleClearAll} onCancel={() => setShowClearAll(false)} />
    </div>
  )
}
