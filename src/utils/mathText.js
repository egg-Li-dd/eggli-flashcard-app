/**
 * 把含 LaTeX 公式的混合文本分割为有序片段数组。
 * - 块级公式 $$...$$ → { type: 'block-math', content }
 * - 行内公式 $...$   → { type: 'inline-math', content }
 * - 普通文字         → { type: 'text', content }
 * - 转义 \$ 作为普通 $ 文字，不作为定界符
 * - 未闭合的 $ 作为普通文字处理（容错）
 * @param {string} text
 * @returns {Array<{type: string, content: string}>}
 */
export function parseMathText(text) {
  if (typeof text !== 'string' || text.length === 0) return []

  const segments = []
  let i = 0
  let buf = ''

  const flushBuf = () => {
    if (buf.length > 0) {
      // 把转义 \$ 还原为普通 $
      segments.push({ type: 'text', content: buf.replace(/\\\$/g, '$') })
      buf = ''
    }
  }

  while (i < text.length) {
    const ch = text[i]

    // 处理转义 \$
    if (ch === '\\' && text[i + 1] === '$') {
      buf += '\\$'
      i += 2
      continue
    }

    // 块级公式 $$...$$
    if (ch === '$' && text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2)
      if (end !== -1) {
        flushBuf()
        segments.push({ type: 'block-math', content: text.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }

    // 行内公式 $...$
    if (ch === '$') {
      const end = text.indexOf('$', i + 1)
      if (end !== -1 && end > i + 1) {
        flushBuf()
        segments.push({ type: 'inline-math', content: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    buf += ch
    i += 1
  }

  flushBuf()
  return segments
}
