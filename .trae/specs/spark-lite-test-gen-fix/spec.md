# Spark Lite 分类检测/单元检测 AI调用失败修复 Spec

## Why
用户选择讯飞星火 Spark Lite 模型后，点击"分类检测"或"单元检测"按钮，提示"AI调用失败"，无法正常生成检测题目。其他模型（DeepSeek/Qwen/Doubao）正常。

## What Changes
- 统一 Spark Lite 模型名在各 AI 调用路径中的默认值，避免 API 不识别的模型名导致调用失败
- 增强 `generateTestQuestions` Spark 分支的错误日志，区分网络错误、API 业务错误、空响应等具体原因
- 为 `classifyError` 增加 Spark 特定错误码识别（如 401/403/404/413 等 HTTP 状态码 → 转为可读提示）

## Impact
- Affected specs: 无（新问题）
- Affected code: `src/services/aiService.js`（generateTestQuestions）、`src/services/testQuestionService.js`（classifyError）、`src/utils/constants.js`（MODELS 模型名）
- 不影响其他模型和已有的卡片生成/语音整理功能

## MODIFIED Requirements

### Requirement: Spark Lite 测试题目生成
The system SHALL 使用正确的模型名调用讯飞星火 HTTP API 生成检测题目。

#### Scenario: Spark Lite 分类检测成功
- **GIVEN** 用户在 AI 设置中选择讯飞星火 Spark Lite 模型并配置了 APIPassword
- **WHEN** 用户点击某个分类的"分类检测"按钮
- **THEN** 系统调用 `https://spark-api-open.xf-yun.com/v1/chat/completions`，model 字段使用 `lite`，返回的 JSON 题目数组成功解析并保存

#### Scenario: Spark Lite API 返回具体错误
- **GIVEN** Spark API 返回 HTTP 错误（如 401 认证失败）
- **WHEN** 系统收到非 200 响应
- **THEN** Toast 显示具体的错误原因（如"Spark: 认证失败，请检查 APIPassword"），而非笼统的"AI调用失败"

#### Scenario: Spark Lite 超时
- **GIVEN** Spark API 响应超过 60 秒
- **WHEN** httpPost 超时
- **THEN** Toast 显示"AI 调用超时，请检查网络后重试"

### Requirement: 错误分类增强
The system SHALL 识别 Spark API 返回的 HTTP 状态码并转为用户可理解的错误提示。

#### Scenario: 401 认证失败
- **WHEN** Spark API 返回 HTTP 401
- **THEN** 提示"Spark: 认证失败，请检查 APIPassword 是否正确"

#### Scenario: 模型名无效
- **WHEN** Spark API 返回模型名不支持的错误
- **THEN** 提示"Spark: 模型名称无效，请检查设置中的模型选择"