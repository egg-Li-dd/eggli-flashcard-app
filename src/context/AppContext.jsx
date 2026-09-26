import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import * as db from '../services/db'
import { STORAGE_KEYS, MODELS } from '../utils/constants'
import {
  isSupabaseConfigured,
  onAuthChange,
  getCurrentUser,
  supabase,
  getEffectiveConfig,
} from '../services/cloudbase'
import { sha256 } from '../utils/helpers'
import {
  fetchCloudSettings,
  saveCloudSettings,
  extractSettingsForApp,
} from '../services/settingsSync'
import { getUserProfile, saveUserProfile } from '../services/userProfile'

const AppContext = createContext(null)

const PRESET_STYLE_SCHEMES = [
  {
    id: 'preset-default-light',
    name: '默认浅色',
    type: 'preset',
    bgPreset: 'default-light',
    bgImage: '',
    bgImageMode: 'cover',
    bgBlur: 0,
    bgMaskOpacity: 0,
    cardRadius: 16,
    cardShadow: 'medium',
    cardBorder: 'none',
    cardOpacity: 100,
    btnPrimaryOpacity: 100,
    btnSecondaryOpacity: 100,
    createdAt: 0,
  },
  {
    id: 'preset-default-dark',
    name: '默认深色',
    type: 'preset',
    bgPreset: 'default-dark',
    bgImage: '',
    bgImageMode: 'cover',
    bgBlur: 0,
    bgMaskOpacity: 0,
    cardRadius: 16,
    cardShadow: 'medium',
    cardBorder: 'none',
    cardOpacity: 100,
    btnPrimaryOpacity: 100,
    btnSecondaryOpacity: 100,
    createdAt: 0,
  },
  {
    id: 'preset-eye-care',
    name: '护眼米色',
    type: 'preset',
    bgPreset: 'eye-care',
    bgImage: '',
    bgImageMode: 'cover',
    bgBlur: 0,
    bgMaskOpacity: 0,
    cardRadius: 16,
    cardShadow: 'medium',
    cardBorder: 'none',
    cardOpacity: 100,
    btnPrimaryOpacity: 100,
    btnSecondaryOpacity: 100,
    createdAt: 0,
  },
  {
    id: 'preset-fresh-blue',
    name: '清新蓝调',
    type: 'preset',
    bgPreset: 'fresh-blue',
    bgImage: '',
    bgImageMode: 'cover',
    bgBlur: 0,
    bgMaskOpacity: 0,
    cardRadius: 16,
    cardShadow: 'medium',
    cardBorder: 'none',
    cardOpacity: 100,
    btnPrimaryOpacity: 100,
    btnSecondaryOpacity: 100,
    createdAt: 0,
  },
  {
    id: 'preset-soft-purple',
    name: '柔和紫霞',
    type: 'preset',
    bgPreset: 'soft-purple',
    bgImage: '',
    bgImageMode: 'cover',
    bgBlur: 0,
    bgMaskOpacity: 0,
    cardRadius: 16,
    cardShadow: 'medium',
    cardBorder: 'none',
    cardOpacity: 100,
    btnPrimaryOpacity: 100,
    btnSecondaryOpacity: 100,
    createdAt: 0,
  },
  {
    id: 'preset-minimal-gray',
    name: '极简灰白',
    type: 'preset',
    bgPreset: 'minimal-gray',
    bgImage: '',
    bgImageMode: 'cover',
    bgBlur: 0,
    bgMaskOpacity: 0,
    cardRadius: 16,
    cardShadow: 'medium',
    cardBorder: 'none',
    cardOpacity: 100,
    btnPrimaryOpacity: 100,
    btnSecondaryOpacity: 100,
    createdAt: 0,
  },
]

// 本地模式下的登录状态 key
const LOCAL_LOGGED_IN_KEY = 'app_local_logged_in'
const LOCAL_USERNAME_KEY = 'app_local_username'

// 迁移旧 DeepSeek 模型名 → 新模型名（API 已弃用 deepseek-chat / deepseek-reasoner）
// 同时修复 model 被错误存为 AI 服务模式名 "deepseek" 的情况
const LEGACY_MODEL_MAP = {
  'deepseek-chat': 'deepseek-v4-pro',
  'deepseek-reasoner': 'deepseek-v4-flash',
  'deepseek': 'deepseek-v4-pro',
}
const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL)
if (savedModel && LEGACY_MODEL_MAP[savedModel]) {
  localStorage.setItem(STORAGE_KEYS.MODEL, LEGACY_MODEL_MAP[savedModel])
}

const initialState = {
  categories: [],
  apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
  model: localStorage.getItem(STORAGE_KEYS.MODEL) || MODELS[0].value,
  fontSize: localStorage.getItem(STORAGE_KEYS.FONT_SIZE) || 'normal',
  eyeProtection: localStorage.getItem(STORAGE_KEYS.EYE_PROTECTION) === 'true',
  theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'auto',   // 'light' | 'dark' | 'auto'
  bgPreset: localStorage.getItem(STORAGE_KEYS.BG_PRESET) || 'default-light',
  bgImage: localStorage.getItem(STORAGE_KEYS.BG_IMAGE) || '',
  bgImageMode: localStorage.getItem(STORAGE_KEYS.BG_IMAGE_MODE) || 'cover',
  bgBlur: parseInt(localStorage.getItem(STORAGE_KEYS.BG_BLUR) || '0', 10),
  bgMaskOpacity: (() => {
    const img = localStorage.getItem(STORAGE_KEYS.BG_IMAGE) || ''
    const mask = parseInt(localStorage.getItem(STORAGE_KEYS.BG_MASK_OPACITY) || '0', 10)
    // 有背景图片但遮罩透明度为0时，自动设为50确保图片可见
    if (img && mask === 0) {
      localStorage.setItem(STORAGE_KEYS.BG_MASK_OPACITY, '50')
      return 50
    }
    return mask
  })(),
  cardRadius: parseInt(localStorage.getItem(STORAGE_KEYS.CARD_RADIUS) || '16', 10),
  cardShadow: localStorage.getItem(STORAGE_KEYS.CARD_SHADOW) || 'medium',
  cardBorder: localStorage.getItem(STORAGE_KEYS.CARD_BORDER) || 'none',
  cardOpacity: parseInt(localStorage.getItem(STORAGE_KEYS.CARD_OPACITY) || '100', 10),
  btnPrimaryOpacity: parseInt(localStorage.getItem(STORAGE_KEYS.BTN_PRIMARY_OPACITY) || '100', 10),
  btnSecondaryOpacity: parseInt(localStorage.getItem(STORAGE_KEYS.BTN_SECONDARY_OPACITY) || '100', 10),
  styleSchemes: JSON.parse(localStorage.getItem(STORAGE_KEYS.STYLE_SCHEMES) || '[]'),
  activeStyleScheme: localStorage.getItem(STORAGE_KEYS.ACTIVE_STYLE_SCHEME) || 'preset-default-light',
  toast: null,
  // 语音识别相关
  speechMode: localStorage.getItem(STORAGE_KEYS.SPEECH_MODE) || (Capacitor.isNativePlatform() ? 'vosk-offline' : 'web-speech'),
  speechApiUrl: localStorage.getItem(STORAGE_KEYS.SPEECH_API_URL) || '',
  speechApiKey: localStorage.getItem(STORAGE_KEYS.SPEECH_API_KEY) || '',
  iflytekAppId: localStorage.getItem(STORAGE_KEYS.IFLYTEK_APP_ID) || '',
  iflytekApiSecret: localStorage.getItem(STORAGE_KEYS.IFLYTEK_API_SECRET) || '',
  inputBarMode: localStorage.getItem(STORAGE_KEYS.INPUT_BAR_MODE) || 'fixed',
  voskReady: false,
  voskModelStatus: null,
  // v 新增：悬浮窗当前归属目标（{ categoryId, categoryName, chapterId, chapterName, unitId, unitName }）
  currentTarget: JSON.parse(localStorage.getItem('app_current_target') || 'null'),
  // v 新增：全局草稿数（pending + failed，用于红点提示）
  draftCount: 0,
  // v 新增：系统级悬浮窗是否已启用（仅 APK 模式有效，浏览器自动降级为 floating）
  systemFloatingEnabled: localStorage.getItem('app_system_floating_enabled') === 'true',
  aiServiceMode: localStorage.getItem(STORAGE_KEYS.AI_SERVICE_MODE) || 'deepseek',
  iflytekSparkModel: localStorage.getItem(STORAGE_KEYS.IFLYTEK_SPARK_MODEL) || 'lite',
  // 新增：文字识别服务 - 讯飞星火独立配置（APIKey + APISecret）
  iflytekSparkApiKey: localStorage.getItem(STORAGE_KEYS.IFLYTEK_SPARK_API_KEY) || '',
  iflytekSparkApiSecret: localStorage.getItem(STORAGE_KEYS.IFLYTEK_SPARK_API_SECRET) || '',
  // 新增：语音识别服务 - OpenAI 兼容 Whisper API 独立配置
  whisperApiUrl: localStorage.getItem(STORAGE_KEYS.WHISPER_API_URL) || '',
  whisperApiKey: localStorage.getItem(STORAGE_KEYS.WHISPER_API_KEY) || '',
  // 新增：语音识别服务 - 讯飞语音听写(IAT)独立配置
  iflytekIatAppId: localStorage.getItem(STORAGE_KEYS.IFLYTEK_IAT_APP_ID) || '',
  iflytekIatApiKey: localStorage.getItem(STORAGE_KEYS.IFLYTEK_IAT_API_KEY) || '',
  iflytekIatApiSecret: localStorage.getItem(STORAGE_KEYS.IFLYTEK_IAT_API_SECRET) || '',
  // 新增：讯飞实时语音转写标准版
  iflytekRtasrStdAppId: localStorage.getItem(STORAGE_KEYS.IFLYTEK_RTASR_STD_APP_ID) || '',
  iflytekRtasrStdApiKey: localStorage.getItem(STORAGE_KEYS.IFLYTEK_RTASR_STD_API_KEY) || '',
  // 新增：讯飞实时语音转写大模型
  iflytekRtasrLlmAppId: localStorage.getItem(STORAGE_KEYS.IFLYTEK_RTASR_LLM_APP_ID) || '',
  iflytekRtasrLlmAccessKeyId: localStorage.getItem(STORAGE_KEYS.IFLYTEK_RTASR_LLM_ACCESS_KEY_ID) || '',
  iflytekRtasrLlmAccessKeySecret: localStorage.getItem(STORAGE_KEYS.IFLYTEK_RTASR_LLM_ACCESS_KEY_SECRET) || '',
  // 新增：讯飞极速录音转写大模型
  iflytekOstAppId: localStorage.getItem(STORAGE_KEYS.IFLYTEK_OST_APP_ID) || '',
  iflytekOstApiKey: localStorage.getItem(STORAGE_KEYS.IFLYTEK_OST_API_KEY) || '',
  iflytekOstApiSecret: localStorage.getItem(STORAGE_KEYS.IFLYTEK_OST_API_SECRET) || '',
  // 新增：讯飞中英识别大模型
  iflytekBigModelAppId: localStorage.getItem(STORAGE_KEYS.IFLYTEK_BIG_MODEL_APP_ID) || '',
  iflytekBigModelApiKey: localStorage.getItem(STORAGE_KEYS.IFLYTEK_BIG_MODEL_API_KEY) || '',
  iflytekBigModelApiSecret: localStorage.getItem(STORAGE_KEYS.IFLYTEK_BIG_MODEL_API_SECRET) || '',
  // 开发者模式
  developerMode: localStorage.getItem(STORAGE_KEYS.DEVELOPER_MODE) === 'true',
  // AI 调试面板开关（开发者模式下可用）
  aiDebugPanel: localStorage.getItem('app_ai_debug_panel') === 'true',
  // OCR 自动生成卡片开关
  ocrAutoGenerate: localStorage.getItem(STORAGE_KEYS.OCR_AUTO_GENERATE) !== 'false',
  // 图像识别引擎配置
  ocrEngine: localStorage.getItem(STORAGE_KEYS.OCR_ENGINE) || 'ai-model',
  paddleocrServerUrl: localStorage.getItem(STORAGE_KEYS.PADDLEOCR_SERVER_URL) || '',
  paddleocrApiToken: localStorage.getItem(STORAGE_KEYS.PADDLEOCR_API_TOKEN) || '',
  paddleocrLanguage: localStorage.getItem(STORAGE_KEYS.PADDLEOCR_LANGUAGE) || 'ch',
  baiduOcrApiKey: localStorage.getItem(STORAGE_KEYS.BAIDU_OCR_API_KEY) || '',
  baiduOcrSecretKey: localStorage.getItem(STORAGE_KEYS.BAIDU_OCR_SECRET_KEY) || '',
  tesseractLanguage: localStorage.getItem(STORAGE_KEYS.TESSERACT_LANGUAGE) || 'chi_sim+eng',
  // 新增：火山引擎豆包大模型配置
  volcanoApiKey: localStorage.getItem(STORAGE_KEYS.VOLCANO_ENGINE_API_KEY) || '',
  volcanoModel: localStorage.getItem(STORAGE_KEYS.VOLCANO_ENGINE_MODEL) || 'doubao-pro-32k',
  // 新增：阿里云千问大模型配置
  dashscopeApiKey: localStorage.getItem(STORAGE_KEYS.DASHSCOPE_API_KEY) || '',
  dashscopeModel: localStorage.getItem(STORAGE_KEYS.DASHSCOPE_MODEL) || 'qwen3.5-plus-2026-04-20',
  // PC 引擎代理配置
  pcEngineServer: localStorage.getItem(STORAGE_KEYS.PC_ENGINE_SERVER) || '',
  pcEnginePort: localStorage.getItem(STORAGE_KEYS.PC_ENGINE_PORT) || '19000',
  pcEngineToken: localStorage.getItem(STORAGE_KEYS.PC_ENGINE_TOKEN) || '',
  pcEngineParseEngine: localStorage.getItem(STORAGE_KEYS.PC_ENGINE_PARSE_ENGINE) || 'mineru',
  pcEngineAsr: localStorage.getItem(STORAGE_KEYS.PC_ENGINE_ASR) || 'voice',
  // PC 引擎连接状态（运行时，不持久化）
  pcEngineConnected: false,
  // 通用AI视觉独立配置
  visionAiUrl: localStorage.getItem(STORAGE_KEYS.VISION_AI_URL) || '',
  visionAiKey: localStorage.getItem(STORAGE_KEYS.VISION_AI_KEY) || '',
  visionAiModel: localStorage.getItem(STORAGE_KEYS.VISION_AI_MODEL) || '',
  // 登录相关
  isLoggedIn: false,
  user: null,
  // 用户资料
  userProfile: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload }
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] }
    case 'UPDATE_CATEGORY':
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.id === action.payload.id ? { ...c, name: action.payload.name } : c
        ),
      }
    case 'REMOVE_CATEGORY':
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.payload),
      }
    case 'SET_API_KEY':
      localStorage.setItem(STORAGE_KEYS.API_KEY, action.payload)
      return { ...state, apiKey: action.payload }
    case 'SET_MODEL':
      localStorage.setItem(STORAGE_KEYS.MODEL, action.payload)
      return { ...state, model: action.payload }
    case 'SET_FONT_SIZE':
      localStorage.setItem(STORAGE_KEYS.FONT_SIZE, action.payload)
      return { ...state, fontSize: action.payload }
    case 'SET_EYE_PROTECTION':
      localStorage.setItem(STORAGE_KEYS.EYE_PROTECTION, action.payload ? 'true' : 'false')
      return { ...state, eyeProtection: action.payload }
    case 'SET_THEME':
      localStorage.setItem(STORAGE_KEYS.THEME, action.payload)
      return { ...state, theme: action.payload }
    case 'SET_BG_PRESET':
      localStorage.setItem(STORAGE_KEYS.BG_PRESET, action.payload)
      return { ...state, bgPreset: action.payload }
    case 'SET_BG_IMAGE':
      localStorage.setItem(STORAGE_KEYS.BG_IMAGE, action.payload)
      return { ...state, bgImage: action.payload }
    case 'SET_BG_IMAGE_MODE':
      localStorage.setItem(STORAGE_KEYS.BG_IMAGE_MODE, action.payload)
      return { ...state, bgImageMode: action.payload }
    case 'SET_BG_BLUR':
      localStorage.setItem(STORAGE_KEYS.BG_BLUR, String(action.payload))
      return { ...state, bgBlur: action.payload }
    case 'SET_BG_MASK_OPACITY':
      localStorage.setItem(STORAGE_KEYS.BG_MASK_OPACITY, String(action.payload))
      return { ...state, bgMaskOpacity: action.payload }
    case 'SET_CARD_RADIUS':
      localStorage.setItem(STORAGE_KEYS.CARD_RADIUS, String(action.payload))
      return { ...state, cardRadius: action.payload }
    case 'SET_CARD_SHADOW':
      localStorage.setItem(STORAGE_KEYS.CARD_SHADOW, action.payload)
      return { ...state, cardShadow: action.payload }
    case 'SET_CARD_BORDER':
      localStorage.setItem(STORAGE_KEYS.CARD_BORDER, action.payload)
      return { ...state, cardBorder: action.payload }
    case 'SET_CARD_OPACITY':
      localStorage.setItem(STORAGE_KEYS.CARD_OPACITY, String(action.payload))
      return { ...state, cardOpacity: action.payload }
    case 'SET_BTN_PRIMARY_OPACITY':
      localStorage.setItem(STORAGE_KEYS.BTN_PRIMARY_OPACITY, String(action.payload))
      return { ...state, btnPrimaryOpacity: action.payload }
    case 'SET_BTN_SECONDARY_OPACITY':
      localStorage.setItem(STORAGE_KEYS.BTN_SECONDARY_OPACITY, String(action.payload))
      return { ...state, btnSecondaryOpacity: action.payload }
    case 'SET_STYLE_SCHEMES':
      localStorage.setItem(STORAGE_KEYS.STYLE_SCHEMES, JSON.stringify(action.payload))
      return { ...state, styleSchemes: action.payload }
    case 'SET_ACTIVE_STYLE_SCHEME':
      localStorage.setItem(STORAGE_KEYS.ACTIVE_STYLE_SCHEME, action.payload)
      return { ...state, activeStyleScheme: action.payload }
    case 'SET_DEVELOPER_MODE':
      localStorage.setItem(STORAGE_KEYS.DEVELOPER_MODE, action.payload ? 'true' : 'false')
      return { ...state, developerMode: action.payload }
    case 'SET_AI_DEBUG_PANEL':
      localStorage.setItem('app_ai_debug_panel', action.payload ? 'true' : 'false')
      return { ...state, aiDebugPanel: action.payload }
    case 'SET_OCR_AUTO_GENERATE':
      localStorage.setItem(STORAGE_KEYS.OCR_AUTO_GENERATE, action.payload ? 'true' : 'false')
      return { ...state, ocrAutoGenerate: action.payload }
    case 'SET_OCR_ENGINE':
      localStorage.setItem(STORAGE_KEYS.OCR_ENGINE, action.payload)
      return { ...state, ocrEngine: action.payload }
    case 'SET_PADDLEOCR_SERVER_URL':
      localStorage.setItem(STORAGE_KEYS.PADDLEOCR_SERVER_URL, action.payload)
      return { ...state, paddleocrServerUrl: action.payload }
    case 'SET_PADDLEOCR_API_TOKEN':
      localStorage.setItem(STORAGE_KEYS.PADDLEOCR_API_TOKEN, action.payload)
      return { ...state, paddleocrApiToken: action.payload }
    case 'SET_PADDLEOCR_LANGUAGE':
      localStorage.setItem(STORAGE_KEYS.PADDLEOCR_LANGUAGE, action.payload)
      return { ...state, paddleocrLanguage: action.payload }
    case 'SET_BAIDU_OCR_API_KEY':
      localStorage.setItem(STORAGE_KEYS.BAIDU_OCR_API_KEY, action.payload)
      return { ...state, baiduOcrApiKey: action.payload }
    case 'SET_BAIDU_OCR_SECRET_KEY':
      localStorage.setItem(STORAGE_KEYS.BAIDU_OCR_SECRET_KEY, action.payload)
      return { ...state, baiduOcrSecretKey: action.payload }
    case 'SET_TESSERACT_LANGUAGE':
      localStorage.setItem(STORAGE_KEYS.TESSERACT_LANGUAGE, action.payload)
      return { ...state, tesseractLanguage: action.payload }
    case 'SET_SPEECH_MODE':
      localStorage.setItem(STORAGE_KEYS.SPEECH_MODE, action.payload)
      return { ...state, speechMode: action.payload }
    case 'SET_SPEECH_API_URL':
      localStorage.setItem(STORAGE_KEYS.SPEECH_API_URL, action.payload)
      return { ...state, speechApiUrl: action.payload }
    case 'SET_SPEECH_API_KEY':
      localStorage.setItem(STORAGE_KEYS.SPEECH_API_KEY, action.payload)
      return { ...state, speechApiKey: action.payload }
    case 'SET_IFLYTEK_APP_ID':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_APP_ID, action.payload)
      return { ...state, iflytekAppId: action.payload }
    case 'SET_IFLYTEK_API_SECRET':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_API_SECRET, action.payload)
      return { ...state, iflytekApiSecret: action.payload }
    case 'SET_INPUT_BAR_MODE':
      localStorage.setItem(STORAGE_KEYS.INPUT_BAR_MODE, action.payload)
      return { ...state, inputBarMode: action.payload }
    case 'SET_AI_SERVICE_MODE':
      localStorage.setItem(STORAGE_KEYS.AI_SERVICE_MODE, action.payload)
      return { ...state, aiServiceMode: action.payload }
    case 'SET_IFLYTEK_SPARK_MODEL':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_SPARK_MODEL, action.payload)
      return { ...state, iflytekSparkModel: action.payload }
    // 新增：文字识别服务 - 讯飞星火独立配置（APIKey + APISecret）
    case 'SET_IFLYTEK_SPARK_API_KEY':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_SPARK_API_KEY, action.payload)
      return { ...state, iflytekSparkApiKey: action.payload }
    case 'SET_IFLYTEK_SPARK_API_SECRET':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_SPARK_API_SECRET, action.payload)
      return { ...state, iflytekSparkApiSecret: action.payload }
    // 新增：语音识别服务 - OpenAI 兼容 Whisper API 独立配置
    case 'SET_WHISPER_API_URL':
      localStorage.setItem(STORAGE_KEYS.WHISPER_API_URL, action.payload)
      return { ...state, whisperApiUrl: action.payload }
    case 'SET_WHISPER_API_KEY':
      localStorage.setItem(STORAGE_KEYS.WHISPER_API_KEY, action.payload)
      return { ...state, whisperApiKey: action.payload }
    // 新增：语音识别服务 - 讯飞语音听写(IAT)独立配置
    case 'SET_IFLYTEK_IAT_APP_ID':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_IAT_APP_ID, action.payload)
      return { ...state, iflytekIatAppId: action.payload }
    case 'SET_IFLYTEK_IAT_API_KEY':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_IAT_API_KEY, action.payload)
      return { ...state, iflytekIatApiKey: action.payload }
    case 'SET_IFLYTEK_IAT_API_SECRET':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_IAT_API_SECRET, action.payload)
      return { ...state, iflytekIatApiSecret: action.payload }
    // 新增：讯飞实时语音转写标准版
    case 'SET_IFLYTEK_RTASR_STD_APP_ID':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_RTASR_STD_APP_ID, action.payload)
      return { ...state, iflytekRtasrStdAppId: action.payload }
    case 'SET_IFLYTEK_RTASR_STD_API_KEY':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_RTASR_STD_API_KEY, action.payload)
      return { ...state, iflytekRtasrStdApiKey: action.payload }
    // 新增：讯飞实时语音转写大模型
    case 'SET_IFLYTEK_RTASR_LLM_APP_ID':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_RTASR_LLM_APP_ID, action.payload)
      return { ...state, iflytekRtasrLlmAppId: action.payload }
    case 'SET_IFLYTEK_RTASR_LLM_ACCESS_KEY_ID':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_RTASR_LLM_ACCESS_KEY_ID, action.payload)
      return { ...state, iflytekRtasrLlmAccessKeyId: action.payload }
    case 'SET_IFLYTEK_RTASR_LLM_ACCESS_KEY_SECRET':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_RTASR_LLM_ACCESS_KEY_SECRET, action.payload)
      return { ...state, iflytekRtasrLlmAccessKeySecret: action.payload }
    // 新增：讯飞极速录音转写大模型
    case 'SET_IFLYTEK_OST_APP_ID':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_OST_APP_ID, action.payload)
      return { ...state, iflytekOstAppId: action.payload }
    case 'SET_IFLYTEK_OST_API_KEY':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_OST_API_KEY, action.payload)
      return { ...state, iflytekOstApiKey: action.payload }
    case 'SET_IFLYTEK_OST_API_SECRET':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_OST_API_SECRET, action.payload)
      return { ...state, iflytekOstApiSecret: action.payload }
    // 新增：讯飞中英识别大模型
    case 'SET_IFLYTEK_BIG_MODEL_APP_ID':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_BIG_MODEL_APP_ID, action.payload)
      return { ...state, iflytekBigModelAppId: action.payload }
    case 'SET_IFLYTEK_BIG_MODEL_API_KEY':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_BIG_MODEL_API_KEY, action.payload)
      return { ...state, iflytekBigModelApiKey: action.payload }
    case 'SET_IFLYTEK_BIG_MODEL_API_SECRET':
      localStorage.setItem(STORAGE_KEYS.IFLYTEK_BIG_MODEL_API_SECRET, action.payload)
      return { ...state, iflytekBigModelApiSecret: action.payload }
    // 新增：火山引擎豆包大模型配置
    case 'SET_VOLCANO_API_KEY':
      localStorage.setItem(STORAGE_KEYS.VOLCANO_ENGINE_API_KEY, action.payload)
      return { ...state, volcanoApiKey: action.payload }
    case 'SET_VOLCANO_MODEL':
      localStorage.setItem(STORAGE_KEYS.VOLCANO_ENGINE_MODEL, action.payload)
      return { ...state, volcanoModel: action.payload }
    // 新增：阿里云千问大模型配置
    case 'SET_DASHSCOPE_API_KEY':
      localStorage.setItem(STORAGE_KEYS.DASHSCOPE_API_KEY, action.payload)
      return { ...state, dashscopeApiKey: action.payload }
    case 'SET_DASHSCOPE_MODEL':
      localStorage.setItem(STORAGE_KEYS.DASHSCOPE_MODEL, action.payload)
      return { ...state, dashscopeModel: action.payload }
    // PC 引擎代理配置
    case 'SET_PC_ENGINE_SERVER':
      localStorage.setItem(STORAGE_KEYS.PC_ENGINE_SERVER, action.payload)
      return { ...state, pcEngineServer: action.payload }
    case 'SET_PC_ENGINE_PORT':
      localStorage.setItem(STORAGE_KEYS.PC_ENGINE_PORT, action.payload)
      return { ...state, pcEnginePort: action.payload }
    case 'SET_PC_ENGINE_TOKEN':
      localStorage.setItem(STORAGE_KEYS.PC_ENGINE_TOKEN, action.payload)
      return { ...state, pcEngineToken: action.payload }
    case 'SET_PC_ENGINE_PARSE_ENGINE':
      localStorage.setItem(STORAGE_KEYS.PC_ENGINE_PARSE_ENGINE, action.payload)
      return { ...state, pcEngineParseEngine: action.payload }
    case 'SET_PC_ENGINE_ASR':
      localStorage.setItem(STORAGE_KEYS.PC_ENGINE_ASR, action.payload)
      return { ...state, pcEngineAsr: action.payload }
    case 'SET_PC_ENGINE_CONNECTED':
      return { ...state, pcEngineConnected: action.payload }
    case 'SET_VISION_AI_URL':
      localStorage.setItem(STORAGE_KEYS.VISION_AI_URL, action.payload)
      return { ...state, visionAiUrl: action.payload }
    case 'SET_VISION_AI_KEY':
      localStorage.setItem(STORAGE_KEYS.VISION_AI_KEY, action.payload)
      return { ...state, visionAiKey: action.payload }
    case 'SET_VISION_AI_MODEL':
      localStorage.setItem(STORAGE_KEYS.VISION_AI_MODEL, action.payload)
      return { ...state, visionAiModel: action.payload }
    case 'SHOW_TOAST':
      return { ...state, toast: action.payload }
    case 'HIDE_TOAST':
      return { ...state, toast: null }
    case 'SET_LOGIN':
      return {
        ...state,
        isLoggedIn: action.payload.isLoggedIn,
        user: action.payload.user,
      }
    case 'LOGOUT':
      return { ...state, isLoggedIn: false, user: null, userProfile: null }
    case 'SET_USER_PROFILE':
      return { ...state, userProfile: action.payload }
    case 'SET_CURRENT_TARGET':
      return { ...state, currentTarget: action.payload }
    case 'SET_DRAFT_COUNT':
      return { ...state, draftCount: action.payload }
    case 'SET_SYSTEM_FLOATING_ENABLED':
      return { ...state, systemFloatingEnabled: action.payload }
    case 'SET_VOSK_READY':
      return { ...state, voskReady: action.payload }
    case 'SET_VOSK_MODEL_STATUS':
      return { ...state, voskModelStatus: action.payload }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const loadCategories = useCallback(async () => {
    // 确保本地 IndexedDB 已经完成"主键为 id"的迁移（避开 Dexie "changing primary key"）
    if (typeof db.ensureDbReady === 'function') {
      try { await db.ensureDbReady() } catch (e) { console.warn('[AppContext] ensureDbReady:', e) }
    }
    // 修复历史云端下载/单表下载留下的孤立卡片，避免账号页有总数但记录页/背诵页按分类读取为空。
    if (typeof db.repairCardRelationsAfterImport === 'function') {
      try { await db.repairCardRelationsAfterImport() } catch (e) { console.warn('[AppContext] repairCardRelationsAfterImport:', e) }
    }
    // 清理重复的「使用指南」分类（新设备种子数据 + 云端同步冲突）
    if (typeof db.deduplicateUsageGuide === 'function') {
      try { await db.deduplicateUsageGuide() } catch (e) { console.warn('[AppContext] deduplicateUsageGuide:', e) }
    }
    const list = await db.getCategories()
    dispatch({ type: 'SET_CATEGORIES', payload: list })
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // —— 从云端拉取设置并应用到 localStorage + state ——
  // 云端优先，本地值作为降级
  const cloudSettingsLoaded = useRef(false)

  const applyCloudSettings = useCallback(async () => {
    try {
      const cloudSettings = await fetchCloudSettings(supabase)
      if (!cloudSettings) return

      const extracted = extractSettingsForApp(cloudSettings)
      const entries = Object.entries(extracted)
      if (entries.length === 0) return

      for (const [key, value] of entries) {
        // 写入 localStorage（与 reducer 一致的 key 映射）
        const storageKeyMap = {
          apiKey: STORAGE_KEYS.API_KEY,
          model: STORAGE_KEYS.MODEL,
          fontSize: STORAGE_KEYS.FONT_SIZE,
          eyeProtection: STORAGE_KEYS.EYE_PROTECTION,
          theme: STORAGE_KEYS.THEME,
          speechMode: STORAGE_KEYS.SPEECH_MODE,
          speechApiUrl: STORAGE_KEYS.SPEECH_API_URL,
          speechApiKey: STORAGE_KEYS.SPEECH_API_KEY,
          iflytekAppId: STORAGE_KEYS.IFLYTEK_APP_ID,
          iflytekApiSecret: STORAGE_KEYS.IFLYTEK_API_SECRET,
          inputBarMode: STORAGE_KEYS.INPUT_BAR_MODE,
          aiServiceMode: STORAGE_KEYS.AI_SERVICE_MODE,
          iflytekSparkModel: STORAGE_KEYS.IFLYTEK_SPARK_MODEL,
          iflytekSparkApiKey: STORAGE_KEYS.IFLYTEK_SPARK_API_KEY,
          iflytekSparkApiSecret: STORAGE_KEYS.IFLYTEK_SPARK_API_SECRET,
          whisperApiUrl: STORAGE_KEYS.WHISPER_API_URL,
          whisperApiKey: STORAGE_KEYS.WHISPER_API_KEY,
          iflytekIatAppId: STORAGE_KEYS.IFLYTEK_IAT_APP_ID,
          iflytekIatApiKey: STORAGE_KEYS.IFLYTEK_IAT_API_KEY,
          iflytekIatApiSecret: STORAGE_KEYS.IFLYTEK_IAT_API_SECRET,
          iflytekRtasrStdAppId: STORAGE_KEYS.IFLYTEK_RTASR_STD_APP_ID,
          iflytekRtasrStdApiKey: STORAGE_KEYS.IFLYTEK_RTASR_STD_API_KEY,
          iflytekRtasrLlmAppId: STORAGE_KEYS.IFLYTEK_RTASR_LLM_APP_ID,
          iflytekRtasrLlmAccessKeyId: STORAGE_KEYS.IFLYTEK_RTASR_LLM_ACCESS_KEY_ID,
          iflytekRtasrLlmAccessKeySecret: STORAGE_KEYS.IFLYTEK_RTASR_LLM_ACCESS_KEY_SECRET,
          iflytekOstAppId: STORAGE_KEYS.IFLYTEK_OST_APP_ID,
          iflytekOstApiKey: STORAGE_KEYS.IFLYTEK_OST_API_KEY,
          iflytekOstApiSecret: STORAGE_KEYS.IFLYTEK_OST_API_SECRET,
          iflytekBigModelAppId: STORAGE_KEYS.IFLYTEK_BIG_MODEL_APP_ID,
          iflytekBigModelApiKey: STORAGE_KEYS.IFLYTEK_BIG_MODEL_API_KEY,
          iflytekBigModelApiSecret: STORAGE_KEYS.IFLYTEK_BIG_MODEL_API_SECRET,
          volcanoApiKey: STORAGE_KEYS.VOLCANO_ENGINE_API_KEY,
          volcanoModel: STORAGE_KEYS.VOLCANO_ENGINE_MODEL,
          dashscopeApiKey: STORAGE_KEYS.DASHSCOPE_API_KEY,
          dashscopeModel: STORAGE_KEYS.DASHSCOPE_MODEL,
          ocrAutoGenerate: STORAGE_KEYS.OCR_AUTO_GENERATE,
          ocrEngine: STORAGE_KEYS.OCR_ENGINE,
          paddleocrServerUrl: STORAGE_KEYS.PADDLEOCR_SERVER_URL,
          paddleocrLanguage: STORAGE_KEYS.PADDLEOCR_LANGUAGE,
        }
        const storageKey = storageKeyMap[key]
        if (storageKey) {
          localStorage.setItem(storageKey, String(value))
        } else if (key === 'pcEngineConfig' && typeof value === 'object') {
          localStorage.setItem('pc_engine_config', JSON.stringify(value))
        }

        // 写入 state（dispatch 对应的 action）
        const actionTypeMap = {
          apiKey: 'SET_API_KEY',
          model: 'SET_MODEL',
          fontSize: 'SET_FONT_SIZE',
          eyeProtection: 'SET_EYE_PROTECTION',
          theme: 'SET_THEME',
          speechMode: 'SET_SPEECH_MODE',
          speechApiUrl: 'SET_SPEECH_API_URL',
          speechApiKey: 'SET_SPEECH_API_KEY',
          iflytekAppId: 'SET_IFLYTEK_APP_ID',
          iflytekApiSecret: 'SET_IFLYTEK_API_SECRET',
          inputBarMode: 'SET_INPUT_BAR_MODE',
          aiServiceMode: 'SET_AI_SERVICE_MODE',
          iflytekSparkModel: 'SET_IFLYTEK_SPARK_MODEL',
          iflytekSparkApiKey: 'SET_IFLYTEK_SPARK_API_KEY',
          iflytekSparkApiSecret: 'SET_IFLYTEK_SPARK_API_SECRET',
          whisperApiUrl: 'SET_WHISPER_API_URL',
          whisperApiKey: 'SET_WHISPER_API_KEY',
          iflytekIatAppId: 'SET_IFLYTEK_IAT_APP_ID',
          iflytekIatApiKey: 'SET_IFLYTEK_IAT_API_KEY',
          iflytekIatApiSecret: 'SET_IFLYTEK_IAT_API_SECRET',
          iflytekRtasrStdAppId: 'SET_IFLYTEK_RTASR_STD_APP_ID',
          iflytekRtasrStdApiKey: 'SET_IFLYTEK_RTASR_STD_API_KEY',
          iflytekRtasrLlmAppId: 'SET_IFLYTEK_RTASR_LLM_APP_ID',
          iflytekRtasrLlmAccessKeyId: 'SET_IFLYTEK_RTASR_LLM_ACCESS_KEY_ID',
          iflytekRtasrLlmAccessKeySecret: 'SET_IFLYTEK_RTASR_LLM_ACCESS_KEY_SECRET',
          iflytekOstAppId: 'SET_IFLYTEK_OST_APP_ID',
          iflytekOstApiKey: 'SET_IFLYTEK_OST_API_KEY',
          iflytekOstApiSecret: 'SET_IFLYTEK_OST_API_SECRET',
          iflytekBigModelAppId: 'SET_IFLYTEK_BIG_MODEL_APP_ID',
          iflytekBigModelApiKey: 'SET_IFLYTEK_BIG_MODEL_API_KEY',
          iflytekBigModelApiSecret: 'SET_IFLYTEK_BIG_MODEL_API_SECRET',
          volcanoApiKey: 'SET_VOLCANO_API_KEY',
          volcanoModel: 'SET_VOLCANO_MODEL',
          dashscopeApiKey: 'SET_DASHSCOPE_API_KEY',
          dashscopeModel: 'SET_DASHSCOPE_MODEL',
          ocrAutoGenerate: 'SET_OCR_AUTO_GENERATE',
          ocrEngine: 'SET_OCR_ENGINE',
          paddleocrServerUrl: 'SET_PADDLEOCR_SERVER_URL',
          paddleocrLanguage: 'SET_PADDLEOCR_LANGUAGE',
        }
        const actionType = actionTypeMap[key]
        if (actionType) {
          dispatch({ type: actionType, payload: value })
        }
      }

      cloudSettingsLoaded.current = true
    } catch (e) {
      console.warn('[AppContext] 云端设置加载失败，使用本地设置:', e.message)
    }
  }, [])

  // 应用字体大小到 <html> 元素
  useEffect(() => {
    if (state.fontSize === 'normal') {
      document.documentElement.removeAttribute('data-font-size')
    } else {
      document.documentElement.setAttribute('data-font-size', state.fontSize)
    }
  }, [state.fontSize])

  // 应用护眼模式到 <html> 元素
  useEffect(() => {
    if (state.eyeProtection) {
      document.documentElement.setAttribute('data-eye-protection', 'true')
    } else {
      document.documentElement.removeAttribute('data-eye-protection')
    }
  }, [state.eyeProtection])

  // 应用主题到 <html> 元素：'light' | 'dark' | 'auto'
  // auto 时移除属性，交给 CSS @media (prefers-color-scheme: dark) 自动判断
  useEffect(() => {
    const root = document.documentElement
    if (state.theme === 'light' || state.theme === 'dark') {
      root.setAttribute('data-theme', state.theme)
    } else {
      // auto：移除手动标记，跟随系统
      root.removeAttribute('data-theme')
    }
  }, [state.theme])

  // 同步背景风格相关 CSS 变量到 document.documentElement.style
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--bg-preset', state.bgPreset)
    root.style.setProperty('--bg-image', state.bgImage ? `url(${state.bgImage})` : 'none')
    root.style.setProperty('--bg-image-mode', state.bgImageMode)
    root.style.setProperty('--bg-blur', `${state.bgBlur}px`)
    root.style.setProperty('--bg-mask-opacity', state.bgMaskOpacity / 100)
    root.style.setProperty('--card-radius', `${state.cardRadius}px`)
    root.style.setProperty('--card-shadow-level', state.cardShadow)
    root.style.setProperty('--card-border-level', state.cardBorder)
    root.style.setProperty('--card-opacity', state.cardOpacity / 100)
    root.style.setProperty('--btn-primary-opacity', state.btnPrimaryOpacity / 100)
    root.style.setProperty('--btn-secondary-opacity', state.btnSecondaryOpacity / 100)
    root.setAttribute('data-bg-preset', state.bgPreset)
    root.setAttribute('data-bg-image-mode', state.bgImageMode)
    root.setAttribute('data-card-shadow', state.cardShadow)
    root.setAttribute('data-card-border', state.cardBorder)
    root.setAttribute('data-has-bg-image', state.bgImage ? 'true' : 'false')
  }, [
    state.bgPreset,
    state.bgImage,
    state.bgImageMode,
    state.bgBlur,
    state.bgMaskOpacity,
    state.cardRadius,
    state.cardShadow,
    state.cardBorder,
    state.cardOpacity,
    state.btnPrimaryOpacity,
    state.btnSecondaryOpacity,
  ])

  // —— 当同步设置变更时，自动保存到云端 ——
  const isCloudUser = state.isLoggedIn && state.user && !state.user.local
  const prevSyncValues = useRef(null)

  useEffect(() => {
    if (!isCloudUser || !cloudSettingsLoaded.current) return

    const currentValues = {
      apiKey: state.apiKey,
      model: state.model,
      fontSize: state.fontSize,
      eyeProtection: state.eyeProtection,
      speechMode: state.speechMode,
      speechApiUrl: state.speechApiUrl,
      speechApiKey: state.speechApiKey,
      inputBarMode: state.inputBarMode,
      iflytekAppId: state.iflytekAppId,
      iflytekApiSecret: state.iflytekApiSecret,
      aiServiceMode: state.aiServiceMode,
      iflytekSparkModel: state.iflytekSparkModel,
      iflytekSparkApiKey: state.iflytekSparkApiKey,
      iflytekSparkApiSecret: state.iflytekSparkApiSecret,
      whisperApiUrl: state.whisperApiUrl,
      whisperApiKey: state.whisperApiKey,
      iflytekIatAppId: state.iflytekIatAppId,
      iflytekIatApiKey: state.iflytekIatApiKey,
      iflytekIatApiSecret: state.iflytekIatApiSecret,
      iflytekRtasrStdAppId: state.iflytekRtasrStdAppId,
      iflytekRtasrStdApiKey: state.iflytekRtasrStdApiKey,
      iflytekRtasrLlmAppId: state.iflytekRtasrLlmAppId,
      iflytekRtasrLlmAccessKeyId: state.iflytekRtasrLlmAccessKeyId,
      iflytekRtasrLlmAccessKeySecret: state.iflytekRtasrLlmAccessKeySecret,
      iflytekOstAppId: state.iflytekOstAppId,
      iflytekOstApiKey: state.iflytekOstApiKey,
      iflytekOstApiSecret: state.iflytekOstApiSecret,
      iflytekBigModelAppId: state.iflytekBigModelAppId,
      iflytekBigModelApiKey: state.iflytekBigModelApiKey,
      iflytekBigModelApiSecret: state.iflytekBigModelApiSecret,
      volcanoApiKey: state.volcanoApiKey,
      volcanoModel: state.volcanoModel,
      dashscopeApiKey: state.dashscopeApiKey,
      dashscopeModel: state.dashscopeModel,
    }

    // 首次记录，不触发保存
    if (prevSyncValues.current === null) {
      prevSyncValues.current = currentValues
      return
    }

    // 检查是否有变化
    const hasChanges = Object.keys(currentValues).some(
      (k) => currentValues[k] !== prevSyncValues.current[k]
    )
    if (!hasChanges) return

    prevSyncValues.current = currentValues

    // 延迟保存，避免连续操作时频繁请求
    const timer = setTimeout(() => {
      saveCloudSettings(supabase, currentValues)
    }, 800)

    return () => clearTimeout(timer)
  }, [isCloudUser, state.apiKey, state.model, state.fontSize, state.eyeProtection, state.speechMode, state.speechApiUrl, state.speechApiKey, state.inputBarMode, state.iflytekAppId, state.iflytekApiSecret, state.aiServiceMode, state.iflytekSparkModel])

  // 登录状态初始化 + 监听（同时兼容本地/云端两种模式）
  useEffect(() => {
    let unsubscribe = null
    let cancelled = false

    async function initAuth() {
      const forcedLocal =
        localStorage.getItem(STORAGE_KEYS.FORCE_LOCAL_MODE) === '1'

      // —— 1) 用户明确选择了本地模式 => 只读取本地登录信息 ——
      if (forcedLocal) {
        const localLoggedIn =
          localStorage.getItem(LOCAL_LOGGED_IN_KEY) === 'true'
        const localUsername = localStorage.getItem(LOCAL_USERNAME_KEY) || ''
        if (!cancelled && localLoggedIn && localUsername) {
          dispatch({
            type: 'SET_LOGIN',
            payload: {
              isLoggedIn: true,
              user: { email: localUsername, local: true },
            },
          })
        }
        return
      }

      // —— 2) 优先尝试 Supabase 云端 session ——
      if (isSupabaseConfigured()) {
        try {
          const user = await getCurrentUser()
          if (!cancelled && user) {
            dispatch({
              type: 'SET_LOGIN',
              payload: { isLoggedIn: true, user },
            })
            // 云端登录后拉取设置
            await applyCloudSettings()
          }
        } catch (e) {
          // 忽略初始化错误，让用户手动登录
          console.warn('[AppContext] 获取用户信息失败:', e.message)
        }
        // 监听登录状态变化
        unsubscribe = onAuthChange(async (user) => {
          if (user) {
            dispatch({
              type: 'SET_LOGIN',
              payload: { isLoggedIn: true, user },
            })
            // 登录状态变化时也拉取云端设置
            await applyCloudSettings()
          } else {
            cloudSettingsLoaded.current = false
            prevSyncValues.current = null
            dispatch({ type: 'LOGOUT' })
          }
        })
        return
      }

      // —— 3) 既未强制本地、也未配置 Supabase => 仅本地模式兜底 ——
      const localLoggedIn =
        localStorage.getItem(LOCAL_LOGGED_IN_KEY) === 'true'
      const localUsername = localStorage.getItem(LOCAL_USERNAME_KEY) || ''
      if (!cancelled && localLoggedIn && localUsername) {
        dispatch({
          type: 'SET_LOGIN',
          payload: {
            isLoggedIn: true,
            user: { email: localUsername, local: true },
          },
        })
      }
    }

    initAuth()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [])

  // 监听种子数据创建后的分类更新事件
  useEffect(() => {
    function handleCategoriesUpdated(e) {
      if (e.detail && Array.isArray(e.detail)) {
        dispatch({ type: 'SET_CATEGORIES', payload: e.detail })
      }
    }
    window.addEventListener('categories-updated', handleCategoriesUpdated)
    return () => window.removeEventListener('categories-updated', handleCategoriesUpdated)
  }, [])

  const showToast = useCallback((message, type = 'success', actions, options = {}) => {
    const payload = { message, type }
    if (actions && actions.length) payload.actions = actions
    dispatch({ type: 'SHOW_TOAST', payload })
    const duration = options?.duration ?? (actions && actions.length ? 6000 : 2500)
    setTimeout(() => {
      dispatch({ type: 'HIDE_TOAST' })
    }, duration)
  }, [])

  const addCategory = useCallback(
    async (name) => {
      const category = await db.addCategory(name)
      dispatch({ type: 'ADD_CATEGORY', payload: category })
      showToast('分类创建成功')
      return category
    },
    [showToast]
  )

  const renameCategory = useCallback(
    async (id, name) => {
      await db.updateCategory(id, name)
      dispatch({ type: 'UPDATE_CATEGORY', payload: { id, name } })
      showToast('分类已重命名')
    },
    [showToast]
  )

  const removeCategory = useCallback(
    async (id) => {
      await db.deleteCategory(id)
      dispatch({ type: 'REMOVE_CATEGORY', payload: id })
      showToast('分类已删除')
    },
    [showToast]
  )

  const setApiKey = useCallback((key) => {
    dispatch({ type: 'SET_API_KEY', payload: key })
  }, [])

  const setModel = useCallback((model) => {
    dispatch({ type: 'SET_MODEL', payload: model })
  }, [])

  const setFontSize = useCallback((size) => {
    dispatch({ type: 'SET_FONT_SIZE', payload: size })
  }, [])

  const setEyeProtection = useCallback((enabled) => {
    dispatch({ type: 'SET_EYE_PROTECTION', payload: enabled })
  }, [])

  const setTheme = useCallback((theme) => {
    dispatch({ type: 'SET_THEME', payload: theme })
  }, [])

  const setBgPreset = useCallback((preset) => {
    dispatch({ type: 'SET_BG_PRESET', payload: preset })
  }, [])

  const setBgImage = useCallback((image) => {
    dispatch({ type: 'SET_BG_IMAGE', payload: image })
  }, [])

  const setBgImageMode = useCallback((mode) => {
    dispatch({ type: 'SET_BG_IMAGE_MODE', payload: mode })
  }, [])

  const setBgBlur = useCallback((blur) => {
    dispatch({ type: 'SET_BG_BLUR', payload: blur })
  }, [])

  const setBgMaskOpacity = useCallback((opacity) => {
    dispatch({ type: 'SET_BG_MASK_OPACITY', payload: opacity })
  }, [])

  const setCardRadius = useCallback((radius) => {
    dispatch({ type: 'SET_CARD_RADIUS', payload: radius })
  }, [])

  const setCardShadow = useCallback((shadow) => {
    dispatch({ type: 'SET_CARD_SHADOW', payload: shadow })
  }, [])

  const setCardBorder = useCallback((border) => {
    dispatch({ type: 'SET_CARD_BORDER', payload: border })
  }, [])

  const setCardOpacity = useCallback((opacity) => {
    dispatch({ type: 'SET_CARD_OPACITY', payload: opacity })
  }, [])

  const setBtnPrimaryOpacity = useCallback((opacity) => {
    dispatch({ type: 'SET_BTN_PRIMARY_OPACITY', payload: opacity })
  }, [])

  const setBtnSecondaryOpacity = useCallback((opacity) => {
    dispatch({ type: 'SET_BTN_SECONDARY_OPACITY', payload: opacity })
  }, [])

  const setStyleSchemes = useCallback((schemes) => {
    dispatch({ type: 'SET_STYLE_SCHEMES', payload: schemes })
  }, [])

  const setActiveStyleScheme = useCallback((scheme) => {
    dispatch({ type: 'SET_ACTIVE_STYLE_SCHEME', payload: scheme })
  }, [])

  const saveStyleScheme = useCallback((name) => {
    const newScheme = {
      id: `scheme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: 'custom',
      bgPreset: state.bgPreset,
      bgImage: state.bgImage,
      bgImageMode: state.bgImageMode,
      bgBlur: state.bgBlur,
      bgMaskOpacity: state.bgMaskOpacity,
      cardRadius: state.cardRadius,
      cardShadow: state.cardShadow,
      cardBorder: state.cardBorder,
      cardOpacity: state.cardOpacity,
      btnPrimaryOpacity: state.btnPrimaryOpacity,
      btnSecondaryOpacity: state.btnSecondaryOpacity,
      createdAt: Date.now(),
    }
    const newSchemes = [...state.styleSchemes, newScheme]
    dispatch({ type: 'SET_STYLE_SCHEMES', payload: newSchemes })
    dispatch({ type: 'SET_ACTIVE_STYLE_SCHEME', payload: newScheme.id })
    return newScheme
  }, [state.bgPreset, state.bgImage, state.bgImageMode, state.bgBlur, state.bgMaskOpacity, state.cardRadius, state.cardShadow, state.cardBorder, state.cardOpacity, state.btnPrimaryOpacity, state.btnSecondaryOpacity, state.styleSchemes])

  const renameStyleScheme = useCallback((id, newName) => {
    const newSchemes = state.styleSchemes.map((s) =>
      s.id === id ? { ...s, name: newName } : s
    )
    dispatch({ type: 'SET_STYLE_SCHEMES', payload: newSchemes })
  }, [state.styleSchemes])

  const applyStyleScheme = useCallback((scheme) => {
    if (!scheme) return
    dispatch({ type: 'SET_BG_PRESET', payload: scheme.bgPreset })
    dispatch({ type: 'SET_BG_IMAGE', payload: scheme.bgImage || '' })
    dispatch({ type: 'SET_BG_IMAGE_MODE', payload: scheme.bgImageMode || 'cover' })
    dispatch({ type: 'SET_BG_BLUR', payload: scheme.bgBlur ?? 0 })
    dispatch({ type: 'SET_BG_MASK_OPACITY', payload: scheme.bgMaskOpacity ?? 0 })
    dispatch({ type: 'SET_CARD_RADIUS', payload: scheme.cardRadius ?? 16 })
    dispatch({ type: 'SET_CARD_SHADOW', payload: scheme.cardShadow || 'medium' })
    dispatch({ type: 'SET_CARD_BORDER', payload: scheme.cardBorder || 'none' })
    dispatch({ type: 'SET_CARD_OPACITY', payload: scheme.cardOpacity ?? 100 })
    dispatch({ type: 'SET_BTN_PRIMARY_OPACITY', payload: scheme.btnPrimaryOpacity ?? 100 })
    dispatch({ type: 'SET_BTN_SECONDARY_OPACITY', payload: scheme.btnSecondaryOpacity ?? 100 })
    dispatch({ type: 'SET_ACTIVE_STYLE_SCHEME', payload: scheme.id })
  }, [])

  const deleteStyleScheme = useCallback((id) => {
    const newSchemes = state.styleSchemes.filter((s) => s.id !== id)
    dispatch({ type: 'SET_STYLE_SCHEMES', payload: newSchemes })
    if (state.activeStyleScheme === id) {
      const defaultPreset = PRESET_STYLE_SCHEMES.find((s) => s.id === 'preset-default-light')
      if (defaultPreset) {
        applyStyleScheme(defaultPreset)
      }
    }
  }, [state.styleSchemes, state.activeStyleScheme, applyStyleScheme])

  const getAllStyleSchemes = useCallback(() => {
    return [...PRESET_STYLE_SCHEMES, ...state.styleSchemes]
  }, [state.styleSchemes])

  const resetBackgroundStyle = useCallback(() => {
    dispatch({ type: 'SET_BG_PRESET', payload: 'default-light' })
    dispatch({ type: 'SET_BG_IMAGE', payload: '' })
    dispatch({ type: 'SET_BG_IMAGE_MODE', payload: 'cover' })
    dispatch({ type: 'SET_BG_BLUR', payload: 0 })
    dispatch({ type: 'SET_BG_MASK_OPACITY', payload: 0 })
    dispatch({ type: 'SET_CARD_RADIUS', payload: 16 })
    dispatch({ type: 'SET_CARD_SHADOW', payload: 'medium' })
    dispatch({ type: 'SET_CARD_BORDER', payload: 'none' })
    dispatch({ type: 'SET_CARD_OPACITY', payload: 100 })
    dispatch({ type: 'SET_BTN_PRIMARY_OPACITY', payload: 100 })
    dispatch({ type: 'SET_BTN_SECONDARY_OPACITY', payload: 100 })
    dispatch({ type: 'SET_ACTIVE_STYLE_SCHEME', payload: 'preset-default-light' })
  }, [])

  const setDeveloperMode = useCallback((enabled) => {
    dispatch({ type: 'SET_DEVELOPER_MODE', payload: enabled })
  }, [])

  const setAiDebugPanel = useCallback((enabled) => {
    dispatch({ type: 'SET_AI_DEBUG_PANEL', payload: enabled })
  }, [])

  const setOcrAutoGenerate = useCallback((enabled) => {
    dispatch({ type: 'SET_OCR_AUTO_GENERATE', payload: enabled })
  }, [])

  const setOcrEngine = useCallback((engine) => {
    dispatch({ type: 'SET_OCR_ENGINE', payload: engine })
  }, [])
  const setPaddleocrServerUrl = useCallback((url) => {
    dispatch({ type: 'SET_PADDLEOCR_SERVER_URL', payload: url })
  }, [])
  const setPaddleocrApiToken = useCallback((token) => {
    dispatch({ type: 'SET_PADDLEOCR_API_TOKEN', payload: token })
  }, [])
  const setPaddleocrLanguage = useCallback((lang) => {
    dispatch({ type: 'SET_PADDLEOCR_LANGUAGE', payload: lang })
  }, [])
  const setBaiduOcrApiKey = useCallback((key) => {
    dispatch({ type: 'SET_BAIDU_OCR_API_KEY', payload: key })
  }, [])
  const setBaiduOcrSecretKey = useCallback((key) => {
    dispatch({ type: 'SET_BAIDU_OCR_SECRET_KEY', payload: key })
  }, [])
  const setTesseractLanguage = useCallback((lang) => {
    dispatch({ type: 'SET_TESSERACT_LANGUAGE', payload: lang })
  }, [])

  const setSpeechMode = useCallback((mode) => {
    dispatch({ type: 'SET_SPEECH_MODE', payload: mode })
  }, [])

  const setSpeechApiUrl = useCallback((url) => {
    dispatch({ type: 'SET_SPEECH_API_URL', payload: url })
  }, [])

  const setSpeechApiKey = useCallback((key) => {
    dispatch({ type: 'SET_SPEECH_API_KEY', payload: key })
  }, [])

  const setIflytekAppId = useCallback((appId) => {
    dispatch({ type: 'SET_IFLYTEK_APP_ID', payload: appId })
  }, [])

  const setIflytekApiSecret = useCallback((secret) => {
    dispatch({ type: 'SET_IFLYTEK_API_SECRET', payload: secret })
  }, [])

  const setInputBarMode = useCallback((mode) => {
    dispatch({ type: 'SET_INPUT_BAR_MODE', payload: mode })
  }, [])

  const setCurrentTarget = useCallback((target) => {
    dispatch({ type: 'SET_CURRENT_TARGET', payload: target })
    if (target) {
      localStorage.setItem('app_current_target', JSON.stringify(target))
      // 同时追加到最近使用列表（最多保留3个，去重）
      try {
        const recentRaw = localStorage.getItem('app_recent_targets')
        let recent = recentRaw ? JSON.parse(recentRaw) : []
        recent = recent.filter(t => !(t.categoryId === target.categoryId && t.chapterId === target.chapterId && t.unitId === target.unitId))
        recent.unshift(target)
        recent = recent.slice(0, 3)
        localStorage.setItem('app_recent_targets', JSON.stringify(recent))
      } catch (_) {}
    } else {
      localStorage.removeItem('app_current_target')
    }
  }, [])

  const refreshDraftCount = useCallback(async () => {
    try {
      const { getDraftStats } = await import('../services/draftService')
      const stats = await getDraftStats()
      dispatch({ type: 'SET_DRAFT_COUNT', payload: stats.pending + stats.failed })
    } catch (e) {
      console.warn('[draftCount] refresh failed:', e)
    }
  }, [])

  const setSystemFloatingEnabled = useCallback((enabled) => {
    dispatch({ type: 'SET_SYSTEM_FLOATING_ENABLED', payload: !!enabled })
    if (enabled) {
      localStorage.setItem('app_system_floating_enabled', 'true')
    } else {
      localStorage.removeItem('app_system_floating_enabled')
    }
  }, [])

  const setVoskReady = useCallback((ready) => {
    dispatch({ type: 'SET_VOSK_READY', payload: ready })
  }, [])

  const setVoskModelStatus = useCallback((status) => {
    dispatch({ type: 'SET_VOSK_MODEL_STATUS', payload: status })
  }, [])

  // v 新增：初始化时刷新草稿数（用于悬浮窗红点提示）
  useEffect(() => {
    refreshDraftCount()
  }, [refreshDraftCount])

  const setAiServiceMode = useCallback((mode) => {
    dispatch({ type: 'SET_AI_SERVICE_MODE', payload: mode })
  }, [])

  const setIflytekSparkModel = useCallback((model) => {
    dispatch({ type: 'SET_IFLYTEK_SPARK_MODEL', payload: model })
  }, [])

  // 新增：文字识别服务 - 讯飞星火独立配置（APIKey + APISecret）
  const setIflytekSparkApiKey = useCallback((key) => {
    dispatch({ type: 'SET_IFLYTEK_SPARK_API_KEY', payload: key })
  }, [])

  const setIflytekSparkApiSecret = useCallback((secret) => {
    dispatch({ type: 'SET_IFLYTEK_SPARK_API_SECRET', payload: secret })
  }, [])

  // 新增：语音识别服务 - OpenAI 兼容 Whisper API 独立配置
  const setWhisperApiUrl = useCallback((url) => {
    dispatch({ type: 'SET_WHISPER_API_URL', payload: url })
  }, [])

  const setWhisperApiKey = useCallback((key) => {
    dispatch({ type: 'SET_WHISPER_API_KEY', payload: key })
  }, [])

  // 新增：语音识别服务 - 讯飞语音听写(IAT)独立配置
  const setIflytekIatAppId = useCallback((appId) => {
    dispatch({ type: 'SET_IFLYTEK_IAT_APP_ID', payload: appId })
  }, [])

  const setIflytekIatApiKey = useCallback((key) => {
    dispatch({ type: 'SET_IFLYTEK_IAT_API_KEY', payload: key })
  }, [])

  const setIflytekIatApiSecret = useCallback((secret) => {
    dispatch({ type: 'SET_IFLYTEK_IAT_API_SECRET', payload: secret })
  }, [])

  // 新增：火山引擎豆包大模型配置
  const setVolcanoApiKey = useCallback((key) => {
    dispatch({ type: 'SET_VOLCANO_API_KEY', payload: key })
  }, [])

  const setVolcanoModel = useCallback((model) => {
    dispatch({ type: 'SET_VOLCANO_MODEL', payload: model })
  }, [])

  // 新增：阿里云千问大模型配置
  const setDashscopeApiKey = useCallback((key) => {
    dispatch({ type: 'SET_DASHSCOPE_API_KEY', payload: key })
  }, [])

  const setDashscopeModel = useCallback((model) => {
    dispatch({ type: 'SET_DASHSCOPE_MODEL', payload: model })
  }, [])

  // PC 引擎代理配置
  const setPcEngineServer = useCallback((server) => {
    dispatch({ type: 'SET_PC_ENGINE_SERVER', payload: server })
  }, [])
  const setPcEnginePort = useCallback((port) => {
    dispatch({ type: 'SET_PC_ENGINE_PORT', payload: port })
  }, [])
  const setPcEngineToken = useCallback((token) => {
    dispatch({ type: 'SET_PC_ENGINE_TOKEN', payload: token })
  }, [])
  const setPcEngineParseEngine = useCallback((engine) => {
    dispatch({ type: 'SET_PC_ENGINE_PARSE_ENGINE', payload: engine })
  }, [])
  const setPcEngineAsr = useCallback((asr) => {
    dispatch({ type: 'SET_PC_ENGINE_ASR', payload: asr })
  }, [])
  // PC 引擎连接运行时状态（不持久化 localStorage）
  const setPcEngineConnected = useCallback((connected) => {
    dispatch({ type: 'SET_PC_ENGINE_CONNECTED', payload: !!connected })
  }, [])

  const setVisionAiUrl = useCallback((url) => {
    dispatch({ type: 'SET_VISION_AI_URL', payload: url })
  }, [])
  const setVisionAiKey = useCallback((key) => {
    dispatch({ type: 'SET_VISION_AI_KEY', payload: key })
  }, [])
  const setVisionAiModel = useCallback((model) => {
    dispatch({ type: 'SET_VISION_AI_MODEL', payload: model })
  }, [])

  const hideToast = useCallback(() => {
    dispatch({ type: 'HIDE_TOAST' })
  }, [])

  const setLogin = useCallback((isLoggedIn, user = null) => {
    dispatch({ type: 'SET_LOGIN', payload: { isLoggedIn, user } })
  }, [])

  // —— 管理员密码 ——
  // 优先级：.env 预设（VITE_ADMIN_PASSWORD_HASH）> localStorage 手动设置
  // 如果 .env 中预设了哈希，任何人（包括开发者）都只能"验证"，不能"重新设置"
  //
  // 修复 H2（2026-07-04）：激活 admin 密码保护机制
  //  - setRuntimeSupabaseConfig 现在要求 admin 密码校验（如果已设置）
  //  - verifyAdminPassword 改为 PBKDF2 + salt（修复 M3）
  //  - 默认 Fail-Open 保留（避免破坏首次使用体验），但敏感操作会引导用户设置密码
  const ADMIN_PASSWORD_PRESET_HASH =
    (import.meta.env.VITE_ADMIN_PASSWORD_HASH || '').trim()

  const hasAdminPassword = useCallback(() => {
    if (ADMIN_PASSWORD_PRESET_HASH) return true // 预设哈希视为已设置
    return !!localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD_HASH)
  }, [])

  const isAdminPasswordPreset = useCallback(() => {
    return !!ADMIN_PASSWORD_PRESET_HASH
  }, [])

  // PBKDF2 派生函数：修复 M3，替代单次 SHA-256
  // 返回 "pbkdf2$<iterations>$<saltHex>$<hashHex>" 格式字符串
  const pbkdf2Hash = useCallback(async (password, salt, iterations = 100000) => {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    )
    const hashHex = Array.from(new Uint8Array(derivedBits))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return `pbkdf2$${iterations}$${salt}$${hashHex}`
  }, [])

  // 生成随机 salt（hex 字符串）
  const generateSalt = useCallback(() => {
    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  }, [])

  // 恒定时间字符串比较，防止时序攻击
  const constantTimeEqual = useCallback((a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return result === 0
  }, [])

  const setAdminPassword = useCallback(async (newPassword) => {
    if (ADMIN_PASSWORD_PRESET_HASH) return false // 预设模式禁止本地设置
    if (!newPassword || newPassword.length < 6) return false
    // 修复 M3：使用 PBKDF2 + 随机 salt 替代单次 SHA-256
    const salt = generateSalt()
    const hash = await pbkdf2Hash(newPassword, salt)
    localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD_HASH, hash)
    return true
  }, [pbkdf2Hash, generateSalt])

  const verifyAdminPassword = useCallback(async (input) => {
    const preset = ADMIN_PASSWORD_PRESET_HASH
    const stored = preset || localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD_HASH)
    if (!stored) return true // 未设置密码且未预设，视为通过（保持向后兼容）
    if (!input) return false

    // 兼容旧版单次 SHA-256 哈希（无 salt，64 位 hex）
    // 检测：旧版格式为 64 位纯 hex，新版格式为 "pbkdf2$..."
    if (stored.length === 64 && /^[0-9a-f]{64}$/.test(stored)) {
      // 旧版 SHA-256 哈希，校验后自动升级到 PBKDF2
      const oldHash = await sha256(input)
      if (constantTimeEqual(oldHash, stored)) {
        // 校验通过，触发自动升级到 PBKDF2
        const salt = generateSalt()
        const newHash = await pbkdf2Hash(input, salt)
        localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD_HASH, newHash)
        return true
      }
      return false
    }

    // 新版 PBKDF2 格式：pbkdf2$<iterations>$<salt>$<hash>
    const parts = stored.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
    const iterations = parseInt(parts[1], 10)
    const salt = parts[2]
    const expectedHash = parts[3]
    if (!iterations || !salt || !expectedHash) return false
    const actualHash = await pbkdf2Hash(input, salt, iterations)
    // 提取 actualHash 的 hash 部分与 expected 比较
    const actualHashPart = actualHash.split('$')[3]
    return constantTimeEqual(actualHashPart, expectedHash)
  }, [pbkdf2Hash, generateSalt, constantTimeEqual])

  const clearAdminPassword = useCallback(() => {
    if (ADMIN_PASSWORD_PRESET_HASH) return // 预设模式禁止清除
    localStorage.removeItem(STORAGE_KEYS.ADMIN_PASSWORD_HASH)
  }, [])

  // —— Supabase 运行时配置 ——
  const getRuntimeSupabaseConfig = useCallback(() => {
    const cfg = getEffectiveConfig()
    return { url: cfg.url, anonKey: cfg.anonKey, source: cfg.source }
  }, [])

  // 修复 H2：setRuntimeSupabaseConfig 增加 admin 密码校验
  // 参数：
  //   url, anonKey - Supabase 配置
  //   adminPassword - 可选，admin 密码；如果已设置 admin 密码但未传入则抛出错误
  // 返回值：{ success: boolean, error?: string }
  const setRuntimeSupabaseConfig = useCallback(async (url, anonKey, adminPassword) => {
    // 如果已设置 admin 密码，则必须校验
    if (hasAdminPassword()) {
      if (!adminPassword) {
        return {
          success: false,
          error: '需要 admin 密码才能修改 Supabase 配置',
          requireAdminPassword: true,
        }
      }
      const ok = await verifyAdminPassword(adminPassword)
      if (!ok) {
        return {
          success: false,
          error: 'admin 密码错误',
          requireAdminPassword: true,
        }
      }
    }
    if (url) localStorage.setItem(STORAGE_KEYS.SUPABASE_RUNTIME_URL, url)
    if (anonKey) localStorage.setItem(STORAGE_KEYS.SUPABASE_RUNTIME_ANON_KEY, anonKey)
    // 重置连通性检查状态，让用户下次使用时重新检测
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH)
    // 清除强制本地模式标志，让新配置立即生效
    localStorage.removeItem(STORAGE_KEYS.FORCE_LOCAL_MODE)
    return { success: true }
  }, [hasAdminPassword, verifyAdminPassword])

  const clearRuntimeSupabaseConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_RUNTIME_URL)
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_RUNTIME_ANON_KEY)
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH)
  }, [])

  // —— 强制本地模式 ——
  const getForceLocalMode = useCallback(() => {
    return localStorage.getItem(STORAGE_KEYS.FORCE_LOCAL_MODE) === '1'
  }, [])

  const setForceLocalMode = useCallback((enabled) => {
    if (enabled) {
      localStorage.setItem(STORAGE_KEYS.FORCE_LOCAL_MODE, '1')
    } else {
      localStorage.removeItem(STORAGE_KEYS.FORCE_LOCAL_MODE)
    }
  }, [])

  const logout = useCallback(() => {
    if (isSupabaseConfigured()) {
      // Supabase signOut 会触发 onAuthStateChange 进而 dispatch LOGOUT
      supabase.auth.signOut().catch(() => {})
    }
    // 清理本地登录状态（对两种模式都处理）
    localStorage.removeItem(LOCAL_LOGGED_IN_KEY)
    localStorage.removeItem(LOCAL_USERNAME_KEY)
    cloudSettingsLoaded.current = false
    prevSyncValues.current = null
    dispatch({ type: 'LOGOUT' })
  }, [])

  // —— 用户资料 ——
  const loadUserProfile = useCallback(async () => {
    try {
      const profile = await getUserProfile()
      dispatch({ type: 'SET_USER_PROFILE', payload: profile })
      return profile
    } catch (e) {
      console.warn('[AppContext] 加载用户资料失败:', e.message)
      return null
    }
  }, [])

  const setUserProfile = useCallback(async (profile) => {
    try {
      await saveUserProfile(profile)
      dispatch({ type: 'SET_USER_PROFILE', payload: profile })
      return true
    } catch (e) {
      console.warn('[AppContext] 保存用户资料失败:', e.message)
      throw e
    }
  }, [])

  const value = {
    state,
    loadCategories,
    addCategory,
    renameCategory,
    removeCategory,
    setApiKey,
    setModel,
    setFontSize,
    setEyeProtection,
    setTheme,
    setBgPreset,
    setBgImage,
    setBgImageMode,
    setBgBlur,
    setBgMaskOpacity,
    setCardRadius,
    setCardShadow,
    setCardBorder,
    setCardOpacity,
    setBtnPrimaryOpacity,
    setBtnSecondaryOpacity,
    setStyleSchemes,
    setActiveStyleScheme,
    saveStyleScheme,
    deleteStyleScheme,
    renameStyleScheme,
    applyStyleScheme,
    resetBackgroundStyle,
    getAllStyleSchemes,
    presetStyleSchemes: PRESET_STYLE_SCHEMES,
    setDeveloperMode,
    setAiDebugPanel,
    setOcrAutoGenerate,
    setOcrEngine,
    setPaddleocrServerUrl,
    setPaddleocrApiToken,
    setPaddleocrLanguage,
    setBaiduOcrApiKey,
    setBaiduOcrSecretKey,
    setTesseractLanguage,
    setSpeechMode,
    setSpeechApiUrl,
    setSpeechApiKey,
    setIflytekAppId,
    setIflytekApiSecret,
    setInputBarMode,
    setCurrentTarget,
    refreshDraftCount,
    setSystemFloatingEnabled,
    setAiServiceMode,
    setIflytekSparkModel,
    // 新增：文字识别服务 - 讯飞星火独立配置（APIKey + APISecret）
    setIflytekSparkApiKey,
    setIflytekSparkApiSecret,
    // 新增：语音识别服务 - OpenAI 兼容 Whisper API 独立配置
    setWhisperApiUrl,
    setWhisperApiKey,
    // 新增：语音识别服务 - 讯飞语音听写(IAT)独立配置
    setIflytekIatAppId,
    setIflytekIatApiKey,
    setIflytekIatApiSecret,
    // 新增：火山引擎豆包大模型配置
    setVolcanoApiKey,
    setVolcanoModel,
    // 新增：阿里云千问大模型配置
    setDashscopeApiKey,
    setDashscopeModel,
    // PC 引擎代理配置
    setPcEngineServer,
    setPcEnginePort,
    setPcEngineToken,
    setPcEngineParseEngine,
    setPcEngineAsr,
    setPcEngineConnected,
    setVisionAiUrl,
    setVisionAiKey,
    setVisionAiModel,
    showToast,
    hideToast,
    setLogin,
    logout,
    // 用户资料
    loadUserProfile,
    setUserProfile,
    // 管理员与 Supabase 配置
    hasAdminPassword,
    isAdminPasswordPreset,
    setAdminPassword,
    verifyAdminPassword,
    clearAdminPassword,
    getRuntimeSupabaseConfig,
    setRuntimeSupabaseConfig,
    clearRuntimeSupabaseConfig,
    getForceLocalMode,
    setForceLocalMode,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
