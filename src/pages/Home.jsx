import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { useApp } from '../context/AppContext'
import { getCardCountByCategory, updateCategoryPurpose } from '../services/db'
import CategoryModal from '../components/CategoryModal'
import ConfirmDialog from '../components/ConfirmDialog'
import PurposeModal from '../components/PurposeModal'
import { formatTime } from '../utils/helpers'


export default function Home() {
  const navigate = useNavigate()
  const { state, addCategory, renameCategory, removeCategory } = useApp()
  const [modalVisible, setModalVisible] = useState(false)
  const [modalTitle, setModalTitle] = useState('新建分类')
  const [editingCategory, setEditingCategory] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [cardCounts, setCardCounts] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [purposeModalVisible, setPurposeModalVisible] = useState(false)
  const [editingPurposeCategory, setEditingPurposeCategory] = useState(null)
  const longPressTimer = useRef(null)
  // D-13：记录加载错误状态，提供重试入口
  const [loadError, setLoadError] = useState(null)

  const loadCounts = async () => {
    try {
      setLoadError(null)
      const counts = {}
      for (const cat of state.categories) {
        counts[cat.id] = await getCardCountByCategory(cat.id)
      }
      setCardCounts(counts)
    } catch (e) {
      console.error('加载卡片计数失败:', e)
      setLoadError(e?.message || '加载失败')
    }
  }

  useEffect(() => {
    loadCounts()
  }, [state.categories])

  const handleAdd = () => {
    setModalTitle('新建分类')
    setEditingCategory(null)
    setModalVisible(true)
  }

  const handleConfirmModal = async (name) => {
    setModalVisible(false)
    if (editingCategory) {
      await renameCategory(editingCategory.id, name)
    } else {
      await addCategory(name)
    }
  }

  const handleTouchStart = (category) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenu(category)
    }, 600)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleTestClick = (e, categoryId) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/unit-test?highlightCategoryId=${categoryId}`)
  }

  const handleRename = () => {
    if (!contextMenu) return
    setModalTitle('重命名分类')
    setEditingCategory(contextMenu)
    setModalVisible(true)
    setContextMenu(null)
  }

  const handleDelete = () => {
    if (!contextMenu) return
    setDeleteTarget(contextMenu)
    setContextMenu(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeCategory(deleteTarget.id)
    setDeleteTarget(null)
  }

  // 打开编辑分类目的弹窗
  const handleEditPurpose = (e, category) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingPurposeCategory(category)
    setPurposeModalVisible(true)
  }

  // 确认保存分类目的
  const handleConfirmPurpose = async (purpose) => {
    if (!editingPurposeCategory) return
    setPurposeModalVisible(false)
    await updateCategoryPurpose(editingPurposeCategory.id, purpose)
    // 刷新分类列表以显示更新后的目的
    if (state.loadCategories) {
      await state.loadCategories()
    }
  }

  const totalCards = Object.values(cardCounts).reduce((a, b) => a + b, 0)

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      onContextMenu={preventTextMenu}
      
    >
      <div className="page-container" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '20px 16px 120px',
        width: '100%',
      }}>
        <div className="anim-slide-in-up" style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: '6px',
            letterSpacing: '-0.01em',
          }}>我的分类</h1>
          {state.categories.length > 0 && (
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}>
              {state.categories.length} 个分类 · 共 {totalCards} 张卡片
            </p>
          )}
        </div>

        {/* D-13：加载失败提示与重试按钮 */}
        {loadError && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            padding: '12px 16px', marginBottom: '12px',
            backgroundColor: 'var(--color-danger-light)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-danger)',
          }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', flex: 1, minWidth: 0 }}>
              卡片计数加载失败：{loadError}
            </span>
            <button
              onClick={loadCounts}
              className="btn btn-secondary btn-sm"
              style={{ flexShrink: 0, minHeight: '36px', padding: '0 12px', fontSize: 'var(--text-sm)' }}
            >
              重试
            </button>
          </div>
        )}

        {state.categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" style={{
              width: '88px',
              height: '88px',
              borderRadius: '24px',
              backgroundColor: 'var(--color-surface)',
              border: '1.5px dashed var(--color-border)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
                <path d="M4 4h12a4 4 0 0 1 4 4v12a2 2 0 0 1-2 2H8a4 4 0 0 1-4-4V4z" />
                <path d="M16 4v4h4" />
                <path d="M12 12h5" />
                <path d="M7 16h10" />
                <path d="M7 12h3" />
              </svg>
            </div>
            <p className="empty-state-title">还没有分类</p>
            <p className="empty-state-desc">点击右下角 + 号，创建你的第一个分类</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {state.categories.map((cat, idx) => (
              <Link
                key={cat.id}
                to={`/category/${cat.id}`}
                onTouchStart={() => handleTouchStart(cat)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
                className="anim-slide-in-up"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                  animationDelay: `${Math.min(idx * 40, 320)}ms`,
                }}
              >
                <div
                  className="card card-interactive"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '18px 20px',
                    gap: '14px',
                    cursor: 'pointer',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--color-surface)',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                >
                  <div style={{
                    width: '6px',
                    height: '44px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--color-primary)',
                    flexShrink: 0,
                  }} />
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    }}>
                      <p style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        margin: 0,
                      }}>{cat.name}</p>
                      {/* 分类目的标签 */}
                      {cat.purpose && (
                        <button
                          onClick={(e) => handleEditPurpose(e, cat)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            border: '1px solid var(--color-border)',
                            backgroundColor: 'var(--color-bg)',
                            color: 'var(--color-text-secondary)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            maxWidth: '80px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                          title="点击编辑学习目的"
                        >
                          {cat.purpose}
                        </button>
                      )}
                      {/* 编辑目的按钮 */}
                      <button
                        onClick={(e) => handleEditPurpose(e, cat)}
                        aria-label="编辑学习目的"
                        style={{
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          borderRadius: '6px',
                          backgroundColor: 'transparent',
                          color: 'var(--color-text-muted)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        title="设置学习目的"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-secondary)',
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary-dark)',
                        fontWeight: 600,
                        fontSize: '11px',
                      }}>
                        {cardCounts[cat.id] ?? 0} 张卡片
                      </span>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {formatTime(cat.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleTestClick(e, cat.id)}
                    aria-label="分类检测"
                    style={{
                      minWidth: '44px',
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-accent-light)',
                      color: 'var(--color-accent-dark)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                  </button>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{
                    color: 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}>
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 右下角浮动创建按钮 (FAB) */}
      <button
        onClick={handleAdd}
        className="fab anim-slide-in-up-bounce"
        style={{
          position: 'fixed',
          right: '24px',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)',
          width: '58px',
          height: '58px',
          borderRadius: '999px',
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(59, 130, 246, 0.35), 0 2px 4px rgba(15, 23, 42, 0.08)',
          cursor: 'pointer',
          zIndex: 20,
          border: 'none',
          WebkitAppearance: 'none',
          appearance: 'none',
          animationDelay: '0.3s',
        }}
        aria-label="新建分类"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* 新建/重命名分类弹窗 */}
      <CategoryModal
        visible={modalVisible}
        title={modalTitle}
        initialValue={editingCategory?.name || ''}
        onConfirm={handleConfirmModal}
        onCancel={() => setModalVisible(false)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        visible={!!deleteTarget}
        title="删除分类"
        message={`确定要删除「${deleteTarget?.name}」吗？该分类下的所有卡片将被一并删除，此操作不可恢复。`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 编辑分类目的弹窗 */}
      <PurposeModal
        visible={purposeModalVisible}
        categoryName={editingPurposeCategory?.name || ''}
        initialPurpose={editingPurposeCategory?.purpose || ''}
        onConfirm={handleConfirmPurpose}
        onCancel={() => setPurposeModalVisible(false)}
      />

      {/* 长按操作菜单 */}
      {contextMenu && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              backgroundColor: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(3px)',
              animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={() => setContextMenu(null)}
          />
          <div
            className="anim-slide-in-up-bounce"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              backgroundColor: 'var(--color-surface)',
              borderRadius: '24px 24px 0 0',
              padding: '10px 0 calc(env(safe-area-inset-bottom, 0px) + 16px)',
              boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.12)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '44px',
              height: '5px',
              borderRadius: '3px',
              backgroundColor: 'var(--color-border)',
              margin: '0 auto 10px',
            }} />
            <div style={{ padding: '4px 16px 0' }}>
              <p style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-text)',
                padding: '10px 12px 14px',
                margin: 0,
              }}>{contextMenu.name}</p>

              <button
                onClick={handleRename}
                style={{
                  width: '100%',
                  minHeight: '52px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  color: 'var(--color-text)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <span style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--color-primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary-dark)',
                  flexShrink: 0,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 3h5v5" />
                    <path d="M4 20h16" />
                    <path d="M14.5 5.5L18.5 9.5 9 19H5v-4l9.5-9.5z" />
                  </svg>
                </span>
                重命名分类
              </button>

              <button
                onClick={handleDelete}
                style={{
                  width: '100%',
                  minHeight: '52px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  color: 'var(--color-danger)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                  marginTop: '2px',
                }}
              >
                <span style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--color-danger-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-danger)',
                  flexShrink: 0,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                  </svg>
                </span>
                删除分类
              </button>

              <div style={{ padding: '8px 0 4px' }}>
                <button
                  onClick={() => setContextMenu(null)}
                  style={{
                    width: '100%',
                    minHeight: '52px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-base)',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
