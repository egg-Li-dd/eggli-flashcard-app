# 背诵（Memorize）功能 —— 产品需求文档（PRD）

## 一、功能概述

### 1.1 功能定位

背诵功能是 AI FlashCards 应用的核心学习模块，允许用户对已创建的「分类 → 单元 → 卡片」结构进行问题-答案式的背诵练习。用户可根据学习目标选择不同的背诵模式，并在每张卡片上进行"已掌握 / 待复习"的标记。系统支持自动开启新一轮、手动取消轮次等进度管理功能。

### 1.2 使用流程（典型用户路径）

```
1. 进入背诵页
   ↓
2. 顶部分类栏：显示所有分类 + 轮数徽标
   ├─ 点击分类 → 若未选模式 → 弹出"模式选择"弹窗
   │                          ↓
   │                      选择模式 → 加载该分类卡片
   │
   └─ 点击分类（已选模式）→ 加载卡片 → 进入背诵
   ↓
3. 卡片浏览：
   ├─ 点击卡片正面 → 翻转查看答案（正面）
   ├─ 点击「已掌握」→ 标记为 mastered → 下一张
   ├─ 点击「待复习」→ 标记为 review → 下一张
   └─ 左滑卡片 → 打开操作菜单（移动/删除/收藏）
   ↓
4. 进度条：显示"当前张数 / 总张数"和进度百分比
   ↓
5. 完成一轮：
   ├─ 非艾宾浩斯模式 → 全部掌握时自动弹出"完成"提示
   │                    已掌握卡片重置为待复习
   │                    轮数 +1
   │
   └─ 艾宾浩斯模式 → 仅显示到期卡片，不会自动触发"完成"
   ↓
6. 手动重置（点击分类旁的轮数）：
   └─ 弹出确认弹窗 → 确认后所有已掌握 → 待复习，轮数 -1
```

## 二、功能需求详述

### 2.1 分类选择栏

| 需求点 | 详细描述 |
|---|---|
| 水平滚动 | 顶部分类栏支持横向滑动，按钮高度至少 40px，圆角 pill 形 |
| 选中状态 | 当前选中的分类高亮为主色背景 + 白色文字 |
| 轮数徽标 | 非艾宾浩斯模式且 round > 0 时，在分类名称右侧显示圆形数字徽标（如 "2"） |
| 艾宾浩斯徽标 | 当当前模式为艾宾浩斯时，显示日历 Emoji 代替轮数 |
| 长按提示 | 长按分类按钮显示 tooltip，说明"第 N 轮复习中"或"艾宾浩斯模式" |
| **点击轮数徽标** | 选中状态 + 非艾宾 + round > 0 → 弹出**取消本轮确认**弹窗；其余情况 → 切换/选择分类 |

### 2.2 背诵模式选择

| 模式 | 功能描述 |
|---|---|
| 顺序逐卡背诵（sequential） | 按单元、卡片原始顺序依次展示，不做筛选 |
| 活跃记忆法（active） | 随机打乱卡片顺序背诵，强化瞬时记忆 |
| 艾宾浩斯遗忘曲线（ebbinghaus） | 基于 SM-2 算法智能筛选到期需复习的卡片，自动安排下次复习时间 |
| 薄弱卡片专攻（weak） | 仅展示状态为 review 的卡片，优先攻克薄弱项 |

### 2.3 卡片展示与交互

| 需求点 | 详细描述 |
|---|---|
| 卡片结构 | 顶部：分类信息 + 收藏/编辑/移动操作按钮；中间：问题/答案正文（点击翻转）；底部：操作按钮 |
| 翻转动画 | 点击卡片区域触发翻转效果，从"问题"变为"答案" |
| 左滑菜单 | 手指左滑卡片露出隐藏操作菜单：加入收藏、移动分类、删除卡片 |
| 标记按钮 | 底部两行按钮：「上一张」「下一张/完成」；「已掌握」「待复习」「移动」 |
| 艾宾浩斯信息 | 卡片底部显示"复习 N 次 · X 天后复习"等 SM-2 算法信息 |
| 单元归属 | 卡片顶部显示所属单元名称（从 unitName 字段读取） |
| 新卡片标识 | 首次生成的卡片显示"新"绿色徽章，300s 后消失 |

### 2.4 进度统计

| 需求点 | 详细描述 |
|---|---|
| 顶部进度 | "第 M / N 张"文字显示 + 进度条（宽度百分比） |
| 掌握率环形图 | 底部展示"已掌握 / 待复习 / 新卡片"数量及环形掌握率百分比 |
| 今日目标 | 顶部可输入今日目标张数，显示完成进度条 |

### 2.5 轮数管理（核心逻辑）

| 需求点 | 详细描述 |
|---|---|
| 自动开轮 | 非艾宾模式下，当所有卡片均被标记为 mastered 时：自动重置 mastered → review，轮数 +1，弹窗庆祝 |
| 手动取消轮 | 点击分类上的轮数徽标 → 弹出确认弹窗 → 确认后所有 mastered → review，轮数 -1 |
| 轮数存储 | 使用 localStorage `category_rounds` 存储，格式 `{ [categoryId]: roundCount }` |
| 轮数同步 | 每次 set/increment/decrement 操作均尝试同步到 Supabase 云端 `categories.round_count` 字段 |

### 2.6 数据结构（IndexedDB）

**分类表 categories**
```
id          (主键)
name        (分类名)
createdAt   (创建时间戳)
```

**单元表 units**
```
id          (主键)
categoryId  (外键 → categories)
name        (单元名)
createdAt   (时间戳)
order       (排序号)
```

**卡片表 cards**
```
id          (主键)
unitId      (外键 → units)
front       (问题文本)
back        (答案文本)
createdAt   (时间戳)
order       (排序号)
type        (卡片类型：普通/填空等)
```

**卡片状态表 cardStatus**
```
id                    (主键)
cardId                (外键 → cards)
categoryId            (外键 → categories)
status                ('mastered' | 'review')
updatedAt             (时间戳)
reviewCount           (复习次数)
easeFactor            (SM-2 易度因子)
interval              (SM-2 间隔天数)
repetitions           (SM-2 连续正确次数)
lastReviewedAt        (上次复习时间)
nextReviewAt          (下次复习时间)
```

**收藏表 bookmarks**
```
id          (主键)
cardId      (外键 → cards)
createdAt   (时间戳)
```

**错题表 wrongAnswers**
```
id          (主键)
cardId      (外键 → cards)
categoryId  (外键 → categories)
count       (错误次数)
lastWrongAt (时间戳)
```

### 2.7 艾宾浩斯 SM-2 算法

- **核心逻辑**：每次标记为「已掌握」时递增 `repetitions`，按公式更新 `interval` 和 `easeFactor`；标记为「待复习」时重置 `repetitions = 0`，interval 归 1
- **筛选逻辑**：`nextReviewAt <= now()` 的卡片被视为"到期需复习"
- **间隔公式**：
  - repetitions = 0 → interval = 1
  - repetitions = 1 → interval = 6
  - repetitions >= 2 → interval = interval × easeFactor
- **易度因子更新**：easeFactor = max(1.3, easeFactor + (0.1 - (5-quality) × (0.08 + (5-quality) × 0.02)))

## 三、后台逻辑与规则算法

### 3.1 handleSelectCategory 规则

```
输入：catId
条件分支：
  1. selectedCategoryId === catId (再次点击)
     ├─ round > 0 && !ebbinghaus && isSelected → 打开"取消本轮"确认弹窗
     └─ 其他情况 → 打开"模式选择"弹窗
  2. 新选择分类
     ├─ 设置 selectedCategoryId = catId
     ├─ 若 studyMode 已设置 → 调用 loadCards(catId)
     └─ 若 studyMode 为空 → 打开"模式选择"弹窗
```

### 3.2 handleMark 标记逻辑

```
输入：status ('mastered' | 'review')
步骤：
  1. 检查 currentCard 存在且 selectedCategoryId 存在
  2. 调用 setCardStatus(cardId, categoryId, status, { isEbbinghaus, existingRecord })
     ├─ 若已存在记录：更新 status, updatedAt, reviewCount++
     └─ 若是艾宾模式：applySM2 附加 interval/easeFactor/repetitions/nextReviewAt
  3. review 标记 → 记录到 wrongAnswers 表
  4. 同步更新前端 cardStatuses 和 fullCardStatuses
  5. 艾宾模式下实时重新计算"到期卡片数量"
  6. setTimeout 150ms 后翻转卡片回正面，切至下一张
  7. 边界检查：
     ├─ 若 filteredCards.length === 0 或全部 mastered → 触发 handleComplete
     ├─ 若 cardWillBeRemoved (艾宾 mastered / weak mastered) → 当前位置不变
     └─ 若还有下一张 → currentIndex + 1，否则停在末尾
```

### 3.3 handleComplete 完成逻辑

```
触发条件：
  - 非艾宾模式下，所有卡片均被标记为 mastered
  - 或 filteredCards 为空（weak/ebbinghaus 模式下已无匹配卡片）
步骤：
  1. incrementCategoryRound(categoryId) → 轮数 +1
  2. 将所有 mastered 卡片的状态改为 review（在 DB 和本地 state 同步）
  3. 重置 review-only 标志，currentIndex 归 0
  4. 弹出"🎉 恭喜完成"弹窗
  5. 查找下一个未完成分类，准备自动跳转
```

### 3.4 重置确认弹窗逻辑（handleConfirmReset）

```
触发条件：用户点击已选中分类的轮数徽标 (round > 0 && !ebbinghaus)
步骤：
  1. showResetConfirm = { categoryId, round }  → 弹窗显示
  2. 用户点击「确认重置」→ handleConfirmReset：
     ├─ 调用 resetMasteredToReview(categoryId, { decRound: true })
     │   ├─ DB：将 categoryId 下所有 mastered 改为 review
     │   ├─ 本地：同步 cardStatuses 状态
     │   └─ decRound=true → decrementCategoryRound(categoryId)
     ├─ 若 resetCount > 0 → Toast "已取消第 N 轮，M 张卡片重置为待复习"
     └─ setShowResetConfirm(null) → 关闭弹窗
  3. 用户点击「取消」→ 直接 setShowResetConfirm(null)
```

## 四、非功能需求

| 需求 | 描述 |
|---|---|
| 移动端适配 | 所有按钮最小触摸区域 44×44px，卡片宽度随屏幕自适应 |
| 动画体验 | 卡片翻转动画 300ms，切换滑动动画 220-280ms，弹窗 fade 200ms |
| 离线可用 | 所有数据存储于 IndexedDB，无网络连接不影响核心功能 |
| 数据一致性 | 本地状态与 DB 严格同步，setCardStatus 返回完整记录供前端刷新 |
| 反馈机制 | 每次操作后提供明确视觉反馈：Toast 提示、按钮高亮、状态更新 |
| 触觉反馈 | 移动端卡片翻转时调用 navigator.vibrate(10) |

## 五、已识别 Bug 与修复需求

### Bug 1：点击「确认重置」无响应

**现象**：顶部分类栏点击轮数徽标弹出确认框，点击「确认重置」按钮后弹窗关闭，但：

- 若分类当前无已掌握的卡片（`allCards` 中 `cardStatuses[c.id] === 'mastered'` 为空）→ `resetMasteredToReview` 返回 0 → 无 Toast 提示 → 用户感知"无反应"
- 若 `loadCards` 因 `studyMode` 为空未被调用 → `allCards` 为空 → 返回 0 → 同上
- 即使 DB 中有 mastered 状态卡片（从其他页面/会话标记），`resetMasteredToReview` 只从 `allCards` 本地状态筛选，**但 DB 层的 modify 操作仍然独立执行** → 存在"DB 已更新但前端 state 未同步"的隐患

**修复要求**：
1. `handleConfirmReset` 应直接读取数据库（而非仅依赖前端 `allCards`）来确认该分类下是否存在需重置的 mastered 卡片
2. 不论 resetCount 为 0 或 > 0，均需提供 Toast 反馈（"暂无需要重置的卡片" 或 实际重置数量）
3. 重置后重新加载该分类卡片状态（调用 `loadCards`），确保顶部数字徽标立即反映新的轮数

### Bug 2：分类数字徽标点击与分类选择的歧义

**现象**：顶部分类按钮 `onClick` 逻辑混合了"分类选择"与"重置触发"两种行为：

```
onClick={() => {
    if (round > 0 && !isEbb && isSelected) {
        setShowResetConfirm(...)   // 打开重置弹窗
    } else {
        handleSelectCategory(cat.id)  // 选择分类
    }
}}
```

问题：当用户**已选分类**且**处于艾宾模式**时，点击轮数徽标的位置会触发 `handleSelectCategory`，进而打开模式选择弹窗。用户期望点击数字可能是确认轮数，但实际进入了模式选择。

**修复要求**：将轮数徽标的点击区域与分类名称的点击区域**分离**：分类名称负责"选择/切换分类"，数字徽标单独绑定"取消本轮确认"操作，避免行为歧义。

## 六、验收标准

### AC-1：分类数字徽标点击逻辑

- **Given**：分类 A 已选中，已在非艾宾模式背诵，round = 2
- **When**：点击分类 A 旁的数字徽标 "2"
- **Then**：弹出确认弹窗「确认取消第 2 轮？已掌握卡片将重置为待复习」
- **Verification**：programmatic

### AC-2：确认重置按钮响应

- **Given**：分类 A 下有 5 张 mastered 卡片、3 张 review 卡片，重置弹窗已打开
- **When**：点击「确认重置」
- **Then**：① DB 中 5 张 mastered → review；② 轮数从 2 变为 1；③ Toast 显示"已取消第 2 轮，5 张卡片重置为待复习"；④ 顶部分类徽标变为 "1"；⑤ 弹窗关闭
- **Verification**：programmatic

### AC-3：无已掌握卡片时的反馈

- **Given**：分类 A 下所有卡片均为 review / 新卡片，round > 0
- **When**：点击数字徽标 → 确认重置
- **Then**：Toast 显示"当前分类没有需要重置的卡片"；弹窗关闭；轮数不变
- **Verification**：programmatic

### AC-4：数字徽标与分类名称点击分离

- **Given**：分类 A 已选中（round > 0，非艾宾），分类 B 未选中
- **When**：① 点击分类 A 的**名称**；② 点击分类 A 的**数字徽标**；③ 点击分类 B 的名称或徽标
- **Then**：① 打开"模式选择"弹窗；② 打开"取消本轮"确认弹窗；③ 切换选中到分类 B 并加载卡片（或打开模式选择）
- **Verification**：human-judgment（需移动端点击测试）

### AC-5：卡片标记与进度更新

- **Given**：打开分类 A 的背诵（10 张卡片，其中 3 张 mastered，其余新）
- **When**：连续标记若干张卡片为 mastered / review
- **Then**：顶部进度条实时更新，底部掌握率环形图实时变化，点击"待复习"的卡片被正确记录到 wrongAnswers 表
- **Verification**：programmatic

### AC-6：完成新一轮触发

- **Given**：分类 A 下 5 张卡片全部未掌握，非艾宾模式
- **When**：依次将 5 张卡片标记为 mastered
- **Then**：第 5 次标记后，立即弹出"🎉 恭喜完成"弹窗，所有卡片状态自动重置为 review，轮数 +1
- **Verification**：programmatic

### AC-7：艾宾浩斯到期卡片筛选

- **Given**：分类 A 下 10 张卡片，其中 3 张 nextReviewAt <= now
- **When**：切换到艾宾浩斯模式
- **Then**：filteredCards 仅包含 3 张到期卡片，顶部显示"还剩 3 张待复习"
- **Verification**：programmatic

### AC-8：移动端触摸适配

- **Given**：在手机浏览器 / WebView 中打开背诵页
- **When**：滑动分类栏、点击按钮、翻转卡片、左滑卡片
- **Then**：所有操作响应及时（<200ms），按钮大小充足（>=44px 高度），无误触
- **Verification**：human-judgment
