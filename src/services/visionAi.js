/**
 * 通用AI视觉识别适配器
 *
 * 调用任意 OpenAI 兼容的 /v1/chat/completions 端点进行图文识别。
 * 支持同时发送文字 prompt + 图片 base64 的多模态请求。
 * 当用户在「图像识别 → AI 大模型视觉」中配置了独立的通用AI时，
 * 图像识别优先使用此适配器，未配置时降级到主 AI 服务。
 */

import { httpPost } from '../utils/httpClient'

const OCR_PROMPT =
  '请识别图片中的所有文字，保持原文格式输出，包括段落、列表、标题等。不要添加任何额外说明或注释。'

/**
 * 调用通用 OpenAI 兼容视觉 API 识别图片文字
 *
 * @param {string} base64Image - base64 编码的图片数据（不含 data:image 前缀）
 * @param {string} apiUrl - API 端点 URL（如 https://api.example.com/v1/chat/completions）
 * @param {string} apiKey - API Key
 * @param {string} model - 模型名称（如 gpt-4o, qwen-vl-max, doubao-vision-pro 等）
 * @param {object} [options] - 可选参数
 * @param {string} [options.prompt] - 自定义提示词，默认使用 OCR_PROMPT
 * @param {number} [options.maxTokens] - 最大 token 数，默认 4096
 * @param {number} [options.timeout] - 超时毫秒，默认 60000
 * @returns {Promise<{content: string, tokens: number}>}
 */
export async function extractTextWithVisionAi(
  base64Image,
  apiUrl,
  apiKey,
  model,
  options = {},
) {
  if (!apiUrl) throw new Error('未配置通用AI视觉服务地址')
  if (!apiKey) throw new Error('未配置通用AI视觉 API Key')
  if (!model) throw new Error('未配置通用AI视觉模型名称')

  const prompt = options.prompt || OCR_PROMPT
  const maxTokens = options.maxTokens || 4096
  const timeout = options.timeout || 60000

  const imageDataUrl = 'data:image/jpeg;base64,' + base64Image
  const url = apiUrl.replace(/\/$/, '') + '/v1/chat/completions'

  try {
    const response = await httpPost(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: maxTokens,
      },
      timeout,
    })

    if (!response.ok) {
      const msg =
        response.data?.error?.message || '图片识别失败 (' + response.status + ')'
      console.error('[vision-ai-ocr] HTTP 错误:', response.status, msg)
      throw new Error('通用AI视觉: ' + msg)
    }

    const content = response.data?.choices?.[0]?.message?.content
    const tokens = response.data?.usage?.total_tokens || 0

    if (!content) {
      throw new Error('通用AI视觉未识别到图片中的文字')
    }

    return { content, tokens }
  } catch (err) {
    console.error('[vision-ai-ocr] 调用失败:', err?.message)
    throw new Error('通用AI视觉调用失败: ' + (err?.message || '未知错误'))
  }
}

/**
 * 测试通用AI视觉连接
 *
 * @param {string} apiUrl
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testVisionAiConnection(apiUrl, apiKey, model) {
  if (!apiUrl) return { ok: false, message: '未填写 API 地址' }
  if (!apiKey) return { ok: false, message: '未填写 API Key' }
  if (!model) return { ok: false, message: '未填写模型名称' }

  try {
    const cleanUrl = apiUrl.replace(/\/$/, '') + '/v1/chat/completions'
    const response = await httpPost(cleanUrl, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        model,
        messages: [{ role: 'user', content: '返回"ok"' }],
        max_tokens: 10,
      },
      timeout: 15000,
    })

    if (response.ok) {
      return { ok: true, message: '连接成功！通用AI视觉服务可用' }
    }

    const msg = response.data?.error?.message || ''
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'API Key 无效或未授权', detail: msg }
    }
    return { ok: false, message: `服务器返回错误 (${response.status})`, detail: msg }
  } catch (err) {
    return { ok: false, message: '无法连接到服务，请检查 URL 和网络', detail: err?.message }
  }
}
