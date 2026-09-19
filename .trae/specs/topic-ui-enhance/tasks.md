# Tasks

- [ ] 1. 修改 `clusterKnowledgePointsByTopic` 同步生成单元归类
  - [ ] 1.1 强模型路径：修改 prompt，要求每个主题输出 `units: [{unitName, pointIndices}]`
  - [ ] 1.2 弱模型路径（Spark）：同步修改 `clusterKnowledgePointsByTopicWithSpark` prompt
  - [ ] 1.3 添加兼容逻辑：AI 未返回 `units` 时自动将所有知识点归入"基础"单元
  - [ ] 1.4 更新 `calculateTopicRange` 和粒度控制逻辑

- [ ] 2. 修改 `generateNewTopicsAndUnits` 复用单元结构
  - [ ] 2.1 从 `finalTopics` 中提取 `units` 字段，直接映射 `kpIndex → {chapterName, unitName}`
  - [ ] 2.2 移除强模型路径中的 AI 单元聚类调用（不再需要重新聚类）
  - [ ] 2.3 弱模型路径同样改为直接复用，移除 Round2 单元聚类
  - [ ] 2.4 保留降级逻辑（当 finalTopics 不含 units 时）

- [ ] 3. 重构 TopicConfirmModal 三级层级展示
  - [ ] 3.1 主题卡片改为可展开/折叠（点击展开，默认第一个展开）
  - [ ] 3.2 展开后显示单元分组列表
  - [ ] 3.3 每个单元下显示知识点预览（最多 3 个）
  - [ ] 3.4 知识点数量统计格式为"X 个知识点 · Y 个单元"

- [ ] 4. 优化"简"/"详"按钮行为
  - [ ] 4.1 点击时 toast 显示当前主题数量
  - [ ] 4.2 prompt 中强制要求比当前更少/更多的主题
  - [ ] 4.3 已最简时（1-2 主题）提示不可再简

- [ ] 5. 创建合并结果弹窗组件
  - [ ] 5.1 在 Category.jsx 中新增 `TopicMergeSummaryModal` 组件
  - [ ] 5.2 展示章节/单元分布
  - [ ] 5.3 展示合并说明文字
  - [ ] 5.4 "确认并预览卡片"按钮

- [ ] 6. 集成到 handleTopicConfirm 流程
  - [ ] 6.1 合并结果弹窗在去重检查前弹出
  - [ ] 6.2 用户确认后继续去重和预览

# Task Dependencies
- Task 2 依赖 Task 1（需要新的 units 数据结构）
- Task 3 依赖 Task 1
- Task 5 和 Task 6 可并行开发
- Task 4 依赖 Task 1