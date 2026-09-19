import { describe, it, expect } from 'vitest'
import { classifyCardsByCategoryContent } from '../services/aiService'

describe('classifyCardsByCategoryContent 同分类单元重组模式', () => {
  it('无 AI 配置时应降级为本地关键词匹配并返回可确认的单元结构', async () => {
    const existingUnits = [
      { id: 'u-politics', name: '政治经济学' },
      { id: 'u-english', name: '英语阅读' },
    ]
    const selectedCards = [
      { id: 'c1', unitId: 'u-english', front: '政治经济学中的商品二因素是什么？', back: '使用价值和价值' },
      { id: 'c2', unitId: 'u-politics', front: '英语阅读中如何定位长难句主干？', back: '先找谓语动词' },
    ]

    const result = await classifyCardsByCategoryContent(
      existingUnits,
      selectedCards,
      selectedCards,
      { mode: 'same-category-reorganize' },
    )

    expect(result.mode).toBe('same-category-reorganize')
    expect(result.usedFallback).toBe(true)
    expect(result.units).toEqual([
      {
        unitId: 'u-politics',
        name: '政治经济学',
        cards: [expect.objectContaining({ id: 'c1' })],
      },
      {
        unitId: 'u-english',
        name: '英语阅读',
        cards: [expect.objectContaining({ id: 'c2' })],
      },
    ])
  })
})
