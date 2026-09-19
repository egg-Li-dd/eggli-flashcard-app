# 账号页美化与章节/背诵计划联动 Spec

## Why
账号页（Account.jsx）在背诵计划（study-plan-page）开发时规划了统计增强（FR-12），但从未实现。当前统计面板存在冗余统计项（"学习中"、"待开始"），且缺少与章节体系和艾宾浩斯背诵计划的联动。需要美化 UI、替换冗余统计、接入章节/背诵计划数据。

## What Changes
- 替换 2×3 统计网格中冗余的两项："学习中"→"到期复习"，"待开始"→"长期记忆"
- 新增"连续学习天数"条（在统计网格下方）
- 新增"/stats/longterm"长期记忆卡片列表页
- 移除冗余的进度环形图（与"已掌握"统计重复）
- 优化统计卡片视觉效果（图标 + 颜色标签 + 副标题）
- 美化用户信息卡片的排版
- 云端数据处理卡片简化（合并为更紧凑的入口）
- 数据管理区增加图标和间距优化

## Impact
- Affected specs: study-plan-page (FR-12 落实)
- Affected code: `src/pages/Account.jsx`, `src/App.jsx` (新增路由), `src/pages/StatsLongTerm.jsx` (新增), `src/services/db.js` (已有函数，无需修改)
- 不影响移动端其他功能，不改变数据表结构

## ADDED Requirements

### Requirement: 到期复习统计卡片
系统 SHALL 在账号页统计面板中展示"到期复习"卡片，显示艾宾浩斯模式下今日需复习的卡片数量。

#### Scenario: 显示到期卡片数
- **WHEN** 用户已登录且进入账号页
- **THEN** 统计面板显示"到期复习"卡片，数字 = `getDueCardsCount()` 返回值
- **AND** 点击卡片跳转到 `/memorize/plan`

#### Scenario: 无到期卡片
- **WHEN** `getDueCardsCount()` 返回 0
- **THEN** 卡片显示数字 0，副标题显示"暂无到期卡片"

### Requirement: 长期记忆统计卡片
系统 SHALL 在账号页统计面板中展示"长期记忆"卡片，显示已建立长期记忆（repetitions >= 5）的卡片数量。

#### Scenario: 显示长期记忆卡片数
- **WHEN** 用户已登录且进入账号页
- **THEN** 统计面板显示"长期记忆"卡片，数字 = `getLongTermCardsCount()` 返回值
- **AND** 点击卡片跳转到 `/stats/longterm`

### Requirement: 连续学习天数条
系统 SHALL 在统计网格下方显示连续学习天数。

#### Scenario: 有连续学习记录
- **WHEN** `getStreakDays()` 返回 N > 0
- **THEN** 显示"已连续学习 N 天"（带火焰图标），背景色为暖色调

#### Scenario: 无学习记录
- **WHEN** `getStreakDays()` 返回 0
- **THEN** 显示"今日还未学习哦"（灰色文字，无图标）

### Requirement: 长期记忆卡片列表页
系统 SHALL 提供 `/stats/longterm` 页面展示所有长期记忆卡片。

#### Scenario: 查看长期记忆卡片
- **WHEN** 用户导航到 `/stats/longterm`
- **THEN** 页面显示所有 `repetitions >= 5` 的卡片列表
- **AND** 每条显示：卡片问题(front)、答案(back)摘要、所属分类名、当前复习间隔(interval)
- **AND** 顶部显示标题"长期记忆卡片"和总数

## MODIFIED Requirements

### Requirement: 账号页统计面板布局
系统 SHALL 将 2×3 统计网格中的"学习中"替换为"到期复习"，"待开始"替换为"长期记忆"。

#### Scenario: 新统计网格
- **WHEN** 用户已登录且进入账号页
- **THEN** 2×3 网格显示：总卡片数、今日已学、已掌握、到期复习、长期记忆、收藏数
- **AND** 每张卡片包含图标、数字、标签、副标题（如有）

### Requirement: 移除冗余进度环形图
系统 SHALL 移除统计面板中与"已掌握"统计重复的进度环形图。

#### Scenario: 统计面板简洁化
- **WHEN** 用户已登录且进入账号页
- **THEN** 统计面板不再显示"学习进度"进度环形图（已掌握/总数）
- **AND** "已掌握"统计卡片已覆盖该信息

### Requirement: 统计卡片视觉美化
系统 SHALL 为每张统计卡片增加图标和颜色标识。

#### Scenario: 卡片视觉
- **WHEN** 统计卡片渲染
- **THEN** 每张卡片包含：顶部图标（emoji 或 SVG）+ 大号数字 + 标签文字 + 可选副标题
- **AND** 卡片使用圆角、投影、统一间距
- **AND** 可点击卡片有 hover/active 态反馈

### Requirement: 用户信息卡片美化
系统 SHALL 优化用户信息卡片的排版和视觉。

#### Scenario: 用户信息卡片
- **WHEN** 用户已登录
- **THEN** 头像 + 昵称 + 登录模式标签 + 标签（tags）排版更紧凑
- **AND** "点击编辑资料"提示更明显

### Requirement: 云端数据处理卡片简化
系统 SHALL 简化云端数据处理入口卡片为更紧凑的按钮样式。

#### Scenario: 云端用户
- **WHEN** 云端用户已登录
- **THEN** 云端数据处理入口显示为紧凑的按钮行（而非独立卡片），包含图标和简短描述

## REMOVED Requirements

### Requirement: "学习中"统计卡片
**Reason**: "学习中"状态定义模糊（cardStatus.status === 'review'），与"待开始"、"已掌握"重叠，用户难以理解其含义。
**Migration**: 替换为"到期复习"，更直观且与背诵计划联动。

### Requirement: "待开始"统计卡片
**Reason**: "待开始"（newCards）可通过"总卡片数 - 已掌握"推算，单独展示意义不大。
**Migration**: 替换为"长期记忆"，展示用户学习成果的深度。

### Requirement: 进度环形图
**Reason**: 与"已掌握"统计卡片功能重复（都表达"已掌握/总数"），且占用额外空间。
**Migration**: 直接从统计面板移除，信息由"已掌握"卡片承载。