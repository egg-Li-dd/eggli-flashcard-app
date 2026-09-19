# 单元检测路由与主界面框架 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在底部 Tab 栏新增"单元检测"入口，创建 UnitTestMain 主页面复用 Home.jsx 布局和 UnitGroup.jsx 组件展示分类-单元树，并为每个分类/单元节点添加检测/复习/更新题库操作按钮。

**Architecture:** 增量修改 App.jsx 路由和 Tab 配置；新增 3 个页面组件（UnitTestMain、WrongQuestionsPage、QuestionBankPage）；修改 UnitGroup.jsx 支持可选的右侧操作按钮插槽。

**Tech Stack:** React 19.2.6 + React Router DOM 7.17.0 + IndexedDB (Dexie.js)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/App.jsx` | 修改 | 新增 Tab 项、路由、导入 |
| `src/pages/UnitTestMain.jsx` | 新建 | 单元检测主页面 |
| `src/pages/WrongQuestionsPage.jsx` | 新建 | 错题本页面（占位） |
| `src/pages/QuestionBankPage.jsx` | 新建 | 题库管理页面（占位） |
| `src/components/UnitGroup.jsx` | 修改 | 新增 `actions` prop 支持右侧操作按钮 |

---

### Task 1: 修改 App.jsx — 新增 Tab 和路由

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 新增页面组件导入**

在 App.jsx 顶部 import 区域，在 `CloudDataDetail` 导入之后新增：

```jsx
import UnitTestMain from './pages/UnitTestMain'
import WrongQuestionsPage from './pages/WrongQuestionsPage'
import QuestionBankPage from './pages/QuestionBankPage'
```

- [ ] **Step 2: 修改 TABS_LOGGED_IN 数组**

在 `TABS_LOGGED_IN` 常量中，在 `{ path: '/account', label: '账号' }` 之后、`{ path: '/settings', label: '设置' }` 之前，新增"单元检测"Tab：

```jsx
const TABS_LOGGED_IN = [
  { path: '/', label: '记录', exact: true, matchCategory: true },
  { path: '/memorize', label: '背诵' },
  { path: '/account', label: '账号' },
  { path: '/test', label: '单元检测' },  // 新增
  { path: '/settings', label: '设置' },
]
```

- [ ] **Step 3: 新增 3 个路由**

在 `<Route element={<TabBarLayout />}>` 内部，在 `</Route>` 之前（即 `/cloud-data/:table` 路由之后）新增 3 个路由：

```jsx
<Route path="/test" element={<RequireAuth><UnitTestMain /></RequireAuth>} />
<Route path="/test/wrong" element={<RequireAuth><WrongQuestionsPage /></RequireAuth>} />
<Route path="/test/question-bank" element={<RequireAuth><QuestionBankPage /></RequireAuth>} />
```

- [ ] **Step 4: 验证构建**

运行 `npm run build` 确保无报错：

```bash
cd ai-flashcard-app && npm run build
```

预期：Build 成功，无 warning。

---

### Task 2: 创建 WrongQuestionsPage.jsx 占位页面

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
    >
      <div className="page-container" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        padding: '20px 16px 120px',
      }}>
        <h1 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          color: 'var(--color-text)',
          marginBottom: '6px',
        }}>我的错题本</h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
        }}>错题本功能即将上线，敬请期待</p>
      </div>
    </div>
  )
}
```

---

### Task 3: 创建 QuestionBankPage.jsx 占位页面

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
    >
      <div className="page-container" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        padding: '20px 16px 120px',
      }}>
        <h1 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          color: 'var(--color-text)',
          marginBottom: '6px',
        }}>题库管理</h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
        }}>题库管理功能即将上线，敬请期待</p>
      </div>
    </div>
  )
}
```

---

### Task 4: 修改 UnitGroup.jsx — 支持右侧操作按钮

**Files:**
- Modify: `src/components/UnitGroup.jsx`

- [ ] **Step 1: 解构新增 `actions` prop**

在组件参数解构中新增 `actions`：

```jsx
export default function UnitGroup({
  unit, categoryId, bookmarks, onDeleteCard, onBookmarkCard, onMoveCard,
  forceCollapsed, forceExpanded,
  selectionMode, selectedIds, onToggleSelect,
  onCardLongPress, onCardTouchStart, onCardTouchEnd, onCardTouchMove, onCardClick,
  apiKey, aiServiceMode, model, summaryLevel, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey,
  actions,  // 新增：右侧操作按钮插槽
}) {
```

- [ ] **Step 2: 在 header 按钮中渲染 actions**

在 header 的 `<button>` 内部，在 `<span className="badge badge-primary">{cards.length} 张</span>` 之后、`<svg>` 之前插入 actions：

找到这段代码（约第 78-101 行）：

```jsx
<button
  onClick={() => setExpanded((prev) => !prev)}
  className="btn btn-secondary btn-block"
  style={{
    justifyContent: 'space-between',
    padding: '12px 16px',
  }}
>
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <span className="section-title" style={{ marginBottom: 0, color: 'var(--color-text)', fontSize: 'var(--text-sm)' }}>
      {unit.name}
    </span>
    <span className="badge badge-primary">{cards.length} 张</span>
  </div>
  <svg ...>
    ...
  </svg>
</button>
```

替换为：

```jsx
<button
  onClick={() => setExpanded((prev) => !prev)}
  className="btn btn-secondary btn-block"
  style={{
    justifyContent: 'space-between',
    padding: '12px 16px',
  }}
>
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
    <span className="section-title" style={{ marginBottom: 0, color: 'var(--color-text)', fontSize: 'var(--text-sm)' }}>
      {unit.name}
    </span>
    <span className="badge badge-primary">{cards.length} 张</span>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
    {actions}
    <svg
      style={{
        width: '18px',
        height: '18px',
        color: 'var(--color-text-secondary)',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.3s ease',
        flexShrink: 0,
      }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </div>
</button>
```

- [ ] **Step 3: 验证构建**

运行 `npm run build` 确保无报错：

```bash
cd ai-flashcard-app && npm run build
```

预期：Build 成功，无 warning。UnitGroup 的现有调用（Category.jsx）不传 `actions` prop，行为不变。

---

### Task 5: 创建 UnitTestMain.jsx 主页面

**Files:**
- Create: `src/pages/UnitTestMain.jsx`

- [ ] **Step 1: 创建完整页面组件**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getUnitsByCategory, getCardCountByCategory } from '../services/db'
import UnitGroup from '../components/UnitGroup'

export default function UnitTestMain() {
  const { state } = useApp()
  const navigate = useNavigate()
  const [unitData, setUnitData] = useState({})  // { categoryId: [{ unit, cardCount }] }
  const [cardCounts, setCardCounts] = useState({})  // { categoryId: count }

  // 加载所有分类的单元数据
  useEffect(() => {
    const loadData = async () => {
      const counts = {}
      const data = {}
      for (const cat of state.categories) {
        try {
          counts[cat.id] = await getCardCountByCategory(cat.id)
          const units = await getUnitsByCategory(cat.id)
          // 为每个单元加载卡片数量
          const enrichedUnits = await Promise.all(
            units.map(async (unit) => {
              const { getCardsByUnit } = await import('../services/db')
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

  // 空函数 - 留待后续任务绑定
  const handleCategoryTest = (catId) => {}
  const handleCategoryReview = (catId) => {}
  const handleCategoryUpdateBank = (catId) => {}
  const handleUnitTest = (unitId) => {}
  const handleUnitReview = (unitId) => {}
  const handleUnitUpdateBank = (unitId) => {}

  // 渲染分类级操作按钮
  const renderCategoryActions = (catId) => (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
      <button
        className="btn btn-sm btn-secondary"
        style={{ minHeight: '44px', fontSize: 'var(--text-xs)' }}
        onClick={(e) => { e.stopPropagation(); handleCategoryTest(catId) }}
      >
        分类检测
      </button>
      <button
        className="btn btn-sm btn-secondary"
        style={{ minHeight: '44px', fontSize: 'var(--text-xs)' }}
        onClick={(e) => { e.stopPropagation(); handleCategoryReview(catId) }}
      >
        分类复习
      </button>
      <button
        className="btn btn-sm btn-secondary"
        style={{ minHeight: '44px', fontSize: 'var(--text-xs)' }}
        onClick={(e) => { e.stopPropagation(); handleCategoryUpdateBank(catId) }}
      >
        更新题库
      </button>
    </div>
  )

  // 渲染单元级操作按钮
  const renderUnitActions = (unit, catId) => {
    const hasCards = unit.cardCount > 0
    return (
      <>
        <button
          className="btn btn-sm"
          disabled={!hasCards}
          title={!hasCards ? '该单元暂无知识点' : ''}
          style={{
            minHeight: '44px',
            fontSize: 'var(--text-xs)',
            padding: '6px 10px',
            backgroundColor: hasCards ? 'var(--color-primary-light)' : 'var(--color-border-light)',
            color: hasCards ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: hasCards ? 'pointer' : 'not-allowed',
            fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (hasCards) handleUnitTest(unit.id) }}
        >
          单元检测
        </button>
        <button
          className="btn btn-sm"
          disabled={!hasCards}
          title={!hasCards ? '该单元暂无知识点' : ''}
          style={{
            minHeight: '44px',
            fontSize: 'var(--text-xs)',
            padding: '6px 10px',
            backgroundColor: hasCards ? 'var(--color-success-light)' : 'var(--color-border-light)',
            color: hasCards ? 'var(--color-success-dark)' : 'var(--color-text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: hasCards ? 'pointer' : 'not-allowed',
            fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); if (hasCards) handleUnitReview(unit.id) }}
        >
          单元复习
        </button>
        <button
          className="btn btn-sm"
          style={{
            minHeight: '44px',
            fontSize: 'var(--text-xs)',
            padding: '6px 10px',
            backgroundColor: 'var(--color-accent-light)',
            color: 'var(--color-accent-dark)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
          onClick={(e) => { e.stopPropagation(); handleUnitUpdateBank(unit.id) }}
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
    >
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
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}>
              {state.categories.length} 个分类
            </p>
          )}
        </div>

        {/* 快捷按钮区 */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '24px',
        }}>
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
              width: '88px',
              height: '88px',
              borderRadius: '24px',
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
          /* 分类-单元树 */
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
                        width: '5px',
                        height: '20px',
                        borderRadius: '2.5px',
                        backgroundColor: 'var(--color-primary)',
                        flexShrink: 0,
                      }} />
                      <h2 style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        margin: 0,
                      }}>{cat.name}</h2>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary-dark)',
                        fontWeight: 600,
                        fontSize: '11px',
                      }}>
                        {cardCounts[cat.id] ?? 0} 张
                      </span>
                    </div>
                    {/* 分类操作按钮 */}
                    {renderCategoryActions(cat.id)}
                  </div>
                </div>

                {/* 单元列表 */}
                {(unitData[cat.id] || []).length === 0 ? (
                  <p style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-muted)',
                    textAlign: 'center',
                    padding: '16px 0 8px',
                    margin: 0,
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

运行 `npm run build` 确保无报错：

```bash
cd ai-flashcard-app && npm run build
```

预期：Build 成功，无 warning。

---

### Task 6: 移动端验证

- [ ] **Step 1: 构建 APK 并安装到手机测试**

```bash
cd ai-flashcard-app && npm run build && npm run cap:sync
```

然后在 Android Studio 中 Build APK，安装到手机测试。

**验收清单：**
- [ ] 底部 Tab 栏显示"单元检测"按钮，点击可进入对应页面
- [ ] 页面标题"单元检测"正确显示
- [ ] "我的错题本"和"题库管理"按钮可见可用
- [ ] 所有分类和单元正确显示，与记录页面一致
- [ ] 每个分类节点右侧显示"分类检测""分类复习""更新题库"三个按钮
- [ ] 每个单元节点右侧显示"单元检测""单元复习""更新题库"三个按钮
- [ ] 折叠面板交互正常（点击展开/折叠）
- [ ] 单元无卡片时"单元检测""单元复习"按钮置灰，提示"该单元暂无知识点"
- [ ] 空状态（无分类）显示"暂无分类，先去记录页面创建吧"
- [ ] 护眼模式自动适配
- [ ] 字体大小调节自动适配
- [ ] 所有按钮 minHeight ≥ 44px
- [ ] 所有现有页面功能不受影响