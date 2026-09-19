import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase, getEffectiveConfig } from '../services/cloudbase'
import { Capacitor } from '@capacitor/core'
import { Http } from '@capacitor/http'
import {
  DEEPSEEK_API_URL,
  IFLYTEK_SPARK_API_URL,
  VOLCANO_ENGINE_API_URL,
  DASHSCOPE_API_URL,
} from '../utils/constants'

/**
 * 管理员面板 - 整合分类逻辑测试和 SQL 调整
 * 仅对 2114279975@qq.com 用户开放
 * 路由: /admin
 */
// ===== 通用 UI 工具（提供一致的样式系统） =====

// 通用样式容器：主题背景（采用 flex 布局，确保可滚动）
const panelRootStyle = {
  padding: '20px 16px 40px',
  maxWidth: 1200,
  margin: '0 auto',
  minHeight: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  boxSizing: 'border-box',
}

// 优雅的按钮样式
function renderActionButton(text, onClick, opts = {}) {
  const {
    variant = 'primary',  // 'primary' | 'secondary' | 'danger' | 'ghost'
    disabled = false,
    fullWidth = false,
    minHeight = 44,
    fontSize = 14,
  } = opts

  let bg = 'var(--primary)'
  let color = 'white'
  let border = 'none'

  if (variant === 'secondary') {
    bg = 'var(--surface-100)'
    color = 'var(--text)'
    border = '1px solid var(--border-light)'
  } else if (variant === 'danger') {
    bg = 'var(--danger-light)'
    color = 'var(--danger)'
    border = 'none'
  } else if (variant === 'ghost') {
    bg = 'transparent'
    color = 'var(--text-secondary)'
    border = '1px solid var(--border-light)'
  }

  const actualBg = disabled ? 'var(--border-light)' : bg
  const actualColor = disabled ? 'var(--text-muted)' : color
  const cursor = disabled ? 'not-allowed' : 'pointer'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight,
        padding: '10px 18px',
        fontSize,
        fontWeight: 600,
        background: actualBg,
        color: actualColor,
        border,
        borderRadius: 10,
        cursor,
        transition: 'all 0.2s ease',
        flex: fullWidth ? '1' : undefined,
        minWidth: fullWidth ? undefined : '100px',
        whiteSpace: 'nowrap',
        WebkitTapHighlightColor: 'transparent',
        ...(disabled ? { opacity: 0.6 } : {}),
      }}
    >
      {text}
    </button>
  )
}

// Tab 按钮渲染
function renderTabButton({ key, label, icon, active, onClick }) {
  return (
    <button
      key={key}
      onClick={onClick}
      style={{
        flex: '1 1 auto',
        minWidth: '120px',
        padding: '12px 14px',
        fontSize: 13,
        fontWeight: 600,
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? 'white' : 'var(--text-secondary)',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        minHeight: 44,
        whiteSpace: 'nowrap',
        WebkitTapHighlightColor: 'transparent',
        ...(active ? {
          boxShadow: '0 2px 8px rgba(var(--primary-rgb, 79, 70, 229), 0.2)',
        } : {}),
      }}
    >
      {icon} {label}
    </button>
  )
}

export default function AdminPanel() {
  const { state } = useApp()
  const [activeTab, setActiveTab] = useState('sql')

  // 检查管理员权限
  const isAdminEmail = state.user && state.user.email &&
    state.user.email.toLowerCase() === '2114279975@qq.com'

  if (!isAdminEmail) {
    return (
      <div style={{
        padding: '80px 24px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: 56, marginBottom: 24 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          权限不足
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 300 }}>
          此页面仅对管理员开放
        </div>
      </div>
    )
  }

  const tabs = [
    { key: 'sql', label: 'SQL 调整', icon: '🗄️' },
    { key: 'network', label: '网络测试', icon: '🌐' },
  ]

  return (
    <div style={panelRootStyle}>
      {/* 头部信息（固定，不参与滚动） */}
      <div style={{ flex: '0 0 auto', marginBottom: 20 }}>
        <div style={{
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--text)',
          marginBottom: 6,
          letterSpacing: '-0.5px',
        }}>
          🛠 管理员面板
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 3,
            background: 'var(--success)',
            marginRight: 4,
          }} />
          当前账号: {state.user?.email}
        </div>
      </div>

      {/* Tab 切换（固定，不参与滚动） */}
      <div style={{
        flex: '0 0 auto',
        display: 'flex',
        gap: 6,
        marginBottom: 20,
        padding: 6,
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border-light)',
        flexWrap: 'wrap',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {tabs.map(tab => renderTabButton({
          key: tab.key,
          label: tab.label,
          icon: tab.icon,
          active: activeTab === tab.key,
          onClick: () => setActiveTab(tab.key),
        }))}
      </div>

      {/* 内容区（可滚动，minHeight: 0 允许缩小） */}
      <div style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {activeTab === 'sql' ? <SqlPanel /> : <NetworkTestPanel />}
      </div>
    </div>
  )
}

// ===== SQL 调整面板 =====
const SQL_STORAGE_KEY = 'sql_tool_config_v2'

const SQL_TEMPLATES = [
  {
    key: 'fix_name_columns',
    label: '🔧 修复字段：补 units/chapters/topics 的 name 列',
    desc: '解决前端读取 .name 失败的问题（以 title 填充）',
    sql: `-- 为 units/chapters/topics 表补 name 字段（以 title 内容填充）
ALTER TABLE units ADD COLUMN IF NOT EXISTS name text;
UPDATE units SET name = title WHERE name IS NULL;

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS name text;
UPDATE chapters SET name = title WHERE name IS NULL;

ALTER TABLE topics ADD COLUMN IF NOT EXISTS name text;
UPDATE topics SET name = title WHERE name IS NULL;

SELECT 'units' AS tbl, count(*) AS rows, count(name) AS with_name FROM units
UNION ALL
SELECT 'chapters' AS tbl, count(*) AS rows, count(name) AS with_name FROM chapters
UNION ALL
SELECT 'topics' AS tbl, count(*) AS rows, count(name) AS with_name FROM topics;`
  },
  {
    key: 'check_table_list',
    label: '📋 检查所有表及 RLS 状态',
    desc: '验证 15 张核心表是否都已创建并启用行级安全',
    sql: `SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;`
  },
  {
    key: 'check_policies',
    label: '🔒 检查 RLS 策略列表',
    desc: '查看已创建的所有行级安全策略',
    sql: `SELECT c.relname AS tablename,
       p.polname AS policy_name,
       CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' ELSE p.polcmd::text END AS cmd,
       CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS permissive,
       array_to_string(p.polroles, ', ') AS roles
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY c.relname, p.polname;`
  },
  {
    key: 'check_columns',
    label: '📐 检查每个表的字段结构',
    desc: '查看所有表的字段、类型、是否可为空',
    sql: `SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;`
  },
  {
    key: 'count_all',
    label: '📊 各表行数统计',
    desc: '粗略估算每张表的记录数',
    sql: `SELECT relname AS table_name, reltuples::bigint AS approx_rows
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;`
  },
  {
    key: 'check_v311_upgrade',
    label: '✅ v3.11 升级检查',
    desc: '验证 test_questions.pending_review / reviewed_at 与 link_generation_runs 是否存在',
    sql: `-- 1) 确认 test_questions 新字段
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'test_questions' AND column_name IN ('pending_review', 'reviewed_at')
ORDER BY column_name;

-- 2) 确认 link_generation_runs 表字段
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'link_generation_runs'
ORDER BY ordinal_position;

-- 3) link_generation_runs 的 RLS 策略
SELECT c.relname AS tablename,
       p.polname AS policy_name,
       CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' ELSE p.polcmd::text END AS cmd
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
WHERE c.relname = 'link_generation_runs'
ORDER BY p.polname;`
  },
  {
    key: 'pending_review_stats',
    label: '⚠️ 待审核题目统计',
    desc: '当前分类下 pending_review=true 的联结题目数量与状态',
    sql: `-- 待审核题目概览
SELECT category_id,
       count(*)                                                   AS total,
       count(*) FILTER (WHERE pending_review IS TRUE)             AS pending,
       count(*) FILTER (WHERE pending_review IS NOT TRUE)         AS reviewed,
       round(100.0 * count(*) FILTER (WHERE pending_review IS TRUE) / count(*), 1) AS pending_pct
FROM test_questions
WHERE test_type = 'link_test'
GROUP BY category_id
ORDER BY pending DESC;

-- 最近 10 条待审核题目
SELECT id, category_id, type, difficulty, knowledge_point, created_at
FROM test_questions
WHERE test_type = 'link_test' AND pending_review IS TRUE
ORDER BY created_at DESC
LIMIT 10;`
  },
  {
    key: 'link_generation_history',
    label: '📜 联结出题历史',
    desc: '展示最近每分类的生成批次、生成题目数、目标题数',
    sql: `-- 每分类概览（以分类维度统计）
SELECT category_id,
       count(*)                                     AS runs,
       coalesce(sum(generated_count), 0)            AS total_generated,
       coalesce(sum(total_target), 0)               AS total_target,
       max(created_at)                              AS last_run_at
FROM link_generation_runs
GROUP BY category_id
ORDER BY last_run_at DESC
LIMIT 20;

-- 最近 20 次生成运行
SELECT id,
       category_id,
       mode,
       link_strength,
       difficulty,
       target_per_cell,
       generated_count,
       total_target,
       batch_count,
       knowledge_point_count,
       created_at
FROM link_generation_runs
ORDER BY created_at DESC
LIMIT 20;

-- 有错误的批次
SELECT id, category_id, mode, created_at, error_message
FROM link_generation_runs
WHERE error_message IS NOT NULL AND length(trim(error_message)) > 0
ORDER BY created_at DESC
LIMIT 20;`
  },
  {
    key: 'apply_v311_increment',
    label: '🚀 v3.11 增量升级（幂等，可反复执行）',
    desc: '一键补全 pending_review / reviewed_at 与 link_generation_runs 表；如果你已经运行过则不会重复添加',
    sql: `-- =====================================================================
-- v3.11 数据库增量升级
-- 适用：已有 v3.10 基础表
-- 幂等：多次执行安全（ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS）
-- =====================================================================

-- 1) test_questions 新增列：待审核标记与审核时间
ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS pending_review BOOLEAN DEFAULT FALSE;
ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- 2) 联结出题历史表
CREATE TABLE IF NOT EXISTS link_generation_runs (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  mode TEXT,
  link_strength TEXT,
  difficulty INTEGER,
  target_per_cell INTEGER,
  unit_ids TEXT,
  chapter_ids TEXT,
  knowledge_point_count INTEGER,
  batch_count INTEGER,
  generated_count INTEGER,
  total_target INTEGER,
  distribution_by_type TEXT,
  distribution_by_difficulty TEXT,
  question_ids TEXT,
  error_message TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) 索引
CREATE INDEX IF NOT EXISTS idx_test_questions_category_id ON test_questions(category_id);
CREATE INDEX IF NOT EXISTS idx_test_questions_pending_review ON test_questions(pending_review);
CREATE INDEX IF NOT EXISTS idx_link_generation_runs_category_id ON link_generation_runs(category_id);
CREATE INDEX IF NOT EXISTS idx_link_generation_runs_created_at ON link_generation_runs(created_at);

-- 4) RLS 行级安全
ALTER TABLE link_generation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS link_generation_runs_select ON link_generation_runs;
DROP POLICY IF EXISTS link_generation_runs_insert ON link_generation_runs;
DROP POLICY IF EXISTS link_generation_runs_update ON link_generation_runs;
DROP POLICY IF EXISTS link_generation_runs_delete ON link_generation_runs;
CREATE POLICY link_generation_runs_select ON link_generation_runs FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY link_generation_runs_insert ON link_generation_runs FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY link_generation_runs_update ON link_generation_runs FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY link_generation_runs_delete ON link_generation_runs FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 5) 最终检查（确认字段存在）
SELECT 'test_questions.pending_review ok' AS check_name, exists(SELECT 1 FROM information_schema.columns WHERE table_name = 'test_questions' AND column_name = 'pending_review') AS ok
UNION ALL
SELECT 'test_questions.reviewed_at ok' AS check_name, exists(SELECT 1 FROM information_schema.columns WHERE table_name = 'test_questions' AND column_name = 'reviewed_at') AS ok
UNION ALL
SELECT 'link_generation_runs ok' AS check_name, exists(SELECT 1 FROM information_schema.tables WHERE table_name = 'link_generation_runs') AS ok;`
  },
  {
    key: 'clear_current_user_data',
    label: '🗑️ 清空当前用户云端数据（危险）',
    desc: '按依赖顺序删除当前登录用户的所有云端数据，{USER_ID}将自动替换',
    sql: `-- 清空当前用户的所有云端数据（按依赖顺序删除）
-- {USER_ID} 将在点击时自动替换为当前登录用户ID
-- 警告：此操作不可恢复，请谨慎执行！

-- 1. 删除卡片相关数据（先删子表）
DELETE FROM card_status WHERE user_id = '{USER_ID}';
DELETE FROM bookmarks WHERE user_id = '{USER_ID}';
DELETE FROM wrong_answers WHERE user_id = '{USER_ID}';
DELETE FROM review_history WHERE user_id = '{USER_ID}';
DELETE FROM test_records WHERE user_id = '{USER_ID}';
DELETE FROM test_questions WHERE user_id = '{USER_ID}';
DELETE FROM test_sessions WHERE user_id = '{USER_ID}';
DELETE FROM study_plans WHERE user_id = '{USER_ID}';
DELETE FROM link_generation_runs WHERE user_id = '{USER_ID}';
DELETE FROM cards WHERE user_id = '{USER_ID}';

-- 2. 删除结构数据
DELETE FROM units WHERE user_id = '{USER_ID}';
DELETE FROM chapters WHERE user_id = '{USER_ID}';
DELETE FROM topics WHERE user_id = '{USER_ID}';
DELETE FROM categories WHERE user_id = '{USER_ID}';

-- 3. 删除用户数据
DELETE FROM user_profiles WHERE user_id = '{USER_ID}';
DELETE FROM user_settings WHERE user_id = '{USER_ID}';

-- 4. 验证删除结果（所有表剩余数应为0）
SELECT 'card_status' AS tbl, count(*) AS remaining FROM card_status WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'bookmarks', count(*) FROM bookmarks WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'wrong_answers', count(*) FROM wrong_answers WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'review_history', count(*) FROM review_history WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'test_records', count(*) FROM test_records WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'test_questions', count(*) FROM test_questions WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'test_sessions', count(*) FROM test_sessions WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'study_plans', count(*) FROM study_plans WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'link_generation_runs', count(*) FROM link_generation_runs WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'cards', count(*) FROM cards WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'units', count(*) FROM units WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'chapters', count(*) FROM chapters WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'topics', count(*) FROM topics WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'categories', count(*) FROM categories WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'user_profiles', count(*) FROM user_profiles WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'user_settings', count(*) FROM user_settings WHERE user_id = '{USER_ID}';`
  },
]

const TABLE_PRESETS = [
  { key: 'categories', label: '📂 分类表', desc: 'categories' },
  { key: 'topics', label: '📝 主题表', desc: 'topics' },
  { key: 'chapters', label: '📖 章节表', desc: 'chapters' },
  { key: 'units', label: '🧩 单元表', desc: 'units' },
  { key: 'cards', label: '💳 卡片表', desc: 'cards（最多200条）' },
  { key: 'card_status', label: '🎯 卡片状态', desc: 'card_status（最多200条）' },
  { key: 'wrong_answers', label: '❌ 错题', desc: 'wrong_answers（最多200条）' },
  { key: 'test_questions', label: '❓ 测试题', desc: 'test_questions（最多200条，含 pending_review）' },
  { key: 'user_profiles', label: '👤 用户资料', desc: 'user_profiles' },
  { key: 'user_settings', label: '⚙️ 用户设置', desc: 'user_settings' },
  { key: 'review_history', label: '📜 复习历史', desc: 'review_history（最多200条）' },
  { key: 'study_plans', label: '📚 学习计划', desc: 'study_plans' },
  { key: 'link_generation_runs', label: '🧪 联结出题历史', desc: 'link_generation_runs（最多200条）' },
]

const TABLE_LIMIT = 200

function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div style={{
        padding: 20,
        fontSize: 13,
        color: 'var(--text-muted)',
        fontStyle: 'italic',
        textAlign: 'center',
        background: 'var(--surface-100)',
        borderRadius: 8,
        border: '1px dashed var(--border-light)',
      }}>
        📭 （结果为空）
      </div>
    )
  }
  const keys = Object.keys(rows[0])
  return (
    <div style={{
      overflowX: 'auto',
      margin: '10px 0',
      borderRadius: 10,
      border: '1px solid var(--border-light)',
      background: 'var(--surface-100)',
      WebkitOverflowScrolling: 'touch',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{
            background: 'var(--surface)',
            borderBottom: '2px solid var(--border-light)',
          }}>
            {keys.map(k => (
              <th key={k} style={{
                padding: '10px 14px',
                textAlign: 'left',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                fontSize: 11.5,
                textTransform: 'none',
                letterSpacing: 0,
                whiteSpace: 'nowrap',
                borderBottom: '1px solid var(--border-light)',
              }}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{
              borderBottom: '1px solid var(--border-light)',
              background: idx % 2 === 0 ? 'var(--surface-100)' : 'var(--surface)',
              transition: 'background 0.15s ease',
            }}>
              {keys.map(k => (
                <td key={k} style={{
                  padding: '10px 14px',
                  verticalAlign: 'top',
                  color: 'var(--text)',
                  fontFamily: k && k.includes('json') || k.includes('text') || k.includes('body') || k.includes('content')
                    ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                    : 'inherit',
                  lineHeight: 1.5,
                }}>
                  {row[k] === null || row[k] === undefined
                    ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 11.5 }}>null</span>
                    : String(row[k]).length > 300
                      ? <span style={{ color: 'var(--text-secondary)' }}>{String(row[k]).slice(0, 300)}...</span>
                      : String(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SqlPanel() {
  const config = getEffectiveConfig()
  const [results, setResults] = useState([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [advancedKey, setAdvancedKey] = useState('')
  const [advancedRole, setAdvancedRole] = useState('cloudbase_postgres')
  const [advancedSql, setAdvancedSql] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SQL_STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (parsed.advancedKey) setAdvancedKey(parsed.advancedKey)
      if (parsed.advancedRole) setAdvancedRole(parsed.advancedRole)
      if (parsed.advancedSql) setAdvancedSql(parsed.advancedSql)
    } catch (e) { /* ignore */ }
  }, [])

  // 获取当前登录用户ID（用于清空云端数据模板）
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sessionRes = await supabase.auth.getSession()
        const user = sessionRes?.data?.session?.user
        if (mounted && user) setCurrentUserId(user.id)
      } catch (e) { /* ignore */ }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SQL_STORAGE_KEY, JSON.stringify({ advancedKey, advancedRole, advancedSql }))
    } catch (e) { /* ignore */ }
  }, [advancedKey, advancedRole, advancedSql])

  const queryTable = async (tableName) => {
    setIsExecuting(true)
    const start = Date.now()
    try {
      const sessionRes = await supabase.auth.getSession()
      const user = sessionRes?.data?.session?.user
      if (!user) {
        const elapsed = Date.now() - start
        setResults(prev => [{
          label: `查询 ${tableName}`,
          success: false,
          elapsed,
          error: '请先登录云端账号后再查询',
          statement: `SELECT * FROM ${tableName} LIMIT ${TABLE_LIMIT};`
        }, ...prev].slice(0, 20))
        return
      }

      const tablesWithCreatedAt = [
        'categories', 'topics', 'chapters', 'units', 'cards', 'card_status',
        'wrong_answers', 'test_questions', 'test_records', 'test_sessions',
        'review_history', 'study_plans', 'user_profiles', 'user_settings',
        'link_generation_runs'
      ]
      let query = supabase.from(tableName).select('*')
        .eq('user_id', user.id)
      if (tablesWithCreatedAt.includes(tableName)) {
        query = query.order('created_at', { ascending: false })
      }
      query = query.limit(TABLE_LIMIT)
      const res = await query
      const data = Array.isArray(res) ? res : (res?.data || [])
      const elapsed = Date.now() - start
      setResults(prev => [{
        label: `查询 ${tableName}`,
        success: true,
        elapsed,
        rowCount: data.length,
        data,
        statement: `SELECT * FROM ${tableName} WHERE user_id='${user.id}' LIMIT ${TABLE_LIMIT};`
      }, ...prev].slice(0, 20))
    } catch (err) {
      const elapsed = Date.now() - start
      const msg = err?.message || String(err)
      setResults(prev => [{
        label: `查询 ${tableName}`,
        success: false,
        elapsed,
        error: msg,
        statement: `SELECT * FROM ${tableName} LIMIT ${TABLE_LIMIT};`
      }, ...prev].slice(0, 20))
    } finally {
      setIsExecuting(false)
    }
  }

  const splitSqlStatements = (sql) => {
    const statements = []
    let current = ''
    let inSingleQuote = false
    let inDoubleQuote = false
    let inLineComment = false
    let inBlockComment = false
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i]
      const next = sql[i + 1]
      if (inLineComment) {
        current += ch
        if (ch === '\n') inLineComment = false
        continue
      }
      if (inBlockComment) {
        current += ch
        if (ch === '*' && next === '/') {
          inBlockComment = false
          current += next
          i++
        }
        continue
      }
      if (!inSingleQuote && !inDoubleQuote && ch === '-' && next === '-') {
        inLineComment = true
        current += ch
        continue
      }
      if (!inSingleQuote && !inDoubleQuote && ch === '/' && next === '*') {
        inBlockComment = true
        current += ch
        continue
      }
      if (ch === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote
        current += ch
        continue
      }
      if (ch === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote
        current += ch
        continue
      }
      if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
        current += ch
        const trimmed = current.trim()
        if (trimmed.length > 0 && trimmed !== ';') statements.push(current)
        current = ''
        continue
      }
      current += ch
    }
    const trimmed = current.trim()
    if (trimmed.length > 0 && trimmed !== ';') statements.push(current)
    return statements
  }

  const runAdvancedSql = async () => {
    if (!advancedKey.trim()) {
      alert('需要先填入服务端 API Key。\n\n在 CloudBase 控制台 → 环境管理 → API Key 创建\n（服务端 API Key，不是客户端 Key）。')
      return
    }
    if (!advancedSql.trim()) {
      alert('请输入 SQL 语句')
      return
    }
    setIsExecuting(true)
    const start = Date.now()
    const apiUrl = `https://${config.env}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql`
    const statements = splitSqlStatements(advancedSql)
    const collected = []
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      const stmtStart = Date.now()
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${advancedKey.trim()}`
          },
          body: JSON.stringify({ sql: stmt, role: advancedRole })
        })
        const text = await response.text()
        const elapsed = Date.now() - stmtStart
        let parsed
        try { parsed = JSON.parse(text) } catch (e) { parsed = text }
        const ok = response.status === 200
        const rows = Array.isArray(parsed) ? parsed : (parsed?.data && Array.isArray(parsed.data) ? parsed.data : [])
        const label = statements.length > 1
          ? `⚙️ SQL 语句 ${i + 1}/${statements.length}`
          : '⚙️ 高级 SQL 执行'
        if (!ok) {
          const errMsg = typeof parsed === 'string'
            ? parsed
            : (parsed?.message || parsed?.error || parsed?.error_message || `HTTP ${response.status}: ${text.substring(0, 200)}`)
          collected.push({
            label,
            success: false,
            elapsed,
            error: String(errMsg),
            statement: stmt,
            status: response.status
          })
        } else {
          collected.push({
            label,
            success: true,
            elapsed,
            rowCount: rows.length,
            data: rows.length ? rows : (typeof parsed === 'string' ? [{ raw: parsed }] : parsed),
            statement: stmt,
            status: response.status
          })
        }
      } catch (err) {
        const label = statements.length > 1
          ? `⚙️ SQL 语句 ${i + 1}/${statements.length}`
          : '⚙️ 高级 SQL 执行'
        collected.push({
          label,
          success: false,
          elapsed: Date.now() - stmtStart,
          error: err?.message || String(err),
          statement: stmt
        })
      }
    }
    setResults(prev => [...collected.reverse(), ...prev].slice(0, 20))
    setIsExecuting(false)
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  const envId = config.env || '未配置'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'var(--surface-100)',
        borderRadius: 10,
        border: '1px solid var(--border-light)',
      }}>
        <span>🖥️</span>
        <span>CloudBase 环境：</span>
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text)', fontWeight: 600 }}>{envId}</span>
      </div>

      {/* 快速查询 - 优化卡片 */}
      <div style={{
        padding: '18px 18px 20px',
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 14,
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>⚡ 快速查询</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 10,
        }}>
          {TABLE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => queryTable(p.key)}
              disabled={isExecuting}
              style={{
                padding: '12px 14px',
                fontSize: 13,
                background: 'var(--surface-100)',
                border: '1px solid var(--border-light)',
                borderRadius: 10,
                cursor: isExecuting ? 'wait' : 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
                transition: 'all 0.15s ease',
                minHeight: 60,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--text)' }}>{p.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* SQL 模板 - 优化卡片 */}
      <div style={{
        padding: '18px 18px 20px',
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 14,
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>📝 常用 SQL 模板</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {SQL_TEMPLATES.map(t => (
            <button
              key={t.key}
              onClick={async () => {
                // 对清空数据的模板进行特殊处理
                if (t.key === 'clear_current_user_data') {
                  if (!currentUserId) {
                    alert('⚠️ 未获取到当前登录用户ID，请先登录云端账号后再使用此功能。')
                    return
                  }
                  const confirmed = window.confirm(
                    `⚠️ 危险操作确认\n\n` +
                    `即将清空当前登录用户的所有云端数据：\n` +
                    `用户ID: ${currentUserId}\n\n` +
                    `将删除以下表的数据（共16张表）：\n` +
                    `• 卡片相关：card_status, bookmarks, wrong_answers, review_history\n` +
                    `• 测试相关：test_records, test_questions, test_sessions\n` +
                    `• 学习计划：study_plans, link_generation_runs\n` +
                    `• 卡片主表：cards\n` +
                    `• 结构数据：units, chapters, topics, categories\n` +
                    `• 用户数据：user_profiles, user_settings\n\n` +
                    `此操作不可恢复！确认要继续吗？`
                  )
                  if (!confirmed) return
                  // 替换{USER_ID}占位符为当前用户ID
                  const finalSql = t.sql.replace(/\{USER_ID\}/g, currentUserId)
                  setAdvancedSql(finalSql)
                } else {
                  setAdvancedSql(t.sql)
                }
                requestAnimationFrame(() => {
                  const el = document.getElementById('admin-advanced-sql-area')
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }}
              disabled={isExecuting}
              style={{
                padding: '12px 14px',
                fontSize: 13,
                background: t.key === 'clear_current_user_data' ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-100)',
                border: t.key === 'clear_current_user_data' ? '1px solid var(--danger)' : '1px solid var(--border-light)',
                borderRadius: 10,
                cursor: isExecuting ? 'wait' : 'pointer',
                textAlign: 'left',
                color: t.key === 'clear_current_user_data' ? 'var(--danger)' : 'var(--text)',
                transition: 'all 0.15s ease',
                minHeight: 66,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 5, color: t.key === 'clear_current_user_data' ? 'var(--danger)' : 'var(--text)' }}>{t.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 高级 SQL - 优化表单 */}
      <div id="admin-advanced-sql-area" style={{
        padding: '18px 18px 20px',
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 16,
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>⚙️ 高级 SQL 执行</div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>PostgreSQL 角色</label>
          <select
            value={advancedRole}
            onChange={e => setAdvancedRole(e.target.value)}
            disabled={isExecuting}
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 13,
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              background: 'var(--surface-100)',
              color: 'var(--text)',
              fontWeight: 500,
              minHeight: 44,
            }}
          >
            <option value="cloudbase_postgres">cloudbase_postgres（读写/建表）</option>
            <option value="cloudbase_read_only_user">cloudbase_read_only_user（只读）</option>
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>API Key（Bearer Token）</label>
          <textarea
            value={advancedKey}
            onChange={e => setAdvancedKey(e.target.value.trim())}
            placeholder="以 eyJ 开头的长字符串"
            rows={3}
            disabled={isExecuting}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 12,
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              background: 'var(--surface-100)',
              color: 'var(--text)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              resize: 'vertical',
              boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>SQL 语句</label>
          <textarea
            value={advancedSql}
            onChange={e => setAdvancedSql(e.target.value)}
            placeholder={'输入 SQL 语句...'}
            rows={8}
            disabled={isExecuting}
            style={{
              width: '100%',
              padding: 14,
              fontSize: 13,
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              background: 'var(--surface-100)',
              color: 'var(--text)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              resize: 'vertical',
              minHeight: 160,
              lineHeight: 1.7,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={runAdvancedSql}
            disabled={isExecuting}
            style={{
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 700,
              background: isExecuting ? 'var(--border-light)' : 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              cursor: isExecuting ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 44,
            }}
          >
            {isExecuting ? '⏳ 执行中...' : '▶️ 执行 SQL'}
          </button>
          <button
            onClick={() => setAdvancedSql('')}
            disabled={isExecuting}
            style={{
              padding: '12px 20px',
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--surface-100)',
              color: 'var(--text-secondary)',
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              cursor: isExecuting ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 44,
            }}
          >
            清空
          </button>
          {results.length > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 500 }}>
              共 {results.length} 条，
              <span style={{ color: 'var(--success)', fontWeight: 700 }}> {successCount} 成功</span>
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}> {failCount} 失败</span>
            </span>
          )}
        </div>
      </div>

      {/* 执行结果 - 优化卡片 */}
      {results.length > 0 && (
        <div style={{
          padding: '18px 18px 20px',
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border-light)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 14,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>📊 执行结果</div>
          {results.map((result, idx) => (
            <div key={idx} style={{
              marginBottom: 14,
              border: `1.5px solid ${result.success ? 'var(--success)' : 'var(--danger)'}`,
              borderRadius: 12,
              overflow: 'hidden',
              background: result.success ? 'var(--surface-100)' : 'var(--surface-100)',
            }}>
              <div style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: 700,
                background: result.success ? 'rgba(var(--success-rgb, 34, 197, 94), 0.12)' : 'rgba(var(--danger-rgb, 239, 68, 68), 0.12)',
                color: result.success ? 'var(--success)' : 'var(--danger)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {result.success ? '✅' : '❌'} {result.label}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {result.elapsed}ms{result.rowCount != null ? ` · ${result.rowCount} 行` : ''}
                </span>
              </div>
              <div style={{
                padding: '12px 16px',
                fontSize: 11.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-light)',
                whiteSpace: 'pre-wrap',
                maxHeight: 100,
                overflow: 'auto',
                background: 'var(--surface)',
                WebkitOverflowScrolling: 'touch',
                lineHeight: 1.6,
              }}>
                {String(result.statement || '').substring(0, 400)}
              </div>
              <div style={{ padding: '14px 16px' }}>
                {result.success
                  ? renderTable(Array.isArray(result.data) ? result.data : [])
                  : <div style={{
                    fontSize: 12.5,
                    color: 'var(--danger)',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    padding: 12,
                    background: 'var(--danger-light)',
                    borderRadius: 8,
                    border: '1px solid transparent',
                  }}>{String(result.error || '未知错误')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== 网络测试面板（模拟APK环境网络请求）=====
function NetworkTestPanel() {
  const { state } = useApp()
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState([])
  const [logs, setLogs] = useState([])
  const logEndRef = useRef(null)
  const [envInfo, setEnvInfo] = useState(null)

  // 环境检测
  useEffect(() => {
    const info = detectEnvironment()
    setEnvInfo(info)
  }, [])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const addLog = (type, msg) => {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, { type, msg, time }].slice(-200))
  }

  // 创建测试配置
  const getConfig = () => ({
    aiServiceMode: state.aiServiceMode,
    apiKey: state.apiKey,
    model: state.model || 'deepseek-chat',
    sparkApiKey: state.iflytekSparkApiKey,
    sparkApiSecret: state.iflytekSparkApiSecret,
    volcanoApiKey: state.volcanoApiKey,
    dashscopeApiKey: state.dashscopeApiKey,
  })

  // 执行完整测试
  const runAllTests = async () => {
    setTesting(true)
    setTestResults([])
    setLogs([])

    try {
      const config = getConfig()

      addLog('info', '开始网络环境测试...')

      // 1. 环境检测
      addLog('info', '[1/5] 检测运行环境...')
      const env = detectEnvironment()
      setTestResults(prev => [...prev, {
        category: '环境检测',
        name: '运行平台',
        status: 'info',
        detail: `${env.platform} (${env.isNative ? '原生模式' : 'Web浏览器模式'})`,
        elapsed: 0
      }])

      // 2. 插件检测
      addLog('info', '[2/5] 检测 @capacitor/http 插件...')
      try {
        const pluginStatus = await checkHttpPlugin()
        setTestResults(prev => [...prev, pluginStatus])
        addLog(pluginStatus.status === 'success' ? 'success' : 'warn', pluginStatus.detail)
      } catch (err) {
        setTestResults(prev => [...prev, {
          category: '插件检测',
          name: '@capacitor/http 插件',
          status: 'warn',
          detail: `插件检测异常: ${err.message || err}`,
          elapsed: 0
        }])
        addLog('warn', `插件检测异常: ${err.message || err}`)
      }

      // 3. DNS 连通性测试
      addLog('info', '[3/5] 测试域名解析...')
      try {
        const dnsTests = await runDnsTests()
        setTestResults(prev => [...prev, ...dnsTests])
        dnsTests.forEach(t => addLog(t.status === 'success' ? 'success' : 'error', `${t.name}: ${t.detail}`))
      } catch (err) {
        addLog('error', `DNS 测试失败: ${err.message || err}`)
      }

      // 4. API 连接测试
      addLog('info', '[4/5] 测试 AI 服务 API 连接...')
      try {
        const apiTests = await runApiTests(config)
        setTestResults(prev => [...prev, ...apiTests])
        apiTests.forEach(t => addLog(t.status === 'success' ? 'success' : 'error', `${t.name}: ${t.detail}`))
      } catch (err) {
        addLog('error', `API 测试失败: ${err.message || err}`)
      }

      // 5. 方式对比测试（原生 vs fetch）
      addLog('info', '[5/5] 对比原生插件与 fetch 方式...')
      try {
        const compareTests = await runMethodComparison(config)
        setTestResults(prev => [...prev, ...compareTests])
        compareTests.forEach(t => addLog(t.status === 'success' ? 'success' : 'warn', `${t.name}: ${t.detail}`))
      } catch (err) {
        addLog('error', `对比测试失败: ${err.message || err}`)
      }

      addLog('success', '✓ 测试完成！请查看上方结果。')
    } catch (err) {
      addLog('error', `❌ 测试流程异常: ${err.message || err}`)
      console.error('[NetworkTestPanel] runAllTests error:', err)
    } finally {
      // 确保测试状态被重置
      setTesting(false)
    }
  }

  // 只运行单个服务的测试
  const testSingleService = async (serviceKey) => {
    setTesting(true)

    try {
      const config = getConfig()

      addLog('info', `开始测试 ${serviceKey}...`)

      let results = []
      if (serviceKey === 'iflytek') {
        results = await testIflytekSpark(config, true)
      } else if (serviceKey === 'volcano') {
        results = await testVolcanoEngine(config, true)
      } else if (serviceKey === 'dashscope') {
        results = await testDashscope(config, true)
      } else if (serviceKey === 'deepseek') {
        results = await testDeepSeek(config, true)
      }

      setTestResults(prev => [...prev, ...results])
      results.forEach(t => addLog(t.status === 'success' ? 'success' : 'error', `${t.name}: ${t.detail}`))
    } catch (err) {
      addLog('error', `❌ 测试失败: ${err.message || err}`)
      console.error(`[NetworkTestPanel] testSingleService(${serviceKey}) error:`, err)
    } finally {
      setTesting(false)
    }
  }

  // ========= 测试函数 =========

  function detectEnvironment() {
    let platform = '未知'
    let isNative = false

    try {
      isNative = Capacitor.isNativePlatform()
      platform = Capacitor.getPlatform()
    } catch (e) {
      platform = 'Web (Capacitor不可用)'
    }

    return {
      platform,
      isNative,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      httpPluginAvailable: typeof Http !== 'undefined' && typeof Http.request === 'function',
    }
  }

  async function checkHttpPlugin() {
    const start = Date.now()
    try {
      if (typeof Http === 'undefined') {
        return {
          category: '插件检测',
          name: '@capacitor/http 插件',
          status: 'warn',
          detail: '插件未定义 - 浏览器环境中使用 fetch 作为后备',
          elapsed: Date.now() - start
        }
      }
      if (typeof Http.request !== 'function') {
        return {
          category: '插件检测',
          name: '@capacitor/http 插件',
          status: 'warn',
          detail: 'request 方法不存在 - 浏览器环境中使用 fetch 作为后备',
          elapsed: Date.now() - start
        }
      }

      const env = detectEnvironment()
      if (!env.isNative) {
        // 浏览器环境：只检查插件是否加载，不实际发送请求（避免 CORS 问题）
        return {
          category: '插件检测',
          name: '@capacitor/http 插件',
          status: 'info',
          detail: '浏览器环境 - 插件已加载，实际请求将通过原生 APK 进行测试',
          elapsed: Date.now() - start
        }
      }

      // 原生环境：简单的 ping 测试
      try {
        await Http.request({
          method: 'GET',
          url: 'https://www.example.com',
          connectTimeout: 5000,
          readTimeout: 5000,
        })
        return {
          category: '插件检测',
          name: '@capacitor/http 插件',
          status: 'success',
          detail: '插件可用，已成功发送 GET 请求',
          elapsed: Date.now() - start
        }
      } catch (err) {
        return {
          category: '插件检测',
          name: '@capacitor/http 插件',
          status: 'warn',
          detail: `插件已加载但测试请求失败: ${err.message || JSON.stringify(err).substring(0, 100)}`,
          elapsed: Date.now() - start
        }
      }
    } catch (err) {
      return {
        category: '插件检测',
        name: '@capacitor/http 插件',
        status: 'warn',
        detail: `检测异常: ${err.message || JSON.stringify(err).substring(0, 100)}`,
        elapsed: Date.now() - start
      }
    }
  }

  async function runDnsTests() {
    const domains = [
      { name: '讯飞星火', url: IFLYTEK_SPARK_API_URL },
      { name: '火山引擎', url: VOLCANO_ENGINE_API_URL },
      { name: '阿里云百炼', url: DASHSCOPE_API_URL },
      { name: 'DeepSeek', url: DEEPSEEK_API_URL },
    ]

    const results = []
    for (const domain of domains) {
      const start = Date.now()
      try {
        // 使用 fetch HEAD 请求测试域名解析
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)

        const response = await fetch(domain.url, {
          method: 'OPTIONS',
          mode: 'cors',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        results.push({
          category: '域名解析',
          name: `${domain.name} 域名`,
          status: 'success',
          detail: `域名可访问 (HTTP ${response.status})`,
          elapsed: Date.now() - start
        })
      } catch (err) {
        // OPTIONS 可能因为 CORS 失败但域名本身可访问
        if (err.name === 'AbortError') {
          results.push({
            category: '域名解析',
            name: `${domain.name} 域名`,
            status: 'error',
            detail: `超时 (8s)`,
            elapsed: Date.now() - start
          })
        } else {
          results.push({
            category: '域名解析',
            name: `${domain.name} 域名`,
            status: 'warn',
            detail: `请求异常 (可能CORS限制): ${err.message || err}`,
            elapsed: Date.now() - start
          })
        }
      }
    }

    return results
  }

  async function runApiTests(config) {
    const results = []

    // 讯飞星火
    if (config.sparkApiKey) {
      results.push(...await testIflytekSpark(config, false))
    } else {
      results.push({
        category: 'API 测试',
        name: '讯飞星火',
        status: 'warn',
        detail: '未配置 API Key (sparkApiKey)',
        elapsed: 0
      })
    }

    // 火山引擎
    if (config.volcanoApiKey) {
      results.push(...await testVolcanoEngine(config, false))
    } else {
      results.push({
        category: 'API 测试',
        name: '火山引擎',
        status: 'warn',
        detail: '未配置 API Key',
        elapsed: 0
      })
    }

    // 阿里云百炼
    if (config.dashscopeApiKey) {
      results.push(...await testDashscope(config, false))
    } else {
      results.push({
        category: 'API 测试',
        name: '阿里云百炼',
        status: 'warn',
        detail: '未配置 API Key',
        elapsed: 0
      })
    }

    // DeepSeek
    if (config.apiKey && state.aiServiceMode !== 'iflytek-spark' && state.aiServiceMode !== 'volcano' && state.aiServiceMode !== 'dashscope') {
      results.push(...await testDeepSeek(config, false))
    } else if (config.apiKey) {
      results.push(...await testDeepSeek(config, false))
    } else {
      results.push({
        category: 'API 测试',
        name: 'DeepSeek',
        status: 'warn',
        detail: '未配置 API Key',
        elapsed: 0
      })
    }

    return results
  }

  // ========= 通用 HTTP 测试函数（两种方式：原生插件 + fetch）=========
  async function testApiWithBothMethods(serviceName, url, headers, body, detailed, proxyUrl) {
    const results = []
    const env = detectEnvironment()

    // 开发浏览器模式下，如果有代理 URL，则使用代理
    const isDevBrowser = !env.isNative && import.meta.env.DEV
    const effectiveProxyUrl = proxyUrl || url
    const finalFetchUrl = isDevBrowser ? effectiveProxyUrl : url

    // 标准化请求头：与生产代码 httpClient.js 保持一致
    // 确保 Content-Type 存在且为 application/json
    function normalizeTestHeaders(h) {
      const normalized = {}
      if (h && typeof h === 'object') {
        for (const key of Object.keys(h)) {
          normalized[key] = h[key]
        }
      }
      let hasContentType = false
      for (const key of Object.keys(normalized)) {
        if (key.toLowerCase() === 'content-type') {
          hasContentType = true
          break
        }
      }
      if (!hasContentType) {
        normalized['Content-Type'] = 'application/json'
      }
      return normalized
    }

    const normalizedHeaders = normalizeTestHeaders(headers)

    // 方式1: 原生插件 @capacitor/http
    const start1 = Date.now()
    try {
      if (typeof Http !== 'undefined' && typeof Http.request === 'function') {
        // 在浏览器环境中，@capacitor/http 使用 fetch 包装，仍受 CORS 限制
        // 标注为"模拟原生插件"，并在 APK 环境中会真正启用
        if (env.isNative) {
          // 原生环境：真实的原生 HTTP 请求
          const response = await Http.request({
            method: 'POST',
            url: url,
            headers: normalizedHeaders,
            data: typeof body === 'string' ? body : JSON.stringify(body),
            responseType: 'text',
            connectTimeout: 10000,
            readTimeout: 10000,
          })
          const statusOk = response.status >= 200 && response.status < 400
          const detailText = typeof response.data === 'string'
            ? response.data.substring(0, 100)
            : (typeof response.data !== 'undefined' ? '响应数据已接收' : 'OK')
          results.push({
            category: detailed ? `${serviceName} - 详细测试` : 'API 测试',
            name: `${serviceName} (原生插件 @capacitor/http)`,
            status: statusOk ? 'success' : 'error',
            detail: `HTTP ${response.status} - ${detailText}`,
            elapsed: Date.now() - start1
          })
        } else {
          // 浏览器环境：模拟，实际仍受 CORS 限制
          // 说明：在 APK 环境中 @capacitor/http 会绕过 CORS
          const response = await Http.request({
            method: 'POST',
            url: finalFetchUrl,  // 浏览器环境使用代理 URL
            headers: normalizedHeaders,
            data: typeof body === 'string' ? body : JSON.stringify(body),
            responseType: 'text',
            connectTimeout: 10000,
            readTimeout: 10000,
          })
          const statusOk = response.status >= 200 && response.status < 400
          const detailText = typeof response.data === 'string'
            ? response.data.substring(0, 100)
            : (typeof response.data !== 'undefined' ? '响应数据已接收' : 'OK')
          results.push({
            category: detailed ? `${serviceName} - 详细测试` : 'API 测试',
            name: `${serviceName} (原生插件 @capacitor/http - 浏览器模拟)`,
            status: statusOk ? 'success' : (response.status === 400 ? 'warn' : 'warn'),
            detail: `[浏览器模拟] HTTP ${response.status} - ${detailText}（APK 中会使用原生插件直连，建议在真实设备验证）`,
            elapsed: Date.now() - start1
          })
        }
      } else {
        results.push({
          category: detailed ? `${serviceName} - 详细测试` : 'API 测试',
          name: `${serviceName} (原生插件 @capacitor/http)`,
          status: 'warn',
          detail: env.isNative ? '原生插件不可用' : '浏览器环境 - 跳过原生插件测试（APK 中才会启用）',
          elapsed: Date.now() - start1
        })
      }
    } catch (err) {
      const errorDetail = err.message
        || (typeof err === 'object' ? JSON.stringify(err).substring(0, 150) : String(err))
      const envHint = env.isNative
        ? ''
        : '（浏览器环境可能受 CORS 限制，APK 中原生插件应能成功）'
      results.push({
        category: detailed ? `${serviceName} - 详细测试` : 'API 测试',
        name: `${serviceName} (原生插件 @capacitor/http)`,
        status: env.isNative ? 'error' : 'warn',
        detail: `${env.isNative ? '错误' : '浏览器环境'}: ${errorDetail} ${envHint}`,
        elapsed: Date.now() - start1
      })
    }

    // 方式2: fetch
    const start2 = Date.now()
    try {
      const response = await fetch(finalFetchUrl, {
        method: 'POST',
        headers: normalizedHeaders,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })
      const text = await response.text()
      const envSuffix = isDevBrowser && finalFetchUrl !== url ? '（开发模式，使用代理 URL）' : ''
      results.push({
        category: detailed ? `${serviceName} - 详细测试` : 'API 测试',
        name: `${serviceName} (fetch 方式)`,
        status: response.ok ? 'success' : (response.status === 400 ? 'warn' : 'warn'),
        detail: `HTTP ${response.status} ${envSuffix} - ${text.substring(0, 100)}`,
        elapsed: Date.now() - start2
      })
    } catch (err) {
      results.push({
        category: detailed ? `${serviceName} - 详细测试` : 'API 测试',
        name: `${serviceName} (fetch 方式)`,
        status: 'warn',
        detail: `错误: ${err.message || err}（浏览器环境：CORS 或网络问题；APK 环境应能正常连接）`,
        elapsed: Date.now() - start2
      })
    }

    return results
  }

  // === 讯飞星火测试 ===
  async function testIflytekSpark(config, detailed) {
    const url = IFLYTEK_SPARK_API_URL
    // 开发模式下使用 Vite 代理绕过 CORS
    const proxyUrl = '/api/spark/v1/chat/completions'
    const apiKey = (config.sparkApiKey || '').trim()
    if (!apiKey) {
      return [{
        category: 'API 测试',
        name: '讯飞星火',
        status: 'warn',
        detail: '未配置 API Key (sparkApiKey)',
        elapsed: 0
      }]
    }
    const body = JSON.stringify({
      model: 'general',
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0.1,
    })
    const headers = {
      'Content-Type': 'application/json',
      // 注意：生产代码中使用 'Bearer ' + password，此处保持一致
      'Authorization': 'Bearer ' + apiKey,
    }
    return testApiWithBothMethods('讯飞星火', url, headers, body, detailed, proxyUrl)
  }

  // === 火山引擎测试 ===
  async function testVolcanoEngine(config, detailed) {
    const url = VOLCANO_ENGINE_API_URL
    // 火山引擎没有配置代理，在浏览器环境中可能受 CORS 限制
    const apiKey = (config.volcanoApiKey || '').trim()
    if (!apiKey) {
      return [{
        category: 'API 测试',
        name: '火山引擎',
        status: 'warn',
        detail: '未配置 API Key',
        elapsed: 0
      }]
    }
    const body = JSON.stringify({
      model: 'doubao-lite-4k',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 10,
    })
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    }
    return testApiWithBothMethods('火山引擎', url, headers, body, detailed)
  }

  // === 阿里云百炼测试 ===
  async function testDashscope(config, detailed) {
    const url = DASHSCOPE_API_URL
    // 阿里云百炼支持跨域请求
    const apiKey = (config.dashscopeApiKey || '').trim()
    if (!apiKey) {
      return [{
        category: 'API 测试',
        name: '阿里云百炼',
        status: 'warn',
        detail: '未配置 API Key',
        elapsed: 0
      }]
    }
    const body = JSON.stringify({
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 10,
    })
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    }
    return testApiWithBothMethods('阿里云百炼', url, headers, body, detailed)
  }

  // === DeepSeek 测试 ===
  async function testDeepSeek(config, detailed) {
    const url = DEEPSEEK_API_URL
    // DeepSeek 可能支持跨域请求
    const apiKey = (config.apiKey || '').trim()
    if (!apiKey) {
      return [{
        category: 'API 测试',
        name: 'DeepSeek',
        status: 'warn',
        detail: '未配置 API Key',
        elapsed: 0
      }]
    }
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 10,
    })
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }
    return testApiWithBothMethods('DeepSeek', url, headers, body, detailed)
  }

  // 运行请求方式对比
  async function runMethodComparison(config) {
    const results = []
    const env = detectEnvironment()

    // 使用一个已知且支持跨域的 URL 进行对比测试
    // example.com 在浏览器中通常会有 CORS 限制，因此在开发模式下
    // 我们使用 Vite 代理 URL，在 APK 中使用真实 URL
    const testUrl = env.isNative
      ? 'https://www.example.com'
      : (import.meta && import.meta.env && import.meta.env.DEV ? '/api/spark/v1/chat/completions' : 'https://www.example.com')

    // 准备一个简单的请求体（如果 API 需要）
    const simpleBody = JSON.stringify({
      model: 'general',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    })
    const simpleHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-key',
    }

    // 方式1: 原生插件
    const start1 = Date.now()
    try {
      if (typeof Http !== 'undefined' && typeof Http.request === 'function') {
        // 根据环境选择 URL
        const actualUrl = env.isNative ? 'https://www.example.com' : testUrl
        const response = await Http.request({
          method: env.isNative ? 'GET' : 'POST',
          url: actualUrl,
          headers: env.isNative ? {} : simpleHeaders,
          data: env.isNative ? undefined : simpleBody,
          responseType: 'text',
          connectTimeout: 8000,
          readTimeout: 8000,
        })
        results.push({
          category: '方式对比',
          name: `原生插件 ${env.isNative ? 'GET' : 'POST'} ${actualUrl.length > 50 ? actualUrl.substring(0, 50) + '...' : actualUrl}`,
          status: response.status >= 200 && response.status < 300 ? 'success' : 'warn',
          detail: `HTTP ${response.status} ${env.isNative ? '(原生环境)' : '(浏览器模拟 - APK 中会不同)'}`,
          elapsed: Date.now() - start1
        })
      } else {
        results.push({
          category: '方式对比',
          name: '原生插件',
          status: 'warn',
          detail: '插件不可用',
          elapsed: Date.now() - start1
        })
      }
    } catch (err) {
      results.push({
        category: '方式对比',
        name: '原生插件',
        status: env.isNative ? 'error' : 'warn',
        detail: `${env.isNative ? '错误' : '浏览器模拟'}: ${err.message || JSON.stringify(err).substring(0, 100)}（${env.isNative ? '请检查网络配置' : '浏览器环境可能受 CORS 限制'}）`,
        elapsed: Date.now() - start1
      })
    }

    // 方式2: fetch
    const start2 = Date.now()
    try {
      const response = await fetch(testUrl, {
        method: env.isNative ? 'GET' : 'POST',
        headers: env.isNative ? {} : simpleHeaders,
        body: env.isNative ? undefined : simpleBody,
      })
      results.push({
        category: '方式对比',
        name: `fetch ${env.isNative ? 'GET' : 'POST'} ${testUrl.length > 50 ? testUrl.substring(0, 50) + '...' : testUrl}`,
        status: response.ok ? 'success' : 'warn',
        detail: `HTTP ${response.status} ${env.isNative ? '(原生环境)' : '(浏览器环境)'}`,
        elapsed: Date.now() - start2
      })
    } catch (err) {
      results.push({
        category: '方式对比',
        name: 'fetch',
        status: 'error',
        detail: `错误: ${err.message || err}（${env.isNative ? '网络问题' : '浏览器环境 CORS 问题'}）`,
        elapsed: Date.now() - start2
      })
    }

    return results
  }

  // ===== 渲染函数 =====
  function renderResultRow(result, idx) {
    const statusColor = result.status === 'success' ? 'var(--success)'
      : result.status === 'error' ? 'var(--danger)'
      : result.status === 'warn' ? 'var(--warning)'
      : 'var(--text-secondary)'

    const statusIcon = result.status === 'success' ? '✅'
      : result.status === 'error' ? '❌'
      : result.status === 'warn' ? '⚠️'
      : 'ℹ️'

    return (
      <div key={idx} style={{
        padding: '12px 14px',
        marginBottom: 8,
        background: 'var(--surface-100)',
        borderRadius: 10,
        borderLeft: `4px solid ${statusColor}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
            {statusIcon} {result.name}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{result.elapsed}ms</span>
        </div>
        <div style={{ fontSize: 12, color: statusColor, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.6, fontWeight: 500 }}>
          {result.detail}
        </div>
        {result.category && (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, fontWeight: 500 }}>
            分类: {result.category}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 环境信息 - 优化卡片 */}
      {envInfo && (
        <div style={{
          padding: '18px 18px 20px',
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border-light)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            📱 运行环境检测
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
            <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>平台:</div>
            <div style={{ color: 'var(--text)', fontWeight: 600 }}>{envInfo.platform}</div>
            <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>模式:</div>
            <div style={{ color: envInfo.isNative ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
              {envInfo.isNative ? '✅ 原生 (APK)' : '⚠️ Web 浏览器'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>HTTP插件:</div>
            <div style={{ color: envInfo.httpPluginAvailable ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
              {envInfo.httpPluginAvailable ? '✅ 可用 (@capacitor/http)' : '❌ 不可用'}
            </div>
          </div>
        </div>
      )}

      {/* 测试说明 - 优化卡片 */}
      <div style={{
        padding: '18px 18px 20px',
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          🧪 测试说明
        </h3>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
          此工具模拟 APK 环境下的网络请求（使用 <code>@capacitor/http</code> 原生插件），
          与浏览器 <code>fetch</code> 方式进行对比，帮助诊断网络连接问题。
        </p>
        <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--text)', fontWeight: 600 }}>
          当前 AI 模式: <strong style={{ color: 'var(--primary)' }}>{state.aiServiceMode || '未选择'}</strong>
          {state.model && <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>({state.model})</span>}
        </p>
      </div>

      {/* 操作按钮 - 优化网格布局 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={runAllTests}
          disabled={testing}
          style={{
            padding: '14px 18px',
            fontSize: 15,
            fontWeight: 700,
            background: testing ? 'var(--border-light)' : 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: 12,
            cursor: testing ? 'wait' : 'pointer',
            minHeight: 52,
            boxShadow: testing ? 'none' : '0 2px 8px rgba(0, 150, 255, 0.2)',
            transition: 'all 0.2s ease',
          }}
        >
          {testing ? '⏳ 测试进行中...' : '▶️ 运行全部测试'}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          <button
            onClick={() => testSingleService('iflytek')}
            disabled={testing}
            style={{
              padding: '12px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              cursor: testing ? 'wait' : 'pointer',
              minHeight: 46,
              transition: 'all 0.2s ease',
            }}
          >
            🎯 讯飞星火
          </button>
          <button
            onClick={() => testSingleService('volcano')}
            disabled={testing}
            style={{
              padding: '12px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              cursor: testing ? 'wait' : 'pointer',
              minHeight: 46,
              transition: 'all 0.2s ease',
            }}
          >
            🌋 火山引擎
          </button>
          <button
            onClick={() => testSingleService('dashscope')}
            disabled={testing}
            style={{
              padding: '12px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              cursor: testing ? 'wait' : 'pointer',
              minHeight: 46,
              transition: 'all 0.2s ease',
            }}
          >
            ☁️ 阿里云百炼
          </button>
          <button
            onClick={() => testSingleService('deepseek')}
            disabled={testing}
            style={{
              padding: '12px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1.5px solid var(--border-light)',
              borderRadius: 10,
              cursor: testing ? 'wait' : 'pointer',
              minHeight: 46,
              transition: 'all 0.2s ease',
            }}
          >
            🔮 DeepSeek
          </button>
        </div>
      </div>

      {/* 测试日志 - 优化卡片 */}
      {logs.length > 0 && (
        <div style={{
          padding: '16px 16px 18px',
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border-light)',
          maxHeight: 220,
          overflowY: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11.5,
          WebkitOverflowScrolling: 'touch',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div style={{ marginBottom: 10, fontWeight: 700, color: 'var(--text)', fontSize: 13, fontFamily: 'system-ui, -apple-system', display: 'flex', alignItems: 'center', gap: 6 }}>
            📝 实时日志
          </div>
          {logs.map((log, i) => (
            <div key={i} style={{
              color: log.type === 'success' ? 'var(--success)'
                : log.type === 'error' ? 'var(--danger)'
                : log.type === 'warn' ? 'var(--warning)'
                : 'var(--text-secondary)',
              marginBottom: 4,
              lineHeight: 1.5,
              padding: '4px 8px',
              background: 'var(--surface-100)',
              borderRadius: 6,
            }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>[{log.time}]</span> {log.msg}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* 测试结果 - 优化卡片 */}
      {testResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 测试结果 ({testResults.length} 项)
          </h3>
          {testResults.map((result, idx) => renderResultRow(result, idx))}

          {/* 汇总 - 优化卡片 */}
          <div style={{
            marginTop: 10,
            padding: '18px 18px 20px',
            background: 'var(--surface)',
            borderRadius: 14,
            border: '1px solid var(--border-light)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
          }}>
            <h4 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>📈 汇总</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
              <div style={{ padding: 14, background: 'var(--success-light)', borderRadius: 10, border: '1px solid transparent' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
                  {testResults.filter(r => r.status === 'success').length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>成功</div>
              </div>
              <div style={{ padding: 14, background: 'var(--warning-light)', borderRadius: 10, border: '1px solid transparent' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>
                  {testResults.filter(r => r.status === 'warn').length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>警告</div>
              </div>
              <div style={{ padding: 14, background: 'var(--danger-light)', borderRadius: 10, border: '1px solid transparent' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)' }}>
                  {testResults.filter(r => r.status === 'error').length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>失败</div>
              </div>
            </div>

            {/* 建议 - 优化卡片 */}
            <div style={{ marginTop: 14, padding: 14, background: 'var(--surface-100)', borderRadius: 10, border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>💡 诊断建议</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.75, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap' }}>
                {generateDiagnosis(testResults, envInfo)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 根据测试结果生成诊断建议
function generateDiagnosis(results, envInfo) {
  const suggestions = []
  const isNative = envInfo && envInfo.isNative

  // === 浏览器环境测试分析 ===
  if (!isNative) {
    // 1) 检查讯飞星火的代理测试是否成功
    const sparkResults = results.filter(r => r.name.includes('讯飞星火'))
    const sparkProxySuccess = sparkResults.some(r =>
      r.status === 'success' && (r.detail.includes('代理') || r.detail.includes('开发模式'))
    )
    const sparkPluginFailure = sparkResults.find(r =>
      r.status === 'warn' && r.name.includes('原生插件')
    )

    if (sparkProxySuccess) {
      suggestions.push(
        '✅ 讯飞星火开发模式测试通过！代理 URL 工作正常。\n' +
        '   → 在 APK 环境中，@capacitor/http 原生插件应能直连真实 API。\n' +
        '   → 如果 APK 中仍有问题，请检查：\n' +
        '      1) network_security_config.xml 是否已包含 spark-api.xf-yun.com 域名\n' +
        '      2) AndroidManifest.xml 是否引用了正确的网络安全配置\n' +
        '      3) 是否使用正确的 API Key 配置'
      )
    } else if (sparkPluginFailure) {
      suggestions.push(
        '💡 讯飞星火浏览器模拟测试显示警告：\n' +
        '   → 这是浏览器环境的预期行为（受 CORS 限制）。\n' +
        '   → 在 APK 环境中，@capacitor/http 原生插件应能绕过这些限制。\n' +
        '   → 请在真实 APK 中测试以验证原生插件的实际表现。'
      )
    }

    // 2) 检查阿里云百炼是否在浏览器中可以直接连接
    const dashscopeResults = results.filter(r => r.name.includes('百炼'))
    const dashscopeFetchSuccess = dashscopeResults.find(r =>
      r.status === 'success' && r.name.includes('fetch')
    )
    if (dashscopeFetchSuccess) {
      suggestions.push(
        '✅ 阿里云百炼浏览器 fetch 成功！API 支持跨域请求。\n' +
        '   → 在 APK 中应能正常工作。'
      )
    }

    // 3) 火山引擎和 DeepSeek 在浏览器中可能受 CORS 限制
    const volcanoResults = results.filter(r => r.name.includes('火山引擎'))
    const volcanoBrowserWarn = volcanoResults.find(r =>
      r.status === 'warn' || (r.status === 'error' && r.detail.includes('CORS'))
    )
    if (volcanoBrowserWarn) {
      suggestions.push(
        '💡 火山引擎浏览器测试警告：\n' +
        '   → 如果使用开发模式且 API 不支持 CORS，请在 vite.config.js 中添加代理配置。\n' +
        '   → 在 APK 环境中，@capacitor/http 原生插件应能直连 API。'
      )
    }
  } else {
    // === 原生 (APK) 环境测试分析 ===
    const nativePluginFailures = results.filter(r =>
      r.name.includes('原生插件') && r.status === 'error'
    )
    const nativePluginSuccess = results.filter(r =>
      r.name.includes('原生插件') && r.status === 'success'
    )

    if (nativePluginFailures.length > 0) {
      suggestions.push(
        '❌ 原生环境中 @capacitor/http 插件请求失败：\n' +
        '   请检查：\n' +
        '   1) AndroidManifest.xml 中是否有 android.permission.INTERNET 权限\n' +
        '   2) network_security_config.xml 是否正确配置并被 application 引用\n' +
        '   3) network_security_config.xml 中是否已包含所有必要的 API 域名：\n' +
        '      • spark-api.xf-yun.com (讯飞星火)\n' +
        '      • ark.cn-beijing.volces.com (火山引擎)\n' +
        '      • dashscope.aliyuncs.com (阿里云百炼)\n' +
        '      • api.deepseek.com (DeepSeek)\n' +
        '   4) 是否启用了 cleartextTrafficPermitted (仅当使用 HTTP 时需要)'
      )
    }

    if (nativePluginSuccess.length > 0) {
      suggestions.push('✅ 原生插件请求成功！APK 网络配置看起来正常。')
    }
  }

  // === 通用检查：域名解析 ===
  const dnsFailures = results.filter(r => r.category === '域名解析' && r.status === 'error')
  if (dnsFailures.length > 0) {
    suggestions.push('🌐 域名解析失败 - 请检查设备网络连接是否正常，或尝试切换网络后重试')
  }

  // === 如果没有任何严重问题 ===
  if (suggestions.length === 0) {
    if (!isNative) {
      suggestions.push(
        '✅ 开发环境测试通过！\n' +
        '   浏览器环境中的警告（如 @capacitor/http 原生插件的模拟失败）是预期行为。\n' +
        '   在 APK 环境中：\n' +
        '   1) @capacitor/http 原生插件将绕过浏览器 CORS 限制\n' +
        '   2) 请确保 network_security_config.xml 包含所有 API 域名\n' +
        '   3) 打包 APK 后在真实设备上测试以验证完整功能'
      )
    } else {
      suggestions.push(
        '✅ 所有测试通过！网络配置看起来正常。\n' +
        '   如果在 APK 中仍有问题，请检查：\n' +
        '   1) 打包时是否使用了签名证书\n' +
        '   2) 是否在真正的 Android 设备上测试（而非模拟器可能有网络限制）\n' +
        '   3) 重新构建 APK 以确保最新的配置文件被包含'
      )
    }
  }

  return suggestions.map((s, i) => <div key={i} style={{ marginBottom: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>{s}</div>)
}

