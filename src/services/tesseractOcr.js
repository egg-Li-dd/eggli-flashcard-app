/**
 * Tesseract.js OCR 服务
 *
 * 完全离线、纯前端 OCR，支持 100+ 语言
 * 用户可选择下载不同语言包（中文约 10MB，英文约 2MB）
 */

import Tesseract from 'tesseract.js'

const WINDOW_KEY = '__tesseractOcrState'

function getState() {
  if (!window[WINDOW_KEY]) {
    window[WINDOW_KEY] = {
      worker: null,
      workerLang: null,
      initStatus: 'idle',
      initError: null,
      onProgress: null,
      initPromise: null,
    }
  }
  return window[WINDOW_KEY]
}

const TESSERACT_LANG_PATH = '/tesseract/lang'
const TESSERACT_CORE_PATH = '/tesseract/tesseract-core.wasm.js'
const TESSERACT_WORKER_PATH = '/tesseract/worker.min.js'

export const TESSERACT_LANGUAGES = [
  { value: 'chi_sim', label: '中文简体', size: '约 10 MB', description: '简体中文识别' },
  { value: 'chi_tra', label: '中文繁体', size: '约 10 MB', description: '繁体中文识别' },
  { value: 'eng', label: '英文', size: '约 2 MB', description: '英文识别，体积最小' },
  { value: 'jpn', label: '日文', size: '约 15 MB', description: '日文识别' },
  { value: 'kor', label: '韩文', size: '约 12 MB', description: '韩文识别' },
  { value: 'chi_sim+eng', label: '中英混合', size: '约 12 MB', description: '中英文混合识别（推荐）' },
]

const DEFAULT_LANG = 'chi_sim+eng'

/**
 * 初始化 Tesseract.js worker
 * @param {string} lang 语言代码，如 'chi_sim', 'eng', 'chi_sim+eng'
 * @param {function} onProgress 进度回调 (progress) => void
 * @returns {Promise<void>}
 */
export async function initTesseractOcr(lang = DEFAULT_LANG, onProgress = null) {
  const state = getState()
  if (state.initStatus === 'ready' && state.workerLang === lang) return
  if (state.initStatus === 'loading') {
    if (state.initPromise) {
      await state.initPromise
      if (state.initStatus === 'ready' && state.workerLang === lang) return
    }
  }

  state.onProgress = onProgress
  state.initStatus = 'loading'
  state.initError = null
  if (state.onProgress) state.onProgress(0)

  state.initPromise = (async () => {
    try {
      if (state.worker && state.workerLang !== lang) {
        try {
          await state.worker.terminate()
        } catch (e) {
          console.warn('终止旧 worker 失败:', e)
        }
        state.worker = null
      }

      state.worker = await Tesseract.createWorker(lang, 1, {
        langPath: TESSERACT_LANG_PATH,
        corePath: TESSERACT_CORE_PATH,
        workerPath: TESSERACT_WORKER_PATH,
        gzip: false,
        logger: (m) => {
          if (m.status === 'loading tesseract core') {
            if (state.onProgress) state.onProgress(5)
          } else if (m.status === 'initializing tesseract') {
            if (state.onProgress) state.onProgress(10)
          } else if (m.status === 'loading language traineddata') {
            const progress = Math.round((m.progress || 0) * 90) + 10
            if (state.onProgress) state.onProgress(progress)
          } else if (m.status === 'initializing api') {
            if (state.onProgress) state.onProgress(95)
          } else if (m.status === 'ready') {
            if (state.onProgress) state.onProgress(100)
          }
        },
      })

      state.workerLang = lang
      state.initStatus = 'ready'
      if (state.onProgress) state.onProgress(100)
    } catch (e) {
      state.initStatus = 'error'
      state.initError = e
      console.error('Tesseract.js 初始化失败:', e)
      throw e
    } finally {
      state.initPromise = null
    }
  })()

  await state.initPromise
}

/**
 * 获取当前初始化状态
 */
export function getTesseractOcrStatus() {
  const state = getState()
  return { status: state.initStatus, error: state.initError, lang: state.workerLang }
}

export async function releaseTesseractWorker() {
  const state = getState()
  if (state.worker) {
    try {
      await state.worker.terminate()
    } catch (e) {
      console.warn('释放 worker 失败:', e)
    }
    state.worker = null
    state.workerLang = null
    state.initStatus = 'idle'
    state.initPromise = null
  }
}

export async function extractTextWithTesseract(base64Image, lang = null) {
  const state = getState()
  const targetLang = lang || DEFAULT_LANG
  
  if (state.initStatus !== 'ready' || state.workerLang !== targetLang) {
    await initTesseractOcr(targetLang)
  }

  if (!state.worker) {
    throw new Error('Tesseract worker 未初始化')
  }

  const dataUrl = base64Image.startsWith('data:')
    ? base64Image
    : 'data:image/jpeg;base64,' + base64Image

  try {
    const result = await state.worker.recognize(dataUrl)
    const text = (result?.data?.text || '').trim()
    if (!text) {
      throw new Error('Tesseract.js 未识别到任何文字，请检查图片清晰度或换一张')
    }
    return { content: text, tokens: 0 }
  } catch (e) {
    console.error('Tesseract.js 识别失败:', e)
    throw new Error('Tesseract.js 识别失败：' + (e?.message || e))
  }
}

/**
 * 测试 Tesseract.js 连接（触发初始化）
 */
export async function testTesseractOcrConnection(lang = DEFAULT_LANG) {
  try {
    await initTesseractOcr(lang)
    return { ok: true, message: '语言包加载成功，Tesseract.js OCR 已就绪' }
  } catch (e) {
    return { ok: false, message: '语言包加载失败：' + (e?.message || '未知错误') }
  }
}

/**
 * 检查语言包是否已下载（通过尝试快速初始化）
 * @param {string} lang 语言代码
 * @returns {Promise<{ downloaded: boolean, cached: boolean }>}
 */
export async function checkTesseractLangPack(lang) {
  // Tesseract.js 会自动使用浏览器缓存的 traineddata
  // 我们通过尝试创建一个临时 worker 来检查
  try {
    const tempWorker = await Tesseract.createWorker(lang, 1, {
      langPath: TESSERACT_LANG_PATH,
      corePath: TESSERACT_CORE_PATH,
      workerPath: TESSERACT_WORKER_PATH,
      gzip: false,
      logger: (m) => {
        // 如果 loading language traineddata 进度很快就说明已缓存
      },
    })
    await tempWorker.terminate()
    // 如果成功创建，说明语言包可用（可能是刚下载或已缓存）
    return { downloaded: true, cached: true }
  } catch (e) {
    return { downloaded: false, cached: false }
  }
}