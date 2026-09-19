# Tasks

- [ ] Task 1: 重构 NewCardPanel 分组逻辑 — 章节→单元两级
  - 修改 `existingUnitGroups` / `newUnitGroups` useMemo（L302-339）
  - 改为按章节分组：`chapterGroups = [{ chapterId, chapterName, isNewChapter, unitGroups: [{ unitName, unitId, isNewUnit, cards }] }]`
  - 现有章节：`chapterId` 在 `existingChapters` 中 → `isNewChapter: false`
  - 新章节：`chapterId` 为 null 但有 `chapterName` → `isNewChapter: true`
  - 未归章：无章节信息的卡片 → 单独一组
  - 文件: `src/components/NewCardPanel.jsx`

- [ ] Task 2: 更新统计栏
  - 在 `stats` useMemo 中增加 `newChapterCount`、`existingChapterCount`
  - 统计栏显示改为"新章节 X 个 · 现有章节 X 个 · 新单元 X 张 · 现有单元 X 张"（有章节时）
  - 无章节时保持原有显示
  - 文件: `src/components/NewCardPanel.jsx`

- [ ] Task 3: 更新渲染逻辑
  - 渲染章节组标题（章节名称 + 现有章节/新章节标签）
  - 章节内渲染单元组（沿用现有单元卡片样式）
  - 章节组使用折叠/展开（默认展开）
  - 文件: `src/components/NewCardPanel.jsx`

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1