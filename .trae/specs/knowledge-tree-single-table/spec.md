# EggLi Flashcards - Knowledge Tree 单表重构 PRD

## Overview
- **Summary**: 将分类、主题、章节、单元、知识点、卡片、草稿等内容结构数据合并到一张 `knowledge_tree` 单表中，实现统一的树形数据管理
- **Purpose**: 简化数据结构，降低 AI 分类、数据同步、前端渲染的复杂度，支持跨层级知识点检索和复用
- **Target Users**: 所有 EggLi Flashcards 用户

## Goals
- 将 categories、topics、chapters、units、cards、drafts 合并到 `knowledge_tree` 单表
- 保留旧表作为兼容层，新表与旧表并行运行
- 支持完整的知识点层级结构：分类 → 主题 → 章节 → 单元 → 知识点 → 卡片
- 保持向后兼容性，不影响现有用户数据和功能

## Non-Goals (Out of Scope)
- 不合并行为数据（card_status、bookmarks、wrong_answers、test_*、review_history、study_plans）
- 不修改 user_profiles、user_settings 表
- 不删除旧表（至少在验证完成前保留）

## Background & Context
- 当前系统使用多张独立表存储内容结构（categories、topics、chapters、units、cards、drafts）
- AI 分类需要处理多张表的关系，逻辑复杂
- 数据同步需要同步多张表，容易出错
- 用户希望简化数据结构，实现更灵活的知识组织

## Functional Requirements
- **FR-1**: 创建 `knowledge_tree` 单表，支持 category/topic/chapter/unit/knowledge_point/card 六个层级
- **FR-2**: 编写云端 SQL 迁移脚本，将旧表数据迁移到新表
- **FR-3**: 更新本地 Dexie 数据库，新增 `knowledgeTree` 表并编写迁移逻辑
- **FR-4**: 更新 AI 分类逻辑，直接写入单表
- **FR-5**: 更新数据同步逻辑，支持新表同步
- **FR-6**: 更新前端页面，从新表读取数据并构建树结构
- **FR-7**: 将 drafts 表合并为 `status: 'draft'` 的 card 节点

## Non-Functional Requirements
- **NFR-1**: 新表查询性能不低于现有多表查询
- **NFR-2**: 数据迁移过程不丢失任何现有数据
- **NFR-3**: 同步逻辑支持新旧表并行运行
- **NFR-4**: 所有功能保持向后兼容

## Constraints
- **Technical**: Dexie 不支持外键约束，需要应用层保证数据完整性；CloudBase PostgreSQL 需要 RLS 策略
- **Business**: 不能影响移动端 app 功能
- **Dependencies**: 依赖现有 db.js、sync.js、aiService.js、ClassificationService.js

## Assumptions
- 用户已备份现有数据
- 旧表保留作为兼容层，逐步切换到新表
- 冗余字段（category_id、chapter_id、unit_id）用于简化查询

## Acceptance Criteria

### AC-1: 云端 knowledge_tree 表创建成功
- **Given**: 云端 PostgreSQL 数据库可用
- **When**: 执行建表 SQL 脚本
- **Then**: `knowledge_tree` 表成功创建，包含所有设计字段
- **Verification**: `programmatic`
- **Notes**: 需要包含 RLS 策略

### AC-2: 云端数据迁移成功
- **Given**: 旧表（categories、topics、chapters、units、cards、drafts）有数据
- **When**: 执行迁移 SQL 脚本
- **Then**: 所有旧表数据成功迁移到 `knowledge_tree` 表，数据完整无丢失
- **Verification**: `programmatic`
- **Notes**: 需要验证每条记录的字段映射正确

### AC-3: 本地 Dexie knowledgeTree 表创建成功
- **Given**: 应用启动
- **When**: Dexie 版本升级
- **Then**: `knowledgeTree` 表成功创建，数据迁移完成
- **Verification**: `programmatic`

### AC-4: AI 分类结果正确写入单表
- **Given**: AI 返回分类结果（章节+单元+知识点+卡片）
- **When**: 调用分类结果处理函数
- **Then**: 分类结果正确写入 `knowledge_tree` 表，层级关系正确
- **Verification**: `programmatic`

### AC-5: 数据同步支持新表
- **Given**: 云端和本地都有 `knowledge_tree` 数据
- **When**: 执行同步操作
- **Then**: 数据正确双向同步，无冲突
- **Verification**: `programmatic`

### AC-6: 前端页面正常显示知识树结构
- **Given**: `knowledge_tree` 表有数据
- **When**: 用户打开分类/章节/单元页面
- **Then**: 页面正确展示树形结构，所有层级数据完整
- **Verification**: `human-judgment`

### AC-7: 草稿合并功能正常
- **Given**: 有待生成的草稿数据
- **When**: 创建或更新草稿
- **Then**: 草稿作为 `status: 'draft'` 的 card 节点正确存储
- **Verification**: `programmatic`

## Open Questions
- [ ] 是否需要在前端新增知识点管理页面？
- [ ] 何时删除旧表（验证完成后）？
- [ ] 是否需要支持知识点跨单元复用？
