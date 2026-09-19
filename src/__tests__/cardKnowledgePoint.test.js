import { describe, it, expect } from 'vitest'
import { attachOriginalKnowledgePoints } from '../utils/cardKnowledgePoint'

describe('生成卡片原始知识点回填', () => {
  it('AI 漏返 knowledge_point 时，应按确认列表顺序写入原始知识点', () => {
    const cards = [
      { front: '操作系统有哪些作用？', back: '管理硬件资源、调度程序、文件管理、人机交互' },
      { front: '1KB 等于多少 B？', back: '1024B', knowledge_point: '' },
    ]
    const points = ['管理硬件资源、调度程序、文件管理、人机交互', '1KB=1024B']

    expect(attachOriginalKnowledgePoints(cards, points)).toEqual([
      { front: '操作系统有哪些作用？', back: '管理硬件资源、调度程序、文件管理、人机交互', knowledge_point: '管理硬件资源、调度程序、文件管理、人机交互', kpMarker: '__KP_0__', kpIndex: 0 },
      { front: '1KB 等于多少 B？', back: '1024B', knowledge_point: '1KB=1024B', kpMarker: '__KP_1__', kpIndex: 1 },
    ])
  })

  it('AI 返回 knowledge_point 时，也应以用户确认过的原始知识点为准，避免被 AI 改写', () => {
    const cards = [
      { front: '1KB 等于多少 B？', back: '1024B', knowledge_point: '一 KB 是一千零二十四字节' },
    ]
    const points = ['1KB=1024B']

    expect(attachOriginalKnowledgePoints(cards, points)[0].knowledge_point).toBe('1KB=1024B')
  })
})
