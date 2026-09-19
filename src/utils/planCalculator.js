// ============================================================
// 背诵计划计算工具函数（纯函数，便于 useMemo 优化）
// ============================================================

/**
 * 获取卡片当前所在的记忆阶段
 * @param {Object|null} record - cardStatus 记录
 * @param {number} now - 当前时间戳（默认 Date.now()）
 * @returns {'due'|'short'|'medium'|'long'|'unstarted'|'regressed'} 阶段名称
 * 
 * 阶段定义：
 * - due: 到期复习（nextReviewAt <= now）
 * - short: 短期记忆（reps=1或2，且未到期）
 * - medium: 中期记忆（reps=3或4，且未到期）
 * - long: 长期记忆（reps>=5，且未到期）
 * - unstarted: 未学习（无记录）
 * - regressed: 失败回退（reps=0）
 */
export function getMemoryStage(record, now = Date.now()) {
  if (!record) return 'unstarted'
  
  const reps = record.repetitions ?? 0
  const nextReviewAt = record.nextReviewAt ?? 0
  
  if (reps === 0) return 'regressed'
  if (nextReviewAt <= now) return 'due'
  if (reps >= 5) return 'long'
  if (reps >= 3) return 'medium'
  return 'short'
}

/**
 * 计算某分类下所有卡片的阶段分布
 * @param {Array} cards - 卡片数组
 * @param {Map|Object} statuses - cardId -> cardStatus 记录的 Map 或普通对象
 * @param {number} now - 当前时间戳
 * @returns {{ due, short, medium, long, unstarted, regressed, total }} 各阶段卡片数
 */
export function computeCategoryStageDistribution(cards, statuses, now = Date.now()) {
  const result = {
    due: 0,
    short: 0,
    medium: 0,
    long: 0,
    unstarted: 0,
    regressed: 0,
    total: cards.length,
  }
  
  // 统一转换为 Map
  const statusMap = statuses instanceof Map ? statuses : new Map(Object.entries(statuses))
  
  for (const card of cards) {
    const status = statusMap.get(card.id)
    const stage = getMemoryStage(status, now)
    result[stage]++
  }
  
  return result
}

/**
 * 按分类计算阶段分布
 * @param {Array} categories - 分类数组
 * @param {Map} cardsByCategory - categoryId -> cards[] 的 Map
 * @param {Map} statusesByCard - cardId -> cardStatus 的 Map
 * @param {number} now - 当前时间戳
 * @returns {Map} categoryId -> stageCountObject
 */
export function computeStageDistributionByCategory(categories, cardsByCategory, statusesByCard, now = Date.now()) {
  const result = new Map()
  
  for (const category of categories) {
    const cards = cardsByCategory.get(category.id) || []
    const distribution = computeCategoryStageDistribution(cards, statusesByCard, now)
    result.set(category.id, {
      ...distribution,
      categoryId: category.id,
      categoryName: category.name,
    })
  }
  
  return result
}

/**
 * 预测未来 N 天每天到期的卡片数量
 * @param {Array} cards - 卡片数组
 * @param {Map} statusesByCard - cardId -> cardStatus 的 Map
 * @param {number} daysAhead - 预测天数
 * @param {number} now - 当前时间戳（默认 Date.now()）
 * @returns {Array<{ date: string, count: number, dayIndex: number }>}
 * 
 * date 格式为 'YYYY-MM-DD'，dayIndex=0 是今天，1 是明天...
 */
export function predictFutureDueCards(cards, statusesByCard, daysAhead = 7, now = Date.now()) {
  const result = []
  
  // 计算今天的开始时间（00:00:00）
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayStartMs = todayStart.getTime()
  
  for (let i = 0; i < daysAhead; i++) {
    const dayStart = todayStartMs + i * 24 * 60 * 60 * 1000
    const dayEnd = dayStart + 24 * 60 * 60 * 1000
    
    let count = 0
    for (const card of cards) {
      const status = statusesByCard.get(card.id)
      // 无记录视为今天到期（新卡片）
      const nextReviewAt = status?.nextReviewAt ?? dayStart
      if (nextReviewAt >= dayStart && nextReviewAt < dayEnd) {
        count++
      }
    }
    
    const date = new Date(dayStart)
    const dateStr = date.toISOString().split('T')[0] // 'YYYY-MM-DD'
    
    result.push({ date: dateStr, count, dayIndex: i })
  }
  
  return result
}

/**
 * 预测某张卡片未来 N 次复习的日期（假设全部成功）
 * 基于 SM-2 规则模拟：每次成功复习，reps+1，easeFactor+0.1，interval = prevInterval * easeFactor
 * @param {Object|null} record - cardStatus 记录（当前状态）
 * @param {number} numFutureReviews - 预测次数
 * @param {number} now - 当前时间戳
 * @returns {Array<{ reviewIndex: number, date: string, reps: number, interval: number, easeFactor: number }>}
 */
export function predictFutureReviewSchedule(record, numFutureReviews = 5, now = Date.now()) {
  if (!record) {
    // 无记录时，模拟首次学习的复习路径
    return simulateFirstLearning(numFutureReviews, now)
  }
  
  let reps = record.repetitions ?? 0
  let interval = record.interval ?? 1
  let easeFactor = record.easeFactor ?? 2.5
  let lastReviewAt = record.lastReviewedAt ?? record.nextReviewAt ?? now
  
  const result = []
  
  for (let i = 1; i <= numFutureReviews; i++) {
    // SM-2 公式：成功复习
    reps = reps + 1
    const newInterval = Math.ceil(interval * easeFactor)
    easeFactor = Math.min(easeFactor + 0.1, 3.0) // 上限 3.0
    interval = newInterval
    
    // 计算下次复习时间
    const nextReviewAt = lastReviewAt + interval * 24 * 60 * 60 * 1000
    const dateStr = new Date(nextReviewAt).toISOString().split('T')[0]
    
    result.push({
      reviewIndex: i,
      date: dateStr,
      reps,
      interval,
      easeFactor: parseFloat(easeFactor.toFixed(2)),
    })
    
    lastReviewAt = nextReviewAt
  }
  
  return result
}

/**
 * 模拟首次学习的复习路径（假设新卡片今天开始学习）
 */
function simulateFirstLearning(numFutureReviews, now) {
  let reps = 0
  let interval = 1
  let easeFactor = 2.5
  let lastReviewAt = now
  
  const result = []
  
  for (let i = 1; i <= numFutureReviews; i++) {
    reps = reps + 1
    const newInterval = Math.ceil(interval * easeFactor)
    easeFactor = Math.min(easeFactor + 0.1, 3.0)
    interval = newInterval
    
    const nextReviewAt = lastReviewAt + interval * 24 * 60 * 60 * 1000
    const dateStr = new Date(nextReviewAt).toISOString().split('T')[0]
    
    result.push({
      reviewIndex: i,
      date: dateStr,
      reps,
      interval,
      easeFactor: parseFloat(easeFactor.toFixed(2)),
    })
    
    lastReviewAt = nextReviewAt
  }
  
  return result
}

/**
 * 获取阶段的中文名称
 */
export function getStageName(stage) {
  const names = {
    due: '到期复习',
    short: '短期记忆',
    medium: '中期记忆',
    long: '长期记忆',
    unstarted: '未学习',
    regressed: '失败回退',
  }
  return names[stage] || stage
}

/**
 * 获取阶段的颜色（用于 UI 显示）
 */
export function getStageColor(stage) {
  const colors = {
    due: '#FF6B6B',       // 红色 - 紧急
    short: '#FFA94D',     // 橙色 - 短期
    medium: '#FFD93D',    // 黄色 - 中期
    long: '#6BCB77',      // 绿色 - 长期
    unstarted: '#C0C0C0', // 灰色 - 未学习
    regressed: '#FF4757', // 深红 - 失败
  }
  return colors[stage] || '#C0C0C0'
}

/**
 * 计算某分类的完成进度
 * @param {Array} cards - 分类下的卡片数组
 * @param {Map} statusesByCard - cardId -> cardStatus 的 Map
 * @param {number} now - 当前时间戳
 * @returns {{ masteredCount: number, totalCount: number, progressPercent: number }}
 */
export function computeCategoryProgress(cards, statusesByCard, now = Date.now()) {
  let masteredCount = 0
  
  for (const card of cards) {
    const status = statusesByCard.get(card.id)
    const stage = getMemoryStage(status, now)
    // 中期和长期记忆视为"已掌握"
    if (stage === 'medium' || stage === 'long') {
      masteredCount++
    }
  }
  
  const totalCount = cards.length
  const progressPercent = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0
  
  return { masteredCount, totalCount, progressPercent }
}

/**
 * 计算每日完成的工作量（用于估算完成时间）
 * @param {Array} reviewHistoryRecords - 复习历史记录数组
 * @param {number} days - 统计天数
 * @returns {number} 平均每日完成数量
 */
export function computeAverageDailyWorkload(reviewHistoryRecords, days = 7) {
  if (!reviewHistoryRecords || reviewHistoryRecords.length === 0) return 0
  
  const now = Date.now()
  const startTime = now - days * 24 * 60 * 60 * 1000
  
  // 按天分组
  const dailyCounts = {}
  for (const record of reviewHistoryRecords) {
    if (record.reviewedAt < startTime) continue
    const date = new Date(record.reviewedAt).toISOString().split('T')[0]
    dailyCounts[date] = (dailyCounts[date] || 0) + 1
  }
  
  const daysWithRecords = Object.keys(dailyCounts).length
  if (daysWithRecords === 0) return 0
  
  const totalRecords = reviewHistoryRecords.filter(r => r.reviewedAt >= startTime).length
  return Math.round(totalRecords / daysWithRecords)
}

/**
 * 估算完成所有卡片需要的天数
 * @param {number} remainingCards - 剩余卡片数
 * @param {number} dailyCapacity - 每日处理能力（默认 50）
 * @returns {number} 预计天数
 */
export function estimateCompletionDays(remainingCards, dailyCapacity = 50) {
  if (remainingCards <= 0) return 0
  return Math.ceil(remainingCards / dailyCapacity)
}

/**
 * 获取最难卡片（失败次数最多的卡片）
 * @param {Array} cards - 卡片数组
 * @param {Array} reviewHistory - 复习历史记录数组
 * @param {number} topN - 返回前 N 张，默认为 5
 * @returns {Array} { card, failCount, easeFactor } 按失败次数降序排列
 */
export function getHardestCards(cards, reviewHistory, topN = 5) {
  if (!cards || cards.length === 0) return []
  if (!reviewHistory || reviewHistory.length === 0) return []
  
  // 统计每张卡片的失败次数
  const failCountMap = {}
  for (const record of reviewHistory) {
    if (!record.wasMastered) { // wasMastered=false 表示失败
      if (!failCountMap[record.cardId]) {
        failCountMap[record.cardId] = 0
      }
      failCountMap[record.cardId]++
    }
  }
  
  // 找到失败的卡片
  const failedCardIds = Object.keys(failCountMap)
  const failedCards = cards.filter(c => failedCardIds.includes(c.id))
  
  // 构建结果并排序
  const result = failedCards.map(card => {
    const cardHistory = reviewHistory.filter(r => r.cardId === card.id)
    // 找到这条记录关联的 cardStatus（取最后一次的 easeFactor）
    const easeFactor = cardHistory.length > 0 ? card.easeFactor || 2.5 : 2.5
    return {
      card,
      failCount: failCountMap[card.id] || 0,
      easeFactor,
    }
  })
  
  // 按失败次数降序排列
  result.sort((a, b) => b.failCount - a.failCount)
  
  return result.slice(0, topN)
}

/**
 * 计算每日学习活动统计
 * @param {Array} reviewHistory - 复习历史记录数组
 * @param {number} daysBack - 统计天数，默认 7
 * @param {number} now - 当前时间戳，默认 Date.now()
 * @returns {Array<{ date: string, mastered: number, failed: number }>} 每日统计，按日期升序
 */
export function computeDailyActivityStats(reviewHistory, daysBack = 7, now = Date.now()) {
  if (!reviewHistory || reviewHistory.length === 0) {
    // 返回空白数据
    const result = []
    for (let i = daysBack - 1; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000)
      result.push({
        date: date.toISOString().split('T')[0],
        mastered: 0,
        failed: 0,
      })
    }
    return result
  }
  
  // 过滤出最近 daysBack 天的记录
  const startTime = now - daysBack * 24 * 60 * 60 * 1000
  const recentRecords = reviewHistory.filter(r => r.reviewedAt >= startTime)
  
  // 按日期分组统计
  const statsMap = {}
  
  // 初始化所有日期
  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000)
    const dateStr = date.toISOString().split('T')[0]
    statsMap[dateStr] = { date: dateStr, mastered: 0, failed: 0 }
  }
  
  // 统计
  for (const record of recentRecords) {
    const dateStr = new Date(record.reviewedAt).toISOString().split('T')[0]
    if (statsMap[dateStr]) {
      if (record.wasMastered) {
        statsMap[dateStr].mastered++
      } else {
        statsMap[dateStr].failed++
      }
    }
  }
  
  // 转为数组并按日期升序
  return Object.values(statsMap).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 估算复习所需时间
 * @param {number} cardCount - 卡片数量
 * @param {string} modeKey - 模式键：'ebbinghaus'/'weak'/'sequential'/'active'
 * @returns {string} 估算时间字符串，如 "约 6 分钟" 或 "不到 1 分钟"
 */
export function estimateMinutes(cardCount, modeKey = 'ebbinghaus') {
  if (cardCount <= 0) return '不到 1 分钟'
  
  const secondsPerCard = {
    ebbinghaus: 6,
    weak: 6,
    sequential: 4,
    active: 4,
  }
  
  const seconds = cardCount * (secondsPerCard[modeKey] || 6)
  
  if (seconds < 60) {
    return '不到 1 分钟'
  }
  
  const minutes = Math.ceil(seconds / 60)
  return `约 ${minutes} 分钟`
}

/**
 * 格式化日期为中文格式
 * @param {Date|number|string} date - 日期对象、时间戳或 ISO 字符串
 * @returns {string} 格式如 "2026 年 6 月 16 日，星期二"
 */
export function formatDateCN(date) {
  const d = date instanceof Date ? date : new Date(date)
  
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const weekday = weekdays[d.getDay()]
  
  return `${year} 年 ${month} 月 ${day} 日，${weekday}`
}

/**
 * 预测达到特定掌握水平需要的天数
 * @param {Array} cards - 卡片数组
 * @param {Map} statusesByCard - cardId -> cardStatus 映射
 * @param {Array} reviewHistory - 复习历史记录数组
 * @param {number} now - 当前时间戳，默认 Date.now()
 * @returns {{ mediumDays: number|null, longDays: number|null, learningSpeed: number, successRate: number }}
 *   mediumDays: 90% 卡片达到中期记忆（reps>=3）预计天数
 *   longDays: 90% 卡片达到长期记忆（reps>=5）预计天数
 *   learningSpeed: 近7天平均每天成功复习数
 *   successRate: 学习成功率（成功/总数）
 */
export function predictMasteryTimeline(cards, statusesByCard, reviewHistory, now = Date.now()) {
  if (!cards || cards.length === 0) {
    return {
      mediumDays: null,
      longDays: null,
      learningSpeed: 0,
      successRate: 0,
    }
  }
  
  // 计算当前处于各阶段的卡片数量
  let mediumCount = 0 // reps >= 3
  let longCount = 0    // reps >= 5
  let needMedium = 0   // reps < 3 的卡片数
  let needLong = 0    // reps < 5 的卡片数
  
  for (const card of cards) {
    const status = statusesByCard.get(card.id)
    const reps = status?.repetitions || 0
    
    if (reps >= 5) {
      longCount++
    } else {
      needLong++
    }
    
    if (reps >= 3) {
      mediumCount++
    } else {
      needMedium++
    }
  }
  
  // 计算学习速度（近7天平均每天成功复习数）
  const recentStats = computeDailyActivityStats(reviewHistory, 7, now)
  let totalSuccess = 0
  let totalFailed = 0
  for (const stat of recentStats) {
    totalSuccess += stat.mastered
    totalFailed += stat.failed
  }
  const daysWithRecords = recentStats.filter(s => s.mastered > 0 || s.failed > 0).length
  const learningSpeed = daysWithRecords > 0 ? Math.round(totalSuccess / daysWithRecords) : 0
  
  // 计算成功率
  const total = totalSuccess + totalFailed
  const successRate = total > 0 ? Math.round((totalSuccess / total) * 100) : 0
  
  // 估算天数（简化算法）
  // 如果 learningSpeed = 0，使用默认值 10 张/天（假设）
  const effectiveSpeed = learningSpeed > 0 ? learningSpeed : 10
  const totalCards = cards.length
  
  // 估算达到 90% 中期记忆
  const mediumTarget = Math.ceil(totalCards * 0.9) - mediumCount
  const mediumDays = mediumTarget > 0 ? Math.ceil(mediumTarget / effectiveSpeed) : 0
  
  // 估算达到 90% 长期记忆
  const longTarget = Math.ceil(totalCards * 0.9) - longCount
  const longDays = longTarget > 0 ? Math.ceil(longTarget / effectiveSpeed) : 0
  
  return {
    mediumDays: mediumDays > 0 ? mediumDays : null,
    longDays: longDays > 0 ? longDays : null,
    learningSpeed,
    successRate,
  }
}
