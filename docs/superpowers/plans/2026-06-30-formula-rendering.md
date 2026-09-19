# 卡片公式渲染 (KaTeX) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 生成的卡片内容中的数学公式（LaTeX）能被正确渲染为美观的数学符号，而非一堆反斜杠源码；同时在 AI prompt 中规范公式处理，确保公式不丢失、格式统一。

**Architecture:**
1. **Prompt 规范层**：在 `constants.js` 所有卡片/知识点/题目生成 prompt 中追加"公式处理规则"，要求 AI 把原文中的数学公式统一用 LaTeX 输出（行内 `$...$`、块级 `$$...$$`），普通符号（x²、√、∑）也转为 LaTeX。
2. **公式提取工具层**：新建 `src/utils/mathText.js`，把混合文本分割为 `[{type:'text'|'inline-math'|'block-math', content}]` 片段数组，支持转义 `\$` 与容错。
3. **渲染组件层**：新建 `src/components/MathText.jsx`，用 `katex.renderToString` 渲染数学片段，纯文本片段原样输出，公式解析失败时降级为纯文本（不抛错）。
4. **渲染点接入层**：在 4 个组件（CardItem / NewCardPreviewPanel / KnowledgePointConfirm / TestCardItem）的"展示位置"用 `<MathText>` 替换纯文本渲染；编辑 textarea 保持源码可见，旁边/下方增加 KaTeX 预览。

**Tech Stack:**
- `katex`（npm 包，体积小、渲染快、移动端友好）
- React 19 现有技术栈
- Vitest 现有测试框架

**用户决策（已确认）：**
- 公式格式：LaTeX 为主，混合输入由 AI 自动识别统一
- 渲染方案：KaTeX 渲染（不引入完整 Markdown）
- 旧卡片：不处理，仅新生成的卡片生效
- 覆盖范围：卡片正反面 + 新卡片预览面板 + 知识点确认弹窗 + 单元检测题目

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `package.json` | 新增 `katex` 依赖 | 修改 |
| `src/main.jsx` | 全局引入 KaTeX CSS | 修改 |
| `src/utils/mathText.js` | 文本→片段数组提取工具（纯函数，可测） | 新建 |
| `src/components/MathText.jsx` | 公式渲染组件（text+math 片段渲染） | 新建 |
| `src/__tests__/mathText.test.js` | 提取工具单测 | 新建 |
| `src/utils/constants.js` | 所有 prompt 追加公式规则 | 修改 |
| `src/components/CardItem.jsx` | 卡片正反面/知识点接入 MathText | 修改 |
| `src/components/NewCardPreviewPanel.jsx` | 卡片预览接入 MathText + textarea 下方预览 | 修改 |
| `src/components/KnowledgePointConfirm.jsx` | 知识点 textarea 下方预览 | 修改 |
| `src/components/TestCardItem.jsx` | 题干/选项/解析接入 MathText | 修改 |

---

## Task 1: 安装 KaTeX 依赖并引入 CSS

**Files:**
- Modify: `package.json`
- Modify: `src/main.jsx`

- [ ] **Step 1: 安装 katex npm 包**

Run:
```bash
npm install katex@^0.16.11
```
Expected: `package.json` dependencies 出现 `"katex": "^0.16.11"`，`node_modules/katex` 存在。

- [ ] **Step 2: 在 main.jsx 引入 KaTeX CSS**

修改 `src/main.jsx`，在现有 import 之后追加一行：

```jsx
import 'katex/dist/katex.min.css'
```

位置：紧接在 `import './index.css'` 之前（让 KaTeX 样式先加载，便于 index.css 覆盖）。

- [ ] **Step 3: 验证构建不报错**

Run:
```bash
npm run build
```
Expected: 构建成功，无 "Cannot resolve katex" 错误。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main.jsx
git commit -m "chore: 引入 katex 依赖与全局 CSS"
```

---

## Task 2: 编写公式提取工具 mathText.js（TDD）

**Files:**
- Create: `src/utils/mathText.js`
- Create: `src/__tests__/mathText.test.js`

核心函数：`parseMathText(text)` 把混合文本分割为有序片段数组。

片段类型：
- `{ type: 'text', content: '普通文字' }`
- `{ type: 'inline-math', content: 'x^2 + y^2' }`（来自 `$...$`）
- `{ type: 'block-math', content: '\\int_0^1 x^2 dx' }`（来自 `$$...$$`）

规则：
1. 优先匹配 `$$...$$`（块级），再匹配 `$...$`（行内）
2. 转义的 `\$` 不算公式定界符，作为普通文字 `$` 输出
3. 未闭合的 `$`（行尾未配对）作为普通文字处理，不抛错
4. 空字符串返回 `[]`

- [ ] **Step 1: 编写失败测试**

创建 `src/__tests__/mathText.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { parseMathText } from '../utils/mathText'

describe('parseMathText', () => {
  it('空字符串返回空数组', () => {
    expect(parseMathText('')).toEqual([])
  })

  it('纯文本返回单个 text 片段', () => {
    expect(parseMathText('你好世界')).toEqual([
      { type: 'text', content: '你好世界' },
    ])
  })

  it('行内公式 $...$ 被识别为 inline-math', () => {
    expect(parseMathText('当 $x=2$ 时')).toEqual([
      { type: 'text', content: '当 ' },
      { type: 'inline-math', content: 'x=2' },
      { type: 'text', content: ' 时' },
    ])
  })

  it('块级公式 $$...$$ 被识别为 block-math', () => {
    expect(parseMathText('公式：$$\\int_0^1 x dx$$ 完成')).toEqual([
      { type: 'text', content: '公式：' },
      { type: 'block-math', content: '\\int_0^1 x dx' },
      { type: 'text', content: ' 完成' },
    ])
  })

  it('转义的 \\\$ 不作为公式定界符', () => {
    expect(parseMathText('价格 \\$5 和 $x=1$')).toEqual([
      { type: 'text', content: '价格 $5 和 ' },
      { type: 'inline-math', content: 'x=1' },
    ])
  })

  it('未闭合的 $ 作为普通文字', () => {
    expect(parseMathText('单价 5$ 未闭合')).toEqual([
      { type: 'text', content: '单价 5$ 未闭合' },
    ])
  })

  it('多个公式混合', () => {
    expect(parseMathText('$a$ 和 $b$')).toEqual([
      { type: 'inline-math', content: 'a' },
      { type: 'text', content: ' 和 ' },
      { type: 'inline-math', content: 'b' },
    ])
  })

  it('块级与行内混合', () => {
    expect(parseMathText('$$E=mc^2$$ 其中 $m$ 是质量')).toEqual([
      { type: 'block-math', content: 'E=mc^2' },
      { type: 'text', content: ' 其中 ' },
      { type: 'inline-math', content: 'm' },
      { type: 'text', content: ' 是质量' },
    ])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm test -- mathText
```
Expected: FAIL，提示 `parseMathText is not a function` 或模块不存在。

- [ ] **Step 3: 实现 parseMathText**

创建 `src/utils/mathText.js`：

```javascript
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npm test -- mathText
```
Expected: PASS，8 个用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/utils/mathText.js src/__tests__/mathText.test.js
git commit -m "feat: 新增 parseMathText 公式提取工具及单测"
```

---

## Task 3: 编写 MathText 渲染组件

**Files:**
- Create: `src/components/MathText.jsx`

组件职责：
- 接收 `children`（字符串）和可选 `style`、`as`（渲染标签，默认 `span`）
- 用 `parseMathText` 分割，text 片段直接渲染，math 片段用 `katex.renderToString` 转为 HTML
- 公式解析失败时降级为纯文本（用 try/catch），不抛错
- 块级公式用 `<div>` 包裹并居中

- [ ] **Step 1: 实现 MathText 组件**

创建 `src/components/MathText.jsx`：

```jsx
import { memo } from 'react'
import katex from 'katex'
import { parseMathText } from '../utils/mathText'

/**
 * 公式渲染组件：把含 LaTeX 公式的文本渲染为带数学符号的内容。
 * - 行内公式 $...$ 用 KaTeX 行内渲染
 * - 块级公式 $$...$$ 用 KaTeX 块级渲染（居中、换行）
 * - 公式解析失败时降级为纯文本，不抛错
 * - 非字符串 children 直接返回
 *
 * Props:
 *   children  - string 待渲染文本
 *   as        - 外层标签名，默认 'span'
 *   style     - 外层样式
 *   mathStyle - 公式片段样式（可选）
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
      return <span key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{seg.content}</span>
    }
    // math 片段：用 katex 渲染为 HTML
    const displayMode = seg.type === 'block-math'
    let html = ''
    try {
      html = katex.renderToString(seg.content, {
        displayMode,
        throwOnError: false,       // 解析失败不抛错，输出红色错误提示
        errorColor: '#e74c3c',
        strict: 'ignore',          // 宽容非标准 LaTeX
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
          style={{ display: 'flex', justifyContent: 'center', margin: '8px 0', ...mathStyle }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }
    return <span key={idx} style={mathStyle} dangerouslySetInnerHTML={{ __html: html }} />
  })

  return <Tag style={style}>{rendered}</Tag>
}

export const MathText = memo(MathTextBase)
export default MathText
```

- [ ] **Step 2: 验证构建**

Run:
```bash
npm run build
```
Expected: 构建成功，无 import 错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/MathText.jsx
git commit -m "feat: 新增 MathText 公式渲染组件"
```

---

## Task 4: 在 prompt 中追加公式处理规则

**Files:**
- Modify: `src/utils/constants.js`

在以下 5 处 prompt 追加"公式处理规则"段落：
1. `KNOWLEDGE_POINT_EXTRACTION_PROMPT`（强模型知识点提取）
2. `KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK`（弱模型知识点提取）
3. `buildPrompt`（旧版单步卡片生成）
4. `buildBatchCardsPromptCore`（两步生成 Step 2）
5. `buildRegenerateCardPrompt`（重新生成单卡）

统一公式规则文本（追加到各 prompt 的"其他要求/核心原则"之后）：

```
【公式处理规则（必须严格遵守）】
1. 原文中的数学公式必须完整保留，不得丢失、改写为自然语言或省略
2. 所有数学公式统一用 LaTeX 格式输出：
   - 行内公式用单美元符号包裹：$公式$，例如 $E=mc^2$、$x^2 + y^2 = r^2$
   - 独立成行的块级公式用双美元符号包裹：$$公式$$，例如 $$\int_0^1 x^2 dx$$
3. 原文中的普通数学符号也统一转为 LaTeX：
   - 上标 x²、x³ → $x^2$、$x^3$
   - 根号 √2、√x → $\sqrt{2}$、$\sqrt{x}$
   - 分数 1/2、a/b → $\frac{1}{2}$、$\frac{a}{b}$
   - 求和 ∑、积分 ∫、极限 lim → $\sum$、$\int$、$\lim$
   - 希腊字母 α、β、π、θ → $\alpha$、$\beta$、$\pi$、$\theta$
   - 关系符 ≤、≥、≠、≈ → $\leq$、$\geq$、$\neq$、$\approx$
4. 美元符号 $ 作为公式定界符，非公式的美元金额须用 \$ 转义
5. 公式内容必须放在 $ 或 $$ 之间，不得出现裸露的 LaTeX 命令（如单独的 \frac）
```

- [ ] **Step 1: 修改 buildPrompt（旧版单步卡片生成）**

在 `src/utils/constants.js` 的 `buildPrompt` 函数中，在 `其他要求：` 列表之后、`最终只输出标准JSON格式` 之前，插入公式规则。

定位 `buildPrompt` 函数（约 L240-269），将：

```javascript
function buildPrompt(densityHint, frontHint, backHint) {
  return `你是专业的背诵卡片制作助手，请处理用户提供的文本。
处理步骤：
第一步：先为每张卡片提炼一个"原始知识点"（knowledge_point），即本卡片对应的核心原文摘要，不超过150字；
第二步：基于该知识点生成卡片正面与背面。
其他要求：
1. 拆分知识点生成双面背诵卡片，卡片正面使用问题形式或关键词挖空形式，背面填写完整答案；
2. 根据内容的逻辑板块自动划分学习单元（每个单元应包含 5 张以上卡片，单元名称使用宽泛的概括性命名如"计算机网络基础"而非"OSI七层模型"，单元总数尽量控制在 5 个以内）；
3. 内容较长时合理拆分为多张卡片，保证单张卡片内容精简适合背诵；
4. 密度要求：${densityHint}；
5. 正面风格：${frontHint}；
6. 背面风格：${backHint}；
7. 最终只输出标准JSON格式，严禁出现多余文字、注释、Markdown符号。
```

改为（在 6 之后插入公式规则，序号顺延）：

```javascript
function buildPrompt(densityHint, frontHint, backHint) {
  return `你是专业的背诵卡片制作助手，请处理用户提供的文本。
处理步骤：
第一步：先为每张卡片提炼一个"原始知识点"（knowledge_point），即本卡片对应的核心原文摘要，不超过150字；
第二步：基于该知识点生成卡片正面与背面。
其他要求：
1. 拆分知识点生成双面背诵卡片，卡片正面使用问题形式或关键词挖空形式，背面填写完整答案；
2. 根据内容的逻辑板块自动划分学习单元（每个单元应包含 5 张以上卡片，单元名称使用宽泛的概括性命名如"计算机网络基础"而非"OSI七层模型"，单元总数尽量控制在 5 个以内）；
3. 内容较长时合理拆分为多张卡片，保证单张卡片内容精简适合背诵；
4. 密度要求：${densityHint}；
5. 正面风格：${frontHint}；
6. 背面风格：${backHint}；
7. 【公式处理规则（必须严格遵守）】
   - 原文中的数学公式必须完整保留，不得丢失、改写为自然语言或省略
   - 所有数学公式统一用 LaTeX 格式输出：行内公式用 $公式$，块级公式用 $$公式$$
   - 原文中的普通数学符号也统一转为 LaTeX：x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$，∑→$\\sum$，∫→$\\int$，π→$\\pi$，≤→$\\leq$，≠→$\\neq$
   - 非公式的美元金额用 \\$ 转义，公式必须放在 $ 或 $$ 之间
8. 最终只输出标准JSON格式，严禁出现多余文字、注释、Markdown符号。
```

- [ ] **Step 2: 修改 buildBatchCardsPromptCore（两步生成 Step 2）**

定位 `buildBatchCardsPromptCore`（约 L377-411），在 `要求：` 列表第 11 条之前插入公式规则。

将原第 10、11 条：

```javascript
10. 单元名称使用宽泛的概括性命名（如"计算机网络基础"），不超过16个字
11. 只输出标准 JSON 格式，严禁多余文字、注释、Markdown
```

改为：

```javascript
10. 单元名称使用宽泛的概括性命名（如"计算机网络基础"），不超过16个字
11. 【公式处理规则（必须严格遵守）】
    - 原文中的数学公式必须完整保留，不得丢失、改写为自然语言或省略
    - 所有数学公式统一用 LaTeX 格式输出：行内公式用 $公式$，块级公式用 $$公式$$
    - 原文中的普通数学符号也统一转为 LaTeX：x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$，∑→$\\sum$，∫→$\\int$，π→$\\pi$，≤→$\\leq$，≠→$\\neq$
    - 非公式的美元金额用 \\$ 转义，公式必须放在 $ 或 $$ 之间
12. 只输出标准 JSON 格式，严禁多余文字、注释、Markdown
```

- [ ] **Step 3: 修改 KNOWLEDGE_POINT_EXTRACTION_PROMPT（强模型知识点提取）**

定位 `KNOWLEDGE_POINT_EXTRACTION_PROMPT`（约 L318-346），在 `其他要求：` 列表中插入公式规则。

将原第 8 条：

```javascript
8. 只输出标准 JSON 格式，严禁多余文字、注释、Markdown
```

改为（公式规则作为第 8 条，原 8 顺延为 9）：

```javascript
8. 【公式处理规则（必须严格遵守）】
   - 原文中的数学公式必须原样保留在知识点中，不得丢失、改写为自然语言或省略
   - 所有数学公式统一用 LaTeX 格式：行内 $公式$，块级 $$公式$$
   - 普通数学符号也转为 LaTeX：x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$，∑→$\\sum$，∫→$\\int$，π→$\\pi$，≤→$\\leq$，≠→$\\neq$
   - 非公式的美元金额用 \\$ 转义
9. 只输出标准 JSON 格式，严禁多余文字、注释、Markdown
```

- [ ] **Step 4: 修改 KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK（弱模型知识点提取）**

定位 `KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK`（约 L349-370），在 `核心规则` 列表末尾追加公式规则。

将原第 5 条之后：

```javascript
5. 【不遗漏】每一条独立的知识都要提取出来，不要因为"主题相关"就合并
```

追加第 6 条：

```javascript
5. 【不遗漏】每一条独立的知识都要提取出来，不要因为"主题相关"就合并
6. 【公式保留】原文中的数学公式必须原样保留，统一用 LaTeX 格式：行内 $公式$，块级 $$公式$$；普通符号也转 LaTeX（x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$）；非公式美元用 \\$ 转义
```

- [ ] **Step 5: 修改 buildRegenerateCardPrompt（重新生成单卡）**

定位 `buildRegenerateCardPrompt`（约 L292-311），在 `要求：` 列表中插入公式规则。

将原第 4、5 条：

```javascript
4. 密度：${densityHint || '覆盖主要知识点，兼顾深度与广度'}。
5. 保留原始的知识点内容（供后续可再次编辑）。
```

改为：

```javascript
4. 密度：${densityHint || '覆盖主要知识点，兼顾深度与广度'}。
5. 保留原始的知识点内容（供后续可再次编辑）。
6. 【公式处理】数学公式必须用 LaTeX 格式：行内 $公式$，块级 $$公式$$；普通符号也转 LaTeX（x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$）；非公式美元用 \\$ 转义。
```

- [ ] **Step 6: 验证构建与 lint**

Run:
```bash
npm run build
```
Expected: 构建成功，无语法错误。

- [ ] **Step 7: Commit**

```bash
git add src/utils/constants.js
git commit -m "feat: 在卡片/知识点/题目 prompt 中追加 LaTeX 公式处理规则"
```

---

## Task 5: CardItem 接入 MathText 渲染

**Files:**
- Modify: `src/components/CardItem.jsx`

接入点（共 6 处展示，编辑 textarea 不改）：
- L507: large 模式正面 `{safeCard.front}` → `<MathText>{safeCard.front}</MathText>`
- L519: large 模式正面知识点 `{safeCard.knowledge_point}` → `<MathText>{safeCard.knowledge_point}</MathText>`
- L634: large 模式背面 `{safeCard.back}` → `<MathText>{safeCard.back}</MathText>`
- L646: large 模式背面知识点 `{safeCard.knowledge_point}` → `<MathText>{safeCard.knowledge_point}</MathText>`
- L974: compact 模式 `{flipped ? safeCard.back : safeCard.front}` → `<MathText>{flipped ? safeCard.back : safeCard.front}</MathText>`
- L988: compact 模式知识点 `{safeCard.knowledge_point}` → `<MathText>{safeCard.knowledge_point}</MathText>`

- [ ] **Step 1: 引入 MathText**

在 `src/components/CardItem.jsx` 顶部 import 区追加：

```jsx
import MathText from './MathText'
```

- [ ] **Step 2: 替换 large 模式正面（L507）**

将：
```jsx
              <p style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--color-text)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {safeCard.front}
              </p>
```

改为：
```jsx
              <p style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--color-text)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <MathText>{safeCard.front}</MathText>
              </p>
```

- [ ] **Step 3: 替换 large 模式正面知识点（L519）**

将：
```jsx
                <span style={{ fontWeight: 600 }}>知识点：</span>{safeCard.knowledge_point}
```

改为：
```jsx
                <span style={{ fontWeight: 600 }}>知识点：</span><MathText>{safeCard.knowledge_point}</MathText>
```

- [ ] **Step 4: 替换 large 模式背面（L634）**

将：
```jsx
              <p style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 500,
                color: 'var(--color-text)',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {safeCard.back}
              </p>
```

改为：
```jsx
              <p style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 500,
                color: 'var(--color-text)',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <MathText>{safeCard.back}</MathText>
              </p>
```

- [ ] **Step 5: 替换 large 模式背面知识点（L646）**

将：
```jsx
                <span style={{ fontWeight: 600 }}>知识点：</span>{safeCard.knowledge_point}
```

改为：
```jsx
                <span style={{ fontWeight: 600 }}>知识点：</span><MathText>{safeCard.knowledge_point}</MathText>
```

注意：L519 与 L646 是不同位置（正面/背面），`replace_all` 会同时改两处，可对两处分别用更大上下文定位，或直接用 `replace_all`（两处都需要改）。

- [ ] **Step 6: 替换 compact 模式正反面（L974）**

将：
```jsx
        <p style={{
          fontSize: 'var(--text-base)',
          color: 'var(--color-text)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          /* O-16：长文本自动 clamp，避免单卡过高 */
          maxHeight: '60vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          {flipped ? safeCard.back : safeCard.front}
        </p>
```

改为：
```jsx
        <p style={{
          fontSize: 'var(--text-base)',
          color: 'var(--color-text)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          /* O-16：长文本自动 clamp，避免单卡过高 */
          maxHeight: '60vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          <MathText>{flipped ? safeCard.back : safeCard.front}</MathText>
        </p>
```

- [ ] **Step 7: 替换 compact 模式知识点（L988）**

将：
```jsx
          <span style={{ fontWeight: 600, marginRight: 4 }}>知识点：</span>
          {safeCard.knowledge_point}
```

改为：
```jsx
          <span style={{ fontWeight: 600, marginRight: 4 }}>知识点：</span>
          <MathText>{safeCard.knowledge_point}</MathText>
```

- [ ] **Step 8: 验证构建**

Run:
```bash
npm run build
```
Expected: 构建成功。

- [ ] **Step 9: Commit**

```bash
git add src/components/CardItem.jsx
git commit -m "feat: CardItem 卡片正反面与知识点接入 MathText 公式渲染"
```

---

## Task 6: TestCardItem 接入 MathText 渲染

**Files:**
- Modify: `src/components/TestCardItem.jsx`

接入点：
- L693: 题干 `{stem}` → `<MathText>{stem}</MathText>`
- L172, L279: 选项 `{opt.text || opt.label}` → `<MathText>{opt.text || opt.label}</MathText>`
- L756: 知识点提示 `本题考察的是「{safeQ.knowledgePoint}」` → 用 MathText 包裹 knowledgePoint
- 解析 analysis 渲染处（需先定位）

- [ ] **Step 1: 定位 analysis 渲染位置**

Run（在项目内搜索）：
```bash
npm run -- grep "analysis" src/components/TestCardItem.jsx
```
或用 Grep 工具搜索 `safeQ.analysis` / `q.analysis` / `{analysis}` 在 TestCardItem.jsx 中的位置，记录行号。

- [ ] **Step 2: 引入 MathText**

在 `src/components/TestCardItem.jsx` 顶部 import 区追加：

```jsx
import MathText from './MathText'
```

- [ ] **Step 3: 替换题干渲染（L693）**

将：
```jsx
          {stem}
        </p>
```

改为：
```jsx
          <MathText>{stem}</MathText>
        </p>
```

- [ ] **Step 4: 替换单选题选项渲染（L172）**

将：
```jsx
            <span style={{
              flex: 1,
              fontSize: 'var(--text-base)',
              color: 'var(--color-text)',
              textAlign: 'left',
              lineHeight: 1.5,
            }}>
              {opt.text || opt.label}
            </span>
```

改为：
```jsx
            <span style={{
              flex: 1,
              fontSize: 'var(--text-base)',
              color: 'var(--color-text)',
              textAlign: 'left',
              lineHeight: 1.5,
            }}>
              <MathText>{opt.text || opt.label}</MathText>
            </span>
```

- [ ] **Step 5: 替换多选题选项渲染（L279）**

用相同方式替换第二处 `{opt.text || opt.label}`。

- [ ] **Step 6: 替换知识点提示（L756）**

将：
```jsx
                  本题考察的是「{safeQ.knowledgePoint}」。结合题干与选项，识别核心考点并对比正确选项的陈述要点；
```

改为：
```jsx
                  本题考察的是「<MathText>{safeQ.knowledgePoint}</MathText>」。结合题干与选项，识别核心考点并对比正确选项的陈述要点；
```

- [ ] **Step 7: 替换解析 analysis 渲染**

按 Step 1 定位的行号，把 `{safeQ.analysis}` 或 `{analysis}` 用 `<MathText>...</MathText>` 包裹。

- [ ] **Step 8: 验证构建**

Run:
```bash
npm run build
```
Expected: 构建成功。

- [ ] **Step 9: Commit**

```bash
git add src/components/TestCardItem.jsx
git commit -m "feat: TestCardItem 题干/选项/解析接入 MathText 公式渲染"
```

---

## Task 7: NewCardPreviewPanel 接入 MathText（textarea 下方预览）

**Files:**
- Modify: `src/components/NewCardPreviewPanel.jsx`

设计：textarea 保持源码编辑（用户能看到 `$x^2$` 源码便于修改），在每张卡片的 back textarea 下方增加一个紧凑的"预览"行，用 MathText 渲染 front+back，让用户确认公式效果。

- [ ] **Step 1: 引入 MathText**

在 `src/components/NewCardPreviewPanel.jsx` 顶部 import 区追加：

```jsx
import MathText from './MathText'
```

- [ ] **Step 2: 在 back textarea 下方增加预览区**

定位 back textarea（约 L410），在 `</textarea>` 之后、所在 div 关闭之前，追加预览区：

```jsx
                                      <textarea
                                        value={getCardBack(card, displayIdx)}
                                        onChange={(e) => handleCardEdit(displayIdx, 'back', e.target.value)}
                                        style={{
                                          width: '100%',
                                          // ... 原有样式保持
                                        }}
                                      />
                                      {/* 公式预览：让用户确认 LaTeX 渲染效果 */}
                                      <div style={{
                                        marginTop: 6,
                                        padding: '8px 10px',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px dashed var(--color-border-light)',
                                        fontSize: 'var(--text-sm)',
                                        color: 'var(--color-text-secondary)',
                                        lineHeight: 1.5,
                                      }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>预览：</div>
                                        <div style={{ color: 'var(--color-text)' }}>
                                          <span style={{ fontWeight: 600 }}>正面：</span><MathText>{getCardFront(card, displayIdx)}</MathText>
                                        </div>
                                        <div style={{ color: 'var(--color-text)', marginTop: 4 }}>
                                          <span style={{ fontWeight: 600 }}>背面：</span><MathText>{getCardBack(card, displayIdx)}</MathText>
                                        </div>
                                      </div>
```

- [ ] **Step 3: 验证构建**

Run:
```bash
npm run build
```
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/components/NewCardPreviewPanel.jsx
git commit -m "feat: NewCardPreviewPanel 新增公式预览区"
```

---

## Task 8: KnowledgePointConfirm 接入 MathText（textarea 下方预览）

**Files:**
- Modify: `src/components/KnowledgePointConfirm.jsx`

设计：知识点 textarea 下方增加预览行，用 MathText 渲染 `item.text`，让用户确认公式效果。

- [ ] **Step 1: 引入 MathText**

在 `src/components/KnowledgePointConfirm.jsx` 顶部 import 区追加：

```jsx
import MathText from './MathText'
```

- [ ] **Step 2: 在知识点 textarea 下方增加预览**

定位知识点 textarea（约 L208-227），在 `</textarea>` 之后追加预览区：

```jsx
                <textarea
                  value={item.text}
                  onChange={(e) => handleTextChange(item.id, e.target.value)}
                  rows={4}
                  style={{
                    // ... 原有样式保持
                  }}
                />
                {/* 公式预览：确认 LaTeX 渲染效果 */}
                <div style={{
                  marginTop: 4,
                  padding: '6px 10px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 6,
                  border: '1px dashed var(--color-border-light)',
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.5,
                  width: '100%',
                }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>预览：</span>
                  <MathText>{item.text}</MathText>
                </div>
```

- [ ] **Step 3: 验证构建**

Run:
```bash
npm run build
```
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/components/KnowledgePointConfirm.jsx
git commit -m "feat: KnowledgePointConfirm 新增公式预览区"
```

---

## Task 9: 端到端验证（热更新预览）

**Files:** 无代码改动，仅运行验证

- [ ] **Step 1: 启动 dev server**

Run:
```bash
npm run dev
```
Expected: Vite 启动，输出 Local: http://localhost:5173/

- [ ] **Step 2: 打开预览并测试公式渲染**

用内置浏览器打开预览，执行以下验证：
1. 进入分类页，触发"新建分类"或"AI 生成卡片"
2. 输入含公式的文本，例如：
   ```
   微积分基本定理：若 F(x) 是 f(x) 的原函数，则 ∫_a^b f(x)dx = F(b) - F(a)。
   勾股定理：a² + b² = c²。
   圆的面积公式：S = πr²。
   ```
3. 在知识点确认弹窗中确认：预览区的公式是否正确渲染为数学符号（积分号、上标、π）
4. 生成卡片后，在 NewCardPreviewPanel 确认：预览区公式渲染正确
5. 保存卡片后，在分类列表点击卡片，确认 CardItem 正反面公式渲染正确
6. 进入背诵页，翻转卡片，确认公式渲染正确
7. 进入单元检测，确认题干/选项公式渲染正确

- [ ] **Step 3: 验证移动端自适应**

在浏览器 DevTools 切换到移动端视图（375x812 iPhone 尺寸），确认：
- 公式不溢出屏幕
- 块级公式居中显示
- 长公式自动换行
- 按钮仍可见可用

- [ ] **Step 4: 验证无公式文本不回归**

输入纯文本（无公式）的内容，确认：
- 纯文本正常显示，不出现多余的 $ 或反斜杠
- 公式预览区对纯文本也正常显示

- [ ] **Step 5: 验证旧卡片不受影响**

查看已存在的旧卡片（无公式或含未渲染 LaTeX 源码），确认：
- 旧卡片仍能正常显示（纯文本部分正常，未闭合的 $ 作为普通文字）
- 不报错、不白屏

- [ ] **Step 6: Commit（如有修复）**

若验证发现问题，修复后提交：
```bash
git add -A
git commit -m "fix: 公式渲染端到端验证修复"
```

---

## Task 10: 更新文档分布

**Files:**
- Modify: `文档分布.txt`

- [ ] **Step 1: 在文档分布.txt 中追加新文件记录**

在"三、公共组件"区追加：

```
src/components/MathText.jsx (2026-06-30 新增)
  公式渲染组件
  - 接收字符串 children，用 parseMathText 分割为 text/inline-math/block-math 片段
  - math 片段用 katex.renderToString 渲染（throwOnError:false 容错）
  - 块级公式用 div 居中包裹，行内用 span
  - 公式解析失败时降级为纯文本，不抛错
  - 用 memo 优化避免不必要重渲染
  Props: children(string), as(标签名默认span), style, mathStyle
```

在"六、工具与配置"区追加：

```
src/utils/mathText.js (2026-06-30 新增)
  LaTeX 公式提取工具
  - parseMathText(text): 把含 $...$ / $$...$$ 的混合文本分割为片段数组
  - 支持 \$ 转义、未闭合 $ 容错
  - 返回 [{type:'text'|'inline-math'|'block-math', content}]
```

在"快速定位指南"区追加：

```
【公式渲染】
  - 公式提取工具 → utils/mathText.js parseMathText
  - 公式渲染组件 → components/MathText.jsx
  - 卡片正反面渲染 → CardItem.jsx (L507/L634/L974 已接入 MathText)
  - 检测题目渲染 → TestCardItem.jsx (题干/选项/解析已接入 MathText)
  - 新卡片预览 → NewCardPreviewPanel.jsx (textarea 下方预览区)
  - 知识点确认 → KnowledgePointConfirm.jsx (textarea 下方预览区)
  - prompt 公式规则 → constants.js (buildPrompt/buildBatchCardsPromptCore/KNOWLEDGE_POINT_EXTRACTION_PROMPT 等)
```

- [ ] **Step 2: Commit**

```bash
git add 文档分布.txt
git commit -m "docs: 更新文档分布记录公式渲染相关文件"
```

---

## Self-Review

**1. Spec 覆盖检查：**
- 用户需求"文字上传含公式，AI 返回不显示公式" → Task 4 prompt 规范要求 AI 保留并统一 LaTeX 输出 ✓
- "展示给用户的公式出现一堆符号" → Task 2/3 MathText + KaTeX 渲染 ✓
- 覆盖范围：卡片正反面（Task 5）、新卡片预览（Task 7）、知识点确认（Task 8）、单元检测题目（Task 6）✓
- 旧卡片不处理 → 计划未涉及批量回填，仅 Task 9 Step 5 验证旧卡不回归 ✓
- KaTeX 渲染 → Task 1 安装 katex ✓

**2. 占位符扫描：**
- Task 6 Step 1 的 analysis 定位用 Grep 工具，给出了具体命令，非占位符 ✓
- 所有代码块均完整 ✓
- 无 "TBD/TODO/适当处理" 等 ✓

**3. 类型一致性：**
- `parseMathText` 在 Task 2 定义，Task 3 MathText 中调用，签名一致 ✓
- `MathText` 组件 props `{children, as, style, mathStyle}` 在所有接入点使用一致 ✓
- prompt 规则文本在 5 处一致（仅序号调整）✓

**4. 风险点：**
- Task 4 prompt 修改涉及 5 处，需仔细对照行号（代码会漂移，建议按函数名定位而非行号）
- Task 6 Step 1 需先用 Grep 定位 analysis 实际行号
- Task 7/8 的预览区样式需符合移动端（已用 CSS 变量、紧凑 padding）
- KaTeX CSS 约 23KB，移动端可接受；如需进一步优化可改用按需加载，但本计划不引入

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-30-formula-rendering.md`.**

两种执行方式：

**1. Subagent-Driven（推荐）** - 每个 Task 派发独立 subagent，任务间审查，迭代快

**2. Inline Execution** - 在当前会话按 Task 顺序执行，带检查点审查

请选择执行方式，或先审阅计划。
