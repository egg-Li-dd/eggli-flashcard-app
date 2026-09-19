import { useEffect, useMemo, useState } from 'react'
import { getCardsByUnit } from '../services/db'

const VIRTUAL_SCROLL_THRESHOLD = 50
const VIRTUAL_SCROLL_PAGE_SIZE = 50

const DEPTH_OPTIONS = [
  { value: 'chapter-only', label: '仅到章节' },
  { value: 'unit-only', label: '仅到单元' },
  { value: 'chapter-and-unit', label: '章节+单元' },
]

export default function CardSelectionModal({
  visible,
  title = '选择卡片',
  description = '请选择需要处理的卡片',
  units = [],
  chapters = [],
  categories = null,
  nextLoading = false,
  nextLabel = '下一步',
  feature,
  classificationDepth = 'unit-only',
  onClassificationDepthChange,
  onCancel,
  onNext,
}) {
  const [unitCardsMap, setUnitCardsMap] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [groupExpanded, setGroupExpanded] = useState({})
  const [flippedCardIds, setFlippedCardIds] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [visibleCardLimits, setVisibleCardLimits] = useState({})
  const [categoryExpanded, setCategoryExpanded] = useState({})

  const safeUnits = useMemo(() => (Array.isArray(units) ? units : []), [units])
  const safeChapters = useMemo(() => (Array.isArray(chapters) ? chapters : []), [chapters])
  const safeCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories])
  const isMultiCategory = feature === 'cross-category-auto' && safeCategories.length > 1

  const showDepthSelector = feature === 'unit-organize' || feature === 'cross-category-auto' || feature === 'cross-category'

  // 章节-单元映射
  const chapterUnitMap = useMemo(() => {
    if (!showDepthSelector || safeChapters.length === 0) return null
    const map = {}
    for (const ch of safeChapters) {
      map[ch.id] = { ...ch, units: safeUnits.filter(u => u.chapterId === ch.id) }
    }
    // 无章节的单元归入"其他"
    const orphanUnits = safeUnits.filter(u => !u.chapterId || !map[u.chapterId])
    if (orphanUnits.length > 0) {
      map['__orphan__'] = { id: '__orphan__', name: '其他', units: orphanUnits }
    }
    return map
  }, [safeUnits, safeChapters, showDepthSelector])

  // 分类到单元/章节的映射（用于跨分类模式）
  const categoryUnitMap = useMemo(() => {
    if (!isMultiCategory || safeCategories.length === 0) return null
    const map = {}
    for (const cat of safeCategories) {
      const catUnits = safeUnits.filter(u => u.categoryId === cat.id)
      const catChapters = safeChapters.filter(ch => ch.categoryId === cat.id)
      
      const chapterMap = {}
      for (const ch of catChapters) {
        chapterMap[ch.id] = { ...ch, units: catUnits.filter(u => u.chapterId === ch.id) }
      }
      const orphanUnitsInCat = catUnits.filter(u => !u.chapterId || !chapterMap[u.chapterId])
      
      map[cat.id] = {
        ...cat,
        units: catUnits,
        chapters: catChapters,
        chapterMap: Object.keys(chapterMap).length > 0 ? chapterMap : null,
        orphanUnits: orphanUnitsInCat,
      }
    }
    return map
  }, [safeUnits, safeChapters, safeCategories, isMultiCategory])

  useEffect(() => {
    if (!visible) return

    let cancelled = false
    const loadCards = async () => {
      setLoading(true)
      try {
        const entries = await Promise.all(
          safeUnits.map(async (unit) => {
            const cards = await getCardsByUnit(unit.id)
            return [unit.id, cards]
          })
        )
        if (cancelled) return

        const nextMap = Object.fromEntries(entries)
        const nextExpanded = {}
        safeUnits.forEach((unit) => {
          nextExpanded[unit.id] = true
        })
        
        const nextCategoryExpanded = {}
        if (safeCategories.length > 0) {
          safeCategories.forEach((cat) => {
            nextCategoryExpanded[cat.id] = true
          })
        }
        
        setUnitCardsMap(nextMap)
        setGroupExpanded(nextExpanded)
        setCategoryExpanded(nextCategoryExpanded)
        setSelectedIds(new Set())
        setFlippedCardIds(new Set())
        setVisibleCardLimits({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCards()
    return () => {
      cancelled = true
    }
  }, [visible, safeUnits, safeCategories])

  const allCards = useMemo(() => {
    return safeUnits.flatMap((unit) => unitCardsMap[unit.id] || [])
  }, [safeUnits, unitCardsMap])

  const selectedCount = selectedIds.size
  const allSelected = allCards.length > 0 && allCards.every((card) => selectedIds.has(card.id))
  const largeListMode = allCards.length > VIRTUAL_SCROLL_THRESHOLD

  const toggleCardSelection = (cardId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const toggleAllSelection = () => {
    setSelectedIds((prev) => {
      if (allCards.length > 0 && allCards.every((card) => prev.has(card.id))) {
        return new Set()
      }
      return new Set(allCards.map((card) => card.id))
    })
  }

  const toggleUnitSelection = (unitId) => {
    const cards = unitCardsMap[unitId] || []
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const unitAllSelected = cards.length > 0 && cards.every((card) => next.has(card.id))
      cards.forEach((card) => {
        if (unitAllSelected) next.delete(card.id)
        else next.add(card.id)
      })
      return next
    })
  }

  const invertUnitSelection = (unitId) => {
    const cards = unitCardsMap[unitId] || []
    setSelectedIds((prev) => {
      const next = new Set(prev)
      cards.forEach((card) => {
        if (next.has(card.id)) next.delete(card.id)
        else next.add(card.id)
      })
      return next
    })
  }

  const toggleGroupExpanded = (unitId) => {
    setGroupExpanded((prev) => ({
      ...prev,
      [unitId]: !prev[unitId],
    }))
  }

  const toggleCategoryExpanded = (categoryId) => {
    setCategoryExpanded((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }))
  }

  const toggleCardFlip = (cardId) => {
    setFlippedCardIds((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const getVisibleCards = (unitId, cards) => {
    if (!largeListMode) return cards
    const limit = visibleCardLimits[unitId] || VIRTUAL_SCROLL_PAGE_SIZE
    return cards.slice(0, limit)
  }

  const showMoreCards = (unitId) => {
    setVisibleCardLimits((prev) => ({
      ...prev,
      [unitId]: (prev[unitId] || VIRTUAL_SCROLL_PAGE_SIZE) + VIRTUAL_SCROLL_PAGE_SIZE,
    }))
  }

  const handleCardClick = (cardId) => {
    toggleCardFlip(cardId)
  }

  const handleNext = () => {
    if (selectedCount === 0 || nextLoading) return
    const selectedCards = allCards.filter((card) => selectedIds.has(card.id))
    onNext?.(selectedCards)
  }

  // 渲染卡片列表（带 unitId 以支持虚拟滚动）
  const renderCards = (cards, unitId) => {
    const visibleCards = getVisibleCards(unitId, cards)
    return (
      <>
        {visibleCards.map((card) => {
          const selected = selectedIds.has(card.id)
          const flipped = flippedCardIds.has(card.id)
          const displayText = flipped
            ? (card.knowledge_point || '暂无原始知识点')
            : (card.front || '（空问题）')

          return (
            <article
              key={card.id}
              className={'card-selection-card' + (selected ? ' card-selection-card-selected' : '')}
              onClick={() => handleCardClick(card.id)}
            >
              <button
                className={'card-selection-checkbox' + (selected ? ' card-selection-checkbox-active' : '')}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleCardSelection(card.id)
                }}
                aria-label={selected ? '取消选择卡片' : '选择卡片'}
              >
                {selected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
              <div className={'card-selection-flip' + (flipped ? ' card-selection-flip-back' : '')}>
                <div className="card-selection-card-label">
                  {flipped ? '原始知识点' : '题目'}
                </div>
                <p>{displayText}</p>
              </div>
            </article>
          )
        })}
        {largeListMode && visibleCards.length < cards.length && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 44 }}
            onClick={() => showMoreCards(unitId)}
          >
            继续显示 {Math.min(VIRTUAL_SCROLL_PAGE_SIZE, cards.length - visibleCards.length)} 张
          </button>
        )}
      </>
    )
  }

  // 渲染单个单元区块
  const renderUnitSection = (unit, cards) => {
    const unitSelectedCount = cards.filter((card) => selectedIds.has(card.id)).length
    const unitAllSelected = cards.length > 0 && unitSelectedCount === cards.length
    const unitPartSelected = unitSelectedCount > 0 && unitSelectedCount < cards.length

    return (
      <section className="card-selection-unit" key={unit.id}>
        <div className="card-selection-unit-header">
          <button
            className="card-selection-unit-toggle"
            onClick={() => toggleGroupExpanded(unit.id)}
            aria-expanded={!!groupExpanded[unit.id]}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={groupExpanded[unit.id] ? 'card-selection-arrow-open' : ''}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span>{unit.name}</span>
            <em>{unitSelectedCount}/{cards.length}</em>
          </button>
          <div className="card-selection-unit-actions">
            <button
              className={'card-selection-check' + (unitAllSelected ? ' card-selection-check-active' : '') + (unitPartSelected ? ' card-selection-check-partial' : '')}
              onClick={() => toggleUnitSelection(unit.id)}
              disabled={cards.length === 0}
            >
              {unitAllSelected ? '取消' : '全选'}
            </button>
            <button
              className="card-selection-check"
              onClick={() => invertUnitSelection(unit.id)}
              disabled={cards.length === 0}
            >
              反选
            </button>
          </div>
        </div>

        {groupExpanded[unit.id] && (
          <div className="card-selection-card-list">
            {cards.length === 0 ? (
              <div className="card-selection-unit-empty">该单元暂无卡片</div>
            ) : (
              renderCards(cards, unit.id)
            )}
          </div>
        )}
      </section>
    )
  }

  if (!visible) return null

  return (
    <div className="card-selection-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card-selection-backdrop" onClick={onCancel} />
      <div className="card-selection-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="card-selection-header">
          <div className="card-selection-title-wrap">
            <h2 className="card-selection-title">{title}</h2>
            <p className="card-selection-desc">{description}</p>
          </div>
          <button className="card-selection-close" onClick={onCancel} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 分类程度选择器 - 仅在分类相关功能时显示 */}
        {showDepthSelector && (
          <div style={{
            padding: '10px 18px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',           /* D-10：窄屏允许换行 */
          }}>
            <span style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              分类程度：
            </span>
            <div style={{
              display: 'flex',
              flex: '1 1 200px',        /* D-10：基础宽度 200px，允许伸缩 */
              minWidth: 0,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid var(--color-border)',
              background: 'var(--color-border-light)',
            }}>
              {DEPTH_OPTIONS.map((opt) => {
                const active = classificationDepth === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onClassificationDepthChange?.(opt.value)}
                    style={{
                      flex: '1 1 0',    /* D-10：等分剩余空间 */
                      minHeight: 44,
                      padding: '0 4px',
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      border: 'none',
                      borderRadius: 0,
                      background: active ? 'var(--color-primary)' : 'transparent',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="card-selection-toolbar">
          <button
            className={'card-selection-pill' + (allSelected ? ' card-selection-pill-active' : '')}
            onClick={toggleAllSelection}
            disabled={loading || allCards.length === 0}
          >
            {allSelected ? '取消全选' : '全选'}
          </button>
          <span className="card-selection-total">共 {allCards.length} 张卡片</span>
        </div>

        <div className="card-selection-content" data-mobile-scroll="card-selection-content">
          {loading ? (
            <div className="card-selection-empty">正在加载卡片...</div>
          ) : allCards.length === 0 ? (
            <div className="card-selection-empty">当前分类下暂无卡片</div>
          ) : (
            <>
              {categoryUnitMap ? (
                // 多分类模式：分类→章节→单元
                Object.values(categoryUnitMap).map((category) => {
                  const categoryUnits = category.units || []
                  const categoryCards = categoryUnits.flatMap(u => unitCardsMap[u.id] || [])
                  const isExpanded = categoryExpanded[category.id] !== false
                  
                  return (
                    <div key={category.id} style={{
                      marginBottom: 16,
                      borderRadius: 14,
                      border: '2px solid var(--color-primary)',
                      overflow: 'hidden',
                      background: 'var(--color-bg)',
                    }}>
                      <div 
                        style={{
                          padding: '14px 16px',
                          background: 'var(--color-primary)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleCategoryExpanded(category.id)}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{
                            transition: 'transform 0.2s',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <span style={{
                          fontSize: 16,
                          fontWeight: 800,
                          flex: 1,
                        }}>
                          {category.name}
                        </span>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 600,
                          opacity: 0.9,
                        }}>
                          {categoryCards.length} 张卡片
                        </span>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: '10px' }}>
                          {category.chapterMap ? (
                            Object.values(category.chapterMap).map((chapter) => {
                              const chapterUnits = Array.isArray(chapter.units) ? chapter.units : []
                              const chapterCards = chapterUnits.flatMap(u => unitCardsMap[u.id] || [])
                              if (chapterUnits.length === 0) return null

                              return (
                                <div key={chapter.id} style={{
                                  marginBottom: 10,
                                  borderRadius: 10,
                                  border: '1px solid var(--color-border)',
                                  overflow: 'hidden',
                                }}>
                                  <div style={{
                                    padding: '10px 12px',
                                    background: 'var(--color-primary-light)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}>
                                    <span style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: 'var(--color-primary-dark)',
                                    }}>
                                      {chapter.name}
                                    </span>
                                    <span style={{
                                      fontSize: 12,
                                      color: 'var(--color-text-secondary)',
                                    }}>
                                      {chapterCards.length} 张
                                    </span>
                                  </div>
                                  <div style={{ padding: '6px 6px' }}>
                                    {chapterUnits.map((unit) => {
                                      const cards = unitCardsMap[unit.id] || []
                                      return renderUnitSection(unit, cards)
                                    })}
                                  </div>
                                </div>
                              )
                            })
                          ) : null}
                          {category.orphanUnits && category.orphanUnits.length > 0 ? (
                            <div style={{
                              marginBottom: 10,
                              borderRadius: 10,
                              border: '1px solid var(--color-border)',
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                padding: '10px 12px',
                                background: 'var(--color-border-light)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}>
                                <span style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: 'var(--color-text-secondary)',
                                }}>
                                  其他单元
                                </span>
                                <span style={{
                                  fontSize: 12,
                                  color: 'var(--color-text-secondary)',
                                }}>
                                  {category.orphanUnits.length} 个
                                </span>
                              </div>
                              <div style={{ padding: '6px 6px' }}>
                                {category.orphanUnits.map((unit) => {
                                  const cards = unitCardsMap[unit.id] || []
                                  return renderUnitSection(unit, cards)
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : chapterUnitMap && Object.keys(chapterUnitMap).length > 0 ? (
                // 章节-单元分组模式
                Object.values(chapterUnitMap).map((chapter) => {
                  const chapterUnits = Array.isArray(chapter.units) ? chapter.units : []
                  const chapterCards = chapterUnits.flatMap(u => unitCardsMap[u.id] || [])
                  if (chapterUnits.length === 0 && chapter.id !== '__orphan__') return null

                  return (
                    <div key={chapter.id} style={{
                      marginBottom: 12,
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        padding: '12px 14px',
                        background: 'var(--color-primary-light)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <span style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--color-primary-dark)',
                        }}>
                          {chapter.name}
                        </span>
                        <span style={{
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                        }}>
                          {chapterCards.length} 张卡片
                        </span>
                      </div>
                      <div style={{ padding: '8px 8px' }}>
                        {chapterUnits.map((unit) => {
                          const cards = unitCardsMap[unit.id] || []
                          return renderUnitSection(unit, cards)
                        })}
                      </div>
                    </div>
                  )
                })
              ) : (
                // 原有纯单元分组模式
                safeUnits.map((unit) => {
                  const cards = unitCardsMap[unit.id] || []
                  return renderUnitSection(unit, cards)
                })
              )}
            </>
          )}
        </div>

        <div
          className="card-selection-footer"
          style={{
            position: 'sticky',
            bottom: 0,
            paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <span>已选择 {selectedCount} 张</span>
          <button className="btn btn-primary" onClick={handleNext} disabled={selectedCount === 0} aria-disabled={selectedCount === 0 || nextLoading}>
            {nextLoading ? '生成方案中...' : nextLabel}
          </button>
        </div>
      </div>
    </div>
  )
}