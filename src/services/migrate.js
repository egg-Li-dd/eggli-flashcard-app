import { supabase, isSupabaseConfigured } from './cloudbase'
import { STORAGE_KEYS } from '../utils/constants'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { parseExcelFile, parseTestQuestionExcel } from '../utils/excelParser'

// —— 需要随导入导出同步的设置字段 ——
const SETTINGS_STORAGE_MAP = {
  apiKey: STORAGE_KEYS.API_KEY,
  model: STORAGE_KEYS.MODEL,
  speechMode: STORAGE_KEYS.SPEECH_MODE,
  speechApiUrl: STORAGE_KEYS.SPEECH_API_URL,
  speechApiKey: STORAGE_KEYS.SPEECH_API_KEY,
  fontSize: STORAGE_KEYS.FONT_SIZE,
  eyeProtection: STORAGE_KEYS.EYE_PROTECTION,
  inputBarMode: STORAGE_KEYS.INPUT_BAR_MODE,
}

// 读取 localStorage 中的设置
function readSettings() {
  const settings = {}
  for (const [key, storageKey] of Object.entries(SETTINGS_STORAGE_MAP)) {
    const value = localStorage.getItem(storageKey)
    if (value !== null && value !== undefined) {
      // eyeProtection 是 boolean
      settings[key] = key === 'eyeProtection' ? value === 'true' : value
    }
  }
  return settings
}

// 写入设置到 localStorage
function writeSettings(settings) {
  if (!settings || typeof settings !== 'object') return
  for (const [key, storageKey] of Object.entries(SETTINGS_STORAGE_MAP)) {
    if (key in settings && settings[key] !== undefined && settings[key] !== null) {
      localStorage.setItem(storageKey, String(settings[key]))
    }
  }
}

// —— 检测 Capacitor 环境 ——
function isCapacitor() {
  return (
    typeof window !== 'undefined' &&
    (window.Capacitor !== undefined ||
      window.webkit?.messageHandlers?.bridge !== undefined ||
      window.location?.protocol === 'capacitor:' ||
      /Capacitor|capacitor/i.test(navigator?.userAgent || ''))
  )
}

// —— 字段名映射：camelCase ↔ snake_case（与 sync.js 对齐）——
const CAMEL_TO_SNAKE = {
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
  // review_history 字段
  reviewedAt: 'reviewed_at',
  wasMastered: 'was_mastered',
  mode: 'mode',
  // study_plans 字段
  dailyReviewLimit: 'daily_review_limit',
  dailyNewLimit: 'daily_new_limit',
  priority: 'priority',
  // topics / chapters 字段
  topicId: 'topic_id',
  purpose: 'purpose',
}

// —— 云端表结构定义：明确每个表有哪些字段（与 sync.js 对齐，13 张业务表）——
const TABLE_SCHEMAS = {
  categories: {
    fields: ['id', 'name', 'purpose', 'created_at', 'updated_at', 'user_id'],
    autoAddUpdatedAt: true
  },
  topics: {
    fields: ['id', 'category_id', 'name', 'created_at', 'updated_at', 'user_id'],
    autoAddUpdatedAt: true
  },
  chapters: {
    fields: ['id', 'category_id', 'topic_id', 'name', 'order', 'created_at', 'updated_at', 'user_id'],
    autoAddUpdatedAt: true
  },
  units: {
    fields: ['id', 'category_id', 'chapter_id', 'name', 'order', 'created_at', 'updated_at', 'user_id'],
    autoAddUpdatedAt: true
  },
  cards: {
    fields: ['id', 'unit_id', 'category_id', 'chapter_id', 'front', 'back', 'knowledge_point', 'order', 'created_at', 'updated_at', 'user_id', 'type', 'options', 'answer_blank'],
    autoAddUpdatedAt: true
  },
  card_status: {
    fields: ['id', 'card_id', 'category_id', 'chapter_id', 'user_id', 'status', 'updated_at', 'review_count', 'ease_factor', 'interval_days', 'repetitions', 'last_reviewed_at', 'next_review_at', 'difficulty', 'wrong_count', 'wrong_streak', 'mode', 'user_override'],
    autoAddUpdatedAt: true
  },
  bookmarks: {
    fields: ['id', 'card_id', 'created_at', 'user_id'],
    autoAddUpdatedAt: false
  },
  wrong_answers: {
    fields: ['id', 'card_id', 'category_id', 'chapter_id', 'unit_id', 'unit_name', 'category_name', 'stem', 'user_id', 'count', 'question_type', 'question_id', 'last_wrong_at', 'created_at', 'updated_at'],
    autoAddUpdatedAt: true
  },
  test_questions: {
    fields: ['id', 'category_id', 'unit_id', 'chapter_id', 'card_id', 'type', 'question', 'stem', 'options', 'answer', 'explanation', 'analysis', 'difficulty', 'knowledge_point', 'test_type', 'target_id', 'card_updated_at', 'user_id', 'created_at', 'updated_at'],
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
}

// —— 将本地短字符串 ID 转换为兼容格式（现已改为 text 类型，不再强制转换）——
// 注意：保留此函数以兼容旧数据迁移，新数据将直接使用本地字符串 ID
function toUUID(str) {
  if (!str) return str
  // 如果已经是 UUID 格式或包含 -，直接返回
  if (str.includes('-')) return str
  // 如果是纯字母数字字符串（本地生成的 ID），保持原样
  // Supabase text 类型支持任意字符串
  return str
}

// —— 本地数据 → 云端数据格式转换（按表名定制）——
function convertToCloud(item, tableName, userId) {
  const schema = TABLE_SCHEMAS[tableName]
  if (!schema) {
    console.warn(`[MIGRATE] 未知表名: ${tableName}`)
  }

  // 字段映射转换
  const mapped = {}
  for (const [k, v] of Object.entries(item)) {
    const snakeKey = CAMEL_TO_SNAKE[k] || k
    mapped[snakeKey] = v
  }

  // 时间字段格式转换（本地毫秒数 → ISO 字符串）
  const timeFields = [
    'created_at', 'updated_at', 'last_wrong_at', 'last_reviewed_at',
    'next_review_at', 'start_time', 'last_saved_at', 'reviewed_at', 'card_updated_at'
  ]
  for (const field of timeFields) {
    if (mapped[field] && typeof mapped[field] === 'number') {
      mapped[field] = new Date(mapped[field]).toISOString()
    }
  }

  // 确保 created_at 存在（对于需要此字段的表）
  if (schema && schema.fields.includes('created_at') && !mapped.created_at) {
    mapped.created_at = new Date().toISOString()
  }

  // 仅为"应该有 updated_at"的表添加此字段
  if (schema && schema.autoAddUpdatedAt && !mapped.updated_at) {
    mapped.updated_at = new Date().toISOString()
  }

  // 将 ID 字段转换为合法 UUID 格式（本地短字符串 → 标准 UUID）
  const uuidFields = ['id', 'category_id', 'unit_id', 'card_id', 'chapter_id', 'topic_id', 'question_id', 'test_session_id', 'target_id']
  for (const field of uuidFields) {
    if (mapped[field] && typeof mapped[field] === 'string' && !mapped[field].includes('-')) {
      mapped[field] = toUUID(mapped[field])
    }
  }

  // 添加 user_id
  mapped.user_id = userId

  // 过滤掉不在 schema 中的字段（防止发送云端不存在的列）
  if (schema) {
    const filtered = {}
    for (const key of schema.fields) {
      if (key in mapped) {
        filtered[key] = mapped[key]
      }
    }
    return filtered
  }

  return mapped
}

/**
 * 数据迁移工具
 * 将本地 IndexedDB 数据迁移到云端 CloudBase
 */

// 检查是否有未同步的本地数据
export async function checkPendingSync(db) {
  const knowledgeTree = await db.knowledgeTree.count()
  const cards = await db.cards.count()

  return {
    hasData: knowledgeTree > 0,
    stats: {
      knowledgeTree,
      cards
    }
  }
}

// 迁移数据到云端
export async function migrateLocalToCloud(db, onProgress) {
  const isMobile = isCapacitor()

  // 详细日志函数
  const log = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
  }

  log(`开始迁移，环境: ${isMobile ? '移动端(Capacitor)' : '网页端(Web)'}`, 'info')

  // 1. 检查云端配置
  log('检查云端配置...', 'info')
  if (!isSupabaseConfigured()) {
    log('云端未配置', 'error')
    return {
      success: false,
      reason: 'not_configured',
      error: '云端未配置',
      suggestion: '请在设置页面配置 CloudBase 环境'
    }
  }
  log('云端配置正常', 'info')

  // 2. 获取当前用户
  log('获取当前用户...', 'info')
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) {
      log(`获取用户失败: ${authError.message}`, 'error')
      return {
        success: false,
        reason: 'auth_error',
        error: `获取用户信息失败: ${authError.message}`,
        suggestion: '请重新登录后重试'
      }
    }
    if (!user) {
      log('用户未登录', 'error')
      return {
        success: false,
        reason: 'not_logged_in',
        error: '用户未登录',
        suggestion: '请先登录账号'
      }
    }
    log(`用户已登录: ${user.email}`, 'info')

    try {
      onProgress?.('正在导出本地数据...')
      log('开始导出本地数据...', 'info')

      // 3. 导出本地所有数据（统一使用 knowledgeTree）
      const knowledgeTree = await db.knowledgeTree.toArray()
      const cards = await db.cards.toArray()
      const statuses = await db.cardStatus.toArray()
      const bookmarks = await db.bookmarks.toArray()
      const wrongAnswers = await db.wrongAnswers.toArray()
      const testQuestions = await db.testQuestions.toArray()
      const testRecords = await db.testRecords.toArray()
      const testSessions = await db.testSessions.toArray()
      const reviewHistory = await db.reviewHistory.toArray()
      const studyPlans = await db.studyPlans.toArray()

      const categories = knowledgeTree.filter(n => n.level === 'category')
      const topics = knowledgeTree.filter(n => n.level === 'topic')
      const chapters = knowledgeTree.filter(n => n.level === 'chapter')
      const units = knowledgeTree.filter(n => n.level === 'unit')

      log(`本地数据统计: 知识树${knowledgeTree.length}, 分类${categories.length}, 主题${topics.length}, 章节${chapters.length}, 单元${units.length}, 卡片${cards.length}, 状态${statuses.length}, 收藏${bookmarks.length}, 错题${wrongAnswers.length}, 题目${testQuestions.length}, 记录${testRecords.length}, 会话${testSessions.length}, 复习历史${reviewHistory.length}, 背诵计划${studyPlans.length}`, 'info')

      if (cards.length === 0) {
        log('本地没有数据需要迁移', 'warn')
        onProgress?.('本地没有数据需要迁移')
        return {
          success: false,
          reason: 'no_data',
          error: '本地没有数据需要迁移',
          suggestion: '请先在记录页面添加一些卡片后再进行迁移'
        }
      }

      onProgress?.(`找到 ${cards.length} 张卡片，开始上传...`)

      // 4. 准备云端数据格式
      const userCategories = categories.map(item => convertToCloud(item, 'categories', user.id))
      const userTopics = topics.map(item => convertToCloud(item, 'topics', user.id))
      const userChapters = chapters.map(item => convertToCloud(item, 'chapters', user.id))
      const userUnits = units.map(item => convertToCloud(item, 'units', user.id))
      const userCards = cards.map(item => convertToCloud(item, 'cards', user.id))
      const userStatuses = statuses.map(item => convertToCloud(item, 'card_status', user.id))
      const userBookmarks = bookmarks.map(item => convertToCloud(item, 'bookmarks', user.id))
      const userWrongAnswers = wrongAnswers.map(item => convertToCloud(item, 'wrong_answers', user.id))
      const userTestQuestions = testQuestions.map(item => convertToCloud(item, 'test_questions', user.id))
      const userTestRecords = testRecords.map(item => convertToCloud(item, 'test_records', user.id))
      const userTestSessions = testSessions.map(item => convertToCloud(item, 'test_sessions', user.id))
      const userReviewHistory = reviewHistory.map(item => convertToCloud(item, 'review_history', user.id))
      const userStudyPlans = studyPlans.map(item => convertToCloud(item, 'study_plans', user.id))

      log('数据转换完成', 'info')

      // 5. 批量上传到云端
      const TABLE_CONFLICT = {
        categories: 'id',
        topics: 'id',
        chapters: 'id',
        units: 'id',
        cards: 'id',
        card_status: 'id',
        bookmarks: 'card_id, user_id',
        wrong_answers: 'id',
        test_questions: 'id',
        test_records: 'id',
        test_sessions: 'id',
        review_history: 'id',
        study_plans: 'id',
      }

      const uploadTable = async (table, data) => {
        if (!data.length) {
          log(`${table}: 跳过（无数据）`, 'info')
          return { success: true }
        }

        onProgress?.(`上传${table}数据...`)
        log(`开始上传 ${table}: ${data.length} 条`, 'info')

        try {
          const conflict = TABLE_CONFLICT[table] || 'id'
          let { error } = await supabase.from(table).upsert(data, {
            onConflict: conflict
          })
          
          if (error) {
            log(`${table}上传失败 (onConflict): ${error.message}`, 'warn')
            log(`尝试不使用 onConflict 参数重新上传 ${table}`, 'info')
            const { error: retryError } = await supabase.from(table).upsert(data)
            if (retryError) {
              log(`${table}上传失败: ${retryError.message}`, 'error')
              throw new Error(`${table}上传失败: ${retryError.message}`)
            }
          }
          log(`${table}上传成功: ${data.length} 条`, 'info')
          return { success: true, count: data.length }
        } catch (err) {
          if (isMobile && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
            log('移动端网络请求失败', 'error')
            throw new Error('网络请求失败，请检查手机网络连接')
          }
          throw err
        }
      }

      const results = await Promise.all([
        uploadTable('categories', userCategories),
        uploadTable('topics', userTopics),
        uploadTable('chapters', userChapters),
        uploadTable('units', userUnits),
        uploadTable('cards', userCards),
        uploadTable('card_status', userStatuses),
        uploadTable('bookmarks', userBookmarks),
        uploadTable('wrong_answers', userWrongAnswers),
        uploadTable('test_questions', userTestQuestions),
        uploadTable('test_records', userTestRecords),
        uploadTable('test_sessions', userTestSessions),
        uploadTable('review_history', userReviewHistory),
        uploadTable('study_plans', userStudyPlans),
      ])

      // 6. 标记迁移完成
      localStorage.setItem('cloud_migration_done', 'true')
      localStorage.setItem('cloud_migration_time', Date.now().toString())

      onProgress?.('迁移完成！')
      log('迁移完成', 'success')

      return {
        success: true,
        stats: {
          categories: results[0].count || 0,
          topics: results[1].count || 0,
          chapters: results[2].count || 0,
          units: results[3].count || 0,
          cards: results[4].count || 0,
          statuses: results[5].count || 0,
          bookmarks: results[6].count || 0,
          wrongAnswers: results[7].count || 0,
          testQuestions: results[8].count || 0,
          testRecords: results[9].count || 0,
          testSessions: results[10].count || 0,
          reviewHistory: results[11].count || 0,
          studyPlans: results[12].count || 0,
        }
      }
    } catch (error) {
      log(`迁移过程失败: ${error.message}`, 'error')
      return {
        success: false,
        reason: 'migration_error',
        error: error.message,
        suggestion: '请确认云端配置正确且网络通畅'
      }
    }
  } catch (error) {
    log(`身份验证失败: ${error.message}`, 'error')
    return {
      success: false,
      reason: 'auth_error',
      error: `身份验证失败: ${error.message}`,
      suggestion: '请重新登录后重试'
    }
  }
}

// 检查是否已完成迁移
export function isMigrationDone() {
  return localStorage.getItem('cloud_migration_done') === 'true'
}

// 导出数据为 JSON 文件（浏览器：下载；移动端：保存到 Downloads 目录）
// 注意：JSON 导出使用本地 camelCase 格式，不进行 snake_case 转换
export async function exportDataToJson(db) {
  const knowledgeTree = await db.knowledgeTree.toArray()
  const cards = await db.cards.toArray()
  const statuses = await db.cardStatus.toArray()
  const bookmarks = await db.bookmarks.toArray()
  const wrongAnswers = await db.wrongAnswers.toArray()
  const testQuestions = await db.testQuestions.toArray()
  const testRecords = await db.testRecords.toArray()
  const testSessions = await db.testSessions.toArray()
  const reviewHistory = await db.reviewHistory.toArray()
  const studyPlans = await db.studyPlans.toArray()

  const categories = knowledgeTree.filter(n => n.level === 'category')
  const topics = knowledgeTree.filter(n => n.level === 'topic')
  const chapters = knowledgeTree.filter(n => n.level === 'chapter')
  const units = knowledgeTree.filter(n => n.level === 'unit')

  const data = {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    settings: readSettings(),
    knowledgeTree,
    categories,
    topics,
    chapters,
    units,
    cards,
    cardStatus: statuses,
    bookmarks,
    wrongAnswers,
    testQuestions,
    testRecords,
    testSessions,
    reviewHistory,
    studyPlans,
  }

  const jsonStr = JSON.stringify(data, null, 2)
  const filename = `eggli-backup-${new Date().toISOString().split('T')[0]}.json`

  if (isCapacitor()) {
    try {
      const result = await Filesystem.writeFile({
        path: filename,
        data: jsonStr,
        directory: Directory.Documents,
        recursive: true,
        encoding: 'utf8',
      })
      return {
        success: true,
        path: result?.uri || filename,
        filename,
        platform: 'mobile',
      }
    } catch (err) {
      const fallback = await Filesystem.writeFile({
        path: filename,
        data: jsonStr,
        directory: Directory.Cache,
        recursive: true,
        encoding: 'utf8',
      })
      return {
        success: true,
        path: fallback?.uri || filename,
        filename,
        platform: 'mobile',
        fallback: true,
      }
    }
  }

  // 浏览器：触发下载
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)

  return { success: true, filename, platform: 'web' }
}

/**
 * 导出全部数据为 Excel 文件（多工作表）
 * 供账号页面「导出 Excel」使用
 */
export async function exportDataToExcel(db) {
  const XLSX = await import('xlsx').then(m => m.default || m)
  const wb = XLSX.utils.book_new()

  const knowledgeTree = await db.knowledgeTree.toArray()
  const cards = await db.cards.toArray()
  const units = knowledgeTree.filter(n => n.level === 'unit')
  const chapters = knowledgeTree.filter(n => n.level === 'chapter')
  const categories = knowledgeTree.filter(n => n.level === 'category')

  const unitMap = {}
  for (const u of units) unitMap[u.id] = u
  const chapterMap = {}
  for (const c of chapters) chapterMap[c.id] = c
  const catMap = {}
  for (const c of categories) catMap[c.id] = c

  if (cards.length > 0) {
    const importRows = [
      ['提示：此工作表可直接用于导入', '', '', '', '', ''],
      ['分类', '章节', '单元', '问题', '答案', '知识点'],
      ...cards.map(c => {
        const u = unitMap[c.unitId]
        const ch = u ? chapterMap[u.chapterId] : null
        const cat = catMap[c.categoryId]
        return [
          cat?.name || '',
          ch?.name || '',
          u?.name || '',
          c.front || '',
          c.back || '',
          c.knowledge_point || ''
        ]
      })
    ]
    const ws = XLSX.utils.aoa_to_sheet(importRows)
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 40 }, { wch: 40 }, { wch: 20 }]
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]
    XLSX.utils.book_append_sheet(wb, ws, '卡片数据')
  }

  // 分类
  if (categories.length > 0) {
    const ws = XLSX.utils.json_to_sheet(categories.map(c => ({ ID: c.id, 名称: c.name, 创建时间: c.createdAt ? new Date(c.createdAt).toLocaleString() : '' })))
    XLSX.utils.book_append_sheet(wb, ws, '分类')
  }

  // 章节
  if (chapters.length > 0) {
    const ws = XLSX.utils.json_to_sheet(chapters.map(c => ({ ID: c.id, 所属分类ID: c.categoryId, 名称: c.name, 创建时间: c.createdAt ? new Date(c.createdAt).toLocaleString() : '' })))
    XLSX.utils.book_append_sheet(wb, ws, '章节')
  }

  // 单元
  if (units.length > 0) {
    const ws = XLSX.utils.json_to_sheet(units.map(u => ({ ID: u.id, 所属分类ID: u.categoryId, 所属章节ID: u.chapterId || '', 名称: u.name, 创建时间: u.createdAt ? new Date(u.createdAt).toLocaleString() : '' })))
    XLSX.utils.book_append_sheet(wb, ws, '单元')
  }

  // 卡片
  if (cards.length > 0) {
    const ws = XLSX.utils.json_to_sheet(cards.map(c => ({ ID: c.id, 所属分类ID: c.categoryId, 所属单元ID: c.unitId, 问题: c.front, 答案: c.back, 知识点: c.knowledge_point || '', 类型: c.type || 'qa', 创建时间: c.createdAt ? new Date(c.createdAt).toLocaleString() : '' })))
    XLSX.utils.book_append_sheet(wb, ws, '卡片')
  }

  // 错题
  const wrongAnswers = await db.wrongAnswers.toArray()
  if (wrongAnswers.length > 0) {
    const ws = XLSX.utils.json_to_sheet(wrongAnswers.map(w => ({ 卡片ID: w.cardId, 用户答案: w.userAnswer, 正确答案: w.correctAnswer, 错误次数: w.wrongCount || 1, 最后错误: w.lastWrongAt ? new Date(w.lastWrongAt).toLocaleString() : '' })))
    XLSX.utils.book_append_sheet(wb, ws, '错题')
  }

  const filename = `eggli-全量导出-${new Date().toISOString().split('T')[0]}.xlsx`
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

  if (isCapacitor()) {
    try {
      const base64 = arrayBufferToBase64(data)
      const result = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents, recursive: true })
      return { success: true, path: result?.uri || filename, filename, platform: 'mobile' }
    } catch (err) {
      const fallback = await Filesystem.writeFile({ path: filename, data: arrayBufferToBase64(data), directory: Directory.Cache, recursive: true })
      return { success: true, path: fallback?.uri || filename, filename, platform: 'mobile', fallback: true }
    }
  }

  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return { success: true, filename, platform: 'web' }
}

// 从 JSON 文件导入数据
// 注意：JSON 导入使用本地 camelCase 格式，不进行 snake_case 转换
export async function importDataFromJson(db, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result)

        await db.transaction('rw',
          db.knowledgeTree, db.cards,
          db.cardStatus, db.bookmarks, db.wrongAnswers, db.testQuestions,
          db.testRecords, db.testSessions, db.reviewHistory, db.studyPlans,
          async () => {
            // 清空旧数据
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

            const now = Date.now()

            if (data.knowledgeTree && data.knowledgeTree.length) {
              await db.knowledgeTree.bulkAdd(data.knowledgeTree)
            } else {
              if (data.categories?.length) {
                for (const cat of data.categories) {
                  await db.knowledgeTree.add({
                    ...cat,
                    parentId: null,
                    level: 'category',
                    categoryId: cat.id,
                    topicId: null,
                    chapterId: null,
                    unitId: null,
                    updatedAt: cat.updatedAt || now,
                  })
                }
              }
              if (data.topics?.length) {
                for (const topic of data.topics) {
                  await db.knowledgeTree.add({
                    ...topic,
                    parentId: topic.categoryId,
                    level: 'topic',
                    categoryId: topic.categoryId,
                    topicId: topic.id,
                    chapterId: null,
                    unitId: null,
                    updatedAt: topic.updatedAt || now,
                  })
                }
              }
              if (data.chapters?.length) {
                for (const chapter of data.chapters) {
                  await db.knowledgeTree.add({
                    ...chapter,
                    parentId: chapter.topicId || chapter.categoryId,
                    level: 'chapter',
                    categoryId: chapter.categoryId,
                    topicId: chapter.topicId || null,
                    chapterId: chapter.id,
                    unitId: null,
                    updatedAt: chapter.updatedAt || now,
                  })
                }
              }
              if (data.units?.length) {
                for (const unit of data.units) {
                  await db.knowledgeTree.add({
                    ...unit,
                    parentId: unit.chapterId || unit.categoryId,
                    level: 'unit',
                    categoryId: unit.categoryId,
                    chapterId: unit.chapterId || null,
                    unitId: unit.id,
                    updatedAt: unit.updatedAt || now,
                  })
                }
              }
            }

            if (data.cards?.length) await db.cards.bulkAdd(data.cards)
            if (data.cardStatus?.length) await db.cardStatus.bulkAdd(data.cardStatus)
            if (data.bookmarks?.length) await db.bookmarks.bulkAdd(data.bookmarks)
            if (data.wrongAnswers?.length) await db.wrongAnswers.bulkAdd(data.wrongAnswers)
            if (data.testQuestions?.length) await db.testQuestions.bulkAdd(data.testQuestions)
            if (data.testRecords?.length) await db.testRecords.bulkAdd(data.testRecords)
            if (data.testSessions?.length) await db.testSessions.bulkAdd(data.testSessions)
            if (data.reviewHistory?.length) await db.reviewHistory.bulkAdd(data.reviewHistory)
            if (data.studyPlans?.length) await db.studyPlans.bulkAdd(data.studyPlans)

            // 恢复设置到 localStorage
            if (data.settings && typeof data.settings === 'object') {
              writeSettings(data.settings)
            }
          }
        )

        resolve({ success: true, settings: data.settings || null })
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

export async function importDataFromExcel(db, file) {
  const parsed = await parseExcelFile(file)

  if (!parsed.success || parsed.totalCards === 0) {
    throw new Error(parsed.warnings?.[0] || 'Excel 文件中没有找到有效的卡片数据')
  }

  const now = Date.now()
  const existingKnowledgeTree = await db.knowledgeTree.toArray()

  const existingCatMap = {}
  for (const c of existingKnowledgeTree) {
    if (c.level === 'category') existingCatMap[c.name] = c.id
  }
  const existingChapterMap = {}
  for (const c of existingKnowledgeTree) {
    if (c.level === 'chapter') existingChapterMap[`${c.categoryId}_${c.name}`] = c.id
  }
  const existingUnitMap = {}
  for (const u of existingKnowledgeTree) {
    if (u.level === 'unit') existingUnitMap[`${u.categoryId}_${u.name}`] = u.id
  }

  const categoryMap = {}
  const chapterMap = {}
  const unitMap = {}
  const knowledgeTreeNodes = []
  const cards = []
  const cardStatuses = []

  parsed.cards.forEach((card) => {
    const catName = card.categoryName || '默认分类'
    const chapName = card.chapterName || ''
    const unitName = card.unitName || '默认单元'

    if (!categoryMap[catName]) {
      const existingId = existingCatMap[catName]
      if (existingId) {
        categoryMap[catName] = { id: existingId, name: catName }
      } else {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
        categoryMap[catName] = { id, name: catName }
        knowledgeTreeNodes.push({
          id,
          parentId: null,
          level: 'category',
          name: catName,
          categoryId: id,
          topicId: null,
          chapterId: null,
          unitId: null,
          purpose: '',
          createdAt: now,
          updatedAt: now,
          order: 0,
        })
      }
    }

    let chapterId = null
    if (chapName) {
      const key = `${catName}_${chapName}`
      if (!chapterMap[key]) {
        const catId = categoryMap[catName].id
        const existKey = `${catId}_${chapName}`
        const existingChId = existingChapterMap[existKey]
        if (existingChId) {
          chapterMap[key] = { id: existingChId }
        } else {
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
          chapterMap[key] = { id }
          knowledgeTreeNodes.push({
            id,
            parentId: catId,
            level: 'chapter',
            name: chapName,
            categoryId: catId,
            topicId: null,
            chapterId: id,
            unitId: null,
            createdAt: now,
            updatedAt: now,
            order: Object.keys(chapterMap).filter(k => k.startsWith(catName)).length + 1,
          })
        }
      }
      chapterId = chapterMap[key].id
    }

    const unitKey = `${catName}_${unitName}`
    if (!unitMap[unitKey]) {
      const catId = categoryMap[catName].id
      const existKey = `${catId}_${unitName}`
      const existingUId = existingUnitMap[existKey]
      if (existingUId) {
        unitMap[unitKey] = { id: existingUId }
      } else {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
        unitMap[unitKey] = { id }
        knowledgeTreeNodes.push({
          id,
          parentId: chapterId || catId,
          level: 'unit',
          name: unitName,
          categoryId: catId,
          chapterId: chapterId || null,
          unitId: id,
          createdAt: now,
          updatedAt: now,
          order: Object.keys(unitMap).filter(k => k.startsWith(catName)).length + 1,
        })
      }
    }

    const cardId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    cards.push({
      id: cardId,
      unitId: unitMap[unitKey].id,
      categoryId: categoryMap[catName].id,
      chapterId: chapterId,
      front: card.front,
      back: card.back,
      knowledge_point: card.knowledge_point || '',
      order: cards.length + 1,
      createdAt: now,
      updatedAt: now,
    })

    cardStatuses.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      cardId: cardId,
      categoryId: categoryMap[catName].id,
      chapterId: chapterId,
      status: 'new',
      updatedAt: now,
      reviewCount: 0,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      difficulty: 0,
      wrongCount: 0,
      wrongStreak: 0,
      mode: 'sequential',
      userOverride: false,
    })
  })

  await db.transaction('rw',
    db.knowledgeTree, db.cards, db.cardStatus,
    async () => {
      if (knowledgeTreeNodes.length) await db.knowledgeTree.bulkAdd(knowledgeTreeNodes)
      if (cards.length) await db.cards.bulkAdd(cards)
      if (cardStatuses.length) await db.cardStatus.bulkAdd(cardStatuses)
    }
  )

  return {
    success: true,
    stats: {
      categories: categories.length,
      chapters: chapters.length,
      units: units.length,
      cards: cards.length,
    },
    warnings: parsed.warnings,
  }
}

/**
 * 从 Excel 导入题库（testQuestions）
 */
export async function importTestQuestionsFromExcel(db, file, userId = '') {
  const parsed = await parseTestQuestionExcel(file)
  if (!parsed.success || parsed.total === 0) {
    throw new Error(parsed.warnings?.[0] || 'Excel 文件中没有找到有效的题目')
  }

  const now = Date.now()
  const items = parsed.questions.map(q => ({
    id: undefined,
    userId,
    testType: 'category',
    targetId: '',
    categoryId: '',
    chapterId: '',
    unitId: '',
    cardId: '',
    type: q.type || 'single_choice',
    stem: q.stem || '',
    options: q.options || [],
    answer: q.answer || '',
    analysis: q.analysis || '',
    difficulty: q.difficulty || 3,
    knowledgePoint: q.knowledgePoint || '',
    createdAt: now,
    updatedAt: now,
  }))

  await db.testQuestions.bulkAdd(items)

  return {
    success: true,
    stats: { questions: items.length },
    warnings: parsed.warnings,
  }
}

/**
 * 保存 Excel 文件到设备（支持 Web 下载和 Android 文件系统）
 * @param {ArrayBuffer|Uint8Array} data - Excel 文件数据
 * @param {string} filename - 文件名（如 'eggli-模板.xlsx'）
 * @returns {Promise<{path?: string, platform: string}>}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export async function saveExcelFile(data, filename) {
  if (isCapacitor()) {
    try {
      const base64 = typeof data === 'string' ? data : arrayBufferToBase64(data)
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      })
      try {
        await Filesystem.writeFile({
          path: `Download/${filename}`,
          data: base64,
          directory: Directory.ExternalStorage,
          recursive: true,
        })
      } catch (_) {}
      return { success: true, path: result?.uri || filename, filename, platform: 'mobile' }
    } catch (err) {
      const fallback = await Filesystem.writeFile({
        path: filename,
        data: typeof data === 'string' ? data : arrayBufferToBase64(data),
        directory: Directory.Cache,
        recursive: true,
      })
      return { success: true, path: fallback?.uri || filename, filename, platform: 'mobile', fallback: true }
    }
  }
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return { success: true, filename, platform: 'web' }
}

/**
 * 分享文件（触发系统分享面板）
 * 优先使用 Capacitor Share 插件，回退到复制路径到剪贴板
 * @param {string} filePath - 文件路径
 * @param {string} title - 分享标题
 */
export async function shareFile(filePath, title = '分享文件') {
  // 使用 Web Share API（分享文本路径）
  try {
    if (navigator.share) {
      await navigator.share({ title, text: `文件已保存到：${filePath}` })
      return true
    }
  } catch (_) {}
  // 复制路径到剪贴板
  try {
    await navigator.clipboard.writeText(filePath)
    return true
  } catch (_) {}
  return false
}

export default {
  checkPendingSync,
  migrateLocalToCloud,
  isMigrationDone,
  exportDataToJson,
  importDataFromJson,
  importDataFromExcel,
  importTestQuestionsFromExcel,
  saveExcelFile,
  shareFile,
}
