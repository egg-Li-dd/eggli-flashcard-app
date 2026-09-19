const STORAGE_KEY = 'ai_call_logs_v1'
const MAX_LOGS = 200

// 调用目的中文标签
export const PURPOSE_LABELS = {
  'card-generation': '卡片生成',
  'image-ocr': '图像识别',
  'speech-cleanup': '语音整理',
  'card-classify': '分类归类',
  'connection-test': '连接测试',
  'test-question-generation': '题库生成',
}

// 模型花费估算（元 / 1000 tokens，取平均估算值）
const MODEL_COST_RULES = [
  { keywords: ['deepseek-v4', 'deepseek-v3', 'deepseek-v1', 'deepseek-chat'], costPer1K: 0.005 },
  { keywords: ['spark-lite', 'spark-pro', 'spark-max', 'spark 4.0', 'spark4.0'], costPer1K: 0.001 },
  { keywords: ['doubao-pro-32k', 'doubao-lite', 'doubao-pro', 'doubao-1.5', 'doubao'], costPer1K: 0.003 },
  { keywords: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long', 'qwen3', 'qwen-3'], costPer1K: 0.002 },
]

// 模型显示标签映射（将内部模型值 → 用户可读标签）
const MODEL_LABEL_MAP = {
  // DeepSeek
  'deepseek-v4-pro': 'DeepSeek-V4 Pro',
  'deepseek-v4-flash': 'DeepSeek-V4 Flash',
  'deepseek-v4': 'DeepSeek-V4',
  'deepseek-chat': 'DeepSeek-V4 Pro',
  'deepseek-reasoner': 'DeepSeek-V4 Flash',
  'deepseek': 'DeepSeek',
  // 讯飞星火
  'lite': 'Spark Lite',
  'spark-lite': 'Spark Lite',
  'generalv3': 'Spark Pro',
  'spark-pro': 'Spark Pro',
  'pro-128k': 'Spark Pro-128K',
  'generalv3.5': 'Spark Max',
  'spark-max': 'Spark Max',
  'max-32k': 'Spark Max-32K',
  '4.0Ultra': 'Spark 4.0 Ultra',
  // 火山引擎豆包
  'doubao-pro-32k': '豆包 Pro-32K',
  'doubao-pro-4k': '豆包 Pro-4K',
  'doubao-lite-32k': '豆包 Lite-32K',
  'doubao-lite-4k': '豆包 Lite-4K',
  // 阿里云千问
  'qwen3.5-plus-2026-04-20': 'Qwen 3.5 Plus',
  'qwen3.6-max-preview': 'Qwen 3.6 Max 预览',
  'qwen3.7-max': 'Qwen 3.7 Max',
  'qwen3.7-max-2026-05-20': 'Qwen 3.7 Max',
  'qwen3.7-plus-2026-05-26': 'Qwen 3.7 Plus',
  'qwen3.6-flash': 'Qwen 3.6 Flash',
  'qwen3.6-plus-2026-04-20': 'Qwen 3.6 Plus',
  'qwen3.6-27b': 'Qwen 3.6 27B',
  'qwen-turbo': 'Qwen Turbo',
  'qwen-plus': 'Qwen Plus',
  'qwen-max': 'Qwen Max',
  'qwen-long': 'Qwen Long',
  'kimi-k2.6': 'Kimi K2.6',
  'gui-plus-2026-02-26': 'GUI Plus',
}

// 根据 aiServiceMode + model 生成规范的模型名（写入日志）
export function resolveModelName(aiServiceMode, model, config = {}) {
  // 优先使用各平台专属模型配置（比通用的 model 更准确）
  if (aiServiceMode === 'iflytek-spark') return config.sparkModel || model || 'spark-lite'
  if (aiServiceMode === 'volcano') return config.volcanoModel || model || 'doubao-pro-32k'
  if (aiServiceMode === 'dashscope') return config.dashscopeModel || model || 'qwen3.5-plus-2026-04-20'
  return model || 'deepseek-v4-pro'
}

// 将模型名映射到显示标签
export function getModelLabel(modelName) {
  const key = String(modelName || '')
  if (MODEL_LABEL_MAP[key]) return MODEL_LABEL_MAP[key]
  // 尝试模糊匹配
  const lower = key.toLowerCase()
  for (const k of Object.keys(MODEL_LABEL_MAP)) {
    if (lower.includes(k.toLowerCase())) return MODEL_LABEL_MAP[k]
  }
  return String(modelName || '未知模型')
}

// 从日志中提取所有唯一的模型名（按出现时间倒序）
export function getUniqueModelNames(logs) {
  const list = Array.isArray(logs) ? logs : getAiCallLogs()
  const seen = new Set()
  const result = []
  for (const log of list) {
    const name = String(log?.modelName || 'unknown')
    if (!seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}

// 按模型筛选日志
export function filterLogsByModel(logs, modelName) {
  if (!modelName) return logs
  const list = Array.isArray(logs) ? logs : getAiCallLogs()
  return list.filter(log => String(log?.modelName || 'unknown') === modelName)
}

// 按模型计算统计
export function getStatsByModel(logs, modelName) {
  const filtered = filterLogsByModel(logs, modelName)
  let success = 0
  let totalCost = 0
  for (const log of filtered) {
    if (log.status === 'success') success++
    totalCost += Number(log.cost) || 0
  }
  return {
    total: filtered.length,
    success,
    failed: filtered.length - success,
    totalCost: Number(totalCost.toFixed(4)),
  }
}

const DEFAULT_COST_PER_1K = 0.005

export function estimateCost(modelName, tokens) {
  const safeName = String(modelName || '').toLowerCase()
  const safeTokens = Number(tokens) || 0
  for (const rule of MODEL_COST_RULES) {
    for (const kw of rule.keywords) {
      if (safeName.includes(kw)) {
        return Number((safeTokens / 1000) * rule.costPer1K)
      }
    }
  }
  return Number((safeTokens / 1000) * DEFAULT_COST_PER_1K)
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'log-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

function safeParse(raw) {
  try {
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(x => x && typeof x === 'object')
  } catch (_) {
    return []
  }
}

export function getAiCallLogs() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return safeParse(raw)
  } catch (_) {
    return []
  }
}

export function logAiCall(entry) {
  try {
    const existing = getAiCallLogs()
    const now = Date.now()
    const tokens = Number(entry?.tokens) || 0
    const modelName = String(entry?.modelName || 'unknown')
    const newEntry = {
      id: generateId(),
      purpose: String(entry?.purpose || 'unknown'),
      modelName,
      tokens,
      cost: entry?.cost != null ? Number(entry.cost) : estimateCost(modelName, tokens),
      timestamp: now,
      durationMs: Number(entry?.durationMs) || 0,
      status: entry?.status === 'error' ? 'error' : 'success',
      errorMessage: entry?.errorMessage ? String(entry.errorMessage) : '',
      prompt: entry?.prompt ? String(entry.prompt) : '',
      response: entry?.response ? String(entry.response) : '',
    }
    const updated = [newEntry, ...existing].slice(0, MAX_LOGS)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    }
    return newEntry
  } catch (_) {
    return null
  }
}

export function clearAiCallLogs() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
    return true
  } catch (_) {
    return false
  }
}

export function getAiCallStats() {
  const logs = getAiCallLogs()
  const total = logs.length
  let success = 0
  let totalCost = 0
  for (const log of logs) {
    if (log.status === 'success') success++
    totalCost += Number(log.cost) || 0
  }
  return {
    total,
    success,
    failed: total - success,
    totalCost: Number(totalCost.toFixed(4)),
  }
}

export function getPurposeLabel(purpose) {
  return PURPOSE_LABELS[purpose] || String(purpose || '未知')
}

export function formatTimestamp(ts) {
  try {
    const d = new Date(Number(ts) || 0)
    const pad = (n) => String(n).padStart(2, '0')
    return (
      d.getFullYear() +
      '-' + pad(d.getMonth() + 1) +
      '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) +
      ':' + pad(d.getMinutes()) +
      ':' + pad(d.getSeconds())
    )
  } catch (_) {
    return String(ts)
  }
}

export function formatCost(cost) {
  const c = Number(cost) || 0
  if (c === 0) return '0 元'
  if (c < 0.01) return c.toFixed(4) + ' 元'
  if (c < 1) return c.toFixed(3) + ' 元'
  return c.toFixed(2) + ' 元'
}
