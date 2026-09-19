# 云端数据处理功能修复与增强

## Overview
本规格文档描述了云端数据处理功能（云端数据处理主页面、云端数据详情页面）的多项修复与增强的设计方案。

## 问题概述
1. **云端数据总数显示为 0（实际有数据）
2. **分类标题显示 `#id` 而非用户输入的名称（如"数学"、"计算机"）
3. **筛选选项文字调整与新增"已下载/未下载"选项
4. **云端数据详情页每条记录增加"下载到本地"按钮

## Purpose
修复用户在查看和管理云端数据时，总数显示不准确、分类名称显示错误、筛选功能不足、缺少从云端下载单条数据到本地的能力。

## Target Users
- 需要在移动端使用云端同步功能的用户。

## Goals
- 云端数据总条数能够真实反映数据库中实际记录数。
- 分类、单元等数据表能正确显示用户输入的业务名称（如 title/name）而非 `#id`。
- 筛选条件更加直观（"已有云端数据/云端未更新/已下载/未下载）。
- 用户可以将云端单条记录下载到本地 Dexie 数据库。

## Non-Goals (Out of Scope)
- 不修改数据同步（双向合并逻辑。
- 不修改本地数据导出功能。
- 不修改账号登录逻辑。
- 不添加云端数据批量操作（已有全量同步/上传已实现）。

## Background & Context
**关键发现（BUG 根因：
1. **snakeToCamel 函数将 `title` → `name` 映射。导致 `title` 字段（分类/单元的 title 在渲染时找不到（应为 `title`），使 CloudDataDetail 的详情页中 `TABLE_META.categories.business = ['title']` 但是从云端返回的 title 被改名为 name 后显示 `#id` 而非实际名称。

2. **getCloudTableData 函数虽然已改为 `count: 'exact'`，但 CloudData.jsx 中 `getCloudTableData(item.table, 1)` limit=1，所以 `r.value.total` 可能返回 0 或 null 导致 `cloudMap[key] = r.value.total ?? 0` 取到 0。

3. **筛选选项：当前"已更新/未更新"的语义对用户不直观，改为更强调"数据是否已存在于云端"和"本地是否已下载该条记录"更实用。

4. **详情页只有"删除"是唯一操作，缺少从云端拉取单条记录到本地数据库的能力缺失。

## Functional Requirements

### FR-1: 修复云端数据总数显示
- 在 CloudData 主页面（数据管理列表项应正确显示各表云端数据总数。
- 对 categories/units/cards/card_status/bookmarks 五张表，总数必须与 Supabase 数据库中实际记录数一致。

### FR-2: 修复分类（及所有表）名称显示正确显示业务字段
- 云端分类数据详情页中每条记录应显示用户实际的 title（name 字段，作为主要展示内容。
- units/cards 等其他表也应使用正确的字段名从云端返回值渲染。

### FR-3: 筛选选项文字调整和新增选项
- 「已更新」→「已有云端数据」：筛选出有更新时间戳不等于创建时间戳（即已编辑过的记录。
- 「未更新」→「云端未更新」：筛选出更新时间戳等于创建时间戳（即创建后未再编辑记录。
- 新增「已下载」：筛选出本地已存在相同 id 的记录（本地 Dexie 中已下载过）。
- 新增「未下载」：筛选出本地不存在的记录（云端有但本地没有）。

### FR-4: 详情页单条记录「下载到本地」按钮
- 在每条云端记录旁边添加"下载到本地"按钮。
- 点击后将该条记录写入本地 Dexie 数据库（使用 upsert 语义：存在则更新，不存在则插入）。
- 下载成功后刷新页面，显示成功提示。

## Non-Functional Requirements
- 所有修改必须兼容移动端（Capacitor + Android）与浏览器环境。
- 保持现有界面风格，按钮大小、颜色、布局风格与现有"删除"按钮一致。
- 不引入新的外部依赖。

## Constraints
- 前端：React + Capacitor（无第三方框架；无 ORM，使用项目已安装依赖中已有 Dexie、@supabase/supabase-js。
- 数据库：Dexie.js 本地，Supabase 云端。
- 字段映射：云端 snake_case，前端使用 camelCase，且 snakeToCamel 转换已存在，需要保留此函数处理映射 `title → name` 映射对 categories 和 units 的 title 字段要特殊处理。

## Assumptions
- 用户在云端详情页时，用户已登录 Supabase 账号，本地存在的本地数据结构为本地已配置。
- 本地数据库中的本地 categories 表字段为 `name` 字段（而非 title），与同步逻辑保持一致。

## Acceptance Criteria

### AC-1: 云端总数正确显示
- **Given**: 用户在「云端数据处理」页面，云端 categories/units/cards/card_status/bookmarks 至少各有 N>0 条记录
- **When**: 页面加载或刷新时
- **Then**: 每个表的"云端：N 条"正确显示 N 的真实值（非 0）
- **Verification**: `programmatic`
- **Notes**: 检查 getCloudTableData 应返回 count 字段，前端读取 r.value.total 应等于 Supabase 真实记录数。

### AC-2: 分类名称正确显示
- **Given**: 云端 categories 表中有一条记录，title 为"数学"
- **When**: 用户进入"云端分类数据"页面
- **Then**: 该条记录的标题显示"数学"明显展示，而不是 `#id` 或空白
- **Verification**: `programmatic`
- **Notes**: title 字段经 snakeToCamel 转换后应保留 `title`，不被改为 `name`，或前端应从 `name` 字段读取。

### AC-3: 筛选选项文字和新增已下载/未下载
- **Given**: 用户在云端数据详情页，点击"筛选"按钮
- **When**: 筛选面板打开
- **Then**: 显示"已有云端数据"、"云端未更新"、"已下载"、"未下载"4 个选项
- **Verification**: `programmatic`

### AC-4: 下载到本地按钮
- **Given**: 用户在云端数据详情页，任一条记录
- **When**: 点击该条记录的"下载到本地"按钮
- **Then**: 该记录被写入到本地数据库，成功后 Toast"下载成功；本地数据库中可查询到该记录
- **Verification**: `programmatic`
- **Notes**: 对 categories/units/cards/card_status/bookmarks 各表都应能写入对应表。

## Open Questions
- 无
