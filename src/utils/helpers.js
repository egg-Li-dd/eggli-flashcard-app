export function generateId() {
  // [P3-3] 优先使用 crypto.randomUUID，回退到 Date.now + Math.random（兼容旧环境）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export function formatTime(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (days > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (minutes > 0) return `${minutes}分钟前`
  return '刚刚'
}

export function compressImage(file, maxWidth = 2048, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const base64 = canvas.toDataURL('image/jpeg', quality)
        resolve(base64.split(',')[1])
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function sha256(text) {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function parseAIResponse(text, options = {}) {
  const { strictMode = false } = options
  let cleaned = text.trim()

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  }

  const tryStandardParse = (str) => {
    try {
      const parsed = JSON.parse(str)
      if (parsed && parsed.unit && Array.isArray(parsed.cards)) {
        return { units: [{ name: parsed.unit, cards: parsed.cards }] }
      }
      if (parsed && Array.isArray(parsed.units)) {
        return parsed
      }
    } catch (_) { /* standard parse failed */ }
    return null
  }

  const tryLenientParse = (str) => {
    // 单引号 JSON 修复（仅宽松模式）
    try {
      const parsed = JSON.parse(str.replace(/'/g, '"'))
      if (parsed && parsed.unit && Array.isArray(parsed.cards)) {
        return { units: [{ name: parsed.unit, cards: parsed.cards }] }
      }
      if (parsed && Array.isArray(parsed.units)) {
        return parsed
      }
    } catch (_) { /* lenient parse failed */ }
    return null
  }

  // 1. 标准 JSON.parse（所有模式）
  let result = tryStandardParse(cleaned)
  if (result) return result

  // 2. 严格模式：正则提取后仅尝试标准解析，不修复单引号
  if (strictMode) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      result = tryStandardParse(jsonMatch[0])
      if (result) return result
    }
    return { error: true, raw: cleaned }
  }

  // 3. 宽松模式：标准解析失败后尝试单引号修复
  result = tryLenientParse(cleaned)
  if (result) return result

  // 4. 宽松模式：正则提取 JSON 再尝试（含单引号修复）
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    result = tryStandardParse(jsonMatch[0])
    if (result) return result
    result = tryLenientParse(jsonMatch[0])
    if (result) return result
  }

  // 5. 所有尝试失败
  return { error: true, raw: cleaned }
}

export async function calculateImageHash(file) {
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function levenshteinDistance(str1, str2) {
  const m = str1.length
  const n = str2.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1
      }
    }
  }
  return dp[m][n]
}

export function matchUnit(existingUnits, aiUnitName) {
  let bestMatch = null
  let minDistance = Infinity
  for (const unit of existingUnits) {
    const dist = levenshteinDistance(unit.name, aiUnitName)
    if (dist < minDistance) {
      minDistance = dist
      bestMatch = unit
    }
  }
  return minDistance <= 2 ? bestMatch : null
}

export function simpleTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0
  const tokenize = (t) => {
    const tokens = t.split(/[\s，,。.！!？?；;：:、\n\r]+/).filter(w => w.length > 0)
    return new Set(tokens)
  }
  const set1 = tokenize(text1)
  const set2 = tokenize(text2)
  if (set1.size === 0 && set2.size === 0) return 1
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  return intersection.size / union.size
}

export function mergeSimilarUnits(unitDataList, similarityThreshold = 0.7) {
  if (!unitDataList || unitDataList.length < 2) return unitDataList

  const merged = [...unitDataList]
  let changed = true
  const maxIterations = 10

  for (let iter = 0; iter < maxIterations && changed; iter++) {
    changed = false

    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const unit1 = merged[i]
        const unit2 = merged[j]

        if (unit1.chapterId !== unit2.chapterId) continue

        const nameSimilarity = simpleTextSimilarity(unit1.name, unit2.name)

        const unit1Content = unit1.cards.map(c => c.front + c.back).join(' ')
        const unit2Content = unit2.cards.map(c => c.front + c.back).join(' ')
        const contentSimilarity = simpleTextSimilarity(unit1Content, unit2Content)

        const combinedSimilarity = (nameSimilarity + contentSimilarity) / 2

        if (combinedSimilarity >= similarityThreshold) {
          const mergedName = unit1.name.length >= unit2.name.length ? unit1.name : unit2.name

          merged[i] = {
            ...unit1,
            name: mergedName,
            cards: [...unit1.cards, ...unit2.cards],
          }

          merged.splice(j, 1)
          changed = true
          break
        }
      }
      if (changed) break
    }
  }

  return merged
}

export function shuffleArray(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function tryParseJSON(str) {
  try {
    return JSON.parse(str)
  } catch (_) {
    return null
  }
}

/**
 * 从 AI 原始响应中提取干净的 JSON 内容。
 * 用于处理模型返回的不纯净输出（如 markdown 代码块、AI 开场白、末尾多余文字等）。
 *
 * @param {string} rawContent - AI 原始响应文本
 * @param {string} aiServiceMode - AI 服务模式：'iflytek-spark' 使用宽松模式，其余使用严格模式
 * @returns {{ json: object|null, error: string|null }}
 */
export function extractJsonFromAiResponse(rawContent, aiServiceMode = '') {
  if (!rawContent || typeof rawContent !== 'string') {
    return { json: null, error: 'AI 返回内容为空' }
  }

  const isLenient = aiServiceMode === 'iflytek-spark'
  let text = rawContent.trim()

  // ===== 所有模式公用：去 markdown 代码块 =====
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // ===== 所有模式公用：去 AI 开场白 =====
  const jsonStart = text.search(/[\{\[]/)
  if (jsonStart > 0) {
    const maybePreamble = text.slice(0, jsonStart).trim()
    if (maybePreamble.length < 200 && /^(好的|以下|根据|这是|OK|这里|我已|为你|让我|现在|生成|如下|```|输出|返回|整理|拆分|提取|分析|处理|基于|按照|根据您|根据你的|Sure|Here|Below|The|I'|Let)/i.test(maybePreamble)) {
      text = text.slice(jsonStart)
    }
  }

  // ===== 尝试标准 JSON.parse（所有模式优先此路径）=====
  try {
    const parsed = JSON.parse(text)
    return { json: parsed, error: null }
  } catch (_) { /* continue */ }

  // ===== LaTeX 反斜杠修复：AI 返回的 JSON 中 LaTeX 反斜杠未转义（如 \lim, \sqrt, \( \)）=====
  // 策略：将 JSON 字符串值中的单反斜杠替换为双反斜杠，但保留已转义的字符
  try {
    const fixed = text.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\')
    const parsed = JSON.parse(fixed)
    return { json: parsed, error: null }
  } catch (_) { /* continue */ }

  // ===== 严格模式到此结束，返回明确错误 =====
  if (!isLenient) {
    // 最后尝试正则提取 JSON（不做单引号替换，保护内容完整性）
    // 先检查文本是否以 [ 开头 → 尝试数组匹配；否则先尝试对象匹配
    const trimmed = text.trim()
    const isArrayLike = trimmed.startsWith('[')
    const objMatch = text.match(/\{[\s\S]*\}/)
    const arrMatch = text.match(/\[[\s\S]*\]/)
    
    // 数组类文本优先匹配数组，避免对象正则误匹配数组中对象导致 invalid JSON
    if (isArrayLike) {
      if (arrMatch) {
        try { return { json: JSON.parse(arrMatch[0]), error: null } } catch (_) { /* fall through */ }
      }
    } else {
      if (objMatch) {
        try { return { json: JSON.parse(objMatch[0]), error: null } } catch (_) { /* fall through */ }
      }
    }
    
    // 兜底：尝试另一侧
    if (!isArrayLike && arrMatch) {
      try { return { json: JSON.parse(arrMatch[0]), error: null } } catch (_) { /* fall through */ }
    }
    if (isArrayLike && objMatch) {
      try { return { json: JSON.parse(objMatch[0]), error: null } } catch (_) { /* fall through */ }
    }
    
    return { json: null, error: 'AI 返回格式异常，请重试（模型未返回有效 JSON）' }
  }

  // ===== 以下仅宽松模式（iflytek-spark）执行 =====

  // 尝试单引号 JSON 修复
  try {
    const fixed = text.replace(/'/g, '"')
    const parsed = JSON.parse(fixed)
    return { json: parsed, error: null }
  } catch (_) { /* continue */ }

  // 正则提取 JSON 再解析（宽松版：允许单引号修复）
  const objMatch2 = text.match(/\{[\s\S]*\}/)
  const arrMatch2 = text.match(/\[[\s\S]*\]/)
  const candidate2 = objMatch2 ? objMatch2[0] : (arrMatch2 ? arrMatch2[0] : null)
  if (candidate2) {
    try {
      return { json: JSON.parse(candidate2), error: null }
    } catch (_) {
      try {
        return { json: JSON.parse(candidate2.replace(/'/g, '"')), error: null }
      } catch (_e) { /* fall through */ }
    }
  }

  // 宽松模式终极兜底：按 { } 括号深度逐对象提取
  // Spark Lite 有时返回多个独立 JSON 对象而非数组，如 { ... }\n{ ... }
  const objects = []
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        const objStr = text.slice(start, i + 1)
        try {
          const obj = JSON.parse(objStr)
          // 仅保留包含 stem 或 type 字段的对象，避免把非题目 JSON 混入
          if (obj && typeof obj === 'object' && !Array.isArray(obj) && (obj.stem || obj.type)) {
            objects.push(obj)
          }
        } catch (_) {
          try {
            const obj2 = JSON.parse(objStr.replace(/'/g, '"'))
            if (obj2 && typeof obj2 === 'object' && !Array.isArray(obj2) && (obj2.stem || obj2.type)) {
              objects.push(obj2)
            }
          } catch (_e) { /* skip malformed object */ }
        }
        start = -1
      }
    }
  }
  if (objects.length > 0) {
    return { json: objects, error: null }
  }

  // 按行提取知识点的终极后备
  const lines = rawContent.split(/\n/).map(s => s.trim()).filter(s => s.length > 10)
  if (lines.length > 0) {
    return { json: { knowledge_points: lines }, error: null }
  }

  return { json: null, error: 'Spark: 无法从响应中提取有效 JSON' }
}
