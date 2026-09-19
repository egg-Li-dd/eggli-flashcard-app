# Tasks: 弱模型卡片生成数据丢失修复

- [x] Task 1: 修复 `clusterKnowledgePointsByTopicWithSpark` 中 pointIndices 类型不兼容问题
  - 新增 `normalizePointIndices` 函数，深度转换所有 `pointIndices` 为数字类型
  - 在 `parseSparkTopicResponse` 返回后调用，过滤 NaN 值
  - **涉及文件**: `src/services/iflytekAi.js`

- [x] Task 2: 修复 `generateNewTopicsAndUnits` 直接映射路径的类型安全匹配
  - 使用 `Number()` 类型安全比较
  - **涉及文件**: `src/services/aiService.js`

- [x] Task 3: 增强 `loopMergeControl` 数据保护
  - 深拷贝原始数据，添加替换单元数据量统计日志
  - **涉及文件**: `src/services/aiService.js`, `src/pages/Category.jsx`

- [x] Task 4: 添加端到端数据一致性校验日志
  - 在各关键节点添加校验日志
  - **涉及文件**: `src/services/aiService.js`, `src/pages/Category.jsx`

- [x] Task 5: 修复 `mergeBatchCardResults` 中 kpMarker 双重偏移问题（核心修复）
  - **问题**：`generateCardsFromKnowledgePoints` 的 prompt 已使用全局索引 `__KP_${offset+i}__`，但 `mergeBatchCardResults` 又叠加了 offset（`globalIdx = offset + localIdx`）
  - **影响**：第二批 offset=30，AI 返回 `__KP_30__`~`__KP_38__`，叠加后变成 60-68，无法匹配 kpMarkers (0-38)
  - **修复**：移除 `mergeBatchCardResults` 中的 offset 叠加逻辑，直接保留 AI 返回的 kpMarker
    - L1597-1603: 移除 `globalIdx = offset + localIdx`，改为直接保留 `card.kpMarker`
    - L1622-1628: 同上，JSON 无 units 字段时的回退路径
  - **涉及文件**: `src/services/aiService.js` (L1597-1603, L1622-1628)

- [x] Task 6: 增强 `mergeBatchCardResults` 单批次处理日志
  - 为每个批次输出：offset、原始卡片数（解析前）、过滤后卡片数、过滤原因（空 front/back 计数）
  - 帮助追踪第一批 30 张卡片丢失的具体原因
  - **涉及文件**: `src/services/aiService.js` (L1528-1644)

- [x] Task 7: 增强 `generateCardsFromKnowledgePoints` 批处理完整性校验
  - 在 `mergeBatchCardResults` 返回后，校验最终卡片总数是否合理
  - 检查 `allResults` 条目数是否等于批次数
  - 如不匹配，输出详细警告日志
  - **涉及文件**: `src/services/aiService.js` (L997 附近)

- [x] Task 8: 弱模型端到端测试验证（第一轮）
  - 使用弱模型（Spark Lite）配置，输入 39 个知识点
  - 验证 kpMarker 双重偏移修复生效（kpIndex 30-39 而非 60-68）
  - 发现新问题：第一批 JSON 解析失败，`extractCardsFromBrokenJson` 提取 0 张卡片
  - **涉及文件**: 测试验证

- [x] Task 9: 增强 `extractCardsFromBrokenJson` 卡片提取能力
  - **问题**：原正则要求 `"front"` 在 `"back"` 之前，弱模型字段顺序不同导致 0 张卡片被提取
  - **修复**：重写为策略1（逐对象块提取，支持任意字段顺序）+ 策略2（宽松匹配 front/back 字段）
  - 添加 kpMarker 字段提取
  - 添加原始内容日志（first/last 500 chars）用于调试
  - **涉及文件**: `src/services/aiService.js` (L1518-1570, L1631-1635)

- [x] Task 10: 添加 kpIndex 范围校验，过滤越界卡片
  - **问题**：弱模型偶发生成 kpIndex 超出有效范围的卡片（如 kpIndex=39，范围 0-38）
  - **修复**：`mergeBatchCardResults` 接受 `totalKpCount` 参数，校验 kpMarker 索引范围
  - 超出范围的卡片输出警告日志并丢弃
  - Summary 日志包含 `kpOutOfRange` 统计
  - **涉及文件**: `src/services/aiService.js` (L1572, L1646-1667, L1707)

- [ ] Task 11: 弱模型端到端测试验证（第二轮）
  - 使用弱模型（Spark Lite）配置，输入 39 个知识点
  - 验证 `extractCardsFromBrokenJson` 成功提取第一批 30 张卡片
  - 验证 `mergeBatchCardResults` 日志显示两批均有效
  - 验证最终 `flatNewCards` 包含 30+ 张卡片
  - 验证 kpIndex 范围 0-38
  - 验证 `generateNewTopicsAndUnits` 直接映射成功
  - **涉及文件**: 测试验证，无需修改代码

# Task Dependencies
- Task 1-4 ✅ 已完成（原 spec 修复）
- Task 5-7 ✅ 已完成（kpMarker 双重偏移 + 批次日志 + 批处理校验）
- Task 8 ✅ 第一轮测试完成，发现新问题
- Task 9-10 ✅ 已完成（extractCardsFromBrokenJson 增强 + kpIndex 范围校验）
- Task 11 ⏳ 待用户运行第二轮测试验证