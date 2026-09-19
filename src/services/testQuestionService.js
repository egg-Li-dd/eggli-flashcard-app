import { generateId, simpleTextSimilarity, extractJsonFromAiResponse } from '../utils/helpers'
import {
  TEST_QUESTION_GENERATION_PROMPT,
  TEST_QUESTION_GENERATION_PROMPT_LITE,
  TEST_TYPES,
  LITE_QUESTION_TYPES,
  LITE_COMMON_RULES,
  LITE_BATCH_SIZE,
  STRONG_MODEL_STRATEGY,
  STRONG_TYPE_GROUPS,
  STRONG_DEFAULT_BATCH_SIZE,
} from '../utils/constants'
import { generateTestQuestions } from './aiService'
import { logAiCall, resolveModelName, getAiCallLogs } from './aiCallLog'
import {
  getCardsByUnit,
  getCardsByChapter,
  getAllCardsByCategory,
  getCardStatusesByCategory,
  getTestQuestions,
  getTestQuestionsByUnit,
  getTestQuestionsByCategory,
  addTestQuestions,
  deleteTestQuestion,
  updateTestQuestion,
  addManualTestQuestion,
  getCategory,
} from './db'

// ===== 常量 =====
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000]
const SIMILARITY_THRESHOLD = 0.85
const MAX_QUESTIONS_CATEGORY = 100
const MAX_PER_KP_UNIT = 3
const MAX_PER_KP_CATEGORY = 2

// ===== 分类上下文构建 =====
// 将分类名称 + 分类目的拼接为 prompt 段落，注入到出题 prompt 中
// 让 AI 依据分类信息生成符合该学习场景的题目
function buildCategoryContext(categoryName, categoryPurpose) {
  const name = String(categoryName || '').trim()
  const purpose = String(categoryPurpose || '').trim()
  if (!name && !purpose) return ''
  let ctx = '\n【分类信息】'
  if (name) ctx += `\n- 分类名称：${name}`
  if (purpose) ctx += `\n- 分类目的：${purpose}`
  ctx += '\n请根据上述分类信息生成符合该学习场景的题目，题目的考查重点、难度取向和表述风格应契合该分类的学习目标。'
  return ctx
}

// ===== 错误分类 =====
function classifyError(error) {
  const msg = String(error?.message || '')
  if (msg.includes('超时') || msg.includes('timeout') || msg.includes('Timeout')) {
    return { type: 'timeout', message: 'AI 调用超时，请检查网络后重试' }
  }
  if (msg.includes('429') || msg.includes('限流') || msg.includes('rate limit')) {
    return { type: 'rate_limit', message: 'AI 调用频率过高，请稍后重试' }
  }
  if (msg.includes('格式') || msg.includes('parse') || msg.includes('JSON')) {
    return { type: 'format_error', message: 'AI 返回格式异常，请重试' }
  }
  if (msg.includes('401') || msg.includes('认证失败') || msg.includes('invalid authentication') || msg.includes('Unauthorized')) {
    return { type: 'auth', message: 'Spark: 认证失败，请检查 APIPassword 是否正确' }
  }
  if (msg.includes('403') || msg.includes('Forbidden') || msg.includes('权限')) {
    return { type: 'auth', message: 'AI 服务拒绝访问，请检查权限配置' }
  }
  if (msg.includes('未填写 APIPassword') || msg.includes('未填写 API Key')) {
    return { type: 'auth', message: msg }
  }
  if (msg.includes('500') || msg.includes('503') || msg.includes('Internal Server Error')) {
    return { type: 'server', message: 'AI 服务暂时不可用，请稍后重试' }
  }
  return { type: 'unknown', message: 'AI 调用失败：' + (msg || '未知错误') }
}

// ===== 指数退避重试 =====
async function withRetry(fn, retries = MAX_RETRIES) {
  let lastError = null
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // 按错误类型决定是否重试
      const classified = classifyError(err)
      // 认证错误（401/403）不重试，直接抛出
      if (classified.type === 'auth') {
        console.warn(`[withRetry] 认证错误，跳过重试: ${classified.message}`)
        throw err
      }
      if (i < retries - 1) {
        // 限流错误（429）加倍退避
        const baseDelay = RETRY_DELAYS[i] || 4000
        const delay = classified.type === 'rate_limit' ? baseDelay * 2 : baseDelay
        console.warn(`[withRetry] 第${i + 1}次失败(${classified.type})，${delay}ms 后重试: ${err?.message || err}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

// ===== 构建 AI 提示词 =====
function buildPrompt(cards, statusMap, existingQuestions, testType, isSparkLite = false, cardMarkerMap = null, categoryName = '', categoryPurpose = '') {
  const maxPerKp = testType === TEST_TYPES.UNIT ? MAX_PER_KP_UNIT : MAX_PER_KP_CATEGORY
  const maxTotal = testType === TEST_TYPES.UNIT ? cards.length * 2 : MAX_QUESTIONS_CATEGORY

  // Spark Lite 简化提示词约 600 字符，剩余上下文可容纳约 50 张卡片
  const maxCards = isSparkLite ? 50 : Infinity
  const maxExistingQuestions = isSparkLite ? 20 : Infinity
  const cardTextLimit = isSparkLite ? 100 : 120

  // 按掌握状态分组（四级优先级：未掌握 > 待掌握 > 学习中 > 已掌握）
  const unmastered = []   // 未掌握 (new)
  const toMaster = []     // 待掌握 (review)
  const learning = []     // 学习中 (learning)
  const mastered = []     // 已掌握 (mastered)
  for (const card of cards) {
    const status = statusMap[card.id] || 'new'
    const item = {
      id: card.id,
      knowledgePoint: card.knowledge_point || '',
      front: String(card.front || '').slice(0, cardTextLimit),
      back: String(card.back || '').slice(0, cardTextLimit),
      status,
    }
    if (status === 'new') {
      unmastered.push(item)
    } else if (status === 'review') {
      toMaster.push(item)
    } else if (status === 'learning') {
      learning.push(item)
    } else {
      mastered.push(item)
    }
  }

  // Spark Lite 截断：只取优先组的前若干张
  const capGroup = (list, cap) => list.length <= cap ? list : list.slice(0, cap)

  // 构建已有题目详情（完整数据，供 AI 参考）
  const buildExistingQuestionsBlock = () => {
    if (existingQuestions.length === 0) return '【已有题库】（暂无题目，全部需要新出）'
    const lines = existingQuestions.map((q, i) => {
      const typeLabel = { single_choice: '单选', multi_choice: '多选', true_false: '判断', fill_blank: '填空' }[q.type] || q.type
      const opts = Array.isArray(q.options) && q.options.length > 0
        ? ' | 选项:' + q.options.map(o => (o.label || '') + '.' + (o.text || '')).join(' ; ')
        : ''
      return '  题目' + (i + 1) + ' [' + typeLabel + ']: ' + String(q.stem || '').slice(0, 150) + opts + ' | 答案:' + String(q.answer || '').slice(0, 80)
    })
    return '【已有题库】（共 ' + existingQuestions.length + ' 道，你可以从中选取合适的题目直接复用，或参考它们避免出重复题）：\n' +
      lines.slice(0, maxExistingQuestions).join('\n') + 
      (lines.length > maxExistingQuestions ? '\n  ...（还有 ' + (lines.length - maxExistingQuestions) + ' 道已省略）' : '')
  }

  // 构建卡片内容
  const buildCardLines = (list, label) => {
    const capped = capGroup(list, maxCards)
    if (capped.length === 0) return ''
    const totalLabel = (list.length !== capped.length) ? `（共${list.length}张，仅展示前${capped.length}张）` : `(${list.length} 张卡片)`
    return '【' + label + '】' + totalLabel + '：\n' +
      capped.map((c, i) => {
        const marker = cardMarkerMap ? (cardMarkerMap.get(String(c.id)) || `标记${i + 1}`) : `标记${i + 1}`
        return '  卡片' + (i + 1) + ' [mk=' + marker + ']: 知识点="' + c.knowledgePoint + '" | 问题="' + c.front + '" | 答案="' + c.back + '"'
      }).join('\n')
  }

  // 弱模型（Spark Lite）使用简化版提示词，节省上下文
  const basePrompt = isSparkLite ? TEST_QUESTION_GENERATION_PROMPT_LITE : TEST_QUESTION_GENERATION_PROMPT

  // 分类上下文（分类名称 + 分类目的），作为出题必要参数
  const categoryContext = buildCategoryContext(categoryName, categoryPurpose)

  let prompt = basePrompt + '\n\n' +
    '当前检测类型：' + (testType === TEST_TYPES.UNIT ? '单元检测' : '分类检测') + '\n' +
    '每个知识点最多出题数：' + maxPerKp + ' 道\n' +
    '本次最多生成题目数：' + maxTotal + ' 道\n' +
    (categoryContext || '') + '\n\n' +
    (isSparkLite
      ? '【重要】以下是本地已有题库，仅供你参考、避免生成重复题目。' +
        '你必须为每张卡片生成全新的题目，不要复用已有题目。\n\n'
      : '【重要】以下是本地已有题库，你可以直接从中选择合适的题目复用（保持原样输出），' +
        '也可以参考它们来生成不重复的新题目。优先从本地题库中选取与知识点匹配的高质量题目，' +
        '不足部分再新出题目补充。\n\n') +
    buildExistingQuestionsBlock() + '\n\n' +
    buildCardLines(unmastered, '未掌握卡片（优先出题）') + '\n' +
    buildCardLines(toMaster, '待掌握卡片') + '\n' +
    buildCardLines(learning, '学习中卡片') + '\n' +
    buildCardLines(mastered, '已掌握卡片（仅出 1 道巩固题）')

  // 使用标记方案时，追加cardId指令
  if (cardMarkerMap) {
    prompt += '\n\n【重要】每道题必须包含 cardId 字段，值为输入卡片中的 [mk=标记N]'
  }

  // 2026-06-23 覆盖输出格式：要求表格而非 JSON（表格解析更稳定，单行出错不影响其他题）
  prompt += '\n\n【重要·输出格式覆盖】以上 JSON 格式说明作废，请改用 Markdown 表格输出。\n表头（必须完全一致）：\n| type | stem | A | B | C | D | answer | cardId | diff | analysis |\n|------|------|---|---|---|---|--------|--------|------|----------|\n题型简称：single=单选, multi=多选, judge=判断, fill=填空\n- 选择题：A/B/C/D 列填选项内容\n- 判断题：A/B/C/D 列留空，answer 填"正确"或"错误"\n- 填空题：A/B/C/D 列留空，answer 填填空答案\n只返回 Markdown 表格，不要 JSON、不要解释。'

  return prompt
}

// ===== 2026-06-20 并发任务运行器（多批次同时运行） =====
// 使用 Promise.allSettled + 并发槽（semaphore）控制同时运行的任务数
// 优点：
//   1. 充分利用网络并发，减少整体生成时间
//   2. 单任务失败不影响其它任务
//   3. 通过 concurrency 限制避免触发 API 限流
//   4. onProgress 回调以"完成数/总数"形式报告进度（无论完成顺序）
//
// @param tasks  任意数组（每个元素作为 execute 的第一个参数）
// @param execute(task): Promise<{ok, result, error}>
// @param options { concurrency, onProgress, label, minIntervalMs }
//   - minIntervalMs：相邻两次调用之间强制等待的毫秒数（防触发速率限制）
export async function runTasksConcurrently(tasks, execute, options = {}) {
  const { concurrency = 3, onProgress = null, label = 'task', minIntervalMs = 0 } = options
  const total = tasks.length
  if (total === 0) {
    return { completed: [], failed: [], total }
  }

  let doneCount = 0
  const results = []
  const errors = []
  let nextSlotAt = 0

  async function runOne(task, index) {
    // 简易速率限制：确保与上一次调用之间至少间隔 minIntervalMs
    if (minIntervalMs > 0) {
      const now = Date.now()
      const waitUntil = nextSlotAt
      if (waitUntil > now) {
        await new Promise(resolve => setTimeout(resolve, waitUntil - now))
      }
      nextSlotAt = Date.now() + minIntervalMs
    }

    try {
      const r = await execute(task, index)
      results.push({ task, index, result: r, error: null })
    } catch (err) {
      errors.push({ task, index, error: err })
      results.push({ task, index, result: null, error: err })
    } finally {
      doneCount += 1
      if (typeof onProgress === 'function') {
        try { onProgress({ done: doneCount, total, label, index }) } catch (_) { /* ignore */ }
      }
    }
  }

  const realConcurrency = Math.max(1, Math.min(Number(concurrency) || 3, total))

  // 若并发 = 1，走串行路径（与原逻辑一致，便于排查）
  if (realConcurrency === 1) {
    for (let i = 0; i < tasks.length; i++) {
      await runOne(tasks[i], i)
    }
  } else {
    // 并发槽：用一组"worker" Promise 拉任务
    let cursor = 0
    const workers = []
    for (let w = 0; w < realConcurrency; w++) {
      workers.push((async () => {
        while (true) {
          const i = cursor++
          if (i >= tasks.length) return
          await runOne(tasks[i], i)
        }
      })())
    }
    await Promise.all(workers)
  }

  // 按 index 排序恢复顺序（便于与之前串行逻辑对比输出）
  results.sort((a, b) => a.index - b.index)
  return {
    results,
    completed: results.filter(r => r.error === null),
    failed: results.filter(r => r.error !== null),
    total,
  }
}

// ===== 2026-06-15 弱模型多次小批量调用策略 =====
// 经验：讯飞星火 Spark Lite 等小模型对超长/多约束 prompt 遵循度低，
// 一次大批量调用容易产出畸形题目（label 用判断词/状态词、选项是知识点标签等）。
// 改为按"题型 × 卡片批次"多次小批量调用：每次只生成 1 种题型的 1-5 张卡片题目。
// 优点：每批输入小、约束聚焦，弱模型更易遵循；单批失败不影响其它批。

// 检测当前配置是否为"弱模型"（需要走多次小批量调用策略）
// 已知弱模型：讯飞星火 lite（免费版）
export function isWeakModel(config) {
  if (!config) return false
  if (config.aiServiceMode === 'iflytek-spark') {
    const m = (config.sparkModel || 'lite').toLowerCase()
    return m === 'lite' || m === 'spark-lite'
  }
  return false
}

// 检测当前配置是否为"强模型"（可走省 token 多次小批量策略）
// 已知强模型：DeepSeek / 讯飞星火 Pro 系列 / 豆包 / 千问
// 弱模型（Spark Lite）不算强模型，继续走 generateQuestionsForWeakModel
export function isStrongModel(config) {
  if (!config) return false
  const mode = config.aiServiceMode
  if (mode === 'deepseek' || mode === 'volcano' || mode === 'dashscope') return true
  if (mode === 'iflytek-spark') {
    const m = (config.sparkModel || 'generalv3').toLowerCase()
    // lite 走弱模型；其它（generalv3/pro-128k/max-32k/4.0Ultra 等）走强模型
    return m !== 'lite' && m !== 'spark-lite'
  }
  return false
}

// 把一批卡片格式化为 prompt 中的"输入卡片"段落
// 限制 text 长度 + 必要字段（id/知识点/问题/答案），精简到最少信息
// cardMarkerMap: 可选，cardId → 标记 的映射表，用于弱模型标记方案
function formatCardsForLiteBatch(cards, textLimit = 80, cardMarkerMap = null) {
  return cards.map((c, i) => {
    const id = c.id || `card_${i + 1}`
    const marker = cardMarkerMap ? (cardMarkerMap.get(String(id)) || `标记${i + 1}`) : `标记${i + 1}`
    const kp = c.knowledge_point || c.knowledgePoint || '未分类'
    const front = String(c.front || '').slice(0, textLimit)
    const back = String(c.back || '').slice(0, textLimit)
    return `  卡片${i + 1} [mk=${marker}]: 知识点="${kp}" | 问题="${front}" | 答案="${back}"`
  }).join('\n')
}

// 构建"单题型 + 单批卡片"的简化 prompt
// options 可包含 { existingQuestions, matrix }，二者择一或同时使用：
//   - matrix：来自 analyzeQuestionMatrix，包含"该 batch 内每张卡已有同 type 题"信息
//   - existingQuestions：兼容旧签名，按 type 全局取前 5 条作为"避免重复"参考
// 拼接策略：
//   1) 先用 matrix 输出"已有题目"段（per-card 精确告知），若有再追加"全局参考"段
//   2) 没有 matrix 时退回"全局前 5 条"逻辑
//   3) 即便都为空，也明确告诉 AI"暂无已有同类题"避免被默认"假设已存在"误导
function buildLitePromptByType(cardBatch, questionType, options = {}) {
  const tmplEntry = LITE_QUESTION_TYPES.find(t => t.type === questionType)
  if (!tmplEntry) throw new Error(`[buildLitePromptByType] 不支持的题型: ${questionType}`)

  // 兼容旧的 (cardBatch, type, existingQuestions) 签名
  const matrix = (options && options.matrix) || null
  const existingQuestions = (options && options.existingQuestions) || []
  const cardMarkerMap = (options && options.cardMarkerMap) || null
  const categoryName = (options && options.categoryName) || ''
  const categoryPurpose = (options && options.categoryPurpose) || ''
  const difficulty = (options && options.difficulty) || null

  const cardCount = cardBatch.length
  const cardsText = formatCardsForLiteBatch(cardBatch, undefined, cardMarkerMap)

  // 分类上下文（分类名称 + 分类目的），作为出题必要参数
  const categoryContext = buildCategoryContext(categoryName, categoryPurpose)

  // 已有题库信息拼接：优先用 matrix 的 per-card 精确信息
  let existingText = ''

  if (matrix) {
    const perCardText = formatExistingQuestionsForBatch(cardBatch, matrix, questionType)
    if (perCardText) {
      existingText += '\n【已有同类题目（按卡片精确提示）】\n' +
        '以下卡片在该题型下已有题目，请不要再为它们生成同题型题（直接跳过）：\n' +
        perCardText
    }
  }

  // 兼容旧签名：用 existingQuestions 取该题型的前 5 条作为"全局参考"
  const existing = Array.isArray(existingQuestions) ? existingQuestions : []
  const existingOfType = existing.filter(q => String(q.type || '').toLowerCase() === questionType).slice(0, 5)
  if (existingOfType.length > 0) {
    existingText += '\n【已有同类题目（全局参考，避免题面重复）】\n' +
      existingOfType.map((q, i) =>
        `  已有题${i + 1}: ${String(q.stem || '').slice(0, 80)}`
      ).join('\n')
  }

  if (!existingText) {
    existingText = '\n【已有同类题目】暂无（该题型下没有已生成的题目，可以放心出新题）'
  }

  // 模板占位符替换：先替换 ${CARDS}，再追加 existingText
  let prompt = tmplEntry.template
    .replace(/\$\{CARD_COUNT\}/g, String(cardCount))
    .replace(/\$\{COMMON_RULES\}/g, LITE_COMMON_RULES)
    .replace(/\$\{CARDS\}/g, cardsText)

  // 难度约束（与强模型统一标尺 1-3）
  const DIFFICULTY_DESC = {
    1: '简易：考查基础概念和定义，直接来自知识点原文',
    2: '中等：考查理解和应用能力，需要简单推理',
    3: '困难：考查综合分析和深度理解，需要多知识点关联',
  }
  const difficultyText = difficulty != null
    ? `\n【难度要求】${DIFFICULTY_DESC[difficulty] || '中等难度'}\n每道题必须包含 difficulty 字段，值为 ${difficulty}（1=简易，2=中等，3=困难）`
    : ''

  // 在 prompt 末尾（"只返回 Markdown 表格，不要解释。"前）插入难度约束 + 已有题库段 + 分类上下文
  // 兼容所有 4 个模板（它们的最后一句都是"只返回 Markdown 表格，不要解释。"）
  const TAIL_MARK = '只返回 Markdown 表格，不要解释。'
  const tailInjection = (difficultyText ? difficultyText + '\n\n' : '') + (categoryContext ? categoryContext + '\n\n' : '') + existingText + '\n\n'
  if (prompt.includes(TAIL_MARK)) {
    prompt = prompt.replace(TAIL_MARK, tailInjection + TAIL_MARK)
  } else {
    prompt = prompt + (difficultyText ? '\n' + difficultyText : '') + (categoryContext ? '\n' + categoryContext : '') + existingText
  }

  return prompt
}

// ===== 2026-06-15 本地题目矩阵分析 =====
// 目的：分类检测卡片数可达 100+，本地已有题库可能已包含部分 (cardId × type) 组合。
//       直接全部让 AI 出题会导致：
//       ① 重复出题（同一 card 已有 single_choice，又让 AI 出 1 道）
//       ② token 浪费（让 AI 出不需要的题）
//       ③ 题目"撞车"概率升高
// 思路：先用本地题库构建"题目矩阵"，决定每个 (card, type) 还需要不需要生成，
//       再按矩阵生成任务清单，让 buildLitePromptByType 把"已有题目"显式告诉 AI。

// 每张卡片每种题型每种难度的题量上限（>=1 即视为已"出齐"）
// 每个知识点最大 12 道题 = 4 种题型 × 3 种难度
const MAX_QUESTIONS_PER_CARD_TYPE_DIFFICULTY = 1
// 每张卡片每种题型的总上限 = 3 种难度 × 1 道/难度
const MAX_QUESTIONS_PER_CARD_TYPE = MAX_QUESTIONS_PER_CARD_TYPE_DIFFICULTY * 3

/**
 * 分析本地题库与待生题卡片的"题目矩阵"（支持难度维度）
 * @param {Array} cards 待生题的卡片数组
 * @param {Array} existingQuestions 本地已有题目（已过滤掉过期的）
 * @param {number|undefined} targetDifficulty 目标难度（1=简易, 2=中等, 3=困难），undefined 表示不限难度
 * @returns {{
 *   byCardTypeDiff: Map<string, Map>,       // cardId -> Map<type_difficulty, count>
 *   byCardStems: Map<string, Object>,       // cardId -> { type: [stems] } 用于 prompt 嵌入"已有题目"
 *   needCombosByCard: Map<string, Array>,   // cardId -> [{ type, difficulty }, ...] 该 card 还缺哪些 (type, difficulty) 组合
 *   totalByTypeDiff: Object,                // { type_difficulty: count } 本地题库总量按题型+难度分布
 *   totalCount: number                      // 本地题目总数
 * }}
 */
export function analyzeQuestionMatrix(cards, existingQuestions, targetDifficulty = undefined) {
  const byCardTypeDiff = new Map()
  const byCardStems = new Map()
  const totalByTypeDiff = {}
  let totalCount = 0

  const exList = Array.isArray(existingQuestions) ? existingQuestions : []
  for (const q of exList) {
    const cardId = String(q.cardId || '').trim()
    const type = String(q.type || '').toLowerCase()
    const diff = Number(q.difficulty) || 2
    if (!type) continue

    const typeDiffKey = `${type}_${diff}`
    totalByTypeDiff[typeDiffKey] = (totalByTypeDiff[typeDiffKey] || 0) + 1
    totalCount++

    if (!cardId) continue
    if (!byCardTypeDiff.has(cardId)) byCardTypeDiff.set(cardId, new Map())
    if (!byCardStems.has(cardId)) byCardStems.set(cardId, {})
    
    const ctMap = byCardTypeDiff.get(cardId)
    const stMap = byCardStems.get(cardId)
    
    ctMap.set(typeDiffKey, (ctMap.get(typeDiffKey) || 0) + 1)
    
    if (!stMap[type]) stMap[type] = []
    if (q.stem) stMap[type].push(String(q.stem).slice(0, 80))
  }

  const allTypes = LITE_QUESTION_TYPES.map(t => t.type)
  const allDifficulties = targetDifficulty != null ? [targetDifficulty] : [1, 2, 3]
  
  const needCombosByCard = new Map()
  for (const card of cards) {
    const cid = String(card.id || '').trim()
    if (!cid) continue
    const have = byCardTypeDiff.get(cid) || new Map()
    const need = []
    
    for (const t of allTypes) {
      for (const d of allDifficulties) {
        const key = `${t}_${d}`
        const haveCount = have.get(key) || 0
        if (haveCount < MAX_QUESTIONS_PER_CARD_TYPE_DIFFICULTY) {
          need.push({ type: t, difficulty: d })
        }
      }
    }
    needCombosByCard.set(cid, need)
  }

  // 兼容别名：旧调用方引用 matrix.byCardType / matrix.needTypesByCard
  // byCardType: Map<cardId, { type: count }>（按题型汇总，忽略难度维度）
  // needTypesByCard: Map<cardId, [type]>（去重的题型列表）
  // 使用 getter 惰性计算，不改变现有调用方代码
  // 注意：type 本身可能含下划线（如 single_choice），key 格式为 `${type}_${diff}`
  // 因此用正则去掉末尾的 _数字 来还原 type
  const typeFromKey = (key) => key.replace(/_\d+$/, '')
  const compatByCardType = () => {
    const m = new Map()
    for (const [cid, ctMap] of byCardTypeDiff) {
      const obj = {}
      for (const [key, cnt] of ctMap) {
        const type = typeFromKey(key)
        obj[type] = (obj[type] || 0) + cnt
      }
      m.set(cid, obj)
    }
    return m
  }
  const compatNeedTypesByCard = () => {
    const m = new Map()
    for (const [cid, combos] of needCombosByCard) {
      const types = [...new Set(combos.map(c => c.type))]
      m.set(cid, types)
    }
    return m
  }

  // 兼容别名：把 totalByTypeDiff 按题型汇总（忽略难度维度）
  const compatTotalByType = () => {
    const obj = {}
    for (const [key, cnt] of Object.entries(totalByTypeDiff)) {
      const type = typeFromKey(key)
      obj[type] = (obj[type] || 0) + cnt
    }
    return obj
  }

  return {
    byCardTypeDiff, byCardStems, needCombosByCard, totalByTypeDiff, totalCount,
    // 兼容别名（惰性 getter，旧调用方 matrix.byCardType / matrix.needTypesByCard / matrix.totalByType 可直接使用）
    get byCardType() { return compatByCardType() },
    get needTypesByCard() { return compatNeedTypesByCard() },
    get totalByType() { return compatTotalByType() },
  }
}

// 检测某个 (card 集合, type, difficulty) 是否"全部已出齐"（新接口，支持难度维度）
function isBatchTypeDifficultySatisfied(cardBatch, type, difficulty, matrix) {
  for (const card of cardBatch) {
    const cid = String(card.id || '').trim()
    if (!cid) continue
    const need = matrix.needCombosByCard.get(cid) || []
    if (need.some(c => c.type === type && c.difficulty === difficulty)) return false
  }
  return true
}

// 兼容旧接口：检测某个 (card 集合, type) 是否"全部已出齐"
function isBatchTypeSatisfied(cardBatch, type, matrix) {
  for (const card of cardBatch) {
    const cid = String(card.id || '').trim()
    if (!cid) continue
    const need = matrix.needCombosByCard?.get(cid) || matrix.needTypesByCard?.get(cid) || []
    if (matrix.needCombosByCard) {
      if (need.some(c => c.type === type)) return false
    } else {
      if (need.includes(type)) return false
    }
  }
  return true
}

// 把某个 batch 的"已有题目"信息格式化为 prompt 段落
// 用于 buildLitePromptByType 嵌入到 prompt 末尾作为"避免重复"参考
function formatExistingQuestionsForBatch(cardBatch, matrix, questionType) {
  const lines = []
  for (const card of cardBatch) {
    const cid = String(card.id || '').trim()
    if (!cid) continue
    const stemsByType = matrix.byCardStems.get(cid) || {}
    const typeStems = stemsByType[questionType] || []
    if (typeStems.length === 0) continue
    // 截取 stem 前 60 字符，避免 prompt 过长
    const stems = typeStems.slice(0, 3).map(s => `"${s}"`).join(' / ')
    lines.push(`  卡片 [id=${cid}]: 已有 ${questionType} 题 ${typeStems.length} 道（${stems}），不要再出该题型`)
  }
  return lines.join('\n')
}

// ===== 2026-06-15 强模型省 token 任务清单构造 =====
// 复用 analyzeQuestionMatrix：跳过"已出齐"的 (card, type)
// 强模型按"题型组合"分批：选择题组（single+multi） / 简化题组（true_false+fill_blank）
// 任务格式：{ batchIdx, cardBatch, types, mode }
//   - types: 该批要出的题型数组（1-2 个）
//   - mode: 'multi_type' 表示该 prompt 出多种题型
// @param {Object} matrix - analyzeQuestionMatrix 返回值
// @param {Array} cards - 已按状态优先级排序的卡片
// @param {Object} strategy - { batchSize, maxTypesPerBatch }
// @returns {Object} { tasks: [{ batchIdx, cardBatch, types, mode }], skipped: { byType, empty } }
export function buildStrongModelTasks(matrix, cards, strategy, targetDifficulty = null) {
  const allTypes = LITE_QUESTION_TYPES.map(t => t.type)
  const allDifficulties = targetDifficulty !== null ? [targetDifficulty] : [1, 2, 3]
  const batches = chunkCards(cards, strategy.batchSize || STRONG_DEFAULT_BATCH_SIZE)
  const tasks = []
  const skipped = { byType: {}, empty: 0 }
  const maxTypes = strategy.maxTypesPerBatch || 2

  // 2026-06-20 优化：按难度递进迭代，每个难度阶段独立构造任务
  // 优点：① 确保每张卡片每种题型每种难度都有题 ② Prompt 明确指定难度 ③ 进度可按阶段追踪
  for (const currentDifficulty of allDifficulties) {
    batches.forEach((batch, batchIdx) => {
      const needTypesInBatch = []

      for (const t of allTypes) {
        // 矩阵精确跳过：检查该 batch 是否还需要该 (type, currentDifficulty)
        if (!isBatchTypeDifficultySatisfied(batch, t, currentDifficulty, matrix)) {
          needTypesInBatch.push(t)
        }
      }

      if (needTypesInBatch.length === 0) {
        skipped.empty++
        return
      }

      if (maxTypes >= 4) {
        tasks.push({ batchIdx, cardBatch: batch, types: needTypesInBatch, mode: 'multi_type', difficulty: currentDifficulty })
      } else if (maxTypes >= 2) {
        for (const group of STRONG_TYPE_GROUPS) {
          const groupTypes = needTypesInBatch.filter(t => group.types.includes(t))
          if (groupTypes.length > 0) {
            tasks.push({ batchIdx, cardBatch: batch, types: groupTypes, mode: 'multi_type', difficulty: currentDifficulty })
          }
        }
      } else {
        for (const t of needTypesInBatch) {
          tasks.push({ batchIdx, cardBatch: batch, types: [t], mode: 'multi_type', difficulty: currentDifficulty })
        }
      }
    })
  }

  return { tasks, skipped }
}

// ===== 2026-06-15 强模型多题型精简 prompt =====
// 强模型能处理多题型同时出题，但仍聚焦 1-2 个题型
// 与弱模型（buildLitePromptByType）不同点：
//   - 强模型只展示需要的题型约束（不展示其它 4 种）
//   - 强模型硬约束更精简（不再 5 条全列）
//   - 输出格式支持对象 { single_choice: [...], multi_choice: [...] }
//     和数组 [{...}, {...}] 两种（parseMultiTypeResponse 兼容）
export function buildStrongModelPrompt(cardBatch, types, options = {}) {
  const matrix = (options && options.matrix) || null
  const existingQuestions = (options && options.existingQuestions) || []
  const cardMarkerMap = (options && options.cardMarkerMap) || null
  const targetDifficulty = (options && options.difficulty) || null
  const categoryName = (options && options.categoryName) || ''
  const categoryPurpose = (options && options.categoryPurpose) || ''
  const cardCount = cardBatch.length
  const cardsText = formatCardsForLiteBatch(cardBatch, 100, cardMarkerMap)

  // 分类上下文（分类名称 + 分类目的），作为出题必要参数
  const categoryContext = buildCategoryContext(categoryName, categoryPurpose)

  const DIFFICULTY_DESCRIPTIONS = {
    1: '简易：考查基础概念和定义，直接来自知识点原文，选项干扰性低',
    2: '中等：考查理解和应用能力，需要简单推理，选项有一定干扰性',
    3: '困难：考查综合分析和深度理解，需要多知识点关联，选项干扰性强',
  }

  const TYPE_RULES = {
    single_choice: '单选题：4 个选项 A-D，只 1 个正确；题干必须含问号或疑问词',
    multi_choice: '多选题：4 个选项 A-D，2-4 个正确；题干末含"（多选题）"或"可多选"；答案用字母连写如 "ABD"',
    true_false: '判断题：固定 2 选项 "正确"/"错误"；answer 用中文；题干以"判断以下说法是否正确："开头；必须约一半为"正确"、一半为"错误"，不能全是"正确"',
    fill_blank: '填空题：options=[]；题干用 ____ 标记挖空位置；answer 填被挖空内容',
  }
  const typesRules = types.map(t => `【${t}】${TYPE_RULES[t] || ''}`).join('\n')

  const difficultyText = targetDifficulty != null
    ? `\n【难度要求】${DIFFICULTY_DESCRIPTIONS[targetDifficulty] || '中等难度'}
每道题必须包含 difficulty 字段，值为 ${targetDifficulty}（1=简易，2=中等，3=困难）`
    : ''

  const COMMON_RULES = `【通用约束】
1. label 严格按各题型规则（选择题 A-D，判断题 "正确"/"错误"）
2. text 必须是完整陈述句，禁止知识点标签/状态词/判断词
3. 每道题必须包含 cardId 字段，值为输入卡片中的 [mk=标记N]
4. 输出 Markdown 表格，每行一道题${difficultyText}

【输出格式（Markdown 表格，严格遵循）】
表头（必须完全一致）：
| type | stem | A | B | C | D | answer | cardId | diff | analysis |

题型简称：single=单选, multi=多选, judge=判断, fill=填空
- 选择题：A/B/C/D 列填选项内容
- 判断题：A/B/C/D 列留空，answer 填"正确"或"错误"
- 填空题：A/B/C/D 列留空，answer 填填空答案
- 选项内容含 | 时用 \\| 转义

【表格示例】
| type | stem | A | B | C | D | answer | cardId | diff | analysis |
|------|------|---|---|---|---|--------|--------|------|----------|
| single | 下列哪个是RAM的特点？ | 断电数据丢失 | 断电数据保存 | 容量大于硬盘 | 速度低于硬盘 | A | 标记1 | 2 | RAM是易失性存储器 |
| multi | 以下哪些属于考研科目？（多选题） | 政治 | 英语 | 数学 | 专业课 | ABC | 标记2 | 3 | 三门为公共课 |
| judge | 判断以下说法是否正确：RAM断电后数据会丢失。 | | | | | 正确 | 标记3 | 1 | RAM是易失性存储器 |
| fill | RAM断电后数据会____。 | | | | | 被清空 | 标记4 | 2 | RAM是易失性存储器 |`

  // matrix 段（per-card 精确提示）
  let existingText = ''
  if (matrix) {
    for (const t of types) {
      const perCardText = formatExistingQuestionsForBatch(cardBatch, matrix, t)
      if (perCardText) {
        existingText += `\n【${t} 已有题目（按卡片精确提示）】\n${perCardText}\n`
      }
    }
  }

  // existingQuestions 全局参考段（兼容）
  if (Array.isArray(existingQuestions) && existingQuestions.length > 0) {
    const filtered = existingQuestions
      .filter(q => types.includes(String(q.type || '').toLowerCase()))
      .slice(0, 5)
    if (filtered.length > 0) {
      existingText += `\n【全局参考】\n${filtered.map((q, i) => `  已有题${i + 1}: ${String(q.stem || '').slice(0, 80)}`).join('\n')}\n`
    }
  }
  if (!existingText) {
    existingText = '\n【已有同类题目】暂无（可以放心出新题）'
  }

  return `你是一个出题助手。请根据提供的 ${cardCount} 张学习卡片，生成以下题型的题目。

【输出题型】
${typesRules}

${COMMON_RULES}
${categoryContext}

【输入卡片】
${cardsText}
${existingText}

只返回 Markdown 表格，不要解释、不要 JSON、不要代码块标记。`
}

// ===== 2026-06-15 强模型多题型返回解析 =====
// 强模型可能返回 2 种格式：
//   A) 对象 { single_choice: [...], multi_choice: [...] }
//   B) 数组 [{...}, {...}]（每题带 type 字段）
// 同时 AI 可能夹杂 Markdown 代码块标记或说明文字，复用 extractJsonFromAiResponse
// @param {string} rawText - AI 返回的原始文本
// @param {Array<string>} types - 该任务期望的题型列表（备用，主要靠 AI 自填 type）
// @returns {Array} 解析后的题目数组（每个含 type 字段）
export function parseMultiTypeResponse(rawText, types = []) {
  if (!rawText || typeof rawText !== 'string') return []

  // 2026-06-23 优先尝试表格解析（比 JSON 更稳定）
  const tableQuestions = parseTableResponse(rawText)
  if (tableQuestions && tableQuestions.length > 0) {
    return tableQuestions
  }

  // 回退到 JSON 解析
  // 强模型主要走 DeepSeek/Spark Pro/豆包/千问，无 spark 模式；aiServiceMode 留空
  // 复用 extractJsonFromAiResponse 容错提取（支持代码块、说明文字）
  let extracted = extractJsonFromAiResponse(rawText, '')
  // 宽松回退：严格模式解析失败时，尝试 Spark 宽松模式（支持单引号、多个独立 JSON 对象等）
  if (!extracted || !extracted.json) {
    console.warn('[parseMultiTypeResponse] 表格和严格 JSON 解析均失败，尝试宽松回退，原始内容前200字符：', String(rawText).slice(0, 200))
    extracted = extractJsonFromAiResponse(rawText, 'iflytek-spark')
  }
  if (!extracted || !extracted.json) return []

  // 格式 A：对象 { type: [questions] }
  if (!Array.isArray(extracted.json) && typeof extracted.json === 'object') {
    const questions = []
    for (const [key, val] of Object.entries(extracted.json)) {
      if (!Array.isArray(val)) continue
      for (const q of val) {
        if (!q || typeof q !== 'object') continue
        // 补全 type 字段：优先用 AI 返回的，否则用 key
        const finalType = String(q.type || key).toLowerCase()
        // 修复：AI 可能用 text/question/title 字段而不是 stem 字段
        const normalizedQ = { ...q, type: finalType }
        if (!normalizedQ.stem) {
          normalizedQ.stem = normalizedQ.text || normalizedQ.question || normalizedQ.title || normalizedQ.content || ''
        }
        questions.push(normalizedQ)
      }
    }
    return questions
  }

  // 格式 B：数组 [{...}, {...}]
  if (Array.isArray(extracted.json)) {
    return extracted.json.map(q => {
      if (!q || typeof q !== 'object') return null
      // 修复：AI 可能用 text/question/title 字段而不是 stem 字段
      const normalizedQ = { ...q }
      if (!normalizedQ.stem) {
        normalizedQ.stem = normalizedQ.text || normalizedQ.question || normalizedQ.title || normalizedQ.content || ''
      }
      return normalizedQ
    }).filter(Boolean)
  }

  return []
}

// ===== 2026-06-15 强模型省 token 出题主流程 =====
// 流程：
//  1) 拉取题目矩阵（复用 analyzeQuestionMatrix）
//  2) 短路：全 (card, type) 已出齐 → callCount=0
//  3) 按状态优先级排序
//  4) 拆批（batchSize 6）+ 构造任务清单（按矩阵跳过 + 题型组合）
//  5) 串行调用（避免触发限流）
//  6) 解析（兼容对象/数组）→ 归一化 → 校验 → 冲突检测
//  7) 汇总去重
export async function generateQuestionsForStrongModel(cards, statusMap, existingQuestions, testType, config, options = {}) {
  // 2026-06-20：新增 concurrency / minIntervalMs 控制并行度与速率
  const {
    onBatchComplete = null,
    difficulty = undefined,
    categoryName = '',
    categoryPurpose = '',
    concurrency = 2,
    minIntervalMs = 300,
  } = options
  const realConcurrency = Math.max(1, Math.min(Number(concurrency) || 2, 5))

  // 1) 选择策略
  let strategy
  if (config.aiServiceMode === 'iflytek-spark') {
    strategy = STRONG_MODEL_STRATEGY[`iflytek-spark-${config.sparkModel || 'generalv3'}`]
      || STRONG_MODEL_STRATEGY['iflytek-spark-generalv3']
  } else {
    strategy = STRONG_MODEL_STRATEGY[config.aiServiceMode]
      || { batchSize: STRONG_DEFAULT_BATCH_SIZE, maxTypesPerBatch: 2, label: 'Unknown' }
  }

  // 2) 按状态优先级排序
  const statusPriority = { new: 0, review: 1, learning: 2, mastered: 3 }
  const sortedCards = [...cards].sort((a, b) => {
    const sa = statusMap[a.id] || 'new'
    const sb = statusMap[b.id] || 'new'
    return (statusPriority[sa] ?? 0) - (statusPriority[sb] ?? 0)
  })

  // 构建标记映射表（标记方案核心）：cardId → 标记, 标记 → {cardId, unitId, categoryId}
  const cardMarkerMap = new Map()
  const markerDataMap = new Map()
  sortedCards.forEach((card, idx) => {
    const marker = `标记${idx + 1}`
    cardMarkerMap.set(String(card.id || '').trim(), marker)
    markerDataMap.set(marker, {
      cardId: card.id,
      unitId: card.unitId || null,
      categoryId: card.categoryId || null,
      chapterId: card.chapterId || null,
    })
  })

  // 3) 题目矩阵（支持难度维度）
  const matrix = analyzeQuestionMatrix(sortedCards, existingQuestions, difficulty)

  // 4) 短路：所有 (card, type, difficulty) 都已出齐
  let allSatisfied = true
  if (sortedCards.length > 0) {
    for (const card of sortedCards) {
      const cid = String(card.id || '').trim()
      if (cid && (matrix.needCombosByCard.get(cid) || matrix.needTypesByCard.get(cid) || []).length > 0) {
        allSatisfied = false
        break
      }
    }
  }
  if (allSatisfied && sortedCards.length > 0) {
    const diffLabel = difficulty !== null ? `难度${difficulty}` : '所有难度'
    return {
      questions: [], totalGenerated: 0, batchCount: 0, callCount: 0,
      successCount: 0, failedCount: 0, matrix,
      skippedReason: 'all_satisfied',
    }
  }

  // 5) 任务清单（按矩阵 + 题型组合 + 难度）
  const { tasks, skipped } = buildStrongModelTasks(matrix, sortedCards, strategy, difficulty)
  const batchCount = Math.ceil(sortedCards.length / (strategy.batchSize || STRONG_DEFAULT_BATCH_SIZE))
  const allDifficulties = difficulty != null ? [difficulty] : [1, 2, 3]
  const totalTarget = sortedCards.length * LITE_QUESTION_TYPES.length * allDifficulties.length

  // 进度统计初始化
  const progressStats = {
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    totalGenerated: 0,
    totalTarget,
    perType: {},
    perDifficulty: {},
    perCard: {},
  }
  const questionTypes = LITE_QUESTION_TYPES.map(t => t.type)
  for (const t of questionTypes) {
    progressStats.perType[t] = { target: sortedCards.length * allDifficulties.length, generated: 0, failed: 0 }
  }
  for (const d of allDifficulties) {
    progressStats.perDifficulty[d] = { target: sortedCards.length * questionTypes.length, generated: 0, failed: 0 }
  }
  for (const card of sortedCards) {
    const cid = String(card.id || '').trim()
    if (cid) progressStats.perCard[cid] = { target: questionTypes.length * allDifficulties.length, generated: 0 }
  }

  // 6) 串行执行
  const allResults = []
  const executeTask = async (task) => {
    const startTime = Date.now()
    // 使用任务自身的 difficulty（递进式生成每个任务有独立难度）
    const taskDifficulty = task.difficulty != null ? task.difficulty : difficulty
    const prompt = buildStrongModelPrompt(task.cardBatch, task.types, { matrix, existingQuestions, cardMarkerMap, difficulty: taskDifficulty, categoryName, categoryPurpose })
    // 动态计算 max_tokens：每道题约需 300 tokens，最少 4096，最多 8192
    const estimatedQuestions = task.cardBatch.length * task.types.length
    const dynamicMaxTokens = Math.max(4096, Math.min(8192, estimatedQuestions * 300))
    try {
      const raw = await withRetry(() => generateTestQuestions(prompt, config, dynamicMaxTokens))
      const durationMs = Date.now() - startTime
      const parsed = parseMultiTypeResponse(raw, task.types)
      // 记录 AI 调用日志
      const logResult = logAiCall({
        purpose: 'test-question-generation',
        modelName: resolveModelName(config.aiServiceMode, config.model, config),
        durationMs,
        status: 'success',
        tokens: 0,
        prompt: prompt,
        response: raw || '',
      })
      // 强制把 type 字段写为 task.types 之一（防 AI 写错）
      const typed = parsed.map(q => ({ ...q, type: String(q.type || task.types[0]).toLowerCase() }))
      // 构建旧格式 cardIdMap（兜底用：card_N → UUID）
      const cardIdMap = new Map()
      task.cardBatch.forEach((card, idx) => {
        if (card?.id) {
          cardIdMap.set(`card_${idx + 1}`, card.id)
          cardIdMap.set(String(idx + 1), card.id)
          // 支持 "标记N" 格式（弱模型可能返回这类格式）
          cardIdMap.set(`标记${idx + 1}`, card.id)
        }
      })
      // 标记方案：优先用标记直接映射 unitId/categoryId，兜底用旧 card_N→UUID 映射
      for (const q of typed) {
        if (q.cardId) {
          const rawCardId = String(q.cardId)
          if (markerDataMap.has(rawCardId)) {
            const data = markerDataMap.get(rawCardId)
            q.cardId = data.cardId
            q.unitId = data.unitId
            q.categoryId = data.categoryId
            q.chapterId = data.chapterId
          } else if (cardIdMap.has(rawCardId)) {
            q.cardId = cardIdMap.get(rawCardId)
          }
        }
      }
      // 归一化 + 校验 + 冲突检测
      const valid = []
      for (const q of typed) {
        const norm = normalizeQuestion(q)
        // 冲突检测：仅在同 (card, type) 题面高度相似时丢弃
        const cardId = String(norm.cardId || '').trim()
        let isDupOfExisting = false
        if (cardId) {
          const have = matrix.byCardType.get(cardId) || {}
          const matchedType = (norm.type || '').toLowerCase()
          const sameTypeCount = matchedType ? (have[matchedType] || 0) : 0
          if (sameTypeCount > 0 && matchedType) {
            const existingStems = (matrix.byCardStems.get(cardId) || {})[matchedType] || []
            const newStem = String(norm.stem || '').trim()
            for (const es of existingStems) {
              if (es && jaccardSimilarity(newStem, es) > 0.85) {
                isDupOfExisting = true
                console.warn(`[generateQuestionsForStrongModel] 批${task.batchIdx + 1} ${matchedType} 丢弃(cardId=${cardId} 题面与已有题相似):`, String(norm.stem || '').slice(0, 40))
                break
              }
            }
            if (!isDupOfExisting) {
            }
          }
        }
        if (isDupOfExisting) continue

        // 填空题题干修复钩子：问句转挖空
        if (String(norm.type || '').toLowerCase() === 'fill_blank') {
          const fixed = tryFixFillBlankStem(norm)
          if (fixed) {
            norm.stem = fixed.stem
            if (fixed.analysisAdded) norm.analysis = (norm.analysis ? norm.analysis + ' | ' : '') + '(自动从问句转挖空)'
          }
        }

        const errors = validateQuestion(norm)
        if (!errors) {
          valid.push(norm)
        } else {
          console.warn(`[generateQuestionsForStrongModel] 批${task.batchIdx + 1} 丢弃:`, String(norm.stem || '').slice(0, 40), errors.join('; '))
        }
      }
      allResults.push({ task, questions: valid, error: null })
      // 更新进度统计
      progressStats.completedTasks++
      progressStats.totalGenerated += valid.length
      for (const q of valid) {
        const qType = String(q.type || '').toLowerCase()
        if (qType && progressStats.perType[qType]) {
          progressStats.perType[qType].generated++
        }
        if (taskDifficulty != null && progressStats.perDifficulty[taskDifficulty]) {
          progressStats.perDifficulty[taskDifficulty].generated++
        }
        const cid = String(q.cardId || '').trim()
        if (cid && progressStats.perCard[cid]) {
          progressStats.perCard[cid].generated++
        }
      }
      if (typeof onBatchComplete === 'function') {
        try {
          onBatchComplete({
            batchIdx: task.batchIdx,
            types: task.types,
            difficulty: taskDifficulty,
            generated: valid.length,
            error: null,
            progress: {
              completed: progressStats.completedTasks,
              total: progressStats.totalTasks,
              percent: Math.round((progressStats.completedTasks / Math.max(progressStats.totalTasks, 1)) * 100),
              totalGenerated: progressStats.totalGenerated,
              totalTarget: progressStats.totalTarget,
            },
          })
        } catch (e) { /* ignore */ }
      }
    } catch (err) {
      const durationMs = Date.now() - startTime
      // 记录 AI 调用失败日志
      const logResult = logAiCall({
        purpose: 'test-question-generation',
        modelName: resolveModelName(config.aiServiceMode, config.model, config),
        durationMs,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: prompt,
        response: '',
      })
      console.warn(`[generateQuestionsForStrongModel] 批${task.batchIdx + 1} 调用失败:`, err?.message || err, '日志ID:', logResult?.id)
      allResults.push({ task, questions: [], error: err })
      // 更新失败统计
      progressStats.failedTasks++
      progressStats.completedTasks++
      for (const t of task.types) {
        if (progressStats.perType[t]) progressStats.perType[t].failed++
      }
      if (taskDifficulty != null && progressStats.perDifficulty[taskDifficulty]) {
        progressStats.perDifficulty[taskDifficulty].failed++
      }
      if (typeof onBatchComplete === 'function') {
        try {
          onBatchComplete({
            batchIdx: task.batchIdx,
            types: task.types,
            difficulty: taskDifficulty,
            generated: 0,
            error: err?.message || String(err),
            progress: {
              completed: progressStats.completedTasks,
              total: progressStats.totalTasks,
              percent: Math.round((progressStats.completedTasks / Math.max(progressStats.totalTasks, 1)) * 100),
              totalGenerated: progressStats.totalGenerated,
              totalTarget: progressStats.totalTarget,
            },
          })
        } catch (e) { /* ignore */ }
      }
    }
  }

  // 6) 并发执行（realConcurrency=1 时内部走串行路径）
  const runResult = await runTasksConcurrently(
    tasks,
    (task) => executeTask(task),
    {
      concurrency: realConcurrency,
      minIntervalMs,
      label: `strong-${tasks.length || 0}`,
    },
  )

  // ===== 三级校验机制 =====
  // 1) 批次内校验
  const batchValidation = []
  for (const r of allResults) {
    batchValidation.push({
      batchIdx: r.task.batchIdx,
      types: r.task.types,
      difficulty: r.task.difficulty,
      expected: r.task.cardBatch.length * r.task.types.length,
      actual: r.questions.length,
      passed: r.questions.length > 0,
      error: r.error?.message || null,
    })
  }

  // 2) 题型校验
  const typeValidation = {}
  for (const t of questionTypes) {
    const typeResults = allResults.filter(r => r.task.types.includes(t))
    const generated = typeResults.reduce((sum, r) => sum + r.questions.length, 0)
    const failed = typeResults.filter(r => r.error).length
    typeValidation[t] = { totalTasks: typeResults.length, generated, failed, passed: generated > 0 }
  }

  // 3) 总体校验
  const totalExpected = totalTarget
  const totalGenerated = allResults.reduce((sum, r) => sum + r.questions.length, 0)
  const overallPassed = totalGenerated > 0

  // ===== 自动重试机制：仅对解析失败/崩溃的批次重试（验证失败的批次不重试，节省 Token） =====
  const failedTasks = allResults.filter(r => r.error)
  if (failedTasks.length > 0 && failedTasks.length <= tasks.length * 0.5) {
    for (const failedR of failedTasks) {
      const task = failedR.task
      try {
        const retryStart = Date.now()
        const taskDifficulty = task.difficulty != null ? task.difficulty : difficulty
        const prompt = buildStrongModelPrompt(task.cardBatch, task.types, { matrix, existingQuestions, cardMarkerMap, difficulty: taskDifficulty, categoryName, categoryPurpose })
        const retryMaxTokens = Math.max(4096, Math.min(8192, task.cardBatch.length * task.types.length * 300))
        const raw = await withRetry(() => generateTestQuestions(prompt, config, retryMaxTokens))
        const parsed = parseMultiTypeResponse(raw, task.types)
        const typed = parsed.map(q => ({ ...q, type: String(q.type || task.types[0]).toLowerCase() }))
        const cardIdMap = new Map()
        task.cardBatch.forEach((card, idx) => {
          if (card?.id) {
            cardIdMap.set(`card_${idx + 1}`, card.id)
            cardIdMap.set(String(idx + 1), card.id)
            cardIdMap.set(`标记${idx + 1}`, card.id)
          }
        })
        for (const q of typed) {
          if (q.cardId) {
            const rawCardId = String(q.cardId)
            if (markerDataMap.has(rawCardId)) {
              const data = markerDataMap.get(rawCardId)
              q.cardId = data.cardId
              q.unitId = data.unitId
              q.categoryId = data.categoryId
              q.chapterId = data.chapterId
            } else if (cardIdMap.has(rawCardId)) {
              q.cardId = cardIdMap.get(rawCardId)
            }
          }
        }
        const valid = []
        for (const q of typed) {
          const norm = normalizeQuestion(q)
          // 冲突检测：与已有题目对比
          const cardId = String(norm.cardId || '').trim()
          let isDupOfExisting = false
          if (cardId) {
            const have = matrix.byCardType.get(cardId) || {}
            const matchedType = (norm.type || '').toLowerCase()
            if (matchedType && (have[matchedType] || 0) > 0) {
              const existingStems = (matrix.byCardStems.get(cardId) || {})[matchedType] || []
              const newStem = String(norm.stem || '').trim()
              for (const es of existingStems) {
                if (es && jaccardSimilarity(newStem, es) > 0.85) {
                  isDupOfExisting = true
                  break
                }
              }
            }
          }
          if (isDupOfExisting) continue
          const errors = validateQuestion(norm)
          if (!errors) valid.push(norm)
          else console.warn(`[generateQuestionsForStrongModel] 重试丢弃:`, String(norm.stem || '').slice(0, 40), errors.join('; '))
        }
        // 替换原失败结果
        const idx = allResults.findIndex(r => r.task === task)
        if (idx >= 0) allResults[idx] = { task, questions: valid, error: null }
        progressStats.totalGenerated += valid.length
      } catch (retryErr) {
        console.warn(`[generateQuestionsForStrongModel] 重试失败：${task.types.join(',')} - ${retryErr?.message}`)
      }
    }
  }

  // 结果已由 executeTask 内部 push 到 allResults（避免双重收集）
  const allValid = []
  for (const r of allResults) allValid.push(...r.questions)

  // 判断题"全正确"反向（弱模型才会出现此问题，但强模型路径也可能遭遇）
  rebalanceTrueFalseQuestions(allValid)

  const seenStems = []
  const deduped = []
  for (const q of allValid) {
    const stem = String(q.stem || '').trim()
    if (!stem) continue
    let dup = false
    for (const s of seenStems) {
      if (jaccardSimilarity(stem, s) > SIMILARITY_THRESHOLD) { dup = true; break }
    }
    if (!dup) { seenStems.push(stem); deduped.push(q) }
  }

  return {
    questions: deduped,
    totalGenerated: allValid.length,
    batchCount,
    callCount: tasks.length,
    successCount: allResults.filter(r => !r.error).length,
    failedCount: allResults.filter(r => r.error).length,
    matrix,
    skippedTasks: skipped,
    progressStats,
    validation: {
      batch: batchValidation,
      type: typeValidation,
      overall: { expected: totalExpected, actual: totalGenerated, passed: overallPassed },
    },
  }
}

// 把卡片按 LITE_BATCH_SIZE 拆批
function chunkCards(cards, batchSize = LITE_BATCH_SIZE) {
  const result = []
  for (let i = 0; i < cards.length; i += batchSize) {
    result.push(cards.slice(i, i + batchSize))
  }
  return result
}

// ===== 核心：弱模型多次小批量出题 =====
// 流程：
//  1) 把所有卡片按状态优先级排序（未掌握 > 待掌握 > 学习中 > 已掌握）
//  2) 按 LITE_BATCH_SIZE 拆成多批
//  3) 对每批 × 每种题型发起 1 次 AI 调用
//  4) 解析 → 归一化 → 校验 → 收集
//  5) 返回所有通过校验的题目
//
// 容错：单个 (批次, 题型) 失败不中断整体；仅记录日志。
// 并发：默认串行（避免触发限流），可在 CONFIG 中配置 parallel=true 切换并行
async function generateQuestionsForWeakModel(cards, statusMap, existingQuestions, testType, config, options = {}) {
  // 2026-06-20：增强并发控制 —— 用 concurrency 字段替代 boolean parallel
  // parallel=true 等价于 concurrency=3；parallel=false/undefined 等价于 concurrency=1
  const {
    parallel = false,
    concurrency = parallel === true ? 3 : 1,
    onBatchComplete = null,
    categoryName = '',
    categoryPurpose = '',
    difficulty = undefined,
    minIntervalMs = 200,
  } = options
  const realConcurrency = Math.max(1, Math.min(Number(concurrency) || 1, 6))

  // 1) 按状态优先级排序
  const statusPriority = { new: 0, review: 1, learning: 2, mastered: 3 }
  const sortedCards = [...cards].sort((a, b) => {
    const sa = statusMap[a.id] || 'new'
    const sb = statusMap[b.id] || 'new'
    return (statusPriority[sa] ?? 0) - (statusPriority[sb] ?? 0)
  })

  // 构建标记映射表（标记方案核心）：cardId → 标记, 标记 → {cardId, unitId, categoryId}
  // 目的：弱模型只需返回短标记（如"标记1"），系统直接查表获取 unitId/categoryId，
  //       跳过 matchQuestionsToCards 的卡片查找环节，大幅提升归类准确率
  const cardMarkerMap = new Map()
  const markerDataMap = new Map()
  sortedCards.forEach((card, idx) => {
    const marker = `标记${idx + 1}`
    cardMarkerMap.set(String(card.id || '').trim(), marker)
    markerDataMap.set(marker, {
      cardId: card.id,
      unitId: card.unitId || null,
      categoryId: card.categoryId || null,
      chapterId: card.chapterId || null,
    })
  })

  // 2) 构建"题目矩阵"：分析本地已有题目，决定每个 (card, type) 还需要不需要生成
  //    关键：避免重复出题 + 减少 token 浪费 + 提升 AI 准确率（prompt 短）
  const matrix = analyzeQuestionMatrix(sortedCards, existingQuestions, difficulty)

  // 2.5) 若所有 (card, type) 都已出齐，直接返回
  let allSatisfied = true
  for (const card of sortedCards) {
    const cid = String(card.id || '').trim()
    if (cid && (matrix.needTypesByCard.get(cid) || []).length > 0) {
      allSatisfied = false
      break
    }
  }
  if (allSatisfied && sortedCards.length > 0) {
    return {
      questions: [], totalGenerated: 0, batchCount: 0, callCount: 0,
      successCount: 0, failedCount: 0, matrix,
      skippedReason: 'all_satisfied',
    }
  }

  // 3) 拆批
  const batches = chunkCards(sortedCards, LITE_BATCH_SIZE)

  // 4) 递进式分阶段生成策略（2026-06-20 优化）
  //    按难度递进分3个阶段，每阶段覆盖全部4种题型：
  //    阶段1（简易 difficulty=1）→ 阶段2（中等 difficulty=2）→ 阶段3（困难 difficulty=3）
  //    优点：① 确保每张卡片每种题型每种难度都有题 ② 进度可按阶段追踪 ③ 失败不影响已完成的阶段
  const questionTypes = LITE_QUESTION_TYPES.map(t => t.type)
  const allDifficulties = difficulty != null ? [difficulty] : [1, 2, 3]

  // 4.5) 构建任务清单：按 (阶段/难度, 批次, 题型) 三维迭代
  const tasks = []  // [{ phase, batchIdx, cardBatch, type, difficulty }]
  const skipped = { byTypeDiff: {}, empty: 0 }

  // 追踪每个卡片是否已经有任务分配（确保每个卡片至少有一道题）
  const cardHasTask = new Map()
  for (const card of sortedCards) {
    cardHasTask.set(String(card.id || '').trim(), false)
  }

  // 阶段1-3：按难度递进，每阶段遍历所有批次 × 所有题型
  for (let phaseIdx = 0; phaseIdx < allDifficulties.length; phaseIdx++) {
    const currentDifficulty = allDifficulties[phaseIdx]

    batches.forEach((batch, batchIdx) => {
      for (const type of questionTypes) {
        // 矩阵精确跳过：检查该 batch 内哪些卡片还需要该 (type, difficulty) 的题
        const allSatisfied = batch.every(card => {
          const cid = String(card.id || '').trim()
          if (!cid) return false
          const need = matrix.needCombosByCard.get(cid) || []
          // 如果该 card 不需要这个 (type, difficulty) 组合，则视为已满足
          return !need.some(c => c.type === type && c.difficulty === currentDifficulty)
        })

        if (allSatisfied) {
          const key = `${type}_${currentDifficulty}`
          skipped.byTypeDiff[key] = (skipped.byTypeDiff[key] || 0) + 1
          continue
        }

        // 记录该任务覆盖的卡片已分配任务
        for (const card of batch) {
          const cid = String(card.id || '').trim()
          if (cid) cardHasTask.set(cid, true)
        }

        tasks.push({
          phase: phaseIdx,
          batchIdx,
          cardBatch: batch,
          type,
          difficulty: currentDifficulty,
        })
      }
    })
  }

  // 阶段2：强制兜底 - 确保每个卡片至少有一道题
  const cardsWithoutTask = []
  cardHasTask.forEach((hasTask, cid) => {
    if (!hasTask && cid) {
      const card = sortedCards.find(c => String(c.id || '').trim() === cid)
      if (card) cardsWithoutTask.push(card)
    }
  })

  if (cardsWithoutTask.length > 0) {
    cardsWithoutTask.forEach((card, idx) => {
      const cid = String(card.id || '').trim()
      const needCombos = matrix.needCombosByCard.get(cid) || []
      const assignedCombo = needCombos.length > 0 ? needCombos[0] : { type: 'single_choice', difficulty: 1 }
      tasks.push({
        phase: allDifficulties.indexOf(assignedCombo.difficulty) >= 0 ? allDifficulties.indexOf(assignedCombo.difficulty) : 0,
        batchIdx: batches.length + Math.floor(idx / LITE_BATCH_SIZE),
        cardBatch: [card],
        type: assignedCombo.type,
        difficulty: assignedCombo.difficulty,
        isFallback: true,
        forcedCardId: cid,
      })
    })
  }

  // 进度统计初始化
  const totalTasks = tasks.length
  const totalTarget = sortedCards.length * questionTypes.length * allDifficulties.length
  const progressStats = {
    totalTasks,
    completedTasks: 0,
    failedTasks: 0,
    totalGenerated: 0,
    totalTarget,
    perType: {},      // { type: { target, generated, failed } }
    perDifficulty: {}, // { difficulty: { target, generated, failed } }
    perBatch: {},     // { batchIdx: { total, done, failed } }
    perCard: {},      // { cardId: { target, generated } }
    phaseStatus: allDifficulties.map(d => ({ difficulty: d, status: 'pending', generated: 0, target: 0 })),
  }
  for (const t of questionTypes) {
    progressStats.perType[t] = { target: sortedCards.length * allDifficulties.length, generated: 0, failed: 0 }
  }
  for (const d of allDifficulties) {
    progressStats.perDifficulty[d] = { target: sortedCards.length * questionTypes.length, generated: 0, failed: 0 }
  }
  for (const card of sortedCards) {
    const cid = String(card.id || '').trim()
    if (cid) progressStats.perCard[cid] = { target: questionTypes.length * allDifficulties.length, generated: 0 }
  }

  // 5) 执行所有任务
  const allResults = []  // [{ task, questions, error }]
  const executeTask = async (task) => {
    const startTime = Date.now()
    // 使用任务自身的 difficulty（递进式生成每个任务有独立难度）
    const taskDifficulty = task.difficulty || difficulty
    const prompt = buildLitePromptByType(task.cardBatch, task.type, {
      existingQuestions,  // 兼容旧签名
      matrix,             // 新增：把 matrix 传进去嵌入"已有题目"段
      cardMarkerMap,      // 标记映射表：用于生成 [mk=标记N] 格式的卡片标记
      categoryName,       // 分类名称：作为出题必要参数
      categoryPurpose,    // 分类目的：作为出题必要参数
      difficulty: taskDifficulty,  // 难度约束：使用任务自身的难度
    })
    try {
      const raw = await withRetry(() => generateTestQuestions(prompt, config))
      const durationMs = Date.now() - startTime
      const parsed = parseQuestionResponse(raw, config.aiServiceMode) || []
      // 记录 AI 调用日志
      const logResult = logAiCall({
        purpose: 'test-question-generation',
        modelName: resolveModelName(config.aiServiceMode, config.model, config),
        durationMs,
        status: 'success',
        tokens: 0,
        prompt: prompt,
        response: raw || '',
      })
      // 强制把 type 字段写为当前批次的题型（防止弱模型写错 type 字段）
      const typed = parsed.map(q => ({ ...q, type: task.type }))
      // 构建旧格式 cardIdMap（兜底用：card_N → UUID）
      const cardIdMap = new Map()
      task.cardBatch.forEach((card, idx) => {
        if (card?.id) {
          cardIdMap.set(`card_${idx + 1}`, card.id)
          cardIdMap.set(String(idx + 1), card.id)
          // 支持 "标记N" 格式（弱模型可能返回这类格式）
          cardIdMap.set(`标记${idx + 1}`, card.id)
        }
      })
      // 标记方案：优先用标记直接映射 unitId/categoryId，兜底用旧 card_N→UUID 映射
      for (const q of typed) {
        if (q.cardId) {
          const rawCardId = String(q.cardId)
          // 优先：标记直接映射 → 一步到位获取 cardId + unitId + categoryId
          if (markerDataMap.has(rawCardId)) {
            const data = markerDataMap.get(rawCardId)
            q.cardId = data.cardId
            q.unitId = data.unitId
            q.categoryId = data.categoryId
            q.chapterId = data.chapterId
          }
          // 兜底：旧的 card_N → UUID 映射（兼容 AI 未按标记格式返回的情况）
          else if (cardIdMap.has(rawCardId)) {
            q.cardId = cardIdMap.get(rawCardId)
          }
        }
        // 兜底：cardId 缺失时，用 knowledgePoint / stem 内容相似度匹配卡片
        if (!q.cardId || !q.unitId) {
          const kpText = String(q.knowledgePoint || '').trim()
          const stemText = String(q.stem || '').trim()
          let bestMatch = null
          let bestScore = 0
          for (const card of task.cardBatch) {
            const cardKp = String(card.knowledge_point || '').trim()
            const cardFront = String(card.front || '').trim()
            const cardBack = String(card.back || '').trim()
            let score = 0
            if (kpText && cardKp && kpText === cardKp) score = 100
            else if (kpText && cardKp && jaccardSimilarity(kpText, cardKp) > 0.5) score = 80
            if (stemText && cardFront && jaccardSimilarity(stemText, cardFront) > 0.35) score = Math.max(score, 70)
            if (stemText && cardBack && jaccardSimilarity(stemText, cardBack) > 0.35) score = Math.max(score, 70)
            if (score > bestScore) {
              bestScore = score
              bestMatch = card
            }
          }
          if (bestMatch && bestScore >= 35) {
            q.cardId = bestMatch.id
            q.unitId = q.unitId || bestMatch.unitId || null
            q.categoryId = q.categoryId || bestMatch.categoryId || null
            q.chapterId = q.chapterId || bestMatch.chapterId || null
          }
        }
      }
      // 归一化 + 校验
      const valid = []
      for (const q of typed) {
        const norm = normalizeQuestion(q)
        // 同 (card, type) 题面相似度检测：仅在 stem 高度相似时丢弃
        const cardId = String(norm.cardId || '').trim()
        let isDupOfExisting = false
        if (cardId) {
          const have = matrix.byCardType.get(cardId) || {}
          const sameTypeCount = have[task.type] || 0
          if (sameTypeCount > 0) {
            // 获取该 card 该 type 已有题目的 stems 进行相似度比对
            const existingStems = (matrix.byCardStems.get(cardId) || {})[task.type] || []
            const newStem = String(norm.stem || '').trim()
            for (const es of existingStems) {
              if (es && jaccardSimilarity(newStem, es) > 0.85) {
                isDupOfExisting = true
                console.warn(`[generateQuestionsForWeakModel] 批${task.batchIdx + 1} ${task.type} 丢弃(cardId=${cardId} 题面与已有题相似):`, String(norm.stem || '').slice(0, 40))
                break
              }
            }
            if (!isDupOfExisting) {
            }
          }
        }
        if (isDupOfExisting) continue

        // 填空题题干修复钩子：问句转挖空
        if (String(norm.type || '').toLowerCase() === 'fill_blank') {
          const fixed = tryFixFillBlankStem(norm)
          if (fixed) {
            norm.stem = fixed.stem
            if (fixed.analysisAdded) norm.analysis = (norm.analysis ? norm.analysis + ' | ' : '') + '(自动从问句转挖空)'
          }
        }

        const errors = validateQuestion(norm)
        if (!errors) {
          valid.push(norm)
        } else {
          console.warn(`[generateQuestionsForWeakModel] 批${task.batchIdx + 1} ${task.type} 丢弃:`, String(norm.stem || '').slice(0, 40), errors)
        }
      }
      allResults.push({ task, questions: valid, error: null })
      // 更新进度统计
      progressStats.completedTasks++
      progressStats.totalGenerated += valid.length
      if (progressStats.perType[task.type]) {
        progressStats.perType[task.type].generated += valid.length
      }
      if (progressStats.perDifficulty[taskDifficulty]) {
        progressStats.perDifficulty[taskDifficulty].generated += valid.length
      }
      for (const q of valid) {
        const cid = String(q.cardId || '').trim()
        if (cid && progressStats.perCard[cid]) {
          progressStats.perCard[cid].generated++
        }
      }
      if (typeof onBatchComplete === 'function') {
        try {
          onBatchComplete({
            batchIdx: task.batchIdx,
            type: task.type,
            difficulty: taskDifficulty,
            phase: task.phase,
            generated: valid.length,
            progress: {
              completed: progressStats.completedTasks,
              total: progressStats.totalTasks,
              percent: Math.round((progressStats.completedTasks / Math.max(progressStats.totalTasks, 1)) * 100),
              totalGenerated: progressStats.totalGenerated,
              totalTarget: progressStats.totalTarget,
            },
          })
        } catch (e) { /* 忽略回调错误 */ }
      }
    } catch (err) {
      const durationMs = Date.now() - startTime
      // 记录 AI 调用失败日志
      logAiCall({
        purpose: 'test-question-generation',
        modelName: resolveModelName(config.aiServiceMode, config.model, config),
        durationMs,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: prompt,
        response: '',
      })
      console.warn(`[generateQuestionsForWeakModel] 批${task.batchIdx + 1} ${task.type}(难度${taskDifficulty}) 调用失败:`, err?.message || err)
      allResults.push({ task, questions: [], error: err })
      // 更新失败统计
      progressStats.failedTasks++
      progressStats.completedTasks++
      if (progressStats.perType[task.type]) {
        progressStats.perType[task.type].failed++
      }
      if (progressStats.perDifficulty[taskDifficulty]) {
        progressStats.perDifficulty[taskDifficulty].failed++
      }
      if (typeof onBatchComplete === 'function') {
        try {
          onBatchComplete({
            batchIdx: task.batchIdx,
            type: task.type,
            difficulty: taskDifficulty,
            phase: task.phase,
            generated: 0,
            error: err?.message || String(err),
            progress: {
              completed: progressStats.completedTasks,
              total: progressStats.totalTasks,
              percent: Math.round((progressStats.completedTasks / Math.max(progressStats.totalTasks, 1)) * 100),
              totalGenerated: progressStats.totalGenerated,
              totalTarget: progressStats.totalTarget,
            },
          })
        } catch (e) { /* 忽略 */ }
      }
    }
  }

  // 5) 统一使用并发任务运行器（realConcurrency=1 时内部走串行路径）
  const runResult = await runTasksConcurrently(
    tasks,
    (task, index) => executeTask(task),
    {
      concurrency: realConcurrency,
      minIntervalMs,
      label: `batch-${tasks.length || 0}`,
    },
  )

  // ===== 三级校验机制 =====
  // 1) 批次内校验：统计每批次的生成情况
  const batchValidation = []
  for (const r of allResults) {
    const expected = r.task.cardBatch.length // 每卡片期望1道题
    batchValidation.push({
      batchIdx: r.task.batchIdx,
      type: r.task.type,
      difficulty: r.task.difficulty,
      expected,
      actual: r.questions.length,
      passed: r.questions.length > 0,
      error: r.error?.message || null,
    })
  }

  // 2) 题型校验：按题型汇总
  const typeValidation = {}
  for (const t of questionTypes) {
    const typeResults = allResults.filter(r => r.task.type === t)
    const generated = typeResults.reduce((sum, r) => sum + r.questions.length, 0)
    const failed = typeResults.filter(r => r.error).length
    typeValidation[t] = {
      totalTasks: typeResults.length,
      generated,
      failed,
      passed: generated > 0,
    }
  }

  // 3) 总体校验：汇总所有题目
  const totalExpected = totalTarget
  const totalGenerated = allResults.reduce((sum, r) => sum + r.questions.length, 0)
  const overallPassed = totalGenerated > 0

  // ===== 自动重试机制：对生成失败或数量为0的批次进行重试 =====
  const failedTasks = allResults.filter(r => r.error || r.questions.length === 0)
  if (failedTasks.length > 0 && failedTasks.length <= tasks.length * 0.5) {
    // 失败任务不超过50%时才重试，避免大面积失败浪费 token
    const retryTasks = failedTasks.map(r => r.task)
    const retryResults = []
    for (const task of retryTasks) {
      try {
        const retryStart = Date.now()
        const taskDifficulty = task.difficulty || difficulty
        const prompt = buildLitePromptByType(task.cardBatch, task.type, {
          existingQuestions,
          matrix,
          cardMarkerMap,
          categoryName,
          categoryPurpose,
          difficulty: taskDifficulty,
        })
        const raw = await withRetry(() => generateTestQuestions(prompt, config))
        const parsed = parseQuestionResponse(raw, config.aiServiceMode) || []
        const typed = parsed.map(q => ({ ...q, type: task.type }))
        // 标记映射
        const cardIdMap = new Map()
        task.cardBatch.forEach((card, idx) => {
          if (card?.id) {
            cardIdMap.set(`card_${idx + 1}`, card.id)
            cardIdMap.set(String(idx + 1), card.id)
            cardIdMap.set(`标记${idx + 1}`, card.id)
          }
        })
        for (const q of typed) {
          if (q.cardId) {
            const rawCardId = String(q.cardId)
            if (markerDataMap.has(rawCardId)) {
              const data = markerDataMap.get(rawCardId)
              q.cardId = data.cardId
              q.unitId = data.unitId
              q.categoryId = data.categoryId
              q.chapterId = data.chapterId
            } else if (cardIdMap.has(rawCardId)) {
              q.cardId = cardIdMap.get(rawCardId)
            }
          }
        }
        const valid = []
        for (const q of typed) {
          const norm = normalizeQuestion(q)
          const errors = validateQuestion(norm)
          if (!errors) valid.push(norm)
        }
        retryResults.push({ task, questions: valid, error: null })
        progressStats.totalGenerated += valid.length
      } catch (retryErr) {
        retryResults.push({ task, questions: [], error: retryErr })
        console.warn(`[generateQuestionsForWeakModel] 重试失败：${task.type} - ${retryErr?.message}`)
      }
    }
    // 将重试结果替换原失败结果
    for (const retryR of retryResults) {
      const idx = allResults.findIndex(r => r.task === retryR.task)
      if (idx >= 0) allResults[idx] = retryR
    }
  }

  // 汇总 + 简单去重
  const allValidQuestions = []
  for (const r of allResults) {
    allValidQuestions.push(...r.questions)
  }

  // 5.1) 判断题"全正确"反向：防止弱模型返回的判断题全为"正确"
  rebalanceTrueFalseQuestions(allValidQuestions)

  // 简单去重：基于 stem 文本相似度
  const seenStems = []
  const deduped = []
  for (const q of allValidQuestions) {
    const stem = String(q.stem || '').trim()
    if (!stem) continue
    let dup = false
    for (const s of seenStems) {
      if (jaccardSimilarity(stem, s) > SIMILARITY_THRESHOLD) { dup = true; break }
    }
    if (!dup) {
      seenStems.push(stem)
      deduped.push(q)
    }
  }

  return {
    questions: deduped,
    totalGenerated: allValidQuestions.length,
    batchCount: batches.length,
    callCount: tasks.length,
    successCount: allResults.filter(r => !r.error).length,
    failedCount: allResults.filter(r => r.error).length,
    matrix,
    skippedTasks: skipped.byTypeDiff,
    progressStats,      // 进度统计（含各题型/难度/卡片维度）
    validation: {       // 三级校验结果
      batch: batchValidation,
      type: typeValidation,
      overall: { expected: totalExpected, actual: totalGenerated, passed: overallPassed },
    },
  }
}

// ===== 解析 AI 返回的题目 JSON =====
// ===== 2026-06-23 表格格式解析器 =====
// AI 输出 Markdown 表格比 JSON 更稳定，逐行解析，单行出错不影响其他题
// 表格格式：| type | stem | A | B | C | D | answer | cardId | diff | analysis |

// 题型简称 → 标准题型名映射
const TABLE_TYPE_MAP = {
  'single': 'single_choice',
  'multi': 'multi_choice',
  'judge': 'true_false',
  'fill': 'fill_blank',
}

// 解析表格行：按 | 分割，处理 \| 转义
function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let current = ''
  let i = 0
  while (i < trimmed.length) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      current += '|'
      i += 2
    } else if (trimmed[i] === '|') {
      cells.push(current.trim())
      current = ''
      i++
    } else {
      current += trimmed[i]
      i++
    }
  }
  cells.push(current.trim())
  return cells
}

// 检测分隔行 |---|---|
function isTableSeparatorRow(line) {
  const trimmed = line.trim()
  return /^\|[\s\-:|]+\|$/.test(trimmed) && trimmed.includes('-')
}

// 表格解析主函数：返回题目数组或 null
function parseTableResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return null

  // 提取所有以 | 开头并以 | 结尾的行
  const lines = rawText.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && l.endsWith('|'))

  if (lines.length < 2) return null

  // 找到表头行（第一个非分隔行）
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (!isTableSeparatorRow(lines[i])) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return null

  const headers = parseTableRow(lines[headerIdx]).map(h => h.toLowerCase().trim())

  // 验证表头必须包含 type 和 stem
  if (!headers.includes('type') || !headers.includes('stem')) return null

  // 数据行：跳过表头和分隔行
  const dataLines = lines.slice(headerIdx + 1).filter(l => !isTableSeparatorRow(l))

  const questions = []
  for (const line of dataLines) {
    const cells = parseTableRow(line)
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = (cells[i] || '').trim()
    })

    // 题型转换
    const type = TABLE_TYPE_MAP[obj.type] || obj.type || ''
    if (!type) continue

    // 题干
    const stem = (obj.stem || '').replace(/\\\|/g, '|').trim()
    if (!stem) continue

    // 构建选项（A/B/C/D/E 列）
    const options = []
    const optionCols = ['a', 'b', 'c', 'd', 'e']
    for (const col of optionCols) {
      if (obj[col] && obj[col].trim()) {
        options.push({
          label: col.toUpperCase(),
          text: obj[col].replace(/\\\|/g, '|').trim(),
        })
      }
    }

    // 判断题特殊处理：无选项时补充"正确"/"错误"选项
    if (type === 'true_false' && options.length === 0) {
      options.push({ label: '正确', text: '正确' })
      options.push({ label: '错误', text: '错误' })
    }

    // 答案
    const answer = (obj.answer || '').replace(/\\\|/g, '|').trim()
    if (!answer) continue

    // cardId 支持 cardid/cardId/mk 等列名
    const cardId = (obj.cardid || obj.cardid_raw || obj.mk || '').trim()
    // 难度支持 diff/difficulty 列名
    const difficulty = Number(obj.diff) || Number(obj.difficulty) || 2
    // 解析
    const analysis = (obj.analysis || '').replace(/\\\|/g, '|').trim()

    questions.push({
      type,
      stem,
      options,
      answer,
      cardId,
      difficulty,
      analysis,
      knowledgePoint: '',
    })
  }

  return questions.length > 0 ? questions : null
}

// 兜底解析：从破损 JSON 中正则提取题目对象（含 stem 字段），避免整批题目丢失
function extractQuestionsFromBrokenJson(text) {
  if (!text || typeof text !== 'string') return []
  const questions = []
  // 匹配含一层嵌套大括号的对象块（兼容 options 数组内嵌对象）
  const objectPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
  let match
  while ((match = objectPattern.exec(text)) !== null) {
    const objStr = match[0]
    // 仅处理包含 stem 字段的块
    if (!/"stem"\s*:/.test(objStr)) continue
    try {
      const obj = JSON.parse(objStr)
      if (obj && typeof obj === 'object' && obj.stem) {
        questions.push(obj)
      }
    } catch (e) {
      // JSON.parse 失败，尝试正则提取关键字段
      const stemMatch = objStr.match(/"stem"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (!stemMatch) continue
      const q = { stem: stemMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') }
      const typeMatch = objStr.match(/"type"\s*:\s*"([^"]*)"/)
      if (typeMatch) q.type = typeMatch[1]
      const answerMatch = objStr.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (answerMatch) q.answer = answerMatch[1].replace(/\\"/g, '"')
      const analysisMatch = objStr.match(/"analysis"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (analysisMatch) q.analysis = analysisMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      const difficultyMatch = objStr.match(/"difficulty"\s*:\s*(\d+)/)
      if (difficultyMatch) q.difficulty = Number(difficultyMatch[1])
      const kpMatch = objStr.match(/"knowledgePoint"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (kpMatch) q.knowledgePoint = kpMatch[1].replace(/\\"/g, '"')
      questions.push(q)
    }
  }
  return questions
}

function parseQuestionResponse(rawText, aiServiceMode = '') {
  if (!rawText || typeof rawText !== 'string') return null

  // 2026-06-23 优先尝试表格解析（比 JSON 更稳定，单行出错不影响其他题）
  const tableQuestions = parseTableResponse(rawText)
  if (tableQuestions && tableQuestions.length > 0) {
    return tableQuestions
  }

  // 回退到 JSON 解析
  const extracted = extractJsonFromAiResponse(rawText, aiServiceMode)
  if (!extracted.json) {
    console.warn('[parseQuestionResponse] 表格和 JSON 解析均失败，原始内容前500字符：', String(rawText).slice(0, 500))
    // 兜底：基于正则提取题目对象块，避免整批题目丢失
    const fallbackQuestions = extractQuestionsFromBrokenJson(String(rawText))
    if (fallbackQuestions.length > 0) {
      return fallbackQuestions
    }
    return null
  }

  // 响应可能是数组 [...] 或对象 { questions: [...] }
  let result = null
  if (Array.isArray(extracted.json)) result = extracted.json
  else if (extracted.json.questions && Array.isArray(extracted.json.questions)) result = extracted.json.questions
  else if (extracted.json.data && Array.isArray(extracted.json.data)) result = extracted.json.data

  // ===== 弱模型畸形格式修复：单选题（4 个独立项当 1 道题） =====
  // 检测模式：[{label:A,text:...,answer:A,...}, {label:B,...}, ...] 无 type/stem/options 数组
  if (result && result.length > 0) {
    const first = result[0]
    if (first && typeof first === 'object' &&
        !first.type && !first.stem && !Array.isArray(first.options) &&
        first.label && first.text && first.answer) {
      // 进一步检测：所有项都是 {label, text, answer} 格式，且 label 为 A/B/C/D
      const allItemsHaveOptionLabels = result.every(item => {
        const lbl = String(item.label || '').trim().toUpperCase()
        return ['A', 'B', 'C', 'D', 'E', 'F'].includes(lbl)
      })
      if (allItemsHaveOptionLabels && result.length >= 2) {
        // 尝试重组为 1 道单选题
        // 选项：提取所有 item 的 label/text 作为 options
        // 题干：从第一个选项内容衍生，或用通用题干
        // 答案：从第一个选项中提取 answer 作为正确答案（通常第一个是正确的）
        const options = result.slice(0, 4).map((item, idx) => ({
          label: String(item.label || String.fromCharCode(65 + idx)).trim().toUpperCase(),
          text: String(item.text || '').trim(),
        })).filter(o => o.text.length > 0)

        if (options.length >= 2) {
          // 找到正确答案：第一个 answer 为 "A" 的选项，或选择 answer 与 label 匹配的
          let correctLabel = 'A'
          for (const item of result) {
            const ans = String(item.answer || '').trim().toUpperCase()
            if (['A', 'B', 'C', 'D'].includes(ans)) {
              correctLabel = ans
              break
            }
          }

          // 题干：从选项 A 的内容衍生（改为疑问句），否则用通用题干
          const firstText = options[0].text
          let stem = '下列关于上述知识点的描述，正确的是？'
          if (firstText.length > 2) {
            // 从陈述句衍生疑问句：保留核心概念，末尾加问号
            const keyword = firstText.slice(0, Math.min(10, firstText.length))
            stem = `下列关于「${keyword}...」的描述，正确的是？`
          }

          const reconstructed = [{
            type: 'single_choice',
            stem,
            options,
            answer: correctLabel,
            analysis: result[0].analysis || '',
            difficulty: 2,
            knowledgePoint: result[0].knowledgePoint || '',
          }]
          return reconstructed
        }
      }
    }
  }

  return result
}

// ===== 弱模型输出质量检测与规范化 =====
// 2026-06-15：针对讯飞星火 Spark Lite 频繁返回畸形题目（label 用判断词/状态词、选项是知识点标签、
// 题干直接复述答案等）做的多层防御。核心思路：先尝试自动修正，修正后再校验，校验不过直接丢弃题目。

// 状态词：禁止作为选项 label 或选项 text 出现
const FORBIDDEN_STATUS_WORDS = ['待掌握', '未掌握', '学习中', '已掌握', '掌握中', '未学', '未开始', '未学习']
// 判断词：禁止作为选择题的选项 label / 单独 text 出现（仅判断题 label/text 允许）
// 注意：'T'/'F' 已移除，避免误伤含 T/F 的合法选项文本
const FORBIDDEN_JUDGMENT_WORDS = ['正确', '错误', '对', '错', '是', '否', 'yes', 'no', 'true', 'false']
// 知识点标签特征词：含这些词但缺少动词/谓语的选项，视为"知识点标签"而非可作答选项
// 注意：第二组不再匹配含"属于"/"包含"的任意文本（过于激进，误伤合法选项）
const KNOWLEDGE_LABEL_PATTERNS = [
  /^[\s\S]*的(特点|定义|含义|概念|分类|区别|作用|优势|劣势|功能|原理|方法|公式|组成|结构|流程|步骤|标准|条件|目的|意义)$/,
]
// 题干应该像问题（包含问号或疑问词）；如果完全像陈述句且带"是"，配合"特点/定义/含义"等高风险标记
const STEM_RISK_PHRASES = ['的特点是', '的定义是', '的含义是', '的功能是', '的作用是', '包括下列', '属于下列']

// 简单分词：把句子拆成 token 用于相似度比较
// 对中文采用 bigram（二元字）方式，避免按空格分词时整句成一个 token 而相似度全为 0
function tokenizeForCompare(s) {
  if (!s) return new Set()
  const cleaned = String(s)
    .toLowerCase()
    .replace(/[，。！？、；：""''（）()\[\]【】,.!?;:"'()\[\]<>《》/\\\-_——+=\s]+/g, ' ')
    .trim()
  const tokens = new Set()
  if (!cleaned) return tokens
  // 1. 按空格切分
  const parts = cleaned.split(' ').filter(Boolean)
  for (const p of parts) tokens.add(p)
  // 2. 对连续中文字符串再加 bigram
  const chineseStr = cleaned.replace(/[a-z0-9\s]+/g, ' ').trim()
  for (let i = 0; i < chineseStr.length - 1; i++) {
    const ch = chineseStr[i]
    const next = chineseStr[i + 1]
    if (/[一-鿿]/.test(ch) && /[一-鿿]/.test(next)) {
      tokens.add(ch + next)
    }
  }
  return tokens
}

// 计算两个文本的 Jaccard 相似度（避免和 helpers.simpleTextSimilarity 字符级不同的实现混淆）
function jaccardSimilarity(a, b) {
  const setA = tokenizeForCompare(a)
  const setB = tokenizeForCompare(b)
  if (setA.size === 0 && setB.size === 0) return 0
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter++
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

// 判断文本是否是"知识点标签"（如"内存RAM的特点"、"外存的特点"）
// 主要依据：是否匹配特征模式（"X的特点"等），不再用短文本启发式（容易误伤短句）
function isKnowledgeLabel(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (t.length > 60) return false // 太长大概率是句子
  // 检查是否匹配标签模式
  for (const pat of KNOWLEDGE_LABEL_PATTERNS) {
    if (pat.test(t)) return true
  }
  return false
}

// 判断文本是否包含禁止的关键词
function containsForbiddenKeyword(text, list) {
  if (!text) return null
  for (const word of list) {
    if (String(text).includes(word)) return word
  }
  return null
}

// 把任意 label 归一化为 A-Z 字母（A-Z 之一）；失败返回 null
function normalizeChoiceLabel(label, index = 0) {
  if (label == null) return null
  const s = String(label).trim()
  // 1) 直接 A-Z
  if (/^[A-Z]$/.test(s)) return s
  // 2) 小写字母转大写
  if (/^[a-z]$/.test(s)) return s.toUpperCase()
  // 3) 1/2/3/4 → A/B/C/D
  const numMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E', '6': 'F' }
  if (numMap[s]) return numMap[s]
  // 4) "选项A" / "A." / "A、" / "(A)" 等前缀
  const m = s.match(/^[\(（]?([A-Za-z])[\)\)\.\、\s]/)
  if (m) return m[1].toUpperCase()
  // 5) 甲乙丙丁
  const cnMap = { '甲': 'A', '乙': 'B', '丙': 'C', '丁': 'D' }
  if (cnMap[s]) return cnMap[s]
  // 6) 兜底：用 index 派生
  if (index >= 0 && index < 26) return String.fromCharCode(65 + index)
  return null
}

// ===== 校验前规范化 =====
// 弱模型（Spark Lite）可能返回 options 为字符串数组而非 {label, text} 对象数组
function normalizeQuestion(q) {
  const normalized = { ...q }

  // ===== stem 字段回退：AI 可能用 question/title/content 而非 stem =====
  if (!normalized.stem) {
    normalized.stem = normalized.question || normalized.title || normalized.content || normalized.text || ''
  }

  // ===== answer 字段回退：AI 可能用 correct_answer/correctAnswer/answer_key/right_answer 等字段 =====
  if (!normalized.answer) {
    normalized.answer = normalized.correct_answer || normalized.correctAnswer || normalized.answer_key || normalized.right_answer || normalized.rightAnswer || normalized.key || ''
  }

  // ===== options 规范化 =====
  // 修复：AI 可能返回 options 为对象（如 {"A":"text1","B":"text2"}）而非数组
  if (normalized.options && !Array.isArray(normalized.options) && typeof normalized.options === 'object') {
    const optObj = normalized.options
    normalized.options = Object.entries(optObj).map(([label, text]) => ({ label, text }))
  }
  // 修复：AI 可能返回 options 为字符串（如 "A.text1 B.text2"）
  if (normalized.options && typeof normalized.options === 'string') {
    const parts = normalized.options.split(/\s+(?=[A-Z][.、\)）])/).filter(Boolean)
    if (parts.length >= 2) {
      normalized.options = parts.map((part, i) => {
        const m = part.match(/^([A-Za-z])[.\、\)）]\s*(.+)/)
        if (m) return { label: m[1].toUpperCase(), text: m[2] }
        return { label: String.fromCharCode(65 + i), text: part }
      })
    }
  }

  if (Array.isArray(normalized.options) && normalized.options.length > 0) {
    const first = normalized.options[0]
    if (typeof first === 'string') {
      // 字符串数组：尝试 "A. 选项内容" / "A、选项内容" 解析
      normalized.options = normalized.options.map((opt, i) => {
        const str = String(opt)
        const m = str.match(/^([A-Za-z])[.\、\)）]\s*(.+)/)
        if (m) return { label: m[1].toUpperCase(), text: m[2] }
        return { label: String.fromCharCode(65 + i), text: str }
      })
    }

    // 无论原本是字符串数组还是对象数组，都做一遍：label 归一 + 文本清洗
    const qType = (normalized.type || '').toLowerCase()
    normalized.options = normalized.options.map((opt, i) => {
      if (!opt || typeof opt !== 'object') return null
      let label = opt.label
      let text = opt.text
      if (typeof text !== 'string') text = String(text ?? '')
      text = text.trim()
      // 判断题：label/text 必须是 "正确" / "错误"
      if (qType === 'true_false' || qType === 'judge') {
        // 用整体映射而不是字符替换（避免 "错误" 被替换为 "错误误" 的 bug）
        const normTF = (v) => {
          const s = String(v == null ? '' : v).trim()
          if (!s) return '正确'  // 兜底
          if (s === '正确' || s === '错误') return s
          if (s === '是' || s === '对' || s === 'yes' || s.toLowerCase() === 'true' || s === 'T') return '正确'
          if (s === '否' || s === 'no' || s.toLowerCase() === 'false' || s === 'F') return '错误'
          return s
        }
        const t = normTF(text)
        const l = normTF(label)
        return { label: l, text: t }
      }
      // 单选/多选：label 归一为 A-Z
      const normLabel = normalizeChoiceLabel(label, i) || String.fromCharCode(65 + i)
      return { label: normLabel, text }
    }).filter(Boolean)
  }

  // 安全网：确保 options 始终是数组（防止非数组 options 导致后续 .map 崩溃）
  if (normalized.options && !Array.isArray(normalized.options)) {
    normalized.options = []
  }

  // ===== 判断题 options 兜底：AI 可能只返回 text+answer，缺少 options =====
  // 两层兜底：
  //   1) options 不存在或不足 2 个 → 补全标准选项
  //   2) options 存在但 label 不是 "正确"/"错误"（如 AI 返回 A/B 标签）→ 覆盖
  const qType = (normalized.type || '').toLowerCase()
  if ((qType === 'true_false' || qType === 'judge')) {
    const opts = normalized.options
    let needFix = false
    if (!Array.isArray(opts) || opts.length < 2) {
      needFix = true
    } else {
      const labels = opts.map(o => (o && o.label) || (o && o.text) || '')
      if (!labels.includes('正确') || !labels.includes('错误')) {
        needFix = true
      }
    }
    if (needFix) {
      normalized.options = [
        { label: '正确', text: '正确' },
        { label: '错误', text: '错误' },
      ]
    }
  }

  // ===== 答案规范化 =====
  // 顺序很重要：先做 true_false 的中英文映射（依赖原始大小写），再做大写转换
  // 1) 先做判断题答案规范化（必须在转大写之前）
  if (typeof normalized.answer === 'string') {
    const a = normalized.answer.trim()
    const type = (normalized.type || '').toLowerCase()
    if (type === 'true_false' || type === 'judge') {
      const lower = a.toLowerCase()
      if (['是', 'yes', 'true', '对', '正确'].includes(a) || lower === 'true') normalized.answer = '正确'
      else if (['否', 'no', 'false', '错', '错误'].includes(a) || lower === 'false') normalized.answer = '错误'
    }
  }
  // 2) 处理 "A. xxx" / "答案：正确" 等前缀
  if (typeof normalized.answer === 'string' && normalized.answer.length > 1) {
    const ansMatch = normalized.answer.match(/^([A-Za-z])[.\、\)）]/)
    if (ansMatch) {
      normalized.answer = ansMatch[1].toUpperCase()
    } else {
      // 去除 "答案：" / "正确答案：" 等前缀
      normalized.answer = normalized.answer.replace(/^(答案|正确答案|答)\s*[:：]?\s*/, '').trim()
    }
  }
  // 3) 单字符小写字母答案 → 大写（处理 AI 返回 "a" "b" "c" "d" 的情况）
  if (typeof normalized.answer === 'string' && /^[a-z]$/.test(normalized.answer)) {
    normalized.answer = normalized.answer.toUpperCase()
  }
  // 4) 多字符答案中混入的小写字母统一转大写（不影响已归一的"正确"/"错误"）
  if (typeof normalized.answer === 'string' && /^[A-Z]+$/.test(normalized.answer) && normalized.answer !== '正确' && normalized.answer !== '错误') {
    normalized.answer = normalized.answer.toUpperCase()
  }

  // 多选题答案规范化：拆字符顺序排序去重
  if (typeof normalized.answer === 'string' && (normalized.type || '').toLowerCase() === 'multi_choice') {
    const chars = normalized.answer.toUpperCase().split('').filter(c => /[A-Z]/.test(c))
    if (chars.length > 0) {
      normalized.answer = [...new Set(chars)].sort().join('')
    } else {
      normalized.answer = ''
    }
  }

  // ===== 判断题题干自动修正：若没有"判断以下说法是否正确"开头，自动补上 =====
  if ((normalized.type || '').toLowerCase() === 'true_false' || (normalized.type || '').toLowerCase() === 'judge') {
    if (typeof normalized.stem === 'string' && normalized.stem.length > 0) {
      const stem = normalized.stem.trim()
      if (!/^判断(以下|下列)?(说法|陈述|描述|命题)?(是否)?(正确|对错|真假)/i.test(stem) && !/[？?]$/.test(stem)) {
        // 题干像是陈述句，自动加前缀
        normalized.stem = '判断以下说法是否正确：' + stem.replace(/[。.]+$/, '') + '。'
      }
    }
  }

  // ===== 多选题题干末尾自动补全"（多选题）"标记 =====
  // 弱模型常遗漏该标记，导致校验"多选题题干缺少(多选题)标记"失败
  if ((normalized.type || '').toLowerCase() === 'multi_choice' && typeof normalized.stem === 'string') {
    const stem = normalized.stem.trim()
    if (stem.length > 0 && !/（多选|多选|可多选|\(多选|\(多选题\)|（多选题）/.test(stem)) {
      // 以句号/问号结尾：替换末尾标点为"（多选题）？"
      if (/[。.？?！!；;]$/.test(stem)) {
        normalized.stem = stem.replace(/[。.？?！!；;]$/, '（多选题）？')
      } else {
        normalized.stem = stem + '（多选题）？'
      }
      console.warn(`[normalizeQuestion] 多选题题干自动补全标记: "${stem.slice(0, 30)}" → "${normalized.stem.slice(0, 40)}"`)
    }
  }

  // ===== analysis 字段清理：移除挖空标记（弱模型可能在解析中也加入了 ____）=====
  if (typeof normalized.analysis === 'string') {
    // 移除挖空标记 ____ 和其他类似模式
    normalized.analysis = normalized.analysis
      .replace(/_{2,}/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/（\s*）/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/【\s*】/g, '')
      .trim()
  }

  // ===== 填空题 answer 过长时自动截断（AI 可能把整句答案当关键词）=====
  // 理想的填空题 answer 应为 2-12 字的关键词或短语
  if ((normalized.type || '').toLowerCase() === 'fill_blank' && typeof normalized.answer === 'string') {
    const ans = normalized.answer.trim()
    if (ans.length > 20) {
      // 尝试从整句中提取关键词：取第一个"是"字之后到第一个标点之前的内容
      let extracted = null
      const afterShi = ans.match(/是(.+?)(?:[，。,；;]|$)/)
      if (afterShi && afterShi[1] && afterShi[1].trim().length <= 15) {
        extracted = afterShi[1].trim()
      }
      if (!extracted) {
        // 退而求其次：保留前 15 字并加省略号
        extracted = ans.slice(0, 15)
      }
      console.warn(`[normalizeQuestion] 填空题 answer 过长自动截断: "${ans.slice(0, 30)}" → "${extracted}"`)
      normalized.answer = extracted
      if (normalized.analysis) {
        normalized.analysis = '(原始 answer 过长已截断) ' + normalized.analysis
      } else {
        normalized.analysis = '(原始 answer 过长已截断)'
      }
    }
  }

  // ===== knowledge_point / knowledgePoint 字段别名兼容 =====
  // 确保 normalized.knowledgePoint 总有值（card 用 knowledge_point，AI 返回用 knowledgePoint）
  if (!normalized.knowledgePoint && normalized.knowledge_point) {
    normalized.knowledgePoint = normalized.knowledge_point
  }

  // ===== difficulty 字段归一化：确保为 1-3 的数字 =====
  const rawDiff = normalized.difficulty
  if (rawDiff != null) {
    const numDiff = Number(rawDiff)
    if (!isNaN(numDiff)) {
      normalized.difficulty = Math.max(1, Math.min(3, Math.round(numDiff)))
    } else {
      normalized.difficulty = 2
    }
  } else {
    normalized.difficulty = 2
  }

  // ===== 多选题选项数量截取：AI 可能返回超过 4 个选项，自动截取前 4 个并同步修复答案 =====
  if ((normalized.type || '').toLowerCase() === 'multi_choice' && Array.isArray(normalized.options) && normalized.options.length > 4) {
    const originalLen = normalized.options.length
    const maxOptions = 4
    // 截取前 4 个选项
    normalized.options = normalized.options.slice(0, maxOptions)
    // 同步截取答案中超出范围的选项
    if (typeof normalized.answer === 'string') {
      const validLabels = normalized.options.map(o => o.label)
      const chars = normalized.answer.toUpperCase().split('').filter(c => /[A-Z]/.test(c) && validLabels.includes(c))
      normalized.answer = [...new Set(chars)].sort().join('')
    }
    console.warn(`[normalizeQuestion] 多选题选项截取: ${originalLen} → ${maxOptions}, 答案同步修正: ${normalized.answer}`)
  }

  return normalized
}

// ===== 2026-06-15 填空题问句题干自动修复 =====
// 弱模型常返回 "X 是什么/有什么区别" 这类问句型填空题题干，
// 导致 validateQuestion "填空题题干缺少 ____ 或 () 填空标记" 失败。
// 修复策略：检测问句模式，把问号位置用 ____ 替换，并把 answer 视为挖空内容。
// @returns {?{ stem: string, originalStem: string, analysisAdded: boolean }}
function tryFixFillBlankStem(q) {
  if (!q || !q.stem) return null
  const qType = String(q.type || '').toLowerCase()
  if (qType !== 'fill_blank') return null

  const stem = String(q.stem).trim()
  // 已经有 ____ 或 () 标记，无需修复
  if (/_{2,}|\(\s*\)|（\s*）|\[\s*\]|【\s*】/.test(stem)) return null

  // 检测问句模式：以 "X 是什么/什么区别/...？" 结尾
  // 模式1：X (是什么|的定义|的含义|的区别|的功能|的作用|的用途|的特点|有几个|包括哪些|是多少|怎样|如何) ？
  // 模式2：通用疑问句 "X ？/X？"
  const askPatterns = [
    /^(.{2,60}?)(是什么|的定义|的含义|的区别|的功能|的作用|的用途|的特点|有几个|包括哪些|包括什么|是多少|怎样|如何)\s*？\s*$/,
    /^(.{2,60}?)(怎么说|怎么理解|什么意思|是什么[啊吗呢吧]?)\s*？\s*$/,
  ]
  let isAsk = false
  let askMatch = null
  for (const pat of askPatterns) {
    const m = stem.match(pat)
    if (m) { isAsk = true; askMatch = m; break }
  }
  // 兜底：以 "？" 结尾且不是 "什么" 疑问词的也算广义问句
  if (!isAsk && /[？?]\s*$/.test(stem) && /什么|哪|怎么|如何|多少|几个|谁|哪/.test(stem)) {
    isAsk = true
  }
  if (!isAsk) return null

  // 答案不能为空且不能是"是/否"等单词
  const answer = String(q.answer || '').trim()
  if (!answer || answer.length < 2) return null
  if (['是', '否', '对', '错', '正确', '错误', '有', '没有', 'yes', 'no'].includes(answer)) return null

  // 转换题干：把 "X 是什么？" 转换为 "X 是____。"
  let newStem = stem
  if (askMatch) {
    // 保留前导 X，把问号短语（"是什么"/"有什么区别"）替换为 "是____"
    const subject = askMatch[1]
    const askPhrase = askMatch[2]
    // 把 askPhrase 第一个动词留下，后面加 ____
    // 例："是什么" → "是____"  ； "的区别" → "的区别是____"
    if (askPhrase.startsWith('是什么')) {
      newStem = subject + '是____。'
    } else if (askPhrase.startsWith('的')) {
      // 形如 "X 的区别" → "X 的区别是____"
      newStem = subject + askPhrase + '是____。'
    } else {
      newStem = subject + '是____。'
    }
  } else {
    // 兜底：把问号去掉，加 "是____。"
    newStem = stem.replace(/[？?]\s*$/, '') + '是____。'
  }

  return {
    stem: newStem,
    originalStem: stem,
    analysisAdded: true,
  }
}

// ===== 2026-06-15 判断题"全正确"检测与自动反向 =====
// 弱模型（Spark Lite）常返回的判断题 answer 全为"正确"，
// 导致用户只需一直选"正确"即可答对，失去学习意义。
// 策略：在一组（同一批次/同一卡片集）判断题中，
//   - 若"正确"比例 > 75% 且至少有 2 道题，
//   - 将其中偶数索引题反向为"错误"：
//       * 重写 stem 为一个歪曲事实的陈述句（添加否定词、替换关键词）
//       * answer 设置为"错误"
//       * analysis 说明"错误的地方"与"正确表述"
//   - 保证最终"正确" : "错误" 约为 1 : 1
// 注：仅在 normalizeQuestion 之后、validateQuestion 之前调用（此时 stem 已有"判断以下说法是否正确："前缀，options 已是标准 2 项）
function rebalanceTrueFalseQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return questions
  const tfQuestions = []
  const tfIndices = []
  questions.forEach((q, idx) => {
    const qType = String(q.type || '').toLowerCase()
    if (qType === 'true_false' || qType === 'judge') {
      tfQuestions.push(q)
      tfIndices.push(idx)
    }
  })
  if (tfQuestions.length < 2) return questions // 题量太少无需反向

  const correctCount = tfQuestions.filter(q => String(q.answer || '').trim() === '正确').length
  const correctRatio = correctCount / tfQuestions.length
  if (correctRatio <= 0.75) return questions // 比例合理，无需反向

  // 需要反向的题数：让 correct 约等于 total/2
  const targetCorrect = Math.ceil(tfQuestions.length / 2)
  const needFlip = Math.max(0, correctCount - targetCorrect)
  if (needFlip === 0) return questions

  console.warn(`[rebalanceTrueFalseQuestions] 判断题"正确"比例 ${correctRatio.toFixed(2)} 过高，将反向 ${needFlip} 道`)

  // 选择偶数索引的题进行反向（优先选靠后的，保留前半为原始"正确"）
  let flipped = 0
  for (let i = tfQuestions.length - 1; i >= 0 && flipped < needFlip; i--) {
    // 跳过本身就是"错误"的题（本来就是错误，无需改）
    if (String(tfQuestions[i].answer || '').trim() !== '正确') continue

    const q = tfQuestions[i]
    const originalStem = String(q.stem || '').trim()
    // 去掉前缀"判断以下说法是否正确："，提取核心陈述句
    let core = originalStem.replace(/^判断(以下|下列)?(说法|陈述|描述|命题)?(是否)?(正确|对错|真假)[：: ]*/, '').trim()
    // 去掉末尾句号
    core = core.replace(/[。.]+$/, '')

    if (!core || core.length < 4) continue // 无法从题干提取陈述句，跳过

    // 生成"错误"版本的陈述句：添加否定词/替换关键词
    const wrongResult = makeFalseStatement(core, q.knowledgePoint)
    if (!wrongResult) continue

    // 重建题干（保留前缀）
    const newStem = '判断以下说法是否正确：' + wrongResult.statement + '。'

    // 反向
    questions[tfIndices[i]] = {
      ...q,
      stem: newStem,
      answer: '错误',
      analysis: wrongResult.analysis,
    }
    flipped++
    console.warn(`[rebalanceTrueFalseQuestions] 已反向第 ${i + 1} 道判断题: "${core.slice(0, 30)}" → "${wrongResult.statement.slice(0, 30)}"`)
  }

  return questions
}

// 把一个知识点陈述句改写为"错误"的陈述句，并提供解析
function makeFalseStatement(core, knowledgePoint) {
  if (!core) return null
  const kp = String(knowledgePoint || '').trim()
  const statement = core
  let wrong = ''
  let explanation = ''
  let method = 'negate'

  // 策略1：包含"是/为"等判断词 → 在"是"前加"不"
  // 例："CPU是中央处理器的缩写" → "CPU不是中央处理器的缩写"
  const shiMatch = statement.match(/^(.+?)(是|为|指的是|指的是|就是|属于)(.+)$/)
  if (shiMatch) {
    const prefix = shiMatch[1]
    const verb = shiMatch[2]
    const rest = shiMatch[3]
    // 如果已经包含"不"，则去掉"不"
    if (/不/.test(verb + rest.slice(0, 3))) {
      wrong = prefix + verb + rest.replace(/^不/, '')
    } else {
      wrong = prefix + '不是' + rest
    }
    explanation = `原表述为"${statement}"，正确表述应为"${statement}"。本题在"${verb}"前加"不"使陈述变为错误。`
    method = 'negate_shi'
  }

  // 策略2：包含数字（如"4个"、"2"、"3"等）→ 将数字加 1 或翻转
  if (!wrong) {
    const numMatch = statement.match(/^(.+?)(\d+)([\u4e00-\u9fa5]*)(.*)$/)
    if (numMatch) {
      const before = numMatch[1]
      const num = parseInt(numMatch[2], 10)
      const unit = numMatch[3] || ''
      const after = numMatch[4] || ''
      if (!isNaN(num) && num > 0 && num < 1000) {
        const newNum = num + 1
        wrong = before + newNum + unit + after
        explanation = `原表述中的数字为"${num}${unit}"，此处故意写为"${newNum}${unit}"。正确表述应为"${statement}"。`
        method = 'change_number'
      }
    }
  }

  // 策略3：包含"包括/包含/由…组成"等列举动词 → 在宾语处替换或删除关键字
  if (!wrong) {
    const includeMatch = statement.match(/^(.+?)(包括|包含|有|含有|由.+组成)(.+)$/)
    if (includeMatch) {
      const subject = includeMatch[1]
      const verb = includeMatch[2]
      const objects = includeMatch[3]
      // 把宾语中的第一个词替换为"不包括不相关的内容"
      wrong = subject + verb + '不包括上述任何内容'
      explanation = `原表述为"${statement}"，本题错误地替换了列举项。正确表述应为"${statement}"。`
      method = 'replace_list'
    }
  }

  // 策略4：兜底——在句首加"不是" / 添加"不"字
  if (!wrong) {
    // 如果 statement 已有"不"字，去掉它（双重否定=肯定，但我们要错误陈述，所以要把正确的→错误）
    // 这里简单策略：如果没"不"，加"不"到第一个动词前
    if (/不/.test(statement)) {
      wrong = statement.replace(/不/, '')
    } else {
      // 在句首加"错误观点：" 并在第一个动词前加"不"
      // 找第一个中文动词/判断词
      const firstVerb = statement.match(/^([^\u4e00-\u9fa5]*)([\u4e00-\u9fa5]+?)(是|有|为|指|包|包|含)/)
      if (firstVerb) {
        const idx = statement.indexOf(firstVerb[3])
        wrong = statement.slice(0, idx) + '不' + statement.slice(idx)
      } else {
        wrong = '不是' + statement
      }
    }
    explanation = `原表述为"${statement}"，本题添加或删除"不"字使陈述变为错误。`
    method = 'fallback_negate'
  }

  return {
    statement: wrong,
    analysis: `${explanation}（该题为算法自动反向，仅供学习检测使用；知识点原文：${kp || statement}）`,
    method,
  }
}

// ===== 校验单道题目 =====
function validateQuestion(q) {
  const errors = []
  const qType = (q.type || 'single_choice').toLowerCase()

  // ===== 题干基础校验 =====
  if (!q.stem || typeof q.stem !== 'string' || q.stem.trim().length === 0) {
    errors.push('题干为空')
  } else {
    const stem = q.stem.trim()
    // 题干不能太短
    if (stem.length < 4) errors.push('题干过短')
    // 题干不能太长（防止 AI 把整个答案塞进题干）
    if (stem.length > 300) errors.push('题干过长（>300字）')
    // 题干不能是单独的字母或序号
    if (/^[A-Da-d]\.?$/.test(stem)) errors.push('题干是单字母')
    // 题干不能只是状态词
    if (FORBIDDEN_STATUS_WORDS.some(w => stem === w)) errors.push('题干是状态词')
  }

  if (!q.type) {
    errors.push('缺少 type 字段')
  }

  // ===== 选择题（单选/多选）严格校验 =====
  if (qType === 'single_choice' || qType === 'multi_choice') {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push('选项不足（至少 2 个）')
    } else {
      // 必须有 2-6 个选项
      if (q.options.length > 6) errors.push('选项过多（>6）')
      const labels = []
      const texts = []
      let labelInvalid = false
      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i]
        if (!opt || !opt.label || !opt.text) {
          errors.push('选项格式不完整')
          continue
        }
        const label = String(opt.label).trim()
        const text = String(opt.text).trim()
        // 1. label 必须是 A-Z（选择题标准）
        if (qType === 'single_choice' || qType === 'multi_choice') {
          if (!/^[A-Z]$/.test(label)) {
            errors.push(`选项 label 非标准: "${label}"（必须是 A/B/C/D）`)
            labelInvalid = true
          }
        }
        // 2. label 不能是判断词或状态词
        if (FORBIDDEN_JUDGMENT_WORDS.includes(label) || FORBIDDEN_STATUS_WORDS.includes(label)) {
          errors.push(`选项 label 用了判断/状态词: "${label}"`)
          labelInvalid = true
        }
        // 3. text 不能是判断词或状态词（除非是判断题，但这里是选择题所以一律禁止）
        if (FORBIDDEN_JUDGMENT_WORDS.includes(text)) {
          errors.push(`选项 text 用了判断词: "${text}"`)
          continue
        }
        if (containsForbiddenKeyword(text, FORBIDDEN_STATUS_WORDS)) {
          errors.push(`选项 text 包含状态词: "${text}"`)
          continue
        }
        // 4. text 必须是完整的陈述句，不能是知识点标签
        if (isKnowledgeLabel(text)) {
          errors.push(`选项 text 像是知识点标签: "${text}"`)
          continue
        }
        // 5. text 不能过短（仅 1 字符且非数字/数学符号时才拒绝）
        // 数学题选项如 "0", "1", "C", "x" 等是合法的
        if (text.length < 1) {
          errors.push(`选项 text 为空`)
          continue
        }
        // 6. text 不能是纯标点符号（但纯数字/字母/数学表达式是合法的）
        if (/^[\s\.,!?;:'"()\[\]{}\-_<>\/\\|@#$%^&*`~]+$/.test(text)) {
          errors.push(`选项 text 是纯标点符号: "${text}"`)
          continue
        }
        if (!labelInvalid) {
          labels.push(label)
          texts.push(text)
        }
      }

      // 7. label 不能重复
      if (new Set(labels).size !== labels.length) {
        errors.push('选项 label 重复')
      }

      // 8. text 不能有大量重复（题干-选项内容冗余）
      if (q.stem && texts.length > 0) {
        const stem = String(q.stem).trim()
        // 题干与任一选项 text 高度相似（>0.85）则视为冗余（放宽阈值，减少误判丢弃）
        for (const text of texts) {
          if (jaccardSimilarity(stem, text) > 0.85) {
            errors.push(`题干与选项内容高度重复: stem="${stem.slice(0, 30)}..." / option="${text.slice(0, 30)}..."`)
            break
          }
        }
        // 选项 text 之间也不能高度相似
        // 但仅差正负号/常数差异的数学表达式不算重复（如 "1/(2√x)" vs "-1/(2√x)"）
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            if (jaccardSimilarity(texts[i], texts[j]) > 0.9) {
              // 检查是否仅差正负号
              const a = texts[i].replace(/[\s]/g, '')
              const b = texts[j].replace(/[\s]/g, '')
              const aNoSign = a.replace(/^[+-]/, '')
              const bNoSign = b.replace(/^[+-]/, '')
              if (aNoSign === bNoSign && a !== b) continue // 仅差正负号，跳过
              errors.push(`两个选项内容高度重复: "${texts[i].slice(0, 20)}" / "${texts[j].slice(0, 20)}"`)
              break
            }
          }
        }
      }
    }

    // ===== 答案校验 =====
    if (!q.answer || typeof q.answer !== 'string') {
      errors.push('答案为空')
    } else {
      const ans = String(q.answer).trim().toUpperCase()
      // 防御：确保 options 是数组
      const safeOptions = Array.isArray(q.options) ? q.options : []
      const labels = safeOptions.map(o => o.label)
      if (qType === 'single_choice') {
        if (!labels.includes(ans)) errors.push(`答案 "${ans}" 不在选项 ${labels.join('/')} 中`)
      }
      if (qType === 'multi_choice') {
        const maxOptions = labels.length
        const chars = ans.split('').filter(c => /[A-Z]/.test(c))
        // 多选题答案至少 1 个选项（放宽：AI 可能生成只有 1 个正确答案的多选题）
        if (chars.length < 1) errors.push('多选题答案为空')
        if (chars.length > maxOptions) errors.push(`多选题答案超过选项数量（${chars.length} > ${maxOptions}）`)
        for (const ch of chars) {
          if (!labels.includes(ch)) {
            errors.push(`多选题答案 "${ch}" 不在选项中`)
            break
          }
        }
      }
    }

    // ===== 单选题题干校验：仅作警告，不拒绝（AI 生成的题干格式多样） =====
    if (qType === 'single_choice' && q.stem) {
      const stem = String(q.stem).trim()
      const hasQuestionMark = /[？?]/.test(stem)
      const hasQuestionWord = /(什么|哪一|哪项|哪些|哪个|为何|为什么|怎么|如何|是否|能否|哪|以下|下列|正确|错误|属于|不属于|符合|不符合|描述|说法|叙述|关于)/.test(stem)
      if (!hasQuestionMark && !hasQuestionWord) {
        // 降级为警告，不拒绝题目
        console.warn(`[validateQuestion] 单选题干缺少问号/疑问词（不拒绝）: "${stem.slice(0, 50)}"`)
      }
      // 题干本身不能是知识点标签（过短且以"的XX"结尾）
      if (/^[\s\S]{2,30}的(特点|定义|含义|概念|分类|区别|作用|功能|原理|方法|组成|结构|流程|标准)$/.test(stem) && !hasQuestionMark) {
        errors.push(`题干本身是知识点标签而非问题: "${stem}"`)
      }
    }

    // ===== 多选题题干：自动补全"(多选题)"标记 =====
    if (qType === 'multi_choice' && q.stem) {
      const stem = String(q.stem).trim()
      if (!/多选/.test(stem) && !/可多选/.test(stem)) {
        // 自动补全标记，不拒绝题目
        q.stem = stem + '（多选题）'
      }
    }
  }

  // ===== 判断题严格校验 =====
  if (qType === 'true_false' || qType === 'judge') {
    // 判断题必须有 options 且为 ["正确", "错误"]
    if (!Array.isArray(q.options) || q.options.length !== 2) {
      errors.push('判断题必须有 2 个选项（正确/错误）')
    } else {
      const labels = q.options.map(o => o.label || o.text || '')
      const hasCorrect = labels.includes('正确')
      const hasWrong = labels.includes('错误')
      if (!hasCorrect || !hasWrong) {
        errors.push('判断题选项必须包含"正确"和"错误"')
      }
    }
    if (!q.answer || typeof q.answer !== 'string') {
      errors.push('答案为空')
    } else {
      const ans = String(q.answer).trim()
      if (!['正确', '错误'].includes(ans)) {
        errors.push(`判断题答案必须是"正确"或"错误"，实际是 "${ans}"`)
      }
    }
    // 判断题题干应包含陈述句
    if (q.stem) {
      const stem = String(q.stem).trim()
      if (stem.replace(/[。.?？!,！,，、;；:：""''（）()\[\]【】\s]/g, '').length < 4) {
        errors.push('判断题题干过短，无可判断内容')
      }
    }
  }

  // ===== 填空题校验 =====
  if (qType === 'fill_blank') {
    if (!q.answer || typeof q.answer !== 'string' || q.answer.trim().length === 0) {
      errors.push('填空题答案为空')
    }
    // 填空题题干必须有 ____ 或 () 标记
    if (q.stem) {
      const stem = String(q.stem)
      if (!/_{2,}|\(\s*\)|（\s*）|\[\s*\]|【\s*】/.test(stem)) {
        errors.push('填空题题干缺少 ____ 或 () 填空标记')
      }
    }
  }

  return errors.length === 0 ? null : errors
}

// ===== 语义去重 =====
function deduplicateQuestions(newQuestions, existingQuestions) {
  const result = []
  for (const newQ of newQuestions) {
    const newStem = String(newQ.stem || '').toLowerCase()
    let isDuplicate = false

    // 与已有题目比较
    for (const exQ of existingQuestions) {
      const exStem = String(exQ.stem || '').toLowerCase()
      const sim = jaccardSimilarity(newStem, exStem)
      if (sim >= SIMILARITY_THRESHOLD) {
        isDuplicate = true
        break
      }
    }

    // 与本次已通过的新题目比较
    if (!isDuplicate) {
      for (const added of result) {
        const addedStem = String(added.stem || '').toLowerCase()
        const sim = jaccardSimilarity(newStem, addedStem)
        if (sim >= SIMILARITY_THRESHOLD) {
          isDuplicate = true
          break
        }
      }
    }

    if (!isDuplicate) {
      result.push(newQ)
    }
  }
  return result
}

// ===== 过滤过期题目 =====
// 无关联卡片（cardId 为空）的题目视为无效，直接过滤
function filterExpiredQuestions(existingQuestions, cards) {
  const cardUpdateMap = {}
  for (const card of cards) {
    cardUpdateMap[card.id] = card.updatedAt || card.createdAt || 0
  }

  return existingQuestions.filter(q => {
    if (!q.cardId) return false
    const cardUpdatedAt = cardUpdateMap[q.cardId] || 0
    const questionCreatedAt = q.createdAt || 0
    return questionCreatedAt >= cardUpdatedAt
  })
}

// ===== 将题目匹配回原始卡片，继承 unitId / categoryId =====
function matchQuestionsToCards(questions, cards) {
  if (!cards || cards.length === 0) return questions
  // 建立卡片索引：knowledge_point → 卡片（兜底用）
  const kpMap = new Map()
  for (const c of cards) {
    const kp = String(c.knowledge_point || '').trim().toLowerCase()
    if (kp && !kpMap.has(kp)) kpMap.set(kp, c)
  }
  return questions.map(q => {
    // 已经有 unitId 且已有 categoryId 的不再覆盖
    if (q.unitId != null && q.categoryId != null) return q

    // 第一步：cardId 精确匹配（优先，最可靠）
    // cardId 已在解析阶段映射为真实 UUID，此处直接查找
    if (q.cardId) {
      const matchedCard = cards.find(c => c.id === String(q.cardId))
      if (matchedCard) {
        return {
          ...q,
          unitId: q.unitId != null ? q.unitId : (matchedCard.unitId || null),
          categoryId: q.categoryId != null ? q.categoryId : (matchedCard.categoryId || null),
          chapterId: q.chapterId != null ? q.chapterId : (matchedCard.chapterId || null),
          cardId: matchedCard.id,
        }
      }
    }

    // 第二步：知识点精确匹配（兜底）
    const qKp = String(q.knowledgePoint || '').trim().toLowerCase()
    if (qKp && kpMap.has(qKp)) {
      const matchedCard = kpMap.get(qKp)
      return {
        ...q,
        unitId: q.unitId != null ? q.unitId : (matchedCard.unitId || null),
        categoryId: q.categoryId != null ? q.categoryId : (matchedCard.categoryId || null),
        chapterId: q.chapterId != null ? q.chapterId : (matchedCard.chapterId || null),
        cardId: q.cardId || matchedCard.id,
      }
    }

    // 第三步：知识点模糊匹配（兜底）—— 包含关系
    if (qKp) {
      for (const [kp, card] of kpMap) {
        if (kp.includes(qKp) || qKp.includes(kp)) {
          return {
            ...q,
            unitId: q.unitId != null ? q.unitId : (card.unitId || null),
            categoryId: q.categoryId != null ? q.categoryId : (card.categoryId || null),
            chapterId: q.chapterId != null ? q.chapterId : (card.chapterId || null),
            cardId: q.cardId || card.id,
          }
        }
      }
    }

    // 未匹配：返回原题，不继承任何字段
    return q
  })
}

// ===== 2026-06-15 强模型降级路径 / 兼容路径 =====
/**
 * 弱模型出题封装（带进度 Toast）
 * @returns {Promise<{questions: Array, error: ?string, parseErrorReason: ?string}>}
 */
async function tryGenerateWithWeakModel(cards, statusMap, validQuestions, testType, config, showToast, categoryName = '', categoryPurpose = '', difficulty = undefined) {
  try {
    const weakResult = await generateQuestionsForWeakModel(
      cards, statusMap, validQuestions, testType, config,
      {
        parallel: false,
        onBatchComplete: ({ batchIdx, type, difficulty: d, generated, error, progress }) => {
          if (typeof showToast === 'function') {
            const label = LITE_QUESTION_TYPES.find(t => t.type === type)?.label || type
            const diffLabel = d ? `难度${d}` : ''
            if (error) {
              showToast(`第 ${batchIdx + 1} 批 ${label}(${diffLabel}) 失败：${error}`, 'warning')
            } else if (progress && progress.totalTarget > 0) {
              // 显示总体进度
              const pct = Math.round((progress.totalGenerated / progress.totalTarget) * 100)
              showToast(`进度 ${pct}% (${progress.totalGenerated}/${progress.totalTarget}) - ${label}(${diffLabel}) +${generated}`, 'info')
            }
          }
        },
        categoryName,
        categoryPurpose,
        difficulty,
      }
    )
    if (typeof showToast === 'function' && weakResult.callCount > 1) {
      const target = weakResult.validation?.overall?.expected || 0
      const actual = weakResult.validation?.overall?.actual || 0
      showToast(`弱模型出题完成：${weakResult.callCount} 次调用，成功 ${weakResult.successCount}，失败 ${weakResult.failedCount}，生成 ${actual}/${target} 道题目`, 'info')
    }
    // 细分失败原因：参考弱模型结果中的调用情况
    let parseErrorReason = null
    if (weakResult.questions.length === 0) {
      if (weakResult.failedCount > 0 && weakResult.totalGenerated === 0) {
        parseErrorReason = 'all_calls_failed'
      } else {
        parseErrorReason = 'all_validation_failed'
      }
    }
    return {
      questions: weakResult.questions,
      error: null,
      parseErrorReason,
    }
  } catch (err) {
    const classified = classifyError(err)
    return { questions: [], error: classified.message, parseErrorReason: null }
  }
}

/**
 * 原单次大批量出题（降级路径 / 兼容路径）
 * 用于：① 强模型新策略失败时降级 ② 非弱模型/强模型的 AI 服务
 * @returns {Promise<{questions: Array, error: ?string, parseErrorReason: ?string}>}
 */
async function runLegacySingleBatch(cards, statusMap, validQuestions, testType, config, categoryName = '', categoryPurpose = '') {
  const isSparkLite = config && config.aiServiceMode === 'iflytek-spark'  // 兼容保留

  // 构建标记映射表（标记方案核心）：cardId → 标记, 标记 → {cardId, unitId, categoryId}
  const cardMarkerMap = new Map()
  const markerDataMap = new Map()
  cards.forEach((card, idx) => {
    const marker = `标记${idx + 1}`
    cardMarkerMap.set(String(card.id || '').trim(), marker)
    markerDataMap.set(marker, {
      cardId: card.id,
      unitId: card.unitId || null,
      categoryId: card.categoryId || null,
      chapterId: card.chapterId || null,
    })
  })

  const prompt = buildPrompt(cards, statusMap, validQuestions, testType, isSparkLite, cardMarkerMap, categoryName, categoryPurpose)
  const startTime = Date.now()
  let rawResponse = ''
  try {
    rawResponse = await withRetry(() => generateTestQuestions(prompt, config))
    const durationMs = Date.now() - startTime
    // 记录 AI 调用日志
    logAiCall({
      purpose: 'test-question-generation',
      modelName: resolveModelName(config.aiServiceMode, config.model, config),
      durationMs,
      status: 'success',
      tokens: 0,
      prompt: prompt,
      response: rawResponse || '',
    })
  } catch (err) {
    const durationMs = Date.now() - startTime
    // 记录 AI 调用失败日志
    logAiCall({
      purpose: 'test-question-generation',
      modelName: resolveModelName(config.aiServiceMode, config.model, config),
      durationMs,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: prompt,
      response: '',
    })
    const classified = classifyError(err)
    return { questions: [], error: classified.message, parseErrorReason: null }
  }

  const parsed = parseQuestionResponse(rawResponse, config.aiServiceMode)
  if (!parsed || parsed.length === 0) {
    return { questions: [], error: null, parseErrorReason: 'parse_failed' }
  }

  // 标记方案：优先用标记直接映射 cardId/unitId/categoryId
  const markerMapped = parsed.map(q => {
    if (q.cardId && markerDataMap.has(String(q.cardId))) {
      const data = markerDataMap.get(String(q.cardId))
      return { ...q, cardId: data.cardId, unitId: data.unitId, categoryId: data.categoryId, chapterId: data.chapterId }
    }
    return q
  })

  const validated = []
  for (const q of markerMapped) {
    const normalized = normalizeQuestion(q)
    const errors = validateQuestion(normalized)
    if (!errors) {
      validated.push(normalized)
    } else {
      console.warn(`[validateQuestion] 丢弃题目: ${String(normalized.stem || '').slice(0, 40)}...`, errors)
    }
  }
  // 判断题"全正确"反向
  rebalanceTrueFalseQuestions(validated)
  if (validated.length === 0) {
    return { questions: [], error: null, parseErrorReason: 'validation_failed' }
  }
  return { questions: validated, error: null, parseErrorReason: null }
}

// ===== 核心方法：更新题库 =====
/**
 * 更新题库：根据单元/分类的卡片和掌握状态，调用 AI 生成新题目
 * @param {'unit'|'category'} testType - 检测类型
 * @param {string} id - 单元 ID 或分类 ID
 * @param {object} config - AI 配置 { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey }
 * @param {function} showToast - Toast 提示函数
 * @param {string} userId - 当前用户 ID
 * @param {number|undefined} difficulty - 目标难度（1=简易, 2=中等, 3=困难），undefined 表示不限难度
 * @returns {Promise<{success: boolean, added: number, filtered: number, total: number, reason?: string}>}
 */
export async function updateQuestionBank(testType, id, config, showToast, userId, difficulty = undefined, onProgress = null) {
  // 记录 AI 题库生成的开始时间，用于筛选日志
  const genStartTime = Date.now()

  // 进度回调辅助函数
  const reportProgress = (percent, detail) => {
    if (typeof onProgress === 'function') {
      try { onProgress(percent, detail) } catch (_) { /* ignore */ }
    }
  }
  try {
    // 1. 获取卡片数据
    let cards = []
    if (testType === TEST_TYPES.UNIT) {
      cards = await getCardsByUnit(id)
    } else if (testType === TEST_TYPES.CHAPTER) {
      cards = await getCardsByChapter(id)
    } else {
      cards = await getAllCardsByCategory(id)
    }

    reportProgress(5, `获取到 ${cards.length} 张卡片，准备生成题目...`)

    if (!cards || cards.length === 0) {
      showToast('当前没有卡片，无法生成题目', 'warning')
      return { success: false, added: 0, filtered: 0, total: 0, reason: 'no_cards' }
    }

    // 2. 获取掌握状态
    const categoryId = (testType === TEST_TYPES.UNIT || testType === TEST_TYPES.CHAPTER)
      ? (cards[0]?.categoryId || '')
      : id
    const statusMap = await getCardStatusesByCategory(categoryId)

    // 2.5 获取分类信息（名称 + 目的），作为出题必要参数传递给 AI
    let categoryName = ''
    let categoryPurpose = ''
    try {
      const category = categoryId ? await getCategory(categoryId) : null
      if (category) {
        categoryName = String(category.name || '').trim()
        categoryPurpose = String(category.purpose || '').trim()
      }
    } catch (e) {
      console.warn('[updateQuestionBank] 获取分类信息失败，将使用空分类上下文:', e?.message)
    }

    // 3. 获取已有题目
    const existingQuestions = await getTestQuestions(testType, id)

    // 4. 过滤过期题目
    const validQuestions = filterExpiredQuestions(existingQuestions, cards)
    const filteredCount = existingQuestions.length - validQuestions.length

    // 5. 三路分流：弱模型多次小批量 / 强模型省 token / 其它走原单次大批量
    let validated = []
    let parseErrorReason = null

    if (isWeakModel(config)) {
      // 5.1 弱模型：每次 1 种题型、≤5 张卡片，多次串行
      const weakResult = await tryGenerateWithWeakModel(cards, statusMap, validQuestions, testType, config, showToast, categoryName, categoryPurpose, difficulty)
      if (weakResult.error) {
        return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: 'ai_failed' }
      }
      validated = weakResult.questions
      if (validated.length === 0) parseErrorReason = weakResult.parseErrorReason
    } else if (isStrongModel(config)) {
      // 5.2 强模型：复用 analyzeQuestionMatrix + 12-15 张/批 + 1-2 题型组合 + 难度递进
      try {
        const strongResult = await generateQuestionsForStrongModel(
          cards, statusMap, validQuestions, testType, config,
          {
            onBatchComplete: ({ progress }) => {
              // 更新浮动任务进度条（5%-95% 范围映射）
              if (progress && progress.totalTarget > 0) {
                const pct = Math.min(95, 5 + Math.round((progress.totalGenerated / progress.totalTarget) * 90))
                reportProgress(pct, `AI 出题中... ${progress.totalGenerated}/${progress.totalTarget}`)
              }
            },
            difficulty,
            categoryName,
            categoryPurpose,
          }
        )
        validated = strongResult.questions
        if (validated.length === 0) {
          parseErrorReason = strongResult.failedCount > 0 ? 'all_calls_failed' : 'validation_failed'
        }
        if (typeof showToast === 'function' && strongResult.callCount > 1) {
          const target = strongResult.validation?.overall?.expected || 0
          const actual = strongResult.validation?.overall?.actual || 0
          showToast(`强模型出题完成：${strongResult.callCount} 次调用，成功 ${strongResult.successCount}，失败 ${strongResult.failedCount}，生成 ${actual}/${target} 道题目`, 'info')
        }
      } catch (err) {
        // 强模型新策略失败 → 自动降级到原单次大批量
        console.warn(`[updateQuestionBank] 强模型省 token 策略失败，降级到单次大批量:`, err?.message)
        showToast(`强模型新策略失败，自动降级：${err?.message || '未知错误'}`, 'warning')
        // 降级调用原逻辑
        const legacyResult = await runLegacySingleBatch(cards, statusMap, validQuestions, testType, config, categoryName, categoryPurpose)
        if (legacyResult.error) {
          showToast(legacyResult.error, 'error')
          return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: 'ai_failed' }
        }
        validated = legacyResult.questions
        if (validated.length === 0) parseErrorReason = legacyResult.parseErrorReason
      }
    } else {
      // 5.3 兼容：原单次大批量（适用于未知 AI 服务或显式 legacy 模式）
      const legacyResult = await runLegacySingleBatch(cards, statusMap, validQuestions, testType, config, categoryName, categoryPurpose)
      if (legacyResult.error) {
        showToast(legacyResult.error, 'error')
        return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: 'ai_failed' }
      }
      validated = legacyResult.questions
      if (validated.length === 0) parseErrorReason = legacyResult.parseErrorReason
    }

    if (validated.length === 0) {
      if (parseErrorReason === 'all_calls_failed') {
        showToast('AI 所有调用均失败，请检查网络或重试', 'error')
      } else if (parseErrorReason === 'all_validation_failed') {
        showToast('AI 生成的题目均未通过校验（格式不符合要求），可尝试切换到 DeepSeek 等强模型', 'error')
      } else if (parseErrorReason === 'fill_blank_unfixable') {
        showToast('填空题题干缺少 ____ 标记，已尝试自动转换但仍失败；可重试或切换模型', 'error')
      } else if (parseErrorReason === 'validation_failed') {
        showToast('AI 生成的题目均未通过校验，请重试', 'error')
      } else {
        showToast('AI 未生成有效题目，请重试', 'error')
      }
      return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: parseErrorReason || 'parse_failed' }
    }

    // 9. 去重
    reportProgress(96, `去重中... ${validated.length} 道候选`)
    const deduplicated = deduplicateQuestions(validated, validQuestions)

    if (deduplicated.length === 0) {
      showToast('AI 生成的题目与已有题目重复', 'warning')
      return { success: true, added: 0, filtered: filteredCount, total: validQuestions.length, reason: 'all_duplicates' }
    }

    // 10. 第一步（生成入库）不限制数量：确保每个知识点、4个难度、4个题型都齐全
    // 数量限制在第二步（检测时随机挑选）执行
    const finalQuestions = deduplicated

    // 11. 根据知识点匹配回原始卡片，继承 unitId / categoryId（解决分类检测归类问题）
    const mappedQuestions = matchQuestionsToCards(finalQuestions, cards)

    // 调试日志：输出映射后的题目数量和 categoryId 情况
    const catIdCounts = {}
    for (const q of mappedQuestions) {
      const cid = q.categoryId || 'NULL'
      catIdCounts[cid] = (catIdCounts[cid] || 0) + 1
    }

    // 11.5 兜底：若 AI 未返回 cardId 或 matchQuestionsToCards 未匹配上，
    // 题目 unitId/categoryId 可能为 null，导致题库管理/分类检测查询不到。
    // 这里从调用方的 id 参数兜底。
    // 分类检测：题目属于整个分类，不应挂到某个具体单元 → unitId 保持 null
    // 单元检测：直接使用调用方传入的单元 ID
    // 章节检测：categoryId 从卡片获取，unitId 保持 null
    let fallbackUnit = null
    let fallbackCategoryId = null
    let fallbackChapterId = null
    
    if (testType === TEST_TYPES.CATEGORY) {
      fallbackUnit = null
      fallbackCategoryId = id
      fallbackChapterId = cards[0]?.chapterId || ''
    } else if (testType === TEST_TYPES.CHAPTER) {
      fallbackUnit = null
      fallbackCategoryId = cards[0]?.categoryId || ''
      fallbackChapterId = id
    } else {
      // UNIT
      fallbackUnit = id
      fallbackCategoryId = cards[0]?.categoryId || ''
      fallbackChapterId = cards[0]?.chapterId || ''
    }
    
    for (const q of mappedQuestions) {
      if (!q.unitId) q.unitId = fallbackUnit
      if (!q.categoryId) q.categoryId = fallbackCategoryId
      if (!q.chapterId) q.chapterId = fallbackChapterId || ''
    }

    // 12. 构造题目对象并批量添加
    const now = Date.now()
    const questionItems = mappedQuestions.map(q => ({
      id: generateId(),
      userId: userId || '',
      testType,
      targetId: id,
      type: String(q.type || 'single_choice'),
      cardId: q.cardId || null,
      unitId: q.unitId || null,
      categoryId: q.categoryId || null,
      chapterId: q.chapterId || null,
      stem: String(q.stem || ''),
      options: Array.isArray(q.options) ? q.options : [],
      answer: String(q.answer || ''),
      analysis: String(q.analysis || ''),
      difficulty: Number(q.difficulty) || 3,
      knowledgePoint: String(q.knowledgePoint || ''),
      createdAt: now,
      updatedAt: now,
    }))

    await addTestQuestions(questionItems)
    reportProgress(98, '保存中...')

    const newTotal = validQuestions.length + questionItems.length
    showToast(
      '题库更新成功！新增 ' + questionItems.length + ' 道题目' +
      (filteredCount > 0 ? '，过滤 ' + filteredCount + ' 道过期题目' : ''),
      'success'
    )

    // 保存 AI 调用日志 ID 到 sessionStorage，供 UnitTestPage 展示
    const allLogs = getAiCallLogs()
    const aiLogIds = allLogs
      .filter(log => log.purpose === 'test-question-generation' && log.timestamp >= genStartTime)
      .map(log => log.id)
    if (aiLogIds.length > 0) {
      sessionStorage.setItem('lastAiLogIds', JSON.stringify(aiLogIds))
    }

    return {
      success: true,
      added: questionItems.length,
      filtered: filteredCount,
      total: newTotal,
      message: '题库更新成功！新增 ' + questionItems.length + ' 道题目' +
        (filteredCount > 0 ? '，过滤 ' + filteredCount + ' 道过期题目' : ''),
    }
  } catch (err) {
    console.error('[testQuestionService] updateQuestionBank 失败:', err?.message)
    showToast('题库更新失败：' + (err?.message || '未知错误'), 'error')
    return { success: false, added: 0, filtered: 0, total: 0, reason: 'exception', message: '题库更新失败：' + (err?.message || '未知错误') }
  }
}

/**
 * 题库全量补全：可重复执行 updateQuestionBank 直到所有 (card, type, difficulty) 组合补全
 * 用于"随机难度"等需要完整题库的场景
 *
 * @param {string} testType - TEST_TYPES.UNIT / TEST_TYPES.CHAPTER / TEST_TYPES.CATEGORY
 * @param {string} id - 单元/章节/分类 ID
 * @param {Object} config - AI 配置
 * @param {Function} showToast - 提示函数
 * @param {string} userId - 用户 ID
 * @param {Function} onProgress - 进度回调 (progress: 0-100, detail: string)
 * @param {Function} isCancelled - 取消检查函数，返回 true 时中止
 * @param {number} maxRounds - 最大轮次（防止无限循环），默认 10
 * @returns {Promise<{success: boolean, totalAdded: number, rounds: number, complete: boolean, reason?: string}>}
 */

// ===== 2026-06-20 题目生成质量校验（升级版） =====
// 升级点：
//  1) 新增：与 existingQuestions（已有题目）对比，统计重复率
//  2) 题型/难度分布统计
//  3) 支持 similarityThreshold 自定义
export function validateQuestionQuality(questions, cards = [], opts = {}) {
  const requireCardIds = opts.requireCardIds !== false
  const existingQuestions = Array.isArray(opts.existingQuestions) ? opts.existingQuestions : []
  const similarityThreshold = Number(opts.similarityThreshold) || 0.7
  const qs = Array.isArray(questions) ? questions : []
  const cardIdSet = new Set((cards || []).map(c => String(c.id || '')))
  const typesSeen = new Set()
  const difficultiesSeen = new Set()
  const stemsSeen = new Set()
  const problems = []
  let emptyStems = 0
  let emptyAnswers = 0
  let noCardId = 0
  let duplicateStems = 0
  const exactDupVsExisting = []
  const similarityDupVsExisting = []
  const typesCount = {}
  const difficultiesCount = {}
  const typeDifficultyCount = {}

  const existingNormalized = existingQuestions.map(eq => ({
    eq,
    stem: String(eq.stem || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[。，、；：“”‘’()（）\[\]【】]/g, ''),
    difficulty: Number(eq.difficulty) || 1,
    options: (Array.isArray(eq.options) ? eq.options : []).map(o => String(o.text || '').trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean),
    answer: String(eq.answer || '').trim().toLowerCase().replace(/\s+/g, ''),
  }))

  for (const q of qs) {
    const stem = String(q.stem || '').trim()
    const answer = String(q.answer || '').trim()
    const type = String(q.type || '').toLowerCase()
    const diff = Number(q.difficulty) || 1
    const cardId = String(q.cardId || '').trim()

    if (!stem) emptyStems += 1
    if (!answer) emptyAnswers += 1
    if (requireCardIds && !cardId) noCardId += 1
    if (stem) {
      const key = stem.slice(0, 60)
      if (stemsSeen.has(key)) duplicateStems += 1
      else stemsSeen.add(key)
    }

    typesSeen.add(type)
    difficultiesSeen.add(diff)
    typesCount[type] = (typesCount[type] || 0) + 1
    difficultiesCount[diff] = (difficultiesCount[diff] || 0) + 1
    const tdKey = `${type}_${diff}`
    typeDifficultyCount[tdKey] = (typeDifficultyCount[tdKey] || 0) + 1

    if (type === 'single_choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        problems.push({ type: 'single_choice', reason: 'options_missing', stem: stem.slice(0, 40) })
      }
    }
    if (type === 'multi_choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        problems.push({ type: 'multi_choice', reason: 'options_missing', stem: stem.slice(0, 40) })
      }
    }
    if (type === 'true_false') {
      if (!['正确', '错误', 'true', 'false', 'True', 'False'].includes(answer)) {
        problems.push({ type: 'true_false', reason: 'answer_invalid', stem: stem.slice(0, 40) })
      }
    }
    if (type === 'fill_blank') {
      if (!stem.includes('____')) {
        problems.push({ type: 'fill_blank', reason: 'no_blank_marker', stem: stem.slice(0, 40) })
      }
    }

    // ===== 与已有题目重复检测 =====
    const qNormalized = stem.trim().toLowerCase().replace(/\s+/g, '').replace(/[。，、；：“”‘’()（）\[\]【】]/g, '')
    const qOptions = (Array.isArray(q.options) ? q.options : []).map(o => String(o.text || '').trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean)
    let matched = false
    for (const record of existingNormalized) {
      if (matched) break
      const { eq, stem: eqNormalized, difficulty: eqDiff, options: eqOptions, answer: eqAnswer } = record
      if (qNormalized && qNormalized === eqNormalized && qNormalized.length > 15) {
        exactDupVsExisting.push({ newStem: stem.slice(0, 60), existingStem: String(eq.stem || '').slice(0, 60), reason: 'exact_stem' })
        matched = true
        break
      }
      const sim = simpleTextSimilarity(qNormalized, eqNormalized)
      if (sim >= similarityThreshold && qNormalized.length > 10) {
        similarityDupVsExisting.push({ newStem: stem.slice(0, 60), existingStem: String(eq.stem || '').slice(0, 60), similarity: Number(sim.toFixed(3)), reason: 'similar' })
        matched = true
        break
      }
      if (qOptions.length > 0 && eqOptions.length > 0 && diff === eqDiff) {
        const optionMatchCount = qOptions.filter(o => eqOptions.includes(o)).length
        if (optionMatchCount >= Math.min(2, qOptions.length, eqOptions.length)) {
          similarityDupVsExisting.push({ newStem: stem.slice(0, 60), existingStem: String(eq.stem || '').slice(0, 60), similarity: 1, reason: 'options_match' })
          matched = true
          break
        }
      }
      if ((type === 'fill_blank' || type === 'true_false') && qNormalized.length > 8 && eqAnswer && answer) {
        const sim2 = simpleTextSimilarity(qNormalized, eqNormalized)
        if (sim2 > 0.85 && answer.toLowerCase().replace(/\s+/g, '') === eqAnswer) {
          similarityDupVsExisting.push({ newStem: stem.slice(0, 60), existingStem: String(eq.stem || '').slice(0, 60), similarity: Number(sim2.toFixed(3)), reason: 'answer_match' })
          matched = true
          break
        }
      }
    }
  }

  // 覆盖卡片比例
  const uniqueCardIds = new Set(qs.map(q => String(q.cardId || '')).filter(Boolean))
  const cardsCovered = uniqueCardIds.size
  const totalCards = cardIdSet.size
  const coverageRatio = totalCards > 0 ? cardsCovered / totalCards : 0

  const totalDup = exactDupVsExisting.length + similarityDupVsExisting.length
  const duplicateRate = qs.length > 0 ? (totalDup / qs.length) : 0

  return {
    total: qs.length,
    types: Array.from(typesSeen),
    difficulties: Array.from(difficultiesSeen).sort(),
    emptyStems,
    emptyAnswers,
    noCardId,
    duplicateStems,
    cardsCovered,
    totalCards,
    coverageRatio,
    problems,
    typesCount,
    difficultiesCount,
    typeDifficultyCount,
    dupVsExistingExact: exactDupVsExisting.length,
    dupVsExistingSimilar: similarityDupVsExisting.length,
    dupVsExistingTotal: totalDup,
    duplicateRate,
    similarityThreshold,
    score: Math.max(0, Math.min(100,
      (qs.length > 0 ? 100 : 0)
      - emptyStems * 5 - emptyAnswers * 5 - duplicateStems * 3
      - problems.length * 3 - noCardId * 2,
    )),
  }
}

// 2026-06-20 单元/章节测试：目标（题型 × 难度）覆盖完整性校验（升级版）
// 给出该 scope 下还缺少的 (type, difficulty) 组合，便于提示用户继续补齐
// 新增：targetPerCell 目标数量，支持"每格出 N 题"的校验
export function computeTargetCoverage(questions, cards = [], targetTypes = null, targetDifficulties = [1, 2, 3], opts = {}) {
  const types = targetTypes || ['single_choice', 'multi_choice', 'true_false', 'fill_blank']
  const targetPerCell = Number(opts.targetPerCell) || 1
  const qs = Array.isArray(questions) ? questions.filter(q => q) : []

  const coverage = {}
  for (const t of types) for (const d of targetDifficulties) {
    coverage[`${t}_${d}`] = 0
  }
  for (const q of qs) {
    const key = `${String(q.type || '').toLowerCase()}_${Number(q.difficulty) || 1}`
    if (key in coverage) coverage[key] += 1
  }

  const missing = Object.entries(coverage).filter(([, v]) => v === 0).map(([k]) => k)
  const belowTarget = Object.entries(coverage).filter(([, v]) => v < targetPerCell).map(([k, v]) => ({ cell: k, have: v, need: targetPerCell }))

  const cellsPerCard = types.length * targetDifficulties.length
  const expectedTotalForTarget = cards.length * cellsPerCard * targetPerCell
  const totalExpected = Math.max(cards.length * cellsPerCard, expectedTotalForTarget)
  const progressRatio = totalExpected > 0 ? qs.length / totalExpected : 0

  return {
    total: qs.length,
    totalCells: types.length * targetDifficulties.length,
    coverage,
    missing,
    missingCount: missing.length,
    cardCount: cards.length,
    targetPerCell,
    belowTarget,
    belowTargetCount: belowTarget.length,
    progressRatio,
  }
}

export async function updateQuestionBankComplete(
  testType, id, config, showToast, userId,
  onProgress, isCancelled, maxRounds = 10
) {
  let totalAdded = 0
  let rounds = 0
  const startTime = Date.now()
  const roundDetails = [] // 每轮的详细记录

  for (let round = 1; round <= maxRounds; round++) {
    // 检查取消
    if (typeof isCancelled === 'function' && isCancelled()) {
      return { success: true, totalAdded, rounds: round - 1, complete: false, reason: 'cancelled', roundDetails }
    }

    // 检查完整性
    const checkResult = await checkQuestionBankCompleteness(testType, id)

    if (checkResult.complete) {
      if (typeof onProgress === 'function') {
        onProgress(100, `题库已完整（${checkResult.totalCombinations} 道题目）`)
      }
      return { success: true, totalAdded, rounds: round - 1, complete: true, roundDetails }
    }

    // 更新进度（含各维度统计）
    if (typeof onProgress === 'function') {
      const existingRatio = checkResult.totalCombinations > 0
        ? checkResult.existingCount / checkResult.totalCombinations
        : 0
      const progress = Math.round(existingRatio * 100)
      // 统计各题型缺失情况
      const missingByType = {}
      if (checkResult.missingByCard) {
        for (const mc of checkResult.missingByCard) {
          for (const m of (mc.missing || [])) {
            const t = m.type || 'unknown'
            missingByType[t] = (missingByType[t] || 0) + 1
          }
        }
      }
      const typeBreakdown = Object.entries(missingByType)
        .map(([t, c]) => `${t}:${c}`)
        .join(' ')
      onProgress(progress, `第 ${round}/${maxRounds} 轮：已有 ${checkResult.existingCount}/${checkResult.totalCombinations}（${progress}%），补全 ${checkResult.missingCount} 个 [${typeBreakdown}]`)
    }

    // 检查取消
    if (typeof isCancelled === 'function' && isCancelled()) {
      return { success: true, totalAdded, rounds: round - 1, complete: false, reason: 'cancelled', roundDetails }
    }

    // 执行一轮 updateQuestionBank（difficulty=undefined 表示生成所有难度的缺失题目）
    const roundStart = Date.now()
    const result = await updateQuestionBank(testType, id, config, showToast, userId, undefined)
    const roundDuration = Date.now() - roundStart
    rounds = round

    const roundDetail = {
      round,
      startTime: new Date(roundStart).toISOString(),
      durationMs: roundDuration,
      beforeMissing: checkResult.missingCount,
      beforeExisting: checkResult.existingCount,
      added: result.added || 0,
      success: result.success,
      reason: result.reason || null,
    }

    if (!result.success) {
      if (result.reason === 'no_cards') {
        roundDetail.error = 'no_cards'
        roundDetails.push(roundDetail)
        return { success: false, totalAdded, rounds: round, complete: false, reason: 'no_cards', roundDetails }
      }
      console.warn(`[updateQuestionBankComplete] 第 ${round} 轮失败: ${result.reason}`)
      if (typeof onProgress === 'function') {
        onProgress(undefined, `第 ${round} 轮生成失败：${result.reason || '未知原因'}`)
      }
    } else {
      totalAdded += (result.added || 0)
      if (typeof onProgress === 'function') {
        onProgress(undefined, `第 ${round} 轮完成，新增 ${result.added} 道，累计 ${totalAdded} 道`)
      }
    }

    roundDetails.push(roundDetail)

    // 如果本轮没有新增题目，且题库仍不完整，说明 AI 无法生成缺失的组合
    if (result.success && (result.added || 0) === 0) {
      console.warn(`[updateQuestionBankComplete] 第 ${round} 轮无新增题目，终止补全`)
      if (typeof onProgress === 'function') {
        onProgress(undefined, `AI 已无法生成更多题目，终止补全`)
      }
      break
    }
  }

  // 最终检查
  const finalCheck = await checkQuestionBankCompleteness(testType, id)
  const duration = Math.round((Date.now() - startTime) / 1000)

  return {
    success: true,
    totalAdded,
    rounds,
    complete: finalCheck.complete,
    missingCount: finalCheck.missingCount,
    totalCombinations: finalCheck.totalCombinations,
    existingCount: finalCheck.existingCount,
    duration,
    reason: finalCheck.complete ? 'complete' : 'max_rounds_reached',
    roundDetails,
  }
}

// ===== 题目管理方法 =====

/**
 * 删除题目
 */
export async function removeQuestion(questionId, showToast) {
  try {
    await deleteTestQuestion(questionId)
    showToast('题目已删除', 'success')
    return { success: true }
  } catch (err) {
    showToast('删除失败：' + (err?.message || '未知错误'), 'error')
    return { success: false }
  }
}

/**
 * 更新题目
 */
export async function editQuestion(questionId, patch, showToast) {
  try {
    const updated = await updateTestQuestion(questionId, patch)
    if (!updated) {
      showToast('题目不存在', 'error')
      return { success: false }
    }
    showToast('题目已更新', 'success')
    return { success: true, question: updated }
  } catch (err) {
    showToast('更新失败：' + (err?.message || '未知错误'), 'error')
    return { success: false }
  }
}

/**
 * 手动添加题目
 */
export async function addManualQuestion(questionData, showToast) {
  try {
    if (!questionData.stem || !String(questionData.stem).trim()) {
      showToast('题干不能为空', 'error')
      return { success: false }
    }
    if (!questionData.answer || !String(questionData.answer).trim()) {
      showToast('答案不能为空', 'error')
      return { success: false }
    }
    const item = await addManualTestQuestion(questionData)
    showToast('题目添加成功', 'success')
    return { success: true, question: item }
  } catch (err) {
    showToast('添加失败：' + (err?.message || '未知错误'), 'error')
    return { success: false }
  }
}

// ===== 核心方法：获取复习题目 =====
/**
 * 获取复习题目 - 从 testQuestions 表中随机抽取题目
 * 同一 cardId 相关的题目最多出现 2 次
 * 自动过滤过期题目（卡片内容更新后的旧题目）
 * 抽取数量无上限，直至抽完所有符合条件的题目
 * @param {'unit'|'category'} testType - 检测类型
 * @param {String} id - 单元ID或分类ID
 * @returns {Promise<{success: boolean, message: string, questions?: Array}>}
 */
export async function getReviewQuestions(testType, id) {
  try {
    // 1. 获取题目
    let questions = []
    if (testType === TEST_TYPES.UNIT) {
      questions = await getTestQuestionsByUnit(id)
    } else if (testType === TEST_TYPES.CHAPTER) {
      questions = await getTestQuestions(TEST_TYPES.CHAPTER, id)
    } else {
      questions = await getTestQuestionsByCategory(id)
    }

    if (!questions || questions.length === 0) {
      return { success: false, message: '暂无复习题目，请先更新题库' }
    }

    // 2. 获取卡片信息，构建 cardId → card.updatedAt 映射（用于判断题目是否过期）
    let cards = []
    if (testType === TEST_TYPES.UNIT) {
      cards = await getCardsByUnit(id)
    } else if (testType === TEST_TYPES.CHAPTER) {
      cards = await getCardsByChapter(id)
    } else {
      cards = await getAllCardsByCategory(id)
    }
    const cardUpdateMap = {}
    for (const card of cards) {
      cardUpdateMap[card.id] = card.updatedAt || card.createdAt || 0
    }

    // 3. 过滤过期题目：题目创建时间 < 卡片更新时间 → 卡片在题目生成后被更新过 → 题目过期
    const validQuestions = questions.filter(q => {
      if (!q.cardId) return true  // 无 cardId 的题目不过滤（兜底）
      const cardUpdatedAt = cardUpdateMap[q.cardId]
      if (!cardUpdatedAt || !q.createdAt) return true  // 缺少时间信息不过滤
      return q.createdAt >= cardUpdatedAt  // 题目创建时间 >= 卡片更新时间 → 未过期
    })

    if (validQuestions.length === 0) {
      return { success: false, message: '所有题目已过期，请更新题库' }
    }

    // 4. Fisher-Yates 洗牌算法（真正的随机打乱，比 sort(() => Math.random() - 0.5) 更均匀）
    const shuffled = [...validQuestions]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // 5. 每个知识点（cardId）最多 2 个题型（从打乱后的题目中取，确保随机性）
    const cardIdCount = {}
    const filtered = []
    for (const q of shuffled) {
      const cid = q.cardId || ''
      const count = cardIdCount[cid] || 0
      if (count < 2) {
        filtered.push(q)
        cardIdCount[cid] = count + 1
      }
    }

    // 6. 总数量限制：单元检测 ≤ 50 道，章节/分类检测 ≤ 100 道
    const maxTotal = testType === TEST_TYPES.UNIT ? 50 : 100

    let finalQuestions
    if (filtered.length <= maxTotal) {
      // 题目数不足上限，全部使用
      finalQuestions = filtered
    } else {
      // 题目数超过上限：确保每个知识点至少 1 题，再随机补充
      // 6.1 按知识点分组
      const cardIdGroups = {}
      for (const q of filtered) {
        const cid = q.cardId || ''
        if (!cardIdGroups[cid]) cardIdGroups[cid] = []
        cardIdGroups[cid].push(q)
      }
      const allCardIds = Object.keys(cardIdGroups)

      // 6.2 每个知识点先抽 1 题（确保覆盖）
      finalQuestions = []
      const remaining = []
      for (const cid of allCardIds) {
        const group = cardIdGroups[cid]
        // 随机选 1 题
        const pickIdx = Math.floor(Math.random() * group.length)
        finalQuestions.push(group[pickIdx])
        // 剩余题目加入候选池
        for (let i = 0; i < group.length; i++) {
          if (i !== pickIdx) remaining.push(group[i])
        }
      }

      // 6.3 从剩余题目中随机补充到 maxTotal
      // Fisher-Yates 打乱剩余题目
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
      }
      const need = maxTotal - finalQuestions.length
      if (need > 0) {
        finalQuestions = finalQuestions.concat(remaining.slice(0, need))
      }

      // 6.4 最终再次打乱（避免同一知识点的题目连在一起）
      for (let i = finalQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]]
      }
    }

    return {
      success: true,
      message: '成功抽取 ' + finalQuestions.length + ' 道复习题目',
      questions: finalQuestions,
    }
  } catch (e) {
    console.error('[testQuestionService] getReviewQuestions 失败:', e)
    return { success: false, message: '获取复习题目失败：' + (e.message || '未知错误') }
  }
}

// ===== 导出内部校验函数（供测试使用，业务代码不应直接调用）=====
// 仅在 vitest 环境下使用，production bundle 中通过 tree-shaking 会被消除
export const __test__ = {
  normalizeQuestion,
  validateQuestion,
  tryFixFillBlankStem,
  isKnowledgeLabel,
  normalizeChoiceLabel,
  containsForbiddenKeyword,
  jaccardSimilarity,
  isWeakModel,
  isStrongModel,  // 2026-06-15 强模型省 token 新增
  buildLitePromptByType,
  formatCardsForLiteBatch,
  chunkCards,
  generateQuestionsForWeakModel,
  // 2026-06-15 新增：本地题目矩阵相关
  analyzeQuestionMatrix,
  isBatchTypeSatisfied,
  formatExistingQuestionsForBatch,
  // 2026-06-15 强模型省 token 新增
  buildStrongModelTasks,
  buildStrongModelPrompt,
  parseMultiTypeResponse,
  generateQuestionsForStrongModel,
  MAX_QUESTIONS_PER_CARD_TYPE,
  FORBIDDEN_STATUS_WORDS,
  // 2026-06-17 章节引入后出题流程排查：暴露 matchQuestionsToCards 供测试
  matchQuestionsToCards,
  buildPrompt,
  FORBIDDEN_JUDGMENT_WORDS,
  // 2026-06-20 随机难度：暴露题库完整性检查供测试
  checkQuestionBankCompleteness,
  // 2026-06-20 题库全量补全：可重复执行直到补全
  updateQuestionBankComplete,
  // 2026-06-20 多批次并发：暴露并发任务运行器与校验工具
  runTasksConcurrently,
  validateQuestionQuality,
}

/**
 * 检查题库完整性：判断指定范围（单元/章节/分类）下，每张卡片是否已生成全部 (题型, 难度) 组合的题目
 * 用于"随机难度"测试前的预检：若不完整，应提示用户更新题库
 *
 * 完整性标准：每张卡片 × 每种题型(4种) × 每种难度(3档) = 12 道题目，至少各 1 道
 *
 * @param {string} testType - TEST_TYPES.UNIT / TEST_TYPES.CHAPTER / TEST_TYPES.CATEGORY
 * @param {string} id - 单元ID / 章节ID / 分类ID
 * @returns {Promise<{
 *   complete: boolean,
 *   missingCount: number,        // 缺失的 (card, type, difficulty) 组合数
 *   totalCombinations: number,   // 应有的组合总数 = cards.length * 4 * 3
 *   existingCount: number,       // 已满足的组合数
 *   cardsCount: number,          // 卡片总数
 *   missingByCard: Array<{cardId: string, cardFront: string, missing: Array<{type: string, difficulty: number}>}>,
 * }>}
 */
export async function checkQuestionBankCompleteness(testType, id) {
  try {
    // 1. 获取该范围下的全部卡片
    let cards = []
    if (testType === TEST_TYPES.UNIT) {
      cards = await getCardsByUnit(id)
    } else if (testType === TEST_TYPES.CHAPTER) {
      cards = await getCardsByChapter(id)
    } else {
      cards = await getAllCardsByCategory(id)
    }

    if (!cards || cards.length === 0) {
      return {
        complete: false,
        missingCount: 0,
        totalCombinations: 0,
        existingCount: 0,
        cardsCount: 0,
        missingByCard: [],
      }
    }

    // 2. 获取已有题目（含过期，但 analyzeQuestionMatrix 内部不过滤过期；这里直接用 getTestQuestions 拿到全部）
    // 注意：updateQuestionBank 内部会调用 filterExpiredQuestions 过滤过期题目
    // 为保持一致性，这里也调用 getTestQuestions(testType, id) 获取同一批数据
    const existingQuestions = await getTestQuestions(testType, id)

    // 3. 用 analyzeQuestionMatrix 分析缺失组合（targetDifficulty=undefined 表示检查全部 3 档难度）
    const matrix = analyzeQuestionMatrix(cards, existingQuestions, undefined)

    // 4. 统计缺失情况
    let missingCount = 0
    let totalCombinations = 0
    let existingCount = 0
    const missingByCard = []

    for (const card of cards) {
      const cid = String(card.id || '').trim()
      if (!cid) continue
      const need = matrix.needCombosByCard.get(cid) || []
      // 每张卡片应有 4 类型 × 3 难度 = 12 组合
      totalCombinations += LITE_QUESTION_TYPES.length * 3
      existingCount += (LITE_QUESTION_TYPES.length * 3) - need.length
      missingCount += need.length
      if (need.length > 0) {
        missingByCard.push({
          cardId: cid,
          cardFront: String(card.front || '').slice(0, 60),
          missing: need,
        })
      }
    }

    return {
      complete: missingCount === 0,
      missingCount,
      totalCombinations,
      existingCount,
      cardsCount: cards.length,
      missingByCard,
    }
  } catch (e) {
    console.error('[checkQuestionBankCompleteness] 检查失败:', e)
    return {
      complete: false,
      missingCount: 0,
      totalCombinations: 0,
      existingCount: 0,
      cardsCount: 0,
      missingByCard: [],
      error: e?.message || 'unknown',
    }
  }
}