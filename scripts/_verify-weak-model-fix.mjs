/**
 * 验证脚本：弱模型分类改进逻辑测试
 * 
 * 改进点 1：多层 JSON 解析容错（SparkLiteAdapter._parseReorganizeResult）
 * 改进点 2：Fallback 机制 + 去重（ClassificationService._mergeBatchResults）
 */

// ============ 模拟：_parseReorganizeResult 多层 JSON 解析 ============
function parseReorganizeResult(raw, cardCount, hasChapters) {
  // 先清理响应
  let cleaned = String(raw || '').replace(/```json/g, '').replace(/```/g, '')
  const trimmed = cleaned.trim()
  const firstBracket = trimmed.indexOf('{')
  const lastBracket = trimmed.lastIndexOf('}')
  if (firstBracket === -1 || lastBracket <= firstBracket) throw new Error('无法找到 JSON 结构')
  
  let parsed = null
  const jsonBody = trimmed.slice(firstBracket, lastBracket + 1)
  
  // 策略 1: 直接解析
  try { parsed = JSON.parse(jsonBody) } catch (_) { parsed = null }
  
  // 策略 2: 修复尾部逗号（尾部多余逗号导致 JSON.parse 失败，如 [0,1,2,]）
  if (!parsed) {
    try {
      const fixed = jsonBody.replace(/,(\s*[}\]])/g, '$1')
      parsed = JSON.parse(fixed)
    } catch (_) { parsed = null }
  }
  
  // 策略 3: 修复字符串索引（如 "0"、"1" 而不是数字 0、1）
  if (!parsed) {
    try {
      // 修复数组中被引号包裹的数字索引，例如 [ "0", "1" ] 转为 [0, 1]
      let fixed = jsonBody
      fixed = fixed.replace(/\[\s*"-?\d+"(\s*,\s*"-?\d+")*\s*\]/g, (match) => {
        return match.replace(/"(-?\d+)"/g, '$1')
      })
      // 修复对象值中的字符串索引
      fixed = fixed.replace(/:\s*"(-?\d+)"(?=\s*[,}\]])/g, ':$1')
      parsed = JSON.parse(fixed)
    } catch (_) { parsed = null }
  }
  
  if (!parsed) throw new Error('所有解析策略都失败')
  
  // 验证索引的工具函数
  const isValidIdx = (i) => typeof i === 'number' && Number.isFinite(i) && i >= 0 && i < cardCount
  const toIndex = (v) => {
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : -1
    }
    return -1
  }
  
  // 章节模式
  if (hasChapters && parsed && Array.isArray(parsed.chapters)) {
    const result = { chapters: [] }
    for (const ch of parsed.chapters) {
      if (!ch?.name || typeof ch.name !== 'string') continue
      const chapterName = String(ch.name).trim().slice(0, 12)
      if (!chapterName) continue
      const units = []
      if (Array.isArray(ch.units)) {
        for (const u of ch.units) {
          if (!u?.name || typeof u.name !== 'string') continue
          const unitName = String(u.name).trim().slice(0, 16)
          if (!unitName) continue
          const indices = (Array.isArray(u.cardIndices) ? u.cardIndices : [])
            .map(toIndex)
            .filter(isValidIdx)
          if (indices.length > 0) units.push({ name: unitName, cardIndices: indices })
        }
      }
      if (units.length > 0) result.chapters.push({ name: chapterName, units })
    }
    return result
  }
  
  // 纯单元模式
  if (parsed && Array.isArray(parsed.units)) {
    const result = { units: [] }
    for (const u of parsed.units) {
      if (!u?.name || typeof u.name !== 'string') continue
      const unitName = String(u.name).trim().slice(0, 16)
      if (!unitName) continue
      const indices = (Array.isArray(u.cardIndices) ? u.cardIndices : [])
        .map(toIndex)
        .filter(isValidIdx)
      if (indices.length > 0) result.units.push({ name: unitName, cardIndices: indices })
    }
    return result
  }
  
  throw new Error('无法解析为章节或单元结构')
}

// ============ 模拟：_mergeBatchResults Fallback 机制 ============
function mergeBatchResults(batchResults, totalCards) {
  const assignedSet = new Set()
  const chapterMap = new Map()
  
  for (const { result, offset } of batchResults) {
    if (result.chapters && result.chapters.length > 0) {
      for (const ch of result.chapters) {
        if (!chapterMap.has(ch.name)) {
          chapterMap.set(ch.name, { name: ch.name, units: [] })
        }
        const chapter = chapterMap.get(ch.name)
        for (const u of ch.units || []) {
          let unit = chapter.units.find(x => x.name === u.name)
          if (!unit) {
            unit = { name: u.name, cardIndices: [] }
            chapter.units.push(unit)
          }
          for (const idx of (u.cardIndices || [])) {
            const adjusted = idx + offset
            if (adjusted >= 0 && adjusted < totalCards && !assignedSet.has(adjusted)) {
              unit.cardIndices.push(adjusted)
              assignedSet.add(adjusted)
            }
          }
        }
      }
    }
  }
  
  // Fallback：将未分配的卡片放入"其他"章节
  const missingCards = []
  for (let i = 0; i < totalCards; i++) {
    if (!assignedSet.has(i)) missingCards.push(i)
  }
  
  if (missingCards.length > 0) {
    if (!chapterMap.has('其他')) chapterMap.set('其他', { name: '其他', units: [] })
    const fallbackChapter = chapterMap.get('其他')
    fallbackChapter.units.push({ name: '未分类卡片', cardIndices: missingCards })
    for (const idx of missingCards) assignedSet.add(idx)
  }
  
  // 过滤空章节/单元
  const chapters = Array.from(chapterMap.values())
    .map(ch => ({ ...ch, units: ch.units.filter(u => u.cardIndices.length > 0) }))
    .filter(ch => ch.units.length > 0)
  
  return { chapters, totalAssigned: assignedSet.size, totalCards }
}

// ============ 运行测试 ============
console.log('===== 弱模型分类逻辑改进验证 =====\n')
let allPassed = true

// 测试 1: 标准 JSON 解析
console.log('[测试 1] 标准章节+单元结构解析')
const standardJson = JSON.stringify({
  chapters: [
    {
      name: '计算机基础',
      units: [
        { name: '发展历史', cardIndices: [0, 1, 2] },
        { name: '系统组成', cardIndices: [3, 4, 5] }
      ]
    },
    {
      name: '操作系统',
      units: [
        { name: '进程管理', cardIndices: [6, 7] }
      ]
    }
  ]
})
try {
  const res1 = parseReorganizeResult(standardJson, 10, true)
  const totalCards = res1.chapters.reduce((sum, ch) => sum + ch.units.reduce((s, u) => s + u.cardIndices.length, 0), 0)
  const passed = totalCards === 8 && res1.chapters.length === 2
  console.log(`  结果: ${passed ? '通过' : '失败'} - 章节数=${res1.chapters.length}, 卡片总数=${totalCards}`)
  allPassed = allPassed && passed
} catch (e) {
  console.log(`  结果: 失败 - ${e.message}`)
  allPassed = false
}

// 测试 2: Markdown 代码块包装
console.log('\n[测试 2] Markdown 代码块包装（```json ... ```）')
const markdownJson = '```json\n' + standardJson + '\n```'
try {
  const res2 = parseReorganizeResult(markdownJson, 10, true)
  const totalCards = res2.chapters.reduce((sum, ch) => sum + ch.units.reduce((s, u) => s + u.cardIndices.length, 0), 0)
  const passed = totalCards === 8 && res2.chapters.length === 2
  console.log(`  结果: ${passed ? '通过' : '失败'} - 章节数=${res2.chapters.length}, 卡片总数=${totalCards}`)
  allPassed = allPassed && passed
} catch (e) {
  console.log(`  结果: 失败 - ${e.message}`)
  allPassed = false
}

// 测试 3: 尾部多余逗号
console.log('\n[测试 3] JSON 中有尾部多余逗号（弱模型常见错误）')
const trailingCommaJson = `{
  "chapters": [
    {
      "name": "计算机基础",
      "units": [
        { "name": "发展历史", "cardIndices": [0, 1, 2,] },
        { "name": "系统组成", "cardIndices": [3, 4, 5,] }
      ],
    },
    {
      "name": "操作系统",
      "units": [
        { "name": "进程管理", "cardIndices": [6, 7,] }
      ],
    }
  ]
}`
try {
  const res3 = parseReorganizeResult(trailingCommaJson, 10, true)
  const totalCards = res3.chapters.reduce((sum, ch) => sum + ch.units.reduce((s, u) => s + u.cardIndices.length, 0), 0)
  const passed = totalCards === 8 && res3.chapters.length === 2
  console.log(`  结果: ${passed ? '通过' : '失败'} - 章节数=${res3.chapters.length}, 卡片总数=${totalCards}`)
  allPassed = allPassed && passed
} catch (e) {
  console.log(`  结果: 失败 - ${e.message}`)
  allPassed = false
}

// 测试 4: 字符串索引（如 "0", "1" 而不是 0, 1）
console.log('\n[测试 4] JSON 中 cardIndices 为字符串索引（弱模型常见错误）')
const stringIndexJson = `{
  "chapters": [
    {
      "name": "计算机基础",
      "units": [
        { "name": "发展历史", "cardIndices": ["0", "1", "2"] },
        { "name": "系统组成", "cardIndices": ["3", "4", "5"] }
      ]
    }
  ]
}`
try {
  const res4 = parseReorganizeResult(stringIndexJson, 10, true)
  const allNumeric = res4.chapters.every(ch => 
    ch.units.every(u => u.cardIndices.every(idx => typeof idx === 'number'))
  )
  const totalCards = res4.chapters.reduce((sum, ch) => sum + ch.units.reduce((s, u) => s + u.cardIndices.length, 0), 0)
  const passed = allNumeric && totalCards === 6
  console.log(`  结果: ${passed ? '通过' : '失败'} - 所有索引为数字=${allNumeric}, 卡片总数=${totalCards}`)
  allPassed = allPassed && passed
} catch (e) {
  console.log(`  结果: 失败 - ${e.message}`)
  allPassed = false
}

// 测试 5: 索引越界过滤（索引 >= totalCards 或 < 0 应该被过滤）
console.log('\n[测试 5] 越界索引过滤（索引 >= totalCards 应被排除）')
const outOfRangeJson = JSON.stringify({
  chapters: [
    {
      name: '章节A',
      units: [
        { name: '单元1', cardIndices: [0, 1, 2, 999, -1] }  // 999 和 -1 应该被过滤
      ]
    }
  ]
})
try {
  const res5 = parseReorganizeResult(outOfRangeJson, 5, true)
  const cardIndices = res5.chapters[0].units[0].cardIndices
  const passed = cardIndices.length === 3 && cardIndices.every(i => i >= 0 && i < 5)
  console.log(`  结果: ${passed ? '通过' : '失败'} - cardIndices=${JSON.stringify(cardIndices)}`)
  allPassed = allPassed && passed
} catch (e) {
  console.log(`  结果: 失败 - ${e.message}`)
  allPassed = false
}

// 测试 6: Fallback 机制 - 部分卡片未被分配
console.log('\n[测试 6] Fallback 机制 - 合并后确保所有卡片被分配')
const batchResultsPartial = [
  {
    result: {
      chapters: [
        { name: '章节A', units: [{ name: '单元1', cardIndices: [0, 1] }] }
      ]
    },
    offset: 0
  },
  {
    result: {
      chapters: [
        { name: '章节B', units: [{ name: '单元2', cardIndices: [2, 3] }] }
      ]
    },
    offset: 0
  }
]
// 测试：总卡片 8 张，但只有前 4 张被分配，剩余应该进入"其他"
const res6 = mergeBatchResults(batchResultsPartial, 8)
const fallbackChapter = res6.chapters.find(ch => ch.name === '其他')
const fallbackUnit = fallbackChapter?.units.find(u => u.name === '未分类卡片')
const passed6 = res6.totalAssigned === 8 && fallbackUnit && fallbackUnit.cardIndices.length === 4
console.log(`  结果: ${passed6 ? '通过' : '失败'} - 分配总数=${res6.totalAssigned}/${res6.totalCards}, Fallback 章节卡片数=${fallbackUnit?.cardIndices.length || 0}`)
allPassed = allPassed && passed6

// 测试 7: 去重 - 多个批次重复分配同一卡片索引
console.log('\n[测试 7] 去重机制 - 重复分配同一卡片只保留一次')
const batchResultsDuplicate = [
  {
    result: {
      chapters: [
        { name: '章节A', units: [{ name: '单元1', cardIndices: [0, 1, 2, 3] }] }
      ]
    },
    offset: 0
  },
  {
    result: {
      chapters: [
        { name: '章节B', units: [{ name: '单元2', cardIndices: [2, 3, 4, 5] }] }  // 2,3 重复
      ]
    },
    offset: 0
  }
]
const res7 = mergeBatchResults(batchResultsDuplicate, 6)
// 正确结果：0,1,2,3,4,5 都被分配，但不会重复
const allIndices = []
for (const ch of res7.chapters) {
  for (const u of ch.units) allIndices.push(...u.cardIndices)
}
const hasDuplicates = new Set(allIndices).size !== allIndices.length
const passed7 = !hasDuplicates && res7.totalAssigned === 6
console.log(`  结果: ${passed7 ? '通过' : '失败'} - 分配总数=${res7.totalAssigned}/${res7.totalCards}, 是否有重复=${hasDuplicates}`)
allPassed = allPassed && passed7

// 测试 8: 100% 分配验证（综合测试）
console.log('\n[测试 8] 综合测试 - 确保所有卡片被分配，无丢失')
const batchResultsMixed = [
  {
    result: {
      chapters: [
        { name: '计算机基础', units: [
          { name: '发展历史', cardIndices: [0, 1] },
          { name: '硬件系统', cardIndices: [2, 3, 4] }
        ]}
      ]
    },
    offset: 0
  },
  {
    result: {
      chapters: [
        { name: '操作系统', units: [
          { name: '进程管理', cardIndices: [5, 6] }
        ]}
      ]
    },
    offset: 0
  },
  // 故意让索引 7,8,9 不被分配（模拟 AI 遗漏）
]
const res8 = mergeBatchResults(batchResultsMixed, 10)
const passed8 = res8.totalAssigned === 10 && 
  res8.chapters.some(ch => ch.name === '其他' && ch.units.some(u => u.name === '未分类卡片'))
console.log(`  结果: ${passed8 ? '通过' : '失败'} - 分配总数=${res8.totalAssigned}/${res8.totalCards}`)
allPassed = allPassed && passed8

// 最终结果
console.log('\n===== 测试总结 =====')
console.log(`最终结果: ${allPassed ? '✅ 所有测试通过' : '❌ 部分测试失败'}`)

if (!allPassed) process.exit(1)
