import { describe, it, expect } from 'vitest'

/**
 * ============================================================
 * 强模型卡片分类 unitIndex 索引错位修复 — 模拟测试
 * ============================================================
 *
 * 测试目标：验证 chapter-and-unit 模式下，classifyCardsByCategoryContent
 * 的数据结构构建逻辑和解析逻辑能正确处理章节-单元索引。
 *
 * 核心修复点：
 *   1. chapterUnitIdsMap — 每章节独立单元ID数组（per-chapter 索引）
 *   2. unitBlocks 过滤 — 只包含未归属章节的单元
 *   3. 解析逻辑 — 使用 chapterUnitIdsMap[chapterIndex][unitIndex] 查表
 */

// ───── 模拟 classifyCardsByCategoryContent 中的数据结构构建逻辑 ─────

function buildClassificationData(existingChapters, existingUnits, classificationDepth) {
  const chapterBlocks = []
  const chapterIdsByIndex = []
  const chapterUnitIdsMap = new Map() // Map<chapterIndex, unitId[]>

  if (classificationDepth === 'chapter-and-unit' || classificationDepth === 'chapter-only') {
    for (const ch of existingChapters || []) {
      if (!ch?.id) continue
      const chIndex = chapterIdsByIndex.length
      chapterIdsByIndex.push(ch.id)
      const chUnits = (existingUnits || []).filter(u => u.chapterId === ch.id)
      chapterUnitIdsMap.set(chIndex, chUnits.map(u => u.id))
      let block = `【章节${chIndex}】${ch.name}`
      if (classificationDepth === 'chapter-and-unit' && chUnits.length > 0) {
        const unitLines = chUnits.map((u, ui) => {
          return `  - 单元${ui}：${u.name}`
        })
        block += '\n' + unitLines.join('\n')
      }
      chapterBlocks.push(block)
    }
  }

  // unitBlocks: 只包含未归属章节的单元
  const unitBlocks = []
  const unitIdsByIndex = []
  for (const u of existingUnits || []) {
    if (!u?.id) continue
    if (u.chapterId) continue // 已归属章节的单元跳过
    unitIdsByIndex.push(u.id)
    unitBlocks.push(`【单元${unitIdsByIndex.length - 1}】${u.name}`)
  }

  return {
    chapterBlocks,
    chapterIdsByIndex,
    chapterUnitIdsMap,
    unitBlocks,
    unitIdsByIndex,
  }
}

// ───── 模拟 AI 返回解析逻辑（chapter-and-unit 模式） ─────

function simulateParseAIResponse(
  parsedAIResponse,
  newCards,
  { chapterIdsByIndex, chapterUnitIdsMap, unitIdsByIndex }
) {
  const assignments = []
  for (let i = 0; i < newCards.length; i++) {
    const item = parsedAIResponse.find(p => Number(p.cardIndex) === i) || null

    // chapter-and-unit 模式解析
    if (item && item.assignType === 'existing' && typeof item.chapterIndex === 'number') {
      const chId = chapterIdsByIndex[item.chapterIndex]
      const chUnitIds = chapterUnitIdsMap.get(item.chapterIndex) || []
      const uId = typeof item.unitIndex === 'number' ? (chUnitIds[item.unitIndex] || null) : null
      assignments.push({
        cardIndex: i,
        chapterId: chId || null,
        unitId: uId || null,
        newChapterName: null,
        newUnitName: null,
      })
      continue
    }
    if (item && item.assignType === 'new') {
      assignments.push({
        cardIndex: i,
        chapterId: null,
        unitId: null,
        newChapterName: item.newChapterName ? String(item.newChapterName).trim().slice(0, 12) : null,
        newUnitName: item.newUnitName ? String(item.newUnitName).trim().slice(0, 16) : null,
      })
      continue
    }
    // 兜底
    assignments.push({
      cardIndex: i,
      chapterId: null,
      unitId: null,
      newChapterName: (newCards[i].front || '新章节').slice(0, 12),
      newUnitName: null,
    })
  }
  return assignments
}

// ───── 测试用例 ─────

describe('classifyCardsByCategoryContent — chapter-and-unit unitIndex 索引修复', () => {

  // ═══════════════════════════════════════════════════════════
  // 场景1：核心 Bug 场景 — 章节内单元顺序 ≠ 全局单元顺序
  // ═══════════════════════════════════════════════════════════
  describe('场景1：章节单元顺序与全局顺序不一致（Bug 场景）', () => {
    /**
     * 数据设置：
     *   全局 unit 列表顺序（按 existingUnits 传入顺序）：
     *     uid-0 → ch-1 (章节B的单元B1)
     *     uid-1 → ch-1 (章节B的单元B2)
     *     uid-2 → ch-0 (章节A的单元A1)
     *     uid-3 → ch-0 (章节A的单元A2)
     *     uid-4 → null  (未归章单元)
     *
     *   章节视角：
     *     章节A (ch-0): 单元 [uid-2(A1), uid-3(A2)]  → per-chapter: 单元0=A1, 单元1=A2
     *     章节B (ch-1): 单元 [uid-0(B1), uid-1(B2)]  → per-chapter: 单元0=B1, 单元1=B2
     *
     *   旧代码（Bug）: AI 用 unitIdsByIndex（全局索引）查表
     *     AI 返回 chapterIndex=0, unitIndex=0 → unitIdsByIndex[0] = uid-0 (B1)  ← 错误！
     *     实际应返回 uid-2 (A1)
     *
     *   新代码（修复后）: chapterUnitIdsMap.get(0)[0] = uid-2 (A1)  ← 正确！
     */
    const existingChapters = [
      { id: 'ch-0', name: '章节A' },
      { id: 'ch-1', name: '章节B' },
    ]
    const existingUnits = [
      { id: 'uid-0', name: '单元B1', chapterId: 'ch-1' },
      { id: 'uid-1', name: '单元B2', chapterId: 'ch-1' },
      { id: 'uid-2', name: '单元A1', chapterId: 'ch-0' },
      { id: 'uid-3', name: '单元A2', chapterId: 'ch-0' },
      { id: 'uid-4', name: '未归章单元', chapterId: null },
    ]

    const data = buildClassificationData(existingChapters, existingUnits, 'chapter-and-unit')

    it('chapterUnitIdsMap 应正确构建每章节的单元ID数组', () => {
      expect(data.chapterUnitIdsMap.size).toBe(2)
      expect(data.chapterUnitIdsMap.get(0)).toEqual(['uid-2', 'uid-3'])
      expect(data.chapterUnitIdsMap.get(1)).toEqual(['uid-0', 'uid-1'])
    })

    it('chapterIdsByIndex 应为章节ID数组', () => {
      expect(data.chapterIdsByIndex).toEqual(['ch-0', 'ch-1'])
    })

    it('unitBlocks 应只包含未归属章节的单元', () => {
      expect(data.unitBlocks).toHaveLength(1)
      expect(data.unitBlocks[0]).toContain('未归章单元')
    })

    it('unitIdsByIndex 应只包含未归属章节的单元ID', () => {
      expect(data.unitIdsByIndex).toEqual(['uid-4'])
    })

    it('AI 返回 chapterIndex=0, unitIndex=0 应正确解析为章节A的单元A1 (uid-2)', () => {
      const aiResponse = [
        { cardIndex: 0, assignType: 'existing', chapterIndex: 0, unitIndex: 0 },
        { cardIndex: 1, assignType: 'existing', chapterIndex: 0, unitIndex: 1 },
        { cardIndex: 2, assignType: 'existing', chapterIndex: 1, unitIndex: 0 },
        { cardIndex: 3, assignType: 'existing', chapterIndex: 1, unitIndex: 1 },
      ]
      const newCards = [
        { front: '卡片0', back: '' },
        { front: '卡片1', back: '' },
        { front: '卡片2', back: '' },
        { front: '卡片3', back: '' },
      ]

      const assignments = simulateParseAIResponse(aiResponse, newCards, data)

      // 卡片0 → 章节A, 单元A1 (uid-2)
      expect(assignments[0].chapterId).toBe('ch-0')
      expect(assignments[0].unitId).toBe('uid-2')

      // 卡片1 → 章节A, 单元A2 (uid-3)
      expect(assignments[1].chapterId).toBe('ch-0')
      expect(assignments[1].unitId).toBe('uid-3')

      // 卡片2 → 章节B, 单元B1 (uid-0)
      expect(assignments[2].chapterId).toBe('ch-1')
      expect(assignments[2].unitId).toBe('uid-0')

      // 卡片3 → 章节B, 单元B2 (uid-1)
      expect(assignments[3].chapterId).toBe('ch-1')
      expect(assignments[3].unitId).toBe('uid-1')
    })

    it('旧代码 Bug 复现：用 unitIdsByIndex 全局索引会导致错误', () => {
      // 模拟旧代码：unitIdsByIndex 包含所有单元（未过滤）
      const oldUnitIdsByIndex = ['uid-0', 'uid-1', 'uid-2', 'uid-3', 'uid-4']
      const aiResponse = [
        { cardIndex: 0, assignType: 'existing', chapterIndex: 0, unitIndex: 0 },
      ]

      // 旧代码：unitIdsByIndex[0] = 'uid-0' (B1) — 错误！
      const oldResult = oldUnitIdsByIndex[aiResponse[0].unitIndex]
      expect(oldResult).toBe('uid-0') // 旧代码错误地返回 uid-0

      // 新代码：chapterUnitIdsMap.get(0)[0] = 'uid-2' (A1) — 正确！
      const newResult = data.chapterUnitIdsMap.get(0)[0]
      expect(newResult).toBe('uid-2')
      expect(newResult).not.toBe('uid-0') // 新代码不会错误返回 uid-0
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 场景2：正常场景 — 章节单元顺序与全局顺序一致
  // ═══════════════════════════════════════════════════════════
  describe('场景2：章节单元顺序与全局顺序一致', () => {
    const existingChapters = [
      { id: 'ch-0', name: '章节A' },
      { id: 'ch-1', name: '章节B' },
    ]
    const existingUnits = [
      { id: 'uid-0', name: '单元A1', chapterId: 'ch-0' },
      { id: 'uid-1', name: '单元A2', chapterId: 'ch-0' },
      { id: 'uid-2', name: '单元B1', chapterId: 'ch-1' },
      { id: 'uid-3', name: '未归章', chapterId: null },
    ]

    const data = buildClassificationData(existingChapters, existingUnits, 'chapter-and-unit')

    it('chapterUnitIdsMap 顺序正确', () => {
      expect(data.chapterUnitIdsMap.get(0)).toEqual(['uid-0', 'uid-1'])
      expect(data.chapterUnitIdsMap.get(1)).toEqual(['uid-2'])
    })

    it('unitBlocks 只包含未归章单元', () => {
      expect(data.unitIdsByIndex).toEqual(['uid-3'])
    })

    it('index 0 of chapter 0 → uid-0', () => {
      const result = (data.chapterUnitIdsMap.get(0) || [])[0]
      expect(result).toBe('uid-0')
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 场景3：无章节 — 所有单元都是未归章
  // ═══════════════════════════════════════════════════════════
  describe('场景3：无章节，所有单元均未归章', () => {
    const existingChapters = []
    const existingUnits = [
      { id: 'uid-0', name: '单元A', chapterId: null },
      { id: 'uid-1', name: '单元B', chapterId: null },
      { id: 'uid-2', name: '单元C', chapterId: null },
    ]

    const data = buildClassificationData(existingChapters, existingUnits, 'chapter-and-unit')

    it('chapterUnitIdsMap 应为空', () => {
      expect(data.chapterUnitIdsMap.size).toBe(0)
    })

    it('chapterIdsByIndex 应为空', () => {
      expect(data.chapterIdsByIndex).toEqual([])
    })

    it('unitIdsByIndex 应包含所有单元', () => {
      expect(data.unitIdsByIndex).toEqual(['uid-0', 'uid-1', 'uid-2'])
    })

    it('unitBlocks 应包含所有单元', () => {
      expect(data.unitBlocks).toHaveLength(3)
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 场景4：所有单元都归属章节 — 无未归章单元
  // ═══════════════════════════════════════════════════════════
  describe('场景4：所有单元都归属章节，无未归章单元', () => {
    const existingChapters = [
      { id: 'ch-0', name: '章节A' },
    ]
    const existingUnits = [
      { id: 'uid-0', name: '单元A1', chapterId: 'ch-0' },
      { id: 'uid-1', name: '单元A2', chapterId: 'ch-0' },
    ]

    const data = buildClassificationData(existingChapters, existingUnits, 'chapter-and-unit')

    it('unitIdsByIndex 应为空', () => {
      expect(data.unitIdsByIndex).toEqual([])
    })

    it('unitBlocks 应为空', () => {
      expect(data.unitBlocks).toEqual([])
    })

    it('chapterUnitIdsMap 应正确包含所有单元', () => {
      expect(data.chapterUnitIdsMap.get(0)).toEqual(['uid-0', 'uid-1'])
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 场景5：边界情况 — unitIndex 越界
  // ═══════════════════════════════════════════════════════════
  describe('场景5：unitIndex 越界返回 null', () => {
    const existingChapters = [
      { id: 'ch-0', name: '章节A' },
    ]
    const existingUnits = [
      { id: 'uid-0', name: '单元A1', chapterId: 'ch-0' },
    ]

    const data = buildClassificationData(existingChapters, existingUnits, 'chapter-and-unit')

    it('unitIndex 越界应返回 null', () => {
      const chUnitIds = data.chapterUnitIdsMap.get(0) || []
      // unitIndex 5 超出范围
      const result = chUnitIds[5] || null
      expect(result).toBeNull()
    })

    it('unitIndex 为 undefined 应返回 null', () => {
      const aiResponse = [
        { cardIndex: 0, assignType: 'existing', chapterIndex: 0 },
        // 没有 unitIndex 字段
      ]
      const newCards = [{ front: '卡片0', back: '' }]
      const assignments = simulateParseAIResponse(aiResponse, newCards, data)

      expect(assignments[0].chapterId).toBe('ch-0')
      expect(assignments[0].unitId).toBeNull()
    })

    it('chapterIndex 越界返回 null', () => {
      const aiResponse = [
        { cardIndex: 0, assignType: 'existing', chapterIndex: 99, unitIndex: 0 },
      ]
      const newCards = [{ front: '卡片0', back: '' }]
      const assignments = simulateParseAIResponse(aiResponse, newCards, data)

      expect(assignments[0].chapterId).toBeNull()
      expect(assignments[0].unitId).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 场景6：assignType='new' — 创建新章节/单元
  // ═══════════════════════════════════════════════════════════
  describe('场景6：assignType=new 创建新章节/单元', () => {
    const existingChapters = [
      { id: 'ch-0', name: '已有章节' },
    ]
    const existingUnits = [
      { id: 'uid-0', name: '已有单元', chapterId: 'ch-0' },
    ]

    const data = buildClassificationData(existingChapters, existingUnits, 'chapter-and-unit')

    it('新章节 + 新单元', () => {
      const aiResponse = [
        {
          cardIndex: 0,
          assignType: 'new',
          newChapterName: '新章节名',
          newUnitName: '新单元名',
        },
      ]
      const newCards = [{ front: '卡片0', back: '' }]
      const assignments = simulateParseAIResponse(aiResponse, newCards, data)

      expect(assignments[0].chapterId).toBeNull()
      expect(assignments[0].unitId).toBeNull()
      expect(assignments[0].newChapterName).toBe('新章节名')
      expect(assignments[0].newUnitName).toBe('新单元名')
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 场景7：chapter-only 模式 — 不构建 unit 信息
  // ═══════════════════════════════════════════════════════════
  describe('场景7：chapter-only 模式', () => {
    const existingChapters = [
      { id: 'ch-0', name: '章节A' },
      { id: 'ch-1', name: '章节B' },
    ]
    const existingUnits = [
      { id: 'uid-0', name: '单元A1', chapterId: 'ch-0' },
      { id: 'uid-1', name: '单元B1', chapterId: 'ch-1' },
    ]

    const data = buildClassificationData(existingChapters, existingUnits, 'chapter-only')

    it('chapter-only 模式下 chapterUnitIdsMap 仍正确构建', () => {
      expect(data.chapterUnitIdsMap.size).toBe(2)
      expect(data.chapterUnitIdsMap.get(0)).toEqual(['uid-0'])
      expect(data.chapterUnitIdsMap.get(1)).toEqual(['uid-1'])
    })

    it('chapter-only 模式下 unitBlocks 不包含已归属章节的单元', () => {
      // 所有单元都归属章节，所以 unitBlocks 应为空
      expect(data.unitIdsByIndex).toEqual([])
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 场景8：Prompt 编号格式验证
  // ═══════════════════════════════════════════════════════════
  describe('场景8：Prompt 中章节内单元编号格式', () => {
    it('章节内单元应使用 per-chapter 索引（单元0, 单元1, ...），不应包含 chapterIndex', () => {
      const existingChapters = [
        { id: 'ch-0', name: '章节A' },
      ]
      const existingUnits = [
        { id: 'uid-0', name: '单元A1', chapterId: 'ch-0' },
        { id: 'uid-1', name: '单元A2', chapterId: 'ch-0' },
      ]

      const data = buildClassificationData(existingChapters, existingUnits, 'chapter-and-unit')

      expect(data.chapterBlocks).toHaveLength(1)
      const block = data.chapterBlocks[0]
      // 应包含 "单元0" 而非 "单元0-0"
      expect(block).toContain('单元0')
      expect(block).toContain('单元1')
      // 不应包含旧的 "单元0-0" 格式
      expect(block).not.toContain('单元0-0')
      expect(block).not.toContain('单元0-1')
    })
  })
})