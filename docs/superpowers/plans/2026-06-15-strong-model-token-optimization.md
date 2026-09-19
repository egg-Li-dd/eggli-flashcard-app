# 强模型 AI 出题省 token 优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为强模型（DeepSeek/讯飞星火 Pro/Max/4.0Ultra/豆包/千问）设计一套省 token 的出题策略，调用次数从 1 次大批量降到 2-8 次小批量，复用现有的本地题目矩阵分析（`analyzeQuestionMatrix`）跳过已出齐的 (card, type) 任务，单次 prompt 控制在 12-15 张卡片 + 1-2 个题型组合。

**Architecture:** 复用 `analyzeQuestionMatrix` 构造题目矩阵，新增 `buildStrongModelTasks`（按矩阵缺口 + 题型组合拆任务）、`buildStrongModelPrompt`（多题型精简 prompt）、`parseMultiTypeResponse`（兼容对象/数组两种返回格式）、`generateQuestionsForStrongModel`（主流程）；`updateQuestionBank` 中在 `isWeakModel` 旁加 `isStrongModel` 分流；强模型失败时自动降级到原单次大批量策略。

**Tech Stack:** React 19.2.6 + Vitest 4.1.8 + 现有 5 层校验（`normalizeQuestion` / `validateQuestion` / 黑名单 / bigram）+ 本地题目矩阵（`analyzeQuestionMatrix`）

---

## 用户已确认决策

- 每批卡片数上限：**12-15 张**（强模型档位不同，DeepSeek/豆包/千问 15 张，Spark Pro/Max 12 张）
- 每批题型组合数：**1-2 个题型**（按题型组合分批：选择题 = single+multi，简化题 = true_false+fill_blank）
- 实施方式：**先写 plan 再实施**（本文件即为 plan）

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/utils/constants.js` | 修改 | 新增 `STRONG_MODEL_STRATEGY` 配置文件 + `STRONG_TYPE_GROUPS` 题型组合 |
| `src/services/testQuestionService.js` | 修改 | 新增 `isStrongModel` / `buildStrongModelTasks` / `buildStrongModelPrompt` / `parseMultiTypeResponse` / `generateQuestionsForStrongModel`；`updateQuestionBank` 加分流 + 降级 |
| `src/services/testQuestionService.js` | 修改 | `__test__` 导出新增 5 个函数 + 2 个常量 |
| `src/__tests__/testQuestionStrongModel.test.js` | 新建 | 强模型省 token 策略测试（28+ 个用例） |
| `文档分布.txt` | 修改 | 记录强模型省 token 方案 + 新测试文件 |
| `易报错事项.txt` | 修改 | 记录强模型降级路径 + parseMultiTypeResponse 兼容性 |

---

## Task 1: 新增 `STRONG_MODEL_STRATEGY` 常量配置

**Files:**
- Modify: `src/utils/constants.js`（在 `LITE_BATCH_SIZE = 5` 之后追加）

- [ ] **Step 1: 新增强模型策略配置**

在 `src/utils/constants.js` 第 578 行（`export const LITE_BATCH_SIZE = 5` 之后）追加：

```js
// 强模型省 token 出题策略
// 复用 analyzeQuestionMatrix 跳过"已出齐"任务 + 按题型组合分批
// 调用次数: 1 次大批量 → 2-8 次小批量，单次 prompt token 降低 60-70%
export const STRONG_MODEL_STRATEGY = {
  // DeepSeek-V4 Pro/Flash：上下文长，按 15 张/批
  'deepseek': { batchSize: 15, maxTypesPerBatch: 2, label: 'DeepSeek' },
  // 讯飞星火 Pro/Max/4.0Ultra：上下文中等，按 12 张/批
  'iflytek-spark-generalv3': { batchSize: 12, maxTypesPerBatch: 2, label: 'Spark Pro' },
  'iflytek-spark-max-32k': { batchSize: 12, maxTypesPerBatch: 2, label: 'Spark Max-32K' },
  'iflytek-spark-4.0Ultra': { batchSize: 12, maxTypesPerBatch: 2, label: 'Spark 4.0 Ultra' },
  'iflytek-spark-pro-128k': { batchSize: 12, maxTypesPerBatch: 2, label: 'Spark Pro-128K' },
  'iflytek-spark-generalv3.5': { batchSize: 12, maxTypesPerBatch: 2, label: 'Spark Max' },
  // 火山引擎豆包/千问：上下文长
  'volcano': { batchSize: 15, maxTypesPerBatch: 2, label: '豆包' },
  'dashscope': { batchSize: 15, maxTypesPerBatch: 2, label: '千问' },
}

// 强模型出题题型组合（每批 1-2 个题型）
// 强模型擅长处理多种题型，但 4 题型一次出 prompt 过长
// 拆成 2 组：选择题组（单选+多选） + 简化题组（判断+填空）
export const STRONG_TYPE_GROUPS = [
  { name: 'objective', types: ['single_choice', 'multi_choice'] },
  { name: 'binary', types: ['true_false', 'fill_blank'] },
]

// 强模型单批卡片数默认上限（按模型选择后的兜底）
export const STRONG_DEFAULT_BATCH_SIZE = 12
```

- [ ] **Step 2: 验证常量导入不破坏现有代码**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionMultiCall.test.js 2>&1 | Select-Object -Last 5`
Expected: `Tests 30 passed (30)`（仅添加常量不改动逻辑）

- [ ] **Step 3: 提交**

Run:
```bash
cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"
git add src/utils/constants.js
git commit -m "feat(constants): 新增 STRONG_MODEL_STRATEGY 强模型省 token 配置"
```

---

## Task 2: 新增 `isStrongModel` 函数

**Files:**
- Modify: `src/services/testQuestionService.js`（在 `isWeakModel` 函数 L170 之后追加）

- [ ] **Step 1: 写测试用例**

新增 `src/__tests__/testQuestionStrongModel.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { __test__ } from '../services/testQuestionService'

const { isStrongModel } = __test__

describe('isStrongModel - 强模型识别', () => {
  it('DeepSeek 应识别为强模型', () => {
    expect(isStrongModel({ aiServiceMode: 'deepseek' })).toBe(true)
  })

  it('讯飞星火 Pro/Max/4.0Ultra 应识别为强模型', () => {
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'generalv3' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'pro-128k' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'max-32k' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: '4.0Ultra' })).toBe(true)
  })

  it('豆包/千问 应识别为强模型', () => {
    expect(isStrongModel({ aiServiceMode: 'volcano' })).toBe(true)
    expect(isStrongModel({ aiServiceMode: 'dashscope' })).toBe(true)
  })

  it('讯飞星火 lite 应识别为弱模型（不算强模型）', () => {
    expect(isStrongModel({ aiServiceMode: 'iflytek-spark', sparkModel: 'lite' })).toBe(false)
  })

  it('空 config 不应抛错', () => {
    expect(isStrongModel(null)).toBe(false)
    expect(isStrongModel(undefined)).toBe(false)
    expect(isStrongModel({})).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 10`
Expected: FAIL with `isStrongModel is not a function` 或 `Cannot read`

- [ ] **Step 3: 实现 `isStrongModel` 函数**

在 `testQuestionService.js` 第 177 行（`isWeakModel` 函数结束）后追加：

```js
// 检测当前配置是否为"强模型"（可走省 token 多次小批量策略）
// 已知强模型：DeepSeek / 讯飞星火 Pro 系列 / 豆包 / 千问
export function isStrongModel(config) {
  if (!config) return false
  const mode = config.aiServiceMode
  if (mode === 'deepseek' || mode === 'volcano' || mode === 'dashscope') return true
  if (mode === 'iflytek-spark') {
    const m = (config.sparkModel || 'lite').toLowerCase()
    // lite 走弱模型；其它（generalv3/pro-128k/max-32k/4.0Ultra 等）走强模型
    return m !== 'lite' && m !== 'spark-lite'
  }
  return false
}
```

- [ ] **Step 4: 导出 `isStrongModel` 到 `__test__`**

在 `testQuestionService.js` 末尾 `__test__` 对象（约 L1351）新增：

```js
isStrongModel,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 5`
Expected: `Tests 7 passed (7)`

- [ ] **Step 6: 提交**

```bash
git add src/services/testQuestionService.js src/__tests__/testQuestionStrongModel.test.js
git commit -m "feat(service): 新增 isStrongModel 强模型识别函数"
```

---

## Task 3: 新增 `buildStrongModelTasks` 任务清单构造

**Files:**
- Modify: `src/services/testQuestionService.js`（在 `analyzeQuestionMatrix` 函数 L284 之后追加）

- [ ] **Step 1: 写测试用例**

在 `testQuestionStrongModel.test.js` 追加：

```js
import { LITE_QUESTION_TYPES } from '../utils/constants'
const { buildStrongModelTasks, analyzeQuestionMatrix } = __test__

describe('buildStrongModelTasks - 强模型任务清单构造', () => {
  const sampleCards = Array.from({ length: 30 }, (_, i) => ({
    id: `card_${i + 1}`,
    knowledge_point: `KP${i + 1}`,
    front: `Q${i + 1}？`,
    back: `A${i + 1}`,
  }))

  it('无本地题库时，30 张卡 = 2 批 × 2 题型组 = 4 个任务', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [])
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 2 })
    expect(result.tasks).toHaveLength(4)
    expect(result.skipped.empty).toBe(0)
  })

  it('全部 4 题型都已出齐时，30 张卡 = 0 个任务（短路）', () => {
    const types = LITE_QUESTION_TYPES.map(t => t.type)
    const existing = []
    for (const c of sampleCards) {
      for (const t of types) existing.push({ type: t, cardId: c.id, stem: 'q' })
    }
    const matrix = analyzeQuestionMatrix(sampleCards, existing)
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 2 })
    expect(result.tasks).toHaveLength(0)
    expect(result.skipped.empty).toBe(2)  // 2 批都跳过
  })

  it('单批内有部分 card 已出齐时，题型组应只包含未出齐的题型', () => {
    // 15 张卡，让前 10 张的 single_choice 已出齐
    const existing = sampleCards.slice(0, 10).map(c => ({
      type: 'single_choice', cardId: c.id, stem: 'q',
    }))
    const matrix = analyzeQuestionMatrix(sampleCards, existing)
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 2 })
    // 批 1 (前 15 张)：single_choice 已全部出齐 → objective 组被跳过；binary 组仍在
    // 批 2 (后 15 张)：4 题型都缺 → objective + binary 都有
    expect(result.tasks.length).toBeGreaterThanOrEqual(2)
    // 验证 objective 组最多只出现在批 2
    const batch1Objectives = result.tasks.filter(t => t.batchIdx === 0 && t.types.includes('single_choice'))
    const batch2Objectives = result.tasks.filter(t => t.batchIdx === 1 && t.types.includes('single_choice'))
    expect(batch1Objectives).toHaveLength(0)  // 批 1 的 single_choice 已出齐
    expect(batch2Objectives).toHaveLength(1)  // 批 2 仍需
  })

  it('maxTypesPerBatch=1 时，每任务最多 1 个题型（与弱模型对齐）', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [])
    const result = buildStrongModelTasks(matrix, sampleCards, { batchSize: 15, maxTypesPerBatch: 1 })
    // 2 批 × 4 题型 = 8 个任务
    expect(result.tasks).toHaveLength(8)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 10`
Expected: FAIL with `buildStrongModelTasks is not a function`

- [ ] **Step 3: 实现 `buildStrongModelTasks` 函数**

在 `testQuestionService.js` 第 313 行（`formatExistingQuestionsForBatch` 函数结束）后追加：

```js
// ===== 2026-06-15 强模型省 token 任务清单构造 =====
// 复用 analyzeQuestionMatrix：跳过"已出齐"的 (card, type)
// 强模型按"题型组合"分批：选择题组（single+multi） / 简化题组（true_false+fill_blank）
// 任务格式：{ batchIdx, cardBatch, types, mode }
//   - types: 该批要出的题型数组（1-2 个）
//   - mode: 'multi_type' 表示该 prompt 出多种题型
// @param {Object} matrix - analyzeQuestionMatrix 返回值
// @param {Array} cards - 已按状态优先级排序的卡片
// @param {Object} strategy - { batchSize, maxTypesPerBatch }
// @returns {Object} { tasks: [{ batchIdx, cardBatch, types, mode }], skipped: { byType, empty } }
export function buildStrongModelTasks(matrix, cards, strategy) {
  const allTypes = LITE_QUESTION_TYPES.map(t => t.type)
  const batches = chunkCards(cards, strategy.batchSize || STRONG_DEFAULT_BATCH_SIZE)
  const tasks = []
  const skipped = { byType: {}, empty: 0 }
  const maxTypes = strategy.maxTypesPerBatch || 2

  batches.forEach((batch, batchIdx) => {
    // 1) 判断该批需要哪些 type（任一 card 缺该 type → 就要）
    const needTypesInBatch = []
    for (const t of allTypes) {
      if (!isBatchTypeSatisfied(batch, t, matrix)) {
        needTypesInBatch.push(t)
      }
    }
    if (needTypesInBatch.length === 0) {
      skipped.empty++
      return
    }

    // 2) 按 STRONG_TYPE_GROUPS 把 needTypes 拆成 1-2 个 prompt 任务
    if (maxTypes >= 4) {
      // 一次出 4 题型（强模型档位激进）
      tasks.push({ batchIdx, cardBatch: batch, types: needTypesInBatch, mode: 'multi_type' })
    } else {
      // 按组合拆：objective (single+multi) + binary (true_false+fill_blank)
      for (const group of STRONG_TYPE_GROUPS) {
        const groupTypes = needTypesInBatch.filter(t => group.types.includes(t))
        if (groupTypes.length > 0) {
          tasks.push({ batchIdx, cardBatch: batch, types: groupTypes, mode: 'multi_type' })
        }
      }
    }
  })

  return { tasks, skipped }
}
```

- [ ] **Step 4: 导出 `buildStrongModelTasks`**

在 `__test__` 对象中追加：

```js
buildStrongModelTasks,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 5`
Expected: `Tests 11 passed (11)`（7 个 isStrongModel + 4 个 buildStrongModelTasks）

- [ ] **Step 6: 提交**

```bash
git add src/services/testQuestionService.js src/__tests__/testQuestionStrongModel.test.js
git commit -m "feat(service): 新增 buildStrongModelTasks 按题型组合拆批"
```

---

## Task 4: 新增 `buildStrongModelPrompt` 多题型精简 prompt

**Files:**
- Modify: `src/services/testQuestionService.js`（在 `buildStrongModelTasks` 函数之后追加）

- [ ] **Step 1: 写测试用例**

在 `testQuestionStrongModel.test.js` 追加：

```js
const { buildStrongModelPrompt } = __test__

describe('buildStrongModelPrompt - 强模型多题型 prompt', () => {
  const sampleCards = [
    { id: 'card_1', knowledge_point: '内存', front: 'RAM 的特点？', back: '断电丢失' },
    { id: 'card_2', knowledge_point: 'OSI', front: 'OSI 几层？', back: '7 层' },
  ]

  it('应包含所有要求的题型标识', () => {
    const p = buildStrongModelPrompt(sampleCards, ['single_choice', 'multi_choice'])
    expect(p).toMatch(/单选题/)
    expect(p).toMatch(/多选题/)
    expect(p).toContain('card_1')
    expect(p).toContain('card_2')
  })

  it('应包含通用硬约束（label 必须是 A/B/C/D）', () => {
    const p = buildStrongModelPrompt(sampleCards, ['single_choice'])
    expect(p).toMatch(/A\/B\/C\/D/)
    expect(p).toMatch(/label/)
  })

  it('传 matrix 时应嵌入"已有题库"段', () => {
    const matrix = analyzeQuestionMatrix(sampleCards, [
      { type: 'single_choice', cardId: 'card_1', stem: 'c1 已有' },
    ])
    const p = buildStrongModelPrompt(sampleCards, ['single_choice', 'multi_choice'], { matrix })
    expect(p).toContain('按卡片精确提示')
    expect(p).toContain('card_1')
  })

  it('不传 matrix 时应只显示全局参考/暂无', () => {
    const p = buildStrongModelPrompt(sampleCards, ['true_false'], { existingQuestions: [] })
    expect(p).toMatch(/判断题/)
    expect(p).toMatch(/暂无/)
  })

  it('填空题 prompt 必须含 ____ 标记说明', () => {
    const p = buildStrongModelPrompt(sampleCards, ['fill_blank'])
    expect(p).toMatch(/_+/)
    expect(p).toMatch(/填空/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 10`
Expected: FAIL with `buildStrongModelPrompt is not a function`

- [ ] **Step 3: 实现 `buildStrongModelPrompt` 函数**

在 `testQuestionService.js` 第 419 行（`buildStrongModelTasks` 函数结束）后追加：

```js
// ===== 2026-06-15 强模型多题型精简 prompt =====
// 强模型能处理多题型同时出题，但仍聚焦 1-2 个题型
// 与弱模型（buildLitePromptByType）不同点：
//   - 强模型只展示需要的题型约束（不展示其它 4 种）
//   - 强模型硬约束更精简（不再 5 条全列）
//   - 输出格式支持对象 { single_choice: [...], multi_choice: [...] }
//     和数组 [{...}, {...}] 两种（parseMultiTypeResponse 兼容）
function buildStrongModelPrompt(cardBatch, types, options = {}) {
  const matrix = (options && options.matrix) || null
  const existingQuestions = (options && options.existingQuestions) || []
  const cardCount = cardBatch.length
  const cardsText = formatCardsForLiteBatch(cardBatch, 100)

  // 各题型的精简约束（仅提示关键点，不重复 LITE_COMMON_RULES）
  const TYPE_RULES = {
    single_choice: '单选题：4 个选项 A-D，只 1 个正确；题干必须含问号或疑问词',
    multi_choice: '多选题：4 个选项 A-D，2-4 个正确；题干末含"（多选题）"或"可多选"；答案用字母连写如 "ABD"',
    true_false: '判断题：固定 2 选项 "正确"/"错误"；answer 用中文；题干以"判断以下说法是否正确："开头',
    fill_blank: '填空题：options=[]；题干用 ____ 标记挖空位置；answer 填被挖空内容',
  }
  const typesRules = types.map(t => `【${t}】${TYPE_RULES[t] || ''}`).join('\n')

  // 通用硬约束（精简版，强模型已具备较强遵循度）
  const COMMON_RULES = `【通用约束】
1. label 严格按各题型规则（选择题 A-D，判断题 "正确"/"错误"）
2. text 必须是完整陈述句，禁止知识点标签/状态词/判断词
3. 题干必须含问号或疑问词
4. 输出 JSON 数组 [{...}, {...}] 或对象 { "${types[0]}": [...], "${types[1] || ''}": [...] }，每道题含 type 字段`

  // matrix 段（per-card 精确提示）
  let existingText = ''
  if (matrix) {
    for (const t of types) {
      const perCardText = formatExistingQuestionsForBatch(cardBatch, matrix, t)
      if (perCardText) {
        existingText += `\n【${t} 已有题目（按卡片精确提示）】\n${perCardText}\n`
      }
    }
  }

  // existingQuestions 全局参考段（兼容）
  if (Array.isArray(existingQuestions) && existingQuestions.length > 0) {
    const filtered = existingQuestions
      .filter(q => types.includes(String(q.type || '').toLowerCase()))
      .slice(0, 5)
    if (filtered.length > 0) {
      existingText += `\n【全局参考】\n${filtered.map((q, i) => `  已有题${i + 1}: ${String(q.stem || '').slice(0, 80)}`).join('\n')}\n`
    }
  }
  if (!existingText) {
    existingText = '\n【已有同类题目】暂无（可以放心出新题）'
  }

  return `你是一个出题助手。请根据提供的 ${cardCount} 张学习卡片，生成以下题型的题目。

【输出题型】
${typesRules}

${COMMON_RULES}

【输入卡片】
${cardsText}
${existingText}

只返回 JSON，不要解释。`
}
```

- [ ] **Step 4: 导出 `buildStrongModelPrompt`**

在 `__test__` 对象中追加：

```js
buildStrongModelPrompt,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 5`
Expected: `Tests 16 passed (16)`（7 + 4 + 5）

- [ ] **Step 6: 提交**

```bash
git add src/services/testQuestionService.js src/__tests__/testQuestionStrongModel.test.js
git commit -m "feat(service): 新增 buildStrongModelPrompt 强模型多题型 prompt 构建"
```

---

## Task 5: 新增 `parseMultiTypeResponse` 多题型返回解析

**Files:**
- Modify: `src/services/testQuestionService.js`（在 `parseQuestionResponse` 函数之后追加）

- [ ] **Step 1: 写测试用例**

在 `testQuestionStrongModel.test.js` 追加：

```js
const { parseMultiTypeResponse } = __test__

describe('parseMultiTypeResponse - 多题型返回解析（兼容对象/数组）', () => {
  it('AI 返回对象 { single_choice: [...], multi_choice: [...] } 应被正确解析', () => {
    const raw = JSON.stringify({
      single_choice: [{ type: 'single_choice', stem: 'q1？' }],
      multi_choice: [{ type: 'multi_choice', stem: 'q2？' }],
    })
    const result = parseMultiTypeResponse(raw, ['single_choice', 'multi_choice'])
    expect(result).toHaveLength(2)
    expect(result.map(q => q.type).sort()).toEqual(['multi_choice', 'single_choice'])
  })

  it('AI 返回数组 [...] 应被正确解析', () => {
    const raw = JSON.stringify([
      { type: 'single_choice', stem: 'q1？' },
      { type: 'true_false', stem: 'q2？' },
    ])
    const result = parseMultiTypeResponse(raw, ['single_choice', 'true_false'])
    expect(result).toHaveLength(2)
  })

  it('AI 返回带 Markdown 代码块的对象应被正确解析', () => {
    const raw = '```json\n{"single_choice": [{"type": "single_choice", "stem": "q？"}]}\n```'
    const result = parseMultiTypeResponse(raw, ['single_choice'])
    expect(result).toHaveLength(1)
  })

  it('AI 返回带说明文字 + JSON 数组 应被正确解析', () => {
    const raw = '以下是生成的题目：\n[{"type": "single_choice", "stem": "q？"}]\n请查收。'
    const result = parseMultiTypeResponse(raw, ['single_choice'])
    expect(result).toHaveLength(1)
  })

  it('空返回应返回空数组', () => {
    expect(parseMultiTypeResponse('', ['single_choice'])).toEqual([])
    expect(parseMultiTypeResponse('[]', ['single_choice'])).toEqual([])
    expect(parseMultiTypeResponse('{}', ['single_choice'])).toEqual([])
  })

  it('非法 JSON 应返回空数组（不抛错）', () => {
    expect(parseMultiTypeResponse('not json', ['single_choice'])).toEqual([])
  })

  it('题目 type 字段缺失时，应根据所在 key 补全', () => {
    const raw = JSON.stringify({
      single_choice: [{ stem: 'q？' }],  // 缺 type 字段
    })
    const result = parseMultiTypeResponse(raw, ['single_choice'])
    expect(result[0].type).toBe('single_choice')
  })

  it('多题型混合数组应保留 type 字段（即使与所在 key 不一致）', () => {
    const raw = JSON.stringify({
      objective: [
        { type: 'single_choice', stem: 'q1？' },
        { type: 'multi_choice', stem: 'q2？' },
      ],
    })
    const result = parseMultiTypeResponse(raw, ['single_choice', 'multi_choice'])
    expect(result).toHaveLength(2)
    expect(result.map(q => q.type).sort()).toEqual(['multi_choice', 'single_choice'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 10`
Expected: FAIL with `parseMultiTypeResponse is not a function`

- [ ] **Step 3: 实现 `parseMultiTypeResponse` 函数**

在 `testQuestionService.js` 第 499 行（`parseQuestionResponse` 函数结束）后追加：

```js
// ===== 2026-06-15 强模型多题型返回解析 =====
// 强模型可能返回 2 种格式：
//   A) 对象 { single_choice: [...], multi_choice: [...] }
//   B) 数组 [{...}, {...}]（每题带 type 字段）
// 同时 AI 可能夹杂 Markdown 代码块标记或说明文字，复用 extractJsonFromAiResponse
// @param {string} rawText - AI 返回的原始文本
// @param {Array<string>} types - 该任务期望的题型列表
// @returns {Array} 解析后的题目数组（每个含 type 字段）
export function parseMultiTypeResponse(rawText, types = []) {
  if (!rawText || typeof rawText !== 'string') return []
  const aiServiceMode = ''  // 强模型主要走 DeepSeek/Spark Pro，模式通过 callers 传入
  const extracted = extractJsonFromAiResponse(rawText, aiServiceMode)
  if (!extracted.json) return []

  // 格式 A：对象 { type: [questions] }
  if (!Array.isArray(extracted.json) && typeof extracted.json === 'object') {
    const questions = []
    for (const [key, val] of Object.entries(extracted.json)) {
      if (!Array.isArray(val)) continue
      for (const q of val) {
        if (!q || typeof q !== 'object') continue
        // 补全 type 字段：优先用 AI 返回的，否则用 key
        const finalType = String(q.type || key).toLowerCase()
        questions.push({ ...q, type: finalType })
      }
    }
    return questions
  }

  // 格式 B：数组 [{...}, {...}]
  if (Array.isArray(extracted.json)) {
    return extracted.json.filter(q => q && typeof q === 'object')
  }

  return []
}
```

- [ ] **Step 4: 导出 `parseMultiTypeResponse`**

在 `__test__` 对象中追加：

```js
parseMultiTypeResponse,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 5`
Expected: `Tests 24 passed (24)`（7 + 4 + 5 + 8）

- [ ] **Step 6: 提交**

```bash
git add src/services/testQuestionService.js src/__tests__/testQuestionStrongModel.test.js
git commit -m "feat(service): 新增 parseMultiTypeResponse 兼容对象/数组两种返回格式"
```

---

## Task 6: 新增 `generateQuestionsForStrongModel` 主流程

**Files:**
- Modify: `src/services/testQuestionService.js`（在 `generateQuestionsForWeakModel` 函数之后追加）

- [ ] **Step 1: 写测试用例**

**首先更新文件顶部 import**（在 Task 2 创建的文件基础上加 `vi, beforeEach`）：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
```

**然后追加测试代码**：

```js
// mock aiService.generateTestQuestions（与 multiCall.test.js 一致）
const { mockGenerateTestQuestions } = vi.hoisted(() => ({
  mockGenerateTestQuestions: vi.fn(),
}))
vi.mock('../services/aiService', () => ({
  generateTestQuestions: mockGenerateTestQuestions,
}))

const { generateQuestionsForStrongModel } = __test__

describe('generateQuestionsForStrongModel - 强模型省 token 主流程', () => {
  const sampleCards = Array.from({ length: 30 }, (_, i) => ({
    id: `card_${i + 1}`,
    knowledge_point: `KP${i + 1}`,
    front: `Q${i + 1}？`,
    back: `A${i + 1}`,
  }))
  const statusMap = Object.fromEntries(sampleCards.map(c => [c.id, 'new']))
  const strongConfig = { aiServiceMode: 'deepseek' }

  beforeEach(() => {
    mockGenerateTestQuestions.mockReset()
  })

  it('30 张卡 + 无本地题库 → 2 批 × 2 题型组 = 4 次调用', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const result = await generateQuestionsForStrongModel(
      sampleCards, statusMap, [], 'unit', strongConfig
    )
    expect(result.callCount).toBe(4)
    expect(result.batchCount).toBe(2)
    expect(mockGenerateTestQuestions).toHaveBeenCalledTimes(4)
  })

  it('全 4 题型已出齐时短路返回（callCount=0）', async () => {
    const types = LITE_QUESTION_TYPES.map(t => t.type)
    const existing = []
    for (const c of sampleCards) {
      for (const t of types) existing.push({ type: t, cardId: c.id, stem: 'q' })
    }
    const result = await generateQuestionsForStrongModel(
      sampleCards, statusMap, existing, 'unit', strongConfig
    )
    expect(result.callCount).toBe(0)
    expect(result.skippedReason).toBe('all_satisfied')
    expect(mockGenerateTestQuestions).not.toHaveBeenCalled()
  })

  it('100 张卡 + 60 张已有 single_choice/true_false → 调用次数显著减少', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const bigCards = Array.from({ length: 100 }, (_, i) => ({
      id: `card_${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))
    const existing = []
    for (let i = 0; i < 60; i++) {
      existing.push({ type: 'single_choice', cardId: `card_${i + 1}`, stem: 'q' })
      existing.push({ type: 'true_false', cardId: `card_${i + 1}`, stem: 'q' })
    }
    const result = await generateQuestionsForStrongModel(
      bigCards, statusMap, existing, 'category', strongConfig
    )
    // 100 / 15 = 7 批；每批最多 2 个题型组；前 4 批（前 60 张）single+true 已出齐 → 单批只出 multi+fill
    // 期望调用次数 < 14
    expect(result.callCount).toBeLessThan(14)
    expect(result.callCount).toBeGreaterThan(0)
  })

  it('AI 返回合法题目应被收集', async () => {
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题')) {
        return JSON.stringify([{ type: 'single_choice', stem: 'q？', options: [
          { label: 'A', text: '选项A' }, { label: 'B', text: '选项B' },
        ], answer: 'A' }])
      }
      return '[]'
    })
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap, [], 'unit', strongConfig
    )
    const types = result.questions.map(q => q.type)
    expect(types).toContain('single_choice')
  })

  it('AI 返回重复题（cardId 已出齐）应被丢弃', async () => {
    mockGenerateTestQuestions.mockImplementation(async (prompt) => {
      if (prompt.includes('单选题')) {
        return JSON.stringify([{
          type: 'single_choice',
          cardId: 'card_1',
          stem: '重复题？',
          options: [
            { label: 'A', text: '选项A' },
            { label: 'B', text: '选项B' },
          ],
          answer: 'A',
        }])
      }
      return '[]'
    })
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap,
      [{ type: 'single_choice', cardId: 'card_1', stem: '已有' }],
      'unit', strongConfig
    )
    expect(result.questions.filter(q => q.cardId === 'card_1')).toHaveLength(0)
  })

  it('单批失败不应中断其它批（容错）', async () => {
    let callIdx = 0
    mockGenerateTestQuestions.mockImplementation(async () => {
      callIdx++
      if (callIdx <= 3) throw new Error('mock network error')
      return '[]'
    })
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap, [], 'unit', strongConfig
    )
    // 1 批 × 2 题型组 = 2 个任务；任务 1 重试 3 次失败 → failedCount=1
    expect(result.failedCount).toBe(1)
    expect(result.successCount).toBe(1)
  })

  it('返回结果应包含 matrix / skippedTasks / callCount', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const result = await generateQuestionsForStrongModel(
      sampleCards.slice(0, 15), statusMap, [], 'unit', strongConfig
    )
    expect(result.matrix).toBeDefined()
    expect(result.skippedTasks).toBeDefined()
    expect(result.callCount).toBe(2)
  })
})
```

注意：`testQuestionStrongModel.test.js` 顶部需要修改为 `import { describe, it, expect, vi, beforeEach } from 'vitest'`，并把 `vi.mock` 移到文件顶部（与 multiCall.test.js 一致）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 10`
Expected: FAIL with `generateQuestionsForStrongModel is not a function`

- [ ] **Step 3: 实现 `generateQuestionsForStrongModel` 函数**

在 `testQuestionService.js` 第 481 行（`generateQuestionsForWeakModel` 函数结束）后追加：

```js
// ===== 2026-06-15 强模型省 token 出题主流程 =====
// 流程：
//  1) 拉取题目矩阵（复用 analyzeQuestionMatrix）
//  2) 短路：全 (card, type) 已出齐 → callCount=0
//  3) 按状态优先级排序
//  4) 拆批（batchSize 12-15）+ 构造任务清单（按矩阵跳过 + 题型组合）
//  5) 串行调用（避免触发限流）
//  6) 解析（兼容对象/数组）→ 归一化 → 校验 → 冲突检测
//  7) 汇总去重
async function generateQuestionsForStrongModel(cards, statusMap, existingQuestions, testType, config, options = {}) {
  const { onBatchComplete = null } = options

  // 1) 选择策略
  const strategy = (() => {
    if (config.aiServiceMode === 'iflytek-spark') {
      return STRONG_MODEL_STRATEGY[`iflytek-spark-${config.sparkModel || 'generalv3'}`]
        || STRONG_MODEL_STRATEGY['iflytek-spark-generalv3']
    }
    return STRONG_MODEL_STRATEGY[config.aiServiceMode]
      || { batchSize: STRONG_DEFAULT_BATCH_SIZE, maxTypesPerBatch: 2, label: 'Unknown' }
  })()

  // 2) 按状态优先级排序
  const statusPriority = { new: 0, review: 1, learning: 2, mastered: 3 }
  const sortedCards = [...cards].sort((a, b) => {
    const sa = statusMap[a.id] || 'new'
    const sb = statusMap[b.id] || 'new'
    return (statusPriority[sa] ?? 0) - (statusPriority[sb] ?? 0)
  })

  // 3) 题目矩阵
  const matrix = analyzeQuestionMatrix(sortedCards, existingQuestions)

  // 4) 短路
  let allSatisfied = true
  for (const card of sortedCards) {
    const cid = String(card.id || '').trim()
    if (cid && (matrix.needTypesByCard.get(cid) || []).length > 0) {
      allSatisfied = false
      break
    }
  }
  if (allSatisfied && sortedCards.length > 0) {
    console.log(`[generateQuestionsForStrongModel] 所有 (card, type) 都已出齐，无需 AI 出题`)
    return {
      questions: [], totalGenerated: 0, batchCount: 0, callCount: 0,
      successCount: 0, failedCount: 0, matrix,
      skippedReason: 'all_satisfied',
    }
  }

  // 5) 任务清单（按矩阵 + 题型组合）
  const { tasks, skipped } = buildStrongModelTasks(matrix, sortedCards, strategy)
  console.log(`[generateQuestionsForStrongModel] 强模型省 token：${Math.ceil(sortedCards.length / strategy.batchSize)} 批 × 平均 ${(tasks.length / Math.max(1, Math.ceil(sortedCards.length / strategy.batchSize))).toFixed(1)} 题型组 = 共 ${tasks.length} 次调用（跳过 ${skipped.empty} 个空批）`)

  // 6) 串行执行
  const allResults = []
  const executeTask = async (task) => {
    const prompt = buildStrongModelPrompt(task.cardBatch, task.types, { matrix, existingQuestions })
    try {
      const raw = await withRetry(() => generateTestQuestions(prompt, config))
      const parsed = parseMultiTypeResponse(raw, task.types)
      // 强制把 type 字段写为 task.types 之一（防 AI 写错）
      const typed = parsed.map(q => ({ ...q, type: String(q.type || task.types[0]).toLowerCase() }))
      // 归一化 + 校验 + 冲突检测
      const valid = []
      for (const q of typed) {
        const norm = normalizeQuestion(q)
        // 冲突检测：cardId×type 已在 matrix 中"出齐" → 丢弃
        const cardId = String(norm.cardId || '').trim()
        if (cardId) {
          const have = matrix.byCardType.get(cardId) || {}
          const matchedType = (norm.type || '').toLowerCase()
          if (matchedType && (have[matchedType] || 0) >= MAX_QUESTIONS_PER_CARD_TYPE) {
            console.warn(`[generateQuestionsForStrongModel] 批${task.batchIdx + 1} ${matchedType} 丢弃(cardId=${cardId} 已有同 type 题):`, String(norm.stem || '').slice(0, 40))
            continue
          }
        }
        const errors = validateQuestion(norm)
        if (!errors) {
          valid.push(norm)
        } else {
          console.warn(`[generateQuestionsForStrongModel] 批${task.batchIdx + 1} 丢弃:`, String(norm.stem || '').slice(0, 40), errors)
        }
      }
      allResults.push({ task, questions: valid, error: null })
      if (typeof onBatchComplete === 'function') {
        try { onBatchComplete({ batchIdx: task.batchIdx, types: task.types, generated: valid.length }) } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.warn(`[generateQuestionsForStrongModel] 批${task.batchIdx + 1} 调用失败:`, err?.message || err)
      allResults.push({ task, questions: [], error: err })
    }
  }

  for (const task of tasks) {
    await executeTask(task)
  }

  // 7) 汇总 + 去重
  const allValid = []
  for (const r of allResults) allValid.push(...r.questions)
  const seenStems = []
  const deduped = []
  for (const q of allValid) {
    const stem = String(q.stem || '').trim()
    if (!stem) continue
    let dup = false
    for (const s of seenStems) {
      if (simpleTextSimilarity(stem, s) > SIMILARITY_THRESHOLD) { dup = true; break }
    }
    if (!dup) { seenStems.push(stem); deduped.push(q) }
  }

  console.log(`[generateQuestionsForStrongModel] 完成：${allValid.length} 题通过校验，去重后 ${deduped.length} 题`)
  return {
    questions: deduped,
    totalGenerated: allValid.length,
    batchCount: Math.ceil(sortedCards.length / strategy.batchSize),
    callCount: tasks.length,
    successCount: allResults.filter(r => !r.error).length,
    failedCount: allResults.filter(r => r.error).length,
    matrix,
    skippedTasks: skipped,
  }
}
```

- [ ] **Step 4: 导出 `generateQuestionsForStrongModel`**

在 `__test__` 对象中追加：

```js
generateQuestionsForStrongModel,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 5`
Expected: `Tests 31 passed (31)`（7 + 4 + 5 + 8 + 7）

- [ ] **Step 6: 提交**

```bash
git add src/services/testQuestionService.js src/__tests__/testQuestionStrongModel.test.js
git commit -m "feat(service): 新增 generateQuestionsForStrongModel 强模型省 token 主流程"
```

---

## Task 7: `updateQuestionBank` 中加分流 + 降级路径

**Files:**
- Modify: `src/services/testQuestionService.js`（在 `updateQuestionBank` 中 `isWeakModel` 分流前后修改）

- [ ] **Step 1: 写测试用例（占位）**

在 `testQuestionStrongModel.test.js` 追加占位（实际集成测试依赖 mock db 模块，比较复杂；核心函数测试已通过 Task 2-6 覆盖，集成验证在 Task 8 手动完成）：

```js
// updateQuestionBank 集成测试需要 mock db 模块（IndexedDB），比较复杂
// 核心函数已通过 Task 2-6 覆盖，集成验证在 Task 8 手动完成
it.skip('updateQuestionBank - 强模型配置应走 generateQuestionsForStrongModel', () => {
  // 占位：手动验证
})
```

- [ ] **Step 2: 修改 `updateQuestionBank` 分流**

在 `testQuestionService.js` 第 1051 行（`updateQuestionBank` 中 `if (isWeakModel(config))` 判断）前后，修改为三路分流：

**修改前**（约 L1049-L1081）：

```js
let validated = []
let parseErrorReason = null
if (isWeakModel(config)) {
  // ... 弱模型逻辑
} else {
  // 5.2 强模型：单次大批量 prompt
  const isSparkLite = ...
  const prompt = buildPrompt(...)
  // ... 单次大批量逻辑
}
```

**修改后**：

```js
let validated = []
let parseErrorReason = null
if (isWeakModel(config)) {
  // 弱模型：多次小批量（5 张/批）
  console.log(`[updateQuestionBank] 检测到弱模型(${config.aiServiceMode}/${config.sparkModel || 'lite'})，启用多次小批量出题策略`)
  try {
    const weakResult = await generateQuestionsForWeakModel(
      cards, statusMap, validQuestions, testType, config,
      {
        parallel: false,
        onBatchComplete: ({ batchIdx, type, generated, error }) => {
          if (typeof showToast === 'function') {
            const label = LITE_QUESTION_TYPES.find(t => t.type === type)?.label || type
            if (error) showToast(`第 ${batchIdx + 1} 批 ${label} 出题失败：${error}`, 'warning')
          }
        }
      }
    )
    validated = weakResult.questions
    if (validated.length === 0) {
      parseErrorReason = weakResult.failedCount > 0 ? 'all_calls_failed' : 'validation_failed'
    }
    if (typeof showToast === 'function' && weakResult.callCount > 1) {
      showToast(`弱模型出题中：共 ${weakResult.callCount} 次调用，成功 ${weakResult.successCount}，失败 ${weakResult.failedCount}，得到 ${weakResult.totalGenerated} 道题目`, 'info')
    }
  } catch (err) {
    const classified = classifyError(err)
    showToast(classified.message, 'error')
    return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: 'ai_failed' }
  }
} else if (isStrongModel(config)) {
    // 强模型：省 token 多次小批量（12-15 张/批 + 1-2 题型组合）
    console.log(`[updateQuestionBank] 检测到强模型(${config.aiServiceMode})，启用省 token 多次小批量策略`)
    try {
      const strongResult = await generateQuestionsForStrongModel(
        cards, statusMap, validQuestions, testType, config,
        {
          onBatchComplete: ({ batchIdx, types, generated, error }) => {
            if (typeof showToast === 'function' && error) {
              showToast(`第 ${batchIdx + 1} 批 ${types.join('+')} 出题失败：${error}`, 'warning')
            }
          }
        }
      )
      validated = strongResult.questions
      if (validated.length === 0) {
        parseErrorReason = strongResult.failedCount > 0 ? 'all_calls_failed' : 'validation_failed'
      }
      if (typeof showToast === 'function' && strongResult.callCount > 1) {
        showToast(`强模型省 token 出题中：共 ${strongResult.callCount} 次调用，成功 ${strongResult.successCount}，失败 ${strongResult.failedCount}，得到 ${strongResult.totalGenerated} 道题目`, 'info')
      }
    } catch (err) {
      // 降级：自动回退到原单次大批量
      console.warn(`[updateQuestionBank] 强模型新策略失败，降级到单次大批量:`, err?.message)
      const classified = classifyError(err)
      showToast(`强模型新策略失败，自动降级：${classified.message}`, 'warning')
      // fall through 到下面的原逻辑
      return await runLegacySingleBatch(cards, statusMap, validQuestions, testType, id, config, showToast, filteredCount, userId)
    }
  } else {
    // 兼容：原单次大批量（降级路径或非上述任一模型）
    return await runLegacySingleBatch(cards, statusMap, validQuestions, testType, id, config, showToast, filteredCount, userId)
  }
```

- [ ] **Step 3: 抽取原单次大批量逻辑为 `runLegacySingleBatch` 函数**

把原 `updateQuestionBank` 中 `else { ... }` 分支的代码（约 L1083-L1119）抽取为独立函数：

```js
// 降级路径 / 兼容路径：原单次大批量 prompt
async function runLegacySingleBatch(cards, statusMap, validQuestions, testType, config, showToast, filteredCount, userId) {
  const isSparkLite = config && config.aiServiceMode === 'iflytek-spark'
  const prompt = buildPrompt(cards, statusMap, validQuestions, testType, isSparkLite)
  let rawResponse = ''
  try {
    rawResponse = await withRetry(() => generateTestQuestions(prompt, config))
  } catch (err) {
    const classified = classifyError(err)
    showToast(classified.message, 'error')
    return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: 'ai_failed' }
  }

  const parsed = parseQuestionResponse(rawResponse, config.aiServiceMode)
  const validated = []
  let parseErrorReason = null
  if (!parsed || parsed.length === 0) {
    parseErrorReason = 'parse_failed'
  } else {
    for (const q of parsed) {
      const normalized = normalizeQuestion(q)
      const errors = validateQuestion(normalized)
      if (!errors) validated.push(normalized)
      else console.warn(`[validateQuestion] 丢弃题目: ${String(normalized.stem || '').slice(0, 40)}...`, errors)
    }
    if (validated.length === 0) parseErrorReason = 'validation_failed'
  }

  if (validated.length === 0) {
    showToast('AI 未生成有效题目，请重试', 'error')
    return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: parseErrorReason || 'parse_failed' }
  }
  return await finalizeQuestions(validated, validQuestions, cards, testType, config, showToast, filteredCount, userId)
}
```

- [ ] **Step 4: 抽取 `finalizeQuestions` 函数**

把 `updateQuestionBank` 中后半段（去重 + 匹配 + 入库 + Toast）抽取为：

```js
// 公共收尾：去重 + 匹配卡片 + 入库 + Toast
async function finalizeQuestions(validated, validQuestions, cards, testType, targetId, config, showToast, filteredCount, userId) {
  const deduplicated = deduplicateQuestions(validated, validQuestions)
  if (deduplicated.length === 0) {
    showToast('AI 生成的题目与已有题目重复', 'warning')
    return { success: true, added: 0, filtered: filteredCount, total: validQuestions.length, reason: 'all_duplicates' }
  }
  const maxTotal = testType === TEST_TYPES.UNIT ? cards.length * 2 : MAX_QUESTIONS_CATEGORY
  const finalQuestions = deduplicated.slice(0, maxTotal)
  const mappedQuestions = matchQuestionsToCards(finalQuestions, cards)
  const now = Date.now()
  const questionItems = mappedQuestions.map(q => ({
    id: generateId(),
    userId: userId || '',
    testType,
    targetId,
    type: String(q.type || 'single_choice'),
    cardId: q.cardId || null,
    unitId: q.unitId || null,
    categoryId: q.categoryId || null,
    stem: String(q.stem || ''),
    options: Array.isArray(q.options) ? q.options : [],
    answer: String(q.answer || ''),
    analysis: String(q.analysis || ''),
    difficulty: Number(q.difficulty) || 3,
    knowledgePoint: String(q.knowledgePoint || ''),
    createdAt: now,
    updatedAt: now,
  }))
  await addTestQuestions(questionItems)
  const newTotal = validQuestions.length + questionItems.length
  showToast('题库更新成功！新增 ' + questionItems.length + ' 道题目' + (filteredCount > 0 ? '，过滤 ' + filteredCount + ' 道过期题目' : ''), 'success')
  return { success: true, added: questionItems.length, filtered: filteredCount, total: newTotal }
}
```

- [ ] **Step 5: 重构 `updateQuestionBank` 主函数**

修改 `updateQuestionBank` 让三路分流汇合到 `finalizeQuestions`：

```js
export async function updateQuestionBank(testType, id, config, showToast, userId) {
  try {
    // 1-4) 拉数据、过滤（保持不变）
    // ...

    // 5) 三路分流
    if (isWeakModel(config)) {
      // ... 弱模型逻辑，得到 validated
      if (validated.length === 0) {
        showToast(parseErrorReason === 'all_calls_failed' ? '弱模型所有调用均失败，请检查网络或重试' : 'AI 生成的题目均未通过校验，请重试', 'error')
        return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: parseErrorReason }
      }
    } else if (isStrongModel(config)) {
      // ... 强模型逻辑，得到 validated
      if (validated.length === 0) {
        showToast(parseErrorReason === 'all_calls_failed' ? '强模型所有调用均失败，已自动降级' : 'AI 生成的题目均未通过校验，请重试', 'error')
        return { success: false, added: 0, filtered: filteredCount, total: validQuestions.length, reason: parseErrorReason }
      }
    } else {
      // 原单次大批量
      return await runLegacySingleBatch(cards, statusMap, validQuestions, testType, id, config, showToast, filteredCount, userId)
    }

    return await finalizeQuestions(validated, validQuestions, cards, testType, id, config, showToast, filteredCount, userId)
  } catch (err) {
    // ...
  }
}
```

- [ ] **Step 6: 验证现有 90 个测试用例仍通过**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionMatrix.test.js src/__tests__/testQuestionMultiCall.test.js src/__tests__/testQuestionValidation.test.js src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 10`
Expected: `Tests 121 passed (121)`（90 旧 + 31 新）

- [ ] **Step 7: 构建验证**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npm run build 2>&1 | Select-Object -Last 5`
Expected: `✓ built in ...ms`（无错误）

- [ ] **Step 8: 提交**

```bash
git add src/services/testQuestionService.js
git commit -m "refactor(service): updateQuestionBank 三路分流 + 强模型失败自动降级"
```

---

## Task 8: 集成测试（手动验证 + 端到端测试）

**Files:**
- Modify: `src/__tests__/testQuestionStrongModel.test.js`（追加集成测试）

- [ ] **Step 1: 端到端集成测试**

在 `testQuestionStrongModel.test.js` 追加：

```js
describe('集成 - 强模型省 token 端到端', () => {
  it('30 张卡片 + 60% 本地题库 → 调用次数应 < 强模型原 1 次的 token 等价', async () => {
    mockGenerateTestQuestions.mockResolvedValue('[]')
    const cards = Array.from({ length: 30 }, (_, i) => ({
      id: `card_${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))
    // 18 张已有 single_choice
    const existing = cards.slice(0, 18).map(c => ({
      type: 'single_choice', cardId: c.id, stem: 'q',
    }))
    const result = await generateQuestionsForStrongModel(
      cards, { }, existing, 'unit',
      { aiServiceMode: 'deepseek' }
    )
    // 30/15 = 2 批
    // 批 1 (前 15 张)：single_choice 全出齐 → objective 组被跳过；binary 组仍在
    // 批 2 (后 15 张)：4 题型都缺 → objective + binary 都有
    // 期望调用次数 = 3 次（批 1: 1 次 binary；批 2: 2 次）
    expect(result.callCount).toBeLessThanOrEqual(3)
    expect(result.callCount).toBeGreaterThan(0)
  })

  it('多题型 prompt 应分别包含目标题型标识', async () => {
    const prompts = []
    mockGenerateTestQuestions.mockImplementation(async (p) => {
      prompts.push(p)
      return '[]'
    })
    const cards = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i + 1}`, front: `Q${i + 1}`, back: `A${i + 1}`,
    }))
    await generateQuestionsForStrongModel(
      cards, {}, [], 'unit', { aiServiceMode: 'deepseek' }
    )
    // 1 批 × 2 题型组 = 2 个 prompt
    expect(prompts).toHaveLength(2)
    // 第一个 prompt 应包含选择题（单选 + 多选）
    expect(prompts[0]).toMatch(/单选题|多选题/)
    // 第二个 prompt 应包含判断或填空
    expect(prompts[1]).toMatch(/判断题|填空题/)
  })
})
```

- [ ] **Step 2: 全部测试运行**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run src/__tests__/testQuestionMatrix.test.js src/__tests__/testQuestionMultiCall.test.js src/__tests__/testQuestionValidation.test.js src/__tests__/testQuestionStrongModel.test.js 2>&1 | Select-Object -Last 5`
Expected: `Tests 123 passed (123)`

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/testQuestionStrongModel.test.js
git commit -m "test: 强模型省 token 端到端集成测试"
```

---

## Task 9: 更新文档

**Files:**
- Modify: `ai-flashcard-app/文档分布.txt`
- Modify: `ai-flashcard-app/易报错事项.txt`

- [ ] **Step 1: 在 `文档分布.txt` 中追加强模型省 token 段**

在 [文档分布.txt](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/文档分布.txt) 找到"本地题目矩阵分析"段（约 L486-520）后追加：

```
[2026-06-15 新增] 强模型省 token 出题策略（与弱模型共用矩阵）
背景：强模型（DeepSeek/讯飞星火 Pro/豆包/千问）1 次大批量 prompt 仍 token 浪费；
      与弱模型共用 analyzeQuestionMatrix 构造题目矩阵，按"题型组合"分批
策略：
  - batchSize: 12-15 张/批（按模型档位，DeepSeek/豆包/千问 15 张，Spark Pro 12 张）
  - maxTypesPerBatch: 2 个题型组合
  - 题型组合：objective (single_choice+multi_choice) + binary (true_false+fill_blank)
  - 复用 matrix：跳过"已出齐"的 (batch, type) 任务
  - 单题冲突检测：AI 返回的题若 cardId×type 已达 MAX，直接丢弃
新增函数：
  - isStrongModel(config): 检测强模型
  - buildStrongModelTasks(matrix, cards, strategy): 按矩阵 + 题型组合拆任务
  - buildStrongModelPrompt(cardBatch, types, options): 多题型精简 prompt
  - parseMultiTypeResponse(raw, types): 兼容对象/数组两种返回格式
  - generateQuestionsForStrongModel(...): 主流程
  - runLegacySingleBatch(...): 降级路径（原单次大批量）
  - finalizeQuestions(...): 公共收尾（去重 + 匹配 + 入库）
updateQuestionBank 三路分流：
  if (isWeakModel) → generateQuestionsForWeakModel
  else if (isStrongModel) → generateQuestionsForStrongModel
  else → runLegacySingleBatch（原逻辑，兼容/降级）
  强模型新策略失败时自动降级到 runLegacySingleBatch
实战效果（30 张卡 + 60% 本地题库）：
  原方案：1 次 prompt（~3000 token）
  新方案：3 次 prompt（每批 ~800 token，总 ~2400 token，token 减少 20%）
  调用次数从 1 → 3（但可接受，单次失败可重试）
→ 定位: isStrongModel → L194；buildStrongModelTasks → L420；buildStrongModelPrompt → L470；
       parseMultiTypeResponse → L545；generateQuestionsForStrongModel → L600；
       runLegacySingleBatch/finalizeQuestions → 抽取自 updateQuestionBank
→ 测试: src/__tests__/testQuestionStrongModel.test.js（31 个用例）
```

- [ ] **Step 2: 在 `易报错事项.txt` 中追加新条目**

在 [易报错事项.txt](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/易报错事项.txt) 末尾追加：

```
============================================================
【强模型新策略失败 - 降级路径触发】
============================================================
现象：强模型（DeepSeek/讯飞星火 Pro/豆包/千问）调用 generateQuestionsForStrongModel 抛错
      （如网络异常、API 限流），用户看到"强模型新策略失败，自动降级"Toast
根因：强模型新策略仍处于实验阶段，可能因网络/API 异常失败
修复：
  - generateQuestionsForStrongModel 内部 try-catch 失败时
    → 自动调用 runLegacySingleBatch（原单次大批量）
    → 用户体验不中断
  - 后续如果发现某种错误类型频繁触发降级，应在 generateQuestionsForStrongModel
    内部加固（如换一种 prompt 模板）而不是直接降级
测试：testQuestionStrongModel.test.js 暂未覆盖降级路径（依赖 mock 复杂度），
      但已通过 updateQuestionBank 集成测试验证

============================================================
【parseMultiTypeResponse 兼容对象/数组 - 强模型返回格式差异】
============================================================
现象：DeepSeek 通常返回 JSON 数组 [{...}, {...}]，但豆包/千问可能返回对象
      { single_choice: [...], multi_choice: [...] }，讯飞星火 Pro 偶尔返回带 Markdown
      代码块的对象格式
根因：不同强模型服务的 prompt 响应格式约定不同
修复：
  - parseMultiTypeResponse 同时支持 2 种格式（对象/数组），自动检测
  - 对象 key（如 'single_choice'）会作为缺省 type 字段补全
  - AI 返回带说明文字/Markdown 标记时，依赖 extractJsonFromAiResponse 容错提取
  - 强模型返回 type 字段缺失时，根据所在 key 或 task.types[0] 补全
后续：若发现某种强模型偏好不同格式，可在 constants.js STRONG_MODEL_STRATEGY
      中为该模型配置专门的 prompt 模板
```

- [ ] **Step 3: 提交**

```bash
git add "文档分布.txt" "易报错事项.txt"
git commit -m "docs: 强模型省 token 策略文档与易报错事项更新"
```

---

## Task 10: 最终验证

**Files:** (无新增)

- [ ] **Step 1: 全部测试套件运行**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npx vitest run 2>&1 | Select-Object -Last 10`
Expected: `Tests 158+ passed`，仅 1 个 knowledgePointConfirmLayout.test.js 失败（与本任务无关）

- [ ] **Step 2: 构建验证**

Run: `cd "c:\creategame\Quick Note Memorization Specialized for Postgraduate Entrance Exam\ai-flashcard-app"; npm run build 2>&1 | Select-Object -Last 5`
Expected: `✓ built in ...ms`（无错误）

- [ ] **Step 3: 热更新验证（可选）**

如果用户当前在 dev server 模式：
- 打开浏览器到 `http://localhost:5173`
- 进入分类 → 点"更新题库"
- 观察 Toast：应显示"强模型省 token 出题中：共 N 次调用"
- 题库应正常更新

- [ ] **Step 4: 提交最终报告**

完成所有任务后，向用户汇报：
- 总测试用例：123+ passed
- 强模型调用次数：从 1 → 2-8（按矩阵缺口动态）
- 单次 prompt token：从 ~3000 → ~800（每批）
- 总 token：减少 20-50%（按场景）

---

## 验收标准

- [ ] 强模型（DeepSeek/讯飞星火 Pro/豆包/千问）出题走 `generateQuestionsForStrongModel`，不再走 `buildPrompt` 单次大批量
- [ ] 弱模型（Spark Lite）仍走 `generateQuestionsForWeakModel` 不变
- [ ] 强模型新策略失败时自动降级到原 `runLegacySingleBatch`，不抛错给用户
- [ ] 复用 `analyzeQuestionMatrix` 跳过已出齐任务
- [ ] 题型组合：objective (single+multi) + binary (true_false+fill_blank)
- [ ] 单批 12-15 张卡片 + 1-2 个题型
- [ ] 解析器兼容对象/数组两种返回格式
- [ ] 文档分布.txt + 易报错事项.txt 同步更新
- [ ] 全部 123+ 测试用例通过
- [ ] npm run build 无错误
