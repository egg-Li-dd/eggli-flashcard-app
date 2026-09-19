import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  getCloudTableData,
  deleteCloudRecord,
  clearCloudTable,
  addCloudRecord,
} from '../services/sync'
import { dbInstance, buildKnowledgeTree } from '../services/db'
import { supabase } from '../services/cloudbase'
import {
  fetchCloudSettingsStructured,
  extractSettingsForApp,
} from '../services/settingsSync'
import { getUserProfile } from '../services/userProfile'

const TABLE_META = {
  knowledge_tree: { name: '知识树', business: ['level', 'name', 'parentId'], meta: ['id', 'categoryId', 'chapterId', 'unitId', 'front', 'back', 'createdAt', 'updatedAt'] },
  card_status: { name: '学习状态', business: ['cardId', 'status', 'reviewCount', 'mode', 'difficulty', 'wrongCount'], meta: ['id', 'categoryId', 'createdAt', 'updatedAt'], noUpload: true },
  bookmarks: { name: '书签', business: ['cardId'], meta: ['id', 'createdAt'] },
  wrong_answers: { name: '错题记录', business: ['cardId', 'categoryId', 'count'], meta: ['id', 'createdAt', 'lastWrongAt'] },
  test_questions: { name: '检测题目', business: ['stem', 'type', 'answer', 'difficulty', 'unitId', 'categoryId'], meta: ['id', 'cardId', 'createdAt', 'updatedAt'] },
  test_records: { name: '答题记录', business: ['categoryId', 'unitId', 'correctCount', 'totalCount', 'totalScore', 'timeUsed', 'type'], meta: ['id', 'createdAt'] },
  test_sessions: { name: '答题会话', business: ['testType', 'typeId', 'isCompleted', 'currentIndex'], meta: ['id', 'startTime', 'lastSavedAt', 'createdAt'] },
  review_history: { name: '复习历史', business: ['cardId', 'wasMastered', 'reviewedAt', 'mode'], meta: ['id', 'categoryId', 'createdAt'] },
  study_plans: { name: '学习计划', business: ['categoryId', 'dailyReviewLimit', 'dailyNewLimit', 'priority'], meta: ['id', 'createdAt', 'updatedAt'] },
  user_settings: { name: '设置', business: ['settings'], meta: ['id', 'updatedAt'], noAdd: true },
  user_profiles: { name: '用户资料', business: ['nickname', 'avatarUrl', 'avatarType', 'tags'], meta: ['id', 'updatedAt'], noAdd: true },
}

// 设置字段按服务分组（用于 user_settings 卡片拆分展示）
const SETTINGS_GROUPS = [
  { name: 'DeepSeek（深度求索）', keys: ['apiKey', 'model'] },
  { name: '讯飞星火', keys: ['iflytekSparkApiKey', 'iflytekSparkModel', 'iflytekAppId', 'iflytekApiSecret'] },
  { name: '讯飞语音听写 (IAT)', keys: ['iflytekIatAppId', 'iflytekIatApiKey', 'iflytekIatApiSecret'] },
  { name: '阿里云百炼（千问）', keys: ['dashscopeApiKey', 'dashscopeModel'] },
  { name: '火山引擎（豆包）', keys: ['volcanoApiKey', 'volcanoModel'] },
  { name: 'Whisper 语音识别', keys: ['whisperApiUrl', 'whisperApiKey'] },
  { name: '显示设置', keys: ['fontSize', 'eyeProtection'] },
  { name: '语音设置', keys: ['speechMode', 'speechApiUrl', 'speechApiKey'] },
  { name: '输入栏模式', keys: ['inputBarMode'] },
  { name: 'AI 服务模式', keys: ['aiServiceMode'] },
]

const FORM_FIELDS = {
  knowledge_tree: [
    { key: 'level', label: '层级', type: 'select', required: true, options: [
      { value: 'category', label: 'category（分类）' },
      { value: 'topic', label: 'topic（主题）' },
      { value: 'chapter', label: 'chapter（章节）' },
      { value: 'unit', label: 'unit（单元）' },
      { value: 'knowledge_point', label: 'knowledge_point（知识点）' },
      { value: 'card', label: 'card（卡片）' },
    ]},
    { key: 'name', label: '名称', type: 'text', required: false, placeholder: '分类/主题/章节/单元/知识点名称' },
    { key: 'parentId', label: '父节点 ID', type: 'text', required: false, placeholder: '父节点 UUID（根节点为空）' },
    { key: 'front', label: '卡片正面（问题）', type: 'textarea', required: false, placeholder: '卡片正面内容' },
    { key: 'back', label: '卡片背面（答案）', type: 'textarea', required: false, placeholder: '卡片背面内容' },
    { key: 'categoryId', label: '分类 ID', type: 'text', required: false, placeholder: '冗余字段：分类 UUID' },
    { key: 'chapterId', label: '章节 ID', type: 'text', required: false, placeholder: '冗余字段：章节 UUID' },
    { key: 'unitId', label: '单元 ID', type: 'text', required: false, placeholder: '冗余字段：单元 UUID' },
    { key: 'status', label: '状态', type: 'select', required: false, options: [
      { value: 'active', label: 'active（活跃）' },
      { value: 'draft', label: 'draft（草稿）' },
      { value: 'archived', label: 'archived（归档）' },
    ]},
    { key: 'type', label: '卡片类型', type: 'select', required: false, options: [
      { value: 'short', label: 'short（简答题）' },
      { value: 'single_choice', label: 'single_choice（单选题）' },
      { value: 'multi_choice', label: 'multi_choice（多选题）' },
      { value: 'true_false', label: 'true_false（判断题）' },
      { value: 'fill_blank', label: 'fill_blank（填空题）' },
    ]},
  ],
  card_status: [
    { key: 'cardId', label: '卡片 ID', type: 'number', required: true, placeholder: '数字' },
    { key: 'status', label: '学习状态', type: 'select', required: true, options: [
        { value: 'new', label: 'new（未开始）' },
        { value: 'learning', label: 'learning（学习中）' },
        { value: 'mastered', label: 'mastered（已掌握）' },
    ]},
  ],
  bookmarks: [
    { key: 'cardId', label: '卡片 ID', type: 'number', required: true, placeholder: '数字' },
  ],
  wrong_answers: [
    { key: 'cardId', label: '卡片 ID', type: 'text', required: true, placeholder: '卡片 UUID' },
    { key: 'categoryId', label: '分类 ID', type: 'text', required: true, placeholder: '分类 UUID' },
    { key: 'chapterId', label: '章节 ID', type: 'text', required: false, placeholder: '章节 UUID' },
    { key: 'count', label: '错误次数', type: 'number', required: false, placeholder: '数字' },
  ],
  user_profiles: [
    { key: 'nickname', label: '昵称', type: 'text', required: true, placeholder: '例如：张三' },
    { key: 'avatarUrl', label: '头像', type: 'text', required: false, placeholder: '例如：avatar_1' },
    { key: 'avatarType', label: '头像类型', type: 'text', required: false, placeholder: '例如：preset' },
    { key: 'tags', label: '标签（JSON 数组）', type: 'text', required: false, placeholder: '例如：["学生","备考"]' },
  ],
  test_questions: [
    { key: 'stem', label: '题目', type: 'textarea', required: true, placeholder: '题目内容' },
    { key: 'type', label: '题型', type: 'select', required: true, options: [
      { value: 'single_choice', label: '单选题' },
      { value: 'multi_choice', label: '多选题' },
      { value: 'true_false', label: '判断题' },
      { value: 'fill_blank', label: '填空题' },
    ]},
    { key: 'answer', label: '正确答案', type: 'text', required: true, placeholder: '正确答案' },
    { key: 'difficulty', label: '难度(1-5)', type: 'number', required: false, placeholder: '1-5' },
    { key: 'categoryId', label: '分类 ID', type: 'text', required: false, placeholder: '分类 UUID' },
    { key: 'unitId', label: '单元 ID', type: 'text', required: false, placeholder: '单元 UUID' },
  ],
  review_history: [
    { key: 'cardId', label: '卡片 ID', type: 'text', required: true, placeholder: '卡片 UUID' },
    { key: 'wasMastered', label: '是否掌握', type: 'select', required: true, options: [
      { value: 'true', label: '是（已掌握）' },
      { value: 'false', label: '否（未掌握）' },
    ]},
    { key: 'reviewedAt', label: '复习时间', type: 'text', required: true, placeholder: '例如：2026-06-17T10:00:00Z' },
    { key: 'mode', label: '背诵模式', type: 'text', required: true, placeholder: '例如：sequential/active/ebbinghaus/weak' },
    { key: 'categoryId', label: '分类 ID', type: 'text', required: false, placeholder: '分类 UUID' },
  ],
  study_plans: [
    { key: 'categoryId', label: '分类 ID', type: 'text', required: true, placeholder: '分类 UUID' },
    { key: 'dailyReviewLimit', label: '每日复习上限', type: 'number', required: true, placeholder: '例如：50' },
    { key: 'dailyNewLimit', label: '每日新学上限', type: 'number', required: true, placeholder: '例如：20' },
    { key: 'priority', label: '优先级', type: 'number', required: false, placeholder: '数字' },
  ],
}

function truncate(s, n) {
  if (!s) return '—'
  const str = String(s)
  return str.length > n ? str.slice(0, n) + '…' : str
}

function formatTime(ts) {
  if (!ts) return '—'
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
    if (isNaN(d.getTime())) return String(ts)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch (e) {
    return String(ts)
  }
}

function renderFieldValue(item, key) {
  if (key === 'createdAt' || key === 'updatedAt') return formatTime(item[key])
  const v = item[key]
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) {
    const joined = v.map((x) => String(x)).join(', ')
    return truncate(joined || '—', 60)
  }
  if (typeof v === 'object') return truncate(JSON.stringify(v), 60)
  return truncate(String(v), 60)
}

function renderSettingsBody(settingObj) {
  if (settingObj === null || settingObj === undefined) {
    return <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  }
  let obj = settingObj
  if (typeof settingObj === 'string') {
    try {
      const parsed = JSON.parse(settingObj)
      if (parsed && typeof parsed === 'object') obj = parsed
    } catch (_) { }
  }
  if (!obj || typeof obj !== 'object') {
    return <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  }
  if (Array.isArray(obj)) {
    return <span style={{ color: 'var(--color-text-secondary)' }}>
      {obj.length === 0 ? '—' : truncate(JSON.stringify(obj), 80)}
    </span>
  }
  const entries = Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0]))
  if (entries.length === 0) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
      {entries.map(([k, v]) => {
        let displayValue
        if (v === null || v === undefined || v === '') {
          displayValue = '—'
        } else if (typeof v === 'object') {
          displayValue = truncate(JSON.stringify(v), 80)
        } else {
          displayValue = truncate(String(v), 80)
        }
        return (
          <div key={k} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text)', wordBreak: 'break-all' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginRight: 6 }}>{k}:</span>
            <span>{displayValue}</span>
          </div>
        )
      })}
    </div>
  )
}

// 将 user_settings 的 JSONB 设置对象按服务分组渲染为多张卡片
function renderSettingsGroupCards(settingObj, itemId) {
  if (settingObj === null || settingObj === undefined) {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>
  }
  let obj = settingObj
  if (typeof settingObj === 'string') {
    try {
      const parsed = JSON.parse(settingObj)
      if (parsed && typeof parsed === 'object') obj = parsed
    } catch (_) { }
  }
  if (!obj || typeof obj !== 'object') {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>
  }

  const groups = SETTINGS_GROUPS
    .map((g) => {
      const pairs = g.keys
        .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
        .map((k) => ({ key: k, value: obj[k] }))
      return { name: g.name, pairs }
    })
    .filter((g) => g.pairs.length > 0)

  if (groups.length === 0) {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      {groups.map((group, idx) => (
        <div
          key={`${itemId}-${idx}`}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--color-primary)',
            marginBottom: 6,
            paddingBottom: 6,
            borderBottom: '1px solid var(--color-border-light)',
          }}>
            {group.name}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {group.pairs.map(({ key, value }) => {
              let displayValue
              if (typeof value === 'object') {
                displayValue = truncate(JSON.stringify(value), 60)
              } else {
                displayValue = truncate(String(value), 60)
              }
              return (
                <div key={key} style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text)', wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginRight: 6 }}>{key}:</span>
                  <span>{displayValue}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({ open, title, message, onCancel, onConfirm, confirmText, danger }) {
  if (!open) return null
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--color-surface)', borderRadius: 12, padding: 20, margin: 16,
        maxWidth: 420, width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: 'var(--color-text)' }}>{title}</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, minHeight: 44, border: '1px solid var(--color-border-light)',
            background: 'transparent', color: 'var(--color-text-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>取消</button>
          <button onClick={onConfirm} style={{
            flex: 1, minHeight: 44, border: 'none',
            background: danger ? 'var(--color-danger)' : 'var(--color-primary)',
            color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

function filterItems(items, filters, localIds, localCategories, supportsCategoryFilter) {
  const ids = localIds || []
  const localCatIds = new Set((localCategories || []).map((c) => c.id))
  return items.filter(item => {
    // 按本地分类存在情况筛选（仅对有 categoryId 字段的表生效）
    if (supportsCategoryFilter && filters.localCategoryMode) {
      if (filters.localCategoryMode === 'local-has') {
        // 仅显示 categoryId 在本地分类列表中存在的记录
        if (!item.categoryId) return false
        if (!localCatIds.has(item.categoryId)) return false
      } else if (filters.localCategoryMode === 'local-none') {
        // 仅显示 categoryId 在本地分类列表中不存在的记录
        if (!item.categoryId) return false
        if (localCatIds.has(item.categoryId)) return false
      } else if (filters.localCategoryMode === 'by-id' && filters.localCategoryId && filters.localCategoryId !== 'all') {
        // 按具体某个分类 ID 筛选
        if (item.categoryId !== filters.localCategoryId) return false
      }
    }

    // 按本地下载情况筛选
    if (filters.localDownloadStatus === 'local-downloaded') {
      // 仅显示本地已下载的记录
      if (!ids.includes(item.id)) return false
    } else if (filters.localDownloadStatus === 'local-not-downloaded') {
      // 仅显示本地未下载的记录
      if (ids.includes(item.id)) return false
    }

    if (filters.timeRange && filters.timeRange !== 'all') {
      const ts = item.createdAt
      if (!ts) return false
      const itemTime = (typeof ts === 'number') ? ts : new Date(ts).getTime()
      const now = Date.now()
      let keep = false
      if (filters.timeRange === '7d')  keep = (now - itemTime) <= 7  * 24 * 3600 * 1000
      if (filters.timeRange === '30d') keep = (now - itemTime) <= 30 * 24 * 3600 * 1000
      if (filters.timeRange === '90d') keep = (now - itemTime) <= 90 * 24 * 3600 * 1000
      if (filters.timeRange === 'custom' && filters.startDate && filters.endDate) {
        const start = new Date(filters.startDate + 'T00:00:00').getTime()
        const end   = new Date(filters.endDate   + 'T23:59:59').getTime()
        keep = itemTime >= start && itemTime <= end
      }
      if (!keep) return false
    }
    if (filters.updatedStatus === 'updated') {
      const ca = item.createdAt, ua = item.updatedAt
      if (!ua) return false
      const caT = (typeof ca === 'number') ? ca : new Date(ca).getTime()
      const uaT = (typeof ua === 'number') ? ua : new Date(ua).getTime()
      if (Math.abs(uaT - caT) < 1000) return false
      return true
    }
    if (filters.updatedStatus === 'not-updated') {
      // 此分支不再在 filterItems 中处理（已交给 isShowingLocal 路径）
      return true
    }
    if (filters.downloadStatus === 'downloaded') {
      return ids.includes(item.id)
    }
    if (filters.downloadStatus === 'not-downloaded') {
      return !ids.includes(item.id)
    }
    return true
  })
}

function buildFilterSummary(filters, localCategories, supportsCategoryFilter) {
  const chips = []
  if (supportsCategoryFilter) {
    if (filters.localCategoryMode === 'local-has') chips.push({ key:'local-cat', label:'本地已有分类' })
    if (filters.localCategoryMode === 'local-none') chips.push({ key:'local-cat', label:'本地未有分类' })
    if (filters.localCategoryMode === 'by-id' && filters.localCategoryId && filters.localCategoryId !== 'all') {
      const catName = (localCategories || []).find((c) => c.id === filters.localCategoryId)?.name
        || `分类 ${String(filters.localCategoryId).slice(0, 8)}`
      chips.push({ key:'local-cat', label:`分类：${catName}` })
    }
  }
  if (filters.localDownloadStatus === 'local-downloaded') chips.push({ key:'local-download', label:'本地已下载' })
  if (filters.localDownloadStatus === 'local-not-downloaded') chips.push({ key:'local-download', label:'本地未下载' })
  if (filters.timeRange === '7d')  chips.push({ key:'time', label:'近 7 天' })
  if (filters.timeRange === '30d') chips.push({ key:'time', label:'近 30 天' })
  if (filters.timeRange === '90d') chips.push({ key:'time', label:'近 90 天' })
  if (filters.timeRange === 'custom' && filters.startDate && filters.endDate) {
    chips.push({ key:'time', label:`自定义: ${filters.startDate} ~ ${filters.endDate}` })
  }
  if (filters.updatedStatus === 'updated')     chips.push({ key:'status', label:'已有云端数据' })
  if (filters.updatedStatus === 'not-updated') chips.push({ key:'status', label:'云端未更新' })
  if (filters.downloadStatus === 'downloaded')     chips.push({ key:'download', label:'已下载' })
  if (filters.downloadStatus === 'not-downloaded') chips.push({ key:'download', label:'未下载' })
  return chips
}

const LOCAL_TABLE_MAP = {
  categories: 'categories',
  chapters: 'chapters',
  units: 'units',
  cards: 'cards',
  card_status: 'cardStatus',
  bookmarks: 'bookmarks',
  wrong_answers: 'wrongAnswers',
  test_questions: 'testQuestions',
  test_records: 'testRecords',
  test_sessions: 'testSessions',
  review_history: 'reviewHistory',
  study_plans: 'studyPlans',
  user_settings: 'userSettings',
  user_profiles: 'userProfiles',
}
// 标识哪些表带有 categoryId 字段（支持"按本地分类筛选"）
const HAS_CATEGORY_FIELD = ['chapters', 'units', 'cards', 'card_status', 'bookmarks', 'wrong_answers']

export default function CloudDataDetail() {
  const { table } = useParams()
  const navigate = useNavigate()
  const {
    state,
    showToast,
    setApiKey,
    setModel,
    setFontSize,
    setEyeProtection,
    setSpeechMode,
    setSpeechApiUrl,
    setSpeechApiKey,
    setInputBarMode,
    setIflytekAppId,
    setIflytekApiSecret,
    setAiServiceMode,
    setIflytekSparkModel,
    setIflytekSparkApiKey,
    setIflytekSparkApiSecret,
    setWhisperApiUrl,
    setWhisperApiKey,
    setIflytekIatAppId,
    setIflytekIatApiKey,
    setIflytekIatApiSecret,
    setVolcanoApiKey,
    setVolcanoModel,
    setDashscopeApiKey,
    setDashscopeModel,
    setOcrAutoGenerate,
    setOcrEngine,
    setPaddleocrServerUrl,
    setPaddleocrLanguage,
    setTailscaleAuthKey,
    setUserProfile,
  } = useApp()
  const meta = TABLE_META[table]
  const supportsCategoryFilter = HAS_CATEGORY_FIELD.includes(table)

  const [items, setItems] = useState([])
  const [localIds, setLocalIds] = useState([])
  // 本地完整数据，用于"云端未更新"筛选时显示本地独有数据
  const [localFullItems, setLocalFullItems] = useState([])
  // 本地分类列表，用于"按本地分类筛选"
  const [localCategories, setLocalCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [confirm, setConfirm] = useState({ open: false, title: '', message: '', onConfirm: null, danger: false })
  const [flippedId, setFlippedId] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState({
    timeRange: 'all',
    startDate: '',
    endDate: '',
    updatedStatus: 'all',
    downloadStatus: 'all',
    // 新增：按本地分类筛选；'all'=全部 | 'local-has'=仅本地存在的分类 | 'local-none'=仅本地没有的分类 | <categoryId>=具体某个分类
    localCategoryMode: 'all',
    localCategoryId: 'all',
    // 新增：按本地下载情况筛选；'all'=全部 | 'local-downloaded'=本地已下载 | 'local-not-downloaded'=本地未下载
    localDownloadStatus: 'all',
  })
  const [activeFilters, setActiveFilters] = useState({
    timeRange: 'all',
    startDate: '',
    endDate: '',
    updatedStatus: 'all',
    downloadStatus: 'all',
    localCategoryMode: 'all',
    localCategoryId: 'all',
    localDownloadStatus: 'all',
  })
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({})
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  
  const [knowledgeTree, setKnowledgeTree] = useState([])
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [filterNow, setFilterNow] = useState(Date.now())

  async function loadLocalIds() {
    const localName = LOCAL_TABLE_MAP[table]
    if (!localName) return
    try {
      const list = await dbInstance.table(localName).toArray()
      setLocalIds(list.map((r) => r.id))
      setLocalFullItems(list)
    } catch (err) {
      setLocalIds([])
      setLocalFullItems([])
    }
    // 同时加载本地分类列表，用于"按本地分类筛选"
    if (supportsCategoryFilter) {
      try {
        const cats = await dbInstance.table('categories').toArray()
        const catList = cats.map((c) => ({ id: c.id, name: c.name || `分类 ${String(c.id).slice(0, 8)}` }))
        setLocalCategories(catList)
      } catch (err) {
        setLocalCategories([])
      }
    }
  }

  // 需要卡片映射的表
  const TABLES_NEED_CARD_MAP = ['card_status', 'bookmarks', 'wrong_answers']

  async function loadData() {
    if (!meta) return
    setLoading(true)
    try {
      const r = await getCloudTableData(table, 500)
      if (!r.success) throw new Error(r.error || '加载失败')
      let enrichedItems = r.items || []
      if (TABLES_NEED_CARD_MAP.includes(table)) {
        const cardMap = await loadCardMapDirect()
        enrichedItems = enrichedItems.map((item) => ({
          ...item,
          _cardFront: cardMap[item.cardId]?.front || '',
          _cardBack: cardMap[item.cardId]?.back || '',
        }))
      }
      setItems(enrichedItems)
      if (table === 'knowledge_tree') {
        const tree = buildKnowledgeTree(enrichedItems, null)
        setKnowledgeTree(tree)
      }
      await loadLocalIds()
    } catch (err) {
      showToast('加载失败：' + (err.message || '未知错误'), 'error')
      setItems([])
      setKnowledgeTree([])
    } finally {
      setLoading(false)
    }
  }

  // 加载卡片 id→{front, back} 映射（云端+本地合并，互补不漏）
  async function loadCardMapDirect() {
    const map = {}
    // 1. 从云端获取（limit=0 自动分页全部数据）
    try {
      const r = await getCloudTableData('cards', 0)
      if (r.success && r.items) {
        for (const c of r.items) {
          map[c.id] = { front: c.front || '', back: c.back || '' }
        }
      }
    } catch (_) { /* 云端不可用，继续 */ }
    // 2. 从本地补充（云端没有的 cardId 用本地填充）
    try {
      const localCards = await dbInstance.table('cards').toArray()
      for (const c of localCards) {
        if (!map[c.id]) {
          map[c.id] = { front: c.front || '', back: c.back || '' }
        }
      }
    } catch (_) { /* 本地不可用，继续 */ }
    return map
  }

  useEffect(() => {
    if (!state.isLoggedIn || state.user?.local) {
      showToast('请先登录云端账号', 'error')
      navigate(-1)
      return
    }
    loadData()
  }, [table])

  async function handleDownload(item) {
    if (table === 'user_settings') {
      setDownloadingId(item.id)
      try {
        const r = await fetchCloudSettingsStructured(supabase)
        if (!r.success) throw new Error(r.error?.message || '下载失败')
        if (!r.data) {
          showToast('云端暂无保存的设置', 'error')
          return
        }
        const extracted = extractSettingsForApp(r.data)
        const setterMap = {
          apiKey: setApiKey, model: setModel, fontSize: setFontSize,
          eyeProtection: setEyeProtection, speechMode: setSpeechMode,
          speechApiUrl: setSpeechApiUrl, speechApiKey: setSpeechApiKey,
          inputBarMode: setInputBarMode, iflytekAppId: setIflytekAppId,
          iflytekApiSecret: setIflytekApiSecret, aiServiceMode: setAiServiceMode,
          iflytekSparkModel: setIflytekSparkModel, iflytekSparkApiKey: setIflytekSparkApiKey,
          iflytekSparkApiSecret: setIflytekSparkApiSecret, whisperApiUrl: setWhisperApiUrl,
          whisperApiKey: setWhisperApiKey, iflytekIatAppId: setIflytekIatAppId,
          iflytekIatApiKey: setIflytekIatApiKey, iflytekIatApiSecret: setIflytekIatApiSecret,
          volcanoApiKey: setVolcanoApiKey, volcanoModel: setVolcanoModel,
          dashscopeApiKey: setDashscopeApiKey, dashscopeModel: setDashscopeModel,
          ocrAutoGenerate: setOcrAutoGenerate, ocrEngine: setOcrEngine,
          paddleocrServerUrl: setPaddleocrServerUrl, paddleocrLanguage: setPaddleocrLanguage,
          tailscaleAuthKey: setTailscaleAuthKey,
        }
        for (const [k, v] of Object.entries(extracted)) {
          if (setterMap[k]) {
            setterMap[k](v)
          } else if (k === 'pcEngineConfig' && typeof v === 'object') {
            localStorage.setItem('pc_engine_config', JSON.stringify(v))
          } else if (k === 'tailscaleAutoConnect' && typeof v === 'boolean') {
            localStorage.setItem('tailscale_auto_connect', v ? 'true' : 'false')
          }
        }
        showToast('设置下载成功', 'success')
        setLocalIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
      } catch (err) {
        showToast('下载失败：' + (err.message || '未知错误'), 'error')
      } finally {
        setDownloadingId(null)
      }
      return
    }

    if (table === 'user_profiles') {
      setDownloadingId(item.id)
      try {
        const profile = await getUserProfile()
        if (!profile) throw new Error('云端暂无用户资料')
        await setUserProfile(profile)
        showToast('用户资料下载成功', 'success')
        setLocalIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
      } catch (err) {
        showToast('下载失败：' + (err.message || '未知错误'), 'error')
      } finally {
        setDownloadingId(null)
      }
      return
    }

    const localName = LOCAL_TABLE_MAP[table]
    if (!localName) return
    setDownloadingId(item.id)
    try {
      const toLocal = (src) => {
        const result = { ...(src || {}) }
        if (!result.name && result.title) result.name = result.title
        if (!result.id) {
          if (typeof src?.id === 'number') result.id = String(src.id)
        }
        const coerceTs = (key) => {
          if (result[key] == null) return
          if (typeof result[key] === 'number') return
          const t = new Date(result[key]).getTime()
          if (!isNaN(t)) result[key] = t
        }
        coerceTs('createdAt')
        coerceTs('updatedAt')
        if (!result.createdAt) result.createdAt = Date.now()
        return result
      }
      const record = toLocal(item)
      await dbInstance.table(localName).put(record)
      showToast('下载成功', 'success')
      setLocalIds((prev) => (prev.includes(record.id) ? prev : [...prev, record.id]))
    } catch (err) {
      showToast('下载失败：' + (err.message || '未知错误'), 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  // 将本地单条数据上传到云端（用于"云端未更新"筛选场景）
  async function handleUploadToCloud(item) {
    const meta = TABLE_META[table]
    if (!meta) return
    setDownloadingId(item.id)
    try {
      const result = await addCloudRecord(table, item)
      if (!result.success) throw new Error(result.error || '上传失败')
      showToast('上传成功', 'success')
      // 刷新数据
      loadData()
    } catch (err) {
      showToast('上传失败：' + (err.message || '未知错误'), 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleDelete(item) {
    setConfirm({
      open: true, title: '删除记录？', message: '此操作会从云端数据库删除该条记录，无法恢复。',
      danger: true, confirmText: '确认删除',
      onConfirm: async () => {
        setConfirm({ ...confirm, open: false })
        setDeletingId(item.id)
        try {
          const r = await deleteCloudRecord(table, item.id)
          if (!r.success) throw new Error(r.error || '删除失败')
          showToast('已删除', 'success')
          setItems((prev) => prev.filter((x) => x.id !== item.id))
        } catch (err) {
          showToast('删除失败：' + (err.message || '未知错误'), 'error')
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  const getAllDescendants = (node) => {
    const result = [node]
    if (node.children) {
      for (const child of node.children) {
        result.push(...getAllDescendants(child))
      }
    }
    return result
  }

  async function handleDownloadTree(node) {
    const allNodes = getAllDescendants(node)
    setDownloadingId(node.id)
    const now = Date.now()
    try {
      const successes = []
      const failures = []
      for (const n of allNodes) {
        try {
          const record = { ...n }
          const coerceTs = (key) => {
            if (record[key] == null) return
            if (typeof record[key] === 'number') return
            const t = new Date(record[key]).getTime()
            if (!isNaN(t)) record[key] = t
          }
          coerceTs('createdAt')
          coerceTs('updatedAt')
          if (!record.createdAt) record.createdAt = now
          await dbInstance.table('knowledgeTree').put(record)
          successes.push(n.id)
        } catch (_unused) {
          failures.push(n.id)
        }
      }
      showToast(`下载完成：成功 ${successes.length} 条，失败 ${failures.length} 条`, 'success')
      setLocalIds((prev) => {
        const next = new Set(prev)
        successes.forEach(id => next.add(id))
        return Array.from(next)
      })
    } catch (err) {
      showToast('下载失败：' + (err.message || '未知错误'), 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleClearAll() {
    setConfirm({
      open: true, title: '清空云端数据？', message: `将删除云端当前账号下所有「${meta?.name || table}」数据，操作不可撤销。`,
      danger: true, confirmText: '确认清空',
      onConfirm: async () => {
        setConfirm({ ...confirm, open: false })
        setClearingAll(true)
        try {
          const r = await clearCloudTable(table)
          if (!r.success) throw new Error(r.error || '清空失败')
          showToast('已清空云端数据', 'success')
          setItems([])
        } catch (err) {
          showToast('清空失败：' + (err.message || '未知错误'), 'error')
        } finally {
          setClearingAll(false)
        }
      },
    })
  }

  function handleOpenAdd() {
    const fields = FORM_FIELDS[table] || []
    const init = {}
    fields.forEach(f => { init[f.key] = '' })
    if (table === 'card_status') init.status = 'new'
    setAddForm(init)
    setAddError('')
    setAddOpen(true)
  }

  function handleAddClose() {
    setAddOpen(false)
    setAddError('')
  }

  async function handleAddSubmit() {
    const fields = FORM_FIELDS[table] || []
    for (const f of fields) {
      if (f.required) {
        const v = addForm[f.key]
        if (v === undefined || v === null || String(v).trim() === '') {
          setAddError(`请填写${f.label}`)
          return
        }
      }
    }
    const payload = {}
    for (const f of fields) {
      let v = addForm[f.key]
      if (f.type === 'number') {
        const num = Number(v)
        if (!Number.isFinite(num)) { setAddError(`${f.label}必须是有效的数字`); return }
        payload[f.key] = num
      } else {
        payload[f.key] = v
      }
    }

    setAdding(true)
    setAddError('')
    try {
      const r = await addCloudRecord(table, payload)
      if (!r.success) throw new Error(r.error || '添加失败')
      showToast('添加成功', 'success')
      setAddOpen(false)
      loadData()
    } catch (err) {
      setAddError(err.message || '添加失败')
    } finally {
      setAdding(false)
    }
  }

  if (!meta) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: 'var(--color-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-light)', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, minWidth: 36 }} aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>无效数据类型</h2>
        </div>
        <div style={{ padding: 24, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          <p style={{ marginBottom: 16 }}>无效的数据类型：{table}</p>
          <button onClick={() => navigate(-1)} style={{ minHeight: 44, padding: '8px 16px', border: '1px solid var(--color-border-light)', borderRadius: 8, background: 'transparent', color: 'var(--color-text)', cursor: 'pointer' }}>返回</button>
        </div>
      </div>
    )
  }

  const activeFilterChips = buildFilterSummary(activeFilters, localCategories, supportsCategoryFilter)
  // 当"云端未更新"筛选激活时，显示本地有但云端没有的数据
  const cloudItemIds = items.map(i => i.id)
  const isShowingLocal = activeFilters.updatedStatus === 'not-updated'
  
  // 本地卡片数据字段映射：云端用title，本地卡片用front/back，题目用stem
  const localVisibleItems = localFullItems.filter(li => !cloudItemIds.includes(li.id))
  const visibleItems = isShowingLocal
    ? localVisibleItems
    : filterItems(items, activeFilters, localIds, localCategories, supportsCategoryFilter)

  const toDateStr = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const setQuickRange = (days) => {
    const end = toDateStr(new Date())
    const start = toDateStr(new Date(Date.now() - days * 24 * 3600 * 1000))
    setDraftFilters((prev) => ({ ...prev, timeRange: 'custom', startDate: start, endDate: end }))
  }
  const setToday = () => {
    const t = toDateStr(new Date())
    setDraftFilters((prev) => ({ ...prev, timeRange: 'custom', startDate: t, endDate: t }))
  }

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  const levelIcons = {
    category: '📁',
    topic: '📚',
    chapter: '📖',
    unit: '📋',
    knowledge_point: '📍',
    card: '🃏',
  }

  const levelLabels = {
    category: '分类',
    topic: '主题',
    chapter: '章节',
    unit: '单元',
    knowledge_point: '知识点',
    card: '卡片',
  }

  const filterNode = (node) => {
    if (activeFilters.localDownloadStatus === 'local-downloaded' && !localIds.includes(node.id)) {
      return false
    }
    if (activeFilters.localDownloadStatus === 'local-not-downloaded' && localIds.includes(node.id)) {
      return false
    }
    if (activeFilters.downloadStatus === 'downloaded' && !localIds.includes(node.id)) {
      return false
    }
    if (activeFilters.downloadStatus === 'not-downloaded' && localIds.includes(node.id)) {
      return false
    }
    if (activeFilters.timeRange !== 'all' && node.createdAt) {
      const itemTime = (typeof node.createdAt === 'number') ? node.createdAt : new Date(node.createdAt).getTime()
      const now = filterNow
      let keep = false
      if (activeFilters.timeRange === '7d') keep = (now - itemTime) <= 7 * 24 * 3600 * 1000
      if (activeFilters.timeRange === '30d') keep = (now - itemTime) <= 30 * 24 * 3600 * 1000
      if (activeFilters.timeRange === '90d') keep = (now - itemTime) <= 90 * 24 * 3600 * 1000
      if (activeFilters.timeRange === 'custom' && activeFilters.startDate && activeFilters.endDate) {
        const start = new Date(activeFilters.startDate + 'T00:00:00').getTime()
        const end = new Date(activeFilters.endDate + 'T23:59:59').getTime()
        keep = itemTime >= start && itemTime <= end
      }
      if (!keep) return false
    }
    return true
  }

  const hasVisibleChildren = (node) => {
    if (!node.children || node.children.length === 0) return false
    return node.children.some(child => filterNode(child) || hasVisibleChildren(child))
  }

  const renderTreeNode = ({ node, depth = 0 }) => {
    if (!filterNode(node)) {
      if (hasVisibleChildren(node)) {
        return node.children.map(child => renderTreeNode({ node: child, depth }))
      }
      return null
    }

    const isExpanded = expandedIds.has(node.id)
    const hasChildren = node.children && node.children.length > 0 && hasVisibleChildren(node)
    const isDownloaded = localIds.includes(node.id)
    const isDownloading = downloadingId === node.id

    const handleToggleExpand = (e) => {
      e.stopPropagation()
      setExpandedIds(prev => {
        const next = new Set(prev)
        if (next.has(node.id)) {
          next.delete(node.id)
        } else {
          next.add(node.id)
        }
        return next
      })
    }

    return (
      <div key={node.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 12px',
            gap: 8,
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border-light)',
          }}
        >
          <div style={{ width: depth * 16, flexShrink: 0 }} />
          
          <div style={{
            width: 60,
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
            flexShrink: 0,
            padding: '2px 4px',
            borderRadius: 4,
            backgroundColor: isDownloaded ? 'rgba(0, 180, 0, 0.1)' : 'rgba(150, 150, 150, 0.1)',
            color: isDownloaded ? 'var(--color-success)' : 'var(--color-text-muted)',
          }}>
            {isDownloaded ? '已下载' : '未下载'}
          </div>

          {hasChildren && (
            <button
              onClick={handleToggleExpand}
              style={{
                width: 24,
                height: 24,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  color: 'var(--color-text-secondary)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          {!hasChildren && <div style={{ width: 24, flexShrink: 0 }} />}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', wordBreak: 'break-word' }}>
                {node.level === 'card' ? (
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{node.front || '(正面为空)'}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                      ↓ {node.back || '(背面为空)'}
                    </span>
                  </div>
                ) : (
                  node.name || `(${levelLabels[node.level] || '节点'})`
                )}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--color-bg-offset)',
                color: 'var(--color-text-muted)',
                flexShrink: 0,
              }}>
                {levelLabels[node.level] || node.level}
              </span>
            </div>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); handleDownloadTree(node) }}
            disabled={isDownloading || isDownloaded}
            style={{
              padding: '6px 14px',
              minHeight: 32,
              minWidth: 70,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              border: isDownloaded ? '1px solid var(--color-border-light)' : '1px solid var(--color-primary)',
              background: isDownloaded ? 'var(--color-bg)' : 'transparent',
              color: isDownloaded ? 'var(--color-text-muted)' : 'var(--color-primary)',
              cursor: isDownloaded || isDownloading ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {isDownloading ? '…' : (isDownloaded ? '已下载' : '下载')}
          </button>
        </div>

        {isExpanded && hasChildren && (
          <div style={{ borderLeft: '1px solid var(--color-border-light)', marginLeft: '12px' }}>
            {node.children.map(child => renderTreeNode({ node: child, depth: depth + 1 }))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: 'var(--color-bg)', WebkitUserSelect: 'none', userSelect: 'none' }}
      onContextMenu={preventTextMenu}
      
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-light)', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, minWidth: 36 }} aria-label="返回">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--color-text)', flex: 1 }}>云端{meta.name}数据</h2>
        {!meta.noAdd && (
          <button onClick={handleOpenAdd} disabled={clearingAll || deletingId} style={{
            border: '1px solid var(--color-primary)',
            background: 'transparent',
            color: 'var(--color-primary)',
            padding: '6px 12px',
            minHeight: 36,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: (clearingAll || deletingId) ? 'not-allowed' : 'pointer',
            opacity: (clearingAll || deletingId) ? 0.5 : 1,
            marginRight: 8,
          }} aria-label="添加一条数据">＋ 添加</button>
        )}
        <button onClick={handleClearAll} disabled={isShowingLocal || clearingAll || items.length === 0} style={{
          border: '1px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)',
          padding: '6px 12px', minHeight: 36, borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: (isShowingLocal || clearingAll || items.length === 0) ? 'not-allowed' : 'pointer',
          opacity: (isShowingLocal || clearingAll || items.length === 0) ? 0.5 : 1,
        }}>{isShowingLocal ? '（本地视图）' : (clearingAll ? '清空中…' : '清空全部')}</button>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10, paddingLeft: 4 }}>
          共 {isShowingLocal ? localFullItems.length : items.length} 条记录{visibleItems.length !== (isShowingLocal ? localFullItems.length : items.length) ? `（匹配 ${visibleItems.length} 条）` : ''}
          {isShowingLocal && <span style={{ color: 'var(--color-accent)', marginLeft: 8, fontWeight: 600, fontSize: 11 }}>本地独有数据</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0', flexWrap: 'wrap', gap: 6 }}>
          <button
            onClick={() => { setDraftFilters(activeFilters); setFilterOpen((v) => !v) }}
            aria-label="打开筛选面板"
            style={{
              minHeight: 44, minWidth: 80, border: '1px solid var(--color-border-light)',
              color: 'var(--color-text)', borderRadius: 8, fontSize: 13,
              background: 'transparent', cursor: 'pointer', padding: '0 14px',
              fontWeight: 600,
            }}
          >筛选</button>

          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {activeFilterChips.length === 0 ? null : activeFilterChips.map((c) => (
              <span
                key={c.key + c.label}
                style={{
                  background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
                  padding: '4px 8px 4px 10px', fontSize: 12, borderRadius: 999,
                  marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                {c.label}
                <button
                  aria-label="移除该筛选"
                  onClick={() => {
                    if (c.key === 'time') {
                      setActiveFilters((prev) => ({ ...prev, timeRange: 'all', startDate: '', endDate: '' }))
                    } else if (c.key === 'status') {
                      setActiveFilters((prev) => ({ ...prev, updatedStatus: 'all' }))
                    } else if (c.key === 'download') {
                      setActiveFilters((prev) => ({ ...prev, downloadStatus: 'all' }))
                    } else if (c.key === 'local-cat') {
                      setActiveFilters((prev) => ({ ...prev, localCategoryMode: 'all', localCategoryId: 'all' }))
                    } else if (c.key === 'local-download') {
                      setActiveFilters((prev) => ({ ...prev, localDownloadStatus: 'all' }))
                    }
                  }}
                  style={{
                    fontWeight: 700, cursor: 'pointer', paddingLeft: 4,
                    color: 'var(--color-primary-dark)', background: 'transparent',
                    border: 'none', fontSize: 14, lineHeight: 1, minWidth: 24, minHeight: 24,
                  }}
                >×</button>
              </span>
            ))}
          </div>
        </div>

        {filterOpen && (
          <div
            style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border-light)',
              borderRadius: 10, padding: 14, marginBottom: 14, overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--color-text)' }}>筛选条件</div>

            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>创建时间</label>
            <select
              value={draftFilters.timeRange}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, timeRange: e.target.value }))}
              style={{
                minHeight: 36, border: '1px solid var(--color-border-light)',
                borderRadius: 6, padding: '4px 8px', fontSize: 12,
                background: 'var(--color-surface)', color: 'var(--color-text)',
                width: '100%', maxWidth: 240,
              }}
            >
              <option value="all">全部</option>
              <option value="7d">近 7 天</option>
              <option value="30d">近 30 天</option>
              <option value="90d">近 90 天</option>
              <option value="custom">自定义</option>
            </select>

            {draftFilters.timeRange === 'custom' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={draftFilters.startDate}
                    onChange={(e) => setDraftFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                    aria-label="开始日期"
                    style={{ minHeight: 36, border: '1px solid var(--color-border-light)', borderRadius: 6, padding: '4px 8px', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  />
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>~</span>
                  <input
                    type="date"
                    value={draftFilters.endDate}
                    onChange={(e) => setDraftFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                    aria-label="结束日期"
                    style={{ minHeight: 36, border: '1px solid var(--color-border-light)', borderRadius: 6, padding: '4px 8px', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={setToday} aria-label="今天" style={{
                    border: '1px solid var(--color-border-light)', padding: '4px 10px', fontSize: 12,
                    cursor: 'pointer', background: 'transparent', color: 'var(--color-text)',
                    borderRadius: 999,
                  }}>今天</button>
                  <button onClick={() => setQuickRange(7)} aria-label="近一周" style={{
                    border: '1px solid var(--color-border-light)', padding: '4px 10px', fontSize: 12,
                    cursor: 'pointer', background: 'transparent', color: 'var(--color-text)',
                    borderRadius: 999,
                  }}>近一周</button>
                  <button onClick={() => setQuickRange(30)} aria-label="近一月" style={{
                    border: '1px solid var(--color-border-light)', padding: '4px 10px', fontSize: 12,
                    cursor: 'pointer', background: 'transparent', color: 'var(--color-text)',
                    borderRadius: 999,
                  }}>近一月</button>
                </div>
              </div>
            )}

            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, marginTop: 12 }}>更新状态</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { value: 'all',         label: '全部' },
                { value: 'updated',     label: '已有云端数据' },
                { value: 'not-updated', label: '云端未更新' },
              ].map((opt) => {
                const selected = draftFilters.updatedStatus === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      // 立即同步到 activeFilters 让筛选实时生效（不依赖草稿/应用按钮）
                      setDraftFilters((prev) => ({ ...prev, updatedStatus: opt.value }))
                      setActiveFilters((prev) => ({ ...prev, updatedStatus: opt.value }))
                    }}
                    aria-label={`更新状态 ${opt.label}`}
                    style={{
                      border: '1px solid ' + (selected ? 'var(--color-primary)' : 'var(--color-border-light)'),
                      background: selected ? 'var(--color-primary)' : 'transparent',
                      color: selected ? '#fff' : 'var(--color-text)',
                      padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                      borderRadius: 999, fontWeight: 600, minHeight: 32,
                    }}
                  >{opt.label}</button>
                )
              })}
            </div>

            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, marginTop: 12 }}>下载状态</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { value: 'all',            label: '全部' },
                { value: 'downloaded',     label: '已下载' },
                { value: 'not-downloaded', label: '未下载' },
              ].map((opt) => {
                const selected = draftFilters.downloadStatus === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDraftFilters((prev) => ({ ...prev, downloadStatus: opt.value }))}
                    aria-label={`下载状态 ${opt.label}`}
                    style={{
                      border: '1px solid ' + (selected ? 'var(--color-primary)' : 'var(--color-border-light)'),
                      background: selected ? 'var(--color-primary)' : 'transparent',
                      color: selected ? '#fff' : 'var(--color-text)',
                      padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                      borderRadius: 999, fontWeight: 600, minHeight: 32,
                    }}
                  >{opt.label}</button>
                )
              })}
            </div>

            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, marginTop: 12 }}>本地情况</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { value: 'all',                     label: '全部' },
                { value: 'local-downloaded',         label: '本地已下载' },
                { value: 'local-not-downloaded',     label: '本地未下载' },
              ].map((opt) => {
                const selected = draftFilters.localDownloadStatus === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDraftFilters((prev) => ({ ...prev, localDownloadStatus: opt.value }))}
                    aria-label={`本地情况 ${opt.label}`}
                    style={{
                      border: '1px solid ' + (selected ? 'var(--color-accent)' : 'var(--color-border-light)'),
                      background: selected ? 'var(--color-accent)' : 'transparent',
                      color: selected ? '#fff' : 'var(--color-accent)',
                      padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                      borderRadius: 999, fontWeight: 600, minHeight: 32,
                    }}
                  >{opt.label}</button>
                )
              })}
            </div>

            {supportsCategoryFilter && (
              <>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, marginTop: 12 }}>
                  按本地分类筛选
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: 6 }}>
                    （本地有 {localCategories.length} 个分类）
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { value: 'all',       label: '全部' },
                    { value: 'local-has', label: '本地已有分类' },
                    { value: 'local-none',label: '本地未有分类' },
                    { value: 'by-id',     label: '按具体分类' },
                  ].map((opt) => {
                    const selected = draftFilters.localCategoryMode === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setDraftFilters((prev) => ({ ...prev, localCategoryMode: opt.value, localCategoryId: 'all' }))}
                        aria-label={`按本地分类 ${opt.label}`}
                        style={{
                          border: '1px solid ' + (selected ? 'var(--color-primary)' : 'var(--color-border-light)'),
                          background: selected ? 'var(--color-primary)' : 'transparent',
                          color: selected ? '#fff' : 'var(--color-text)',
                          padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                          borderRadius: 999, fontWeight: 600, minHeight: 32,
                        }}
                      >{opt.label}</button>
                    )
                  })}
                </div>
                {draftFilters.localCategoryMode === 'by-id' && (
                  <div style={{ marginTop: 8 }}>
                    <select
                      value={draftFilters.localCategoryId || 'all'}
                      onChange={(e) => setDraftFilters((prev) => ({ ...prev, localCategoryId: e.target.value }))}
                      style={{
                        minHeight: 36, border: '1px solid var(--color-border-light)',
                        borderRadius: 6, padding: '4px 8px', fontSize: 12,
                        background: 'var(--color-surface)', color: 'var(--color-text)',
                        width: '100%', maxWidth: 280,
                      }}
                    >
                      <option value="all">请选择分类</option>
                      {localCategories.length === 0 && (
                        <option value="__empty__" disabled>（本地暂无分类）</option>
                      )}
                      {localCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <button
                onClick={() => setDraftFilters({
                  timeRange: 'all', startDate: '', endDate: '',
                  updatedStatus: 'all', downloadStatus: 'all',
                  localCategoryMode: 'all', localCategoryId: 'all',
                  localDownloadStatus: 'all',
                })}
                style={{
                  minHeight: 40, padding: '0 16px', border: '1px solid var(--color-border-light)',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  borderRadius: 8, fontSize: 13, cursor: 'pointer',
                }}
              >重置</button>
              <button
                onClick={() => { setActiveFilters({ ...draftFilters }); setFilterNow(Date.now()); setFilterOpen(false) }}
                style={{
                  minHeight: 40, padding: '0 20px', border: 'none',
                  background: 'var(--color-primary)', color: '#fff',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >应用</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 13 }}>加载中…</div>
        ) : (isShowingLocal && localFullItems.length === 0) ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)', fontSize: 14 }}>本地暂无数据</div>
        ) : (!isShowingLocal && items.length === 0) ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)', fontSize: 14 }}>云端暂无数据</div>
        ) : visibleItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)', fontSize: 14 }}>
            <div style={{ marginBottom: 14 }}>{isShowingLocal ? '所有本地数据已同步到云端' : '未找到匹配的数据，试试调整筛选条件'}</div>
            <button
              onClick={() => setActiveFilters({
                timeRange: 'all', startDate: '', endDate: '',
                updatedStatus: 'all', downloadStatus: 'all',
                localCategoryMode: 'all', localCategoryId: 'all',
                localDownloadStatus: 'all',
              })}
              style={{
                minHeight: 40, padding: '0 20px', border: '1px solid var(--color-border-light)',
                background: 'transparent', color: 'var(--color-text)',
                borderRadius: 8, fontSize: 13, cursor: 'pointer',
              }}
            >重置筛选</button>
          </div>
        ) : table === 'knowledge_tree' ? (
          <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-border-light)', overflow: 'hidden', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {knowledgeTree.map(node => renderTreeNode({ node, depth: 0 }))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleItems.map((item) => {
              const isFlipped = flippedId === item.id
              const toggleFlip = () => setFlippedId(isFlipped ? null : item.id)
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-label={isFlipped ? `${meta.name}详情，点击返回` : `${meta.name}数据，点击查看详情`}
                  onClick={toggleFlip}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleFlip()
                    }
                  }}
                  style={{
                    position: 'relative',
                    perspective: '1000px',
                    minHeight: '72px',
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 10,
                    border: '1px solid var(--color-border-light)',
                    marginBottom: '10px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      transformStyle: 'preserve-3d',
                      transition: 'transform 450ms cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}
                  >
                    <div style={{
                      padding: 12,
                      backfaceVisibility: 'hidden',
                      minHeight: '72px',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      overflowY: 'auto',
                      maxHeight: '300px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>#{item.id}</span>
                          {isShowingLocal ? (
                            <span style={{
                              display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 6px',
                              borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#d97706',
                              lineHeight: 1.5, whiteSpace: 'nowrap',
                            }}>本地独有</span>
                          ) : localIds.includes(item.id) ? (
                            <span style={{
                              display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 6px',
                              borderRadius: 999, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                              lineHeight: 1.5, whiteSpace: 'nowrap',
                            }}>已下载</span>
                          ) : (
                            <span style={{
                              display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 6px',
                              borderRadius: 999, background: 'rgba(156,163,175,0.15)', color: '#9ca3af',
                              lineHeight: 1.5, whiteSpace: 'nowrap',
                            }}>未下载</span>
                          )}
                        </div>
                        {meta.business.map((f) => {
                          if (f === 'settings') return renderSettingsGroupCards(item[f], item.id)
                          const isCardIdField = (f === 'cardId')
                          const fieldValue = renderFieldValue(item, f)
                          return (
                            <div key={f}>
                              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)', wordBreak: 'break-all' }}>
                                <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginRight: 6, fontSize: 12 }}>{f}:</span>
                                <span>{fieldValue}</span>
                              </div>
                              {isCardIdField && (
                                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {item._cardFront ? (
                                    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-primary-dark)', backgroundColor: 'var(--color-primary-light)', padding: '6px 10px', borderRadius: 6, wordBreak: 'break-word' }}>
                                      <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, marginRight: 4 }}>问题</span>
                                      {item._cardFront}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                      未找到对应卡片
                                    </div>
                                  )}
                                  {item._cardBack && (
                                    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-success-dark)', backgroundColor: 'var(--color-success-light)', padding: '6px 10px', borderRadius: 6, wordBreak: 'break-word' }}>
                                      <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, marginRight: 4 }}>答案</span>
                                      {item._cardBack}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, position: 'relative', zIndex: 10, pointerEvents: 'auto' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); isShowingLocal ? handleUploadToCloud(item) : handleDownload(item) }}
                          disabled={meta.noUpload || downloadingId === item.id}
                          style={{
                            background: isShowingLocal ? 'var(--color-primary)' : 'transparent',
                            border: '1px solid var(--color-primary)',
                            color: isShowingLocal ? '#fff' : 'var(--color-primary)',
                            padding: '6px 10px',
                            minHeight: 36,
                            minWidth: 80,
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: (meta.noUpload || downloadingId === item.id) ? 'not-allowed' : 'pointer',
                            flexShrink: 0,
                            position: 'relative',
                            zIndex: 10,
                            pointerEvents: 'auto',
                          }}
                        >{downloadingId === item.id ? '…' : (isShowingLocal ? (meta.noUpload ? '不可上传' : '上传到云端') : '下载到本地')}</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
                          disabled={deletingId === item.id}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--color-danger)',
                            color: 'var(--color-danger)',
                            padding: '6px 10px',
                            minHeight: 36,
                            minWidth: 80,
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: deletingId === item.id ? 'not-allowed' : 'pointer',
                            flexShrink: 0,
                            position: 'relative',
                            zIndex: 10,
                            pointerEvents: 'auto',
                          }}
                        >{deletingId === item.id ? '…' : '删除'}</button>
                      </div>
                    </div>
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      padding: 12,
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: 10,
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      overflowY: 'auto',
                      maxHeight: '300px',
                    }}>
                      {meta.meta.map((f) => (
                        <div key={f} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)', wordBreak: 'break-all', whiteSpace: 'normal' }}>
                          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginRight: 6, fontSize: 12 }}>{f}:</span>
                          <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{renderFieldValue(item, f)}</span>
                        </div>
                      ))}
                      <div style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, flexShrink: 0 }}>点击卡片返回</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      <ConfirmDialog open={confirm.open} title={confirm.title} message={confirm.message} danger={confirm.danger} confirmText={confirm.confirmText || '确定'} onCancel={() => setConfirm({ ...confirm, open: false })} onConfirm={() => confirm.onConfirm && confirm.onConfirm()} />
      {addOpen && (
        <div onClick={handleAddClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'var(--color-text)' }}>添加{TABLE_META[table]?.name || table}数据</h3>

            {(FORM_FIELDS[table] || []).map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{f.label}{f.required && <span style={{ color: 'var(--color-danger)', marginLeft: 2 }}>*</span>}</span>
                </div>
                {f.type === 'textarea' ? (
                  <textarea
                    value={addForm[f.key] || ''}
                    onChange={(e) => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    rows={3}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border-light)', borderRadius: 8, fontSize: 13, background: 'transparent', color: 'var(--color-text)', resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
                  />
                ) : f.type === 'select' ? (
                  <select
                    value={addForm[f.key] || ''}
                    onChange={(e) => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border-light)', borderRadius: 8, fontSize: 13, background: 'transparent', color: 'var(--color-text)', minHeight: 36 }}
                  >
                    {(f.options || []).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={addForm[f.key] || ''}
                    onChange={(e) => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border-light)', borderRadius: 8, fontSize: 13, background: 'transparent', color: 'var(--color-text)', minHeight: 36 }}
                  />
                )}
              </div>
            ))}

            {addError && (
              <div style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 4, marginBottom: 10, lineHeight: 1.5 }}>{addError}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button onClick={handleAddClose} disabled={adding} style={{ flex: 1, minHeight: 44, border: '1px solid var(--color-border-light)', background: 'transparent', color: 'var(--color-text-secondary)', borderRadius: 8, fontSize: 13, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.5 : 1 }}>取消</button>
              <button onClick={handleAddSubmit} disabled={adding} style={{ flex: 1, minHeight: 44, border: 'none', background: 'var(--color-primary)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.55 : 1 }}>{adding ? '添加中…' : '确认添加'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
