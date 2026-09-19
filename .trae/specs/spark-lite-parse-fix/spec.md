# Spark Lite 分类检测/单元检测"AI未生成有效题目"修复 Spec

## Why
Spark Lite 模型调用成功后，返回的文本内容无法被 `parseQuestionResponse` 解析为有效的 JSON 题目数组，导致提示"AI 未生成有效题目"。这说明 Spark Lite 的输出格式与预期 JSON 结构存在偏差，需要在宽松解析模式中增加更多容错策略。

## What Changes
- 增强 `extractJsonFromAiResponse` 宽松模式，增加按 `{` 分割、逐对象提取的兜底策略
- 增强 `parseQuestionResponse` 的容错能力，支持从非标准 JSON 文本中逐个提取题目对象
- 优化 `TEST_QUESTION_GENERATION_PROMPT` 中 Spark Lite 的提示词，强调严格的 JSON 输出格式约束
- 在 `updateQuestionBank` 解析失败时记录原始 AI 返回内容到控制台，便于排查

## Impact
- Affected specs: 无（新问题）
- Affected code: `src/utils/helpers.js`（extractJsonFromAiResponse）、`src/services/testQuestionService.js`（parseQuestionResponse）、`src/utils/constants.js`（TEST_QUESTION_GENERATION_PROMPT）
- 不影响其他模型（DeepSeek/Qwen/Doubao）的解析流程

## ADDED Requirements

### Requirement: 宽松解析支持逐对象提取
The system SHALL 在宽松模式下，当正则提取 JSON 数组失败时，尝试按 `{...}` 边界逐对象提取，合并为有效题目数组。

#### Scenario: AI 返回多个 JSON 对象但未被数组包裹
- **GIVEN** Spark Lite 返回 `{...题目1...}\n{...题目2...}` 格式
- **WHEN** 标准 JSON 数组解析失败
- **THEN** 系统按 `{...}` 边界逐个提取对象，合并为题目数组

### Requirement: Spark Lite 提示词强化
The system SHALL 为 Spark Lite 生成检测题目时，在提示词中强调：
- 必须严格返回 JSON 数组格式 `[{...}, {...}]`
- 不要输出任何解释性文字、markdown 标记
- 每个对象的字段名必须使用双引号

#### Scenario: Spark Lite 按提示词要求输出
- **GIVEN** 用户选择 Spark Lite 进行分类检测
- **WHEN** 系统发送增强后的提示词
- **THEN** Spark Lite 输出的 JSON 可被解析为有效题目数组

### Requirement: 解析失败时记录原始输出
The system SHALL 在 `parseQuestionResponse` 返回 null 时，将原始 AI 输出内容通过 `console.warn` 记录，便于后续排查问题。

#### Scenario: 解析失败时查看控制台
- **WHEN** Spark Lite 返回内容无法解析
- **THEN** 控制台输出 `[parseQuestionResponse] 解析失败，原始内容前500字符：...`