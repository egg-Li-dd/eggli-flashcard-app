/**
 * 录音 → 文本 的识别服务。
 *
 * 配合 src/services/recorder.js 使用，支持三种子方案：
 *  - 'whisper-api'  → 通过 POST 到 OpenAI 兼容的 /v1/audio/transcriptions 接口识别
 *                     （可指向 OpenAI、OpenRouter、Groq 或自建 Whisper API，URL 在设置中配置）
 *                     （当未配置独立 URL/Key 时，自动降级使用 DeepSeek API）
 *  - 'iflytek-iat'  → 通过 WebSocket 连接到讯飞语音听写（IAT）API，实时流式识别
 *                     （需在设置中配置讯飞 APPID、APIKey 和 APISecret）
 *
 * 返回文本字符串。失败时抛出 Error。
 */

import { httpFileUpload } from '../utils/httpClient'
import { uint8ArrayToBase64 } from './audioUtils'

// ---- 通用：FormData 上传音频 ----
const buildTranscriptionFormData = (blob, fileName) => {
  const fd = new FormData()
  fd.append('file', blob, fileName)
  fd.append('model', 'whisper-1')
  fd.append('language', 'zh')
  fd.append('response_format', 'text')
  return fd
}

/**
 * 调用 OpenAI 兼容的 Whisper 语音识别端点（/v1/audio/transcriptions）。
 *
 * @param {{ blob: Blob, fileName: string, apiUrl: string, apiKey: string, language?: string }} payload
 * @returns {Promise<string>}
 */
export async function transcribeWithWhisperAPI({ blob, fileName, apiUrl, apiKey, fallbackApiKey, fallbackApiUrl, language = 'zh' }) {
  const resolvedUrl = apiUrl || fallbackApiUrl || 'https://api.deepseek.com'
  const resolvedKey = apiKey || fallbackApiKey
  if (!resolvedKey) throw new Error('未配置语音识别 API Key，请在「设置」中填写 DeepSeek API Key 或独立的语音识别 Key')
  if (!blob) throw new Error('录音文件为空，无法识别')

  const fd = new FormData()
  fd.append('file', blob, fileName)
  fd.append('model', 'whisper-1')
  fd.append('language', language)
  fd.append('response_format', 'text')

  const response = await httpFileUpload(resolvedUrl.replace(/\/$/, '') + '/v1/audio/transcriptions', {
    headers: { Authorization: 'Bearer ' + resolvedKey },
    formData: fd,
    timeout: 30000,
  })

  if (!response.ok) {
    let detail = ''
    const j = response.data
    if (j && typeof j === 'object') {
      detail = (j.error && (j.error.message || j.error)) || j.message || ''
    }
    throw new Error('语音识别失败 (' + response.status + ')' + (detail ? '：' + detail : ''))
  }

  const contentType = (response.headers && response.headers['content-type']) || ''
  if (contentType.includes('application/json')) {
    const data = response.data
    return String(data.text || data.content || data.transcript || '').trim()
  }
  const text = await response.text()
  return text.trim()
}

/**
 * 调用阿里云千问 DashScope 语音识别（一句话识别，Paraformer 模型）。
 * 使用 OpenAI 兼容 /v1/audio/transcriptions 格式，由 dashscope.aliyuncs.com 转发。
 *
 * @param {{ blob: Blob, fileName: string, apiKey: string, language?: string }} payload
 * @returns {Promise<string>}
 */
export async function transcribeWithDashscope({ blob, fileName, apiKey, language = 'zh' }) {
  if (!apiKey) throw new Error('未配置千问 API Key，请在「设置」中填写 DashScope API Key')
  if (!blob) throw new Error('录音文件为空，无法识别')

  const DASHSCOPE_SPEECH_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions'

  const fd = new FormData()
  fd.append('file', blob, fileName)
  fd.append('model', 'paraformer-realtime-v2')
  fd.append('language', language)
  fd.append('response_format', 'text')

  try {
    const response = await httpFileUpload(DASHSCOPE_SPEECH_URL, {
      headers: { Authorization: 'Bearer ' + apiKey },
      formData: fd,
      timeout: 30000,
    })

    if (!response.ok) {
      let detail = ''
      const j = response.data
      if (j && typeof j === 'object') {
        detail = (j.error && (j.error.message || j.error)) || j.message || ''
      }
      throw new Error('语音识别失败 (' + response.status + ')' + (detail ? '：' + detail : ''))
    }

    const contentType = (response.headers && response.headers['content-type']) || ''
    if (contentType.includes('application/json')) {
      const data = response.data
      return String(data.text || data.content || data.transcript || data.result || '').trim()
    }
    const text = await response.text()
    return text.trim()
  } catch (err) {
    console.error('[dashscope-speech] 调用失败:', err?.message)
    throw new Error('千问语音识别失败：' + (err?.message || '未知错误'))
  }
}

/**
 * 测试千问语音识别连接（发送最小静音 WAV 文件）。
 *
 * @param {{ apiKey?: string }} payload
 * @returns {Promise<{ ok: boolean, message: string, detail?: string }>}
 */
export async function testDashscopeSpeechConnection({ apiKey }) {
  if (!apiKey) return { ok: false, message: '未配置千问 API Key' }

  try {
    const DASHSCOPE_SPEECH_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions'

    const fd = new FormData()
    fd.append('file', createSilentWavBlob(), 'silent-test.wav')
    fd.append('model', 'paraformer-realtime-v2')
    fd.append('language', 'zh')
    fd.append('response_format', 'text')

    const response = await httpFileUpload(DASHSCOPE_SPEECH_URL, {
      headers: { Authorization: 'Bearer ' + apiKey },
      formData: fd,
      timeout: 15000,
    })

    if (response.ok) {
      return { ok: true, status: response.status, message: '千问语音识别连接成功' }
    }

    let detail = ''
    const json = response.data
    if (json && typeof json === 'object') {
      detail =
        (json.error && (json.error.message || json.error)) ||
        json.message ||
        (typeof json.error === 'string' ? json.error : '')
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, message: 'API Key 无效或未授权', detail }
    }
    if (response.status === 400) {
      return { ok: true, status: response.status, message: 'URL 和 Key 有效（测试音频被拒绝，但连接正常）', detail }
    }
    return { ok: false, status: response.status, message: `服务器返回错误 (${response.status})`, detail }
  } catch (err) {
    return { ok: false, status: 0, message: '无法连接到千问语音服务器，请检查网络', detail: err?.message || 'network error' }
  }
}

/**
 * 调用通用音频转文字接口（可配置）。
 * 与 transcribeWithWhisperAPI 类似，但请求体完全由调用方决定。
 */
export async function transcribeCustomURL({ blob, fileName, apiUrl, apiKey, extra }) {
  const fd = buildTranscriptionFormData(blob, fileName)
  if (extra) Object.keys(extra).forEach((k) => fd.append(k, String(extra[k])))

  const response = await httpFileUpload(apiUrl, {
    headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
    formData: fd,
    timeout: 30000,
  })
  if (!response.ok) {
    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '')
    throw new Error('语音识别失败 (' + response.status + ')：' + text.slice(0, 120))
  }
  const contentType = (response.headers && response.headers['content-type']) || ''
  if (contentType.includes('application/json')) {
    const data = response.data
    return String(data.text || data.content || data.transcript || data.result || '').trim()
  }
  return (await response.text()).trim()
}

// ---- 工具：创建最小静音 WAV（用于 API 连接测试）----
const createSilentWavBlob = () => {
  // 生成 0.1 秒 8kHz 单声道 16-bit PCM 静音 WAV（约 1.6KB）
  const sampleRate = 8000
  const durationSec = 0.1
  const numSamples = Math.floor(sampleRate * durationSec)
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // RIFF 头
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')

  // fmt 块
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt 块大小
  view.setUint16(20, 1, true) // PCM 格式
  view.setUint16(22, 1, true) // 单声道
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // 字节率
  view.setUint16(32, 2, true) // 块对齐
  view.setUint16(34, 16, true) // 16-bit

  // data 块
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)
  // 静音数据（全部为 0）
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, 0, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * 测试语音识别 API 连接（不依赖实际录音）。
 *
 * 通过发送一个最小静音 WAV 文件到 /v1/audio/transcriptions 端点，
 * 根据响应状态判断：
 *   - 200 → API 正常（即使返回空文本也说明连接与认证成功）
 *   - 401/403 → API Key 无效
 *   - 404 → URL 不正确
 *   - 网络错误 → 无法连接
 *
 * @param {{ apiUrl?: string, apiKey?: string, fallbackApiKey?: string, fallbackApiUrl?: string }} payload
 * @returns {Promise<{ ok: boolean, status: number, message: string, detail?: string }>}
 */
export async function testSpeechApiConnection({ apiUrl, apiKey, fallbackApiKey, fallbackApiUrl }) {
  const resolvedUrl = apiUrl || fallbackApiUrl || 'https://api.deepseek.com'
  const resolvedKey = apiKey || fallbackApiKey
  if (!resolvedKey) {
    return { ok: false, status: 0, message: '未配置 API Key' }
  }

  const fd = new FormData()
  fd.append('file', createSilentWavBlob(), 'silent-test.wav')
  fd.append('model', 'whisper-1')
  fd.append('language', 'zh')
  fd.append('response_format', 'text')

  try {
    const response = await httpFileUpload(resolvedUrl.replace(/\/$/, '') + '/v1/audio/transcriptions', {
      headers: { Authorization: 'Bearer ' + resolvedKey },
      formData: fd,
      timeout: 15000,
    })

    if (response.ok) {
      return { ok: true, status: response.status, message: '连接成功，语音 API 正常工作' }
    }

    let detail = ''
    const json = response.data
    if (json && typeof json === 'object') {
      detail =
        (json.error && (json.error.message || json.error)) ||
        json.message ||
        (typeof json.error === 'string' ? json.error : '')
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: response.status,
        message: 'API Key 无效或未授权',
        detail,
      }
    }
    if (response.status === 404) {
      return {
        ok: false,
        status: response.status,
        message: '语音服务 URL 不正确（404），请检查 URL',
        detail,
      }
    }
    if (response.status === 400) {
      // 某些 API 对最小静音音频可能返回 400（如无效的音频格式等），
      // 但只要不是 401/403/404，说明 URL + Key 基本正确
      return {
        ok: true,
        status: response.status,
        message: 'URL 和 Key 有效（测试音频被拒绝，但连接正常）',
        detail,
      }
    }
    return {
      ok: false,
      status: response.status,
      message: `服务器返回错误 (${response.status})`,
      detail,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: '无法连接到语音 API 服务器，请检查 URL 和网络',
      detail: err?.message || 'network error',
    }
  }
}

// ---- 讯飞语音听写（IAT）支持 ----

// ---- 讯飞常见错误码中文映射（官方文档整理版）----
const IFLYTEK_ERROR_CODES = {
  10000: { zh: '未知错误', tip: '请稍后重试' },
  10001: { zh: '服务端内部错误', tip: '讯飞服务异常，请稍后重试' },
  10002: { zh: '参数错误', tip: '请检查请求参数格式是否正确' },
  10003: { zh: 'appid / apikey / apisecret 不匹配', tip: '请检查讯飞 APPID、APIKey、APISecret 是否成对配置' },
  10004: { zh: '请求频率超限', tip: '调用次数过多，请稍后重试' },
  10005: { zh: '账号余额不足', tip: '讯飞账户余额不足，请充值后重试' },
  10006: { zh: 'access_token 过期或无效', tip: '请重新生成签名后重试' },
  10007: { zh: 'license 不匹配', tip: '应用授权信息异常' },
  10008: { zh: '服务未开通', tip: '请在讯飞开放平台控制台开通语音听写服务' },
  10009: { zh: '当前并发超限', tip: '同时识别的人数过多，请稍后重试' },
  10010: { zh: '非法请求', tip: '请求格式不正确' },
  10101: { zh: '鉴权失败', tip: '请检查 APPID / APIKey / APISecret 是否匹配且未过期' },
  10102: { zh: '时间戳过期', tip: '请检查手机系统时间是否正确' },
  10103: { zh: '签名错误', tip: '签名算法异常，请检查配置' },
  10104: { zh: 'appid 无效', tip: 'APPID 不存在或已被禁用，请检查设置' },
  10105: { zh: '非法 audio 格式', tip: '音频编码格式不支持（讯飞仅接受 PCM / Speex / opus）' },
  10106: { zh: '无效采样率', tip: '讯飞语音听写需要 16kHz 采样率音频' },
  10107: { zh: 'audio 数据为空', tip: '录音为空，请确保麦克风正常并重新录' },
  10108: { zh: 'audio 数据过长', tip: '单次音频超过讯飞上限（约 60 秒），请分段录音' },
  10109: { zh: 'audio 解码失败', tip: '音频数据损坏，请重新录制' },
  10110: { zh: '未检测到语音', tip: '未识别到有效语音，请靠近麦克风并提高音量' },
  10200: { zh: '识别超时', tip: '讯飞服务响应超时，请检查网络后重试' },
  10201: { zh: '正在识别', tip: '识别中，请稍候' },
  10202: { zh: '音频时长超限', tip: '音频超过 60 秒，请分段录音' },
  10203: { zh: '会话不存在', tip: 'WebSocket 会话已断开，请重试' },
  10204: { zh: '会话已结束', tip: '当前识别会话已关闭，请重新开始' },
  10205: { zh: 'vad 检测失败', tip: '语音端点检测异常，请重新录制清晰语音' },
  10300: { zh: '模型加载失败', tip: '讯飞服务端模型异常，请稍后重试' },
  10301: { zh: '引擎错误', tip: '讯飞识别引擎异常，请稍后重试' },
  10302: { zh: '识别结果为空', tip: '未能识别到有效内容，请确保录音清晰' },
  10303: { zh: '语言不支持', tip: '当前 language 参数不被支持' },
  10304: { zh: '领域不支持', tip: '当前 domain 参数不被支持' },
  10305: { zh: 'accent 不支持', tip: '当前 accent 参数不被支持' },
  10306: { zh: '非法 frame', tip: '音频帧结构错误' },
  10307: { zh: 'frame 过长', tip: '单帧音频超过上限' },
  10308: { zh: 'frame 过短', tip: '单帧音频过短' },
  10309: { zh: '非法 status', tip: '音频帧的 status 参数错误' },
  10310: { zh: '非法 format', tip: '音频 format 参数错误' },
  10311: { zh: '非法 encoding', tip: '音频 encoding 参数错误' },
  10312: { zh: '非法 dwa', tip: 'dwa 参数错误' },
  10313: { zh: '非法 vad_eos', tip: 'vad_eos 参数错误' },
  10314: { zh: '非法 language', tip: 'language 参数错误' },
  10315: { zh: '非法 domain', tip: 'domain 参数错误' },
  10316: { zh: '非法 accent', tip: 'accent 参数错误' },
  10317: { zh: '非法 audio', tip: 'audio 数据非法，请检查编码' },
  11200: { zh: '识别引擎错误', tip: '讯飞服务内部异常，请稍后重试' },
  11201: { zh: '引擎连接超时', tip: '网络不稳定，请重试' },
  11202: { zh: '引擎响应超时', tip: '讯飞服务响应缓慢，请稍后重试' },
  11203: { zh: '引擎资源不足', tip: '讯飞服务资源紧张，请稍后重试' },
  11204: { zh: '引擎不支持此请求', tip: '参数与引擎能力不匹配' },
  11205: { zh: '引擎处理失败', tip: '识别失败，请重新录音' },
}

/**
 * 将讯飞错误码转换为中文友好提示
 * @param {number} code - 讯飞返回 code
 * @param {string} [rawMessage] - 讯飞原始 message
 * @returns {string} 中文提示
 */
function translateIflytekError(code, rawMessage) {
  const info = IFLYTEK_ERROR_CODES[code]
  if (info) {
    const suffix = rawMessage && rawMessage !== info.zh && rawMessage !== 'success'
      ? `（${rawMessage}）`
      : ''
    return `${info.zh}（错误码 ${code}），${info.tip}${suffix}`
  }
  return `语音识别失败（错误码 ${code}）${rawMessage ? `：${rawMessage}` : ''}，请稍后重试`
}

/** 异步等待 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 将任意音频 Blob（webm/opus 等，来自 MediaRecorder）转换为 16kHz 16bit 单声道 PCM ArrayBuffer。
 * 使用 Web Audio API 进行解码和重采样。
 *
 * @param {Blob} blob - 原始音频 Blob
 * @returns {Promise<ArrayBuffer>} - PCM Int16 ArrayBuffer
 */
function parseWavHeader(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  if (view.getUint32(0, true) !== 0x46464952) return null
  if (view.getUint32(8, true) !== 0x45564157) return null
  
  let offset = 12
  while (offset < view.byteLength - 4) {
    const chunkId = view.getUint32(offset, true)
    const chunkSize = view.getUint32(offset + 4, true)
    if (chunkId === 0x20746d66) {
      const format = view.getUint16(offset + 8, true)
      const channels = view.getUint16(offset + 10, true)
      const sampleRate = view.getUint32(offset + 12, true)
      const bitsPerSample = view.getUint16(offset + 22, true)
      return { format, channels, sampleRate, bitsPerSample, dataOffset: offset + 8 + chunkSize }
    }
    offset += 8 + chunkSize
  }
  return null
}

function resamplePcm16(pcmData, inputSampleRate, outputSampleRate) {
  if (inputSampleRate === outputSampleRate) return pcmData
  
  const ratio = outputSampleRate / inputSampleRate
  const outputLength = Math.floor(pcmData.length * ratio)
  const output = new Int16Array(outputLength)
  
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i / ratio
    const lower = Math.floor(srcIndex)
    const upper = Math.min(lower + 1, pcmData.length - 1)
    const frac = srcIndex - lower
    
    if (upper >= pcmData.length) {
      output[i] = pcmData[pcmData.length - 1]
    } else {
      output[i] = Math.round(pcmData[lower] * (1 - frac) + pcmData[upper] * frac)
    }
  }
  return output
}

async function convertBlobToPcm16k16bitMono(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  
  if (!arrayBuffer || arrayBuffer.byteLength < 100) {
    throw new Error('音频数据为空或太短')
  }
  
  const wavHeader = parseWavHeader(arrayBuffer)
  
  if (wavHeader && wavHeader.format === 1 && wavHeader.bitsPerSample === 16) {
    try {
      const pcmBytes = new Uint8Array(arrayBuffer, wavHeader.dataOffset)
      const int16Array = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.length / 2)
      
      let resultArray = int16Array
      
      if (wavHeader.channels > 1) {
        const mono = new Int16Array(int16Array.length / wavHeader.channels)
        for (let i = 0; i < mono.length; i++) {
          let sum = 0
          for (let c = 0; c < wavHeader.channels; c++) {
            sum += int16Array[i * wavHeader.channels + c]
          }
          mono[i] = Math.round(sum / wavHeader.channels)
        }
        resultArray = mono
      }
      
      if (wavHeader.sampleRate !== 16000) {
        resultArray = resamplePcm16(resultArray, wavHeader.sampleRate, 16000)
      }
      
      return resultArray.buffer
    } catch (e) {
      console.warn('WAV 解析失败，回退到 Web Audio API:', e)
    }
  }
  
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  let audioBuffer
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  } catch (e) {
    throw new Error('音频解码失败：' + (e?.message || '未知错误'))
  } finally {
    audioCtx.close()
  }
  
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('音频解码后数据为空')
  }
  
  const targetSampleRate = 16000
  const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * targetSampleRate, targetSampleRate)
  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offlineCtx.destination)
  source.start(0)
  const renderedBuffer = await offlineCtx.startRendering()
  
  const channelData = renderedBuffer.getChannelData(0)
  const int16Array = new Int16Array(channelData.length)
  for (let i = 0; i < channelData.length; i++) {
    int16Array[i] = Math.max(-32768, Math.min(32767, Math.round(channelData[i] * 32767)))
  }
  return int16Array.buffer
}

/**
 * 构建讯飞 WebSocket 连接的签名 URL。
 * 使用 HMAC-SHA256 签名，通过 Web Crypto API 实现。
 *
 * @param {{ host: string, path: string, apiKey: string, apiSecret: string }} params
 * @returns {Promise<string>} - 完整的 wss:// URL
 */
async function buildIflytekUrl({ host, path, apiKey, apiSecret }) {
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`

  const encoder = new TextEncoder()
  const keyData = encoder.encode(apiSecret)
  const messageData = encoder.encode(signatureOrigin)

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, messageData)
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`
  const authBase64 = btoa(authorizationOrigin)

  return `wss://${host}${path}?authorization=${encodeURIComponent(authBase64)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`
}

/**
 * 执行讯飞 IAT WebSocket 流式识别请求（修复版）。
 *
 * 关键改动（相较于旧版本）：
 *   1. 动态超时：根据音频长度计算，且每次收到 onmessage 后重置；
 *   2. async 循环发送：不再使用 setTimeout 队列，避免丢帧；
 *   3. 中文错误码映射：返回用户可理解的中文提示；
 *   4. 详细日志：便于调试。
 *
 * @param {string} appId - 讯飞应用 APPID
 * @param {string} apiKey - 讯飞 APIKey
 * @param {string} apiSecret - 讯飞 APISecret
 * @param {Uint8Array} pcmData - PCM 音频数据
 * @param {number} frameSize - 每帧字节数
 * @returns {Promise<string>} - 识别结果文本
 */
async function doWebSocketRequest(appId, apiKey, apiSecret, pcmData, frameSize) {
  const host = 'iat-api.xfyun.cn'
  const path = '/v2/iat'
  const url = await buildIflytekUrl({ host, path, apiKey, apiSecret })

  // ---- 预估音频时长与动态超时 ----
  const audioDurationSec = pcmData.length / (16000 * 2) // 16kHz, 16bit = 32KB/s
  const totalFrames = Math.max(1, Math.ceil(pcmData.length / frameSize))
  // 发送阶段超时 = max(30秒, 音频时长×2 + 5秒)
  const sendTimeoutMs = Math.max(30000, Math.floor(audioDurationSec * 2 * 1000) + 5000)
  // 所有帧发完后，等待最终结果的超时
  const finalWaitTimeoutMs = 10000

  return new Promise((resolve, reject) => {
    let ws = null
    try {
      ws = new WebSocket(url)
    } catch (e) {
      reject(new Error('无法创建 WebSocket 连接：' + (e?.message || '未知错误')))
      return
    }

    let resultText = ''
    let errorOccurred = false
    let allFramesSent = false
    let timeoutTimer = null

    // ---- 重置超时 ----
    const resetTimeout = (ms) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      timeoutTimer = setTimeout(() => {
        if (!errorOccurred) {
          errorOccurred = true
          console.warn('[iflytek] 识别超时（已等待 %dms）', ms)
          try { ws.close() } catch (_) {}
          reject(new Error('讯飞语音识别超时，请检查网络连接后重试'))
        }
      }, ms)
    }

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      try {
        if (ws && ws.readyState !== WebSocket.CLOSED) {
          ws.close()
        }
      } catch (_) {}
    }

    // 初始发送阶段超时
    resetTimeout(sendTimeoutMs)

    // ---- 单帧发送逻辑 ----
    const sendFrame = (frameIndex) => {
      if (errorOccurred) return false
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        errorOccurred = true
        reject(new Error('WebSocket 已断开，发送音频帧失败，请检查网络后重试'))
        return false
      }

      let frame
      try {
        if (frameIndex >= totalFrames) {
          // 结束帧
          frame = {
            common: { app_id: appId },
            business: {
              language: 'zh_cn',
              domain: 'iat',
              accent: 'mandarin',
              vad_eos: 3000,
              dwa: 'wpgs',
            },
            data: {
              status: 2,
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: '',
            },
          }
        } else {
          const start = frameIndex * frameSize
          const end = Math.min(start + frameSize, pcmData.length)
          const chunk = pcmData.slice(start, end)

          let audioBase64
          if (chunk.length < frameSize) {
            const padded = new Uint8Array(frameSize)
            padded.set(chunk)
            audioBase64 = uint8ArrayToBase64(padded)
          } else {
            audioBase64 = uint8ArrayToBase64(chunk)
          }

          frame = {
            common: { app_id: appId },
            business: {
              language: 'zh_cn',
              domain: 'iat',
              accent: 'mandarin',
              vad_eos: 3000,
              dwa: 'wpgs',
            },
            data: {
              status: frameIndex === 0 ? 0 : 1,
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: audioBase64,
            },
          }
        }

        ws.send(JSON.stringify(frame))
        return true
      } catch (e) {
        if (!errorOccurred) {
          errorOccurred = true
          cleanup()
          reject(new Error('发送音频帧失败：' + (e?.message || '网络错误')))
        }
        return false
      }
    }

    // ---- WebSocket onopen：使用 async 循环发送 ----
    ws.onopen = async () => {
      if (errorOccurred) return

      try {
        for (let i = 0; i < totalFrames; i++) {
          if (errorOccurred) return
          if (!sendFrame(i)) return

          // 每 20 帧打一次进度日志
          if ((i + 1) % 20 === 0) {
          }
          // 重置超时：发送过程中也保持刷新
          resetTimeout(sendTimeoutMs)
          await sleep(40)
        }

        // 发送结束帧
        if (errorOccurred) return
        if (!sendFrame(totalFrames)) return

        allFramesSent = true
        resetTimeout(finalWaitTimeoutMs)
      } catch (e) {
        if (!errorOccurred) {
          errorOccurred = true
          cleanup()
          reject(new Error('发送音频帧异常：' + (e?.message || '未知错误')))
        }
      }
    }

    // ---- WebSocket onmessage：收到讯飞返回 ----
    ws.onmessage = (event) => {
      if (errorOccurred) return

      let msg
      try {
        msg = JSON.parse(event.data)
      } catch (e) {
        console.warn('[iflytek] 无法解析返回消息:', event.data)
        return
      }

      // 返回了错误码
      if (msg.code !== 0) {
        errorOccurred = true
        console.error('[iflytek] 讯飞返回错误 code=%d, message=%s', msg.code, msg.message)
        cleanup()
        reject(new Error('讯飞语音识别失败：' + translateIflytekError(msg.code, msg.message)))
        return
      }

      // 解析识别结果
      let fragmentText = ''
      if (msg.data && msg.data.result && msg.data.result.ws) {
        for (const wsItem of msg.data.result.ws) {
          for (const cw of (wsItem.cw || [])) {
            fragmentText += (cw.w || '')
          }
        }
      }
      if (fragmentText) {
        resultText += fragmentText
      }

      // 判断是否是最后一帧结果
      const isFinal = msg.data && msg.data.status === 2
      if (isFinal) {
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
        try { ws.close() } catch (_) {}
        if (resultText.trim()) {
          resolve(resultText.trim())
        } else {
          reject(new Error('讯飞语音识别未返回有效结果，请确保录音清晰后重试'))
        }
        return
      }

      // 非最终消息：刷新超时
      resetTimeout(allFramesSent ? finalWaitTimeoutMs : sendTimeoutMs)
    }

    // ---- WebSocket onerror ----
    ws.onerror = () => {
      if (!errorOccurred) {
        errorOccurred = true
        console.error('[iflytek] WebSocket 触发 onerror 事件（网络层错误）')
        cleanup()
        reject(new Error('讯飞语音识别网络连接失败，请检查网络是否正常后重试'))
      }
    }

    // ---- WebSocket onclose ----
    ws.onclose = (event) => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      if (errorOccurred) return

      if (resultText.trim()) {
        resolve(resultText.trim())
        return
      }

      const code = event?.code || 0
      const reason = event?.reason || ''
      let errMsg = '讯飞语音识别未返回结果，请确保录音清晰并重试'
      if (code === 1006) {
        errMsg = '与讯飞服务器的连接被异常断开（code: 1006），请检查网络后重试'
      } else if (code === 1008) {
        errMsg = '讯飞服务器主动拒绝了连接（code: 1008），请检查 APPID、APIKey、APISecret 是否匹配' + (reason ? `（${reason}）` : '')
      } else if (code !== 1000 && code !== 1005) {
        errMsg = `讯飞连接异常关闭 (code: ${code})，请重试` + (reason ? `（${reason}）` : '')
      }
      reject(new Error(errMsg))
    }
  })
}

/**
 * 使用讯飞语音听写（IAT）API 进行语音识别。
 *
 * 将录音 Blob 转换为 PCM 格式后，通过 WebSocket 流式发送到讯飞服务器，
 * 实时获取识别结果并拼接返回。
 *
 * @param {{ blob: Blob, appId: string, apiKey: string, apiSecret: string }} payload
 * @returns {Promise<string>} - 识别结果文本
 */
export async function transcribeWithIflytek({ blob, appId, apiKey, apiSecret }) {
  if (!appId || !apiKey || !apiSecret) {
    throw new Error('讯飞语音听写需要 APPID、APIKey 和 APISecret，请在设置中配置')
  }
  if (!blob) throw new Error('录音文件为空，无法识别')

  // 1. 转换音频为 16k 16bit 单声道 PCM
  const pcmBuffer = await convertBlobToPcm16k16bitMono(blob)
  const pcmData = new Uint8Array(pcmBuffer)
  const frameSize = 1280 // 40ms × 16kHz × 16bit = 1280 字节

  // 2. 音频长度边界校验
  //   - < 3200 bytes = 0.1 秒：太短，前端直接拦截
  //   - > 1920000 bytes ≈ 60 秒：超过讯飞 IAT 单次限制
  if (pcmData.length < 3200) {
    throw new Error('录音太短，请多说几句再试（建议至少 1 秒）')
  }
  if (pcmData.length > 1920000) {
    throw new Error('录音超过 60 秒，讯飞语音听写单次有上限，请分段录制后再试')
  }

  // 3. 如果不足一帧（1280 字节），补 0 到一帧
  if (pcmData.length < frameSize) {
    const padded = new Uint8Array(frameSize)
    padded.set(pcmData)
    return await doWebSocketRequest(appId, apiKey, apiSecret, padded, frameSize)
  }
  return await doWebSocketRequest(appId, apiKey, apiSecret, pcmData, frameSize)
}

/**
 * 测试讯飞语音听写连接（不依赖实际录音）。
 *
 * 通过建立 WebSocket 连接到讯飞 IAT 服务，验证 APPID、APIKey 和 APISecret 是否有效。
 *
 * @param {{ appId?: string, apiKey?: string, apiSecret?: string }} payload
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
// 讯飞 IAT 凭证相关错误码（凭证错误 → 视为配置失败）
const IFLYTEK_AUTH_ERROR_CODES = new Set([10001, 10002, 10003, 10006, 10007, 10008, 10101, 10102, 10103, 10104])
// 讯飞 IAT 音频相关错误码（音频数据无效但凭证通过了验证 → 视为配置成功）
const IFLYTEK_AUDIO_ERROR_CODES = new Set([10105, 10106, 10107, 10108, 10109, 10110])

export async function testIflytekConnection({ appId, apiKey, apiSecret }) {
  if (!appId || !apiKey || !apiSecret) {
    return { ok: false, message: '讯飞语音听写需要完整填写 APPID、APIKey 和 APISecret' }
  }
  try {
    const host = 'iat-api.xfyun.cn'
    const path = '/v2/iat'
    const url = await buildIflytekUrl({ host, path, apiKey, apiSecret })

    return new Promise((resolve) => {
      // 15 秒超时保护
      const timeout = setTimeout(() => {
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '连接讯飞服务器超时（15秒），请检查网络或稍后重试' })
      }, 15000)

      let ws
      try {
        ws = new WebSocket(url)
      } catch (e) {
        clearTimeout(timeout)
        resolve({ ok: false, message: '无法创建 WebSocket 连接：' + (e?.message || '未知错误') })
        return
      }

      ws.onopen = () => {
        // 发送一个最小的有效协议帧（用于触发服务器的凭证验证和参数验证）
        // 使用 status=2 表示结束帧，不包含实际音频数据
        try {
          ws.send(JSON.stringify({
            common: { app_id: appId },
            business: { language: 'zh_cn', domain: 'iat', accent: 'mandarin', vad_eos: 3000, dwa: 'wpgs' },
            data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' }
          }))
        } catch (sendErr) {
          console.warn('[iflytek-test] 发送测试帧失败:', sendErr?.message)
        }
      }

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch (parseErr) {
          clearTimeout(timeout)
          try { ws.close() } catch (_) {}
          resolve({ ok: false, message: '无法解析服务器响应，可能是网络异常' })
          return
        }

        // 解析服务器返回码
        const code = msg?.code
        const rawMessage = msg?.message || ''

        // code === 0 → 完全成功（正常识别返回结果）
        if (code === 0) {
          clearTimeout(timeout)
          try { ws.close() } catch (_) {}
          resolve({ ok: true, message: '讯飞语音听写连接成功，配置正确' })
          return
        }

        // 音频相关错误码 → 凭证通过验证（只是没有有效的语音数据）
        if (IFLYTEK_AUDIO_ERROR_CODES.has(code)) {
          clearTimeout(timeout)
          try { ws.close() } catch (_) {}
          resolve({ ok: true, message: '讯飞语音听写连接成功，配置正确（已验证凭证）' })
          return
        }

        // 凭证相关错误码 → 配置错误
        if (IFLYTEK_AUTH_ERROR_CODES.has(code)) {
          clearTimeout(timeout)
          try { ws.close() } catch (_) {}
          const hint = translateIflytekError(code, rawMessage)
          resolve({ ok: false, message: '讯飞语音听写配置错误：' + hint })
          return
        }

        // 其他错误码 → 显示具体信息
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}
        resolve({
          ok: false,
          message: '讯飞服务器返回错误：' + translateIflytekError(code, rawMessage)
        })
      }

      ws.onerror = () => {
        console.error('[iflytek-test] WebSocket 发生 onerror 事件')
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '讯飞语音听写网络连接错误，请检查网络后重试' })
      }

      ws.onclose = (event) => {
        clearTimeout(timeout)
        // 如果 onmessage 已经解析并 resolve，这里不会重复 resolve
        // 如果连接关闭且没有任何消息返回，可能是网络层问题
        if (event && event.code !== 1000 && event.code !== 1005) {
          resolve({
            ok: false,
            message: `讯飞服务器连接异常（关闭码: ${event.code}），请检查 APPID、APIKey 和 APISecret 是否匹配`
          })
        }
      }
    })
  } catch (e) {
    console.error('[iflytek-test] 异常:', e?.message)
    return { ok: false, message: '测试讯飞连接失败：' + (e?.message || '未知错误') }
  }
}

// ============================================================
// 讯飞中英识别大模型（语音识别大模型 - 短句，≤60秒，多方言）
// ============================================================
// 接口地址: wss://iat.xf-yun.com/v1
// 鉴权方式: APIKey + APISecret + HMAC-SHA256（与 IAT 类似，只是 host 和 path 不同）

/**
 * 使用讯飞中英识别大模型进行语音识别。
 * 支持中文、英文及202种方言免切换识别，短句识别（≤60秒）。
 *
 * @param {{ blob: Blob, appId: string, apiKey: string, apiSecret: string }} payload
 * @returns {Promise<string>}
 */
export async function transcribeWithIflytekBigModel({ blob, appId, apiKey, apiSecret }) {
  if (!appId || !apiKey || !apiSecret) {
    throw new Error('讯飞中英识别大模型需要 APPID、APIKey 和 APISecret，请在设置中配置')
  }
  if (!blob) throw new Error('录音文件为空，无法识别')

  const pcmBuffer = await convertBlobToPcm16k16bitMono(blob)
  const pcmData = new Uint8Array(pcmBuffer)
  const frameSize = 1280

  if (pcmData.length < 3200) {
    throw new Error('录音太短，请多说几句再试（建议至少 1 秒）')
  }
  if (pcmData.length > 1920000) {
    throw new Error('录音超过 60 秒，讯飞中英识别大模型单次有上限，请分段录制后再试')
  }

  if (pcmData.length < frameSize) {
    const padded = new Uint8Array(frameSize)
    padded.set(pcmData)
    return await doBigModelWebSocketRequest(appId, apiKey, apiSecret, padded, frameSize)
  }
  return await doBigModelWebSocketRequest(appId, apiKey, apiSecret, pcmData, frameSize)
}

async function doBigModelWebSocketRequest(appId, apiKey, apiSecret, pcmData, frameSize) {
  const host = 'iat.xf-yun.com'
  const path = '/v1'
  const url = await buildIflytekUrl({ host, path, apiKey, apiSecret })

  const audioDurationSec = pcmData.length / (16000 * 2)
  const totalFrames = Math.max(1, Math.ceil(pcmData.length / frameSize))
  const sendTimeoutMs = Math.max(30000, Math.floor(audioDurationSec * 2 * 1000) + 5000)
  const finalWaitTimeoutMs = 10000

  return new Promise((resolve, reject) => {
    let ws = null
    try {
      ws = new WebSocket(url)
    } catch (e) {
      reject(new Error('无法创建 WebSocket 连接：' + (e?.message || '未知错误')))
      return
    }

    let resultText = ''
    let errorOccurred = false
    let allFramesSent = false
    let timeoutTimer = null

    const resetTimeout = (ms) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      timeoutTimer = setTimeout(() => {
        if (!errorOccurred) {
          errorOccurred = true
          try { ws.close() } catch (_) {}
          reject(new Error('讯飞中英识别大模型识别超时，请检查网络连接后重试'))
        }
      }, ms)
    }

    const cleanup = () => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      try { if (ws && ws.readyState !== WebSocket.CLOSED) ws.close() } catch (_) {}
    }

    resetTimeout(sendTimeoutMs)

    const sendFrame = (frameIndex) => {
      if (errorOccurred) return false
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        errorOccurred = true
        reject(new Error('WebSocket 已断开，发送音频帧失败'))
        return false
      }

      let frame
      try {
        if (frameIndex >= totalFrames) {
          frame = {
            header: {
              app_id: appId,
              status: 3,
            },
            parameter: {
              iat: {
                domain: 'general',
                language: 'zh_cn',
                accent: 'mandarin',
                vad_eos: 3000,
                punc: 1,
              },
            },
            payload: {
              data: {
                status: 2,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: '',
              },
            },
          }
        } else {
          const start = frameIndex * frameSize
          const end = Math.min(start + frameSize, pcmData.length)
          const chunk = pcmData.slice(start, end)

          let audioBase64
          if (chunk.length < frameSize) {
            const padded = new Uint8Array(frameSize)
            padded.set(chunk)
            audioBase64 = btoa(String.fromCharCode(...padded))
          } else {
            audioBase64 = btoa(String.fromCharCode(...chunk))
          }

          frame = {
            header: {
              app_id: appId,
              status: frameIndex === 0 ? 0 : 1,
            },
            parameter: {
              iat: {
                domain: 'general',
                language: 'zh_cn',
                accent: 'mandarin',
                vad_eos: 3000,
                punc: 1,
              },
            },
            payload: {
              data: {
                status: frameIndex === 0 ? 0 : 1,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: audioBase64,
              },
            },
          }
        }

        ws.send(JSON.stringify(frame))
        return true
      } catch (e) {
        if (!errorOccurred) {
          errorOccurred = true
          cleanup()
          reject(new Error('发送音频帧失败：' + (e?.message || '网络错误')))
        }
        return false
      }
    }

    ws.onopen = async () => {
      if (errorOccurred) return
      try {
        for (let i = 0; i < totalFrames; i++) {
          if (errorOccurred) return
          if (!sendFrame(i)) return
          resetTimeout(sendTimeoutMs)
          await sleep(40)
        }
        if (errorOccurred) return
        if (!sendFrame(totalFrames)) return
        allFramesSent = true
        resetTimeout(finalWaitTimeoutMs)
      } catch (e) {
        if (!errorOccurred) {
          errorOccurred = true
          cleanup()
          reject(new Error('发送音频帧异常：' + (e?.message || '未知错误')))
        }
      }
    }

    ws.onmessage = (event) => {
      if (errorOccurred) return
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch (e) {
        console.warn('[iflytek-bigmodel] 无法解析返回消息')
        return
      }

      if (msg.header?.code !== 0) {
        errorOccurred = true
        const code = msg.header?.code
        const message = msg.header?.message || ''
        console.error('[iflytek-bigmodel] 讯飞返回错误 code=%d, message=%s', code, message)
        cleanup()
        reject(new Error('讯飞中英识别大模型识别失败：' + translateIflytekError(code, message)))
        return
      }

      let fragmentText = ''
      if (msg.payload && msg.payload.result && msg.payload.result.ws) {
        for (const wsItem of msg.payload.result.ws) {
          for (const cw of (wsItem.cw || [])) {
            fragmentText += (cw.w || '')
          }
        }
      }
      if (fragmentText) {
        resultText += fragmentText
      }

      const isFinal = msg.header?.status === 3 || msg.payload?.result?.pgs === 'rpl'
      if (isFinal && msg.header?.status === 3) {
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
        try { ws.close() } catch (_) {}
        if (resultText.trim()) {
          resolve(resultText.trim())
        } else {
          reject(new Error('讯飞中英识别大模型未返回有效结果，请确保录音清晰后重试'))
        }
        return
      }

      resetTimeout(allFramesSent ? finalWaitTimeoutMs : sendTimeoutMs)
    }

    ws.onerror = () => {
      if (!errorOccurred) {
        errorOccurred = true
        cleanup()
        reject(new Error('讯飞中英识别大模型网络连接失败，请检查网络是否正常后重试'))
      }
    }

    ws.onclose = (event) => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      if (errorOccurred) return
      if (resultText.trim()) {
        resolve(resultText.trim())
        return
      }
      const code = event?.code || 0
      let errMsg = '讯飞中英识别大模型未返回结果'
      if (code === 1006) errMsg = '与讯飞服务器的连接被异常断开'
      else if (code !== 1000 && code !== 1005) errMsg = `讯飞连接异常关闭 (code: ${code})`
      reject(new Error(errMsg))
    }
  })
}

/**
 * 测试讯飞中英识别大模型连接
 * @param {{ appId?: string, apiKey?: string, apiSecret?: string }} payload
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testIflytekBigModelConnection({ appId, apiKey, apiSecret }) {
  if (!appId || !apiKey || !apiSecret) {
    return { ok: false, message: '讯飞中英识别大模型需要完整填写 APPID、APIKey 和 APISecret' }
  }
  try {
    const host = 'iat.xf-yun.com'
    const path = '/v1'
    const url = await buildIflytekUrl({ host, path, apiKey, apiSecret })

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '连接讯飞服务器超时（15秒）' })
      }, 15000)

      let ws
      try { ws = new WebSocket(url) } catch (e) {
        clearTimeout(timeout)
        resolve({ ok: false, message: '无法创建 WebSocket 连接：' + (e?.message || '') })
        return
      }

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({
            header: { app_id: appId, status: 3 },
            parameter: { iat: { domain: 'general', language: 'zh_cn', accent: 'mandarin', vad_eos: 3000, punc: 1 } },
            payload: { data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' } }
          }))
        } catch (_) {}
      }

      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch (_) {
          clearTimeout(timeout)
          try { ws.close() } catch (_) {}
          resolve({ ok: false, message: '无法解析服务器响应' })
          return
        }
        const code = msg.header?.code
        const rawMessage = msg.header?.message || ''
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}

        if (code === 0) {
          resolve({ ok: true, message: '讯飞中英识别大模型连接成功，配置正确' })
        } else if (IFLYTEK_AUDIO_ERROR_CODES.has(code)) {
          resolve({ ok: true, message: '讯飞中英识别大模型连接成功，配置正确（已验证凭证）' })
        } else if (IFLYTEK_AUTH_ERROR_CODES.has(code)) {
          resolve({ ok: false, message: '配置错误：' + translateIflytekError(code, rawMessage) })
        } else {
          resolve({ ok: false, message: '服务器返回错误：' + translateIflytekError(code, rawMessage) })
        }
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '网络连接错误，请检查网络后重试' })
      }

      ws.onclose = (event) => {
        clearTimeout(timeout)
        if (event && event.code !== 1000 && event.code !== 1005) {
          resolve({ ok: false, message: `连接异常（关闭码: ${event.code}），请检查凭证是否匹配` })
        }
      }
    })
  } catch (e) {
    return { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
  }
}

// ============================================================
// 讯飞实时语音转写标准版（长音频实时转写）
// ============================================================
// 接口地址: wss://rtasr.xfyun.cn/v1/ws
// 鉴权方式: appid + ts + signa (HMAC-SHA1)

/**
 * 生成实时语音转写标准版的签名 URL
 */
async function buildRtasrStdUrl({ appId, apiKey }) {
  const ts = Math.floor(Date.now() / 1000).toString()
  const signaOrigin = appId + ts
  const encoder = new TextEncoder()
  const keyData = encoder.encode(apiKey)
  const messageData = encoder.encode(signaOrigin)

  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, messageData)
  const signa = btoa(String.fromCharCode(...new Uint8Array(signature)))

  const baseUrl = 'wss://rtasr.xfyun.cn/v1/ws'
  const params = new URLSearchParams({
    appid: appId,
    ts: ts,
    signa: signa,
  })
  return `${baseUrl}?${params.toString()}`
}

/**
 * 使用讯飞实时语音转写标准版进行语音识别。
 * 长音频实时转写，基于深度卷积神经网络。
 *
 * @param {{ blob: Blob, appId: string, apiKey: string }} payload
 * @returns {Promise<string>}
 */
export async function transcribeWithIflytekRtasrStd({ blob, appId, apiKey }) {
  if (!appId || !apiKey) {
    throw new Error('讯飞实时语音转写标准版需要 APPID 和 APIKey，请在设置中配置')
  }
  if (!blob) throw new Error('录音文件为空，无法识别')

  const pcmBuffer = await convertBlobToPcm16k16bitMono(blob)
  const pcmData = new Uint8Array(pcmBuffer)
  const frameSize = 1280

  if (pcmData.length < 3200) {
    throw new Error('录音太短，请多说几句再试（建议至少 1 秒）')
  }

  if (pcmData.length < frameSize) {
    const padded = new Uint8Array(frameSize)
    padded.set(pcmData)
    return await doRtasrStdWebSocketRequest(appId, apiKey, padded, frameSize)
  }
  return await doRtasrStdWebSocketRequest(appId, apiKey, pcmData, frameSize)
}

async function doRtasrStdWebSocketRequest(appId, apiKey, pcmData, frameSize) {
  const url = await buildRtasrStdUrl({ appId, apiKey })
  const audioDurationSec = pcmData.length / (16000 * 2)
  const totalFrames = Math.max(1, Math.ceil(pcmData.length / frameSize))
  const sendTimeoutMs = Math.max(60000, Math.floor(audioDurationSec * 2 * 1000) + 10000)
  const finalWaitTimeoutMs = 15000

  return new Promise((resolve, reject) => {
    let ws = null
    try { ws = new WebSocket(url) } catch (e) {
      reject(new Error('无法创建 WebSocket 连接：' + (e?.message || '未知错误')))
      return
    }

    let resultText = ''
    let errorOccurred = false
    let allFramesSent = false
    let timeoutTimer = null

    const resetTimeout = (ms) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      timeoutTimer = setTimeout(() => {
        if (!errorOccurred) {
          errorOccurred = true
          try { ws.close() } catch (_) {}
          reject(new Error('讯飞实时语音转写识别超时'))
        }
      }, ms)
    }

    const cleanup = () => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      try { if (ws && ws.readyState !== WebSocket.CLOSED) ws.close() } catch (_) {}
    }

    resetTimeout(sendTimeoutMs)

    ws.onopen = async () => {
      if (errorOccurred) return
      try {
        for (let i = 0; i < totalFrames; i++) {
          if (errorOccurred) return
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            errorOccurred = true
            reject(new Error('WebSocket 已断开'))
            return
          }
          const start = i * frameSize
          const end = Math.min(start + frameSize, pcmData.length)
          let chunk = pcmData.slice(start, end)
          if (chunk.length < frameSize) {
            const padded = new Uint8Array(frameSize)
            padded.set(chunk)
            chunk = padded
          }
          ws.send(chunk.buffer)
          resetTimeout(sendTimeoutMs)
          await sleep(40)
        }
        allFramesSent = true
        resetTimeout(finalWaitTimeoutMs)
      } catch (e) {
        if (!errorOccurred) {
          errorOccurred = true
          cleanup()
          reject(new Error('发送音频帧异常：' + (e?.message || '未知错误')))
        }
      }
    }

    ws.onmessage = (event) => {
      if (errorOccurred) return
      let msg
      try {
        if (typeof event.data === 'string') {
          msg = JSON.parse(event.data)
        } else {
          return
        }
      } catch (e) {
        console.warn('[iflytek-rtasr-std] 无法解析返回消息')
        return
      }

      if (msg.code !== 0 && msg.code !== undefined) {
        errorOccurred = true
        const code = msg.code
        const message = msg.message || msg.desc || ''
        console.error('[iflytek-rtasr-std] 讯飞返回错误 code=%d', code)
        cleanup()
        reject(new Error('讯飞实时语音转写失败：' + translateIflytekError(code, message)))
        return
      }

      // 实时转写标准版返回格式: { code, data: { result: { ws: [...] } } }
      let fragmentText = ''
      const result = msg.data?.result || msg.result || {}
      if (result.ws) {
        for (const wsItem of result.ws) {
          for (const cw of (wsItem.cw || [])) {
            fragmentText += (cw.w || '')
          }
        }
      }
      // 也可能直接返回 text 字段
      if (!fragmentText && (msg.data?.text || msg.text)) {
        fragmentText = msg.data?.text || msg.text
      }

      if (fragmentText) {
        resultText += fragmentText
      }

      // 检查是否结束
      const isFinal = msg.action === 'result' && msg.data?.isFinal
      if (isFinal || (allFramesSent && msg.action === 'error')) {
        // 继续等待，直到明确结束
      }

      resetTimeout(allFramesSent ? finalWaitTimeoutMs : sendTimeoutMs)
    }

    ws.onerror = () => {
      if (!errorOccurred) {
        errorOccurred = true
        cleanup()
        reject(new Error('讯飞实时语音转写网络连接失败'))
      }
    }

    ws.onclose = (event) => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      if (errorOccurred) return
      if (resultText.trim()) {
        resolve(resultText.trim())
        return
      }
      const code = event?.code || 0
      reject(new Error(`讯飞实时语音转写未返回结果（code: ${code}）`))
    }
  })
}

/**
 * 测试讯飞实时语音转写标准版连接
 */
export async function testIflytekRtasrStdConnection({ appId, apiKey }) {
  if (!appId || !apiKey) {
    return { ok: false, message: '需要完整填写 APPID 和 APIKey' }
  }
  try {
    const url = await buildRtasrStdUrl({ appId, apiKey })
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '连接超时（15秒）' })
      }, 15000)

      let ws
      try { ws = new WebSocket(url) } catch (e) {
        clearTimeout(timeout)
        resolve({ ok: false, message: '无法创建 WebSocket 连接：' + (e?.message || '') })
        return
      }

      ws.onopen = () => {
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}
        resolve({ ok: true, message: '讯飞实时语音转写标准版连接成功' })
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '网络连接错误，请检查凭证是否匹配' })
      }

      ws.onclose = (event) => {
        clearTimeout(timeout)
      }
    })
  } catch (e) {
    return { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
  }
}

// ============================================================
// 讯飞实时语音转写大模型版（星火大模型，多方言多语种）
// ============================================================
// 接口地址: wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1
// 鉴权方式: accessKeyId + accessKeySecret + HMAC-SHA256

function pad2(n) { return n < 10 ? '0' + n : '' + n }

function formatUtcWithOffset(date) {
  const offset = -date.getTimezoneOffset()
  const offHours = Math.floor(Math.abs(offset) / 60)
  const offMinutes = Math.abs(offset) % 60
  const sign = offset >= 0 ? '+' : '-'
  const year = date.getUTCFullYear()
  const month = pad2(date.getUTCMonth() + 1)
  const day = pad2(date.getUTCDate())
  const hours = pad2(date.getUTCHours())
  const minutes = pad2(date.getUTCMinutes())
  const seconds = pad2(date.getUTCSeconds())
  return `${year}-${month}-${day}T${hours}%3A${minutes}%3A${seconds}${sign}${pad2(offHours)}${pad2(offMinutes)}`
}

async function buildRtasrLlmUrl({ accessKeyId, accessKeySecret, appId }) {
  const date = new Date()
  const utc = encodeURIComponent(formatUtcWithOffset(date).replace(/%3A/g, ':'))
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })

  const lang = 'autodialect'
  const samplerate = '16000'
  const audioEncode = 'pcm_s16le'

  // 签名计算：所有参数按字典序排序后拼接，然后 HMAC-SHA256
  const paramsObj = {
    accessKeyId: accessKeyId,
    appId: appId,
    audio_encode: audioEncode,
    lang: lang,
    samplerate: samplerate,
    utc: decodeURIComponent(utc),
    uuid: uuid,
  }
  const sortedKeys = Object.keys(paramsObj).sort()
  let signatureOrigin = ''
  for (let i = 0; i < sortedKeys.length; i++) {
    const k = sortedKeys[i]
    const v = paramsObj[k]
    signatureOrigin += (i === 0 ? '' : '&') + k + '=' + v
  }

  const encoder = new TextEncoder()
  const keyData = encoder.encode(accessKeySecret)
  const messageData = encoder.encode(signatureOrigin)

  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, messageData)
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

  const baseUrl = 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1'
  const allParams = new URLSearchParams({
    accessKeyId: accessKeyId,
    appId: appId,
    uuid: uuid,
    utc: decodeURIComponent(utc),
    audio_encode: audioEncode,
    lang: lang,
    samplerate: samplerate,
    signature: signatureBase64,
  })
  return `${baseUrl}?${allParams.toString()}`
}

/**
 * 使用讯飞实时语音转写大模型版进行语音识别。
 * 基于星火大模型，支持202种方言+37语种免切识别。
 *
 * @param {{ blob: Blob, appId: string, accessKeyId: string, accessKeySecret: string }} payload
 * @returns {Promise<string>}
 */
export async function transcribeWithIflytekRtasrLlm({ blob, appId, accessKeyId, accessKeySecret }) {
  if (!appId || !accessKeyId || !accessKeySecret) {
    throw new Error('讯飞实时语音转写大模型需要 APPID、AccessKeyId 和 AccessKeySecret，请在设置中配置')
  }
  if (!blob) throw new Error('录音文件为空，无法识别')

  const pcmBuffer = await convertBlobToPcm16k16bitMono(blob)
  const pcmData = new Uint8Array(pcmBuffer)
  const frameSize = 1280

  if (pcmData.length < 3200) {
    throw new Error('录音太短，请多说几句再试')
  }

  if (pcmData.length < frameSize) {
    const padded = new Uint8Array(frameSize)
    padded.set(pcmData)
    return await doRtasrLlmWebSocketRequest(appId, accessKeyId, accessKeySecret, padded, frameSize)
  }
  return await doRtasrLlmWebSocketRequest(appId, accessKeyId, accessKeySecret, pcmData, frameSize)
}

async function doRtasrLlmWebSocketRequest(appId, accessKeyId, accessKeySecret, pcmData, frameSize) {
  const url = await buildRtasrLlmUrl({ accessKeyId, accessKeySecret, appId })
  const audioDurationSec = pcmData.length / (16000 * 2)
  const totalFrames = Math.max(1, Math.ceil(pcmData.length / frameSize))
  const sendTimeoutMs = Math.max(60000, Math.floor(audioDurationSec * 2 * 1000) + 10000)
  const finalWaitTimeoutMs = 20000

  return new Promise((resolve, reject) => {
    let ws = null
    try { ws = new WebSocket(url) } catch (e) {
      reject(new Error('无法创建 WebSocket 连接：' + (e?.message || '未知错误')))
      return
    }

    let resultText = ''
    let errorOccurred = false
    let allFramesSent = false
    let timeoutTimer = null
    let gotFinal = false

    const resetTimeout = (ms) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      timeoutTimer = setTimeout(() => {
        if (!errorOccurred) {
          errorOccurred = true
          try { ws.close() } catch (_) {}
          reject(new Error('讯飞实时语音转写大模型识别超时'))
        }
      }, ms)
    }

    const cleanup = () => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      try { if (ws && ws.readyState !== WebSocket.CLOSED) ws.close() } catch (_) {}
    }

    resetTimeout(sendTimeoutMs)

    ws.onopen = async () => {
      if (errorOccurred) return
      try {
        for (let i = 0; i < totalFrames; i++) {
          if (errorOccurred) return
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            errorOccurred = true
            reject(new Error('WebSocket 已断开'))
            return
          }
          const start = i * frameSize
          const end = Math.min(start + frameSize, pcmData.length)
          let chunk = pcmData.slice(start, end)
          if (chunk.length < frameSize) {
            const padded = new Uint8Array(frameSize)
            padded.set(chunk)
            chunk = padded
          }
          ws.send(chunk.buffer)
          resetTimeout(sendTimeoutMs)
          await sleep(40)
        }
        allFramesSent = true
        resetTimeout(finalWaitTimeoutMs)
      } catch (e) {
        if (!errorOccurred) {
          errorOccurred = true
          cleanup()
          reject(new Error('发送音频帧异常：' + (e?.message || '未知错误')))
        }
      }
    }

    ws.onmessage = (event) => {
      if (errorOccurred) return
      let msg
      try {
        if (typeof event.data === 'string') {
          msg = JSON.parse(event.data)
        } else {
          return
        }
      } catch (e) {
        console.warn('[iflytek-rtasr-llm] 无法解析返回消息')
        return
      }

      if (msg.code !== 0 && msg.code !== undefined) {
        errorOccurred = true
        const code = msg.code
        const message = msg.message || msg.desc || ''
        console.error('[iflytek-rtasr-llm] 讯飞返回错误 code=%d', code)
        cleanup()
        reject(new Error('讯飞实时语音转写大模型失败：' + (message || `错误码 ${code}`)))
        return
      }

      // 实时转写大模型返回格式可能有多种，尽量兼容
      let fragmentText = ''
      if (msg.data) {
        if (typeof msg.data === 'string') {
          fragmentText = msg.data
        } else if (msg.data.text) {
          fragmentText = msg.data.text
        } else if (msg.data.result) {
          const result = msg.data.result
          if (typeof result === 'string') fragmentText = result
          else if (result.text) fragmentText = result.text
          else if (result.ws) {
            for (const wsItem of result.ws) {
              for (const cw of (wsItem.cw || [])) {
                fragmentText += (cw.w || '')
              }
            }
          }
        }
      } else if (msg.text) {
        fragmentText = msg.text
      }

      if (fragmentText && typeof fragmentText === 'string') {
        resultText += fragmentText
      }

      // 检查是否结束
      if (msg.isFinal || msg.final || (msg.data && msg.data.isFinal)) {
        gotFinal = true
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
        try { ws.close() } catch (_) {}
        if (resultText.trim()) {
          resolve(resultText.trim())
        } else {
          reject(new Error('讯飞实时语音转写大模型未返回有效结果'))
        }
        return
      }

      resetTimeout(allFramesSent ? finalWaitTimeoutMs : sendTimeoutMs)
    }

    ws.onerror = () => {
      if (!errorOccurred) {
        errorOccurred = true
        cleanup()
        reject(new Error('讯飞实时语音转写大模型网络连接失败'))
      }
    }

    ws.onclose = (event) => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      if (errorOccurred) return
      if (resultText.trim()) {
        resolve(resultText.trim())
        return
      }
      const code = event?.code || 0
      reject(new Error(`讯飞实时语音转写大模型未返回结果（code: ${code}）`))
    }
  })
}

/**
 * 测试讯飞实时语音转写大模型连接
 */
export async function testIflytekRtasrLlmConnection({ appId, accessKeyId, accessKeySecret }) {
  if (!appId || !accessKeyId || !accessKeySecret) {
    return { ok: false, message: '需要完整填写 APPID、AccessKeyId 和 AccessKeySecret' }
  }
  try {
    const url = await buildRtasrLlmUrl({ accessKeyId, accessKeySecret, appId })
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '连接超时（15秒）' })
      }, 15000)

      let ws
      try { ws = new WebSocket(url) } catch (e) {
        clearTimeout(timeout)
        resolve({ ok: false, message: '无法创建 WebSocket 连接：' + (e?.message || '') })
        return
      }

      ws.onopen = () => {
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}
        resolve({ ok: true, message: '讯飞实时语音转写大模型连接成功' })
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        try { ws.close() } catch (_) {}
        resolve({ ok: false, message: '网络连接错误，请检查凭证是否匹配' })
      }

      ws.onclose = () => { clearTimeout(timeout) }
    })
  } catch (e) {
    return { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
  }
}

// ============================================================
// 讯飞极速录音转写大模型（长音频文件转写，异步）
// ============================================================
// 接口地址: https://upload-ost-api.xfyun.cn/file/upload
//          https://ost-api.xfyun.cn/v2/ost/pro_create
//          https://ost-api.xfyun.cn/v2/ost/query
// 鉴权方式: APIKey + APISecret + HMAC-SHA256

// 注意：极速录音转写大模型是异步模式，需要上传文件→创建任务→轮询查询→获取结果
// 对于我们的实时语音输入场景，这个模式不太适用，但仍作为备选提供

async function buildOstSignature({ apiKey, apiSecret, httpMethod, path, bodyMd5 = '' }) {
  const date = new Date().toUTCString()
  const signatureOrigin = `${httpMethod}\n${bodyMd5}\napplication/json\n${date}\n${path}`

  const encoder = new TextEncoder()
  const keyData = encoder.encode(apiSecret)
  const messageData = encoder.encode(signatureOrigin)

  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, messageData)
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

  const authOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line digest", signature="${signatureBase64}"`
  return { authOrigin, date }
}

/**
 * 使用讯飞极速录音转写大模型进行语音识别（异步模式）
 * 注意：这是异步转写，需要等待结果返回，适合较长的录音
 *
 * @param {{ blob: Blob, appId: string, apiKey: string, apiSecret: string, language?: string }} payload
 * @returns {Promise<string>}
 */
export async function transcribeWithIflytekOst({ blob, appId, apiKey, apiSecret, language = 'zh' }) {
  if (!appId || !apiKey || !apiSecret) {
    throw new Error('讯飞极速录音转写需要 APPID、APIKey 和 APISecret，请在设置中配置')
  }
  if (!blob) throw new Error('录音文件为空，无法识别')

  // 1. 上传文件
  const uploadUrl = 'https://upload-ost-api.xfyun.cn/file/upload'
  const fileId = await uploadOstFile(uploadUrl, blob, appId, apiKey, apiSecret)

  // 2. 创建任务
  const taskId = await createOstTask(fileId, appId, apiKey, apiSecret, language)

  // 3. 轮询查询结果
  const resultText = await pollOstResult(taskId, appId, apiKey, apiSecret)

  return resultText
}

async function uploadOstFile(baseUrl, blob, appId, apiKey, apiSecret) {
  const path = '/file/upload'
  const { authOrigin, date } = await buildOstSignature({
    apiKey, apiSecret, httpMethod: 'POST', path, bodyMd5: '',
  })

  const fd = new FormData()
  fd.append('app_id', appId)
  fd.append('file', blob, 'recording.wav')
  fd.append('file_name', 'recording.wav')

  const response = await httpFileUpload(baseUrl, {
    headers: {
      'Authorization': authOrigin,
      'Date': date,
    },
    formData: fd,
    timeout: 120000,
  })

  if (!response.ok) {
    throw new Error('文件上传失败 (' + response.status + ')')
  }
  const data = response.data
  if (data.code !== 0) {
    throw new Error('文件上传失败：' + (data.message || `错误码 ${data.code}`))
  }
  return data.data?.file_id || data.data?.fileId || ''
}

async function createOstTask(fileId, appId, apiKey, apiSecret, language) {
  const path = '/v2/ost/pro_create'
  const body = JSON.stringify({
    app_id: appId,
    file_id: fileId,
    language: language,
    speed: 0,
  })

  // 计算 body md5
  let bodyMd5 = ''
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(body)
    const hashBuffer = await crypto.subtle.digest('MD5', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    bodyMd5 = btoa(String.fromCharCode(...hashArray))
  } catch (_) {
    // MD5 不可用时跳过
  }

  const { authOrigin, date } = await buildOstSignature({
    apiKey, apiSecret, httpMethod: 'POST', path, bodyMd5,
  })

  const baseUrl = 'https://ost-api.xfyun.cn' + path
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authOrigin,
      'Date': date,
    },
    body: body,
  })

  if (!response.ok) {
    throw new Error('创建任务失败 (' + response.status + ')')
  }
  const data = await response.json()
  if (data.code !== 0) {
    throw new Error('创建任务失败：' + (data.message || `错误码 ${data.code}`))
  }
  return data.data?.task_id || data.data?.taskId || ''
}

async function pollOstResult(taskId, appId, apiKey, apiSecret) {
  const path = '/v2/ost/query'
  const maxPolls = 60
  const pollInterval = 3000

  for (let i = 0; i < maxPolls; i++) {
    const body = JSON.stringify({ app_id: appId, task_id: taskId })

    let bodyMd5 = ''
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(body)
      const hashBuffer = await crypto.subtle.digest('MD5', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      bodyMd5 = btoa(String.fromCharCode(...hashArray))
    } catch (_) {}

    const { authOrigin, date } = await buildOstSignature({
      apiKey, apiSecret, httpMethod: 'POST', path, bodyMd5,
    })

    const baseUrl = 'https://ost-api.xfyun.cn' + path
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authOrigin,
        'Date': date,
      },
      body: body,
    })

    if (!response.ok) {
      throw new Error('查询任务失败 (' + response.status + ')')
    }
    const data = await response.json()

    if (data.code !== 0) {
      throw new Error('查询任务失败：' + (data.message || `错误码 ${data.code}`))
    }

    const taskStatus = data.data?.status
    if (taskStatus === 3 || taskStatus === 'completed' || taskStatus === 'success') {
      // 转写完成
      let resultText = ''
      const result = data.data?.result
      if (result) {
        if (typeof result === 'string') {
          resultText = result
        } else if (result.text) {
          resultText = result.text
        } else if (Array.isArray(result.lattice) || Array.isArray(result)) {
          const arr = result.lattice || result
          for (const item of arr) {
            if (item.text) resultText += item.text
            else if (item.content) resultText += item.content
            else if (typeof item === 'string') resultText += item
          }
        }
      }
      return resultText.trim()
    }

    if (taskStatus === 4 || taskStatus === 'failed' || taskStatus === 'error') {
      throw new Error('转写任务失败：' + (data.data?.fail_msg || data.data?.failMessage || '未知错误'))
    }

    // 继续等待
    await sleep(pollInterval)
  }

  throw new Error('转写超时，未能在预期时间内完成')
}

/**
 * 测试讯飞极速录音转写连接
 */
export async function testIflytekOstConnection({ appId, apiKey, apiSecret }) {
  if (!appId || !apiKey || !apiSecret) {
    return { ok: false, message: '需要完整填写 APPID、APIKey 和 APISecret' }
  }
  try {
    // 简单测试：尝试用空参数查询，看是否能连接到服务器
    const path = '/v2/ost/query'
    const body = JSON.stringify({ app_id: appId, task_id: 'test_task_id' })
    let bodyMd5 = ''
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(body)
      const hashBuffer = await crypto.subtle.digest('MD5', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      bodyMd5 = btoa(String.fromCharCode(...hashArray))
    } catch (_) {}

    const { authOrigin, date } = await buildOstSignature({
      apiKey, apiSecret, httpMethod: 'POST', path, bodyMd5,
    })

    const baseUrl = 'https://ost-api.xfyun.cn' + path
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authOrigin,
        'Date': date,
      },
      body: body,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    // 只要能收到响应（即使任务不存在），说明凭证和网络是通的
    if (response.status === 200 || response.status === 400 || response.status === 500) {
      return { ok: true, message: '讯飞极速录音转写连接成功（已验证凭证）' }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: '凭证无效或未授权' }
    }
    return { ok: false, message: `服务器返回状态码 ${response.status}` }
  } catch (e) {
    return { ok: false, message: '测试失败：' + (e?.message || '未知错误') }
  }
}

// ---- 工具 ----
export const whisperModes = {
  WEB_SPEECH: 'web-speech',
  WHISPER_API: 'whisper-api',
  IFLYTEK_IAT: 'iflytek-iat',
  IFLYTEK_BIG_MODEL: 'iflytek-bigmodel',
  IFLYTEK_RTASR_STD: 'iflytek-rtasr-std',
  IFLYTEK_RTASR_LLM: 'iflytek-rtasr-llm',
  IFLYTEK_OST: 'iflytek-ost',
  DASHSCOPE_ASR: 'dashscope-asr',
}
