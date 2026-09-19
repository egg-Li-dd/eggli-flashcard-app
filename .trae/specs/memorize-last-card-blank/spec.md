# 最后一张卡片标记后空白 Bug 修复 Spec

## Why
在艾宾浩斯或weak模式下，当用户在最后一张卡片点击"已掌握"时，由于所有卡片都被移出筛选列表，`filteredCards` 变为空数组，`currentCard` 变为 null，导致卡片显示区域空白（白屏）。

用户补充："所有模式"指的是 weak 模式和艾宾浩斯模式，这两种模式会从筛选列表中移除已掌握卡片。

## What Changes
- 修改 handleMark 函数中 nextFilteredLen === 0 的处理逻辑
- 当 weak/艾宾浩斯模式中筛选列表变空时，调用 handleComplete() 执行完整的完成流程（轮数+1、卡片重置、恭喜弹窗），而不是仅 setCurrentIndex(0)

## Impact
- Affected specs: 背诵功能完成状态管理
- Affected code: Memorize.jsx 中 handleMark 函数的 nextFilteredLen === 0 分支

## ADDED Requirements

### Requirement: 最后一张卡片完成后正确显示完成状态（weak/艾宾浩斯模式）
当筛选列表中所有卡片都已完成（nextFilteredLen === 0）时 SHALL 调用 handleComplete()。

#### Scenario: 艾宾浩斯模式下最后一张卡片标记为已掌握
- **WHEN** 用户在艾宾浩斯模式下，最后一张到期卡片点击"已掌握"
- **THEN** 系统自动执行 handleComplete 流程

#### Scenario: weak模式下最后一张薄弱卡片标记为已掌握
- **WHEN** 用户在weak模式下，最后一张薄弱卡片点击"已掌握"
- **THEN** 系统自动执行 handleComplete 流程

#### Scenario: 普通模式下最后一张卡片标记为已掌握
- **WHEN** 用户在普通背诵模式下（filteredCards = allCards），最后一张卡片标记为已掌握
- **THEN** 卡片停留在当前状态（用户需手动点击"完成"按钮触发完成流程）
- **NOTE**: 普通模式不会触发 nextFilteredLen === 0，因为 filteredCards 始终 = allCards

## MODIFIED Requirements

### Requirement: handleMark 完成逻辑
handleMark 函数中 nextFilteredLen === 0 的分支 SHALL 调用 handleComplete()。