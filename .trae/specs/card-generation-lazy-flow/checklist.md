# Checklist

- [x] KnowledgePointConfirm 按钮文案为"确定"而非"生成卡片"
- [x] 点击"确定"后不调用任何 AI 卡片生成 API
- [x] 知识点数据正确传递到 TopicConfirmModal（Step 2）
- [x] TopicMergeSummaryModal 标题栏显示知识点数而非卡片数
- [x] 每个章节行显示"X 知识点 · Y 单元"
- [x] "确定并预览卡片"按钮在 TopicMergeSummaryModal 底部可见可用
- [x] 弱模型点击"确定并预览卡片"后卡片数量 = 知识点数量（1:1）
- [x] 弱模型卡片 front/back 为知识点原文（非占位文本）
- [x] 强模型点击"确定并预览卡片"后显示生成进度
- [x] NewCardPreviewPanel 三下滑栏层级正确渲染
- [x] 章节→单元→卡片逐层展开折叠正常
- [x] 卡片点击展开编辑模式，front/back 可编辑
- [x] "确认保存"按钮正常保存到数据库（章节、单元、卡片）
- [x] 保存成功后关闭模态框，刷新分类页面
- [x] "上一步"按钮从 NewCardPreviewPanel 返回 TopicMergeSummaryModal
- [x] 所有按钮 minHeight ≥ 44px，移动端自适应
- [x] 不影响现有非生成流程功能（录音、OCR、背诵等）