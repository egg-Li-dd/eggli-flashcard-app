/**
 * 用户资料服务
 * 支持本地模式（localStorage）和云端模式（Supabase）
 */
import { supabase, isSupabaseConfigured, getCurrentUser } from './cloudbase'
import { STORAGE_KEYS } from '../utils/constants'

// localStorage 键名
const LOCAL_USER_PROFILE_KEY = 'app_user_profile'

// 预设头像列表（8个 Emoji 风格头像）
export const PRESET_AVATARS = [
  { id: 'avatar_1', emoji: '😀', label: '微笑' },
  { id: 'avatar_2', emoji: '😎', label: '酷' },
  { id: 'avatar_3', emoji: '🤓', label: '学霸' },
  { id: 'avatar_4', emoji: '🤩', label: '星星眼' },
  { id: 'avatar_5', emoji: '🥳', label: '庆祝' },
  { id: 'avatar_6', emoji: '😴', label: '犯困' },
  { id: 'avatar_7', emoji: '🤗', label: '拥抱' },
  { id: 'avatar_8', emoji: '🧐', label: '研究' },
]

/**
 * 获取预设头像列表
 */
export function getPresetAvatars() {
  return PRESET_AVATARS
}

/**
 * 根据预设头像ID获取头像信息
 */
export function getPresetAvatarById(id) {
  return PRESET_AVATARS.find(a => a.id === id) || PRESET_AVATARS[0]
}

/**
 * 获取用户资料（优先云端，本地兜底）
 */
export async function getUserProfile() {
  // 云端模式
  if (isSupabaseConfigured()) {
    try {
      const user = await getCurrentUser()
      if (user?.id) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .limit(1)
        
        const row = Array.isArray(data) ? data[0] : data
        if (!error && row) {
          let tags = row.tags || []
          if (typeof tags === 'string') {
            try {
              const parsed = JSON.parse(tags)
              tags = Array.isArray(parsed) ? parsed : [tags]
            } catch (e) {
              tags = tags.trim() ? [tags] : []
            }
          } else if (!Array.isArray(tags)) {
            tags = []
          }
          return {
            nickname: row.nickname || '',
            avatarUrl: row.avatar_url || '',
            avatarType: row.avatar_type || 'preset',
            tags,
          }
        }
      }
    } catch (e) {
      console.warn('[userProfile] 云端获取失败，使用本地:', e.message)
    }
  }

  // 本地兜底
  const local = localStorage.getItem(LOCAL_USER_PROFILE_KEY)
  if (local) {
    try {
      return JSON.parse(local)
    } catch (e) {
      return getDefaultProfile()
    }
  }

  return getDefaultProfile()
}

/**
 * 获取默认用户资料
 */
export function getDefaultProfile() {
  return {
    nickname: '',
    avatarUrl: PRESET_AVATARS[0].id,
    avatarType: 'preset',
    tags: [],
  }
}

/**
 * 保存用户资料
 * @param {Object} profile - { nickname, avatarUrl, avatarType, tags }
 * @returns {Promise<boolean>}
 */
export async function saveUserProfile(profile) {
  const { nickname, avatarUrl, avatarType, tags } = profile

  // 本地模式
  if (!isSupabaseConfigured()) {
    const data = { nickname, avatarUrl, avatarType, tags }
    localStorage.setItem(LOCAL_USER_PROFILE_KEY, JSON.stringify(data))
    return { success: true }
  }

  // 云端模式
  try {
    const user = await getCurrentUser()
    if (!user?.id) {
      return { success: false, error: { code: 'not_logged_in', message: '请先登录云端账号' } }
    }

    let { error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        nickname: nickname || '',
        avatar_url: avatarUrl || '',
        avatar_type: avatarType || 'preset',
        tags: tags || [],
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })

    if (error) {
      console.warn('[UserProfile] 保存用户资料失败 (onConflict):', error)
      console.warn('[UserProfile] 尝试不使用 onConflict 参数重新保存')
      const { error: retryError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: user.id,
          nickname: nickname || '',
          avatar_url: avatarUrl || '',
          avatar_type: avatarType || 'preset',
          tags: tags || [],
          updated_at: new Date().toISOString(),
        })
      if (retryError) {
        return { success: false, error: { code: retryError.code || 'unknown', message: retryError.message || '保存失败' } }
      }
    }

    // 本地也缓存一份
    localStorage.setItem(LOCAL_USER_PROFILE_KEY, JSON.stringify({ nickname, avatarUrl, avatarType, tags }))

    return { success: true }
  } catch (e) {
    console.error('[userProfile] 保存失败:', e.message)
    return { success: false, error: { code: 'unknown', message: e.message || '保存失败' } }
  }
}

/**
 * 上传自定义头像（转为 Base64）
 * @param {File} file - 图片文件
 * @returns {Promise<string>} Base64 编码的头像数据
 */
export function uploadCustomAvatar(file) {
  return new Promise((resolve, reject) => {
    // 文件类型检查
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      reject(new Error('仅支持 JPG、PNG、WebP 格式'))
      return
    }

    // 文件大小检查（2MB）
    const maxSize = 2 * 1024 * 1024
    if (file.size > maxSize) {
      reject(new Error('图片大小不能超过 2MB'))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      resolve(e.target.result)
    }
    reader.onerror = () => {
      reject(new Error('图片读取失败'))
    }
    reader.readAsDataURL(file)
  })
}
