import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getUnitsByCategory, getChaptersByCategory, getUnitsByChapter, getCardCountByCategory, getCardsByUnit, deleteCard, moveCardToCategory, getCategories, createDataSnapshot, getTopicsByCategory } from '../services/db'
import { updateQuestionBank, getReviewQuestions, checkQuestionBankCompleteness, updateQuestionBankComplete } from '../services/testQuestionService'
import { TEST_TYPES, DIFFICULTY_LEVELS } from '../utils/constants'
import { useBackgroundTask, TASK_TYPE } from '../context/BackgroundTaskContext'
import UnitGroup from '../components/UnitGroup'
import BackToTop from '../components/BackToTop'

export default function UnitTestMain() {
  const { state, showToast } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const { startTask } = useBackgroundTask()
  const [unitData, setUnitData] = useState({})
  const [cardCounts, setCardCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState('')
  const [allCollapsed, setAllCollapsed] = useState(true)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [expandedCats, setExpandedCats] = useState(new Set())
  const [highlightCategoryId, setHighlightCategoryId] = useState(null)
  // 导航定位：从概览点击单元/分类时触发
  const [highlightedUnitId, setHighlightedUnitId] = useState(null) // 高亮动画目标单元
  const [forceExpandedUnitId, setForceExpandedUnitId] = useState(null) // 强制展开的单元
  const [scrollTargetId, setScrollTargetId] = useState(null) // 待滚动到的目标（unitId 或 catId）
  const [showReturnOverview, setShowReturnOverview] = useState(false) // 是否显示「返回概览」浮动按钮
  const categoryRefs = useRef({})
  const overviewPanelRef = useRef(null) // 概览面板 ref，用于 click-outside 检测

  // 卡片操作相关状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [cardToDelete, setCardToDelete] = useState(null)
  const [deleteCategoryId, setDeleteCategoryId] = useState(null)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [cardToMove, setCardToMove] = useState(null)
  const [targetCategoryId, setTargetCategoryId] = useState(null)
  const [targetUnitId, setTargetUnitId] = useState(null)
  const [targetUnits, setTargetUnits] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [chaptersMap, setChaptersMap] = useState({}) // { categoryId: [chapter] }
  // 概览面板视图模式：'unit' | 'chapter'
  const [overviewMode, setOverviewMode] = useState('unit')
  // 章节检测相关状态
  const [selectedChapterId, setSelectedChapterId] = useState(null) // 选中的章节
  const [activeChapterCategoryId, setActiveChapterCategoryId] = useState(null) // 当前章节检测的分类
  // 章节展开状态（章节视图下）
  const [expandedChapters, setExpandedChapters] = useState(new Set())

  // 主题筛选相关状态
  const [selectedTopicMap, setSelectedTopicMap] = useState({}) // { categoryId: topicId | null } 各分类选中的主题
  const [topicsMap, setTopicsMap] = useState({}) // { categoryId: [topic] }

  // 难度选择弹窗状态
  const [showDifficultyModal, setShowDifficultyModal] = useState(false)
  const [pendingTestConfig, setPendingTestConfig] = useState(null)
  // 随机难度：题库完整性预检结果 + 更新确认弹窗
  const [showRandomBankConfirm, setShowRandomBankConfirm] = useState(false)
  const [bankCheckResult, setBankCheckResult] = useState(null)

  // 加载所有分类
  const loadAllCategories = useCallback(async () => {
    const cats = await getCategories()
    setAllCategories(cats)
  }, [])

  // 卡片操作回调
  const handleDeleteCard = useCallback((card, catId) => {
    const cardId = typeof card === 'object' ? card.id : card
    setCardToDelete({ id: cardId })
    setDeleteCategoryId(catId)
    setShowDeleteConfirm(true)
  }, [])

  const handleMoveCard = useCallback((card) => {
    const cardObj = typeof card === 'object' ? card : { id: card }
    setCardToMove(cardObj)
    setTargetCategoryId(null)
    setTargetUnitId(null)
    setTargetUnits([])
    loadAllCategories()
    setShowMoveModal(true)
  }, [loadAllCategories])

  const handleBookmarkCard = useCallback(() => {}, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!cardToDelete) return
    try {
      await deleteCard(cardToDelete.id, deleteCategoryId)
      showToast('卡片已删除')
      // 刷新当前分类的数据
      const cats = Array.from(expandedCats)
      for (const catId of cats) {
        const units = await getUnitsByCategory(catId)
        const data = {}
        for (const u of units) {
          const cards = await getCardsByUnit(u.id)
          data[u.id] = cards
        }
        setUnitData(prev => ({ ...prev, [catId]: data }))
      }
    } catch (err) {
      showToast('删除失败：' + (err?.message || '未知错误'))
    } finally {
      setShowDeleteConfirm(false)
      setCardToDelete(null)
      setDeleteCategoryId(null)
    }
  }, [cardToDelete, deleteCategoryId, expandedCats, showToast])

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
    setCardToDelete(null)
    setDeleteCategoryId(null)
  }, [])

  const handleSelectTargetCategory = useCallback(async (catId) => {
    setTargetCategoryId(catId)
    setTargetUnitId(null)
    if (catId) {
      const units = await getUnitsByCategory(catId)
      setTargetUnits(units)
    } else {
      setTargetUnits([])
    }
  }, [])

  const handleConfirmMove = useCallback(async () => {
    if (!cardToMove || !targetCategoryId || !targetUnitId) {
      showToast('请选择目标分类和单元')
      return
    }
    try {
      await moveCardToCategory(cardToMove.id, targetCategoryId, targetUnitId)
      showToast('卡片已移动')
      // 刷新数据
      const cats = Array.from(expandedCats)
      for (const catId of cats) {
        const units = await getUnitsByCategory(catId)
        const data = {}
        for (const u of units) {
          const cards = await getCardsByUnit(u.id)
          data[u.id] = cards
        }
        setUnitData(prev => ({ ...prev, [catId]: data }))
      }
    } catch (err) {
      showToast('移动失败：' + (err?.message || '未知错误'))
    } finally {
      setShowMoveModal(false)
      setCardToMove(null)
      setTargetCategoryId(null)
      setTargetUnitId(null)
    }
  }, [cardToMove, targetCategoryId, targetUnitId, expandedCats, showToast])

  const handleCancelMove = useCallback(() => {
    setShowMoveModal(false)
    setCardToMove(null)
    setTargetCategoryId(null)
    setTargetUnitId(null)
  }, [])

  // 构建 AI 配置对象
  const aiConfig = {
    apiKey: state.apiKey,
    model: state.model,
    aiServiceMode: state.aiServiceMode,
    sparkModel: state.iflytekSparkModel || 'lite',
    sparkApiKey: state.iflytekSparkApiKey,
    sparkApiSecret: state.iflytekApiSecret,
    volcanoApiKey: state.volcanoApiKey,
    dashscopeApiKey: state.dashscopeApiKey,
  }
  const userId = state.user?.id || state.user?.uid || ''

  // 处理 URL 参数中的 highlightCategoryId，定位并高亮对应分类
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const catId = params.get('highlightCategoryId')
    if (catId) {
      setHighlightCategoryId(catId)
      // 展开该分类
      setExpandedCats(prev => {
        const next = new Set(prev)
        next.add(catId)
        return next
      })
      // 打开概览面板
      setOverviewOpen(true)
      // 清除 URL 参数
      navigate(location.pathname, { replace: true })
    }
  }, [location.search, navigate, location.pathname])

  // 数据加载后滚动到高亮分类
  useEffect(() => {
    if (highlightCategoryId && categoryRefs.current[highlightCategoryId]) {
      const el = categoryRefs.current[highlightCategoryId]
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const timer = setTimeout(() => setHighlightCategoryId(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [highlightCategoryId, unitData])

  // 概览面板点击定位：滚动到目标 + 高亮动画
  useEffect(() => {
    if (!scrollTargetId) return

    // 延迟等 DOM 渲染完成后再滚动
    const timer = setTimeout(() => {
      // 先尝试按 unitId 找，再按 categoryId 找
      let el = document.querySelector(`[data-unit-id="${scrollTargetId}"]`)
      if (!el) {
        el = document.querySelector(`[data-category-id="${scrollTargetId}"]`)
      }
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        // 如果是单元目标，设置高亮
        if (document.querySelector(`[data-unit-id="${scrollTargetId}"]`)) {
          setHighlightedUnitId(scrollTargetId)
          setForceExpandedUnitId(scrollTargetId)
        }
      }
      setScrollTargetId(null)
      // 显示返回概览按钮
      setShowReturnOverview(true)
    }, 150)

    return () => clearTimeout(timer)
  }, [scrollTargetId])

  // 监听滚动：当用户回到顶部附近时隐藏「返回概览」按钮
  useEffect(() => {
    const container = document.querySelector('.page-container')
    if (!container) return
    const handleScroll = () => {
      setShowReturnOverview(container.scrollTop > 200)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // 概览面板开启时，点击面板外部区域关闭概览（替代 fixed 遮罩层）
  useEffect(() => {
    if (!overviewOpen) return
    const handleClickOutside = (e) => {
      const panel = overviewPanelRef.current
      if (!panel) return
      // 点击在概览面板内部 → 不关闭
      if (panel.contains(e.target)) return
      // 点击在概览头部按钮上 → 不关闭（由按钮自己处理 toggle）
      const header = document.querySelector('.unit-overview-header')
      if (header && header.contains(e.target)) return
      setOverviewOpen(false)
    }
    // 用 mousedown 比 click 更早触发，避免与导航点击冲突
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [overviewOpen])

  useEffect(() => {
    const loadData = async () => {
      const counts = {}
      const data = {}
      for (const cat of state.categories) {
        try {
          counts[cat.id] = await getCardCountByCategory(cat.id)
          const units = await getUnitsByCategory(cat.id)
          const enrichedUnits = await Promise.all(
            units.map(async (unit) => {
              const { getCardsByUnit } = await import('../services/db')
              const cards = await getCardsByUnit(unit.id)
              return { ...unit, cardCount: cards.length }
            })
          )
          data[cat.id] = enrichedUnits
        } catch (e) {
          console.error('加载单元数据失败:', e)
          data[cat.id] = []
          counts[cat.id] = 0
        }
      }
      setUnitData(data)
      setCardCounts(counts)
      // 加载章节数据
      const chaptersByCategory = {}
      for (const cat of state.categories) {
        try {
          chaptersByCategory[cat.id] = await getChaptersByCategory(cat.id)
        } catch (e) {
          chaptersByCategory[cat.id] = []
        }
      }
      setChaptersMap(chaptersByCategory)
      // 加载主题数据
      const topicsByCategory = {}
      for (const cat of state.categories) {
        try {
          topicsByCategory[cat.id] = await getTopicsByCategory(cat.id)
        } catch (e) {
          topicsByCategory[cat.id] = []
        }
      }
      setTopicsMap(topicsByCategory)
    }
    if (state.categories.length > 0) {
      loadData()
    } else {
      setUnitData({})
      setCardCounts({})
    }
  }, [state.categories])

  // ========== 按钮事件处理 ==========

  /** 更新题库（后台任务） */
  const handleCategoryUpdateBank = useCallback(async (catId) => {
    const cat = state.categories.find(c => c.id === catId)
    const name = cat ? cat.name : catId
    startTask({
      type: TASK_TYPE.QUESTION_BANK_UPDATE,
      title: `分类题库：${name}`,
      cancelable: true,
      taskFn: async (updateProgress, isCancelled) => {
        updateProgress(0, '正在获取卡片数据...')
        const result = await updateQuestionBank(TEST_TYPES.CATEGORY, catId, aiConfig, showToast, userId, undefined, updateProgress)
        updateProgress(100, `完成：新增 ${result.added || 0} 道题目`)
        return result
      },
    })
    showToast(`"${name}"题库更新已加入后台任务`, 'info')
  }, [state.categories, aiConfig, showToast, userId, startTask])

  const handleUnitUpdateBank = useCallback(async (unitId) => {
    startTask({
      type: TASK_TYPE.QUESTION_BANK_UPDATE,
      title: `单元题库更新`,
      cancelable: true,
      taskFn: async (updateProgress, isCancelled) => {
        updateProgress(0, '正在获取卡片数据...')
        const result = await updateQuestionBank(TEST_TYPES.UNIT, unitId, aiConfig, showToast, userId, undefined, updateProgress)
        updateProgress(100, `完成：新增 ${result.added || 0} 道题目`)
        return result
      },
    })
    showToast('单元题库更新已加入后台任务', 'info')
  }, [aiConfig, showToast, userId, startTask])

  /** 跳转到测试页面（统一封装，需在 startTestWithDifficulty 之前定义避免 TDZ） */
  const navigateToTestPage = useCallback((testType, id, difficulty) => {
    if (testType === TEST_TYPES.UNIT) {
      navigate(`/test/unit?mode=unit&unitId=${id}&difficulty=${difficulty}`)
    } else if (testType === TEST_TYPES.CHAPTER) {
      navigate(`/test/unit?mode=chapter&chapterId=${id}&difficulty=${difficulty}`)
    } else {
      navigate(`/test/unit?mode=category&categoryId=${id}&difficulty=${difficulty}`)
    }
  }, [navigate])

  const startTestWithDifficulty = useCallback(async (difficulty) => {
    if (!pendingTestConfig) return
    const { testType, id } = pendingTestConfig

    // 随机难度：先做题库完整性预检
    if (difficulty === 'random') {
      setShowDifficultyModal(false)
      setPendingTestConfig(null)
      setLoading(true)
      setLoadingAction('正在检查题库完整性...')
      try {
        const checkResult = await checkQuestionBankCompleteness(testType, id)
        setLoading(false)
        setLoadingAction('')
        if (!checkResult.complete) {
          // 题库不全：弹出确认对话框，提示用户更新题库
          setBankCheckResult({ ...checkResult, testType, id, difficulty })
          setShowRandomBankConfirm(true)
          return
        }
        // 题库完整：直接跳转测试页（difficulty=random）
        navigateToTestPage(testType, id, difficulty)
        return
      } catch (e) {
        setLoading(false)
        setLoadingAction('')
        showToast('题库检查失败: ' + (e.message || '未知错误'), 'error')
        return
      }
    }

    // 非随机难度：后台更新题库 → 完成后自动跳转测试页
    setShowDifficultyModal(false)
    setPendingTestConfig(null)

    const typeLabel = testType === TEST_TYPES.UNIT ? '单元' :
      testType === TEST_TYPES.CHAPTER ? '章节' : '分类'
    const diffLabel = difficulty === 1 ? '简易' : difficulty === 2 ? '中等' : difficulty === 3 ? '困难' : '随机'

    const { promise } = startTask({
      type: TASK_TYPE.QUESTION_BANK_UPDATE,
      title: `${typeLabel}检测准备（${diffLabel}）`,
      cancelable: true,
      taskFn: async (updateProgress, isCancelled) => {
        updateProgress(0, `正在生成${diffLabel}难度题目...`)
        const result = await updateQuestionBank(testType, id, aiConfig, showToast, userId, difficulty, updateProgress)
        updateProgress(100, `完成：新增 ${result.added || 0} 道题目`)
        return result
      },
    })

    showToast(`"${typeLabel}"检测准备已加入后台任务`, 'info')

    // 后台等待完成，完成后自动跳转
    promise.then(res => {
      if (res?.cancelled) return
      if (res?.success) {
        sessionStorage.setItem('lastAiGenerationTime', Date.now().toString())
        navigateToTestPage(testType, id, difficulty)
      }
    })
  }, [pendingTestConfig, aiConfig, showToast, userId, navigateToTestPage, startTask])

  /** 随机难度：确认更新题库（后台全量补全所有缺失的难度/题型组合） */
  const confirmUpdateBankForRandom = useCallback(async () => {
    if (!bankCheckResult) return
    const { testType, id, difficulty } = bankCheckResult
    setShowRandomBankConfirm(false)
    setBankCheckResult(null)

    const typeLabel = testType === TEST_TYPES.UNIT ? '单元' :
      testType === TEST_TYPES.CHAPTER ? '章节' : '分类'

    // 启动后台全量补全任务
    const { taskId, promise } = startTask({
      type: TASK_TYPE.QUESTION_BANK_RANDOM,
      title: `${typeLabel}题库全量补全`,
      cancelable: true,
      taskFn: async (updateProgress, isCancelled) => {
        const result = await updateQuestionBankComplete(
          testType, id, aiConfig, showToast, userId,
          updateProgress, isCancelled, 10
        )
        if (result.complete) {
          updateProgress(100, `补全完成：新增 ${result.totalAdded} 道，共 ${result.rounds} 轮`)
        } else if (result.reason === 'cancelled') {
          updateProgress(undefined, '用户已取消')
        } else {
          updateProgress(undefined, `部分补全：新增 ${result.totalAdded} 道，仍缺 ${result.missingCount} 个`)
        }
        return result
      },
    })

    showToast(`"${typeLabel}"题库补全已加入后台任务，完成后将自动进入测试`, 'info')

    // 后台等待任务完成，完成后自动跳转测试页
    promise.then(res => {
      if (res?.cancelled) return
      if (res?.success) {
        sessionStorage.setItem('lastAiGenerationTime', Date.now().toString())
        navigateToTestPage(testType, id, difficulty)
      }
    })
  }, [bankCheckResult, aiConfig, showToast, userId, navigateToTestPage, startTask])

  /** 随机难度：取消更新题库，但仍进入测试（用已有题目） */
  const cancelUpdateBankForRandom = useCallback(() => {
    if (!bankCheckResult) return
    const { testType, id, difficulty } = bankCheckResult
    setShowRandomBankConfirm(false)
    setBankCheckResult(null)
    showToast('已使用现有题库进入随机测试（部分知识点可能无题）', 'info')
    navigateToTestPage(testType, id, difficulty)
  }, [bankCheckResult, navigateToTestPage, showToast])

  /** 单元检测：先显示难度选择弹窗 */
  const handleUnitTest = useCallback(async (unitId) => {
    setPendingTestConfig({ testType: TEST_TYPES.UNIT, id: unitId })
    setShowDifficultyModal(true)
  }, [])

  /** 分类检测：先显示难度选择弹窗 */
  const handleCategoryTest = useCallback(async (catId) => {
    setPendingTestConfig({ testType: TEST_TYPES.CATEGORY, id: catId })
    setShowDifficultyModal(true)
  }, [])

  /** 单元复习：直接获取复习题目 → 跳转 */
  const handleUnitReview = useCallback(async (unitId) => {
    setLoading(true)
    setLoadingAction('正在准备单元复习...')
    try {
      const result = await getReviewQuestions(TEST_TYPES.UNIT, unitId)
      if (result.success) {
        showToast(result.message, 'success')
        navigate('/test/unit?mode=review&unitId=' + unitId)
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('单元复习准备失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [navigate, showToast])

  /** 分类复习：直接获取复习题目 → 跳转 */
  const handleCategoryReview = useCallback(async (catId) => {
    setLoading(true)
    setLoadingAction('正在准备分类复习...')
    try {
      const result = await getReviewQuestions(TEST_TYPES.CATEGORY, catId)
      if (result.success) {
        showToast(result.message, 'success')
        navigate('/test/unit?mode=review&categoryId=' + catId)
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('分类复习准备失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [navigate, showToast])

  /** 章节检测：先显示难度选择弹窗 */
  const handleChapterTest = useCallback(async (chapterId) => {
    if (!chapterId) return
    setPendingTestConfig({ testType: TEST_TYPES.CHAPTER, id: chapterId })
    setShowDifficultyModal(true)
  }, [])

  /** 章节复习：直接获取复习题目 → 跳转 */
  const handleChapterReview = useCallback(async (chapterId) => {
    if (!chapterId) return
    setLoading(true)
    setLoadingAction('正在准备章节复习...')
    try {
      const result = await getReviewQuestions(TEST_TYPES.CHAPTER, chapterId)
      if (result.success) {
        showToast(result.message, 'success')
        navigate('/test/unit?mode=chapterReview&chapterId=' + chapterId)
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('章节复习准备失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [navigate, showToast])

  /** 章节更新题库（后台任务） */
  const handleChapterUpdateBank = useCallback(async (chapterId) => {
    if (!chapterId) return
    startTask({
      type: TASK_TYPE.QUESTION_BANK_UPDATE,
      title: `章节题库更新`,
      cancelable: true,
      taskFn: async (updateProgress, isCancelled) => {
        updateProgress(0, '正在获取卡片数据...')
        const result = await updateQuestionBank(TEST_TYPES.CHAPTER, chapterId, aiConfig, showToast, userId, undefined, updateProgress)
        updateProgress(100, `完成：新增 ${result.added || 0} 道题目`)
        return result
      },
    })
    showToast('章节题库更新已加入后台任务', 'info')
  }, [aiConfig, showToast, userId, startTask])

  /** 主题选择处理：仅更新选中主题，章节筛选由渲染层 filter 完成 */
  const handleTopicSelect = useCallback(async (catId, topicId) => {
    // 仅更新选中主题，不修改 chaptersMap
    // chaptersMap[catId] 始终保持该分类的全部章节
    // 渲染层通过 catChapters = chaptersMap[catId]?.filter(ch => ch.topicId === topicId) 完成筛选
    setSelectedTopicMap(prev => ({
      ...prev,
      [catId]: topicId,
    }))
  }, [])

  const renderCategoryActions = (catId) => (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
      <button
        className="btn btn-sm btn-secondary"
        style={{ minHeight: '44px', fontSize: 'var(--text-xs)' }}
        onClick={(e) => { e.stopPropagation(); handleCategoryTest(catId) }}
        disabled={loading}
      >
        分类检测
      </button>
      <button
        className="btn btn-sm btn-secondary"
        style={{ minHeight: '44px', fontSize: 'var(--text-xs)' }}
        onClick={(e) => { e.stopPropagation(); handleCategoryReview(catId) }}
        disabled={loading}
      >
        分类复习
      </button>
      <button
        className="btn btn-sm btn-secondary"
        style={{ minHeight: '44px', fontSize: 'var(--text-xs)' }}
        onClick={(e) => { e.stopPropagation(); handleCategoryUpdateBank(catId) }}
        disabled={loading}
      >
        更新题库
      </button>
    </div>
  )

  const renderUnitActions = (unit, catId) => {
    const hasCards = unit.cardCount > 0
    return (
      <>
        <button
          className="btn btn-sm"
          disabled={!hasCards || loading}
          title={!hasCards ? '该单元暂无知识点' : ''}
          style={{
            minHeight: '44px',
            fontSize: 'var(--text-xs)',
            padding: '6px 10px',
            backgroundColor: hasCards && !loading ? 'var(--color-surface)' : 'var(--color-border-light)',
            color: hasCards && !loading ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: hasCards && !loading ? 'pointer' : 'not-allowed',
            fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (hasCards && !loading) handleUnitTest(unit.id) }}
        >
          单元检测
        </button>
        <button
          className="btn btn-sm"
          disabled={!hasCards || loading}
          title={!hasCards ? '该单元暂无知识点' : ''}
          style={{
            minHeight: '44px',
            fontSize: 'var(--text-xs)',
            padding: '6px 10px',
            backgroundColor: hasCards && !loading ? 'var(--color-success-light)' : 'var(--color-border-light)',
            color: hasCards && !loading ? 'var(--color-success-dark)' : 'var(--color-text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: hasCards && !loading ? 'pointer' : 'not-allowed',
            fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (hasCards && !loading) handleUnitReview(unit.id) }}
        >
          单元复习
        </button>
        <button
          className="btn btn-sm"
          disabled={loading}
          style={{
            minHeight: '44px',
            fontSize: 'var(--text-xs)',
            padding: '6px 10px',
            backgroundColor: loading ? 'var(--color-border-light)' : 'var(--color-accent-light)',
            color: loading ? 'var(--color-text-muted)' : 'var(--color-accent-dark)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (!loading) handleUnitUpdateBank(unit.id) }}
        >
          更新题库
        </button>
      </>
    )
  }

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <div
      onContextMenu={preventTextMenu}
      
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      {/* 加载遮罩 */}
      {loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.15)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            padding: '24px 32px', maxWidth: '280px', textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              border: '3px solid var(--color-border-light)',
              borderTopColor: 'var(--color-primary)',
              margin: '0 auto 12px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
              {loadingAction}
            </p>
          </div>
        </div>
      )}

      <div className="page-container" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '20px 16px 120px',
        width: '100%',
      }}>
        <div className="anim-slide-in-up" style={{ marginBottom: '20px' }}>
          <h1 style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: '6px',
            letterSpacing: '-0.01em',
          }}>单元检测</h1>
          {state.categories.length > 0 && (
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}>
              {state.categories.length} 个分类
            </p>
          )}
        </div>

        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '24px',
        }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: '44px' }}
            onClick={() => navigate('/test/answer-records')}
          >
            答题记录
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: '44px' }}
            onClick={() => navigate('/test/unit?mode=wrong')}
          >
            我的错题本
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: '44px' }}
            onClick={() => navigate('/test/question-bank')}
          >
            题库管理
          </button>
        </div>

        {/* 单元概览 — 分类→单元层级导航 + 一键收缩/展开 */}
        {state.categories.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setOverviewOpen(!overviewOpen)}
                className="unit-overview-header"
                style={{ flex: 1 }}
              >
                <span className="unit-overview-header-text">
                  {overviewOpen ? '▲' : '▼'} 检测概览 · 共 {state.categories.length} 个分类
                </span>
              </button>
              <button
                onClick={() => setAllCollapsed(prev => !prev)}
                className="unit-collapse-btn"
                title={allCollapsed ? '展开全部单元' : '收起全部单元'}
                aria-label={allCollapsed ? '展开全部单元' : '收起全部单元'}
              >
                <svg
                  width="18" height="18"
                  viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    transition: 'transform 0.3s ease',
                    transform: allCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                  }}
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            <div
              ref={overviewPanelRef}
              className={'unit-overview-panel' + (overviewOpen ? ' unit-overview-panel-open' : '')} style={{
              maxHeight: overviewOpen ? '60vh' : '0',
              overflowY: overviewOpen ? 'auto' : 'hidden',
              overscrollBehaviorY: 'auto',
              transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              paddingRight: overviewOpen ? '2px' : '0',
              margin: '0 -2px 0 0',
            }}>
              {/* O-9：视图切换说明 */}
              <div style={{
                fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
                marginBottom: '6px', padding: '0 2px',
              }}>
                {overviewMode === 'unit' ? '按教材单元组织，适合系统复习' : '按章节归类，适合专题突破'}
              </div>
              {/* Tab 视图切换按钮 */}
              <div style={{
                display: 'flex',
                marginBottom: '12px',
                backgroundColor: 'var(--color-border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '3px',
              }}>
                <button
                  onClick={() => {
                    setOverviewMode('unit')
                    setSelectedChapterId(null)
                    setActiveChapterCategoryId(null)
                    setExpandedChapters(new Set())
                    setSelectedTopicMap({})
                  }}
                  style={{
                    flex: 1, minHeight: '44px',
                    border: 'none', borderRadius: 'calc(var(--radius-md) - 2px)',
                    fontSize: 'var(--text-sm)', fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: overviewMode === 'unit' ? 'var(--color-primary)' : 'transparent',
                    color: overviewMode === 'unit' ? '#fff' : 'var(--color-text-secondary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 8px',
                  }}
                >
                  单元视图
                </button>
                <button
                  onClick={() => {
                    setOverviewMode('chapter')
                    setSelectedChapterId(null)
                    setActiveChapterCategoryId(null)
                    setExpandedChapters(new Set())
                  }}
                  style={{
                    flex: 1, minHeight: '44px',
                    border: 'none', borderRadius: 'calc(var(--radius-md) - 2px)',
                    fontSize: 'var(--text-sm)', fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: overviewMode === 'chapter' ? 'var(--color-primary)' : 'transparent',
                    color: overviewMode === 'chapter' ? '#fff' : 'var(--color-text-secondary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 8px',
                  }}
                >
                  章节视图
                </button>
              </div>

              {/* ===== 单元视图 ===== */}
              {overviewMode === 'unit' && state.categories.map((cat) => {
                const catExpanded = expandedCats.has(cat.id)
                const catUnits = unitData[cat.id] || []
                const isHighlighted = highlightCategoryId === cat.id
                return (
                  <div key={cat.id}>
                    {/* 分类行 */}
                    <div
                      ref={el => categoryRefs.current[cat.id] = el}
                      className="unit-overview-item"
                      onClick={() => {
                        setExpandedCats(prev => {
                          const next = new Set(prev)
                          if (next.has(cat.id)) next.delete(cat.id)
                          else next.add(cat.id)
                          return next
                        })
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        background: isHighlighted ? 'var(--color-warning-light)' : 'var(--color-primary-light)',
                        borderRadius: catExpanded ? '8px 8px 0 0' : '8px',
                        transition: 'background-color 0.3s ease',
                        boxShadow: isHighlighted ? '0 0 0 2px var(--color-warning)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <svg
                          width="14" height="14"
                          viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{
                            flexShrink: 0,
                            color: 'var(--color-primary)',
                            transition: 'transform 0.2s',
                            transform: catExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {cat.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '12px',
                          color: 'var(--color-text-secondary)',
                        }}>
                          {catUnits.length} 单元 · {cardCounts[cat.id] || 0} 张
                        </span>
                        {/* 定位图标：点击跳转到分类区域 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setScrollTargetId(cat.id)
                          }}
                          title="定位到此分类"
                          style={{
                            width: '28px', height: '28px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: 'none', borderRadius: '6px',
                            background: 'var(--color-surface)',
                            color: 'var(--color-primary-dark)',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* 单元行（分类展开后显示） */}
                    <div style={{
                      maxHeight: catExpanded ? '600px' : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}>
                      {catUnits.map((unit) => (
                        <div
                          key={unit.id}
                          className="unit-overview-item"
                          onClick={() => {
                            // 导航到目标单元：自动展开 + 高亮 + 滚动
                            setScrollTargetId(unit.id)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 14px 10px 36px',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{
                            width: 6, height: 6,
                            borderRadius: '50%',
                            background: 'var(--color-primary)',
                            flexShrink: 0,
                          }} />
                          <span className="unit-overview-item-name" style={{ minWidth: 0, flex: 1 }}>
                            {unit.name}
                          </span>
                          <span style={{
                            fontSize: '12px',
                            color: 'var(--color-text-secondary)',
                            flexShrink: 0,
                          }}>
                            {unit.cardCount || 0} 张
                          </span>
                        </div>
                      ))}
                      {catUnits.length === 0 && (
                        <div style={{
                          padding: '6px 14px 10px 36px',
                          fontSize: '12px',
                          color: 'var(--color-text-muted)',
                        }}>
                          暂无单元
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* ===== 章节视图 ===== */}
              {overviewMode === 'chapter' && state.categories.map((cat) => {
                const catExpanded = expandedCats.has(cat.id)
                // 主题筛选逻辑：如果选中了某个主题，则使用该主题下的章节
                const catChapters = (() => {
                  if (selectedTopicMap[cat.id]) {
                    return chaptersMap[cat.id]?.filter(ch => ch.topicId === selectedTopicMap[cat.id]) || []
                  }
                  return chaptersMap[cat.id] || []
                })()
                const catUnits = unitData[cat.id] || []
                const isHighlighted = highlightCategoryId === cat.id
                const catTopics = topicsMap[cat.id] || []
                return (
                  <div key={cat.id}>
                    {/* 分类行 */}
                    <div
                      ref={el => categoryRefs.current[cat.id] = el}
                      className="unit-overview-item"
                      onClick={() => {
                        setExpandedCats(prev => {
                          const next = new Set(prev)
                          if (next.has(cat.id)) next.delete(cat.id)
                          else next.add(cat.id)
                          return next
                        })
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        background: isHighlighted ? 'var(--color-warning-light)' : 'var(--color-primary-light)',
                        borderRadius: catExpanded ? '8px 8px 0 0' : '8px',
                        transition: 'background-color 0.3s ease',
                        boxShadow: isHighlighted ? '0 0 0 2px var(--color-warning)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <svg
                          width="14" height="14"
                          viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{
                            flexShrink: 0,
                            color: 'var(--color-primary)',
                            transition: 'transform 0.2s',
                            transform: catExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {cat.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '12px',
                          color: 'var(--color-text-secondary)',
                        }}>
                          {catChapters.length} 章节 · {cardCounts[cat.id] || 0} 张
                        </span>
                      </div>
                    </div>

                    {/* 章节列表（分类展开后显示） */}
                    <div style={{
                      maxHeight: catExpanded ? '800px' : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}>
                      {/* 主题筛选 UI（章节视图下、分类展开后显示） */}
                      {catExpanded && catTopics.length > 0 && (
                        <div style={{
                          padding: '10px 14px 10px 36px',
                          borderBottom: '1px solid var(--color-border-light)',
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '8px',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                              按主题筛选
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            <button
                              onClick={() => handleTopicSelect(cat.id, null)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--color-border)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                backgroundColor: !selectedTopicMap[cat.id] ? 'var(--color-primary)' : 'transparent',
                                color: !selectedTopicMap[cat.id] ? '#fff' : 'var(--color-text-secondary)',
                              }}
                            >
                              全部章节
                            </button>
                            {catTopics.map((topic) => (
                              <button
                                key={topic.id}
                                onClick={() => handleTopicSelect(cat.id, topic.id)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--color-border)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  backgroundColor: selectedTopicMap[cat.id] === topic.id ? 'var(--color-success)' : 'transparent',
                                  color: selectedTopicMap[cat.id] === topic.id ? '#fff' : 'var(--color-text-secondary)',
                                }}
                              >
                                {topic.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {(() => {
                        const unassignedUnits = catUnits.filter(u => !u.chapterId)
                        return (
                          <>
                            {catChapters.map((ch) => {
                              const chExpanded = expandedChapters.has(ch.id)
                              const chUnits = catUnits.filter(u => u.chapterId === ch.id)
                              const chCardCount = chUnits.reduce((sum, u) => sum + (u.cardCount || 0), 0)
                              return (
                                <div key={ch.id}>
                                  {/* 章节行 */}
                                  <div
                                    className="unit-overview-item"
                                    onClick={() => {
                                      setExpandedChapters(prev => {
                                        const next = new Set(prev)
                                        if (next.has(ch.id)) next.delete(ch.id)
                                        else next.add(ch.id)
                                        return next
                                      })
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 8,
                                      padding: '10px 14px 10px 36px',
                                      cursor: 'pointer',
                                      background: chExpanded ? 'var(--color-success-light)' : 'transparent',
                                      borderRadius: chExpanded ? '8px 8px 0 0' : '0',
                                      transition: 'background-color 0.2s ease',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                      <svg
                                        width="12" height="12"
                                        viewBox="0 0 24 24"
                                        fill="none" stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round"
                                        style={{
                                          flexShrink: 0,
                                          color: 'var(--color-success)',
                                          transition: 'transform 0.2s',
                                          transform: chExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                        }}
                                      >
                                        <path d="M9 18l6-6-6-6" />
                                      </svg>
                                      <span style={{
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        color: 'var(--color-text)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {ch.name}
                                      </span>
                                    </div>
                                    <span style={{
                                      fontSize: '11px',
                                      color: 'var(--color-text-secondary)',
                                      flexShrink: 0,
                                    }}>
                                      {chCardCount} 张
                                    </span>
                                  </div>

                                  {/* 章节展开内容 */}
                                  <div style={{
                                    maxHeight: chExpanded ? '600px' : '0',
                                    overflow: 'hidden',
                                    transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                  }}>
                                    {/* 操作按钮区 */}
                                    <div style={{
                                      display: 'flex',
                                      gap: '8px',
                                      padding: '8px 14px 8px 48px',
                                      flexWrap: 'wrap',
                                    }}>
                                      <button
                                        className="btn btn-sm"
                                        style={{
                                          flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                          backgroundColor: 'var(--color-surface)',
                                          color: 'var(--color-primary-dark)',
                                          border: 'none', borderRadius: 'var(--radius-sm)',
                                          cursor: loading ? 'not-allowed' : 'pointer',
                                          fontWeight: 500, opacity: loading ? 0.6 : 1,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); if (!loading) handleChapterTest(ch.id) }}
                                        disabled={loading}
                                      >
                                        章节检测
                                      </button>
                                      <button
                                        className="btn btn-sm"
                                        style={{
                                          flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                          backgroundColor: 'var(--color-success-light)',
                                          color: 'var(--color-success-dark)',
                                          border: 'none', borderRadius: 'var(--radius-sm)',
                                          cursor: loading ? 'not-allowed' : 'pointer',
                                          fontWeight: 500, opacity: loading ? 0.6 : 1,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); if (!loading) handleChapterReview(ch.id) }}
                                        disabled={loading}
                                      >
                                        章节复习
                                      </button>
                                      <button
                                        className="btn btn-sm"
                                        style={{
                                          flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                          backgroundColor: 'var(--color-accent-light)',
                                          color: 'var(--color-accent-dark)',
                                          border: 'none', borderRadius: 'var(--radius-sm)',
                                          cursor: loading ? 'not-allowed' : 'pointer',
                                          fontWeight: 500, opacity: loading ? 0.6 : 1,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); if (!loading) handleChapterUpdateBank(ch.id) }}
                                        disabled={loading}
                                      >
                                        更新题库
                                      </button>
                                    </div>

                                    {/* 该章节下的单元列表 */}
                                    {chUnits.length === 0 ? (
                                      <div style={{
                                        padding: '6px 14px 10px 48px',
                                        fontSize: '12px',
                                        color: 'var(--color-text-muted)',
                                      }}>
                                        该章节下暂无单元
                                      </div>
                                    ) : (
                                      chUnits.map((unit) => (
                                        <div
                                          key={unit.id}
                                          className="unit-overview-item"
                                          onClick={() => {
                                            setScrollTargetId(unit.id)
                                          }}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '8px 14px 8px 48px',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          <span style={{
                                            width: 5, height: 5,
                                            borderRadius: '50%',
                                            background: 'var(--color-primary)',
                                            flexShrink: 0,
                                          }} />
                                          <span className="unit-overview-item-name" style={{ minWidth: 0, flex: 1, fontSize: '12px' }}>
                                            {unit.name}
                                          </span>
                                          <span style={{
                                            fontSize: '11px',
                                            color: 'var(--color-text-secondary)',
                                            flexShrink: 0,
                                          }}>
                                            {unit.cardCount || 0} 张
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )
                            })}

                            {unassignedUnits.length > 0 && (
                              <div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '10px 14px 10px 36px',
                                    backgroundColor: 'var(--color-warning-light)',
                                    borderRadius: '8px',
                                    marginTop: '8px',
                                  }}
                                >
                                  <svg
                                    width="12" height="12"
                                    viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    style={{ color: 'var(--color-warning)', flexShrink: 0 }}
                                  >
                                    <path d="M12 8v4M12 16h.01" />
                                  </svg>
                                  <span style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: 'var(--color-warning-dark)',
                                  }}>
                                    未归章单元
                                  </span>
                                  <span style={{
                                    fontSize: '11px',
                                    color: 'var(--color-warning-dark)',
                                    marginLeft: 'auto',
                                  }}>
                                    {unassignedUnits.reduce((sum, u) => sum + (u.cardCount || 0), 0)} 张
                                  </span>
                                </div>
                                <div style={{
                                  paddingLeft: '48px',
                                }}>
                                  {unassignedUnits.map((unit) => (
                                    <div
                                      key={unit.id}
                                      className="unit-overview-item"
                                      onClick={() => {
                                        setScrollTargetId(unit.id)
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 14px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <span style={{
                                        width: 5, height: 5,
                                        borderRadius: '50%',
                                        background: 'var(--color-warning)',
                                        flexShrink: 0,
                                      }} />
                                      <span className="unit-overview-item-name" style={{ minWidth: 0, flex: 1, fontSize: '12px' }}>
                                        {unit.name}
                                      </span>
                                      <span style={{
                                        fontSize: '11px',
                                        color: 'var(--color-text-secondary)',
                                        flexShrink: 0,
                                      }}>
                                        {unit.cardCount || 0} 张
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {catChapters.length === 0 && unassignedUnits.length === 0 && (
                              <div style={{
                                padding: '10px 14px 10px 36px',
                                fontSize: '12px',
                                color: 'var(--color-text-muted)',
                              }}>
                                该分类下暂无章节
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
            </div>
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
            <p className="empty-state-title">暂无分类</p>
            <p className="empty-state-desc">先去记录页面创建吧</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {state.categories.map((cat) => {
              // 主题筛选逻辑：如果选中了某个主题，则使用该主题下的章节
              const catChapters = (() => {
                if (selectedTopicMap[cat.id]) {
                  return chaptersMap[cat.id]?.filter(ch => ch.topicId === selectedTopicMap[cat.id]) || []
                }
                return chaptersMap[cat.id] || []
              })()
              const catUnits = unitData[cat.id] || []
              const unassignedUnits = catUnits.filter(u => !u.chapterId)
              const catTopics = topicsMap[cat.id] || []

              return (
                <div key={cat.id} style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border-light)',
                  padding: '16px',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                }} data-category-id={cat.id}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '5px',
                          height: '20px',
                          borderRadius: '2.5px',
                          backgroundColor: 'var(--color-primary)',
                          flexShrink: 0,
                        }} />
                        <h2 style={{
                          fontSize: 'var(--text-base)',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          margin: 0,
                        }}>{cat.name}</h2>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-primary-dark)',
                          fontWeight: 600,
                          fontSize: '11px',
                        }}>
                          {cardCounts[cat.id] ?? 0} 张
                        </span>
                      </div>
                      {overviewMode === 'unit' && renderCategoryActions(cat.id)}
                    </div>
                  </div>

                  {/* 章节视图：显示章节卡片 */}
                  {overviewMode === 'chapter' ? (
                    <div style={{ marginTop: '12px' }}>
                      {/* 主题筛选 UI */}
                      {catTopics.length > 0 && (
                        <div style={{
                          marginBottom: '12px',
                          padding: '10px 12px',
                          backgroundColor: 'var(--color-bg)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-border-light)',
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '8px',
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                              按主题筛选
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            <button
                              onClick={() => handleTopicSelect(cat.id, null)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--color-border)',
                                fontSize: 'var(--text-xs)',
                                cursor: 'pointer',
                                backgroundColor: !selectedTopicMap[cat.id] ? 'var(--color-primary)' : 'transparent',
                                color: !selectedTopicMap[cat.id] ? '#fff' : 'var(--color-text-secondary)',
                              }}
                            >
                              全部章节
                            </button>
                            {catTopics.map((topic) => (
                              <button
                                key={topic.id}
                                onClick={() => handleTopicSelect(cat.id, topic.id)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--color-border)',
                                  fontSize: 'var(--text-xs)',
                                  cursor: 'pointer',
                                  backgroundColor: selectedTopicMap[cat.id] === topic.id ? 'var(--color-success)' : 'transparent',
                                  color: selectedTopicMap[cat.id] === topic.id ? '#fff' : 'var(--color-text-secondary)',
                                }}
                              >
                                {topic.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {catChapters.length === 0 && unassignedUnits.length === 0 ? (
                        <p style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--color-text-muted)',
                          textAlign: 'center',
                          padding: '16px 0 8px',
                          margin: 0,
                        }}>该分类下暂无章节</p>
                      ) : (
                        <>
                          {catChapters.map((ch) => {
                            const chExpanded = expandedChapters.has(ch.id)
                            const chUnits = catUnits.filter(u => u.chapterId === ch.id)
                            const chCardCount = chUnits.reduce((sum, u) => sum + (u.cardCount || 0), 0)
                            return (
                              <div key={ch.id} style={{
                                marginBottom: '8px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border-light)',
                                overflow: 'hidden',
                              }}>
                                {/* 章节卡片头部 */}
                                <div
                                  onClick={() => {
                                    setExpandedChapters(prev => {
                                      const next = new Set(prev)
                                      if (next.has(ch.id)) next.delete(ch.id)
                                      else next.add(ch.id)
                                      return next
                                    })
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px 14px',
                                    cursor: 'pointer',
                                    background: chExpanded ? 'var(--color-success-light)' : 'var(--color-bg-offset)',
                                    transition: 'background-color 0.2s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                    <svg
                                      width="14" height="14"
                                      viewBox="0 0 24 24"
                                      fill="none" stroke="currentColor" strokeWidth="2.5"
                                      strokeLinecap="round" strokeLinejoin="round"
                                      style={{
                                        flexShrink: 0,
                                        color: 'var(--color-success)',
                                        transition: 'transform 0.2s',
                                        transform: chExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                      }}
                                    >
                                      <path d="M9 18l6-6-6-6" />
                                    </svg>
                                    <span style={{
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      color: 'var(--color-text)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {ch.name}
                                    </span>
                                  </div>
                                  <span style={{
                                    fontSize: '12px',
                                    color: 'var(--color-text-secondary)',
                                    flexShrink: 0,
                                  }}>
                                    {chCardCount} 张
                                  </span>
                                </div>

                                {/* 章节展开内容 */}
                                <div style={{
                                  maxHeight: chExpanded ? '600px' : '0',
                                  overflow: 'hidden',
                                  transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                }}>
                                  {/* 操作按钮区 */}
                                  <div style={{
                                    display: 'flex',
                                    gap: '8px',
                                    padding: '10px 14px',
                                    flexWrap: 'wrap',
                                    backgroundColor: 'var(--color-surface)',
                                    borderTop: '1px solid var(--color-border-light)',
                                  }}>
                                    <button
                                      className="btn btn-sm"
                                      style={{
                                        flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                        backgroundColor: 'var(--color-surface)',
                                        color: 'var(--color-primary-dark)',
                                        border: 'none', borderRadius: 'var(--radius-sm)',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        fontWeight: 500, opacity: loading ? 0.6 : 1,
                                      }}
                                      onClick={(e) => { e.stopPropagation(); if (!loading) handleChapterTest(ch.id) }}
                                      disabled={loading}
                                    >
                                      章节检测
                                    </button>
                                    <button
                                      className="btn btn-sm"
                                      style={{
                                        flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                        backgroundColor: 'var(--color-success-light)',
                                        color: 'var(--color-success-dark)',
                                        border: 'none', borderRadius: 'var(--radius-sm)',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        fontWeight: 500, opacity: loading ? 0.6 : 1,
                                      }}
                                      onClick={(e) => { e.stopPropagation(); if (!loading) handleChapterReview(ch.id) }}
                                      disabled={loading}
                                    >
                                      章节复习
                                    </button>
                                    <button
                                      className="btn btn-sm"
                                      style={{
                                        flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                        backgroundColor: 'var(--color-accent-light)',
                                        color: 'var(--color-accent-dark)',
                                        border: 'none', borderRadius: 'var(--radius-sm)',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        fontWeight: 500, opacity: loading ? 0.6 : 1,
                                      }}
                                      onClick={(e) => { e.stopPropagation(); if (!loading) handleChapterUpdateBank(ch.id) }}
                                      disabled={loading}
                                    >
                                      更新题库
                                    </button>
                                  </div>

                                  {/* 章节下的单元列表 */}
                                  {chUnits.length === 0 ? (
                                    <div style={{
                                      padding: '8px 14px',
                                      fontSize: '12px',
                                      color: 'var(--color-text-muted)',
                                      backgroundColor: 'var(--color-surface)',
                                    }}>
                                      该章节下暂无单元
                                    </div>
                                  ) : (
                                    chUnits.map((unit) => (
                                      <div
                                        key={unit.id}
                                        className="unit-overview-item"
                                        onClick={() => {
                                          setScrollTargetId(unit.id)
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          padding: '8px 14px 8px 28px',
                                          cursor: 'pointer',
                                          backgroundColor: 'var(--color-surface)',
                                          borderTop: '1px solid var(--color-border-light)',
                                        }}
                                      >
                                        <span style={{
                                          width: 5, height: 5,
                                          borderRadius: '50%',
                                          background: 'var(--color-primary)',
                                          flexShrink: 0,
                                        }} />
                                        <span className="unit-overview-item-name" style={{ minWidth: 0, flex: 1, fontSize: '13px' }}>
                                          {unit.name}
                                        </span>
                                        <span style={{
                                          fontSize: '12px',
                                          color: 'var(--color-text-secondary)',
                                          flexShrink: 0,
                                        }}>
                                          {unit.cardCount || 0} 张
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )
                          })}

                          {/* 未归章单元区域 */}
                          {unassignedUnits.length > 0 && (
                            <div style={{
                              marginTop: '8px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--color-warning)',
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                backgroundColor: 'var(--color-warning-light)',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <svg
                                    width="14" height="14"
                                    viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    style={{ color: 'var(--color-warning)', flexShrink: 0 }}
                                  >
                                    <path d="M12 8v4M12 16h.01" />
                                  </svg>
                                  <span style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: 'var(--color-warning-dark)',
                                  }}>
                                    未归章单元
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: '12px',
                                  color: 'var(--color-warning-dark)',
                                }}>
                                  {unassignedUnits.reduce((sum, u) => sum + (u.cardCount || 0), 0)} 张
                                </span>
                              </div>

                              {/* 未归章单元操作按钮 */}
                              <div style={{
                                display: 'flex',
                                gap: '8px',
                                padding: '10px 14px',
                                flexWrap: 'wrap',
                                backgroundColor: 'var(--color-surface)',
                                borderTop: '1px solid var(--color-warning)',
                              }}>
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                    backgroundColor: 'var(--color-surface)',
                                    color: 'var(--color-primary-dark)',
                                    border: 'none', borderRadius: 'var(--radius-sm)',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontWeight: 500, opacity: loading ? 0.6 : 1,
                                  }}
                                  onClick={(e) => { e.stopPropagation(); if (!loading) handleCategoryTest(cat.id) }}
                                  disabled={loading}
                                >
                                  分类检测
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                    backgroundColor: 'var(--color-success-light)',
                                    color: 'var(--color-success-dark)',
                                    border: 'none', borderRadius: 'var(--radius-sm)',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontWeight: 500, opacity: loading ? 0.6 : 1,
                                  }}
                                  onClick={(e) => { e.stopPropagation(); if (!loading) handleCategoryReview(cat.id) }}
                                  disabled={loading}
                                >
                                  分类复习
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)',
                                    backgroundColor: 'var(--color-accent-light)',
                                    color: 'var(--color-accent-dark)',
                                    border: 'none', borderRadius: 'var(--radius-sm)',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontWeight: 500, opacity: loading ? 0.6 : 1,
                                  }}
                                  onClick={(e) => { e.stopPropagation(); if (!loading) handleCategoryUpdateBank(cat.id) }}
                                  disabled={loading}
                                >
                                  更新题库
                                </button>
                              </div>

                              {/* 未归章单元列表 */}
                              {unassignedUnits.map((unit) => (
                                <div
                                  key={unit.id}
                                  className="unit-overview-item"
                                  onClick={() => {
                                    setScrollTargetId(unit.id)
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 14px 8px 28px',
                                    cursor: 'pointer',
                                    backgroundColor: 'var(--color-surface)',
                                    borderTop: '1px solid var(--color-warning)',
                                  }}
                                >
                                  <span style={{
                                    width: 5, height: 5,
                                    borderRadius: '50%',
                                    background: 'var(--color-warning)',
                                    flexShrink: 0,
                                  }} />
                                  <span className="unit-overview-item-name" style={{ minWidth: 0, flex: 1, fontSize: '13px' }}>
                                    {unit.name}
                                  </span>
                                  <span style={{
                                    fontSize: '12px',
                                    color: 'var(--color-text-secondary)',
                                    flexShrink: 0,
                                  }}>
                                    {unit.cardCount || 0} 张
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    /* 单元视图：显示 UnitGroup */
                    <>{catUnits.length === 0 ? (
                      <p style={{
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-text-muted)',
                        textAlign: 'center',
                        padding: '16px 0 8px',
                        margin: 0,
                      }}>该分类下暂无单元</p>
                    ) : (
                      <div style={{ marginTop: '12px' }}>
                        {catUnits.map((unit) => (
                          <UnitGroup
                            key={unit.id}
                            unit={unit}
                            categoryId={cat.id}
                            forceCollapsed={allCollapsed}
                            forceExpanded={forceExpandedUnitId === unit.id}
                            highlighted={highlightedUnitId === unit.id}
                            onHighlightEnd={() => setHighlightedUnitId(null)}
                            actions={renderUnitActions(unit, cat.id)}
                            onDeleteCard={handleDeleteCard}
                            onMoveCard={handleMoveCard}
                            onBookmarkCard={handleBookmarkCard}
                          />
                        ))}
                      </div>
                    )}</>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 浮动「返回概览」按钮：滚动离开顶部后显示 */}
      {showReturnOverview && !overviewOpen && (
        <button
          onClick={() => {
            const container = document.querySelector('.page-container')
            if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
            setOverviewOpen(true)
            setShowReturnOverview(false)
          }}
          style={{
            position: 'fixed',
            bottom: '100px',
            right: '16px',
            zIndex: 50,
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--color-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            cursor: 'pointer',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            opacity: showReturnOverview ? 1 : 0,
            transform: showReturnOverview ? 'translateY(0)' : 'translateY(20px)',
            pointerEvents: showReturnOverview ? 'auto' : 'none',
          }}
          title="返回概览"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
      )}

      {/* ===== 删除卡片确认对话框 ===== */}
      {showDeleteConfirm && (
        <div className="dialog-overlay" onClick={handleCancelDelete}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="dialog-title">删除卡片</p>
            <p className="dialog-message">确认删除这张卡片吗？此操作无法撤销。</p>
            <div className="dialog-actions">
              <button onClick={handleCancelDelete} className="btn btn-secondary btn-sm">取消</button>
              <button onClick={handleConfirmDelete} className="btn btn-danger btn-sm">删除</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 移动卡片居中模态框 ===== */}
      {showMoveModal && (
        <div className="dialog-overlay" onClick={handleCancelMove}>
          <div className="dialog" style={{ maxWidth: 420, width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16, textAlign: 'center' }}>
              移动卡片
            </div>

            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>选择分类</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {allCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleSelectTargetCategory(cat.id)}
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                    border: 'none', fontWeight: 500,
                    background: targetCategoryId === cat.id ? 'var(--color-primary)' : 'var(--color-border-light)',
                    color: targetCategoryId === cat.id ? '#fff' : 'var(--color-text)',
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {targetCategoryId && (
              <>
                <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>选择单元</div>
                {targetUnits.length === 0 ? (
                  <div style={{ padding: 12, background: 'var(--color-border-light)', borderRadius: 8, fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, textAlign: 'center' }}>
                    该分类下尚无单元
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {targetUnits.map((unit) => (
                      <button
                        key={unit.id}
                        onClick={() => setTargetUnitId(unit.id)}
                        style={{
                          padding: '8px 14px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                          border: 'none', fontWeight: 500,
                          background: targetUnitId === unit.id ? 'var(--color-success)' : 'var(--color-border-light)',
                          color: targetUnitId === unit.id ? '#fff' : 'var(--color-text)',
                        }}
                      >
                        {unit.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={handleCancelMove} className="btn btn-secondary" style={{ flex: 1, minHeight: 44 }}>
                取消
              </button>
              <button
                onClick={handleConfirmMove}
                className="btn btn-primary"
                style={{ flex: 1, minHeight: 44 }}
                disabled={!targetCategoryId || !targetUnitId}
              >
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}

      <BackToTop scrollContainerSelector=".page-container" />

      {showDifficultyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}
          onClick={() => { setShowDifficultyModal(false); setPendingTestConfig(null); }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '360px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 700,
              color: 'var(--color-text)',
              marginBottom: '8px',
              textAlign: 'center',
            }}>
              选择题目难度
            </h3>
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              marginBottom: '24px',
            }}>
              每个知识点将生成对应难度的题目
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {DIFFICULTY_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => startTestWithDifficulty(level.value)}
                  className="btn"
                  style={{
                    minHeight: '56px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    justifyContent: 'flex-start',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'}
                >
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: level.value === 1 ? 'var(--color-success)' : level.value === 2 ? 'var(--color-warning)' : level.value === 3 ? 'var(--color-danger)' : 'var(--color-primary)',
                  }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontSize: 'var(--text-base)',
                      fontWeight: 600,
                    }}>
                      {level.label}
                    </div>
                    <div style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-secondary)',
                    }}>
                      {level.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowDifficultyModal(false); setPendingTestConfig(null); }}
              style={{
                width: '100%',
                minHeight: '44px',
                marginTop: '16px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 随机难度：题库完整性预检结果 + 更新确认弹窗 */}
      {showRandomBankConfirm && bankCheckResult && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
        }}>
          <div style={{
            backgroundColor: 'var(--color-bg)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            maxWidth: '420px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          }}>
            <h3 style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 700,
              color: 'var(--color-text)',
              marginBottom: '8px',
              textAlign: 'center',
            }}>
              题库不完整
            </h3>
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              marginBottom: '16px',
            }}>
              随机难度需要每个知识点都有 3 种难度 × 4 种题型的完整题库
            </p>
            <div style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              marginBottom: '16px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>卡片总数：</span>
                <span style={{ fontWeight: 600 }}>{bankCheckResult.cardsCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>应有题目组合：</span>
                <span style={{ fontWeight: 600 }}>{bankCheckResult.totalCombinations}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>已满足：</span>
                <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{bankCheckResult.existingCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>缺失：</span>
                <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{bankCheckResult.missingCount}</span>
              </div>
            </div>
            <p style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              marginBottom: '16px',
              lineHeight: 1.5,
            }}>
              点击"补全题库"将根据 AI 模型（强/弱模型自动分批）生成所有缺失难度和题型的题目，与原知识点数据绑定。生成过程可能需要一些时间。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={confirmUpdateBankForRandom}
                className="btn btn-primary"
                style={{
                  minHeight: '48px',
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                补全题库并开始测试
              </button>
              <button
                onClick={cancelUpdateBankForRandom}
                className="btn"
                style={{
                  minHeight: '44px',
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                使用现有题库进入
              </button>
              <button
                onClick={() => {
                  setShowRandomBankConfirm(false)
                  setBankCheckResult(null)
                }}
                style={{
                  width: '100%',
                  minHeight: '40px',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}