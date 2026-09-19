export class JsonParser {
  static parseWithFallback(raw, options = {}) {
    const strategies = [
      () => JsonParser._strategyDirect(raw),
      () => JsonParser._strategyBoundaryExtract(raw),
      () => JsonParser._strategyFixTrailingComma(raw),
      () => JsonParser._strategyCodeBlockRemove(raw),
      () => JsonParser._strategyCombined(raw),
    ]

    for (const strategy of strategies) {
      try {
        const result = strategy()
        if (result !== null && result !== undefined) {
          return result
        }
      } catch (_) {}
    }

    if (options.returnRawOnFailure) {
      return raw
    }

    throw new Error('JSON解析失败：无法从响应中提取有效JSON')
  }

  static _strategyDirect(raw) {
    const trimmed = String(raw).trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  }

  static _strategyBoundaryExtract(raw) {
    const trimmed = String(raw).trim()
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    }

    const firstBracket = trimmed.indexOf('[')
    const lastBracket = trimmed.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
    }

    return null
  }

  static _strategyFixTrailingComma(raw) {
    const cleaned = JsonParser._removeTrailingCommas(String(raw))
    return JsonParser._strategyBoundaryExtract(cleaned)
  }

  static _strategyCodeBlockRemove(raw) {
    const cleaned = JsonParser._removeCodeBlocks(String(raw))
    return JsonParser._strategyBoundaryExtract(cleaned)
  }

  static _strategyCombined(raw) {
    let cleaned = String(raw)
    cleaned = JsonParser._removeCodeBlocks(cleaned)
    cleaned = JsonParser._removeMarkdownFormatting(cleaned)
    cleaned = JsonParser._removeTrailingCommas(cleaned)
    cleaned = JsonParser._normalizeQuotes(cleaned)
    return JsonParser._strategyBoundaryExtract(cleaned)
  }

  static _removeCodeBlocks(text) {
    let result = text
    result = result.replace(/```json\s*/gi, '')
    result = result.replace(/```\s*/g, '')
    result = result.replace(/`([^`]+)`/g, '$1')
    return result
  }

  static _removeMarkdownFormatting(text) {
    let result = text
    result = result.replace(/^\s*[#*>-]+\s*/gm, '')
    result = result.replace(/\*\*/g, '')
    result = result.replace(/__/g, '')
    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    return result
  }

  static _removeTrailingCommas(text) {
    let result = text
    result = result.replace(/,\s*([}\]])/g, '$1')
    result = result.replace(/,\s*$/gm, '')
    return result
  }

  static _normalizeQuotes(text) {
    let result = text
    result = result.replace(/["']`/g, '"')
    result = result.replace(/`["']/g, '"')
    result = result.replace(/“|”/g, '"')
    result = result.replace(/‘|’/g, "'")
    return result
  }

  static extractArray(raw, fallback = []) {
    try {
      const result = JsonParser.parseWithFallback(raw, { returnRawOnFailure: false })
      if (Array.isArray(result)) {
        return result
      }
      if (result && Array.isArray(result.data)) {
        return result.data
      }
      if (result && Array.isArray(result.items)) {
        return result.items
      }
      if (result && Array.isArray(result.result)) {
        return result.result
      }
    } catch (_) {}

    return fallback
  }

  static extractObject(raw, fallback = {}) {
    try {
      const result = JsonParser.parseWithFallback(raw, { returnRawOnFailure: false })
      if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
        return result
      }
    } catch (_) {}

    return fallback
  }

  static safeParse(raw, fallback = null) {
    try {
      return JsonParser.parseWithFallback(raw, { returnRawOnFailure: false })
    } catch (_) {
      return fallback
    }
  }

  static validateJsonStructure(parsed, expectedKeys = []) {
    const errors = []
    const warnings = []

    if (parsed === null || parsed === undefined) {
      errors.push('解析结果为空')
      return { valid: false, errors, warnings }
    }

    if (typeof parsed !== 'object') {
      errors.push('解析结果不是对象或数组')
      return { valid: false, errors, warnings }
    }

    for (const key of expectedKeys) {
      if (!(key in parsed)) {
        warnings.push(`缺少预期字段: ${key}`)
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }
}

export function parseJsonWithFallback(raw, options = {}) {
  return JsonParser.parseWithFallback(raw, options)
}

export function safeParseJson(raw, fallback = null) {
  return JsonParser.safeParse(raw, fallback)
}
