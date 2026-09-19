/**
 * 将原始知识点附着到 AI 生成的卡片上
 * @param {object[]} cards - AI 生成的卡片数组
 * @param {string[]} originalKnowledgePoints - 对应的原始知识点数组
 * @returns {object[]} 附着原始知识点后的卡片数组
 */
export function attachOriginalKnowledgePoints(cards, originalKnowledgePoints) {
  const safeCards = Array.isArray(cards) ? cards : []
  const safePoints = Array.isArray(originalKnowledgePoints) ? originalKnowledgePoints : []

  // [fix-P2-9] 优先使用卡片自带的 kpMarker/kpIndex 匹配知识点，
  // 只有当这些字段不存在时才回退到位置索引匹配。
  // 这样可以兼容：
  // 1. 弱模型 1:1 映射（kpIndex === 位置索引）
  // 2. 强模型带 kpMarker 的卡片（通过 kpMarker 提取 kpIndex 匹配）
  // 3. 无 kpMarker 的卡片（回退到位置索引）
  return safeCards.map((card, index) => {
    // [fix-P1] 优先保留 AI 返回的 kpMarker/kpIndex，仅在缺失时才用数组索引回退
    const hasKpIndex = card && card.kpIndex !== undefined && card.kpIndex !== null
    let kpIndex = hasKpIndex ? card.kpIndex : index
    // 边界检查
    if (kpIndex < 0 || kpIndex >= safePoints.length) {
      kpIndex = index  // 回退到位置索引
    }

    const originalPoint = kpIndex < safePoints.length && typeof safePoints[kpIndex] === 'string'
      ? safePoints[kpIndex].trim()
      : ''
    const aiPoint = card && typeof card.knowledge_point === 'string' ? card.knowledge_point.trim() : ''

    return {
      ...(card || {}),
      knowledge_point: originalPoint || aiPoint || null,
      // 优先保留 AI 返回的 kpMarker，仅在缺失时才用数组索引回退
      kpMarker: card?.kpMarker || `__KP_${index}__`,
      // 优先保留 AI 返回的 kpIndex，仅在缺失时才用数组索引回退
      kpIndex: kpIndex,
    }
  })
}

/**
 * 生成知识点标记数组
 * @param {string[]} knowledgePoints - 知识点列表
 * @returns {string[]} 标记数组，如 ["__KP_0__", "__KP_1__", ...]
 */
export function buildKpMarkers(knowledgePoints) {
  if (!Array.isArray(knowledgePoints)) return []
  return knowledgePoints.map((_, i) => `__KP_${i}__`)
}
