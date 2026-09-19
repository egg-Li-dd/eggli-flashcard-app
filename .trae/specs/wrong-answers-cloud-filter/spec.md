# 错题上传与云端未更新筛选修复 - 产品需求文档

## Overview
- **Summary**: 修复两个问题：(1) 错题记录（wrong_answers）无法上传到云端；(2) 云端数据详情页的"云端未更新"筛选条件反转，应显示本地有但云端没有的数据。
- **Purpose**: 确保用户能正常上传错题记录到云端，并正确筛选出本地未同步的数据。
- **Target Users**: 使用云端同步功能的APP用户

## Goals
- 修复错题记录数据上传到云端的功能
- 修复"云端未更新"筛选逻辑，显示本地数据库有但云端数据库没有的数据
- 确保筛选后的列表操作按钮与数据来源匹配

## Non-Goals (Out of Scope)
- 不修改其他数据表的上传/下载逻辑
- 不改变云端数据管理页的整体布局
- 不新增数据表

## Background & Context
### 错题记录上传
- 本地 IndexedDB 表：`wrongAnswers`（字段：id, cardId, categoryId, count, lastWrongAt）
- 云端 PostgreSQL 表：`wrong_answers`（字段：id, card_id, category_id, user_id, count, last_wrong_at, created_at）
- 问题：云端表缺少 `updated_at` 列，但触发器 `wrong_answers_update_modtime` 尝试更新该列，导致 UPDATE 操作失败
- TABLE_SCHEMAS 中 `autoAddUpdatedAt: false` 正确，但表结构缺失 `updated_at`

### 云端未更新筛选
- 当前逻辑（L161-163）：`!ids.includes(item.id)` — 显示云端有但本地没有的数据
- 期望逻辑：显示本地有但云端没有的数据
- 影响：CloudDataDetail.jsx 的 filterItems 函数和可见项渲染

## Functional Requirements
- **FR-1**: 云端 `wrong_answers` 表添加 `updated_at` 列
- **FR-2**: sync.js 的 TABLE_SCHEMAS 中 `wrong_answers` 设为 `autoAddUpdatedAt: true`
- **FR-3**: "云端未更新"筛选应显示本地数据库中存在但云端数据库中不存在的记录
- **FR-4**: 当"云端未更新"筛选激活时，列表数据的操作按钮应从"下载到本地"改为"上传到云端"

## Non-Functional Requirements
- **NFR-1**: 修改后的界面按钮应保持移动端适配，可见可用
- **NFR-2**: SQL 变更应兼容已存在的表结构（使用 IF NOT EXISTS）

## Constraints
- **Technical**: 需要修改 SQL 和前端代码
- **Dependencies**: 依赖 Supabase PostgreSQL 数据库

## Assumptions
- 用户已登录云端账号
- 本地 IndexedDB 和云端数据库有数据可对比
- wrong_answers 表已在云端存在

## Acceptance Criteria

### AC-1: 错题记录可上传
- **Given**: 本地有错题记录数据
- **When**: 用户点击错题记录的"数据上传"按钮
- **Then**: 数据成功上传到云端 wrong_answers 表
- **Verification**: `human-judgment`

### AC-2: 云端未更新筛选正确
- **Given**: 用户在云端数据详情页，筛选条件设置为"云端未更新"
- **When**: 用户应用筛选条件
- **Then**: 列表显示本地数据库中存在但云端数据库中不存在的记录
- **Verification**: `human-judgment`

### AC-3: 筛选后操作按钮匹配
- **Given**: "云端未更新"筛选激活，显示的是本地数据
- **When**: 用户查看列表中的操作按钮
- **Then**: 按钮应为"上传到云端"而非"下载到本地"
- **Verification**: `human-judgment`

## Open Questions
- [ ] 是否需要添加"同步状态"提示图标，直观显示每条记录是本地独有还是云端独有？