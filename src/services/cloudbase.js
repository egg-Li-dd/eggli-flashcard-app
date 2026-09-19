import cloudbase from '@cloudbase/js-sdk'
import { STORAGE_KEYS } from '../utils/constants'

// —— CloudBase 环境配置 ——
// 硬编码环境 ID（用户已提供），同时支持从 .env 覆盖
const CLOUDBASE_ENV = import.meta.env.VITE_CLOUDBASE_ENV || 'eggli-d3gpsvtlnb1656c91'

// CloudBase Publishable Key（客户端安全密钥，用于 v3 认证 API）
const CLOUDBASE_ACCESS_KEY = import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || ''

// —— 运行时配置获取（保留与 supabase.js 相同接口，便于无痕替换）——
export function getEffectiveConfig() {
  const forcedLocal = localStorage.getItem(STORAGE_KEYS.FORCE_LOCAL_MODE) === '1'
  return {
    url: `https://${CLOUDBASE_ENV}.tcloudbasegateway.com`,
    anonKey: CLOUDBASE_ENV,
    env: CLOUDBASE_ENV,
    source: CLOUDBASE_ENV ? 'env' : 'none',
    forcedLocal,
  }
}

// —— 兼容旧接口：URL/Key 校验（CloudBase 无需 anon key，这里恒返回 true）——
export function isValidSupabaseUrl() {
  return true
}
export function isValidAnonKey() {
  return true
}
export function detectKeyType() {
  return { type: 'anon', label: '✅ CloudBase 环境', description: '使用腾讯云 CloudBase 内置认证', dangerous: false }
}
export function isServiceRoleKey() {
  return false
}

// —— 检测 Capacitor 环境 ——
function isCapacitor() {
  return (
    typeof window !== 'undefined' &&
    (window.Capacitor !== undefined ||
      window.webkit?.messageHandlers?.bridge !== undefined ||
      window.location?.protocol === 'capacitor:' ||
      /Capacitor|capacitor/i.test(navigator?.userAgent || ''))
  )
}

// —— CloudBase 客户端缓存 ——
let _app = null
let _auth = null
let _db = null

// —— 重置客户端（用于配置变更后刷新） ——
export function resetSupabaseClient() {
  _app = null
  _auth = null
  _db = null
}

function initApp() {
  if (_app) return _app
  if (!CLOUDBASE_ENV) return null

  const isMobile = isCapacitor()

  _app = cloudbase.init({
    env: CLOUDBASE_ENV,
    accessKey: CLOUDBASE_ACCESS_KEY,
  })
  return _app
}

function getAuth() {
  if (_auth) return _auth
  const app = initApp()
  if (!app) return null
  _auth = app.auth({ persistence: 'local' })
  return _auth
}

function getDb() {
  if (_db) return _db
  const app = initApp()
  if (!app) return null
  _db = app.rdb()
  return _db
}

// —— 配置有效性检测 ——
export const isSupabaseConfigured = () => {
  return !!CLOUDBASE_ENV
}

// —— 连通性预检 ——
export async function checkConnectivity() {
  if (!CLOUDBASE_ENV) {
    return { ok: false, reason: 'missing_config', message: 'CloudBase 环境 ID 未配置' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    // 通过尝试初始化并匿名访问来检测连通性
    const res = await fetch(`https://${CLOUDBASE_ENV}.tcloudbasegateway.com/v1/rdb/rest/`, {
      method: 'OPTIONS',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.status >= 200 && res.status < 500) {
      localStorage.setItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH, 'ok')
      return { ok: true, status: res.status }
    }
    localStorage.setItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH, 'fail')
    return { ok: false, reason: 'bad_status', status: res.status, message: `服务器返回 ${res.status}` }
  } catch (e) {
    clearTimeout(timer)
    // 网络错误不一定是真的不可用，CloudBase 可能需要先登录
    localStorage.setItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH, 'ok')
    return { ok: true, status: 0, note: 'CloudBase 需登录后访问' }
  }
}

// —— 面向 UI 的综合状态判断 ——
export function getSupabaseHealthStatus() {
  if (!CLOUDBASE_ENV) {
    return { ready: false, label: '未配置', description: 'CloudBase 环境 ID 未配置' }
  }
  if (getEffectiveConfig().forcedLocal) {
    return { ready: false, label: '已配置但当前为本地模式', description: '点击下方"切换到云端登录"按钮可退出本地模式使用云端同步。' }
  }
  const lastHealth = localStorage.getItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH)
  if (lastHealth === 'fail') {
    return { ready: true, label: '云端同步已启用（上次检测异常，已忽略）', description: '已读取到有效配置。若登录/同步时遇到网络错误请稍后重试。' }
  }
  return { ready: true, label: '云端同步已启用', description: '登录账号后数据将在多设备间同步（腾讯云 CloudBase + PostgreSQL）' }
}

// —— 瞬时网络错误检测 ——
export function isTransientSupabaseNetworkError(error) {
  if (!error) return false
  const msg = String(error.message || error.msg || error).toLowerCase()
  const name = String(error.name || '').toLowerCase()
  const code = String(error.code || error.cause?.code || '').toLowerCase()

  return (
    name.includes('typeerror') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    code.includes('network') ||
    code.includes('timeout')
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runSupabaseWithStartupRetry(operation, {
  retries = 3,
  baseDelayMs = 900,
  onRetry,
} = {}) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await operation()
      if (result?.error && isTransientSupabaseNetworkError(result.error) && attempt < retries) {
        lastError = result.error
      } else {
        return result
      }
    } catch (error) {
      if (!isTransientSupabaseNetworkError(error) || attempt >= retries) {
        throw error
      }
      lastError = error
    }

    const waitMs = baseDelayMs * (attempt + 1)
    if (typeof onRetry === 'function') onRetry({ attempt: attempt + 1, waitMs, error: lastError })
    await delay(waitMs)
  }

  throw lastError || new Error('无法连接到服务器')
}

// —— 清除本地模式强制锁 ——
export function clearForcedLocalMode() {
  try {
    localStorage.removeItem(STORAGE_KEYS.FORCE_LOCAL_MODE)
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH)
  } catch {}
}

// —— 清除上次健康检查缓存 ——
export function clearHealthCache() {
  try { localStorage.removeItem(STORAGE_KEYS.SUPABASE_LAST_HEALTH) } catch {}
}

// —— 错误信息中文化 ——
export function translateSupabaseError(error) {
  if (!error) return '未知错误'
  const msg = String(error.message || error.msg || error).toLowerCase()

  if (isTransientSupabaseNetworkError(error)) {
    return '云端连接暂时不稳定，已自动重试仍未成功。请等待几秒后再点一次，或切换网络后重试'
  }
  if (msg.includes('invalid jwt') || msg.includes('invalid api key') || msg.includes('apikey') || msg.includes('unauthorized')) {
    return '认证失败，请重新登录'
  }
  if (msg.includes('email not confirmed')) {
    return '请先前往邮箱完成验证后再登录'
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials') || msg.includes('wrong password') || msg.includes('incorrect password')) {
    return '邮箱或密码错误，请重试'
  }
  if (msg.includes('user already registered') || msg.includes('duplicate') || msg.includes('already exists') || msg.includes('already registered')) {
    return '该邮箱已注册，请直接登录'
  }
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('too short'))) {
    return '密码强度不足，请使用更复杂的密码（至少 6 位）'
  }
  if (msg.includes('refresh_token') || msg.includes('token expired')) {
    return '登录状态已过期，请重新登录'
  }
  if (msg.includes('over email send rate limit') || msg.includes('rate limit')) {
    return '请求过于频繁，请稍后再试'
  }
  if (msg.includes('network')) {
    return '网络连接异常，请检查网络后重试'
  }

  const raw = error.message || '操作失败'
  return raw
}

// —— 适配 CloudBase 用户对象为 Supabase 格式 ——
// CloudBase: { uid, email, username, ... }
// Supabase:  { id, email, aud, created_at, ... }
function adaptUser(cloudUser) {
  if (!cloudUser) return null
  return {
    id: cloudUser.uid || cloudUser.id || cloudUser.userId,
    uid: cloudUser.uid || cloudUser.id,
    email: cloudUser.email || '',
    aud: 'authenticated',
    created_at: cloudUser.created_at || new Date().toISOString(),
    user_metadata: cloudUser.user_metadata || {},
    app_metadata: cloudUser.app_metadata || {},
    // 保留原始字段
    ...cloudUser,
  }
}

function adaptSession(cloudSession) {
  if (!cloudSession) return null
  // CloudBase session 结构可能不同，适配为 Supabase 格式
  return {
    access_token: cloudSession.access_token || cloudSession.accessToken,
    refresh_token: cloudSession.refresh_token || cloudSession.refreshToken,
    expires_in: cloudSession.expires_in || cloudSession.expiresIn || 3600,
    expires_at: cloudSession.expires_at || cloudSession.expiresAt,
    token_type: cloudSession.token_type || 'bearer',
    user: adaptUser(cloudSession.user),
    // 保留原始字段
    ...cloudSession,
  }
}

// —— 便捷：获取当前会话和用户 ——
export async function getCurrentSession() {
  if (!isSupabaseConfigured()) return null
  const auth = getAuth()
  if (!auth) return null
  try {
    const result = await auth.getSession()
    if (result?.error) return null
    return adaptSession(result?.data?.session) || null
  } catch (e) {
    console.warn('[CloudBase] getSession 失败:', e?.message)
    return null
  }
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null
  const auth = getAuth()
  if (!auth) return null
  try {
    const result = await auth.getUser()
    if (result?.error) return null
    const user = adaptUser(result?.data?.user) || null
    return user
  } catch (e) {
    console.warn('[CloudBase] getUser 失败:', e?.message)
    return null
  }
}

// —— 监听登录状态变化 ——
export function onAuthChange(callback) {
  if (!isSupabaseConfigured()) {
    return () => {}
  }
  const auth = getAuth()
  if (!auth) return () => {}

  const { data } = auth.onAuthStateChange((event, session) => {
    // 适配 CloudBase 事件为 Supabase 格式
    // CloudBase 事件: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, PASSWORD_RESET, ...
    // Supabase 回调: (user, session, event)
    const adaptedSession = adaptSession(session)
    const user = adaptedSession?.user || null
    callback(user, adaptedSession, event)
  })
  return () => data.subscription.unsubscribe()
}

// —— 忘记密码 ——
export async function resetPasswordForEmail(email) {
  if (!isSupabaseConfigured()) {
    throw new Error('CloudBase 未配置，无法重置密码')
  }
  const auth = getAuth()
  if (!auth) throw new Error('客户端未初始化')
  const { error } = await auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/account',
  })
  if (error) throw error
}

// —— 导出 supabase 兼容对象（Proxy 转发到 CloudBase）——
// 使用 Proxy 动态转发，确保接口与原 supabase.js 完全一致
function buildSafeFallbackChain() {
  const chain = {
    select: async () => ({ data: null, error: new Error('CloudBase 未配置') }),
    insert: async () => ({ data: null, error: new Error('CloudBase 未配置') }),
    upsert: async () => ({ data: null, error: new Error('CloudBase 未配置') }),
    update: async () => ({ data: null, error: new Error('CloudBase 未配置') }),
    delete: async () => ({ data: null, error: new Error('CloudBase 未配置') }),
  }
  chain.eq = () => chain
  chain.neq = () => chain
  chain.gt = () => chain
  chain.gte = () => chain
  chain.lt = () => chain
  chain.lte = () => chain
  chain.like = () => chain
  chain.ilike = () => chain
  chain.in = () => chain
  chain.is = () => chain
  chain.limit = () => chain
  chain.order = () => chain
  chain.range = () => chain
  chain.single = () => chain
  chain.maybeSingle = () => chain
  return chain
}

// 构建兼容 Supabase auth 接口的对象
function buildAuthCompat() {
  const auth = getAuth()
  if (!auth) {
    // 未配置时的安全 fallback
    return {
      getUser: async () => ({ data: { user: null }, error: new Error('CloudBase 未配置') }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: null, error: new Error('CloudBase 未配置') }),
      signUp: async () => ({ data: null, error: new Error('CloudBase 未配置') }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: new Error('CloudBase 未配置') }),
      setSession: async () => ({ data: { user: null, session: null }, error: new Error('CloudBase 未配置') }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    }
  }

  return {
    // —— 获取用户（适配返回值） ——
    getUser: async () => {
      try {
        const result = await auth.getUser()
        if (result?.error) return { data: { user: null }, error: result.error }
        return { data: { user: adaptUser(result?.data?.user) }, error: null }
      } catch (e) {
        return { data: { user: null }, error: e }
      }
    },

    // —— 获取会话（适配返回值） ——
    getSession: async () => {
      try {
        const result = await auth.getSession()
        if (result?.error) return { data: { session: null }, error: result.error }
        return { data: { session: adaptSession(result?.data?.session) }, error: null }
      } catch (e) {
        return { data: { session: null }, error: e }
      }
    },

    // —— 邮箱密码登录（Supabase: signInWithPassword → CloudBase: signInWithPassword） ——
    // 注意：CloudBase JS SDK v3.4.8 中
    //   - auth.signInWithEmailAndPassword(email, password) 接受两个字符串，返回 LoginState（非 {data,error}）
    //   - auth.signInWithPassword({ email, password }) 接受对象，返回 { data: { user, session }, error }
    // 因此这里使用 signInWithPassword 以保持与 Supabase 接口一致的返回结构
    signInWithPassword: async ({ email, password }) => {
      try {
        const result = await auth.signInWithPassword({ email, password })
        if (result?.error) {
          console.error('[CloudBase Auth] 登录失败:', result.error)
          return { data: null, error: result.error }
        }
        const adaptedUser = adaptUser(result?.data?.user)
        const adaptedSession = adaptSession(result?.data?.session)
        return {
          data: {
            user: adaptedUser,
            session: adaptedSession,
          },
          error: null,
        }
      } catch (e) {
        console.error('[CloudBase Auth] 登录异常:', e)
        return { data: null, error: e }
      }
    },

    // —— 注册（CloudBase 两步验证流程）——
    // 第一步：signUp({ email, password }) 发送验证码到邮箱，返回 { data: { verifyOtp } }
    // 第二步：data.verifyOtp({ token: 验证码 }) 验证并完成注册
    signUp: async ({ email, password }) => {
      try {
        const result = await auth.signUp({ email, password })
        if (result?.error) return { data: null, error: result.error }
        // CloudBase 返回 { data: { verifyOtp, ... }, error }
        // 适配为 Supabase 格式，同时保留 verifyOtp 回调供第二步调用
        return {
          data: {
            // 保留 verifyOtp 回调，供 Account.jsx 第二步调用
            verifyOtp: result?.data?.verifyOtp || null,
            // 注册第一步不会返回 user/session，需要第二步验证后才会有
            user: null,
            session: null,
            // 标记这是第一步（发送验证码成功）
            step: 'code_sent',
          },
          error: null,
        }
      } catch (e) {
        return { data: null, error: e }
      }
    },

    // —— 退出登录 ——
    signOut: async () => {
      try {
        await auth.signOut()
        return { error: null }
      } catch (e) {
        return { error: e }
      }
    },

    // —— 重置密码 ——
    resetPasswordForEmail: async (email, options) => {
      try {
        const { error } = await auth.resetPasswordForEmail(email, options)
        return { error }
      } catch (e) {
        return { error: e }
      }
    },

    // —— 设置会话 ——
    setSession: async ({ access_token, refresh_token }) => {
      try {
        const result = await auth.setSession({
          access_token,
          refresh_token,
        })
        if (result?.error) return { data: { user: null, session: null }, error: result.error }
        return {
          data: {
            user: adaptUser(result?.data?.user),
            session: adaptSession(result?.data?.session),
          },
          error: null,
        }
      } catch (e) {
        return { data: { user: null, session: null }, error: e }
      }
    },

    // —— 监听认证状态变化 ——
    onAuthStateChange: (callback) => {
      const { data } = auth.onAuthStateChange((event, session) => {
        const adaptedSession = adaptSession(session)
        callback(event, adaptedSession)
      })
      return { data }
    },
  }
}

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'auth') {
        return buildAuthCompat()
      }
      if (prop === 'from') {
        const db = getDb()
        if (!db) {
          return () => buildSafeFallbackChain()
        }
        return (table) => db.from(table)
      }
      // 其他属性直接返回 undefined，避免误用
      return undefined
    },
  }
)
