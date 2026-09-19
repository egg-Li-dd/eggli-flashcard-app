# Checklist: 单元/分类检测 AI 出题归类正确性审计

- [x] 章节检测（`TEST_TYPES.CHAPTER`）调用 `updateQuestionBank` 时，卡片获取使用的是 `getCardsByChapter(chapterId)` 而非 `getAllCardsByCategory(chapterId)`
- [x] 章节复习（`getReviewQuestions`）能正确获取章节下所有单元的题目
- [x] 兼容路径（`runLegacySingleBatch`）的 Prompt 中包含 `[mk=标记N]` 格式的卡片标记
- [x] 兼容路径 AI 返回后通过标记映射正确设置了 cardId/unitId/categoryId
- [x] 单元检测兜底：`fallbackUnit` 使用调用方传入的 `id`（单元ID），而非 `cards.find(c => c.unitId)?.unitId`
- [x] 分类检测兜底：`categoryId = id`（分类ID），`unitId = null`（保持不变）
- [x] 章节检测兜底：`categoryId = cards[0]?.categoryId`，`unitId = null`
- [x] `npm run build` 生产构建通过
- [x] AI出题算法报告.txt 已更新