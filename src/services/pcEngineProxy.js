/**
 * PC Engine Proxy Service
 *
 * 连接 PC 端 OCR Engine Manager（统一端口 19000），
 * 提供 HTTP 文档解析 / 图片直连 OCR / 音频转写 + WebSocket 实时语音识别。
 *
 * 支持的引擎：
 * - 文档解析（任务队列）：mineru / docling / paddleocr / qwen2-vl
 * - 图片 OCR 直连：paddleocr / qwen2-vl
 * - 图像问答 VQA：qwen2-vl
 * - 音频文件转写：sherpa / whisper / funasr
 * - 实时语音识别（WebSocket）：voice(Vosk) / sherpa / whisper / funasr
 */

// ============================================================================
// 通用工具
// ============================================================================

/**
 * 构建带 token 的 URL
 */
function buildUrl(baseUrl, path, token) {
  const base = baseUrl.replace(/\/+$/, '')
  const url = `${base}${path}`
  return url
}

/**
 * 构建带 token 的请求头
 */
function tokenHeaders(token, extra = {}) {
  return { 'x-api-token': token, ...extra }
}

/**
 * 通用 GET 请求
 */
async function apiGet(baseUrl, path, token) {
  const res = await fetch(buildUrl(baseUrl, path, token), {
    method: 'GET',
    headers: tokenHeaders(token),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`请求失败 (${res.status}): ${text}`)
  }
  return res
}

/**
 * 通用 POST multipart 请求
 */
async function apiPostMultipart(baseUrl, path, token, fields) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v)
  }
  const res = await fetch(buildUrl(baseUrl, path, token), {
    method: 'POST',
    headers: tokenHeaders(token),
    body: fd,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`请求失败 (${res.status}): ${text}`)
  }
  return res
}

/**
 * 通用 POST JSON 请求
 */
async function apiPostJson(baseUrl, path, token, body) {
  const res = await fetch(buildUrl(baseUrl, path, token), {
    method: 'POST',
    headers: tokenHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`请求失败 (${res.status}): ${text}`)
  }
  return res
}

// ============================================================================
// HTTP API — 基础接口
// ============================================================================

/**
 * 健康检查（无需 token）
 * GET /api/health
 */
export async function checkPcEngineHealth(baseUrl) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/health`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`健康检查失败 (${res.status}): ${text}`)
  }
  return await res.json()
}

/**
 * 获取引擎列表
 * GET /api/engines
 */
export async function listEngines(baseUrl, token) {
  const res = await apiGet(baseUrl, '/api/engines', token)
  return await res.json()
}

// ============================================================================
// HTTP API — 文档解析（任务队列模式）
// 适用于：mineru / docling / paddleocr / qwen2-vl
// ============================================================================

/**
 * 提交文档解析任务
 * POST /api/parse
 */
export async function submitParseTask(baseUrl, token, file, engine = 'mineru') {
  const res = await apiPostMultipart(baseUrl, '/api/parse', token, {
    file,
    engine,
  })
  return await res.json()
}

/**
 * 轮询任务状态，每 2 秒一次
 * GET /api/tasks/:id
 */
export async function pollTaskStatus(baseUrl, token, taskId, onProgress, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('已取消')); return }
    const onAbort = () => reject(new Error('已取消'))
    signal?.addEventListener('abort', onAbort)

    const poll = async () => {
      try {
        const res = await fetch(buildUrl(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`, token), {
          method: 'GET',
          headers: tokenHeaders(token),
          signal,
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          signal?.removeEventListener('abort', onAbort)
          reject(new Error(`查询任务失败 (${res.status}): ${text}`))
          return
        }
        const data = await res.json()
        const task = data.task
        if (typeof onProgress === 'function' && typeof task.progress === 'number') {
          onProgress(task.progress)
        }
        if (task.status === 'success') {
          signal?.removeEventListener('abort', onAbort)
          resolve({ task })
        } else if (task.status === 'failed') {
          signal?.removeEventListener('abort', onAbort)
          reject(new Error(`解析任务失败: ${task.error || '未知错误'}`))
        } else {
          setTimeout(poll, 2000)
        }
      } catch (err) {
        signal?.removeEventListener('abort', onAbort)
        if (err.name === 'AbortError') reject(new Error('已取消'))
        else reject(err)
      }
    }
    poll()
  })
}

/**
 * 获取解析结果的 Markdown 文本
 * GET /api/results/:id/markdown
 */
export async function getTaskResultMarkdown(baseUrl, token, resultId) {
  const res = await fetch(buildUrl(baseUrl, `/api/results/${encodeURIComponent(resultId)}/markdown`, token), {
    method: 'GET',
    headers: tokenHeaders(token),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`获取结果失败 (${res.status}): ${text}`)
  }
  return await res.text()
}

/**
 * 高级文档解析：提交 → 轮询 → 获取 Markdown
 * 支持引擎：mineru / docling / paddleocr / qwen2-vl
 */
export async function parseDocument(baseUrl, token, file, engine = 'mineru', onProgress, signal) {
  const submitResult = await submitParseTask(baseUrl, token, file, engine)
  const taskId = submitResult.task.id
  const taskResult = await pollTaskStatus(baseUrl, token, taskId, onProgress, signal)
  const resultId = taskResult.task.resultId
  if (!resultId) throw new Error('解析完成但未找到 resultId')
  return await getTaskResultMarkdown(baseUrl, token, resultId)
}

// ============================================================================
// HTTP API — 直连模式（即时响应，无任务队列）
// ============================================================================

/**
 * PaddleOCR 图片识别（直连，即时返回）
 * POST /api/paddleocr/ocr
 * @returns {Promise<{text: string, lines: Array}>}
 */
export async function paddleOcrDirect(baseUrl, token, imageFile) {
  const res = await apiPostMultipart(baseUrl, '/api/paddleocr/ocr', token, { file: imageFile })
  return await res.json()
}

/**
 * PaddleOCR Base64 图片识别（直连）
 * POST /api/paddleocr/ocr/base64
 * @param {string} base64DataUrl - data:image/png;base64,iVBOR...
 * @returns {Promise<{text: string, lines: Array}>}
 */
export async function paddleOcrBase64(baseUrl, token, base64DataUrl) {
  const res = await apiPostJson(baseUrl, '/api/paddleocr/ocr/base64', token, { image: base64DataUrl })
  return await res.json()
}

/**
 * Qwen2-VL 图片 OCR（直连）
 * POST /api/qwen-vl/ocr
 * @returns {Promise<{markdown: string, text: string}>}
 */
export async function qwenVlOcr(baseUrl, token, imageFile) {
  const res = await apiPostMultipart(baseUrl, '/api/qwen-vl/ocr', token, { file: imageFile })
  return await res.json()
}

/**
 * PaddleOCR-VL 文档级 OCR（直连）
 * POST /api/paddleocr-vl/ocr
 * @returns {Promise<{text: string, markdown?: string}>}
 */
export async function paddleocrVlOcr(baseUrl, token, imageFile) {
  const res = await apiPostMultipart(baseUrl, '/api/paddleocr-vl/ocr', token, { file: imageFile })
  return await res.json()
}

/**
 * Qwen2-VL 图像问答 VQA（直连）
 * POST /api/qwen-vl/chat
 * @param {string} base64DataUrl - data:image/jpeg;base64,...
 * @param {string} question - 问题文本
 * @returns {Promise<{answer: string}>}
 */
export async function qwenVlChat(baseUrl, token, base64DataUrl, question) {
  const res = await apiPostJson(baseUrl, '/api/qwen-vl/chat', token, {
    image: base64DataUrl,
    question,
  })
  return await res.json()
}

/**
 * 音频文件转写（通用，即时返回）
 * POST /api/sherpa/recognize | /api/whisper/transcribe | /api/funasr/recognize
 * @param {'sherpa'|'whisper'|'funasr'} asrEngine - ASR 引擎
 * @param {File|Blob} audioFile - 音频文件（WAV/MP3/M4A/FLAC）
 * @returns {Promise<{text: string, segments?: Array}>}
 */
export async function transcribeAudioFile(baseUrl, token, asrEngine, audioFile) {
  const pathMap = {
    sherpa: '/api/sherpa/recognize',
    whisper: '/api/whisper/transcribe',
    funasr: '/api/funasr/recognize',
  }
  const path = pathMap[asrEngine]
  if (!path) throw new Error(`不支持的 ASR 引擎: ${asrEngine}`)
  const res = await apiPostMultipart(baseUrl, path, token, { file: audioFile })
  return await res.json()
}

/**
 * AI 对话补全（OpenAI 兼容格式）
 *
 * 调用 PC 引擎的 /api/ai/chat 端点，支持流式与普通模式。
 * 请求/响应格式与 OpenAI Chat Completions API 兼容。
 *
 * @param {string} baseUrl - PC 引擎基础地址，如 http://192.168.2.100:19000
 * @param {string} token - 认证 token
 * @param {Array<{role: string, content: string}>} messages - 对话消息列表
 * @param {object} [options] - 可选参数
 * @param {string} [options.model] - 模型名称（PC 引擎选择后端模型）
 * @param {number} [options.temperature] - 温度，默认 0.7
 * @param {number} [options.maxTokens] - 最大 token 数，默认 4096
 * @param {number} [options.timeout] - 超时毫秒，默认 120000
 * @returns {Promise<{content: string, tokens: number}>}
 */
export async function aiChatCompletion(baseUrl, token, messages, options = {}) {
  const body = {
    model: options.model || 'default',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens || 4096,
    stream: false,
  }
  const res = await apiPostJson(baseUrl, '/api/ai/chat', token, body)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  const tokens = data?.usage?.total_tokens || 0
  return { content, tokens }
}

// ============================================================================
// WebSocket API — 实时语音识别
// 支持 4 个 ASR 引擎：voice(Vosk) / sherpa / whisper / funasr
// 协议完全相同，仅路径不同
// ============================================================================

/**
 * ASR 引擎对应的 WebSocket 路径
 */
const WS_ASR_PATHS = {
  voice: '/api/voice/ws',
  sherpa: '/api/sherpa/ws',
  whisper: '/api/whisper/ws',
  funasr: '/api/funasr/ws',
}

/**
 * 创建 PC 端实时语音识别会话
 *
 * 通过 WebSocket 连接到 PC Engine Manager 的 ASR 服务，
 * 实时发送 PCM 音频流，接收识别结果。
 *
 * 音频格式要求：
 * - PCM 16-bit little-endian
 * - 采样率 16000 Hz
 * - 单声道 (mono)
 * - 单帧最大 256KB（约 8 秒音频）
 * - 建议每 100-300ms 发送一帧（3-10KB/帧）
 *
 * @param {string} baseUrl - PC Engine Manager 地址，如 http://192.168.1.100:19000
 * @param {string} token - API 认证 token
 * @param {'voice'|'sherpa'|'whisper'|'funasr'} asrEngine - ASR 引擎选择
 * @param {object} callbacks - 回调函数集合
 * @param {() => void} [callbacks.onReady] - 服务端就绪
 * @param {(kind: string) => void} [callbacks.onStatus] - 状态变更 (recording/transcribing/polishing/done/error)
 * @param {(text: string) => void} [callbacks.onResult] - 最终识别结果
 * @param {(text: string) => void} [callbacks.onPartial] - 部分识别结果（实时）
 * @param {(value: number) => void} [callbacks.onLevel] - 音量 0-1（仅 Vosk）
 * @param {(message: string) => void} [callbacks.onError] - 错误
 * @param {(reason: string) => void} [callbacks.onBusy] - 服务端忙碌
 * @returns {PcVoiceSession} 语音会话对象
 */
export function createPcVoiceSession(baseUrl, token, asrEngine = 'voice', callbacks = {}) {
  const {
    onReady,
    onStatus,
    onResult,
    onPartial,
    onLevel,
    onError,
    onBusy,
  } = callbacks

  // 构建 WebSocket URL
  const base = baseUrl.replace(/\/+$/, '').replace(/^http/, 'ws')
  const wsPath = WS_ASR_PATHS[asrEngine] || WS_ASR_PATHS.voice
  const fullUrl = `${base}${wsPath}`

  // 内部状态
  let ws = null
  let sessionState = 'connecting'
  let resolveStop = null
  let rejectStop = null
  let lastResultText = ''

  function setState(newState) {
    sessionState = newState
  }

  function handleMessage(rawData) {
    let msg
    try {
      msg = JSON.parse(rawData)
    } catch {
      return
    }

    switch (msg.type) {
      case 'ready':
        setState('ready')
        onReady?.()
        break

      case 'status':
        setState(msg.kind || 'recording')
        onStatus?.(msg.kind)
        break

      case 'partial':
        // 实时部分识别结果
        onPartial?.(msg.text || '')
        break

      case 'result':
        lastResultText = msg.text || ''
        onResult?.(lastResultText)
        // stop() 的 Promise 在 status=done 或收到 result 后 resolve
        if (resolveStop) {
          resolveStop(lastResultText)
          resolveStop = null
          rejectStop = null
        }
        break

      case 'level':
        onLevel?.(typeof msg.value === 'number' ? msg.value : 0)
        break

      case 'error':
        setState('error')
        onError?.(msg.message || 'Unknown error')
        if (rejectStop) {
          rejectStop(new Error(msg.message || 'Server error'))
          resolveStop = null
          rejectStop = null
        }
        break

      case 'busy':
        onBusy?.(msg.reason || 'Server busy')
        break

      case 'closed':
        setState('closed')
        break

      case 'ping':
        // 回复 pong，保持心跳
        try { ws.send(JSON.stringify({ type: 'pong' })) } catch {}
        break

      default:
        break
    }
  }

  ws = new WebSocket(fullUrl)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    setState('connecting') // 等待 ready
  }

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') return
    handleMessage(event.data)
  }

  ws.onerror = () => {
    setState('error')
    onError?.('WebSocket 连接失败')
    if (rejectStop) {
      rejectStop(new Error('WebSocket 连接失败'))
      resolveStop = null
      rejectStop = null
    }
  }

  ws.onclose = (event) => {
    setState('closed')
    if (rejectStop) {
      rejectStop(new Error(`WebSocket 断开 (code: ${event.code})`))
      resolveStop = null
      rejectStop = null
    }
  }

  const session = {
    get state() {
      return sessionState
    },

    /**
     * 开始录音
     */
    start() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        setState('recording')
        ws.send(JSON.stringify({ type: 'start' }))
      }
    },

    /**
     * 发送 PCM 音频数据
     * 单帧最大 256KB
     */
    sendAudio(arrayBuffer) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (arrayBuffer.byteLength > 256 * 1024) {
          console.warn('[PcVoiceSession] 音频帧超过 256KB 上限，可能被服务端丢弃')
        }
        ws.send(arrayBuffer)
      }
    },

    /**
     * 停止录音，等待最终识别结果
     * @returns {Promise<string>} 最终识别文本
     */
    stop() {
      return new Promise((resolve, reject) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          resolveStop = resolve
          rejectStop = reject
          setState('transcribing')
          onStatus?.('transcribing')
          ws.send(JSON.stringify({ type: 'stop' }))
        } else {
          reject(new Error('WebSocket 未连接'))
        }
      })
    },

    /**
     * 取消录音并关闭连接
     */
    cancel() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'cancel' }))
      }
      this.close()
    },

    /**
     * 关闭 WebSocket 连接
     * @returns {Promise<void>} 连接关闭完成
     */
    close() {
      return new Promise((resolve) => {
        if (!ws) {
          setState('closed')
          if (rejectStop) {
            rejectStop(new Error('会话已关闭'))
            resolveStop = null
            rejectStop = null
          }
          resolve()
          return
        }

        const originalOnclose = ws.onclose
        ws.onclose = (event) => {
          setState('closed')
          ws = null
          if (rejectStop) {
            rejectStop(new Error('会话已关闭'))
            resolveStop = null
            rejectStop = null
          }
          if (typeof originalOnclose === 'function') {
            try { originalOnclose(event) } catch (_) {}
          }
          resolve()
        }

        try {
          ws.close()
        } catch (_) {
          setState('closed')
          ws = null
          resolve()
        }
      })
    },
  }

  return session
}
