# Tasks

- [x] 1. 创建"新主题/新单元生成"函数（仅生成新结构，不关联已有体系）
  - [x] 1.1 在 `aiService.js` 中创建 `generateNewTopicsAndUnits` 函数，接收 `finalTopics`、`flatNewCards`、`knowledgePoints`、`aiConfig`
  - [x] 1.2 强模型单次调用路径：AI 一次调用，输出仅含 `newChapterName` / `newUnitName` 的 assignments
  - [x] 1.3 弱模型多轮分批路径：Round1 章节级 → Round2 单元级，输出仅含 `newChapterName` / `newUnitName`
  - [x] 1.4 确保输出的 assignments 不包含 `unitId` 或 `chapterId`

- [x] 2. 创建"AI 主题合并判断"函数（强/弱模型双路径）
  - [x] 2.1 在 `aiService.js` 中创建 `judgeTopicMerge` 函数
  - [x] 2.2 强模型单次调用：一次性输入所有新旧主题对，输出合并决策 JSON
  - [x] 2.3 弱模型分批调用：每批 5 对，超时/解析失败用名称相似度 fallback
  - [x] 2.4 合并阈值：语义相似度 > 0.75

- [x] 3. 创建"AI 单元合并判断"函数（强/弱模型双路径）
  - [x] 3.1 在 `aiService.js` 中创建 `judgeUnitMerge` 函数
  - [x] 3.2 强模型单次调用：一次性输入所有新旧单元对，输出替换决策 JSON
  - [x] 3.3 弱模型分批调用：每批 5 对，超时/解析失败用名称+内容相似度 fallback
  - [x] 3.4 合并阈值：内容相似度 > 0.75

- [x] 4. 创建"循环合并控制"逻辑
  - [x] 4.1 在 `aiService.js` 中创建 `loopMergeControl` 函数
  - [x] 4.2 执行流程：主题合并 → 单元合并 → 检查变化 → 最多 2 轮
  - [x] 4.3 终止条件：本轮合并后结构无变化，或达到 2 轮上限

- [x] 5. 重构 `handleTopicConfirm` 在 Category.jsx 中的流程
  - [x] 5.1 移除 `classifyCardsByCategoryContent` 调用（new-card-classify 路径）
  - [x] 5.2 移除 `mergeSimilarUnits` 调用
  - [x] 5.3 移除 `existingChapters` 的章节匹配/创建逻辑（`newChapterNameToId`）
  - [x] 5.4 替换为新的管道调用：`generateNewTopicsAndUnits` → `judgeTopicMerge` → `judgeUnitMerge` → `loopMergeControl`
  - [x] 5.5 保留去重检查和预览逻辑

- [x] 6. 清理废弃代码
  - [x] 6.1 原 weak model dispatch 保留在 `classifyCardsByCategoryContent` 中供其他模式使用（cross-category-auto, same-category-reorganize）
  - [x] 6.2 `mergeSimilarUnits` 在 helpers.js 中保留定义，不再被其他模块引用
  - [x] 6.3 移除 `Category.jsx` 中 `mergeSimilarUnits` 的 import

- [ ] 7. 验证与测试
  - [ ] 7.1 强模型：输入 30 个知识点，验证全流程（生成→合并→预览）
  - [ ] 7.2 弱模型：输入 30 个知识点，验证全流程（生成→合并→预览）
  - [ ] 7.3 验证循环合并最多 2 轮
  - [ ] 7.4 验证无关联已有体系（新 cards 不分配到已有 unitId）

# Task Dependencies
- Task 2, 3, 4 依赖 Task 1
- Task 5 依赖 Task 1, 2, 3, 4
- Task 6 依赖 Task 5
- Task 7 依赖 Task 5
- Task 1.2 和 1.3 可并行开发
- Task 2.2 和 2.3 可并行开发
- Task 3.2 和 3.3 可并行开发