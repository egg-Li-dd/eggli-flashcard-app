import { describe, it, expect } from 'vitest'

// 动态导入 sync 模块中的常量
async function loadSyncModule() {
  const mod = await import('../services/sync')
  return mod
}

describe('sync.js - 新表同步配置', () => {

  // ============================================================
  // 1. TABLE_SCHEMAS 新表定义
  // ============================================================
  describe('TABLE_SCHEMAS 新表', () => {
    it('应包含 test_questions 表 schema', async () => {
      const { TABLE_SCHEMAS } = await loadSyncModule()
      const schema = TABLE_SCHEMAS.test_questions
      expect(schema).toBeTruthy()
      expect(schema.fields).toContain('id')
      expect(schema.fields).toContain('category_id')
      expect(schema.fields).toContain('unit_id')
      expect(schema.fields).toContain('card_id')
      expect(schema.fields).toContain('type')
      expect(schema.fields).toContain('question')
      expect(schema.fields).toContain('options')
      expect(schema.fields).toContain('answer')
      expect(schema.fields).toContain('explanation')
      expect(schema.fields).toContain('difficulty')
      expect(schema.fields).toContain('card_updated_at')
      expect(schema.fields).toContain('user_id')
      expect(schema.fields).toContain('created_at')
      expect(schema.fields).toContain('updated_at')
      expect(schema.autoAddUpdatedAt).toBe(true)
    })

    it('应包含 test_records 表 schema', async () => {
      const { TABLE_SCHEMAS } = await loadSyncModule()
      const schema = TABLE_SCHEMAS.test_records
      expect(schema).toBeTruthy()
      expect(schema.fields).toContain('id')
      expect(schema.fields).toContain('question_id')
      expect(schema.fields).toContain('user_answer')
      expect(schema.fields).toContain('is_correct')
      expect(schema.fields).toContain('test_type')
      expect(schema.fields).toContain('test_session_id')
      expect(schema.fields).toContain('user_id')
      expect(schema.fields).toContain('created_at')
      expect(schema.fields).toContain('updated_at')
      expect(schema.autoAddUpdatedAt).toBe(true)
    })

    it('应包含 test_sessions 表 schema', async () => {
      const { TABLE_SCHEMAS } = await loadSyncModule()
      const schema = TABLE_SCHEMAS.test_sessions
      expect(schema).toBeTruthy()
      expect(schema.fields).toContain('id')
      expect(schema.fields).toContain('test_type')
      expect(schema.fields).toContain('type_id')
      expect(schema.fields).toContain('questions')
      expect(schema.fields).toContain('user_answers')
      expect(schema.fields).toContain('marked_questions')
      expect(schema.fields).toContain('current_index')
      expect(schema.fields).toContain('start_time')
      expect(schema.fields).toContain('last_saved_at')
      expect(schema.fields).toContain('is_completed')
      expect(schema.fields).toContain('user_id')
      expect(schema.fields).toContain('created_at')
      expect(schema.fields).toContain('updated_at')
      expect(schema.autoAddUpdatedAt).toBe(true)
    })
  })

  // ============================================================
  // 2. TABLE_META 新表定义
  // ============================================================
  describe('TABLE_META 新表', () => {
    it('应包含 test_questions 元数据', async () => {
      const { TABLE_META } = await loadSyncModule()
      const meta = TABLE_META.test_questions
      expect(meta).toBeTruthy()
      expect(meta.local).toBe('testQuestions')
      expect(meta.display).toBe('单元检测题目')
      expect(meta.upsertKey).toBe('id')
    })

    it('应包含 test_records 元数据', async () => {
      const { TABLE_META } = await loadSyncModule()
      const meta = TABLE_META.test_records
      expect(meta).toBeTruthy()
      expect(meta.local).toBe('testRecords')
      expect(meta.display).toBe('答题记录')
      expect(meta.upsertKey).toBe('id')
    })

    it('应包含 test_sessions 元数据', async () => {
      const { TABLE_META } = await loadSyncModule()
      const meta = TABLE_META.test_sessions
      expect(meta).toBeTruthy()
      expect(meta.local).toBe('testSessions')
      expect(meta.display).toBe('答题会话')
      expect(meta.upsertKey).toBe('id')
    })
  })

  // ============================================================
  // 3. 字段映射 - camelToSnake (FIELD_MAP_CAMEL_TO_SNAKE)
  // ============================================================
  describe('FIELD_MAP_CAMEL_TO_SNAKE 新字段', () => {
    it('应包含 testQuestions 新字段映射', async () => {
      const { FIELD_MAP_CAMEL_TO_SNAKE } = await loadSyncModule()
      expect(FIELD_MAP_CAMEL_TO_SNAKE.questionId).toBe('question_id')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.userAnswer).toBe('user_answer')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.isCorrect).toBe('is_correct')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.testType).toBe('test_type')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.testSessionId).toBe('test_session_id')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.typeId).toBe('type_id')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.userAnswers).toBe('user_answers')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.markedQuestions).toBe('marked_questions')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.currentIndex).toBe('current_index')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.startTime).toBe('start_time')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.lastSavedAt).toBe('last_saved_at')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.isCompleted).toBe('is_completed')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.cardUpdatedAt).toBe('card_updated_at')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.question).toBe('question')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.answer).toBe('answer')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.explanation).toBe('explanation')
    })
  })

  // ============================================================
  // 4. 字段映射 - snakeToCamel (snakeToCamelMap)
  // ============================================================
  describe('snakeToCamelMap 新字段', () => {
    it('应将 test_questions 云端字段转为本地 camelCase', async () => {
      const { snakeToCamel } = await loadSyncModule()
      const result = snakeToCamel({
        id: 'tq-1',
        category_id: 'cat-1',
        unit_id: 'unit-1',
        card_id: 'card-1',
        type: 'single',
        question: 'Q?',
        options: '["A","B"]',
        answer: 'A',
        explanation: '解释',
        difficulty: 3,
        card_updated_at: '2026-01-01T00:00:00Z',
        user_id: 'u-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }, 'test_questions')
      expect(result.categoryId).toBe('cat-1')
      expect(result.unitId).toBe('unit-1')
      expect(result.cardId).toBe('card-1')
      expect(result.type).toBe('single')
      expect(result.question).toBe('Q?')
      expect(result.answer).toBe('A')
      expect(result.explanation).toBe('解释')
      expect(result.difficulty).toBe(3)
      expect(result.cardUpdatedAt).toBeGreaterThan(0)
      expect(result.createdAt).toBeGreaterThan(0)
      expect(result.updatedAt).toBeGreaterThan(0)
    })

    it('应将 test_records 云端字段转为本地 camelCase', async () => {
      const { snakeToCamel } = await loadSyncModule()
      const result = snakeToCamel({
        id: 'tr-1',
        question_id: 'q-1',
        user_answer: 'B',
        is_correct: false,
        test_type: 'unit',
        test_session_id: 's-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }, 'test_records')
      expect(result.questionId).toBe('q-1')
      expect(result.userAnswer).toBe('B')
      expect(result.isCorrect).toBe(false)
      expect(result.testType).toBe('unit')
      expect(result.testSessionId).toBe('s-1')
    })

    it('应将 test_sessions 云端字段转为本地 camelCase', async () => {
      const { snakeToCamel } = await loadSyncModule()
      const result = snakeToCamel({
        id: 'ts-1',
        test_type: 'unit',
        type_id: 'unit-1',
        questions: '["q1","q2"]',
        user_answers: '["A"]',
        marked_questions: '[]',
        current_index: 2,
        start_time: '2026-01-01T00:00:00Z',
        last_saved_at: '2026-01-01T00:00:00Z',
        is_completed: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }, 'test_sessions')
      expect(result.testType).toBe('unit')
      expect(result.typeId).toBe('unit-1')
      expect(result.currentIndex).toBe(2)
      expect(result.isCompleted).toBe(false)
    })
  })

  // ============================================================
  // 5. camelToSnake 新字段
  // ============================================================
  describe('camelToSnake 新字段', () => {
    it('应将 testQuestions 本地字段转为云端 snake_case', async () => {
      const { camelToSnake } = await loadSyncModule()
      const result = camelToSnake({
        id: 'tq-1',
        categoryId: 'cat-1',
        unitId: 'unit-1',
        cardId: 'card-1',
        type: 'single',
        question: 'Q?',
        options: ['A', 'B'],
        answer: 'A',
        explanation: '解释',
        difficulty: 3,
        cardUpdatedAt: Date.now(),
        userId: 'u-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, 'test_questions')
      expect(result.category_id).toBe('cat-1')
      expect(result.unit_id).toBe('unit-1')
      expect(result.card_id).toBe('card-1')
      expect(result.type).toBe('single')
      expect(result.question).toBe('Q?')
      expect(result.answer).toBe('A')
      expect(result.explanation).toBe('解释')
      expect(result.difficulty).toBe(3)
      expect(typeof result.card_updated_at).toBe('string')
    })

    it('应将 testRecords 本地字段转为云端 snake_case', async () => {
      const { camelToSnake } = await loadSyncModule()
      const result = camelToSnake({
        id: 'tr-1',
        questionId: 'q-1',
        userAnswer: 'B',
        isCorrect: false,
        testType: 'unit',
        testSessionId: 's-1',
      }, 'test_records')
      expect(result.question_id).toBe('q-1')
      expect(result.user_answer).toBe('B')
      expect(result.is_correct).toBe(false)
      expect(result.test_session_id).toBe('s-1')
    })

    it('应将 testSessions 本地字段转为云端 snake_case', async () => {
      const { camelToSnake } = await loadSyncModule()
      const result = camelToSnake({
        id: 'ts-1',
        testType: 'unit',
        typeId: 'unit-1',
        questions: ['q1'],
        userAnswers: ['A'],
        markedQuestions: [],
        currentIndex: 2,
        startTime: Date.now(),
        lastSavedAt: Date.now(),
        isCompleted: false,
      }, 'test_sessions')
      expect(result.type_id).toBe('unit-1')
      expect(result.current_index).toBe(2)
      expect(result.is_completed).toBe(false)
    })
  })

  // ============================================================
  // 6. 原有同步配置不受影响
  // ============================================================
  describe('原有同步配置回归', () => {
    it('categories 的 TABLE_SCHEMAS 仍存在', async () => {
      const { TABLE_SCHEMAS } = await loadSyncModule()
      expect(TABLE_SCHEMAS.categories).toBeTruthy()
      expect(TABLE_SCHEMAS.categories.fields).toContain('name')
    })

    it('FIELD_MAP 原有映射仍存在', async () => {
      const { FIELD_MAP_CAMEL_TO_SNAKE } = await loadSyncModule()
      expect(FIELD_MAP_CAMEL_TO_SNAKE.categoryId).toBe('category_id')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.unitId).toBe('unit_id')
      expect(FIELD_MAP_CAMEL_TO_SNAKE.createdAt).toBe('created_at')
    })
  })
})