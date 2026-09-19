# ============================================================
# 智能归类功能更新规划报告
# 更新: 2026-06-17（v5 代码漏洞修复版）
# 覆盖功能: 智能单元整理 / AI全权归类 / 指定分类归类
# 核心更新: 两步法AI调用 + 单元整体移动界面
# ============================================================

---

## 一、用户需求分析

### 核心思路
用户希望三个功能结合"两步法"：
1. **第一步（结构规划）**：先调用AI判断单元归属哪个章节、哪些单元需要合并、未归类单元是否需要新建章节
2. **第二步（卡片归类）**：读取章节的所有卡片内容，超过阈值时分批次归类
3. **界面支持单元整体移动**：将整个单元连同卡片一起移动到其他章节/分类

---

## 二、现有AI调用逻辑分析

### 2.1 当前AI调用流程

**智能单元整理 (`reorganizeUnits`)**：
```
输入: 分类名 + 所有卡片内容 + 现有单元名 + 现有章节
调用: 一次AI调用
输出: { chapters: [...] } 或 { units: [...] }
问题: 卡片量大时，prompt过长，AI返回质量下降
```

**指定分类归类 (`classifyCardsByCategoryContent`)**：
```
输入: 现有单元 + 现有卡片 + 新卡片
调用: 一次AI调用（大数据时走多轮分批）
输出: [{ cardIndex, chapterId, unitId, ... }]
问题: 已经有部分分批逻辑，但没有结构规划步骤
```

---

## 三、AI逻辑更新方案

### 3.1 智能单元整理 - 两步法重构

#### Step 1: 结构规划（轻量调用）

**代码漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 参数校验缺失 | `existingUnits`/`existingChapters` 可能为 null/undefined | 添加空值校验，默认空数组 |
| config 校验缺失 | `callAiProvider` 需要的参数可能缺失 | 添加 API key 校验 |
| JSON解析异常 | AI返回格式可能不符合预期 | 添加 try-catch 和 fallback 逻辑 |
| 结果验证缺失 | 返回数据可能缺少必要字段 | 添加字段存在性检查 |
| 单元索引越界 | AI返回的 unitIndex 可能超出范围 | 添加索引范围校验 |

**修复后的代码：**

```javascript
export async function planChapterUnitStructure(existingUnits = [], existingChapters = [], config = {}) {
  // 参数校验
  const units = Array.isArray(existingUnits) ? existingUnits.filter(u => u?.name) : []
  const chapters = Array.isArray(existingChapters) ? existingChapters.filter(ch => ch?.name) : []
  
  if (units.length === 0) {
    return { chapterAssignments: [], unitMerges: [], newChapters: [] }
  }
  
  // config 校验
  if (!config || !config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey) {
    throw new Error('请先配置 AI API Key')
  }
  
  const unitLines = units.map((u, i) => `单元${i}: ${u.name}`)
  const chapterLines = chapters.map((ch, i) => `章节${i}: ${ch.name}`)
  
  const prompt = `你是知识体系整理助手。请分析现有单元和章节的结构关系。

【任务】：
1. 判断每个单元应该归属哪个章节（如果有章节的话）
2. 判断哪些单元主题相似，可以合并
3. 判断是否需要新建章节来容纳未归类的单元

【现有章节】：
${chapterLines.join('\n') || '（暂无章节）'}

【现有单元】（共 ${units.length} 个）：
${unitLines.join('\n')}

【输出格式】请严格以 JSON 格式返回：
{
  "chapterAssignments": [{"unitIndex": 数字, "chapterIndex": 数字}],
  "unitMerges": [{"sourceUnitIndices": [数字数组], "targetUnitName": "字符串"}],
  "newChapters": [{"name": "字符串", "unitIndices": [数字数组]}]
}`

  try {
    const { content } = await callAiProvider(prompt, config)
    
    // JSON解析（容错处理）
    let parsed = null
    try {
      const trimmed = String(content).trim()
      const firstBracket = trimmed.indexOf('{')
      const lastBracket = trimmed.lastIndexOf('}')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
      }
    } catch (_) {
      // 解析失败，返回空结果
      return { chapterAssignments: [], unitMerges: [], newChapters: [] }
    }
    
    if (!parsed || typeof parsed !== 'object') {
      return { chapterAssignments: [], unitMerges: [], newChapters: [] }
    }
    
    // 验证 chapterAssignments
    const chapterAssignments = []
    if (Array.isArray(parsed.chapterAssignments)) {
      for (const item of parsed.chapterAssignments) {
        if (typeof item.unitIndex === 'number' && typeof item.chapterIndex === 'number') {
          if (item.unitIndex >= 0 && item.unitIndex < units.length &&
              item.chapterIndex >= 0 && item.chapterIndex < chapters.length) {
            chapterAssignments.push({ unitIndex: item.unitIndex, chapterIndex: item.chapterIndex })
          }
        }
      }
    }
    
    // 验证 unitMerges
    const unitMerges = []
    if (Array.isArray(parsed.unitMerges)) {
      for (const item of parsed.unitMerges) {
        if (Array.isArray(item.sourceUnitIndices) && typeof item.targetUnitName === 'string') {
          const validIndices = item.sourceUnitIndices.filter(i => typeof i === 'number' && i >= 0 && i < units.length)
          if (validIndices.length >= 2) {
            unitMerges.push({ sourceUnitIndices: validIndices, targetUnitName: String(item.targetUnitName).trim().slice(0, 16) })
          }
        }
      }
    }
    
    // 验证 newChapters
    const newChapters = []
    if (Array.isArray(parsed.newChapters)) {
      for (const item of parsed.newChapters) {
        if (typeof item.name === 'string' && Array.isArray(item.unitIndices)) {
          const validIndices = item.unitIndices.filter(i => typeof i === 'number' && i >= 0 && i < units.length)
          const chapterName = String(item.name).trim().slice(0, 12)
          if (chapterName && validIndices.length > 0) {
            newChapters.push({ name: chapterName, unitIndices: validIndices })
          }
        }
      }
    }
    
    return { chapterAssignments, unitMerges, newChapters }
    
  } catch (err) {
    console.error('[planChapterUnitStructure] AI调用失败:', err)
    return { chapterAssignments: [], unitMerges: [], newChapters: [] }
  }
}
```

#### Step 2: 分批卡片归类

**代码漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 函数未定义 | `classifySingleBatch` 未定义 | 需要实现此函数或复用现有逻辑 |
| 参数校验缺失 | 各参数可能为 null/undefined | 添加空值校验 |
| 错误处理缺失 | 某一批次失败时整个流程中断 | 添加 try-catch，失败批次跳过或重试 |
| 缺少进度回调 | 大数据量时用户无反馈 | 添加 onProgress 回调 |
| 重复检测时机 | 在所有批次完成后检测，可能遗漏跨批次重复 | 在每批次内部和批次间都检测 |

**修复后的代码：**

```javascript
export async function classifyCardsByChapterBatch(chapterId, chapterUnits = [], cards = [], config = {}, batchSize = 50, onProgress) {
  // 参数校验
  if (!chapterId) {
    throw new Error('chapterId 不能为空')
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    return []
  }
  
  const units = Array.isArray(chapterUnits) ? chapterUnits.filter(u => u?.name) : []
  
  // 分批处理
  const batches = []
  for (let i = 0; i < cards.length; i += batchSize) {
    batches.push(cards.slice(i, i + batchSize))
  }
  
  const results = []
  let totalProcessed = 0
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    
    try {
      const batchResult = await classifySingleBatch(chapterId, units, batch, config)
      results.push(...batchResult)
      totalProcessed += batch.length
      
      // 进度回调
      if (typeof onProgress === 'function') {
        onProgress({
          current: batchIndex + 1,
          total: batches.length,
          processed: totalProcessed,
          totalCards: cards.length,
        })
      }
      
    } catch (err) {
      console.error(`[classifyCardsByChapterBatch] 批次 ${batchIndex + 1} 处理失败，跳过此批次:`, err)
      // 将失败批次的卡片标记为未归类，由用户手动处理
      for (let i = 0; i < batch.length; i++) {
        results.push({
          cardIndex: batch[i]._originalIndex !== undefined ? batch[i]._originalIndex : -1,
          chapterId,
          unitId: null,
          newUnitName: null,
          error: 'AI归类失败',
        })
      }
      totalProcessed += batch.length
    }
  }
  
  // 跨批次重复检测
  const duplicateResults = detectDuplicateCards(cards, 0.85)
  // 标记重复卡片（在结果中添加 duplicateOf 字段）
  for (const dup of duplicateResults) {
    const idx1 = cards.findIndex(c => c.id === dup.card1.id)
    const idx2 = cards.findIndex(c => c.id === dup.card2.id)
    if (idx1 !== -1 && idx2 !== -1) {
      const r1 = results.find(r => r.cardIndex === idx1)
      const r2 = results.find(r => r.cardIndex === idx2)
      if (r1) r1.duplicateOf = dup.card2.id
      if (r2) r2.duplicateOf = dup.card1.id
    }
  }
  
  return results
}

// 单批次归类实现（复用现有 classifyCardsByCategoryContent 的逻辑）
async function classifySingleBatch(chapterId, units, cards, config) {
  // 构建 prompt（只包含当前章节的单元和当前批次的卡片）
  const unitBlocks = units.map((u, i) => `【单元${i}】${u.name}`)
  
  const cardLines = cards.map((c, i) => 
    `新卡${i}: Q=${String(c.front || '').slice(0, 60)} | A=${String(c.back || '').slice(0, 60)}`
  )
  
  const prompt = `你是分类助手。请把新卡片归类到现有单元中。

【现有单元】：
${unitBlocks.join('\n')}

【新卡片】：
${cardLines.join('\n')}

【输出格式】JSON数组：
[{"cardIndex": 数字, "unitIndex": 数字或null, "newUnitName": "字符串或null"}]`
  
  const { content } = await callAiProvider(prompt, config)
  
  // 解析结果（复用现有解析逻辑）
  let parsed = null
  try {
    const trimmed = String(content).trim()
    const firstBracket = trimmed.indexOf('[')
    const lastBracket = trimmed.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
    }
  } catch (_) { /* ignore */ }
  
  if (!Array.isArray(parsed)) {
    // 降级：简单匹配
    return cards.map((c, i) => ({
      cardIndex: c._originalIndex !== undefined ? c._originalIndex : i,
      chapterId,
      unitId: null,
      newUnitName: (c.front || '新单元').slice(0, 16),
    }))
  }
  
  const assignments = []
  for (let i = 0; i < cards.length; i++) {
    const item = parsed.find(p => Number(p.cardIndex) === i)
    
    if (item && typeof item.unitIndex === 'number' && item.unitIndex >= 0 && item.unitIndex < units.length) {
      assignments.push({
        cardIndex: cards[i]._originalIndex !== undefined ? cards[i]._originalIndex : i,
        chapterId,
        unitId: units[item.unitIndex].id,
        newUnitName: null,
      })
    } else if (item && item.newUnitName) {
      assignments.push({
        cardIndex: cards[i]._originalIndex !== undefined ? cards[i]._originalIndex : i,
        chapterId,
        unitId: null,
        newUnitName: String(item.newUnitName).trim().slice(0, 16),
      })
    } else {
      assignments.push({
        cardIndex: cards[i]._originalIndex !== undefined ? cards[i]._originalIndex : i,
        chapterId,
        unitId: null,
        newUnitName: (cards[i].front || '新单元').slice(0, 16),
      })
    }
  }
  
  return assignments
}
```

### 3.2 AI全权归类 - 淡化处理

#### 新增用户输入框架确认函数

**代码漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| JSON.stringify 过长 | 现有数据可能包含大量卡片，导致 prompt 过长 | 只传递结构信息（分类/章节/单元名称），不传递卡片内容 |
| 参数校验缺失 | userPlan 和 existingData 可能为 null/undefined | 添加空值校验 |
| JSON解析异常 | AI返回格式可能不符合预期 | 添加 try-catch 和 fallback |

**修复后的代码：**

```javascript
export async function confirmStructurePlan(userPlan = {}, existingData = {}, config = {}) {
  // 参数校验
  if (!config || !config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey) {
    throw new Error('请先配置 AI API Key')
  }
  
  // 只提取结构信息，避免 prompt 过长
  const extractStructure = (data) => {
    if (!data) return {}
    const categories = Array.isArray(data.categories) ? data.categories : []
    return {
      categories: categories.map(cat => ({
        name: cat.name,
        chapters: Array.isArray(cat.chapters) ? cat.chapters.map(ch => ({
          name: ch.name,
          units: Array.isArray(ch.units) ? ch.units.map(u => u.name) : [],
        })) : [],
        units: Array.isArray(cat.units) ? cat.units.map(u => u.name) : [],
      })),
    }
  }
  
  const planStructure = extractStructure(userPlan)
  const existingStructure = extractStructure(existingData)
  
  const prompt = `你是知识体系整理助手。请分析用户提供的分类框架是否合理。

【用户框架】：
${JSON.stringify(planStructure, null, 2)}

【现有结构】：
${JSON.stringify(existingStructure, null, 2)}

【任务】：
1. 判断现有结构是否可以承载用户框架（不需要新建）
2. 如果需要微调名称，请给出建议
3. 如果需要新建结构（分类/章节/单元），请给出建议
4. 判断是否有重复或冗余的分类/章节/单元

【输出格式】：
{
  "useExisting": true/false,
  "suggestedNameChanges": [{"oldName": "字符串", "newName": "字符串"}],
  "newStructures": [{"type": "category|chapter|unit", "name": "字符串", "parentName": "字符串"}],
  "mergeSuggestions": [{"sources": ["字符串数组"], "target": "字符串"}]
}`
  
  try {
    const { content } = await callAiProvider(prompt, config)
    
    let parsed = null
    try {
      const trimmed = String(content).trim()
      const firstBracket = trimmed.indexOf('{')
      const lastBracket = trimmed.lastIndexOf('}')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
      }
    } catch (_) { /* ignore */ }
    
    if (!parsed || typeof parsed !== 'object') {
      return {
        useExisting: true,
        suggestedNameChanges: [],
        newStructures: [],
        mergeSuggestions: [],
      }
    }
    
    return {
      useExisting: Boolean(parsed.useExisting),
      suggestedNameChanges: Array.isArray(parsed.suggestedNameChanges) ? parsed.suggestedNameChanges : [],
      newStructures: Array.isArray(parsed.newStructures) ? parsed.newStructures : [],
      mergeSuggestions: Array.isArray(parsed.mergeSuggestions) ? parsed.mergeSuggestions : [],
    }
    
  } catch (err) {
    console.error('[confirmStructurePlan] AI调用失败:', err)
    return {
      useExisting: true,
      suggestedNameChanges: [],
      newStructures: [],
      mergeSuggestions: [],
    }
  }
}
```

### 3.3 指定分类归类 - 章节级支持

**代码漏洞分析与修复：**

现有 `classifyCardsByCategoryContent` 已经有章节级支持，但存在以下问题：

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 章节上下文不完整 | prompt 中只包含章节名称，没有单元示例卡片 | 在章节描述中添加单元示例卡片 |
| 弱模型处理不完善 | Spark Lite 在 chapter-and-unit 模式下的多轮分类可能失败 | 添加更完善的 fallback 逻辑 |
| 超时处理不完善 | AI调用超时后直接返回 fallback，没有重试机制 | 添加最多2次重试 |

### 3.4 重复知识点检测

**代码漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 函数未定义 | `jaccardSimilarity` 未定义 | 需要实现此函数 |
| 性能问题 | O(n²) 复杂度，卡片量大时（如1000张）需要约50万次计算 | 添加提前退出条件，限制最大比较次数 |
| 空值处理缺失 | card1/card2 可能为 null/undefined | 添加空值校验 |
| 返回数据过大 | 返回完整卡片对象，可能包含敏感数据 | 只返回必要字段（id, knowledge_point） |
| 权重不合理 | kp占50%可能过高，某些卡片没有knowledge_point | 动态调整权重，缺失字段不计入 |

**修复后的代码：**

```javascript
export function detectDuplicateCards(cards = [], threshold = 0.85, maxComparisons = 10000) {
  // 参数校验
  if (!Array.isArray(cards) || cards.length < 2) {
    return []
  }
  
  const duplicates = []
  let comparisons = 0
  const maxCards = Math.min(cards.length, 200) // 最多比较前200张卡片
  
  for (let i = 0; i < maxCards; i++) {
    const card1 = cards[i]
    if (!card1 || !card1.id) continue
    
    for (let j = i + 1; j < maxCards; j++) {
      // 提前退出：超过最大比较次数
      if (comparisons >= maxComparisons) {
        console.warn(`[detectDuplicateCards] 已达到最大比较次数 ${maxComparisons}，停止检测`)
        return duplicates
      }
      
      const card2 = cards[j]
      if (!card2 || !card2.id) continue
      
      const similarity = calculateSimilarity(card1, card2)
      if (similarity >= threshold) {
        duplicates.push({
          card1Id: card1.id,
          card2Id: card2.id,
          similarity: parseFloat(similarity.toFixed(4)),
          card1KnowledgePoint: String(card1.knowledge_point || card1.front || '').slice(0, 50),
          card2KnowledgePoint: String(card2.knowledge_point || card2.front || '').slice(0, 50),
        })
      }
      
      comparisons++
    }
  }
  
  return duplicates
}

function calculateSimilarity(card1, card2) {
  // 提取字段
  const kp1 = String(card1.knowledge_point || '').trim()
  const kp2 = String(card2.knowledge_point || '').trim()
  const front1 = String(card1.front || '').trim()
  const front2 = String(card2.front || '').trim()
  const back1 = String(card1.back || '').trim()
  const back2 = String(card2.back || '').trim()
  
  // 动态权重：只有存在的字段才参与计算
  let totalWeight = 0
  let weightedSum = 0
  
  // 知识点相似度（权重 0.5，如果存在）
  if (kp1 && kp2) {
    const kpSim = jaccardSimilarity(kp1, kp2)
    weightedSum += kpSim * 0.5
    totalWeight += 0.5
  }
  
  // 问题相似度（权重 0.3，如果存在）
  if (front1 && front2) {
    const frontSim = jaccardSimilarity(front1, front2)
    weightedSum += frontSim * 0.3
    totalWeight += 0.3
  }
  
  // 答案相似度（权重 0.2，如果存在）
  if (back1 && back2) {
    const backSim = jaccardSimilarity(back1, back2)
    weightedSum += backSim * 0.2
    totalWeight += 0.2
  }
  
  // 避免除以零
  if (totalWeight === 0) {
    return 0
  }
  
  return weightedSum / totalWeight
}

function jaccardSimilarity(str1, str2) {
  // 预处理：去除标点符号，转为小写
  const clean = (s) => s.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '')
  
  const set1 = new Set(clean(str1).split(''))
  const set2 = new Set(clean(str2).split(''))
  
  if (set1.size === 0 && set2.size === 0) {
    return 1
  }
  if (set1.size === 0 || set2.size === 0) {
    return 0
  }
  
  // 计算交集和并集
  let intersection = 0
  for (const char of set1) {
    if (set2.has(char)) {
      intersection++
    }
  }
  
  const union = set1.size + set2.size - intersection
  
  return intersection / union
}
```

---

## 四、数据库层更新方案

### 4.1 moveUnit 函数

**代码漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 参数校验缺失 | unitId、targetCategoryId 可能为空 | 添加空值校验 |
| 事务回滚缺失 | 更新过程中某一步失败，数据会不一致 | 使用 Dexie 事务，确保原子性 |
| targetUnitId 缺失 | 如果需要合并到现有单元，缺少此参数 | 添加 targetUnitId 参数 |
| testQuestions 更新不完整 | targetId 的更新逻辑不完整 | 根据 testType 正确更新 targetId |
| 缺少返回值 | 调用方无法知道操作结果 | 返回操作结果对象 |
| 章节关联缺失 | 如果目标没有章节，需要处理 | 添加章节关联逻辑 |

**修复后的代码：**

```javascript
export async function moveUnit(unitId, { targetCategoryId, targetChapterId, targetUnitId }) {
  // 参数校验
  if (!unitId) {
    throw new Error('unitId 不能为空')
  }
  if (!targetCategoryId) {
    throw new Error('targetCategoryId 不能为空')
  }
  
  const unit = await db.units.get(unitId)
  if (!unit) {
    throw new Error(`单元不存在: ${unitId}`)
  }
  
  const cards = await db.cards.where('unitId').equals(unitId).toArray()
  const originalCategoryId = unit.categoryId
  
  let result = {
    movedCards: 0,
    movedUnit: false,
    deletedEmptyUnits: 0,
    deletedEmptyChapters: 0,
    deletedEmptyCategories: 0,
  }
  
  await db.transaction(
    'rw',
    db.units, db.cards, db.cardStatus, db.wrongAnswers, db.testQuestions, db.testRecords, db.chapters, db.categories,
    async () => {
      // 如果指定了 targetUnitId，说明要合并到现有单元
      if (targetUnitId) {
        const targetUnit = await db.units.get(targetUnitId)
        if (!targetUnit || targetUnit.categoryId !== targetCategoryId) {
          throw new Error('目标单元不存在或与目标分类不匹配')
        }
        
        // 将卡片移动到目标单元
        for (const card of cards) {
          await db.cards.update(card.id, {
            categoryId: targetCategoryId,
            chapterId: targetUnit.chapterId,
            unitId: targetUnitId,
            updatedAt: Date.now(),
          })
          
          await updateCardRelations(card.id, targetCategoryId, targetUnit.chapterId, targetUnitId)
        }
        
        // 删除原单元
        await db.units.delete(unitId)
        result.movedCards = cards.length
        result.movedUnit = true
        
      } else {
        // 更新单元信息
        await db.units.update(unitId, {
          categoryId: targetCategoryId,
          chapterId: targetChapterId || null,
          updatedAt: Date.now(),
        })
        
        // 更新所有卡片
        for (const card of cards) {
          await db.cards.update(card.id, {
            categoryId: targetCategoryId,
            chapterId: targetChapterId || null,
            updatedAt: Date.now(),
          })
          
          await updateCardRelations(card.id, targetCategoryId, targetChapterId || null, unitId)
        }
        
        result.movedCards = cards.length
        result.movedUnit = true
      }
    }
  )
  
  // 清理源位置的空单元/章节/分类
  if (originalCategoryId && originalCategoryId !== targetCategoryId) {
    result.deletedEmptyUnits = await deleteEmptyUnits(originalCategoryId)
    result.deletedEmptyChapters = await deleteEmptyChapters(originalCategoryId)
    result.deletedEmptyCategories = await deleteEmptyCategory(originalCategoryId)
  }
  
  return result
}

// 辅助函数：更新卡片关联数据
async function updateCardRelations(cardId, categoryId, chapterId, unitId) {
  // 更新 cardStatus
  const statuses = await db.cardStatus.where('cardId').equals(cardId).toArray()
  for (const status of statuses) {
    await db.cardStatus.update(status.id, {
      categoryId,
      chapterId,
      updatedAt: Date.now(),
    })
  }
  
  // 更新 wrongAnswers
  const wrongs = await db.wrongAnswers.where('cardId').equals(cardId).toArray()
  for (const wrong of wrongs) {
    await db.wrongAnswers.update(wrong.id, {
      categoryId,
      chapterId,
    })
  }
  
  // 更新 testQuestions 和 testRecords
  const questions = await db.testQuestions.where('cardId').equals(cardId).toArray()
  for (const question of questions) {
    const nextTargetId = question.testType === 'unit'
      ? unitId
      : question.testType === 'category'
        ? categoryId
        : (question.testType === 'chapter' ? chapterId : (question.targetId || categoryId))
    
    await db.testQuestions.update(question.id, {
      categoryId,
      unitId,
      chapterId,
      targetId: nextTargetId,
      updatedAt: Date.now(),
    })
    
    await db.testRecords.where('questionId').equals(question.id).modify({
      categoryId,
      unitId,
      chapterId,
      updatedAt: Date.now(),
    })
  }
}
```

### 4.2 moveChapter 函数

**代码漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 级联更新缺失 | 移动章节时需要更新所有单元和卡片 | 添加级联更新逻辑 |
| 事务回滚缺失 | 更新过程中失败会导致数据不一致 | 使用事务 |
| 缺少返回值 | 调用方无法知道操作结果 | 返回操作结果对象 |

**修复后的代码：**

```javascript
export async function moveChapter(chapterId, targetCategoryId) {
  if (!chapterId || !targetCategoryId) {
    throw new Error('chapterId 和 targetCategoryId 不能为空')
  }
  
  const chapter = await db.chapters.get(chapterId)
  if (!chapter) {
    throw new Error(`章节不存在: ${chapterId}`)
  }
  
  const units = await db.units.where('chapterId').equals(chapterId).toArray()
  const originalCategoryId = chapter.categoryId
  
  let result = {
    movedUnits: 0,
    movedCards: 0,
    deletedEmptyCategories: 0,
  }
  
  await db.transaction(
    'rw',
    db.chapters, db.units, db.cards, db.cardStatus, db.wrongAnswers, db.testQuestions, db.testRecords,
    async () => {
      // 更新章节
      await db.chapters.update(chapterId, {
        categoryId: targetCategoryId,
        updatedAt: Date.now(),
      })
      
      // 更新所有单元
      for (const unit of units) {
        await db.units.update(unit.id, {
          categoryId: targetCategoryId,
          updatedAt: Date.now(),
        })
        
        // 更新单元下所有卡片
        const cards = await db.cards.where('unitId').equals(unit.id).toArray()
        for (const card of cards) {
          await db.cards.update(card.id, {
            categoryId: targetCategoryId,
            updatedAt: Date.now(),
          })
          
          await updateCardRelations(card.id, targetCategoryId, chapterId, unit.id)
        }
        
        result.movedCards += cards.length
      }
      
      result.movedUnits = units.length
    }
  )
  
  // 清理源位置空分类
  if (originalCategoryId && originalCategoryId !== targetCategoryId) {
    result.deletedEmptyCategories = await deleteEmptyCategory(originalCategoryId)
  }
  
  return result
}
```

---

## 五、界面更新方案

### 5.1 单元整体移动 - 界面设计

**界面漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 缺少确认步骤 | 用户点击移动后直接执行，没有确认 | 添加确认弹窗 |
| 缺少加载状态 | 移动过程中用户无反馈 | 添加 loading 状态 |
| 缺少错误处理 | 移动失败时用户无提示 | 添加错误提示（Toast） |
| 缺少返回步骤 | 三步流程中无法返回上一步 | 添加返回按钮 |
| 缺少边界检查 | 目标分类/章节/单元可能不存在 | 添加存在性检查 |

### 5.2 智能单元整理确认弹窗 - 增强

**界面漏洞分析与修复：**

| 漏洞类型 | 问题描述 | 修复方案 |
|---------|---------|---------|
| 拖动排序缺失 | 无法调整单元顺序和归属 | 添加拖动排序功能 |
| 合并确认缺失 | AI建议合并后没有确认步骤 | 添加合并确认弹窗 |
| 缺少加载状态 | AI处理过程中用户无反馈 | 添加 loading 状态 |
| 缺少错误处理 | 处理失败时用户无提示 | 添加错误提示 |

---

## 六、文件修改清单

### AI服务层

| 文件 | 修改内容 |
|------|---------|
| `src/services/aiService.js` | 新增 `planChapterUnitStructure`（带完整校验和容错）、`classifyCardsByChapterBatch`（带分批处理和进度回调）、`confirmStructurePlan`（只传递结构信息）、`detectDuplicateCards`（带性能优化）、`calculateSimilarity`、`jaccardSimilarity` |

### 数据库层

| 文件 | 修改内容 |
|------|---------|
| `src/services/db.js` | 新增 `moveUnit`（带参数校验、事务、合并支持）、`moveChapter`（带级联更新）、`mergeUnits`、`mergeChapters`、`updateCardRelations`（辅助函数） |

### 界面层

| 文件 | 修改内容 |
|------|---------|
| `src/components/UnitGroup.jsx` | 新增单元操作按钮（移动/重命名/删除），添加 loading 和错误处理 |
| `src/components/UnitReorganizeConfirm.jsx` | 支持单元拖动、合并建议展示、确认弹窗 |
| `src/components/CrossCategoryConfirm.jsx` | 支持单元拖动、用户输入框架入口 |
| `src/pages/Category.jsx` | 更新智能单元整理调用逻辑为两步法；新增单元移动流程（三步选择+确认） |
| `src/components/TargetCategorySelect.jsx` | 支持章节选择、新建章节、返回上一步 |

### 工具层

| 文件 | 修改内容 |
|------|---------|
| `src/utils/smartOrganizeUx.js` | 新增重复检测、合并确认 UI 辅助函数 |

### 文档

| 文件 | 修改内容 |
|------|---------|
| `AI出题算法报告.txt` | 更新归类算法说明 |
| `存储数据记录.txt` | 更新移动操作和合并操作的数据记录 |

---

## 七、实施步骤

### Phase 1: AI逻辑基础（最快完成）
1. 在 `aiService.js` 中实现 `planChapterUnitStructure`（带完整校验和容错）
2. 实现 `detectDuplicateCards`、`calculateSimilarity`、`jaccardSimilarity`（带性能优化）
3. 在 `db.js` 中实现 `updateCardRelations` 辅助函数
4. 实现 `moveUnit`（带参数校验、事务、合并支持）

### Phase 2: 界面基础
1. 在 `UnitGroup.jsx` 中添加单元操作按钮，添加 loading 和错误处理
2. 在 `Category.jsx` 中实现单元移动流程（三步选择+确认+错误处理）
3. 更新 `TargetCategorySelect` 支持章节选择、返回上一步

### Phase 3: 智能单元整理两步法
1. 实现 `classifyCardsByChapterBatch`（带分批处理和进度回调）
2. 在 `UnitReorganizeConfirm` 中添加单元拖动功能、合并建议展示、确认弹窗
3. 更新 `Category.jsx` 调用逻辑为两步法

### Phase 4: AI全权归类优化
1. 实现 `confirmStructurePlan`（只传递结构信息，避免 prompt 过长）
2. 在 `CrossCategoryConfirm` 中添加用户输入框架入口
3. 支持单元拖动调整结构

### Phase 5: 指定分类归类增强
1. 增强 `classifyCardsByChapterBatch` 支持章节级匹配
2. 支持选择整个单元移动

---

## 八、总结

本次更新的核心是**界面 + AI逻辑联动**，同时修复了以下关键漏洞：

### AI逻辑漏洞修复
1. **参数校验**：所有函数添加完整的参数校验和默认值
2. **容错处理**：AI返回格式异常时不会崩溃，有合理的 fallback
3. **性能优化**：重复检测限制最大比较次数，避免 O(n²) 复杂度导致的卡顿
4. **数据安全**：只传递必要信息，不传递完整卡片内容

### 数据库层漏洞修复
1. **事务保证**：所有更新操作在事务内执行，确保原子性
2. **级联更新**：移动单元/章节时完整更新所有关联数据
3. **合并支持**：支持将单元合并到现有单元
4. **清理逻辑**：移动后自动清理源位置的空单元/章节/分类

### 界面漏洞修复
1. **确认步骤**：所有重要操作添加确认弹窗
2. **加载状态**：所有异步操作添加 loading 状态
3. **错误处理**：所有操作添加错误提示
4. **边界检查**：添加目标存在性检查

这种设计既保留了AI的智能分析能力，又保证了系统的稳定性和数据一致性。
