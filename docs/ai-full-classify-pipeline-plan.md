# AI 全权归类 4 段流水线改造计划

> **目标：** 将 AI 全权归类从"2 步一次性调用"重置为"4 段分批流水线"，解决卡片数量庞大时 AI 无法有效处理的问题，并实现更精细的分类→章节→单元规划。

***

## 架构概览

```
当前流程（2步，无分批）:
  planCrossCategoryStructure(全部卡片) → assignCardsCrossCategory(全部卡片)

新流程（4段，分批处理）:
  Part1: 分批新建单元 → Part2: 分批合并单元 → Part3: 分类归属 → Part4: 分批建章节
```

### 数据流

```
输入: selectedCards[], existingUnits[], existingChapters[], existingCategories[]

Part1: batchCreateUnits
  ├─ 系统按当前单元分组，每批~30张知识点
  ├─ AI判断: 是否新建单元? 返回单元名+概述+知识点分配
  └─ 输出: units = [{ unitName, overview, cardIndices }]

Part2: batchMergeUnits
  ├─ 输入: Part1所有单元名+概述
  ├─ AI判断: 哪些单元可合并? 返回合并后单元名+概述
  └─ 输出: mergedUnits = [{ unitName, overview, cardIndices(合并) }]

Part3: assignUnitsToCategories
  ├─ 输入: mergedUnits名+概述 + 已有分类名
  ├─ AI判断: 每个单元归属哪个分类?
  └─ 输出: categories = [{ categoryName, isNew, units: [unitName] }]

Part4: batchCreateChapters
  ├─ 输入: 每个分类下的单元名+概述 (已有章节不输入)
  ├─ AI判断: 为每个分类创建章节
  └─ 输出: finalStructure = [{ categoryName, categoryPurpose, chapters: [{ chapterName, units: [unitName] }] }]

最终: 将cardIndices映射回实际卡片对象，返回兼容格式
```

***

## 涉及文件

| 文件                          | 修改内容                                  |
| --------------------------- | ------------------------------------- |
| `src/services/aiService.js` | 新增4个函数，重写 `classifyCrossCategoryAuto` |
| `src/pages/Category.jsx`    | 修复 `classificationDepth` 传递，添加进度提示    |

***

## Task 1: Part1 - 分批新建单元 `batchCreateUnits`

**文件:** `src/services/aiService.js` (在 `classifyCrossCategoryAuto` 函数前新增)

### 1.1 分批策略

```javascript
// 常量定义（放在文件顶部常量区）
const CROSS_CATEGORY_BATCH_SIZE = 30  // 每批最大知识点数

/**
 * 将卡片按当前单元结构分批
 * 策略: 同一单元的卡片尽量在同一批，小单元合并，大单元拆分
 */
function splitCardsIntoBatches(cards, existingUnits) {
  const batches = []

  // 1. 按当前 unitId 分组
  const unitGroups = new Map() // unitId -> [cardIndices]
  const noUnitCards = []        // 无单元的卡片索引

  cards.forEach((card, idx) => {
    if (card.unitId != null) {
      if (!unitGroups.has(card.unitId)) {
        unitGroups.set(card.unitId, [])
      }
      unitGroups.get(card.unitId).push(idx)
    } else {
      noUnitCards.push(idx)
    }
  })

  // 2. 将每个单元组按 BATCH_SIZE 拆分
  const allChunks = [] // [{ unitId, unitName, indices: [] }]

  for (const [unitId, indices] of unitGroups) {
    const unit = existingUnits.find(u => u.id === unitId)
    const unitName = unit?.name || ''
    for (let i = 0; i < indices.length; i += CROSS_CATEGORY_BATCH_SIZE) {
      allChunks.push({
        unitId,
        unitName,
        indices: indices.slice(i, i + CROSS_CATEGORY_BATCH_SIZE),
      })
    }
  }

  // 3. 无单元的卡片也按 BATCH_SIZE 分组
  for (let i = 0; i < noUnitCards.length; i += CROSS_CATEGORY_BATCH_SIZE) {
    allChunks.push({
      unitId: null,
      unitName: '',
      indices: noUnitCards.slice(i, i + CROSS_CATEGORY_BATCH_SIZE),
    })
  }

  // 4. 合并小批次: 累积 indices 直到达到 BATCH_SIZE
  let currentBatch = []
  let currentCount = 0

  for (const chunk of allChunks) {
    if (currentCount + chunk.indices.length > CROSS_CATEGORY_BATCH_SIZE && currentBatch.length > 0) {
      batches.push(currentBatch)
      currentBatch = []
      currentCount = 0
    }
    currentBatch.push(chunk)
    currentCount += chunk.indices.length
  }
  if (currentBatch.length > 0) batches.push(currentBatch)

  return batches
}
```

### 1.2 AI 调用函数

```javascript
/**
 * Part1: 分批新建单元
 * @param {Array} cards - 所有待分类卡片
 * @param {Array} existingUnits - 现有单元列表
 * @param {object} config - AI配置
 * @param {object} options - { onProgress }
 * @returns {Promise<{ units: Array<{ unitName, overview, cardIndices: number[] }> }>}
 */
async function batchCreateUnits(cards, existingUnits, config, options = {}) {
  const { onProgress } = options
  const batches = splitCardsIntoBatches(cards, existingUnits)
  console.log(`[batchCreateUnits] 共 ${cards.length} 张卡片, 分 ${batches.length} 批`)

  const allUnits = [] // [{ unitName, overview, cardIndices }]

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchIndices = batch.flatMap(ch => ch.indices)
    const batchCards = batchIndices.map(idx => cards[idx])

    // 构建本批卡片内容
    const cardLines = batchCards.map((c, i) => {
      const kp = String(c.knowledge_point || c.front || '').slice(0, 120)
      return `卡${i}: ${kp}`
    }).join('\n')

    // 构建当前单元信息
    const unitInfo = batch.map((ch, ci) => {
      if (ch.unitName) {
        return `批次单元${ci + 1}: ${ch.unitName}（${ch.indices.length}张）`
      }
      return `批次单元${ci + 1}: 无现有单元（${ch.indices.length}张）`
    }).join('\n')

    const prompt = `你是考研速记卡片的知识体系架构助手。请分析以下知识点，判断是否需要新建单元或调整现有单元。

【当前批次单元信息】：
${unitInfo}

【待分析知识点（共 ${batchCards.length} 张）】：
${cardLines}

【任务要求】：
1. 分析这些知识点的语义关联性
2. 判断是否需要新建单元：
   - 如果现有单元名称适合这些知识点，保留现有单元名
   - 如果知识点不属于现有单元，新建单元
   - 同一主题的知识点必须归入同一单元
3. 为每个单元生成概述，概述内容为：与什么学科有关，与学科内什么章节有关

【输出格式】请严格返回 JSON 对象，不要额外文字、不要代码块：
{
  "units": [
    {
      "unitName": "单元名称",
      "overview": "概述：与XX学科有关，与学科内XX章节有关",
      "isNew": true,
      "cardIndices": [0, 1, 2]
    }
  ]
}`

    if (onProgress) {
      onProgress({
        step: 1,
        current: i + 1,
        total: batches.length,
        message: `Part1 分批新建单元: ${i + 1}/${batches.length}`,
      })
    }

    const result = await callAiProvider(prompt, {
      ...config,
      temperature: 0.3,
      max_tokens: 4096,
    })

    logAiCall({
      purpose: 'cross-category-batch-units',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })

    // 解析 AI 返回
    const parsed = parsePlanStructureResult(result.content)
    if (parsed && Array.isArray(parsed.units)) {
      for (const u of parsed.units) {
        const unitName = String(u.unitName || '').trim().slice(0, 16)
        const overview = String(u.overview || '').trim()
        const cardIndices = (u.cardIndices || [])
          .filter(idx => idx >= 0 && idx < batchCards.length)
          .map(idx => batchIndices[idx]) // 映射回原始索引

        if (unitName && cardIndices.length > 0) {
          allUnits.push({ unitName, overview, cardIndices })
        }
      }
    }
  }

  // 处理未分配的卡片（兜底）
  const assignedSet = new Set(allUnits.flatMap(u => u.cardIndices))
  const unassigned = []
  for (let i = 0; i < cards.length; i++) {
    if (!assignedSet.has(i)) unassigned.push(i)
  }
  if (unassigned.length > 0) {
    console.warn(`[batchCreateUnits] ${unassigned.length} 张卡片未分配，按原始顺序归入默认单元`)
    allUnits.push({
      unitName: '未分类知识点',
      overview: '未能通过AI归类的知识点',
      cardIndices: unassigned,
    })
  }

  console.log(`[batchCreateUnits] 完成: ${allUnits.length} 个单元, ${cards.length} 张卡片`)
  return { units: allUnits }
}
```

***

## Task 2: Part2 - 分批合并单元 `batchMergeUnits`

**文件:** `src/services/aiService.js`

```javascript
/**
 * Part2: 分批合并单元
 * @param {Array} unitsFromPart1 - Part1输出的单元列表
 * @param {object} config - AI配置
 * @param {object} options - { onProgress }
 * @returns {Promise<{ units: Array<{ unitName, overview, cardIndices }> }>}
 */
async function batchMergeUnits(unitsFromPart1, config, options = {}) {
  const { onProgress } = options

  if (unitsFromPart1.length <= 1) {
    return { units: unitsFromPart1 }
  }

  // 构建单元名+概述列表
  const unitLines = unitsFromPart1.map((u, i) => {
    return `单元${i}: ${u.unitName} - ${u.overview}（${u.cardIndices.length}张卡片）`
  }).join('\n')

  const prompt = `你是考研速记卡片的知识体系架构助手。请分析以下单元列表，判断哪些单元可以合并。

【当前单元列表（共 ${unitsFromPart1.length} 个）】：
${unitLines}

【合并规则】：
1. 只有语义高度相似的单元才合并（如"排序算法"和"排序"可合并）
2. 合并后需要生成新的单元名和概述
3. 不同学科的单元不得合并
4. 合并后单元名不超过 16 个字

【输出格式】请严格返回 JSON 对象，不要额外文字、不要代码块：
{
  "mergeGroups": [
    {
      "mergedUnitName": "合并后单元名",
      "overview": "合并后概述",
      "sourceUnitIndices": [0, 2]
    }
  ]
}

注意：未被任何 mergeGroup 包含的单元将保持不变。`

  if (onProgress) {
    onProgress({
      step: 2,
      current: 1,
      total: 1,
      message: `Part2 单元合并分析中...`,
    })
  }

  const result = await callAiProvider(prompt, {
    ...config,
    temperature: 0.3,
    max_tokens: 4096,
  })

  logAiCall({
    purpose: 'cross-category-merge-units',
    modelName: getModelName(config.aiServiceMode, config.model),
    durationMs: 0,
    status: 'success',
    tokens: result.tokens,
    prompt: prompt,
    response: result.content,
  })

  // 解析合并结果
  const parsed = parsePlanStructureResult(result.content)
  const mergedUnits = []
  const mergedIndices = new Set()

  if (parsed && Array.isArray(parsed.mergeGroups)) {
    for (const group of parsed.mergeGroups) {
      const sourceIndices = (group.sourceUnitIndices || [])
        .filter(idx => idx >= 0 && idx < unitsFromPart1.length)

      if (sourceIndices.length === 0) continue

      const mergedName = String(group.mergedUnitName || '').trim().slice(0, 16)
      const overview = String(group.overview || '').trim()

      // 合并 cardIndices
      const cardIndices = sourceIndices.flatMap(idx => unitsFromPart1[idx].cardIndices)
      sourceIndices.forEach(idx => mergedIndices.add(idx))

      if (mergedName && cardIndices.length > 0) {
        mergedUnits.push({ unitName: mergedName, overview, cardIndices })
      }
    }
  }

  // 未被合并的单元保持原样
  for (let i = 0; i < unitsFromPart1.length; i++) {
    if (!mergedIndices.has(i)) {
      mergedUnits.push(unitsFromPart1[i])
    }
  }

  console.log(`[batchMergeUnits] 合并前: ${unitsFromPart1.length} 单元, 合并后: ${mergedUnits.length} 单元`)
  return { units: mergedUnits }
}
```

***

## Task 3: Part3 - 分类归属 `assignUnitsToCategories`

**文件:** `src/services/aiService.js`

```javascript
/**
 * Part3: 分类归属
 * @param {Array} units - Part2输出的单元列表
 * @param {Array} existingCategoryNames - 已有分类名列表
 * @param {object} config - AI配置
 * @param {object} options - { onProgress }
 * @returns {Promise<{ categories: Array<{ categoryName, isNew, units: [unitName] }> }>}
 */
async function assignUnitsToCategories(units, existingCategoryNames, config, options = {}) {
  const { onProgress } = options

  const unitLines = units.map((u, i) => {
    return `单元${i}: ${u.unitName} - ${u.overview}`
  }).join('\n')

  const existingCatText = existingCategoryNames.length > 0
    ? `\n【已有分类名（优先复用）】：\n${existingCategoryNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
    : ''

  const prompt = `你是考研速记卡片的知识体系架构助手。请将以下单元归属到合适的分类中。

【单元列表（共 ${units.length} 个）】：
${unitLines}
${existingCatText}

【分类规则】：
1. 分类名必须是学科名称（如"计算机"、"中药学"、"高等数学"），不得包含"基础"、"概论"等修饰词
2. 优先将单元归入已有分类（名称必须完全一致）
3. 只有当单元明显不属于任何已有分类时，才新建分类
4. 严禁新建与已有分类相似的分类（如已有"计算机"则不得新建"计算机基础"）
5. 同一学科的不同子领域必须归入同一分类

【输出格式】请严格返回 JSON 对象，不要额外文字、不要代码块：
{
  "categories": [
    {
      "categoryName": "分类名",
      "isNew": false,
      "unitIndices": [0, 1, 3]
    }
  ]
}`

  if (onProgress) {
    onProgress({
      step: 3,
      current: 1,
      total: 1,
      message: `Part3 分类归属分析中...`,
    })
  }

  const result = await callAiProvider(prompt, {
    ...config,
    temperature: 0.3,
    max_tokens: 4096,
  })

  logAiCall({
    purpose: 'cross-category-assign',
    modelName: getModelName(config.aiServiceMode, config.model),
    durationMs: 0,
    status: 'success',
    tokens: result.tokens,
    prompt: prompt,
    response: result.content,
  })

  // 解析结果
  const parsed = parsePlanStructureResult(result.content)
  const categories = []

  if (parsed && Array.isArray(parsed.categories)) {
    for (const cat of parsed.categories) {
      const categoryName = String(cat.categoryName || '').trim().slice(0, 14)
      const unitIndices = (cat.unitIndices || [])
        .filter(idx => idx >= 0 && idx < units.length)

      if (categoryName && unitIndices.length > 0) {
        const unitNames = unitIndices.map(idx => units[idx].unitName)
        const isNew = !existingCategoryNames.includes(categoryName)
        categories.push({ categoryName, isNew, unitNames, unitIndices })
      }
    }
  }

  // 兜底：未归属的单元放入"未分类"
  const assignedUnitIndices = new Set(categories.flatMap(c => c.unitIndices))
  const unassignedUnits = []
  for (let i = 0; i < units.length; i++) {
    if (!assignedUnitIndices.has(i)) unassignedUnits.push(i)
  }
  if (unassignedUnits.length > 0) {
    categories.push({
      categoryName: '未分类',
      isNew: true,
      unitNames: unassignedUnits.map(i => units[i].unitName),
      unitIndices: unassignedUnits,
    })
  }

  console.log(`[assignUnitsToCategories] ${categories.length} 个分类`)
  return { categories }
}
```

***

## Task 4: Part4 - 分批建立章节 `batchCreateChapters`

**文件:** `src/services/aiService.js`

```javascript
/**
 * Part4: 分批建立章节
 * @param {Array} categoryAssignments - Part3输出的分类归属
 * @param {Array} units - Part2输出的单元列表（含概述）
 * @param {Array} existingChapters - 已有章节列表
 * @param {object} config - AI配置
 * @param {object} options - { onProgress, categoryPurposes }
 * @returns {Promise<{ categories: Array<{ categoryName, categoryPurpose, chapters: [{ chapterName, unitNames }] }> }>}
 */
async function batchCreateChapters(categoryAssignments, units, existingChapters, config, options = {}) {
  const { onProgress, categoryPurposes = {} } = options
  const finalCategories = []

  for (let ci = 0; ci < categoryAssignments.length; ci++) {
    const cat = categoryAssignments[ci]
    const categoryName = cat.categoryName

    // 获取该分类下的单元+概述
    const catUnits = cat.unitIndices.map(idx => ({
      unitName: units[idx].unitName,
      overview: units[idx].overview,
      cardIndices: units[idx].cardIndices,
    }))

    // 已有章节（不输入给AI，只用于跳过）
    const existingChapterNames = existingChapters
      .filter(ch => ch.categoryName === categoryName)
      .map(ch => ch.name)

    const unitLines = catUnits.map((u, i) => {
      return `单元${i}: ${u.unitName} - ${u.overview}`
    }).join('\n')

    // 分类目的（仅本地为空时输入给AI）
    const localPurpose = categoryPurposes[categoryName]
    const purposeContext = (!localPurpose || localPurpose.trim() === '')
      ? '\n（注：此分类暂无分类目的，请在输出中为此分类生成一个分类目的）'
      : ''

    const prompt = `你是考研速记卡片的知识体系架构助手。请为以下分类的单元创建章节。

【分类名】: ${categoryName}${purposeContext}

【单元列表（共 ${catUnits.length} 个）】：
${unitLines}

【章节创建规则】：
1. 根据单元的概述和语义关联性，将单元归入合适的章节
2. 章节名代表学科下的子领域或知识模块，不超过 12 个字
3. 每个章节可包含 1-12 个单元
4. 语义相关的单元必须归入同一章节
5. 无关联的单元应放入不同章节

【输出格式】请严格返回 JSON 对象，不要额外文字、不要代码块：
{
  "categoryPurpose": "分类目的（若有）",
  "chapters": [
    {
      "chapterName": "章节名",
      "unitIndices": [0, 1]
    }
  ]
}`

    if (onProgress) {
      onProgress({
        step: 4,
        current: ci + 1,
        total: categoryAssignments.length,
        message: `Part4 建立章节: ${ci + 1}/${categoryAssignments.length} (${categoryName})`,
      })
    }

    const result = await callAiProvider(prompt, {
      ...config,
      temperature: 0.3,
      max_tokens: 4096,
    })

    logAiCall({
      purpose: 'cross-category-create-chapters',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })

    // 解析结果
    const parsed = parsePlanStructureResult(result.content)
    const chapters = []

    if (parsed && Array.isArray(parsed.chapters)) {
      for (const ch of parsed.chapters) {
        const chapterName = String(ch.chapterName || '').trim().slice(0, 12)
        const unitIndices = (ch.unitIndices || [])
          .filter(idx => idx >= 0 && idx < catUnits.length)

        if (chapterName && unitIndices.length > 0) {
          const unitNames = unitIndices.map(idx => catUnits[idx].unitName)
          chapters.push({ chapterName, unitNames, unitIndices })
        }
      }
    }

    // 兜底：未归入章节的单元放入"默认章节"
    const assignedUnitIndices = new Set(chapters.flatMap(ch => ch.unitIndices))
    const unassignedUnits = []
    for (let i = 0; i < catUnits.length; i++) {
      if (!assignedUnitIndices.has(i)) unassignedUnits.push(i)
    }
    if (unassignedUnits.length > 0) {
      chapters.push({
        chapterName: '默认章节',
        unitNames: unassignedUnits.map(i => catUnits[i].unitName),
        unitIndices: unassignedUnits,
      })
    }

    // 分类目的：本地已有则不替换
    const finalPurpose = (localPurpose && localPurpose.trim())
      ? localPurpose
      : (parsed?.categoryPurpose ? String(parsed.categoryPurpose).trim() : '')

    finalCategories.push({
      categoryName,
      categoryPurpose: finalPurpose,
      chapters,
      _catUnits: catUnits, // 保留用于后续映射
    })
  }

  return { categories: finalCategories }
}
```

***

## Task 5: 重写 `classifyCrossCategoryAuto` 为 4 段流水线

**文件:** `src/services/aiService.js` (行 7233-7337)

### 5.1 新的 `classifyCrossCategoryAuto` 函数

```javascript
async function classifyCrossCategoryAuto(
  existingUnits,
  existingCards,
  selectedCards,
  config,
  hasApi,
  classificationDepth,
  categoryPurpose,
  existingChapters = [],
  allCategories = []
) {
  const fallbackResult = () => buildCrossCategoryFallback(selectedCards, classificationDepth)
  if (!hasApi) return fallbackResult()

  if (isWeakModel(config)) {
    throw new Error('弱模型（Spark Lite）不支持跨分类 AI 全权归类。')
  }

  try {
    // ===== 4 段流水线 =====

    // Part1: 分批新建单元
    console.log('[classifyCrossCategoryAuto] Part1: 分批新建单元')
    const part1Result = await batchCreateUnits(selectedCards, existingUnits || [], config, {
      onProgress: (p) => console.log(`[Pipeline] ${p.message}`),
    })

    // Part2: 分批合并单元
    console.log('[classifyCrossCategoryAuto] Part2: 分批合并单元')
    const part2Result = await batchMergeUnits(part1Result.units, config, {
      onProgress: (p) => console.log(`[Pipeline] ${p.message}`),
    })

    // Part3: 分类归属
    console.log('[classifyCrossCategoryAuto] Part3: 分类归属')
    const existingCategoryNames = (allCategories || []).map(c => c.name)
    const part3Result = await assignUnitsToCategories(
      part2Result.units, existingCategoryNames, config, {
        onProgress: (p) => console.log(`[Pipeline] ${p.message}`),
      }
    )

    // Part4: 分批建立章节
    console.log('[classifyCrossCategoryAuto] Part4: 分批建立章节')
    const categoryPurposes = {}
    // 获取已有分类的目的（如果有）
    for (const cat of allCategories || []) {
      if (cat.purpose) categoryPurposes[cat.name] = cat.purpose
    }
    const part4Result = await batchCreateChapters(
      part3Result.categories, part2Result.units, existingChapters || [], config, {
        onProgress: (p) => console.log(`[Pipeline] ${p.message}`),
        categoryPurposes,
      }
    )

    // ===== 将结果映射回兼容格式 =====
    const categoryNameToCategoryId = new Map()
    for (const cat of allCategories || []) {
      if (cat.id != null && cat.name) {
        categoryNameToCategoryId.set(cat.name, cat.id)
      }
    }

    const categories = []
    for (let i = 0; i < part4Result.categories.length; i++) {
      const cat = part4Result.categories[i]
      const catName = cat.categoryName
      const catCategoryId = categoryNameToCategoryId.get(catName) ?? null

      // 将章节中的 unitNames 映射回实际卡片对象
      const chaptersWithCards = cat.chapters.map(ch => {
        const unitsWithCards = ch.unitIndices.map(ui => {
          const catUnit = cat._catUnits[ui]
          const cards = catUnit.cardIndices.map(idx => selectedCards[idx]).filter(Boolean)
          return {
            name: catUnit.unitName,
            cards,
          }
        }).filter(u => u.cards.length > 0)

        return {
          name: ch.chapterName,
          units: unitsWithCards,
        }
      }).filter(ch => ch.units.length > 0)

      if (chaptersWithCards.length > 0) {
        const chaptersWithTopic = await persistTopicsToChapters(chaptersWithCards, catCategoryId)
        categories.push({
          tempId: `tmp_cat_${i}`,
          name: catName,
          categoryId: catCategoryId,
          needsTopicPersistence: catCategoryId == null,
          chapters: chaptersWithTopic,
          categoryPurpose: cat.categoryPurpose || '',
        })
      }
    }

    if (categories.length === 0) {
      return fallbackResult()
    }

    console.log(`[classifyCrossCategoryAuto] 4段流水线完成: ${categories.length} 个分类`)
    return {
      mode: 'cross-category-auto',
      usedFallback: false,
      categories,
    }
  } catch (err) {
    console.error('[classifyCrossCategoryAuto] 4段流水线失败:', err)
    return fallbackResult()
  }
}
```

***

## Task 6: 修复 Category.jsx 中的 `classificationDepth` 传递

**文件:** `src/pages/Category.jsx` (行 2234)

### 修改前:

```javascript
classificationDepth: 'chapter-and-unit',  // 硬编码
```

### 修改后:

```javascript
classificationDepth: classificationDepth,  // 使用用户选择的策略
```

***

## Task 7: 添加进度回调到 Category.jsx

**文件:** `src/pages/Category.jsx` (行 2218 附近)

在 `classifyCardsByCategoryContent` 调用前添加进度状态:

```javascript
const [pipelineProgress, setPipelineProgress] = useState(null)

// 在调用 classifyCardsByCategoryContent 时传入 onProgress 回调
const result = await classifyCardsByCategoryContent(
  allCategoryUnits,
  allCategoryCards,
  cardsForPlan.map(card => ({ ... })),
  {
    mode: 'cross-category-auto',
    classificationDepth: classificationDepth,
    existingChapters: allCategoryChapters,
    allCategories: (state.categories || []).map(cat => ({ id: cat.id, name: cat.name })),
    aiServiceMode: state.aiServiceMode,
    apiKey: state.apiKey,
    model: state.aiServiceMode === 'iflytek-spark' ? state.iflytekSparkModel : state.model,
    sparkApiKey: state.iflytekSparkApiKey,
    sparkApiSecret: state.iflytekSparkApiSecret,
    volcanoApiKey: state.volcanoApiKey,
    dashscopeApiKey: state.dashscopeApiKey,
    categoryPurpose: currentCategoryPurpose,
    onProgress: (p) => {
      setPipelineProgress(p)
      bgtCtx.setFlowStep(flowId, 'ai_analyzing', p.message)
    },
  },
)
```

***

## 验证清单

1. **Part1 验证**: 180张卡片 → 6批（每批30张）→ AI返回单元名+概述+知识点分配
2. **Part2 验证**: 检查相似单元是否被合并，卡片归属是否同步
3. **Part3 验证**: 检查单元是否正确归属到已有分类（如"计算机"空分类被填充）
4. **Part4 验证**: 检查每个分类下是否正确建立章节，分类目的是否仅新建分类才有
5. **端到端验证**: 执行完整4段流水线，检查最终输出格式与 `handleConfirmCrossCategory` 兼容
6. **策略按钮验证**: 切换"仅到章节"/"仅到单元"/"章节+单元"策略，检查AI调用是否相应调整

