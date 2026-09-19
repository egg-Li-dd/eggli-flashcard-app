# 背诵功能全面修复 Spec

## Why

背诵功能（Memorize）经深入检查发现 13 项逻辑不足，涵盖致命崩溃、数据丢失、状态不一致、跨设备冲突、进度恢复失效等多个层面。其中 `handleComplete` 调用未声明的 `setIsReviewComplete` 导致运行时崩溃，Pull 同步清空本地 cardStatus 导致用户数据永久丢失，weak 模式回退逻辑错误导致显示全部卡片而非空状态。本次修复旨在系统性解决这些问题，确保背诵功能稳定可靠。

## What Changes

### 致命问题修复
- 修复 `handleComplete` 中 `setIsReviewComplete` 未定义引用错误
- 艾宾浩斯模式完成所有到期卡片后显示完成弹窗（非跳转、非 Toast）

### 严重问题修复
- Pull 同步改为合并策略：仅更新/插入云端 ebbinghaus 记录，保留本地非 ebbinghaus 记录
- weak 模式无 review 卡片时返回空数组，触发空状态文案显示

### 中等问题修复
- `handleMark` 中 UI 乐观更新改为等待 `setCardStatus` 返回实际记录后再更新（或失败回滚）
- `setCardStatus` 失败时回滚 `cardStatuses` 和 `fullCardStatuses`，Toast 提示重试
- 模式切换时保护 `userOverride` 标记，避免被新模式清除
- sequential/active 的 review 标记不再破坏 ebbinghaus SM-2 参数（隔离短期/长期计划）
- 多设备 SM-2 参数冲突引入基于 `updatedAt` 的冲突解决

### 低等问题修复
- 废弃轮数概念：移除 `incrementCategoryRound`/`decrementCategoryRound`/`getCategoryRound` 等死代码及 sync.js 相关同步逻辑
- `dueCardsCount` 改为基于 `filteredCards` 动态计算
- 错题本与 cardStatus 跨设备脱节：weak 模式改为基于 `wrongAnswers` 筛选
- 进度恢复机制优化：艾宾浩斯模式恢复 cardId 而非位置索引，active 模式 shuffle 后重新定位

### BREAKING CHANGES
- 移除轮数管理相关函数（`incrementCategoryRound`、`decrementCategoryRound`、`getCategoryRound`、`setCategoryRound`、`getCategoryRoundsFromLocal`）
- 移除 sync.js 中 `round_count` 字段的同步逻辑
- `cardStatus` 表的 `mode` 字段语义调整：sequential/active 的 review 标记不再修改 SM-2 参数

## Impact

- **Affected specs**: memorize-function-review、memorize-function-analysis、study-plan-page、study-plan-dual-sync
- **Affected code**:
  - `src/pages/Memorize.jsx`：handleComplete、handleMark、filteredCards、loadCards、handleSelectMode
  - `src/services/db.js`：setCardStatus、轮数管理函数移除、cardStatus 表 schema
  - `src/services/sync.js`：pullFromCloud 合并策略、round_count 同步移除
  - `src/utils/ebbinghaus.js`：filterDueCards、getNextReviewAt（可选调整新卡片处理）
  - `src/pages/StudyPlan.jsx`：移除轮数显示依赖

## ADDED Requirements

### Requirement: 艾宾浩斯模式完成弹窗
系统 SHALL 在艾宾浩斯模式下复习完所有到期卡片后，显示完成弹窗，提供"查看计划页"和"继续浏览"两个按钮，不调用任何未定义的状态设置函数。

#### Scenario: 艾宾浩斯模式完成所有到期卡片
- **WHEN** 用户在艾宾浩斯模式下标记最后一张到期卡片为"已掌握"或"待掌握"，导致 `nextFilteredLen === 0`
- **THEN** 显示"🎉 今日复习已完成"弹窗，包含"查看计划页"和"继续浏览"两个按钮
- **AND** 点击"查看计划页"跳转到 `/memorize/plan`
- **AND** 点击"继续浏览"关闭弹窗，`reviewOnly` 设为 false，显示全部分类卡片

#### Scenario: 非艾宾浩斯模式完成所有卡片
- **WHEN** 用户在 sequential/active 模式下标记最后一张卡片为"已掌握"，`nextFilteredLen === 0`
- **THEN** 显示"🎉 恭喜完成"弹窗，包含"重新开始"和"返回"两个按钮
- **AND** 不再执行 `incrementCategoryRound`（轮数概念已废弃）

### Requirement: Pull 同步合并策略
系统 SHALL 在 Pull 同步 cardStatus 时采用合并策略，仅更新/插入云端 ebbinghaus 记录，保留本地非 ebbinghaus 记录。

#### Scenario: Pull 同步保留本地非 ebbinghaus 记录
- **WHEN** 用户触发 Pull 同步，本地存在 sequential/active/weak/test 模式的 cardStatus 记录
- **THEN** 同步完成后，本地非 ebbinghaus 记录保留不变
- **AND** 云端 ebbinghaus 记录按 `cardId` 合并到本地（更新已有或插入新记录）
- **AND** 不再调用 `db.cardStatus.clear()`

### Requirement: weak 模式空状态
系统 SHALL 在 weak 模式下无 review 卡片时显示空状态文案，而非回退显示全部卡片。

#### Scenario: weak 模式无薄弱卡片
- **WHEN** 用户进入 weak 模式，且 `cardStatuses` 中无 `status === 'review'` 的卡片
- **THEN** `filteredCards` 返回空数组
- **AND** 显示空状态文案"全部已掌握！太棒了！没有待掌握的薄弱卡片"

### Requirement: 状态同步一致性
系统 SHALL 确保 UI 乐观更新与数据库实际写入结果一致，失败时回滚 UI 状态。

#### Scenario: setCardStatus 成功后修正 UI 状态
- **WHEN** 用户点击"已掌握"或"待掌握"按钮
- **THEN** UI 立即显示预测状态（乐观更新）
- **AND** `setCardStatus` 完成后，用返回的实际记录修正 `fullCardStatuses`
- **AND** 若实际记录与预测记录差异（如延迟惩罚导致 reps 不同），UI 自动更新为实际值

#### Scenario: setCardStatus 失败回滚
- **WHEN** `setCardStatus` 调用失败（网络异常、数据库错误等）
- **THEN** `cardStatuses` 和 `fullCardStatuses` 回滚到操作前的状态
- **AND** 显示 Toast 提示"标记失败，请重试"
- **AND** 卡片不切换到下一张

### Requirement: 模式切换保护 userOverride
系统 SHALL 在模式切换时保护用户手动设置的 `userOverride` 标记，避免被新模式清除。

#### Scenario: ebbinghaus 模式保留 sequential 的 userOverride
- **WHEN** 用户在 sequential 模式标记卡片为"待掌握"（`userOverride=true`），切换到 ebbinghaus 模式
- **AND** 在 ebbinghaus 模式下标记该卡片为"已掌握"
- **THEN** `userOverride` 标记保留为 true
- **AND** SM-2 参数按 ebbinghaus 逻辑计算，但 UI 显示"用户已手动标记"提示

### Requirement: 短期/长期计划 SM-2 隔离
系统 SHALL 隔离 sequential/active 模式与 ebbinghaus 模式的 SM-2 参数，短期标记不破坏长期计划。

#### Scenario: sequential review 不影响 ebbinghaus SM-2
- **WHEN** 用户在 sequential 模式标记卡片为"待掌握"
- **THEN** `cardStatus.status` 更新为 'review'，`updatedAt` 更新
- **AND** `repetitions`、`interval`、`easeFactor`、`nextReviewAt` 保持不变
- **AND** 设置 `userOverride=true` 标记
- **AND** 后续 ebbinghaus 模式复习时，SM-2 参数基于原值计算

### Requirement: 多设备 SM-2 冲突解决
系统 SHALL 在 Pull 同步时基于 `updatedAt` 解决 SM-2 参数冲突。

#### Scenario: 保留较新的 SM-2 记录
- **WHEN** 本地和云端存在同一 cardId 的 ebbinghaus 记录，且 `updatedAt` 不同
- **THEN** 保留 `updatedAt` 较新的记录
- **AND** 丢弃较旧的记录

### Requirement: dueCardsCount 动态计算
系统 SHALL 将 `dueCardsCount` 改为基于当前 `filteredCards`（章节/单元筛选后）动态计算。

#### Scenario: 章节筛选后到期计数准确
- **WHEN** 用户选中某章节，进入艾宾浩斯模式
- **THEN** 顶部"有 X 张到期卡片"显示该章节的到期卡片数
- **AND** X 等于 `filterDueCards(filteredCards, fullCardStatuses).length`

### Requirement: weak 模式基于错题本筛选
系统 SHALL 将 weak 模式的数据源从 `cardStatuses` 改为 `wrongAnswers` 表，确保跨设备一致性。

#### Scenario: weak 模式显示错题本卡片
- **WHEN** 用户进入 weak 模式
- **THEN** `filteredCards` 基于 `wrongAnswers` 表筛选，显示错题本中的卡片
- **AND** 若错题本为空，显示空状态文案

### Requirement: 艾宾浩斯进度恢复基于 cardId
系统 SHALL 在艾宾浩斯模式下恢复进度时基于 cardId 而非位置索引。

#### Scenario: 恢复到最后复习的卡片
- **WHEN** 用户重新进入艾宾浩斯模式，存在已保存的 `lastReviewedCardId`
- **THEN** 定位到该 cardId 在当前到期列表中的位置
- **AND** 若该 cardId 不在当前到期列表中，从第 0 张开始

### Requirement: active 模式 shuffle 后重新定位
系统 SHALL 在 active 模式 shuffle 后基于 cardId 重新定位进度。

#### Scenario: active 模式恢复进度
- **WHEN** 用户重新进入 active 模式，存在已保存的 `lastReviewedCardId`
- **THEN** shuffle 后定位到该 cardId 在新顺序中的位置
- **AND** 若该 cardId 不存在，从第 0 张开始

## MODIFIED Requirements

### Requirement: handleComplete 完成逻辑
`handleComplete` 函数 SHALL 根据当前模式显示不同的完成弹窗，不再调用 `setIsReviewComplete`，不再执行 `incrementCategoryRound`。

#### Scenario: fromPlan 入口完成
- **WHEN** 用户从计划页进入背诵，完成所有卡片
- **THEN** 跳转回 `/memorize/plan`

#### Scenario: 艾宾浩斯模式完成
- **WHEN** 用户在艾宾浩斯模式完成所有到期卡片
- **THEN** 显示"🎉 今日复习已完成"弹窗

#### Scenario: 非艾宾浩斯模式完成
- **WHEN** 用户在 sequential/active 模式完成所有卡片
- **THEN** 显示"🎉 恭喜完成"弹窗，提供"重新开始"和"返回"按钮

### Requirement: filteredCards 筛选逻辑
`filteredCards` SHALL 在 weak 模式无 review 卡片时返回空数组，而非回退到全部卡片。

#### Scenario: weak 模式无卡片
- **WHEN** weak 模式下 `wrongAnswers` 为空或无对应卡片
- **THEN** 返回空数组，显示空状态文案

### Requirement: setCardStatus 模式行为
`setCardStatus` SHALL 隔离短期/长期计划的 SM-2 参数，sequential/active 的 review 标记不修改 SM-2 参数。

#### Scenario: sequential review 不降级 SM-2
- **WHEN** sequential/active 模式标记 review
- **THEN** 仅更新 `status`、`updatedAt`、`reviewCount`、`mode`、`userOverride=true`
- **AND** 不修改 `repetitions`、`interval`、`easeFactor`、`nextReviewAt`

## REMOVED Requirements

### Requirement: 轮数管理
**Reason**: 轮数概念在 SM-2 艾宾浩斯算法重构后已不再使用，相关函数成为死代码，增加维护负担。
**Migration**: 
- 移除 `db.js` 中的 `incrementCategoryRound`、`decrementCategoryRound`、`getCategoryRound`、`setCategoryRound`、`getCategoryRoundsFromLocal` 函数
- 移除 `sync.js` 中 `round_count` 字段的同步逻辑（push 和 pull）
- 移除 `Memorize.jsx` 中对轮数徽标的显示（若有）
- 移除 `StudyPlan.jsx` 中对轮数的依赖（若有）
- localStorage 中的 `category_rounds` key 不主动清理，但不再读取
