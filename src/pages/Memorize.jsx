import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getAllCardsByCategory, setCardStatus, addBookmark, removeBookmark, isBookmarked, deleteCard, moveCardToCategory, getUnitsByCategory, getChaptersByCategory, getUnitsByChapter, getBookmarkStatuses, dbInstance, addWrongAnswer, updateCard, createDataSnapshot, restoreDataSnapshot } from '../services/db'
import { filterDueCards, getDueCount } from '../utils/ebbinghaus'
import { regenerateCard } from '../services/aiService'
import ConfirmDialog from '../components/ConfirmDialog'
import MathText from '../components/MathText'
import { syncEngine } from '../services/sync'

const DAY_MS = 24 * 60 * 60 * 1000

const STUDY_MODES = [
  {
    key: 'sequential',
    title: '顺序逐卡背诵',
    desc: '按AI划分的单元、卡片原有顺序依次背诵',
  },
  {
    key: 'active',
    title: '活跃记忆法',
    desc: '随机打乱卡片顺序，反复抽查背诵，强化瞬时记忆',
  },
  {
    key: 'ebbinghaus',
    title: '艾宾浩斯遗忘曲线',
    desc: '根据记忆规律智能安排复习频次与时间节点',
  },
  {
    key: 'weak',
    title: '薄弱卡片专攻',
    desc: '筛选标记为待掌握的卡片单独强化背诵',
  },
]

const ModeIcon = ({ modeKey, color }) => {
  const strokeColor = color || 'var(--color-primary-dark)'
  const icons = {
    sequential: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="4" rx="1.5" />
        <rect x="3" y="10" width="18" height="4" rx="1.5" />
        <rect x="3" y="16" width="18" height="4" rx="1.5" />
      </svg>
    ),
    active: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L15 8.5L22 9.3L17 14L18.2 21L12 17.8L5.8 21L7 14L2 9.3L9 8.5L12 2Z" />
      </svg>
    ),
    ebbinghaus: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12c3-7 7-7 9-7s6 0 9 7" />
        <path d="M3 16c3 5 7 5 9 5s6 0 9-5" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    ),
    weak: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L1 21h22L12 2z" />
        <line x1="12" y1="9" x2="12" y2="14" />
        <circle cx="12" cy="17.5" r="0.8" fill={strokeColor} />
      </svg>
    ),
  }
  return icons[modeKey] || icons.sequential
}

// 自定义下拉选择器组件
const FilterDropdown = ({ value, options, onChange, placeholder }) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const selectedOption = options.find(o => o.value === value)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [open])

  const handleSelect = (optValue) => {
    onChange(optValue === '' ? null : optValue)
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <button
        type="button"
        className={`memorize-filter-trigger ${value ? 'has-value' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="memorize-filter-trigger-label">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`memorize-filter-chevron ${open ? 'open' : ''}`}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="memorize-filter-dropdown">
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                className={`memorize-filter-option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Memorize() {
  const { state, showToast, loadCategories } = useApp()

  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  // [FIX] 跟踪当前分类 ID，供 sync listener 使用
  const selectedCategoryIdRef = useRef(null)
  const [showModeModal, setShowModeModal] = useState(false)
  const [closingModal, setClosingModal] = useState(false)
  const [studyMode, setStudyMode] = useState(null)
  const [searchParams] = useSearchParams()
  const fromPlan = searchParams.get('fromPlan') === 'true'
  const navigate = useNavigate()
  const [allCards, setAllCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cardStatuses, setCardStatuses] = useState({})
  const [fullCardStatuses, setFullCardStatuses] = useState({})
  const [bookmarks, setBookmarks] = useState({})
  // [Task 9] dueCardsCount 改为 useMemo 动态计算，不再使用 state
  const [chapters, setChapters] = useState([]) // 当前分类的章节
  const [selectedChapterId, setSelectedChapterId] = useState(null) // 选中的章节筛选
  const [chapterUnits, setChapterUnits] = useState([]) // 当前章节下的单元（或全部分类下的单元）
  const [selectedUnitId, setSelectedUnitId] = useState(null) // 选中的单元筛选

  const [reviewOnly, setReviewOnly] = useState(false)
  const [activeTooltip, setActiveTooltip] = useState(null)
  const [longPressTimer, setLongPressTimer] = useState(null)

  const [flipped, setFlipped] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [showSwipeMenu, setShowSwipeMenu] = useState(false)
  const [swipeMenuCard, setSwipeMenuCard] = useState(null)
  const [closingSwipe, setClosingSwipe] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const scrollRef = useRef(null)
  const [showBackTop, setShowBackTop] = useState(false)
  const lastScrollY = useRef(0)
  const swipeRef = useRef({ startX: 0, startY: 0, moving: false, offsetX: 0 })
  const [swipeX, setSwipeX] = useState(0)
  // O-5：首次进入显示滑动提示，localStorage 记忆
  const [swipeHintVisible, setSwipeHintVisible] = useState(() => {
    try { return !localStorage.getItem('memorize_swipe_hint_dismissed') } catch { return true }
  })
  const dismissSwipeHint = () => {
    setSwipeHintVisible(false)
    try { localStorage.setItem('memorize_swipe_hint_dismissed', '1') } catch {}
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [cardToDelete, setCardToDelete] = useState(null)

  const [showMoveModal, setShowMoveModal] = useState(false)
  const [closingMove, setClosingMove] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [closingEdit, setClosingEdit] = useState(false)
  // [Task 1] 完成弹窗状态
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [closingComplete, setClosingComplete] = useState(false)
  // [循环复习] 艾宾浩斯模式：最后一张到期卡片标记后仍有到期卡片时显示
  const [showLoopBackModal, setShowLoopBackModal] = useState(false)
  const [closingLoopBack, setClosingLoopBack] = useState(false)
  const [loopBackRemainingCount, setLoopBackRemainingCount] = useState(0)
  // [Task 10] 错题本卡片 ID 集合（weak 模式数据源）
  const [wrongAnswerCardIds, setWrongAnswerCardIds] = useState(new Set())
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editKnowledgePoint, setEditKnowledgePoint] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [cardToMove, setCardToMove] = useState(null)
  const [targetCategoryId, setTargetCategoryId] = useState(null)
  const [targetUnits, setTargetUnits] = useState([])
  const [targetUnitId, setTargetUnitId] = useState(null)

  // [FIX] 保持 selectedCategoryIdRef 与 state 同步
  useEffect(() => {
    selectedCategoryIdRef.current = selectedCategoryId
  }, [selectedCategoryId])
  
  // 从计划页面跳转时：从 URL 参数读取 mode 和 categoryId
  useEffect(() => {
    if (!fromPlan) return
    
    const urlMode = searchParams.get('mode')
    const urlCategoryId = searchParams.get('categoryId')
    
    if (urlMode && !studyMode) {
      setStudyMode(urlMode)
    }
    if (urlCategoryId && !selectedCategoryId) {
      setSelectedCategoryId(urlCategoryId)
      // 加载该分类的卡片
      loadCards(urlCategoryId)
    }
  }, [fromPlan, searchParams])

  // [FIX] 监听云端同步完成，当背诵页已有选中分类时自动刷新卡片
  useEffect(() => {
    const listener = (status) => {
      // syncEngine 通知格式: { syncing, direction, tokenExpired }
      // syncing === false 且 direction === 'pull' 表示云端拉取已完成
      if (status.syncing === false && status.direction === 'pull') {
        const catId = selectedCategoryIdRef.current
        if (!catId) return
        setAllCards([])
        setLoading(true)
        loadCards(catId)
      }
    }
    const unsubscribe = syncEngine.onSyncStatusChange(listener)
    return unsubscribe
  }, []) // 依赖为空：只注册一次，catId 通过 ref 获取

  // 监听数据清除事件，重置背诵页面状态
  useEffect(() => {
    const handleDataCleared = () => {
      setSelectedCategoryId(null)
      setSelectedChapterId(null)
      setSelectedUnitId(null)
      setChapters([])
      setChapterUnits([])
      setAllCards([])
      setCardStatuses({})
      setFullCardStatuses({})
      setBookmarks({})
      setCurrentIndex(0)
      setStudyMode(null)
      setFlipped(false)
      // [Task 9] dueCardsCount 已改为 useMemo，无需手动重置
      // [Task 10] 重置错题本卡片集合
      setWrongAnswerCardIds(new Set())
    }
    window.addEventListener('data-cleared', handleDataCleared)
    return () => window.removeEventListener('data-cleared', handleDataCleared)
  }, [])

  // 通用：启动关闭动画，ms 后卸载 DOM
  function startClosing(setClosing, setShow, ms) {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      setShow(false)
    }, ms)
  }

  const getProgressKey = useCallback((categoryId, mode, isReview) => {
    const suffix = isReview ? 'review' : 'all'
    return `memorize_progress_${categoryId}_${mode}_${suffix}`
  }, [])

  const loadCards = useCallback(async (categoryId) => {
    if (!categoryId) {
      setError('分类ID无效，请重新选择分类')
      return
    }

    setLoading(true)
    setError(null)
    setAllCards([])
    setCurrentIndex(0)
    setFlipped(false)

    try {
      const cards = await getAllCardsByCategory(categoryId)
      // 加载章节数据
      const chapterList = await getChaptersByCategory(categoryId)
      setChapters(chapterList)
      setSelectedChapterId(null)
      // 加载分类下所有单元（用于"全部"章节时的单元下拉）
      const allUnits = await getUnitsByCategory(categoryId)
      setChapterUnits(allUnits)
      setSelectedUnitId(null)
      // 构建 chapterId -> chapterName 映射
      const chapterNameMap = {}
      chapterList.forEach(ch => { chapterNameMap[ch.id] = ch.name })
      // 为卡片附加 chapterName
      const cardsWithChapterName = cards.map(c => ({
        ...c,
        chapterName: chapterNameMap[c.chapterId] || '',
      }))
      // 获取完整的卡片状态记录（包含 reviewCount / SM-2 字段 / nextReviewAt）
      const statusRecords = await dbInstance.cardStatus.where('categoryId').equals(categoryId).toArray()
      const statuses = {}
      const fullStatuses = {}
      for (const record of statusRecords) {
        statuses[record.cardId] = record.status
        fullStatuses[record.cardId] = record
      }
      const bm = await getBookmarkStatuses(cards.map(c => c.id))
      setAllCards(cardsWithChapterName)
      setCardStatuses(statuses)
      setFullCardStatuses(fullStatuses)
      setBookmarks(bm)
      setFlipped(false)

      // [Task 9] 移除 dueCardsCount 一次性计算，改为 useMemo 动态计算

      // [Task 10] 加载错题本卡片 ID 集合（weak 模式数据源）
      const wrongAnswers = await dbInstance.wrongAnswers.where('categoryId').equals(categoryId).toArray()
      const wrongIds = new Set(wrongAnswers.map(w => w.cardId))
      setWrongAnswerCardIds(wrongIds)

      // 恢复进度
      if (studyMode === 'ebbinghaus') {
        // [Task 11] 艾宾浩斯模式：基于 lastReviewedCardId 恢复进度
        const dueCards = filterDueCards(cardsWithChapterName, fullStatuses)
        const lastCardId = localStorage.getItem(`memorize_ebbinghaus_last_card_${categoryId}`)
        if (lastCardId) {
          const idx = dueCards.findIndex(c => c.id === lastCardId)
          if (idx >= 0) {
            // 定位到下一张（已复习过的下一张）
            setCurrentIndex(Math.min(idx + 1, dueCards.length - 1))
          } else {
            setCurrentIndex(0)
          }
        } else {
          setCurrentIndex(0)
        }
      } else if (studyMode) {
        // 非 ebbinghaus 模式：保持原有 index-based 恢复逻辑
        // 切换分类/模式时总是从「全部卡片」key 恢复（reviewOnly 已重置）
        const progressKey = getProgressKey(categoryId, studyMode, false)
        const savedIndex = localStorage.getItem(progressKey)
        if (savedIndex !== null) {
          const parsedIndex = parseInt(savedIndex, 10)
          // loadCards 只在切换分类/模式时调用，此时 reviewOnly 已重置为 false
          // [Task 10] weak 模式基于错题本筛选
          const filteredNow = studyMode === 'weak'
            ? cards.filter(c => wrongIds.has(c.id)).length
            : cards.length
          const validIndex = Math.min(parsedIndex, Math.max(0, filteredNow - 1))
          setCurrentIndex(validIndex)
        } else {
          setCurrentIndex(0)
        }
      } else {
        setCurrentIndex(0)
      }
    } catch (e) {
      console.error('卡片加载失败:', e)
      setError(e.message || '卡片加载失败，请重试')
      setStudyMode(null)
    } finally {
      setLoading(false)
    }
  }, [studyMode, getProgressKey])

  const syncAndOfferUndo = useCallback(async ({ snapshot, message }) => {
    const undo = async () => {
      try {
        await restoreDataSnapshot(snapshot)
        if (loadCategories) await loadCategories()
        const catId = selectedCategoryIdRef.current
        if (catId) await loadCards(catId)
        showToast('已撤销操作。如需同步云端，请到云端数据页手动上传', 'success')
      } catch (e) {
        showToast('撤销失败：' + (e.message || '未知错误'), 'error')
      }
    }
    showToast(`${message}。如需同步云端，请到云端数据页手动上传`, 'success',
      [{ label: '撤销', onClick: undo }],
      { duration: 3000 },
    )
  }, [loadCards, loadCategories, showToast])

  // [FIX] 从 memorization 恢复上次的背诵分类和模式（移到 loadCards 声明之后避免 TDZ）
  useEffect(() => {
    if (selectedCategoryId || studyMode) return
    const savedCategoryId = localStorage.getItem('memorize_category')
    const savedMode = localStorage.getItem('memorize_mode')
    if (!savedCategoryId || !savedMode) return
    const categoryExists = state.categories.some((c) => c.id === savedCategoryId)
    if (categoryExists) {
      setSelectedCategoryId(savedCategoryId)
      setStudyMode(savedMode)
      loadCards(savedCategoryId)
    } else {
      localStorage.removeItem('memorize_category')
      localStorage.removeItem('memorize_mode')
    }
  }, [state.categories, loadCards, selectedCategoryId, studyMode])

  const handleSelectCategory = (catId) => {
    if (!catId) return
    if (selectedCategoryId === catId) {
      setClosingModal(false)
      setShowModeModal(true)
      return
    }
    setSelectedCategoryId(catId)
    setError(null)
    setFlipped(false)
    setCurrentIndex(0)
    setReviewOnly(false)
    if (studyMode) {
      localStorage.setItem('memorize_category', catId)
      loadCards(catId)
    } else {
      setClosingModal(false)
      setShowModeModal(true)
    }
  }

  const handleSelectChapter = useCallback(async (chapterId) => {
    setSelectedChapterId(chapterId)
    setSelectedUnitId(null)
    setChapterUnits([]) // 立即清空，防止显示旧章节的单元列表
    if (chapterId) {
      try {
        const units = await getUnitsByChapter(chapterId)
        setChapterUnits(units)
      } catch (e) {
        console.error('加载章节单元失败:', e)
        setChapterUnits([])
      }
    } else {
      // "全部"章节：显示分类下所有单元
      if (selectedCategoryId) {
        try {
          const allUnits = await getUnitsByCategory(selectedCategoryId)
          setChapterUnits(allUnits)
        } catch (e) {
          console.error('加载全部单元失败:', e)
          setChapterUnits([])
        }
      }
    }
  }, [selectedCategoryId])

  const handleSelectMode = (mode) => {
    if (closingModal) return
    setStudyMode(mode)
    setReviewOnly(false)
    // 先关闭动画，再执行后续逻辑
    setClosingModal(true)
    setTimeout(() => {
      setShowModeModal(false)
      setClosingModal(false)
      localStorage.setItem('memorize_category', selectedCategoryId)
      localStorage.setItem('memorize_mode', mode)
      // 清除该分类+模式下所有进度（全部卡片 + 仅到期卡片）
      localStorage.removeItem(getProgressKey(selectedCategoryId, mode, false))
      localStorage.removeItem(getProgressKey(selectedCategoryId, mode, true))
      loadCards(selectedCategoryId).then(() => {
        if (mode === 'active') {
          setAllCards((prev) => {
            if (prev.length === 0) return prev
            const shuffled = [...prev]
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
            }
            // [Task 12] shuffle 后基于 lastReviewedCardId 重新定位
            const lastCardId = localStorage.getItem(`memorize_active_last_card_${selectedCategoryId}`)
            if (lastCardId) {
              const idx = shuffled.findIndex(c => c.id === lastCardId)
              if (idx >= 0) {
                // 定位到下一张（已复习过的下一张）
                setCurrentIndex(Math.min(idx + 1, shuffled.length - 1))
              } else {
                setCurrentIndex(0)
              }
            } else {
              setCurrentIndex(0)
            }
            return shuffled
          })
        }
      }).catch((e) => {
        console.error('handleSelectMode 加载失败:', e)
      })
    }, 250)
  }

  const handleCancelModeModal = () => {
    if (closingModal) return
    setClosingModal(true)
    setTimeout(() => {
      setShowModeModal(false)
      setClosingModal(false)
      if (!studyMode) {
        setSelectedCategoryId(null)
      }
    }, 250)
  }

  const handleSwitchMode = () => {
    setError(null)
    setClosingModal(false)
    setShowModeModal(true)
  }

  // 筛选逻辑（统一基于 nextReviewAt <= now，不依赖 status 字段）
  // - reviewOnly=true 或 ebbinghaus 模式：仅展示到期卡片
  // - [Task 10] weak 模式：基于错题本（wrongAnswers 表）筛选
  // - [Task 3] weak 模式无错题时返回空数组，不穿透到 return base
  // - 其他模式：展示全部
  const filteredCards = useMemo(() => {
    let base = allCards
    // 章节筛选
    if (selectedChapterId) {
      base = base.filter(c => c.chapterId === selectedChapterId)
    }
    // 单元筛选
    if (selectedUnitId) {
      base = base.filter(c => c.unitId === selectedUnitId)
    }
    if (reviewOnly || studyMode === 'ebbinghaus') {
      const due = filterDueCards(base, fullCardStatuses)
      return due
    }
    if (studyMode === 'weak') {
      // [Task 10] 基于错题本筛选；[Task 3] 无错题时自然返回空数组
      return base.filter(c => wrongAnswerCardIds.has(c.id))
    }
    return base
  }, [allCards, selectedChapterId, selectedUnitId, reviewOnly, studyMode, fullCardStatuses, wrongAnswerCardIds])

  const currentCard = filteredCards[currentIndex] || null

  // [Task 9] dueCardsCount 动态计算：基于 filteredCards 和 fullCardStatuses
  // 仅 ebbinghaus 模式或 reviewOnly 时有意义，其他模式返回 0
  const dueCardsCount = useMemo(() => {
    if (studyMode !== 'ebbinghaus' && !reviewOnly) return 0
    return filterDueCards(filteredCards, fullCardStatuses).length
  }, [filteredCards, fullCardStatuses, studyMode, reviewOnly])

  // 学习统计数据（基于当前分类的全部卡片）
  const _due = getDueCount(allCards, fullCardStatuses)
  const _learned = Object.keys(fullCardStatuses).length
  const stats = {
    total: allCards.length,
    mastered: Math.max(0, _learned - _due), // 已安排复习但未到期
    review: _due,                            // 当前到期卡片数
    new: allCards.length - _learned,         // 从未学习过
  }

  // 掌握率百分比（限制在0-100）
  const masteryPercent = stats.total > 0
    ? Math.min(100, Math.max(0, Math.round((stats.mastered / stats.total) * 100)))
    : 0

  const handleSwipeStart = (e) => {
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, startY: t.clientY, moving: false, offsetX: 0 }
  }

  const handleSwipeMove = (e) => {
    const t = e.touches[0]
    const dx = t.clientX - swipeRef.current.startX
    const dy = t.clientY - swipeRef.current.startY
    
    // 降低触发阈值，提升移动端体验
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 2) {
      swipeRef.current.moving = true
      swipeRef.current.lastDx = dx
      // 限制滑动范围并添加阻尼效果
      const maxSwipe = 150
      const dampedX = dx * (1 - Math.abs(dx) / (maxSwipe * 2))
      setSwipeX(Math.max(-maxSwipe, Math.min(maxSwipe, dampedX)))
    }
  }

  const handleSwipeEnd = () => {
    if (swipeRef.current.moving && currentCard) {
      if (swipeRef.current.lastDx < -80) {
        setSwipeMenuCard(currentCard)
        setClosingSwipe(false)
        setShowSwipeMenu(true)
      }
    }
    setSwipeX(0)
    swipeRef.current = { startX: 0, startY: 0, moving: false, offsetX: 0, lastDx: 0 }
  }

  const handleConfirmDelete = async () => {
    if (!cardToDelete || !selectedCategoryId) {
      setShowDeleteConfirm(false)
      setCardToDelete(null)
      return
    }
    try {
      const snapshot = await createDataSnapshot()
      await deleteCard(cardToDelete.id, selectedCategoryId)
      const deletedId = cardToDelete.id
      setAllCards((prev) => prev.filter((c) => c.id !== deletedId))
      setCardStatuses((prev) => {
        const next = { ...prev }
        delete next[deletedId]
        return next
      })
      setFullCardStatuses((prev) => {
        const next = { ...prev }
        delete next[deletedId]
        return next
      })
      setBookmarks((prev) => {
        const next = { ...prev }
        delete next[deletedId]
        return next
      })
      setCurrentIndex((prev) => Math.max(0, Math.min(prev, filteredCards.length - 2)))
      setFlipped(false)
      if (loadCategories) loadCategories()
      await syncAndOfferUndo({ snapshot, message: '已删除卡片' })
    } catch (e) {
      showToast('删除失败：' + (e.message || '未知错误'), 'error')
    } finally {
      setShowDeleteConfirm(false)
      setCardToDelete(null)
    }
  }

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false)
    setCardToDelete(null)
  }

  const handleOpenMoveModal = (e) => {
    if (e) e.stopPropagation()
    if (!currentCard) return
    setCardToMove(currentCard)
    setTargetCategoryId(null)
    setTargetUnitId(null)
    setTargetUnits([])
    setClosingMove(false)
    setShowMoveModal(true)
  }

  const handleOpenEditModal = (e) => {
    if (e) e.stopPropagation()
    if (!currentCard) return
    setEditFront(currentCard.front || '')
    setEditBack(currentCard.back || '')
    setEditKnowledgePoint(currentCard.knowledge_point || '')
    setClosingEdit(false)
    setShowEditModal(true)
  }

  const handleCancelEdit = () => {
    if (closingEdit) return
    startClosing(setClosingEdit, setShowEditModal, 280)
    setEditFront('')
    setEditBack('')
    setEditKnowledgePoint('')
  }

  const handleConfirmEdit = async () => {
    if (!currentCard) return
    if (closingEdit) return
    try {
      const snapshot = await createDataSnapshot()
      await updateCard(currentCard.id, { front: editFront, back: editBack, knowledge_point: editKnowledgePoint || null })
      setAllCards((prev) => prev.map((c) => c.id === currentCard.id ? { ...c, front: editFront, back: editBack, knowledge_point: editKnowledgePoint || null } : c))
      await syncAndOfferUndo({ snapshot, message: '已保存修改' })
    } catch (e) {
      showToast('保存失败：' + (e.message || '未知错误'), 'error')
    } finally {
      handleCancelEdit()
    }
  }

  const handleRegenerateFromKnowledgePoint = async () => {
    if (!editKnowledgePoint || !editKnowledgePoint.trim()) {
      showToast('请先填写原始知识点', 'error')
      return
    }
    setRegenerating(true)
    try {
      const result = await regenerateCard(
        editKnowledgePoint.trim(),
        state?.apiKey,
        state?.aiServiceMode,
        state?.model,
        state?.iflytekSparkApiKey,
        state?.iflytekSparkApiSecret,
        state?.volcanoApiKey,
        state?.dashscopeApiKey,
        state?.summaryLevel,
      )
      if (result && result.front) setEditFront(result.front)
      if (result && result.back) setEditBack(result.back)
      showToast('已根据知识点重新生成问题和答案')
    } catch (e) {
      console.error('AI 重新生成失败:', e)
      showToast('AI 重新生成失败：' + (e.message || '未知错误'), 'error')
    } finally {
      setRegenerating(false)
    }
  }

  const handleCancelMove = () => {
    if (closingMove) return
    startClosing(setClosingMove, setShowMoveModal, 280)
    setCardToMove(null)
    setTargetCategoryId(null)
    setTargetUnitId(null)
    setTargetUnits([])
  }

  const handleSelectTargetCategory = async (catId) => {
    setTargetCategoryId(catId)
    setTargetUnitId(null)
    if (catId) {
      const units = await getUnitsByCategory(catId)
      setTargetUnits(units)
    } else {
      setTargetUnits([])
    }
  }

  const handleConfirmMove = async () => {
    if (closingMove) return
    if (!cardToMove || !targetCategoryId || !targetUnitId) {
      showToast('请选择分类和单元', 'error')
      return
    }
    try {
      const snapshot = await createDataSnapshot()
      await moveCardToCategory(cardToMove.id, targetCategoryId, targetUnitId)
      const movedId = cardToMove.id
      setAllCards((prev) => prev.filter((c) => c.id !== movedId))
      setCardStatuses((prev) => {
        const next = { ...prev }
        delete next[movedId]
        return next
      })
      setFullCardStatuses((prev) => {
        const next = { ...prev }
        delete next[movedId]
        return next
      })
      setCurrentIndex((prev) => Math.max(0, Math.min(prev, filteredCards.length - 2)))
      setFlipped(false)
      if (loadCategories) loadCategories()
      await syncAndOfferUndo({ snapshot, message: '已移动卡片' })
    } catch (e) {
      showToast('移动失败：' + (e.message || '未知错误'), 'error')
    } finally {
      handleCancelMove()
    }
  }

  const saveProgress = useCallback((index) => {
    if (selectedCategoryId && studyMode) {
      const progressKey = getProgressKey(selectedCategoryId, studyMode, reviewOnly)
      localStorage.setItem(progressKey, String(index))
    }
  }, [selectedCategoryId, studyMode, getProgressKey, reviewOnly])

  const handlePrev = () => {
    if (currentIndex <= 0) return
    const newIndex = currentIndex - 1
    saveProgress(newIndex)
    setCurrentIndex(newIndex)
    setFlipped(false)
  }

  const handleNext = () => {
    if (currentIndex >= filteredCards.length - 1) return
    const newIndex = currentIndex + 1
    saveProgress(newIndex)
    setCurrentIndex(newIndex)
    setFlipped(false)
  }

  const handleFlip = () => {
    if (animating) return
    if (swipeRef.current.moving) return
    setAnimating(true)
    
    // 添加触觉反馈（移动端）
    if ('vibrate' in navigator) {
      navigator.vibrate(10)
    }
    
    setFlipped((prev) => !prev)
    setTimeout(() => setAnimating(false), 300)
  }

  // 允许传入显式的 status map,避免 closure 读取旧状态
  const isAllMasteredInCategory = (statusMap) => {
    if (!selectedCategoryId || allCards.length === 0) return false
    const map = statusMap || fullCardStatuses
    // 所有卡片都已有状态记录 && 全部到期计数为 0 → 所有卡片都已安排未来复习
    const learned = allCards.filter((card) => map[card.id])
    if (learned.length !== allCards.length) return false // 还有未学习过的新卡片
    return getDueCount(allCards, map) === 0
  }

  const handleContinueReview = () => {
    // 跳转到背诵计划页面
    navigate('/memorize/plan?entryType=review')
  }

  const handleExitReview = () => {
    setReviewOnly(false)
    setCurrentIndex(0)
    setFlipped(false)
  }

  // [Task 1] 修复 handleComplete 崩溃：移除 setIsReviewComplete(true)，改为显示完成弹窗
  const handleComplete = () => {
    setFlipped(false)
    if (fromPlan) {
      // 从计划页来的，完成后跳转回计划页
      navigate('/memorize/plan')
      return
    }
    // 显示完成弹窗（ebbinghaus/非 ebbinghaus 模式弹窗内容不同）
    setShowCompleteModal(true)
  }

  /**
   * [Task 1] 关闭完成弹窗（带动画）
   */
  const handleCloseCompleteModal = () => {
    if (closingComplete) return
    setClosingComplete(true)
    setTimeout(() => {
      setShowCompleteModal(false)
      setClosingComplete(false)
    }, 200)
  }

  /**
   * [循环复习] 关闭循环复习弹窗（带动画）
   */
  const handleCloseLoopBackModal = () => {
    if (closingLoopBack) return
    setClosingLoopBack(true)
    setTimeout(() => {
      setShowLoopBackModal(false)
      setClosingLoopBack(false)
    }, 200)
  }

  const handleLongPressStart = (e, categoryId) => {
    if (longPressTimer) clearTimeout(longPressTimer)
    let startX = 0
    let startY = 0
    if (e.touches && e.touches[0]) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    } else {
      startX = e.clientX || 0
      startY = e.clientY || 0
    }
    const tid = setTimeout(() => {
      setActiveTooltip(categoryId)
    }, 500)
    setLongPressTimer(tid)
    const moveHandler = (ev) => {
      let x = 0
      let y = 0
      if (ev.touches && ev.touches[0]) { x = ev.touches[0].clientX; y = ev.touches[0].clientY }
      else { x = ev.clientX || 0; y = ev.clientY || 0 }
      if (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10) {
        clearTimeout(tid)
        setLongPressTimer(null)
        cleanup()
      }
    }
    const endHandler = () => {
      if (activeTooltip) {
        setTimeout(() => setActiveTooltip(null), 300)
      }
      clearTimeout(tid)
      setLongPressTimer(null)
      cleanup()
    }
    const cleanup = () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('touchmove', moveHandler)
        document.removeEventListener('touchend', endHandler)
        document.removeEventListener('mousemove', moveHandler)
        document.removeEventListener('mouseup', endHandler)
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('touchmove', moveHandler, { passive: true })
      document.addEventListener('touchend', endHandler)
      document.addEventListener('mousemove', moveHandler)
      document.addEventListener('mouseup', endHandler)
    }
  }

  const handleMark = async (status) => {
    if (!currentCard || !selectedCategoryId) return

    // [Task 4] 保存操作前状态，用于失败回滚
    const prevCardStatuses = { ...cardStatuses }
    const prevFullCardStatuses = { ...fullCardStatuses }

    // === 1. 即时更新本地 React state（不等待数据库，确保按钮样式立即变化）===
    const existingFull = fullCardStatuses[currentCard.id] || null
    const prevInterval = existingFull?.interval || 1
    const prevEase = existingFull?.easeFactor || 2.5
    const effectiveMode = studyMode || 'sequential'
    const now = Date.now()

    // 构造一个本地预测的更新记录（用于 UI 即时刷新）
    let predictedRecord = {
      ...(existingFull || { cardId: currentCard.id, categoryId: selectedCategoryId }),
      status,
      updatedAt: now,
      reviewCount: (existingFull?.reviewCount || 0) + 1,
      mode: effectiveMode,
    }

    if (effectiveMode === 'ebbinghaus') {
      // 艾宾浩斯模式：先按简化规则预测（实际更新由数据库精确计算）
      if (status === 'mastered') {
        predictedRecord.repetitions = (existingFull?.repetitions || 0) + 1
        predictedRecord.nextReviewAt = now + DAY_MS * (existingFull?.interval || 1)
      } else {
        // 待掌握：降级
        predictedRecord.repetitions = 0
        predictedRecord.interval = Math.max(1, Math.ceil(prevInterval * 0.5))
        predictedRecord.easeFactor = Math.max(1.3, +(prevEase - 0.2).toFixed(2))
        predictedRecord.nextReviewAt = now
      }
      predictedRecord.userOverride = existingFull?.userOverride || false
    } else if (effectiveMode === 'sequential' || effectiveMode === 'active') {
      // [Task 5.4] 同步 db.js 修改：sequential/active 模式 review 不再修改 SM-2 参数
      if (status === 'mastered') {
        // 短期计划已掌握：不改 SM-2 参数
        predictedRecord.userOverride = false
      } else if (status === 'review') {
        // 短期计划待掌握：仅更新 status/userOverride/reviewCount/updatedAt，不改 SM-2 参数（与 db.js 同步）
        predictedRecord.userOverride = true
      } else if (status === 'learning') {
        predictedRecord.userOverride = true
      }
    } else if (effectiveMode === 'weak') {
      if (status === 'mastered') {
        predictedRecord.interval = Math.max(1, Math.ceil(prevInterval * 0.8))
        predictedRecord.easeFactor = Math.min(3.0, +(prevEase + 0.05).toFixed(2))
        predictedRecord.nextReviewAt = now + predictedRecord.interval * DAY_MS
      }
    }

    // 立即同步 UI 状态（核心：不等待数据库写入）
    const nextCardStatuses = { ...cardStatuses, [currentCard.id]: status }
    const nextFullStatuses = { ...fullCardStatuses, [currentCard.id]: predictedRecord }
    setCardStatuses(nextCardStatuses)
    setFullCardStatuses(nextFullStatuses)

    // === 2. [Task 4] 异步更新数据库与错题本，等待返回实际记录 ===
    try {
      const actualRecord = await setCardStatus(currentCard.id, selectedCategoryId, status, {
        existingRecord: existingFull,
        mode: effectiveMode,
        chapterId: currentCard.chapterId || '',
      })
      // [Task 4] 用返回的实际记录修正 fullCardStatuses（覆盖 predictedRecord）
      if (actualRecord) {
        setFullCardStatuses((prev) => ({ ...prev, [currentCard.id]: actualRecord }))
      }

      // [Task 11/12] 成功标记后，保存 lastReviewedCardId（ebbinghaus/active 模式）
      if (effectiveMode === 'ebbinghaus' || effectiveMode === 'active') {
        localStorage.setItem(`memorize_${effectiveMode}_last_card_${selectedCategoryId}`, currentCard.id)
      }

      if (status === 'review') {
        addWrongAnswer(currentCard.id, selectedCategoryId, '', {
          unitId: currentCard.unitId || '',
          chapterId: currentCard.chapterId || '',
          stem: currentCard.front || '',
        }).catch((err) => console.warn('[Memorize] addWrongAnswer 失败:', err))
      }

      // [Task 9] dueCardsCount 已改为 useMemo，无需手动更新

      // === 3. 计算过滤后的列表长度（用于索引边界判断）===
      let nextFilteredLen
      const filterMode = reviewOnly || studyMode === 'ebbinghaus'
      if (filterMode) {
        const effectiveStatuses = actualRecord ? { ...nextFullStatuses, [currentCard.id]: actualRecord } : nextFullStatuses
        nextFilteredLen = filterDueCards(allCards, effectiveStatuses).length
      } else if (studyMode === 'weak') {
        // [Task 10] weak 模式基于错题本，列表在会话期间不变
        nextFilteredLen = filteredCards.length
      } else {
        nextFilteredLen = filteredCards.length
      }

      // === 4. 卡片切换逻辑（翻转关闭 + 推进到下一张）===
      setFlipped(false)

      if (nextFilteredLen === 0) {
        handleComplete()
        return
      }

      // [循环复习] 判断是否为艾宾浩斯模式（reviewOnly 或 studyMode === 'ebbinghaus'）
      const isEbbinghausMode = reviewOnly || studyMode === 'ebbinghaus'

      // 更新索引
      if (currentIndex >= nextFilteredLen) {
        // 艾宾浩斯模式 + 最后一张 + 还有到期卡片 → 显示循环复习弹窗
        if (isEbbinghausMode && nextFilteredLen > 0) {
          setLoopBackRemainingCount(nextFilteredLen)
          setShowLoopBackModal(true)
          return
        }
        setCurrentIndex(Math.max(0, nextFilteredLen - 1))
      } else if (currentIndex < nextFilteredLen - 1) {
        setCurrentIndex((i) => i + 1)
      } else {
        // 已经在最后一张
        // 艾宾浩斯模式 + 还有到期卡片 → 显示循环复习弹窗
        if (isEbbinghausMode && nextFilteredLen > 0) {
          setLoopBackRemainingCount(nextFilteredLen)
          setShowLoopBackModal(true)
          return
        }
        setCurrentIndex(nextFilteredLen - 1)
      }
    } catch (err) {
      console.error('[handleMark] 标记失败:', err)
      // [Task 4] 失败时回滚 cardStatuses 和 fullCardStatuses
      setCardStatuses(prevCardStatuses)
      setFullCardStatuses(prevFullCardStatuses)
      showToast('标记失败，请重试', 'error')
      // 不切换卡片
    }
  }

  const toggleBookmark = async (cardId) => {
    const bm = await isBookmarked(cardId)
    if (bm) {
      await removeBookmark(cardId)
      setBookmarks((prev) => ({ ...prev, [cardId]: false }))
      showToast('已取消收藏')
    } else {
      await addBookmark(cardId)
      setBookmarks((prev) => ({ ...prev, [cardId]: true }))
      showToast('已收藏')
    }
  }

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const st = el.scrollTop
    lastScrollY.current = st
    setShowBackTop(st > 200)
  }, [])

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ============ Render ============

  const renderEmpty = (title, desc, actions) => (
    <div className="empty-state" style={{ padding: '64px 24px', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="empty-state-icon" style={{
        width: '72px',
        height: '72px',
        borderRadius: 'var(--radius-xl)',
        backgroundColor: 'var(--color-surface)',
        border: '1.5px dashed var(--color-border)',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <p className="empty-state-title" style={{ fontSize: 'var(--text-lg)' }}>{title}</p>
      <p className="empty-state-desc">{desc}</p>
      {actions && <div style={{ marginTop: '8px' }}>{actions}</div>}
    </div>
  )

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-bg)' }}
      onContextMenu={preventTextMenu}
      
    >
      {/* 顶部分类选择栏 */}
      <div
        style={{
          flexShrink: 0,
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border-light)',
          padding: '10px 12px',
        }}
      >
        {state.categories.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '4px 0' }}>
            暂无分类，请先在记录中创建分类
          </p>
        ) : (
          <div style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}>
            {state.categories.map((cat) => {
              const isSelected = selectedCategoryId === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.id)}
                  onTouchStart={(e) => handleLongPressStart(e, cat.id)}
                  onMouseDown={(e) => handleLongPressStart(e, cat.id)}
                  className={`memorize-cat-btn ${isSelected ? 'memorize-cat-btn-active' : ''}`}
                >
                  <span>{cat.name}</span>
                  {activeTooltip === cat.id && isSelected && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-34px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        border: '1px solid var(--color-border-light)',
                        pointerEvents: 'none',
                        zIndex: 20,
                      }}
                    >
                      已选
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {/* 章节 + 单元下拉选择 */}
        {selectedCategoryId && (chapters.length > 0 || chapterUnits.length > 0) && (
          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid var(--color-border)',
          }}>
            {/* 章节下拉 */}
            <FilterDropdown
              value={selectedChapterId || ''}
              placeholder="全部章节"
              options={[
                { value: '', label: '全部章节' },
                ...chapters.map((ch) => ({
                  value: ch.id,
                  label: `${ch.name} (${allCards.filter(c => c.chapterId === ch.id).length})`,
                })),
              ]}
              onChange={(val) => handleSelectChapter(val)}
            />
            {/* 单元下拉 */}
            <FilterDropdown
              value={selectedUnitId || ''}
              placeholder="全部单元"
              options={[
                { value: '', label: '全部单元' },
                ...chapterUnits.map((unit) => ({
                  value: unit.id,
                  label: `${unit.name} (${allCards.filter(c => c.unitId === unit.id).length})`,
                })),
              ]}
              onChange={(val) => setSelectedUnitId(val)}
            />
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '12px 16px 20px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* 未选择分类 */}
        {!selectedCategoryId && renderEmpty(
          '选择分类开始背诵',
          '选择一个分类，然后选择合适的背诵模式开始学习'
        )}

        {/* 加载中 */}
        {loading && renderEmpty(
          '正在加载...',
          '请稍候，正在为您准备卡片'
        )}

        {/* 错误状态 */}
        {!loading && error && renderEmpty(
          '遇到问题',
          error,
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button
              onClick={() => { setError(null); setShowModeModal(true) }}
              className="btn btn-primary btn-sm"
            >重新选择模式</button>
            <button
              onClick={() => { setSelectedCategoryId(null); setStudyMode(null); setError(null); setAllCards([]) }}
              className="btn btn-secondary btn-sm"
            >切换分类</button>
          </div>
        )}

        {/* 空卡片列表（区分不同场景） */}
        {!loading && !error && selectedCategoryId && studyMode && filteredCards.length === 0 && (() => {
          let title, desc;
          if (allCards.length === 0) {
            title = '该分类暂无卡片';
            desc = '请先在记录页为该分类添加背诵卡片';
          } else if (studyMode === 'weak') {
            title = '全部已掌握！';
            desc = '太棒了！没有待掌握的薄弱卡片，继续保持';
          } else if (studyMode === 'ebbinghaus') {
            title = '暂无到期卡片';
            const msg = dueCardsCount > 0
              ? `还有 ${dueCardsCount} 张稍后到期`
              : '暂无到期卡片，请选择其他模式继续学习';
            desc = `当前 ${allCards.length} 张卡片均已安排复习，${msg}`;
          } else {
            title = '该分类暂无卡片';
            desc = '请先在记录页为该分类添加背诵卡片';
          }
          return renderEmpty(
            title,
            desc,
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                onClick={() => { setSelectedCategoryId(null); setStudyMode(null); setAllCards([]); setError(null); }}
                className="btn btn-secondary btn-sm"
              >切换分类</button>
              <button onClick={handleSwitchMode} className="btn btn-primary btn-sm">切换背诵模式</button>
            </div>
          );
        })()}

        {/* 背诵主内容 */}
        {!loading && !error && currentCard && studyMode && (
          <div>
            {/* 复习提醒 / 剩余数量 */}
            {(studyMode === 'ebbinghaus' || reviewOnly) && filteredCards.length > 0 && (
              <div className="memorize-alert memorize-alert-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span style={{ fontSize: '12px', color: 'var(--color-primary-dark)', fontWeight: 500 }}>
                    还剩 {filteredCards.length} 张到期卡片
                  </span>
                  {reviewOnly && studyMode !== 'ebbinghaus' && (
                    <button
                      onClick={handleExitReview}
                      className="memorize-alert-action"
                    >
                      显示全部
                    </button>
                  )}
                </div>
              </div>
            )}
            {dueCardsCount > 0 && studyMode !== 'ebbinghaus' && studyMode !== 'weak' && !reviewOnly && (
              <div className="memorize-alert memorize-alert-warning">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span style={{ fontSize: '12px', color: 'var(--color-warning-dark)' }}>
                    有 {dueCardsCount} 张到期卡片
                  </span>
                  <button
                    onClick={handleContinueReview}
                    className="memorize-alert-action"
                  >
                    立即复习
                  </button>
                </div>
              </div>
            )}

            {/* 顶部进度信息 + 切换模式 */}
            <div className="flex-between" style={{ marginBottom: '8px', alignItems: 'center' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
              }}>
                第 {currentIndex + 1} / {filteredCards.length} 张
                {studyMode === 'weak' && (
                  <span className="badge badge-danger" style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 6px' }}>
                    薄弱卡片
                  </span>
                )}
              </span>
              <button
                onClick={handleSwitchMode}
                className="btn btn-secondary btn-sm"
                style={{ minHeight: '28px', padding: '4px 10px', fontSize: '12px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '3px' }}>
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                切换模式
              </button>
            </div>

            {/* 进度条 */}
            <div className="memorize-progress-track">
              <div
                className="memorize-progress-fill"
                style={{ width: `${((currentIndex + 1) / filteredCards.length) * 100}%` }}
              />
            </div>

            {/* 滑动手势 + 卡片 */}
            <div
              className="memorize-card-wrapper"
              style={{ position: 'relative' }}
              onTouchStart={handleSwipeStart}
              onTouchMove={handleSwipeMove}
              onTouchEnd={handleSwipeEnd}
            >
            {/* O-5：首次滑动提示气泡 */}
            {swipeHintVisible && (
              <div style={{
                position: 'absolute', top: '-36px', left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 12px', borderRadius: '999px',
                backgroundColor: 'var(--color-primary)', color: '#fff',
                fontSize: 'var(--text-xs)', fontWeight: 500, whiteSpace: 'nowrap',
                boxShadow: 'var(--shadow-md)',
                animation: 'mic-pulse 1.8s ease-in-out infinite',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                左右滑动切换卡片
                <button
                  onClick={dismissSwipeHint}
                  style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 0 0 4px', display: 'flex' }}
                  aria-label="关闭提示"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
            {/* 滑动时左侧收藏背景（已移除） */}
              {/* 滑动时右侧操作背景 */}
              {swipeX < 0 && (
                <div style={{
                  position: 'absolute',
                  top: 0, bottom: 0, right: 0,
                  width: `${Math.min(Math.abs(swipeX), 120)}px`,
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary-dark)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '20px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  zIndex: 0,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                  操作
                </div>
              )}

              {/* 卡片容器 */}
              <div
                onClick={handleFlip}
                className="card-flip-container"
                style={{
                  minHeight: 'clamp(280px, 50vh, 420px)',   /* D-9：响应式高度，适配折叠屏/平板 */
                  boxShadow: swipeX ? '0 8px 24px rgba(15,23,42,0.12)' : undefined,
                  transform: swipeX ? `translateX(${swipeX}px)` : undefined,
                  transition: swipeX ? 'none' : 'transform 0.3s ease, box-shadow 0.3s ease',
                }}
              >
                <div
                  className={`card-flip-inner ${flipped ? 'flipped' : ''}`}
                  style={{ minHeight: 'clamp(280px, 50vh, 420px)' }}
                >
                  {/* 正面 - 问题 */}
                  <div className="card-flip-front" style={{ padding: '28px 24px' }}>
                    {/* 顶部标签与操作按钮 */}
                    <div className="flex-between" style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', fontWeight: 600, color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>问题</span>
                        {bookmarks[currentCard.id] && (
                          <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', fontWeight: 600, color: 'var(--color-accent-dark)', backgroundColor: 'var(--color-accent-light)' }}>★ 收藏</span>
                        )}
                        {currentCard.chapterName && (
                          <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', color: 'var(--color-success)', backgroundColor: 'var(--color-success-light)' }}>{currentCard.chapterName}</span>
                        )}
                        {currentCard.unitName && (
                          <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-border-light)' }}>{currentCard.unitName}</span>
                        )}
                        {/* 显示复习状态 */}
                        {fullCardStatuses[currentCard.id] && (() => {
                          const rec = fullCardStatuses[currentCard.id];
                          return (
                            <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-border-light)' }}>
                              {`复习${rec.repetitions || 0}次`}
                            </span>
                          );
                        })()}
                        {/* [Task 6.3] userOverride=true 时显示"用户已手动标记"提示 */}
                        {fullCardStatuses[currentCard.id]?.userOverride && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-border-light)', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                            用户已手动标记
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleBookmark(currentCard.id) }}
                          aria-label={bookmarks[currentCard.id] ? '取消收藏' : '收藏'}
                          style={{
                            width: 36, height: 36,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer',
                            backgroundColor: bookmarks[currentCard.id] ? 'var(--color-accent-light)' : 'transparent',
                            color: bookmarks[currentCard.id] ? 'var(--color-accent-dark)' : 'var(--color-text-muted)',
                          }}
                        >
                          {bookmarks[currentCard.id] ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                          ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                          )}
                        </button>
                        <button onClick={handleOpenEditModal} aria-label="编辑"
                          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-muted)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button onClick={handleOpenMoveModal} aria-label="移动"
                          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-muted)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* 问题内容 */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', minHeight: '140px' }}>
                      <MathText as="p" style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.6, textAlign: 'center', letterSpacing: '0.01em' }}>
                        {currentCard.front}
                      </MathText>
                    </div>

                    {/* 底部翻转提示 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', paddingTop: '8px', opacity: 0.45 }} onClick={(e) => e.stopPropagation()}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                      </svg>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>点击翻转</span>
                    </div>
                  </div>

                  {/* 背面 - 答案 */}
                  <div className="card-flip-back" style={{ padding: '28px 24px' }}>
                    <div className="flex-between" style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', fontWeight: 600, color: 'var(--color-success)', backgroundColor: 'var(--color-success-light)', border: '1px solid var(--color-success)' }}>答案</span>
                        {bookmarks[currentCard.id] && (
                          <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', fontWeight: 600, color: 'var(--color-accent-dark)', backgroundColor: 'var(--color-accent-light)' }}>★ 收藏</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => { e.stopPropagation(); toggleBookmark(currentCard.id) }}
                          aria-label={bookmarks[currentCard.id] ? '取消收藏' : '收藏'}
                          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer', backgroundColor: bookmarks[currentCard.id] ? 'var(--color-accent-light)' : 'transparent', color: bookmarks[currentCard.id] ? 'var(--color-accent-dark)' : 'var(--color-text-muted)' }}>
                          {bookmarks[currentCard.id] ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                          ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                          )}
                        </button>
                        <button onClick={handleOpenEditModal} aria-label="编辑"
                          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-muted)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button onClick={handleOpenMoveModal} aria-label="移动"
                          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-muted)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* 答案内容 */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', minHeight: '120px' }}>
                      <MathText as="p" style={{ fontSize: 'clamp(16px, 4.5vw, 22px)', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.6, textAlign: 'center' }}>
                        {currentCard.back}
                      </MathText>
                    </div>

                    {/* 知识点卡片 */}
                    {currentCard && currentCard.knowledge_point && (
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: 'var(--color-primary-light)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #d0d7e2',
                        opacity: 0.85,
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary-dark)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          知识点
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--color-primary-dark)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {currentCard.knowledge_point}
                        </div>
                      </div>
                    )}

                    {/* 底部翻转提示 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', paddingTop: '12px', opacity: 0.45 }} onClick={(e) => e.stopPropagation()}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                      </svg>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>点击返回</span>
                    </div>
                  </div>
                </div>
              </div>

            {/* 操作按钮 - 两行布局 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              {/* 第一行: 上一张 / 下一张 */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handlePrev}
                  disabled={currentIndex <= 0}
                  className="btn btn-secondary memorize-action-btn"
                  style={{ fontSize: 'var(--text-base)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  上一张
                </button>
                {(() => {
                  const isLast = currentIndex >= filteredCards.length - 1 && filteredCards.length > 0
                  const allMastered = isAllMasteredInCategory()
                  if (isLast && studyMode !== 'ebbinghaus') {
                    if (allMastered) {
                      return (
                        <button
                          onClick={handleComplete}
                          className="btn btn-success memorize-action-btn"
                          style={{ fontSize: 'var(--text-base)' }}
                        >
                          🎉 完成
                        </button>
                      )
                    }
                    return (
                      <button
                        onClick={handleContinueReview}
                        className="memorize-action-btn"
                        style={{
                          fontSize: 'var(--text-base)',
                          backgroundColor: 'var(--color-warning)', color: '#fff',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        继续复习
                      </button>
                    )
                  }
                  return (
                    <button
                      onClick={handleNext}
                      disabled={currentIndex >= filteredCards.length - 1}
                      className="btn btn-primary memorize-action-btn"
                      style={{ fontSize: 'var(--text-base)' }}
                    >
                      下一张
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  )
                })()}
              </div>

              {/* 第二行: 标记操作 */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleMark('mastered')}
                  className={`btn memorize-action-btn ${cardStatuses[currentCard.id] === 'mastered' ? 'btn-success' : 'btn-secondary'}`}
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  已掌握
                </button>
                <button
                  onClick={() => handleMark('learning')}
                  className="btn btn-secondary memorize-action-btn"
                  style={{ fontSize: 'var(--text-sm)', ...(cardStatuses[currentCard.id] === 'learning' ? { backgroundColor: 'var(--color-warning)', color: '#fff', fontWeight: 600 } : {}) }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  学习中
                </button>
                <button
                  onClick={() => handleMark('review')}
                  className={`btn memorize-action-btn ${cardStatuses[currentCard.id] === 'review' ? 'btn-danger' : 'btn-secondary'}`}
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  待掌握
                </button>
                <button
                  onClick={(e) => handleOpenMoveModal(e)}
                  className="btn btn-secondary memorize-action-btn"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                  移动
                </button>
              </div>
            </div>

            {/* 学习统计环形图 */}
            <div className="memorize-stats">
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: `conic-gradient(var(--color-success) ${masteryPercent}%, var(--color-border-light) 0)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--color-success)',
                }}>
                  {masteryPercent}%
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{stats.mastered}</span> 已掌握
                  </span>
                  <span style={{ fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{stats.review}</span> 待掌握
                  </span>
                  <span style={{ fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{stats.new}</span> 新卡片
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  共 {stats.total} 张卡片
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* 返回顶部按钮 */}
      {showBackTop && (
        <button
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border-light)',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
            zIndex: 30,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}

      {/* 模式选择弹窗 */}
      {(showModeModal || closingModal) && (
        <>
          <div
            className={'modal-backdrop' + (closingModal ? ' closing' : '')}
            onClick={handleCancelModeModal}
          />
          <div
            className={'modal-panel' + (closingModal ? ' closing' : '')}
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '85vh' }}
          >
            <div style={{ width: '44px', height: '5px', borderRadius: '3px', backgroundColor: 'var(--color-border)', margin: '0 auto 12px' }} />
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>选择背诵模式</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
                分类：{state.categories.find((c) => c.id === selectedCategoryId)?.name || ''}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {STUDY_MODES.map((mode) => (
                <button
                  key={mode.key}
                  className="mode-option-btn"
                  onClick={() => handleSelectMode(mode.key)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    padding: '16px',
                    textAlign: 'left',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border-light)',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
                    minHeight: '72px',
                  }}
                >
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--color-primary-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <ModeIcon modeKey={mode.key} color="var(--color-primary-dark)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>{mode.title}</p>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>{mode.desc}</p>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, alignSelf: 'center' }}>
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            <button
              onClick={handleCancelModeModal}
              className="btn btn-secondary btn-block"
              style={{ minHeight: '52px', fontSize: 'var(--text-base)' }}
            >取消</button>
          </div>
        </>
      )}

      {/* 左滑操作菜单 */}
      {(showSwipeMenu || closingSwipe) && swipeMenuCard && (
        <>
          <div
            onClick={() => {
              if (closingSwipe) return
              setClosingSwipe(true)
              setTimeout(() => {
                setShowSwipeMenu(false)
                setSwipeMenuCard(null)
                setClosingSwipe(false)
              }, 280)
            }}
            className={'modal-backdrop' + (closingSwipe ? ' closing' : '')}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className={'modal-panel' + (closingSwipe ? ' closing' : '')}
          >
            <div style={{ width: '44px', height: '5px', borderRadius: '3px', backgroundColor: 'var(--color-border)', margin: '0 auto 12px' }} />

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>卡片操作</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {/* 收藏按钮 */}
              <button
                onClick={() => {
                  if (closingSwipe) return
                  if (swipeMenuCard) {
                    const isBookmarked = !!bookmarks[swipeMenuCard.id]
                    toggleBookmark(swipeMenuCard.id)
                    showToast(isBookmarked ? '已取消收藏' : '已加入收藏')
                  }
                  setClosingSwipe(true)
                  setTimeout(() => {
                    setShowSwipeMenu(false)
                    setSwipeMenuCard(null)
                    setClosingSwipe(false)
                  }, 280)
                }}
                style={{
                  width: '100%', minHeight: '52px', padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  textAlign: 'left', borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-border-light)',
                  border: 'none', cursor: 'pointer',
                  color: 'var(--color-text)', fontSize: '15px', fontWeight: 500,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={swipeMenuCard && bookmarks[swipeMenuCard.id] ? 'var(--color-accent-dark)' : 'none'} stroke={swipeMenuCard && bookmarks[swipeMenuCard.id] ? 'var(--color-accent-dark)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {swipeMenuCard && bookmarks[swipeMenuCard.id] ? '取消收藏' : '加入收藏'}
              </button>

              {/* 移动按钮 */}
              <button
                onClick={() => {
                  if (closingSwipe) return
                  if (swipeMenuCard) {
                    setCardToMove(swipeMenuCard)
                    setClosingMove(false)
                    setShowMoveModal(true)
                  }
                  setClosingSwipe(true)
                  setTimeout(() => {
                    setShowSwipeMenu(false)
                    setSwipeMenuCard(null)
                    setClosingSwipe(false)
                  }, 280)
                }}
                style={{
                  width: '100%', minHeight: '52px', padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  textAlign: 'left', borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-border-light)',
                  border: 'none', cursor: 'pointer',
                  color: 'var(--color-text)', fontSize: '15px', fontWeight: 500,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M3 7h18M3 12h18M3 17h18" />
                </svg>
                移动到其他分类/单元
              </button>

              {/* 删除按钮 */}
              <button
                onClick={() => {
                  if (closingSwipe) return
                  if (swipeMenuCard) {
                    setCardToDelete(swipeMenuCard)
                    setShowDeleteConfirm(true)
                  }
                  setClosingSwipe(true)
                  setTimeout(() => {
                    setShowSwipeMenu(false)
                    setSwipeMenuCard(null)
                    setClosingSwipe(false)
                  }, 280)
                }}
                style={{
                  width: '100%', minHeight: '52px', padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  textAlign: 'left', borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-danger-light)',
                  border: 'none', cursor: 'pointer',
                  color: 'var(--color-danger)', fontSize: '15px', fontWeight: 500,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                </svg>
                删除卡片
              </button>
            </div>

            <button
              onClick={() => {
                if (closingSwipe) return
                setClosingSwipe(true)
                setTimeout(() => {
                  setShowSwipeMenu(false)
                  setSwipeMenuCard(null)
                  setClosingSwipe(false)
                }, 280)
              }}
              style={{
                width: '100%', minHeight: '52px', padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: '15px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        visible={showDeleteConfirm}
        title="删除卡片"
        message="确认删除这张卡片吗？此操作无法撤销。"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 编辑卡片弹窗 */}
      {(showEditModal || closingEdit) && (
        <>
          <div
            className={'modal-backdrop' + (closingEdit ? ' closing' : '')}
            onClick={handleCancelEdit}
          />
          <div
            className={'modal-panel' + (closingEdit ? ' closing' : '')}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '44px', height: '5px', borderRadius: '3px', backgroundColor: 'var(--color-border)', margin: '0 auto 12px' }} />
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>编辑卡片</p>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <p style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '8px',
                letterSpacing: '0.04em',
              }}>原始知识点</p>
              <textarea
                value={editKnowledgePoint}
                onChange={(e) => setEditKnowledgePoint(e.target.value)}
                rows={5}
                placeholder="请填写卡片对应的核心知识点，可点击下方按钮让 AI 根据知识点重新生成问题和答案"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: 'var(--text-base)',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text)',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  lineHeight: 1.6,
                  minHeight: 110,
                }}
              />
              <button
                onClick={handleRegenerateFromKnowledgePoint}
                disabled={regenerating}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--color-primary)',
                  backgroundColor: regenerating ? 'var(--color-primary-light)' : 'var(--color-primary)',
                  color: '#fff',
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  cursor: regenerating ? 'wait' : 'pointer',
                  opacity: regenerating ? 0.7 : 1,
                }}
              >
                {regenerating ? 'AI 正在生成中...' : '根据知识点重新生成问题和答案'}
              </button>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <p style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '8px',
                letterSpacing: '0.04em',
              }}>问题</p>
              <textarea
                value={editFront}
                onChange={(e) => setEditFront(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: 'var(--text-base)',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text)',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  lineHeight: 1.6,
                  minHeight: 96,
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <p style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '8px',
                letterSpacing: '0.04em',
              }}>答案</p>
              <textarea
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                rows={6}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: 'var(--text-base)',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text)',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  lineHeight: 1.6,
                  minHeight: 140,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleCancelEdit}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >取消</button>
              <button
                onClick={handleConfirmEdit}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--color-primary)',
                  backgroundColor: 'var(--color-primary)',
                  color: '#fff',
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >保存</button>
            </div>
          </div>
        </>
      )}

      {/* 移动卡片弹窗 */}
      {(showMoveModal || closingMove) && (
        <>
          <div
            className={'modal-backdrop' + (closingMove ? ' closing' : '')}
            onClick={handleCancelMove}
          />
          <div
            className={'modal-panel' + (closingMove ? ' closing' : '')}
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '80vh' }}
          >
            <div style={{ width: '44px', height: '5px', borderRadius: '3px', backgroundColor: 'var(--color-border)', margin: '0 auto 12px' }} />
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>移动卡片到...</p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <p style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '10px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>选择分类</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {state.categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleSelectTargetCategory(cat.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 500,
                      backgroundColor: targetCategoryId === cat.id ? 'var(--color-primary)' : 'var(--color-border-light)',
                      color: targetCategoryId === cat.id ? '#fff' : 'var(--color-text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease, color 0.15s ease',
                      minHeight: '40px',
                    }}
                  >{cat.name}</button>
                ))}
              </div>
            </div>

            {targetCategoryId && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  marginBottom: '10px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>选择单元</p>
                {targetUnits.length === 0 ? (
                  <div style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--color-border-light)',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                  }}>该分类下暂无单元</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {targetUnits.map((unit) => (
                      <button
                        key={unit.id}
                        onClick={() => setTargetUnitId(unit.id)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: 'var(--text-sm)',
                          fontWeight: 500,
                          backgroundColor: targetUnitId === unit.id ? 'var(--color-success)' : 'var(--color-border-light)',
                          color: targetUnitId === unit.id ? '#fff' : 'var(--color-text-secondary)',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                          minHeight: '40px',
                        }}
                      >{unit.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button onClick={handleCancelMove} className="btn btn-secondary" style={{ flex: 1, minHeight: '52px', fontSize: 'var(--text-base)' }}>取消</button>
              <button
                onClick={handleConfirmMove}
                disabled={!targetCategoryId || !targetUnitId}
                className="btn btn-primary"
                style={{
                  flex: 1,
                  minHeight: '52px',
                  fontSize: 'var(--text-base)',
                  opacity: (!targetCategoryId || !targetUnitId) ? 0.4 : 1,
                }}
              >确认移动</button>
            </div>
          </div>
        </>
      )}

      {/* [循环复习] 弹窗（艾宾浩斯模式 + 最后一张 + 还有到期卡片） */}
      {(showLoopBackModal || closingLoopBack) && (
        <div
          className={'modal-center' + (closingLoopBack ? ' closing' : '')}
          onClick={handleCloseLoopBackModal}
        >
          <div
            className="modal-center-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ textAlign: 'center' }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px', lineHeight: 1 }}>📖</div>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 8px 0' }}>
              还有 {loopBackRemainingCount} 张未掌握卡片
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              是否重新复习到期卡片？
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  handleCloseLoopBackModal()
                  setCurrentIndex(0)
                  setFlipped(false)
                }}
                className="btn btn-primary"
                style={{ flex: 1, minHeight: '48px', fontSize: 'var(--text-base)' }}
              >重新复习</button>
              <button
                onClick={() => {
                  handleCloseLoopBackModal()
                  // 延迟调用 handleComplete，等循环复习弹窗动画结束
                  setTimeout(() => {
                    handleComplete()
                  }, 200)
                }}
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: '48px', fontSize: 'var(--text-base)' }}
              >结束复习</button>
            </div>
          </div>
        </div>
      )}

      {/* [Task 1] 完成弹窗（ebbinghaus / 非 ebbinghaus 模式） */}
      {(showCompleteModal || closingComplete) && (
        <div
          className={'modal-center' + (closingComplete ? ' closing' : '')}
          onClick={handleCloseCompleteModal}
        >
          <div
            className="modal-center-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ textAlign: 'center' }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px', lineHeight: 1 }}>🎉</div>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 8px 0' }}>
              {studyMode === 'ebbinghaus' ? '今日复习已完成' : '恭喜完成'}
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              {studyMode === 'ebbinghaus'
                ? `今日到期卡片已全部复习完成，共 ${stats.total} 张卡片`
                : `已完成 ${filteredCards.length} 张卡片的学习`}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {studyMode === 'ebbinghaus' ? (
                <>
                  <button
                    onClick={() => {
                      handleCloseCompleteModal()
                      navigate('/memorize/plan')
                    }}
                    className="btn btn-primary"
                    style={{ flex: 1, minHeight: '48px', fontSize: 'var(--text-base)' }}
                  >查看计划页</button>
                  <button
                    onClick={() => {
                      handleCloseCompleteModal()
                      setReviewOnly(false)
                      setCurrentIndex(0)
                      setFlipped(false)
                    }}
                    className="btn btn-secondary"
                    style={{ flex: 1, minHeight: '48px', fontSize: 'var(--text-base)' }}
                  >继续浏览</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      handleCloseCompleteModal()
                      setCurrentIndex(0)
                      setFlipped(false)
                    }}
                    className="btn btn-primary"
                    style={{ flex: 1, minHeight: '48px', fontSize: 'var(--text-base)' }}
                  >重新开始</button>
                  <button
                    onClick={() => {
                      handleCloseCompleteModal()
                      navigate(-1)
                    }}
                    className="btn btn-secondary"
                    style={{ flex: 1, minHeight: '48px', fontSize: 'var(--text-base)' }}
                  >返回</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
