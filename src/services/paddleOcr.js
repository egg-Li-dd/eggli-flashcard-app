/**
 * PaddleOCR 自建服务调用
 *
 * 调用约定的 HTTP 接口（POST {serverUrl}/ocr）：
 *   请求体：{ "image": "<base64 无 data:前缀>", "language": "ch" }
 *   可选 Header：Authorization: Bearer <token>
 *   响应体：{ "ok": true, "text": "识别结果文本", "boxes": [...] }
 *
 * 服务端脚本见项目根目录 paddleocr_server/server.py
 */

const TIMEOUT_MS = 30000

function buildBaseUrl(serverUrl) {
  let url = (serverUrl || '').trim().replace(/\/+$/, '')
  if (!url) throw new Error('PaddleOCR 服务地址未配置')
  // 自动补 /ocr 后缀，允许用户只填到根路径
  if (!/\/ocr$/.test(url)) url += '/ocr'
  return url
}

function stripBase64Prefix(base64) {
  if (!base64) return ''
  // 形如 data:image/png;base64,xxxx
  const idx = base64.indexOf(',')
  return idx >= 0 && base64.slice(0, idx).includes('base64')
    ? base64.slice(idx + 1)
    : base64
}

/**
 * 调用自建 PaddleOCR 服务识别图片文字。
 * @param {string} base64Image 图片 base64 字符串（可带 data: 前缀）
 * @param {string} serverUrl 服务地址（如 http://192.168.1.100:8000）
 * @param {string} apiToken 可选 Bearer Token
 * @param {string} language 语言代码（ch / en / multilingual）
 * @returns {Promise<{ content: string, tokens: number }>}
 */
export async function extractTextWithPaddleOcr(base64Image, serverUrl, apiToken, language) {
  const url = buildBaseUrl(serverUrl)
  const image = stripBase64Prefix(base64Image)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiToken && apiToken.trim()) {
      headers['Authorization'] = 'Bearer ' + apiToken.trim()
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        image,
        language: language || 'ch',
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`PaddleOCR 服务返回 ${resp.status}：${errText.slice(0, 120)}`)
    }
    const data = await resp.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      throw new Error('PaddleOCR 服务返回格式异常')
    }
    if (data.ok === false) {
      throw new Error('PaddleOCR 识别失败：' + (data.error || '未知错误'))
    }
    const text = (data.text || '').toString()
    if (!text.trim()) {
      throw new Error('PaddleOCR 未识别到任何文字，请检查图片清晰度或更换图片')
    }
    return { content: text, tokens: data.tokens || 0 }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('PaddleOCR 服务请求超时（30s），请检查服务地址与网络')
    }
    if (err.message && /Failed to fetch|NetworkError/i.test(err.message)) {
      throw new Error('无法连接 PaddleOCR 服务，请确认服务已启动且地址正确')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 测试 PaddleOCR 服务连通性（调用 /health 接口）。
 * @param {string} serverUrl
 * @param {string} apiToken
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testPaddleOcrConnection(serverUrl, apiToken) {
  let base = (serverUrl || '').trim().replace(/\/+$/, '')
  if (!base) return { ok: false, message: '请填写 PaddleOCR 服务地址' }
  const url = base + '/health'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const headers = {}
    if (apiToken && apiToken.trim()) headers['Authorization'] = 'Bearer ' + apiToken.trim()
    const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    if (!resp.ok) {
      return { ok: false, message: `服务返回 ${resp.status}` }
    }
    const data = await resp.json().catch(() => ({}))
    const ver = data.version ? `v${data.version}` : '未知版本'
    const lang = data.languages ? `，支持语言：${data.languages}` : ''
    return { ok: true, message: `连接成功（${ver}${lang}）` }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, message: '连接超时（8s），请检查地址' }
    }
    if (/Failed to fetch|NetworkError/i.test(err.message)) {
      return { ok: false, message: '无法连接服务，请确认地址与启动状态' }
    }
    return { ok: false, message: err.message || '未知错误' }
  } finally {
    clearTimeout(timer)
  }
}
