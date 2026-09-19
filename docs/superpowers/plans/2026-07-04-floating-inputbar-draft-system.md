# 悬浮窗快速录入系统（草稿暂存 + 系统级悬浮窗方案）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供系统级悬浮窗（在其他应用上方也可见），用户在任何应用中快速录入知识点草稿，发送后存入本地数据库，回到 App 内 Category 页面批量调用 AI 生成卡片。

**Architecture:**
- **系统级悬浮窗（Android 原生）**：`SYSTEM_ALERT_WINDOW` 权限 + `WindowManager.addView()` + 内嵌透明 WebView 加载独立 React 悬浮窗页面（`/floating-window.html`）
- **Capacitor 插件桥接**：`SystemFloatingWindowPlugin` 控制 显示/隐藏/移动；JS Bridge 处理 WebView 与原生层双向通信
- **数据层**：Dexie v13 升级新增 `drafts` 表（id/content/categoryId/chapterId/unitId/status/retryCount/createdAt）
- **服务层**：`draftService.js` 封装草稿 CRUD + 批量生成入口（调用现有 `generateCards`）
- **状态层**：AppContext 新增 `currentTarget`（当前归属）+ `draftCount`（全局草稿数）
- **视图层（两套）**：
  - 应用内 fallback：FloatingInputBar（React 组件，inputBarMode=floating 时在 TabBarLayout 渲染）
  - 系统级：独立 HTML 页面 + 轻量 React（共享 FloatingTargetSelector/QuickRecall/Templates 组件）
- **前台服务**：`SystemFloatingWindowService`（Android 8+ 必须前台服务承载系统悬浮窗）

**Tech Stack:** React 18 + Dexie 3 + Android WindowManager + Capacitor Plugin + WebView + 现有 aiService.generateCards

---

## 重要说明：双模式架构

| 模式 | 触发条件 | 实现 | 在其他App可见 |
|---|---|---|---|
| 应用内悬浮窗 | Web浏览器/未授权系统悬浮窗 | React FloatingInputBar 组件 | ❌ |
| 系统级悬浮窗 | APK + 已授权 SYSTEM_ALERT_WINDOW | 原生 WindowManager + WebView | ✅ |

用户在设置中可选择「输入栏模式」：
- `fixed`（固定底部）
- `floating`（应用内悬浮）
- `system`（系统级悬浮，仅 APK 支持，浏览器自动降级为 floating）

---

## File Structure

**新建文件：**
- `src/services/draftService.js` — 草稿 CRUD + 批量生成 + 自动重试
- `src/components/FloatingTargetSelector.jsx` — 三级归属选择器覆盖层
- `src/components/FloatingQuickRecall.jsx` — 最近3条草稿快速复用条
- `src/components/FloatingTemplates.jsx` — 输入模板条
- `src/components/FloatingDraftBanner.jsx` — Category 页顶部草稿提醒条
- `src/services/systemFloatingWindow.js` — Capacitor 插件 JS 封装（show/hide/permission）
- `src/pages/FloatingWindowPage.jsx` — 系统悬浮窗 WebView 加载的独立页面（轻量 React）
- `android/app/src/main/java/com/eggli/flashcards/plugins/SystemFloatingWindowPlugin.kt` — Capacitor 插件
- `android/app/src/main/java/com/eggli/flashcards/services/SystemFloatingWindowService.kt` — 前台服务 + WindowManager + WebView

**修改文件：**
- `src/services/db.js` — v13 升级新增 drafts 表 + drafts CRUD API
- `src/context/AppContext.jsx` — 新增 currentTarget / draftCount / systemFloatingEnabled 状态 + setter
- `src/components/FloatingInputBar.jsx` — 重写为模块化布局（应用内 fallback）
- `src/components/InputBar.jsx` — 加 onSubmitDraft 回调 prop
- `src/App.jsx` — TabBarLayout 全局挂载 FloatingInputBar + 添加 /floating-window 路由
- `src/pages/Category.jsx` — 移除内部 FloatingInputBar 渲染 + 加 FloatingDraftBanner
- `src/pages/SettingsDisplay.jsx` — 输入栏模式新增「system」选项 + 系统悬浮窗权限管理
- `src/index.css` — 追加 `.floating-target-*` / `.floating-recall-*` / `.floating-template-*` / `.floating-draft-banner` / `.floating-window-page` 样式
- `android/app/src/main/AndroidManifest.xml` — 新增 SYSTEM_ALERT_WINDOW 权限 + SystemFloatingWindowService 声明
- `需执行的SQl（完整版）.txt` — 同步 Supabase drafts 表建表语句
- `我需执行的SQl.txt（更新版）.txt` — 仅本次新增的 SQL 命令
- `文档分布.txt` — 记录新增组件位置

---

## Task 1: 数据库 drafts 表与 CRUD API

**Files:**
- Modify: `src/services/db.js` (在 v12 之后追加 v13 升级 + 在文件末尾追加 CRUD 导出)

- [ ] **Step 1: 在 db.js 中追加 v13 升级（drafts 表）**

在 `src/services/db.js` 文件 v12 升级块（约 L314 结束）之后追加：

```javascript
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
```

- [ ] **Step 2: 在 db.js 文件末尾追加 drafts CRUD API**

在 `src/services/db.js` 文件末尾追加：

```javascript

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
```

- [ ] **Step 3: 验证语法（启动 dev server 自动编译）**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: VITE 编译成功，无 dexie schema 报错

- [ ] **Step 4: Commit**

```bash
git add src/services/db.js
git commit -m "feat: 新增 drafts 表与 CRUD API（v13 升级）"
```

---

## Task 2: draftService 业务逻辑（批量生成 + 自动重试3次）

**Files:**
- Create: `src/services/draftService.js`

- [ ] **Step 1: 创建 draftService.js**

创建 `src/services/draftService.js`：

```javascript
import {
  addDraft,
  getPendingDrafts,
  getPendingDraftsByCategory,
  getRecentDrafts,
  getDraftCount,
  updateDraft,
  deleteDraft,
  deleteDraftsByStatus,
} from './db'
import { generateCards } from './aiService'
import { addUnits } from './db'

/**
 * 保存一条草稿（悬浮窗发送入口）
 * @param {Object} params - { content, categoryId, chapterId, unitId, templateType }
 * @returns {Object} 草稿对象
 */
export async function saveDraft(params) {
  if (!params.content || !String(params.content).trim()) {
    throw new Error('内容不能为空')
  }
  if (!params.categoryId) {
    throw new Error('必须选择归属分类')
  }
  return addDraft(params)
}

/**
 * 批量生成草稿为卡片
 * - 每条草稿独立调用 generateCards
 * - 失败自动重试，最多3次
 * - 3次仍失败则标记 status='failed'，errorMessage 记录原因
 * @param {Array<string>} draftIds - 草稿 ID 列表（空数组则处理全部 pending）
 * @param {Object} aiConfig - { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey, summaryLevel }
 * @param {Function} onProgress - (current, total, draftId, status, error) => void
 * @returns {Object} { total, success, failed, results: [{ id, status, error }] }
 */
export async function generateCardsFromDrafts(draftIds, aiConfig, onProgress) {
  let drafts
  if (draftIds && draftIds.length > 0) {
    const { getDraftById } = await import('./db')
    drafts = []
    for (const id of draftIds) {
      const d = await getDraftById(id)
      if (d) drafts.push(d)
    }
  } else {
    drafts = await getPendingDrafts()
  }

  const results = []
  let success = 0
  let failed = 0

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]
    let lastError = null

    // 标记为生成中
    await updateDraft(draft.id, { status: 'generating', errorMessage: null })

    // 自动重试3次
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // 调用现有 generateCards（返回 AI 文本）
        const aiContent = await generateCards(
          draft.content,
          aiConfig.apiKey,
          aiConfig.model,
          aiConfig.aiServiceMode,
          aiConfig.summaryLevel || 'medium',
          aiConfig.sparkApiKey,
          aiConfig.sparkApiSecret,
          aiConfig.volcanoApiKey,
          aiConfig.dashscopeApiKey,
        )

        // 解析 AI 返回的内容为卡片数组（addUnits 接收 [{ name, cards: [{front, back, knowledge_point}] }] 格式）
        const cards = parseAiContentToCards(aiContent, draft)

        // 写入数据库（addUnits 会自动创建单元与卡片）
        if (cards.length > 0) {
          await addUnits(draft.categoryId, [{
            name: draft.unitId ? undefined : extractUnitName(draft),
            cards,
          }])
        }

        // 标记成功
        await updateDraft(draft.id, {
          status: 'done',
          generatedAt: Date.now(),
          retryCount: attempt - 1,
          errorMessage: null,
        })
        success++
        results.push({ id: draft.id, status: 'done', error: null })
        lastError = null
        break
      } catch (err) {
        lastError = err?.message || String(err)
        if (attempt < 3) {
          // 等待 1 秒后重试
          await new Promise(r => setTimeout(r, 1000))
        }
      }
    }

    // 3次仍失败
    if (lastError) {
      await updateDraft(draft.id, {
        status: 'failed',
        retryCount: 3,
        errorMessage: lastError,
      })
      failed++
      results.push({ id: draft.id, status: 'failed', error: lastError })
    }

    if (typeof onProgress === 'function') {
      onProgress(i + 1, drafts.length, draft.id, lastError ? 'failed' : 'done', lastError)
    }
  }

  return { total: drafts.length, success, failed, results }
}

/**
 * 解析 AI 返回内容为卡片数组
 * 兼容现有 generateCards 的 JSON 输出格式：{ units: [{ name, cards: [{front, back, knowledge_point}] }] }
 * 或纯文本格式
 */
function parseAiContentToCards(aiContent, draft) {
  try {
    // 尝试 JSON 解析
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.units && Array.isArray(parsed.units)) {
        // 取第一个单元的卡片
        return (parsed.units[0]?.cards || []).map(c => ({
          front: c.front || c.question || '',
          back: c.back || c.answer || '',
          knowledge_point: c.knowledge_point || draft.content,
        }))
      }
      if (parsed.cards && Array.isArray(parsed.cards)) {
        return parsed.cards.map(c => ({
          front: c.front || c.question || '',
          back: c.back || c.answer || '',
          knowledge_point: c.knowledge_point || draft.content,
        }))
      }
    }
  } catch (_) {
    // JSON 解析失败，降级为纯文本处理
  }

  // 降级：把整段 AI 内容作为一张卡片的 back，原始输入作为 front
  return [{
    front: draft.content,
    back: aiContent.slice(0, 500),
    knowledge_point: draft.content,
  }]
}

/**
 * 从草稿提取单元名（用于自动命名新建的单元）
 */
function extractUnitName(draft) {
  const text = draft.content || ''
  // 取前 20 字符作为单元名
  return text.slice(0, 20) + (text.length > 20 ? '...' : '') || '快速录入'
}

/**
 * 重试单条失败的草稿
 */
export async function retryDraft(draftId, aiConfig) {
  const result = await generateCardsFromDrafts([draftId], aiConfig)
  return result.results[0]
}

/**
 * 获取草稿统计信息（用于悬浮窗红点提示）
 */
export async function getDraftStats() {
  const pending = await getDraftCount('pending')
  const failed = await getDraftCount('failed')
  return { pending, failed, total: pending + failed }
}

export {
  addDraft,
  getPendingDrafts,
  getPendingDraftsByCategory,
  getRecentDrafts,
  getDraftCount,
  updateDraft,
  deleteDraft,
  deleteDraftsByStatus,
}
```

- [ ] **Step 2: 在 db.js 中补充 getDraftById 导出**

在 Task 1 的 drafts CRUD 块末尾追加：

```javascript
/**
 * 根据 ID 获取草稿
 * @param {string} id
 * @returns {Object|null}
 */
export async function getDraftById(id) {
  return db.drafts.get(id)
}
```

- [ ] **Step 3: 验证 import 路径无误**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: VITE 编译成功，无 module not found 报错

- [ ] **Step 4: Commit**

```bash
git add src/services/draftService.js src/services/db.js
git commit -m "feat: 新增 draftService（批量生成 + 自动重试3次）"
```

---

## Task 3: AppContext 新增 currentTarget 与 draftCount 状态

**Files:**
- Modify: `src/context/AppContext.jsx`

- [ ] **Step 1: 在 initialState 中追加 currentTarget 与 draftCount**

在 `src/context/AppContext.jsx` 的 `initialState` 对象中追加两个字段：

```javascript
const initialState = {
  // ... 现有字段 ...
  inputBarMode: localStorage.getItem(STORAGE_KEYS.INPUT_BAR_MODE) || 'fixed',
  // v 新增：悬浮窗当前归属目标
  currentTarget: JSON.parse(localStorage.getItem('app_current_target') || 'null'),
  // v 新增：全局草稿数（pending + failed）
  draftCount: 0,
}
```

- [ ] **Step 2: 在 reducer 中追加 case 处理**

在 reducer 函数中追加：

```javascript
case 'SET_CURRENT_TARGET':
  return { ...state, currentTarget: action.payload }
case 'SET_DRAFT_COUNT':
  return { ...state, draftCount: action.payload }
```

- [ ] **Step 3: 在 SET_INPUT_BAR_MODE case 旁补充持久化逻辑（如 useEffect 中）**

在已有的 `setInputBarMode` useCallback 附近追加：

```javascript
const setCurrentTarget = useCallback((target) => {
  dispatch({ type: 'SET_CURRENT_TARGET', payload: target })
  if (target) {
    localStorage.setItem('app_current_target', JSON.stringify(target))
  } else {
    localStorage.removeItem('app_current_target')
  }
}, [])

const refreshDraftCount = useCallback(async () => {
  try {
    const { getDraftStats } = await import('../services/draftService')
    const stats = await getDraftStats()
    dispatch({ type: 'SET_DRAFT_COUNT', payload: stats.pending + stats.failed })
  } catch (e) {
    console.warn('[draftCount] refresh failed:', e)
  }
}, [])
```

- [ ] **Step 4: 在 context value 中导出新方法**

在 `useEffect` 同步设置的依赖数组附近（约 L735），把 `state.draftCount` 加入触发项；并在 value 对象中导出：

```javascript
const value = {
  // ... 现有 ...
  setCurrentTarget,
  refreshDraftCount,
}
```

并在 AppShell 初始化 useEffect 中调用 `refreshDraftCount()`：

```javascript
useEffect(() => {
  refreshDraftCount()
}, [refreshDraftCount])
```

- [ ] **Step 5: 验证编译**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: 编译通过，无未定义变量报错

- [ ] **Step 6: Commit**

```bash
git add src/context/AppContext.jsx
git commit -m "feat: AppContext 新增 currentTarget 与 draftCount 状态"
```

---

## Task 4: FloatingTargetSelector 归属选择器组件

**Files:**
- Create: `src/components/FloatingTargetSelector.jsx`

- [ ] **Step 1: 创建 FloatingTargetSelector.jsx**

创建 `src/components/FloatingTargetSelector.jsx`：

```javascript
import { useState, useEffect, useCallback } from 'react'
import { getCategories, getChaptersByCategory, getUnitsByChapter } from '../services/db'

/**
 * 三级归属选择器（分类 ▸ 章节 ▸ 单元）
 * 覆盖在悬浮窗输入区上，选择后回调
 * 默认全部折叠（符合用户选择A）
 */
export default function FloatingTargetSelector({
  currentTarget,
  onSelect,
  onClose,
  recentTargets = [],
}) {
  const [categories, setCategories] = useState([])
  const [expandedCats, setExpandedCats] = useState({})
  const [chaptersMap, setChaptersMap] = useState({})
  const [unitsMap, setUnitsMap] = useState({})
  const [keyword, setKeyword] = useState('')

  // 加载分类列表
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  // 展开/折叠分类
  const toggleCat = useCallback(async (catId) => {
    setExpandedCats(prev => {
      const next = { ...prev, [catId]: !prev[catId] }
      return next
    })
    if (!chaptersMap[catId]) {
      try {
        const chapters = await getChaptersByCategory(catId)
        setChaptersMap(prev => ({ ...prev, [catId]: chapters }))
      } catch (_) {}
    }
  }, [chaptersMap])

  // 展开/折叠章节
  const toggleChapter = useCallback(async (chId) => {
    setExpandedCats(prev => ({ ...prev, ['ch_' + chId]: !prev['ch_' + chId] }))
    if (!unitsMap[chId]) {
      try {
        const units = await getUnitsByChapter(chId)
        setUnitsMap(prev => ({ ...prev, [chId]: units }))
      } catch (_) {}
    }
  }, [unitsMap])

  // 选中单元
  const handleSelectUnit = (cat, ch, unit) => {
    onSelect({ categoryId: cat.id, categoryName: cat.name, chapterId: ch.id, chapterName: ch.name, unitId: unit.id, unitName: unit.name })
  }

  // 选中章节（不指定单元）
  const handleSelectChapter = (cat, ch) => {
    onSelect({ categoryId: cat.id, categoryName: cat.name, chapterId: ch.id, chapterName: ch.name, unitId: null, unitName: null })
  }

  // 选中分类（不指定章节/单元）
  const handleSelectCategory = (cat) => {
    onSelect({ categoryId: cat.id, categoryName: cat.name, chapterId: null, chapterName: null, unitId: null, unitName: null })
  }

  // 关键词过滤
  const matchesKeyword = (text) => {
    if (!keyword) return true
    return (text || '').toLowerCase().includes(keyword.toLowerCase())
  }

  return (
    <div className="floating-target-overlay">
      <div className="floating-target-header">
        <span className="floating-target-title">📍 选择归属</span>
        <button className="floating-target-close" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div className="floating-target-search">
        <input
          type="text"
          className="floating-target-search-input"
          placeholder="🔍 检索分类/章节/单元..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />
      </div>

      <div className="floating-target-list">
        {categories.length === 0 && (
          <div className="floating-target-empty">暂无分类，请先在主页新建</div>
        )}

        {categories.map(cat => (
          <div key={cat.id} className="floating-target-cat">
            <div
              className={'floating-target-row floating-target-row-cat' + (currentTarget?.categoryId === cat.id && !currentTarget?.chapterId ? ' floating-target-row-active' : '')}
              onClick={() => expandedCats[cat.id] ? null : toggleCat(cat.id)}
            >
              <span
                className="floating-target-arrow"
                onClick={(e) => { e.stopPropagation(); toggleCat(cat.id) }}
              >
                {expandedCats[cat.id] ? '▼' : '▶'}
              </span>
              <span className="floating-target-icon">📁</span>
              <span
                className="floating-target-label"
                onClick={(e) => { e.stopPropagation(); if (matchesKeyword(cat.name)) handleSelectCategory(cat) }}
              >
                {cat.name}
              </span>
            </div>

            {expandedCats[cat.id] && chaptersMap[cat.id]?.map(ch => (
              <div key={ch.id} className="floating-target-chapter">
                <div
                  className={'floating-target-row floating-target-row-chapter' + (currentTarget?.chapterId === ch.id && !currentTarget?.unitId ? ' floating-target-row-active' : '')}
                  onClick={() => expandedCats['ch_' + ch.id] ? null : toggleChapter(ch.id)}
                >
                  <span
                    className="floating-target-arrow"
                    onClick={(e) => { e.stopPropagation(); toggleChapter(ch.id) }}
                  >
                    {expandedCats['ch_' + ch.id] ? '▼' : '▶'}
                  </span>
                  <span className="floating-target-icon floating-target-icon-indent">📂</span>
                  <span
                    className="floating-target-label"
                    onClick={(e) => { e.stopPropagation(); if (matchesKeyword(ch.name)) handleSelectChapter(cat, ch) }}
                  >
                    {ch.name}
                  </span>
                </div>

                {expandedCats['ch_' + ch.id] && unitsMap[ch.id]?.map(unit => (
                  <div
                    key={unit.id}
                    className={'floating-target-row floating-target-row-unit' + (currentTarget?.unitId === unit.id ? ' floating-target-row-active' : '')}
                    onClick={() => matchesKeyword(unit.name) && handleSelectUnit(cat, ch, unit)}
                  >
                    <span className="floating-target-icon floating-target-icon-indent2">📄</span>
                    <span className="floating-target-label">{unit.name}</span>
                  </div>
                ))}

                {expandedCats['ch_' + ch.id] && unitsMap[ch.id]?.length === 0 && (
                  <div className="floating-target-empty-sub">暂无单元</div>
                )}
              </div>
            ))}

            {expandedCats[cat.id] && chaptersMap[cat.id]?.length === 0 && (
              <div className="floating-target-empty-sub">暂无章节</div>
            )}
          </div>
        ))}
      </div>

      {recentTargets.length > 0 && (
        <div className="floating-target-recent">
          <div className="floating-target-recent-title">⭐ 最近使用</div>
          {recentTargets.map((t, i) => (
            <div
              key={i}
              className="floating-target-recent-item"
              onClick={() => onSelect(t)}
            >
              {t.categoryName} ▸ {t.chapterName} ▸ {t.unitName || '未指定单元'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FloatingTargetSelector.jsx
git commit -m "feat: 新增 FloatingTargetSelector 三级归属选择器"
```

---

## Task 5: FloatingQuickRecall 快速回忆条组件

**Files:**
- Create: `src/components/FloatingQuickRecall.jsx`

- [ ] **Step 1: 创建 FloatingQuickRecall.jsx**

创建 `src/components/FloatingQuickRecall.jsx`：

```javascript
import { useState, useEffect } from 'react'
import { getRecentDrafts, deleteDraft } from '../services/db'

/**
 * 快速回忆条：显示最近3条草稿
 * 点击 → 复用内容到输入框
 * 长按 → 删除
 */
export default function FloatingQuickRecall({ onRecall, refreshKey }) {
  const [drafts, setDrafts] = useState([])
  const [longPressTimer, setLongPressTimer] = useState(null)

  const loadDrafts = async () => {
    try {
      const list = await getRecentDrafts(3)
      setDrafts(list)
    } catch (e) {
      console.warn('[QuickRecall] load failed:', e)
    }
  }

  useEffect(() => {
    loadDrafts()
  }, [refreshKey])

  if (drafts.length === 0) return null

  const handleTouchStart = (draft) => {
    const timer = setTimeout(() => {
      if (confirm(`删除这条草稿？\n\n${draft.content.slice(0, 40)}...`)) {
        deleteDraft(draft.id).then(loadDrafts)
      }
    }, 600)
    setLongPressTimer(timer)
  }

  const handleTouchEnd = (draft) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  const handleClick = (draft) => {
    onRecall(draft.content)
  }

  return (
    <div className="floating-recall">
      <div className="floating-recall-label">📝 最近：</div>
      <div className="floating-recall-list">
        {drafts.map(d => (
          <div
            key={d.id}
            className="floating-recall-item"
            onClick={() => handleClick(d)}
            onTouchStart={() => handleTouchStart(d)}
            onTouchEnd={() => handleTouchEnd(d)}
            title={d.content}
          >
            {d.content.length > 18 ? d.content.slice(0, 18) + '...' : d.content}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FloatingQuickRecall.jsx
git commit -m "feat: 新增 FloatingQuickRecall 快速回忆条"
```

---

## Task 6: FloatingTemplates 模板条组件

**Files:**
- Create: `src/components/FloatingTemplates.jsx`

- [ ] **Step 1: 创建 FloatingTemplates.jsx**

创建 `src/components/FloatingTemplates.jsx`：

```javascript
const TEMPLATES = [
  { key: 'noun', name: '名词解释', content: '[名词]：\n定义：\n特征：\n例子：' },
  { key: 'qa', name: '问答', content: '[问题]：\n答案：\n考点：' },
  { key: 'event', name: '历史事件', content: '[时间]：\n事件：\n影响：' },
  { key: 'formula', name: '公式', content: '[公式]：\n推导：\n应用场景：' },
]

/**
 * 模板条：点击模板填入输入框作为骨架
 */
export default function FloatingTemplates({ onApply }) {
  return (
    <div className="floating-template">
      <div className="floating-template-label">💡 模板：</div>
      <div className="floating-template-list">
        {TEMPLATES.map(t => (
          <button
            key={t.key}
            className="floating-template-item"
            onClick={() => onApply(t.content, t.key)}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FloatingTemplates.jsx
git commit -m "feat: 新增 FloatingTemplates 模板条"
```

---

## Task 7: 重写 FloatingInputBar 主组件

**Files:**
- Modify: `src/components/FloatingInputBar.jsx` (完全重写)

- [ ] **Step 1: 重写 FloatingInputBar.jsx**

完整替换 `src/components/FloatingInputBar.jsx`：

```javascript
import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { saveDraft } from '../services/draftService'
import { getRecentDrafts } from '../services/db'
import InputBar from './InputBar'
import FloatingTargetSelector from './FloatingTargetSelector'
import FloatingQuickRecall from './FloatingQuickRecall'
import FloatingTemplates from './FloatingTemplates'

const RECENT_TARGETS_KEY = 'app_recent_targets'

export default function FloatingInputBar() {
  const { state, setCurrentTarget, refreshDraftCount } = useApp()
  const [open, setOpen] = useState(false)
  const [posY, setPosY] = useState(50)
  const [inputValue, setInputValue] = useState('')
  const [showTargetSelector, setShowTargetSelector] = useState(false)
  const [recentTargets, setRecentTargets] = useState([])
  const [recallRefreshKey, setRecallRefreshKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const dragRef = useRef(null)
  const dragStartY = useRef(0)
  const dragStartPosY = useRef(50)
  const dragging = useRef(false)

  // 加载最近使用的归属
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_TARGETS_KEY) || '[]')
      setRecentTargets(stored.slice(0, 3))
    } catch (_) {}
  }, [])

  // 拖拽逻辑（保留原有）
  const handlePointerDown = useCallback((e) => {
    if (!open) return
    dragging.current = true
    dragStartY.current = e.clientY
    dragStartPosY.current = posY
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [open, posY])

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return
    const dy = e.clientY - dragStartY.current
    const vh = window.innerHeight
    const newPercent = Math.max(10, Math.min(90, dragStartPosY.current + (dy / vh) * 100))
    setPosY(newPercent)
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const toggleOpen = useCallback((e) => {
    e?.stopPropagation()
    setOpen(o => !o)
  }, [])

  // 选择归属
  const handleSelectTarget = useCallback((target) => {
    setCurrentTarget(target)
    setShowTargetSelector(false)
    // 加入最近使用
    setRecentTargets(prev => {
      const filtered = prev.filter(t =>
        !(t.categoryId === target.categoryId &&
          (t.chapterId || null) === (target.chapterId || null) &&
          (t.unitId || null) === (target.unitId || null))
      )
      const next = [target, ...filtered].slice(0, 3)
      localStorage.setItem(RECENT_TARGETS_KEY, JSON.stringify(next))
      return next
    })
  }, [setCurrentTarget])

  // 应用模板
  const handleApplyTemplate = useCallback((content) => {
    setInputValue(prev => prev ? prev + '\n' + content : content)
  }, [])

  // 提交草稿
  const handleSubmit = useCallback(async (text) => {
    const content = (text || '').trim()
    if (!content) return

    const target = state.currentTarget
    if (!target || !target.categoryId) {
      alert('请先选择归属（点击归属条）')
      setShowTargetSelector(true)
      return
    }

    setSubmitting(true)
    try {
      await saveDraft({
        content,
        categoryId: target.categoryId,
        chapterId: target.chapterId,
        unitId: target.unitId,
        source: 'floating',
      })
      setInputValue('')
      setRecallRefreshKey(k => k + 1)
      refreshDraftCount()
      // 自动收起（用户选择A：自动收起）
      setOpen(false)
      // 轻量提示
      if (navigator.vibrate) navigator.vibrate(50)
    } catch (e) {
      alert('保存失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }, [state.currentTarget, refreshDraftCount])

  // 归属条点击
  const handleTargetBarClick = useCallback(() => {
    setShowTargetSelector(true)
  }, [])

  // 归属条文本
  const targetText = state.currentTarget
    ? `📍 ${state.currentTarget.categoryName}${state.currentTarget.chapterName ? ' ▸ ' + state.currentTarget.chapterName : ''}${state.currentTarget.unitName ? ' ▸ ' + state.currentTarget.unitName : ''}`
    : '📍 点击选择归属'

  return (
    <>
      {open && <div className="floating-inputbar-backdrop" onClick={() => setOpen(false)} />}
      <div
        className={'floating-inputbar-wrapper' + (open ? ' floating-inputbar-wrapper-open' : '')}
        style={{ top: posY + '%' }}
      >
        {open ? (
          <div className="floating-inputbar-panel">
            {/* 模块1：控制栏 */}
            <div
              className="floating-inputbar-handle"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <span className="floating-inputbar-handle-bar" />
              <span className="floating-inputbar-handle-hint">⠿</span>
            </div>
            <button className="floating-inputbar-close-btn" onClick={toggleOpen} aria-label="收起">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              </svg>
            </button>

            <div className="floating-inputbar-body">
              {/* 模块1.5：归属选择条（核心） */}
              <div
                className={'floating-target-bar' + (!state.currentTarget ? ' floating-target-bar-empty' : '')}
                onClick={handleTargetBarClick}
              >
                <span className="floating-target-bar-text">{targetText}</span>
                <span className="floating-target-bar-arrow">▼</span>
                {state.draftCount > 0 && (
                  <span className="floating-target-bar-badge">{state.draftCount}</span>
                )}
              </div>

              {/* 归属选择器覆盖层 */}
              {showTargetSelector && (
                <FloatingTargetSelector
                  currentTarget={state.currentTarget}
                  recentTargets={recentTargets}
                  onSelect={handleSelectTarget}
                  onClose={() => setShowTargetSelector(false)}
                />
              )}

              {/* 模块2：输入栏（复用 InputBar） */}
              <div className="floating-inputbar-inputbar-wrapper">
                <InputBar
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  disabled={submitting}
                  apiKey={state.apiKey}
                  model={state.model}
                  onToast={() => {}}
                />
              </div>

              {/* 模块3：快速回忆条 */}
              <FloatingQuickRecall
                refreshKey={recallRefreshKey}
                onRecall={(text) => setInputValue(text)}
              />

              {/* 模块4：模板条 */}
              <FloatingTemplates onApply={handleApplyTemplate} />
            </div>
          </div>
        ) : (
          <button className="floating-inputbar-tab" onClick={toggleOpen} aria-label="展开输入栏">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 7l-5 5 5 5M17 7l-5 5 5 5" />
            </svg>
            {state.draftCount > 0 && (
              <span className="floating-inputbar-tab-badge">{state.draftCount}</span>
            )}
          </button>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FloatingInputBar.jsx
git commit -m "feat: 重写 FloatingInputBar 为模块化布局（归属+输入+回忆+模板）"
```

---

## Task 8: 全局挂载 FloatingInputBar 到 TabBarLayout

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 在 App.jsx 中导入 FloatingInputBar 和 useApp**

在 `src/App.jsx` 顶部 import 区追加：

```javascript
import FloatingInputBar from './components/FloatingInputBar'
import { useApp } from './context/AppContext'
```

- [ ] **Step 2: 修改 TabBarLayout 函数为全局挂载悬浮窗**

将 `TabBarLayout` 函数修改为：

```javascript
function TabBarLayout() {
  const { state } = useApp()
  return (
    <React.Fragment>
      <TabBar />
      <div className="page-wrapper" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <Outlet />
      </div>
      {/* 全局悬浮窗：仅在 floating 模式下渲染 */}
      {state.inputBarMode === 'floating' && <FloatingInputBar />}
    </React.Fragment>
  )
}
```

- [ ] **Step 3: 修改 Category.jsx 移除内部 FloatingInputBar 渲染**

在 `src/pages/Category.jsx` 约 L4921-4935 处，移除 floating 分支：

将：
```jsx
{state.inputBarMode === 'floating' ? (
  <FloatingInputBar
    value={inputValue}
    onChange={setInputValue}
    onSubmit={handleGenerate}
    onImageOCR={handleImageOCR}
    ocrLoading={ocrLoading}
    summaryLevel={summaryLevel}
    onSummaryLevelChange={setSummaryLevel}
    disabled={generating || hasActiveCardGenFlow}
    apiKey={state.apiKey}
    model={state.model}
    onToast={showToast}
  />
) : (
  <div style={{...}}>
    <div style={{...}}>
      <InputBar ... />
    </div>
  </div>
)}
```

修改为：
```jsx
{state.inputBarMode !== 'floating' && (
  <div style={{
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderTop: '1px solid var(--color-border)',
    boxShadow: '0 -2px 12px rgba(0, 0, 0, 0.06)',
    paddingBottom: 'env(safe-area-inset-bottom)',
  }}>
    <div style={{
      maxWidth: '540px',
      margin: '0 auto',
      padding: '4px 10px',
    }}>
      <InputBar
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleGenerate}
        onImageOCR={handleImageOCR}
        ocrLoading={ocrLoading}
        summaryLevel={summaryLevel}
        onSummaryLevelChange={setSummaryLevel}
        disabled={generating || hasActiveCardGenFlow}
        apiKey={state.apiKey}
        model={state.model}
        onToast={showToast}
      />
    </div>
  </div>
)}
```

同时移除 Category.jsx 顶部的 `import FloatingInputBar from '../components/FloatingInputBar'`。

- [ ] **Step 4: 验证编译**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: 编译通过，悬浮窗在所有 TabBar 页面可见

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/pages/Category.jsx
git commit -m "feat: FloatingInputBar 提升到 TabBarLayout 全局挂载"
```

---

## Task 9: FloatingDraftBanner（Category 页草稿提醒条）

**Files:**
- Create: `src/components/FloatingDraftBanner.jsx`
- Modify: `src/pages/Category.jsx`

- [ ] **Step 1: 创建 FloatingDraftBanner.jsx**

创建 `src/components/FloatingDraftBanner.jsx`：

```javascript
import { useState, useEffect } from 'react'
import { getPendingDraftsByCategory, deleteDraft } from '../services/db'
import { generateCardsFromDrafts } from '../services/draftService'

/**
 * Category 页面顶部草稿提醒条
 * 显示该分类下待生成的草稿数，提供「生成」和「查看」按钮
 */
export default function FloatingDraftBanner({
  categoryId,
  aiConfig,
  onGenerated,
  onToast,
}) {
  const [drafts, setDrafts] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const loadDrafts = async () => {
    if (!categoryId) return
    try {
      const list = await getPendingDraftsByCategory(categoryId)
      setDrafts(list)
    } catch (e) {
      console.warn('[DraftBanner] load failed:', e)
    }
  }

  useEffect(() => {
    loadDrafts()
  }, [categoryId])

  if (drafts.length === 0) return null

  const handleGenerate = async () => {
    setGenerating(true)
    setProgress({ current: 0, total: drafts.length })
    try {
      const result = await generateCardsFromDrafts(
        drafts.map(d => d.id),
        aiConfig,
        (current, total) => setProgress({ current, total }),
      )
      onToast?.(`生成完成：成功 ${result.success} 条，失败 ${result.failed} 条`, result.failed > 0 ? 'warn' : 'success')
      onGenerated?.()
      loadDrafts()
    } catch (e) {
      onToast?.('批量生成失败：' + e.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('删除这条草稿？')) return
    await deleteDraft(id)
    loadDrafts()
  }

  return (
    <div className="floating-draft-banner">
      <div className="floating-draft-banner-header">
        <span className="floating-draft-banner-text">
          📝 该分类下有 <strong>{drafts.length}</strong> 条草稿待生成
        </span>
        <div className="floating-draft-banner-actions">
          <button
            className="btn btn-xs btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? `生成中 ${progress.current}/${progress.total}` : '批量生成'}
          </button>
          <button
            className="btn btn-xs btn-outline"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? '收起' : '查看'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="floating-draft-banner-list">
          {drafts.map(d => (
            <div key={d.id} className="floating-draft-banner-item">
              <div className="floating-draft-banner-item-content" title={d.content}>
                {d.content.length > 60 ? d.content.slice(0, 60) + '...' : d.content}
              </div>
              <button
                className="floating-draft-banner-item-delete"
                onClick={() => handleDelete(d.id)}
                aria-label="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 在 Category.jsx 中挂载 FloatingDraftBanner**

在 `src/pages/Category.jsx` 顶部 import 区追加：

```javascript
import FloatingDraftBanner from '../components/FloatingDraftBanner'
```

在 Category.jsx 主内容区（Header 下方、Main 之前）插入：

```jsx
<FloatingDraftBanner
  categoryId={id}
  aiConfig={{
    apiKey: state.apiKey,
    model: state.model,
    aiServiceMode: state.aiServiceMode,
    sparkApiKey: state.iflytekSparkApiKey,
    sparkApiSecret: state.iflytekApiSecret,
    volcanoApiKey: state.volcanoApiKey,
    dashscopeApiKey: state.dashscopeApiKey,
    summaryLevel,
  }}
  onGenerated={loadCategories}
  onToast={showToast}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FloatingDraftBanner.jsx src/pages/Category.jsx
git commit -m "feat: 新增 FloatingDraftBanner 草稿提醒条"
```

---

## Task 10: 追加 CSS 样式

**Files:**
- Modify: `src/index.css` (在 .floating-inputbar-backdrop 之后追加)

- [ ] **Step 1: 在 index.css 末尾追加样式**

在 `src/index.css` 文件末尾追加：

```css
/* ============================================================
   悬浮窗 - 归属选择条 + 选择器 + 回忆条 + 模板条 + 草稿Banner
   ============================================================ */

/* 归属选择条 */
.floating-target-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: var(--radius-md, 10px);
  background: var(--color-primary-light, #e0e7ff);
  color: var(--color-primary, #3b82f6);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}
.floating-target-bar:active { opacity: 0.8; }
.floating-target-bar-empty {
  background: var(--color-border-light, #f3f4f6);
  color: var(--color-text-secondary, #6b7280);
}
.floating-target-bar-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-target-bar-arrow { font-size: 10px; }
.floating-target-bar-badge {
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

/* 归属选择器覆盖层 */
.floating-target-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-surface, #fff);
  z-index: 10;
  display: flex;
  flex-direction: column;
  border-radius: 14px 0 0 14px;
  overflow: hidden;
}
.floating-target-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-light, #e5e7eb);
}
.floating-target-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
.floating-target-close {
  background: none; border: none; font-size: 22px; cursor: pointer;
  color: var(--color-text-secondary); padding: 0 4px;
}
.floating-target-search { padding: 8px 12px; }
.floating-target-search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--color-surface);
  color: var(--color-text);
}
.floating-target-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 4px 0;
}
.floating-target-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);
  -webkit-tap-highlight-color: transparent;
}
.floating-target-row:active { background: var(--color-border-light); }
.floating-target-row-active { background: var(--color-primary-light); }
.floating-target-row-cat { font-weight: 600; font-size: 15px; }
.floating-target-row-chapter { padding-left: 24px; font-size: 13px; }
.floating-target-row-unit { padding-left: 48px; font-size: 12px; color: var(--color-text-secondary); }
.floating-target-arrow {
  width: 14px; font-size: 10px; color: var(--color-text-secondary);
  cursor: pointer;
}
.floating-target-icon { font-size: 14px; }
.floating-target-icon-indent { padding-left: 12px; }
.floating-target-icon-indent2 { padding-left: 24px; }
.floating-target-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-target-empty {
  padding: 20px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.floating-target-empty-sub {
  padding: 6px 12px 6px 60px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.floating-target-recent {
  border-top: 1px solid var(--color-border-light);
  padding: 8px 12px;
}
.floating-target-recent-title {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}
.floating-target-recent-item {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--color-text);
  cursor: pointer;
  border-radius: 6px;
}
.floating-target-recent-item:active { background: var(--color-border-light); }

/* 快速回忆条 */
.floating-recall {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border-top: 1px solid var(--color-border-light);
  margin-top: 8px;
}
.floating-recall-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.floating-recall-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1;
}
.floating-recall-item {
  padding: 4px 8px;
  background: var(--color-border-light);
  border-radius: 6px;
  font-size: 11px;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.floating-recall-item:active { opacity: 0.7; }

/* 模板条 */
.floating-template {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
}
.floating-template-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.floating-template-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1;
}
.floating-template-item {
  padding: 4px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 11px;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.floating-template-item:active { background: var(--color-border-light); }

/* 悬浮窗 Tab 上的草稿数红点 */
.floating-inputbar-tab-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
  font-weight: 600;
}

/* 拖动手柄提示 */
.floating-inputbar-handle-hint {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.5;
}

/* InputBar 内嵌容器（避免与现有样式冲突） */
.floating-inputbar-inputbar-wrapper {
  padding: 4px 0;
}

/* ============================================================
   Category 页草稿提醒条
   ============================================================ */
.floating-draft-banner {
  margin: 8px 12px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #f59e0b;
  border-radius: 10px;
  font-size: 13px;
}
.floating-draft-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.floating-draft-banner-text { color: #78350f; }
.floating-draft-banner-actions {
  display: flex;
  gap: 6px;
}
.floating-draft-banner-list {
  margin-top: 8px;
  border-top: 1px solid #f59e0b;
  padding-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}
.floating-draft-banner-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
}
.floating-draft-banner-item-content {
  flex: 1;
  font-size: 12px;
  color: #78350f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-draft-banner-item-delete {
  background: none;
  border: none;
  color: #b91c1c;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}
```

- [ ] **Step 2: 验证样式生效**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: 编译通过，悬浮窗在新样式下渲染

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: 追加悬浮窗归属条/选择器/回忆/模板/草稿Banner样式"
```

---

## Task 11: SQL 文件同步

**Files:**
- Modify: `需执行的SQl（完整版）.txt` (清空原内容后写入完整 SQL)
- Modify: `我需执行的SQl.txt（更新版）.txt` (清空原内容后写入新增 SQL)

- [ ] **Step 1: 写入完整版 SQL**

清空 `需执行的SQl（完整版）.txt` 内容，写入：

```sql
-- ============================================================
-- AI 背诵卡片 完整数据库 Schema（含 drafts 表 v13）
-- 更新时间：2026-07-04
-- 用途：Supabase / PostgreSQL 完整建表脚本
-- ============================================================

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 主题表
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 章节表
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 单元表
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 卡片表
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  front TEXT NOT NULL,
  back TEXT,
  knowledge_point TEXT,
  "order" INTEGER DEFAULT 0,
  type TEXT,
  options JSONB,
  answer_blank TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 卡片状态表
CREATE TABLE IF NOT EXISTS card_status (
  id TEXT PRIMARY KEY,
  card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  chapter_id TEXT,
  status TEXT DEFAULT 'new',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  mode TEXT
);

-- 收藏表
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 错题表
CREATE TABLE IF NOT EXISTS wrong_answers (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  unit_id TEXT,
  chapter_id TEXT,
  card_id TEXT,
  question_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 测试题库
CREATE TABLE IF NOT EXISTS test_questions (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  unit_id TEXT,
  chapter_id TEXT,
  card_id TEXT,
  test_type TEXT,
  target_id TEXT,
  user_id TEXT,
  pending_review BOOLEAN DEFAULT FALSE
);

-- 测试记录
CREATE TABLE IF NOT EXISTS test_records (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  unit_id TEXT,
  question_id TEXT,
  test_session_id TEXT,
  user_id TEXT,
  test_type TEXT,
  parent_record_id TEXT,
  redo_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 测试会话
CREATE TABLE IF NOT EXISTS test_sessions (
  id TEXT PRIMARY KEY,
  test_type TEXT,
  type_id TEXT,
  user_id TEXT,
  is_completed BOOLEAN DEFAULT FALSE
);

-- 复习历史
CREATE TABLE IF NOT EXISTS review_history (
  id TEXT PRIMARY KEY,
  card_id TEXT,
  category_id TEXT,
  chapter_id TEXT,
  was_mastered BOOLEAN,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  mode TEXT
);

-- 学习计划
CREATE TABLE IF NOT EXISTS study_plans (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  chapter_id TEXT,
  daily_review_limit INTEGER,
  daily_new_limit INTEGER,
  priority INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 联结题库历史
CREATE TABLE IF NOT EXISTS link_generation_runs (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  mode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- v13 新增：草稿表（悬浮窗快速录入）
-- ============================================================
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  chapter_id TEXT,
  unit_id TEXT,
  source TEXT DEFAULT 'floating',
  template_type TEXT,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  generated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drafts_category_id ON drafts(category_id);
CREATE INDEX IF NOT EXISTS idx_drafts_chapter_id ON drafts(chapter_id);
CREATE INDEX IF NOT EXISTS idx_drafts_unit_id ON drafts(unit_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_created_at ON drafts(created_at);
```

- [ ] **Step 2: 写入更新版 SQL（仅本次新增）**

清空 `我需执行的SQl.txt（更新版）.txt` 内容，写入：

```sql
-- ============================================================
-- 本次新增 SQL（v13 升级 - drafts 草稿表）
-- 执行时间：2026-07-04
-- 用途：悬浮窗快速录入系统的草稿暂存表
-- ============================================================

-- 创建 drafts 表
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  chapter_id TEXT,
  unit_id TEXT,
  source TEXT DEFAULT 'floating',
  template_type TEXT,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  generated_at TIMESTAMPTZ
);

-- 创建索引（提升按分类/状态查询性能）
CREATE INDEX IF NOT EXISTS idx_drafts_category_id ON drafts(category_id);
CREATE INDEX IF NOT EXISTS idx_drafts_chapter_id ON drafts(chapter_id);
CREATE INDEX IF NOT EXISTS idx_drafts_unit_id ON drafts(unit_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_created_at ON drafts(created_at);

-- 说明：
-- 1. 此表为本地 Dexie 与云端 Supabase 双向同步使用
-- 2. status 字段取值：pending（待生成）/ generating（生成中）/ done（已生成）/ failed（失败）
-- 3. retry_count 达到 3 次后停止自动重试，标记为 failed 等待用户手动重试
-- 4. 删除分类时级联删除该分类下所有草稿（ON DELETE CASCADE）
```

- [ ] **Step 3: Commit**

```bash
git add "需执行的SQl（完整版）.txt" "我需执行的SQl.txt（更新版）.txt"
git commit -m "docs: 同步 drafts 表 SQL（完整版+更新版）"
```

---

## Task 12: 文档分布.txt 更新

**Files:**
- Modify: `文档分布.txt`

- [ ] **Step 1: 在文档分布.txt 的「三、公共组件」区追加新组件**

在 `文档分布.txt` 的「三、公共组件 (components/)」区域，`UnitGroup.jsx` 之后追加：

```
src/components/FloatingInputBar.jsx (2026-07-04 重写)
  全局悬浮窗主组件（在 TabBarLayout 全局挂载，所有 TabBar 内页面可见）
  - 核心用途：快速录入知识点草稿，无需切换页面
  - 5大模块布局（自上而下）：
    1. 控制栏：拖动手柄（垂直拖拽 top 10%~90%）+ 收起按钮
    2. 归属选择条：📍分类▸章节▸单元，点击展开 FloatingTargetSelector 覆盖层
       - 显示当前草稿将归属的位置（必选，未选时高亮提示）
       - 右侧红点显示全局草稿数（state.draftCount）
    3. 输入栏：复用 InputBar.jsx（textarea+麦克风+拍照+相册+发送）
       - 发送 → 调用 draftService.saveDraft 存入 drafts 表 → 自动收起
    4. 快速回忆条（FloatingQuickRecall）：最近3条草稿，点击复用，长按删除
    5. 模板条（FloatingTemplates）：4种预设模板（名词解释/问答/历史事件/公式）
  - 状态：open（展开/收起）、posY（垂直位置）、showTargetSelector、inputValue
  - 持久化：localStorage 记忆最近3个归属（app_recent_targets）
  - 提交后自动收起 + 震动反馈（navigator.vibrate）
  → 定位: 归属选择条 → 见 floating-target-bar 类
  → 定位: 提交逻辑 → handleSubmit（调用 saveDraft）
  → 定位: 全局挂载 → App.jsx TabBarLayout

src/components/FloatingTargetSelector.jsx (2026-07-04 新增)
  三级归属选择器覆盖层（在 FloatingInputBar 内绝对定位覆盖）
  - 三级结构：分类（📁）→ 章节（📂）→ 单元（📄）
  - 默认全部折叠（符合用户选择A）
  - 懒加载：展开分类时才 getChaptersByCategory，展开章节时才 getUnitsByChapter
  - 关键词检索（不区分大小写）
  - 最近使用列表（最近3个归属，点击快速选中）
  - 选中态：floating-target-row-active 主色背景
  Props: currentTarget, recentTargets, onSelect, onClose

src/components/FloatingQuickRecall.jsx (2026-07-04 新增)
  快速回忆条（显示最近3条草稿）
  - 点击 → 复用内容到输入框
  - 长按600ms → 弹确认删除
  - 横向滚动展示
  Props: refreshKey（触发刷新）, onRecall（点击复用回调）

src/components/FloatingTemplates.jsx (2026-07-04 新增)
  模板条（4种预设输入模板）
  - 名词解释：[名词]→定义→特征→例子
  - 问答：[问题]→答案→考点
  - 历史事件：[时间]→事件→影响
  - 公式：[公式]→推导→应用场景
  Props: onApply(content, templateKey)

src/components/FloatingDraftBanner.jsx (2026-07-04 新增)
  Category 页面顶部草稿提醒条
  - 显示该分类下待生成草稿数
  - 「批量生成」按钮：调用 draftService.generateCardsFromDrafts，自动重试3次
  - 「查看」按钮：展开草稿列表，可删除单条
  - 生成进度显示：current/total
  - 生成完成回调 onGenerated（刷新分类数据）
  Props: categoryId, aiConfig, onGenerated, onToast

src/services/draftService.js (2026-07-04 新增)
  草稿业务逻辑服务
  - saveDraft(params)：保存一条草稿（悬浮窗发送入口）
  - generateCardsFromDrafts(draftIds, aiConfig, onProgress)：批量生成
    · 每条草稿独立调用 aiService.generateCards
    · 失败自动重试3次（间隔1秒）
    · 3次仍失败标记 status='failed' + errorMessage
    · 返回 { total, success, failed, results }
  - retryDraft(draftId, aiConfig)：重试单条失败草稿
  - getDraftStats()：返回 { pending, failed, total }
  - parseAiContentToCards(aiContent, draft)：解析AI返回为卡片数组（兼容JSON/纯文本）
  - 复用 db.js 的 addUnits（自动创建单元与卡片）
  依赖: db.js (drafts CRUD), aiService.js (generateCards)
```

并在「四、数据库与服务层」区域追加 drafts 表说明：

```
src/services/db.js (2026-07-04 v13 升级)
  v13 新增 drafts 表（悬浮窗快速录入草稿）
  - 字段：id, content, categoryId, chapterId, unitId, source, templateType,
          status(pending/generating/done/failed), retryCount, errorMessage,
          createdAt, generatedAt
  - 索引：categoryId, chapterId, unitId, status, retryCount, createdAt
  - API：addDraft, getPendingDrafts, getPendingDraftsByCategory, getRecentDrafts,
         getDraftCount, getDraftById, updateDraft, deleteDraft, deleteDraftsByStatus
```

- [ ] **Step 2: Commit**

```bash
git add 文档分布.txt
git commit -m "docs: 更新文档分布记录悬浮窗系统新增组件"
```

---

## Task 14: Android 系统悬浮窗权限与服务声明

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: 在 AndroidManifest.xml 中添加权限**

在 `<manifest>` 标签内、`<application>` 标签之前追加：

```xml
<!-- 系统悬浮窗权限（Android 6.0+ 需运行时引导用户授权） -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
```

- [ ] **Step 2: 在 AndroidManifest.xml 的 <application> 内注册系统悬浮窗服务**

在已有的 `TailscaleVpnService` 声明之后追加：

```xml
<!-- 系统悬浮窗前台服务（承载 WindowManager.addView） -->
<service
    android:name=".services.SystemFloatingWindowService"
    android:exported="false"
    android:foregroundServiceType="specialUse">
    <property
        android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
        android:value="floating_window_quick_input" />
</service>
```

- [ ] **Step 3: 验证 Manifest 合并**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app\android" && .\gradlew :app:processDebugManifest`
Expected: BUILD SUCCESSFUL，无 manifest merger 报错

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat: AndroidManifest 声明 SYSTEM_ALERT_WINDOW 权限与 SystemFloatingWindowService"
```

---

## Task 15: SystemFloatingWindowService 前台服务 + WindowManager + WebView

**Files:**
- Create: `android/app/src/main/java/com/eggli/flashcards/services/SystemFloatingWindowService.kt`

- [ ] **Step 1: 创建 SystemFloatingWindowService.kt**

创建 `android/app/src/main/java/com/eggli/flashcards/services/SystemFloatingWindowService.kt`：

```kotlin
package com.eggli.flashcards.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeActivity

class SystemFloatingWindowService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 2
        private const val CHANNEL_ID = "system_floating_window"
        private const val CHANNEL_NAME = "系统悬浮窗"
        private var windowManager: WindowManager? = null
        private var floatingView: View? = null
        private var webView: WebView? = null
        private var isShowing = false

        fun isShowing(): Boolean = isShowing

        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

        fun startService(context: Context) {
            if (!canDrawOverlays(context)) return
            val intent = Intent(context, SystemFloatingWindowService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, SystemFloatingWindowService::class.java)
            context.stopService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        showFloatingWindow()
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        hideFloatingWindow()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "系统悬浮窗快速录入服务"
                enableVibration(false)
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("快速录入已开启")
            .setContentText("点击其他应用的悬浮窗录入知识点")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()
    }

    private fun showFloatingWindow() {
        if (isShowing) return
        if (!canDrawOverlays(this)) return

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        // 计算悬浮窗尺寸（dp → px）
        val widthDp = 280
        val heightDp = 480
        val widthPx = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, widthDp.toFloat(), resources.displayMetrics
        ).toInt()
        val heightPx = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, heightDp.toFloat(), resources.displayMetrics
        ).toInt()

        // 创建 WebView
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            webChromeClient = WebChromeClient()
            webViewClient = WebViewClient()
            // 加载本地打包后的悬浮窗页面（Capacitor built 路径）
            loadUrl("file:///android_asset/public/floating-window.html")
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
        }

        // WindowManager.LayoutParams
        val layoutParams = WindowManager.LayoutParams(
            widthPx,
            heightPx,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            x = 0
            y = 0
        }

        // 设置触摸拖拽
        setupDragListener(webView!!, layoutParams)

        windowManager?.addView(webView, layoutParams)
        floatingView = webView
        isShowing = true
    }

    private fun setupDragListener(view: View, params: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        isDragging = true
                        params.x = initialX - dx.toInt()
                        params.y = initialY + dy.toInt()
                        windowManager?.updateViewLayout(view, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    // 如果未拖动，则视为点击，交给 WebView 处理
                    !isDragging
                }
                else -> false
            }
        }
    }

    private fun hideFloatingWindow() {
        floatingView?.let {
            windowManager?.removeView(it)
        }
        floatingView = null
        webView?.destroy()
        webView = null
        isShowing = false
    }

    /**
     * 切换悬浮窗显示/隐藏（通过 JS Bridge 调用）
     */
    fun toggleVisibility() {
        if (isShowing) {
            hideFloatingWindow()
        } else {
            showFloatingWindow()
        }
    }
}
```

- [ ] **Step 2: 验证 Kotlin 编译**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app\android" && .\gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/eggli/flashcards/services/SystemFloatingWindowService.kt
git commit -m "feat: 新增 SystemFloatingWindowService（前台服务+WindowManager+WebView）"
```

---

## Task 16: SystemFloatingWindowPlugin Capacitor 插件

**Files:**
- Create: `android/app/src/main/java/com/eggli/flashcards/plugins/SystemFloatingWindowPlugin.kt`

- [ ] **Step 1: 创建 SystemFloatingWindowPlugin.kt**

创建 `android/app/src/main/java/com/eggli/flashcards/plugins/SystemFloatingWindowPlugin.kt`：

```kotlin
package com.eggli.flashcards.plugins

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.eggli.flashcards.services.SystemFloatingWindowService

@CapacitorPlugin(name = "SystemFloatingWindow")
class SystemFloatingWindowPlugin : Plugin() {

    @PluginMethod
    fun canDrawOverlays(call: PluginCall) {
        val result = JSObject()
        result.put("granted", SystemFloatingWindowService.canDrawOverlays(context))
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(context)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + context.packageName)
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                call.resolve(JSObject().put("opened", true))
            } else {
                call.resolve(JSObject().put("opened", false).put("granted", true))
            }
        } else {
            call.resolve(JSObject().put("opened", false).put("granted", true))
        }
    }

    @PluginMethod
    fun show(call: PluginCall) {
        if (!SystemFloatingWindowService.canDrawOverlays(context)) {
            call.reject("未授权 SYSTEM_ALERT_WINDOW 权限")
            return
        }
        SystemFloatingWindowService.startService(context)
        call.resolve(JSObject().put("shown", true))
    }

    @PluginMethod
    fun hide(call: PluginCall) {
        SystemFloatingWindowService.stopService(context)
        call.resolve(JSObject().put("hidden", true))
    }

    @PluginMethod
    fun isShowing(call: PluginCall) {
        call.resolve(JSObject().put("showing", SystemFloatingWindowService.isShowing()))
    }
}
```

- [ ] **Step 2: 在 MainActivity 中注册插件**

在 `android/app/src/main/java/com/eggli/flashcards/MainActivity.java`（或 .kt）中追加注册：

```java
import com.eggli.flashcards.plugins.SystemFloatingWindowPlugin;

// 在 onCreate 的 registerPlugins 调用位置追加：
this.registerPlugin(SystemFloatingWindowPlugin.class);
```

或在 `android/app/src/main/assets/capacitor.plugins.json` 中追加：

```json
{
  "pkg": "com.eggli.flashcards.plugins.SystemFloatingWindowPlugin",
  "classpath": "com.eggli.flashcards.plugins.SystemFloatingWindowPlugin",
  "name": "SystemFloatingWindow"
}
```

- [ ] **Step 3: 验证编译**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app\android" && .\gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/eggli/flashcards/plugins/SystemFloatingWindowPlugin.kt android/app/src/main/assets/capacitor.plugins.json
git commit -m "feat: 新增 SystemFloatingWindowPlugin Capacitor 插件"
```

---

## Task 17: 系统悬浮窗 JS 封装与独立页面

**Files:**
- Create: `src/services/systemFloatingWindow.js`
- Create: `src/pages/FloatingWindowPage.jsx`

- [ ] **Step 1: 创建 systemFloatingWindow.js（Capacitor 插件 JS 封装）**

创建 `src/services/systemFloatingWindow.js`：

```javascript
import { Capacitor } from '@capacitor/core'

/**
 * 系统悬浮窗服务封装
 * 仅在 Android 原生平台可用，Web浏览器自动降级为应用内悬浮窗
 */
export async function isSystemFloatingSupported() {
  try {
    const { SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    return Capacitor.isNativePlatform()
  } catch (_) {
    return false
  }
}

export async function canDrawOverlays() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    const result = await SystemFloatingWindow.canDrawOverlays()
    return result.granted
  } catch (_) {
    return false
  }
}

export async function requestOverlayPermission() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    const result = await SystemFloatingWindow.requestPermission()
    return result.granted || false
  } catch (_) {
    return false
  }
}

export async function showSystemFloating() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    await SystemFloatingWindow.show()
    return true
  } catch (e) {
    console.warn('[SystemFloating] show failed:', e)
    return false
  }
}

export async function hideSystemFloating() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    await SystemFloatingWindow.hide()
    return true
  } catch (_) {
    return false
  }
}

export async function isSystemFloatingShowing() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { SystemFloatingWindow } = await import('../plugins/SystemFloatingWindowPlugin')
    const result = await SystemFloatingWindow.isShowing()
    return result.showing
  } catch (_) {
    return false
  }
}
```

同时创建 `src/plugins/SystemFloatingWindowPlugin.ts`（Capacitor 插件定义，仅 TypeScript 接口）：

```typescript
import { registerPlugin } from '@capacitor/core'

export interface SystemFloatingWindowPlugin {
  canDrawOverlays(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ opened: boolean, granted?: boolean }>
  show(): Promise<{ shown: boolean }>
  hide(): Promise<{ hidden: boolean }>
  isShowing(): Promise<{ showing: boolean }>
}

const SystemFloatingWindow = registerPlugin<SystemFloatingWindowPlugin>('SystemFloatingWindow')

export default SystemFloatingWindow
```

- [ ] **Step 2: 创建 FloatingWindowPage.jsx（系统悬浮窗 WebView 加载的独立页面）**

创建 `src/pages/FloatingWindowPage.jsx`：

```javascript
import { useState, useEffect, useCallback } from 'react'
import { saveDraft } from '../services/draftService'
import { getRecentDrafts, deleteDraft, getCategories, getChaptersByCategory, getUnitsByChapter } from '../services/db'
import FloatingTargetSelector from '../components/FloatingTargetSelector'
import FloatingQuickRecall from '../components/FloatingQuickRecall'
import FloatingTemplates from '../components/FloatingTemplates'

/**
 * 系统悬浮窗 WebView 加载的独立页面（轻量级，无路由依赖）
 * 通过 URL 参数访问：/floating-window
 * 自适应透明背景（在 WebView 中渲染）
 */
export default function FloatingWindowPage() {
  const [inputValue, setInputValue] = useState('')
  const [currentTarget, setCurrentTarget] = useState(null)
  const [showTargetSelector, setShowTargetSelector] = useState(false)
  const [recentTargets, setRecentTargets] = useState([])
  const [recallRefreshKey, setRecallRefreshKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // 从 localStorage 加载归属
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('app_current_target') || 'null')
      setCurrentTarget(stored)
      const recent = JSON.parse(localStorage.getItem('app_recent_targets') || '[]')
      setRecentTargets(recent.slice(0, 3))
    } catch (_) {}
  }, [])

  const handleSelectTarget = useCallback((target) => {
    setCurrentTarget(target)
    setShowTargetSelector(false)
    localStorage.setItem('app_current_target', JSON.stringify(target))
    setRecentTargets(prev => {
      const filtered = prev.filter(t =>
        !(t.categoryId === target.categoryId &&
          (t.chapterId || null) === (target.chapterId || null) &&
          (t.unitId || null) === (target.unitId || null))
      )
      const next = [target, ...filtered].slice(0, 3)
      localStorage.setItem('app_recent_targets', JSON.stringify(next))
      return next
    })
  }, [])

  const handleApplyTemplate = useCallback((content) => {
    setInputValue(prev => prev ? prev + '\n' + content : content)
  }, [])

  const handleSubmit = useCallback(async () => {
    const content = inputValue.trim()
    if (!content) return
    if (!currentTarget?.categoryId) {
      setShowTargetSelector(true)
      return
    }
    setSubmitting(true)
    try {
      await saveDraft({
        content,
        categoryId: currentTarget.categoryId,
        chapterId: currentTarget.chapterId,
        unitId: currentTarget.unitId,
        source: 'system-floating',
      })
      setInputValue('')
      setRecallRefreshKey(k => k + 1)
      // 系统悬浮窗场景不收起（保持快速录入状态）
      if (navigator.vibrate) navigator.vibrate(50)
      // 显示 Toast
      showToast('已保存草稿')
    } catch (e) {
      showToast('保存失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }, [inputValue, currentTarget])

  const showToast = (msg) => {
    const toast = document.createElement('div')
    toast.style.cssText = `
      position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: white; padding: 6px 12px;
      border-radius: 6px; font-size: 12px; z-index: 9999;
    `
    toast.textContent = msg
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 1500)
  }

  const targetText = currentTarget
    ? `📍 ${currentTarget.categoryName}${currentTarget.chapterName ? ' ▸ ' + currentTarget.chapterName : ''}${currentTarget.unitName ? ' ▸ ' + currentTarget.unitName : ''}`
    : '📍 点击选择归属'

  return (
    <div className="floating-window-page">
      {/* 控制栏 */}
      <div className="floating-window-header">
        <span className="floating-window-title">快速录入</span>
        <button
          className="floating-window-close"
          onClick={() => {
            if (window.Capacitor) {
              // 通知原生层隐藏悬浮窗
              import('../services/systemFloatingWindow').then(m => m.hideSystemFloating())
            }
          }}
        >
          ×
        </button>
      </div>

      {/* 归属条 */}
      <div
        className={'floating-target-bar' + (!currentTarget ? ' floating-target-bar-empty' : '')}
        onClick={() => setShowTargetSelector(true)}
      >
        <span className="floating-target-bar-text">{targetText}</span>
        <span className="floating-target-bar-arrow">▼</span>
      </div>

      {showTargetSelector && (
        <FloatingTargetSelector
          currentTarget={currentTarget}
          recentTargets={recentTargets}
          onSelect={handleSelectTarget}
          onClose={() => setShowTargetSelector(false)}
        />
      )}

      {/* 输入区（轻量 textarea，不复用 InputBar 避免依赖过多） */}
      <textarea
        className="floating-window-textarea"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        placeholder="输入知识点..."
        rows={5}
        autoFocus
      />

      <button
        className="floating-window-submit-btn"
        onClick={handleSubmit}
        disabled={submitting || !inputValue.trim()}
      >
        {submitting ? '保存中...' : '↑ 保存草稿'}
      </button>

      <FloatingQuickRecall
        refreshKey={recallRefreshKey}
        onRecall={(text) => setInputValue(text)}
      />

      <FloatingTemplates onApply={handleApplyTemplate} />
    </div>
  )
}
```

- [ ] **Step 3: 在 App.jsx 中添加 /floating-window 路由**

在 `src/App.jsx` 的 `<Route element={<TabBarLayout />}>` 之外（顶层 Routes 内）添加：

```jsx
<Route path="/floating-window" element={<FloatingWindowPage />} />
```

并在 import 区追加：
```javascript
import FloatingWindowPage from './pages/FloatingWindowPage'
```

- [ ] **Step 4: 在 vite.config.js 中确保 floating-window.html 被打包**

如果使用 Vite 多页面入口，需在 `vite.config.js` 中添加 rollupOptions input：

```javascript
build: {
  rollupOptions: {
    input: {
      main: path.resolve(__dirname, 'index.html'),
      floatingWindow: path.resolve(__dirname, 'floating-window.html'),
    },
  },
},
```

并在项目根目录创建 `floating-window.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>快速录入</title>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    #root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/floating-window-main.jsx"></script>
</body>
</html>
```

创建 `src/floating-window-main.jsx`：

```javascript
import React from 'react'
import { createRoot } from 'react-dom/client'
import FloatingWindowPage from './pages/FloatingWindowPage'
import './floating-window.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FloatingWindowPage />
  </React.StrictMode>
)
```

- [ ] **Step 5: 验证编译**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: 编译通过，访问 /floating-window 显示悬浮窗页面

- [ ] **Step 6: Commit**

```bash
git add src/services/systemFloatingWindow.js src/plugins/SystemFloatingWindowPlugin.ts src/pages/FloatingWindowPage.jsx src/floating-window-main.jsx floating-window.html src/App.jsx vite.config.js
git commit -m "feat: 系统悬浮窗 JS 封装 + 独立页面 + 路由配置"
```

---

## Task 18: SettingsDisplay 新增「系统悬浮窗」模式

**Files:**
- Modify: `src/pages/SettingsDisplay.jsx`

- [ ] **Step 1: 在 SettingsDisplay.jsx 中新增「系统悬浮窗」选项**

在「输入栏模式切换」区域，将原有的 `fixed` / `floating` 两个选项扩展为三个：

```jsx
// 原：
// const inputBarModes = [
//   { value: 'fixed', label: '固定底部' },
//   { value: 'floating', label: '悬浮窗' },
// ]

// 改为：
const inputBarModes = [
  { value: 'fixed', label: '固定底部' },
  { value: 'floating', label: '应用内悬浮' },
  { value: 'system', label: '系统悬浮（其他App可见）' },
]
```

- [ ] **Step 2: 在选择「系统悬浮」时引导用户授权 SYSTEM_ALERT_WINDOW**

在 inputBarMode 切换的 handler 中追加：

```javascript
const handleInputBarModeChange = useCallback(async (mode) => {
  if (mode === 'system') {
    const { isSystemFloatingSupported, canDrawOverlays, requestOverlayPermission } = await import('../services/systemFloatingWindow')
    const supported = await isSystemFloatingSupported()
    if (!supported) {
      showToast('系统悬浮窗仅在 Android APP 中可用，已为您切换为应用内悬浮', 'warn')
      setInputBarMode('floating')
      return
    }
    const granted = await canDrawOverlays()
    if (!granted) {
      const opened = await requestOverlayPermission()
      if (opened) {
        showToast('请在系统设置中授权"显示在其他应用上层"后返回', 'info')
      }
      return
    }
    // 授权通过，启动系统悬浮窗服务
    const { showSystemFloating } = await import('../services/systemFloatingWindow')
    await showSystemFloating()
    setInputBarMode('system')
  } else {
    // 切换到其他模式时，停止系统悬浮窗
    if (state.inputBarMode === 'system') {
      const { hideSystemFloating } = await import('../services/systemFloatingWindow')
      await hideSystemFloating()
    }
    setInputBarMode(mode)
  }
}, [state.inputBarMode, setInputBarMode, showToast])
```

- [ ] **Step 3: 验证编译**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: 编译通过，设置页可切换「系统悬浮」模式

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsDisplay.jsx
git commit -m "feat: SettingsDisplay 新增系统悬浮窗模式与权限引导"
```

---

## Task 13: 端到端验证

- [ ] **Step 1: 启动 dev server 验证编译**

Run: `cd "C:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app" && npm run dev`
Expected: VITE 编译成功无错误

- [ ] **Step 2: 在浏览器中验证应用内悬浮窗流程**

打开 http://localhost:5173/，依次验证：
1. 设置 → 显示与偏好 → 输入栏模式切换为「应用内悬浮」
2. 切换到任意页面（首页/背诵/统计），右侧出现悬浮Tab
3. 点击Tab展开，显示「📍 点击选择归属」
4. 点击归属条 → 弹出选择器，默认全部折叠
5. 展开分类 → 展开章节 → 选择单元
6. 归属条显示「📍 分类 ▸ 章节 ▸ 单元」
7. 输入文本，点击发送 → Toast 提示 + 悬浮窗收起 + Tab 显示红点「1」
8. 进入对应分类页面，顶部显示草稿Banner「该分类下有1条草稿待生成」
9. 点击「批量生成」→ 进度显示 → 完成 Toast
10. 草稿Banner消失，Tab红点消失

- [ ] **Step 3: 在 APK 中验证系统悬浮窗流程**

1. 打包 debug APK 并安装
2. 进入设置 → 显示与偏好 → 输入栏模式选择「系统悬浮」
3. 系统弹出「显示在其他应用上层」授权页面 → 开启权限 → 返回
4. 切换到其他应用（如浏览器、微信），悬浮窗在右侧可见
5. 点击悬浮窗 → 输入知识点 → 点击保存草稿
6. Toast 显示「已保存草稿」
7. 切回 App → 进入对应分类 → 草稿Banner 显示待生成数量
8. 点击批量生成 → AI 调用 → 卡片入库

- [ ] **Step 4: 验证不影响现有功能**

1. 切换输入栏模式为「固定」，悬浮窗消失，Category 页底部固定栏正常
2. 现有 handleGenerate 流程（Category 页直接输入）不受影响
3. 移动端APK其他功能不受影响（Tailscale/语音/背诵/检测等）

- [ ] **Step 5: 打开预览（热更新模式）**

使用内置浏览器打开 http://localhost:5173/ 预览效果（系统悬浮窗需 APK 测试）

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "test: 悬浮窗草稿系统端到端验证通过（含系统悬浮窗）"
```

---

## Self-Review

**1. Spec coverage（规格覆盖）：**
- ✅ 全局可见（应用内）：Task 8（TabBarLayout 全局挂载）
- ✅ 在其他App可见（系统级）：Task 14-18（WindowManager + WebView + 权限引导）
- ✅ 自动收起：Task 7 handleSubmit 中 setOpen(false)（应用内）+ Task 17 handleSubmit 不收起（系统级保持录入）
- ✅ 必须先选归属：Task 7/17 handleSubmit 校验 + Task 4 选择器
- ✅ 自动重试3次：Task 2 generateCardsFromDrafts 循环 attempt 1-3
- ✅ 标红手动重试：Task 2 status='failed' + Task 9 Banner 显示失败
- ✅ 三级导航默认折叠：Task 4 expandedCats 初始为 {}
- ✅ 复用 InputBar（应用内）：Task 7 直接 <InputBar />
- ✅ 系统悬浮窗轻量页面：Task 17 FloatingWindowPage
- ✅ 快速回忆条：Task 5
- ✅ 模板条：Task 6
- ✅ SQL 同步：Task 11
- ✅ 文档更新：Task 12

**2. Placeholder scan：** 无 TBD/TODO，所有代码片段完整

**3. Type consistency：**
- currentTarget 字段统一：{ categoryId, categoryName, chapterId, chapterName, unitId, unitName }
- draft 对象字段统一：{ id, content, categoryId, chapterId, unitId, status, retryCount, errorMessage, createdAt, generatedAt }
- generateCardsFromDrafts 签名一致：(draftIds, aiConfig, onProgress)
- saveDraft 签名一致：({ content, categoryId, chapterId, unitId, source, templateType })
- SystemFloatingWindowPlugin 方法一致：canDrawOverlays / requestPermission / show / hide / isShowing

**4. 双模式降级链路：**
- Web浏览器：inputBarMode=system → 自动降级为 floating（Task 18 检测 isSystemFloatingSupported）
- APK未授权：引导用户授权，授权前不切换模式
- APK已授权：启动 SystemFloatingWindowService，加载 /floating-window.html

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-floating-inputbar-draft-system.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 Task 派发独立 subagent，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中按 Task 顺序执行，带 checkpoint 审查

**Which approach?**
