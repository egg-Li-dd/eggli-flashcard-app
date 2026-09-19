# Tasks

- [x] Task 1: 重构题库管理页面数据加载逻辑，支持章节数据获取
  - [x] 从 db.js 导入 `getChaptersByCategory`、`getUnitsByChapter`
  - [x] 在 `loadData` 中加载章节列表并构建章节→单元→题目的数据结构
  - [x] 新增 `selectedChapterId` 状态管理章节选择
  - [x] 切换分类时重置章节和单元选择

- [x] Task 2: 新增章节选择器组件 ChapterSelector
  - [x] 创建 ChapterSelector 组件：展示分类下的章节列表
  - [x] 每个章节卡片显示：章节名、单元数、题目总数
  - [x] 无章节时自动跳过，直接显示单元选择器
  - [x] 章节为空时显示空状态提示
  - [x] 支持返回按钮回到分类选择

- [x] Task 3: 更新 UnitSelector 组件，按章节筛选单元
  - [x] UnitSelector 接收 `chapterId` 参数，仅展示该章节下的单元
  - [x] 无章节时（chapterId 为空）展示所有单元（兼容原有逻辑）
  - [x] 返回按钮：有章节时返回章节列表，无章节时返回分类选择

- [x] Task 4: 美化题库管理界面 UI
  - [x] 分类选择器：使用卡片容器 + 图标 + 圆角下拉框
  - [x] 章节/单元卡片：统一的卡片样式，左侧色条标识，右侧题目数徽章
  - [x] 题目列表卡片：优化题型标签、难度标签、知识点标签样式
  - [x] 编辑/添加弹窗：美化表单布局，统一间距
  - [x] 题目详情弹窗：优化顶部标题栏和底部操作区
  - [x] 空状态：统一图标 + 标题 + 描述 + 可选操作按钮
  - [x] 新增 CSS 类到 `index.css`：`.qb-selector-card`、`.qb-chapter-card`、`.qb-unit-card` 等

- [x] Task 5: 更新存储数据记录.txt，反映章节层级变更
  - [x] 更新"七、题库管理界面"章节
  - [x] 记录新的三步流程：分类→章节→单元→题目
  - [x] 记录无章节时的兼容降级逻辑

# Task Dependencies
- Task 2 依赖 Task 1（需要章节数据）
- Task 3 依赖 Task 1（需要章节数据）
- Task 4 依赖 Task 2、Task 3（在组件完成后美化）
- Task 5 可在 Task 4 完成后进行