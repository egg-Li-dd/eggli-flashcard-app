import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('TargetCategorySelect 目标分类选择弹窗', () => {
  const sourcePath = resolve(process.cwd(), 'src/components/TargetCategorySelect.jsx')

  it('应提供现有分类列表、卡片数量、新建分类、上一步和下一步入口', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('目标分类')
    expect(source).toContain('cardCount')
    expect(source).toContain('新建分类')
    expect(source).toContain('上一步')
    expect(source).toContain('下一步')
    expect(source).toContain('onCreateCategory')
    expect(source).toContain('onBack')
    expect(source).toContain('onNext')
  })
})
