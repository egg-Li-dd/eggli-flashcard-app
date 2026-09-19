# 云端数据同步修复 - Product Requirement Document

## Overview
- **Summary**: 修复云端数据处理功能中存在的 Dexie schema 主键冲突问题、字段映射不一致问题、`wrong_answers` 表缺失本地映射问题，确保云端数据的下载/上传/查看/添加全流程在移动端稳定工作。
- **Purpose**: 用户反馈"下载失败: UpgradeError Not yet support for changing primary key"、"查看云端卡片状态失败: column card_status.created_at does not exist"、`wrong_answers` 数据表在详情页无法操作，这些问题影响核心的数据同步功能。
- **Target Users**: 使用云端同步功能的所有移动应用用户。

## Goals
- Dexie IndexedDB 主键冲突问题彻底解决，升级到以 `id` 为主键的新 schema
- 所有云端 ↔ 本地字段映射统一，`title`/`name` 兼容，时间戳格式一致
- `card_status` 等早期建表缺少 `created_at` 列时的查询容错
- `wrong_answers` 表在云端数据详情页完全可操作（查看/下载/添加/删除）
- 添加分类等基础功能持续可用

## Non-Goals (Out of Scope)
- 不改变 Supabase 云端 schema 结构（只读+匹配现有字段）
- 不改变 `user_id` 认证机制
- 不重新实现 Dexie 库本身

## Background & Context
- Dexie 禁止在 version upgrade 中修改主键字段，但历史版本将 `cardStatus`/`bookmarks` 表以非 `id` 字段隐式作为主键，导致升级时报 `UpgradeError: Not yet support for changing primary key`
- 早期建立的 `card_status` 表未包含 `created_at` 列，但 getCloudTableData 始终按它排序，导致 `column card_status.created_at does not exist`
- `snakeToCamel` 曾被调用时不传 `tableName` 参数，`addCloudRecord` 使用内联正则而非统一的 `camelToSnake`，存在字段一致性风险
- `wrong_answers` 表虽然同步进 pullFromCloud，但 CloudDataDetail.jsx 的 TABLE_META/FORM_FIELDS/LOCAL_TABLE_MAP 均缺此表

## Functional Requirements
- **FR-1**: 本地 Dexie 数据库使用全新数据库名 `AIFlashCardsDB_v2`，所有表主键统一为 `&id`
- **FR-2**: 首次打开应用时自动从旧库 `AIFlashCardsDB` 迁移数据到新库（通过原生 IndexedDB 绕开 Dexie 校验）
- **FR-3**: `ensureDbReady()` 在 `AppContext.loadCategories()` 之前执行，确保任何数据库操作之前完成迁移
- **FR-4**: `snakeToCamel(item, tableName)` 统一下载字段转换：`title` → `name` 兼容映射，时间戳转为数字
- **FR-5**: `camelToSnake(item, tableName)` 统一上传字段转换：字段名 snake_case，时间戳转 ISO 字符串，仅输出 schema 定义的字段
- **FR-6**: `getCloudTableData` 仅在 schema 包含 `created_at` 时才 `.order('created_at')`，避免缺列报错
- **FR-7**: `fetchAllPages` 对 `created_at` 排序失败回退到无序重试
- **FR-8**: `addCloudRecord` 使用 `camelToSnake` 而非内联正则进行字段转换
- **FR-9**: CloudDataDetail.jsx 的 `TABLE_META`、`FORM_FIELDS`、`LOCAL_TABLE_MAP` 均包含 `wrong_answers` 映射
- **FR-10**: CloudDataDetail.jsx `handleDownload` 对 `title`→`name`、时间戳归一化

## Non-Functional Requirements
- **NFR-1**: 迁移过程对用户无感，首屏显示分类列表不应超过 3 秒（移动端）
- **NFR-2**: 所有表字段转换调用必须传 `tableName` 参数，避免未来新增字段时遗漏
- **NFR-3**: 错误信息保留原文（例如 Supabase 错误）便于定位，不做过度翻译/屏蔽

## Constraints
- **Technical**: 必须继续使用 Dexie.js 作为本地 IndexedDB 封装，不能替换为其他数据库
- **Dependencies**: Supabase 云端表结构可能因部署批次略有差异，代码必须兼容多版本 schema

## Assumptions
- 旧库 `AIFlashCardsDB` 存在且 schema 与新库不一致时才会触发迁移
- 所有新用户直接使用 `AIFlashCardsDB_v2`，无需迁移
- `categories`/`units`/`cards`/`card_status`/`bookmarks`/`wrong_answers` 是当前需要同步的全部表

## Acceptance Criteria

### AC-1: Dexie 主键冲突不再发生
- **Given**: 已安装历史版本且存在本地数据的用户
- **When**: 启动新版本并进入首页
- **Then**: 分类列表正常显示，可添加新分类，可查看已有数据，控制台无 `UpgradeError: Not yet support for changing primary key`
- **Verification**: programmatic
- **Notes**: 可通过在 localStorage 中手动设置旧库模拟

### AC-2: wrong_answers 云端数据详情页完整可用
- **Given**: 已登录云端账号，云端 `wrong_answers` 表存在数据
- **When**: 进入"云端数据 / 错题记录"详情页
- **Then**: 列表显示云端记录，可点击"下载到本地"、可添加新记录、可删除记录
- **Verification**: programmatic

### AC-3: card_status.created_at 不存在时查询容错
- **Given**: 云端 `card_status` 表早期建表未含 `created_at` 列
- **When**: 点击卡片状态"数据下载"或查看云端卡片状态列表
- **Then**: 查询成功，列表按返回顺序显示，无 `column card_status.created_at does not exist` 错误
- **Verification**: programmatic

### AC-4: 云端含 title 字段时本地正确显示为 name
- **Given**: 云端 categories/units 表某些记录含 `title` 字段
- **When**: 拉取云端并在本地显示分类/单元名称
- **Then**: 分类/单元名称正确显示而非空值
- **Verification**: human-judgment

### AC-5: 添加分类功能正常（首页无报错）
- **Given**: 用户处于首页
- **When**: 点击"添加分类"并输入名称后确认
- **Then**: 分类成功添加并显示在列表中，可编辑/删除/进入
- **Verification**: programmatic

### AC-6: 单条云端记录添加字段转换正确
- **Given**: 用户在"云端数据 / 分类"详情页
- **When**: 点击"添加"，填写名称，提交
- **Then**: 云端成功新增记录，返回值 `name`/`created_at`/`updated_at`/`user_id` 正确
- **Verification**: programmatic

## Open Questions
- [ ] 是否需要为 `wrong_answers` 表的详情页提供"下载到本地"之后的错题查看/重置功能？
- [ ] 旧库迁移完成后，是保留旧库（防止数据丢失）还是立即删除以节省存储空间？
