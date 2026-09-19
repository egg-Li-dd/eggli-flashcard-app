# 背诵计划页面（艾宾浩斯长期规划版）- 测试验收清单

## 数据层（reviewHistory / studyPlans 表）
- [ ] 1.1 `reviewHistory` 表成功创建，可以对其进行 add/get/delete 操作
- [ ] 1.2 `studyPlans` 表成功创建，可以对其进行 upsert/getAll 操作
- [ ] 1.3 `getStudyPlanByCategory('不存在的id')` 返回默认值对象（dailyReviewLimit=50, dailyNewLimit=20, priority='medium'）
- [ ] 1.4 `upsertStudyPlan` 对同一 categoryId 重复调用时更新原记录（不产生重复）
- [ ] 1.5 `getReviewHistoryByCard(cardId)` 返回正确数量的记录，按 reviewedAt 倒序
- [ ] 1.6 新表操作不影响任何现有表（categories/units/cards/cardStatus/bookmarks/wrongAnswers）的数据完整性

## 工具函数（planCalculator.js）
- [ ] 2.1 `getMemoryStage(record, now)` 正确判定：到期/短期记忆/中期记忆/长期记忆/未学习/失败回退 六个阶段
- [ ] 2.2 `computeCategoryStageDistribution` 返回的各阶段计数之和 = 输入卡片总数
- [ ] 2.3 `predictFutureDueCards(cards, statuses, 7)` → 返回 7 个日期的卡片数，且每日卡片数与手工计算（根据 nextReviewAt 日期比较）一致
- [ ] 2.4 `predictFutureReviewSchedule(record, 5)` → 返回 5 个日期，间隔按 SM-2 规则递增（reps+1, ease+0.1, interval=公式）
- [ ] 2.5 `getHardestCards(cards, reviewHistory, 5)` → 按失败次数降序排列 Top 5
- [ ] 2.6 `computeDailyActivityStats(reviewHistory, 7)` → 返回近 7 天每日的成功/失败数统计
- [ ] 2.7 `estimateMinutes(cardCount, 'ebbinghaus')` 估算正确（每张 6 秒）
- [ ] 2.8 `estimateMinutes(cardCount, 'sequential')` 估算正确（每张 4 秒）
- [ ] 2.9 `formatDateCN(date)` 格式正确（如 "2026 年 6 月 16 日，星期二"）
- [ ] 2.10 所有纯函数为确定性（同一输入始终返回同一输出），可被 useMemo 有效缓存

## 计划页骨架（StudyPlan.jsx + 路由注册）
- [ ] 3.1 访问 `/memorize/plan` 页面成功渲染，控制台无红色错误
- [ ] 3.2 页面顶部显示"背诵计划"标题 + 日期 + 返回按钮
- [ ] 3.3 顶部「今日/未来/分析」视图 Tab 点击可切换 currentView，当前视图高亮显示
- [ ] 3.4 下方「顺序/活跃/艾宾浩斯/薄弱卡片」模式 Tab 点击可切换 studyMode，当前模式高亮显示
- [ ] 3.5 页面加载时显示 loading 状态（骨架屏或 spinner）
- [ ] 3.6 数据加载完成后显示正确的内容视图
- [ ] 3.7 `src/App.jsx` 路由注册正确：`/memorize/plan` 路由在 `/memorize` 之前，不影响其他路由
- [ ] 3.8 底部 Tab 高亮为 "Memorize"

## 今日计划视图（PlanTodayView.jsx）
- [ ] 4.1 顶部三个并列统计卡：
  - [ ] 今日需复习：数字 = filterDueCards(allCards, cardStatuses) 的数量
  - [ ] 今日新学建议：数字 = min(unstartedCount × 0.1, dailyNewLimit)
  - [ ] 已完成进度：百分比 = 今日已 mastered / (到期 + 新学建议) × 100
- [ ] 4.2 掌握率条：mastered / total，显示正确百分比
- [ ] 4.3 今日到期分类列表：
  - [ ] 按分类优先级排序（高 → 中 → 低 / 未设置=中）
  - [ ] 每个分类显示：分类名 + 图标 + 到期数 + 前 5 张 front 摘要
  - [ ] 每个分类的到期数 = 该分类下 filterDueCards 返回的卡片数
  - [ ] 「进入复习」按钮 → 跳转到 `/memorize?categoryId=xxx&mode=ebbinghaus&fromPlan=true`
  - [ ] dueCount=0 的分类显示 ✓ "已完成今日任务"
- [ ] 4.4 今日建议新学部分：
  - [ ] 每个分类显示未学习卡片数和建议学习数
  - [ ] 「开始新学」按钮 → 跳转到背诵页（viewType=new 或全卡）
- [ ] 4.5 顶部「复习全部」按钮在有到期卡片时显示，无到期卡片时隐藏
- [ ] 4.6 全部完成后显示：🎉 "今日计划已完成！" + 明日预测 + 「查看明日计划」按钮
- [ ] 4.7 空状态（无分类 / 无卡片）显示友好提示

## 未来预测视图（PlanFutureView.jsx）
- [ ] 5.1 顶部「未来 7 天 / 未来 30 天」时间范围切换按钮，点击可切换 daysAhead 值
- [ ] 5.2 顶部小卡片显示期间总到期卡片数 + 总预计耗时
- [ ] 5.3 日柱状图：
  - [ ] 每根柱子的高度与该日到期卡片数成正比（归一化到 maxHeight）
  - [ ] 今日柱子用主色（`var(--color-primary)`）填充
  - [ ] 未来日期柱子用强调色（`var(--color-accent-light)`）填充
  - [ ] 超过 dailyReviewLimit 的柱子有红色边框和"⚠ 偏重"标签
  - [ ] 柱子上方显示日期（MM-DD），下方显示卡片数
  - [ ] 每日卡片数与手工计算（nextReviewAt 日期比较）一致
- [ ] 5.4 30 天模式下额外显示按周汇总（周1-周7卡片数之和）
- [ ] 5.5 点击某根柱子 → 弹出简易 modal 显示该日具体各分类有多少卡片到期
- [ ] 5.6 「回到今日」按钮 → 切换回今日计划视图
- [ ] 5.7 数据量较大时滚动流畅（1000 张卡片）

## 学习分析视图（PlanAnalysisView.jsx）
- [ ] 6.1 掌握度阶段分布：
  - [ ] 5 个阶段（到期/短期/中期/长期/未学习）显示正确
  - [ ] 每个阶段的卡片数与按条件筛选结果一致
  - [ ] 百分比 = 该阶段卡片数 / 总卡片数 × 100%
  - [ ] 水平进度条按百分比显示
  - [ ] 各阶段卡片数之和 = 总卡片数
- [ ] 6.2 难度系数分析：
  - [ ] avgEaseFactor 计算正确（从 cardStatus 中所有有 easeFactor 值的记录求平均）
  - [ ] "最难卡片" Top 5 按失败次数降序排列
  - [ ] 每张卡片显示 front 摘要 + 当前 easeFactor + 失败次数
  - [ ] 「优先复习」按钮跳转到背诵页并传 cardIds
- [ ] 6.3 近期学习活动：
  - [ ] 近 7 天每日柱状图（从 reviewHistory 统计）
  - [ ] 本周累计：成功次数 / 失败次数 / 总计
  - [ ] 本月累计：成功次数 / 失败次数 / 总计
- [ ] 6.4 长期掌握预测：
  - [ ] 显示"90% 卡片达到中期记忆约需 X 天"
  - [ ] 显示"90% 卡片达到长期记忆约需 Y 天"
  - [ ] 显示当前学习速度（近 7 天平均每天成功复习数）
  - [ ] 显示当前学习成功率（成功 / 总）

## 背诵页 fromPlan 模式（Memorize.jsx）
- [ ] 7.1 原入口按钮改动：
  - [ ] 点击「立即复习」按钮 → 跳转到 `/memorize/plan?entryType=review`
  - [ ] 点击「显示全部」按钮 → 跳转到 `/memorize/plan?entryType=all`
  - [ ] 顶部分类选择条右侧有「📋」图标按钮 → 跳转到 `/memorize/plan?entryType=manual`
- [ ] 7.2 fromPlan 参数处理：
  - [ ] 访问 `/memorize?fromPlan=true&categoryId=xxx&mode=ebbinghaus` → 自动选中分类 xxx
  - [ ] 自动进入 ebbinghaus 模式，无需用户手动选择
  - [ ] 页面顶部显示"来自背诵计划，正在复习 [分类名]"提示条
  - [ ] 提示条可关闭（× 按钮）
  - [ ] 提示条有「返回计划页」按钮 → 跳回 `/memorize/plan`
- [ ] 7.3 提示条隐藏逻辑：
  - [ ] fromPlan=true 时不显示黄色/蓝色到期卡片提示条
  - [ ] fromPlan=false 或关闭后，恢复原有提示条显示（如果有到期卡片）
- [ ] 7.4 全分类循环模式：
  - [ ] 访问 `/memorize?fromPlan=true&categoryId=all&mode=ebbinghaus` → 进入全分类循环
  - [ ] 顶部显示分类切换指示："当前：[分类名] · 第 X 个 / 共 Y 个"
  - [ ] 当前分类卡片学完后自动切换到下一分类
  - [ ] 所有分类学完后显示完成态
- [ ] 7.5 reviewHistory 写入：
  - [ ] 点击「已掌握」 → cardStatus 更新 + reviewHistory 新增一条（wasMastered=true）
  - [ ] 点击「待掌握」 → cardStatus 更新 + reviewHistory 新增一条（wasMastered=false）
  - [ ] reviewHistory 记录含 cardId、categoryId、repetitions、easeFactor、interval、reviewedAt
  - [ ] 数据写入使用 Dexie 事务保证原子性（或至少两条写入都成功才确认）
- [ ] 7.6 viewType=specific 支持：
  - [ ] 从计划页「优先复习」按钮传入 cardIds
  - [ ] 背诵页在 viewType=specific 时只显示这些卡片
- [ ] 7.7 上述改动不破坏背诵页原有功能（卡片翻转、编辑、移动、删除等）

## 单卡片复习时间线弹窗（PlanCardDetail.jsx）
- [ ] 8.1 点击计划页中的卡片 → 弹出详细信息弹窗
- [ ] 8.2 弹窗显示：卡片问题（front）+ 答案（back）+ 分类名
- [ ] 8.3 当前状态显示正确：阶段名 + reps/interval/easeFactor/nextReviewAt 数字
- [ ] 8.4 复习历史显示正确：
  - 倒序从 reviewHistory 读取该卡片所有记录
  - 每条格式："✓/✗ YYYY-MM-DD 第 N 次复习 [成功|失败]"
  - 记录数 = 该卡片在 reviewHistory 中的记录数
- [ ] 8.5 预计未来复习日期：
  - 调用 predictFutureReviewSchedule(record, 5)
  - 显示 5 个未来复习日期
  - 日期按 SM-2 规则递增（reps+1, ease+0.1, interval=公式）
  - 标注"假设全部成功"的说明
- [ ] 8.6 「在背诵页打开此卡片」按钮 → 跳转到背诵页并传入 cardId（或跳转到背诵页后自动滚动到该卡片位置，由实现决定）
- [ ] 8.7 弹窗样式：底部弹出（bottom sheet 风格），高度 ≤ 80vh，可滚动，点击背景关闭，顶部有拖拽条

## 每日学习上限设置弹窗（PlanSettingsModal.jsx）
- [ ] 9.1 计划页右上角有「⚙️ 设置」按钮
- [ ] 9.2 点击打开设置弹窗，显示：
  - [ ] 每日复习上限（数字输入框，默认 50，范围 1-500）
  - [ ] 每日新学上限（数字输入框，默认 20，范围 1-200）
  - [ ] 说明文字："超过上限的天数会在未来预测视图中标红提醒"
- [ ] 9.3 点击「保存」：
  - [ ] 调用 upsertStudyPlan({ categoryId: 'global', dailyReviewLimit, dailyNewLimit })
  - [ ] studyPlans 表中的 global 记录被更新
  - [ ] 刷新父组件的 studyPlans state
  - [ ] 关闭弹窗，Toast 提示保存成功
- [ ] 9.4 点击「取消」：不保存，直接关闭弹窗
- [ ] 9.5 输入值超出范围时有校验和提示
- [ ] 9.6 保存后，未来预测视图中超上限日期的柱子有红色边框和"⚠ 偏重"标签

## 云端同步（sync.js 扩展）
- [ ] 10.1 TABLE_SCHEMAS 包含 reviewHistory 和 studyPlans 表的字段定义
- [ ] 10.2 TABLE_META 包含两张表的元信息（主键 id）
- [ ] 10.3 camelCase ↔ snake_case 字段映射正确：
  - [ ] reviewHistory: cardId→card_id, categoryId→category_id, wasMastered→was_mastered, repetitions→repetitions, easeFactor→ease_factor, interval→interval, reviewedAt→reviewed_at
  - [ ] studyPlans: categoryId→category_id, dailyReviewLimit→daily_review_limit, dailyNewLimit→daily_new_limit, priority→priority, lastStudiedAt→last_studied_at, lastCompletedDate→last_completed_date, createdAt→created_at, updatedAt→updated_at
- [ ] 10.4 pullFromCloud 可以从云端 review_history 和 study_plans 表拉取数据并转为 camelCase
- [ ] 10.5 pushToCloud 可以将本地记录转换为 snake_case 并上传
- [ ] 10.6 synchronize 中加入两张表的完整同步流程
- [ ] 10.7 同步不影响其他表的已有数据
- [ ] 10.8 Supabase 端两张表创建成功，有必要的行级安全策略（RLS）

## 样式与移动端适配
- [ ] 11.1 所有按钮高度 ≥ 40px，圆角 `var(--radius-md)`
- [ ] 11.2 视图 Tab / 模式 Tab 横向可滚动（overflowX: auto），不换行
- [ ] 11.3 卡片背景 `var(--color-surface)`，外层容器背景 `var(--color-bg)`
- [ ] 11.4 主色 `var(--color-primary)`，强调色 `var(--color-accent)`，与其他页面风格一致
- [ ] 11.5 长文本（如卡片 front 内容）用省略号截断，不溢出容器
- [ ] 11.6 进度条高度 8px，背景 `var(--color-border-light)`，填充主色/强调色
- [ ] 11.7 加载状态有骨架屏或 spinner 显示
- [ ] 11.8 375px 视口测试：
  - [ ] 所有按钮可见、可点击
  - [ ] 文字不溢出
  - [ ] 除 Tab 容器外不出现非预期横向滚动
  - [ ] 弹窗宽度 = 100%
- [ ] 11.9 768px 视口测试：布局合理，按钮和卡片大小适中

## 性能验证
- [ ] 12.1 页面首屏加载时间 < 500ms（1000 张卡片以内）
- [ ] 12.2 视图 Tab 切换响应 < 150ms（不重新读取数据库，只重算）
- [ ] 12.3 模式 Tab 切换响应 < 150ms
- [ ] 12.4 未来 7 天预测算法运行 < 100ms（1000 张卡片）
- [ ] 12.5 未来 30 天预测算法运行 < 200ms
- [ ] 12.6 所有统计计算通过 useMemo 缓存，重复进入同一视图不重新计算

## 边界场景与错误处理
- [ ] 13.1 数据库中无任何分类 → 显示空状态提示 "暂无分类，请先在记录页创建"
- [ ] 13.2 有分类但无卡片 → 显示"暂无卡片，请先添加卡片"
- [ ] 13.3 有卡片但无 cardStatus 记录 → 全部视为"未学习"，nextReviewAt=now
- [ ] 13.4 所有卡片已复习 → 今日视图显示"🎉 今日计划已完成"
- [ ] 13.5 cardStatus 中 easeFactor 为 undefined → 视为默认 2.5 计算
- [ ] 13.6 cardStatus 中 repetitions 为 undefined → 视为 0 计算
- [ ] 13.7 调整面板输入 0 → 有最小值校验（不允许 0）
- [ ] 13.8 调整面板输入 9999 → 有最大值校验（≤ 500/200）
- [ ] 13.9 从计划页跳转到背诵页，如果分类不存在 → 友好处理（提示分类已删除）
- [ ] 13.10 从背诵页返回计划页，回到正确视图（不重置）

## 数据流完整性验证
- [ ] 14.1 计划页显示的到期卡片数 = 背诵页进入 ebbinghaus 模式后显示的卡片数
- [ ] 14.2 用户在背诵页标记 mastered，返回计划页后：
  - 该卡片的 nextReviewAt 已更新到未来（不再到期）
  - 今日完成进度增加
  - 该卡片在阶段分布中从"到期"迁移到"短期/中期/长期记忆"
- [ ] 14.3 用户在背诵页标记待掌握（wasMastered=false），返回计划页后：
  - 该卡片仍在到期列表中（SM-2 规则：失败后立即可复习）
  - reviewHistory 中新增一条失败记录
- [ ] 14.4 重复学习同一张卡片：每次操作都写入 reviewHistory 一条新记录
- [ ] 14.5 所有复习历史记录可按卡片/分类/日期维度查询

## 总体验收
- [ ] 15.1 用户可以从背诵页 → 计划页 → 背诵页完成一个完整流程
- [ ] 15.2 计划页的统计数据与实际学习状态实时同步
- [ ] 15.3 所有功能在移动端（375px 宽度）可正常使用
- [ ] 15.4 样式风格与应用其他页面一致
- [ ] 15.5 不破坏背诵页/首页/设置页等其他页面功能

## 16. SM-2 延迟惩罚算法（问题 1：未按时复习的处置）
- [ ] 16.1 `calculateDelayDays(record, now)` 正确计算：`nextReviewAt` 在 now 之前 → 正值（延迟），在 now 之后 → 负值（提前）
- [ ] 16.2 `classifyDelayLevel(delayDays, interval)` 四档判定正确：
  - [ ] `delayDays <= 0` → `'onTime'`
  - [ ] `0 < delayDays <= 3` → `'slight'`
  - [ ] `3 < delayDays <= interval` → `'medium'`
  - [ ] `delayDays > interval` → `'severe'`
- [ ] 16.3 `applySM2WithDelay` 按时（onTime）复习且成功：
  - [ ] reps+1, interval 按原 SM-2 公式, easeFactor+0.1, nextReviewAt 设为未来
- [ ] 16.4 轻微延迟（slight）且成功：
  - [ ] reps+1, `interval = min(原SM-2计算值, prevInterval + 3)`, easeFactor 保持, nextReviewAt 更新
- [ ] 16.5 中等延迟（medium）且成功：
  - [ ] reps 退到 `max(1, prevReps - 1)`, interval 退到 `max(1, ceil(prevInterval × 0.6))`, easeFactor = prevEase - 0.1（最低 1.3）
- [ ] 16.6 严重延迟（severe）且成功：
  - [ ] reps=1, interval=1, `easeFactor = max(1.3, prevEase - 0.15)`, nextReviewAt = now + 1天
- [ ] 16.7 无论延迟程度，**失败**（wasMastered=false）时统一：
  - [ ] reps=0, `interval = max(1, ceil(prevInterval × 0.5))`, `easeFactor = max(1.3, prevEase - 0.2)`, `nextReviewAt = now`
- [ ] 16.8 原 `applySM2(record, wasMastered)` 签名不变，内部调用 applySM2WithDelay，旧代码调用（db.js setCardStatus）不报错
- [ ] 16.9 返回值包含 `delayLevel` 和 `delayDays` 字段（供计划页分析视图使用）

## 17. 按模式隔离的状态更新策略（问题 2：模式间状态管理）
- [ ] 17.1 `setCardStatus(cardId, categoryId, status, opts)` 支持 opts.mode 字段，默认为 `'sequential'`（向后兼容）
- [ ] 17.2 **艾宾浩斯模式**（mode='ebbinghaus'）下标记 'mastered'：
  - [ ] 调用 `applySM2WithDelay`，reps/interval/easeFactor/nextReviewAt 全部更新
  - [ ] reviewHistory 新增一条记录（`mode='ebbinghaus'`, `wasMastered=true`）
- [ ] 17.3 艾宾浩斯模式下标记 'review'：
  - [ ] applySM2WithDelay 处理失败逻辑（reps=0, interval减半, nextReviewAt=now）
  - [ ] reviewHistory 新增一条记录（`mode='ebbinghaus'`, `wasMastered=false`）
- [ ] 17.4 **顺序/活跃模式**（mode='sequential'|'active'）下标记 'mastered'：
  - [ ] 只更新 `status='mastered'` + `updatedAt=now` + `reviewCount++`
  - [ ] **不**更新 reps/interval/easeFactor/nextReviewAt（保持原值或不写入）
  - [ ] reviewHistory 新增一条记录（mode 对应 sequential/active, wasMastered=true）
- [ ] 17.5 顺序/活跃模式下标记 'review'：
  - [ ] 只更新 `status='review'` + `updatedAt=now` + `reviewCount++`
  - [ ] 不更新 SM-2 字段
  - [ ] reviewHistory 新增一条记录（mode 对应, wasMastered=false）
- [ ] 17.6 **薄弱模式**（mode='weak'）下标记 'mastered'：
  - [ ] status='mastered', `interval = max(1, ceil(prevInterval × 0.8))`（缩短间隔以强化复习）, `easeFactor = prevEase + 0.05`
  - [ ] **reps 保持不变**（薄弱模式不计入"成功复习次数"）
  - [ ] nextReviewAt = now + newInterval 天
  - [ ] reviewHistory 新增一条记录（mode='weak', wasMastered=true）
- [ ] 17.7 薄弱模式下标记 'review'：
  - [ ] 只更新 status='review' + updatedAt=now + reviewCount++
  - [ ] 不更新 reps/interval/easeFactor/nextReviewAt
  - [ ] reviewHistory 新增一条记录（mode='weak', wasMastered=false）
- [ ] 17.8 reviewHistory 表 schema 增加 mode 字段，Dexie stores 声明中含 `mode`
- [ ] 17.9 Memorize.jsx handleMark 正确传递当前 studyMode 到 setCardStatus 的 opts.mode
- [ ] 17.10 全流程验证：在顺序模式下标记一张卡为 mastered → 进入艾宾浩斯模式查看该卡 → reps/interval 仍为进入顺序模式前的值（不被顺序模式操作影响）

## 18. 计划页双层 Tab 结构（问题 3：顺序/活跃/薄弱模式的计划展示）
- [ ] 18.1 主视图 Tab：「今日计划 | 未来预测 | 学习分析」，默认选中「今日计划」
- [ ] 18.2 背诵模式 Tab：「总览 | 艾宾浩斯 | 进度追踪 | 薄弱」，默认选中「总览」
- [ ] 18.3 **总览模式**的三个视图：
  - [ ] 今日计划：4 张模式汇总卡片（艾宾浩斯到期数 + 顺序进度% + 活跃新学数 + 薄弱待掌握数），点击可切换到对应 mode
  - [ ] 未来预测：只显示艾宾浩斯 7 天预测 + 说明"其他模式无预测意义"
  - [ ] 学习分析：总掌握率环形图 + 总卡片数 + 近 7 天复习活动柱状图
- [ ] 18.4 **艾宾浩斯模式**的三个视图：保持原实现（到期列表 + 未来预测 + 阶段分布）
- [ ] 18.5 **进度追踪模式**的三个视图：
  - [ ] 今日计划：按分类显示顺序模式进度（已看过/总数 + 进度条）+ 活跃模式最近 7 天新学卡片列表；「继续学习」按钮 → `navigate('/memorize?categoryId=xxx&mode=sequential')`
  - [ ] 未来预测：显示"按当前速度 X 天可完成全部卡片"的估算
  - [ ] 学习分析：各分类进度条汇总 + 最近 20 张已看卡片列表（含时间）
- [ ] 18.6 **薄弱模式**的三个视图：
  - [ ] 今日计划：待掌握卡片数（按分类分组）+ 最近 7 天新增的薄弱卡片列表；「进入薄弱复习」按钮 → `navigate('/memorize?categoryId=xxx&mode=weak')`
  - [ ] 未来预测：显示"薄弱卡片占比趋势"（最近 14 天薄弱卡数/总卡数变化曲线）
  - [ ] 学习分析：薄弱卡分析（失败次数排名 Top10 + 失败最高分类 Top3）
- [ ] 18.7 每个子组件接收 studyMode prop 并按上述规则渲染不同分支
- [ ] 18.8 双层 Tab 在 375px 下可横向滚动不换行
- [ ] 18.9 切换 mode 时，相同主视图下数据切换流畅（< 200ms），不需要重新读数据库

## 19. 账号页学习统计增强（问题 4：艾宾浩斯相关统计）
- [ ] 19.1 账号页 2×3 统计卡网格显示：总卡片数、今日已学、已掌握、到期复习、长期记忆、收藏数（共 6 张）
- [ ] 19.2 **到期复习**卡片：
  - [ ] 数字 = `getDueCardsCount()` 的返回值（nextReviewAt <= now 的记录数 + 无记录卡片数）
  - [ ] 点击 → 跳转到 `/memorize/plan`
- [ ] 19.3 **长期记忆**卡片：
  - [ ] 数字 = `getLongTermCardsCount()` 的返回值（repetitions >= 5 的记录数）
  - [ ] 点击 → 跳转到 `/stats/longterm`
- [ ] 19.4 底部显示**连续学习天数**条：X=0 时显示"今日还未学习哦"，X>0 时显示"🔥 已连续学习 X 天"
- [ ] 19.5 `getAverageInterval()`：返回所有 interval>0 的记录的平均值（保留 1 位小数）或 null
- [ ] 19.6 `getStreakDays()`：从 reviewHistory 提取所有日期去重 → 从今天向前检查连续有记录的天数 → 返回连续天数
- [ ] 19.7 `/stats/longterm` 页面（StatsLongTerm.jsx）：
  - [ ] 路由在 App.jsx 注册成功
  - [ ] 显示 reps>=5 的卡片列表（卡片 front + back + 分类名 + 当前 interval）
  - [ ] 顶部显示"长期记忆卡片"标题和总数
  - [ ] 点击某卡片弹出详情（复用 PlanCardDetail.jsx 的内容/样式）
- [ ] 19.8 hover tooltip 解释"到期复习"和"长期记忆"的含义（可选，取决于是否已有 tooltip 组件）
- [ ] 19.9 所有统计数字在页面可见性变化（从后台回到前台）时重新加载
- [ ] 19.10 账号页原有功能（个人资料编辑、退出登录等）不受影响

## 20. 云端分层存储策略（FR-15 + FR-17 云端数据处理界面）
- [ ] 20.1 `card_status` 表 schema 新增 `mode TEXT` 字段（Supabase SQL 执行成功）
- [ ] 20.2 `pushToCloud` 时：mode='ebbinghaus' 的 cardStatus 记录被上传到云端 `card_status` 表
- [ ] 20.3 `pushToCloud` 时：mode='sequential'|'active'|'weak' 的 cardStatus 记录**不被上传**（本地保留）
- [ ] 20.4 `pullFromCloud` 时：云端下载的记录 mode 默认为 'ebbinghaus'
- [ ] 20.5 `pullFromCloud` 时：本地的 sequential/active/weak 记录**不被云端数据覆盖**（以 id 为主键合并）
- [ ] 20.6 `review_history` 表全量同步（含 mode 字段，区分操作来源模式）
- [ ] 20.7 `study_plans` 表全量同步
- [ ] 20.8 `getSyncStatus()` 返回 `{ lastSyncAt, syncInProgress }` 正确
- [ ] 20.9 **云端数据处理界面**（CloudData.jsx）：
  - [ ] DATA_ITEMS 数组包含 `review_history`（复习历史）一项，显示名称和描述正确
  - [ ] DATA_ITEMS 数组包含 `study_plans`（学习计划）一项，显示名称和描述正确
  - [ ] `card_status` 的描述更新为"已掌握/学习中及艾宾浩斯计划状态（含 mode 字段）"
  - [ ] review_history 卡片显示本地条数、云端条数、最后同步时间
  - [ ] study_plans 卡片显示本地条数、云端条数、最后同步时间
  - [ ] review_history 的「数据上传」按钮可触发上传（仅 ebbinghaus 相关记录）
  - [ ] review_history 的「数据下载」按钮可触发下载
  - [ ] review_history 的「云端数据」按钮可查看云端详情
  - [ ] study_plans 的「数据上传」「数据下载」「云端数据」按钮均正常可用
- [ ] 20.10 **换设备场景验证**：
  - [ ] 设备 A 用艾宾浩斯模式做了复习，云端有数据
  - [ ] 设备 B 登录同一账号后，自动下载艾宾浩斯状态（到期卡片数、reps/interval/easeFactor 与设备 A 一致）
  - [ ] 设备 A 的顺序模式浏览记录不会出现在设备 B 上

## 21. 云端状态感知 UI（FR-16）
- [ ] 21.1 计划页顶部导航栏右侧显示同步状态指示器
- [ ] 21.2 同步完成后显示"🔄 已同步 YYYY-MM-DD"
- [ ] 21.3 同步进行中显示"🔄 同步中"动画
- [ ] 21.4 存在仅本地模式记录时，显示"⚠️ 仅本地"状态
- [ ] 21.5 点击同步状态指示器可手动触发同步
- [ ] 21.6 分类卡片右上角显示模式标签：[🔵 艾宾浩斯] 或 [⚪ 本地模式]
- [ ] 21.7 总览模式模式汇总卡片：艾宾浩斯显示 [🔵 已同步]，其他显示 [⚪ 仅本地]
- [ ] 21.8 当 `hasLocalOnlyData=true` 时，今日视图顶部显示"⚠️ 部分标记仅本设备记录"警告条
- [ ] 21.9 单卡片详情弹窗复习历史中，每条记录显示来源模式标签
- [ ] 21.10 未来预测视图顶部显示 🔵 标识和"已云端同步"说明
- [ ] 21.11 未来预测视图包含提示："顺序/活跃/薄弱模式无长期预测功能"
- [ ] 21.12 账号页统计卡下方显示 [🔵 已同步] 标注
- [ ] 21.13 连续学习天数条显示"基于云端复习记录"说明
- [ ] 21.14 同步状态指示器在 375px 下不溢出（右侧保留合适间距）
- [ ] 21.15 ⚠️ 警告条在移动端不遮挡主要内容

## 22. 测试评分服务对艾宾浩斯计划的处理（FR-18）
- [ ] 22.1 `testGradingService.js` 的 `updateMasteryAndWrongAnswers` 中，答对时 `setCardStatus` 调用传入 `{ mode: 'test' }`
- [ ] 22.2 `testGradingService.js` 中，答错时 `setCardStatus` 调用传入 `{ mode: 'test' }`
- [ ] 22.3 全局正确率判断（accuracy >= 90）中所有 `setCardStatus` 调用传入 `{ mode: 'test' }`
- [ ] 22.4 `db.js setCardStatus` 中新增 `mode='test'` 分支
- [ ] 22.5 `mode='test'` 时：只更新 `status` + `updatedAt` + `reviewCount`，**不修改** reps/interval/easeFactor/nextReviewAt
- [ ] 22.6 `mode='test'` 时仍然写入 reviewHistory（含 `mode='test'` 字段）
- [ ] 22.7 测试答错后，卡片 status='review'，但艾宾浩斯参数（reps/interval/easeFactor/nextReviewAt）保持原值
- [ ] 22.8 reviewHistory 表的 mode 字段支持 'test' 值
- [ ] 22.9 单卡片详情弹窗中，mode='test' 的记录显示 "[🔵 测试评分]" 标签
- [ ] 22.10 如果某卡片在 reviewHistory 中 mode='test' 且 isCorrect=false 的次数 >= 2，显示 "⚠️ 测试答错 N 次，建议提前复习" 提示
- [ ] 22.11 测试中答错一张长期记忆卡片（reps>=5）后，该卡片 status='review'，且会在薄弱模式中出现
- [ ] 22.12 用户在薄弱模式中主动标记"已掌握"后：interval 缩短为 ceil(原×0.8)，easeFactor+0.05，reps 不变（艾宾浩斯参数被调整）
- [ ] 22.13 艾宾浩斯模式下，同一张卡片先复习（更新参数），再在测试中答错（不改变参数）→ 参数保持复习后的值
- [ ] 22.14 **全流程验证**：
  - [ ] 步骤 1：艾宾浩斯模式下，标记卡片 A 为"已掌握"，reps 从 3 变为 4，interval 更新
  - [ ] 步骤 2：在单元/分类检测中，卡片 A 测试答错 → status='review'，但 reps/interval 保持步骤 1 的值
  - [ ] 步骤 3：再次进入艾宾浩斯模式 → 卡片 A 的到期时间仍是步骤 1 计算的结果，未被测试打乱
