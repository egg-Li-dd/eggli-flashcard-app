import { AiServiceInterface, MODEL_TYPES } from '../AiServiceInterface'
import { generateCardsWithSpark, clusterKnowledgePointsByTopicWithSpark, deduplicateWithSpark } from '../../iflytekAi'
import { httpPost } from '../../../utils/httpClient'
import { IFLYTEK_SPARK_API_URL, KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK } from '../../../utils/constants'
import { logAiCall, resolveModelName } from '../../aiCallLog'
import { normalizeSparkApiPassword } from '../../../utils/sparkAuth'

export class SparkLiteAdapter extends AiServiceInterface {
  constructor(config) {
    super()
    this.config = config
    this.sparkApiKey = config.sparkApiKey
    this.sparkApiSecret = config.sparkApiSecret
    this.model = config.model || 'lite'
    this.password = normalizeSparkApiPassword(config.sparkApiKey)
  }

  getModelType() {
    return MODEL_TYPES.WEAK
  }

  supportsBatchProcessing() {
    return true
  }

  async extractKnowledgePoints(text, options = {}) {
    const startTime = Date.now()
    try {
      const prompt = KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK.replace('{{text}}', text)
      const body = {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      }

      const resp = await httpPost(IFLYTEK_SPARK_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.password },
        data: body,
        timeout: options.timeout || 30000,
      })

      if (!resp.ok) {
        throw new Error('Spark: 请求失败')
      }

      const raw = resp.data?.choices?.[0]?.message?.content || ''
      const result = this._parseKnowledgePoints(raw)

      logAiCall({
        purpose: 'knowledge-point-extraction',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: 0,
        prompt: text,
        response: raw,
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'knowledge-point-extraction',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: text,
        response: '',
      })
      throw err
    }
  }

  async clusterKnowledgePoints(knowledgePoints, options = {}) {
    const startTime = Date.now()
    try {
      const granularity = options.granularity || 'standard'
      const previousTopics = options.previousTopics || null

      const result = await clusterKnowledgePointsByTopicWithSpark(
        knowledgePoints,
        this.sparkApiKey,
        this.model,
        granularity,
        previousTopics
      )

      logAiCall({
        purpose: 'topic-clustering',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: 0,
        prompt: '',
        response: JSON.stringify(result),
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'topic-clustering',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '',
        response: '',
      })
      throw err
    }
  }

  async reorganizeUnits(categoryName, allCards, existingUnitNames, options = {}) {
    const startTime = Date.now()
    try {
      const existingChapters = options.existingChapters || null
      const prompt = this._buildReorganizePrompt(categoryName, allCards, existingUnitNames, existingChapters)
      const body = {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      }

      const resp = await httpPost(IFLYTEK_SPARK_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.password },
        data: body,
        timeout: options.timeout || 60000,
      })

      if (!resp.ok) {
        throw new Error('Spark reorganize failed')
      }

      const raw = resp.data?.choices?.[0]?.message?.content || ''
      const result = this._parseReorganizeResult(raw, allCards.length, existingChapters)

      logAiCall({
        purpose: 'unit-reorganization',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: 0,
        prompt: prompt,
        response: raw,
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'unit-reorganization',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '',
        response: '',
      })
      throw err
    }
  }

  async generateCards(knowledgePoints, options = {}) {
    const startTime = Date.now()
    try {
      const summaryLevel = options.summaryLevel || 3
      const result = await generateCardsWithSpark(
        knowledgePoints.join('\n'),
        this.sparkApiKey,
        this.sparkApiSecret,
        this.model,
        summaryLevel
      )

      logAiCall({
        purpose: 'card-generation',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: 0,
        prompt: knowledgePoints.join('\n'),
        response: result,
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'card-generation',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '',
        response: '',
      })
      throw err
    }
  }

  async deduplicateKnowledgePoints(knowledgePoints, options = {}) {
    const startTime = Date.now()
    try {
      const result = await deduplicateWithSpark(knowledgePoints, this.sparkApiKey, this.model)

      logAiCall({
        purpose: 'knowledge-point-deduplication',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: 0,
        prompt: '',
        response: JSON.stringify(result),
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'knowledge-point-deduplication',
        modelName: resolveModelName('iflytek-spark', this.model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '',
        response: '',
      })
      throw err
    }
  }

  _parseKnowledgePoints(raw) {
    try {
      const cleaned = this._cleanSparkResponse(raw)
      const trimmed = String(cleaned).trim()
      const firstBracket = trimmed.indexOf('[')
      const lastBracket = trimmed.lastIndexOf(']')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const jsonStr = trimmed.slice(firstBracket, lastBracket + 1)
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed)) {
          return parsed.map(p => typeof p === 'string' ? p.trim() : String(p).trim()).filter(p => p.length > 0)
        }
      }
    } catch (_) {}
    return []
  }

  _parseReorganizeResult(raw, cardCount, existingChapters) {
    try {
      const cleaned = this._cleanSparkResponse(raw)
      const trimmed = String(cleaned).trim()
      const firstBracket = trimmed.indexOf('{')
      const lastBracket = trimmed.lastIndexOf('}')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        let parsed = null
        let jsonBody = trimmed.slice(firstBracket, lastBracket + 1)

        // 策略 1: 直接解析
        try { parsed = JSON.parse(jsonBody) } catch (_) { parsed = null }

        // 策略 2: 修复尾部逗号 (常见弱模型错误)
        if (!parsed) {
          try {
            const fixed = jsonBody.replace(/,(\s*[}\]])/g, '$1')
            parsed = JSON.parse(fixed)
          } catch (_) { parsed = null }
        }

        // 策略 3: 修复字符串索引 (弱模型可能写成 "0","1" 而不是 0,1)
        if (!parsed) {
          try {
            const fixed = jsonBody.replace(/:"(\-?\d+)"(?=\s*[,\]\}])/g, ':$1')
              .replace(/\[(\s*"\-?\d+"[\s\S]*?)\]/g, (match) => {
                if (/^\[\s*"\-?\d+"(,\s*"\-?\d+")*\s*\]$/.test(match)) {
                  return match.replace(/"(\-?\d+)"/g, '$1')
                }
                return match
              })
            parsed = JSON.parse(fixed)
          } catch (_) { parsed = null }
        }

        if (!parsed) throw new Error('所有解析策略都失败')

        const hasChapters = existingChapters && existingChapters.length > 0
        const _validateIdx = (i) => typeof i === 'number' && Number.isFinite(i) && i >= 0 && i < cardCount
        const _convertIndex = (v) => {
          if (typeof v === 'number') return v
          if (typeof v === 'string') {
            const n = Number(v)
            return Number.isFinite(n) ? n : -1
          }
          return -1
        }

        if (hasChapters && parsed && Array.isArray(parsed.chapters)) {
          const result = { chapters: [] }
          for (const ch of parsed.chapters) {
            if (!ch?.name || typeof ch.name !== 'string') continue
            const chapterName = String(ch.name).trim().slice(0, 12)
            if (!chapterName) continue
            const units = []
            if (Array.isArray(ch.units)) {
              for (const u of ch.units) {
                if (!u?.name || typeof u.name !== 'string') continue
                const unitName = String(u.name).trim().slice(0, 16)
                if (!unitName) continue
                const indices = (Array.isArray(u.cardIndices) ? u.cardIndices : [])
                  .map(_convertIndex)
                  .filter(_validateIdx)
                if (indices.length > 0) {
                  units.push({ name: unitName, cardIndices: indices })
                }
              }
            }
            if (units.length > 0) result.chapters.push({ name: chapterName, units })
          }
          if (result.chapters.length > 0) return result
        }

        if (parsed && Array.isArray(parsed.units)) {
          const result = { units: [] }
          for (const u of parsed.units) {
            if (!u?.name || typeof u.name !== 'string') continue
            const unitName = String(u.name).trim().slice(0, 16)
            if (!unitName) continue
            const indices = (Array.isArray(u.cardIndices) ? u.cardIndices : [])
              .map(_convertIndex)
              .filter(_validateIdx)
            if (indices.length > 0) result.units.push({ name: unitName, cardIndices: indices })
          }
          if (result.units.length > 0) return result
        }
      }
    } catch (err) {
      console.warn('[SparkLiteAdapter] 解析弱模型返回失败:', err?.message)
    }
    throw new Error('AI 返回格式异常，无法解析')
  }

  _cleanSparkResponse(response) {
    let cleaned = String(response || '')
    cleaned = cleaned.replace(/```json/g, '').replace(/```/g, '')
    cleaned = cleaned.replace(/["']`/g, '"').replace(/`["']/g, '"')
    return cleaned
  }

  _buildReorganizePrompt(categoryName, allCards, existingUnitNames, existingChapters) {
    const maxCards = 15
    const cardLines = allCards.slice(0, maxCards).map((c, i) => {
      const kp = String(c.knowledge_point || c.front || '').slice(0, 80)
      return `卡${i}: ${kp}`
    })

    const existingHint = existingUnitNames && existingUnitNames.length > 0
      ? `【现有单元名称】：${existingUnitNames.slice(0, 5).map(n => `"${n}"`).join('、')}`
      : '（当前分类下尚无单元）'

    const hasChapters = existingChapters && existingChapters.length > 0
    const chapterHint = hasChapters
      ? `【现有章节】：${existingChapters.slice(0, 5).map(ch => `"${ch.name}"`).join('、')}`
      : ''

    if (hasChapters) {
      return `你是考研科目的知识体系整理助手。请对分类"${categoryName}"下的卡片进行章节+单元规划。

【任务】：阅读下面卡片内容，将卡片按知识体系逻辑划分为章节和单元。

【划分原则】：
1. 章节 1-5 个，每个章节包含 2-5 个单元
2. 每个单元包含 2-20 张卡片
3. 章节名称不超过 12 字，单元名称不超过 16 字
4. 确保所有卡片都被分配

${chapterHint}
${existingHint}

【卡片（共 ${allCards.length} 张，展示前 ${cardLines.length} 张）】：
${cardLines.join('\n')}

【输出格式】严格 JSON：
{
  "chapters": [
    {"name": "章节名", "units": [{"name": "单元名", "cardIndices": [0, 1, 2]}]}
  ]
}`
    }

    return `你是考研科目的知识体系整理助手。请对分类"${categoryName}"下的卡片进行单元规划。

【任务】：阅读下面卡片内容，将卡片按知识体系逻辑划分为学习单元。

【划分原则】：
1. 单元数量 3-8 个
2. 每个单元包含 2-20 张卡片
3. 单元名称不超过 16 字
4. 确保所有卡片都被分配

${existingHint}

【卡片（共 ${allCards.length} 张，展示前 ${cardLines.length} 张）】：
${cardLines.join('\n')}

【输出格式】严格 JSON：
{
  "units": [{"name": "单元名", "cardIndices": [0, 1, 2