# EggLi Flashcards - Knowledge Tree 单表重构 - 实施计划

## [x] Task 1: 云端 knowledge_tree 表创建
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 创建 `knowledge_tree` 表的完整 SQL 建表脚本
  - 包含所有设计字段（通用字段、各层级专用字段）
  - 添加必要的索引（user_id, parent_id, level, category_id, chapter_id, unit_id）
  - 添加 RLS 行级安全策略
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 执行建表脚本后，查询 `pg_tables` 确认 `knowledge_tree` 表存在
  - `programmatic` TR-1.2: 查询 `information_schema.columns` 确认所有字段存在
  - `programmatic` TR-1.3: 验证 RLS 策略生效，只有授权用户可以访问
- **Notes**: 需要更新 [cloudbase-postgresql-schema.sql](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/cloudbase-postgresql-schema.sql) 和 [create_tables.mjs](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/create_tables.mjs)

## [x] Task 2: 云端数据迁移脚本编写
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 编写从 categories、topics、chapters、units、cards、drafts 表迁移数据到 `knowledge_tree` 的 SQL 脚本
  - 处理 drafts 表的特殊字段（errorMessage、generatedAt、templateType）
  - 设置正确的 parent_id 和 level
  - 填充冗余字段（category_id、chapter_id、unit_id）
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 迁移后 `knowledge_tree` 表记录数等于各旧表记录数之和
  - `programmatic` TR-2.2: 验证每条记录的 level 和 parent_id 正确
  - `programmatic` TR-2.3: 验证 drafts 数据正确转换为 status='draft' 的 card 节点
- **Notes**: 需要处理数据依赖顺序（先迁移分类，再主题，再章节等）

## [x] Task 3: 本地 Dexie knowledgeTree 表创建与迁移

## [x] Task 4: 数据模型更新

## [x] Task 5: AI 分类逻辑适配

## [x] Task 6: 数据同步逻辑更新

## [x] Task 7: 前端页面改造

## [x] Task 8: 数据库操作 API 更新

## [x] Task 9: 测试与验证

## [x] Task 10: 文档更新
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 在 [db.js](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/src/services/db.js) 中新增 Dexie 版本，添加 `knowledgeTree` 表
  - 编写迁移函数，将旧表数据迁移到新表
  - 保持旧表不变（兼容层）
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 应用启动后 Dexie 版本升级成功，`knowledgeTree` 表创建
  - `programmatic` TR-3.2: 旧表数据完整迁移到新表
  - `programmatic` TR-3.3: 旧表数据保持不变
- **Notes**: Dexie 不支持外键约束，需要应用层保证数据完整性

## [ ] Task 4: 数据模型更新
- **Priority**: high
- **Depends On**: Task 3
- **Description**: 
  - 更新 [dataModels.js](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/src/services/ai/dataModels.js)，添加 `KnowledgeTree` 相关数据类
  - 更新 `Unit`、`Chapter`、`Topic` 类，支持知识点层级
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 所有数据类正确导出并可用
  - `programmatic` TR-4.2: 数据类的 fromJSON/toJSON 方法正常工作
- **Notes**: 需要支持从 AI 返回结果直接转换为知识树结构

## [ ] Task 5: AI 分类逻辑适配
- **Priority**: high
- **Depends On**: Task 3, Task 4
- **Description**: 
  - 更新 [aiService.js](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/src/services/aiService.js) 中的 `reorganizeUnits` 函数，支持写入单表
  - 更新 [ClassificationService.js](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/src/services/ai/ClassificationService.js)，支持知识点层级
  - 修改分类结果解析逻辑，直接写入 `knowledgeTree` 表
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-5.1: AI 分类结果正确写入 `knowledgeTree` 表
  - `programmatic` TR-5.2: 层级关系（parent_id）正确建立
  - `programmatic` TR-5.3: 知识点和卡片正确关联
- **Notes**: 需要修改 prompt 让 AI 返回包含知识点的四层结构

## [ ] Task 6: 数据同步逻辑更新
- **Priority**: high
- **Depends On**: Task 1, Task 3
- **Description**: 
  - 更新 [sync.js](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/src/services/sync.js) 中的 `TABLE_SCHEMAS`，添加 `knowledge_tree` 表定义
  - 更新 `FIELD_MAP_CAMEL_TO_SNAKE` 和 `snakeToCamelMap`，添加新表字段映射
  - 更新 `pullFromCloud` 和 `pushToCloud`，支持新表同步
  - 保留旧表同步（兼容层）
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-6.1: 云端拉取 `knowledge_tree` 数据成功
  - `programmatic` TR-6.2: 本地推送 `knowledge_tree` 数据成功
  - `programmatic` TR-6.3: 双向同步无数据冲突
- **Notes**: 这是工作量最大的部分之一，需要仔细测试

## [ ] Task 7: 前端页面改造
- **Priority**: medium
- **Depends On**: Task 3
- **Description**: 
  - 更新 [Category.jsx](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/src/pages/Category.jsx)，从新表读取并构建树结构
  - 更新卡片列表和详情页面，支持知识点层级展示
  - 更新草稿管理页面，使用新表结构
- **Acceptance Criteria Addressed**: AC-6, AC-7
- **Test Requirements**:
  - `human-judgment` TR-7.1: 分类页面正确展示树形结构
  - `human-judgment` TR-7.2: 卡片详情页面正确展示知识点关联
  - `human-judgment` TR-7.3: 草稿管理功能正常
- **Notes**: 需要保持移动端适配

## [ ] Task 8: 数据库操作 API 更新
- **Priority**: medium
- **Depends On**: Task 3
- **Description**: 
  - 更新 [db.js](file:///C:/creategame/EggLi-Flashcards/eggli-flashcard-app/src/services/db.js) 中的查询函数（getCardsByUnit、getChaptersByCategory 等）
  - 添加新的查询函数（getKnowledgeTreeByCategory、getCardsByKnowledgePoint 等）
  - 保留旧 API（兼容层）
- **Acceptance Criteria Addressed**: AC-3, AC-6
- **Test Requirements**:
  - `programmatic` TR-8.1: 新查询函数返回正确的树形数据
  - `programmatic` TR-8.2: 旧 API 仍然可用（向后兼容）
- **Notes**: 需要更新所有调用这些 API 的地方

## [ ] Task 9: 测试与验证
- **Priority**: high
- **Depends On**: Task 1-8
- **Description**: 
  - 运行所有单元测试
  - 手动测试核心功能（分类创建、AI 分类、卡片生成、数据同步）
  - 验证数据迁移完整性
- **Acceptance Criteria Addressed**: 所有 AC
- **Test Requirements**:
  - `programmatic` TR-9.1: 所有单元测试通过
  - `human-judgment` TR-9.2: 核心功能手动测试通过
  - `programmatic` TR-9.3: 数据迁移后记录数一致
- **Notes**: 需要在多种场景下测试（空数据库、有数据数据库、迁移后）

## [ ] Task 10: 文档更新
- **Priority**: low
- **Depends On**: Task 1-9
- **Description**: 
  - 更新数据库文档，说明新的表结构
  - 更新 API 文档，说明新增的查询函数
- **Acceptance Criteria Addressed**: None
- **Test Requirements**:
  - `human-judgment` TR-10.1: 文档完整准确
- **Notes**: 可选，根据实际需求决定是否更新
