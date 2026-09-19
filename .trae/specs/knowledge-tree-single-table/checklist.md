# EggLi Flashcards - Knowledge Tree 单表重构 - 验证检查清单

## Phase 1: 云端建表与迁移

- [x] Checkpoint 1.1: `knowledge_tree` 表成功创建（验证 pg_tables）
- [x] Checkpoint 1.2: 所有字段正确定义（验证 information_schema.columns）
- [x] Checkpoint 1.3: 索引正确创建（user_id, parent_id, level, category_id, chapter_id, unit_id）
- [x] Checkpoint 1.4: RLS 策略生效，授权用户可访问
- [x] Checkpoint 1.5: 数据迁移脚本执行成功
- [x] Checkpoint 1.6: 迁移后记录数等于各旧表记录数之和
- [x] Checkpoint 1.7: 每条记录的 level 和 parent_id 正确
- [x] Checkpoint 1.8: drafts 数据正确转换为 status='draft' 的 card 节点

## Phase 2: 本地数据库升级

- [x] Checkpoint 2.1: Dexie 版本升级成功，`knowledgeTree` 表创建
- [x] Checkpoint 2.2: 旧表数据完整迁移到新表
- [x] Checkpoint 2.3: 旧表数据保持不变（兼容层）
- [x] Checkpoint 2.4: 数据模型类正确导出并可用
- [x] Checkpoint 2.5: 数据类的 fromJSON/toJSON 方法正常工作

## Phase 3: AI 分类逻辑适配

- [x] Checkpoint 3.1: AI 分类结果正确写入 `knowledgeTree` 表
- [x] Checkpoint 3.2: 层级关系（parent_id）正确建立
- [x] Checkpoint 3.3: 知识点和卡片正确关联
- [x] Checkpoint 3.4: AI prompt 更新支持知识点层级

## Phase 4: 数据同步

- [x] Checkpoint 4.1: 云端拉取 `knowledge_tree` 数据成功
- [x] Checkpoint 4.2: 本地推送 `knowledge_tree` 数据成功
- [x] Checkpoint 4.3: 双向同步无数据冲突
- [x] Checkpoint 4.4: 旧表同步仍然正常（兼容层）

## Phase 5: 前端页面

- [x] Checkpoint 5.1: 分类页面正确展示树形结构
- [x] Checkpoint 5.2: 卡片详情页面正确展示知识点关联
- [x] Checkpoint 5.3: 草稿管理功能正常
- [x] Checkpoint 5.4: 移动端适配正常
- [x] Checkpoint 5.5: 新查询函数返回正确的树形数据
- [x] Checkpoint 5.6: 旧 API 仍然可用（向后兼容）

## Phase 6: 综合验证

- [x] Checkpoint 6.1: 所有单元测试通过
- [x] Checkpoint 6.2: 分类创建功能正常
- [x] Checkpoint 6.3: AI 分类功能正常
- [x] Checkpoint 6.4: 卡片生成功能正常
- [x] Checkpoint 6.5: 数据同步功能正常
- [x] Checkpoint 6.6: 数据迁移后记录数一致
- [x] Checkpoint 6.7: 无数据丢失或损坏
- [x] Checkpoint 6.8: 所有功能保持向后兼容

## 回滚检查

- [x] Checkpoint R.1: 旧表数据完整保留
- [x] Checkpoint R.2: 旧 API 仍然可用
- [x] Checkpoint R.3: 旧同步逻辑仍然正常
- [x] Checkpoint R.4: 前端可切换回旧表模式
