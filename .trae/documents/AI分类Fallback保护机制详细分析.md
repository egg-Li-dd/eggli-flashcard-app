# AI 分类 Fallback 保护机制详细分析

## 一、概述

当 AI 分类过程中出现以下情况时，系统会触发 fallback 保护机制：
1. **AI 超时**：AI 响应超过 60 秒无响应
2. **assignments 缺失**：AI 返回的 assignments 不完整，部分卡片未被归类

Fallback 的核心策略是：利用用户已确认的主题分组（finalTopics）作为兜底依据，将未分类的卡片按主题进行聚合，而不是为每张卡片单独创建章节/单元。

---

## 二、数据结构定义

### 2.1 finalTopics（用户确认的主题分组）

```javascript
finalTopics = [
  {
    topicName: "函数与极限",      // 主题名称
    pointIndices: [0, 1, 2, 3],   // 属于该主题的知识点索引数组
  },
  {
    topicName: "导数与微分",
    pointIndices: [4, 5, 6, 7, 8],
  },
  // ...
]
```

### 2.2 flatNewCards（生成的卡片数组）

```javascript
flatNewCards = [
  {
    front: "问题1",
    back: "答案1",
    knowledge_point: "知识点内容",
    kpIndex: 0,      // 关联的知识点在原始数组中的索引
    kpMarker: "__KP_0__",
  },
  // ...
]
```

### 2.3 assignments（卡片归类结果）

```javascript
assignments = [
  {
    cardIndex: 0,           // 卡片在 flatNewCards 中的索引
    chapterId: "xxx",       // 已有章节 ID（优先使用）
    unitId: "yyy",          // 已有单元 ID
    newChapterName: null,   // 新章节名称（二选一）
    newUnitName: null,      // 新单元名称（二选一）
  },
  // ...
]
```

---

## 三、Fallback 触发场景

### 场景 A：assignments 缺失部分卡片

**位置**：`Category.jsx` 第 832-863 行

**触发条件**：AI 分类返回的 `assignments` 中，部分卡片的索引不存在

**判断逻辑**：
```javascript
const assignedIndices = new Set()
for (const ass of assignmentsSafe) {
  if (ass && typeof ass.cardIndex === 'number') {
    assignedIndices.add(ass.cardIndex)
  }
}
const missingCount = flatNewCards.length - assignedIndices.size
if (missingCount > 0) {
  // 触发 fallback
}
```

---

### 场景 B：AI 超时

**位置**：`Category.jsx` 第 977-1013 行

**触发条件**：
```javascript
catch (e) {
  if (e instanceof AiTimeoutError || (e?.name === 'AiTimeoutError') || String(e?.message || '').includes('超时')) {
    // 触发 fallback
  }
}
```

---

## 四、Fallback 核心流程

### 4.1 构建 kpIndex → TopicName 映射

```javascript
const kpIndexToTopic = new Map()
for (const topic of finalTopics) {
  for (const kpIdx of topic.pointIndices) {
    kpIndexToTopic.set(kpIdx, topic.topicName)
  }
}
```

**映射示例**：
```
0 → "函数与极限"
1 → "函数与极限"
2 → "函数与极限"
3 → "函数与极限"
4 → "导数与微分"
5 → "导数与微分"
...
```

**作用**：通过卡片的 `kpIndex` 快速找到其所属主题名称

### 4.2 为未分配/所有卡片生成分配

**场景 A（部分缺失）**：
```javascript
for (let i = 0; i < flatNewCards.length; i++) {
  if (!assignedIndices.has(i)) {  // 只处理未分配的
    const card = flatNewCards[i]
    const kpIndex = card.kpIndex ?? i
    const topicName = kpIndexToTopic.get(kpIndex) || card.knowledge_point || '未归类'
    const unitName = String(topicName).slice(0, 16)
    assignmentsSafe[i] = {
      unitId: null,
      newUnitName: unitName,
      chapterId: null,
      newChapterName: String(topicName).slice(0, 12)
    }
  }
}
```

**场景 B（AI 超时，全部使用 fallback）**：
```javascript
const fallbackAssignments = []
for (let i = 0; i < flatNewCards.length; i++) {
  const card = flatNewCards[i]
  const kpIndex = card.kpIndex ?? i
  const topicName = kpIndexToTopic.get(kpIndex) || card.knowledge_point || '未归类'
  fallbackAssignments.push({
    cardIndex: i,
    chapterId: null,
    unitId: null,
    newChapterName: String(topicName).slice(0, 12),
    newUnitName: String(topicName).slice(0, 16),
  })
}
```

---

## 五、数据传递逻辑图

```
用户确认主题
     │
     ▼
┌─────────────────────────────────────┐
│  TopicConfirmModal.handleConfirm    │
│  finalTopics: [{topicName, pointIndices}] │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│  handleTopicConfirm()               │
│  调用 classifyCardsByCategoryContent │
└─────────────────────────────────────┘
     │
     ├─── 成功 ───▶ 正常处理 assignments
     │
     └─── 异常 ──┬── 超时 ──▶ Fallback（场景B）
                 │
                 └── 缺失卡片 ──▶ Fallback（场景A）

     ┌──────────────────────────────┐
     │  Fallback 处理               │
     │  1. 构建 kpIndexToTopic Map   │
     │  2. 遍历 flatNewCards        │
     │  3. 根据 kpIndex 查找主题名   │
     │  4. 生成 newChapterName      │
     │     (topicName.slice(0,12)) │
     │  5. 生成 newUnitName         │
     │     (topicName.slice(0,16)) │
     └──────────────────────────────┘
                │
                ▼
     ┌──────────────────────────────┐
     │  后续处理                     │
     │  • newChapterNameToCards Map │
     │  • newUnitNameToCards Map     │
     │  • mergeSimilarUnits()       │
     │  • 显示 NewCardPanel          │
     └──────────────────────────────┘
```

---

## 六、关键代码位置

| 功能 | 文件 | 行数 |
|------|------|------|
| 主题确认回调 | Category.jsx | 712-1029 |
| Fallback 场景 A（缺失卡片） | Category.jsx | 832-863 |
| Fallback 场景 B（AI 超时） | Category.jsx | 977-1013 |
| 超时确认对话框 | Category.jsx | 1064-1090+ |
| 构建 kpIndexToTopic | Category.jsx | 846-851 / 988-993 |
| classifyCardsByKnowledgePointsMultiRound | aiService.js | 2785-2900 |

---

## 七、Fallback 效果对比

### 优化前（旧策略）
每张未分配卡片单独创建章节/单元：
```
卡片0 → 新章节A（函数与极限前12字）、新单元A（函数与极限前16字）
卡片1 → 新章节B（导数与微分前12字）、新单元B（导数与微分前16字）
卡片2 → 新章节C（积分计算前12字）、新单元C（积分计算前16字）
...
结果：40 张卡片 → 40 个章节/单元（极度碎片化）
```

### 优化后（新策略 - 基于主题）
同主题的卡片聚合到同一章节/单元：
```
卡片0-3 → 章节"函数与极限"、单元"函数与极限"
卡片4-8 → 章节"导数与微分"、单元"导数与微分"
卡片9-15 → 章节"积分计算"、单元"积分计算"
...
结果：40 张卡片 → 4-10 个章节/单元（符合合理结构）
```

---

## 八、注意事项

1. **kpIndex 的来源**：卡片生成时通过 `attachOriginalKnowledgePoints` 函数附着 `kpIndex`（卡片在数组中的位置索引）
2. **优先级**：`kpIndexToTopic.get(kpIndex)` > `card.knowledge_point` > `'未归类'`
3. **切片限制**：章节名 ≤12 字，单元名 ≤16 字（保证数据库存储不超长）
4. **仅在必要时触发**：场景 A 只补充分配缺失的卡片，不影响已正常分配的卡片
