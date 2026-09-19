import { describe, it, expect, vi, beforeEach } from 'vitest'

// ===== Mock aiService =====
const { mockGenerateTestQuestions } = vi.hoisted(() => ({
  mockGenerateTestQuestions: vi.fn(),
}))
vi.mock('../services/aiService', () => ({
  generateTestQuestions: mockGenerateTestQuestions,
}))

import { __test__ } from '../services/testQuestionService'

const {
  matchQuestionsToCards,
  buildPrompt,
  generateQuestionsForStrongModel,
  generateQuestionsForWeakModel,
} = __test__

// ===== 辅助：构造 mock 卡片（含 chapterId） =====
function makeMockCards(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: overrides.idPrefix ? `${overrides.idPrefix}-${i}` : `card-${i}`,
    knowledge_point: `知识点${i + 1}`,
    front: `问题${i + 1}是什么？`,
    back: `答案${i + 1}`,
    unitId: `unit-${Math.floor(i / 2)}`,
    categoryId: `cat-0`,
    chapterId: `chapter-${Math.floor(i / 3)}`,
    ...overrides,
  }))
}

// ===== 辅助：构造 mock AI 返回的题目（符合校验规则） =====
function makeMockValidQuestion(stem, overrides = {}) {
  return {
    type: 'single_choice',
    stem: stem || '以下哪个选项是正确的？',
    options: [
      { label: 'A', text: '这是选项A的描述' },
      { label: 'B', text: '这是选项B的描述' },
      { label: 'C', text: '这是选项C的描述' },
      { label: 'D', text: '这是选项D的描述' },
    ],
    answer: 'A',
    analysis: '这是题目的解析',
    difficulty: 3,
    knowledgePoint: '知识点1',
    cardId: '标记1',
    ...overrides,
  }
}

beforeEach(() => {
  mockGenerateTestQuestions.mockReset()
})

// ══════════════════════════════════════════════════════════════
// 测试 1：matchQuestionsToCards 返回 chapterId
// ══════════════════════════════════════════════════════════════
describe('matchQuestionsToCards — chapterId 字段', () => {

  it('cardId 精确匹配时应返回 chapterId', () => {
    const cards = makeMockCards(3)
    const questions = [{
      type: 'single_choice',
      stem: '题目1',
      options: [{ label: 'A', text: '选项A' }],
      answer: 'A',
      cardId: 'card-0',
      unitId: null,
      categoryId: null,
      chapterId: null,
    }]

    const result = matchQuestionsToCards(questions, cards)
    expect(result[0].chapterId).toBe('chapter-0')
    expect(result[0].unitId).toBe('unit-0')
    expect(result[0].categoryId).toBe('cat-0')
    expect(result[0].cardId).toBe('card-0')
  })

  it('cardId 精确匹配：已有 chapterId 不被覆盖', () => {
    const cards = makeMockCards(3)
    const questions = [{
      type: 'single_choice',
      stem: '题目1',
      options: [{ label: 'A', text: '选项A' }],
      answer: 'A',
      cardId: 'card-0',
      unitId: null,
      categoryId: null,
      chapterId: 'custom-chapter',
    }]

    const result = matchQuestionsToCards(questions, cards)
    expect(result[0].chapterId).toBe('custom-chapter')
  })

  it('知识点精确匹配（兜底）应返回 chapterId', () => {
    const cards = makeMockCards(3)
    const questions = [{
      type: 'single_choice',
      stem: '题目1',
      options: [{ label: 'A', text: '选A' }],
      answer: 'A',
      knowledgePoint: '知识点1',
      cardId: null,
      unitId: null,
      categoryId: null,
      chapterId: null,
    }]

    const result = matchQuestionsToCards(questions, cards)
    expect(result[0].chapterId).toBe('chapter-0')
    expect(result[0].unitId).toBe('unit-0')
    expect(result[0].categoryId).toBe('cat-0')
    expect(result[0].cardId).toBe('card-0')
  })

  it('知识点模糊匹配（兜底第二层）应返回 chapterId', () => {
    const cards = makeMockCards(3)
    const questions = [{
      type: 'single_choice',
      stem: '题目1',
      options: [{ label: 'A', text: '选A' }],
      answer: 'A',
      knowledgePoint: '知识',
      cardId: null,
      unitId: null,
      categoryId: null,
      chapterId: null,
    }]

    const result = matchQuestionsToCards(questions, cards)
    expect(result[0].chapterId).toBe('chapter-0')
    expect(result[0].unitId).toBe('unit-0')
    expect(result[0].categoryId).toBe('cat-0')
  })

  it('无匹配时应返回原题（null chapterId）', () => {
    const cards = makeMockCards(3)
    const questions = [{
      type: 'single_choice',
      stem: '题目X',
      options: [{ label: 'A', text: '选A' }],
      answer: 'A',
      knowledgePoint: '完全不匹配',
      cardId: 'unknown-card',
      unitId: null,
      categoryId: null,
      chapterId: null,
    }]

    const result = matchQuestionsToCards(questions, cards)
    expect(result[0].chapterId).toBeNull()
    expect(result[0].unitId).toBeNull()
    expect(result[0].categoryId).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════
// 测试 2：buildPrompt 兼容路径的 cardMarkerMap 格式
// ══════════════════════════════════════════════════════════════
describe('buildPrompt — 兼容路径 cardMarkerMap 格式', () => {

  it('包含 cardMarkerMap 时卡片格式应带 [mk=标记N]', () => {
    const cards = makeMockCards(3)
    const statusMap = {}
    const existingQuestions = []

    const cardMarkerMap = new Map()
    cardMarkerMap.set('card-0', '标记1')
    cardMarkerMap.set('card-1', '标记2')
    cardMarkerMap.set('card-2', '标记3')

    const prompt = buildPrompt(cards, statusMap, existingQuestions, 'unit', false, cardMarkerMap)

    expect(prompt).toContain('[mk=标记1]')
    expect(prompt).toContain('[mk=标记2]')
    expect(prompt).toContain('[mk=标记3]')
    expect(prompt).toContain('知识点1')
    expect(prompt).toContain('cardId')
  })

  it('不传 cardMarkerMap 时不应包含 cardId 指示', () => {
    const cards = makeMockCards(3)
    const statusMap = {}
    const existingQuestions = []

    const prompt = buildPrompt(cards, statusMap, existingQuestions, 'unit', false, null)

    expect(prompt).toContain('[mk=标记1]')
    expect(prompt).not.toContain('cardId 字段')
  })
})

// ══════════════════════════════════════════════════════════════
// 测试 3：强模型生成 — markerDataMap 含 chapterId 且映射有效
// ══════════════════════════════════════════════════════════════
describe('generateQuestionsForStrongModel — markerDataMap 含 chapterId', () => {

  it('AI 返回后题目应有 chapterId（通过 markerDataMap 映射）', async () => {
    const cards = [
      { id: 'card-0', knowledge_point: 'KP1', front: 'KP1是什么？', back: 'A1', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
      { id: 'card-1', knowledge_point: 'KP2', front: 'KP2是什么？', back: 'A2', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
    ]
    const statusMap = { 'card-0': 'new', 'card-1': 'new' }
    const existingQuestions = []

    mockGenerateTestQuestions.mockResolvedValue(JSON.stringify([
      {
        type: 'single_choice',
        stem: '强模型生成题1的正确选项是什么？',
        options: [{ label: 'A', text: '选项A描述' }, { label: 'B', text: '选项B描述' }, { label: 'C', text: '选项C描述' }, { label: 'D', text: '选项D描述' }],
        answer: 'A',
        analysis: '题目解析',
        difficulty: 3,
        knowledgePoint: 'KP1',
        cardId: '标记1',
      },
      {
        type: 'single_choice',
        stem: '关于KP2的知识点，下列哪个描述是准确的？',
        options: [{ label: 'A', text: '选项A描述' }, { label: 'B', text: '选项B描述' }, { label: 'C', text: '选项C描述' }, { label: 'D', text: '选项D描述' }],
        answer: 'B',
        analysis: '题目解析',
        difficulty: 3,
        knowledgePoint: 'KP2',
        cardId: '标记2',
      },
    ]))

    const config = { aiServiceMode: 'deepseek' }
    const result = await generateQuestionsForStrongModel(cards, statusMap, existingQuestions, 'unit', config)

    expect(result.questions).toHaveLength(2)
    for (const q of result.questions) {
      expect(q.chapterId).toBe('chapter-0')
      expect(q.unitId).toBe('unit-0')
      expect(q.categoryId).toBe('cat-0')
      expect(q.cardId).toMatch(/^card-/)
    }
  })

  it('卡片无 chapterId 时映射后 chapterId 应为 null', async () => {
    const cards = [
      { id: 'card-0', knowledge_point: 'KP1', front: 'KP1是什么？', back: 'A1', unitId: 'unit-0', categoryId: 'cat-0', chapterId: null },
    ]
    const statusMap = { 'card-0': 'new' }
    const existingQuestions = []

    mockGenerateTestQuestions.mockResolvedValue(JSON.stringify([
      {
        type: 'true_false',
        stem: '判断以下说法是否正确：强模型生成的说法',
        options: [{ label: 'A', text: '正确' }, { label: 'B', text: '错误' }],
        answer: '正确',
        analysis: '解析',
        difficulty: 3,
        knowledgePoint: 'KP1',
        cardId: '标记1',
      },
    ]))

    const config = { aiServiceMode: 'deepseek' }
    const result = await generateQuestionsForStrongModel(cards, statusMap, existingQuestions, 'unit', config)

    // rebalanceTrueFalseQuestions 可能将判断题反向生成 2 道
    expect(result.questions.length).toBeGreaterThanOrEqual(1)
    for (const q of result.questions) {
      expect(q.chapterId).toBeNull()
      expect(q.unitId).toBe('unit-0')
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 测试 4：弱模型生成 — markerDataMap 含 chapterId 且映射有效
// ══════════════════════════════════════════════════════════════
describe('generateQuestionsForWeakModel — markerDataMap 含 chapterId', () => {

  const config = { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }

  it('弱模型生成后题目应有 chapterId（通过 markerDataMap 映射）', async () => {
    const cards = [
      { id: 'card-0', knowledge_point: 'KP1', front: 'KP1是什么？', back: 'A1', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
    ]
    const statusMap = { 'card-0': 'new' }
    const existingQuestions = []

    mockGenerateTestQuestions.mockResolvedValue(JSON.stringify([
      {
        type: 'single_choice',
        stem: '弱模型生成题的正确选项是什么？',
        options: [{ label: 'A', text: '选项A描述内容' }, { label: 'B', text: '选项B描述内容' }, { label: 'C', text: '选项C描述内容' }, { label: 'D', text: '选项D描述内容' }],
        answer: 'A',
        analysis: '题目解析',
        difficulty: 3,
        knowledgePoint: 'KP1',
        cardId: '标记1',
      },
    ]))

    const result = await generateQuestionsForWeakModel(cards, statusMap, existingQuestions, 'unit', config)

    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].chapterId).toBe('chapter-0')
    expect(result.questions[0].unitId).toBe('unit-0')
    expect(result.questions[0].categoryId).toBe('cat-0')
    expect(result.questions[0].cardId).toBe('card-0')
  })
})

// ══════════════════════════════════════════════════════════════
// 测试 5：完整数据流模拟 — 从 AI 返回到入库字段
// ══════════════════════════════════════════════════════════════
describe('完整数据流：AI 返回 → 匹配 → 入库字段', () => {

  it('章节检测：跨章节卡片，每道题目 chapterId 应正确', () => {
    const cards = [
      { id: 'card-0', knowledge_point: 'KP1', front: 'Q1', back: 'A1', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
      { id: 'card-1', knowledge_point: 'KP2', front: 'Q2', back: 'A2', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
      { id: 'card-2', knowledge_point: 'KP3', front: 'Q3', back: 'A3', unitId: 'unit-1', categoryId: 'cat-0', chapterId: 'chapter-1' },
      { id: 'card-3', knowledge_point: 'KP4', front: 'Q4', back: 'A4', unitId: 'unit-1', categoryId: 'cat-0', chapterId: 'chapter-1' },
    ]

    const questions = [
      { type: 'single_choice', stem: 'Q1', options: [], answer: 'A', knowledgePoint: 'KP1', cardId: 'card-0', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
      { type: 'single_choice', stem: 'Q2', options: [], answer: 'B', knowledgePoint: 'KP2', cardId: 'card-1', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
      { type: 'single_choice', stem: 'Q3', options: [], answer: 'C', knowledgePoint: 'KP3', cardId: 'card-2', unitId: 'unit-1', categoryId: 'cat-0', chapterId: 'chapter-1' },
      { type: 'single_choice', stem: 'Q4', options: [], answer: 'D', knowledgePoint: 'KP4', cardId: 'card-3', unitId: 'unit-1', categoryId: 'cat-0', chapterId: 'chapter-1' },
    ]

    const result = matchQuestionsToCards(questions, cards)

    expect(result[0].chapterId).toBe('chapter-0')
    expect(result[0].unitId).toBe('unit-0')
    expect(result[1].chapterId).toBe('chapter-0')
    expect(result[1].unitId).toBe('unit-0')
    expect(result[2].chapterId).toBe('chapter-1')
    expect(result[2].unitId).toBe('unit-1')
    expect(result[3].chapterId).toBe('chapter-1')
    expect(result[3].unitId).toBe('unit-1')

    // 模拟 questionItems 构造
    const questionItems = result.map(q => ({
      id: `test-q-${q.cardId}`,
      testType: 'chapter',
      targetId: 'chapter-0',
      cardId: q.cardId || null,
      unitId: q.unitId || null,
      categoryId: q.categoryId || null,
      chapterId: q.chapterId || null,
      type: q.type,
      stem: q.stem,
      answer: q.answer,
    }))

    for (const item of questionItems) {
      expect(item.chapterId).toBeTruthy()
      expect(item.unitId).toBeTruthy()
      expect(item.categoryId).toBeTruthy()
      expect(item.testType).toBe('chapter')
    }
  })

  it('单元检测：chapterId 应从卡片获取，即使 testType 不是 chapter', () => {
    const cards = [
      { id: 'card-0', knowledge_point: 'KP1', front: 'Q1', back: 'A1', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
    ]

    const questions = [
      { type: 'single_choice', stem: 'Q1', options: [], answer: 'A', knowledgePoint: 'KP1', cardId: 'card-0', unitId: 'unit-0', categoryId: 'cat-0', chapterId: 'chapter-0' },
    ]

    const result = matchQuestionsToCards(questions, cards)
    expect(result[0].chapterId).toBe('chapter-0')

    const questionItem = {
      testType: 'unit',
      targetId: 'unit-0',
      cardId: result[0].cardId || null,
      unitId: result[0].unitId || null,
      categoryId: result[0].categoryId || null,
      chapterId: result[0].chapterId || null,
    }

    expect(questionItem.chapterId).toBe('chapter-0')
    expect(questionItem.unitId).toBe('unit-0')
    expect(questionItem.categoryId).toBe('cat-0')
  })
})