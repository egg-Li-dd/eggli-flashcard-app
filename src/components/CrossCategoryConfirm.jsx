import { useEffect, useMemo, useState, useCallback } from 'react'

// [fix-UI性能] 提取常量样式，避免每次渲染重建对象
const STYLES = {
  overlay: {
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
  },
  dialog: {
    width: '100%',
    maxWidth: 520,
    height: 'calc(100dvh - 24px)',
    maxHeight: 'none',
    padding: 0,
    margin: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '16px',
    backgroundColor: 'var(--color-surface)',
    boxShadow: 'var(--shadow-lg)',
    boxSizing: 'border-box',
  },
  header: {
    padding: '14px 16px 12px',
    borderBottom: '1px solid var(--color-border-light)',
    flexShrink: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1.3,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    marginTop: 10,
  },
  toolBtn: {
    flex: 1,
    minHeight: 34,
    padding: '6px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    background: 'var(--color-bg)',
    color: 'var(--color-text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  content: {
    flex: '1 1 0',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain',
  },
  category: {
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    background: 'var(--color-bg-card)',
    overflow: 'hidden',
  },
  categoryHeader: {
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
  },
  collapseBtn: {
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 8,
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    flexShrink: 0,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    padding: 0,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text)',
    background: 'var(--color-bg)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  countBadge: {
    flexShrink: 0,
    padding: '4px 8px',
    fontSize: 12,
    minHeight: 24,
    borderRadius: 6,
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
  },
  chapterWrap: {
    margin: '0 8px 8px',
    border: '1px solid var(--color-border-light)',
    borderRadius: 10,
    background: 'var(--color-bg)',
    overflow: 'hidden',
  },
  chapterHeader: {
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    background: 'var(--color-primary-light)',
  },
  chapterCollapseBtn: {
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    background: 'var(--color-primary)',
    color: '#fff',
    flexShrink: 0,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    padding: 0,
  },
  chapterInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
    background: 'var(--color-bg-card)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  unitWrap: {
    margin: '0 6px 6px',
    border: '1px solid var(--color-border-light)',
    borderRadius: 8,
    background: 'var(--color-bg-card)',
    overflow: 'hidden',
  },
  unitHeader: {
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
  },
  unitCollapseBtn: {
    width: 26,
    height: 26,
    border: 'none',
    borderRadius: 6,
    background: 'var(--color-border-light)',
    color: 'var(--color-text-secondary)',
    flexShrink: 0,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    padding: 0,
  },
  unitInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text)',
    background: 'var(--color-bg)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  cardList: {
    padding: '0 6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cardBtn: {
    minHeight: 48,
    textAlign: 'left',
    border: '1px solid var(--color-border-light)',
    borderRadius: 8,
    padding: '8px 10px',
    lineHeight: 1.4,
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 3,
  },
  cardContent: {
    fontSize: 13,
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  footer: {
    padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
    borderTop: '1px solid var(--color-border-light)',
    background: 'var(--color-surface)',
    display: 'flex',
    gap: 10,
    flexShrink: 0,
  },
  footerBtn: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    fontWeight: 600,
  },
}

function clonePlan(plan) {
  const categories = (plan?.categories || []).map((category, categoryIndex) => {
    const chapters = (category.chapters || []).map((chapter, chapterIndex) => ({
      tempId: chapter.tempId || `tmp_ch_${categoryIndex}_${chapterIndex}`,
      name: chapter.name || '新章节',
      // [fix-UI] 章节默认折叠，避免内容过长
      collapsed: true,
      units: (chapter.units || []).map((unit, unitIndex) => ({
        tempId: unit.tempId || `tmp_unit_${categoryIndex}_${chapterIndex}_${unitIndex}`,
        name: unit.name || '新单元',
        // [fix-UI] 单元默认折叠
        collapsed: true,
        cards: (unit.cards || []).map(card => ({ ...card })),
      })),
      cards: (chapter.cards || []).map(card => ({ ...card })),
    }))

    return {
      tempId: category.tempId || `tmp_cat_${categoryIndex}`,
      name: category.name || '新分类',
      // [fix-UI] 分类默认展开
      collapsed: false,
      chapters,
      units: (category.units || []).map((unit, unitIndex) => ({
        tempId: unit.tempId || `tmp_unit_${categoryIndex}_${unitIndex}`,
        name: unit.name || '新单元',
        collapsed: true,
        cards: (unit.cards || []).map(card => ({ ...card })),
      })),
    }
  })

  return { categories }
}

export default function CrossCategoryConfirm({ visible, plan, loading, onCancel, onConfirm, onMinimize }) {
  const [draft, setDraft] = useState(() => clonePlan(plan))
  const [flippedCardId, setFlippedCardId] = useState(null)

  useEffect(() => {
    if (visible) {
      setDraft(clonePlan(plan))
      setFlippedCardId(null)
    }
  }, [visible, plan])

  const hasChapters = useMemo(() => {
    return draft.categories.some(cat => Array.isArray(cat.chapters) && cat.chapters.length > 0)
  }, [draft])

  const stats = useMemo(() => {
    const categoryCount = draft.categories.length
    let chapterCount = 0
    let unitCount = 0
    let cardCount = 0

    for (const category of draft.categories) {
      if (Array.isArray(category.chapters) && category.chapters.length > 0) {
        chapterCount += category.chapters.length
        for (const chapter of category.chapters) {
          if (Array.isArray(chapter.units)) {
            unitCount += chapter.units.length
            for (const unit of chapter.units) {
              cardCount += (unit.cards || []).length
            }
          }
          cardCount += (chapter.cards || []).length
        }
      } else {
        unitCount += category.units.length
        for (const unit of category.units) {
          cardCount += (unit.cards || []).length
        }
      }
    }

    return { categoryCount, chapterCount, unitCount, cardCount }
  }, [draft])

  // [fix-UI] 使用 useCallback 避免重复创建函数
  const updateCategoryName = useCallback((categoryIndex, name) => {
    setDraft(prev => ({
      categories: prev.categories.map((category, index) => (
        index === categoryIndex ? { ...category, name } : category
      )),
    }))
  }, [])

  const updateChapterName = useCallback((categoryIndex, chapterIndex, name) => {
    setDraft(prev => ({
      categories: prev.categories.map((category, cIndex) => {
        if (cIndex !== categoryIndex) return category
        return {
          ...category,
          chapters: (category.chapters || []).map((chapter, chIndex) => (
            chIndex === chapterIndex ? { ...chapter, name } : chapter
          )),
        }
      }),
    }))
  }, [])

  const updateUnitName = useCallback((categoryIndex, chapterIndex, unitIndex, name) => {
    setDraft(prev => ({
      categories: prev.categories.map((category, cIndex) => {
        if (cIndex !== categoryIndex) return category
        if (chapterIndex !== undefined && Array.isArray(category.chapters) && category.chapters.length > 0) {
          return {
            ...category,
            chapters: category.chapters.map((chapter, chIndex) => {
              if (chIndex !== chapterIndex) return chapter
              return {
                ...chapter,
                units: (chapter.units || []).map((unit, uIndex) => (
                  uIndex === unitIndex ? { ...unit, name } : unit
                )),
              }
            }),
          }
        }
        return {
          ...category,
          units: category.units.map((unit, uIndex) => (
            uIndex === unitIndex ? { ...unit, name } : unit
          )),
        }
      }),
    }))
  }, [])

  const toggleCategory = useCallback((categoryIndex) => {
    setDraft(prev => ({
      categories: prev.categories.map((category, index) => (
        index === categoryIndex ? { ...category, collapsed: !category.collapsed } : category
      )),
    }))
  }, [])

  const toggleChapter = useCallback((categoryIndex, chapterIndex) => {
    setDraft(prev => ({
      categories: prev.categories.map((category, cIndex) => {
        if (cIndex !== categoryIndex) return category
        return {
          ...category,
          chapters: (category.chapters || []).map((chapter, chIndex) => (
            chIndex === chapterIndex ? { ...chapter, collapsed: !chapter.collapsed } : chapter
          )),
        }
      }),
    }))
  }, [])

  const toggleUnit = useCallback((categoryIndex, chapterIndex, unitIndex) => {
    setDraft(prev => ({
      categories: prev.categories.map((category, cIndex) => {
        if (cIndex !== categoryIndex) return category
        if (chapterIndex !== undefined && Array.isArray(category.chapters) && category.chapters.length > 0) {
          return {
            ...category,
            chapters: category.chapters.map((chapter, chIndex) => {
              if (chIndex !== chapterIndex) return chapter
              return {
                ...chapter,
                units: (chapter.units || []).map((unit, uIndex) => (
                  uIndex === unitIndex ? { ...unit, collapsed: !unit.collapsed } : unit
                )),
              }
            }),
          }
        }
        return {
          ...category,
          units: category.units.map((unit, uIndex) => (
            uIndex === unitIndex ? { ...unit, collapsed: !unit.collapsed } : unit
          )),
        }
      }),
    }))
  }, [])

  // [fix-UI] 全部展开/折叠
  const expandAll = useCallback(() => {
    setDraft(prev => ({
      categories: prev.categories.map(category => ({
        ...category,
        collapsed: false,
        chapters: (category.chapters || []).map(chapter => ({
          ...chapter,
          collapsed: false,
          units: (chapter.units || []).map(unit => ({ ...unit, collapsed: false })),
        })),
        units: category.units.map(unit => ({ ...unit, collapsed: false })),
      })),
    }))
  }, [])

  const collapseAll = useCallback(() => {
    setDraft(prev => ({
      categories: prev.categories.map((category, index) => ({
        ...category,
        // 第一个分类保持展开，方便查看
        collapsed: index !== 0,
        chapters: (category.chapters || []).map(chapter => ({ ...chapter, collapsed: true })),
        units: category.units.map(unit => ({ ...unit, collapsed: true })),
      })),
    }))
  }, [])

  if (!visible) return null

  const handleConfirm = () => {
    const normalized = {
      categories: draft.categories
        .map(category => {
          const catName = String(category.name || '').trim() || '新分类'

          if (Array.isArray(category.chapters) && category.chapters.length > 0) {
            const normalizedChapters = category.chapters
              .map(chapter => {
                const chName = String(chapter.name || '').trim() || '新章节'

                if (Array.isArray(chapter.units) && chapter.units.length > 0) {
                  const normalizedUnits = chapter.units
                    .map(unit => ({
                      ...unit,
                      name: String(unit.name || '').trim() || '新单元',
                      cards: unit.cards || [],
                    }))
                    .filter(unit => unit.cards.length > 0)

                  const chapterCards = (chapter.cards || []).filter(c => c)
                  if (normalizedUnits.length === 0 && chapterCards.length === 0) return null

                  return {
                    ...chapter,
                    name: chName,
                    units: normalizedUnits,
                    cards: chapterCards,
                  }
                }

                const chapterCards = (chapter.cards || []).filter(c => c)
                if (chapterCards.length === 0) return null

                return {
                  ...chapter,
                  name: chName,
                  units: [],
                  cards: chapterCards,
                }
              })
              .filter(Boolean)

            if (normalizedChapters.length === 0) return null

            return {
              ...category,
              name: catName,
              chapters: normalizedChapters,
              units: [],
            }
          }

          const normalizedUnits = category.units
            .map(unit => ({
              ...unit,
              name: String(unit.name || '').trim() || '新单元',
              cards: unit.cards || [],
            }))
            .filter(unit => unit.cards.length > 0)

          if (normalizedUnits.length === 0) return null

          return {
            ...category,
            name: catName,
            chapters: [],
            units: normalizedUnits,
          }
        })
        .filter(Boolean),
    }
    onConfirm?.(normalized)
  }

  const getStatsLabel = () => {
    if (hasChapters) {
      return `${stats.categoryCount}分类 · ${stats.chapterCount}章节 · ${stats.unitCount}单元 · ${stats.cardCount}卡片`
    }
    return `${stats.categoryCount}分类 · ${stats.unitCount}单元 · ${stats.cardCount}卡片`
  }

  // [fix-UI] 卡片渲染函数（统一，减少重复代码）
  const renderCard = (card, cardIndex, cardKey) => {
    const flipped = flippedCardId === cardKey
    return (
      <button
        key={cardKey}
        type="button"
        onClick={() => setFlippedCardId(flipped ? null : cardKey)}
        style={{
          ...STYLES.cardBtn,
          background: flipped ? 'var(--color-primary-light)' : 'var(--color-bg-card)',
          color: 'var(--color-text)',
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        <div style={{
          ...STYLES.cardLabel,
          color: flipped ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
        }}>
          {flipped ? '原始知识点' : `卡片 ${cardIndex + 1}`}
        </div>
        <div style={{
          ...STYLES.cardContent,
          color: flipped ? 'var(--color-primary-dark)' : 'var(--color-text)',
        }}>
          {flipped
            ? (card.knowledge_point || card.front || '暂无原始知识点')
            : (card.front || '（空问题）')}
        </div>
      </button>
    )
  }

  return (
    <div
      className="dialog-overlay"
      style={STYLES.overlay}
      onClick={() => !loading && (onMinimize ? onMinimize() : onCancel?.())}
    >
      <div
        className="cross-category-dialog"
        style={STYLES.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div style={STYLES.header}>
          <div style={STYLES.headerRow}>
            <div style={STYLES.headerIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h7v7H3z" />
                <path d="M14 3h7v7h-7z" />
                <path d="M14 14h7v7h-7z" />
                <path d="M10 10l4-4" />
                <path d="M10 14l4 4" />
              </svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={STYLES.title}>确认 AI 全权归类方案</p>
              <p style={STYLES.subtitle}>{getStatsLabel()}</p>
            </div>
            {onMinimize && (
              <button
                onClick={onMinimize}
                aria-label="最小化到任务浮窗"
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                </svg>
              </button>
            )}
          </div>
          {/* [fix-UI] 全部展开/折叠按钮 */}
          <div style={STYLES.toolbar}>
            <button type="button" style={STYLES.toolBtn} onClick={expandAll} disabled={loading}>
              全部展开
            </button>
            <button type="button" style={STYLES.toolBtn} onClick={collapseAll} disabled={loading}>
              全部折叠
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={STYLES.content} data-mobile-scroll="cross-category-content">
          {draft.categories.map((category, categoryIndex) => {
            const categoryChapters = Array.isArray(category.chapters) ? category.chapters : []
            const hasCategoryChapters = categoryChapters.length > 0

            return (
              <section key={category.tempId} style={STYLES.category}>
                {/* 分类头部 */}
                <div style={STYLES.categoryHeader}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(categoryIndex)}
                    aria-label={category.collapsed ? '展开分类' : '收起分类'}
                    style={STYLES.collapseBtn}
                  >
                    {category.collapsed ? '▸' : '▾'}
                  </button>
                  <input
                    value={category.name}
                    onChange={(event) => updateCategoryName(categoryIndex, event.target.value)}
                    aria-label="分类名称"
                    style={STYLES.nameInput}
                  />
                  <span style={STYLES.countBadge}>
                    {hasCategoryChapters
                      ? `${categoryChapters.length}章`
                      : `${category.units.length}单元`}
                  </span>
                </div>

                {/* 分类内容 */}
                {!category.collapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px 8px' }}>
                    {hasCategoryChapters ? (
                      // 四层显示：分类 → 章节 → 单元 → 卡片
                      categoryChapters.map((chapter, chapterIndex) => {
                        const chapterUnits = Array.isArray(chapter.units) ? chapter.units : []
                        const chapterCards = Array.isArray(chapter.cards) ? chapter.cards : []
                        const hasChapterUnits = chapterUnits.length > 0

                        return (
                          <div key={chapter.tempId} style={STYLES.chapterWrap}>
                            {/* 章节头部 */}
                            <div style={STYLES.chapterHeader}>
                              <button
                                type="button"
                                onClick={() => toggleChapter(categoryIndex, chapterIndex)}
                                aria-label={chapter.collapsed ? '展开章节' : '收起章节'}
                                style={STYLES.chapterCollapseBtn}
                              >
                                {chapter.collapsed ? '▸' : '▾'}
                              </button>
                              <input
                                value={chapter.name}
                                onChange={(event) => updateChapterName(categoryIndex, chapterIndex, event.target.value)}
                                aria-label="章节名称"
                                style={STYLES.chapterInput}
                              />
                              <span style={STYLES.countBadge}>
                                {hasChapterUnits
                                  ? `${chapterUnits.length}单元`
                                  : `${chapterCards.length}张`}
                              </span>
                            </div>

                            {/* 章节内容 */}
                            {!chapter.collapsed && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px 6px' }}>
                                {hasChapterUnits ? (
                                  chapterUnits.map((unit, unitIndex) => (
                                    <div key={unit.tempId} style={STYLES.unitWrap}>
                                      {/* 单元头部 */}
                                      <div style={STYLES.unitHeader}>
                                        <button
                                          type="button"
                                          onClick={() => toggleUnit(categoryIndex, chapterIndex, unitIndex)}
                                          aria-label={unit.collapsed ? '展开单元' : '收起单元'}
                                          style={STYLES.unitCollapseBtn}
                                        >
                                          {unit.collapsed ? '▸' : '▾'}
                                        </button>
                                        <input
                                          value={unit.name}
                                          onChange={(event) => updateUnitName(categoryIndex, chapterIndex, unitIndex, event.target.value)}
                                          aria-label="单元名称"
                                          style={STYLES.unitInput}
                                        />
                                        <span style={STYLES.countBadge}>{(unit.cards || []).length}张</span>
                                      </div>

                                      {/* 单元内容 - 卡片列表 */}
                                      {!unit.collapsed && (
                                        <div style={STYLES.cardList}>
                                          {(unit.cards || []).map((card, cardIndex) => {
                                            const cardKey = card.id || `${category.tempId}_${chapter.tempId}_${unit.tempId}_${cardIndex}`
                                            return renderCard(card, cardIndex, cardKey)
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  // 章节下无单元，直接显示卡片
                                  <div style={STYLES.cardList}>
                                    {chapterCards.map((card, cardIndex) => {
                                      const cardKey = card.id || `${category.tempId}_${chapter.tempId}_card_${cardIndex}`
                                      return renderCard(card, cardIndex, cardKey)
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      // 三层显示：分类 → 单元 → 卡片
                      category.units.map((unit, unitIndex) => (
                        <div key={unit.tempId} style={STYLES.unitWrap}>
                          {/* 单元头部 */}
                          <div style={STYLES.unitHeader}>
                            <button
                              type="button"
                              onClick={() => toggleUnit(categoryIndex, undefined, unitIndex)}
                              aria-label={unit.collapsed ? '展开单元' : '收起单元'}
                              style={STYLES.unitCollapseBtn}
                            >
                              {unit.collapsed ? '▸' : '▾'}
                            </button>
                            <input
                              value={unit.name}
                              onChange={(event) => updateUnitName(categoryIndex, undefined, unitIndex, event.target.value)}
                              aria-label="单元名称"
                              style={STYLES.unitInput}
                            />
                            <span style={STYLES.countBadge}>{unit.cards.length}张</span>
                          </div>

                          {/* 单元内容 - 卡片列表 */}
                          {!unit.collapsed && (
                            <div style={STYLES.cardList}>
                              {unit.cards.map((card, cardIndex) => {
                                const cardKey = card.id || `${category.tempId}_${unit.tempId}_${cardIndex}`
                                return renderCard(card, cardIndex, cardKey)
                              })}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {/* Footer */}
        <div style={STYLES.footer}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
            style={STYLES.footerBtn}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={loading || stats.cardCount === 0}
            style={STYLES.footerBtn}
          >
            {loading ? '执行中...' : '确认执行'}
          </button>
        </div>
      </div>
    </div>
  )
}
