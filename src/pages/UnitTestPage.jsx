﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import TestCardItem from '../components/TestCardItem'
import { shuffleArray } from '../utils/helpers'
import { addTestSession, updateTestSession, getUncompletedTestSession, deleteTestSession, getTestQuestionsByUnit, getTestQuestionsByCategory, getTestQuestionsByChapter, saveTestRecord, addWrongAnswer, clearWrongAnswer, clearTestSessionAnswers, getCategory, getUnit, getTestQuestionsByCardIds, getTestQuestionsByIds, getWrongAnswersByCategoryAndUnit, getWrongAnswersByCategory, getTestRecordQuestionsSnapshot, getTestRecord } from '../services/db'
import { gradeTest, gradeLocalOnly } from '../services/testGradingService'
import { getAiCallLogs, getModelLabel } from '../services/aiCallLog'
import { useBackgroundTask, TASK_TYPE } from '../context/BackgroundTaskContext'

const AUTO_SAVE_INTERVAL = 30000 // 30秒

/**
 * 通用答题页面
 * 支持4种模式：单元检测、分类检测、复习、错题重做
 * 路由参数：?mode=unit|category|review|wrong&unitId=xxx&categoryId=xxx
 */
export default function UnitTestPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state: appState, fontSize, eyeProtection, inputMode, showToast } = useApp()
  const { startTask } = useBackgroundTask()

  // 从 navigation state 获取 AI 调用日志（由 UnitTestMain 跳转时传入）
  const incomingAiLogs = location.state?.aiLogs || []

  // ==================== 路由参数解析 ====================
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const mode = searchParams.get('mode') || 'unit'
  const unitId = searchParams.get('unitId') || ''
  const categoryId = searchParams.get('categoryId') || ''
  const chapterIdParam = searchParams.get('chapterId') || ''
  // resume = continue | restart | '' ，用于"答题记录"页的跳转控制：
  //   continue 跳过断点续考弹窗，自动恢复上次答题进度
  //   restart  清空上次答题进度后重新开始（题目保留）
  //   ''       按既有逻辑：有未完成会话时弹窗询问
  const resume = searchParams.get('resume') || ''
  // redoFrom = 源记录 id，用于"检测重做"：优先使用源记录的 questions 快照
  const redoFrom = searchParams.get('redoFrom') || ''
  // redoCount：由源记录衍生出的第几次重做（1 起步）
  const redoCountRaw = searchParams.get('redoCount')
  const redoCount = (redoCountRaw && !isNaN(Number(redoCountRaw))) ? Number(redoCountRaw) + 1 : 1

  const modeLabels = { unit: '单元检测', category: '分类检测', chapter: '章节检测', review: '复习模式', wrong: '错题重做' }
  // difficulty: 1/2/3 表示具体难度，'random' 或空表示不筛选（随机难度）
  const difficultyParam = searchParams.get('difficulty')
  const difficulty = (difficultyParam && difficultyParam !== 'random' && !isNaN(Number(difficultyParam))) ? Number(difficultyParam) : null

  // ==================== 状态 ====================
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // { questionId: { answer, isCorrect, ... } }
  const [markedQuestions, setMarkedQuestions] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [finished, setFinished] = useState(false)
  const [results, setResults] = useState(null)
  const [instantFeedback, setInstantFeedback] = useState(false)
  const [feedbackMap, setFeedbackMap] = useState({}) // { questionId: feedbackResult }

  // 计时器
  const [elapsed, setElapsed] = useState(0)
  const [timerPaused, setTimerPaused] = useState(false)
  const timerRef = useRef(null)
  const startTimeRef = useRef(Date.now())
  const pausedAtRef = useRef(null)

  // 悬浮窗
  const [showFloatPanel, setShowFloatPanel] = useState(false)
  const floatPanelRef = useRef(null)
  const floatDragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 })
  const [floatPos, setFloatPos] = useState({ x: 16, y: 120 })

  // 滑动
  const touchRef = useRef({ startX: 0, startY: 0, isSwiping: false })
  const cardRef = useRef(null)

  // 断点续考
  const [showResumePrompt, setShowResumePrompt] = useState(false)
  const autoSaveTimerRef = useRef(null)

  // 【检测重做】保存源记录信息，用于在 saveTestRecord 时附带写入
  const redoInfoRef = useRef(null)

  // 顶部栏更多菜单（D-1：窄屏收纳反馈开关、标记，避免顶部栏挤压）
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  // 分类名、单元名、章节ID（用于答题记录显示和错题写入）
  const [categoryName, setCategoryName] = useState('')
  const [unitName, setUnitName] = useState('')
  const [chapterId, setChapterId] = useState(chapterIdParam)

  // AI 调用日志（开发者模式）
  const [aiLogs, setAiLogs] = useState([])  // AI 日志列表
  const [selectedLogIndex, setSelectedLogIndex] = useState(0)  // 当前选中的日志索引
  const [showAiLogModal, setShowAiLogModal] = useState(false)  // 是否显示 AI 日志弹窗
  const [copiedPrompt, setCopiedPrompt] = useState(false)  // Prompt 是否已复制
  const [copiedResponse, setCopiedResponse] = useState(false)  // Response 是否已复制

  // AI 日志弹窗 - 长按复制函数
  const copyTimerRef = useRef(null)
  const handleCopyTouchStart = useCallback((text, setCopied) => {
    copyTimerRef.current = setTimeout(() => {
      if (text && text !== '(无)') {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }).catch(() => {
          const textarea = document.createElement('textarea')
          textarea.value = text
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
    }, 500)
  }, [])
  const handleCopyTouchEnd = useCallback(() => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
  }, [])
  const handleCopyContextMenu = useCallback((text, setCopied) => {
    if (text && text !== '(无)') {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }).catch(() => {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
    }
  }, [])

  // ==================== 加载题目 ====================
  const loadQuestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let rawQuestions = []
      let cName = ''
      let uName = ''
      let detectedParentInfo = null

      // 【检测重做】优先路径：从源记录的 questions 快照
      if (redoFrom) {
        try {
          const snap = await getTestRecordQuestionsSnapshot(redoFrom)
          if (Array.isArray(snap) && snap.length > 0) {
            rawQuestions = snap
            try {
              const parent = await getTestRecord(redoFrom)
              if (parent) {
                cName = parent.categoryName || cName
                uName = parent.unitName || uName
                detectedParentInfo = {
                  parentRecordId: redoFrom,
                  categoryId: parent.categoryId || '',
                  unitId: parent.unitId || '',
                  categoryName: cName,
                  unitName: uName,
                  type: parent.type || mode,
                  redoCount,
                }
              }
            } catch (e2) { console.warn('读取源记录信息失败:', e2) }
          } else {
            console.warn('源记录 questions 为空，回退到常规流程')
          }
        } catch (e) {
          console.warn('从快照加载题目失败，回退到常规流程:', e)
        }
      }

      // 非 redoFrom 路径时获取分类/单元名
      if (rawQuestions.length === 0) {
        if (unitId) {
          try {
            const u = await getUnit(unitId)
            if (u) {
              uName = u.name || ''
              if (u.chapterId) setChapterId(u.chapterId)
            }
          } catch { /* 忽略 */ }
        }
        if (categoryId) {
          try {
            const c = await getCategory(categoryId)
            if (c) cName = c.name || ''
          } catch { /* 忽略 */ }
        }
        if (mode === 'unit' && unitId && !categoryId) {
          try {
            const u = await getUnit(unitId)
            if (u && u.categoryId) {
              const c = await getCategory(u.categoryId)
              if (c) cName = c.name || ''
            }
          } catch { /* 忽略 */ }
        }
      }
      setCategoryName(cName)
      setUnitName(uName)
      if (detectedParentInfo) redoInfoRef.current = detectedParentInfo

      // 常规题目来源（仅 redoFrom 未拿到题目时才进入）
      if (rawQuestions.length === 0) {
        if (mode === 'wrong') {
          // 错题重做：从 Dexie wrongAnswers 表获取错题
          let wrongList = []
          try {
            if (unitId && categoryId) {
              wrongList = await getWrongAnswersByCategoryAndUnit(categoryId, unitId)
            } else if (categoryId) {
              wrongList = await getWrongAnswersByCategory(categoryId)
            } else {
              const wrongData = localStorage.getItem('wrong_questions')
              if (wrongData) {
                try {
                  const parsed = JSON.parse(wrongData)
                  rawQuestions = Array.isArray(parsed) ? parsed : []
                } catch { rawQuestions = [] }
              }
            }
          } catch (e) {
            console.warn('查询错题列表失败:', e)
          }

          if (wrongList.length > 0) {
            const cardIds = wrongList.map(w => w.cardId).filter(Boolean)
            const questionIds = wrongList.map(w => !w.cardId ? w.questionId : null).filter(Boolean)
            let merged = []
            if (cardIds.length > 0) merged = merged.concat(await getTestQuestionsByCardIds(cardIds))
            if (questionIds.length > 0) merged = merged.concat(await getTestQuestionsByIds(questionIds))
            const seenIds = new Set()
            rawQuestions = merged.filter(q => {
              if (!q || !q.id || seenIds.has(q.id)) return false
              seenIds.add(q.id)
              return true
            })
            if (wrongList[0].chapterId) setChapterId(wrongList[0].chapterId)
          }
        } else if (mode === 'unit') {
          rawQuestions = await getTestQuestionsByUnit(unitId)
        } else if (mode === 'category') {
          rawQuestions = await getTestQuestionsByCategory(categoryId)
        } else if (mode === 'chapter') {
          rawQuestions = await getTestQuestionsByChapter(chapterIdParam)
        } else if (mode === 'review') {
          if (unitId) rawQuestions = await getTestQuestionsByUnit(unitId)
          else if (categoryId) rawQuestions = await getTestQuestionsByCategory(categoryId)
        }
      }

      if (!rawQuestions || rawQuestions.length === 0) {
        setQuestions([])
        setLoading(false)
        return
      }

      // 标准化题目数据
      const normalized = rawQuestions.map((q, i) => ({
        id: q.id || `q_${i}`,
        cardId: q.cardId || null,
        chapterId: q.chapterId || '',
        type: q.type || 'single_choice',
        stem: String(q.stem || q.title || ''),
        options: Array.isArray(q.options) ? q.options : [],
        answer: q.answer ?? '',
        analysis: String(q.analysis || q.explanation || ''),
        difficulty: q.difficulty || 3,
        knowledgePoint: String(q.knowledgePoint || q.knowledge_point || ''),
      }))

      // redoFrom 模式下不再按难度筛选（保持与源记录一致）
      let filteredQuestions = normalized
      if (!redoFrom && difficulty !== null && (mode === 'unit' || mode === 'category' || mode === 'chapter')) {
        filteredQuestions = normalized.filter(q => q.difficulty === difficulty)
      }

      // redoFrom 模式下不打乱顺序（保持原题顺序）
      const finalQuestions = redoFrom ? filteredQuestions : shuffleArray(filteredQuestions)
      setQuestions(finalQuestions)
    } catch (err) {
      console.error('加载题目失败:', err)
      setError('加载题目失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [mode, unitId, categoryId, chapterIdParam, difficulty, redoFrom, redoCount])

  useEffect(() => { loadQuestions() }, [loadQuestions])

  // ==================== AI 调用日志加载（开发者模式）====================
  useEffect(() => {
    // 当题目加载完成后（loading 变为 false），如果开发者模式开启且有 AI 日志，则显示弹窗
    if (loading || questions.length === 0) {
      return
    }
    if (!appState.developerMode) {
      return
    }

    // 优先使用从 navigation state 传入的 AI 日志
    if (incomingAiLogs.length > 0) {
      setAiLogs(incomingAiLogs)
      setSelectedLogIndex(0)
      setShowAiLogModal(true)
      return
    }

    // 否则从 sessionStorage 获取日志 ID 列表，再从 localStorage 获取完整日志
    try {
      const logIdsJson = sessionStorage.getItem('lastAiLogIds')
      if (logIdsJson) {
        const logIds = JSON.parse(logIdsJson)
        const allLogs = getAiCallLogs()
        const logMap = new Map(allLogs.map(log => [log.id, log]))
        const aiLogs = logIds.map(id => logMap.get(id)).filter(Boolean)
        if (aiLogs.length > 0) {
          setAiLogs(aiLogs)
          setSelectedLogIndex(0)
          setShowAiLogModal(true)
          sessionStorage.removeItem('lastAiLogIds')
          return
        }
      }
    } catch (e) {
      console.warn('[AI日志] 获取日志失败:', e)
    }
  }, [loading, questions.length, appState.developerMode, incomingAiLogs.length])

  // ==================== 计时器 ====================
  useEffect(() => {
    if (finished || timerPaused) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [finished, timerPaused])

  const toggleTimer = () => {
    if (timerPaused) {
      // 恢复
      if (pausedAtRef.current) {
        startTimeRef.current += Date.now() - pausedAtRef.current
      }
      pausedAtRef.current = null
      setTimerPaused(false)
    } else {
      // 暂停
      pausedAtRef.current = Date.now()
      setTimerPaused(true)
    }
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // ==================== 断点续考 ====================
  const sessionIdRef = useRef(null)
  // userId 兜底：与 AnswerRecordPage 完全一致（uid 字段也作为兜底）
  const userId = appState?.user?.id || appState?.user?.uid || appState?.userId || 'local_user'

  // AI 配置检测（用于判断是否启用增强评分）
  const aiConfig = useMemo(() => ({
    aiServiceMode: appState.aiServiceMode,
    apiKey: appState.apiKey,
    model: appState.model,
    sparkApiKey: appState.iflytekSparkApiKey,
    sparkApiSecret: appState.iflytekSparkApiSecret,
    volcanoApiKey: appState.volcanoApiKey,
    dashscopeApiKey: appState.dashscopeApiKey,
  }), [appState.aiServiceMode, appState.apiKey, appState.model, appState.iflytekSparkApiKey, appState.iflytekSparkApiSecret, appState.volcanoApiKey, appState.dashscopeApiKey])

  const hasAiConfig = useMemo(() => {
    const mode = aiConfig.aiServiceMode || 'deepseek'
    if (mode === 'iflytek-spark') return !!aiConfig.sparkApiKey
    if (mode === 'volcano') return !!aiConfig.volcanoApiKey
    if (mode === 'dashscope') return !!aiConfig.dashscopeApiKey
    return !!aiConfig.apiKey
  }, [aiConfig])
  const typeId = useMemo(() => {
    if (mode === 'unit') return unitId
    if (mode === 'category') return categoryId
    if (mode === 'chapter') return chapterIdParam
    if (mode === 'wrong') return 'wrong'
    if (mode === 'review') return unitId || categoryId || 'review'
    return ''
  }, [mode, unitId, categoryId, chapterIdParam])

  // 页面加载时检测未完成会话
  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getUncompletedTestSession(mode, typeId, userId)
        if (!session || !Array.isArray(session.questions) || session.questions.length === 0) return

        // 校验会话题目是否仍存在于题库中（用户可能已删除题目）
        const sessionQuestionIds = session.questions.map(q => q.id)
        let existingQuestions = []
        if (mode === 'unit') {
          existingQuestions = await getTestQuestionsByUnit(unitId || '')
        } else if (mode === 'category') {
          existingQuestions = await getTestQuestionsByCategory(categoryId || '')
        } else if (mode === 'chapter') {
          existingQuestions = await getTestQuestionsByChapter(chapterIdParam || '')
        }
        const existingIds = new Set(existingQuestions.map(q => q.id))
        const stillExist = sessionQuestionIds.filter(id => existingIds.has(id))
        const removedCount = sessionQuestionIds.length - stillExist.length

        // 如果会话题目全部被删除，自动清理会话，不显示提示
        if (stillExist.length === 0) {
          await deleteTestSession(session.id)
          return
        }

        // 如果有部分题目被删除，过滤掉已删除的题目并调整位置
        if (removedCount > 0) {
          const filteredQuestions = session.questions.filter(q => existingIds.has(q.id))
          session.questions = filteredQuestions
          // 同步更新会话中的 answers（移除已删除题目的答案）
          if (session.answers) {
            const filteredAnswers = {}
            for (const id of stillExist) {
              if (session.answers[id] !== undefined) filteredAnswers[id] = session.answers[id]
            }
            session.answers = filteredAnswers
          }
          // 调整 currentIndex：跳到最近的有效题目
          let adjustedIndex = session.currentIndex || 0
          if (adjustedIndex >= filteredQuestions.length) {
            adjustedIndex = Math.max(0, filteredQuestions.length - 1)
            session.currentIndex = adjustedIndex
          }
          // Toast 提示用户
          showToast(`已移除 ${removedCount} 道已删除题目，剩余 ${stillExist.length} 道`, 'info')
        }

        // URL 参数控制：
        //   resume=continue → 答题记录页确认后跳转，跳过弹窗直接恢复进度
        //   resume=restart  → 答题记录页重新开始，清空进度后由 loadQuestions 加载最新题库
        if (resume === 'continue') {
          sessionIdRef.current = session.id
          setQuestions(session.questions || [])
          setAnswers(session.answers || {})
          setCurrentIndex(typeof session.currentIndex === 'number' ? session.currentIndex : 0)
          setElapsed(typeof session.elapsed === 'number' ? session.elapsed : 0)
          startTimeRef.current = Date.now() - (typeof session.elapsed === 'number' ? session.elapsed : 0) * 1000
          if (session.markedQuestions) setMarkedQuestions(new Set(session.markedQuestions))
          if (session.instantFeedback) setInstantFeedback(!!session.instantFeedback)
          if (session.feedbackMap) setFeedbackMap(session.feedbackMap || {})
          return
        }
        if (resume === 'restart') {
          await clearTestSessionAnswers(session.id)
          sessionIdRef.current = session.id
          return
        }

        sessionIdRef.current = session.id
        setShowResumePrompt(true)
      } catch { /* 无会话 */ }
    }
    if (mode && typeId) {
      checkSession()
    }
  }, [mode, typeId, userId, unitId, categoryId, resume])

  // 跳转到答题记录页，让用户手动选择要继续的测试
  const handleResumeSession = () => {
    setShowResumePrompt(false)
    navigate('/test/answer-records')
  }

  // 放弃之前会话，清空旧进度，留在当前页面从第1题开始答题
  const handleDiscardSession = async () => {
    try {
      if (sessionIdRef.current) {
        await deleteTestSession(sessionIdRef.current)
      }
    } catch { /* ignore */ }
    sessionIdRef.current = null
    setShowResumePrompt(false)
    // 重新加载最新题目（确保题库已更新后的题目），然后重置答题状态
    await loadQuestions()
    setAnswers({})
    setCurrentIndex(0)
    setElapsed(0)
    setMarkedQuestions(new Set())
    setFeedbackMap({})
    startTimeRef.current = Date.now()
  }

  // 自动保存
  const saveCurrentSession = useCallback(async () => {
    if (finished || questions.length === 0) return
    try {
      const sessionData = {
        testType: mode,
        typeId,
        // 冗余保存 unitId / categoryId，便于复习模式从答题记录恢复时精确定位
        unitId: unitId || '',
        categoryId: categoryId || '',
        // 冗余保存分类名和单元名，便于答题记录页直接显示
        categoryName: categoryName || '',
        unitName: unitName || '',
        questions,
        userAnswers: questions.map(q => answers[q.id] || null),
        markedQuestions: [...markedQuestions],
        currentIndex,
        startTime: startTimeRef.current,
        lastSavedAt: Date.now(),
        isCompleted: false,
        elapsed,
        instantFeedback,
        feedbackMap,
        answers,
      }

      if (sessionIdRef.current) {
        await updateTestSession(sessionIdRef.current, sessionData)
      } else {
        const created = await addTestSession(sessionData, userId)
        sessionIdRef.current = created.id
      }
    } catch (err) {
      console.error('自动保存失败:', err)
    }
  }, [finished, questions, answers, currentIndex, elapsed, markedQuestions, instantFeedback, feedbackMap, mode, typeId, unitId, categoryId, categoryName, unitName, userId])

  useEffect(() => {
    autoSaveTimerRef.current = setInterval(saveCurrentSession, AUTO_SAVE_INTERVAL)
    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current) }
  }, [saveCurrentSession])

  // 页面离开时保存
  useEffect(() => {
    const handleBeforeUnload = () => { saveCurrentSession() }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveCurrentSession])

  // ==================== 答题逻辑 ====================
  const currentQuestion = questions[currentIndex] || null

  const handleAnswerChange = useCallback((answerData) => {
    if (!currentQuestion) return
    
    const questionId = currentQuestion.id
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        ...answerData,
        timestamp: Date.now(),
      },
    }))

    // 即时反馈
    if (instantFeedback && currentQuestion) {
      const isCorrect = checkAnswer(currentQuestion, answerData)
      setFeedbackMap(prev => ({
        ...prev,
        [questionId]: {
          isCorrect,
          correctAnswer: currentQuestion.answer,
          explanation: currentQuestion.analysis,
        },
      }))
    }
  }, [currentQuestion, instantFeedback])

  // 判断答案是否正确
  const checkAnswer = (question, userAnswer) => {
    if (!question || !userAnswer) return false
    const qType = (question.type || '').toLowerCase()
    const correctAnswer = String(question.answer ?? '').trim()

    if (qType === 'single_choice' || qType === 'single') {
      // 将 selectedIndex 映射为选项标签再与正确答案比较
      const index = typeof userAnswer.selectedIndex === 'number' ? userAnswer.selectedIndex : -1
      const option = index >= 0 ? (question.options || [])[index] : null
      const selectedLabel = option ? String(option.label || '') : ''
      return selectedLabel === correctAnswer ||
             String(userAnswer.selectedText || '') === correctAnswer
    }
    if (qType === 'multi_choice' || qType === 'multi') {
      // 从用户选择的索引映射为选项字母，排序后拼成纯字母串（如 "ABD"）
      // 与 correctAnswer 的纯字母格式（也排序后）对比
      const selectedLabels = (userAnswer.selectedIndices || [])
        .map(i => {
          const opt = (question.options || [])[i]
          return opt ? String(opt.label || '').trim().toUpperCase() : ''
        })
        .filter(s => /^[A-Z]$/.test(s))
        .sort()
        .join('')
      // 把 correctAnswer 也归一化为纯字母+排序格式
      const normalizedAnswer = (correctAnswer.toUpperCase().match(/[A-Z]/g) || []).sort().join('')
      return selectedLabels === normalizedAnswer
    }
    if (qType === 'fill_blank') {
      const userText = String(userAnswer.answerText || '').trim()
      const expected = correctAnswer.toLowerCase()
      return userText.toLowerCase() === expected
    }
    if (qType === 'true_false' || qType === 'judge') {
      const userVal = userAnswer.answer
      // 用户答案可能是 boolean 或 string
      const userBool = typeof userVal === 'boolean' ? userVal : (String(userVal || '').toLowerCase())
      const userIsTrue = userBool === true || userBool === 'true' || userBool === '正确' || userBool === '对'
      // 正确答案可能是 "true"/"false" (英文) 或 "正确"/"错误" (中文)
      const correctIsTrue = correctAnswer === 'true' || correctAnswer === '正确' || correctAnswer === '对'
      return userIsTrue === correctIsTrue
    }
    return false
  }

  // 提交单个题目
  const handleSubmitSingle = useCallback(() => {
    if (!currentQuestion) return
    const qId = currentQuestion.id
    const userAnswer = answers[qId]
    if (!userAnswer) return

    const isCorrect = checkAnswer(currentQuestion, userAnswer)
    setFeedbackMap(prev => ({
      ...prev,
      [qId]: {
        isCorrect,
        correctAnswer: currentQuestion.answer,
        explanation: currentQuestion.analysis,
      },
    }))
  }, [currentQuestion, answers])

  // 重新作答：从 feedbackMap 中移除该题反馈记录，解锁选项
  const handleRedoQuestion = useCallback((questionId) => {
    if (!questionId) return
    setFeedbackMap(prev => {
      if (!prev[questionId]) return prev
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    showToast('已清除反馈，可重新作答')
  }, [showToast])

  // 全部提交
  const handleSubmitAll = async () => {
    if (submitting) return
    setSubmitting(true)

    try {
      const recordType = mode === 'unit' ? 'unit_test'
        : mode === 'category' ? 'category_test'
        : mode === 'chapter' ? 'chapter_test'
        : mode === 'review' ? 'review'
        : 'wrong'

      // === 自动补全 categoryId ===
      let effectiveCategoryId = categoryId
      let effectiveCategoryName = categoryName
      let effectiveChapterId = chapterId
      let effectiveUnitId = unitId
      let effectiveUnitName = unitName

      if (!effectiveCategoryId && unitId) {
        try {
          const u = await getUnit(unitId)
          if (u) {
            effectiveCategoryId = u.categoryId || ''
            effectiveUnitName = u.name || unitName
            if (u.chapterId) effectiveChapterId = u.chapterId
            if (effectiveCategoryId) {
              const c = await getCategory(effectiveCategoryId)
              if (c) effectiveCategoryName = c.name || ''
            }
          }
        } catch { /* 忽略 */ }
      }
      if (!effectiveCategoryId && questions.length > 0) {
        const qWithCat = questions.find(q => q.categoryId)
        if (qWithCat) effectiveCategoryId = qWithCat.categoryId
      }

      // === 通用：把 gradingResults 转换为显示用的 graded 数组 ===
      const buildGradedForDisplay = (gr) => gr.map(r => {
        const q = questions.find(q => q.id === r.questionId) || {}
        return {
          questionId: r.questionId,
          cardId: r.cardId || null,
          stem: q.stem || q.front || '',
          type: r.type,
          userAnswer: answers[r.questionId] || null,
          correctAnswer: r.correctAnswer || q.answer || '',
          isCorrect: r.isCorrect,
          analysis: r.explanation || q.analysis || '',
          knowledgePoint: q.knowledgePoint || q.knowledge_point || '',
          difficulty: q.difficulty || 'easy',
          score: r.score,
          gradedBy: r.gradedBy || 'local',
        }
      })

      // === 步骤一：快速本地评分，立即展示结果（用户不等待 AI）===
      const localResult = gradeLocalOnly(questions, answers)
      const localGraded = buildGradedForDisplay(localResult.gradingResults)
      const localDisplay = {
        mode, unitId: effectiveUnitId, categoryId: effectiveCategoryId,
        totalQuestions: localResult.totalCount,
        totalCorrect: localResult.correctCount,
        score: localResult.accuracy,
        elapsed,
        graded: localGraded,
        finishedAt: new Date().toISOString(),
        enhanced: false,           // 初始设为本地评分
        pendingAi: hasAiConfig,    // 有 AI 时表示"AI 评卷中"
        weightedScore: localResult.weightedScore,
        maxPossibleScore: localResult.maxPossibleScore,
        weakPoints: localResult.weakPoints || [],
        typeStats: localResult.typeStats || [],
      }
      setResults(localDisplay)
      setFinished(true)

      // 本地评分完成后也先保存一份答题记录，确保用户已得结果不会丢失
      if (!hasAiConfig) {
        const wrongItemsForDb = localGraded.filter(g => !g.isCorrect)
        if (wrongItemsForDb.length > 0 && effectiveCategoryId) {
          for (const w of wrongItemsForDb) {
            const q = questions.find(qq => qq.id === w.questionId)
            const cardId = w.cardId || ''
            const questionType = w.type || ''
            const stem = w.stem || ''
            try {
              await addWrongAnswer(cardId, effectiveCategoryId, questionType, {
                unitId: effectiveUnitId || '',
                chapterId: effectiveChapterId || w.chapterId || q?.chapterId || '',
                categoryName: effectiveCategoryName || '',
                unitName: effectiveUnitName || '',
                stem,
                questionId: w.questionId || '',
              })
            } catch (e) { console.warn('写入错题记录失败:', w.questionId, e.message) }
          }
        }
        if (effectiveCategoryId) {
          const correctItemsForClear = localGraded.filter(g => g.isCorrect)
          for (const c of correctItemsForClear) {
            try {
              await clearWrongAnswer(c.cardId || '', effectiveCategoryId, effectiveUnitId || '', c.questionId || '')
            } catch (e) { console.warn('清除错题记录失败:', c.questionId, e.message) }
          }
        }
        try {
          const parentInfo = redoInfoRef.current
          let finalCategoryId = effectiveCategoryId
          let finalUnitId = effectiveUnitId
          let finalCategoryName = effectiveCategoryName
          let finalUnitName = effectiveUnitName
          let finalType = recordType
          let parentRecordId = null
          let recordRedoCount = 0
          if (parentInfo) {
            finalCategoryId = parentInfo.categoryId || effectiveCategoryId
            finalUnitId = parentInfo.unitId || effectiveUnitId
            finalCategoryName = parentInfo.categoryName || effectiveCategoryName
            finalUnitName = parentInfo.unitName || effectiveUnitName
            finalType = parentInfo.type || recordType
            parentRecordId = parentInfo.parentRecordId
            recordRedoCount = parentInfo.redoCount || 0
          }
          await saveTestRecord({
            userId: userId,
            categoryId: finalCategoryId || '',
            unitId: finalUnitId || '',
            categoryName: finalCategoryName || '',
            unitName: finalUnitName || '',
            totalScore: localResult.accuracy,
            correctCount: localResult.correctCount,
            totalCount: localResult.totalCount,
            timeUsed: elapsed,
            type: finalType,
            parentRecordId,
            redoCount: recordRedoCount,
            questions: questions.map(q => ({
              id: q.id, stem: q.stem, type: q.type, answer: q.answer,
              options: q.options, analysis: q.analysis,
              knowledgePoint: q.knowledgePoint, difficulty: q.difficulty,
            })),
            answers: answers,
            gradingResults: localGraded,
          })
        } catch (e) { console.error('保存答题记录失败:', e) }
        try { if (sessionIdRef.current) await deleteTestSession(sessionIdRef.current) } catch { /* ignore */ }
        setSubmitting(false)
        return
      }

      // === 步骤二：有 AI 配置 → 启动后台任务做增强评卷（在悬浮窗显示进度）===
      setSubmitting(false) // 先释放按钮，让用户看到结果

      startTask({
        type: TASK_TYPE.TEST_GRADING,
        title: 'AI 评卷：正在进行语义分析',
        cancelable: false,
        taskFn: async (updateProgress) => {
          // 真正调用增强评分（带 onProgress 回调）
          const gradingResult = await gradeTest(questions, answers, aiConfig, {
            categoryId: effectiveCategoryId,
            unitId: effectiveUnitId,
            chapterId: effectiveChapterId,
            userId,
            timeUsed: elapsed,
            testType: recordType,
            categoryName: effectiveCategoryName,
            unitName: effectiveUnitName,
            skipWritingWrongAnswers: true,
            onProgress: (percent, detail) => {
              if (typeof updateProgress === 'function') updateProgress(percent, detail)
            },
          })

          const gradedForDisplay = buildGradedForDisplay(gradingResult.gradingResults)
          const enhancedResult = {
            mode, unitId: effectiveUnitId, categoryId: effectiveCategoryId,
            totalQuestions: gradingResult.totalCount,
            totalCorrect: gradingResult.correctCount,
            score: gradingResult.accuracy,
            elapsed,
            graded: gradedForDisplay,
            finishedAt: new Date().toISOString(),
            enhanced: true,
            pendingAi: false,
            weightedScore: gradingResult.weightedScore,
            maxPossibleScore: gradingResult.maxPossibleScore,
            weakPoints: gradingResult.weakPoints || [],
            typeStats: gradingResult.typeStats || [],
            holisticEvaluation: gradingResult.holisticEvaluation || null,
          }

          // 更新 UI 为增强结果
          setResults(enhancedResult)

          // 保存错题与答题记录（以增强结果为准）
          const wrongItemsForDb = gradedForDisplay.filter(g => !g.isCorrect)
          if (wrongItemsForDb.length > 0 && effectiveCategoryId) {
            for (const w of wrongItemsForDb) {
              const q = questions.find(qq => qq.id === w.questionId)
              const cardId = w.cardId || ''
              const questionType = w.type || ''
              const stem = w.stem || ''
              try {
                await addWrongAnswer(cardId, effectiveCategoryId, questionType, {
                  unitId: effectiveUnitId || '',
                  chapterId: effectiveChapterId || w.chapterId || q?.chapterId || '',
                  categoryName: effectiveCategoryName || '',
                  unitName: effectiveUnitName || '',
                  stem,
                  questionId: w.questionId || '',
                })
              } catch (_) { /* ignore */ }
            }
          }
          if (effectiveCategoryId) {
            const correctItemsForClear = gradedForDisplay.filter(g => g.isCorrect)
            for (const c of correctItemsForClear) {
              try {
                await clearWrongAnswer(c.cardId || '', effectiveCategoryId, effectiveUnitId || '', c.questionId || '')
              } catch (_) { /* ignore */ }
            }
          }
          try {
            const parentInfo = redoInfoRef.current
            let finalCategoryId = effectiveCategoryId
            let finalUnitId = effectiveUnitId
            let finalCategoryName = effectiveCategoryName
            let finalUnitName = effectiveUnitName
            let finalType = recordType
            let parentRecordId = null
            let recordRedoCount = 0
            if (parentInfo) {
              finalCategoryId = parentInfo.categoryId || effectiveCategoryId
              finalUnitId = parentInfo.unitId || effectiveUnitId
              finalCategoryName = parentInfo.categoryName || effectiveCategoryName
              finalUnitName = parentInfo.unitName || effectiveUnitName
              finalType = parentInfo.type || recordType
              parentRecordId = parentInfo.parentRecordId
              recordRedoCount = parentInfo.redoCount || 0
            }
            await saveTestRecord({
              userId: userId,
              categoryId: finalCategoryId || '',
              unitId: finalUnitId || '',
              categoryName: finalCategoryName || '',
              unitName: finalUnitName || '',
              totalScore: gradingResult.accuracy,
              correctCount: gradingResult.correctCount,
              totalCount: gradingResult.totalCount,
              timeUsed: elapsed,
              type: finalType,
              parentRecordId,
              redoCount: recordRedoCount,
              questions: questions.map(q => ({
                id: q.id, stem: q.stem, type: q.type, answer: q.answer,
                options: q.options, analysis: q.analysis,
                knowledgePoint: q.knowledgePoint, difficulty: q.difficulty,
              })),
              answers: answers,
              gradingResults: gradedForDisplay,
            })
          } catch (e) { console.error('保存答题记录失败:', e) }

          try { if (sessionIdRef.current) await deleteTestSession(sessionIdRef.current) } catch { /* ignore */ }

          return { totalCount: gradingResult.totalCount, accuracy: gradingResult.accuracy }
        },
      })
    } catch (err) {
      console.error('提交失败:', err)
      setSubmitting(false)
    }
  }

  // ==================== 滑动切换 ====================
  const handleTouchStart = (e) => {
    if (submitting) return
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      isSwiping: false,
    }
  }

  const handleTouchMove = (e) => {
    if (submitting || !touchRef.current.startX) return
    const dx = e.touches[0].clientX - touchRef.current.startX
    const dy = e.touches[0].clientY - touchRef.current.startY
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchRef.current.isSwiping = true
    }
  }

  const handleTouchEnd = (e) => {
    if (submitting || !touchRef.current.isSwiping) return
    const dx = e.changedTouches[0].clientX - touchRef.current.startX
    const threshold = 60

    if (dx < -threshold && currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1)
    } else if (dx > threshold && currentIndex > 0) {
      goToQuestion(currentIndex - 1)
    }

    touchRef.current = { startX: 0, startY: 0, isSwiping: false }
  }

  // ==================== 导航 ====================
  const goToQuestion = useCallback((index) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index)
    }
  }, [questions.length])

  const goNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }, [currentIndex, questions.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [currentIndex])

  // ==================== 标记 ====================
  const toggleMark = useCallback((questionId) => {
    setMarkedQuestions(prev => {
      const next = new Set(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }
      return next
    })
  }, [])

  // ==================== 悬浮窗 ====================
  const handleFloatDragStart = (e) => {
    const touch = e.touches[0]
    floatDragRef.current = {
      dragging: true,
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: floatPos.x,
      offsetY: floatPos.y,
    }
  }

  const handleFloatDragMove = (e) => {
    if (!floatDragRef.current.dragging) return
    const touch = e.touches[0]
    const dx = touch.clientX - floatDragRef.current.startX
    const dy = touch.clientY - floatDragRef.current.startY
    setFloatPos({
      x: Math.max(0, Math.min(window.innerWidth - 280, floatDragRef.current.offsetX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 400, floatDragRef.current.offsetY + dy)),
    })
  }

  const handleFloatDragEnd = () => {
    floatDragRef.current.dragging = false
  }

  // ==================== 完成页面 ====================
  if (finished && results) {
    return (
      <div style={{
        height: '100vh', height: '100dvh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--color-bg)',
      }}>
        {/* 顶部 */}
        <div style={{
          padding: '16px', display: 'flex', alignItems: 'center',
          borderBottom: '1px solid var(--color-border-light)',
          backgroundColor: 'var(--color-surface)',
          gap: '12px',
        }}>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-ghost"
            style={{ minHeight: '44px', minWidth: '44px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, flex: 1 }}>答题结果</h2>
        </div>

        {/* 结果内容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <div style={{
            textAlign: 'center', padding: '24px', marginBottom: '16px',
            backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-light)',
          }}>
            <div style={{
              fontSize: '48px', fontWeight: 700,
              color: results.score >= 60 ? 'var(--color-success)' : 'var(--color-danger)',
              marginBottom: '8px',
            }}>
              {results.score}分
            </div>
            <div style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
              答对 {results.totalCorrect}/{results.totalQuestions} 题 · 用时 {formatTime(results.elapsed)}
              {results.enhanced && results.weightedScore !== undefined && (
                <span> · 加权分 {results.weightedScore}/{results.maxPossibleScore}</span>
              )}
            </div>
          </div>

          {/* 题型统计（增强评分） */}
          {results.enhanced && results.typeStats && results.typeStats.length > 0 && (
            <div style={{
              marginBottom: '16px', padding: '14px',
              backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-light)',
            }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: '10px' }}>题型统计</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {results.typeStats.map((ts, i) => (
                  <div key={i} style={{
                    flex: '1 1 calc(50% - 4px)', minWidth: '120px',
                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{ts.name}</span>
                    <span style={{
                      fontSize: 'var(--text-sm)', fontWeight: 600,
                      color: ts.accuracy >= 60 ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                      {ts.correct}/{ts.total} ({ts.accuracy}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 薄弱知识点（增强评分） */}
          {results.enhanced && results.weakPoints && results.weakPoints.length > 0 && (
            <div style={{
              marginBottom: '16px', padding: '14px',
              backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-light)',
            }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: '10px', color: 'var(--color-warning)' }}>
                薄弱知识点 TOP{results.weakPoints.length}
              </h3>
              {results.weakPoints.map((wp, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 0', borderBottom: i < results.weakPoints.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                }}>
                  <span style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    backgroundColor: i === 0 ? 'var(--color-danger)' : i < 3 ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                    color: '#fff', fontSize: '12px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 'var(--text-sm)', flex: 1, color: 'var(--color-text)' }}>{wp.name}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', fontWeight: 500 }}>错{wp.count}次</span>
                </div>
              ))}
            </div>
          )}

          {/* 错题列表 */}
          {results.graded.filter(g => !g.isCorrect).length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: '12px', color: 'var(--color-danger)' }}>
                错题回顾 ({results.graded.filter(g => !g.isCorrect).length})
              </h3>
              {results.graded.filter(g => !g.isCorrect).map((g, i) => (
                <div key={i} className="card" style={{ marginBottom: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <span className="badge badge-danger" style={{ fontSize: '12px', flexShrink: 0, marginTop: '2px' }}>错误</span>
                    <span style={{
                      fontSize: 'var(--text-sm)', fontWeight: 500, flex: 1, minWidth: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      lineHeight: 1.5,
                    }}>{g.stem}</span>
                  </div>
                  {g.analysis && (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                      解析：{g.analysis}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          padding: '16px', borderTop: '1px solid var(--color-border-light)',
          backgroundColor: 'var(--color-surface)',
          display: 'flex', gap: '12px',
        }}>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: '48px' }}
          >
            返回
          </button>
          <button
            onClick={() => {
              setFinished(false)
              setResults(null)
              setAnswers({})
              setFeedbackMap({})
              setCurrentIndex(0)
              setElapsed(0)
              startTimeRef.current = Date.now()
              setMarkedQuestions(new Set())
              loadQuestions()
            }}
            className="btn btn-primary"
            style={{ flex: 1, minHeight: '48px' }}
          >
            再测一次
          </button>
        </div>
      </div>
    )
  }

  // ==================== 主页面 ====================
  return (
    <div style={{
      height: '100vh', height: '100dvh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      backgroundColor: 'var(--color-bg)',
      fontSize: fontSize ? `${fontSize}px` : 'var(--text-base)',
    }}>
      {/* 断点续考弹窗 */}
      {showResumePrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}>
          <div className="modal-center-panel" style={{ margin: '16px', maxWidth: '360px' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: '8px' }}>检测到未完成的测试</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              您有未完成的{String(modeLabels[mode] || '')}测试，可在答题记录页查看所有未完成的测试后手动继续。
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleDiscardSession}
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: '44px' }}
              >
                继续新测试
              </button>
              <button
                onClick={handleResumeSession}
                className="btn btn-primary"
                style={{ flex: 1, minHeight: '44px' }}
              >
                查看未完成的测试
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 顶部栏 */}
      <div style={{
        padding: '12px 16px',
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--color-border-light)',
        backgroundColor: 'var(--color-surface)',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => {
            if (finished) {
              navigate(-1)
            } else {
              // 退出时保存
              saveCurrentSession()
              navigate(-1)
            }
          }}
          className="btn btn-ghost"
          style={{ minHeight: '44px', minWidth: '44px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(modeLabels[mode] || '答题')}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {questions.length > 0 ? `${currentIndex + 1}/${questions.length}` : '加载中...'}
          </div>
        </div>

        {/* 计时器 - 高频查看信息，保留常驻 */}
        <button
          onClick={toggleTimer}
          className="btn btn-ghost btn-sm"
          style={{
            minHeight: '44px', minWidth: '64px', padding: '6px 8px',
            display: 'flex', alignItems: 'center', gap: '4px',
            fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontSize: 'var(--text-sm)', fontWeight: 600,
            color: 'var(--color-text)',
            flexShrink: 0,
          }}
          title="计时器"
        >
          {timerPaused ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          {formatTime(elapsed)}
        </button>

        {/* 更多菜单 - 收纳即时反馈开关、题目标记，避免窄屏挤压（D-1） */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMoreMenuOpen(o => !o)}
            className="btn btn-ghost btn-sm"
            style={{
              minHeight: '44px', minWidth: '44px', padding: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: moreMenuOpen ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
            title="更多"
            aria-label="更多操作"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {moreMenuOpen && (
            <>
              {/* 点击外部关闭 */}
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setMoreMenuOpen(false)} />
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 999,
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--color-border-light)',
                minWidth: '160px',
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => { setInstantFeedback(prev => !prev); }}
                  style={{
                    width: '100%', minHeight: '44px', padding: '10px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 'var(--text-sm)', color: 'var(--color-text)',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    即时反馈
                  </span>
                  <span style={{
                    width: '36px', height: '20px', borderRadius: '10px',
                    backgroundColor: instantFeedback ? 'var(--color-primary)' : 'var(--color-border)',
                    position: 'relative', transition: 'background-color 0.2s ease',
                  }}>
                    <span style={{
                      position: 'absolute', top: '2px', left: instantFeedback ? '18px' : '2px',
                      width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff',
                      transition: 'left 0.2s ease', boxShadow: 'var(--shadow-sm)',
                    }} />
                  </span>
                </button>
                {currentQuestion && (
                  <button
                    onClick={() => { toggleMark(currentQuestion.id); }}
                    style={{
                      width: '100%', minHeight: '44px', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                      color: markedQuestions.has(currentQuestion.id) ? '#f59e0b' : 'var(--color-text)',
                      fontFamily: 'inherit',
                      borderTop: '1px solid var(--color-border-light)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={markedQuestions.has(currentQuestion.id) ? '#f59e0b' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {markedQuestions.has(currentQuestion.id) ? '取消标记' : '标记题目'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {questions.length > 0 && (
        <div style={{
          height: '3px', backgroundColor: 'var(--color-border-light)',
          flexShrink: 0,
        }}>
          <div style={{
            height: '100%',
            backgroundColor: 'var(--color-primary)',
            width: `${((currentIndex + 1) / questions.length) * 100}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {/* 主内容区 */}
      <div
        ref={cardRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
          WebkitOverflowScrolling: 'touch',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {loading && (
          <div className="empty-state" style={{ minHeight: '300px' }}>
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="empty-state-title">加载中...</div>
          </div>
        )}

        {!loading && error && (
          <div className="empty-state" style={{ minHeight: '300px' }}>
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="empty-state-title">加载失败</div>
            <div className="empty-state-desc">{error}</div>
            <button className="btn btn-primary btn-sm" onClick={loadQuestions} style={{ marginTop: '16px', minHeight: '44px' }}>
              重试
            </button>
          </div>
        )}

        {!loading && !error && questions.length === 0 && (
          <div className="empty-state" style={{ minHeight: '300px' }}>
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="empty-state-title">暂无题目</div>
            <div className="empty-state-desc">请先更新题库</div>
          </div>
        )}

        {!loading && !error && currentQuestion && (
          <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '80px' }}>
            <TestCardItem
              question={currentQuestion}
              selectedAnswer={answers[currentQuestion.id] || null}
              onAnswerChange={handleAnswerChange}
              showFeedback={!!feedbackMap[currentQuestion.id]}
              feedbackResult={feedbackMap[currentQuestion.id] || null}
              disabled={submitting}
              onRedo={() => handleRedoQuestion(currentQuestion.id)}
            />

            {/* 底部操作按钮 */}
            <div style={{
              display: 'flex', gap: '12px', marginTop: '16px',
              flexWrap: 'wrap',
            }}>
              <button
                onClick={goPrev}
                className="btn btn-secondary"
                disabled={currentIndex === 0 || submitting}
                style={{ flex: 1, minHeight: '48px', minWidth: '80px' }}
              >
                上一题
              </button>

              {!instantFeedback && !feedbackMap[currentQuestion.id] && (
                <button
                  onClick={handleSubmitSingle}
                  className="btn btn-primary"
                  disabled={!answers[currentQuestion.id] || submitting}
                  style={{ flex: 1, minHeight: '48px', minWidth: '80px' }}
                >
                  提交
                </button>
              )}

              {/* 下一题 / 结束答题：有答案或即时反馈模式或已提交反馈 → 可用；未作答且非即时反馈 → 禁用并提示 */}
              {currentIndex < questions.length - 1 ? (
                <button
                  onClick={goNext}
                  className="btn btn-primary"
                  disabled={
                    submitting ||
                    // 非即时反馈且未提交且未作答：禁用
                    (!instantFeedback &&
                      !feedbackMap[currentQuestion.id] &&
                      !answers[currentQuestion.id])
                  }
                  style={{ flex: 1, minHeight: '48px', minWidth: '80px' }}
                  title={
                    !instantFeedback &&
                    !feedbackMap[currentQuestion.id] &&
                    !answers[currentQuestion.id]
                      ? '请先选择答案再进入下一题'
                      : ''
                  }
                >
                  下一题
                </button>
              ) : (
                <button
                  onClick={handleSubmitAll}
                  className="btn btn-accent"
                  disabled={submitting}
                  style={{ flex: 1, minHeight: '48px', minWidth: '80px' }}
                >
                  {submitting ? '提交中...' : '结束答题'}
                </button>
              )}
            </div>

            {/* 操作提示：未作答时明确说明，避免"未选择有效选项时提交按钮无法生效"和"下一题按钮在未作答时直接跳转"的困惑 */}
            {!instantFeedback && !feedbackMap[currentQuestion.id] && !answers[currentQuestion.id] && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-warning-light, #fff7e6)',
                color: 'var(--color-warning-dark, #b45309)',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.55,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                请先选择答案，再点击"提交"或"下一题"
              </div>
            )}
          </div>
        )}
      </div>

      {/* 悬浮窗触发按钮 */}
      {questions.length > 0 && !showFloatPanel && (
        <button
          onClick={() => setShowFloatPanel(true)}
          style={{
            position: 'fixed', right: '16px', bottom: '100px',
            zIndex: 100,
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            boxShadow: 'var(--shadow-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            minHeight: '48px', minWidth: '48px',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
      )}

      {/* 悬浮窗 */}
      {showFloatPanel && (
        <>
          {/* 遮罩 */}
          <div
            onClick={() => setShowFloatPanel(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              backgroundColor: 'rgba(0,0,0,0.3)',
            }}
          />

          {/* 悬浮面板 */}
          <div
            ref={floatPanelRef}
            onTouchStart={handleFloatDragStart}
            onTouchMove={handleFloatDragMove}
            onTouchEnd={handleFloatDragEnd}
            style={{
              position: 'fixed',
              zIndex: 201,
              left: `${floatPos.x}px`,
              top: `${floatPos.y}px`,
              width: '280px',
              maxHeight: '400px',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-card)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* 拖动手柄 */}
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--color-border-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'grab',
              backgroundColor: 'var(--color-bg)',
            }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                题目列表
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFloatPanel(false) }}
                className="btn btn-ghost"
                style={{ minHeight: '36px', minWidth: '36px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 题目列表 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px',
              }}>
                {questions.map((q, idx) => {
                  const isAnswered = !!answers[q.id]
                  const isMarked = markedQuestions.has(q.id)
                  const isCurrent = idx === currentIndex
                  const hasFeedback = !!feedbackMap[q.id]
                  const isCorrect = hasFeedback && feedbackMap[q.id]?.isCorrect

                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        goToQuestion(idx)
                        setShowFloatPanel(false)
                      }}
                      style={{
                        minHeight: '44px', minWidth: '44px',
                        padding: '6px',
                        borderRadius: 'var(--radius-md)',
                        border: isCurrent ? '2px solid var(--color-primary)' : '1px solid var(--color-border-light)',
                        backgroundColor: isCurrent
                          ? 'var(--color-primary-light)'
                          : isAnswered
                            ? isCorrect
                              ? 'var(--color-success-light)'
                              : hasFeedback
                                ? 'var(--color-danger-light)'
                                : 'var(--color-surface)'
                            : 'var(--color-surface)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: isCurrent ? 600 : 400,
                        color: isCurrent ? 'var(--color-primary)' : 'var(--color-text)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{idx + 1}</span>
                      {isMarked && (
                        <span style={{ fontSize: '10px', color: '#f59e0b' }}>⭐</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 底部按钮 */}
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--color-border-light)',
            }}>
              <button
                onClick={() => {
                  setShowFloatPanel(false)
                  handleSubmitAll()
                }}
                className="btn btn-danger"
                disabled={submitting}
                style={{ width: '100%', minHeight: '44px' }}
              >
                {submitting ? '提交中...' : '结束答题'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* AI 调用日志弹窗（开发者模式） */}
      {showAiLogModal && aiLogs.length > 0 && (
        <>
          {/* 遮罩 */}
          <div
            onClick={() => setShowAiLogModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          />

          {/* 日志面板 */}
          <div
            style={{
              position: 'fixed',
              zIndex: 301,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '85vh',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* 头部 */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>AI 调用日志</span>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--color-primary)',
                  color: '#fff',
                }}>
                  {aiLogs.length} 次调用
                </span>
              </div>
              <button
                onClick={() => setShowAiLogModal(false)}
                className="btn btn-ghost"
                style={{ minHeight: '36px', minWidth: '36px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 日志选择器（多次调用时显示） */}
            {aiLogs.length > 1 && (
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--color-border-light)',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  选择调用批次：
                </div>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {aiLogs.map((log, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedLogIndex(idx)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        fontSize: 'var(--text-xs)',
                        cursor: 'pointer',
                        flexShrink: 0,
                        backgroundColor: selectedLogIndex === idx ? 'var(--color-primary)' : 'var(--color-bg)',
                        color: selectedLogIndex === idx ? '#fff' : 'var(--color-text)',
                      }}
                    >
                      第 {idx + 1} 次
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 日志内容 */}
            {aiLogs[selectedLogIndex] && (
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
                {/* 调用信息 */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    调用信息
                  </div>
                  <div style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-xs)',
                    lineHeight: 1.6,
                  }}>
                    <div>模型：{getModelLabel(aiLogs[selectedLogIndex].modelName)}</div>
                    <div>耗时：{aiLogs[selectedLogIndex].durationMs}ms</div>
                    <div>状态：{aiLogs[selectedLogIndex].status === 'success' ? '成功' : '失败'}</div>
                    {aiLogs[selectedLogIndex].errorMessage && (
                      <div style={{ color: 'var(--color-danger)' }}>错误：{aiLogs[selectedLogIndex].errorMessage}</div>
                    )}
                  </div>
                </div>

                {/* 输入 */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      输入（Prompt）
                    </div>
                    {copiedPrompt && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>已复制</span>
                    )}
                  </div>
                  <div
                    onTouchStart={() => handleCopyTouchStart(aiLogs[selectedLogIndex].prompt || '', setCopiedPrompt)}
                    onTouchEnd={handleCopyTouchEnd}
                    onContextMenu={() => handleCopyContextMenu(aiLogs[selectedLogIndex].prompt || '', setCopiedPrompt)}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: '150px',
                      overflow: 'auto',
                      cursor: 'pointer',
                      userSelect: 'text',
                    }}
                  >
                    {aiLogs[selectedLogIndex].prompt || '(无)'}
                  </div>
                </div>

                {/* 输出 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      输出（Response）
                    </div>
                    {copiedResponse && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>已复制</span>
                    )}
                  </div>
                  <div
                    onTouchStart={() => handleCopyTouchStart(aiLogs[selectedLogIndex].response || '', setCopiedResponse)}
                    onTouchEnd={handleCopyTouchEnd}
                    onContextMenu={() => handleCopyContextMenu(aiLogs[selectedLogIndex].response || '', setCopiedResponse)}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: '200px',
                      overflow: 'auto',
                      cursor: 'pointer',
                      userSelect: 'text',
                    }}
                  >
                    {aiLogs[selectedLogIndex].response || '(无)'}
                  </div>
                </div>
              </div>
            )}

            {/* 底部按钮 */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--color-border-light)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => setShowAiLogModal(false)}
                className="btn btn-primary"
                style={{ width: '100%', minHeight: '44px' }}
              >
                关闭
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}