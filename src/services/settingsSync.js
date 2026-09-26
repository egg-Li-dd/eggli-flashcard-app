/**
 * 用户设置的云端同步服务。
 *
 * 负责将非敏感设置（模型选择、UI 偏好等）在 CloudBase 云端存储，实现跨设备自动同步。
 *
 * ⚠️ 安全说明：
 *  - API Key 默认不同步到云端以防止泄露
 *  - `apiKey`（DeepSeek Key）经用户确认后已加入同步白名单
 *  - 其他敏感字段（iflytekSecret、volcanoKey 等）仍不同步
 *
 * 同步字段（白名单）：
 *  - AI 模型选择 (model)
 *  - 字体大小 (fontSize)
 *  - 护眼模式 (eyeProtection)
 *  - 语音识别模式 (speechMode)
 *  - 语音 API URL (speechApiUrl) - URL 不含密钥，可同步
 *  - 输入栏模式 (inputBarMode)
 *  - 讯飞 APPID (iflytekAppId) - APPID 非 Secret，可同步
 *  - AI 服务模式 (aiServiceMode)
 *  - 讯飞星火模型 (iflytekSparkModel)
 *  - Whisper API URL (whisperApiUrl)
 *  - 讯飞语音听写 APPID (iflytekIatAppId)
 *  - 火山引擎模型 (volcanoModel)
 *  - 阿里云千问模型 (dashscopeModel)
 *  - OCR 自动生成卡片开关 (ocrAutoGenerate)
 *  - 图像识别引擎配置 (ocrEngine)
 *  - PaddleOCR 服务 URL (paddleocrServerUrl)
 *  - PaddleOCR 语言 (paddleocrLanguage)
 *
 * 策略：云端优先，本地降级。
 */

// 需要同步的设置字段列表
// ⚠️ apiKey（DeepSeek Key）已加入同步 — 经用户确认接受明文存储风险
// 其他 API Key/Secret/Token 仍不同步以降低泄露面
export const SYNCED_SETTING_KEYS = [
  'apiKey',
  'model',
  'fontSize',
  'eyeProtection',
  'speechMode',
  'speechApiUrl',
  'inputBarMode',
  'iflytekAppId',
  'aiServiceMode',
  'iflytekSparkModel',
  // 讯飞星火 API Key/Secret 不同步（敏感）
  'whisperApiUrl',
  // Whisper API Key 不同步（敏感）
  'iflytekIatAppId',
  // 讯飞 IAT API Key/Secret 不同步（敏感）
  'volcanoModel',
  // 火山引擎 API Key 不同步（敏感）
  'dashscopeModel',
  // 阿里云 DashScope API Key 不同步（敏感）
  'ocrAutoGenerate',
  'ocrEngine',
  'paddleocrServerUrl',
  'paddleocrLanguage',
  // PaddleOCR Token / Baidu OCR Key/Secret 不同步（敏感）
  // PC 引擎代理配置（包含 host、token、引擎选择等，作为 JSON 对象整体同步）
  'pcEngineConfig',
]

// 敏感字段黑名单：即使旧云端数据中包含这些字段，也不会被加载到本地（防止历史泄露）
// 修复 H9：避免读取已存在的旧版本同步数据中的密钥
// ⚠️ apiKey（DeepSeek）已从黑名单移除，允许同步
export const SENSITIVE_SETTING_KEYS = [
  'speechApiKey',                // 旧版语音 API Key
  'iflytekApiSecret',            // 讯飞 APISecret
  'iflytekSparkApiKey',          // 讯飞星火 API Key
  'iflytekSparkApiSecret',       // 讯飞星火 API Secret
  'whisperApiKey',               // Whisper API Key
  'iflytekIatApiKey',            // 讯飞 IAT API Key
  'iflytekIatApiSecret',         // 讯飞 IAT API Secret
  'volcanoApiKey',               // 火山引擎 API Key
  'dashscopeApiKey',             // 阿里云 DashScope API Key
  'paddleocrApiToken',           // PaddleOCR Token
  'baiduOcrApiKey',              // 百度 OCR API Key
  'baiduOcrSecretKey',           // 百度 OCR Secret Key
]

// —— 错误码映射 ——
function classifyError(error) {
  if (!error) return { code: 'unknown', message: '未知错误' }

  if (error.code === '42P01') {
    return { code: 'table_missing', message: '云端表未创建，请在云端控制台执行 SQL 初始化脚本' }
  }
  if (error.code === '42501') {
    return { code: 'permission', message: '权限不足，请检查 RLS 策略' }
  }

  const msg = (error.message || '').toLowerCase()
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('typeerror: failed') ||
    msg.includes('fetch failed')
  ) {
    return { code: 'network', message: '无法连接到服务器，请检查网络' }
  }

  return { code: 'unknown', message: error.message || '未知错误' }
}

function classifyException(err) {
  const msg = (err?.message || '').toLowerCase()
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('fetch failed')
  ) {
    return { code: 'network', message: '无法连接到服务器，请检查网络' }
  }
  return { code: 'unknown', message: err?.message || '未知错误' }
}

// ==================== 结构化 API（供 UI 手动操作使用） ====================

/**
 * 从云端拉取当前用户的设置（结构化返回）。
 *
 * @param {object} supabase - 云端客户端实例
 * @returns {Promise<{ success: boolean, data?: object, error?: { code: string, message: string } }>}
 */
export async function fetchCloudSettingsStructured(supabase) {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings, updated_at')
      .limit(1)

    if (error) {
      return { success: false, error: classifyError(error) }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row || !row.settings) {
      return { success: true, data: null, empty: true }
    }

    // ★ 关键修复：从数据库读取的 settings 可能是 JSON 字符串，需要解析为对象
    let parsedSettings = row.settings
    if (typeof parsedSettings === 'string') {
      try {
        parsedSettings = JSON.parse(parsedSettings)
      } catch (parseError) {
        console.warn('[SettingsSync] 云端设置 JSON 解析失败，作为字符串处理')
      }
    }

    return { success: true, data: parsedSettings }
  } catch (e) {
    return { success: false, error: classifyException(e) }
  }
}

/**
 * 将设置保存到云端（结构化返回）。
 *
 * 采用 Read-Modify-Write 模式：
 *   1. 拉取云端现有设置作为基底
 *   2. 用本次传入的字段覆盖对应 key
 *   3. 写回完整合并结果
 * 防止部分字段覆盖导致其他 API 配置丢失。
 *
 * @param {object} supabase - 云端客户端实例
 * @param {object} settingsData - 要同步的设置字段（只需包含变更项）
 * @returns {Promise<{ success: boolean, error?: { code: string, message: string } }>}
 */
export async function saveCloudSettingsStructured(supabase, settingsData) {
  try {
    // 1) 拉取云端现有设置作为基底
    let baseSettings = {}
    try {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('settings')
        .limit(1)
      const existingRow = Array.isArray(existing) ? existing[0] : existing
      if (existingRow?.settings) {
        let parsedBase = existingRow.settings
        // ★ 关键修复：从数据库读取的 settings 可能是 JSON 字符串
        if (typeof parsedBase === 'string') {
          try {
            parsedBase = JSON.parse(parsedBase)
          } catch (_) {
            parsedBase = {}
          }
        }
        if (typeof parsedBase === 'object' && parsedBase !== null) {
          baseSettings = parsedBase
        }
      }
    } catch (_) {
      // 拉取失败不阻塞，用空基底继续
    }

    // 2) 合并：云端基底 + 本次变更覆盖（空值不覆盖云端已有数据）
    const mergedSettings = { ...baseSettings }
    for (const key of SYNCED_SETTING_KEYS) {
      if (key in settingsData && settingsData[key] !== '' && settingsData[key] !== null && settingsData[key] !== undefined) {
        mergedSettings[key] = settingsData[key]
      }
    }

    // 修复 H9：主动清理云端历史遗留的敏感字段（一次性清理）
    // 旧版本曾将 API Key 同步到云端，新版本不同步但需要清理已存在的数据
    let removedSensitiveCount = 0
    for (const sensitiveKey of SENSITIVE_SETTING_KEYS) {
      if (sensitiveKey in mergedSettings) {
        delete mergedSettings[sensitiveKey]
        removedSensitiveCount++
      }
    }
    if (removedSensitiveCount > 0) {
      console.info(`[SettingsSync] 已清理 ${removedSensitiveCount} 个云端历史遗留敏感字段`)
    }

    // 3) 获取用户 ID 并写入
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) {
      return { success: false, error: { code: 'not_logged_in', message: '未登录，无法上传设置' } }
    }

    let { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          settings: mergedSettings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.warn('[SettingsSync] 保存设置失败 (onConflict):', error)
      console.warn('[SettingsSync] 尝试不使用 onConflict 参数重新保存')
      const { error: retryError } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          settings: mergedSettings,
          updated_at: new Date().toISOString(),
        })
      if (retryError) {
        return { success: false, error: classifyError(retryError) }
      }
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: classifyException(e) }
  }
}

// ==================== 简便 API（供 AppContext 自动同步使用，保持向后兼容） ====================

/**
 * 从云端拉取当前用户的设置。
 *
 * @param {object} supabase - 云端客户端实例
 * @returns {Promise<object|null>} 设置对象，无数据或失败时返回 null
 */
export async function fetchCloudSettings(supabase) {
  const result = await fetchCloudSettingsStructured(supabase)
  if (!result.success) {
    console.warn('[SettingsSync] 拉取失败:', result.error.code, result.error.message)
    return null
  }
  if (!result.data) {
    return null
  }
  return result.data
}

/**
 * 将设置保存到云端。
 *
 * @param {object} supabase - 云端客户端实例
 * @param {object} settingsData - 要同步的设置字段
 * @returns {Promise<boolean>} 保存是否成功
 */
export async function saveCloudSettings(supabase, settingsData) {
  const result = await saveCloudSettingsStructured(supabase, settingsData)
  if (!result.success) {
    console.warn('[SettingsSync] 保存失败:', result.error.code, result.error.message)
    return false
  }
  return true
}

// ==================== 工具 ====================

/**
 * 从云端设置构建需要同步到 localStorage 和 state 的键值对。
 *
 * @param {object} cloudSettings - 从云端拉取的设置对象
 * @returns {object} { apiKey, model, speechMode, speechApiUrl, speechApiKey }
 */
export function extractSettingsForApp(cloudSettings) {
  if (!cloudSettings) return {}

  // ★ 关键修复：确保 settings 可能是 JSON 字符串（双重保障）
  let settingsObj = cloudSettings
  if (typeof settingsObj === 'string') {
    try {
      settingsObj = JSON.parse(settingsObj)
    } catch (e) {
      console.warn('[SettingsSync] extractSettingsForApp: JSON 解析失败', e.message)
      return {}
    }
  }

  if (typeof settingsObj !== 'object' || settingsObj === null) {
    return {}
  }

  const result = {}
  for (const key of SYNCED_SETTING_KEYS) {
    if (key in settingsObj && settingsObj[key] !== undefined && settingsObj[key] !== null) {
      result[key] = settingsObj[key]
    }
  }
  return result
}