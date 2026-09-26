/**
 * PC 引擎优先降级管理器
 *
 * 当 PC 引擎已配置且可用时，优先使用 PC 引擎服务；
 * 失败后自动降级到用户配置的其他服务。
 *
 * 适用场景：
 * 1. 语音识别：PC 引擎 ASR → 手机端 ASR（讯飞/Vosk/Whisper 等）
 * 2. 图像 OCR：PC 引擎 PaddleOCR/Qwen2-VL → 手机端 OCR（AI 大模型/百度/本地）
 * 3. 文档解析：PC 引擎文档解析 → 无降级（仅 PC 引擎支持）
 *
 * 设计原则：
 * - 只在 PC 引擎已配置（pcEngineServer 非空）时尝试优先
 * - PC 引擎调用失败后静默降级，不打断用户体验
 * - 降级后通过 toast 提示用户发生了切换
 */

import { checkPcEngineHealth, paddleOcrDirect, qwenVlChat, paddleocrVlOcr } from './pcEngineProxy'
import { extractTextFromImage } from './aiService'
import { getPcEngineConfig } from './pcEngine'

/**
 * 检查 PC 引擎是否已配置且可用
 * @param {Object} state - AppContext state
 * @returns {Promise<{available: boolean, baseUrl: string, token: string}>}
 */
export async function checkPcEngineAvailable(state) {
  const { pcEngineServer, pcEnginePort, pcEngineToken } = state
  if (!pcEngineServer) return { available: false, baseUrl: '', token: '' }
  const baseUrl = `http://${pcEngineServer}:${pcEnginePort || '19000'}`
  try {
    const result = await checkPcEngineHealth(baseUrl)
    if (result) {
      return { available: true, baseUrl, token: pcEngineToken || '' }
    }
    return { available: false, baseUrl, token: pcEngineToken || '' }
  } catch {
    return { available: false, baseUrl, token: pcEngineToken || '' }
  }
}

/**
 * 带降级的图像 OCR
 *
 * 优先级：
 * 1. PC 引擎 PaddleOCR（速度快，离线）
 * 2. PC 引擎 Qwen2-VL（精度高，需要 GPU）
 * 3. 手机端 OCR（用户配置的 ocrEngine）
 *
 * @param {File|Blob} file - 图片文件
 * @param {Object} state - AppContext state
 * @param {Function} showToast - 提示函数
 * @returns {Promise<string>} OCR 识别的文本
 */
export async function ocrWithFallback(file, state, showToast) {
  const engineConfig = getPcEngineConfig()
  const pcEngineServer = engineConfig.host
  const pcEnginePort = '19000'
  const pcEngineToken = engineConfig.token
  const pcEngineOcrEngine = engineConfig.ocrEngine || 'paddleocr'

  // 1. 尝试 PC 引擎 OCR
  if (pcEngineServer) {
    const baseUrl = `http://${pcEngineServer}:${pcEnginePort || '19000'}`
    const token = pcEngineToken || ''
    const ocrEngine = pcEngineOcrEngine || 'paddleocr'

    try {
      let text = ''
      if (ocrEngine === 'qwen2-vl') {
        const base64DataUrl = await fileToDataUrl(file)
        const result = await qwenVlChat(baseUrl, token, base64DataUrl, '请识别图片中的所有文字，原样输出')
        text = result?.answer || result?.text || ''
      } else if (ocrEngine === 'paddleocr-vl') {
        const result = await paddleocrVlOcr(baseUrl, token, file)
        text = result?.text || ''
      } else {
        const result = await paddleOcrDirect(baseUrl, token, file)
        text = result?.text || result || ''
      }

      if (text && text.trim().length > 0) {
        return text.trim()
      }
    } catch (pcErr) {
      // PC 引擎失败，静默降级
      console.warn('[PC引擎OCR] 失败，降级到手机端:', pcErr.message)
      if (showToast) {
        showToast('PC 引擎 OCR 不可用，已切换到本地引擎', 'info', null, { duration: 2500 })
      }
    }
  }

  // 2. 降级到手机端 OCR（Tesseract.js 改进版 / AI 大模型 / 百度云）
  const ocrEngine = state.ocrEngine || 'ai-model'
  const isSparkMode = state.aiServiceMode === 'iflytek-spark'
  const isVolcanoMode = state.aiServiceMode === 'volcano'
  const isDashscopeMode = state.aiServiceMode === 'dashscope'
  const effectiveModel = isSparkMode
    ? state.iflytekSparkModel
    : isVolcanoMode
      ? state.volcanoModel
      : isDashscopeMode
        ? state.dashscopeModel
        : state.model

  const base64 = await compressImageForOcr(file)
  const ocrOptions = {
    ocrEngine,
    baiduOcrApiKey: state.baiduOcrApiKey,
    baiduOcrSecretKey: state.baiduOcrSecretKey,
    tesseractLanguage: state.tesseractLanguage || 'chi_sim+eng',
  }
  const visionAiOptions = {
    visionAiUrl: state.visionAiUrl,
    visionAiKey: state.visionAiKey,
    visionAiModel: state.visionAiModel,
  }

  return await extractTextFromImage(
    base64, state.apiKey, state.aiServiceMode, effectiveModel,
    state.iflytekSparkApiKey, state.iflytekSparkApiSecret,
    state.volcanoApiKey, state.dashscopeApiKey, ocrOptions, visionAiOptions,
  )
}

/**
 * 获取有效的语音识别模式（带降级）
 *
 * 如果 PC 引擎已配置且可用，优先返回 'pc-engine-voice'；
 * 否则返回用户配置的 speechMode。
 *
 * @param {Object} state - AppContext state
 * @param {string} userSpeechMode - 用户配置的语音模式
 * @returns {Promise<string>} 实际使用的语音模式
 */
export async function resolveSpeechModeWithFallback(state, userSpeechMode) {
  const engineConfig = getPcEngineConfig()

  // 如果用户已选择 pc-engine-voice，直接返回
  if (userSpeechMode === 'pc-engine-voice') return userSpeechMode

  // 如果 PC 引擎已配置，检查是否可用
  if (engineConfig.host) {
    const { available } = await checkPcEngineAvailable(state)
    if (available) {
      return 'pc-engine-voice'
    }
  }

  // 降级到用户配置的模式
  return userSpeechMode
}

// AI 能力缓存（sessionStorage，5 分钟有效期）
const AI_CAP_CACHE_KEY = 'pc_engine_ai_capable'
function getAiCapCache() {
  try {
    const raw = sessionStorage.getItem(AI_CAP_CACHE_KEY)
    if (raw) {
      const { time, value } = JSON.parse(raw)
      if (Date.now() - time < 300000) return value
    }
  } catch (_) {}
  return null
}
function setAiCapCache(value) {
  try {
    sessionStorage.setItem(AI_CAP_CACHE_KEY, JSON.stringify({ time: Date.now(), value }))
  } catch (_) {}
}

/**
 * 解析有效的 AI 服务模式（带 PC 引擎优先降级）
 *
 * 如果 PC 引擎已配置且健康检查通过，返回 'pc-engine'；
 * 否则返回用户配置的 aiServiceMode。
 *
 * @param {Object} state - AppContext state
 * @returns {Promise<string>} 实际使用的 AI 服务模式
 */
export async function resolveAiMode(state) {
  const engineConfig = getPcEngineConfig()

  // 检查缓存
  const cached = getAiCapCache()
  if (cached === true) return 'pc-engine'
  if (cached === false) return state.aiServiceMode || 'deepseek'

  // PC 引擎已配置时检测 AI 能力
  if (engineConfig.host) {
    try {
      const { available, baseUrl, token } = await checkPcEngineAvailable(state)
      if (available) {
        // 尝试调用 AI 端点确认可用
        const { aiChatCompletion } = await import('./pcEngineProxy')
        const testResult = await aiChatCompletion(baseUrl, token, [
          { role: 'user', content: 'hi' }
        ], { maxTokens: 1, timeout: 3000 })
        if (testResult.content !== undefined) {
          setAiCapCache(true)
          return 'pc-engine'
        }
      }
    } catch (_) {
      // PC 引擎 AI 不可用，降级
    }
  }

  setAiCapCache(false)
  return state.aiServiceMode || 'deepseek'
}

// ─── 工具函数 ───

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function compressImageForOcr(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
