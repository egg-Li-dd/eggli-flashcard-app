import Dexie from 'dexie'
import { generateId } from '../utils/helpers'
import { applySM2, applySM2WithDelay } from '../utils/ebbinghaus'

// === 设计要点 ===
// 1. Dexie 严格禁止在版本升级中变更主键（会抛出 "Not yet support for changing primary key"）
// 2. 为安全起见，使用新的数据库名 'AIFlashCardsDB_v2'，通过 ensureDbReady() 一次性迁移旧库数据。
// 3. 新库所有表主键统一为 id（符合 Supabase 云端 schema）。
const OLD_DB_NAME = 'AIFlashCardsDB'
const NEW_DB_NAME = 'AIFlashCardsDB_v2'

// —— 当前（新）数据库 schema（主键均为 &id）——
const db = new Dexie(NEW_DB_NAME)
db.version(1).stores({
  categories: '&id, name, createdAt',
  units: '&id, categoryId, name, createdAt, order',
  cards: '&id, unitId, front, back, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, count, lastWrongAt',
  testRecords: '&id, categoryId, unitId, userId, createdAt, type',
  ocrCache: 'imageHash, timestamp',
})

// v2 升级：为 cards 表新增 knowledge_point（原始知识点，可编辑）字段
// Dexie 允许非索引字段透明存储；此处保留版本号以明确变更，并保证新旧版本兼容。
db.version(2).stores({
  categories: '&id, name, createdAt',
  units: '&id, categoryId, name, createdAt, order',
  cards: '&id, unitId, categoryId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, count, lastWrongAt',
  testRecords: '&id, categoryId, unitId, userId, createdAt, type',
  ocrCache: 'imageHash, timestamp',
})

// v3 升级：新增单元检测三张表（testQuestions / testRecords / testSessions）
// testRecords 在 v2 中已存在但 schema 不同，v3 更新索引以匹配新需求
db.version(3).stores({
  categories: '&id, name, createdAt',
  units: '&id, categoryId, name, createdAt, order',
  cards: '&id, unitId, categoryId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, count, lastWrongAt',
  testRecords: '&id, categoryId, unitId, questionId, testSessionId, userId, testType, createdAt',
  ocrCache: 'imageHash, timestamp',
  testQuestions: '&id, categoryId, unitId, cardId, type, userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
})

// v4 升级：testQuestions 新增 testType + targetId 复合索引，支持 getTestQuestions(testType, targetId) 查询
db.version(4).stores({
  categories: '&id, name, createdAt',
  units: '&id, categoryId, name, createdAt, order',
  cards: '&id, unitId, categoryId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, count, lastWrongAt',
  testRecords:
    '&id, categoryId, unitId, questionId, testSessionId, userId, testType, createdAt',
  // v4 扩展：testQuestions 支持 categoryId/unitId 多索引
  testQuestions:
    '&id, categoryId, unitId, cardId, testType, targetId, [testType+targetId], userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
})

// v5 升级：wrongAnswers 表增加 unitId 索引，支持按单元筛选错题
// 非索引字段 unitName / categoryName / stem 会由 Dexie 透明存储，不需要在 stores() 中声明
db.version(5).stores({
  categories: '&id, name, createdAt',
  units: '&id, categoryId, name, createdAt, order',
  cards: '&id, unitId, categoryId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak',
  bookmarks: '&id, cardId, createdAt',
  // v5 新增：unitId 索引 + [categoryId+unitId] 复合索引，支持按分类/单元快速筛选
  wrongAnswers: '&id, cardId, categoryId, unitId, count, lastWrongAt, [categoryId+unitId]',
  testRecords:
    '&id, categoryId, unitId, questionId, testSessionId, userId, testType, createdAt',
  testQuestions:
    '&id, categoryId, unitId, cardId, testType, targetId, [testType+targetId], userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
})

// v6 升级：新增 reviewHistory（复习历史）和 studyPlans（学习计划）表
// cardStatus 表新增 mode 字段（用于区分操作来源模式：ebbinghaus/sequential/active/weak/test）
db.version(6).stores({
  categories: '&id, name, createdAt',
  units: '&id, categoryId, name, createdAt, order',
  cards: '&id, unitId, categoryId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak, mode',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, unitId, count, lastWrongAt, [categoryId+unitId]',
  testRecords:
    '&id, categoryId, unitId, questionId, testSessionId, userId, testType, createdAt',
  testQuestions:
    '&id, categoryId, unitId, cardId, testType, targetId, [testType+targetId], userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  // v6 新增表
  reviewHistory: '&id, cardId, categoryId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
})

// v7 升级：新增 chapters（章节）表，介于分类与单元之间
// 为 units、cards、wrongAnswers、cardStatus、testQuestions、testRecords 新增 chapterId 字段
db.version(7).stores({
  categories: '&id, name, createdAt',
  chapters: '&id, categoryId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, chapterId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak, mode',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, unitId, chapterId, count, lastWrongAt, [categoryId+unitId]',
  testRecords:
    '&id, categoryId, unitId, chapterId, questionId, testSessionId, userId, testType, createdAt',
  testQuestions:
    '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  reviewHistory: '&id, cardId, categoryId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
}).upgrade(async tx => {
  // v6→v7 迁移：为每个分类创建默认章节，并将现有数据迁移到章节下
  const categories = await tx.table('categories').toArray()
  const chapters = await tx.table('chapters')
  const unitsTable = tx.table('units')
  const cardsTable = tx.table('cards')
  const cardStatusTable = tx.table('cardStatus')
  const wrongAnswersTable = tx.table('wrongAnswers')
  const testQuestionsTable = tx.table('testQuestions')
  const testRecordsTable = tx.table('testRecords')

  for (const cat of categories) {
    // 为每个分类创建一个默认章节
    const defaultChapterId = generateId()
    const defaultChapter = {
      id: defaultChapterId,
      categoryId: cat.id,
      name: '默认章节',
      createdAt: Date.now(),
      order: 0,
    }
    await chapters.add(defaultChapter)

    // 更新该分类下所有 unit 的 chapterId
    const categoryUnits = await unitsTable.where('categoryId').equals(cat.id).toArray()
    for (const unit of categoryUnits) {
      await unitsTable.update(unit.id, { chapterId: defaultChapterId })
    }

    // 更新该分类下所有 card 的 chapterId
    const categoryCards = await cardsTable.where('categoryId').equals(cat.id).toArray()
    for (const card of categoryCards) {
      await cardsTable.update(card.id, { chapterId: defaultChapterId })
    }

    // 更新该分类下所有 cardStatus 的 chapterId
    const categoryStatuses = await cardStatusTable.where('categoryId').equals(cat.id).toArray()
    for (const status of categoryStatuses) {
      await cardStatusTable.update(status.id, { chapterId: defaultChapterId })
    }

    // 更新该分类下所有 wrongAnswers 的 chapterId
    const categoryWrongAnswers = await wrongAnswersTable.where('categoryId').equals(cat.id).toArray()
    for (const wa of categoryWrongAnswers) {
      await wrongAnswersTable.update(wa.id, { chapterId: defaultChapterId })
    }

    // 更新该分类下所有 testQuestions 的 chapterId
    const categoryTestQuestions = await testQuestionsTable.where('categoryId').equals(cat.id).toArray()
    for (const tq of categoryTestQuestions) {
      await testQuestionsTable.update(tq.id, { chapterId: defaultChapterId })
    }

    // 更新该分类下所有 testRecords 的 chapterId
    const categoryTestRecords = await testRecordsTable.where('categoryId').equals(cat.id).toArray()
    for (const tr of categoryTestRecords) {
      await testRecordsTable.update(tr.id, { chapterId: defaultChapterId })
    }
  }
})

// v8 升级：studyPlans 表新增 chapterId 字段（支持按章节设置学习计划）
db.version(8).stores({
  categories: '&id, name, createdAt',
  chapters: '&id, categoryId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, chapterId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak, mode',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, unitId, chapterId, count, lastWrongAt, [categoryId+unitId]',
  testRecords:
    '&id, categoryId, unitId, chapterId, questionId, testSessionId, userId, testType, createdAt',
  testQuestions:
    '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
})

// v9 升级：wrongAnswers 表新增 [categoryId+chapterId] 复合索引，支持按章节查询错题
db.version(9).stores({
  categories: '&id, name, createdAt',
  chapters: '&id, categoryId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, chapterId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak, mode',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, unitId, chapterId, count, lastWrongAt, [categoryId+unitId], [categoryId+chapterId]',
  testRecords:
    '&id, categoryId, unitId, chapterId, questionId, testSessionId, userId, testType, createdAt',
  testQuestions:
    '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
})

// v10 升级：新增 topics（主题）表，chapters 表新增 topicId 字段（介于分类与章节之间）
db.version(10).stores({
  categories: '&id, name, createdAt',
  topics: '&id, categoryId, name, createdAt',
  chapters: '&id, categoryId, topicId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, chapterId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak, mode',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, unitId, chapterId, count, lastWrongAt, [categoryId+unitId], [categoryId+chapterId]',
  testRecords:
    '&id, categoryId, unitId, chapterId, questionId, testSessionId, userId, testType, createdAt',
  testQuestions:
    '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
}).upgrade(async tx => {
  // v9→v10 迁移：为现有章节设置 topicId: null
  const chaptersTable = tx.table('chapters')
  const allChapters = await chaptersTable.toArray()
  for (const chapter of allChapters) {
    await chaptersTable.update(chapter.id, { topicId: null })
  }
})

// v11 升级：新增 linkGenerationRuns（联结题库历史记录）表，并允许 testQuestions 存储 pendingReview/reviewedAt 字段
// pendingReview 为 true 表示题目处于"待人工审核"状态
db.version(11).stores({
  categories: '&id, name, createdAt',
  topics: '&id, categoryId, name, createdAt',
  chapters: '&id, categoryId, topicId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  wrongAnswers: '&id, categoryId, unitId, chapterId, cardId, questionType, createdAt',
  testQuestions: '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId, pendingReview',
  testRecords: '&id, categoryId, unitId, questionId, testSessionId, userId, testType, createdAt',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  cardStatus: '&id, cardId, categoryId, chapterId, status, updatedAt, mode',
  bookmarks: '&id, cardId, createdAt',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
  linkGenerationRuns: '&id, categoryId, mode, createdAt',
}).upgrade(async tx => {
  // v10→v11 迁移：为现有 link_test 类型题目预设 pendingReview=false，确保字段存在
  try {
    const tqTable = tx.table('testQuestions')
    const linkQs = await tqTable.where('testType').equals('link_test').toArray()
    for (const q of linkQs) {
      await tqTable.update(q.id, { pendingReview: q.pendingReview === true ? true : false })
    }
  } catch (_) { /* 忽略：如果表尚未存在则无需迁移 */ }
})

// v12 升级：testRecords 增加 parentRecordId / redoCount 索引，支持"重做溯源"与"重做历史"查询
db.version(12).stores({
  categories: '&id, name, createdAt',
  topics: '&id, categoryId, name, createdAt',
  chapters: '&id, categoryId, topicId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  wrongAnswers: '&id, categoryId, unitId, chapterId, cardId, questionType, createdAt',
  testQuestions: '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId, pendingReview',
  testRecords:
    '&id, categoryId, unitId, questionId, testSessionId, userId, testType, parentRecordId, redoCount, createdAt',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  cardStatus: '&id, cardId, categoryId, chapterId, status, updatedAt, mode',
  bookmarks: '&id, cardId, createdAt',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
  linkGenerationRuns: '&id, categoryId, mode, createdAt',
}).upgrade(async tx => {
  // v11→v12 迁移：为历史记录填充 parentRecordId=null 与 redoCount=0，确保索引字段存在
  try {
    const trTable = tx.table('testRecords')
    const all = await trTable.toArray()
    for (const r of all) {
      const patch = {}
      if (r.parentRecordId === undefined) patch.parentRecordId = null
      if (r.redoCount === undefined || isNaN(Number(r.redoCount))) patch.redoCount = 0
      if (Object.keys(patch).length > 0) {
        await trTable.update(r.id, patch)
      }
    }
  } catch (_) { /* 忽略：如果表尚未存在则无需迁移 */ }
})

// v13 升级：新增 drafts 表（悬浮窗快速录入草稿）
// 字段说明：
//   id - 主键（generateId 生成）
//   content - 原始输入文本
//   categoryId / chapterId / unitId - 归属目标（unitId 可空，表示未指定单元）
//   source - 来源：'floating'（悬浮窗）/ 'manual'（手动）
//   templateType - 使用的模板类型（可空）
//   status - 状态：'pending'（待生成）/ 'generating'（生成中）/ 'done'（已生成）/ 'failed'（失败）
//   retryCount - 失败重试次数（最大3次）
//   errorMessage - 失败时的错误信息
//   createdAt - 创建时间戳
//   generatedAt - 生成完成时间戳
db.version(13).stores({
  categories: '&id, name, createdAt',
  topics: '&id, categoryId, name, createdAt',
  chapters: '&id, categoryId, topicId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  wrongAnswers: '&id, categoryId, unitId, chapterId, cardId, questionType, createdAt',
  testQuestions: '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId, pendingReview',
  testRecords:
    '&id, categoryId, unitId, questionId, testSessionId, userId, testType, parentRecordId, redoCount, createdAt',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  cardStatus: '&id, cardId, categoryId, chapterId, status, updatedAt, mode',
  bookmarks: '&id, cardId, createdAt',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
  linkGenerationRuns: '&id, categoryId, mode, createdAt',
  // v13 新增
  drafts: '&id, categoryId, chapterId, unitId, status, retryCount, createdAt',
})

// v14 升级：新增 knowledgeTree 单表（替代 categories、topics、chapters、units、cards、drafts）
// 字段说明：
//   id - 主键（generateId 生成）
//   parentId - 父节点 ID（分类的 parentId 为 NULL）
//   level - 层级类型：category / topic / chapter / unit / knowledge_point / card
//   name - 名称（分类/主题/章节/单元/知识点名称）
//   categoryId / topicId / chapterId / unitId / knowledgePointId - 冗余字段（便于快速查询）
//   purpose / description / color / icon - 分类专用字段
//   isProcessed / position - 主题/章节/单元专用字段
//   content - 知识点内容
//   front / back / hint / explanation / type / options / answerBlank - 卡片专用字段
//   status / retryCount / source / errorMessage / generatedAt / templateType - 卡片状态和草稿字段
//   order - 同级排序
//   userId / createdAt / updatedAt - 通用字段
db.version(14).stores({
  categories: '&id, name, createdAt',
  topics: '&id, categoryId, name, createdAt',
  chapters: '&id, categoryId, topicId, name, createdAt, order',
  units: '&id, categoryId, chapterId, name, createdAt, order',
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  wrongAnswers: '&id, categoryId, unitId, chapterId, cardId, questionType, createdAt',
  testQuestions: '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId, pendingReview',
  testRecords:
    '&id, categoryId, unitId, questionId, testSessionId, userId, testType, parentRecordId, redoCount, createdAt',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  cardStatus: '&id, cardId, categoryId, chapterId, status, updatedAt, mode',
  bookmarks: '&id, cardId, createdAt',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
  linkGenerationRuns: '&id, categoryId, mode, createdAt',
  drafts: '&id, categoryId, chapterId, unitId, status, retryCount, createdAt',
  // v14 新增
  knowledgeTree: '&id, parentId, level, categoryId, topicId, chapterId, unitId, userId, createdAt, updatedAt',
}).upgrade(async (tx) => {
  const now = Date.now()

  const categories = await tx.categories.toArray()
  const topics = await tx.topics.toArray()
  const chapters = await tx.chapters.toArray()
  const units = await tx.units.toArray()
  const cards = await tx.cards.toArray()
  const drafts = await tx.drafts.toArray()

  const knowledgeTreeRecords = []

  for (const cat of categories) {
    knowledgeTreeRecords.push({
      id: cat.id,
      parentId: null,
      level: 'category',
      name: cat.name,
      categoryId: cat.id,
      topicId: null,
      chapterId: null,
      unitId: null,
      knowledgePointId: null,
      purpose: cat.purpose || null,
      description: cat.description || null,
      color: cat.color || '#3b82f6',
      icon: cat.icon || '📚',
      isProcessed: false,
      position: 0,
      content: null,
      front: null,
      back: null,
      hint: null,
      explanation: null,
      type: 'short',
      options: null,
      answerBlank: null,
      status: 'active',
      retryCount: 0,
      source: 'manual',
      errorMessage: null,
      generatedAt: null,
      templateType: null,
      order: 0,
      userId: cat.userId || '',
      createdAt: cat.createdAt || now,
      updatedAt: cat.updatedAt || now,
    })
  }

  for (const topic of topics) {
    knowledgeTreeRecords.push({
      id: topic.id,
      parentId: topic.categoryId,
      level: 'topic',
      name: topic.name,
      categoryId: topic.categoryId,
      topicId: topic.id,
      chapterId: null,
      unitId: null,
      knowledgePointId: null,
      purpose: null,
      description: null,
      color: '#3b82f6',
      icon: '📚',
      isProcessed: topic.isProcessed || false,
      position: 0,
      content: null,
      front: null,
      back: null,
      hint: null,
      explanation: null,
      type: 'short',
      options: null,
      answerBlank: null,
      status: 'active',
      retryCount: 0,
      source: 'manual',
      errorMessage: null,
      generatedAt: null,
      templateType: null,
      order: 0,
      userId: topic.userId || '',
      createdAt: topic.createdAt || now,
      updatedAt: topic.updatedAt || now,
    })
  }

  for (const chapter of chapters) {
    knowledgeTreeRecords.push({
      id: chapter.id,
      parentId: chapter.topicId || chapter.categoryId,
      level: 'chapter',
      name: chapter.name,
      categoryId: chapter.categoryId,
      topicId: chapter.topicId || null,
      chapterId: chapter.id,
      unitId: null,
      knowledgePointId: null,
      purpose: null,
      description: chapter.description || null,
      color: '#3b82f6',
      icon: '📚',
      isProcessed: false,
      position: chapter.order || 0,
      content: null,
      front: null,
      back: null,
      hint: null,
      explanation: null,
      type: 'short',
      options: null,
      answerBlank: null,
      status: 'active',
      retryCount: 0,
      source: 'manual',
      errorMessage: null,
      generatedAt: null,
      templateType: null,
      order: chapter.order || 0,
      userId: chapter.userId || '',
      createdAt: chapter.createdAt || now,
      updatedAt: chapter.updatedAt || now,
    })
  }

  for (const unit of units) {
    knowledgeTreeRecords.push({
      id: unit.id,
      parentId: unit.chapterId || unit.categoryId,
      level: 'unit',
      name: unit.name,
      categoryId: unit.categoryId,
      topicId: null,
      chapterId: unit.chapterId || null,
      unitId: unit.id,
      knowledgePointId: null,
      purpose: null,
      description: unit.description || null,
      color: '#3b82f6',
      icon: '📚',
      isProcessed: unit.isProcessed || false,
      position: unit.order || 0,
      content: null,
      front: null,
      back: null,
      hint: null,
      explanation: null,
      type: 'short',
      options: null,
      answerBlank: null,
      status: 'active',
      retryCount: 0,
      source: 'manual',
      errorMessage: null,
      generatedAt: null,
      templateType: null,
      order: unit.order || 0,
      userId: unit.userId || '',
      createdAt: unit.createdAt || now,
      updatedAt: unit.updatedAt || now,
    })
  }

  for (const card of cards) {
    knowledgeTreeRecords.push({
      id: card.id,
      parentId: card.unitId || card.chapterId || card.categoryId,
      level: 'card',
      name: null,
      categoryId: card.categoryId,
      topicId: null,
      chapterId: card.chapterId || null,
      unitId: card.unitId || null,
      knowledgePointId: null,
      purpose: null,
      description: null,
      color: '#3b82f6',
      icon: '📚',
      isProcessed: false,
      position: 0,
      content: card.knowledge_point || null,
      front: card.front,
      back: card.back || null,
      hint: card.hint || null,
      explanation: card.explanation || null,
      type: card.type || 'short',
      options: card.options || null,
      answerBlank: card.answerBlank || null,
      status: 'active',
      retryCount: 0,
      source: 'manual',
      errorMessage: null,
      generatedAt: null,
      templateType: null,
      order: card.order || 0,
      userId: card.userId || '',
      createdAt: card.createdAt || now,
      updatedAt: card.updatedAt || now,
    })
  }

  for (const draft of drafts) {
    knowledgeTreeRecords.push({
      id: draft.id,
      parentId: draft.unitId || draft.chapterId || draft.categoryId,
      level: 'card',
      name: null,
      categoryId: draft.categoryId,
      topicId: null,
      chapterId: draft.chapterId || null,
      unitId: draft.unitId || null,
      knowledgePointId: null,
      purpose: null,
      description: null,
      color: '#3b82f6',
      icon: '📚',
      isProcessed: false,
      position: 0,
      content: draft.content || null,
      front: null,
      back: null,
      hint: null,
      explanation: null,
      type: 'short',
      options: null,
      answerBlank: null,
      status: draft.status || 'pending',
      retryCount: draft.retryCount || 0,
      source: draft.source || 'manual',
      errorMessage: draft.errorMessage || null,
      generatedAt: draft.generatedAt || null,
      templateType: draft.templateType || null,
      order: 0,
      userId: draft.userId || '',
      createdAt: draft.createdAt || now,
      updatedAt: draft.updatedAt || now,
    })
  }

  for (const record of knowledgeTreeRecords) {
    await tx.knowledgeTree.add(record)
  }
})

// v15 升级：删除冗余表 categories、topics、chapters、units，统一使用 knowledgeTree
// 所有分类/主题/章节/单元数据已在 v14 迁移到 knowledgeTree 表中
db.version(15).stores({
  cards: '&id, unitId, categoryId, chapterId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  wrongAnswers: '&id, categoryId, unitId, chapterId, cardId, questionType, createdAt',
  testQuestions: '&id, categoryId, unitId, chapterId, cardId, testType, targetId, [testType+targetId], userId, pendingReview',
  testRecords:
    '&id, categoryId, unitId, questionId, testSessionId, userId, testType, parentRecordId, redoCount, createdAt',
  testSessions: '&id, testType, typeId, userId, isCompleted',
  cardStatus: '&id, cardId, categoryId, chapterId, status, updatedAt, mode',
  bookmarks: '&id, cardId, createdAt',
  reviewHistory: '&id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode',
  studyPlans: '&id, categoryId, chapterId, dailyReviewLimit, dailyNewLimit, priority, createdAt, updatedAt',
  linkGenerationRuns: '&id, categoryId, mode, createdAt',
  drafts: '&id, categoryId, chapterId, unitId, status, retryCount, createdAt',
  knowledgeTree: '&id, parentId, level, categoryId, topicId, chapterId, unitId, userId, createdAt, updatedAt',
}).upgrade(async (tx) => {
  try { await tx.table('categories').clear() } catch (_) {}
  try { await tx.table('topics').clear() } catch (_) {}
  try { await tx.table('chapters').clear() } catch (_) {}
  try { await tx.table('units').clear() } catch (_) {}
})

// —— 用原生 IndexedDB 读取旧库，避开 Dexie 主键校验限制 ——
// 策略：用同名校名+版本号 0 打开旧库（versionchange 只删不创），
// 然后在同事务中读取所有表数据，这样即使旧库 schema 与新库不兼容也能读到数据。
function readAllFromOldDbRaw(dbName) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName)
      req.onerror = () => resolve({ categories: [], units: [], cards: [], cardStatus: [], bookmarks: [], wrongAnswers: [] })
      req.onsuccess = () => {
        const idb = req.result
        const result = {
          categories: [], units: [], cards: [],
          cardStatus: [], bookmarks: [], wrongAnswers: [],
        }
        const storeNames = Array.from(idb.objectStoreNames || [])
        if (storeNames.length === 0) { idb.close(); resolve(result); return }
        const tx = idb.transaction(storeNames, 'readonly')
        let pending = storeNames.length
        storeNames.forEach((sn) => {
          const outKey = {
            categories: 'categories', units: 'units', cards: 'cards',
            cardStatus: 'cardStatus', bookmarks: 'bookmarks', wrongAnswers: 'wrongAnswers',
          }[sn] || sn
          if (!(outKey in result)) result[outKey] = []
          try {
            const store = tx.objectStore(sn)
            const cur = store.openCursor()
            cur.onsuccess = (e) => {
              const c = e.target.result
              if (c) { result[outKey].push(c.value); c.continue() }
              else { pending--; if (pending <= 0) { idb.close(); resolve(result) } }
            }
            cur.onerror = () => { pending--; if (pending <= 0) { idb.close(); resolve(result) } }
          } catch (_) { pending--; if (pending <= 0) { idb.close(); resolve(result) } }
        })
      }
    } catch (_) { resolve({ categories: [], units: [], cards: [], cardStatus: [], bookmarks: [], wrongAnswers: [] }) }
  })
}

// —— 自动迁移：从旧库拷贝数据到新库 ——
// 确保不管旧库处于什么状态，ensureDbReady() 最终都会：
//   1. 把旧库数据安全迁移到新库（或旧库为空/不存在则跳过）
//   2. 删除旧库
//   3. 新库可正常使用
async function migrateFromOldDbIfNeeded() {
  try {
    // Step 1: 检查新库是否已有数据（已迁移过 → 直接返回）
    try {
      const count = await db.knowledgeTree.count()
      if (count > 0) {
        return
      }
    } catch (_) { /* 新库尚未初始化，继续 */ }

    // Step 2: 用原生 IndexedDB 读取旧库（即使 schema 不兼容也能读到数据）
    const allData = await readAllFromOldDbRaw(OLD_DB_NAME)
    const totalCount =
      (allData.categories?.length || 0) +
      (allData.units?.length || 0) +
      (allData.cards?.length || 0)

    if (totalCount === 0) {
      // 旧库不存在或为空 → 直接删除旧库，新库留空（用户从零开始）
      try { await Dexie.delete(OLD_DB_NAME) } catch (_) {}
      return
    }

    // Step 3: 把旧库数据写入新库（统一使用 knowledgeTree）
    const ensureId = (r) => {
      if (!r) return null
      if (!r.id) r.id = generateId()
      return r
    }
    const categories = (allData.categories || []).map(ensureId).filter(Boolean)
    const units = (allData.units || []).map(ensureId).filter(Boolean)
    const cards = (allData.cards || []).map(ensureId).filter(Boolean)
    const cardStatuses = (allData.cardStatus || []).map(ensureId).filter(Boolean)
    const bookmarks = (allData.bookmarks || []).map(ensureId).filter(Boolean)
    const wrongAnswers = (allData.wrongAnswers || []).map(ensureId).filter(Boolean)

    const now = Date.now()
    const knowledgeTreeRecords = []

    for (const cat of categories) {
      knowledgeTreeRecords.push({
        id: cat.id,
        parentId: null,
        level: 'category',
        name: cat.name,
        categoryId: cat.id,
        topicId: null,
        chapterId: null,
        unitId: null,
        knowledgePointId: null,
        purpose: cat.purpose || null,
        description: cat.description || null,
        color: cat.color || '#3b82f6',
        icon: cat.icon || '📚',
        isProcessed: false,
        position: 0,
        content: null,
        front: null,
        back: null,
        hint: null,
        explanation: null,
        type: 'short',
        options: null,
        answerBlank: null,
        status: 'active',
        retryCount: 0,
        source: 'manual',
        errorMessage: null,
        generatedAt: null,
        templateType: null,
        order: 0,
        userId: cat.userId || '',
        createdAt: cat.createdAt || now,
        updatedAt: cat.updatedAt || now,
      })
    }

    for (const unit of units) {
      knowledgeTreeRecords.push({
        id: unit.id,
        parentId: unit.chapterId || unit.categoryId,
        level: 'unit',
        name: unit.name,
        categoryId: unit.categoryId,
        topicId: null,
        chapterId: unit.chapterId || null,
        unitId: unit.id,
        knowledgePointId: null,
        purpose: null,
        description: unit.description || null,
        color: '#3b82f6',
        icon: '📚',
        isProcessed: false,
        position: unit.order || 0,
        content: null,
        front: null,
        back: null,
        hint: null,
        explanation: null,
        type: 'short',
        options: null,
        answerBlank: null,
        status: 'active',
        retryCount: 0,
        source: 'manual',
        errorMessage: null,
        generatedAt: null,
        templateType: null,
        order: unit.order || 0,
        userId: unit.userId || '',
        createdAt: unit.createdAt || now,
        updatedAt: unit.updatedAt || now,
      })
    }

    try {
      await db.transaction(
        'rw',
        db.knowledgeTree, db.cards, db.cardStatus, db.bookmarks, db.wrongAnswers,
        async () => {
          if (knowledgeTreeRecords.length) await db.knowledgeTree.bulkAdd(knowledgeTreeRecords)
          if (cards.length) await db.cards.bulkAdd(cards)
          if (cardStatuses.length) await db.cardStatus.bulkAdd(cardStatuses)
          if (bookmarks.length) await db.bookmarks.bulkAdd(bookmarks)
          if (wrongAnswers.length) await db.wrongAnswers.bulkAdd(wrongAnswers)
        },
      )
    } catch (writeErr) {
      console.warn('[db] 写入新库失败：', writeErr)
      // 写入失败时清除新库（避免残留半写入状态），让用户可重试
      try { await db.delete() } catch (_) {}
    }

    // Step 4: 删除旧库（迁移成功或部分成功都删除）
    try { await Dexie.delete(OLD_DB_NAME) } catch (_) {}
  } catch (err) {
    // 任何异常都不应该让应用崩溃，降级为删除所有库→重建新库（数据丢失但功能可用）
    console.warn('[db] 迁移异常，已重置数据库：', err?.message || err)
    try { await Dexie.delete(OLD_DB_NAME) } catch (_) {}
    try { await db.delete() } catch (_) {}
  }
}

// —— 暴露迁移函数（由 AppContext.loadCategories 调用，保证首次访问前完成）——
export function ensureDbReady() {
  return migrateFromOldDbIfNeeded()
}

export async function getCategories() { 
  return db.knowledgeTree.where('level').equals('category').sortBy('createdAt') 
}
export async function getCategory(id) { 
  if (!id) return null
  return db.knowledgeTree.where('level').equals('category').and(n => n.id === id).first()
}
export async function getCategoryById(id) { return getCategory(id) }
export async function getUnit(id) { 
  if (!id) return null
  return db.knowledgeTree.where('level').equals('unit').and(n => n.id === id).first()
}
export async function addCategory(name) { 
  const id = generateId()
  const now = Date.now()
  const c = { id, name, parentId: null, level: 'category', categoryId: id, createdAt: now, updatedAt: now }
  await db.knowledgeTree.add(c)
  return c 
}
export async function updateCategory(id, name) { 
  await db.knowledgeTree.update(id, { name, updatedAt: Date.now() }) 
}
export async function updateCategoryPurpose(id, purpose) { 
  await db.knowledgeTree.update(id, { purpose: purpose || '', updatedAt: Date.now() }) 
}
export async function getCategoryPurpose(id) { 
  const cat = await db.knowledgeTree.where('level').equals('category').and(n => n.id === id).first()
  return cat?.purpose || '' 
}

async function deleteTestRecordsForQuestions(questionIds) {
  if (!questionIds || questionIds.length === 0) return 0
  let deleted = 0
  for (const qid of questionIds) {
    deleted += await db.testRecords.where('questionId').equals(qid).delete()
  }
  return deleted
}

async function deleteTestRecordsByScope({ categoryId = null, unitId = null, sessionIds = [] } = {}) {
  let deleted = 0
  if (categoryId != null) deleted += await db.testRecords.where('categoryId').equals(categoryId).delete()
  if (unitId != null) deleted += await db.testRecords.where('unitId').equals(unitId).delete()
  for (const sid of sessionIds || []) {
    deleted += await db.testRecords.where('testSessionId').equals(sid).delete()
  }
  return deleted
}

export async function deleteCategory(id) {
  const treeNodes = await db.knowledgeTree.where('categoryId').equals(id).toArray();
  const unitNodes = treeNodes.filter(n => n.level === 'unit');
  const uids = unitNodes.map(u => u.id);
  const allNodeIds = treeNodes.map(n => n.id);
  
  await db.transaction('rw',
    db.knowledgeTree, db.cards, db.cardStatus, db.bookmarks, db.wrongAnswers,
    db.testQuestions, db.testRecords, db.testSessions,
    db.reviewHistory, db.studyPlans, db.linkGenerationRuns,
    async () => {
      const cids = [];
      for (const uid of uids) {
        const cs = await db.cards.where('unitId').equals(uid).toArray();
        cids.push(...cs.map(c => c.id));
        await db.cards.where('unitId').equals(uid).delete();
      }
      await db.knowledgeTree.where('categoryId').equals(id).delete();
      await db.cardStatus.where('categoryId').equals(id).delete();
      await db.wrongAnswers.where('categoryId').equals(id).delete();
      for (const cid of cids) await db.bookmarks.where('cardId').equals(cid).delete();
      const tqsAll = await db.testQuestions.where('categoryId').equals(id).toArray();
      await db.testQuestions.where('categoryId').equals(id).delete();
      const sessions = await db.testSessions.where('typeId').equals(id).toArray();
      await deleteTestRecordsForQuestions(tqsAll.map(tq => tq.id));
      await deleteTestRecordsByScope({ categoryId: id, sessionIds: sessions.map(s => s.id) });
      await db.testSessions.where('typeId').equals(id).delete();
      await db.reviewHistory.where('categoryId').equals(id).delete();
      await db.studyPlans.where('categoryId').equals(id).delete();
      if (db.linkGenerationRuns) await db.linkGenerationRuns.where('categoryId').equals(id).delete();
    })
}
export async function getUnitsByCategory(cid) { 
  return db.knowledgeTree.where('level').equals('unit').and(n => n.categoryId === cid).sortBy('order') 
}
export async function addUnits(cid, list) {
  const ex = await db.knowledgeTree.where('level').equals('unit').and(n => n.categoryId === cid).count()
  const now = Date.now()
  const units = list.map((u, i) => ({
    id: generateId(),
    parentId: u.chapterId || null,
    level: 'unit',
    categoryId: cid,
    chapterId: u.chapterId || null,
    name: u.name,
    createdAt: now,
    updatedAt: now,
    order: ex + i,
  }))
  const cards = []
  for (let i = 0; i < list.length; i++) {
    cards.push(...(list[i].cards || []).map((c, idx) => ({
      id: generateId(),
      unitId: units[i].id,
      categoryId: cid,
      chapterId: c.chapterId || units[i].chapterId || null,
      knowledge_point: c.knowledge_point || null,
      front: c.front,
      back: c.back,
      createdAt: now,
      order: idx,
    })))
  }
  await db.transaction('rw', db.knowledgeTree, db.cards, db.cardStatus, db.bookmarks, async () => {
    await db.knowledgeTree.bulkAdd(units)
    if (cards.length > 0) await db.cards.bulkAdd(cards)
  })
  return units
}
export async function getCardsByUnit(uid) { return db.cards.where('unitId').equals(uid).sortBy('order') }
export async function getCardCountByCategory(cid) {
  const units = await db.knowledgeTree.where('level').equals('unit').and(n => n.categoryId === cid).toArray()
  let n = 0
  for (const u of units) n += await db.cards.where('unitId').equals(u.id).count()

  if (n === 0) {
    n = await db.cards.where('categoryId').equals(cid).count()
  }

  return n
}
export async function getAllCardsByCategory(cid) {
  const units = await db.knowledgeTree.where('level').equals('unit').and(n => n.categoryId === cid).sortBy('order')
  const unitIdSet = new Set(units.map(u => u.id))
  const unitNameMap = {}
  units.forEach(u => { unitNameMap[u.id] = u.name })

  const all = []
  for (const u of units) {
    const cs = await db.cards.where('unitId').equals(u.id).sortBy('order')
    all.push(...cs.map(c => ({ ...c, unitName: u.name })))
  }

  if (all.length === 0) {
    const allCards = await db.cards.toArray()
    for (const c of allCards) {
      if (c.categoryId === cid) {
        const unitName = unitNameMap[c.unitId] || ''
        all.push({ ...c, unitName })
      }
    }
  }

  return all
}

/**
 * 获取本分类所有唯一的知识点（用于知识点去重）
 * @param {number|string} cid - 分类ID
 * @returns {Promise<string[]>} 唯一知识点数组
 */
export async function getExistingKnowledgePointsByCategory(cid) {
  const cards = await getAllCardsByCategory(cid)
  const kpSet = new Set()
  for (const card of cards) {
    const kp = card.knowledge_point
    if (kp && typeof kp === 'string' && kp.trim()) {
      kpSet.add(kp.trim())
    }
  }
  return Array.from(kpSet)
}

// 云端下载/导入后修复卡片与分类、单元、章节的关联。
// 场景：账号页直接统计 db.cards.count() 有数量，但记录页/背诵页按 categoryId + unitId + chapterId 读取为空。
export async function repairCardRelationsAfterImport(options = {}) {
  const recoveryUnitName = options.recoveryUnitName || '云端下载卡片'
  const recoveryCategoryName = options.recoveryCategoryName || '云端下载分类'
  const knowledgeTree = await db.knowledgeTree.toArray()
  const cards = await db.cards.toArray()

  if (cards.length === 0) {
    return { repairedCards: 0, createdUnits: 0, createdCategories: 0, skippedCards: 0 }
  }

  const categories = knowledgeTree.filter(n => n.level === 'category')
  const chapters = knowledgeTree.filter(n => n.level === 'chapter')
  const units = knowledgeTree.filter(n => n.level === 'unit')

  const categoryById = new Map(categories.map(c => [c.id, c]))
  const chapterById = new Map(chapters.map(ch => [ch.id, ch]))
  const unitById = new Map(units.map(u => [u.id, u]))
  const unitsByCategory = new Map()
  const chaptersByCategory = new Map()
  for (const chapter of chapters) {
    if (!chaptersByCategory.has(chapter.categoryId)) chaptersByCategory.set(chapter.categoryId, [])
    chaptersByCategory.get(chapter.categoryId).push(chapter)
  }
  for (const unit of units) {
    if (!unitsByCategory.has(unit.categoryId)) unitsByCategory.set(unit.categoryId, [])
    unitsByCategory.get(unit.categoryId).push(unit)
  }
  for (const list of unitsByCategory.values()) {
    list.sort((a, b) => (a.order || 0) - (b.order || 0))
  }
  for (const list of chaptersByCategory.values()) {
    list.sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  let createdUnits = 0
  let createdCategories = 0
  let repairedCards = 0
  let skippedCards = 0
  const now = Date.now()

  const ensureRecoveryCategory = async () => {
    const existing = Array.from(categoryById.values()).find(c => c.name === recoveryCategoryName)
    if (existing) return existing
    const category = {
      id: generateId(),
      parentId: null,
      level: 'category',
      name: recoveryCategoryName,
      categoryId: null,
      topicId: null,
      chapterId: null,
      unitId: null,
      createdAt: now,
      updatedAt: now,
      order: 0,
    }
    category.categoryId = category.id
    await db.knowledgeTree.add(category)
    categoryById.set(category.id, category)
    createdCategories += 1
    return category
  }

  const ensureChapterForCategory = async (categoryId) => {
    if (!categoryById.has(categoryId)) return null
    const existing = chaptersByCategory.get(categoryId) || []
    if (existing.length > 0) return existing[0]
    const chapter = {
      id: generateId(),
      parentId: categoryId,
      level: 'chapter',
      name: '默认章节',
      categoryId,
      topicId: null,
      chapterId: null,
      unitId: null,
      createdAt: now,
      updatedAt: now,
      order: 0,
    }
    chapter.chapterId = chapter.id
    await db.knowledgeTree.add(chapter)
    chapterById.set(chapter.id, chapter)
    chaptersByCategory.set(categoryId, [chapter])
    return chapter
  }

  const ensureUnitForCategory = async (categoryId, preferredUnitId = '', chapterId = '') => {
    if (!categoryById.has(categoryId)) return null
    const existing = unitsByCategory.get(categoryId) || []
    if (preferredUnitId && unitById.has(preferredUnitId)) return unitById.get(preferredUnitId)
    if (preferredUnitId) {
      const unit = {
        id: preferredUnitId,
        parentId: chapterId || categoryId,
        level: 'unit',
        name: recoveryUnitName,
        categoryId,
        chapterId: chapterId || null,
        unitId: null,
        createdAt: now,
        updatedAt: now,
        order: existing.length,
      }
      unit.unitId = unit.id
      await db.knowledgeTree.add(unit)
      unitById.set(unit.id, unit)
      unitsByCategory.set(categoryId, [...existing, unit])
      createdUnits += 1
      return unit
    }
    if (existing.length > 0) return existing[0]

    const unit = {
      id: generateId(),
      parentId: chapterId || categoryId,
      level: 'unit',
      name: recoveryUnitName,
      categoryId,
      chapterId: chapterId || null,
      unitId: null,
      createdAt: now,
      updatedAt: now,
      order: 0,
    }
    unit.unitId = unit.id
    await db.knowledgeTree.add(unit)
    unitById.set(unit.id, unit)
    unitsByCategory.set(categoryId, [unit])
    createdUnits += 1
    return unit
  }

  for (const card of cards) {
    const changes = {}
    let unit = card.unitId ? unitById.get(card.unitId) : null
    let categoryId = card.categoryId || ''
    let chapterId = card.chapterId || ''

    if (unit) {
      categoryId = unit.categoryId
      // 如果单元有 chapterId，优先使用
      if (unit.chapterId) chapterId = unit.chapterId
    } else if (categoryId && categoryById.has(categoryId)) {
      unit = await ensureUnitForCategory(categoryId)
    } else if (categories.length === 1) {
      categoryId = categories[0].id
      unit = await ensureUnitForCategory(categoryId)
    } else {
      const recoveryCategory = await ensureRecoveryCategory()
      categoryId = recoveryCategory.id
      unit = await ensureUnitForCategory(categoryId, card.unitId || '')
    }

    if (!unit) {
      skippedCards += 1
      continue
    }

    // 修复 chapterId：如果单元有 chapterId 就使用，否则为该分类查找/创建章节
    if (!chapterId && unit.chapterId) {
      chapterId = unit.chapterId
    }
    if (!chapterId && categoryId) {
      const chapter = await ensureChapterForCategory(categoryId)
      if (chapter) chapterId = chapter.id
    }
    // 如果卡片有 chapterId 但单元没有，同步更新单元
    if (chapterId && unit && !unit.chapterId) {
      await db.knowledgeTree.update(unit.id, { chapterId, updatedAt: Date.now() })
      unit.chapterId = chapterId
      unitById.set(unit.id, unit)
    }

    if (card.unitId !== unit.id) changes.unitId = unit.id
    if (card.categoryId !== unit.categoryId) changes.categoryId = unit.categoryId
    if (chapterId && card.chapterId !== chapterId) changes.chapterId = chapterId

    if (Object.keys(changes).length > 0) {
      await db.cards.update(card.id, changes)
      repairedCards += 1
    }
  }

  // 修复关联表中的 chapterId（基于卡片的最新 chapterId）
  const cardMap = new Map()
  const updatedCards = await db.cards.toArray()
  for (const card of updatedCards) {
    cardMap.set(card.id, card)
  }

  // wrongAnswers
  const wrongAnswers = await db.wrongAnswers.toArray()
  for (const wa of wrongAnswers) {
    if (wa.cardId && cardMap.has(wa.cardId)) {
      const card = cardMap.get(wa.cardId)
      const updates = {}
      if (card.chapterId && wa.chapterId !== card.chapterId) updates.chapterId = card.chapterId
      if (card.categoryId && wa.categoryId !== card.categoryId) updates.categoryId = card.categoryId
      if (card.unitId && wa.unitId !== card.unitId) updates.unitId = card.unitId
      if (Object.keys(updates).length > 0) {
        await db.wrongAnswers.update(wa.id, updates)
      }
    }
  }

  // cardStatus
  const cardStatuses = await db.cardStatus.toArray()
  for (const cs of cardStatuses) {
    if (cs.cardId && cardMap.has(cs.cardId)) {
      const card = cardMap.get(cs.cardId)
      const updates = {}
      if (card.chapterId && cs.chapterId !== card.chapterId) updates.chapterId = card.chapterId
      if (card.categoryId && cs.categoryId !== card.categoryId) updates.categoryId = card.categoryId
      if (Object.keys(updates).length > 0) {
        await db.cardStatus.update(cs.id, updates)
      }
    }
  }

  // testQuestions
  const testQuestions = await db.testQuestions.toArray()
  for (const tq of testQuestions) {
    if (tq.cardId && cardMap.has(tq.cardId)) {
      const card = cardMap.get(tq.cardId)
      const updates = {}
      if (card.chapterId && tq.chapterId !== card.chapterId) updates.chapterId = card.chapterId
      if (card.categoryId && tq.categoryId !== card.categoryId) updates.categoryId = card.categoryId
      if (card.unitId && tq.unitId !== card.unitId) updates.unitId = card.unitId
      if (Object.keys(updates).length > 0) {
        await db.testQuestions.update(tq.id, updates)
      }
    }
  }

  // testRecords
  // 注意：tr.questionId 指向 testQuestion.id（不是 cardId），需要先建立 questionId -> cardId 映射
  const allTestQuestions = await db.testQuestions.toArray()
  const cardIdByQuestionId = new Map()
  for (const tq of allTestQuestions) {
    if (tq.id && tq.cardId) cardIdByQuestionId.set(tq.id, tq.cardId)
  }
  const testRecords = await db.testRecords.toArray()
  for (const tr of testRecords) {
    if (!tr.questionId) continue
    const cardId = cardIdByQuestionId.get(tr.questionId)
    if (!cardId || !cardMap.has(cardId)) continue
    const card = cardMap.get(cardId)
    const updates = {}
    if (card.chapterId && tr.chapterId !== card.chapterId) updates.chapterId = card.chapterId
    if (card.categoryId && tr.categoryId !== card.categoryId) updates.categoryId = card.categoryId
    if (card.unitId && tr.unitId !== card.unitId) updates.unitId = card.unitId
    if (Object.keys(updates).length > 0) {
      await db.testRecords.update(tr.id, updates)
    }
  }

  return { repairedCards, createdUnits, createdCategories, skippedCards }
}

// 清理重复的「使用指南」分类
// 场景：新设备本地种子数据与云端同步的「使用指南」冲突，导致出现两个同名分类
// 策略：保留最早创建的，将其他同名分类的卡片/单元迁移后删除
export async function deduplicateUsageGuide() {
  try {
    const knowledgeTree = await db.knowledgeTree.toArray()
    const allCategories = knowledgeTree.filter(n => n.level === 'category')
    const guideCategories = allCategories.filter(c => c.name === '使用指南')

    if (guideCategories.length <= 1) {
      return { removed: 0, mergedCards: 0 }
    }

    guideCategories.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    const keepCategory = guideCategories[0]
    const removeCategories = guideCategories.slice(1)

    let mergedCards = 0
    const now = Date.now()

    for (const removeCat of removeCategories) {
      const units = knowledgeTree.filter(n => n.level === 'unit' && n.categoryId === removeCat.id)
      for (const unit of units) {
        await db.knowledgeTree.update(unit.id, { categoryId: keepCategory.id, updatedAt: now })
      }

      const cards = await db.cards.where({ categoryId: removeCat.id }).toArray()
      for (const card of cards) {
        await db.cards.update(card.id, { categoryId: keepCategory.id })
        mergedCards++
      }

      const statuses = await db.cardStatus.where({ categoryId: removeCat.id }).toArray()
      for (const s of statuses) {
        await db.cardStatus.update(s.id, { categoryId: keepCategory.id })
      }

      const wrongAnswers = await db.wrongAnswers.where({ categoryId: removeCat.id }).toArray()
      for (const wa of wrongAnswers) {
        await db.wrongAnswers.update(wa.id, { categoryId: keepCategory.id })
      }

      await db.knowledgeTree.delete(removeCat.id)
    }

    if (mergedCards > 0) {
    }

    return { removed: removeCategories.length, mergedCards }
  } catch (e) {
    console.warn('[db] deduplicateUsageGuide 失败:', e)
    return { removed: 0, mergedCards: 0 }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 卡片状态更新函数：根据 mode 区分行为策略
 * - ebbinghaus：完整 SM-2（长期计划权威），保留原 userOverride 值
 * - sequential/active mastered：只改 status，不改 SM-2 参数，清除 userOverride
 * - sequential/active review：只改 status，不修改 SM-2 参数（隔离短期/长期计划），设置 userOverride=true
 * - sequential/active learning：只改 status，设置 userOverride=true
 * - weak：保持既有区间调整逻辑
 * - test：只改 status/reviewCount；若 userOverride=true 且新状态 mastered 则跳过
 */
export async function setCardStatus(cardId, categoryId, status, opts = {}) {
  const { existingRecord = null, mode = 'sequential', chapterId = '' } = opts
  const ex = existingRecord || await db.cardStatus.where({ cardId, categoryId }).first()
  const now = Date.now()
  const wasMastered = status === 'mastered'

  if (ex) {
    // === 已有记录，根据模式决定更新策略 ===
    const newReviewCount = (ex.reviewCount || 0) + 1

    // ======= 核心模式行为开始 =======
    if (mode === 'ebbinghaus') {
      const sm2 = applySM2WithDelay(ex, wasMastered, now)
      const update = {
        status,
        updatedAt: now,
        reviewCount: newReviewCount,
        ...sm2,
        mode: 'ebbinghaus',
        // 保留原 userOverride 值，不再强制清除
        userOverride: ex.userOverride || false,
        chapterId: chapterId || ex.chapterId || '',
      }
      await db.cardStatus.update(ex.id, update)
      await addReviewHistory({ cardId, categoryId, chapterId: chapterId || ex.chapterId || '', wasMastered, mode }).catch(err =>
        console.warn('[db] addReviewHistory failed:', err)
      )
      return { ...ex, ...update }
    }

    if (mode === 'sequential' || mode === 'active') {
      let update = { status, updatedAt: now, reviewCount: newReviewCount, mode, chapterId: chapterId || ex.chapterId || '' }
      if (status === 'mastered') {
        // 短期计划已掌握：只改 status，不改 SM-2 参数
        update.userOverride = false
      } else if (status === 'review') {
        // 短期计划待掌握：仅更新 status，不修改 SM-2 参数（隔离短期/长期计划）
        // 设置 userOverride=true 标记用户手动判断
        update.userOverride = true
      } else if (status === 'learning') {
        update.userOverride = true
      } else {
        update.userOverride = false
      }
      await db.cardStatus.update(ex.id, update)
      await addReviewHistory({ cardId, categoryId, chapterId: chapterId || ex.chapterId || '', wasMastered, mode }).catch(err =>
        console.warn('[db] addReviewHistory failed:', err)
      )
      return { ...ex, ...update }
    }

    if (mode === 'weak') {
      // 薄弱模式：保持既有 interval 缩短 / easeFactor 微增逻辑，reps 不变
      let update = { status, updatedAt: now, reviewCount: newReviewCount, mode: 'weak', chapterId: chapterId || ex.chapterId || '' }
      if (wasMastered) {
        const prevInterval = ex.interval || 1
        const prevEase = ex.easeFactor || 2.5
        update.interval = Math.max(1, Math.ceil(prevInterval * 0.8))
        update.easeFactor = Math.min(3.0, +(prevEase + 0.05).toFixed(2))
        update.repetitions = ex.repetitions
        update.lastReviewedAt = now
        update.nextReviewAt = now + update.interval * DAY_MS
      }
      await db.cardStatus.update(ex.id, update)
      await addReviewHistory({ cardId, categoryId, chapterId: chapterId || ex.chapterId || '', wasMastered, mode }).catch(err =>
        console.warn('[db] addReviewHistory failed:', err)
      )
      return { ...ex, ...update }
    }

    if (mode === 'test') {
      // 测试模式：只更新 status 与 reviewCount，绝不改变 SM-2 参数
      // userOverride 保护：若用户已手动设置未掌握（review/learning），测试答对不覆盖
      const currentUserOverride = ex.userOverride === true
      if (currentUserOverride && status === 'mastered') {
        // 保护用户判断：不将 review 覆盖为 mastered
        await addReviewHistory({ cardId, categoryId, chapterId: chapterId || ex.chapterId || '', wasMastered, mode }).catch(err =>
          console.warn('[db] addReviewHistory failed:', err)
        )
        return { ...ex }
      }
      // 答错时：最多设置为 review（保持用户更严重的判断）
      let finalStatus = status
      if (status === 'mastered' && ex.status === 'review') {
        // 如果当前是 review 但 test 模式想改为 mastered，说明用户已标记待掌握
        // 且可能在单元测试中答对，应保持 review 不覆盖
        if (currentUserOverride) finalStatus = ex.status
      }
      const update = {
        status: finalStatus,
        updatedAt: now,
        reviewCount: newReviewCount,
        mode: 'test',
        chapterId: chapterId || ex.chapterId || '',
      }
      await db.cardStatus.update(ex.id, update)
      await addReviewHistory({ cardId, categoryId, chapterId: chapterId || ex.chapterId || '', wasMastered, mode }).catch(err =>
        console.warn('[db] addReviewHistory failed:', err)
      )
      return { ...ex, ...update }
    }

    // 默认行为（同 sequential）
    const defaultUpdate = {
      status,
      updatedAt: now,
      reviewCount: newReviewCount,
      mode: 'sequential',
      userOverride: status === 'review' || status === 'learning' ? true : false,
      chapterId: chapterId || ex.chapterId || '',
    }
    await db.cardStatus.update(ex.id, defaultUpdate)
    await addReviewHistory({ cardId, categoryId, chapterId: chapterId || ex.chapterId || '', wasMastered, mode }).catch(err =>
      console.warn('[db] addReviewHistory failed:', err)
    )
    return { ...ex, ...defaultUpdate }
  } else {
    // === 新记录分支 ===
    const reviewCount = 1
    let base = {
      id: generateId(),
      cardId,
      categoryId,
      chapterId: chapterId || '',
      status,
      updatedAt: now,
      reviewCount,
      mode,
      userOverride: false,
    }

    if (mode === 'ebbinghaus') {
      const sm2 = applySM2WithDelay({}, wasMastered, now)
      base = { ...base, ...sm2, mode: 'ebbinghaus' }
    } else if (mode === 'sequential' || mode === 'active') {
      base.easeFactor = 2.5
      base.interval = 1
      base.repetitions = 0
      base.lastReviewedAt = now
      base.nextReviewAt = now
      base.userOverride = status === 'review' || status === 'learning' ? true : false
    } else if (mode === 'weak') {
      if (wasMastered) {
        base.interval = Math.max(1, Math.ceil(1 * 0.8))
        base.easeFactor = 2.55
        base.repetitions = 0
        base.lastReviewedAt = now
        base.nextReviewAt = now + base.interval * DAY_MS
      } else {
        base.easeFactor = 2.5
        base.interval = 1
        base.repetitions = 0
        base.lastReviewedAt = now
        base.nextReviewAt = now
      }
    } else if (mode === 'test') {
      // test 模式不设置 userOverride（用户手动标记才会设置）
      base.easeFactor = 2.5
      base.interval = 1
      base.repetitions = 0
      base.lastReviewedAt = now
      base.nextReviewAt = now
    } else {
      base.easeFactor = 2.5
      base.interval = 1
      base.repetitions = 0
      base.lastReviewedAt = now
      base.nextReviewAt = now
    }

    await db.cardStatus.add(base)
    await addReviewHistory({ cardId, categoryId, wasMastered, mode }).catch(err =>
      console.warn('[db] addReviewHistory failed:', err)
    )
    return base
  }
}

// 获取完整的卡片状态记录（包含 reviewCount）
export async function getCardStatusById(cardId, categoryId) {
  return db.cardStatus.where({ cardId, categoryId }).first()
}

// 错题本功能 - 添加错误记录（v5 升级：支持 unitId、冗余名称、题干）
// 如果同一张卡在同一个（categoryId, unitId）上已出错，只更新 count 和 lastWrongAt
export async function addWrongAnswer(cardId, categoryId, questionType, extra = {}) {
  // 允许 cardId 为空（题目未关联卡片），但需提供 questionId 以便错题重做时按题目 id 查询
  if ((!cardId && !extra.questionId) || !categoryId) return null
  const unitId = extra.unitId || ''
  const chapterId = extra.chapterId || ''
  const questionId = extra.questionId || ''
  const categoryName = extra.categoryName || ''
  const unitName = extra.unitName || ''
  const stem = extra.stem || ''

  let ex
  if (unitId) {
    ex = await db.wrongAnswers.where({ cardId, categoryId, unitId }).first()
  } else {
    const candidates = await db.wrongAnswers.where({ cardId, categoryId }).toArray()
    ex = candidates.find(c => !c.unitId || c.unitId === '') || null
  }

  if (ex) {
    const updates = {
      count: ex.count + 1,
      lastWrongAt: Date.now(),
      updatedAt: Date.now(),
    }
    if (questionType && !ex.questionType) updates.questionType = questionType
    if (stem && !ex.stem) updates.stem = stem
    if (unitName && !ex.unitName) updates.unitName = unitName
    if (categoryName && !ex.categoryName) updates.categoryName = categoryName
    if (chapterId && !ex.chapterId) updates.chapterId = chapterId
    if (questionId && !ex.questionId) updates.questionId = questionId
    await db.wrongAnswers.update(ex.id, updates)
    return { ...ex, ...updates }
  } else {
    const newRecord = {
      id: generateId(),
      cardId,
      categoryId,
      unitId,
      chapterId,
      count: 1,
      lastWrongAt: Date.now(),
      updatedAt: Date.now(),
      questionType: questionType || '',
      categoryName: categoryName || '',
      unitName: unitName || '',
      stem: stem || '',
      questionId,
    }
    await db.wrongAnswers.add(newRecord)
    return newRecord
  }
}

// 错题本功能 - 获取分类下的错题列表
export async function getWrongAnswersByCategory(categoryId, limit = 20) {
  if (!categoryId) return []
  return db.wrongAnswers
    .where('categoryId')
    .equals(categoryId)
    .reverse()
    .sortBy('lastWrongAt')
}

// 错题本功能 - 按单元获取错题列表
export async function getWrongAnswersByUnit(unitId) {
  if (!unitId) return []
  return db.wrongAnswers
    .where('unitId')
    .equals(unitId)
    .reverse()
    .sortBy('lastWrongAt')
}

// 错题本功能 - 按分类 + 单元获取错题列表（优先）
export async function getWrongAnswersByCategoryAndUnit(categoryId, unitId) {
  if (!categoryId) return []
  if (!unitId) return getWrongAnswersByCategory(categoryId)
  return db.wrongAnswers
    .where(['categoryId', 'unitId'])
    .equals([categoryId, unitId])
    .reverse()
    .sortBy('lastWrongAt')
}

// 错题本功能 - 按章节获取错题列表（v7 章节化支持）
export async function getWrongAnswersByChapter(chapterId) {
  if (!chapterId) return []
  return db.wrongAnswers
    .where('chapterId')
    .equals(chapterId)
    .reverse()
    .sortBy('lastWrongAt')
}

// 错题本功能 - 获取单张卡片的错误记录
export async function getWrongAnswer(cardId, categoryId) {
  return db.wrongAnswers.where({ cardId, categoryId }).first()
}

// 错题本功能 - 清除错误记录（v5 支持 unitId，v7 支持 questionId）
// 支持通过 cardId 或 questionId 清除（有 cardId 时优先 cardId）
export async function clearWrongAnswer(cardId, categoryId, unitId = '', questionId = '') {
  if (!cardId && !questionId) return
  if (unitId) {
    // 有单元信息：优先按 {cardId, categoryId, unitId} 删除；若无 cardId 则按 {questionId, categoryId, unitId} 删除
    if (cardId) {
      await db.wrongAnswers.where({ cardId, categoryId, unitId }).delete()
    } else if (questionId) {
      await db.wrongAnswers.where({ questionId, categoryId, unitId }).delete()
    }
  } else {
    // 无单元信息：查找该分类下的所有匹配记录
    let items = []
    if (cardId) {
      items = await db.wrongAnswers.where({ cardId, categoryId }).toArray()
      // 仅删除无 unitId 的记录（有 unitId 的记录由上面的分支或其他调用处理）
      const toDelete = items.filter(i => !i.unitId || i.unitId === '')
      if (toDelete.length > 0) {
        const ids = toDelete.map(i => i.id)
        await db.wrongAnswers.bulkDelete(ids)
      }
    } else if (questionId) {
      items = await db.wrongAnswers.where({ questionId, categoryId }).toArray()
      const toDelete = items.filter(i => !i.unitId || i.unitId === '')
      if (toDelete.length > 0) {
        const ids = toDelete.map(i => i.id)
        await db.wrongAnswers.bulkDelete(ids)
      }
    }
  }
}

// 错题本功能 - 获取所有错题记录（跨分类）
export async function getAllWrongAnswers() {
  return db.wrongAnswers.orderBy('lastWrongAt').reverse().toArray()
}

// 错题本功能 - 删除单条错题记录
export async function deleteWrongAnswer(id) {
  await db.wrongAnswers.delete(id)
}

// 错题本功能 - 清空所有错题
export async function clearAllWrongAnswers() {
  await db.wrongAnswers.clear()
}

// ========== 测试记录 (testRecords) ==========

// 保存测试记录
export async function saveTestRecord(record) {
  const r = {
    id: record.id || generateId(),
    parentRecordId: record.parentRecordId || null, // 重做溯源：指向最初的那条记录（或其上一级）
    redoCount: Number.isFinite(Number(record.redoCount)) ? Number(record.redoCount) : 0, // 第几次重做（0=首次）
    categoryId: record.categoryId || '',
    unitId: record.unitId || '',
    // 冗余保存分类名和单元名，便于答题记录页直接显示，避免反复查询
    categoryName: record.categoryName || '',
    unitName: record.unitName || '',
    userId: record.userId || '',
    totalScore: record.totalScore ?? 0,
    correctCount: record.correctCount ?? 0,
    totalCount: record.totalCount ?? 0,
    timeUsed: record.timeUsed ?? 0,
    type: record.type || 'unit_test', // unit_test | review | category_test
    questions: record.questions || [],  // JSON array of question snapshots
    answers: record.answers || {},      // JSON object of user answers
    gradingResults: record.gradingResults || [], // JSON array of grading results
    createdAt: record.createdAt || Date.now(),
  }
  await db.testRecords.add(r)
  return r
}

// 获取某分类/单元的测试记录
export async function getTestRecords(categoryId, unitId) {
  let query = db.testRecords
  if (categoryId) {
    query = query.where('categoryId').equals(categoryId)
  }
  const all = await query.reverse().sortBy('createdAt')
  if (unitId) {
    return all.filter(r => r.unitId === unitId)
  }
  return all
}

// 获取单条测试记录
export async function getTestRecord(id) {
  return db.testRecords.get(id)
}

// 获取全部测试记录（按时间倒序）
export async function getAllTestRecords() {
  return db.testRecords.orderBy('createdAt').reverse().toArray()
}

// 删除测试记录
export async function deleteTestRecord(id) {
  await db.testRecords.delete(id)
}

// 基于某条记录的题目快照重做：返回该记录的题目快照数组（用于"检测重做"）
export async function getTestRecordQuestionsSnapshot(recordId) {
  if (!recordId) return []
  try {
    const r = await db.testRecords.get(recordId)
    if (!r || !Array.isArray(r.questions) || r.questions.length === 0) return []
    return JSON.parse(JSON.stringify(r.questions))
  } catch (e) {
    console.error('[db] getTestRecordQuestionsSnapshot 失败:', e?.message)
    return []
  }
}

// 获取同一条"原始记录"的所有重做记录（含自身）
export async function getRedoHistoryByRecordId(recordId) {
  if (!recordId) return []
  try {
    const current = await db.testRecords.get(recordId)
    if (!current) return []
    let rootId = recordId
    let guard = 0
    while (true) {
      guard++
      if (guard > 50) break
      const now = await db.testRecords.get(rootId)
      if (!now || !now.parentRecordId) break
      rootId = now.parentRecordId
    }
    const children = await db.testRecords.where('parentRecordId').equals(rootId).toArray()
    const root = await db.testRecords.get(rootId)
    const list = []
    if (root) list.push(root)
    list.push(...children)
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return list
  } catch (e) {
    console.error('[db] getRedoHistoryByRecordId 失败:', e?.message)
    return []
  }
}

// 获取一条测试记录涉及的所有知识点（按章节→单元聚合）
export async function getKnowledgePointsByRecordId(recordId) {
  if (!recordId) return { chapters: [], meta: { chapterCount: 0, unitCount: 0, kpCount: 0 } }
  try {
    const record = await db.testRecords.get(recordId)
    if (!record) return { chapters: [], meta: { chapterCount: 0, unitCount: 0, kpCount: 0 } }

    const qList = Array.isArray(record.questions) ? record.questions : []
    const cardIds = qList.map(q => q && (q.cardId || q.id)).filter(Boolean)

    const [cards, knowledgeTree] = await Promise.all([
      cardIds.length > 0 ? db.cards.where('id').anyOf(cardIds).toArray() : Promise.resolve([]),
      db.knowledgeTree.toArray(),
    ])

    const chapters = knowledgeTree.filter(n => n.level === 'chapter')
    const units = knowledgeTree.filter(n => n.level === 'unit')

    const cardById = new Map(cards.map(c => [c.id, c]))
    const chapterById = new Map(chapters.map(c => [c.id, c]))
    const unitById = new Map(units.map(u => [u.id, u]))

    const gradingByCardId = new Map()
    qList.forEach((q, idx) => {
      if (!q) return
      const cid = q.cardId || q.id || null
      if (!cid) return
      if (!gradingByCardId.has(cid)) gradingByCardId.set(cid, { total: 0, correct: 0 })
      const s = gradingByCardId.get(cid)
      s.total += 1
      const gr = Array.isArray(record.gradingResults) ? record.gradingResults[idx] : null
      if (gr && gr.isCorrect) s.correct += 1
    })

    const tree = new Map()
    for (const card of cards) {
      const chapter = chapterById.get(card.chapterId) || null
      const unit = unitById.get(card.unitId) || null
      const chapterKey = chapter?.id || '__no_chapter__'
      const unitKey = unit?.id || '__no_unit__'
      if (!tree.has(chapterKey)) tree.set(chapterKey, { chapter, units: new Map() })
      const chapterNode = tree.get(chapterKey)
      if (!chapterNode.units.has(unitKey)) chapterNode.units.set(unitKey, { unit, kps: [] })
      const unitNode = chapterNode.units.get(unitKey)
      const stat = gradingByCardId.get(card.id) || { total: 0, correct: 0 }
      const text = String(card.knowledge_point || '未设置知识点').trim()
      unitNode.kps.push({
        cardId: card.id,
        text,
        total: stat.total,
        correct: stat.correct,
        front: String(card.front || '').slice(0, 80),
      })
    }

    // 处理记录中题目但未能关联卡片的情况
    const orphanKps = []
    for (let idx = 0; idx < qList.length; idx++) {
      const q = qList[idx]
      if (!q) continue
      const cid = q.cardId || q.id || null
      if (cid && cardById.has(cid)) continue
      const kpText = String(q.knowledgePoint || q.knowledge_point || '').trim()
      if (!kpText) continue
      const gr = Array.isArray(record.gradingResults) ? record.gradingResults[idx] : null
      orphanKps.push({
        cardId: null,
        text: kpText,
        total: 1,
        correct: gr && gr.isCorrect ? 1 : 0,
        front: String(q.stem || '').slice(0, 80),
      })
    }
    if (orphanKps.length > 0) {
      const key = '__no_chapter__'
      const uKey = '__no_unit__'
      if (!tree.has(key)) tree.set(key, { chapter: null, units: new Map() })
      const ch = tree.get(key)
      if (!ch.units.has(uKey)) ch.units.set(uKey, { unit: null, kps: [] })
      ch.units.get(uKey).kps.push(...orphanKps)
    }

    const chaptersArr = Array.from(tree.values()).sort((a, b) => {
      const ao = a.chapter?.order ?? Number.MAX_SAFE_INTEGER
      const bo = b.chapter?.order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return (a.chapter?.name || '').localeCompare(b.chapter?.name || '')
    })

    const chaptersOut = chaptersArr.map(c => {
      const unitsArr = Array.from(c.units.values()).sort((a, b) => {
        const ao = a.unit?.order ?? Number.MAX_SAFE_INTEGER
        const bo = b.unit?.order ?? Number.MAX_SAFE_INTEGER
        if (ao !== bo) return ao - bo
        return (a.unit?.name || '').localeCompare(b.unit?.name || '')
      })
      return { chapter: c.chapter, units: unitsArr }
    })

    let totalUnits = 0
    let totalKps = 0
    for (const c of chaptersOut) {
      totalUnits += c.units.length
      for (const u of c.units) totalKps += u.kps.length
    }
    return { record, chapters: chaptersOut, meta: { chapterCount: chaptersOut.length, unitCount: totalUnits, kpCount: totalKps } }
  } catch (e) {
    console.error('[db] getKnowledgePointsByRecordId 失败:', e?.message)
    return { chapters: [], meta: { chapterCount: 0, unitCount: 0, kpCount: 0 } }
  }
}
export async function getCardStatusesByCategory(cid) { const list = await db.cardStatus.where('categoryId').equals(cid).toArray(); const m = {}; for (const i of list) m[i.cardId] = i.status; return m }
// 获取所有卡片状态（用于检查仅本地模式数据）
export async function getAllCardStatuses() { return db.cardStatus.toArray() }
export async function addBookmark(cardId) { const ex = await db.bookmarks.where('cardId').equals(cardId).first(); if (!ex) await db.bookmarks.add({ id: generateId(), cardId, createdAt: Date.now() }) }
export async function removeBookmark(cardId) { await db.bookmarks.where('cardId').equals(cardId).delete() }
export async function isBookmarked(cardId) { return (await db.bookmarks.where('cardId').equals(cardId).count()) > 0 }
export async function getBookmarkStatuses(cardIds) {
  if (!cardIds.length) return {}
  const all = await db.bookmarks.toArray()
  const set = new Set(all.map(r => r.cardId))
  const result = {}
  for (const id of cardIds) result[id] = set.has(id)
  return result
}
export async function getBookmarkedCards() {
  const recs = await db.bookmarks.orderBy('createdAt').reverse().toArray();
  const knowledgeTree = await db.knowledgeTree.toArray()
  const unitById = new Map(knowledgeTree.filter(n => n.level === 'unit').map(u => [u.id, u]))
  const categoryById = new Map(knowledgeTree.filter(n => n.level === 'category').map(c => [c.id, c]))

  const cards = await Promise.all(
    recs.map(async (r) => {
      const card = await db.cards.get(r.cardId);
      if (!card) return null;
      const u = card.unitId ? unitById.get(card.unitId) : null;
      const category = u ? categoryById.get(u.categoryId) : (card.categoryId ? categoryById.get(card.categoryId) : null);
      return { ...card, unitName: u ? u.name : '', categoryId: u ? u.categoryId : card.categoryId || '', categoryName: category ? category.name : '' };
    })
  );
  return cards.filter(Boolean);
}

export async function deleteCard(cardId, categoryId) {
  await db.transaction('rw', db.cards, db.cardStatus, db.bookmarks, async () => {
    await db.cards.delete(cardId)
    if (categoryId) {
      await db.cardStatus.where({ cardId, categoryId }).delete()
    } else {
      await db.cardStatus.where('cardId').equals(cardId).delete()
    }
    await db.bookmarks.where('cardId').equals(cardId).delete()
  })
}

export async function updateCard(cardId, patch) {
  if (!patch || typeof patch !== 'object') return
  const changes = { ...patch, updatedAt: Date.now() }
  if ('front' in changes) changes.front = String(changes.front ?? '')
  if ('back' in changes) changes.back = String(changes.back ?? '')
  if (Object.keys(changes).length === 0) return
  await db.cards.update(cardId, changes)
  // 钩子：卡片内容变更后，关联题目的 cardUpdatedAt 不会自动更新，
  // 因此关联题目自动变为"过期"状态（cardUpdatedAt < card.updatedAt）
  // 调用方可通过比较两字段判断题目是否需要重新生成
  return db.cards.get(cardId)
}

export async function clearOcrCache() {
  try {
    const count = await db.ocrCache.count()
    await db.ocrCache.clear()
    return count
  } catch (e) {
    console.error('[db] clearOcrCache 失败:', e?.message)
    throw e
  }
}

export async function updateUnit(unitId, patch) {
  if (!patch || typeof patch !== 'object') return
  const changes = { ...patch, updatedAt: Date.now() }
  if ('name' in changes) {
    changes.name = String(changes.name ?? '').trim()
    if (!changes.name) return
  }
  if (Object.keys(changes).length === 0) return
  await db.knowledgeTree.update(unitId, changes)
  return db.knowledgeTree.where('level').equals('unit').and(n => n.id === unitId).first()
}

export async function deleteUnit(unitId) {
  const unit = await db.knowledgeTree.where('level').equals('unit').and(n => n.id === unitId).first()
  
  const cs = await db.cards.where('unitId').equals(unitId).toArray()
  const cids = cs.map(c => c.id)
  await db.cards.where('unitId').equals(unitId).delete()
  if (unit) {
    await db.cardStatus.where('categoryId').equals(unit.categoryId)
      .filter(s => cids.includes(s.cardId)).delete()
    await db.wrongAnswers.where('categoryId').equals(unit.categoryId)
      .filter(w => cids.includes(w.cardId)).delete()
  }
  await db.wrongAnswers.where('unitId').equals(unitId).delete()
  for (const cid of cids) await db.bookmarks.where('cardId').equals(cid).delete()
  
  const tqs = await db.testQuestions.where('unitId').equals(unitId).toArray();
  await db.testQuestions.where('unitId').equals(unitId).delete();
  const sessions = await db.testSessions.where('typeId').equals(unitId).toArray();
  await deleteTestRecordsForQuestions(tqs.map(tq => tq.id));
  await deleteTestRecordsByScope({ unitId, sessionIds: sessions.map(s => s.id) });
  await db.testSessions.where('typeId').equals(unitId).delete();
  
  for (const cid of cids) await db.reviewHistory.where('cardId').equals(cid).delete()
  
  const treeChildren = await db.knowledgeTree.where('parentId').equals(unitId).toArray()
  for (const child of treeChildren) {
    await db.knowledgeTree.delete(child.id)
  }
  
  await db.knowledgeTree.where('level').equals('unit').and(n => n.id === unitId).delete()
}

export async function deleteEmptyUnit(unitId) {
  const unit = await db.knowledgeTree.where('level').equals('unit').and(n => n.id === unitId).first()
  if (!unit) return false
  const count = await db.cards.where('unitId').equals(unitId).count()
  if (count > 0) return false
  const tqs = await db.testQuestions.where('unitId').equals(unitId).toArray()
  await db.transaction('rw', db.knowledgeTree, db.testQuestions, db.testRecords, db.testSessions, db.wrongAnswers, async () => {
    await db.testQuestions.where('unitId').equals(unitId).delete()
    const sessions = await db.testSessions.where('typeId').equals(unitId).toArray()
    await deleteTestRecordsForQuestions(tqs.map(tq => tq.id))
    await deleteTestRecordsByScope({ unitId, sessionIds: sessions.map(s => s.id) })
    await db.testSessions.where('typeId').equals(unitId).delete()
    await db.wrongAnswers.where('unitId').equals(unitId).delete()
    await db.knowledgeTree.where('level').equals('unit').and(n => n.id === unitId).delete()
  })
  return true
}

export async function deleteEmptyUnits(categoryId) {
  if (!categoryId) return { deletedUnits: 0 }
  let deletedUnits = 0

  await db.transaction('rw', db.knowledgeTree, db.cards, db.testQuestions, db.testRecords, db.testSessions, async () => {
    const units = await db.knowledgeTree.where('level').equals('unit').and(n => n.categoryId === categoryId).toArray()
    for (const unit of units) {
      const count = await db.cards.where('unitId').equals(unit.id).count()
      if (count > 0) continue

      const tqs = await db.testQuestions.where('unitId').equals(unit.id).toArray()
      await db.testQuestions.where('unitId').equals(unit.id).delete()
      const sessions = await db.testSessions.where('typeId').equals(unit.id).toArray()
      await deleteTestRecordsForQuestions(tqs.map(tq => tq.id))
      await deleteTestRecordsByScope({ unitId: unit.id, sessionIds: sessions.map(s => s.id) })
      await db.testSessions.where('typeId').equals(unit.id).delete()
      await db.knowledgeTree.where('level').equals('unit').and(n => n.id === unit.id).delete()
      deletedUnits += 1
    }
  })

  const emptyChaptersResult = await deleteEmptyChapters(categoryId)
  return { deletedUnits, deletedEmptyChapters: emptyChaptersResult }
}

export async function deleteEmptyCategory(categoryId) {
  const category = await db.knowledgeTree.where('level').equals('category').and(n => n.id === categoryId).first()
  if (!category) return false
  const count = await db.cards.where('categoryId').equals(categoryId).count()
  if (count > 0) return false
  await deleteCategory(categoryId)
  return true
}

export async function moveCardToUnit(cardId, newUnitId) {
  const unit = await db.knowledgeTree.where('level').equals('unit').and(n => n.id === newUnitId).first()
  if (!unit) throw new Error('目标单元不存在')
  return batchUpdateCardsCategoryAndUnit([{ cardId, categoryId: unit.categoryId, unitId: newUnitId }])
}

export async function moveCardToCategory(cardId, targetCategoryId, targetUnitId) {
  return batchUpdateCardsCategoryAndUnit([{ cardId, categoryId: targetCategoryId, unitId: targetUnitId }])
}

/**
 * 批量创建分类、章节、单元
 * [fix-空分类复用] 支持复用已有分类（通过 existingCategoryMap 参数）
 * @param {Array} categoryPlans - 分类计划
 * @param {Object} options - 选项
 * @param {Map} options.existingCategoryMap - 已有分类映射（分类名 → categoryId），同名分类复用不新建
 * @param {Map} options.existingChapterMap - 已有章节映射（categoryId+chapterName → chapterId）
 * @returns {Object} { createdCategories, createdChapters, createdUnits, categoryIdMap, chapterIdMap, unitIdMap, reusedCategories }
 */
export async function batchCreateCategoriesAndUnits(categoryPlans = [], options = {}) {
  const createdCategories = []
  const createdChapters = []
  const createdUnits = []
  const reusedCategories = []
  const categoryIdMap = {}
  const chapterIdMap = {}
  const unitIdMap = {}
  const { existingCategoryMap = new Map(), existingChapterMap = new Map() } = options

  await db.transaction('rw', db.knowledgeTree, async () => {
    for (const plan of categoryPlans || []) {
      const categoryName = String(plan?.name || '新分类').trim() || '新分类'
      let categoryId
      const now = Date.now()

      if (existingCategoryMap.has(categoryName)) {
        categoryId = existingCategoryMap.get(categoryName)
        reusedCategories.push({ id: categoryId, name: categoryName })
      } else {
        categoryId = generateId()
        const category = {
          id: categoryId,
          parentId: null,
          level: 'category',
          name: categoryName,
          categoryId: categoryId,
          topicId: null,
          chapterId: null,
          unitId: null,
          createdAt: now,
          updatedAt: now,
          order: 0,
        }
        await db.knowledgeTree.add(category)
        createdCategories.push(category)
      }
      if (plan?.tempId) categoryIdMap[plan.tempId] = categoryId

      const chapters = Array.isArray(plan?.chapters) ? plan.chapters : []

      if (chapters.length > 0) {
        for (let ci = 0; ci < chapters.length; ci++) {
          const chapterPlan = chapters[ci]
          const chapterName = String(chapterPlan?.name || '新章节').trim() || '新章节'
          const chapterKey = `${categoryId}::${chapterName}`
          let chapterId

          if (existingChapterMap.has(chapterKey)) {
            chapterId = existingChapterMap.get(chapterKey)
          } else {
            chapterId = generateId()
            const chapter = {
              id: chapterId,
              parentId: categoryId,
              level: 'chapter',
              name: chapterName,
              categoryId,
              topicId: null,
              chapterId: chapterId,
              unitId: null,
              createdAt: now,
              updatedAt: now,
              order: ci,
            }
            await db.knowledgeTree.add(chapter)
            createdChapters.push(chapter)
          }
          if (chapterPlan?.tempId) chapterIdMap[chapterPlan.tempId] = chapterId

          const units = Array.isArray(chapterPlan?.units) ? chapterPlan.units : []
          for (let i = 0; i < units.length; i++) {
            const unitPlan = units[i]
            const unitId = generateId()
            const unit = {
              id: unitId,
              parentId: chapterId,
              level: 'unit',
              name: String(unitPlan?.name || '新单元').trim() || '新单元',
              categoryId,
              topicId: null,
              chapterId,
              unitId: unitId,
              createdAt: now,
              updatedAt: now,
              order: i,
            }
            await db.knowledgeTree.add(unit)
            createdUnits.push(unit)
            if (unitPlan?.tempId) unitIdMap[unitPlan?.tempId] = unitId
          }
        }
      } else {
        const units = Array.isArray(plan?.units) ? plan.units : []
        for (let i = 0; i < units.length; i++) {
          const unitPlan = units[i]
          const unitId = generateId()
          const unit = {
            id: unitId,
            parentId: categoryId,
            level: 'unit',
            name: String(unitPlan?.name || '新单元').trim() || '新单元',
            categoryId,
            topicId: null,
            chapterId: null,
            unitId: unitId,
            createdAt: now,
            updatedAt: now,
            order: i,
          }
          await db.knowledgeTree.add(unit)
          createdUnits.push(unit)
          if (unitPlan?.tempId) unitIdMap[unitPlan?.tempId] = unitId
        }
      }
    }
  })

  return { createdCategories, createdChapters, createdUnits, categoryIdMap, chapterIdMap, unitIdMap, reusedCategories }
}

function normalizeCardTargetEntries(cardIdToCategoryUnitMap) {
  if (Array.isArray(cardIdToCategoryUnitMap)) {
    return cardIdToCategoryUnitMap
      .filter(Boolean)
      .map(item => ({
        cardId: item.cardId,
        categoryId: item.categoryId,
        unitId: item.unitId,
        chapterId: item.chapterId || null,
      }))
  }
  return Object.entries(cardIdToCategoryUnitMap || {}).map(([cardId, target]) => ({
    cardId,
    categoryId: target?.categoryId,
    unitId: target?.unitId,
    chapterId: target?.chapterId || null,
  }))
}

export async function batchUpdateCardsCategoryAndUnit(cardIdToCategoryUnitMap, options = {}) {
  const entries = normalizeCardTargetEntries(cardIdToCategoryUnitMap)
    .filter(item => item.cardId && item.categoryId && item.unitId)
  if (entries.length === 0) {
    return { updatedCards: 0, movedCards: 0, deletedEmptyUnits: 0, deletedEmptyCategories: 0 }
  }

  const knowledgeTree = await db.knowledgeTree.toArray()
  const unitById = new Map(knowledgeTree.filter(n => n.level === 'unit').map(u => [u.id, u]))
  const categoryById = new Map(knowledgeTree.filter(n => n.level === 'category').map(c => [c.id, c]))

  const sourceUnitIds = new Set()
  const sourceCategoryIds = new Set()
  let updatedCards = 0

  await db.transaction(
    'rw',
    db.cards, db.cardStatus, db.wrongAnswers, db.testQuestions, db.testRecords,
    async () => {
      for (const entry of entries) {
        const card = await db.cards.get(entry.cardId)
        if (!card) continue
        const targetUnit = unitById.get(entry.unitId)
        if (!targetUnit || targetUnit.categoryId !== entry.categoryId) {
          throw new Error(`目标单元与分类不匹配：cardId=${entry.cardId}`)
        }
        const targetCategory = categoryById.get(entry.categoryId)
        if (!targetCategory) {
          throw new Error(`目标分类不存在：${entry.categoryId}`)
        }
        if (card.unitId) sourceUnitIds.add(card.unitId)
        if (card.categoryId) sourceCategoryIds.add(card.categoryId)

        // 确定章节 ID：优先使用传入的 chapterId，否则从目标单元获取
        const chapterId = entry.chapterId || targetUnit.chapterId || null

        await db.cards.update(entry.cardId, {
          categoryId: entry.categoryId,
          unitId: entry.unitId,
          chapterId,
          updatedAt: Date.now(),
        })

        const statuses = await db.cardStatus.where('cardId').equals(entry.cardId).toArray()
        for (const status of statuses) {
          await db.cardStatus.update(status.id, { categoryId: entry.categoryId, chapterId, updatedAt: Date.now() })
        }

        const wrongs = await db.wrongAnswers.where('cardId').equals(entry.cardId).toArray()
        for (const wrong of wrongs) {
          await db.wrongAnswers.update(wrong.id, { categoryId: entry.categoryId, chapterId })
        }

        const questions = await db.testQuestions.where('cardId').equals(entry.cardId).toArray()
        for (const question of questions) {
          const nextTargetId = question.testType === 'unit'
            ? entry.unitId
            : question.testType === 'category'
              ? entry.categoryId
              : (question.targetId || entry.categoryId)
          await db.testQuestions.update(question.id, {
            categoryId: entry.categoryId,
            unitId: entry.unitId,
            chapterId,
            targetId: nextTargetId,
            updatedAt: Date.now(),
          })
          await db.testRecords.where('questionId').equals(question.id).modify({
            categoryId: entry.categoryId,
            unitId: entry.unitId,
            chapterId,
            updatedAt: Date.now(),
          })
        }

        updatedCards += 1
      }
    },
  )

  let deletedEmptyUnits = 0
  let deletedEmptyCategories = 0
  if (options.cleanupEmptySource) {
    for (const unitId of sourceUnitIds) {
      const deleted = await deleteEmptyUnit(unitId)
      if (deleted) deletedEmptyUnits += 1
    }
    for (const categoryId of sourceCategoryIds) {
      const deleted = await deleteEmptyCategory(categoryId)
      if (deleted) deletedEmptyCategories += 1
    }
  }

  return { updatedCards, movedCards: updatedCards, deletedEmptyUnits, deletedEmptyCategories }
}

export async function batchUpdateCardsUnit(cardIdToUnitIdMap) {
  const unitIds = [...new Set(Object.values(cardIdToUnitIdMap || {}).filter(Boolean))]
  const units = await Promise.all(unitIds.map(id => db.knowledgeTree.where('level').equals('unit').and(n => n.id === id).first()))
  const categoryByUnitId = new Map()
  for (const unit of units) {
    if (unit) categoryByUnitId.set(unit.id, unit.categoryId)
  }
  const entries = Object.entries(cardIdToUnitIdMap || {}).map(([cardId, unitId]) => ({
    cardId,
    unitId,
    categoryId: categoryByUnitId.get(unitId),
  })).filter(item => item.categoryId)

  return batchUpdateCardsCategoryAndUnit(entries)
}

/**
 * 批量更新卡片所属章节
 * 同时同步更新 cardStatus、wrongAnswers、testQuestions、testRecords 中的 chapterId
 * @param {Object} cardIdToChapterIdMap - { cardId: chapterId, ... }
 */
export async function batchUpdateCardsChapter(cardIdToChapterIdMap) {
  const entries = Object.entries(cardIdToChapterIdMap || {}).filter(([, chapterId]) => chapterId)
  if (entries.length === 0) return { updatedCards: 0 }

  let updatedCards = 0
  await db.transaction(
    'rw',
    db.cards, db.cardStatus, db.wrongAnswers, db.testQuestions, db.testRecords,
    async () => {
      for (const [cardId, chapterId] of entries) {
        const card = await db.cards.get(cardId)
        if (!card) continue

        await db.cards.update(cardId, { chapterId, updatedAt: Date.now() })

        const statuses = await db.cardStatus.where('cardId').equals(cardId).toArray()
        for (const status of statuses) {
          await db.cardStatus.update(status.id, { chapterId, updatedAt: Date.now() })
        }

        const wrongs = await db.wrongAnswers.where('cardId').equals(cardId).toArray()
        for (const wrong of wrongs) {
          await db.wrongAnswers.update(wrong.id, { chapterId })
        }

        const questions = await db.testQuestions.where('cardId').equals(cardId).toArray()
        for (const question of questions) {
          await db.testQuestions.update(question.id, { chapterId, updatedAt: Date.now() })
          await db.testRecords.where('questionId').equals(question.id).modify({
            chapterId,
            updatedAt: Date.now(),
          })
        }

        updatedCards += 1
      }
    },
  )

  return { updatedCards }
}

// ============================================================
// 一键单元整理：覆盖旧单元分类，将卡片重新分配到新单元
// ============================================================
export async function reassignAllCards(categoryId, newUnits) {
  const allCards = await getAllCardsByCategory(categoryId)
  if (allCards.length === 0) return { newUnitCount: 0, movedCards: 0 }

  let movedCards = 0
  const now = Date.now()
  await db.transaction('rw', db.knowledgeTree, db.cards, db.cardStatus, db.wrongAnswers, db.testQuestions, db.testRecords, db.testSessions, async () => {
    const oldUnits = await db.knowledgeTree.where('level').equals('unit').and(n => n.categoryId === categoryId).toArray()
    const createdUnits = []
    for (let i = 0; i < newUnits.length; i++) {
      const unitId = generateId()
      const unit = {
        id: unitId,
        parentId: categoryId,
        level: 'unit',
        name: newUnits[i].name,
        categoryId,
        chapterId: null,
        unitId: null,
        createdAt: now,
        updatedAt: now,
        order: i,
      }
      unit.unitId = unit.id
      await db.knowledgeTree.add(unit)
      createdUnits.push(unit)

      const indices = newUnits[i].cardIndices || []
      for (let j = 0; j < indices.length; j++) {
        const idx = indices[j]
        if (idx < 0 || idx >= allCards.length) continue
        const src = allCards[idx]
        await db.cards.update(src.id, {
          categoryId,
          unitId: unit.id,
          order: j,
          updatedAt: now,
        })
        const questions = await db.testQuestions.where('cardId').equals(src.id).toArray()
        for (const question of questions) {
          await db.testQuestions.update(question.id, {
            categoryId,
            unitId: unit.id,
            targetId: question.testType === 'unit' ? unit.id : (question.testType === 'category' ? categoryId : question.targetId),
            updatedAt: now,
          })
          await db.testRecords.where('questionId').equals(question.id).modify({
            categoryId,
            unitId: unit.id,
            updatedAt: now,
          })
        }
        movedCards += 1
      }
    }

    for (const unit of oldUnits) {
      const count = await db.cards.where('unitId').equals(unit.id).count()
      if (count > 0) continue
      const tqs = await db.testQuestions.where('unitId').equals(unit.id).toArray()
      const sessions = await db.testSessions.where('typeId').equals(unit.id).toArray()
      await db.testQuestions.where('unitId').equals(unit.id).delete()
      await deleteTestRecordsForQuestions(tqs.map(tq => tq.id))
      await deleteTestRecordsByScope({ unitId: unit.id, sessionIds: sessions.map(s => s.id) })
      await db.testSessions.where('typeId').equals(unit.id).delete()
      await db.knowledgeTree.delete(unit.id)
    }
  })

  return { newUnitCount: newUnits.length, movedCards }
}

// ============================================================
// 写入知识树：将分类结果写入 knowledgeTree 单表
// 支持完整层级：分类 → 主题 → 章节 → 单元 → 知识点 → 卡片
// ============================================================
export async function writeClassificationToKnowledgeTree(categoryId, classificationResult, allCards) {
  const nodes = classificationResult.toKnowledgeTreeNodes(categoryId)
  const flatNodes = []

  function collect(node) {
    flatNodes.push(node)
    node.children.forEach(collect)
  }
  nodes.forEach(collect)

  const now = Date.now()
  let createdNodes = []

  await db.transaction('rw', db.knowledgeTree, db.cards, async () => {
    const existingChildren = await db.knowledgeTree.where('parentId').equals(categoryId).toArray()
    for (const child of existingChildren) {
      const descendants = await db.knowledgeTree.where('parentId').equals(child.id).toArray()
      for (const desc of descendants) {
        await db.knowledgeTree.delete(desc.id)
      }
      await db.knowledgeTree.delete(child.id)
    }

    const idMap = {}
    for (const node of flatNodes) {
      const record = {
        id: node.id,
        parentId: node.parentId,
        level: node.level,
        name: node.name,
        categoryId: node.categoryId,
        topicId: node.topicId || null,
        chapterId: node.chapterId || null,
        unitId: node.unitId || null,
        knowledgePointId: node.knowledgePointId || null,
        purpose: node.purpose || null,
        description: node.description || null,
        color: node.color || '#3b82f6',
        icon: node.icon || '📚',
        isProcessed: node.isProcessed || false,
        position: node.position || 0,
        content: node.content || null,
        front: node.front || null,
        back: node.back || null,
        hint: node.hint || null,
        explanation: node.explanation || null,
        type: node.type || 'short',
        options: node.options || null,
        answerBlank: node.answerBlank || null,
        status: node.status || 'active',
        retryCount: node.retryCount || 0,
        source: node.source || 'ai',
        errorMessage: node.errorMessage || null,
        generatedAt: node.generatedAt || null,
        templateType: node.templateType || null,
        order: node.order || 0,
        userId: node.userId || '',
        createdAt: node.createdAt || now,
        updatedAt: node.updatedAt || now,
      }

      if (record.level === 'topic') {
        record.topicId = record.id
      } else if (record.level === 'chapter') {
        record.chapterId = record.id
      } else if (record.level === 'unit') {
        record.unitId = record.id
      } else if (record.level === 'knowledge_point') {
        record.knowledgePointId = record.id
      }

      await db.knowledgeTree.add(record)
      idMap[node.id] = record
      createdNodes.push(record)
    }

    for (const idx of allCards.keys()) {
      let cardUnitId = null
      let cardChapterId = null
      let cardTopicId = null

      for (const topic of classificationResult.topics) {
        for (const chapter of topic.chapters) {
          for (const unit of chapter.units) {
            if (unit.cardIndices.includes(idx)) {
              cardUnitId = idMap[unit.name]?.id || null
              cardChapterId = idMap[chapter.name]?.id || null
              cardTopicId = idMap[topic.name]?.id || null
              break
            }
          }
          if (cardUnitId) break
        }
        if (cardUnitId) break
        for (const unit of topic.units) {
          if (unit.cardIndices.includes(idx)) {
            cardUnitId = idMap[unit.name]?.id || null
            cardTopicId = idMap[topic.name]?.id || null
            break
          }
        }
        if (cardUnitId) break
      }

      if (!cardUnitId) {
        for (const chapter of classificationResult.chapters) {
          for (const unit of chapter.units) {
            if (unit.cardIndices.includes(idx)) {
              cardUnitId = idMap[unit.name]?.id || null
              cardChapterId = idMap[chapter.name]?.id || null
              break
            }
          }
          if (cardUnitId) break
        }
      }

      if (!cardUnitId) {
        for (const unit of classificationResult.units) {
          if (unit.cardIndices.includes(idx)) {
            cardUnitId = idMap[unit.name]?.id || null
            break
          }
        }
      }

      const card = allCards[idx]
      if (card) {
        const cardRecord = {
          id: card.id,
          parentId: cardUnitId || cardChapterId || categoryId,
          level: 'card',
          name: null,
          categoryId: categoryId,
          topicId: cardTopicId || null,
          chapterId: cardChapterId || card.chapterId || null,
          unitId: cardUnitId || card.unitId || null,
          knowledgePointId: null,
          purpose: null,
          description: null,
          color: '#3b82f6',
          icon: '📚',
          isProcessed: false,
          position: 0,
          content: card.knowledge_point || null,
          front: card.front,
          back: card.back || null,
          hint: card.hint || null,
          explanation: card.explanation || null,
          type: card.type || 'short',
          options: card.options || null,
          answerBlank: card.answerBlank || null,
          status: 'active',
          retryCount: card.retryCount || 0,
          source: card.source || 'manual',
          errorMessage: card.errorMessage || null,
          generatedAt: card.generatedAt || null,
          templateType: card.templateType || null,
          order: card.order || 0,
          userId: card.userId || '',
          createdAt: card.createdAt || now,
          updatedAt: now,
        }
        await db.knowledgeTree.put(cardRecord)
      }
    }

    for (const idx of allCards.keys()) {
      let cardUnitId = null
      let cardChapterId = null
      let cardTopicId = null

      for (const topic of classificationResult.topics) {
        for (const chapter of topic.chapters) {
          for (const unit of chapter.units) {
            if (unit.cardIndices.includes(idx)) {
              cardUnitId = idMap[unit.name]?.id
              cardChapterId = idMap[chapter.name]?.id
              cardTopicId = idMap[topic.name]?.id
              break
            }
          }
          if (cardUnitId) break
        }
        if (cardUnitId) break
        for (const unit of topic.units) {
          if (unit.cardIndices.includes(idx)) {
            cardUnitId = idMap[unit.name]?.id
            cardTopicId = idMap[topic.name]?.id
            break
          }
        }
        if (cardUnitId) break
      }

      if (!cardUnitId) {
        for (const chapter of classificationResult.chapters) {
          for (const unit of chapter.units) {
            if (unit.cardIndices.includes(idx)) {
              cardUnitId = idMap[unit.name]?.id
              cardChapterId = idMap[chapter.name]?.id
              break
            }
          }
          if (cardUnitId) break
        }
      }

      if (!cardUnitId) {
        for (const unit of classificationResult.units) {
          if (unit.cardIndices.includes(idx)) {
            cardUnitId = idMap[unit.name]?.id
            break
          }
        }
      }

      const card = allCards[idx]
      if (card) {
        await db.cards.update(card.id, {
          unitId: cardUnitId,
          chapterId: cardChapterId,
          categoryId,
          updatedAt: now,
        })
      }
    }
  })

  return { createdNodes, totalNodes: flatNodes.length + allCards.length }
}

// 便捷计数函数，供 Account.jsx 使用
export async function getCardCount() { return db.cards.count() }
export async function getBookmarkCount() { return db.bookmarks.count() }
export async function getStatusStats() {
  const [totalCards, mastered, learning, review, markedAsNew] = await Promise.all([
    db.cards.count(),
    db.cardStatus.where('status').equals('mastered').count(),
    db.cardStatus.where('status').equals('learning').count(),
    db.cardStatus.where('status').equals('review').count(),
    db.cardStatus.where('status').equals('new').count(),
  ])
  const neverMarked = totalCards - (mastered + learning + review + markedAsNew)
  const newCards = neverMarked > 0 ? neverMarked + markedAsNew : markedAsNew
  return { mastered, learning, review, newCards }
}
export async function getNewCount() {
  const [totalCards, markedAsNew] = await Promise.all([
    db.cards.count(),
    db.cardStatus.where('status').equals('new').count(),
  ])
  const neverMarked = totalCards - await db.cardStatus.count() // 已标记的总数 = 所有 record 数
  return neverMarked + markedAsNew
}
export async function getTodayStudiedCount() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayTs = startOfToday.getTime()
  return db.cardStatus.where('updatedAt').aboveOrEqual(todayTs).count()
}

export async function getTodayStudiedCards() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayTs = startOfToday.getTime()
  const statuses = await db.cardStatus.where('updatedAt').aboveOrEqual(todayTs).toArray()

  const knowledgeTree = await db.knowledgeTree.toArray()
  const unitById = new Map(knowledgeTree.filter(n => n.level === 'unit').map(u => [u.id, u]))
  const categoryById = new Map(knowledgeTree.filter(n => n.level === 'category').map(c => [c.id, c]))

  const results = await Promise.all(statuses.map(async (s) => {
    const card = await db.cards.get(s.cardId)
    const unit = card ? unitById.get(card.unitId) : null
    const category = unit ? categoryById.get(unit.categoryId) : (card ? categoryById.get(card.categoryId) : null)
    return {
      cardId: s.cardId,
      status: s.status,
      front: card ? card.front : '',
      back: card ? card.back : '',
      unitName: unit ? unit.name : '',
      categoryId: unit ? unit.categoryId : card?.categoryId || '',
      categoryName: category ? category.name : ''
    }
  }))
  return results
}

export async function getMasteredCards() {
  const statuses = await db.cardStatus.where('status').equals('mastered').toArray()

  const knowledgeTree = await db.knowledgeTree.toArray()
  const unitById = new Map(knowledgeTree.filter(n => n.level === 'unit').map(u => [u.id, u]))
  const categoryById = new Map(knowledgeTree.filter(n => n.level === 'category').map(c => [c.id, c]))

  const results = await Promise.all(statuses.map(async (s) => {
    const card = await db.cards.get(s.cardId)
    const unit = card ? unitById.get(card.unitId) : null
    const category = unit ? categoryById.get(unit.categoryId) : (card ? categoryById.get(card.categoryId) : null)
    return {
      cardId: s.cardId,
      status: s.status,
      front: card ? card.front : '',
      back: card ? card.back : '',
      unitName: unit ? unit.name : '',
      categoryId: unit ? unit.categoryId : card?.categoryId || '',
      categoryName: category ? category.name : ''
    }
  }))
  return results
}

// OCR 缓存功能 - 7天TTL
const OCR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7天毫秒数
// 最大缓存条目数，防止存储无限增长（每条缓存约 10-500KB）
const OCR_CACHE_MAX_ENTRIES = 100

export async function getOcrCache(imageHash) {
  const record = await db.ocrCache.get(imageHash)
  if (!record) return null
  const now = Date.now()
  if (now - record.timestamp > OCR_CACHE_TTL) {
    await db.ocrCache.delete(imageHash)
    return null
  }
  return record.data
}

export async function setOcrCache(imageHash, data) {
  await db.ocrCache.put({
    imageHash,
    data,
    timestamp: Date.now(),
  })
  // 限制缓存条目数量，超过上限时删除最旧的条目
  try {
    const count = await db.ocrCache.count()
    if (count > OCR_CACHE_MAX_ENTRIES) {
      const oldest = await db.ocrCache.orderBy('timestamp').first()
      if (oldest) {
        await db.ocrCache.delete(oldest.imageHash)
      }
    }
  } catch (e) {
    // 清理失败不影响主流程
    console.warn('[db] OCR 缓存清理失败:', e?.message)
  }
}

// 导出原始数据库对象，供同步和迁移使用
export const dbInstance = db
export const tableRefs = {
  knowledgeTree: db.knowledgeTree,
  cards: db.cards,
  cardStatus: db.cardStatus,
  bookmarks: db.bookmarks,
  wrongAnswers: db.wrongAnswers,
  testRecords: db.testRecords,
  testQuestions: db.testQuestions,
  testSessions: db.testSessions,
}

// ============================================================
// v3 新增：单元检测题目/记录/会话 (新 schema)
// ============================================================

// ---- 题目管理 (testQuestions) ----

// 根据检测类型和目标 ID 获取已有题目
export async function getTestQuestions(testType, targetId) {
  return db.testQuestions
    .where({ testType, targetId })
    .toArray()
}

// 批量添加题目（旧版，保留以兼容）
export async function addTestQuestions_legacy(questions) {
  if (!questions || !questions.length) return 0
  await db.testQuestions.bulkAdd(questions)
  return questions.length
}

// 删除单道题目（旧版，保留以兼容）
export async function deleteTestQuestion_legacy(id) {
  await db.testQuestions.delete(id)
}

// 更新单道题目（旧版，保留以兼容）
export async function updateTestQuestion_legacy(id, patch) {
  if (!patch || typeof patch !== 'object') return
  const changes = { ...patch, updatedAt: Date.now() }
  await db.testQuestions.update(id, changes)
  return db.testQuestions.get(id)
}

// 手动添加题目
export async function addManualTestQuestion(question) {
  const item = {
    id: generateId(),
    userId: question.userId || '',
    testType: question.testType || 'unit',
    targetId: question.targetId || '',
    cardId: question.cardId || null,
    type: String(question.type || 'single_choice'),
    stem: String(question.stem || ''),
    options: Array.isArray(question.options) ? question.options : [],
    answer: String(question.answer || ''),
    analysis: String(question.analysis || ''),
    difficulty: Number(question.difficulty) || 3,
    knowledgePoint: String(question.knowledgePoint || ''),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.testQuestions.add(item)
  return item
}

// 按单元获取题目（旧版，保留以兼容）
export async function getTestQuestionsByUnit_legacy(unitId) {
  return db.testQuestions
    .where('testType').equals('unit')
    .and(q => q.targetId === unitId)
    .toArray()
}

// 获取某分类下所有题目（旧版，保留以兼容）
export async function getTestQuestionsByCategory_legacy(categoryId) {
  return db.testQuestions
    .where('testType').equals('category')
    .and(q => q.targetId === categoryId)
    .toArray()
}

// 获取某用户的所有题目
export async function getTestQuestionsByUser(userId) {
  return db.testQuestions
    .where('userId')
    .equals(userId)
    .toArray()
}

// 清空指定检测类型和目标 ID 的题目
export async function clearTestQuestions(testType, targetId) {
  await db.testQuestions
    .where({ testType, targetId })
    .delete()
}

// 按单元删除题目（旧版，保留以兼容）
export async function deleteTestQuestionsByUnit_legacy(unitId) {
  const tqs = await db.testQuestions
    .where('testType').equals('unit')
    .and(q => q.targetId === unitId).toArray()
  for (const tq of tqs) await db.testQuestions.delete(tq.id)
}

// 按分类删除题目（旧版，保留以兼容）
export async function deleteTestQuestionsByCategory_legacy(categoryId) {
  const tqs = await db.testQuestions
    .where('testType').equals('category')
    .and(q => q.targetId === categoryId).toArray()
  for (const tq of tqs) await db.testQuestions.delete(tq.id)
}

// ---- 答题记录 (testRecords) ----

export async function addTestRecord(record, userId) {
  const now = Date.now()
  const r = {
    id: record.id || generateId(),
    questionId: String(record.questionId || ''),
    userAnswer: String(record.userAnswer ?? ''),
    isCorrect: !!record.isCorrect,
    testType: record.testType || 'unit',
    testSessionId: String(record.testSessionId || ''),
    userId: userId || '',
    createdAt: now,
    updatedAt: now,
  }
  await db.testRecords.add(r)
  return r
}

export async function addTestRecords(records, userId) {
  const now = Date.now()
  const items = records.map(r => ({
    id: r.id || generateId(),
    questionId: String(r.questionId || ''),
    userAnswer: String(r.userAnswer ?? ''),
    isCorrect: !!r.isCorrect,
    testType: r.testType || 'unit',
    testSessionId: String(r.testSessionId || ''),
    userId: userId || '',
    createdAt: now,
    updatedAt: now,
  }))
  if (items.length > 0) await db.testRecords.bulkAdd(items)
  return items
}

// ---- 联结题库历史记录 (linkGenerationRuns) ----

export async function addLinkGenerationRun(run) {
  const record = {
    id: run.id || generateId(),
    categoryId: run.categoryId || '',
    mode: run.mode || 'unit',
    linkStrength: run.linkStrength || '',
    difficulty: run.difficulty || null,
    targetPerCell: run.targetPerCell || 0,
    unitIds: Array.isArray(run.unitIds) ? run.unitIds : [],
    chapterIds: Array.isArray(run.chapterIds) ? run.chapterIds : [],
    knowledgePointCount: Number(run.knowledgePointCount) || 0,
    batchCount: Number(run.batchCount) || 0,
    generatedCount: Number(run.generatedCount) || 0,
    totalTarget: Number(run.totalTarget) || 0,
    distributionByType: run.distributionByType || {},
    distributionByDifficulty: run.distributionByDifficulty || {},
    questionIds: Array.isArray(run.questionIds) ? run.questionIds : [],
    errorMessage: run.errorMessage || '',
    createdAt: run.createdAt || Date.now(),
  }
  if (db.linkGenerationRuns) await db.linkGenerationRuns.add(record)
  return record
}

export async function getLinkGenerationRunsByCategory(categoryId, limit = 30) {
  if (!db.linkGenerationRuns) return []
  const list = await db.linkGenerationRuns
    .where('categoryId').equals(categoryId)
    .reverse()
    .sortBy('createdAt')
  return list.slice(0, limit)
}

export async function getLinkGenerationRun(id) {
  if (!db.linkGenerationRuns) return null
  return db.linkGenerationRuns.get(id)
}

export async function deleteLinkGenerationRun(id) {
  if (!db.linkGenerationRuns) return
  await db.linkGenerationRuns.delete(id)
}

export async function getAllLinkGenerationRuns(limit = 50) {
  if (!db.linkGenerationRuns) return []
  return db.linkGenerationRuns.orderBy('createdAt').reverse().limit(limit).toArray()
}

// ---- 答题会话 (testSessions) ----

export async function addTestSession(session, userId) {
  const now = Date.now()
  const s = {
    id: session.id || generateId(),
    testType: session.testType || 'unit',
    typeId: String(session.typeId || ''),
    // 冗余保存 unitId / categoryId，用于复习模式的精确恢复
    unitId: session.unitId != null ? String(session.unitId) : '',
    categoryId: session.categoryId != null ? String(session.categoryId) : '',
    // 冗余保存分类名和单元名，便于答题记录页直接显示
    categoryName: session.categoryName || '',
    unitName: session.unitName || '',
    questions: Array.isArray(session.questions) ? session.questions : [],
    userAnswers: Array.isArray(session.userAnswers) ? session.userAnswers : [],
    markedQuestions: Array.isArray(session.markedQuestions) ? session.markedQuestions : [],
    currentIndex: typeof session.currentIndex === 'number' ? session.currentIndex : 0,
    startTime: session.startTime || now,
    lastSavedAt: session.lastSavedAt || now,
    isCompleted: !!session.isCompleted,
    elapsed: typeof session.elapsed === 'number' ? session.elapsed : 0,
    instantFeedback: !!session.instantFeedback,
    feedbackMap: session.feedbackMap || {},
    answers: session.answers || {},
    userId: userId || '',
    createdAt: now,
    updatedAt: now,
  }
  await db.testSessions.add(s)
  return s
}

export async function updateTestSession(id, patch) {
  if (!patch || typeof patch !== 'object') return null
  const changes = { ...patch, updatedAt: Date.now() }
  if ('lastSavedAt' in changes && changes.lastSavedAt == null) {
    changes.lastSavedAt = Date.now()
  }
  await db.testSessions.update(id, changes)
  return db.testSessions.get(id)
}

export async function getUncompletedTestSession(testType, typeId, userId) {
  const sessions = await db.testSessions
    .where('testType').equals(testType)
    .filter(s => s.typeId === typeId && s.userId === userId && !s.isCompleted)
    .reverse()
    .sortBy('lastSavedAt')
  return sessions.length > 0 ? sessions[0] : null
}

export async function deleteTestSession(id) {
  await db.testSessions.delete(id)
}

// 获取指定用户的全部未完成测试会话（按最后保存时间倒序）
export async function getAllUnfinishedTestSessions(userId) {
  if (!userId) return []
  return db.testSessions
    .where('userId').equals(userId)
    .filter(s => !s.isCompleted)
    .reverse()
    .sortBy('lastSavedAt')
}

// 获取单条测试会话
export async function getTestSession(id) {
  if (!id) return null
  return db.testSessions.get(id)
}

// 重置测试会话的答题进度（保留题目，仅清空答案/进度/计时）
export async function clearTestSessionAnswers(id) {
  if (!id) return null
  return updateTestSession(id, {
    userAnswers: [],
    currentIndex: 0,
    elapsed: 0,
    feedbackMap: {},
    answers: {},
    startTime: Date.now(),
    lastSavedAt: Date.now(),
  })
}

// ============================================================
// v3 覆写：testQuestions 新 schema（覆盖上方同名旧函数）
// ============================================================

export async function addTestQuestions(questions, userId) {
  const now = Date.now()
  const items = questions.map(q => ({
    id: q.id || generateId(),
    userId: q.userId || userId || '',
    testType: String(q.testType || ''),
    targetId: String(q.targetId || ''),
    categoryId: q.categoryId != null ? String(q.categoryId) : (q.testType === 'category' ? String(q.targetId || '') : ''),
    chapterId: q.chapterId != null ? String(q.chapterId) : '',
    unitId: q.unitId != null ? String(q.unitId) : (q.testType === 'unit' ? String(q.targetId || '') : null),
    cardId: q.cardId != null ? String(q.cardId) : '',
    type: String(q.type || 'single_choice'),
    stem: String(q.stem || q.question || ''),
    options: Array.isArray(q.options) ? q.options : [],
    answer: String(q.answer || ''),
    analysis: String(q.analysis || q.explanation || ''),
    difficulty: typeof q.difficulty === 'number' ? q.difficulty : 3,
    knowledgePoint: String(q.knowledgePoint || ''),
    cardUpdatedAt: q.cardUpdatedAt || now,
    createdAt: now,
    updatedAt: now,
  }))
  await db.testQuestions.bulkAdd(items)
  return items
}

export async function getTestQuestionsByUnit(unitId) {
  return db.testQuestions.where('unitId').equals(unitId).toArray()
}

export async function getTestQuestionsByCategory(categoryId) {
  return db.testQuestions.where('categoryId').equals(categoryId).toArray()
}

export async function getTestQuestionsByChapter(chapterId) {
  return db.testQuestions.where('chapterId').equals(chapterId).toArray()
}

// 错题重做：根据给定 cardId 列表查询对应题目（testQuestions 表）
// 如果某张卡有多道题，全部返回；如果某张卡没有题目，会尝试从 cards 表回退
export async function getTestQuestionsByCardIds(cardIds) {
  if (!Array.isArray(cardIds) || cardIds.length === 0) return []
  const uniqueIds = [...new Set(cardIds)].filter(Boolean)
  if (uniqueIds.length === 0) return []

  // 用 Dexie anyOf 一次性查询
  let questions = []
  try {
    questions = await db.testQuestions.where('cardId').anyOf(uniqueIds).toArray()
  } catch (_) {
    // 回退：逐条查询
    for (const cid of uniqueIds) {
      try {
        const qs = await db.testQuestions.where('cardId').equals(cid).toArray()
        questions = questions.concat(qs)
      } catch (_) {}
    }
  }

  // 去重（按 question id）
  const seen = new Set()
  const unique = []
  for (const q of questions) {
    if (seen.has(q.id)) continue
    seen.add(q.id)
    unique.push(q)
  }

  // 如果有 cards 没有匹配到题目，从 cards 表回退一条简单题目
  const matchedCardIds = new Set(unique.map(q => q.cardId))
  for (const cid of uniqueIds) {
    if (matchedCardIds.has(cid)) continue
    try {
      const card = await db.cards.get(cid)
      if (card) {
        unique.push({
          id: `wr_${card.id}`,
          cardId: card.id,
          categoryId: card.categoryId || '',
          unitId: card.unitId || '',
          type: card.type || 'single_choice',
          stem: card.front || '',
          options: Array.isArray(card.options) ? card.options : [],
          answer: card.answer || '',
          analysis: card.back || '',
          difficulty: 3,
          knowledgePoint: '',
          createdAt: Date.now(),
        })
      }
    } catch (_) {}
  }
  return unique
}

// 错题重做：根据题目 id 列表查询（用于 cardId 为空、仅存 questionId 的错题记录）
export async function getTestQuestionsByIds(questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) return []
  const uniqueIds = [...new Set(questionIds)].filter(Boolean)
  if (uniqueIds.length === 0) return []
  try {
    return await db.testQuestions.where('id').anyOf(uniqueIds).toArray()
  } catch (_) {
    const results = []
    for (const qid of uniqueIds) {
      try {
        const q = await db.testQuestions.get(qid)
        if (q) results.push(q)
      } catch (_) {}
    }
    return results
  }
}

// 获取单个卡片（用于错题本展示题干）
export async function getCardById(cardId) {
  if (!cardId) return null
  try {
    return await db.cards.get(cardId)
  } catch (_) {
    return null
  }
}

// 批量获取卡片
export async function getCardsByIds(cardIds) {
  if (!Array.isArray(cardIds) || cardIds.length === 0) return {}
  const unique = [...new Set(cardIds)].filter(Boolean)
  const result = {}
  try {
    const cards = await db.cards.where('id').anyOf(unique).toArray()
    for (const c of cards) result[c.id] = c
  } catch (_) {
    // 回退：逐条查询
    for (const cid of unique) {
      try {
        const c = await db.cards.get(cid)
        if (c) result[cid] = c
      } catch (_) {}
    }
  }
  return result
}

export async function updateTestQuestion(id, patch) {
  if (!patch || typeof patch !== 'object') return null
  const changes = { ...patch, updatedAt: Date.now() }
  await db.testQuestions.update(id, changes)
  return db.testQuestions.get(id)
}

export async function deleteTestQuestion(id) {
  // 先获取题目信息，用于更新关联会话
  const question = await db.testQuestions.get(id)
  if (question) {
    const typeId = question.unitId || question.categoryId || ''
    const testType = question.unitId ? 'unit' : 'category'
    // 更新（而非删除）该题目所在单元/分类的未完成会话：
    // 从会话中移除已删除的题目，保留其他题目的答题进度
    if (typeId && testType) {
      const sessions = await db.testSessions
        .where('testType').equals(testType)
        .and(s => s.typeId === typeId && !s.isCompleted)
        .toArray()
      
      for (const session of sessions) {
        const questions = session.questions || []
        const answers = session.answers || {}
        
        // 从会话题目列表中移除已删除题目
        const filteredQuestions = questions.filter(q => q.id !== id)
        
        if (filteredQuestions.length === 0) {
          // 所有题目都被删除 → 清理整个会话
          await db.testSessions.delete(session.id)
        } else {
          // 移除对应答案
          const filteredAnswers = {}
          for (const k of Object.keys(answers)) {
            if (k !== id) filteredAnswers[k] = answers[k]
          }
          
          // 调整 currentIndex：跳到最近的有效题目
          let currentIndex = session.currentIndex || 0
          if (currentIndex >= filteredQuestions.length) {
            currentIndex = Math.max(0, filteredQuestions.length - 1)
          }
          
          await db.testSessions.update(session.id, {
            questions: filteredQuestions,
            answers: filteredAnswers,
            currentIndex,
          })
        }
      }
    }
  }
  await db.testQuestions.delete(id)
}

export async function deleteTestQuestionsByUnit(unitId) {
  // 批量删除前，先获取所有将被删除的题目 ID
  const questions = await db.testQuestions.where('unitId').equals(unitId).toArray()
  const deletedIds = questions.map(q => q.id)
  
  // 更新关联的未完成会话：移除已删除题目，保留其余进度
  if (deletedIds.length > 0) {
    const sessions = await db.testSessions
      .where('testType').equals('unit')
      .and(s => s.typeId === unitId && !s.isCompleted)
      .toArray()
    
    const deletedIdSet = new Set(deletedIds)
    for (const session of sessions) {
      const sessionQuestions = session.questions || []
      const sessionAnswers = session.answers || {}
      
      const filteredQuestions = sessionQuestions.filter(q => !deletedIdSet.has(q.id))
      
      if (filteredQuestions.length === 0) {
        await db.testSessions.delete(session.id)
      } else {
        const filteredAnswers = {}
        for (const k of Object.keys(sessionAnswers)) {
          if (!deletedIdSet.has(k)) filteredAnswers[k] = sessionAnswers[k]
        }
        
        let currentIndex = session.currentIndex || 0
        if (currentIndex >= filteredQuestions.length) {
          currentIndex = Math.max(0, filteredQuestions.length - 1)
        }
        
        await db.testSessions.update(session.id, {
          questions: filteredQuestions,
          answers: filteredAnswers,
          currentIndex,
        })
      }
    }
  }
  
  await db.testQuestions.where('unitId').equals(unitId).delete()
}

export async function deleteTestQuestionsByCategory(categoryId) {
  // 批量删除前，先获取所有将被删除的题目 ID
  const questions = await db.testQuestions.where('categoryId').equals(categoryId).toArray()
  const deletedIds = questions.map(q => q.id)
  
  // 更新关联的未完成会话：移除已删除题目，保留其余进度
  if (deletedIds.length > 0) {
    const sessions = await db.testSessions
      .where('testType').equals('category')
      .and(s => s.typeId === categoryId && !s.isCompleted)
      .toArray()
    
    const deletedIdSet = new Set(deletedIds)
    for (const session of sessions) {
      const sessionQuestions = session.questions || []
      const sessionAnswers = session.answers || {}
      
      const filteredQuestions = sessionQuestions.filter(q => !deletedIdSet.has(q.id))
      
      if (filteredQuestions.length === 0) {
        await db.testSessions.delete(session.id)
      } else {
        const filteredAnswers = {}
        for (const k of Object.keys(sessionAnswers)) {
          if (!deletedIdSet.has(k)) filteredAnswers[k] = sessionAnswers[k]
        }
        
        let currentIndex = session.currentIndex || 0
        if (currentIndex >= filteredQuestions.length) {
          currentIndex = Math.max(0, filteredQuestions.length - 1)
        }
        
        await db.testSessions.update(session.id, {
          questions: filteredQuestions,
          answers: filteredAnswers,
          currentIndex,
        })
      }
    }
  }
  
  await db.testQuestions.where('categoryId').equals(categoryId).delete()
}

export async function createDataSnapshot() {
  const [
    knowledgeTree,
    cards,
    cardStatus,
    bookmarks,
    wrongAnswers,
    testQuestions,
    testRecords,
    testSessions,
    reviewHistory,
    studyPlans,
  ] = await Promise.all([
    db.knowledgeTree.toArray(),
    db.cards.toArray(),
    db.cardStatus.toArray(),
    db.bookmarks.toArray(),
    db.wrongAnswers.toArray(),
    db.testQuestions.toArray(),
    db.testRecords.toArray(),
    db.testSessions.toArray(),
    db.reviewHistory.toArray(),
    db.studyPlans.toArray(),
  ])
  return {
    createdAt: Date.now(),
    tables: { knowledgeTree, cards, cardStatus, bookmarks, wrongAnswers, testQuestions, testRecords, testSessions, reviewHistory, studyPlans },
  }
}

export async function restoreDataSnapshot(snapshot) {
  if (!snapshot || !snapshot.tables) throw new Error('无效的数据快照，无法撤销')
  await db.transaction(
    'rw',
    db.knowledgeTree, db.cards, db.cardStatus, db.bookmarks, db.wrongAnswers,
    db.testQuestions, db.testRecords, db.testSessions, db.reviewHistory, db.studyPlans,
    async () => {
      await db.knowledgeTree.clear()
      await db.cards.clear()
      await db.cardStatus.clear()
      await db.bookmarks.clear()
      await db.wrongAnswers.clear()
      await db.testQuestions.clear()
      await db.testRecords.clear()
      await db.testSessions.clear()
      await db.reviewHistory.clear()
      await db.studyPlans.clear()

      if (snapshot.tables.knowledgeTree?.length) await db.knowledgeTree.bulkAdd(snapshot.tables.knowledgeTree)
      if (snapshot.tables.categories?.length) {
        for (const cat of snapshot.tables.categories) {
          await db.knowledgeTree.add({
            ...cat,
            parentId: null,
            level: 'category',
            categoryId: cat.id,
            topicId: null,
            chapterId: null,
            unitId: null,
            updatedAt: cat.updatedAt || Date.now(),
          })
        }
      }
      if (snapshot.tables.topics?.length) {
        for (const topic of snapshot.tables.topics) {
          await db.knowledgeTree.add({
            ...topic,
            parentId: topic.categoryId,
            level: 'topic',
            categoryId: topic.categoryId,
            topicId: topic.id,
            chapterId: null,
            unitId: null,
            updatedAt: topic.updatedAt || Date.now(),
          })
        }
      }
      if (snapshot.tables.chapters?.length) {
        for (const chapter of snapshot.tables.chapters) {
          await db.knowledgeTree.add({
            ...chapter,
            parentId: chapter.topicId || chapter.categoryId,
            level: 'chapter',
            categoryId: chapter.categoryId,
            topicId: chapter.topicId || null,
            chapterId: chapter.id,
            unitId: null,
            updatedAt: chapter.updatedAt || Date.now(),
          })
        }
      }
      if (snapshot.tables.units?.length) {
        for (const unit of snapshot.tables.units) {
          await db.knowledgeTree.add({
            ...unit,
            parentId: unit.chapterId || unit.categoryId,
            level: 'unit',
            categoryId: unit.categoryId,
            chapterId: unit.chapterId || null,
            unitId: unit.id,
            updatedAt: unit.updatedAt || Date.now(),
          })
        }
      }
      if (snapshot.tables.cards?.length) await db.cards.bulkAdd(snapshot.tables.cards)
      if (snapshot.tables.cardStatus?.length) await db.cardStatus.bulkAdd(snapshot.tables.cardStatus)
      if (snapshot.tables.bookmarks?.length) await db.bookmarks.bulkAdd(snapshot.tables.bookmarks)
      if (snapshot.tables.wrongAnswers?.length) await db.wrongAnswers.bulkAdd(snapshot.tables.wrongAnswers)
      if (snapshot.tables.testQuestions?.length) await db.testQuestions.bulkAdd(snapshot.tables.testQuestions)
      if (snapshot.tables.testRecords?.length) await db.testRecords.bulkAdd(snapshot.tables.testRecords)
      if (snapshot.tables.testSessions?.length) await db.testSessions.bulkAdd(snapshot.tables.testSessions)
      if (snapshot.tables.reviewHistory?.length) await db.reviewHistory.bulkAdd(snapshot.tables.reviewHistory)
      if (snapshot.tables.studyPlans?.length) await db.studyPlans.bulkAdd(snapshot.tables.studyPlans)
    },
  )
}

// 清除所有本地数据（清空所有表）
export async function clearAllLocalData() {
  await db.transaction(
    'rw',
    db.knowledgeTree, db.cards, db.cardStatus, db.bookmarks, db.wrongAnswers,
    db.testQuestions, db.testRecords, db.testSessions, db.ocrCache, db.reviewHistory, db.studyPlans,
    async () => {
      await db.knowledgeTree.clear()
      await db.cards.clear()
      await db.cardStatus.clear()
      await db.bookmarks.clear()
      await db.wrongAnswers.clear()
      await db.testQuestions.clear()
      await db.testRecords.clear()
      await db.testSessions.clear()
      await db.ocrCache.clear()
      await db.reviewHistory.clear()
      await db.studyPlans.clear()
    },
  )

  // 清除 localStorage 中与背诵相关的数据，防止清除数据后背诵页面显示残留章节
  localStorage.removeItem('memorize_category')
  localStorage.removeItem('memorize_mode')
  localStorage.removeItem('seed_usage_guide_v2')
  localStorage.removeItem('app_local_logged_in')
  localStorage.removeItem('app_local_username')

  // 清除所有背诵进度记录（memorize_progress_* 格式的键）
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('memorize_progress_')) {
      localStorage.removeItem(key)
    }
  })
}

export default db

// ============================================================
// 复习历史 - reviewHistory 表 CRUD
// ============================================================

/**
 * 添加一条复习历史记录
 * @param {Object} record - { cardId, categoryId, wasMastered, mode }
 * @param {boolean} record.wasMastered - true=标记为已掌握，false=标记为待掌握
 * @param {string} record.mode - 操作来源模式：'ebbinghaus'|'sequential'|'active'|'weak'|'test'
 */
export async function addReviewHistory(record) {
  const { cardId, categoryId, chapterId = '', wasMastered, mode = 'sequential' } = record
  if (!cardId) return null

  const id = generateId()
  const reviewedAt = Date.now()

  await db.reviewHistory.add({
    id,
    cardId,
    categoryId,
    chapterId,
    wasMastered,
    reviewedAt,
    mode,
  })

  return { id, cardId, categoryId, chapterId, wasMastered, reviewedAt, mode }
}

/**
 * 获取某卡片的所有复习历史（按时间倒序）
 */
export async function getReviewHistoryByCard(cardId) {
  if (!cardId) return []
  return db.reviewHistory
    .where('cardId')
    .equals(cardId)
    .reverse()
    .sortBy('reviewedAt')
}

/**
 * 获取某分类的所有复习历史（按时间倒序）
 */
export async function getReviewHistoryByCategory(categoryId) {
  if (!categoryId) return []
  return db.reviewHistory
    .where('categoryId')
    .equals(categoryId)
    .reverse()
    .sortBy('reviewedAt')
}

/**
 * 获取最近 N 天的复习历史（用于活动统计）
 * @param {number} days - 天数
 */
export async function getReviewHistoryRecent(days = 7) {
  const now = Date.now()
  const startTime = now - days * 24 * 60 * 60 * 1000
  return db.reviewHistory
    .where('reviewedAt')
    .aboveOrEqual(startTime)
    .toArray()
}

/**
 * 获取复习历史的统计信息（按天聚合）
 * @param {number} days - 天数
 */
export async function getReviewHistoryStats(days = 7) {
  const records = await getReviewHistoryRecent(days)
  const stats = {}

  for (const r of records) {
    const date = new Date(r.reviewedAt).toISOString().split('T')[0] // 'YYYY-MM-DD'
    if (!stats[date]) {
      stats[date] = { total: 0, mastered: 0, review: 0 }
    }
    stats[date].total++
    if (r.wasMastered) {
      stats[date].mastered++
    } else {
      stats[date].review++
    }
  }

  return stats
}

// ============================================================
// 学习计划 - studyPlans 表 CRUD
// ============================================================

/**
 * 默认学习计划
 */
export const DEFAULT_STUDY_PLAN = {
  dailyReviewLimit: 50,   // 每日复习上限
  dailyNewLimit: 20,     // 每日新学上限
  priority: 'medium',     // 优先级：low | medium | high
}

/**
 * 更新或插入学习计划（upsert）
 * @param {Object} plan - { categoryId, dailyReviewLimit?, dailyNewLimit?, priority? }
 */
export async function upsertStudyPlan(plan) {
  const { categoryId, chapterId } = plan
  if (!categoryId) return null

  const id = generateId()
  const now = Date.now()

  // 查询是否存在：按 categoryId + chapterId 组合查找
  let existing
  if (chapterId) {
    existing = await db.studyPlans
      .where('categoryId').equals(categoryId)
      .filter(p => (p.chapterId || '') === chapterId)
      .first()
  } else {
    existing = await db.studyPlans
      .where('categoryId').equals(categoryId)
      .filter(p => !p.chapterId || p.chapterId === '')
      .first()
  }

  if (existing) {
    // 更新
    const updated = {
      ...existing,
      dailyReviewLimit: plan.dailyReviewLimit ?? existing.dailyReviewLimit ?? DEFAULT_STUDY_PLAN.dailyReviewLimit,
      dailyNewLimit: plan.dailyNewLimit ?? existing.dailyNewLimit ?? DEFAULT_STUDY_PLAN.dailyNewLimit,
      priority: plan.priority ?? existing.priority ?? DEFAULT_STUDY_PLAN.priority,
      updatedAt: now,
    }
    await db.studyPlans.update(existing.id, updated)
    return updated
  } else {
    // 插入
    const newPlan = {
      id,
      categoryId,
      chapterId: chapterId || '',
      dailyReviewLimit: plan.dailyReviewLimit ?? DEFAULT_STUDY_PLAN.dailyReviewLimit,
      dailyNewLimit: plan.dailyNewLimit ?? DEFAULT_STUDY_PLAN.dailyNewLimit,
      priority: plan.priority ?? DEFAULT_STUDY_PLAN.priority,
      createdAt: now,
      updatedAt: now,
    }
    await db.studyPlans.add(newPlan)
    return newPlan
  }
}

/**
 * 获取某分类的学习计划（不存在时返回默认值）
 * @param {string} categoryId
 * @param {string} [chapterId] - 可选，按章节筛选
 */
export async function getStudyPlanByCategory(categoryId, chapterId = '') {
  if (!categoryId) return { ...DEFAULT_STUDY_PLAN, categoryId: null, chapterId: '' }

  let plan
  if (chapterId) {
    plan = await db.studyPlans
      .where('categoryId').equals(categoryId)
      .filter(p => (p.chapterId || '') === chapterId)
      .first()
  } else {
    plan = await db.studyPlans
      .where('categoryId').equals(categoryId)
      .filter(p => !p.chapterId || p.chapterId === '')
      .first()
  }

  if (plan) return plan

  // 返回默认值
  return {
    id: null,
    categoryId,
    chapterId: chapterId || '',
    ...DEFAULT_STUDY_PLAN,
    createdAt: null,
    updatedAt: null,
  }
}

/**
 * 获取某章节的学习计划（不存在时返回默认值）
 * @param {string} categoryId
 * @param {string} chapterId
 */
export async function getStudyPlanByChapter(categoryId, chapterId) {
  return getStudyPlanByCategory(categoryId, chapterId)
}

/**
 * 获取全部学习计划
 */
export async function getAllStudyPlans() {
  return db.studyPlans.toArray()
}

/**
 * 删除某分类的学习计划（可选按章节）
 * @param {string} categoryId
 * @param {string} [chapterId] - 可选，按章节删除
 */
export async function deleteStudyPlan(categoryId, chapterId) {
  if (!categoryId) return 0
  if (chapterId) {
    const plans = await db.studyPlans
      .where('categoryId').equals(categoryId)
      .filter(p => (p.chapterId || '') === chapterId)
      .toArray()
    let count = 0
    for (const p of plans) {
      await db.studyPlans.delete(p.id)
      count++
    }
    return count
  }
  return db.studyPlans.where('categoryId').equals(categoryId).delete()
}

// ============================================================
// 账号页统计函数 - 艾宾浩斯相关统计
// ============================================================

/**
 * 获取到期卡片数量
 * 到期 = nextReviewAt <= now 或 无记录的卡片（新卡片视为立即到期）
 */
export async function getDueCardsCount() {
  try {
    const now = Date.now()

    // 方法：使用 filter() 替代 where().belowOrEqual()，避免 IndexedDB 索引限制
    // 这样即使 nextReviewAt 索引有问题，也能正确过滤
    const allStatuses = await db.cardStatus.toArray()
    const dueCount = allStatuses.filter(s => (s.nextReviewAt || 0) <= now).length

    // 无记录的卡片（视为新卡片，立即可学）
    let totalCards = 0
    try {
      totalCards = await db.cards.count()
    } catch (e) {
      console.warn('getDueCardsCount: 统计总卡片失败', e.message)
    }

    const newCards = Math.max(0, totalCards - allStatuses.length)
    return dueCount + newCards
  } catch (e) {
    console.warn('getDueCardsCount: 整体失败，返回 0:', e.message)
    return 0
  }
}

/**
 * 获取长期记忆卡片数量（repetitions >= 5）
 */
export async function getLongTermCardsCount() {
  const allStatuses = await db.cardStatus.toArray()
  return allStatuses.filter(s => (s.repetitions || 0) >= 5).length
}

/**
 * 获取平均复习间隔
 * @returns {number|null} 所有 interval>0 的记录的平均值（保留1位小数），无记录时返回 null
 */
export async function getAverageInterval() {
  const allStatuses = await db.cardStatus.toArray()
  const intervals = allStatuses.filter(s => (s.interval || 0) > 0).map(s => s.interval)
  
  if (intervals.length === 0) return null
  
  const avg = intervals.reduce((sum, i) => sum + i, 0) / intervals.length
  return Math.round(avg * 10) / 10
}

/**
 * 获取连续学习天数
 * 从 reviewHistory 中提取所有 reviewedAt 的日期（YYYY-MM-DD 去重），从今天开始向前检查连续有记录的天数
 * @returns {number} 连续天数（0 表示今天/昨天都没有学习）
 */
export async function getStreakDays() {
  const records = await db.reviewHistory.toArray()
  
  if (records.length === 0) return 0
  
  // 提取所有日期（YYYY-MM-DD 格式）并去重
  const dateSet = new Set()
  for (const r of records) {
    const date = new Date(r.reviewedAt).toISOString().split('T')[0]
    dateSet.add(date)
  }
  
  const sortedDates = Array.from(dateSet).sort().reverse() // 降序排列
  
  if (sortedDates.length === 0) return 0
  
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
  // 检查是否今天或昨天有记录
  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
    return 0
  }
  
  // 从今天（或昨天）开始向前计算连续天数
  let streak = 0
  let currentDate = new Date(sortedDates[0])
  
  for (const date of sortedDates) {
    const expectedDate = currentDate.toISOString().split('T')[0]
    if (date === expectedDate) {
      streak++
      currentDate = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000)
    } else if (date < expectedDate) {
      // 中间断开
      break
    }
  }
  
  return streak
}

// ============================================================
// v7 新增：章节 (chapters) CRUD
// ============================================================

/**
 * 创建章节
 * @param {string} categoryId - 所属分类 ID
 * @param {string} name - 章节名称
 * @param {string|null} topicId - 所属主题 ID（可选）
 * @returns {Object} 创建的章节对象
 */
export async function addChapter(categoryId, name, topicId = null) {
  const ex = await db.knowledgeTree.where('level').equals('chapter').and(n => n.categoryId === categoryId).count()
  const now = Date.now()
  const chapter = {
    id: generateId(),
    parentId: topicId || categoryId,
    level: 'chapter',
    categoryId,
    name: String(name || '新章节').trim() || '新章节',
    topicId,
    createdAt: now,
    updatedAt: now,
    order: ex,
  }
  await db.knowledgeTree.add(chapter)
  return chapter
}

/**
 * 获取某分类下的所有章节（按 order 排序）
 * @param {string} categoryId
 * @returns {Array} 章节列表
 */
export async function getChaptersByCategory(categoryId) {
  return db.knowledgeTree.where('level').equals('chapter').and(n => n.categoryId === categoryId).sortBy('order')
}

export async function getUnitsByChapter(chapterId) {
  return db.knowledgeTree.where('level').equals('unit').and(n => n.chapterId === chapterId).sortBy('order')
}

export async function getCardsByChapter(chapterId) {
  const units = await db.knowledgeTree.where('level').equals('unit').and(n => n.chapterId === chapterId).toArray()
  const allCards = []
  for (const unit of units) {
    const cards = await db.cards.where('unitId').equals(unit.id).sortBy('order')
    allCards.push(...cards.map(c => ({ ...c, unitName: unit.name })))
  }
  return allCards
}

export async function updateChapter(id, updates) {
  if (!updates || typeof updates !== 'object') return null
  const changes = { ...updates, updatedAt: Date.now() }
  if ('name' in changes) {
    changes.name = String(changes.name ?? '').trim()
    if (!changes.name) return null
  }
  await db.knowledgeTree.update(id, changes)
  return db.knowledgeTree.where('level').equals('chapter').and(n => n.id === id).first()
}

/**
 * 删除章节
 * - 将章节下所有单元的 chapterId 设为 null
 * - 将相关卡片、错题、状态、题目、记录的 chapterId 设为 null
 * @param {string} id - 章节 ID
 */
export async function deleteChapter(id) {
  const chapterUnits = await db.knowledgeTree.where('level').equals('unit').and(n => n.chapterId === id).toArray()
  const unitIds = new Set(chapterUnits.map(u => u.id))

  for (const uid of unitIds) {
    await deleteUnit(uid)
  }

  await db.knowledgeTree.where('level').equals('chapter').and(n => n.id === id).delete()
}

/**
 * 删除某分类下无卡片的空章节
 * @param {string} categoryId
 * @returns {number} 删除的空章节数量
 */
export async function deleteEmptyChapters(categoryId) {
  if (!categoryId) return 0
  let deleted = 0

  await db.transaction('rw', db.knowledgeTree, db.cards, async () => {
    const chapters = await db.knowledgeTree.where('level').equals('chapter').and(n => n.categoryId === categoryId).toArray()
    for (const chapter of chapters) {
      const units = await db.knowledgeTree.where('level').equals('unit').and(n => n.chapterId === chapter.id).toArray()
      let cardCount = 0
      for (const unit of units) {
        cardCount += await db.cards.where('unitId').equals(unit.id).count()
      }
      if (cardCount === 0) {
        cardCount = await db.cards.where('chapterId').equals(chapter.id).count()
      }
      if (cardCount === 0) {
        await db.knowledgeTree.delete(chapter.id)
        deleted += 1
      }
    }
  })

  return deleted
}

export async function getChapterCountByCategory(categoryId) {
  if (!categoryId) return 0
  return db.knowledgeTree.where('level').equals('chapter').and(n => n.categoryId === categoryId).count()
}

/**
 * 获取所有分类下的章节总数
 * @returns {number}
 */
export async function getChapterCount() {
  return db.knowledgeTree.where('level').equals('chapter').count()
}

// ============================================================
// v10 新增：主题 (topics) CRUD
// ============================================================

/**
 * 获取某分类下的所有主题（按创建时间排序）
 * @param {string} categoryId - 所属分类 ID
 * @returns {Array} 主题列表
 */
export async function getTopicsByCategory(categoryId) {
  if (!categoryId) return []
  return db.knowledgeTree.where('level').equals('topic').and(n => n.categoryId === categoryId).sortBy('createdAt')
}

/**
 * 创建主题
 * @param {string} categoryId - 所属分类 ID
 * @param {string} name - 主题名称
 * @returns {Object} 创建的主题对象
 */
export async function createTopic(categoryId, name) {
  const now = Date.now()
  const topic = {
    id: generateId(),
    parentId: categoryId,
    level: 'topic',
    categoryId,
    name: String(name || '新主题').trim() || '新主题',
    createdAt: now,
    updatedAt: now,
  }
  await db.knowledgeTree.add(topic)
  return topic
}

export async function getTopicByName(categoryId, name) {
  if (!categoryId || !name) return null
  const topics = await db.knowledgeTree.where('level').equals('topic').and(n => n.categoryId === categoryId).toArray()
  return topics.find(t => t.name === name) || null
}

export async function getChaptersByTopic(topicId) {
  if (!topicId) return []
  return db.knowledgeTree.where('level').equals('chapter').and(n => n.topicId === topicId).sortBy('order')
}

export async function getTopicById(topicId) {
  if (!topicId) return null
  return db.knowledgeTree.where('level').equals('topic').and(n => n.id === topicId).first()
}

export async function updateTopic(topicId, updates) {
  if (!topicId) return
  const updateData = { ...updates, updatedAt: Date.now() }
  if (updateData.name) {
    updateData.name = String(updateData.name).trim()
  }
  await db.knowledgeTree.update(topicId, updateData)
}

export async function deleteTopic(topicId) {
  if (!topicId) return
  const chapters = await db.knowledgeTree.where('level').equals('chapter').and(n => n.topicId === topicId).toArray()
  for (const chapter of chapters) {
    await db.knowledgeTree.update(chapter.id, { topicId: null, updatedAt: Date.now() })
  }
  await db.knowledgeTree.where('level').equals('topic').and(n => n.id === topicId).delete()
}

async function updateCardRelations(cardId, categoryId, chapterId, unitId) {
  const statuses = await db.cardStatus.where('cardId').equals(cardId).toArray()
  for (const status of statuses) {
    await db.cardStatus.update(status.id, {
      categoryId,
      chapterId,
      updatedAt: Date.now(),
    })
  }

  const wrongs = await db.wrongAnswers.where('cardId').equals(cardId).toArray()
  for (const wrong of wrongs) {
    await db.wrongAnswers.update(wrong.id, {
      categoryId,
      chapterId,
      unitId,
    })
  }

  const questions = await db.testQuestions.where('cardId').equals(cardId).toArray()
  for (const question of questions) {
    const nextTargetId = question.testType === 'unit'
      ? unitId
      : question.testType === 'category'
        ? categoryId
        : (question.testType === 'chapter' ? chapterId : (question.targetId || categoryId))

    await db.testQuestions.update(question.id, {
      categoryId,
      unitId,
      chapterId,
      targetId: nextTargetId,
      updatedAt: Date.now(),
    })

    await db.testRecords.where('questionId').equals(question.id).modify({
      categoryId,
      unitId,
      chapterId,
      updatedAt: Date.now(),
    })
  }

  const histories = await db.reviewHistory.where('cardId').equals(cardId).toArray()
  for (const history of histories) {
    await db.reviewHistory.update(history.id, {
      categoryId,
      chapterId,
    })
  }
}

export async function moveUnit(unitId, { targetCategoryId, targetChapterId, targetUnitId }) {
  if (!unitId) {
    throw new Error('unitId 不能为空')
  }
  if (!targetCategoryId) {
    throw new Error('targetCategoryId 不能为空')
  }

  const unit = await db.knowledgeTree.where('level').equals('unit').and(n => n.id === unitId).first()
  if (!unit) {
    throw new Error(`单元不存在: ${unitId}`)
  }

  const cards = await db.cards.where('unitId').equals(unitId).toArray()
  const originalCategoryId = unit.categoryId

  let result = {
    movedCards: 0,
    movedUnit: false,
    deletedEmptyUnits: 0,
    deletedEmptyChapters: 0,
    deletedEmptyCategories: 0,
  }

  await db.transaction(
    'rw',
    db.knowledgeTree, db.cards, db.cardStatus, db.wrongAnswers, db.testQuestions, db.testRecords, db.reviewHistory,
    async () => {
      if (targetUnitId) {
        const targetUnit = await db.knowledgeTree.where('level').equals('unit').and(n => n.id === targetUnitId).first()
        if (!targetUnit || targetUnit.categoryId !== targetCategoryId) {
          throw new Error('目标单元不存在或与目标分类不匹配')
        }

        for (const card of cards) {
          await db.cards.update(card.id, {
            categoryId: targetCategoryId,
            chapterId: targetUnit.chapterId,
            unitId: targetUnitId,
            updatedAt: Date.now(),
          })

          await updateCardRelations(card.id, targetCategoryId, targetUnit.chapterId, targetUnitId)
        }

        await db.knowledgeTree.delete(unitId)
        result.movedCards = cards.length
        result.movedUnit = true

      } else {
        await db.knowledgeTree.update(unitId, {
          categoryId: targetCategoryId,
          chapterId: targetChapterId || null,
          updatedAt: Date.now(),
        })

        for (const card of cards) {
          await db.cards.update(card.id, {
            categoryId: targetCategoryId,
            chapterId: targetChapterId || null,
            updatedAt: Date.now(),
          })

          await updateCardRelations(card.id, targetCategoryId, targetChapterId || null, unitId)
        }

        result.movedCards = cards.length
        result.movedUnit = true
      }
    }
  )

  if (originalCategoryId && originalCategoryId !== targetCategoryId) {
    const emptyResult = await deleteEmptyUnits(originalCategoryId)
    result.deletedEmptyUnits = emptyResult.deletedUnits || 0
    result.deletedEmptyChapters = emptyResult.deletedEmptyChapters || 0
    const deletedCategory = await deleteEmptyCategory(originalCategoryId)
    result.deletedEmptyCategories = deletedCategory ? 1 : 0
  }

  return result
}

export async function moveChapter(chapterId, targetCategoryId) {
  if (!chapterId || !targetCategoryId) {
    throw new Error('chapterId 和 targetCategoryId 不能为空')
  }

  const chapter = await db.knowledgeTree.where('level').equals('chapter').and(n => n.id === chapterId).first()
  if (!chapter) {
    throw new Error(`章节不存在: ${chapterId}`)
  }

  const units = await db.knowledgeTree.where('level').equals('unit').and(n => n.chapterId === chapterId).toArray()
  const originalCategoryId = chapter.categoryId

  let result = {
    movedUnits: 0,
    movedCards: 0,
    deletedEmptyCategories: 0,
  }

  await db.transaction(
    'rw',
    db.knowledgeTree, db.cards, db.cardStatus, db.wrongAnswers, db.testQuestions, db.testRecords, db.reviewHistory,
    async () => {
      await db.knowledgeTree.update(chapterId, {
        categoryId: targetCategoryId,
        updatedAt: Date.now(),
      })

      for (const unit of units) {
        await db.knowledgeTree.update(unit.id, {
          categoryId: targetCategoryId,
          updatedAt: Date.now(),
        })

        const cards = await db.cards.where('unitId').equals(unit.id).toArray()
        for (const card of cards) {
          await db.cards.update(card.id, {
            categoryId: targetCategoryId,
            updatedAt: Date.now(),
          })

          await updateCardRelations(card.id, targetCategoryId, chapterId, unit.id)
        }

        result.movedCards += cards.length
      }

      result.movedUnits = units.length
    }
  )

  if (originalCategoryId && originalCategoryId !== targetCategoryId) {
    const deletedCategory = await deleteEmptyCategory(originalCategoryId)
    result.deletedEmptyCategories = deletedCategory ? 1 : 0
  }

  return result
}

// ============================================================
// Drafts 草稿 CRUD（悬浮窗快速录入）
// ============================================================

/**
 * 新建草稿
 * @param {Object} params - { content, categoryId, chapterId, unitId, source, templateType }
 * @returns {Object} 创建的草稿对象
 */
export async function addDraft({ content, categoryId, chapterId = null, unitId = null, source = 'floating', templateType = null }) {
  const draft = {
    id: generateId(),
    content: String(content || '').trim(),
    categoryId,
    chapterId,
    unitId,
    source,
    templateType,
    status: 'pending',
    retryCount: 0,
    errorMessage: null,
    createdAt: Date.now(),
    generatedAt: null,
  }
  await db.drafts.add(draft)
  return draft
}

/**
 * 获取所有待生成草稿（按 createdAt 升序）
 * @returns {Array} 草稿列表
 */
export async function getPendingDrafts() {
  return db.drafts.where('status').equals('pending').sortBy('createdAt')
}

/**
 * 获取指定分类下的待生成草稿
 * @param {string} categoryId
 * @returns {Array}
 */
export async function getPendingDraftsByCategory(categoryId) {
  return db.drafts
    .where('categoryId').equals(categoryId)
    .and(d => d.status === 'pending')
    .sortBy('createdAt')
}

/**
 * 根据 ID 获取单条草稿
 * @param {string} id
 * @returns {Object|undefined}
 */
export async function getDraftById(id) {
  return db.drafts.get(id)
}

/**
 * 获取最近 N 条草稿（用于快速回忆条）
 * @param {number} limit
 * @returns {Array}
 */
export async function getRecentDrafts(limit = 3) {
  const all = await db.drafts.orderBy('createdAt').reverse().limit(limit).toArray()
  return all
}

/**
 * 获取草稿总数（按状态筛选）
 * @param {string} status - 'pending' / 'generating' / 'done' / 'failed' / undefined（全部）
 * @returns {number}
 */
export async function getDraftCount(status) {
  if (!status) return db.drafts.count()
  return db.drafts.where('status').equals(status).count()
}

/**
 * 更新草稿
 * @param {string} id
 * @param {Object} patch
 */
export async function updateDraft(id, patch) {
  await db.drafts.update(id, patch)
}

/**
 * 删除草稿
 * @param {string} id
 */
export async function deleteDraft(id) {
  await db.drafts.delete(id)
}

/**
 * 批量删除草稿（按状态）
 * @param {string} status
 */
export async function deleteDraftsByStatus(status) {
  return db.drafts.where('status').equals(status).delete()
}

/**
 * 向已有单元追加卡片（悬浮窗草稿生成时使用）
 * @param {string} unitId - 目标单元 ID
 * @param {string} categoryId - 所属分类 ID
 * @param {Array} cards - [{ front, back, knowledge_point, type, options, answerBlank, chapterId }]
 * @returns {Array} 创建的卡片数组
 */
export async function addCardsToUnit(unitId, categoryId, cards) {
  if (!unitId) throw new Error('unitId 不能为空')
  if (!Array.isArray(cards) || cards.length === 0) return []

  // 获取当前单元下卡片数量，作为 order 起点
  const existingCount = await db.cards.where('unitId').equals(unitId).count()

  const newCards = cards.map((c, i) => ({
    id: generateId(),
    unitId,
    categoryId,
    chapterId: c.chapterId || null,
    front: c.front || '',
    back: c.back || '',
    knowledge_point: c.knowledge_point || null,
    createdAt: Date.now(),
    order: existingCount + i,
    type: c.type || 'qa',
    options: c.options || null,
    answerBlank: c.answerBlank || null,
  }))

  await db.cards.bulkAdd(newCards)
  return newCards
}

// ============================================================
// Knowledge Tree 单表查询函数（v14 新增）
// 支持完整层级：分类 → 主题 → 章节 → 单元 → 知识点 → 卡片
// ============================================================

/**
 * 获取分类下完整的知识树结构
 * @param {string} categoryId - 分类 ID
 * @returns {Promise<Object>} 树结构对象
 */
export async function getKnowledgeTreeByCategory(categoryId) {
  if (!categoryId) return { topics: [], chapters: [], units: [], knowledgePoints: [], cards: [] }

  const nodes = await db.knowledgeTree.where('categoryId').equals(categoryId).toArray()
  
  const topics = []
  const chapters = []
  const units = []
  const knowledgePoints = []
  const cards = []

  for (const node of nodes) {
    if (node.level === 'topic') {
      topics.push(node)
    } else if (node.level === 'chapter') {
      chapters.push(node)
    } else if (node.level === 'unit') {
      units.push(node)
    } else if (node.level === 'knowledge_point') {
      knowledgePoints.push(node)
    } else if (node.level === 'card') {
      cards.push(node)
    }
  }

  return { topics, chapters, units, knowledgePoints, cards, allNodes: nodes }
}

/**
 * 获取指定父节点下的子节点
 * @param {string|null} parentId - 父节点 ID（分类为 null）
 * @returns {Promise<Array>} 子节点数组
 */
export async function getKnowledgeTreeNodesByParentId(parentId) {
  if (parentId === null) {
    return db.knowledgeTree.where('parentId').equals(parentId).sortBy('order')
  }
  return db.knowledgeTree.where('parentId').equals(parentId).sortBy('order')
}

/**
 * 获取指定层级的节点
 * @param {string} level - 'category' | 'topic' | 'chapter' | 'unit' | 'knowledge_point' | 'card'
 * @param {string} [categoryId] - 可选，按分类过滤
 * @returns {Promise<Array>} 节点数组
 */
export async function getKnowledgeTreeNodesByLevel(level, categoryId) {
  let query = db.knowledgeTree.where('level').equals(level)
  if (categoryId) {
    query = query.and(n => n.categoryId === categoryId)
  }
  return query.sortBy('order')
}

/**
 * 构建知识树的树形结构
 * @param {Array} nodes - 所有节点数组
 * @param {string|null} rootId - 根节点 ID（分类为 null）
 * @returns {Array} 树形结构
 */
export function buildKnowledgeTree(nodes, rootId = null) {
  const nodeMap = new Map()
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [] })
  }

  const tree = []
  for (const node of nodes) {
    const parentId = node.parentId
    const current = nodeMap.get(node.id)
    if (parentId === rootId) {
      tree.push(current)
    } else if (nodeMap.has(parentId)) {
      nodeMap.get(parentId).children.push(current)
    }
  }

  tree.sort((a, b) => (a.order || 0) - (b.order || 0))

  function sortChildren(node) {
    node.children.sort((a, b) => (a.order || 0) - (b.order || 0))
    for (const child of node.children) {
      sortChildren(child)
    }
  }

  for (const node of tree) {
    sortChildren(node)
  }

  return tree
}

/**
 * 获取单元下的知识点
 * @param {string} unitId - 单元 ID
 * @returns {Promise<Array>} 知识点数组
 */
export async function getKnowledgePointsByUnit(unitId) {
  if (!unitId) return []
  return db.knowledgeTree
    .where('parentId').equals(unitId)
    .and(n => n.level === 'knowledge_point')
    .sortBy('order')
}

/**
 * 获取知识点下的卡片
 * @param {string} knowledgePointId - 知识点 ID
 * @returns {Promise<Array>} 卡片数组
 */
export async function getCardsByKnowledgePoint(knowledgePointId) {
  if (!knowledgePointId) return []
  return db.knowledgeTree
    .where('parentId').equals(knowledgePointId)
    .and(n => n.level === 'card')
    .sortBy('order')
}

/**
 * 从 knowledgeTree 读取草稿（状态为 pending/generating/failed 的卡片级节点）
 * @param {string} [categoryId] - 可选，按分类过滤
 * @returns {Promise<Array>} 草稿数组
 */
export async function getDraftsFromKnowledgeTree(categoryId) {
  let query = db.knowledgeTree
    .where('level').equals('card')
    .and(n => ['pending', 'generating', 'failed'].includes(n.status))
  
  if (categoryId) {
    query = query.and(n => n.categoryId === categoryId)
  }
  
  return query.sortBy('createdAt')
}

/**
 * 获取草稿数量（从 knowledgeTree）
 * @param {string} status - 状态过滤
 * @param {string} [categoryId] - 可选，按分类过滤
 * @returns {Promise<number>} 草稿数量
 */
export async function getDraftCountFromKnowledgeTree(status, categoryId) {
  let query = db.knowledgeTree.where('level').equals('card')
  
  if (status) {
    query = query.and(n => n.status === status)
  } else {
    query = query.and(n => ['pending', 'generating', 'failed'].includes(n.status))
  }
  
  if (categoryId) {
    query = query.and(n => n.categoryId === categoryId)
  }
  
  return query.count()
}

/**
 * 更新 knowledgeTree 节点
 * @param {string} id - 节点 ID
 * @param {Object} patch - 更新内容
 * @returns {Promise}
 */
export async function updateKnowledgeTreeNode(id, patch) {
  await db.knowledgeTree.update(id, { ...patch, updatedAt: Date.now() })
}

/**
 * 删除 knowledgeTree 节点（级联删除子节点）
 * @param {string} id - 节点 ID
 * @returns {Promise}
 */
export async function deleteKnowledgeTreeNode(id) {
  const children = await db.knowledgeTree.where('parentId').equals(id).toArray()
  for (const child of children) {
    await deleteKnowledgeTreeNode(child.id)
  }
  await db.knowledgeTree.delete(id)
}

/**
 * 添加 knowledgeTree 节点
 * @param {Object} node - 节点对象
 * @returns {Promise}
 */
export async function addKnowledgeTreeNode(node) {
  const now = Date.now()
  const record = {
    id: node.id || generateId(),
    parentId: node.parentId || null,
    level: node.level,
    name: node.name || null,
    categoryId: node.categoryId || null,
    topicId: node.topicId || null,
    chapterId: node.chapterId || null,
    unitId: node.unitId || null,
    knowledgePointId: node.knowledgePointId || null,
    purpose: node.purpose || null,
    description: node.description || null,
    color: node.color || '#3b82f6',
    icon: node.icon || '📚',
    isProcessed: node.isProcessed || false,
    position: node.position || 0,
    content: node.content || null,
    front: node.front || null,
    back: node.back || null,
    hint: node.hint || null,
    explanation: node.explanation || null,
    type: node.type || 'short',
    options: node.options || null,
    answerBlank: node.answerBlank || null,
    status: node.status || 'active',
    retryCount: node.retryCount || 0,
    source: node.source || 'manual',
    errorMessage: node.errorMessage || null,
    generatedAt: node.generatedAt || null,
    templateType: node.templateType || null,
    order: node.order || 0,
    userId: node.userId || '',
    createdAt: node.createdAt || now,
    updatedAt: now,
  }

  if (record.level === 'topic') record.topicId = record.id
  else if (record.level === 'chapter') record.chapterId = record.id
  else if (record.level === 'unit') record.unitId = record.id
  else if (record.level === 'knowledge_point') record.knowledgePointId = record.id

  await db.knowledgeTree.add(record)
  return record
}
