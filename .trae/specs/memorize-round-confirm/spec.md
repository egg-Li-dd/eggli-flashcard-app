# 复习完成轮次确认提示 Spec

## Why
当首次完成后进行复习时，用户在最后一张卡片点击"完成"或"已掌握"后，系统会直接触发下一轮（所有卡片重置），但用户可能希望先确认是否开始下一轮复习，而不是系统自动完成。

## What Changes
- 在 handleMark 中，当标记最后一张卡片后触发完成时，先弹出确认提示
- 提示内容："本轮已复习完成，是否开始下一轮？"
- 用户选择"是"则执行下一轮（轮数+1、卡片重置）
- 用户选择"否"则停留在当前卡片状态

## Impact
- Affected specs: 背诵功能完成流程
- Affected code: Memorize.jsx 中 handleMark 函数的 nextFilteredLen === 0 分支

## ADDED Requirements

### Requirement: 复习完成轮次确认提示
当完成最后一张卡片时 SHALL 弹出确认提示，而不是自动执行下一轮。

#### Scenario: 复习完最后一张卡片
- **WHEN** 用户在复习过程中，标记最后一张卡片为"已掌握"或"待复习"
- **AND** 这将触发本轮复习完成
- **THEN** 系统弹出确认提示："本轮已复习完成，是否开始下一轮？"
- **AND** 用户可选择：
  - "开始下一轮" → 执行下一轮（轮数+1、卡片重置）
  - "继续复习" → 停留在当前卡片，重新开始复习（不重置）

#### Scenario: 用户选择开始下一轮
- **WHEN** 用户在确认提示中点击"开始下一轮"
- **THEN** 系统执行 handleComplete 流程：
  - 轮数加一
  - 所有卡片重置为待复习状态
  - 进度显示重置为"第 1 / N 张"
  - 显示恭喜弹窗

#### Scenario: 用户选择继续复习
- **WHEN** 用户在确认提示中点击"继续复习"
- **THEN** 系统：
  - 不增加轮数
  - 不重置卡片状态
  - 重新加载卡片列表，显示所有待复习卡片

## MODIFIED Requirements

### Requirement: handleMark 完成逻辑
handleMark 函数中 nextFilteredLen === 0 的分支 SHALL 弹出确认提示，而非直接调用 handleComplete()。

**修改点**：
- 使用 window.confirm 或自定义确认弹窗替代直接调用 handleComplete()
- 确认后根据用户选择决定是否执行下一轮