# 章节概念引入后强/弱模型出题调用排查 Spec

## Why
在引入章节（chapter）概念后，通过 `TEST_TYPES.CHAPTER` 调用强/弱模型出题时，存在多个遗漏和缺陷：`chapterId` 字段在数据流中多处缺失、章节检测的卡片状态查询使用了错误的 `categoryId`、题目入库时未写入 `chapterId`。

## What Changes
- 修复 `updateQuestionBank` 步2中章节检测的 `categoryId` 获取逻辑（错误地将 chapterId 当 categoryId 传入）
- 在 `questionItems` 构造中新增 `chapterId` 字段
- 在 `addTestQuestions` 中新增 `chapterId` 字段及兜底逻辑
- 在 `matchQuestionsToCards` 中新增 `chapterId` 返回
- 在三个路径（强/弱/兼容）的 `markerDataMap` 中新增 `chapterId`
- 新增 `getTestQuestionsByChapter` 函数

## Impact
- Affected specs: `test-generation-classification-audit`（刚完成的审计，本次是其补充）
- Affected code:
  - `src/services/testQuestionService.js` — `updateQuestionBank`, `matchQuestionsToCards`, `generateQuestionsForStrongModel`, `generateQuestionsForWeakModel`, `runLegacySingleBatch`
  - `src/services/db.js` — `addTestQuestions`, 新增 `getTestQuestionsByChapter`

## ADDED Requirements

### Requirement: questionItems 包含 chapterId
系统 SHALL 在 `updateQuestionBank` 构造 `questionItems` 时，为每道题目写入 `chapterId` 字段，来源为对应卡片的 `card.chapterId`。

#### Scenario: 章节检测出题入库
- **WHEN** 章节检测生成的题目入库
- **THEN** 每道题目的 `chapterId` 应从其匹配卡片或 `markerDataMap` 中获取

#### Scenario: 单元/分类检测出题入库
- **WHEN** 单元检测或分类检测生成的题目入库
- **THEN** 每道题目的 `chapterId` 也应从卡片中获取（卡片本身有 `chapterId`）

### Requirement: addTestQuestions 包含 chapterId
系统 SHALL 在 `addTestQuestions` 函数中写入 `chapterId` 字段，若传入题目未携带则从 `cards` 表或 `units` 表兜底查询。

### Requirement: markerDataMap 包含 chapterId
系统 SHALL 在强模型（`generateQuestionsForStrongModel`）、弱模型（`generateQuestionsForWeakModel`）、兼容路径（`runLegacySingleBatch`）三处的 `markerDataMap` 中新增 `chapterId` 字段，来源为 `card.chapterId`。

### Requirement: matchQuestionsToCards 返回 chapterId
系统 SHALL 在 `matchQuestionsToCards` 函数匹配成功后，返回 `chapterId` 字段。

### Requirement: getTestQuestionsByChapter 函数
系统 SHALL 提供 `getTestQuestionsByChapter(chapterId)` 函数，通过 `chapterId` 索引直接查询章节下所有题目。

## MODIFIED Requirements

### Requirement: 章节检测的 categoryId 获取（步2）
原逻辑中 `categoryId = testType === TEST_TYPES.UNIT ? cards[0]?.categoryId : id`，当 `testType === CHAPTER` 时 `id` 为章节ID而非分类ID，导致 `getCardStatusesByCategory` 传入错误的 ID、返回空 statusMap。

修改后：CHAPTER 应使用 `cards[0]?.categoryId`（与 UNIT 相同），而非 `id`。

#### Scenario: 章节检测获取卡片状态
- **WHEN** 章节检测调用 `updateQuestionBank`
- **THEN** `categoryId` 应从 `cards[0]?.categoryId` 获取，而非使用 `id`（章节ID）
- **AND** `getCardStatusesByCategory` 能正确返回该分类下所有卡片的状态