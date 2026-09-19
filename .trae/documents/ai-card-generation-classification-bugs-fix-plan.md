# AI卡片生成归类Bug修复计划

## 概述
审计强/弱模型在生成卡片过程中，卡片归类到AI生成的章节-单元或已有章节-单元的完整流程，发现以下问题。

---

## Bug 1（高优先级）：强模型chapter-and-unit模式unitIndex索引错位

**文件**: `src/services/aiService.js` — `classifyCardsByCategoryContent` 函数（L866-1031）

**问题描述**:
- `unitBlocks` 包含**所有**单元（未按chapterId过滤），`unitIdsByIndex` 也是全局索引
- 在chapter-and-unit的prompt中，章节块内的单元使用"单元{chapterIndex}-{perChapterIndex}"格式（per-chapter索引）
- 但代码解析AI返回时，使用 `unitIdsByIndex[item.unitIndex]`（全局索引）查找单元
- AI可能返回per-chapter的unitIndex，导致匹配到错误的单元

**示例**:
- 章节0有单元[A1, A2]（全局索引2, 3）
- 章节1有单元[B1, B2]（全局索引0, 1）
- AI返回 `{chapterIndex: 0, unitIndex: 0}` 意为"章节0的第0个单元(A1)"
- 代码使用 `unitIdsByIndex[0]` = B1（错误！应为A1）

**修复方案**:
1. 为chapter-and-unit模式构建**每个章节的独立unitIdsByIndex**（`chapterUnitIdsMap`）
2. 解析AI返回时，先通过 `chapterIdsByIndex[item.chapterIndex]` 找到章节，再从该章节的unitIds中取 `item.unitIndex`
3. 同时过滤 `unitBlocks`，只包含**未归属任何章节的单元**（`!u.chapterId`），修正"【未归章单元】"标签

---

## Bug 2（中优先级）：unitBlocks未过滤已归属章节的单元

**文件**: `src/services/aiService.js` — `classifyCardsByCategoryContent` 函数（L866-880, L900-901）

**问题描述**:
- `unitBlocks`（L866-880）遍历所有单元，包括已归属章节的
- 但prompt（L900-901）将其标记为"【未归章单元】"
- 导致已归属章节的单元在prompt中重复出现两次：
  - 一次在章节块中（正确）
  - 一次在"未归章单元"中（错误，且索引不同）

**修复方案**:
在构建 `unitBlocks` 时过滤：只包含 `!u.chapterId` 的单元（未归属章节的单元）

---

## Bug 3（中优先级）：强模型chapter-and-unit AI返回newUnitName为null时卡片归入兜底单元

**文件**: `src/services/aiService.js` L1041-1048 + `src/pages/Category.jsx` L720-733

**问题描述**:
- 当强模型返回 `assignType: 'new'` 时，代码只读取 `item.newUnitName`
- 但AI可能只返回 `newChapterName` 而不返回 `newUnitName`（因为章节+单元模式下，AI可能只创建新章节）
- 导致 `newUnitName` 为 null，卡片落入Category.jsx的兜底分支（L729-733），使用 `card.originalUnitName`（AI Step2生成的原始单元名）作为单元名

**修复方案**:
在 `classifyCardsByCategoryContent` L1041-1048，当 `newUnitName` 为 null 时，使用 `newChapterName` 或卡片front生成合理的默认单元名

---

## Bug 4（低优先级）：addUnitsWithMatching中卡片chapterId可能与单元chapterId不一致

**文件**: `src/pages/Category.jsx` L856-862, L900-910

**问题描述**:
- 添加到现有单元的卡片，`chapterId` 使用 `card.chapterId || unitData.chapterId`（来自分类结果）
- 但未验证该 chapterId 与现有单元的 chapterId 是否一致
- 可能导致卡片 chapterId 与单元 chapterId 不匹配

**修复方案**:
在 `addUnitsWithMatching` 中添加cards到现有单元前，获取该单元的 `chapterId` 并设为卡片的 `chapterId`

---

## Bug 5（低优先级）：弱模型多轮分类中未分配卡片标记为"未归类"

**文件**: `src/services/aiService.js` — `classifyCardsByKnowledgePointsMultiRound` L1696

**问题描述**:
- 第一轮章节分类中未匹配的卡片，chapterName 被硬编码为 `'未归类'`
- 之后会创建名为"未归类"的章节，名称不友好

**修复方案**:
使用卡片内容前几个字生成更合理的默认章节名（如 `(newCards[i].front || '新章节').slice(0, 12)`）

---

## Bug 6（低优先级）：classifyCardsByKnowledgePoints中的fallbackClassifyLocal不处理章节信息

**文件**: `src/services/aiService.js` — `classifyCardsByKnowledgePoints` L1548-1573

**问题描述**:
- `fallbackClassifyLocal` 只处理单元级匹配，不处理章节信息
- 虽然当前调用路径中（弱模型unit-only模式）不会传入章节信息，但函数签名接受 `existingChapters` 和 `classificationDepth` 参数，fallback应与其保持一致

**修复方案**:
扩展 `fallbackClassifyLocal` 支持章节级降级匹配（当 `existingChapters` 存在时）

---

## 修复优先级与影响范围

| 优先级 | Bug | 影响模型 | 影响场景 |
|--------|-----|---------|---------|
| 高 | Bug 1: unitIndex索引错位 | 强模型（DeepSeek/豆包/千问/Spark非lite） | 有章节+单元结构的分类中生成卡片 |
| 中 | Bug 2: unitBlocks重复 | 强模型 | 同上 |
| 中 | Bug 3: newUnitName=null | 强模型 | AI创建新章节但未创建新单元时 |
| 低 | Bug 4: chapterId不一致 | 所有模型 | 卡片添加到现有单元时 |
| 低 | Bug 5: "未归类"硬编码 | 弱模型（Spark Lite） | 弱模型章节分类未匹配时 |
| 低 | Bug 6: fallback无章节支持 | 弱模型 | 弱模型分类失败降级时 |

---

## 验证步骤

1. 使用强模型（DeepSeek）在有章节+单元的分类中生成卡片，验证卡片正确归类到章节和单元
2. 使用弱模型（Spark Lite）在有章节+单元的分类中生成卡片，验证多轮分类正确
3. 验证无章节的分类中生成卡片，卡片归类不受影响（向后兼容）
4. 验证 `npm run build` 生产构建通过
5. 热更新预览测试完整流程（输入文字 → 知识点确认 → 卡片生成 → 归类确认 → 入库）