import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { STORAGE_KEYS } from '../utils/constants'
import {
  supabase,
  isSupabaseConfigured,
  resetPasswordForEmail,
  translateSupabaseError,
  getSupabaseHealthStatus,
  runSupabaseWithStartupRetry,
} from '../services/cloudbase'
import {
  exportDataToJson,
  exportDataToExcel,
  importDataFromJson,
  importDataFromExcel,
} from '../services/migrate'
import { downloadExcelTemplate, downloadTestQuestionTemplate } from '../utils/excelParser'
import * as db from '../services/db'
import ProfileEditDialog from '../components/ProfileEditDialog'
import { getPresetAvatarById } from '../services/userProfile'

const LOCAL_LOGGED_IN_KEY = 'app_local_logged_in'
const LOCAL_USERNAME_KEY = 'app_local_username'
// 修复 H4：邮箱验证回调防登录固定攻击
// 在 signUp 时把待验证邮箱存入 sessionStorage，回调时校验 setSession 返回的 user.email 一致
const PENDING_VERIFY_EMAIL_KEY = 'app_pending_verify_email'

// 修复 H3：本地模式 PIN 码保护（可选，向后兼容）
// localStorage 存储键：app_local_pin_<username> = PBKDF2 哈希值
// - 已设置 PIN 的用户：登录时必须输入正确 PIN
// - 未设置 PIN 的用户：可直接登录，也可在登录时输入新 PIN 完成设置
function getLocalPinKey(name) {
  // 用 nickname 做简单 transform 防止键名冲突/注入
  const safe = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').slice(0, 32)
  return `app_local_pin_${safe}`
}

async function hashLocalPin(pin, username) {
  // PBKDF2 + 用户名作为 salt，50000 次迭代 + SHA-256
  const enc = new TextEncoder()
  const salt = enc.encode(`local_pin_salt_${username}`)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 50000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// 常量时间比较，防时序攻击
function constantTimeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export default function Account() {
  const { state, showToast, loadCategories, setLogin, logout, clearRuntimeSupabaseConfig, setForceLocalMode, getForceLocalMode, setApiKey, setModel, setSpeechMode, setSpeechApiUrl, setSpeechApiKey, setFontSize, setEyeProtection, setInputBarMode, loadUserProfile, setUserProfile } = useApp()
  const navigate = useNavigate()
  const isLoggedIn = state.isLoggedIn
  const user = state.user
  const userProfile = state.userProfile

  // 编辑对话框状态
  const [showEditDialog, setShowEditDialog] = useState(false)

  // 表单状态
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [inputEmail, setInputEmail] = useState('')
  const [inputPassword, setInputPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  // 注册两步验证：'form' 输入邮箱密码 | 'verify' 输入验证码
  const [registerStep, setRegisterStep] = useState('form')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyOtpFn, setVerifyOtpFn] = useState(null) // 存储 CloudBase 返回的 verifyOtp 回调
  const [resendCooldown, setResendCooldown] = useState(0) // 重发验证码倒计时（秒）
  // 登录模式：'cloud' 使用云端账号；'local' 使用本地昵称进入
  const [viewMode, setViewMode] = useState(() => {
    const forced =
      localStorage.getItem(STORAGE_KEYS.FORCE_LOCAL_MODE) === '1'
    if (forced) return 'local'
    return isSupabaseConfigured() ? 'cloud' : 'local'
  })
  // 修复 H3：本地模式 PIN 码输入与提示
  const [localPin, setLocalPin] = useState('')
  const [pinChecking, setPinChecking] = useState(false)

  // —— 验证码重发倒计时 ——
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  // —— 处理邮箱验证回调：#access_token=...&refresh_token=...&type=email 或 signup ——
  // 云端邮件确认链接会带一个 hash，在非 SSR 环境下浏览器会把它作为 URL hash 发给页面
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || hash.length < 10) return

    // 简单解析：access_token=xxx&expires_in=yyy&refresh_token=zzz&type=email
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type') || ''

    if (!accessToken) return

    // 先把 hash 清掉，避免刷新时又触发
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch (_) {}

    // 如果当前还不是 cloud 模式，先切换过去再处理
    const wasForcedLocal =
      localStorage.getItem(STORAGE_KEYS.FORCE_LOCAL_MODE) === '1'
    if (wasForcedLocal) {
      localStorage.removeItem(STORAGE_KEYS.FORCE_LOCAL_MODE)
    }
    setViewMode('cloud')

    setLoading(true)
    setFormError('')

    // 用 CloudBase SDK 把 access/refresh token 设置为当前 session
    ;(async () => {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        })
        if (error) throw error
        if (data?.user) {
          // 修复 H4：校验 setSession 返回的 user.email 与本地待验证邮箱一致
          // 防御登录固定攻击：攻击者用自己的 token 注入受害者浏览器
          const returnedEmail = (data.user.email || '').toLowerCase()
          const pendingEmail = (() => {
            try { return sessionStorage.getItem(PENDING_VERIFY_EMAIL_KEY) || '' } catch (_) { return '' }
          })()
          // 校验通过后清理 sessionStorage
          try { sessionStorage.removeItem(PENDING_VERIFY_EMAIL_KEY) } catch (_) {}

          if (pendingEmail && returnedEmail && pendingEmail !== returnedEmail) {
            // 邮箱不匹配，可能是登录固定攻击
            // 立即登出，避免攻击者账户被使用
            try { await supabase.auth.signOut() } catch (_) {}
            setFormError(
              `⚠️ 安全拦截：验证链接对应的账户（${returnedEmail}）与您正在注册的账户（${pendingEmail}）不一致。\n` +
              `可能是登录固定攻击，已自动登出。请直接用邮箱密码登录或重新发起注册。`
            )
            return
          }

          // 显式设置登录态，避免在 Capacitor WebView 中 onAuthStateChange 触发延迟
          setLogin(true, data.user)
          showToast(
            type === 'recovery'
              ? '密码恢复链接已激活，请在当前页面设置新密码'
              : '邮箱验证成功，已自动登录',
            'success',
          )
          loadStats()
          if (type !== 'recovery') {
            await Promise.resolve()
            navigate('/')
          }
          return
        }
        setFormError('验证链接已处理，但未能获取用户信息，请尝试登录')
      } catch (err) {
        setFormError(
          '邮件链接已过期或无效。请重新点击最新收到的邮件中的链接，或直接用邮箱密码登录。',
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // —— 响应运行时配置变更：保存新配置后立即切换视图 ——
  useEffect(() => {
    const forced =
      localStorage.getItem(STORAGE_KEYS.FORCE_LOCAL_MODE) === '1'
    setViewMode(forced ? 'local' : (isSupabaseConfigured() ? 'cloud' : 'local'))
  }, [isLoggedIn])

  // 页面聚焦时也刷新一次（用户可能在设置页操作后返回）
  useEffect(() => {
    function onFocus() {
      const forced =
        localStorage.getItem(STORAGE_KEYS.FORCE_LOCAL_MODE) === '1'
      setViewMode(forced ? 'local' : (isSupabaseConfigured() ? 'cloud' : 'local'))
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // 忘记密码面板
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)

  // 统计相关状态
  const [stats, setStats] = useState({ total: 0, today: 0, mastered: 0, learning: 0, newCards: 0, bookmarks: 0, dueCards: 0, longTerm: 0, streakDays: 0, chapters: 0 })

  // 导入/导出状态
  const [importing, setImporting] = useState(false)
  const [importingExcel, setImportingExcel] = useState(false)
  const [importingTq, setImportingTq] = useState(false)
  // 清除数据确认
  const [showClearData, setShowClearData] = useState(false)
  const [clearing, setClearing] = useState(false)

  // 登录状态改变 / 首次挂载时刷新统计
  // 关键：无论 isLoggedIn 是否变化，组件首次挂载就执行一次，防止"已登录状态下进入页面不刷新统计"
  useEffect(() => {
    loadStats()
    if (isLoggedIn) {
      loadUserProfile()
    }
  }, [isLoggedIn])

  // 页面可见性变化时刷新统计（从其他页面返回时更新）—— 移除 isLoggedIn 限制，确保每次可见即刷新
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadStats()
        if (isLoggedIn) {
          loadUserProfile()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const loadStats = async () => {
    try {
      // 使用 Promise.allSettled：单个查询失败不会导致全部返回，失败项用 0 兜底
      const [totalRes, bookmarkRes, statusRes, todayRes, dueRes, longTermRes, streakRes, chapterRes] = await Promise.allSettled([
        db.getCardCount(),
        db.getBookmarkCount(),
        db.getStatusStats(),
        db.getTodayStudiedCount(),
        db.getDueCardsCount(),
        db.getLongTermCardsCount(),
        db.getStreakDays(),
        db.getChapterCount(),
      ])

      const total = totalRes.status === 'fulfilled' ? (totalRes.value || 0) : 0
      if (totalRes.status === 'rejected') console.warn('getCardCount failed:', totalRes.reason)

      const bookmarks = bookmarkRes.status === 'fulfilled' ? (bookmarkRes.value || 0) : 0
      if (bookmarkRes.status === 'rejected') console.warn('getBookmarkCount failed:', bookmarkRes.reason)

      const statusStats = statusRes.status === 'fulfilled' && statusRes.value
        ? statusRes.value
        : { mastered: 0, learning: 0, newCards: 0 }
      if (statusRes.status === 'rejected') console.warn('getStatusStats failed:', statusRes.reason)

      const today = todayRes.status === 'fulfilled' ? (todayRes.value || 0) : 0
      if (todayRes.status === 'rejected') console.warn('getTodayStudiedCount failed:', todayRes.reason)

      const dueCards = dueRes.status === 'fulfilled' ? (dueRes.value || 0) : 0
      if (dueRes.status === 'rejected') console.warn('getDueCardsCount failed:', dueRes.reason)

      const longTerm = longTermRes.status === 'fulfilled' ? (longTermRes.value || 0) : 0
      if (longTermRes.status === 'rejected') console.warn('getLongTermCardsCount failed:', longTermRes.reason)

      const streakDays = streakRes.status === 'fulfilled' ? (streakRes.value || 0) : 0
      if (streakRes.status === 'rejected') console.warn('getStreakDays failed:', streakRes.reason)

      const chapters = chapterRes.status === 'fulfilled' ? (chapterRes.value || 0) : 0
      if (chapterRes.status === 'rejected') console.warn('getChapterCount failed:', chapterRes.reason)

      setStats({
        total,
        today,
        bookmarks,
        mastered: statusStats.mastered || 0,
        learning: statusStats.learning || 0,
        newCards: statusStats.newCards || 0,
        dueCards,
        longTerm,
        streakDays,
        chapters,
      })
    } catch (error) {
      console.error('加载统计失败:', error)
    }
  }

  // 输入验证
  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  }

  const validatePassword = (password) => {
    return password && password.length >= 6
  }

  // —— 本地模式：昵称 + PIN 进入 ——
  // 修复 H3：可选 PIN 码保护本地数据
  // - 已设 PIN 的用户必须输入正确 PIN
  // - 未设 PIN 的用户：直接登录或输入新 PIN 完成设置
  const handleLocalLogin = async (e) => {
    if (e) e.preventDefault()
    setFormError('')
    const name = nickname.trim()
    if (!name) {
      setFormError('请输入昵称')
      return
    }
    const pinKey = getLocalPinKey(name)
    let storedPinHash = ''
    try {
      storedPinHash = localStorage.getItem(pinKey) || ''
    } catch (_) {
      storedPinHash = ''
    }
    const inputPin = localPin.trim()

    setPinChecking(true)
    try {
      if (storedPinHash) {
        // 已设 PIN：必须验证
        if (!inputPin) {
          setFormError('该昵称已设置 PIN 码，请输入 PIN')
          return
        }
        if (!/^\d{4,6}$/.test(inputPin)) {
          setFormError('PIN 必须为 4-6 位数字')
          return
        }
        const inputHash = await hashLocalPin(inputPin, name)
        if (!constantTimeEqualStr(inputHash, storedPinHash)) {
          setFormError('PIN 码不正确')
          return
        }
        // PIN 验证通过
      } else if (inputPin) {
        // 未设 PIN 且用户输入了 PIN：设置为该昵称的 PIN
        if (!/^\d{4,6}$/.test(inputPin)) {
          setFormError('PIN 必须为 4-6 位数字')
          return
        }
        const newHash = await hashLocalPin(inputPin, name)
        try {
          localStorage.setItem(pinKey, newHash)
        } catch (_) {
          setFormError('PIN 设置失败，请重试')
          return
        }
        showToast('PIN 已设置，下次登录需输入', 'success')
      }
      // 无 PIN 且未输入：直接登录（向后兼容）

      localStorage.setItem(LOCAL_LOGGED_IN_KEY, 'true')
      localStorage.setItem(LOCAL_USERNAME_KEY, name)
      setLogin(true, { email: name, local: true })
      showToast(storedPinHash || inputPin ? '欢迎使用！' : '欢迎使用！建议设置 PIN 保护数据')
      loadStats()
      setLocalPin('')
      navigate('/')
    } finally {
      setPinChecking(false)
    }
  }

  // —— 清除当前本地用户的 PIN ——
  const handleClearLocalPin = () => {
    const name = (user?.email || '').trim()
    if (!name) return
    const pinKey = getLocalPinKey(name)
    try {
      localStorage.removeItem(pinKey)
      showToast('PIN 已清除')
    } catch (_) {
      showToast('PIN 清除失败', 'error')
    }
  }

  // —— 云端模式：登录 ——
  const handleLogin = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!validateEmail(inputEmail)) {
      setFormError('请输入有效的邮箱地址')
      return
    }
    if (!validatePassword(inputPassword)) {
      setFormError('密码至少 6 位')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await runSupabaseWithStartupRetry(() => supabase.auth.signInWithPassword({
        email: inputEmail.trim(),
        password: inputPassword,
      }), {
        onRetry: () => setFormError('云端正在建立连接，正在自动重试...'),
      })

      if (error) throw error

      if (data?.user) {
        // 显式更新登录状态，不再依赖 onAuthStateChange 时序，保证在
        // Capacitor WebView 中也能立即把登录态写入 state/localStorage。
        setLogin(true, data.user)
        showToast('登录成功')
        setInputEmail('')
        setInputPassword('')
        loadStats()
        // 等待一轮微任务，让 reducer + onAuthChange 订阅器先完成持久化，再跳转
        await Promise.resolve()
        navigate('/')
      }
    } catch (error) {
      setFormError(translateSupabaseError(error))
    } finally {
      setLoading(false)
    }
  }

  // —— 云端模式：注册 ——
  const handleRegister = async (e) => {
    e.preventDefault()
    setFormError('')

    // 第二步：验证码验证
    if (registerStep === 'verify') {
      if (!verifyCode || verifyCode.trim().length < 4) {
        setFormError('请输入邮箱收到的验证码')
        return
      }
      if (!verifyOtpFn || typeof verifyOtpFn !== 'function') {
        setFormError('验证状态已失效，请重新发送验证码')
        setRegisterStep('form')
        return
      }

      setLoading(true)
      try {
        const { data, error } = await runSupabaseWithStartupRetry(() => verifyOtpFn({ token: verifyCode.trim() }), {
          onRetry: () => setFormError('云端正在验证，正在自动重试...'),
        })

        if (error) throw error

        // 验证成功，完成注册并登录
        if (data?.user || data?.session) {
          const user = data?.user || data?.session?.user
          setLogin(true, user)
          setInputEmail('')
          setInputPassword('')
          setConfirmPassword('')
          setVerifyCode('')
          setVerifyOtpFn(null)
          setRegisterStep('form')
          showToast('注册成功，已自动登录')
          loadStats()
          await Promise.resolve()
          navigate('/')
        } else {
          // 某些情况下 verifyOtp 成功但不返回 session，提示用户登录
          setMode('login')
          setRegisterStep('form')
          setVerifyCode('')
          setVerifyOtpFn(null)
          showToast('验证成功，请使用邮箱密码登录')
        }
      } catch (error) {
        setFormError(translateSupabaseError(error))
      } finally {
        setLoading(false)
      }
      return
    }

    // 第一步：发送验证码
    if (!validateEmail(inputEmail)) {
      setFormError('请输入有效的邮箱地址')
      return
    }
    if (!validatePassword(inputPassword)) {
      setFormError('密码至少 6 位')
      return
    }
    if (inputPassword !== confirmPassword) {
      setFormError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const emailTrimmed = inputEmail.trim()
      // 修复 H4：记录待验证邮箱，用于回调时防御登录固定攻击
      try { sessionStorage.setItem(PENDING_VERIFY_EMAIL_KEY, emailTrimmed.toLowerCase()) } catch (_) {}

      const { data, error } = await runSupabaseWithStartupRetry(() => supabase.auth.signUp({
        email: emailTrimmed,
        password: inputPassword,
      }), {
        onRetry: () => setFormError('云端正在建立连接，正在自动重试...'),
      })

      if (error) throw error

      // CloudBase 两步注册：第一步成功后返回 verifyOtp 回调
      if (data?.verifyOtp && typeof data.verifyOtp === 'function') {
        setVerifyOtpFn(() => data.verifyOtp)
        setRegisterStep('verify')
        setResendCooldown(60)
        showToast('验证码已发送到邮箱，请查收')
      } else if (data?.session?.user) {
        // 兼容：如果未开启邮箱验证，直接拿到 session
        setLogin(true, data.session.user)
        setInputEmail('')
        setInputPassword('')
        setConfirmPassword('')
        showToast('注册成功，已自动登录')
        loadStats()
        await Promise.resolve()
        navigate('/')
      } else {
        // 未知情况，提示用户
        setMode('login')
        setConfirmPassword('')
        showToast('注册请求已提交，请查看邮箱完成验证')
      }
    } catch (error) {
      setFormError(translateSupabaseError(error))
    } finally {
      setLoading(false)
    }
  }

  // —— 重新发送验证码 ——
  const handleResendCode = async () => {
    if (resendCooldown > 0) return
    setFormError('')
    setLoading(true)
    try {
      const { data, error } = await runSupabaseWithStartupRetry(() => supabase.auth.signUp({
        email: inputEmail.trim(),
        password: inputPassword,
      }), {
        onRetry: () => setFormError('正在重新发送验证码...'),
      })

      if (error) throw error

      if (data?.verifyOtp && typeof data.verifyOtp === 'function') {
        setVerifyOtpFn(() => data.verifyOtp)
        setResendCooldown(60)
        showToast('验证码已重新发送')
      } else {
        setFormError('重新发送失败，请稍后重试')
      }
    } catch (error) {
      setFormError(translateSupabaseError(error))
    } finally {
      setLoading(false)
    }
  }

  // —— 忘记密码 ——
  const handleForgotPassword = async (e) => {
    if (e) e.preventDefault()
    setFormError('')

    if (!validateEmail(forgotEmail)) {
      setFormError('请输入有效的邮箱地址')
      return
    }

    setForgotLoading(true)
    try {
      await runSupabaseWithStartupRetry(() => resetPasswordForEmail(forgotEmail.trim()), {
        onRetry: () => setFormError('云端正在建立连接，正在自动重试...'),
      })
      setForgotSuccess(true)
      showToast('重置链接已发送，请查看邮箱')
    } catch (error) {
      setFormError(error?.message || '发送重置邮件失败')
    } finally {
      setForgotLoading(false)
    }
  }

  // —— 处理登出 ——
  const handleLogout = async () => {
    logout()
    showToast('已退出登录')
  }

  // —— 导出数据 ——
  const handleExport = async () => {
    try {
      const result = await exportDataToJson(db.dbInstance)
      if (result.platform === 'mobile') {
        // 保存成功后调起系统分享，让用户选择保存位置
        try {
          const { shareFile } = await import('../services/migrate')
          setTimeout(async () => {
            await shareFile(result.path, result.filename)
          }, 500)
        } catch (_) {}
        showToast(`文件已保存，正在打开分享… ${result.filename}`, 'success')
      } else {
        showToast('数据导出成功，文件已下载到本地', 'success')
      }
    } catch (error) {
      showToast('导出失败: ' + (error.message || error), 'error')
    }
  }

  // —— 导出 Excel ——
  const handleExportExcel = async () => {
    try {
      const result = await exportDataToExcel(db.dbInstance)
      showToast(`导出成功：${result.filename}`, 'success', [], { duration: 3000 })
      if (result.platform === 'mobile') {
        try {
          const { shareFile } = await import('../services/migrate')
          setTimeout(async () => { await shareFile(result.path, result.filename) }, 500)
        } catch (_) {}
      }
    } catch (error) {
      showToast('Excel 导出失败: ' + (error.message || error), 'error')
    }
  }

  // —— 导入数据 ——
  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const result = await importDataFromJson(db.dbInstance, file)
      
      // 应用导入的设置到 state
      if (result.settings) {
        const s = result.settings
        if (s.apiKey !== undefined) setApiKey(s.apiKey)
        if (s.model !== undefined) setModel(s.model)
        if (s.speechMode !== undefined) setSpeechMode(s.speechMode)
        if (s.speechApiUrl !== undefined) setSpeechApiUrl(s.speechApiUrl)
        if (s.speechApiKey !== undefined) setSpeechApiKey(s.speechApiKey)
        if (s.fontSize !== undefined) setFontSize(s.fontSize)
        if (s.eyeProtection !== undefined) setEyeProtection(s.eyeProtection)
        if (s.inputBarMode !== undefined) setInputBarMode(s.inputBarMode)
      }

      showToast('数据导入成功')
      await loadCategories()
      loadStats()
    } catch (error) {
      showToast('导入失败: ' + error.message)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  // —— 导入 Excel 数据 ——
  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportingExcel(true)
    try {
      const result = await importDataFromExcel(db.dbInstance, file)

      showToast(`Excel 导入成功：${result.stats.categories} 个分类，${result.stats.units} 个单元，${result.stats.cards} 张卡片`)
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach(w => showToast(w, 'warning'))
      }
      await loadCategories()
      loadStats()
    } catch (error) {
      showToast('Excel 导入失败: ' + error.message)
    } finally {
      setImportingExcel(false)
      e.target.value = ''
    }
  }

  // —— 下载 Excel 导入模板 ——
  const handleDownloadTemplate = async () => {
    try {
      const result = await downloadExcelTemplate()
      if (result?.platform === 'mobile') {
        showToast('✓ 模板已保存到 Documents 目录，可在文件管理中找到并分享', 'success')
      } else {
        showToast('模板已下载', 'success')
      }
    } catch (e) {
      showToast(e.message || '下载模板失败', 'error')
    }
  }

  // —— 下载题库模板 ——
  const handleDownloadTqTemplate = useCallback(async () => {
    try {
      const result = await downloadTestQuestionTemplate()
      if (result?.platform === 'mobile') {
        showToast('✓ 题库模板已保存到 Documents 目录，可在文件管理中找到并分享', 'success')
      } else {
        showToast('题库模板已下载', 'success')
      }
    } catch (e) {
      showToast(e.message || '下载模板失败', 'error')
    }
  }, [showToast])

  // —— 导入题库 Excel ——
  const handleImportTq = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportingTq(true)
    try {
      const result = await importTestQuestionsFromExcel(db.dbInstance, file, state.user?.id || '')
      showToast(`题库导入成功：${result.stats.questions} 道题目`)
      if (result.warnings?.length > 0) {
        result.warnings.forEach(w => showToast(w, 'warning'))
      }
    } catch (error) {
      showToast('题库导入失败: ' + error.message, 'error')
    } finally {
      setImportingTq(false)
      e.target.value = ''
    }
  }

  // —— 清除所有本地数据 ——
  const handleClearAllData = async () => {
    setClearing(true)
    try {
      await db.clearAllLocalData()
      showToast('本地数据已全部清除')
      loadStats()
      loadCategories()
      window.dispatchEvent(new CustomEvent('data-cleared'))
    } catch (error) {
      showToast('清除失败: ' + (error.message || error), 'error')
    } finally {
      setClearing(false)
      setShowClearData(false)
    }
  }

  // —— 渲染统计卡片 ——
  const renderStatCard = (label, value, color, onClick, subtitle, icon, subtitleColor) => (
    <button
      className="card text-center card-interactive"
      disabled={!onClick}
      onClick={onClick}
      style={{
        padding: '14px 10px',
        flex: 1,
        border: 'none',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        cursor: onClick ? 'pointer' : 'default',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        opacity: onClick ? 1 : 0.6,
        fontFamily: 'inherit',
        fontSize: 'inherit',
      }}
    >
      {icon && <div style={{ fontSize: '20px', marginBottom: '4px' }}>{icon}</div>}
      <div style={{ fontSize: '22px', fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{label}</div>
      {subtitle && (
        <div style={{ fontSize: '10px', color: subtitleColor || 'var(--color-text-muted)', marginTop: '2px' }}>{subtitle}</div>
      )}
    </button>
  )

  // —— 渲染本地登录表单 ——
  const renderLocalAuthForm = () => (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-primary-light)',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-primary-dark)', margin: 0 }}>
              当前为本地模式
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>
              数据仅保存在本设备浏览器中
            </p>
          </div>
        </div>
      </div>

      <p className="text-center mb-4 font-semibold" style={{ color: 'var(--color-text)', fontSize: 'var(--text-lg)' }}>
        开始使用
      </p>

      <form onSubmit={handleLocalLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="输入昵称即可开始"
          className="input"
          style={{ minHeight: '48px', fontSize: '15px', padding: '0 14px' }}
          autoComplete="username"
        />
        <input
          type="password"
          value={localPin}
          onChange={(e) => setLocalPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="PIN 码（可选，4-6 位数字）"
          className="input"
          style={{ minHeight: '48px', fontSize: '15px', padding: '0 14px', letterSpacing: '2px' }}
          inputMode="numeric"
          autoComplete="off"
          disabled={loading || pinChecking}
        />
        <p style={{
          fontSize: '11px',
          color: 'var(--color-text-secondary)',
          margin: '0',
          lineHeight: 1.4,
        }}>
          💡 首次为昵称输入 PIN 即可设置；已设置 PIN 的昵称登录时必须输入正确 PIN
        </p>
        {formError && (
          <p style={{ color: 'var(--color-danger)', fontSize: '12px', margin: 0, padding: '8px 10px', backgroundColor: 'var(--color-danger-light)', borderRadius: 'var(--radius-sm)' }}>
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={!nickname.trim() || loading || pinChecking}
          className="btn btn-primary btn-block"
          style={{ minHeight: '52px', fontSize: '15px', fontWeight: 600, marginTop: '4px' }}
        >
          {pinChecking ? (
            <span className="d-flex align-center justify-center gap-2">
              <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
              验证中...
            </span>
          ) : (
            '立即进入'
          )}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border-light)' }}>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
          已有数据？从 JSON 文件导入
        </p>
        <label className="btn btn-secondary btn-sm" style={{ minHeight: '44px', cursor: 'pointer' }}>
          导入备份数据
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={importing}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {state.user?.email === '2114279975@qq.com' && !state.user?.local && (
        <div style={{
          textAlign: 'center',
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--color-border-light)',
        }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ minHeight: '36px', fontSize: '12px' }}
            onClick={() => navigate('/settings')}
          >
            开发者入口 → 设置
          </button>
        </div>
      )}

      {isSupabaseConfigured() && (
        <div style={{
          textAlign: 'center',
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--color-border-light)',
        }}>
          <button
            onClick={() => {
              setForceLocalMode(false)
              setViewMode('cloud')
              showToast('已切换到云端登录')
            }}
            className="btn btn-ghost btn-sm"
            style={{
              color: 'var(--color-accent)',
              fontSize: '13px',
              minHeight: '36px',
            }}
          >
            切换到云端登录
          </button>
        </div>
      )}
    </div>
  )

  // —— 渲染云端登录/注册表单 ——
  const renderCloudAuthForm = () => {
    const health = getSupabaseHealthStatus()

    return (
      <div className="card" style={{ padding: '20px' }}>
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: health.ready
              ? 'var(--color-success-light)'
              : 'var(--color-warning-light)',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={health.ready ? 'var(--color-success)' : 'var(--color-warning)'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              {health.ready ? (
                <>
                  <path d="M5 13l4 4L19 7" />
                  <circle cx="12" cy="12" r="9" />
                </>
              ) : (
                <>
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </>
              )}
            </svg>
            <div>
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: health.ready ? 'var(--color-success-dark)' : 'var(--color-warning-dark)',
                  margin: 0,
                }}
              >
                {health.label}
              </p>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  margin: '2px 0 0',
                  lineHeight: 1.4,
                }}
              >
                {health.description}
              </p>
              {health.ready && (
                <p
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-secondary)',
                    margin: '4px 0 0',
                    fontStyle: 'italic',
                  }}
                >
                  登录后数据将在多设备间同步
                </p>
              )}
            </div>
          </div>
        </div>

        {!showForgot ? (
          <>
            <p className="text-center mb-4 font-semibold" style={{ color: 'var(--color-text)', fontSize: 'var(--text-lg)' }}>
              {mode === 'login' ? '欢迎回来' : '创建账号'}
            </p>

            <form onSubmit={mode === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="邮箱地址"
                className="input"
                style={{ minHeight: '48px', fontSize: '15px', padding: '0 14px' }}
                disabled={loading}
              />
              <input
                type="password"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                placeholder="密码（至少 6 位）"
                className="input"
                style={{ minHeight: '48px', fontSize: '15px', padding: '0 14px' }}
                disabled={loading}
              />
              {mode === 'register' && registerStep === 'form' && (
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="确认密码"
                  className="input"
                  style={{ minHeight: '48px', fontSize: '15px', padding: '0 14px' }}
                  disabled={loading}
                />
              )}

              {mode === 'register' && registerStep === 'verify' && (
                <>
                  <div style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary-light)',
                    fontSize: '13px',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.5,
                  }}>
                    验证码已发送至 <strong style={{ color: 'var(--color-primary)' }}>{inputEmail}</strong>
                    <br />
                    请输入邮箱收到的 6 位验证码完成注册
                  </div>
                  <input
                    type="text"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="输入 6 位验证码"
                    className="input"
                    style={{
                      minHeight: '48px',
                      fontSize: '18px',
                      letterSpacing: '4px',
                      textAlign: 'center',
                      fontWeight: 600,
                    }}
                    disabled={loading}
                    autoFocus
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCooldown > 0 || loading}
                    className="btn btn-ghost btn-sm"
                    style={{
                      width: '100%',
                      color: resendCooldown > 0 ? 'var(--color-text-secondary)' : 'var(--color-primary)',
                      fontSize: '13px',
                      minHeight: '36px',
                    }}
                  >
                    {resendCooldown > 0 ? `重新发送（${resendCooldown}s）` : '重新发送验证码'}
                  </button>
                </>
              )}

              {formError && (
                <p style={{ color: 'var(--color-danger)', fontSize: '12px', margin: 0, padding: '8px 10px', backgroundColor: 'var(--color-danger-light)', borderRadius: 'var(--radius-sm)' }}>
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-block"
                style={{ minHeight: '52px', fontSize: '15px', fontWeight: 600 }}
              >
                {loading ? (
                  <span className="d-flex align-center justify-center gap-2">
                    <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
                    处理中...
                  </span>
                ) : mode === 'login' ? (
                  '登录'
                ) : registerStep === 'verify' ? (
                  '完成注册'
                ) : (
                  '发送验证码'
                )}
              </button>

              {mode === 'register' && registerStep === 'verify' && (
                <button
                  type="button"
                  onClick={() => {
                    setRegisterStep('form')
                    setVerifyCode('')
                    setVerifyOtpFn(null)
                    setFormError('')
                  }}
                  className="btn btn-ghost btn-sm"
                  style={{
                    display: 'block',
                    margin: '0 auto',
                    color: 'var(--color-text-secondary)',
                    fontSize: '13px',
                    minHeight: '36px',
                  }}
                >
                  返回修改邮箱密码
                </button>
              )}
            </form>

            <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border-light)' }}>
              <button
                onClick={() => {
                  setForceLocalMode(true)
                  setViewMode('local')
                  showToast('已切换到本地模式')
                }}
                className="btn btn-ghost btn-sm"
                style={{
                  color: 'var(--color-primary)',
                  fontSize: '13px',
                  minHeight: '36px',
                }}
              >
                使用本地模式
              </button>
            </div>

            {mode === 'login' && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  onClick={() => {
                    setShowForgot(true)
                    setForgotEmail(inputEmail)
                    setForgotSuccess(false)
                    setFormError('')
                  }}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-accent)', minHeight: '36px', fontSize: '13px' }}
                >
                  忘记密码？
                </button>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border-light)' }}>
              {mode === 'login' ? (
                <button
                  onClick={() => {
                    setMode('register')
                    setRegisterStep('form')
                    setConfirmPassword('')
                    setVerifyCode('')
                    setVerifyOtpFn(null)
                    setFormError('')
                  }}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-primary)', minHeight: '44px', fontSize: '14px' }}
                >
                  还没有账号？立即注册
                </button>
              ) : (
                <button
                  onClick={() => {
                    setMode('login')
                    setRegisterStep('form')
                    setConfirmPassword('')
                    setVerifyCode('')
                    setVerifyOtpFn(null)
                    setFormError('')
                  }}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-primary)', minHeight: '44px', fontSize: '14px' }}
                >
                  已有账号？立即登录
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-center mb-4 font-semibold" style={{ color: 'var(--color-text)', fontSize: 'var(--text-lg)' }}>
              重置密码
            </p>

            {forgotSuccess ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px', fontSize: '14px', lineHeight: 1.5 }}>
                  重置链接已发送至 <strong style={{ color: 'var(--color-text)' }}>{forgotEmail}</strong>，
                  请查收邮件并点击链接重置密码。
                </p>
                <button
                  onClick={() => {
                    setShowForgot(false)
                    setForgotSuccess(false)
                    setForgotEmail('')
                  }}
                  className="btn btn-primary btn-block"
                  style={{ minHeight: '48px', fontSize: '14px' }}
                >
                  返回登录
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="请输入注册时使用的邮箱"
                  className="input"
                  style={{ minHeight: '48px', fontSize: '15px', padding: '0 14px' }}
                  disabled={forgotLoading}
                />
                {formError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: '12px', margin: 0, padding: '8px 10px', backgroundColor: 'var(--color-danger-light)', borderRadius: 'var(--radius-sm)' }}>
                    {formError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="btn btn-primary btn-block"
                  style={{ minHeight: '52px', fontSize: '15px', fontWeight: 600 }}
                >
                  {forgotLoading ? '发送中...' : '发送重置邮件'}
                </button>
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => {
                      setShowForgot(false)
                      setForgotEmail('')
                      setFormError('')
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--color-text-secondary)', minHeight: '36px', fontSize: '13px' }}
                  >
                    返回登录
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    )
  }

  // —— 渲染已登录状态 ——
  const renderLoggedIn = () => {
    // 显示名称优先级：用户资料昵称 > 邮箱 > 本地昵称
    const profileNickname = userProfile?.nickname
    const displayName = profileNickname || user?.email || (user?.local ? user.email : '用户')
    const isLocal = user?.local

    // 计算头像
    const getAvatarContent = () => {
      if (userProfile?.avatarType === 'custom' && userProfile?.avatarUrl) {
        return (
          <img
            src={userProfile.avatarUrl}
            alt="头像"
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          />
        )
      }
      const avatarId = userProfile?.avatarUrl || 'avatar_1'
      const preset = getPresetAvatarById(avatarId)
      return preset?.emoji || displayName?.charAt(0).toUpperCase() || 'U'
    }

    return (
      <>
        {/* 用户信息卡片 - 可点击编辑 */}
        <div
          className="card text-center mb-4 card-interactive"
          style={{ padding: '24px', cursor: 'pointer' }}
          onClick={() => setShowEditDialog(true)}
        >
          <div
            className="mx-auto mb-3 rounded-full flex items-center justify-center font-bold"
            style={{
              width: '72px',
              height: '72px',
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              fontSize: userProfile?.avatarType === 'custom' ? '0' : '28px',
              overflow: 'hidden',
            }}
          >
            {getAvatarContent()}
          </div>
          <p className="font-semibold" style={{ color: 'var(--color-text)', fontSize: '16px', fontWeight: 700 }}>
            {displayName}
          </p>
          <p className="mt-1" style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            fontSize: '11px',
          }}>
            {isLocal ? '本地模式' : '云端同步已启用'}
          </p>
          {/* 标签展示 */}
          {Array.isArray(userProfile?.tags) && userProfile.tags.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '10px',
            }}>
              {userProfile.tags.map((tag, index) => (
                <span
                  key={index}
                  style={{
                    padding: '2px 10px',
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    borderRadius: 'var(--radius-lg)',
                    fontSize: '11px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p style={{
            marginTop: '12px',
            padding: '6px 14px',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            display: 'inline-block',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
          }}>
            点击编辑资料
          </p>
        </div>

        {/* 学习统计面板 */}
        <div className="mb-4">
          <h3 className="mb-3 font-semibold" style={{ color: 'var(--color-text)', fontSize: 'var(--text-sm)' }}>
            学习统计
          </h3>

          {/* 2×3 统计卡片网格 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {renderStatCard('总卡片数', stats.total, 'var(--color-primary)', () => navigate('/'), null, '📚')}
            {renderStatCard('今日已学', stats.today, 'var(--color-success)', () => navigate('/stats/today'), null, '📅')}
            {renderStatCard('已掌握', stats.mastered, 'var(--color-success)', () => navigate('/stats/mastered'), null, '✅')}
            {renderStatCard('到期复习', stats.dueCards, 'var(--color-warning)', () => navigate('/memorize/plan'), stats.dueCards === 0 ? '暂无到期卡片' : null, '⏰')}
            {renderStatCard('长期记忆', stats.longTerm, 'var(--color-accent)', () => navigate('/stats/longterm'), stats.longTerm === 0 ? '暂无长期记忆' : null, '🧠')}
            {renderStatCard('章节数', stats.chapters, 'var(--color-primary)', () => navigate('/'), null, '📖')}
          </div>

          {/* 连续学习天数 */}
          <button
            onClick={() => navigate('/memorize/plan')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              width: '100%', padding: '12px 16px', marginTop: '12px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: stats.streakDays > 0 ? 'var(--color-warning-light)' : 'var(--color-bg-offset)',
              fontSize: '14px', fontWeight: 600,
              color: stats.streakDays > 0 ? 'var(--color-warning-dark)' : 'var(--color-text-muted)',
              cursor: 'pointer',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              fontFamily: 'inherit',
              minHeight: '44px',
            }}
          >
            {stats.streakDays > 0 ? (
              <>🔥 已连续学习 {stats.streakDays} 天 <span style={{ fontSize: '12px' }}>→</span></>
            ) : (
              <>今日还未学习，去看看背诵计划 <span style={{ fontSize: '12px' }}>→</span></>
            )}
          </button>

          {/* 背诵计划入口 */}
          <button
            onClick={() => navigate('/memorize/plan')}
            className="btn btn-secondary btn-block"
            style={{
              marginTop: '10px',
              minHeight: '44px',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            📋 背诵计划
            <span style={{ fontSize: '12px' }}>→</span>
          </button>
        </div>

        {/* 云端数据处理 */}
        {!isLocal && state.isLoggedIn && (
          <div className="mb-4">
            <button
              onClick={() => navigate('/cloud-data')}
              className="btn btn-secondary btn-block"
              style={{ minHeight: '44px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              云端数据处理
              <span style={{ fontSize: '11px' }}>→</span>
            </button>
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.4, textAlign: 'center' }}>
              查看与管理云端数据
            </p>
          </div>
        )}

        {/* 💡 制作者建议 */}
        <div className="card mb-4" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)', border: '1px solid #fde047', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ fontSize: '18px', lineHeight: 1.4 }}>💡</span>
            <div style={{ fontSize: '13px', color: '#713f12', lineHeight: 1.7 }}>
              <strong>制作者建议：</strong>通过本页面的「导入 Excel」功能是最简单的批量添加卡片方式。
              你可以配合 <strong>豆包 App</strong> 与本软件的「模板」一键生成导入文件，
              先下载模板 → 用豆包整理内容 → 粘贴到模板 → 导入即可。
            </div>
          </div>
        </div>

        {/* 数据管理 */}
        <div className="card mb-4" style={{ padding: '16px' }}>
          <h3 className="mb-3 font-semibold" style={{ color: 'var(--color-text)', fontSize: 'var(--text-sm)' }}>
            数据管理
          </h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleExport}
              className="btn btn-secondary"
              style={{ flex: 1, minWidth: '100px' }}
            >
              <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              导出
            </button>
            <button
              onClick={handleExportExcel}
              className="btn btn-secondary"
              style={{ flex: 1, minWidth: '100px' }}
            >
              <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              导出 Excel
            </button>
            <label className="btn btn-secondary" style={{ flex: 1, minWidth: '100px', cursor: 'pointer' }}>
              <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {importing ? '导入中...' : '导入备份'}
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={importing}
                style={{ display: 'none' }}
              />
            </label>
            <label className="btn btn-primary" style={{ flex: 1, minWidth: '100px', cursor: 'pointer' }}>
              <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {importingExcel ? '导入中...' : '导入 Excel'}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportExcel}
                disabled={importingExcel}
                style={{ display: 'none' }}
              />
            </label>
            <button
              onClick={handleDownloadTemplate}
              className="btn btn-ghost"
              style={{ flex: 1, minWidth: '80px', minHeight: '44px', fontSize: '13px' }}
            >
              <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              模板
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <label className="btn btn-primary" style={{ flex: 1, minWidth: '120px', cursor: 'pointer' }}>
              <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {importingTq ? '导入中...' : '导入题库'}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportTq}
                disabled={importingTq}
                style={{ display: 'none' }}
              />
            </label>
            <button
              onClick={handleDownloadTqTemplate}
              className="btn btn-ghost"
              style={{ flex: 1, minWidth: '80px', minHeight: '44px', fontSize: '13px' }}
            >
              <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              题库模板
            </button>
          </div>
          <button
            onClick={() => setShowClearData(true)}
            className="btn btn-danger"
            style={{ width: '100%', marginTop: '10px', minHeight: '44px', fontSize: '14px' }}
          >
            <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            清除本地数据
          </button>
          {/* 修复 H3：本地模式 PIN 管理 */}
          {isLocal && (
            <button
              onClick={handleClearLocalPin}
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', marginTop: '8px', minHeight: '36px', fontSize: '12px', color: 'var(--color-text-secondary)' }}
            >
              清除本地 PIN（清除后该昵称不再需要 PIN）
            </button>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-danger btn-block"
          style={{ marginTop: '20px' }}
        >
          退出登录
        </button>
      </>
    )
  }

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      onContextMenu={preventTextMenu}
      
    >
      <div className="animate-page-in" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '20px 16px 120px',
        maxWidth: '540px',
        margin: '0 auto',
        width: '100%',
      }}>
        {isLoggedIn
          ? renderLoggedIn()
          : viewMode === 'cloud' && isSupabaseConfigured()
            ? renderCloudAuthForm()
            : renderLocalAuthForm()}
      </div>

      {/* 用户资料编辑对话框 */}
      <ProfileEditDialog
        visible={showEditDialog}
        profile={userProfile || {
          nickname: user?.email || user?.local ? user.email : '',
          avatarUrl: 'avatar_1',
          avatarType: 'preset',
          tags: [],
        }}
        onSave={async (profile) => {
          try {
            await setUserProfile(profile)
            showToast('资料已保存', 'success')
            setShowEditDialog(false)
          } catch (e) {
            showToast('保存失败: ' + e.message, 'error')
          }
        }}
        onCancel={() => setShowEditDialog(false)}
        showToast={showToast}
      />

      {/* 清除数据确认弹窗 */}
      {showClearData && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}>
          <div className="modal-center-panel" style={{ margin: '16px', maxWidth: '360px' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: '8px', color: 'var(--color-danger)' }}>
              确认清除所有本地数据
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              此操作将删除所有分类、卡片、单元、背诵进度、错题记录、测试记录等全部本地数据。此操作不可撤销，建议先导出备份。
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowClearData(false)}
                className="btn btn-secondary"
                disabled={clearing}
                style={{ flex: 1, minHeight: '44px' }}
              >
                取消
              </button>
              <button
                onClick={handleClearAllData}
                className="btn btn-danger"
                disabled={clearing}
                style={{ flex: 1, minHeight: '44px' }}
              >
                {clearing ? '清除中...' : '确认清除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
