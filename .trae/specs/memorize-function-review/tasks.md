# 背诵功能逻辑审查与 Bug 修复 —— 实施计划（tasks.md）

## [ ] Task 1：修复 resetMasteredToReview 依赖前端 allCards 的逻辑缺陷

- **Priority**: P0
- **Depends On**: None
- **Description**:
  当前 `resetMasteredToReview(categoryId, { decRound })` 内部用 `allCards.filter(c => cardStatuses[c.id] === 'mastered')` 来计算需重置的卡片，这存在以下问题：
  1. 如果 `selectedCategoryId` 不等于传入的 `categoryId`，`allCards` 可能不是该分类的卡片
  2. 如果 `studyMode` 为空，`loadCards` 从未被调用，`allCards` 可能为空数组
  3. 虽然 DB 层的 `dbInstance.cardStatus.where('categoryId').equals(...).filter(...).modify(...)` 是按 categoryId 直接操作数据库，但返回值 `idsToReset.length` 依赖前端 `allCards`，导致 Toast 反馈与实际 DB 修改不一致
  
  修复方案：
  - 直接从 DB 读取该 categoryId 下的 mastered 记录数量，用它来驱动逻辑与 Toast 信息
  - 同步本地状态时，优先从 DB 重新拉取，而非依赖 `allCards`
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-1.1：在未调用 loadCards 的情况下（allCards 为空），点击数字徽标 → 确认重置 → Toast 应显示从 DB 读取的真实数量，并关闭弹窗
  - `programmatic` TR-1.2：selectedCategoryId 与被重置分类不一致场景（通过切换分类后回点原分类），DB 中该分类 mastered 卡片被正确重置
  - `programmatic` TR-1.3：分类无 mastered 卡片时，Toast 显示"当前分类没有需要重置的卡片"，轮数不变化
- **Files to Edit**: `src/pages/Memorize.jsx`

## [ ] Task 2：handleConfirmReset 增强反馈与状态同步

- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 不论 resetCount 为 0 或 > 0，均需提供明确 Toast 反馈
  - 轮数递减后应重新调用 `loadCards` 或至少刷新 `roundsVersion` 状态，确保顶部分类栏数字徽标立即反映新轮数
  - 若当前 `selectedCategoryId` 与 `showResetConfirm.categoryId` 不同，重置后不影响当前显示的卡片（但仍需更新 round 数字）
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-2.1：点击「确认重置」→ Toast 弹出，弹窗关闭，顶部数字徽标在 300ms 内更新为 round-1
  - `programmatic` TR-2.2：手动重置后，cardStatuses 与 fullCardStatuses 中所有 mastered 条目被同步为 review
- **Files to Edit**: `src/pages/Memorize.jsx`

## [ ] Task 3：分离轮数徽标与分类名称的点击区域

- **Priority**: P1
- **Depends On**: None
- **Description**:
  - 将顶部分类按钮拆分为两个点击区域：
    - 左侧：分类名称文字 → 点击触发 `handleSelectCategory(cat.id)`
    - 右侧：数字徽标（圆形 badge）→ 仅当选中 + round>0 + 非艾宾时显示；点击触发 `setShowResetConfirm({ categoryId, round })`
  - 防止事件冒泡：数字徽标点击需 `e.stopPropagation()`，避免同时触发分类选择
  - 艾宾模式下的日历 Emoji 不绑定"取消本轮"操作，仅作视觉标识
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgment` TR-3.1：选中分类 A（round=2），点击分类名称 → 打开模式选择弹窗；点击数字 "2" → 打开取消本轮确认弹窗
  - `human-judgment` TR-3.2：未选中分类 B，点击其名称或数字徽标 → 切换到分类 B（加载卡片或打开模式选择）
  - `human-judgment` TR-3.3：艾宾模式下，数字徽标为 📅，点击不触发取消本轮弹窗，只触发分类选择逻辑
- **Files to Edit**: `src/pages/Memorize.jsx`

## [ ] Task 4：审查 handleSelectCategory 的状态依赖与异步加载

- **Priority**: P1
- **Depends On**: Task 3
- **Description**:
  - 审查 `handleSelectCategory` 逻辑：当 `studyMode` 为 null 时，不调用 `loadCards`，只设置 `selectedCategoryId` 并打开模式选择弹窗
  - 但此时若用户点击"取消"，`studyMode` 仍为 null，分类仍被选中，后续数字徽标点击会触发 reset 弹窗，此时 `allCards` 为空（Task 1 已修复）
  - 确保模式选择弹窗取消后，如果 `studyMode` 为 null，不保留选中状态（避免"空选中"状态混淆）
- **Acceptance Criteria Addressed**: AC-1, AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1：新用户首次选择分类 → 模式选择弹窗 → 点击"取消" → 顶部不显示任何选中分类，也不显示轮数徽标
  - `programmatic` TR-4.2：已有模式的情况下切换分类 → 新分类被选中并立即加载卡片
- **Files to Edit**: `src/pages/Memorize.jsx`

## [ ] Task 5：修复 handleMark 中 filteredCards 为 0 但全部掌握判定的不一致性

- **Priority**: P2
- **Depends On**: None
- **Description**:
  - 当前 `handleMark` 在 setTimeout 内部重新计算 `updatedCardStatusesForCheck`，但通过 `setCardStatuses(prev => { update; return next })` 捕获旧 prev 值用于后续检查
  - 艾宾模式下 `isAllMasteredInCategory` 返回 false，但非艾宾模式下 `filteredCards.length` 可能为 0（当 weak 模式没有 review 卡片），此时 `nextFilteredLen` 为 0，`handleComplete` 被触发，将所有 mastered 重新改为 review → 这是正确的，但需要验证边界条件
  - 需确保 `setCardStatuses` 回调返回值与 `updatedCardStatusesForCheck` 指向同一对象，避免不可预期的"仅部分数据更新"问题
- **Acceptance Criteria Addressed**: AC-5, AC-6
- **Test Requirements**:
  - `programmatic` TR-5.1：顺序模式，5 张卡片，依次标记为 mastered → 第 5 次标记后 handleComplete 正确触发，Toast 显示"已开启新一轮"
  - `programmatic` TR-5.2：艾宾模式，3 张到期卡片，依次标记为 mastered → 每张标记后 nextReviewAt 被推到未来，随后从 filteredCards 中移除；第 3 次后 filteredCards 变为空 → 显示"暂无到期卡片"的 empty 状态，而不是 handleComplete
- **Files to Edit**: `src/pages/Memorize.jsx`

## [ ] Task 6：卡片操作后 loadCards 刷新状态

- **Priority**: P2
- **Depends On**: Task 1, Task 2
- **Description**:
  - 移动、删除、编辑卡片操作后，当前会调用 `setAllCards(prev => prev.filter(...))` 或 `setAllCards(prev => prev.map(...))` 来更新本地状态
  - 但 `cardStatuses` 和 `fullCardStatuses` 可能与 DB 不一致（特别是编辑卡片内容不会影响状态，但移动卡片到其他分类会影响）
  - 修复：卡片移动后，若目标分类是当前分类或原分类是当前分类，应重新 `loadCards` 以刷新数据
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-6.1：移动当前卡片到同一分类下的另一个单元 → 卡片内容与状态保持正确
  - `programmatic` TR-6.2：移动当前卡片到**其他**分类 → 当前卡片从 `allCards` 中消失，索引正确调整
- **Files to Edit**: `src/pages/Memorize.jsx`

## [ ] Task 7：移动端 UI 触摸区域与间距验证

- **Priority**: P2
- **Depends On**: Task 3（需先完成点击区域分离）
- **Description**:
  - 验证顶部分类栏按钮最小高度 40px，文字与数字徽标间距 > 6px，不会误触
  - 数字徽标点击区域需足够大（最小 22×22px，外圈有额外 padding）
  - 确认弹窗按钮在小屏手机上可见可用（最小高度 44px）
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `human-judgment` TR-7.1：在宽度 320px 的屏幕上，分类名称与数字徽标都可见，不被挤压或重叠
  - `human-judgment` TR-7.2：所有弹窗按钮（取消/确认重置/确认移动/确认删除）至少 44px 高度，点击无死角
- **Files to Edit**: `src/pages/Memorize.jsx`
