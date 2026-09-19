/**
 * 百度智能云通用文字识别调用
 *
 * 文档：https://cloud.baidu.com/doc/OCR/s/Ck3h7y2ia
 * 流程：
 *   1. 用 AK/SK 换取 access_token（缓存有效期）
 *   2. POST https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic
 *      参数：image=<urlencoded base64>，language_type=CHN_ENG
 *
 * 每月免费额度 1000 次（通用文字识别标准版），超出按次计费。
 */

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic'
const TIMEOUT_MS = 30000

// 简单内存缓存（access_token 有效期 30 天）
let cachedToken = { apiKey: '', secretKey: '', token: '', expiresAt: 0 }

async function getAccessToken(apiKey, secretKey) {
  if (!apiKey || !secretKey) throw new Error('请填写百度智能云 OCR 的 API Key 与 Secret Key')
  // 命中缓存
  if (
    cachedToken.apiKey === apiKey &&
    cachedToken.secretKey === secretKey &&
    cachedToken.token &&
    Date.now() < cachedToken.expiresAt - 60_000
  ) {
    return cachedToken.token
  }
  const url = `${TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const resp = await fetch(url, { method: 'GET', signal: controller.signal })
    if (!resp.ok) throw new Error(`获取 access_token 失败：${resp.status}`)
    const data = await resp.json().catch(() => null)
    if (!data || !data.access_token) {
      throw new Error('获取 access_token 失败：' + (data?.error_description || '未知错误'))
    }
    cachedToken = {
      apiKey,
      secretKey,
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 2592000) * 1000,
    }
    return data.access_token
  } finally {
    clearTimeout(timer)
  }
}

function stripBase64Prefix(base64) {
  if (!base64) return ''
  const idx = base64.indexOf(',')
  return idx >= 0 && base64.slice(0, idx).includes('base64')
    ? base64.slice(idx + 1)
    : base64
}

/**
 * 调用百度智能云 OCR 识别图片。
 * @param {string} base64Image
 * @param {string} apiKey 百度智能云 API Key
 * @param {string} secretKey 百度智能云 Secret Key
 * @returns {Promise<{ content: string, tokens: number }>}
 */
export async function extractTextWithBaiduOcr(base64Image, apiKey, secretKey) {
  const token = await getAccessToken(apiKey, secretKey)
  const image = stripBase64Prefix(base64Image)
  const url = `${OCR_URL}?access_token=${encodeURIComponent(token)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
      body: `image=${encodeURIComponent(image)}&language_type=CHN_ENG&detect_direction=false&paragraph=false&probability=false`,
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`百度 OCR 返回 ${resp.status}：${errText.slice(0, 120)}`)
    }
    const data = await resp.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      throw new Error('百度 OCR 返回格式异常')
    }
    if (data.error_code) {
      throw new Error(`百度 OCR 错误 [${data.error_code}]：${data.error_msg || '未知'}`)
    }
    const words = Array.isArray(data.words_result) ? data.words_result : []
    const text = words.map((w) => w.words || '').join('\n')
    if (!text.trim()) {
      throw new Error('百度 OCR 未识别到任何文字')
    }
    return { content: text, tokens: 0 }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('百度 OCR 请求超时（30s）')
    }
    if (/Failed to fetch|NetworkError/i.test(err.message)) {
      throw new Error('无法连接百度智能云服务，请检查网络')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 测试百度智能云 OCR 配置是否正确（尝试换取 access_token）。
 */
export async function testBaiduOcrConnection(apiKey, secretKey) {
  try {
    await getAccessToken((apiKey || '').trim(), (secretKey || '').trim())
    return { ok: true, message: '鉴权成功，配置正确' }
  } catch (err) {
    return { ok: false, message: err.message || '鉴权失败' }
  }
}
