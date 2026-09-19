# Tasks: 章节概念引入后强/弱模型出题调用排查

- [x] Task 1: 修复 `updateQuestionBank` 步2中章节检测的 categoryId 获取
  - [x] 将 `categoryId = testType === TEST_TYPES.UNIT ? ... : id` 改为同时处理 CHAPTER 情形
  - [x] CHAPTER 应使用 `cards[0]?.categoryId`

- [x] Task 2: 在六处数据流中新增 `chapterId` 字段
  - [x] `generateQuestionsForStrongModel` 的 `markerDataMap` 新增 `chapterId`
  - [x] `generateQuestionsForWeakModel` 的 `markerDataMap` 新增 `chapterId`
  - [x] `runLegacySingleBatch` 的 `markerDataMap` 新增 `chapterId`
  - [x] `matchQuestionsToCards` 匹配成功后返回 `chapterId`
  - [x] `updateQuestionBank` 的 `questionItems` 构造新增 `chapterId`
  - [x] `addTestQuestions` 新增 `chapterId` 字段及兜底逻辑

- [x] Task 3: 新增 `getTestQuestionsByChapter` 函数
  - [x] 在 `db.js` 中新增 `getTestQuestionsByChapter(chapterId)`，通过 `chapterId` 索引查询

- [x] Task 4: 更新 `AI出题算法报告.txt` 和 `存储数据记录.txt`
  - [x] 记录章节检测 categoryId 获取修复
  - [x] 记录 chapterId 字段在六处数据流的新增
  - [x] 更新 `testQuestions` 表的字段说明

# Task Dependencies
- Task 2 和 Task 3 可并行执行
- Task 1 可独立执行
- Task 4 在所有代码任务完成后执行