# 单元/分类检测 AI 出题归类正确性审计 Spec

## Why
用户需要验证：单元检测/分类检测在调用强模型/弱模型生成题目后，生成的题目是否能正确归类到对应的分类-章节-单元层次结构中。当前代码存在若干潜在问题，可能导致题目归类错误或章节检测完全不可用。

## What Changes
- 修复 `updateQuestionBank` 中章节检测（`TEST_TYPES.CHAPTER`）的卡片获取逻辑错误
- 修复兼容路径（`runLegacySingleBatch` / `buildPrompt`）缺失标记方案（marker scheme）导致题目无法精确匹配 cardId 的问题
- 修复 `getReviewQuestions` 中章节复习无法获取题目的问题
- 增强 `updateQuestionBank` 中步11.5的兜底逻辑，确保所有路径下的题目都有正确的 unitId/categoryId

## Impact
- Affected specs: 无（新增审计与修复）
- Affected code:
  - `src/services/testQuestionService.js` — `updateQuestionBank`, `buildPrompt`, `runLegacySingleBatch`, `getReviewQuestions`
  - `src/services/db.js` — 可能需要新增 `getCardsByChapter` 函数
  - `src/pages/UnitTestMain.jsx` — 章节检测入口已存在，无需修改

## ADDED Requirements

### Requirement: 章节检测卡片获取
系统 SHALL 在 `testType === TEST_TYPES.CHAPTER` 时，通过章节 ID 获取该章节下所有卡片（而非错误地调用 `getAllCardsByCategory`）。

#### Scenario: 章节检测获取卡片
- **WHEN** 用户触发章节检测（`handleChapterTest`）
- **THEN** `updateQuestionBank` 应调用 `getCardsByChapter(chapterId)` 获取该章节下所有单元的卡片

#### Scenario: 章节复习获取题目
- **WHEN** 用户触发章节复习（`handleChapterReview`）
- **THEN** `getReviewQuestions` 应能正确获取该章节下所有单元的题目

### Requirement: 兼容路径标记方案
系统 SHALL 在 `runLegacySingleBatch`（兼容路径）中同样使用标记方案（marker scheme），使 `buildPrompt` 在卡片格式中包含 `[mk=标记N]` 标记，并在 AI 返回后通过标记映射 cardId/unitId/categoryId。

#### Scenario: 兼容路径标记映射
- **WHEN** 当前 AI 配置不走强/弱模型路径（走兼容路径 `runLegacySingleBatch`）
- **THEN** Prompt 中卡片格式应包含 `[mk=标记N]` 标记
- **AND** AI 返回的题目应通过标记映射获取 cardId/unitId/categoryId

## MODIFIED Requirements

### Requirement: 兜底归类逻辑（步11.5）
系统 SHALL 在 `matchQuestionsToCards` 无法匹配时（cardId 为 null 且 knowledgePoint 不匹配），按以下规则兜底设置 unitId/categoryId：
- 分类检测：`categoryId = id`（分类ID），`unitId = null`（不挂到具体单元）
- 单元检测：`unitId = id`（单元ID），`categoryId = cards[0]?.categoryId`（从卡片获取）
- 章节检测：`categoryId = cards[0]?.categoryId`，`unitId = null`

原来的逻辑中，分类检测的 `fallbackCategoryId = id` 和 `fallbackUnit = null` 是正确的，但单元检测的 `fallbackUnit = cards.find(c => c.unitId)?.unitId` 不够精确——应直接使用 `id`（即调用方传入的单元ID）。

#### Scenario: 单元检测兜底
- **WHEN** 单元检测中某题目无法通过 cardId 或 knowledgePoint 匹配到卡片
- **THEN** 该题目的 `unitId` 应设为调用方传入的单元 ID（`id`），`categoryId` 从卡片获取

#### Scenario: 分类检测兜底
- **WHEN** 分类检测中某题目无法通过 cardId 或 knowledgePoint 匹配到卡片
- **THEN** 该题目的 `categoryId` 应设为调用方传入的分类 ID（`id`），`unitId` 保持 null