# Tasks: 单元/分类检测 AI 出题归类正确性审计

- [x] Task 1: 修复章节检测卡片获取逻辑
  - [x] 在 `db.js` 中新增 `getCardsByChapter(chapterId)` 函数，通过章节 ID 获取该章节下所有单元的卡片
  - [x] 在 `testQuestionService.js` 的 `updateQuestionBank` 中增加 `TEST_TYPES.CHAPTER` 分支，调用 `getCardsByChapter(id)`
  - [x] 在 `getReviewQuestions` 中增加 `TEST_TYPES.CHAPTER` 分支，调用 `getTestQuestionsByChapter(id)` 或聚合各单元题目

- [x] Task 2: 修复兼容路径（runLegacySingleBatch）缺失标记方案
  - [x] 修改 `buildPrompt` 函数，增加 `cardMarkerMap` 参数，卡片格式改为 `[mk=标记N]` 格式
  - [x] 修改 `runLegacySingleBatch`，构建 markerMap/markerDataMap，调用 `buildPrompt` 时传入
  - [x] 在 `runLegacySingleBatch` 中 AI 返回后，通过标记映射 cardId/unitId/categoryId（与强/弱模型路径一致）

- [x] Task 3: 修复单元检测兜底 unitId 逻辑
  - [x] 在 `updateQuestionBank` 步11.5中，将单元检测的 `fallbackUnit` 从 `cards.find(c => c.unitId)?.unitId` 改为 `id`（调用方传入的单元ID）
  - [x] 新增章节检测的兜底分支：`categoryId = cards[0]?.categoryId`，`unitId = null`

- [x] Task 4: 更新 AI出题算法报告.txt 文档
  - [x] 记录章节检测的卡片获取逻辑修复
  - [x] 记录兼容路径标记方案的新增
  - [x] 记录兜底逻辑的改进

# Task Dependencies
- Task 2 和 Task 3 可并行执行
- Task 1 依赖 Task 2（都涉及 `updateQuestionBank` 的改动，但逻辑独立）
- Task 4 在所有代码任务完成后执行