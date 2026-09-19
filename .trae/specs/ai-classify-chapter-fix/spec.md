# AI 归类章节修复 Spec

## Why
AI 分类功能（智能单元管理 / AI 全权归类 / 指定分类归类）存在 5 个导致章节无法正常分配的 bug，表现为：无法分配章节、所有内容归入"默认章节"、一个单元一个章节。

## What Changes
- 修复 `classifySameCategoryReorganize` 部分失败时 fallback 结果解析错误（检查 `fallback.units` 但实际返回 `fallback.chapters`）
- 修复 `buildSameCategoryFallback` 无章节时降级为纯单元模式，改为直接创建章节结构
- 修复 `handleTargetCategoryNext`（指定分类归类）缺少 `classificationDepth` 和 `existingChapters` 参数
- 修复 `handleCardSelectionNext`（跨分类全权归类）缺少 `classificationDepth` 和 `existingChapters` 参数
- 强化 AI prompt 约束，防止 AI 为每个单元创建独立章节（"一个单元一个章节"）

## Impact
- Affected specs: 无
- Affected code: `src/services/aiService.js`, `src/pages/Category.jsx`

## MODIFIED Requirements
### Requirement: classifySameCategoryReorganize 部分失败处理
系统 SHALL 在 AI 返回部分结果时，正确合并 fallback 结果中的 `chapters`（而非 `units`），避免未匹配卡片被丢弃。

#### Scenario: AI 返回部分章节后 fallback
- **WHEN** AI 成功分类部分卡片到章节，但部分卡片未匹配
- **THEN** 系统 SHALL 将 fallback 返回的 `chapters` 合并到结果中，而非检查 `fallback.units`

### Requirement: buildSameCategoryFallback 无章节处理
系统 SHALL 在无现有章节时，根据 `classificationDepth` 为 `chapter-and-unit` 创建章节结构，而非降级为纯单元模式。

#### Scenario: chapter-and-unit 深度无现有章节
- **WHEN** `classificationDepth === 'chapter-and-unit'` 且 `existingChapters.length === 0`
- **THEN** 系统 SHALL 为每张卡片创建章节结构（按关键词分组），而非返回纯 `{ units }`

### Requirement: 指定分类归类传入章节参数
系统 SHALL 在 `handleTargetCategoryNext` 调用 `classifyCardsByCategoryContent` 时传入 `classificationDepth: 'chapter-and-unit'` 和 `existingChapters`。

#### Scenario: 指定分类归类
- **WHEN** 用户选择目标分类并确认
- **THEN** 系统 SHALL 传入章节参数，使 AI 能将卡片归类到目标分类的章节中

### Requirement: 跨分类全权归类传入章节参数
系统 SHALL 在 `handleCardSelectionNext`（cross-category-auto）调用 `classifyCardsByCategoryContent` 时传入 `classificationDepth` 和 `existingChapters`。

#### Scenario: 跨分类全权归类
- **WHEN** 用户触发跨分类全权归类
- **THEN** 系统 SHALL 传入章节参数，使 AI 能创建章节+单元层级结构

### Requirement: AI prompt 强化防一个单元一个章节
系统 SHALL 在 `classifySameCategoryReorganize` 的 `chapter-and-unit` prompt 中增加约束：禁止为每个单元创建独立章节，要求相同主题的单元归入同一章节。

#### Scenario: 多单元同主题
- **WHEN** AI 判断多个单元属于同一主题
- **THEN** AI SHALL 将其归入同一章节，而非为每个单元创建独立章节