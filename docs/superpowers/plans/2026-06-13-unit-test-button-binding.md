# 单元检测功能集成与按钮绑定 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 UnitTestMain 页面和 testQuestionService 服务，为所有按钮绑定点击事件，实现完整的单元检测主页面功能。

**Architecture:** 增量修改 db.js 添加 testQuestions 表；新建 testQuestionService.js（updateQuestionBank + getReviewQuestions）；新建 UnitTestMain.jsx（复用 Home.jsx 布局风格）；修改 App.jsx 添加"检测"Tab 和路由；创建两个占位页面（WrongQuestionsPage、QuestionBankPage）。

**Tech Stack:** React 19.2.6 + React Router DOM 7.17.0 + Dexie.js (IndexedDB)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/services/db.js` | 修改 | 新增 testQuestions 表（v3 升级） |
| `src/services/testQuestionService.js` | 新建 | 题库服务：updateQuestionBank + getReviewQuestions |
| `src/pages/UnitTestMain.jsx` | 新建 | 单元检测主页面，绑定所有按钮 |
| `src/pages/WrongQuestionsPage.jsx` | 新建 | 错题本占位页面 |
| `src/pages/QuestionBankPage.jsx` | 新建 | 题库管理占位页面 |
| `src/App.jsx` | 修改 | 新增"检测"Tab + 路由 + 导入 |

---

### Task 1: 修改 db.js — 新增 testQuestions 表

**Files:**
- Modify: `src/services/db.js`

- [ ] **Step 1: 在 db.version(2) 之后新增 v3 升级**

在 `db.version(2).stores({...})` 之后（约第37行），新增 v3 版本：

```js
db.version(3).stores({
  categories: '&id, name, createdAt',
  units: '&id, categoryId, name, createdAt, order',
  cards: '&id, unitId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
  cardStatus:
    '&id, cardId, categoryId, [cardId+categoryId], status, updatedAt, reviewCount, easeFactor, interval, repetitions, lastReviewedAt, nextReviewAt, difficulty, wrongCount, wrongStreak',
  bookmarks: '&id, cardId, createdAt',
  wrongAnswers: '&id, cardId, categoryId, count, lastWrongAt',
  testRecords: '&id, categoryId, unitId, userId, createdAt, type',
  testQuestions: '&id, cardId, categoryId, unitId, type, question, options, answer, createdAt, expiresAt',
  ocrCache: 'imageHash, timestamp',
})
```

- [ ] **Step 2: 在 tableRefs 中新增 testQuestions 引用**

在文件末尾 `tableRefs` 对象中（约第546行），新增：

```js
testQuestions: db.testQuestions,
```

- [ ] **Step 3: 新增 testQuestions 相关 CRUD 方法**

在文件末尾 `export default db` 之前，新增：

```js
// ========== 测试题目 (testQuestions) ==========

// 保存题目
export async function saveTestQuestion(question) {
  const q = {
    id: question.id || generateId(),
    cardId: question.cardId || '',
    categoryId: question.categoryId || '',
    unitId: question.unitId || '',
    type: question.type || 'single', // single | multiple | blank | truefalse
    question: question.question || '',
    options: question.options || [], // JSON array
    answer: question.answer || '',
    createdAt: question.createdAt || Date.now(),
    expiresAt: question.expiresAt || null,
  }
  await db.testQuestions.add(q)
  return q
}

// 批量保存题目
export async function saveTestQuestions(questions) {
  if (!questions || questions.length === 0) return []
  const now = Date.now()
  const items = questions.map(q => ({
    id: q.id || generateId(),
    cardId: q.cardId || '',
    categoryId: q.categoryId || '',
    unitId: q.unitId || '',
    type: q.type || 'single',
    question: q.question || '',
    options: q.options || [],
    answer: q.answer || '',
    createdAt: q.createdAt || now,
    expiresAt: q.expiresAt || null,
  }))
  await db.testQuestions.bulkAdd(items)
  return items
}

// 获取某分类/单元的题目
export async function getTestQuestions(categoryId, unitId) {
  let query = db.testQuestions
  if (categoryId) {
    query = query.where('categoryId').equals(categoryId)
  }
  const all = await query.toArray()
  if (unitId) {
    return all.filter(q => q.unitId === unitId)
  }
  return all
}

// 获取某分类/单元的题目数量
export async function getTestQuestionCount(categoryId, unitId) {
  const all = await getTestQuestions(categoryId, unitId)
  return all.length
}

// 删除某分类/单元的题目
export async function deleteTestQuestions(categoryId, unitId) {
  if (unitId) {
    await db.testQuestions.where('unitId').equals(unitId).delete()
  } else if (categoryId) {
    await db.testQuestions.where('categoryId').equals(categoryId).delete()
  }
}

// 清空所有题目
export async function clearAllTestQuestions() {
  await db.testQuestions.clear()
}
```

- [ ] **Step 4: 验证构建**

```bash
cd ai-flashcard-app && npm run build
```

预期：Build 成功，无 warning。

---

### Task 2: 创建 testQuestionService.js

**Files:**
- Create: `src/services/testQuestionService.js`

- [ ] **Step 1: 创建完整服务文件**

```js
import { generateId } from '../utils/helpers'
import * as db from './db'

/**
 * 更新题库 - 为指定分类/单元生成题目
 * @param {'unit'|'category'} testType - 检测类型
 * @param {String} id - 单元ID或分类ID
 * @param {Object} options - 可选配置
 * @returns {Promise<{success: boolean, message: string, count?: number}>}
 */
export async function updateQuestionBank(testType, id, options = {}) {
  try {
    // 获取卡片数据
    let cards = []
    if (testType === 'unit') {
      cards = await db.getCardsByUnit(id)
    } else {
      cards = await db.getAllCardsByCategory(id)
    }

    if (!cards || cards.length === 0) {
      return { success: false, message: '没有找到相关知识点，请先添加卡片' }
    }

    // TODO: 后续实现 AI 生成题目逻辑
    // 当前返回成功提示（占位实现）
    return {
      success: true,
      message: `题库更新成功，共 ${cards.length} 个知识点可用于生成题目`,
      count: cards.length,
    }
  } catch (e) {
    console.error('[testQuestionService] updateQuestionBank 失败:', e)
    return { success: false, message: e.message || '题库更新失败' }
  }
}

/**
 * 获取复习题目 - 从 testQuestions 表中随机抽取题目
 * @param {'unit'|'category'} testType - 检测类型
 * @param {String} id - 单元ID或分类ID
 * @returns {Promise<{success: boolean, message: string, questions?: Array}>}
 */
export function getReviewQuestions(testType, id) {
  return new Promise(async (resolve) => {
    try {
      // 获取本地题库题目
      let questions = []
      if (testType === 'unit') {
        questions = await db.getTestQuestions(null, id)
      } else {
        questions = await db.getTestQuestions(id, null)
      }

      // 过滤过期题目
      const now = Date.now()
      questions = questions.filter(q => !q.expiresAt || q.expiresAt > now)

      if (questions.length === 0) {
        resolve({ success: false, message: '暂无复习题目，请先更新题库' })
        return
      }

      // 同一 cardId 相关题目最多出现 2 次
      const cardIdCount = {}
      const filtered = []
      for (const q of questions) {
        const cid = q.cardId
        const count = cardIdCount[cid] || 0
        if (count < 2) {
          filtered.push(q)
          cardIdCount[cid] = count + 1
        }
      }

      // 随机打乱
      const shuffled = filtered.sort(() => Math.random() - 0.5)

      resolve({
        success: true,
        message: `成功抽取 ${shuffled.length} 道复习题目`,
        questions: shuffled,
      })
    } catch (e) {
      console.error('[testQuestionService] getReviewQuestions 失败:', e)
      resolve({ success: false, message: e.message || '获取复习题目失败' })
    }
  })
}
```

- [ ] **Step 2: 验证构建**

```bash
cd ai-flashcard-app && npm run build
```

预期：Build 成功，无 warning。

---

### Task 3: 创建 WrongQuestionsPage.jsx 占位页面

**Files:**
- Create: `src/pages/WrongQuestionsPage.jsx`

- [ ] **Step 1: 创建占位页面**

```jsx
import { useNavigate } from 'react-router-dom'

export default function WrongQuestionsPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onSelectStart={(e) => e.preventDefault()}
    >
      <div className="page-container" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        padding: '20px 16px 120px',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => navigate('/test')}
            style={{
              width: '44px', height: '44px', borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon" style={{
            width: '88px', height: '88px', borderRadius: '24px',
            backgroundColor: 'var(--color-surface)',
            border: '1.5px dashed var(--color-border)',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <p className="empty-state-title">我的错题本</p>
          <p className="empty-state-desc">错题本功能即将上线，敬请期待</p>
        </div>
      </div>
    </div>
  )
}
```

---

### Task 4: 创建 QuestionBankPage.jsx 占位页面

**Files:**
- Create: `src/pages/QuestionBankPage.jsx`

- [ ] **Step 1: 创建占位页面**

```jsx
import { useNavigate } from 'react-router-dom'

export default function QuestionBankPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onSelectStart={(e) => e.preventDefault()}
    >
      <div className="page-container" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        padding: '20px 16px 120px',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => navigate('/test')}
            style={{
              width: '44px', height: '44px', borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon" style={{
            width: '88px', height: '88px', borderRadius: '24px',
            backgroundColor: 'var(--color-surface)',
            border: '1.5px dashed var(--color-border)',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <p className="empty-state-title">题库管理</p>
          <p className="empty-state-desc">题库管理功能即将上线，敬请期待</p>
        </div>
      </div>
    </div>
  )
}
```

---

### Task 5: 创建 UnitTestMain.jsx 主页面

**Files:**
- Create: `src/pages/UnitTestMain.jsx`

- [ ] **Step 1: 创建完整页面组件（含所有按钮绑定）**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getUnitsByCategory, getCardCountByCategory, getCardsByUnit } from '../services/db'
import { updateQuestionBank, getReviewQuestions } from '../services/testQuestionService'
import UnitGroup from '../components/UnitGroup'

export default function UnitTestMain() {
  const { state, showToast } = useApp()
  const navigate = useNavigate()
  const [unitData, setUnitData] = useState({})  // { categoryId: [{ unit, cardCount }] }
  const [cardCounts, setCardCounts] = useState({})  // { categoryId: count }
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState('') // 当前加载操作描述

  // 加载所有分类的单元数据
  useEffect(() => {
    const loadData = async () => {
      const counts = {}
      const data = {}
      for (const cat of state.categories) {
        try {
          counts[cat.id] = await getCardCountByCategory(cat.id)
          const units = await getUnitsByCategory(cat.id)
          const enrichedUnits = await Promise.all(
            units.map(async (unit) => {
              const cards = await getCardsByUnit(unit.id)
              return { ...unit, cardCount: cards.length }
            })
          )
          data[cat.id] = enrichedUnits
        } catch (e) {
          console.error('加载单元数据失败:', e)
          data[cat.id] = []
          counts[cat.id] = 0
        }
      }
      setUnitData(data)
      setCardCounts(counts)
    }
    if (state.categories.length > 0) {
      loadData()
    } else {
      setUnitData({})
      setCardCounts({})
    }
  }, [state.categories])

  // ========== 按钮事件处理 ==========

  /** 更新题库 */
  const handleUpdateBank = useCallback(async (type, id, name) => {
    setLoading(true)
    setLoadingAction(`正在更新"${name}"题库...`)
    try {
      const result = await updateQuestionBank(type, id)
      if (result.success) {
        showToast(result.message, 'success')
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('题库更新失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [showToast])

  /** 单元检测：先更新题库 → 成功后跳转 UnitTestPage */
  const handleUnitTest = useCallback(async (unitId, unitName) => {
    setLoading(true)
    setLoadingAction(`正在准备"${unitName}"单元检测...`)
    try {
      const result = await updateQuestionBank('unit', unitId)
      if (result.success) {
        showToast('题库更新成功，正在进入检测...', 'success')
        // 跳转到 UnitTestPage（待后续实现）
        navigate('/test/unit/' + unitId)
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('单元检测准备失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [navigate, showToast])

  /** 分类检测：先更新题库 → 成功后跳转 UnitTestPage */
  const handleCategoryTest = useCallback(async (catId, catName) => {
    setLoading(true)
    setLoadingAction(`正在准备"${catName}"分类检测...`)
    try {
      const result = await updateQuestionBank('category', catId)
      if (result.success) {
        showToast('题库更新成功，正在进入检测...', 'success')
        // 跳转到 UnitTestPage（待后续实现）
        navigate('/test/category/' + catId)
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('分类检测准备失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [navigate, showToast])

  /** 单元复习：直接获取复习题目 → 跳转 UnitTestPage */
  const handleUnitReview = useCallback(async (unitId, unitName) => {
    setLoading(true)
    setLoadingAction(`正在准备"${unitName}"单元复习...`)
    try {
      const result = await getReviewQuestions('unit', unitId)
      if (result.success) {
        showToast(result.message, 'success')
        // 跳转到 UnitTestPage（待后续实现）
        navigate('/test/review/unit/' + unitId)
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('单元复习准备失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [navigate, showToast])

  /** 分类复习：直接获取复习题目 → 跳转 UnitTestPage */
  const handleCategoryReview = useCallback(async (catId, catName) => {
    setLoading(true)
    setLoadingAction(`正在准备"${catName}"分类复习...`)
    try {
      const result = await getReviewQuestions('category', catId)
      if (result.success) {
        showToast(result.message, 'success')
        // 跳转到 UnitTestPage（待后续实现）
        navigate('/test/review/category/' + catId)
      } else {
        showToast(result.message, 'error')
      }
    } catch (e) {
      showToast('分类复习准备失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }, [navigate, showToast])

  // ========== 渲染函数 ==========

  // 分类级操作按钮
  const renderCategoryActions = (cat) => (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
      <button
        className="btn btn-sm"
        style={{
          minHeight: '44px', fontSize: 'var(--text-xs)', padding: '6px 12px',
          backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
          border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 500,
        }}
        onClick={(e) => { e.stopPropagation(); handleCategoryTest(cat.id, cat.name) }}
        disabled={loading}
      >
        分类检测
      </button>
      <button
        className="btn btn-sm"
        style={{
          minHeight: '44px', fontSize: 'var(--text-xs)', padding: '6px 12px',
          backgroundColor: 'var(--color-success-light)', color: 'var(--color-success-dark)',
          border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 500,
        }}
        onClick={(e) => { e.stopPropagation(); handleCategoryReview(cat.id, cat.name) }}
        disabled={loading}
      >
        分类复习
      </button>
      <button
        className="btn btn-sm"
        style={{
          minHeight: '44px', fontSize: 'var(--text-xs)', padding: '6px 12px',
          backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-dark)',
          border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 500,
        }}
        onClick={(e) => { e.stopPropagation(); handleUpdateBank('category', cat.id, cat.name) }}
        disabled={loading}
      >
        更新题库
      </button>
    </div>
  )

  // 单元级操作按钮
  const renderUnitActions = (unit, catId) => {
    const hasCards = unit.cardCount > 0
    return (
      <>
        <button
          className="btn btn-sm"
          disabled={!hasCards || loading}
          title={!hasCards ? '该单元暂无知识点' : ''}
          style={{
            minHeight: '44px', fontSize: 'var(--text-xs)', padding: '6px 10px',
            backgroundColor: hasCards && !loading ? 'var(--color-primary-light)' : 'var(--color-border-light)',
            color: hasCards && !loading ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: hasCards && !loading ? 'pointer' : 'not-allowed', fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (hasCards && !loading) handleUnitTest(unit.id, unit.name) }}
        >
          单元检测
        </button>
        <button
          className="btn btn-sm"
          disabled={!hasCards || loading}
          title={!hasCards ? '该单元暂无知识点' : ''}
          style={{
            minHeight: '44px', fontSize: 'var(--text-xs)', padding: '6px 10px',
            backgroundColor: hasCards && !loading ? 'var(--color-success-light)' : 'var(--color-border-light)',
            color: hasCards && !loading ? 'var(--color-success-dark)' : 'var(--color-text-muted)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: hasCards && !loading ? 'pointer' : 'not-allowed', fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (hasCards && !loading) handleUnitReview(unit.id, unit.name) }}
        >
          单元复习
        </button>
        <button
          className="btn btn-sm"
          disabled={loading}
          style={{
            minHeight: '44px', fontSize: 'var(--text-xs)', padding: '6px 10px',
            backgroundColor: loading ? 'var(--color-border-light)' : 'var(--color-accent-light)',
            color: loading ? 'var(--color-text-muted)' : 'var(--color-accent-dark)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (!loading) handleUpdateBank('unit', unit.id, unit.name) }}
        >
          更新题库
        </button>
      </>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onSelectStart={(e) => e.preventDefault()}
    >
      {/* 加载遮罩 */}
      {loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.15)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            padding: '24px 32px', maxWidth: '280px', textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              border: '3px solid var(--color-border-light)',
              borderTopColor: 'var(--color-primary)',
              margin: '0 auto 12px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
              {loadingAction}
            </p>
          </div>
        </div>
      )}

      <div className="page-container" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '20px 16px 120px',
        width: '100%',
      }}>
        {/* 页面标题 */}
        <div className="anim-slide-in-up" style={{ marginBottom: '20px' }}>
          <h1 style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: '6px',
            letterSpacing: '-0.01em',
          }}>单元检测</h1>
          {state.categories.length > 0 && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {state.categories.length} 个分类
            </p>
          )}
        </div>

        {/* 快捷按钮区 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: '44px' }}
            onClick={() => navigate('/test/wrong')}
          >
            我的错题本
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: '44px' }}
            onClick={() => navigate('/test/question-bank')}
          >
            题库管理
          </button>
        </div>

        {/* 空状态 */}
        {state.categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" style={{
              width: '88px', height: '88px', borderRadius: '24px',
              backgroundColor: 'var(--color-surface)',
              border: '1.5px dashed var(--color-border)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
                <path d="M4 4h12a4 4 0 0 1 4 4v12a2 2 0 0 1-2 2H8a4 4 0 0 1-4-4V4z" />
                <path d="M16 4v4h4" />
                <path d="M12 12h5" />
                <path d="M7 16h10" />
                <path d="M7 12h3" />
              </svg>
            </div>
            <p className="empty-state-title">暂无分类</p>
            <p className="empty-state-desc">先去记录页面创建吧</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {state.categories.map((cat) => (
              <div key={cat.id} style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border-light)',
                padding: '16px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}>
                {/* 分类头部 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '5px', height: '20px', borderRadius: '2.5px',
                        backgroundColor: 'var(--color-primary)', flexShrink: 0,
                      }} />
                      <h2 style={{
                        fontSize: 'var(--text-base)', fontWeight: 600,
                        color: 'var(--color-text)', margin: 0,
                      }}>{cat.name}</h2>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 8px', borderRadius: '999px',
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary-dark)',
                        fontWeight: 600, fontSize: '11px',
                      }}>
                        {cardCounts[cat.id] ?? 0} 张
                      </span>
                    </div>
                    {renderCategoryActions(cat)}
                  </div>
                </div>

                {/* 单元列表 */}
                {(unitData[cat.id] || []).length === 0 ? (
                  <p style={{
                    fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)',
                    textAlign: 'center', padding: '16px 0 8px', margin: 0,
                  }}>该分类下暂无单元</p>
                ) : (
                  <div style={{ marginTop: '12px' }}>
                    {(unitData[cat.id] || []).map((unit) => (
                      <UnitGroup
                        key={unit.id}
                        unit={unit}
                        categoryId={cat.id}
                        actions={renderUnitActions(unit, cat.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证构建**

```bash
cd ai-flashcard-app && npm run build
```

预期：Build 成功，无 warning。

---

### Task 6: 修改 App.jsx — 新增 Tab 和路由

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 新增页面组件导入**

在 App.jsx 顶部 import 区域，`CloudDataDetail` 之后新增：

```jsx
import UnitTestMain from './pages/UnitTestMain'
import WrongQuestionsPage from './pages/WrongQuestionsPage'
import QuestionBankPage from './pages/QuestionBankPage'
```

- [ ] **Step 2: 修改 TABS_LOGGED_IN 数组**

在 `{ path: '/account', label: '账号' }` 之后、`{ path: '/settings', label: '设置' }` 之前，新增"检测"Tab：

```jsx
const TABS_LOGGED_IN = [
  { path: '/', label: '记录', exact: true, matchCategory: true },
  { path: '/memorize', label: '背诵' },
  { path: '/account', label: '账号' },
  { path: '/test', label: '检测' },
  { path: '/settings', label: '设置' },
]
```

- [ ] **Step 3: 新增路由**

在 `</Route>` 闭合之前（`/cloud-data/:table` 之后），新增：

```jsx
<Route path="/test" element={<RequireAuth><UnitTestMain /></RequireAuth>} />
<Route path="/test/wrong" element={<RequireAuth><WrongQuestionsPage /></RequireAuth>} />
<Route path="/test/question-bank" element={<RequireAuth><QuestionBankPage /></RequireAuth>} />
```

- [ ] **Step 4: 验证构建**

```bash
cd ai-flashcard-app && npm run build
```

预期：Build 成功，无 warning。

---

### Task 7: 最终验证

- [ ] **Step 1: 构建 APK 并安装到手机测试**

```bash
cd ai-flashcard-app && npm run build && npm run cap:sync
```

然后在 Android Studio 中 Build APK，安装到手机测试。

**验收清单：**
- [ ] 底部 Tab 栏显示"检测"按钮，点击可进入单元检测页面
- [ ] 页面标题"单元检测"正确显示
- [ ] "我的错题本"和"题库管理"按钮可见可用，点击跳转对应占位页面
- [ ] 所有分类和单元正确显示
- [ ] 每个分类节点显示"分类检测""分类复习""更新题库"三个按钮
- [ ] 每个单元节点显示"单元检测""单元复习""更新题库"三个按钮
- [ ] 点击"更新题库"按钮 → 显示加载动画 + Toast 提示
- [ ] 点击"单元检测"按钮 → 先更新题库 → 成功后跳转（待UnitTestPage实现）
- [ ] 点击"分类检测"按钮 → 先更新题库 → 成功后跳转（待UnitTestPage实现）
- [ ] 点击"单元复习"按钮 → 获取复习题目 → 跳转（待UnitTestPage实现）
- [ ] 点击"分类复习"按钮 → 获取复习题目 → 跳转（待UnitTestPage实现）
- [ ] 单元无卡片时"单元检测""单元复习"按钮置灰
- [ ] 空状态（无分类）显示"暂无分类，先去记录页面创建吧"
- [ ] 加载动画正常显示和消失
- [ ] 所有按钮 minHeight ≥ 44px
- [ ] 所有现有页面功能不受影响
- [ ] 护眼模式自动适配
- [ ] 字体大小调节自动适配