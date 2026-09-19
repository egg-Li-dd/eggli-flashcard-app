# Tasks

## 任务：Spark Lite 弱模型主题聚类三档粒度实现

### 1. 在 iflytekAi.js 中创建 clusterKnowledgePointsByTopicWithSpark 函数

- [x] SubTask 1.1: 分析现有 `clusterKnowledgePointsByTopic` 函数的 prompt 模板结构
- [x] SubTask 1.2: 创建 `clusterKnowledgePointsByTopicWithSpark` 函数框架
- [x] SubTask 1.3: 实现 `httpPost` 调用 Spark API 的逻辑
- [x] SubTask 1.4: 添加粒度参数处理（concise/standard/detailed）
- [x] SubTask 1.5: 实现超时检测和 `AiTimeoutError` 抛出
- [x] SubTask 1.6: 实现解析失败时的 `fallbackCluster` 降级逻辑
- [x] SubTask 1.7: 导出函数供外部调用

### 2. 修改 aiService.js 中的 clusterKnowledgePointsByTopic 路由

- [x] SubTask 2.1: 在 `clusterKnowledgePointsByTopic` 开头添加弱模型检测
- [x] SubTask 2.2: 添加路由逻辑，将 Spark Lite 路由到 `clusterKnowledgePointsByTopicWithSpark`
- [x] SubTask 2.3: 确保 `sparkApiKey` 和 `model` 参数正确传递

### 3. 验证和测试

- [x] SubTask 3.1: 验证构建无错误
- [x] SubTask 3.2: 确认三种粒度都能正确调用

# Task Dependencies

- Task 2 依赖 Task 1（必须先创建函数才能路由）
- Task 3 依赖 Task 1 和 Task 2

# Implementation Notes

## 关键代码位置

### 1. iflytekAi.js 新增函数位置
在文件末尾 `export { ... }` 之前添加新函数

### 2. aiService.js 修改位置
`clusterKnowledgePointsByTopic` 函数开头（约第 952 行）

### 3. 导出更新
在 `iflytekAi.js` 的 `export` 语句中添加新函数
