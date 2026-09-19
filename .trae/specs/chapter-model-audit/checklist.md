# Checklist: 章节概念引入后强/弱模型出题调用排查

- [x] `updateQuestionBank` 步2：CHAPTER 检测使用 `cards[0]?.categoryId` 而非 `id`
- [x] `generateQuestionsForStrongModel` 的 `markerDataMap` 包含 `chapterId: card.chapterId`
- [x] `generateQuestionsForWeakModel` 的 `markerDataMap` 包含 `chapterId: card.chapterId`
- [x] `runLegacySingleBatch` 的 `markerDataMap` 包含 `chapterId: card.chapterId`
- [x] `matchQuestionsToCards` 匹配成功后返回 `chapterId: matchedCard.chapterId || null`
- [x] `updateQuestionBank` 的 `questionItems` 包含 `chapterId` 字段
- [x] `addTestQuestions` 包含 `chapterId` 字段及兜底查询
- [x] `db.js` 存在 `getTestQuestionsByChapter(chapterId)` 函数
- [x] `npm run build` 生产构建通过
- [x] `AI出题算法报告.txt` 已更新
- [x] `存储数据记录.txt` 已更新