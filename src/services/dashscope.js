import {
  DASHSCOPE_API_URL,
  CARD_GENERATION_PROMPT,
  CARD_GENERATION_PROMPT_BY_LEVEL,
  OCR_PROMPT,
  SPEECH_CLEANUP_SYSTEM_PROMPT,
  buildRegenerateCardPrompt,
} from '../utils/constants'
import { parseAIResponse, tryParseJSON } from '../utils/helpers'
import { httpPost } from '../utils/httpClient'

/**
 * 阿里云千问大模型（DashScope/OpenAI兼容）封装
 * API 格式：OpenAI 兼容，国内直连，无需代理
 */

export async function cleanUpSpeechTextWithDashscope(rawText, apiKey, model = 'qwen3.5-plus-2026-04-20') {
  try {
    const response = await httpPost(DASHSCOPE_API_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model,
        messages: [
          { role: 'system', content: SPEECH_CLEANUP_SYSTEM_PROMPT },
          { role: 'user', content: rawText },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      },
      timeout: 15000,
    })

    if (!response.ok) {
      const msg = response.data?.error?.message || '语音整理失败 (' + response.status + ')'
      console.error('[dashscope-cleanup] HTTP 错误:', response.status, msg)
      throw new Error('千问: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content?.trim()
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) return { content: rawText, tokens }
    return { content, tokens }
  } catch (err) {
    console.error('[dashscope-cleanup] 调用失败:', err?.message)
    throw new Error('千问调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function generateCardsWithDashscope(text, apiKey, model = 'qwen3.5-plus-2026-04-20', summaryLevel) {
  const prompt = (summaryLevel && CARD_GENERATION_PROMPT_BY_LEVEL[summaryLevel]) || CARD_GENERATION_PROMPT
  try {
    const response = await httpPost(DASHSCOPE_API_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model,
        messages: [{ role: 'user', content: prompt + '\n\n' + text }],
        temperature: 0.7,
        max_tokens: 4096,
      },
      timeout: 30000,
    })

    if (!response.ok) {
      const msg = response.data?.error?.message || '请求失败 (' + response.status + ')'
      console.error('[dashscope-generate] HTTP 错误:', response.status, msg)
      throw new Error('千问: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) {
      throw new Error('千问未返回有效内容')
    }
    return { content, tokens }
  } catch (err) {
    console.error('[dashscope-generate] 调用失败:', err?.message)
    throw new Error('千问调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function extractTextFromImageWithDashscope(base64Image, apiKey, model = 'qwen3.5-plus-2026-04-20') {
  const imageDataUrl = 'data:image/jpeg;base64,' + base64Image
  try {
    const response = await httpPost(DASHSCOPE_API_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model,
        messages: [
          {
            role: 'user',
            content: OCR_PROMPT + '\n\n' + imageDataUrl,
          },
        ],
        max_tokens: 4096,
      },
      timeout: 30000,
    })

    if (!response.ok) {
      const msg = response.data?.error?.message || '图片识别失败 (' + response.status + ')'
      console.error('[dashscope-ocr] HTTP 错误:', response.status, msg)
      throw new Error('千问: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) {
      throw new Error('千问未识别到图片中的文字')
    }
    return { content, tokens }
  } catch (err) {
    console.error('[dashscope-ocr] 调用失败:', err?.message)
    throw new Error('千问调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function testDashscopeConnection(apiKey, model = 'qwen3.5-plus-2026-04-20') {
  try {
    const response = await httpPost(DASHSCOPE_API_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model,
        messages: [{ role: 'user', content: 'Say "ok" in one word' }],
        max_tokens: 10,
      },
      timeout: 15000,
    })

    if (!response.ok) {
      const msg = response.data?.error?.message || '连接失败 (' + response.status + ')'
      console.error('[dashscope-test] 测试失败:', response.status, msg)
      throw new Error(msg)
    }

    const content = response.data?.choices?.[0]?.message?.content?.trim()
    const tokens = response.data?.usage?.total_tokens || 0
    return { ok: true, content, tokens }
  } catch (err) {
    console.error('[dashscope-test] 测试失败:', err?.message)
    throw err
  }
}

export async function regenerateCardFromKnowledgePointWithDashscope(knowledgePoint, apiKey, model, summaryLevel) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('缺少千问 API 密钥')
  }
  const prompt = buildRegenerateCardPrompt(knowledgePoint, summaryLevel)
  const response = await httpPost(DASHSCOPE_API_URL, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    data: {
      model: model || 'qwen3.5-plus-2026-04-20',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    },
    timeout: 30000,
  })
  if (!response.ok) {
    const msg = response.data?.error?.message || '请求失败 (' + response.status + ')'
    throw new Error('千问: ' + msg)
  }
  const content = response.data?.choices?.[0]?.message?.content
  const tokens = response.data?.usage?.total_tokens || 0
  if (!content) throw new Error('千问未返回有效内容')
  const parsed = parseAIResponse(content, { strictMode: true })
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
