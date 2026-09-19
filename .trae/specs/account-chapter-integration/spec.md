# 账号页章节联动与背诵计划入口 Spec

## Why
账号页在引入章节概念后，统计面板缺少章节相关数据展示。连续学习天数条不可交互，缺少到背诵计划的直接入口。部分统计项与章节体系脱节，需要重新审视是否有冗余或缺失。

## What Changes
- 新增"章节数"统计卡片（展示所有分类下章节总数），替换收藏数位置（收藏已在底部Tab可访问）
- 连续学习天数条改为可点击跳转到背诵计划页
- 新增"背诵计划"入口按钮（在统计面板下方）
- 到期复习卡片点击改为跳转到背诵计划（当前已跳转/memorize/plan，保持一致）
- 云端数据处理说明文字简化
- 更新界面布局.txt中账号页描述
- **BREAKING**: 无破坏性变更，仅调整UI和交互

## Impact
- Affected specs: account-page-enhance（后续优化）
- Affected code: `src/pages/Account.jsx`, `界面布局.txt`
- 不影响移动端其他功能，不改变数据表结构

## ADDED Requirements

### Requirement: 章节数统计卡片
系统 SHALL 在账号页统计面板中展示"章节数"卡片，显示所有分类下的章节总数。

#### Scenario: 显示章节总数
- **WHEN** 用户已登录且进入账号页
- **THEN** 统计面板显示"章节数"卡片，数字 = 所有分类下 chapters 表记录总数
- **AND** 卡片使用图标 📖 和主题色
- **AND** 点击卡片跳转到首页 `/`

#### Scenario: 无章节
- **WHEN** 所有分类下都没有章节
- **THEN** 卡片显示数字 0，无副标题

### Requirement: 连续学习天数条可点击跳转背诵计划
系统 SHALL 将连续学习天数条改为可点击按钮，点击后跳转到背诵计划页。

#### Scenario: 有连续学习记录
- **WHEN** `getStreakDays()` 返回 N > 0
- **THEN** 显示"🔥 已连续学习 N 天"，点击后跳转到 `/memorize/plan`
- **AND** 右侧显示箭头图标 → 暗示可点击

#### Scenario: 无学习记录
- **WHEN** `getStreakDays()` 返回 0
- **THEN** 显示"今日还未学习，去看看背诵计划 →"，点击后跳转到 `/memorize/plan`

### Requirement: 背诵计划入口按钮
系统 SHALL 在统计面板下方提供"背诵计划"入口按钮。

#### Scenario: 显示背诵计划入口
- **WHEN** 用户已登录
- **THEN** 统计面板下方显示"背诵计划"按钮，带 📋 图标和箭头 →
- **AND** 点击跳转到 `/memorize/plan`

## MODIFIED Requirements

### Requirement: 统计面板布局调整
系统 SHALL 将 2×3 统计网格中的"收藏数"替换为"章节数"。

#### Scenario: 新统计网格
- **WHEN** 用户已登录且进入账号页
- **THEN** 2×3 网格显示：总卡片数、今日已学、已掌握、到期复习、长期记忆、章节数
- **AND** 收藏数不再作为统计卡片展示（收藏功能在底部Tab和卡片操作中仍可访问）

### Requirement: 云端数据处理说明简化
系统 SHALL 简化云端数据处理按钮下方的说明文字。

#### Scenario: 简化说明
- **WHEN** 云端用户已登录
- **THEN** 云端数据处理按钮下方说明文字改为简短一行："查看与管理云端数据"
- **AND** 移除原有的详细描述

## REMOVED Requirements

### Requirement: 收藏数统计卡片
**Reason**: 收藏功能已在卡片操作（左滑菜单）和底部Tab中可访问，账号页展示收藏数统计意义有限。替换为章节数能更好地反映引入章节概念后的数据全貌。
**Migration**: 收藏功能在卡片左滑菜单和背诵页中仍完整保留，不受影响。