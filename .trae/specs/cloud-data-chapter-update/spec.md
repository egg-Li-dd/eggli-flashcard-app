# 云端数据处理界面更新 — 引入分类/章节后的适配

## Why
引入"分类→章节→单元→卡片"四级结构后，云端数据处理界面（CloudData.jsx / CloudDataDetail.jsx）存在多处遗漏：新增的 `chapters`、`review_history`、`study_plans` 表在详情页缺少完整支持；部分表的字段定义不准确；`card_status` 的上传限制在主页面和详情页不一致。

## What Changes
- 补充 `chapters` 表的 FORM_FIELDS（添加章节记录表单）
- 补充 `review_history` 和 `study_plans` 表在 CloudDataDetail.jsx 中的 TABLE_META、FORM_FIELDS、LOCAL_TABLE_MAP
- 修复 CloudData.jsx 中 `review_history` 和 `study_plans` 本地计数缺失问题
- 修正 `card_status` 的 TABLE_META 字段（移除不存在的 `reviewStage`，补充 `mode`、`difficulty` 等）
- 补充 `cards`、`units`、`wrong_answers` 表单中的 `chapterId` 字段
- 在 CloudDataDetail.jsx 中阻止 `card_status` 上传（与主页面 `noUpload` 保持一致）

## Impact
- Affected specs: cloud-data-filter, cloud-data-fixes
- Affected code: `src/pages/CloudData.jsx`, `src/pages/CloudDataDetail.jsx`

## ADDED Requirements

### Requirement: chapters 表添加表单支持
CloudDataDetail 页面 SHALL 支持通过表单添加新的云端章节记录（chapters 表）。

#### Scenario: 用户在云端章节详情页添加章节
- **WHEN** 用户在云端章节数据详情页点击"＋ 添加"按钮
- **THEN** 弹出表单，包含"章节名称"（name）和"所属分类 ID"（categoryId）两个必填字段
- **AND** 提交后新章节记录写入云端 Supabase chapters 表

### Requirement: review_history 和 study_plans 表详情页支持
CloudDataDetail 页面 SHALL 支持 `review_history` 和 `study_plans` 表的完整查看、筛选、下载、删除功能。

#### Scenario: 用户从主页面进入复习历史详情页
- **WHEN** 用户在主页面点击"复习历史"的"云端数据"按钮
- **THEN** 进入详情页，正确显示云端复习历史记录（cardId、wasMastered、reviewedAt、mode 等字段）
- **AND** 支持筛选、下载、删除操作

#### Scenario: 用户从主页面进入学习计划详情页
- **WHEN** 用户在主页面点击"学习计划"的"云端数据"按钮
- **THEN** 进入详情页，正确显示云端学习计划记录（categoryId、dailyReviewLimit、dailyNewLimit 等字段）
- **AND** 支持筛选、下载、删除操作

### Requirement: 主页面补充 review_history 和 study_plans 本地计数
CloudData 主页面 SHALL 在刷新本地计数时包含 `reviewHistory` 和 `studyPlans` 表。

#### Scenario: 主页面加载时显示复习历史和学习计划本地计数
- **WHEN** CloudData 页面加载
- **THEN** "复习历史"和"学习计划"行显示正确的本地记录数（而非始终为 0）

## MODIFIED Requirements

### Requirement: card_status 字段定义修正
CloudDataDetail 中 `card_status` 的 TABLE_META SHALL 使用实际存在的字段名。

#### Scenario: 查看学习状态详情
- **WHEN** 用户查看云端学习状态数据
- **THEN** 业务字段显示 `cardId`、`status`、`reviewCount`、`mode`、`difficulty`、`wrongCount`（而非不存在的 `reviewStage`）

### Requirement: card_status 上传限制统一
CloudDataDetail 页面 SHALL 阻止 `card_status` 数据上传到云端，与主页面保持一致。

#### Scenario: 用户在详情页无法上传学习状态
- **WHEN** 用户在 card_status 详情页
- **THEN** 上传按钮显示为禁用状态，标签为"不可上传"

### Requirement: cards / units / wrong_answers 表单补充 chapterId
添加云端记录的表单 SHALL 包含 `chapterId` 字段（可选）。

#### Scenario: 添加卡片时包含 chapterId
- **WHEN** 用户在云端卡片详情页点击"＋ 添加"
- **THEN** 表单包含"所属章节 ID"（chapterId）可选字段

#### Scenario: 添加单元时包含 chapterId
- **WHEN** 用户在云端单元详情页点击"＋ 添加"
- **THEN** 表单包含"所属章节 ID"（chapterId）可选字段

#### Scenario: 添加错题记录时包含 chapterId
- **WHEN** 用户在云端错题记录详情页点击"＋ 添加"
- **THEN** 表单包含"章节 ID"（chapterId）可选字段