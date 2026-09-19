# Tasks

- [x] Task 1: 补充 CloudDataDetail.jsx 中 chapters 表的 FORM_FIELDS
  - [x] 在 FORM_FIELDS 对象中添加 `chapters` 条目，包含 `name`（必填, text）和 `categoryId`（必填, text）两个字段
  - [x] 验证：npm run build 通过

- [x] Task 2: 补充 CloudDataDetail.jsx 中 review_history 和 study_plans 的 TABLE_META / FORM_FIELDS / LOCAL_TABLE_MAP
  - [x] 在 TABLE_META 中添加 `review_history`：name=复习历史, business=['cardId', 'wasMastered', 'reviewedAt', 'mode'], meta=['id', 'categoryId', 'createdAt']
  - [x] 在 TABLE_META 中添加 `study_plans`：name=学习计划, business=['categoryId', 'dailyReviewLimit', 'dailyNewLimit', 'priority'], meta=['id', 'createdAt', 'updatedAt']
  - [x] 在 LOCAL_TABLE_MAP 中添加 `review_history: 'reviewHistory'` 和 `study_plans: 'studyPlans'`
  - [x] 在 FORM_FIELDS 中添加 `review_history`：cardId(必填, text), wasMastered(必填, select true/false), reviewedAt(必填, text), mode(必填, text), categoryId(可选, text)
  - [x] 在 FORM_FIELDS 中添加 `study_plans`：categoryId(必填, text), dailyReviewLimit(必填, number), dailyNewLimit(必填, number), priority(可选, number)
  - [x] 验证：npm run build 通过

- [x] Task 3: 修复 CloudData.jsx 中 review_history 和 study_plans 本地计数缺失
  - [x] 在 refreshLocalCounts 的 tables 数组中添加 `{ key: 'review_history', table: dbInstance.table('reviewHistory') }`
  - [x] 在 refreshLocalCounts 的 tables 数组中添加 `{ key: 'study_plans', table: dbInstance.table('studyPlans') }`
  - [x] 验证：npm run build 通过

- [x] Task 4: 修正 card_status 的 TABLE_META 字段
  - [x] 将 business 从 `['cardId', 'status', 'reviewCount', 'reviewStage']` 改为 `['cardId', 'status', 'reviewCount', 'mode', 'difficulty', 'wrongCount']`
  - [x] 在 meta 中补充 `categoryId` 字段
  - [x] 验证：npm run build 通过

- [x] Task 5: 在 CloudDataDetail.jsx 中阻止 card_status 上传
  - [x] 在 TABLE_META.card_status 中添加 `noUpload: true`
  - [x] 修改上传按钮逻辑：当 `meta.noUpload` 为 true 时，按钮显示"不可上传"并禁用
  - [x] 验证：npm run build 通过

- [x] Task 6: 补充 cards / units / wrong_answers 表单中的 chapterId 字段
  - [x] 在 FORM_FIELDS.cards 中添加 `{ key: 'chapterId', label: '所属章节 ID', type: 'text', required: false, placeholder: '章节 UUID' }`
  - [x] 在 FORM_FIELDS.units 中添加 `{ key: 'chapterId', label: '所属章节 ID', type: 'text', required: false, placeholder: '章节 UUID' }`
  - [x] 在 FORM_FIELDS.wrong_answers 中添加 `{ key: 'chapterId', label: '章节 ID', type: 'text', required: false, placeholder: '章节 UUID' }`
  - [x] 验证：npm run build 通过

# Task Dependencies
- Task 2、Task 3、Task 4、Task 5、Task 6 相互独立，可并行执行
- Task 1 与 Task 2 可并行执行