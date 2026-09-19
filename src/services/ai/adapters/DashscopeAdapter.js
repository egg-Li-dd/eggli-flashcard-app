import { AiServiceInterface, MODEL_TYPES } from '../AiServiceInterface'
import { generateCardsWithDashscope } from '../../dashscope'
import { httpPost } from '../../../utils/httpClient'
import { DASHSCOPE_API_URL, KNOWLEDGE_POINT_EXTRACTION_PROMPT } from '../../../utils/constants'
import { logAiCall, resolveModelName } from '../../aiCallLog'

export class DashscopeAdapter extends AiServiceInterface {
  constructor(config) {
    super()
    this.config = config
    this.apiKey = config.dashscopeApiKey
    this.model = config.model || 'qwen3.5-plus-2026-04-20'
  }

  getModelType() {
    return MODEL_TYPES.STRONG
  }

  supportsBatchProcessing() {
    return false
  }

  async extractKnowledgePoints(text, options = {}) {
    const startTime = Date.now()
    try {
      const prompt = KNOWLEDGE_POINT_EXTRACTION_PROMPT.replace('{{text}}', text)
      const body = {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4096,
      }

      const resp = await httpPost(DASHSCOPE_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.apiKey },
        data: body,
        timeout: options.timeout || 30000,
      })

      if (!resp.ok) {
        throw new Error('Dashscope: 请求失败')
      }

      const raw = resp.data?.choices?.[0]?.message?.content || ''
      const result = this._parseKnowledgePoints(raw)

      logAiCall({
        purpose: 'knowledge-point-extraction',
        modelName: resolveModelName('dashscope', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: resp.data?.usage?.total_tokens || 0,
        prompt: text,
        response: raw,
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'knowledge-point-extraction',
        modelName: resolveModelName('dashscope', this.model),
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
      const topicPrompt = this._buildTopicClusterPrompt(knowledgePoints, granularity)
      const body = {
        model: this.model,
        messages: [{ role: 'user', content: topicPrompt }],
        temperature: 0.3,
        max_tokens: 4096,
      }

      const resp = await httpPost(DASHSCOPE_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.apiKey },
        data: body,
        timeout: options.timeout || 30000,
      })

      if (!resp.ok) {
        throw new Error('Dashscope: 请求失败')
      }

      const raw = resp.data?.choices?.[0]?.message?.content || ''
      const result = this._parseClusterResult(raw, knowledgePoints)

      logAiCall({
        purpose: 'topic-clustering',
        modelName: resolveModelName('dashscope', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: resp.data?.usage?.total_tokens || 0,
        prompt: topicPrompt,
        response: raw,
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'topic-clustering',
        modelName: resolveModelName('dashscope', this.model),
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
        max_tokens: 4096,
      }

      const resp = await httpPost(DASHSCOPE_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.apiKey },
        data: body,
        timeout: options.timeout || 30000,
      })

      if (!resp.ok) {
        throw new Error('Dashscope reorganize failed')
      }

      const raw = resp.data?.choices?.[0]?.message?.content || ''
      const result = this._parseReorganizeResult(raw, allCards.length, existingChapters)

      logAiCall({
        purpose: 'unit-reorganization',
        modelName: resolveModelName('dashscope', this.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: resp.data?.usage?.total_tokens || 0,
        prompt: prompt,
        response: raw,
      })

      return result
    } catch (err) {
      logAiCall({
        purpose: 'unit-reorganization',
        modelName: resolveModelName('dashscope', this.model),
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
      const result = await generateCardsWithDashscope(knowledgePoints.join('\n'), this.apiKey, this.model, summaryLevel)

      logAiCall({
        purpose: 'card-generation',
        modelName: resolveModelName('dashscope', this.model),
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
        modelName: resolveModelName('dashscope', this.model),
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
      const trimmed = String(raw).trim()
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

  _parseClusterResult(raw, knowledgePoints) {
    try {
      const trimmed = String(raw).trim()
      const firstBracket = trimmed.indexOf('[')
      const lastBracket = trimmed.lastIndexOf(']')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const jsonStr = trimmed.slice(firstBracket, lastBracket + 1)
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed)) {
          return parsed.map(topic => ({
            name: String(topic.name || topic).trim(),
            cardIndices: Array.isArray(topic.cardIndices) ? topic.cardIndices : [],
          }))
        }
      }
    } catch (_) {}
    return []
  }

  _parseReorganizeResult(raw, cardCount, existingChapters) {
    try {
      const trimmed = String(raw).trim()
      const firstBracket = trimmed.indexOf('{')
      const lastBracket = trimmed.lastIndexOf('}')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
        const hasChapters = existingChapters && existingChapters.length > 0
        if (hasChapters && parsed && Array.isArray(parsed.chapters)) {
          const result = { chapters: [] }
          for (const ch of parsed.chapters) {
            if (!ch.name || typeof ch.name !== 'string') continue
            const chapterName = String(ch.name).trim().slice(0, 12)
            if (!chapterName) continue
            const units = []
            if (Array.isArray(ch.units)) {
              for (const u of ch.units) {
                if (!u.name || typeof u.name !== 'string') continue
                const unitName = String(u.name).trim().slice(0, 16)
                if (!unitName) continue
                const cardIndices = Array.isArray(u.cardIndices) ? u.cardIndices : []
                units.push({ name: unitName, cardIndices: cardIndices.filter(i => typeof i === 'number' && i >= 0 && i < cardCount) })
              }
            }
            if (units.length > 0) {
              result.chapters.push({ name: chapterName, units })
            }
          }
          return result
        }
        if (parsed && Array.isArray(parsed.units)) {
          const result = { units: [] }
          for (const u of parsed.units) {
            if (!u.name || typeof u.name !== 'string') continue
            const unitName = String(u.name).trim().slice(0, 16)
            if (!unitName) continue
            const cardIndices = Array.isArray(u.cardIndices) ? u.cardIndices : []
            result.units.push({ name: unitName, cardIndices: cardIndices.filter(i => typeof i === 'number' && i >= 0 && i < cardCount) })
          }
          return result
        }
      }
    } catch (_) {}
    throw new Error('AI 返回格式异常，无法解析')
  }

  _buildTopicClusterPrompt(knowledgePoints, granularity) {
    const granularityDesc = {
      concise: '更粗粒度，生成 3-5 个主题',
      standard: '标准粒度，生成 4-8 个主题',
      detailed: '更细粒度，生成 6-12 个主题',
    }[granularity] || '标准粒度，生成 4-8 个主题'

    const pointsText = knowledgePoints.map((p, i) => `${i}: ${p}`).join('\n')

    return `你是考研科目的知识体系整理助手。请阅读以下知识点列表，然后按照内容的逻辑关联进行主题聚类。

【任务】：将知识点划分为若干主题，每个主题下包含若干相关的知识点。

【划分原则】：
1. ${granularityDesc}
2. 主题名称要概括该主题下所有知识点的核心内容
3. 每个知识点必须属于且仅属于一个主题
4. 主题之间要有明确的区分度，避免内容重叠

【知识点列表（共 ${knowledgePoints.length} 个）】：
${pointsText}

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
[
  {
    "name": "主题名称",
    "cardIndices": [0, 3, 5, ...]
  },
  ...
]
注意：cardIndices 是知识点在输入列表中的下标（从 0 开始）。`
  }

  _buildReorganizePrompt(categoryName, allCards, existingUnitNames, existingChapters) {
    const cardLines = allCards.map((c, i) => {
      const kp = String(c.knowledge_point || c.front || '').slice(0, 120)
      return `卡${i}: ${kp}`
    })

    const existingHint = existingUnitNames && existingUnitNames.length > 0
      ? `【现有单元名称（供参考）】：${existingUnitNames.map(n => `"${n}"`).join('、')}`
      : '（当前分类下尚无单元）'

    const hasChapters = existingChapters && existingChapters.length > 0
    const chapterHint = hasChapters
      ? `【现有章节（供参考）】：${existingChapters.map(ch => `"${ch.name}"`).join('、')}`
      : ''

    if (hasChapters) {
      return `你是考研科目的知识体系整理助手。请对分类"${categoryName}"下的所有卡片进行章节+单元重新规划。

【任务】：阅读下面所有卡片的内容（原始知识点），将卡片按知识体系逻辑重新划分为若干章节和单元，并为每个章节和单元起一个概括性名称。

【划分原则】：
1. 章节是中等粒度的知识模块，不要过大也不要过小。每个章节包含 2-5 个相关的单元；当卡片数量较多时可扩展至 2-10 个单元
2. 单元是较宽泛的知识板块，每个单元包含 2-50 张卡片。不要将知识点拆分得过细
3. 章节名称使用明确的知识领域命名（如"线性表"、"进程管理"），不超过 12 个字
4. 单元名称使用概括性命名（如"摩擦力"，而非"影响滑动摩擦力的因素"），不超过 16 个字
5. 如果现有章节/单元名称合适，可以沿用（但不要被其限制，以内容逻辑为准）
6. 确保所有卡片都被分配到某个章节的某个单元中，不要遗漏任何卡片

${chapterHint}
${existingHint}

【所有卡片（共 ${allCards.length} 张）】：
${cardLines.join('\n')}

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "chapters": [
    {
      "name": "章节名称（不超过 12 字）",
      "units": [
        {
          "name": "单元名称（不超过 16 字）",
          "cardIndices": [0, 3, 5, ...]
        },
        ...
      ]
    },
    ...
  ]
}
注意：cardIndices 是卡片在输入列表中的下标（从 0 开始），每张卡片必须属于且仅属于一个章节的一个单元。`
    }

    return `你是考研科目的知识体系整理助手。请对分类"${categoryName}"下的所有卡片进行单元重新规划。

【任务】：阅读下面所有卡片的内容（原始知识点），将卡片按知识体系逻辑重新划分为若干学习单元，并为每个单元起一个概括性名称。

【划分原则】：
1. 每个单元是一个较宽泛的知识板块（如"数据结构基础"、"操作系统进程管理"），不要过于细碎
2. 每个单元包含 2-50 张卡片，确保分类不过于零散
3. 单元名称使用概括性命名（如"摩擦力"，而非"影响滑动摩擦力的因素"），不超过 16 个字
4. 如果现有单元名称合适，可以沿用（但不要被其限制，以内容逻辑为准）
5. 确保所有卡片都被分配到某个单元中，不要遗漏任何卡片

${existingHint}

【所有卡片（共 ${allCards.length} 张）】：
${cardLines.join('\n')}

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "units": [
    {
      "name": "单元名称（不超过 16 字）",
      "cardIndices": [0, 3, 5, ...]
    },
    ...
  ]
}
注意：cardIndices 是卡片在输入列表中的下标（从 0 开始），每张卡片必须属于且仅属于一个单元。`
  }
}
