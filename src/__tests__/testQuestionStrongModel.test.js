import { describe, it, expect, vi, beforeEach } from 'vitest'

// 在文件顶部 mock aiService（与 multiCall.test.js 一致）
// 注意：vi.hoisted + vi.mock 让 mock 与 import 同步 hoist
const { mockGenerateTestQuestions } = vi.hoisted(() => ({
  mockGenerateTestQuestions: vi.fn(),
}))
vi.mock('../services/aiService', () => ({
  generateTestQuestions: mockGenerateTestQuestions,
}))

// 必须在 mock 之后再 import
import { __test__ } from '../services/testQuestionService'
import { LITE_QUESTION_TYPES } from '../utils/constants'

const { isStrongModel } = __test__

describe('isStrongModel - 强模型识别', () => {
  it('DeepSeek 应识别为强模型', () => {
    expect(isStrongModel({ aiServiceMode: 'deepseek' })).toBe(true)
  })

  it('讯飞星火 Pro/Max/4.0Ultra 应识别为强模型', () => {
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'generalv3' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'pro-128k' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'max-32k' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: '4.0Ultra' })).toBe(true)
  })

  it('豆包/千问 应识别为强模型', () => {
    expect(isStrongModel({ aiServiceMode: 'volcano' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'dashscope' })).toBe(true)
  })

  it('讯飞星火 lite 应识别为弱模型（不算强模型）', () => {
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'lite' })).toBe(false)
  })

  it('空 config 不应抛错', () => {
    expect(isStrongModel(null)).toBe(false)
    expect(isStrongModel(undefined)).toBe(false)
    expect(isStrongModel({})).toBe(false)
  })

  it('未知模式不应抛错且不算强模型', () => {
    expect(isStrongModel({ aiServiceMode: 'unknown-ai' })).toBe(false)
  })

  it('默认 sparkModel 缺省时应按 iflytek-spark + 默认非 lite 处理（视为强模型）', () => {
    // 讯飞星火若未指定 model，默认应该是 generalv3（强模型）而非 lite
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark' })).toBe(true)
  })
})

// ===== buildStrongModelTasks 测试 =====
const { buildStrongModelTasks, analyzeQuestionMatrix } = __test__

describe('buildStrongModelTasks - 强模型任务清单构造', () => {
  const sampleCards = Array.from({ length: 30 }, (_, i) => ({
    id: `card_${i + 1}`,
    knowledge_point: `KP${i + 1}`,
    front: `Q${i + 1}？`,
    back: `A${i + 1}`,
  }))

  it('无本地题库时，30 张卡 = 2 批 × 2 题型组 = 4 个任务', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [])
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 2 })
    expect(result.tasks).toHaveLength(4)
    expect(result.skipped.empty).toBe(0)
  })

  it('全部 4 题型 × 3 难度都已出齐时，30 张卡 = 0 个任务（短路）', () => {
    const types = LITE_QUESTION_TYPES.map(t => t.type)
    const existing = []
    for (const c of sampleCards) {
      for (const t of types) {
        for (const d of [1, 2, 3]) existing.push({ type: t, cardId: c.id, stem: 'q', difficulty: d })
      }
    }
    const matrix = analyzeQuestionMatrix(sampleCards, existing)
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 2 })
    expect(result.tasks).toHaveLength(0)
    expect(result.skipped.empty).toBe(2)  // 2 批都跳过
  })

  it('单批内全部 card 都已出齐某 type（含 3 难度）时，题型组应跳过该 type', () => {
    // 30 张卡，让前 15 张的 single_choice（3 个难度）都已出齐（批 1 全部）
    const existing = sampleCards.slice(0, 15).flatMap(c =>
      [1, 2, 3].map(d => ({ type: 'single_choice', cardId: c.id, stem: 'q', difficulty: d }))
    )
    const matrix = analyzeQuestionMatrix(sampleCards, existing)
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 2 })
    // 批 1 (前 15 张)：single_choice 全部出齐 → 该题型不出
    //   needTypes = [multi_choice, true_false, fill_blank]
    //   objective 组 (multi_choice) + binary 组 (true_false+fill_blank) = 2 个任务
    // 批 2 (后 15 张)：4 题型都缺 → objective + binary = 2 个任务
    // 总：4 个任务
    expect(result.tasks.length).toBe(4)
    // 验证 batch 0 没有 single_choice
    const batch1Single = result.tasks.filter(t => t.batchIdx === 0 && t.types.includes('single_choice'))
    expect(batch1Single).toHaveLength(0)
    // 验证 batch 1 仍需要 single_choice
    const batch2Single = result.tasks.filter(t => t.batchIdx === 1 && t.types.includes('single_choice'))
    expect(batch2Single).toHaveLength(1)
  })

  it('maxTypesPerBatch=1 时，每任务最多 1 个题型（与弱模型对齐）', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [])
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 1 })
    // 2 批 × 4 题型 = 8 个任务
    expect(result.tasks).toHaveLength(8)
  })
})

// ===== buildStrongModelPrompt 测试 =====
const { buildStrongModelPrompt } = __test__

describe('buildStrongModelPrompt - 强模型多题型 prompt', () => {
  const sampleCards = [
    { id: 'card_1', knowledge_point: '内存', front: 'RAM 的特点？', back: '断电丢失' },
    { id: 'card_2', knowledge_point: 'OSI', front: 'OSI 几层？', back: '7 层' },
  ]

  it('应包含所有要求的题型标识', () => {
    const p = buildStrongModelPrompt(sampleCards, ['single_choice', 'multi_choice'])
    expect(p).toMatch(/单选题/)
    expect(p).toMatch(/多选题/)
    expect(p).toContain('标记1')
    expect(p).toContain('标记2')
  })

  it('应包含通用硬约束（label 必须是 A-D）', () => {
    const p = buildStrongModelPrompt(sampleCards, ['single_choice'])
    expect(p).toMatch(/A-D|A\/B\/C\/D/)
    expect(p).toMatch(/label/)
  })

  it('传 matrix 时应嵌入"已有题库"段', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [
      { type: 'single_choice', cardId: 'card_1', stem: 'c1 已有' },
    ])
    const p = buildStrongModelPrompt(sampleCards, ['single_choice', 'multi_choice'], { matrix })
    expect(p).toContain('按卡片精确提示')
    expect(p).toContain('标记1')
  })

  it('不传 matrix 时应只显示全局参考/暂无', () => {
    const p = buildStrongModelPrompt(sampleCards, ['true_false'], { existingQuestions: [] })
    expect(p).toMatch(/判断题/)
    expect(p).toMatch(/暂无/)
  })

  it('填空题 prompt 必须含 ____ 标记说明', () => {
    const p = buildStrongModelPrompt(sampleCards, ['fill_blank'])
    expect(p).toMatch(/_+/)
    expect(p).toMatch(/填空/)
  })

  it('多种题型一次出题时，每种题型规则都应出现', () => {
    const p = buildStrongModelPrompt(sampleCards, ['single_choice', 'true_false', 'fill_blank', 'multi_choice'])
    expect(p).toMatch(/单选题/)
    expect(p).toMatch(/多选题/)
    expect(p).toMatch(/判断题/)
    expect(p).toMatch(/填空题/)
  })
})

// ===== parseMultiTypeResponse 测试 =====
const { parseMultiTypeResponse } = __test__

describe('parseMultiTypeResponse - 多题型返回解析（兼容对象/数组）', () => {
  it('AI 返回对象 { single_choice: [...], multi_choice: [...] } 应被正确解析', () => {
    const raw = JSON.stringify({
      single_choice: [{ type: 'single_choice', stem: 'q1？' }],
      multi_choice: [{ type: 'multi_choice', stem: 'q2？' }],
    })
    const result = parseMultiTypeResponse(raw, ['single_choice', 'multi_choice'])
    expect(result).toHaveLength(2)
    expect(result.map(q => q.type).sort()).toEqual(['multi_choice', 'single_choice'])
  })

  it('AI 返回数组 [...] 应被正确解析', () => {
    const raw = JSON.stringify([
      { type: 'single_choice', stem: 'q1？' },
      { type: 'true_false', stem: 'q2？' },
    ])
    const result = parseMultiTypeResponse(raw, ['single_choice', 'true_false'])
    expect(result).toHaveLength(2)
  })

  it('AI 返回带 Markdown 代码块的对象应被正确解析', () => {
    const raw = '```json\n{"single_choice": [{"type": "single_choice", "stem": "q？"}]}\n```'
    const result = parseMultiTypeResponse(raw, ['single_choice'])
    expect(result).toHaveLength(1)
  })

  it('AI 返回带说明文字 + JSON 数组 应被正确解析', () => {
    const raw = '以下是生成的题目：\n[{"type": "single_choice", "stem": "q？"}]\n请查收。'
    const result = parseMultiTypeResponse(raw, ['single_choice'])
    expect(result).toHaveLength(1)
  })

  it('空返回应返回空数组', () => {
    expect(parseMultiTypeResponse('', ['single_choice'])).toEqual([])
    expect(parseMultiTypeResponse('[]', ['single_choice'])).toEqual([])
    expect(parseMultiTypeResponse('{}', ['single_choice'])).toEqual([])
  })

  it('非法 JSON 应返回空数组（不抛错）', () => {
    expect(parseMultiTypeResponse('not json', ['single_choice'])).toEqual([])
  })

  it('题目 type 字段缺失时，应根据所在 key 补全', () => {
    const raw = JSON.stringify({
      single_choice: [{ stem: 'q？' }],  // 缺 type 字段
    })
    const result = parseMultiTypeResponse(raw, ['single_choice'])
    expect(result[0].type).toBe('single_choice')
  })

  it('多题型混合数组应保留 type 字段（即使与所在 key 不一致）', () => {
    const raw = JSON.stringify({
      objective: [
        { type: 'single_choice', stem: 'q1？' },
        { type: 'multi_choice', stem: 'q2？' },
      ],
    })
    const result = parseMultiTypeResponse(raw, ['single_choice', 'multi_choice'])
    expect(result).toHaveLength(2)
    expect(result.map(q => q.type).sort()).toEqual(['multi_choice', 'single_choice'])
  })
})

// ===== generateQuestionsForStrongModel 测试 =====
// 复用文件顶部 mock
const { generateQuestionsForStrongModel } = __test__

describe('generateQuestionsForStrongModel - 强模型省 token 主流程', () => {
  const sampleCards = Array.from({ length: 30 }, (_, i) => ({
    id: `card_${i + 1}`,
    knowledge_point: `KP${i + 1}`,
    front: `Q${i + 1}？`,
    back: `A${i + 1}`,
  }))
  const statusMap = Object.fromEntries(sampleCards.map(c => [c.id, 'new']))
  const strongConfig = { aiServiceMode: 'deepseek' }

  beforeEach(() => {
    mockGenerateTestQuestions.mockReset()
  })

  it('30 张卡 + 无本地题库 → 2 批 × 2 题型组 = 4 次调用', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const result = await generateQuestionsForStrongModel(
      sampleCards, statusMap, [], 'unit', strongConfig
    )
    expect(result.callCount).toBe(4)
    expect(result.batchCount).toBe(2)
    expect(mockGenerateTestQuestions).toHaveBeenCalledTimes(4)
  })

  it('全 4 题型 × 3 难度已出齐时短路返回（callCount=0）', async () => {
    const types = LITE_QUESTION_TYPES.map(t => t.type)
    const existing = []
    for (const c of sampleCards) {
      for (const t of types) {
        for (const d of [1, 2, 3]) existing.push({ type: t, cardId: c.id, stem: 'q', difficulty: d })
      }
    }
    const result = await generateQuestionsForStrongModel(
      sampleCards, statusMap, existing, 'unit', strongConfig
    )
    expect(result.callCount).toBe(0)
    expect(result.skippedReason).toBe('all_satisfied')
    expect(mockGenerateTestQuestions).not.toHaveBeenCalled()
  })

  it('100 张卡 + 60 张已有 single_choice/true_false → 调用次数应符合预期（仍 14 次，因为单组题型未完全消除）', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const bigCards = Array.from({ length: 100 }, (_, i) => ({
      id: `card_${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))
    const existing = []
    for (let i = 0; i < 60; i++) {
      for (const d of [1, 2, 3]) {
        existing.push({ type: 'single_choice', cardId: `card_${i + 1}`, stem: 'q', difficulty: d })
        existing.push({ type: 'true_false', cardId: `card_${i + 1}`, stem: 'q', difficulty: d })
      }
    }
    const result = await generateQuestionsForStrongModel(
      bigCards, statusMap, existing, 'category', strongConfig
    )
    // 100/15 = 7 批
    // 批 1-4 (前 60 张)：single_choice/true_false 已出齐
    //   → needTypes = [multi_choice, fill_blank]
    //   → objective 组 (multi_choice) + binary 组 (fill_blank) = 2 次/批
    //   → 4 批 × 2 = 8 次
    // 批 5-7 (后 40 张)：4 题型都缺
    //   → objective 组 (single_choice+multi_choice) + binary 组 (true_false+fill_blank) = 2 次/批
    //   → 3 批 × 2 = 6 次
    // 总：8 + 6 = 14 次
    expect(result.callCount).toBe(14)
    // 但每批 prompt 中的题型数减少 → 单次 prompt token 减少
    expect(result.callCount).toBeLessThanOrEqual(14)
  })

  it('AI 返回合法题目应被收集（4 选项 + 完整 prompt）', async () => {
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题')) {
        return JSON.stringify([{
          type: 'single_choice',
          stem: '下列关于内存的特点，哪一项是正确的？',
          options: [
            { label: 'A', text: '断电后数据被清空' },
            { label: 'B', text: '容量无限大' },
            { label: 'C', text: '速度比硬盘慢' },
            { label: 'D', text: '无法读写数据' },
          ],
          answer: 'A',
        }])
      }
      return '[]'
    })
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap, [], 'unit', strongConfig
    )
    const types = result.questions.map(q => q.type)
    expect(types).toContain('single_choice')
  })

  it('AI 返回重复题（cardId 已出齐）应被丢弃', async () => {
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题')) {
        return JSON.stringify([{
          type: 'single_choice',
          cardId: '标记1',
          stem: '已有',
          options: [
            { label: 'A', text: '选项A' },
            { label: 'B', text: '选项B' },
          ],
          answer: 'A',
        }])
      }
      return '[]'
    })
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap,
      [{ type: 'single_choice', cardId: 'card_1', stem: '已有' }],
      'unit', strongConfig
    )
    expect(result.questions.filter(q => q.cardId === 'card_1')).toHaveLength(0)
  })

  it('单批失败不应中断其它批（容错）', async () => {
    let callIdx = 0
    mockGenerateTestQuestions.mockImplementation(async () => {
      callIdx++
      if (callIdx <= 3) throw new Error('mock network error')
      return '[]'
    })
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap, [], 'unit', strongConfig,
      { concurrency: 1, minIntervalMs: 0 }
    )
    // 1 批 × 2 题型组 = 2 个任务；任务 1 重试 3 次失败 → failedCount=1
    expect(result.failedCount).toBe(1)
    expect(result.successCount).toBe(1)
  })

  it('返回结果应包含 matrix / skippedTasks / callCount', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap, [], 'unit', strongConfig
    )
    expect(result.matrix).toBeDefined()
    expect(result.skippedTasks).toBeDefined()
    expect(result.callCount).toBe(2)
  })
})

// ===== 集成 - 端到端测试 =====
describe('集成 - 强模型省 token 端到端', () => {
  it('30 张卡片 + 60% 本地题库 → 调用次数应符合预期', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const cards = Array.from({ length: 30 }, (_, i) => ({
      id: `card_${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))
    // 18 张已有 single_choice
    const existing = cards.slice(0, 18).map(c => ({
      type: 'single_choice', cardId: c.id, stem: 'q',
    }))
    const result = await generateQuestionsForStrongModel(
      cards, {}, existing, 'unit',
      { aiServiceMode: 'deepseek' }
    )
    // 30/15 = 2 批
    // 批 1 (前 15 张)：needTypes = [multi_choice, true_false, fill_blank]
    //   objective 组 (multi_choice) + binary 组 (true_false+fill_blank) = 2 次
    // 批 2 (后 15 张)：4 题型都缺 → 2 次
    // 总：4 次
    expect(result.callCount).toBe(4)
  })

  it('多题型 prompt 应分别包含目标题型标识', async () => {
    const prompts = []
    mockGenerateTestQuestions.mockImplementation(async (p) => {
      prompts.push(p)
      return '[]'
    })
    const cards = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))
    await generateQuestionsForStrongModel(
      cards, {}, [], 'unit', { aiServiceMode: 'deepseek' }
    )
    // 1 批 × 2 题型组 = 2 个 prompt
    expect(prompts).toHaveLength(2)
    // 第一个 prompt 应包含选择题（单选 + 多选）
    expect(prompts[0]).toMatch(/单选题|多选题/)
    // 第二个 prompt 应包含判断或填空
    expect(prompts[1]).toMatch(/判断题|填空题/)
  })

  it('不同强模型的 batchSize 应不同（DeepSeek 15，Spark Pro 12）', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const cards = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))

    // DeepSeek 15 张/批 → 2 批
    const deepseekResult = await generateQuestionsForStrongModel(
      cards, {}, [], 'unit', { aiServiceMode: 'deepseek' }
    )
    expect(deepseekResult.batchCount).toBe(2)

    // Spark Pro 12 张/批 → 3 批
    const sparkProResult = await generateQuestionsForStrongModel(
      cards, {}, [], 'unit', { aiServiceMode: 'iflytek-spark', sparkModel: 'generalv3' }
    )
    expect(sparkProResult.batchCount).toBe(3)
  })

  it('强模型返回对象格式 { single_choice: [...] } 应被正确解析', async () => {
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题') || prompt.includes('多选题')) {
        return JSON.stringify({
          single_choice: [{
            type: 'single_choice',
            stem: '这是 RAM 的特点吗？',
            options: [
              { label: 'A', text: '断电丢失' },
              { label: 'B', text: '永久存储' },
              { label: 'C', text: '速度慢' },
              { label: 'D', text: '容量无限' },
            ],
            answer: 'A',
          }],
        })
      }
      return '[]'
    })

    const cards = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i + 1}`, front: `Q${i + 1}？`, back: `A${i + 1}`,
    }))
    const result = await generateQuestionsForStrongModel(
      cards, {}, [], 'unit', { aiServiceMode: 'deepseek' }
    )
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].type).toBe('single_choice')
  })
})
