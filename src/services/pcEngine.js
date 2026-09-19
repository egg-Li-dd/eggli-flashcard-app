/**
 * PC 引擎服务封装层
 *
 * 通过 Tailscale 网络栈访问电脑端 OCR 引擎管理台（端口 19000）。
 * 支持文档解析、图片OCR、VQA、文件转写、实时语音识别等。
 *
 * 依赖：
 * - tailscale.js 的 fetchViaTailscale（HTTP 请求走 Tailscale netstack）
 * - tailscale.js 的 createTailscaleWebSocket（WebSocket 代理走 Tailscale netstack）
 */

import { fetchViaTailscale } from './tailscale'

// ─────────── 配置管理 ───────────

const STORAGE_KEY = 'pc_engine_config'

/**
 * 获取 PC 引擎配置
 * @returns {{host: string, port: string, token: string, asrEngine: string, ocrEngine: string}}
 */
export function getPcEngineConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const cfg = JSON.parse(raw)
      return {
        host: cfg.host || '',
        port: cfg.port || '19000',
        token: cfg.token || '',
        port: cfg.port || '19000',
        asrEngine: cfg.asrEngine || 'sherpa',
        ocrEngine: cfg.ocrEngine || 'paddleocr',
        docEngine: cfg.docEngine || 'mineru',
        transcribeEngine: cfg.transcribeEngine || 'whisper',
      }
    }
  } catch (e) {
    // ignore
  }
  return {
    host: '',
    port: '19000',
    token: '',
    asrEngine: 'sherpa',
    ocrEngine: 'paddleocr',
    docEngine: 'mineru',
    transcribeEngine: 'whisper',
  }
}

/**
 * 保存 PC 引擎配置
 */
export function setPcEngineConfig(config) {
  const old = getPcEngineConfig()
  const merged = { ...old, ...config }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  return merged
}

/**
 * 检查 PC 引擎是否已配置
 */
export function isPcEngineConfigured() {
  const { host, token } = getPcEngineConfig()
  return !!host && !!token
}

// ─────────── 内部工具 ───────────

function getBaseUrl() {
  const { host, port } = getPcEngineConfig()
  if (!host) throw new Error('未配置 PC 引擎地址')
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `http://${cleanHost}:${port || '19000'}`
}

function getToken() {
  const { token } = getPcEngineConfig()
  if (!token) throw new Error('未配置 PC 引擎 Token')
  return token
}

/**
 * 通过 Tailscale 发起 HTTP 请求到 PC 引擎
 */
async function pcFetch(path, options = {}) {
  const baseUrl = getBaseUrl()
  const token = getToken()
  const url = `${baseUrl}${path}`

  const headers = options.headers || {}
  headers["x-api-token"] = token
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const result = await fetchViaTailscale(url, {
    method: options.method || 'GET',
    headers,
    body: options.body || '',
    timeout: options.timeout || 60000,
  })

  if (result.statusCode === 0) {
    throw new Error(`网络请求失败：${result.body}`)
  }

  return result
}

/**
 * 通过 Tailscale 发起 multipart/form-data 文件上传
 * 由于 fetchViaTailscale 只支持字符串 body，这里用 base64 传输文件
 */
async function pcFetchWithFile(path, file, fieldName = 'file', extraFields = {}) {
  const baseUrl = getBaseUrl()
  const token = getToken()
  const url = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}token=${token}`

  // 将文件转为 base64
  const base64Data = await fileToBase64(file)

  // 构建 multipart body
  const boundary = '----tsboundary' + Date.now()
  let body = ''
  for (const [key, value] of Object.entries(extraFields)) {
    body += `--${boundary}\r\n`
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`
    body += `${value}\r\n`
  }
  body += `--${boundary}\r\n`
  body += `Content-Disposition: form-data; name="${fieldName}"; filename="${file.name || 'upload'}"\r\n`
  body += `Content-Type: ${file.type || 'application/octet-stream'}\r\n`
  body += `Content-Transfer-Encoding: base64\r\n\r\n`
  body += `${base64Data}\r\n`
  body += `--${boundary}--\r\n`

  const result = await fetchViaTailscale(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    timeout: 300000, // 5 分钟超时，适合大文件
  })

  if (result.statusCode === 0) {
    throw new Error(`文件上传失败：${result.body}`)
  }

  return result
}

/**
 * 文件转 base64（去掉前缀 data:xxx;base64,）
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.substring(idx + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 解析 JSON 响应，失败时返回原始文本
 */
function parseJson(result) {
  try {
    return JSON.parse(result.body)
  } catch (e) {
    return { _raw: result.body, _statusCode: result.statusCode }
  }
}

// ─────────── 一、健康检查 ───────────

/**
 * 健康检查（无需 Token）
 * @returns {Promise<{status: string, name: string, version: string} | null>}
 */
export async function healthCheck() {
  try {
    const baseUrl = getBaseUrl()
    const result = await fetchViaTailscale(`${baseUrl}/api/health`, {
      method: 'GET',
      timeout: 10000,
    })
    if (result.statusCode === 200) {
      return parseJson(result)
    }
    return null
  } catch (e) {
    console.error('healthCheck failed:', e)
    return null
  }
}

// ─────────── 二、引擎状态 ───────────

/**
 * 列出所有引擎及状态
 */
export async function listEngines() {
  const result = await pcFetch('/api/engines')
  return parseJson(result)
}

/**
 * 查询单个引擎状态
 */
export async function getEngineStatus(engineId) {
  const result = await pcFetch(`/api/engines/${engineId}`)
  return parseJson(result)
}

// ─────────── 三、文档解析（任务队列模式） ───────────

/**
 * 提交文档解析任务
 * @param {File} file - 文件（PDF/PNG/JPG/DOCX 等）
 * @param {string} engine - 引擎：mineru / docling / paddleocr / qwen2-vl
 * @returns {Promise<{task: {id, engine, status, progress}}>}
 */
export async function submitParseTask(file, engine) {
  const result = await pcFetchWithFile('/api/parse', file, 'file', { engine })
  return parseJson(result)
}

/**
 * 查询任务进度
 * @returns {Promise<{task: {id, status, progress, resultId}}>}
 */
export async function getTaskStatus(taskId) {
  const result = await pcFetch(`/api/tasks/${taskId}`)
  return parseJson(result)
}

/**
 * 轮询任务直到完成
 * @param {string} taskId
 * @param {(progress: number, status: string) => void} onProgress - 进度回调
 * @param {number} interval - 轮询间隔 ms
 * @returns {Promise<{task: object}>} 完成后的任务对象
 */
export async function pollTask(taskId, onProgress, interval = 2000) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const { task } = await getTaskStatus(taskId)
        if (onProgress) onProgress(task.progress || 0, task.status)
        if (task.status === 'success') {
          resolve({ task })
        } else if (task.status === 'failed' || task.status === 'canceled') {
          reject(new Error(`任务${task.status === 'failed' ? '失败' : '已取消'}`))
        } else {
          setTimeout(poll, interval)
        }
      } catch (e) {
        reject(e)
      }
    }
    poll()
  })
}

/**
 * 获取结果 Markdown
 * @returns {Promise<string>} 纯 Markdown 文本
 */
export async function getResultMarkdown(resultId) {
  const result = await pcFetch(`/api/results/${resultId}/markdown`)
  return result.body
}

/**
 * 获取结果 JSON
 */
export async function getResult(resultId) {
  const result = await pcFetch(`/api/results/${resultId}`)
  return parseJson(result)
}

/**
 * 列出所有结果
 */
export async function listResults(filter = {}) {
  const params = new URLSearchParams()
  if (filter.q) params.set('q', filter.q)
  if (filter.engine) params.set('engine', filter.engine)
  if (filter.starred) params.set('starred', 'true')
  const qs = params.toString()
  const result = await pcFetch(`/api/results${qs ? '?' + qs : ''}`)
  return parseJson(result)
}

// ─────────── 四、图片 OCR 直连（即时响应） ───────────

/**
 * PaddleOCR 图片 OCR（上传文件）
 * @param {File} file - 图片文件
 * @returns {Promise<{text: string, lines: array}>}
 */
export async function paddleOcr(file) {
  const result = await pcFetchWithFile('/api/paddleocr/ocr', file)
  return parseJson(result)
}

/**
 * PaddleOCR 图片 OCR（Base64）
 * @param {string} base64Image - data:image/png;base64,... 或纯 base64
 */
export async function paddleOcrBase64(base64Image) {
  const image = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/png;base64,${base64Image}`
  const result = await pcFetch('/api/paddleocr/ocr/base64', {
    method: 'POST',
    json: true,
    body: JSON.stringify({ image }),
  })
  return parseJson(result)
}

/**
 * Qwen2-VL 图片 OCR（上传文件）
 */
export async function qwenVlOcr(file) {
  const result = await pcFetchWithFile('/api/qwen-vl/ocr', file)
  return parseJson(result)
}

/**
 * Qwen2-VL 图像问答（VQA）
 * @param {string} base64Image - data:image/jpeg;base64,...
 * @param {string} question - 问题
 * @returns {Promise<{answer: string}>}
 */
export async function qwenVlChat(base64Image, question) {
  const image = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`
  const result = await pcFetch('/api/qwen-vl/chat', {
    method: 'POST',
    json: true,
    body: JSON.stringify({ image, question }),
  })
  return parseJson(result)
}

// ─────────── 五、文件转写（即时响应） ───────────

/**
 * Sherpa-ONNX 文件转写
 * @param {File} file - 音频文件（WAV/MP3/M4A/FLAC）
 * @returns {Promise<{text: string, segments: array}>}
 */
export async function sherpaRecognize(file) {
  const result = await pcFetchWithFile('/api/sherpa/recognize', file)
  return parseJson(result)
}

/**
 * Faster-Whisper 文件转写
 */
export async function whisperTranscribe(file) {
  const result = await pcFetchWithFile('/api/whisper/transcribe', file)
  return parseJson(result)
}

/**
 * FunASR 文件转写
 */
export async function funasrRecognize(file) {
  const result = await pcFetchWithFile('/api/funasr/recognize', file)
  return parseJson(result)
}

/**
 * 通用文件转写（根据引擎选择）
 * @param {File} file - 音频文件
 * @param {string} engine - sherpa / whisper / funasr
 */
export async function transcribeAudio(file, engine) {
  switch (engine) {
    case 'sherpa':
      return sherpaRecognize(file)
    case 'whisper':
      return whisperTranscribe(file)
    case 'funasr':
      return funasrRecognize(file)
    default:
      throw new Error(`不支持的转写引擎: ${engine}`)
  }
}

// ─────────── 六、实时语音识别（WebSocket） ───────────

/**
 * WebSocket 实时语音识别（通过 Tailscale）
 *
 * 通过 Capacitor 原生插件建立 WebSocket 连接，使用轮询方式接收消息。
 *
 * @param {object} callbacks - 回调函数集合
 * @param {() => void} callbacks.onReady - 连接就绪
 * @param {(text: string) => void} callbacks.onPartial - 部分识别结果
 * @param {(text: string) => void} callbacks.onResult - 最终识别结果
 * @param {(msg: string) => void} callbacks.onError - 错误
 * @param {() => void} callbacks.onClose - 连接关闭
 * @param {(value: number) => void} [callbacks.onLevel] - 音量反馈
 * @param {string} [asrEngine] - asr 引擎：voice / sherpa / whisper / funasr
 * @returns {Promise<object>} WebSocket 控制器 { sendAudio, stop, cancel, close }
 */
export async function startRealtimeASR(callbacks, asrEngine) {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) {
    throw new Error('实时语音识别仅支持 Android APP')
  }

  const config = getPcEngineConfig()
  const baseUrl = getBaseUrl()
  const wsUrl = baseUrl.replace(/^http/, 'ws')
  const engine = asrEngine || config.asrEngine || 'sherpa'
  const token = getToken()
  const fullWsUrl = `${wsUrl}/api/${engine}/ws`

  const plugin = Capacitor.Plugins?.TailscaleVPN
  if (!plugin) {
    throw new Error('Tailscale 插件不可用')
  }

  // 调用原生插件建立 WebSocket 连接
  const conn = await plugin.createTailscaleWebSocket({
    url: fullWsUrl,
  })

  const connId = conn.connId
  let polling = true

  // 轮询消息
  const pollLoop = async () => {
    while (polling) {
      try {
        const result = await plugin.pollTailscaleWsMessage({ connId })
        if (result.hasMessage) {
          if (result.type === 'text') {
            try {
              const msg = JSON.parse(result.data)
              switch (msg.type) {
                case 'ready':
                  callbacks.onReady?.()
                  break
                case 'partial':
                  callbacks.onPartial?.(msg.text || '')
                  break
                case 'result':
                  callbacks.onResult?.(msg.text || '')
                  break
                case 'level':
                  callbacks.onLevel?.(msg.value || 0)
                  break
                case 'error':
                  callbacks.onError?.(msg.message || '未知错误')
                  break
                case 'closed':
                  polling = false
                  callbacks.onClose?.()
                  return
              }
            } catch (e) {
              // 非 JSON 文本消息，忽略
            }
          } else if (result.type === 'closed') {
            polling = false
            callbacks.onClose?.()
            return
          }
        }
      } catch (e) {
        // 轮询出错，等待后继续
      }
      // 50ms 轮询间隔
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  // 启动轮询
  pollLoop()

  return {
    connId,
    /** 发送 PCM 音频数据（16k/mono/16-bit LE） */
    sendAudio(pcmData) {
      // 将 ArrayBuffer 转为 base64
      const bytes = new Uint8Array(pcmData)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      plugin.sendTailscaleWsData({ connId, data: base64, binary: true })
    },
    /** 发送控制消息 */
    sendControl(type) {
      plugin.sendTailscaleWsData({
        connId,
        data: JSON.stringify({ type }),
        binary: false,
      })
    },
    /** 开始录音 */
    start() {
      this.sendControl('start')
    },
    /** 停止录音 */
    stop() {
      this.sendControl('stop')
    },
    /** 取消录音 */
    cancel() {
      this.sendControl('cancel')
    },
    /** 关闭连接 */
    close() {
      polling = false
      plugin.closeTailscaleWebSocket({ connId })
    },
  }
}

// ─────────── 七、完整文档解析流程（便捷封装） ───────────

/**
 * 一键文档解析：上传文件 → 等待完成 → 返回 Markdown
 * @param {File} file - 文件
 * @param {string} engine - 引擎
 * @param {(progress: number, status: string) => void} onProgress - 进度回调
 * @returns {Promise<string>} Markdown 文本
 */
export async function parseDocument(file, engine, onProgress) {
  onProgress?.(0, 'uploading')
  const { task } = await submitParseTask(file, engine)
  onProgress?.(0, 'queued')
  const { task: finalTask } = await pollTask(task.id, (progress, status) => {
    onProgress?.(progress, status)
  })
  if (!finalTask.resultId) {
    throw new Error('任务完成但无结果 ID')
  }
  onProgress?.(100, 'fetching_result')
  const markdown = await getResultMarkdown(finalTask.resultId)
  onProgress?.(100, 'done')
  return markdown
}
