# Tasks

- [x] Task 1: 在分类卡片区根据 overviewMode 条件渲染不同内容
  - [x] 在 L1258 附近的分类卡片渲染逻辑中，根据 overviewMode 判断渲染章节视图还是单元视图
  - [x] 当 overviewMode === 'chapter' 时，渲染章节卡片列表
  - [x] 当 overviewMode === 'unit' 时，复用现有 UnitGroup 渲染逻辑

- [x] Task 2: 实现章节卡片组件渲染
  - [x] 创建章节卡片数据结构，从 chaptersMap 和 unitData 中提取数据
  - [x] 为每个分类渲染其下的章节卡片
  - [x] 章节卡片头部显示章节名称和卡片数
  - [x] 章节卡片可点击展开/折叠（复用 expandedChapters 状态）

- [x] Task 3: 实现章节卡片展开内容
  - [x] 展开后显示三个操作按钮：章节检测、章节复习、更新题库
  - [x] 操作按钮绑定对应的回调函数（handleChapterTest、handleChapterReview、handleChapterUpdateBank）
  - [x] 按钮样式与概览面板保持一致（primary-light/success-light/accent-light）
  - [x] 展开后显示该章节下的单元列表

- [x] Task 4: 处理未归属章节的单元
  - [x] 过滤出 chapterId === null 的单元
  - [x] 在章节卡片列表下方单独显示"未归章单元"区域
  - [x] 未归章单元区域显示操作按钮：分类检测、分类复习、更新题库

- [ ] Task 5: 验证与热更新测试
  - [ ] 确认章节视图下分类卡片区正确显示章节卡片
  - [ ] 确认章节卡片展开后操作按钮功能正常
  - [ ] 确认切换回单元视图后恢复原有行为
  - [ ] 确认未归章单元区域正确显示和处理
  - [ ] 确认移动端按钮可点击、无遮挡
  - [ ] 确认概览面板和分类卡片区视图同步

# Task Dependencies
- Task 2 依赖 Task 1（需要先有条件渲染框架）
- Task 3 依赖 Task 2（需要先有章节卡片结构）
- Task 4 可与 Task 2、3 并行实现
- Task 5 在所有代码改动完成后进行
