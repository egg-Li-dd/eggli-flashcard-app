# Spark Lite 弱模型主题聚类三档粒度 Spec

## Why

当前 `clusterKnowledgePointsByTopic` 使用统一的 `callAiProvider` 处理所有模型，但弱模型（Spark Lite）在主题聚类时存在以下问题：

* 弱模型通过 `callAiProvider` 间接调用，路径较长，响应延迟增加

* 弱模型需要特定的 `temperature` 和 `max_tokens` 参数调优

* 三档粒度（简略/标准/详细）需要在弱模型路径上正确传递和应用

用户需要为弱模型创建独立的主题聚类路径，类似于 `classifyCardsByKnowledgePointsMultiRound` 的实现模式。

## What Changes

* 在 `iflytekAi.js` 中新增 `clusterKnowledgePointsByTopicWithSpark` 函数

* 新函数使用 `httpPost` 直接调用 Spark Lite API

* 支持 `granularity` 参数（'concise' | 'standard' | 'detailed'）

* 修改 `clusterKnowledgePointsByTopic` 在检测到 Spark Lite 时路由到新函数

* 弱模型专用参数：`temperature: 0.3`，`max_tokens: 2048`

## Impact

* Affected specs: `ai-classification-two-step`（主题聚类部分）

* Affected code: `src/services/aiService.js`、`src/services/iflytekAi.js`

* 新增函数不破坏现有强模型路径

## 数据库设计

无变更（主题聚类结果仍在内存中，不持久化）

## 新增函数设计

### 函数签名

```javascript
// iflytekAi.js
export async function clusterKnowledgePointsByTopicWithSpark(
  knowledgePoints,    // string[] - 知识点数组
  sparkApiKey,       // string - Spark API 密钥
  model,             // string - 模型名（默认 'lite'）
  granularity        // string - 粒度：'concise' | 'standard' | 'detailed'
)
```

### 返回格式

```javascript
// 与现有格式一致
[
  { topicName: "主题名称", pointIndices: [0, 1, 2] },
  { topicName: "另一主题", pointIndices: [3, 4, 5] }
]
```

### 粒度与主题数量

| 粒度       | 知识点<30 | 知识点30-50 | 知识点>50 |
| -------- | ------ | -------- | ------ |
| concise  | 1-2    | 2-3      | 3-4    |
| standard | 2-3    | 3-5      | 4-6    |
| detailed | 3-5    | 5-8      | 6-10   |

### API 调用

```
POST https://spark-api-open.xf-yun.com/v1/chat/completions
Headers: { "Content-Type": "application/json", "Authorization": "Bearer <password>" }
Body: {
  model: "lite",
  messages: [{ role: "user", content: "<prompt>" }],
  temperature: 0.3,
  max_tokens: 2048
}
Timeout: 15000ms
```

## 调用路径修改

### 修改前

```
clusterKnowledgePointsByTopic()
    ↓
callAiProvider() → 检测 aiServiceMode → 间接路由
```

### 修改后

```
clusterKnowledgePointsByTopic()
    ↓
检测 aiServiceMode === 'iflytek-spark' && isWeakModel
    ├── true → clusterKnowledgePointsByTopicWithSpark()
    └── false → callAiProvider()
```

## 路由判断逻辑

```javascript
const isWeakSpark = aiServiceMode === 'iflytek-spark' && (!model || model === 'lite')

if (isWeakSpark) {
  return clusterKnowledgePointsByTopicWithSpark(knowledgePoints, sparkApiKey, model, granularity)
}
```

## ADDED Requirements

### Requirement: 弱模型主题聚类独立路径

系统 SHALL 在检测到弱模型（Spark Lite）时，调用独立的 `clusterKnowledgePointsByTopicWithSpark` 函数进行主题聚类。

#### Scenario: Spark Lite 简略粒度聚类

* **GIVEN** 用户选择 Spark Lite 模型进行重新聚类，选择"简略"档次

* **WHEN** 系统调用 `clusterKnowledgePointsByTopicWithSpark(points, key, 'lite', 'concise')`

* **THEN** 函数使用 `httpPost` 直接调用 Spark API，返回 1-3 个主题

#### Scenario: Spark Lite 标准粒度聚类

* **GIVEN** 用户选择 Spark Lite 模型进行重新聚类，选择"标准"档次

* **WHEN** 系统调用 `clusterKnowledgePointsByTopicWithSpark(points, key, 'lite', 'standard')`

* **THEN** 函数返回 3-5 个主题

#### Scenario: Spark Lite 详细粒度聚类

* **GIVEN** 用户选择 Spark Lite 模型进行重新聚类，选择"详细"档次

* **WHEN** 系统调用 `clusterKnowledgePointsByTopicWithSpark(points, key, 'lite', 'detailed')`

* **THEN** 函数返回 5-8 个主题

### Requirement: 粒度影响主题数量

系统 SHALL 根据 `granularity` 参数调整 AI Prompt 中的建议主题数量范围。

#### Scenario: 粒度参数正确传递

* **GIVEN** 知识点数量为 42 个

* **WHEN** granularity = 'concise'

* **THEN** Prompt 中建议范围为 "1-3 个主题"

* **WHEN** granularity = 'standard'

* **THEN** Prompt 中建议范围为 "3-5 个主题"

* **WHEN** granularity = 'detailed'

* **THEN** Prompt 中建议范围为 "5-8 个主题"

### Requirement: 弱模型超时处理

系统 SHALL 在弱模型聚类超时（15秒）时抛出 `AiTimeoutError`，由调用方决定处理策略。

#### Scenario: Spark Lite 超时

* **GIVEN** Spark API 响应超过 15 秒

* **WHEN** `httpPost` 抛出超时错误

* **THEN** 函数抛出 `AiTimeoutError`，stage='topic-clustering'

## 错误处理

| 错误类型     | 处理策略                 | 返回值       |
| -------- | -------------------- | --------- |
| 超时       | 抛出 `AiTimeoutError`  | 不返回       |
| 解析失败     | 返回 `fallbackCluster` | 2-4 个均匀分组 |
| 网络错误     | 抛出原始错误               | 不返回       |
| API 业务错误 | 抛出具体错误消息             | 不返回       |

## MODIFIED Requirements

### Requirement: clusterKnowledgePointsByTopic 路由增强

`clusterKnowledgePointsByTopic` 函数 SHALL 在检测到 Spark Lite 弱模型时，路由到 `clusterKnowledgePointsByTopicWithSpark`。

#### Scenario: 路由到弱模型专用函数

* **WHEN** `aiServiceMode === 'iflytek-spark'` 且 `model === 'lite'` 或未指定

* **THEN** 调用 `clusterKnowledgePointsByTopicWithSpark` 而非 `callAiProvider`

## 兼容性保障

1. **接口兼容**：`clusterKnowledgePointsByTopic` 保持原有函数签名
2. **返回格式兼容**：弱模型函数返回格式与原有格式完全一致
3. **降级兼容**：Spark API 调用失败时返回 `fallbackCluster` 结果

