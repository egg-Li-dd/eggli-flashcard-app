# 背诵计划页面（艾宾浩斯长期规划版）- 实施计划（按优先级和依赖排序）

## 依赖关系图
```
Task 1 (db 表)
    │
    ▼
Task 2 (planCalculator.js)
    │
    ├─→ Task 3 (StudyPlan.jsx 骨架)
    │       │
    │       ├─→ Task 4 (PlanTodayView)
    │       ├─→ Task 5 (PlanFutureView)
    │       └─→ Task 6 (PlanAnalysisView)
    │
    └─→ Task 7 (修改 Memorize.jsx + reviewHistory 写入)
             │
             └─→ Task 8 (PlanCardDetail.jsx)
                    │
                    └─→ Task 9 (PlanSettingsModal.jsx)
                           │
                           └─→ Task 10 (同步)
                                  │
                                  └─→ Task 11 (样式打磨)
                                         │
                                         └─→ Task 12 (长期预测优化)
```

---

## [x] Task 1: 数据层 - 新增 reviewHistory 和 studyPlans 表
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 在 `src/services/db.js` 的 Dexie stores 中新增两张表：
    - `reviewHistory: '&id, cardId, categoryId, wasMastered, reviewedAt'`
    - `studyPlans: '&id, categoryId, [categoryId]'`（用 categoryId 做索引便于查询）
  - 新增 CRUD 函数并导出：
    - `addReviewHistory(record)` → Dexie `.add()`
    - `getReviewHistoryByCard(cardId)` → `.where('cardId').equals(cardId).sortBy('reviewedAt')`
    - `getReviewHistoryByCategory(categoryId)` → 按分类筛选
    - `getReviewHistoryRecent(days)` → 最近 N 天全部记录（用于活动统计）
    - `upsertStudyPlan(plan)` → 根据 categoryId 更新或插入
    - `getStudyPlanByCategory(categoryId)` → 不存在时返回默认值（dailyReviewLimit=50, dailyNewLimit=20, priority='medium'）
    - `getAllStudyPlans()` → 全部计划记录
  - 在 `_initFromCloud` 等初始化流程中确保新表被正确处理
  - 写一个简单的测试：插入 → 查询 → 删除，确认不破坏现有表
- **关键注意事项**：
  - 建议在 Dexie 事务中写入 reviewHistory + cardStatus 的更新（确保两者原子性）
  - `id` 字段使用 `crypto.randomUUID()`（或 `Date.now() + Math.random()` 作为兼容方案）
- **Acceptance Criteria Addressed**: FR-8, FR-9, NFR-4
- **Test Requirements**:
  - `programmatic` TR-1.1: 可以对两张新表进行增删改查，操作不影响 categories/cards/cardStatus
  - `programmatic` TR-1.2: `getStudyPlanByCategory('不存在的id')` 返回默认值对象
  - `programmatic` TR-1.3: `upsertStudyPlan` 对同一 categoryId 重复调用时更新而非插入新记录
  - `programmatic` TR-1.4: reviewHistory 记录可以按 cardId 正确筛选并按 reviewedAt 倒序返回

## [x] Task 2: 工具层 - planCalculator.js 统计工具函数
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 在 `src/utils/planCalculator.js` 中提供以下纯函数（便于 `useMemo`）：

  1. `getMemoryStage(record, now)` → 返回 `'due' | 'short' | 'medium' | 'long' | 'unstarted' | 'regressed'`
     - 逻辑对应 spec.md 中"卡片记忆阶段定义"一节
     - 注意：`record.repetitions` 可能为 `undefined`（新用户旧数据），此时视为 `repetitions=0`

  2. `computeCategoryStageDistribution(cards, statuses)` → 返回 `{ due, short, medium, long, unstarted, regressed, total }` 每个阶段的卡片数

  3. `computeStageDistributionByCategory(categories, cardsByCategory, statusesByCard)` → 按分类计算每个阶段的卡片数，返回 `Map<categoryId, stageCountObject>`

  4. `predictFutureDueCards(cards, statuses, daysAhead)` → 返回 `Array<{ date: 'YYYY-MM-DD', count: number, dayIndex: number }>`
     - 对每张卡片的 `nextReviewAt` 与 now + i 天进行比较
     - 累计落在 [now+i天开始, now+i天结束) 区间内的卡片数
     - dayIndex=0 是今天，1 是明天，以此类推

  5. `predictFutureReviewSchedule(cardRecord, numFutureReviews)` → 返回该卡片未来 numFutureReviews 次的预计复习日期（假设全部成功）
     - 基于 applySM-2 规则模拟：每次 reps+1, ease+0.1, interval=公式
     - 用于单卡片时间线的"预计未来复习日期"部分

  6. `getHardestCards(cards, reviewHistory, topN)` → 返回失败次数最多的 topN 张卡片（含失败次数、当前 easeFactor）

  7. `computeDailyActivityStats(reviewHistory, daysBack)` → 返回近 daysBack 天每天 `{ date: string, mastered: number, failed: number }` 的活动数据（用于柱状图）

  8. `estimateMinutes(cardCount, modeKey)` → 根据模式估算耗时
     - ebbinghaus/weak: 每张 6 秒
     - sequential/active: 每张 4 秒
     - 返回格式："约 X 分钟" 或 "不到 1 分钟"（cardCount×秒数 < 60 时）

  9. `formatDateCN(date)` → "2026 年 6 月 16 日，星期二"

  10. `predictMasteryTimeline(cards, statuses, reviewHistory)` → 返回 "90% 达到中期记忆需 X 天" + "90% 达到长期记忆需 Y 天" 的预测
      - 简化实现：基于"当前平均每卡片需要多少次成功复习才能达到目标阶段" + "近期日平均成功复习次数"推算

- **Acceptance Criteria Addressed**: FR-2, FR-3, FR-4, FR-5, FR-10
- **Test Requirements**:
  - `programmatic` TR-2.1: `getMemoryStage` 对各阶段测试用例返回正确值
  - `programmatic` TR-2.2: `predictFutureDueCards` 返回 7 天数据，每日卡片数与手工计算一致
  - `programmatic` TR-2.3: `predictFutureReviewSchedule` 正确模拟 SM-2 的 interval 增长
  - `human-judgment` TR-2.4: 代码注释清晰，函数命名直观
  - `programmatic` TR-2.5: 所有纯函数为确定性（同输入同输出），便于 useMemo 缓存

## [ ] Task 3: 计划页主组件骨架 - StudyPlan.jsx
- **Priority**: P0
- **Depends On**: Task 2
- **Description**:
  - 创建 `src/pages/StudyPlan.jsx`
  - 路由参数：读取 `?entryType=review|all|manual&categoryId=xxx`
  - state：
    - `currentView: 'today' | 'future' | 'analysis'`（默认 'today'）
    - `studyMode: 'sequential' | 'active' | 'ebbinghaus' | 'weak'`（默认 'ebbinghaus'）
    - `futureDaysAhead: 7 | 30`（默认 7，仅未来视图使用）
    - `loading: boolean`
    - `error: string | null`
    - `data: { categories, cards, cardStatuses, reviewHistory, studyPlans }`
  - useEffect 加载数据：并行调用 `db.categories.toArray()`, `db.cards.toArray()`, `db.cardStatus.toArray()`, `db.reviewHistory.toArray()`, `getAllStudyPlans()`
  - UI 结构：
    - 顶部导航栏：标题"背诵计划" + 返回按钮 + 日期文本
    - 视图 Tab（今日/未来/分析）：横向滚动容器
    - 模式 Tab（四模式）：横向滚动容器
    - 当前视图子组件（根据 currentView 渲染 PlanTodayView / PlanFutureView / PlanAnalysisView）
  - 路由注册到 `src/App.jsx`：`<Route path="/memorize/plan" element={<RequireAuth><StudyPlan /></RequireAuth>}>`（放在 `/memorize` 路由前面）
- **Acceptance Criteria Addressed**: FR-1
- **Test Requirements**:
  - `programmatic` TR-3.1: 访问 `/memorize/plan` 成功渲染，控制台无红色错误
  - `programmatic` TR-3.2: 视图 Tab 点击可切换 currentView
  - `programmatic` TR-3.3: 模式 Tab 点击可切换 studyMode
  - `programmatic` TR-3.4: 路由注册正确，底部 Tab 高亮

## [ ] Task 4: 今日计划视图 - PlanTodayView.jsx
- **Priority**: P0
- **Depends On**: Task 3
- **Description**:
  - 顶部三个并列统计卡：今日需复习 / 今日新学建议 / 已完成进度
  - 已完成进度：从 reviewHistory 中统计今日标记为 wasMastered=true 的卡片数，对比"今日到期数 + 新学建议数"计算完成百分比
  - 掌握率条：mastered 卡片数 / total 卡片数
  - 今日到期分类列表：
    - 按 studyPlans.priority 排序（高 → 中 → 低 → 未设置=中）
    - 每个分类卡片：分类名 + 图标 + 到期数 + 前 5 张 front 摘要 + 「进入复习」按钮
    - dueCount=0 时显示 ✓ "已完成今日任务"
  - 今日建议新学：
    - 按分类展示未学习卡片数（无 cardStatus 记录）
    - 每个分类显示"建议学习 X 张"（X = min(unstartedCount × 0.1, dailyNewLimit)）
    - 「开始新学」按钮
  - 顶部「复习全部」按钮（当存在至少 1 张到期卡片时显示）
  - 全部完成后显示：🎉 "今日计划已完成！" + 明日预测 + 「查看明日计划」按钮
- **Acceptance Criteria Addressed**: FR-2, FR-7, FR-13
- **Test Requirements**:
  - `programmatic` TR-4.1: 到期卡片数与数据库查询结果一致
  - `programmatic` TR-4.2: 新学建议 = min(unstarted × 0.1, dailyNewLimit)
  - `programmatic` TR-4.3: 「进入复习」按钮跳转 URL 含 `categoryId=xxx&mode=ebbinghaus&fromPlan=true`
  - `human-judgment` TR-4.4: 空分类/无卡片时显示空状态提示

## [ ] Task 5: 未来 N 天预测视图 - PlanFutureView.jsx
- **Priority**: P1
- **Depends On**: Task 3
- **Description**:
  - 顶部时间范围切换按钮：「未来 7 天」/「未来 30 天」
  - 顶部小卡片：汇总显示期间总到期卡片数 + 总预计耗时
  - 日柱状图（纯 CSS div 实现）：
    - 每个日期一根柱子，宽度等分
    - 高度与卡片数成正比（归一化到 maxHeight）
    - 今日用 `var(--color-primary)`，未来用 `var(--color-accent-light)`
    - 超过 dailyReviewLimit 的日期：边框 `2px solid var(--color-error)`（红色），显示 "⚠ 偏重"
    - 柱子上方显示日期（MM-DD），下方显示卡片数
  - 30 天模式下额外提供按周汇总（周1到周7卡片数之和的第二张图）
  - 点击某一根柱子 → 弹出简易 modal：显示该日具体哪些分类有多少卡片到期
  - 「回到今日」按钮（回到今日视图）
- **关键算法**：调用 `predictFutureDueCards(cards, cardStatuses, futureDaysAhead)`，遍历结果生成柱状图
- **Acceptance Criteria Addressed**: FR-3, FR-6, AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-5.1: 7 天预测每日卡片数正确（手工验证 1-2 天）
  - `programmatic` TR-5.2: 超过 dailyReviewLimit 的日期柱子有红色边框和"⚠偏重"
  - `human-judgment` TR-5.3: 30 天模式下按周汇总显示正确
  - `human-judgment` TR-5.4: 柱子点击后弹出的当日详情数据正确

## [ ] Task 6: 学习分析视图 - PlanAnalysisView.jsx
- **Priority**: P1
- **Depends On**: Task 3
- **Description**:
  - **卡片 1：掌握度阶段分布**
    - 5 行（到期/短期/中期/长期/未学习），每行显示阶段名 + 图标 + 卡片数 + 百分比 + 水平进度条
    - 总卡片数汇总
  - **卡片 2：难度系数分析**
    - `avgEaseFactor`（从 cardStatus 中取所有有 easeFactor 值的记录算平均）
    - "最难卡片" Top 5 列表（通过 `getHardestCards`）
    - 每张卡片显示：front 摘要 + 当前 easeFactor + 失败次数 + 「优先复习」按钮
    - 「优先复习」：跳转到背诵页，并在 query params 中传 `cardIds=xx,yy,zz`，让背诵页只显示这些卡片（需配合 Memorize.jsx 改动）
  - **卡片 3：近期学习活动**
    - 近 7 天每日复习柱状图（从 reviewHistory 中统计）
    - 本周/本月累计成功复习次数 / 失败次数 / 总计
  - **卡片 4：长期掌握预测**
    - 调用 `predictMasteryTimeline`
    - 显示："90% 卡片达到中期记忆约需 X 天" + "90% 卡片达到长期记忆约需 Y 天"
    - 显示当前学习速度（近 7 天平均每天成功复习数）和学习成功率
- **Acceptance Criteria Addressed**: FR-4, FR-10
- **Test Requirements**:
  - `programmatic` TR-6.1: 阶段分布总数与数据库总卡片数一致
  - `programmatic` TR-6.2: 最难卡片按失败次数降序排列
  - `human-judgment` TR-6.3: 活动柱状图与近 7 天实际复习记录一致
  - `programmatic` TR-6.4: 「优先复习」按钮跳转 URL 含卡片 ID

## [ ] Task 7: 修改 Memorize.jsx - fromPlan 模式 + reviewHistory 写入
- **Priority**: P0
- **Depends On**: Task 1, Task 3
- **Description**:
  - **改动 1 - 入口跳转**：
    - `handleContinueReview`（黄色「立即复习」按钮）: 改为 `navigate('/memorize/plan?entryType=review&categoryId=' + currentCategoryId)`
    - `handleExitReview`（蓝色「显示全部」按钮）: 改为 `navigate('/memorize/plan?entryType=all&categoryId=' + currentCategoryId)`
    - 在顶部分类选择条右侧增加「📋」图标按钮，点击 `navigate('/memorize/plan?entryType=manual')`

  - **改动 2 - 读取 fromPlan 参数**：
    - 新的 useEffect：在组件挂载时读取 `?fromPlan=true&categoryId=xxx&mode=xxx&viewType=due|new|specific`
    - 如果 `fromPlan=true`：
      - 自动 `setSelectedCategoryId(categoryId)`（如果是 'all'，进入全分类循环模式）
      - 自动 `setStudyMode(mode)`
      - 设置 `fromPlanMode = true`（新增 state）
      - 设置 `fromPlanViewType = viewType`（影响卡片筛选逻辑）

  - **改动 3 - 顶部提示条**（仅当 fromPlanMode=true 时显示）：
    - "来自背诵计划，正在复习 [分类名]"
    - 分类切换指示（categoryId=all 时）："当前：[分类名] · 第 X 个 / 共 Y 个"
    - 右侧「返回计划页」按钮 + 关闭 ✕

  - **改动 4 - 条件隐藏到期提示条**：
    - fromPlanMode=true 时，不再显示黄色/蓝色提示条（已在计划页看过）

  - **改动 5 - 全分类循环模式**：
    - 当 `selectedCategoryId === 'all'` 时：
      - 维护 `categoryQueue: Category[]` 和 `currentCategoryIndex: number`（从 categories 列表按 priority 排序后构造）
      - 筛选时：当前分类的 filteredCards（到期） 学完后 currentIndex 到最后一张卡片后自动 currentCategoryIndex++
      - currentCategoryIndex >= categoryQueue.length 时显示完成态
      - 顶部提示条显示分类切换信息

  - **改动 6 - reviewHistory 写入**：
    - 每次 handleMark(掌握/待掌握) 时，除原有的 setCardStatus 外，增加：
      ```
      const newRecord = applySM2(oldRecord, wasMastered)
      addReviewHistory({
        cardId: currentCard.id,
        categoryId: selectedCategoryId,
        wasMastered,
        repetitions: newRecord.repetitions,
        easeFactor: newRecord.easeFactor,
        interval: newRecord.interval,
        reviewedAt: Date.now(),
      })
      ```
    - 建议用 Dexie 事务（`db.transaction('rw', db.cardStatus, db.reviewHistory, ...)`）保证写入原子性

  - **改动 7 - viewType=specific 支持**：
    - 支持从分析页的「优先复习」按钮传入 `?cardIds=id1,id2,id3`
    - 在 filteredCards 逻辑中，如果 viewType='specific'，仅显示这些指定卡片
- **Acceptance Criteria Addressed**: FR-1, FR-7, FR-11
- **Test Requirements**:
  - `programmatic` TR-7.1: 点击「立即复习」正确跳转到 `/memorize/plan`
  - `programmatic` TR-7.2: fromPlan 模式下自动选中分类 + 进入 ebbinghaus 模式
  - `programmatic` TR-7.3: fromPlan 模式下不显示黄色/蓝色提示条
  - `programmatic` TR-7.4: 复习操作后 reviewHistory 有新记录
  - `programmatic` TR-7.5: 全分类循环模式下，当前分类学完后正确切换到下一个分类

## [ ] Task 8: 单卡片复习时间线弹窗 - PlanCardDetail.jsx
- **Priority**: P1
- **Depends On**: Task 7（依赖 reviewHistory 数据存在）
- **Description**:
  - 在 PlanTodayView、PlanFutureView、PlanAnalysisView 中点击某张卡片时弹出
  - 内容：
    - 卡片问题（front）+ 答案（back）+ 分类名
    - 当前状态（阶段名称、reps/interval/easeFactor/nextReviewAt 数字）
    - 复习历史：倒序从 reviewHistory 读取该卡片的 K 条记录，格式："✓/✗ YYYY-MM-DD 第 N 次复习 [成功|失败]"
    - 预计未来：调用 `predictFutureReviewSchedule(record, 5)`，显示未来 5 次预计复习日期（标注"假设全部成功"）
    - 「在背诵页打开此卡片」按钮（跳转到背诵页并传入 cardId）
  - 弹窗样式：底部弹出（bottom sheet 风格），高度 ≤ 80vh，可滚动，点击背景关闭，顶部有拖拽条
- **Acceptance Criteria Addressed**: FR-5
- **Test Requirements**:
  - `programmatic` TR-8.1: 弹窗显示的历史记录数量 = 该卡片在 reviewHistory 中的记录数
  - `programmatic` TR-8.2: 预计未来复习日期按 SM-2 规则正确计算
  - `human-judgment` TR-8.3: 弹窗打开/关闭流畅，在移动端体验良好

## [ ] Task 9: 每日学习上限设置弹窗 - PlanSettingsModal.jsx
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - 在 StudyPlan.jsx 右上角显示「⚙️ 设置」按钮，点击打开弹窗
  - 弹窗内容：
    - 每日复习上限（数字输入，默认 50，范围 1-500）
    - 每日新学上限（数字输入，默认 20，范围 1-200）
    - 说明文字："超过上限的天数会在未来预测视图中标红提醒"
    - 「保存」按钮 → 调用 `upsertStudyPlan({ categoryId: 'global', dailyReviewLimit, dailyNewLimit })`
    - 「取消」按钮 → 关闭弹窗
  - 保存后刷新父组件的 studyPlans state（通过回调）
- **Acceptance Criteria Addressed**: FR-6
- **Test Requirements**:
  - `programmatic` TR-9.1: 保存后 studyPlans 表中的 global 记录被更新
  - `programmatic` TR-9.2: 输入值超出范围时有校验和提示
  - `human-judgment` TR-9.3: 弹窗样式与其他弹窗风格一致

## [ ] Task 10: Supabase 云端同步支持
- **Priority**: P2
- **Depends On**: Task 1, Task 7
- **Description**:
  - 在 `src/services/sync.js` 中：
    - `TABLE_SCHEMAS` 增加 `reviewHistory` 和 `studyPlans` 表的字段定义
    - `TABLE_META` 增加两张表的元信息（主键 id）
    - `camelCase ↔ snake_case` 字段映射：
      - reviewHistory: `cardId→card_id, categoryId→category_id, wasMastered→was_mastered, repetitions→repetitions, easeFactor→ease_factor, interval→interval, reviewedAt→reviewed_at`
      - studyPlans: `categoryId→category_id, dailyReviewLimit→daily_review_limit, dailyNewLimit→daily_new_limit, priority→priority, lastStudiedAt→last_studied_at, lastCompletedDate→last_completed_date, createdAt→created_at, updatedAt→updated_at`
    - `pullFromCloud` 中加入从 `review_history` 和 `study_plans` 表拉取数据（`supabase.from(table).select('*')`）
    - `pushToCloud` 中加入两张表的 upsert 逻辑
    - `synchronize` 中加入两张表的 pull-then-push 完整同步
  - 在 Supabase 中手动创建两张表（SQL 语句写在"需执行的 SQL.txt"中）
- **Acceptance Criteria Addressed**: NFR-4
- **Test Requirements**:
  - `programmatic` TR-10.1: 本地 studyPlans 记录成功转换为 snake_case 并上传
  - `programmatic` TR-10.2: 云端 review_history 记录可以被拉取回本地
  - `programmatic` TR-10.3: 同步后不破坏其他已存在表的数据

## [ ] Task 11: 样式与移动端优化
- **Priority**: P1
- **Depends On**: Task 4, Task 5, Task 6
- **Description**:
  - 所有按钮高度 ≥ 40px，圆角 `var(--radius-md)`
  - 所有 Tab 横向可滚动（`overflowX: auto, white-space: nowrap`），小屏不换行
  - 卡片背景 `var(--color-surface)`，外层容器背景 `var(--color-bg)`
  - 文字不溢出：长 front 内容用 `textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '...'`
  - 进度条：高度 8px，背景 `var(--color-border-light)`，填充 `var(--color-primary)` 或 `var(--color-accent)`
  - 加载态：骨架屏（灰色占位）或 loading spinner
  - 375px 宽度视口测试：所有横向区域无横向滚动（Tab 容器除外）
  - 375px 下弹窗宽度 = 100%（不留边距）
- **Acceptance Criteria Addressed**: NFR-2, NFR-3, AC-14
- **Test Requirements**:
  - `human-judgment` TR-11.1: 375px 视口下按钮可点击，无横向滚动（Tab 除外）
  - `human-judgment` TR-11.2: 样式风格与应用其他页面一致
  - `human-judgment` TR-11.3: 加载/空状态样式合理

## [ ] Task 12: 长期预测算法优化（可选）
- **Priority**: P3
- **Depends On**: Task 6
- **Description**:
  - 当前 `predictMasteryTimeline` 使用简化算法。如果用户确认需要更精确的预测，可以：
    - 将未来预测扩展为"每日滚动模拟"：对每一天，根据各卡片的 nextReviewAt 判定这天是否有卡片复习到更高阶段，累计到达成 90% 的天数
    - 考虑失败概率（从 reviewHistory 中估算 `failureRate = failed / total`），模拟时按概率加入失败
    - 增加"乐观/中性/悲观"三种预测的区间显示
  - 本任务在用户确认 FR-10 需要更高精度时才执行
- **Acceptance Criteria Addressed**: FR-10（增强）
- **Test Requirements**:
  - `human-judgment` TR-12.1: 预测结果合理，与用户直觉一致
  - `programmatic` TR-12.2: 模拟算法对 1000 张卡片运行 < 200ms

## [ ] Task 13: 工具层 - SM-2 延迟惩罚算法实现（问题 1）
- **Priority**: P0
- **Depends On**: Task 2（但实际可并行，因为属于同文件的补充）
- **Description**:
  - 在 `src/utils/ebbinghaus.js` 中新增 3 个函数：
    1. `calculateDelayDays(record, now = Date.now())` → 返回 `number`（可能为负值，负值表示提前）
    2. `classifyDelayLevel(delayDays, interval)` → 返回 `'onTime' | 'slight' | 'medium' | 'severe'`
       - `delayDays <= 0` → `'onTime'`
       - `0 < delayDays <= 3` → `'slight'`
       - `3 < delayDays <= interval` → `'medium'`
       - `delayDays > interval` → `'severe'`
    3. `applySM2WithDelay(record, wasMastered, now = Date.now())` → 返回 `{ repetitions, interval, easeFactor, nextReviewAt, delayLevel, delayDays }`
       - 按 spec.md 中"SM-2 延迟复习惩罚机制"表实现四档惩罚逻辑
       - **失败（wasMastered=false）** 走统一失败逻辑（与原 applySM2 相同）
  - **修改原 `applySM2` 为 wrapper**：保持原有签名（`applySM2(record, wasMastered)`），内部调用 `applySM2WithDelay`，向下兼容旧代码
  - 在 `planCalculator.js` 中无需新增（已有的 `predictFutureDueCards` / `predictFutureReviewSchedule` 直接使用新算法）
- **Acceptance Criteria Addressed**: FR-14, FR-2
- **Test Requirements**:
  - `programmatic` TR-13.1: `delayDays = -5` → `delayLevel = 'onTime'`，正常 SM-2
  - `programmatic` TR-13.2: `delayDays = 2, interval = 16` → `delayLevel = 'slight'`，interval 被约束为 `min(SM2计算值, prevInterval + 3)`
  - `programmatic` TR-13.3: `delayDays = 10, interval = 16` → `delayLevel = 'medium'`，reps 退 1，interval 退到 ×0.6
  - `programmatic` TR-13.4: `delayDays = 20, interval = 16` → `delayLevel = 'severe'`，reps=1，interval=1
  - `programmatic` TR-13.5: wasMastered=false 时，无论 delayDays 如何，reps=0，interval=ceil(prev×0.5)
  - `programmatic` TR-13.6: 原 `applySM2` 调用签名不变，旧代码（如 db.js 中 setCardStatus 已有调用）不报错

## [ ] Task 14: 数据层 - 修改 setCardStatus 支持按模式隔离更新（问题 2）
- **Priority**: P0
- **Depends On**: Task 13
- **Description**:
  - **修改 `setCardStatus(cardId, categoryId, status, opts = {})`** ：
    - opts 新增字段 `mode: 'ebbinghaus' | 'sequential' | 'active' | 'weak'`（默认 `'sequential'`）
    - 根据 mode 决定是否更新 reps / interval / easeFactor / nextReviewAt：
      - `'ebbinghaus'`：调用 `applySM2WithDelay(record, status === 'mastered')`，全部字段更新 + 写入 reviewHistory
      - `'sequential' | 'active'`：只更新 `status` + `updatedAt` + `reviewCount`，**不**更新 reps/interval/easeFactor/nextReviewAt + 写入 reviewHistory（含 mode 字段）
      - `'weak'`：status 更新 + `interval = max(1, ceil(原interval × 0.8))`（若 status==='mastered'）+ `easeFactor = easeFactor + 0.05`（若 status==='mastered'）+ **reps 不变** + 写入 reviewHistory
  - **新增 reviewHistory 的 mode 字段**：
    - Dexie stores 中的 reviewHistory 改为：`'&id, cardId, categoryId, wasMastered, reviewedAt, mode'`
    - reviewHistory 记录增加 `mode: string` 字段
  - **修改 Memorize.jsx 的 handleMark**：传入当前 studyMode（`mode: studyMode || 'sequential'`）
- **Acceptance Criteria Addressed**: FR-13, FR-2（艾宾浩斯部分）, NFR-4
- **Test Requirements**:
  - `programmatic` TR-14.1: ebbinghaus 模式下标记'已掌握' → reps+1，interval 被 SM-2 更新，nextReviewAt 被设为未来时间
  - `programmatic` TR-14.2: sequential 模式下标记'已掌握' → status='mastered'，reps/interval/easeFactor/nextReviewAt 保持原值（若无旧值则不写入这些字段）
  - `programmatic` TR-14.3: weak 模式下标记'已掌握' → interval 减小为 ceil(原×0.8)，easeFactor+0.05，reps 不变
  - `programmatic` TR-14.4: weak 模式下标记'待掌握' → 只更新 status='review'，reps/interval 不变
  - `programmatic` TR-14.5: reviewHistory 记录中 mode 字段正确记录
  - `programmatic` TR-14.6: 不传入 mode 时默认为 'sequential'，向后兼容

## [ ] Task 15: 计划页组件 - 双层 Tab 模式视图实现（问题 3：进度追踪 + 薄弱）
- **Priority**: P1
- **Depends On**: Task 3, Task 4, Task 5, Task 6
- **Description**:
  - **修改 StudyPlan.jsx**：
    - mode Tab 从 `[艾宾浩斯]` 扩展为 `[总览 | 艾宾浩斯 | 进度追踪 | 薄弱]`（共 4 个）
    - 默认选中 `'overview'`（让用户先看到全局摘要）
    - 子组件接收 `studyMode` prop 后，按模式显示不同内容

  - **修改 PlanTodayView.jsx**（新增 overview / progress / weak 分支）：
    - `overview`：4 张模式汇总卡片（艾宾浩斯到期数 + 顺序进度% + 活跃新学数 + 薄弱待掌握数），每张卡片点击后切换到对应 mode
    - `progress`：按分类显示顺序模式进度（已看过/总数 + 进度条）+ 活跃模式最近 7 天新学卡片列表；「继续学习」按钮 → `navigate('/memorize?categoryId=xxx&mode=sequential')`
    - `weak`：待掌握卡片数（按分类分组）+ 最近 7 天新增的薄弱卡片列表；「进入薄弱复习」按钮 → `navigate('/memorize?categoryId=xxx&mode=weak')`
    - `ebbinghaus`：保持原有实现

  - **修改 PlanFutureView.jsx**（新增 overview / progress / weak 分支）：
    - `overview`：只显示艾宾浩斯 7 天预测 + "其他模式无预测意义"的提示
    - `progress`：显示"按当前速度 X 天可完成全部卡片"的估算（从 reviewHistory 中算近 7 天平均日处理量，totalCards / dailyAvg）
    - `weak`：显示"薄弱卡片占比趋势"（最近 14 天 status='review' 数 / 总卡片数的变化曲线，用折线显示）
    - `ebbinghaus`：保持原有实现

  - **修改 PlanAnalysisView.jsx**（新增 overview / progress / weak 分支）：
    - `overview`：总掌握率环形图 + 总卡片数 + 近 7 天复习活动柱状图
    - `progress`：各分类进度条汇总 + 最近 20 张已看卡片列表（含时间）
    - `weak`：薄弱卡分析（失败次数排名 Top10 + 失败最高分类 Top3）
    - `ebbinghaus`：保持原有实现
- **Acceptance Criteria Addressed**: FR-11
- **Test Requirements**:
  - `programmatic` TR-15.1: 4 个 mode Tab 可正常切换，每个 Tab 下显示不同内容
  - `programmatic` TR-15.2: overview 模式下点击任一模式卡片可切换到对应 mode
  - `programmatic` TR-15.3: progress 模式下「继续学习」按钮跳转正确（含 categoryId 和 mode=sequential/active）
  - `programmatic` TR-15.4: weak 模式下薄弱卡数与数据库查询 status==='review' 的记录数一致
  - `human-judgment` TR-15.5: 双层 Tab 在 375px 下可横向滚动不换行

## [ ] Task 16: 账号页学习统计增强（问题 4：艾宾浩斯相关统计）
- **Priority**: P1
- **Depends On**: Task 14（依赖 reviewHistory 数据存在）
- **Description**:
  - **修改 `src/pages/Account.jsx`**：
    - 2×3 统计卡片网格中，将"学习中"替换为"到期复习"，将"待开始"替换为"长期记忆"（保持 6 张卡的布局）
    - 新增"连续学习天数"条（在 2×3 网格下方）
    - `loadStats` 函数中新增调用：
      - `db.getDueCardsCount()` → 到期卡片数（点击跳去 `/memorize/plan`）
      - `db.getLongTermCardsCount()` → 长期记忆数（点击跳去 `/stats/longterm`，新页面）
      - `db.getAverageInterval()` → 平均复习间隔（hover tooltip 显示含义）
      - `db.getStreakDays()` → 连续学习天数（显示在底部条中）
    - 保留现有"收藏数"和"总卡片数/今日已学/已掌握"（即共 6 张统计卡不变，只是改动其中两张的内容）

  - **修改 `src/services/db.js`**：新增 4 个统计函数并导出：
    - `getDueCardsCount()` → 返回 `db.cardStatus.where('nextReviewAt').belowOrEqual(now).count()`（同时包含无记录卡片=立即可复习）
    - `getLongTermCardsCount()` → 返回 `db.cardStatus.where('repetitions').aboveOrEqual(5).count()`
    - `getAverageInterval()` → 返回 `number | null`（所有 interval>0 的记录的平均值，保留 1 位小数；无记录时返回 null）
    - `getStreakDays()` → 从 reviewHistory 中提取所有 reviewedAt 的日期（YYYY-MM-DD 去重），从今天开始向前检查连续有记录的天数，直至某日无记录 → 返回连续天数（0 表示今天/昨天都没有学习）

  - **新增 `/stats/longterm` 路由**（`src/pages/StatsLongTerm.jsx`）：
    - 显示 `repetitions >= 5` 的卡片列表（卡片 front + back + 分类名 + 当前 interval）
    - 顶部标题"长期记忆卡片"，显示总数
    - 点击某卡片弹出详情（复用 PlanCardDetail.jsx 的内容）
    - 在 App.jsx 中注册路由：`<Route path="/stats/longterm" element={<RequireAuth><StatsLongTerm /></RequireAuth>}>`
- **Acceptance Criteria Addressed**: FR-12
- **Test Requirements**:
  - `programmatic` TR-16.1: 账号页加载后 2×3 网格显示 6 张统计卡，到期卡片数和长期记忆数与数据库查询一致
  - `programmatic` TR-16.2: 点击"到期复习"卡片跳转到 `/memorize/plan`
  - `programmatic` TR-16.3: 点击"长期记忆"卡片跳转到 `/stats/longterm`
  - `programmatic` TR-16.4: `/stats/longterm` 页面显示的卡片数 = getLongTermCardsCount()
  - `programmatic` TR-16.5: getStreakDays 对"连续3天有记录，今日无"的情况返回 3；对"今日有记录，昨天有"返回 2；对"完全无记录"返回 0
  - `human-judgment` TR-16.6: 连续学习天数条在 X=0 时显示"今日还未学习哦"，X>0 时显示"🔥 已连续学习 X 天"

## [ ] Task 17: 云端同步 - 分层存储策略实现（FR-15 + FR-17）
- **Priority**: P1
- **Depends On**: Task 14
- **Description**:
  - **Part A - 同步层（sync.js）**：
    - **修改 `card_status` 表 schema**（`src/services/sync.js` 的 TABLE_SCHEMAS）：
      - `card_status` 表 fields 新增 `mode TEXT`
      - 字段映射新增：`mode → mode`
      - 默认值处理：云端下行的旧记录（无 mode 字段）视为 `mode='ebbinghaus'`（向后兼容）

    - **修改上传逻辑 `pushToCloud`**：
      - 对 `cardStatus` 列表进行过滤：`statuses.filter(s => s.mode === 'ebbinghaus')`
      - 只上传 mode='ebbinghaus' 的记录到 `card_status` 表
      - mode='sequential'|'active'|'weak' 的记录本地保留，不上传
      - reviewHistory 全量上传（包含 mode 字段）
      - studyPlans 全量上传

    - **修改下载逻辑 `pullFromCloud`**：
      - 从云端 `card_status` 表下载的记录全部视为 `mode='ebbinghaus'`
      - 与本地已有记录合并时：本地的 sequential/active/weak 记录保留，云端的 ebbinghaus 记录以 id 为主键去重覆盖

    - **Supabase SQL 变更**（需写入"需执行的 SQL.txt"）：
      ```sql
      ALTER TABLE card_status ADD COLUMN mode TEXT DEFAULT 'ebbinghaus';
      UPDATE card_status SET mode = 'ebbinghaus' WHERE mode IS NULL;
      ```

    - **同步状态追踪**：
      - `sync.js` 中记录最后同步时间（`lastSyncAt`）
      - 提供 `getSyncStatus()` 函数返回 `{ lastSyncAt, pendingUploads, syncInProgress }`

  - **Part B - 云端数据处理界面（CloudData.jsx）**：
    - 在 `DATA_ITEMS` 数组中新增两项：
      ```javascript
      { key: 'review_history', table: 'review_history', name: '复习历史', desc: '每次复习的操作来源、结果、时间等记录' },
      { key: 'study_plans', table: 'study_plans', name: '学习计划', desc: '每日复习上限、每日新学上限等配置' },
      ```
    - 更新 `card_status` 的描述：`'已掌握/学习中及艾宾浩斯计划状态（含 mode 字段）'`
    - DATA_ITEMS 是纯配置，上传/下载函数本身不需要修改（依赖 Part A 中 sync.js 的实现）
- **Acceptance Criteria Addressed**: FR-15, FR-17, NFR-4
- **Test Requirements**:
  - `programmatic` TR-17.1: pushToCloud 只上传 mode='ebbinghaus' 的 cardStatus 记录
  - `programmatic` TR-17.2: 云端下载的记录 mode 默认为 'ebbinghaus'
  - `programmatic` TR-17.3: 本地的 sequential/active/weak 记录在同步后不被覆盖（以 id 为主键保留本地优先）
  - `programmatic` TR-17.4: getSyncStatus() 返回最后同步时间和同步中状态
  - `programmatic` TR-17.5: SQL ALTER TABLE 执行成功（Supabase SQL editor 中测试）
  - `programmatic` TR-17.6: CloudData.jsx 的 DATA_ITEMS 包含 review_history 和 study_plans 两个新项
  - `programmatic` TR-17.7: CloudData 页面上新增的两个数据项可正常显示本地/云端条数和同步状态
  - `programmatic` TR-17.8: CloudData 页面上 review_history 和 study_plans 的上传/下载按钮可正常触发（调用已有的 handleItemUpload/handleItemDownload）
  - `human-judgment` TR-17.9: 换设备登录后，艾宾浩斯计划数据（到期卡片数、reps/interval/easeFactor）正确显示

## [ ] Task 18: 计划页云端状态感知 UI（FR-16）
- **Priority**: P1
- **Depends On**: Task 17
- **Description**:
  - **修改 `StudyPlan.jsx`**：
    - 新增 `syncStatus` state（调用 `getSyncStatus()`）
    - 顶部导航栏右侧显示同步状态指示器：
      - 🔄 已同步 + 最后时间（正常状态）
      - 🔄 同步中（动画，syncInProgress=true 时）
      - ⚠️ 仅本地（存在仅本地模式记录时）
      - 点击可触发手动同步（调用 `synchronize()`）
    - 新增 `hasLocalOnlyData` 检测函数（检查是否存在 mode='sequential'|'active'|'weak' 的记录）

  - **修改 `PlanTodayView.jsx`**：
    - 分类卡片右上角显示模式标签：[🔵 艾宾浩斯] 或 [⚪ 本地模式]
    - 顶部（总览模式的模式汇总卡片）每张卡片显示 [🔵 已同步] 或 [⚪ 仅本地]
    - 当 `hasLocalOnlyData=true` 时，在视图顶部显示"⚠️ 部分标记仅本设备记录"警告条

  - **修改 `PlanCardDetail.jsx`**：
    - 复习历史列表中，每条记录显示模式标签（🔵 艾宾浩斯 / ⚪ 顺序浏览 / ⚪ 活跃学习 / ⚪ 薄弱）

  - **修改 `PlanFutureView.jsx`**：
    - 视图顶部显示 🔵 标识和"已云端同步"说明
    - 添加 ⚠️ 提示："顺序/活跃/薄弱模式无长期预测功能，这些模式的数据不会同步到云端"

  - **修改 `Account.jsx` 统计卡**：
    - 每个统计卡下方显示 [🔵 已同步] 标注
    - 连续学习天数条显示"基于云端复习记录"说明
- **Acceptance Criteria Addressed**: FR-16
- **Test Requirements**:
  - `programmatic` TR-18.1: 顶部同步状态指示器在正常同步后显示"🔄 已同步 2026-06-16"
  - `programmatic` TR-18.2: 存在 sequential/active/weak 记录时，顶部显示"⚠️ 仅本地"警告
  - `programmatic` TR-18.3: 总览模式模式汇总卡片：艾宾浩斯卡片显示 [🔵 已同步]，其他显示 [⚪ 仅本地]
  - `programmatic` TR-18.4: 单卡片详情弹窗的复习历史中，模式标注与 reviewHistory.mode 字段一致
  - `human-judgment` TR-18.5: 同步状态指示器在 375px 下不溢出、可见
  - `human-judgment` TR-18.6: 警告条样式友好，在移动端不遮挡主要内容

## [ ] Task 19: 测试评分服务 - 新增 mode='test' 处理（FR-18）
- **Priority**: P1
- **Depends On**: Task 14（依赖 setCardStatus 的 mode 参数支持）
- **Description**:
  - **Part A - testGradingService.js**：
    - 在 `updateMasteryAndWrongAnswers` 中，所有 `setCardStatus` 调用新增 `{ mode: 'test' }` 参数
    - 即：答对时 `setCardStatus(cardId, categoryId, 'mastered', { mode: 'test' })`
    - 答错时 `setCardStatus(cardId, categoryId, 'review', { mode: 'test' })`
    - 全局正确率判断（accuracy >= 90）中的 setCardStatus 同样传入 `{ mode: 'test' }`

  - **Part B - db.js setCardStatus**：
    - 新增 `mode='test'` 分支，与 `sequential`/`active` 模式行为一致
    - mode='test' 时：只更新 `status` + `updatedAt` + `reviewCount`，**不修改** reps/interval/easeFactor/nextReviewAt
    - 同时将测试结果写入 reviewHistory（mode='test'）

  - **Part C - 计划页 UI 调整**：
    - 单卡片详情弹窗的复习历史中，mode='test' 的记录显示为 "[🔵 测试评分]"
    - 如果某卡片在 reviewHistory 中 mode='test' 且 isCorrect=false 的次数 >= 2，在卡片描述旁显示 "⚠️ 测试答错 N 次，建议提前复习"

  - **Part D - 长期掌握预测参考信号**（可选，P3）：
    - 在 `predictMasteryTimeline` 函数中增加对测试失败信号的统计
    - 如果某卡片有多次测试失败，向用户显示警告信息
- **Acceptance Criteria Addressed**: FR-18
- **Test Requirements**:
  - `programmatic` TR-19.1: testGradingService.js 中所有 setCardStatus 调用都传入 `{ mode: 'test' }`
  - `programmatic` TR-19.2: setCardStatus 中 mode='test' 分支不修改 reps/interval/easeFactor/nextReviewAt
  - `programmatic` TR-19.3: mode='test' 时仍然写入 reviewHistory（含 mode='test' 字段）
  - `programmatic` TR-19.4: 测试答错后，卡片 status='review'，艾宾浩斯参数保持原值
  - `programmatic` TR-19.5: 全局正确率判断中的 setCardStatus 同样传入 mode='test'
  - `human-judgment` TR-19.6: 单卡片详情弹窗中，测试评分记录显示 "[🔵 测试评分]" 标签
  - `human-judgment` TR-19.7: 测试中答错一张长期记忆卡片后，用户能在薄弱模式中看到这张卡片，可主动复习以调整艾宾浩斯参数
