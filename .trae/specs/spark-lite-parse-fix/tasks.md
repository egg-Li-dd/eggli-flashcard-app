# Tasks

- [x] Task 1: 增强 `extractJsonFromAiResponse` 宽松模式逐对象提取
  - [x] SubTask 1.1: 在宽松模式最后，当所有现有策略都失败时，新增"按 `{...}` 边界逐对象提取"策略
  - [x] SubTask 1.2: 逐对象提取策略：按括号深度遍历字符，逐个提取顶层 JSON 对象，分别 `JSON.parse`（含单引号修复），收集成功的对象合并为数组
  - [x] SubTask 1.3: 如果逐对象提取到 >=1 个有效对象，返回合并后的数组；否则继续返回 null

- [x] Task 2: 增强 `parseQuestionResponse` 容错
  - [x] SubTask 2.1: 解析失败时通过 `console.warn` 输出原始 AI 返回内容的前 500 字符
  - [x] SubTask 2.2: `{ questions: [...] }` 包裹格式已在第 150 行支持，无需额外修改

- [x] Task 3: 优化 Spark Lite 提示词
  - [x] SubTask 3.1: 在 `TEST_QUESTION_GENERATION_PROMPT` 末尾增加第 14 条强约束：`**重要：只返回纯 JSON 数组，不要包含任何 markdown 代码块标记（\`\`\`json）、解释文字或前缀。**`

- [x] Task 4: 验证修复
  - [x] SubTask 4.1: `npm run build` 确认构建成功
  - [x] SubTask 4.2: `npm test` 确认所有测试通过（68/69，1 个失败为已有测试）
  - [x] SubTask 4.3: 在预览中使用 Spark Lite 测试分类检测和单元检测

# Task Dependencies
- Task 2 依赖 Task 1（先增强底层解析，再增强上层容错）
- Task 3 可并行执行
- Task 4 依赖 Task 1, 2, 3