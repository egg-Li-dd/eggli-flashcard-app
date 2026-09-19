# 主题持久化与章节联动 Spec

## Why
当前主题（topic）仅作为 AI 归类过程中的临时约束，不与卡片持久绑定。用户希望：
- 将主题与章节绑定并存储到数据库
- 支持按主题筛选卡片、按主题复习等后续功能
- 与智能单元整理、AI 全权归类、指定分类归类三个功能联动
- 与章节检测、章节复习功能联系

## What Changes
- 新增独立的 `topics` 表存储主题
- `chapters` 表新增 `topic_id` 外键字段，章节与主题绑定
- 归类完成后将临时主题持久化为正式主题记录
- 章节检测、复习支持按主题筛选

## Impact
- Affected code: `src/services/db.js`, `src/services/aiService.js`
- Affected features: 智能单元整理、AI 全权归类、指定分类归类、章节检测、章节复习

## 数据库设计

### topics 表
```sql
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
CREATE INDEX idx_topics_category ON topics(category_id);
```

### chapters 表变更
```sql
ALTER TABLE chapters ADD COLUMN topic_id TEXT REFERENCES topics(id);
```

### 主题生命周期
| 阶段 | 状态 | 存储位置 |
|------|------|----------|
| 聚类生成 | 临时对象 | 内存 |
| 用户确认 | 临时对象 | React state |
| 归类约束 | 临时对象 | AI Prompt |
| 归类完成 | **持久化** | topics 表 + chapters.topic_id |

## 功能联动设计

### 1. 智能单元整理（classifySameCategoryReorganize）
- **现状**：AI 根据卡片内容聚类生成临时主题，用户确认后创建章节/单元
- **变更**：归类完成后，AI 生成的主题名称持久化为 `topics` 记录，相关章节通过 `topic_id` 关联

### 2. AI 全权归类（classifyCardsByCategoryContent）
- **现状**：AI 自由判断章节/单元创建
- **变更**：AI 生成的主题名称持久化，章节关联对应主题

### 3. 指定分类归类（classifyCrossCategoryAuto）
- **现状**：将卡片从源分类归类到目标分类
- **变更**：在目标分类下创建/关联主题和章节

### 4. 章节检测联动
- **现状**：按章节进行检测
- **变更**：检测选择界面支持按主题筛选章节

### 5. 章节复习联动
- **现状**：复习某章节下的所有卡片
- **变更**：复习选择界面支持按主题筛选章节

## 数据流

```
临时主题聚类 (AI)
    ↓
用户确认主题名称
    ↓
classifyCardsByCategoryContent / classifySameCategoryReorganize
    ↓
归类完成 → 创建/获取 topics 记录
    ↓
创建章节时关联 topic_id
    ↓
入库：chapters (topic_id) + units + cards
```

## ADDED Requirements

### Requirement: 主题持久化
系统 SHALL 在归类完成后将确认的主题名称持久化到 `topics` 表。

#### Scenario: 归类完成创建主题
- **WHEN** AI 归类完成，用户确认归类结果
- **THEN** 系统 SHALL 为每个唯一的主题名称创建 `topics` 记录
- **AND** 创建章节时 SHALL 设置 `topic_id` 关联对应主题

### Requirement: 章节-主题绑定
系统 SHALL 支持章节通过 `topic_id` 字段关联主题。

#### Scenario: 按主题查询章节
- **WHEN** 用户需要查询某主题下的所有章节
- **THEN** 系统 SHALL 通过 `chapters.topic_id = topics.id` 关联查询

### Requirement: 主题筛选（检测/复习）
系统 SHALL 在章节检测和复习选择界面支持按主题筛选章节。

#### Scenario: 按主题筛选章节
- **WHEN** 用户在检测/复习界面选择"按主题筛选"
- **THEN** 系统 SHALL 显示主题列表，用户选择后显示该主题下的章节

## 云端同步

### topics 表同步
- 上传：`topics` 表需要上传到云端
- 下载：下载时按 `category_id` 关联下载对应主题

### chapters.topic_id 同步
- 上传：`chapters` 表包含 `topic_id` 字段
- 下载：下载章节时关联对应主题
