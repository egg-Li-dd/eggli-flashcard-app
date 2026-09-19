# 用户头像和昵称云端同步 - 实现计划

## [ ] Task 1: 修复 sync.js 字段映射
- **Priority**: P1
- **Depends On**: None
- **Description**:
  - 在 `src/services/sync.js` 的 `FIELD_MAP_CAMEL_TO_SNAKE` 对象中添加用户资料相关字段映射：
    - `avatarUrl: 'avatar_url'`
    - `avatarType: 'avatar_type'`
  - 目的：确保未来扩展 CloudData 同步时，字段转换正确
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement`: 检查 FIELD_MAP_CAMEL_TO_SNAKE 包含新字段
  - `programmatic`: 验证 `camelToSnake({ avatarUrl: 'xxx', avatarType: 'preset' }, 'user_profiles')` 返回正确的 snake_case 字段

## [ ] Task 2: 验证云端 SQL 表结构
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 检查 `我在SQL editor执行的命令.txt` 中 `user_profiles` 表的定义
  - 确认以下内容：
    - 表名：`public.user_profiles`
    - 主键：`id` (text, PRIMARY KEY, default gen_random_uuid())
    - 字段：`user_id` (text, UNIQUE), `nickname` (text), `avatar_url` (text), `avatar_type` (text), `tags` (text[])
    - 时间戳：`created_at` (timestamptz), `updated_at` (timestamptz)
    - RLS 策略：启用，SELECT/INSERT/UPDATE/DELETE 均限制为 `auth.uid() = user_id::uuid`
    - 索引：`user_profiles_user_id_idx`
    - 触发器：`user_profiles_update_modtime` 自动更新 `updated_at`
  - 如有缺失，更新 SQL 文件
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `human-judgement`: 验证 SQL 中 user_profiles 表定义完整

## [ ] Task 3: 检查 userProfile.js 云端读写逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 检查 `src/services/userProfile.js` 中两个关键函数：
    1. `getUserProfile()`: 从云端查询，无记录时返回默认值
    2. `saveUserProfile()`: 使用 upsert 将资料写入云端，同时写入本地缓存
  - 确认云端查询使用 `eq('user_id', user.id)` 正确匹配
  - 确认 upsert 使用 `onConflict: 'user_id'` 正确处理
  - 确认字段名正确（nickname, avatar_url, avatar_type, tags）
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4
- **Test Requirements**:
  - `human-judgement`: 代码检查，确认字段名与云端表一致

## [ ] Task 4: 更新文档分布记录
- **Priority**: P2
- **Depends On**: Task 1-3
- **Description**:
  - 在 `文档分布.txt` 中添加用户资料相关的文件和函数定位：
    - userProfile.js (服务层)
    - ProfileEditDialog.jsx (编辑对话框组件)
    - Account.jsx (资料显示)
    - sync.js FIELD_MAP_CAMEL_TO_SNAKE (字段映射)
- **Acceptance Criteria Addressed**: 维护任务
- **Test Requirements**:
  - `human-judgement`: 验证文档更新
