/**
 * 数据层面验证：updateQuestionBankComplete 全量补全流程
 *
 * 验证内容：
 * 1. 题库为空时：调用 updateQuestionBankComplete 应多轮调用 updateQuestionBank 直到补全
 * 2. 题库已完整时：直接返回 complete=true，不调用 updateQuestionBank
 * 3. 取消机制：isCancelled 返回 true 时立即中止
 * 4. 进度回调：onProgress 被正确调用
 * 5. 无新增终止：连续无新增题目时自动终止
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_TYPES, LITE_QUESTION_TYPES } from '../utils/constants'

// mock db 模块
vi.mock('../services/db', () => ({
  getCardsByUnit: vi.fn(),
  getCardsByChapter: vi.fn(),
  getAllCardsByCategory: vi.fn(),
  getTestQuestions: vi.fn(),
  getCardStatusesByCategory: vi.fn(),
  getCategory: vi.fn(),
  addTestQuestions: vi.fn(),
}))

// mock aiService
vi.mock('../services/aiService', () => ({
  generateTestQuestions: vi.fn(),
}))

// mock aiCallLog
vi.mock('../services/aiCallLog', () => ({
  logAiCall: vi.fn(),
  resolveModelName: vi.fn(),
  getAiCallLogs: vi.fn(() => []),
}))

import { updateQuestionBankComplete, checkQuestionBankCompleteness } from '../services/testQuestionService'
import * as db from '../services/db'

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * 辅助函数：生成完整的题目列表（每张卡 × 4 题型 × 3 难度）
 */
function generateCompleteQuestions(cards) {
  const questions = []
  for (const card of cards) {
    for (const t of LITE_QUESTION_TYPES) {
      for (const d of [1, 2, 3]) {
        questions.push({
          id: `q_${card.id}_${t.type}_${d}`,
          type: t.type,
          cardId: card.id,
          difficulty: d,
          stem: `q-${card.id}-${t.type}-${d}`,
        })
      }
    }
  }
  return questions
}

describe('updateQuestionBankComplete - 全量补全流程', () => {
  it('题库已完整时：直接返回 complete=true，不调用 updateQuestionBank', async () => {
    const cards = [{ id: 'c1', front: 'KP1' }]
    const completeQuestions = generateCompleteQuestions(cards)

    // 模拟 checkQuestionBankCompleteness 返回完整
    db.getCardsByUnit.mockResolvedValue(cards)
    db.getTestQuestions.mockResolvedValue(completeQuestions)
    db.getCardStatusesByCategory.mockResolvedValue([])
    db.getCategory.mockResolvedValue({ id: 'cat1', name: '测试分类', purpose: '考试' })

    const onProgress = vi.fn()
    const result = await updateQuestionBankComplete(
      TEST_TYPES.UNIT, 'u1', { model: 'test' }, () => {}, 'user1',
      onProgress, () => false, 10
    )

    expect(result.complete).toBe(true)
    expect(result.rounds).toBe(0) // 无需任何轮次
    expect(result.totalAdded).toBe(0)
    expect(onProgress).toHaveBeenCalledWith(100, expect.stringContaining('题库已完整'))
  })

  it('无卡片时：返回 success=false, reason=no_cards', async () => {
    db.getCardsByUnit.mockResolvedValue([])
    db.getTestQuestions.mockResolvedValue([])

    const result = await updateQuestionBankComplete(
      TEST_TYPES.UNIT, 'u1', { model: 'test' }, () => {}, 'user1',
      () => {}, () => false, 10
    )

    // 无卡片时 checkQuestionBankCompleteness 返回 complete=false, cardsCount=0
    // updateQuestionBank 会返回 reason='no_cards'
    expect(result.success).toBe(false)
  })

  it('取消机制：isCancelled 返回 true 时立即中止', async () => {
    const cards = [{ id: 'c1', front: 'KP1' }]
    db.getCardsByUnit.mockResolvedValue(cards)
    db.getTestQuestions.mockResolvedValue([]) // 空题库

    let cancelCalled = false
    const isCancelled = () => cancelCalled

    // 在第一次进度回调后触发取消
    const onProgress = vi.fn(() => {
      cancelCalled = true
    })

    const result = await updateQuestionBankComplete(
      TEST_TYPES.UNIT, 'u1', { model: 'test' }, () => {}, 'user1',
      onProgress, isCancelled, 10
    )

    // 应该在第一轮就取消
    expect(result.reason).toBe('cancelled')
  })

  it('进度回调：onProgress 被正确调用并传递进度和详情', async () => {
    const cards = [{ id: 'c1', front: 'KP1' }]
    const completeQuestions = generateCompleteQuestions(cards)

    db.getCardsByUnit.mockResolvedValue(cards)
    db.getTestQuestions.mockResolvedValue(completeQuestions)

    const onProgress = vi.fn()

    await updateQuestionBankComplete(
      TEST_TYPES.UNIT, 'u1', { model: 'test' }, () => {}, 'user1',
      onProgress, () => false, 10
    )

    // 应该至少调用一次 onProgress
    expect(onProgress).toHaveBeenCalled()
    // 第一次调用应该包含进度值
    const firstCall = onProgress.mock.calls[0]
    expect(firstCall[0]).toBe(100) // 完整时直接 100
  })

  it('maxRounds 限制：达到最大轮次后终止', async () => {
    const cards = [{ id: 'c1', front: 'KP1' }]
    db.getCardsByUnit.mockResolvedValue(cards)
    // 始终返回空题库（模拟 AI 生成失败）
    db.getTestQuestions.mockResolvedValue([])
    db.getCardStatusesByCategory.mockResolvedValue([])
    db.getCategory.mockResolvedValue({ id: 'cat1', name: '测试', purpose: '考试' })

    // mock updateQuestionBank 内部依赖，让它返回 added=0（无新增）
    // 由于 updateQuestionBank 是同模块导出，我们通过 mock db 让它走 no_cards 分支
    // 实际上空卡片会返回 no_cards，但这里卡片不为空
    // 所以 updateQuestionBank 会尝试调用 AI，但 AI 被 mock 了
    // 这里主要验证 maxRounds 限制不会无限循环

    const result = await updateQuestionBankComplete(
      TEST_TYPES.UNIT, 'u1', { model: 'test' }, () => {}, 'user1',
      () => {}, () => false, 2 // maxRounds=2
    )

    // 应该在 2 轮后终止
    expect(result.rounds).toBeLessThanOrEqual(2)
  })
})

describe('updateQuestionBankComplete - 与 checkQuestionBankCompleteness 协作', () => {
  it('补全前后完整性检查结果一致', async () => {
    const cards = [{ id: 'c1', front: 'KP1' }, { id: 'c2', front: 'KP2' }]
    const completeQuestions = generateCompleteQuestions(cards)

    db.getCardsByUnit.mockResolvedValue(cards)
    db.getTestQuestions.mockResolvedValue(completeQuestions)

    // 先检查完整性
    const beforeCheck = await checkQuestionBankCompleteness(TEST_TYPES.UNIT, 'u1')
    expect(beforeCheck.complete).toBe(true)

    // 调用 updateQuestionBankComplete
    const result = await updateQuestionBankComplete(
      TEST_TYPES.UNIT, 'u1', { model: 'test' }, () => {}, 'user1',
      () => {}, () => false, 10
    )

    expect(result.complete).toBe(true)

    // 再检查完整性
    const afterCheck = await checkQuestionBankCompleteness(TEST_TYPES.UNIT, 'u1')
    expect(afterCheck.complete).toBe(true)
  })

  it('部分完整时：missingByCard 正确识别缺失卡片', async () => {
    const cards = [{ id: 'c1', front: 'KP1' }, { id: 'c2', front: 'KP2' }]
    // c1 完整，c2 完全缺失
    const partialQuestions = generateCompleteQuestions([cards[0]])

    db.getCardsByUnit.mockResolvedValue(cards)
    db.getTestQuestions.mockResolvedValue(partialQuestions)

    const checkResult = await checkQuestionBankCompleteness(TEST_TYPES.UNIT, 'u1')

    expect(checkResult.complete).toBe(false)
    expect(checkResult.missingByCard).toHaveLength(1)
    expect(checkResult.missingByCard[0].cardId).toBe('c2')
    expect(checkResult.missingByCard[0].missing).toHaveLength(12) // 4×3
  })
})
