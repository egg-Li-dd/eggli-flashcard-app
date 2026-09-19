import { useEffect, useMemo, useState, useCallback } from 'react'

export default function UnitReorganizeConfirm({
  visible,
  plan,
  loading = false,
  onCancel,
  onConfirm,
  onMinimize,
}) {
  const [unitNames, setUnitNames] = useState({})
  const [chapterNames, setChapterNames] = useState({})
  const [flippedCardIds, setFlippedCardIds] = useState(new Set())
  const [localChapters, setLocalChapters] = useState([])
  const [localUnits, setLocalUnits] = useState([])
  const [collapsedChapters, setCollapsedChapters] = useState(new Set())
  const [collapsedUnits, setCollapsedUnits] = useState(new Set())

  const units = useMemo(() => (Array.isArray(plan?.units) ? plan.units : []), [plan])
  const chapters = useMemo(() => (Array.isArray(plan?.chapters) ? plan.chapters : []), [plan])
  const mode = useMemo(() => plan?.mode || 'unit-only', [plan])
  const isChapterMode = mode === 'chapter-only' || mode === 'chapter-and-unit'

  useEffect(() => {
    if (!visible) return
    setUnitNames({})
    setChapterNames({})
    setFlippedCardIds(new Set())
    setCollapsedChapters(new Set())
    setCollapsedUnits(new Set())
    setLocalChapters(chapters)
    setLocalUnits(units)
  }, [visible, plan, chapters, units])

  const totalCards = useMemo(() => {
    if (isChapterMode && localChapters.length > 0) {
      return localChapters.reduce((sum, ch) => {
        const chUnits = Array.isArray(ch.units) ? ch.units : []
        const chCards = Array.isArray(ch.cards) ? ch.cards : []
        return sum + chCards.length + chUnits.reduce((s, u) => s + (u.cards?.length || 0), 0)
      }, 0)
    }
    return localUnits.reduce((sum, u) => sum + (u.cards?.length || 0), 0)
  }, [localUnits, localChapters, isChapterMode])

  // === 移动操作 ===
  const moveUnitUp = useCallback((chIdx, uIdx) => {
    if (uIdx <= 0) return
    setLocalChapters(prev => {
      const updated = [...prev]
      const ch = { ...updated[chIdx] }
      const arr = [...(ch.units || [])]
      ;[arr[uIdx - 1], arr[uIdx]] = [arr[uIdx], arr[uIdx - 1]]
      ch.units = arr
      updated[chIdx] = ch
      return updated
    })
  }, [])

  const moveUnitDown = useCallback((chIdx, uIdx) => {
    setLocalChapters(prev => {
      const ch = prev[chIdx]
      const arr = Array.isArray(ch.units) ? ch.units : []
      if (uIdx >= arr.length - 1) return prev
      const updated = [...prev]
      const newCh = { ...ch }
      const newArr = [...arr]
      ;[newArr[uIdx], newArr[uIdx + 1]] = [newArr[uIdx + 1], newArr[uIdx]]
      newCh.units = newArr
      updated[chIdx] = newCh
      return updated
    })
  }, [])

  const moveChapterUp = useCallback((idx) => {
    if (idx <= 0) return
    setLocalChapters(prev => {
      const updated = [...prev]
      ;[updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]]
      return updated
    })
  }, [])

  const moveChapterDown = useCallback((idx) => {
    setLocalChapters(prev => {
      if (idx >= prev.length - 1) return prev
      const updated = [...prev]
      ;[updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]]
      return updated
    })
  }, [])

  const moveUnitUpSimple = useCallback((idx) => {
    if (idx <= 0) return
    setLocalUnits(prev => {
      const updated = [...prev]
      ;[updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]]
      return updated
    })
  }, [])

  const moveUnitDownSimple = useCallback((idx) => {
    setLocalUnits(prev => {
      if (idx >= prev.length - 1) return prev
      const updated = [...prev]
      ;[updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]]
      return updated
    })
  }, [])

  // === 折叠/展开 ===
  const toggleChapterCollapse = useCallback((chIdx) => {
    setCollapsedChapters(prev => {
      const next = new Set(prev)
      const key = `ch-${chIdx}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleUnitCollapse = useCallback((unitKey) => {
    setCollapsedUnits(prev => {
      const next = new Set(prev)
      if (next.has(unitKey)) next.delete(unitKey)
      else next.add(unitKey)
      return next
    })
  }, [])

  // === 名称编辑 ===
  const getUnitName = (unit, index) => {
    const key = unit.unitId || `new-${index}`
    return unitNames[key] ?? unit.name ?? '新单元'
  }
  const handleNameChange = (unit, index, value) => {
    const key = unit.unitId || `new-${index}`
    setUnitNames(prev => ({ ...prev, [key]: value }))
  }
  const getChapterName = (chapter, index) => {
    const key = chapter.chapterId || `ch-new-${index}`
    return chapterNames[key] ?? chapter.name ?? '新章节'
  }
  const handleChapterNameChange = (chapter, index, value) => {
    const key = chapter.chapterId || `ch-new-${index}`
    setChapterNames(prev => ({ ...prev, [key]: value }))
  }

  // === 卡片翻转 ===
  const toggleCardFlip = useCallback((cardId) => {
    setFlippedCardIds(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  // === 确认 ===
  const handleConfirm = () => {
    if (isChapterMode && localChapters.length > 0) {
      const normalized = localChapters
        .map((ch, chIdx) => {
          const chName = getChapterName(ch, chIdx).trim() || ch.name || '新章节'
          const chUnits = Array.isArray(ch.units) ? ch.units : []
          const chCards = Array.isArray(ch.cards) ? ch.cards : []
          if (mode === 'chapter-only') {
            return { ...ch, name: chName, units: [], cards: chCards.map(c => ({ ...c })) }
          }
          const normUnits = chUnits
            .map((u, uIdx) => ({
              ...u,
              name: getUnitName(u, uIdx).trim() || u.name || '新单元',
              cards: Array.isArray(u.cards) ? u.cards : [],
            }))
            .filter(u => u.cards.length > 0)
          if (normUnits.length === 0 && chCards.length === 0) return null
          return { ...ch, name: chName, units: normUnits, cards: chCards }
        })
        .filter(Boolean)
      if (normalized.length === 0) return
      onConfirm?.({ ...plan, chapters: normalized, units: [], mode })
      return
    }
    const normUnits = localUnits
      .map((u, i) => ({
        ...u,
        name: getUnitName(u, i).trim() || u.name || '新单元',
        cards: Array.isArray(u.cards) ? u.cards : [],
      }))
      .filter(u => u.cards.length > 0)
    if (normUnits.length === 0) return
    onConfirm?.({ ...plan, units: normUnits, mode })
  }

  const getModeLabel = () => {
    if (mode === 'chapter-only') return `${localChapters.length} 个章节 · ${totalCards} 张卡片`
    if (mode === 'chapter-and-unit') {
      const unitCount = localChapters.reduce((s, ch) => s + (Array.isArray(ch.units) ? ch.units.length : 0), 0)
      return `${localChapters.length} 个章节 · ${unitCount} 个单元 · ${totalCards} 张卡片`
    }
    return `${localUnits.length} 个单元 · ${totalCards} 张卡片`
  }

  if (!visible) return null

  // === 渲染卡片 ===
  const renderCard = (card, cardIndex, keyPrefix) => {
    const flipped = flippedCardIds.has(card.id)
    const text = flipped
      ? (card.knowledge_point || card.knowledgePoint || '暂无原始知识点')
      : (card.front || '（空问题）')
    return (
      <button
        key={`${keyPrefix}card-${cardIndex}-${card.id || 'noid'}`}
        type="button"
        onClick={() => toggleCardFlip(card.id)}
        disabled={loading}
        className="reorganize-card-btn"
      >
        <span className="reorganize-card-label">{flipped ? '原始知识点' : '题目'}</span>
        <span className={`reorganize-card-text ${flipped ? 'flipped' : ''}`}>{text}</span>
      </button>
    )
  }

  // === 渲染单元 ===
  const renderUnitSection = (unit, unitIndex, chapterIndex) => {
    const cards = Array.isArray(unit.cards) ? unit.cards : []
    const unitKey = `u-${chapterIndex !== undefined ? 'ch' + chapterIndex + '-' : ''}${unitIndex}-${unit.unitId || 'new'}`
    const isCollapsed = collapsedUnits.has(unitKey)

    return (
      <section key={unitKey} className="reorganize-unit-section">
        <div className="reorganize-unit-header">
          <div className="reorganize-unit-header-top">
            <span className={`reorganize-badge ${unit.unitId ? 'existing' : 'new'}`}>
              {unit.unitId ? '现有单元' : '新建单元'}
            </span>
            <span className="reorganize-count">{cards.length} 张</span>
            {chapterIndex !== undefined && (
              <div className="reorganize-move-btns">
                <button
                  onClick={() => moveUnitUp(chapterIndex, unitIndex)}
                  disabled={loading || unitIndex <= 0}
                  aria-label="上移"
                  className="reorganize-move-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
                </button>
                <button
                  onClick={() => moveUnitDown(chapterIndex, unitIndex)}
                  disabled={loading || unitIndex >= (localChapters[chapterIndex]?.units?.length - 1 || 0)}
                  aria-label="下移"
                  className="reorganize-move-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></svg>
                </button>
              </div>
            )}
            <button
              onClick={() => toggleUnitCollapse(unitKey)}
              aria-label={isCollapsed ? '展开' : '折叠'}
              className="reorganize-collapse-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          <input
            value={getUnitName(unit, unitIndex)}
            onChange={(e) => handleNameChange(unit, unitIndex, e.target.value)}
            disabled={loading}
            aria-label="单元名称"
            className="reorganize-name-input"
          />
          {unit.overview && (
            <p className="reorganize-overview">{unit.overview}</p>
          )}
        </div>
        {!isCollapsed && (
          <div className="reorganize-card-list">
            {cards.map((card, cardIndex) => renderCard(card, cardIndex, unitKey + '-'))}
          </div>
        )}
      </section>
    )
  }

  // === 渲染纯单元模式 ===
  const renderSimpleUnit = (unit, unitIndex) => {
    const cards = Array.isArray(unit.cards) ? unit.cards : []
    const unitKey = `simple-u-${unitIndex}-${unit.unitId || 'new'}`
    const isCollapsed = collapsedUnits.has(unitKey)

    return (
      <section key={unitKey} className="reorganize-unit-section">
        <div className="reorganize-unit-header">
          <div className="reorganize-unit-header-top">
            <span className={`reorganize-badge ${unit.unitId ? 'existing' : 'new'}`}>
              {unit.unitId ? '现有单元' : '新建单元'}
            </span>
            <span className="reorganize-count">{cards.length} 张</span>
            <div className="reorganize-move-btns">
              <button
                onClick={() => moveUnitUpSimple(unitIndex)}
                disabled={loading || unitIndex <= 0}
                aria-label="上移"
                className="reorganize-move-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
              </button>
              <button
                onClick={() => moveUnitDownSimple(unitIndex)}
                disabled={loading || unitIndex >= localUnits.length - 1}
                aria-label="下移"
                className="reorganize-move-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></svg>
              </button>
            </div>
            <button
              onClick={() => toggleUnitCollapse(unitKey)}
              aria-label={isCollapsed ? '展开' : '折叠'}
              className="reorganize-collapse-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          <input
            value={getUnitName(unit, unitIndex)}
            onChange={(e) => handleNameChange(unit, unitIndex, e.target.value)}
            disabled={loading}
            aria-label="单元名称"
            className="reorganize-name-input"
          />
          {unit.overview && (
            <p className="reorganize-overview">{unit.overview}</p>
          )}
        </div>
        {!isCollapsed && (
          <div className="reorganize-card-list">
            {cards.map((card, cardIndex) => renderCard(card, cardIndex, `simple-u${unitIndex}-`))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="reorganize-overlay" onClick={onMinimize || onCancel} role="dialog" aria-modal="true" aria-label="确认智能单元整理方案">
      <div className="reorganize-dialog" onClick={(e) => e.stopPropagation()}>
        {/* 顶部标题区 */}
        <div className="reorganize-header">
          <div className="reorganize-header-row">
            <div className="reorganize-header-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" />
              </svg>
            </div>
            <div className="reorganize-header-text">
              <p className="reorganize-title">确认整理方案</p>
              <p className="reorganize-subtitle">{getModeLabel()}，点击卡片可查看原始知识点</p>
            </div>
            {onMinimize && (
              <button
                onClick={onMinimize}
                aria-label="最小化到任务浮窗"
                className="reorganize-minimize-btn"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                </svg>
              </button>
            )}
          </div>
          {plan?.usedFallback && (
            <div className="reorganize-fallback-notice">
              AI 调用失败或未配置服务，已使用本地关键词匹配生成方案，请确认后再执行。
            </div>
          )}
        </div>

        {/* 内容区 */}
        <div className="reorganize-content" data-mobile-scroll="unit-reorganize-content" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {isChapterMode && localChapters.length > 0 ? (
            localChapters.map((chapter, chapterIndex) => {
              const chapterUnits = Array.isArray(chapter.units) ? chapter.units : []
              const chapterCards = Array.isArray(chapter.cards) ? chapter.cards : []
              const hasChapterId = !!chapter.chapterId
              const chKey = `ch-${chapterIndex}`
              const isChCollapsed = collapsedChapters.has(chKey)
              const chCardCount = mode === 'chapter-only'
                ? chapterCards.length
                : chapterCards.length + chapterUnits.reduce((s, u) => s + (u.cards?.length || 0), 0)

              return (
                <div key={`ch-${chapterIndex}-${chapter.chapterId || 'new'}`} className="reorganize-chapter-section">
                  <div className="reorganize-chapter-header">
                    <div className="reorganize-chapter-header-top">
                      <span className={`reorganize-badge-chapter ${hasChapterId ? 'existing' : 'new'}`}>
                        {hasChapterId ? '现有章节' : '新建章节'}
                      </span>
                      <span className="reorganize-count">
                        {mode === 'chapter-only' ? `${chapterCards.length} 张` : `${chapterUnits.length} 个单元 · ${chCardCount} 张`}
                      </span>
                      <div className="reorganize-move-btns">
                        <button
                          onClick={() => moveChapterUp(chapterIndex)}
                          disabled={loading || chapterIndex <= 0}
                          aria-label="章节上移"
                          className="reorganize-move-btn"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
                        </button>
                        <button
                          onClick={() => moveChapterDown(chapterIndex)}
                          disabled={loading || chapterIndex >= localChapters.length - 1}
                          aria-label="章节下移"
                          className="reorganize-move-btn"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></svg>
                        </button>
                      </div>
                      <button
                        onClick={() => toggleChapterCollapse(chKey)}
                        aria-label={isChCollapsed ? '展开' : '折叠'}
                        className="reorganize-collapse-btn"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isChCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                    <input
                      value={getChapterName(chapter, chapterIndex)}
                      onChange={(e) => handleChapterNameChange(chapter, chapterIndex, e.target.value)}
                      disabled={loading}
                      aria-label="章节名称"
                      className="reorganize-name-input reorganize-name-input-chapter"
                    />
                    {chapter.overview && (
                      <p className="reorganize-overview">{chapter.overview}</p>
                    )}
                  </div>
                  {!isChCollapsed && (
                    <>
                      {mode === 'chapter-only' && chapterCards.length > 0 && (
                        <div className="reorganize-card-list">
                          {chapterCards.map((card, cardIndex) => renderCard(card, cardIndex, `ch${chapterIndex}-cards-`))}
                        </div>
                      )}
                      {mode === 'chapter-and-unit' && (
                        <div className="reorganize-unit-list">
                          {chapterUnits.map((unit, unitIndex) => renderUnitSection(unit, unitIndex, chapterIndex))}
                          {chapterCards.length > 0 && (
                            <div className="reorganize-unclassified">
                              <span className="reorganize-unclassified-label">未归类卡片 ({chapterCards.length} 张)</span>
                              <div className="reorganize-card-list">
                                {chapterCards.map((card, cardIndex) => renderCard(card, cardIndex, `ch${chapterIndex}-cards-`))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })
          ) : (
            localUnits.map((unit, unitIndex) => renderSimpleUnit(unit, unitIndex))
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="reorganize-actions">
          <button onClick={onCancel} disabled={loading} className="btn btn-secondary reorganize-btn">
            取消
          </button>
          <button onClick={handleConfirm} disabled={loading || totalCards === 0} className="btn btn-primary reorganize-btn">
            {loading ? '执行中...' : '确认执行'}
          </button>
        </div>
      </div>
    </div>
  )
}
