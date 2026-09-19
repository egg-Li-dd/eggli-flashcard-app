/**
 * AI 卡片生成流程管理（Flow 模式）
 *
 * 设计原则：
 * - 将复杂的多步骤 AI 调用流程转换为可后台执行的 flow
 * - 在需要用户交互的步骤使用 awaitUserAction 标记为"待操作"
 * - 流程状态通过 BackgroundTaskContext 持久化到 localStorage
 * - 用户点击悬浮窗的"继续操作"按钮后，恢复到对应步骤的界面
 *
 * 流程步骤：
 *   1. 提取原始知识点（AI 调用，自动执行）
 *   2. 知识点预去重（AI 调用，自动执行）
 *   3. 主题聚类（AI 调用，自动执行）→ 等待用户确认
 *   4. 合并摘要 + 分类到单元（AI 调用，自动执行）→ 等待用户确认
 *   5. 卡片预览 → 等待用户确认
 *   6. 保存到数据库（自动执行）
 */

import { extractKnowledgePoints, extractJsonFromAiResponse } from './aiService'
import { getUnitsByCategory, getChaptersByCategory } from './db'
import { clusterKnowledgePointsByTopic } from './aiService'

// ============================================================
// 流程步骤常量
// ============================================================

export const CARD_GEN_STEPS = {
  EXTRACT_KP: 'extract_kp',
  TOPIC_CLUSTER: 'topic_cluster',
  AWAIT_KP_CONFIRM: 'await_kp_confirm',
  AWAIT_TOPIC_CONFIRM: 'await_topic_confirm',
  AWAIT_MERGE_CONFIRM: 'await_merge_confirm',
  AWAIT_PREVIEW: 'await_preview',
  SAVE_TO_DB: 'save_to_db',
  DONE: 'done',
}

export const CARD_GEN_STEP_LABELS = {
  [CARD_GEN_STEPS.EXTRACT_KP]: '提取知识点',
  [CARD_GEN_STEPS.TOPIC_CLUSTER]: '主题聚类',
  [CARD_GEN_STEPS.AWAIT_KP_CONFIRM]: '等待知识点确认',
  [CARD_GEN_STEPS.AWAIT_TOPIC_CONFIRM]: '等待主题确认',
  [CARD_GEN_STEPS.AWAIT_MERGE_CONFIRM]: '等待合并确认',
  [CARD_GEN_STEPS.AWAIT_PREVIEW]: '等待卡片预览',
  [CARD_GEN_STEPS.SAVE_TO_DB]: '保存到数据库',
  [CARD_GEN_STEPS.DONE]: '完成',
}

// ============================================================
// 轻量级过滤工具（与 Category.jsx 中保持一致）
// ============================================================

function filterHeadingLikePoints(points) {
  if (!Array.isArray(points)) return []
  const headingPatterns = [
    /^\s*第[一二三四五六七八九十百0-9]+[章节部分篇讲]/,
    /^\s*[（(【[]第[一二三四五六七八九十百0-9]+[章节】)）]/,
    /^\s*\d+[\.、]\s*\d+\s*$/,
    /^[一二三四五六七八九十]+[、\.]\s*$/,
  ]
  return points.filter(p => {
    if (typeof p !== 'string') return false
    const text = p.trim()
    if (!text) return false
    if (text.length < 4) return false
    return !headingPatterns.some(re => re.test(text))
  })
}

// ============================================================
// Flow 启动函数
// ============================================================

/**
 * 启动 AI 卡片生成流程
 *
 * @param {Object} options
 * @param {string} options.text - 用户输入的文本
 * @param {string} options.categoryId - 分类 ID
 * @param {Object} options.aiConfig - AI 配置（apiKey, model, aiServiceMode 等）
 * @param {Object} options.bgtCtx - BackgroundTaskContext 的 context 对象
 * @param {Function} options.onAwaitKpConfirm - 等待知识点确认时调用（打开 KnowledgePointConfirm 弹窗）
 * @param {Function} options.onAwaitTopicConfirm - 等待主题确认时调用（打开 TopicConfirm 弹窗）
 * @param {Function} options.onAwaitMergeConfirm - 等待合并摘要确认时调用（打开 MergeSummary 弹窗）
 * @param {Function} options.onAwaitPreview - 等待卡片预览时调用（打开 NewCardPreviewPanel）
 * @param {Function} options.onFlowComplete - 流程完成回调
 * @param {Function} options.onFlowFail - 流程失败回调
 * @returns {string} flowId
 */
export function startCardGenerationFlow(options) {
  const {
    text,
    categoryId,
    aiConfig,
    bgtCtx,
    onAwaitKpConfirm,
    onAwaitTopicConfirm,
    onAwaitMergeConfirm,
    onAwaitPreview,
    onFlowComplete,
    onFlowFail,
  } = options

  // 1. 创建 flow
  const flowId = bgtCtx.startFlow({
    type: 'ai_generate_cards',
    title: `生成学习卡片 (${text.slice(0, 30)}${text.length > 30 ? '...' : ''})`,
    initialStep: '准备中',
    initialDescription: '正在初始化卡片生成流程...',
    initialPayload: {
      text,
      categoryId,
      aiConfig,
      step: CARD_GEN_STEPS.EXTRACT_KP,
    },
    onResumeRoute: null, // 由当前步骤决定要打开哪个弹窗
  })

  // 2. 异步执行流程
  runCardGenerationFlow({
    flowId,
    text,
    categoryId,
    aiConfig,
    bgtCtx,
    onAwaitKpConfirm,
    onAwaitTopicConfirm,
    onAwaitMergeConfirm,
    onAwaitPreview,
    onFlowComplete,
    onFlowFail,
  }).catch(err => {
    console.error('[CardGenFlow] 流程异常:', err)
    bgtCtx.failFlow(flowId, String(err?.message || err || '未知错误'))
    if (onFlowFail) onFlowFail(err)
  })

  return flowId
}

// ============================================================
// Flow 执行引擎
// ============================================================

async function runCardGenerationFlow(options) {
  const {
    flowId,
    text,
    categoryId,
    aiConfig,
    bgtCtx,
    onAwaitKpConfirm,
    onAwaitTopicConfirm,
    onAwaitMergeConfirm,
    onAwaitPreview,
    onFlowComplete,
  } = options

  // === Step 1: 提取原始知识点 ===
  bgtCtx.setFlowStep(
    flowId,
    '提取知识点',
    '正在从文本中提取原始知识点...',
    { step: CARD_GEN_STEPS.EXTRACT_KP }
  )
  bgtCtx.setFlowProgress(flowId, 10)

  const existingUnits = await getUnitsByCategory(categoryId)
  const step1Result = await extractKnowledgePoints(
    text,
    existingUnits.map(u => u.name),
    aiConfig,
    (p) => {
      if (p?.progress) {
        bgtCtx.setFlowProgress(flowId, 10 + p.progress * 0.2)
      }
    },
    null // categoryPurpose 会在后续步骤自动生成
  )

  const parsed = extractJsonFromAiResponse(step1Result.content, aiConfig.aiServiceMode)
  let knowledgePoints = []
  if (parsed.json && Array.isArray(parsed.json.knowledge_points)) {
    knowledgePoints = parsed.json.knowledge_points
  } else {
    // 无法解析 JSON，尝试后备方案
    const lines = step1Result.content.split(/\n/).filter(s => s.trim().length > 10)
    if (lines.length > 0) {
      knowledgePoints = lines
    } else {
      throw new Error('AI 返回格式异常（Step 1）')
    }
  }
  if (knowledgePoints.length === 0) {
    throw new Error('未能提取到知识点，请重试')
  }

  // 客户端强过滤：自动识别并移除章节标题类内容
  const filteredPoints = filterHeadingLikePoints(knowledgePoints)
  const removedCount = knowledgePoints.length - filteredPoints.length
  const finalPointsToUse = filteredPoints.length > 0 ? filteredPoints : knowledgePoints

  if (bgtCtx.isFlowCancelled(flowId)) return

  // === Step 2: 等待用户确认知识点 ===
  bgtCtx.setFlowProgress(flowId, 30)
  bgtCtx.awaitUserAction(flowId, {
    title: '请确认知识点',
    message: `已提取 ${finalPointsToUse.length} 个知识点，请在弹窗中编辑并确认`,
    confirmLabel: '继续',
    cancelLabel: '取消',
    actionKey: 'kp_confirm',
  }, {
    step: CARD_GEN_STEPS.AWAIT_KP_CONFIRM,
    kpConfirmList: finalPointsToUse,
    kpExistingUnits: existingUnits,
  })

  // 调用界面：打开知识点确认弹窗
  if (onAwaitKpConfirm) {
    onAwaitKpConfirm(flowId, {
      points: finalPointsToUse,
      existingUnits,
      removedCount,
    })
  }
}

// ============================================================
// 从"知识点确认"继续流程
// ============================================================

export async function resumeFromKpConfirm(options) {
  const {
    flowId,
    bgtCtx,
    editedPoints, // 用户编辑后的知识点列表：[{ text, originalIndex }]
    onAwaitTopicConfirm,
  } = options

  // 1. 恢复 flow 为运行状态，并保存用户编辑结果
  bgtCtx.resumeFlow(flowId, { editedPoints })

  // 2. 继续执行下一个步骤
  const flow = bgtCtx.getFlow(flowId)
  if (!flow) return

  const payload = flow.payload || {}
  const aiConfig = payload.aiConfig
  const categoryId = payload.categoryId

  // === Step 3: 主题聚类 ===
  bgtCtx.setFlowStep(flowId, '主题聚类', '正在对知识点进行主题聚类...', {
    step: CARD_GEN_STEPS.TOPIC_CLUSTER,
  })
  bgtCtx.setFlowProgress(flowId, 40)

  const existingChapters = await getChaptersByCategory(categoryId)
  const pointsToUseStrings = editedPoints.map(p => p.text)

  const topics = await clusterKnowledgePointsByTopic(pointsToUseStrings, aiConfig)

  if (bgtCtx.isFlowCancelled(flowId)) return

  // === Step 4: 等待用户确认主题分组 ===
  bgtCtx.setFlowProgress(flowId, 60)
  bgtCtx.awaitUserAction(flowId, {
    title: '请确认主题分组',
    message: `已将知识点聚类为 ${topics?.length || 0} 个主题`,
    confirmLabel: '继续',
    cancelLabel: '取消',
    actionKey: 'topic_confirm',
  }, {
    step: CARD_GEN_STEPS.AWAIT_TOPIC_CONFIRM,
    topics,
    editedPoints,
    existingChapters,
    existingUnits: payload.kpExistingUnits || [],
  })

  if (onAwaitTopicConfirm) {
    onAwaitTopicConfirm(flowId, { topics, editedPoints, existingChapters })
  }
}

// ============================================================
// 从"主题确认"继续流程
// ============================================================

export async function resumeFromTopicConfirm(options) {
  const {
    flowId,
    bgtCtx,
    topics, // 用户确认后的主题数据
    editedPoints,
    onAwaitMergeConfirm,
  } = options

  bgtCtx.resumeFlow(flowId, { confirmedTopics: topics })

  const flow = bgtCtx.getFlow(flowId)
  if (!flow) return

  const payload = flow.payload || {}
  const aiConfig = payload.aiConfig

  // === Step 5: 合并摘要 / 生成卡片（此处为简化版，实际调用会在组件中处理）===
  bgtCtx.setFlowStep(flowId, '合并摘要', '正在生成合并摘要和卡片...', {
    step: CARD_GEN_STEPS.AWAIT_MERGE_CONFIRM,
  })
  bgtCtx.setFlowProgress(flowId, 80)

  // 这里调用 generateCardsFromKnowledgePoints（实际上由 topicConfirmConfig.aiConfig 决定）
  // 我们在 Category.jsx 中已经有相关逻辑，此处简化为标记为"等待合并摘要确认"

  bgtCtx.awaitUserAction(flowId, {
    title: '请确认合并摘要',
    message: '正在准备合并摘要数据',
    confirmLabel: '继续',
    cancelLabel: '取消',
    actionKey: 'merge_confirm',
  }, {
    step: CARD_GEN_STEPS.AWAIT_MERGE_CONFIRM,
    topics,
    editedPoints,
  })

  if (onAwaitMergeConfirm) {
    onAwaitMergeConfirm(flowId, { topics, editedPoints, aiConfig })
  }
}

// ============================================================
// 从"合并摘要确认"继续流程 - 进入卡片预览
// ============================================================

export function resumeFromMergeConfirm(options) {
  const { flowId, bgtCtx, flatNewCards, unitDataList, onAwaitPreview } = options

  bgtCtx.resumeFlow(flowId, { flatNewCards, unitDataList })

  // === Step 6: 等待用户确认卡片预览 ===
  bgtCtx.setFlowStep(flowId, '卡片预览', '请在弹窗中确认生成的卡片', {
    step: CARD_GEN_STEPS.AWAIT_PREVIEW,
  })
  bgtCtx.setFlowProgress(flowId, 90)

  bgtCtx.awaitUserAction(flowId, {
    title: '请确认卡片预览',
    message: '请在弹窗中编辑并确认卡片',
    confirmLabel: '保存',
    cancelLabel: '取消',
    actionKey: 'preview_confirm',
  }, {
    step: CARD_GEN_STEPS.AWAIT_PREVIEW,
    flatNewCards,
    unitDataList,
  })

  if (onAwaitPreview) {
    onAwaitPreview(flowId, { flatNewCards, unitDataList })
  }
}

// ============================================================
// 从"卡片预览确认"继续流程 - 保存到数据库
// ============================================================

export function resumeFromPreview(options) {
  const { flowId, bgtCtx, onFlowComplete } = options

  bgtCtx.setFlowStep(flowId, '保存到数据库', '正在将卡片保存到数据库...', {
    step: CARD_GEN_STEPS.SAVE_TO_DB,
  })
  bgtCtx.setFlowProgress(flowId, 100)
  bgtCtx.completeFlow(flowId, { success: true })

  if (onFlowComplete) onFlowComplete()
}

// ============================================================
// 取消流程
// ============================================================

export function cancelCardGenerationFlow(flowId, bgtCtx) {
  bgtCtx.cancelFlow(flowId)
}

// ============================================================
// 从 flow.payload 中恢复到当前步骤的界面
// ============================================================

/**
 * 根据当前流程的步骤，确定应该打开哪个界面
 * @param {Object} flow - flow 对象
 * @returns {string} 步骤标识（kp_confirm / topic_confirm / merge_confirm / preview_confirm / null）
 */
export function getCurrentStepAction(flow) {
  if (!flow || !flow.payload) return null
  const step = flow.payload.step
  switch (step) {
    case CARD_GEN_STEPS.AWAIT_KP_CONFIRM:
      return 'kp_confirm'
    case CARD_GEN_STEPS.AWAIT_TOPIC_CONFIRM:
      return 'topic_confirm'
    case CARD_GEN_STEPS.AWAIT_MERGE_CONFIRM:
      return 'merge_confirm'
    case CARD_GEN_STEPS.AWAIT_PREVIEW:
      return 'preview_confirm'
    default:
      return null
  }
}

/**
 * 获取当前步骤中 awaitingAction 的信息
 */
export function getCurrentAwaitingAction(flow) {
  return flow?.awaitingAction || null
}
