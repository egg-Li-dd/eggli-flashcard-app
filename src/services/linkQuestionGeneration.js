/**
 * 联结题库 - 强模型多批次题目生成服务
 *
 * 核心能力：
 * 1. 按单元/章节合并知识点，交由强模型在不超纲的前提下出题
 * 2. 按题型（单选/多选/判断/填空）+ 难度（简易/中等/困难）均匀分布
 * 3. 按 token 容量动态规划批次，避免一次 prompt 过长导致模型失控
 * 4. 可划入后台任务（使用 startTask / 悬浮按钮显示进度）
 */

import { generateId } from '../utils/helpers'
import { isStrongModel, runTasksConcurrently, validateQuestionQuality, computeTargetCoverage } from './testQuestionService'
import {
  getTestQuestionsByCategory,
  addTestQuestions,
  getCategoryById,
  getUnit,
  getCardsByUnit,
  getUnitsByCategory,
  addLinkGenerationRun,
} from './db'
import { generateTestQuestions } from './aiService'

// ============ 常量定义 ============

export const LINK_QUESTION_TYPES = [
  { value: 'single_choice', label: '单选题' },
  { value: 'multi_choice', label: '多选题' },
  { value: 'true_false', label: '判断题' },
  { value: 'fill_blank', label: '填空题' },
]

export const LINK_DIFFICULTY_LEVELS = [
  { value: 1, label: '简易' },
  { value: 2, label: '中等' },
  { value: 3, label: '困难' },
]

export const LINK_STRENGTH_LEVELS = [
  { value: 'low', label: '弱关联', description: '以各单元/章节内部知识点为主，少量跨主题综合题' },
  { value: 'medium', label: '中等关联', description: '内部题与综合题各占一半，适合阶段性复习' },
  { value: 'high', label: '强关联', description: '以跨单元/章节综合题为主，训练综合应用能力' },
]

const BATCH_TEXT_LIMIT = 3500
const BATCH_MAX_QUESTIONS = 12
const AVG_KP_TEXT_LEN = 80
const MIN_BATCH_SIZE = 2
const MAX_BATCH_SIZE = 20

// ============ 数据收集 ============

export async function collectKnowledgePointsFromUnits(unitIds) {
  const result = []
  const seenKp = new Set()

  for (const unitId of unitIds) {
    const unit = await getUnit(unitId)
    if (!unit) continue
    const cards = await getCardsByUnit(unitId)
    for (const card of cards) {
      const kp = (card.knowledge_point || '').trim()
      const front = (card.front || '').trim()
      const sig = `${unitId}::${kp}::${front.slice(0, 100)}`
      if (seenKp.has(sig)) continue
      seenKp.add(sig)

      result.push({
        id: card.id,
        unitId,
        unitName: unit.name || '未知单元',
        front,
        back: (card.back || '').trim(),
        knowledge_point: kp,
      })
    }
  }
  return result
}

export async function collectKnowledgePointsFromChapters(chapterIds, categoryId) {
  const allUnitIds = []
  const unitsByCat = await getUnitsByCategory(categoryId)
  for (const chapterId of chapterIds) {
    const chapterUnits = unitsByCat.filter(u => u.chapterId === chapterId)
    allUnitIds.push(...chapterUnits.map(u => u.id))
  }
  return collectKnowledgePointsFromUnits([...new Set(allUnitIds)])
}

// ============ 动态分批规划（升级版：支持显式题型与难度） ============

export function planGenerationBatches({
  knowledgePoints,
  difficulty,
  linkStrength,
  targetPerCell = 3,
  explicitTypes = null,
  explicitDifficulties = null,
}) {
  if (!knowledgePoints || knowledgePoints.length === 0) {
    return { batches: [], totalTarget: 0, types: [], difficulties: [] }
  }

  // 支持 explicitTypes：用户指定题型数组，或默认全部 4 种
  const allTypes = LINK_QUESTION_TYPES.map(t => t.value)
  const types = Array.isArray(explicitTypes) && explicitTypes.length > 0
    ? explicitTypes.filter(t => allTypes.includes(t))
    : allTypes

  // 支持 explicitDifficulties：用户传入具体难度数组，或由 difficulty 推导出单值，或默认 [1,2,3]
  let difficulties
  if (Array.isArray(explicitDifficulties) && explicitDifficulties.length > 0) {
    difficulties = explicitDifficulties.map(d => Number(d)).filter(d => d >= 1 && d <= 3)
  } else if (difficulty != null) {
    difficulties = [Number(difficulty)]
  } else {
    difficulties = [1, 2, 3]
  }
  if (difficulties.length === 0) difficulties = [1, 2, 3]

  const cells = []
  for (const t of types) for (const d of difficulties) cells.push({ type: t, difficulty: d })
  const perCellTarget = targetPerCell
  const totalTarget = cells.length * perCellTarget

  const fixedTextLen = 1100
  const remainingForKp = BATCH_TEXT_LIMIT - fixedTextLen
  const kpCountPerBatch = Math.max(
    MIN_BATCH_SIZE,
    Math.min(MAX_BATCH_SIZE, Math.floor(remainingForKp / AVG_KP_TEXT_LEN)),
  )

  const shuffledKps = [...knowledgePoints].sort(() => Math.random() - 0.5)
  const kpBatches = []
  for (let i = 0; i < shuffledKps.length; i += kpCountPerBatch) {
    kpBatches.push(shuffledKps.slice(i, i + kpCountPerBatch))
  }

  const cellsPerBatch = Math.min(cells.length, Math.max(2, Math.ceil(cells.length / kpBatches.length)))
  const questionsPerCell = Math.max(1, Math.ceil(perCellTarget / kpBatches.length))

  const batches = kpBatches.map((kpBatch, idx) => {
    const assigned = []
    const startIdx = (idx * cellsPerBatch) % cells.length
    for (let i = 0; i < cellsPerBatch; i++) {
      assigned.push(cells[(startIdx + i) % cells.length])
    }
    return {
      batchIndex: idx,
      knowledgePoints: kpBatch,
      targetCells: assigned,
      questionsPerCell,
      totalQuestionsThisBatch: Math.min(BATCH_MAX_QUESTIONS, assigned.length * questionsPerCell),
    }
  })

  return {
    batches,
    totalTarget,
    targetPerCell,
    types,
    difficulties,
    linkStrength,
  }
}

// ============ Prompt 构建 ============

function buildLinkPrompt({ batch, categoryName, unitNames, chapterNames, linkStrength, existingQuestionsText }) {
  const kpText = batch.knowledgePoints
    .map((kp, i) => {
      const content = kp.knowledge_point || kp.front || '(无内容)'
      return `【知识点${i + 1}】[来源:${kp.unitName}] ${content.slice(0, 180)}`
    })
    .join('\n')

  const targetText = batch.targetCells
    .map(c => {
      const typeLabel = LINK_QUESTION_TYPES.find(t => t.value === c.type)?.label || c.type
      const diffLabel = LINK_DIFFICULTY_LEVELS.find(d => d.value === c.difficulty)?.label || `${c.difficulty}级`
      return `- ${typeLabel} × ${diffLabel}：约 ${batch.questionsPerCell} 道`
    })
    .join('\n')

  const strengthText = {
    low: '以各单元/章节内部知识点为主，偶尔跨单元交叉，但不强行关联无直接联系的知识点。',
    medium: '约一半题目考查单单元知识点，另一半考查跨单元/章节的关联性与综合应用。',
    high: '以跨单元/章节综合题为主，要求题目能串联多个知识点，考查综合应用与推理能力。',
  }[linkStrength || 'medium']

  return `你是一个专业的出题助手。请根据下方的"联结题库"知识点，在严格不超纲的前提下生成高质量题目。

【分类】${categoryName || '未指定'}
【参与单元】${(unitNames || []).join('、') || '未指定'}
【参与章节】${(chapterNames || []).join('、') || '未指定'}
【联结强度】${strengthText}

【核心规则（必须严格遵守）】
1. 绝对不超纲：题目考查的知识必须完全来自下方【输入知识点】或其合理推理，不得引入外部未列出的知识、理论、公式、案例或专有名词。
2. 各题型均匀分布：按目标组合分布，不要偏向单一题型。
3. 难度区分明确：
   - 简易（1）：直接考查原文定义、概念、基本事实，选项干扰弱。
   - 中等（2）：考查理解与应用，需要简单推理或多要素匹配。
   - 困难（3）：考查综合分析与跨知识点关联，需要推理、计算或辨析。
4. 题干必须完整清晰，禁止使用教材章节编号或纯标题。
5. 选择题（单选/多选）：4 个选项 A-D，单选只有 1 个正确，多选有 2-4 个正确，正确选项必须有明确依据。
6. 判断题：题干是一个陈述（而非问句），答案为"正确"或"错误"，并给出判断理由（analysis 中说明）。
7. 填空题：题干用 ____ 标记挖空位置，answer 填被挖空的关键词。
8. 每道题必须包含完整解析（analysis），说明正确答案依据或错误选项的问题。

【本批出题目标】
${targetText}
合计约 ${batch.totalQuestionsThisBatch} 道题。

【输入知识点】
${kpText}

${existingQuestionsText || ''}

【输出要求】
- 仅输出 JSON 数组，不要任何解释、Markdown、代码块标记、前后缀文本。
- 每题必须包含字段：type, stem, options, answer, analysis, difficulty, knowledgePoint, sourceIds
- type 取值：single_choice | multi_choice | true_false | fill_blank
- difficulty 取值：1 | 2 | 3
- options 格式：[{"label":"A","text":"选项A"},{"label":"B","text":"选项B"},...]。判断题 options 可为 [{"label":"正确","text":"正确"},{"label":"错误","text":"错误"}]。填空题 options 可为 []。
- knowledgePoint：用简短文字概括该题考查的核心知识点。
- sourceIds：数组，填入该题涉及的知识点编号（从 1 开始，对应上方【输入知识点】的编号），用于关联溯源。

请直接输出 JSON 数组，不要任何前缀或后缀文本。`
}

// ============ 响应解析 ============

function normalizeQuestion(q, fallbackType, fallbackDifficulty) {
  if (!q || typeof q !== 'object') return null
  const type = String(q.type || fallbackType).toLowerCase()
  return {
    type: LINK_QUESTION_TYPES.some(t => t.value === type) ? type : 'single_choice',
    stem: String(q.stem || '').trim(),
    options: Array.isArray(q.options) ? q.options : [],
    answer: String(q.answer || '').trim(),
    analysis: String(q.analysis || '').trim(),
    difficulty: Number(q.difficulty) || fallbackDifficulty || 2,
    knowledgePoint: String(q.knowledgePoint || q.knowledge_point || '').trim(),
    sourceIds: Array.isArray(q.sourceIds) ? q.sourceIds : [],
  }
}

function parseLinkResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return []

  // 预处理：移除可能被模型包裹的 ```json ... ```、``` ... ```
  let text = rawText
  const fenceMatch = text.match(/```(?:json)?[\s\n]*([\s\S]*?)```/i)
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim()
  }

  const tryParse = (str) => {
    try {
      const parsed = JSON.parse(str)
      if (Array.isArray(parsed)) return parsed
      if (parsed && Array.isArray(parsed.questions)) return parsed.questions
      if (parsed && Array.isArray(parsed.items)) return parsed.items
      if (parsed && Array.isArray(parsed.data)) return parsed.data
    } catch (_) { /* ignore */ }
    return null
  }

  // 1) 整块解析
  let extracted = tryParse(text)
  if (!extracted) {
    // 2) 匹配第一对方括号
    const bracketMatch = text.match(/\[[\s\S]*\]/)
    if (bracketMatch) extracted = tryParse(bracketMatch[0])
  }
  if (!extracted) {
    // 3) 逐行寻找 "{" 开始、"}" 结尾的对象，凑成数组（容错：模型输出单行 JSON 对象但漏加 [ ]）
    const lineObjects = []
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (line.startsWith('{') && line.endsWith('}')) {
        const p = tryParse(line)
        if (Array.isArray(p)) lineObjects.push(...p)
        else if (p && typeof p === 'object') lineObjects.push(p)
      }
    }
    if (lineObjects.length > 0) extracted = lineObjects
  }

  if (!Array.isArray(extracted)) return []

  const results = []
  for (const raw of extracted) {
    const norm = normalizeQuestion(raw, 'single_choice', 2)
    if (norm && norm.stem && norm.answer) results.push(norm)
  }
  return results
}

// ============ 主流程 ============

export async function runLinkGeneration({
  mode,
  ids,
  categoryId,
  difficulty = null,
  linkStrength = 'medium',
  config,
  targetPerCell = 3,
  onProgress,
  isCancelled,
  explicitTypes = null,
  explicitDifficulties = null,
  similarityThreshold = 0.7,
}) {
  if (!isStrongModel(config)) {
    throw new Error('当前 AI 配置不是强模型，联结题库需要强模型支持。请在设置中切换为 DeepSeek / 星火 Pro+ / 火山引擎 / 千问。')
  }
  if (!ids || ids.length < 2) {
    throw new Error('请至少选择 2 个单元或章节进行联结。')
  }

  const category = await getCategoryById(categoryId)
  const categoryName = category?.name || ''
  const unitNames = []

  let knowledgePoints = []
  if (mode === 'unit') {
    for (const uid of ids) {
      const u = await getUnit(uid)
      if (u) unitNames.push(u.name || '')
    }
    knowledgePoints = await collectKnowledgePointsFromUnits(ids)
  } else {
    knowledgePoints = await collectKnowledgePointsFromChapters(ids, categoryId)
  }

  if (knowledgePoints.length === 0) {
    throw new Error('所选单元/章节暂无卡片，无法生成题目。请先在该分类下添加学习内容。')
  }

  const existingQuestions = await getTestQuestionsByCategory(categoryId)

  const diffNum = difficulty ? Number(difficulty) : null
  const plan = planGenerationBatches({
    knowledgePoints,
    difficulty: diffNum,
    linkStrength,
    targetPerCell,
    explicitTypes,
    explicitDifficulties,
  })

  if (plan.batches.length === 0) {
    throw new Error('无法规划生成批次，请检查知识点数量与目标参数。')
  }

  const existingSample = existingQuestions.slice(0, 8)
    .map((q, i) => `已有${i + 1} [${q.type} diff=${q.difficulty}]：${String(q.stem || '').slice(0, 100)}`)
    .join('\n')
  const existingBlock = existingSample
    ? `【已有题库参考（避免重复）】\n${existingSample}\n`
    : ''

  const allQuestions = []
  const batchReports = []
  const totalBatches = plan.batches.length
  const MAX_RETRIES = 2
  const LINK_CONCURRENCY = 3
  const LINK_MIN_INTERVAL_MS = 400
  const SIMILARITY_THRESHOLD = Number(similarityThreshold) || 0.7

  const taskList = plan.batches.map((batch, bi) => ({ batchIndex: bi, batch }))

  const runResult = await runTasksConcurrently(
    taskList,
    async ({ batchIndex, batch }) => {
      if (isCancelled && isCancelled()) {
        throw new Error('任务已被取消。')
      }
      if (onProgress) onProgress(Math.round((batchIndex / totalBatches) * 100),
        `第 ${batchIndex + 1}/${totalBatches} 批：准备中…`)

      const prompt = buildLinkPrompt({
        batch,
        categoryName,
        unitNames,
        chapterNames: [],
        linkStrength,
        existingQuestionsText: existingBlock,
      })

      let parsed = []
      let lastError = null
      let attempts = 0
      while (attempts <= MAX_RETRIES) {
        try {
          if (onProgress) onProgress(
            Math.round((batchIndex / totalBatches) * 100),
            `第 ${batchIndex + 1}/${totalBatches} 批：AI 出题中（${attempts > 0 ? `重试${attempts}/` : ''}${batch.targetCells.length} 种题型×难度组合，约 ${batch.totalQuestionsThisBatch} 题）…`,
          )
          const raw = await generateTestQuestions(prompt, config)
          const candidate = parseLinkResponse(raw)
          if (Array.isArray(candidate) && candidate.length > 0) {
            parsed = candidate
            lastError = null
            break
          }
          lastError = '模型未返回有效题目数组'
        } catch (err) {
          lastError = err?.message || '未知错误'
        }
        attempts++
      }
      return { batchIndex, parsed, lastError }
    },
    {
      concurrency: LINK_CONCURRENCY,
      minIntervalMs: LINK_MIN_INTERVAL_MS,
      label: `link-${totalBatches || 0}`,
      onProgress: ({ done, total }) => {
        if (onProgress) onProgress(Math.round((done / total) * 100), `联结题库：${done}/${total} 批已处理…`)
      },
    },
  )

  // ============ 升级版：三重去重（stem 相似度 + 选项一致性 + 难度/题型一致） ============
  const normalizedExisting = existingQuestions.map(eq => ({
    stem: String(eq.stem || '').trim().toLowerCase().replace(/\s+/g, ''),
    type: String(eq.type || '').toLowerCase(),
    difficulty: Number(eq.difficulty) || 1,
    options: (Array.isArray(eq.options) ? eq.options : [])
      .map(o => String(o.text || '').trim().toLowerCase().replace(/\s+/g, ''))
      .filter(Boolean).sort().join('|'),
  }))

  const items = runResult.results
    .map((r) => (r.result ? r.result : { batchIndex: r.task.batchIndex, parsed: [], lastError: r.error?.message || null }))
    .sort((a, b) => a.batchIndex - b.batchIndex)

  for (const { batchIndex, parsed, lastError } of items) {
    let addedThisBatch = 0
    for (const q of parsed) {
      const stem = q.stem
      // 1) 与已通过去重的新题目比较
      const dupInNew = allQuestions.some(aq => similarity(aq.stem, stem) >= SIMILARITY_THRESHOLD)
      if (dupInNew) continue

      // 2) 与已有题目比较（stem 相似度 + 选项一致 + 题型/难度一致）
      const qStemNorm = String(stem || '').trim().toLowerCase().replace(/\s+/g, '')
      const qType = String(q.type || '').toLowerCase()
      const qDiff = Number(q.difficulty) || 1
      const qOptions = (Array.isArray(q.options) ? q.options : [])
        .map(o => String(o.text || '').trim().toLowerCase().replace(/\s+/g, ''))
        .filter(Boolean).sort().join('|')

      const dupInExisting = normalizedExisting.some(eq => {
        if (qStemNorm && eq.stem && similarity(eq.stem, qStemNorm) >= SIMILARITY_THRESHOLD) return true
        if (qOptions && eq.options && qOptions === eq.options && qType === eq.type && qDiff === eq.difficulty) return true
        return false
      })
      if (dupInExisting) continue

      allQuestions.push(q)
      addedThisBatch++
    }
    batchReports.push({
      batchIndex,
      typesCovered: [...new Set(parsed.map(p => p.type))],
      generated: parsed.length,
      accepted: addedThisBatch,
      targetCells: plan.batches[batchIndex].targetCells,
      error: lastError || undefined,
    })
  }

  if (onProgress) onProgress(100, `联结题库生成完成：共 ${allQuestions.length} 题`)

  const toSave = allQuestions.slice(0, Math.max(plan.totalTarget, allQuestions.length))
    .map(q => ({
      id: generateId(),
      categoryId,
      unitId: '',
      chapterId: '',
      testType: 'link_test',
      targetId: categoryId,
      cardId: '',
      userId: '',
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
      difficulty: Number(q.difficulty) || 2,
      knowledgePoint: q.knowledgePoint,
      sourceIds: q.sourceIds,
      linkInfo: JSON.stringify({ mode, ids, linkStrength, difficulty: diffNum, explicitTypes, explicitDifficulties }),
      pendingReview: true,
      createdAt: Date.now(),
    }))

  if (toSave.length > 0) {
    await addTestQuestions(toSave)
  }

  const linkQuality = validateQuestionQuality(toSave, [], {
    requireCardIds: false,
    existingQuestions,
    similarityThreshold: SIMILARITY_THRESHOLD,
  })
  const linkCoverage = computeTargetCoverage(toSave, [], plan.types, plan.difficulties, { targetPerCell })

  const finalStats = {
    totalGenerated: toSave.length,
    questions: toSave,
    totalTarget: plan.totalTarget,
    totalExisting: existingQuestions.length,
    similarityThreshold: SIMILARITY_THRESHOLD,
    stats: {
      byType: countBy(toSave, 'type'),
      byDifficulty: countBy(toSave, 'difficulty'),
      knowledgePointsCount: knowledgePoints.length,
    },
    quality: linkQuality,
    coverage: linkCoverage,
  }

  try {
    await addLinkGenerationRun({
      categoryId,
      mode,
      linkStrength,
      difficulty: diffNum,
      targetPerCell,
      explicitTypes,
      explicitDifficulties,
      unitIds: mode === 'unit' ? ids : [],
      chapterIds: mode === 'chapter' ? ids : [],
      knowledgePointCount: knowledgePoints.length,
      batchCount: plan.batches.length,
      generatedCount: toSave.length,
      totalTarget: plan.totalTarget,
      totalExisting: existingQuestions.length,
      similarityThreshold: SIMILARITY_THRESHOLD,
      dupVsExistingExact: linkQuality.dupVsExistingExact || 0,
      dupVsExistingSimilar: linkQuality.dupVsExistingSimilar || 0,
      distributionByType: finalStats.stats.byType,
      distributionByDifficulty: finalStats.stats.byDifficulty,
      questionIds: toSave.map(q => q.id),
      errorMessage: batchReports.some(r => r.error)
        ? batchReports.filter(r => r.error).map(r => `第${r.batchIndex + 1}批：${r.error}`).join('；')
        : '',
      createdAt: Date.now(),
    })
  } catch (_) { /* 忽略 */ }

  return {
    ...finalStats,
    batchReports,
    flowReport: buildFlowReport({
      mode,
      selectedIds: ids,
      difficulty: diffNum,
      linkStrength,
      knowledgePointsCount: knowledgePoints.length,
      plan,
      batchReports,
      finalStats,
    }),
  }
}

// ============ 工具函数 ============

function countBy(arr, key) {
  const m = {}
  for (const item of arr) {
    const k = String(item[key])
    m[k] = (m[k] || 0) + 1
  }
  return m
}

function similarity(a, b) {
  if (!a || !b) return 0
  const s1 = String(a), s2 = String(b)
  if (s1 === s2) return 1
  const len1 = s1.length, len2 = s2.length
  const minLen = Math.min(len1, len2)
  if (minLen === 0) return 0
  let match = 0
  for (let i = 0; i < len1; i++) {
    if (s2.includes(s1[i])) match++
  }
  return match / Math.max(len1, len2)
}

export async function analyzeCurrentLinkDistribution(categoryId) {
  const allQs = await getTestQuestionsByCategory(categoryId)
  const types = LINK_QUESTION_TYPES.map(t => t.value)
  const diffs = [1, 2, 3]

  const matrix = {}
  for (const t of types) for (const d of diffs) matrix[`${t}_${d}`] = 0
  for (const q of allQs) {
    const key = `${String(q.type || '').toLowerCase()}_${Number(q.difficulty) || 2}`
    if (key in matrix) matrix[key] += 1
  }

  return {
    total: allQs.length,
    byType: types.map(t => ({ type: t, count: allQs.filter(q => q.type === t).length })),
    byDifficulty: diffs.map(d => ({ difficulty: d, count: allQs.filter(q => Number(q.difficulty) === d).length })),
    matrix,
  }
}

/**
 * 在联结题库页面：给定选中的 unitIds，统计这些单元已有题目 + 整个分类的 link_test 题目
 * 合并后的分布，用于给用户直观展示当前已覆盖的情况。
 */
export async function analyzeCombinedDistribution(categoryId, unitIds = []) {
  // 1) 当前分类下的 link_test 题目（题目归属于分类，不属于具体单元）
  const linkQuestions = (await getTestQuestionsByCategory(categoryId)).filter(q => q.testType === 'link_test')
  // 2) 选中单元的卡片 → 暂不统计，因为只有正式题目会出现在卡片；这里合并：
  //    将 link_test 视为跨单元题目的集合
  const types = LINK_QUESTION_TYPES.map(t => t.value)
  const diffs = [1, 2, 3]

  const matrix = {}
  for (const t of types) for (const d of diffs) matrix[`${t}_${d}`] = 0
  for (const q of linkQuestions) {
    const key = `${String(q.type || '').toLowerCase()}_${Number(q.difficulty) || 2}`
    if (key in matrix) matrix[key] += 1
  }

  return {
    total: linkQuestions.length,
    byType: types.map(t => ({ type: t, count: linkQuestions.filter(q => q.type === t).length })),
    byDifficulty: diffs.map(d => ({ difficulty: d, count: linkQuestions.filter(q => Number(q.difficulty) === d).length })),
    matrix,
    unitIds,
  }
}

/**
 * 同步版本：给定一组题目对象，计算当前题目的分布
 * 用于单元选择后在前端直接显示分布
 */
export function analyzeCurrentUnitDistribution(questions) {
  const types = LINK_QUESTION_TYPES.map(t => t.value)
  const diffs = [1, 2, 3]

  const matrix = {}
  for (const t of types) for (const d of diffs) matrix[`${t}_${d}`] = 0
  const qs = Array.isArray(questions) ? questions : []
  for (const q of qs) {
    const key = `${String(q.type || '').toLowerCase()}_${Number(q.difficulty) || 2}`
    if (key in matrix) matrix[key] += 1
  }

  return {
    total: qs.length,
    byType: types.map(t => ({ type: t, count: qs.filter(q => q.type === t).length })),
    byDifficulty: diffs.map(d => ({ difficulty: d, count: qs.filter(q => Number(q.difficulty) === d).length })),
    matrix,
  }
}

export function buildFlowReport({
  mode, selectedIds, difficulty, linkStrength, knowledgePointsCount,
  plan, batchReports, finalStats,
}) {
  return {
    steps: [
      {
        title: '1. 选择范围',
        detail: mode === 'unit'
          ? `选择了 ${selectedIds.length} 个单元进行联结出题`
          : `选择了 ${selectedIds.length} 个章节进行联结出题`,
        status: 'ok',
      },
      {
        title: '2. 强模型校验',
        detail: '检测到强模型配置，可启用联结题库模式',
        status: 'ok',
      },
      {
        title: '3. 知识点收集',
        detail: `从所选范围中共收集 ${knowledgePointsCount} 条知识点（已去重）`,
        status: 'ok',
      },
      {
        title: '4. 动态分批规划',
        detail: `按 token 上限拆分 ${plan.batches.length} 个批次，每批承载不同 (题型×难度) 组合`,
        status: 'ok',
      },
      {
        title: '5. 串行生成题目',
        detail: batchReports
          .map(r => r.error
            ? `第 ${r.batchIndex + 1} 批：❌ ${r.error}`
            : `第 ${r.batchIndex + 1} 批：${r.typesCovered.length} 种题型，生成 ${r.generated} 题`,
          ).join('\n'),
        status: batchReports.some(r => r.error) ? 'warning' : 'ok',
      },
      {
        title: '6. 入库完成',
        detail: `共生成 ${finalStats?.totalGenerated ?? 0} 题，按题型分布：${Object.entries(finalStats?.stats?.byType || {}).map(([k, v]) => `${k}=${v}`).join(', ')}`,
        status: 'ok',
      },
    ],
    parameters: {
      mode,
      difficulty,
      linkStrength,
      totalTarget: plan?.totalTarget ?? 0,
      types: plan?.types || [],
      difficulties: plan?.difficulties || [],
    },
  }
}

export default {
  runLinkGeneration,
  planGenerationBatches,
  collectKnowledgePointsFromUnits,
  collectKnowledgePointsFromChapters,
  analyzeCurrentLinkDistribution,
  analyzeCombinedDistribution,
  analyzeCurrentUnitDistribution,
  buildFlowReport,
  LINK_QUESTION_TYPES,
  LINK_DIFFICULTY_LEVELS,
  LINK_STRENGTH_LEVELS,
}
