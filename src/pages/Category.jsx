import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useBackgroundTask } from '../context/BackgroundTaskContext'
import { parseExcelFile } from '../utils/excelParser'
import { getUnitsByCategory, addUnits, getCardsByUnit, deleteCard, addBookmark, removeBookmark, isBookmarked, moveCardToCategory, getBookmarkStatuses, getCardStatusesByCategory, updateUnit, getAllCardsByCategory, batchUpdateCardsUnit, batchUpdateCardsChapter, deleteEmptyUnits, deleteEmptyChapters, addCategory, getCardCountByCategory, batchUpdateCardsCategoryAndUnit, deleteEmptyCategory, batchCreateCategoriesAndUnits, createDataSnapshot, restoreDataSnapshot, dbInstance, getChaptersByCategory, addChapter, updateChapter, deleteChapter, moveUnit, getTopicByName, createTopic, getExistingKnowledgePointsByCategory, getCategoryPurpose, updateCategoryPurpose, updateCategory, getKnowledgeTreeByCategory, buildKnowledgeTree, getKnowledgeTreeNodesByLevel, addKnowledgeTreeNode, updateKnowledgeTreeNode, deleteKnowledgeTreeNode, addCardsToUnit } from '../services/db'
import { generateCards, extractTextFromImage, classifyCardsByCategoryContent, generateNewTopicsAndUnits, judgeTopicMerge, judgeUnitMerge, loopMergeControl, extractKnowledgePoints, generateCardsFromKnowledgePoints, filterHeadingLikePoints, clusterKnowledgePointsByTopic, AiTimeoutError, deduplicateKnowledgePoints, generateCategoryPurpose } from '../services/aiService'
import { compressImage, parseAIResponse, calculateImageHash, matchUnit, simpleTextSimilarity, extractJsonFromAiResponse } from '../utils/helpers'
import { attachOriginalKnowledgePoints, buildKpMarkers } from '../utils/cardKnowledgePoint'
import { buildOperationErrorMessage, buildSmartOrganizeSuccessMessage, dedupeCardsByKnowledgePoint } from '../utils/smartOrganizeUx'
import { checkInputQuality } from '../utils/cardQualityChecker'
import { getOcrCache, setOcrCache } from '../services/db'
import { ocrWithFallback } from '../services/pcEngineFallback'
import { getPcEngineConfig } from '../services/pcEngine'
import { SUMMARY_LEVELS } from '../utils/constants'
import InputBar from '../components/InputBar'
import ImageEditor from '../components/ImageEditor'
import UnitGroup from '../components/UnitGroup'
import NewCardPanel from '../components/NewCardPanel'
import ErrorBoundary from '../components/ErrorBoundary'
import BackToTop from '../components/BackToTop'
import KnowledgePointConfirm from '../components/KnowledgePointConfirm'
import CardSelectionModal from '../components/CardSelectionModal'
import UnitReorganizeConfirm from '../components/UnitReorganizeConfirm'
import TargetCategorySelect from '../components/TargetCategorySelect'
import CrossCategoryConfirm from '../components/CrossCategoryConfirm'
import DebugPanel from '../components/DebugPanel'
import NewCardPreviewPanel from '../components/NewCardPreviewPanel'
import FloatingDraftBanner from '../components/FloatingDraftBanner'
import OcrConfirmModal from '../components/OcrConfirmModal'
import { syncEngine } from '../services/sync'

export default function Category() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { state, showToast, loadCategories } = useApp()
  const bgtCtx = useBackgroundTask()
  const [inputValue, setInputValue] = useState('')
  const [units, setUnits] = useState([])
  const [chapters, setChapters] = useState([])
  const [collapsedChapters, setCollapsedChapters] = useState(new Set())
  const [generating, setGenerating] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [summaryLevel, setSummaryLevel] = useState('standard')
  const [cardsRefreshKey, setCardsRefreshKey] = useState(0)
  const [currentFlowId, setCurrentFlowId] = useState(null)

  // Knowledge Tree 单表支持
  const [knowledgeTreeData, setKnowledgeTreeData] = useState(null)
  const [useKnowledgeTree, setUseKnowledgeTree] = useState(false)
  const [knowledgeTreeTopics, setKnowledgeTreeTopics] = useState([])
  const [collapsedTopics, setCollapsedTopics] = useState(new Set())

  const generatingRef = useRef(false)
  const ocrLoadingRef = useRef(false)
  const generateTimeoutRef = useRef(null)
  const isMountedRef = useRef(true)
  // [FIX #310] 并发请求锁 + 防抖，防止无限循环
  const requestLockRef = useRef(false)
  const loadUnitsTimerRef = useRef(null)
  // [fix-P2-4] 超时取消标志：超时后设为 true，AI 回调完成时检查，避免超时后弹窗意外弹出
  const timeoutCancelledRef = useRef(false)

  const loadUnits = useCallback(async () => {
    // [FIX #310] 防抖：150ms 内重复调用合并为一次
    if (loadUnitsTimerRef.current) clearTimeout(loadUnitsTimerRef.current)
    if (requestLockRef.current) return
    requestLockRef.current = true
    try {
      // 优先尝试从 knowledgeTree 读取数据
      const knowledgeTreeResult = await getKnowledgeTreeByCategory(id)
      const hasKnowledgeTreeData = knowledgeTreeResult.allNodes && knowledgeTreeResult.allNodes.length > 0

      if (hasKnowledgeTreeData) {
        // 使用 knowledgeTree 单表
        setUseKnowledgeTree(true)
        const { topics, chapters: ktChapters, units: ktUnits, knowledgePoints, cards, allNodes } = knowledgeTreeResult
        setKnowledgeTreeData(allNodes)
        
        // 构建树形结构
        const tree = buildKnowledgeTree(allNodes, null)
        setKnowledgeTreeTopics(tree.filter(n => n.level === 'topic'))
        
        // 默认收缩所有主题
        const topicIds = topics.map(t => t.id)
        setCollapsedTopics(new Set(topicIds))
        
        // 同时加载章节（向后兼容）
        const chapterList = await getChaptersByCategory(id)
        if (!isMountedRef.current) return
        setChapters(chapterList)
        setCollapsedChapters(new Set())
        
        // 转换为旧格式的 units 用于兼容现有渲染
        const statusMap = await getCardStatusesByCategory(id)
        const enriched = await Promise.all(
          ktUnits.map(async (unit) => {
            const unitCards = cards.filter(c => c.unitId === unit.id)
            const mastered = unitCards.filter((c) => statusMap[c.id] === 'mastered').length
            return { ...unit, card_count: unitCards.length, mastered_count: mastered }
          })
        )
        if (!isMountedRef.current) return
        setUnits(enriched)
        
        // 加载书签状态
        const allCardIds = cards.map(c => c.id)
        const bm = await getBookmarkStatuses(allCardIds)
        if (!isMountedRef.current) return
        setBookmarks(bm)
      } else {
        // 回退到旧表结构
        setUseKnowledgeTree(false)
        setKnowledgeTreeData(null)
        setKnowledgeTreeTopics([])
        
        // 加载章节
        const chapterList = await getChaptersByCategory(id)
        if (!isMountedRef.current) return
        setChapters(chapterList)
        // 默认展开所有章节
        setCollapsedChapters(new Set())

        const list = await getUnitsByCategory(id)
        const statusMap = await getCardStatusesByCategory(id)
        const enriched = await Promise.all(
          list.map(async (unit) => {
            const cards = await getCardsByUnit(unit.id)
            const mastered = cards.filter((c) => statusMap[c.id] === 'mastered').length
            return { ...unit, card_count: cards.length, mastered_count: mastered }
          })
        )
        if (!isMountedRef.current) return
        setUnits(enriched)
        const allCardIds = []
        for (const unit of enriched) {
          const cards = await getCardsByUnit(unit.id)
          allCardIds.push(...cards.map((c) => c.id))
        }
        const bm = await getBookmarkStatuses(allCardIds)
        if (!isMountedRef.current) return
        setBookmarks(bm)
      }
    } finally {
      requestLockRef.current = false
    }
  }, [id])

  const [bookmarks, setBookmarks] = useState({})

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [cardToDelete, setCardToDelete] = useState(null)
  const [deleteCategoryId, setDeleteCategoryId] = useState(null)

  const [showMoveModal, setShowMoveModal] = useState(false)
  const [cardToMove, setCardToMove] = useState(null)
  const [cardsToMove, setCardsToMove] = useState([])
  const [targetCategoryId, setTargetCategoryId] = useState(null)
  const [targetUnits, setTargetUnits] = useState([])
  const [targetUnitId, setTargetUnitId] = useState(null)

  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [renamingUnitId, setRenamingUnitId] = useState(null)
  const [editUnitNameValue, setEditUnitNameValue] = useState('')
  const [forceExpandUnitId, setForceExpandUnitId] = useState(null)
  const [unitToDelete, setUnitToDelete] = useState(null)
  const [showUnitDeleteConfirm, setShowUnitDeleteConfirm] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [creatingUnitInMove, setCreatingUnitInMove] = useState(false)

  // 章节管理状态
  const [newChapterName, setNewChapterName] = useState('')
  const [creatingChapter, setCreatingChapter] = useState(false)
  const [showAddChapterModal, setShowAddChapterModal] = useState(false)
  const [editingChapterId, setEditingChapterId] = useState(null)
  const [editChapterNameValue, setEditChapterNameValue] = useState('')
  const [chapterToDelete, setChapterToDelete] = useState(null)
  const [showChapterDeleteConfirm, setShowChapterDeleteConfirm] = useState(false)
  
  const [showAddUnitModal, setShowAddUnitModal] = useState(false)
  const [newUnitNameForChapter, setNewUnitNameForChapter] = useState('')
  const [targetChapterIdForUnit, setTargetChapterIdForUnit] = useState(null)
  const [targetChapterNameForUnit, setTargetChapterNameForUnit] = useState('')

  // [P3-1] 已清理: showDuplicateConfirm, duplicateCards, pendingCards, pendingNewCards, pendingUnitDataList（死代码，setShowDuplicateConfirm(true) 从未调用）

  // 超时确认对话框状态
  const [showTimeoutConfirm, setShowTimeoutConfirm] = useState(false)
  const [timeoutFallbackAssignments, setTimeoutFallbackAssignments] = useState(null)

  // 新卡片预览弹窗
  const [showNewCardPanel, setShowNewCardPanel] = useState(false)
  const [panelCards, setPanelCards] = useState([])
  const [panelExistingUnits, setPanelExistingUnits] = useState([])

  // 知识点确认弹窗（两步生成 Step 1 → Step 2 之间）
  const [showKpConfirm, setShowKpConfirm] = useState(false)
  const [kpConfirmList, setKpConfirmList] = useState([])
  const [kpConfirmLoading, setKpConfirmLoading] = useState(false)
  const [kpConfirmConfig, setKpConfirmConfig] = useState(null)

  // 主题确认弹窗（主题聚类 → 归类之前）
  const [showTopicConfirm, setShowTopicConfirm] = useState(false)
  const [currentTopics, setCurrentTopics] = useState([])
  const [topicConfirmLoading, setTopicConfirmLoading] = useState(false)
  const [topicConfirmConfig, setTopicConfirmConfig] = useState(null)

  // OCR 文字确认弹窗
  const [ocrConfirmOpen, setOcrConfirmOpen] = useState(false)
  const [ocrConfirmText, setOcrConfirmText] = useState('')
  const [ocrConfirmLoading, setOcrConfirmLoading] = useState(false)

  // 合并摘要弹窗
  const [showMergeSummary, setShowMergeSummary] = useState(false)
  const [mergeSummaryData, setMergeSummaryData] = useState(null)

  // 卡片生成步骤导航
  // 流程: Step1(知识点确认) → Step2(主题分组) → Step3(合并摘要) → Step4(重复确认) → Step5(卡片预览)
  const [cardGenStep, setCardGenStep] = useState(0) // 0 = 未开始, 1-5 = 当前步骤
  const [cardGenStepSnapshots, setCardGenStepSnapshots] = useState({}) // { step: { data snapshot } }

  // 新卡片预览面板状态
  const [showNewCardPreviewPanel, setShowNewCardPreviewPanel] = useState(false)
  const [previewUnitDataList, setPreviewUnitDataList] = useState([])
  const [previewFlatPanelCards, setPreviewFlatPanelCards] = useState([])

  // 调试面板：记录 AI 输入输出
  const [debugEntries, setDebugEntries] = useState([])

  // ============================================================
  // Flow 后台流程恢复：当 URL 中带有 resumeFlow 参数，
  // 或 flows 中存在当前分类的等待操作流程时，
  // 从 flow.payload 恢复状态并打开对应的弹窗
  // ============================================================
  useEffect(function () {
    const urlParams = new URLSearchParams(location.search)
    const resumeFlowId = urlParams.get('resumeFlow')

    // 1) 通过 URL 参数恢复指定 flow
    let targetFlow = null
    if (resumeFlowId) {
      targetFlow = bgtCtx.flows.find(function (f) { return f.id === resumeFlowId })
    }

    // 2) 如果没有 URL 参数，自动检测当前分类是否有等待操作的 flow
    //    注意：same-category-reorganize / cross-category-specified / cross-category-auto
    //    不自动弹窗，用户需通过任务浮窗手动点击"待执行"打开
    if (!targetFlow) {
      targetFlow = bgtCtx.flows.find(function (f) {
        const feature = f.payload?.feature
        const skipAutoOpen = feature === 'same-category-reorganize' ||
          feature === 'cross-category-specified' ||
          feature === 'cross-category-auto'
        return f.status === 'awaiting_action' &&
          f.payload &&
          f.payload.categoryId === id &&
          !skipAutoOpen &&
          (f.type === 'card_classification' || feature === 'same-category-reorganize' || feature === 'cross-category-auto' || feature === 'cross-category-specified')
      })
    }

    if (targetFlow && targetFlow.payload && targetFlow.status === 'awaiting_action') {
      setCurrentFlowId(targetFlow.id)
      const step = targetFlow.payload.step
      if (step === 'await_kp_confirm' && targetFlow.payload.kpConfirmList) {
        setKpConfirmList(targetFlow.payload.kpConfirmList)
        if (targetFlow.payload.kpExistingUnits) {
          setKpConfirmConfig({
            existingUnits: targetFlow.payload.kpExistingUnits,
            aiConfig: targetFlow.payload.aiConfig,
            flowId: targetFlow.id,
          })
        }
        setShowKpConfirm(true)
      } else if (step === 'await_topic_confirm' && targetFlow.payload.topics) {
        setCurrentTopics(targetFlow.payload.topics)
        setTopicConfirmConfig({
          existingUnits: targetFlow.payload.existingUnits,
          aiConfig: targetFlow.payload.aiConfig,
          pointsToUse: targetFlow.payload.editedPoints,
          kpMarkers: targetFlow.payload.kpMarkers,
          existingChapters: targetFlow.payload.existingChapters,
          flowId: targetFlow.id,
        })
        setShowTopicConfirm(true)
      } else if (step === 'await_merge_confirm' && targetFlow.payload.mergeData) {
        setMergeSummaryData(targetFlow.payload.mergeData)
        setShowMergeSummary(true)
      } else if (step === 'await_preview' && targetFlow.payload.unitDataList) {
        setPreviewUnitDataList(targetFlow.payload.unitDataList)
        setShowNewCardPreviewPanel(true)
        setCardGenStep(5)
      } else if (targetFlow.type === 'card_classification' || targetFlow.payload.feature) {
        const feature = targetFlow.payload.feature
        if (feature === 'same-category-reorganize') {
          const plan = targetFlow.payload.plan || targetFlow.payload.reorganizePlan
          if (plan) {
            setUnitReorganizePlan(plan)
            setShowUnitReorganizeConfirm(true)
          }
        } else if (feature === 'cross-category-specified') {
          // 指定分类归类：恢复 plan 和目标分类信息，打开整理确认弹窗
          const plan = targetFlow.payload.plan
          const cards = targetFlow.payload.cards
          const targetCategoryId = targetFlow.payload.targetCategoryId
          if (plan) {
            if (cards) setCrossCategoryCards(cards)
            if (targetCategoryId) setSelectedTargetCategoryId(targetCategoryId)
            setUnitReorganizePlan(plan)
            setShowUnitReorganizeConfirm(true)
          }
        } else if (feature === 'cross-category-auto') {
          const plan = targetFlow.payload.plan || targetFlow.payload.crossCategoryPlan
          const cards = targetFlow.payload.cards || targetFlow.payload.crossCategoryCards
          if (plan) {
            if (cards) setCrossCategoryCards(cards)
            setCrossCategoryPlan(plan)
            setCrossCategoryConfirmOpen(true)
          }
        }
      }
      // 清除 URL 参数，避免刷新后重复恢复
      if (resumeFlowId) {
        navigate(`/category/${id}`, { replace: true })
      }
    }
  }, [location.search, bgtCtx.flows, id, navigate])

  // 状态持久化：展开/收起状态
  const [allCollapsed, setAllCollapsed] = useState(() => {
    const saved = sessionStorage.getItem(`category_collapsed_${id}`)
    return saved ? JSON.parse(saved) : false
  })
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [unitOverviewMenuOpen, setUnitOverviewMenuOpen] = useState(false)
  const [cardSelectionModalOpen, setCardSelectionModalOpen] = useState(false)
  const [cardSelectionFeature, setCardSelectionFeature] = useState(null)
  const [classificationDepth, setClassificationDepth] = useState('chapter-and-unit')
  const [unitReorganizeLoading, setUnitReorganizeLoading] = useState(false)
  const [showUnitReorganizeConfirm, setShowUnitReorganizeConfirm] = useState(false)
  const [unitReorganizePlan, setUnitReorganizePlan] = useState(null)
  const [targetCategorySelectOpen, setTargetCategorySelectOpen] = useState(false)
  const [targetCategoryOptions, setTargetCategoryOptions] = useState([])
  const [targetCategorySelectLoading, setTargetCategorySelectLoading] = useState(false)
  const [selectedTargetCategoryId, setSelectedTargetCategoryId] = useState('')
  const [crossCategoryCards, setCrossCategoryCards] = useState([])
  const [crossCategoryPlan, setCrossCategoryPlan] = useState(null)
  const [crossCategoryConfirmOpen, setCrossCategoryConfirmOpen] = useState(false)
  const [crossCategoryLoading, setCrossCategoryLoading] = useState(false)
  const [crossCategoryUnits, setCrossCategoryUnits] = useState([])
  const [crossCategoryChapters, setCrossCategoryChapters] = useState([])
  const [crossCategoryDataLoading, setCrossCategoryDataLoading] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCardIds, setSelectedCardIds] = useState(new Set())

  // 单元移动状态
  const [movingUnitId, setMovingUnitId] = useState(null)
  const [showUnitMoveSelect, setShowUnitMoveSelect] = useState(false)
  const [moveTargetCategoryId, setMoveTargetCategoryId] = useState('')
  const [moveTargetChapterId, setMoveTargetChapterId] = useState('')
  const [moveTargetUnitId, setMoveTargetUnitId] = useState('')
  const [moveUnitLoading, setMoveUnitLoading] = useState(false)
  const [moveTargetChapters, setMoveTargetChapters] = useState([])
  const [moveTargetUnits, setMoveTargetUnits] = useState([])
  const [longPressTimer, setLongPressTimer] = useState(null)
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  const [batchMoveMode, setBatchMoveMode] = useState(false)
  const [initialScrollRestored, setInitialScrollRestored] = useState(false)
  const [chapterMenuChapterId, setChapterMenuChapterId] = useState(null) // 章节菜单打开的章节ID
  const [chapterMenuPosition, setChapterMenuPosition] = useState(null) // 章节菜单位置
  const chapterMenuRef = useRef(null)

  const handleExportChapter = async (chapter, chapterUnits) => {
    try {
      showToast('正在生成章节导出文件…', 'success')
      const allCards = []
      for (const unit of chapterUnits) {
        const cards = await getCardsByUnit(unit.id)
        allCards.push(...cards.map(c => ({ ...c, unitName: unit.name })))
      }
      const { exportChapterCardsToExcel, downloadUnitTemplate } = await import('../utils/excelParser')
      const data = await exportChapterCardsToExcel(allCards, { name: chapter.name || '章节数据' })
      const filename = `${chapter.name || '章节数据'}.xlsx`
      // 保存/分享
      try {
        const { saveExcelFile, shareFile } = await import('../services/migrate')
        const result = await saveExcelFile(data, filename)
        if (result.platform === 'mobile') {
          setTimeout(async () => { await shareFile(result.path, filename) }, 500)
        }
      } catch (_) {
        try {
          const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
          if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] })) {
            await navigator.share({ title: filename, files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] })
          } else {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = filename; a.style.display = 'none'
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }
        } catch (_) {}
      }
      showToast('章节导出完成', 'success')
    } catch (e) {
      showToast('章节导出失败：' + (e.message || '未知错误'), 'error')
    }
  }

  const handleImportCardsToChapter = async (chapterId, chapterName, cards) => {
    try {
      const snapshot = await createDataSnapshot()
      // 按单元名称分组
      const unitGroups = {}
      for (const card of cards) {
        const unitName = card.unitName || card.unit || null
        if (!unitName) unitGroups['__default__'] = [...(unitGroups['__default__'] || []), card]
        else unitGroups[unitName] = [...(unitGroups[unitName] || []), card]
      }

      let totalImported = 0
      for (const [unitName, unitCards] of Object.entries(unitGroups)) {
        let targetUnitId
        if (unitName === '__default__') {
          // 未指定单元 → 查找或创建以章节名命名的单元
          const existingUnits = await dbInstance.units.where('chapterId').equals(chapterId).toArray()
          const existingUnit = existingUnits.find(u => u.name === chapterName)
          if (existingUnit) {
            targetUnitId = existingUnit.id
          } else {
            const created = await addUnits(id, [{ name: chapterName || '导入卡片', chapterId, cards: [] }])
            targetUnitId = created[0].id
          }
        } else {
          // 查找或创建指定名称的单元
          const existingUnits = await dbInstance.units.where('chapterId').equals(chapterId).toArray()
          let unit = existingUnits.find(u => u.name === unitName)
          if (!unit) {
            const created = await addUnits(id, [{ name: unitName, chapterId, cards: [] }])
            unit = created[0]
          }
          targetUnitId = unit.id
        }
        // 去重
        const existingCardsInUnit = await getCardsByUnit(targetUnitId)
        const existingSet = new Set(existingCardsInUnit.map(c => `${c.front}|${c.back}`))
        const newUnitCards = unitCards.filter(c => !existingSet.has(`${(c.front || '')}|${(c.back || '')}`))
        if (newUnitCards.length === 0) continue
        await addCardsToUnit(targetUnitId, id, newUnitCards.map(c => ({
          front: c.front || '',
          back: c.back || '',
          knowledge_point: c.knowledge_point || '',
        })))
        // 同步写入 knowledgeTree（如果启用）
        if (useKnowledgeTree) {
          for (const c of newUnitCards) {
            await addKnowledgeTreeNode({
              level: 'card',
              parentId: targetUnitId,
              categoryId: id,
              unitId: targetUnitId,
              content: c.front || '',
              front: c.front || '',
              back: c.back || '',
              status: 'active',
              source: 'manual',
            })
          }
        }
          totalImported += newUnitCards.length
      }

      showToast(`成功导入 ${totalImported} 张卡片到章节「${chapterName}」`, 'success')
      await loadUnits()
      setCardsRefreshKey(k => k + 1)
      await syncAndOfferUndo({
        snapshot,
        message: `已导入 ${totalImported} 张卡片到章节「${chapterName}」`,
        refresh: async () => {
          await loadUnits()
          setCardsRefreshKey(k => k + 1)
        },
      })
    } catch (e) {
      showToast('导入到章节失败：' + (e.message || '未知错误'), 'error')
    }
  }

  const category = state.categories.find((c) => c.id === id)

  // === 章节管理 ===
  const handleCreateChapter = useCallback(async () => {
    const name = newChapterName.trim()
    if (!name) {
      showToast('请输入章节名称', 'error')
      return
    }
    setCreatingChapter(true)
    try {
      const created = await addChapter(id, name)
      setNewChapterName('')
      showToast('已创建章节')
      setChapters(prev => [...prev, created])
      setCollapsedChapters(prev => {
        const next = new Set(prev)
        next.delete(created.id)
        return next
      })
      setTimeout(() => {
        const chapterEl = document.querySelector(`[data-chapter-id="${created.id}"]`)
        if (chapterEl) {
          chapterEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 300)
    } catch (e) {
      showToast('创建章节失败：' + (e.message || '未知错误'), 'error')
    } finally {
      setCreatingChapter(false)
    }
  }, [id, newChapterName, showToast])

  const handleEditChapterName = useCallback((chapterId, currentName) => {
    setEditingChapterId(chapterId)
    setEditChapterNameValue(currentName)
  }, [])

  const handleSaveChapterName = useCallback(async (chapterId, newName) => {
    if (!newName.trim() || newName.trim() === '') {
      setEditingChapterId(null)
      return
    }
    try {
      await updateChapter(chapterId, { name: newName.trim() })
      setChapters(prev => prev.map(ch => ch.id === chapterId ? { ...ch, name: newName.trim() } : ch))
      setEditingChapterId(null)
      if (loadCategories) loadCategories()
      showToast('章节名称已更新')
    } catch (e) {
      showToast('更新章节名称失败：' + (e.message || '未知错误'), 'error')
      setEditingChapterId(null)
    }
  }, [showToast, loadCategories])

  const handleDeleteChapterRequest = useCallback((chapter) => {
    console.log('handleDeleteChapterRequest 调用:', chapter)
    setChapterToDelete(chapter)
    setShowChapterDeleteConfirm(true)
    console.log('showChapterDeleteConfirm 已设置为 true')
  }, [])

  const handleConfirmDeleteChapter = useCallback(async () => {
    console.log('handleConfirmDeleteChapter 调用')
    if (!chapterToDelete) {
      console.log('chapterToDelete 为 null')
      return
    }
    console.log('chapterToDelete:', chapterToDelete)
    console.log('chapterToDelete.id:', chapterToDelete.id)
    const deletedChapterId = chapterToDelete.id
    try {
      console.log('开始调用 deleteChapter:', deletedChapterId)
      await deleteChapter(deletedChapterId)
      console.log('deleteChapter 调用成功')
      setChapters(prev => prev.filter(ch => ch.id !== deletedChapterId))
      setKnowledgeTreeTopics(prev => prev.map(topic => ({
        ...topic,
        children: (topic.children || []).filter(c => c.id !== deletedChapterId)
      })))
      setShowChapterDeleteConfirm(false)
      setChapterToDelete(null)
      showToast('已删除章节（单元保留未分类）')
      await loadUnits()
      if (loadCategories) loadCategories()
    } catch (e) {
      console.error('删除章节失败:', e)
      console.error('错误堆栈:', e.stack)
      showToast('删除章节失败：' + (e.message || '未知错误'), 'error')
      setShowChapterDeleteConfirm(false)
      setChapterToDelete(null)
    }
  }, [chapterToDelete, showToast, loadCategories, loadUnits])

  const handleCreateUnitInChapter = useCallback((chapterId, chapterName) => {
    setTargetChapterIdForUnit(chapterId)
    setTargetChapterNameForUnit(chapterName)
    setNewUnitNameForChapter('')
    setShowAddUnitModal(true)
  }, [])
  
  const handleConfirmCreateUnit = useCallback(async () => {
    const unitName = newUnitNameForChapter.trim()
    if (!unitName) {
      showToast('请输入单元名称', 'error')
      return
    }
    try {
      const created = await addUnits(id, [{ name: unitName, chapterId: targetChapterIdForUnit, cards: [] }])
      if (created && created.length > 0) {
        showToast('已在章节「' + targetChapterNameForUnit + '」下创建单元')
        setCollapsedChapters(prev => {
          const next = new Set(prev)
          next.delete(targetChapterIdForUnit)
          return next
        })
        setRenamingUnitId(created[0].id)
        setEditUnitNameValue(unitName)
        await loadUnits()
        if (loadCategories) loadCategories()
      }
    } catch (e) {
      showToast('创建单元失败：' + (e.message || '未知错误'), 'error')
    } finally {
      setShowAddUnitModal(false)
      setNewUnitNameForChapter('')
    }
  }, [id, newUnitNameForChapter, targetChapterIdForUnit, targetChapterNameForUnit, showToast, loadCategories, loadUnits])

  const handleToggleChapterCollapse = useCallback((chapterId) => {
    setCollapsedChapters(prev => {
      const next = new Set(prev)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }, [])

  useEffect(() => {
    // [FIX] 重置并发锁，防止上次中断遗留的锁导致 loadUnits 被静默跳过
    requestLockRef.current = false
    if (category) {
      setCategoryName(category.name)
    }
    loadUnits()
    // 恢复滚动位置
    const savedScroll = sessionStorage.getItem(`category_scroll_${id}`)
    if (savedScroll && !initialScrollRestored) {
      const mainEl = document.querySelector('main')
      if (mainEl) {
        mainEl.scrollTop = parseInt(savedScroll, 10)
        setInitialScrollRestored(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, category?.id, category?.name, loadUnits])

  // 保存滚动位置
  useEffect(() => {
    return () => {
      const mainEl = document.querySelector('main')
      if (mainEl) {
        sessionStorage.setItem(`category_scroll_${id}`, mainEl.scrollTop.toString())
      }
    }
  }, [id])

  // 保存展开/收起状态
  useEffect(() => {
    sessionStorage.setItem(`category_collapsed_${id}`, JSON.stringify(allCollapsed))
  }, [allCollapsed, id])

  // 清理超时定时器
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current)
        generateTimeoutRef.current = null
      }
    }
  }, [])

  // === 统一状态重置 helper（任何异常路径都必须调用）===
  const resetLoading = useCallback(() => {
    generatingRef.current = false
    ocrLoadingRef.current = false
    if (generateTimeoutRef.current) {
      clearTimeout(generateTimeoutRef.current)
      generateTimeoutRef.current = null
    }
    if (isMountedRef.current) {
      setGenerating(false)
      setOcrLoading(false)
    }
  }, [])

  const startLoading = useCallback(() => {
    generatingRef.current = true
    if (isMountedRef.current) {
      setGenerating(true)
    }
  }, [])

  // [FIX] 监听云端同步完成，自动刷新当前分类的卡片和单元数据
  useEffect(() => {
    const listener = (status) => {
      if (!isMountedRef.current) return
      // syncEngine 通知格式: { syncing, direction, tokenExpired }
      // syncing === false 且 direction === 'pull' 表示云端拉取已完成
      if (status.syncing === false && status.direction === 'pull' && id) {
        requestLockRef.current = false
        // 使用最新的 state.categories（通过函数式访问避免依赖）
        setCategoryName(prev => {
          const updatedCategory = state.categories.find((c) => c.id === id)
          return updatedCategory ? updatedCategory.name : prev
        })
        setUnits([])
        loadUnits()
      }
    }
    const unsubscribe = syncEngine.onSyncStatusChange(listener)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadUnits])

  const refreshBookmarks = useCallback(async () => {
    // [FIX #310] 防并发 + 组件卸载检查，避免状态更新到已卸载组件
    if (requestLockRef.current) return
    requestLockRef.current = true
    try {
      const allCardIds = []
      const unitsData = await getUnitsByCategory(id)
      for (const unit of unitsData) {
        const cards = await getCardsByUnit(unit.id)
        allCardIds.push(...cards.map((c) => c.id))
      }
      const bm = await getBookmarkStatuses(allCardIds)
      if (!isMountedRef.current) return
      setBookmarks(bm)
    } finally {
      requestLockRef.current = false
    }
  }, [id])

  const syncAndOfferUndo = useCallback(async ({ snapshot, message, refresh, undoNavigateTo }) => {
    const undo = async () => {
      try {
        await restoreDataSnapshot(snapshot)
        if (loadCategories) await loadCategories()
        if (typeof refresh === 'function') await refresh()
        showToast('已撤销操作。如需同步云端，请到云端数据页手动上传', 'success')
        if (undoNavigateTo) navigate(undoNavigateTo)
      } catch (e) {
        showToast('撤销失败：' + (e.message || '未知错误'), 'error')
      }
    }

    showToast(`${message}。如需同步云端，请到云端数据页手动上传`, 'success',
      [{ label: '撤销', onClick: undo }],
      { duration: 3000 },
    )
  }, [loadCategories, navigate, showToast])

  // [fix-bg-progress] 检测当前分类是否有进行中的 AI 卡片生成流程
  // 同一分类在此任务结束前不可再输入内容
  const hasActiveCardGenFlow = useMemo(() => {
    return bgtCtx.flows.some(f =>
      f.type === 'ai_generate_cards' &&
      (f.status === 'running' || f.status === 'awaiting_action') &&
      f.payload?.categoryId === id
    )
  }, [bgtCtx.flows, id])

  const handleGenerate = useCallback(
    async (text, options = {}) => {
      const { reuseFlowId, prompt } = options
      // [fix-bg-progress] 同一分类任务结束前禁止再次输入（重试时跳过此检查）
      if (!reuseFlowId && hasActiveCardGenFlow) {
        showToast('当前分类有正在进行的卡片生成任务，请等待完成或取消后再试', 'warn', null, { duration: 3000 })
        return
      }
      const isSparkMode = state.aiServiceMode === 'iflytek-spark'
      const isVolcanoMode = state.aiServiceMode === 'volcano'
      const isDashscopeMode = state.aiServiceMode === 'dashscope'
      const hasSparkCreds = !!state.iflytekSparkApiKey
      const hasVolcanoCreds = !!state.volcanoApiKey
      const hasDashscopeCreds = !!state.dashscopeApiKey
      const hasDeepSeek = !!state.apiKey
      const hasCreds = isSparkMode
        ? hasSparkCreds
        : isVolcanoMode
          ? hasVolcanoCreds
          : isDashscopeMode
            ? hasDashscopeCreds
            : hasDeepSeek
      if (!hasCreds) {
        let tip = '请先在设置页配置 DeepSeek API Key'
        if (isSparkMode) tip = '请先在设置页配置讯飞星火 APIPassword'
        else if (isVolcanoMode) tip = '请先在设置页配置火山引擎 API Key'
        else if (isDashscopeMode) tip = '请先在设置页配置阿里云千问 API Key'
        showToast(tip, 'error')
        return
      }

      // [UX Enhancement] 输入质量预检查：避免浪费 AI 调用和用户等待时间
      const inputQuality = checkInputQuality(text)
      if (!inputQuality.valid) {
        const errorMsg = inputQuality.issues.find(i => i.severity === 'error')?.message
        if (errorMsg) {
          showToast(errorMsg, 'error')
          return
        }
      }
      if (inputQuality.issues.length > 0) {
        const warningMsg = inputQuality.issues.find(i => i.severity === 'warning')?.message
        if (warningMsg) {
          showToast(warningMsg, 'warn')
        }
      }

      // [FIX #310] 状态锁：防止重复点击导致多次调用
      if (generatingRef.current) return
      if (requestLockRef.current) return

      startLoading()

      // === 创建后台流程 (flow) - 支持后台运行与状态显示 ===
      // [fix-retry] 重试时复用现有 flow，不创建新的
      let flowId
      if (reuseFlowId) {
        flowId = reuseFlowId
        // 重置 flow 状态为初始化
        bgtCtx.setFlowStep(flowId, '初始化', '正在重新启动 AI 卡片生成流程', { text, categoryId: id, aiConfig: null, step: 'init', retry: false })
        bgtCtx.setFlowProgress(flowId, 0)
      } else {
        flowId = bgtCtx.startFlow({
          type: 'ai_generate_cards',
          title: `生成卡片 (${text.slice(0, 20)}${text.length > 20 ? '...' : ''})`,
          initialStep: '初始化',
          initialDescription: '正在启动 AI 卡片生成流程',
          initialPayload: { text, categoryId: id, aiConfig: null, step: 'init' },
          onResumeRoute: null,
        })
      }
      setCurrentFlowId(flowId)

      try {
        const effectiveModel = isSparkMode
          ? state.iflytekSparkModel
          : isVolcanoMode
            ? state.volcanoModel
            : isDashscopeMode
              ? state.dashscopeModel
              : state.model

        // 预检查 API Key 有效性（5秒超时，超时视为通过）
        const preCheckPromise = (async () => {
          const { testAiConnection } = await import('../services/aiService')
          return testAiConnection(
            state.apiKey, state.aiServiceMode, effectiveModel,
            state.iflytekSparkApiKey, state.iflytekSparkApiSecret,
            state.volcanoApiKey, state.dashscopeApiKey,
          )
        })()
        const preCheckTimeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000))
        let preCheckResult
        try {
          preCheckResult = await Promise.race([preCheckPromise, preCheckTimeout])
        } catch (_) {
          // preCheckPromise 抛出异常，视为超时放行
          preCheckResult = 'timeout'
        }
        if (preCheckResult !== 'timeout' && !(preCheckResult && preCheckResult.ok)) {
          showToast('API Key 验证失败，请检查设置后重试', 'error')
          bgtCtx.failFlow(flowId, 'API Key 验证失败')
          resetLoading()
          return
        }

        // Clear any existing timeout
        if (generateTimeoutRef.current) {
          clearTimeout(generateTimeoutRef.current)
        }
        // Set 120-second timeout (AI 服务本身超时为 120s，留足余量)
        generateTimeoutRef.current = setTimeout(() => {
          if (generatingRef.current) {
            showToast('AI 响应超时，请重试', 'error')
            bgtCtx.failFlow(flowId, 'AI 响应超时')
            resetLoading()
          }
        }, 120000)
        setInputValue('')

        // 获取现有单元列表用于自动匹配
        const existingUnits = await getUnitsByCategory(id)
        const unitNames = existingUnits.map(u => u.name).filter(Boolean)
        
        // 获取分类目的，用于 AI 生成更符合学习目的的知识点
        const categoryPurpose = await getCategoryPurpose(id)

        const aiConfig = {
          apiKey: state.apiKey,
          model: effectiveModel,
          aiServiceMode: state.aiServiceMode,
          sparkApiKey: state.iflytekSparkApiKey,
          sparkApiSecret: state.iflytekApiSecret,
          volcanoApiKey: state.volcanoApiKey,
          dashscopeApiKey: state.dashscopeApiKey,
          summaryLevel,
        }

        // === 第一步：提取原始知识点（支持分批处理） ===
        const step1Input = text
        const step1Result = await extractKnowledgePoints(text, unitNames, aiConfig, (progress) => {
          if (progress.step === 'extract-kp') {
            setKpConfirmLoading(true)
          }
        }, categoryPurpose, prompt)
        setDebugEntries(prev => [...prev, {
          id: Date.now(),
          step: 'Step 1: 提取知识点',
          input: step1Input,
          output: step1Result.content,
          status: step1Result.error ? 'error' : 'success',
        }])
        const kpExtracted = extractJsonFromAiResponse(step1Result.content, aiConfig.aiServiceMode)
        let knowledgePoints = []
        if (kpExtracted.json && Array.isArray(kpExtracted.json.knowledge_points)) {
          knowledgePoints = kpExtracted.json.knowledge_points
        } else if (kpExtracted.error) {
          // 无法解析 JSON，尝试后备方案
          const lines = step1Result.content.split(/\n/).filter(s => s.trim().length > 10)
          if (lines.length > 0) {
            knowledgePoints = lines
          } else {
            showToast('AI 返回格式异常（Step 1），请重试', 'error')
            bgtCtx.failFlow(flowId, 'AI 返回格式异常（Step 1）')
            return
          }
        }
        if (knowledgePoints.length === 0) {
          showToast('未能提取到知识点，请重试（Step 1）', 'error')
          bgtCtx.failFlow(flowId, '未能提取到知识点')
          return
        }

        // 客户端强过滤：自动识别并移除章节标题类内容（所有路径统一过滤）
        const filteredPoints = filterHeadingLikePoints(knowledgePoints)
        const removedCount = knowledgePoints.length - filteredPoints.length
        if (removedCount > 0 && filteredPoints.length > 0) {
          showToast('已自动过滤 ' + removedCount + ' 条章节标题类内容', 'info')
        }
        const pointsToShow = filteredPoints.length > 0 ? filteredPoints : knowledgePoints

        // === 知识点预去重：在用户确认之前进行去重 ===
        let finalPointsToShow = pointsToShow
        let dedupFailed = false
        try {
          const existingKps = await getExistingKnowledgePointsByCategory(id)
          if (existingKps.length > 0) {
            setKpConfirmLoading(true)
            // 添加 30 秒超时保护
            const dedupPromise = deduplicateKnowledgePoints(pointsToShow, existingKps, aiConfig)
            const dedupTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('去重超时（30秒）')), 30000))
            const dedupResult = await Promise.race([dedupPromise, dedupTimeout])
            if (dedupResult.stats.duplicatesFound > 0) {
              showToast(`已过滤 ${dedupResult.stats.duplicatesFound} 个重复知识点`, 'info')
              setDebugEntries(prev => [...prev, {
                id: Date.now(),
                step: '去重: 知识点预去重',
                input: JSON.stringify({ tempPoints: pointsToShow, existingPoints: existingKps }),
                output: JSON.stringify(dedupResult),
                status: dedupResult.stats.modelType === 'fallback' ? 'warning' : 'success',
              }])
            }
            finalPointsToShow = dedupResult.uniquePoints
          } else {
          }
        } catch (e) {
          console.warn('[知识点提取] 预去重失败/超时，继续使用原始知识点:', e)
          dedupFailed = true
        } finally {
          // 确保 loading 状态被重置
          setKpConfirmLoading(false)
        }


        // 如果没有新的知识点（全部重复），弹出提示并返回
        if (finalPointsToShow.length === 0) {
          showToast('本次无新的原始知识点（全部为重复内容）', 'error', null, { duration: 4000 })
          bgtCtx.failFlow(flowId, '本次无新的原始知识点（全部为重复内容）')
          resetLoading()
          return
        }

        // === 分类目的为空时，根据知识点内容通过 AI 自动生成分类目的 ===
        if (!categoryPurpose || categoryPurpose.trim() === '') {
          try {
            setKpConfirmLoading(true)
            const generatedPurpose = await generateCategoryPurpose(finalPointsToShow, aiConfig)
            if (generatedPurpose) {
              await updateCategoryPurpose(id, generatedPurpose)
              showToast('已自动生成分类目的：' + generatedPurpose, 'info', null, { duration: 3000 })
            }
          } catch (e) {
            console.warn('[handleKpClick] 生成分类目的失败:', e)
          } finally {
            setKpConfirmLoading(false)
          }
        }

        // === 更新 flow 状态为"等待用户操作" ===
        bgtCtx.setFlowStep(
          flowId,
          '等待知识点确认',
          `已提取 ${finalPointsToShow.length} 个知识点，等待您确认`,
          {
            step: 'await_kp_confirm',
            kpConfirmList: finalPointsToShow,
            kpExistingUnits: existingUnits,
            aiConfig: aiConfig,
            text: text,
          }
        )
        bgtCtx.awaitUserAction(flowId, {
          title: '请确认知识点',
          message: `已提取 ${finalPointsToShow.length} 个知识点，请在弹窗中编辑并确认`,
          confirmLabel: '继续',
          cancelLabel: '取消',
          actionKey: 'kp_confirm',
        })

        // 暂停，等待用户确认/编辑知识点
        if (generateTimeoutRef.current) {
          clearTimeout(generateTimeoutRef.current)
          generateTimeoutRef.current = null
        }
        setKpConfirmList(finalPointsToShow)
        setKpConfirmConfig({
          existingUnits,
          aiConfig,
          rawText: text,
          existingCardList: null,
          flowId: flowId,
        })
        setShowKpConfirm(true)
        setCardGenStep(1)  // 步骤导航：进入第1步
        resetLoading()
        return
      } catch (e) {
        const errMsg = String(e?.message || e || '未知错误').slice(0, 80)
        bgtCtx.failFlow(flowId, errMsg)
        if (errMsg.includes('timeout') || errMsg.includes('超时') || errMsg.includes('TIMEOUT')) {
          showToast('AI 响应超时，请重试', 'error')
        } else if (errMsg.includes('network') || errMsg.includes('Failed to fetch') || errMsg.includes('网络')) {
          showToast('无法连接到服务器，请检查网络后重试', 'error')
        } else if (errMsg.includes('缺少') || errMsg.includes('密钥') || errMsg.includes('API Key')) {
          showToast(errMsg, 'error')
        } else {
          showToast('生成失败，请重试（' + errMsg + '）', 'error')
        }
      } finally {
        resetLoading()
      }
    },
    [id, state.apiKey, state.iflytekSparkApiKey, state.iflytekSparkModel, state.volcanoApiKey, state.volcanoModel, state.dashscopeApiKey, state.dashscopeModel, state.aiServiceMode, state.model, summaryLevel, showToast, loadCategories, resetLoading, startLoading, hasActiveCardGenFlow]
  )

  // [fix-retry] 监听 flow 重试事件：当 flow 的 payload.retry 为 true 且状态为 running 时，重新执行流程
  // 注意：必须放在 handleGenerate 定义之后，否则会报 ReferenceError
  useEffect(() => {
    if (!currentFlowId) return
    const flow = bgtCtx.getFlow(currentFlowId)
    if (!flow) return
    // 检查是否是重试标记
    if (flow.payload?.retry === true && flow.status === 'running') {
      const text = flow.payload?.text
      if (text) {
        // 调用 handleGenerate 复用现有 flowId
        handleGenerate(text, { reuseFlowId: currentFlowId })
      } else {
        // 没有原始文本，标记失败
        bgtCtx.failFlow(currentFlowId, '无法重试：缺少原始输入文本')
      }
    }
  }, [bgtCtx.flows, currentFlowId, handleGenerate, bgtCtx])

  // 知识点确认回调：用户点击"确认并生成卡片"
  const handleKpConfirm = useCallback(async (editedPoints) => {
    const config = kpConfirmConfig
    if (!config || !editedPoints || editedPoints.length === 0) return

    // === 恢复 flow 为运行状态（如果是 flow 流程） ===
    const flowIdToResume = config.flowId || currentFlowId
    if (flowIdToResume) {
      bgtCtx.resumeFlow(flowIdToResume, { editedPoints, step: 'topic_cluster' })
      bgtCtx.setFlowStep(
        flowIdToResume,
        '主题聚类',
        '正在对知识点进行主题分组...',
        { step: 'topic_cluster', editedPoints: editedPoints }
      )
      bgtCtx.setFlowProgress(flowIdToResume, 10)
    }

    // [fix-bg-progress] 立即关闭知识点确认弹窗，主题聚类在后台进行
    setShowKpConfirm(false)
    setKpConfirmList([])
    setKpConfirmConfig(null)
    startLoading()
    // [fix-P2-4] 重置超时取消标志
    timeoutCancelledRef.current = false

    // 设置超时（120秒，与 AI 服务超时保持一致）
    generateTimeoutRef.current = setTimeout(() => {
      if (generatingRef.current) {
        // [fix-P2-4] 设置取消标志，AI 回调完成时检查
        timeoutCancelledRef.current = true
        showToast('AI 响应超时，请重试', 'error')
        resetLoading()
        if (flowIdToResume) bgtCtx.failFlow(flowIdToResume, 'AI 响应超时')
      }
    }, 120000)

    try {
      const { existingUnits, aiConfig } = config
      const effectiveModel = aiConfig.model

      // 加载现有章节用于 AI 分类
      const existingChapters = await getChaptersByCategory(id)

      // === API 预检查（5秒超时，与 Step 1 一致）===
      const preCheckPromise = (async () => {
        const { testAiConnection } = await import('../services/aiService')
        return testAiConnection(
          aiConfig.apiKey, aiConfig.aiServiceMode, effectiveModel,
          aiConfig.sparkApiKey, aiConfig.sparkApiSecret,
          aiConfig.volcanoApiKey, aiConfig.dashscopeApiKey,
        )
      })()
      const preCheckTimeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000))
      let preCheckResult
      try {
        preCheckResult = await Promise.race([preCheckPromise, preCheckTimeout])
      } catch (_) {
        preCheckResult = 'timeout'
      }
      if (preCheckResult !== 'timeout' && !(preCheckResult && preCheckResult.ok)) {
        showToast('API Key 验证失败，请检查设置后重试', 'error')
        resetLoading()
        if (flowIdToResume) bgtCtx.failFlow(flowIdToResume, 'API Key 验证失败')
        return
      }

      // [fix-bg-progress] 更新进度：预检查完成
      if (flowIdToResume) bgtCtx.setFlowProgress(flowIdToResume, 20)

      // === 轻量级过滤：自动检测并移除明显是章节标题的条目 ===
      const filteredPointsWithIndex = filterHeadingLikePoints(editedPoints.map(p => p.text))
      const removedCount = editedPoints.length - filteredPointsWithIndex.length
      if (removedCount > 0 && filteredPointsWithIndex.length > 0) {
        showToast('已自动过滤 ' + removedCount + ' 条章节标题类内容，仅处理有效知识点', 'info')
      }

      const filteredTextSet = new Set(filteredPointsWithIndex)
      const filteredCounts = new Map()
      const pointsToUse = filteredPointsWithIndex.length > 0
        ? filteredPointsWithIndex.map(text => {
            const sameTextItems = editedPoints.filter(p => p.text === text)
            const usedCount = filteredCounts.get(text) || 0
            filteredCounts.set(text, usedCount + 1)
            const original = sameTextItems[usedCount]
            return { text, originalIndex: original?.originalIndex ?? -1 }
          })
        : editedPoints

      const kpMarkers = pointsToUse.map((_, idx) => `__KP_${idx}__`)

      // 数据一致性校验

      const pointsToUseStrings = pointsToUse.map(p => p.text)

      // [fix-bg-progress] 更新进度：开始主题聚类
      if (flowIdToResume) {
        bgtCtx.setFlowStep(
          flowIdToResume,
          '主题聚类',
          `正在对 ${pointsToUseStrings.length} 个知识点进行主题分组...`,
          { step: 'topic_cluster' }
        )
        bgtCtx.setFlowProgress(flowIdToResume, 30)
      }

      // === 新增：主题聚类（在归类之前先分组） ===
      const topics = await clusterKnowledgePointsByTopic(pointsToUseStrings, aiConfig)

      // [fix-P2-4] 超时取消检查：如果已超时，不执行后续弹窗逻辑
      if (timeoutCancelledRef.current) {
        return
      }

      // [fix-bg-progress] 取消检查
      if (flowIdToResume && bgtCtx.isFlowCancelled(flowIdToResume)) {
        return
      }

      setDebugEntries(prev => [...prev, {
        id: Date.now(),
        step: '聚类: 主题分组',
        input: JSON.stringify({ knowledge_points: pointsToUseStrings }),
        output: JSON.stringify(topics),
        status: 'success',
      }])

      // === 更新 flow 状态为"等待用户操作"（主题聚类阶段） ===
      if (flowIdToResume) {
        bgtCtx.setFlowProgress(flowIdToResume, 50)
        bgtCtx.setFlowStep(
          flowIdToResume,
          '等待主题确认',
          `已聚类出 ${topics.length} 个主题，等待您确认`,
          {
            step: 'await_topic_confirm',
            topics: topics,
            existingUnits: existingUnits,
            aiConfig: aiConfig,
            editedPoints: pointsToUseStrings,
            kpMarkers: kpMarkers,
            existingChapters: existingChapters,
          }
        )
        bgtCtx.awaitUserAction(flowIdToResume, {
          title: '请确认主题分组',
          message: `已聚类出 ${topics.length} 个主题，请确认或调整`,
          confirmLabel: '继续',
          cancelLabel: '取消',
          actionKey: 'topic_confirm',
        })
      }

      // === 新增：弹出主题确认弹窗，暂停等待用户确认 ===
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current)
        generateTimeoutRef.current = null
      }
      setCurrentTopics(topics)
      setTopicConfirmConfig({
        existingUnits,
        aiConfig,
        pointsToUse: pointsToUseStrings,
        kpMarkers,
        existingChapters,
        flatNewCards: [],
        existingCardList: null,
        flowId: flowIdToResume,
      })
      setCardGenStepSnapshots(prev => ({
        ...prev,
        kpConfirm: {
          pointsToUse,
          kpMarkers,
          existingUnits,
          existingChapters,
          aiConfig,
        },
      }))
      setShowTopicConfirm(true)
      setCardGenStep(2)
      resetLoading()
      return // 暂停，等待用户在主题确认弹窗中点击"确认"
    } catch (e) {
      const errMsg = String(e?.message || e || '未知错误').slice(0, 80)
      if (flowIdToResume) {
        bgtCtx.failFlow(flowIdToResume, errMsg)
      }
      showToast('主题聚类失败: ' + errMsg, 'error')
    } finally {
      resetLoading()
    }
  }, [id, kpConfirmConfig, showToast, resetLoading, startLoading, currentFlowId, bgtCtx])

  // 合并摘要确认回调：用户确认合并后，在后台生成卡片并进入预览
  const handleMergeSummaryConfirm = useCallback(async (generatedFlatNewCards, mergeData) => {
    setShowMergeSummary(false)
    if (!mergeData) {
      console.warn('[handleMergeSummaryConfirm] 无 mergeData，退出')
      return
    }

    const config = topicConfirmConfig
    if (!config) {
      console.warn('[handleMergeSummaryConfirm] 无 topicConfirmConfig，退出')
      return
    }

    const { existingUnits, aiConfig } = config
    const kpList = config.pointsToUse || []
    const flowIdToResume = config.flowId || currentFlowId

    // [fix-bg-progress] 如果未传入卡片（generatedFlatNewCards === null），在后台生成
    let flatNewCards = generatedFlatNewCards || []
    if (flatNewCards.length === 0 && cardGenStepSnapshots.cardPreview?.flatPanelCards?.length > 0) {
      flatNewCards = cardGenStepSnapshots.cardPreview.flatPanelCards
    }

    // === 后台生成卡片：当没有现成卡片时，启动后台生成流程 ===
    if (flatNewCards.length === 0 && kpList.length > 0) {
      const isWeakModel = aiConfig?.aiServiceMode === 'iflytek-spark' && (!aiConfig?.model || aiConfig?.model === 'lite')

      // 更新 flow 状态为"正在生成卡片"
      if (flowIdToResume) {
        bgtCtx.resumeFlow(flowIdToResume, { step: 'generating_cards' })
        bgtCtx.setFlowStep(
          flowIdToResume,
          '生成卡片',
          `正在${isWeakModel ? '使用弱模型' : '调用 AI'}生成 ${kpList.length} 张卡片...`,
          { step: 'generating_cards' }
        )
        bgtCtx.setFlowProgress(flowIdToResume, 5)
      }

      try {
        if (isWeakModel) {
          // 弱模型：1:1 映射，直接使用知识点原文
          flatNewCards = kpList.map((kp, idx) => ({
            front: kp,
            back: kp,
            knowledge_point: kp,
            kpMarker: `__KP_${idx}__`,
            kpIndex: idx,
          }))
          if (flowIdToResume) bgtCtx.setFlowProgress(flowIdToResume, 100)
          showToast('已生成 ' + flatNewCards.length + ' 张卡片', 'success')
        } else {
          // 强模型：调用 AI 生成卡片，带进度回调和取消支持
          const { generateCardsFromKnowledgePoints } = await import('../services/aiService')
          const { attachOriginalKnowledgePoints } = await import('../utils/cardKnowledgePoint')
          const { parseAIResponse, extractJsonFromAiResponse } = await import('../utils/helpers')

          const isCancelled = flowIdToResume ? () => bgtCtx.isFlowCancelled(flowIdToResume) : () => false
          const onProgress = (info) => {
            if (!flowIdToResume) return
            if (info.step === 'generate-cards' && info.total > 0) {
              // 进度映射：5% ~ 95%
              const pct = 5 + Math.floor((info.current / info.total) * 90)
              bgtCtx.setFlowProgress(flowIdToResume, pct)
              bgtCtx.setFlowStep(
                flowIdToResume,
                '生成卡片',
                `正在生成卡片... ${info.current}/${info.total}`,
                { step: 'generating_cards' }
              )
            }
          }

          const step2Result = await generateCardsFromKnowledgePoints(kpList, aiConfig, onProgress, isCancelled)

          // 取消检查
          if (flowIdToResume && bgtCtx.isFlowCancelled(flowIdToResume)) {
            return
          }

          const cardsExtracted = extractJsonFromAiResponse(step2Result.content, aiConfig.aiServiceMode)
          let wrappedContent = ''
          if (cardsExtracted.json && Array.isArray(cardsExtracted.json.units)) {
            wrappedContent = step2Result.content
          } else if (cardsExtracted.json && Array.isArray(cardsExtracted.json.cards)) {
            const cardsArray = attachOriginalKnowledgePoints(cardsExtracted.json.cards, kpList)
            wrappedContent = JSON.stringify({ units: [{ name: '新生成', cards: cardsArray }] })
          } else {
            if (flowIdToResume) bgtCtx.failFlow(flowIdToResume, 'AI 卡片生成格式异常')
            showToast('AI 卡片生成格式异常，请重试', 'error')
            return
          }
          const parsed = parseAIResponse(wrappedContent)
          if (!parsed || parsed.error || !parsed.units || parsed.units.length === 0) {
            if (flowIdToResume) bgtCtx.failFlow(flowIdToResume, 'AI 返回格式异常')
            showToast('AI 返回格式异常，请重试', 'error')
            return
          }

          // 构建 flatNewCards
          for (const u of parsed.units || []) {
            if (!u || typeof u !== 'object') continue
            for (const c of (u.cards || [])) {
              if (!c || typeof c !== 'object') continue
              let kpIndex = null
              let finalKpMarker = typeof c.kpMarker === 'string' ? c.kpMarker : null
              if (finalKpMarker) {
                const match = finalKpMarker.match(/__KP_(\d+)__/)
                if (match) kpIndex = parseInt(match[1], 10)
              }
              if (!finalKpMarker && typeof c.knowledge_point === 'string') {
                const kpMatch = c.knowledge_point.match(/\[__KP_(\d+)__\]/)
                if (kpMatch) {
                  finalKpMarker = `__KP_${kpMatch[1]}__`
                  kpIndex = parseInt(kpMatch[1], 10)
                }
              }
              const kpText = typeof c.knowledge_point === 'string' && c.knowledge_point.trim() ? c.knowledge_point : null
              flatNewCards.push({
                front: (typeof c.front === 'string' && c.front.trim()) ? c.front : (kpText || '（空问题）'),
                back: (typeof c.back === 'string' && c.back.trim()) ? c.back : (kpText || '（空答案）'),
                knowledge_point: kpText,
                kpMarker: finalKpMarker,
                kpIndex: kpIndex,
              })
            }
          }
          if (flowIdToResume) bgtCtx.setFlowProgress(flowIdToResume, 100)
          showToast('已生成 ' + flatNewCards.length + ' 张卡片', 'success')
        }
      } catch (e) {
        // 用户取消
        if (e?.cancelled) {
          if (flowIdToResume) {
            bgtCtx.cancelFlow(flowIdToResume)
          }
          showToast('已取消卡片生成', 'info')
          return
        }
        // 其他错误
        if (flowIdToResume) bgtCtx.failFlow(flowIdToResume, '卡片生成失败: ' + (e?.message || '未知错误'))
        showToast('卡片生成失败: ' + (e?.message || '未知错误'), 'error')
        return
      }
    }


    // 【修复】使用 beforeUnits（合并前原始数据）而非 finalUnits（合并后可能丢失数据）
    // 确保所有卡片都被保留，合并决策仅作为信息展示
    const unitsToUse = mergeData.beforeUnits || mergeData.finalUnits || []

    // Build unitDataList from original units
    const unitDataList = []
    const usedCardIndices = new Set()
    let nullCardCount = 0  // 统计 null 卡片（flatNewCards 中不存在）

    // [fix-P0-3] 修复强模型索引错位：构建 kpIndex → card 映射，避免位置索引与 kpIndex 不一致导致卡片错位
    // 强模型路径下 flatNewCards 按 AI 响应顺序构建，数组位置 ≠ kpIndex
    // 弱模型路径下 1:1 映射，kpIndex === 数组位置，映射兼容
    const kpIndexToCard = new Map()
    for (let i = 0; i < flatNewCards.length; i++) {
      const c = flatNewCards[i]
      if (!c) continue
      // 优先使用 kpIndex，无 kpIndex 时回退到位置索引（弱模型兼容）
      // 使用带前缀的 key 区分两种来源，避免 null kpIndex 回退索引与真实 kpIndex 值冲突
      const key = (c.kpIndex !== null && c.kpIndex !== undefined)
        ? `kp:${c.kpIndex}`
        : `idx:${i}`
      if (!kpIndexToCard.has(key)) {
        kpIndexToCard.set(key, c)
      }
    }

    for (const unit of unitsToUse) {
      const cards = (unit.cardIndices || []).map(idx => {
        // [fix-P0-3] 使用 kpIndex 查找卡片，而非位置索引
        // 同时尝试 kp: 和 idx: 两种前缀，兼容强模型（kpIndex）和弱模型（数组位置）
        const card = kpIndexToCard.get(`kp:${idx}`) || kpIndexToCard.get(`idx:${idx}`) || flatNewCards[idx]
        if (!card) {
          nullCardCount++
          return null
        }
        usedCardIndices.add(idx)
        return { front: card.front, back: card.back, knowledge_point: card.knowledge_point || null, kpIndex: card.kpIndex }
      }).filter(Boolean)
      if (cards.length > 0) {
        unitDataList.push({ name: unit.name, chapterName: unit.chapterName || '未归类', matchedUnitId: null, chapterId: null, cards })
      } else {
      }
    }
    if (nullCardCount > 0) {
      console.warn('[handleMergeSummaryConfirm] %d 个 cardIndex 在 flatNewCards 中不存在，已跳过', nullCardCount)
    }

    // 【修复】补充未分配卡片（兜底，防止数据丢失）
    // [fix-P0-3] 兜底逻辑修正：遍历 flatNewCards 时用 kpIndex 判断是否已使用
    let fallbackCardCount = 0
    for (let i = 0; i < flatNewCards.length; i++) {
      const card = flatNewCards[i]
      if (!card) continue
      // [fix-P0-3] 使用 card.kpIndex 判断是否已分配（与 usedCardIndices 存储的 key 一致）
      const cardKey = (card.kpIndex !== null && card.kpIndex !== undefined) ? card.kpIndex : i
      if (!usedCardIndices.has(cardKey)) {
        fallbackCardCount++
        // 找到合适的章名：从 topics 中查找
        const kpIndex = card.kpIndex
        let chapterName = '未归类'
        if (kpIndex !== null && kpIndex !== undefined) {
          const beforeTopics = mergeData.beforeTopics
          if (beforeTopics instanceof Map) {
            for (const [chName, info] of beforeTopics.entries()) {
              if (info.cardIndices && info.cardIndices.includes(kpIndex)) {
                chapterName = chName
                break
              }
            }
          }
        }
        // 查找或创建默认单元
        let fallbackUnit = unitDataList.find(u => u.name === '默认单元' && u.chapterName === chapterName)
        if (!fallbackUnit) {
          fallbackUnit = { name: '默认单元', chapterName, matchedUnitId: null, chapterId: null, cards: [] }
          unitDataList.push(fallbackUnit)
        }
        fallbackUnit.cards.push({ front: card.front, back: card.back, knowledge_point: card.knowledge_point || null, kpIndex: card.kpIndex })
      }
    }
    if (fallbackCardCount > 0) {
      console.warn('[handleMergeSummaryConfirm] ── 兜底补充: +%d 未分配卡片 ──', fallbackCardCount)
    } else {
    }

    const totalCardsInList = unitDataList.reduce((sum, u) => sum + u.cards.length, 0)
    if (totalCardsInList !== flatNewCards.length) {
      console.warn('[handleMergeSummaryConfirm] ⚠ 卡片数量不匹配! unitDataList=%d vs flatNewCards=%d, 差值=%d',
        totalCardsInList, flatNewCards.length, flatNewCards.length - totalCardsInList)
      // 诊断未分配卡片的原因
      const assignedIndices = new Set()
      for (const unit of unitsToUse) {
        for (const idx of (unit.cardIndices || [])) {
          assignedIndices.add(idx)
        }
      }
      const missingInFlat = []
      for (let i = 0; i < flatNewCards.length; i++) {
        if (!assignedIndices.has(i)) missingInFlat.push(i)
      }
      console.warn(`[handleMergeSummaryConfirm] 未出现在 units 中的 cardIndices (${missingInFlat.length}个): ${missingInFlat.slice(0, 20).join(',')}${missingInFlat.length > 20 ? '...' : ''}`)
    }

    // 构建 flatPanelCards 用于 NewCardPreviewPanel
    const flatPanelCards = []
    const chapterStats = {}  // 统计章节-单元分布
    for (const unitData of unitDataList) {
      if (!unitData || typeof unitData !== 'object') continue
      const uName = typeof unitData.name === 'string' && unitData.name.trim() ? unitData.name : '未命名单元'
      const chName = typeof unitData.chapterName === 'string' && unitData.chapterName.trim() ? unitData.chapterName : null
      const key = `${chName || '无章节'}|${uName}`
      chapterStats[key] = (chapterStats[key] || 0) + (unitData.cards || []).length
      for (const card of (unitData.cards || [])) {
        if (!card || typeof card !== 'object') continue
        flatPanelCards.push({
          front: typeof card.front === 'string' && card.front.trim() ? card.front : '（空问题）',
          back: typeof card.back === 'string' && card.back.trim() ? card.back : '（空答案）',
          knowledge_point: typeof card.knowledge_point === 'string' && card.knowledge_point.trim() ? card.knowledge_point : null,
          unitName: uName,
          chapterName: chName,
          kpIndex: card.kpIndex,
        })
      }
    }

    // 保存到快照供 NewCardPreviewPanel 使用
    setCardGenStepSnapshots(prev => ({
      ...prev,
      cardPreview: {
        unitDataList,
        flatPanelCards,
        pointsToUse: config.pointsToUse || [],
      },
    }))
    setPreviewUnitDataList(unitDataList)
    setPreviewFlatPanelCards(flatPanelCards)
    setShowNewCardPreviewPanel(true)
    setCardGenStep(5)  // 步骤导航：进入第5步（NewCardPreviewPanel）

    // 更新 flow 状态为"等待预览确认"
    if (flowIdToResume) {
      bgtCtx.setFlowStep(
        flowIdToResume,
        '等待预览确认',
        `已生成 ${flatPanelCards.length} 张卡片，请在预览面板中确认`,
        { step: 'await_preview', unitDataList }
      )
      bgtCtx.awaitUserAction(flowIdToResume, {
        title: '请确认生成的卡片',
        message: `已生成 ${flatPanelCards.length} 张卡片，请在预览面板中查看并确认`,
        confirmLabel: '查看预览',
        cancelLabel: '取消',
        actionKey: 'preview_confirm',
      }, { unitDataList })
    }

  }, [topicConfirmConfig, currentFlowId, cardGenStepSnapshots, bgtCtx, showToast])

  // 新卡片预览确认回调：关闭所有弹窗，刷新分类页面
  const handlePreviewConfirm = useCallback(async () => {
    setShowNewCardPreviewPanel(false)
    setPreviewUnitDataList([])
    setPreviewFlatPanelCards([])
    setCardGenStep(0)
    setCardGenStepSnapshots({})
    setShowTopicConfirm(false)
    setShowMergeSummary(false)
    setTopicConfirmConfig(null)
    setMergeSummaryData(null)
    setCurrentTopics([])
    // [fix-bg-progress] 完成 flow
    if (currentFlowId) {
      bgtCtx.completeFlow(currentFlowId, '卡片已保存成功')
    }
    // 刷新分类页面数据
    await loadUnits()
    setCardsRefreshKey(k => k + 1)
    await loadCategories()
    refreshBookmarks()
    showToast('卡片已保存成功', 'success')
  }, [loadUnits, loadCategories, refreshBookmarks, showToast, currentFlowId, bgtCtx])

  // 主题确认回调：用户点击"确认"后继续分类流程
  const handleTopicConfirm = useCallback(async (finalTopics) => {
    const config = topicConfirmConfig
    if (!config || !finalTopics || finalTopics.length === 0) return

    // [fix-bg-progress] 获取 flowId 用于状态更新
    const flowIdToResume = config.flowId || currentFlowId

    // 【修复】不要提前关闭弹窗，等生成成功后再关闭
    // 失败时保留弹窗让用户可以重试
    setTopicConfirmLoading(true)
    startLoading()

    // 设置超时（120秒，与 AI 服务超时保持一致）
    generateTimeoutRef.current = setTimeout(() => {
      if (generatingRef.current) {
        showToast('AI 响应超时，请重试', 'error')
        if (flowIdToResume) bgtCtx.failFlow(flowIdToResume, 'AI 响应超时')
        resetLoading()
        setTopicConfirmLoading(false)
      }
    }, 120000)

    try {
      const { existingUnits, aiConfig, pointsToUse, kpMarkers, existingChapters, flatNewCards } = config
      const effectiveModel = aiConfig.model

      // 延迟化：构造代理卡片数组供后续 merge 函数使用
      // cardIndices 指向 pointsToUse 索引，每个代理卡片包含 front（知识点原文）
      const proxyFlatNewCards = pointsToUse.map((kp, i) => ({
        kpIndex: i,
        front: kp,
        back: kp,
        knowledge_point: kp,
      }))

      // 数据一致性校验：确保知识点、标记和卡片数量匹配

      // === 阶段 4：新主题/新单元生成（仅生成新结构，不关联已有体系） ===
      const assignments = await generateNewTopicsAndUnits(finalTopics, proxyFlatNewCards, pointsToUse, {
        aiServiceMode: aiConfig.aiServiceMode,
        apiKey: aiConfig.apiKey,
        model: effectiveModel,
        sparkApiKey: aiConfig.sparkApiKey,
        sparkApiSecret: aiConfig.sparkApiSecret,
        volcanoApiKey: aiConfig.volcanoApiKey,
        dashscopeApiKey: aiConfig.dashscopeApiKey,
      })
      setDebugEntries(prev => [...prev, {
        id: Date.now(),
        step: '新流程: 新主题/新单元生成',
        input: JSON.stringify({ topics: finalTopics, cardsCount: proxyFlatNewCards.length }),
        output: JSON.stringify(assignments, null, 2),
        status: Array.isArray(assignments) && assignments.length > 0 ? 'success' : 'error',
      }])

      if (!Array.isArray(assignments) || assignments.length === 0) {
        showToast('新主题/单元生成失败，请重试', 'error')
        setTopicConfirmLoading(false)
        resetLoading()
        if (generateTimeoutRef.current) {
          clearTimeout(generateTimeoutRef.current)
          generateTimeoutRef.current = null
        }
        return
      }

      // === 构建新主题/单元数据结构 ===
      const newTopicsMap = new Map()   // chapterName → { cardIndices[], unitNames: Set }
      const newUnitsList = []          // [{ name, chapterName, cardIndices[] }]
      
      for (const ass of assignments) {
        if (!ass || typeof ass.cardIndex !== 'number') continue
        const chapterName = ass.newChapterName || '未归类'
        const unitName = ass.newUnitName || '默认单元'
        
        if (!newTopicsMap.has(chapterName)) {
          newTopicsMap.set(chapterName, { cardIndices: [], unitNames: new Set() })
        }
        const topic = newTopicsMap.get(chapterName)
        topic.cardIndices.push(ass.cardIndex)
        topic.unitNames.add(unitName)
        
        // 查找或创建单元
        let unit = newUnitsList.find(u => u.name === unitName && u.chapterName === chapterName)
        if (!unit) {
          unit = { name: unitName, chapterName, cardIndices: [] }
          newUnitsList.push(unit)
        }
        unit.cardIndices.push(ass.cardIndex)
      }

      const totalCardIndicesInNewUnits = newUnitsList.reduce((sum, u) => sum + (u.cardIndices?.length || 0), 0)
      if (totalCardIndicesInNewUnits !== proxyFlatNewCards.length) {
        console.warn(`[handleTopicConfirm] ⚠ 新单元卡片数不匹配! newUnits总卡片=${totalCardIndicesInNewUnits} vs proxyFlatNewCards=${proxyFlatNewCards.length}, 差值=${proxyFlatNewCards.length - totalCardIndicesInNewUnits}`)
      } else {
      }


      // === 阶段 5-7：AI 合并判断 → 循环合并控制 ===
      const mergeResult = await loopMergeControl(
        newTopicsMap, newUnitsList,
        existingChapters, existingUnits, proxyFlatNewCards,
        {
          aiServiceMode: aiConfig.aiServiceMode,
          apiKey: aiConfig.apiKey,
          model: effectiveModel,
          sparkApiKey: aiConfig.sparkApiKey,
          sparkApiSecret: aiConfig.sparkApiSecret,
          volcanoApiKey: aiConfig.volcanoApiKey,
          dashscopeApiKey: aiConfig.dashscopeApiKey,
        },
        id
      )
      setDebugEntries(prev => [...prev, {
        id: Date.now(),
        step: '新流程: 合并控制结果',
        input: JSON.stringify({ newTopicsCount: newTopicsMap.size, newUnitsCount: newUnitsList.length }),
        output: JSON.stringify({
          deletedChapterIds: mergeResult.deletedChapterIds,
          deletedUnitIds: mergeResult.deletedUnitIds,
          migrationCount: mergeResult.unitMigrations?.length || 0,
        }, null, 2),
        status: 'success',
      }])

      // Save merge summary data and show popup
      const beforeUnitsCopy = JSON.parse(JSON.stringify(newUnitsList))
      const newMergeSummaryData = {
        newTopics: mergeResult.finalTopics || newTopicsMap,
        mergeDecisions: mergeResult.mergeDecisions || [],
        replaceDecisions: mergeResult.replaceDecisions || [],
        deletedChapterIds: mergeResult.deletedChapterIds || [],
        deletedUnitIds: mergeResult.deletedUnitIds || [],
        finalUnits: mergeResult.finalUnits || newUnitsList,
        // 合并前数据，用于弹窗对比展示
        beforeTopics: newTopicsMap,
        beforeUnits: beforeUnitsCopy,
      }
      setMergeSummaryData(newMergeSummaryData)
      // [fix-P1-6] 保存 mergeSummary 快照，供 handleStepBack 回退时恢复
      setCardGenStepSnapshots(prev => ({
        ...prev,
        mergeSummary: newMergeSummaryData,
      }))
      setShowMergeSummary(true)
      setShowTopicConfirm(false)
      setCardGenStep(3)  // 步骤导航：进入第3步
      return
    } catch (e) {
      // 检查是否为 AI 超时错误
      if (e instanceof AiTimeoutError || (e?.name === 'AiTimeoutError') || String(e?.message || '').includes('超时')) {
        const config = topicConfirmConfig
        if (!config) {
          showToast('AI 响应超时，配置信息丢失', 'error')
          return
        }
        const { existingUnits, pointsToUse } = config
        
        // 生成 fallback assignments（基于主题聚类结果）
        const kpIndexToTopic = new Map()
        for (const topic of finalTopics) {
          for (const kpIdx of topic.pointIndices) {
            kpIndexToTopic.set(kpIdx, topic.chapterName || topic.topicName)
          }
        }
        const fallbackAssignments = []
        for (let i = 0; i < pointsToUse.length; i++) {
          const kp = pointsToUse[i]
          const kpIndex = i
          const topicName = kpIndexToTopic.get(kpIndex) || kp || '未归类'
          fallbackAssignments.push({
            cardIndex: i,
            chapterId: null,
            unitId: null,
            newChapterName: String(topicName).slice(0, 12),
            newUnitName: String(topicName).slice(0, 16),
          })
        }
        
        // 保存 fallback assignments 并显示确认对话框
        setTimeoutFallbackAssignments(fallbackAssignments)
        setShowTimeoutConfirm(true)
        setShowTopicConfirm(false)
        return
      }
      
      const errMsg = String(e?.message || e || '未知错误').slice(0, 80)
      if (flowIdToResume) {
        bgtCtx.failFlow(flowIdToResume, errMsg)
      }
      if (errMsg.includes('network') || errMsg.includes('Failed to fetch') || errMsg.includes('网络')) {
        showToast('无法连接到服务器，请检查网络后重试', 'error')
      } else {
        showToast('生成失败，请重试（' + errMsg + '）', 'error')
      }
    } finally {
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current)
        generateTimeoutRef.current = null
      }
      resetLoading()
      setTopicConfirmLoading(false)
    }
  }, [id, topicConfirmConfig, showToast, resetLoading, startLoading, currentFlowId, bgtCtx])

  // 主题确认取消回调
  const handleTopicCancel = useCallback(() => {
    setShowTopicConfirm(false)
    setCurrentTopics([])
    setTopicConfirmConfig(null)
    // [fix-bg-progress] 取消 flow
    if (currentFlowId) {
      bgtCtx.cancelFlow(currentFlowId)
    }
  }, [currentFlowId, bgtCtx])

  // 主题重新聚类回调
  const handleTopicRegenerate = useCallback(async (granularity = 'standard') => {
    const config = topicConfirmConfig
    if (!config) return

    const currentCount = currentTopics.length
    
    // 简模式：检查是否已最简
    if (granularity === 'concise' && currentCount <= 2) {
      showToast('已是最简主题分组（仅 ' + currentCount + ' 个主题）', 'info')
      return
    }
    
    // 即时反馈
    if (granularity === 'concise') {
      showToast('当前 ' + currentCount + ' 个主题，正在简化...', 'info')
    } else if (granularity === 'detailed') {
      showToast('当前 ' + currentCount + ' 个主题，正在细分...', 'info')
    }

    setTopicConfirmLoading(true)
    try {
      const { aiConfig, pointsToUse } = config
      // 【修复】"简"模式时传入 null 强制完全重新聚类，不要在原有基础上优化
      const usePreviousTopics = granularity !== 'concise'
      // 传入当前主题数量，让 AI 强制生成更少/更多的主题
      const newTopics = await clusterKnowledgePointsByTopic(pointsToUse, aiConfig, usePreviousTopics ? currentTopics : null, granularity, currentCount)
      
      // 保留用户手动编辑的章节名：按主题名匹配，同名则保留旧章节名
      const oldChapterNameMap = new Map()
      for (const t of currentTopics) {
        if (t.chapterName && t.chapterName !== t.topicName) {
          oldChapterNameMap.set(t.topicName, t.chapterName)
        }
      }
      const topicsWithChapter = newTopics.map(t => ({
        ...t,
        chapterName: oldChapterNameMap.get(t.topicName) || t.topicName,
      }))
      
      setCurrentTopics(topicsWithChapter)
      setDebugEntries(prev => [...prev, {
        id: Date.now(),
        step: `聚类: 重新聚类(${granularity})`,
        input: JSON.stringify({ knowledge_points: pointsToUse, previousTopics: usePreviousTopics ? currentTopics : null, granularity }),
        output: JSON.stringify(newTopics),
        status: 'success',
      }])
    } catch (e) {
      // [P3-5] 错误消息友好化：隐藏技术细节，提供可操作建议
      const errMsg = String(e?.message || e || '')
      let friendlyMsg = '重新聚类失败，请重试'
      if (errMsg.includes('timeout') || errMsg.includes('超时')) {
        friendlyMsg = 'AI 响应超时，请检查网络后重试'
      } else if (errMsg.includes('network') || errMsg.includes('Failed to fetch')) {
        friendlyMsg = '网络连接失败，请检查网络后重试'
      } else if (errMsg.includes('API') || errMsg.includes('Key') || errMsg.includes('密钥')) {
        friendlyMsg = 'AI 配置异常，请在设置页检查 API 配置'
      }
      showToast(friendlyMsg, 'error')
    } finally {
      setTopicConfirmLoading(false)
    }
  }, [topicConfirmConfig, currentTopics, showToast])

  // 超时确认对话框 - 用户选择"使用默认分组"
  const handleTimeoutConfirm = useCallback(async () => {
    setShowTimeoutConfirm(false)
    if (!timeoutFallbackAssignments || !topicConfirmConfig) {
      showToast('默认分组配置丢失', 'error')
      return
    }
    
    const config = topicConfirmConfig
    const { existingUnits, pointsToUse } = config
    
    // 延迟化：构造代理卡片数组（使用知识点原文）
    const proxyFlatNewCards = (pointsToUse || []).map((kp, i) => ({
      kpIndex: i,
      front: kp,
      back: kp,
      knowledge_point: kp,
    }))
    
    startLoading()
    generateTimeoutRef.current = setTimeout(() => {
      if (generatingRef.current) {
        showToast('处理超时，请重试', 'error')
        resetLoading()
      }
    }, 120000)
    
    try {
      const assignmentsSafe = timeoutFallbackAssignments
      
      // 构建新单元数据结构（新流程：仅新结构）
      const newUnitsMap = new Map()  // unitName → cards[]
      for (let i = 0; i < proxyFlatNewCards.length; i++) {
        const card = proxyFlatNewCards[i]
        const ass = assignmentsSafe[i] || { newUnitName: '未命名单元', newChapterName: '未归类' }
        const unitName = ass.newUnitName || '未命名单元'
        if (!newUnitsMap.has(unitName)) {
          newUnitsMap.set(unitName, [])
        }
        newUnitsMap.get(unitName).push({
          front: card.front,
          back: card.back,
          knowledge_point: card.knowledge_point || null,
        })
      }
      
      const unitDataList = []
      for (const [name, cards] of newUnitsMap.entries()) {
        const ass = assignmentsSafe.find(a => a.newUnitName === name) || {}
        unitDataList.push({ 
          name, 
          matchedUnitId: null, 
          chapterId: null, 
          chapterName: ass.newChapterName || '未归类',
          cards,
        })
      }
      
      // 打开 NewCardPreviewPanel
      const flatPanelCards = []
      
      for (const unitData of unitDataList) {
        if (!unitData || typeof unitData !== 'object') continue
        const uName = typeof unitData.name === 'string' && unitData.name.trim() ? unitData.name : '未命名单元'
        const chName = typeof unitData.chapterName === 'string' && unitData.chapterName.trim() ? unitData.chapterName : null
        for (const card of (unitData.cards || [])) {
          if (!card || typeof card !== 'object') continue
          flatPanelCards.push({
            front: typeof card.front === 'string' && card.front.trim() ? card.front : '（空问题）',
            back: typeof card.back === 'string' && card.back.trim() ? card.back : '（空答案）',
            knowledge_point: typeof card.knowledge_point === 'string' && card.knowledge_point.trim() ? card.knowledge_point : null,
            unitName: uName,
            chapterName: chName,
          })
        }
      }
      
      setPreviewUnitDataList(unitDataList)
      setPreviewFlatPanelCards(flatPanelCards)
      setShowNewCardPreviewPanel(true)
      setCardGenStep(5)
      showToast('已使用默认分组（基于主题聚类）', 'info')
      
    } catch (e) {
      // [P3-5] 错误消息友好化
      const errMsg = String(e?.message || e || '')
      let friendlyMsg = '处理失败，请重试'
      if (errMsg.includes('timeout') || errMsg.includes('超时')) {
        friendlyMsg = 'AI 响应超时，请检查网络后重试'
      } else if (errMsg.includes('network') || errMsg.includes('Failed to fetch')) {
        friendlyMsg = '网络连接失败，请检查网络后重试'
      } else if (errMsg.includes('API') || errMsg.includes('Key') || errMsg.includes('密钥')) {
        friendlyMsg = 'AI 配置异常，请在设置页检查 API 配置'
      }
      showToast(friendlyMsg, 'error')
    } finally {
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current)
        generateTimeoutRef.current = null
      }
      resetLoading()
      setTimeoutFallbackAssignments(null)
    }
  }, [timeoutFallbackAssignments, topicConfirmConfig, showToast, resetLoading, startLoading])

  // 超时确认对话框 - 用户选择"重试"
  const handleTimeoutCancel = useCallback(() => {
    setShowTimeoutConfirm(false)
    setTimeoutFallbackAssignments(null)
    setTopicConfirmLoading(false)
    if (generateTimeoutRef.current) {
      clearTimeout(generateTimeoutRef.current)
      generateTimeoutRef.current = null
    }
  }, [])

  // 知识点确认取消回调
  const handleKpCancel = useCallback(() => {
    setShowKpConfirm(false)
    setKpConfirmList([])
    setKpConfirmConfig(null)
    // [fix-bg-progress] 取消 flow
    if (currentFlowId) {
      bgtCtx.cancelFlow(currentFlowId)
    }
  }, [currentFlowId, bgtCtx])

  // 知识点重新生成回调：用户点击"重新生成"按钮
  const handleKpRegenerate = useCallback(async () => {
    const config = kpConfirmConfig
    if (!config || !config.rawText) {
      showToast('无法重新生成：缺少原始输入文本', 'error')
      return
    }

    if (!window.confirm('重新生成将丢弃当前编辑的知识点，确定要重新生成吗？')) {
      return
    }

    setKpConfirmLoading(true)

    try {
      const { rawText, aiConfig } = config
      const unitNames = config.existingUnits?.map(u => u.name).filter(Boolean) || []

      const step1Result = await extractKnowledgePoints(rawText, unitNames, aiConfig, null, null)
      const kpExtracted = extractJsonFromAiResponse(step1Result.content, aiConfig.aiServiceMode)
      let knowledgePoints = []
      if (kpExtracted.json && Array.isArray(kpExtracted.json.knowledge_points)) {
        knowledgePoints = kpExtracted.json.knowledge_points
      } else if (kpExtracted.error) {
        const lines = step1Result.content.split(/\n/).filter(s => s.trim().length > 10)
        if (lines.length > 0) {
          knowledgePoints = lines
        } else {
          showToast('AI 返回格式异常，请重试', 'error')
          return
        }
      }
      if (knowledgePoints.length === 0) {
        showToast('未能提取到知识点，请重试', 'error')
        return
      }

      const filteredPoints = filterHeadingLikePoints(knowledgePoints)
      const removedCount = knowledgePoints.length - filteredPoints.length
      if (removedCount > 0 && filteredPoints.length > 0) {
        showToast('已自动过滤 ' + removedCount + ' 条章节标题类内容', 'info')
      }
      let finalPointsToShow = filteredPoints.length > 0 ? filteredPoints : knowledgePoints

      try {
        const existingKps = await getExistingKnowledgePointsByCategory(id)
        if (existingKps.length > 0) {
          const dedupPromise = deduplicateKnowledgePoints(finalPointsToShow, existingKps, aiConfig)
          const dedupTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('去重超时')), 30000))
          const dedupResult = await Promise.race([dedupPromise, dedupTimeout])
          if (dedupResult.stats.duplicatesFound > 0) {
            showToast(`已过滤 ${dedupResult.stats.duplicatesFound} 个重复知识点`, 'info')
          }
          finalPointsToShow = dedupResult.uniquePoints
        }
      } catch (e) {
        console.warn('[知识点重新生成] 预去重失败/超时，继续使用原始知识点:', e)
      }

      if (finalPointsToShow.length === 0) {
        showToast('本次无新的原始知识点（全部为重复内容）', 'error', null, { duration: 4000 })
        return
      }

      setKpConfirmList(finalPointsToShow)

      if (config.flowId) {
        bgtCtx.setFlowStep(
          config.flowId,
          '等待知识点确认',
          `已重新提取 ${finalPointsToShow.length} 个知识点，等待您确认`,
          {
            step: 'await_kp_confirm',
            kpConfirmList: finalPointsToShow,
            kpExistingUnits: config.existingUnits,
            aiConfig: aiConfig,
            text: rawText,
          }
        )
      }

      showToast(`已重新生成 ${finalPointsToShow.length} 个知识点`, 'success')

    } catch (e) {
      const errMsg = String(e?.message || e || '未知错误').slice(0, 80)
      if (errMsg.includes('timeout') || errMsg.includes('超时')) {
        showToast('AI 响应超时，请重试', 'error')
      } else if (errMsg.includes('network') || errMsg.includes('Failed to fetch')) {
        showToast('无法连接到服务器，请检查网络后重试', 'error')
      } else {
        showToast('重新生成失败（' + errMsg + '）', 'error')
      }
    } finally {
      setKpConfirmLoading(false)
    }
  }, [id, kpConfirmConfig, showToast, bgtCtx])

  // 处理带单元匹配的添加卡片（幂等：重试安全）
  const addUnitsWithMatching = useCallback(async (categoryId, unitDataList, existingUnits) => {
    // 按现有单元分组
    const newUnitsData = []
    const cardsToAdd = []

    // 章节名→chapterId 缓存，避免重复创建同名章节
    const chapterNameCache = new Map()
    // 收集需要创建章节的名称
    const chaptersToCreate = new Set()
    for (const unitData of unitDataList) {
      const chName = unitData.chapterName
      if (chName && !unitData.chapterId) {
        chaptersToCreate.add(chName)
      }
    }
    // 批量创建或查找章节
    if (chaptersToCreate.size > 0) {
      const existingChapters = await getChaptersByCategory(categoryId)
      for (const chName of chaptersToCreate) {
        const existing = existingChapters.find(c => c.name === chName)
        if (existing) {
          chapterNameCache.set(chName, existing.id)
        } else {
          const created = await addChapter(categoryId, chName)
          if (created?.id) {
            chapterNameCache.set(chName, created.id)
          }
        }
      }
    }

    for (const unitData of unitDataList) {
      // 解析章节ID：优先使用已有 chapterId，否则从缓存查找，再否则为 null
      const resolvedChapterId = unitData.chapterId
        || (unitData.chapterName ? chapterNameCache.get(unitData.chapterName) : null)
        || null

      if (unitData.matchedUnitId) {
        // 匹配到现有单元，直接添加卡片到该单元
        for (const card of unitData.cards) {
          cardsToAdd.push({
            unitId: unitData.matchedUnitId,
            front: card.front,
            back: card.back,
            knowledge_point: card.knowledge_point || null,
            chapterId: card.chapterId || resolvedChapterId || null,
            categoryId: categoryId,  // [fix-P0-4] 补全 categoryId，避免关联断裂导致计数异常
          })
        }
      } else {
        // 新单元
        newUnitsData.push({
          name: unitData.name,
          chapterId: resolvedChapterId,
          cards: unitData.cards,
        })
      }
    }

    // 添加新单元前检查同名单元是否已存在（重试安全，防止重复创建）
    // [fix-P2-10] 修复跨章节去重失效：原代码只看 u.name 不看 chapterId，
    // 导致不同章节下的同名单元被误判为"已存在"而跳过创建。
    // 改为按 chapterId + name 组合键去重。
    if (newUnitsData.length > 0) {
      const existingUnitKeys = new Set(
        (existingUnits || []).map(u => `${u.chapterId || 'null'}||${u.name}`)
      )
      const trulyNew = newUnitsData.filter(u => {
        const key = `${u.chapterId || 'null'}||${u.name}`
        return !existingUnitKeys.has(key)
      })
      if (trulyNew.length > 0) {
        await addUnits(categoryId, trulyNew)
      }
    }

    // 添加卡片到现有单元（先去重，防止重试时重复写入）
    if (cardsToAdd.length > 0) {
      const { generateId } = await import('../utils/helpers')
      const { dbInstance } = await import('../services/db')
      // 查询已有卡片，避免重试时重复写入相同内容
      const targetUnitIds = [...new Set(cardsToAdd.map(c => c.unitId))]
      const existingCardsInUnits = targetUnitIds.length > 0
        ? await dbInstance.cards.where('unitId').anyOf(targetUnitIds).toArray()
        : []
      const existingContentSet = new Set(
        existingCardsInUnits.map(c => `${String(c.front)}||${String(c.back)}||${c.unitId}`)
      )
      const uniqueCardsToAdd = cardsToAdd.filter(
        c => !existingContentSet.has(`${String(c.front)}||${String(c.back)}||${c.unitId}`)
      )

      if (uniqueCardsToAdd.length > 0) {
        // [P3-4] 修复 order 字段重复：使用递增序号而非固定 0，避免排序混乱
        const baseOrder = Date.now()
        const cardsWithId = uniqueCardsToAdd.map((c, idx) => ({
          id: generateId(),
          unitId: c.unitId,
          front: c.front,
          back: c.back,
          knowledge_point: c.knowledge_point || null,
          chapterId: c.chapterId || null,
          categoryId: c.categoryId || categoryId,  // [fix-P0-4] 补全 categoryId，确保卡片归属正确
          createdAt: Date.now(),
          order: baseOrder + idx,  // [P3-4] 递增 order，避免所有卡片 order 相同
        }))
        // [fix-P1-7] 包裹事务，确保 bulkAdd 原子性，避免中途失败产生半成品数据
        await dbInstance.transaction('rw', dbInstance.cards, async () => {
          await dbInstance.cards.bulkAdd(cardsWithId)
        })
      }
    }
  }, [])

  // 完成生成后的处理
  const finishGenerate = useCallback(async (unitDataList) => {
    const unitName = unitDataList[0]?.name || '新单元'
    const cardCount = unitDataList.reduce((sum, u) => sum + (u.cards?.length || 0), 0)
    showToast(`已生成「${unitName}」共 ${cardCount} 张卡片`)
    await loadUnits()
    setCardsRefreshKey(k => k + 1)
    await loadCategories()
    refreshBookmarks()
  }, [id, loadCategories, showToast])

  // NewCardPanel 调用的"确定"回调：根据用户调整后的 unitDataList 真正入库
  const commitPanelToDB = useCallback(async (unitDataList) => {
    try {
      const currentUnits = await getUnitsByCategory(id)
      let freshUnits = currentUnits
      const tryWrite = async () => {
        await addUnitsWithMatching(id, unitDataList, freshUnits)
      }
      try {
        await tryWrite()
      } catch (_) {
        await new Promise(r => setTimeout(r, 500))
        // 重试前重新获取单元列表（第一次可能已部分成功，避免重复创建单元）
        freshUnits = await getUnitsByCategory(id)
        await tryWrite()
        showToast('已重试成功', 'success')
      }
      await finishGenerate(unitDataList)
      setShowNewCardPanel(false)
      setPanelCards([])
    } catch (retryErr) {
      showToast('添加失败: ' + (retryErr.message || '未知错误'), 'error')
    }
  }, [id, addUnitsWithMatching, finishGenerate, showToast])

  // [P3-1] 已清理: handleDuplicateConfirm 函数（死代码，DuplicateCardConfirm 永远不显示）

  // 卡片生成步骤导航：返回上一步
  const handleStepBack = useCallback(() => {
    const currentStep = cardGenStep
    
    if (currentStep <= 1) return // 第1步不能后退
    
    // [fix-P2-3] 快照恢复：回退时从 cardGenStepSnapshots 恢复对应步骤的数据
    // 避免回退后数据丢失导致弹窗空白
    
    // Step 5 → Step 3（合并摘要弹窗）
    if (currentStep === 5) {
      setShowNewCardPreviewPanel(false)
      setShowMergeSummary(true)
      setCardGenStep(3)
      // [fix-P1-6] 从快照恢复合并摘要数据，避免回退后数据丢失导致弹窗空白
      const mergeSnapshot = cardGenStepSnapshots.mergeSummary
      if (mergeSnapshot) {
        setMergeSummaryData(mergeSnapshot)
      } else {
        console.warn('[handleStepBack] Step 5→3, mergeSummary 快照不存在，依赖现有 state')
      }
      return
    }
    
    // [P3-1] 已清理: Step 4 → Step 3 分支（死代码，Step 4 永远不会到达）

    // Step 3 → Step 2
    if (currentStep === 3) {
      setShowMergeSummary(false)
      setShowTopicConfirm(true)
      setCardGenStep(2)
      // [fix-P2-3] 恢复主题确认数据（topicConfirmConfig 应该还在 state 中）
      return
    }
    
    // Step 2 → Step 1
    if (currentStep === 2) {
      setShowTopicConfirm(false)
      setShowKpConfirm(true)
      setCardGenStep(1)
      // [fix-P2-3] 从快照恢复知识点确认数据，避免回退后知识点列表空白
      const kpSnapshot = cardGenStepSnapshots.kpConfirm
      if (kpSnapshot) {
        // 恢复 topicConfirmConfig 中的关键数据，确保再次前进时数据一致
        if (kpSnapshot.pointsToUse && kpSnapshot.aiConfig) {
          setTopicConfirmConfig(prev => ({
            ...prev,
            pointsToUse: kpSnapshot.pointsToUse.map(p => p.text || p),
            aiConfig: kpSnapshot.aiConfig,
            existingUnits: kpSnapshot.existingUnits || prev?.existingUnits,
            existingChapters: kpSnapshot.existingChapters || prev?.existingChapters,
          }))
        }
      } else {
        console.warn('[handleStepBack] Step 2→1, kpConfirm 快照不存在，数据可能丢失')
      }
      return
    }
  }, [cardGenStep, cardGenStepSnapshots, topicConfirmConfig])

  // [P3-1] 已清理: handleDuplicateCancel 函数（死代码）

  const handleImageOCR = useCallback(
    async (file) => {
      // 凭证检查（当 PC 引擎已配置时跳过手机端凭证检查，由降级逻辑处理）
      const { pcEngineServer: statePcEngine } = state
      const engineCfg = typeof getPcEngineConfig === 'function' ? getPcEngineConfig() : { host: '' }
      const hasPcEngine = !!(statePcEngine || engineCfg.host)

      if (!hasPcEngine) {
        const ocrEngine = state.ocrEngine || 'ai-model'
        const isSparkMode = state.aiServiceMode === 'iflytek-spark'
        const isVolcanoMode = state.aiServiceMode === 'volcano'
        const isDashscopeMode = state.aiServiceMode === 'dashscope'
        let hasCreds = false
        let tip = ''
        if (ocrEngine === 'paddleocr-local') {
          hasCreds = true
        } else if (ocrEngine === 'paddleocr-server') {
          hasCreds = !!state.paddleocrServerUrl
          if (!hasCreds) tip = '请先在「设置 → 图像识别」中配置 PaddleOCR 服务地址'
        } else if (ocrEngine === 'baidu-cloud') {
          hasCreds = !!(state.baiduOcrApiKey && state.baiduOcrSecretKey)
          if (!hasCreds) tip = '请先在「设置 → 图像识别」中配置百度智能云 OCR 的 API Key 和 Secret Key'
        } else {
          hasCreds = isSparkMode ? !!state.iflytekSparkApiKey
            : isVolcanoMode ? !!state.volcanoApiKey
            : isDashscopeMode ? !!state.dashscopeApiKey
            : !!state.apiKey
          if (!hasCreds) {
            tip = '请先在设置页配置 DeepSeek API Key'
            if (isSparkMode) tip = '请先在设置页配置讯飞星火 APIPassword'
            else if (isVolcanoMode) tip = '请先在设置页配置火山引擎 API Key'
            else if (isDashscopeMode) tip = '请先在设置页配置阿里云千问 API Key'
          }
        }
        if (!hasCreds) {
          showToast(tip, 'error')
          return
        }
      }

      // [FIX #310] 状态锁：防止重复点击
      if (generatingRef.current) return
      if (ocrLoadingRef.current) return
      if (requestLockRef.current) return

      ocrLoadingRef.current = true
      if (isMountedRef.current) {
        setOcrLoading(true)
      }

      try {
        // 检查 OCR 缓存
        const imageHash = await calculateImageHash(file)
        const cached = await getOcrCache(imageHash)
        let text
        if (cached) {
          text = cached.text
        } else {
          // 使用带 PC 引擎优先降级的 OCR
          text = await ocrWithFallback(file, state, showToast)
          await setOcrCache(imageHash, { text })
        }

        // OCR → 确认文字 → 生成卡片流程（使用 React 模态框替代 window.prompt）
        setOcrConfirmText(text || '')
        setOcrConfirmOpen(true)
      } catch (e) {
        const errMsg = String(e?.message || e || '未知错误').slice(0, 80)
        if (errMsg.includes('timeout') || errMsg.includes('超时') || errMsg.includes('TIMEOUT')) {
          showToast('图片识别超时，请重试', 'error')
        } else if (errMsg.includes('network') || errMsg.includes('Failed to fetch') || errMsg.includes('网络')) {
          showToast('无法连接到服务器，请检查网络后重试', 'error')
        } else {
          showToast('图片识别失败：' + errMsg, 'error')
        }
      } finally {
        ocrLoadingRef.current = false
        if (isMountedRef.current) {
          setOcrLoading(false)
        }
      }
    },
    [state.aiServiceMode, state.apiKey, state.iflytekSparkApiKey, state.iflytekSparkModel, state.volcanoApiKey, state.volcanoModel, state.dashscopeApiKey, state.dashscopeModel, state.model, state.ocrEngine, state.paddleocrServerUrl, state.paddleocrApiToken, state.paddleocrLanguage, state.baiduOcrApiKey, state.baiduOcrSecretKey, state.tesseractLanguage, showToast, handleGenerate]
  )

  const handleAudioRecord = useCallback(async (transcript) => {
    const isSparkMode = state.aiServiceMode === 'iflytek-spark'
    const isVolcanoMode = state.aiServiceMode === 'volcano'
    const isDashscopeMode = state.aiServiceMode === 'dashscope'
    const hasSparkCreds = !!state.iflytekSparkApiKey
    const hasVolcanoCreds = !!state.volcanoApiKey
    const hasDashscopeCreds = !!state.dashscopeApiKey
    const hasDeepSeek = !!state.apiKey
    const hasCreds = isSparkMode
      ? hasSparkCreds
      : isVolcanoMode
        ? hasVolcanoCreds
        : isDashscopeMode
          ? hasDashscopeCreds
          : hasDeepSeek
    if (!hasCreds) {
      let tip = '请先在设置页配置 DeepSeek API Key'
      if (isSparkMode) tip = '请先在设置页配置讯飞星火 APIPassword'
      else if (isVolcanoMode) tip = '请先在设置页配置火山引擎 API Key'
      else if (isDashscopeMode) tip = '请先在设置页配置阿里云千问 API Key'
      showToast(tip, 'error')
      return
    }
    const text = transcript
    if (!text.trim()) {
      showToast('未识别到语音内容，请重试', 'error')
      return
    }
    // [fix-P2-12] 统一语音入口流程：语音输入也走新的 5 步流程（知识点确认 → 主题确认 → 合并摘要 → 预览）
    // 原代码直接调用 generateCards 生成卡片并入库，绕过了质量保障步骤
    setInputValue('')
    // 复用 handleGenerate 入口，将语音文本作为输入
    await handleGenerate(text)
  }, [id, state.apiKey, state.iflytekSparkApiKey, state.iflytekSparkApiSecret, state.iflytekSparkModel, state.volcanoApiKey, state.volcanoModel, state.dashscopeApiKey, state.dashscopeModel, state.aiServiceMode, state.model, summaryLevel, showToast, loadCategories, resetLoading, startLoading, handleGenerate])

  const handleDeleteCard = useCallback((card, catId) => {
    const cardId = typeof card === 'object' ? card.id : card
    setCardToDelete({ id: cardId })
    setDeleteCategoryId(catId || id)
    setShowDeleteConfirm(true)
  }, [id])

  const handleConfirmDelete = async () => {
    if (!cardToDelete) {
      setShowDeleteConfirm(false)
      return
    }
    try {
      const snapshot = await createDataSnapshot()
      await deleteCard(cardToDelete.id, deleteCategoryId || id)
      loadUnits()
      setCardsRefreshKey(k => k + 1)
      if (loadCategories) loadCategories()
      refreshBookmarks()
      await syncAndOfferUndo({
        snapshot,
        message: '已删除卡片',
        refresh: async () => {
          requestLockRef.current = false
          await loadUnits()
          setCardsRefreshKey(k => k + 1)
          await refreshBookmarks()
        },
      })
    } catch (e) {
      showToast('删除失败：' + (e.message || '未知错误'), 'error')
    } finally {
      setShowDeleteConfirm(false)
      setCardToDelete(null)
      setDeleteCategoryId(null)
    }
  }

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false)
    setCardToDelete(null)
    setDeleteCategoryId(null)
  }

  const handleBookmarkCard = useCallback(async (cardId, newVal) => {
    if (newVal) {
      showToast('已收藏')
    } else {
      showToast('已取消收藏')
    }
    // 乐观更新：先在本地bookmarks对象上更新对应卡片的状态
    setBookmarks(prev => ({ ...prev, [cardId]: newVal }))
    // 异步从数据库获取最新的书签状态以保持一致性
    try {
      const allCardIds = []
      for (const unit of units) {
        const cards = await getCardsByUnit(unit.id)
        allCardIds.push(...cards.map((c) => c.id))
      }
      const bm = await getBookmarkStatuses(allCardIds)
      setBookmarks(bm)
    } catch (err) {
      console.error('更新书签状态失败:', err)
    }
  }, [showToast, units])

  const handleMoveCard = useCallback((card) => {
    setCardToMove(card)
    setCardsToMove([])
    setBatchMoveMode(false)
    setTargetCategoryId(null)
    setTargetUnitId(null)
    setTargetUnits([])
    setShowMoveModal(true)
  }, [])

  const handleSelectTargetCategory = async (catId) => {
    setTargetCategoryId(catId)
    setTargetUnitId(null)
    if (catId) {
      let units = await getUnitsByCategory(catId)
      if (units.length === 0) {
        const created = await addUnits(catId, [{ name: '默认', cards: [] }])
        units = created
      }
      setTargetUnits(units)
      if (units.length > 0) {
        setTargetUnitId(units[0].id)
      }
    } else {
      setTargetUnits([])
    }
  }

  const handleCancelMove = () => {
    setShowMoveModal(false)
    setCardToMove(null)
    setCardsToMove([])
    setBatchMoveMode(false)
    setTargetCategoryId(null)
    setTargetUnitId(null)
    setTargetUnits([])
  }

  const handleConfirmMove = async () => {
    if (!targetCategoryId || !targetUnitId) {
      showToast('请选择分类和单元', 'error')
      return
    }
    try {
      const snapshot = await createDataSnapshot()
      if (batchMoveMode && cardsToMove.length > 0) {
        for (const card of cardsToMove) {
          await moveCardToCategory(card.id, targetCategoryId, targetUnitId)
        }
      } else if (cardToMove) {
        await moveCardToCategory(cardToMove.id, targetCategoryId, targetUnitId)
      }
      loadUnits()
      setCardsRefreshKey(k => k + 1)
      if (loadCategories) loadCategories()
      refreshBookmarks()
      await syncAndOfferUndo({
        snapshot,
        message: batchMoveMode && cardsToMove.length > 0 ? `已移动 ${cardsToMove.length} 张卡片` : '已移动卡片',
        refresh: async () => {
          requestLockRef.current = false
          await loadUnits()
          setCardsRefreshKey(k => k + 1)
          await refreshBookmarks()
        },
      })
    } catch (e) {
      showToast('移动失败：' + (e.message || '未知错误'), 'error')
    } finally {
      handleCancelMove()
    }
  }

  const handleToggleAllCollapsed = () => {
    // 切换章节展开/收起（不控制单元内部展开）
    if (collapsedChapters.size > 0) {
      // 有折叠的章节 → 全部展开
      setCollapsedChapters(new Set())
    } else {
      // 全部已展开 → 折叠所有章节
      const allChapterIds = new Set(chapters.map(ch => ch.id))
      allChapterIds.add('__uncategorized__')
      setCollapsedChapters(allChapterIds)
    }
  }

  const handleOpenCardSelection = async (feature) => {
    // 仅 Spark Lite 不支持 AI 全权归类（cross-category-auto），其他 Spark 模型可用
    const isWeakSparkLite = state.aiServiceMode === 'iflytek-spark' && (!state.iflytekSparkModel || state.iflytekSparkModel === 'lite')
    if (feature === 'cross-category-auto' && isWeakSparkLite) {
      showToast('AI 全权归类需较强语义理解能力，Spark Lite 暂不支持，请切换至 DeepSeek/Qwen/Spark Pro 等更强模型后再试。', 'warn')
      setUnitOverviewMenuOpen(false)
      setOverviewOpen(false)
      return
    }
    // 弱模型（Spark Lite）不支持智能单元整理（unit-organize）
    const isWeakSparkModel = state.aiServiceMode === 'iflytek-spark' && (!state.iflytekSparkModel || state.iflytekSparkModel === 'lite')
    if (feature === 'unit-organize' && isWeakSparkModel) {
      showToast('智能单元整理仅支持强模型（DeepSeek/Qwen/Spark Pro 等），当前为弱模型（Spark Lite），请在设置中切换 AI 服务后再试。', 'warn')
      setUnitOverviewMenuOpen(false)
      setOverviewOpen(false)
      return
    }
    // 对于跨分类 AI 全权归类，需要检查所有分类是否有卡片
    if (feature === 'cross-category-auto') {
      const allCategories = state.categories || []
      let hasAnyCards = false
      for (const cat of allCategories) {
        const count = await getCardCountByCategory(cat.id)
        if (count > 0) {
          hasAnyCards = true
          break
        }
      }
      if (!hasAnyCards) {
        showToast('目前没有任何卡片可整理，请先添加卡片后再试。', 'info')
        return
      }
      
      // 加载所有分类的单元和章节
      setCrossCategoryDataLoading(true)
      setCardSelectionFeature(feature)
      setCardSelectionModalOpen(true)
      setUnitOverviewMenuOpen(false)
      setOverviewOpen(false)
      
      try {
        const [allUnits, allChapters] = await Promise.all([
          Promise.all(allCategories.map(async (cat) => {
            const catUnits = await getUnitsByCategory(cat.id)
            return catUnits.map(u => ({ ...u, categoryName: cat.name }))
          })),
          Promise.all(allCategories.map(async (cat) => {
            const catChapters = await getChaptersByCategory(cat.id)
            return catChapters.map(ch => ({ ...ch, categoryName: cat.name }))
          })),
        ])
        setCrossCategoryUnits(allUnits.flat())
        setCrossCategoryChapters(allChapters.flat())
      } catch (e) {
        showToast('加载卡片数据失败：' + (e.message || '未知错误'), 'error')
      } finally {
        setCrossCategoryDataLoading(false)
      }
    } else {
      // 原有逻辑：只检查当前分类的卡片
      if (totalCards === 0) {
        showToast('该分类下没有卡片可整理，请先添加卡片后再试。', 'info')
        return
      }
      setCardSelectionFeature(feature)
      setCardSelectionModalOpen(true)
      setUnitOverviewMenuOpen(false)
      setOverviewOpen(false)
    }
  }

  const loadTargetCategoryOptions = useCallback(async () => {
    const options = await Promise.all(
      (state.categories || []).map(async (cat) => ({
        ...cat,
        cardCount: await getCardCountByCategory(cat.id),
      })),
    )
    setTargetCategoryOptions(options)
  }, [state.categories])

  const handleCardSelectionNext = async (selectedCards) => {
    const dedupeResult = dedupeCardsByKnowledgePoint(selectedCards || [])
    const cardsForAi = dedupeResult.uniqueCards
    if (dedupeResult.duplicateCount > 0) {
      showToast(`已自动跳过 ${dedupeResult.duplicateCount} 张 knowledge_point 重复的卡片`, 'warn')
    }

    if (cardSelectionFeature === 'cross-category-auto') {
      if (!cardsForAi || cardsForAi.length === 0) {
        showToast('请先选择卡片', 'error')
        return
      }

      setCardSelectionModalOpen(false)
      const flowId = bgtCtx.startFlow({
        type: 'card_classification',
        title: `跨分类全权归类（${cardsForAi.length} 张卡片）`,
        initialStep: 'loading_data',
        initialPayload: { categoryId: id, feature: 'cross-category-auto' },
      })
      setCurrentFlowId(flowId)  // [fix] 设置 currentFlowId，确保确认执行后能正确完成流程
      bgtCtx.setFlowStep(flowId, 'loading_data', '正在加载分类数据...', { cardsForAi })
      setCrossCategoryLoading(true)
      setUnitReorganizeLoading(true)

      ;(async () => {
        try {
          const allCategoryUnits = []
          const allCategoryCards = []
          for (const cat of state.categories || []) {
            const [catUnits, catCards] = await Promise.all([
              getUnitsByCategory(cat.id),
              getAllCardsByCategory(cat.id),
            ])
            allCategoryUnits.push(...catUnits.map(unit => ({
              id: unit.id,
              name: unit.name,
              categoryId: cat.id,
              categoryName: cat.name,
              description: unit.description || '',
              chapterId: unit.chapterId || null,
            })))
            allCategoryCards.push(...catCards.map(card => ({
              id: card.id,
              unitId: card.unitId,
              categoryId: card.categoryId || cat.id,
              front: card.front,
              back: card.back,
              knowledge_point: card.knowledge_point || null,
              chapterId: card.chapterId || null,
            })))
          }

          bgtCtx.setFlowStep(flowId, 'loading_data', '正在加载章节数据...')
          const allCategoryChapters = []
          for (const cat of state.categories || []) {
            const catChapters = await getChaptersByCategory(cat.id)
            allCategoryChapters.push(...catChapters.map(ch => ({
              id: ch.id,
              name: ch.name,
              categoryId: cat.id,
              categoryName: cat.name,
            })))
          }

          bgtCtx.setFlowStep(flowId, 'ai_analyzing', 'AI 正在分析知识点，请耐心等待...')
          const currentCategoryPurpose = await getCategoryPurpose(id)

          const selectedIdSet = new Set(cardsForAi.map(card => card.id))
          const latestSelectedCards = allCategoryCards.filter(card => selectedIdSet.has(card.id))
          const cardsForPlan = latestSelectedCards.length > 0 ? latestSelectedCards : cardsForAi

          const result = await classifyCardsByCategoryContent(
            allCategoryUnits,
            allCategoryCards,
            cardsForPlan.map(card => ({
              ...card,
              knowledge_point: card.knowledge_point || card.knowledgePoint || null,
            })),
            {
              mode: 'cross-category-auto',
              classificationDepth: classificationDepth,
              existingChapters: allCategoryChapters,
              // [fix-空分类不可见] 传递所有分类列表（包括空分类），让 AI 能看到用户新建的空分类
              allCategories: (state.categories || []).map(cat => ({ id: cat.id, name: cat.name })),
              aiServiceMode: state.aiServiceMode,
              apiKey: state.apiKey,
              model: state.aiServiceMode === 'iflytek-spark' ? state.iflytekSparkModel : state.model,
              sparkApiKey: state.iflytekSparkApiKey,
              sparkApiSecret: state.iflytekSparkApiSecret,
              volcanoApiKey: state.volcanoApiKey,
              dashscopeApiKey: state.dashscopeApiKey,
              categoryPurpose: currentCategoryPurpose,
              onProgress: (p) => {
                bgtCtx.setFlowStep(flowId, 'ai_analyzing', p.message)
              },
            },
          )

          if (!result?.categories || result.categories.length === 0) {
            bgtCtx.setFlowStep(flowId, 'error', '生成跨分类全权归类方案失败')
            showToast(buildOperationErrorMessage('empty result', '生成跨分类全权归类方案失败'), 'error')
            return
          }

          setCrossCategoryCards(cardsForPlan)
          setCrossCategoryPlan(result)

          bgtCtx.awaitUserAction(flowId, {
            title: '等待确认：跨分类全权归类',
            message: `已为 ${cardsForPlan.length} 张卡片生成整理方案，请确认后执行`,
            confirmLabel: '查看并确认',
            actionKey: 'confirm_cross_category',
          }, {
            feature: 'cross-category-auto',
            plan: result,
            cards: cardsForPlan,
          })

          setCrossCategoryConfirmOpen(true)
          if (result.usedFallback) {
            showToast('AI 调用失败，已用本地规则生成全权归类方案，请确认', 'warning')
          } else {
            showToast('跨分类全权归类方案已生成，请确认后执行', 'success')
          }
        } catch (e) {
          bgtCtx.setFlowStep(flowId, 'error', '生成跨分类全权归类方案失败：' + (e.message || '未知错误'))
          showToast(buildOperationErrorMessage(e, '生成跨分类全权归类方案失败'), 'error')
        } finally {
          setCrossCategoryLoading(false)
          setUnitReorganizeLoading(false)
        }
      })()
      return
    }

    if (cardSelectionFeature === 'cross-category') {
      if (!cardsForAi || cardsForAi.length === 0) {
        showToast('请先选择卡片', 'error')
        return
      }
      setCrossCategoryCards(cardsForAi)
      setSelectedTargetCategoryId('')
      setTargetCategorySelectLoading(true)
      try {
        await loadTargetCategoryOptions()
        setCardSelectionModalOpen(false)
        setTargetCategorySelectOpen(true)
        showToast('请选择“指定分类归类”的目标分类', 'info')
      } catch (e) {
        showToast('加载目标分类失败：' + (e.message || '未知错误'), 'error')
      } finally {
        setTargetCategorySelectLoading(false)
      }
      return
    }

    if (cardSelectionFeature === 'cross-category-specified') {
      setCardSelectionModalOpen(false)
      return
    }

    if (!selectedCards || selectedCards.length === 0) {
      showToast('请先选择卡片', 'error')
      return
    }

    setCardSelectionModalOpen(false)
    const flowId = bgtCtx.startFlow({
      type: 'card_classification',
      title: `同分类整理（${cardsForAi.length} 张卡片）`,
      initialStep: 'ai_analyzing',
      initialPayload: { categoryId: id, feature: 'same-category-reorganize' },
    })
    bgtCtx.setFlowStep(flowId, 'ai_analyzing', 'AI 正在分析知识点，请耐心等待...', { cardsForAi })
    setUnitReorganizeLoading(true)

    ;(async () => {
      try {
        const [latestUnits, allCards, latestChapters, categoryPurpose] = await Promise.all([
          getUnitsByCategory(id),
          getAllCardsByCategory(id),
          getChaptersByCategory(id),
          getCategoryPurpose(id),
        ])
        const selectedIdSet = new Set(cardsForAi.map(card => card.id))
        const selectedLatestCards = allCards.filter(card => selectedIdSet.has(card.id))
        const sourceCards = selectedLatestCards.length > 0 ? selectedLatestCards : cardsForAi

        const result = await classifyCardsByCategoryContent(
          latestUnits.map(unit => ({ id: unit.id, name: unit.name, description: unit.description || '', chapterId: unit.chapterId || null, categoryId: unit.categoryId || null })),
          allCards.map(card => ({
            id: card.id,
            unitId: card.unitId,
            front: card.front,
            back: card.back,
            knowledge_point: card.knowledge_point || null,
            chapterId: card.chapterId || null,
            categoryId: card.categoryId || null,
          })),
          sourceCards.map(card => ({
            ...card,
            knowledge_point: card.knowledge_point || card.knowledgePoint || null,
          })),
          {
            mode: 'same-category-reorganize',
            classificationDepth: classificationDepth,
            existingChapters: latestChapters.map(ch => ({ id: ch.id, name: ch.name })),
            aiServiceMode: state.aiServiceMode,
            apiKey: state.apiKey,
            model: state.aiServiceMode === 'iflytek-spark' ? state.iflytekSparkModel : state.model,
            sparkApiKey: state.iflytekSparkApiKey,
            sparkApiSecret: state.iflytekSparkApiSecret,
            volcanoApiKey: state.volcanoApiKey,
            dashscopeApiKey: state.dashscopeApiKey,
            categoryPurpose: categoryPurpose,
            onProgress: (percent, detail) => {
              if (flowId) {
                bgtCtx.setFlowProgress(flowId, percent, detail)
                bgtCtx.setFlowStep(flowId, 'ai_analyzing', detail)
              }
            },
          },
        )

        const planChapters = Array.isArray(result?.chapters) ? result.chapters : []
        const planUnits = Array.isArray(result?.units) ? result.units : []
        if (planChapters.length === 0 && planUnits.length === 0) {
          bgtCtx.setFlowStep(flowId, 'error', '生成整理方案失败：返回结果为空')
          showToast(buildOperationErrorMessage('empty result', '生成整理方案失败'), 'error')
          return
        }

        let planMode = 'same-category-reorganize'
        if (classificationDepth === 'unit-only') {
          planMode = 'unit-only'
        } else if (planChapters.length > 0) {
          if (classificationDepth === 'chapter-only') {
            planMode = 'chapter-only'
          } else if (classificationDepth === 'chapter-and-unit') {
            planMode = 'chapter-and-unit'
          } else {
            planMode = 'chapter-and-unit'
          }
        }

        const reorganizePlan = {
          mode: planMode,
          usedFallback: !!result?.usedFallback,
          units: planUnits,
          chapters: planChapters,
        }

        setUnitReorganizePlan(reorganizePlan)

        bgtCtx.awaitUserAction(flowId, {
          title: '等待确认：同分类整理',
          message: `已为 ${cardsForAi.length} 张卡片生成整理方案，请确认后执行`,
          confirmLabel: '查看并确认',
          actionKey: 'confirm_reorganize',
        }, {
          feature: 'same-category-reorganize',
          plan: reorganizePlan,
          cards: cardsForAi,
        })

        // 不自动弹窗，用户通过浮动任务面板手动点"查看并确认"打开
        if (result?.usedFallback) {
          showToast('AI 调用失败，已降级为本地关键词匹配，请点击浮动按钮查看', 'warning')
        } else {
          showToast('整理方案已生成，请点击浮动按钮查看并确认', 'success')
        }
      } catch (e) {
        bgtCtx.setFlowStep(flowId, 'error', '生成整理方案失败：' + (e.message || '未知错误'))
        showToast(buildOperationErrorMessage(e, '生成整理方案失败'), 'error')
      } finally {
        setUnitReorganizeLoading(false)
      }
    })()
  }

  const handleCreateTargetCategory = async (name) => {
    const created = await addCategory(name)
    if (loadCategories) await loadCategories()
    await loadTargetCategoryOptions()
    setTargetCategoryOptions((prev) => {
      if (prev.some(item => item.id === created.id)) return prev
      return [...prev, { ...created, cardCount: 0 }]
    })
    showToast('已新建目标分类', 'success')
    return { ...created, cardCount: 0 }
  }

  const handleMoveUnit = async (unitId) => {
    setMovingUnitId(unitId)
    setMoveTargetCategoryId('')
    setMoveTargetChapterId('')
    setMoveTargetUnitId('')
    setMoveTargetChapters([])
    setMoveTargetUnits([])
    // 加载目标分类列表，确保弹窗显示已有分类
    try {
      await loadTargetCategoryOptions()
    } catch (e) {
      console.warn('[handleMoveUnit] loadTargetCategoryOptions:', e)
    }
    setShowUnitMoveSelect(true)
  }

  const handleDeleteUnit = useCallback((unitId) => {
    const unit = units.find(u => u.id === unitId)
    if (unit) {
      setUnitToDelete(unit)
      setShowUnitDeleteConfirm(true)
    }
  }, [units])

  const handleConfirmDeleteUnit = useCallback(async () => {
    if (!unitToDelete) return
    try {
      const snapshot = await createDataSnapshot()
      await deleteUnit(unitToDelete.id)
      showToast('单元已删除', 'success')
      loadUnits()
      setCardsRefreshKey(k => k + 1)
      if (loadCategories) loadCategories()
      refreshBookmarks()
      await syncAndOfferUndo({
        snapshot,
        message: '单元已删除',
        refresh: async () => {
          await loadUnits()
          setCardsRefreshKey(k => k + 1)
          await refreshBookmarks()
        },
      })
    } catch (e) {
      showToast('删除失败：' + (e.message || '未知错误'), 'error')
    } finally {
      setShowUnitDeleteConfirm(false)
      setUnitToDelete(null)
    }
  }, [unitToDelete, showToast, loadCategories, loadUnits])

  const handleRenameUnit = async (unitId) => {
    try {
      const unit = await dbInstance.units.get(unitId)
      if (!unit) {
        showToast('单元不存在', 'error')
        return
      }
      const newName = prompt('请输入新的单元名称：', unit.name)
      if (newName === null) return
      const trimmedName = newName.trim()
      if (!trimmedName) {
        showToast('名称不能为空', 'error')
        return
      }
      const snapshot = await createDataSnapshot()
      await updateUnit(unitId, { name: trimmedName })
      showToast('单元名称已更新', 'success')
      loadUnits()
      setCardsRefreshKey(k => k + 1)
      await syncAndOfferUndo({
        snapshot,
        message: '单元名称已更新',
        refresh: async () => {
          await loadUnits()
          setCardsRefreshKey(k => k + 1)
        },
      })
    } catch (e) {
      showToast('重命名失败：' + (e.message || '未知错误'), 'error')
    }
  }

  const handleImportCards = async (unitId, cards) => {
    try {
      const snapshot = await createDataSnapshot()
      const cardData = cards.map(c => ({
        front: c.front || '',
        back: c.back || '',
        knowledge_point: c.knowledge_point || '',
      }))
      // 去重：检查目标单元是否已存在相同 front+back 的卡片
      const existingCards = await getCardsByUnit(unitId)
      const existingSet = new Set(existingCards.map(c => `${c.front}|${c.back}`))
      const newCardData = cardData.filter(c => !existingSet.has(`${c.front}|${c.back}`))
      const skippedCount = cardData.length - newCardData.length

      if (newCardData.length === 0) {
        showToast('所有卡片已存在，无需导入', 'info')
        return
      }

      await addCardsToUnit(unitId, id, newCardData)
      // 同步写入 knowledgeTree（如果启用）
      if (useKnowledgeTree) {
        for (const c of newCardData) {
          await addKnowledgeTreeNode({
            level: 'card',
            parentId: unitId,
            categoryId: id,
            unitId,
            content: c.front,
            front: c.front,
            back: c.back,
            status: 'active',
            source: 'manual',
          })
        }
      }
      const msg = `成功导入 ${newCardData.length} 张卡片` + (skippedCount > 0 ? `（${skippedCount} 张重复已跳过）` : '')
      showToast(msg, 'success')
      await loadUnits()
      setCardsRefreshKey(k => k + 1)
      await syncAndOfferUndo({
        snapshot,
        message: `已导入 ${newCardData.length} 张卡片` + (skippedCount > 0 ? `（${skippedCount} 张重复已跳过）` : ''),
        refresh: async () => {
          await loadUnits()
          setCardsRefreshKey(k => k + 1)
        },
      })
    } catch (e) {
      showToast('导入失败：' + (e.message || '未知错误'), 'error')
    }
  }

  const handleUnitMoveSelectCategory = async (categoryId) => {
    setMoveTargetCategoryId(categoryId)
    setMoveTargetChapterId('')
    setMoveTargetUnitId('')
    setMoveTargetUnits([])
    if (categoryId) {
      const chapters = await getChaptersByCategory(categoryId)
      setMoveTargetChapters(chapters)
    } else {
      setMoveTargetChapters([])
    }
  }

  const handleUnitMoveSelectChapter = async (chapterId) => {
    if (chapterId) {
      const units = await db.knowledgeTree.where('level').equals('unit').and(n => n.chapterId === chapterId).toArray()
      setMoveTargetChapterId(chapterId)
      setMoveTargetUnitId('')
      setMoveTargetUnits(units)
    } else {
      setMoveTargetChapterId('')
      setMoveTargetUnitId('')
      setMoveTargetUnits([])
    }
  }

  const handleCreateMoveTargetChapter = async (name) => {
    if (!moveTargetCategoryId) return null
    const created = await addChapter(moveTargetCategoryId, name)
    if (created?.id) {
      setMoveTargetChapters(prev => [...prev, created])
      setMoveTargetChapterId(created.id)
    }
    return created
  }

  const handleUnitMoveSelectUnit = async (unitId) => {
    setMoveTargetUnitId(unitId)
  }

  const handleUnitMoveConfirm = async () => {
    if (!movingUnitId || !moveTargetCategoryId) {
      showToast('请选择目标分类', 'error')
      return
    }

    setMoveUnitLoading(true)
    try {
      const result = await moveUnit(movingUnitId, {
        targetCategoryId: moveTargetCategoryId,
        targetChapterId: moveTargetChapterId || null,
        targetUnitId: moveTargetUnitId || null,
      })

      showToast(`已移动 ${result.movedCards} 张卡片到目标位置`, 'success')
      setShowUnitMoveSelect(false)
      setMovingUnitId(null)
      await loadUnits()
      // 移动后展开所有章节，让用户立即看到变化
      setCollapsedChapters(new Set())
      setCardsRefreshKey(k => k + 1)
      if (loadCategories) await loadCategories()
    } catch (e) {
      showToast('移动单元失败：' + (e.message || '未知错误'), 'error')
    } finally {
      setMoveUnitLoading(false)
    }
  }

  const handleUnitMoveCancel = () => {
    setShowUnitMoveSelect(false)
    setMovingUnitId(null)
    setMoveTargetCategoryId('')
    setMoveTargetChapterId('')
    setMoveTargetUnitId('')
  }

  const handleTargetCategoryBack = () => {
    if (unitReorganizeLoading || targetCategorySelectLoading) return
    setTargetCategorySelectOpen(false)
    setCardSelectionModalOpen(true)
  }

  const handleTargetCategoryNext = async () => {
    if (!selectedTargetCategoryId) {
      showToast('请选择目标分类', 'error')
      return
    }
    if (!crossCategoryCards || crossCategoryCards.length === 0) {
      showToast('请选择要移动的卡片', 'error')
      return
    }

    // 创建后台任务流程，支持用户切换页面后通过浮动面板恢复
    const flowId = bgtCtx.startFlow({
      type: 'card_classification',
      title: `指定分类归类（${crossCategoryCards.length} 张卡片 → 目标分类）`,
      initialStep: 'ai_analyzing',
      initialPayload: { categoryId: id, feature: 'cross-category-specified', targetCategoryId: selectedTargetCategoryId },
    })
    setCurrentFlowId(flowId)
    bgtCtx.setFlowStep(flowId, 'ai_analyzing', `AI 正在分析 ${crossCategoryCards.length} 张卡片，请耐心等待...`, { crossCategoryCards })

    setTargetCategorySelectLoading(true)
    setUnitReorganizeLoading(true)
    try {
      const [targetUnits, targetCards, targetChapters, targetCategoryPurpose] = await Promise.all([
        getUnitsByCategory(selectedTargetCategoryId),
        getAllCardsByCategory(selectedTargetCategoryId),
        getChaptersByCategory(selectedTargetCategoryId),
        getCategoryPurpose(selectedTargetCategoryId),  // 获取目标分类的目的
      ])
      const selectedIdSet = new Set(crossCategoryCards.map(card => card.id))
      const sourceCards = (await getAllCardsByCategory(id)).filter(card => selectedIdSet.has(card.id))
      const cardsForPlan = sourceCards.length > 0 ? sourceCards : crossCategoryCards

      bgtCtx.setFlowStep(flowId, 'ai_analyzing', 'AI 正在生成归类方案...')

      const result = await classifyCardsByCategoryContent(
        targetUnits.map(unit => ({ id: unit.id, name: unit.name, description: unit.description || '', chapterId: unit.chapterId || null, categoryId: unit.categoryId || null })),
        targetCards.map(card => ({
          id: card.id,
          unitId: card.unitId,
          front: card.front,
          back: card.back,
          knowledge_point: card.knowledge_point || null,
          chapterId: card.chapterId || null,
          categoryId: card.categoryId || null,
        })),
        cardsForPlan.map(card => ({
          ...card,
          knowledge_point: card.knowledge_point || card.knowledgePoint || null,
        })),
        {
          mode: 'same-category-reorganize',
          classificationDepth: classificationDepth,  // [fix-P2] 使用用户选择的分类程度
          existingChapters: targetChapters.map(ch => ({ id: ch.id, name: ch.name })),
          aiServiceMode: state.aiServiceMode,
          apiKey: state.apiKey,
          model: state.aiServiceMode === 'iflytek-spark' ? state.iflytekSparkModel : state.model,
          sparkApiKey: state.iflytekSparkApiKey,
          sparkApiSecret: state.iflytekSparkApiSecret,
          volcanoApiKey: state.volcanoApiKey,
          dashscopeApiKey: state.dashscopeApiKey,
          categoryPurpose: targetCategoryPurpose,  // 传递目标分类目的
          onProgress: (p) => {
            bgtCtx.setFlowStep(flowId, 'ai_analyzing', p.message)
          },
        },
      )

      const planChapters = Array.isArray(result?.chapters) ? result.chapters : []
      const planUnits = Array.isArray(result?.units) ? result.units : []
      if (planChapters.length === 0 && planUnits.length === 0) {
        const errMsg = result?.usedFallback
          ? 'AI 调用失败，已用本地规则生成方案，但结果为空，请重试或检查网络'
          : '生成目标分类归类方案失败，请检查 AI 配置或网络后重试'
        bgtCtx.failFlow(flowId, errMsg)
        showToast(errMsg, 'error')
        return
      }

      // [fix-P2] 根据用户选择的分类程度设置正确的 mode
      let planMode = 'cross-category-specified'
      if (classificationDepth === 'unit-only') {
        planMode = 'unit-only'
      } else if (planChapters.length > 0) {
        if (classificationDepth === 'chapter-only') {
          planMode = 'chapter-only'
        } else if (classificationDepth === 'chapter-and-unit') {
          planMode = 'chapter-and-unit'
        } else {
          planMode = 'chapter-and-unit'  // 默认
        }
      }

      const plan = {
        mode: planMode,
        sourceCategoryId: id,
        targetCategoryId: selectedTargetCategoryId,
        usedFallback: !!result?.usedFallback,
        units: planUnits,
        chapters: planChapters,
      }
      setUnitReorganizePlan(plan)
      setTargetCategorySelectOpen(false)

      // 通过浮动任务面板提示用户手动操作
      bgtCtx.awaitUserAction(flowId, {
        title: '等待确认：指定分类归类',
        message: `已为 ${cardsForPlan.length} 张卡片生成归类方案（目标分类），请确认后执行`,
        confirmLabel: '查看并确认',
        actionKey: 'confirm_cross_category_specified',
      }, {
        feature: 'cross-category-specified',
        plan,
        cards: cardsForPlan,
        targetCategoryId: selectedTargetCategoryId,
      })

      // 不自动弹窗，用户通过浮动任务面板手动点"查看并确认"打开
      if (result?.usedFallback) {
        showToast('AI 调用失败，已用本地规则生成方案，请点击浮动按钮查看', 'warning')
      } else {
        showToast('目标分类归类方案已生成，请点击浮动按钮查看并确认', 'success')
      }
    } catch (e) {
      console.error('[handleTargetCategoryNext] AI 分类失败:', e)
      bgtCtx.failFlow(flowId, '生成目标分类归类方案失败：' + (e?.message || '未知错误'))
      // 根据错误类型给出更具体的提示
      let userMsg = '生成目标分类归类方案失败'
      const errStr = String(e?.message || e)
      if (errStr.includes('超时') || errStr.includes('TIMEOUT') || errStr.includes('timeout')) {
        userMsg = 'AI 响应超时，请检查网络连接或减少卡片数量后重试'
      } else if (errStr.includes('401') || errStr.includes('Unauthorized') || errStr.includes('API Key') || errStr.includes('apiKey')) {
        userMsg = 'AI 服务认证失败，请检查 API 密钥配置'
      } else if (errStr.includes('429') || errStr.includes('rate limit') || errStr.includes('Rate Limit')) {
        userMsg = 'AI 服务请求过于频繁，请稍后重试'
      } else if (errStr.includes('500') || errStr.includes('502') || errStr.includes('503')) {
        userMsg = 'AI 服务暂时不可用，请稍后重试'
      } else if (errStr.includes('Spark Lite')) {
        userMsg = errStr  // Spark Lite 不支持的提示直接显示
      }
      showToast(userMsg, 'error')
    } finally {
      setTargetCategorySelectLoading(false)
      setUnitReorganizeLoading(false)
    }
  }

  const handleCancelUnitReorganize = () => {
    if (unitReorganizeLoading) return
    setShowUnitReorganizeConfirm(false)
    setUnitReorganizePlan(null)
    if (currentFlowId) bgtCtx.cancelFlow(currentFlowId)
  }

  // 最小化：仅隐藏弹窗，不取消流程，用户可通过任务浮窗重新打开
  const handleMinimizeUnitReorganize = () => {
    setShowUnitReorganizeConfirm(false)
  }

  const handleConfirmUnitReorganize = async (confirmedPlan) => {
    const planChapters = Array.isArray(confirmedPlan?.chapters) ? confirmedPlan.chapters : []
    const planUnits = Array.isArray(confirmedPlan?.units) ? confirmedPlan.units : []
    const isChapterMode = planChapters.length > 0

    if (isChapterMode) {
      planChapters.forEach((ch, ci) => {
        ch.units?.forEach((u, ui) => {
        })
      })
    } else {
      planUnits.forEach((u, ui) => {
      })
    }

    if (!isChapterMode && planUnits.length === 0) {
      showToast('整理方案为空', 'error')
      return
    }

    setUnitReorganizeLoading(true)
    // [fix] 点击确认后自动收入任务浮窗，用户可通过浮窗查看进度
    setShowUnitReorganizeConfirm(false)
    if (currentFlowId) {
      bgtCtx.setFlowStep(currentFlowId, 'executing', '正在执行整理方案...', { plan: confirmedPlan })
    }
    try {
      showToast('正在整理卡片...', 'info')
      showToast('正在同步数据到云端...', 'info')
      const snapshot = await createDataSnapshot()
      if (confirmedPlan?.mode === 'cross-category-specified') {
        const targetCategoryId = confirmedPlan.targetCategoryId
        const latestTargetUnits = await getUnitsByCategory(targetCategoryId)
        const existingById = new Map(latestTargetUnits.map(unit => [unit.id, unit]))
        const cardUpdates = []
        let renamedUnits = 0
        let createdUnits = 0

        for (let i = 0; i < planUnits.length; i++) {
          const unitPlan = planUnits[i]
          const unitName = String(unitPlan.name || `目标单元${i + 1}`).trim() || `目标单元${i + 1}`
          let targetUnitId = unitPlan.unitId

          if (targetUnitId && existingById.has(targetUnitId)) {
            const existing = existingById.get(targetUnitId)
            if (unitName && unitName !== existing.name) {
              await updateUnit(targetUnitId, { name: unitName })
              renamedUnits += 1
            }
          } else {
            const created = await addUnits(targetCategoryId, [{ name: unitName, cards: [] }])
            targetUnitId = created?.[0]?.id
            createdUnits += targetUnitId ? 1 : 0
          }

          if (!targetUnitId) continue
          for (const card of unitPlan.cards || []) {
            if (card?.id) {
              cardUpdates.push({ cardId: card.id, categoryId: targetCategoryId, unitId: targetUnitId })
            }
          }
        }

        const updateResult = await batchUpdateCardsCategoryAndUnit(cardUpdates, { cleanupEmptySource: true })
        const sourceStillExists = await deleteEmptyCategory(confirmedPlan.sourceCategoryId || id)

        setShowUnitReorganizeConfirm(false)
        setUnitReorganizePlan(null)
        setCrossCategoryCards([])
        setSelectedTargetCategoryId('')
        setCardSelectionFeature(null)
        if (currentFlowId) bgtCtx.completeFlow(currentFlowId, '跨分类整理完成')
        if (loadCategories) await loadCategories()
        await syncAndOfferUndo({
          snapshot,
          message: buildSmartOrganizeSuccessMessage({
            movedCards: updateResult.updatedCards || 0,
            createdUnits,
            renamedUnits,
            deletedEmptyUnits: updateResult.deletedEmptyUnits || 0,
            deletedEmptyCategories: (updateResult.deletedEmptyCategories || 0) + (sourceStillExists ? 1 : 0),
          }),
          undoNavigateTo: `/category/${id}`,
        })
        navigate(`/category/${targetCategoryId}`)
        return
      }

      if (isChapterMode) {
        // 章节-单元 模式：按章节组织卡片
        // [fix] 跨分类场景：指定分类归类时，planMode 被设为 chapter-and-unit，
        // 但 targetCategoryId 仍保留在 plan 中，需据此判断是否跨分类
        const isCrossCategory = confirmedPlan.targetCategoryId && confirmedPlan.targetCategoryId !== id
        const effectiveCategoryId = isCrossCategory ? confirmedPlan.targetCategoryId : id
        const latestChapters = await getChaptersByCategory(effectiveCategoryId)
        const existingChapterByName = new Map(latestChapters.map(ch => [ch.name, ch]))
        const existingChapterById = new Map(latestChapters.map(ch => [ch.id, ch]))
        const latestUnits = await getUnitsByCategory(effectiveCategoryId)
        const existingUnitById = new Map(latestUnits.map(unit => [unit.id, unit]))
        const cardIdToChapterIdMap = {}
        const cardUpdates = []
        let createdChapters = 0
        let createdUnits = 0
        let renamedUnits = 0

        for (let ci = 0; ci < planChapters.length; ci++) {
          const chapterPlan = planChapters[ci]
          const chapterName = String(chapterPlan.name || `新章节${ci + 1}`).trim().slice(0, 20) || `新章节${ci + 1}`
          let targetChapterId = chapterPlan.chapterId

          // 创建或查找章节
          if (targetChapterId && existingChapterById.has(targetChapterId)) {
            const existing = existingChapterById.get(targetChapterId)
            if (chapterName !== existing.name) {
              await updateChapter(targetChapterId, { name: chapterName })
            }
          } else if (existingChapterByName.has(chapterName)) {
            targetChapterId = existingChapterByName.get(chapterName).id
          } else {
            const created = await addChapter(effectiveCategoryId, chapterName)
            targetChapterId = created?.id
            if (targetChapterId) {
              createdChapters += 1
              existingChapterById.set(targetChapterId, { id: targetChapterId, name: chapterName })
            }
          }

          if (!targetChapterId) {
            continue
          }

          // 处理章节下的单元
          const chapterUnits = Array.isArray(chapterPlan.units) ? chapterPlan.units : []
          for (let ui = 0; ui < chapterUnits.length; ui++) {
            const unitPlan = chapterUnits[ui]
            const unitName = String(unitPlan.name || `新单元${ui + 1}`).trim().slice(0, 16) || `新单元${ui + 1}`
            let targetUnitId = unitPlan.unitId

            if (targetUnitId && existingUnitById.has(targetUnitId)) {
              const existing = existingUnitById.get(targetUnitId)
              if (unitName !== existing.name) {
                await updateUnit(targetUnitId, { name: unitName })
                renamedUnits += 1
              }
            } else {
              const created = await addUnits(effectiveCategoryId, [{ name: unitName, chapterId: targetChapterId, cards: [] }])
              targetUnitId = created?.[0]?.id
              if (targetUnitId) {
                createdUnits += 1
                existingUnitById.set(targetUnitId, { id: targetUnitId, name: unitName, chapterId: targetChapterId })
              }
            }

            if (!targetUnitId) {
              continue
            }
            for (const card of unitPlan.cards || []) {
              if (card?.id) {
                cardUpdates.push({ cardId: card.id, categoryId: effectiveCategoryId, unitId: targetUnitId, chapterId: targetChapterId })
              }
            }
          }

          // 处理章节级卡片
          const chapterCards = Array.isArray(chapterPlan.cards) ? chapterPlan.cards : []
          for (const card of chapterCards) {
            if (card?.id) {
              if (isCrossCategory) {
                // [fix] 跨分类场景：章节级卡片也需更新 categoryId
                cardUpdates.push({ cardId: card.id, categoryId: effectiveCategoryId, unitId: null, chapterId: targetChapterId })
              } else {
                cardIdToChapterIdMap[card.id] = targetChapterId
              }
            }
          }
        }

        // 更新卡片
        if (cardUpdates.length > 0) {
          await batchUpdateCardsCategoryAndUnit(cardUpdates, { cleanupEmptySource: isCrossCategory })
        }
        // 更新章节级卡片
        if (Object.keys(cardIdToChapterIdMap).length > 0) {
          await batchUpdateCardsChapter(cardIdToChapterIdMap)
        }
        const cleanupResult = await deleteEmptyUnits(effectiveCategoryId)
        // [fix] 跨分类场景：同时清理源分类的空单元，并尝试删除空源分类
        let deletedEmptyCategories = 0
        if (isCrossCategory) {
          await deleteEmptyUnits(id)
          const sourceStillExists = await deleteEmptyCategory(confirmedPlan.sourceCategoryId || id)
          deletedEmptyCategories = sourceStillExists ? 0 : 1
        }

        setShowUnitReorganizeConfirm(false)
        setUnitReorganizePlan(null)
        if (isCrossCategory) {
          setCrossCategoryCards([])
          setSelectedTargetCategoryId('')
          setCardSelectionFeature(null)
        }
        if (currentFlowId) bgtCtx.completeFlow(currentFlowId, isCrossCategory ? '跨分类整理完成' : '章节整理完成')
        if (isCrossCategory) {
          if (loadCategories) await loadCategories()
          await syncAndOfferUndo({
            snapshot,
            message: buildSmartOrganizeSuccessMessage({
              movedCards: (cardUpdates.length + Object.keys(cardIdToChapterIdMap).length),
              createdChapters,
              createdUnits,
              renamedUnits,
              deletedEmptyUnits: cleanupResult.deletedUnits || 0,
              deletedEmptyCategories,
            }),
            undoNavigateTo: `/category/${id}`,
          })
          navigate(`/category/${effectiveCategoryId}`)
          return
        }
        await loadUnits()
        setCardsRefreshKey(k => k + 1)  // 修复：触发 UnitGroup 刷新卡片列表
        if (loadCategories) await loadCategories()
        refreshBookmarks()
        await syncAndOfferUndo({
          snapshot,
          message: buildSmartOrganizeSuccessMessage({
            movedCards: (cardUpdates.length + Object.keys(cardIdToChapterIdMap).length),
            createdChapters,
            createdUnits,
            renamedUnits,
            deletedEmptyUnits: cleanupResult.deletedUnits || 0,
          }),
          refresh: async () => {
            requestLockRef.current = false
            await loadUnits()
            await refreshBookmarks()
          },
        })
        return
      }

      // 纯单元模式
      const latestUnits = await getUnitsByCategory(id)
      const existingById = new Map(latestUnits.map(unit => [unit.id, unit]))
      const cardIdToUnitIdMap = {}
      let renamedUnits = 0
      let createdUnits = 0

      for (let i = 0; i < planUnits.length; i++) {
        const unitPlan = planUnits[i]
        const unitName = String(unitPlan.name || `整理单元${i + 1}`).trim() || `整理单元${i + 1}`
        let targetUnitId = unitPlan.unitId

        if (targetUnitId && existingById.has(targetUnitId)) {
          const existing = existingById.get(targetUnitId)
          if (unitName && unitName !== existing.name) {
            await updateUnit(targetUnitId, { name: unitName })
            renamedUnits += 1
          }
        } else {
          const created = await addUnits(id, [{ name: unitName, cards: [] }])
          targetUnitId = created?.[0]?.id
          createdUnits += targetUnitId ? 1 : 0
        }

        if (!targetUnitId) continue
        for (const card of unitPlan.cards || []) {
          if (card?.id) cardIdToUnitIdMap[card.id] = targetUnitId
        }
      }

      const updateResult = await batchUpdateCardsUnit(cardIdToUnitIdMap)
      const cleanupResult = await deleteEmptyUnits(id)

      setShowUnitReorganizeConfirm(false)
      setUnitReorganizePlan(null)
      if (currentFlowId) bgtCtx.completeFlow(currentFlowId, isChapterMode ? '章节整理完成' : '单元整理完成')
      await loadUnits()
      if (loadCategories) await loadCategories()
      refreshBookmarks()
      await syncAndOfferUndo({
        snapshot,
        message: buildSmartOrganizeSuccessMessage({
          movedCards: updateResult.updatedCards || 0,
          createdUnits,
          renamedUnits,
          deletedEmptyUnits: cleanupResult.deletedUnits || 0,
        }),
        refresh: async () => {
          requestLockRef.current = false
          await loadUnits()
          await refreshBookmarks()
        },
      })
    } catch (e) {
      console.error('[确认执行] ❌ 捕获异常:', e)
      console.error('[确认执行] ❌ 错误消息:', e?.message)
      console.error('[确认执行] ❌ 错误堆栈:', e?.stack)
      showToast(buildOperationErrorMessage(e, '执行整理失败'), 'error')
      if (currentFlowId) bgtCtx.failFlow(currentFlowId, '执行整理失败：' + (e?.message || '未知错误'))
    } finally {
      setUnitReorganizeLoading(false)
    }
  }

  const handleCancelCrossCategoryConfirm = () => {
    if (crossCategoryLoading) return
    setCrossCategoryConfirmOpen(false)
    setCrossCategoryPlan(null)
    if (currentFlowId) bgtCtx.cancelFlow(currentFlowId)
  }

  // [fix] 最小化：仅隐藏弹窗，不取消流程，用户可通过任务浮窗重新打开
  const handleMinimizeCrossCategoryConfirm = () => {
    setCrossCategoryConfirmOpen(false)
  }

  const handleConfirmCrossCategory = async (confirmedPlan) => {
    const categories = Array.isArray(confirmedPlan?.categories) ? confirmedPlan.categories : []
    if (categories.length === 0) {
      showToast('跨分类方案为空', 'error')
      return
    }

    setCrossCategoryLoading(true)
    // [fix] 点击确认后自动收入任务浮窗，用户可通过浮窗查看进度
    setCrossCategoryConfirmOpen(false)
    if (currentFlowId) {
      bgtCtx.setFlowStep(currentFlowId, 'executing', '正在执行跨分类全权归类...', { plan: confirmedPlan })
    }
    try {
      showToast('正在整理卡片...', 'info')
      const snapshot = await createDataSnapshot()

      // [fix-空分类复用] 构建已有分类名→categoryId 和 categoryId+chapterName→chapterId 的映射
      const existingCategoryMap = new Map()
      const existingChapterMap = new Map()
      for (const cat of state.categories || []) {
        if (cat.id != null && cat.name) {
          existingCategoryMap.set(cat.name, cat.id)
          // 异步获取该分类下的已有章节
          try {
            const catChapters = await getChaptersByCategory(cat.id)
            for (const ch of catChapters || []) {
              if (ch.id != null && ch.name) {
                existingChapterMap.set(`${cat.id}::${ch.name}`, ch.id)
              }
            }
          } catch (_) { /* 忽略单个分类章节获取失败 */ }
        }
      }

      const createResult = await batchCreateCategoriesAndUnits(
        categories.map(category => ({
          tempId: category.tempId,
          name: category.name,
          chapters: (category.chapters || []).map(chapter => ({
            tempId: chapter.tempId,
            name: chapter.name,
            units: (chapter.units || []).map(unit => ({
              tempId: unit.tempId,
              name: unit.name,
            })),
          })),
          units: (category.units || []).map(unit => ({
            tempId: unit.tempId,
            name: unit.name,
          })),
        })),
        { existingCategoryMap, existingChapterMap }
      )


      const cardUpdates = []
      for (const category of categories) {
        const categoryId = createResult.categoryIdMap[category.tempId]
        if (!categoryId) continue

        // 遍历 chapters.units（四层结构）
        for (const chapter of (category.chapters || [])) {
          const chapterId = createResult.chapterIdMap?.[chapter.tempId]
          for (const unit of (chapter.units || [])) {
            const unitId = createResult.unitIdMap[unit.tempId]
            if (!unitId) continue
            for (const card of (unit.cards || [])) {
              if (card?.id) cardUpdates.push({ cardId: card.id, categoryId, unitId, chapterId })
            }
          }
        }

        // 遍历 units（三层结构，兼容旧格式）
        for (const unit of (category.units || [])) {
          const unitId = createResult.unitIdMap[unit.tempId]
          if (!unitId) continue
          for (const card of (unit.cards || [])) {
            if (card?.id) cardUpdates.push({ cardId: card.id, categoryId, unitId })
          }
        }
      }

      // [fix-空分类被删除] 不自动删除空分类，避免删除用户主动创建的"计算机"等空分类
      // 原 cleanupEmptySource: true 会删除所有源空分类，导致用户创建的空分类消失
      const updateResult = await batchUpdateCardsCategoryAndUnit(cardUpdates, { cleanupEmptySource: false })

      // [fix-空单元清理] 清理所有涉及分类的空单元和空章节
      const allInvolvedCategoryIds = new Set()
      for (const card of cardUpdates) {
        // 从每张卡片获取源分类（通过 crossCategoryCards）
        const sourceCard = crossCategoryCards.find(c => c.id === card.cardId)
        if (sourceCard?.categoryId) allInvolvedCategoryIds.add(sourceCard.categoryId)
        // 目标分类
        if (card.categoryId) allInvolvedCategoryIds.add(card.categoryId)
      }
      let deletedEmptyUnits = 0
      let deletedEmptyChapters = 0
      for (const catId of allInvolvedCategoryIds) {
        deletedEmptyUnits += await deleteEmptyUnits(catId)
        deletedEmptyChapters += await deleteEmptyChapters(catId)
      }
      if (deletedEmptyUnits > 0 || deletedEmptyChapters > 0) {
      }

      setCrossCategoryConfirmOpen(false)
      setCrossCategoryPlan(null)
      setCrossCategoryCards([])
      setCardSelectionFeature(null)
      handleClearSelection()
      if (currentFlowId) bgtCtx.completeFlow(currentFlowId, '跨分类全权归类完成')
      if (loadCategories) await loadCategories()
      await syncAndOfferUndo({
        snapshot,
        message: `全权归类完成：创建 ${createResult.createdCategories.length} 个分类、${createResult.createdUnits.length} 个单元，移动 ${updateResult.updatedCards || 0} 张卡片`,
        undoNavigateTo: `/category/${id}`,
      })
      navigate('/')
    } catch (e) {
      showToast(buildOperationErrorMessage(e, '执行跨分类全权归类失败'), 'error')
      if (currentFlowId) bgtCtx.failFlow(currentFlowId, '执行跨分类全权归类失败：' + (e?.message || '未知错误'))
    } finally {
      setCrossCategoryLoading(false)
    }
  }

  const handleStartSelection = (cardId) => {
    setSelectionMode(true)
    const newSet = new Set()
    newSet.add(cardId)
    setSelectedCardIds(newSet)
  }

  const handleToggleSelect = (cardId) => {
    setSelectedCardIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) {
        newSet.delete(cardId)
      } else {
        newSet.add(cardId)
      }
      return newSet
    })
  }

  const handleClearSelection = () => {
    setSelectionMode(false)
    setSelectedCardIds(new Set())
  }

  // 多选模式下按系统返回键 → 取消选择，不跳转页面
  // 任何弹窗/对话框打开时按系统返回键 → 关闭弹窗，不跳转
  // 收集所有需要拦截返回键的 UI 状态
  const hasOpenModal = useMemo(() =>
    selectionMode ||
    showUnitMoveSelect ||
    cardSelectionModalOpen ||
    showUnitReorganizeConfirm ||
    crossCategoryConfirmOpen ||
    showNewCardPanel ||
    showNewCardPreviewPanel ||
    showKpConfirm ||
    showTopicConfirm ||
    ocrConfirmOpen ||
    showMergeSummary ||
    showBatchDeleteConfirm ||
    showDeleteConfirm ||
    showMoveModal ||
    showUnitDeleteConfirm ||
    showChapterDeleteConfirm,
    [selectionMode, showUnitMoveSelect, cardSelectionModalOpen, showUnitReorganizeConfirm,
     crossCategoryConfirmOpen, showNewCardPanel, showNewCardPreviewPanel, showKpConfirm,
     showTopicConfirm, ocrConfirmOpen, showMergeSummary, showBatchDeleteConfirm,
     showDeleteConfirm, showMoveModal, showUnitDeleteConfirm, showChapterDeleteConfirm]
  )

  useEffect(() => {
    if (!hasOpenModal) return
    const handlePopState = () => {
      // 优先关闭选择模式
      if (selectionMode) handleClearSelection()
      // 关闭弹窗
      else if (showUnitMoveSelect) handleUnitMoveCancel()
      else if (cardSelectionModalOpen) setCardSelectionModalOpen(false)
      else if (showNewCardPanel) setShowNewCardPanel(false)
      else if (showNewCardPreviewPanel) setShowNewCardPreviewPanel(false)
      else if (showKpConfirm) handleKpCancel()
      else if (showTopicConfirm) handleTopicCancel()
      else if (ocrConfirmOpen) setOcrConfirmOpen(false)
      else if (showMergeSummary) setShowMergeSummary(false)
      else if (showBatchDeleteConfirm) setShowBatchDeleteConfirm(false)
      else if (showDeleteConfirm) setShowDeleteConfirm(false)
      else if (showMoveModal) setShowMoveModal(false)
      else if (showUnitDeleteConfirm) setShowUnitDeleteConfirm(false)
      else if (showChapterDeleteConfirm) setShowChapterDeleteConfirm(false)
      else if (showUnitReorganizeConfirm) handleCancelUnitReorganize()
      else if (crossCategoryConfirmOpen) handleCancelCrossCategoryConfirm()

      // 回到之前的历史状态（抵消返回导航）
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [hasOpenModal])

  const onCardTouchStart = (cardId) => {
    if (selectionMode) return
    const timer = setTimeout(() => {
      handleStartSelection(cardId)
    }, 300)
    setLongPressTimer(timer)
  }

  const onCardTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  const onCardTouchMove = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  const onCardClick = (cardId) => {
    if (selectionMode) {
      handleToggleSelect(cardId)
    }
  }

  const handleBatchDeleteOpen = () => {
    if (selectedCardIds.size === 0) {
      showToast('请先选择卡片', 'error')
      return
    }
    setShowBatchDeleteConfirm(true)
  }

  const handleBatchDelete = async () => {
    try {
      const snapshot = await createDataSnapshot()
      const ids = Array.from(selectedCardIds)
      for (const cardId of ids) {
        await deleteCard(cardId, id)
      }
      setShowBatchDeleteConfirm(false)
      handleClearSelection()
      loadUnits()
      setCardsRefreshKey(k => k + 1)
      if (loadCategories) loadCategories()
      refreshBookmarks()
      await syncAndOfferUndo({
        snapshot,
        message: `已删除 ${ids.length} 张卡片`,
        refresh: async () => {
          requestLockRef.current = false
          await loadUnits()
          setCardsRefreshKey(k => k + 1)
          await refreshBookmarks()
        },
      })
    } catch (e) {
      showToast('批量删除失败：' + (e.message || '未知错误'), 'error')
    }
  }

  const handleBatchBookmark = async () => {
    if (selectedCardIds.size === 0) {
      showToast('请先选择卡片', 'error')
      return
    }
    try {
      const ids = Array.from(selectedCardIds)
      let bookmarkedCount = 0
      let unbookmarkedCount = 0
      for (const cardId of ids) {
        const bm = await isBookmarked(cardId)
        if (bm) {
          await removeBookmark(cardId)
          unbookmarkedCount++
        } else {
          await addBookmark(cardId)
          bookmarkedCount++
        }
      }
      if (bookmarkedCount > 0 && unbookmarkedCount === 0) {
        showToast(`已收藏 ${bookmarkedCount} 张卡片`)
      } else if (unbookmarkedCount > 0 && bookmarkedCount === 0) {
        showToast(`已取消收藏 ${unbookmarkedCount} 张卡片`)
      } else {
        showToast(`收藏 ${bookmarkedCount} 张，取消收藏 ${unbookmarkedCount} 张`)
      }
      handleClearSelection()
      refreshBookmarks()
      loadUnits()
      if (loadCategories) loadCategories()
    } catch (e) {
      showToast('批量收藏失败：' + (e.message || '未知错误'), 'error')
    }
  }

  const handleBatchMoveOpen = () => {
    if (selectedCardIds.size === 0) {
      showToast('请先选择卡片', 'error')
      return
    }
    const cardsList = []
    for (const cardId of selectedCardIds) {
      cardsList.push({ id: cardId })
    }
    setCardsToMove(cardsList)
    setBatchMoveMode(true)
    setCardToMove(null)
    // 多选移动默认目标 = 当前分类（在本分类内的单元间移动）
    setTargetCategoryId(id)
    setTargetUnitId(null)
    // 预先加载当前分类下的所有单元
    getUnitsByCategory(id).then((us) => {
      setTargetUnits(us)
    })
    setShowMoveModal(true)
  }

  // 在"批量移动"对话框内直接创建新单元
  const handleCreateUnitInMove = async () => {
    const name = newUnitName.trim()
    if (!name) {
      showToast('请输入单元名称', 'error')
      return
    }
    setCreatingUnitInMove(true)
    try {
      const catId = targetCategoryId || id
      const created = await addUnits(catId, [{ name, cards: [] }])
      if (created && created.length > 0) {
        const refreshed = await getUnitsByCategory(catId)
        setTargetUnits(refreshed)
        setTargetUnitId(created[0].id)
      }
      setNewUnitName('')
      showToast('已创建新单元')
      await loadUnits()
      if (loadCategories) loadCategories()
    } catch (e) {
      showToast('创建失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setCreatingUnitInMove(false)
    }
  }

  // AI 建议新单元名称：基于多选卡片的内容，取首张卡片的 front 前 12 个字符作为默认建议
  const suggestNewUnitNameForBatch = () => {
    if (cardsToMove.length === 0) return '新单元'
    return `新单元_${Date.now().toString().slice(-4)}`
  }

  const totalCards = units.reduce((sum, u) => {
    return sum + (u.card_count || 0)
  }, 0)

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <>
      <div
        className="animate-page-in"
        style={{
          position: 'relative',
          height: '100%',
          width: '100%',
          background: 'var(--color-bg)',
          display: 'flex',
          flexDirection: 'column',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        onContextMenu={preventTextMenu}
        
      >
        {/* ===== 顶部导航 Header ===== */}
      <header className="app-header">
        <div className="app-header-inner">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back()
              } else {
                navigate('/')
              }
            }}
            className="icon-btn"
            aria-label="返回"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div style={{flex: 1, minWidth: 0, paddingLeft: 8}}>
            {editingName ? (
              <input
                autoFocus
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={async () => {
                  const newName = editNameValue.trim()
                  if (newName && newName !== categoryName) {
                    setCategoryName(newName)
                    try {
                      await updateCategory(id, newName)
                      loadCategories()
                    } catch (err) {
                      console.error('[编辑名称] 保存失败:', err)
                    }
                  }
                  setEditingName(false)
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const newName = editNameValue.trim()
                    if (newName && newName !== categoryName) {
                      setCategoryName(newName)
                      try {
                        await updateCategory(id, newName)
                        loadCategories()
                      } catch (err) {
                        console.error('[编辑名称] 保存失败:', err)
                      }
                    }
                    setEditingName(false)
                  }
                }}
                className="input"
                style={{padding: '8px 12px', fontSize: 'var(--text-base)', fontWeight: 600}}
              />
            ) : (
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <h1 className="app-title" style={{flex: 1}}>{categoryName || '加载中...'}</h1>
                <button
                  onClick={() => {
                    setNewChapterName('')
                    setShowAddChapterModal(true)
                  }}
                  className="icon-btn"
                  aria-label="新建章节"
                  style={{width: 40, height: 40}}
                  title="新建章节"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button
                  onClick={handleToggleAllCollapsed}
                  className="icon-btn"
                  aria-label={collapsedChapters.size > 0 ? '展开全部章节' : '收起全部章节'}
                  style={{width: 40, height: 40}}
                  title={collapsedChapters.size > 0 ? '展开全部章节' : '收起全部章节'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {collapsedChapters.size > 0 ? (
                      <>
                        <path d="M7 14l5 5 5-5" />
                        <path d="M7 10l5-5 5 5" />
                      </>
                    ) : (
                      <>
                        <path d="M7 10l5-5 5 5" />
                        <path d="M7 14l5 5 5-5" />
                      </>
                    )}
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setEditNameValue(categoryName || '')
                    setEditingName(true)
                  }}
                  className="icon-btn"
                  aria-label="编辑名称"
                  style={{width: 40, height: 40}}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== 多选工具栏 ===== */}
      {selectionMode && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          margin: '12px 20px 0',
          padding: '12px 16px',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--color-primary)',
            flex: 1,
          }}>
            已选中 {selectedCardIds.size} 张
          </span>
          <button
            onClick={handleBatchBookmark}
            className="icon-btn"
            aria-label="批量收藏"
            style={{
              width: 36,
              height: 36,
              background: 'var(--color-bg)',
              color: 'var(--color-accent)',
            }}
            title="批量收藏/取消收藏"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
            </svg>
          </button>
          <button
            onClick={handleBatchMoveOpen}
            className="icon-btn"
            aria-label="批量移动"
            style={{
              width: 36,
              height: 36,
              background: 'var(--color-bg)',
              color: 'var(--color-success)',
            }}
            title="批量移动"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
          <button
            onClick={handleBatchDeleteOpen}
            className="icon-btn"
            aria-label="批量删除"
            style={{
              width: 36,
              height: 36,
              background: 'var(--color-bg)',
              color: 'var(--color-danger)',
            }}
            title="批量删除"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={handleClearSelection}
            className="icon-btn"
            aria-label="退出多选"
            style={{
              width: 36,
              height: 36,
              background: 'var(--color-bg)',
              color: 'var(--color-text-secondary)',
              marginLeft: 4,
            }}
            title="退出多选"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* ===== 草稿提醒条 ===== */}
      <FloatingDraftBanner
        categoryId={id}
        aiConfig={{
          apiKey: state.apiKey,
          model: state.model,
          aiServiceMode: state.aiServiceMode,
          sparkApiKey: state.iflytekSparkApiKey,
          sparkApiSecret: state.iflytekApiSecret,
          volcanoApiKey: state.volcanoApiKey,
          dashscopeApiKey: state.dashscopeApiKey,
          summaryLevel,
        }}
        onGenerated={loadCategories}
        onToast={showToast}
      />

      {/* ===== 主内容区 ===== */}
      <main style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: state.inputBarMode === 'floating' ? '16px 20px 24px 20px' : '16px 20px 110px 20px',
        width: '100%',
      }}>
        <ErrorBoundary>
        {/* 单元概览 — 下拉式导航 + 章节分组 + 一键收缩/展开 */}
        {!generating && (
          <div style={{ marginBottom: 16 }}>
            <div
              className="unit-overview-panel unit-overview-panel-open"
            >
              {/* 章节分组显示 */}
              {(() => {
                // 按 chapterId 分组
                const chapterUnitsMap = new Map()
                const uncategorizedUnits = []

                for (const unit of units) {
                  if (unit.chapterId) {
                    if (!chapterUnitsMap.has(unit.chapterId)) {
                      chapterUnitsMap.set(unit.chapterId, [])
                    }
                    chapterUnitsMap.get(unit.chapterId).push(unit)
                  } else {
                    uncategorizedUnits.push(unit)
                  }
                }

                const renderUnitItem = (unit) => {
                  const progress = unit.card_count > 0
                    ? Math.round(((unit.mastered_count || 0) / unit.card_count) * 100)
                    : 0
                  const isEditingThis = renamingUnitId === unit.id
                  return (
                    <div
                      key={unit.id}
                      className="unit-overview-item"
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '10px 14px',
                        paddingLeft: 28,
                      }}
                      onClick={() => {
                        if (isEditingThis) return
                        const el = document.querySelector(`[data-unit-id="${unit.id}"]`)
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                        setForceExpandUnitId(unit.id)
                        setTimeout(() => {
                          setForceExpandUnitId((cur) => (cur === unit.id ? null : cur))
                        }, 500)
                        setOverviewOpen(false)
                      }}
                    >
                      {isEditingThis ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <input
                            autoFocus
                            type="text"
                            value={editUnitNameValue}
                            onChange={(e) => setEditUnitNameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={async (e) => {
                              e.stopPropagation()
                              const newName = editUnitNameValue.trim()
                              if (newName && newName !== unit.name) {
                                await updateUnit(unit.id, { name: newName })
                                loadUnits()
                                if (loadCategories) loadCategories()
                                showToast('已更新单元名称')
                              }
                              setRenamingUnitId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation()
                                e.target.blur()
                              } else if (e.key === 'Escape') {
                                e.stopPropagation()
                                setRenamingUnitId(null)
                              }
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '6px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg)',
                              color: 'var(--color-text)',
                              fontSize: 14,
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          <span className="unit-overview-item-name" style={{ minWidth: 0, flex: 1 }}>
                            {unit.name}
                          </span>
                          <span className="unit-overview-item-progress-wrap" style={{ flexShrink: 0 }}>
                            <span
                              className="unit-overview-item-progress-bar"
                              style={{ width: progress + '%' }}
                            />
                          </span>
                          <span
                            className="unit-overview-item-progress-text"
                            style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}
                          >
                            {unit.card_count || 0} 张 · {progress}%
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setRenamingUnitId(unit.id)
                              setEditUnitNameValue(unit.name)
                            }}
                            className="icon-btn"
                            style={{
                              width: 28, height: 28, flexShrink: 0,
                              background: 'transparent',
                              color: 'var(--color-text-secondary)',
                            }}
                            aria-label="编辑单元名称"
                            title="编辑"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )
                }

                const renderedItems = []

                // 先渲染有章节的单元
                for (const chapter of chapters) {
                  const chapterUnits = chapterUnitsMap.get(chapter.id) || []
                  const isCollapsed = collapsedChapters.has(chapter.id)
                  const isEditingChapter = editingChapterId === chapter.id
                  const chapterTotalCards = chapterUnits.reduce((sum, u) => sum + (u.card_count || 0), 0)
                  const chapterMastered = chapterUnits.reduce((sum, u) => sum + (u.mastered_count || 0), 0)
                  const chapterProgress = chapterTotalCards > 0
                    ? Math.round((chapterMastered / chapterTotalCards) * 100)
                    : 0

                  renderedItems.push(
                    <div key={`chapter-${chapter.id}`} data-chapter-id={chapter.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      {/* 章节头部 */}
                      {isEditingChapter ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 14px',
                          background: 'var(--color-surface)',
                          minHeight: 44,
                        }}>
                          <input
                            autoFocus
                            type="text"
                            value={editChapterNameValue}
                            onChange={(e) => setEditChapterNameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => {
                              handleSaveChapterName(chapter.id, editChapterNameValue)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation()
                                handleSaveChapterName(chapter.id, editChapterNameValue)
                              } else if (e.key === 'Escape') {
                                e.stopPropagation()
                                setEditingChapterId(null)
                              }
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '6px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg)',
                              color: 'var(--color-text)',
                              fontSize: 14,
                              fontWeight: 600,
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => handleToggleChapterCollapse(chapter.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 14px',
                            minHeight: 44,
                            cursor: 'pointer',
                            background: 'var(--color-surface)',
                            touchAction: 'manipulation',
                          }}
                        >
                          <svg
                            width="16" height="16"
                            viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round"
                            style={{
                              transition: 'transform 0.3s ease',
                              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                              flexShrink: 0,
                              color: 'var(--color-primary)',
                            }}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                          <span style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--color-primary-dark)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {chapter.name}
                          </span>
                          <span style={{
                            fontSize: 12,
                            color: 'var(--color-text-secondary)',
                            flexShrink: 0,
                          }}>
                            {chapterUnits.length} 单元 · {chapterTotalCards} 张
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditChapterName(chapter.id, chapter.name)
                            }}
                            className="icon-btn"
                            style={{
                              width: 28, height: 28, flexShrink: 0,
                              background: 'transparent',
                              color: 'var(--color-text-secondary)',
                            }}
                            aria-label="编辑章节名称"
                            title="编辑"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        <div style={{ position: 'relative', zIndex: 10 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setChapterMenuChapterId(chapter.id)
                              setChapterMenuPosition(e.currentTarget.getBoundingClientRect())
                            }}
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setChapterMenuChapterId(chapter.id)
                              setChapterMenuPosition(e.currentTarget.getBoundingClientRect())
                            }}
                            style={{
                              width: 48, height: 48,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'transparent', border: 'none',
                              color: 'var(--color-text-secondary)',
                              cursor: 'pointer', flexShrink: 0,
                              padding: 8, borderRadius: 8,
                              touchAction: 'manipulation',
                              pointerEvents: 'auto',
                              minWidth: 44,
                              minHeight: 44,
                            }}
                            aria-label="章节菜单"
                            title="章节操作"
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                    {/* 章节下的单元列表 */}
                      <div
                        style={{
                          maxHeight: isCollapsed ? 0 : 'none',
                          overflow: isCollapsed ? 'hidden' : 'visible',
                          transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          WebkitLineClamp: isCollapsed ? 0 : 'unset',
                        }}
                      >
                        {chapterUnits.map(renderUnitItem)}
                      </div>
                    </div>
                  )
                }

                // 渲染未分类的单元
                if (uncategorizedUnits.length > 0) {
                  renderedItems.push(
                    <div key="chapter-uncategorized" style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <div
                        onClick={() => handleToggleChapterCollapse('__uncategorized__')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 14px',
                          minHeight: 44,
                          cursor: 'pointer',
                          background: 'var(--color-bg-offset)',
                          touchAction: 'manipulation',
                        }}
                      >
                        <svg
                          width="16" height="16"
                          viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{
                            transition: 'transform 0.3s ease',
                            transform: collapsedChapters.has('__uncategorized__') ? 'rotate(-90deg)' : 'rotate(0deg)',
                            flexShrink: 0,
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                        <span style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--color-text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          未分类
                        </span>
                        <span style={{
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                          flexShrink: 0,
                        }}>
                          {uncategorizedUnits.length} 单元 · {uncategorizedUnits.reduce((sum, u) => sum + (u.card_count || 0), 0)} 张
                        </span>
                      </div>
                      <div
                        style={{
                          maxHeight: collapsedChapters.has('__uncategorized__') ? 0 : 'none',
                          overflow: collapsedChapters.has('__uncategorized__') ? 'hidden' : 'visible',
                          transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        {uncategorizedUnits.map(renderUnitItem)}
                      </div>
                    </div>
                  )
                }

                return renderedItems
              })()}
            </div>

            {overviewOpen && (
              <div
                onClick={() => {
                  setOverviewOpen(false)
                  setUnitOverviewMenuOpen(false)
                }}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: '80px',
                  zIndex: 5,
                  cursor: 'default',
                }}
              />
            )}
          </div>
        )}

        {/* AI 生成中状态 */}
        {generating && (
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 16px', textAlign: 'center'}}>
            <div style={{width: 72, height: 72, borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20}}>
              <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" style={{color: 'var(--color-primary)'}}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p style={{fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', marginBottom: 6}}>AI 正在分析知识点...</p>
            <p style={{fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)'}}>正在生成或整理卡片，请稍候</p>
          </div>
        )}

        {/* 空状态 */}
        {!generating && units.length === 0 && (
          <div className="empty-state anim-slide-in-up">
            <div className="empty-state-icon anim-gentle-breathe">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="empty-state-title">暂无背诵卡片</p>
            <p className="empty-state-desc">输入学习内容，AI 将自动拆解为问题-答案形式的背诵卡片</p>
            <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8}}>
              <span className="badge badge-success">文本输入</span>
              <span className="badge badge-primary">图片识别</span>
              <span className="badge badge-new">语音录入</span>
            </div>
          </div>
        )}

        {/* 知识树完整层级展示（分类→主题→章节→单元→知识点→卡片） */}
        {!generating && useKnowledgeTree && knowledgeTreeTopics.length > 0 && (
          <ErrorBoundary>
            {(() => {
              const treeItems = []
              
              const renderKnowledgePoints = (kps) => {
                if (!kps || kps.length === 0) return null
                return kps.map((kp) => (
                  <div key={kp.id} style={{ paddingLeft: '32px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--color-bg-offset)', borderRadius: '6px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                      <span style={{ fontSize: '12px' }}>📌</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kp.name}</span>
                      <span className="badge badge-xs" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{(kp.children || []).filter(c => c.level === 'card').length}</span>
                    </div>
                    {(kp.children || []).filter(c => c.level === 'card').map((card) => (
                      <div key={card.id} style={{ paddingLeft: '16px', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--color-surface)', borderRadius: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', borderLeft: '3px solid var(--color-border)' }}>
                          <span>{card.front?.slice(0, 20)}...</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              }
              
              const renderUnits = (units) => {
                if (!units || units.length === 0) return null
                return units.map((unit) => {
                  const unitCards = (unit.children || []).filter(c => c.level === 'card')
                  const knowledgePoints = (unit.children || []).filter(c => c.level === 'knowledge_point')
                  return (
                    <div key={unit.id} style={{ paddingLeft: '16px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border-light)' }}>
                        <div onClick={() => { const el = document.querySelector(`[data-unit-id="${unit.id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setForceExpandUnitId(unit.id); setTimeout(() => setForceExpandUnitId((cur) => (cur === unit.id ? null : cur)), 500) }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unit.name}</span>
                          <span className="badge badge-sm" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{unitCards.length} 张</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteUnit(unit.id)
                          }}
                          style={{
                            width: 32, height: 32,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer', flexShrink: 0,
                            padding: 0, borderRadius: 6,
                            touchAction: 'manipulation',
                            pointerEvents: 'auto',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                      {renderKnowledgePoints(knowledgePoints)}
                      {unitCards.length > 0 && knowledgePoints.length === 0 && (
                        <div style={{ paddingLeft: '16px', marginTop: '4px' }}>
                          {unitCards.slice(0, 3).map((card) => (
                            <div key={card.id} style={{ padding: '4px 10px', background: 'var(--color-bg-offset)', borderRadius: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '2px', borderLeft: '2px solid var(--color-border)' }}>
                              {card.front?.slice(0, 25)}...
                            </div>
                          ))}
                          {unitCards.length > 3 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', padding: '4px 0' }}>...还有 {unitCards.length - 3} 张卡片</div>}
                        </div>
                      )}
                    </div>
                  )
                })
              }
              
              const renderChapters = (chapters) => {
                if (!chapters || chapters.length === 0) return null
                return chapters.map((chapter) => {
                  const units = (chapter.children || []).filter(c => c.level === 'unit')
                  const isCollapsed = collapsedChapters.has(chapter.id)
                  return (
                    <div key={chapter.id} style={{ paddingLeft: '16px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--color-surface)', borderRadius: '8px', touchAction: 'manipulation' }}>
                        <div onClick={() => handleToggleChapterCollapse(chapter.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.3s ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--color-primary)' }}>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.name}</span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{units.length} 单元</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteChapterRequest(chapter)
                          }}
                          style={{
                            width: 36, height: 36,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer', flexShrink: 0,
                            padding: 0, borderRadius: 8,
                            touchAction: 'manipulation',
                            pointerEvents: 'auto',
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                      <div style={{ maxHeight: isCollapsed ? 0 : 'none', overflow: isCollapsed ? 'hidden' : 'visible', transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                        {renderUnits(units)}
                      </div>
                    </div>
                  )
                })
              }
              
              for (const topic of knowledgeTreeTopics) {
                const chapters = (topic.children || []).filter(c => c.level === 'chapter')
                const units = (topic.children || []).filter(c => c.level === 'unit')
                const isTopicCollapsed = collapsedTopics.has(topic.id)
                
                treeItems.push(
                  <div key={topic.id} style={{ marginBottom: '16px' }}>
                    <div onClick={() => setCollapsedTopics(prev => { const next = new Set(prev); if (next.has(topic.id)) next.delete(topic.id); else next.add(topic.id); return next })} className="btn btn-secondary btn-block" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCollapsedTopics(prev => { const next = new Set(prev); if (next.has(topic.id)) next.delete(topic.id); else next.add(topic.id); return next }) }} style={{ justifyContent: 'space-between', padding: '12px 16px', marginBottom: 0, background: 'var(--color-primary-light)', borderColor: 'var(--color-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.3s ease', transform: isTopicCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--color-primary)' }}>
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                        <span className="section-title" style={{ marginBottom: 0, color: 'var(--color-primary-dark)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{topic.name}</span>
                        <span className="badge badge-primary" style={{ flexShrink: 0 }}>{((topic.children || []).reduce((sum, c) => { if (c.level === 'card') return sum + 1; return sum + (c.children || []).filter(ch => ch.level === 'card').length }, 0))} 张</span>
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{chapters.length > 0 ? `${chapters.length} 章节` : `${units.length} 单元`}</span>
                    </div>
                    <div style={{ maxHeight: isTopicCollapsed ? 0 : 'none', overflow: isTopicCollapsed ? 'hidden' : 'visible', transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                      {renderChapters(chapters)}
                      {chapters.length === 0 && renderUnits(units)}
                    </div>
                  </div>
                )
              }
              
              return treeItems
            })()}
          </ErrorBoundary>
        )}

        {/* 单元列表 - 按章节分组显示（旧表结构或知识树无主题时） */}
        {!generating && (!useKnowledgeTree || knowledgeTreeTopics.length === 0) && (() => {
          const chapterUnitsMap = new Map()
          const uncategorizedUnits = []
          for (const unit of units) {
            if (unit.chapterId) {
              if (!chapterUnitsMap.has(unit.chapterId)) {
                chapterUnitsMap.set(unit.chapterId, [])
              }
              chapterUnitsMap.get(unit.chapterId).push(unit)
            } else {
              uncategorizedUnits.push(unit)
            }
          }
          const items = []
          for (const chapter of chapters) {
            const chapterUnits = chapterUnitsMap.get(chapter.id) || []
            const isChapterCollapsed = collapsedChapters.has(chapter.id)
            items.push(
              <div key={`chapter-group-${chapter.id}`} style={{ marginBottom: '16px' }}>
                <div
                  onClick={() => handleToggleChapterCollapse(chapter.id)}
                  className="btn btn-secondary btn-block"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleChapterCollapse(chapter.id) }}
                  style={{
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    marginBottom: 0,
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border-light)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <svg
                      width="16" height="16"
                      viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        transition: 'transform 0.3s ease',
                        transform: isChapterCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        flexShrink: 0,
                        color: 'var(--color-primary)',
                      }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <span className="section-title" style={{ marginBottom: 0, color: 'var(--color-primary-dark)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {chapter.name}
                    </span>
                    <span className="badge badge-primary" style={{ flexShrink: 0 }}>
                      {chapterUnits.reduce((sum, u) => sum + (u.card_count || 0), 0)} 张
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                    {chapterUnits.length > 0 ? `${chapterUnits.length} 单元` : '暂无单元'}
                  </span>
                  <div style={{ position: 'relative', zIndex: 10 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setChapterMenuChapterId(chapterMenuChapterId === chapter.id ? null : chapter.id)
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setChapterMenuChapterId(chapterMenuChapterId === chapter.id ? null : chapter.id)
                      }}
                      style={{
                        width: 48, height: 48,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer', flexShrink: 0,
                        padding: 8, borderRadius: 8,
                        touchAction: 'manipulation',
                        pointerEvents: 'auto',
                        minWidth: 44,
                        minHeight: 44,
                      }}
                      aria-label="章节菜单"
                      title="章节操作"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                    {chapterMenuChapterId === chapter.id && createPortal(
                      <>
                        <div
                          style={{
                            position: 'fixed', inset: 0, zIndex: 9998,
                            backgroundColor: 'rgba(0,0,0,0.3)',
                          }}
                          onClick={() => setChapterMenuChapterId(null)}
                        />
                        <div
                          ref={chapterMenuRef}
                          style={{
                            position: 'fixed',
                            left: '50%', top: '50%',
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: 'var(--color-surface)',
                            borderRadius: '16px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                            minWidth: '200px',
                            zIndex: 9999,
                            overflow: 'hidden',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setChapterMenuChapterId(null)
                              handleEditChapterName(chapter.id, chapter.name)
                            }}
                            style={{
                              width: '100%', padding: '12px 16px', textAlign: 'left',
                              border: 'none', background: 'transparent',
                              color: 'var(--color-text)', fontSize: '14px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>✏️</span> 编辑名称
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setChapterMenuChapterId(null)
                              handleExportChapter(chapter, chapterUnits)
                            }}
                            style={{
                              width: '100%', padding: '12px 16px', textAlign: 'left',
                              border: 'none', background: 'transparent',
                              color: 'var(--color-text)', fontSize: '14px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>📥</span> 导出章节
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setChapterMenuChapterId(null)
                              showToast('请选择 Excel 文件', 'success')
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = '.xlsx,.xls'
                              input.style.display = 'none'
                              document.body.appendChild(input)
                              input.onchange = async (ev) => {
                                document.body.removeChild(input)
                                const file = ev.target?.files?.[0]
                                if (!file) return
                                try {
                                  const result = await parseExcelFile(file)
                                  if (result.success && result.cards.length > 0) {
                                    await handleImportCardsToChapter(chapter.id, chapter.name, result.cards)
                                  } else {
                                    showToast('文件中未识别到有效卡片数据', 'error')
                                  }
                                } catch (err) {
                                  showToast('导入失败：' + err.message, 'error')
                                }
                              }
                              input.click()
                            }}
                            style={{
                              width: '100%', padding: '12px 16px', textAlign: 'left',
                              border: 'none', background: 'transparent',
                              color: 'var(--color-text)', fontSize: '14px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>📥</span> 导入
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setChapterMenuChapterId(null)
                              handleCreateUnitInChapter(chapter.id, chapter.name)
                            }}
                            style={{
                              width: '100%', padding: '12px 16px', textAlign: 'left',
                              border: 'none', background: 'transparent',
                              color: 'var(--color-text)', fontSize: '14px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>➕</span> 添加单元
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              setChapterMenuChapterId(null)
                              try {
                                const { downloadChapterTemplate } = await import('../utils/excelParser')
                                await downloadChapterTemplate({ name: chapter.name })
                                showToast('章节模板已生成', 'success')
                              } catch (err) {
                                showToast('模板生成失败：' + (err.message || '未知错误'), 'error')
                              }
                            }}
                            style={{
                              width: '100%', padding: '12px 16px', textAlign: 'left',
                              border: 'none', background: 'transparent',
                              color: 'var(--color-text)', fontSize: '14px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>📋</span> 模板
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setChapterMenuChapterId(null)
                              console.log('章节删除按钮点击:', chapter)
                              console.log('章节ID:', chapter.id)
                              handleDeleteChapterRequest(chapter)
                            }}
                            style={{
                              width: '100%', padding: '12px 16px', textAlign: 'left',
                              border: 'none', background: 'transparent',
                              color: 'var(--color-danger)', fontSize: '14px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                              marginTop: '4px',
                              borderTop: '1px solid var(--color-border-light)',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>🗑️</span> 删除章节
                          </button>
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
                </div>
                <div
                  style={{
                    maxHeight: isChapterCollapsed ? 0 : 'none',
                    overflow: isChapterCollapsed ? 'hidden' : 'visible',
                    transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {chapterUnits.map((unit) => (
                    <UnitGroup
                      key={unit.id}
                      unit={unit}
                      categoryId={id}
                      cardsRefreshKey={cardsRefreshKey}
                      bookmarks={bookmarks}
                      onDeleteCard={handleDeleteCard}
                      onBookmarkCard={handleBookmarkCard}
                      onMoveCard={handleMoveCard}
                      onMoveUnit={handleMoveUnit}
                      onRenameUnit={handleRenameUnit}
                      onDeleteUnit={handleDeleteUnit}
                      forceCollapsed={allCollapsed}
                      forceExpanded={forceExpandUnitId === unit.id}
                      selectionMode={selectionMode}
                      selectedIds={selectedCardIds}
                      onToggleSelect={handleToggleSelect}
                      onCardLongPress={handleStartSelection}
                      onCardTouchStart={onCardTouchStart}
                      onCardTouchEnd={onCardTouchEnd}
                      onCardTouchMove={onCardTouchMove}
                      onCardClick={onCardClick}
                      apiKey={state?.apiKey}
                      aiServiceMode={state?.aiServiceMode}
                      model={state?.model}
                      summaryLevel={state?.summaryLevel}
                      sparkApiKey={state?.iflytekSparkApiKey}
                      sparkApiSecret={state?.iflytekApiSecret}
                      volcanoApiKey={state?.volcanoApiKey}
                      dashscopeApiKey={state?.dashscopeApiKey}
                      onImportCards={handleImportCards}
                    />
                  ))}
                </div>
              </div>
            )
          }
          if (uncategorizedUnits.length > 0) {
            const isUncategorizedCollapsed = collapsedChapters.has('__uncategorized__')
            items.push(
              <div key="chapter-group-uncategorized" style={{ marginBottom: '16px' }}>
                <div
                  onClick={() => handleToggleChapterCollapse('__uncategorized__')}
                  className="btn btn-secondary btn-block"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleChapterCollapse('__uncategorized__') }}
                  style={{
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    marginBottom: 0,
                    background: 'var(--color-bg-offset)',
                    borderColor: 'var(--color-border-light)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <svg
                      width="16" height="16"
                      viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        transition: 'transform 0.3s ease',
                        transform: isUncategorizedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        flexShrink: 0,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <span className="section-title" style={{ marginBottom: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      未分类
                    </span>
                    <span className="badge badge-secondary" style={{ flexShrink: 0 }}>
                      {uncategorizedUnits.reduce((sum, u) => sum + (u.card_count || 0), 0)} 张
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                    {uncategorizedUnits.length} 单元
                  </span>
                </div>
                <div
                  style={{
                    maxHeight: isUncategorizedCollapsed ? 0 : 'none',
                    overflow: isUncategorizedCollapsed ? 'hidden' : 'visible',
                    transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {uncategorizedUnits.map((unit) => (
                    <UnitGroup
                      key={unit.id}
                      unit={unit}
                      categoryId={id}
                      cardsRefreshKey={cardsRefreshKey}
                      bookmarks={bookmarks}
                      onDeleteCard={handleDeleteCard}
                      onBookmarkCard={handleBookmarkCard}
                      onMoveCard={handleMoveCard}
                      onMoveUnit={handleMoveUnit}
                      onRenameUnit={handleRenameUnit}
                      onDeleteUnit={handleDeleteUnit}
                      forceCollapsed={allCollapsed}
                      forceExpanded={forceExpandUnitId === unit.id}
                      selectionMode={selectionMode}
                      selectedIds={selectedCardIds}
                      onToggleSelect={handleToggleSelect}
                      onCardLongPress={handleStartSelection}
                      onCardTouchStart={onCardTouchStart}
                      onCardTouchEnd={onCardTouchEnd}
                      onCardTouchMove={onCardTouchMove}
                      onCardClick={onCardClick}
                      apiKey={state?.apiKey}
                      aiServiceMode={state?.aiServiceMode}
                      model={state?.model}
                      summaryLevel={state?.summaryLevel}
                      sparkApiKey={state?.iflytekSparkApiKey}
                      sparkApiSecret={state?.iflytekApiSecret}
                      volcanoApiKey={state?.volcanoApiKey}
                      dashscopeApiKey={state?.dashscopeApiKey}
                      onImportCards={handleImportCards}
                    />
                  ))}
                </div>
              </div>
            )
          }
          return items
        })()}
        </ErrorBoundary>
      </main>

      {/* ===== 删除卡片确认对话框 ===== */}
      <div>
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
                <button onClick={handleCancelDelete} className="btn btn-secondary btn-sm">
                  取消
                </button>
                <button onClick={handleConfirmDelete} className="btn btn-danger btn-sm">
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 批量删除确认对话框 ===== */}
      <div>
        {showBatchDeleteConfirm && (
          <div className="dialog-overlay" onClick={() => setShowBatchDeleteConfirm(false)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
              <div className="dialog-icon" style={{background: 'var(--color-danger-light)', color: 'var(--color-danger)'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <p className="dialog-title">批量删除</p>
              <p className="dialog-message">确认删除选中的 {selectedCardIds.size} 张卡片吗？此操作无法撤销。</p>
              <div className="dialog-actions">
                <button onClick={() => setShowBatchDeleteConfirm(false)} className="btn btn-secondary btn-sm">
                  取消
                </button>
                <button onClick={handleBatchDelete} className="btn btn-danger btn-sm">
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 新增章节弹窗 ===== */}
      <div>
        {showAddChapterModal && createPortal(
          <>
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                backgroundColor: 'rgba(0,0,0,0.3)',
              }}
              onClick={() => {
                setShowAddChapterModal(false)
                setNewChapterName('')
              }}
            />
            <div
              style={{
                position: 'fixed',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: '16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                minWidth: '280px',
                width: '90%',
                maxWidth: '360px',
                zIndex: 9999,
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  padding: '16px',
                  borderBottom: '1px solid var(--color-border-light)',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>新增章节</span>
              </div>
              <div style={{ padding: '16px' }}>
                <input
                  autoFocus
                  type="text"
                  value={newChapterName}
                  onChange={(e) => setNewChapterName(e.target.value)}
                  placeholder="输入章节名称（如：第一章、Unit 1）"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateChapter()
                      setShowAddChapterModal(false)
                    } else if (e.key === 'Escape') {
                      setShowAddChapterModal(false)
                      setNewChapterName('')
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  gap: 10,
                  borderTop: '1px solid var(--color-border-light)',
                }}
              >
                <button
                  onClick={() => {
                    setShowAddChapterModal(false)
                    setNewChapterName('')
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, minHeight: 40 }}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    handleCreateChapter()
                    setShowAddChapterModal(false)
                  }}
                  disabled={!newChapterName.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, minHeight: 40 }}
                >
                  确认
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>

      {/* ===== 新增单元弹窗 ===== */}
      <div>
        {showAddUnitModal && createPortal(
          <>
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                backgroundColor: 'rgba(0,0,0,0.3)',
              }}
              onClick={() => {
                setShowAddUnitModal(false)
                setNewUnitNameForChapter('')
              }}
            />
            <div
              style={{
                position: 'fixed',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: '16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                minWidth: '280px',
                width: '90%',
                maxWidth: '360px',
                zIndex: 9999,
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  padding: '16px',
                  borderBottom: '1px solid var(--color-border-light)',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>新增单元</span>
              </div>
              <div style={{ padding: '16px' }}>
                <input
                  autoFocus
                  type="text"
                  value={newUnitNameForChapter}
                  onChange={(e) => setNewUnitNameForChapter(e.target.value)}
                  placeholder="输入单元名称"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleConfirmCreateUnit()
                    } else if (e.key === 'Escape') {
                      setShowAddUnitModal(false)
                      setNewUnitNameForChapter('')
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  gap: 10,
                  borderTop: '1px solid var(--color-border-light)',
                }}
              >
                <button
                  onClick={() => {
                    setShowAddUnitModal(false)
                    setNewUnitNameForChapter('')
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, minHeight: 40 }}
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmCreateUnit}
                  disabled={!newUnitNameForChapter.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, minHeight: 40 }}
                >
                  确认
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>

      {/* ===== 删除章节确认对话框 ===== */}
      <div>
        {showChapterDeleteConfirm && chapterToDelete && (
          <div className="dialog-overlay" onClick={() => { setShowChapterDeleteConfirm(false); setChapterToDelete(null) }}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
              <div className="dialog-icon" style={{background: 'var(--color-danger-light)', color: 'var(--color-danger)'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </div>
              <p className="dialog-title">删除章节</p>
              <p className="dialog-message">确认删除章节「{chapterToDelete.name}」吗？其下的单元将保留为"未分类"状态。</p>
              <div className="dialog-actions">
                <button
                  onClick={() => { setShowChapterDeleteConfirm(false); setChapterToDelete(null) }}
                  className="btn btn-secondary btn-sm"
                >
                  取消
                </button>
                <button onClick={handleConfirmDeleteChapter} className="btn btn-danger btn-sm">
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 删除单元确认对话框 ===== */}
      <div>
        {showUnitDeleteConfirm && unitToDelete && (
          <div className="dialog-overlay" onClick={() => { setShowUnitDeleteConfirm(false); setUnitToDelete(null) }}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
              <div className="dialog-icon" style={{background: 'var(--color-danger-light)', color: 'var(--color-danger)'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </div>
              <p className="dialog-title">删除单元</p>
              <p className="dialog-message">确认删除单元「{unitToDelete.name}」及其所有卡片吗？此操作不可撤销。</p>
              <div className="dialog-actions">
                <button
                  onClick={() => { setShowUnitDeleteConfirm(false); setUnitToDelete(null) }}
                  className="btn btn-secondary btn-sm"
                >
                  取消
                </button>
                <button onClick={handleConfirmDeleteUnit} className="btn btn-danger btn-sm">
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 移动卡片居中模态框 ===== */}
      <div>
        {showMoveModal && (
          <div className="dialog-overlay" onClick={handleCancelMove}>
            <div className="dialog" style={{maxWidth: 420, width: '90%'}} onClick={(e) => e.stopPropagation()}>
              <div style={{fontSize: 18, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16, textAlign: 'center'}}>
                {batchMoveMode ? `移动 ${cardsToMove.length} 张卡片` : '移动卡片'}
              </div>

              <div style={{marginBottom: 12, fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600}}>选择分类</div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
                {state.categories
                  .map((cat) => (
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
                  <div style={{marginBottom: 12, fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600}}>选择单元</div>
                  {targetUnits.length === 0 ? (
                    <div style={{padding: 12, background: 'var(--color-border-light)', borderRadius: 8, fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, textAlign: 'center'}}>
                      该分类下尚无单元
                    </div>
                  ) : (
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
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

              {/* 新增：多选移动时支持直接在目标分类下新建单元 */}
              {batchMoveMode && targetCategoryId && (
                <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-border-light)' }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 8 }}>
                    或新建单元
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={newUnitName}
                      onChange={(e) => setNewUnitName(e.target.value)}
                      placeholder="输入新单元名称"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg)',
                        color: 'var(--color-text)',
                        fontSize: 14,
                      }}
                    />
                    <button
                      onClick={handleCreateUnitInMove}
                      disabled={creatingUnitInMove || !newUnitName.trim()}
                      className="btn btn-secondary btn-sm"
                      style={{ flexShrink: 0, minHeight: 36 }}
                    >
                      {creatingUnitInMove ? '创建中...' : '创建并选中'}
                    </button>
                  </div>
                </div>
              )}

              <div className="dialog-actions" style={{marginTop: 20}}>
                <button onClick={handleCancelMove} className="btn btn-secondary btn-sm">取消</button>
                <button onClick={handleConfirmMove} disabled={!targetCategoryId || !targetUnitId} className="btn btn-primary btn-sm">确认移动</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* [P3-1] 已清理: DuplicateCardConfirm 组件（死代码） */}
    </div>

    {/* ===== 知识点确认弹窗（Step 1 → Step 2 之间）===== */}
    {showKpConfirm && (
      <KnowledgePointConfirm
        knowledgePoints={kpConfirmList}
        rawText={kpConfirmConfig?.rawText}
        onConfirm={handleKpConfirm}
        onCancel={handleKpCancel}
        onBack={handleStepBack}
        onRegenerate={handleKpRegenerate}
        isFirstStep={cardGenStep === 1}
        loading={kpConfirmLoading}
      />
    )}

    {/* ===== OCR 识别结果确认弹窗 ===== */}
    <OcrConfirmModal
      open={ocrConfirmOpen}
      text={ocrConfirmText}
      loading={ocrConfirmLoading}
      onConfirm={(confirmedText) => {
        setOcrConfirmOpen(false)
        showToast('正在生成卡片...')
        handleGenerate(confirmedText)
      }}
      onCancel={(editText) => {
        setOcrConfirmOpen(false)
        setInputValue(editText || '')
        showToast('已取消，文字已写入输入框', 'info')
      }}
    />

    {/* ===== 主题确认弹窗（主题聚类 → 归类之前）===== */}
    {showTopicConfirm && (
      <TopicConfirmModal
        topics={currentTopics}
        knowledgePoints={topicConfirmConfig?.pointsToUse || []}
        onConfirm={handleTopicConfirm}
        onCancel={handleTopicCancel}
        onRegenerate={handleTopicRegenerate}
        onBack={handleStepBack}
        loading={topicConfirmLoading}
        setCurrentTopics={setCurrentTopics}
      />
    )}

    {/* ===== 合并摘要弹窗 ===== */}
    {showMergeSummary && (
      <TopicMergeSummaryModal
        visible={showMergeSummary}
        data={mergeSummaryData}
        onConfirm={handleMergeSummaryConfirm}
        onBack={handleStepBack}
        pointsToUse={topicConfirmConfig?.pointsToUse || []}
        aiConfig={topicConfirmConfig?.aiConfig}
        categoryId={id}
        onToast={showToast}
      />
    )}

    {/* ===== 新卡片预览/管理弹窗 ===== */}
    {/* [P3-2] 注意: 此组件为死代码，setShowNewCardPanel(true) 从未调用，NewCardPanel 永远不显示 */}
    {/* 新流程已由 NewCardPreviewPanel (Step 5) 替代，保留此组件以备未来可能的编辑功能 */}
    <NewCardPanel
      visible={showNewCardPanel}
      cards={panelCards}
      existingUnits={panelExistingUnits}
      existingChapters={chapters}
      onCancel={() => {
        setShowNewCardPanel(false)
        setPanelCards([])
      }}
      onBack={handleStepBack}
      onConfirm={commitPanelToDB}
      showToast={showToast}
    />

    {/* ===== 新卡片预览面板（延迟化流程 Step 5）===== */}
    {showNewCardPreviewPanel && (
      <NewCardPreviewPanel
        unitDataList={previewUnitDataList}
        categoryId={id}
        onConfirm={handlePreviewConfirm}
        onBack={handleStepBack}
        isFirstStep={false}
        pointsToUse={topicConfirmConfig?.pointsToUse || []}
        showToast={showToast}
        addUnitsWithMatching={addUnitsWithMatching}
      />
    )}

    <CardSelectionModal
      visible={cardSelectionModalOpen}
      title={cardSelectionFeature === 'cross-category'
        ? '指定分类归类'
        : cardSelectionFeature === 'cross-category-auto'
          ? 'AI 全权归类'
          : '智能单元整理'}
      description={cardSelectionFeature === 'cross-category'
        ? '选择需要移动到指定目标分类的卡片，下一步将选择目标分类'
        : cardSelectionFeature === 'cross-category-auto'
          ? '选择需要 AI 跨分类重新规划的卡片，下一步将生成完整分类-单元方案'
          : '选择需要参与单元整理的卡片，后续将进入整理确认流程'}
      units={cardSelectionFeature === 'cross-category-auto' ? crossCategoryUnits : units}
      chapters={cardSelectionFeature === 'cross-category-auto' ? crossCategoryChapters : chapters}
      categories={cardSelectionFeature === 'cross-category-auto' ? state.categories : null}
      feature={cardSelectionFeature}
      classificationDepth={classificationDepth}
      onClassificationDepthChange={setClassificationDepth}
      nextLoading={(unitReorganizeLoading && (cardSelectionFeature === 'unit-organize' || cardSelectionFeature === 'cross-category-auto')) || targetCategorySelectLoading || crossCategoryDataLoading}
      nextLabel={crossCategoryDataLoading ? '加载中...' : '下一步'}
      onCancel={() => {
        if (unitReorganizeLoading || targetCategorySelectLoading || crossCategoryLoading) return
        setCardSelectionModalOpen(false)
      }}
      onNext={handleCardSelectionNext}
    />

    <TargetCategorySelect
      visible={targetCategorySelectOpen}
      categories={targetCategoryOptions}
      selectedCategoryId={selectedTargetCategoryId}
      loading={targetCategorySelectLoading || unitReorganizeLoading}
      onSelectCategory={setSelectedTargetCategoryId}
      onCreateCategory={handleCreateTargetCategory}
      onBack={handleTargetCategoryBack}
      onNext={handleTargetCategoryNext}
    />

    <TargetCategorySelect
      visible={showUnitMoveSelect}
      mode="unit-move"
      categories={targetCategoryOptions}
      selectedCategoryId={moveTargetCategoryId}
      loading={moveUnitLoading}
      onSelectCategory={handleUnitMoveSelectCategory}
      onCreateCategory={handleCreateTargetCategory}
      onBack={handleUnitMoveCancel}
      onNext={handleUnitMoveConfirm}
      chapters={moveTargetChapters}
      selectedChapterId={moveTargetChapterId}
      onSelectChapter={handleUnitMoveSelectChapter}
      onCreateChapter={handleCreateMoveTargetChapter}
      units={moveTargetUnits}
      selectedUnitId={moveTargetUnitId}
      onSelectUnit={handleUnitMoveSelectUnit}
    />

    <UnitReorganizeConfirm
      visible={showUnitReorganizeConfirm}
      plan={unitReorganizePlan}
      loading={unitReorganizeLoading}
      onCancel={handleCancelUnitReorganize}
      onConfirm={handleConfirmUnitReorganize}
      onMinimize={handleMinimizeUnitReorganize}
    />

    <CrossCategoryConfirm
      visible={crossCategoryConfirmOpen}
      plan={crossCategoryPlan}
      loading={crossCategoryLoading}
      onCancel={handleCancelCrossCategoryConfirm}
      onConfirm={handleConfirmCrossCategory}
      onMinimize={handleMinimizeCrossCategoryConfirm}
    />

    {/* ===== 底部固定输入栏（floating 模式由全局 TabBarLayout 挂载）===== */}
    {state.inputBarMode !== 'floating' && (
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        backgroundColor: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
        boxShadow: '0 -2px 12px rgba(0, 0, 0, 0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{
          maxWidth: '540px',
          margin: '0 auto',
          padding: '4px 10px',
        }}>
          <InputBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleGenerate}
            onImageOCR={handleImageOCR}
            ocrLoading={ocrLoading}
            summaryLevel={summaryLevel}
            onSummaryLevelChange={setSummaryLevel}
            disabled={generating || hasActiveCardGenFlow}
            apiKey={state.apiKey}
            model={state.model}
            onToast={showToast}
          />
        </div>
      </div>
    )}
    <BackToTop scrollContainerSelector=".page-container" />

    {/* ===== AI 调试面板 ===== */}
    <DebugPanel
      entries={debugEntries}
      onClear={() => setDebugEntries([])}
    />

    {/* ===== AI 超时确认对话框 ===== */}
    {showTimeoutConfirm && (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999,
        padding: '20px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⏱️</div>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--color-text)' }}>
              AI 响应超时
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
              弱模型响应较慢，AI 分类未能完成。
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '8px 0 0 0', lineHeight: 1.5 }}>
              您可以选择<strong>使用默认分组</strong>（基于已确认的主题聚类），或<strong>重新尝试</strong>。
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleTimeoutCancel}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              重新尝试
            </button>
            <button
              onClick={handleTimeoutConfirm}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              使用默认分组
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}

// ===== 主题确认弹窗组件 =====
function TopicConfirmModal({ topics, knowledgePoints, onConfirm, onCancel, onRegenerate, loading, setCurrentTopics, onBack }) {
  const [editingTopic, setEditingTopic] = useState(null)
  const [editName, setEditName] = useState('')
  const [editingChapter, setEditingChapter] = useState(null)  // 正在编辑章节名的主题索引
  const [editChapterName, setEditChapterName] = useState('')
  const [expandedTopic, setExpandedTopic] = useState(0) // default first topic expanded

  // 初始化章节名（如果主题没有 chapterName，则使用 topicName 作为默认值）
  const topicsWithChapter = topics.map(t => ({
    ...t,
    chapterName: t.chapterName || t.topicName || '',
  }))

  const handleEditName = (topic) => {
    setEditingTopic(topic)
    setEditName(topic.topicName)
  }

  const handleSaveName = () => {
    if (editingTopic && editName.trim()) {
      setCurrentTopics(prev => prev.map(t => 
        t === editingTopic ? { ...t, topicName: editName.trim().slice(0, 12) } : t
      ))
    }
    setEditingTopic(null)
    setEditName('')
  }

  const handleEditChapterName = (idx) => {
    setEditingChapter(idx)
    setEditChapterName(topicsWithChapter[idx].chapterName)
  }

  const handleSaveChapterName = () => {
    if (editingChapter !== null && editChapterName.trim()) {
      setCurrentTopics(prev => prev.map((t, i) => 
        i === editingChapter ? { ...t, chapterName: editChapterName.trim().slice(0, 12) } : t
      ))
    }
    setEditingChapter(null)
    setEditChapterName('')
  }

  const handleResetChapterName = (idx) => {
    setCurrentTopics(prev => prev.map((t, i) => 
      i === idx ? { ...t, chapterName: t.topicName } : t
    ))
  }

  const handleConfirm = () => {
    // 确保每个主题都有 chapterName
    const topicsForConfirm = topicsWithChapter.map(t => ({
      ...t,
      chapterName: t.chapterName || t.topicName || '',
    }))
    onConfirm(topicsForConfirm)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999,
      padding: '12px',
      boxSizing: 'border-box',
      animation: 'fadeIn 0.2s ease',
    }}
      onClick={onCancel}
    >
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            borderRadius: '16px',
          height: 'min(calc(100dvh - 24px), 780px)',
          maxHeight: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            新主题分组确认
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px', margin: 0 }}>
            AI 已将 {knowledgePoints.length} 个知识点按主题分组，请确认或调整
          </p>
        </div>

        {/* 主题列表 */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '12px 14px', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {topics.map((topic, idx) => {
            const isExpanded = expandedTopic === idx
            const units = topic.units || [{ unitName: '基础', pointIndices: topic.pointIndices }]
            const totalKps = units.reduce((sum, u) => sum + (u.pointIndices || []).length, 0)
            const chapterName = topic.chapterName || topic.topicName || ''
            
            return (
              <div key={idx} style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                marginBottom: '12px',
                cursor: 'pointer',
                border: isExpanded ? '1px solid var(--color-primary)' : '1px solid transparent',
              }}>
                {/* 主题头部 - 可点击展开/折叠 */}
                <div 
                  onClick={() => setExpandedTopic(isExpanded ? -1 : idx)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    ▶
                  </span>
                  <span style={{ fontSize: 'var(--text-base)' }}>📚</span>
                  {editingTopic === topic ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                        maxLength={12}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--color-primary)', fontSize: 'var(--text-base)' }}
                      />
                      <button onClick={(e) => { e.stopPropagation(); handleSaveName(); }} style={{ padding: '4px 8px', fontSize: 'var(--text-sm)', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>确定</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600, flex: 1, fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
                        {topic.topicName}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); handleEditName(topic); }} style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>编辑</button>
                    </>
                  )}
                </div>
                
                {/* 章节名：一个主题对应一个章节 */}
                <div 
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '6px', 
                    marginTop: '8px', paddingLeft: '20px',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    📁 章节名:
                  </span>
                  {editingChapter === idx ? (
                    <>
                      <input
                        type="text"
                        value={editChapterName}
                        onChange={(e) => setEditChapterName(e.target.value)}
                        onBlur={handleSaveChapterName}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveChapterName()}
                        autoFocus
                        maxLength={12}
                        placeholder="输入章节名（≤12字）"
                        style={{ 
                          flex: 1, padding: '4px 8px', borderRadius: '4px', 
                          border: '1px solid var(--color-primary)', fontSize: 'var(--text-sm)',
                          minWidth: 0,
                        }}
                      />
                      <button 
                        onClick={handleSaveChapterName}
                        style={{ 
                          padding: '4px 8px', fontSize: 'var(--text-xs)', 
                          background: 'var(--color-primary)', color: '#fff', 
                          border: 'none', borderRadius: '4px', cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        确定
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ 
                        flex: 1, fontSize: 'var(--text-sm)', fontWeight: 500,
                        color: chapterName ? 'var(--color-text)' : 'var(--color-text-secondary)',
                        fontStyle: chapterName ? 'normal' : 'italic',
                      }}>
                        {chapterName || '点击编辑章节名'}
                      </span>
                      <button 
                        onClick={() => handleEditChapterName(idx)}
                        style={{ 
                          padding: '3px 6px', fontSize: 'var(--text-xs)', 
                          background: 'transparent', border: '1px solid var(--color-border)', 
                          borderRadius: '4px', cursor: 'pointer', color: 'var(--color-text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✏️
                      </button>
                      {chapterName && chapterName !== topic.topicName && (
                        <button 
                          onClick={() => handleResetChapterName(idx)}
                          title="重置为与主题名一致"
                          style={{ 
                            padding: '3px 6px', fontSize: 'var(--text-xs)', 
                            background: 'transparent', border: '1px solid var(--color-warning, #e6a23c)', 
                            borderRadius: '4px', cursor: 'pointer', color: 'var(--color-warning, #e6a23c)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ↺
                        </button>
                      )}
                    </>
                  )}
                </div>
                
                {/* 知识点数量统计 */}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '6px', paddingLeft: '20px' }}>
                  {totalKps} 个知识点 · {units.length} 个单元
                </div>
                
                {/* 展开的单元列表 */}
                {isExpanded && (
                  <div style={{ marginTop: '10px', paddingLeft: '20px', borderLeft: '2px solid var(--color-primary-light)' }}>
                    {units.map((unit, uIdx) => (
                      <div key={uIdx} style={{ marginBottom: '8px' }}>
                        <div style={{ 
                          fontSize: 'var(--text-sm)', 
                          fontWeight: 600, 
                          color: 'var(--color-primary)',
                          marginBottom: '4px',
                        }}>
                          📋 {unit.unitName}
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: '6px' }}>
                            {(unit.pointIndices || []).length} 个知识点
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {(unit.pointIndices || []).slice(0, 3).map(kpIdx => (
                            <div key={kpIdx} style={{
                              background: 'var(--color-surface)',
                              color: 'var(--color-primary)',
                              padding: '2px 8px',
                              borderRadius: '3px',
                              fontSize: 'var(--text-xs)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              #{kpIdx + 1}: {String(knowledgePoints[kpIdx] || '').slice(0, 50)}...
                            </div>
                          ))}
                          {(unit.pointIndices || []).length > 3 && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                              +{(unit.pointIndices || []).length - 3} 个知识点...
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 操作按钮 */}
        <div style={{ flexShrink: 0, padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--color-border-light)', background: 'var(--color-bg-secondary)', boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.04)' }} onClick={(e) => e.stopPropagation()}>
          {/* 重新聚类按钮组 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px', textAlign: 'center' }}>
              {loading ? '重新聚类中...' : '选择聚类粒度后重新分组'}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => onRegenerate('concise')}
                disabled={loading}
                style={{
                  flex: 1,
                  minHeight: 32,
                  padding: '6px 4px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  fontSize: '12px',
                  color: 'var(--color-text)',
                  fontFamily: 'inherit',
                }}
              >
                📚 简
              </button>
              <button
                onClick={() => onRegenerate('standard')}
                disabled={loading}
                style={{
                  flex: 1,
                  minHeight: 32,
                  padding: '6px 4px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  fontSize: '12px',
                  color: 'var(--color-text)',
                  fontFamily: 'inherit',
                }}
              >
                📖 中
              </button>
              <button
                onClick={() => onRegenerate('detailed')}
                disabled={loading}
                style={{
                  flex: 1,
                  minHeight: 32,
                  padding: '6px 4px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  fontSize: '12px',
                  color: 'var(--color-text)',
                  fontFamily: 'inherit',
                }}
              >
                📝 详
              </button>
            </div>
          </div>
          {/* 取消和确认按钮 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onBack}
              className="btn btn-secondary btn-sm"
              style={{
                flex: 1, minHeight: 42, fontSize: '13px',
                padding: '8px 10px', borderRadius: '10px',
                border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                color: 'var(--color-text-secondary)', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← 上一步
            </button>
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                minHeight: 42,
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{
                flex: 1,
                minHeight: 42,
                padding: '8px 14px',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== 合并摘要弹窗组件 =====
function TopicMergeSummaryModal({ visible, data, onConfirm, onBack, pointsToUse, aiConfig, categoryId, onToast }) {
  if (!visible || !data) return null
  
  const { newTopics, mergeDecisions = [], replaceDecisions = [], deletedChapterIds = [], deletedUnitIds = [], beforeTopics = null, beforeUnits = null } = data
  
  const [expandedChapter, setExpandedChapter] = useState(-1)
  
  // Build summary text
  const summaryLines = []
  const mergedTopicNames = mergeDecisions.filter(d => d.shouldMerge).map(d => d.newTopicName || '')
  const replacedUnitNames = replaceDecisions.filter(d => d.shouldReplace).map(d => d.newUnitName || '')
  
  if (mergedTopicNames.length > 0) {
    summaryLines.push(`"${mergedTopicNames.join('"、"')}" 已合并已有主题`)
  }
  if (replacedUnitNames.length > 0) {
    summaryLines.push(`"${replacedUnitNames.join('"、"')}" 已替换已有单元`)
  }
  if (summaryLines.length === 0) {
    summaryLines.push('未检测到可合并的主题/单元，已直接生成新结构')
  }
  
  // Build chapter→unit tree from beforeUnits
  const chapterTree = []  // [{chapterName, totalCards, units: [{unitName, cardCount, cardIndices}]}]
  if (beforeUnits && Array.isArray(beforeUnits)) {
    const chapterMap = new Map()
    for (const unit of beforeUnits) {
      const chName = unit.chapterName || '未归类'
      if (!chapterMap.has(chName)) {
        chapterMap.set(chName, { chapterName: chName, totalCards: 0, units: [] })
      }
      const ch = chapterMap.get(chName)
      const unitData = {
        unitName: unit.name || '未命名单元',
        cardCount: (unit.cardIndices || []).length,
        cardIndices: unit.cardIndices || [],
      }
      ch.units.push(unitData)
      ch.totalCards += unitData.cardCount
    }
    // Sort units by cardCount descending
    for (const ch of chapterMap.values()) {
      ch.units.sort((a, b) => b.cardCount - a.cardCount)
    }
    chapterTree.push(...chapterMap.values())
  }
  
  // Calculate total stats
  const totalChapters = chapterTree.length
  const totalUnits = chapterTree.reduce((sum, ch) => sum + ch.units.length, 0)
  const totalCards = chapterTree.reduce((sum, ch) => sum + ch.totalCards, 0)
  // 知识点数从 pointsToUse 获取
  const totalKpCount = pointsToUse?.length || data.kpCount || totalCards
  
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: '12px',
      boxSizing: 'border-box',
    }}>
      <div style={{
        background: 'var(--color-bg-secondary)', borderRadius: '16px',
        width: '100%', maxWidth: '420px',
        height: 'min(calc(100dvh - 24px), 780px)',
        maxHeight: 'none',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-light)', flexShrink: 0 }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            知识体系结构调整完成
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px', margin: 0 }}>
            AI 已完成章节与单元的合并优化 · {totalChapters} 章节 · {totalUnits} 单元 · {totalKpCount} 知识点
          </p>
        </div>
        
        {/* Scrollable Content */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '12px 14px', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {/* 结构变化说明 */}
          <div style={{ 
            background: 'var(--color-bg-secondary)', 
            borderRadius: 'var(--radius-md)', 
            padding: '12px', 
            marginBottom: '16px',
          }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text)' }}>
              结构变化
            </div>
            {summaryLines.map((line, i) => (
              <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px', lineHeight: 1.5 }}>
                • {line}
              </div>
            ))}
          </div>
          
          {/* 可展开的章节-单元树形结构 */}
          {chapterTree.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '10px', color: 'var(--color-text)' }}>
                章节—单元结构
              </div>
              
              {chapterTree.map((ch, idx) => {
                const isExpanded = expandedChapter === idx
                return (
                  <div key={idx} style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    border: isExpanded ? '1px solid var(--color-primary)' : '1px solid transparent',
                  }}>
                    {/* 章节头部 - 可点击展开/折叠 */}
                    <div 
                      onClick={() => setExpandedChapter(isExpanded ? -1 : idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{ 
                        fontSize: 'var(--text-sm)', 
                        transition: 'transform 0.2s', 
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        color: 'var(--color-text-secondary)',
                      }}>
                        ▶
                      </span>
                      <span style={{ fontSize: 'var(--text-base)' }}>📚</span>
                      <span style={{ fontWeight: 600, flex: 1, fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
                        {ch.chapterName}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {ch.totalCards} 知识点 · {ch.units.length} 单元
                      </span>
                    </div>
                    
                    {/* 展开的单元列表 */}
                    {isExpanded && (
                      <div style={{ marginTop: '10px', paddingLeft: '20px', borderLeft: '2px solid var(--color-primary-light)' }}>
                        {ch.units.map((unit, uIdx) => (
                          <div key={uIdx} style={{ marginBottom: '8px' }}>
                            <div style={{ 
                              fontSize: 'var(--text-sm)', 
                              fontWeight: 600, 
                              color: 'var(--color-primary)',
                              marginBottom: '4px',
                            }}>
                              📋 {unit.unitName}
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: '6px' }}>
                                {unit.cardCount} 知识点
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {(unit.cardIndices || []).slice(0, 3).map(cardIdx => (
                                <div key={cardIdx} style={{
                                  background: 'var(--color-surface)',
                                  color: 'var(--color-primary)',
                                  padding: '2px 8px',
                                  borderRadius: '3px',
                                  fontSize: 'var(--text-xs)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  #{cardIdx + 1}: 卡片 {cardIdx + 1}
                                </div>
                              ))}
                              {(unit.cardIndices || []).length > 3 && (
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                                  +{(unit.cardIndices || []).length - 3} 张卡片...
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          
          {/* 合并详情 */}
          {mergedTopicNames.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text)' }}>
                主题合并详情
              </div>
              {mergeDecisions.filter(d => d.shouldMerge).map((d, i) => (
                <div key={i} style={{ 
                  fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', 
                  padding: '6px 10px', background: 'var(--color-success-light)', borderRadius: '4px', marginBottom: '4px',
                  borderLeft: '3px solid var(--color-success)',
                }}>
                  "{d.newTopicName}" 已合并到已有主题中
                </div>
              ))}
            </div>
          )}
          
          {replacedUnitNames.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text)' }}>
                单元替换详情
              </div>
              {replaceDecisions.filter(d => d.shouldReplace).map((d, i) => (
                <div key={i} style={{ 
                  fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', 
                  padding: '6px 10px', background: 'var(--color-surface)', borderRadius: '4px', marginBottom: '4px',
                  borderLeft: '3px solid var(--color-primary)',
                }}>
                  "{d.newUnitName}" 替换了已有单元
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--color-border-light)', background: 'var(--color-bg-secondary)', display: 'flex', gap: '8px', boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.04)' }}>
          <button
            onClick={onBack}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '10px',
              border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
              fontSize: '13px', cursor: 'pointer', minHeight: 42, fontFamily: 'inherit',
            }}
          >
            ← 上一步
          </button>
          <button
            onClick={() => {
              onConfirm(null, data)
            }}
            style={{
              flex: 2, padding: '8px 16px', borderRadius: '10px',
              border: 'none', background: 'var(--color-primary)', color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: 42, fontFamily: 'inherit',
            }}
          >
            确定并生成卡片
          </button>
        </div>
      </div>
    </div>
  )
}
