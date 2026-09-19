export function normalizeKnowledgePoint(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function dedupeCardsByKnowledgePoint(cards = []) {
  const safeCards = Array.isArray(cards) ? cards : []
  const seen = new Set()
  const uniqueCards = []
  let duplicateCount = 0

  for (const card of safeCards) {
    const key = normalizeKnowledgePoint(card?.knowledge_point || card?.knowledgePoint)
    if (!key) {
      uniqueCards.push(card)
      continue
    }
    if (seen.has(key)) {
      duplicateCount += 1
      continue
    }
    seen.add(key)
    uniqueCards.push(card)
  }

  return {
    uniqueCards,
    duplicateCount,
    originalCount: safeCards.length,
  }
}

export function buildSmartOrganizeSuccessMessage({
  movedCards = 0,
  createdUnits = 0,
  renamedUnits = 0,
  deletedEmptyUnits = 0,
  deletedEmptyCategories = 0,
  syncSuccess = null,
} = {}) {
  const parts = [`已整理 ${movedCards} 张卡片`]
  parts.push(`创建 ${createdUnits} 个新单元`)
  if (renamedUnits > 0) parts.push(`重命名 ${renamedUnits} 个单元`)
  parts.push(`删除 ${deletedEmptyUnits} 个空单元`)
  if (deletedEmptyCategories > 0) parts.push(`删除 ${deletedEmptyCategories} 个空分类`)
  if (syncSuccess === true) parts.push('已同步云端')
  if (syncSuccess === false) parts.push('云端同步失败，将在网络恢复后重试')
  return parts.join('，')
}

export function buildOperationErrorMessage(error, fallback = '操作失败') {
  const raw = String(error?.message || error || '').trim()
  const lower = raw.toLowerCase()

  if (lower.includes('failed to fetch') || lower.includes('network') || raw.includes('网络')) {
    return '网络连接中断：请检查网络后重试；本地数据不会被破坏。'
  }
  if (lower.includes('timeout') || raw.includes('超时')) {
    return 'AI 响应超时：请稍后重试，或减少本次选择的卡片数量。'
  }
  if (lower.includes('api key') || raw.includes('密钥') || raw.includes('配置')) {
    return 'AI 服务配置异常：请检查 AI 服务配置、模型名称和 API Key 后重试。'
  }
  if (lower.includes('empty') || raw.includes('空') || raw.includes('未生成有效') || raw.includes('未返回有效')) {
    return 'AI 未返回有效结果：请减少卡片数量、补充原始知识点后重试。'
  }
  if (lower.includes('quota') || raw.includes('限流') || raw.includes('余额')) {
    return 'AI 服务暂时不可用：可能是限流或余额不足，请稍后重试或切换服务商。'
  }

  return raw ? `${fallback}：${raw}。建议稍后重试，若仍失败请检查 AI 配置和网络。` : `${fallback}：未知错误。建议稍后重试。`
}
