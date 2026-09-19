
# 移动端数据迁移 bookmarks 表字段缺失修复计划

## 问题诊断

**错误信息**：
```
bookmarks上传失败: Could not find the 'updated_at' column of 'bookmarks' in the schema cache
```

**根本原因**：
`migrate.js` 中的 `convertCamelToSnake()` 函数**无条件为所有记录添加 `updated_at` 和 `created_at` 字段**（第61-62行），但云端 Supabase 数据库的 `bookmarks` 表和 `card_status` 表并没有这些列，导致 Supabase schema cache 验证失败。

## 各表字段结构分析

| 表名 | 本地 IndexedDB 实际字段 | 云端 Supabase 预期字段 | 是否有 updated_at |
|------|-------------------------|------------------------|-------------------|
| categories | `id, name, createdAt` | `id, name, created_at, updated_at, user_id` | ✅ 有 |
| units | `id, categoryId, name, createdAt, order` | `id, category_id, name, created_at, updated_at, user_id, order` | ✅ 有 |
| cards | `id, unitId, front, back, createdAt, order` | `id, unit_id, front, back, created_at, updated_at, user_id, order` | ✅ 有 |
| card_status | `id, cardId, categoryId, status` | `id, card_id, category_id, status, user_id` | ❌ **无 created_at/updated_at** |
| bookmarks | `cardId, createdAt` | `card_id, created_at, user_id` | ❌ **无 updated_at** |

## 修复方案

重写字段转换逻辑，为每个表单独定义字段映射规则，而不是使用统一的"自动添加所有字段"的转换函数。

### 修改内容

**文件**：`src/services/migrate.js`

1. **删除通用的 `convertCamelToSnake()` 函数**，改为为每个表定义专用的转换函数：
   - `convertCategoryToCloud()` - categories 表（包含 updated_at）
   - `convertUnitToCloud()` - units 表（包含 updated_at）
   - `convertCardToCloud()` - cards 表（包含 updated_at）
   - `convertCardStatusToCloud()` - card_status 表（仅 id, card_id, category_id, status, user_id）
   - `convertBookmarkToCloud()` - bookmarks 表（仅 card_id, created_at, user_id）

2. **修改 `migrateLocalToCloud()` 中的 `prepareData()` 逻辑**，根据表名选择对应的转换函数

3. **同理修改 `convertSnakeToCamel()` 为各表专用函数**，用于导入功能

4. **移除过多的调试 console.log**，避免移动端性能影响

### 具体代码变更

#### 1. 字段转换函数重写

```javascript
// —— 表字段定义：明确每个表在云端有哪些字段 ——
const TABLE_SCHEMAS = {
  categories: {
    required: ['id', 'name', 'created_at', 'user_id'],
    optional: ['updated_at']
  },
  units: {
    required: ['id', 'category_id', 'name', 'created_at', 'user_id'],
    optional: ['updated_at', 'order']
  },
  cards: {
    required: ['id', 'unit_id', 'front', 'back', 'created_at', 'user_id'],
    optional: ['updated_at', 'order']
  },
  card_status: {
    required: ['id', 'card_id', 'category_id', 'status', 'user_id'],
    optional: []
  },
  bookmarks: {
    required: ['card_id', 'created_at', 'user_id'],
    optional: []
  }
}

// —— camelCase → snake_case 字段映射 ——
const CAMEL_TO_SNAKE = {
  categoryId: 'category_id',
  unitId: 'unit_id',
  cardId: 'card_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function convertToCloud(item, tableName, userId) {
  const out = { user_id: userId }

  // 1. 处理已知字段映射
  for (const [k, v] of Object.entries(item)) {
    if (k === 'user_id' || k === 'userId') continue // 跳过 user_id，稍后设置
    const snakeKey = CAMEL_TO_SNAKE[k] || k
    out[snakeKey] = v
  }

  // 2. 时间字段格式转换（本地毫秒数 → ISO 字符串）
  if (out.created_at && typeof out.created_at === 'number') {
    out.created_at = new Date(out.created_at).toISOString()
  }
  if (out.updated_at && typeof out.updated_at === 'number') {
    out.updated_at = new Date(out.updated_at).toISOString()
  }

  // 3. 仅为"应该有 updated_at"的表添加此字段
  const schema = TABLE_SCHEMAS[tableName]
  if (schema && schema.optional.includes('updated_at') && !out.updated_at) {
    out.updated_at = new Date().toISOString()
  }

  // 4. 确保 created_at 存在（对于有此字段的表）
  if (schema && schema.required.includes('created_at') && !out.created_at) {
    out.created_at = new Date().toISOString()
  }

  // 5. 过滤掉不在 schema 中的字段
  if (schema) {
    const allowedKeys = [...schema.required, ...schema.optional]
    for (const key of Object.keys(out)) {
      if (!allowedKeys.includes(key)) {
        delete out[key]
      }
    }
  }

  return out
}
```

#### 2. 迁移函数中的调用方式变更

```javascript
// 原代码（有问题）：
const prepareData = (data, userId) => {
  return data.map(item => ({
    ...convertCamelToSnake(item),
    user_id: userId,
  }))
}

// 新代码（正确）：
const userCategories = categories.map(item => convertToCloud(item, 'categories', user.id))
const userUnits = units.map(item => convertToCloud(item, 'units', user.id))
const userCards = cards.map(item => convertToCloud(item, 'cards', user.id))
const userStatuses = statuses.map(item => convertToCloud(item, 'card_status', user.id))
const userBookmarks = bookmarks.map(item => convertToCloud(item, 'bookmarks', user.id))
```

#### 3. 同步修改导入（snake_case → camelCase）转换函数

同理重写 `convertSnakeToCamel()`，确保只转换各表实际存在的字段。

## 预期结果

修复后，移动端数据迁移：
1. `bookmarks` 表不再发送不存在的 `updated_at` 字段
2. `card_status` 表不再发送不存在的 `created_at`/`updated_at` 字段
3. 迁移成功完成，所有数据正确上传到云端
