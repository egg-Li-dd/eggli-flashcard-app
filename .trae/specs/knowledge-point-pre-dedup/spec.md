# 知识点预去重机制 Spec

## Why

当前系统存在两个问题：

1. **知识点去重缺失**：AI 生成知识点后，直接进入卡片生成流程，没有与本分类现有知识点进行去重。用户重复输入相同的40个知识点，只检测到2个重复卡片，说明去重逻辑滞后且效果差。

2. **主题数量与章节数量不一致**：用户确认5个主题，但新卡片预览显示7个章节。这是因为主题聚类与卡片分类是两套独立逻辑，AI 在分类时可能基于卡片内容创建新章节。

用户希望在卡片生成前（知识点阶段）就完成知识点去重，而不是生成卡片后再检测重复。

## What Changes

* 新增 `deduplicateKnowledgePoints` 函数：在 `clusterKnowledgePointsByTopic` 之前调用，对 AI 生成的临时知识点与本分类现有知识点进行批量相似度比对

* 支持强模型和弱模型两种调用路径：根据 `aiServiceMode` 和模型能力选择最优方案

* 修改 `handleKpConfirm` 流程：在主题聚类之前先进行知识点去重

* 知识点去重结果通过界面展示给用户

## Impact

* Affected specs: `spark-lite-topic-cluster`（主题聚类流程）

* Affected code: `src/services/aiService.js`、`src/services/iflytekAi.js`、`src/pages/Category.jsx`

***

## 核心概念定义

### 强模型 vs 弱模型

| 特性     | 强模型                       | 弱模型                |
| ------ | ------------------------- | ------------------ |
| 代表     | DeepSeek-V4, 豆包Pro, 千问3.5 | Spark Lite         |
| 上下文窗口  | 32K-128K tokens           | 4K-8K tokens       |
| 单次处理能力 | 300-500 个知识点              | 30-50 个知识点         |
| 响应稳定性  | 高（格式一致性好）                 | 低（可能返回 markdown 块） |
| 成本     | 较高                        | 极低                 |

### 批处理数量（batchSize）的实际意义

批处理数量是受限于**模型输出能力**而非输入能力：

1. **强模型**：虽然输入可以很长，但输出 JSON 的元素数量有限制。超过 50 个判定结果时，AI 容易遗漏或格式混乱。**推荐 batchSize = 30-50**

2. **弱模型**：上下文窗口和输出能力都受限。超过 30 个判定结果时，格式错误率显著上升。**推荐 batchSize = 20-30**

3. **现有知识点数量**：不影响 batchSize，但影响比对次数。当现有知识点 > 100 时，需要在 prompt 中截断或分批传入。

***

## 数据流设计

### 优化后流程

```
用户输入文本
    ↓
extractKnowledgePoints() → 提取知识点（临时知识点）
    ↓
getExistingKnowledgePointsByCategory() → 获取本分类现有知识点
    ↓
deduplicateKnowledgePoints() → **新增：知识点级别去重**
    ↓
clusterKnowledgePointsByTopic() → 主题聚类（基于去重后知识点）
    ↓
用户确认主题
    ↓
generateCardsFromKnowledgePoints() → 生成卡片
    ↓
classifyCardsByCategoryContent() → 卡片分类
```

***

## 函数设计

### deduplicateKnowledgePoints（主函数）

```javascript
/**
 * 知识点预去重：AI生成的临时知识点与本分类现有知识点进行批量相似度比对
 * 
 * @param {string[]} tempKnowledgePoints - AI生成的临时知识点数组
 * @param {string[]} existingKnowledgePoints - 本分类现有的知识点数组
 * @param {object} aiConfig - AI配置 { apiKey, aiServiceMode, model, sparkApiKey, ... }
 * @param {function} onProgress - 进度回调 (step, current, total) => void
 * @returns {object} { uniquePoints: string[], duplicatePairs: [], stats: {} }
 */
async function deduplicateKnowledgePoints(tempKnowledgePoints, existingKnowledgePoints, aiConfig, onProgress)
```

### 强模型调用方案

#### 适用场景

* `aiServiceMode === 'deepseek'` (DeepSeek-V4)

* `aiServiceMode === 'volcano'` (豆包Pro)

* `aiServiceMode === 'dashscope'` (千问3.5+)

* 临时知识点数量：30-100 个

* 现有知识点数量：0-500 个

#### 强模型 batchSize 设计

```javascript
// 强模型批处理配置
const STRONG_MODEL_BATCH = {
  maxBatchSize: 50,           // 每批最大知识点数
  maxExistingInPrompt: 100,    // prompt 中最多带入的现有知识点
  similarityThreshold: 0.75,    // 相似度阈值
  enableLocalFallback: true,   // 启用本地关键词快速预筛
};
```

#### 强模型 AI 比对 Prompt

```
你是一个知识点去重助手。请判断【待检测知识点】中的每一个知识点是否与【现有知识点】中的某个知识点语义相同或高度相似。

【高度相似】的定义：表达相同或相近的知识概念，可以有不同的表述方式。例如"函数的概念"与"函数定义"高度相似。

【待检测知识点】（共 N 个）：
{index}. {content}

【现有知识点】（共 M 个，从本分类卡片中提取）：
{index}. {content}

【输出格式】请严格以 JSON 数组格式返回，不要任何其他文字：
[
  {"tempIndex": 0, "isDuplicate": true/false, "matchedExistingIndex": 0-9, "similarity": 0.XX, "reason": "简短原因"}
]

注意：
- similarity 取值范围 0.00-1.00
- 只有 similarity > 0.75 时才标记 isDuplicate: true
- 即使不重复，也需要返回所有 tempIndex 的判定结果
```

#### 强模型分批策略

```
场景：临时知识点 80 个，现有知识点 300 个

Step 1: 截断现有知识点（取前100个）→ 300 → 100
Step 2: 分批处理临时知识点：
  - 批次1: temp[0-49]  vs  existing[0-99]  → 50 个判定结果
  - 批次2: temp[50-79] vs  existing[0-99]   → 30 个判定结果
Step 3: 合并结果，返回 80 个判定
```

#### 强模型性能指标

| 指标             | 数值                   |
| -------------- | -------------------- |
| 单批处理时间         | 2-5 秒                |
| 总处理时间（80 temp） | 4-10 秒               |
| token 消耗       | \~2000-5000 tokens/批 |
| 成功率            | > 95%                |

***

### 弱模型调用方案

#### 适用场景

* `aiServiceMode === 'iflytek-spark'` 且 `model === 'lite'`

* 临时知识点数量：5-50 个

* 现有知识点数量：0-100 个

#### 弱模型 batchSize 设计

```javascript
// 弱模型批处理配置
const WEAK_MODEL_BATCH = {
  maxBatchSize: 25,            // 每批最大知识点数（比强模型小）
  maxExistingInPrompt: 50,     // prompt 中最多带入的现有知识点
  similarityThreshold: 0.70,   // 相似度阈值（稍低，减少误判）
  temperature: 0.3,           // 降低随机性
  maxTokens: 4096,             // 限制输出长度
  enableMarkdownStrip: true,   // 启用 markdown 格式剥离
};
```

#### 弱模型 AI 比对 Prompt（简化版）

```
你是一个知识点去重助手。请判断【待检测】中的每一个知识点是否与【已有】中的某个知识点重复。

【待检测】:
0. 知识点A
1. 知识点B
...

【已有】:
0. 知识点X
1. 知识点Y
...

【输出格式】JSON数组：
[{"i":0,"d":true,"m":0,"s":0.85},{"i":1,"d":false,"m":null,"s":0}]

含义：i=tempIndex, d=isDuplicate, m=matchedExistingIndex, s=similarity
```

#### 弱模型分批策略

```
场景：临时知识点 40 个，现有知识点 120 个

Step 1: 截断现有知识点（取前50个）→ 120 → 50
Step 2: 分批处理临时知识点（每批25个）：
  - 批次1: temp[0-24] vs existing[0-49]  → 25 个判定
  - 批次2: temp[25-39] vs existing[0-49] → 15 个判定
Step 3: 合并结果
```

#### 弱模型特殊处理

1. **Markdown 格式剥离**：弱模型可能返回 `json ... `   格式，需要预处理
2. **JSON 格式容错**：弱模型可能返回不完整的 JSON，需要容错解析
3. **超时处理**：弱模型响应较慢，需要 30 秒超时而非 15 秒

```javascript
// iflytekAi.js 中新增
async function deduplicateWithSpark(tempPoints, existingPoints, config) {
  // 1. 截断现有知识点
  const truncatedExisting = existingPoints.slice(0, WEAK_MODEL_BATCH.maxExistingInPrompt);
  
  // 2. 构建 prompt
  const prompt = buildDedupPrompt(tempPoints, truncatedExisting, 'concise');
  
  // 3. 调用 Spark API
  const result = await callSparkDedup(prompt, config);
  
  // 4. 预处理：剥离 markdown
  const cleaned = stripMarkdown(result.content);
  
  // 5. 容错解析
  const parsed = parseWithFallback(cleaned);
  
  return parsed;
}
```

#### 弱模型性能指标

| 指标             | 数值                   |
| -------------- | -------------------- |
| 单批处理时间         | 5-15 秒               |
| 总处理时间（40 temp） | 10-30 秒              |
| token 消耗       | \~1000-2000 tokens/批 |
| 成功率            | 70-85%（需容错处理）        |

***

## 强模型 vs 弱模型对比

| 维度           | 强模型方案 | 弱模型方案  |
| ------------ | ----- | ------ |
| batchSize    | 30-50 | 20-30  |
| 现有知识点截断      | 100   | 50     |
| 相似度阈值        | 0.75  | 0.70   |
| 单批耗时         | 2-5s  | 5-15s  |
| 总耗时(40 temp) | 4-10s | 10-30s |
| 成功率          | >95%  | 70-85% |
| 成本           | 较高    | 极低     |

***

## 返回格式

```javascript
{
  uniquePoints: ["kp1", "kp2", ...],  // 去重后的知识点
  duplicatePairs: [
    { 
      tempIndex: 5, 
      existingIndex: 2, 
      similarity: 0.82, 
      reason: "两者都描述了..." 
    },
    ...
  ],
  stats: {
    totalTemp: 40,
    totalExisting: 120,
    duplicatesFound: 5,
    uniqueCount: 35,
    processingTime: 8500,  // ms
    modelType: 'strong'     // 或 'weak'
  }
}
```

***

## 风险评估与应对

| 风险        | 级别 | 应对策略                |
| --------- | -- | ------------------- |
| AI 返回格式错误 | 中  | 容错解析 + 本地 fallback  |
| 弱模型响应超时   | 中  | 30秒超时 + 降级到本地去重     |
| 大量现有知识点   | 低  | 截断到100/50个          |
| 知识丢失      | 低  | 只过滤高相似度(>0.75)，保守去重 |

### 本地 fallback 降级策略

当 AI 调用失败时，使用本地简单比对作为兜底：

```javascript
async function localDedupFallback(tempPoints, existingPoints) {
  // 1. 精确匹配
  const exactSet = new Set(existingPoints.map(p => p.toLowerCase().trim()));
  const duplicates = tempPoints.filter(p => exactSet.has(p.toLowerCase().trim()));
  
  // 2. 子串匹配
  const partialDup = tempPoints.filter(tp => 
    !duplicates.includes(tp) && 
    existingPoints.some(ep => ep.includes(tp) || tp.includes(ep))
  );
  
  return {
    uniquePoints: tempPoints.filter(p => !duplicates.includes(p) && !partialDup.includes(p)),
    duplicatePairs: [...duplicates, ...partialDup],
    viaLocalFallback: true
  };
}
```

***

## UI 展示

### 去重结果提示

在知识点确认弹窗（KpConfirm）中显示：

```
已智能去重：从 40 个知识点中过滤 5 个重复项，剩余 35 个有效知识点
[查看过滤项]  ← 点击展开显示被过滤的知识点及原因
```

### 去重发生在哪个时机

```javascript
// handleKpConfirm 修改后的流程

// Step 1: 提取知识点（已有）
const tempPoints = await extractKnowledgePoints(inputText)

// Step 2: 获取本分类现有知识点（新增）
const existingPoints = await getExistingKnowledgePointsByCategory(categoryId)

// Step 3: 知识点去重（新增 - 在主题聚类之前）
if (existingPoints.length > 0) {
  const dedupResult = await deduplicateKnowledgePoints(tempPoints, existingPoints, aiConfig)
  if (dedupResult.stats.duplicatesFound > 0) {
    showToast(`已过滤 ${dedupResult.stats.duplicatesFound} 个重复知识点`, 'info')
  }
  pointsToUse = dedupResult.uniquePoints
} else {
  pointsToUse = tempPoints
}

// Step 4: 主题聚类（使用去重后知识点）
const topics = await clusterKnowledgePointsByTopic(pointsToUse, aiConfig)
```

***

## 兼容性设计

1. **降级策略**：如果 AI 调用失败（如超时、解析错误），降级到本地 fallback 去重
2. **空值保护**：如果 `existingKnowledgePoints` 为空，直接返回所有临时知识点
3. **分批自适应**：根据模型类型自动选择 batchSize
4. **结果合并**：多批结果合并时去重索引要修正为全局索引

***

## ADDED Requirements

### Requirement: 知识点预去重（强模型路径）

系统 SHALL 在检测到强模型时，使用 batchSize=30-50 进行批量比对。

#### Scenario: 强模型处理40个知识点

* **GIVEN** 强模型，临时知识点40个，现有知识点200个

* **WHEN** 调用 `deduplicateKnowledgePoints`

* **THEN** 一次 AI 调用完成（40 < 50）

* **AND** 现有知识点截断为100个

### Requirement: 知识点预去重（弱模型路径）

系统 SHALL 在检测到弱模型时，使用 batchSize=20-30 进行批量比对。

#### Scenario: 弱模型处理40个知识点

* **GIVEN** Spark Lite，临时知识点40个，现有知识点120个

* **WHEN** 调用 `deduplicateKnowledgePoints`

* **THEN** 分两批处理（25 + 15）

* **AND** 现有知识点截断为50个

### Requirement: 去重失败降级

系统 SHALL 在 AI 调用失败时，使用本地 fallback 继续去重。

#### Scenario: AI 不可用

* **GIVEN** AI 服务不可用

* **WHEN** `deduplicateKnowledgePoints` 抛出异常

* **THEN** 捕获异常，调用 `localDedupFallback`

* **AND** 返回本地比对结果

***

## 实现任务分解

1. 新增 `deduplicateKnowledgePoints` 主函数到 `aiService.js`
2. 新增 `deduplicateWithSpark` 弱模型专用函数到 `iflytekAi.js`
3. 新增 `localDedupFallback` 本地降级函数
4. 新增 `getExistingKnowledgePointsByCategory` 辅助函数
5. 修改 `handleKpConfirm` 集成去重调用
6. 添加去重结果的 Toast 提示

***

## 待定问题

1. **现有知识点获取**：需要确认如何从数据库获取本分类的所有知识点
2. **5→7 章节问题**：需要进一步分析主题与章节的对应关系，单独处理

