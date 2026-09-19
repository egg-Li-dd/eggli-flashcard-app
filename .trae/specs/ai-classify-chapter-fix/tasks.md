# Tasks

- [x] Task 1: 修复 `classifySameCategoryReorganize` 部分失败时 fallback 解析错误
  - 将 `fallback.units` 改为 `fallback.chapters`，正确合并章节级 fallback 结果
  - 同时处理 `fallback.units` 向后兼容（无章节时 fallback 仍返回 units）
  - 文件: `src/services/aiService.js` L2065-2073

- [x] Task 2: 修复 `buildSameCategoryFallback` 无章节时降级为纯单元
  - 当 `classificationDepth === 'chapter-and-unit'` 且无现有章节时，创建章节结构
  - 按卡片关键词分组，每组生成一个章节+单元
  - 文件: `src/services/aiService.js` L2179-2248

- [x] Task 3: 修复 `handleTargetCategoryNext` 缺少 `classificationDepth` 参数
  - 添加 `classificationDepth: 'chapter-and-unit'` 和 `existingChapters`
  - 并行加载目标分类的章节和单元
  - 文件: `src/pages/Category.jsx` L1590-1599

- [x] Task 4: 修复 `handleCardSelectionNext` cross-category-auto 缺少 `classificationDepth`
  - 添加 `classificationDepth: 'chapter-and-unit'` 和 `existingChapters`
  - 并行加载所有分类的章节
  - 文件: `src/pages/Category.jsx` L1400-1417

- [x] Task 5: 强化 AI prompt 防一个单元一个章节
  - 在 `classifySameCategoryReorganize` chapter-and-unit prompt 中增加约束
  - 禁止为每个单元创建独立章节，要求相同主题的单元归入同一章节
  - 文件: `src/services/aiService.js` L1934-1967

# Task Dependencies
- Task 2 依赖 Task 1（同一函数内，一起修改）
- Task 3 / Task 4 / Task 5 相互独立，可并行