# Checklist: 弱模型卡片生成数据丢失修复

## kpMarker 双重偏移修复
- [x] `mergeBatchCardResults` L1597-1603: 移除 `globalIdx = offset + localIdx`，改为直接保留 `card.kpMarker`
- [x] `mergeBatchCardResults` L1622-1628: 同上，JSON 无 units 字段时的回退路径也修复
- [ ] 单批处理（offset=0）：kpIndex 与 kpMarkers 一致（0-29） — 待运行时验证
- [ ] 多批处理（offset=0, offset=30）：kpIndex 范围 0-38，与 kpMarkers 一致 — 待运行时验证

## 批次日志增强
- [x] 每个批次输出 offset、原始卡片数、过滤后卡片数
- [x] 输出过滤原因统计（空 front/back 计数）
- [x] `mergeBatchCardResults` Summary 日志包含每批处理详情

## 批处理完整性
- [x] `allResults` 条目数等于批次数 — 已添加校验日志
- [x] 最终卡片总数 = 各批次卡片数之和 — 已添加汇总日志
- [x] 批次数不匹配时输出警告日志

## 数据完整性（运行时验证）
- [ ] `flatNewCards` 包含所有批次生成的卡片
- [ ] `generateNewTopicsAndUnits` 直接映射成功（assignments > 0）
- [ ] 控制台无 `kpIndex=XX 不在 kpIndexMap 中` 警告
- [ ] 无需回退到 AI 聚类（节省 5 次 API 调用）

## 端到端流程（运行时验证）
- [ ] Step 1 知识点确认：39 知识点
- [ ] 卡片生成：2 批处理均成功，卡片总数 ≥ 知识点数
- [ ] Step 2 主题分组确认：显示完整卡片列表
- [ ] Step 2→3: generateNewTopicsAndUnits 直接映射成功
- [ ] Step 3 知识体系调整：卡片分配到正确的主题-单元
- [ ] Step 5 新卡片预览：显示全部卡片

## 类型兼容性（已完成）
- [x] `clusterKnowledgePointsByTopicWithSpark` 返回的 `pointIndices` 全部为数字类型
- [x] `generateNewTopicsAndUnits` 直接映射路径使用 `Number()` 类型安全比较
- [x] `kpIndexMap` 构建使用 `Number(kpIdx)` 作为键

## 数据保护（已完成）
- [x] `generateNewTopicsAndUnits` 返回的 `assignments.length` 校验日志
- [x] `handleTopicConfirm` 中 `newUnitsList` 的 `cardIndices` 总数校验
- [x] `loopMergeControl` 原始/最终卡片数对比校验

## 边界情况
- [ ] 弱模型返回空 kpMarker 时不崩溃
- [ ] 弱模型返回缺失 kpMarker 字段的卡片时正确处理
- [ ] 所有批次 JSON 解析失败时抛出明确异常
- [ ] 知识点数量 ≤ 30（单批）时正常工作

## 回归测试
- [ ] 强模型路径卡片生成不受影响
- [ ] 弱模型"简"模式重新聚类功能正常
- [ ] 弱模型"详"模式重新聚类功能正常
- [ ] 重复卡片确认弹窗功能正常
- [ ] "上一步"按钮在各步骤间导航正常