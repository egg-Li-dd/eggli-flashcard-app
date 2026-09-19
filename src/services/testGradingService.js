/**
 * 独立评分服务 - AI 评分与结果处理（增强版）
 *
 * 职责：
 * 1. 客观题（单选/多选/判断）本地自动评分，100% 准确
 * 2. 多选题部分给分（选对部分选项得分，多选惩罚）
 * 3. 难度加权评分（简单×1 / 中等×1.5 / 困难×2）
 * 4. 简答题 AI 语义评分（降级为关键词匹配）
 * 5. AI 仅处理填空题/简答题和生成答案解析
 * 6. AI 降级：调用失败自动使用本地评分
 * 7. 手动判分：允许用户修正 AI 判分结果
 * 8. 正确率分级映射（≥90% mastered / 60-89% learning / <60% review）
 * 9. 评分完成后自动更新 cardStatus 掌握程度 + 错题记录 + 测试记录
 */

import { generateId, levenshteinDistance, extractJsonFromAiResponse } from '../utils/helpers'
import { normalizeSparkApiPassword } from '../utils/sparkAuth'
import { setCardStatus, addWrongAnswer, clearWrongAnswer, saveTestRecord } from './db'
import { logAiCall } from './aiCallLog'
import { DEEPSEEK_API_URL, IFLYTEK_SPARK_API_URL, VOLCANO_ENGINE_API_URL, DASHSCOPE_API_URL } from '../utils/constants'
import { httpPost } from '../utils/httpClient'

// dev 模式通过 Vite 代理绕过 CORS；生产环境直连
const SPARK_URL = import.meta.env.DEV
  ? '/api/spark/v1/chat/completions'
  : IFLYTEK_SPARK_API_URL

// ============================================================
// 难度权重常量
// ============================================================

export const DIFFICULTY_WEIGHTS = { easy: 1.0, medium: 1.5, hard: 2.0, undefined: 1.0 }

export const DIFFICULTY_LABELS = { easy: '简单', medium: '中等', hard: '困难', undefined: '未设置' }

// ============================================================
// 本地客观题评分引擎（100% 准确）
// ============================================================

/** 单选用正确答案比较（answer 是选项字母如 "A"，用 label 匹配） */
function gradeSingleChoice(question, userAnswer) {
  const correctAnswer = String(question.answer || question.back || '').trim()
  const options = question.options || []

  if (question.options && Array.isArray(question.options)) {
    const optIdx = typeof userAnswer?.selectedIndex === 'number' ? userAnswer.selectedIndex : -1
    if (optIdx >= 0 && optIdx < options.length) {
      const selectedLabel = String(options[optIdx]?.label || '').trim()
      const isCorrect = selectedLabel === correctAnswer
      return { isCorrect, score: isCorrect ? 1 : 0, correctAnswer }
    }
  }

  const isCorrect = String(userAnswer?.selectedText || '').trim() === correctAnswer
  return { isCorrect, score: isCorrect ? 1 : 0, correctAnswer }
}

/** 多选题评分（answer 是字母组合如 "ABD"，用 option.label 匹配；部分给分：正确选中-多选惩罚 / 总数） */
function gradeMultiChoice(question, userAnswer) {
  const correctAnswer = String(question.answer || question.back || '').trim()
  const userIndices = userAnswer?.selectedIndices || []
  const options = question.options || []

  if (options.length === 0) {
    return { isCorrect: false, score: 0, correctAnswer }
  }

  // answer 是字母组合（如 "ABD"），拆分出单个字母集合
  // 兼容两种格式：纯字母 "ABD" 和逗号分隔 "A,B,D"
  const correctLabels = new Set()
  // 先尝试按分隔符切分（兼容老式格式）
  const bySeparator = correctAnswer.split(/[,，;；、\s]+/).map(s => s.trim()).filter(Boolean)
  const hasMultiChar = bySeparator.some(s => s.length > 1)
  if (!hasMultiChar && bySeparator.length > 0) {
    // 切出来的都是单个字符（如 ["A", "B", "D"] 或 ["ABD"]）
    // 如果只有一个元素且长度>1，说明是纯字母串
    if (bySeparator.length === 1 && bySeparator[0].length > 1) {
      for (const ch of bySeparator[0].toUpperCase()) {
        if (/[A-Z]/.test(ch)) correctLabels.add(ch)
      }
    } else {
      for (const s of bySeparator) {
        if (s) correctLabels.add(s.toUpperCase())
      }
    }
  } else {
    // 按字符拆分："ABD" -> ["A", "B", "D"]
    for (const ch of correctAnswer.toUpperCase()) {
      if (/[A-Z]/.test(ch)) correctLabels.add(ch)
    }
  }

  // 找到正确选项对应的索引集合：通过 option.label 匹配
  const correctSet = new Set()
  options.forEach((opt, i) => {
    const label = String(opt?.label || '').trim().toUpperCase()
    if (label && correctLabels.has(label)) correctSet.add(i)
  })
  const userSet = new Set(userIndices)

  // 计算统计
  let correctSelected = 0
  let correctMissed = 0
  let wrongSelected = 0

  for (const idx of correctSet) {
    if (userSet.has(idx)) correctSelected++
    else correctMissed++
  }
  for (const idx of userSet) {
    if (!correctSet.has(idx)) wrongSelected++
  }

  const totalCorrect = correctSet.size
  if (totalCorrect === 0) {
    return { isCorrect: false, score: 0, correctAnswer }
  }

  // 公式：max(0, 正确选中数 - 多选惩罚×0.5) / 正确选项总数
  const rawScore = Math.max(0, (correctSelected - wrongSelected * 0.5) / totalCorrect)
  const isCorrect = rawScore >= 1.0
  const score = Math.round(rawScore * 100) / 100
  const partial = !isCorrect && score > 0

  return { isCorrect, score, correctAnswer, partial }
}

/** 判断题评分 */
function gradeTrueFalse(question, userAnswer) {
  const correctAnswer = String(question.answer || question.back || '').trim()
  const userVal = userAnswer?.answer

  const normalizeBool = (v) => {
    if (typeof v === 'boolean') return v
    const s = String(v || '').trim().toLowerCase()
    return s === 'true' || s === '正确' || s === '对' || s === '是' || s === '√'
  }

  const correctBool = normalizeBool(correctAnswer)
  const userBool = normalizeBool(userVal)

  const isCorrect = correctBool === userBool
  return { isCorrect, score: isCorrect ? 1 : 0, correctAnswer }
}

/** 本地填空题评分（编辑距离匹配，AI 降级用） */
function gradeFillBlankLocal(question, userAnswer) {
  const correctAnswer = String(question.answer || question.back || '').trim()
  const userText = String(userAnswer?.answerText || '').trim()

  if (!userText) return { isCorrect: false, score: 0, correctAnswer }

  if (userText === correctAnswer) {
    return { isCorrect: true, score: 1, correctAnswer }
  }

  const maxLen = Math.max(correctAnswer.length, userText.length)
  const dist = levenshteinDistance(correctAnswer, userText)
  const similarity = 1 - dist / maxLen
  const isCorrect = similarity >= 0.8

  return { isCorrect, score: isCorrect ? 1 : 0, correctAnswer }
}

/** 本地简答题评分（关键词匹配，AI 降级用） */
function gradeShortAnswerLocal(question, userAnswer) {
  const correctAnswer = String(question.answer || question.back || '').trim()
  const userText = String(userAnswer?.answerText || '').trim()

  if (!userText) return { isCorrect: false, score: 0, correctAnswer, keywords: [] }

  // 提取关键词（2字以上非标点中文字符 + 英文单词）
  const extractKeywords = (text) => {
    const cleaned = text.replace(/[，。！？、；：""（）\s,.!?;:'"()\[\]]/g, ' ')
    return cleaned
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .map(w => w.toLowerCase())
  }

  const correctKeywords = extractKeywords(correctAnswer)
  const userKeywords = extractKeywords(userText)

  if (correctKeywords.length === 0) {
    return { isCorrect: false, score: 0, correctAnswer, keywords: [] }
  }

  const matched = correctKeywords.filter(k => userKeywords.includes(k))
  const coverage = matched.length / correctKeywords.length

  const scored =
    coverage >= 0.7 ? { isCorrect: true, score: 0.8 } :
    coverage >= 0.5 ? { isCorrect: false, score: 0.5 } :
    { isCorrect: false, score: 0 }

  return {
    ...scored,
    correctAnswer,
    keywords: correctKeywords.map(k => ({
      word: k,
      matched: userKeywords.includes(k),
    })),
  }
}

// ============================================================
// AI 评分布局（填空题 / 简答题）
// ============================================================

function buildGradingPrompt(fillBlankItems) {
  const lines = fillBlankItems.map((item, i) => {
    const q = item.question
    const correct = String(q.answer || q.back || '').trim()
    const user = String(item.userAnswer?.answerText || '').trim()
    return `题目${i}：${String(q.front || '').slice(0, 80)}
标准答案：${correct}
用户答案：${user || '（未作答）'}`
  })

  return `你是专业考试评分助手。请对以下填空题进行评分。

${lines.join('\n\n')}

【输出格式】严格返回JSON数组，每项一个对象：
[{"index": <数字，从0开始>, "isCorrect": <true/false>, "score": <0或1>, "explanation": "<评分说明，20字以内>"}]

只返回JSON，不要额外文字。`
}

function buildShortAnswerPrompt(shortAnswerItems) {
  const lines = shortAnswerItems.map((item, i) => {
    const q = item.question
    const correct = String(q.back || '').trim()
    const user = String(item.userAnswer?.answerText || '').trim()
    return `题目${i}：${String(q.front || '').slice(0, 80)}
标准答案（参考）：${correct}
用户答案：${user || '（未作答）'}`
  })

  return `你是专业考试评分助手。请判断用户答案与标准答案的语义相似度并给出分数。

${lines.join('\n\n')}

【评分标准】
- score=1.0：答案完全正确，涵盖所有要点
- score=0.7-0.9：答案大部分正确，遗漏少数要点
- score=0.4-0.6：答案部分正确，但遗漏较多或有误解
- score=0-0.3：答案基本错误或无关

【输出格式】严格返回JSON数组：
[{"index": <数字>, "isCorrect": <true/false>, "score": <0~1>, "explanation": "<评分说明，20字以内>"}]

只返回JSON。`
}

// ============================================================
// 强模型 AI 评分（DeepSeek / 火山引擎 / 阿里云百炼）
// ============================================================

async function callAiForGradingStrong(items, config, mode = 'fill_blank') {
  const prompt = mode === 'short_answer'
    ? buildShortAnswerPrompt(items)
    : buildGradingPrompt(items)

  const isVolcano = config?.aiServiceMode === 'volcano'
  const isDashscope = config?.aiServiceMode === 'dashscope'

  const modelName =
    isVolcano ? (config.model || 'doubao-pro-32k') :
    isDashscope ? (config.model || 'qwen3.5-plus-2026-04-20') :
    (config.model || 'deepseek-v4-pro')

  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: mode === 'short_answer' ? 2048 : 1024,
  }

  let resp
  if (isVolcano) {
    resp = await httpPost(VOLCANO_ENGINE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.volcanoApiKey || '') },
      data: body, timeout: 15000,
    })
  } else if (isDashscope) {
    resp = await httpPost(DASHSCOPE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.dashscopeApiKey || '') },
      data: body, timeout: 15000,
    })
  } else {
    resp = await httpPost(DEEPSEEK_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.apiKey || '') },
      data: body, timeout: 15000,
    })
  }

  if (!resp.ok) throw new Error('Strong AI grading API returned ' + resp.status)
  const content = resp?.data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Strong AI grading returned empty response')

  const extracted = extractJsonFromAiResponse(content, '')
  if (!extracted.json || !Array.isArray(extracted.json)) {
    throw new Error('Strong AI grading response not valid JSON array')
  }
  return { result: extracted.json, prompt, response: content, model: modelName }
}

// ============================================================
// 弱模型 AI 评分（讯飞 Spark Lite）— 简化 prompt，分批处理
// ============================================================

async function callAiForGradingWeak(items, config, mode = 'fill_blank') {
  const password = normalizeSparkApiPassword(config.sparkApiKey)
  if (!password) throw new Error('Spark: 未填写 APIPassword')

  const modelName = config.model || 'lite'
  const BATCH_SIZE = 4 // 弱模型每次最多评4题

  const batches = []
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE))
  }

  const allResults = []

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const prompt = buildWeakGradingPrompt(batch, mode)

    const body = {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: mode === 'short_answer' ? 1024 : 512,
    }

    const resp = await httpPost(SPARK_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
      data: body, timeout: 15000,
    })

    if (!resp.ok) throw new Error('Weak AI grading API returned ' + resp.status)
    const content = resp?.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('Weak AI grading returned empty response')

    const extracted = extractJsonFromAiResponse(content, 'iflytek-spark')
    if (!extracted.json || !Array.isArray(extracted.json)) {
      console.warn('[weakGrading] 批次' + bi + ' 解析失败，跳过')
      continue
    }

    // 弱模型需要将 batch 局部 index 映射回 items 的全局 index
    for (const r of extracted.json) {
      const batchIdx = r?.index
      if (typeof batchIdx === 'number' && batchIdx >= 0 && batchIdx < batch.length) {
        allResults.push({ ...r, index: batch[batchIdx]?.__originalIndex ?? (bi * BATCH_SIZE + batchIdx) })
      }
    }
  }

  return { result: allResults, prompt: 'weak-model-batched', response: JSON.stringify(allResults), model: modelName }
}

/** 弱模型专用简化 prompt */
function buildWeakGradingPrompt(items, mode) {
  const lines = items.map((item, i) => {
    const q = item.question
    const correct = String(q.answer || q.back || '').trim()
    const user = String(item.userAnswer?.answerText || '').trim()
    if (mode === 'short_answer') {
      return `${i}.问：${String(q.front || '').slice(0, 60)}\n参考：${correct}\n答：${user || '未作答'}`
    }
    return `${i}.空位答案：${correct}\n用户填写：${user || '未作答'}`
  })

  return `评分任务。逐题判断用户填写是否与正确答案含义一致（允许同义表达）。

${lines.join('\n\n')}

返回格式：[{"index":${items.map((_, i) => i).join('/')}中的数字, "isCorrect":true或false, "score":0或1, "explanation":"简短说明"}]`
}

// ============================================================
// AI 整体评价（强模型专用）— 综合评价整份试卷
// ============================================================

function buildHolisticEvaluationPrompt(questions, gradingResults, userAnswers, accuracy) {
  const typeNames = {
    single_choice: '单选题',
    multi_choice: '多选题',
    true_false: '判断题',
    fill_blank: '填空题',
    short_answer: '简答题',
  }

  const items = questions.map((q, i) => {
    const r = gradingResults[i] || {}
    const qType = typeNames[q.type] || q.type || '未知题型'
    const difficulty = DIFFICULTY_LABELS[q.difficulty] || '未设置'

    let userAnswerText = ''
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      const ua = userAnswers[q.id] || {}
      if (ua.selectedIndices) {
        userAnswerText = ua.selectedIndices.map(idx => q.options?.[idx]?.label || '').join(', ') || '（未作答）'
      } else if (typeof ua.selectedIndex === 'number') {
        userAnswerText = q.options?.[ua.selectedIndex]?.label || '（未作答）'
      } else {
        userAnswerText = ua.selectedText || '（未作答）'
      }
    } else if (q.type === 'true_false' || q.type === 'judge') {
      const ua = userAnswers[q.id] || {}
      userAnswerText = ua.answer || '（未作答）'
    } else {
      const ua = userAnswers[q.id] || {}
      userAnswerText = ua.answerText || ua.selectedText || '（未作答）'
    }

    const correctAnswer = String(q.answer || q.back || '').trim()
    const result = r.isCorrect ? '✓ 正确' : '✗ 错误'

    return `【题目${i + 1}】${qType} | 难度：${difficulty}
题干：${String(q.front || '').slice(0, 100)}
用户答案：${userAnswerText}
正确答案：${correctAnswer}
本题结果：${result}`
  })

  const correctCount = gradingResults.filter(r => r.isCorrect).length
  const totalCount = gradingResults.length

  return `你是专业的考试辅导老师。请对以下测试试卷进行综合评价与分析。

【基本信息】
本次测试共 ${totalCount} 题，答对 ${correctCount} 题，正确率 ${accuracy}%。
答题情况：${accuracy >= 90 ? '表现优秀' : accuracy >= 60 ? '基本掌握' : '需要加强'}

【题目详情】
${items.join('\n\n')}

【输出要求】请返回 JSON 格式的综合评价：
{
  "overallComment": "整体评价（50字以内，指出优势与不足）",
  "strengths": ["优点1", "优点2", "优点3"],
  "weaknesses": ["不足1", "不足2", "不足3"],
  "studySuggestions": ["建议1", "建议2", "建议3"],
  "keyPointsToReview": ["重点复习1", "重点复习2"]
}

只返回 JSON，不要额外文字。`
}

async function callAiForHolisticEvaluation(questions, gradingResults, userAnswers, accuracy, config) {
  const prompt = buildHolisticEvaluationPrompt(questions, gradingResults, userAnswers, accuracy)

  const isVolcano = config?.aiServiceMode === 'volcano'
  const isDashscope = config?.aiServiceMode === 'dashscope'

  const modelName =
    isVolcano ? (config.model || 'doubao-pro-32k') :
    isDashscope ? (config.model || 'qwen3.5-plus-2026-04-20') :
    (config.model || 'deepseek-v4-pro')

  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 1536,
  }

  let resp
  if (isVolcano) {
    resp = await httpPost(VOLCANO_ENGINE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.volcanoApiKey || '') },
      data: body, timeout: 20000,
    })
  } else if (isDashscope) {
    resp = await httpPost(DASHSCOPE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.dashscopeApiKey || '') },
      data: body, timeout: 20000,
    })
  } else {
    resp = await httpPost(DEEPSEEK_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.apiKey || '') },
      data: body, timeout: 20000,
    })
  }

  if (!resp.ok) throw new Error('Holistic evaluation API returned ' + resp.status)
  const content = resp?.data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Holistic evaluation returned empty response')

  const extracted = extractJsonFromAiResponse(content, '')
  if (!extracted.json) {
    throw new Error('Holistic evaluation response not valid JSON')
  }
  return extracted.json
}

// ============================================================
// AI 答案解析生成
// ============================================================

function buildExplanationPrompt(question, userAnswer, isCorrect) {
  const statusText = isCorrect ? '回答正确' : '回答错误'
  return `请为以下题目的答题情况生成简短解析（50字以内）：

题目：${String(question.front || '').slice(0, 80)}
正确答案：${String(question.answer || question.back || '').trim()}
用户答案：${String(userAnswer?.answerText || userAnswer?.selectedText || '').trim() || '（未作答）'}
答题结果：${statusText}

请用一句话说明该题涉及的知识点关键点，若答错请指出错误原因。只返回解析文本。`
}

async function callAiForExplanation(question, userAnswer, isCorrect, config) {
  const prompt = buildExplanationPrompt(question, userAnswer, isCorrect)
  const isWeakModel = config?.aiServiceMode === 'iflytek-spark'
  return await (isWeakModel ? sendAiRequestWeak(prompt, config) : sendAiRequestStrong(prompt, config))
}

/** 强模型 AI 请求（DeepSeek / 火山引擎 / 阿里云百炼） */
async function sendAiRequestStrong(prompt, config, temperature = 0.3, maxTokens = 256) {
  const isVolcano = config?.aiServiceMode === 'volcano'
  const isDashscope = config?.aiServiceMode === 'dashscope'

  const modelName =
    isVolcano ? (config.model || 'doubao-pro-32k') :
    isDashscope ? (config.model || 'qwen3.5-plus-2026-04-20') :
    (config.model || 'deepseek-v4-pro')

  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
  }

  let resp
  if (isVolcano) {
    resp = await httpPost(VOLCANO_ENGINE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.volcanoApiKey || '') },
      data: body, timeout: 10000,
    })
  } else if (isDashscope) {
    resp = await httpPost(DASHSCOPE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.dashscopeApiKey || '') },
      data: body, timeout: 10000,
    })
  } else {
    resp = await httpPost(DEEPSEEK_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.apiKey || '') },
      data: body, timeout: 10000,
    })
  }

  if (!resp.ok) return ''
  const content = resp?.data?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

/** 弱模型 AI 请求（讯飞 Spark Lite） */
async function sendAiRequestWeak(prompt, config, temperature = 0.3, maxTokens = 256) {
  const password = normalizeSparkApiPassword(config.sparkApiKey)
  if (!password) return ''

  const body = {
    model: config.model || 'lite',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
  }

  try {
    const resp = await httpPost(SPARK_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
      data: body, timeout: 10000,
    })
    if (!resp.ok) return ''
    const content = resp?.data?.choices?.[0]?.message?.content
    return typeof content === 'string' ? content.trim() : ''
  } catch {
    return ''
  }
}

// ============================================================
// 主评分流程（增强版）
// ============================================================

/**
 * 完整评分流程
 * @param {Array} questions - 每项 { id, type, front, back, options, cardId, knowledge_point, difficulty }
 * @param {Object} userAnswers - { questionId: answer }
 * @param {Object} aiConfig - AI 配置
 * @param {Object} options - { categoryId, unitId, userId, timeUsed, testType }
 * @returns {Object} 评分结果
 */
/**
 * 纯本地快速评分（不调用 AI）— 用于在 UI 上立即展示结果
 * 返回与 gradeTest 相同结构，但 explanation 为空、gradedBy 为 'local'、weighted 为普通分数
 */
export function gradeLocalOnly(questions, userAnswers, options = {}) {
  const gradingResults = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const ua = userAnswers[q.id] || {}
    const qType = (q.type || '').toLowerCase()

    const safeQ = {
      id: q.id || generateId(),
      cardId: q.cardId || q.id || '',
      front: String(q.front || q.stem || ''),
      back: String(q.back || q.answer || ''),
      type: qType,
      options: Array.isArray(q.options) ? q.options : [],
      knowledge_point: q.knowledge_point || q.knowledgePoint || null,
      difficulty: q.difficulty || 'easy',
      unitId: q.unitId || '',
    }

    if (qType === 'single_choice' || qType === 'single') {
      const result = gradeSingleChoice(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'single_choice', ...result, userAnswer: ua,
        explanation: result.isCorrect ? '回答正确' : '正确选项与你的选择不符',
        gradedBy: 'local',
      })
    } else if (qType === 'multi_choice' || qType === 'multi') {
      const result = gradeMultiChoice(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'multi_choice', ...result, userAnswer: ua,
        explanation: result.isCorrect ? '回答正确' : (result.partial ? `部分正确（得分${result.score}）` : '正确选项与你的选择不一致'),
        gradedBy: 'local',
      })
    } else if (qType === 'true_false' || qType === 'judge') {
      const result = gradeTrueFalse(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'true_false', ...result, userAnswer: ua,
        explanation: result.isCorrect ? '判断正确' : '判断错误',
        gradedBy: 'local',
      })
    } else if (qType === 'short_answer' || qType === 'essay') {
      const result = gradeShortAnswerLocal(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'short_answer', ...result, userAnswer: ua,
        explanation: '', gradedBy: 'local',
      })
    } else {
      const result = gradeFillBlankLocal(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'fill_blank', ...result, userAnswer: ua,
        explanation: '', gradedBy: 'local',
      })
    }
  }

  let weightedScore = 0
  let maxPossibleScore = 0
  for (const r of gradingResults) {
    const q = questions.find(q => q.id === r.questionId)
    const weight = DIFFICULTY_WEIGHTS[q?.difficulty] || 1.0
    weightedScore += r.score * weight
    maxPossibleScore += weight
  }

  const totalCount = gradingResults.length
  const correctCount = gradingResults.filter(r => r.isCorrect).length
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0

  return {
    totalCount,
    correctCount,
    accuracy,
    weightedScore: Math.round(weightedScore * 10) / 10,
    maxPossibleScore: Math.round(maxPossibleScore * 10) / 10,
    gradingResults,
    weakPoints: computeWeakPoints(gradingResults, questions),
    typeStats: computeTypeStats(gradingResults),
    holisticEvaluation: null,
  }
}

export async function gradeTest(questions, userAnswers, aiConfig, options = {}) {
  const {
    categoryId, unitId, chapterId, userId, timeUsed = 0,
    categoryName = '', unitName = '', skipWritingWrongAnswers = false,
    onProgress, // 新增：进度回调，用于后台任务展示进度
  } = options
  const gradingResults = []
  const fillBlankItems = []
  const shortAnswerItems = []

  const reportProgress = (percent, detail) => {
    if (typeof onProgress === 'function') {
      try { onProgress(percent, detail) } catch (_) { /* ignore */ }
    }
  }
  reportProgress(5, '正在进行本地客观题评分…')

  // 第1步：本地评分
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const ua = userAnswers[q.id] || {}
    const qType = (q.type || '').toLowerCase()

    const safeQ = {
      id: q.id || generateId(),
      cardId: q.cardId || q.id || '',
      front: String(q.front || q.stem || ''),
      back: String(q.back || q.answer || ''),
      type: qType,
      options: Array.isArray(q.options) ? q.options : [],
      knowledge_point: q.knowledge_point || q.knowledgePoint || null,
      difficulty: q.difficulty || 'easy',
      unitId: q.unitId || '',
    }

    if (qType === 'single_choice' || qType === 'single') {
      const result = gradeSingleChoice(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'single_choice',
        ...result,
        userAnswer: ua,
        explanation: result.isCorrect ? '回答正确' : '正确选项与你的选择不符',
        gradedBy: 'local',
      })
    } else if (qType === 'multi_choice' || qType === 'multi') {
      const result = gradeMultiChoice(safeQ, ua)
      const partialText = result.partial ? '已部分给分' : ''
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'multi_choice',
        ...result,
        userAnswer: ua,
        explanation: result.isCorrect ? '回答正确'
          : result.partial ? `部分正确（得分${result.score}）${partialText}`
          : '正确选项与你的选择不一致',
        gradedBy: 'local',
      })
    } else if (qType === 'true_false' || qType === 'judge') {
      const result = gradeTrueFalse(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'true_false',
        ...result,
        userAnswer: ua,
        explanation: result.isCorrect ? '判断正确' : '判断错误',
        gradedBy: 'local',
      })
    } else if (qType === 'short_answer' || qType === 'essay') {
      const localResult = gradeShortAnswerLocal(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'short_answer',
        ...localResult,
        userAnswer: ua,
        explanation: '',
        gradedBy: 'local',
        needsAiGrading: true,
      })
      shortAnswerItems.push({ index: i, question: safeQ, userAnswer: ua })
    } else {
      // 填空题：默认处理
      const localResult = gradeFillBlankLocal(safeQ, ua)
      gradingResults.push({
        index: i, questionId: safeQ.id, cardId: safeQ.cardId,
        type: 'fill_blank',
        ...localResult,
        userAnswer: ua,
        explanation: '',
        gradedBy: 'local',
        needsAiGrading: true,
      })
      fillBlankItems.push({ index: i, question: safeQ, userAnswer: ua })
    }
  }

  // 第2步：AI 评分（填空题 + 简答题）— 强/弱模型分路径调用
  if (hasAiConfig(aiConfig)) {
    const isWeakModel = aiConfig.aiServiceMode === 'iflytek-spark'
    const gradingFn = isWeakModel ? callAiForGradingWeak : callAiForGradingStrong
    const logPurpose = isWeakModel ? 'test-grading-weak' : 'test-grading-strong'
    const modelLabel = isWeakModel ? (aiConfig.model || 'lite') : (aiConfig.model || 'deepseek-v4-pro')

    // 为弱模型预留原始 index 映射（弱模型内部会按 batch 重新编号）
    const withOriginalIndex = (items) => items.map((item, i) => ({ ...item, __originalIndex: item.index, question: item.question }))

    // 填空题 AI 评分
    if (fillBlankItems.length > 0) {
      reportProgress(25, `正在对 ${fillBlankItems.length} 道填空题进行 AI 语义评分…`)
      try {
        const callResult = await callWithLog(logPurpose + '-fill', modelLabel, () =>
          gradingFn(withOriginalIndex(fillBlankItems), aiConfig, 'fill_blank')
        )
        const aiResults = callResult
        if (Array.isArray(aiResults)) {
          for (const aiR of aiResults) {
            const idx = aiR?.index
            if (typeof idx === 'number' && idx < gradingResults.length && gradingResults[idx].type === 'fill_blank') {
              gradingResults[idx].isCorrect = aiR.isCorrect === true
              gradingResults[idx].score = typeof aiR.score === 'number' ? aiR.score : (aiR.isCorrect ? 1 : 0)
              gradingResults[idx].explanation = String(aiR.explanation || '').slice(0, 50)
              gradingResults[idx].gradedBy = 'ai'
            }
          }
        }
      } catch (e) {
        console.warn('[testGrading] AI 填空题评分失败:', e?.message)
      }
    }

    // 简答题 AI 评分
    if (shortAnswerItems.length > 0) {
      reportProgress(55, `正在对 ${shortAnswerItems.length} 道简答题进行 AI 评分…`)
      try {
        const callResult = await callWithLog(logPurpose + '-short', modelLabel, () =>
          gradingFn(withOriginalIndex(shortAnswerItems), aiConfig, 'short_answer')
        )
        const aiResults = callResult
        if (Array.isArray(aiResults)) {
          for (const aiR of aiResults) {
            const idx = aiR?.index
            if (typeof idx === 'number' && idx < gradingResults.length && gradingResults[idx].type === 'short_answer') {
              gradingResults[idx].isCorrect = aiR.isCorrect === true
              gradingResults[idx].score = typeof aiR.score === 'number' ? Math.min(1, Math.max(0, aiR.score)) : (aiR.isCorrect ? 1 : 0)
              gradingResults[idx].explanation = String(aiR.explanation || '').slice(0, 50)
              gradingResults[idx].gradedBy = 'ai'
            }
          }
        }
      } catch (e) {
        console.warn('[testGrading] AI 简答题评分失败:', e?.message)
      }
    }
  }

  // 第3步：生成 AI 解析（同步，等待完成以便后台任务显示进度）
  if (hasAiConfig(aiConfig)) {
    reportProgress(75, '正在为各题目生成 AI 解析…')
    try {
      await generateExplanationsAsync(gradingResults, questions, userAnswers, aiConfig)
    } catch (_) { /* ignore */ }
  }

  // 第4步：计算加权分数
  let weightedScore = 0
  let maxPossibleScore = 0

  for (const r of gradingResults) {
    const q = questions.find(q => q.id === r.questionId)
    const weight = DIFFICULTY_WEIGHTS[q?.difficulty] || 1.0
    weightedScore += r.score * weight
    maxPossibleScore += weight
  }

  // 第5步：计算简单统计
  const totalCount = gradingResults.length
  const correctCount = gradingResults.filter(r => r.isCorrect).length
  const totalScore = correctCount
  const weightedTotal = Math.round(weightedScore * 10) / 10
  const weightedMax = Math.round(maxPossibleScore * 10) / 10
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0

  // 第6步：薄弱知识点
  const weakPoints = computeWeakPoints(gradingResults, questions)

  // 第7步：题型统计
  const typeStats = computeTypeStats(gradingResults)

  // 第7.5步：AI 整体评价（仅强模型，同步调用以报告进度）
  let holisticEvaluation = null
  const isWeakModel = aiConfig?.aiServiceMode === 'iflytek-spark'
  if (hasAiConfig(aiConfig) && !isWeakModel) {
    reportProgress(88, '正在生成整份试卷的 AI 评价…')
    try {
      holisticEvaluation = await callAiForHolisticEvaluation(questions, gradingResults, userAnswers, accuracy, aiConfig)
    } catch (e) {
      console.warn('[testGrading] AI 整体评价失败:', e?.message)
      holisticEvaluation = null
    }
  }

  // 第8步：保存测试记录
  reportProgress(95, '正在保存测试记录与掌握程度…')
  const testRecord = await saveTestRecord({
    categoryId: categoryId || '',
    unitId: unitId || '',
    userId: userId || '',
    totalScore,
    correctCount,
    totalCount,
    timeUsed,
    type: options.testType || 'unit_test',
    questions: questions.map(q => ({
      id: q.id, cardId: q.cardId, front: q.front, back: q.back,
      type: q.type, options: q.options, knowledge_point: q.knowledge_point,
      difficulty: q.difficulty || 'easy',
    })),
    answers: userAnswers,
    gradingResults: gradingResults.map(r => ({
      index: r.index, questionId: r.questionId, cardId: r.cardId,
      type: r.type, isCorrect: r.isCorrect, score: r.score,
      correctAnswer: r.correctAnswer, explanation: r.explanation, gradedBy: r.gradedBy,
    })),
  })

  // 第9步：更新掌握程度（基于正确率分级）
  updateMasteryAndWrongAnswers(gradingResults, questions, categoryId, accuracy, userId, {
    unitId, chapterId, categoryName, unitName, skipWritingWrongAnswers
  }).catch(e => {
    console.warn('[testGrading] 更新掌握程度失败:', e?.message)
  })

  return {
    totalScore,
    correctCount,
    totalCount,
    accuracy,
    weightedScore: weightedTotal,
    maxPossibleScore: weightedMax,
    timeUsed,
    gradingResults,
    weakPoints,
    typeStats,
    testRecordId: testRecord?.id,
    holisticEvaluation,
  }
}

// ============================================================
// 解析生成（后台异步）
// ============================================================
async function generateExplanationsAsync(gradingResults, questions, userAnswers, aiConfig) {
  const needExplanations = gradingResults.filter(r => !r.explanation || r.explanation.length < 5)
  const batchSize = 3

  for (let i = 0; i < needExplanations.length; i += batchSize) {
    const batch = needExplanations.slice(i, i + batchSize)
    const promises = batch.map(r => {
      const q = questions.find(q => q.id === r.questionId)
      if (!q) return Promise.resolve()
      const ua = userAnswers[r.questionId] || {}
      return callAiForExplanation(q, ua, r.isCorrect, aiConfig).then(exp => {
        if (exp) r.explanation = exp
      }).catch(() => {})
    })
    await Promise.allSettled(promises)
  }
}

// ============================================================
// 掌握程度与错题记录更新（正确率分级）
// ============================================================

async function updateMasteryAndWrongAnswers(gradingResults, questions, categoryId, accuracy, userId, meta = {}) {
  const { unitId = '', chapterId = '', categoryName = '', unitName = '', skipWritingWrongAnswers = false } = meta

  // 增强容错：如果 categoryId 为空，尝试从题目数据中查找
  if (!categoryId && questions && questions.length > 0) {
    const qWithCat = questions.find(q => q.categoryId)
    if (qWithCat) categoryId = qWithCat.categoryId
  }
  // 如果仍然没有 categoryId，退出（正常情况下 handleSubmitAll 会先补全，这里是最后防线）
  if (!categoryId) return

  for (const r of gradingResults) {
    const q = questions.find(q => q.id === r.questionId)
    const cardId = r.cardId || q?.cardId || q?.id
    if (!cardId) continue

    const stem = q?.front || q?.stem || ''

    try {
      if (r.isCorrect) {
        await setCardStatus(cardId, categoryId, 'mastered', { mode: 'test' })
        if (!skipWritingWrongAnswers) {
          // 同时传递 unitId/questionId 以确保精确清除
          const qForQ = questions.find(q => q.id === r.questionId)
          await clearWrongAnswer(cardId, categoryId, unitId, r.questionId || '').catch(() => {})
        }
      } else {
        await setCardStatus(cardId, categoryId, 'review', { mode: 'test' })
        if (!skipWritingWrongAnswers) {
          await addWrongAnswer(cardId, categoryId, r.type || q?.type || '', {
            unitId, chapterId, categoryName, unitName, stem,
            questionId: r.questionId || '',
          }).catch(() => {})
        }
      }
    } catch (e) {
      console.warn('[testGrading] 更新状态失败 cardId=' + cardId, e?.message)
    }
  }

  // 正确率分级：全局调整掌握程度
  if (typeof accuracy === 'number' && accuracy > 0 && questions.length > 0) {
    let globalStatus = 'review'
    if (accuracy >= 90) globalStatus = 'mastered'
    else if (accuracy >= 60) globalStatus = 'learning'

    // 将整体掌握程度应用到所有卡片
    if (globalStatus === 'mastered') {
      for (const q of questions) {
        const cardId = q.cardId || q.id
        if (cardId) {
          try {
            await setCardStatus(cardId, categoryId, 'mastered', { mode: 'test' })
            if (!skipWritingWrongAnswers) {
              await clearWrongAnswer(cardId, categoryId, unitId, q.id || '').catch(() => {})
            }
          } catch (_) {}
        }
      }
    }
  }
}

// ============================================================
// 手动修正评分
// ============================================================

/**
 * 手动修正判分结果
 * @param {Object} gradingResult - 评分结果对象（直接修改）
 * @param {boolean} newIsCorrect - 新的正确/错误状态
 * @param {number} [newScore] - 可选的新分数（0~1之间）
 */
export function manualOverrideGrading(gradingResult, newIsCorrect, newScore) {
  gradingResult.isCorrect = newIsCorrect
  gradingResult.score = typeof newScore === 'number' ? Math.min(1, Math.max(0, newScore)) : (newIsCorrect ? 1 : 0)
  gradingResult.gradedBy = 'manual'
  gradingResult.explanation = gradingResult.explanation || (newIsCorrect ? '（手动标记为正确）' : '（手动标记为错误）')
  delete gradingResult.partial
}

/**
 * 重新计算总分（含加权）
 */
export function recalculateScore(gradingResults, questions = []) {
  const totalCount = gradingResults.length
  const correctCount = gradingResults.filter(r => r.isCorrect).length
  const totalScore = correctCount

  let weightedScore = 0
  let maxPossibleScore = 0
  for (const r of gradingResults) {
    const q = questions?.find(q => q.id === r.questionId)
    const weight = DIFFICULTY_WEIGHTS[q?.difficulty] || 1.0
    weightedScore += (r.score || 0) * weight
    maxPossibleScore += weight
  }

  return {
    totalScore,
    correctCount,
    totalCount,
    accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
    weightedScore: Math.round(weightedScore * 10) / 10,
    maxPossibleScore: Math.round(maxPossibleScore * 10) / 10,
  }
}

// ============================================================
// 辅助函数
// ============================================================

async function callWithLog(purpose, modelName, aiFn, extra = {}) {
  const startTs = Date.now()
  try {
    const result = await aiFn()
    const durationMs = Date.now() - startTs
    // 支持 aiFn 返回 { result, prompt, response } 或直接返回 result
    const actualResult = result?.result !== undefined ? result.result : result
    logAiCall({
      purpose,
      modelName: String(modelName || 'unknown'),
      tokens: 0,
      durationMs,
      status: 'success',
      prompt: extra.prompt || result?.prompt || '',
      response: extra.response || result?.response || '',
    })
    return actualResult
  } catch (err) {
    const durationMs = Date.now() - startTs
    logAiCall({
      purpose,
      modelName: String(modelName || 'unknown'),
      tokens: 0,
      durationMs,
      status: 'error',
      errorMessage: (err && err.message) ? String(err.message) : '调用失败',
      prompt: extra.prompt || '',
      response: extra.response || '',
    })
    throw err
  }
}

function hasAiConfig(config) {
  if (!config) return false
  const mode = config.aiServiceMode || 'deepseek'
  if (mode === 'iflytek-spark') return !!config.sparkApiKey
  if (mode === 'volcano') return !!config.volcanoApiKey
  if (mode === 'dashscope') return !!config.dashscopeApiKey
  return !!config.apiKey
}

function computeWeakPoints(gradingResults, questions) {
  const pointMap = {}
  for (const r of gradingResults) {
    if (r.isCorrect) continue
    const q = questions.find(q => q.id === r.questionId)
    // 兼容多种字段命名：knowledgePoint(驼峰) / knowledge_point(下划线) / stem(题干) / front(卡片正面)
    const kp = q?.knowledgePoint || q?.knowledge_point || q?.stem || q?.front || '未知知识点'
    const key = String(kp).slice(0, 30)
    if (!pointMap[key]) pointMap[key] = 0
    pointMap[key]++
  }
  return Object.entries(pointMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))
}

function computeTypeStats(gradingResults) {
  const typeMap = {}
  for (const r of gradingResults) {
    const type = r.type || 'unknown'
    if (!typeMap[type]) typeMap[type] = { total: 0, correct: 0 }
    typeMap[type].total++
    if (r.isCorrect) typeMap[type].correct++
  }

  const typeNames = {
    single_choice: '单选题',
    multi_choice: '多选题',
    true_false: '判断题',
    fill_blank: '填空题',
    short_answer: '简答题',
  }

  return Object.entries(typeMap).map(([type, stats]) => ({
    type,
    name: typeNames[type] || type,
    total: stats.total,
    correct: stats.correct,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
  }))
}

export function formatTimeUsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}