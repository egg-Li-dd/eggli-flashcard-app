import { useMemo, useState, useEffect } from 'react'
import { dbInstance as db } from '../services/db'

const DEPTH_OPTIONS = [
  { value: 'chapter-only', label: '仅到章节' },
  { value: 'unit-only', label: '仅到单元' },
  { value: 'chapter-and-unit', label: '章节+单元' },
]

export default function TargetCategorySelect({
  visible = true,
  categories = [],
  selectedCategoryId = '',
  classificationDepth = 'unit-only',
  onSelectCategory,
  onCreateCategory,
  onDepthChange,
  onBack,
  onNext,
  loading = false,
  mode = 'card-move',
  chapters = [],
  selectedChapterId = '',
  onSelectChapter,
  onCreateChapter,
  units = [],
  selectedUnitId = '',
  onSelectUnit,
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [creatingChapter, setCreatingChapter] = useState(false)
  const [newChapterName, setNewChapterName] = useState('')
  const [pendingChapterId, setPendingChapterId] = useState('') // 首次点击选中，再次点击进入
  const [enteredChapterId, setEnteredChapterId] = useState('') // 实际进入的章节视图
  const [localUnits, setLocalUnits] = useState([]) // 本地加载的单元列表

  // 进入章节时直接加载单元（不依赖父组件异步）
  useEffect(() => {
    if (enteredChapterId) {
      db.knowledgeTree.where('level').equals('unit').and(n => n.chapterId === enteredChapterId).sortBy('order').then(setLocalUnits)
    } else {
      setLocalUnits([])
    }
  }, [enteredChapterId])

  const safeCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories])
  const safeChapters = useMemo(() => (Array.isArray(chapters) ? chapters : []), [chapters])
  const safeUnits = useMemo(() => (Array.isArray(units) ? units : []), [units])
  // 使用本地加载的单元数据（优先使用 props，回退到本地加载）
  const displayUnits = useMemo(() => {
    if (Array.isArray(units) && units.length > 0) return units
    return localUnits
  }, [units, localUnits])

  if (!visible) return null

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name || loading) return
    const created = await onCreateCategory?.(name)
    if (created?.id) {
      onSelectCategory?.(created.id)
    }
    setNewName('')
    setCreating(false)
  }

  const handleCreateChapter = async () => {
    const name = newChapterName.trim()
    if (!name || loading) return
    const created = await onCreateChapter?.(name)
    if (created?.id) {
      onSelectChapter?.(created.id)
    }
    setNewChapterName('')
    setCreatingChapter(false)
  }

  const showChapterSelect = mode === 'unit-move' && selectedCategoryId
  const showUnitSelect = mode === 'unit-move' && !!enteredChapterId

  // 有已选中的章节等待确认时，步骤+1 以显示正确的步数提示
  const chapterSelected = showChapterSelect && !!pendingChapterId

  const currentStep = showUnitSelect ? 3 : (chapterSelected ? 2 : (showChapterSelect ? 1 : 1))

  const getTitle = () => {
    if (showUnitSelect) {
      // 从 enteredChapterId 查找章节名（可能还没有被父组件确认）
      const selChapter = safeChapters.find(c => c.id === enteredChapterId) || { name: '加载中…' }
      return `章节：${selChapter.name}`
    }
    if (showChapterSelect) return '选择目标章节'
    return '目标分类'
  }

  const getSubtitle = () => {
    if (showUnitSelect) return '选择要合并到的目标单元，或不选直接放入此章节'
    if (showChapterSelect) return '点击选中，再点进入章节查看单元结构'
    return '选择现有分类，或新建一个分类作为移动目标'
  }

  return (
    <div
      className="dialog-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        padding: '16px',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
      }}
      onClick={onBack}
    >
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          height: 'min(calc(100dvh - 32px), 820px)',
          maxHeight: 'none',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          overflowY: 'hidden',
          borderRadius: '20px',
        }}
      >
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--color-border-light)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 19,
            fontWeight: 700,
            color: 'var(--color-text)',
            textAlign: 'center',
            lineHeight: 1.3,
          }}>
            {getTitle()}
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            {getSubtitle()}
          </div>
        </div>

        {mode === 'unit-move' && currentStep > 1 && (
          <div style={{
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid var(--color-border-light)',
            background: 'var(--color-border-light)',
          }}>
            <button
              type="button"
              onClick={() => {
                if (showUnitSelect) {
                  // 单元选择 → 返回章节选择
                  setEnteredChapterId('')
                  onSelectChapter?.('')
                } else {
                  // 章节选择 → 返回分类选择
                  setPendingChapterId('')
                  onSelectCategory?.('')
                }
              }}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--color-primary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← 返回
            </button>
            <span style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}>
              步骤 {currentStep}/3
            </span>
          </div>
        )}

        {/* 分类程度选择器 */}
        {onDepthChange && !showChapterSelect && !showUnitSelect && (
          <div style={{
            padding: '10px 18px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
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
              flex: 1,
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
                    onClick={() => onDepthChange?.(opt.value)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      padding: '0 8px',
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
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div
          data-mobile-scroll="target-category-content"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '18px 18px 18px',
            display: 'flex',
            flexDirection: 'column',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          {showUnitSelect ? (
            displayUnits.length === 0 ? (
              <div style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 15,
              }}>
                此章节下暂无单元，将创建新单元
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  key="root"
                  type="button"
                  onClick={() => onSelectUnit?.('')}
                  style={{
                    minHeight: 60,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    border: !selectedUnitId ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: !selectedUnitId ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    color: 'var(--color-text)',
                    borderRadius: 14,
                    textAlign: 'left',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}>
                    不合并到具体单元，直接放入此章节
                  </span>
                </button>
                {displayUnits.map((unit) => {
                  const active = selectedUnitId === unit.id
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => onSelectUnit?.(unit.id)}
                      style={{
                        minHeight: 60,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
                        color: 'var(--color-text)',
                        borderRadius: 14,
                        textAlign: 'left',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0,
                      }}>
                        {unit.name || '未命名单元'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          ) : showChapterSelect ? (
            safeChapters.length === 0 ? (
              <div style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 15,
              }}>
                此分类下暂无章节，请新建章节
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {safeChapters.map((chapter) => {
                  const active = selectedChapterId === chapter.id || pendingChapterId === chapter.id
                  const isEntered = selectedChapterId === chapter.id
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={async () => {
                        if (pendingChapterId === chapter.id) {
                          // 再次点击 → 立即进入章节视图，同时后台加载单元
                          setEnteredChapterId(chapter.id)
                          setPendingChapterId('')
                          await onSelectChapter?.(chapter.id)
                        } else {
                          // 首次点击 → 选中（高亮）
                          setPendingChapterId(chapter.id)
                        }
                      }}
                      style={{
                        minHeight: 60,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
                        color: 'var(--color-text)',
                        borderRadius: 14,
                        textAlign: 'left',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0,
                      }}>
                        {chapter.name || '未命名章节'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            safeCategories.length === 0 ? (
              <div style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 15,
              }}>
                暂无分类，请先新建分类
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {safeCategories.map((category) => {
                  const active = selectedCategoryId === category.id
                  const cardCount = Number(category.cardCount || category.card_count || 0)
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => onSelectCategory?.(category.id)}
                      style={{
                        minHeight: 60,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
                        color: 'var(--color-text)',
                        borderRadius: 14,
                        textAlign: 'left',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0,
                      }}>
                        {category.name || '未命名分类'}
                      </span>
                      <span style={{
                        marginLeft: 12,
                        fontSize: 13,
                        color: active ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                        flexShrink: 0,
                        fontWeight: 600,
                      }}>
                        {cardCount} 张
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          )}

          <div style={{
            marginTop: 18,
            paddingTop: 18,
            borderTop: '1px solid var(--color-border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {showChapterSelect && !showUnitSelect && onCreateChapter ? (
              creatingChapter ? (
                <>
                  <input
                    autoFocus
                    className="input"
                    value={newChapterName}
                    onChange={(e) => setNewChapterName(e.target.value)}
                    placeholder="输入新章节名称"
                    style={{
                      minHeight: 52,
                      fontSize: 15,
                      padding: '12px 16px',
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setCreatingChapter(false)
                        setNewChapterName('')
                      }}
                      style={{
                        minHeight: 50,
                        fontSize: 15,
                        fontWeight: 600,
                      }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!newChapterName.trim() || loading}
                      onClick={handleCreateChapter}
                      style={{
                        minHeight: 50,
                        fontSize: 15,
                        fontWeight: 600,
                      }}
                    >
                      确认新建
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingChapter(true)}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    minHeight: 52,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  + 新建章节
                </button>
              )
            ) : !showChapterSelect && !showUnitSelect ? (
              creating ? (
                <>
                  <input
                    autoFocus
                    className="input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="输入新分类名称"
                    style={{
                      minHeight: 52,
                      fontSize: 15,
                      padding: '12px 16px',
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setCreating(false)
                        setNewName('')
                      }}
                      style={{
                        minHeight: 50,
                        fontSize: 15,
                        fontWeight: 600,
                      }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!newName.trim() || loading}
                      onClick={handleCreate}
                      style={{
                        minHeight: 50,
                        fontSize: 15,
                        fontWeight: 600,
                      }}
                    >
                      确认新建
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    minHeight: 52,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  + 新建分类
                </button>
              )
            ) : null}
          </div>
        </div>

        <div
          className="dialog-actions"
          style={{
            padding: '14px 18px calc(14px + env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--color-border-light)',
            background: 'var(--color-surface)',
            display: 'flex',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (mode === 'unit-move' && currentStep > 1) {
                // 返回上一步
                if (showUnitSelect) {
                  setEnteredChapterId('')
                  onSelectChapter?.('')
                } else if (showChapterSelect) {
                  setPendingChapterId('')
                  onSelectCategory?.('')
                }
              } else {
                onBack?.()
              }
            }}
            className="btn btn-secondary"
            style={{
              flex: 1,
              minHeight: 50,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {mode === 'unit-move' && currentStep > 1 ? '上一步' : '取消'}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (mode === 'unit-move' && showChapterSelect && pendingChapterId) {
                // 确认选中的章节 → 立即进入章节视图，同时后台加载单元
                const chapterId = pendingChapterId
                setEnteredChapterId(chapterId)
                setPendingChapterId('')
                await onSelectChapter?.(chapterId)
              } else {
                onNext?.()
              }
            }}
            disabled={
              (mode === 'unit-move' && !selectedCategoryId) ||
              (mode === 'unit-move' && showChapterSelect && !showUnitSelect && !pendingChapterId) ||
              (mode !== 'unit-move' && !selectedCategoryId) ||
              loading
            }
            className="btn btn-primary"
            style={{
              flex: 1,
              minHeight: 50,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {loading ? '处理中…' : (showUnitSelect ? '确认移动' : (showChapterSelect && pendingChapterId ? '确认' : '下一步'))}
          </button>
        </div>
      </div>
    </div>
  )
}