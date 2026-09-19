/**
 * SM-2 艾宾浩斯遗忘曲线算法工具类
 * 基于 SM-2 (Anki 核心算法)，根据用户反馈动态调整复习间隔和难度
 *
 * 本实现简化了评分系统：用户只有 2 种反馈 —— 已掌握(成功)、待掌握(失败)
 * - 成功(quality=5)：repetitions += 1，easeFactor += 0.1，interval 按公式延长
 * - 失败(quality=0)：repetitions = 0，easeFactor = max(1.3, easeFactor - 0.2)，interval = max(1, ceil(interval * 0.5))
 *
 * interval 规则：
 * - reps == 1: interval = 1 天
 * - reps == 2: interval = 6 天
 * - reps > 2:  interval = ceil(prevInterval * easeFactor)
 */

/**
 * 应用 SM-2 算法计算下一次复习参数
 * @param {Object} record - 当前卡片状态记录（含 { easeFactor, interval, repetitions }）
 * @param {boolean} wasMastered - 用户是否标记为"已掌握"（true=成功，false=失败）
 * @returns {Object} { repetitions, interval, easeFactor, lastReviewedAt, nextReviewAt }
 */
export function applySM2(record, wasMastered) {
  const { easeFactor = 2.5, interval = 0, repetitions = 0 } = record || {}
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  if (wasMastered) {
    const nextReps = repetitions + 1
    let nextInterval
    if (nextReps === 1) nextInterval = 1
    else if (nextReps === 2) nextInterval = 6
    else nextInterval = Math.ceil(interval * easeFactor)
    const nextEase = Math.max(1.3, +(easeFactor + 0.1).toFixed(2))
    return {
      repetitions: nextReps,
      interval: nextInterval,
      easeFactor: nextEase,
      lastReviewedAt: now,
      nextReviewAt: now + nextInterval * DAY_MS,
    }
  } else {
    // 失败：重置重复计数，降低难度，间隔减半，立即可复习
    const nextEase = Math.max(1.3, +(easeFactor - 0.2).toFixed(2))
    const nextInterval = Math.max(1, Math.ceil(interval * 0.5))
    return {
      repetitions: 0,
      interval: nextInterval,
      easeFactor: nextEase,
      lastReviewedAt: now,
      nextReviewAt: now, // 立即可复习
    }
  }
}

/**
 * 从状态记录中获取下次复习时间戳（毫秒），若无记录则视为立即可复习
 */
export function getNextReviewAt(record) {
  if (!record) return Date.now()
  return record.nextReviewAt || record.updatedAt || Date.now()
}

/**
 * 筛选出到期的卡片并按到期时间排序
 * @param {Array} cards - 卡片列表
 * @param {Object} statuses - { cardId: statusRecord }
 * @returns {Array} 到期卡片，按 nextReviewAt 升序
 */
export function getCardsForReview(cards, statuses) {
  const now = Date.now()
  return cards
    .map((card) => {
      const record = statuses[card.id]
      const nextReviewAt = getNextReviewAt(record)
      return { ...card, nextReviewAt, isDue: nextReviewAt <= now }
    })
    .filter((c) => c.isDue)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
}

/**
 * 判断卡片是否到期
 */
export function isDueForReview(record) {
  return getNextReviewAt(record) <= Date.now()
}

/**
 * 计算整体统计：到期卡片数
 */
export function getReviewStats(cards, statuses) {
  const total = cards.length
  let due = 0
  let scheduled = 0
  let newCount = 0
  cards.forEach((card) => {
    const record = statuses[card.id]
    if (!record) {
      newCount++
      due++
      return
    }
    if (getNextReviewAt(record) <= Date.now()) due++
    else scheduled++
  })
  return { total, due, scheduled, new: newCount }
}

/**
 * 获取单张卡片的可读复习状态
 */
export function getReviewStatus(card, record) {
  const now = Date.now()
  const nextReviewAt = getNextReviewAt(record)
  const diff = nextReviewAt - now
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  let text = ''
  if (diff <= 0) text = '待掌握'
  else if (days > 0) text = `${days}天后复习`
  else if (hours > 0) text = `${hours}小时后复习`
  else text = '即将复习'
  return {
    card,
    record,
    nextReviewAt,
    isDue: diff <= 0,
    statusText: text,
  }
}

/**
 * 返回到期卡片数量
 */
export function getDueCount(cards, statuses) {
  const now = Date.now()
  let count = 0
  for (const card of cards) {
    if (getNextReviewAt(statuses[card.id]) <= now) count++
  }
  return count
}

/**
 * 过滤出到期卡片（保持原有顺序），并附带 nextReviewAt 信息
 */
export function filterDueCards(cards, statuses) {
  const now = Date.now()
  return cards.filter((card) => {
    const nextReviewAt = getNextReviewAt(statuses[card.id])
    return nextReviewAt <= now
  })
}

/**
 * 快速判断是否有任何到期卡片
 */
export function hasAnyDue(cards, statuses) {
  const now = Date.now()
  for (const card of cards) {
    if (getNextReviewAt(statuses[card.id]) <= now) return true
  }
  return false
}

/**
 * 计算完成统计：已掌握 / 到期 / 未开始 / 已安排但未到期
 */
export function computeStudyStats(cards, statuses) {
  const now = Date.now()
  let mastered = 0
  let due = 0
  let unstarted = 0
  let scheduled = 0

  for (const card of cards) {
    const record = statuses[card.id]
    if (!record) {
      unstarted++
      continue
    }
    const nextReviewAt = getNextReviewAt(record)
    if (nextReviewAt <= now) {
      due++
    } else {
      // 已安排但未到期：说明至少成功复习过一次 → 视为已掌握推进
      mastered++
    }
  }
  return { total: cards.length, mastered, due, unstarted, scheduled: mastered }
}

// 保留原 REVIEW_INTERVALS 兼容旧代码（普通模式下不使用）
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30]

// 保留原 calculateNextReview 兼容旧代码（实际上在 SM-2 下已不用）
export function calculateNextReview(record) {
  return getNextReviewAt(record)
}

// ============================================================
// SM-2 延迟复习惩罚算法（v2）
// 基于标准 SM-2，根据延迟程度给予不同惩罚
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 计算延迟天数
 * @param {Object|null} record - cardStatus 记录
 * @param {number} now - 当前时间戳（默认 Date.now()）
 * @returns {number} 延迟天数（可能为负值，负值表示提前）
 * 
 * 正值 = 延迟（应该复习但没复习）
 * 负值 = 提前（在计划日期之前复习）
 */
export function calculateDelayDays(record, now = Date.now()) {
  if (!record || !record.nextReviewAt) return 0
  
  const nextReviewAt = record.nextReviewAt
  const delayMs = now - nextReviewAt
  const delayDays = Math.floor(delayMs / DAY_MS)
  
  return delayDays
}

/**
 * 分类延迟等级
 * @param {number} delayDays - 延迟天数（calculateDelayDays 的返回值）
 * @param {number} interval - 当前复习间隔
 * @returns {'onTime'|'slight'|'medium'|'severe'} 延迟等级
 * 
 * - onTime: delayDays <= 0（按时或提前）
 * - slight: 0 < delayDays <= 3（轻微延迟）
 * - medium: 3 < delayDays <= interval（中等延迟）
 * - severe: delayDays > interval（严重延迟）
 */
export function classifyDelayLevel(delayDays, interval) {
  if (delayDays <= 0) return 'onTime'
  if (delayDays <= 3) return 'slight'
  if (delayDays <= interval) return 'medium'
  return 'severe'
}

/**
 * 获取延迟等级的中文名称
 */
export function getDelayLevelName(level) {
  const names = {
    onTime: '按时',
    slight: '轻微延迟',
    medium: '中等延迟',
    severe: '严重延迟',
  }
  return names[level] || level
}

/**
 * 获取延迟等级的颜色（用于 UI 显示）
 */
export function getDelayLevelColor(level) {
  const colors = {
    onTime: '#6BCB77',   // 绿色 - 按时
    slight: '#FFD93D',    // 黄色 - 轻微
    medium: '#FFA94D',    // 橙色 - 中等
    severe: '#FF4757',    // 红色 - 严重
  }
  return colors[level] || '#C0C0C0'
}

/**
 * 含延迟惩罚的 SM-2 算法（核心函数）
 * @param {Object|null} record - 当前卡片状态记录
 * @param {boolean} wasMastered - 用户是否标记为"已掌握"
 * @param {number} now - 当前时间戳（默认 Date.now()）
 * @returns {Object} {
 *   repetitions: number,
 *   interval: number,
 *   easeFactor: number,
 *   lastReviewedAt: number,
 *   nextReviewAt: number,
 *   delayLevel: string,
 *   delayDays: number
 * }
 * 
 * 惩罚规则表（成功时）：
 * | 延迟等级 | 条件 | 惩罚 |
 * |---------|------|------|
 * | onTime  | delayDays <= 0 | 正常 SM-2：reps+1，interval×ease，ease+0.1 |
 * | slight  | 0 < delay <= 3 | reps+1，但 interval = min(计算值, prev+3)，ease 不增加 |
 * | medium  | 3 < delay <= interval | reps 退1，interval 退 ceil(prev×0.6)，ease-0.1 |
 * | severe  | delay > interval | reps=1，interval=1，ease-0.15 |
 * 
 * 失败时（统一逻辑）：
 * reps=0，interval=ceil(prev×0.5)，ease=max(1.3, ease-0.2)，nextReviewAt=now
 */
export function applySM2WithDelay(record, wasMastered, now = Date.now()) {
  const { easeFactor = 2.5, interval = 1, repetitions = 0 } = record || {}
  
  // 计算延迟信息
  const delayDays = calculateDelayDays(record, now)
  const currentInterval = record?.interval ?? 1
  const delayLevel = classifyDelayLevel(delayDays, currentInterval)
  
  if (wasMastered) {
    // === 成功复习（根据延迟等级应用不同惩罚） ===
    let nextReps = repetitions + 1
    let nextInterval
    let nextEase = easeFactor
    
    switch (delayLevel) {
      case 'onTime':
        // 正常 SM-2
        if (nextReps === 1) nextInterval = 1
        else if (nextReps === 2) nextInterval = 6
        else nextInterval = Math.ceil(interval * easeFactor)
        nextEase = Math.max(1.3, +(easeFactor + 0.1).toFixed(2))
        break
        
      case 'slight':
        // 轻微延迟：reps+1，interval 受约束，ease 不增加
        if (nextReps === 1) nextInterval = 1
        else if (nextReps === 2) nextInterval = 6
        else nextInterval = Math.min(
          Math.ceil(interval * easeFactor),
          interval + 3
        )
        // easeFactor 不增加
        break
        
      case 'medium':
        // 中等延迟：reps 退1，interval 退 60%，ease-0.1
        nextReps = Math.max(1, repetitions - 1)
        nextInterval = Math.max(1, Math.ceil(interval * 0.6))
        nextEase = Math.max(1.3, +(easeFactor - 0.1).toFixed(2))
        break
        
      case 'severe':
        // 严重延迟：重新开始
        nextReps = 1
        nextInterval = 1
        nextEase = Math.max(1.3, +(easeFactor - 0.15).toFixed(2))
        break
        
      default:
        // 兜底
        nextInterval = Math.ceil(interval * easeFactor)
        nextEase = easeFactor
    }
    
    return {
      repetitions: nextReps,
      interval: nextInterval,
      easeFactor: nextEase,
      lastReviewedAt: now,
      nextReviewAt: now + nextInterval * DAY_MS,
      delayLevel,
      delayDays,
    }
  } else {
    // === 失败复习（统一逻辑，无论延迟程度） ===
    const nextEase = Math.max(1.3, +(easeFactor - 0.2).toFixed(2))
    const nextInterval = Math.max(1, Math.ceil(interval * 0.5))
    
    return {
      repetitions: 0,
      interval: nextInterval,
      easeFactor: nextEase,
      lastReviewedAt: now,
      nextReviewAt: now, // 立即可复习
      delayLevel,
      delayDays,
    }
  }
}

/**
 * 预测某卡片在延迟情况下的复习效果
 * @param {Object|null} record - 当前卡片状态
 * @param {boolean} wasMastered - 是否标记为已掌握
 * @param {number} now - 当前时间戳
 * @returns {Object} { result, delayInfo }
 *   result: applySM2WithDelay 的返回值
 *   delayInfo: { delayDays, delayLevel, levelName, levelColor }
 */
export function simulateReviewWithDelay(record, wasMastered, now = Date.now()) {
  const delayDays = calculateDelayDays(record, now)
  const currentInterval = record?.interval ?? 1
  const delayLevel = classifyDelayLevel(delayDays, currentInterval)
  
  const result = applySM2WithDelay(record, wasMastered, now)
  
  return {
    result,
    delayInfo: {
      delayDays,
      delayLevel,
      levelName: getDelayLevelName(delayLevel),
      levelColor: getDelayLevelColor(delayLevel),
    },
  }
}

/**
 * 计算卡片达到长期记忆（reps >= 5）预计需要多少天
 * @param {Object|null} record - 当前卡片状态
 * @param {number} now - 当前时间戳
 * @returns {number|null} 预计天数（如果已达成长期记忆则返回 0，无法计算返回 null）
 */
export function estimateDaysToLongTerm(record, now = Date.now()) {
  if (!record) {
    // 无记录，需要完成 reps=1~4 的累积
    // 模拟路径：1天 -> 6天 -> 16天(约) -> 44天(约)
    // 总计约 1 + 6 + 16 + 44 = 67 天
    return 67
  }
  
  const reps = record.repetitions ?? 0
  if (reps >= 5) return 0 // 已达成长期记忆
  
  // 模拟从当前状态到 reps=5 的路径
  let currentReps = reps
  let currentInterval = record.interval ?? 1
  let currentEase = record.easeFactor ?? 2.5
  let lastReviewAt = record.lastReviewedAt ?? record.nextReviewAt ?? now
  let totalDays = 0
  
  while (currentReps < 5) {
    currentReps++
    if (currentReps === 1) currentInterval = 1
    else if (currentReps === 2) currentInterval = 6
    else currentInterval = Math.ceil(currentInterval * currentEase)
    currentEase = Math.min(currentEase + 0.1, 3.0)
    
    totalDays += currentInterval
  }
  
  return totalDays
}
