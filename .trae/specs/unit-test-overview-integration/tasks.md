# Tasks

- [x] Task 1: 在检测概览面板顶部新增视图模式切换 Tab
  - [x] 新增 `overviewMode` 状态（'unit' | 'chapter'），默认 'unit'
  - [x] 在概览面板中（overviewOpen 展开时），在分类列表上方渲染两个 Tab 按钮："单元视图" 和 "章节视图"
  - [x] Tab 按钮样式：水平并排，各占 50% 宽度，选中态高亮（--color-primary 背景），未选中态为次要色（--color-border-light 背景）
  - [x] 按钮 minHeight ≥ 44px，符合移动端触控标准
  - [x] 切换 Tab 时重置章节相关状态（selectedChapterId, activeChapterCategoryId, expandedChapters）

- [x] Task 2: 实现章节视图下的"分类→章节→单元"三级层级渲染
  - [x] 在 overviewMode === 'chapter' 时，渲染章节视图内容替代原单元视图
  - [x] 分类行可点击展开/折叠，展示该分类下的章节列表
  - [x] 每个章节行可点击展开/折叠，选中时高亮（绿色背景，`--color-success-light`）
  - [x] 章节行右侧显示该章节下卡片总数
  - [x] 章节展开后显示：操作按钮区（章节检测/章节复习/更新题库）+ 该章节下单元列表
  - [x] 操作按钮配色与现有 UnitGroup 中的按钮保持一致（primary-light/success-light/accent-light）
  - [x] 无章节的分类显示"该分类下暂无章节"提示
  - [x] 数据来源：复用现有 chaptersMap、unitData、cardCounts

- [x] Task 3: 移除独立的章节检测按钮区域
  - [x] 删除 L651-779 的独立"📖 按章节检测"按钮及展开区域
  - [x] 清理不再需要的状态：chapterTestMode 替换为 overviewMode
  - [x] 保留 handleChapterTest、handleChapterReview、handleChapterUpdateBank 回调函数（它们被章节视图复用）

- [x] Task 4: 验证与热更新测试
  - [x] 确认概览面板在单元视图下功能不变（分类展开/折叠、单元定位、点击跳转）
  - [x] 确认章节视图下可以正常选择分类→选择章节→点击操作按钮
  - [x] 确认章节检测/复习/更新题库三个按钮功能正常（触发 AI 出题、跳转页面）
  - [x] 确认两视图切换状态正确隔离，互不干扰
  - [x] 确认移动端按钮 minHeight ≥ 44px，概览面板滚动正常
  - [x] 确认无章节分类显示提示文案
  - [x] 确认"全部展开/收起"按钮在章节视图下也正常工作

# Task Dependencies
- Task 2 依赖 Task 1（需要先有 Tab 切换状态）
- Task 3 可以在 Task 1、2 完成后进行，也可独立并行
- Task 4 在所有代码改动完成后进行