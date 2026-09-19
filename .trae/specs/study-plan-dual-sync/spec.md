# 背诵计划双向同步机制 - 产品需求文档

## 概述

**问题背景**：当前 `cardStatus` 表同一张卡片在同一分类下只有**一条记录**，`mode` 字段只是标记"最后一次操作是什么模式"。这导致：
- 长期计划(ebbinghaus)点击「已掌握」时，短时计划的 status 不会同步更新
- 短时计划点击「已掌握」时，ebbinghaus 的 SM-2 参数被错误修改
- 测试评分影响短期状态而非长期计划

**解决方案**：改为**同一张卡片在同一个分类下有两条独立记录**：
- 一条 `mode='ebbinghaus'` 的记录（仅艾宾浩斯参数）
- 一条 `mode='short'` 的记录（仅即时状态）

---

## 一、数据模型设计

### 1.1 cardStatus 表的 mode 字段重新定义

| mode 值 | 含义 | 存储内容 |
|---------|------|----------|
| `ebbinghaus` | 艾宾浩斯长期计划 | SM-2 参数（reps, interval, easeFactor, nextReviewAt）+ status |
| `short` | 短时计划（即时状态） | 仅 status |

**注意**：原有的 `sequential`、`active`、`weak`、`test` 模式将统一为 `short`，因为它们都不影响长期 SM-2 参数。

### 1.2 索引变更

```javascript
// 查询索引需要支持 mode 字段
cardStatus: '&id, cardId, categoryId, [cardId+categoryId+mode], status, updatedAt, nextReviewAt, repetitions, mode'
```

---

## 二、双向同步规则

### 2.1 操作矩阵

| 操作来源 | 操作结果 | 是否触发反向同步 |
|----------|----------|------------------|
| **ebbinghaus 模式**点击「已掌握」 | ✅ 更新 SM-2 参数 | **同步更新** short 记录的 status=mastered |
| **ebbinghaus 模式**点击「待掌握」 | ✅ 执行失败逻辑（reps=0） | **同步更新** short 记录的 status=review |
| **short 模式**点击「已掌握」 | ✅ 只更新 status | ❌ ebbinghaus 不变 |
| **short 模式**点击「待掌握」 | ✅ 只更新 status | **触发 ebbinghaus 降级**（reps=0，interval 减半） |
| **测试评分**答错 | ✅ 只更新 short status=review | ❌ 不影响 ebbinghaus |
| **测试评分**答对 | ✅ 只更新 short status=mastered | ❌ 不影响 ebbinghaus |

### 2.2 详细逻辑说明

#### 场景 A：ebbinghaus 模式点击「已掌握」
```
1. setCardStatus(cardId, categoryId, 'mastered', { mode: 'ebbinghaus' })
2. 更新/创建 ebbinghaus 记录的 SM-2 参数
3. 自动更新/创建 short 记录的 status='mastered'
4. 两者使用相同的 wasMastered=true
```

#### 场景 B：ebbinghaus 模式点击「待掌握」
```
1. setCardStatus(cardId, categoryId, 'review', { mode: 'ebbinghaus' })
2. 执行 SM-2 失败逻辑：reps=0, interval=ceil(prev*0.5), easeFactor-=0.2, nextReviewAt=now
3. 自动更新 short 记录的 status='review'
```

#### 场景 C：short 模式点击「已掌握」
```
1. setCardStatus(cardId, categoryId, 'mastered', { mode: 'short' })
2. 只更新 short 记录的 status='mastered'
3. ebbinghaus 记录完全不变
```

#### 场景 D：short 模式点击「待掌握」（触发降级）【核心双向同步】

**触发条件**：short 模式的 status 变为 'review'

```
1. setCardStatus(cardId, categoryId, 'review', { mode: 'short' })
2. 更新 short 记录的 status='review'
3. 查询 ebbinghaus 记录（如果存在）
4. 如果 ebbinghaus 存在：执行失败逻辑
   - reps = 0
   - interval = max(1, ceil(prevInterval * 0.5))
   - easeFactor = max(1.3, prevEase - 0.2)
   - nextReviewAt = now
   - status = 'review'
5. reviewHistory 记录 mode='short'（标记来源）
```

**关键点**：
- 只有 short 状态 **变为** 'review' 时才触发降级
- 如果 short 状态本身就是 'review'（还没被修复），再次标记「待掌握」**不再重复触发**降级
- short 点击「已掌握」→ 只更新 short status='mastered'，**不触发降级**，**也不影响 ebbinghaus**

**场景 D-1：short 模式「待掌握」但 ebbinghaus 已是失败状态**
- 如果 ebbinghaus 的 reps 已经是 0，不需要重复降级

**场景 D-2：测试评分答错（mode='test'）**
```
1. setCardStatus(cardId, categoryId, 'review', { mode: 'test' })
2. 映射为 'short'，更新 short 记录的 status='review'
3. 触发降级：ebbinghaus 执行失败逻辑
```

**场景 D-3：测试评分答对（mode='test'）**
```
1. setCardStatus(cardId, categoryId, 'mastered', { mode: 'test' })
2. 映射为 'short'，更新 short 记录的 status='mastered'
3. 不触发降级
```

#### 场景 E：测试评分
```
1. updateMasteryAndWrongAnswers 调用 setCardStatus(..., { mode: 'test' })
2. setCardStatus 检测到 mode='test'，直接映射为 'short'
3. 只更新 short 记录的 status
4. ebbinghaus 记录完全不变
```

---

## 三、API 设计

### 3.1 setCardStatus 函数签名变更

```javascript
/**
 * 设置卡片状态
 * @param {string} cardId - 卡片ID
 * @param {string} categoryId - 分类ID
 * @param {string} status - 'mastered' | 'review'
 * @param {Object} opts - 选项
 * @param {string} opts.mode - 'ebbinghaus' | 'short' | 'test'
 * @param {Object} opts.existingRecord - 已有的记录（用于避免重复查询）
 * @param {boolean} opts.skipReverseSync - 跳过反向同步（用于避免循环调用）
 */
export async function setCardStatus(cardId, categoryId, status, opts = {})
```

### 3.2 内部函数

```javascript
/**
 * 更新 short 记录（用于 ebbinghaus 操作时同步）
 */
async function updateShortStatus(cardId, categoryId, status) {
  const shortRecord = await db.cardStatus.where({ cardId, categoryId, mode: 'short' }).first()
  if (shortRecord) {
    await db.cardStatus.update(shortRecord.id, { status, updatedAt: Date.now() })
  } else {
    await db.cardStatus.add({
      id: generateId(),
      cardId,
      categoryId,
      status,
      mode: 'short',
      updatedAt: Date.now(),
    })
  }
}

/**
 * 降级 ebbinghaus 记录（用于 short 操作时触发）
 * 只有当 short 状态变为 'review' 时才触发，且避免重复降级
 */
async function degradeEbbinghausRecord(cardId, categoryId) {
  const ebRecord = await db.cardStatus.where({ cardId, categoryId, mode: 'ebbinghaus' }).first()
  if (!ebRecord) return

  // 避免重复降级：如果已经是失败状态（reps=0），不再重复降级
  if (ebRecord.reps === 0) return

  const now = Date.now()
  const newInterval = Math.max(1, Math.ceil((ebRecord.interval || 1) * 0.5))
  const newEase = Math.max(1.3, (ebRecord.easeFactor || 2.5) - 0.2)

  await db.cardStatus.update(ebRecord.id, {
    reps: 0,
    interval: newInterval,
    easeFactor: newEase,
    nextReviewAt: now,
    status: 'review',
    updatedAt: now,
  })
}
```

---

## 四、UI 交互变更

### 4.1 背诵页面状态显示

- **显示 short 状态的 status**（而非混合状态）
- short 记录不存在时，显示"未学习"

### 4.2 背诵计划页面状态统计

- **到期卡片数**：来自 ebbinghaus 记录的 `nextReviewAt <= now` 判断
- **短期状态**：来自 short 记录的 status 判断

---

## 五、迁移策略

### 5.1 数据迁移

现有数据的 `mode` 值为：
- `sequential` / `active` / `weak` → 迁移为 `short`
- `ebbinghaus` → 保持 `ebbinghaus`
- `test` → 迁移为 `short`（测试不写入 ebbinghaus）

### 5.2 迁移 SQL

```javascript
// IndexedDB 迁移：创建 short 记录
async function migrateToDualMode() {
  const allStatuses = await db.cardStatus.toArray()
  
  for (const record of allStatuses) {
    if (record.mode !== 'ebbinghaus') {
      // 将 non-ebbinghaus 转为 short
      await db.cardStatus.update(record.id, { mode: 'short' })
    }
  }
}
```

---

## 六、影响范围

### 6.1 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `db.js` | setCardStatus 函数重写，支持双向同步 |
| `Memorize.jsx` | 传入正确的 mode（ebbinghaus/short） |
| `testGradingService.js` | 传入 mode='test' |
| `ebbinghaus.js` | filterDueCards 只看 ebbinghaus 记录 |
| `planCalculator.js` | 同上 |
| `StudyPlan.jsx` | 统计时区分 ebbinghaus 和 short |

### 6.2 云端同步策略不变

- ebbinghaus 记录 → 云端同步
- short 记录 → 不同步（仅本地）
- reviewHistory → 全量同步

---

## 七、状态没有更新的 Bug 修复

### 7.1 问题诊断

当前 `handleMark` 调用 `setCardStatus` 时传入 `existingRecord: fullCardStatuses[currentCard.id]`。

如果 `fullCardStatuses[currentCard.id]` 存在但缺少 `id` 字段，`db.cardStatus.update(ex.id, update)` 会静默失败（因为 id 无效）。

### 7.2 修复方案

在 `setCardStatus` 中，如果 `existingRecord` 存在但缺少 `id`，则从数据库重新查询以获取正确的 id：

```javascript
let ex = existingRecord
if (!ex) {
  ex = await db.cardStatus.where({ cardId, categoryId }).first()
} else if (!ex.id) {
  // existingRecord 缺少 id，重新查询
  ex = await db.cardStatus.where({ cardId, categoryId }).first()
}
```

---

## 八、测试用例

### 8.1 双向同步测试

| # | 操作 | 预期结果 |
|---|------|----------|
| 1 | ebbinghaus 模式点击「已掌握」 | ebbinghaus 参数更新，short status=mastered |
| 2 | short 模式点击「已掌握」 | 只有 short status=mastered，ebbinghaus 完全不变 |
| 3 | short 模式点击「待掌握」 | short status=review，ebbinghaus 执行降级（reps=0） |
| 4 | short 状态已是 review，再次点击「待掌握」 | 不重复触发降级（已经是失败状态） |
| 5 | 测试答错 | 只有 short status=review，触发降级 |
| 6 | 测试答对 | 只有 short status=mastered，不触发降级 |
