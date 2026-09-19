import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import * as aiService from '../services/aiService'
import * as db from '../services/db'
import MathText from './MathText'

/**
 * 卡片组件
 * props.variant: 'compact' (分类页列表项) | 'large' (背诵页大图)
 *   compact - 显示翻转和操作菜单，用作列表项
 *   large   - 背诵页大卡片，显示 3D 翻转效果
 */
export default function CardItem({
  card,
  categoryId,
  bookmarked: propBookmarked,
  onBookmark,
  onDelete,
  onMove,
  onUpdated,
  variant = 'compact',
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onCardLongPress,
  onCardTouchStart,
  onCardTouchEnd,
  onCardTouchMove,
  onCardClick,
  apiKey,
  aiServiceMode,
  model,
  summaryLevel,
  sparkApiKey,
  sparkApiSecret,
  volcanoApiKey,
  dashscopeApiKey,
}) {
  // 安全：对 card 做防御性处理，保证 front/back 始终为非空字符串
  const safeCard = (card && typeof card === 'object')
    ? {
        ...card,
        front: typeof card.front === 'string' && card.front.trim() ? card.front : '（空问题）',
        back: typeof card.back === 'string' && card.back.trim() ? card.back : '（空答案）',
        knowledge_point: typeof card.knowledge_point === 'string' && card.knowledge_point.trim() ? card.knowledge_point : null,
      }
    : { id: null, front: '（空问题）', back: '（空答案）', knowledge_point: null }

  const [flipped, setFlipped] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showKnowledgePoint, setShowKnowledgePoint] = useState(false)

  // [FIX v2.34] 使用 useState + useEffect 实现乐观更新：本地状态优先响应，props同步保持一致
  const [bookmarked, setBookmarked] = useState(!!propBookmarked)

  useEffect(() => {
    // 只有当 prop 与本地状态不一致时才同步（避免覆盖乐观更新期间的异步竞态）
    if (propBookmarked !== bookmarked) {
      setBookmarked(!!propBookmarked)
    }
  }, [propBookmarked])

  // 阻止长按/右键弹出文本选择菜单
  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    const isEditable =
      tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)
    if (!isEditable && e && e.preventDefault) e.preventDefault()
  }

  // 翻转卡片 - 阻止按钮区点击冒泡
  const handleFlip = (e) => {
    // 如果点击的是操作按钮区，不翻转
    if (e && e.currentTarget !== e.target) {
      const closestBtn = e.target.closest('[data-action-btn]')
      if (closestBtn) return
    }
    setFlipped((f) => !f)
  }

  // compact 形态：卡片点击处理
  const handleCompactClick = (e) => {
    if (selectionMode) {
      e.stopPropagation()
      if (onToggleSelect) onToggleSelect(safeCard.id)
      return
    }
    // 非多选模式：走原有翻转逻辑（onCardClick 仅作为多选专用的切换回调，此处不触发）
    handleFlip(e)
  }

  // 操作按钮点击 - 阻止冒泡避免触发翻转
  const handleMenuClick = (e) => {
    if (e) {
      e.stopPropagation()
    }
    setMenuOpen((m) => !m)
  }

  const handleBookmark = async (e) => {
    if (e) e.stopPropagation()
    const newVal = !bookmarked
    // 1. 乐观更新：立即更新UI，不等待异步操作
    setBookmarked(newVal)
    // 2. 关闭菜单
    setMenuOpen(false)
    // 3. 异步写入数据库并通知父组件
    try {
      if (newVal) {
        await db.addBookmark(safeCard.id)
      } else {
        await db.removeBookmark(safeCard.id)
      }
      if (onBookmark) {
        await onBookmark(safeCard.id, newVal)
      }
    } catch (err) {
      console.error('收藏失败:', err)
      // 数据库操作失败时回滚本地状态
      setBookmarked(!newVal)
    }
  }

  const handleDelete = (e) => {
    if (e) e.stopPropagation()
    if (!onDelete) return
    // 先关闭菜单，再通知父组件（避免异步等待导致的无响应感）
    setMenuOpen(false)
    onDelete(safeCard.id)
  }

  const handleMove = (e) => {
    if (e) e.stopPropagation()
    if (!onMove) return
    // 先关闭菜单，再通知父组件
    setMenuOpen(false)
    onMove(safeCard.id)
  }

  const handleSaveEdit = async (patch) => {
    try {
      const updated = await db.updateCard(safeCard.id, patch)
      if (onUpdated) onUpdated(updated)
      setEditOpen(false)
    } catch (err) {
      console.error('保存卡片失败:', err)
      alert('保存失败，请重试')
    }
  }

  const handleRegenerate = async () => {
    const kpTextarea = document.querySelector('[data-edit-field="knowledge_point"]')
    const kp = kpTextarea ? kpTextarea.value : (safeCard.knowledge_point || '')
    if (!kp || !kp.trim()) {
      alert('请先填写原始知识点')
      return
    }
    setRegenerating(true)
    try {
      const result = await aiService.regenerateCard(
        kp.trim(),
        apiKey,
        aiServiceMode,
        model,
        sparkApiKey,
        sparkApiSecret,
        volcanoApiKey,
        dashscopeApiKey,
        summaryLevel,
      )
      const frontEl = document.querySelector('[data-edit-field="front"]')
      const backEl = document.querySelector('[data-edit-field="back"]')
      if (frontEl && result && result.front) frontEl.value = result.front
      if (backEl && result && result.back) backEl.value = result.back
    } catch (err) {
      console.error('AI 重新生成失败:', err)
      alert('AI 重新生成失败：' + (err?.message || '未知错误'))
    } finally {
      setRegenerating(false)
    }
  }

  const EditCardDialog = (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
          paddingTop: 'env(safe-area-inset-top, 44px)',
          paddingBottom: 'env(safe-area-inset-bottom, 100px)',
        }}
        onClick={() => setEditOpen(false)}
      />
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '16px',
          paddingTop: 'calc(env(safe-area-inset-top, 44px) + 20px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)',
          pointerEvents: 'none',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 420,
            maxHeight: 'calc(100vh - env(safe-area-inset-top, 44px) - env(safe-area-inset-bottom, 0px) - 160px)',
            overflowY: 'auto',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 16,
            padding: '20px',
            paddingBottom: '30px',
            pointerEvents: 'auto',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{
            fontSize: 18, fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0, marginBottom: 16,
          }}>编辑卡片</h3>

          <label style={{
            display: 'block',
            fontSize: 13, fontWeight: 500,
            color: 'var(--color-text-secondary)',
            marginBottom: 6,
          }}>原始知识点</label>
          <textarea
            defaultValue={safeCard.knowledge_point || ''}
            placeholder="请填写卡片对应的核心知识点内容，AI 将基于此重新生成问题和答案"
            data-edit-field="knowledge_point"
            style={{
              width: '100%', minHeight: 110,
              padding: '10px 12px',
              fontSize: 14,
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-text)',
              resize: 'vertical',
              boxSizing: 'border-box',
              lineHeight: 1.55,
            }}
          />

          <button
            onClick={(e) => {
              if (e) e.stopPropagation()
              handleRegenerate()
            }}
            style={{
              width: '100%', minHeight: 44,
              marginTop: 12, marginBottom: 20,
              padding: '10px 16px', borderRadius: 10,
              border: '1px solid var(--color-primary)',
              backgroundColor: regenerating ? 'var(--color-primary-light)' : 'var(--color-primary)',
              color: '#fff',
              fontSize: 14, fontWeight: 500, cursor: regenerating ? 'wait' : 'pointer',
              opacity: regenerating ? 0.7 : 1,
            }}
          >
            {regenerating ? 'AI 正在生成中...' : '根据知识点重新生成问题和答案'}
          </button>

          <label style={{
            display: 'block',
            fontSize: 13, fontWeight: 500,
            color: 'var(--color-text-secondary)',
            marginBottom: 6,
          }}>问题</label>
          <textarea
            defaultValue={safeCard.front}
          data-edit-field="front"
            style={{
              width: '100%', minHeight: 96,
              padding: '10px 12px',
              fontSize: 15,
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-text)',
              resize: 'vertical',
              boxSizing: 'border-box',
              lineHeight: 1.55,
            }}
          />

          <label style={{
            display: 'block',
            fontSize: 13, fontWeight: 500,
            color: 'var(--color-text-secondary)',
            marginBottom: 6,
            marginTop: 16,
          }}>答案</label>
          <textarea
            defaultValue={safeCard.back}
            data-edit-field="back"
            style={{
              width: '100%', minHeight: 140,
              padding: '10px 12px',
              fontSize: 15,
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-text)',
              resize: 'vertical',
              boxSizing: 'border-box',
              lineHeight: 1.55,
            }}
          />

          <div style={{
            display: 'flex', gap: 8,
            marginTop: 20,
          }}>
            <button
              onClick={() => setEditOpen(false)}
              style={{
                flex: 1, minHeight: 44,
                padding: '10px 16px', borderRadius: 10,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: 15, fontWeight: 500, cursor: 'pointer',
              }}
            >取消</button>
            <button
              onClick={(e) => {
                if (e) e.stopPropagation()
                const root = e.currentTarget.closest('div[data-edit-root]') || e.currentTarget.parentElement.parentElement
                const kpEl = document.querySelector('[data-edit-field="knowledge_point"]')
                const frontEl = document.querySelector('[data-edit-field="front"]')
                const backEl = document.querySelector('[data-edit-field="back"]')
                const newKp = kpEl ? kpEl.value : ''
                const newFront = frontEl ? frontEl.value : ''
                const newBack = backEl ? backEl.value : ''
                handleSaveEdit({
                  knowledge_point: newKp || null,
                  front: newFront,
                  back: newBack,
                })
              }}
              data-edit-root
              style={{
                flex: 1, minHeight: 44,
                padding: '10px 16px', borderRadius: 10,
                border: '1px solid var(--color-primary)',
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                fontSize: 15, fontWeight: 500, cursor: 'pointer',
              }}
            >保存</button>
          </div>
        </div>
      </div>
    </>
  )

  // ==================== 背诵页大卡片 (large) ====================

  if (variant === 'large') {
    return (
      <>
      <div
        className="card-flip-container"
        style={{
          minHeight: 'clamp(280px, 50vh, 420px)',   /* D-9：响应式高度 */
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          perspective: '1500px',
        }}
        onClick={handleFlip}
        onContextMenu={preventTextMenu}
        
      >
        <div
          className={`card-flip-inner ${flipped ? 'flipped' : ''}`}
          style={{
            position: 'relative',
            width: '100%',
            minHeight: 'clamp(280px, 50vh, 420px)',
            transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* 正面 */}
          <div
            className="card-flip-front"
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* 顶部: 标题 + 操作按钮 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', gap: '12px', minWidth: 0 }}>
              <div
                data-action-btn
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  backgroundColor: flipped ? 'var(--color-primary-light)' : 'var(--color-border-light)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  minWidth: 0,
                  flexShrink: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 'calc(100% - 104px)',
                }}
              >
                {flipped ? '答案' : '问题'}
              </div>

              {/* 右上角操作按钮 - 固定 44x44px 点击区 */}
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }} data-action-btn>
                <button
                  onClick={handleBookmark}
                  aria-label={bookmarked ? '取消收藏' : '收藏'}
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bookmarked ? 'var(--color-accent-light)' : 'transparent',
                    border: '1px solid var(--color-border-light)',
                    cursor: 'pointer',
                    color: bookmarked ? 'var(--color-accent-dark)' : 'var(--color-text-secondary)',
                    transition: 'transform 0.12s ease, background-color 0.15s ease',
                  }}
                  /* O-4：收藏按钮 active 反馈 */
                  onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.88)' }}
                  onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.88)' }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                >
                  {bookmarked ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={handleMenuClick}
                  aria-label="更多操作"
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-border-light)',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 卡片正文 */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                padding: '16px 8px',
              }}
            >
              <p style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--color-text)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <MathText>{safeCard.front}</MathText>
              </p>
            </div>
            {safeCard.knowledge_point && (
              <div style={{
                textAlign: 'center', padding: '0 8px 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <span style={{ fontWeight: 600 }}>知识点：</span><MathText>{safeCard.knowledge_point}</MathText>
              </div>
            )}

            {/* 底部提示 */}
            <div style={{ textAlign: 'center', paddingTop: '12px' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                点击卡片查看答案
              </p>
            </div>
          </div>

          {/* 背面 */}
          <div
            className="card-flip-back"
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              transform: 'rotateY(180deg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', gap: '12px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary-dark)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                答案
              </div>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }} data-action-btn>
                <button
                  onClick={handleBookmark}
                  aria-label={bookmarked ? '取消收藏' : '收藏'}
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bookmarked ? 'var(--color-accent-light)' : 'transparent',
                    border: '1px solid var(--color-border-light)',
                    cursor: 'pointer',
                    color: bookmarked ? 'var(--color-accent-dark)' : 'var(--color-text-secondary)',
                  }}
                >
                  {bookmarked ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleMenuClick}
                  aria-label="更多操作"
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-border-light)',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                padding: '16px 8px',
              }}
            >
              <p style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 500,
                color: 'var(--color-text)',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <MathText>{safeCard.back}</MathText>
              </p>
            </div>
            {safeCard.knowledge_point && (
              <div style={{
                textAlign: 'center', padding: '0 8px 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <span style={{ fontWeight: 600 }}>知识点：</span><MathText>{safeCard.knowledge_point}</MathText>
              </div>
            )}

            <div style={{ textAlign: 'center', paddingTop: '12px' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                点击卡片返回问题
              </p>
            </div>
          </div>
        </div>
      </div>

       {menuOpen && createPortal(
        <div
          className={'card-menu-overlay' + (menuOpen ? ' card-menu-overlay--open' : '')}
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="card-menu-panel"
            onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{
                fontSize: 16, fontWeight: 600,
                color: 'var(--color-text)',
                margin: '0 0 16px 0',
              }}>卡片操作</h3>

              <button
                onClick={handleBookmark}
                style={{
                  width: '100%', minHeight: 52, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'transparent', border: 'none',
                  borderRadius: 10, cursor: 'pointer',
                  color: 'var(--color-text)',
                  fontSize: 15, fontWeight: 500, textAlign: 'left',
                  marginBottom: 8, touchAction: 'manipulation',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: 'var(--color-accent-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-accent-dark)', flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </span>
                {bookmarked ? '取消收藏' : '收藏卡片'}
              </button>

              {onMove && (
                <button
                  onClick={handleMove}
                  style={{
                    width: '100%', minHeight: 52, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'transparent', border: 'none',
                    borderRadius: 10, cursor: 'pointer',
                    color: 'var(--color-text)',
                    fontSize: 15, fontWeight: 500, textAlign: 'left',
                    marginBottom: 8, touchAction: 'manipulation',
                  }}
                >
                  <span style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: 'var(--color-primary-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-primary-dark)', flexShrink: 0,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                  </span>
                  移动到其他分类
                </button>
              )}

              <button
                onClick={(e) => {
                  if (e) e.stopPropagation()
                  setMenuOpen(false)
                  setEditOpen(true)
                }}
                style={{
                  width: '100%', minHeight: 52, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'transparent', border: 'none',
                  borderRadius: 10, cursor: 'pointer',
                  color: 'var(--color-text)',
                  fontSize: 15, fontWeight: 500, textAlign: 'left',
                  marginBottom: 8, touchAction: 'manipulation',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: 'var(--color-primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-primary-dark)', flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </span>
                编辑问题和答案
              </button>

              {safeCard.knowledge_point && (
                <button
                  onClick={(e) => {
                    if (e) e.stopPropagation()
                    setMenuOpen(false)
                    setShowKnowledgePoint(true)
                  }}
                  style={{
                    width: '100%', minHeight: 52, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'transparent', border: 'none',
                    borderRadius: 10, cursor: 'pointer',
                    color: 'var(--color-text)',
                    fontSize: 15, fontWeight: 500, textAlign: 'left',
                    marginBottom: 8, touchAction: 'manipulation',
                  }}
                >
                  <span style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: 'var(--color-info-light, #dbeafe)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-info, #2563eb)', flexShrink: 0,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </span>
                  查看原始知识点
                </button>
              )}

              <button
                onClick={handleDelete}
                style={{
                  width: '100%', minHeight: 52, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'transparent', border: 'none',
                  borderRadius: 10, cursor: 'pointer',
                  color: 'var(--color-danger)',
                  fontSize: 15, fontWeight: 500, textAlign: 'left',
                  marginBottom: 8, touchAction: 'manipulation',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: 'var(--color-danger-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-danger)', flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                  </svg>
                </span>
                删除卡片
              </button>

              <button
                onClick={() => setMenuOpen(false)}
                style={{
                  width: '100%', marginTop: 12, minHeight: 44,
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 15, fontWeight: 500, cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                取消
              </button>
            </div>
          </div>,
        document.body
      )}
    {/* 原始知识点弹窗 */}
    {showKnowledgePoint && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
        onClick={() => setShowKnowledgePoint(false)}
      >
        <div
          style={{
            width: '100%', maxWidth: 400, maxHeight: '80vh',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 16, padding: '20px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{
            fontSize: 16, fontWeight: 600,
            color: 'var(--color-text)',
            margin: '0 0 12px 0',
          }}>原始知识点</h3>
          <div style={{
            flex: 1, overflowY: 'auto',
            fontSize: 14, lineHeight: 1.7,
            color: 'var(--color-text)',
            backgroundColor: 'var(--color-bg, #f8fafc)',
            borderRadius: 10, padding: '14px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            marginBottom: 16,
          }}>
            {safeCard.knowledge_point}
          </div>
          <button
            onClick={() => setShowKnowledgePoint(false)}
            style={{
              width: '100%', minHeight: 44,
              padding: '10px 16px', borderRadius: 10,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              fontSize: 15, fontWeight: 500, cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    )}
    {editOpen && EditCardDialog}
    </>
    )
  }

  // ==================== 分类页列表项 (compact) ====================
  const cardStyle = {
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'transform 0.12s ease, box-shadow 0.15s ease, background-color 0.15s ease',
    backgroundColor: selected ? 'var(--color-primary-light)' : undefined,
    border: selected ? '2px solid var(--color-primary)' : undefined,
    borderRadius: selected ? '12px' : undefined,
  }

  const cardInner = (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '16px 16px 12px',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '999px',
            backgroundColor: flipped ? 'var(--color-primary-light)' : 'var(--color-border-light)',
            color: flipped ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {flipped ? '答案' : '问题'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectionMode && selected && (
            <span
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-primary)',
                border: '2px solid var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
          {bookmarked && (
            <span style={{ color: 'var(--color-accent-dark)', display: 'flex' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <p style={{
          fontSize: 'var(--text-base)',
          color: 'var(--color-text)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          /* O-16：长文本自动 clamp，避免单卡过高 */
          maxHeight: '60vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          <MathText>{flipped ? safeCard.back : safeCard.front}</MathText>
        </p>
        {flipped && safeCard.knowledge_point && (
          <p style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px dashed var(--color-border-light)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <span style={{ fontWeight: 600, marginRight: 4 }}>知识点：</span>
          <MathText>{safeCard.knowledge_point}</MathText>
          </p>
        )}
      </div>

      {!selectionMode && (
        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--color-border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          data-action-btn
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setFlipped((f) => !f)
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-primary-dark)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              minHeight: '36px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {flipped ? '返回问题' : '查看答案'}
          </button>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleBookmark}
              aria-label={bookmarked ? '取消收藏' : '收藏'}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: bookmarked ? 'var(--color-accent-light)' : 'transparent',
                border: '1px solid var(--color-border-light)',
                cursor: 'pointer',
                color: bookmarked ? 'var(--color-accent-dark)' : 'var(--color-text-secondary)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </button>
            <button
              onClick={handleMenuClick}
              aria-label="更多操作"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                border: '1px solid var(--color-border-light)',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {!selectionMode && menuOpen && createPortal(
        <div
          className={'card-menu-overlay' + (menuOpen ? ' card-menu-overlay--open' : '')}
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="card-menu-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: 16, fontWeight: 600,
              color: 'var(--color-text)',
              margin: '0 0 16px 0',
            }}>卡片操作</h3>

            <button
              onClick={handleBookmark}
              style={{
                width: '100%', minHeight: 52, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'transparent', border: 'none',
                borderRadius: 10, cursor: 'pointer',
                color: 'var(--color-text)',
                fontSize: 15, fontWeight: 500, textAlign: 'left',
                marginBottom: 8, touchAction: 'manipulation',
              }}
            >
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: 'var(--color-accent-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-accent-dark)', flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </span>
              {bookmarked ? '取消收藏' : '收藏卡片'}
            </button>

            {onMove && (
              <button
                onClick={handleMove}
                style={{
                  width: '100%', minHeight: 52, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'transparent', border: 'none',
                  borderRadius: 10, cursor: 'pointer',
                  color: 'var(--color-text)',
                  fontSize: 15, fontWeight: 500, textAlign: 'left',
                  marginBottom: 8, touchAction: 'manipulation',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: 'var(--color-primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-primary-dark)', flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                </span>
                移动到其他分类
              </button>
            )}

            <button
              onClick={(e) => {
                if (e) e.stopPropagation()
                setMenuOpen(false)
                setEditOpen(true)
              }}
              style={{
                width: '100%', minHeight: 52, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'transparent', border: 'none',
                borderRadius: 10, cursor: 'pointer',
                color: 'var(--color-text)',
                fontSize: 15, fontWeight: 500, textAlign: 'left',
                marginBottom: 8, touchAction: 'manipulation',
              }}
            >
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: 'var(--color-primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-primary-dark)', flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </span>
              编辑问题和答案
            </button>

            {safeCard.knowledge_point && (
              <button
                onClick={(e) => {
                  if (e) e.stopPropagation()
                  setMenuOpen(false)
                  setShowKnowledgePoint(true)
                }}
                style={{
                  width: '100%', minHeight: 52, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'transparent', border: 'none',
                  borderRadius: 10, cursor: 'pointer',
                  color: 'var(--color-text)',
                  fontSize: 15, fontWeight: 500, textAlign: 'left',
                  marginBottom: 8, touchAction: 'manipulation',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: 'var(--color-info-light, #dbeafe)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-info, #2563eb)', flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                查看原始知识点
              </button>
            )}

            <button
              onClick={handleDelete}
              style={{
                width: '100%', minHeight: 52, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'transparent', border: 'none',
                borderRadius: 10, cursor: 'pointer',
                color: 'var(--color-danger)',
                fontSize: 15, fontWeight: 500, textAlign: 'left',
                marginBottom: 8, touchAction: 'manipulation',
              }}
            >
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: 'var(--color-danger-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-danger)', flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                </svg>
              </span>
              删除卡片
            </button>

            <button
              onClick={() => setMenuOpen(false)}
              style={{
                width: '100%', marginTop: 12, minHeight: 44,
                padding: '10px 16px', borderRadius: 10,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: 15, fontWeight: 500, cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              取消
            </button>
          </div>
        </div>,
        document.body
      )}
      {/* 原始知识点弹窗 (compact) */}
      {showKnowledgePoint && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowKnowledgePoint(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: 400, maxHeight: '80vh',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: 16, padding: '20px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: 16, fontWeight: 600,
              color: 'var(--color-text)',
              margin: '0 0 12px 0',
            }}>原始知识点</h3>
            <div style={{
              flex: 1, overflowY: 'auto',
              fontSize: 14, lineHeight: 1.7,
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-bg, #f8fafc)',
              borderRadius: 10, padding: '14px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              marginBottom: 16,
            }}>
              {safeCard.knowledge_point}
            </div>
            <button
              onClick={() => setShowKnowledgePoint(false)}
              style={{
                width: '100%', minHeight: 44,
                padding: '10px 16px', borderRadius: 10,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: 15, fontWeight: 500, cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  )

  // selectionMode=true：外层 wrapper 带左侧圆形勾选框
  if (selectionMode) {
    return (
      <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          paddingLeft: '8px',
        }}
        onTouchStart={(e) => { onCardTouchStart && onCardTouchStart(safeCard.id) }}
        onTouchEnd={(e) => { onCardTouchEnd && onCardTouchEnd(safeCard.id) }}
        onTouchMove={(e) => { onCardTouchMove && onCardTouchMove(safeCard.id) }}
      >
        <span
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            backgroundColor: selected ? 'var(--color-primary)' : 'transparent',
            border: selected ? '2px solid var(--color-primary)' : '2px solid var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
            marginTop: '16px',
          }}
        >
          {selected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
        <div
          className="card"
          style={{ flex: 1, minWidth: 0, ...cardStyle, WebkitUserSelect: 'none' }}
          onClick={handleCompactClick}
          onContextMenu={preventTextMenu}
          
        >
          {cardInner}
        </div>
      </div>
      {editOpen && EditCardDialog}
      </>
    )
  }

  // selectionMode=false：原有行为，touch 事件绑定到最外层 card
  return (
    <>
    <div
      className="card"
      data-menu-open={menuOpen ? 'true' : undefined}
      style={{ ...cardStyle, WebkitUserSelect: 'none' }}
      onClick={handleCompactClick}
      onContextMenu={preventTextMenu}
      
      onTouchStart={(e) => { onCardTouchStart && onCardTouchStart(card.id) }}
      onTouchEnd={(e) => { onCardTouchEnd && onCardTouchEnd(card.id) }}
      onTouchMove={(e) => { onCardTouchMove && onCardTouchMove(card.id) }}
    >
      {cardInner}
    </div>
    {editOpen && EditCardDialog}
    </>
  )
}
