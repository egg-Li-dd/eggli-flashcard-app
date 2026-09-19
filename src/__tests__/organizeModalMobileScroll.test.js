import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readSource(relativePath) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8')
}

describe('智能归类弹窗移动端滚动约束', () => {
  it('三个入口共用的卡片选择抽屉应使用 dvh 高度和 pan-y 内部滚动', () => {
    const css = readSource('../index.css')
    const modal = readSource('../components/CardSelectionModal.jsx')

    expect(css).toContain('min(86dvh, 760px)')
    expect(css).toContain('touch-action: pan-y')
    expect(css).toContain('overscroll-behavior: contain')
    expect(modal).toContain('data-mobile-scroll="card-selection-content"')
  })

  it('指定分类归类的目标分类弹窗应保留手机内部滚动区和安全区底部栏', () => {
    const source = readSource('../components/TargetCategorySelect.jsx')

    expect(source).toContain('calc(100dvh - 32px)')
    expect(source).toContain('data-mobile-scroll="target-category-content"')
    expect(source).toContain("touchAction: 'pan-y'")
    expect(source).toContain("overscrollBehavior: 'contain'")
    expect(source).toContain('safe-area-inset-bottom')
  })

  it('智能单元整理和 AI 全权归类确认弹窗应保留可滚动内容区', () => {
    const unit = readSource('../components/UnitReorganizeConfirm.jsx')
    const cross = readSource('../components/CrossCategoryConfirm.jsx')

    expect(unit).toContain('data-mobile-scroll="unit-reorganize-content"')
    expect(unit).toContain("touchAction: 'pan-y'")
    expect(unit).toContain("overscrollBehavior: 'contain'")
    expect(cross).toContain('data-mobile-scroll="cross-category-content"')
    expect(cross).toContain("touchAction: 'pan-y'")
    expect(cross).toContain("overscrollBehavior: 'contain'")
  })
})
