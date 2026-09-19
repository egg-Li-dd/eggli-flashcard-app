# 卡片生成延迟化流程重构 Spec

## Why
当前流程在知识点确认后立即调用 AI 生成卡片正反面内容，弱模型（Spark Lite）在此步骤频繁出现占位文本、JSON 格式错误、卡片丢失等问题，导致 39 个知识点仅剩 9-17 张有效卡片。此外，后续步骤（主题分组确认、知识体系结构调整）均不依赖卡片正反面内容，过早生成卡片浪费了 AI 调用且引入了不必要的失败点。

核心思路：将卡片正反面生成延迟到用户确认知识体系结构之后，此前所有步骤仅操作知识点数据，确保 1:1 不丢失。

## What Changes
- **BREAKING** `handleKpConfirm` 不再调用 `generateCardsFromKnowledgePoints`，改为直接确认知识点并进入下一步
- **BREAKING** 知识体系结构调整完成界面（TopicMergeSummaryModal）显示知识点数而非卡片数
- 知识体系结构调整完成界面新增"确定并预览卡片"按钮，点击后触发卡片正反面生成
- 新增卡片生成状态管理（`cardGenLoading`、`cardGenProgress`），在生成过程中显示进度
- 新增三下滑栏式新卡片预览界面（NewCardPreviewPanel），按章节→单元→卡片层级展示
- 弱模型跳过 AI 生成卡片步骤，直接使用知识点原文作为卡片正反面（1:1 保证）
- 强模型保留 AI 生成卡片逻辑，但延迟到结构确认后执行

## Impact
- Affected specs: weak-model-data-loss-fix, knowledge-flow-restructure
- Affected code: `src/pages/Category.jsx`（handleKpConfirm、TopicMergeSummaryModal、新增 NewCardPreviewPanel）、`src/services/aiService.js`（generateCardsFromKnowledgePoints 调用位置）

## ADDED Requirements

### Requirement: 知识点确认后直接进入主题分组
知识点确认界面（KnowledgePointConfirm）的右下角按钮从"生成卡片"改为"确定"。
点击"确定"后，系统 SHALL 直接使用知识点数据进入新主题分组确认界面，不对卡片正反面做任何生成。

#### Scenario: 用户确认知识点
- **WHEN** 用户在 KnowledgePointConfirm 界面点击"确定"
- **THEN** 系统保存知识点数据（cardGenStepSnapshots），进入 TopicConfirmModal（Step 2）
- **AND** 不调用任何 AI 卡片生成 API

### Requirement: 知识体系结构调整界面显示知识点数
TopicMergeSummaryModal 的标题栏和章节-单元树中 SHALL 显示知识点数量而非卡片数量。

#### Scenario: 显示知识点计数
- **WHEN** 知识体系结构调整完成，界面渲染
- **THEN** 标题栏显示"AI 已完成章节与单元的合并优化 · N 章节 · M 单元 · K 知识点"
- **AND** 每个章节行显示"X 知识点 · Y 单元"

### Requirement: 延迟卡片生成触发
在 TopicMergeSummaryModal 底部 SHALL 有"确定并预览卡片"按钮。
点击后系统 SHALL 根据模型类型执行不同策略：
- 弱模型（Spark Lite）：直接使用知识点原文构建卡片，不调用 AI
- 强模型：调用 `generateCardsFromKnowledgePoints` 批量生成卡片正反面

#### Scenario: 弱模型生成卡片
- **WHEN** 用户使用弱模型点击"确定并预览卡片"
- **THEN** 系统为每个知识点创建卡片：`{ front: kpText, back: kpText, knowledge_point: kpText }`
- **AND** 卡片数量 = 知识点数量（1:1 保证）
- **AND** 不调用 AI API

#### Scenario: 强模型生成卡片
- **WHEN** 用户使用强模型点击"确定并预览卡片"
- **THEN** 系统调用 `generateCardsFromKnowledgePoints` 批量生成
- **AND** 显示生成进度（"正在生成卡片... 1/2"）
- **AND** 完成后进入 NewCardPreviewPanel

### Requirement: 三下滑栏式新卡片预览
NewCardPreviewPanel SHALL 以三下滑栏结构展示卡片：
- 第一层：章节列表（可展开/折叠）
- 第二层：展开章节后显示单元列表
- 第三层：展开单元后显示卡片列表，每张卡片可编辑正反面

#### Scenario: 层级导航
- **WHEN** 用户点击章节名
- **THEN** 该章节展开，显示其下所有单元
- **WHEN** 用户点击单元名
- **THEN** 该单元展开，显示其下所有卡片
- **AND** 每张卡片显示 front（正面）、back（背面）、knowledge_point（知识点）

#### Scenario: 卡片编辑
- **WHEN** 用户点击卡片
- **THEN** 卡片展开为编辑模式，可编辑 front 和 back 字段
- **WHEN** 用户点击"保存"
- **THEN** 卡片更新并折叠

### Requirement: 确认并保存到数据库
NewCardPreviewPanel 底部有"确认保存"按钮。
点击后系统 SHALL 调用 `handleMergeSummaryConfirm` 逻辑，将卡片保存到数据库。

#### Scenario: 保存成功
- **WHEN** 用户点击"确认保存"
- **THEN** 系统创建章节（通过 addChapter）、创建单元、保存卡片
- **AND** 关闭所有模态框，刷新分类页面

## MODIFIED Requirements

### Requirement: handleKpConfirm 流程简化
原 `handleKpConfirm` 中的卡片生成逻辑 SHALL 移除。
函数仅负责：保存知识点数据到 cardGenStepSnapshots，设置 cardGenStep 进入 Step 2。

### Requirement: TopicMergeSummaryModal 数据结构
`mergeSummaryData` 中不再需要 `cards` 数组。
`handleMergeSummaryConfirm` 的逻辑移至 NewCardPreviewPanel 的"确认保存"按钮。

## REMOVED Requirements
无