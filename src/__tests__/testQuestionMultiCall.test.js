import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LITE_QUESTION_TYPES, LITE_BATCH_SIZE, LITE_COMMON_RULES } from '../utils/constants'

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
  isWeakModel,
  buildLitePromptByType,
  formatCardsForLiteBatch,
  chunkCards,
  generateQuestionsForWeakModel,
} = __test__

beforeEach(() => {
  mockGenerateTestQuestions.mockReset()
})

// ===== 弱模型识别 =====
describe('isWeakModel - 弱模型识别', () => {
  it('讯飞星火 lite 模型应识别为弱模型', () => {
    expect(isWeakModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'lite' })).toBe(true)
    expect(isWeakModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'spark-lite' })).toBe(true)
    // 缺省 sparkModel 字段时默认为 lite
    expect(isWeakModel({ aiServiceMode: 'iflytek-spark' })).toBe(true)
  })

  it('讯飞星火 Pro / generalv3 / pro-128k 不应识别为弱模型', () => {
    expect(isWeakModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'generalv3' })).toBe(false)
    expect(isWeakModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'pro-128k' })).toBe(false)
  })

  it('非讯飞服务都不应识别为弱模型（走单次大批量策略）', () => {
    expect(isWeakModel({ aiServiceMode: 'deepseek' })).toBe(false)
    expect(isWeakModel({ aiServiceMode: 'volcano' })).toBe(false)
    expect(isWeakModel({ aiServiceMode: 'dashscope' })).toBe(false)
  })

  it('空 config 不应抛错', () => {
    expect(isWeakModel(null)).toBe(false)
    expect(isWeakModel(undefined)).toBe(false)
    expect(isWeakModel({})).toBe(false)
  })
})

// ===== 卡片批次拆分 =====
describe('chunkCards - 卡片按批拆分', () => {
  it('5 张卡片拆成 1 批', () => {
    const cards = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` }))
    const batches = chunkCards(cards, 5)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(5)
  })

  it('7 张卡片拆成 2 批（5+2）', () => {
    const cards = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}` }))
    const batches = chunkCards(cards, 5)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(5)
    expect(batches[1]).toHaveLength(2)
  })

  it('20 张卡片拆成 4 批', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }))
    const batches = chunkCards(cards, 5)
    expect(batches).toHaveLength(4)
    batches.forEach(b => expect(b).toHaveLength(5))
  })

  it('空数组拆成 0 批', () => {
    expect(chunkCards([], 5)).toHaveLength(0)
  })

  it('LITE_BATCH_SIZE 默认 5', () => {
    expect(LITE_BATCH_SIZE).toBe(5)
  })
})

// ===== 卡片格式化（用于 prompt 输入段） =====
describe('formatCardsForLiteBatch - 卡片信息精简格式化', () => {
  it('包含 id/知识点/问题/答案', () => {
    const cards = [
      { id: 'card_1', knowledge_point: '内存与外存', front: '内存RAM的特点？', back: '断电后数据被清空' },
    ]
    const text = formatCardsForLiteBatch(cards)
    expect(text).toContain('卡片1')
    expect(text).toContain('标记1')
    expect(text).toContain('内存与外存')
    expect(text).toContain('内存RAM的特点？')
    expect(text).toContain('断电后数据被清空')
  })

  it('过长 text 应被截断（避免 prompt 膨胀）', () => {
    const longText = '啊'.repeat(500)
    const cards = [{ id: 'c1', front: longText, back: longText }]
    const text = formatCardsForLiteBatch(cards, 80)
    // 截断到 80 字符
    expect(text).not.toContain(longText)
    expect(text.length).toBeLessThan(longText.length * 2)
  })

  it('缺字段的卡片应能容错', () => {
    const cards = [{ front: '问题' }]  // 缺 id/back/knowledgePoint
    const text = formatCardsForLiteBatch(cards)
    expect(text).toContain('卡片1')
    expect(text).toContain('问题')
    expect(text).toContain('未分类')  // 知识点的兜底
  })
})

// ===== 单题型 prompt 构建 =====
describe('buildLitePromptByType - 单题型精简 prompt', () => {
  const sampleCards = [
    { id: 'card_1', knowledge_point: '内存与外存', front: '内存RAM的特点？', back: '断电后数据被清空' },
    { id: 'card_2', knowledge_point: 'OSI模型', front: 'OSI模型有几层？', back: '7 层' },
  ]

  it('单选题 prompt 应包含核心硬约束', () => {
    const p = buildLitePromptByType(sampleCards, 'single_choice', [])
    expect(p).toMatch(/单选题/)
    expect(p).toMatch(/A\/B\/C\/D/)
    expect(p).toMatch(/完整的知识点陈述句/)
    expect(p).toMatch(/label.*A\/B\/C\/D|label 用/)
    // 不得出现其它题型的"题型"字样
    expect(p).not.toMatch(/【多选题】/)
    expect(p).not.toMatch(/【判断题】/)
    expect(p).not.toMatch(/【填空题】/)
  })

  it('多选题 prompt 必须含"多选题"标记要求', () => {
    const p = buildLitePromptByType(sampleCards, 'multi_choice', [])
    expect(p).toMatch(/多选题/)
    expect(p).toMatch(/多选/)
  })

  it('判断题 prompt 必须强调 label 固定为"正确/错误"', () => {
    const p = buildLitePromptByType(sampleCards, 'true_false', [])
    expect(p).toMatch(/判断题/)
    expect(p).toMatch(/正确|错误/)
    expect(p).toMatch(/判断以下说法是否正确/)
  })

  it('填空题 prompt 必须含 ____ 标记', () => {
    const p = buildLitePromptByType(sampleCards, 'fill_blank', [])
    expect(p).toMatch(/填空题/)
    expect(p).toMatch(/_+/)
  })

  it('不支持的题型应抛错', () => {
    expect(() => buildLitePromptByType(sampleCards, 'bogus_type', [])).toThrow(/不支持的题型/)
  })

  it('prompt 应替换 CARD_COUNT 占位符', () => {
    const p = buildLitePromptByType(sampleCards, 'single_choice', [])
    expect(p).toContain('2 张学习卡片')
    expect(p).toContain('生成 2 道')
    expect(p).not.toContain('${CARD_COUNT}')
  })

  it('prompt 应替换 CARDS 占位符（带卡片信息）', () => {
    const p = buildLitePromptByType(sampleCards, 'single_choice', [])
    expect(p).toContain('标记1')
    expect(p).toContain('标记2')
    expect(p).toContain('内存与外存')
    expect(p).toContain('OSI模型')
    expect(p).not.toContain('${CARDS}')
  })

  it('已有同类题目应在 prompt 中作为"避免重复"参考', () => {
    const existing = [{
      type: 'single_choice',
      stem: '下列关于内存的特点，正确的是？',
      options: [
        { label: 'A', text: '断电后数据被清空' },
        { label: 'B', text: '容量无限' },
        { label: 'C', text: '速度慢' },
        { label: 'D', text: '不可写' },
      ],
    }]
    const p = buildLitePromptByType(sampleCards, 'single_choice', { existingQuestions: existing })
    expect(p).toMatch(/已有同类题目|已有题/)
  })

  it('LITE_COMMON_RULES 通用硬约束应被嵌入 prompt', () => {
    const p = buildLitePromptByType(sampleCards, 'single_choice', [])
    expect(p).toContain('硬约束')
    // 通用规则的关键内容
    expect(p).toMatch(/label 必须是 A\/B\/C\/D/)
    expect(p).toMatch(/text 必须是/)
  })

  it('LITE_QUESTION_TYPES 包含 4 种题型', () => {
    const types = LITE_QUESTION_TYPES.map(t => t.type)
    expect(types).toContain('single_choice')
    expect(types).toContain('multi_choice')
    expect(types).toContain('true_false')
    expect(types).toContain('fill_blank')
  })
})

// ===== 多次小批量调用架构 =====
describe('generateQuestionsForWeakModel - 多次小批量调用', () => {
  const sampleCards = Array.from({ length: 8 }, (_, i) => ({
    id: `card_${i + 1}`,
    knowledge_point: `知识点${i + 1}`,
    front: `问题${i + 1}？`,
    back: `答案${i + 1}`,
  }))
  const statusMap = Object.fromEntries(sampleCards.map(c => [c.id, 'new']))

  it('8 张卡片应拆成 2 批，每批 4 种题型，串行共 2×4=8 次调用', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')  // 返回空数组（避免下游解析错误）

    const config = { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    const result = await generateQuestionsForWeakModel(sampleCards, statusMap, [], 'unit', config)

    expect(result.batchCount).toBe(2)
    // 2 批都属前 maxFullBatches=2 批，4 种题型都出
    expect(result.callCount).toBe(8)
    expect(mockGenerateTestQuestions).toHaveBeenCalledTimes(8)
  })

  it('20 张卡片拆成 4 批：前 2 批 4 种题型，后 2 批降级为 2 种题型，共 2×4+2×2=12 次', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')

    const manyCards = Array.from({ length: 20 }, (_, i) => ({
      id: `card_${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))
    const result = await generateQuestionsForWeakModel(
      manyCards, statusMap, [], 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    expect(result.batchCount).toBe(4)
    // 前 2 批 × 4 题型 + 后 2 批 × 2 题型 = 8 + 4 = 12
    expect(result.callCount).toBe(12)
  })

  it('单批失败不应中断其它批（容错）', async () => {
    // withRetry 默认 3 次重试。让"前 3 次"（即第 1 个任务的所有重试）都失败，
    // 后续任务不抛错。这能确保：① 第 1 个任务最终记为 failed；② 后续任务成功。
    let callIdx = 0
    mockGenerateTestQuestions.mockImplementation(async () => {
      callIdx++
      if (callIdx <= 3) {
        throw new Error('mock network error')
      }
      return '[]'
    })

    const result = await generateQuestionsForWeakModel(
      sampleCards.slice(0, 5), statusMap, [], 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    // 5 张 = 1 批 × 4 题型 = 4 次任务
    // 任务 1：3 次重试都失败 → failedCount=1
    // 任务 2-4：每次 1 次成功 → successCount=3
    expect(result.failedCount).toBe(1)
    expect(result.successCount).toBe(3)
    // 验证：所有任务都执行过（即使失败也算"尝试过"）
    expect(callIdx).toBeGreaterThanOrEqual(4)
    // 验证：第 1 个任务被标记为失败
    expect(result.failedCount).toBeGreaterThanOrEqual(1)
  })

  it('返回结果应包含元信息（callCount / batchCount / successCount）', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')

    const result = await generateQuestionsForWeakModel(
      sampleCards.slice(0, 5), statusMap, [], 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    expect(result).toHaveProperty('questions')
    expect(result).toHaveProperty('callCount')
    expect(result).toHaveProperty('batchCount')
    expect(result).toHaveProperty('successCount')
    expect(result).toHaveProperty('failedCount')
  })

  it('onBatchComplete 回调应被每个调用触发', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')

    const callback = vi.fn()
    await generateQuestionsForWeakModel(
      sampleCards.slice(0, 5), statusMap, [], 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' },
      { onBatchComplete: callback }
    )

    // 5 张卡 = 1 批 × 4 题型 = 4 次回调
    expect(callback).toHaveBeenCalledTimes(4)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ batchIdx: 0, type: expect.any(String) }))
  })

  it('同批不同题型的 prompt 应互不相同', async () => {
    const prompts = []
    mockGenerateTestQuestions.mockImplementation(async (p) => {
      prompts.push(p)
      return '[]'
    })

    await generateQuestionsForWeakModel(
      sampleCards.slice(0, 5), statusMap, [], 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    expect(prompts).toHaveLength(4)
    // 4 个 prompt 应互不相同（每种题型不同）
    expect(new Set(prompts).size).toBe(4)
    // 每个 prompt 应聚焦一种题型
    expect(prompts[0]).toMatch(/单选题/)
    expect(prompts[1]).toMatch(/多选题/)
    expect(prompts[2]).toMatch(/判断题/)
    expect(prompts[3]).toMatch(/填空题/)
  })
})

// ===== 集成：完整多次调用产出可用题目 =====
describe('集成 - 多次小批量调用产出有效题目', () => {
  it('AI 返回的合法题目应被正确收集', async () => {
    // 模拟 AI 对每种题型的标准返回
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题')) {
        return JSON.stringify([{
          type: 'single_choice',
          stem: '下列哪项是内存的特点？',
          options: [
            { label: 'A', text: '断电后数据被清空' },
            { label: 'B', text: '断电后数据永久保存' },
            { label: 'C', text: '容量无限' },
            { label: 'D', text: '不可写' },
          ],
          answer: 'A',
        }])
      }
      if (prompt.includes('判断题')) {
        return JSON.stringify([{
          type: 'true_false',
          stem: '判断以下说法是否正确：内存断电后数据会被清空。',
          options: [
            { label: '正确', text: '正确' },
            { label: '错误', text: '错误' },
          ],
          answer: '正确',
        }])
      }
      return '[]'
    })

    const cards = [
      { id: 'c1', front: '内存RAM的特点？', back: '断电后数据被清空' },
    ]
    const result = await generateQuestionsForWeakModel(
      cards, { c1: 'new' }, [], 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    // 1 批 × 4 题型 = 4 次调用，单选+判断各返回 1 道题
    expect(result.callCount).toBe(4)
    // 至少要能收集到 single_choice + true_false 两种题型
    const types = result.questions.map(q => q.type)
    expect(types).toContain('single_choice')
    expect(types).toContain('true_false')
  })

  it('AI 返回的畸形题目应被校验拦截', async () => {
    // 即使弱模型仍然返回畸形题目（label 用判断词等），validate 仍应拦截
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题')) {
        // 模拟弱模型仍犯的错：label 用"正确"
        return JSON.stringify([{
          type: 'single_choice',
          stem: '内存(RAM)最主要的特点是？',
          options: [
            { label: '正确', text: '断电后数据会被清空' },  // 错误：label 不应是"正确"
            { label: '错误', text: '断电后数据不会丢失' },
            { label: '待掌握', text: '内存(RAM)的特点' },
            { label: '待掌握', text: '外存的特点' },
          ],
          answer: '正确',
        }])
      }
      return '[]'
    })

    const cards = [{ id: 'c1', front: '内存的特点？', back: '断电后数据被清空' }]
    const result = await generateQuestionsForWeakModel(
      cards, { c1: 'new' }, [], 'unit',
      { aiServiceMode: 'iflytek-spark', sparkModel: 'lite' }
    )

    // 即便单选返回 1 道畸形题，被校验拦截后不应进入最终结果
    const singleChoiceQuestions = result.questions.filter(q => q.type === 'single_choice')
    // 校验拦截后，畸形单选题不进入结果
    expect(singleChoiceQuestions.length).toBe(0)
  })
})
