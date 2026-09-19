# 用户头像和昵称云端同步 - 产品需求文档

## Overview
- **Summary**: 检查和优化用户自定义头像（预设 emoji 和自定义图片）和昵称的云端存储与下载功能，确保用户在不同设备间登录时能正确同步个人资料。
- **Purpose**: 确保用户资料（昵称、头像、标签）能正确保存到云端数据库，并在用户登录时从云端正确下载到本地，在不同设备间保持同步。
- **Target Users**: 使用云端账号登录的所有用户

## Goals
- 确保用户昵称、头像、标签能正确保存到 Supabase `user_profiles` 表
- 确保用户登录后能正确从云端拉取个人资料
- 修复字段映射问题，确保 camelCase ↔ snake_case 转换正确
- 确保云端数据管理页（CloudData）正确识别用户资料表

## Non-Goals (Out of Scope)
- 不修改用户资料的本地存储方式（继续使用 localStorage）
- 不改变用户资料编辑对话框的 UI 设计
- 不新增额外的用户资料字段

## Background & Context
- 当前系统通过 `userProfile.js` 服务实现用户资料的云端读写
- 云端表 `user_profiles` 已在 SQL 中定义（包含 RLS 策略、索引、触发器）
- 用户资料编辑功能通过 `ProfileEditDialog.jsx` 实现
- 本地存储使用 localStorage（JSON 格式），**未使用 IndexedDB**
- 主要字段：`nickname`（昵称）、`avatar_url`（头像 URL 或 base64）、`avatar_type`（preset/custom）、`tags`（标签数组）

## Functional Requirements
- **FR-1**: 用户编辑昵称、头像、标签后，数据应正确写入云端 `user_profiles` 表
- **FR-2**: 用户登录后，`loadUserProfile()` 应从云端读取资料并更新显示
- **FR-3**: `sync.js` 中的字段映射应包含 `avatarUrl` → `avatar_url` 和 `avatarType` → `avatar_type`
- **FR-4**: 云端数据管理页应可查询/显示用户资料（但不允许一键覆盖上传）

## Non-Functional Requirements
- **NFR-1**: 头像（自定义图片，最大 2MB）应能正确以 base64 形式存储和读取
- **NFR-2**: 所有同步操作应有适当的错误处理和用户提示
- **NFR-3**: RLS 策略确保用户只能访问自己的资料

## Constraints
- **Technical**: 用户资料使用 `supabase` 云端数据库，本地使用 localStorage
- **Dependencies**: 依赖 `userProfile.js` 的 `getUserProfile()` 和 `saveUserProfile()` 函数
- **Database**: PostgreSQL + Supabase, 使用 `public.user_profiles` 表

## Assumptions
- 用户已登录有效云端账号（非本地模式）
- 云端数据库已执行 SQL 创建 `user_profiles` 表
- Supabase 服务正常运行且网络连接良好

## Acceptance Criteria

### AC-1: 字段映射修复
- **Given**: 用户资料中有 `avatarUrl` 和 `avatarType` 字段
- **When**: 用户资料通过通用同步机制转换（如未来扩展 CloudData 同步）
- **Then**: 字段应正确映射为 `avatar_url` 和 `avatar_type`
- **Verification**: `human-judgment`
- **Notes**: 当前 userProfile.js 手动转换，不依赖 FIELD_MAP_CAMEL_TO_SNAKE

### AC-2: 昵称和标签云端存储
- **Given**: 用户在 ProfileEditDialog 中修改昵称和标签并保存
- **When**: 保存操作完成
- **Then**: 云端 `user_profiles` 表对应记录的 `nickname` 和 `tags` 字段应被更新
- **Verification**: `human-judgment`

### AC-3: 自定义头像云端存储
- **Given**: 用户上传自定义图片作为头像并保存
- **When**: 保存操作完成
- **Then**: 图片应转换为 base64 并存储在 `avatar_url` 字段，`avatar_type` 设为 `custom`
- **Verification**: `human-judgment`

### AC-4: 云端资料下载
- **Given**: 用户在新设备登录同一账号（云端有资料记录）
- **When**: Account 页面加载并调用 `loadUserProfile()`
- **Then**: 用户昵称和头像应从云端拉取并正确显示
- **Verification**: `human-judgment`

### AC-5: 错误处理与降级
- **Given**: 云端查询失败（网络错误或权限问题）
- **When**: 系统尝试加载用户资料
- **Then**: 应降级使用本地 localStorage 中的资料，并静默记录错误
- **Verification**: `human-judgment`

### AC-6: RLS 策略正确
- **Given**: 云端数据库已执行完整 SQL 脚本
- **When**: 普通用户查询自己的资料，或尝试查询他人资料
- **Then**: 用户只能看到自己的资料记录，无法访问他人资料
- **Verification**: `human-judgment`
- **Notes**: SQL 中 `user_id` 存储为 text 类型，RLS 策略使用 `user_id::uuid` 转换

## Open Questions
- [ ] 是否需要在 CloudData 页面中添加 user_profiles 的显示和管理？
- [ ] 是否需要在本地 IndexedDB 中增加 userProfiles 表以统一存储方式？
