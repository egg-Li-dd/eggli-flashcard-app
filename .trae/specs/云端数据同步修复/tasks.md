# 云端数据同步修复 - 实现计划

## [x] Task 1: 迁移 Dexie 数据库 — 解决主键变更 UpgradeError
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 放弃通过 `db.version(N+1)` 升级 `AIFlashCardsDB` 主键的方案（Dexie 禁止变更主键）
  - 新建数据库 `AIFlashCardsDB_v2`，所有表 schema 主键统一为 `&id`
  - 用原生 IndexedDB 打开旧库 `AIFlashCardsDB`，绕过 Dexie schema 校验读取所有数据
  - 在事务中写入新库，然后删除旧库
  - 暴露 `ensureDbReady()` 给 AppContext 在 `loadCategories` 之前调用
- **Acceptance Criteria Addressed**: AC-1, AC-5
- **Test Requirements**:
  - `programmatic` TR-1.1: 首次打开 app 时，旧库数据完整迁移到新库，旧库被删除
  - `programmatic` TR-1.2: `addCategory(name)` 可成功写入并返回完整记录
  - `programmatic` TR-1.3: 控制台无 `UpgradeError: Not yet support for changing primary key`
  - `human-judgement` TR-1.4: 首屏分类列表在 3 秒内显示
- **Notes**: 失败时必须做"删除旧库 + 删除新库 + 重建"兜底，避免应用崩溃

## [x] Task 2: 云端 ↔ 本地字段映射统一
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - `snakeToCamel` 确保 `title` 字段兼容映射到 `name`，其他字段按 mapping 表转换，时间戳（created_at/updated_at/last_wrong_at） 转数字
  - `camelToSnake` 按 schema.fields 过滤输出字段，时间戳转 ISO 字符串，autoAddUpdatedAt/created_at 自动填充
  - 所有 `.map(snakeToCamel)` 调用改为 `.map((row) => snakeToCamel(row, tableName))`
- **Acceptance Criteria Addressed**: AC-4, AC-6
- **Test Requirements**:
  - `programmatic` TR-2.1: 云端 categories 用 `title` 时，本地 `name` 字段正确填充
  - `programmatic` TR-2.2: `addCloudRecord` 发送的 payload 字段名与云端 schema 完全匹配（snake_case）
  - `programmatic` TR-2.3: 时间戳字段类型正确（本地 number，云端 ISO string）
- **Notes**: pullFromCloud、syncTableBidirectional、pullTableFromCloud、getCloudTableData、addCloudRecord 均需核对

## [x] Task 3: 容错 created_at 缺失列
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - `getCloudTableData` 仅在 `TABLE_SCHEMAS[tableName].fields` 含 `created_at` 时才调用 `.order('created_at', { ascending: false })`
  - `fetchAllPages` 已存在的 `.order('created_at')` 容错逻辑确认保留
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 云端 `card_status` 表在 `created_at` 列缺失时，`getCloudTableData('card_status')` 正常返回数据
  - `programmatic` TR-3.2: 云端 `categories` 表有 `created_at` 时仍按时间倒序返回

## [x] Task 4: CloudDataDetail.jsx 补全 wrong_answers 支持
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - `TABLE_META` 添加 `wrong_answers: { name: '错题记录', business: ['cardId', 'categoryId', 'count'], meta: ['id', 'createdAt', 'lastWrongAt'] }`
  - `FORM_FIELDS` 添加 `wrong_answers` 字段定义（cardId text、categoryId text、count number）
  - `LOCAL_TABLE_MAP` 添加 `wrong_answers: 'wrongAnswers'`
  - `handleDownload` 添加通用归一化逻辑：`title`→`name`、时间戳转 number、主键 string 化
- **Acceptance Criteria Addressed**: AC-2, AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 导航到 `cloud-data/wrong_answers` 不报错，UI 正常渲染
  - `programmatic` TR-4.2: 单条 `addCloudRecord('wrong_answers', {...})` 成功在云端创建记录
  - `programmatic` TR-4.3: handleDownload 时记录写入本地 `db.wrongAnswers` 表

## [x] Task 5: AppContext 集成 ensureDbReady
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 在 `AppContext.loadCategories()` 中，数据库操作前调用 `db.ensureDbReady()`，确保迁移完成再读写
- **Acceptance Criteria Addressed**: AC-1, AC-5
- **Test Requirements**:
  - `programmatic` TR-5.1: 首次启动添加分类、编辑分类、删除分类均无报错

## [x] Task 6: 文档更新
- **Priority**: P2
- **Depends On**: Task 2, Task 4
- **Description**: 更新 `文档分布.txt` 的【数据库/同步】段落，确保新表名、新函数、新字段映射均被记录
