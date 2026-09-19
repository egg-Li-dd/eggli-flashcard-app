# Checklist

- [x] Task 1: `classifySameCategoryReorganize` 部分失败时正确合并 `fallback.chapters` 而非 `fallback.units`
- [x] Task 2: `buildSameCategoryFallback` 无章节时创建章节结构（`chapter-and-unit` 深度）
- [x] Task 3: `handleTargetCategoryNext` 传入 `classificationDepth: 'chapter-and-unit'` 和 `existingChapters`
- [x] Task 4: `handleCardSelectionNext` cross-category-auto 传入 `classificationDepth` 和 `existingChapters`
- [x] Task 5: AI prompt 增加"禁止一个单元一个章节"约束
- [x] 编译无错误
- [x] 章节模式 fallback 逻辑正确（有章节 / 无章节两条路径）