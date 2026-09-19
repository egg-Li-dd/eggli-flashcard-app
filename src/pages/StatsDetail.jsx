import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCategories } from '../services/db'
import * as db from '../services/db'
import ConfirmDialog from '../components/ConfirmDialog'

const TABS = [
  { key: 'today', label: '今日已学' },
  { key: 'mastered', label: '已掌握' },
  { key: 'bookmarks', label: '收藏' },
]

const STATUS_LABELS = {
  new: '新',
  learning: '学习中',
  mastered: '已掌握',
}

const STATUS_COLORS = {
  new: 'var(--color-text-muted)',
  learning: 'var(--color-warning)',
  mastered: 'var(--color-success)',
}

export default function StatsDetail() {
  const { type } = useParams()
  const navigate = useNavigate()
  const { showToast } = useApp()

  // --- State ---
  const [activeTab, setActiveTab] = useState(type || 'today')
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null) // null = 全部
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const [flippedIds, setFlippedIds] = useState({}) // cardId -> bool
  const [swipedId, setSwipedId] = useState(null) // cardId currently showing action menu
  const [confirmDelete, setConfirmDelete] = useState(null) // { cardId, catId } for delete confirmation

  // Swipe refs
  const swipeRefs = useRef({}) // cardId -> { startX, startY, currentX, moved }
  const dropdownRef = useRef(null)

  // Sync activeTab from URL
  useEffect(() => {
    if (type && ['today', 'mastered', 'bookmarks'].includes(type)) {
      setActiveTab(type)
    }
  }, [type])

  // Load categories
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  // Load cards when tab or category changes
  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      let data = []
      if (activeTab === 'today') {
        data = await db.getTodayStudiedCards()
      } else if (activeTab === 'mastered') {
        data = await db.getMasteredCards()
      } else if (activeTab === 'bookmarks') {
        data = await db.getBookmarkedCards()
      }

      // Enrich bookmarked cards with categoryId from unit lookup (db.getBookmarkedCards doesn't include it)
      if (activeTab === 'bookmarks') {
        const enriched = await Promise.all(data.map(async (card) => {
          // card is spread from db.cards which has id, unitId, front, back, frontImage, backImage, createdAt, order, unitName
          let categoryId = card.categoryId
          let categoryName = card.categoryName
          if (!categoryId && card.unitId) {
            try {
              const allUnits = []
              for (const cat of categories) {
                const units = await db.getUnitsByCategory(cat.id)
                allUnits.push(...units.map(u => ({ ...u, catId: cat.id, catName: cat.name })))
              }
              const unit = allUnits.find(u => u.id === card.unitId)
              if (unit) {
                categoryId = unit.catId
                categoryName = unit.catName
              }
            } catch (_) {}
          }
          return { ...card, cardId: card.id, categoryId: categoryId || '', categoryName: categoryName || '' }
        }))
        data = enriched
      }

      // Filter by category
      if (selectedCategoryId) {
        data = data.filter(c => c.categoryId === selectedCategoryId)
      }

      setCards(data)
    } catch (error) {
      console.error('加载卡片失败:', error)
      showToast('加载数据失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [activeTab, selectedCategoryId, categories, showToast])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  // --- Tab Handling ---
  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey)
    setFlippedIds({})
    setSwipedId(null)
    navigate(`/stats/${tabKey}`, { replace: true })
  }

  // --- Category Filter ---
  const handleCategorySelect = (catId) => {
    setSelectedCategoryId(catId)
    setFlippedIds({})
    setSwipedId(null)
    setShowDropdown(false)
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [showDropdown])

  const showDropdownButton = categories.length > 4

  // --- Card Flip ---
  const handleCardFlip = (cardId) => {
    if (swipedId === cardId) return // don't flip while menu is open
    setFlippedIds(prev => ({ ...prev, [cardId]: !prev[cardId] }))
  }

  // --- Swipe Actions ---
  const handleTouchStart = (e, cardId) => {
    const touch = e.touches[0]
    swipeRefs.current[cardId] = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      moved: false,
    }
  }

  const handleTouchMove = (e, cardId) => {
    const ref = swipeRefs.current[cardId]
    if (!ref) return
    const touch = e.touches[0]
    const dx = touch.clientX - ref.startX
    const dy = touch.clientY - ref.startY

    // If vertical movement exceeds horizontal, don't swipe
    if (Math.abs(dy) > Math.abs(dx)) {
      ref.moved = true // mark as moved to prevent tap
      // Reset transform
      const el = document.querySelector(`[data-card-id="${cardId}"]`)
      if (el) el.style.transform = ''
      return
    }

    ref.moved = Math.abs(dx) > 10
    ref.currentX = touch.clientX

    // Only allow left swipe
    const translateX = Math.min(0, dx)
    const el = document.querySelector(`[data-card-id="${cardId}"]`)
    if (el) {
      el.style.transform = `translateX(${translateX}px)`
      el.style.transition = 'none'
    }
  }

  const handleTouchEnd = (e, cardId) => {
    const ref = swipeRefs.current[cardId]
    if (!ref) return

    const dx = ref.currentX - ref.startX

    // If swiped left enough, lock open
    if (dx < -60) {
      setSwipedId(cardId)
      const el = document.querySelector(`[data-card-id="${cardId}"]`)
      if (el) {
        el.style.transform = 'translateX(-160px)'
        el.style.transition = 'transform 0.25s ease'
      }
    } else {
      // Reset
      const el = document.querySelector(`[data-card-id="${cardId}"]`)
      if (el) {
        el.style.transform = ''
        el.style.transition = 'transform 0.25s ease'
      }
      if (swipedId === cardId) {
        setSwipedId(null)
      }
    }

    // If barely moved, treat as tap
    if (!ref.moved || Math.abs(dx) < 10) {
      handleCardFlip(cardId)
    }
  }

  const closeSwipeMenu = () => {
    if (swipedId) {
      const el = document.querySelector(`[data-card-id="${swipedId}"]`)
      if (el) {
        el.style.transform = ''
        el.style.transition = 'transform 0.25s ease'
      }
      setSwipedId(null)
    }
  }

  // --- Action Handlers ---
  const handleDeleteCard = async (card, e) => {
    if (e) e.stopPropagation()
    closeSwipeMenu()
    const cardId = card.cardId || card.id
    const catId = card.categoryId
    setConfirmDelete({ cardId, catId })
  }

  const handleViewCategory = (card, e) => {
    if (e) e.stopPropagation()
    closeSwipeMenu()
    const catId = card.categoryId
    if (catId) {
      navigate(`/category/${catId}`)
    }
  }

  const handleToggleBookmarkInline = async (isBookmarked, cardId, e) => {
    if (e) e.stopPropagation()
    try {
      if (isBookmarked) {
        await db.removeBookmark(cardId)
        showToast('已取消收藏')
        if (activeTab === 'bookmarks') {
          setCards(prev => prev.filter(c => (c.cardId || c.id) !== cardId))
        }
      } else {
        await db.addBookmark(cardId)
        showToast('已收藏')
      }
    } catch {
      showToast('操作失败', 'error')
    }
    closeSwipeMenu()
  }

  // --- Render helpers ---
  const getCardKey = (card) => card.cardId || card.id
  const getCardId = (card) => card.cardId || card.id

  const getEmptyConfig = () => {
    switch (activeTab) {
      case 'today': return { icon: '📅', title: '暂无数据', desc: '今天还没有学习记录' }
      case 'mastered': return { icon: '✅', title: '暂无数据', desc: '还没有已掌握的卡片' }
      case 'bookmarks': return { icon: '⭐', title: '暂无数据', desc: '还没有收藏的卡片' }
      default: return { icon: '📋', title: '暂无数据', desc: '' }
    }
  }

  const statusBadge = (status) => {
    if (!status) return null
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: '10px',
        fontWeight: 600,
        backgroundColor: STATUS_COLORS[status] ? STATUS_COLORS[status] + '22' : 'var(--color-border-light)',
        color: STATUS_COLORS[status] || 'var(--color-text-secondary)',
        flexShrink: 0,
      }}>
        {STATUS_LABELS[status] || status}
      </span>
    )
  }

  // =========================================================
  // RENDER
  // =========================================================
  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <div
      className="animate-page-in"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg)',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      onContextMenu={preventTextMenu}
      
    >
      {/* ===== Top Navbar ===== */}
      <header style={{
        flexShrink: 0,
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border-light)',
        padding: 'env(safe-area-inset-top, 0) 16px 0',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 0',
          minHeight: '56px',
          maxWidth: '540px',
          margin: '0 auto',
        }}>
          <button
            onClick={() => navigate('/account')}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-light)',
              cursor: 'pointer',
              flexShrink: 0,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="返回"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
            marginRight: '44px',
          }}>
            学习统计
          </h1>
        </div>
      </header>

      {/* ===== Tab Bar ===== */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px 0',
        maxWidth: '540px',
        margin: '0 auto',
        width: '100%',
      }}>
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--color-border-light)',
          borderRadius: 'var(--radius-md)',
          padding: '3px',
          gap: '2px',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 'var(--text-sm)',
                fontWeight: activeTab === tab.key ? 600 : 500,
                color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-text-secondary)',
                borderRadius: 'calc(var(--radius-md) - 3px)',
                border: 'none',
                background: activeTab === tab.key ? 'var(--color-surface)' : 'transparent',
                boxShadow: activeTab === tab.key ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background-color 0.2s, color 0.2s',
                fontFamily: 'inherit',
                textAlign: 'center',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Category Filter Bar ===== */}
      {categories.length > 0 && (
        <div style={{
          flexShrink: 0,
          padding: '10px 16px 6px',
          maxWidth: '540px',
          margin: '0 auto',
          width: '100%',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            position: 'relative',
          }}>
            {/* Scrollable tags */}
            <div style={{
              flex: 1,
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: '4px',
            }}
            onWheel={(e) => {
              e.currentTarget.scrollLeft += e.deltaY
            }}
            >
              {/* 全部 */}
              <button
                onClick={() => handleCategorySelect(null)}
                style={{
                  flexShrink: 0,
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '12px',
                  fontWeight: selectedCategoryId === null ? 600 : 500,
                  border: 'none',
                  background: selectedCategoryId === null ? 'var(--color-primary)' : 'var(--color-border-light)',
                  color: selectedCategoryId === null ? '#fff' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  fontFamily: 'inherit',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
              >
                全部
              </button>

              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '12px',
                    fontWeight: selectedCategoryId === cat.id ? 600 : 500,
                    border: 'none',
                    background: selectedCategoryId === cat.id ? 'var(--color-primary)' : 'var(--color-border-light)',
                    color: selectedCategoryId === cat.id ? '#fff' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    fontFamily: 'inherit',
                    transition: 'background-color 0.15s, color 0.15s',
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Dropdown button */}
            {showDropdownButton && (
              <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    background: 'var(--color-border-light)',
                    color: 'var(--color-text-secondary)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  ▼
                </button>

                {showDropdown && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: '36px',
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)',
                    border: '1px solid var(--color-border)',
                    zIndex: 30,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    minWidth: '120px',
                    padding: '4px 0',
                  }}>
                    <button
                      onClick={() => handleCategorySelect(null)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 14px',
                        border: 'none',
                        background: selectedCategoryId === null ? 'var(--color-primary-light)' : 'transparent',
                        color: selectedCategoryId === null ? 'var(--color-primary-dark)' : 'var(--color-text)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      全部
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => handleCategorySelect(cat.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '10px 14px',
                          border: 'none',
                          background: selectedCategoryId === cat.id ? 'var(--color-primary-light)' : 'transparent',
                          color: selectedCategoryId === cat.id ? 'var(--color-primary-dark)' : 'var(--color-text)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          touchAction: 'manipulation',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Card List Area ===== */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '8px 16px calc(20px + env(safe-area-inset-bottom, 0))',
        maxWidth: '540px',
        margin: '0 auto',
        width: '100%',
      }}
      onClick={closeSwipeMenu}
      >
        {/* Loading State */}
        {loading && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 16px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'var(--color-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}>
              <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-primary)' }}>
                <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>加载中...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && cards.length === 0 && (
          <div className="empty-state anim-slide-in-up">
            <div className="empty-state-icon anim-gentle-breathe">
              <span style={{ fontSize: '28px' }}>{getEmptyConfig().icon}</span>
            </div>
            <p className="empty-state-title">{getEmptyConfig().title}</p>
            <p className="empty-state-desc">{getEmptyConfig().desc}</p>
          </div>
        )}

        {/* Card List */}
        {!loading && cards.length > 0 && (
          <div className="anim-list-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cards.map((card) => {
              const cardId = getCardKey(card)
              const isFlipped = !!flippedIds[cardId]
              const isSwipedOpen = swipedId === cardId

              return (
                <div
                  key={cardId}
                  style={{ position: 'relative', overflow: 'hidden' }}
                >
                  {/* Action menu behind the card */}
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '160px',
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 0,
                  }}>
                    <button
                      onClick={(e) => handleDeleteCard(card, e)}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'var(--color-danger)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        touchAction: 'manipulation',
                        fontFamily: 'inherit',
                        padding: '8px 4px',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      删除
                    </button>

                    {/* Bookmark toggle */}
                    <BookmarkActionBtn
                      cardId={getCardId(card)}
                      onToggle={handleToggleBookmarkInline}
                    />

                    <button
                      onClick={(e) => handleViewCategory(card, e)}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'var(--color-primary)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        touchAction: 'manipulation',
                        fontFamily: 'inherit',
                        padding: '8px 4px',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      查看分类
                    </button>
                  </div>

                  {/* Swipeable Card */}
                  <div
                    data-card-id={cardId}
                    onTouchStart={(e) => handleTouchStart(e, cardId)}
                    onTouchMove={(e) => handleTouchMove(e, cardId)}
                    onTouchEnd={(e) => handleTouchEnd(e, cardId)}
                    style={{
                      position: 'relative',
                      backgroundColor: 'var(--color-surface)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-sm)',
                      border: '1px solid var(--color-border-light)',
                      zIndex: 1,
                      touchAction: 'pan-y',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      transform: isSwipedOpen ? 'translateX(-160px)' : '',
                      transition: isSwipedOpen ? '' : 'transform 0.25s ease',
                      perspective: '1000px',
                    }}
                  >
                    {/* 3D flip inner */}
                    <FlipCard
                      isFlipped={isFlipped}
                      front={
                        <div style={{
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}>
                          {/* Top row: status badge + category name */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}>
                            {activeTab !== 'bookmarks' && statusBadge(card.status)}
                            {card.categoryName && (
                              <span style={{
                                fontSize: '10px',
                                color: 'var(--color-text-muted)',
                                backgroundColor: 'var(--color-border-light)',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-full)',
                                flexShrink: 0,
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {card.categoryName}
                              </span>
                            )}
                          </div>

                          {/* Front text */}
                          <div style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 700,
                            color: 'var(--color-text)',
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                          }}>
                            {card.front || '(空白卡片)'}
                          </div>

                          {/* Unit name */}
                          {card.unitName && (
                            <div style={{
                              fontSize: '11px',
                              color: 'var(--color-text-muted)',
                            }}>
                              {card.unitName}
                            </div>
                          )}

                          {/* Tap hint */}
                          <div style={{
                            fontSize: '10px',
                            color: 'var(--color-text-muted)',
                            textAlign: 'right',
                          }}>
                            点击翻转查看答案
                          </div>
                        </div>
                      }
                      back={
                        <div style={{
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          height: '100%',
                        }}>
                          <div style={{
                            fontSize: '11px',
                            color: 'var(--color-text-muted)',
                            fontWeight: 600,
                            marginBottom: '2px',
                          }}>
                            答案
                          </div>
                          <div style={{
                            fontSize: 'var(--text-sm)',
                            color: 'var(--color-text)',
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                            flex: 1,
                          }}>
                            {card.back || '(无答案)'}
                          </div>
                          <div style={{
                            fontSize: '10px',
                            color: 'var(--color-text-muted)',
                            textAlign: 'right',
                          }}>
                            点击翻转查看问题
                          </div>
                        </div>
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="确认删除"
          message="确认删除这张卡片吗？此操作无法撤销。"
          danger
          confirmText="确认删除"
          onConfirm={async () => {
            const { cardId, catId } = confirmDelete
            setConfirmDelete(null)
            try {
              await db.deleteCard(cardId, catId || undefined)
              setCards(prev => prev.filter(c => (c.cardId || c.id) !== cardId))
              showToast('已删除卡片')
            } catch (error) {
              showToast('删除失败', 'error')
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// =========================================================
// Sub-component: FlipCard with CSS 3D transform
// =========================================================
function FlipCard({ isFlipped, front, back }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: '100px',
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        minHeight: '100px',
        transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        transformStyle: 'preserve-3d',
        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        {/* Front */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          borderRadius: 'var(--radius-lg)',
        }}>
          {front}
        </div>

        {/* Back */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: 'var(--radius-lg)',
        }}>
          {back}
        </div>

        {/* Invisible spacer to maintain height */}
        <div style={{ visibility: 'hidden', minHeight: '100px' }}>
          {front}
        </div>
      </div>
    </div>
  )
}

// =========================================================
// Sub-component: Bookmark action button with async state
// =========================================================
function BookmarkActionBtn({ cardId, onToggle }) {
  const [isBm, setIsBm] = useState(null)

  useEffect(() => {
    let cancelled = false
    db.isBookmarked(cardId).then(val => {
      if (!cancelled) setIsBm(val)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [cardId])

  if (isBm === null) return (
    <button style={{
      flex: 1,
      border: 'none',
      background: 'var(--color-border-light)',
      color: 'var(--color-text-muted)',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'default',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      touchAction: 'manipulation',
      fontFamily: 'inherit',
      padding: '8px 4px',
    }}>
      <span>...</span>
    </button>
  )

  return (
    <button
      onClick={(e) => onToggle(isBm, cardId, e)}
      style={{
        flex: 1,
        border: 'none',
        background: isBm ? 'var(--color-warning)' : 'var(--color-accent)',
        color: '#fff',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        touchAction: 'manipulation',
        fontFamily: 'inherit',
        padding: '8px 4px',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={isBm ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      {isBm ? '取消收藏' : '收藏'}
    </button>
  )
}