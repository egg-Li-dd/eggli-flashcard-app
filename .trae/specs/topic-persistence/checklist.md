# Checklist

## 数据库层
- [x] topics 表已创建，包含 id, name, category_id, created_at 字段
- [x] chapters 表已添加 topic_id 外键字段
- [x] db.js 已添加 getTopicsByCategory、createTopic、getTopicByName 函数
- [x] db.js 已添加 getChaptersByTopic 函数
- [x] 索引 idx_topics_category 已创建

## 归类流程
- [x] classifySameCategoryReorganize 归类完成后创建/获取 topic 记录
- [x] classifyCardsByCategoryContent 归类完成后创建/获取 topic 记录
- [x] classifyCrossCategoryAuto 归类完成后创建/获取 topic 记录
- [x] 章节创建时正确关联 topic_id

## 章节检测/复习联动
- [x] 章节检测界面支持按主题筛选章节
- [x] 章节复习界面支持按主题筛选章节

## 云端同步
- [x] sync.js TABLE_SCHEMAS 包含 topics 表定义
- [x] pushToCloud 按正确顺序上传 topics（chapters 之前）
- [x] pullFromCloud 支持下载 topics

## SQL 迁移
- [x] 生成了包含 topics 表和 chapters.topic_id 字段的完整 SQL
- [x] 生成了增量 SQL 迁移脚本

## 构建验证
- [x] npm run build 通过
