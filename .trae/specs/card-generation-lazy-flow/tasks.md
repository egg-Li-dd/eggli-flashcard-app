# Tasks

- [x] Task 1: 修改 handleKpConfirm 流程，移除卡片生成，按钮改为"确定"
  - [x] 1.1 修改 KnowledgePointConfirm 按钮文案为"确定"
  - [x] 1.2 移除 `handleKpConfirm` 中的 `generateCardsFromKnowledgePoints` 调用
  - [x] 1.3 保存知识点数据到 `cardGenStepSnapshots`，设置 `cardGenStep = 2`
  - [x] 1.4 确保 `pointsToUse`、`kpMarkers` 等数据正确传递到后续步骤

- [x] Task 2: 修改 TopicMergeSummaryModal 显示知识点数
  - [x] 2.1 标题栏改为显示"X 章节 · Y 单元 · K 知识点"
  - [x] 2.2 每个章节行改为显示"X 知识点 · Y 单元"
  - [x] 2.3 知识点数从 `mergeSummaryData` 中获取（`kpCount` 或从 `pointsToUse.length` 计算）

- [x] Task 3: 新增"确定并预览卡片"按钮与卡片生成逻辑
  - [x] 3.1 在 TopicMergeSummaryModal 底部添加"确定并预览卡片"按钮
  - [x] 3.2 弱模型：直接构建卡片 `{ front: kp, back: kp, knowledge_point: kp }`，1:1 映射
  - [x] 3.3 强模型：调用 `generateCardsFromKnowledgePoints` 生成卡片
  - [x] 3.4 生成过程中显示加载状态和进度
  - [x] 3.5 生成完成后设置 `cardGenStep = 5`，进入 NewCardPreviewPanel

- [x] Task 4: 创建三下滑栏式 NewCardPreviewPanel 组件
  - [x] 4.1 创建 `src/components/NewCardPreviewPanel.jsx` 文件
  - [x] 4.2 第一层：章节列表（可折叠展开）
  - [x] 4.3 第二层：展开章节后显示单元列表
  - [x] 4.4 第三层：展开单元后显示卡片列表，含 front/back/knowledge_point
  - [x] 4.5 卡片可点击展开编辑模式，支持编辑 front 和 back
  - [x] 4.6 底部"确认保存"按钮，调用保存逻辑
  - [x] 4.7 移动端自适应（minHeight: 44px，按钮可见可用）

- [x] Task 5: 集成保存逻辑与数据库写入
  - [x] 5.1 将原 `handleMergeSummaryConfirm` 保存逻辑迁移到 NewCardPreviewPanel 的"确认保存"
  - [x] 5.2 调用 `addUnitsWithMatching` 创建章节、单元、卡片
  - [x] 5.3 保存成功后关闭所有模态框，刷新分类页面

- [x] Task 6: 上一步按钮适配新流程
  - [x] 6.1 NewCardPreviewPanel 的"上一步"返回到 TopicMergeSummaryModal（Step 4）
  - [x] 6.2 确保返回时保留卡片数据

# Task Dependencies
- Task 2 依赖 Task 1（需要知识点数据）
- Task 3 依赖 Task 2（在 TopicMergeSummaryModal 中添加按钮）
- Task 4 依赖 Task 3（需要卡片生成完成后才进入预览）
- Task 5 依赖 Task 4（预览面板中触发保存）
- Task 6 依赖 Task 4（预览面板中的上一步按钮）