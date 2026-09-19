import { DEEPSEEK_API_URL, CARD_GENERATION_PROMPT, CARD_GENERATION_PROMPT_BY_LEVEL, OCR_PROMPT, SPEECH_CLEANUP_SYSTEM_PROMPT, buildRegenerateCardPrompt } from '../utils/constants'
import { parseAIResponse, tryParseJSON } from '../utils/helpers'
import { httpPost } from '../utils/httpClient'

export async function cleanUpSpeechText(rawText, apiKey, model = 'deepseek-v4-pro') {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('缺少 DeepSeek API 密钥')
  }
  try {
    const response = await httpPost(DEEPSEEK_API_URL, {
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
      console.error('[deepseek-cleanup] HTTP 错误:', response.status, msg)
      throw new Error('DeepSeek: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content?.trim()
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) return { content: rawText, tokens }
    return { content, tokens }
  } catch (err) {
    console.error('[deepseek-cleanup] 调用失败:', err?.message)
    throw new Error('DeepSeek 调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function generateCards(text, apiKey, model, summaryLevel) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('缺少 DeepSeek API 密钥')
  }
  const prompt = (summaryLevel && CARD_GENERATION_PROMPT_BY_LEVEL[summaryLevel]) || CARD_GENERATION_PROMPT
  try {
    const response = await httpPost(DEEPSEEK_API_URL, {
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
      console.error('[deepseek-generate] HTTP 错误:', response.status, msg)
      throw new Error('DeepSeek: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) {
      throw new Error('DeepSeek 未返回有效内容')
    }
    return { content, tokens }
  } catch (err) {
    console.error('[deepseek-generate] 调用失败:', err?.message)
    throw new Error('DeepSeek 调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function extractTextFromImage(base64Image, apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('缺少 DeepSeek API 密钥')
  }
  const imageDataUrl = 'data:image/jpeg;base64,' + base64Image
  try {
    const response = await httpPost(DEEPSEEK_API_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model: 'deepseek-vl',
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
      console.error('[deepseek-ocr] HTTP 错误:', response.status, msg)
      throw new Error('DeepSeek: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content
    const tokens = response.data?.usage?.total_tokens || 0
    if (!content) {
      throw new Error('DeepSeek 未识别到图片中的文字')
    }
    return { content, tokens }
  } catch (err) {
    console.error('[deepseek-ocr] 调用失败:', err?.message)
    throw new Error('DeepSeek 调用失败: ' + (err?.message || '未知错误'))
  }
}

export async function testApiConnection(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('缺少 DeepSeek API 密钥')
  }
  try {
    const response = await httpPost(DEEPSEEK_API_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model: 'deepseek-v4-pro',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      },
      timeout: 15000,
    })

    if (!response.ok) {
      const msg = response.data?.error?.message || '连接失败 (' + response.status + ')'
      throw new Error(msg)
    }
    return { ok: true, tokens: response.data?.usage?.total_tokens || 0 }
  } catch (err) {
    console.error('[deepseek-test] 测试失败:', err?.message)
    throw err
  }
}

export async function processAndGenerateCards(text, apiKey, model) {
  const aiRawText = await generateCards(text, apiKey, model)
  const parsed = parseAIResponse(aiRawText.content, { strictMode: true })
  if (!parsed) {
    return null
  }
  return parsed.units
}

// 根据用户已编辑的知识点，重新生成问题/答案。返回 { knowledge_point, front, back }
export async function regenerateCardFromKnowledgePoint(knowledgePoint, apiKey, model, summaryLevel) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('缺少 DeepSeek API 密钥')
  }
  const prompt = buildRegenerateCardPrompt(knowledgePoint, summaryLevel)
  const response = await httpPost(DEEPSEEK_API_URL, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    data: {
      model: model || 'deepseek-v4-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    },
    timeout: 30000,
  })
  if (!response.ok) {
    const msg = response.data?.error?.message || '请求失败 (' + response.status + ')'
    throw new Error('DeepSeek: ' + msg)
  }
  const content = response.data?.choices?.[0]?.message?.content
  const tokens = response.data?.usage?.total_tokens || 0
  if (!content) throw new Error('DeepSeek 未返回有效内容')
  const parsed = parseAIResponse(content, { strictMode: true })
  if (parsed && Array.isArray(parsed.units) && parsed.units.length > 0) {
    // 兼容 AI 按照多单元返回的情况
    const firstCard = parsed.units[0].cards?.[0]
    if (firstCard) return { ...firstCard, tokens }
  }
  // 退回到直接解析 JSON 对象
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
