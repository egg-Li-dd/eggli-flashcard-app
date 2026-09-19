# 艾宾浩斯模式循环复习 Spec

## Why

用户在艾宾浩斯模式下背诵到最后一张到期卡片时，若仍有未掌握卡片（标记"未掌握"后卡片仍到期），需要多次点击"上一页"才能回到第一张继续复习，体验不佳。需要在最后一张卡片标记后，通过弹窗提示让用户快速选择"重新复习"或"结束复习"。

## What Changes

* 修改 `Memorize.jsx` 的 `handleMark` 函数：当用户在最后一张到期卡片标记后，且 `nextFilteredLen > 0`（还有到期卡片）时，显示"重新复习"提示弹窗

* 新增 `showLoopBackModal` 状态控制弹窗显示

* 新增 `loopBackRemainingCount` 状态记录剩余未掌握卡片数量

* 实现"重新复习"弹窗：显示剩余未掌握卡片数量，提供"重新复习"/"结束复习"两个按钮

* "重新复习"按钮：跳回第一张到期卡片（`setCurrentIndex(0)`）

* "结束复习"按钮：关闭弹窗，显示现有的"🎉 今日复习已完成"完成弹窗

* 复用现有 `modal-center` 动画体系

## Impact

* Affected code: `src/pages/Memorize.jsx`

* 不影响其他模式（sequential/active/weak）的完成逻辑

* 不影响从计划页来的（`fromPlan`）完成逻辑

## ADDED Requirements

### Requirement: 艾宾浩斯模式循环复习提示

当用户在艾宾浩斯模式下标记最后一张到期卡片后，若仍有到期卡片（未掌握），系统 SHALL 显示"重新复习"提示弹窗。

#### Scenario: 最后一张卡片标记后仍有到期卡片

* **WHEN** 用户在艾宾浩斯模式下标记最后一张到期卡片（`currentIndex >= filteredCards.length - 1`）

* **AND** 标记后 `nextFilteredLen > 0`（仍有到期卡片）

* **THEN** 显示"重新复习"弹窗，显示剩余未掌握卡片数量

* **AND** 弹窗包含"重新复习"和"结束复习"两个按钮

#### Scenario: 用户点击"重新复习"

* **WHEN** 用户在"重新复习"弹窗中点击"重新复习"按钮

* **THEN** 关闭弹窗

* **AND** `setCurrentIndex(0)` 跳回第一张到期卡片

* **AND** 翻转状态重置为未翻转

#### Scenario: 用户点击"结束复习"

* **WHEN** 用户在"重新复习"弹窗中点击"结束复习"按钮

* **THEN** 关闭"重新复习"弹窗

* **AND** 显示现有的"🎉 今日复习已完成"完成弹窗

#### Scenario: 所有到期卡片已掌握

* **WHEN** 用户标记最后一张到期卡片后 `nextFilteredLen === 0`（所有到期卡片已掌握）

* **THEN** 直接显示现有的"🎉 今日复习已完成"完成弹窗（不显示"重新复习"弹窗）

## MODIFIED Requirements

### Requirement: handleMark 卡片切换逻辑

原有的卡片切换逻辑在最后一张卡片标记后，若 `nextFilteredLen > 0`，会停留在最后一张（`setCurrentIndex(nextFilteredLen - 1)`）。修改为：在艾宾浩斯模式下，此时显示"重新复习"弹窗，不自动停留在最后一张。

### Requirement: 完成弹窗触发条件

原有的完成弹窗在 `nextFilteredLen === 0` 时触发。修改为：

* 艾宾浩斯模式 + `nextFilteredLen === 0` → 直接显示完成弹窗

* 艾宾浩斯模式 + `nextFilteredLen > 0` + 最后一张卡片 → 显示"重新复习"弹窗，用户选择"结束复习"后再显示完成弹窗

