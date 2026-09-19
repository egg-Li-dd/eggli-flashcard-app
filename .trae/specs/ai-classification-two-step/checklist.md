# Checklist

## 两步法核心架构
- [x] planStructure 函数实现正确，返回章节/单元结构方案
- [x] assignCards 函数实现正确，分批处理卡片分配
- [x] 结构规划 Prompt 包含粒度控制和命名规范约束
- [x] 卡片分配 Prompt 包含完整性和容量约束

## 分类结果校验与修正
- [x] validateClassificationResult 函数实现完整
- [x] 结构校验：章节数 1-10，每章节单元数 2-10
- [x] 分配校验：每单元卡片数 2-50，所有卡片已分配，无重复
- [x] 命名校验：禁止编号、时间命名，长度限制
- [x] fixClassificationResult 实现小单元合并逻辑
- [x] fixClassificationResult 实现大单元拆分逻辑
- [x] fixClassificationResult 实现未分配卡片处理

## 三种分类方式适配
- [x] classifySameCategoryReorganize 采用两步法架构
- [x] classifySameCategoryReorganize 归类完成后创建/获取 topic 记录
- [x] classifyCardsByCategoryContent 采用两步法架构
- [x] classifyCardsByCategoryContent 主题名称持久化
- [x] classifyCrossCategoryAuto 采用两步法架构
- [x] classifyCrossCategoryAuto 目标分类下创建/关联主题

## 数据库层
- [x] topics 表已创建，包含 id, name, category_id, created_at 字段
- [x] chapters 表已添加 topic_id 外键字段
- [x] db.js 已添加 getTopicsByCategory、createTopic、getTopicByName 函数
- [x] db.js 已添加 getChaptersByTopic 函数
- [x] db.js 已添加 getTopicById、updateTopic、deleteTopic 函数
- [x] 索引 idx_topics_category 已创建

## 章节检测/复习联动
- [ ] 章节检测界面支持按主题筛选章节（UI 联动可选，待后续实现）
- [ ] 章节复习界面支持按主题筛选章节（UI 联动可选，待后续实现）

## 云端同步
- [x] sync.js TABLE_SCHEMAS 包含 topics 表定义
- [x] pushToCloud 按正确顺序上传 topics（chapters 之前）
- [x] pullFromCloud 支持下载 topics

## SQL 迁移
- [x] 生成了包含 topics 表和 chapters.topic_id 字段的完整 SQL
- [x] 生成了增量 SQL 迁移脚本

## 构建验证
- [x] npm run build 通过
