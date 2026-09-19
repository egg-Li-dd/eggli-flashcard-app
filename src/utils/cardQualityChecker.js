export const QUALITY_CHECK_CONFIG = {
  MIN_TEXT_LENGTH: 10,
  MAX_TEXT_LENGTH: 50000,
  MIN_KNOWLEDGE_POINTS: 1,
  MAX_KNOWLEDGE_POINTS: 200,
  MIN_CARD_FRONT_LENGTH: 5,
  MAX_CARD_FRONT_LENGTH: 500,
  MIN_CARD_BACK_LENGTH: 5,
  MAX_CARD_BACK_LENGTH: 2000,
  MAX_HINT_LENGTH: 200,
  MAX_EXPLANATION_LENGTH: 1000,
  MAX_OPTIONS_COUNT: 6,
  MIN_OPTIONS_COUNT: 2,
}

export function checkInputQuality(input) {
  const issues = []
  
  if (!input || typeof input !== 'string') {
    issues.push({ severity: 'error', code: 'INPUT_EMPTY', message: '输入内容为空' })
    return { valid: false, issues }
  }
  
  const trimmed = input.trim()
  
  if (trimmed.length < QUALITY_CHECK_CONFIG.MIN_TEXT_LENGTH) {
    issues.push({ 
      severity: 'warning', 
      code: 'INPUT_TOO_SHORT', 
      message: `输入内容过短（${trimmed.length}字），建议至少${QUALITY_CHECK_CONFIG.MIN_TEXT_LENGTH}字` 
    })
  }
  
  if (trimmed.length > QUALITY_CHECK_CONFIG.MAX_TEXT_LENGTH) {
    issues.push({ 
      severity: 'error', 
      code: 'INPUT_TOO_LONG', 
      message: `输入内容过长（${trimmed.length}字），超过${QUALITY_CHECK_CONFIG.MAX_TEXT_LENGTH}字限制` 
    })
  }
  
  const hasProfanity = detectProfanity(trimmed)
  if (hasProfanity) {
    issues.push({ 
      severity: 'error', 
      code: 'INPUT_PROFANITY', 
      message: '输入内容包含违规词汇' 
    })
  }
  
  return { 
    valid: issues.every(i => i.severity !== 'error'), 
    issues,
    stats: {
      length: trimmed.length,
      charCount: trimmed.length,
      wordCount: trimmed.split(/\s+/).filter(Boolean).length,
      lineCount: trimmed.split('\n').length,
    }
  }
}

export function checkKnowledgePointsQuality(points) {
  const issues = []
  
  if (!Array.isArray(points)) {
    issues.push({ severity: 'error', code: 'KP_NOT_ARRAY', message: '知识点必须是数组格式' })
    return { valid: false, issues }
  }
  
  if (points.length < QUALITY_CHECK_CONFIG.MIN_KNOWLEDGE_POINTS) {
    issues.push({ 
      severity: 'error', 
      code: 'KP_TOO_FEW', 
      message: `知识点数量不足（${points.length}个），至少需要${QUALITY_CHECK_CONFIG.MIN_KNOWLEDGE_POINTS}个` 
    })
  }
  
  if (points.length > QUALITY_CHECK_CONFIG.MAX_KNOWLEDGE_POINTS) {
    issues.push({ 
      severity: 'warning', 
      code: 'KP_TOO_MANY', 
      message: `知识点数量过多（${points.length}个），建议不超过${QUALITY_CHECK_CONFIG.MAX_KNOWLEDGE_POINTS}个` 
    })
  }
  
  const emptyPoints = points.filter(p => !p || typeof p !== 'string' || p.trim().length === 0)
  if (emptyPoints.length > 0) {
    issues.push({ 
      severity: 'warning', 
      code: 'KP_EMPTY', 
      message: `发现${emptyPoints.length}个空知识点` 
    })
  }
  
  const shortPoints = points.filter(p => typeof p === 'string' && p.trim().length < 5)
  if (shortPoints.length > 0) {
    issues.push({ 
      severity: 'warning', 
      code: 'KP_TOO_SHORT', 
      message: `发现${shortPoints.length}个过短的知识点（少于5字）` 
    })
  }
  
  const duplicates = findDuplicates(points)
  if (duplicates.length > 0) {
    issues.push({ 
      severity: 'warning', 
      code: 'KP_DUPLICATES', 
      message: `发现${duplicates.length}个重复知识点` 
    })
  }
  
  return { 
    valid: issues.every(i => i.severity !== 'error'), 
    issues,
    stats: {
      total: points.length,
      valid: points.filter(p => typeof p === 'string' && p.trim().length > 0).length,
      empty: emptyPoints.length,
      short: shortPoints.length,
      duplicates: duplicates.length,
    }
  }
}

export function checkCardQuality(card) {
  const issues = []
  
  if (!card || typeof card !== 'object') {
    issues.push({ severity: 'error', code: 'CARD_NOT_OBJECT', message: '卡片数据必须是对象' })
    return { valid: false, issues }
  }
  
  if (!card.front || typeof card.front !== 'string' || card.front.trim().length === 0) {
    issues.push({ severity: 'error', code: 'CARD_FRONT_EMPTY', message: '卡片正面内容不能为空' })
  } else {
    const frontLen = card.front.trim().length
    if (frontLen < QUALITY_CHECK_CONFIG.MIN_CARD_FRONT_LENGTH) {
      issues.push({ 
        severity: 'warning', 
        code: 'CARD_FRONT_TOO_SHORT', 
        message: `卡片正面过短（${frontLen}字），建议至少${QUALITY_CHECK_CONFIG.MIN_CARD_FRONT_LENGTH}字` 
      })
    }
    if (frontLen > QUALITY_CHECK_CONFIG.MAX_CARD_FRONT_LENGTH) {
      issues.push({ 
        severity: 'warning', 
        code: 'CARD_FRONT_TOO_LONG', 
        message: `卡片正面过长（${frontLen}字），建议不超过${QUALITY_CHECK_CONFIG.MAX_CARD_FRONT_LENGTH}字` 
      })
    }
  }
  
  if (!card.back || typeof card.back !== 'string' || card.back.trim().length === 0) {
    issues.push({ severity: 'error', code: 'CARD_BACK_EMPTY', message: '卡片背面内容不能为空' })
  } else {
    const backLen = card.back.trim().length
    if (backLen < QUALITY_CHECK_CONFIG.MIN_CARD_BACK_LENGTH) {
      issues.push({ 
        severity: 'warning', 
        code: 'CARD_BACK_TOO_SHORT', 
        message: `卡片背面过短（${backLen}字），建议至少${QUALITY_CHECK_CONFIG.MIN_CARD_BACK_LENGTH}字` 
      })
    }
    if (backLen > QUALITY_CHECK_CONFIG.MAX_CARD_BACK_LENGTH) {
      issues.push({ 
        severity: 'warning', 
        code: 'CARD_BACK_TOO_LONG', 
        message: `卡片背面过长（${backLen}字），建议不超过${QUALITY_CHECK_CONFIG.MAX_CARD_BACK_LENGTH}字` 
      })
    }
  }
  
  if (card.hint && typeof card.hint === 'string') {
    const hintLen = card.hint.trim().length
    if (hintLen > QUALITY_CHECK_CONFIG.MAX_HINT_LENGTH) {
      issues.push({ 
        severity: 'warning', 
        code: 'CARD_HINT_TOO_LONG', 
        message: `提示内容过长（${hintLen}字），建议不超过${QUALITY_CHECK_CONFIG.MAX_HINT_LENGTH}字` 
      })
    }
  }
  
  if (card.explanation && typeof card.explanation === 'string') {
    const expLen = card.explanation.trim().length
    if (expLen > QUALITY_CHECK_CONFIG.MAX_EXPLANATION_LENGTH) {
      issues.push({ 
        severity: 'warning', 
        code: 'CARD_EXPLANATION_TOO_LONG', 
        message: `解析内容过长（${expLen}字），建议不超过${QUALITY_CHECK_CONFIG.MAX_EXPLANATION_LENGTH}字` 
      })
    }
  }
  
  if (card.type) {
    const validTypes = ['short', 'multiple', 'fill', 'judge', 'essay']
    if (!validTypes.includes(card.type)) {
      issues.push({ 
        severity: 'warning', 
        code: 'CARD_TYPE_INVALID', 
        message: `卡片类型 "${card.type}" 无效，有效值：${validTypes.join(', ')}` 
      })
    }
    
    if (card.type === 'short' || card.type === 'multiple') {
      if (!card.options || !Array.isArray(card.options)) {
        issues.push({ severity: 'error', code: 'CARD_OPTIONS_MISSING', message: '选择题必须包含选项' })
      } else {
        if (card.options.length < QUALITY_CHECK_CONFIG.MIN_OPTIONS_COUNT) {
          issues.push({ 
            severity: 'error', 
            code: 'CARD_OPTIONS_TOO_FEW', 
            message: `选项数量不足（${card.options.length}个），至少需要${QUALITY_CHECK_CONFIG.MIN_OPTIONS_COUNT}个` 
          })
        }
        if (card.options.length > QUALITY_CHECK_CONFIG.MAX_OPTIONS_COUNT) {
          issues.push({ 
            severity: 'warning', 
            code: 'CARD_OPTIONS_TOO_MANY', 
            message: `选项数量过多（${card.options.length}个），建议不超过${QUALITY_CHECK_CONFIG.MAX_OPTIONS_COUNT}个` 
          })
        }
        
        const emptyOptions = card.options.filter(o => !o || typeof o !== 'string' || o.trim().length === 0)
        if (emptyOptions.length > 0) {
          issues.push({ 
            severity: 'warning', 
            code: 'CARD_OPTIONS_EMPTY', 
            message: `发现${emptyOptions.length}个空选项` 
          })
        }
      }
      
      if (card.type === 'multiple' && (!card.answerBlank || typeof card.answerBlank !== 'string')) {
        issues.push({ severity: 'error', code: 'CARD_ANSWER_MISSING', message: '选择题必须包含答案' })
      }
    }
  }
  
  const hasProfanity = detectProfanity(card.front || '') || detectProfanity(card.back || '')
  if (hasProfanity) {
    issues.push({ severity: 'error', code: 'CARD_PROFANITY', message: '卡片内容包含违规词汇' })
  }
  
  return { 
    valid: issues.every(i => i.severity !== 'error'), 
    issues,
    stats: {
      frontLength: (card.front || '').length,
      backLength: (card.back || '').length,
      hasHint: !!card.hint,
      hasExplanation: !!card.explanation,
      type: card.type || 'unknown',
    }
  }
}

export function checkCardsQuality(cards) {
  const issues = []
  const cardResults = []
  
  if (!Array.isArray(cards)) {
    issues.push({ severity: 'error', code: 'CARDS_NOT_ARRAY', message: '卡片列表必须是数组' })
    return { valid: false, issues, cardResults: [] }
  }
  
  if (cards.length === 0) {
    issues.push({ severity: 'error', code: 'CARDS_EMPTY', message: '卡片列表为空' })
    return { valid: false, issues, cardResults: [] }
  }
  
  cards.forEach((card, index) => {
    const result = checkCardQuality(card)
    result.index = index
    cardResults.push(result)
    
    if (!result.valid) {
      issues.push({ 
        severity: 'error', 
        code: `CARD_${index}_INVALID`, 
        message: `第${index + 1}张卡片验证失败` 
      })
    }
  })
  
  const errors = cardResults.filter(r => !r.valid).length
  const warnings = cardResults.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'warning').length, 0)
  
  return { 
    valid: errors === 0, 
    issues,
    cardResults,
    stats: {
      total: cards.length,
      valid: cardResults.filter(r => r.valid).length,
      errors,
      warnings,
    }
  }
}

export function checkImageQuality(imageFile) {
  const issues = []
  
  if (!imageFile) {
    issues.push({ severity: 'error', code: 'IMAGE_EMPTY', message: '图片文件为空' })
    return { valid: false, issues }
  }
  
  if (!imageFile.type || !imageFile.type.startsWith('image/')) {
    issues.push({ severity: 'error', code: 'IMAGE_INVALID_TYPE', message: '文件不是有效的图片格式' })
    return { valid: false, issues }
  }
  
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!validTypes.includes(imageFile.type)) {
    issues.push({ 
      severity: 'warning', 
      code: 'IMAGE_TYPE_NOT_OPTIMAL', 
      message: `图片格式 "${imageFile.type}" 不是最优格式，推荐使用 jpeg、png 或 webp` 
    })
  }
  
  const MAX_SIZE = 50 * 1024 * 1024
  if (imageFile.size > MAX_SIZE) {
    issues.push({ 
      severity: 'error', 
      code: 'IMAGE_TOO_LARGE', 
      message: `图片过大（${(imageFile.size / 1024 / 1024).toFixed(1)}MB），超过50MB限制` 
    })
  }
  
  return { 
    valid: issues.every(i => i.severity !== 'error'), 
    issues,
    stats: {
      type: imageFile.type,
      size: imageFile.size,
      sizeMB: (imageFile.size / 1024 / 1024).toFixed(2),
    }
  }
}

export function validateAiResponseFormat(content, aiServiceMode) {
  const issues = []
  
  if (!content || typeof content !== 'string') {
    issues.push({ severity: 'error', code: 'RESPONSE_EMPTY', message: 'AI响应为空' })
    return { valid: false, issues, parsed: null }
  }
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      issues.push({ severity: 'error', code: 'RESPONSE_NOT_JSON', message: 'AI响应不是有效的JSON格式' })
      return { valid: false, issues, parsed: null }
    }
    
    const jsonStr = jsonMatch[0]
    const parsed = JSON.parse(jsonStr)
    
    return { valid: true, issues, parsed }
  } catch (err) {
    issues.push({ 
      severity: 'error', 
      code: 'RESPONSE_JSON_PARSE_ERROR', 
      message: `JSON解析失败: ${err.message}` 
    })
    return { valid: false, issues, parsed: null }
  }
}

function detectProfanity(text) {
  const profanityPatterns = [
    /[\u4e00-\u9fa5]{0,2}fuck[\u4e00-\u9fa5]{0,2}/i,
    /[\u4e00-\u9fa5]{0,2}shit[\u4e00-\u9fa5]{0,2}/i,
    /[\u4e00-\u9fa5]{0,2}bitch[\u4e00-\u9fa5]{0,2}/i,
    /[\u4e00-\u9fa5]{0,2}damn[\u4e00-\u9fa5]{0,2}/i,
    /[\u4e00-\u9fa5]{0,2}asshole[\u4e00-\u9fa5]{0,2}/i,
    /[\u4e00-\u9fa5]{0,2}混蛋[\u4e00-\u9fa5]{0,2}/,
    /[\u4e00-\u9fa5]{0,2}傻逼[\u4e00-\u9fa5]{0,2}/,
    /[\u4e00-\u9fa5]{0,2}傻屌[\u4e00-\u9fa5]{0,2}/,
    /[\u4e00-\u9fa5]{0,2}妈逼[\u4e00-\u9fa5]{0,2}/,
    /[\u4e00-\u9fa5]{0,2}操你妈[\u4e00-\u9fa5]{0,2}/,
    /[\u4e00-\u9fa5]{0,2}去死[\u4e00-\u9fa5]{0,2}/,
    /[\u4e00-\u9fa5]{0,2}滚蛋[\u4e00-\u9fa5]{0,2}/,
  ]
  
  return profanityPatterns.some(pattern => pattern.test(text))
}

function findDuplicates(arr) {
  const seen = new Map()
  const duplicates = []
  
  arr.forEach((item, index) => {
    const normalized = typeof item === 'string' ? item.trim().toLowerCase() : String(item)
    if (seen.has(normalized)) {
      if (!duplicates.includes(normalized)) {
        duplicates.push(normalized)
      }
    } else {
      seen.set(normalized, index)
    }
  })
  
  return duplicates
}

export function generateQualityReport(input, knowledgePoints, cards) {
  const report = {
    timestamp: new Date().toISOString(),
    input: checkInputQuality(input),
    knowledgePoints: checkKnowledgePointsQuality(knowledgePoints),
    cards: checkCardsQuality(cards),
    summary: {},
  }
  
  const allIssues = [
    ...report.input.issues,
    ...report.knowledgePoints.issues,
    ...report.cards.issues,
  ]
  
  const errors = allIssues.filter(i => i.severity === 'error').length
  const warnings = allIssues.filter(i => i.severity === 'warning').length
  
  report.summary = {
    totalErrors: errors,
    totalWarnings: warnings,
    overallQuality: errors === 0 ? (warnings === 0 ? 'excellent' : 'good') : 'poor',
    inputLength: report.input.stats?.length || 0,
    knowledgePointsCount: report.knowledgePoints.stats?.total || 0,
    cardsCount: report.cards.stats?.total || 0,
    validCardsCount: report.cards.stats?.valid || 0,
  }
  
  return report
}

export function autoFixCard(card) {
  if (!card || typeof card !== 'object') {
    return { card: card, fixes: [] }
  }
  
  const fixes = []
  const fixedCard = { ...card }
  
  if (!fixedCard.front || typeof fixedCard.front !== 'string') {
    fixedCard.front = '请补充问题内容'
    fixes.push('正面内容为空，已填充默认内容')
  } else {
    const trimmedFront = fixedCard.front.trim()
    if (trimmedFront.length === 0) {
      fixedCard.front = '请补充问题内容'
      fixes.push('正面内容为空，已填充默认内容')
    } else if (trimmedFront.length < QUALITY_CHECK_CONFIG.MIN_CARD_FRONT_LENGTH) {
      fixedCard.front = trimmedFront + '。请详细描述这个问题。'
      fixes.push('正面内容过短，已补充建议内容')
    } else if (trimmedFront.length > QUALITY_CHECK_CONFIG.MAX_CARD_FRONT_LENGTH) {
      fixedCard.front = trimmedFront.substring(0, QUALITY_CHECK_CONFIG.MAX_CARD_FRONT_LENGTH) + '...'
      fixes.push('正面内容过长，已截断')
    }
  }
  
  if (!fixedCard.back || typeof fixedCard.back !== 'string') {
    fixedCard.back = '请补充答案内容'
    fixes.push('背面内容为空，已填充默认内容')
  } else {
    const trimmedBack = fixedCard.back.trim()
    if (trimmedBack.length === 0) {
      fixedCard.back = '请补充答案内容'
      fixes.push('背面内容为空，已填充默认内容')
    } else if (trimmedBack.length < QUALITY_CHECK_CONFIG.MIN_CARD_BACK_LENGTH) {
      fixedCard.back = trimmedBack + '。请提供更详细的解释。'
      fixes.push('背面内容过短，已补充建议内容')
    } else if (trimmedBack.length > QUALITY_CHECK_CONFIG.MAX_CARD_BACK_LENGTH) {
      fixedCard.back = trimmedBack.substring(0, QUALITY_CHECK_CONFIG.MAX_CARD_BACK_LENGTH) + '...'
      fixes.push('背面内容过长，已截断')
    }
  }
  
  if (fixedCard.hint && typeof fixedCard.hint === 'string') {
    const trimmedHint = fixedCard.hint.trim()
    if (trimmedHint.length > QUALITY_CHECK_CONFIG.MAX_HINT_LENGTH) {
      fixedCard.hint = trimmedHint.substring(0, QUALITY_CHECK_CONFIG.MAX_HINT_LENGTH) + '...'
      fixes.push('提示内容过长，已截断')
    }
  }
  
  if (fixedCard.explanation && typeof fixedCard.explanation === 'string') {
    const trimmedExp = fixedCard.explanation.trim()
    if (trimmedExp.length > QUALITY_CHECK_CONFIG.MAX_EXPLANATION_LENGTH) {
      fixedCard.explanation = trimmedExp.substring(0, QUALITY_CHECK_CONFIG.MAX_EXPLANATION_LENGTH) + '...'
      fixes.push('解析内容过长，已截断')
    }
  }
  
  if (fixedCard.options && Array.isArray(fixedCard.options)) {
    fixedCard.options = fixedCard.options.filter(o => typeof o === 'string' && o.trim().length > 0)
    
    while (fixedCard.options.length < QUALITY_CHECK_CONFIG.MIN_OPTIONS_COUNT) {
      const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F']
      const nextOption = `${optionLabels[fixedCard.options.length]}. 选项${fixedCard.options.length + 1}`
      fixedCard.options.push(nextOption)
      fixes.push(`选项数量不足，已添加默认选项 "${nextOption}"`)
    }
    
    if (fixedCard.options.length > QUALITY_CHECK_CONFIG.MAX_OPTIONS_COUNT) {
      fixedCard.options = fixedCard.options.slice(0, QUALITY_CHECK_CONFIG.MAX_OPTIONS_COUNT)
      fixes.push(`选项数量过多，已保留前${QUALITY_CHECK_CONFIG.MAX_OPTIONS_COUNT}个`)
    }
  }
  
  if (!fixedCard.type) {
    fixedCard.type = 'short'
    fixes.push('卡片类型未设置，默认设为简答题')
  } else {
    const validTypes = ['short', 'multiple', 'fill', 'judge', 'essay']
    if (!validTypes.includes(fixedCard.type)) {
      fixedCard.type = 'short'
      fixes.push(`卡片类型 "${fixedCard.type}" 无效，已改为简答题`)
    }
  }
  
  return { card: fixedCard, fixes }
}

export function autoFixCards(cards) {
  if (!Array.isArray(cards)) {
    return { cards: cards, fixes: [] }
  }
  
  const allFixes = []
  const fixedCards = cards.map((card, index) => {
    const result = autoFixCard(card)
    if (result.fixes.length > 0) {
      allFixes.push({ index, fixes: result.fixes })
    }
    return result.card
  })
  
  return { cards: fixedCards, fixes: allFixes }
}