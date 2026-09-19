# Tasks

## Phase 1: 数据库层

- [ ] Task 1: 数据库 topics 表创建
  - [ ] SubTask 1.1: db.js 添加 getTopicsByCategory、createTopic、getTopicByName 等函数
  - [ ] SubTask 1.2: db.js 添加 getChaptersByTopic 函数
  - [ ] SubTask 1.3: 更新 DB_SCHEMA 中 topics 表定义

## Phase 2: 归类流程改造

- [ ] Task 2: 归类结果处理改造
  - [ ] SubTask 2.1: 修改 classifySameCategoryReorganize 归类完成后创建/获取 topic 记录
  - [ ] SubTask 2.2: 修改 classifyCardsByCategoryContent 归类完成后创建/获取 topic 记录
  - [ ] SubTask 2.3: 修改 classifyCrossCategoryAuto 归类完成后创建/获取 topic 记录
  - [ ] SubTask 2.4: 确保章节创建时关联 topic_id

## Phase 3: 章节检测/复习联动

- [ ] Task 3: 章节检测按主题筛选
  - [ ] SubTask 3.1: UnitTestPage 添加主题筛选状态
  - [ ] SubTask 3.2: 显示主题列表供用户选择
  - [ ] SubTask 3.3: 根据选中主题过滤章节列表

- [ ] Task 4: 章节复习按主题筛选
  - [ ] SubTask 4.1: 在复习选择界面添加主题筛选入口
  - [ ] SubTask 4.2: 显示主题列表供用户选择
  - [ ] SubTask 4.3: 根据选中主题过滤章节列表

## Phase 4: 云端同步

- [ ] Task 5: topics 表云端同步
  - [ ] SubTask 5.1: sync.js TABLE_SCHEMAS 添加 topics 表定义
  - [ ] SubTask 5.2: pushToCloud 添加 topics 上传逻辑（在 chapters 之前）
  - [ ] SubTask 5.3: pullFromCloud 添加 topics 下载逻辑

## Phase 5: SQL 迁移

- [ ] Task 6: 生成本地 SQL 迁移脚本
  - [ ] SubTask 6.1: 创建 topics 表
  - [ ] SubTask 6.2: chapters 表添加 topic_id 字段
  - [ ] SubTask 6.3: 添加相关索引

## Task Dependencies
- Task 2 依赖 Task 1
- Task 3、Task 4 依赖 Task 1、Task 2
- Task 5 依赖 Task 1
- Task 6 依赖 Task 1
