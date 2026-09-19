# Tasks

## Phase 1: 两步法核心架构

- [x] Task 1: 实现 planStructure 函数（结构规划）
  - [x] SubTask 1.1: 创建结构规划 Prompt 模板
  - [x] SubTask 1.2: 实现章节/单元粒度控制逻辑
  - [x] SubTask 1.3: 实现命名规范校验
  - [x] SubTask 1.4: 返回结构方案（不含卡片）

- [x] Task 2: 实现 assignCards 函数（卡片分配）
  - [x] SubTask 2.1: 创建卡片分配 Prompt 模板
  - [x] SubTask 2.2: 实现分批处理逻辑（每批 ≤ 30 张）
  - [x] SubTask 2.3: 实现分配结果合并
  - [x] SubTask 2.4: 上下文传递完整性保证

## Phase 2: 分类结果校验与修正

- [x] Task 3: 实现 validateClassificationResult 函数
  - [x] SubTask 3.1: 结构校验（章节数、单元数、命名规范）
  - [x] SubTask 3.2: 分配校验（完整性、无重复、容量范围）
  - [x] SubTask 3.3: 命名校验（禁止模式匹配）
  - [x] SubTask 3.4: 返回 { valid, errors, warnings }

- [x] Task 4: 实现 fixClassificationResult 函数（二次修正）
  - [x] SubTask 4.1: 小单元合并逻辑（< 2 张卡片）
  - [x] SubTask 4.2: 大单元拆分逻辑（> 50 张卡片）
  - [x] SubTask 4.3: 未分配卡片处理（关键词匹配）

## Phase 3: 三种分类方式适配

- [x] Task 5: 改造智能单元整理（classifySameCategoryReorganize）
  - [x] SubTask 5.1: 采用两步法架构
  - [x] SubTask 5.2: 归类完成后创建/获取 topic 记录
  - [x] SubTask 5.3: 章节创建时关联 topic_id

- [x] Task 6: 改造 AI 全权归类（classifyCardsByCategoryContent）
  - [x] SubTask 6.1: 采用两步法架构
  - [x] SubTask 6.2: 主题名称持久化
  - [x] SubTask 6.3: 章节关联 topic_id

- [x] Task 7: 改造指定分类归类（classifyCrossCategoryAuto）
  - [x] SubTask 7.1: 采用两步法架构
  - [x] SubTask 7.2: 目标分类下创建/关联主题
  - [x] SubTask 7.3: 章节关联 topic_id

## Phase 4: 数据库层扩展

- [x] Task 8: 数据库 topics 表创建
  - [x] SubTask 8.1: db.js 添加 getTopicsByCategory、createTopic、getTopicByName 函数
  - [x] SubTask 8.2: db.js 添加 getChaptersByTopic 函数
  - [x] SubTask 8.3: 更新 DB_SCHEMA 中 topics 表定义
  - [x] SubTask 8.4: chapters 表添加 topic_id 字段
  - [x] SubTask 8.5: db.js 添加 getTopicById、updateTopic、deleteTopic 函数

- [x] Task 9: 主题字段扩展（可选）
  - [x] SubTask 9.1: cards/units/chapters 表新增 theme 字段（可选功能，已标记）
  - [x] SubTask 9.2: 主题字段生成逻辑（在卡片生成时填充）
  - [x] SubTask 9.3: 主题字段在分类中的应用

## Phase 5: 章节检测/复习联动

- [ ] Task 10: 章节检测按主题筛选
  - [ ] SubTask 10.1: UnitTestPage 添加主题筛选状态
  - [ ] SubTask 10.2: 显示主题列表供用户选择
  - [ ] SubTask 10.3: 根据选中主题过滤章节列表

- [ ] Task 11: 章节复习按主题筛选
  - [ ] SubTask 11.1: 复习选择界面添加主题筛选入口
  - [ ] SubTask 11.2: 显示主题列表供用户选择
  - [ ] SubTask 11.3: 根据选中主题过滤章节列表

## Phase 6: 云端同步

- [x] Task 12: topics 表云端同步
  - [x] SubTask 12.1: sync.js TABLE_SCHEMAS 添加 topics 表定义
  - [x] SubTask 12.2: pushToCloud 添加 topics 上传逻辑（在 chapters 之前）
  - [x] SubTask 12.3: pullFromCloud 添加 topics 下载逻辑

## Phase 7: SQL 迁移

- [x] Task 13: 生成本地 SQL 迁移脚本
  - [x] SubTask 13.1: 创建 topics 表
  - [x] SubTask 13.2: chapters 表添加 topic_id 字段
  - [x] SubTask 13.3: 可选：cards/units/chapters 添加 theme 字段
  - [x] SubTask 13.4: 添加相关索引

## Task Dependencies
- Task 3、Task 4 依赖 Task 1、Task 2
- Task 5、Task 6、Task 7 依赖 Task 1、Task 2、Task 3、Task 4
- Task 8 独立
- Task 9 依赖 Task 8
- Task 10、Task 11 依赖 Task 8
- Task 12 依赖 Task 8
- Task 13 依赖 Task 8

## 完成状态
- 已完成：Phase 1-4, Phase 6-7 (Task 1-9, Task 12-13)
- 待完成：Phase 5 (Task 10-11) - 章节检测/复习按主题筛选 UI 联动（可选功能）
