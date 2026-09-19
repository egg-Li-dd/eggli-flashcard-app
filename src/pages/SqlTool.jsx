import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase, getEffectiveConfig } from '../services/cloudbase'

const STORAGE_KEY = 'sql_tool_config_v2'

// 管理员邮箱白名单（与 AdminPanel.jsx 一致，统一从此处控制访问权限）
const ADMIN_EMAILS = ['2114279975@qq.com']

// SQL 语句类型白名单：仅允许 SELECT 与 SHOW 查询，禁止 DDL/DML
// 修复 H1：防止任意 SQL 执行（DROP/DELETE/UPDATE/ALTER 等）
const ALLOWED_SQL_PREFIXES = ['select', 'show', 'with', 'explain']
const DANGEROUS_KEYWORDS = [
  'drop table', 'drop database', 'truncate', 'delete from',
  'update ', 'insert into', 'alter table', 'create table',
  'create policy', 'drop policy', 'grant ', 'revoke ',
]

function classifySqlStatement(sql) {
  // 移除前导注释和空白，提取首个关键字
  const cleaned = sql
    .replace(/--[^\n]*\n/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .toLowerCase()
  if (!cleaned) return { type: 'empty', allowed: false }

  // 取首个单词
  const firstWord = cleaned.split(/[\s(]/)[0]
  if (ALLOWED_SQL_PREFIXES.includes(firstWord)) {
    return { type: firstWord, allowed: true }
  }
  return { type: firstWord || 'unknown', allowed: false }
}

// —— 常用 SQL 模板（点击后自动填入「高级 SQL 执行」）——
const SQL_TEMPLATES = [
  {
    key: 'fix_name_columns',
    label: '🔧 修复字段：补 units/chapters/topics 的 name 列',
    desc: '解决前端读取 .name 失败的问题（以 title 填充）',
    sql: `-- 为 units/chapters/topics 表补 name 字段（以 title 内容填充）
-- 解决前端读取 .name 时出现 'column xxx.name does not exist' 的问题
ALTER TABLE units ADD COLUMN IF NOT EXISTS name text;
UPDATE units SET name = title WHERE name IS NULL;

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS name text;
UPDATE chapters SET name = title WHERE name IS NULL;

ALTER TABLE topics ADD COLUMN IF NOT EXISTS name text;
UPDATE topics SET name = title WHERE name IS NULL;

-- 检查修复后的三个表都有 name 字段
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
    key: 'add_redo_columns_to_test_records',
    label: '🔄 v3.12 升级：test_records 新增重做溯源字段',
    desc: '为检测重做功能添加 parent_record_id 和 redo_count 列及索引',
    sql: `-- v3.12 增量升级：test_records 重做溯源字段
-- 1) 添加 parent_record_id：指向被重做的那条原始记录
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_records' AND column_name = 'parent_record_id'
  ) THEN
    ALTER TABLE test_records ADD COLUMN parent_record_id text;
  END IF;
END $$;

-- 2) 添加 redo_count：重做次数（0 = 首次测试，>=1 = 第 N 次重做）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_records' AND column_name = 'redo_count'
  ) THEN
    ALTER TABLE test_records ADD COLUMN redo_count integer DEFAULT 0;
  END IF;
END $$;

-- 3) 创建索引，加快按 parent_record_id / redo_count 的查询
CREATE INDEX IF NOT EXISTS idx_test_records_parent_record_id ON test_records(parent_record_id);
CREATE INDEX IF NOT EXISTS idx_test_records_redo_count ON test_records(redo_count);

-- 4) 验证新列是否已添加
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'test_records'
  AND column_name IN ('parent_record_id', 'redo_count')
ORDER BY column_name;`
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
UNION ALL SELECT 'cards', count(*) FROM cards WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'units', count(*) FROM units WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'chapters', count(*) FROM chapters WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'topics', count(*) FROM topics WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'categories', count(*) FROM categories WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'user_profiles', count(*) FROM user_profiles WHERE user_id = '{USER_ID}'
UNION ALL SELECT 'user_settings', count(*) FROM user_settings WHERE user_id = '{USER_ID}';`
  },
]

// —— 快速查询预设（使用 CloudBase SDK，自动使用当前登录态）——
const TABLE_PRESETS = [
  { key: 'categories', label: '📂 分类表', desc: 'categories' },
  { key: 'topics', label: '📝 主题表', desc: 'topics' },
  { key: 'chapters', label: '📖 章节表', desc: 'chapters' },
  { key: 'units', label: '🧩 单元表', desc: 'units' },
  { key: 'cards', label: '💳 卡片表', desc: 'cards（最多200条，按创建时间倒序）' },
  { key: 'card_status', label: '🎯 卡片状态', desc: 'card_status（最多200条）' },
  { key: 'wrong_answers', label: '❌ 错题', desc: 'wrong_answers（最多200条）' },
  { key: 'test_questions', label: '❓ 测试题', desc: 'test_questions（最多200条）' },
  { key: 'user_profiles', label: '👤 用户资料', desc: 'user_profiles' },
  { key: 'user_settings', label: '⚙️ 用户设置', desc: 'user_settings' },
  { key: 'review_history', label: '📜 复习历史', desc: 'review_history（最多200条）' },
  { key: 'study_plans', label: '📚 学习计划', desc: 'study_plans' },
]

const TABLE_LIMIT = 200

function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>（结果为空）</div>
  }
  const keys = Object.keys(rows[0])
  return (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            {keys.map(k => (
              <th key={k} style={{ padding: '8px 12px', textAlign: 'left', background: 'var(--surface-100)', border: '1px solid var(--border)', fontWeight: 600 }}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {keys.map(k => (
                <td key={k} style={{ padding: '8px 12px', border: '1px solid var(--border)', verticalAlign: 'top' }}>
                  {row[k] === null || row[k] === undefined
                    ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>
                    : String(row[k]).length > 300 ? String(row[k]).slice(0, 300) + '...' : String(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SqlTool() {
  const { state } = useApp()
  const config = getEffectiveConfig()
  const [results, setResults] = useState([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [advancedKey, setAdvancedKey] = useState('')
  // 修复 H1：默认只读角色，避免任意用户执行 DDL/DML
  const [advancedRole, setAdvancedRole] = useState('cloudbase_read_only_user')
  const [advancedSql, setAdvancedSql] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

  // —— 管理员邮箱白名单校验 ——
  // 修复 H1：未登录用户已被 RequireAuth 拦截，但仍需校验邮箱
  const isAdminEmail = !!(
    state.user &&
    state.user.email &&
    ADMIN_EMAILS.includes(state.user.email.toLowerCase())
  )

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
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 320, lineHeight: 1.6 }}>
          SQL 工具仅限管理员使用。<br />
          如需查询自己的数据，请使用「设置 → 云端数据」面板。
        </div>
      </div>
    )
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ advancedKey, advancedRole, advancedSql }))
    } catch (e) { /* ignore */ }
  }, [advancedKey, advancedRole, advancedSql])

  const queryTable = async (tableName) => {
    setIsExecuting(true)
    const start = Date.now()
    try {
      // 先确保登录态已加载（和 sync.js 的 getCloudTableData 一样）
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
        'review_history', 'study_plans', 'user_profiles', 'user_settings'
      ]
      // 加 user_id 过滤（RLS 是 USING(true)，不加会返回所有用户数据）
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

    // 修复 H1：SQL 语句类型风险提示（不阻止执行，但提示风险）
    // 管理员已通过邮箱白名单校验，可执行 DDL/DML，但需二次确认危险操作
    const statements = splitSqlStatements(advancedSql)
    const dangerousStmts = []
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      const classification = classifySqlStatement(stmt)
      if (!classification.allowed) {
        dangerousStmts.push({
          index: i + 1,
          type: classification.type,
          preview: stmt.trim().substring(0, 80) + (stmt.length > 80 ? '...' : ''),
        })
      }
    }
    if (dangerousStmts.length > 0) {
      const list = dangerousStmts.map(b => `  ${b.index}. [${b.type}] ${b.preview}`).join('\n')
      const confirmed = window.confirm(
        `⚠️ 危险操作确认\n\n` +
        `检测到 ${dangerousStmts.length} 条非只读 SQL 语句（DDL/DML）：\n${list}\n\n` +
        `当前角色：${advancedRole}\n` +
        (advancedRole === 'cloudbase_postgres'
          ? `⚠️ 警告：cloudbase_postgres 角色将绕过 RLS，可能影响所有用户数据！\n`
          : `提示：cloudbase_read_only_user 角色仅能执行 SELECT，DDL/DML 可能被服务端拒绝。\n`) +
        `\n确认要继续执行吗？`
      )
      if (!confirmed) return
    }

    setIsExecuting(true)
    const apiUrl = `https://${config.env}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql`
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
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto', height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>🗄️ 数据库工具</h2>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        CloudBase 环境：<span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{envId}</span>
        　· 普通查询使用当前账号登录态
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>⚡ 快速查询（点击即可）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
          {TABLE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => queryTable(p.key)}
              disabled={isExecuting}
              style={{
                padding: '10px 12px',
                fontSize: '13px',
                background: 'var(--surface-100)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: isExecuting ? 'wait' : 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{p.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* —— SQL 模板（一键填入高级 SQL 编辑器）—— */}
      <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>📝 常用 SQL 模板（点击填入高级 SQL）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
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
                    `将删除以下表的数据（共15张表）：\n` +
                    `• 卡片相关：card_status, bookmarks, wrong_answers, review_history\n` +
                    `• 测试相关：test_records, test_questions, test_sessions\n` +
                    `• 学习计划：study_plans\n` +
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
                  const el = document.getElementById('advanced-sql-area')
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }}
              disabled={isExecuting}
              style={{
                padding: '10px 12px',
                fontSize: '13px',
                background: t.key === 'clear_current_user_data' ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-100)',
                border: t.key === 'clear_current_user_data' ? '1px solid var(--danger)' : '1px solid var(--border)',
                borderRadius: '6px',
                cursor: isExecuting ? 'wait' : 'pointer',
                textAlign: 'left',
                color: t.key === 'clear_current_user_data' ? 'var(--danger)' : 'var(--text)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{t.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{t.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          ⓘ 模板点击后会自动填入下方「高级 SQL 执行」区域，填好 API Key 后点「执行 SQL」即可。
        </div>
      </div>

      <div id="advanced-sql-area" style={{ background: 'var(--surface)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>⚙️ 高级 SQL（管理员专用）</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.7 }}>
          用于 CREATE TABLE / ALTER TABLE / CREATE POLICY 等管理操作。
          需要先在 CloudBase 控制台 → 环境管理 → API Key 创建<b>服务端 API Key</b>（长字符串，以 <code>eyJ</code> 开头）。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>PostgreSQL 角色</label>
            <select
              value={advancedRole}
              onChange={e => setAdvancedRole(e.target.value)}
              disabled={isExecuting}
              style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface-100)', color: 'var(--text)' }}
            >
              <option value="cloudbase_postgres">cloudbase_postgres（读写/建表）</option>
              <option value="cloudbase_read_only_user">cloudbase_read_only_user（只读）</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>API Key（Bearer Token）</label>
          <textarea
            value={advancedKey}
            onChange={e => setAdvancedKey(e.target.value.trim())}
            placeholder="以 eyJ 开头的长字符串"
            rows={3}
            disabled={isExecuting}
            style={{
              width: '100%', padding: '8px 12px', fontSize: '12px',
              border: '1px solid var(--border)', borderRadius: '6px',
              background: 'var(--surface-100)', color: 'var(--text)',
              fontFamily: 'monospace', resize: 'vertical'
            }}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>SQL 语句</label>
          <textarea
            value={advancedSql}
            onChange={e => setAdvancedSql(e.target.value)}
            placeholder={'例如：\nSELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = \'public\' ORDER BY tablename;\n\n或：\nALTER TABLE units ADD COLUMN IF NOT EXISTS name text;\nUPDATE units SET name = title WHERE name IS NULL;'}
            rows={10}
            disabled={isExecuting}
            style={{
              width: '100%', padding: '12px', fontSize: '13px',
              border: '1px solid var(--border)', borderRadius: '6px',
              background: 'var(--surface-100)', color: 'var(--text)',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              resize: 'vertical', minHeight: '150px', lineHeight: 1.6
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={runAdvancedSql}
            disabled={isExecuting}
            style={{
              padding: '8px 20px', fontSize: '14px', fontWeight: 600,
              background: isExecuting ? 'var(--border)' : 'var(--primary)',
              color: 'white', border: 'none', borderRadius: '6px',
              cursor: isExecuting ? 'wait' : 'pointer'
            }}
          >
            {isExecuting ? '⏳ 执行中...' : '▶️ 执行 SQL'}
          </button>
          <button
            onClick={() => setAdvancedSql('')}
            disabled={isExecuting}
            style={{ padding: '8px 16px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            清空
          </button>
          {results.length > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              共 {results.length} 条，成功 <span style={{ color: 'var(--success)' }}>{successCount}</span>，失败 <span style={{ color: 'var(--danger)' }}>{failCount}</span>
            </span>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>📊 执行结果</div>
          {results.map((result, idx) => (
            <div key={idx} style={{ marginBottom: '12px', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                padding: '8px 12px', fontSize: '12px', fontWeight: 600,
                background: result.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: result.success ? 'var(--success)' : 'var(--danger)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span>{result.success ? '✅' : '❌'} {result.label}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {result.elapsed}ms{result.rowCount != null ? ` · ${result.rowCount} 行` : ''}
                </span>
              </div>
              <div style={{ padding: '8px 12px', background: 'var(--surface-100)', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'pre-wrap', maxHeight: '80px', overflow: 'auto' }}>
                {String(result.statement || '').substring(0, 400)}
              </div>
              <div style={{ padding: '8px 12px' }}>
                {result.success
                  ? renderTable(Array.isArray(result.data) ? result.data : [])
                  : <div style={{ fontSize: '12px', color: 'var(--danger)', fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{String(result.error || '未知错误')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>💡 使用说明</div>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li><b>快速查询</b>：点击上方按钮即用你当前账号执行查询（受 RLS 限制）。</li>
          <li><b>高级 SQL</b>：需要管理员 API Key，可执行建表/建策略/ALTER 等管理操作。</li>
          <li>管理员 API Key 创建路径：CloudBase 控制台 → 环境管理 → API Key → 服务端 API Key。</li>
          <li>角色 <code>cloudbase_postgres</code> 可以执行所有 SQL；<code>cloudbase_read_only_user</code> 仅能做 SELECT。</li>
          <li>配置和 SQL 都会自动保存到浏览器本地（localStorage），下次打开仍在。</li>
        </ul>
      </div>
    </div>
  )
}
