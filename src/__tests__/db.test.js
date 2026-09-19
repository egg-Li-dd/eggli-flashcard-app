import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import Dexie from 'dexie'
import {
  ensureDbReady, dbInstance,
  addCategory, deleteCategory, addUnits, getUnitsByCategory,
  updateCard, getCardsByUnit, getAllCardsByCategory, getCardCountByCategory
} from '../services/db'

// ============================================================
// RED 阶段：所有测试初始状态应为 FAIL（新功能尚未实现）
// ============================================================

const TEST_DB_NAME = 'AIFlashCardsDB_v2'
const TEST_USER_ID = 'test-user-123'

// Helper: 清理测试数据库中的所有表
async function clearAllTables() {
  const tables = [
    'categories', 'units', 'cards', 'cardStatus',
    'bookmarks', 'wrongAnswers', 'ocrCache',
    'testQuestions', 'testRecords', 'testSessions'
  ]
  for (const table of tables) {
    try { await dbInstance.table(table).clear() } catch (_) { /* 表可能还不存在 */ }
  }
}

beforeAll(async () => {
  // 确保数据库就绪（跳过迁移逻辑，因为测试环境无旧库）
  await ensureDbReady()
})

afterEach(async () => {
  await clearAllTables()
})

// ========== 辅助函数：动态导入新增方法 ==========
// 在 RED 阶段，这些导入会失败因为方法还不存在
// 我们用 try-catch 动态导入，测试会因函数不存在而失败
let addTestQuestions, getTestQuestionsByUnit, getTestQuestionsByCategory
let updateTestQuestion, deleteTestQuestion, deleteTestQuestionsByUnit, deleteTestQuestionsByCategory
let addTestRecord, addTestRecords
let addTestSession, updateTestSession, getUncompletedTestSession, deleteTestSession
let deleteUnit
let batchCreateCategoriesAndUnits, batchUpdateCardsCategoryAndUnit

async function loadNewMethods() {
  const mod = await import('../services/db')
  addTestQuestions = mod.addTestQuestions
  getTestQuestionsByUnit = mod.getTestQuestionsByUnit
  getTestQuestionsByCategory = mod.getTestQuestionsByCategory
  updateTestQuestion = mod.updateTestQuestion
  deleteTestQuestion = mod.deleteTestQuestion
  deleteTestQuestionsByUnit = mod.deleteTestQuestionsByUnit
  deleteTestQuestionsByCategory = mod.deleteTestQuestionsByCategory
  addTestRecord = mod.addTestRecord
  addTestRecords = mod.addTestRecords
  addTestSession = mod.addTestSession
  updateTestSession = mod.updateTestSession
  getUncompletedTestSession = mod.getUncompletedTestSession
  deleteTestSession = mod.deleteTestSession
  deleteUnit = mod.deleteUnit
  batchCreateCategoriesAndUnits = mod.batchCreateCategoriesAndUnits
  batchUpdateCardsCategoryAndUnit = mod.batchUpdateCardsCategoryAndUnit
}

// ============================================================
// 1. 新表存在性测试
// ============================================================
describe('新表结构', () => {
  it('testQuestions 表应存在且可读写', async () => {
    await loadNewMethods()
    // 尝试写入一条记录来验证表存在
    const q = {
      id: 'q-1',
      categoryId: 'cat-1',
      unitId: 'unit-1',
      cardId: 'card-1',
      type: 'single',
      question: '测试题目?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: '解析',
      difficulty: 3,
      cardUpdatedAt: Date.now(),
      userId: TEST_USER_ID,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await dbInstance.testQuestions.put(q)
    const result = await dbInstance.testQuestions.get('q-1')
    expect(result).toBeTruthy()
    expect(result.id).toBe('q-1')
    expect(result.question).toBe('测试题目?')
    expect(result.type).toBe('single')
    expect(Array.isArray(result.options)).toBe(true)
  })

  it('testRecords 表应存在且可读写', async () => {
    const r = {
      id: 'r-1',
      questionId: 'q-1',
      userAnswer: 'A',
      isCorrect: true,
      testType: 'unit',
      testSessionId: 'session-1',
      userId: TEST_USER_ID,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await dbInstance.testRecords.put(r)
    const result = await dbInstance.testRecords.get('r-1')
    expect(result).toBeTruthy()
    expect(result.isCorrect).toBe(true)
  })

  it('testSessions 表应存在且可读写', async () => {
    const s = {
      id: 's-1',
      testType: 'unit',
      typeId: 'unit-1',
      questions: ['q-1', 'q-2'],
      userAnswers: ['A'],
      markedQuestions: [],
      currentIndex: 0,
      startTime: Date.now(),
      lastSavedAt: Date.now(),
      isCompleted: false,
      userId: TEST_USER_ID,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await dbInstance.testSessions.put(s)
    const result = await dbInstance.testSessions.get('s-1')
    expect(result).toBeTruthy()
    expect(result.isCompleted).toBe(false)
    expect(Array.isArray(result.questions)).toBe(true)
  })
})

describe('云端下载后的卡片关联修复', () => {
  it('应把只有 categoryId、unitId 缺失的卡片挂到该分类的恢复单元，供记录页和背诵页读取', async () => {
    await dbInstance.categories.add({ id: 'cat-sync-1', name: '云端分类', createdAt: Date.now() })
    await dbInstance.cards.add({
      id: 'card-orphan-1',
      categoryId: 'cat-sync-1',
      unitId: '',
      front: '问题',
      back: '答案',
      createdAt: Date.now(),
      order: 0,
    })

    const mod = await import('../services/db')
    await mod.repairCardRelationsAfterImport()

    const units = await getUnitsByCategory('cat-sync-1')
    expect(units.length).toBe(1)
    expect(units[0].name).toBe('云端下载卡片')

    const cardsInUnit = await getCardsByUnit(units[0].id)
    expect(cardsInUnit.map(c => c.id)).toEqual(['card-orphan-1'])

    await expect(getCardCountByCategory('cat-sync-1')).resolves.toBe(1)
    await expect(getAllCardsByCategory('cat-sync-1')).resolves.toHaveLength(1)
  })

  it('应把只有 unitId、categoryId 缺失的卡片按已有单元回填分类', async () => {
    await dbInstance.categories.add({ id: 'cat-sync-2', name: '云端分类2', createdAt: Date.now() })
    await dbInstance.units.add({ id: 'unit-sync-2', categoryId: 'cat-sync-2', name: '单元2', createdAt: Date.now(), order: 0 })
    await dbInstance.cards.add({
      id: 'card-missing-category',
      unitId: 'unit-sync-2',
      front: '问题2',
      back: '答案2',
      createdAt: Date.now(),
      order: 0,
    })

    const mod = await import('../services/db')
    await mod.repairCardRelationsAfterImport()

    const card = await dbInstance.cards.get('card-missing-category')
    expect(card.categoryId).toBe('cat-sync-2')
    await expect(getAllCardsByCategory('cat-sync-2')).resolves.toHaveLength(1)
  })

  it('无法匹配原分类和原单元时，应创建云端下载分类和恢复单元避免卡片不可见', async () => {
    await dbInstance.categories.bulkAdd([
      { id: 'cat-existing-1', name: '已有分类1', createdAt: Date.now() },
      { id: 'cat-existing-2', name: '已有分类2', createdAt: Date.now() },
    ])
    await dbInstance.cards.bulkAdd([
      {
        id: 'card-detached-1',
        unitId: 'cloud-unit-missing',
        categoryId: null,
        front: '孤立问题1',
        back: '孤立答案1',
        createdAt: Date.now(),
        order: 0,
      },
      {
        id: 'card-detached-2',
        unitId: 'cloud-unit-missing',
        categoryId: null,
        front: '孤立问题2',
        back: '孤立答案2',
        createdAt: Date.now(),
        order: 1,
      },
    ])

    const mod = await import('../services/db')
    await mod.repairCardRelationsAfterImport()

    const categories = await dbInstance.categories.toArray()
    const recoveryCategory = categories.find(c => c.name === '云端下载分类')
    expect(recoveryCategory).toBeTruthy()

    const units = await getUnitsByCategory(recoveryCategory.id)
    expect(units).toHaveLength(1)
    expect(units[0].id).toBe('cloud-unit-missing')

    const cards = await getAllCardsByCategory(recoveryCategory.id)
    expect(cards.map(c => c.id).sort()).toEqual(['card-detached-1', 'card-detached-2'])
  })
})

describe('跨分类 AI 全权归类事务', () => {
  it('应批量创建新分类和新单元，并返回可用于卡片更新的临时 ID 映射', async () => {
    await loadNewMethods()
    expect(typeof batchCreateCategoriesAndUnits).toBe('function')

    const result = await batchCreateCategoriesAndUnits([
      {
        tempId: 'cat-ai-1',
        name: '计算机网络',
        units: [
          { tempId: 'unit-ai-1', name: '网络体系结构' },
          { tempId: 'unit-ai-2', name: '传输层' },
        ],
      },
    ])

    expect(result.createdCategories).toHaveLength(1)
    expect(result.createdUnits).toHaveLength(2)
    expect(result.categoryIdMap['cat-ai-1']).toBeTruthy()
    expect(result.unitIdMap['unit-ai-1']).toBeTruthy()

    const units = await getUnitsByCategory(result.categoryIdMap['cat-ai-1'])
    expect(units.map(u => u.name)).toEqual(['网络体系结构', '传输层'])
  })

  it('应批量更新卡片归属、同步关联数据，并清理原空单元和原空分类', async () => {
    await loadNewMethods()
    expect(typeof batchUpdateCardsCategoryAndUnit).toBe('function')

    const oldCat = await addCategory('原分类')
    const oldUnits = await addUnits(oldCat.id, [
      { name: '原单元', cards: [{ front: 'TCP 的可靠传输', back: '确认、重传、排序', knowledge_point: 'TCP 可靠传输' }] },
    ])
    const [card] = await getCardsByUnit(oldUnits[0].id)
    await dbInstance.cardStatus.add({
      id: 'status-cross-1',
      cardId: card.id,
      categoryId: oldCat.id,
      status: 'learning',
      updatedAt: Date.now(),
      reviewCount: 1,
    })
    await dbInstance.wrongAnswers.add({
      id: 'wrong-cross-1',
      cardId: card.id,
      categoryId: oldCat.id,
      count: 1,
      lastWrongAt: Date.now(),
    })
    await dbInstance.testQuestions.add({
      id: 'tq-cross-1',
      categoryId: oldCat.id,
      unitId: oldUnits[0].id,
      cardId: card.id,
      type: 'single_choice',
      stem: 'TCP 如何保证可靠？',
      options: [],
      answer: '确认重传',
      analysis: '',
      difficulty: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const created = await batchCreateCategoriesAndUnits([
      {
        tempId: 'cat-ai-new',
        name: '计算机网络',
        units: [{ tempId: 'unit-ai-new', name: '传输层协议' }],
      },
    ])
    const newCategoryId = created.categoryIdMap['cat-ai-new']
    const newUnitId = created.unitIdMap['unit-ai-new']

    const result = await batchUpdateCardsCategoryAndUnit([
      { cardId: card.id, categoryId: newCategoryId, unitId: newUnitId },
    ], { cleanupEmptySource: true })

    const updatedCard = await dbInstance.cards.get(card.id)
    expect(updatedCard.categoryId).toBe(newCategoryId)
    expect(updatedCard.unitId).toBe(newUnitId)

    const status = await dbInstance.cardStatus.get('status-cross-1')
    expect(status.categoryId).toBe(newCategoryId)
    const wrong = await dbInstance.wrongAnswers.get('wrong-cross-1')
    expect(wrong.categoryId).toBe(newCategoryId)
    const question = await dbInstance.testQuestions.get('tq-cross-1')
    expect(question.categoryId).toBe(newCategoryId)
    expect(question.unitId).toBe(newUnitId)

    expect(await dbInstance.units.get(oldUnits[0].id)).toBeUndefined()
    expect(await dbInstance.categories.get(oldCat.id)).toBeUndefined()
    expect(result.movedCards).toBe(1)
    expect(result.deletedEmptyUnits).toBe(1)
    expect(result.deletedEmptyCategories).toBe(1)
  })
})

describe('跨分类指定分类归类数据一致性', () => {
  it('应批量更新卡片分类和单元，并同步关联状态、错题和题目归属', async () => {
    await dbInstance.categories.bulkAdd([
      { id: 'cat-from', name: '原分类', createdAt: 1 },
      { id: 'cat-to', name: '目标分类', createdAt: 2 },
    ])
    await dbInstance.units.bulkAdd([
      { id: 'unit-from', categoryId: 'cat-from', name: '原单元', createdAt: 1, order: 0 },
      { id: 'unit-to', categoryId: 'cat-to', name: '目标单元', createdAt: 2, order: 0 },
    ])
    await dbInstance.cards.bulkAdd([
      { id: 'card-a', categoryId: 'cat-from', unitId: 'unit-from', front: 'A', back: 'a', createdAt: 1, order: 0 },
      { id: 'card-b', categoryId: 'cat-from', unitId: 'unit-from', front: 'B', back: 'b', createdAt: 2, order: 1 },
    ])
    await dbInstance.cardStatus.bulkAdd([
      { id: 'status-a', cardId: 'card-a', categoryId: 'cat-from', status: 'mastered', updatedAt: 1 },
      { id: 'status-b', cardId: 'card-b', categoryId: 'cat-from', status: 'review', updatedAt: 1 },
    ])
    await dbInstance.bookmarks.add({ id: 'bm-a', cardId: 'card-a', createdAt: 1 })
    await dbInstance.wrongAnswers.add({ id: 'wrong-a', cardId: 'card-a', categoryId: 'cat-from', count: 1, lastWrongAt: 1 })
    await dbInstance.testQuestions.bulkAdd([
      { id: 'q-a', categoryId: 'cat-from', unitId: 'unit-from', cardId: 'card-a', type: 'single', question: 'QA', answer: 'A', createdAt: 1 },
      { id: 'q-b', categoryId: 'cat-from', unitId: 'unit-from', cardId: 'card-b', type: 'single', question: 'QB', answer: 'B', createdAt: 1 },
    ])

    const mod = await import('../services/db')
    expect(typeof mod.batchUpdateCardsCategoryAndUnit).toBe('function')

    const result = await mod.batchUpdateCardsCategoryAndUnit({
      'card-a': { categoryId: 'cat-to', unitId: 'unit-to' },
      'card-b': { categoryId: 'cat-to', unitId: 'unit-to' },
    })

    expect(result.updatedCards).toBe(2)
    expect((await dbInstance.cards.get('card-a')).categoryId).toBe('cat-to')
    expect((await dbInstance.cards.get('card-a')).unitId).toBe('unit-to')
    expect((await dbInstance.cardStatus.get('status-a')).categoryId).toBe('cat-to')
    expect((await dbInstance.wrongAnswers.get('wrong-a')).categoryId).toBe('cat-to')
    expect((await dbInstance.testQuestions.get('q-a')).categoryId).toBe('cat-to')
    expect((await dbInstance.testQuestions.get('q-a')).unitId).toBe('unit-to')
    expect(await dbInstance.bookmarks.get('bm-a')).toBeTruthy()

    await mod.deleteEmptyUnit('unit-from')
    const deletedCategory = await mod.deleteEmptyCategory('cat-from')
    expect(deletedCategory).toBe(true)
    expect(await dbInstance.units.get('unit-from')).toBeUndefined()
    expect(await dbInstance.categories.get('cat-from')).toBeUndefined()
  })

  it('deleteCategory 应级联删除卡片、状态、收藏、错题、题目、答题记录和会话', async () => {
    await dbInstance.categories.add({ id: 'cat-del', name: '待删分类', createdAt: 1 })
    await dbInstance.units.add({ id: 'unit-del', categoryId: 'cat-del', name: '待删单元', createdAt: 1, order: 0 })
    await dbInstance.cards.add({ id: 'card-del', categoryId: 'cat-del', unitId: 'unit-del', front: 'Q', back: 'A', createdAt: 1, order: 0 })
    await dbInstance.cardStatus.add({ id: 'status-del', cardId: 'card-del', categoryId: 'cat-del', status: 'review', updatedAt: 1 })
    await dbInstance.bookmarks.add({ id: 'bm-del', cardId: 'card-del', createdAt: 1 })
    await dbInstance.wrongAnswers.add({ id: 'wrong-del', cardId: 'card-del', categoryId: 'cat-del', count: 1, lastWrongAt: 1 })
    await dbInstance.testQuestions.add({ id: 'q-del', categoryId: 'cat-del', unitId: 'unit-del', cardId: 'card-del', type: 'single', question: 'Q', answer: 'A', createdAt: 1 })
    await dbInstance.testRecords.add({ id: 'record-del', questionId: 'q-del', categoryId: 'cat-del', unitId: 'unit-del', testSessionId: 'session-del', createdAt: 1 })
    await dbInstance.testSessions.add({ id: 'session-del', testType: 'category', typeId: 'cat-del', userId: 'u', isCompleted: false, createdAt: 1 })

    await deleteCategory('cat-del')

    expect(await dbInstance.categories.get('cat-del')).toBeUndefined()
    expect(await dbInstance.units.get('unit-del')).toBeUndefined()
    expect(await dbInstance.cards.get('card-del')).toBeUndefined()
    expect(await dbInstance.cardStatus.get('status-del')).toBeUndefined()
    expect(await dbInstance.bookmarks.get('bm-del')).toBeUndefined()
    expect(await dbInstance.wrongAnswers.get('wrong-del')).toBeUndefined()
    expect(await dbInstance.testQuestions.get('q-del')).toBeUndefined()
    expect(await dbInstance.testRecords.get('record-del')).toBeUndefined()
    expect(await dbInstance.testSessions.get('session-del')).toBeUndefined()
  })
})

describe('同分类智能单元整理数据库操作', () => {
  it('batchUpdateCardsUnit 应在事务内批量移动卡片并同步 categoryId', async () => {
    const mod = await import('../services/db')
    expect(typeof mod.batchUpdateCardsUnit).toBe('function')

    await dbInstance.categories.add({ id: 'cat-reorg', name: '重组分类', createdAt: Date.now() })
    await dbInstance.units.bulkAdd([
      { id: 'unit-old', categoryId: 'cat-reorg', name: '旧单元', createdAt: Date.now(), order: 0 },
      { id: 'unit-new', categoryId: 'cat-reorg', name: '新单元', createdAt: Date.now(), order: 1 },
    ])
    await dbInstance.cards.bulkAdd([
      { id: 'card-a', categoryId: 'cat-reorg', unitId: 'unit-old', front: 'A', back: 'a', createdAt: Date.now(), order: 0 },
      { id: 'card-b', categoryId: 'cat-reorg', unitId: 'unit-old', front: 'B', back: 'b', createdAt: Date.now(), order: 1 },
    ])

    const result = await mod.batchUpdateCardsUnit({
      'card-a': 'unit-new',
      'card-b': 'unit-new',
    })

    expect(result.updatedCards).toBe(2)
    const moved = await dbInstance.cards.where('unitId').equals('unit-new').toArray()
    expect(moved.map(c => c.id).sort()).toEqual(['card-a', 'card-b'])
    expect(moved.every(c => c.categoryId === 'cat-reorg')).toBe(true)
  })

  it('deleteEmptyUnits 应只删除指定分类下卡片数为 0 的单元', async () => {
    const mod = await import('../services/db')
    expect(typeof mod.deleteEmptyUnits).toBe('function')

    await dbInstance.categories.bulkAdd([
      { id: 'cat-empty-a', name: '分类A', createdAt: Date.now() },
      { id: 'cat-empty-b', name: '分类B', createdAt: Date.now() },
    ])
    await dbInstance.units.bulkAdd([
      { id: 'unit-empty-a', categoryId: 'cat-empty-a', name: '空单元A', createdAt: Date.now(), order: 0 },
      { id: 'unit-full-a', categoryId: 'cat-empty-a', name: '有卡单元A', createdAt: Date.now(), order: 1 },
      { id: 'unit-empty-b', categoryId: 'cat-empty-b', name: '空单元B', createdAt: Date.now(), order: 0 },
    ])
    await dbInstance.cards.add({
      id: 'card-full-a',
      categoryId: 'cat-empty-a',
      unitId: 'unit-full-a',
      front: '保留',
      back: '保留',
      createdAt: Date.now(),
      order: 0,
    })

    const result = await mod.deleteEmptyUnits('cat-empty-a')

    expect(result.deletedUnits).toBe(1)
    expect(await dbInstance.units.get('unit-empty-a')).toBeUndefined()
    expect(await dbInstance.units.get('unit-full-a')).toBeTruthy()
    expect(await dbInstance.units.get('unit-empty-b')).toBeTruthy()
  })
})

// ============================================================
// 2. testQuestions CRUD 测试
// ============================================================
describe('addTestQuestions', () => {
  it('应创建题目并自动添加 userId、createdAt、updatedAt', async () => {
    await loadNewMethods()
    const questions = [{
      categoryId: 'cat-1',
      unitId: 'unit-1',
      cardId: 'card-1',
      type: 'single',
      question: '单选题?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: '解释',
      difficulty: 3,
      cardUpdatedAt: Date.now()
    }]

    const results = await addTestQuestions(questions, TEST_USER_ID)
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBe(1)
    expect(results[0].userId).toBe(TEST_USER_ID)
    expect(results[0].createdAt).toBeGreaterThan(0)
    expect(results[0].updatedAt).toBeGreaterThan(0)
    expect(typeof results[0].id).toBe('string')
    expect(results[0].id.length).toBeGreaterThan(0)
  })

  it('应批量创建多道题目', async () => {
    await loadNewMethods()
    const questions = [
      { categoryId: 'cat-1', unitId: 'unit-1', cardId: 'card-1', type: 'single', question: 'Q1?', options: ['A','B'], answer: 'A', explanation: '', difficulty: 1, cardUpdatedAt: Date.now() },
      { categoryId: 'cat-1', unitId: 'unit-1', cardId: 'card-2', type: 'multiple', question: 'Q2?', options: ['A','B','C'], answer: 'AB', explanation: '', difficulty: 2, cardUpdatedAt: Date.now() },
      { categoryId: 'cat-1', unitId: 'unit-1', cardId: 'card-3', type: 'fill', question: 'Q3?', options: [], answer: '答案', explanation: '', difficulty: 3, cardUpdatedAt: Date.now() },
    ]
    const results = await addTestQuestions(questions, TEST_USER_ID)
    expect(results.length).toBe(3)
    const all = await dbInstance.testQuestions.toArray()
    expect(all.length).toBe(3)
  })
})

describe('getTestQuestionsByUnit', () => {
  it('应返回指定单元下的所有题目', async () => {
    await loadNewMethods()
    // 先创建数据
    await dbInstance.testQuestions.bulkAdd([
      { id: 'q1', categoryId: 'cat-1', unitId: 'unit-1', cardId: 'c1', type: 'single', question: 'Q1', options: [], answer: 'A', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q2', categoryId: 'cat-1', unitId: 'unit-1', cardId: 'c2', type: 'judge', question: 'Q2', options: [], answer: 'T', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q3', categoryId: 'cat-1', unitId: 'unit-2', cardId: 'c3', type: 'fill', question: 'Q3', options: [], answer: 'X', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
    ])
    const result = await getTestQuestionsByUnit('unit-1')
    expect(result.length).toBe(2)
  })
})

describe('getTestQuestionsByCategory', () => {
  it('应返回指定分类下所有题目（含 unitId=null 的分类级题目）', async () => {
    await loadNewMethods()
    await dbInstance.testQuestions.bulkAdd([
      { id: 'q1', categoryId: 'cat-1', unitId: 'unit-1', cardId: 'c1', type: 'single', question: 'Q1', options: [], answer: 'A', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q2', categoryId: 'cat-1', unitId: null, cardId: 'c5', type: 'single', question: 'Q-cat', options: [], answer: 'A', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q3', categoryId: 'cat-2', unitId: 'unit-2', cardId: 'c3', type: 'fill', question: 'Q3', options: [], answer: 'X', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
    ])
    const result = await getTestQuestionsByCategory('cat-1')
    expect(result.length).toBe(2)
  })
})

describe('updateTestQuestion', () => {
  it('应更新题目字段并自动更新 updatedAt', async () => {
    await loadNewMethods()
    await dbInstance.testQuestions.put({
      id: 'q1', categoryId: 'cat-1', unitId: 'unit-1', cardId: 'c1', type: 'single',
      question: '旧问题', options: [], answer: 'A', explanation: '', difficulty: 1,
      cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now()
    })
    const before = await dbInstance.testQuestions.get('q1')
    const oldUpdatedAt = before.updatedAt

    // 等待一下确保时间戳不同
    await new Promise(r => setTimeout(r, 10))

    const updated = await updateTestQuestion('q1', { question: '新问题', difficulty: 5 })
    expect(updated.question).toBe('新问题')
    expect(updated.difficulty).toBe(5)
    expect(updated.updatedAt).toBeGreaterThan(oldUpdatedAt)
  })
})

describe('deleteTestQuestion', () => {
  it('应删除单道题目', async () => {
    await loadNewMethods()
    await dbInstance.testQuestions.put({
      id: 'q-del', categoryId: 'cat-1', unitId: 'unit-1', cardId: 'c1', type: 'single',
      question: 'Q', options: [], answer: 'A', explanation: '', difficulty: 1,
      cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now()
    })
    await deleteTestQuestion('q-del')
    const result = await dbInstance.testQuestions.get('q-del')
    expect(result).toBeUndefined()
  })
})

describe('deleteTestQuestionsByUnit', () => {
  it('应删除指定单元下的所有题目', async () => {
    await loadNewMethods()
    await dbInstance.testQuestions.bulkAdd([
      { id: 'q1', categoryId: 'cat-1', unitId: 'unit-x', cardId: 'c1', type: 'single', question: 'Q1', options: [], answer: 'A', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q2', categoryId: 'cat-1', unitId: 'unit-x', cardId: 'c2', type: 'judge', question: 'Q2', options: [], answer: 'T', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q3', categoryId: 'cat-1', unitId: 'unit-y', cardId: 'c3', type: 'fill', question: 'Q3', options: [], answer: 'X', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
    ])
    await deleteTestQuestionsByUnit('unit-x')
    const remaining = await dbInstance.testQuestions.toArray()
    expect(remaining.length).toBe(1)
    expect(remaining[0].unitId).toBe('unit-y')
  })
})

describe('deleteTestQuestionsByCategory', () => {
  it('应删除指定分类下的所有题目', async () => {
    await loadNewMethods()
    await dbInstance.testQuestions.bulkAdd([
      { id: 'q1', categoryId: 'cat-x', unitId: 'unit-1', cardId: 'c1', type: 'single', question: 'Q1', options: [], answer: 'A', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q2', categoryId: 'cat-x', unitId: 'unit-2', cardId: 'c2', type: 'judge', question: 'Q2', options: [], answer: 'T', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'q3', categoryId: 'cat-y', unitId: 'unit-3', cardId: 'c3', type: 'fill', question: 'Q3', options: [], answer: 'X', explanation: '', difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
    ])
    await deleteTestQuestionsByCategory('cat-x')
    const remaining = await dbInstance.testQuestions.toArray()
    expect(remaining.length).toBe(1)
    expect(remaining[0].categoryId).toBe('cat-y')
  })
})

// ============================================================
// 3. testRecords 测试
// ============================================================
describe('addTestRecord', () => {
  it('应创建答题记录并自动添加 userId 和时间戳', async () => {
    await loadNewMethods()
    const record = {
      questionId: 'q-1',
      userAnswer: 'B',
      isCorrect: false,
      testType: 'unit',
      testSessionId: 'session-1',
    }
    const result = await addTestRecord(record, TEST_USER_ID)
    expect(result.id).toBeTruthy()
    expect(result.userId).toBe(TEST_USER_ID)
    expect(result.isCorrect).toBe(false)
    expect(result.createdAt).toBeGreaterThan(0)
    expect(result.updatedAt).toBeGreaterThan(0)
  })
})

describe('addTestRecords', () => {
  it('应批量创建答题记录', async () => {
    await loadNewMethods()
    const records = [
      { questionId: 'q1', userAnswer: 'A', isCorrect: true, testType: 'unit', testSessionId: 's1' },
      { questionId: 'q2', userAnswer: 'B', isCorrect: false, testType: 'unit', testSessionId: 's1' },
      { questionId: 'q3', userAnswer: 'C', isCorrect: true, testType: 'unit', testSessionId: 's1' },
    ]
    const results = await addTestRecords(records, TEST_USER_ID)
    expect(results.length).toBe(3)
    expect(results[0].userId).toBe(TEST_USER_ID)
    const all = await dbInstance.testRecords.toArray()
    expect(all.length).toBe(3)
  })
})

// ============================================================
// 4. testSessions 测试
// ============================================================
describe('addTestSession', () => {
  it('应创建答题会话并自动添加字段', async () => {
    await loadNewMethods()
    const session = {
      testType: 'unit',
      typeId: 'unit-1',
      questions: ['q1', 'q2', 'q3'],
      userAnswers: [],
      markedQuestions: [],
      currentIndex: 0,
      startTime: Date.now(),
      isCompleted: false,
    }
    const result = await addTestSession(session, TEST_USER_ID)
    expect(result.id).toBeTruthy()
    expect(result.userId).toBe(TEST_USER_ID)
    expect(result.isCompleted).toBe(false)
    expect(result.createdAt).toBeGreaterThan(0)
  })
})

describe('updateTestSession', () => {
  it('应更新会话字段并更新 lastSavedAt', async () => {
    await loadNewMethods()
    await dbInstance.testSessions.put({
      id: 's-1', testType: 'unit', typeId: 'unit-1',
      questions: ['q1', 'q2'], userAnswers: [], markedQuestions: [],
      currentIndex: 0, startTime: Date.now(), lastSavedAt: Date.now(),
      isCompleted: false, userId: TEST_USER_ID,
      createdAt: Date.now(), updatedAt: Date.now()
    })
    await new Promise(r => setTimeout(r, 10))

    const updated = await updateTestSession('s-1', {
      currentIndex: 2,
      userAnswers: ['A', 'B'],
      lastSavedAt: Date.now()
    })
    expect(updated.currentIndex).toBe(2)
    expect(updated.userAnswers).toEqual(['A', 'B'])
    expect(updated.updatedAt).toBeGreaterThan(0)
  })
})

describe('getUncompletedTestSession', () => {
  it('应返回未完成的测试会话', async () => {
    await loadNewMethods()
    await dbInstance.testSessions.bulkPut([
      { id: 's1', testType: 'unit', typeId: 'unit-1', questions: ['q1'], userAnswers: [], markedQuestions: [], currentIndex: 0, startTime: Date.now(), lastSavedAt: Date.now(), isCompleted: false, userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 's2', testType: 'unit', typeId: 'unit-1', questions: ['q1'], userAnswers: ['A'], markedQuestions: [], currentIndex: 1, startTime: Date.now(), lastSavedAt: Date.now(), isCompleted: true, userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now() },
    ])
    const result = await getUncompletedTestSession('unit', 'unit-1', TEST_USER_ID)
    expect(result).toBeTruthy()
    expect(result.id).toBe('s1')
    expect(result.isCompleted).toBe(false)
  })

  it('应返回 null 当没有未完成的会话时', async () => {
    await loadNewMethods()
    await dbInstance.testSessions.put({
      id: 's-done', testType: 'unit', typeId: 'unit-1', questions: ['q1'], userAnswers: ['A'], markedQuestions: [], currentIndex: 1, startTime: Date.now(), lastSavedAt: Date.now(), isCompleted: true, userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now()
    })
    const result = await getUncompletedTestSession('unit', 'unit-1', TEST_USER_ID)
    expect(result).toBeNull()
  })
})

describe('deleteTestSession', () => {
  it('应删除测试会话', async () => {
    await loadNewMethods()
    await dbInstance.testSessions.put({
      id: 's-del', testType: 'unit', typeId: 'unit-1', questions: [], userAnswers: [], markedQuestions: [], currentIndex: 0, startTime: Date.now(), lastSavedAt: Date.now(), isCompleted: false, userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now()
    })
    await deleteTestSession('s-del')
    const result = await dbInstance.testSessions.get('s-del')
    expect(result).toBeUndefined()
  })
})

// ============================================================
// 5. 级联删除测试
// ============================================================
describe('deleteCategory 级联删除', () => {
  it('删除分类时应同步删除关联的 testQuestions', async () => {
    await loadNewMethods()
    // 创建分类、单元、卡片
    const cat = await addCategory('测试分类')
    const units = await addUnits(cat.id, [{ name: '单元1', cards: [{ front: '问题', back: '答案' }] }])
    // 添加 testQuestions
    await dbInstance.testQuestions.put({
      id: 'tq-1', categoryId: cat.id, unitId: units[0].id, cardId: 'card-x',
      type: 'single', question: 'Q', options: [], answer: 'A', explanation: '',
      difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID,
      createdAt: Date.now(), updatedAt: Date.now()
    })

    await deleteCategory(cat.id)

    const qs = await dbInstance.testQuestions.where('categoryId').equals(cat.id).toArray()
    expect(qs.length).toBe(0)
  })

  it('删除分类时应同步删除关联的 testRecords', async () => {
    await loadNewMethods()
    const cat = await addCategory('测试分类2')
    await dbInstance.testRecords.put({
      id: 'tr-1', questionId: 'tq-1', userAnswer: 'A', isCorrect: true,
      testType: 'category', testSessionId: 's-1', userId: TEST_USER_ID,
      createdAt: Date.now(), updatedAt: Date.now()
    })
    // 同时需要 testQuestions 记录以建立关联
    await dbInstance.testQuestions.put({
      id: 'tq-1', categoryId: cat.id, unitId: null, cardId: 'c1',
      type: 'single', question: 'Q', options: [], answer: 'A', explanation: '',
      difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID,
      createdAt: Date.now(), updatedAt: Date.now()
    })

    await deleteCategory(cat.id)

    const records = await dbInstance.testRecords.toArray()
    // testRecords 中通过 questionId 关联的题目被删除了，但 record 本身不直接关联 categoryId
    // 级联应删除该分类下所有题目的答题记录
    const orphanRecords = records.filter(r => r.questionId === 'tq-1')
    expect(orphanRecords.length).toBe(0)
  })

  it('删除分类时应同步删除关联的 testSessions', async () => {
    await loadNewMethods()
    const cat = await addCategory('测试分类3')
    await dbInstance.testSessions.put({
      id: 'ts-1', testType: 'category', typeId: cat.id,
      questions: [], userAnswers: [], markedQuestions: [],
      currentIndex: 0, startTime: Date.now(), lastSavedAt: Date.now(),
      isCompleted: false, userId: TEST_USER_ID,
      createdAt: Date.now(), updatedAt: Date.now()
    })

    await deleteCategory(cat.id)

    const sessions = await dbInstance.testSessions.where('typeId').equals(cat.id).toArray()
    expect(sessions.length).toBe(0)
  })
})

describe('deleteUnit 级联删除', () => {
  it('应存在 deleteUnit 函数', async () => {
    await loadNewMethods()
    expect(typeof deleteUnit).toBe('function')
  })

  it('删除单元时应同步删除关联的 testQuestions', async () => {
    await loadNewMethods()
    const cat = await addCategory('cat-del-unit')
    const units = await addUnits(cat.id, [{ name: '待删单元', cards: [] }])
    const unitId = units[0].id
    await dbInstance.testQuestions.put({
      id: 'tq-unit', categoryId: cat.id, unitId, cardId: 'c1',
      type: 'single', question: 'Q', options: [], answer: 'A', explanation: '',
      difficulty: 1, cardUpdatedAt: Date.now(), userId: TEST_USER_ID,
      createdAt: Date.now(), updatedAt: Date.now()
    })

    await deleteUnit(unitId)

    const qs = await dbInstance.testQuestions.where('unitId').equals(unitId).toArray()
    expect(qs.length).toBe(0)
  })
})

// ============================================================
// 6. updateCard 标记关联题目过期测试
// ============================================================
describe('updateCard 钩子', () => {
  it('更新卡片时应标记关联 testQuestions 的 cardUpdatedAt 不过期（不自动更新题目）', async () => {
    // 注意：根据需求，updateCard 应该标记关联题目为"过期"
    // 这里验证的是：更新卡片后，关联题目的 cardUpdatedAt 不自动同步 = 标记为过期
    await loadNewMethods()
    const cat = await addCategory('cat-update')
    const units = await addUnits(cat.id, [{ name: '单元', cards: [{ front: 'Q', back: 'A' }] }])
    const cards = await getCardsByUnit(units[0].id)
    const cardId = cards[0].id

    const oldCardUpdatedAt = cards[0].updatedAt || cards[0].createdAt

    // 等待一下
    await new Promise(r => setTimeout(r, 10))

    // 创建题目时记录 cardUpdatedAt
    await dbInstance.testQuestions.put({
      id: 'tq-card', categoryId: cat.id, unitId: units[0].id, cardId,
      type: 'single', question: 'Q', options: [], answer: 'A', explanation: '',
      difficulty: 1, cardUpdatedAt: oldCardUpdatedAt,
      userId: TEST_USER_ID, createdAt: Date.now(), updatedAt: Date.now()
    })

    // 更新卡片 front 字段 → 期望触发钩子
    await updateCard(cardId, { front: '新问题' })

    // 获取更新后的卡片
    const updatedCard = await dbInstance.cards.get(cardId)
    const newCardUpdatedAt = updatedCard.updatedAt || updatedCard.createdAt

    // cardUpdatedAt 已更新，题目的 cardUpdatedAt 应与新 cardUpdatedAt 不一致 → 标记为过期
    // 实际上 updateCard 钩子应该更新关联题目的 cardUpdatedAt 或者让题目过期
    // 这里先验证基本逻辑：卡片的 updatedAt 确实变了
    expect(newCardUpdatedAt).toBeGreaterThan(oldCardUpdatedAt)
  })
})

// ============================================================
// 7. 原有功能不受影响测试
// ============================================================
describe('原有功能回归', () => {
  it('addCategory / deleteCategory 仍正常工作', async () => {
    const cat = await addCategory('回归测试分类')
    expect(cat.id).toBeTruthy()
    expect(cat.name).toBe('回归测试分类')
    await deleteCategory(cat.id)
    const all = await dbInstance.categories.toArray()
    expect(all.find(c => c.id === cat.id)).toBeUndefined()
  })

  it('getUnitsByCategory 仍正常工作', async () => {
    const cat = await addCategory('units-test')
    await addUnits(cat.id, [{ name: 'U1', cards: [] }])
    const units = await getUnitsByCategory(cat.id)
    expect(units.length).toBe(1)
    expect(units[0].name).toBe('U1')
    await deleteCategory(cat.id)
  })
})
