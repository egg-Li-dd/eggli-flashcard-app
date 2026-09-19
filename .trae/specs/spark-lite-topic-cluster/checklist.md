# Checklist

## 代码实现检查

- [x] `iflytekAi.js` 中新增 `clusterKnowledgePointsByTopicWithSpark` 函数
- [x] 函数签名包含 `knowledgePoints`, `sparkApiKey`, `model`, `granularity` 参数
- [x] 函数使用 `httpPost` 直接调用 Spark API
- [x] 粒度参数影响 prompt 中的建议主题数量
- [x] 超时（15秒）时抛出 `SparkTimeoutError`
- [x] 解析失败时返回 `fallbackCluster` 结果
- [x] 函数正确导出

- [x] `clusterKnowledgePointsByTopic` 函数添加弱模型路由检测
- [x] `aiServiceMode === 'iflytek-spark'` 时路由到 `clusterKnowledgePointsByTopicWithSpark`
- [x] `sparkApiKey` 和 `model` 参数正确传递
- [x] 强模型路径不受影响

## 功能验证检查

- [x] Spark Lite + 简略粒度 → 返回 1-3 个主题
- [x] Spark Lite + 标准粒度 → 返回 3-5 个主题
- [x] Spark Lite + 详细粒度 → 返回 5-8 个主题
- [x] 超时时显示超时确认对话框（通过 `SparkTimeoutError`）
- [x] 解析失败时自动降级到 fallbackCluster
