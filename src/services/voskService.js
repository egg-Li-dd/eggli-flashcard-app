import { Capacitor } from '@capacitor/core'

let voskPlugin = null

const VOSK_MODEL_SMALL_CN = 'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.3.zip'
const VOSK_MODEL_BIG_CN = 'https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip'

// 第三方镜像源（archive.nightvoid.com，稳定可靠，支持 Range 请求）
const VOSK_ARCHIVE_BASE = 'https://archive.nightvoid.com/Development/konamask/Vosk%20API%20Model/English%20%26%20Other'

// 用户提供的高速下载源（国内 CDN，支持并发多线程下载）
const VOSK_SMALL_CN_FAST = 'https://zip1.webgetstore.com/2026/06/27/ca1b88c9a92c6f5a08f12264367d1904.zip?sg=800efdbe5120c0653013832bb70d0511&e=6a4e2d11&fileName=vosk-model-small-cn-0.22.zip&fi=292736928'
// 分享链接需要 Android 端解析 HTML 提取真实下载 URL
const VOSK_SMALL_CN_LANZOU = 'https://wwaxr.lanzouw.com/iBOnm3t9c8bi'

export const VOSK_MODELS = [
  {
    id: 'small-cn',
    name: '中文小模型',
    size: '约 50 MB',
    sizeBytes: 50 * 1024 * 1024,
    url: VOSK_MODEL_SMALL_CN,
    archiveUrl: VOSK_ARCHIVE_BASE + '/vosk-model-small-cn-0.3.zip',
    lanzouUrl: VOSK_SMALL_CN_LANZOU,
    fastUrl: VOSK_SMALL_CN_FAST,
    description: '体积小，速度快，适合日常使用（v0.3 版本，文件完整）',
    downloadTip: '推荐使用 alphacephei 主源下载',
  },
  {
    id: 'big-cn',
    name: '中文大模型',
    size: '约 1.3 GB',
    sizeBytes: 1300 * 1024 * 1024,
    url: VOSK_MODEL_BIG_CN,
    archiveUrl: VOSK_ARCHIVE_BASE + '/vosk-model-cn-0.22.zip',
    lanzouUrl: null,
    description: '识别精度更高，抗噪性更好',
    downloadTip: '推荐使用 alphacephei 主源或镜像源下载',
  },
]

/**
 * 按国内网络环境优化的默认下载源顺序构建源列表
 * 顺序：用户选中 → alphacephei 主源 → 镜像源(archive.nightvoid.com) → 蓝奏云
 * @param {string} modelId - 模型 ID
 * @param {string} [userSelectedKey] - 用户手动选择的源 key（可选）
 * @returns {{ key: string, label: string, url: string }[]} 有序源列表（已过滤 null）
 */
export function getOrderedSources(modelId, userSelectedKey) {
  const model = VOSK_MODELS.find(m => m.id === modelId)
  if (!model) return []

  // 所有候选源（按国内默认优先级排序）
  const candidates = [
    { key: 'primary', label: 'alphacephei 主源（官方）', url: model.url },
    { key: 'fast', label: '国内高速源（webgetstore）', url: model.fastUrl },
    { key: 'archive', label: '镜像源（archive.nightvoid.com）', url: model.archiveUrl },
    { key: 'lanzou', label: '蓝奏云', url: model.lanzouUrl },
  ]

  // 过滤掉 url 为 null/undefined 的源
  const available = candidates.filter(s => s.url)

  // 如果用户手动选择了某个源，把它排到第一位
  if (userSelectedKey) {
    const idx = available.findIndex(s => s.key === userSelectedKey)
    if (idx > 0) {
      const [selected] = available.splice(idx, 1)
      available.unshift(selected)
    }
  }

  return available
}

/**
 * 获取模型的默认下载源 key（默认 alphacephei 主源）
 * @param {string} modelId
 * @returns {string}
 */
export function getDefaultSourceKey(modelId) {
  // 小模型默认用国内高速源（webgetstore），大模型用 alphacephei 主源
  if (modelId === 'small-cn') return 'fast'
  return 'primary'
}

// 浏览器中模型下载页面的 URL，方便用户手动下载
export const VOSK_DOWNLOAD_PAGE_URL = 'https://alphacephei.com/vosk/models'

function getVoskPlugin() {
  if (voskPlugin) return voskPlugin
  if (Capacitor.isNativePlatform()) {
    // Capacitor 5+ 使用 Capacitor.Plugins
    const plugins = Capacitor.Plugins
    if (plugins && plugins.VoskASR) {
      voskPlugin = plugins.VoskASR
      return voskPlugin
    }
    // 兼容 Capacitor 4.x
    if (window.Capacitor && window.Capacitor.Plugins) {
      const voskAsr = window.Capacitor.Plugins.VoskASR
      if (voskAsr) {
        voskPlugin = voskAsr
        return voskPlugin
      }
    }
  }
  return null
}

export function isVoskAvailable() {
  return !!getVoskPlugin()
}

export async function checkVoskModel() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    return { hasModel: false, modelPath: null, modelSize: 0 }
  }
  try {
    const result = await plugin.checkModel()
    return {
      hasModel: result.hasModel || false,
      modelPath: result.modelPath || null,
      modelSize: result.modelSize || 0,
    }
  } catch (e) {
    console.error('检查Vosk模型失败:', e)
    return { hasModel: false, modelPath: null, modelSize: 0, error: e.message }
  }
}

export async function loadVoskModel(modelPath) {
  const plugin = getVoskPlugin()
  if (!plugin) {
    throw new Error('Vosk插件不可用，请在APP中使用')
  }
  const result = await plugin.loadModel({ modelPath })
  return result
}

export async function startVoskListening() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    throw new Error('Vosk插件不可用，请在APP中使用')
  }
  const result = await plugin.startListening()
  return result
}

export async function stopVoskListening() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    throw new Error('Vosk插件不可用，请在APP中使用')
  }
  const result = await plugin.stopListening()
  return result.text || ''
}

export async function cancelVoskListening() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    return
  }
  try {
    await plugin.cancel()
  } catch (e) {
    console.warn('取消Vosk识别失败:', e)
  }
}

export function addVoskPartialListener(callback) {
  const plugin = getVoskPlugin()
  if (!plugin) {
    return () => {}
  }
  const handler = plugin.addListener('voskPartialResult', (data) => {
    callback(data)
  })
  return () => {
    handler.remove()
  }
}

/**
 * 监听 Vosk 最终识别结果（只触发有文字的最终结果）
 * @param {(text: string) => void} callback 接收识别到的文字
 * @returns {() => void} 清理函数
 */
export function addVoskResultListener(callback) {
  const plugin = getVoskPlugin()
  if (!plugin) return () => {}
  const handler = plugin.addListener('voskPartialResult', (data) => {
    if (data && data.isFinal && data.text) {
      callback(data.text)
    }
  })
  return () => { handler.remove() }
}

export async function releaseVoskModel() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    return
  }
  try {
    await plugin.releaseModel()
  } catch (e) {
    console.warn('释放Vosk模型失败:', e)
  }
}

export async function downloadVoskModel(url, expectedSize) {
  const plugin = getVoskPlugin()
  if (!plugin) {
    throw new Error('Vosk插件不可用，请在APP中使用')
  }
  const result = await plugin.downloadModel({ url, expectedSize: expectedSize || 0 })
  return result
}

/**
 * 多下载源自动 fallback 下载
 * @param {string[]} urls - 下载 URL 数组
 * @param {string[]} labels - 对应每个 URL 的名称标签数组
 * @param {number} expectedSize - 预期文件大小（字节）
 */
export async function downloadVoskModelWithFallback(urls, labels, expectedSize, modelId) {
  const plugin = getVoskPlugin()
  if (!plugin) {
    throw new Error('Vosk插件不可用，请在APP中使用')
  }
  if (!urls || !urls.length) {
    throw new Error('下载地址列表不能为空')
  }
  const result = await plugin.downloadModelWithFallback({
    urls: JSON.stringify(urls),
    labels: JSON.stringify(labels || urls.map((_, i) => `下载源${i + 1}`)),
    expectedSize: expectedSize || 0,
    modelId: modelId || '',
  })
  return result
}

export async function importVoskModel(uri) {
  const plugin = getVoskPlugin()
  if (!plugin) {
    throw new Error('Vosk插件不可用，请在APP中使用')
  }
  const result = await plugin.importModel({ uri })
  return result
}

export async function cancelVoskDownload() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    return
  }
  try {
    await plugin.cancelDownload()
  } catch (e) {
    console.warn('取消下载失败:', e)
  }
}

export async function deleteVoskModel() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    throw new Error('Vosk插件不可用，请在APP中使用')
  }
  const result = await plugin.deleteModel()
  return result
}

export function addVoskDownloadListener(callback) {
  const plugin = getVoskPlugin()
  if (!plugin) {
    return () => {}
  }
  // Capacitor 8 的 addListener 返回 Promise<PluginListenerHandle>
  let listenerHandle = null
  const handlerPromise = plugin.addListener('voskDownloadProgress', (data) => {
    callback(data)
  })
  handlerPromise.then(handle => {
    listenerHandle = handle
  }).catch(err => {
    console.error('[Vosk] 注册下载进度监听器失败:', err)
  })
  return () => {
    if (listenerHandle) {
      listenerHandle.remove()
    }
  }
}

/**
 * 查询当前下载/导入状态（轮询后备方案）
 */
export async function getVoskDownloadStatus() {
  const plugin = getVoskPlugin()
  if (!plugin) {
    return null
  }
  try {
    const result = await plugin.getDownloadStatus()
    return result
  } catch (e) {
    console.error('[Vosk] 查询下载状态失败:', e)
    return null
  }
}

