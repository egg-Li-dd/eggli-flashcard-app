# AI 分类方式优化规划

## 一、优化目标

将三种 AI 分类方式（智能单元整理、AI全权归类、指定分类归类）的逻辑统一为"两步法"，增强 Prompt 约束，优化大数据路径，增加分类结果校验，并考虑引入主题字段提升分类质量。

---

## 二、两步法统一架构

### 2.1 核心思想

将分类过程拆分为两个独立步骤：
- **第一步（结构规划）**：AI 分析卡片内容，规划章节/单元结构，不涉及具体卡片分配
- **第二步（卡片分配）**：根据第一步确定的结构，分批将卡片分配到各单元

### 2.2 两步法流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        两步法统一流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入：卡片列表 + 现有结构 + 分类深度                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 第一步：结构规划 (planStructure)                          │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 1. 分析卡片知识点分布                                      │   │
│  │ 2. 提取主题关键词                                          │   │
│  │ 3. 规划章节/单元层级结构                                    │   │
│  │ 4. 返回结构方案（不含卡片分配）                             │   │
│  │ 输出：{ chapters: [{ name, units: [{ name }] }] }         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 校验点：结构合理性检查                                      │   │
│  │ - 章节数量是否在合理范围                                    │   │
│  │ - 每章节单元数是否在 2-10 范围                              │   │
│  │ - 单元命名是否规范                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 第二步：卡片分配 (assignCards)                             │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 1. 按第一步确定的结构构建分类上下文                          │   │
│  │ 2. 卡片数量 > 阈值时按单元分批                              │   │
│  │ 3. 每批调用 AI 分配卡片到单元                               │   │
│  │ 4. 合并各批结果                                             │   │
│  │ 输出：{ chapters: [{ name, units: [{ name, cards }] }] }  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 校验点：分配结果合理性检查                                   │   │
│  │ - 每单元卡片数是否在 2-50 范围                              │   │
│  │ - 所有卡片是否都已分配                                      │   │
│  │ - 无重复分配                                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 异常修正：二次修正                                          │   │
│  │ - 单元卡片数过少 → 合并到相邻单元                           │   │
│  │ - 单元卡片数过多 → 拆分为多个单元                           │   │
│  │ - 未分配卡片 → 按关键词匹配归入最相似单元                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  输出：最终分类结果                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 三种方式的两步法适配

| 分类方式 | 第一步（结构规划） | 第二步（卡片分配） | 特殊处理 |
|---------|------------------|------------------|---------|
| **智能单元整理** | 在现有章节/单元基础上调整结构 | 将选中卡片分配到调整后的结构 | 保持分类不变，优先使用现有结构 |
| **AI全权归类** | 完全重新规划分类→章节→单元结构 | 将选中卡片分配到新结构 | 可创建新分类，最多5个 |
| **指定分类归类** | 在指定分类的现有结构基础上扩展 | 将新卡片分配到现有/新单元 | 优先归入现有单元，必要时创建新结构 |

---

## 三、增强 Prompt 约束

### 3.1 结构规划 Prompt 约束模板

```javascript
const STRUCTURE_PLANNING_RULES = `
【结构规划硬约束（必须遵守）】：

1. 章节粒度控制：
   - 每个章节包含 2-5 个单元（卡片数量 > 50时可扩展至 2-10 个）
   - 禁止创建只有 1 个单元的章节
   - 禁止将所有卡片放入单一章节

2. 单元命名规范：
   - 使用宽泛的概括性命名（如"链表基础操作"而非"单链表插入删除"）
   - 单元名称 ≤ 16 字，避免过长导致移动端显示问题
   - 禁止使用编号作为单元名（如"单元1"、"第一部分"）
   - 禁止使用纯知识点标题作为单元名（如"什么是CPU"）

3. 章节命名规范：
   - 章节名称 ≤ 12 字，体现知识大类
   - 使用考研学科标准命名（如"数据结构"、"操作系统"而非"计算机第一章"）
   - 禁止使用时间/日期作为章节名（如"第一天"、"2024年"）

4. 新建限制：
   - 新章节总数不超过 5 个（智能单元整理不超过 2 个）
   - 新单元总数不超过 10 个（智能单元整理不超过 3 个）
   - 优先使用现有结构，只有多张卡片形成明确新主题时才新建

5. 层级一致性：
   - 同一主题下的单元必须归入同一章节
   - 禁止为每个单元创建独立章节

【正反例示范】：

✅ 正确示例：
{
  "chapters": [
    {
      "name": "数据结构",
      "units": [
        { "name": "线性表基础" },
        { "name": "树与二叉树" },
        { "name": "图的基本概念" }
      ]
    },
    {
      "name": "操作系统",
      "units": [
        { "name": "进程管理" },
        { "name": "内存管理" }
      ]
    }
  ]
}

❌ 错误示例（禁止）：
{
  "chapters": [
    { "name": "第一章", "units": [{ "name": "单元1" }] },  // ❌ 编号命名
    { "name": "单链表插入", "units": [{ "name": "单链表插入" }] },  // ❌ 过细粒度
    { "name": "第一天学习", "units": [...] }  // ❌ 时间命名
  ]
}
`
```

### 3.2 卡片分配 Prompt 约束模板

```javascript
const CARD_ASSIGNMENT_RULES = `
【卡片分配硬约束（必须遵守）】：

1. 完整性：
   - 每张卡片必须且只能分配到一个单元
   - 禁止遗漏任何卡片
   - 禁止重复分配同一卡片

2. 单元容量：
   - 每个单元卡片数在 2-50 张范围内
   - 单元卡片数 < 2 时应合并到相邻单元
   - 单元卡片数 > 50 时应考虑拆分

3. 语义匹配：
   - 卡片内容与单元主题高度相关时归入
   - 主题不相关时不要强行归入，应创建新单元
   - 优先匹配知识点内容而非卡片问题文本

4. 输出格式：
   - 必须返回 JSON 数组格式
   - cardIndex 必须是输入列表中的有效下标
   - 禁止返回额外文字、Markdown、注释

【输出格式】：
[
  { "cardIndex": 0, "chapterIndex": 0, "unitIndex": 0 },
  { "cardIndex": 1, "chapterIndex": 0, "unitIndex": 1 },
  ...
]
`
```

### 3.3 主题关键词提取 Prompt

```javascript
const THEME_EXTRACTION_PROMPT = `
你是知识体系分析助手。请从以下卡片内容中提取主题关键词，用于后续分类规划。

【任务】：
1. 分析每张卡片的知识点内容
2. 提取能够概括该卡片主题的关键词（1-3个）
3. 识别卡片之间的主题关联性
4. 输出主题关键词列表

【约束】：
- 关键词应使用考研学科标准术语
- 关键词长度 ≤ 8 字
- 避免过于具体的关键词（如"CPU主频"应概括为"硬件基础"）

【输出格式】：
{
  "themes": [
    { "keyword": "数据结构", "cardIndices": [0, 2, 5, 8] },
    { "keyword": "操作系统", "cardIndices": [1, 3, 7] },
    ...
  ]
}

【卡片内容】：
${cardLines}
`
```

---

## 四、大数据路径优化

### 4.1 当前问题分析

现有 `classifyCardsMultiRound` 函数的问题：
1. 前 N 轮只传入部分章节信息，AI 缺乏全局视角
2. 各轮之间缺乏一致性检查，可能创建重复结构
3. 最终轮的"剩余卡片"处理过于简单

### 4.2 优化方案

```
┌─────────────────────────────────────────────────────────────────┐
│                    大数据路径优化流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入：>200 张卡片 + 现有章节结构                                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Phase 0：预处理                                           │   │
│  │ - 提取所有卡片的主题关键词                                  │   │
│  │ - 构建全局章节结构概览                                      │   │
│  │ - 按主题相似度对卡片进行预分组                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Phase 1：结构规划（一次性）                                 │   │
│  │ - 输入：全局章节概览 + 主题关键词分布                        │   │
│  │ - AI 规划完整的章节/单元结构                                │   │
│  │ - 返回：{ chapters: [{ name, units: [{ name }] }] }        │   │
│  │ - 校验：结构合理性检查                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Phase 2：分批卡片分配                                       │   │
│  │ - 按 Phase 1 确定的单元分批处理                             │   │
│  │ - 每批 ≤ 30 张卡片                                          │   │
│  │ - 每批传入完整的结构上下文（而非部分章节）                   │   │
│  │ - AI 将本批卡片分配到指定单元                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Phase 3：结果合并与校验                                     │   │
│  │ - 合并各批分配结果                                          │   │
│  │ - 校验每单元卡片数是否在合理范围                            │   │
│  │ - 检查是否有未分配卡片                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Phase 4：异常修正                                          │   │
│  │ - 单元卡片数过少 → 合并到相邻单元                           │   │
│  │ - 单元卡片数过多 → 拆分为多个单元                           │   │
│  │ - 未分配卡片 → 按主题关键词匹配归入最相似单元               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  输出：最终分类结果                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 关键改进点

| 改进项 | 原方案 | 新方案 |
|-------|-------|-------|
| **结构规划** | 各轮独立处理 | 一次性规划完整结构 |
| **上下文传递** | 只传入部分章节 | 每批传入完整结构概览 |
| **一致性检查** | 无 | 各轮结果合并后检查重复 |
| **异常处理** | 简单 fallback | 多层次修正策略 |

---

## 五、分类结果校验

### 5.1 校验规则定义

```javascript
const CLASSIFICATION_VALIDATION_RULES = {
  // 结构校验
  structure: {
    minChapters: 1,           // 最少章节数
    maxChapters: 10,          // 最多章节数（跨分类可达15）
    minUnitsPerChapter: 2,    // 每章节最少单元数
    maxUnitsPerChapter: 10,   // 每章节最多单元数
    chapterNameMaxLength: 12, // 章节名称最大长度
    unitNameMaxLength: 16,    // 单元名称最大长度
  },
  
  // 分配校验
  assignment: {
    minCardsPerUnit: 2,       // 每单元最少卡片数
    maxCardsPerUnit: 50,      // 每单元最多卡片数
    allCardsAssigned: true,   // 所有卡片必须已分配
    noDuplicateAssignment: true, // 禁止重复分配
  },
  
  // 命名校验
  naming: {
    forbiddenPatterns: [
      /^第[一二三四五六七八九十\d]+[天章节部分]/,  // 禁止章节编号命名
      /^单元\d+$/,                                // 禁止单元编号命名
      /^第\d+天/,                                 // 禁止日期命名
      /^[一二三四五六七八九十\d]+[、.]$/,          // 禁止纯编号
    ],
    minLength: 2,              // 名称最少字数
  }
}
```

### 5.2 校验函数设计

```javascript
/**
 * 分类结果校验函数
 * @param {Object} result - AI 返回的分类结果
 * @param {Array} cards - 输入的卡片列表
 * @param {string} classificationDepth - 分类深度
 * @returns {Object} { valid, errors, warnings }
 */
function validateClassificationResult(result, cards, classificationDepth) {
  const errors = []
  const warnings = []
  
  // 1. 结构校验
  if (result.chapters) {
    // 章节数量校验
    if (result.chapters.length < CLASSIFICATION_VALIDATION_RULES.structure.minChapters) {
      errors.push(`章节数量过少：${result.chapters.length} < ${CLASSIFICATION_VALIDATION_RULES.structure.minChapters}`)
    }
    
    for (const chapter of result.chapters) {
      // 章节名称校验
      if (!chapter.name || chapter.name.length < CLASSIFICATION_VALIDATION_RULES.naming.minLength) {
        errors.push(`章节名称过短或为空`)
      }
      if (chapter.name.length > CLASSIFICATION_VALIDATION_RULES.structure.chapterNameMaxLength) {
        warnings.push(`章节"${chapter.name}"名称过长，建议缩短`)
      }
      // 禁止模式校验
      for (const pattern of CLASSIFICATION_VALIDATION_RULES.naming.forbiddenPatterns) {
        if (pattern.test(chapter.name)) {
          errors.push(`章节"${chapter.name}"使用了禁止的命名模式`)
        }
      }
      
      // 单元数量校验
      if (chapter.units && chapter.units.length < CLASSIFICATION_VALIDATION_RULES.structure.minUnitsPerChapter) {
        warnings.push(`章节"${chapter.name}"单元数量过少：${chapter.units.length}`)
      }
      
      for (const unit of chapter.units || []) {
        // 单元名称校验
        if (!unit.name || unit.name.length < CLASSIFICATION_VALIDATION_RULES.naming.minLength) {
          errors.push(`单元名称过短或为空`)
        }
        if (unit.name.length > CLASSIFICATION_VALIDATION_RULES.structure.unitNameMaxLength) {
          warnings.push(`单元"${unit.name}"名称过长`)
        }
        for (const pattern of CLASSIFICATION_VALIDATION_RULES.naming.forbiddenPatterns) {
          if (pattern.test(unit.name)) {
            errors.push(`单元"${unit.name}"使用了禁止的命名模式`)
          }
        }
        
        // 单元卡片数校验
        const cardCount = unit.cards ? unit.cards.length : 0
        if (cardCount < CLASSIFICATION_VALIDATION_RULES.assignment.minCardsPerUnit) {
          warnings.push(`单元"${unit.name}"卡片数过少：${cardCount}`)
        }
        if (cardCount > CLASSIFICATION_VALIDATION_RULES.assignment.maxCardsPerUnit) {
          warnings.push(`单元"${unit.name}"卡片数过多：${cardCount}`)
        }
      }
    }
  }
  
  // 2. 分配完整性校验
  const assignedCards = new Set()
  if (result.chapters) {
    for (const chapter of result.chapters) {
      for (const unit of chapter.units || []) {
        for (const card of unit.cards || []) {
          if (assignedCards.has(card)) {
            errors.push(`卡片重复分配`)
          }
          assignedCards.add(card)
        }
      }
    }
  }
  
  // 检查未分配卡片
  const unassignedCount = cards.length - assignedCards.size
  if (unassignedCount > 0) {
    errors.push(`有 ${unassignedCount} 张卡片未分配`)
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
```

### 5.3 二次修正策略

```javascript
/**
 * 分类结果二次修正
 * @param {Object} result - AI 返回的分类结果
 * @param {Object} validation - 校验结果
 * @returns {Object} 修正后的结果
 */
function fixClassificationResult(result, validation, cards) {
  let fixed = JSON.parse(JSON.stringify(result))
  
  // 1. 合理小单元（卡片数 < 2）
  if (fixed.chapters) {
    for (const chapter of fixed.chapters) {
      if (!chapter.units) continue
      
      // 按卡片数排序，合并小单元
      let i = 0
      while (i < chapter.units.length) {
        const unit = chapter.units[i]
        const cardCount = unit.cards ? unit.cards.length : 0
        
        if (cardCount < 2 && chapter.units.length > 1) {
          // 合并到相邻单元（优先合并到卡片数较多的单元）
          const prevUnit = i > 0 ? chapter.units[i - 1] : null
          const nextUnit = i < chapter.units.length - 1 ? chapter.units[i + 1] : null
          
          const prevCount = prevUnit?.cards?.length || 0
          const nextCount = nextUnit?.cards?.length || 0
          
          if (prevCount >= nextCount && prevUnit) {
            prevUnit.cards = [...(prevUnit.cards || []), ...(unit.cards || [])]
            chapter.units.splice(i, 1)
          } else if (nextUnit) {
            nextUnit.cards = [...(unit.cards || []), ...(nextUnit.cards || [])]
            chapter.units.splice(i, 1)
          } else {
            i++
          }
        } else {
          i++
        }
      }
    }
  }
  
  // 2. 拆分大单元（卡片数 > 50）
  if (fixed.chapters) {
    for (const chapter of fixed.chapters) {
      if (!chapter.units) continue
      
      const newUnits = []
      for (const unit of chapter.units) {
        const cards = unit.cards || []
        if (cards.length > 50) {
          // 按主题关键词拆分
          const subUnits = splitLargeUnit(unit, cards)
          newUnits.push(...subUnits)
        } else {
          newUnits.push(unit)
        }
      }
      chapter.units = newUnits
    }
  }
  
  // 3. 处理未分配卡片
  const assignedCards = new Set()
  if (fixed.chapters) {
    for (const chapter of fixed.chapters) {
      for (const unit of chapter.units || []) {
        for (const card of unit.cards || []) {
          assignedCards.add(card)
        }
      }
    }
  }
  
  const unassignedCards = cards.filter(c => !assignedCards.has(c))
  if (unassignedCards.length > 0) {
    // 按关键词匹配归入最相似单元
    for (const card of unassignedCards) {
      const bestUnit = findBestMatchingUnit(card, fixed)
      if (bestUnit) {
        bestUnit.cards = [...(bestUnit.cards || []), card]
      } else {
        // 创建新单元
        const newUnitName = extractUnitNameFromCard(card)
        if (fixed.chapters && fixed.chapters.length > 0) {
          fixed.chapters[fixed.chapters.length - 1].units.push({
            name: newUnitName,
            cards: [card]
          })
        }
      }
    }
  }
  
  return fixed
}
```

---

## 六、主题字段引入方案

### 6.1 是否引入主题字段？

**建议：引入主题字段**

理由：
1. **提升分类准确性**：主题字段可作为分类的辅助信号，帮助 AI 更准确判断卡片归属
2. **支持跨分类归类**：主题字段可帮助识别跨分类的相似卡片
3. **便于后续检索**：用户可按主题筛选卡片
4. **增强统计分析**：可按主题统计学习进度

### 6.2 主题字段设计

```javascript
// 数据库 schema 扩展
const THEME_FIELD_SCHEMA = {
  // cards 表新增字段
  cards: {
    theme: {
      type: 'string',
      maxLength: 20,
      description: '卡片主题关键词，如"数据结构"、"操作系统"',
      optional: true,  // 可选字段，AI 生成时自动填充
    }
  },
  
  // units 表新增字段
  units: {
    theme: {
      type: 'string',
      maxLength: 20,
      description: '单元主题关键词',
      optional: true,
    }
  },
  
  // chapters 表新增字段
  chapters: {
    theme: {
      type: 'string',
      maxLength: 20,
      description: '章节主题关键词',
      optional: true,
    }
  }
}
```

### 6.3 主题字段生成流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    主题字段生成流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  卡片生成阶段                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. AI 生成卡片时，同时生成 theme 字段                      │   │
│  │ 2. theme 来源：                                            │   │
│  │    - knowledge_point 内容分析                              │   │
│  │    - 用户输入的分类/单元名称                                │   │
│  │    - AI 自动识别的学科主题                                  │   │
│  │ 3. theme 格式：                                            │   │
│  │    - 使用考研学科标准术语                                   │   │
│  │    - ≤ 20 字                                               │   │
│  │    - 示例："数据结构"、"操作系统"、"计算机网络"             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  分类阶段                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. 提取所有卡片的 theme 字段                                │   │
│  │ 2. 按 theme 统计卡片分布                                    │   │
│  │ 3. 将 theme 分布作为结构规划的辅助信号                      │   │
│  │ 4. AI 规划章节/单元时参考 theme 分布                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  单元/章节创建阶段                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. 创建新单元时，自动填充 theme 字段                        │   │
│  │    - 取该单元下卡片 theme 的众数                            │   │
│  │ 2. 创建新章节时，自动填充 theme 字段                        │   │
│  │    - 取该章节下单元 theme 的众数                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 主题字段在分类中的应用

```javascript
// 分类时使用主题字段
function classifyWithTheme(cards, existingStructure, config) {
  // 1. 提取主题分布
  const themeDistribution = analyzeThemeDistribution(cards)
  
  // 2. 构建主题上下文
  const themeContext = buildThemeContext(themeDistribution, existingStructure)
  
  // 3. 生成带主题信息的 Prompt
  const prompt = buildClassifyPromptWithTheme(cards, themeContext, config)
  
  // 4. AI 分类
  const result = await callAiClassify(prompt, config)
  
  // 5. 校验与修正
  const validation = validateClassificationResult(result, cards)
  if (!validation.valid) {
    result = fixClassificationResult(result, validation, cards)
  }
  
  return result
}

// 分析主题分布
function analyzeThemeDistribution(cards) {
  const distribution = {}
  
  for (const card of cards) {
    const theme = card.theme || extractThemeFromKnowledgePoint(card.knowledge_point)
    if (!distribution[theme]) {
      distribution[theme] = { count: 0, cards: [] }
    }
    distribution[theme].count++
    distribution[theme].cards.push(card)
  }
  
  // 按卡片数排序
  const sortedThemes = Object.entries(distribution)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([theme, data]) => ({ theme, ...data }))
  
  return sortedThemes
}

// 从知识点提取主题
function extractThemeFromKnowledgePoint(kp) {
  // 考研学科关键词映射
  const THEME_KEYWORDS = {
    '数据结构': ['线性表', '栈', '队列', '树', '二叉树', '图', '查找', '排序'],
    '操作系统': ['进程', '线程', '内存', '文件', 'IO', '调度', '死锁'],
    '计算机网络': ['TCP', 'UDP', 'IP', 'HTTP', 'DNS', '路由', '协议'],
    '计算机组成': ['CPU', '内存', '总线', '指令', '流水线', '缓存'],
    '数据库': ['SQL', '关系', '事务', '索引', '查询', '范式'],
    '政治': ['马原', '毛中特', '史纲', '思修', '形势'],
    '英语': ['词汇', '语法', '阅读', '写作', '翻译'],
    '数学': ['高等数学', '线性代数', '概率论', '数理统计'],
  }
  
  const kpLower = (kp || '').toLowerCase()
  
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    for (const keyword of keywords) {
      if (kpLower.includes(keyword.toLowerCase())) {
        return theme
      }
    }
  }
  
  // 无法匹配时返回通用主题
  return '通用知识'
}
```

---

## 七、实施计划

### 7.1 实施阶段划分

| 阶段 | 任务 | 预计工作量 | 依赖关系 |
|-----|------|-----------|---------|
| **Phase 1** | 两步法核心函数实现 | 中 | 无 |
| **Phase 2** | Prompt 约束模板编写 | 低 | Phase 1 |
| **Phase 3** | 大数据路径优化 | 高 | Phase 1 |
| **Phase 4** | 分类结果校验函数 | 中 | Phase 1 |
| **Phase 5** | 二次修正策略实现 | 中 | Phase 4 |
| **Phase 6** | 主题字段引入 | 高 | Phase 1-5 |
| **Phase 7** | 三种方式适配改造 | 高 | Phase 1-6 |
| **Phase 8** | 测试与验证 | 中 | Phase 7 |

### 7.2 文件修改清单

| 文件 | 修改内容 | 影响范围 |
|-----|---------|---------|
| `src/services/aiService.js` | 两步法核心函数、校验函数、修正函数 | 核心 |
| `src/utils/constants.js` | Prompt 约束模板、主题关键词映射 | 配置 |
| `src/services/db.js` | 主题字段 schema 扩展 | 数据层 |
| `src/pages/Category.jsx` | 分类流程调用改造 | UI层 |
| `src/components/UnitReorganizeConfirm.jsx` | 校验结果展示 | UI层 |
| `存储数据记录.txt` | 主题字段文档更新 | 文档 |

### 7.3 兼容性保障

1. **数据兼容**：主题字段设为可选，不影响现有数据
2. **接口兼容**：两步法函数保留原有接口签名，内部重构
3. **降级兼容**：校验失败时自动降级到原有分类逻辑

---

## 八、预期效果

| 优化项 | 预期效果 |
|-------|---------|
| **两步法统一** | 三种分类方式逻辑一致，代码复用率提升 |
| **Prompt 约束** | AI 分类粒度更合理，单元命名更规范 |
| **大数据优化** | >200 张卡片分类准确率提升，处理时间缩短 |
| **结果校验** | 分类异常自动修正，减少用户手动调整 |
| **主题字段** | 分类准确性提升，支持主题维度检索统计 |

---

## 九、待确认事项

请确认以下问题后开始实施：

1. **主题字段命名**：使用 `theme` 还是 `subject` 或其他名称？
2. **主题字段长度**：限制 20 字是否合适？
3. **考研学科关键词映射**：是否需要扩展更多学科关键词？
4. **校验严格程度**：errors 级别的问题是否阻断流程，还是仅记录日志？
5. **二次修正触发条件**：仅在 errors 存在时触发，还是 warnings 也触发？

---

*文档版本：v1.0*
*创建时间：2026-06-18*
*状态：待用户确认后实施*