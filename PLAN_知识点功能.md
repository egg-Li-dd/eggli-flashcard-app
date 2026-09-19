# 卡片可编辑知识点功能 — 实施计划

## 一、功能概述

为每张卡片新增一个"**原始知识点**"（`knowledge_point`）字段，形成以下工作流：

```
用户输入文本 → AI 先分析提炼原始知识点 → 再基于知识点构建 front/back 卡片
                  ↓
         用户可手动编辑知识点 → 点击"AI 重新生成问题/答案" → AI 根据新的知识点重建卡片
                  ↓
         云端同步：云端卡片表直观显示"原始知识点"列，便于浏览
```

## 二、涉及文件（按修改顺序）

1. `src/utils/constants.js` — 更新 AI 生成提示词（新增 `knowledge_point` 字段）
2. `src/services/db.js` — 新增 `knowledge_point` 列到 cards 表，更新相关 CRUD
3. `src/services/sync.js` — 云端表字段映射（camelCase ↔ snake_case）
4. `src/services/deepseek.js` — 新增 `regenerateCardFromKnowledgePoint` 函数
5. `src/services/iflytekAi.js` — 同上，添加星火实现
6. `src/services/volcanoEngine.js` — 同上，添加豆包实现
7. `src/services/dashscope.js` — 同上，添加千问实现
8. `src/services/aiService.js` — 增加统一入口，提供各服务模式的"重新生成"调度
9. `src/utils/helpers.js` — 增强 `normalizeCard`，兼容 `knowledge_point` 字段
10. `src/components/CardItem.jsx` — 显示知识点 + 编辑入口 + AI 重新生成按钮
11. `src/pages/Category.jsx` — 向 CardItem 传入 AI 相关 props（state.apiKey 等）
12. `src/pages/Memorize.jsx` — 同上
13. `src/pages/CloudDataDetail.jsx` — 卡片表展示 `knowledge_point` 列，新增编辑入口
14. Supabase SQL 迁移（在 Supabase 控制台执行）

## 三、具体修改内容

### 3.1 AI 提示词更新（constants.js）

**修改点**: `buildPrompt()` 函数与 JSON 输出格式。

**原 JSON 输出**：
```json
{ "front": "...", "back": "..." }
```

**新 JSON 输出**：
```json
{
  "knowledge_point": "此卡片对应的原始知识点内容（用户可编辑的核心文本）",
  "front": "卡片正面内容（问题或挖空）",
  "back": "卡片背面内容（完整答案）"
}
```

**提示词修改**：在 `buildPrompt` 中新增要求：
- AI 在生成卡片时**先生成原始知识点**（知识点字段为精简后的原文本摘要，不超过 150 字）
- 再根据知识点构建 front/back
- 知识点字段可以被用户后续手动编辑并重新生成

### 3.2 数据库结构扩展（db.js）

**Dexie schema 修改**:

```js
// 原
cards: '&id, unitId, front, back, createdAt, order, type, options, answerBlank',
// 新
cards: '&id, unitId, front, back, knowledge_point, createdAt, order, type, options, answerBlank',
```

字段说明：
- `knowledge_point`: `string | null` — 可编辑的原始知识点文本，不超过 200 字

**迁移策略**：
- Dexie 通过版本号升级，在 `version(1).stores(...)` 后追加新字段
- 旧数据自动 `null` 处理，UI 层显示空文本或提示"暂无原始知识点"
- 编辑功能：不要求所有卡片都有此值（无值时允许编辑添加）

**相关 CRUD 更新**:
- `addUnits()`: 保存 AI 生成的卡片时保留 `knowledge_point`
- `updateCard()`: 已支持任意字段 patch，无需额外修改
- `getAllCardsByCategory()`: `knowledge_point` 自动被查询

### 3.3 云端同步（sync.js）

**字段映射**：
- 本地 Dexie → `knowledge_point`（snake_case 本地与云端一致）
- 云端 Supabase `cards` 表 → 需新增列 `knowledge_point TEXT NULL`
- `pullTableFromCloud` / `uploadTableToCloud` 自动包含新字段

**Supabase SQL 迁移**（由技术人员在 Supabase 控制台执行一次）：
```sql
ALTER TABLE cards ADD COLUMN IF NOT EXISTS knowledge_point TEXT DEFAULT NULL;
```

### 3.4 AI 重新生成（deepseek.js / iflytekAi.js / volcanoEngine.js / dashscope.js）

**新增函数**：`regenerateCardFromKnowledgePoint(knowledge_point, apiKey, model)`

输入：`knowledge_point` 字符串
输出：`{ front: "...", back: "...", knowledge_point: "...（原样返回）" }`

提示词（示意）：
```
你是一个专业的背诵卡片制作助手。用户提供一段知识点，请你：
1. 将这段知识点转化为一张双面背诵卡片。
2. 卡片正面（front）：使用问题形式或关键词挖空形式。
3. 卡片背面（back）：填写完整答案。
4. 只输出 JSON 格式，不要加 Markdown、引号等多余内容。

{
  "front": "...",
  "back": "..."
}

知识点：<用户编辑后的文本>
```

**统一入口 aiService.js**：新增 `regenerateCard(knowledge_point, aiConfig)` 函数，根据 `aiServiceMode` 分派到具体服务。

### 3.5 helpers.js 卡片标准化

`normalizeCard(rawCard)`:
- 原逻辑保留（处理 question/answer 等兼容字段）
- 新增：`knowledge_point` 字段保留（若 AI 返回了该字段）

### 3.6 CardItem.jsx UI 增强

**compact（列表项）模式**:
- 在现有 front 显示处**上方**新增一行：显示 `knowledge_point`（1-2 行，可展开/折叠）
- 当 `knowledge_point` 为空时显示提示："无原始知识点（点击编辑添加）"
- 编辑对话框：
  - 多行文本框（textarea）：`原始知识点`
  - 多行文本框：`问题（front）`
  - 多行文本框：`答案（back）`
  - "根据知识点重新生成问题与答案"按钮
  - 保存 / 取消按钮

**large（背诵页）模式**:
- 在卡片正面/背面底部显示 `knowledge_point` 作为参考
- 右上角编辑按钮：与 compact 相同对话框

**保存流程**:
- 保存时调用 `db.updateCard(cardId, { front, back, knowledge_point })`
- 保存后通过 `onUpdated` 回调通知父组件刷新
- 若用户点击"AI 重新生成" → 调用 `aiService.regenerateCard()` → 自动填充 front/back → 用户再点击保存

### 3.7 Category.jsx & Memorize.jsx

向 CardItem 传入新的 props：
- `state`: 用于获取 aiServiceMode / apiKey / sparkApiKey / sparkModel 等
- `summaryLevel`: AI 生成时的密度偏好
- 或者简单做法：把 `apiKey`, `model`, `aiServiceMode`, `summaryLevel` 显式传入

### 3.8 CloudDataDetail.jsx

- `TABLE_META.cards.business`: 增加 `knowledge_point` 列
- `FORM_FIELDS.cards`: 增加 `knowledge_point` 文本域
- 表格列顺序：`knowledge_point` → `front` → `back` → 其他
- 表头显示：知识点 / 问题（front）/ 答案（back）/ 所属单元 / 所属分类

## 四、实现优先级

1. **数据结构层**（必须先做）
   - [ ] constants.js — 新 JSON 输出格式
   - [ ] db.js — 新增列
   - [ ] helpers.js — 字段兼容

2. **AI 服务层**（次优先）
   - [ ] deepseek.js — regenerateCardFromKnowledgePoint
   - [ ] iflytekAi.js — regenerateCardFromKnowledgePoint
   - [ ] volcanoEngine.js — regenerateCardFromKnowledgePoint
   - [ ] dashscope.js — regenerateCardFromKnowledgePoint
   - [ ] aiService.js — 统一入口

3. **前端 UI**（最后）
   - [ ] CardItem.jsx — 知识点显示 + 编辑
   - [ ] Category.jsx — 传入 props
   - [ ] Memorize.jsx — 传入 props
   - [ ] CloudDataDetail.jsx — 新增列显示

4. **云端 SQL**（实施过程中，用户在 Supabase 控制台执行一次）

## 五、兼容性与回退策略

- 无 `knowledge_point` 字段的旧卡片：UI 正常显示 front/back，知识点行显示提示文案
- 关闭 AI 服务的情况：编辑对话框中"AI 重新生成"按钮显示"未配置 API Key"的提示，禁用
- 云端未同步 `knowledge_point` 列：云端 `cards.knowledge_point` 为 null，下拉时正常

## 六、验收标准

1. 用户输入文本后，新生成的卡片包含非空的 `knowledge_point`
2. 用户可在分类页 / 背诵页点击卡片的编辑按钮，打开编辑对话框
3. 编辑对话框显示"原始知识点 + 问题 + 答案"三个文本域
4. 用户编辑知识点后点击"AI 重新生成问题/答案" → 自动更新 front/back
5. 保存后，回到分类页 / 背诵页，卡片内容立即更新
6. 云端下载后，云端卡片表视图中新增"知识点"列，显示原始知识点
7. 整个流程不阻塞现有的收藏 / 删除 / 移动 / 背诵功能
