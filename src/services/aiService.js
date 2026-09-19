import {
  cleanUpSpeechText as dsCleanUpSpeechText,
  generateCards as dsGenerateCards,
  extractTextFromImage as dsExtractTextFromImage,
  testApiConnection as dsTestApiConnection,
  regenerateCardFromKnowledgePoint,
} from './deepseek'
import {
  cleanUpSpeechTextWithSpark,
  generateCardsWithSpark,
  extractTextFromImageWithSpark,
  testSparkConnection,
  regenerateCardFromKnowledgePointWithSpark,
  clusterKnowledgePointsByTopicWithSpark,
  deduplicateWithSpark,
} from './iflytekAi'
import {
  cleanUpSpeechTextWithVolcano,
  generateCardsWithVolcano,
  extractTextFromImageWithVolcano,
  testVolcanoConnection,
  regenerateCardFromKnowledgePointWithVolcano,
} from './volcanoEngine'
import {
  cleanUpSpeechTextWithDashscope,
  generateCardsWithDashscope,
  extractTextFromImageWithDashscope,
  testDashscopeConnection,
  regenerateCardFromKnowledgePointWithDashscope,
} from './dashscope'
import {
  extractTextWithVisionAi,
} from './visionAi'
import { getTopicByName, createTopic } from './db'
import { DEEPSEEK_API_URL, IFLYTEK_SPARK_API_URL, VOLCANO_ENGINE_API_URL, DASHSCOPE_API_URL, KNOWLEDGE_POINT_EXTRACTION_PROMPT, KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK, BATCH_CARDS_FROM_KNOWLEDGE_POINTS_PROMPT, getBatchCardsPromptByLevel, CATEGORY_PURPOSE_GENERATION_PROMPT } from '../utils/constants'
import { httpPost } from '../utils/httpClient'
import { normalizeSparkApiPassword } from '../utils/sparkAuth'
import { logAiCall, resolveModelName } from './aiCallLog'
import { extractTextWithPaddleOcr } from './paddleOcr'
import { extractTextWithBaiduOcr } from './baiduOcr'

import { extractTextWithPaddleOcrLocal } from './paddleOcrLocal'
import { extractTextWithTesseract } from './tesseractOcr'
import { aiChatCompletion } from './pcEngineProxy'
import { checkPcEngineAvailable } from './pcEngineFallback'
import { checkKnowledgePointsQuality, checkCardsQuality, validateAiResponseFormat, autoFixCards } from '../utils/cardQualityChecker'

// 强模型归类阈值：现有卡片总数超过此值走多轮分批
const STRONG_CLASSIFY_CARD_THRESHOLD = 200
// 每批处理的章节数
const BATCH_CHAPTER_SIZE = 3
// 跨分类全权归类：每批最大知识点数
const CROSS_CATEGORY_BATCH_SIZE = 30

// 自定义超时错误类型（用于卡片分类时 AI 响应超时）
export class AiTimeoutError extends Error {
  constructor(message, stage = 'unknown') {
    super(message)
    this.name = 'AiTimeoutError'
    this.stage = stage
  }
}

/**
 * 调用 PC 引擎 AI（带自动降级）
 * PC 引擎配置并可用时发起到 /api/ai/chat，失败时返回 null
 */
async function callPcEngineAi(messages, options = {}) {
  const { getPcEngineConfig } = await import('./pcEngine')
  const config = getPcEngineConfig()
  if (!config.host) return null
  const baseUrl = `http://${config.host}:19000`
  const token = config.token
  try {
    const result = await aiChatCompletion(baseUrl, token, messages, {
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      timeout: options.timeout ?? 15000,
    })
    return result
  } catch (e) {
    console.warn('[PC引擎AI] 调用失败，降级到手机端:', e.message)
    return null
  }
}

// dev 模式通过 Vite 代理绕过 CORS；生产环境直连
const SPARK_URL = import.meta.env.DEV
  ? '/api/spark/v1/chat/completions'
  : IFLYTEK_SPARK_API_URL

function getModelName(aiServiceMode, model) {
  return resolveModelName(aiServiceMode, model)
}

export async function cleanUpSpeechText(text, apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey) {
  const startTime = Date.now()
  try {
    let result
    if (aiServiceMode === 'iflytek-spark') {
      result = await cleanUpSpeechTextWithSpark(text, sparkApiKey, sparkApiSecret, model)
    } else if (aiServiceMode === 'volcano') {
      result = await cleanUpSpeechTextWithVolcano(text, volcanoApiKey, model)
    } else if (aiServiceMode === 'dashscope') {
      result = await cleanUpSpeechTextWithDashscope(text, dashscopeApiKey, model)
    } else if (aiServiceMode === 'pc-engine') {
      const pcResult = await callPcEngineAi([{ role: 'user', content: text }], { temperature: 0.3 })
      if (pcResult) {
        result = { content: pcResult.content }
      } else {
        result = await dsCleanUpSpeechText(text, apiKey, model)
      }
    } else {
      result = await dsCleanUpSpeechText(text, apiKey, model)
    }
    const { content, tokens } = result
    logAiCall({
      purpose: 'speech-cleanup',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens,
      prompt: text,
      response: content,
    })
    return content
  } catch (err) {
    logAiCall({
      purpose: 'speech-cleanup',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: text,
      response: '',
    })
    throw err
  }
}

// ============================================================
// 一键单元整理：AI 根据所有卡片自动重新规划单元
// 支持完整层级：分类 → 主题 → 章节 → 单元 → 知识点 → 卡片
// ============================================================
export async function reorganizeUnits(categoryName, allCards, existingUnitNames, config, existingChapters, options = {}) {
  if (!allCards || allCards.length === 0) {
    throw new Error('该分类下没有卡片，无法整理')
  }
  if (!config || !config.apiKey) {
    throw new Error('请先配置 DeepSeek API Key')
  }

  const { useFullHierarchy = false } = options
  const prompt = buildReorganizePrompt(categoryName, allCards, existingUnitNames, existingChapters, useFullHierarchy)
  const hasChapters = existingChapters && existingChapters.length > 0

  const body = {
    model: config.model || 'deepseek-v4-pro',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 4096,
  }

  let raw = ''
  const isSpark = config.aiServiceMode === 'iflytek-spark'
  const isVolcano = config.aiServiceMode === 'volcano'
  const isDashscope = config.aiServiceMode === 'dashscope'

  try {
    if (isSpark) {
      const password = (config.sparkApiKey || '').trim()
      const resp = await httpPost(SPARK_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
        data: { ...body, model: config.model || 'lite' },
        timeout: 30000,
      })
      if (!resp.ok) throw new Error('Spark reorganize failed')
      raw = resp.data?.choices?.[0]?.message?.content || ''
    } else if (isVolcano) {
      const resp = await httpPost(VOLCANO_ENGINE_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.volcanoApiKey || '') },
        data: { ...body, model: config.model || 'doubao-pro-32k' },
        timeout: 30000,
      })
      if (!resp.ok) throw new Error('Volcano reorganize failed')
      raw = resp.data?.choices?.[0]?.message?.content || ''
    } else if (isDashscope) {
      const resp = await httpPost(DASHSCOPE_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.dashscopeApiKey || '') },
        data: { ...body, model: config.model || 'qwen3.5-plus-2026-04-20' },
        timeout: 30000,
      })
      if (!resp.ok) throw new Error('Dashscope reorganize failed')
      raw = resp.data?.choices?.[0]?.message?.content || ''
    } else if (isPcEngine) {
      const pcResult = await callPcEngineAi([{ role: 'user', content: prompt }], { temperature: 0.3 })
      if (pcResult) {
        raw = pcResult.content
      }
    }
    // PC 引擎未配置或失败时，走原有 AI 服务
    if (!raw) {
      const resp = await httpPost(DEEPSEEK_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.apiKey || '') },
        data: body,
        timeout: 30000,
      })
      if (!resp.ok) {
        const msg = resp.data?.error?.message || '请求失败 (' + resp.status + ')'
        throw new Error('DeepSeek: ' + msg)
      }
      raw = resp.data?.choices?.[0]?.message?.content || ''
    }

    // 解析 AI 返回的 JSON
    let parsed = null
    try {
      const trimmed = String(raw).trim()
      const firstBracket = trimmed.indexOf('{')
      const lastBracket = trimmed.lastIndexOf('}')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
      }
    } catch (_) {
      throw new Error('AI 返回格式异常，无法解析')
    }

    // 完整层级输出：当启用 fullHierarchy 时，AI 返回 topics → chapters → units → knowledgePoints 结构
    if (useFullHierarchy && parsed && Array.isArray(parsed.topics)) {
      const result = { topics: [] }
      for (const t of parsed.topics) {
        if (!t.name || typeof t.name !== 'string') continue
        const topicName = String(t.name).trim().slice(0, 20)
        if (!topicName) continue
        const chapters = []
        if (Array.isArray(t.chapters)) {
          for (const ch of t.chapters) {
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
                const knowledgePoints = []
                if (Array.isArray(u.knowledgePoints)) {
                  for (const kp of u.knowledgePoints) {
                    knowledgePoints.push({
                      content: String(kp.content || kp.name || '').trim().slice(0, 200),
                    })
                  }
                }
                units.push({
                  name: unitName,
                  cardIndices: cardIndices.filter(i => typeof i === 'number' && i >= 0 && i < allCards.length),
                  knowledgePoints,
                })
              }
            }
            if (units.length > 0) {
              chapters.push({ name: chapterName, units })
            }
          }
        }
        const units = []
        if (Array.isArray(t.units)) {
          for (const u of t.units) {
            if (!u.name || typeof u.name !== 'string') continue
            const unitName = String(u.name).trim().slice(0, 16)
            if (!unitName) continue
            const cardIndices = Array.isArray(u.cardIndices) ? u.cardIndices : []
            const knowledgePoints = []
            if (Array.isArray(u.knowledgePoints)) {
              for (const kp of u.knowledgePoints) {
                knowledgePoints.push({
                  content: String(kp.content || kp.name || '').trim().slice(0, 200),
                })
              }
            }
            units.push({
              name: unitName,
              cardIndices: cardIndices.filter(i => typeof i === 'number' && i >= 0 && i < allCards.length),
              knowledgePoints,
            })
          }
        }
        if (chapters.length > 0 || units.length > 0) {
          result.topics.push({ name: topicName, chapters, units })
        }
      }
      if (result.topics.length === 0) {
        throw new Error('AI 未返回任何有效主题')
      }
      return result
    }

    // 章节级输出：当有章节上下文时，AI 可能返回 chapters 结构
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
            const knowledgePoints = []
            if (Array.isArray(u.knowledgePoints)) {
              for (const kp of u.knowledgePoints) {
                knowledgePoints.push({
                  content: String(kp.content || kp.name || '').trim().slice(0, 200),
                })
              }
            }
            units.push({
              name: unitName,
              cardIndices: cardIndices.filter(i => typeof i === 'number' && i >= 0 && i < allCards.length),
              knowledgePoints,
            })
          }
        }
        if (units.length > 0) {
          result.chapters.push({ name: chapterName, units })
        }
      }
      if (result.chapters.length === 0) {
        throw new Error('AI 未返回任何有效章节')
      }
      return result
    }

    if (!parsed || !Array.isArray(parsed.units)) {
      throw new Error('AI 返回格式异常：缺少 units 数组')
    }

    // 验证返回结构
    const result = { units: [] }
    for (const u of parsed.units) {
      if (!u.name || typeof u.name !== 'string') continue
      const unitName = String(u.name).trim().slice(0, 16)
      if (!unitName) continue
      const cardIndices = Array.isArray(u.cardIndices) ? u.cardIndices : []
      const knowledgePoints = []
      if (Array.isArray(u.knowledgePoints)) {
        for (const kp of u.knowledgePoints) {
          knowledgePoints.push({
            content: String(kp.content || kp.name || '').trim().slice(0, 200),
          })
        }
      }
      result.units.push({ name: unitName, cardIndices: cardIndices.filter(i => typeof i === 'number' && i >= 0 && i < allCards.length), knowledgePoints })
    }

    if (result.units.length === 0) {
      throw new Error('AI 未返回任何有效单元')
    }

    return result
  } catch (e) {
    if (e.message && !e.message.includes('AI')) {
      throw new Error('AI 单元整理失败: ' + (e.message || e))
    }
    throw e
  }
}

function buildReorganizePrompt(categoryName, allCards, existingUnitNames, existingChapters, useFullHierarchy = false) {
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

  if (useFullHierarchy) {
    return `你是考研科目的知识体系整理助手。请对分类"${categoryName}"下的所有卡片进行完整知识体系层级规划。

【任务】：
阅读下面所有卡片的内容（原始知识点），将卡片按知识体系逻辑划分为：主题 → 章节 → 单元 → 知识点 → 卡片，并为每个层级起一个概括性名称。

【划分原则】：
1. 主题是最高粒度的知识模块，代表学科的主要领域（如"数据结构"、"操作系统"），每个主题包含 1-5 个章节
2. 章节是中等粒度的知识模块，每个章节包含 2-5 个相关的单元；当卡片数量较多时可扩展至 2-10 个单元
3. 单元是较宽泛的知识板块，每个单元包含 2-50 张卡片
4. 知识点是具体的知识条目，从卡片内容中提取
5. 主题名称不超过 20 字，章节名称不超过 12 字，单元名称不超过 16 字，知识点不超过 200 字
6. 确保所有卡片都被分配到某个主题的某个章节的某个单元中，不要遗漏任何卡片

${chapterHint}
${existingHint}

【所有卡片（共 ${allCards.length} 张）】：
${cardLines.join('\n')}

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "topics": [
    {
      "name": "主题名称（不超过 20 字）",
      "chapters": [
        {
          "name": "章节名称（不超过 12 字）",
          "units": [
            {
              "name": "单元名称（不超过 16 字）",
              "cardIndices": [0, 3, 5, ...],
              "knowledgePoints": [
                { "content": "知识点内容" },
                ...
              ]
            },
            ...
          ]
        },
        ...
      ],
      "units": [
        {
          "name": "直接属于主题的单元（不超过 16 字）",
          "cardIndices": [1, 2, ...],
          "knowledgePoints": []
        }
      ]
    },
    ...
  ]
}
注意：cardIndices 是卡片在输入列表中的下标（从 0 开始），每张卡片必须属于且仅属于一个单元。`
  }

  if (hasChapters) {
    return `你是考研科目的知识体系整理助手。请对分类"${categoryName}"下的所有卡片进行章节+单元重新规划。

【任务】：
阅读下面所有卡片的内容（原始知识点），将卡片按知识体系逻辑重新划分为若干章节和单元，并为每个章节和单元起一个概括性名称。

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
          "cardIndices": [0, 3, 5, ...],
          "knowledgePoints": [
            { "content": "知识点内容" },
            ...
          ]
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

【任务】：
阅读下面所有卡片的内容（原始知识点），将卡片按知识体系逻辑重新划分为若干学习单元，并为每个单元起一个概括性名称。

【划分原则】：
1. 每个单元是一个较宽泛的知识板块（如"数据结构基础"、"操作系统进程管理"），不要过于细碎
2. 每个单元包含 2-50 张卡片，确保分类不过于零散
3. 单元名称使用概括性命名（如"摩擦力"而非"影响滑动摩擦力的因素"），便于后续卡片归入
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
      "cardIndices": [0, 3, 5, ...],
      "knowledgePoints": [
        { "content": "知识点内容" },
        ...
      ]
    },
    ...
  ]
}
注意：cardIndices 是卡片在输入列表中的下标（从 0 开始），每张卡片必须属于且仅属于一个单元。`
}

export async function generateCards(text, apiKey, model, aiServiceMode, summaryLevel, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey) {
  const startTime = Date.now()
  try {
    let result
    if (aiServiceMode === 'iflytek-spark') {
      result = await generateCardsWithSpark(text, sparkApiKey, sparkApiSecret, model, summaryLevel)
    } else if (aiServiceMode === 'volcano') {
      result = await generateCardsWithVolcano(text, volcanoApiKey, model, summaryLevel)
    } else if (aiServiceMode === 'dashscope') {
      result = await generateCardsWithDashscope(text, dashscopeApiKey, model, summaryLevel)
    } else if (aiServiceMode === 'pc-engine') {
      const prompt = `请根据以下知识点生成 ${summaryLevel} 张学习卡片，返回 JSON 数组`
      const pcResult = await callPcEngineAi([{ role: 'user', content: prompt + '\n\n' + text }], { temperature: 0.7 })
      if (pcResult) {
        result = { content: pcResult.content }
      } else {
        result = await dsGenerateCards(text, apiKey, model, summaryLevel)
      }
    }
    logAiCall({
      purpose: 'card-generation',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens,
      prompt: text,
      response: content,
    })
    return content
  } catch (err) {
    logAiCall({
      purpose: 'card-generation',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: text,
      response: '',
    })
    throw err
  }
}

export async function extractTextFromImage(base64Image, apiKey, aiServiceMode, model, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey, ocrOptions = {}, visionAiOptions = {}) {
  const startTime = Date.now()
  // ocrOptions: { ocrEngine, paddleocrServerUrl, paddleocrApiToken, paddleocrLanguage, baiduOcrApiKey, baiduOcrSecretKey }
  // visionAiOptions: { visionAiUrl, visionAiKey, visionAiModel } — 当配置了独立通用AI视觉时优先使用
  const ocrEngine = ocrOptions.ocrEngine || 'ai-model'
  const engineLabel =
    ocrEngine === 'tesseract-js' ? 'Tesseract.js' :
    ocrEngine === 'paddleocr-server' ? 'PaddleOCR' :
    ocrEngine === 'paddleocr-local' ? 'PaddleOCR-Local' :
    ocrEngine === 'baidu-cloud' ? 'BaiduCloudOCR' :
    getModelName(aiServiceMode, model)

  // 独立 OCR 引擎分支
  if (ocrEngine === 'tesseract-js') {
    try {
      const tesseractLang = ocrOptions.tesseractLanguage || 'chi_sim+eng'
      const result = await extractTextWithTesseract(base64Image, tesseractLang)
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens || 0,
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ', 语言: ' + tesseractLang + ')',
        response: result.content,
      })
      return result.content
    } catch (err) {
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: '',
      })
      throw err
    }
  }
  if (ocrEngine === 'paddleocr-local') {
    try {
      const result = await extractTextWithPaddleOcrLocal(base64Image)
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens || 0,
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: result.content,
      })
      return result.content
    } catch (err) {
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: '',
      })
      throw err
    }
  }
  if (ocrEngine === 'paddleocr-server') {
    try {
      const result = await extractTextWithPaddleOcr(
        base64Image,
        ocrOptions.paddleocrServerUrl,
        ocrOptions.paddleocrApiToken,
        ocrOptions.paddleocrLanguage,
      )
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens || 0,
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: result.content,
      })
      return result.content
    } catch (err) {
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: '',
      })
      throw err
    }
  }
  if (ocrEngine === 'baidu-cloud') {
    try {
      const result = await extractTextWithBaiduOcr(
        base64Image,
        ocrOptions.baiduOcrApiKey,
        ocrOptions.baiduOcrSecretKey,
      )
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens || 0,
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: result.content,
      })
      return result.content
    } catch (err) {
      logAiCall({
        purpose: 'image-ocr',
        modelName: engineLabel,
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: '',
      })
      throw err
    }
  }

  // 通用AI视觉优先（当用户配置了独立视觉AI时）
  const { visionAiUrl, visionAiKey, visionAiModel } = visionAiOptions
  if (visionAiUrl && visionAiKey && visionAiModel) {
    try {
      const result = await extractTextWithVisionAi(base64Image, visionAiUrl, visionAiKey, visionAiModel)
      const { content, tokens } = result
      logAiCall({
        purpose: 'image-ocr',
        modelName: visionAiModel + ' (通用AI视觉)',
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens,
        prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
        response: content,
      })
      return content
    } catch (err) {
      // 通用AI视觉失败后降级到主AI服务
      console.warn('[vision-ai] 通用AI视觉失败，降级到主AI服务:', err.message)
    }
  }

  // 默认：AI 大模型视觉
  try {
    let result
    if (aiServiceMode === 'iflytek-spark') {
      result = await extractTextFromImageWithSpark(base64Image, sparkApiKey, sparkApiSecret, model)
    } else if (aiServiceMode === 'volcano') {
      result = await extractTextFromImageWithVolcano(base64Image, volcanoApiKey, model)
    } else if (aiServiceMode === 'dashscope') {
      result = await extractTextFromImageWithDashscope(base64Image, dashscopeApiKey, model)
    } else {
      result = await dsExtractTextFromImage(base64Image, apiKey)
    }
    const { content, tokens } = result
    logAiCall({
      purpose: 'image-ocr',
      modelName: engineLabel,
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens,
      prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
      response: content,
    })
    return content
  } catch (err) {
    logAiCall({
      purpose: 'image-ocr',
      modelName: engineLabel,
      durationMs: Date.now() - startTime,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: '(图片 base64, 长度: ' + (base64Image?.length || 0) + ')',
      response: '',
    })
    throw err
  }
}

export async function testAiConnection(apiKey, aiServiceMode, model, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey) {
  const startTime = Date.now()
  try {
    let result
    if (aiServiceMode === 'iflytek-spark') {
      result = await testSparkConnection(sparkApiKey, sparkApiSecret, model)
    } else if (aiServiceMode === 'volcano') {
      result = await testVolcanoConnection(volcanoApiKey, model)
    } else if (aiServiceMode === 'dashscope') {
      result = await testDashscopeConnection(dashscopeApiKey, model)
    } else {
      result = await dsTestApiConnection(apiKey)
    }
    const isOk = result && result.ok === true
    const tokens = result?.tokens || 0
    logAiCall({
      purpose: 'connection-test',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: isOk ? 'success' : 'error',
      tokens,
      errorMessage: isOk ? '' : (result?.message || '连接失败'),
      prompt: '连接测试',
      response: isOk ? (result?.message || '连接成功') : (result?.message || JSON.stringify(result)),
    })
    return result
  } catch (err) {
    logAiCall({
      purpose: 'connection-test',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: '连接测试',
      response: '',
    })
    throw err
  }
}

export async function regenerateCard(knowledgePoint, apiKey, aiServiceMode, model, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey, summaryLevel) {
  const startTime = Date.now()
  try {
    let result
    if (aiServiceMode === 'iflytek-spark') {
      result = await regenerateCardFromKnowledgePointWithSpark(knowledgePoint, sparkApiKey, sparkApiSecret, model, summaryLevel)
    } else if (aiServiceMode === 'volcano') {
      result = await regenerateCardFromKnowledgePointWithVolcano(knowledgePoint, volcanoApiKey, model, summaryLevel)
    } else if (aiServiceMode === 'dashscope') {
      result = await regenerateCardFromKnowledgePointWithDashscope(knowledgePoint, dashscopeApiKey, model, summaryLevel)
    } else {
      result = await regenerateCardFromKnowledgePoint(knowledgePoint, apiKey, model, summaryLevel)
    }
    const tokens = result?.tokens || 0
    logAiCall({
      purpose: 'card-generation',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens,
      prompt: knowledgePoint || '',
      response: JSON.stringify(result),
    })
    return result
  } catch (err) {
    logAiCall({
      purpose: 'card-generation',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: knowledgePoint || '',
      response: '',
    })
    throw err
  }
}

export async function generateTestQuestions(prompt, config, maxTokens = 4096) {
  const { apiKey, model, aiServiceMode, sparkModel, sparkApiKey, volcanoApiKey, dashscopeApiKey } = config
  const body = {
    model: model || 'deepseek-v4-pro',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: maxTokens,
  }

  try {
    let result
    if (aiServiceMode === 'iflytek-spark') {
      const password = normalizeSparkApiPassword(sparkApiKey)
      if (!password) throw new Error('Spark: 未填写 APIPassword')
      const resp = await httpPost(SPARK_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
        data: { ...body, model: sparkModel || 'lite', max_tokens: 2048 },
        timeout: 60000,
      })
      if (!resp.ok) {
        const errData = resp.data || {}
        const msg = (errData.error && typeof errData.error === 'string')
          ? errData.error
          : (errData.error?.message || errData.message || '请求失败')
        throw new Error('Spark: ' + msg)
      }
      result = resp.data?.choices?.[0]?.message?.content || ''
      if (!result) throw new Error('Spark: 未返回有效内容')
    } else if (aiServiceMode === 'volcano') {
      const key = (volcanoApiKey || '').trim()
      if (!key) throw new Error('Volcano: 未填写 API Key')
      const resp = await httpPost(VOLCANO_ENGINE_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        data: { ...body, model: model || 'doubao-pro-32k' },
        timeout: 60000,
      })
      if (!resp.ok) {
        const errData = resp.data || {}
        const msg = (errData.error && typeof errData.error === 'string')
          ? errData.error
          : (errData.error?.message || errData.message || '请求失败')
        throw new Error('Volcano: ' + msg)
      }
      result = resp.data?.choices?.[0]?.message?.content || ''
      if (!result) throw new Error('Volcano: 未返回有效内容')
    } else if (aiServiceMode === 'dashscope') {
      const key = (dashscopeApiKey || '').trim()
      if (!key) throw new Error('Dashscope: 未填写 API Key')
      const resp = await httpPost(DASHSCOPE_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        data: { ...body, model: model || 'qwen3.5-plus-2026-04-20' },
        timeout: 60000,
      })
      if (!resp.ok) {
        const errData = resp.data || {}
        const msg = (errData.error && typeof errData.error === 'string')
          ? errData.error
          : (errData.error?.message || errData.message || '请求失败')
        throw new Error('Dashscope: ' + msg)
      }
      result = resp.data?.choices?.[0]?.message?.content || ''
      if (!result) throw new Error('Dashscope: 未返回有效内容')
    } else if (aiServiceMode === 'pc-engine') {
      const pcResult = await callPcEngineAi([{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 4096 })
      if (pcResult) {
        result = pcResult.content
      }
    } else {
      // DeepSeek
      const key = (apiKey || '').trim()
      if (!key) throw new Error('DeepSeek: 未填写 API Key')
      const resp = await httpPost(DEEPSEEK_API_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        data: body,
        timeout: 60000,
      })
      if (!resp.ok) {
        const errData = resp.data || {}
        const msg = (errData.error && typeof errData.error === 'string')
          ? errData.error
          : (errData.error?.message || errData.message || '请求失败')
        throw new Error('DeepSeek: ' + msg)
      }
      result = resp.data?.choices?.[0]?.message?.content || ''
      if (!result) throw new Error('DeepSeek: 未返回有效内容')
    }
    // 注意：test-question-generation 的日志由 testQuestionService 层的 executeTask 记录
    return result
  } catch (err) {
    // 注意：test-question-generation 的日志由 testQuestionService 层的 executeTask 记录
    throw err
  }
}

/**
 * 基于本分类下所有单元和卡片内容，让 AI 把新卡片归类到合适的单元
 */
// ===== 两步生成：Step 1 —— 知识点提取 =====
// categoryPurpose: 分类目的（如"考研"、"计算机408"），用于让 AI 生成符合学习目的的知识点
export async function extractKnowledgePoints(text, unitNames, config, onProgress, categoryPurpose, prompt) {
  const { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey } = config
  const startTime = Date.now()
  const unitContext = unitNames && unitNames.length > 0
    ? '\n本分类的单元信息（共' + unitNames.length + '个）：\n' + unitNames.map((n, i) => '  ' + (i + 1) + '. ' + n).join('\n')
    : ''

  // 判断是否为弱模型（讯飞 Spark Lite）
  const isWeakSpark = aiServiceMode === 'iflytek-spark' && (!model || model === 'lite')
  // 弱模型用更小的 MAX_TEXT_LENGTH，避免单批超出模型上下文窗口
  // 同时避免弱模型在长文本中过度归纳压缩
  const MAX_TEXT_LENGTH = isWeakSpark ? 3000 : 5000

  // 弱模型使用简化 prompt，避免过度归纳压缩
  const basePrompt = isWeakSpark ? KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK : KNOWLEDGE_POINT_EXTRACTION_PROMPT
  
  // 根据提示前缀调整提取策略
  const promptDirective = prompt ? `\n【处理模式】${prompt}：请按照此模式处理文本` : ''
  
  // 替换 prompt 中的占位符
  const effectivePurpose = categoryPurpose || ''
  const purposeLabel = effectivePurpose || '知识'
  const purposeConstraint = effectivePurpose
    ? `【学习目的约束】本分类的学习目的为：${effectivePurpose}。请围绕此目的提炼最相关的知识点，忽略与学习目的无关的内容。`
    : ''
  const promptWithPurpose = basePrompt
    .replace(/\{\{categoryPurpose\}\}/g, purposeLabel)
    .replace(/\{\{purposeConstraint\}\}/g, purposeConstraint) + promptDirective

  if (!text || typeof text !== 'string') {
    return { content: JSON.stringify({ knowledge_points: [] }), tokens: 0 }
  }

  if (text.length <= MAX_TEXT_LENGTH) {
    const prompt = promptWithPurpose + unitContext + '\n\n待处理内容：\n' + text

    try {
      const result = await callAiProvider(prompt, { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey, maxTokens: isWeakSpark ? 8192 : 4096 })
      logAiCall({
        purpose: 'knowledge-point-extraction',
        modelName: getModelName(aiServiceMode, model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens,
        prompt: text,
        response: result.content,
      })

      // 数量校验：检查返回的知识点数量是否合理
      const validationResult = validateKnowledgePointCount(result.content, text, isWeakSpark)
      if (validationResult.warning) {
        console.warn('[extractKnowledgePointCount]', validationResult.warning)
      }

      return result
    } catch (err) {
      logAiCall({
        purpose: 'knowledge-point-extraction',
        modelName: getModelName(aiServiceMode, model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: text,
        response: '',
      })
      throw err
    }
  }

  const chunks = splitTextIntoChunks(text, MAX_TEXT_LENGTH)
  const allResults = []
  let totalTokens = 0

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]
    const prompt = promptWithPurpose + unitContext + '\n\n待处理内容（第' + (chunkIndex + 1) + '/' + chunks.length + '部分）：\n' + chunk

    try {
      const result = await callAiProvider(prompt, { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey, maxTokens: isWeakSpark ? 8192 : 4096 })
      totalTokens += result.tokens || 0
      allResults.push(result.content)

      if (typeof onProgress === 'function') {
        onProgress({
          step: 'extract-kp',
          current: chunkIndex + 1,
          total: chunks.length,
          message: `正在提取知识点... ${chunkIndex + 1}/${chunks.length}`,
        })
      }
    } catch (err) {
      logAiCall({
        purpose: 'knowledge-point-extraction',
        modelName: getModelName(aiServiceMode, model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: chunk,
        response: '',
      })
      throw err
    }
  }

  const mergedContent = mergeKnowledgePointResults(allResults)
  logAiCall({
    purpose: 'knowledge-point-extraction',
    modelName: getModelName(aiServiceMode, model),
    durationMs: Date.now() - startTime,
    status: 'success',
    tokens: totalTokens,
    prompt: text,
    response: mergedContent,
  })

  // 数量校验：检查返回的知识点数量是否合理
  const validationResult = validateKnowledgePointCount(mergedContent, text, isWeakSpark)
  if (validationResult.warning) {
    console.warn('[extractKnowledgePointCount]', validationResult.warning)
  }

  // 质量检测：对提取的知识点进行全面质量评估
  try {
    const parsed = extractJsonFromAiResponse(mergedContent, aiServiceMode)
    const kpList = parsed.json?.knowledge_points || []
    const qualityResult = checkKnowledgePointsQuality(kpList)
    if (!qualityResult.valid) {
      console.warn('[extractKnowledgePoints] 知识点质量检测发现错误:', qualityResult.issues)
    }
    if (qualityResult.issues.length > 0) {
      qualityResult.issues.forEach(issue => {
        if (issue.severity === 'error') {
          console.error(`[KP Quality] ${issue.code}: ${issue.message}`)
        } else {
          console.warn(`[KP Quality] ${issue.code}: ${issue.message}`)
        }
      })
    }
  } catch (err) {
    console.warn('[extractKnowledgePoints] 质量检测解析失败:', err.message)
  }

  return { content: mergedContent, tokens: totalTokens }
}

/**
 * 根据知识点内容，通过 AI 生成分类目的
 * 仅在分类目的为空时调用
 * @param {string[]} knowledgePoints - 知识点列表
 * @param {Object} aiConfig - AI 配置
 * @returns {Promise<string>} 生成的分类目的
 */
export async function generateCategoryPurpose(knowledgePoints, aiConfig) {
  const { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey } = aiConfig
  const sampleKps = knowledgePoints.slice(0, 10).map((kp, i) => `${i + 1}. ${kp}`).join('\n')
  const prompt = CATEGORY_PURPOSE_GENERATION_PROMPT + '\n\n知识点列表：\n' + sampleKps

  try {
    const result = await callAiProvider(prompt, {
      apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey,
      maxTokens: 100,
    })
    const purpose = result.content?.trim() || ''
    return purpose
  } catch (err) {
    console.warn('[generateCategoryPurpose] 生成失败:', err.message)
    return ''
  }
}

/**
 * AI 直接选单元（方案 A：真正的 AI 分类）
 * 给 AI 提供「预期章节+单元」完整列表（编号化），AI 为每张卡片直接选择归属的章节编号和单元编号
 *
 * 优化策略（2026-06-21）：
 * 1. 两步分类法：强模型先按章节分组，再在章节内细分单元，避免跨章节名称相似单元混淆
 * 2. 增强 prompt：要求 AI 先分析每个单元的主题范围，再进行分类
 * 3. 增加分类示例：针对容易混淆的单元提供更多示例
 * 4. 明确区分提示：在 prompt 中明确提示名称相似单元的区别
 *
 * @param {Array} cards - 待分类卡片数组，每张卡片需有 id 和 knowledge_point/front
 * @param {Array} expectedStructure - 预期结构 [{ chapter, units: [unitName, ...] }, ...]
 * @param {object} aiConfig - AI 配置
 * @returns {Promise<Array>} 分类结果 [{ index, chapterCode, unitCode }, ...]
 */
export async function classifyCardsByExpectedUnits(cards, expectedStructure, aiConfig) {
  const { aiServiceMode } = aiConfig
  const isWeakModel = aiServiceMode === 'iflytek-spark'
  // 混合策略：强模型一次性分类所有卡片（保持上下文一致性），弱模型分批分类
  // 注意：分批分类会导致跨批次的知识点无法比较，AI 在不同批次中可能做出不一致的分类决策
  // 弱模型批次大小动态调整：根据卡片总数和章节数量自适应
  const totalUnits = expectedStructure.reduce((sum, item) => sum + item.units.length, 0)
  const baseBatchSize = Math.max(10, Math.min(30, Math.floor(cards.length / Math.max(1, totalUnits / 5))))
  const batchSize = isWeakModel ? baseBatchSize : cards.length
  const classifications = []

  // 构建编号化的结构文本和映射
  const chapterCodeMap = {}   // 'C1' -> 章节名
  const unitCodeMap = {}      // 'U1' -> 单元名
  const chapterUnitMap = {}   // 'C1' -> ['U1', 'U2', ...] 该章节下的单元编号列表
  const structureLines = []
  let chapterIdx = 1
  let unitIdx = 1
  for (const item of expectedStructure) {
    const chCode = `C${chapterIdx}`
    chapterCodeMap[chCode] = item.chapter
    chapterUnitMap[chCode] = []
    structureLines.push(`[${chCode}] ${item.chapter}`)
    for (const u of item.units) {
      const uCode = `U${unitIdx}`
      unitCodeMap[uCode] = u
      chapterUnitMap[chCode].push(uCode)
      structureLines.push(`  [${uCode}] ${u}`)
      unitIdx++
    }
    chapterIdx++
  }
  const structureText = structureLines.join('\n')

  // 强模型采用两步分类法：先分类章节，再在章节内分类单元
  // 这样可以避免跨章节名称相似单元的混淆
  // 注意：经过测试，两步分类法反而降低了准确率（第一步章节分类错误会传播）
  // 因此强模型仍然使用单步分类法，但通过优化 prompt 来解决名称相似单元的混淆问题
  // if (!isWeakModel && cards.length > 20 && Object.keys(chapterCodeMap).length > 1) {
  //   return await classifyCardsByExpectedUnitsTwoStep(
  //     cards, expectedStructure, aiConfig,
  //     { chapterCodeMap, unitCodeMap, chapterUnitMap, structureText }
  //   )
  // }

  for (let batchStart = 0; batchStart < cards.length; batchStart += batchSize) {
    const batchCards = cards.slice(batchStart, batchStart + batchSize)
    const batchLines = batchCards.map((c, i) => `${batchStart + i}. ${c.knowledge_point || c.front || ''}`).join('\n')

    const prompt = `你是知识点分类专家。请将以下知识点归类到最合适的章节和单元中。

【可选章节和单元列表】（必须从以下列表中选择，不可自创）
${structureText}

【分类步骤】
1. 先分析每个章节和单元的主题范围（基于章节名和单元名的完整语义，而非表面关键词）
2. 对每个知识点，先确定其核心主题（知识点主要讲什么），再匹配最合适的章节
3. 在章节内，根据单元名的完整语义选择最合适的单元
4. 注意区分名称相似的单元，根据单元名的完整语义和章节上下文判断正确归属

【单元主题分析原则】
- 单元名通常由多个关键词组成，需要理解完整语义而非单个关键词
- 例如："数据结构与多媒体信息编码"关注的是"数据结构"和"多媒体信息的编码方式"（包括音频、图像、视频、字符编码、信号数字化、数据压缩等），是一个综合性的信息编码单元
- 例如："计算机数制与信息编码"关注的是"数制"（二进制、十六进制等进制及其运算规则）和"数制转换"，侧重于数字进制的表示和运算
- 例如："外部设备与总线接口硬件"关注的是"硬件设备"和"接口"（如显示器、打印机、USB接口、总线），而非"信号处理"或"图像格式"
- 当知识点涉及"编码"、"格式"、"信号"等通用词时，需要根据上下文判断是属于"多媒体信息编码"还是"数制与信息编码"

【区分名称相似单元的关键原则】
1. "字符编码"（如 Unicode、ASCII、汉字编码、输入码/机内码/字形码）属于"多媒体信息编码"相关单元，而非"数制"单元
2. "进制运算"（如二进制加法、十六进制转换）属于"数制"相关单元
3. "信号处理"（如模拟信号、数字信号、采样、量化）属于"多媒体信息编码"相关单元，而非"硬件"单元
4. "图像/音频/视频格式"（如 JPG、PNG、MP3、位图、矢量图）属于"多媒体信息编码"相关单元，而非"硬件"单元
5. "存储单位"（如字节、位、KB、MB）属于"数制"相关单元
6. 判断依据：知识点的核心内容是"信息如何编码表示"还是"数字如何运算转换"

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制" → 章节 C1，单元 U1
知识点："函数三要素：定义域、对应法则、值域" → 章节 C3，单元 U5
知识点："导数几何意义：函数某点导数，对应函数图像该点切线斜率" → 章节 C4，单元 U8
知识点："Unicode编码：万国统一字符编码，兼容全球各国文字" → 根据章节上下文和单元主题分析选择最合适的单元
知识点："十六进制常用标识：后缀H标识，0-9、A-F共计16个数码" → 根据章节上下文和单元主题分析选择最合适的单元
知识点："音频数字化四步骤：采样、量化、编码、压缩" → 根据章节上下文和单元主题分析选择最合适的单元

【待分类知识点】（共${batchCards.length}个）
${batchLines}

【输出要求】
为每个知识点选择最合适的章节编号和单元编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"chapter":"C1","unit":"U1"}]}

注意：
1. chapter 必须是 C1、C2 等章节编号，unit 必须是 U1、U2 等单元编号
2. 编号必须从上面的列表中选择，不可自创
3. 每个知识点必须分配到一个单元
4. 不能遗漏任何知识点
5. index 是知识点在列表中的索引（从${batchStart}开始）
6. 请仔细阅读知识点内容，根据内容主题选择最合适的单元
7. 注意：不同章节下可能有名称相似的单元，请根据单元名的完整语义和章节上下文判断正确归属
8. 优先匹配知识点的核心主题，而非表面关键词
9. 当知识点涉及音频、图像、视频、字符编码、信号数字化、数据压缩等多媒体信息时，优先考虑"多媒体信息编码"相关单元，而非"硬件"或"数制"单元
10. 当知识点涉及进制转换、进制运算（二进制、十六进制等）时，优先考虑"数制"相关单元
11. 当知识点涉及存储单位（字节、位、KB、MB等）时，优先考虑"数制"相关单元`

    try {
      const result = await callAiProvider(prompt, {
        ...aiConfig,
        maxTokens: isWeakModel ? 8192 : 8192,
        temperature: 0.3,
      })

      const content = result.content || ''
      // JSON 解析（含多重修复）
      let parsed
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('没有找到 JSON')
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        const fixedJson = content
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/'([^']*)'(\s*:)/g, '"$1"$2')
          .replace(/'([^']*)'/g, '"$1"')
          .replace(/(\w+)\s*:/g, '"$1":')
        const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          console.warn(`[classifyCardsByExpectedUnits] 批次 ${batchStart} JSON 修复失败`)
          continue
        }
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch (e2) {
          console.warn(`[classifyCardsByExpectedUnits] 批次 ${batchStart} JSON 修复后仍失败: ${e2.message}`)
          continue
        }
      }

      for (const c of parsed.classifications || []) {
        classifications.push({
          index: batchSize === 1 ? batchStart : c.index,
          chapterCode: c.chapter,
          unitCode: c.unit,
        })
      }
    } catch (err) {
      console.warn(`[classifyCardsByExpectedUnits] 批次 ${batchStart} 调用失败:`, err.message)
    }
  }

  // ===== 混合策略：置信度检测 - 对名称相似单元的知识点进行二次确认 =====
  // 经过测试，置信度检测反而降低了准确率（把字符编码错误地改到"多媒体信息编码"单元）
  // 因此禁用置信度检测，仅依靠优化后的 prompt 进行分类
  /*
  // 仅对强模型启用，检测被分到"计算机数制与信息编码"或"数据结构与多媒体信息编码"的知识点
  if (!isWeakModel) {
    const targetUnitNames = ['计算机数制与信息编码', '数据结构与多媒体信息编码']
    const targetUnitCodes = Object.entries(unitCodeMap)
      .filter(([_, name]) => targetUnitNames.includes(name))
      .map(([code, _]) => code)

    if (targetUnitCodes.length === 2) {

      // 收集需要二次确认的知识点
      const needConfirm = classifications.filter(c =>
        targetUnitCodes.includes(c.unitCode)
      )

      if (needConfirm.length > 0) {

        // 构建二次确认的 prompt
        const confirmLines = needConfirm.map((c, i) => {
          const card = cards[c.index]
          const kp = card ? (card.knowledge_point || card.front || '') : ''
          const currentUnit = unitCodeMap[c.unitCode]
          return `${i}. (当前分类: ${currentUnit}) ${kp}`
        }).join('\n')

        const confirmPrompt = `你是知识点分类专家。请对以下知识点进行二次确认分类。

【任务说明】
以下知识点被分到了"计算机数制与信息编码"或"数据结构与多媒体信息编码"单元。请根据知识点的核心内容，重新判断它应该属于哪个单元。

【两个单元的主题区别】
- "数据结构与多媒体信息编码"：关注信息如何编码表示，包括字符编码（Unicode、ASCII、汉字编码）、音频/图像/视频编码、信号数字化、数据压缩等
- "计算机数制与信息编码"：关注数字进制的表示和运算，包括二进制/十六进制等进制、进制转换、进制运算规则等

【区分原则】
1. 如果知识点核心是"字符如何编码"（如 Unicode、ASCII、汉字编码、输入码/机内码/字形码），归入"数据结构与多媒体信息编码"
2. 如果知识点核心是"数字如何运算"（如二进制加法、十六进制转换、进制运算规则），归入"计算机数制与信息编码"
3. 如果知识点核心是"信号/音频/图像处理"（如模拟信号、数字信号、采样、量化、图像格式），归入"数据结构与多媒体信息编码"
4. 如果知识点核心是"存储单位"（如字节、位、KB、MB），归入"计算机数制与信息编码"

【可选单元】
${targetUnitCodes.map(code => `[${code}] ${unitCodeMap[code]}`).join('\n')}

【待确认知识点】（共${needConfirm.length}个）
${confirmLines}

【输出要求】
为每个知识点选择最合适的单元编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"unit":"U1"}]}

注意：
1. unit 必须是 ${targetUnitCodes.join(' 或 ')}
2. index 是知识点在本次列表中的索引（从0开始）
3. 请仔细阅读知识点内容，根据核心主题选择最合适的单元`

        try {
          const result = await callAiProvider(confirmPrompt, {
            ...aiConfig,
            maxTokens: 8192,
            temperature: 0.3,
          })
          const content = result.content || ''
          let parsed
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            if (!jsonMatch) throw new Error('没有找到 JSON')
            parsed = JSON.parse(jsonMatch[0])
          } catch (e) {
            const fixedJson = content
              .replace(/\/\/.*$/gm, '')
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/,(\s*[}\]])/g, '$1')
              .replace(/'([^']*)'(\s*:)/g, '"$1"$2')
              .replace(/'([^']*)'/g, '"$1"')
              .replace(/(\w+)\s*:/g, '"$1":')
            const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
              console.warn(`[classifyCardsByExpectedUnits] 置信度检测 JSON 修复失败，保留原分类`)
            } else {
              try {
                parsed = JSON.parse(jsonMatch[0])
              } catch (e2) {
                console.warn(`[classifyCardsByExpectedUnits] 置信度检测 JSON 修复后仍失败: ${e2.message}，保留原分类`)
              }
            }
          }

          if (parsed && parsed.classifications) {
            let confirmed = 0
            for (const c of parsed.classifications) {
              const original = needConfirm[c.index]
              if (original && targetUnitCodes.includes(c.unit)) {
                // 更新分类结果
                const idx = classifications.findIndex(item =>
                  item.index === original.index && item.unitCode === original.unitCode
                )
                if (idx >= 0) {
                  classifications[idx].unitCode = c.unit
                  confirmed++
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[classifyCardsByExpectedUnits] 置信度检测调用失败:`, err.message, '，保留原分类')
        }
      }
    }
  }
  */

  return { classifications, chapterCodeMap, unitCodeMap }
}

/**
 * 两步分类法（强模型专用）：
 * 1. 第一步：AI 将所有卡片分配到章节（C1, C2, ...）
 * 2. 第二步：对每个章节，AI 在该章节的单元中细分卡片
 *
 * 这种方法可以避免跨章节名称相似单元的混淆（如"数据结构与多媒体信息编码" vs "计算机数制与信息编码"）
 *
 * @param {Array} cards - 待分类卡片
 * @param {Array} expectedStructure - 预期结构
 * @param {object} aiConfig - AI 配置
 * @param {object} maps - 编号映射 { chapterCodeMap, unitCodeMap, chapterUnitMap, structureText }
 * @returns {Promise<object>} 分类结果
 */
async function classifyCardsByExpectedUnitsTwoStep(cards, expectedStructure, aiConfig, maps) {
  const { chapterCodeMap, unitCodeMap, chapterUnitMap } = maps
  const classifications = []


  // ===== 第一步：将卡片分配到章节 =====
  const chapterLines = Object.entries(chapterCodeMap).map(([code, name]) => `[${code}] ${name}`).join('\n')
  const cardLines = cards.map((c, i) => `${i}. ${c.knowledge_point || c.front || ''}`).join('\n')

  const step1Prompt = `你是知识点分类专家。请将以下知识点归类到最合适的章节中。

【可选章节列表】（必须从以下列表中选择，不可自创）
${chapterLines}

【分类步骤】
1. 先分析每个章节的主题范围（基于章节名的语义）
2. 仔细阅读知识点内容，根据内容主题选择最合适的章节
3. 注意：不同章节可能有相似的主题，请根据章节名的完整语义判断

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制" → 章节 C1
知识点："函数三要素：定义域、对应法则、值域" → 章节 C3
知识点："导数几何意义：函数某点导数，对应函数图像该点切线斜率" → 章节 C4

【待分类知识点】（共${cards.length}个）
${cardLines}

【输出要求】
为每个知识点选择最合适的章节编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"chapter":"C1"}]}

注意：
1. chapter 必须是 C1、C2 等章节编号
2. 编号必须从上面的列表中选择，不可自创
3. 每个知识点必须分配到一个章节
4. 不能遗漏任何知识点
5. index 是知识点在列表中的索引（从0开始）
6. 请仔细阅读知识点内容，根据内容主题选择最合适的章节`

  let chapterAssignments = {}  // { chapterCode: [cardIndex, ...] }

  try {
    const result = await callAiProvider(step1Prompt, {
      ...aiConfig,
      maxTokens: 8192,
      temperature: 0.3,
    })

    const content = result.content || ''
    let parsed
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('没有找到 JSON')
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      const fixedJson = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/'([^']*)'(\s*:)/g, '"$1"$2')
        .replace(/'([^']*)'/g, '"$1"')
        .replace(/(\w+)\s*:/g, '"$1":')
      const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[classifyCardsByExpectedUnitsTwoStep] 第一步 JSON 修复失败`)
        // 降级到单步分类
        return await classifyCardsByExpectedUnitsSingleStep(cards, expectedStructure, aiConfig, maps)
      }
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch (e2) {
        console.warn(`[classifyCardsByExpectedUnitsTwoStep] 第一步 JSON 修复后仍失败: ${e2.message}`)
        return await classifyCardsByExpectedUnitsSingleStep(cards, expectedStructure, aiConfig, maps)
      }
    }

    // 按章节分组
    for (const c of parsed.classifications || []) {
      if (!chapterAssignments[c.chapter]) chapterAssignments[c.chapter] = []
      chapterAssignments[c.chapter].push(c.index)
    }


  } catch (err) {
    console.warn(`[classifyCardsByExpectedUnitsTwoStep] 第一步调用失败:`, err.message)
    // 降级到单步分类
    return await classifyCardsByExpectedUnitsSingleStep(cards, expectedStructure, aiConfig, maps)
  }

  // ===== 第二步：对每个章节，在章节内的单元中细分卡片 =====
  for (const [chapterCode, cardIndices] of Object.entries(chapterAssignments)) {
    const chapterName = chapterCodeMap[chapterCode]
    const unitCodes = chapterUnitMap[chapterCode] || []

    if (unitCodes.length === 0) {
      console.warn(`[classifyCardsByExpectedUnitsTwoStep] 章节 ${chapterCode} 没有单元`)
      continue
    }

    if (unitCodes.length === 1) {
      // 只有一个单元，直接分配
      const unitCode = unitCodes[0]
      for (const idx of cardIndices) {
        classifications.push({ index: idx, chapterCode, unitCode })
      }
      continue
    }

    // 多个单元，需要 AI 细分
    const unitLines = unitCodes.map(uCode => `  [${uCode}] ${unitCodeMap[uCode]}`).join('\n')
    const chapterCardLines = cardIndices.map((idx, i) => `${i}. (原索引${idx}) ${cards[idx].knowledge_point || cards[idx].front || ''}`).join('\n')

    const step2Prompt = `你是知识点分类专家。请将以下知识点归类到章节「${chapterName}」下的最合适的单元中。

【章节】${chapterName}

【可选单元列表】（必须从以下列表中选择，不可自创）
${unitLines}

【分类步骤】
1. 先分析每个单元的主题范围（基于单元名的语义）
2. 仔细阅读知识点内容，根据内容主题选择最合适的单元
3. 注意区分名称相似的单元，根据单元名的完整语义判断

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理" → 单元 ${unitCodes[0]}

【待分类知识点】（共${cardIndices.length}个，都属于章节「${chapterName}」）
${chapterCardLines}

【输出要求】
为每个知识点选择最合适的单元编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"unit":"${unitCodes[0]}"}]}

注意：
1. unit 必须是 ${unitCodes.join('、')} 等单元编号
2. 编号必须从上面的列表中选择，不可自创
3. 每个知识点必须分配到一个单元
4. 不能遗漏任何知识点
5. index 是知识点在本次列表中的索引（从0开始，对应待分类知识点的顺序）
6. 请仔细阅读知识点内容，根据内容主题选择最合适的单元
7. 优先匹配知识点的核心主题，而非表面关键词`

    try {
      const result = await callAiProvider(step2Prompt, {
        ...aiConfig,
        maxTokens: 8192,
        temperature: 0.3,
      })

      const content = result.content || ''
      let parsed
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('没有找到 JSON')
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        const fixedJson = content
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/'([^']*)'(\s*:)/g, '"$1"$2')
          .replace(/'([^']*)'/g, '"$1"')
          .replace(/(\w+)\s*:/g, '"$1":')
        const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          console.warn(`[classifyCardsByExpectedUnitsTwoStep] 章节 ${chapterCode} 第二步 JSON 修复失败`)
          // 降级：分配到第一个单元
          for (const idx of cardIndices) {
            classifications.push({ index: idx, chapterCode, unitCode: unitCodes[0] })
          }
          continue
        }
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch (e2) {
          console.warn(`[classifyCardsByExpectedUnitsTwoStep] 章节 ${chapterCode} 第二步 JSON 修复后仍失败: ${e2.message}`)
          for (const idx of cardIndices) {
            classifications.push({ index: idx, chapterCode, unitCode: unitCodes[0] })
          }
          continue
        }
      }

      for (const c of parsed.classifications || []) {
        const originalIdx = cardIndices[c.index]
        if (originalIdx === undefined) continue
        classifications.push({
          index: originalIdx,
          chapterCode,
          unitCode: c.unit,
        })
      }

    } catch (err) {
      console.warn(`[classifyCardsByExpectedUnitsTwoStep] 章节 ${chapterCode} 第二步调用失败:`, err.message)
      // 降级：分配到第一个单元
      for (const idx of cardIndices) {
        classifications.push({ index: idx, chapterCode, unitCode: unitCodes[0] })
      }
    }
  }

  return { classifications, chapterCodeMap, unitCodeMap }
}

/**
 * 单步分类法（降级路径）：一次性分类所有卡片
 * 当两步分类法失败时使用
 */
async function classifyCardsByExpectedUnitsSingleStep(cards, expectedStructure, aiConfig, maps) {
  const { chapterCodeMap, unitCodeMap, structureText } = maps
  const classifications = []

  const cardLines = cards.map((c, i) => `${i}. ${c.knowledge_point || c.front || ''}`).join('\n')

  const prompt = `你是知识点分类专家。请将以下知识点归类到最合适的章节和单元中。

【可选章节和单元列表】（必须从以下列表中选择，不可自创）
${structureText}

【分类步骤】
1. 先分析每个章节和单元的主题范围（基于章节名和单元名的语义）
2. 注意区分名称相似的单元，根据章节上下文判断正确归属
3. 仔细阅读知识点内容，根据内容主题选择最合适的单元

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制" → 章节 C1，单元 U1
知识点："函数三要素：定义域、对应法则、值域" → 章节 C3，单元 U5
知识点："导数几何意义：函数某点导数，对应函数图像该点切线斜率" → 章节 C4，单元 U8

【待分类知识点】（共${cards.length}个）
${cardLines}

【输出要求】
为每个知识点选择最合适的章节编号和单元编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"chapter":"C1","unit":"U1"}]}

注意：
1. chapter 必须是 C1、C2 等章节编号，unit 必须是 U1、U2 等单元编号
2. 编号必须从上面的列表中选择，不可自创
3. 每个知识点必须分配到一个单元
4. 不能遗漏任何知识点
5. index 是知识点在列表中的索引（从0开始）
6. 请仔细阅读知识点内容，根据内容主题选择最合适的单元
7. 注意：不同章节下可能有名称相似的单元，请根据章节上下文判断正确归属
8. 优先匹配知识点的核心主题，而非表面关键词`

  try {
    const result = await callAiProvider(prompt, {
      ...aiConfig,
      maxTokens: 8192,
      temperature: 0.3,
    })

    const content = result.content || ''
    let parsed
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('没有找到 JSON')
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      const fixedJson = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/'([^']*)'(\s*:)/g, '"$1"$2')
        .replace(/'([^']*)'/g, '"$1"')
        .replace(/(\w+)\s*:/g, '"$1":')
      const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[classifyCardsByExpectedUnitsSingleStep] JSON 修复失败`)
        return { classifications, chapterCodeMap, unitCodeMap }
      }
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch (e2) {
        console.warn(`[classifyCardsByExpectedUnitsSingleStep] JSON 修复后仍失败: ${e2.message}`)
        return { classifications, chapterCodeMap, unitCodeMap }
      }
    }

    for (const c of parsed.classifications || []) {
      classifications.push({
        index: c.index,
        chapterCode: c.chapter,
        unitCode: c.unit,
      })
    }
  } catch (err) {
    console.warn(`[classifyCardsByExpectedUnitsSingleStep] 调用失败:`, err.message)
  }

  return { classifications, chapterCodeMap, unitCodeMap }
}

/**
 * 为每个单元生成关键词列表（AI 动态生成）
 * @param {Array} chapters - 章节数组，每个章节包含 units，每个 unit 包含 cards
 * @param {object} aiConfig - AI 配置
 * @returns {Promise<object>} 关键词映射 { '章节名/单元名': ['关键词1', '关键词2', ...] }
 */
export async function generateUnitKeywords(chapters, aiConfig) {
  const { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey } = aiConfig
  const keywordMap = {}

  for (const ch of chapters || []) {
    for (const u of ch.units || []) {
      const unitKey = `${ch.name}/${u.name}`
      const cards = u.cards || []
      if (cards.length === 0) {
        keywordMap[unitKey] = []
        continue
      }

      // 取该单元的卡片内容（最多10张）
      const sampleCards = cards.slice(0, 10).map((c, i) => `${i + 1}. ${c.knowledge_point || c.front || ''}`).join('\n')

      const prompt = `分析以下知识点，提取5-10个能够代表该单元主题的关键词。

单元名称：${u.name}
章节名称：${ch.name}

知识点：
${sampleCards}

要求：
1. 关键词应该能够准确代表该单元的主题
2. 关键词应该是具体的术语、概念或技术名词
3. 关键词应该区分度高，能与其他单元区分
4. 只返回关键词，用逗号分隔，不要其他内容

关键词：`

      try {
        const result = await callAiProvider(prompt, {
          apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey,
          maxTokens: 200,
        })
        const keywords = result.content?.trim()
          .split(/[,，、\n]+/)
          .map(kw => kw.trim().toLowerCase())
          .filter(kw => kw && kw.length >= 2)
        keywordMap[unitKey] = keywords
      } catch (err) {
        console.warn(`[generateUnitKeywords] 生成失败 ${unitKey}:`, err.message)
        keywordMap[unitKey] = []
      }
    }
  }

  return keywordMap
}

function splitTextIntoChunks(text, maxLength) {
  const chunks = []
  let current = ''

  const paragraphs = text.split(/[\n\r]+/)

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue

    if (current.length + paragraph.length + 2 <= maxLength) {
      current += (current ? '\n\n' : '') + paragraph
    } else {
      if (current) {
        chunks.push(current)
      }
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

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function mergeKnowledgePointResults(batchResults) {
  // 使用普通数组收集所有批次的知识点
  // 关键修复：移除 Set 去重，避免弱模型输出的微小差异被错误保留
  // 也避免 AI 在不同批次中归纳/合并多个知识点为同一条时丢失
  const allPoints = []
  const seenKeys = new Set()  // 用于精确去重：归一化后完全相同才视为重复

  for (let batchIndex = 0; batchIndex < batchResults.length; batchIndex++) {
    const result = batchResults[batchIndex]
    try {
      // 尝试移除 markdown 代码块（弱模型常返回 ```json ... ``` 格式）
      let cleanedResult = result
      const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        cleanedResult = codeBlockMatch[1].trim()
      }

      const json = JSON.parse(cleanedResult)
      if (json.knowledge_points && Array.isArray(json.knowledge_points)) {
        for (const point of json.knowledge_points) {
          if (point && typeof point === 'string' && point.trim()) {
            const trimmed = point.trim()
            // 归一化：去除所有空白和标点，用于精确去重
            const normalized = trimmed.replace(/[\s\p{P}]/gu, '').toLowerCase()
            if (!normalized) continue
            if (seenKeys.has(normalized)) continue
            seenKeys.add(normalized)
            allPoints.push(trimmed)
          }
        }
      }
    } catch (e) {
      console.warn(`[mergeKnowledgePointResults] Batch ${batchIndex + 1}/${batchResults.length} 解析失败:`, e.message, '前100字符:', String(result).slice(0, 100))
    }
  }

  return JSON.stringify({ knowledge_points: allPoints })
}

/**
 * 数量校验：基于输入文本估算预期知识点数量，如果返回数量过少则警告
 * @param {string} content - AI 返回的 JSON 字符串
 * @param {string} inputText - 原始输入文本
 * @param {boolean} isWeak - 是否为弱模型
 * @returns {{warning: string|null, expectedMin: number, actualCount: number}}
 */
function validateKnowledgePointCount(content, inputText, isWeak) {
  try {
    let cleaned = content
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim()
    }
    const json = JSON.parse(cleaned)
    const actualCount = Array.isArray(json.knowledge_points) ? json.knowledge_points.length : 0

    // 估算：每 150 字符可以形成一个独立知识点（方案一调整）
    const textLength = inputText?.length || 0
    const expectedMin = Math.max(1, Math.floor(textLength / 150))
    const ratio = actualCount / expectedMin

    if (actualCount === 0) {
      return { warning: null, expectedMin, actualCount }
    }

    // 如果实际数量不到预期的 30%（弱模型更严格：50%），发出警告
    const threshold = isWeak ? 0.5 : 0.3
    if (ratio < threshold && expectedMin >= 5) {
      return {
        warning: `知识点提取数量异常：实际 ${actualCount} 条，预期至少 ${expectedMin} 条（文本长度 ${textLength} 字符）。可能 AI 过度归纳压缩。建议：1) 拆分输入文本后重试；2) 切换到强模型`,
        expectedMin,
        actualCount,
      }
    }
    return { warning: null, expectedMin, actualCount }
  } catch (_) {
    return { warning: null, expectedMin: 0, actualCount: 0 }
  }
}

// 强标题过滤：识别并移除"第一天计算机知识点（硬件基础）"这类纯章节/目录标题
// 规则：如果一条内容以章节结构开头，且内容只含名词性分类标签、不含具体知识说明，就视为纯标题
// 实质性内容信号：动词（是、为、包括...）、数字、冒号/逗号/分号、括号中有具体说明
const _chapterHeadingStart = /^第[一二三四五六七八九十百千0-9]+[天章节部分节篇卷]/
const _listItemStart = /^[一二三四五六七八九十百千0-9]+[、.、]/
// 实质性内容关键词（存在任何一个即判定为知识内容）
const _knowledgeKeyword = /是|为|包括|包含|组成|构成|具有|可以|需要|通过|使用|用于|表示|属于|提供|支持|实现|处理|存储|输入|输出|管理|调用|生成|连接|发送|接收|创建|删除|更新|返回|执行|操作|数据|信息|内容|功能|作用|原理|定义|分类|方法|步骤|过程|结果|原因|影响|类型|例如|举例|说明|区分|区别|比较|对比|应用|适用|要求|条件|特征|属性|参数|选项|模式|状态/
// 数字、单位、代码、符号（实质性内容信号）
const _numericSignal = /\d{2,}|\d+\s*(字节|bit|Byte|KB|MB|GB|ms|秒|分钟|小时|天|周|月|年|%)/
// 括号中有具体内容（超过"硬件基础""软件"这类简短标签长度）
function _parenHasContent(text) {
  const matches = text.match(/[（(]([^)）]+)[)）]/g);
  if (!matches) return false;
  for (const m of matches) {
    const inner = m.replace(/^[（(]|[)）]$/g, '').trim();
    if (inner.length >= 6 && /[,，；;：:。.!！?？]|[a-zA-Z0-9]/.test(inner)) return true;
  }
  return false;
}
function _hasKnowledgeContent(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (_knowledgeKeyword.test(t)) return true;
  if (_numericSignal.test(t)) return true;
  if (_parenHasContent(t)) return true;
  // 包含冒号/分号/逗号（说明性内容的信号）
  if (/[，；;,：:：]/.test(t)) return true;
  return false;
}

export function filterHeadingLikePoints(points) {
  if (!Array.isArray(points)) return [];
  const kept = [];
  for (const p of points) {
    const text = String(p || '').trim();
    if (!text) continue;
    let isHeadingLike = false;
    // 1. 以"第X天/章/节..."开头 → 检查是否只有分类标题
    if (_chapterHeadingStart.test(text)) {
      if (!_hasKnowledgeContent(text)) {
        isHeadingLike = true;
      }
    }
    // 2. 以"一、二、三.../1."开头且长度<40 → 检查是否只有分类标签
    if (!isHeadingLike && _listItemStart.test(text) && text.length < 40) {
      if (!_hasKnowledgeContent(text)) {
        isHeadingLike = true;
      }
    }
    // 3. 极短纯编号文本
    if (!isHeadingLike && text.length < 12 && /^[一二三四五六七八九十百千0-9]+[、.]?$/.test(text)) {
      isHeadingLike = true;
    }
    if (!isHeadingLike) {
      kept.push(p);
    }
  }
  return kept;
}

// ===== 两步生成：Step 2 —— 知识点批量转卡片 =====
export async function generateCardsFromKnowledgePoints(knowledgePoints, config, onProgress, isCancelled) {
  const { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey, summaryLevel } = config
  const startTime = Date.now()
  const kpArray = (knowledgePoints || []).filter(kp => kp && typeof kp === 'string' && kp.trim())
  const totalPoints = kpArray.length
  const BATCH_KNOWLEDGE_POINTS_SIZE = 30

  // 取消检查 helper
  const checkCancelled = () => {
    if (typeof isCancelled === 'function' && isCancelled()) {
      const err = new Error('用户已取消任务')
      err.cancelled = true
      throw err
    }
  }

  if (totalPoints === 0) {
    return { content: JSON.stringify({ units: [] }), tokens: 0 }
  }

  // 判断是否为弱模型（讯飞 Spark Lite）
  const isWeakSpark = aiServiceMode === 'iflytek-spark' && (!model || model === 'lite')

  const callProvider = async (prompt, inputLog, kpCount) => {
    // 弱模型使用更低的 temperature（更稳定输出）和更高的 max_tokens
    const effectiveTemperature = isWeakSpark ? 0.5 : 0.7
    const effectiveMaxTokens = isWeakSpark
      ? Math.min(16384, 4096 + kpCount * 400)  // 弱模型每张卡片预留 400 tokens
      : computeMaxTokens(kpCount || 30)
    const result = await callAiProvider(prompt, {
      apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey,
      maxTokens: effectiveMaxTokens,
      temperature: effectiveTemperature,
    })
    return result
  }

  // 根据批次大小动态计算 max_tokens：30个知识点约需 6000+ tokens
  const computeMaxTokens = (kpCount) => {
    // 基础值 4096，每张卡片预留约 220 tokens
    return Math.min(8192, 4096 + kpCount * 220)
  }

  if (totalPoints <= BATCH_KNOWLEDGE_POINTS_SIZE) {
    // [fix-cancel] 单批路径开始前检查取消
    checkCancelled()
    // [fix-P1-5] 单批路径也注入 kpMarker，与多批路径保持一致，确保下游章节归类正确
    const kpList = kpArray.map((kp, i) => {
      const globalIndex = i  // 单批时 offset=0，globalIndex 即为 i
      return `${i + 1}. [__KP_${globalIndex}__] ${kp}`
    }).join('\n')
    const basePrompt = getBatchCardsPromptByLevel(summaryLevel) || BATCH_CARDS_FROM_KNOWLEDGE_POINTS_PROMPT
    const prompt = basePrompt + '\n\n知识点列表（每条带全局标记 __KP_N__，请在每张生成的卡片中保留 kpMarker 字段）：\n' + kpList

    try {
      const result = await callProvider(prompt, kpList, totalPoints)
      // [fix-cancel] 单批完成后检查取消
      checkCancelled()
      if (typeof onProgress === 'function') {
        onProgress({ step: 'generate-cards', current: 1, total: 1, message: '卡片生成完成' })
      }
      logAiCall({
        purpose: 'card-generation-from-knowledge-points',
        modelName: getModelName(aiServiceMode, model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens,
        prompt: kpList,
        response: result.content,
      })
      return result
    } catch (err) {
      logAiCall({
        purpose: 'card-generation-from-knowledge-points',
        modelName: getModelName(aiServiceMode, model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: kpList,
        response: '',
      })
      throw err
    }
  }

  const batches = []
  for (let i = 0; i < totalPoints; i += BATCH_KNOWLEDGE_POINTS_SIZE) {
    batches.push(kpArray.slice(i, i + BATCH_KNOWLEDGE_POINTS_SIZE))
  }

  const allResults = []
  const basePrompt = getBatchCardsPromptByLevel(summaryLevel) || BATCH_CARDS_FROM_KNOWLEDGE_POINTS_PROMPT
  let totalTokens = 0
  const batchOffsetMap = [] // 记录每批在原始 kpArray 中的起始索引

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    // [fix-cancel] 每批开始前检查取消
    checkCancelled()
    const batch = batches[batchIndex]
    const offset = batchIndex * BATCH_KNOWLEDGE_POINTS_SIZE
    batchOffsetMap.push(offset)
    // 提示中带全局索引 + 全局 kpMarker，让 AI 在返回中保留 kpMarker 字段
    const kpList = batch.map((kp, i) => {
      const globalIndex = offset + i
      return `${i + 1}. [__KP_${globalIndex}__] ${kp}`
    }).join('\n')
    const prompt = basePrompt + '\n\n知识点列表（每条带全局标记 __KP_N__，请在每张生成的卡片中保留 kpMarker 字段）：\n' + kpList

    // 单批失败重试机制：最多重试 2 次（总共 3 次尝试）
    const MAX_RETRIES = 2
    let batchSuccess = false
    let lastError = null

    for (let retry = 0; retry <= MAX_RETRIES && !batchSuccess; retry++) {
      try {
        // [fix-cancel] 调用 AI 前再次检查取消
        checkCancelled()
        const result = await callProvider(prompt, kpList, batch.length)
        totalTokens += result.tokens || 0
        // [fix-cancel] AI 返回后检查取消
        checkCancelled()
        allResults.push({ content: result.content, offset })
        batchSuccess = true

        if (typeof onProgress === 'function') {
          onProgress({
            step: 'generate-cards',
            current: batchIndex + 1,
            total: batches.length,
            message: `正在生成卡片... ${batchIndex + 1}/${batches.length}`,
          })
        }
      } catch (err) {
        // [fix-cancel] 如果是用户取消，直接抛出，不重试
        if (err?.cancelled) throw err
        lastError = err
        console.warn(`[generateCardsFromKnowledgePoints] Batch ${batchIndex + 1} 失败 (尝试 ${retry + 1}/${MAX_RETRIES + 1}):`, err?.message)
        if (retry < MAX_RETRIES) {
          // 重试前等待 1 秒
          await new Promise(r => setTimeout(r, 1000))
        }
      }
    }

    if (!batchSuccess) {
      logAiCall({
        purpose: 'card-generation-from-knowledge-points',
        modelName: getModelName(aiServiceMode, model),
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: lastError?.message || '未知错误',
        prompt: kpList,
        response: '',
      })
      throw lastError || new Error('批次 ' + (batchIndex + 1) + ' 生成失败')
    }
  }

  let mergedContent = mergeBatchCardResults(allResults, totalPoints)

  // 批处理完整性校验
  const allResultsCount = allResults.length
  const batchCount = batches.length
  if (allResultsCount !== batchCount) {
    console.warn(`[generateCardsFromKnowledgePoints] 批次完整性警告: allResults=${allResultsCount}, batches=${batchCount}, 缺失 ${batchCount - allResultsCount} 批`)
  }

  // 解析合并后的 JSON 校验卡片总数
  try {
    const merged = JSON.parse(mergedContent)
    const totalCards = (merged.units || []).reduce((sum, u) => sum + (u.cards?.length || 0), 0)
    if (totalCards < totalPoints * 0.5) {
      console.warn(`[generateCardsFromKnowledgePoints] 卡片数量异常: 仅生成 ${totalCards} 张卡片（知识点 ${totalPoints} 个），可能存在批次丢失`)
    }
  } catch (e) {
    console.warn('[generateCardsFromKnowledgePoints] 无法解析合并结果进行校验:', e.message)
  }

  // 卡片质量检测：对生成的卡片进行全面质量评估和自动修复
  try {
    let merged = JSON.parse(mergedContent)
    const allCards = []
    if (merged.units && Array.isArray(merged.units)) {
      merged.units.forEach(unit => {
        if (unit.cards && Array.isArray(unit.cards)) {
          allCards.push(...unit.cards)
        }
      })
    }
    
    const qualityResult = checkCardsQuality(allCards)
    
    if (qualityResult.stats.errors > 0) {
      console.warn('[generateCardsFromKnowledgePoints] 卡片质量检测发现错误，尝试自动修复:', qualityResult.stats.errors)
      
      const fixResult = autoFixCards(allCards)
      if (fixResult.fixes.length > 0) {
        let cardIndex = 0
        for (const unit of merged.units) {
          if (unit.cards && Array.isArray(unit.cards)) {
            for (let i = 0; i < unit.cards.length; i++) {
              const fixedCard = fixResult.cards[cardIndex]
              if (fixedCard) {
                unit.cards[i] = fixedCard
              }
              cardIndex++
            }
          }
        }
        mergedContent = JSON.stringify(merged)
        
        const totalFixes = fixResult.fixes.reduce((sum, f) => sum + f.fixes.length, 0)
        console.log(`[generateCardsFromKnowledgePoints] 自动修复完成，共修复 ${totalFixes} 个问题`)
      }
    }
    
    if (qualityResult.issues.length > 0) {
      qualityResult.issues.forEach(issue => {
        if (issue.severity === 'error') {
          console.error(`[Card Quality] ${issue.code}: ${issue.message}`)
        } else {
          console.warn(`[Card Quality] ${issue.code}: ${issue.message}`)
        }
      })
    }
    
    console.log('[Card Quality Stats] 总卡片数:', qualityResult.stats.total, 
      '有效:', qualityResult.stats.valid, 
      '错误:', qualityResult.stats.errors, 
      '警告:', qualityResult.stats.warnings)
  } catch (e) {
    console.warn('[generateCardsFromKnowledgePoints] 卡片质量检测解析失败:', e.message)
  }

  logAiCall({
    purpose: 'card-generation-from-knowledge-points',
    modelName: getModelName(aiServiceMode, model),
    durationMs: Date.now() - startTime,
    status: 'success',
    tokens: totalTokens,
    prompt: kpArray.slice(0, 5).join(', '),
    response: mergedContent,
  })

  return { content: mergedContent, tokens: totalTokens }
}

// ===== 主题聚类：AI 自主决定主题数量 =====

/**
 * 计算建议主题数量范围（软约束）
 * @param {number} kpCount 知识点数量
 * @param {string} granularity 粒度：'concise'(简略) | 'standard'(标准) | 'detailed'(详细)
 * @returns {[number, number]} [最小建议, 最大建议]
 */
export function calculateTopicRange(kpCount, granularity = 'standard', currentTopicCount = null) {
  // 粒度系数：简略=0.6, 标准=1.0, 详细=1.5
  const factor = granularity === 'concise' ? 0.6 : granularity === 'detailed' ? 1.5 : 1.0
  
  let baseMin, baseMax
  if (kpCount < 5) { baseMin = 1; baseMax = 1 }
  else if (kpCount < 10) { baseMin = 1; baseMax = Math.round(3 * factor) }
  else if (kpCount < 20) { baseMin = 2; baseMax = Math.round(4 * factor) }
  else if (kpCount < 30) { baseMin = 3; baseMax = Math.round(6 * factor) }
  else if (kpCount < 50) { baseMin = 4; baseMax = Math.round(8 * factor) }
  else { baseMin = 5; baseMax = Math.round(10 * factor) }

  let suggestedMin = Math.max(1, baseMin)
  let suggestedMax = Math.max(suggestedMin + 1, baseMax)

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
 * 主题聚类粒度说明
 */
export const TOPIC_GRANULARITY_OPTIONS = [
  { value: 'concise', label: '简略', desc: '更少主题，概括性更强' },
  { value: 'standard', label: '标准', desc: '平衡分组，便于管理' },
  { value: 'detailed', label: '详细', desc: '更多主题，划分更精细' },
]

/**
 * 主题聚类：AI 自主决定主题数量
 * @param {string[]} knowledgePoints 知识点数组
 * @param {object} config AI 配置
 * @param {object|null} previousTopics 用户之前调整的主题（作为参考）
 * @param {string} granularity 粒度：'concise'(简略) | 'standard'(标准) | 'detailed'(详细)
 * @returns {Array<{topicName, pointIndices}>} 主题数组
 */
export async function clusterKnowledgePointsByTopic(knowledgePoints, config, previousTopics = null, granularity = 'standard', currentTopicCount = null) {
  const { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey } = config

  if (!knowledgePoints || knowledgePoints.length <= 3) {
    return [{
      topicName: '核心知识点',
      pointIndices: knowledgePoints.map((_, i) => i),
    }]
  }

  // 判断是否为弱模型（Spark Lite）
  const isWeakSpark = aiServiceMode === 'iflytek-spark' && (!model || model === 'lite')

  // 弱模型使用专用路径
  if (isWeakSpark) {
    const password = normalizeSparkApiPassword(sparkApiKey)
    if (password) {
      return clusterKnowledgePointsByTopicWithSpark(knowledgePoints, password, model, granularity, previousTopics, currentTopicCount)
    }
    // 无密钥时继续走通用路径
  }

  const kpCount = knowledgePoints.length
  const [suggestedMin, suggestedMax] = calculateTopicRange(kpCount, granularity, currentTopicCount)
  
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
    const startTime = Date.now()
    const result = await callAiProvider(prompt, {
      apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey,
      temperature: 0.3,
      max_tokens: 2048,
    })
    
    logAiCall({
      purpose: 'topic-clustering',
      modelName: getModelName(aiServiceMode, model),
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens: result.tokens,
      prompt: kpLines,
      response: result.content,
    })
    
    const parsed = parseAIResponse(result.content)
    if (parsed && Array.isArray(parsed)) {
      const finalTopics = postProcessTopics(parsed, knowledgePoints, suggestedMin, suggestedMax)
      return finalTopics
    }
    
    return fallbackCluster(knowledgePoints, suggestedMax)
    
  } catch (err) {
    console.error('[clusterKnowledgePointsByTopic] AI 聚类失败:', err?.message)
    return fallbackCluster(knowledgePoints, suggestedMax)
  }
}

/**
 * 解析 AI 返回的 JSON（兼容多种格式）
 */
function parseAIResponse(raw) {
  if (!raw) return null
  try {
    const trimmed = String(raw).trim()
    // 移除可能的 Markdown 代码块标记
    const cleaned = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    const firstBracket = cleaned.indexOf('[')
    const lastBracket = cleaned.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1))
    }
    // 尝试解析整个字符串
    return JSON.parse(cleaned)
  } catch (_) {
    return null
  }
}

/**
 * 后处理：对 AI 返回的结果进行修正
 */
function postProcessTopics(rawTopics, knowledgePoints, suggestedMin, suggestedMax) {
  // 1. 过滤无效主题
  // 【修复】兼容新旧两种格式：
  //   旧格式: {topicName, pointIndices: [...]}
  //   新格式: {topicName, units: [{unitName, pointIndices: [...]}]}
  const validTopics = rawTopics.filter(t => {
    if (!t.topicName) return false
    // 新格式：检查 units 内是否有有效 pointIndices
    if (t.units && Array.isArray(t.units) && t.units.length > 0) {
      return t.units.some(u => u.pointIndices && Array.isArray(u.pointIndices) && u.pointIndices.length > 0)
    }
    // 旧格式：检查顶层 pointIndices
    return Array.isArray(t.pointIndices) && t.pointIndices.length > 0
  })
  
  // 2. 索引去重和边界检查
  const covered = new Set()
  const cleaned = []
  
  for (const topic of validTopics) {
    // 【修复】从新格式或旧格式中提取所有 pointIndices
    let allIndices
    if (topic.units && Array.isArray(topic.units)) {
      allIndices = topic.units.flatMap(u => (u.pointIndices && Array.isArray(u.pointIndices)) ? u.pointIndices : [])
    } else {
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
  
  // 3. 处理未覆盖的知识点（分散到已有主题，而非创建"其他"主题）
  if (covered.size < knowledgePoints.length) {
    const remaining = []
    for (let i = 0; i < knowledgePoints.length; i++) {
      if (!covered.has(i)) remaining.push(i)
    }
    // 将未覆盖的知识点分散到已有主题（避免创建"其他"主题导致卡片集中）
    if (cleaned.length > 0 && remaining.length > 0) {
      const distributeCount = Math.min(remaining.length, Math.ceil(remaining.length / cleaned.length))
      for (let i = 0; i < cleaned.length && remaining.length > 0; i++) {
        const toAdd = remaining.splice(0, distributeCount)
        cleaned[i].pointIndices.push(...toAdd)
      }
      // 如果还有剩余，分散到最后一个主题
      if (remaining.length > 0 && cleaned.length > 0) {
        cleaned[cleaned.length - 1].pointIndices.push(...remaining)
      }
    }
    // 不再创建"其他知识点"主题，避免卡片集中
  }
  
  // 4. 兜底修正：如果主题数量超出建议范围太多
  const finalTopics = adjustTopicCount(cleaned, knowledgePoints, suggestedMin, suggestedMax)
  
  // 5. units 兼容处理：确保每个主题都有 units 字段
  for (const topic of finalTopics) {
    if (!topic.units || !Array.isArray(topic.units) || topic.units.length === 0) {
      // 旧格式兼容：创建默认"基础"单元，包含所有 pointIndices
      topic.units = [{ unitName: '基础', pointIndices: [...topic.pointIndices] }]
    } else {
      // 清理和验证 units
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
  
  return finalTopics
}

/**
 * 根据建议范围调整主题数量
 */
function adjustTopicCount(topics, knowledgePoints, suggestedMin, suggestedMax) {
  const count = topics.length
  
  // 情况1：主题太少（低于建议下限）
  if (count < suggestedMin && topics.length > 0) {
    return splitTopicsSimple(topics, suggestedMin)
  }
  
  // 情况2：主题太多（超过建议上限的1.5倍）
  if (count > suggestedMax * 1.5) {
    return mergeSimilarTopics(topics, knowledgePoints, suggestedMax)
  }
  
  return topics
}

/**
 * 简单拆分主题（兜底策略）
 */
function splitTopicsSimple(topics, targetCount) {
  const result = [...topics]
  
  while (result.length < targetCount) {
    const largestIdx = result.reduce((maxIdx, t, idx) => 
      t.pointIndices.length > result[maxIdx].pointIndices.length ? idx : maxIdx, 0)
    
    const largest = result[largestIdx]
    if (largest.pointIndices.length < 4) break
    
    const mid = Math.floor(largest.pointIndices.length / 2)
    result.splice(largestIdx, 1,
      { topicName: largest.topicName + '(一)', pointIndices: largest.pointIndices.slice(0, mid) },
      { topicName: largest.topicName + '(二)', pointIndices: largest.pointIndices.slice(mid) }
    )
  }
  
  return result
}

/**
 * AI 语义拆分（需要额外 AI 调用）
 */
export async function splitTopicsByAi(topics, knowledgePoints, config, targetCount) {
  const result = [...topics]
  
  while (result.length < targetCount) {
    const largestIdx = result.reduce((maxIdx, t, idx) => 
      t.pointIndices.length > result[maxIdx].pointIndices.length ? idx : maxIdx, 0)
    
    const largest = result[largestIdx]
    if (largest.pointIndices.length < 4) break
    
    // 获取大主题内的知识点内容
    const subPoints = largest.pointIndices.map(idx => knowledgePoints[idx])
    
    // 让 AI 拆分这个大主题
    const subTopics = await clusterKnowledgePointsByTopic(subPoints, config)
    
    if (subTopics.length > 1) {
      const newTopics = subTopics.map(sub => ({
        topicName: `${largest.topicName}-${sub.topicName}`,
        pointIndices: sub.pointIndices.map(subIdx => largest.pointIndices[subIdx]),
      }))
      result.splice(largestIdx, 1, ...newTopics)
    } else {
      // AI 无法拆分，使用简单拆分作为兜底
      const mid = Math.floor(largest.pointIndices.length / 2)
      result.splice(largestIdx, 1,
        { topicName: largest.topicName + '(一)', pointIndices: largest.pointIndices.slice(0, mid) },
        { topicName: largest.topicName + '(二)', pointIndices: largest.pointIndices.slice(mid) }
      )
    }
  }
  
  return result
}

/**
 * 合并相似主题（混合相似度：名称 + 内容）
 */
function mergeSimilarTopics(topics, knowledgePoints, targetCount) {
  const result = [...topics]
  
  while (result.length > targetCount) {
    let bestPair = null
    let bestScore = 0
    
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const score = calculateMixedSimilarity(result[i], result[j], knowledgePoints)
        if (score > bestScore) {
          bestScore = score
          bestPair = [i, j]
        }
      }
    }
    
    if (!bestPair || bestScore < 0.3) break
    
    const [i, j] = bestPair
    const merged = {
      topicName: result[i].topicName.length >= result[j].topicName.length 
        ? result[i].topicName 
        : result[j].topicName,
      pointIndices: [...new Set([...result[i].pointIndices, ...result[j].pointIndices])],
    }
    
    result.splice(j, 1)
    result.splice(i, 1, merged)
  }
  
  return result
}

/**
 * 计算混合相似度（名称 30% + 内容 70%）
 */
function calculateMixedSimilarity(topic1, topic2, knowledgePoints) {
  // 名称相似度
  const nameSim = simpleTextSimilarity(topic1.topicName, topic2.topicName)
  
  // 内容相似度
  const content1 = topic1.pointIndices.map(idx => knowledgePoints[idx]).join(' ')
  const content2 = topic2.pointIndices.map(idx => knowledgePoints[idx]).join(' ')
  const contentSim = simpleTextSimilarity(content1, content2)
  
  return (nameSim * 0.3) + (contentSim * 0.7)
}

/**
 * 简单文本相似度（Jaccard）
 */
function simpleTextSimilarity(text1, text2) {
  const t1 = String(text1 || '').toLowerCase()
  const t2 = String(text2 || '').toLowerCase()
  
  // 分词（简单按空格和标点分割）
  const words1 = new Set(t1.split(/[\s,，。；;：:\-—_·]+/).filter(w => w.length > 1))
  const words2 = new Set(t2.split(/[\s,，。；;：:\-—_·]+/).filter(w => w.length > 1))
  
  if (words1.size === 0 || words2.size === 0) return 0
  
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}

/**
 * 降级聚类（AI 失败时使用）
 */
function fallbackCluster(knowledgePoints, maxTopics) {
  const groups = []
  const chunkSize = Math.max(2, Math.ceil(knowledgePoints.length / maxTopics))
  
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
 * 从损坏的 JSON 中提取卡片对象（降级策略）
 * 用于处理弱模型返回的不完整 JSON
 */
function extractCardsFromBrokenJson(text) {
  const cards = []
  // 策略1：匹配包含 front 和 back 的卡片对象（任意字段顺序）
  // 先找到所有 { ... } 对象块
  const objectPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
  let match
  while ((match = objectPattern.exec(text)) !== null) {
    const objStr = match[0]
    try {
      // 尝试直接解析
      const card = JSON.parse(objStr)
      if (card.front && card.back) {
        cards.push(card)
        continue
      }
    } catch {
      // 解析失败，尝试正则提取字段
    }
    // 尝试从对象字符串中提取 front 和 back 字段
    const frontMatch = objStr.match(/"front"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    const backMatch = objStr.match(/"back"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (frontMatch && backMatch) {
      const card = {
        front: frontMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
        back: backMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
      }
      // 也尝试提取 kpMarker
      const kpMatch = objStr.match(/"kpMarker"\s*:\s*"([^"]*)"/)
      if (kpMatch) card.kpMarker = kpMatch[1]
      // 也尝试提取 knowledge_point
      const kpTextMatch = objStr.match(/"knowledge_point"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (kpTextMatch) card.knowledge_point = kpTextMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      cards.push(card)
    }
  }
  // 策略2：如果策略1没找到卡片，尝试更宽松的匹配
  if (cards.length === 0) {
    const frontPattern = /"front"\s*:\s*"((?:[^"\\]|\\.)*)"/g
    const backPattern = /"back"\s*:\s*"((?:[^"\\]|\\.)*)"/g
    const kpMarkerPattern = /"kpMarker"\s*:\s*"([^"]*)"/g
    const kpTextPattern = /"knowledge_point"\s*:\s*"((?:[^"\\]|\\.)*)"/g
    const fronts = []
    const backs = []
    const kpMarkers = []  // [fix-P1-6] 补充 kpMarker 提取
    const kpTexts = []    // [fix-P1-6] 补充 knowledge_point 提取
    let fm, bm, km, ktm
    while ((fm = frontPattern.exec(text)) !== null) {
      fronts.push(fm[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'))
    }
    while ((bm = backPattern.exec(text)) !== null) {
      backs.push(bm[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'))
    }
    while ((km = kpMarkerPattern.exec(text)) !== null) {
      kpMarkers.push(km[1])
    }
    while ((ktm = kpTextPattern.exec(text)) !== null) {
      kpTexts.push(ktm[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'))
    }
    const count = Math.min(fronts.length, backs.length)
    for (let i = 0; i < count; i++) {
      // [fix-P1-6] 补充 kpMarker 和 knowledge_point，避免降级路径卡片无法归类
      const card = { front: fronts[i], back: backs[i] }
      if (kpMarkers[i]) card.kpMarker = kpMarkers[i]
      if (kpTexts[i]) card.knowledge_point = kpTexts[i]
      cards.push(card)
    }
  }
  return { units: [{ name: '降级提取-卡片组', cards }] }
}

function mergeBatchCardResults(batchResults, totalKpCount = Infinity) {
  const allUnits = []
  let unitIndex = 0

  for (const batchItem of batchResults) {
    const result = batchItem?.content
    const offset = batchItem?.offset || 0
    if (!result) {
      console.warn(`[mergeBatchCardResults] Batch with offset ${offset} has empty result, skipping`)
      continue
    }

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
            console.warn(`[mergeBatchCardResults] All parse strategies failed for batch offset=${offset}, error:`, e.message)
            // 【降级】尝试逐个提取卡片对象
            json = extractCardsFromBrokenJson(cleanedResult)
          }
        }
      }
      if (json.units && Array.isArray(json.units)) {
        for (const unit of json.units) {
          if (!unit || typeof unit !== 'object') continue
          // 直接保留 AI 返回的 kpMarker（prompt 中已使用全局索引 __KP_${offset+i}__，无需叠加 offset）
          const fixedCards = Array.isArray(unit.cards) ? unit.cards.map(card => {
            if (!card || typeof card !== 'object') return null
            // 过滤空卡片：front/back 为空或为 prompt 模板占位文本
            const frontStr = String(card.front || '')
            const backStr = String(card.back || '')
            const kpText = String(card.knowledge_point || '')
            const isPlaceholderFront = /^卡片正面[（(]问题[\/／]挖空[）)]/.test(frontStr)
            const isPlaceholderBack = /^卡片背面[（(]完整答案[）)]/.test(backStr)
            const frontInvalid = !frontStr.trim() || isPlaceholderFront
            const backInvalid = !backStr.trim() || isPlaceholderBack
            // 仅当 front/back 都无效且无 knowledge_point 可降级时才丢弃
            if (frontInvalid && backInvalid && !kpText.trim()) {
              return null
            }
            // 校验 kpMarker 索引范围
            if (card.kpMarker && typeof card.kpMarker === 'string') {
              const kpMatch = card.kpMarker.match(/__KP_(\d+)__/)
              if (kpMatch) {
                const kpIdx = parseInt(kpMatch[1], 10)
                if (kpIdx < 0 || kpIdx >= totalKpCount) {
                  console.warn(`[mergeBatchCardResults] kpIndex=${kpIdx} 超出范围 [0,${totalKpCount - 1}]，清除 kpMarker 保留卡片: ${card.front?.slice(0, 30)}`)
                  // 不丢弃卡片，清除 kpMarker 让后续流程处理
                  return { ...card, kpMarker: null, kpIndex: null }
                }
              }
            }
            // 直接保留 AI 返回的 kpMarker（已是全局索引）
            return card
          }).filter(Boolean) : []


          if (fixedCards.length === 0) continue

          // [fix-P1] 不再添加批次前缀，按单元名合并避免碎片化
          const unitName = unit.name || '未命名单元'
          const existingUnit = allUnits.find(u => u.name === unitName)
          if (existingUnit) {
            existingUnit.cards.push(...fixedCards)
          } else {
            allUnits.push({
              ...unit,
              name: unitName,
              cards: fixedCards,
            })
          }
          unitIndex++
        }
      } else if (json.cards && Array.isArray(json.cards)) {
        const fixedCards = json.cards.map(card => {
          if (!card || typeof card !== 'object') return null
          const frontStr = String(card.front || '')
          const backStr = String(card.back || '')
          const kpText = String(card.knowledge_point || '')
          const isPlaceholderFront = /^卡片正面[（(]问题[\/／]挖空[）)]/.test(frontStr)
          const isPlaceholderBack = /^卡片背面[（(]完整答案[）)]/.test(backStr)
          const frontInvalid = !frontStr.trim() || isPlaceholderFront
          const backInvalid = !backStr.trim() || isPlaceholderBack
          if (frontInvalid && backInvalid && !kpText.trim()) { return null }
          // 直接保留 AI 返回的 kpMarker（prompt 中已使用全局索引）
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
      console.warn('[mergeBatchCardResults] Failed to parse batch result:', e.message)
    }
  }

  return JSON.stringify({ units: allUnits })
}

// 通用 AI 服务调用（用于 extractKnowledgePoints / generateCardsFromKnowledgePoints）
// 内置空响应重试机制：当AI返回200但内容为空时自动重试最多2次
async function callAiProvider(prompt, config) {
  const MAX_RETRIES = 2
  let lastError = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callAiProviderInner(prompt, config, attempt)
      return result
    } catch (err) {
      lastError = err
      const msg = String(err.message || '')
      // 仅对"未返回有效内容"（空响应）进行重试
      if (msg.includes('未返回有效内容') && attempt < MAX_RETRIES) {
        console.warn(`[callAiProvider] 空响应，第 ${attempt + 1} 次重试...`)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw lastError
}

async function callAiProviderInner(prompt, config, attempt = 0) {
  const { apiKey, model, aiServiceMode, sparkApiKey, volcanoApiKey, dashscopeApiKey, maxTokens, temperature } = config
  const body = {
    model: model || 'deepseek-v4-pro',
    messages: [{ role: 'user', content: prompt }],
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    max_tokens: maxTokens || 4096,
  }

  if (aiServiceMode === 'iflytek-spark') {
    const password = normalizeSparkApiPassword(sparkApiKey)
    if (!password) throw new Error('Spark: 未填写 APIPassword')
    const resp = await httpPost(SPARK_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
      data: { ...body, model: model || 'lite' },
      timeout: 120000,
    })
    if (!resp.ok) {
      const errData = resp.data || {}
      const msg = (errData.error && typeof errData.error === 'string')
        ? errData.error
        : (errData.error?.message || errData.message || '请求失败')
      throw new Error('Spark: ' + msg)
    }
    const content = resp.data?.choices?.[0]?.message?.content || ''
    if (!content) throw new Error('Spark: 未返回有效内容')
    return { content, tokens: resp.data?.usage?.total_tokens || 0 }
  }
  if (aiServiceMode === 'volcano') {
    const key = (volcanoApiKey || '').trim()
    if (!key) throw new Error('Volcano: 未填写 API Key')
    const resp = await httpPost(VOLCANO_ENGINE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      data: { ...body, model: model || 'doubao-pro-32k' },
      timeout: 120000,
    })
    if (!resp.ok) {
      const errData = resp.data || {}
      const msg = (errData.error && typeof errData.error === 'string')
        ? errData.error
        : (errData.error?.message || errData.message || '请求失败')
      throw new Error('Volcano: ' + msg)
    }
    const content = resp.data?.choices?.[0]?.message?.content || ''
    if (!content) throw new Error('Volcano: 未返回有效内容')
    return { content, tokens: resp.data?.usage?.total_tokens || 0 }
  }
  if (aiServiceMode === 'dashscope') {
    const key = (dashscopeApiKey || '').trim()
    if (!key) throw new Error('Dashscope: 未填写 API Key')
    const resp = await httpPost(DASHSCOPE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      data: { ...body, model: model || 'qwen3.5-plus-2026-04-20' },
      timeout: 120000,
    })
    if (!resp.ok) {
      const errData = resp.data || {}
      const msg = (errData.error && typeof errData.error === 'string')
        ? errData.error
        : (errData.error?.message || errData.message || '请求失败')
      throw new Error('Dashscope: ' + msg)
    }
    const content = resp.data?.choices?.[0]?.message?.content || ''
    if (!content) throw new Error('Dashscope: 未返回有效内容')
    return { content, tokens: resp.data?.usage?.total_tokens || 0 }
  }
  if (aiServiceMode === 'pc-engine') {
    const pcResult = await callPcEngineAi([{ role: 'user', content: prompt }], { temperature: config.temperature ?? 0.3, maxTokens: maxTokens || 4096 })
    if (!pcResult) {
      // PC 引擎失败，降级到下方 DeepSeek
    } else {
      return { content: pcResult.content, tokens: pcResult.tokens }
    }  }
  // DeepSeek
  const key = (apiKey || '').trim()
  if (!key) throw new Error('DeepSeek: 未填写 API Key')
  const resp = await httpPost(DEEPSEEK_API_URL, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    data: body,
    timeout: 120000,
  })
  if (!resp.ok) {
    const errData = resp.data || {}
    const msg = (errData.error && typeof errData.error === 'string')
      ? errData.error
      : (errData.error?.message || errData.message || '请求失败')
    throw new Error('DeepSeek: ' + msg)
  }
  const content = resp.data?.choices?.[0]?.message?.content || ''
  if (!content) throw new Error('DeepSeek: 未返回有效内容')
  return { content, tokens: resp.data?.usage?.total_tokens || 0 }
}

// ============================================================
// 分类结果校验函数
// 支持三种模式：chapter-and-unit、chapter-only、unit-only
// 返回 { valid, errors, warnings }
// ============================================================

/**
 * 检测命名是否违规（编号命名或时间命名）
 */
function isInvalidNaming(name, type) {
  if (!name || typeof name !== 'string') return false
  const trimmed = name.trim()
  // 编号命名模式
  const numberPatterns = [
    /^第[一二三四五六七八九十百千0-9]+[天章节部分节篇卷]/,  // 第一章、第二天、第一部分
    /^[一二三四五六七八九十百千0-9]+[、.、]/,               // 1.、一、
    /^单元?\d+$/,                                           // 单元1、第1单元
    /^章节?\d+$/,                                           // 章节1、第1节
    /^部分?\d+$/,                                           // 部分1、第1篇
  ]
  for (const pattern of numberPatterns) {
    if (pattern.test(trimmed)) return true
  }
  // 时间命名模式
  const timePatterns = [
    /^第[一二三四五六七八九十百千]+天/,                      // 第一天、第二天
    /^第[一二三四五六七八九十百千]+周/,                      // 第一周
    /^第[一二三四五六七八九十百千]+月/,                      // 第一月
    /^星期?[一二三四五六日天]/,                              // 星期一、周一
    /^(今天|明天|后天|昨天)$/,                              // 今天、明天
  ]
  for (const pattern of timePatterns) {
    if (pattern.test(trimmed)) return true
  }
  return false
}

/**
 * 判断分类结果的结构模式
 */
function detectClassificationMode(result) {
  if (!result) return null
  if (result.chapters && Array.isArray(result.chapters)) {
    // 检查是 chapter-and-unit 还是 chapter-only
    const firstChapter = result.chapters[0]
    if (firstChapter && firstChapter.units && Array.isArray(firstChapter.units)) {
      return 'chapter-and-unit'
    }
    if (firstChapter && Array.isArray(firstChapter.cardIndices)) {
      return 'chapter-only'
    }
    // 兼容章节无cardIndices但有units的情况
    if (firstChapter && firstChapter.units && Array.isArray(firstChapter.units)) {
      return 'chapter-and-unit'
    }
    return 'chapter-only'
  }
  if (result.units && Array.isArray(result.units)) {
    return 'unit-only'
  }
  return null
}

export function validateClassificationResult(result, totalCards) {
  const errors = []
  const warnings = []

  if (!result || typeof result !== 'object') {
    return { valid: false, errors: ['分类结果无效：不是有效的对象'], warnings: [] }
  }

  const mode = detectClassificationMode(result)
  if (!mode) {
    return { valid: false, errors: ['分类结果无效：无法识别结构模式（缺少 chapters 或 units）'], warnings: [] }
  }

  if (mode === 'chapter-and-unit') {
    // ===== 结构校验 =====
    const chapters = result.chapters || []
    if (chapters.length < 1) {
      errors.push('章节数不能为空')
    } else if (chapters.length > 10) {
      errors.push(`章节数 ${chapters.length} 超出范围（1-10）`)
    }

    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci]
      const chName = ch?.name || ''
      // 章节命名校验
      if (isInvalidNaming(chName, 'chapter')) {
        errors.push(`章节 "${chName}" 使用了编号或时间命名方式`)
      }
      if (chName.length > 12) {
        errors.push(`章节 "${chName}" 长度超过12字限制`)
      }
      // 单元数校验（与 validateStructurePlan 一致：单元数 < 2 降为 warning，不阻断流程）
      const units = ch?.units || []
      if (units.length < 2) {
        warnings.push(`章节 "${chName}" 单元数 ${units.length} 低于下限（2），将自动补充`)
      } else if (units.length > 10) {
        errors.push(`章节 "${chName}" 单元数 ${units.length} 超出上限（10）`)
      }
      // 单元校验
      for (let ui = 0; ui < units.length; ui++) {
        const u = units[ui]
        const uName = u?.name || ''
        if (isInvalidNaming(uName, 'unit')) {
          errors.push(`单元 "${uName}" 使用了编号或时间命名方式`)
        }
        if (uName.length > 16) {
          errors.push(`单元 "${uName}" 长度超过16字限制`)
        }
        const cardCount = Array.isArray(u.cardIndices) ? u.cardIndices.length : 0
        if (cardCount < 2) {
          errors.push(`单元 "${uName}" 卡片数 ${cardCount} 低于下限（2）`)
        } else if (cardCount > 50) {
          errors.push(`单元 "${uName}" 卡片数 ${cardCount} 超出上限（50）`)
        }
      }
    }

    // ===== 分配校验 =====
    const allAssigned = new Set()
    const duplicates = []
    for (const ch of chapters) {
      for (const u of (ch?.units || [])) {
        for (const idx of (u?.cardIndices || [])) {
          if (allAssigned.has(idx)) {
            duplicates.push(idx)
          }
          allAssigned.add(idx)
        }
      }
    }
    if (duplicates.length > 0) {
      errors.push(`发现 ${duplicates.length} 张重复分配的卡片`)
    }
    if (allAssigned.size < totalCards) {
      errors.push(`卡片分配不完整：已分配 ${allAssigned.size}/${totalCards} 张`)
    } else if (allAssigned.size > totalCards) {
      errors.push(`卡片分配超出范围：已分配 ${allAssigned.size}/${totalCards} 张`)
    }

  } else if (mode === 'chapter-only') {
    // ===== 结构校验（chapter-only） =====
    const chapters = result.chapters || []
    if (chapters.length < 1) {
      errors.push('章节数不能为空')
    } else if (chapters.length > 10) {
      errors.push(`章节数 ${chapters.length} 超出范围（1-10）`)
    }

    for (const ch of chapters) {
      const chName = ch?.name || ''
      if (isInvalidNaming(chName, 'chapter')) {
        errors.push(`章节 "${chName}" 使用了编号或时间命名方式`)
      }
      if (chName.length > 12) {
        errors.push(`章节 "${chName}" 长度超过12字限制`)
      }
      const cardCount = Array.isArray(ch.cardIndices) ? ch.cardIndices.length : 0
      if (cardCount < 2) {
        errors.push(`章节 "${chName}" 卡片数 ${cardCount} 低于下限（2）`)
      } else if (cardCount > 50) {
        errors.push(`章节 "${chName}" 卡片数 ${cardCount} 超出上限（50）`)
      }
    }

    // ===== 分配校验（chapter-only） =====
    const allAssigned = new Set()
    const duplicates = []
    for (const ch of chapters) {
      for (const idx of (ch?.cardIndices || [])) {
        if (allAssigned.has(idx)) {
          duplicates.push(idx)
        }
        allAssigned.add(idx)
      }
    }
    if (duplicates.length > 0) {
      errors.push(`发现 ${duplicates.length} 张重复分配的卡片`)
    }
    if (allAssigned.size < totalCards) {
      errors.push(`卡片分配不完整：已分配 ${allAssigned.size}/${totalCards} 张`)
    } else if (allAssigned.size > totalCards) {
      errors.push(`卡片分配超出范围：已分配 ${allAssigned.size}/${totalCards} 张`)
    }

  } else if (mode === 'unit-only') {
    // ===== 结构校验（unit-only） =====
    const units = result.units || []
    if (units.length < 1) {
      errors.push('单元数不能为空')
    } else if (units.length > 10) {
      warnings.push(`单元数 ${units.length} 偏多，建议不超过10个`)
    }

    for (const u of units) {
      const uName = u?.name || ''
      if (isInvalidNaming(uName, 'unit')) {
        errors.push(`单元 "${uName}" 使用了编号或时间命名方式`)
      }
      if (uName.length > 16) {
        errors.push(`单元 "${uName}" 长度超过16字限制`)
      }
      const cardCount = Array.isArray(u.cardIndices) ? u.cardIndices.length : 0
      if (cardCount < 2) {
        errors.push(`单元 "${uName}" 卡片数 ${cardCount} 低于下限（2）`)
      } else if (cardCount > 50) {
        errors.push(`单元 "${uName}" 卡片数 ${cardCount} 超出上限（50）`)
      }
    }

    // ===== 分配校验（unit-only） =====
    const allAssigned = new Set()
    const duplicates = []
    for (const u of units) {
      for (const idx of (u?.cardIndices || [])) {
        if (allAssigned.has(idx)) {
          duplicates.push(idx)
        }
        allAssigned.add(idx)
      }
    }
    if (duplicates.length > 0) {
      errors.push(`发现 ${duplicates.length} 张重复分配的卡片`)
    }
    if (allAssigned.size < totalCards) {
      errors.push(`卡片分配不完整：已分配 ${allAssigned.size}/${totalCards} 张`)
    } else if (allAssigned.size > totalCards) {
      errors.push(`卡片分配超出范围：已分配 ${allAssigned.size}/${totalCards} 张`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============================================================
// 分类结果二次修正函数（在内存中操作，不修改原始数据）
// ============================================================

/**
 * 深度克隆分类结果
 */
function cloneClassificationResult(result) {
  return JSON.parse(JSON.stringify(result))
}

/**
 * 提取文本关键词（用于拆分匹配）
 */
function extractKeywords(text) {
  if (!text) return new Set()
  const words = String(text).split(/[\s,，。；;：:\-—_·（）()]+/)
  return new Set(words.filter(w => w.length >= 2))
}

/**
 * 计算文本相似度（Jaccard）
 */
function calculateSimilarity(text1, text2) {
  const words1 = extractKeywords(text1)
  const words2 = extractKeywords(text2)
  if (words1.size === 0 || words2.size === 0) return 0
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])
  return intersection.size / union.size
}

/**
 * 修正分类结果（在内存中操作，返回修正后的副本）
 * @param {object} result 原始分类结果
 * @param {string[]} cardContents 卡片内容数组（用于关键词匹配），可选
 * @returns {object} 修正后的分类结果
 */
export function fixClassificationResult(result, cardContents = []) {
  if (!result || typeof result !== 'object') {
    return result
  }

  const fixed = cloneClassificationResult(result)
  const mode = detectClassificationMode(fixed)

  if (mode === 'chapter-and-unit') {
    // ===== 小单元合并（< 2 张卡片） =====
    for (const ch of fixed.chapters) {
      if (!ch.units || !Array.isArray(ch.units)) continue
      const toMerge = [] // 记录需要合并的单元索引
      for (let i = 0; i < ch.units.length; i++) {
        const cardCount = Array.isArray(ch.units[i].cardIndices) ? ch.units[i].cardIndices.length : 0
        if (cardCount < 2) {
          toMerge.push(i)
        }
      }
      // 从后往前合并（避免索引变化）
      for (let i = toMerge.length - 1; i >= 0; i--) {
        const mergeIdx = toMerge[i]
        const mergedUnit = ch.units[mergeIdx]
        // 找到最近的相邻单元
        const neighborIdx = mergeIdx > 0 ? mergeIdx - 1 : (mergeIdx + 1 < ch.units.length ? mergeIdx + 1 : -1)
        if (neighborIdx >= 0 && neighborIdx < ch.units.length) {
          // 合并到相邻单元
          const neighbor = ch.units[neighborIdx]
          neighbor.cardIndices = [
            ...(neighbor.cardIndices || []),
            ...(mergedUnit.cardIndices || []),
          ]
          // 去除重复
          neighbor.cardIndices = [...new Set(neighbor.cardIndices)]
          ch.units.splice(mergeIdx, 1)
        }
      }
    }

    // ===== 大单元拆分（> 50 张卡片） =====
    for (const ch of fixed.chapters) {
      if (!ch.units || !Array.isArray(ch.units)) continue
      const newUnits = []
      for (const u of ch.units) {
        const cardCount = Array.isArray(u.cardIndices) ? u.cardIndices.length : 0
        if (cardCount > 50) {
          // 按主题关键词拆分
          const cardTexts = u.cardIndices.map(idx => cardContents[idx] || String(idx))
          const subGroups = splitByKeywords(cardTexts, u.cardIndices)
          for (let gi = 0; gi < subGroups.length; gi++) {
            newUnits.push({
              name: gi === 0 ? u.name : `${u.name}-${String.fromCharCode(65 + gi)}`,
              cardIndices: subGroups[gi],
            })
          }
        } else {
          newUnits.push(u)
        }
      }
      ch.units = newUnits
    }

    // ===== 未分配卡片处理 =====
    const allAssigned = new Set()
    for (const ch of fixed.chapters) {
      for (const u of (ch?.units || [])) {
        for (const idx of (u?.cardIndices || [])) {
          allAssigned.add(idx)
        }
      }
    }
    // 找出未分配的卡片
    const unassigned = []
    for (let i = 0; i < cardContents.length; i++) {
      if (!allAssigned.has(i)) {
        unassigned.push(i)
      }
    }
    // 将未分配卡片归入最相似的单元
    for (const idx of unassigned) {
      const cardText = cardContents[idx] || String(idx)
      let bestUnit = null
      let bestScore = -1
      for (const ch of fixed.chapters) {
        for (const u of (ch?.units || [])) {
          const unitText = u.name || ''
          const sampleIdx = (u.cardIndices || [])[0]
          const sampleText = sampleIdx !== undefined ? (cardContents[sampleIdx] || '') : ''
          const score = calculateSimilarity(cardText, unitText + ' ' + sampleText)
          if (score > bestScore) {
            bestScore = score
            bestUnit = { chapter: ch, unit: u }
          }
        }
      }
      if (bestUnit) {
        bestUnit.unit.cardIndices = [...(bestUnit.unit.cardIndices || []), idx]
        allAssigned.add(idx)
      }
    }

  } else if (mode === 'chapter-only') {
    // ===== 小章节合并（< 2 张卡片） =====
    const toMerge = []
    for (let i = 0; i < fixed.chapters.length; i++) {
      const cardCount = Array.isArray(fixed.chapters[i].cardIndices) ? fixed.chapters[i].cardIndices.length : 0
      if (cardCount < 2) {
        toMerge.push(i)
      }
    }
    for (let i = toMerge.length - 1; i >= 0; i--) {
      const mergeIdx = toMerge[i]
      const neighborIdx = mergeIdx > 0 ? mergeIdx - 1 : (mergeIdx + 1 < fixed.chapters.length ? mergeIdx + 1 : -1)
      if (neighborIdx >= 0 && neighborIdx < fixed.chapters.length) {
        fixed.chapters[neighborIdx].cardIndices = [
          ...(fixed.chapters[neighborIdx].cardIndices || []),
          ...(fixed.chapters[mergeIdx].cardIndices || []),
        ]
        fixed.chapters[neighborIdx].cardIndices = [...new Set(fixed.chapters[neighborIdx].cardIndices)]
        fixed.chapters.splice(mergeIdx, 1)
      }
    }

    // ===== 大章节拆分（> 50 张卡片） =====
    const newChapters = []
    for (const ch of fixed.chapters) {
      const cardCount = Array.isArray(ch.cardIndices) ? ch.cardIndices.length : 0
      if (cardCount > 50) {
        const cardTexts = ch.cardIndices.map(idx => cardContents[idx] || String(idx))
        const subGroups = splitByKeywords(cardTexts, ch.cardIndices)
        for (let gi = 0; gi < subGroups.length; gi++) {
          newChapters.push({
            name: gi === 0 ? ch.name : `${ch.name}-${String.fromCharCode(65 + gi)}`,
            cardIndices: subGroups[gi],
          })
        }
      } else {
        newChapters.push(ch)
      }
    }
    fixed.chapters = newChapters

    // ===== 未分配卡片处理 =====
    const allAssigned = new Set()
    for (const ch of fixed.chapters) {
      for (const idx of (ch?.cardIndices || [])) {
        allAssigned.add(idx)
      }
    }
    const unassigned = []
    for (let i = 0; i < cardContents.length; i++) {
      if (!allAssigned.has(i)) {
        unassigned.push(i)
      }
    }
    for (const idx of unassigned) {
      const cardText = cardContents[idx] || String(idx)
      let bestChapter = null
      let bestScore = -1
      for (const ch of fixed.chapters) {
        const sampleIdx = (ch.cardIndices || [])[0]
        const sampleText = sampleIdx !== undefined ? (cardContents[sampleIdx] || '') : ''
        const score = calculateSimilarity(cardText, ch.name + ' ' + sampleText)
        if (score > bestScore) {
          bestScore = score
          bestChapter = ch
        }
      }
      if (bestChapter) {
        bestChapter.cardIndices = [...(bestChapter.cardIndices || []), idx]
        allAssigned.add(idx)
      }
    }

  } else if (mode === 'unit-only') {
    // ===== 小单元合并（< 2 张卡片） =====
    const toMerge = []
    for (let i = 0; i < fixed.units.length; i++) {
      const cardCount = Array.isArray(fixed.units[i].cardIndices) ? fixed.units[i].cardIndices.length : 0
      if (cardCount < 2) {
        toMerge.push(i)
      }
    }
    for (let i = toMerge.length - 1; i >= 0; i--) {
      const mergeIdx = toMerge[i]
      const neighborIdx = mergeIdx > 0 ? mergeIdx - 1 : (mergeIdx + 1 < fixed.units.length ? mergeIdx + 1 : -1)
      if (neighborIdx >= 0 && neighborIdx < fixed.units.length) {
        fixed.units[neighborIdx].cardIndices = [
          ...(fixed.units[neighborIdx].cardIndices || []),
          ...(fixed.units[mergeIdx].cardIndices || []),
        ]
        fixed.units[neighborIdx].cardIndices = [...new Set(fixed.units[neighborIdx].cardIndices)]
        fixed.units.splice(mergeIdx, 1)
      }
    }

    // ===== 大单元拆分（> 50 张卡片） =====
    const newUnits = []
    for (const u of fixed.units) {
      const cardCount = Array.isArray(u.cardIndices) ? u.cardIndices.length : 0
      if (cardCount > 50) {
        const cardTexts = u.cardIndices.map(idx => cardContents[idx] || String(idx))
        const subGroups = splitByKeywords(cardTexts, u.cardIndices)
        for (let gi = 0; gi < subGroups.length; gi++) {
          newUnits.push({
            name: gi === 0 ? u.name : `${u.name}-${String.fromCharCode(65 + gi)}`,
            cardIndices: subGroups[gi],
          })
        }
      } else {
        newUnits.push(u)
      }
    }
    fixed.units = newUnits

    // ===== 未分配卡片处理 =====
    const allAssigned = new Set()
    for (const u of fixed.units) {
      for (const idx of (u?.cardIndices || [])) {
        allAssigned.add(idx)
      }
    }
    const unassigned = []
    for (let i = 0; i < cardContents.length; i++) {
      if (!allAssigned.has(i)) {
        unassigned.push(i)
      }
    }
    for (const idx of unassigned) {
      const cardText = cardContents[idx] || String(idx)
      let bestUnit = null
      let bestScore = -1
      for (const u of fixed.units) {
        const unitText = u.name || ''
        const sampleIdx = (u.cardIndices || [])[0]
        const sampleText = sampleIdx !== undefined ? (cardContents[sampleIdx] || '') : ''
        const score = calculateSimilarity(cardText, unitText + ' ' + sampleText)
        if (score > bestScore) {
          bestScore = score
          bestUnit = u
        }
      }
      if (bestUnit) {
        bestUnit.cardIndices = [...(bestUnit.cardIndices || []), idx]
        allAssigned.add(idx)
      }
    }
  }

  return fixed
}

/**
 * 按关键词将卡片分组（用于大单元拆分）
 */
function splitByKeywords(cardTexts, cardIndices) {
  if (cardTexts.length <= 50) {
    return [cardIndices]
  }

  // 简单策略：均匀拆分
  const targetGroupSize = 25
  const groups = []
  let currentGroup = []
  let currentIndices = []

  for (let i = 0; i < cardTexts.length; i++) {
    currentGroup.push(cardTexts[i])
    currentIndices.push(cardIndices[i])

    if (currentGroup.length >= targetGroupSize) {
      groups.push(currentIndices)
      currentGroup = []
      currentIndices = []
    }
  }

  if (currentGroup.length > 0) {
    if (groups.length > 0 && groups[groups.length - 1].length + currentGroup.length <= targetGroupSize * 1.5) {
      // 合并到最后一组（避免太小的组）
      groups[groups.length - 1].push(...currentIndices)
    } else {
      groups.push(currentIndices)
    }
  }

  return groups
}

// ============================================================
// 知识体系构建流水线：生成新主题/单元 + 合并判断 + 循环控制
// ============================================================

/**
 * 判断是否为弱模型（Spark Lite）
 */
function isWeakModel(aiConfig) {
  return aiConfig?.aiServiceMode === 'iflytek-spark' && (!aiConfig?.model || aiConfig.model === 'lite')
}

/**
 * 从 AI 响应中提取 JSON 数组（处理 markdown 代码块等）
 */
function extractJsonArrayFromResponse(rawContent) {
  if (!rawContent) return null
  let text = String(rawContent).trim()

  // 去除 markdown 代码块
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // 尝试直接解析
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
  } catch (_) { /* continue */ }

  // 正则提取 JSON 数组
  const arrMatch = text.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0])
      if (Array.isArray(parsed)) return parsed
    } catch (_) { /* continue */ }
  }

  return null
}

/**
 * Task 1: 生成新主题和单元（仅生成新章节/单元，不涉及已有结构链接）
 *
 * @param {Array} finalTopics - [{topicName, pointIndices}]
 * @param {Array} flatNewCards - 卡片数组，每张卡片有 kpIndex 字段
 * @param {Array} knowledgePoints - 知识点字符串数组
 * @param {Object} aiConfig - {aiServiceMode, apiKey, model, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey}
 * @returns {Promise<Array>} [{cardIndex, newChapterName, newUnitName}, ...]
 */
export async function generateNewTopicsAndUnits(finalTopics, flatNewCards, knowledgePoints, aiConfig) {

  if (!finalTopics || finalTopics.length === 0) {
    return []
  }
  if (!flatNewCards || flatNewCards.length === 0) {
    return []
  }

  // 如果 finalTopics 已经包含 units 字段（新格式），直接根据 units 映射
  if (finalTopics[0].units) {
    
    const assignments = []
    const unassignedCardIndices = new Set(flatNewCards.map((_, i) => i))
    const topicStats = {}  // 统计每主题分配情况
    for (const topic of finalTopics) {
      let topicAssigned = 0
      for (const unit of (topic.units || [])) {
        let unitAssigned = 0
        const matchedCardIndices = []
        for (const kpIdx of (unit.pointIndices || [])) {
          const matchingCards = flatNewCards
            .map((card, i) => ({ card, index: i }))
            .filter(({ card }) => card.kpIndex !== null && card.kpIndex !== undefined && Number(card.kpIndex) === Number(kpIdx))
          for (const { index } of matchingCards) {
            const chapterName = topic.chapterName || topic.topicName
            assignments.push({
              cardIndex: index,
              newChapterName: chapterName,
              newUnitName: unit.unitName,
            })
            unassignedCardIndices.delete(index)
            unitAssigned++
            matchedCardIndices.push(index)
          }
        }
        if (unitAssigned > 0) {
        } else {
        }
        topicAssigned += unitAssigned
      }
      topicStats[topic.topicName] = topicAssigned
    }
    if (unassignedCardIndices.size > 0) {
      console.warn('[generateNewTopicsAndUnits] 未分配卡片详情（前5个）: %s', 
        [...unassignedCardIndices].slice(0, 5).map(i => {
          const c = flatNewCards[i]
          return `cardIdx=${i} kpIndex=${c.kpIndex} kp="${String(c.knowledge_point || '').slice(0, 30)}"`
        }).join(' | '))
    }
    
    // 【修复】为 kpIndex 为 null 的卡片尝试通过文本匹配分配
    const kpIndexMap = new Map()
    for (const topic of finalTopics) {
      for (const unit of (topic.units || [])) {
        for (const kpIdx of (unit.pointIndices || [])) {
          const key = Number(kpIdx)
          if (!kpIndexMap.has(key)) {
            kpIndexMap.set(key, { topicName: topic.topicName, chapterName: topic.chapterName || topic.topicName, unitName: unit.unitName })
          }
        }
      }
    }
    // 先尝试用 kpIndex 补充分配
    let kpIndexSupplied = 0
    const kpIndexSuppliedDetails = []
    for (const cardIdx of [...unassignedCardIndices]) {
      const card = flatNewCards[cardIdx]
      const kpIndex = card.kpIndex
      if (kpIndex !== null && kpIndex !== undefined) {
        const mapping = kpIndexMap.get(Number(kpIndex))
        if (mapping) {
          assignments.push({
            cardIndex: cardIdx,
            newChapterName: mapping.chapterName || mapping.topicName,
            newUnitName: mapping.unitName,
          })
          unassignedCardIndices.delete(cardIdx)
          kpIndexSupplied++
          kpIndexSuppliedDetails.push(`cardIdx=${cardIdx} kpIdx=${kpIndex}→${mapping.chapterName || mapping.topicName}/${mapping.unitName}`)
        } else {
          // 此 kpIndex 不在 kpIndexMap 中
          console.warn('[generateNewTopicsAndUnits]   kpIndex=%d (cardIdx=%d) 不在 kpIndexMap 中', kpIndex, cardIdx)
        }
      }
    }
    if (kpIndexSupplied > 0) {
    } else {
    }
    
    // 对于仍有 kpIndex 但不在映射中的卡片，尝试匹配 topic.pointIndices
    let pointIndicesSupplied = 0
    const pointIndicesSuppliedDetails = []
    for (const cardIdx of [...unassignedCardIndices]) {
      const card = flatNewCards[cardIdx]
      const kpIndex = card.kpIndex
      if (kpIndex !== null && kpIndex !== undefined) {
        for (const topic of finalTopics) {
          if (topic.pointIndices && topic.pointIndices.map(Number).includes(Number(kpIndex))) {
            const defaultUnit = (topic.units && topic.units[0]) ? topic.units[0].unitName : '默认单元'
            assignments.push({
              cardIndex: cardIdx,
              newChapterName: topic.chapterName || topic.topicName,
              newUnitName: defaultUnit,
            })
            unassignedCardIndices.delete(cardIdx)
            pointIndicesSupplied++
            pointIndicesSuppliedDetails.push(`cardIdx=${cardIdx} kpIdx=${kpIndex}→topLevel[${topic.topicName}]/${defaultUnit}`)
            break
          }
        }
      }
    }
    if (pointIndicesSupplied > 0) {
    } else {
    }
    
    // 【修复】kpIndex 为 null 的卡片：通过知识点文本匹配回退
    const textMatchSuppliedDetails = []
    const textMatchFailedDetails = []
    if (unassignedCardIndices.size > 0) {
      console.warn('[generateNewTopicsAndUnits] ── 文本匹配回退: %d 卡片待处理 ──', unassignedCardIndices.size)
      // 构建知识点文本 → topic/unit 映射
      const kpTextMap = new Map()
      for (const topic of finalTopics) {
        for (const unit of (topic.units || [])) {
          for (const kpIdx of (unit.pointIndices || [])) {
            const kpText = knowledgePoints[Number(kpIdx)]
            if (kpText && !kpTextMap.has(kpText)) {
              kpTextMap.set(kpText, { topicName: topic.topicName, chapterName: topic.chapterName || topic.topicName, unitName: unit.unitName })
            }
          }
        }
      }
      for (const cardIdx of [...unassignedCardIndices]) {
        const card = flatNewCards[cardIdx]
        const kpText = card.knowledge_point
        if (kpText) {
          const mapping = kpTextMap.get(kpText)
          if (mapping) {
            assignments.push({
              cardIndex: cardIdx,
              newChapterName: mapping.chapterName || mapping.topicName,
              newUnitName: mapping.unitName,
            })
            unassignedCardIndices.delete(cardIdx)
            textMatchSuppliedDetails.push(`cardIdx=${cardIdx} "${kpText.slice(0, 20)}"→${mapping.chapterName || mapping.topicName}/${mapping.unitName}`)
          } else {
            textMatchFailedDetails.push(`cardIdx=${cardIdx} kpIndex=${card.kpIndex} kpText="${kpText.slice(0, 30)}"`)
          }
        }
      }
      if (textMatchSuppliedDetails.length > 0) {
      }
      if (textMatchFailedDetails.length > 0) {
        console.warn('[generateNewTopicsAndUnits] 文本匹配失败详情（前10个）: %s', textMatchFailedDetails.slice(0, 10).join(' | '))
      }
    }
    

    // 【修复】如果直接映射有结果，直接返回；如果为空，回退到 AI 聚类
    if (assignments.length > 0) {
      // 如果仍有未分配卡片，使用默认分配
      const defaultSuppliedDetails = []
      if (unassignedCardIndices.size > 0) {
        console.warn('[generateNewTopicsAndUnits] ── 默认分配: %d 卡片待处理 ──', unassignedCardIndices.size)
        const defaultTopic = finalTopics[0] || { topicName: '未归类', units: [{ unitName: '默认单元' }] }
        const defaultUnit = (defaultTopic.units && defaultTopic.units[0]) ? defaultTopic.units[0].unitName : '默认单元'
        for (const cardIdx of unassignedCardIndices) {
          const card = flatNewCards[cardIdx]
          assignments.push({
            cardIndex: cardIdx,
            newChapterName: defaultTopic.chapterName || defaultTopic.topicName,
            newUnitName: defaultUnit,
          })
          defaultSuppliedDetails.push(`cardIdx=${cardIdx} kpIndex=${card.kpIndex} kp="${String(card.knowledge_point || '').slice(0, 20)}"`)
        }
      } else {
      }
      // 最终统计：按 主题|单元 分组
      const finalStats = {}
      for (const a of assignments) {
        const key = `${a.newChapterName}|${a.newUnitName}`
        finalStats[key] = (finalStats[key] || 0) + 1
      }
      // 按主题汇总
      const chapterSummary = {}
      for (const a of assignments) {
        if (!chapterSummary[a.newChapterName]) chapterSummary[a.newChapterName] = 0
        chapterSummary[a.newChapterName]++
      }

      // 数据一致性校验
      if (assignments.length !== flatNewCards.length) {
        console.warn(`[generateNewTopicsAndUnits] ⚠ 数据不匹配! assignments=${assignments.length} vs flatNewCards=${flatNewCards.length}, 差值=${flatNewCards.length - assignments.length}`)
        // 列出未分配的 cardIndex
        const assignedIndices = new Set(assignments.map(a => a.cardIndex))
        const missingIndices = []
        for (let i = 0; i < flatNewCards.length; i++) {
          if (!assignedIndices.has(i)) missingIndices.push(i)
        }
        console.warn(`[generateNewTopicsAndUnits] 未分配 cardIndices (${missingIndices.length}个): ${missingIndices.slice(0, 20).join(',')}${missingIndices.length > 20 ? '...' : ''}`)
      } else {
      }

      return assignments
    }
    
    console.warn('[generateNewTopicsAndUnits] 直接映射为空，回退到 AI 聚类')
  }
  const weakModel = isWeakModel(aiConfig)

  if (weakModel) {
    return generateNewTopicsAndUnitsWeak(finalTopics, flatNewCards, knowledgePoints, aiConfig)
  }

  return generateNewTopicsAndUnitsStrong(finalTopics, flatNewCards, knowledgePoints, aiConfig)
}

/**
 * 强模型路径：单次 AI 调用
 */
async function generateNewTopicsAndUnitsStrong(finalTopics, flatNewCards, knowledgePoints, aiConfig) {

  // 构建主题信息
  const topicLines = finalTopics.map((t, i) => {
    const kps = (t.pointIndices || []).map(idx => knowledgePoints[idx] || '').filter(Boolean)
    return `【主题${i}】${t.topicName}（包含知识点：${kps.slice(0, 5).join('；')}${kps.length > 5 ? '...' : ''}）`
  }).join('\n')

  // 构建卡片信息
  const cardLines = flatNewCards.map((c, i) => {
    const kp = c.kpIndex !== undefined && c.kpIndex < knowledgePoints.length
      ? knowledgePoints[c.kpIndex]
      : ''
    return `卡片${i}: 知识点="${kp}" | Q="${String(c.front || '').slice(0, 80)}" | A="${String(c.back || '').slice(0, 80)}"`
  }).join('\n')


  const prompt = `你是知识体系整理专家。请根据用户确认的主题分组，将每张卡片分配到对应的主题（章节）和单元。每个主题内，按语义将卡片分组为2-5个单元。

【用户确认的主题分组】：
${topicLines}

【待分配的卡片】：
${cardLines}

【输出要求】：
1. 每张卡片必须分配到一个新章节（newChapterName）和一个新单元（newUnitName）
2. 新章节名必须与用户确认的主题名一致，不要修改
3. 每个主题下创建2-5个单元，单元名使用宽泛的概括性命名（不超过16个字）
4. 按卡片语义相似度分组到同一单元

【输出格式】严格以JSON数组格式返回，不要任何额外文字：
[{"cardIndex": 0, "newChapterName": "主题名", "newUnitName": "单元名"}, ...]`

  try {
    const { content } = await callAiProvider(prompt, {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      aiServiceMode: aiConfig.aiServiceMode,
      sparkApiKey: aiConfig.sparkApiKey,
      sparkApiSecret: aiConfig.sparkApiSecret,
      volcanoApiKey: aiConfig.volcanoApiKey,
      dashscopeApiKey: aiConfig.dashscopeApiKey,
      temperature: 0.3,
      maxTokens: 4096,
    })


    const assignments = extractJsonArrayFromResponse(content)
    if (!assignments || assignments.length === 0) {
      console.warn('[generateNewTopicsAndUnits:strong] AI 返回无效结果（assignments为空），使用降级分配')
      return fallbackGenerateTopicsAndUnits(finalTopics, flatNewCards)
    }

    // 验证并修正结果
    const validated = validateAndFixAssignments(assignments, flatNewCards.length, finalTopics)
    
    // 最终统计
    const finalStats = {}
    for (const a of validated) {
      const key = `${a.newChapterName}|${a.newUnitName}`
      finalStats[key] = (finalStats[key] || 0) + 1
    }
    return validated

  } catch (err) {
    console.error('[generateNewTopicsAndUnits:strong] AI 调用失败:', err.message)
    return fallbackGenerateTopicsAndUnits(finalTopics, flatNewCards)
  }
}

/**
 * 弱模型路径（Spark Lite）：多轮调用
 * Round1: 将卡片分配到主题（章节）
 * Round2: 在每个主题内将卡片分组为单元
 */
async function generateNewTopicsAndUnitsWeak(finalTopics, flatNewCards, knowledgePoints, aiConfig) {

  const password = normalizeSparkApiPassword(aiConfig.sparkApiKey)
  if (!password) {
    console.warn('[generateNewTopicsAndUnits:weak] 无 Spark API Key，使用降级分配')
    return fallbackGenerateTopicsAndUnits(finalTopics, flatNewCards)
  }

  const sparkHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + password,
  }

  // ===== Round 1: 将卡片分配到主题 =====

  const topicNames = finalTopics.map(t => t.topicName)
  const topicListStr = topicNames.map((n, i) => `  ${i}. ${n}`).join('\n')

  const cardLinesForRound1 = flatNewCards.map((c, i) => {
    const kp = c.kpIndex !== undefined && c.kpIndex < knowledgePoints.length
      ? knowledgePoints[c.kpIndex]
      : ''
    return `卡片${i}: 知识点="${kp}" | Q="${String(c.front || '').slice(0, 60)}"`
  }).join('\n')

  const round1Prompt = `请将每张卡片归类到用户确认的主题中。每个卡片只能属于一个主题。

【主题列表】：
${topicListStr}

【卡片列表】：
${cardLinesForRound1}

【输出格式】严格以JSON数组格式返回，不要任何额外文字：
[{"cardIndex": 0, "newChapterName": "主题名"}, ...]`

  let chapterAssignments = null
  try {
    const resp = await httpPost(SPARK_URL, {
      headers: sparkHeaders,
      data: {
        model: aiConfig.model || 'lite',
        messages: [{ role: 'user', content: round1Prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      },
      timeout: 30000,
    })

    if (!resp.ok) {
      throw new Error('Spark Round1 failed: ' + (resp.data?.error?.message || 'unknown'))
    }

    const content = resp.data?.choices?.[0]?.message?.content || ''
    chapterAssignments = extractJsonArrayFromResponse(content)
    if (chapterAssignments && chapterAssignments.length > 0) {
      // Round1 成功
    } else {
      console.warn('[generateNewTopicsAndUnits:weak] Round1 返回空或无效')
    }

  } catch (err) {
    console.warn('[generateNewTopicsAndUnits:weak] Round1 失败:', err.message)
  }

  // Round1 降级：按知识点索引分配到对应主题
  if (!chapterAssignments || chapterAssignments.length === 0) {
    console.warn('[generateNewTopicsAndUnits:weak] Round1 返回无效，使用降级分配')
    chapterAssignments = fallbackChapterAssignments(finalTopics, flatNewCards)
  }

  // 构建 cardIndex → chapterName 映射
  const cardToChapter = new Map()
  for (const assign of chapterAssignments) {
    if (assign.cardIndex !== undefined && assign.newChapterName) {
      cardToChapter.set(assign.cardIndex, assign.newChapterName)
    }
  }

  // 补充未分配的卡片
  let unassignedInRound1 = 0
  for (let i = 0; i < flatNewCards.length; i++) {
    if (!cardToChapter.has(i)) {
      unassignedInRound1++
      const card = flatNewCards[i]
      const kp = card.kpIndex !== undefined && card.kpIndex < knowledgePoints.length
        ? knowledgePoints[card.kpIndex]
        : ''
      // 查找匹配的主题
      let matched = false
      for (const topic of finalTopics) {
        const topicKps = (topic.pointIndices || []).map(idx => knowledgePoints[idx] || '')
        if (topicKps.includes(kp)) {
          cardToChapter.set(i, topic.topicName)
          matched = true
          break
        }
      }
      if (!matched) {
        cardToChapter.set(i, finalTopics[0].topicName) // 默认归入第一个主题
      }
    }
  }
  if (unassignedInRound1 > 0) {
    console.warn('[generateNewTopicsAndUnits:weak] Round1 补充: %d 卡片未分配已补全', unassignedInRound1)
  } else {
  }

  // ===== Round 2: 在每个主题内将卡片分组为单元 =====

  // 按主题分组卡片
  const chapterCards = new Map() // chapterName → [{cardIndex, front, back}]
  for (let i = 0; i < flatNewCards.length; i++) {
    const chapterName = cardToChapter.get(i) || finalTopics[0].topicName
    if (!chapterCards.has(chapterName)) {
      chapterCards.set(chapterName, [])
    }
    chapterCards.get(chapterName).push({
      cardIndex: i,
      front: String(flatNewCards[i].front || ''),
      back: String(flatNewCards[i].back || ''),
    })
  }

  const allUnitAssignments = [] // [{cardIndex, newUnitName}]

  for (const [chapterName, cards] of chapterCards) {

    const cardLinesForRound2 = cards.map((c, i) =>
      `卡片${c.cardIndex}: Q="${c.front.slice(0, 60)}" | A="${c.back.slice(0, 60)}"`
    ).join('\n')

    const round2Prompt = `请将以下主题"${chapterName}"下的卡片按语义分组为2-5个单元。每个单元包含语义相近的卡片。

【卡片列表】：
${cardLinesForRound2}

【输出格式】严格以JSON数组格式返回，不要任何额外文字：
[{"cardIndex": 0, "newUnitName": "单元名"}, ...]`

    let unitAssignments = null
    let timeoutOccurred = false

    try {
      const resp = await httpPost(SPARK_URL, {
        headers: sparkHeaders,
        data: {
          model: aiConfig.model || 'lite',
          messages: [{ role: 'user', content: round2Prompt }],
          temperature: 0.3,
          max_tokens: 2048,
        },
        timeout: 30000,
      })

      if (!resp.ok) {
        throw new Error('Spark Round2 failed: ' + (resp.data?.error?.message || 'unknown'))
      }

      const content = resp.data?.choices?.[0]?.message?.content || ''
      unitAssignments = extractJsonArrayFromResponse(content)

    } catch (err) {
      console.warn(`[generateNewTopicsAndUnits:weak] Round2 "${chapterName}" 失败:`, err.message)
      timeoutOccurred = true
    }

    // Round2 降级：为此章节的所有卡片创建 fallback 单元分配
    if (!unitAssignments || unitAssignments.length === 0 || timeoutOccurred) {
      console.warn(`[generateNewTopicsAndUnits:weak] Round2 "${chapterName}" 使用降级单元分配`)
      unitAssignments = fallbackUnitAssignments(cards, chapterName)
    }

    for (const assign of unitAssignments) {
      if (assign.cardIndex !== undefined && assign.newUnitName) {
        allUnitAssignments.push(assign)
      }
    }
  }

  // 构建最终结果：合并 chapterName 和 unitName
  const finalAssignments = []
  const unassignedUnitCards = []
  for (let i = 0; i < flatNewCards.length; i++) {
    const chapterName = cardToChapter.get(i) || finalTopics[0].topicName
    const unitAssign = allUnitAssignments.find(a => a.cardIndex === i)
    const unitName = unitAssign?.newUnitName || `${chapterName}-默认单元`

    if (!unitAssign) {
      unassignedUnitCards.push(`cardIdx=${i} chapter="${chapterName}"`)
    }

    finalAssignments.push({
      cardIndex: i,
      newChapterName: chapterName,
      newUnitName: unitName,
    })
  }

  if (unassignedUnitCards.length > 0) {
    console.warn('[generateNewTopicsAndUnits:weak] %d 卡片未分配到单元，使用默认单元名: %s', 
      unassignedUnitCards.length, unassignedUnitCards.slice(0, 10).join(' | '))
  }

  // 最终统计
  const finalStats = {}
  const chapterSummary = {}
  for (const a of finalAssignments) {
    const key = `${a.newChapterName}|${a.newUnitName}`
    finalStats[key] = (finalStats[key] || 0) + 1
    chapterSummary[a.newChapterName] = (chapterSummary[a.newChapterName] || 0) + 1
  }
  return finalAssignments
}

/**
 * 验证并修正 AI 返回的分配结果
 */
function validateAndFixAssignments(assignments, totalCards, finalTopics) {
  const topicNames = new Set(finalTopics.map(t => t.topicName))
  const result = []

  for (const assign of assignments) {
    if (assign.cardIndex === undefined || assign.cardIndex < 0 || assign.cardIndex >= totalCards) {
      continue
    }
    const chapterName = assign.newChapterName || topicNames.values().next().value || '默认章节'
    const unitName = assign.newUnitName || `${chapterName}-默认单元`

    result.push({
      cardIndex: assign.cardIndex,
      newChapterName: chapterName,
      newUnitName: unitName,
    })
  }

  // 补充未分配的卡片
  const assignedIndices = new Set(result.map(a => a.cardIndex))
  for (let i = 0; i < totalCards; i++) {
    if (!assignedIndices.has(i)) {
      const defaultChapter = topicNames.values().next().value || '默认章节'
      result.push({
        cardIndex: i,
        newChapterName: defaultChapter,
        newUnitName: `${defaultChapter}-默认单元`,
      })
    }
  }

  return result
}

/**
 * 降级：按知识点索引将卡片分配到对应主题
 */
function fallbackChapterAssignments(finalTopics, flatNewCards) {
  const assignments = []
  // 构建 知识点 → 主题名 映射
  const kpToTopic = new Map()
  for (const topic of finalTopics) {
    for (const idx of (topic.pointIndices || [])) {
      if (!kpToTopic.has(idx)) {
        kpToTopic.set(idx, topic.chapterName || topic.topicName)
      }
    }
  }

  for (let i = 0; i < flatNewCards.length; i++) {
    const card = flatNewCards[i]
    const topicName = kpToTopic.get(card.kpIndex) || finalTopics[0]?.topicName || '默认章节'
    assignments.push({ cardIndex: i, newChapterName: topicName })
  }

  return assignments
}

/**
 * 降级：为卡片创建默认单元分配
 */
function fallbackUnitAssignments(cards, chapterName) {
  if (cards.length <= 5) {
    // 卡片少，全部放入一个单元
    return cards.map(c => ({
      cardIndex: c.cardIndex,
      newUnitName: `${chapterName}-基础`,
    }))
  }

  // 卡片多，均匀分为2-5个单元
  const unitCount = Math.min(5, Math.max(2, Math.ceil(cards.length / 8)))
  const perUnit = Math.ceil(cards.length / unitCount)
  const assignments = []

  for (let i = 0; i < cards.length; i++) {
    const unitIdx = Math.floor(i / perUnit)
    assignments.push({
      cardIndex: cards[i].cardIndex,
      newUnitName: `${chapterName}-分组${unitIdx + 1}`,
    })
  }

  return assignments
}

/**
 * 完全降级：跳过 AI，直接生成分配
 */
function fallbackGenerateTopicsAndUnits(finalTopics, flatNewCards) {
  const assignments = []
  const defaultChapter = finalTopics[0]?.topicName || '默认章节'

  for (let i = 0; i < flatNewCards.length; i++) {
    assignments.push({
      cardIndex: i,
      newChapterName: defaultChapter,
      newUnitName: `${defaultChapter}-默认单元`,
    })
  }

  return assignments
}

/**
 * Task 2: 判断新主题是否应合并到已有主题
 *
 * @param {Map} newTopics - Map<chapterName, {cardIndices[], unitNames[]}>
 * @param {Array} existingChapters - 已有章节数组
 * @param {Array} existingUnits - 已有单元数组
 * @param {Array} newCards - 新卡片数组
 * @param {Object} aiConfig - AI 配置
 * @param {string} categoryId - 分类 ID
 * @returns {Promise<Object>} {mergeDecisions, oldChapterIdsToDelete, unitMigrations}
 */
export async function judgeTopicMerge(newTopics, existingChapters, existingUnits, newCards, aiConfig, categoryId) {

  if (!newTopics || newTopics.size === 0 || !existingChapters || existingChapters.length === 0) {
    return { mergeDecisions: [], oldChapterIdsToDelete: [], unitMigrations: [] }
  }

  const newTopicNames = Array.from(newTopics.keys())
  const weakModel = isWeakModel(aiConfig)

  let mergeDecisions

  if (weakModel) {
    mergeDecisions = await judgeTopicMergeWeak(newTopicNames, newTopics, existingChapters, existingUnits, newCards, aiConfig)
  } else {
    mergeDecisions = await judgeTopicMergeStrong(newTopicNames, newTopics, existingChapters, existingUnits, newCards, aiConfig)
  }

  // 收集需要删除的旧章节 ID 和单元迁移
  const oldChapterIdsToDelete = []
  const unitMigrations = []

  for (const decision of mergeDecisions) {
    if (decision.shouldMerge && decision.oldChapterId) {
      // 将旧章节的单元迁移到新主题名
      const oldChapter = existingChapters.find(ch => ch.id === decision.oldChapterId)
      if (oldChapter) {
        oldChapterIdsToDelete.push(decision.oldChapterId)
        const chapterUnits = (existingUnits || []).filter(u => u.chapterId === decision.oldChapterId)
        for (const unit of chapterUnits) {
          unitMigrations.push({
            fromChapterId: decision.oldChapterId,
            toChapterName: decision.newTopicName,
            unitId: unit.id,
          })
        }
      }
    }
  }


  return { mergeDecisions, oldChapterIdsToDelete, unitMigrations }
}

/**
 * 强模型路径：单次 AI 调用判断主题合并
 */
async function judgeTopicMergeStrong(newTopicNames, newTopics, existingChapters, existingUnits, newCards, aiConfig) {

  // 构建新主题信息
  const newTopicLines = newTopicNames.map(name => {
    const info = newTopics.get(name) || {}
    const sampleCards = ((info.cardIndices || [])).slice(0, 3)
      .map(i => {
        const card = newCards[i]
        return card ? String(card.front || '').slice(0, 40) : ''
      })
      .filter(Boolean)
      .join('；')
    return `【新主题】${name}${sampleCards ? `（卡片示例：${sampleCards}）` : ''}`
  }).join('\n')

  // 构建已有章节信息
  const oldChapterLines = existingChapters.map(ch => {
    const chapterUnits = (existingUnits || []).filter(u => u.chapterId === ch.id)
    const unitNames = chapterUnits.map(u => u.name).slice(0, 5).join('、')
    return `【已有章节】ID=${ch.id} | 名称=${ch.name}${unitNames ? ` | 单元：${unitNames}` : ''}`
  }).join('\n')

  const prompt = `请判断新主题是否应合并到已有主题。比较每组新旧主题的语义相似度，相似度高于0.75则建议合并。

【新主题】：
${newTopicLines}

【已有章节】：
${oldChapterLines}

【判断标准】：
1. 如果新主题与已有章节主题高度相似（>0.75），则 shouldMerge 为 true
2. 如果新主题是全新的主题方向，则 shouldMerge 为 false
3. 一个已有章节最多只能与一个新主题合并

【输出格式】严格以JSON数组格式返回，不要任何额外文字：
[{"newTopicName": "新主题名", "oldChapterId": "已有章节ID（不合并时填null）", "shouldMerge": true/false, "reason": "判断理由"}, ...]`

  try {
    const { content } = await callAiProvider(prompt, {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      aiServiceMode: aiConfig.aiServiceMode,
      sparkApiKey: aiConfig.sparkApiKey,
      sparkApiSecret: aiConfig.sparkApiSecret,
      volcanoApiKey: aiConfig.volcanoApiKey,
      dashscopeApiKey: aiConfig.dashscopeApiKey,
      temperature: 0.3,
      maxTokens: 4096,
    })

    const decisions = extractJsonArrayFromResponse(content)

    if (decisions && decisions.length > 0) {
      return decisions
    }

  } catch (err) {
    console.warn('[judgeTopicMerge:strong] AI 调用失败:', err.message)
  }

  // 降级：使用 simpleTextSimilarity 判断
  return fallbackTopicMergeDecisions(newTopicNames, existingChapters)
}

/**
 * 弱模型路径：分批调用（5 对/批）
 */
async function judgeTopicMergeWeak(newTopicNames, newTopics, existingChapters, existingUnits, newCards, aiConfig) {

  const password = normalizeSparkApiPassword(aiConfig.sparkApiKey)
  if (!password) {
    return fallbackTopicMergeDecisions(newTopicNames, existingChapters)
  }

  const sparkHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + password,
  }

  const BATCH_SIZE = 5
  const allDecisions = []

  for (let i = 0; i < newTopicNames.length; i += BATCH_SIZE) {
    const batchNames = newTopicNames.slice(i, i + BATCH_SIZE)

    const newTopicLines = batchNames.map(name => {
      const info = newTopics.get(name) || {}
      const sampleCards = ((info.cardIndices || [])).slice(0, 2)
        .map(idx => {
          const card = newCards[idx]
          return card ? String(card.front || '').slice(0, 30) : ''
        })
        .filter(Boolean)
        .join('；')
      return `新主题: ${name}${sampleCards ? `（卡片：${sampleCards}）` : ''}`
    }).join('\n')

    const oldChapterLines = existingChapters.map(ch =>
      `已有章节: ID=${ch.id} ${ch.name}`
    ).join('\n')

    const prompt = `请判断每个新主题是否应合并到已有章节。相似度>0.75则合并。

【新主题】：
${newTopicLines}

【已有章节】：
${oldChapterLines}

输出格式：[{"newTopicName": "新主题名", "oldChapterId": "已有章节ID（null表示不合并）", "shouldMerge": true/false}, ...]`

    try {
      const resp = await httpPost(SPARK_URL, {
        headers: sparkHeaders,
        data: {
          model: aiConfig.model || 'lite',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2048,
        },
        timeout: 30000,
      })

      if (!resp.ok) throw new Error('Spark failed')

      const content = resp.data?.choices?.[0]?.message?.content || ''
      const decisions = extractJsonArrayFromResponse(content)

      if (decisions && decisions.length > 0) {
        allDecisions.push(...decisions)
      } else {
        // 该批次使用降级
        const fallback = fallbackTopicMergeDecisions(batchNames, existingChapters)
        allDecisions.push(...fallback)
      }

    } catch (err) {
      console.warn(`[judgeTopicMerge:weak] 批次 ${i} 失败:`, err.message)
      const fallback = fallbackTopicMergeDecisions(batchNames, existingChapters)
      allDecisions.push(...fallback)
    }
  }

  return allDecisions
}

/**
 * 降级：使用 simpleTextSimilarity 判断主题合并
 */
function fallbackTopicMergeDecisions(newTopicNames, existingChapters) {
  const SIMILARITY_THRESHOLD = 0.75
  const decisions = []

  for (const newName of newTopicNames) {
    let bestMatch = null
    let bestScore = 0

    for (const ch of existingChapters) {
      const score = simpleTextSimilarity(newName, ch.name)
      if (score > bestScore) {
        bestScore = score
        bestMatch = ch
      }
    }

    if (bestMatch && bestScore >= SIMILARITY_THRESHOLD) {
      decisions.push({
        newTopicName: newName,
        oldChapterId: bestMatch.id,
        shouldMerge: true,
        reason: `名称相似度 ${bestScore.toFixed(2)} >= ${SIMILARITY_THRESHOLD}`,
      })
    } else {
      decisions.push({
        newTopicName: newName,
        oldChapterId: null,
        shouldMerge: false,
        reason: bestMatch
          ? `名称相似度 ${bestScore.toFixed(2)} < ${SIMILARITY_THRESHOLD}`
          : '无已有章节可比较',
      })
    }
  }

  return decisions
}

/**
 * Task 3: 判断新单元是否应替换已有单元
 *
 * @param {Array} newUnits - [{name, chapterName, cardIndices[]}]
 * @param {Array} existingUnits - 已有单元数组
 * @param {Array} newCards - 新卡片数组
 * @param {Array} existingCardList - 已有卡片数组
 * @param {Object} aiConfig - AI 配置
 * @returns {Promise<Object>} {replaceDecisions, oldUnitIdsToDelete}
 */
export async function judgeUnitMerge(newUnits, existingUnits, newCards, existingCardList, aiConfig) {

  if (!newUnits || newUnits.length === 0 || !existingUnits || existingUnits.length === 0) {
    return { replaceDecisions: [], oldUnitIdsToDelete: [] }
  }

  const weakModel = isWeakModel(aiConfig)

  let replaceDecisions

  if (weakModel) {
    replaceDecisions = await judgeUnitMergeWeak(newUnits, existingUnits, newCards, existingCardList, aiConfig)
  } else {
    replaceDecisions = await judgeUnitMergeStrong(newUnits, existingUnits, newCards, existingCardList, aiConfig)
  }

  const oldUnitIdsToDelete = replaceDecisions
    .filter(d => d.shouldReplace && d.oldUnitId)
    .map(d => d.oldUnitId)


  return { replaceDecisions, oldUnitIdsToDelete }
}

/**
 * 强模型路径：单次 AI 调用判断单元替换
 */
async function judgeUnitMergeStrong(newUnits, existingUnits, newCards, existingCardList, aiConfig) {

  const newUnitLines = newUnits.map((unit, i) => {
    const sampleCards = (unit.cardIndices || []).slice(0, 3)
      .map(idx => {
        const card = newCards[idx]
        return card ? String(card.front || '').slice(0, 40) : ''
      })
      .filter(Boolean)
      .join('；')
    return `【新单元${i}】${unit.name}（所属章节：${unit.chapterName || '未指定'}）${sampleCards ? `（卡片示例：${sampleCards}）` : ''}`
  }).join('\n')

  const oldUnitLines = existingUnits.map((unit, i) => {
    const sampleCards = (existingCardList || [])
      .filter(c => c.unitId === unit.id)
      .slice(0, 3)
      .map(c => String(c.front || '').slice(0, 30))
      .join('；')
    return `【已有单元${i}】ID=${unit.id} | 名称=${unit.name}${sampleCards ? ` | 卡片示例：${sampleCards}` : ''}`
  }).join('\n')

  const prompt = `请判断新单元是否应替换已有单元。比较每组新旧单元的语义相似度，相似度高于0.75则建议替换。

【新单元】：
${newUnitLines}

【已有单元】：
${oldUnitLines}

【判断标准】：
1. 如果新单元与已有单元内容高度相似（>0.75），则 shouldReplace 为 true
2. 如果新单元是全新的内容方向，则 shouldReplace 为 false
3. 一个已有单元最多只能被一个新单元替换

【输出格式】严格以JSON数组格式返回，不要任何额外文字：
[{"newUnitName": "新单元名", "oldUnitId": "已有单元ID（不替换时填null）", "shouldReplace": true/false, "reason": "判断理由"}, ...]`

  try {
    const { content } = await callAiProvider(prompt, {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      aiServiceMode: aiConfig.aiServiceMode,
      sparkApiKey: aiConfig.sparkApiKey,
      sparkApiSecret: aiConfig.sparkApiSecret,
      volcanoApiKey: aiConfig.volcanoApiKey,
      dashscopeApiKey: aiConfig.dashscopeApiKey,
      temperature: 0.3,
      maxTokens: 4096,
    })

    const decisions = extractJsonArrayFromResponse(content)

    if (decisions && decisions.length > 0) {
      return decisions
    }

  } catch (err) {
    console.warn('[judgeUnitMerge:strong] AI 调用失败:', err.message)
  }

  return fallbackUnitMergeDecisions(newUnits, existingUnits)
}

/**
 * 弱模型路径：分批调用（5 对/批）
 */
async function judgeUnitMergeWeak(newUnits, existingUnits, newCards, existingCardList, aiConfig) {

  const password = normalizeSparkApiPassword(aiConfig.sparkApiKey)
  if (!password) {
    return fallbackUnitMergeDecisions(newUnits, existingUnits)
  }

  const sparkHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + password,
  }

  const BATCH_SIZE = 5
  const allDecisions = []

  for (let i = 0; i < newUnits.length; i += BATCH_SIZE) {
    const batchUnits = newUnits.slice(i, i + BATCH_SIZE)

    const newUnitLines = batchUnits.map(unit => {
      const sampleCards = (unit.cardIndices || []).slice(0, 2)
        .map(idx => {
          const card = newCards[idx]
          return card ? String(card.front || '').slice(0, 30) : ''
        })
        .filter(Boolean)
        .join('；')
      return `新单元: ${unit.name}${sampleCards ? `（卡片：${sampleCards}）` : ''}`
    }).join('\n')

    const oldUnitLines = existingUnits.map(u =>
      `已有单元: ID=${u.id} ${u.name}`
    ).join('\n')

    const prompt = `请判断每个新单元是否应替换已有单元。相似度>0.75则替换。

【新单元】：
${newUnitLines}

【已有单元】：
${oldUnitLines}

输出格式：[{"newUnitName": "新单元名", "oldUnitId": "已有单元ID（null表示不替换）", "shouldReplace": true/false}, ...]`

    try {
      const resp = await httpPost(SPARK_URL, {
        headers: sparkHeaders,
        data: {
          model: aiConfig.model || 'lite',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2048,
        },
        timeout: 30000,
      })

      if (!resp.ok) throw new Error('Spark failed')

      const content = resp.data?.choices?.[0]?.message?.content || ''
      const decisions = extractJsonArrayFromResponse(content)

      if (decisions && decisions.length > 0) {
        allDecisions.push(...decisions)
      } else {
        const fallback = fallbackUnitMergeDecisions(batchUnits, existingUnits)
        allDecisions.push(...fallback)
      }

    } catch (err) {
      console.warn(`[judgeUnitMerge:weak] 批次 ${i} 失败:`, err.message)
      const fallback = fallbackUnitMergeDecisions(batchUnits, existingUnits)
      allDecisions.push(...fallback)
    }
  }

  return allDecisions
}

/**
 * 降级：使用 simpleTextSimilarity 判断单元替换
 */
function fallbackUnitMergeDecisions(newUnits, existingUnits) {
  const SIMILARITY_THRESHOLD = 0.75
  const decisions = []

  for (const newUnit of newUnits) {
    let bestMatch = null
    let bestScore = 0

    for (const oldUnit of existingUnits) {
      const score = simpleTextSimilarity(newUnit.name, oldUnit.name)
      if (score > bestScore) {
        bestScore = score
        bestMatch = oldUnit
      }
    }

    if (bestMatch && bestScore >= SIMILARITY_THRESHOLD) {
      decisions.push({
        newUnitName: newUnit.name,
        oldUnitId: bestMatch.id,
        shouldReplace: true,
        reason: `名称相似度 ${bestScore.toFixed(2)} >= ${SIMILARITY_THRESHOLD}`,
      })
    } else {
      decisions.push({
        newUnitName: newUnit.name,
        oldUnitId: null,
        shouldReplace: false,
        reason: bestMatch
          ? `名称相似度 ${bestScore.toFixed(2)} < ${SIMILARITY_THRESHOLD}`
          : '无已有单元可比较',
      })
    }
  }

  return decisions
}

/**
 * Task 4: 循环合并控制（最多 2 轮）
 * 执行: topic merge → unit merge → 检查变化 → 重复
 *
 * @param {Map} newTopics - Map<chapterName, {cardIndices[], unitNames[]}>
 * @param {Array} newUnits - 新单元数组
 * @param {Array} existingChapters - 已有章节数组
 * @param {Array} existingUnits - 已有单元数组
 * @param {Array} newCards - 新卡片数组
 * @param {Object} aiConfig - AI 配置
 * @param {string} categoryId - 分类 ID
 * @returns {Promise<Object>} {finalTopics, finalUnits, deletedChapterIds, deletedUnitIds, unitMigrations}
 */
export async function loopMergeControl(newTopics, newUnits, existingChapters, existingUnits, newCards, aiConfig, categoryId) {

  const originalUnits = JSON.parse(JSON.stringify(newUnits || []))

  const MAX_ROUNDS = 2
  let currentTopics = new Map(newTopics)
  let currentUnits = [...(newUnits || [])]
  const allDeletedChapterIds = []
  const allDeletedUnitIds = []
  const allUnitMigrations = []

  for (let round = 1; round <= MAX_ROUNDS; round++) {

    // 步骤 1: 主题合并判断
    const topicMergeResult = await judgeTopicMerge(
      currentTopics,
      existingChapters,
      existingUnits,
      newCards,
      aiConfig,
      categoryId
    )

    const { mergeDecisions, oldChapterIdsToDelete, unitMigrations } = topicMergeResult

    // 更新主题映射：合并的主题使用已有章节
    const mergedTopicNames = new Set()
    for (const decision of mergeDecisions) {
      if (decision.shouldMerge && decision.oldChapterId) {
        mergedTopicNames.add(decision.newTopicName)
        // 将该主题的卡片从 currentTopics 中移除（它们将归入已有章节）
        currentTopics.delete(decision.newTopicName)
      }
    }

    allDeletedChapterIds.push(...oldChapterIdsToDelete)
    allUnitMigrations.push(...unitMigrations)

    // 步骤 2: 单元替换判断
    // 从 currentUnits 中过滤出未被合并主题的单元
    const remainingUnits = currentUnits.filter(u => !mergedTopicNames.has(u.chapterName))

    const unitMergeResult = await judgeUnitMerge(
      remainingUnits,
      existingUnits,
      newCards,
      null, // existingCardList 可以从外部传入
      aiConfig
    )

    const { replaceDecisions, oldUnitIdsToDelete } = unitMergeResult

    // 过滤掉被替换的单元
    const replacedUnitNames = new Set(
      replaceDecisions.filter(d => d.shouldReplace).map(d => d.newUnitName)
    )
    // [fix-P1] 在过滤前，将被替换单元的 cardIndices 迁移到同章节下未被替换的单元，避免卡片丢失
    for (const unit of currentUnits) {
      if (replacedUnitNames.has(unit.name) && unit.cardIndices && unit.cardIndices.length > 0) {
        const targetUnit = currentUnits.find(u => !replacedUnitNames.has(u.name) && u.chapterName === unit.chapterName)
        if (targetUnit) {
          targetUnit.cardIndices = [...(targetUnit.cardIndices || []), ...unit.cardIndices]
        } else {
          console.warn(`[loopMergeControl] 单元"${unit.name}"的 ${unit.cardIndices.length} 张卡片无法找到迁移目标（同章节无可用单元）`)
        }
      }
    }
    currentUnits = currentUnits.filter(u => !replacedUnitNames.has(u.name))

    allDeletedUnitIds.push(...oldUnitIdsToDelete)

    // 步骤 3: 检查是否有变化
    const hasChanges = mergeDecisions.some(d => d.shouldMerge) ||
      replaceDecisions.some(d => d.shouldReplace)

    if (!hasChanges) {
      break
    }

  }

  const result = {
    finalTopics: currentTopics,
    finalUnits: currentUnits,
    deletedChapterIds: [...new Set(allDeletedChapterIds)],
    deletedUnitIds: [...new Set(allDeletedUnitIds)],
    unitMigrations: allUnitMigrations,
  }


  const originalCardCount = originalUnits.reduce((sum, u) => sum + (u.cardIndices?.length || 0), 0)
  const finalCardCount = result.finalUnits.reduce((sum, u) => sum + (u.cardIndices?.length || 0), 0)
  if (originalCardCount !== finalCardCount) {
    console.warn(`[loopMergeControl] ⚠ 卡片数量不匹配! 原始=${originalCardCount} vs 最终=${finalCardCount}, 差值=${originalCardCount - finalCardCount}`)
  }

  return result
}

export async function classifyCardsByCategoryContent(existingUnits, existingCards, newCards, config) {
  if (!newCards || newCards.length === 0) return []

  const mode = config?.mode || 'new-card-classify'
  const classificationDepth = config?.classificationDepth || 'unit-only'
  const existingChapters = config?.existingChapters || []
  const categoryPurpose = config?.categoryPurpose || ''  // 分类目的
  const isSpark = config?.aiServiceMode === 'iflytek-spark'
  const isVolcano = config?.aiServiceMode === 'volcano'
  const isDashscope = config?.aiServiceMode === 'dashscope'
  const hasApi = isSpark
    ? !!config?.sparkApiKey
    : isVolcano
      ? !!config?.volcanoApiKey
      : isDashscope
        ? !!config?.dashscopeApiKey
        : !!config?.apiKey

  // 仅 Spark Lite 不支持 AI 全权归类（cross-category-auto）和 智能单元整理（same-category-reorganize）
  // 其他 Spark 模型（如 Pro/Max）可走通用强模型路径
  const weakModel = isSpark && (config?.model || '').includes('lite')
  if (weakModel && mode === 'cross-category-auto') {
    throw new Error('AI 全权归类需要较强的语义理解能力，Spark Lite 暂不支持，请切换至 DeepSeek/Qwen/Spark Pro 等更强模型后再试。')
  }
  if (weakModel && mode === 'same-category-reorganize') {
    throw new Error('智能单元整理需要较强的语义理解能力，Spark Lite 暂不支持，请切换至 DeepSeek/Qwen/Spark Pro 等更强模型后再试。')
  }
  const knowledgePoints = config?.knowledgePoints
  const kpMarkers = config?.kpMarkers
  if (weakModel && mode === 'new-card-classify' && classificationDepth === 'chapter-and-unit' && hasApi) {
    return classifyCardsByKnowledgePointsMultiRound(knowledgePoints, kpMarkers, existingUnits || [], existingChapters || [], newCards || [], config || {})
  }

  // 弱模型（Spark Lite）走知识点分类路径
  if (weakModel && mode === 'new-card-classify') {
    if (hasApi && knowledgePoints && knowledgePoints.length > 0 && kpMarkers && kpMarkers.length > 0) {
      return classifyCardsByKnowledgePoints(knowledgePoints, kpMarkers, existingUnits || [], newCards || [], config || {}, existingChapters || [], classificationDepth)
    }
    // 无 API 或无知识点：降级到 fallbackClassify
    return fallbackClassify(existingUnits, newCards)
  }

  if (mode === 'same-category-reorganize') {
    return classifySameCategoryReorganize(existingUnits || [], existingCards || [], newCards || [], config || {}, hasApi, classificationDepth, existingChapters, categoryPurpose)
  }

  if (mode === 'cross-category-auto') {
    const allCategories = config?.allCategories || []
    return classifyCrossCategoryAuto(existingUnits || [], existingCards || [], newCards || [], config || {}, hasApi, classificationDepth, categoryPurpose, existingChapters || [], allCategories)
  }

  // === 强模型归类优化：根据卡片总数选择路径 ===
  // 统计现有卡片总数
  const totalExistingCards = (existingCards || []).length
  const isLargeData = totalExistingCards > STRONG_CLASSIFY_CARD_THRESHOLD


  if (isLargeData && hasApi && classificationDepth === 'chapter-and-unit' && existingChapters && existingChapters.length > 0) {
    // 大数据路径：多轮分批处理
    return classifyCardsMultiRound(existingUnits || [], existingCards || [], newCards, config, existingChapters, classificationDepth)
  }
  // === 阈值判断结束 ===

  if (!hasApi) {
    const { matchUnit } = await import('../utils/helpers')
    const assignments = []
    for (let i = 0; i < newCards.length; i++) {
      const c = newCards[i]
      let matched = null
      for (const u of existingUnits || []) {
        if (!u?.name) continue
        const nLower = u.name.toLowerCase()
        const frontLower = String(c.front || '').toLowerCase()
        if (nLower.length >= 2 && frontLower.includes(nLower)) {
          matched = u
          break
        }
      }
      if (!matched) {
        matched = matchUnit(existingUnits || [], c.front?.slice(0, 10) || '')
      }
      if (matched) {
        assignments.push({ cardIndex: i, unitId: matched.id, newUnitName: null })
      } else {
        const suggestedName = (c.front || '新单元').slice(0, 14)
        assignments.push({ cardIndex: i, unitId: null, newUnitName: suggestedName })
      }
    }
    return assignments
  }

  // 构建章节上下文（用于 chapter-and-unit 和 chapter-only 模式）
  const chapterBlocks = []
  const chapterIdsByIndex = []
  const chapterUnitIdsMap = new Map() // Map<chapterIndex, unitId[]> 每章节独立单元ID数组
  if (classificationDepth === 'chapter-and-unit' || classificationDepth === 'chapter-only') {
    for (const ch of existingChapters || []) {
      if (!ch?.id) continue
      const chIndex = chapterIdsByIndex.length
      chapterIdsByIndex.push(ch.id)
      const chUnits = (existingUnits || []).filter(u => u.chapterId === ch.id)
      chapterUnitIdsMap.set(chIndex, chUnits.map(u => u.id))
      let block = `【章节${chIndex}】${ch.name}`
      if (classificationDepth === 'chapter-and-unit' && chUnits.length > 0) {
        const unitLines = chUnits.map((u, ui) => {
          const sampleCards = (existingCards || [])
            .filter(c => c.unitId === u.id)
            .slice(0, 5)
          let ul = `  - 单元${ui}：${u.name}`
          if (sampleCards.length > 0) {
            ul += '（示例：' + sampleCards.map(c => String(c.front || '').slice(0, 30)).join('；') + '）'
          }
          return ul
        })
        block += '\n' + unitLines.join('\n')
      }
      chapterBlocks.push(block)
    }
  }

  const unitBlocks = []
  const unitIdsByIndex = []
  for (const u of existingUnits || []) {
    if (!u?.id) continue
    // 只包含未归属章节的单元（已归属章节的单元已在 chapterBlocks 中展示）
    if (u.chapterId) continue
    unitIdsByIndex.push(u.id)
    const sampleCards = (existingCards || [])
      .filter(c => c.unitId === u.id)
      .slice(0, 10)
    let block = `【单元${unitIdsByIndex.length - 1}】${u.name}`
    if (u.description) block += `（简介：${String(u.description).slice(0, 80)}）`
    if (sampleCards.length > 0) {
      block += '\n  - 示例卡片问题：' + sampleCards.map(c => String(c.front || '').slice(0, 40)).join('；')
    }
    unitBlocks.push(block)
  }

  const newCardLines = newCards.map((c, i) =>
    `  新卡${i}: Q=${String(c.front || '').slice(0, 60)} | A=${String(c.back || '').slice(0, 60)}${c.kpMarker ? ` [来源: ${c.kpMarker}]` : ''}`
  )

  // 构建用户已确认的主题信息（用于指导 AI 按主题组织卡片）
  const topics = config?.topics || []
  const topicBlocks = topics.length > 0
    ? topics.map((t, idx) => `【主题${idx}】${t.topicName}（知识点 ${(t.pointIndices || []).length} 个）`).join('\n')
    : ''

  let effectiveDepth = classificationDepth

  let prompt
  if (effectiveDepth === 'chapter-and-unit') {
    prompt =
`你是一个分类助手。请把下面【新卡片】中的每一张卡片，归类到下面给出的【现有章节与单元】中。

【归类原则（非常重要）】：
1. 必须遵循：用户已确认的主题分组是最终分类的主要依据，优先按用户确认的主题创建对应的新章节/新单元。
2. 优先匹配：如果卡片内容与现有章节/单元主题高度相关，归入现有结构；如果主题不相关，不要强行合并。
3. 严格控制：除非现有结构的主题与卡片内容高度匹配，否则所有新卡片都应归入用户确认的主题对应的新章节/新单元中。
4. 章节粒度：每个章节包含 2-5 个单元；当卡片数量较多时可扩展至 2-10 个单元。
5. 单元卡片数：每个单元包含 2-50 张卡片，根据主题复杂度灵活调整。
6. 单元命名概括：使用宽泛的概括性命名（如"链表基础操作"而非"单链表插入"），便于后续卡片归入。
7. 新章节总数不超过 5 个，新单元总数不超过 10 个。
8. 新章节/单元名称应使用宽泛的概括性命名，新章节名不超过 12 个字，新单元名不超过 16 个字。
9. 同一个新章节下至少包含 2 个单元。
${topics.length > 0 ? '\n【用户已确认的主题分组】（必须严格按这些主题创建新章节/新单元来组织对应的卡片）：\n' + topicBlocks : ''}

【现有章节与单元】：
${chapterBlocks.length > 0 ? chapterBlocks.join('\n') : '（当前尚无任何章节，请根据卡片内容自由创建合适的章节来组织卡片）'}
${unitBlocks.length > 0 ? '\n\n【未归章单元】：\n' + unitBlocks.join('\n') : ''}

【新卡片】：
${newCardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一张卡片，不要JSON、不要代码块、不要额外文字。
格式（归入现有）: cardIndex|E|chapterIndex|unitIndex
格式（创建新）: cardIndex|N|newChapterName|newUnitName
示例：
0|E|0|1
1|E|0|2
2|N|新章节名|新单元名

注意：
- E=归入现有，N=创建新
- 归入现有时填章节编号和单元编号
- 创建新时填新章节名和新单元名
- 名称中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`
  } else if (effectiveDepth === 'chapter-only') {
    prompt =
`你是一个分类助手。请把下面【新卡片】中的每一张卡片，归类到下面给出的【现有章节】中，并为未分类的卡片创建新单元。

【归类原则（非常重要）】：
1. 优先合并：尽量将卡片归入现有章节，即使卡片与章节主题只是部分相关，只要不是完全无关，就归入现有章节（不要追求完美匹配）。
2. 章节粒度：每个章节包含 2-5 个单元；当卡片数量较多时可扩展至 2-10 个单元。
3. 单元卡片数：每个单元包含 2-50 张卡片，根据主题复杂度灵活调整。
4. 创建新单元：对于无法归入现有单元的卡片，根据主题内容创建新单元；新单元归入合适的章节。
5. 单元命名概括：使用宽泛的概括性命名（如"计算机网络基础"而非"OSI七层模型"），便于后续卡片归入。
6. 控制新章节数量：只有当 5 张以上卡片明显属于同一新主题且与任何现有章节都无关时，才建议创建新章节。零星不匹配的卡片尽量归入主题最接近的现有章节。
7. 建议的新章节总数不超过 2 个，新单元总数不超过 5 个。
8. 新章节名称应使用宽泛的概括性命名，不超过 12 个字；新单元名称不超过 16 个字。
${topics.length > 0 ? '\n【用户已确认的主题分组】（请优先按这些主题创建新章节/新单元来组织对应的卡片）：\n' + topicBlocks : ''}

【现有章节】：
${chapterBlocks.length > 0 ? chapterBlocks.join('\n') : '（当前尚无任何章节，请根据卡片内容自由创建合适的章节）'}

【新卡片】：
${newCardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一张卡片，不要JSON、不要代码块、不要额外文字。
格式（归入现有章节）: cardIndex|E|chapterIndex
格式（创建新）: cardIndex|N|newChapterName|newUnitName
示例：
0|E|0
1|E|1
2|N|新章节名|新单元名

注意：
- E=归入现有章节，N=创建新章节+新单元
- 归入现有时填章节编号
- 创建新时填新章节名和新单元名
- 名称中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`
  } else {
    prompt =
`你是一个分类助手。请把下面【新卡片】中的每一张卡片，归类到下面给出的【现有单元】中。

【归类原则（非常重要）】：
1. 优先合并：尽量将卡片归入现有单元，即使卡片与单元主题只是部分相关，只要不是完全无关，就归入现有单元（不要追求完美匹配）。
2. 单元卡片数：每个单元包含 2-50 张卡片，根据主题复杂度灵活调整。
3. 控制新单元数量：只有当 5 张以上卡片明显属于同一新主题且与任何现有单元都无关时，才建议创建新单元。零星不匹配的卡片尽量归入主题最接近的现有单元。
4. 建议的新单元总数不超过 2 个。
5. 新单元名称应使用宽泛的概括性命名（如"计算机网络基础"而非"OSI七层模型"），便于后续卡片归入同一单元。新单元名称不超过 16 个字。
${topics.length > 0 ? '\n【用户已确认的主题分组】（请优先按这些主题创建新单元来组织对应的卡片）：\n' + topicBlocks : ''}

【现有单元】（以【单元N】开头，N 是单元编号）：
${unitBlocks.length > 0 ? unitBlocks.join('\n') : '（尚无任何单元）'}

【新卡片】：
${newCardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一张卡片，不要JSON、不要代码块、不要额外文字。
格式（归入现有单元）: cardIndex|E|unitIndex
格式（创建新单元）: cardIndex|N|newUnitName
示例：
0|E|0
1|E|1
2|N|新单元名

注意：
- E=归入现有单元，N=创建新单元
- 归入现有时填单元编号
- 创建新时填新单元名
- 名称中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`
  }

  try {
    const classifyPromise = (async () => {
      const body = {
        model: config.model || 'deepseek-v4-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      }

      if (isSpark) {
        const password = (config.sparkApiKey || '').trim()
        const resp = await httpPost(SPARK_URL, {
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
          data: { ...body, model: config.model || 'lite' },
          timeout: 60000,
        })
        if (!resp.ok) throw new Error('Spark classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
        return resp.data?.choices?.[0]?.message?.content || ''
      } else if (isVolcano) {
        const resp = await httpPost(VOLCANO_ENGINE_API_URL, {
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.volcanoApiKey || '') },
          data: { ...body, model: config.model || 'doubao-pro-32k' },
          timeout: 60000,
        })
        if (!resp.ok) throw new Error('Volcano classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
        return resp.data?.choices?.[0]?.message?.content || ''
      } else if (isDashscope) {
        const resp = await httpPost(DASHSCOPE_API_URL, {
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.dashscopeApiKey || '') },
          data: { ...body, model: config.model || 'qwen3.5-plus-2026-04-20' },
          timeout: 60000,
        })
        if (!resp.ok) throw new Error('Dashscope classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
        return resp.data?.choices?.[0]?.message?.content || ''
      } else {
        // DeepSeek
        const resp = await httpPost(DEEPSEEK_API_URL, {
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.apiKey || '') },
          data: body,
          timeout: 60000,
        })
        if (!resp.ok) throw new Error('DeepSeek classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
        return resp.data?.choices?.[0]?.message?.content || ''
      }
    })()
    
    const TIMEOUT_MS = 90000  // 整体超时 90 秒（httpPost 已有 60 秒超时，这里作为兜底）
    let raw = ''
    let timeoutId = null
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('AI 分类请求超时（90秒），请检查网络或减少卡片数量')), TIMEOUT_MS)
    })
    
    try {
      raw = await Promise.race([classifyPromise, timeoutPromise])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }

    let parsed = null
    // [优化] 线性表格式优先解析（节省约60%输出token），JSON兜底
    parsed = parseLinearCardAssignResult(raw, effectiveDepth)
    if (!parsed) {
      try {
        const trimmed = String(raw).trim()
        const firstBracket = trimmed.indexOf('[')
        const lastBracket = trimmed.lastIndexOf(']')
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          const slice = trimmed.slice(firstBracket, lastBracket + 1)
          parsed = JSON.parse(slice)
        }
      } catch (_) { /* ignore */ }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallbackClassify(existingUnits, newCards)
    }

    const assignments = []
    for (let i = 0; i < newCards.length; i++) {
      const item = parsed.find(p => Number(p.cardIndex) === i) || null

      if (classificationDepth === 'chapter-and-unit') {
        // 章节+单元模式：解析 chapterIndex 和 unitIndex
        if (item && item.assignType === 'existing' && typeof item.chapterIndex === 'number') {
          const chId = chapterIdsByIndex[item.chapterIndex]
          const chUnitIds = chapterUnitIdsMap.get(item.chapterIndex) || []
          const uId = typeof item.unitIndex === 'number' ? (chUnitIds[item.unitIndex] || null) : null
          assignments.push({
            cardIndex: i,
            chapterId: chId || null,
            unitId: uId || null,
            newChapterName: null,
            newUnitName: null,
          })
          continue
        }
        if (item && item.assignType === 'new') {
          assignments.push({
            cardIndex: i,
            chapterId: null,
            unitId: null,
            newChapterName: item.newChapterName ? String(item.newChapterName).trim().slice(0, 12) : null,
            newUnitName: item.newUnitName ? String(item.newUnitName).trim().slice(0, 16) : null,
          })
          continue
        }
        // 兜底：尝试匹配现有章节
        assignments.push({
          cardIndex: i,
          chapterId: null,
          unitId: null,
          newChapterName: (newCards[i].front || '新章节').slice(0, 12),
          newUnitName: null,
        })
      } else if (classificationDepth === 'chapter-only') {
        // 仅章节模式：解析 chapterIndex
        if (item && item.assignType === 'existing' && typeof item.chapterIndex === 'number') {
          const chId = chapterIdsByIndex[item.chapterIndex]
          assignments.push({
            cardIndex: i,
            chapterId: chId || null,
            newChapterName: null,
          })
          continue
        }
        if (item && item.assignType === 'new' && item.newChapterName) {
          assignments.push({
            cardIndex: i,
            chapterId: null,
            newChapterName: String(item.newChapterName).trim().slice(0, 12) || '新章节',
          })
          continue
        }
        assignments.push({
          cardIndex: i,
          chapterId: null,
          newChapterName: (newCards[i].front || '新章节').slice(0, 12),
        })
      } else {
        // unit-only 模式：保持原有行为
        if (item && item.assignType === 'existing' && typeof item.unitIndex === 'number') {
          const uId = unitIdsByIndex[item.unitIndex]
          if (uId) {
            assignments.push({ cardIndex: i, unitId: uId, newUnitName: null })
            continue
          }
        }
        if (item && item.assignType === 'new' && item.newUnitName) {
          assignments.push({
            cardIndex: i,
            unitId: null,
            newUnitName: String(item.newUnitName).trim().slice(0, 16) || '新单元',
          })
          continue
        }
        assignments.push({
          cardIndex: i,
          unitId: null,
          newUnitName: (newCards[i].front || '新单元').slice(0, 14),
        })
      }
    }
    return assignments
  } catch {
    return fallbackClassify(existingUnits, newCards)
  }

  async function fallbackClassify(existingUnits, newCards) {
    try {
      const { matchUnit } = await import('../utils/helpers')
      const out = []

      // 章节级降级：当有 existingChapters 且 classificationDepth 为 chapter-only 或 chapter-and-unit
      if ((classificationDepth === 'chapter-only' || classificationDepth === 'chapter-and-unit') && existingChapters.length > 0) {
        for (let i = 0; i < newCards.length; i++) {
          const c = newCards[i]
          const frontLower = String(c.front || '').toLowerCase()
          // 尝试匹配现有章节
          let matchedChapter = null
          for (const ch of existingChapters) {
            if (!ch?.name) continue
            const chLower = ch.name.toLowerCase()
            if (chLower.length >= 2 && frontLower.includes(chLower)) {
              matchedChapter = ch
              break
            }
          }
          if (classificationDepth === 'chapter-only') {
            if (matchedChapter) {
              out.push({ cardIndex: i, chapterId: matchedChapter.id, newChapterName: null })
            } else {
              out.push({ cardIndex: i, chapterId: null, newChapterName: (c.front || '新章节').slice(0, 12) })
            }
          } else {
            // chapter-and-unit
            if (matchedChapter) {
              // 尝试匹配该章节下的单元
              const chUnits = (existingUnits || []).filter(u => u.chapterId === matchedChapter.id)
              let matchedUnit = null
              for (const u of chUnits) {
                if (!u?.name) continue
                const uLower = u.name.toLowerCase()
                if (uLower.length >= 2 && frontLower.includes(uLower)) {
                  matchedUnit = u
                  break
                }
              }
              if (!matchedUnit && chUnits.length > 0) {
                matchedUnit = matchUnit(chUnits, c.front?.slice(0, 15) || '')
              }
              out.push({
                cardIndex: i,
                chapterId: matchedChapter.id,
                unitId: matchedUnit ? matchedUnit.id : null,
                newChapterName: null,
                newUnitName: matchedUnit ? null : (c.front || '新单元').slice(0, 14),
              })
            } else {
              out.push({
                cardIndex: i,
                chapterId: null,
                unitId: null,
                newChapterName: null,
                newUnitName: null,
                _pending: true,
              })
            }
          }
        }

        // 对未匹配到现有章节的卡片进行自动聚类，创建新章节和新单元
        const pendingCards = out.filter(a => a._pending)
        if (pendingCards.length > 0) {
          const chapterClusters = []
          const MAX_UNIT_CARDS = 50
          const MIN_UNIT_CARDS = 2
          const MAX_CHAPTER_UNITS = 10

          for (const ass of pendingCards) {
            const card = newCards[ass.cardIndex]
            const frontText = String(card.front || '')
            const frontPrefix = frontText.slice(0, 15)
            const knowledgePoint = String(card.knowledge_point || '')
            let placed = false

            for (const chCluster of chapterClusters) {
              if (chCluster.prefix && (frontPrefix.includes(chCluster.prefix) || chCluster.prefix.includes(frontPrefix) || 
                  (knowledgePoint && knowledgePoint.includes(chCluster.prefix)))) {
                let unitPlaced = false
                for (const uCluster of chCluster.units) {
                  if (uCluster.cardIndices.length >= MAX_UNIT_CARDS) continue
                  const uPrefix = uCluster.unitName.slice(0, 10)
                  if ((frontPrefix.slice(0, 10) === uPrefix || frontPrefix.includes(uPrefix) || uPrefix.includes(frontPrefix)) ||
                      (knowledgePoint && knowledgePoint.includes(uPrefix))) {
                    uCluster.cardIndices.push(ass.cardIndex)
                    unitPlaced = true
                    break
                  }
                }
                if (!unitPlaced && chCluster.units.length < MAX_CHAPTER_UNITS) {
                  const unitName = knowledgePoint ? 
                    knowledgePoint.slice(0, 16) : 
                    frontText.slice(0, 16)
                  chCluster.units.push({
                    unitName: unitName || '新单元',
                    cardIndices: [ass.cardIndex],
                  })
                } else if (!unitPlaced) {
                  // [fix-P0-2] 修复 unitName 作用域 bug：原代码引用了 if 分支内的 unitName，此处需重新定义
                  const newUnitName = knowledgePoint ?
                    knowledgePoint.slice(0, 16) :
                    frontText.slice(0, 16)
                  chapterClusters.push({
                    prefix: frontPrefix.slice(0, 8),
                    chapterName: knowledgePoint ? knowledgePoint.slice(0, 12) : frontText.slice(0, 12),
                    units: [{
                      unitName: newUnitName || '新单元',
                      cardIndices: [ass.cardIndex],
                    }],
                  })
                }
                placed = true
                break
              }
            }
            if (!placed) {
              const chapterName = knowledgePoint ? knowledgePoint.slice(0, 12) : frontText.slice(0, 12)
              const unitName = knowledgePoint ? knowledgePoint.slice(0, 16) : frontText.slice(0, 16)
              chapterClusters.push({
                prefix: frontPrefix.slice(0, 8),
                chapterName: chapterName || '新章节',
                units: [{
                  unitName: unitName || '新单元',
                  cardIndices: [ass.cardIndex],
                }],
              })
            }
          }

          for (const chCluster of chapterClusters) {
            for (const uCluster of chCluster.units) {
              for (const ci of uCluster.cardIndices) {
                const ass = out.find(a => a.cardIndex === ci)
                if (ass) {
                  ass.newChapterName = chCluster.chapterName.slice(0, 12)
                  ass.newUnitName = uCluster.unitName.slice(0, 16)
                  ass._pending = false
                }
              }
            }
          }

          // 合并小单元：将卡片数少于 MIN_UNIT_CARDS 的单元合并到相邻单元
          for (const chCluster of chapterClusters) {
            if (chCluster.units.length <= 1) continue
            let i = 0
            while (i < chCluster.units.length) {
              if (chCluster.units[i].cardIndices.length < MIN_UNIT_CARDS && i > 0) {
                chCluster.units[i - 1].cardIndices.push(...chCluster.units[i].cardIndices)
                chCluster.units.splice(i, 1)
              } else {
                i++
              }
            }
          }

          // 更新合并后的单元分配
          for (const chCluster of chapterClusters) {
            for (const uCluster of chCluster.units) {
              for (const ci of uCluster.cardIndices) {
                const ass = out.find(a => a.cardIndex === ci)
                if (ass) {
                  ass.newChapterName = chCluster.chapterName.slice(0, 12)
                  ass.newUnitName = uCluster.unitName.slice(0, 16)
                }
              }
            }
          }
        }

        for (const ass of out) {
          delete ass._pending
        }

        return out
      }

      // 第 1 遍：尝试匹配现有单元
      const unmatched = [] // { cardIndex, front }
      for (let i = 0; i < newCards.length; i++) {
        const c = newCards[i]
        let matched = null
        for (const u of existingUnits || []) {
          if (!u?.name) continue
          const nLower = u.name.toLowerCase()
          const frontLower = String(c.front || '').toLowerCase()
          if (nLower.length >= 2 && frontLower.includes(nLower)) {
            matched = u
            break
          }
        }
        if (!matched) {
          matched = matchUnit(existingUnits || [], c.front?.slice(0, 15) || '')
        }
        if (matched) {
          out.push({ cardIndex: i, unitId: matched.id, newUnitName: null })
        } else {
          unmatched.push({ cardIndex: i, front: String(c.front || '') })
        }
      }

      // 第 2 遍：未匹配的卡片按 front 前缀聚类，减少新单元数量
      if (unmatched.length > 0) {
        const clusters = [] // [{ unitName, cardIndices: [] }]
        const MAX_UNIT_CARDS = 50
        const MIN_UNIT_CARDS = 2

        for (const item of unmatched) {
          let placed = false
          const card = newCards[item.cardIndex]
          const knowledgePoint = String(card.knowledge_point || '')
          const prefix = item.front.slice(0, 10)
          for (const cluster of clusters) {
            if (cluster.cardIndices.length >= MAX_UNIT_CARDS) continue
            const cp = cluster.unitName.slice(0, 10)
            if ((prefix && cp && (prefix === cp || prefix.includes(cp) || cp.includes(prefix))) ||
                (knowledgePoint && knowledgePoint.includes(cp))) {
              cluster.cardIndices.push(item.cardIndex)
              placed = true
              break
            }
          }
          if (!placed) {
            const unitName = knowledgePoint ? knowledgePoint.slice(0, 16) : item.front.slice(0, 16)
            clusters.push({
              unitName: unitName || '新单元',
              cardIndices: [item.cardIndex],
            })
          }
        }

        // 合并小单元：将卡片数少于 MIN_UNIT_CARDS 的单元合并到相邻单元
        let i = 0
        while (i < clusters.length) {
          if (clusters[i].cardIndices.length < MIN_UNIT_CARDS && i > 0) {
            clusters[i - 1].cardIndices.push(...clusters[i].cardIndices)
            clusters.splice(i, 1)
          } else {
            i++
          }
        }

        // 将聚类结果写入输出
        for (const cluster of clusters) {
          if (cluster.cardIndices.length === 1 && existingUnits.length > 0) {
            const cardIdx = cluster.cardIndices[0]
            const bestMatch = matchUnit(existingUnits || [], cluster.unitName)
            if (bestMatch) {
              out.push({ cardIndex: cardIdx, unitId: bestMatch.id, newUnitName: null })
              continue
            }
          }
          for (const ci of cluster.cardIndices) {
            out.push({ cardIndex: ci, unitId: null, newUnitName: cluster.unitName.slice(0, 16) })
          }
        }
      }

      return out
    } catch (e) {
      console.warn('[fallbackClassify] Exception, returning empty:', e?.message)
      return []
    }
  }
}

/**
 * 通用的 AI 分类调用（支持 DeepSeek / Spark / Volcano / Dashscope）
 * 返回解析后的 JSON 数组
 */
async function callAIClassify(prompt, config, isSpark, isVolcano, isDashscope, isPcEngine) {
  const body = {
    model: config.model || 'deepseek-v4-pro',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2048,
  }

  let raw = ''
  if (isSpark) {
    const password = (config.sparkApiKey || '').trim()
    const resp = await httpPost(SPARK_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
      data: { ...body, model: config.model || 'lite' },
      timeout: 60000,
    })
    if (!resp.ok) throw new Error('Spark classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
    raw = resp.data?.choices?.[0]?.message?.content || ''
  } else if (isVolcano) {
    const resp = await httpPost(VOLCANO_ENGINE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.volcanoApiKey || '') },
      data: { ...body, model: config.model || 'doubao-pro-32k' },
      timeout: 60000,
    })
    if (!resp.ok) throw new Error('Volcano classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
    raw = resp.data?.choices?.[0]?.message?.content || ''
  } else if (isDashscope) {
    const resp = await httpPost(DASHSCOPE_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.dashscopeApiKey || '') },
      data: { ...body, model: config.model || 'qwen3.5-plus-2026-04-20' },
      timeout: 60000,
    })
    if (!resp.ok) throw new Error('Dashscope classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
    raw = resp.data?.choices?.[0]?.message?.content || ''
  } else if (isPcEngine) {
    const pcResult = await callPcEngineAi([{ role: 'user', content: prompt }], { temperature: 0.3 })
    if (pcResult) {
      raw = pcResult.content
    }
  }
  // PC 引擎失败时，降级到 DeepSeek
  if (!raw) {
    const resp = await httpPost(DEEPSEEK_API_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (config.apiKey || '') },
      data: body,
      timeout: 60000,
    })
    if (!resp.ok) throw new Error('DeepSeek classify failed: ' + (resp.data?.error?.message || resp.data?.message || `HTTP ${resp.status}`))
    raw = resp.data?.choices?.[0]?.message?.content || ''
  }

  if (!raw) return []

  // [优化] 线性表格式优先解析，JSON兜底
  // 支持3字段数字格式(cardIndex|chapterIndex|unitIndex)和4字段N格式(cardIndex|N|newChapterName|newUnitName)
  const linearResult = parseLinearThreeNumResult(raw)
  if (linearResult && linearResult.length > 0) {
    return linearResult
  }
  const linearNewResult = parseLinearNewAssignResult(raw)
  if (linearNewResult && linearNewResult.length > 0) {
    return linearNewResult
  }

  const trimmed = String(raw).trim()
  const firstBracket = trimmed.indexOf('[')
  const lastBracket = trimmed.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const slice = trimmed.slice(firstBracket, lastBracket + 1)
    try {
      return JSON.parse(slice)
    } catch (_) {
    }
  }
  return []
}

/**
 * 解析4字段N格式线性表: cardIndex|N|newChapterName|newUnitName
 * 用于 classifyCardsMultiRound 最终轮
 * @param {string} raw - AI原始返回内容
 * @returns {Array|null} 归类结果数组
 */
function parseLinearNewAssignResult(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const results = []
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 4) continue

      const cardIndex = parseInt(parts[0].trim(), 10)
      const typeStr = parts[1].trim().toUpperCase()

      if (isNaN(cardIndex) || cardIndex < 0) continue
      if (typeStr !== 'N' && typeStr !== 'NEW') continue

      const newChapterName = (parts[2] || '').trim().slice(0, 12)
      const newUnitName = (parts[3] || '').trim().slice(0, 16)

      if (newChapterName && newUnitName) {
        results.push({ cardIndex, assignType: 'new', newChapterName, newUnitName })
      }
    }

    if (results.length === 0) return null

    return results
  } catch (e) {
    console.warn('[parseLinearNewAssignResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析知识点分类线性表（路径B：classifyCardsByKnowledgePoints）
 * @param {string} raw - AI原始返回内容
 * @param {string} depth - 'chapter-and-unit' 或 'unit-only'
 * @returns {Array|null} 归类结果数组
 */
function parseLinearKpResult(raw, depth) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    // 去除 markdown 代码块
    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    // 去除前导说明文字
    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const isChapterUnit = depth === 'chapter-and-unit'
    const results = []

    for (const line of lines) {
      const parts = line.split('|')
      const index = parseInt(parts[0].trim(), 10)
      if (isNaN(index) || index < 0) continue

      const typeStr = (parts[1] || '').trim().toUpperCase()
      if (typeStr !== 'E' && typeStr !== 'EXISTING' && typeStr !== 'N' && typeStr !== 'NEW') continue

      const isExisting = typeStr === 'E' || typeStr === 'EXISTING'

      if (isChapterUnit) {
        // chapter-and-unit 模式: index|E|chapterIndex|unitName 或 index|N|newChapterName|unitName
        if (isExisting) {
          if (parts.length < 4) continue
          const chapterIndex = parseInt(parts[2].trim(), 10)
          if (isNaN(chapterIndex) || chapterIndex < 0) continue
          const unitName = parts.slice(3).join('|').trim()
          if (!unitName) continue
          results.push({ index, chapterIndex, unitName, isNew: false })
        } else {
          if (parts.length < 4) continue
          const newChapterName = (parts[2] || '').trim().slice(0, 12)
          const unitName = parts.slice(3).join('|').trim()
          if (!newChapterName || !unitName) continue
          results.push({ index, chapterIndex: null, unitName, isNew: true, newChapterName })
        }
      } else {
        // unit-only 模式: index|E|unitName 或 index|N|unitName
        if (parts.length < 3) continue
        const unitName = parts.slice(2).join('|').trim()
        if (!unitName) continue
        results.push({ index, unitName, isNew: !isExisting })
      }
    }

    if (results.length === 0) return null

    return results
  } catch (e) {
    console.warn('[parseLinearKpResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析多轮知识点分类线性表（路径A：classifyCardsByKnowledgePointsMultiRound）
 * @param {string} raw - AI原始返回内容
 * @param {number} round - 1=章节级，2=单元级
 * @returns {Array|null} 归类结果数组
 */
function parseLinearKpMultiRoundResult(raw, round) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    // 去除 markdown 代码块
    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    // 去除前导说明文字
    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const results = []

    for (const line of lines) {
      const parts = line.split('|')
      const cardIndex = parseInt(parts[0].trim(), 10)
      if (isNaN(cardIndex) || cardIndex < 0) continue

      const typeStr = (parts[1] || '').trim().toUpperCase()
      if (typeStr !== 'E' && typeStr !== 'EXISTING' && typeStr !== 'N' && typeStr !== 'NEW') continue

      const isExisting = typeStr === 'E' || typeStr === 'EXISTING'

      if (round === 1) {
        // 章节级: cardIndex|E|chapterIndex 或 cardIndex|N|newChapterName
        if (isExisting) {
          if (parts.length < 3) continue
          const chapterIndex = parseInt(parts[2].trim(), 10)
          if (isNaN(chapterIndex) || chapterIndex < 0) continue
          results.push({ cardIndex, chapterIndex, isNew: false })
        } else {
          if (parts.length < 3) continue
          const newChapterName = parts.slice(2).join('|').trim().slice(0, 12)
          if (!newChapterName) continue
          results.push({ cardIndex, chapterIndex: null, isNew: true, newChapterName })
        }
      } else if (round === 2) {
        // 单元级: cardIndex|E|unitIndex 或 cardIndex|N|newUnitName
        if (isExisting) {
          if (parts.length < 3) continue
          const unitIndex = parseInt(parts[2].trim(), 10)
          if (isNaN(unitIndex) || unitIndex < 0) continue
          results.push({ cardIndex, unitIndex, isNew: false })
        } else {
          if (parts.length < 3) continue
          const newUnitName = parts.slice(2).join('|').trim().slice(0, 16)
          if (!newUnitName) continue
          results.push({ cardIndex, unitIndex: null, isNew: true, newUnitName })
        }
      }
    }

    if (results.length === 0) return null

    return results
  } catch (e) {
    console.warn('[parseLinearKpMultiRoundResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析同分类重整的分组线性表格式
 * 支持3种深度模式：
 * - chapter-and-unit: chapterIndex|chapterName|unitIndex|unitName|cardIndices
 * - chapter-only: chapterIndex|chapterName|unitName|cardIndices
 * - unit-only: unitIndex|unitName|cardIndices
 * 返回对象结构与原JSON一致，便于下游统一处理
 * @param {string} raw - AI原始返回内容
 * @param {string} depth - 分类深度模式
 * @returns {Object|null} 与原JSON结构一致的对象
 */
function parseLinearSameCategoryResult(raw, depth) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    // 去除 markdown 代码块
    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    // 去除前导说明文字：从第一行包含 | 的行开始
    const allLines = text.split('\n')
    const firstPipeIdx = allLines.findIndex(line => line.includes('|'))
    if (firstPipeIdx < 0) return null
    const pipeLines = allLines.slice(firstPipeIdx)
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (pipeLines.length === 0) return null

    // 解析 cardIndices 字段（英文逗号分隔的数字）
    const parseCardIndices = (str) => {
      return String(str || '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isInteger(n) && n >= 0)
    }

    // 解析 index 字段（数字或 null）
    const parseIndex = (str) => {
      const trimmed = String(str || '').trim().toLowerCase()
      if (trimmed === 'null' || trimmed === '' || trimmed === 'n') return null
      const n = parseInt(trimmed, 10)
      return Number.isInteger(n) && n >= 0 ? n : null
    }

    if (depth === 'chapter-and-unit') {
      // 格式: chapterIndex|chapterName|unitIndex|unitName|cardIndices
      const chapterMap = new Map()
      const chapterOrder = []

      for (const line of pipeLines) {
        const parts = line.split('|')
        if (parts.length < 5) continue

        const chapterIndex = parseIndex(parts[0])
        const chapterName = String(parts[1] || '').trim().slice(0, 12)
        const unitIndex = parseIndex(parts[2])
        const unitName = String(parts[3] || '').trim().slice(0, 16)
        const cardIndices = parseCardIndices(parts[4])

        if (!chapterName || !unitName || cardIndices.length === 0) continue

        const key = `${chapterIndex}|${chapterName}`
        if (!chapterMap.has(key)) {
          chapterMap.set(key, {
            name: chapterName,
            chapterIndex,
            units: [],
          })
          chapterOrder.push(key)
        }
        chapterMap.get(key).units.push({
          unitIndex,
          name: unitName,
          cardIndices,
        })
      }

      if (chapterOrder.length === 0) return null

      const chapters = chapterOrder.map(k => chapterMap.get(k))
      return { chapters }
    }

    if (depth === 'chapter-only') {
      // 格式: chapterIndex|chapterName|unitName|cardIndices
      const chapterMap = new Map()
      const chapterOrder = []

      for (const line of pipeLines) {
        const parts = line.split('|')
        if (parts.length < 4) continue

        const chapterIndex = parseIndex(parts[0])
        const chapterName = String(parts[1] || '').trim().slice(0, 12)
        const unitName = String(parts[2] || '').trim().slice(0, 16)
        const cardIndices = parseCardIndices(parts[3])

        if (!chapterName || !unitName || cardIndices.length === 0) continue

        const key = `${chapterIndex}|${chapterName}`
        if (!chapterMap.has(key)) {
          chapterMap.set(key, {
            name: chapterName,
            chapterIndex,
            units: [],
          })
          chapterOrder.push(key)
        }
        chapterMap.get(key).units.push({
          name: unitName,
          cardIndices,
        })
      }

      if (chapterOrder.length === 0) return null

      const chapters = chapterOrder.map(k => chapterMap.get(k))
      return { chapters }
    }

    // unit-only (default)
    // 格式: unitIndex|unitName|cardIndices
    const units = []
    for (const line of pipeLines) {
      const parts = line.split('|')
      if (parts.length < 3) continue

      const unitIndex = parseIndex(parts[0])
      const unitName = String(parts[1] || '').trim().slice(0, 16)
      const cardIndices = parseCardIndices(parts[2])

      if (!unitName || cardIndices.length === 0) continue

      units.push({
        unitIndex,
        name: unitName,
        cardIndices,
      })
    }

    if (units.length === 0) return null

    return { units }
  } catch (e) {
    console.warn('[parseLinearSameCategoryResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析分组线性表格式的智能单元整理Part1结果
 * 格式: 单元名|概述|cardIndices|isNew
 * 示例: 计算机发展与分类|学科：计算机基础；章节：计算机概述|0,1,2,3,4,5,6,7|false
 *
 * @param {string} raw - AI原始返回内容
 * @returns {Object|null} {units: [{name, overview, cardIndices, isNew}]}
 */
function parseLinearReorganizePart1Result(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const units = []
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 4) continue

      const name = (parts[0] || '').trim()
      const overview = (parts[1] || '').trim()
      const cardIndicesStr = (parts[2] || '').trim()
      const isNewStr = (parts[3] || '').trim().toLowerCase()

      if (!name) continue

      const cardIndices = cardIndicesStr
        ? cardIndicesStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0)
        : []

      if (cardIndices.length === 0) continue

      const isNew = isNewStr === 'true'

      units.push({ name, overview, cardIndices, isNew })
    }

    if (units.length === 0) return null

    return { units }
  } catch (e) {
    console.warn('[parseLinearReorganizePart1Result] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析分组线性表格式的智能单元整理Part2结果（单元合并）
 * 格式:
 *   M|sourceUnitIndices|newUnitName|newOverview  (合并组)
 *   U|unchangedUnitIndex                          (不变单元)
 * 示例:
 *   M|1,4|计算机发展与核心特性|学科：计算机基础；章节：计算机概述
 *   U|2
 *
 * @param {string} raw - AI原始返回内容
 * @returns {Object|null} {mergeGroups: [...], unchangedUnitIndices: [...]}
 */
function parseLinearReorganizePart2Result(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const mergeGroups = []
    const unchangedUnitIndices = []

    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 2) continue

      const type = (parts[0] || '').trim().toUpperCase()

      if (type === 'M') {
        // M|sourceUnitIndices|newUnitName|newOverview
        if (parts.length < 4) continue
        const sourceUnitIndices = (parts[1] || '').trim()
          ? parts[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0)
          : []
        const newUnitName = (parts[2] || '').trim()
        const newOverview = (parts[3] || '').trim()

        if (sourceUnitIndices.length > 0 && newUnitName) {
          mergeGroups.push({ sourceUnitIndices, newUnitName, newOverview })
        }
      } else if (type === 'U') {
        // U|unchangedUnitIndex
        const idx = parseInt((parts[1] || '').trim(), 10)
        if (!isNaN(idx) && idx >= 0) {
          unchangedUnitIndices.push(idx)
        }
      }
    }

    if (mergeGroups.length === 0 && unchangedUnitIndices.length === 0) return null

    return { mergeGroups, unchangedUnitIndices }
  } catch (e) {
    console.warn('[parseLinearReorganizePart2Result] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析分组线性表格式的智能单元整理Part3结果（单元归类到章节）
 * 格式: chapterName|isNew|existingChapterId|unitIndices
 * 示例:
 *   计算机基础概述|false|386d55f7-a5f4-4bbd-a168-3c769f2e5b7d|0
 *   新章节名|true|null|1,2
 *
 * @param {string} raw - AI原始返回内容
 * @returns {Object|null} {chapters: [{name, isNew, existingChapterId, unitIndices}]}
 */
function parseLinearReorganizePart3Result(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const chapters = []
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 4) continue

      const name = (parts[0] || '').trim()
      const isNewStr = (parts[1] || '').trim().toLowerCase()
      const existingChapterIdStr = (parts[2] || '').trim()
      const unitIndicesStr = (parts[3] || '').trim()

      if (!name) continue

      const isNew = isNewStr === 'true'
      const existingChapterId = (!isNew && existingChapterIdStr && existingChapterIdStr.toLowerCase() !== 'null')
        ? existingChapterIdStr
        : null

      const unitIndices = unitIndicesStr
        ? unitIndicesStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0)
        : []

      if (unitIndices.length === 0) continue

      chapters.push({ name, isNew, existingChapterId, unitIndices })
    }

    if (chapters.length === 0) return null

    return { chapters }
  } catch (e) {
    console.warn('[parseLinearReorganizePart3Result] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析3字段数字线性表格式: cardIndex|chapterIndex|unitIndex
 * 用于 classifyCardsMultiRound 前N轮
 * @param {string} raw - AI原始返回内容
 * @returns {Array|null} 归类结果数组
 */
function parseLinearThreeNumResult(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    // 去除 markdown 代码块
    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    // 去除前导说明文字
    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const results = []
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 3) continue

      const cardIndex = parseInt(parts[0].trim(), 10)
      const chapterIndex = parseInt(parts[1].trim(), 10)
      const unitIndex = parseInt(parts[2].trim(), 10)

      if (!isNaN(cardIndex) && cardIndex >= 0 &&
          !isNaN(chapterIndex) && chapterIndex >= 0 &&
          !isNaN(unitIndex) && unitIndex >= 0) {
        results.push({ cardIndex, chapterIndex, unitIndex })
      }
    }

    if (results.length === 0) return null

    return results
  } catch (e) {
    console.warn('[parseLinearThreeNumResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 大数据路径：多轮分批处理
 * 每批 3 个章节，前 N 轮仅归类到现有结构（不创建新章节/单元），
 * 最终轮为剩余卡片创建新章节/单元
 */
async function classifyCardsMultiRound(existingUnits, existingCards, newCards, config, existingChapters, classificationDepth) {
  const isSpark = config?.aiServiceMode === 'iflytek-spark'
  const isVolcano = config?.aiServiceMode === 'volcano'
  const isDashscope = config?.aiServiceMode === 'dashscope'

  // 按章节分组
  const chapterGroups = []
  for (const ch of existingChapters) {
    if (!ch?.id) continue
    const chUnits = existingUnits.filter(u => u.chapterId === ch.id)
    const chCards = (existingCards || []).filter(c => {
      const unitIds = new Set(chUnits.map(u => u.id))
      return unitIds.has(c.unitId) || c.chapterId === ch.id
    })
    chapterGroups.push({ chapter: ch, units: chUnits, cards: chCards })
  }

  // 分批：每批 BATCH_CHAPTER_SIZE 个章节
  const batches = []
  for (let i = 0; i < chapterGroups.length; i += BATCH_CHAPTER_SIZE) {
    batches.push(chapterGroups.slice(i, i + BATCH_CHAPTER_SIZE))
  }

  // 追踪：已归类卡片的原始索引集合
  const classifiedSet = new Set()
  // 最终结果
  const allAssignments = []


  // 前 N 轮：仅归类到现有结构
  for (let round = 0; round < batches.length; round++) {
    const batch = batches[round]

    // 构建当前批次的现有卡片索引映射
    const remainingNewCards = []
    const indexMap = [] // indexMap[临时索引] = 原始索引
    for (let i = 0; i < newCards.length; i++) {
      if (!classifiedSet.has(i)) {
        indexMap.push(i)
        remainingNewCards.push(newCards[i])
      }
    }

    if (remainingNewCards.length === 0) {
      break
    }


    // 构建本批次的 prompt（仅现有结构，禁止创建新章节/单元）
    const chapterBlocks = []
    const chapterIdsByIndex = []
    const chapterUnitIdsMap = new Map()

    for (const group of batch) {
      const ch = group.chapter
      const chIndex = chapterIdsByIndex.length
      chapterIdsByIndex.push(ch.id)
      chapterUnitIdsMap.set(chIndex, group.units.map(u => u.id))

      let block = `【章节${chIndex}】${ch.name}`
      if (group.units.length > 0) {
        const unitLines = group.units.map((u, ui) => {
          const sampleCards = group.cards
            .filter(c => c.unitId === u.id)
            .slice(0, 5)
          let ul = `  - 单元${ui}：${u.name}`
          if (sampleCards.length > 0) {
            ul += '（示例：' + sampleCards.map(c => String(c.front || '').slice(0, 30)).join('；') + '）'
          }
          return ul
        })
        block += '\n' + unitLines.join('\n')
      }
      chapterBlocks.push(block)
    }

    const newCardLines = remainingNewCards.map((c, i) =>
      `  新卡${i}: Q=${String(c.front || '').slice(0, 60)} | A=${String(c.back || '').slice(0, 60)}`
    )

    const prompt =
`你是一个分类助手。请把下面【新卡片】中的每一张卡片归类到本批次的【现有章节与单元】中。

【重要规则】：
1. 本轮只能将卡片归入下面列出的现有章节和单元，禁止创建新章节或新单元。
2. 如果卡片与所有现有结构都不匹配，不要硬塞，跳过该卡片（不返回该卡片的分类结果）。
3. 尽量将卡片归入现有章节和单元，即使只是部分相关也可以归入。

【本批次现有章节与单元】：
${chapterBlocks.join('\n')}

【新卡片】：
${newCardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一张卡片，不要JSON、不要代码块、不要额外文字。
格式: cardIndex|chapterIndex|unitIndex
示例：
0|0|1
1|1|0
2|0|2

注意：
- 每行三字段用 | 分隔
- 只返回能归类的卡片，不要返回无法归类的卡片
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

    // 调用 AI
    let assignments = []
    try {
      const result = await callAIClassify(prompt, config, isSpark, isVolcano, isDashscope, config?.aiServiceMode === 'pc-engine')
      if (Array.isArray(result) && result.length > 0) {
        assignments = result
      }
    } catch (e) {
      console.warn(`[classifyCardsMultiRound] 第 ${round + 1} 轮 AI 调用失败:`, e.message)
    }

    // 映射回原始索引并加入结果
    let roundCount = 0
    for (const item of assignments) {
      const tempIndex = Number(item.cardIndex)
      if (tempIndex >= 0 && tempIndex < indexMap.length) {
        const originalIndex = indexMap[tempIndex]
        const chId = chapterIdsByIndex[item.chapterIndex]
        const chUnitIds = chapterUnitIdsMap.get(item.chapterIndex) || []
        const uId = typeof item.unitIndex === 'number' ? (chUnitIds[item.unitIndex] || null) : null

        if (chId && !classifiedSet.has(originalIndex)) {
          classifiedSet.add(originalIndex)
          allAssignments.push({
            cardIndex: originalIndex,
            chapterId: chId,
            unitId: uId || null,
            newChapterName: null,
            newUnitName: null,
          })
          roundCount++
        }
      }
    }

    // 无进度或所有卡片已归类 → 提前终止
    if (roundCount === 0) {
      break
    }
  }

  // 最终轮：为剩余卡片创建新章节/单元
  const remainingIndexes = []
  for (let i = 0; i < newCards.length; i++) {
    if (!classifiedSet.has(i)) {
      remainingIndexes.push(i)
    }
  }

  if (remainingIndexes.length > 0) {

    const remainingCards = remainingIndexes.map(i => newCards[i])
    const newCardLines = remainingCards.map((c, i) =>
      `  新卡${i}: Q=${String(c.front || '').slice(0, 60)} | A=${String(c.back || '').slice(0, 60)}`
    )

    // 构建用户已确认的主题信息（用于约束最终轮创建的新章节数量）
    const topics = config?.topics || []
    const topicBlock = topics.length > 0
      ? `\n【用户已确认的主题分组】（新章节数量必须 ≤ ${topics.length} 个，必须严格按这些主题创建章节）：\n` +
        topics.map((t, i) => `  主题${i + 1}：${t.topicName}（含 ${(t.pointIndices || []).length} 个知识点）`).join('\n')
      : ''

    const prompt =
`你是一个分类助手。请基于下面【剩余卡片】的内容，创建新的章节和单元来组织这些卡片。${topicBlock}

【重要约束】：
- 新章节数量必须 ≤ ${topics.length > 0 ? topics.length : 3} 个
- 每张卡片必须归入某个主题对应的章节
- 同一主题的卡片应归入同一章节

【创建规则】：
1. 5 张以上卡片属于同一主题即可创建新章节，新章节总数不超过 ${topics.length > 0 ? topics.length : 3} 个。
2. 章节粒度：每个章节包含 2-5 个单元；当卡片数量较多时可扩展至 2-10 个单元。
3. 单元卡片数：每个单元包含 2-50 张卡片，根据主题复杂度灵活调整。
4. 单元命名概括：使用宽泛的概括性命名（如"链表基础操作"而非"单链表插入"）。
5. 新单元总数不超过 5 个。
6. 新章节/单元名称应使用宽泛的概括性命名，新章节名不超过 12 个字，新单元名不超过 16 个字。

【剩余卡片】：
${newCardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一张卡片，不要JSON、不要代码块、不要额外文字。
格式: cardIndex|N|newChapterName|newUnitName
示例：
0|N|新章节名|新单元名
1|N|新章节名|新单元名

注意：
- 每行四字段用 | 分隔
- N=创建新（固定值）
- 名称中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

    try {
      const result = await callAIClassify(prompt, config, isSpark, isVolcano, isDashscope, config?.aiServiceMode === 'pc-engine')
      if (Array.isArray(result) && result.length > 0) {
        for (const item of result) {
          const tempIndex = Number(item.cardIndex)
          if (tempIndex >= 0 && tempIndex < remainingIndexes.length) {
            const originalIndex = remainingIndexes[tempIndex]
            if (!classifiedSet.has(originalIndex)) {
              classifiedSet.add(originalIndex)
              allAssignments.push({
                cardIndex: originalIndex,
                chapterId: null,
                unitId: null,
                newChapterName: item.newChapterName ? String(item.newChapterName).trim().slice(0, 12) : null,
                newUnitName: item.newUnitName ? String(item.newUnitName).trim().slice(0, 16) : null,
              })
            }
          }
        }
      }
    } catch (e) {
      console.warn('[classifyCardsMultiRound] 最终轮 AI 调用失败:', e.message)
    }
  }

  // 兜底：仍有未归类卡片，用本地关键词匹配
  for (let i = 0; i < newCards.length; i++) {
    if (!classifiedSet.has(i)) {
      const c = newCards[i]
      let matched = false
      for (const u of existingUnits || []) {
        if (!u?.name) continue
        const nLower = u.name.toLowerCase()
        const frontLower = String(c.front || '').toLowerCase()
        if (nLower.length >= 2 && frontLower.includes(nLower)) {
          allAssignments.push({ cardIndex: i, chapterId: u.chapterId || null, unitId: u.id, newChapterName: null, newUnitName: null })
          matched = true
          break
        }
      }
      if (!matched) {
        allAssignments.push({
          cardIndex: i,
          chapterId: null,
          unitId: null,
          newChapterName: (c.front || '新章节').slice(0, 12),
          newUnitName: (c.front || '新单元').slice(0, 14),
        })
      }
    }
  }

  return allAssignments.sort((a, b) => a.cardIndex - b.cardIndex)
}

/**
 * 弱模型知识点分类（多轮 AI 调用）：
 * AI 自由判断知识点归入现有单元还是创建新单元，无固定数量限制
 * 流程：第一轮自由分类 → 第二轮补充分类未覆盖项 → 最终降级
 * 卡片通过 knowledge_point 内容匹配知识点索引（解决 AI 合并知识点导致的错位问题）
 */
async function classifyCardsByKnowledgePoints(knowledgePoints, kpMarkers, existingUnits, newCards, config, existingChapters, classificationDepth) {
  if (!knowledgePoints || knowledgePoints.length === 0) return fallbackClassifyLocal(existingUnits, newCards)
  if (!newCards || newCards.length === 0) return []

  const kpCount = knowledgePoints.length
  const password = (config.sparkApiKey || '').trim()

  // 单元名称归一化：去空格、小写、去标点，用于模糊匹配和去重
  const normalizeName = (name) => String(name || '').trim().toLowerCase().replace(/[\s\-_·]/g, '')

  // 现有单元归一化名称 → 原单元对象 映射
  const existingNormMap = new Map()
  for (const u of existingUnits || []) {
    if (u?.name) existingNormMap.set(normalizeName(u.name), u)
  }

  // 章节归一化映射（用于 chapter-and-unit 模式）
  const chapterNormMap = new Map()
  const chapterIdsByIndex = []
  if (existingChapters && classificationDepth === 'chapter-and-unit') {
    for (const ch of existingChapters) {
      if (!ch?.id) continue
      chapterIdsByIndex.push(ch.id)
      chapterNormMap.set(normalizeName(ch.name), ch)
    }
  }

  // 调用 AI 进行一轮分类
  const callAiForKpClassify = (kpIndexList, allExistingUnitNames, contextHint) => {
    const kpLines = kpIndexList.map(idx => `${idx}|${knowledgePoints[idx]}`)
    let prompt
    
    if (classificationDepth === 'chapter-and-unit') {
      // Chapter-aware prompt（即使没有现有章节，也使用章节感知 prompt，让AI自由创建章节）
      const chapterLines = existingChapters && existingChapters.length > 0
        ? existingChapters.map((ch, i) => `${i}|${ch.name}`).join('\n')
        : '（暂无现有章节，请根据知识点自由创建合适的章节）'
      prompt = `${contextHint}

【整理规则】：
1. 每个知识点必须且只能归入一个章节和一个单元，不得遗漏
2. 自由判断：根据知识点语义，决定归入现有章节/单元或创建新章节/单元
3. 新章节/单元名称要宽泛概括，≤12 字
4. 当多个知识点明显属于同一主题时，归入同一章节/单元

【现有章节】：
${chapterLines}

【现有单元】：
${allExistingUnitNames.length > 0
    ? allExistingUnitNames.map((name, i) => `${i}|${name}`).join('\n')
    : '（暂无现有单元）'}

【待归类知识点】（格式：原始索引|知识点内容，索引为整数）：
${kpLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一个知识点，不要JSON、不要代码块、不要额外文字。
格式（归入现有）: index|E|chapterIndex|unitName
格式（创建新）: index|N|newChapterName|unitName
示例：
0|E|0|硬件基础
1|N|新章节名|新单元名
- index: 待归类知识点列表中的原始索引（整数）
- chapterIndex: 现有章节编号（整数）
- unitName: 归入的单元名称
- newChapterName: 新建章节时填写，≤12字`
    } else {
      // Original prompt (unit-only, unchanged)
      prompt = `${contextHint}

【整理规则】：
1. 每个知识点必须且只能归入一个单元，不得遗漏
2. 自由判断：根据知识点语义，决定归入现有单元或创建新单元
3. 新单元名称要宽泛概括（如"硬件基础"而非"CPU主频参数"），≤12 字
4. 当多个知识点明显属于同一主题时，归入同一单元（可以是新单元）
5. 只有 1-2 个知识点属于某主题也可以创建新单元，不限制数量

【现有单元】：
${allExistingUnitNames.length > 0
    ? allExistingUnitNames.map((name, i) => `${i}|${name}`).join('\n')
    : '（暂无现有单元）'}

【待归类知识点】（格式：原始索引|知识点内容，索引为整数）：
${kpLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一个知识点，不要JSON、不要代码块、不要额外文字。
格式（归入现有）: index|E|unitName
格式（创建新）: index|N|unitName
示例：
0|E|硬件基础
1|N|新单元名
- index: 待归类知识点列表中的原始索引（整数，不是本列表的位置）
- unitName: 归入的单元名称`
    }

    try {
      const resp = httpPost(SPARK_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
        data: {
          model: config.model || 'lite',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2048,
        },
        timeout: 15000,
      })
      return resp
    } catch (e) {
      console.warn('[classifyCardsByKnowledgePoints] AI call failed:', e?.message)
      return null
    }
  }

  // 解析 AI 返回（线性表优先，JSON 兜底）
  const parseAiResponse = (resp) => {
    if (!resp || !resp.ok) return null
    const raw = resp.data?.choices?.[0]?.message?.content || ''
    // 优先尝试线性表解析
    const linearResult = parseLinearKpResult(raw, classificationDepth)
    if (linearResult) return linearResult
    // 回退到 JSON 解析
    try {
      const trimmed = String(raw).trim()
      const firstBracket = trimmed.indexOf('[')
      const lastBracket = trimmed.lastIndexOf(']')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
      }
    } catch (_) { /* ignore */ }
    return null
  }

  // ===== 第一轮：所有知识点自由分类 =====
  const indexToUnit = new Map()
  const existingUnitNamesForRound1 = (existingUnits || []).filter(u => u?.name).map(u => u.name)

  let round1Resp = null
  try {
    round1Resp = await callAiForKpClassify(
      knowledgePoints.map((_, i) => i),
      existingUnitNamesForRound1,
      '你是知识体系整理助手。请将以下知识点归类到合适的单元中。'
    )
  } catch (_) { /* ignore */ }

  const round1Parsed = parseAiResponse(round1Resp)
  if (Array.isArray(round1Parsed)) {
    for (const item of round1Parsed) {
      const idx = Number(item.index)
      if (!isNaN(idx) && idx >= 0 && idx < kpCount && item.unitName) {
        const rawName = String(item.unitName).trim()
        const normName = normalizeName(rawName)
        const matchedExisting = existingNormMap.get(normName)
        
        // Extract chapter info
        let chapterId = null
        let newChapterName = null
        if (typeof item.chapterIndex === 'number' && item.chapterIndex >= 0 && item.chapterIndex < chapterIdsByIndex.length) {
          chapterId = chapterIdsByIndex[item.chapterIndex]
        } else if (item.newChapterName) {
          newChapterName = String(item.newChapterName).trim().slice(0, 12)
        }
        
        if (matchedExisting || !item.isNew) {
          indexToUnit.set(idx, {
            unitName: matchedExisting ? matchedExisting.name : rawName,
            isNew: !matchedExisting,
            chapterId,
            newChapterName,
          })
        } else {
          indexToUnit.set(idx, { unitName: rawName, isNew: true, chapterId, newChapterName })
        }
      }
    }
  }

  // ===== 第二轮：对未覆盖的知识点补充分类 =====
  const uncoveredIndices = []
  for (let i = 0; i < kpCount; i++) {
    if (!indexToUnit.has(i)) uncoveredIndices.push(i)
  }

  if (uncoveredIndices.length > 0 && uncoveredIndices.length < kpCount) {
    // 收集第一轮中已出现的所有单元名（现有 + 新创建），供第二轮参考
    const unitNamesFromRound1 = new Set(existingUnitNamesForRound1)
    for (const info of indexToUnit.values()) {
      unitNamesFromRound1.add(info.unitName)
    }

    let round2Resp = null
    try {
      round2Resp = await callAiForKpClassify(
        uncoveredIndices,
        Array.from(unitNamesFromRound1),
        '你是知识体系整理助手。以下知识点在上一轮分类中未被覆盖，请对它们进行归类。可以归入已有单元或创建新单元。'
      )
    } catch (_) { /* ignore */ }

    const round2Parsed = parseAiResponse(round2Resp)
    if (Array.isArray(round2Parsed)) {
      // 第二轮的单元名称归一化：用所有已出现的单元名进行模糊匹配
      const allUnitNormMap = new Map()
      for (const name of existingUnitNamesForRound1) allUnitNormMap.set(normalizeName(name), name)
      for (const info of indexToUnit.values()) {
        if (info.isNew) allUnitNormMap.set(normalizeName(info.unitName), info.unitName)
      }

      for (const item of round2Parsed) {
        const idx = Number(item.index)
        if (isNaN(idx) || idx < 0 || idx >= kpCount || !item.unitName) continue
        if (indexToUnit.has(idx)) continue // 已被第一轮覆盖的跳过

        const rawName = String(item.unitName).trim()
        const normName = normalizeName(rawName)

        // Extract chapter info
        let chapterId = null
        let newChapterName = null
        if (typeof item.chapterIndex === 'number' && item.chapterIndex >= 0 && item.chapterIndex < chapterIdsByIndex.length) {
          chapterId = chapterIdsByIndex[item.chapterIndex]
        } else if (item.newChapterName) {
          newChapterName = String(item.newChapterName).trim().slice(0, 12)
        }

        // 尝试匹配现有单元
        const matchedExisting = existingNormMap.get(normName)
        if (matchedExisting) {
          indexToUnit.set(idx, { unitName: matchedExisting.name, isNew: false, chapterId, newChapterName })
          continue
        }

        // 尝试匹配第一轮创建的新单元
        const matchedNewUnit = allUnitNormMap.get(normName)
        if (matchedNewUnit && !existingNormMap.has(normName)) {
          indexToUnit.set(idx, { unitName: matchedNewUnit, isNew: true, chapterId, newChapterName })
          continue
        }

        // 全新单元
        indexToUnit.set(idx, { unitName: rawName, isNew: true, chapterId, newChapterName })
      }
    }
  }

  // 如果两轮后完全没有结果，降级
  if (indexToUnit.size === 0) {
    return fallbackClassifyLocal(existingUnits, newCards)
  }

  // ===== 卡片 → 单元映射 =====
  const assignments = []
  for (let i = 0; i < newCards.length; i++) {
    const card = newCards[i]

    // 优先：知识点内容匹配
    const kpContent = (card.knowledge_point || '').trim().toLowerCase()
    let kpIndex = knowledgePoints.findIndex(kp => (kp || '').trim().toLowerCase() === kpContent)

    // 兜底：位置索引
    if (kpIndex === -1) {
      kpIndex = typeof card.kpIndex === 'number' ? card.kpIndex : i
    }

    const unitInfo = indexToUnit.get(kpIndex)

    if (unitInfo) {
      const chapterId = unitInfo.chapterId || null
      const newChapterName = unitInfo.newChapterName || null
      if (unitInfo.isNew) {
        assignments.push({ cardIndex: i, unitId: null, newUnitName: unitInfo.unitName, chapterId, newChapterName })
      } else {
        const existing = existingNormMap.get(normalizeName(unitInfo.unitName))
        if (existing) {
          // Also use existing unit's chapterId if available
          const unitChapterId = chapterId || existing.chapterId || null
          assignments.push({ cardIndex: i, unitId: existing.id, newUnitName: null, chapterId: unitChapterId, newChapterName })
        } else {
          // 虽然 isNew=false 但没匹配到现有单元，当作新单元处理
          assignments.push({ cardIndex: i, unitId: null, newUnitName: unitInfo.unitName, chapterId, newChapterName })
        }
      }
    } else {
      // 多轮 AI 后仍未分配：本地关键词匹配
      let matched = false
      for (const u of existingUnits || []) {
        if (!u?.name) continue
        const nLower = u.name.toLowerCase()
        const frontLower = String(card?.front || '').toLowerCase()
        if (nLower.length >= 2 && frontLower.includes(nLower)) {
          assignments.push({ cardIndex: i, unitId: u.id, newUnitName: null, chapterId: u.chapterId || null, newChapterName: null })
          matched = true
          break
        }
      }
      if (!matched) {
        assignments.push({ cardIndex: i, unitId: null, newUnitName: (card.front || '新单元').slice(0, 14), chapterId: null, newChapterName: (card.front || '新章节').slice(0, 12) })
      }
    }
  }

  return assignments

  // 本地降级分类（AI 完全失败时使用，按 front 前缀聚类减少新单元数）
  async function fallbackClassifyLocal(existingUnits, newCards) {
    const { matchUnit } = await import('../utils/helpers')
    const out = []
    const MAX_UNIT_CARDS = 50
    const MIN_UNIT_CARDS = 2

    // 第 1 遍：尝试匹配现有单元
    const unmatched = []
    for (let i = 0; i < newCards.length; i++) {
      const c = newCards[i]
      let matched = null
      for (const u of existingUnits || []) {
        if (!u?.name) continue
        const nLower = u.name.toLowerCase()
        const frontLower = String(c.front || '').toLowerCase()
        if (nLower.length >= 2 && frontLower.includes(nLower)) {
          matched = u
          break
        }
      }
      if (!matched) {
        matched = matchUnit(existingUnits || [], String(c.front || '').slice(0, 15))
      }
      if (matched) {
        out.push({ cardIndex: i, unitId: matched.id, newUnitName: null, chapterId: matched.chapterId || null, newChapterName: null })
      } else {
        unmatched.push({ cardIndex: i, front: String(c.front || ''), knowledge_point: String(c.knowledge_point || '') })
      }
    }

    // 第 2 遍：未匹配的卡片按前缀聚类，减少新单元数量
    if (unmatched.length > 0) {
      const clusters = []
      for (const item of unmatched) {
        let placed = false
        const prefix = item.front.slice(0, 10)
        for (const cluster of clusters) {
          if (cluster.cardIndices.length >= MAX_UNIT_CARDS) continue
          const cp = cluster.unitName.slice(0, 10)
          if ((prefix && cp && (prefix === cp || prefix.includes(cp) || cp.includes(prefix))) ||
              (item.knowledge_point && item.knowledge_point.includes(cp))) {
            cluster.cardIndices.push(item.cardIndex)
            placed = true
            break
          }
        }
        if (!placed) {
          const unitName = item.knowledge_point ? item.knowledge_point.slice(0, 16) : item.front.slice(0, 16)
          clusters.push({
            unitName: unitName || '新单元',
            cardIndices: [item.cardIndex],
          })
        }
      }

      // 合并小单元
      let i = 0
      while (i < clusters.length) {
        if (clusters[i].cardIndices.length < MIN_UNIT_CARDS && i > 0) {
          clusters[i - 1].cardIndices.push(...clusters[i].cardIndices)
          clusters.splice(i, 1)
        } else {
          i++
        }
      }

      for (const cluster of clusters) {
        for (const ci of cluster.cardIndices) {
          out.push({ cardIndex: ci, unitId: null, newUnitName: cluster.unitName.slice(0, 16), chapterId: null, newChapterName: null })
        }
      }
    }

    return out
  }
}

/**
 * 弱模型（Spark Lite）多轮分类：chapter-and-unit
 * 第一轮：将卡片归类到章节级别
 * 第二轮：在每个章节内，将卡片归类到单元级别
 */
async function classifyCardsByKnowledgePointsMultiRound(knowledgePoints, kpMarkers, existingUnits, existingChapters, newCards, config) {
  if (!newCards || newCards.length === 0) return []
  // 无章节时也继续走多轮分类，让 AI 在章节级自由创建新章节

  // 数据一致性校验

  const password = (config.sparkApiKey || '').trim()
  const normalizeName = (name) => String(name || '').trim().toLowerCase().replace(/[\s\-_·]/g, '')

  // 章节归一化映射
  const chapterNormMap = new Map()
  const chapterIdsByIndex = []
  for (const ch of existingChapters) {
    if (!ch?.id) continue
    chapterIdsByIndex.push(ch.id)
    chapterNormMap.set(normalizeName(ch.name), ch)
  }

  // 单元归一化映射
  const unitNormMap = new Map()
  const unitIdsByIndex = []
  for (const u of existingUnits || []) {
    if (!u?.id) continue
    unitIdsByIndex.push(u.id)
    unitNormMap.set(normalizeName(u.name), u)
  }

  const cardLines = newCards.map((c, i) => {
    const kp = c.knowledge_point ? ` | 知识点=${String(c.knowledge_point).slice(0, 80)}` : ''
    return `  卡片${i}: Q=${String(c.front || '').slice(0, 80)} | A=${String(c.back || '').slice(0, 80)}${kp}`
  })

  // 构建用户已确认的主题信息（用于约束新章节数量）
  const topics = config?.topics || []
  const topicBlock = topics.length > 0
    ? `\n【用户已确认的主题分组】（新章节数量必须 ≤ ${topics.length} 个，必须严格按这些主题创建章节）：\n` +
      topics.map((t, i) => `  主题${i + 1}：${t.topicName}（含 ${(t.pointIndices || []).length} 个知识点）`).join('\n')
    : ''

  // ===== 第一轮：章节级分类 =====
  const chapterNames = existingChapters.map(ch => ch.name)
  const round1Prompt =
`你是考研知识体系整理助手。请将下面卡片归类到合适的章节中。${topicBlock}

【重要约束】：
- 新章节数量必须 ≤ ${topics.length > 0 ? topics.length : '现有章节数量'}
- 每张卡片必须归入某个主题对应的章节（或现有章节）
- 同一主题的卡片应归入同一章节

【现有章节】：
${chapterNames.length > 0 ? chapterNames.map((n, i) => `${i}|${n}`).join('\n') : '（暂无章节）'}

【待归类卡片】：
${cardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一张卡片，不要JSON、不要代码块、不要额外文字。
格式（归入现有章节）: cardIndex|E|chapterIndex
格式（创建新章节）: cardIndex|N|newChapterName
示例：
0|E|0
1|N|新章节名
- chapterIndex: 现有章节的编号（整数）
- newChapterName: 新建章节时填写，≤12字`

  let chapterAssignments = []
  let round1Timeout = false
  try {
    const resp = await httpPost(SPARK_URL, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
      data: {
        model: config.model || 'lite',
        messages: [{ role: 'user', content: round1Prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      },
      timeout: 30000,
    })
    if (resp && resp.ok) {
      const raw = resp.data?.choices?.[0]?.message?.content || ''
      // 优先尝试线性表解析
      const linearResult = parseLinearKpMultiRoundResult(raw, 1)
      if (linearResult) {
        chapterAssignments = linearResult
      } else {
        try {
          const trimmed = String(raw).trim()
          const firstBracket = trimmed.indexOf('[')
          const lastBracket = trimmed.lastIndexOf(']')
          if (firstBracket !== -1 && lastBracket > firstBracket) {
            chapterAssignments = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
          } else {
            console.warn('[classifyCardsByKnowledgePointsMultiRound] Round1: 未找到 JSON 数组，原始内容前100字符:', raw.slice(0, 100))
          }
        } catch (e) {
          console.error('[classifyCardsByKnowledgePointsMultiRound] Round1 JSON 解析失败:', e.message, '原始内容前100字符:', raw.slice(0, 100))
        }
      }
    }
  } catch (err) {
    if (err?.message?.includes('超时') || err?.message?.includes('timeout') || err?.name === 'AbortError') {
      round1Timeout = true
    }
  }

  if (round1Timeout) {
    throw new AiTimeoutError('AI 章节分类响应超时，请重试或使用默认分组', 'chapter')
  }

  if (!Array.isArray(chapterAssignments) || chapterAssignments.length === 0) {
    return fallbackClassifyMultiRound(existingUnits, existingChapters, newCards)
  }

  // 整理章节分配结果
  const cardToChapter = new Map() // cardIndex -> { chapterId, chapterName, isNew }
  const newChapters = [] // { name, cardIndices }
  for (const item of chapterAssignments) {
    const idx = Number(item.cardIndex)
    if (isNaN(idx) || idx < 0 || idx >= newCards.length) continue

    if (item.isNew && item.newChapterName) {
      const chName = String(item.newChapterName).trim().slice(0, 12)
      let found = newChapters.find(nc => nc.name === chName)
      if (!found) {
        found = { name: chName, cardIndices: [] }
        newChapters.push(found)
      }
      found.cardIndices.push(idx)
      cardToChapter.set(idx, { chapterId: null, chapterName: chName, isNew: true })
    } else if (typeof item.chapterIndex === 'number') {
      const chId = chapterIdsByIndex[item.chapterIndex]
      if (chId) {
        const chName = existingChapters[chapterIdsByIndex.indexOf(chId)]?.name || '未知章节'
        cardToChapter.set(idx, { chapterId: chId, chapterName: chName, isNew: false })
      }
    }
  }

  // 未分配的卡片使用 fallback
  for (let i = 0; i < newCards.length; i++) {
    if (!cardToChapter.has(i)) {
      const front = String(newCards[i].front || '')
      // 尝试匹配现有章节
      let matched = false
      for (const ch of existingChapters) {
        if (ch.name && front.toLowerCase().includes(ch.name.toLowerCase())) {
          cardToChapter.set(i, { chapterId: ch.id, chapterName: ch.name, isNew: false })
          matched = true
          break
        }
      }
      if (!matched) {
        cardToChapter.set(i, { chapterId: null, chapterName: '未归类', isNew: true })
      }
    }
  }

  // ===== 第二轮：每个章节内，单元级分类 =====
  const assignments = []
  const chapters = new Map() // chapterKey -> { chapterId, chapterName, cardIndices }

  for (let i = 0; i < newCards.length; i++) {
    const chInfo = cardToChapter.get(i)
    if (!chInfo) continue
    const key = chInfo.chapterId || `new:${chInfo.chapterName}`
    if (!chapters.has(key)) {
      chapters.set(key, { chapterId: chInfo.chapterId, chapterName: chInfo.chapterName, cardIndices: [] })
    }
    chapters.get(key).cardIndices.push(i)
  }

  for (const [, chData] of chapters) {
    const chUnitNames = existingUnits
      .filter(u => u.chapterId === chData.chapterId)
      .map(u => u.name)

    const chCardLines = chData.cardIndices.map((ci) => {
      const c = newCards[ci]
      return `  卡片${ci}: Q=${String(c.front || '').slice(0, 80)}`
    })

    if (chData.cardIndices.length <= 1) {
      // 只有1张卡片，直接尝试匹配现有单元
      const ci = chData.cardIndices[0]
      const c = newCards[ci]
      let matchedUnit = null
      for (const u of existingUnits.filter(u => u.chapterId === chData.chapterId)) {
        if (u.name && String(c.front || '').toLowerCase().includes(u.name.toLowerCase())) {
          matchedUnit = u
          break
        }
      }
      assignments.push({
        cardIndex: ci,
        chapterId: chData.chapterId || null,
        unitId: matchedUnit ? matchedUnit.id : null,
        newChapterName: chData.chapterId ? null : chData.chapterName,
        newUnitName: matchedUnit ? null : (c.front || '新单元').slice(0, 14),
      })
      continue
    }

    const round2Prompt =
`你是考研知识体系整理助手。请将下面卡片归类到章节"${chData.chapterName}"下的合适单元中。

【现有单元】：
${chUnitNames.length > 0 ? chUnitNames.map((n, i) => `${i}|${n}`).join('\n') : '（暂无单元）'}

【待归类卡片】：
${chCardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一张卡片，不要JSON、不要代码块、不要额外文字。
格式（归入现有单元）: cardIndex|E|unitIndex
格式（创建新单元）: cardIndex|N|newUnitName
示例：
0|E|0
1|N|新单元名
- cardIndex: 卡片原始编号
- unitIndex: 现有单元编号
- newUnitName: ≤16字`

    let round2Timeout = false
    try {
      const resp = await httpPost(SPARK_URL, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
        data: {
          model: config.model || 'lite',
          messages: [{ role: 'user', content: round2Prompt }],
          temperature: 0.3,
          max_tokens: 2048,
        },
        timeout: 30000,
      })

      if (resp && resp.ok) {
        const raw = resp.data?.choices?.[0]?.message?.content || ''
        let unitAssignments = []
        // 优先尝试线性表解析
        const linearResult = parseLinearKpMultiRoundResult(raw, 2)
        if (linearResult) {
          unitAssignments = linearResult
        } else {
          try {
            const trimmed = String(raw).trim()
            const firstBracket = trimmed.indexOf('[')
            const lastBracket = trimmed.lastIndexOf(']')
            if (firstBracket !== -1 && lastBracket > firstBracket) {
              unitAssignments = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
            } else {
              console.warn('[classifyCardsByKnowledgePointsMultiRound] Round2: 未找到 JSON 数组，原始内容前100字符:', raw.slice(0, 100))
            }
          } catch (e) {
            console.error('[classifyCardsByKnowledgePointsMultiRound] Round2 JSON 解析失败:', e.message, '原始内容前100字符:', raw.slice(0, 100))
          }
        }

        if (Array.isArray(unitAssignments)) {
          for (const item of unitAssignments) {
            const ci = Number(item.cardIndex)
            if (isNaN(ci) || ci < 0 || ci >= newCards.length) continue

            if (item.isNew && item.newUnitName) {
              assignments.push({
                cardIndex: ci,
                chapterId: chData.chapterId || null,
                unitId: null,
                newChapterName: chData.chapterId ? null : chData.chapterName,
                newUnitName: String(item.newUnitName).trim().slice(0, 16),
              })
            } else if (typeof item.unitIndex === 'number') {
              const chUnits = existingUnits.filter(u => u.chapterId === chData.chapterId)
              const unitIds = chUnits.map(u => u.id)
              const uId = unitIds[item.unitIndex] || null
              assignments.push({
                cardIndex: ci,
                chapterId: chData.chapterId || null,
                unitId: uId || null,
                newChapterName: chData.chapterId ? null : chData.chapterName,
                newUnitName: null,
              })
            }
          }
        }
      }
    } catch (err) {
      if (err?.message?.includes('超时') || err?.message?.includes('timeout') || err?.name === 'AbortError') {
        round2Timeout = true
      }
    }

    if (round2Timeout) {
      // 【修复】Round2 超时时，先为当前章节的所有卡片创建 fallback 分配
      // 否则这些卡片会丢失（只有1张卡片的章节在3670行已添加，多卡片章节会全部丢失）
      for (const ci of chData.cardIndices) {
        if (!assignments.find(a => a.cardIndex === ci)) {
          const c = newCards[ci]
          let matchedUnit = null
          for (const u of existingUnits.filter(u => u.chapterId === chData.chapterId)) {
            if (u.name && String(c.front || '').toLowerCase().includes(u.name.toLowerCase())) {
              matchedUnit = u
              break
            }
          }
          assignments.push({
            cardIndex: ci,
            chapterId: chData.chapterId || null,
            unitId: matchedUnit ? matchedUnit.id : null,
            newChapterName: chData.chapterId ? null : chData.chapterName,
            newUnitName: matchedUnit ? null : (c.front || '新单元').slice(0, 14),
          })
        }
      }
      throw new AiTimeoutError('AI 单元分类响应超时，请重试或使用默认分组', 'unit')
    }

    // 处理第二轮未分配的卡片（正常流程，不会因超时跳过）
    for (const ci of chData.cardIndices) {
      if (!assignments.find(a => a.cardIndex === ci)) {
        const c = newCards[ci]
        let matchedUnit = null
        for (const u of existingUnits.filter(u => u.chapterId === chData.chapterId)) {
          if (u.name && String(c.front || '').toLowerCase().includes(u.name.toLowerCase())) {
            matchedUnit = u
            break
          }
        }
        assignments.push({
          cardIndex: ci,
          chapterId: chData.chapterId || null,
          unitId: matchedUnit ? matchedUnit.id : null,
          newChapterName: chData.chapterId ? null : chData.chapterName,
          newUnitName: matchedUnit ? null : (c.front || '新单元').slice(0, 14),
        })
      }
    }
  }

  // 最终检查：确保所有卡片都被处理（防止 AI 分类遗漏）
  const assignedIndices = new Set(assignments.map(a => a.cardIndex))
  
  // 构建知识点索引到主题名称的映射（参考主题聚类结果）
  const kpIndexToTopic = new Map()
  for (const topic of topics) {
    for (const kpIdx of (topic.pointIndices || [])) {
      kpIndexToTopic.set(kpIdx, topic.topicName)
    }
  }
  
  for (let i = 0; i < newCards.length; i++) {
    if (!assignedIndices.has(i)) {
      const c = newCards[i]
      // 优先使用主题聚类结果，否则使用知识点名称
      const kpIndex = c.kpIndex ?? i
      const topicName = kpIndexToTopic.get(kpIndex) || c.knowledge_point || '未归类'
      const shortName = String(topicName).slice(0, 12)
      assignments.push({
        cardIndex: i,
        chapterId: null,
        unitId: null,
        newChapterName: shortName,
        newUnitName: String(topicName).slice(0, 16),
      })
    }
  }

  return assignments
}

async function fallbackClassifyMultiRound(existingUnits, existingChapters, newCards) {
  const out = []
  const MAX_UNIT_CARDS = 50
  const MIN_UNIT_CARDS = 2
  const MAX_CHAPTER_UNITS = 10

  for (let i = 0; i < newCards.length; i++) {
    const c = newCards[i]
    const frontLower = String(c.front || '').toLowerCase()
    const knowledgePoint = String(c.knowledge_point || '')
    let matchedChapter = null
    for (const ch of existingChapters || []) {
      if (ch?.name && frontLower.includes(ch.name.toLowerCase())) {
        matchedChapter = ch
        break
      }
    }
    if (matchedChapter) {
      const chUnits = (existingUnits || []).filter(u => u.chapterId === matchedChapter.id)
      let matchedUnit = null
      for (const u of chUnits) {
        if (u?.name && frontLower.includes(u.name.toLowerCase())) {
          matchedUnit = u
          break
        }
      }
      const unitName = knowledgePoint ? knowledgePoint.slice(0, 16) : (c.front || '新单元').slice(0, 16)
      out.push({
        cardIndex: i,
        chapterId: matchedChapter.id,
        unitId: matchedUnit ? matchedUnit.id : null,
        newChapterName: null,
        newUnitName: matchedUnit ? null : unitName,
      })
    } else {
      const chapterName = knowledgePoint ? knowledgePoint.slice(0, 12) : (c.front || '新章节').slice(0, 12)
      const unitName = knowledgePoint ? knowledgePoint.slice(0, 16) : (c.front || '新单元').slice(0, 16)
      out.push({
        cardIndex: i,
        chapterId: null,
        unitId: null,
        newChapterName: chapterName,
        newUnitName: unitName,
        _pending: true,
      })
    }
  }

  // 对未匹配到现有章节的卡片进行自动聚类
  const pendingCards = out.filter(a => a._pending)
  if (pendingCards.length > 0) {
    const chapterClusters = []
    for (const ass of pendingCards) {
      const card = newCards[ass.cardIndex]
      const frontText = String(card.front || '')
      const frontPrefix = frontText.slice(0, 15)
      const kp = String(card.knowledge_point || '')
      let placed = false

      for (const chCluster of chapterClusters) {
        if (chCluster.prefix && (frontPrefix.includes(chCluster.prefix) || chCluster.prefix.includes(frontPrefix) ||
            (kp && kp.includes(chCluster.prefix)))) {
          let unitPlaced = false
          for (const uCluster of chCluster.units) {
            if (uCluster.cardIndices.length >= MAX_UNIT_CARDS) continue
            const uPrefix = uCluster.unitName.slice(0, 10)
            if ((frontPrefix.slice(0, 10) === uPrefix || frontPrefix.includes(uPrefix) || uPrefix.includes(frontPrefix)) ||
                (kp && kp.includes(uPrefix))) {
              uCluster.cardIndices.push(ass.cardIndex)
              unitPlaced = true
              break
            }
          }
          if (!unitPlaced && chCluster.units.length < MAX_CHAPTER_UNITS) {
            const unitName = kp ? kp.slice(0, 16) : frontText.slice(0, 16)
            chCluster.units.push({
              unitName: unitName || '新单元',
              cardIndices: [ass.cardIndex],
            })
          } else if (!unitPlaced) {
            chapterClusters.push({
              prefix: frontPrefix.slice(0, 8),
              chapterName: kp ? kp.slice(0, 12) : frontText.slice(0, 12),
              units: [{
                unitName: unitName || '新单元',
                cardIndices: [ass.cardIndex],
              }],
            })
          }
          placed = true
          break
        }
      }
      if (!placed) {
        const chapterName = kp ? kp.slice(0, 12) : frontText.slice(0, 12)
        const unitName = kp ? kp.slice(0, 16) : frontText.slice(0, 16)
        chapterClusters.push({
          prefix: frontPrefix.slice(0, 8),
          chapterName: chapterName || '新章节',
          units: [{
            unitName: unitName || '新单元',
            cardIndices: [ass.cardIndex],
          }],
        })
      }
    }

    for (const chCluster of chapterClusters) {
      for (const uCluster of chCluster.units) {
        for (const ci of uCluster.cardIndices) {
          const ass = out.find(a => a.cardIndex === ci)
          if (ass) {
            ass.newChapterName = chCluster.chapterName.slice(0, 12)
            ass.newUnitName = uCluster.unitName.slice(0, 16)
            ass._pending = false
          }
        }
      }
    }

    // 合并小单元
    for (const chCluster of chapterClusters) {
      if (chCluster.units.length <= 1) continue
      let i = 0
      while (i < chCluster.units.length) {
        if (chCluster.units[i].cardIndices.length < MIN_UNIT_CARDS && i > 0) {
          chCluster.units[i - 1].cardIndices.push(...chCluster.units[i].cardIndices)
          chCluster.units.splice(i, 1)
        } else {
          i++
        }
      }
    }

    // 更新合并后的分配
    for (const chCluster of chapterClusters) {
      for (const uCluster of chCluster.units) {
        for (const ci of uCluster.cardIndices) {
          const ass = out.find(a => a.cardIndex === ci)
          if (ass) {
            ass.newChapterName = chCluster.chapterName.slice(0, 12)
            ass.newUnitName = uCluster.unitName.slice(0, 16)
          }
        }
      }
    }
  }

  for (const ass of out) {
    delete ass._pending
  }

  return out
}

async function classifySameCategoryReorganize(existingUnits, existingCards, selectedCards, config, hasApi, classificationDepth, existingChapters, categoryPurpose) {
  const fallbackResult = () => buildSameCategoryFallback(existingUnits, selectedCards, classificationDepth, existingChapters)
  if (!hasApi) return fallbackResult()

  // 进度回调
  const onProgress = config?.onProgress || (() => {})

  // [弱模型限制] 智能单元整理需要较强的语义理解能力，Spark Lite 准确率过低，不支持
  if (config?.aiServiceMode === 'iflytek-spark' && (!config?.model || config.model === 'lite' || String(config.model).includes('lite'))) {
    throw new Error('智能单元整理需要较强的语义理解能力，Spark Lite 暂不支持，请切换至 DeepSeek/Qwen/Spark Pro 等更强模型后再试。')
  }

  // ===== 三部分新架构：单元新建 → 单元合并 → 单元归类到章节 =====
  if (classificationDepth === 'chapter-and-unit' || classificationDepth === 'chapter-only') {
    try {
      onProgress(5, '开始分析知识点')

      // 所有选中卡片都进入AI处理流程（不再跳过全选单元）
      const unitsToSkip = new Set()

      // 第一部分：分批进行单元的新建
      onProgress(10, '第一部分：分批单元新建')
      const part1Units = await reorganizePart1_UnitCreation(
        existingUnits, selectedCards, config, categoryPurpose, unitsToSkip,
        (batchIdx, totalBatches) => onProgress(10 + Math.round((batchIdx + 1) / totalBatches * 35), `第一部分：处理批次 ${batchIdx + 1}/${totalBatches}`)
      )
      onProgress(48, `第一部分完成：${part1Units.length} 个单元`)

      // 第二部分：分批对单元进行合并
      onProgress(52, '第二部分：AI单元合并')
      const part2Units = await reorganizePart2_UnitMerge(part1Units, config, categoryPurpose)
      onProgress(70, `第二部分完成：${part2Units.length} 个单元`)

      // 第三部分：单元归类到章节
      onProgress(75, '第三部分：单元归类到章节')
      const part3Chapters = await reorganizePart3_UnitToChapter(
        part2Units, existingChapters, config, categoryPurpose, classificationDepth
      )
      onProgress(90, `第三部分完成：${part3Chapters.length} 个章节`)

      // 主题持久化
      const categoryId = existingUnits[0]?.categoryId || null
      const chaptersWithTopic = await persistTopicsToChapters(part3Chapters, categoryId)

      // chapter-only 模式：将单元卡片展平到章节
      if (classificationDepth === 'chapter-only') {
        const flattenedChapters = chaptersWithTopic.map(ch => {
          const allCards = []
          for (const u of (ch.units || [])) {
            if (Array.isArray(u.cards)) allCards.push(...u.cards)
          }
          if (Array.isArray(ch.cards)) allCards.push(...ch.cards)
          return { ...ch, units: [], cards: allCards }
        })
        return { mode: 'same-category-reorganize', usedFallback: false, chapters: flattenedChapters }
      }

      return { mode: 'same-category-reorganize', usedFallback: false, chapters: chaptersWithTopic }

    } catch (err) {
      const isAiCallError = err.message && (
        err.message.includes('AI') || err.message.includes('API') ||
        err.message.includes('网络') || err.message.includes('timeout') ||
        err.message.includes('超时') || err.message.includes('fetch')
      )
      if (isAiCallError) {
        console.warn('[aiCallFailed][classifySameCategoryReorganize] AI 调用失败，降级到 fallback:', err.message)
      } else {
        console.error('[classifyBug][classifySameCategoryReorganize] 数据处理异常，降级到 fallback:', err.message, err.stack)
      }
      return fallbackResult()
    }
  }

  // ===== unit-only 模式：保持原有逻辑 =====
  // 构建章节上下文
  const chapterBlocks = []
  const chapterIdsByIndex = []
  if ((classificationDepth === 'chapter-and-unit' || classificationDepth === 'chapter-only') && existingChapters && existingChapters.length > 0) {
    for (const ch of existingChapters) {
      if (!ch?.id) continue
      chapterIdsByIndex.push(ch.id)
      const chUnits = (existingUnits || []).filter(u => u.chapterId === ch.id)
      let block = `【章节${chapterIdsByIndex.length - 1}】${ch.name}`
      if (classificationDepth === 'chapter-and-unit' && chUnits.length > 0) {
        const unitLines = chUnits.map((u, ui) => {
          const sampleCards = (existingCards || [])
            .filter(c => c.unitId === u.id)
            .slice(0, 5)
          let ul = `  - 单元${chapterIdsByIndex.length - 1}-${ui}：${u.name}`
          if (sampleCards.length > 0) {
            ul += '（示例：' + sampleCards.map(c => String(c.front || '').slice(0, 30)).join('；') + '）'
          }
          return ul
        })
        block += '\n' + unitLines.join('\n')
      }
      chapterBlocks.push(block)
    }
  }

  const unitBlocks = []
  const unitIdsByIndex = []
  for (const unit of existingUnits || []) {
    if (!unit?.id) continue
    unitIdsByIndex.push(unit.id)
    const sampleCards = (existingCards || [])
      .filter(card => card.unitId === unit.id)
      .slice(0, 8)
      .map(card => String(card.front || '').slice(0, 36))
      .filter(Boolean)
    unitBlocks.push(
      `【单元${unitIdsByIndex.length - 1}】${unit.name}` +
      (sampleCards.length ? `\n  示例：${sampleCards.join('；')}` : ''),
    )
  }

  const cardLines = selectedCards.map((card, index) => {
    const kp = card.knowledge_point ? ` | 原始知识点=${String(card.knowledge_point).slice(0, 80)}` : ''
    return `  卡片${index}: Q=${String(card.front || '').slice(0, 80)} | A=${String(card.back || '').slice(0, 80)}${kp}`
  })

  let prompt
  if (classificationDepth === 'chapter-and-unit') {
    prompt =
`你是考研背诵卡片的章节+单元整理助手。请只在同一个分类内部，重新组织用户选中的卡片，将其分配到合适的章节和单元中。

【目标】：
1. 根据卡片知识点相似度，把选中卡片分配到更合适的章节和单元。
2. 优先使用已有章节和单元名称；已有结构能承载时不要新建。
3. 可建议对已有章节/单元重命名，但名称要简洁、适合考研复习，章节名不超过 12 个字，单元名不超过 16 个字。
4. 只有当多张卡片明显形成已有章节无法覆盖的新主题时，才创建新章节。
5. 必须覆盖每一张卡片，且每张卡片只能出现在一个章节的一个单元中。

【粒度控制（必须遵守）】：
- 章节粒度：每个章节包含 2-5 个单元；当卡片数量较多时可扩展至 2-10 个单元。
- 单元卡片数：每个单元包含 2-50 张卡片，根据主题复杂度灵活调整。
- 单元命名概括：使用宽泛的概括性命名（如"链表基础操作"而非"单链表插入"）。
- 禁止为每个单元创建独立章节！相同主题的多个单元必须归入同一章节。

【重要约束（必须遵守）】：
- 一个章节下至少要有 2 个单元。
- 新章节总数不超过 2 个，新单元总数不超过 3 个。
- 尽量将卡片归入现有章节，不要轻易创建新章节。

【现有章节与单元】：
${chapterBlocks.length > 0 ? chapterBlocks.join('\n') : '（当前分类尚无章节）'}
${unitBlocks.length > 0 ? '\n\n【未归章单元】：\n' + unitBlocks.join('\n') : ''}

【选中卡片】：
${cardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一个单元，不要JSON、不要代码块、不要额外文字。
格式: chapterIndex|chapterName|unitIndex|unitName|cardIndices
示例：
0|章节名称|0|单元名称|0,1,2
0|章节名称|1|另一单元|3,4,5
1|新章节名|null|新单元名|6,7

注意：
- chapterIndex为现有章节编号，新章节填null
- unitIndex为现有单元编号，新单元填null
- cardIndices用英文逗号分隔
- 名称中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`
  } else if (classificationDepth === 'chapter-only') {
    prompt =
`你是考研背诵卡片的章节整理助手。请只在同一个分类内部，重新组织用户选中的卡片，将其分配到合适的章节中，并为未分类的卡片创建新单元。

【目标】：
1. 根据卡片知识点相似度，把选中卡片分配到更合适的章节。
2. 优先使用已有章节名称；已有章节能承载时不要新建章节。
3. 可建议对已有章节重命名，但名称要简洁、适合考研复习，不超过 12 个字。
4. 只有当多张卡片明显形成已有章节无法覆盖的新主题时，才创建新章节。
5. 必须覆盖每一张卡片，且每张卡片只能出现在一个章节中。
6. 为未分类的卡片创建新单元，新单元归入合适的章节。

【粒度控制（必须遵守）】：
- 章节粒度：每个章节包含 2-5 个单元；当卡片数量较多时可扩展至 2-10 个单元。
- 单元卡片数：每个单元包含 2-50 张卡片，根据主题复杂度灵活调整。
- 单元命名概括：使用宽泛的概括性命名（如"计算机网络基础"而非"OSI七层模型"）。

【现有章节】：
${chapterBlocks.length > 0 ? chapterBlocks.join('\n') : '（当前分类尚无章节）'}

【选中卡片】：
${cardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一个单元，不要JSON、不要代码块、不要额外文字。
格式: chapterIndex|chapterName|unitName|cardIndices
示例：
0|章节名称|单元名称|0,1,2
1|新章节名|新单元名|3,4,5

注意：
- chapterIndex为现有章节编号，新章节填null
- cardIndices用英文逗号分隔
- 名称中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`
  } else {
    prompt =
`你是考研背诵卡片的单元整理助手。请只在同一个分类内部，重新组织用户选中的卡片。

【目标】：
1. 根据卡片知识点相似度，把选中卡片分配到更合适的单元。
2. 优先使用已有单元名称；已有单元能承载时不要新建单元。
3. 可建议对已有单元重命名，但名称要简洁、适合考研复习，不超过 16 个字。
4. 只有当多张卡片明显形成已有单元无法覆盖的新主题时，才创建新单元。
5. 必须覆盖每一张卡片，且每张卡片只能出现在一个单元中。

【粒度控制（必须遵守）】：
- 单元卡片数：每个单元包含 2-50 张卡片，根据主题复杂度灵活调整。
- 单元命名概括：使用宽泛的概括性命名（如"计算机网络基础"而非"OSI七层模型"）。

【现有单元】：
${unitBlocks.length > 0 ? unitBlocks.join('\n') : '（当前分类尚无单元）'}

【选中卡片】：
${cardLines.join('\n')}

【输出格式】请严格使用"分组线性表"格式返回，每行一个单元，不要JSON、不要代码块、不要额外文字。
格式: unitIndex|unitName|cardIndices
示例：
0|单元名称|0,1,2
null|新单元名|3,4,5

注意：
- unitIndex为现有单元编号，新单元填null
- cardIndices用英文逗号分隔
- 名称中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`
  }

  try {
    const result = await callAiProvider(prompt, config)
    let parsed = parseLinearSameCategoryResult(result.content, classificationDepth)
    if (!parsed) {
      parsed = parseSameCategoryResult(result.content)
    }

    if (classificationDepth === 'chapter-and-unit') {
      if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
        return fallbackResult()
      }
      const usedCardIndices = new Set()
      const chapters = []
      for (const chapter of parsed.chapters) {
        const chName = String(chapter?.name || '').trim().slice(0, 12)
        if (!chName) continue
        const chId = typeof chapter.chapterIndex === 'number' ? chapterIdsByIndex[chapter.chapterIndex] || null : null
        const units = []
        for (const unit of chapter.units || []) {
          const rawIndices = Array.isArray(unit.cardIndices) ? unit.cardIndices : []
          const cards = rawIndices
            .map(index => Number(index))
            .filter(index => Number.isInteger(index) && index >= 0 && index < selectedCards.length && !usedCardIndices.has(index))
            .map(index => {
              usedCardIndices.add(index)
              return selectedCards[index]
            })
          if (cards.length === 0) continue
          const unitId = typeof unit.unitIndex === 'number' ? unitIdsByIndex[unit.unitIndex] || null : null
          const existingUnit = unitId ? existingUnits.find(item => item.id === unitId) : null
          units.push({
            unitId,
            name: String(unit.name || existingUnit?.name || '新单元').trim().slice(0, 16) || '新单元',
            cards,
          })
        }
        if (units.length > 0) {
          chapters.push({
            chapterId: chId,
            name: chName,
            units,
          })
        }
      }
      if (usedCardIndices.size < selectedCards.length) {
        const fallback = buildSameCategoryFallback(existingUnits, selectedCards.filter((_, index) => !usedCardIndices.has(index)), classificationDepth, existingChapters)
        if (fallback.chapters && Array.isArray(fallback.chapters)) {
          // 有章节的 fallback：合并到结果中
          for (const fbCh of fallback.chapters) {
            const existingCh = chapters.find(ch => ch.name === fbCh.name)
            if (existingCh) {
              existingCh.units = existingCh.units || []
              existingCh.units.push(...(fbCh.units || []))
            } else {
              chapters.push(fbCh)
            }
          }
        } else if (fallback.units && Array.isArray(fallback.units)) {
          // 纯单元 fallback
          if (chapters.length > 0) {
            chapters[chapters.length - 1].units.push(...fallback.units)
          } else {
            chapters.push({ chapterId: null, name: '默认章节', units: fallback.units })
          }
        }
      }
      // 主题持久化：为每个章节获取或创建 topic
      const categoryId = existingUnits[0]?.categoryId || null
      for (const ch of chapters) {
        if (categoryId && ch.name) {
          const existingTopic = await getTopicByName(categoryId, ch.name)
          if (existingTopic) {
            ch.topicId = existingTopic.id
          } else {
            const newTopic = await createTopic(categoryId, ch.name)
            ch.topicId = newTopic.id
          }
        }
      }
      return {
        mode: 'same-category-reorganize',
        usedFallback: false,
        chapters,
      }
    }

    if (classificationDepth === 'chapter-only') {
      if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
        return fallbackResult()
      }
      const usedCardIndices = new Set()
      const chapters = []
      for (const chapter of parsed.chapters) {
        const chName = String(chapter?.name || '').trim().slice(0, 12)
        if (!chName) continue
        const rawIndices = Array.isArray(chapter.cardIndices) ? chapter.cardIndices : []
        const cards = rawIndices
          .map(index => Number(index))
          .filter(index => Number.isInteger(index) && index >= 0 && index < selectedCards.length && !usedCardIndices.has(index))
          .map(index => {
            usedCardIndices.add(index)
            return selectedCards[index]
          })
        if (cards.length === 0) continue
        const chId = typeof chapter.chapterIndex === 'number' ? chapterIdsByIndex[chapter.chapterIndex] || null : null
        chapters.push({ chapterId: chId, name: chName, cards })
      }
      if (usedCardIndices.size < selectedCards.length) {
        chapters.push({
          chapterId: null,
          name: '未归类',
          cards: selectedCards.filter((_, index) => !usedCardIndices.has(index)),
        })
      }
      // 主题持久化：为每个章节获取或创建 topic
      const categoryId = existingUnits[0]?.categoryId || null
      for (const ch of chapters) {
        if (categoryId && ch.name) {
          const existingTopic = await getTopicByName(categoryId, ch.name)
          if (existingTopic) {
            ch.topicId = existingTopic.id
          } else {
            const newTopic = await createTopic(categoryId, ch.name)
            ch.topicId = newTopic.id
          }
        }
      }
      return {
        mode: 'same-category-reorganize',
        usedFallback: false,
        chapters,
      }
    }

    // unit-only (default)
    if (!parsed || !Array.isArray(parsed.units) || parsed.units.length === 0) {
      return fallbackResult()
    }

    const usedCardIndices = new Set()
    const units = []
    for (const unit of parsed.units) {
      const rawIndices = Array.isArray(unit.cardIndices) ? unit.cardIndices : []
      const cards = rawIndices
        .map(index => Number(index))
        .filter(index => Number.isInteger(index) && index >= 0 && index < selectedCards.length && !usedCardIndices.has(index))
        .map(index => {
          usedCardIndices.add(index)
          return selectedCards[index]
        })
      if (cards.length === 0) continue

      const unitId = typeof unit.unitIndex === 'number' ? unitIdsByIndex[unit.unitIndex] || null : null
      const existingUnit = unitId ? existingUnits.find(item => item.id === unitId) : null
      units.push({
        unitId,
        name: String(unit.name || existingUnit?.name || '新单元').trim().slice(0, 16) || '新单元',
        cards,
      })
    }

    if (usedCardIndices.size < selectedCards.length) {
      const fallback = buildSameCategoryFallback(existingUnits, selectedCards.filter((_, index) => !usedCardIndices.has(index)), classificationDepth, existingChapters)
      if (fallback.chapters && Array.isArray(fallback.chapters)) {
        for (const fbCh of fallback.chapters) {
          const existingCh = chapters.find(ch => ch.name === fbCh.name)
          if (existingCh) {
            existingCh.cards = existingCh.cards || []
            existingCh.cards.push(...(fbCh.cards || []))
          } else {
            chapters.push(fbCh)
          }
        }
      } else if (fallback.units && Array.isArray(fallback.units)) {
        if (chapters.length > 0) {
          chapters[chapters.length - 1].units.push(...fallback.units)
        } else {
          chapters.push({ chapterId: null, name: '默认章节', units: fallback.units })
        }
      }
    }

    return {
      mode: 'same-category-reorganize',
      usedFallback: false,
      units: mergeSameCategoryUnits(units),
    }
  } catch (err) {
    // 区分 AI 调用失败与数据处理 bug
    const isAiCallError = err?.message && (
      err.message.includes('AI') ||
      err.message.includes('API') ||
      err.message.includes('网络') ||
      err.message.includes('timeout') ||
      err.message.includes('超时') ||
      err.message.includes('fetch')
    )
    if (isAiCallError) {
      console.warn('[aiCallFailed][classifySameCategoryReorganize] AI 调用失败，降级到 fallback:', err?.message)
    } else {
      console.error('[classifyBug][classifySameCategoryReorganize] 数据处理异常，降级到 fallback:', err?.message, err?.stack)
    }
    return fallbackResult()
  }
}

/**
 * 降级概述生成：当AI调用失败时，基于卡片内容生成有意义的概述
 * 从卡片front提取关键词，避免使用"学科：未知；章节：未知"
 */
function buildFallbackOverview(cards, categoryPurpose) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return '学科：待补充；章节：待补充'
  }
  // 提取卡片front的关键词（取前5张卡片的前20字符作为主题摘要）
  const samples = cards.slice(0, 5).map(c => {
    const text = String(c.knowledge_point || c.front || '').trim()
    return text.slice(0, 30)
  }).filter(Boolean)

  if (samples.length === 0) {
    return '学科：待补充；章节：待补充'
  }

  // 尝试从卡片内容推断学科主题
  const allText = samples.join(' ')
  const subjectHints = [
    { keywords: ['计算机', '网络', '系统', '硬件', '软件', 'CPU', '存储', '编码', '进制', '数据'], subject: '计算机科学' },
    { keywords: ['函数', '导数', '极限', '微积分', '矩阵', '向量', '概率', '统计', '线性代数'], subject: '数学' },
    { keywords: ['力', '运动', '电', '磁', '光', '热', '能量', '量子', '相对论'], subject: '物理学' },
    { keywords: ['细胞', '基因', 'DNA', '蛋白质', '酶', '代谢', '生态', '进化'], subject: '生物学' },
    { keywords: ['化学', '分子', '原子', '反应', '氧化', '还原', '有机', '无机'], subject: '化学' },
    { keywords: ['英语', '语法', '词汇', '阅读', '翻译', '写作'], subject: '英语' },
    { keywords: ['政治', '马哲', '唯物', '辩证', '社会主义', '资本主义'], subject: '政治学' },
    { keywords: ['历史', '朝代', '战争', '革命', '古代', '近代', '现代'], subject: '历史学' },
  ]

  let detectedSubject = '综合学科'
  for (const hint of subjectHints) {
    if (hint.keywords.some(kw => allText.includes(kw))) {
      detectedSubject = hint.subject
      break
    }
  }

  // 章节主题取第一张卡片的关键词
  const chapterTopic = samples[0].split(/[：:，,。；;、\s]/)[0] || '综合知识'
  const purposeStr = categoryPurpose ? `（${categoryPurpose}方向）` : ''

  return `学科：${detectedSubject}；章节：${chapterTopic}等相关知识${purposeStr}`
}

/**
 * 智能单元整理 - 第一部分：分批进行单元的新建
 * 按现有单元分批，AI判断是否需要新建单元
 * @returns {Promise<Array<{name, overview, cardIndices, sourceUnitId?}>>}
 */
async function reorganizePart1_UnitCreation(existingUnits, selectedCards, config, categoryPurpose, unitsToSkip, onBatchProgress) {
  const BATCH_SIZE = 30

  // ===== Bug 3 修复：被跳过的单元（完全选中）直接保留，卡片归入原单元 =====
  const skippedUnitResults = []
  const skippedCardIds = new Set()
  for (const unit of existingUnits || []) {
    if (unitsToSkip.has(unit.id)) {
      const unitCards = selectedCards.filter(c => c.unitId === unit.id)
      if (unitCards.length > 0) {
        skippedUnitResults.push({
          name: unit.name,
          overview: buildFallbackOverview(unitCards, categoryPurpose),
          cards: unitCards,
          sourceUnitId: unit.id,
        })
        unitCards.forEach(c => skippedCardIds.add(c.id))
      }
    }
  }

  // 步骤1：按现有单元聚合选中的卡片（Bug 1 修复：用 selectedCards 替代未定义的 existingCards）
  const unitToCardsMap = new Map()  // unitId -> [{card, globalIndex}]

  for (const unit of existingUnits || []) {
    if (unitsToSkip.has(unit.id)) continue
    const unitCardsWithIndex = selectedCards
      .map((c, idx) => ({ card: c, globalIndex: idx }))
      .filter(item => item.card.unitId === unit.id && !skippedCardIds.has(item.card.id))
    if (unitCardsWithIndex.length > 0) {
      unitToCardsMap.set(unit.id, unitCardsWithIndex)
    }
  }

  // 无单元归属的选中卡片（新建场景）
  const orphanCardsWithIndex = selectedCards
    .map((c, idx) => ({ card: c, globalIndex: idx }))
    .filter(item => (!item.card.unitId || !unitToCardsMap.has(item.card.unitId)) && !skippedCardIds.has(item.card.id))
  if (orphanCardsWithIndex.length > 0) {
    unitToCardsMap.set('__orphan__', orphanCardsWithIndex)
  }

  // 漏传检测：确认所有选中卡片都已进入 unitToCardsMap
  const allMappedCardIds = new Set()
  for (const cardsWithIndex of unitToCardsMap.values()) {
    cardsWithIndex.forEach(item => allMappedCardIds.add(item.card.id))
  }
  for (const skipped of skippedUnitResults) {
    skipped.cards.forEach(c => allMappedCardIds.add(c.id))
  }
  const missingCards = selectedCards.filter(c => !allMappedCardIds.has(c.id))
  if (missingCards.length > 0) {
    console.warn(`[reorganizePart1][漏传检测] 发现 ${missingCards.length} 张卡片未被加入批次，将强制归入 __orphan__`)
    const existingOrphan = unitToCardsMap.get('__orphan__') || []
    missingCards.forEach((c, idx) => {
      const globalIndex = selectedCards.findIndex(sc => sc === c)
      if (globalIndex >= 0) existingOrphan.push({ card: c, globalIndex })
    })
    unitToCardsMap.set('__orphan__', existingOrphan)
  }

  // 构建本类别所有单元名列表（供AI参考整体结构）
  const allCategoryUnitNames = (existingUnits || [])
    .filter(u => u?.id && u?.name)
    .map(u => u.name)

  // 步骤2：构建批次（每批 ≤30 张卡片，卡片少时合并多单元）
  const batches = []
  let currentBatch = { items: [], sourceUnits: [] }  // items: [{card, globalIndex}]

  for (const [unitId, cardsWithIndex] of unitToCardsMap) {
    const unitInfo = unitId === '__orphan__'
      ? { id: null, name: '未归类卡片' }
      : existingUnits.find(u => u.id === unitId)

    if (cardsWithIndex.length > BATCH_SIZE) {
      // 单元卡片数 >30，按30张切片
      if (currentBatch.items.length > 0) {
        batches.push(currentBatch)
        currentBatch = { items: [], sourceUnits: [] }
      }
      for (let i = 0; i < cardsWithIndex.length; i += BATCH_SIZE) {
        const slice = cardsWithIndex.slice(i, i + BATCH_SIZE)
        batches.push({
          items: slice,
          sourceUnits: [{ id: unitId, name: unitInfo?.name || '未归类', cardCount: slice.length }]
        })
      }
    } else if (currentBatch.items.length + cardsWithIndex.length <= BATCH_SIZE) {
      // 当前批还能装下
      currentBatch.items.push(...cardsWithIndex)
      currentBatch.sourceUnits.push({ id: unitId, name: unitInfo?.name || '未归类', cardCount: cardsWithIndex.length })
    } else {
      // 当前批装不下，先提交再开新批
      if (currentBatch.items.length > 0) batches.push(currentBatch)
      currentBatch = { items: [...cardsWithIndex], sourceUnits: [{ id: unitId, name: unitInfo?.name || '未归类', cardCount: cardsWithIndex.length }] }
    }
  }
  if (currentBatch.items.length > 0) batches.push(currentBatch)

  // 漏传检测：确认所有批次卡片总数与 selectedCards 一致
  const totalBatchCards = batches.reduce((sum, b) => sum + b.items.length, 0) + skippedUnitResults.reduce((sum, u) => sum + u.cards.length, 0)
  if (totalBatchCards !== selectedCards.length) {
    console.warn(`[reorganizePart1][漏传检测] 警告：批次卡片总数 ${totalBatchCards} ≠ selectedCards ${selectedCards.length}`)
  }

  // 步骤3：逐批调用AI判断是否新建单元
  const allUnits = []
  const processedGlobalIndices = new Set()  // Bug 2 修复：跟踪 selectedCards 真实索引

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const batchCards = batch.items.map(item => item.card)
    // Bug 2 修复：批次内索引 → selectedCards 真实索引的映射表
    const batchIndexToGlobal = batch.items.map(item => item.globalIndex)

    if (onBatchProgress) onBatchProgress(batchIdx, batches.length)

    const cardLines = batchCards.map((c, i) => {
      const kp = String(c.knowledge_point || c.front || '').slice(0, 100)
      return `卡片${i}: ${kp}`
    }).join('\n')

    // 本批次来源单元信息
    const sourceUnitInfo = batch.sourceUnits.map((u, i) => `原单元${i}: ${u.name}（${u.cardCount}张）`).join('\n')
    // 本类别所有单元名（供AI参考整体结构，判断是否复用已有单元名）
    const allUnitNamesInfo = allCategoryUnitNames.length > 0
      ? allCategoryUnitNames.map((n, i) => `${i + 1}. ${n}`).join('\n')
      : '（无已有单元）'
    const purposeContext = categoryPurpose ? `\n【学习目的】${categoryPurpose}\n` : '\n'

    const prompt = `你是知识体系整理助手。请分析以下卡片，判断是否需要新建单元。${purposeContext}

【硬约束】（必须严格遵守）：
1. 每张卡片必须且只能归属一个单元，一个知识点只能归类一次，严禁重复归类
2. cardIndices 是卡片在输入列表中的下标（0-${batchCards.length - 1}）
3. 同一主题的卡片必须归入同一个单元
4. 单元名称简洁明确，能准确概括知识点主题
5. 概述必须包含学科和章节信息
6. 若原单元名合适则isNew=false，否则新建单元isNew=true
7. 必须按知识点主题细分单元，不得将所有卡片归入同一个单元

【当前批次来源】：
${sourceUnitInfo}

【本类别所有已有单元名】：
${allUnitNamesInfo}

【待处理卡片】（共 ${batchCards.length} 张）：
${cardLines}

【任务】：
1. 分析这些卡片应该归属于什么学科的什么知识点
2. 按知识点主题将卡片细分为多个单元（如：计算机历史、网络基础、硬件组成、存储系统等不同主题必须拆分为不同单元）
3. 判断是否需要新建单元（当原单元名无法准确描述某组卡片的共同主题时必须新建）
4. 为每个单元生成概述（说明与什么学科有关，与学科内什么章节有关）

【细分原则】：
1. 不同学科领域的卡片必须归入不同单元（如"网络协议"与"计算机硬件"不能混在一起）
2. 同一学科内不同章节的卡片应归入不同单元（如"计算机历史"与"存储系统"应分开）
3. 只有主题高度一致的卡片才归入同一单元
4. 当批次内卡片数≥10张时，通常应拆分为2个以上单元

【输出格式】请严格使用"分组线性表"格式返回，每行一个单元，不要JSON、不要代码块、不要额外文字。
格式: 单元名|概述|cardIndices|isNew
示例：
计算机发展与分类|学科：计算机基础；章节：计算机概述|0,1,2,3,4,5,6,7|false
数据存储单位|学科：计算机基础；章节：数据表示与存储单位|8,9,10|false
新单元名|学科：xxx；章节：xxx|11,12|true

注意：
- cardIndices用英文逗号分隔
- isNew为true或false
- 概述中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

    let parsed = null
    try {
      const result = await callAiProvider(prompt, {
        ...config,
        temperature: 0.3,
        maxTokens: Math.max(4096, Math.ceil(batchCards.length * 200)),
      })

      let cleaned = String(result.content || '').trim()
      // [优化] 线性表格式优先解析，JSON兜底
      parsed = parseLinearReorganizePart1Result(cleaned)
      if (!parsed) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
        try {
          parsed = JSON.parse(cleaned)
        } catch {
          const s = cleaned.indexOf('{')
          const en = cleaned.lastIndexOf('}')
          if (s >= 0 && en > s) {
            try { parsed = JSON.parse(cleaned.substring(s, en + 1)) } catch { parsed = null }
          }
        }
      }
    } catch (err) {
      console.warn(`[reorganizePart1] 批次 ${batchIdx + 1} AI调用失败: ${err.message}`)
    }

    if (!parsed || !Array.isArray(parsed.units) || parsed.units.length === 0) {
      // AI失败，降级：保留原单元结构，但基于卡片内容生成有意义的概述
      console.warn(`[reorganizePart1] 批次 ${batchIdx + 1} 解析失败，降级到原单元`)
      for (const srcUnit of batch.sourceUnits) {
        const unitItems = srcUnit.id === '__orphan__'
          ? batch.items
          : batch.items.filter(item => item.card.unitId === srcUnit.id)
        if (unitItems.length > 0) {
          const fallbackOverview = buildFallbackOverview(unitItems.map(item => item.card), categoryPurpose)
          allUnits.push({
            name: srcUnit.name,
            overview: fallbackOverview,
            cards: unitItems.map(item => item.card),
            sourceUnitId: srcUnit.id === '__orphan__' ? null : srcUnit.id,
          })
          unitItems.forEach(item => processedGlobalIndices.add(item.globalIndex))
        }
      }
      continue
    }

    // 处理AI返回的单元
    const batchUsedIndices = new Set()  // Bug 4 修复：跟踪批次内已使用索引
    // 修复重复cardIndices：按cardIndices长度升序排序，小单元（更具体）优先获得卡片
    const sortedUnits = [...parsed.units].sort((a, b) => {
      const lenA = Array.isArray(a.cardIndices) ? a.cardIndices.length : 0
      const lenB = Array.isArray(b.cardIndices) ? b.cardIndices.length : 0
      return lenA - lenB  // 小的先处理
    })
    for (const u of sortedUnits) {
      const name = String(u.name || '').trim() || '新单元'
      const overview = String(u.overview || '').trim()
      const cardIndices = Array.isArray(u.cardIndices) ? u.cardIndices : []
      const isNew = !!u.isNew

      // Bug 2 修复：批次内索引 → selectedCards 真实索引
      const globalIndices = cardIndices
        .map(i => {
          const idx = Number(i)
          if (idx >= 0 && idx < batchCards.length && !batchUsedIndices.has(idx)) {
            batchUsedIndices.add(idx)
            return batchIndexToGlobal[idx]
          }
          return null
        })
        .filter(i => i !== null)

      if (globalIndices.length > 0) {
        const unitCards = globalIndices.map(idx => selectedCards[idx]).filter(Boolean)

        // 修复sourceUnitId：根据AI指定的单元名匹配已有单元（而非取卡片unitId众数）
        // 旧逻辑（Bug 5修复）取卡片unitId众数，导致AI把A单元卡片分配到B单元时sourceUnitId仍是A，造成多单元共用同一id
        let sourceUnitId = null
        if (!isNew) {
          // 优先在批次来源单元中匹配名称（卡片确实来自该单元）
          const batchSourceMatch = batch.sourceUnits.find(su => {
            if (!su.id || su.id === '__orphan__') return false
            const srcUnit = existingUnits?.find(u => u.id === su.id)
            return srcUnit && srcUnit.name === name
          })
          if (batchSourceMatch) {
            sourceUnitId = batchSourceMatch.id
          } else {
            // 其次在所有已有单元中按名称匹配
            const existingMatch = existingUnits?.find(u => u.name === name)
            if (existingMatch) {
              sourceUnitId = existingMatch.id
            }
            // 若无匹配的已有单元，sourceUnitId 保持 null（将创建新单元）
          }
        }

        allUnits.push({
          name,
          overview,
          cards: unitCards,
          sourceUnitId,
        })
        globalIndices.forEach(idx => processedGlobalIndices.add(idx))
      }
    }

    // Bug 4 修复：AI未覆盖的卡片归入默认单元
    for (let i = 0; i < batch.items.length; i++) {
      if (!batchUsedIndices.has(i)) {
        const globalIdx = batchIndexToGlobal[i]
        if (!processedGlobalIndices.has(globalIdx)) {
          let defaultUnit = allUnits.find(u => u.name === '未分类知识点')
          if (!defaultUnit) {
            const uncoveredCards = [batch.items[i].card]
            defaultUnit = {
              name: '未分类知识点',
              overview: buildFallbackOverview(uncoveredCards, categoryPurpose),
              cards: [],
              sourceUnitId: null,
            }
            allUnits.push(defaultUnit)
          }
          defaultUnit.cards.push(batch.items[i].card)
          processedGlobalIndices.add(globalIdx)
        }
      }
    }
  }

  // 合并被跳过的单元
  const result = [...skippedUnitResults, ...allUnits]

  return result
}

/**
 * 智能单元整理 - 第二部分：AI判断单元合并
 * @param {Array<{name, overview, cards, sourceUnitId?}>} units
 * @returns {Promise<Array<{name, overview, cards}>>}
 */
async function reorganizePart2_UnitMerge(units, config, categoryPurpose) {
  if (units.length <= 1) {
    return units
  }

  // 构建单元列表（只传name和overview，降低token）
  const unitListStr = units.map((u, i) => `单元${i}: ${u.name}\n概述: ${u.overview || '无概述'}`).join('\n\n')

  const purposeContext = categoryPurpose ? `\n【学习目的】${categoryPurpose}\n` : '\n'

  const prompt = `你是知识体系整理助手。请分析以下单元，判断哪些单元可以合并。${purposeContext}

【硬约束】（必须严格遵守）：
1. mergeGroups: 需要合并的单元组，sourceUnitIndices是单元在输入列表中的下标
2. unchangedUnitIndices: 不需要合并的单元下标
3. 每个单元只能出现在一个分组中（要么被合并，要么保持不变），一个单元只能归类一次，严禁重复归类
4. 所有单元必须被覆盖，不能遗漏
5. 合并后单元名应准确概括被合并单元的主题
6. 支持多单元合并（sourceUnitIndices可包含2个以上单元下标）
7. 合并后的概述必须是重新概括的简洁描述，严禁简单拼接原概述

【单元列表】（共 ${units.length} 个）：
${unitListStr}

【任务】：
1. 分析单元之间的是否同属一个单元如（力 弹力 ；线性表；图）
2. 判断哪些单元可以合并（内容关联度极高、概述可以进行合并成一个新单元时）
3. 为合并后的单元生成新名称和概述（概述应重新概括，不要简单拼接原概述）

【合并原则】：
1. 只有概述可以合并成一个单元时才合并。如（"图的定义和术语"，"图的存储结构"和"最短路径"可以合并为"图"单元）
2. 概述不能合并为一个单元时不合并如（"图的遍历"和"边界标识法"）
3. 合并后单元名应概括所有被合并单元的主题
4. 不需要合并的单元保持不变

【概述生成原则】：
1. 合并后的概述必须重新概括所有被合并单元的核心内容
2. 格式：学科：xxx；章节：xxx（概括性描述）
3. 严禁简单拼接或堆砌原概述内容
4. 示例：合并"图的定义"和"图的存储"→概述应为"学科：计算机科学；章节：图（介绍图的基本概念与存储结构）"

【输出格式】请严格使用"分组线性表"格式返回，每行一条，不要JSON、不要代码块、不要额外文字。
格式（合并组）: M|sourceUnitIndices|newUnitName|newOverview
格式（不变单元）: U|unchangedUnitIndex
示例：
M|1,4|计算机发展与核心特性|学科：计算机基础；章节：计算机概述
M|2,3,8|数据表示与编码|学科：计算机基础；章节：数据表示与编码
U|5
U|6

注意：
- M=合并组，U=不变单元
- sourceUnitIndices用英文逗号分隔
- 概述中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

  let parsed = null
  try {
    const result = await callAiProvider(prompt, {
      ...config,
      temperature: 0.3,
      maxTokens: Math.max(4096, units.length * 300),
    })

    let cleaned = String(result.content || '').trim()
    // [优化] 线性表格式优先解析，JSON兜底
    parsed = parseLinearReorganizePart2Result(cleaned)
    if (!parsed) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      // 修复AI返回未加引号的UUID
      cleaned = cleaned.replace(/("(?:existingChapterId|chapterId|unitId|id)"\s*:\s*)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g, '$1"$2"')
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        const s = cleaned.indexOf('{')
        const en = cleaned.lastIndexOf('}')
        if (s >= 0 && en > s) {
          try { parsed = JSON.parse(cleaned.substring(s, en + 1)) } catch { parsed = null }
        }
      }
    }
  } catch (err) {
    console.warn(`[reorganizePart2] AI调用失败: ${err.message}`)
  }

  if (!parsed || !Array.isArray(parsed.mergeGroups) || !Array.isArray(parsed.unchangedUnitIndices)) {
    console.warn('[reorganizePart2] AI解析失败，保持原单元不变')
    return units
  }

  // 执行合并
  const mergedUnits = []
  const processedIndices = new Set()

  // 处理合并组
  for (const group of parsed.mergeGroups) {
    const sourceIndices = Array.isArray(group.sourceUnitIndices) ? group.sourceUnitIndices : []
    const newName = String(group.newUnitName || '').trim() || '合并单元'
    const newOverview = String(group.newOverview || '').trim()

    if (sourceIndices.length === 0) continue
    if (sourceIndices.length === 1) {
      // 单个单元不需要合并，直接保留
      const idx = Number(sourceIndices[0])
      if (idx >= 0 && idx < units.length && !processedIndices.has(idx)) {
        mergedUnits.push({
          name: units[idx].name,
          overview: units[idx].overview,
          cards: [...(units[idx].cards || [])],
          sourceUnitId: units[idx].sourceUnitId || null,  // Bug 6 修复
        })
        processedIndices.add(idx)
      }
      continue
    }

    // 合并多个单元
    const mergedCards = []
    let mergedSourceUnitId = null  // Bug 6 修复：保留第一个被合并单元的 sourceUnitId
    for (const idx of sourceIndices) {
      const i = Number(idx)
      if (i >= 0 && i < units.length && !processedIndices.has(i)) {
        mergedCards.push(...(units[i].cards || []))
        if (mergedSourceUnitId === null && units[i].sourceUnitId) {
          mergedSourceUnitId = units[i].sourceUnitId
        }
        processedIndices.add(i)
      }
    }
    if (mergedCards.length > 0) {
      mergedUnits.push({
        name: newName,
        overview: newOverview,
        cards: mergedCards,
        sourceUnitId: mergedSourceUnitId,  // Bug 6 修复
      })
    }
  }

  // 处理未合并的单元
  for (const idx of parsed.unchangedUnitIndices) {
    const i = Number(idx)
    if (i >= 0 && i < units.length && !processedIndices.has(i)) {
      mergedUnits.push({
        name: units[i].name,
        overview: units[i].overview,
        cards: [...(units[i].cards || [])],
        sourceUnitId: units[i].sourceUnitId || null,  // Bug 6 修复
      })
      processedIndices.add(i)
    }
  }

  // 补充遗漏的单元
  for (let i = 0; i < units.length; i++) {
    if (!processedIndices.has(i)) {
      mergedUnits.push({
        name: units[i].name,
        overview: units[i].overview,
        cards: [...(units[i].cards || [])],
        sourceUnitId: units[i].sourceUnitId || null,  // Bug 6 修复
      })
      console.warn(`[reorganizePart2] 单元 ${i} "${units[i].name}" 未被AI覆盖，保留原状`)
    }
  }

  // 去重保护：若多个单元共用同一 sourceUnitId，仅保留第一个，其余置 null（将创建新单元）
  const seenSourceUnitIds = new Set()
  for (const u of mergedUnits) {
    if (u.sourceUnitId) {
      if (seenSourceUnitIds.has(u.sourceUnitId)) {
        console.warn(`[reorganizePart2] 检测到重复 sourceUnitId "${u.sourceUnitId}"（单元"${u.name}"），置为 null 将创建新单元`)
        u.sourceUnitId = null
      } else {
        seenSourceUnitIds.add(u.sourceUnitId)
      }
    }
  }

  return mergedUnits
}

/**
 * 智能单元整理 - 第三部分：单元归类到章节
 * @param {Array<{name, overview, cards}>} units
 * @param {Array} existingChapters
 * @returns {Promise<Array<{name, chapterId?, units: [{name, unitId?, cards}] }>>}
 */
async function reorganizePart3_UnitToChapter(units, existingChapters, config, categoryPurpose, classificationDepth) {
  if (units.length === 0) {
    return []
  }

  // 构建已有章节名列表
  const existingChapterNames = (existingChapters || [])
    .filter(ch => ch?.id && ch?.name)
    .map((ch, i) => `章节${i}: ${ch.name}（chapterId: ${ch.id}）`)
  const existingChaptersStr = existingChapterNames.length > 0
    ? existingChapterNames.join('\n')
    : '（无已有章节）'

  // 构建单元列表（当概述为"未知/待补充"时，补充卡片内容帮助AI分类）
  const unitListStr = units.map((u, i) => {
    const overview = u.overview || '无概述'
    const isOverviewVague = overview.includes('未知') || overview.includes('待补充') || overview === '无概述'
    // 概述不明确时，补充前3张卡片的关键内容
    if (isOverviewVague && Array.isArray(u.cards) && u.cards.length > 0) {
      const cardSamples = u.cards.slice(0, 3).map(c => {
        const text = String(c.knowledge_point || c.front || '').slice(0, 50)
        return text
      }).filter(Boolean).join('；')
      return `单元${i}: ${u.name}\n概述: ${overview}\n卡片示例: ${cardSamples}`
    }
    return `单元${i}: ${u.name}\n概述: ${overview}`
  }).join('\n\n')

  const purposeContext = categoryPurpose ? `\n【学习目的】${categoryPurpose}\n` : '\n'

  const prompt = `你是知识体系整理助手。请将以下单元归类到合适的章节中。${purposeContext}

【硬约束】（必须严格遵守）：
1. 每个单元必须且只能归入一个章节，一个单元只能归类一次，严禁重复归类
2. unitIndices 是单元在输入列表中的下标（0-${units.length - 1}）
3. 使用已有章节时 isNew=false 并填写 existingChapterId
4. 新建章节时 isNew=true 且 existingChapterId=null
5. 所有单元必须被覆盖，不能遗漏
6. 章节数量控制在 2-5 个
7. 必须优先使用已有章节，只有当单元主题与所有已有章节都不相关时才新建章节

【已有章节】：
${existingChaptersStr}

【待归类单元】（共 ${units.length} 个）：
${unitListStr}

【任务】：
1. 分析每个单元的概述和主题
2. 将单元归类到最合适的章节
3. 优先使用已有章节（如已有"计算机硬件基础"章节，硬件相关单元应归入该章节，而非新建）

【归类原则】：
1. 主题相关的单元必须归入同一章节
2. 主题不同的单元应归入不同章节
3. 章节名应概括该章节下所有单元的共同主题
4. 章节名≤12字
5. 已有章节名能概括单元主题时，必须使用已有章节（isNew=false），不得新建同名章节

【输出格式】请严格使用"分组线性表"格式返回，每行一个章节，不要JSON、不要代码块、不要额外文字。
格式: chapterName|isNew|existingChapterId|unitIndices
示例：
计算机基础概述|false|386d55f7-a5f4-4bbd-a168-3c769f2e5b7d|0
数据表示与编码|false|921ffc8d-f74b-46ba-9db4-ba6f9db07217|1
新章节名|true|null|2,3

注意：
- isNew为true或false
- 使用已有章节时填existingChapterId，新建章节填null
- unitIndices用英文逗号分隔
- 章节名中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

  let parsed = null
  try {
    const result = await callAiProvider(prompt, {
      ...config,
      temperature: 0.3,
      maxTokens: Math.max(4096, units.length * 300),
    })

    let cleaned = String(result.content || '').trim()
    // [优化] 线性表格式优先解析，JSON兜底
    parsed = parseLinearReorganizePart3Result(cleaned)
    if (!parsed) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      // 修复AI返回未加引号的UUID
      cleaned = cleaned.replace(/("(?:existingChapterId|chapterId|unitId|id)"\s*:\s*)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g, '$1"$2"')
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        const s = cleaned.indexOf('{')
        const en = cleaned.lastIndexOf('}')
        if (s >= 0 && en > s) {
          try { parsed = JSON.parse(cleaned.substring(s, en + 1)) } catch { parsed = null }
        }
      }
    }
  } catch (err) {
    console.warn(`[reorganizePart3] AI调用失败: ${err.message}`)
  }

  if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
    console.warn('[reorganizePart3] AI解析失败，降级到单章节')
    return [{
      name: '全部单元',
      chapterId: null,
      units: units.map(u => ({
        name: u.name,
        unitId: u.sourceUnitId || null,
        cards: u.cards || [],
      })),
    }]
  }

  // 构建章节结果
  const chapters = []
  const processedUnitIndices = new Set()

  for (const ch of parsed.chapters) {
    const chName = String(ch.name || '').trim().slice(0, 12) || '新章节'
    const isNew = !!ch.isNew
    const existingChapterId = isNew ? null : (ch.existingChapterId || null)
    const unitIndices = Array.isArray(ch.unitIndices) ? ch.unitIndices : []

    const chapterUnits = []
    for (const idx of unitIndices) {
      const i = Number(idx)
      if (i >= 0 && i < units.length && !processedUnitIndices.has(i)) {
        chapterUnits.push({
          name: units[i].name,
          unitId: units[i].sourceUnitId || null,
          cards: units[i].cards || [],
        })
        processedUnitIndices.add(i)
      }
    }

    if (chapterUnits.length > 0) {
      // 查找已有章节ID
      let chapterId = existingChapterId
      if (!isNew && !chapterId) {
        // 按名称匹配已有章节
        const matched = (existingChapters || []).find(ec => ec?.name === chName)
        if (matched) chapterId = matched.id
      }

      chapters.push({
        name: chName,
        chapterId,
        units: chapterUnits,
      })
    }
  }

  // 补充遗漏的单元
  for (let i = 0; i < units.length; i++) {
    if (!processedUnitIndices.has(i)) {
      console.warn(`[reorganizePart3] 单元 ${i} "${units[i].name}" 未被AI覆盖，尝试按名称匹配已有章节`)
      const unitName = units[i].name
      // 优先按单元名匹配同名已有章节
      const matchedChapter = (existingChapters || []).find(ec => ec?.name === unitName)
      if (matchedChapter) {
        // 检查是否已有同章节的结果
        let targetCh = chapters.find(ch => ch.chapterId === matchedChapter.id)
        if (!targetCh) {
          targetCh = {
            name: matchedChapter.name,
            chapterId: matchedChapter.id,
            units: [],
          }
          chapters.push(targetCh)
        }
        targetCh.units.push({
          name: units[i].name,
          unitId: units[i].sourceUnitId || null,
          cards: units[i].cards || [],
        })
      } else if (chapters.length > 0) {
        // 无匹配章节，归入最后一个章节
        chapters[chapters.length - 1].units.push({
          name: units[i].name,
          unitId: units[i].sourceUnitId || null,
          cards: units[i].cards || [],
        })
      } else {
        chapters.push({
          name: '未归类',
          chapterId: null,
          units: [{
            name: units[i].name,
            unitId: units[i].sourceUnitId || null,
            cards: units[i].cards || [],
          }],
        })
      }
      processedUnitIndices.add(i)
    }
  }

  return chapters
}

function parseSameCategoryResult(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  const tryParse = (value) => {
    try { return JSON.parse(value) } catch (_) { return null }
  }
  let parsed = tryParse(text)
  if (parsed) return parsed
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    parsed = tryParse(codeBlock[1].trim())
    if (parsed) return parsed
  }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const slice = text.slice(first, last + 1)
    parsed = tryParse(slice)
    if (parsed) return parsed
    // [fix-P2-7] 补充 fixIncompleteJson 修复，提升弱模型解析成功率
    try {
      const fixed = fixIncompleteJson(slice)
      if (fixed) {
        parsed = tryParse(fixed)
        if (parsed) return parsed
      }
    } catch (_) { /* 忽略修复失败 */ }
  }
  return null
}

function buildSameCategoryFallback(existingUnits, selectedCards, classificationDepth, existingChapters) {
  const unitsById = new Map((existingUnits || []).filter(u => u?.id).map(u => [u.id, u]))

  // 章节级 fallback
  if ((classificationDepth === 'chapter-only' || classificationDepth === 'chapter-and-unit') && existingChapters && existingChapters.length > 0) {
    const chapters = []
    const used = new Set()
    for (const chapter of existingChapters) {
      const chCards = []
      for (const card of selectedCards || []) {
        if (used.has(card)) continue
        const text = `${card.front || ''} ${card.back || ''} ${card.knowledge_point || ''}`.toLowerCase()
        const chName = String(chapter?.name || '').trim().toLowerCase()
        if (chName.length >= 2 && text.includes(chName)) {
          chCards.push(card)
          used.add(card)
        }
      }
      if (chCards.length > 0) {
        const chUnits = (existingUnits || []).filter(u => u.chapterId === chapter.id)
        const units = []
        const chUsed = new Set()
        if (classificationDepth === 'chapter-and-unit') {
          for (const unit of chUnits) {
            const uCards = []
            for (const card of chCards) {
              if (chUsed.has(card)) continue
              const text = `${card.front || ''} ${card.back || ''} ${card.knowledge_point || ''}`.toLowerCase()
              const uName = String(unit?.name || '').trim().toLowerCase()
              if (uName.length >= 2 && text.includes(uName)) {
                uCards.push(card)
                chUsed.add(card)
              }
            }
            if (uCards.length > 0) {
              units.push({ unitId: unit.id, name: unit.name, cards: uCards })
            }
          }
          // 剩余卡片归入"其他"
          const remaining = chCards.filter(c => !chUsed.has(c))
          if (remaining.length > 0) {
            units.push({ unitId: null, name: '其他', cards: remaining })
          }
        }
        chapters.push({
          chapterId: chapter.id,
          name: chapter.name,
          ...(classificationDepth === 'chapter-and-unit' ? { units } : { cards: chCards }),
        })
      }
    }
    // 未匹配的卡片
    const unmatched = (selectedCards || []).filter(c => !used.has(c))
    if (unmatched.length > 0) {
      if (classificationDepth === 'chapter-only') {
        chapters.push({ chapterId: null, name: '未归类', cards: unmatched })
      } else {
        chapters.push({
          chapterId: null,
          name: '未归类',
          units: [{ unitId: null, name: '其他', cards: unmatched }],
        })
      }
    }
    return {
      mode: 'same-category-reorganize',
      usedFallback: true,
      chapters,
    }
  }

  // 无章节时，按知识点关键词分组，为 chapter-and-unit / chapter-only 创建章节结构
  if ((classificationDepth === 'chapter-and-unit' || classificationDepth === 'chapter-only') && (!existingChapters || existingChapters.length === 0)) {
    const selectedCardsArr = selectedCards || []
    const groups = {}
    const used = new Set()
    
    // 按卡片前20字关键词分组
    for (const card of selectedCardsArr) {
      if (used.has(card)) continue
      const key = (card.front || '').slice(0, 20).replace(/[，,。.；;：:！!？?、\s]/g, '')
      if (!groups[key]) groups[key] = []
      groups[key].push(card)
      used.add(card)
    }
    
    const groupEntries = Object.entries(groups)
    if (groupEntries.length === 0) {
      return { mode: 'same-category-reorganize', usedFallback: true, chapters: [] }
    }
    
    if (classificationDepth === 'chapter-and-unit') {
      const chapters = groupEntries.map(([key, cards], idx) => ({
        chapterId: null,
        name: (cards[0]?.front || '新章节').slice(0, 12) || `新章节${idx + 1}`,
        units: [{
          unitId: null,
          name: (cards[0]?.front || '新单元').slice(0, 16) || `新单元${idx + 1}`,
          cards,
        }],
      }))
      return { mode: 'same-category-reorganize', usedFallback: true, chapters }
    }
    
    // chapter-only
    const chapters = groupEntries.map(([key, cards], idx) => ({
      chapterId: null,
      name: (cards[0]?.front || '新章节').slice(0, 12) || `新章节${idx + 1}`,
      cards,
    }))
    return { mode: 'same-category-reorganize', usedFallback: true, chapters }
  }

  const findBestUnit = (card) => {
    const text = `${card.front || ''} ${card.back || ''} ${card.knowledge_point || ''}`.toLowerCase()
    for (const unit of existingUnits || []) {
      const name = String(unit?.name || '').trim()
      if (name.length >= 2 && text.includes(name.toLowerCase())) return unit
    }
    const compactText = text.replace(/\s+/g, '')
    let best = null
    let bestScore = 0
    for (const unit of existingUnits || []) {
      const name = String(unit?.name || '').trim().toLowerCase()
      if (!name) continue
      const chars = Array.from(new Set(name.replace(/\s+/g, '').split('')))
      const hit = chars.filter(ch => compactText.includes(ch)).length
      const score = chars.length ? hit / chars.length : 0
      if (score > bestScore) {
        bestScore = score
        best = unit
      }
    }
    if (best && bestScore >= 0.55) return best
    if (card.unitId && unitsById.has(card.unitId)) return unitsById.get(card.unitId)
    return null
  }

  const groups = []
  for (const card of selectedCards || []) {
    const matched = findBestUnit(card)
    const unitId = matched?.id || null
    const name = matched?.name || String(card.knowledge_point || card.front || '新单元').slice(0, 12)
    let group = groups.find(item => item.unitId === unitId && item.name === name)
    if (!group) {
      group = { unitId, name, cards: [] }
      groups.push(group)
    }
    group.cards.push(card)
  }

  return {
    mode: 'same-category-reorganize',
    usedFallback: true,
    units: mergeSameCategoryUnits(groups),
  }
}

function mergeSameCategoryUnits(units) {
  const merged = []
  for (const unit of units || []) {
    const key = unit.unitId || `new:${unit.name}`
    let target = merged.find(item => (item.unitId || `new:${item.name}`) === key)
    if (!target) {
      target = { unitId: unit.unitId || null, name: unit.name || '新单元', cards: [] }
      merged.push(target)
    }
    target.cards.push(...(unit.cards || []))
  }
  return merged
}

/**
 * [已有结构优先复用] 构建完整的已有分类→章节→单元树
 * @param {Array} existingUnits - 已有单元列表
 * @param {Array} existingChapters - 已有章节列表
 * @param {Array} existingCards - 已有卡片列表
 * @param {Array} allCategories - 所有分类列表（包括空分类），确保空分类也出现在结构树中
 * @returns {Object} 结构树 { categories: [{ categoryId, name, cardCount, chapters: [{ chapterId, name, units: [{ unitId, name, cardCount, samples }] }] }] }
 */
function buildExistingStructureTree(existingUnits, existingChapters, existingCards, allCategories = []) {
  // 按 categoryId 分组单元
  const categoryMap = new Map() // categoryId -> { categoryId, name, chapters: Map(chapterId -> { chapterId, name, units: [] }) }

  // [fix-空分类不可见] 先用 allCategories 建立所有分类的骨架（包括空分类）
  for (const cat of allCategories || []) {
    if (cat.id != null && !categoryMap.has(cat.id)) {
      categoryMap.set(cat.id, { categoryId: cat.id, name: cat.name || '未命名分类', chapters: new Map(), cardCount: 0 })
    }
  }

  // 再用 existingChapters 补充章节信息
  for (const ch of existingChapters || []) {
    const catId = ch.categoryId
    if (!catId) continue
    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, { categoryId: catId, name: ch.categoryName || '未命名分类', chapters: new Map(), cardCount: 0 })
    }
    const cat = categoryMap.get(catId)
    if (ch.id && !cat.chapters.has(ch.id)) {
      cat.chapters.set(ch.id, { chapterId: ch.id, name: ch.name || '未命名章节', units: [] })
    }
  }

  // 再用 existingUnits 填充单元（并补全未在 existingChapters 中的分类/章节）
  for (const unit of existingUnits || []) {
    const catId = unit.categoryId
    if (!catId) continue
    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, { categoryId: catId, name: unit.categoryName || '未命名分类', chapters: new Map(), cardCount: 0 })
    }
    const cat = categoryMap.get(catId)
    const chId = unit.chapterId || '_no_chapter_'
    if (!cat.chapters.has(chId)) {
      cat.chapters.set(chId, { chapterId: chId === '_no_chapter_' ? null : chId, name: '未分章', units: [] })
    }
    const ch = cat.chapters.get(chId)
    // 为该单元提取最多2张卡片示例
    const samples = (existingCards || [])
      .filter(card => card.unitId === unit.id)
      .slice(0, 2)
      .map(card => String(card.knowledge_point || card.front || '').slice(0, 60))
      .filter(Boolean)
    const cardCount = (existingCards || []).filter(card => card.unitId === unit.id).length
    ch.units.push({ unitId: unit.id, name: unit.name || '未命名单元', cardCount, samples })
  }

  // 转为数组并统计分类卡片数
  const categories = Array.from(categoryMap.values()).map(cat => {
    const chapters = Array.from(cat.chapters.values())
    const cardCount = chapters.reduce((s, ch) => s + ch.units.reduce((s2, u) => s2 + u.cardCount, 0), 0)
    return { categoryId: cat.categoryId, name: cat.name, cardCount, chapters }
  })

  return { categories }
}

/**
 * [已有结构优先复用] 基于关键词相关性预筛选最相关的 Top-N 个分类
 * @param {Object} structureTree - buildExistingStructureTree 返回的结构树
 * @param {Array} selectedCards - 待归类的卡片
 * @param {number} topN - 最多保留的分类数
 * @returns {Object} 筛选后的结构树
 */
function preFilterCategoriesByRelevance(structureTree, selectedCards, topN) {
  const categories = structureTree.categories || []
  if (categories.length <= topN) {
    return structureTree // 不需要筛选
  }

  // 提取待归类卡片的关键词集合
  const cardKeywords = new Set()
  for (const card of selectedCards || []) {
    const text = String(card.knowledge_point || card.front || '')
    // 简单分词：按标点和空格分割，保留长度>=2的片段
    const tokens = text.split(/[，。、；：？！\s,.;:?!（）()【】[\]{}]+/).filter(t => t.length >= 2)
    for (const t of tokens) cardKeywords.add(t.toLowerCase())
  }

  // 为每个分类计算与卡片的关键词重合度
  const scored = categories.map(cat => {
    const catKeywords = new Set()
    catKeywords.add(cat.name.toLowerCase())
    for (const ch of cat.chapters || []) {
      ch.name && catKeywords.add(ch.name.toLowerCase())
      for (const u of ch.units || []) {
        u.name && catKeywords.add(u.name.toLowerCase())
        for (const s of u.samples || []) {
          const tokens = s.split(/[，。、；：？！\s,.;:?!（）()【】[\]{}]+/).filter(t => t.length >= 2)
          for (const t of tokens) catKeywords.add(t.toLowerCase())
        }
      }
    }
    // 计算 Jaccard 相似度
    let intersection = 0
    for (const kw of cardKeywords) {
      for (const ck of catKeywords) {
        if (ck.includes(kw) || kw.includes(ck)) {
          intersection++
          break
        }
      }
    }
    const score = cardKeywords.size > 0 ? intersection / cardKeywords.size : 0
    return { cat, score }
  })

  // 按分数降序排序，取 Top-N
  // [fix-空分类不可见] 空分类（cardCount === 0）是用户主动创建的，始终保留
  const emptyCategories = scored.filter(s => s.cat.cardCount === 0).map(s => s.cat)
  const nonEmptyScored = scored.filter(s => s.cat.cardCount > 0)
  nonEmptyScored.sort((a, b) => b.score - a.score)
  const keptNonEmpty = nonEmptyScored.slice(0, Math.max(0, topN - emptyCategories.length)).map(s => s.cat)
  const kept = [...emptyCategories, ...keptNonEmpty]

  return { categories: kept }
}

// ============================================================
// 跨分类全权归类 4 段流水线
// Part1: 分批新建单元 → Part2: 分批合并单元 → Part3: 分类归属 → Part4: 分批建章节
// ============================================================

/**
 * 将卡片按知识体系分批（不依赖现有 unitId）
 * 策略: 简单按 CROSS_CATEGORY_BATCH_SIZE 张一组切分，让 AI 自主判断知识点归属
 * 若卡片数量少（<=BATCH_SIZE），可一次处理多个单元
 */
function splitCardsIntoBatches(cards) {
  const batches = []
  for (let i = 0; i < cards.length; i += CROSS_CATEGORY_BATCH_SIZE) {
    batches.push({
      indices: Array.from({ length: Math.min(CROSS_CATEGORY_BATCH_SIZE, cards.length - i) }, (_, j) => i + j),
    })
  }
  return batches
}

/**
 * Part1: 分批新建单元
 * @param {Array} cards - 所有待分类卡片
 * @param {Array} existingUnits - 现有单元列表（仅用于参考，不用于分批）
 * @param {object} config - AI配置
 * @param {object} options - { onProgress, allCategories }
 * @returns {Promise<{ units: Array<{ unitName, overview, cardIndices: number[] }> }>}
 */
async function batchCreateUnits(cards, existingUnits, config, options = {}) {
  const { onProgress, allCategories = [] } = options
  const batches = splitCardsIntoBatches(cards)

  // 构建空分类提示
  const emptyCategories = (allCategories || []).filter(c => c.cardCount === 0 || c.cardCount == null)
  const emptyCatText = emptyCategories.length > 0
    ? `\n【用户已有空分类（后续会自动归入，本步骤无需关注分类）】：\n${emptyCategories.map((c, i) => `${i + 1}. ${c.name}`).join('、')}\n注意：以上是分类名称，不是单元名称。本步骤只需按知识点主题创建单元，分类归属由后续步骤处理。`
    : ''

  const allUnits = []
  // [fix-卡片重复分配] 跨批次去重：跟踪所有已分配的卡片
  const batchAssignedSet = new Set()

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchIndices = batch.indices
    const batchCards = batchIndices.map(idx => cards[idx])

    const cardLines = batchCards.map((c, j) => {
      const kp = String(c.knowledge_point || c.front || '').slice(0, 120)
      return `卡${j}: ${kp}`
    }).join('\n')

    const prompt = `你是考研速记卡片的知识体系架构助手。请分析以下知识点，判断是否需要新建单元或调整现有单元。
${emptyCatText}

【待分析知识点（共 ${batchCards.length} 张）】：
${cardLines}

【任务要求】：
1. 分析这些知识点的语义关联性，按主题细分单元
2. 判断是否需要新建单元：
   - 如果现有单元名称适合这些知识点，保留现有单元名
   - 如果知识点不属于现有单元，新建单元
   - 同一主题的知识点必须归入同一单元
   - 不同主题的知识点必须分入不同单元（如"网络基础"和"数据结构"不能混入同一单元）
   - 单元名应具体反映知识点主题（如"数制与编码"、"网络协议基础"），不得使用笼统名称（如"计算机基础知识"）
   - 若卡片数量少，可一次对多个单元进行处理
3. 为每个单元生成概述，概述内容为：与什么学科有关，与学科内什么章节有关

【关键约束（必须遵守）】：
1. 每张卡片只能归入一个单元，严禁重复分配
2. 所有 cardIndices 合并后必须是 0 到 ${batchCards.length - 1} 的完整不重复集合
3. 不得将所有卡片归入同一个单元，必须按主题细分

【输出格式】请严格使用"分组线性表"格式返回，每行一个单元，不要JSON、不要代码块、不要额外文字。
格式：单元名|概述|卡片索引（逗号分隔）
示例：
数制与编码|与计算机学科有关，与计算机基础知识章节有关|0,1,2
网络协议基础|与计算机网络学科有关，与网络体系结构章节有关|3,4,5

注意：
- 每行一个单元，三字段用 | 分隔
- 卡片索引用英文逗号分隔
- 概述中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

    if (onProgress) {
      onProgress({ step: 1, current: i + 1, total: batches.length, message: `Part1 分批新建单元: ${i + 1}/${batches.length}` })
    }

    const result = await callAiProvider(prompt, { ...config, temperature: 0.3, max_tokens: 8192 })

    logAiCall({
      purpose: 'cross-category-batch-units',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })

    // [优化] 线性表格式优先解析（节省约60%输出token），JSON兜底
    let parsed = parseLinearUnitResult(result.content)
    if (!parsed) {
      parsed = parsePlanStructureResult(result.content)
    }
    if (parsed && Array.isArray(parsed.units)) {
      // [fix-卡片重复分配] 智能去重：优先分配给更具体的单元（卡片数较少的单元）
      // 先收集所有单元的原始分配，再按单元大小排序，小单元优先获得卡片
      const rawUnits = parsed.units.map(u => {
        const unitName = String(u.unitName || '').trim().slice(0, 16)
        const overview = String(u.overview || '').trim()
        const cardIndices = (u.cardIndices || [])
          .filter(idx => idx >= 0 && idx < batchCards.length)
          .map(idx => batchIndices[idx])
        return { unitName, overview, cardIndices }
      }).filter(u => u.unitName && u.cardIndices.length > 0)

      // 按卡片数升序排序（小单元优先），让更具体的单元先获得卡片
      rawUnits.sort((a, b) => a.cardIndices.length - b.cardIndices.length)

      for (const u of rawUnits) {
        const dedupedIndices = u.cardIndices.filter(globalIdx => {
          if (batchAssignedSet.has(globalIdx)) return false
          batchAssignedSet.add(globalIdx)
          return true
        })
        if (dedupedIndices.length > 0) {
          allUnits.push({ unitName: u.unitName, overview: u.overview, cardIndices: dedupedIndices })
        }
      }
    }
  }

  // 兜底：未分配的卡片
  const assignedSet = new Set(allUnits.flatMap(u => u.cardIndices))
  const unassigned = []
  for (let i = 0; i < cards.length; i++) {
    if (!assignedSet.has(i)) unassigned.push(i)
  }
  if (unassigned.length > 0) {
    console.warn(`[batchCreateUnits] ${unassigned.length} 张卡片未分配，归入默认单元`)
    allUnits.push({ unitName: '未分类知识点', overview: '未能通过AI归类的知识点', cardIndices: unassigned })
  }

  return { units: allUnits }
}

/**
 * Part2: 分批合并单元
 * 当单元数量超过 MERGE_BATCH_SIZE 时，分批输入给 AI 进行合并判断
 * 每批处理 MERGE_BATCH_SIZE 个单元，AI 判断批内哪些单元可合并
 */
const MERGE_BATCH_SIZE = 20  // 每批最多处理的单元数

async function batchMergeUnits(unitsFromPart1, config, options = {}) {
  const { onProgress } = options

  if (unitsFromPart1.length <= 1) return { units: unitsFromPart1 }

  // 分批处理：每批 MERGE_BATCH_SIZE 个单元
  const mergeBatches = []
  for (let i = 0; i < unitsFromPart1.length; i += MERGE_BATCH_SIZE) {
    mergeBatches.push(unitsFromPart1.slice(i, i + MERGE_BATCH_SIZE))
  }


  let currentUnits = [...unitsFromPart1]

  for (let bi = 0; bi < mergeBatches.length; bi++) {
    const batch = mergeBatches[bi]
    const batchStart = bi * MERGE_BATCH_SIZE

    const unitLines = batch.map((u, i) => {
      return `单元${i}: ${u.unitName} - ${u.overview}（${u.cardIndices.length}张卡片）`
    }).join('\n')

    const prompt = `你是考研速记卡片的知识体系架构助手。请分析以下单元列表，判断哪些单元可以合并。

【当前批次单元列表（共 ${batch.length} 个）】：
${unitLines}

【合并规则】：
1. 只有语义高度相似的单元才合并（如"排序算法"和"排序"可合并）
2. 合并后需要生成新的单元名和概述
3. 不同学科的单元不得合并
4. 合并后单元名不超过 16 个字
5. 同名但概述不同的单元不一定要合并——需判断概述中的学科和章节是否一致
6. 不得将不同主题的单元强行合并（如"网络基础"和"数据结构"不得合并）

【输出格式】请严格使用"分组线性表"格式返回，每行一个合并组，不要JSON、不要代码块、不要额外文字。
格式：合并后单元名|概述|源单元索引（逗号分隔）
示例：
计算机发展与分类|涵盖计算机发展历程、分类及未来发展趋势|13,14
存储层次结构与存储器分类|涵盖存储体系层次、主存储器、辅助存储器|17,18,19

注意：
- 每行一个合并组，三字段用 | 分隔
- 源单元索引用英文逗号分隔
- 概述中不要使用 | 字符
- 未被任何合并组包含的单元将保持不变
- sourceUnitIndices 是本批次内的索引（从0开始）
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

    if (onProgress) {
      onProgress({ step: 2, current: bi + 1, total: mergeBatches.length, message: `Part2 单元合并: ${bi + 1}/${mergeBatches.length}` })
    }

    const result = await callAiProvider(prompt, { ...config, temperature: 0.3, max_tokens: 4096 })

    logAiCall({
      purpose: 'cross-category-merge-units',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })

    // [优化] 线性表格式优先解析，JSON兜底
    let parsed = parseLinearMergeResult(result.content)
    if (!parsed) {
      parsed = parsePlanStructureResult(result.content)
    }
    const mergedIndices = new Set()

    if (parsed && Array.isArray(parsed.mergeGroups)) {
      const newUnits = []
      for (const group of parsed.mergeGroups) {
        const sourceIndices = (group.sourceUnitIndices || [])
          .filter(idx => idx >= 0 && idx < batch.length)
        if (sourceIndices.length === 0) continue

        const mergedName = String(group.mergedUnitName || '').trim().slice(0, 16)
        const overview = String(group.overview || '').trim()
        const cardIndices = sourceIndices.flatMap(idx => batch[idx].cardIndices)
        sourceIndices.forEach(idx => mergedIndices.add(idx))

        if (mergedName && cardIndices.length > 0) {
          newUnits.push({ unitName: mergedName, overview, cardIndices })
        }
      }

      // 未被合并的单元保持原样
      for (let i = 0; i < batch.length; i++) {
        if (!mergedIndices.has(i)) newUnits.push(batch[i])
      }

      // 替换 currentUnits 中对应的部分
      currentUnits = [
        ...currentUnits.slice(0, batchStart),
        ...newUnits,
        ...currentUnits.slice(batchStart + batch.length),
      ]
    }
  }

  return { units: currentUnits }
}

/**
 * Part3: 分类归属
 */
async function assignUnitsToCategories(units, existingCategoryNames, config, options = {}) {
  const { onProgress } = options

  const unitLines = units.map((u, i) => `单元${i}: ${u.unitName} - ${u.overview}`).join('\n')

  const existingCatText = existingCategoryNames.length > 0
    ? `\n【已有分类名（优先复用）】：\n${existingCategoryNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
    : ''

  const prompt = `你是考研速记卡片的知识体系架构助手。请将以下单元归属到合适的分类中。

【单元列表（共 ${units.length} 个）】：
${unitLines}
${existingCatText}

【分类规则】：
1. 分类名必须是学科名称（如"计算机"、"中药学"、"高等数学"），不得包含"基础"、"概论"等修饰词
2. 优先将单元归入已有分类（名称必须完全一致）
3. 只有当单元明显不属于任何已有分类时，才新建分类
4. 严禁新建与已有分类相似的分类（如已有"计算机"则不得新建"计算机基础"）
5. 同一学科的不同子领域必须归入同一分类

【输出格式】请严格使用"分组线性表"格式返回，每行一个分类，不要JSON、不要代码块、不要额外文字。
格式：分类名|是否新建(new或existing)|单元索引（逗号分隔）
示例：
使用指南|existing|2,3,4,5,6,7,8,9
计算机|existing|0,1,10,11,12,13,14,15,16

注意：
- 每行一个分类，三字段用 | 分隔
- 是否新建：已有分类用 existing，新建分类用 new
- 单元索引用英文逗号分隔
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

  if (onProgress) {
    onProgress({ step: 3, current: 1, total: 1, message: 'Part3 分类归属分析中...' })
  }

  const result = await callAiProvider(prompt, { ...config, temperature: 0.3, max_tokens: 4096 })

  logAiCall({
    purpose: 'cross-category-assign',
    modelName: getModelName(config.aiServiceMode, config.model),
    durationMs: 0,
    status: 'success',
    tokens: result.tokens,
    prompt: prompt,
    response: result.content,
  })

  // [优化] 线性表格式优先解析，JSON兜底
  let parsed = parseLinearCategoryResult(result.content)
  if (!parsed) {
    parsed = parsePlanStructureResult(result.content)
  }
  const categories = []

  if (parsed && Array.isArray(parsed.categories)) {
    for (const cat of parsed.categories) {
      const categoryName = String(cat.categoryName || '').trim().slice(0, 14)
      const unitIndices = (cat.unitIndices || []).filter(idx => idx >= 0 && idx < units.length)
      if (categoryName && unitIndices.length > 0) {
        const unitNames = unitIndices.map(idx => units[idx].unitName)
        const isNew = !existingCategoryNames.includes(categoryName)
        categories.push({ categoryName, isNew, unitNames, unitIndices })
      }
    }
  }

  // 兜底
  const assignedUnitIndices = new Set(categories.flatMap(c => c.unitIndices))
  const unassignedUnits = []
  for (let i = 0; i < units.length; i++) {
    if (!assignedUnitIndices.has(i)) unassignedUnits.push(i)
  }
  if (unassignedUnits.length > 0) {
    categories.push({
      categoryName: '未分类',
      isNew: true,
      unitNames: unassignedUnits.map(i => units[i].unitName),
      unitIndices: unassignedUnits,
    })
  }

  return { categories }
}

/**
 * Part4: 分批建立章节
 */
async function batchCreateChapters(categoryAssignments, units, existingChapters, config, options = {}) {
  const { onProgress, categoryPurposes = {} } = options
  const finalCategories = []

  for (let ci = 0; ci < categoryAssignments.length; ci++) {
    const cat = categoryAssignments[ci]
    const categoryName = cat.categoryName

    const catUnits = cat.unitIndices.map(idx => ({
      unitName: units[idx].unitName,
      overview: units[idx].overview,
      cardIndices: units[idx].cardIndices,
    }))

    const unitLines = catUnits.map((u, i) => `单元${i}: ${u.unitName} - ${u.overview}`).join('\n')

    const localPurpose = categoryPurposes[categoryName]
    const purposeContext = (!localPurpose || localPurpose.trim() === '')
      ? '\n（注：此分类暂无分类目的，请在输出中为此分类生成一个分类目的）'
      : ''

    const prompt = `你是考研速记卡片的知识体系架构助手。请为以下分类的单元创建章节。

【分类名】: ${categoryName}${purposeContext}

【单元列表（共 ${catUnits.length} 个）】：
${unitLines}

【章节创建规则】：
1. 根据单元的概述和语义关联性，将单元归入合适的章节
2. 章节名代表学科下的子领域或知识模块，不超过 12 个字
3. 每个章节可包含 1-12 个单元
4. 语义相关的单元必须归入同一章节
5. 无关联的单元应放入不同章节

【输出格式】请严格使用"分组线性表"格式返回，不要JSON、不要代码块、不要额外文字。
第一行（可选）：PURPOSE|分类目的
后续每行一个章节：章节名|单元索引（逗号分隔）
示例：
PURPOSE|帮助用户快速掌握软件的核心功能与操作流程
基础入门|3
智能录入|1,2
学习与检测|5,7

注意：
- 第一行以 PURPOSE| 开头（如有分类目的），后续每行一个章节
- 章节名和单元索引用 | 分隔
- 单元索引用英文逗号分隔
- 章节名中不要使用 | 字符
- 不要输出 JSON、不要输出代码块、不要输出任何说明文字`

    if (onProgress) {
      onProgress({ step: 4, current: ci + 1, total: categoryAssignments.length, message: `Part4 建立章节: ${ci + 1}/${categoryAssignments.length} (${categoryName})` })
    }

    const result = await callAiProvider(prompt, { ...config, temperature: 0.3, max_tokens: 4096 })

    logAiCall({
      purpose: 'cross-category-create-chapters',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })

    // [优化] 线性表格式优先解析，JSON兜底
    let parsed = parseLinearChapterResult(result.content)
    if (!parsed) {
      parsed = parsePlanStructureResult(result.content)
    }
    const chapters = []

    if (parsed && Array.isArray(parsed.chapters)) {
      for (const ch of parsed.chapters) {
        const chapterName = String(ch.chapterName || '').trim().slice(0, 12)
        const unitIndices = (ch.unitIndices || []).filter(idx => idx >= 0 && idx < catUnits.length)
        if (chapterName && unitIndices.length > 0) {
          chapters.push({ chapterName, unitIndices })
        }
      }
    }

    // 兜底
    const assignedUnitIndices = new Set(chapters.flatMap(ch => ch.unitIndices))
    const unassignedUnits = []
    for (let i = 0; i < catUnits.length; i++) {
      if (!assignedUnitIndices.has(i)) unassignedUnits.push(i)
    }
    if (unassignedUnits.length > 0) {
      chapters.push({ chapterName: '默认章节', unitIndices: unassignedUnits })
    }

    const finalPurpose = (localPurpose && localPurpose.trim())
      ? localPurpose
      : (parsed?.categoryPurpose ? String(parsed.categoryPurpose).trim() : '')

    finalCategories.push({
      categoryName,
      categoryPurpose: finalPurpose,
      chapters,
      _catUnits: catUnits,
    })
  }

  return { categories: finalCategories }
}

async function classifyCrossCategoryAuto(existingUnits, existingCards, selectedCards, config, hasApi, classificationDepth, categoryPurpose, existingChapters = [], allCategories = []) {
  const fallbackResult = () => buildCrossCategoryFallback(selectedCards, classificationDepth)
  if (!hasApi) return fallbackResult()

  if (isWeakModel(config)) {
    throw new Error('弱模型（Spark Lite）不支持跨分类 AI 全权归类。该功能需要较强的语义理解和结构化输出能力，请切换到强模型（DeepSeek/Qwen）后再试。')
  }

  try {
    const onProgress = config?.onProgress || null

    // ===== Part1: 分批新建单元 =====
    const part1Result = await batchCreateUnits(selectedCards, existingUnits || [], config, { onProgress, allCategories })

    // ===== Part2: 分批合并单元 =====
    const part2Result = await batchMergeUnits(part1Result.units, config, { onProgress })

    // ===== Part3: 分类归属 =====
    const existingCategoryNames = (allCategories || []).map(c => c.name)
    const part3Result = await assignUnitsToCategories(part2Result.units, existingCategoryNames, config, { onProgress })

    // ===== unit-only / chapter-only 模式：跳过 Part4 =====
    if (classificationDepth === 'unit-only' || classificationDepth === 'chapter-only') {

      const categoryNameToCategoryId = new Map()
      for (const cat of allCategories || []) {
        if (cat.id != null && cat.name) {
          categoryNameToCategoryId.set(cat.name, cat.id)
        }
      }
      for (const unit of (existingUnits || [])) {
        if (unit.categoryName && unit.categoryId != null) {
          if (!categoryNameToCategoryId.has(unit.categoryName)) {
            categoryNameToCategoryId.set(unit.categoryName, unit.categoryId)
          }
        }
      }

      const categories = []
      for (let i = 0; i < part3Result.categories.length; i++) {
        const cat = part3Result.categories[i]
        const catName = cat.categoryName
        const catCategoryId = categoryNameToCategoryId.get(catName) ?? null

        const unitsWithCards = cat.unitIndices.map(ui => {
          const catUnit = part2Result.units[ui]
          const cards = catUnit.cardIndices.map(idx => selectedCards[idx]).filter(Boolean)
          return { name: catUnit.unitName, cards }
        }).filter(u => u.cards.length > 0)

        if (unitsWithCards.length > 0) {
          let chaptersWithTopic
          if (classificationDepth === 'unit-only') {
            // unit-only 模式：所有单元放入一个默认章节
            chaptersWithTopic = await persistTopicsToChapters(
              [{ name: '默认章节', units: unitsWithCards }], catCategoryId
            )
          } else {
            // chapter-only 模式：每个单元作为一个独立章节
            chaptersWithTopic = await persistTopicsToChapters(
              unitsWithCards.map(u => ({ name: u.name, units: [u] })), catCategoryId
            )
          }
          categories.push({
            tempId: `tmp_cat_${i}`,
            name: catName,
            categoryId: catCategoryId,
            needsTopicPersistence: catCategoryId == null,
            chapters: chaptersWithTopic,
            categoryPurpose: cat.categoryPurpose || '',
          })
        }
      }

      if (categories.length === 0) {
        return fallbackResult()
      }

      return {
        mode: 'cross-category-auto',
        usedFallback: false,
        categories,
      }
    }

    // ===== Part4: 分批建立章节 =====
    const categoryPurposes = {}
    for (const cat of allCategories || []) {
      if (cat.purpose) categoryPurposes[cat.name] = cat.purpose
    }
    const part4Result = await batchCreateChapters(
      part3Result.categories, part2Result.units, existingChapters || [], config,
      { onProgress, categoryPurposes }
    )

    // ===== 将结果映射回兼容格式 =====
    const categoryNameToCategoryId = new Map()
    for (const cat of allCategories || []) {
      if (cat.id != null && cat.name) {
        categoryNameToCategoryId.set(cat.name, cat.id)
      }
    }
    for (const unit of (existingUnits || [])) {
      if (unit.categoryName && unit.categoryId != null) {
        if (!categoryNameToCategoryId.has(unit.categoryName)) {
          categoryNameToCategoryId.set(unit.categoryName, unit.categoryId)
        }
      }
    }

    const categories = []
    for (let i = 0; i < part4Result.categories.length; i++) {
      const cat = part4Result.categories[i]
      const catName = cat.categoryName
      const catCategoryId = categoryNameToCategoryId.get(catName) ?? null

      const chaptersWithCards = cat.chapters.map(ch => {
        const unitsWithCards = ch.unitIndices.map(ui => {
          const catUnit = cat._catUnits[ui]
          const cards = catUnit.cardIndices.map(idx => selectedCards[idx]).filter(Boolean)
          return { name: catUnit.unitName, cards }
        }).filter(u => u.cards.length > 0)
        return { name: ch.chapterName, units: unitsWithCards }
      }).filter(ch => ch.units.length > 0)

      if (chaptersWithCards.length > 0) {
        const chaptersWithTopic = await persistTopicsToChapters(chaptersWithCards, catCategoryId)
        categories.push({
          tempId: `tmp_cat_${i}`,
          name: catName,
          categoryId: catCategoryId,
          needsTopicPersistence: catCategoryId == null,
          chapters: chaptersWithTopic,
          categoryPurpose: cat.categoryPurpose || '',
        })
      }
    }

    if (categories.length === 0) {
      return fallbackResult()
    }

    return {
      mode: 'cross-category-auto',
      usedFallback: false,
      categories,
    }
  } catch (err) {
    const isAiCallError = err?.message && (
      err.message.includes('AI') ||
      err.message.includes('API') ||
      err.message.includes('网络') ||
      err.message.includes('timeout') ||
      err.message.includes('超时') ||
      err.message.includes('fetch')
    )
    if (isAiCallError) {
      console.warn('[aiCallFailed][classifyCrossCategoryAuto] AI 调用失败，降级到 fallback:', err?.message)
    } else {
      console.error('[classifyBug][classifyCrossCategoryAuto] 数据处理异常，降级到 fallback:', err?.message, err?.stack)
    }
    return fallbackResult()
  }
}

/**
 * 将卡片按主题关键词聚类
 * @param {Array} cards - 卡片数组
 * @returns {Array<{cards: Array, topicName: string}>} - 聚类结果
 */
function clusterCardsByTopic(cards) {
  if (!cards || cards.length === 0) return []

  // 使用简单的关键词提取进行聚类
  const clusters = []

  // 提取所有卡片的前两个字符作为关键词
  const keywords = cards.map((card, index) => {
    const text = String(card.knowledge_point || card.front || '').slice(0, 2)
    return { index, keyword: text || '综合', card }
  })

  // 按关键词分组
  const groups = new Map()
  for (const item of keywords) {
    if (!groups.has(item.keyword)) {
      groups.set(item.keyword, [])
    }
    groups.get(item.keyword).push(item)
  }

  // 转换为聚类数组
  for (const [keyword, items] of groups) {
    if (items.length > 0) {
      clusters.push({
        topicName: keyword,
        cards: items.map(i => i.card),
      })
    }
  }

  // 如果聚类结果太少或太多，进行合并或拆分
  if (clusters.length > 10) {
    // 合并太小的聚类
    const merged = []
    for (const cluster of clusters) {
      if (cluster.cards.length < 3) {
        // 找到最近的聚类合并
        let bestTarget = merged[merged.length - 1]
        if (bestTarget) {
          bestTarget.cards.push(...cluster.cards)
        } else {
          merged.push(cluster)
        }
      } else {
        merged.push(cluster)
      }
    }
    return merged
  }

  if (clusters.length < 2 && cards.length > 10) {
    // 如果聚类太少，按卡片数量平均拆分
    const size = Math.ceil(cards.length / 5)
    for (let i = 0; i < cards.length; i += size) {
      const chunk = cards.slice(i, i + size)
      if (chunk.length > 0) {
        clusters.push({
          topicName: chunk[0].knowledge_point?.slice(0, 4) || `分类${clusters.length + 1}`,
          cards: chunk,
        })
      }
    }
  }

  return clusters
}

function parseCrossCategoryResult(raw, selectedCards, classificationDepth) {
  const parsed = parseSameCategoryResult(raw)
  if (!parsed || !Array.isArray(parsed.categories)) return null

  const used = new Set()
  const categories = []

  for (const category of parsed.categories.slice(0, 5)) {
    const name = String(category?.name || '').trim().slice(0, 14)
    if (!name) continue
    const normalizedCategory = {
      tempId: `tmp_cat_${categories.length}`,
      name,
    }

    if (classificationDepth === 'chapter-and-unit') {
      // 章节+单元模式
      normalizedCategory.chapters = []
      for (const chapter of category.chapters || []) {
        const chName = String(chapter?.name || '').trim().slice(0, 12)
        if (!chName) continue
        const normalizedChapter = {
          tempId: `tmp_ch_${categories.length}_${normalizedCategory.chapters.length}`,
          name: chName,
          topicName: chName,
          units: [],
        }
        for (const unit of chapter.units || []) {
          const unitName = String(unit?.name || '').trim().slice(0, 16)
          if (!unitName) continue
          const cards = []
          for (const rawIndex of unit.cardIndices || []) {
            const index = Number(rawIndex)
            if (Number.isInteger(index) && index >= 0 && index < selectedCards.length && !used.has(index)) {
              used.add(index)
              cards.push(selectedCards[index])
            }
          }
          if (cards.length > 0) {
            normalizedChapter.units.push({
              tempId: `tmp_unit_${categories.length}_${normalizedCategory.chapters.length}_${normalizedChapter.units.length}`,
              name: unitName,
              cards,
            })
          }
        }
        if (normalizedChapter.units.length > 0) {
          normalizedCategory.chapters.push(normalizedChapter)
        }
      }
      if (normalizedCategory.chapters.length > 0) categories.push(normalizedCategory)
    } else if (classificationDepth === 'chapter-only') {
      // 仅章节模式
      normalizedCategory.chapters = []
      for (const chapter of category.chapters || []) {
        const chName = String(chapter?.name || '').trim().slice(0, 12)
        if (!chName) continue
        const cards = []
        for (const rawIndex of chapter.cardIndices || []) {
          const index = Number(rawIndex)
          if (Number.isInteger(index) && index >= 0 && index < selectedCards.length && !used.has(index)) {
            used.add(index)
            cards.push(selectedCards[index])
          }
        }
        if (cards.length > 0) {
          normalizedCategory.chapters.push({
            tempId: `tmp_ch_${categories.length}_${normalizedCategory.chapters.length}`,
            name: chName,
            topicName: chName,
            cards,
          })
        }
      }
      if (normalizedCategory.chapters.length > 0) categories.push(normalizedCategory)
    } else {
      // unit-only 模式（原有行为）
      normalizedCategory.units = []
      for (const unit of category.units || []) {
        const unitName = String(unit?.name || '').trim().slice(0, 16)
        if (!unitName) continue
        const cards = []
        for (const rawIndex of unit.cardIndices || []) {
          const index = Number(rawIndex)
          if (Number.isInteger(index) && index >= 0 && index < selectedCards.length && !used.has(index)) {
            used.add(index)
            cards.push(selectedCards[index])
          }
        }
        if (cards.length > 0) {
          normalizedCategory.units.push({
            tempId: `tmp_unit_${categories.length}_${normalizedCategory.units.length}`,
            name: unitName,
            cards,
          })
        }
      }
      if (normalizedCategory.units.length > 0) categories.push(normalizedCategory)
    }
  }

  const missingCards = selectedCards.filter((_, index) => !used.has(index))
  if (missingCards.length > 0) {
    if (categories.length === 0) {
      if (classificationDepth === 'chapter-and-unit') {
        categories.push({ tempId: 'tmp_cat_0', name: 'AI归类卡片', chapters: [{ tempId: 'tmp_ch_0', name: '默认章节', units: [] }] })
      } else if (classificationDepth === 'chapter-only') {
        categories.push({ tempId: 'tmp_cat_0', name: 'AI归类卡片', chapters: [] })
      } else {
        categories.push({ tempId: 'tmp_cat_0', name: 'AI归类卡片', units: [] })
      }
    }
    if (classificationDepth === 'chapter-and-unit') {
      if (categories[0].chapters && categories[0].chapters.length > 0) {
        categories[0].chapters[0].units.push({
          tempId: `tmp_unit_${categories.length}_missing`,
          name: '待确认单元',
          cards: missingCards,
        })
      } else {
        categories[0].chapters = [{ tempId: 'tmp_ch_0', name: '默认章节', units: [{ tempId: 'tmp_unit_0', name: '待确认单元', cards: missingCards }] }]
      }
    } else if (classificationDepth === 'chapter-only') {
      categories[0].chapters.push({
        tempId: `tmp_ch_${categories[0].chapters.length}_missing`,
        name: '待确认章节',
        cards: missingCards,
      })
    } else {
      categories[0].units.push({
        tempId: `tmp_unit_${categories.length}_missing`,
        name: '待确认单元',
        cards: missingCards,
      })
    }
  }

  if (categories.length === 0) return null
  return { mode: 'cross-category-auto', usedFallback: false, categories }
}

function buildCrossCategoryFallback(selectedCards, classificationDepth) {
  const groups = new Map()
  for (const card of selectedCards || []) {
    const text = String(card.knowledge_point || card.front || '综合知识').replace(/\s+/g, '')
    const key = text.slice(0, 2) || '综合'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(card)
  }

  if (classificationDepth === 'chapter-and-unit') {
    const chapters = Array.from(groups.entries()).map(([name, cards], index) => ({
      tempId: `tmp_ch_fallback_${index}`,
      name: `${name}相关`.slice(0, 12),
      units: [{ tempId: `tmp_unit_fallback_${index}_0`, name: `${name}相关`.slice(0, 16), cards }],
    }))
    return {
      mode: 'cross-category-auto',
      usedFallback: true,
      categories: [
        {
          tempId: 'tmp_cat_fallback_0',
          name: 'AI归类卡片',
          chapters: chapters.length ? chapters : [{ tempId: 'tmp_ch_fallback_0', name: '默认章节', units: [{ tempId: 'tmp_unit_fallback_0', name: '综合知识', cards: [] }] }],
        },
      ],
    }
  }

  if (classificationDepth === 'chapter-only') {
    const chapters = Array.from(groups.entries()).map(([name, cards], index) => ({
      tempId: `tmp_ch_fallback_${index}`,
      name: `${name}相关`.slice(0, 12),
      cards,
    }))
    return {
      mode: 'cross-category-auto',
      usedFallback: true,
      categories: [
        {
          tempId: 'tmp_cat_fallback_0',
          name: 'AI归类卡片',
          chapters: chapters.length ? chapters : [{ tempId: 'tmp_ch_fallback_0', name: '综合知识', cards: [] }],
        },
      ],
    }
  }

  const units = Array.from(groups.entries()).map(([name, cards], index) => ({
    tempId: `tmp_unit_fallback_${index}`,
    name: `${name}相关`.slice(0, 16),
    cards,
  }))

  return {
    mode: 'cross-category-auto',
    usedFallback: true,
    categories: [
      {
        tempId: 'tmp_cat_fallback_0',
        name: 'AI归类卡片',
        units: units.length ? units : [{ tempId: 'tmp_unit_fallback_0', name: '综合知识', cards: [] }],
      },
    ],
  }
}

export async function planChapterUnitStructure(existingUnits = [], existingChapters = [], config = {}) {
  const units = Array.isArray(existingUnits) ? existingUnits.filter(u => u?.name) : []
  const chapters = Array.isArray(existingChapters) ? existingChapters.filter(ch => ch?.name) : []
  
  if (units.length === 0) {
    return { chapterAssignments: [], unitMerges: [], newChapters: [] }
  }
  
  if (!config || !config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey) {
    throw new Error('请先配置 AI API Key')
  }
  
  const unitLines = units.map((u, i) => `单元${i}: ${u.name}`)
  const chapterLines = chapters.map((ch, i) => `章节${i}: ${ch.name}`)
  
  const prompt = `你是知识体系整理助手。请分析现有单元和章节的结构关系。

【任务】：
1. 判断每个单元应该归属哪个章节（如果有章节的话）
2. 判断哪些单元主题相似，可以合并（合并后的单元更宽泛，避免过于细碎）
3. 判断是否需要新建章节来容纳未归类的单元

【划分原则】：
1. 章节是中等粒度的知识模块，每个章节通常包含 2-5 个单元
2. 单元是较宽泛的知识板块，不要将知识点拆分得过细
3. 单元合并时，优先将主题高度相关的单元合并为一个更宽泛的单元

【现有章节】：
${chapterLines.join('\n') || '（暂无章节）'}

【现有单元】（共 ${units.length} 个）：
${unitLines.join('\n')}

【输出格式】请严格以 JSON 格式返回：
{
  "chapterAssignments": [{"unitIndex": 数字, "chapterIndex": 数字}],
  "unitMerges": [{"sourceUnitIndices": [数字数组], "targetUnitName": "字符串"}],
  "newChapters": [{"name": "字符串", "unitIndices": [数字数组]}]
}`

  try {
    const { content } = await callAiProvider(prompt, config)
    
    let parsed = null
    try {
      const trimmed = String(content).trim()
      const firstBracket = trimmed.indexOf('{')
      const lastBracket = trimmed.lastIndexOf('}')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
      }
    } catch (_) {
      return { chapterAssignments: [], unitMerges: [], newChapters: [] }
    }
    
    if (!parsed || typeof parsed !== 'object') {
      return { chapterAssignments: [], unitMerges: [], newChapters: [] }
    }
    
    const chapterAssignments = []
    if (Array.isArray(parsed.chapterAssignments)) {
      for (const item of parsed.chapterAssignments) {
        if (typeof item.unitIndex === 'number' && typeof item.chapterIndex === 'number') {
          if (item.unitIndex >= 0 && item.unitIndex < units.length &&
              item.chapterIndex >= 0 && item.chapterIndex < chapters.length) {
            chapterAssignments.push({ unitIndex: item.unitIndex, chapterIndex: item.chapterIndex })
          }
        }
      }
    }
    
    const unitMerges = []
    if (Array.isArray(parsed.unitMerges)) {
      for (const item of parsed.unitMerges) {
        if (Array.isArray(item.sourceUnitIndices) && typeof item.targetUnitName === 'string') {
          const validIndices = item.sourceUnitIndices.filter(i => typeof i === 'number' && i >= 0 && i < units.length)
          if (validIndices.length >= 2) {
            unitMerges.push({ sourceUnitIndices: validIndices, targetUnitName: String(item.targetUnitName).trim().slice(0, 16) })
          }
        }
      }
    }
    
    const newChapters = []
    if (Array.isArray(parsed.newChapters)) {
      for (const item of parsed.newChapters) {
        if (typeof item.name === 'string' && Array.isArray(item.unitIndices)) {
          const validIndices = item.unitIndices.filter(i => typeof i === 'number' && i >= 0 && i < units.length)
          const chapterName = String(item.name).trim().slice(0, 12)
          if (chapterName && validIndices.length > 0) {
            newChapters.push({ name: chapterName, unitIndices: validIndices })
          }
        }
      }
    }
    
    return { chapterAssignments, unitMerges, newChapters }
    
  } catch (err) {
    console.error('[planChapterUnitStructure] AI调用失败:', err)
    return { chapterAssignments: [], unitMerges: [], newChapters: [] }
  }
}

export async function classifyCardsByChapterBatch(chapterId, chapterUnits = [], cards = [], config = {}, batchSize = 50, onProgress) {
  if (!chapterId) {
    throw new Error('chapterId 不能为空')
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    return []
  }
  
  const units = Array.isArray(chapterUnits) ? chapterUnits.filter(u => u?.name) : []
  
  const batches = []
  for (let i = 0; i < cards.length; i += batchSize) {
    batches.push(cards.slice(i, i + batchSize))
  }
  
  const results = []
  let totalProcessed = 0
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    
    try {
      const batchResult = await classifySingleBatch(chapterId, units, batch, config)
      results.push(...batchResult)
      totalProcessed += batch.length
      
      if (typeof onProgress === 'function') {
        onProgress({
          current: batchIndex + 1,
          total: batches.length,
          processed: totalProcessed,
          totalCards: cards.length,
        })
      }
      
    } catch (err) {
      console.error(`[classifyCardsByChapterBatch] 批次 ${batchIndex + 1} 处理失败，跳过此批次:`, err)
      for (let i = 0; i < batch.length; i++) {
        results.push({
          cardIndex: batch[i]._originalIndex !== undefined ? batch[i]._originalIndex : -1,
          chapterId,
          unitId: null,
          newUnitName: null,
          error: 'AI归类失败',
        })
      }
      totalProcessed += batch.length
    }
  }
  
  const duplicateResults = detectDuplicateCards(cards, 0.85)
  for (const dup of duplicateResults) {
    const idx1 = cards.findIndex(c => c.id === dup.card1Id)
    const idx2 = cards.findIndex(c => c.id === dup.card2Id)
    if (idx1 !== -1 && idx2 !== -1) {
      const r1 = results.find(r => r.cardIndex === idx1)
      const r2 = results.find(r => r.cardIndex === idx2)
      if (r1) r1.duplicateOf = dup.card2Id
      if (r2) r2.duplicateOf = dup.card1Id
    }
  }
  
  return results
}

async function classifySingleBatch(chapterId, units, cards, config) {
  const unitBlocks = units.map((u, i) => `【单元${i}】${u.name}`)
  
  const cardLines = cards.map((c, i) => 
    `新卡${i}: Q=${String(c.front || '').slice(0, 60)} | A=${String(c.back || '').slice(0, 60)}`
  )
  
  const prompt = `你是分类助手。请把新卡片归类到现有单元中。

【现有单元】：
${unitBlocks.join('\n')}

【新卡片】：
${cardLines.join('\n')}

【输出格式】JSON数组：
[{"cardIndex": 数字, "unitIndex": 数字或null, "newUnitName": "字符串或null"}]`
  
  const { content } = await callAiProvider(prompt, config)
  
  let parsed = null
  try {
    const trimmed = String(content).trim()
    const firstBracket = trimmed.indexOf('[')
    const lastBracket = trimmed.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
    }
  } catch (_) { /* ignore */ }
  
  if (!Array.isArray(parsed)) {
    return cards.map((c, i) => ({
      cardIndex: c._originalIndex !== undefined ? c._originalIndex : i,
      chapterId,
      unitId: null,
      newUnitName: (c.front || '新单元').slice(0, 16),
    }))
  }
  
  const assignments = []
  for (let i = 0; i < cards.length; i++) {
    const item = parsed.find(p => Number(p.cardIndex) === i)
    
    if (item && typeof item.unitIndex === 'number' && item.unitIndex >= 0 && item.unitIndex < units.length) {
      assignments.push({
        cardIndex: cards[i]._originalIndex !== undefined ? cards[i]._originalIndex : i,
        chapterId,
        unitId: units[item.unitIndex].id,
        newUnitName: null,
      })
    } else if (item && item.newUnitName) {
      assignments.push({
        cardIndex: cards[i]._originalIndex !== undefined ? cards[i]._originalIndex : i,
        chapterId,
        unitId: null,
        newUnitName: String(item.newUnitName).trim().slice(0, 16),
      })
    } else {
      assignments.push({
        cardIndex: cards[i]._originalIndex !== undefined ? cards[i]._originalIndex : i,
        chapterId,
        unitId: null,
        newUnitName: (cards[i].front || '新单元').slice(0, 16),
      })
    }
  }
  
  return assignments
}

export async function confirmStructurePlan(userPlan = {}, existingData = {}, config = {}) {
  if (!config || !config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey) {
    throw new Error('请先配置 AI API Key')
  }
  
  const extractStructure = (data) => {
    if (!data) return {}
    const categories = Array.isArray(data.categories) ? data.categories : []
    return {
      categories: categories.map(cat => ({
        name: cat.name,
        chapters: Array.isArray(cat.chapters) ? cat.chapters.map(ch => ({
          name: ch.name,
          units: Array.isArray(ch.units) ? ch.units.map(u => u.name) : [],
        })) : [],
        units: Array.isArray(cat.units) ? cat.units.map(u => u.name) : [],
      })),
    }
  }
  
  const planStructure = extractStructure(userPlan)
  const existingStructure = extractStructure(existingData)
  
  const prompt = `你是知识体系整理助手。请分析用户提供的分类框架是否合理。

【用户框架】：
${JSON.stringify(planStructure, null, 2)}

【现有结构】：
${JSON.stringify(existingStructure, null, 2)}

【任务】：
1. 判断现有结构是否可以承载用户框架（不需要新建）
2. 如果需要微调名称，请给出建议
3. 如果需要新建结构（分类/章节/单元），请给出建议
4. 判断是否有重复或冗余的分类/章节/单元

【输出格式】：
{
  "useExisting": true/false,
  "suggestedNameChanges": [{"oldName": "字符串", "newName": "字符串"}],
  "newStructures": [{"type": "category|chapter|unit", "name": "字符串", "parentName": "字符串"}],
  "mergeSuggestions": [{"sources": ["字符串数组"], "target": "字符串"}]
}`
  
  try {
    const { content } = await callAiProvider(prompt, config)
    
    let parsed = null
    try {
      const trimmed = String(content).trim()
      const firstBracket = trimmed.indexOf('{')
      const lastBracket = trimmed.lastIndexOf('}')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1))
      }
    } catch (_) { /* ignore */ }
    
    if (!parsed || typeof parsed !== 'object') {
      return {
        useExisting: true,
        suggestedNameChanges: [],
        newStructures: [],
        mergeSuggestions: [],
      }
    }
    
    return {
      useExisting: Boolean(parsed.useExisting),
      suggestedNameChanges: Array.isArray(parsed.suggestedNameChanges) ? parsed.suggestedNameChanges : [],
      newStructures: Array.isArray(parsed.newStructures) ? parsed.newStructures : [],
      mergeSuggestions: Array.isArray(parsed.mergeSuggestions) ? parsed.mergeSuggestions : [],
    }
    
  } catch (err) {
    console.error('[confirmStructurePlan] AI调用失败:', err)
    return {
      useExisting: true,
      suggestedNameChanges: [],
      newStructures: [],
      mergeSuggestions: [],
    }
  }
}

export function detectDuplicateCards(cards = [], threshold = 0.85, maxComparisons = 10000) {
  if (!Array.isArray(cards) || cards.length < 2) {
    return []
  }
  
  const duplicates = []
  let comparisons = 0
  const maxCards = Math.min(cards.length, 200)
  
  for (let i = 0; i < maxCards; i++) {
    const card1 = cards[i]
    if (!card1 || !card1.id) continue
    
    for (let j = i + 1; j < maxCards; j++) {
      if (comparisons >= maxComparisons) {
        console.warn(`[detectDuplicateCards] 已达到最大比较次数 ${maxComparisons}，停止检测`)
        return duplicates
      }
      
      const card2 = cards[j]
      if (!card2 || !card2.id) continue
      
      const similarity = calculateCardSimilarity(card1, card2)
      if (similarity >= threshold) {
        duplicates.push({
          card1Id: card1.id,
          card2Id: card2.id,
          similarity: parseFloat(similarity.toFixed(4)),
          card1KnowledgePoint: String(card1.knowledge_point || card1.front || '').slice(0, 50),
          card2KnowledgePoint: String(card2.knowledge_point || card2.front || '').slice(0, 50),
        })
      }
      
      comparisons++
    }
  }
  
  return duplicates
}

function calculateCardSimilarity(card1, card2) {
  const kp1 = String(card1.knowledge_point || '').trim()
  const kp2 = String(card2.knowledge_point || '').trim()
  const front1 = String(card1.front || '').trim()
  const front2 = String(card2.front || '').trim()
  const back1 = String(card1.back || '').trim()
  const back2 = String(card2.back || '').trim()
  
  let totalWeight = 0
  let weightedSum = 0
  
  if (kp1 && kp2) {
    const kpSim = jaccardSimilarity(kp1, kp2)
    weightedSum += kpSim * 0.5
    totalWeight += 0.5
  }
  
  if (front1 && front2) {
    const frontSim = jaccardSimilarity(front1, front2)
    weightedSum += frontSim * 0.3
    totalWeight += 0.3
  }
  
  if (back1 && back2) {
    const backSim = jaccardSimilarity(back1, back2)
    weightedSum += backSim * 0.2
    totalWeight += 0.2
  }
  
  if (totalWeight === 0) {
    return 0
  }
  
  return weightedSum / totalWeight
}

function jaccardSimilarity(str1, str2) {
  const clean = (s) => s.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '')

  const set1 = new Set(clean(str1).split(''))
  const set2 = new Set(clean(str2).split(''))

  if (set1.size === 0 && set2.size === 0) {
    return 1
  }
  if (set1.size === 0 || set2.size === 0) {
    return 0
  }

  let intersection = 0
  for (const char of set1) {
    if (set2.has(char)) {
      intersection++
    }
  }

  const union = set1.size + set2.size - intersection

  return intersection / union
}

// ============================================================
// 两步法核心架构：planStructure + assignCards
// 参考 spec.md 两步法架构 和 AI 分类方式优化规划.md
// ============================================================

// 结构规划约束常量
const STRUCTURE_PLANNING_RULES = `
【核心原则】（必须严格遵守）：
1. 单元数量 = 知识点大类数量，不是每张卡片一个单元
2. 多个相关的知识点必须归入同一个单元
3. 例如：40个知识点应该规划为 2-4 个章节，每章 2-3 个单元，总共 4-8 个单元

【结构规划硬约束】：
1. 章节总数：2-3 个（最多不超过 4 个）
2. 每个章节包含 2-5 个单元（最多不超过 6 个）
3. 单元总数：4-15 个（绝对不能超过 15 个）
4. 禁止为每张卡片创建独立单元
5. 禁止使用知识点标题作为单元名

【单元划分原则】（重要）：
1. 每个单元应该聚焦一个具体的知识主题，不要把多个不同主题合并到一个单元
2. 例如："贪心算法"和"回溯算法"是不同的主题，应该分为两个单元，不要合并为"算法策略"
3. 例如："字符串"和"矩阵"是不同的主题，应该分为两个单元，不要合并为"串与数组存储"
4. 例如："图的基础"和"图的遍历"是不同的主题，应该分为两个单元
5. 【禁止】创建"基础概念"、"概述"、"综合应用"等通用单元，这类单元会吸引大量不相关的卡片
6. 每个单元的名称应该具体明确，能反映该单元的独特主题

【单元命名规范】：
   - 使用宽泛的概括性命名（如"链表基础操作"而非"单链表插入删除"）
   - 单元名称 ≤ 16 字，避免过长导致移动端显示问题
   - 禁止使用编号作为单元名（如"单元1"、"第一部分"）
   - 禁止使用纯知识点标题作为单元名（如"什么是CPU"）

【章节命名规范】：
   - 章节名称 ≤ 12 字，体现知识大类
   - 使用考研学科标准命名（如"数据结构"、"操作系统"而非"计算机第一章"）
   - 禁止使用时间/日期作为章节名（如"第一天"、"2024年"）

【新建限制】：
   - 新章节总数不超过 5 个（智能单元整理不超过 4 个）
   - 新单元总数不超过 15 个（智能单元整理不超过 12 个）
   - 优先使用现有结构，只有多张卡片形成明确新主题时才新建

【层级一致性】：
   - 同一主题下的单元必须归入同一章节
   - 禁止为每个单元创建独立章节
   - 知识点内容相近的卡片应归入同一单元
`

// 卡片分配约束常量
const CARD_ASSIGNMENT_RULES = `
【核心原则 - 聚类优先】（最重要！）：
1. 同一主题的知识点必须集中归入同一个单元，禁止分散到多个单元
2. 禁止将卡片均匀分发到各单元！单元卡片数应反映实际主题分布
3. 允许某些单元为空（0张卡片），如果没有匹配的知识点

【分配策略】（必须按此顺序执行）：
步骤1：先按知识点主题将卡片分组（如：所有"排序"相关的卡→一组，所有"图"相关的卡→一组）
步骤2：再将每组卡片整体分配到最匹配的单元
步骤3：检查同一主题的卡片是否全部在同一个单元，如有分散则合并

【卡片分配硬约束（必须遵守）】：

1. 完整性：
   - 每张卡片必须且只能分配到一个单元
   - 禁止遗漏任何卡片
   - 禁止重复分配同一卡片

2. 聚类性：
   - 同一主题的卡片必须归入同一个单元，禁止分散到多个单元
   - 单元卡片数应反映实际主题分布，差异越大越好
   - 禁止均匀分发卡片到各单元

3. 单元容量：
   - 每个单元卡片数在 2-50 张范围内
   - 单元卡片数 < 2 时应合并到相邻单元
   - 单元卡片数 > 50 时应考虑拆分
   - 允许空单元（0张卡片）

4. 语义匹配：
   - 卡片内容与单元主题高度相关时归入
   - 主题不相关时不要强行归入
   - 优先匹配知识点内容而非卡片问题文本

5. 输出格式：
   - 必须返回 JSON 数组格式
   - cardIndex 必须是输入列表中的有效下标
   - 禁止返回额外文字、Markdown、注释
`

/**
 * 构建结构规划的 prompt
 * @param {string[]} cardLines - 卡片内容行
 * @param {string} existingContext - 现有结构上下文
 * @param {string} newStructureLimit - 新建限制
 * @param {number} cardCount - 卡片数量
 * @param {string} mode - 模式
 * @param {string} categoryPurpose - 分类目的（如"考研"、"计算机408"等）
 * @param {string} skipContext - 略去章节/单元的提示信息
 */
function buildPlanStructurePrompt(cardLines, existingContext, newStructureLimit, cardCount, mode, categoryPurpose, skipContext = '') {
  // 构建分类目的上下文
  const purposeContext = categoryPurpose
    ? `\n\n【学习目的】本分类的学习目的为：${categoryPurpose}。请据此规划合理的章节/单元结构，确保知识点组织符合该学习场景。`
    : ''

  const baseRole = categoryPurpose
    ? `${categoryPurpose}知识体系整理助手`
    : '考研科目的知识体系整理助手'

  return `你是${baseRole}。请分析以下卡片的知识点分布，规划合适的章节/单元层级结构。
${purposeContext}
${skipContext}
【任务】：
1. 分析所有卡片的内容，提取主题关键词
2. 按知识体系逻辑将卡片划分为若干章节和单元
3. 为每个章节和单元起一个概括性名称
4. 只返回结构方案，不涉及具体卡片分配

${STRUCTURE_PLANNING_RULES}
${newStructureLimit}
${existingContext}

【所有卡片（共 ${cardCount} 张）】：
${cardLines.join('\n')}

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "chapters": [
    {
      "name": "章节名称（不超过 12 字）",
      "units": [
        { "name": "单元名称（不超过 16 字）" },
        { "name": "单元名称（不超过 16 字）" }
      ]
    },
    {
      "name": "章节名称（不超过 12 字）",
      "units": [
        { "name": "单元名称（不超过 16 字）" }
      ]
    }
  ]
}

【重要提醒】：
1. 本步骤只规划章节和单元的层级结构，不涉及具体卡片分配
2. 章节数量应控制在 2-5 个，禁止为每张卡片创建独立章节
3. 同一主题的卡片必须归入同一章节的同一单元
4. 返回的 JSON 中不要包含 cardIndices 字段`
}

/**
 * 弱模型分批处理结构规划
 * 按 token 数量动态分批，确保每批输入不超过模型限制
 * @param {string} categoryPurpose - 分类目的
 * @param {string} skipContext - 略去章节/单元的提示信息
 */
async function planStructureWithBatches(cards, cardLines, existingContext, newStructureLimit, config, mode, cardCount, categoryPurpose, skipContext = '') {
  const allChapters = []

  // ===== 按 token 数量动态分批 =====
  // 估算：中文每个字符 ≈ 1 token，英文每个单词 ≈ 1.3 tokens
  // 弱模型（如讯飞Spark Lite）单批输入限制约 2000-3000 tokens
  // 预留 500 tokens 给 prompt 模板和上下文，实际可用约 1500-2500 tokens
  const isSparkLite = config.aiServiceMode === 'iflytek-spark' && (!config.model || config.model === 'lite')
  const MAX_TOKENS_PER_BATCH = isSparkLite ? 2500 : 2000  // 每批最大 token 数
  const ESTIMATED_CHARS_PER_TOKEN = 0.8  // 估算每 token 对应的字符数
  
  // 计算固定部分的 token 数（prompt 模板 + 上下文）
  const basePrompt = `你是${categoryPurpose || '考研科目的知识体系整理助手'}。请分析以下卡片的知识点分布，规划合适的章节/单元层级结构。
${existingContext}${skipContext}
【任务】：
1. 分析这批卡片的内容，提取主题关键词
2. 按知识体系逻辑将卡片划分为若干章节和单元
3. 为每个章节和单元起一个概括性名称
4. 只返回结构方案，不涉及具体卡片分配

${STRUCTURE_PLANNING_RULES}
${newStructureLimit}

【这批卡片】：`
  
  const baseTokens = Math.ceil(basePrompt.length * ESTIMATED_CHARS_PER_TOKEN)
  const maxCardChars = Math.floor((MAX_TOKENS_PER_BATCH - baseTokens) / ESTIMATED_CHARS_PER_TOKEN)
  

  // 构建基于 token 的批次
  const batches = []
  let currentBatch = []
  let currentBatchChars = 0
  
  for (let i = 0; i < cardCount; i++) {
    const cardLine = cardLines[i]
    const cardChars = cardLine.length
    
    // 如果当前卡片加入后会超过限制，且当前批次不为空，则开始新批次
    if (currentBatchChars + cardChars > maxCardChars && currentBatch.length > 0) {
      batches.push({
        cards: currentBatch,
        startIdx: i - currentBatch.length,
        endIdx: i - 1,
        charCount: currentBatchChars,
      })
      currentBatch = []
      currentBatchChars = 0
    }
    
    currentBatch.push(i)
    currentBatchChars += cardChars
  }
  
  // 添加最后一个批次
  if (currentBatch.length > 0) {
    batches.push({
      cards: currentBatch,
      startIdx: cardCount - currentBatch.length,
      endIdx: cardCount - 1,
      charCount: currentBatchChars,
    })
  }
  
  const batchCount = batches.length
  batches.forEach((b, i) => {
  })
  
  // 构建分类目的上下文
  const purposeContext = categoryPurpose
    ? `\n\n【学习目的】本分类的学习目的为：${categoryPurpose}。请据此规划合理的章节/单元结构。`
    : ''
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const startIdx = batch.startIdx
    const endIdx = batch.endIdx
    const batchCardLines = batch.cards.map(idx => cardLines[idx])
    const batchCardCount = batch.cards.length
    
    // 构建批次提示（添加批次信息和略去上下文）
    const batchContext = existingContext + purposeContext + skipContext + `\n\n【提示】：这是第 ${batchIndex + 1}/${batchCount} 批处理，约 ${Math.ceil(batch.charCount * ESTIMATED_CHARS_PER_TOKEN)} tokens。`
    
    const baseRole = categoryPurpose ? `${categoryPurpose}知识体系整理助手` : '考研科目的知识体系整理助手'
    
    const prompt = `你是${baseRole}。请分析以下卡片的知识点分布，规划合适的章节/单元层级结构。

【任务】：
1. 分析这批卡片的内容，提取主题关键词
2. 按知识体系逻辑将卡片划分为若干章节和单元
3. 为每个章节和单元起一个概括性名称
4. 只返回结构方案，不涉及具体卡片分配

${STRUCTURE_PLANNING_RULES}
${newStructureLimit}
${batchContext}

【这批卡片（共 ${batchCardCount} 张，本批卡片索引范围: ${startIdx}-${endIdx}）】：
${batchCardLines.join('\n')}

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "chapters": [
    {
      "name": "章节名称（不超过 12 字）",
      "units": [
        { "name": "单元名称（不超过 16 字）" }
      ]
    }
  ]
}

【重要提醒】：
1. 本步骤只规划章节和单元的层级结构，不涉及具体卡片分配
2. 章节数量应控制在 2-5 个，禁止为每张卡片创建独立章节
3. 返回的 JSON 中不要包含 cardIndices 字段`

    try {
      const startTime = Date.now()
      const isSparkLite = config.aiServiceMode === 'iflytek-spark' && (!config.model || config.model === 'lite')
      const result = await callAiProvider(prompt, {
        ...config,
        temperature: 0.3,
        max_tokens: isSparkLite ? 8192 : 2048, // 讯飞Lite需要更多token空间
      })
      
      
      logAiCall({
        purpose: 'plan-structure-batch',
        modelName: getModelName(config.aiServiceMode, config.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens,
        prompt: prompt,
        response: result.content,
      })
      
      // 解析 AI 返回的 JSON
      const parsed = parsePlanStructureResult(result.content)
      
      if (parsed && Array.isArray(parsed.chapters)) {
        for (const ch of parsed.chapters) {
          if (ch.name) {
            allChapters.push({
              name: String(ch.name).trim().slice(0, 12),
              units: (ch.units || []).map(u => ({
                name: String(u.name || '').trim().slice(0, 16),
                cardIndices: (u.cardIndices || []).map(idx => startIdx + idx), // 转换为全局索引
              })),
            })
          }
        }
      }
      
    } catch (err) {
      logAiCall({
        purpose: 'plan-structure-batch',
        modelName: getModelName(config.aiServiceMode, config.model),
        durationMs: 0,
        status: 'error',
        errorMessage: err?.message || '未知错误',
        prompt: prompt,
        response: '',
      })
      throw new Error(`第 ${batchIndex + 1}/${batchCount} 批处理失败: ${err.message}`)
    }
  }
  
  // 合并所有章节
  if (allChapters.length === 0) {
    throw new Error('所有批次处理均未返回有效结构')
  }
  
  // 对章节进行合并和去重
  const mergedChapters = mergeStructureBatches(allChapters, cardCount)
  
  // 校验最终结构
  const validation = validateStructurePlan({ chapters: mergedChapters }, cardCount)
  if (!validation.valid) {
    console.warn('[planStructureWithBatches] 结构校验失败，尝试修正:', validation.errors)
    const fixed = fixStructurePlan({ chapters: mergedChapters }, cardCount, mode)
    if (fixed) {
      return fixed
    }
    throw new Error('结构校验失败: ' + validation.errors.join('; '))
  }
  
  return {
    chapters: mergedChapters.map(ch => ({
      name: ch.name,
      units: ch.units.map(u => ({ name: u.name })),
    })),
  }
}

/**
 * 合并多个批次的结构结果
 * 1. 按语义相似度合并章节（而非精确名称匹配）
 * 2. 合并相同名称的单元
 * 3. 整合卡片索引
 * 4. 强制限制章节数量在合理范围内
 * 5. [fix-P2-2] 基于主题分组关键词合并相似单元
 */
function mergeStructureBatches(allChapters, totalCardCount) {
  // ===== 第一步：按语义相似度合并章节 =====
  // 使用聚类合并：相似度 >= 0.3 的章节视为同一章节
  const SIMILARITY_THRESHOLD = 0.3
  const mergedChapters = []

  for (const ch of allChapters) {
    const chName = String(ch.name || '').trim()
    if (!chName) continue

    // 查找已合并章节中最相似的
    let bestMatch = null
    let bestScore = 0
    for (const existing of mergedChapters) {
      const score = simpleTextSimilarity(chName, existing.name)
      // 也检查是否包含关系（如"计算机基础"和"计算机基础概述"）
      const containsRelation = chName.includes(existing.name) || existing.name.includes(chName)
      const effectiveScore = containsRelation ? Math.max(score, 0.5) : score
      if (effectiveScore > bestScore) {
        bestScore = effectiveScore
        bestMatch = existing
      }
    }

    if (bestMatch && bestScore >= SIMILARITY_THRESHOLD) {
      // 合并到现有章节
      // 选择更短的名称作为章节名（更概括）
      if (chName.length < bestMatch.name.length) {
        bestMatch.name = chName
      }
      // 合并单元
      for (const u of ch.units || []) {
        const unitName = String(u.name || '').trim()
        if (!unitName) continue
        const existingUnit = bestMatch.units.find(eu => simpleTextSimilarity(unitName, eu.name) >= 0.4 || unitName.includes(eu.name) || eu.name.includes(unitName))
        if (existingUnit) {
          // 合并卡片索引
          if (u.cardIndices) {
            for (const idx of u.cardIndices) {
              if (idx >= 0 && idx < totalCardCount && !existingUnit.cardIndices.includes(idx)) {
                existingUnit.cardIndices.push(idx)
              }
            }
          }
        } else {
          bestMatch.units.push({
            name: unitName,
            cardIndices: Array.isArray(u.cardIndices) ? u.cardIndices.filter(idx => idx >= 0 && idx < totalCardCount) : [],
          })
        }
      }
    } else {
      // 创建新章节
      mergedChapters.push({
        name: chName,
        units: (ch.units || []).map(u => ({
          name: String(u.name || '').trim(),
          cardIndices: Array.isArray(u.cardIndices) ? u.cardIndices.filter(idx => idx >= 0 && idx < totalCardCount) : [],
        })).filter(u => u.name),
      })
    }
  }

  // ===== 第一步补充：基于主题分组关键词合并相似单元 =====
  // [fix-P2-2] 全局收集所有单元，按主题分组关键词合并
  const allUnits = []
  for (const ch of mergedChapters) {
    for (const u of ch.units) {
      allUnits.push({ ...u, chapterName: ch.name })
    }
  }

  // 计算合理的单元数量上限（更激进地合并）
  let maxUnits = 4
  if (totalCardCount > 50) maxUnits = 6
  else if (totalCardCount > 30) maxUnits = 5
  else maxUnits = 4

  if (allUnits.length > maxUnits) {

    // 第一轮：基于主题分组关键词合并
    const groupedUnits = new Map()
    const ungroupedUnits = []

    for (const u of allUnits) {
      const group = getUnitTopicGroup(u.name)
      if (group) {
        if (!groupedUnits.has(group)) {
          groupedUnits.set(group, { name: group, chapterName: u.chapterName, cardIndices: [...(u.cardIndices || [])] })
        } else {
          // 合并卡片索引
          for (const idx of (u.cardIndices || [])) {
            if (!groupedUnits.get(group).cardIndices.includes(idx)) {
              groupedUnits.get(group).cardIndices.push(idx)
            }
          }
        }
      } else {
        ungroupedUnits.push(u)
      }
    }

    const newUnits = []
    for (const info of groupedUnits.values()) {
      newUnits.push({ name: info.name, chapterName: info.chapterName, cardIndices: info.cardIndices })
    }
    newUnits.push(...ungroupedUnits)


    // 第二轮：基于语义相似度合并（阈值 0.15）
    if (newUnits.length > maxUnits) {
      const finalUnits = []
      for (const u of newUnits) {
        const existing = finalUnits.find(mu =>
          simpleTextSimilarity(mu.name, u.name) >= 0.15 ||
          mu.name.includes(u.name) || u.name.includes(mu.name) ||
          shareCommonKeyword(mu.name, u.name)
        )
        if (existing) {
          // 合并卡片索引
          for (const idx of (u.cardIndices || [])) {
            if (!existing.cardIndices.includes(idx)) {
              existing.cardIndices.push(idx)
            }
          }
        } else {
          finalUnits.push({ ...u })
        }
      }
      newUnits.length = 0
      newUnits.push(...finalUnits)
    }

    // 如果仍超过上限，强制截断
    if (newUnits.length > maxUnits) {
      newUnits.splice(maxUnits)
    }

    // 重新组织章节结构
    const chapterMap = new Map()
    for (const u of newUnits) {
      if (!chapterMap.has(u.chapterName)) {
        chapterMap.set(u.chapterName, [])
      }
      chapterMap.get(u.chapterName).push({ name: u.name, cardIndices: u.cardIndices || [] })
    }

    // 替换 mergedChapters
    mergedChapters.length = 0
    for (const [name, units] of chapterMap) {
      mergedChapters.push({ name, units })
    }
  }

  // ===== 第二步：强制限制章节数量 =====
  // 根据卡片数量计算合理的章节数量上限
  // 规则：每 10-15 张卡片 1 个章节，最少 2 个，最多 5 个（大数据量时 8 个）
  let maxChapters = 5
  if (totalCardCount > 50) maxChapters = 8
  else if (totalCardCount > 30) maxChapters = 5
  else if (totalCardCount > 15) maxChapters = 4
  else maxChapters = 3


  // 如果章节数量超过上限，进行二次合并
  if (mergedChapters.length > maxChapters) {
    const reduced = mergeSimilarChapters(mergedChapters, maxChapters)
    return reduced
  }

  // ===== 第三步：对每个章节的单元进行去重和排序 =====
  const result = mergedChapters.map(ch => {
    const unitMap = new Map()
    for (const u of ch.units) {
      if (!unitMap.has(u.name)) {
        unitMap.set(u.name, { name: u.name, cardIndices: [...u.cardIndices] })
      } else {
        const existing = unitMap.get(u.name)
        for (const idx of u.cardIndices) {
          if (!existing.cardIndices.includes(idx)) {
            existing.cardIndices.push(idx)
          }
        }
      }
    }
    const units = []
    for (const u of unitMap.values()) {
      units.push({
        name: u.name,
        cardIndices: u.cardIndices.sort((a, b) => a - b),
      })
    }
    return {
      name: ch.name,
      units: units.sort((a, b) => a.name.localeCompare(b.name)),
    }
  })

  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * [fix-P2-2] 主题分组关键词
 * 用于将语义相关但名称不同的单元合并为一个
 * 可根据不同学科扩展
 */
const UNIT_TOPIC_GROUP_KEYWORDS = {
  '计算机系统组成概述': ['CPU', '运算器', '控制器', '存储器', '输入设备', '输出设备', '裸机', '软硬件', '系统组成', '硬件部件', '软件系统', '软件特点', '硬件系统', '软件解析'],
  '计算机发展与分类': ['ENIAC', '发展', '电子管', '晶体管', '集成电路', '巨型机', '大型机', '小型机', '微型机', '嵌入式', '特性', '用途', '发展方向', '巨型化', '微型化', '网络化', '智能化', '多媒体'],
  '计算机数制与信息编码': ['二进制', '八进制', '十进制', '十六进制', '进制', '字节', 'Byte', 'KB', 'MB', 'GB', 'TB', '位', 'bit', 'ASCII', 'GB2312', '汉字', '编码', '字母', '除2取余', '存储单位', '换算'],
  '内部存储硬件': ['RAM', 'ROM', 'Cache', '高速缓存', 'DDR', '外存', '机械硬盘', 'HDD', '固态硬盘', 'SSD', 'U盘', '光盘', '移动外存', '读写速度', '断电', '随机存取', '只读存储'],
}

/**
 * [fix-P2-2] 判断单元名属于哪个主题组
 * @param {string} unitName - 单元名称
 * @returns {string|null} 主题组名称，如果不匹配则返回 null
 */
function getUnitTopicGroup(unitName) {
  if (!unitName) return null
  for (const [groupName, keywords] of Object.entries(UNIT_TOPIC_GROUP_KEYWORDS)) {
    for (const kw of keywords) {
      if (unitName.includes(kw)) {
        return groupName
      }
    }
  }
  return null
}

/**
 * [fix-P2-2] 检查两个名称是否共享关键词
 * @param {string} name1
 * @param {string} name2
 * @returns {boolean}
 */
function shareCommonKeyword(name1, name2) {
  if (!name1 || !name2) return false
  const words1 = String(name1).split(/[\s,，。；;：:\-—_·、]+/).filter(w => w.length >= 2)
  const words2 = String(name2).split(/[\s,，。；;：:\-—_·、]+/).filter(w => w.length >= 2)
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        return true
      }
    }
  }
  return false
}

/**
 * 第一步：结构规划 (planStructure)
 * 
 * 功能：
 * - 分析卡片知识点分布
 * - 提取主题关键词
 * - 规划章节/单元层级结构
 * - 返回结构方案（不含卡片分配）
 * 
 * @param {Array} cards - 卡片数组
 * @param {object} config - AI 配置
 * @param {object} options - 可选参数
 * @param {Array} options.existingChapters - 现有章节数组
 * @param {Array} options.existingUnits - 现有单元数组
 * @param {string} options.mode - 模式：'smart-reorganize'|'ai-full-authority'|'cross-category'
 * @param {string} options.categoryPurpose - 分类目的（如"考研"、"计算机408"等）
 * @param {Array} options.skipChapterIds - 要略去的章节ID（这些章节下的卡片将被分配到新章节）
 * @param {Array} options.skipUnitIds - 要略去的单元ID（这些单元下的卡片将被分配到新单元）
 * @returns {Promise<{chapters: Array<{name: string, units: Array<{name: string}>}>}>}
 */
// 弱模型结构规划的批次大小限制
const WEAK_STRUCTURE_BATCH_SIZE = 20

export async function planStructure(cards, config, options = {}) {
  const { 
    existingChapters = [], 
    existingUnits = [], 
    mode = 'smart-reorganize', 
    categoryPurpose = '',
    skipChapterIds = [],    // 要略去的章节ID
    skipUnitIds = [],      // 要略去的单元ID
  } = options
  
  if (!cards || cards.length === 0) {
    throw new Error('没有卡片，无法规划结构')
  }
  
  if (!config || (!config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey)) {
    throw new Error('请先配置 AI API Key')
  }
  
  const cardCount = cards.length
  
  // 判断是否为弱模型（讯飞 Spark Lite）
  const isWeakSpark = config.aiServiceMode === 'iflytek-spark' && (!config.model || config.model === 'lite')
  
  // 构建卡片内容行
  const cardLines = cards.map((c, i) => {
    const kp = String(c.knowledge_point || c.front || '').slice(0, 120)
    return `卡${i}: ${kp}`
  })
  
  // 构建现有结构上下文
  let existingContext = ''
  
  // 构建略去章节/单元的映射（用于显示给AI）
  const skipChapterNames = new Set()
  const skipUnitNames = new Set()
  for (const ch of existingChapters || []) {
    if (skipChapterIds.includes(ch.id)) {
      skipChapterNames.add(ch.name)
    }
  }
  for (const u of existingUnits || []) {
    if (skipUnitIds.includes(u.id)) {
      skipUnitNames.add(u.name)
    }
  }
  
  if (existingChapters.length > 0) {
    const chLines = existingChapters.map((ch, i) => `【章节${i}】${ch.name}`)
    existingContext += `\n\n【现有章节】：\n${chLines.join('\n')}`
  }
  if (existingUnits.length > 0) {
    const unitLines = existingUnits.map((u, i) => `【单元${i}】${u.name}`)
    existingContext += `\n\n【现有单元】：\n${unitLines.join('\n')}`
  }
  
  // 添加略去章节/单元的提示
  let skipContext = ''
  if (skipChapterNames.size > 0 || skipUnitNames.size > 0) {
    skipContext = `
【自动略去说明】：
以下章节/单元将被自动略去（其下的卡片将重新分配到新结构中）：
${skipChapterNames.size > 0 ? `- 略去章节：${Array.from(skipChapterNames).join('、')}` : ''}
${skipUnitNames.size > 0 ? `- 略去单元：${Array.from(skipUnitNames).join('、')}` : ''}
`
  }
  
  // 根据模式设置新建限制（动态：根据卡片数量合理调整）
  let newStructureLimit = ''
  // 估算合理的章节/单元数量：根据平方根和比例，确保不会太紧
  const estChapters = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(cardCount / 4))))
  const estUnits = Math.max(3, Math.min(10, Math.ceil(cardCount / 5)))
  const perChapterUnits = Math.max(2, Math.min(5, Math.ceil(estUnits / estChapters)))
  if (mode === 'smart-reorganize') {
    newStructureLimit = `
【新建限制】：
- 新章节总数不超过 ${estChapters} 个
- 新单元总数不超过 ${estUnits} 个
- 每个章节包含 ${Math.max(2, Math.ceil(perChapterUnits / 2))}-${perChapterUnits} 个单元
- 优先在现有结构基础上调整，只有多张卡片形成明确新主题时才新建`
  } else if (mode === 'ai-full-authority') {
    newStructureLimit = `
【新建限制】：
- 新章节总数不超过 5 个
- 新单元总数不超过 10 个
- 可以完全重新规划分类结构`
  } else {
    newStructureLimit = `
【新建限制】：
- 新章节总数不超过 3 个
- 新单元总数不超过 5 个
- 在指定分类下创建/扩展结构`
  }
  
  // ===== 弱模型动态分批处理 =====
  // 当卡片数量超过批次大小时，自动分批处理
  if (isWeakSpark && cardCount > WEAK_STRUCTURE_BATCH_SIZE) {
    return planStructureWithBatches(cards, cardLines, existingContext, newStructureLimit, config, mode, cardCount, categoryPurpose, skipContext)
  }
  
  // 正常处理（强模型 或 弱模型但卡片数量在限制内）
  const prompt = buildPlanStructurePrompt(cardLines, existingContext, newStructureLimit, cardCount, mode, categoryPurpose, skipContext)

  try {
    const startTime = Date.now()
    const isSparkLite = config.aiServiceMode === 'iflytek-spark' && (!config.model || config.model === 'lite')
    const result = await callAiProvider(prompt, {
      ...config,
      temperature: 0.3,
      max_tokens: isSparkLite ? 8192 : 4096, // 讯飞Lite需要更多token空间
    })
    
    
    logAiCall({
      purpose: 'plan-structure',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })
    
    // 解析 AI 返回的 JSON
    const parsed = parsePlanStructureResult(result.content)
    
    if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      throw new Error('AI 返回的章节结构无效')
    }
    
    // 校验结构合理性
    const validation = validateStructurePlan(parsed, cardCount)
    
    if (!validation.valid) {
      console.warn('[planStructure] 结构校验失败:', validation.errors)
      // 尝试自动修正
      const fixed = fixStructurePlan(parsed, cardCount, mode)
      if (fixed) {
        return fixed
      }
      throw new Error('结构校验失败: ' + validation.errors.join('; '))
    }
    
    if (validation.warnings.length > 0) {
      console.warn('[planStructure] 结构校验警告:', validation.warnings)
    }
    
    return {
      chapters: parsed.chapters.map(ch => ({
        name: String(ch.name || '').trim().slice(0, 12),
        units: (ch.units || []).map(u => ({
          name: String(u.name || '').trim().slice(0, 16),
        })),
      })),
    }
    
  } catch (err) {
    logAiCall({
      purpose: 'plan-structure',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: prompt,
      response: '',
    })
    throw err
  }
}

/**
 * 解析结构规划结果（增强版：处理不完整的JSON）
 */
function parsePlanStructureResult(raw) {
  if (!raw) return null
  
  try {
    const trimmed = String(raw).trim()
    
    // 去除 markdown 代码块
    let jsonText = trimmed
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim()
    }
    
    // 尝试直接解析
    try {
      const parsed = JSON.parse(jsonText)
      if (parsed && typeof parsed === 'object' && (parsed.chapters || parsed.categories)) {
        return parsed
      }
    } catch (_) { /* continue */ }
    
    // 提取 JSON 对象（从第一个 { 到最后一个 }）
    const firstBracket = jsonText.indexOf('{')
    const lastBracket = jsonText.lastIndexOf('}')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const extracted = jsonText.slice(firstBracket, lastBracket + 1)
      
      // 尝试解析，如果失败则尝试修复不完整的JSON
      try {
        return JSON.parse(extracted)
      } catch (_) {
        // 尝试修复不完整的JSON（例如缺少 } 或 ]）
        const fixed = fixIncompleteJson(extracted)
        if (fixed) return fixed
      }
    }
  } catch (_) { /* ignore */ }

  return null
}

/**
 * 解析分组线性表格式的单元分配结果
 * 格式：每行一个单元，用 | 分隔三字段：单元名|概述|卡片索引(逗号分隔)
 * 示例：
 *   数制与编码|与计算机学科有关，与计算机基础知识章节有关|0,1,2
 *   网络协议基础|与计算机网络学科有关，与网络体系结构章节有关|3,4,5
 *
 * 优势：比JSON节省约60%输出token（去除重复key名和JSON标点）
 *
 * @param {string} raw - AI原始返回内容
 * @returns {{units: Array<{unitName: string, overview: string, cardIndices: number[]}>}|null}
 */
function parseLinearUnitResult(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    // 去除 markdown 代码块
    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    // 去除可能的前导说明文字（取第一个 | 所在行开始）
    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const units = []
    for (const line of lines) {
      // 用 | 分割，最多3段（概述中可能包含|，但按要求概述不应包含|）
      // 实际处理：按 | 分割，第一段是单元名，最后一段是卡片索引，中间所有是概述
      const parts = line.split('|')
      if (parts.length < 3) continue

      const unitName = parts[0].trim().slice(0, 16)
      // 中间所有部分合并为概述（处理概述中误含|的情况）
      const overview = parts.slice(1, -1).join('|').trim()
      const indicesStr = parts[parts.length - 1].trim()

      // 解析卡片索引（支持逗号、空格、顿号分隔）
      const cardIndices = indicesStr
        .split(/[,\s、]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0)

      if (unitName && cardIndices.length > 0) {
        units.push({ unitName, overview, cardIndices })
      }
    }

    if (units.length === 0) return null

    return { units }
  } catch (e) {
    console.warn('[parseLinearUnitResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析分组线性表格式的单元合并结果（Part2）
 * 格式：每行一个合并组，用 | 分隔三字段：合并后单元名|概述|源单元索引(逗号分隔)
 * 示例：
 *   计算机发展与分类|涵盖计算机发展历程、分类及未来发展趋势|13,14
 *   存储层次结构与存储器分类|涵盖存储体系层次、主存储器、辅助存储器|17,18,19
 *
 * @param {string} raw - AI原始返回内容
 * @returns {{mergeGroups: Array<{mergedUnitName: string, overview: string, sourceUnitIndices: number[]}>}|null}
 */
function parseLinearMergeResult(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    // 去除 markdown 代码块
    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    // 去除前导说明文字
    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const mergeGroups = []
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 3) continue

      const mergedUnitName = parts[0].trim().slice(0, 16)
      const overview = parts.slice(1, -1).join('|').trim()
      const indicesStr = parts[parts.length - 1].trim()

      const sourceUnitIndices = indicesStr
        .split(/[,\s、]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0)

      if (mergedUnitName && sourceUnitIndices.length > 0) {
        mergeGroups.push({ mergedUnitName, overview, sourceUnitIndices })
      }
    }

    if (mergeGroups.length === 0) return null

    return { mergeGroups }
  } catch (e) {
    console.warn('[parseLinearMergeResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析分组线性表格式的分类归属结果（Part3）
 * 格式：每行一个分类，用 | 分隔三字段：分类名|是否新建(new/existing)|单元索引(逗号分隔)
 * 示例：
 *   使用指南|existing|2,3,4,5,6,7,8,9
 *   计算机|existing|0,1,10,11,12,13,14,15,16
 *
 * @param {string} raw - AI原始返回内容
 * @returns {{categories: Array<{categoryName: string, isNew: boolean, unitIndices: number[]}>}|null}
 */
function parseLinearCategoryResult(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const categories = []
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 3) continue

      const categoryName = parts[0].trim().slice(0, 14)
      const isNewStr = parts[1].trim().toLowerCase()
      const isNew = isNewStr === 'new' || isNewStr === '新建' || isNewStr === 'true'
      const indicesStr = parts.slice(2).join('|').trim()

      const unitIndices = indicesStr
        .split(/[,\s、]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0)

      if (categoryName && unitIndices.length > 0) {
        categories.push({ categoryName, isNew, unitIndices })
      }
    }

    if (categories.length === 0) return null

    return { categories }
  } catch (e) {
    console.warn('[parseLinearCategoryResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析分组线性表格式的章节创建结果（Part4）
 * 格式：第一行可选 PURPOSE|分类目的，后续每行一个章节：章节名|单元索引(逗号分隔)
 * 示例：
 *   PURPOSE|帮助用户快速掌握软件的核心功能与操作流程
 *   基础入门|3
 *   智能录入|1,2
 *   学习与检测|5,7
 *
 * @param {string} raw - AI原始返回内容
 * @returns {{categoryPurpose: string, chapters: Array<{chapterName: string, unitIndices: number[]}>}|null}
 */
function parseLinearChapterResult(raw) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    let categoryPurpose = ''
    const chapters = []

    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 2) continue

      const firstField = parts[0].trim()

      // PURPOSE 行：分类目的
      if (firstField.toUpperCase() === 'PURPOSE' || firstField === '分类目的') {
        categoryPurpose = parts.slice(1).join('|').trim()
        continue
      }

      // 章节行：章节名|单元索引
      const chapterName = firstField.slice(0, 12)
      const indicesStr = parts.slice(1).join('|').trim()
      const unitIndices = indicesStr
        .split(/[,\s、]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0)

      if (chapterName && unitIndices.length > 0) {
        chapters.push({ chapterName, unitIndices })
      }
    }

    if (chapters.length === 0) return null

    return { categoryPurpose, chapters }
  } catch (e) {
    console.warn('[parseLinearChapterResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 解析分组线性表格式的卡片归类结果（路径F默认路径）
 * 支持3种深度模式：chapter-and-unit / chapter-only / unit-only
 *
 * 格式：每行一张卡片，用 | 分隔字段
 *   第1字段：cardIndex（卡片索引）
 *   第2字段：E(existing) 或 N(new)
 *   后续字段根据深度模式和E/N不同：
 *
 * chapter-and-unit 模式：
 *   existing: cardIndex|E|chapterIndex|unitIndex
 *   new:      cardIndex|N|newChapterName|newUnitName
 *   示例:
 *     0|E|0|1
 *     1|N|新章节名|新单元名
 *
 * chapter-only 模式：
 *   existing: cardIndex|E|chapterIndex
 *   new:      cardIndex|N|newChapterName|newUnitName
 *   示例:
 *     0|E|0
 *     1|N|新章节名|新单元名
 *
 * unit-only 模式：
 *   existing: cardIndex|E|unitIndex
 *   new:      cardIndex|N|newUnitName
 *   示例:
 *     0|E|0
 *     1|N|新单元名
 *
 * @param {string} raw - AI原始返回内容
 * @param {string} depth - 深度模式: 'chapter-and-unit' | 'chapter-only' | 'unit-only'
 * @returns {Array|null} 归类结果数组（与原JSON数组结构一致）
 */
function parseLinearCardAssignResult(raw, depth) {
  if (!raw) return null

  try {
    let text = String(raw).trim()

    // 去除 markdown 代码块
    const fenceMatch = text.match(/```(?:\w*)\s*([\s\S]*?)\s*```/)
    if (fenceMatch) {
      text = fenceMatch[1].trim()
    }

    // 去除前导说明文字（从第一个含 | 的行开始）
    const firstPipeLine = text.split('\n').findIndex(line => line.includes('|'))
    if (firstPipeLine > 0) {
      text = text.split('\n').slice(firstPipeLine).join('\n')
    }

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('|'))

    if (lines.length === 0) return null

    const results = []
    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 2) continue

      const cardIndex = parseInt(parts[0].trim(), 10)
      if (isNaN(cardIndex) || cardIndex < 0) continue

      const typeStr = parts[1].trim().toUpperCase()
      const isNew = typeStr === 'N' || typeStr === 'NEW'

      if (isNew) {
        // 新建单元/章节
        if (depth === 'unit-only') {
          // cardIndex|N|newUnitName
          const newUnitName = (parts[2] || '').trim().slice(0, 16)
          if (newUnitName) {
            results.push({ cardIndex, assignType: 'new', unitIndex: null, newUnitName })
          }
        } else {
          // chapter-and-unit 或 chapter-only
          // cardIndex|N|newChapterName|newUnitName
          const newChapterName = (parts[2] || '').trim().slice(0, 12)
          const newUnitName = (parts[3] || '').trim().slice(0, 16)
          if (newChapterName && newUnitName) {
            const item = { cardIndex, assignType: 'new', chapterIndex: null, newChapterName, newUnitName }
            if (depth === 'chapter-and-unit') {
              item.unitIndex = null
            }
            results.push(item)
          }
        }
      } else {
        // 归入现有
        if (depth === 'unit-only') {
          // cardIndex|E|unitIndex
          const unitIndex = parseInt((parts[2] || '').trim(), 10)
          if (!isNaN(unitIndex) && unitIndex >= 0) {
            results.push({ cardIndex, assignType: 'existing', unitIndex })
          }
        } else if (depth === 'chapter-only') {
          // cardIndex|E|chapterIndex
          const chapterIndex = parseInt((parts[2] || '').trim(), 10)
          if (!isNaN(chapterIndex) && chapterIndex >= 0) {
            results.push({ cardIndex, assignType: 'existing', chapterIndex })
          }
        } else {
          // chapter-and-unit
          // cardIndex|E|chapterIndex|unitIndex
          const chapterIndex = parseInt((parts[2] || '').trim(), 10)
          const unitIndex = parseInt((parts[3] || '').trim(), 10)
          if (!isNaN(chapterIndex) && chapterIndex >= 0 && !isNaN(unitIndex) && unitIndex >= 0) {
            results.push({ cardIndex, assignType: 'existing', chapterIndex, unitIndex })
          }
        }
      }
    }

    if (results.length === 0) return null

    return results
  } catch (e) {
    console.warn('[parseLinearCardAssignResult] 解析失败:', e.message)
    return null
  }
}

/**
 * 尝试修复不完整的JSON
 */
function fixIncompleteJson(jsonStr) {
  try {
    // 尝试补全缺少的闭合括号
    let fixed = jsonStr
    
    // 统计括号匹配
    const braces = { '{': 0, '}': 0, '[': 0, ']': 0 }
    for (const char of fixed) {
      if (char === '{') braces['{']++
      else if (char === '}') braces['}']++
      else if (char === '[') braces['[']++
      else if (char === ']') braces[']']++
    }
    
    // 补全缺失的闭合括号
    while (braces['}'] < braces['{']) {
      fixed += '}'
      braces['}']++
    }
    while (braces[']'] < braces['[']) {
      fixed += ']'
      braces[']']++
    }
    
    const parsed = JSON.parse(fixed)
    
    // 验证结构完整性（支持 chapters 或 categories 两种结构）
    if (parsed && parsed.chapters && Array.isArray(parsed.chapters)) {
      // 确保每个章节都有 units 数组
      for (const ch of parsed.chapters) {
        if (!ch.units) {
          ch.units = []
        }
      }
      return parsed
    }
    if (parsed && parsed.categories && Array.isArray(parsed.categories)) {
      // 确保每个分类都有 chapters 数组，每个章节都有 units 数组
      for (const cat of parsed.categories) {
        if (!cat.chapters) cat.chapters = []
        for (const ch of cat.chapters) {
          if (!ch.units) ch.units = []
        }
      }
      return parsed
    }
  } catch (_) { /* 修复失败 */ }
  
  return null
}

/**
 * 跨分类结构规划：一次性让 AI 决定 categories→chapters→units 结构
 * @param {Array} cards - 所有待归类卡片
 * @param {object} config - AI 配置
 * @param {object} options - 可选参数
 * @param {string} options.categoryPurpose - 分类目的
 * @param {string} options.classificationDepth - 分类深度
 * @returns {Promise<{categories: Array<{name: string, chapters: Array<{name: string, units: Array<{name: string}>}>}>}>}
 */
async function planCrossCategoryStructure(cards, config, options = {}) {
  const { categoryPurpose = '', existingStructureTree = null } = options

  if (!cards || cards.length === 0) {
    throw new Error('没有卡片，无法规划跨分类结构')
  }

  if (!config || (!config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey)) {
    throw new Error('请先配置 AI API Key')
  }

  const cardCount = cards.length
  const isSparkLite = config.aiServiceMode === 'iflytek-spark' && (!config.model || config.model === 'lite')

  // 构建卡片内容行
  const cardLines = cards.map((c, i) => {
    const kp = String(c.knowledge_point || c.front || '').slice(0, 120)
    return `卡${i}: ${kp}`
  }).join('\n')

  const purposeContext = categoryPurpose
    ? `\n\n【学习目的】本分类的学习目的为：${categoryPurpose}。请据此规划合理的分类、章节和单元结构，确保知识点组织符合该学习场景。`
    : ''

  // [fix-已有结构优先复用] 构建已有分类→章节→单元三级结构上下文
  const hasExistingStructure = existingStructureTree && existingStructureTree.categories && existingStructureTree.categories.length > 0
  let existingStructureContext = ''
  let existingStructureRule = ''

  if (hasExistingStructure) {
    // 构建已有结构的文本表示
    const structureText = existingStructureTree.categories.map((cat, ci) => {
      const chaptersText = (cat.chapters || []).map((ch, chi) => {
        const unitsText = (ch.units || []).map((u, ui) => {
          const samples = u.samples && u.samples.length > 0 ? `（示例：${u.samples.join(' / ')}）` : ''
          return `    - 单元${ci+1}-${chi+1}-${ui+1}：${u.name}（${u.cardCount}张）${samples}`
        }).join('\n')
        return `  章节${ci+1}-${chi+1}：${ch.name}\n${unitsText}`
      }).join('\n')
      return `分类${ci+1}：${cat.name}（共${cat.cardCount}张）\n${chaptersText}`
    }).join('\n\n')

    existingStructureContext = `\n\n【用户已有分类结构（必须优先复用）】：
${structureText}

【三级复用优先级（必须遵守）】：
1. 最优：将卡片归入已有分类的已有章节/已有单元（名称必须完全一致）
2. 次优：在已有分类下新建章节或单元（仅当已有单元不适合时）
3. 最后：只有当卡片明显不属于任何已有分类时，才新建分类（最多新建2个）
4. 严禁新建与已有分类相似的分类（如已有"计算机"则不得新建"计算机基础"）

【空分类处理规则（必须遵守）】：
- 卡片数为0的分类是用户主动创建的空分类，等待填充内容
- 必须优先将相关卡片归入空分类，在该分类下新建章节和单元
- 例如：已有空分类"计算机"，所有计算机相关卡片必须归入"计算机"分类，在其下新建"计算机基础知识"等章节
- 严禁将空分类忽略或新建相似分类替代`

    existingStructureRule = `1. 必须优先复用用户已有分类/章节/单元，只有不属于任何已有结构时才新建。`
  } else {
    existingStructureRule = `1. 你可以创建新分类、新章节和新单元，不需要受原分类限制。`
  }

  const prompt = `你是考研速记卡片的知识体系架构助手。请对以下卡片进行"跨分类 AI 全权归类"，重新规划分类、章节、单元三级结构。${purposeContext}${existingStructureContext}

【层级定义（必须遵守）】：
- 分类（最高层级）：代表一个完整的学科或领域名称，如"计算机"、"中药学"、"高等数学"“计算机网络”等
- 章节（中间层级）：代表学科下的子领域或知识模块，如"计算机基础知识"、"计算机硬件基础"是"计算机"分类下的章节
- 单元（最细层级）：代表章节下的具体主题，如"数制与编码"是"计算机基础知识"章节下的单元

【分类命名规则（必须遵守）】：
1. 分类名必须是学科名称，不得包含"基础"、"概论"、"原理"等修饰词
2. 正确分类名示例：计算机、中药学、高等数学、操作系统、计算机网络
3. 错误分类名示例：计算机基础知识（应为章节）、中药学概论（应为章节）、计算机硬件基础（应为章节）
4. 如果卡片内容是某个学科的子领域，必须将该子领域作为章节归入对应学科分类

【关键示例（正反对比）】：
  正确：分类"计算机" → 章节"计算机基础知识" → 单元"数制与编码"
  错误：分类"计算机基础知识"（粒度太细，应为章节而非分类）
  ...

【关键要求】：
${existingStructureRule}
2. 若有可合并的分类，章节，单元，且合并后依旧符合要求的分类，章节，单元则合并。
3. 每个分类下可有多个章节，每个章节下可有多个单元。
4. 分类名不超过 14 个字，章节名不超过 12 个字，单元名不超过 16 个字。
5. 优先按照知识体系组织，不要按输入顺序机械分组。
6. 分类必须是最高层级的学科/领域，不得将子领域作为分类。

【关联性判断（必须遵守）】：
1. 分析卡片之间的语义关联：内容相关的卡片应归入同一单元
2. 分析卡片与分类的关联：每张卡片应归入最匹配的分类
3. 无关联的卡片不要强行归在一起，应放入不同分类
4. 关联度高的卡片必须归入同一单元，不得拆分
5. 同一学科的不同子领域必须归入同一分类（如"计算机基础"和"计算机硬件"都归入"计算机"分类）

【待归类卡片（共 ${cardCount} 张）】：
${cardLines}

【输出格式】请严格返回 JSON 对象，不要额外文字、不要代码块：
{
  "categories": [
    {
      "name": "分类名称",
      "chapters": [
        {
          "name": "章节名称",
          "units": [
            { "name": "单元名称" }
          ]
        }
      ]
    }
  ]
}`

  try {
    const startTime = Date.now()
    const result = await callAiProvider(prompt, {
      ...config,
      temperature: 0.3,
      // [fix-已有结构优先复用] 有已有结构时 prompt 更长，增大 max_tokens
      max_tokens: isSparkLite ? 8192 : (hasExistingStructure ? 8192 : 4096),
    })


    logAiCall({
      purpose: 'plan-cross-category-structure',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })

    // 解析 AI 返回的 JSON
    const parsed = parsePlanStructureResult(result.content)

    if (!parsed || !Array.isArray(parsed.categories) || parsed.categories.length === 0) {
      throw new Error('AI 返回的跨分类结构无效')
    }


    // 校验和规范化结构
    // [fix-章节层级丢失] 如果 AI 返回的分类没有 chapters 但有 units，自动创建默认章节
    const categories = parsed.categories.map(cat => {
      let chapters = (cat.chapters || []).map(ch => ({
        name: String(ch.name || '').trim().slice(0, 12),
        units: (ch.units || []).map(u => ({
          name: String(u.name || '').trim().slice(0, 16),
        })).filter(u => u.name),
      })).filter(ch => ch.name && ch.units.length > 0)

      // [fix-章节层级丢失] 如果没有 chapters 但有 units，将 units 归入默认章节
      if (chapters.length === 0 && Array.isArray(cat.units) && cat.units.length > 0) {
        const defaultUnits = cat.units.map(u => ({
          name: String(u.name || '').trim().slice(0, 16),
        })).filter(u => u.name)
        if (defaultUnits.length > 0) {
          chapters = [{ name: '默认章节', units: defaultUnits }]
        }
      }

      return {
        name: String(cat.name || '').trim().slice(0, 14),
        chapters,
      }
    }).filter(cat => cat.name && cat.chapters.length > 0)

    if (categories.length === 0) {
      throw new Error('AI 返回的跨分类结构为空')
    }


    return { categories }

  } catch (err) {
    logAiCall({
      purpose: 'plan-cross-category-structure',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: prompt,
      response: '',
    })
    throw err
  }
}

/**
 * 校验结构规划结果
 * @param {object} parsed - 解析后的结果
 * @param {number} cardCount - 卡片总数
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateStructurePlan(parsed, cardCount) {
  const errors = []
  const warnings = []
  
  if (!parsed || !Array.isArray(parsed.chapters)) {
    return { valid: false, errors: ['缺少 chapters 数组'], warnings: [] }
  }
  
  const chapterCount = parsed.chapters.length
  
  // 章节数量校验
  if (chapterCount < 1) {
    errors.push('章节数量不能为 0')
  }
  // [fix-P2-1] 放宽校验：章节数量过多从 error 降级为 warning，由 fixStructurePlan 截断处理
  if (chapterCount > 10) {
    warnings.push(`章节数量较多: ${chapterCount} > 10，将自动截断`)
  }
  
  // 禁止模式
  const forbiddenPatterns = [
    /^第[一二三四五六七八九十\d]+[天章节部分]/,
    /^单元\d+$/,
    /^第\d+天/,
  ]
  
  for (let i = 0; i < parsed.chapters.length; i++) {
    const chapter = parsed.chapters[i]
    const chName = String(chapter?.name || '').trim()
    
    // 章节名称校验
    if (!chName) {
      errors.push(`章节${i}名称为空`)
    } else {
      if (chName.length > 12) {
        warnings.push(`章节"${chName}"名称超过 12 字，将自动截断`)
      }
      // [fix-P2-1] 禁止模式从 error 降级为 warning，由 fixStructurePlan 重命名处理
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(chName)) {
          warnings.push(`章节"${chName}"使用了模板化命名，将自动重命名`)
        }
      }
    }
    
    // 单元数量校验
    const units = chapter?.units || []
    if (units.length < 2) {
      warnings.push(`章节"${chName}"单元数量少于 2，将自动补充`)
    }
    // [fix-P2-1] 单元数量过多从 error 降级为 warning，由 fixStructurePlan 截断处理
    if (units.length > 10) {
      warnings.push(`章节"${chName}"单元数量超过 10，将自动截断`)
    }
    
    for (let j = 0; j < units.length; j++) {
      const unit = units[j]
      const uName = String(unit?.name || '').trim()
      
      if (!uName) {
        errors.push(`章节"${chName}"的单元${j}名称为空`)
      } else {
        if (uName.length > 16) {
          warnings.push(`单元"${uName}"名称超过 16 字，将自动截断`)
        }
        // [fix-P2-1] 禁止模式从 error 降级为 warning
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(uName)) {
            warnings.push(`单元"${uName}"使用了模板化命名，将自动重命名`)
          }
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 修正结构规划结果
 * 增强版：1) 单元数<2补充默认单元 2) 章节过多时强制合并 3) 章节过少时保留
 * 4) [fix-P2-2] 单元数过多时基于主题分组合并
 */
function fixStructurePlan(parsed, cardCount, mode) {
  if (!parsed || !Array.isArray(parsed.chapters)) {
    return null
  }
  
  try {
    const fixedChapters = []
    
    for (const chapter of parsed.chapters) {
      const chName = String(chapter?.name || '').trim().slice(0, 12)
      if (!chName) continue
      
      const units = (chapter?.units || [])
        .map(u => String(u?.name || '').trim().slice(0, 16))
        .filter(name => name && name.length >= 2)
      
      if (units.length === 0) {
        // 无单元，跳过该章节
        continue
      } else if (units.length < 2) {
        // 单元数少于2，补充默认单元而非丢弃
        units.push('扩展知识')
        fixedChapters.push({ name: chName, units })
      } else {
        fixedChapters.push({ name: chName, units })
      }
    }
    
    // 确保至少有一个章节
    if (fixedChapters.length === 0) {
      fixedChapters.push({ name: '综合知识', units: [{ name: '基础知识' }] })
    }
    
    // 如果只有1个章节且单元数>=2，直接返回
    if (fixedChapters.length === 1) {
      return { chapters: fixedChapters }
    }
    
    // ===== [fix-P2-2] 单元数过多时基于主题分组合并 =====
    const allUnits = []
    for (const ch of fixedChapters) {
      for (const u of ch.units) {
        allUnits.push({ name: u, chapterName: ch.name })
      }
    }

    let maxUnits = 4
    if (cardCount > 50) maxUnits = 6
    else if (cardCount > 30) maxUnits = 5
    else maxUnits = 4

    if (allUnits.length > maxUnits) {

      // 第一轮：基于主题分组关键词合并
      const groupedUnits = new Map()
      const ungroupedUnits = []

      for (const u of allUnits) {
        const group = getUnitTopicGroup(u.name)
        if (group) {
          if (!groupedUnits.has(group)) {
            groupedUnits.set(group, { name: group, chapterName: u.chapterName })
          }
        } else {
          ungroupedUnits.push(u)
        }
      }

      const newUnits = []
      for (const info of groupedUnits.values()) {
        newUnits.push({ name: info.name, chapterName: info.chapterName })
      }
      newUnits.push(...ungroupedUnits)


      // 第二轮：基于语义相似度合并
      if (newUnits.length > maxUnits) {
        const finalUnits = []
        for (const u of newUnits) {
          const existing = finalUnits.find(mu =>
            simpleTextSimilarity(mu.name, u.name) >= 0.15 ||
            mu.name.includes(u.name) || u.name.includes(mu.name) ||
            shareCommonKeyword(mu.name, u.name)
          )
          if (!existing) {
            finalUnits.push({ ...u })
          }
        }
        newUnits.length = 0
        newUnits.push(...finalUnits)
      }

      // 如果仍超过上限，强制截断
      if (newUnits.length > maxUnits) {
        newUnits.splice(maxUnits)
      }

      // 重新组织章节结构
      const chapterMap = new Map()
      for (const u of newUnits) {
        if (!chapterMap.has(u.chapterName)) {
          chapterMap.set(u.chapterName, [])
        }
        chapterMap.get(u.chapterName).push(u.name)
      }

      fixedChapters.length = 0
      for (const [name, units] of chapterMap) {
        fixedChapters.push({ name, units })
      }
    }
    
    // ===== 根据卡片数量计算合理章节数量上限 =====
    let maxChapters = 5
    if (cardCount > 50) maxChapters = 8
    else if (cardCount > 30) maxChapters = 5
    else if (cardCount > 15) maxChapters = 4
    else maxChapters = 3
    
    // 如果章节超过上限，合并相似章节
    if (fixedChapters.length > maxChapters) {
      const merged = mergeSimilarChapters(fixedChapters, maxChapters)
      return { chapters: merged }
    }
    
    return { chapters: fixedChapters }
    
  } catch (err) {
    console.warn('[fixStructurePlan] 修正失败:', err)
    return null
  }
}

/**
 * 合并相似章节（增强版）
 * 1. 优先按语义相似度合并
 * 2. 相似度不足时，按章节单元数排序，合并单元数最少的章节
 * 3. 合并后单元去重
 */
function mergeSimilarChapters(chapters, targetCount) {
  const result = [...chapters]
  
  while (result.length > targetCount) {
    let bestPair = null
    let bestScore = 0
    
    // 第一步：查找语义最相似的章节对
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const score = simpleTextSimilarity(result[i].name, result[j].name)
        // 包含关系也视为相似
        const containsRelation = result[i].name.includes(result[j].name) || result[j].name.includes(result[i].name)
        const effectiveScore = containsRelation ? Math.max(score, 0.5) : score
        if (effectiveScore > bestScore) {
          bestScore = effectiveScore
          bestPair = [i, j]
        }
      }
    }
    
    if (bestPair && bestScore >= 0.2) {
      // 合并相似章节
      const [i, j] = bestPair
      const mergedUnits = [...result[i].units, ...result[j].units]
      // 单元去重（按名称相似度）
      const dedupedUnits = deduplicateUnits(mergedUnits)
      // 选择更概括的名称（更短的）
      const mergedName = result[i].name.length <= result[j].name.length ? result[i].name : result[j].name
      result.splice(j, 1)
      result[i] = { name: mergedName, units: dedupedUnits }
    } else {
      // 第二步：没有相似章节时，合并单元数最少的两个章节
      // 按单元数升序排序，合并最少的两个
      result.sort((a, b) => a.units.length - b.units.length)
      const first = result[0]
      const second = result[1]
      const mergedUnits = deduplicateUnits([...first.units, ...second.units])
      // 合并名称
      const mergedName = first.units.length <= second.units.length ? first.name : second.name
      result.splice(1, 1)
      result[0] = { name: mergedName, units: mergedUnits }
    }
  }
  
  return result
}

/**
 * 单元去重（按名称相似度）
 */
function deduplicateUnits(units) {
  const result = []
  for (const u of units) {
    const existing = result.find(ru => 
      simpleTextSimilarity(ru.name, u.name) >= 0.4 || 
      ru.name.includes(u.name) || 
      u.name.includes(ru.name)
    )
    if (existing) {
      // 合并卡片索引
      if (Array.isArray(u.cardIndices)) {
        if (!Array.isArray(existing.cardIndices)) existing.cardIndices = []
        for (const idx of u.cardIndices) {
          if (!existing.cardIndices.includes(idx)) {
            existing.cardIndices.push(idx)
          }
        }
      }
    } else {
      result.push({ ...u })
    }
  }
  return result
}

/**
 * 第二步：卡片分配 (assignCards)
 * 
 * 功能：
 * - 按第一步确定的结构构建分类上下文
 * - 卡片数量 > 阈值时按单元分批（每批 ≤ 30 张）
 * - 每批调用 AI 分配卡片到单元
 * - 合并各批结果
 * 
 * @param {Array} cards - 卡片数组
 * @param {object} structure - planStructure 返回的结构 { chapters: [{ name, units: [{ name }] }] }
 * @param {object} config - AI 配置
 * @param {object} options - 可选参数
 * @returns {Promise<{chapters: Array<{name: string, units: Array<{name: string, cards: Array}>}>}>}
 */
export async function assignCards(cards, structure, config, options = {}) {
  const { batchSize = 30, categoryPurpose = '' } = options
  
  if (!cards || cards.length === 0) {
    throw new Error('没有卡片，无法分配')
  }
  
  if (!structure || !Array.isArray(structure.chapters) || structure.chapters.length === 0) {
    throw new Error('结构方案无效')
  }
  
  if (!config || (!config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey)) {
    throw new Error('请先配置 AI API Key')
  }
  
  const cardCount = cards.length
  const structurePlan = structure.chapters
  
  // 构建结构上下文（用于卡片分配 Prompt）
  const structureContext = structurePlan.map((ch, chi) => {
    const units = (ch.units || []).map((u, ui) => `  - 单元${ui}：${u.name}`).join('\n')
    return `【章节${chi}】${ch.name}\n${units}`
  }).join('\n')
  
  // 构建卡片行
  const cardLines = cards.map((c, i) => {
    const kp = String(c.knowledge_point || c.front || '').slice(0, 100)
    return `${i}|${kp}`
  })
  
  // 判断是否需要分批
  if (cardCount <= batchSize) {
    // 小数据量：一次性分配
    return assignCardsSingleBatch(cards, structurePlan, structureContext, cardLines, config, null, categoryPurpose)
  }
  
  // 大数据量：分批处理
  // 策略：按单元分批，每个单元一批（每批 ≤ 30 张）
  const results = []

  // 将卡片分成批次（每批 batchSize 张）
  // 注意：cardLines 使用批次内 0-based 索引，与 prompt 中"cardIndex 是输入列表下标（从 0 开始）"一致
  const batches = []
  for (let i = 0; i < cardCount; i += batchSize) {
    const batchCards = []
    const batchIndices = []
    let localIdx = 0
    for (let j = i; j < Math.min(i + batchSize, cardCount); j++) {
      const kp = String(cards[j].knowledge_point || cards[j].front || '').slice(0, 100)
      batchCards.push(`${localIdx}|${kp}`)
      batchIndices.push(j)
      localIdx++
    }
    batches.push({ cards: batchCards, indices: batchIndices })
  }
  
  // 处理每一批
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    
    try {
      const batchResult = await assignCardsSingleBatch(
        cards,
        structurePlan,
        structureContext,
        batch.cards,
        config,
        batch.indices,
        categoryPurpose
      )
      
      // 合并结果
      for (const ch of batchResult.chapters) {
        const existingCh = results.find(r => r.name === ch.name)
        if (existingCh) {
          for (const u of ch.units) {
            const existingUnit = existingCh.units.find(eu => eu.name === u.name)
            if (existingUnit) {
              existingUnit.cards.push(...u.cards)
            } else {
              existingCh.units.push(u)
            }
          }
        } else {
          results.push(ch)
        }
      }
      
    } catch (err) {
      console.warn(`[assignCards] 批次 ${batchIdx + 1} 处理失败:`, err.message)
      // 批次失败时，使用简单的本地分配作为降级
      const fallbackAssign = localFallbackAssign(batch.indices, structurePlan, cards)
      results.push(...fallbackAssign.chapters)
      // 校验降级覆盖情况
      const fallbackCardCount = fallbackAssign.chapters.reduce((sum, ch) =>
        sum + (ch.units || []).reduce((s, u) => s + (u.cards?.length || 0), 0), 0)
      if (fallbackCardCount < batch.indices.length) {
        console.warn(`[assignCards] 批次 ${batchIdx + 1} 降级后仍有 ${batch.indices.length - fallbackCardCount} 张卡片未覆盖`)
      }
    }
  }
  
  // 校验分配结果
  const validation = validateAssignmentResult(results, cardCount)
  
  if (!validation.valid) {
    console.warn('[assignCards] 分配校验失败:', validation.errors)
    // 执行二次修正
    const fixed = fixAssignmentResult(results, cardCount, structurePlan)
    return fixed
  }
  
  return { chapters: results }
}

/**
 * 单批次卡片分配
 */
async function assignCardsSingleBatch(cards, structurePlan, structureContext, cardLines, config, globalIndices = null, categoryPurpose = '') {
  const indices = globalIndices || cardLines.map((_, i) => i)

  const purposeContext = categoryPurpose ? `\n\n【学习目的】本分类的学习目的为：${categoryPurpose}。请据此调整卡片分配，确保知识点组织符合该学习场景。` : ''
  const prompt = `你是考研速记卡片的分类助手。请将以下卡片分配到已规划好的章节和单元中。${purposeContext}

【核心原则 - 聚类优先】（最重要！）：
1. 同一主题的知识点必须集中归入同一个单元，禁止分散到多个单元
2. 禁止将卡片均匀分发到各单元！单元卡片数应反映实际主题分布
3. 允许某些单元为空（0张卡片），如果没有匹配的知识点

【分配策略】（必须按此顺序执行）：
步骤1：先按知识点主题将卡片分组（如：所有"排序"相关的卡→一组，所有"图"相关的卡→一组）
步骤2：再将每组卡片整体分配到最匹配的单元
步骤3：检查同一主题的卡片是否全部在同一个单元，如有分散则合并

【示例】：
正确做法：10张"排序"卡片 → 全部归入"排序算法"单元
错误做法：10张"排序"卡片 → 3张归入"排序算法"，3张归入"查找算法"，4张归入"其他"（禁止！）

${CARD_ASSIGNMENT_RULES}

【已规划的结构】：
${structureContext}

【待分配卡片】：
${cardLines.join('\n')}

【输出格式】请严格以 JSON 数组格式返回，不要额外文字、不要代码块：
[
  { "cardIndex": 0, "chapterIndex": 0, "unitIndex": 0 },
  { "cardIndex": 1, "chapterIndex": 0, "unitIndex": 1 },
  { "cardIndex": 2, "chapterIndex": 1, "unitIndex": 0 }
]

注意：cardIndex 是卡片在输入列表中的下标（从 0 开始）。`

  try {
    const startTime = Date.now()
    // 动态 max_tokens：每张卡片约需 50 token，最低 2048
    const dynamicMaxTokens = Math.max(2048, Math.ceil(indices.length * 80))

    // 计算总单元数（用于分散度验证）
    const totalUnits = structurePlan.reduce((sum, ch) => sum + (ch.units?.length || 0), 0)
    // 分散度阈值：每批卡片至少分散到 min(3, totalUnits) 个不同单元
    const minDistinctUnits = Math.min(3, totalUnits)

    let parsed = null
    const MAX_RETRIES = 3

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await callAiProvider(prompt, {
        ...config,
        temperature: 0.3,
        max_tokens: dynamicMaxTokens,
      })

      logAiCall({
        purpose: 'assign-cards',
        modelName: getModelName(config.aiServiceMode, config.model),
        durationMs: Date.now() - startTime,
        status: 'success',
        tokens: result.tokens,
        prompt: prompt,
        response: result.content,
      })

      // 解析分配结果
      parsed = parseAssignCardsResult(result.content, indices.length)

      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        console.warn(`[assignCardsSingleBatch] 第 ${attempt + 1} 次尝试: AI 返回的分配结果无效`)
        parsed = null
        continue
      }

      // 分散度验证：检查卡片是否分散到足够多的不同单元
      const unitSet = new Set()
      for (const item of parsed) {
        const chapterIdx = Number(item.chapterIndex)
        const unitIdx = Number(item.unitIndex)
        if (chapterIdx >= 0 && chapterIdx < structurePlan.length &&
            unitIdx >= 0 && unitIdx < (structurePlan[chapterIdx].units?.length || 0)) {
          unitSet.add(`${chapterIdx}-${unitIdx}`)
        }
      }

      if (unitSet.size >= minDistinctUnits || attempt === MAX_RETRIES - 1) {
        if (unitSet.size < minDistinctUnits) {
          console.warn(`[assignCardsSingleBatch] 分散度不足: ${unitSet.size}/${minDistinctUnits} 个单元 (重试 ${attempt + 1} 次后仍不满足，使用当前结果)`)
        } else {
        }
        break
      } else {
        console.warn(`[assignCardsSingleBatch] 第 ${attempt + 1} 次尝试分散度不足: ${unitSet.size}/${minDistinctUnits} 个单元，重试...`)
        parsed = null
      }
    }

    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('AI 返回的分配结果无效（重试后仍失败）')
    }

    // 构建分配结果
    const chapterResults = structurePlan.map((ch, chi) => ({
      name: ch.name,
      chapterId: ch.chapterId || null,  // [fix-P1] 继承 chapterId
      units: (ch.units || []).map((u, ui) => ({
        name: u.name,
        unitId: u.unitId || null,  // [fix-P1] 继承 unitId
        cards: [],
      })),
    }))

    // 填充卡片
    for (const item of parsed) {
      const cardIdx = Number(item.cardIndex)
      const chapterIdx = Number(item.chapterIndex)
      const unitIdx = Number(item.unitIndex)

      if (cardIdx >= 0 && cardIdx < indices.length &&
          chapterIdx >= 0 && chapterIdx < chapterResults.length &&
          unitIdx >= 0 && unitIdx < chapterResults[chapterIdx].units.length) {
        const globalIdx = indices[cardIdx]
        chapterResults[chapterIdx].units[unitIdx].cards.push(cards[globalIdx])
      }
    }

    return { chapters: chapterResults }

  } catch (err) {
    logAiCall({
      purpose: 'assign-cards',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: prompt,
      response: '',
    })
    throw err
  }
}

/**
 * [fix-P1-8] 检查跨分类结构一致性
 * 比较 planCrossCategoryStructure 的规划结果与 assignCardsCrossCategory 的 AI 返回结果
 * @param {Array} planCategories - plan 阶段的结构
 * @param {Array} aiCategories - assign 阶段 AI 返回的结构
 * @returns {{consistent: boolean, reason: string}}
 */
function checkCrossCategoryStructureConsistency(planCategories, aiCategories) {
  if (!Array.isArray(planCategories) || !Array.isArray(aiCategories)) {
    return { consistent: false, reason: '结构非数组' }
  }
  // 分类数量差异过大（>2）视为不一致
  if (Math.abs(planCategories.length - aiCategories.length) > 2) {
    return { consistent: false, reason: `分类数量差异过大: plan=${planCategories.length}, ai=${aiCategories.length}` }
  }
  // 检查分类名称匹配率
  const planNames = new Set(planCategories.map(c => String(c.name || '').trim()))
  const aiNames = aiCategories.map(c => String(c.name || '').trim())
  const matchedCount = aiNames.filter(n => planNames.has(n)).length
  const matchRate = aiCategories.length > 0 ? matchedCount / aiCategories.length : 0
  if (matchRate < 0.5) {
    return { consistent: false, reason: `分类名称匹配率过低: ${matchRate.toFixed(2)} (${matchedCount}/${aiCategories.length})` }
  }
  return { consistent: true, reason: '结构一致' }
}

/**
 * [fix-P1-8] 将 AI 返回的卡片分配映射到 plan 结构上
 * 当 AI 返回的结构与 plan 不一致时，使用 plan 结构作为模板，按名称匹配重新分配卡片
 * @param {Array} aiCategories - AI 返回的结构（含 cardIndices）
 * @param {Array} planCategories - plan 阶段的结构（模板）
 * @param {Array} cards - 原始卡片数组
 * @returns {Array|null} 映射后的 categories，失败返回 null
 */
function remapCardsToPlanStructure(aiCategories, planCategories, cards) {
  try {
    if (!Array.isArray(aiCategories) || !Array.isArray(planCategories) || !Array.isArray(cards)) {
      return null
    }
    // 收集 AI 返回的所有 cardIndices → card 映射
    const cardIndexToCard = new Map()
    for (const cat of aiCategories) {
      for (const ch of (cat.chapters || [])) {
        for (const u of (ch.units || [])) {
          for (const idx of (u.cardIndices || [])) {
            if (idx >= 0 && idx < cards.length && !cardIndexToCard.has(idx)) {
              cardIndexToCard.set(idx, cards[idx])
            }
          }
        }
      }
    }

    // [fix-卡片集中] 使用模糊匹配：先精确匹配，未匹配的按相似度匹配，避免集中到第一个单元
    // 第一轮：精确名称匹配
    const result = planCategories.map(planCat => {
      const planCatName = String(planCat.name || '').trim()
      const aiCat = aiCategories.find(a => String(a.name || '').trim() === planCatName)
      const chapters = (planCat.chapters || []).map(planCh => {
        const planChName = String(planCh.name || '').trim()
        const units = (planCh.units || []).map(planUnit => {
          const planUnitName = String(planUnit.name || '').trim()
          let matchedCards = []
          if (aiCat) {
            const aiCh = (aiCat.chapters || []).find(c => String(c.name || '').trim() === planChName)
            if (aiCh) {
              const aiUnit = (aiCh.units || []).find(u => String(u.name || '').trim() === planUnitName)
              if (aiUnit) {
                matchedCards = (aiUnit.cardIndices || [])
                  .filter(idx => idx >= 0 && idx < cards.length)
                  .map(idx => cardIndexToCard.get(idx))
                  .filter(Boolean)
              }
            }
          }
          return { name: planUnitName, cards: matchedCards }
        })
        return { name: planChName, units }
      })
      return { name: planCatName, chapters }
    })

    // 第二轮：对未精确匹配的卡片，按相似度匹配到最合适的 plan 单元
    const assignedIndices = new Set()
    for (const cat of aiCategories) {
      for (const ch of (cat.chapters || [])) {
        for (const u of (ch.units || [])) {
          for (const idx of (u.cardIndices || [])) {
            assignedIndices.add(idx)
          }
        }
      }
    }
    // 找出未匹配的卡片（即未出现在任何 result 单元中的卡片）
    const matchedCardIds = new Set()
    for (const cat of result) {
      for (const ch of (cat.chapters || [])) {
        for (const u of (ch.units || [])) {
          for (const c of (u.cards || [])) {
            if (c?.id != null) matchedCardIds.add(c.id)
          }
        }
      }
    }
    const unmatchedCards = []
    for (const [idx, card] of cardIndexToCard.entries()) {
      if (card?.id != null && !matchedCardIds.has(card.id)) {
        unmatchedCards.push({ idx, card })
      }
    }

    // [fix-卡片集中] 对未匹配卡片，按内容相似度分配到最匹配的单元，而非全部塞入第一个单元
    if (unmatchedCards.length > 0) {
      for (const { card } of unmatchedCards) {
        const cardContent = String(card.knowledge_point || card.front || '')
        let bestUnit = null
        let bestScore = -1

        for (const cat of result) {
          const catName = String(cat.name || '')
          const catScore = simpleTextSimilarity(cardContent, catName)
          for (const ch of (cat.chapters || [])) {
            const chName = String(ch.name || '')
            const chScore = simpleTextSimilarity(cardContent, chName)
            for (const u of (ch.units || [])) {
              const uName = String(u.name || '')
              const uScore = simpleTextSimilarity(cardContent, uName)
              const totalScore = uScore * 0.6 + chScore * 0.25 + catScore * 0.15
              if (totalScore > bestScore) {
                bestScore = totalScore
                bestUnit = u
              }
            }
          }
        }

        if (bestUnit) {
          bestUnit.cards.push(card)
        } else if (result.length > 0 && result[0].chapters.length > 0) {
          // 极端兜底：没有任何单元可匹配时，放入第一个分类的第一个单元
          const firstCh = result[0].chapters[0]
          if (firstCh.units.length > 0) {
            firstCh.units[0].cards.push(card)
          } else {
            firstCh.units.push({ name: '未归类', cards: [card] })
          }
        }
      }
    }

    // 统计映射后的卡片数
    const totalRemapped = result.reduce((sum, cat) =>
      sum + (cat.chapters || []).reduce((s, ch) =>
        s + (ch.units || []).reduce((s2, u) => s2 + (u.cards || []).length, 0), 0), 0)
    if (totalRemapped === 0) {
      return null
    }
    return result
  } catch (e) {
    console.error('[remapCardsToPlanStructure] 映射失败:', e.message)
    return null
  }
}

/**
 * 跨分类卡片分配：将卡片分配到多分类结构中
 * @param {Array} cards - 所有待分配卡片
 * @param {object} structure - planCrossCategoryStructure 返回的结构
 * @param {object} config - AI 配置
 * @param {object} options - 可选参数
 * @param {string} options.categoryPurpose - 分类目的
 * @returns {Promise<{categories: Array<{name: string, chapters: Array<{name: string, units: Array<{name: string, cards: Array}>}>}>}>}
 */
async function assignCardsCrossCategory(cards, structure, config, options = {}) {
  const { categoryPurpose = '' } = options

  if (!cards || cards.length === 0) {
    throw new Error('没有卡片，无法分配')
  }

  if (!structure || !Array.isArray(structure.categories) || structure.categories.length === 0) {
    throw new Error('跨分类结构方案无效')
  }

  if (!config || (!config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey)) {
    throw new Error('请先配置 AI API Key')
  }

  const cardCount = cards.length
  const isSparkLite = config.aiServiceMode === 'iflytek-spark' && (!config.model || config.model === 'lite')

  // 构建结构上下文
  const structureContext = structure.categories.map((cat, ci) => {
    const chapters = (cat.chapters || []).map((ch, chi) => {
      const units = (ch.units || []).map((u, ui) => `    - 单元${ci}-${chi}-${ui}：${u.name}`).join('\n')
      return `  【章节${ci}-${chi}】${ch.name}\n${units}`
    }).join('\n')
    return `【分类${ci}】${cat.name}\n${chapters}`
  }).join('\n\n')

  // 构建卡片行
  const cardLines = cards.map((c, i) => {
    const kp = String(c.knowledge_point || c.front || '').slice(0, 100)
    return `${i}|${kp}`
  }).join('\n')

  const purposeContext = categoryPurpose
    ? `\n\n【学习目的】本分类的学习目的为：${categoryPurpose}。请据此调整卡片分配，确保知识点组织符合该学习场景。`
    : ''

  const prompt = `你是考研速记卡片的分类助手。请将以下卡片分配到已规划好的多分类、章节和单元结构中。${purposeContext}

【核心原则 - 聚类优先】（最重要！）：
1. 同一主题的知识点必须集中归入同一个单元，禁止分散到多个单元
2. 禁止将卡片均匀分发到各单元！单元卡片数应反映实际主题分布
3. 允许某些单元为空（0张卡片），如果没有匹配的知识点

【分配策略】（必须按此顺序执行）：
步骤1：先按知识点主题将卡片分组（如：所有"排序"相关的卡→一组，所有"图"相关的卡→一组）
步骤2：再将每组卡片整体分配到最匹配的分类→章节→单元
步骤3：检查同一主题的卡片是否全部在同一个单元，如有分散则合并

【示例】：
正确做法：10张"排序"卡片 → 全部归入"排序算法"单元
错误做法：10张"排序"卡片 → 3张归入"排序算法"，3张归入"查找算法"，4张归入"其他"（禁止！）

【关联性判断（必须遵守）】：
1. 内容相关的卡片必须分配到同一单元
2. 无关联的卡片应分配到不同单元或不同分类
3. 根据卡片内容与分类/章节/单元名称的匹配度进行分配
4. 优先分配到名称最匹配的单元

【完整性约束（最高优先级，必须严格遵守）】：
1. 每张卡片必须且只能被分配到一个单元中，绝对不能遗漏任何一张卡片
2. 每张卡片绝对不能被重复分配到多个单元
3. 所有 cardIndices 合并后必须是 0 到 ${cardCount - 1} 的完整集合，每个下标出现且仅出现一次
4. 在输出前，请逐一核对每张卡片是否已被分配且仅被分配一次
5. 卡片总数为 ${cardCount} 张，所有单元的 cardIndices 总数必须等于 ${cardCount}

【已规划的结构】：
${structureContext}

【待分配卡片（共 ${cardCount} 张，下标从 0 开始）】：
${cardLines}

【输出格式】请严格返回 JSON 对象，不要额外文字、不要代码块：
{
  "categories": [
    {
      "name": "分类名称",
      "chapters": [
        {
          "name": "章节名称",
          "units": [
            {
              "name": "单元名称",
              "cardIndices": [0, 2, 5]
            }
          ]
        }
      ]
    }
  ]
}

注意：cardIndices 是卡片在输入列表中的下标（从 0 开始）。`

  try {
    const startTime = Date.now()
    // 动态 max_tokens：每张卡片约需 50 token，最低 4096，弱模型上限 16384
    const dynamicMaxTokens = isSparkLite
      ? Math.min(16384, Math.max(8192, Math.ceil(cardCount * 80)))
      : Math.max(4096, Math.ceil(cardCount * 80))
    const result = await callAiProvider(prompt, {
      ...config,
      temperature: 0.3,
      max_tokens: dynamicMaxTokens,
    })


    logAiCall({
      purpose: 'assign-cards-cross-category',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: Date.now() - startTime,
      status: 'success',
      tokens: result.tokens,
      prompt: prompt,
      response: result.content,
    })

    // 解析 AI 返回的 JSON
    const parsed = parsePlanStructureResult(result.content)

    if (!parsed || !Array.isArray(parsed.categories)) {
      throw new Error('AI 返回的卡片分配结果无效')
    }


    // [fix-P1-8] 结构一致性校验：检查 AI 返回的结构是否与 planCrossCategoryStructure 一致
    // 如果严重不一致，使用 plan 结构作为模板重新映射卡片分配
    const planCategories = structure.categories || []
    const aiCategories = parsed.categories || []
    const consistencyCheck = checkCrossCategoryStructureConsistency(planCategories, aiCategories)
    if (!consistencyCheck.consistent) {
      console.warn('[assignCardsCrossCategory] [fix-P1-8] 结构不一致:', consistencyCheck.reason)
      console.warn('[assignCardsCrossCategory] [fix-P1-8] plan 结构: %d 分类, AI 返回: %d 分类', planCategories.length, aiCategories.length)
      // 尝试使用 plan 结构作为模板，将 AI 的卡片分配映射上去
      const remapped = remapCardsToPlanStructure(aiCategories, planCategories, cards)
      if (remapped) {
        return { categories: remapped }
      }
      // 重新映射失败，继续使用 AI 返回的结果（降级处理）
      console.warn('[assignCardsCrossCategory] [fix-P1-8] 重新映射失败，使用 AI 返回结果')
    }

    // 将 cardIndices 转换为 cards 数组
    // [fix-P1] 同时收集已分配的卡片索引，兼容无 id 卡片
    // [fix-完整性] 全局去重：每张卡片只能被分配到一个单元，避免重复分配
    // [fix-章节层级丢失] 如果 AI 返回的分类没有 chapters 但有 units，自动创建默认章节
    const assignedIndices = new Set()
    const categories = parsed.categories.map(cat => {
      let chapters = (cat.chapters || []).map(ch => ({
        name: String(ch.name || '').trim().slice(0, 12),
        units: (ch.units || []).map(u => {
          // 全局去重：跳过已被前面单元分配过的卡片索引
          const validIndices = (u.cardIndices || [])
            .map(idx => Number(idx))
            .filter(idx => idx >= 0 && idx < cardCount && !assignedIndices.has(idx))
          validIndices.forEach(idx => assignedIndices.add(idx))
          const unitCards = validIndices
            .map(idx => cards[idx])
            .filter(Boolean)
          return {
            name: String(u.name || '').trim().slice(0, 16),
            cards: unitCards,
          }
        }).filter(u => u.name),
      })).filter(ch => ch.name && ch.units.length > 0)

      // [fix-章节层级丢失] 如果没有 chapters 但有 units，将 units 归入默认章节
      if (chapters.length === 0 && Array.isArray(cat.units) && cat.units.length > 0) {
        const defaultUnits = cat.units.map(u => {
          const validIndices = (u.cardIndices || [])
            .map(idx => Number(idx))
            .filter(idx => idx >= 0 && idx < cardCount && !assignedIndices.has(idx))
          validIndices.forEach(idx => assignedIndices.add(idx))
          const unitCards = validIndices
            .map(idx => cards[idx])
            .filter(Boolean)
          return {
            name: String(u.name || '').trim().slice(0, 16),
            cards: unitCards,
          }
        }).filter(u => u.name)
        if (defaultUnits.length > 0) {
          chapters = [{ name: '默认章节', units: defaultUnits }]
        }
      }

      return {
        name: String(cat.name || '').trim().slice(0, 14),
        chapters,
      }
    }).filter(cat => cat.name && cat.chapters.length > 0)

    // 校验卡片覆盖
    const assignedCards = new Set()
    for (const cat of categories) {
      for (const ch of cat.chapters) {
        for (const u of ch.units) {
          for (const card of u.cards) {
            if (card && card.id != null) {
              assignedCards.add(card.id)
            }
          }
        }
      }
    }

    // 未分配的卡片使用关联检测进行兜底分配
    // [fix-P1] 同时检查 id 和索引，兼容无 id 卡片
    const unassignedCards = []
    const unassignedIndices = []
    cards.forEach((c, i) => {
      if (c.id != null) {
        if (!assignedCards.has(c.id)) {
          unassignedCards.push(c)
          unassignedIndices.push(i)
        }
      } else {
        if (!assignedIndices.has(i)) {
          unassignedCards.push(c)
          unassignedIndices.push(i)
        }
      }
    })

    if (unassignedCards.length > 0) {
      console.warn(`[assignCardsCrossCategory] 有 ${unassignedCards.length} 张卡片未分配，使用关联检测兜底`)
      // 使用关联检测将未分配卡片分配到最匹配的单元
      const fallbackAssigned = assignCardsByAssociation(unassignedCards, unassignedIndices, categories)
      if (!fallbackAssigned && categories.length > 0) {
        // [fix-卡片集中] 关联检测失败时，按内容相似度分散分配，而非全部塞入第一个分类
        console.warn(`[assignCardsCrossCategory] [fix-卡片集中] 关联检测失败，按相似度分散分配 ${unassignedCards.length} 张卡片`)
        for (const card of unassignedCards) {
          const cardContent = String(card.knowledge_point || card.front || '')
          let bestUnit = null
          let bestScore = -1
          for (const cat of categories) {
            const catName = String(cat.name || '')
            const catScore = simpleTextSimilarity(cardContent, catName)
            for (const ch of (cat.chapters || [])) {
              const chName = String(ch.name || '')
              const chScore = simpleTextSimilarity(cardContent, chName)
              for (const u of (ch.units || [])) {
                const uName = String(u.name || '')
                const uScore = simpleTextSimilarity(cardContent, uName)
                const totalScore = uScore * 0.6 + chScore * 0.25 + catScore * 0.15
                if (totalScore > bestScore && u.cards.length < 50) { // 单元上限50张，避免过度集中
                  bestScore = totalScore
                  bestUnit = u
                }
              }
            }
          }
          if (bestUnit) {
            bestUnit.cards.push(card)
          } else {
            // 极端兜底：所有单元都满了，放入第一个分类的第一个章节
            if (categories[0].chapters.length === 0) {
              categories[0].chapters.push({ name: '默认章节', units: [] })
            }
            const firstCh = categories[0].chapters[0]
            if (firstCh.units.length === 0) {
              firstCh.units.push({ name: '未归类', cards: [] })
            }
            firstCh.units[0].cards.push(card)
          }
        }
      }
    }

    return { categories }

  } catch (err) {
    logAiCall({
      purpose: 'assign-cards-cross-category',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: 0,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: prompt,
      response: '',
    })
    throw err
  }
}

/**
 * 基于关联检测的卡片分配（兜底方案）
 * 检测卡片与分类/章节/单元的关联度，将卡片分配到最匹配的单元
 * @param {Array} cards - 待分配卡片
 * @param {Array} indices - 卡片索引
 * @param {Array} categories - 已有的分类结构
 * @returns {boolean} 是否成功分配
 */
function assignCardsByAssociation(cards, indices, categories) {
  if (!cards || cards.length === 0 || !categories || categories.length === 0) {
    return false
  }


  let assignedCount = 0

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const cardContent = String(card.knowledge_point || card.front || '')

    // 计算卡片与每个单元的关联度
    let bestUnit = null
    let bestScore = 0

    for (const cat of categories) {
      const catName = String(cat.name || '')
      const catScore = simpleTextSimilarity(cardContent, catName)

      for (const ch of cat.chapters || []) {
        const chName = String(ch.name || '')
        const chScore = simpleTextSimilarity(cardContent, chName)

        for (const u of ch.units || []) {
          const uName = String(u.name || '')
          const uScore = simpleTextSimilarity(cardContent, uName)

          // 综合得分：单元匹配为主，章节和分类为辅
          const totalScore = uScore * 0.6 + chScore * 0.25 + catScore * 0.15

          // 检查关键词匹配（增强关联检测）
          const cardKeywords = extractKeywordsForAssociation(cardContent)
          const unitKeywords = extractKeywordsForAssociation(uName)
          const keywordMatch = cardKeywords.filter(k => unitKeywords.some(uk => uk.includes(k) || k.includes(uk))).length
          const keywordBonus = keywordMatch * 0.1

          const finalScore = totalScore + keywordBonus

          if (finalScore > bestScore) {
            bestScore = finalScore
            bestUnit = u
          }
        }
      }
    }

    if (bestUnit && bestScore > 0.05) {
      bestUnit.cards.push(card)
      assignedCount++
    } else {
      // 关联度太低，标记为无关联，放入第一个分类的第一个单元
      if (categories[0]?.chapters[0]?.units[0]) {
        categories[0].chapters[0].units[0].cards.push(card)
        assignedCount++
      }
    }
  }

  return assignedCount > 0
}

/**
 * 提取关键词（用于关联检测，增强版）
 */
function extractKeywordsForAssociation(text) {
  if (!text) return []
  const cleaned = String(text).toLowerCase()
  // 按标点和空格分词
  const words = cleaned.split(/[\s,，。；;：:、（）()\[\]【】""''""''\-—_·.]+/)
    .filter(w => w.length >= 2)
  // 提取中文词组（2-6字）
  const chineseWords = []
  for (const w of words) {
    if (/[\u4e00-\u9fa5]/.test(w)) {
      // 中文词，按 2-4 字滑窗提取
      for (let len = 2; len <= Math.min(6, w.length); len++) {
        for (let i = 0; i <= w.length - len; i++) {
          chineseWords.push(w.slice(i, i + len))
        }
      }
    } else {
      chineseWords.push(w)
    }
  }
  return [...new Set(chineseWords)]
}

/**
 * 解析卡片分配结果
 */
function parseAssignCardsResult(raw, maxIndex) {
  if (!raw) return null
  try {
    const trimmed = String(raw).trim()
    // 移除 Markdown 代码块
    const cleaned = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    const firstBracket = cleaned.indexOf('[')
    const lastBracket = cleaned.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const slice = cleaned.slice(firstBracket, lastBracket + 1)
      let parsed
      try {
        parsed = JSON.parse(slice)
      } catch (_) {
        // [fix-P2-7] 补充 fixIncompleteJson 修复，提升弱模型解析成功率
        try {
          const fixed = fixIncompleteJson(slice)
          if (fixed) parsed = JSON.parse(fixed)
        } catch (__) { /* 忽略修复失败 */ }
      }
      if (!parsed) return null
      // 过滤无效项
      return parsed.filter(item => {
        const cardIdx = Number(item.cardIndex)
        const chapterIdx = Number(item.chapterIndex)
        const unitIdx = Number(item.unitIndex)
        return !isNaN(cardIdx) && !isNaN(chapterIdx) && !isNaN(unitIdx) &&
               cardIdx >= 0 && cardIdx < maxIndex
      })
    }
  } catch (_) {
    return null
  }
  return null
}

/**
 * 本地降级分配（AI 失败时使用）
 */
function localFallbackAssign(cardIndices, structurePlan, cards) {
  const results = structurePlan.map((ch, chi) => ({
    name: ch.name,
    units: (ch.units || []).map((u, ui) => ({
      name: u.name,
      cards: [],
    })),
  }))

  const totalUnits = results.reduce((sum, ch) => sum + ch.units.length, 0)
  if (totalUnits === 0) {
    // 没有单元可分配，创建"未归类"单元
    if (results.length > 0) {
      results[0].units.push({ name: '未归类', cards: [] })
    } else {
      results.push({ name: '未归类', units: [{ name: '未归类', cards: [] }] })
    }
  }

  // [fix-P2] 使用语义相似度进行卡片分配，而非简单轮询
  // 构建单元列表（包含章节信息）
  const allUnits = []
  for (const ch of results) {
    for (const u of ch.units) {
      allUnits.push({ unit: u, chapterName: ch.name, unitName: u.name })
    }
  }

  // 为每张卡片找到最匹配的单元
  for (let i = 0; i < cardIndices.length; i++) {
    const cardIdx = cardIndices[i]
    const card = cards && cards[cardIdx] ? cards[cardIdx] : { _localAssign: true, index: cardIdx }

    // 提取卡片内容用于匹配
    const cardContent = [
      card.knowledge_point || card.knowledgePoint || '',
      card.front || '',
      card.back || '',
    ].join(' ')

    // 计算与每个单元的匹配度
    let bestUnitIdx = 0
    let bestScore = -1

    for (let j = 0; j < allUnits.length; j++) {
      const { chapterName, unitName } = allUnits[j]
      // 综合章节名和单元名进行匹配
      const unitContent = `${chapterName} ${unitName}`
      const score = simpleTextSimilarity(cardContent, unitContent)

      // 关键词匹配加分
      const cardWords = cardContent.split(/[\s,，。；;：:\-—_·、]+/).filter(w => w.length > 1)
      const unitWords = unitContent.split(/[\s,，。；;：:\-—_·、]+/).filter(w => w.length > 1)
      let keywordBonus = 0
      for (const cw of cardWords) {
        for (const uw of unitWords) {
          if (cw.includes(uw) || uw.includes(cw)) {
            keywordBonus += Math.min(cw.length, uw.length)
          }
        }
      }

      const totalScore = score + keywordBonus * 0.1
      if (totalScore > bestScore) {
        bestScore = totalScore
        bestUnitIdx = j
      }
    }

    allUnits[bestUnitIdx].unit.cards.push(card)
  }

  return { chapters: results }
}

/**
 * 将 assignCards 返回的 cards 数组格式转换为 validateClassificationResult 需要的 cardIndices 格式
 * @param {object} assignResult - assignCards 返回结果 { chapters: [{ name, units: [{ name, cards: [...] }] }] }
 * @param {Array} selectedCards - 原始卡片数组，用于建立卡片索引映射
 * @returns {object} - { chapters: [{ name, units: [{ name, cardIndices: [...] }] }] }
 */
function convertAssignResultToValidateFormat(assignResult, selectedCards) {
  if (!assignResult || !assignResult.chapters) {
    return { chapters: [] }
  }

  // 建立 card.id → index 映射，同时支持引用相等
  const cardIdToIndex = new Map()
  const cardRefSet = new WeakSet()
  if (Array.isArray(selectedCards)) {
    for (let i = 0; i < selectedCards.length; i++) {
      const c = selectedCards[i]
      if (c && c.id != null) {
        cardIdToIndex.set(c.id, i)
      }
      if (c && typeof c === 'object') {
        cardRefSet.add(c)
      }
    }
  }

  const chapters = []
  for (const ch of assignResult.chapters) {
    const units = []
    for (const u of ch.units || []) {
      const cardIndices = []
      for (const card of u.cards || []) {
        if (card && typeof card === 'object') {
          // 优先通过 id 查找
          let idx = -1
          if (card.id != null && cardIdToIndex.has(card.id)) {
            idx = cardIdToIndex.get(card.id)
          } else if (cardRefSet.has(card)) {
            // 回退到引用查找
            idx = selectedCards.findIndex(c => c === card)
          }
          if (idx !== -1) {
            cardIndices.push(idx)
          }
        }
      }
      units.push({
        name: u.name,
        cardIndices,
      })
    }
    chapters.push({
      name: ch.name,
      units,
    })
  }

  return { chapters }
}

/**
 * 将 validateClassificationResult/fixClassificationResult 返回的 cardIndices 格式
 * 转换回 assignCards 的 cards 数组格式
 * @param {object} validatedResult - fixClassificationResult 返回结果 { chapters: [{ name, units: [{ name, cardIndices: [...] }] }] }
 * @param {object} originalAssignResult - 原始 assignCards 返回结果，用于获取卡片对象
 * @param {Array} selectedCards - 原始卡片数组，cardIndices 指向此数组的下标
 * @returns {object} - { chapters: [{ name, units: [{ name, cards: [...] }] }] }
 */
function convertValidateFormatToAssignResult(validatedResult, originalAssignResult, selectedCards) {
  if (!validatedResult || !validatedResult.chapters) {
    return originalAssignResult || { chapters: [] }
  }

  // 基于 selectedCards 数组构建 index → card 映射
  const cardIndexToCard = new Map()
  if (Array.isArray(selectedCards)) {
    for (let i = 0; i < selectedCards.length; i++) {
      cardIndexToCard.set(i, selectedCards[i])
    }
  }

  const chapters = []
  for (const ch of validatedResult.chapters) {
    const units = []
    for (const u of ch.units || []) {
      const cards = []
      for (const idx of u.cardIndices || []) {
        const card = cardIndexToCard.get(idx)
        if (card) {
          cards.push(card)
        }
      }
      units.push({
        name: u.name,
        cards,
      })
    }
    chapters.push({
      name: ch.name,
      units,
    })
  }

  return { chapters }
}

/**
 * 为章节列表添加 topicId（主题持久化）
 * @param {Array} chapters - 章节数组
 * @param {string|null} categoryId - 分类 ID
 * @returns {Promise<Array>} - 添加了 topicId 的章节数组
 */
async function persistTopicsToChapters(chapters, categoryId) {
  if (!categoryId) {
    return chapters
  }

  for (const ch of chapters) {
    if (ch.name) {
      try {
        const existingTopic = await getTopicByName(categoryId, ch.name)
        if (existingTopic) {
          ch.topicId = existingTopic.id
        } else {
          const newTopic = await createTopic(categoryId, ch.name)
          ch.topicId = newTopic.id
        }
      } catch (err) {
        console.warn('[persistTopicsToChapters] 主题持久化失败:', err.message)
      }
    }
  }

  return chapters
}

/**
 * 校验分配结果
 * @param {Array} chapters - 分配结果章节数组
 * @param {number} expectedCardCount - 期望的卡片总数
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateAssignmentResult(chapters, expectedCardCount) {
  const errors = []
  const warnings = []
  const assignedCards = new Set()
  
  for (const chapter of chapters) {
    for (const unit of chapter.units || []) {
      const cardCount = unit.cards?.length || 0
      
      if (cardCount < 2 && cardCount > 0) {
        warnings.push(`单元"${unit.name}"卡片数过少: ${cardCount}`)
      }
      if (cardCount > 50) {
        warnings.push(`单元"${unit.name}"卡片数过多: ${cardCount}`)
      }
      
      for (const card of unit.cards || []) {
        const cardId = card.id || card._localAssign?.index
        if (assignedCards.has(cardId)) {
          errors.push(`卡片重复分配: ${cardId}`)
        }
        assignedCards.add(cardId)
      }
    }
  }
  
  if (assignedCards.size < expectedCardCount) {
    const missing = expectedCardCount - assignedCards.size
    errors.push(`有 ${missing} 张卡片未分配`)
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 修正分配结果
 */
function fixAssignmentResult(chapters, cardCount, structurePlan) {
  const results = structurePlan.map((ch, chi) => ({
    name: ch.name,
    units: (ch.units || []).map((u, ui) => ({
      name: u.name,
      cards: [],
    })),
  }))
  
  // 收集所有卡片
  const allCards = []
  for (const ch of chapters) {
    for (const u of ch.units || []) {
      allCards.push(...(u.cards || []))
    }
  }
  
  // 去除重复
  // [fix-P1-4] 修复无 id 卡片去重 bug：原代码 card.id || card._localAssign?.index 在无 id 时返回 undefined，
  // 所有无 id 卡片会被视为同一个，只保留第一张。改用对象引用 + 数组索引作为后备唯一标识。
  const uniqueCards = []
  const seen = new Set()
  const seenCardRefs = new WeakSet()  // 用于对象引用去重
  for (const card of allCards) {
    const id = card.id || card._localAssign?.index
    if (id != null) {
      // 有 id 的卡片用 id 去重
      if (!seen.has(id)) {
        seen.add(id)
        uniqueCards.push(card)
      }
    } else if (card && typeof card === 'object') {
      // [fix-P1-4] 无 id 卡片用对象引用去重，避免误判为同一个
      if (!seenCardRefs.has(card)) {
        seenCardRefs.add(card)
        uniqueCards.push(card)
      }
    }
  }
  
  // 重新均匀分配
  const totalUnits = results.reduce((sum, ch) => sum + ch.units.length, 0)
  if (totalUnits === 0) return { chapters: results }
  
  const cardsPerUnit = Math.ceil(uniqueCards.length / totalUnits)
  let cardIdx = 0
  
  for (const ch of results) {
    for (const u of ch.units) {
      const unitCards = []
      for (let i = 0; i < cardsPerUnit && cardIdx < uniqueCards.length; i++) {
        unitCards.push(uniqueCards[cardIdx++])
      }
      u.cards = unitCards
    }
  }
  
  return { chapters: results }
}

// ============================================================
// 知识点预去重 - 支持强模型和弱模型两种路径
// ============================================================

// 强模型批处理配置
const STRONG_MODEL_DEDUP = {
  maxBatchSize: 50,           // 每批最大知识点数
  maxExistingInPrompt: 100,   // prompt 中最多带入的现有知识点
  similarityThreshold: 0.75,   // 相似度阈值
}

// 弱模型批处理配置
const WEAK_MODEL_DEDUP = {
  maxBatchSize: 25,           // 每批最大知识点数（比强模型小）
  maxExistingInPrompt: 50,    // prompt 中最多带入的现有知识点
  similarityThreshold: 0.70,   // 相似度阈值（稍低，减少误判）
}

/**
 * 判断是否为弱模型
 */
function isWeakSparkModel(aiConfig) {
  return aiConfig?.aiServiceMode === 'iflytek-spark' && (!aiConfig?.model || aiConfig.model === 'lite')
}

/**
 * 构建强模型去重 prompt
 */
function buildStrongModelDedupPrompt(tempPoints, existingPoints) {
  const tempLines = tempPoints.map((p, i) => `${i}. ${p}`).join('\n')
  const existLines = existingPoints.map((p, i) => `${i}. ${p}`).join('\n')

  return `你是一个知识点去重助手。请判断【待检测知识点】中的每一个知识点是否与【现有知识点】中的某个知识点语义相同或高度相似。

【高度相似】的定义：表达相同或相近的知识概念，可以有不同的表述方式。例如"函数的概念"与"函数定义"高度相似。

【待检测知识点】（共 ${tempPoints.length} 个）：
${tempLines}

【现有知识点】（共 ${existingPoints.length} 个，从本分类卡片中提取）：
${existLines}

【输出格式】请严格以 JSON 数组格式返回，不要任何其他文字：
[
  {"tempIndex": 0, "isDuplicate": true/false, "matchedExistingIndex": 0-9, "similarity": 0.XX, "reason": "简短原因"}
]

注意：
- similarity 取值范围 0.00-1.00
- 只有 similarity > 0.75 时才标记 isDuplicate: true
- 即使不重复，也需要返回所有 tempIndex 的判定结果`
}

/**
 * 强模型知识点去重 - 单批调用
 */
async function deduplicateWithStrongModel(tempPoints, existingPoints, config) {
  const truncatedExisting = existingPoints.slice(0, STRONG_MODEL_DEDUP.maxExistingInPrompt)
  const prompt = buildStrongModelDedupPrompt(tempPoints, truncatedExisting)

  // 根据不同服务模式调用
  if (config.aiServiceMode === 'iflytek-spark') {
    const { sparkApiKey, model } = config
    const password = sparkApiKey || ''
    const response = await httpPost('/api/spark/v1/chat/completions', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + password },
      data: { model: model || 'lite', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 4096 },
      timeout: 30000,
    })
    if (!response.ok) throw new Error(`Spark: ${response.status}`)
    const content = response.data?.choices?.[0]?.message?.content || ''
    return parseDedupResponse(content)
  } else if (config.aiServiceMode === 'volcano') {
    const { volcanoApiKey, volcanoModel } = config
    const response = await httpPost('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + volcanoApiKey },
      data: { model: volcanoModel || 'doubao-pro-32k', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 4096 },
      timeout: 20000,
    })
    if (!response.ok) throw new Error(`Volcano: ${response.status}`)
    const content = response.data?.choices?.[0]?.message?.content || ''
    return parseDedupResponse(content)
  } else if (config.aiServiceMode === 'dashscope') {
    const { dashscopeApiKey, dashscopeModel } = config
    const response = await httpPost('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + dashscopeApiKey },
      data: { model: dashscopeModel || 'qwen3.5-plus-2026-04-20', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 4096 },
      timeout: 20000,
    })
    if (!response.ok) throw new Error(`Dashscope: ${response.status}`)
    const content = response.data?.choices?.[0]?.message?.content || ''
    return parseDedupResponse(content)
  } else {
    // DeepSeek 默认
    const { apiKey, model } = config
    const response = await httpPost('https://api.deepseek.com/v1/chat/completions', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      data: { model: model || 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 4096 },
      timeout: 20000,
    })
    if (!response.ok) throw new Error(`DeepSeek: ${response.status}`)
    const content = response.data?.choices?.[0]?.message?.content || ''
    return parseDedupResponse(content)
  }
}

/**
 * 解析去重响应
 */
function parseDedupResponse(content) {
  if (!content) return []
  // 剥离 markdown
  const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => ({
      tempIndex: typeof item.tempIndex === 'number' ? item.tempIndex : 0,
      isDuplicate: Boolean(item.isDuplicate),
      matchedExistingIndex: item.matchedExistingIndex ?? null,
      similarity: typeof item.similarity === 'number' ? item.similarity : 0,
      reason: String(item.reason || '') || '',
    }))
  } catch {
    // 尝试提取 JSON 片段
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          return parsed.map(item => ({
            tempIndex: typeof item.tempIndex === 'number' ? item.tempIndex : 0,
            isDuplicate: Boolean(item.isDuplicate),
            matchedExistingIndex: item.matchedExistingIndex ?? null,
            similarity: typeof item.similarity === 'number' ? item.similarity : 0,
            reason: String(item.reason || '') || '',
          }))
        }
      } catch {}
    }
    return []
  }
}

/**
 * 本地 fallback 去重（AI 不可用时）
 */
function localDedupFallback(tempPoints, existingPoints) {
  // 1. 精确匹配
  const exactSet = new Set(existingPoints.map(p => String(p).toLowerCase().trim()))
  const exactDuplicates = []
  
  for (let i = 0; i < tempPoints.length; i++) {
    const tp = String(tempPoints[i]).toLowerCase().trim()
    if (exactSet.has(tp)) {
      exactDuplicates.push(i)
    }
  }

  // 2. 子串匹配（只在未精确匹配的知识点中找）
  const partialDuplicates = []
  for (let i = 0; i < tempPoints.length; i++) {
    if (exactDuplicates.includes(i)) continue
    
    const tp = String(tempPoints[i]).toLowerCase().trim()
    if (tp.length < 4) continue  // 跳过太短的字符串
    
    for (const ep of existingPoints) {
      const epLower = String(ep).toLowerCase().trim()
      if (epLower.length < 4) continue
      
      // 检查是否包含
      if (epLower.includes(tp) || tp.includes(epLower)) {
        partialDuplicates.push({ index: i, matched: ep })
        break
      }
    }
  }

  const allDuplicateIndices = [...new Set([...exactDuplicates, ...partialDuplicates.map(p => p.index)])]
  const uniquePoints = tempPoints.filter((_, idx) => !allDuplicateIndices.includes(idx))

  return {
    uniquePoints,
    duplicatePairs: [
      ...exactDuplicates.map(i => ({ tempIndex: i, type: 'exact', matchedExistingIndex: existingPoints.findIndex(ep => String(ep).toLowerCase().trim() === String(tempPoints[i]).toLowerCase().trim()) })),
      ...partialDuplicates.map(p => ({ tempIndex: p.index, type: 'partial', matchedExisting: p.matched })),
    ],
    viaLocalFallback: true,
    stats: {
      totalTemp: tempPoints.length,
      totalExisting: existingPoints.length,
      duplicatesFound: allDuplicateIndices.length,
      uniqueCount: uniquePoints.length,
    },
  }
}

/**
 * 知识点预去重主函数
 * 
 * @param {string[]} tempPoints - AI生成的临时知识点数组
 * @param {string[]} existingPoints - 本分类现有的知识点数组
 * @param {object} aiConfig - AI配置 { apiKey, aiServiceMode, model, sparkApiKey, ... }
 * @param {function} onProgress - 进度回调 (step, current, total) => void
 * @returns {Promise<object>} { uniquePoints, duplicatePairs, stats }
 */
export async function deduplicateKnowledgePoints(tempPoints, existingPoints, aiConfig, onProgress) {
  const startTime = Date.now()
  
  // 1. 空值保护
  if (!Array.isArray(tempPoints) || tempPoints.length === 0) {
    return { uniquePoints: [], duplicatePairs: [], stats: { totalTemp: 0, duplicatesFound: 0, uniqueCount: 0, processingTime: 0, modelType: 'none' } }
  }
  if (!Array.isArray(existingPoints) || existingPoints.length === 0) {
    return { uniquePoints: tempPoints, duplicatePairs: [], stats: { totalTemp: tempPoints.length, duplicatesFound: 0, uniqueCount: tempPoints.length, processingTime: 0, modelType: 'none' } }
  }

  // 2. 判断模型类型
  const weakModel = isWeakSparkModel(aiConfig)
  const batchConfig = weakModel ? WEAK_MODEL_DEDUP : STRONG_MODEL_DEDUP

  // 3. 截断现有知识点
  const truncatedExisting = existingPoints.slice(0, batchConfig.maxExistingInPrompt)

  // 4. 分批处理
  const allDuplicates = []
  const duplicateIndices = new Set()
  const BATCH_SIZE = batchConfig.maxBatchSize

  try {
    for (let i = 0; i < tempPoints.length; i += BATCH_SIZE) {
      const batch = tempPoints.slice(i, i + BATCH_SIZE)
      
      let batchResults
      if (weakModel) {
        // 弱模型：使用专用函数
        batchResults = await deduplicateWithSpark(batch, truncatedExisting, {
          apiPassword: aiConfig.sparkApiKey,
          model: aiConfig.model,
        })
      } else {
        // 强模型：使用通用函数
        batchResults = await deduplicateWithStrongModel(batch, truncatedExisting, aiConfig)
      }

      // 5. 合并结果（修正全局索引）
      // 防护：确保 batchResults 是数组
      if (!Array.isArray(batchResults)) {
        console.warn('[deduplicateKnowledgePoints] batchResults 不是数组，跳过此批次')
        batchResults = []
      }
      for (const dup of batchResults) {
        if (dup.isDuplicate && dup.similarity > batchConfig.similarityThreshold) {
          const globalIndex = dup.tempIndex + i
          duplicateIndices.add(globalIndex)
          allDuplicates.push({
            tempIndex: globalIndex,
            existingIndex: dup.matchedExistingIndex,
            similarity: dup.similarity,
            reason: dup.reason,
          })
        }
      }

      onProgress?.('dedup', Math.min(i + BATCH_SIZE, tempPoints.length), tempPoints.length)
    }
  } catch (err) {
    // AI 调用失败，降级到本地 fallback
    console.warn('[deduplicateKnowledgePoints] AI 去重失败，使用本地 fallback:', err?.message)
    const fallbackResult = localDedupFallback(tempPoints, existingPoints)
    return {
      ...fallbackResult,
      stats: {
        ...fallbackResult.stats,
        processingTime: Date.now() - startTime,
        modelType: 'fallback',
      },
    }
  }

  // 6. 生成去重结果
  const uniquePoints = tempPoints.filter((_, idx) => !duplicateIndices.has(idx))

  return {
    uniquePoints,
    duplicatePairs: allDuplicates,
    stats: {
      totalTemp: tempPoints.length,
      totalExisting: existingPoints.length,
      duplicatesFound: duplicateIndices.size,
      uniqueCount: uniquePoints.length,
      processingTime: Date.now() - startTime,
      modelType: weakModel ? 'weak' : 'strong',
    },
  }
}

// ============================================================
// 纯 AI 语义验证：跨分类全权归类结果审核
// AI 直接审核每张卡片的归类是否语义正确（不使用任何本地关键字匹配）
// ============================================================

/**
 * 纯 AI 语义验证：审核跨分类全权归类结果中每张卡片的归类是否正确
 * AI 基于语义理解判断每张卡片的分类/章节/单元归属是否正确，不使用本地关键字匹配
 * @param {object} classificationResult - 原分类结果 { categories: [{ name, chapters: [{ name, units: [{ name, cards: [{id, knowledge_point}] }] }] }] }
 * @param {Array} originalCards - 原始卡片数组 [{ id, knowledge_point, front, back }]
 * @param {object} config - AI 配置
 * @returns {Promise<object>} { verifications: [{ cardIndex, cardId, categoryCorrect, chapterCorrect, unitCorrect, confidence }], duration, error }
 */
export async function verifyCrossCategoryByAI(classificationResult, originalCards, config) {
  const startTime = Date.now()
  const result = { verifications: [], duration: 0, error: null }

  if (!classificationResult || !Array.isArray(classificationResult.categories) || classificationResult.categories.length === 0) {
    result.error = '分类结果为空，无法验证'
    result.duration = Date.now() - startTime
    return result
  }
  if (!originalCards || originalCards.length === 0) {
    result.error = '卡片列表为空，无法验证'
    result.duration = Date.now() - startTime
    return result
  }
  if (!config || (!config.apiKey && !config.sparkApiKey && !config.volcanoApiKey && !config.dashscopeApiKey)) {
    result.error = '请先配置 AI API Key'
    result.duration = Date.now() - startTime
    return result
  }

  // 构建带卡片分配的完整分类结构（供 AI 审核）
  const structureWithCards = classificationResult.categories.map((cat, ci) => {
    const chapters = (cat.chapters || []).map((ch, chi) => {
      const units = (ch.units || []).map((u, ui) => {
        const cardIndices = (u.cards || []).map(c => {
          const idx = originalCards.findIndex(oc => oc.id === c.id)
          return idx >= 0 ? idx : -1
        }).filter(idx => idx >= 0)
        return `    - 单元${ci}-${chi}-${ui}「${u.name}」: 卡片[${cardIndices.join(', ')}]`
      }).join('\n')
      return `  章节${ci}-${chi}「${ch.name}」\n${units}`
    }).join('\n')
    return `分类${ci}「${cat.name}」\n${chapters}`
  }).join('\n\n')

  // [fix-大数量] 分批审核：每批 60 张卡片，避免响应被截断
  // 当卡片数量 > 60 时，单次审核会导致 AI 响应被 max_tokens 截断，JSON 无法解析
  const BATCH_SIZE = 60
  const allVerifications = []
  const isSparkLite = config.aiServiceMode === 'iflytek-spark' && (!config.model || config.model === 'lite')

  try {
    for (let batchStart = 0; batchStart < originalCards.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, originalCards.length)
      const batchCards = originalCards.slice(batchStart, batchEnd)

      // 构建本批卡片内容索引
      const cardContents = batchCards.map((c, i) => {
        const globalIdx = batchStart + i
        const kp = String(c.knowledge_point || c.front || '').slice(0, 100)
        return `${globalIdx}: ${kp}`
      }).join('\n')

      const prompt = `你是考研速记卡片的分类审核助手。请审核以下分类结果中指定卡片的归类是否语义正确。

【任务】：
1. 逐一审核下方列出的每张卡片，判断它被归入的分类/章节/单元是否语义正确
2. 基于卡片知识点内容与所属分类/章节/单元名称的语义匹配度进行判断
3. 对每张卡片的分类、章节、单元归属分别给出"正确"或"错误"的判断
4. 不要受卡片编号顺序影响，纯粹基于语义关联判断

【完整分类结构（含所有卡片分配）】：
${structureWithCards}

【本批需审核的卡片（下标从 0 开始，共 ${batchCards.length} 张）】：
${cardContents}

【判断标准】：
- 分类正确：卡片知识点属于该分类的学科领域
- 章节正确：卡片知识点属于该章节的知识范畴
- 单元正确：卡片知识点与该单元主题语义匹配，且与同单元其他卡片相关联

【输出格式】请严格返回 JSON 对象，不要额外文字、不要代码块：
{
  "audits": [
    {
      "cardIndex": ${batchStart},
      "categoryCorrect": true,
      "chapterCorrect": true,
      "unitCorrect": true,
      "confidence": 0.95,
      "reason": "简要说明"
    }
  ]
}

注意：cardIndex 是卡片全局下标；三个 correct 字段为布尔值；confidence 为 0-1 的置信度。`


      const batchStart2 = Date.now()
      const aiResult = await callAiProvider(prompt, {
        ...config,
        temperature: 0.2,
        max_tokens: isSparkLite ? 8192 : 8192,
      })


      logAiCall({
        purpose: 'verify-cross-category-by-ai',
        modelName: getModelName(config.aiServiceMode, config.model),
        durationMs: Date.now() - batchStart2,
        status: 'success',
        tokens: aiResult.tokens,
        prompt: prompt,
        response: aiResult.content,
      })

      // 解析 AI 返回的 JSON
      const parsed = parseVerifyResult(aiResult.content)
      if (!parsed || !Array.isArray(parsed.audits) || parsed.audits.length === 0) {
        console.warn(`[verifyCrossCategoryByAI] 批次 ${batchStart}-${batchEnd - 1} 解析失败，跳过`)
        continue
      }

      // 规范化验证结果，关联 cardId
      const batchVerifications = parsed.audits.map(v => {
        const idx = Number(v.cardIndex)
        const card = originalCards[idx]
        return {
          cardIndex: idx,
          cardId: card?.id || null,
          categoryCorrect: !!v.categoryCorrect,
          chapterCorrect: !!v.chapterCorrect,
          unitCorrect: !!v.unitCorrect,
          confidence: Number(v.confidence) || 0,
          reason: String(v.reason || '').slice(0, 200),
        }
      }).filter(v => v.cardId != null)

      allVerifications.push(...batchVerifications)
    }

    if (allVerifications.length === 0) {
      throw new Error('AI 验证所有批次均解析失败')
    }

    result.verifications = allVerifications
    result.duration = Date.now() - startTime
    return result
  } catch (err) {
    console.error('[verifyCrossCategoryByAI] 失败:', err.message)
    logAiCall({
      purpose: 'verify-cross-category-by-ai',
      modelName: getModelName(config.aiServiceMode, config.model),
      durationMs: Date.now() - startTime,
      status: 'error',
      errorMessage: err?.message || '未知错误',
      prompt: '(分批审核模式)',
    })
    result.error = err.message
    result.duration = Date.now() - startTime
    return result
  }
}

/**
 * 解析 AI 验证返回的 JSON（兼容 audits 和 verifications 两种字段名）
 */
function parseVerifyResult(rawContent) {
  if (!rawContent) return null
  let text = String(rawContent).trim()

  // 去除 markdown 代码块
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // 尝试直接解析
  try {
    const parsed = JSON.parse(text)
    if (parsed && (Array.isArray(parsed.audits) || Array.isArray(parsed.verifications))) {
      // 统一为 audits 字段
      if (!parsed.audits && parsed.verifications) {
        parsed.audits = parsed.verifications
      }
      return parsed
    }
  } catch (_) { /* continue */ }

  // 正则提取 JSON 对象
  const objMatch = text.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0])
      if (parsed && (Array.isArray(parsed.audits) || Array.isArray(parsed.verifications))) {
        if (!parsed.audits && parsed.verifications) {
          parsed.audits = parsed.verifications
        }
        return parsed
      }
    } catch (_) { /* continue */ }
  }

  return null
}