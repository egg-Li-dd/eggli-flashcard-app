# 云端数据处理功能修复与增强 - 实施任务清单

## [ ] Task 1: 修复 snakeToCamel 字段映射，保留 title 字段
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 当前 `snakeToCamel` 函数将 `title` → `name`，导致 `TABLE_META.categories.business = ['title']` 时在详情页 `item.title` 为 undefined，显示为 `#id`
  - 应移除 `title: 'name'` 映射，使 categories/units 的 title 字段保留为 `title`，避免同步逻辑（已在 sync.js 使用 name 字段的其他地方需要同步检查）
  - 或者：将 TABLE_META 中 categories 的 `business: ['title']` 改为 `business: ['name']`（更稳妥，不影响同步逻辑）
  - **推荐方案**：移除 `snakeToCamel` 中 `title: 'name'` 映射，同步修改本地数据库 schema 中 categories 的 `name` 字段为 `title`，或在渲染时改用 `name` 字段
  - **最终方案**：将 `TABLE_META.categories.business = ['title']` 改为 `['name']`，将 `TABLE_META.units.business = ['title', 'categoryId']` 改为 `['name', 'categoryId']`，同时在 FORM_FIELDS 中将 categories 的 label 字段从 `title` 改为 `name`，units 的 title 也改为 `name`
  - 此方案最小改动，不影响 snakeToCamel 用于同步的 `title → name` 转换逻辑
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: CloudDataDetail 中 categories 列表渲染时 `item.name` 显示正确值（不 undefined）
  - `programmatic` TR-2.2: units 列表中 `item.name` 正确显示
  - `human-judgement` TR-2.3: 浏览云端分类数据，标题区显示"数学"、"计算机"等实际名称
- **Notes**: 需确保同步逻辑（fetchAllPages + snakeToCamel）不受影响；本地数据库中 categories 的 name 字段应继续保持

## [ ] Task 2: 修复云端数据总数（count）显示
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在 `getCloudTableData` 函数中，确保 Supabase `.select(columns, { count: 'exact' })` 能返回正确的 `count` 总数
  - 当前函数已改 `{ count: 'exact' }`，但返回时使用 `count ?? data?.length ?? 0`
  - CloudData.jsx 中使用 `getCloudTableData(item.table, 1)` limit=1 调用，`total` 应使用 count（精确值），而不是 data.length
  - 需确保 `count` 在 Supabase 返回值中正确传递并被前端读取
  - 如果 Supabase 返回的 `data` 为数组而 `count` 为数字，则应确保返回结构中 `total` 始终为 `count`
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: `getCloudTableData('categories', 1).total` 等于 Supabase 中 categories 表 user_id = 当前用户的真实记录数
  - `programmatic` TR-1.2: CloudData 页面 5 个表的"云端：N 条"显示值与 Supabase 控制台中实际记录数一致
  - `human-judgement` TR-1.3: 手动在 Supabase 添加一条记录后刷新页面，总数应 +1

## [ ] Task 3: 调整筛选选项文字和新增已下载/未下载
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - CloudDataDetail.jsx 中：筛选按钮文字从 `已更新` → `已有云端数据`，从 `未更新` → `云端未更新`
  - 新增 `已下载`、`未下载` 两个按钮，值为 `downloaded` 和 `not-downloaded`
  - `filterItems` 函数中添加对这两个新值的处理逻辑：
    - `downloaded`: 本地数据库中存在相同 id 的记录 → 保留
    - `not-downloaded`: 本地数据库中不存在相同 id 的记录 → 保留
    - 需要在 CloudDataDetail 中读取本地数据（使用 dbInstance），以判断每条记录是否在本地
  - `buildFilterSummary` 中添加对 `downloaded`/`not-downloaded` 的 chip 显示
  - `draftFilters`/`activeFilters` 需要添加 `downloadStatus: 'all'` 字段
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 筛选面板中显示 "已有云端数据"、"云端未更新"、"已下载"、"未下载" 4 个按钮
  - `programmatic` TR-3.2: 点击应用后，filterItems 对已下载/未下载选项的判断基于本地数据库 id
  - `human-judgement` TR-3.3: 选择"已下载"后，列表应只显示本地也有的记录；选择"未下载"则反之

## [ ] Task 4: 详情页添加"下载到本地"按钮
- **Priority**: P1
- **Depends On**: Task 1（确保字段名正确）
- **Description**: 
  - 在 CloudDataDetail.jsx 中，为每条记录的右侧操作区添加一个新按钮"下载到本地"，位于"删除"按钮左侧
  - 按钮样式：与"删除"按钮一致但使用主色调（color-primary）而非 danger 色
  - 点击后调用一个新函数 `downloadCloudRecordToLocal(table, item)`：
    - 将云端记录（已由 snakeToCamel 转换为 camelCase 字段）写入本地 Dexie 对应表
    - 使用 `db.table.put(item)`（upsert 语义）：存在则更新，不存在则插入
    - 对 card_status 和 bookmarks 等可能无 id 主键的表，需使用正确主键策略（card_status 以 cardId 或复合主键，bookmarks 以 cardId 或复合主键）
    - 写入完成后刷新数据显示
  - 注意：categories 和 units 的本地字段可能使用 `name` 而非 `title`，需确保字段映射正确
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 每条记录右侧有"下载到本地"按钮，点击后不报错
  - `programmatic` TR-4.2: 点击后本地数据库中能查到该记录（`db.table.get(id)` 返回非 undefined）
  - `human-judgement` TR-4.3: Toast "下载成功" 消息显示；再次点击不报错（upsert）

## Task Dependencies
- Task 1 和 Task 2 可并行执行
- Task 3 可独立执行
- Task 4 依赖 Task 1（字段映射确认），但实际可并行，因为字段映射问题在 Task 4 中可单独处理
