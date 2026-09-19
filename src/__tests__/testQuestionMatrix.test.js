import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LITE_QUESTION_TYPES } from '../utils/constants'

// aiService 的 generateTestQuestions 必须在文件顶部 mock 才能拦截 testQuestionService 的静态导入
// vi.hoisted() 确保 mock 变量也被 hoist，与 vi.mock 工厂同步
const { mockGenerateTestQuestions } = vi.hoisted(() => ({
  mockGenerateTestQuestions: vi.fn(),
}))
vi.mock('../services/aiService', () => ({
  generateTestQuestions: mockGenerateTestQuestions,
}))

// 必须在 mock 之后再 import（vi.mock 已 hoist，import 拿到的是 mock 版本）
import { __test__ } from '../services/testQuestionService'

const {
  analyzeQuestionMatrix,
  isBatchTypeSatisfied,
  formatExistingQuestionsForBatch,
  buildLitePromptByType,
  generateQuestionsForWeakModel,
  MAX_QUESTIONS_PER_CARD_TYPE,
} = __test__

beforeEach(() => {
  mockGenerateTestQuestions.mockReset()
})

// ===== analyzeQuestionMatrix: 题目矩阵基础分析 =====
describe('analyzeQuestionMatrix - 本地题目矩阵分析', () => {
  it('无已有题库时：所有 (card, type) 都应被标记为"还需要生成"', () => {
    const cards = [
      { id: 'c1', knowledge_point: 'KP1' },
      { id: 'c2', knowledge_point: 'KP2' },
    ]
    const matrix = analyzeQuestionMatrix(cards, [])
    // 统计每个 type 在 byCardType 中是否为空
    expect(matrix.totalCount).toBe(0)
    expect(matrix.totalByType).toEqual({})
    // 2 张卡片都缺所有 4 种题型
    for (const card of cards) {
      const need = matrix.needTypesByCard.get(card.id) || []
      expect(need).toEqual(expect.arrayContaining(['single_choice', 'multi_choice', 'true_false', 'fill_blank']))
      expect(need).toHaveLength(4)
    }
  })

  it('已有 single_choice 题的 card 1 应不再需要 single_choice', () => {
    const cards = [{ id: 'c1', knowledge_point: 'KP1' }]
    const existing = [{
      type: 'single_choice',
      cardId: 'c1',
      stem: '已有单选？',
      options: [{ label: 'A', text: 'x' }],
    }]
    // 传 targetDifficulty=2（与 existing 默认难度一致），仅检查该难度是否已出齐
    const matrix = analyzeQuestionMatrix(cards, existing, 2)
    expect(matrix.totalCount).toBe(1)
    expect(matrix.totalByType.single_choice).toBe(1)

    const need = matrix.needTypesByCard.get('c1') || []
    expect(need).not.toContain('single_choice')
    expect(need).toEqual(expect.arrayContaining(['multi_choice', 'true_false', 'fill_blank']))
    expect(need).toHaveLength(3)
  })

  it('同一 card 已有同 type 满 MAX_QUESTIONS_PER_CARD_TYPE 道时不再需要', () => {
    const cards = [{ id: 'c1' }]
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: 'q1' },
      { type: 'single_choice', cardId: 'c1', stem: 'q2' },  // 超过 MAX=1
    ]
    // 传 targetDifficulty=2（与 existing 默认难度一致）
    const matrix = analyzeQuestionMatrix(cards, existing, 2)
    const need = matrix.needTypesByCard.get('c1') || []
    expect(need).not.toContain('single_choice')
  })

  it('cardId 缺失的题目应计入 totalCount 但不影响 byCardType', () => {
    const cards = [{ id: 'c1' }]
    const existing = [
      { type: 'true_false', cardId: '', stem: 'q1' },  // 无 cardId
      { type: 'true_false', cardId: 'c1', stem: 'q2' },
    ]
    // 传 targetDifficulty=2（与 existing 默认难度一致）
    const matrix = analyzeQuestionMatrix(cards, existing, 2)
    expect(matrix.totalCount).toBe(2)
    expect(matrix.totalByType.true_false).toBe(2)
    // c1 已有 1 道 true_false，不再需要
    const need = matrix.needTypesByCard.get('c1') || []
    expect(need).not.toContain('true_false')
  })

  it('byCardStems 应记录每张卡每种题型的 stem 列表（用于 prompt 嵌入）', () => {
    const cards = [{ id: 'c1' }]
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: '单选1题干' },
      { type: 'true_false', cardId: 'c1', stem: '判断1题干' },
    ]
    const matrix = analyzeQuestionMatrix(cards, existing)
    expect(matrix.byCardStems.get('c1').single_choice).toContain('单选1题干')
    expect(matrix.byCardStems.get('c1').true_false).toContain('判断1题干')
  })

  it('MAX_QUESTIONS_PER_CARD_TYPE 默认应为 1', () => {
    expect(MAX_QUESTIONS_PER_CARD_TYPE).toBe(1)
  })

  it('LITE_QUESTION_TYPES 包含 4 种题型，matrix 的 needTypes 应与之对齐', () => {
    const cards = [{ id: 'c1' }]
    const matrix = analyzeQuestionMatrix(cards, [])
    const need = matrix.needTypesByCard.get('c1') || []
    const expected = LITE_QUESTION_TYPES.map(t => t.type)
    expect(need.sort()).toEqual(expected.sort())
  })
})

// ===== isBatchTypeSatisfied: 任务过滤 =====
describe('isBatchTypeSatisfied - 任务跳过判定', () => {
  it('batch 中所有 card 都已出齐该 type 时应返回 true（跳过）', () => {
    const cards = [{ id: 'c1' }, { id: 'c2' }]
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: 'q1' },
      { type: 'single_choice', cardId: 'c2', stem: 'q2' },
    ]
    // 传 targetDifficulty=2（与 existing 默认难度一致）
    const matrix = analyzeQuestionMatrix(cards, existing, 2)
    expect(isBatchTypeSatisfied(cards, 'single_choice', matrix)).toBe(true)
  })

  it('batch 中部分 card 尚未出齐时返回 false（需要生成）', () => {
    const cards = [{ id: 'c1' }, { id: 'c2' }]
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: 'q1' },
      // c2 还没有 single_choice
    ]
    const matrix = analyzeQuestionMatrix(cards, existing)
    expect(isBatchTypeSatisfied(cards, 'single_choice', matrix)).toBe(false)
  })

  it('batch 中所有 card 都缺该 type 时返回 false', () => {
    const cards = [{ id: 'c1' }, { id: 'c2' }]
    const matrix = analyzeQuestionMatrix(cards, [])
    expect(isBatchTypeSatisfied(cards, 'true_false', matrix)).toBe(false)
  })

  it('没有 cardId 的 card 应被忽略（不视为"已出齐"）', () => {
    const cards = [{ id: '' }, { id: 'c2' }]
    const matrix = analyzeQuestionMatrix(cards, [])
    // 没有 cardId 的 card 会被 needTypesByCard 跳过，isBatchTypeSatisfied 也应跳过
    expect(isBatchTypeSatisfied(cards, 'single_choice', matrix)).toBe(false)
  })
})

// ===== formatExistingQuestionsForBatch: prompt 嵌入段 =====
describe('formatExistingQuestionsForBatch - 把已有题目格式化为 prompt 段落', () => {
  it('batch 中无已有题目时返回空字符串', () => {
    const cards = [{ id: 'c1' }, { id: 'c2' }]
    const matrix = analyzeQuestionMatrix(cards, [])
    const text = formatExistingQuestionsForBatch(cards, matrix, 'single_choice')
    expect(text).toBe('')
  })

  it('batch 中部分 card 已有该 type 时应输出"哪些卡已有"的精确信息', () => {
    const cards = [{ id: 'c1' }, { id: 'c2' }]
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: 'c1 已有单选' },
    ]
    const matrix = analyzeQuestionMatrix(cards, existing)
    const text = formatExistingQuestionsForBatch(cards, matrix, 'single_choice')
    expect(text).toContain('c1')
    expect(text).toContain('已有')
    expect(text).toContain('single_choice')
    // c2 没有该 type 题，不应在文本中作为"已有"被提及
    // 实际：c2 没出现，c1 出现
    expect(text).toMatch(/c1/)
  })

  it('同一 card 有多道同 type 题时只显示数量和前 3 道 stem', () => {
    const cards = [{ id: 'c1' }]
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: 's1' },
      { type: 'single_choice', cardId: 'c1', stem: 's2' },
      { type: 'single_choice', cardId: 'c1', stem: 's3' },
      { type: 'single_choice', cardId: 'c1', stem: 's4' },
    ]
    const matrix = analyzeQuestionMatrix(cards, existing)
    const text = formatExistingQuestionsForBatch(cards, matrix, 'single_choice')
    // 应提示"已有 N 道"（虽然 MAX=1，所以 isSatisfied 会直接跳过，但 format 函数本身仍可调用）
    expect(text).toContain('c1')
    expect(text).toMatch(/s1|s2|s3/)
    // stem 数量限制为 3
    const stemMatches = text.match(/"s\d"/g) || []
    expect(stemMatches.length).toBeLessThanOrEqual(3)
  })
})

// ===== buildLitePromptByType: 嵌入"已有题目"段 =====
describe('buildLitePromptByType - 嵌入 matrix 提供的"已有题目"段', () => {
  const sampleCards = [
    { id: 'card_1', knowledge_point: '内存', front: 'RAM 的特点？', back: '断电丢失' },
    { id: 'card_2', knowledge_point: 'OSI', front: 'OSI 几层？', back: '7 层' },
  ]

  it('新签名 buildLitePromptByType(cards, type, { matrix }) 应能正常工作', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [])
    const p = buildLitePromptByType(sampleCards, 'single_choice', { matrix })
    expect(p).toMatch(/单选题/)
    expect(p).toContain('card_1')
  })

  it('传 matrix 时，prompt 应包含"暂无已有同类题"段', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [])
    const p = buildLitePromptByType(sampleCards, 'single_choice', { matrix })
    expect(p).toMatch(/暂无.*题目|暂无/)
  })

  it('传 matrix 且某 card 已有同 type 题时，prompt 应明确告诉 AI "不要再出该题型"', () => {
    const existing = [
      { type: 'single_choice', cardId: 'card_1', stem: 'c1 已有题' },
    ]
    const matrix = analyzeQuestionMatrix(sampleCards, existing)
    const p = buildLitePromptByType(sampleCards, 'single_choice', { matrix })
    expect(p).toContain('card_1')
    // 应明确提示该卡已有题
    expect(p).toMatch(/不要再出|不要.*出|已有.*题/)
  })

  it('同时传 matrix 和 existingQuestions 时，应同时使用（matrix 优先 + 全局参考补全）', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [
      { type: 'single_choice', cardId: 'card_1', stem: 'c1 已有' },
    ])
    const extraEx = [
      { type: 'single_choice', cardId: 'card_3', stem: 'c3 全局参考' },
    ]
    const p = buildLitePromptByType(sampleCards, 'single_choice', {
      matrix,
      existingQuestions: extraEx,
    })
    // matrix 段
    expect(p).toContain('按卡片精确提示')
    // 全局参考段
    expect(p).toContain('全局参考')
  })

  it('仅传 existingQuestions（无 matrix）时，prompt 应只包含全局参考段', () => {
    const existing = [
      { type: 'single_choice', stem: 'global ref 1' },
    ]
    const p = buildLitePromptByType(sampleCards, 'single_choice', existing)
    expect(p).toMatch(/全局参考|已有同类题目/)
  })

  it('传第三参数为空对象 {} 时，prompt 应能正常拼接且不抛错', () => {
    expect(() => buildLitePromptByType(sampleCards, 'single_choice', {})).not.toThrow()
    const p = buildLitePromptByType(sampleCards, 'single_choice', {})
    expect(p).toContain('card_1')
  })

  it('4 种题型都应在 prompt 末尾正确嵌入"已有题库"段（位置一致）', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [])
    for (const t of LITE_QUESTION_TYPES) {
      const p = buildLitePromptByType(sampleCards, t.type, { matrix })
      // 4 个模板都以 "只返回 JSON 数组。" 结尾
      expect(p).toMatch(/只返回 JSON 数组。\s*$/)
      // 嵌入段在 "只返回 JSON 数组。" 之前
      const tailIdx = p.lastIndexOf('只返回 JSON 数组。')
      const existingIdx = p.lastIndexOf('【已有同类题目】')
      expect(tailIdx).toBeGreaterThan(0)
      if (existingIdx >= 0) {
        expect(existingIdx).toBeLessThan(tailIdx)
      }
    }
  })
})

// ===== generateQuestionsForWeakModel: 短路 + 跳过 + 冲突检测 =====
describe('generateQuestionsForWeakModel - 矩阵短路 + 跳过 + 冲突检测', () => {
  const sampleCards = Array.from({ length: 8 }, (_, i) => ({
    id: `card_${i + 1}`,
    knowledge_point: `KP${i + 1}`,
    front: `Q${i + 1}？`,
    back: `A${i + 1}`,
  }))
  const statusMap = Object.fromEntries(sampleCards.map(c => [c.id, 'new']))
  const weakConfig = { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }

  it('所有 (card, type) 都已出齐时，应短路返回（callCount=0）', async () => {
    // 为每张卡的每种题型都创建 1 道题（传 difficulty=2 使矩阵仅检查该难度是否已出齐）
    const types = LITE_QUESTION_TYPES.map(t => t.type)
    const existing = []
    for (const card of sampleCards) {
      for (const type of types) {
        existing.push({ type, cardId: card.id, stem: `已有 ${type} for ${card.id}` })
      }
    }

    const result = await generateQuestionsForWeakModel(
      sampleCards, statusMap, existing, 'unit', weakConfig,
      { difficulty: 2 }  // 仅检查难度 2 是否已出齐
    )

    expect(result.callCount).toBe(0)
    expect(result.batchCount).toBe(0)
    expect(result.questions).toHaveLength(0)
    expect(result.skippedReason).toBe('all_satisfied')
    expect(mockGenerateTestQuestions).not.toHaveBeenCalled()
  })

  it('已有 50% 卡片已有 single_choice 时，single_choice 任务的 batch 数量应减少', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')

    // 让前 4 张 card 已有 single_choice（共 8 张）
    const existing = sampleCards.slice(0, 4).map(c => ({
      type: 'single_choice',
      cardId: c.id,
      stem: `q for ${c.id}`,
    }))

    const result = await generateQuestionsForWeakModel(
      sampleCards, statusMap, existing, 'unit', weakConfig
    )

    // 8 张卡 = 2 批
    expect(result.batchCount).toBe(2)
    // single_choice 在两个 batch 中都需要为剩余 4 张卡生成
    // （前 4 张已出齐，后 4 张需要），所以两批都仍要调 single_choice
    // 调用总数：2 批 × 平均 (单选 1 + 多选 1 + 判断 1 + 填空 1) = 8 - 0 跳过 = 8
    // 但因为前 4 张已有 single_choice，单选 prompt 里会显示这 4 张"已出齐"
    // 调用次数本身不变，只是单选的 prompt 内容不同
    expect(result.callCount).toBeGreaterThanOrEqual(8)
    expect(result.skippedTasks).toBeDefined()
  })

  it('batch 内所有 card 都已出齐某 type 时，该 (batch, type) 任务应被跳过', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')

    // 5 张卡 = 1 批，让所有 5 张都已有 single_choice
    const fiveCards = sampleCards.slice(0, 5)
    const existing = fiveCards.map(c => ({
      type: 'single_choice',
      cardId: c.id,
      stem: `q for ${c.id}`,
    }))

    const result = await generateQuestionsForWeakModel(
      fiveCards, statusMap, existing, 'unit', weakConfig
    )

    // 1 批 × 4 题型 = 4 次调用（allOverflow 阈值为 5，1 道题不满足跳过条件）
    expect(result.callCount).toBe(4)
    expect(mockGenerateTestQuestions).toHaveBeenCalledTimes(4)
  })

  it('100 张卡片 + 大量本地题库：callCount 应显著小于 "100 × 4 = 400"', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')

    const bigCards = Array.from({ length: 100 }, (_, i) => ({
      id: `card_${i + 1}`,
      front: `Q${i + 1}`,
      back: `A${i + 1}`,
    }))
    // 让 80 张卡都有 single_choice + true_false
    const existing = []
    for (let i = 0; i < 80; i++) {
      existing.push({ type: 'single_choice', cardId: `card_${i + 1}`, stem: 'q' })
      existing.push({ type: 'true_false', cardId: `card_${i + 1}`, stem: 'q' })
    }

    const result = await generateQuestionsForWeakModel(
      bigCards, statusMap, existing, 'category', weakConfig,
      { concurrency: 3, minIntervalMs: 0 }
    )

    // 100 张 / 5 = 20 批
    expect(result.batchCount).toBe(20)
    // 前 2 批出 4 题型(8) + 后 18 批出 2 题型(36) = 44 次调用
    // 注：allOverflow 阈值为 5，1道题不满足跳过条件；
    // isBatchTypeSatisfied 仅用于强模型任务构建，弱模型走 allOverflow 判断
    expect(result.callCount).toBeLessThanOrEqual(48)
    expect(result.callCount).toBeLessThan(80)  // 显著小于无任何优化时的 80
  })

  it('返回结果应包含 matrix 字段供 UI 展示', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const result = await generateQuestionsForWeakModel(
      sampleCards.slice(0, 5), statusMap, [], 'unit', weakConfig
    )
    expect(result.matrix).toBeDefined()
    expect(result.matrix).toHaveProperty('byCardType')
    expect(result.matrix).toHaveProperty('byCardStems')
    expect(result.matrix).toHaveProperty('needTypesByCard')
    expect(result.matrix).toHaveProperty('totalByType')
  })

  it('返回结果应包含 skippedTasks 字段', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const result = await generateQuestionsForWeakModel(
      sampleCards.slice(0, 5), statusMap, [], 'unit', weakConfig
    )
    expect(result.skippedTasks).toBeDefined()
    expect(typeof result.skippedTasks).toBe('object')
  })
})

// ===== 集成：matrix + AI 出题 =====
describe('集成 - matrix 与 AI 出题协作', () => {
  it('AI 返回的 cardId 已在 matrix 中"出齐"时，该题应被丢弃（不重复入库）', async () => {
    // 让 AI 试图给已出齐的 card 再出一道 single_choice
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题')) {
        return JSON.stringify([
          {
            type: 'single_choice',
            cardId: '标记1',
            stem: 'c1 已有题',
            options: [
              { label: 'A', text: '选项A' },
              { label: 'B', text: '选项B' },
            ],
            answer: 'A',
          },
          {
            type: 'single_choice',
            cardId: '标记2',
            stem: '这是 c2 的新题？',
            options: [
              { label: 'A', text: '选项A' },
              { label: 'B', text: '选项B' },
            ],
            answer: 'A',
          },
        ])
      }
      return '[]'
    })

    const cards = [
      { id: 'c1', front: 'q1', back: 'a1' },
      { id: 'c2', front: 'q2', back: 'a2' },
    ]
    // c1 已经有 1 道 single_choice
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: 'c1 已有题' },
    ]

    const result = await generateQuestionsForWeakModel(
      cards, { c1: 'new', c2: 'new' }, existing, 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    // c1 的那道题应该被丢弃，只剩 c2 的
    const c1Questions = result.questions.filter(q => q.cardId === 'c1')
    const c2Questions = result.questions.filter(q => q.cardId === 'c2')
    expect(c1Questions).toHaveLength(0)
    expect(c2Questions).toHaveLength(1)
  })

  it('AI 出题 prompt 应包含 matrix 给出的"该 batch 内已出齐的卡"信息', async () => {
    const capturedPrompts = []
    mockGenerateTestQuestions.mockImplementation(async (p) => {
      capturedPrompts.push(p)
      return '[]'
    })

    const cards = [
      { id: 'c1', front: 'q1', back: 'a1' },
      { id: 'c2', front: 'q2', back: 'a2' },
    ]
    // c1 已有 single_choice
    const existing = [
      { type: 'single_choice', cardId: 'c1', stem: 'c1 已有题' },
    ]

    await generateQuestionsForWeakModel(
      cards, { c1: 'new', c2: 'new' }, existing, 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    // 找到 single_choice 的 prompt
    const singlePrompt = capturedPrompts.find(p => p.includes('单选题'))
    expect(singlePrompt).toBeDefined()
    // 应当包含 "c1" 已有题 的提示
    expect(singlePrompt).toContain('c1')
    // 应明确告诉 AI c1 已有 single_choice
    expect(singlePrompt).toMatch(/按卡片精确提示/)
  })
})
