# 任务清单：背诵计划双向同步机制

## Task 1: 修复 setCardStatus 的 existingRecord id 问题

**问题**：`existingRecord` 可能缺少 `id` 字段导致数据库更新静默失败

**操作**：
- [ ] 在 `db.js` 的 `setCardStatus` 函数开头添加 id 验证逻辑
- [ ] 如果 `existingRecord` 存在但缺少 `id`，从数据库重新查询

**验证**：
- [ ] 手动测试：切换到 ebbinghaus 模式，点击「已掌握」按钮
- [ ] 检查数据库中 cardStatus 记录是否正确更新

---

## Task 2: 重构 setCardStatus 支持双向同步

**操作**：
- [ ] 创建 `updateShortStatus(cardId, categoryId, status)` 内部函数
- [ ] 创建 `degradeEbbinghausRecord(cardId, categoryId)` 内部函数
  - **关键**：只有当 short 状态变为 'review' 时才触发
  - **避免重复降级**：如果 ebbinghaus.reps === 0，不再重复降级
- [ ] 重写 `setCardStatus` 的 switch 逻辑：
  - `mode='ebbinghaus'`：更新 SM-2 参数 + 同步 short status（无论 status 是 mastered 还是 review）
  - `mode='short'`：
    - status='mastered' → 只更新 short status，**不触发降级，不影响 ebbinghaus**
    - status='review' → 更新 short status + 触发降级
  - `mode='test'`：映射为 'short'，行为同 'short'
- [ ] 添加 `skipReverseSync` 参数避免循环调用

**验证**：
- [ ] ebbinghaus 点击「已掌握」→ short status 同步变为 mastered
- [ ] ebbinghaus 点击「待掌握」→ short status 同步变为 review
- [ ] short 点击「已掌握」→ 只有 short 更新，ebbinghaus 完全不变
- [ ] short 点击「待掌握」→ ebbinghaus 执行降级（reps=0）
- [ ] short 状态已是 review，再次点击「待掌握」→ 不重复降级

---

## Task 3: 更新 db.js 索引支持 mode 查询

**操作**：
- [ ] 在 `db.version(7)` 升级中添加复合索引 `[cardId+categoryId+mode]`

**验证**：
- [ ] 查询 `where({ cardId, categoryId, mode: 'ebbinghaus' })` 能正确返回记录

---

## Task 4: 更新 Memorize.jsx 传入正确的 mode

**操作**：
- [ ] 将 `studyMode || 'sequential'` 改为 `studyMode || 'short'`
- [ ] 更新 `mode` 值的映射：`sequential` → `short`，`active` → `short`，`weak` → `short`

**验证**：
- [ ] 在所有模式下点击「已掌握」/「待掌握」后状态正确更新

---

## Task 5: 更新 testGradingService.js

**操作**：
- [ ] 将 `mode='test'` 改为 `mode='short'`（因为 test 现在映射为 short）

**验证**：
- [ ] 单元检测答错后，short status 变为 review，ebbinghaus 不变

---

## Task 6: 更新 ebbinghaus.js 和 planCalculator.js

**操作**：
- [ ] `filterDueCards` 只查询 `mode='ebbinghaus'` 的记录
- [ ] `getDueCount` 同上
- [ ] `getMemoryStage` 根据传入记录的 mode 字段判断

**验证**：
- [ ] 计划页显示的到期卡片数与背诵页一致

---

## Task 7: 更新 StudyPlan.jsx 统计逻辑

**操作**：
- [ ] `stageDistributions` 只统计 ebbinghaus 记录
- [ ] `totalDue` 只统计 ebbinghaus 记录中 `nextReviewAt <= now` 的数量

**验证**：
- [ ] 计划页显示的统计数据正确

---

## Task 8: 数据迁移脚本

**操作**：
- [ ] 创建迁移函数将现有的 `sequential`/`active`/`weak` 模式的记录转为 `short`

**验证**：
- [ ] 迁移后旧数据仍然可用

---

## 任务依赖关系

```
Task 1 (Bug修复) ─┬─► Task 2 (核心重写) ─► Task 3 (索引)
                  │                        │
                  │                        └─► Task 4 (Memorize)
                  │                        │
                  │                        └─► Task 5 (testGrading)
                  │
                  └─► Task 6 (工具函数)
                          │
                          └─► Task 7 (StudyPlan)
                                  │
                                  └─► Task 8 (迁移)
```

**并行执行**：
- Task 1 可独立执行
- Task 2, 3 需在 Task 1 完成后执行
- Task 4, 5, 6 可在 Task 2 完成后并行执行
- Task 7 需 Task 6 完成后执行
- Task 8 最后执行
