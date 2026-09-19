﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { supabase, isSupabaseConfigured } from './cloudbase'
import { repairCardRelationsAfterImport } from './db'

// —— 通用超时包装：防止云端请求在弱网下永久 pending ——
// 用法：withTimeout(supabase.from('x').select('*', { count: 'exact' }), 10000, 'cloudQuery')
export function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms),
    ),
  ])
}

// —— 错误分类辅助函数 ——
const ERROR_TYPES = {
  RLS_DENIED: 'rls_denied',
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error',
  DATA_MISMATCH: 'data_mismatch',
  TOKEN_EXPIRED: 'token_expired',
  VALIDATION_ERROR: 'validation_error',
  CONSTRAINT_VIOLATION: 'constraint_violation',
  UNKNOWN_ERROR: 'unknown_error',
}

const ERROR_SUGGESTIONS = {
  [ERROR_TYPES.RLS_DENIED]: '请检查云端 SQL 策略配置，确保 RLS 策略允许当前用户访问数据。可在云端控制台执行数据库初始化脚本。',
  [ERROR_TYPES.NETWORK_ERROR]: '网络连接失败，请检查网络状态后重试。',
  [ERROR_TYPES.TIMEOUT_ERROR]: '请求超时，可能是网络不稳定或服务器响应慢，请稍后重试。',
  [ERROR_TYPES.DATA_MISMATCH]: '数据格式不匹配，请检查字段类型和约束是否正确。',
  [ERROR_TYPES.TOKEN_EXPIRED]: '登录状态已过期，请重新登录后重试。',
  [ERROR_TYPES.VALIDATION_ERROR]: '数据验证失败，请检查必填字段和格式。',
  [ERROR_TYPES.CONSTRAINT_VIOLATION]: '数据约束冲突（如外键、唯一性约束），请检查数据完整性。',
  [ERROR_TYPES.UNKNOWN_ERROR]: '未知错误，请查看详细错误信息或联系技术支持。',
}

function classifyError(error) {
  const msg = String(error.message || error || '').toLowerCase()
  const code = String(error.code || '').toLowerCase()
  const details = error.details || ''
  const hint = error.hint || ''

  // RLS 拒绝访问
  if (code === '42501' || code === 'rls_denied' || msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('rls')) {
    return { type: ERROR_TYPES.RLS_DENIED, details, hint }
  }

  // refresh_token 失效
  if (msg.includes('refresh_token') || msg.includes('validation_failed') || code === 'invalid_token') {
    return { type: ERROR_TYPES.TOKEN_EXPIRED, details, hint }
  }

  // 网络错误
  if (msg.includes('failed to fetch') || msg.includes('network error') || msg.includes('typeerror: failed') || msg.includes('fetch error') || msg.includes('net::err')) {
    return { type: ERROR_TYPES.NETWORK_ERROR, details, hint }
  }

  // 超时错误
  if (msg.includes('timeout') || msg.includes('timed out') || code === 'ECONNABORTED') {
    return { type: ERROR_TYPES.TIMEOUT_ERROR, details, hint }
  }

  // 数据格式错误
  if (msg.includes('invalid input') || msg.includes('data type mismatch') || msg.includes('cannot cast') || msg.includes('invalid uuid') || msg.includes('violates check')) {
    return { type: ERROR_TYPES.DATA_MISMATCH, details, hint }
  }

  // 数据验证错误
  if (code === '23502' || msg.includes('null value') || msg.includes('not null') || msg.includes('missing')) {
    return { type: ERROR_TYPES.VALIDATION_ERROR, details, hint }
  }

  // 约束冲突（外键、唯一性等）
  if (code === '23503' || code === '23505' || code === 'unique' || msg.includes('foreign key') || msg.includes('duplicate') || msg.includes('constraint')) {
    return { type: ERROR_TYPES.CONSTRAINT_VIOLATION, details, hint }
  }

  return { type: ERROR_TYPES.UNKNOWN_ERROR, details, hint }
}

function formatDetailedError(error, operation) {
  const classified = classifyError(error)
  return {
    reason: classified.type,
    error: `${operation}失败：${error.message || String(error)}`,
    details: classified.details || error.details || '',
    hint: classified.hint || ERROR_SUGGESTIONS[classified.type] || ERROR_SUGGESTIONS[ERROR_TYPES.UNKNOWN_ERROR],
    suggestion: ERROR_SUGGESTIONS[classified.type] || ERROR_SUGGESTIONS[ERROR_TYPES.UNKNOWN_ERROR],
    originalError: error,
  }
}

// —— 字段名映射辅助：本地 IndexedDB 用 camelCase，云端列名为 snake_case ——
// 转换规则（所有表统一）：
//   categoryId <-> category_id
//   unitId     <-> unit_id
//   cardId     <-> card_id
//   createdAt  <-> created_at
//   updatedAt  <-> updated_at
//   其它字段（id、user_id、name、front、back、status、order 等）保持不变
const FIELD_MAP_CAMEL_TO_SNAKE = {
  categoryId: 'category_id',
  unitId: 'unit_id',
  chapterId: 'chapter_id',
  cardId: 'card_id',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  reviewCount: 'review_count',
  easeFactor: 'ease_factor',
  interval: 'interval_days',
  repetitions: 'repetitions',
  lastReviewedAt: 'last_reviewed_at',
  nextReviewAt: 'next_review_at',
  // v3.2 新增字段
  difficulty: 'difficulty',
  wrongCount: 'wrong_count',
  wrongStreak: 'wrong_streak',
  // cards 表新增字段
  type: 'type',
  options: 'options',
  answerBlank: 'answer_blank',
  // wrongAnswers 字段映射
  count: 'count',
  lastWrongAt: 'last_wrong_at',
  // user_profiles 字段映射
  avatarUrl: 'avatar_url',
  avatarType: 'avatar_type',
  // v3 单元检测新增字段
  questionId: 'question_id',
  userAnswer: 'user_answer',
  isCorrect: 'is_correct',
  testType: 'test_type',
  testSessionId: 'test_session_id',
  typeId: 'type_id',
  userAnswers: 'user_answers',
  markedQuestions: 'marked_questions',
  currentIndex: 'current_index',
  startTime: 'start_time',
  lastSavedAt: 'last_saved_at',
  isCompleted: 'is_completed',
  cardUpdatedAt: 'card_updated_at',
  question: 'question',
  answer: 'answer',
  explanation: 'explanation',
  analysis: 'analysis',
  knowledgePoint: 'knowledge_point',
  targetId: 'target_id',
  totalScore: 'total_score',
  correctCount: 'correct_count',
  totalCount: 'total_count',
  timeUsed: 'time_used',
  gradingResults: 'grading_results',
  instantFeedback: 'instant_feedback',
  feedbackMap: 'feedback_map',
  questionType: 'question_type',
  answers: 'answers',
  // card_status 用户手动覆盖标记
  userOverride: 'user_override',
  // wrong_answers / test_sessions / test_records 冗余字段
  unitName: 'unit_name',
  categoryName: 'category_name',
  stem: 'stem',
  // knowledge_tree 字段映射
  parentId: 'parent_id',
  knowledgePointId: 'knowledge_point_id',
  isProcessed: 'is_processed',
  order: 'sort_order',
  errorMessage: 'error_message',
  generatedAt: 'generated_at',
  templateType: 'template_type',
}

const TABLE_SCHEMAS = {
  cards: {
    fields: ['id', 'category_id', 'chapter_id', 'unit_id', 'topic_id', 'user_id', 'front', 'back', 'hint', 'explanation', 'status', 'ease_factor', 'interval', 'repetitions', 'due_date', 'last_reviewed_at', 'is_mastered', 'difficulty', 'is_ai_generated', 'source_type', 'tags', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  card_status: {
    fields: ['id', 'card_id', 'category_id', 'user_id', 'status', 'ease_factor', 'interval', 'repetitions', 'lapses', 'last_reviewed_at', 'next_review_at', 'is_mastered', 'review_count', 'correct_count', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  bookmarks: {
    fields: ['id', 'card_id', 'category_id', 'user_id', 'created_at'],
    autoAddUpdatedAt: false
  },
  wrong_answers: {
    fields: ['id', 'card_id', 'category_id', 'chapter_id', 'unit_id', 'unit_name', 'category_name', 'stem', 'user_id', 'count', 'question_type', 'question_id', 'last_wrong_at', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  user_profiles: {
    fields: ['id', 'user_id', 'nickname', 'avatar_url', 'avatar_type', 'tags', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  user_settings: {
    fields: ['id', 'user_id', 'settings', 'updated_at'],
    autoAddUpdatedAt: true
  },
  test_questions: {
    fields: ['id', 'category_id', 'unit_id', 'chapter_id', 'card_id', 'type', 'question', 'stem', 'options', 'answer', 'explanation', 'analysis', 'difficulty', 'knowledge_point', 'test_type', 'target_id', 'card_updated_at', 'user_id', 'created_at', 'updated_at', 'pending_review', 'reviewed_at'],
    autoAddUpdatedAt: true
  },
  test_records: {
    fields: ['id', 'question_id', 'category_id', 'unit_id', 'chapter_id', 'category_name', 'unit_name', 'user_answer', 'is_correct', 'test_type', 'test_session_id', 'total_score', 'correct_count', 'total_count', 'time_used', 'questions', 'answers', 'grading_results', 'user_id', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  test_sessions: {
    fields: ['id', 'test_type', 'type_id', 'unit_id', 'category_id', 'chapter_id', 'category_name', 'unit_name', 'questions', 'user_answers', 'marked_questions', 'current_index', 'elapsed', 'instant_feedback', 'feedback_map', 'answers', 'start_time', 'last_saved_at', 'is_completed', 'user_id', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  review_history: {
    fields: ['id', 'card_id', 'category_id', 'chapter_id', 'user_id', 'was_mastered', 'reviewed_at', 'mode', 'created_at'],
    autoAddUpdatedAt: true
  },
  study_plans: {
    fields: ['id', 'category_id', 'chapter_id', 'user_id', 'daily_review_limit', 'daily_new_limit', 'priority', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  knowledge_tree: {
    fields: ['id', 'parent_id', 'level', 'category_id', 'topic_id', 'chapter_id', 'unit_id', 'knowledge_point_id', 'user_id', 'name', 'sort_order', 'purpose', 'description', 'color', 'icon', 'content', 'is_processed', 'card_count', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  drafts: {
    fields: ['id', 'user_id', 'content', 'category_id', 'chapter_id', 'unit_id', 'source', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  link_generation_runs: {
    fields: ['id', 'user_id', 'category_id', 'source_chapter_id', 'target_chapter_id', 'status', 'result', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
}

function camelToSnake(item, tableName) {
  const schema = TABLE_SCHEMAS[tableName]
  const out = {}
  for (const [k, v] of Object.entries(item)) {
    let snakeKey = FIELD_MAP_CAMEL_TO_SNAKE[k] || k
    out[snakeKey] = v
  }
  if (out.created_at && typeof out.created_at === 'number') {
    out.created_at = new Date(out.created_at).toISOString()
  }
  if (out.updated_at && typeof out.updated_at === 'number') {
    out.updated_at = new Date(out.updated_at).toISOString()
  }
  if (out.card_updated_at && typeof out.card_updated_at === 'number') {
    out.card_updated_at = new Date(out.card_updated_at).toISOString()
  }
  if (out.last_wrong_at && typeof out.last_wrong_at === 'number') {
    out.last_wrong_at = new Date(out.last_wrong_at).toISOString()
  }
  if (out.last_reviewed_at && typeof out.last_reviewed_at === 'number') {
    out.last_reviewed_at = new Date(out.last_reviewed_at).toISOString()
  }
  if (out.next_review_at && typeof out.next_review_at === 'number') {
    out.next_review_at = new Date(out.next_review_at).toISOString()
  }
  if (out.start_time && typeof out.start_time === 'number') {
    out.start_time = new Date(out.start_time).toISOString()
  }
  if (out.last_saved_at && typeof out.last_saved_at === 'number') {
    out.last_saved_at = new Date(out.last_saved_at).toISOString()
  }
  if (out.reviewed_at && typeof out.reviewed_at === 'number') {
    out.reviewed_at = new Date(out.reviewed_at).toISOString()
  }
  if (schema && schema.fields.includes('created_at') && !out.created_at) {
    out.created_at = new Date().toISOString()
  }
  if (schema && schema.autoAddUpdatedAt && !out.updated_at) {
    out.updated_at = new Date().toISOString()
  }
  if (schema) {
    const filtered = {}
    for (const key of schema.fields) {
      if (key in out) filtered[key] = out[key]
    }
    return filtered
  }
  return out
}

function snakeToCamel(item, tableName) {
  const out = {}
  const snakeToCamelMap = {
    category_id: 'categoryId',
    unit_id: 'unitId',
    chapter_id: 'chapterId',
    card_id: 'cardId',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    review_count: 'reviewCount',
    ease_factor: 'easeFactor',
    interval: 'interval',
    repetitions: 'repetitions',
    last_reviewed_at: 'lastReviewedAt',
    next_review_at: 'nextReviewAt',
    difficulty: 'difficulty',
    wrong_count: 'wrongCount',
    wrong_streak: 'wrongStreak',
    type: 'type',
    options: 'options',
    answer_blank: 'answerBlank',
    count: 'count',
    last_wrong_at: 'lastWrongAt',
    name: 'name',
    description: 'description',
    front: 'front',
    back: 'back',
    status: 'status',
    position: 'position',
    // user_profiles 字段
    avatar_url: 'avatarUrl',
    avatar_type: 'avatarType',
    nickname: 'nickname',
    tags: 'tags',
    // v3 单元检测新增字段
    question_id: 'questionId',
    user_answer: 'userAnswer',
    is_correct: 'isCorrect',
    test_type: 'testType',
    test_session_id: 'testSessionId',
    type_id: 'typeId',
    user_answers: 'userAnswers',
    marked_questions: 'markedQuestions',
    current_index: 'currentIndex',
    start_time: 'startTime',
    last_saved_at: 'lastSavedAt',
    is_completed: 'isCompleted',
    card_updated_at: 'cardUpdatedAt',
    question: 'question',
    answer: 'answer',
    explanation: 'explanation',
    // card_status 用户手动覆盖标记
    user_override: 'userOverride',
    // wrong_answers / test_sessions / test_records 冗余字段
    unit_name: 'unitName',
    category_name: 'categoryName',
    stem: 'stem',
    // review_history 字段
    reviewed_at: 'reviewedAt',
    was_mastered: 'wasMastered',
    mode: 'mode',
    // knowledge_tree 字段
    tree_data: 'treeData',
    sort_order: 'order',
    // drafts 字段
    source: 'source',
    // link_generation_runs 字段
    source_chapter_id: 'sourceChapterId',
    target_chapter_id: 'targetChapterId',
    result: 'result',
    // 其他字段
    is_processed: 'isProcessed',
    card_count: 'cardCount',
    topic_count: 'topicCount',
    unit_count: 'unitCount',
    due_date: 'dueDate',
    is_mastered: 'isMastered',
    is_ai_generated: 'isAiGenerated',
    source_type: 'sourceType',
    lapses: 'lapses',
    correct_count: 'correctCount',
    daily_review_limit: 'dailyReviewLimit',
    daily_new_limit: 'dailyNewLimit',
    priority: 'priority',
    analysis: 'analysis',
    knowledge_point: 'knowledgePoint',
    target_id: 'targetId',
    pending_review: 'pendingReview',
    reviewed_at: 'reviewedAt',
    total_score: 'totalScore',
    total_count: 'totalCount',
    time_used: 'timeUsed',
    grading_results: 'gradingResults',
    instant_feedback: 'instantFeedback',
    feedback_map: 'feedbackMap',
    answers: 'answers',
    elapsed: 'elapsed',
    color: 'color',
    icon: 'icon',
    title: 'title',
    hint: 'hint',
  }
  for (const [k, v] of Object.entries(item)) {
    if (k === 'user_id') continue
    if (k in snakeToCamelMap) {
      const camelKey = snakeToCamelMap[k]
      if (camelKey === 'createdAt' || camelKey === 'updatedAt' || camelKey === 'lastWrongAt' || camelKey === 'cardUpdatedAt' || camelKey === 'lastReviewedAt' || camelKey === 'nextReviewAt' || camelKey === 'startTime' || camelKey === 'lastSavedAt' || camelKey === 'reviewedAt' || camelKey === 'dueDate') {
        out[camelKey] = v ? new Date(v).getTime() : null
      } else {
        out[camelKey] = v
      }
    } else {
      out[k] = v
    }
  }
  if (!out.createdAt) out.createdAt = Date.now()
  if (!out.id) out.id = String(item.id || '')
  return out
}

// PostgreSQL 保留字转义：作为列名时需要加双引号
const PG_RESERVED_WORDS = new Set([
  'interval', 'order', 'position', 'user', 'group', 'select', 'from', 'where',
  'limit', 'offset', 'all', 'any', 'array', 'as', 'asc', 'desc', 'distinct',
  'exists', 'in', 'is', 'like', 'not', 'null', 'or', 'and', 'between', 'case',
  'when', 'then', 'else', 'end', 'cast', 'check', 'column', 'constraint',
  'create', 'cross', 'current', 'default', 'primary', 'foreign', 'references',
  'unique', 'values', 'view', 'with', 'without',
])
function escapePgFields(fields) {
  if (!Array.isArray(fields)) return fields
  return fields.map(f => {
    const lower = f.toLowerCase()
    if (lower === 'order') return 'order'
    return PG_RESERVED_WORDS.has(lower) ? `"${f}"` : f
  }).join(',')
}

async function fetchAllPages(table, columns, eqField, eqValue, tableName = 'unknown') {
  const all = []
  let from = 0
  const PAGE_SIZE = 1000
  let attempt = 0
  const MAX_RETRIES = 2
  let orderFailed = false
  // 对 PostgreSQL 保留字加双引号，避免 SELECT interval,... 被解析为关键字
  const selectStr = Array.isArray(columns) ? escapePgFields(columns) : columns

  while (true) {
    attempt++
    try {
      let query = table.select(selectStr).eq(eqField, eqValue).range(from, from + PAGE_SIZE - 1)
      // 如果之前按 created_at 排序失败，则后续不再按 created_at 排序
      // （card_status 等早期建表可能没有 created_at 列）
      if (!orderFailed) {
        try {
          query = query.order('created_at', { ascending: true })
        } catch (e) {
          orderFailed = true
        }
      }
      const { data, error, status, statusText } = await query

      if (error) {
        // 如果是"列不存在"的错误（一般表现为 42703 或 message 含 "does not exist"），
        // 关闭 created_at 排序后重试一次
        const msg = String(error.message || '').toLowerCase()
        if (!orderFailed && msg.includes('does not exist') && msg.includes('created_at')) {
          console.warn(`[sync] fetchAllPages [${tableName}]: 该表无 created_at 列，禁用排序后重试`)
          orderFailed = true
          continue
        }
        // 分类错误并添加上下文信息
        const classified = classifyError(error)
        const enhancedError = {
          ...error,
          message: error.message,
          code: error.code,
          details: `表: ${tableName}, 页码: ${from}-${from + PAGE_SIZE - 1}, 尝试次数: ${attempt}`,
          tableName,
          pageRange: `${from}-${from + PAGE_SIZE - 1}`,
          attempt,
        }
        console.error(`[sync] fetchAllPages 错误 [${tableName}]:`, enhancedError)
        throw enhancedError
      }

      if (!data || data.length === 0) {
        break
      }

      all.push(...data)

      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
      attempt = 0 // 重置重试计数
    } catch (err) {
      // 网络错误可重试
      const isNetworkError = err.message?.includes('fetch') ||
        err.message?.includes('network') ||
        err.status === 0 ||
        !err.status

      if (isNetworkError && attempt < MAX_RETRIES) {
        console.warn(`[sync] fetchAllPages [${tableName}]: 网络错误，第 ${attempt} 次重试...`)
        await new Promise(r => setTimeout(r, 1000 * attempt))
        continue
      }
      throw err
    }
  }
  return all
}

/**
 * 数据同步引擎
 * 负责本地 IndexedDB 数据与云端 CloudBase 的双向同步
 */
class SyncEngine {
  constructor() {
    this.syncing = false
    this.syncQueue = []
    this.lastSyncTime = localStorage.getItem('last_sync_time') ? 
      parseInt(localStorage.getItem('last_sync_time')) : null
    this.listeners = []
  }

  // 监听同步状态变化
  onSyncStatusChange(callback) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
    }
  }

  // 通知所有监听器
  notifyListeners(status) {
    this.listeners.forEach(cb => cb(status))
  }

  // 检查是否配置了云端
  isConfigured() {
    return isSupabaseConfigured()
  }

  // 获取当前用户（带超时控制，避免在网络慢时永久等待）
  async getCurrentUser() {
    try {
      const { data } = await withTimeout(supabase.auth.getUser(), 10000, 'getCurrentUser')
      return data?.user || null
    } catch (err) {
      console.warn('[sync] getCurrentUser 超时或失败:', err?.message || err)
      return null
    }
  }

  // 检查登录状态
  async isLoggedIn() {
    const user = await this.getCurrentUser()
    return !!user
  }

  // 从云端拉取数据到本地
  async pullFromCloud(db) {
    if (!this.isConfigured()) {
      return { success: false, reason: 'not_configured', error: '请先在设置中配置 CloudBase 环境', cloudHadData: false }
    }

    const user = await this.getCurrentUser()
    if (!user) {
      return { success: false, reason: 'not_logged_in', error: '请先登录云端账号', cloudHadData: false }
    }

    if (this.syncing) {
      return { success: false, reason: 'already_syncing', error: '同步正在进行中，请稍后再试', cloudHadData: false }
    }

    this.syncing = true
    this.notifyListeners({ syncing: true, direction: 'pull' })

    try {
      const supabaseClient = supabase

      // 分页拉取所有表数据（防止 1000 行截断）
      // 注意：categories、topics、chapters、units 已合并到 knowledge_tree
      const cards = await fetchAllPages(supabaseClient.from('cards'), TABLE_SCHEMAS.cards.fields, 'user_id', user.id, 'cards')
      const statuses = await fetchAllPages(supabaseClient.from('card_status'), TABLE_SCHEMAS.card_status.fields, 'user_id', user.id, 'card_status')
      const bookmarks = await fetchAllPages(supabaseClient.from('bookmarks'), TABLE_SCHEMAS.bookmarks.fields, 'user_id', user.id, 'bookmarks')
      const wrongAnswers = await fetchAllPages(supabaseClient.from('wrong_answers'), TABLE_SCHEMAS.wrong_answers.fields, 'user_id', user.id, 'wrong_answers')
      const testQuestions = await fetchAllPages(supabaseClient.from('test_questions'), TABLE_SCHEMAS.test_questions.fields, 'user_id', user.id, 'test_questions')
      const testRecords = await fetchAllPages(supabaseClient.from('test_records'), TABLE_SCHEMAS.test_records.fields, 'user_id', user.id, 'test_records')
      const testSessions = await fetchAllPages(supabaseClient.from('test_sessions'), TABLE_SCHEMAS.test_sessions.fields, 'user_id', user.id, 'test_sessions')
      const reviewHistory = await fetchAllPages(supabaseClient.from('review_history'), TABLE_SCHEMAS.review_history.fields, 'user_id', user.id, 'review_history')
      const studyPlans = await fetchAllPages(supabaseClient.from('study_plans'), TABLE_SCHEMAS.study_plans.fields, 'user_id', user.id, 'study_plans')
      const knowledgeTree = await fetchAllPages(supabaseClient.from('knowledge_tree'), TABLE_SCHEMAS.knowledge_tree.fields, 'user_id', user.id, 'knowledge_tree')

      const cloudHadData = knowledgeTree.length > 0

      // 转换数据
      const cardConverted = cards.map((row) => snakeToCamel(row, 'cards'))
      const statusConverted = statuses.map((row) => snakeToCamel(row, 'card_status'))
      const bmConverted = bookmarks.map((row) => snakeToCamel(row, 'bookmarks'))
      const wrongAnswersConverted = wrongAnswers.map((row) => snakeToCamel(row, 'wrong_answers'))
      const testQuestionsConverted = testQuestions.map((row) => snakeToCamel(row, 'test_questions'))
      const testRecordsConverted = testRecords.map((row) => snakeToCamel(row, 'test_records'))
      const testSessionsConverted = testSessions.map((row) => snakeToCamel(row, 'test_sessions'))
      const reviewHistoryConverted = reviewHistory.map((row) => snakeToCamel(row, 'review_history'))
      const studyPlansConverted = studyPlans.map((row) => snakeToCamel(row, 'study_plans'))
      const knowledgeTreeConverted = knowledgeTree.map((row) => snakeToCamel(row, 'knowledge_tree'))

      // 先验证完整性，再在事务中清空+写入
      // 注意：cardStatus 不再清空，改用合并策略保留本地较新记录（解决多设备 SM-2 冲突）
      await db.transaction('rw',
        db.cards, db.cardStatus, db.bookmarks, db.wrongAnswers,
        db.testQuestions, db.testRecords, db.testSessions, db.reviewHistory, db.studyPlans, db.knowledgeTree,
        async () => {
          await db.cards.clear()
          // 不再清空 cardStatus：保留本地非 ebbinghaus 模式记录，并基于 updatedAt 合并 ebbinghaus 记录
          await db.bookmarks.clear()
          await db.wrongAnswers.clear()
          await db.testQuestions.clear()
          await db.testRecords.clear()
          await db.testSessions.clear()
          await db.reviewHistory.clear()
          await db.studyPlans.clear()
          await db.knowledgeTree.clear()

          if (cardConverted.length > 0) await db.cards.bulkAdd(cardConverted)
          // cardStatus 合并策略：基于 updatedAt 解决多设备冲突
          // 云端下载的 statusConverted 仅含 ebbinghaus 模式（云端只存储 ebbinghaus）
          // 本地非 ebbinghaus 记录保留不变；同名 cardId 按 updatedAt 取较新者
          const localStatuses = await db.cardStatus.toArray()
          const localMap = new Map(localStatuses.map(s => [`${s.cardId}|${s.categoryId}`, s]))
          const toUpdate = []
          const toAdd = []
          let skippedCount = 0

          for (const cloudRecord of statusConverted) {
            const key = `${cloudRecord.cardId}|${cloudRecord.categoryId}`
            const localRecord = localMap.get(key)
            if (localRecord) {
              // 基于 updatedAt 解决冲突，保留较新的
              const cloudUpdated = cloudRecord.updatedAt || 0
              const localUpdated = localRecord.updatedAt || 0
              if (cloudUpdated > localUpdated) {
                toUpdate.push({ ...localRecord, ...cloudRecord, id: localRecord.id })
              } else {
                skippedCount++
              }
            } else {
              toAdd.push(cloudRecord)
            }
          }

          if (toUpdate.length > 0) {
            await db.cardStatus.bulkPut(toUpdate)
          }
          if (toAdd.length > 0) {
            await db.cardStatus.bulkAdd(toAdd)
          }
          if (bmConverted.length > 0) await db.bookmarks.bulkAdd(bmConverted)
          if (wrongAnswersConverted.length > 0) await db.wrongAnswers.bulkAdd(wrongAnswersConverted)
          if (testQuestionsConverted.length > 0) await db.testQuestions.bulkAdd(testQuestionsConverted)
          if (testRecordsConverted.length > 0) await db.testRecords.bulkAdd(testRecordsConverted)
          if (testSessionsConverted.length > 0) await db.testSessions.bulkAdd(testSessionsConverted)
          if (reviewHistoryConverted.length > 0) await db.reviewHistory.bulkAdd(reviewHistoryConverted)
          if (studyPlansConverted.length > 0) await db.studyPlans.bulkAdd(studyPlansConverted)
          if (knowledgeTreeConverted.length > 0) await db.knowledgeTree.bulkAdd(knowledgeTreeConverted)
        }
      )

      const repairResult = await repairCardRelationsAfterImport()

      this.lastSyncTime = Date.now()
      localStorage.setItem('last_sync_time', this.lastSyncTime.toString())

      return {
        success: true,
        cloudHadData,
        stats: {
          categories: categories.length,
          topics: topics.length,
          chapters: chapters.length,
          units: units.length,
          cards: cards.length,
          statuses: statuses.length,
          bookmarks: bookmarks.length,
          wrongAnswers: wrongAnswers.length,
          testQuestions: testQuestions.length,
          testRecords: testRecords.length,
          testSessions: testSessions.length,
          reviewHistory: reviewHistory.length,
          studyPlans: studyPlans.length,
          knowledgeTree: knowledgeTree.length,
        }
      }
    } catch (error) {
      // 使用增强的错误分类
      const detailedError = formatDetailedError(error, '云端数据拉取')
      console.error('[sync] 云端拉取失败:', {
        reason: detailedError.reason,
        message: detailedError.error,
        details: detailedError.details,
        hint: detailedError.hint,
        suggestion: detailedError.suggestion,
        originalError: error,
      })

      // 检测 refresh_token 失效错误
      if (detailedError.reason === ERROR_TYPES.TOKEN_EXPIRED) {
        console.error('[sync] refresh_token 失效，需要重新登录')
        this._tokenExpiredNotified = true
        this.notifyListeners({ syncing: false, direction: null, tokenExpired: true })
        return {
          success: false,
          ...detailedError,
          cloudHadData: false
        }
      }

      // 提供更明确的错误消息
      let errorMessage = detailedError.error || '下载失败'
      if (detailedError.reason === ERROR_TYPES.NETWORK_ERROR) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (detailedError.reason === ERROR_TYPES.TIMEOUT_ERROR) {
        errorMessage = '请求超时，可能是网络不稳定，请稍后重试'
      } else if (detailedError.reason === ERROR_TYPES.RLS_DENIED) {
        errorMessage = '数据访问被拒绝，请检查云端权限配置'
      }

      return {
        success: false,
        ...detailedError,
        error: errorMessage,
        cloudHadData: false
      }
    } finally {
      this.syncing = false
      if (!this._tokenExpiredNotified) {
        this.notifyListeners({ syncing: false, direction: null })
      }
      this._tokenExpiredNotified = false
    }
  }

  // 推送本地数据到云端
  async pushToCloud(db) {
    if (!this.isConfigured()) {
      return { success: false, reason: 'not_configured' }
    }

    const user = await this.getCurrentUser()
    if (!user) {
      return { success: false, reason: 'not_logged_in' }
    }

    if (this.syncing) {
      return { success: false, reason: 'already_syncing' }
    }

    this.syncing = true
    this.notifyListeners({ syncing: true, direction: 'push' })

    try {
      // 获取本地所有数据
      // 注意：categories、topics、chapters、units 已合并到 knowledge_tree
      const cards = await db.cards.toArray()
      const statuses = await db.cardStatus.toArray()
      const bookmarks = await db.bookmarks.toArray()
      const wrongAnswers = await db.wrongAnswers.toArray()
      const testQuestions = await db.testQuestions.toArray()
      const testRecords = await db.testRecords.toArray()
      const testSessions = await db.testSessions.toArray()
      // 分层同步：只上传 mode='ebbinghaus' 的记录
      const ebbinghausStatuses = statuses.filter(s => s.mode === 'ebbinghaus')

      // 获取复习历史和学习计划（全量同步）
      const reviewHistories = await db.reviewHistory.toArray()
      const studyPlansData = await db.studyPlans.toArray()
      const knowledgeTreeData = await db.knowledgeTree.toArray()

      // 为数据添加 user_id，并把本地 camelCase 字段转换为云端 snake_case
      const addUserId = (data, tableName) => data.map(item => {
        const snake = camelToSnake(item, tableName)
        return {
          ...snake,
          user_id: user.id,
        }
      })

      // 推送到云端（使用 upsert 以处理更新）
      const uploadTable = async (table, data, displayName) => {
        if (!data.length) return { success: true, table: displayName, count: 0 }
        const userData = addUserId(data, table)
        
        // 记录即将上传的数据量
        try {
          const { data: result, error } = await supabase.from(table).upsert(userData, {
            onConflict: 'id'
          })
          
          if (error) {
            console.error(`[sync] 上传 ${displayName} 失败 (onConflict):`, error)
            console.warn(`[sync] 尝试不使用 onConflict 参数重新上传 ${displayName}`)
            const { data: retryResult, error: retryError } = await supabase.from(table).upsert(userData)
            if (retryError) {
              const enhancedError = {
                ...retryError,
                tableName: displayName,
                recordCount: data.length,
                sampleRecords: data.slice(0, 3).map(r => ({ id: r.id, name: r.name })),
              }
              console.error(`[sync] 上传 ${displayName} 重试失败:`, enhancedError)
              throw enhancedError
            }
          }
        } catch (e) {
          const enhancedError = {
            ...e,
            tableName: displayName,
            recordCount: data.length,
            sampleRecords: data.slice(0, 3).map(r => ({ id: r.id, name: r.name })),
          }
          console.error(`[sync] 上传 ${displayName} 失败:`, enhancedError)
          throw enhancedError
        }
        
        return { success: true, table: displayName, count: data.length }
      }

      const results = []
      results.push(await uploadTable('cards', cards, '卡片'))
      results.push(await uploadTable('card_status', ebbinghausStatuses, '卡片状态'))
      results.push(await uploadTable('bookmarks', bookmarks, '书签'))
      results.push(await uploadTable('wrong_answers', wrongAnswers, '错题记录'))
      results.push(await uploadTable('test_questions', testQuestions, '单元检测题目'))
      results.push(await uploadTable('test_records', testRecords, '答题记录'))
      results.push(await uploadTable('test_sessions', testSessions, '答题会话'))
      results.push(await uploadTable('review_history', reviewHistories, '复习历史'))
      results.push(await uploadTable('study_plans', studyPlansData, '学习计划'))
      results.push(await uploadTable('knowledge_tree', knowledgeTreeData, '知识树'))

      // 更新同步时间
      this.lastSyncTime = Date.now()
      localStorage.setItem('last_sync_time', this.lastSyncTime.toString())

      return {
        success: true,
        stats: {
          cards: results[0].count || 0,
          statuses: results[1].count || 0,
          bookmarks: results[2].count || 0,
          wrongAnswers: results[3].count || 0,
          testQuestions: results[4].count || 0,
          testRecords: results[5].count || 0,
          testSessions: results[6].count || 0,
          reviewHistory: results[7].count || 0,
          studyPlans: results[8].count || 0,
          knowledgeTree: results[9].count || 0,
        }
      }
    } catch (error) {
      // 使用增强的错误分类
      const detailedError = formatDetailedError(error, '云端数据推送')
      console.error('[sync] 云端推送失败:', {
        reason: detailedError.reason,
        message: detailedError.error,
        details: detailedError.details,
        hint: detailedError.hint,
        suggestion: detailedError.suggestion,
        tableName: error.tableName || 'unknown',
        recordCount: error.recordCount || 0,
        originalError: error,
      })

      // 如果是 token 过期
      if (detailedError.reason === ERROR_TYPES.TOKEN_EXPIRED) {
        this._tokenExpiredNotified = true
        this.notifyListeners({ syncing: false, direction: null, tokenExpired: true })
        return {
          success: false,
          ...detailedError,
        }
      }

      return {
        success: false,
        ...detailedError,
      }
    } finally {
      this.syncing = false
      this.notifyListeners({ syncing: false, direction: null })
    }
  }

  // 完整同步（先拉取再推送）
  async fullSync(db) {
    if (this.syncing) {
      return { success: false, reason: 'already_syncing' }
    }

    this.syncing = true
    this.notifyListeners({ syncing: true, direction: 'full' })

    try {
      const pullResult = await this.pullFromCloud(db)

      if (!pullResult.success) {
        this.syncing = false
        this.notifyListeners({ syncing: false, direction: null })
        return pullResult
      }

      // 云端确实无数据 → 首次上推
      if (!pullResult.cloudHadData) {
        const pushResult = await this.pushToCloud(db)
        return {
          success: true,
          direction: 'push',
          stats: pushResult.stats
        }
      }

      return {
        success: true,
        direction: 'pull',
        stats: pullResult.stats
      }
    } catch (error) {
      return { success: false, reason: 'error', error: error.message }
    } finally {
      this.syncing = false
      this.notifyListeners({ syncing: false, direction: null })
    }
  }

  // 获取最后同步时间
  getLastSyncTime() {
    return this.lastSyncTime
  }

  // 格式化最后同步时间
  getLastSyncTimeFormatted() {
    if (!this.lastSyncTime) return '从未同步'
    const diff = Date.now() - this.lastSyncTime
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return new Date(this.lastSyncTime).toLocaleDateString('zh-CN')
  }
}

// ===== 单表操作：上传、同步、查看、删除 =====

const TABLE_META = {
  cards: { local: 'cards', display: '卡片', upsertKey: 'id' },
  card_status: { local: 'cardStatus', display: '卡片状态', upsertKey: 'id' },
  bookmarks: { local: 'bookmarks', display: '书签', upsertKey: 'id' },
  wrong_answers: { local: 'wrongAnswers', display: '错题记录', upsertKey: 'id' },
  user_profiles: { local: 'userProfiles', display: '用户配置', upsertKey: 'id' },
  user_settings: { local: 'userSettings', display: '用户设置', upsertKey: 'id' },
  test_questions: { local: 'testQuestions', display: '单元检测题目', upsertKey: 'id' },
  test_records: { local: 'testRecords', display: '答题记录', upsertKey: 'id' },
  test_sessions: { local: 'testSessions', display: '答题会话', upsertKey: 'id' },
  review_history: { local: 'reviewHistory', display: '复习历史', upsertKey: 'id' },
  study_plans: { local: 'studyPlans', display: '学习计划', upsertKey: 'id' },
  knowledge_tree: { local: 'knowledgeTree', display: '知识树', upsertKey: 'id' },
  drafts: { local: 'drafts', display: '草稿', upsertKey: 'id' },
  link_generation_runs: { local: 'linkGenerationRuns', display: '联结题库记录', upsertKey: 'id' },
}

// 单表：把本地数据批量覆盖上传到云端（同名数据全量 upsert）
async function uploadTableToCloud(db, tableName) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'not_configured', error: 'Supabase 未配置' }
  }
  const user = await syncEngine.getCurrentUser()
  if (!user) return { success: false, reason: 'not_logged_in', error: '请先登录' }

  const meta = TABLE_META[tableName]
  if (!meta) return { success: false, error: '未知数据表' }

  let localItems = await db[meta.local].toArray()

  const cloudItems = localItems.map(item => ({
    ...camelToSnake(item, tableName),
    user_id: user.id,
  }))

  try {
    // 先删除该用户在云端该表的全部数据，再 upsert，实现"覆盖上传"
    const { error: delErr } = await supabase
      .from(tableName)
      .delete()
      .eq('user_id', user.id)
    if (delErr) {
      const delCtxErr = new Error(`${meta.display}删除旧数据失败: ${delErr.message || delErr}`)
      delCtxErr.code = delErr.code
      throw delCtxErr
    }

    if (cloudItems.length > 0) {
      let { error } = await supabase
        .from(tableName)
        .upsert(cloudItems, { onConflict: meta.upsertKey })
      
      if (error) {
        console.warn(`[sync] ${meta.display}写入失败 (onConflict):`, error)
        console.warn(`[sync] 尝试不使用 onConflict 参数重新上传 ${meta.display}`)
        const { error: retryError } = await supabase
          .from(tableName)
          .upsert(cloudItems)
        if (retryError) {
          const upsertCtxErr = new Error(
            `${meta.display}写入失败（${cloudItems.length}条）: ${retryError.message || retryError}` +
            (retryError.code === '42703' ? ' — 云端表缺少字段，请在云端控制台执行数据库初始化脚本' : '')
          )
          upsertCtxErr.code = retryError.code
          throw upsertCtxErr
        }
      }
    }

    syncEngine.lastSyncTime = Date.now()
    localStorage.setItem('last_sync_time', syncEngine.lastSyncTime.toString())
    return { success: true, count: cloudItems.length }
  } catch (err) {
    const detailed = formatDetailedError(err, `上传${meta.display}`)
    return { success: false, ...detailed }
  }
}

// 单表：本地与云端双向合并（以较新的 created_at/updated_at 为准）
async function syncTableBidirectional(db, tableName) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'not_configured', error: 'Supabase 未配置' }
  }
  const user = await syncEngine.getCurrentUser()
  if (!user) return { success: false, reason: 'not_logged_in', error: '请先登录' }

  const meta = TABLE_META[tableName]
  if (!meta) return { success: false, error: '未知数据表' }

  try {
    // 1. 拉取云端该表的全部数据
    const cloudRaw = await fetchAllPages(
      supabase.from(tableName),
      TABLE_SCHEMAS[tableName].fields,
      'user_id', user.id, tableName
    )
    const cloudItems = cloudRaw.map((row) => snakeToCamel(row, tableName))
    const cloudMap = new Map(cloudItems.map(i => [i.id, i]))

    // 2. 读取本地该表数据
    const localItems = await db[meta.local].toArray()
    const localMap = new Map(localItems.map(i => [i.id, i]))

    // 3. 合并：以 updated_at / createdAt 大者为准
    const merged = []
    const allIds = new Set([...cloudMap.keys(), ...localMap.keys()])

    const pickNewer = (a, b) => {
      const aTime = a.updatedAt || a.createdAt || 0
      const bTime = b.updatedAt || b.createdAt || 0
      return aTime >= bTime ? a : b
    }

    for (const id of allIds) {
      const l = localMap.get(id)
      const c = cloudMap.get(id)
      if (l && c) merged.push(pickNewer(l, c))
      else if (l) merged.push(l)
      else if (c) merged.push(c)
    }

    // 4. 写回本地（事务中清空 + 写入）
    await db.transaction('rw', db[meta.local], async () => {
      await db[meta.local].clear()
      if (merged.length > 0) await db[meta.local].bulkAdd(merged)
    })

    // 5. 写回云端（upsert）
    const cloudOut = merged.map(item => ({
      ...camelToSnake(item, tableName),
      user_id: user.id,
    }))

    // 先清空云端，再 upsert（保证双向同步结果一致）
    const { error: delErr } = await supabase
      .from(tableName)
      .delete()
      .eq('user_id', user.id)
    if (delErr) throw delErr

    if (cloudOut.length > 0) {
      let { error } = await supabase
        .from(tableName)
        .upsert(cloudOut, { onConflict: meta.upsertKey })
      
      if (error) {
        console.warn(`[sync] ${meta.display}同步写入失败 (onConflict):`, error)
        console.warn(`[sync] 尝试不使用 onConflict 参数重新上传 ${meta.display}`)
        const { error: retryError } = await supabase
          .from(tableName)
          .upsert(cloudOut)
        if (retryError) throw retryError
      }
    }

    syncEngine.lastSyncTime = Date.now()
    localStorage.setItem('last_sync_time', syncEngine.lastSyncTime.toString())
    return { success: true, count: merged.length }
  } catch (err) {
    const detailed = formatDetailedError(err, `同步${meta.display}`)
    return { success: false, ...detailed }
  }
}

// 查看云端某表的数据（分页，最多 1000 条预览）
async function getCloudTableData(tableName, limit = 1000) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'not_configured', error: 'Supabase 未配置' }
  }
  // 优先使用 getSession（本地读取缓存，几乎零延迟），失败再回落到 getUser（需联网）
  // 这样移动端网络波动时不会因 getUser 请求超时就被误判为"未连接"
  let user = null
  try {
    const sessionRes = supabase && typeof supabase.auth?.getSession === 'function'
      ? await withTimeout(supabase.auth.getSession(), 3000, 'getSession(' + tableName + ')')
      : null
    if (sessionRes?.data?.session?.user) {
      user = sessionRes.data.session.user
    }
  } catch (e) {
    console.warn('[sync] getSession 失败（' + tableName + '）：', e?.message || e)
  }
  // 如果从 session 没取到用户，再用更长的超时（8s）调用 getUser 兜底
  if (!user) {
    try {
      user = await withTimeout(syncEngine.getCurrentUser(), 8000, 'getCurrentUser(' + tableName + ')')
    } catch (e) {
      console.warn('[sync] getCurrentUser 超时/失败（' + tableName + '）：', e?.message || e)
      return { success: false, reason: 'network_slow', error: '网络较慢，建议稍后再查看云端数据' }
    }
  }
  if (!user) return { success: false, reason: 'not_logged_in', error: '请先登录' }

  try {
    const schema = TABLE_SCHEMAS[tableName]
    const hasCreatedAt = schema && schema.fields && schema.fields.includes('created_at')

    // limit 为 0 时自动分页获取全部数据
    if (limit === 0) {
      const PAGE_SIZE = 1000
      let allData = []
      let page = 0
      let totalCount = 0
      while (true) {
        let pageQuery = supabase
          .from(tableName)
          .select(escapePgFields(schema.fields))
          .eq('user_id', user.id)
        if (hasCreatedAt) pageQuery = pageQuery.order('created_at', { ascending: false })
        const { data, error } = await withTimeout(
          pageQuery.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
          15000,
          `getCloudTableData(${tableName}) page ${page}`,
        )
        if (error) throw error
        if (!data || data.length === 0) break
        allData = allData.concat(data)
        totalCount = allData.length
        if (data.length < PAGE_SIZE) break
        page++
      }
      return {
        success: true,
        items: allData.map((row) => snakeToCamel(row, tableName)),
        total: totalCount,
      }
    }

    // 15 秒超时
    let query = supabase
      .from(tableName)
      .select(escapePgFields(schema.fields), { count: 'exact' })
      .eq('user_id', user.id)
    if (hasCreatedAt) query = query.order('created_at', { ascending: false })
    const { data, count, error } = await withTimeout(
      query.limit(limit),
      15000,
      `getCloudTableData(${tableName})`,
    )
    if (error) throw error
    return {
      success: true,
      items: (data || []).map((row) => snakeToCamel(row, tableName)),
      total: count ?? data?.length ?? 0,
    }
  } catch (err) {
    // 根据错误类型返回更细致的 reason，让前端展示不同的提示文案
    const msg = String(err?.message || err || '').toLowerCase()
    if (msg.includes('timeout') || msg.includes('超时')) {
      return { success: false, reason: 'network_slow', error: '网络较慢，建议稍后再查看云端数据' }
    }
    if (msg.includes('failed to fetch') || msg.includes('network error') || msg.includes('typeerror: failed')) {
      return { success: false, reason: 'network_error', error: '无法连接到云端，请检查网络后重试' }
    }
    const detailed = formatDetailedError(err, `查看云端${TABLE_META[tableName]?.display || tableName}`)
    return { success: false, ...detailed }
  }
}

// 单表：删除云端该用户的全部数据
async function clearCloudTable(tableName) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'not_configured', error: 'Supabase 未配置' }
  }
  const user = await syncEngine.getCurrentUser()
  if (!user) return { success: false, reason: 'not_logged_in', error: '请先登录' }

  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('user_id', user.id)
    if (error) throw error
    return { success: true }
  } catch (err) {
    const detailed = formatDetailedError(err, `清空云端${TABLE_META[tableName]?.display || tableName}`)
    return { success: false, ...detailed }
  }
}

// 单表：按 id 删除云端一条记录
async function deleteCloudRecord(tableName, id) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'not_configured', error: 'Supabase 未配置' }
  }
  const user = await syncEngine.getCurrentUser()
  if (!user) return { success: false, reason: 'not_logged_in', error: '请先登录' }

  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('user_id', user.id)
      .eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (err) {
    const detailed = formatDetailedError(err, `删除云端记录`)
    return { success: false, ...detailed }
  }
}

// 单表：向云端插入一条记录
async function addCloudRecord(tableName, payload) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: '云端未配置' }
  }
  const user = await syncEngine.getCurrentUser()
  if (!user) return { success: false, error: '请先登录' }

  // 使用统一的 camelToSnake 进行字段转换，保证：
  //   - 字段名与云端 schema 一致（camelCase → snake_case）
  //   - 时间戳转为 ISO 字符串
  //   - 只发送 schema 定义的字段（避免多余字段）
  const convertedPayload = { ...camelToSnake(payload, tableName), user_id: user.id }

  try {
    const { data, error } = await withTimeout(
      supabase.from(tableName).insert([convertedPayload]).select(),
      9000,
      `addCloudRecord(${tableName})`,
    )
    if (error) throw error
    const item = snakeToCamel(data[0], tableName)
    return { success: true, item }
  } catch (err) {
    return { success: false, error: err.message || '添加失败' }
  }
}

// 单表：云端 → 本地拉取（覆盖写入）
// 返回 { success, count, error }
async function pullTableFromCloud(db, tableName) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'not_configured', error: 'Supabase 未配置' }
  }
  const user = await syncEngine.getCurrentUser()
  if (!user) return { success: false, reason: 'not_logged_in', error: '请先登录' }

  const meta = TABLE_META[tableName]
  if (!meta) return { success: false, error: '未知数据表' }

  try {
    // 1. 从云端拉取该表全部数据
    const cloudRaw = await fetchAllPages(
      supabase.from(tableName),
      TABLE_SCHEMAS[tableName].fields,
      'user_id', user.id, tableName
    )
    const cloudItems = cloudRaw.map((row) => snakeToCamel(row, tableName))

    // 2. 覆盖写入本地（清空 + bulkAdd）
    await db.transaction('rw', db[meta.local], async () => {
      await db[meta.local].clear()
      if (cloudItems.length > 0) await db[meta.local].bulkAdd(cloudItems)
    })

    if (['categories', 'chapters', 'units', 'cards'].includes(tableName)) {
      await repairCardRelationsAfterImport()
    }

    return { success: true, count: cloudItems.length }
  } catch (err) {
    const detailed = formatDetailedError(err, `下载${meta.display}`)
    return { success: false, ...detailed }
  }
}

// 导出单例
export const syncEngine = new SyncEngine()

const pendingPushRetries = []
let retryListenerAttached = false
let retryTimer = null

function attachRetryListener() {
  if (retryListenerAttached || typeof window === 'undefined') return
  retryListenerAttached = true
  window.addEventListener('online', () => {
    retryPendingSyncs()
  })
}

async function retryPendingSyncs() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (pendingPushRetries.length === 0 || syncEngine.syncing) return
  const next = pendingPushRetries.shift()
  const result = await syncEngine.pushToCloud(next.db)
  if (!result.success && next.attempt < 5) {
    pendingPushRetries.unshift({ ...next, attempt: next.attempt + 1 })
    retryTimer = setTimeout(retryPendingSyncs, Math.min(30000, 2000 * (next.attempt + 1)))
  }
}

export async function syncToSupabase(db, options = {}) {
  attachRetryListener()
  const result = await syncEngine.pushToCloud(db)
  if (!result.success) {
    const retryable = ['network_error', 'timeout_error', 'unknown_error', 'already_syncing'].includes(result.reason)
      || String(result.error || '').includes('网络')
      || String(result.error || '').toLowerCase().includes('fetch')
    if (retryable && options.autoRetry !== false) {
      pendingPushRetries.push({ db, attempt: 1, queuedAt: Date.now() })
      if (typeof navigator === 'undefined' || navigator.onLine) {
        retryTimer = setTimeout(retryPendingSyncs, 3000)
      }
    }
  }
  return result
}

export function getPendingSyncRetryCount() {
  return pendingPushRetries.length
}

// 完整同步函数（先拉取云端数据，再推送本地数据）
export async function synchronize() {
  const { db } = await import('./db')
  return syncEngine.fullSync(db)
}

// 获取同步状态
let lastSyncAt = null
let syncInProgress = false

export function getSyncStatus() {
  return {
    lastSyncAt,
    syncInProgress,
  }
}

// 更新同步状态（在同步开始/结束时调用）
export function updateSyncStatus(inProgress) {
  syncInProgress = inProgress
  if (!inProgress) {
    lastSyncAt = Date.now()
  }
}

export {
  uploadTableToCloud,
  syncTableBidirectional,
  getCloudTableData,
  clearCloudTable,
  deleteCloudRecord,
  addCloudRecord,
  TABLE_META,
  TABLE_SCHEMAS,
  FIELD_MAP_CAMEL_TO_SNAKE,
  camelToSnake,
  snakeToCamel,
  pullTableFromCloud,  // 新增
  retryPendingSyncs,
}
export default syncEngine
