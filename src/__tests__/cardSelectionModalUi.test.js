import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const componentPath = resolve(__dirname, '../components/CardSelectionModal.jsx')
const categorySource = readFileSync(resolve(__dirname, '../pages/Category.jsx'), 'utf8')
const unitGroupSource = readFileSync(resolve(__dirname, '../components/UnitGroup.jsx'), 'utf8')

describe('分类详情页智能整理入口与卡片选择弹窗 UI', () => {
  it('分类详情页应提供单元概览三点菜单和两个智能功能入口', () => {
    expect(categorySource).toContain('CardSelectionModal')
    expect(categorySource).toContain('智能单元整理')
    expect(categorySource).toContain('跨分类智能归类')
    expect(categorySource).toContain('unit-overview-menu')
  })

  it('通用卡片选择弹窗应支持分组、单元选择、反选、翻转和下一步禁用态', () => {
    expect(existsSync(componentPath)).toBe(true)
    const source = readFileSync(componentPath, 'utf8')
    expect(source).toContain('export default function CardSelectionModal')
    expect(source).toContain('groupExpanded')
    expect(source).toContain('toggleUnitSelection')
    expect(source).toContain('invertUnitSelection')
    expect(source).toContain('flippedCardIds')
    expect(source).toContain('knowledge_point')
    expect(source).toContain('已选择')
    expect(source).toContain('disabled={selectedCount === 0}')
  })

  it('UnitGroup 应保留并扩展多选模式的单元级操作入口', () => {
    expect(unitGroupSource).toContain('selectionMode')
    expect(unitGroupSource).toContain('showUnitSelectionControls')
    expect(unitGroupSource).toContain('onToggleUnitSelectAll')
    expect(unitGroupSource).toContain('onInvertUnitSelection')
  })
})
