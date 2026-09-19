import { useState, useMemo, useEffect } from 'react'

export default function DuplicateCardConfirm({
  visible,
  duplicateCards = [],
  newCards = [],
  onCancel,
  onConfirm,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState('duplicate')
  const [selectedIds, setSelectedIds] = useState(new Set())

  const allDuplicateIds = useMemo(() => {
    return new Set(duplicateCards.map((c, i) => `dup_${i}`))
  }, [duplicateCards])

  const allNewIds = useMemo(() => {
    return new Set(newCards.map((c, i) => `new_${i}`))
  }, [newCards])

  useEffect(() => {
    if (visible && duplicateCards.length > 0) {
      setSelectedIds(new Set(duplicateCards.map((_, i) => `dup_${i}`)))
    } else if (!visible) {
      setSelectedIds(new Set())
    }
  }, [visible, duplicateCards])

  const toggleCardSelection = (cardId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const toggleAllSelection = () => {
    if (activeTab === 'duplicate') {
      if (allDuplicateIds.size > 0 && allDuplicateIds.every(id => selectedIds.has(id))) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          allDuplicateIds.forEach(id => next.delete(id))
          return next
        })
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          allDuplicateIds.forEach(id => next.add(id))
          return next
        })
      }
    } else {
      if (allNewIds.size > 0 && allNewIds.every(id => selectedIds.has(id))) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          allNewIds.forEach(id => next.delete(id))
          return next
        })
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          allNewIds.forEach(id => next.add(id))
          return next
        })
      }
    }
  }

  const handleConfirm = () => {
    const excludedDuplicates = duplicateCards.filter((_, i) => selectedIds.has(`dup_${i}`))
    const includedNewCards = newCards.filter((_, i) => !selectedIds.has(`new_${i}`))
    onConfirm?.(excludedDuplicates, includedNewCards)
  }

  const duplicateSelectedCount = useMemo(() => {
    return duplicateCards.filter((_, i) => selectedIds.has(`dup_${i}`)).length
  }, [duplicateCards, selectedIds])

  const newSelectedCount = useMemo(() => {
    return newCards.filter((_, i) => selectedIds.has(`new_${i}`)).length
  }, [newCards, selectedIds])

  if (!visible) return null

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div
        className="dialog"
        style={{
          maxWidth: 420,
          width: '90%',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--color-warning-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>检测到重复卡片</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>请选择需要处理的卡片</p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            background: 'var(--color-border-light)',
            marginBottom: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('duplicate')}
            style={{
              flex: 1,
              minHeight: 44,
              padding: '0 8px',
              fontSize: 13,
              fontWeight: activeTab === 'duplicate' ? 700 : 500,
              border: 'none',
              borderRadius: 0,
              background: activeTab === 'duplicate' ? 'var(--color-warning)' : 'transparent',
              color: activeTab === 'duplicate' ? '#fff' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span>重复卡片</span>
            <span
              style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 10,
                background: activeTab === 'duplicate' ? 'rgba(255,255,255,0.3)' : 'var(--color-border)',
                color: activeTab === 'duplicate' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {duplicateCards.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            style={{
              flex: 1,
              minHeight: 44,
              padding: '0 8px',
              fontSize: 13,
              fontWeight: activeTab === 'new' ? 700 : 500,
              border: 'none',
              borderRadius: 0,
              background: activeTab === 'new' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'new' ? '#fff' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span>新卡片</span>
            <span
              style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 10,
                background: activeTab === 'new' ? 'rgba(255,255,255,0.3)' : 'var(--color-border)',
                color: activeTab === 'new' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {newCards.length}
            </span>
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 4px',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {activeTab === 'duplicate'
                ? `已勾选 ${duplicateSelectedCount}/${duplicateCards.length} 张（默认全部取消构建）`
                : `已勾选 ${newSelectedCount}/${newCards.length} 张（默认全部保留构建）`}
            </span>
            <button
              type="button"
              onClick={toggleAllSelection}
              disabled={activeTab === 'duplicate' ? duplicateCards.length === 0 : newCards.length === 0}
              style={{
                fontSize: 12,
                color: 'var(--color-primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              {activeTab === 'duplicate'
                ? (duplicateSelectedCount === duplicateCards.length ? '取消全选' : '全选')
                : (newSelectedCount === newCards.length ? '取消全选' : '全选')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeTab === 'duplicate' ? (
              duplicateCards.map((card, index) => {
                const cardId = `dup_${index}`
                const isSelected = selectedIds.has(cardId)
                return (
                  <div
                    key={cardId}
                    style={{
                      padding: 12,
                      background: 'var(--color-border-light)',
                      borderRadius: 8,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <button
                      className={`card-selection-checkbox${isSelected ? ' card-selection-checkbox-active' : ''}`}
                      onClick={() => toggleCardSelection(cardId)}
                      style={{
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>新卡片：</span>
                        <span style={{ color: 'var(--color-text)' }}>{card.front}</span>
                      </div>
                      {card.similarTo && (
                        <div>
                          <span style={{ color: 'var(--color-text-secondary)' }}>相似卡片：</span>
                          <span style={{ color: 'var(--color-danger)' }}>{card.similarTo}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              newCards.map((card, index) => {
                const cardId = `new_${index}`
                const isSelected = selectedIds.has(cardId)
                return (
                  <div
                    key={cardId}
                    style={{
                      padding: 12,
                      background: 'var(--color-border-light)',
                      borderRadius: 8,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <button
                      className={`card-selection-checkbox${isSelected ? ' card-selection-checkbox-active' : ''}`}
                      onClick={() => toggleCardSelection(cardId)}
                      style={{
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>题目：</span>
                        <span style={{ color: 'var(--color-text)' }}>{card.front}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>答案：</span>
                        <span style={{ color: 'var(--color-text)' }}>{card.back}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="dialog-actions">
          <button
            onClick={onBack}
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 44 }}
          >
            ← 上一步
          </button>
          <button
            onClick={onCancel}
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 44 }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="btn btn-primary btn-sm"
            style={{ minHeight: 44 }}
          >
            确认构建
          </button>
        </div>
      </div>
    </div>
  )
}