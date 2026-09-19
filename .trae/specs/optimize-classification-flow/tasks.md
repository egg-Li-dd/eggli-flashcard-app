# Tasks: 分类流程全面优化与根因修复

## 阶段一：核心 Bug 修复（P0 - 阻塞性问题）

- [x] Task 1: 修复 `convertAssignResultToValidateFormat` 作用域 bug
  - **问题**: 函数引用未传入的 `selectedCards` 变量，导致 ReferenceError
  - **修复**: 
    - 修改函数签名为 `convertAssignResultToValidateFormat(assignResult, selectedCards)`
    - 在函数内建立 `card.id → index` 映射（使用 Map）
    - 通过映射正确找到每张卡片在 `selectedCards` 中的索引
  - **涉及文件**: `src/services/aiService.js` (L8391-8425)
  - **验证**: 调用函数不再抛出 ReferenceError，返回正确的 cardIndices 格式

- [x] Task 2: 修复 `convertValidateFormatToAssignResult` 索引映射错误
  - **问题**: 使用顺序自增索引构建 Map，与实际 cardIndices 不匹配
  - **修复**:
    - 修改函数签名为 `convertValidateFormatToAssignResult(validatedResult, originalAssignResult, selectedCards)`
    - 基于 `selectedCards` 数组构建 `index → card` 映射
    - 通过 `selectedCards[idx]` 获取卡片对象
  - **涉及文件**: `src/services/aiService.js` (L8434-8472)
  - **验证**: 修正后的卡片分配与原始卡片正确对应

- [x] Task 3: 更新所有调用点传递 `selectedCards` 参数
  - **位置**:
    - `classifySameCategoryReorganize` (L5746-5754): 传递 `selectedCards`
    - `classifyCrossCategoryAuto` (L6360-6367): 传递 `cluster.cards`（临时）或 `selectedCards`（重构后）
  - **涉及文件**: `src/services/aiService.js`
  - **验证**: 所有调用点参数完整

## 阶段二：校验逻辑优化（P0）

- [x] Task 4: 放宽 `validateStructurePlan` 单元数校验
  - **问题**: 强制每章节 ≥2 单元过严，AI 返回 1 单元章节时阻断
  - **修复**:
    - L7985-7987: 将 `errors.push` 改为 `warnings.push`
    - 保留章节总数、单元总数上限校验
  - **涉及文件**: `src/services/aiService.js` (L7940-8016)
  - **验证**: 1 单元章节不再导致校验失败

- [x] Task 5: 优化 `fixStructurePlan` 单单元章节处理
  - **问题**: 单单元章节被丢弃可能导致卡片丢失
  - **修复**:
    - 对单单元章节：保留并补充默认单元（如"扩展知识"）
    - 不再直接丢弃
  - **涉及文件**: `src/services/aiService.js` (L8021-8070)
  - **验证**: 单单元章节被保留并补充

## 阶段三：分类目的全链路传递（P1）

- [x] Task 6: 在 `assignCards` 和 `assignCardsSingleBatch` 中注入分类目的
  - **修改**:
    - `assignCards` 函数签名增加 `categoryPurpose` 参数（通过 options 传递）
    - `assignCardsSingleBatch` 函数签名增加 `categoryPurpose` 参数
    - 在 prompt 模板中加入分类目的上下文
  - **涉及文件**: `src/services/aiService.js` (L8120-8390)
  - **验证**: AI 分配卡片时参考分类目的

- [x] Task 7: 在 `classifyCrossCategoryAuto` unit-only 模式注入分类目的
  - **问题**: unit-only 模式 prompt 未包含 categoryPurpose
  - **修复**: 在 L6511-6550 的 prompt 中加入分类目的段落
  - **涉及文件**: `src/services/aiService.js`
  - **验证**: unit-only 模式 prompt 包含分类目的

- [x] Task 8: 更新 `classifySameCategoryReorganize` 和 `classifyCrossCategoryAuto` 调用 `assignCards` 时传递 categoryPurpose
  - **位置**:
    - `classifySameCategoryReorganize` L5738: `assignCards(selectedCards, structurePlan, config, { batchSize: 30, categoryPurpose })`
    - `classifyCrossCategoryAuto` L6354: 同上
  - **涉及文件**: `src/services/aiService.js`
  - **验证**: categoryPurpose 从入口到 AI 调用全链路传递

## 阶段四：AI 全权归类重构（P1）

- [x] Task 9: 重构 `classifyCrossCategoryAuto` chapter-and-unit 模式为真正 AI 全权归类
  - **问题**: 当前先用本地 `clusterCardsByTopic` 聚类，再对每聚类调用 planStructure，与"全权"矛盾
  - **修复**:
    - 移除本地 `clusterCardsByTopic` 预聚类步骤
    - 新增 `planCrossCategoryStructure` 函数：一次性让 AI 规划 categories→chapters→units 结构
    - 新增 `assignCardsCrossCategory` 函数：将卡片分配到 AI 规划的多分类结构中
    - 校验所有卡片被分配
  - **涉及文件**: `src/services/aiService.js` (L6328-6394)
  - **验证**: AI 一次性决定分类+章节+单元结构

- [x] Task 10: 实现 `planCrossCategoryStructure` 函数
  - **功能**: 一次性 AI 调用，返回 categories→chapters→units 结构
  - **Prompt 要点**:
    - 包含分类目的
    - 要求 AI 决定分类数量（1-5 个）
    - 每分类下章节、单元结构
    - 不含卡片分配（卡片分配由后续步骤完成）
  - **涉及文件**: `src/services/aiService.js`
  - **验证**: 返回有效的多分类结构

## 阶段五：降级与防御性增强（P1）

- [x] Task 11: 增强 `assignCards` 批次降级完整性保证
  - **问题**: 批次失败时 `localFallbackAssign` 可能丢卡
  - **修复**:
    - 降级后校验该批次所有卡片都被分配
    - 未覆盖卡片强制分配到"未归类"单元
    - 添加日志记录降级覆盖情况
  - **涉及文件**: `src/services/aiService.js` (L8209-8214)
  - **验证**: 降级后卡片数 = 输入卡片数

- [x] Task 12: 区分"AI 调用失败"与"数据处理 bug"的日志
  - **修改**:
    - 在 `classifySameCategoryReorganize` 和 `classifyCrossCategoryAuto` 的 catch 块中
    - 判断错误类型：网络/超时错误 vs 解析/校验错误
    - 前者记录 `[aiCallFailed]`，后者记录 `[classifyBug]`
    - 控制台输出详细堆栈
  - **涉及文件**: `src/services/aiService.js` (L5774-5777, L6390-6393)
  - **验证**: 日志能区分错误类型

## 阶段六：测试验证（P2）

- [ ] Task 13: 热更新验证 - 智能单元整理（弱模型）（待用户测试）
  - 使用讯飞 Spark Lite 配置
  - 选择一个分类下的卡片执行智能单元整理
  - 验证：不再出现"AI 调用失败"警告
  - 验证：控制台无 `[classifyBug]` 日志
  - 验证：AI 返回的结构被正确应用

- [ ] Task 14: 热更新验证 - 智能单元整理（强模型）
  - 使用 DeepSeek 或其他强模型配置
  - 执行智能单元整理
  - 验证：流程正常完成，无警告

- [ ] Task 15: 热更新验证 - AI 全权归类
  - 执行 AI 全权归类（chapter-and-unit 模式）
  - 验证：AI 一次性决定分类结构
  - 验证：所有卡片被分配，无丢失

- [ ] Task 16: 热更新验证 - 指定分类归类
  - 选择源分类卡片，指定目标分类执行归类
  - 验证：使用目标分类的分类目的
  - 验证：流程正常完成

# Task Dependencies

- Task 2 依赖 Task 1（修复顺序）
- Task 3 依赖 Task 1 和 Task 2（调用点更新）
- Task 5 依赖 Task 4（校验放宽后修正策略调整）
- Task 8 依赖 Task 6（传递参数前需先支持参数）
- Task 9 依赖 Task 1-3（核心 bug 修复后才能重构）
- Task 10 依赖 Task 9（重构后实现新函数）
- Task 11 独立
- Task 12 独立
- Task 13-16 依赖 Task 1-12 全部完成
