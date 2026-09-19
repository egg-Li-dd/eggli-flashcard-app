import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { generateId } from '../utils/helpers'

/**
 * 后台任务 & 流程管理系统
 * - tasks: 一次性后台任务（如同步、准备复习）
 * - flows: 长流程任务（如 AI 生成卡片、背诵复习），支持步骤状态、
 *          等待用户操作、持久化到 localStorage、可恢复到完整界面
 */

const BackgroundTaskContext = createContext(null)

export const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

export const TASK_TYPE = {
  QUESTION_BANK_UPDATE: 'question_bank_update',
  QUESTION_BANK_COMPLETE: 'question_bank_complete',
  QUESTION_BANK_RANDOM: 'question_bank_random',
  REVIEW_PREP: 'review_prep',
  DATA_SYNC: 'data_sync',
  CARD_GENERATION: 'card_generation',
  CARD_CLASSIFICATION: 'card_classification',
  TEST_GRADING: 'test_grading',
  MODEL_DOWNLOAD: 'model_download',
}

export const TASK_TYPE_LABELS = {
  [TASK_TYPE.QUESTION_BANK_UPDATE]: '更新题库',
  [TASK_TYPE.QUESTION_BANK_COMPLETE]: '补全题库',
  [TASK_TYPE.QUESTION_BANK_RANDOM]: '随机难度补全',
  [TASK_TYPE.REVIEW_PREP]: '准备复习',
  [TASK_TYPE.DATA_SYNC]: '数据同步',
  [TASK_TYPE.TEST_GRADING]: 'AI 评卷',
  [TASK_TYPE.MODEL_DOWNLOAD]: '下载模型',
}

export const TASK_STATUS_LABELS = {
  [TASK_STATUS.PENDING]: '等待中',
  [TASK_STATUS.RUNNING]: '进行中',
  [TASK_STATUS.COMPLETED]: '已完成',
  [TASK_STATUS.FAILED]: '失败',
  [TASK_STATUS.CANCELLED]: '已取消',
}

/**
 * 流程（flow）状态常量
 * - running: 进行中
 * - awaiting_action: 等待用户操作（用户点击"待操作"恢复到完整界面）
 * - completed: 已完成
 * - failed: 异常中断
 * - cancelled: 已取消
 */
export const FLOW_STATUS = {
  RUNNING: 'running',
  AWAITING_ACTION: 'awaiting_action',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

export const FLOW_STATUS_LABELS = {
  [FLOW_STATUS.RUNNING]: '进行中',
  [FLOW_STATUS.AWAITING_ACTION]: '待操作',
  [FLOW_STATUS.COMPLETED]: '已完成',
  [FLOW_STATUS.FAILED]: '异常中断',
  [FLOW_STATUS.CANCELLED]: '已取消',
}

/**
 * 流程类型
 * - ai_generate_cards: AI 生成卡片流程
 * - memorize_review: 背诵/复习流程
 * - card_classification: 卡片分类/整理流程
 */
export const FLOW_TYPES = {
  AI_GENERATE_CARDS: 'ai_generate_cards',
  MEMORIZE_REVIEW: 'memorize_review',
  CARD_CLASSIFICATION: 'card_classification',
}

export const FLOW_TYPE_LABELS = {
  [FLOW_TYPES.AI_GENERATE_CARDS]: 'AI 生成卡片',
  [FLOW_TYPES.MEMORIZE_REVIEW]: '背诵/复习',
  [FLOW_TYPES.CARD_CLASSIFICATION]: '卡片整理',
}

export function BackgroundTaskProvider({ children }) {
  const [tasks, setTasks] = useState([])
  const [flows, setFlows] = useState([])
  const cancelTokensRef = useRef(new Map())
  const taskPromisesRef = useRef(new Map())
  const flowCancelTokensRef = useRef(new Map())
  const FLOWS_PERSIST_KEY = 'bg_flows_state_v1'

  // 初始化：从 localStorage 恢复
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FLOWS_PERSIST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setFlows(parsed)
        }
      }
    } catch (_) {
      // 忽略解析错误
    }
  }, [])

  // 持久化：每次 flows 变化都写回 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FLOWS_PERSIST_KEY, JSON.stringify(flows))
    } catch (_) {
      // 忽略写入错误
    }
  }, [flows])

  /** ============== TASKS: 原有一次性任务（保持兼容） ============== */

  const startTask = useCallback((options) => {
    const { type, title, cancelable = true, taskFn } = options
    const taskId = generateId()
    const startTime = Date.now()

    const cancelToken = { cancelled: false }
    cancelTokensRef.current.set(taskId, cancelToken)

    const newTask = {
      id: taskId,
      type,
      title,
      status: TASK_STATUS.PENDING,
      progress: 0,
      detail: '',
      startTime,
      endTime: null,
      result: null,
      error: null,
      cancelable,
    }
    setTasks(prev => [...prev, newTask])

    const updateProgress = (progress, detail) => {
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t
        return {
          ...t,
          status: TASK_STATUS.RUNNING,
          progress: Math.min(100, Math.max(0, progress)),
          detail: detail !== undefined ? String(detail) : t.detail,
        }
      }))
    }

    const isCancelled = () => cancelToken.cancelled

    const promise = (async () => {
      try {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: TASK_STATUS.RUNNING } : t
        ))

        const result = await taskFn(updateProgress, isCancelled)

        if (isCancelled()) {
          setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, status: TASK_STATUS.CANCELLED, endTime: Date.now() } : t
          ))
          return { cancelled: true }
        }

        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: TASK_STATUS.COMPLETED, progress: 100, endTime: Date.now(), result } : t
        ))
        return { success: true, result }
      } catch (error) {
        if (isCancelled()) {
          setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, status: TASK_STATUS.CANCELLED, endTime: Date.now() } : t
          ))
          return { cancelled: true }
        }
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: TASK_STATUS.FAILED, error: error?.message || '未知错误', endTime: Date.now() } : t
        ))
        return { success: false, error: error?.message || '未知错误' }
      } finally {
        cancelTokensRef.current.delete(taskId)
        taskPromisesRef.current.delete(taskId)
      }
    })()

    taskPromisesRef.current.set(taskId, promise)
    return { taskId, promise }
  }, [])

  const cancelTask = useCallback((taskId) => {
    const token = cancelTokensRef.current.get(taskId)
    if (token) token.cancelled = true
  }, [])

  const removeTask = useCallback((taskId) => {
    setTasks(prev => prev.filter(t => {
      if (t.id !== taskId) return true
      return t.status === TASK_STATUS.RUNNING || t.status === TASK_STATUS.PENDING
    }))
  }, [])

  const clearFinishedTasks = useCallback(() => {
    setTasks(prev => prev.filter(t =>
      t.status === TASK_STATUS.RUNNING || t.status === TASK_STATUS.PENDING
    ))
  }, [])

  const getTaskPromise = useCallback((taskId) => {
    return taskPromisesRef.current.get(taskId)
  }, [])

  const stats = {
    total: tasks.length,
    running: tasks.filter(t => t.status === TASK_STATUS.RUNNING || t.status === TASK_STATUS.PENDING).length,
    completed: tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
    failed: tasks.filter(t => t.status === TASK_STATUS.FAILED).length,
  }

  /** ============== FLOWS: 流程状态机（新增） ============== */

  /**
   * 创建并启动一个流程
   * @param {Object} options
   * @param {string} options.type - FLOW_TYPES 之一
   * @param {string} options.title - 流程标题
   * @param {string} [options.initialStep] - 初始步骤名
   * @param {string} [options.initialDescription] - 初始步骤描述
   * @param {Object} [options.initialPayload] - 初始 payload（将被持久化）
   * @param {string} [options.onResumeRoute] - 用户点击"待操作"时应跳转到的路由
   * @param {boolean} [options.cancelable=true] - 是否可取消
   */
  const startFlow = useCallback((options) => {
    const {
      type,
      title,
      initialStep = '初始化',
      initialDescription = '',
      initialPayload = {},
      onResumeRoute = '',
      cancelable = true,
    } = options

    const flowId = generateId()
    const startTime = Date.now()

    const cancelToken = { cancelled: false }
    flowCancelTokensRef.current.set(flowId, cancelToken)

    const flow = {
      id: flowId,
      type,
      title,
      status: FLOW_STATUS.RUNNING,
      progress: 0,
      currentStep: {
        name: initialStep,
        description: initialDescription,
      },
      steps: [{ name: initialStep, description: initialDescription, time: startTime }],
      payload: initialPayload,
      awaitingAction: null, // 当流程等待用户操作时：{ title, message, confirmLabel, cancelLabel }
      onResumeRoute,
      cancelable,
      error: null,
      result: null,
      createdAt: startTime,
      updatedAt: startTime,
    }

    setFlows(prev => [...prev, flow])
    return flowId
  }, [])

  /**
   * 更新流程状态（通用方法）
   */
  const updateFlow = useCallback((flowId, patch) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      return { ...f, ...patch, updatedAt: now }
    }))
  }, [])

  /**
   * 推进流程到新步骤（记录到 history/steps，并更新 currentStep）
   */
  const setFlowStep = useCallback((flowId, stepName, stepDescription, payloadPatch) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      return {
        ...f,
        currentStep: {
          name: stepName,
          description: stepDescription || f.currentStep.description,
        },
        steps: [...f.steps, { name: stepName, description: stepDescription, time: now }],
        payload: payloadPatch ? { ...f.payload, ...payloadPatch } : f.payload,
        status: FLOW_STATUS.RUNNING,
        awaitingAction: null,
        updatedAt: now,
      }
    }))
  }, [])

  /**
   * 更新流程进度（0-100）
   */
  const setFlowProgress = useCallback((flowId, progress, detail) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      const newPayload = detail !== undefined ? { ...f.payload, detail } : f.payload
      return {
        ...f,
        progress: Math.min(100, Math.max(0, progress)),
        payload: newPayload,
        updatedAt: now,
      }
    }))
  }, [])

  /**
   * 标记流程为"等待用户操作"状态
   * 当流程到达某个需要人工决策/审阅的节点时（如 AI 生成卡片后的预览确认）
   * 就调用此方法，让悬浮窗显示醒目的"待操作"按钮
   *
   * @param {string} flowId
   * @param {Object} awaitingInfo
   * @param {string} awaitingInfo.title - 主标题（如：等待确认卡片）
   * @param {string} awaitingInfo.message - 详细描述
   * @param {string} awaitingInfo.confirmLabel - 按钮文案
   * @param {string} awaitingInfo.cancelLabel - 取消按钮文案
   * @param {Object} [payloadPatch] - 追加到 flow.payload 的数据（例如生成的卡片预览）
   */
  const awaitUserAction = useCallback((flowId, awaitingInfo, payloadPatch) => {
    if (!awaitingInfo) return
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      return {
        ...f,
        status: FLOW_STATUS.AWAITING_ACTION,
        awaitingAction: {
          title: awaitingInfo.title || awaitingInfo.message || '等待你的操作',
          message: awaitingInfo.message || '',
          confirmLabel: awaitingInfo.confirmLabel || '继续',
          cancelLabel: awaitingInfo.cancelLabel || '取消',
        },
        payload: payloadPatch ? { ...f.payload, ...payloadPatch } : f.payload,
        updatedAt: now,
      }
    }))
  }, [])

  /**
   * 完成流程（状态 = completed，progress = 100）
   */
  const completeFlow = useCallback((flowId, result) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      return {
        ...f,
        status: FLOW_STATUS.COMPLETED,
        progress: 100,
        awaitingAction: null,
        result: result || f.result,
        updatedAt: now,
      }
    }))
    flowCancelTokensRef.current.delete(flowId)
  }, [])

  /**
   * 标记流程失败
   */
  const failFlow = useCallback((flowId, errorMessage) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      return {
        ...f,
        status: FLOW_STATUS.FAILED,
        awaitingAction: null,
        error: errorMessage || '未知错误',
        updatedAt: now,
      }
    }))
    flowCancelTokensRef.current.delete(flowId)
  }, [])

  /**
   * 取消流程
   */
  const cancelFlow = useCallback((flowId) => {
    const token = flowCancelTokensRef.current.get(flowId)
    if (token) token.cancelled = true
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      return {
        ...f,
        status: FLOW_STATUS.CANCELLED,
        awaitingAction: null,
        updatedAt: Date.now(),
      }
    }))
    flowCancelTokensRef.current.delete(flowId)
  }, [])

  /**
   * 移除已结束的流程（已完成/失败/取消的）
   */
  const removeFlow = useCallback((flowId) => {
    setFlows(prev => prev.filter(f => {
      if (f.id !== flowId) return true
      return f.status === FLOW_STATUS.RUNNING || f.status === FLOW_STATUS.AWAITING_ACTION
    }))
  }, [])

  /**
   * 清除所有已结束的流程
   */
  const clearFinishedFlows = useCallback(() => {
    setFlows(prev => prev.filter(f =>
      f.status === FLOW_STATUS.RUNNING || f.status === FLOW_STATUS.AWAITING_ACTION
    ))
  }, [])

  /**
   * 查询是否已被取消（用于流程内部的异步任务）
   */
  const isFlowCancelled = useCallback((flowId) => {
    const token = flowCancelTokensRef.current.get(flowId)
    return token ? token.cancelled : false
  }, [])

  /**
   * 重试失败的流程
   * 重置流程状态为 running，重新创建 cancel token，并在 payload 中标记 retry
   * 调用方需监听 flow 状态变化，当 payload.retry === true 时重新执行流程逻辑
   */
  const retryFlow = useCallback((flowId) => {
    // 重新创建 cancel token
    const cancelToken = { cancelled: false }
    flowCancelTokensRef.current.set(flowId, cancelToken)

    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      return {
        ...f,
        status: FLOW_STATUS.RUNNING,
        progress: 0,
        error: null,
        awaitingAction: null,
        currentStep: { name: '重试中', description: '正在重新启动任务...' },
        steps: [...f.steps, { name: '重试中', description: '正在重新启动任务...', time: now }],
        payload: { ...f.payload, retry: true },
        updatedAt: now,
      }
    }))
  }, [])

  /**
   * 恢复流程：从"待操作"状态切换回"进行中"
   * 在用户点击"继续操作"按钮后调用，让流程继续执行
   *
   * @param {string} flowId
   * @param {Object} [payloadPatch] - 追加到 flow.payload 的数据（如用户的选择/编辑结果）
   */
  const resumeFlow = useCallback((flowId, payloadPatch) => {
    setFlows(prev => prev.map(f => {
      if (f.id !== flowId) return f
      const now = Date.now()
      return {
        ...f,
        status: FLOW_STATUS.RUNNING,
        awaitingAction: null,
        payload: payloadPatch ? { ...f.payload, ...payloadPatch } : f.payload,
        updatedAt: now,
      }
    }))
  }, [])

  /**
   * 查找指定类型的活跃流程（用于恢复到完整界面）
   */
  const getFlow = useCallback((flowId) => {
    return flows.find(f => f.id === flowId) || null
  }, [flows])

  /**
   * 查找指定类型的活跃流程
   */
  const getActiveFlowByType = useCallback((type) => {
    return flows.find(f =>
      f.type === type &&
      (f.status === FLOW_STATUS.RUNNING || f.status === FLOW_STATUS.AWAITING_ACTION)
    ) || null
  }, [flows])

  // flows 统计信息
  const flowStats = {
    total: flows.length,
    running: flows.filter(f => f.status === FLOW_STATUS.RUNNING).length,
    awaitingAction: flows.filter(f => f.status === FLOW_STATUS.AWAITING_ACTION).length,
    completed: flows.filter(f => f.status === FLOW_STATUS.COMPLETED).length,
    failed: flows.filter(f => f.status === FLOW_STATUS.FAILED).length,
  }

  const value = {
    tasks,
    stats,
    startTask,
    cancelTask,
    removeTask,
    clearFinishedTasks,
    getTaskPromise,
    // flows: 长流程状态机
    flows,
    flowStats,
    startFlow,
    updateFlow,
    setFlowStep,
    setFlowProgress,
    awaitUserAction,
    resumeFlow,
    completeFlow,
    failFlow,
    cancelFlow,
    removeFlow,
    clearFinishedFlows,
    isFlowCancelled,
    retryFlow,
    getFlow,
    getActiveFlowByType,
  }

  return (
    <BackgroundTaskContext.Provider value={value}>
      {children}
    </BackgroundTaskContext.Provider>
  )
}

export function useBackgroundTask() {
  const ctx = useContext(BackgroundTaskContext)
  if (!ctx) {
    throw new Error('useBackgroundTask 必须在 BackgroundTaskProvider 内使用')
  }
  return ctx
}
