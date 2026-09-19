/**
 * PaddleOCR 离线（前端）服务
 *
 * 使用 @paddlejs-models/ocr 在浏览器/WebView 中直接推理：
 *   - 模型文件（det + rec）首次约 10MB，从百度 CDN 下载后浏览器自动缓存
 *   - 依赖 WebGL，需 Android WebView 启用硬件加速（默认已启用）
 *   - 中端机单张图片约 3~8 秒，低端机可能更慢
 *
 * 注意：WebView 环境下 Paddle.js 可能因以下原因失败：
 *   1. CDN 不可达（国内访问 paddlejs.bj.bcebos.com 不稳定）
 *   2. CORS 跨域被 WebView 拦截
 *   3. WebGL 扩展不支持
 *   4. ArrayBuffer/fetch API 行为差异
 * 失败时通过 diagnosePaddleOcrLocal() 提供详细诊断信息
 */

const WINDOW_KEY = '__paddleOcrState'

function getState() {
  if (!window[WINDOW_KEY]) {
    window[WINDOW_KEY] = {
      ocrModule: null,
      scriptLoadPromise: null,
      initPromise: null,
      initStatus: 'idle',
      initError: null,
      initErrorDetail: null,
      onProgress: null,
      consecutiveFailures: 0,
    }
  }
  return window[WINDOW_KEY]
}

const MAX_CONSECUTIVE_FAILURES = 3

const DEFAULT_DET_MODEL = '/paddlejs/models/det/model.json'
const DEFAULT_REC_MODEL = '/paddlejs/models/rec/model.json'

const OPENCV_JS_PATH = '/paddlejs/opencv_ocr.js'
const OCR_JS_PATH = '/paddlejs/ocr.js'

/**
 * 动态加载 script 标签（Promise 封装）。
 * 同一 URL 只会加载一次。
 */
function loadScript(url, options = {}) {
  return new Promise((resolve, reject) => {
    // 检查是否已加载
    if (document.querySelector(`script[data-src="${url}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.dataset.src = url
    if (options.id) script.id = options.id
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('脚本加载失败: ' + url))
    document.head.appendChild(script)
  })
}

/**
 * 内部：加载 PaddleOCR 运行时（opencv_ocr.js + ocr.js）。
 * 用 script 标签方式加载 UMD 模块，避免 Vite esbuild 预构建
 * 对 UMD/WASM 包的兼容问题。
 *
 * 加载顺序：
 *   1. opencv_ocr.js → 挂到 window.cv（含 WASM，需等待 cv.ready）
 *   2. ocr.js → 挂到 window.paddlejs.ocr（依赖 window.cv）
 */
async function loadOcrModule() {
  const state = getState()
  if (state.ocrModule) return state.ocrModule
  if (state.scriptLoadPromise) return state.scriptLoadPromise

  state.scriptLoadPromise = (async () => {
    try {
      await loadScript(OPENCV_JS_PATH)
      if (!window.cv) {
        throw new Error('opencv_ocr.js 加载后 window.cv 不存在')
      }
      if (window.cv.ready && typeof window.cv.ready.then === 'function') {
        await window.cv.ready
      }

      await loadScript(OCR_JS_PATH)
      if (!window.paddlejs || !window.paddlejs.ocr) {
        throw new Error('ocr.js 加载后 window.paddlejs.ocr 不存在')
      }

      state.ocrModule = window.paddlejs.ocr
      return state.ocrModule
    } catch (err) {
      state.scriptLoadPromise = null
      throw err
    }
  })()
  return state.scriptLoadPromise
}

/**
 * 检测 WebGL 是否可用（Paddle.js 依赖 WebGL backend）。
 */
function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return { ok: false, reason: 'WebGL 不可用，请检查 WebView 是否启用硬件加速' }
    // 检查关键扩展
    const extensions = gl.getSupportedExtensions ? gl.getSupportedExtensions() : []
    return {
      ok: true,
      info: {
        version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(gl.RENDERER),
        extensions: extensions ? extensions.length : 0,
      },
    }
  } catch (e) {
    return { ok: false, reason: 'WebGL 检测异常：' + (e.message || e) }
  }
}

/**
 * 检测模型 URL 网络可达性。
 *
 * 重要说明：浏览器对任何主动 HTTP 请求（fetch HEAD/GET、XHR、link preload）
 * 都会在控制台自动打印 net::ERR_ABORTED 错误，JavaScript 无法拦截。
 * 即使 paddlejs CDN 实际可达，浏览器也会因 CORS 预检失败而中止请求。
 *
 * 因此本函数不再发起实际 HTTP 请求，而是返回一个"未检测"标记，
 * 实际可达性由 paddle.js 初始化时自行验证（其内部错误会写入 _initErrorDetail）。
 * 这样诊断面板就不会污染浏览器控制台。
 */
async function checkModelUrlReachable(url) {
  return {
    ok: null, // null 表示未主动检测
    skipped: true,
    reason: '已跳过主动检测（避免浏览器控制台报 ERR_ABORTED）',
    url,
    // 实际可达性请参考"上次错误"中的 paddle.js 错误信息
  }
}

/**
 * 提取错误对象的全部可读信息（包括 message/stack/name/cause 链 + 所有可枚举属性）。
 * paddle.js 内部抛出的错误对象可能含有额外字段（如 type/stage/url 等），
 * 仅读 err.message 会丢失关键信息。
 */
function extractErrorInfo(err) {
  if (err == null) return { message: String(err), name: 'Unknown', stack: '' }
  const info = {
    message: err.message || String(err),
    name: err.name || 'Error',
    stack: err.stack || '',
  }
  // cause 链（Error.cause）
  if (err.cause) {
    info.cause = extractErrorInfo(err.cause)
  }
  // 所有可枚举自有属性（排除 stack/message/name 已处理）
  const extras = {}
  try {
    for (const k in err) {
      if (k === 'message' || k === 'name' || k === 'stack' || k === 'cause') continue
      if (Object.prototype.hasOwnProperty.call(err, k)) {
        try {
          const v = err[k]
          extras[k] = typeof v === 'string' ? v : (typeof v === 'object' && v !== null ? JSON.stringify(v).substring(0, 500) : String(v))
        } catch (_) { /* ignore */ }
      }
    }
  } catch (_) { /* ignore */ }
  if (Object.keys(extras).length > 0) info.extras = extras
  return info
}

/**
 * 初始化 PaddleOCR 模型。
 * - 首次调用会触发模型下载（约 10MB，从百度 CDN 拉取）
 * - 后续调用复用已初始化实例
 * @param {function} onProgress 可选进度回调 (status) => void
 * @returns {Promise<void>}
 */
export async function initPaddleOcrLocal(onProgress) {
  const state = getState()
  if (state.initStatus === 'ready') return
  if (state.initStatus === 'loading') return state.initPromise
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    throw new Error(`PaddleOCR 已连续失败 ${state.consecutiveFailures} 次，自动重试已暂停。请在设置页点击「诊断失败原因」排查问题后，手动重新加载`)
  }
  state.onProgress = onProgress || null
  state.initStatus = 'loading'
  state.initError = null
  state.initErrorDetail = null
  if (state.onProgress) state.onProgress('loading')

  const capturedAsync = []
  const onUnhandled = (e) => {
    const err = e && (e.reason || e.error || e.message)
    if (err) {
      capturedAsync.push({
        type: e.type || 'unhandledrejection',
        info: extractErrorInfo(err),
        time: Date.now(),
      })
      console.warn('[PaddleOCR] 捕获到异步错误:', err)
    }
  }
  window.addEventListener('unhandledrejection', onUnhandled)
  window.addEventListener('error', onUnhandled)

  state.initPromise = (async () => {
    try {
      const webgl = checkWebGLSupport()
      if (!webgl.ok) {
        throw new Error('WebGL 不可用：' + webgl.reason)
      }

      let ocr
      try {
        ocr = await loadOcrModule()
      } catch (importErr) {
        const info = extractErrorInfo(importErr)
        throw new Error('加载 PaddleOCR 运行时失败：' + info.message + (info.extras ? ' | ' + JSON.stringify(info.extras) : ''))
      }

      if (!ocr || typeof ocr.init !== 'function') {
        throw new Error('OCR 模块加载异常：未找到 init 方法（ocr = ' + typeof ocr + ', keys = ' + (ocr ? Object.keys(ocr).join(',') : 'null') + ')')
      }

      const originalFetch = window.fetch
      let fetchInterceptor = null
      try {
        fetchInterceptor = (input, init) => {
          let url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input))
          const lowerUrl = url.toLowerCase()
          if (lowerUrl.includes('paddlejs') || lowerUrl.includes('baidu') || 
              lowerUrl.includes('/det/') || lowerUrl.includes('/rec/') ||
              lowerUrl.includes('model.json') || lowerUrl.includes('chunk_')) {
            if (lowerUrl.includes('/det/') || lowerUrl.includes('det/model')) {
              const parts = url.split('/')
              const fileName = parts[parts.length - 1]
              url = '/paddlejs/models/det/' + fileName
            } else if (lowerUrl.includes('/rec/') || lowerUrl.includes('rec/model')) {
              const parts = url.split('/')
              const fileName = parts[parts.length - 1]
              url = '/paddlejs/models/rec/' + fileName
            }
          }
          return originalFetch(url, init)
        }
        window.fetch = fetchInterceptor
      } catch (_) {}

      try {
        await ocr.init()
      } catch (initErr) {
        const info = extractErrorInfo(initErr)
        const asyncErrors = capturedAsync.length > 0 ? capturedAsync.map(c => c.info) : []
        const msg = 'Paddle.js init() 失败：' + info.message
        const enhanced = new Error(msg)
        enhanced.cause = initErr
        enhanced._extras = info.extras
        enhanced._asyncErrors = asyncErrors
        enhanced._originalStack = info.stack
        throw enhanced
      }

      state.initStatus = 'ready'
      state.consecutiveFailures = 0
      if (state.onProgress) state.onProgress('ready')
    } catch (err) {
      state.initStatus = 'error'
      state.consecutiveFailures += 1
      state.initError = err
      state.initErrorDetail = extractErrorInfo(err)
      if (capturedAsync.length > 0) {
        state.initErrorDetail.asyncErrors = capturedAsync.map(c => ({ type: c.type, ...c.info }))
      }
      state.initErrorDetail.errorType = Object.prototype.toString.call(err)
      if (state.onProgress) state.onProgress('error', err)
      throw err
    } finally {
      if (fetchInterceptor) {
        window.fetch = originalFetch
      }
      window.removeEventListener('unhandledrejection', onUnhandled)
      window.removeEventListener('error', onUnhandled)
    }
  })()
  return state.initPromise
}

/**
 * 重置初始化状态（用于错误后重试）。
 * 清除缓存的初始化Promise，允许重新加载模型。
 */
export function resetPaddleOcrLocal() {
  const state = getState()
  state.initPromise = null
  state.initStatus = 'idle'
  state.consecutiveFailures = 0
  state.initError = null
  state.initErrorDetail = null
}

export function getPaddleOcrLocalStatus() {
  const state = getState()
  return { status: state.initStatus, error: state.initError, consecutiveFailures: state.consecutiveFailures }
}

/**
 * 详细诊断（用于"加载失败"时给用户具体原因）。
 * 检查 WebGL、模型 URL 可达性，并返回上次初始化的错误堆栈。
 * @returns {Promise<{ok:boolean, message:string, detail:object}>}
 */
export async function diagnosePaddleOcrLocal() {
  const state = getState()
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
  const detail = {
    webgl: null,
    detModel: null,
    recModel: null,
    lastError: state.initErrorDetail,
    platform: {
      isNative,
      userAgent: navigator.userAgent.substring(0, 200),
      capacitorHttpEnabled: !!(window.Capacitor && window.Capacitor.getConfig && window.Capacitor.getConfig().plugins && window.Capacitor.getConfig().plugins.CapacitorHttp && window.Capacitor.getConfig().plugins.CapacitorHttp.enabled),
      origin: typeof window !== 'undefined' ? window.location?.origin : '',
    },
  }

  // 1. WebGL 检测
  const webgl = checkWebGLSupport()
  detail.webgl = webgl

  // 2. 模型 URL 可达性（已跳过主动检测，避免污染控制台）
  const [detResult, recResult] = await Promise.all([
    checkModelUrlReachable(DEFAULT_DET_MODEL),
    checkModelUrlReachable(DEFAULT_REC_MODEL),
  ])
  detail.detModel = detResult
  detail.recModel = recResult

  // 综合判断
  const reasons = []
  const recommendations = []
  if (!webgl.ok) {
    reasons.push('WebGL 不可用：' + webgl.reason)
    recommendations.push('在 AndroidManifest 中开启硬件加速，或换一台支持 WebGL 的设备')
  }
  // URL 可达性已跳过主动检测，只在 paddle.js 上次初始化失败时分析错误
  if (state.initErrorDetail) {
    reasons.push('上次初始化错误：' + state.initErrorDetail.message)
    const allErrText = [
      state.initErrorDetail.message,
      state.initErrorDetail.cause?.message,
      ...(state.initErrorDetail.asyncErrors || []).map(a => a.message),
    ].filter(Boolean).join('\n').toLowerCase()
    const allStack = [
      state.initErrorDetail.stack,
      state.initErrorDetail.cause?.stack,
    ].filter(Boolean).join('\n').toLowerCase()

    // 智能识别具体原因
    if (allErrText.includes('webgl') || allErrText.includes('gpu') || allErrText.includes('shader') || allErrText.includes('webgl2 not supported') || allErrText.includes('context')) {
      recommendations.push('🔧 WebGL/GPU 不支持：在 AndroidManifest 中开启硬件加速，或换一台支持 WebGL 的设备')
    } else if (allErrText.includes('failed to fetch') || allErrText.includes('networkerror') || allErrText.includes('load failed') || allErrText.includes('err_aborted') || allErrText.includes('err_name_not_resolved') || allErrText.includes('err_internet_disconnected') || allErrText.includes('err_connection')) {
      recommendations.push('🌐 网络/CORS 错误：paddle.js 无法从百度 CDN 下载模型（已被浏览器 CORS 拦截）')
      recommendations.push('建议改用「百度智能云 OCR」引擎（需配置 AK/SK），或「AI 大模型视觉」引擎（沿用 AI 服务配置）')
    } else if (allErrText.includes('module') || allErrText.includes('import') || allErrText.includes('parse') || allErrText.includes('syntax')) {
      recommendations.push('📦 模块加载错误：@paddlejs-models/ocr 模块可能损坏，请尝试清理浏览器缓存或重装 npm 包')
    } else if (allErrText.includes('wasm') || allErrText.includes('emscripten')) {
      recommendations.push('⚙️ WebAssembly 不支持：paddle.js 依赖 WASM，请更新 WebView 或换设备')
    } else if (allErrText.includes('model') && (allErrText.includes('url') || allErrText.includes('path') || allErrText.includes('fetch'))) {
      recommendations.push('🔗 模型 URL 配置错误：请检查 DEFAULT_DET_MODEL / DEFAULT_REC_MODEL 常量')
    } else if (allStack.includes('paddlejs') || allStack.includes('@paddlejs')) {
      recommendations.push('⚙️ Paddle.js 内部错误：建议清理缓存后重试，或换用「百度智能云 OCR」引擎')
    } else {
      recommendations.push('❓ 未知错误：查看下方"上次错误"详情中的"附加属性"和"堆栈"，可复制错误信息反馈给开发者')
    }
    if (state.initErrorDetail.asyncErrors && state.initErrorDetail.asyncErrors.length > 0 && !allErrText) {
      reasons.push('捕获到 ' + state.initErrorDetail.asyncErrors.length + ' 条异步错误')
    }
  }

  if (reasons.length === 0) {
    return {
      ok: true,
      message: '环境检查通过。若加载模型仍失败，错误详情会显示在下方"上次错误"中',
      detail,
      recommendations: ['点击"加载模型"触发实际下载；若失败会显示具体错误堆栈'],
    }
  }
  return {
    ok: false,
    message: reasons.join(' | '),
    detail,
    recommendations,
  }
}

/**
 * 把 base64 字符串转换为 Canvas 元素。
 * PaddleOCR 在 Android WebView 中对 ImageData 兼容性不佳，
 * 直接传入 HTMLCanvasElement 更稳定。
 */
function base64ToCanvas(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      if (!w || !h) {
        reject(new Error('图片尺寸无效，可能加载失败'))
        return
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法创建 Canvas 2D 上下文'))
        return
      }
      try {
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas)
      } catch (err) {
        reject(new Error('绘制图片失败：' + (err.message || err)))
      }
    }
    img.onerror = () => reject(new Error('图片加载失败，可能格式不支持'))
    const dataUrl = base64.startsWith('data:')
      ? base64
      : 'data:image/jpeg;base64,' + base64
    img.src = dataUrl
  })
}

/**
 * 识别图片中的文字（离线推理）。
 * @param {string} base64Image 图片 base64 字符串（可带 data: 前缀）
 * @returns {Promise<{ content: string, tokens: number }>}
 */
export async function extractTextWithPaddleOcrLocal(base64Image) {
  const state = getState()
  if (state.initStatus !== 'ready') {
    await initPaddleOcrLocal()
  }
  const ocr = await loadOcrModule()
  const canvas = await base64ToCanvas(base64Image)
  let result
  try {
    result = await ocr.recognize(canvas)
  } catch (firstErr) {
    try {
      const ctx = canvas.getContext('2d')
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      result = await ocr.recognize(imageData)
    } catch (secondErr) {
      resetPaddleOcrLocal()
      throw new Error('PaddleOCR 识别失败：' + (firstErr?.message || firstErr) +
        ' | fallback 也失败：' + (secondErr?.message || secondErr))
    }
  }
  const text = (result?.text || '').toString()
  if (!text.trim()) {
    throw new Error('PaddleOCR 离线模式未识别到任何文字，请检查图片清晰度或换一张')
  }
  return { content: text, tokens: 0 }
}

/**
 * 测试 PaddleOCR 离线引擎可用性（触发初始化）。
 */
export async function testPaddleOcrLocalConnection() {
  try {
    await initPaddleOcrLocal()
    return { ok: true, message: '模型加载成功，离线 OCR 已就绪' }
  } catch (err) {
    // 失败时自动跑诊断，给出具体原因
    const diag = await diagnosePaddleOcrLocal()
    return { ok: false, message: diag.message || (err?.message || '模型加载失败') }
  }
}
