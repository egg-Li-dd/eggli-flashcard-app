import {
  IFLYTEK_SPARK_API_URL,
  CARD_GENERATION_PROMPT,
  CARD_GENERATION_PROMPT_BY_LEVEL,
  OCR_PROMPT,
  SPEECH_CLEANUP_SYSTEM_PROMPT,
  buildRegenerateCardPrompt,
} from '../utils/constants'
import { parseAIResponse, tryParseJSON } from '../utils/helpers'
import { httpPost } from '../utils/httpClient'
import { normalizeSparkApiPassword } from '../utils/sparkAuth'

// 浏览器 dev 模式通过 Vite 代理绕过 CORS；生产环境直连
const SPARK_API_URL = import.meta.env.DEV
  ? '/api/spark/v1/chat/completions'
  : IFLYTEK_SPARK_API_URL

function parseSparkError(json, defaultMsg) {
  if (!json || typeof json !== 'object') return defaultMsg
  if (json.error) {
    if (typeof json.error === 'string') return json.error
    if (json.error.message) return json.error.message
    if (json.error.code) return '错误码: ' + json.error.code
  }
  if (json.code && json.code !== 0) {
    const msg = json.message || json.msg || '错误码: ' + json.code
    return msg
  }
  if (json.message) return json.message
  if (json.msg) return json.msg
  return defaultMsg
}

function buildSparkRequest(apiPassword, body, timeout = 15000) {
  const password = normalizeSparkApiPassword(apiPassword)
  const authorization = password ? 'Bearer ' + password : ''

  return httpPost(SPARK_API_URL, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization,
    },
    data: body,
    timeout: timeout,
  })
}

export async function cleanUpSpeechTextWithSpark(rawText, apiPassword, _apiSecret, model) {
  try {
    const response = await buildSparkRequest(apiPassword, {
      model: model || 'lite',
      messages: [
        { role: 'system', content: SPEECH_CLEANUP_SYSTEM_PROMPT },
        { role: 'user', content: rawText },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    }, 15000)

    if (!response.ok) {
      const msg = parseSparkError(response.data, '语音整理失败 (' + response.status + ')')
      console.error('[spark-cleanup] HTTP 错误:', response.status, msg)
      throw new Error('讯飞星火: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content?.trim()
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) return { content: rawText, tokens }
    return { content, tokens }
  } catch (err) {
    console.error('[spark-cleanup] 调用失败:', err?.message)
    throw new Error('讯飞星火调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function generateCardsWithSpark(text, apiPassword, _apiSecret, model, summaryLevel) {
  const prompt = (summaryLevel && CARD_GENERATION_PROMPT_BY_LEVEL[summaryLevel]) || CARD_GENERATION_PROMPT
  const MAX_TEXT_LENGTH = 3000

  if (!text || typeof text !== 'string') {
    return { content: JSON.stringify({ units: [] }), tokens: 0 }
  }

  if (text.length <= MAX_TEXT_LENGTH) {
    try {
      const response = await buildSparkRequest(apiPassword, {
        model: model || 'lite',
        messages: [{ role: 'user', content: prompt + '\n\n' + text }],
        temperature: 0.7,
        max_tokens: 4096,
      }, 30000)

      if (!response.ok) {
        const msg = parseSparkError(response.data, '请求失败 (' + response.status + ')')
        console.error('[spark-generate] HTTP 错误:', response.status, msg)
        throw new Error('讯飞星火: ' + msg)
      }

      const content = response.data?.choices?.[0]?.message?.content
      const tokens = response.data?.usage?.total_tokens || 0
      if (!content) {
        throw new Error('讯飞星火未返回有效内容')
      }
      return { content, tokens }
    } catch (err) {
      console.error('[spark-generate] 调用失败:', err?.message)
      throw new Error('讯飞星火调用失败: ' + (err?.message || '未知错误'))
    }
  }

  const chunks = _splitTextIntoChunks(text, MAX_TEXT_LENGTH)
  const allResults = []
  let totalTokens = 0

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]
    try {
      const response = await buildSparkRequest(apiPassword, {
        model: model || 'lite',
        messages: [{ role: 'user', content: prompt + '\n\n待处理内容（第' + (chunkIndex + 1) + '/' + chunks.length + '部分）：\n' + chunk }],
        temperature: 0.7,
        max_tokens: 4096,
      }, 30000)

      if (!response.ok) {
        const msg = parseSparkError(response.data, '请求失败 (' + response.status + ')')
        console.error('[spark-generate] HTTP 错误:', response.status, msg)
        throw new Error('讯飞星火: ' + msg)
      }

      const content = response.data?.choices?.[0]?.message?.content
      const tokens = response.data?.usage?.total_tokens || 0
      if (!content) {
        throw new Error('讯飞星火未返回有效内容')
      }
      totalTokens += tokens
      allResults.push({ content, offset: 0 })
    } catch (err) {
      console.error('[spark-generate] 调用失败:', err?.message)
      throw new Error('讯飞星火调用失败: ' + (err?.message || '未知错误'))
    }
  }

  const mergedContent = _mergeSparkCardResults(allResults)
  return { content: mergedContent, tokens: totalTokens }
}

function _splitTextIntoChunks(text, maxLength) {
  const chunks = []
  let current = ''
  const paragraphs = text.split(/[\n\r]+/)

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue
    if (current.length + paragraph.length + 2 <= maxLength) {
      current += (current ? '\n\n' : '') + paragraph
    } else {
      if (current) chunks.push(current)
      if (paragraph.length > maxLength) {
        let start = 0
        while (start < paragraph.length) {
          const end = Math.min(start + maxLength, paragraph.length)
          chunks.push(paragraph.slice(start, end))
          start = end
        }
      } else {
        current = paragraph
      }
    }
  }

  if (current) chunks.push(current)
  return chunks
}

/**
 * 从损坏的 JSON 中提取卡片对象（降级策略）
 * 用于处理弱模型返回的不完整 JSON
 */
function _extractCardsFromBrokenJson(text) {
  const cards = []
  // 使用正则匹配卡片对象模式 {"front":"...", "back":"...", ...}
  const cardPattern = /\{\s*"front"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*,\s*"back"\s*:\s*"([^"]*(?:\\.[^"]*)*)"[^}]*\}/g
  let match
  while ((match = cardPattern.exec(text)) !== null) {
    try {
      // 尝试解析单个卡片对象
      const cardJson = JSON.parse(match[0])
      if (cardJson.front && cardJson.back) {
        cards.push(cardJson)
      }
    } catch (e) {
      // 单个卡片也解析失败，使用正则提取的值
      cards.push({
        front: match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
        back: match[2].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
      })
    }
  }
  return { units: [{ name: '降级提取-卡片组', cards }] }
}

function _mergeSparkCardResults(batchResults) {
  const allUnits = []
  let unitIndex = 0

  for (const batchItem of batchResults) {
    const result = batchItem?.content
    const offset = batchItem?.offset || 0
    if (!result) continue

    try {
      // 尝试移除 markdown 代码块（弱模型常返回 ```json ... ``` 格式）
      let cleanedResult = result
      const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        cleanedResult = codeBlockMatch[1].trim()
      }
      
      // 【增强】尝试多种 JSON 解析策略
      let json = null
      const parseStrategies = [
        // 策略1：直接解析
        () => JSON.parse(cleanedResult),
        // 策略2：找到 JSON 对象边界（第一个 { 到最后一个 }）
        () => {
          const firstBrace = cleanedResult.indexOf('{')
          const lastBrace = cleanedResult.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            return JSON.parse(cleanedResult.slice(firstBrace, lastBrace + 1))
          }
          return null
        },
        // 策略3：移除尾部逗号（常见错误）
        () => {
          const fixed = cleanedResult.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
          return JSON.parse(fixed)
        },
        // 策略4：组合策略2+3
        () => {
          const firstBrace = cleanedResult.indexOf('{')
          const lastBrace = cleanedResult.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            const sliced = cleanedResult.slice(firstBrace, lastBrace + 1)
            const fixed = sliced.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
            return JSON.parse(fixed)
          }
          return null
        },
      ]
      
      for (let i = 0; i < parseStrategies.length && !json; i++) {
        try {
          json = parseStrategies[i]()
        } catch (e) {
          if (i === parseStrategies.length - 1) {
            console.warn(`[mergeSparkCardResults] All parse strategies failed for batch offset=${offset}, error:`, e.message)
            // 【降级】尝试逐个提取卡片对象
            json = _extractCardsFromBrokenJson(cleanedResult)
          }
        }
      }
      if (json.units && Array.isArray(json.units)) {
        for (const unit of json.units) {
          if (!unit || typeof unit !== 'object') continue
          // 过滤空卡片 + 修复 kpMarker 全局化
          const fixedCards = Array.isArray(unit.cards) ? unit.cards.map(card => {
            if (!card || typeof card !== 'object') return null
            if (!card.front || !card.back) return null
            if (card.kpMarker && typeof card.kpMarker === 'string') {
              const match = card.kpMarker.match(/__KP_(\d+)__/)
              if (match) {
                const localIdx = parseInt(match[1], 10)
                const globalIdx = offset + localIdx
                return { ...card, kpMarker: `__KP_${globalIdx}__` }
              }
            }
            return card
          }).filter(Boolean) : []

          if (fixedCards.length === 0) continue

          allUnits.push({
            ...unit,
            name: `第${unitIndex + 1}批-${unit.name || '未命名单元'}`,
            cards: fixedCards,
          })
          unitIndex++
        }
      } else if (json.cards && Array.isArray(json.cards)) {
        const fixedCards = json.cards.map(card => {
          if (!card || typeof card !== 'object') return null
          if (!card.front || !card.back) return null
          if (card.kpMarker && typeof card.kpMarker === 'string') {
            const match = card.kpMarker.match(/__KP_(\d+)__/)
            if (match) {
              const localIdx = parseInt(match[1], 10)
              const globalIdx = offset + localIdx
              return { ...card, kpMarker: `__KP_${globalIdx}__` }
            }
          }
          return card
        }).filter(Boolean)

        if (fixedCards.length === 0) continue

        allUnits.push({
          name: `第${unitIndex + 1}批-新生成`,
          cards: fixedCards,
        })
        unitIndex++
      }
    } catch (e) {
      console.warn('[mergeSparkCardResults] Failed to parse batch result:', e.message)
    }
  }

  return JSON.stringify({ units: allUnits })
}

export async function extractTextFromImageWithSpark(base64Image, apiPassword, _apiSecret, model) {
  try {
    const response = await buildSparkRequest(apiPassword, {
      model: model || 'lite',
      messages: [
        {
          role: 'user',
          content: OCR_PROMPT + '\n\n' + 'data:image/jpeg;base64,' + base64Image,
        },
      ],
      max_tokens: 4096,
    }, 30000)

    if (!response.ok) {
      const msg = parseSparkError(response.data, '图片识别失败 (' + response.status + ')')
      console.error('[spark-ocr] HTTP 错误:', response.status, msg)
      throw new Error('讯飞星火: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) {
      throw new Error('讯飞星火未识别到图片中的文字')
    }
    return { content, tokens }
  } catch (err) {
    console.error('[spark-ocr] 调用失败:', err?.message)
    throw new Error('讯飞星火调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function testSparkConnection(apiPassword, _apiSecret, model) {
  try {
    const password = normalizeSparkApiPassword(apiPassword)

    if (!password) {
      return {
        ok: false,
        type: 'missing_credentials',
        message: '请先填写讯飞星火的 APIPassword',
        detail: '前往控制台（xinghuo.xfyun.cn/sparkapi）→ 选择模型 → 获取接口认证信息中的 APIPassword。',
      }
    }

    const testModel = (model && model.trim()) || 'lite'

    let response
    try {
      response = await httpPost(SPARK_API_URL, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + password,
        },
        data: {
          model: testModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        },
        timeout: 15000,
      })
    } catch (err) {
      console.error('[spark-test] 网络层异常 - 原始错误:', JSON.stringify(err).slice(0, 500))
      console.error('[spark-test] 异常 message:', err?.message)
      return {
        ok: false,
        type: 'network_error',
        status: err?.status || 0,
        message: '网络请求失败',
        detail: '无法连接到讯飞星火服务器（' + (err?.message || '') + '），请检查网络设置、APIPassword 是否正确，或在浏览器中直接测试: curl -X POST ' + IFLYTEK_SPARK_API_URL + ' -H "Authorization: Bearer <APIPassword>" -H "Content-Type: application/json" -d \'{"model":"lite","messages":[{"role":"user","content":"Hi"}]}\'',
      }
    }

    const dataStr = typeof response.data === 'string'
      ? response.data.slice(0, 300)
      : JSON.stringify(response.data).slice(0, 300)

    if (response.ok) {
      if (response.data && response.data.code === 0) {
        return {
          ok: true,
          type: 'success',
          message: '连接成功！模型: ' + testModel + ' 已正常工作',
          tokens: response.data?.usage?.total_tokens || 0,
        }
      }
      const msg = parseSparkError(response.data, '服务器返回错误')
      return {
        ok: false,
        type: 'api_error',
        status: response.status,
        message: msg,
        detail: typeof response.data === 'string' ? response.data : JSON.stringify(response.data || ''),
      }
    }

    // 根据 HTTP 状态码提供详细错误信息
    const status = response.status
    const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '')

    if (status === 401) {
      return {
        ok: false,
        type: 'auth_error',
        status: 401,
        message: '凭证无效（401）',
        detail: '请确认：1) 填入的 APIPassword 是否正确；2) 是否已在讯飞星火控制台开通对应模型的免费包。服务器返回: ' + rawData.slice(0, 100),
      }
    }
    if (status === 403) {
      return {
        ok: false,
        type: 'forbidden',
        status: 403,
        message: '权限不足（403）',
        detail: '当前凭证未开通该模型权限，或账号已被封禁。服务器返回: ' + rawData.slice(0, 100),
      }
    }
    if (status === 400) {
      return {
        ok: false,
        type: 'bad_request',
        status: 400,
        message: '请求参数错误（400）',
        detail: '可能是模型名称 "' + testModel + '" 不被支持。请切换为其他模型（如 generalv3, lite, generalv3.5, 4.0Ultra 等）。服务器返回: ' + rawData.slice(0, 100),
      }
    }
    if (status === 429) {
      return {
        ok: false,
        type: 'rate_limit',
        status: 429,
        message: '请求过于频繁（429）',
        detail: '请稍后再试。讯飞星火 API 有调用频率限制',
      }
    }
    if (status >= 500) {
      return {
        ok: false,
        type: 'server_error',
        status: status,
        message: '服务器内部错误（' + status + '）',
        detail: '讯飞星火服务器暂时不可用，请稍后重试。服务器返回: ' + rawData.slice(0, 100),
      }
    }

    return {
      ok: false,
      type: 'unknown_error',
      message: 'API 返回错误 (' + status + ')',
      detail: parseSparkError(response.data, '请检查网络或稍后重试'),
    }
  } catch (err) {
    const errMsg = err?.message || 'unknown error'
    console.error('[spark-test] 顶层异常:', errMsg)
    return {
      ok: false,
      type: 'unknown_error',
      message: '请求失败',
      detail: errMsg,
    }
  }
}

export async function regenerateCardFromKnowledgePointWithSpark(knowledgePoint, apiPassword, _apiSecret, model, summaryLevel) {
  const prompt = buildRegenerateCardPrompt(knowledgePoint, summaryLevel)
  const response = await buildSparkRequest(apiPassword, {
    model: model || 'lite',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 2048,
  }, 30000)
  if (!response.ok) {
    const msg = parseSparkError(response.data, '请求失败 (' + response.status + ')')
    throw new Error('讯飞星火: ' + msg)
  }
  const content = response.data?.choices?.[0]?.message?.content
  const tokens = response.data?.usage?.total_tokens || 0
  if (!content) throw new Error('讯飞星火未返回有效内容')
  const parsed = parseAIResponse(content)
  if (parsed && Array.isArray(parsed.units) && parsed.units.length > 0) {
    const firstCard = parsed.units[0].cards?.[0]
    if (firstCard) return { ...firstCard, tokens }
  }
  const fallback = tryParseJSON(content)
  if (fallback && fallback.front && fallback.back) {
    return {
      knowledge_point: fallback.knowledge_point || knowledgePoint || null,
      front: fallback.front,
      back: fallback.back,
      tokens,
    }
  }
  return { knowledge_point: knowledgePoint || null, front: '（空问题）', back: '（空答案）', tokens }
}

/**
 * Spark Lite 主题聚类专用错误类
 */
class SparkTimeoutError extends Error {
  constructor(message, stage = 'topic-clustering') {
    super(message)
    this.name = 'SparkTimeoutError'
    this.stage = stage
  }
}

/**
 * 计算 Spark Lite 主题聚类的建议主题数量范围
 * @param {number} kpCount 知识点数量
 * @param {string} granularity 粒度：'concise' | 'standard' | 'detailed'
 */
function calculateSparkTopicRange(kpCount, granularity = 'standard', currentTopicCount = null) {
  // 【调整】简模式更激进（factor 0.3），标准模式不变，详细模式更细分（factor 1.8）
  const factor = granularity === 'concise' ? 0.3 : granularity === 'detailed' ? 1.8 : 1.0

  // 基础范围（标准模式）
  let baseMin, baseMax
  if (kpCount < 5) { baseMin = 1; baseMax = 1 }
  else if (kpCount < 10) { baseMin = 1; baseMax = 2 }
  else if (kpCount < 20) { baseMin = 2; baseMax = 3 }
  else if (kpCount < 30) { baseMin = 3; baseMax = 5 }
  else if (kpCount < 50) { baseMin = 4; baseMax = 6 }
  else { baseMin = 5; baseMax = 8 }

  // 应用粒度因子
  let suggestedMin = granularity === 'concise' ? Math.max(1, Math.round(baseMin * factor)) : baseMin
  let suggestedMax = Math.max(suggestedMin + 1, Math.round(baseMax * factor))

  // 如果有当前主题数量，强制约束范围
  if (currentTopicCount !== null && currentTopicCount > 0) {
    if (granularity === 'concise') {
      // 简模式：必须比当前少
      suggestedMax = Math.max(1, currentTopicCount - 1)
      suggestedMin = Math.max(1, Math.min(suggestedMin, suggestedMax - 1))
    } else if (granularity === 'detailed') {
      // 详模式：必须比当前多
      suggestedMin = Math.min(15, currentTopicCount + 2)
      suggestedMax = Math.max(suggestedMin + 1, Math.min(15, suggestedMin + 3))
    }
  }

  return [suggestedMin, suggestedMax]
}

/**
 * 深度转换 pointIndices 中的字符串索引为数字类型
 * Spark Lite 弱模型可能返回字符串类型的索引（如 ["0","1","2"]），
 * 后续代码期望数字类型，typeof idx === 'number' 会过滤掉所有字符串索引。
 */
function normalizePointIndices(topics) {
  if (!Array.isArray(topics)) return topics
  for (const topic of topics) {
    // 转换顶层 pointIndices（旧格式兼容）
    if (topic.pointIndices && Array.isArray(topic.pointIndices)) {
      topic.pointIndices = topic.pointIndices
        .map(idx => Number(idx))
        .filter(idx => !isNaN(idx))
    }
    // 转换 units[].pointIndices（新格式）
    if (topic.units && Array.isArray(topic.units)) {
      for (const unit of topic.units) {
        if (unit.pointIndices && Array.isArray(unit.pointIndices)) {
          unit.pointIndices = unit.pointIndices
            .map(idx => Number(idx))
            .filter(idx => !isNaN(idx))
        }
      }
    }
  }
  return topics
}

/**
 * 解析 AI 返回的 JSON（兼容多种格式）
 */
function parseSparkTopicResponse(raw) {
  if (!raw) return null
  try {
    const trimmed = String(raw).trim()
    const cleaned = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    const firstBracket = cleaned.indexOf('[')
    const lastBracket = cleaned.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1))
    }
    return JSON.parse(cleaned)
  } catch (_) {
    return null
  }
}

/**
 * 降级聚类（Spark API 失败时使用）
 */
function sparkFallbackCluster(knowledgePoints, suggestedMax) {
  const groups = []
  const chunkSize = Math.max(2, Math.ceil(knowledgePoints.length / suggestedMax))

  for (let i = 0; i < knowledgePoints.length; i += chunkSize) {
    const chunk = knowledgePoints.slice(i, i + chunkSize)
    const firstKp = chunk[0] || ''
    const topicName = firstKp.slice(0, 12) || `知识点组${groups.length + 1}`
    const pointIndices = chunk.map((_, j) => i + j)

    groups.push({
      topicName,
      pointIndices,
      units: [{ unitName: '基础', pointIndices: [...pointIndices] }],
    })
  }

  return groups
}

/**
 * Spark Lite 主题聚类函数
 * @param {string[]} knowledgePoints - 知识点数组
 * @param {string} apiPassword - Spark API 密钥
 * @param {string} model - 模型名（默认 'lite'）
 * @param {string} granularity - 粒度：'concise' | 'standard' | 'detailed'
 * @param {Array|null} previousTopics - 用户之前的主题（作为参考，可选）
 * @returns {Promise<Array<{topicName, pointIndices}>>} 主题数组
 */
export async function clusterKnowledgePointsByTopicWithSpark(
  knowledgePoints,
  apiPassword,
  model = 'lite',
  granularity = 'standard',
  previousTopics = null,
  currentTopicCount = null
) {
  if (!knowledgePoints || knowledgePoints.length <= 3) {
    return [{
      topicName: '核心知识点',
      pointIndices: knowledgePoints.map((_, i) => i),
    }]
  }

  const kpCount = knowledgePoints.length
  const [suggestedMin, suggestedMax] = calculateSparkTopicRange(kpCount, granularity, currentTopicCount)

  const kpLines = knowledgePoints.map((kp, i) => `${i}|${kp}`).join('\n')

  // 构建用户参考提示（如果有）
  const userRefHint = previousTopics && previousTopics.length > 0
    ? `\n【用户参考】：用户之前对主题分组做了调整，请参考以下结构（可在此基础上优化）：
${previousTopics.map((t, i) => `${i}|${t.topicName}|${t.pointIndices.length}个知识点`).join('\n')}`
    : ''

  // 粒度说明 + 强制约束
  let granularityHint = ''
  if (granularity === 'concise') {
    if (currentTopicCount !== null && currentTopicCount > 0) {
      const targetMax = Math.max(1, currentTopicCount - 1)
      granularityHint = `\n【强制要求-简模式】：当前已有 ${currentTopicCount} 个主题，你必须生成比这更少的新主题（≤${targetMax}个）。合并语义相近的主题，每个主题覆盖更多知识点。`
    } else {
      granularityHint = '\n【粒度要求】：简略模式 - 生成较少的主题（2-4个），每个主题包含更多知识点，强调知识的整体性和关联性。'
    }
  } else if (granularity === 'detailed') {
    if (currentTopicCount !== null && currentTopicCount > 0) {
      const targetMin = Math.min(15, currentTopicCount + 2)
      granularityHint = `\n【强制要求-详模式】：当前已有 ${currentTopicCount} 个主题，你必须生成比这更多的新主题（≥${targetMin}个）。细分语义差异较大的知识点，每个主题覆盖较少知识点。`
    } else {
      granularityHint = '\n【粒度要求】：详细模式 - 生成较多的主题（6-10个），每个主题包含较少知识点，强调知识的细分和精确分类。'
    }
  }

  const prompt = `你是知识体系整理专家。请将以下考研知识点按主题语义进行聚类分组。

【主题数量决策规则】：
1. 自主决定：根据知识点的语义分布，由你自行决定最合适的主题数量
2. 建议范围：建议 ${suggestedMin} - ${suggestedMax} 个主题（可灵活调整，但不要偏离太远）
3. 判断标准：
   - 如果知识点内容高度相关，主题数量应较少
   - 如果知识点涉及多个独立知识领域，主题数量应较多
   - 每个主题至少包含 2 个知识点
   - 避免过度细分（不要每个知识点一个主题）
4. 主题粒度：每个主题应代表一个独立的知识领域或核心概念
5. 主题命名：使用宽泛的概括性名称（如"计算机网络基础"），不超过12字
6. 单元划分：每个主题下按知识点语义再细分为2-5个单元，单元名使用宽泛概括性命名
7. 必须覆盖：每个知识点必须且只能归入一个主题一个单元${userRefHint}${granularityHint}

【待聚类知识点】（格式：索引|知识点内容）：
${kpLines}

【输出格式】纯 JSON 数组，不要额外文字、不要代码块：
[{"topicName":"主题名称","units":[{"unitName":"单元名","pointIndices":[0,1]},{"unitName":"另一单元","pointIndices":[2]}]},...]
- topicName: 主题名称（≤12字）
- units: 该主题下的单元列表，每个主题包含2-5个单元
- unitName: 单元名称（≤16字），使用宽泛的概括性命名
- pointIndices: 该单元包含的知识点索引数组（整数）
- 每个知识点必须且只能归入一个单元`

  try {
    const response = await buildSparkRequest(apiPassword, {
      model: model || 'lite',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2048,
    }, 15000)

    if (!response.ok) {
      const status = response.status || 0
      const statusText = status >= 500 ? `服务器错误(${status})` :
                         status === 401 ? '认证失败' :
                         status === 403 ? '权限不足' :
                         status === 429 ? '请求过于频繁' :
                         `请求失败(${status})`
      throw new Error(`Spark: ${statusText}`)
    }

    const content = response.data?.choices?.[0]?.message?.content || ''
    if (!content) {
      throw new Error('Spark: 未返回有效内容')
    }

    const parsed = parseSparkTopicResponse(content)
    if (parsed && Array.isArray(parsed)) {
      // 深度转换字符串索引为数字（弱模型可能返回字符串类型）
      normalizePointIndices(parsed)
      // 后处理：过滤无效主题，处理去重
      // 【修复】兼容新旧两种格式：
      //   旧格式: {topicName, pointIndices: [...]}
      //   新格式: {topicName, units: [{unitName, pointIndices: [...]}]}
      const validTopics = parsed.filter(t => {
        if (!t.topicName) return false
        // 新格式：检查 units 内是否有有效 pointIndices
        if (t.units && Array.isArray(t.units) && t.units.length > 0) {
          return t.units.some(u => u.pointIndices && Array.isArray(u.pointIndices) && u.pointIndices.length > 0)
        }
        // 旧格式：检查顶层 pointIndices
        return Array.isArray(t.pointIndices) && t.pointIndices.length > 0
      })

      const covered = new Set()
      const cleaned = []

      for (const topic of validTopics) {
        // 【修复】从新格式或旧格式中提取所有 pointIndices
        let allIndices
        if (topic.units && Array.isArray(topic.units)) {
          // 新格式：从所有 units 中收集 pointIndices
          allIndices = topic.units.flatMap(u => (u.pointIndices && Array.isArray(u.pointIndices)) ? u.pointIndices : [])
        } else {
          // 旧格式：使用顶层 pointIndices
          allIndices = topic.pointIndices || []
        }

        const indices = allIndices.filter(idx =>
          typeof idx === 'number' && idx >= 0 && idx < knowledgePoints.length
        )

        const uniqueIndices = []
        for (const idx of indices) {
          if (!covered.has(idx)) {
            covered.add(idx)
            uniqueIndices.push(idx)
          }
        }

        if (uniqueIndices.length > 0) {
          cleaned.push({
            topicName: String(topic.topicName).trim().slice(0, 12),
            pointIndices: uniqueIndices,
            // 【修复】保留 AI 返回的 units 结构（新格式）
            units: topic.units || undefined,
          })
        }
      }

      // 处理未覆盖的知识点
      if (covered.size < knowledgePoints.length) {
        const remaining = []
        for (let i = 0; i < knowledgePoints.length; i++) {
          if (!covered.has(i)) remaining.push(i)
        }
        if (cleaned.length > 0 && remaining.length > 0) {
          const distributeCount = Math.min(remaining.length, Math.ceil(remaining.length / cleaned.length))
          for (let i = 0; i < cleaned.length && remaining.length > 0; i++) {
            const toAdd = remaining.splice(0, distributeCount)
            cleaned[i].pointIndices.push(...toAdd)
          }
        }
      }

      // units 兼容处理：确保每个主题都有 units 字段
      for (const topic of cleaned) {
        if (!topic.units || !Array.isArray(topic.units) || topic.units.length === 0) {
          // 旧格式兼容：创建默认"基础"单元，包含所有 pointIndices
          topic.units = [{ unitName: '基础', pointIndices: [...topic.pointIndices] }]
        } else {
          const unitCovered = new Set()
          const validUnits = []
          for (const unit of topic.units) {
            if (!unit.unitName || !Array.isArray(unit.pointIndices)) continue
            const validIndices = unit.pointIndices.filter(idx =>
              typeof idx === 'number' && idx >= 0 && idx < knowledgePoints.length
            )
            const uniqueIndices = []
            for (const idx of validIndices) {
              if (!unitCovered.has(idx)) {
                unitCovered.add(idx)
                uniqueIndices.push(idx)
              }
            }
            if (uniqueIndices.length > 0) {
              validUnits.push({
                unitName: String(unit.unitName).trim().slice(0, 16),
                pointIndices: uniqueIndices,
              })
            }
          }
          // 确保所有 pointIndices 都被覆盖
          const allTopicIndices = new Set(topic.pointIndices)
          const coveredIndices = new Set(unitCovered)
          const uncovered = [...allTopicIndices].filter(idx => !coveredIndices.has(idx))
          if (uncovered.length > 0) {
            if (validUnits.length > 0) {
              validUnits[0].pointIndices.push(...uncovered)
            } else {
              validUnits.push({ unitName: '基础', pointIndices: uncovered })
            }
          }
          topic.units = validUnits.length > 0 ? validUnits : [{ unitName: '基础', pointIndices: [...topic.pointIndices] }]
        }
      }

      return cleaned
    }

    // 解析失败，使用降级逻辑
    return sparkFallbackCluster(knowledgePoints, suggestedMax)

  } catch (err) {
    // 检查是否为超时错误
    if (err?.message?.includes('超时') || err?.message?.includes('timeout') || err?.name === 'AbortError') {
      throw new SparkTimeoutError('AI 主题聚类响应超时，请重试', 'topic-clustering')
    }
    // 其他错误继续抛出
    throw err
  }
}

// ============================================================
// 知识点去重 - 弱模型专用路径
// ============================================================

/**
 * 弱模型知识点去重 - 单批调用
 * @param {string[]} tempPoints - 待检测知识点
 * @param {string[]} existingPoints - 现有知识点
 * @param {object} config - { apiPassword, model }
 * @returns {Promise<Array>} 判定结果数组
 */
export async function deduplicateWithSpark(tempPoints, existingPoints, config) {
  if (!Array.isArray(tempPoints) || tempPoints.length === 0) {
    return tempPoints.map((_, i) => ({ tempIndex: i, isDuplicate: false, matchedExistingIndex: null, similarity: 0, reason: '' }))
  }
  if (!Array.isArray(existingPoints) || existingPoints.length === 0) {
    return tempPoints.map((_, i) => ({ tempIndex: i, isDuplicate: false, matchedExistingIndex: null, similarity: 0, reason: '' }))
  }

  const truncatedExisting = existingPoints.slice(0, 50) // 弱模型限制50个

  // 构建简化版 prompt（弱模型需要简短）
  const tempLines = tempPoints.map((p, i) => `${i}. ${p}`).join('\n')
  const existLines = truncatedExisting.map((p, i) => `${i}. ${p}`).join('\n')

  const prompt = `知识点去重。判断【待】中每个是否与【已有】重复。

【待】:
${tempLines}

【已有】:
${existLines}

【输出】JSON数组，简洁格式：
[{"i":0,"d":true,"m":0,"s":0.85},{"i":1,"d":false,"m":null,"s":0}]

含义：i=索引,d=是否重复,m=匹配的已有索引,s=相似度(0-1)`

  try {
    const response = await buildSparkRequest(config.apiPassword, {
      model: config.model || 'lite',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
    }, 30000) // 弱模型30秒超时

    if (!response.ok) {
      throw new Error(`Spark: 请求失败 (${response.status})`)
    }

    const content = response.data?.choices?.[0]?.message?.content || ''
    if (!content) {
      throw new Error('Spark: 未返回有效内容')
    }

    // 预处理：剥离 markdown 格式
    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()

    // 容错解析
    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // 尝试提取 JSON 片段
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          parsed = null
        }
      }
    }

    if (!parsed || !Array.isArray(parsed)) {
      // 解析失败，返回空结果（让调用方决定是否降级）
      console.warn('[deduplicateWithSpark] 解析失败，使用空结果')
      return tempPoints.map((_, i) => ({ tempIndex: i, isDuplicate: false, matchedExistingIndex: null, similarity: 0, reason: '解析失败' }))
    }

    // 标准化结果格式
    return parsed.map(item => ({
      tempIndex: typeof item.i === 'number' ? item.i : (typeof item.tempIndex === 'number' ? item.tempIndex : 0),
      isDuplicate: Boolean(item.d || item.isDuplicate || item.duplicate),
      matchedExistingIndex: item.m !== null && item.m !== undefined ? item.m : (item.matchedExistingIndex ?? null),
      similarity: typeof item.s === 'number' ? item.s : (typeof item.similarity === 'number' ? item.similarity : 0),
      reason: String(item.reason || item.r || '') || '',
    }))

  } catch (err) {
    if (err?.message?.includes('超时') || err?.message?.includes('timeout') || err?.name === 'AbortError') {
      throw new SparkTimeoutError('AI 去重响应超时', 'deduplication')
    }
    throw err
  }
}
