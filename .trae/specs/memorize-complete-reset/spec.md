# 背诵完成即时重置 Spec

## Why
用户反馈：在背诵功能中，当所有卡片都标记为"已掌握"后，点击"完成"按钮时，轮数加一、进度显示重置、卡片状态重置这三个操作没有立即执行，而是需要下次加载卡片时才触发。用户期望点击完成后立即看到效果。

## What Changes
- 修改 `handleComplete` 函数，在点击完成时立即执行卡片状态重置
- 进度显示立即重置为"第 1 / N 张"
- 轮数立即加一并显示

## Impact
- Affected specs: 背诵功能轮次管理
- Affected code: `Memorize.jsx` 中的 `handleComplete` 函数

## ADDED Requirements

### Requirement: 完成按钮即时重置
点击"完成"按钮时 SHALL 立即执行以下操作：
1. 轮数加一（调用 `incrementCategoryRound`）
2. 所有已掌握卡片状态重置为"待复习"（review）
3. 进度显示重置为"第 1 / N 张"
4. 显示恭喜弹窗

#### Scenario: 全部卡片已掌握后点击完成
- **WHEN** 用户将分类下所有卡片都标记为"已掌握"
- **AND** 用户在最后一张卡片点击"完成"按钮
- **THEN** 系统立即执行：
  - 轮数从 N 变为 N+1
  - 所有卡片状态从 'mastered' 变为 'review'
  - 进度显示变为"第 1 / N 张"
  - 显示恭喜弹窗

#### Scenario: 点击完成后继续背诵
- **WHEN** 用户点击完成并关闭恭喜弹窗
- **AND** 用户选择继续背诵同一分类
- **THEN** 所有卡片显示为"待复习"状态，可重新开始背诵

## MODIFIED Requirements

### Requirement: handleComplete 函数
`handleComplete` 函数 SHALL 在增加轮数后立即重置卡片状态。

**修改点**：
- 调用 `incrementCategoryRound` 后，立即调用数据库修改将所有 'mastered' 卡片改为 'review'
- 更新前端状态 `cardStatuses`，将所有卡片设为 'review'
- 重置 `currentIndex` 为 0
- 刷新进度显示