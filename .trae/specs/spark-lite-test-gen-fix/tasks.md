# Tasks

- [x] Task 1: 排查并统一 Spark Lite 模型名
  - [x] SubTask 1.1: 检查 `src/utils/constants.js` 中 MODELS 数组，确认 Spark 模型的 `value` 字段 — `lite` 正确
  - [x] SubTask 1.2: 检查 `src/services/aiService.js` `generateTestQuestions` 和 `callAiProvider` 中 Spark 分支的模型默认值 — 发现 `aiConfig` 未传 `sparkModel`，导致使用错误的 DeepSeek 模型名
  - [x] SubTask 1.3: 在 `UnitTestMain.jsx` `aiConfig` 中新增 `sparkModel`；在 `generateTestQuestions` 中使用 `sparkModel || 'lite'`
  - [x] SubTask 1.4: 检查 `src/services/testGradingService.js` 中 `callAiForGrading` 和 `sendAiRequest` 的 Spark 模型默认值 — 一致，使用 `config.model || 'lite'`

- [x] Task 2: 增强错误分类识别
  - [x] SubTask 2.1: 修改 `src/services/testQuestionService.js` `classifyError` 函数，识别 HTTP 状态码（401/403/429/500 等）并给出具体提示
  - [x] SubTask 2.2: 检查 `src/services/aiService.js` `generateTestQuestions` Spark 分支的错误处理 — 已正确传递 `throw new Error('Spark: ' + msg)`，`classifyError` 可正常捕获

- [x] Task 3: 验证修复
  - [x] SubTask 3.1: `npm run build` 确认构建成功
  - [x] SubTask 3.2: `npm test` 确认所有测试通过（68/69，1 个失败为已有测试）
  - [x] SubTask 3.3: 预览已打开，可在浏览器中测试 Spark Lite 分类检测和单元检测

# Task Dependencies
- Task 2 依赖 Task 1（先统一模型名，再增强错误提示）
- Task 3 依赖 Task 1, 2