import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  buildOperationErrorMessage,
  buildSmartOrganizeSuccessMessage,
  dedupeCardsByKnowledgePoint,
} from '../utils/smartOrganizeUx'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('智能归类 UI/UX 辅助逻辑', () => {
  it('AI 调用前应基于 knowledge_point 去重，并保留无 knowledge_point 的卡片', () => {
    const result = dedupeCardsByKnowledgePoint([
      { id: 'c1', knowledge_point: ' 操作系统的进程和线程 ', front: 'Q1', back: 'A1' },
      { id: 'c2', knowledge_point: '操作系统的进程和线程', front: 'Q2', back: 'A2' },
      { id: 'c3', knowledge_point: '计算机网络 OSI 模型', front: 'Q3', back: 'A3' },
      { id: 'c4', knowledge_point: '', front: '无知识点1', back: 'A4' },
      { id: 'c5', front: '无知识点2', back: 'A5' },
    ])

    expect(result.originalCount).toBe(5)
    expect(result.duplicateCount).toBe(1)
    expect(result.uniqueCards.map(card => card.id)).toEqual(['c1', 'c3', 'c4', 'c5'])
  })

  it('成功提示应包含整理卡片、创建单元、删除空单元与同步状态统计', () => {
    expect(buildSmartOrganizeSuccessMessage({
      movedCards: 12,
      createdUnits: 3,
      renamedUnits: 1,
      deletedEmptyUnits: 2,
      deletedEmptyCategories: 1,
      syncSuccess: true,
    })).toBe('已整理 12 张卡片，创建 3 个新单元，重命名 1 个单元，删除 2 个空单元，删除 1 个空分类，已同步云端')
  })

  it('错误提示应包含具体原因和解决建议', () => {
    expect(buildOperationErrorMessage(new Error('Failed to fetch'))).toContain('网络连接中断')
    expect(buildOperationErrorMessage(new Error('TIMEOUT'))).toContain('稍后重试')
    expect(buildOperationErrorMessage(new Error('API Key invalid'))).toContain('检查 AI 服务配置')
    expect(buildOperationErrorMessage(new Error('empty result'))).toContain('AI 未返回有效结果')
  })
})

describe('智能归类 UI 源码约束', () => {
  it('分类页应包含全流程加载提示与空状态提示', () => {
    const categorySource = readFileSync(resolve(__dirname, '../pages/Category.jsx'), 'utf8')

    expect(categorySource).toContain('AI 正在分析知识点...')
    expect(categorySource).toContain('正在整理卡片...')
    expect(categorySource).toContain('正在同步数据到云端...')
    expect(categorySource).toContain('该分类下没有卡片可整理')
  })

  it('卡片选择弹窗应在 50 张以上启用虚拟滚动窗口，并使用 sticky bottom + safe-area 底部栏', () => {
    const modalSource = readFileSync(resolve(__dirname, '../components/CardSelectionModal.jsx'), 'utf8')

    expect(modalSource).toContain('VIRTUAL_SCROLL_THRESHOLD')
    expect(modalSource).toContain('visibleCards')
    expect(modalSource).toContain('sticky')
    expect(modalSource).toContain('safe-area-inset-bottom')
  })
})
