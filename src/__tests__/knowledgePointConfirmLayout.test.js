import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(__dirname, '../components/KnowledgePointConfirm.jsx'), 'utf8')

describe('KnowledgePointConfirm 移动端弹窗布局', () => {
  it('确认按钮区域应固定在弹窗底部并留出安全区，避免被底部输入栏或小视口遮挡', () => {
    expect(source).toContain('knowledge-point-confirm-dialog')
    expect(source).toContain('knowledge-point-confirm-list')
    expect(source).toContain('knowledge-point-confirm-actions')
    expect(source).toContain("position: 'sticky'")
    expect(source).toContain('bottom: 0')
    expect(source).toContain('env(safe-area-inset-bottom, 0px)')
  })
})
