import { memo } from 'react'
import katex from 'katex'
import { parseMathText } from '../utils/mathText'

/**
 * 公式渲染组件：把含 LaTeX 公式的文本渲染为带数学符号的内容。
 * - 行内公式 $...$ 用 KaTeX 行内渲染
 * - 块级公式 $$...$$ 用 KaTeX 块级渲染（居中、换行）
 * - 公式解析失败时降级为纯文本，不抛错
 * - 非字符串 children 直接返回 null
 *
 * Props:
 *   children  - string 待渲染文本
 *   as        - 外层标签名，默认 'span'
 *   style     - 外层样式
 *   mathStyle - 公式片段样式（可选，会与块级/行内默认样式合并）
 */
function MathTextBase({ children, as = 'span', style, mathStyle }) {
  if (typeof children !== 'string' || children.length === 0) {
    return null
  }

  const segments = parseMathText(children)
  if (segments.length === 0) return null

  const Tag = as
  const rendered = segments.map((seg, idx) => {
    if (seg.type === 'text') {
      return (
        <span
          key={idx}
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {seg.content}
        </span>
      )
    }
    // math 片段：用 katex 渲染为 HTML
    const displayMode = seg.type === 'block-math'
    let html = ''
    try {
      html = katex.renderToString(seg.content, {
        displayMode,
        throwOnError: false, // 解析失败不抛错，输出红色错误提示
        errorColor: '#e74c3c',
        strict: 'ignore', // 宽容非标准 LaTeX
        trust: false,
      })
    } catch (e) {
      // 极端容错：katex 抛错时降级为纯文本
      return (
        <span key={idx} style={{ whiteSpace: 'pre-wrap' }}>
          {displayMode ? `$$${seg.content}$$` : `$${seg.content}$`}
        </span>
      )
    }
    if (displayMode) {
      return (
        <div
          key={idx}
          style={{
            display: 'flex',
            justifyContent: 'center',
            margin: '8px 0',
            overflowX: 'auto',
            ...mathStyle,
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }
    return (
      <span
        key={idx}
        style={mathStyle}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  })

  return <Tag style={style}>{rendered}</Tag>
}

export const MathText = memo(MathTextBase)
export default MathText
