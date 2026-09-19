# 验证清单：背诵计划双向同步机制

## 状态更新修复验证

- [ ] ebbinghaus 模式点击「已掌握」后，UI 状态立即变化
- [ ] 数据库中 cardStatus 记录的 status 字段正确更新

## 双向同步功能验证

### Task 1: setCardStatus existingRecord id 修复
- [ ] existingRecord 缺少 id 时能正确从数据库查询
- [ ] 数据库 update 操作不会静默失败

### Task 2: setCardStatus 双向同步逻辑
- [ ] ebbinghaus 模式点击「已掌握」→ short 记录同步更新为 mastered
- [ ] ebbinghaus 模式点击「待掌握」→ short 记录同步更新为 review
- [ ] short 模式点击「已掌握」→ 只有 short 更新，ebbinghaus 完全不变
- [ ] short 模式点击「待掌握」→ ebbinghaus 执行降级（reps=0，interval 减半）
- [ ] short 状态已是 review 时再次点击「待掌握」→ 不重复触发降级

### Task 3: 数据库索引
- [ ] 可以通过 `where({ cardId, categoryId, mode })` 查询特定模式的记录

### Task 4: Memorize.jsx mode 映射
- [ ] sequential 模式映射为 short
- [ ] active 模式映射为 short
- [ ] weak 模式映射为 short
- [ ] ebbinghaus 模式保持 ebbinghaus

### Task 5: testGradingService.js
- [ ] 测试答错只更新 short status=review
- [ ] 测试答对只更新 short status=mastered
- [ ] ebbinghaus 参数完全不变

### Task 6: ebbinghaus.js 工具函数
- [ ] filterDueCards 只返回 ebbinghaus 模式的到期卡片
- [ ] getDueCount 只统计 ebbinghaus 模式

### Task 7: StudyPlan.jsx 统计
- [ ] 今日到期卡片数只包含 ebbinghaus 模式
- [ ] 阶段分布只统计 ebbinghaus 模式

### Task 8: 数据迁移
- [ ] 旧数据的 sequential/active/weak 记录正确转为 short
- [ ] ebbinghaus 记录保持不变

## UI 交互验证

- [ ] 背诵页面按钮点击后状态立即更新（无延迟）
- [ ] 计划页面统计数字与实际一致
- [ ] 薄弱模式显示的是 short=status='review' 的卡片

## 云端同步验证

- [ ] ebbinghaus 记录正确上传到云端
- [ ] short 记录不同步到云端
