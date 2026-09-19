# Checklist: 分类流程全面优化与根因修复

## 阶段一：核心 Bug 修复

- [x] `convertAssignResultToValidateFormat` 函数签名已增加 `selectedCards` 参数
- [x] 函数内通过 `card.id → index` Map 映射正确找到卡片索引
- [x] 调用函数不再抛出 `ReferenceError: selectedCards is not defined`
- [x] `convertValidateFormatToAssignResult` 函数签名已增加 `selectedCards` 参数
- [x] 基于 `selectedCards` 数组构建 `index → card` 映射，而非顺序自增索引
- [x] `classifySameCategoryReorganize` 调用 `convertAssignResultToValidateFormat` 时传递 `selectedCards`
- [x] `classifyCrossCategoryAuto` 调用 `convertAssignResultToValidateFormat` 时传递对应卡片数组（架构变更：新流程不再调用此函数）
- [x] `classifySameCategoryReorganize` 调用 `convertValidateFormatToAssignResult` 时传递 `selectedCards`
- [x] `classifyCrossCategoryAuto` 调用 `convertValidateFormatToAssignResult` 时传递对应卡片数组（架构变更：新流程不再调用此函数）

## 阶段二：校验逻辑优化

- [x] `validateStructurePlan` 中"单元数 < 2"从 error 改为 warning
- [x] 章节总数、单元总数上限校验保留为 error
- [x] `fixStructurePlan` 对单单元章节保留并补充默认单元，而非丢弃
- [x] `fixStructurePlan` 不再因单单元章节导致整体结构为空

## 阶段三：分类目的全链路传递

- [x] `assignCards` 函数 options 参数支持 `categoryPurpose`
- [x] `assignCardsSingleBatch` 函数接收并使用 `categoryPurpose`
- [x] `assignCardsSingleBatch` 的 prompt 模板包含分类目的上下文段落
- [x] `classifyCrossCategoryAuto` unit-only 模式 prompt 包含 `categoryPurpose`
- [x] `classifySameCategoryReorganize` 调用 `assignCards` 时传递 `categoryPurpose`
- [x] `classifyCrossCategoryAuto` 调用 `assignCards` 时传递 `categoryPurpose`（架构变更：通过 `assignCardsCrossCategory` 传递）
- [x] 从 Category.jsx 入口到 AI prompt 的分类目的传递链路完整

## 阶段四：AI 全权归类重构

- [x] `classifyCrossCategoryAuto` chapter-and-unit 模式移除本地 `clusterCardsByTopic` 预聚类
- [x] 新增 `planCrossCategoryStructure` 函数实现一次性 AI 多分类结构规划
- [x] `planCrossCategoryStructure` 的 prompt 包含分类目的
- [x] `planCrossCategoryStructure` 返回有效的 categories→chapters→units 结构
- [x] 新增 `assignCardsCrossCategory` 函数或复用 `assignCards` 实现多分类卡片分配
- [x] AI 全权归类结果校验所有卡片被分配且无重复

## 阶段五：降级与防御性增强

- [x] `assignCards` 批次降级后校验卡片覆盖完整性
- [x] 未覆盖卡片被强制分配到"未归类"单元
- [x] 降级日志记录覆盖情况（已覆盖/未覆盖数量）
- [x] `classifySameCategoryReorganize` catch 块区分 AI 调用失败与数据处理 bug
- [x] `classifyCrossCategoryAuto` catch 块区分 AI 调用失败与数据处理 bug
- [x] 数据处理 bug 使用 `[classifyBug]` 前缀日志
- [x] AI 调用失败使用 `[aiCallFailed]` 前缀日志
- [x] 控制台输出详细错误堆栈便于定位

## 阶段六：测试验证（待用户热更新测试）

- [ ] 弱模型（Spark Lite）智能单元整理：不再出现"AI 调用失败"警告
- [ ] 弱模型智能单元整理：控制台无 `[classifyBug]` 日志
- [ ] 弱模型智能单元整理：AI 返回结构被正确应用
- [ ] 强模型智能单元整理：流程正常完成，无警告
- [ ] AI 全权归类：AI 一次性决定分类结构（非本地预聚类）
- [ ] AI 全权归类：所有卡片被分配，无丢失
- [ ] 指定分类归类：使用目标分类的分类目的
- [ ] 指定分类归类：流程正常完成
- [ ] 所有 UI 按钮在移动端可见可用
- [ ] 弹窗自适应手机屏幕

## 回归验证（待用户测试确认）

- [ ] 原有卡片生成功能不受影响
- [ ] 原有知识点提取功能不受影响
- [ ] 原有主题分组确认功能不受影响
- [ ] 移动端 app 功能不受影响
- [ ] 云端同步功能不受影响
