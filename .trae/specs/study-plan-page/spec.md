# 背诵计划页面（艾宾浩斯长期规划版）- 产品需求文档 (PRD)

## 概述
- **摘要**: 本项目构建一个全新的「背诵计划」页面，将艾宾浩斯 SM-2 遗忘曲线算法可视化，帮助用户理解每张卡片的长期复习轨迹，并预测未来每日的复习工作量。页面提供：今日到期视图 + 未来 N 天工作量预测 + 卡片掌握度分布 + 单卡片复习时间线。用户从背诵页点击「立即复习」或「显示全部」跳转到本页，也可以从计划页的「开始复习」跳回背诵页进入实际学习。

- **目的**: 解决当前背诵页只展示"今日到期 X 张"这一单维信息的问题。新页面让用户看到：(1) 每张卡片在未来数月内的复习轨迹 (2) 未来每日的工作量变化曲线 (3) 整体学习体系中各卡片所处的记忆阶段 (4) 基于算法的长期掌握预测。让学习计划从"被动等待到期"变为"主动规划长期记忆"。

- **目标用户**: 使用本应用进行知识卡片背诵、希望有系统性学习规划的用户（特别是考研/备考用户，涉及大量知识点的长期记忆管理）。

## 核心设计原则
1. **算法透明性**：让用户"看得见"艾宾浩斯算法在工作——展示每张卡片的 reps、interval、easeFactor 等参数的实际值和变化
2. **未来可预测**：基于当前卡片集合和学习状态，预测未来 7 天/30 天每日的到期卡片数量和工作量
3. **进度可视化**：展示卡片在"首次学习 → 短期记忆 → 中期记忆 → 长期记忆"各个阶段的分布
4. **增量修改**：不破坏背诵页现有交互，所有修改为增量添加

---

## SM-2 算法工作原理详解（供设计参考）

### 算法参数定义

| 参数 | 含义 | 初始值 | 成功变化 | 失败变化 |
|-----|------|-------|---------|---------|
| `repetitions` | 连续成功复习次数 | 0 | +1 | 归零 = 0 |
| `interval` | 下次复习间隔（天） | 0 | reps=1→1, reps=2→6, reps>2→ceil(prev×ease) | max(1, ceil(prev×0.5)) |
| `easeFactor` | 难度系数（越大越容易） | 2.5 | +0.1（无上限，但≥1.3） | max(1.3, -0.2) |
| `nextReviewAt` | 下次复习时间戳 | Date.now()（未学过视为立即可复习） | Date.now() + interval × DAY_MS | Date.now()（立即可复习） |

### 一张卡片理想复习轨迹（全部成功）

假设今天学习一张卡片，且每次复习都成功（标记为"已掌握"）：

| 第几次复习 | 距离首次学习 | 操作后 state | 下次间隔 | 下次复习日期 |
|-----------|-------------|-------------|---------|------------|
| 0（首次） | 今天 | reps=1, ease=2.5 | 1 天 | 明天（T+1） |
| 1 | T+1 | reps=2, ease=2.6 | 6 天 | T+7 |
| 2 | T+7 | reps=3, ease=2.7 | 16 天 | T+23 |
| 3 | T+23 | reps=4, ease=2.8 | 44 天 | T+67 |
| 4 | T+67 | reps=5, ease=2.9 | 124 天 | T+191 |
| 5 | T+191 | reps=6, ease=3.0 | 372 天 | T+563 |
| 6 | T+563 | reps=7, ease=3.1 | 1154 天 | T+1717 |

**关键点**：
- 卡片需要经过 **5 次成功复习**才能进入"月度以上"的长期记忆区间（interval ≥ 30 天）
- 整个过程约 **6-12 个月**完成首次学习到长期记忆的建立
- 一旦失败，repetitions 归零，卡片"退档"，需要重新从头累积间隔

### 卡片记忆阶段定义（用于UI分组显示）

| 阶段 | 判断条件 | 说明 |
|-----|---------|------|
| 未学习 | `!record` 即无 cardStatus 记录 | 用户还未在背诵模式下学习过该卡片 |
| 到期待复习 | `nextReviewAt <= now` | 根据算法应该复习了，可能处于任何 reps 级别 |
| 短期记忆 | `reps=1 或 reps=2` 且 `nextReviewAt > now` | 刚学过或刚复习过 1-2 次，间隔仅 1-6 天，记忆很脆弱 |
| 中期记忆 | `reps=3 或 reps=4` 且 `nextReviewAt > now` | 已成功复习过 2-3 次，间隔 16-44 天 |
| 长期记忆 | `reps>=5` 且 `nextReviewAt > now` | 已成功复习 4+ 次，间隔数月以上，视为已建立长期记忆 |
| 失败回退 | `reps=0`（上次操作是失败"待掌握"） | 上次复习失败，需要重新累积间隔 |

### SM-2 延迟复习惩罚机制（问题 1：未按时复习的处置方案）

当用户**超过计划日期**才来复习一张卡片时，根据延迟程度给予不同惩罚，而非简单"降级到6天"。

**定义**：`delayDays = floor((现在日期 - nextReviewAt) / 1天)`

| 延迟程度 | 条件 | 标记为"已掌握"（成功）时的惩罚 | 标记为"待掌握"（失败）时 |
|---------|------|------------------------|-------------------|
| 按时/提前 | `delayDays <= 0` | 正常 SM-2：reps+1，`interval = ceil(prev × easeFactor)`，easeFactor+0.1 | 正常失败逻辑（见下表） |
| 轻微延迟 | `0 < delayDays <= 3` | reps+1，但 `interval = min(SM2计算值, prevInterval + 3)`；easeFactor 不增加 | 无论延迟，统一按失败逻辑 |
| 中等延迟 | `3 < delayDays <= interval` | reps 退回到 `max(1, reps-1)`；interval 退回到 `max(1, ceil(原interval × 0.6))`；easeFactor -0.1 | 统一按失败逻辑 |
| 严重延迟 | `delayDays > interval` | reps 退回到 1（重新开始累积）；interval 重置为 1；easeFactor -0.15 | 统一按失败逻辑 |

**失败逻辑（统一）**：`reps = 0`，`interval = max(1, ceil(原interval × 0.5))`，`easeFactor = max(1.3, easeFactor - 0.2)`，`nextReviewAt = now`（立即到期）

**示例**：卡片当前 reps=3, interval=16, easeFactor=2.7（下次应在 T+23 复习）。用户在 T+40 才来复习：
- delayDays = (T+40 - T-23) = 17 > interval=16 → **严重延迟**
- 如果标记为"已掌握"：reps 重置为 1，interval 重置为 1，easeFactor 变为 2.55
- 下次复习路径：T+41（1天后）→ T+47（6天后）→ T+63（16天后）→ ... 重新累积

---

### 按背诵模式隔离的状态更新策略（问题 2：模式间状态管理方案）

**核心原则**：只有艾宾浩斯模式才能改变长期复习计划（reps / interval / easeFactor / nextReviewAt）。其他模式只影响"这张卡我当前记不记得"的即时状态，不改变长期复习计划。

`setCardStatus(cardId, categoryId, status, { mode, existingRecord })` 按模式的不同行为：

| 模式 | 标记为"已掌握"（status='mastered'） | 标记为"待掌握"（status='review'） | 是否写入 reviewHistory |
|-----|----------------------------------|--------------------------------|-------------------|
| **ebbinghaus** | 完整 SM-2：reps/interval/easeFactor/nextReviewAt 全部更新，含延迟惩罚逻辑 | 完整 SM-2 失败逻辑（reps=0，interval减半，easeFactor-0.2，立即到期） | ✅ 是（`mode='ebbinghaus'`） |
| **sequential** | 只更新 `status='mastered'` + `updatedAt=now` + `reviewCount++`，**不改变** reps/ease/interval/nextReviewAt | 只更新 `status='review'` + `updatedAt=now` + `reviewCount++`，**不改变** reps/ease/interval/nextReviewAt | ✅ 是（`mode='sequential'`） |
| **active** | 只更新 `status='mastered'` + `updatedAt=now` + `reviewCount++`，不改变 interval/ease | 只更新 `status='review'` + `updatedAt=now` + `reviewCount++` | ✅ 是（`mode='active'`） |
| **weak** | `status='mastered'`，`interval = max(1, ceil(interval × 0.8))`（减小间隔以强化），`easeFactor = easeFactor + 0.05`，reps **保持不变** | 只更新 `status='review'` + `updatedAt=now`，不改变 reps | ✅ 是（`mode='weak'`） |

**为什么这样设计**：
- 艾宾浩斯模式：用户明确在做"算法驱动的系统复习"，每次标记都影响长期计划
- 顺序/活跃模式：用户只是"快速浏览"或"随机抽查"，标记只确认"我现在记不记得"，不应该改变"我 16 天后是否还记得"的算法预测
- 薄弱模式：是"艾宾浩斯的特殊强化模式"——专门针对难点，可以略微缩短间隔（更频繁复习），但不改变成功次数计数（reps）

**reviewHistory 表需新增字段**：`mode TEXT`（值为 `'ebbinghaus' | 'sequential' | 'active' | 'weak'`），用于区分数据来源模式

---

## 功能需求（详细版）

### FR-1: 页面路由与入口

**路由**：
- `src/App.jsx` 中新增：`<Route path="/memorize/plan" element={<RequireAuth><StudyPlan /></RequireAuth>}>`
- 放在 `/memorize` 路由之前（React Router 匹配顺序）

**入口来源**：
1. 背诵页黄色提示栏「立即复习」按钮 → `navigate('/memorize/plan?entryType=review&categoryId=xxx')`
2. 背诵页蓝色提示栏「显示全部」按钮 → `navigate('/memorize/plan?entryType=all&categoryId=xxx')`
3. 背诵页顶部分类选择条右侧新增「📋 背诵计划」图标按钮 → `navigate('/memorize/plan?entryType=manual')`

**页面结构**：
- 顶部导航栏（"背诵计划"标题 + 返回按钮 + 当前日期）
- 内容区（分视图）：
  - 视图切换 Tab（"今日 / 未来 / 分析"）
  - 模式切换 Tab（四模式）
  - 对应视图的实际内容

### FR-2: 视图一 · 今日计划（默认视图）

**功能**：今天需要做什么 + 今日完成状态

**顶部统计卡**：
```
┌───────────────────────────────────────┐
│  📅 2026 年 6 月 16 日，星期二         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │ 今日需   │  │ 今日新学 │  │ 已完成  ││
│  │ 复习 25  │  │ 建议 12  │  │  8/37   ││
│  │  张卡片  │  │  张卡片  │  │  21%    ││
│  └─────────┘  └─────────┘  └─────────┘│
│  掌握率 ███████░░  73% (54/74 张)      │
└───────────────────────────────────────┘
```

**卡片列表 - 今日到期**：
- 按分类分组显示，每个分类卡片包含：
  - 分类名 + 图标
  - 到期卡片数（大号数字）
  - 到期卡片预览（最多展示 5 张的 front 摘要 + "还有 X 张"）
  - 最早到期时间（如"2 小时前到期"）
  - 「进入复习」按钮 → `navigate('/memorize?categoryId=xxx&mode=ebbinghaus&fromPlan=true')`
  - 该分类已完成（dueCount=0）时显示 ✓ 和"已完成今日任务"

**卡片列表 - 今日建议新学**：
- 显示未学习过的卡片（无 cardStatus 记录），按创建时间排序
- 每个分类显示其"今日新学上限"（studyPlans.dailyNewLimit）
- 「开始新学」按钮 → 跳转到背诵页但不筛选（即显示全部未学卡片）

**全部完成态**：
- 当今日到期 + 新学都完成时，显示：
  - 🎉 "今日计划已完成！"
  - "明日将有 X 张卡片到期，预计 Y 分钟"
  - 「查看明日计划」按钮（跳转到未来视图）

### FR-3: 视图二 · 未来 N 天工作量预测

**功能**：预测未来每日的复习工作量，让用户提前规划

**顶部概览**：
```
┌───────────────────────────────────────┐
│  未来 7 天预计到期卡片分布             │
│                                       │
│  日期  | 卡片数 | 预计耗时 | 状态      │
│  6/17  |  18 张 | 约 2 分钟 | 正常     │
│  6/18  |  25 张 | 约 3 分钟 | 正常     │
│  6/19  |  42 张 | 约 4 分钟 | ⚠ 偏重   │
│  6/20  |  38 张 | 约 4 分钟 | 正常     │
│  6/21  |  30 张 | 约 3 分钟 | 正常     │
│  6/22  |  20 张 | 约 2 分钟 | 轻松     │
│  6/23  |  15 张 | 约 2 分钟 | 轻松     │
│                                       │
│  [切换到未来 30 天视图]                │
└───────────────────────────────────────┘
```

**柱状图**（纯 CSS/div 实现，无需额外图表库）：
- 横向柱状条，高度代表卡片数量，按日期排列
- 今日的柱用 `var(--color-primary)` 填充
- 未来日期用 `var(--color-accent-light)` 填充
- 超过阈值（如 > 30 张）的柱标红边框，显示"⚠ 偏重"

**预测算法**（纯前端计算，不写入数据库）：
```javascript
function predictFutureDue(cards, statuses, daysAhead) {
  // 对每一张卡片：
  //   如果 nextReviewAt <= now → 计入"今天"
  //   否则 → 计算 nextReviewAt 距离 now 的天数差 → 计入对应日期
  //   如果 nextReviewAt 在 daysAhead 以外 → 计入"更远的未来"
  //
  // 对未学习过的卡片（无 status）：假设用户按"今日新学上限"学习，
  // 预测它们的第 1 次复习（T+1）、第 2 次（T+7）等日期
  // → 这是"乐观预测"，仅用于展示趋势，不作为精确计划
}
```

**30 天视图**：
- 以"周"为聚合单位（每周卡片数总和）显示更宽的趋势
- 标记"峰值周"和"轻松周"
- 底部显示："未来 30 天预计共需复习 X 张卡片"

### FR-4: 视图三 · 学习分析与卡片分布

**功能**：展示整个学习体系的健康状态和各卡片所处阶段

**卡片 1：掌握度阶段分布**
```
┌───────────────────────────────────────┐
│  卡片记忆阶段分布                      │
│                                       │
│  🔴 到期待复习    25 张 (34%)  ██████░│
│  🟡 短期记忆      12 张 (16%)  ███░░░░│
│  🟠 中期记忆      18 张 (24%)  ████░░░│
│  🟢 长期记忆      19 张 (26%)  ████░░░│
│  ⚪ 未学习        20 张         ████░░│
│                                       │
│  总计：74 张（含未学 94 张）           │
└───────────────────────────────────────┘
```

**卡片 2：难度系数分布**
- 显示各卡片 easeFactor 的分布情况
- 平均值：2.6
- "最难的卡片"（easeFactor 最低的 5 张）列表：
  - 卡片 front 内容摘要
  - 当前 easeFactor 值
  - 历史失败次数
  - 「优先复习」按钮（跳转到背诵页并筛选这些卡片）

**卡片 3：复习历史统计**
- 本周已复习次数、成功次数、失败次数
- 本月累计数据
- 近 7 天的复习活动柱状图（每日复习数量）

### FR-5: 单卡片复习时间线（点击卡片弹出的详情面板）

**功能**：让用户看到某张卡片的完整复习历史和预计未来轨迹

**显示内容**：
```
卡片："马斯洛需求层次理论从下到上依次是？"
答案："生理需求 → 安全需求 → 社交需求 → 尊重需求 → 自我实现需求"
分类：考研政治 · 马原

当前状态：中期记忆（reps=3，已成功复习 3 次）
┌───────────────────────────────────────┐
│  📊 参数                              │
│  repetitions:  3                      │
│  interval:      16 天                 │
│  easeFactor:    2.7                   │
│  nextReviewAt:  2026-06-30            │
│                                       │
│  🕐 复习历史（倒序）                   │
│  ✓ 2026-06-14 第 3 次复习 成功         │
│  ✓ 2026-06-08 第 2 次复习 成功         │
│  ✓ 2026-06-02 第 1 次复习 成功         │
│  ✓ 2026-06-01 首次学习                │
│                                       │
│  📈 预计未来复习日期（全部成功假设）     │
│  → 2026-06-30  第 4 次复习             │
│  → 2026-08-13  第 5 次复习             │
│  → 2026-12-15  第 6 次复习             │
│  → ...（进入长期记忆，间隔超过 1 年）   │
└───────────────────────────────────────┘
[在背诵页打开此卡片]
```

**需要新增的数据表**：`reviewHistory`
- 字段：`id, cardId, categoryId, wasMastered, repetitions, easeFactor, interval, reviewedAt`
- 每次用户在背诵页点击"已掌握/待掌握"时插入一条记录
- 用于生成时间线和统计分析

### FR-6: 复习上限设置（可调整的每日学习强度）

**功能**：用户可以调整自己的每日学习上限，系统根据上限给出更合理的建议

**调整面板**（在计划页点击"⚙️ 设置"按钮弹出）：
```
每日复习上限：[ 50 ] 张（到期超过时提醒"今日任务偏重"）
每日新学上限：[ 20 ] 张（今日新学建议数量）
[保存]
```

**数据存储**：见下文 `studyPlans` 表

**使用方式**：
- 今日视图中，当到期卡片数 > 上限时，显示提醒
- 预测视图中，用红线标记超过上限的日期

### FR-7: 与背诵页的联动跳转（fromPlan 模式）

**计划页 → 背诵页**：
- 「进入复习」按钮 → `/memorize?categoryId=xxx&mode=ebbinghaus&fromPlan=true&viewType=due`（只显示到期卡片）
- 「开始新学」按钮 → `/memorize?categoryId=xxx&mode=ebbinghaus&fromPlan=true&viewType=new`（只显示未学过的卡片）
- 「复习全部」按钮（计划页顶部）→ `/memorize?categoryId=all&mode=ebbinghaus&fromPlan=true`

**背诵页在 fromPlan 模式下的行为**：
1. 自动选择指定分类（categoryId=all 时进入全分类循环模式）
2. 自动进入 ebbinghaus 模式
3. 顶部显示"来自背诵计划，正在复习 XX 分类"小提示条（可关闭）
4. 不再显示黄色/蓝色到期卡片提示条（用户已从计划页进入，信息已知）
5. 全分类循环模式：当前分类卡片学完后自动进入下一分类，顶部显示分类切换指示

**背诵页 → 计划页返回**：
- 顶部小提示条右侧提供「返回计划页」按钮
- 或通过底部 Tab 点击"背诵"跳回计划页

### FR-8: reviewHistory 数据表（新增）

**本地（Dexie）**:
```javascript
{
  id: 'uuid',
  cardId: '卡片 ID',
  categoryId: '分类 ID',
  wasMastered: true | false,  // 本次复习结果
  repetitions: 3,              // 复习后新的 repetitions 值
  easeFactor: 2.7,             // 复习后新的 easeFactor 值
  interval: 16,                // 复习后新的 interval 值（天）
  reviewedAt: 1234567890,      // 复习时间戳
}
```

**云端（Supabase, snake_case）**:
```sql
CREATE TABLE review_history (
  id UUID PRIMARY KEY,
  card_id UUID REFERENCES cards(id),
  category_id UUID REFERENCES categories(id),
  was_mastered BOOLEAN,
  repetitions INT,
  ease_factor NUMERIC,
  interval INT,
  reviewed_at BIGINT
);
```

**数据写入时机**：用户在背诵页点击「已掌握/待掌握」按钮时，在更新 cardStatus 的同时插入一条 reviewHistory 记录

**数据用途**：
- 生成单卡片复习时间线
- 统计各卡片失败次数（用于识别"最难卡片"列表）
- 生成学习活动统计图（近 7 天复习数量柱状图）

### FR-9: studyPlans 数据表（新增）

**本地（Dexie）**:
```javascript
{
  id: 'uuid',              // 计划 ID
  categoryId: '分类 ID',   // 该分类的计划（或 'all' 表示全局）
  dailyReviewLimit: 50,    // 每日复习上限
  dailyNewLimit: 20,       // 每日新学上限
  priority: 'high',        // 优先级: 'high' | 'medium' | 'low'
  lastStudiedAt: timestamp, // 该分类最近学习时间
  lastCompletedDate: '2026-06-15', // 最近一次完成全部日任务的日期
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**云端（Supabase, snake_case）**:
```sql
CREATE TABLE study_plans (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id),
  daily_review_limit INT,
  daily_new_limit INT,
  priority TEXT,
  last_studied_at BIGINT,
  last_completed_date TEXT,
  created_at BIGINT,
  updated_at BIGINT
);
```

### FR-10: 长期掌握预测（分析视图中的一项）

**功能**：基于当前所有卡片的状态和近期学习速度，预测未来多少天后整个学习体系达到"稳定状态"

**预测算法**：
```javascript
// 输入：
//   - 各卡片的 current reps, interval, easeFactor
//   - 近期平均每天学习卡片数（来自 reviewHistory）
//
// 输出：
//   - "90% 卡片达到中期记忆(reps>=3) 需要约 45 天"
//   - "90% 卡片达到长期记忆(reps>=5) 需要约 180 天"
//   - 基于当前学习速度，预计每天新增 X 张"新学卡片"
//
// 简化实现：
//   1. 统计当前各阶段卡片数量
//   2. 假设"未来成功复习率 = 历史成功率"（从 reviewHistory 计算）
//   3. 模拟每张卡片按 SM-2 规则逐天推进
//   4. 统计每天末各阶段卡片数量变化
//   5. 找到 90% 卡片达到目标阶段的天数
```

**展示方式**：文本预测 + 简化的曲线（显示"中期记忆"和"长期记忆"两个里程碑日期）

### FR-11: 计划页的双层 Tab 结构（问题 3：顺序/活跃/薄弱模式的计划展示）

计划页采用**两层嵌套 Tab** 结构：

**第一层（主视图 Tab，顶部）**：`[ 今日计划 | 未来预测 | 学习分析 ]`

**第二层（背诵模式 Tab，主视图下方）**：`[ 总览 | 艾宾浩斯 | 进度追踪 | 薄弱 ]`

各模式组合下的视图内容：

| 模式 | 今日计划视图 | 未来预测视图 | 学习分析视图 |
|-----|-----------|-----------|----------|
| **总览** | 4 模式今日任务汇总卡片：艾宾浩斯到期数 + 顺序进度百分比 + 活跃模式最近新学数 + 薄弱待掌握数 | 只显示艾宾浩斯 7 天预测（其他模式无预测意义） | 总掌握率环形图 + 总卡片数 + 近 7 天复习活动柱状图 |
| **艾宾浩斯** | 按分类显示到期卡片列表 + 每分类新学建议（卡片前 5 摘要 + 更多数） | 未来 7/30 天预测柱状图（超过 dailyReviewLimit 的日期标红） | 阶段分布图（5 阶段）+ 最难卡片 Top5（按 reviewHistory 失败次数）+ 长期掌握预测文本 |
| **进度追踪** | 按分类显示顺序模式进度百分比（已看过/总数 + 进度条）+ 活跃模式最近 7 天新学卡片列表 | 显示"按当前速度 X 天可完成全部卡片"的估算（基于 reviewHistory 中近 7 天平均日处理量） | 各分类进度条汇总 + 最近 20 张已看卡片列表（含时间） |
| **薄弱** | 待掌握卡片数（按分类分组）+ 最近 7 天新增的薄弱卡片列表 | 显示"薄弱卡片占比趋势"（最近 14 天薄弱卡数/总卡片数的变化曲线） | 薄弱卡分析（失败次数排名 Top10 + 失败最高分类 Top3） |

**"进度追踪"模式说明**：
- 顺序模式"已看过"的判定：cardStatus.updatedAt 存在且该卡片在当前分类下被用户标记过（任意 status）
- 活跃模式同顺序模式
- "继续学习"按钮 → 跳回背诵页对应模式：`/memorize?categoryId=xxx&mode=sequential` 或 `mode=active`

### FR-12: account 页面学习统计增强（问题 4：新增艾宾浩斯相关统计）

**现有统计**（Account.jsx 已实现）：总卡片数、今日已学、已掌握、学习中、待开始、收藏数

**新增统计卡片**（在现有 2×3 网格基础上扩展或替换部分卡片）：

| 统计项 | 计算方式 | 含义 | 点击行为 |
|-------|---------|------|---------|
| 到期卡片数 | `cardStatus` 中 `nextReviewAt <= now` 的记录数 | 艾宾浩斯模式下今日需复习的卡片 | 跳去 `/memorize/plan` |
| 长期记忆数 | `cardStatus` 中 `repetitions >= 5` 的记录数 | 已建立长期记忆的卡片 | 跳去 `/stats/longterm`（新页面，展示长期记忆卡片列表） |
| 平均复习间隔 | 所有 `cardStatus.interval > 0` 的记录的 interval 平均值 | 整体学习体系的"成熟度" | 不跳转，hover 显示 tooltip 解释 |
| 连续学习天数 | 从 reviewHistory 提取日期列表，从今天倒推连续有记录的天数 | 用户学习习惯的养成程度 | 不跳转，显示火焰图标 |

**账号页统计面板新布局**：

```
账号页（已登录）
├─ 用户信息卡片
│
├─ 学习统计面板
│   ├─ 进度环形图（已掌握 / 总卡片数）
│   │
│   ├─ 2×3 统计卡片网格
│   │   ├─ 总卡片数      → 主页
│   │   ├─ 今日已学      → /stats/today
│   │   ├─ 已掌握        → /stats/mastered
│   │   ├─ 到期复习      → /memorize/plan（新！）
│   │   ├─ 长期记忆      → /stats/longterm（新页面）
│   │   └─ 收藏数        → /stats/bookmarks
│   │
│   └─ 连续学习天数条（"已连续学习 X 天"，X=0 时显示"今日还未学习哦"）
│
├─ 云端数据处理（原有）
├─ 数据管理（原有）
└─ 退出登录（原有）
```

**新增统计函数**（在 `src/services/db.js` 中补充）：
- `getDueCardsCount()`：到期卡片数
- `getLongTermCardsCount()`：reps>=5 的卡片数
- `getAverageInterval()`：平均复习间隔
- `getStreakDays()`：连续学习天数（基于 reviewHistory）

### FR-13: cardStatus 表的 mode 字段补充（与问题 2 对应）

在 `setCardStatus` 调用中增加 `mode` 参数，并在 handleMark 中传入当前 studyMode：

```javascript
// Memorize.jsx handleMark 中的修改
const updatedRecord = await setCardStatus(currentCard.id, selectedCategoryId, status, {
  existingRecord: fullCardStatuses[currentCard.id] || null,
  mode: studyMode || 'sequential',  // 新增：传入当前模式
})

// db.js setCardStatus 中的修改
export async function setCardStatus(cardId, categoryId, status, opts = {}) {
  const { existingRecord = null, mode = 'sequential' } = opts  // 默认 sequential
  // 按 mode 执行不同的更新策略（详见"按背诵模式隔离的状态更新策略"一节）
}
```

同时 reviewHistory 表新增 `mode` 字段，用于统计分析时区分数据来源。

### FR-14: 艾宾浩斯算法工具函数补充（问题 1 的实现支持）

在 `src/utils/ebbinghaus.js` 中新增函数：

- `applySM2WithDelay(record, wasMastered, now = Date.now())`：含延迟惩罚逻辑的 SM-2 计算
- `calculateDelayDays(record, now)`：计算延迟天数
- `classifyDelayLevel(delayDays, interval)`：返回 `'onTime' | 'slight' | 'medium' | 'severe'`

### FR-15: 云端存储策略（分层同步方案）

**核心原则**：艾宾浩斯计划必须云端同步以支持跨设备连续执行；顺序/活跃/薄弱模式仅本地存储。

#### 数据分层存储策略

| 数据 | 本地存储 | 云端同步 | 原因 |
|------|---------|---------|------|
| **cardStatus（mode='ebbinghaus'）** | ✅ | ✅ **完整同步** | 艾宾浩斯是长期计划，必须跨设备可继续 |
| **cardStatus（mode='sequential'/'active'/'weak'）** | ✅ | ❌ **不上传** | 临时浏览模式，状态没有跨设备持续意义 |
| **reviewHistory（全模式）** | ✅ | ✅ **完整同步** | streaks、分析数据需要跨设备可用 |
| **studyPlans** | ✅ | ✅ **完整同步** | 每日上限设置需要跨设备同步 |

#### 现有 `card_status` 表改造

在现有 `card_status` 表中新增 `mode` 字段（SQL 变更）：

```sql
ALTER TABLE card_status ADD COLUMN mode TEXT DEFAULT 'ebbbinghaus';
-- 值为: 'ebbinghaus' | 'sequential' | 'active' | 'weak'
```

**现有数据迁移**：已有记录（无 mode 字段）的默认视为 `mode='ebbinghaus'`（向后兼容）。

#### 同步逻辑修改（sync.js）

**上传（pushToCloud）时**：
```javascript
// cardStatus 上传时过滤：只上传 mode='ebbinghaus' 的记录
const ebbinghausStatuses = statuses.filter(s => s.mode === 'ebbinghaus')
await uploadTable('card_status', ebbinghausStatuses, '卡片状态')

// reviewHistory 全量上传（包含 mode 字段）
await uploadTable('review_history', reviewHistories, '复习历史')
```

**下载（pullFromCloud）时**：
```javascript
// cardStatus 下载后，与本地的 sequential/active/weak 记录合并
// 云端下载的只含 ebbinghaus，本地的 sequential/active/weak 保留本地版本
const cloudStatuses = await fetchAllPages(...) // 只有 ebbinghaus
// 合并：cloudStatuses + 本地 sequential/active/weak 记录
```

#### 换设备场景的行为

| 场景 | 行为 |
|------|------|
| 设备 A 做了 50 张艾宾浩斯复习 | ✅ 同步到云端，设备 B 登录后可继续 |
| 设备 A 用顺序模式浏览了 100 张 | ❌ 仅本地，换设备后不会带过去 |
| 设备 B 登录同一账号 | ✅ 自动下载云端 ebbinghaus 状态，继续艾宾浩斯计划 |
| 设备 B 改用顺序模式浏览 | ❌ 顺序模式状态只在设备 B 本地，不影响云端 ebbinghaus |

### FR-16: 新页面的云端状态感知 UI

新页面（计划页 + 今日视图 + 单卡片详情）需要感知数据是否云端同步，显示相应的视觉提示。

#### 1. 顶部同步状态指示器（所有视图共享）

```
┌─────────────────────────────────────────────────────────┐
│  背诵计划                         🔄 已同步  2026-06-16 │
└─────────────────────────────────────────────────────────┘
```

- 显示最后同步时间
- 🔄 同步中动画（上传/下载时显示）
- ⚠️ 仅本地（当存在仅本地模式数据时显示）
- 点击可手动触发同步

#### 2. 今日视图分类卡片上的模式标签

每个分类卡片右上角显示一个小标签，表示该分类的艾宾浩斯数据同步状态：

```
┌───────────────────────────────────────────────┐
│ 📚 考研政治 · 马原              [🔵 艾宾浩斯] │
│ 到期 25 张 · 新学建议 8 张                    │
│ 已完成 8/33 张  (24%)                         │
│ [进入复习]                                    │
└───────────────────────────────────────────────┘
```

标签含义：
- 🔵 **艾宾浩斯**：mode='ebbinghaus' 记录已云端同步
- ⚪ **本地模式**：该分类只有本地（sequential/active/weak）标记，无云端同步

#### 3. 模式汇总卡片上的同步状态

在总览模式的今日视图中，每张模式汇总卡片显示：

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ 艾宾浩斯        │  │ 顺序浏览        │  │ 活跃学习        │  │ 薄弱卡片        │
│ 到期 25 张      │  │ 已看 12/50     │  │ 新学 8 张       │  │ 待掌握 15 张    │
│ [🔵 已同步]     │  │ [⚪ 仅本地]     │  │ [⚪ 仅本地]     │  │ [⚪ 仅本地]     │
│ [进入复习]      │  │ [继续学习]      │  │ [开始学习]      │  │ [进入复习]      │
└────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘
```

#### 4. 单卡片详情弹窗中的复习历史模式标注

在复习历史中，每条记录标注来源模式：

```
🕐 复习历史
✓ 2026-06-14  第 3 次复习  成功  [🔵 艾宾浩斯]
✓ 2026-06-08  第 2 次复习  成功  [🔵 艾宾浩斯]
✓ 2026-06-02  第 1 次复习  成功  [🔵 艾宾浩斯]
✓ 2026-06-01  首次学习     成功  [🔵 艾宾浩斯]
✓ 2026-05-28  已掌握       成功  [⚪ 顺序浏览]  ← 仅本地标记
✓ 2026-05-27  已掌握       成功  [⚪ 顺序浏览]  ← 仅本地标记
```

#### 5. 未来预测视图中的同步提示

```
┌───────────────────────────────────────────────┐
│  🔵 未来 7 天预测（基于艾宾浩斯计划，已云端同步）│
│                                               │
│  ⚠️ 顺序/活跃/薄弱模式无长期预测功能           │
│     这些模式的数据不会同步到云端               │
└───────────────────────────────────────────────┘
```

#### 6. 账号页统计卡的同步状态标注

```
┌─────────────────────────────┐
│ 到期复习         25 张      │
│ 基于艾宾浩斯计划 [🔵 已同步] │
│ → /memorize/plan           │
└─────────────────────────────┘

┌─────────────────────────────┐
│ 长期记忆          12 张     │
│ 跨设备持续        [🔵 已同步] │
│ → /stats/longterm          │
└─────────────────────────────┘

┌─────────────────────────────┐
│ 连续学习天数       5 天 🔥  │
│ 基于云端复习记录                │
└─────────────────────────────┘
```

#### 7. 设备差异警告（当有仅本地数据时显示）

在计划页顶部或今日视图顶部显示一条提示：

```
┌────────────────────────────────────────────────────┐
│ ⚠️ 部分标记仅本设备记录                              │
│                                                    │
│ 顺序浏览、活跃学习、薄弱模式的标记不会同步到云端。   │
│ 换设备后需要重新开始。                              │
│ 艾宾浩斯计划已云端同步，换设备可无缝继续。         │
└────────────────────────────────────────────────────┘
```

此警告的出现条件：数据库中存在 `mode='sequential' | 'active' | 'weak'` 的 cardStatus 记录。

### FR-18: 单元检测/分类检测对艾宾浩斯计划的处理规则

测试评分服务（`testGradingService.js` 的 `updateMasteryAndWrongAnswers`）在单元/分类检测后会更新卡片的掌握程度（`status`）。

**核心原则**：测试是"抽样验证"，不是"算法驱动的系统复习"。测试结果只影响卡片的即时状态（`status`），**不直接修改**艾宾浩斯的长期计划参数（reps/interval/easeFactor/nextReviewAt）。

#### 测试评分的处理规则

| 场景 | 测试结果 | setCardStatus 行为 | 艾宾浩斯参数（reps/interval/easeFactor/nextReviewAt） | reviewHistory 记录 |
|------|---------|-------------------|---------------------------------------------------|-------------------|
| 艾宾浩斯已掌握的卡片（reps>=1） | 测试答对 | `status='mastered'`，`mode='test'` | **不改变** | 记录一条 `mode='test'` 的成功记录（用于后续分析参考） |
| 艾宾浩斯已掌握的卡片（reps>=1） | 测试答错 | `status='review'`，`mode='test'` | **不改变** | 记录一条 `mode='test'` 的失败记录（用于后续分析参考） |
| 未学习过的卡片（无艾宾浩斯记录） | 测试答对 | `status='mastered'`，`mode='test'` | 不改变（本来就无艾宾浩斯参数） | 记录一条 `mode='test'` 的成功记录 |
| 未学习过的卡片（无艾宾浩斯记录） | 测试答错 | `status='review'`，`mode='test'` | 不改变（本来就无艾宾浩斯参数） | 记录一条 `mode='test'` 的失败记录 |
| 薄弱模式下已加强的卡片 | 测试答对 | `status='mastered'`，`mode='test'` | **不改变** | 记录一条 `mode='test'` 的成功记录 |
| 薄弱模式下已加强的卡片 | 测试答错 | `status='review'`，`mode='test'` | **不改变** | 记录一条 `mode='test'` 的失败记录 |

#### 为什么测试不影响艾宾浩斯参数？

| 原因 | 说明 |
|-----|------|
| **测试环境 ≠ 复习环境** | 测试是被动评估，复习是主动回忆。测试答错可能是因为紧张/干扰等环境因素，不能直接等同于"用户忘了" |
| **避免重复信号** | 用户可能先在艾宾浩斯模式中复习（已经更新了参数），然后立即在测试中遇到同一卡片——这不应被算作"两次复习" |
| **SM-2 是累积算法** | 艾宾浩斯算法基于"成功复习次数"的累积。测试答对不应该被算作一次"成功复习"（因为测试调用不触发 applySM2WithDelay） |
| **保持长期计划的稳定性** | 艾宾浩斯计划应该基于"主动复习"的真实操作，而不是被测试中的偶然错误打乱节奏 |

#### 对现有代码的修改

1. **`testGradingService.js`**：在 `updateMasteryAndWrongAnswers` 中调用 `setCardStatus` 时新增 `{ mode: 'test' }` 参数
   ```javascript
   if (r.isCorrect) {
     await setCardStatus(cardId, categoryId, 'mastered', { mode: 'test' })  // 新增 mode='test'
     await clearWrongAnswer(cardId, categoryId).catch(() => {})
   } else {
     await setCardStatus(cardId, categoryId, 'review', { mode: 'test' })       // 新增 mode='test'
     await addWrongAnswer(cardId, categoryId, ...).catch(() => {})
   }
   ```

2. **`db.js setCardStatus`**：新增对 `mode='test'` 的处理分支
   - mode='test' 时：**只更新 `status` + `updatedAt` + `reviewCount`**，**不修改** reps/interval/easeFactor/nextReviewAt
   - 与 `sequential`/`active` 模式行为一致

3. **reviewHistory 表的 mode 字段新增** `'test'` 值
   - 用于区分测试评分操作与其他背诵模式
   - 在计划页单卡片详情弹窗中显示为 "[🔵 测试评分]"（或 "[⚪ 测试评分]"，取决于用户是否认为测试应该云端同步——建议 🔵，因为 reviewHistory 全量同步）

#### 全局正确率调整的处理

现有代码的 `if (accuracy >= 90)` 逻辑将所有卡片设为 mastered：
- **不影响艾宾浩斯参数**（因为调用的是相同的 setCardStatus，mode='test'）
- 这是"整体判断"，不是对每张卡片的独立评估，更不应该修改长期计划

#### 测试答错后的实际效果

当用户在测试中答错一张"艾宾浩斯认为已长期记忆"的卡片时：
- `status` 被设为 `'review'` → 这张卡片会在薄弱模式（weak mode）中出现
- 用户可以在薄弱模式中**主动重新复习**这张卡片
- **薄弱模式的处理规则**：用户在薄弱模式中标记"已掌握"时，interval 缩短为 ceil(原×0.8)，easeFactor+0.05，reps 保持不变
- 即：**用户的主动复习行为**才会改变艾宾浩斯参数，测试结果只是"触发用户重新复习"的信号

#### 长期掌握预测的参考信号

虽然测试答错不直接修改艾宾浩斯参数，但可以在 `predictMasteryTimeline` 函数中增加"测试失败信号"：
- 可以统计某卡片在 reviewHistory 中 mode='test' 且 isCorrect=false 的次数
- 如果某卡片在测试中多次答错，可以向用户显示"⚠️ 这张卡片在测试中答错 2 次，建议提前复习"

#### 云端同步行为

测试评分的 reviewHistory 记录 mode='test'，**随 reviewHistory 全量同步到云端**（因为 reviewHistory 所有记录都同步）。这保证了换设备后，测试的历史记录可见，用于后续的掌握分析。

---

## 非功能性需求

### NFR-1: 性能
- 页面首屏加载 < 500ms（含数据库读取）
- 切换视图/Tab 的 UI 响应 < 150ms
- 未来 30 天预测计算 < 200ms（即便卡片有 1000+ 张）
- 使用 `useMemo` 缓存统计结果

### NFR-2: 移动端适配
- 所有按钮 ≥ 40px 高度
- 模式 Tab 横向可滚动，不换行
- 数据列表使用滚动容器（非整页长滚动）
- 375px 宽度下文字不溢出

### NFR-3: 样式一致性
- 主色 `var(--color-primary)`，强调色 `var(--color-accent)`
- 卡片背景 `var(--color-surface)`，圆角 `var(--radius-lg)`
- 阶段颜色与上文定义的 emoji 颜色对应
- 进度条用纯 CSS/gradients 实现，不引入图表库

### NFR-4: 数据一致性
- plan 页显示的到期卡片数 ≡ 背诵页进入 ebbinghaus 模式后显示的卡片数
- reviewHistory 在用户点击"已掌握/待掌握"时与 cardStatus 同时写入，使用事务
- 同步到 Supabase 时使用与其他表相同的 camelCase ↔ snake_case 转换

---

## 技术架构

### 数据流图
```
┌────────────┐     点击"已掌握/待掌握"      ┌───────────────┐
│  背诵页    │ ──────────────────────────▶ │  Dexie 数据库 │
│ Memorize   │                              │  cardStatus   │
│            │ ◀────────────────────────── │  reviewHistory │
└────────────┘    返回更新后的状态          │  studyPlans    │
       ▲                                    └───────────────┘
       │ fromPlan=true 时自动进入              ▲
       │                                       │ 读写
       ▼                                       ▼
┌────────────┐                          ┌───────────────┐
│  计划页    │ ◀──────────────────────── │ Sync 服务    │
│ StudyPlan  │    读取 cardStatus 统计    │ sync.js       │
│            │    读取 reviewHistory     │               │
│            │    读取 studyPlans        └───────────────┘
└────────────┘                                  ▲
       ▲                                         │
       │ Supabase 同步                            ▼
       │                                   ┌───────────────┐
       └──────────────────────────────────▶│ Supabase 云端 │
                                           │ study_plans   │
                                           │ review_history│
                                           └───────────────┘
```

### 新增/修改文件清单

| 文件 | 类型 | 功能 |
|-----|------|------|
| `src/pages/StudyPlan.jsx` | 新增 | 计划页主组件（3 视图 Tab + 4 模式 Tab） |
| `src/components/PlanTodayView.jsx` | 新增 | 今日计划视图 |
| `src/components/PlanFutureView.jsx` | 新增 | 未来 N 天预测视图 |
| `src/components/PlanAnalysisView.jsx` | 新增 | 学习分析视图 |
| `src/components/PlanCardDetail.jsx` | 新增 | 单卡片复习时间线弹窗 |
| `src/components/PlanSettingsModal.jsx` | 新增 | 每日上限设置弹窗 |
| `src/utils/planCalculator.js` | 新增 | 未来预测/阶段分析/统计工具函数 |
| `src/services/db.js` | 修改 | 新增 reviewHistory、studyPlans 表 + CRUD |
| `src/services/sync.js` | 修改 | 新增两张表的同步规则 + 字段映射 |
| `src/pages/Memorize.jsx` | 修改 | handleContinueReview/ExitReview 改为跳转计划页；新增 fromPlan 模式；新增 reviewHistory 写入；新增顶部计划入口按钮 |
| `src/App.jsx` | 修改 | 新增 /memorize/plan 路由 |

---

## 验收标准（详细版）

### AC-1: 入口与路由
- **Given** 用户在背诵页看到黄色提示条「立即复习」
- **When** 点击按钮
- **Then** 页面跳转到 `/memorize/plan?entryType=review`，计划页正常渲染
- **Verification**: programmatic + manual

### AC-2: 今日视图 - 到期卡片统计正确性
- **Given** 数据库中有 N 张卡片，其中 M 张的 `nextReviewAt <= now`
- **When** 打开计划页今日视图
- **Then** 顶部"今日需复习"显示 M 张；分类列表中各分类到期数之和 = M
- **Verification**: programmatic（对照数据库 SQL 查询）

### AC-3: 今日视图 - 新学建议
- **Given** 数据库中有 U 张未学习卡片（无 cardStatus 记录）
- **When** 打开计划页今日视图
- **Then** "今日新学建议"显示 min(U × 0.1, dailyNewLimit) 张
- **Verification**: programmatic

### AC-4: 未来视图 - 7 天预测
- **Given** 每张卡片的 nextReviewAt 字段有效
- **When** 切换到未来视图，选择"7 天"
- **Then** 每天的卡片数 = 满足 `dayStart <= nextReviewAt < dayEnd` 的卡片数；7 天总和正确
- **Verification**: programmatic（模拟计算后比对）

### AC-5: 未来视图 - 超过上限提醒
- **Given** 某天的预测到期数 > dailyReviewLimit（如 50）
- **When** 显示该日的柱状图
- **Then** 标红并显示"⚠ 偏重"
- **Verification**: programmatic + visual

### AC-6: 分析视图 - 阶段分布正确性
- **Given** 每张卡片有明确的 cardStatus 记录
- **When** 切换到分析视图
- **Then** 各阶段的卡片数与按条件筛选的结果一致：
  - 到期待复习: `nextReviewAt <= now`
  - 短期记忆: `reps=1 或 2` 且 `nextReviewAt > now`
  - 中期记忆: `reps=3 或 4` 且 `nextReviewAt > now`
  - 长期记忆: `reps>=5` 且 `nextReviewAt > now`
  - 未学习: 无 status 记录
- **Verification**: programmatic

### AC-7: 分析视图 - 最难卡片
- **Given** reviewHistory 表有失败记录
- **When** 打开分析视图
- **Then** "最难卡片"列表按失败次数降序排列 Top 5
- **Verification**: programmatic

### AC-8: 单卡片复习时间线
- **Given** 某卡片有 K 条 reviewHistory 记录
- **When** 点击该卡片进入详情面板
- **Then** 面板显示：当前 reps/ease/interval 值 + 倒序 K 条历史记录 + 预计未来 3-5 次复习日期
- **Verification**: programmatic + visual

### AC-9: 从计划页跳转回背诵页（单分类）
- **Given** 用户在计划页点击某分类的「进入复习」按钮
- **When** 跳转完成
- **Then** 背诵页自动进入：选定分类 + ebbinghaus 模式 + 显示 fromPlan 提示条 + 不显示黄色/蓝色提示条
- **Verification**: programmatic（URL 参数 + state 断言）

### AC-10: 从计划页跳转回背诵页（全分类循环）
- **Given** 用户点击计划页顶部「复习全部」
- **When** 跳转完成
- **Then** 背诵页显示全分类循环模式：当前分类指示条 + 第一分类到期卡片 + 学完后自动切换下一分类
- **Verification**: programmatic

### AC-11: reviewHistory 数据写入
- **Given** 用户在背诵页 fromPlan 模式下复习一张卡片
- **When** 点击「已掌握」或「待掌握」
- **Then** cardStatus 表更新 + reviewHistory 表插入一条记录（含 wasMastered/reps/ease/interval/reviewedAt）
- **Verification**: programmatic（数据库查询断言）

### AC-12: 每日上限设置与持久化
- **Given** 用户在计划页打开设置，将 dailyReviewLimit 改为 30
- **When** 点击保存，然后刷新页面
- **Then** studyPlans 表中该分类的 dailyReviewLimit = 30；预测视图中超过 30 的日期标重
- **Verification**: programmatic

### AC-13: 今日完成状态
- **Given** 某分类下的到期卡片数 = 0，新学建议也完成
- **When** 显示该分类卡片
- **Then** 显示 ✓ "已完成今日任务"；全部分类完成后顶部显示"🎉 今日计划已完成"
- **Verification**: programmatic

### AC-14: 移动端适配
- **Given** 375px 宽度视口
- **When** 浏览全部三个视图
- **Then** 所有按钮 ≥ 40px、文字不溢出、不出现非预期的横向滚动
- **Verification**: manual

### AC-15: 性能
- **Given** 数据库中有 1000 张卡片
- **When** 打开计划页，切换视图
- **Then** 首屏 < 500ms，视图切换 < 150ms
- **Verification**: programmatic（console.time 计时）

---

## 开放性问题（等待用户确认）
- [ ] 未来预测视图是否需要支持"自定义天数"（如 14 天、90 天）？还是固定 7 天/30 天两个按钮切换？
- [ ] 是否需要在"最难卡片"列表中提供"重置这张卡片的学习状态"功能（即让用户从头学习一张一直失败的卡片）？
- [ ] reviewHistory 表的同步策略：是每次复习后立即同步，还是与其他表一起走批量同步（延迟几秒）？
- [ ] 是否需要引入"学习日历"视图（类似 GitHub contribution graph，每天的复习数量用颜色深浅表示）？
- [ ] 长期掌握预测中的"90% 卡片达到长期记忆"这个指标对用户是否有实际意义？还是更关注"期末前能学完所有卡片"？
