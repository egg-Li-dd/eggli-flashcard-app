import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getCardsByUnit } from '../services/db'
import CardItem from './CardItem'
import { downloadUnitExcel, downloadUnitTemplate, parseExcelFile } from '../utils/excelParser'

export default function UnitGroup({
  unit, categoryId, bookmarks, onDeleteCard, onBookmarkCard, onMoveCard,
  forceCollapsed, forceExpanded,
  selectionMode, selectedIds, onToggleSelect,
  showUnitSelectionControls = false, unitAllSelected = false, unitPartSelected = false,
  onToggleUnitSelectAll, onInvertUnitSelection,
  onCardLongPress, onCardTouchStart, onCardTouchEnd, onCardTouchMove, onCardClick,
  apiKey, aiServiceMode, model, summaryLevel, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey,
  actions, cardsRefreshKey = 0,
  highlighted = false,
  onHighlightEnd,
  onMoveUnit, onRenameUnit, onDeleteUnit,
  onImportCards,
}) {
  const [expanded, setExpanded] = useState(false)
  const [cards, setCards] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showHighlight, setShowHighlight] = useState(false)
  const longPressTimerRef = useRef(null)
  const [isLongPress, setIsLongPress] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const menuButtonRef = useRef(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  // 折叠状态同步
  useEffect(() => {
    if (forceCollapsed !== undefined) {
      setExpanded(!forceCollapsed)
    }
  }, [forceCollapsed])

  // 强制展开同步
  useEffect(() => {
    if (forceExpanded === true) {
      setExpanded(true)
    }
  }, [forceExpanded])

  // 导航高亮动画
  useEffect(() => {
    if (highlighted) {
      setShowHighlight(true)
      const timer = setTimeout(() => {
        setShowHighlight(false)
        onHighlightEnd?.()
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [highlighted, onHighlightEnd])

  // [FIX #310] 以 unit.id + cardsRefreshKey 作为依赖，父级生成卡片后触发刷新
  useEffect(() => {
    if (!unit?.id) return
    getCardsByUnit(unit.id).then((list) => {
      setCards(list)
    })
  }, [unit.id, refreshKey, cardsRefreshKey])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!showMenu || !menuRef.current) return
      // 点击菜单按钮本身不关闭——由按钮的 onClick 控制开关
      if (menuButtonRef.current && menuButtonRef.current.contains(e.target)) return
      if (!menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showMenu])

  const refreshCards = async () => {
    const updated = await getCardsByUnit(unit.id)
    setCards(updated)
  }

  const handleDelete = (cardId) => {
    if (onDeleteCard) {
      // 支持 cardId 字符串或 card 对象两种参数形式
      const cardObj = typeof cardId === 'string' ? { id: cardId } : cardId
      onDeleteCard(cardObj, categoryId)
    }
  }

  const handleBookmark = (cardId, newVal) => {
    if (onBookmarkCard) {
      onBookmarkCard(cardId, newVal)
    }
  }

  const handleMove = (cardId) => {
    if (onMoveCard) {
      // 支持 cardId 字符串或 card 对象两种参数形式
      const cardObj = typeof cardId === 'string' ? { id: cardId } : cardId
      onMoveCard(cardObj)
    }
  }

  const handleUpdated = async () => {
    await refreshCards()
  }

  const handleTouchStart = (e) => {
    if (showMenu) return
    const target = e.target
    let isActionBtn = false
    let tempTarget = target
    while (tempTarget) {
      if (tempTarget.dataset && tempTarget.dataset.actionBtn) {
        isActionBtn = true
        break
      }
      if (tempTarget.classList && (tempTarget.classList.contains('unit-actions') || tempTarget.classList.contains('unit-group-selection-controls'))) {
        isActionBtn = true
        break
      }
      tempTarget = tempTarget.parentElement
    }
    if (isActionBtn) return
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPress(true)
      if (onDeleteUnit) {
        const confirmed = window.confirm(`确定删除单元「${unit.name}」及其所有卡片吗？`)
        if (confirmed) {
          onDeleteUnit(unit.id)
        }
      }
    }, 500)
  }

  const handleTouchEnd = (e) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    const target = e.target
    let isActionBtn = false
    let tempTarget = target
    while (tempTarget) {
      if (tempTarget.dataset && tempTarget.dataset.actionBtn) {
        isActionBtn = true
        break
      }
      if (tempTarget.classList && (tempTarget.classList.contains('unit-actions') || tempTarget.classList.contains('unit-group-selection-controls'))) {
        isActionBtn = true
        break
      }
      tempTarget = tempTarget.parentElement
    }
    if (!isActionBtn && !isLongPress) {
      setExpanded((prev) => !prev)
    }
    setIsLongPress(false)
  }

  const handleTouchMove = (e) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    setIsLongPress(false)
  }

  // 简单 Toast 通知
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => {
      setToast(null)
      toastTimer.current = null
    }, 4000)
  }, [])

  return (
    <div
      style={{
        marginBottom: '16px',
        borderRadius: 'var(--radius-lg)',
        transition: 'box-shadow 0.3s ease, background-color 0.3s ease',
        boxShadow: showHighlight
          ? '0 0 0 3px #fbbf24, 0 0 20px rgba(251, 191, 36, 0.3)'
          : 'none',
        backgroundColor: showHighlight ? '#fffef5' : 'transparent',
      }}
      data-unit-id={unit.id}>
      <div
        onClick={(e) => {
          let target = e.target
          while (target) {
            if (target.dataset && target.dataset.actionBtn) {
              return
            }
            if (target.classList && (target.classList.contains('unit-actions') || target.classList.contains('unit-group-selection-controls'))) {
              return
            }
            if (target === e.currentTarget) break
            target = target.parentElement
          }
          if (!isLongPress) {
            setExpanded((prev) => !prev)
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className="btn btn-secondary btn-block"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((prev) => !prev) }}
        style={{
          justifyContent: 'space-between',
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <span className="section-title" style={{ marginBottom: 0, color: 'var(--color-text)', fontSize: 'var(--text-sm)' }}>
            {unit.name}
          </span>
          <span className="badge badge-primary">{cards.length} 张</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, pointerEvents: 'auto' }}>
          {showUnitSelectionControls && selectionMode && (
            <div className="unit-group-selection-controls" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', zIndex: 10 }}>
              <button
                type="button"
                className={'unit-group-selection-btn' + (unitAllSelected ? ' unit-group-selection-btn-active' : '') + (unitPartSelected ? ' unit-group-selection-btn-partial' : '')}
                data-action-btn="select-all"
                onClick={() => onToggleUnitSelectAll?.(unit.id, cards)}
                disabled={cards.length === 0}
              >
                {unitAllSelected ? '取消' : '全选'}
              </button>
              <button
                type="button"
                className="unit-group-selection-btn"
                data-action-btn="invert"
                onClick={() => onInvertUnitSelection?.(unit.id, cards)}
                disabled={cards.length === 0}
              >
                反选
              </button>
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative', zIndex: 10 }}>
            {actions}
          </div>
          <div className="unit-actions" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', zIndex: 10 }}>
            <button
              type="button"
              ref={menuButtonRef}
              className="btn btn-xs btn-outline"
              data-action-btn="menu"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(o => !o)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
              }}
              onTouchEnd={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setShowMenu(o => !o)
              }}
              style={{ 
                padding: '8px 16px', 
                fontSize: '16px', 
                touchAction: 'manipulation', 
                position: 'relative', 
                zIndex: 100,
                minWidth: '44px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto'
              }}
            >
              ⋮
            </button>
            {showMenu && createPortal(
              <>
                <div
                  style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    backgroundColor: 'rgba(0,0,0,0.3)',
                  }}
                  onClick={() => setShowMenu(false)}
                />
                <div
                  ref={menuRef}
                  style={{
                    position: 'fixed',
                    left: '50%', top: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    minWidth: '280px',
                    maxWidth: 'calc(100vw - 40px)',
                    zIndex: 9999,
                    overflow: 'hidden',
                    border: '1px solid #E2E8F0',
                    maxHeight: 'calc(100vh - 120px)',
                    overflowY: 'auto',
                  }}
                >
                {onRenameUnit && (
                  <button
                    type="button"
                    onClick={() => {
                      onRenameUnit(unit.id)
                      setShowMenu(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: '#1E293B',
                      fontSize: '15px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>✏️</span> 编辑名称
                  </button>
                )}
                {onMoveUnit && (
                  <button
                    type="button"
                    onClick={() => {
                      onMoveUnit(unit.id)
                      setShowMenu(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: '#1E293B',
                      fontSize: '15px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>📤</span> 移动单元
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setShowMenu(false)
                    showToast('正在生成导出文件…', 'success')
                    try {
                      const result = await downloadUnitExcel(cards, { name: unit.name })
                      showToast(result?.message || '导出完成', 'success')
                    } catch (e) {
                      showToast('导出失败：' + (e.message || '未知错误'), 'error')
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: '#1E293B',
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>📥</span> 导出单元
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowMenu(false)
                    showToast('正在生成导入模板…', 'success')
                    try {
                      const result = await downloadUnitTemplate({ name: unit.name })
                      showToast(result?.message || '模板已生成', 'success')
                    } catch (e) {
                      showToast('模板生成失败：' + (e.message || '未知错误'), 'error')
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: '#1E293B',
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>📋</span> 下载模板
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showToast('请选择 Excel 文件（.xlsx/.xls）', 'success')
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.xlsx,.xls'
                    input.style.display = 'none'
                    document.body.appendChild(input)
                    input.onchange = async (e) => {
                      document.body.removeChild(input)
                      const file = e.target?.files?.[0]
                      if (!file) return
                      try {
                        const result = await parseExcelFile(file)
                        if (result.success && result.cards.length > 0) {
                          await onImportCards?.(unit.id, result.cards)
                        } else {
                          showToast('文件中未识别到有效卡片数据，请检查格式。', 'error')
                        }
                      } catch (err) {
                        showToast('导入失败：' + err.message, 'error')
                      }
                    }
                    input.click()
                    setShowMenu(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: '#1E293B',
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>📥</span> 导入卡片
                </button>
                {onDeleteUnit && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteUnit(unit.id)
                      setShowMenu(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: '#EF4444',
                      fontSize: '15px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '4px',
                      borderTop: '1px solid #E2E8F0',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>🗑️</span> 删除单元
                  </button>
                )}
                </div>
              </>,
              document.body
            )}
          </div>
          <svg
            style={{
              width: '18px',
              height: '18px',
              color: 'var(--color-text-secondary)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s ease',
              flexShrink: 0,
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {cards.length > 0 ? (
            cards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                categoryId={categoryId}
                bookmarked={bookmarks && bookmarks[card.id]}
                onDelete={handleDelete}
                onBookmark={handleBookmark}
                onMove={handleMove}
                onUpdated={handleUpdated}
                selectionMode={selectionMode}
                selected={selectedIds && selectedIds.has(card.id)}
                onToggleSelect={onToggleSelect}
                onCardLongPress={onCardLongPress}
                onCardTouchStart={onCardTouchStart}
                onCardTouchEnd={onCardTouchEnd}
                onCardTouchMove={onCardTouchMove}
                onCardClick={onCardClick}
                apiKey={apiKey}
                aiServiceMode={aiServiceMode}
                model={model}
                summaryLevel={summaryLevel}
                sparkApiKey={sparkApiKey}
                sparkApiSecret={sparkApiSecret}
                volcanoApiKey={volcanoApiKey}
                dashscopeApiKey={dashscopeApiKey}
              />
            ))
          ) : (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg style={{ width: '32px', height: '32px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="empty-state-title">暂无卡片</div>
                <div className="empty-state-desc">此单元下还没有学习卡片</div>
              </div>
            </div>
          )}
        </div>
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '120px', left: '16px', right: '16px',
          zIndex: 100000,
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: toast.type === 'error' ? 'var(--color-danger)' : '#065f46',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          textAlign: 'center',
          maxWidth: '400px',
          margin: '0 auto',
          pointerEvents: 'none',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
