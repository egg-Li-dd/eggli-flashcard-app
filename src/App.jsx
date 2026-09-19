import ConnectionStatusBar from './components/ConnectionStatusBar'
import { BrowserRouter, Routes, Route, NavLink, useLocation, Outlet, useNavigate, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import Home from './pages/Home'
import Category from './pages/Category'
import SettingsMain from './pages/SettingsMain'
import SettingsAiService from './pages/SettingsAiService'
import SettingsSpeech from './pages/SettingsSpeech'
import SettingsOcr from './pages/SettingsOcr'
import SettingsDisplay from './pages/SettingsDisplay'
import SettingsBackground from './pages/SettingsBackground'

import SettingsDeveloper from './pages/SettingsDeveloper'
import SettingsPcEngine from './pages/SettingsPcEngine'
import SettingsTailscale from './pages/SettingsTailscale'
import Memorize from './pages/Memorize'
import StudyPlan from './pages/StudyPlan'
import UnitTestMain from './pages/UnitTestMain'
import UnitTestPage from './pages/UnitTestPage'
import UnitTestResult from './pages/UnitTestResult'
import QuestionBankPage from './pages/QuestionBankPage'
import LinkQuestionBank from './pages/LinkQuestionBank'
import WrongQuestionsPage from './pages/WrongQuestionsPage'
import AnswerRecordPage from './pages/AnswerRecordPage'
import KnowledgePointsView from './pages/KnowledgePointsView'
import Account from './pages/Account'
import StatsDetail from './pages/StatsDetail'
import StatsLongTerm from './pages/StatsLongTerm'
import CloudData from './pages/CloudData'
import CloudDataDetail from './pages/CloudDataDetail'
import TestDb from './pages/TestDb'
import SqlTool from './pages/SqlTool'
import AdminPanel from './pages/AdminPanel'
import ToastView from './components/ToastView'
import FloatingTaskPanel from './components/FloatingTaskPanel'
import FloatingInputBar from './components/FloatingInputBar'
import WelcomeNoticeModal from './components/WelcomeNoticeModal'
import SplashScreen from './components/SplashScreen'
import FloatingWindowPage from './pages/FloatingWindowPage'
import { useBackgroundTask } from './context/BackgroundTaskContext'
import { seedUsageGuide } from './utils/seedData'
import { getCategories } from './services/db'
import { deduplicateUsageGuide } from './services/db'

const TABS_LOGGED_OUT = [
  { path: '/account', label: '登录/注册' },
]

const TABS_LOGGED_IN = [
  { path: '/', label: '记录', exact: true, matchCategory: true },
  { path: '/memorize', label: '背诵' },
  { path: '/unit-test', label: '单元检测' },
  { path: '/account', label: '账号' },
  { path: '/settings', label: '设置' },
]

function TabBar() {
  const { state } = useApp()
  const location = useLocation()
  const tabs = state.isLoggedIn ? TABS_LOGGED_IN : TABS_LOGGED_OUT

  const isAdminEmail = state.user && state.user.email &&
    state.user.email.toLowerCase() === '2114279975@qq.com'

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <span className="app-title" style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span>egg李</span>
          {/* PC 引擎连接状态指示器 */}
          {state.pcEngineConnected && (
            <span title="PC 引擎已连接" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '10px',
              fontWeight: 500,
              color: '#22c55e',
              background: 'rgba(34,197,94,0.12)',
              padding: '2px 7px',
              borderRadius: '10px',
              lineHeight: '18px',
              whiteSpace: 'nowrap',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: '#22c55e', display: 'inline-block',
              }} />
              PC
            </span>
          )}
        </span>
        <nav className="nav-links">
          {tabs.map(function (tab) {
            const isActive = tab.matchCategory
              ? location.pathname === '/' || location.pathname.startsWith('/category/')
              : tab.exact
                ? location.pathname === '/'
                : location.pathname.startsWith(tab.path)
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.exact}
                className={'nav-link ' + (isActive ? 'active' : '')}
              >
                {tab.label}
              </NavLink>
            )
          })}
          {isAdminEmail && (
            <NavLink
              to="/admin"
              className={'nav-link ' + (location.pathname === '/admin' ? 'active' : '')}
              title="管理员面板"
            >
              🛠 管理
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

// 需要登录的页面守卫
function RequireAuth({ children }) {
  const { state } = useApp()
  if (!state.isLoggedIn) {
    return <Navigate to="/account" replace />
  }
  return children
}

function AppShell() {
  const { state, showToast, setPcEngineConnected, setTailscaleConnected } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const backPressedRef = useRef(0)
  const bgtCtx = useBackgroundTask()
  const [welcomeNoticeVisible, setWelcomeNoticeVisible] = useState(false)
  // 使用 ref 跟踪最新 pathname，避免闭包陷阱
  const pathnameRef = useRef(location.pathname)

  // 保持 pathnameRef 与 location.pathname 同步
  useEffect(function () {
    pathnameRef.current = location.pathname
  }, [location.pathname])

  // Flow 恢复：当用户点击悬浮窗的"待操作"按钮时触发
  const handleResumeFlow = function (flow) {
    if (!flow || !flow.payload) return
    if (flow.type === 'ai_generate_cards' && flow.payload.categoryId) {
      navigate(`/category/${flow.payload.categoryId}?resumeFlow=${flow.id}`)
      return
    }
    if (flow.type === 'card_classification' && flow.payload.categoryId) {
      const queryParams = new URLSearchParams({ resumeFlow: flow.id })
      if (flow.payload.feature) queryParams.set('feature', flow.payload.feature)
      navigate(`/category/${flow.payload.categoryId}?${queryParams.toString()}`)
      return
    }
    if (flow.onResumeRoute) {
      navigate(flow.onResumeRoute)
    }
  }

  useEffect(function () {
    // 仅在原生平台（Android/iOS）注册 backButton 监听
    const isNative = typeof window !== 'undefined' &&
      (window.Capacitor?.getPlatform?.() !== 'web')
    if (!isNative) return

    let handler = null
    import('@capacitor/app').then(function (mod) {
      const AppPlugin = mod.App
      handler = AppPlugin.addListener('backButton', function () {
        const currentPath = pathnameRef.current
        const topRoutes = ['/', '/memorize', '/unit-test', '/account', '/settings']
        const onTopRoute = topRoutes.includes(currentPath)

        if (onTopRoute) {
          const now = Date.now()
          if (now - backPressedRef.current < 2000) {
            AppPlugin.exitApp()
          } else {
            backPressedRef.current = now
            if (showToast) showToast('再按一次退出应用', 'error')
            else alert('再按一次退出应用')
          }
        } else {
          // 根据当前路径返回对应的上一级页面
          const currentPath = pathnameRef.current
          if (currentPath.startsWith('/category/') ||
              currentPath.startsWith('/stats/')) {
            navigate('/')
          } else if (currentPath.startsWith('/settings/')) {
            navigate('/settings')
          } else {
            // 兜底：使用 React Router navigate(-1)
            navigate(-1)
          }
        }
      })
    }).catch(function () {})

    return function () {
      if (handler) {
        handler.remove?.()?.catch?.(function () {})
      }
    }
  }, [navigate, showToast])

  // 使用指南种子数据初始化（v3 版本）
  // 无论本地/云端用户，首次无数据时均创建使用指南
  // 云端同步可能产生的重复由 deduplicateUsageGuide() 兜底清理
  useEffect(function () {
    const SEED_KEY = 'seed_usage_guide_v3'
    const seeded = localStorage.getItem(SEED_KEY)
    if (seeded) return

    const timer = setTimeout(async () => {
      try {
        // 先清理可能存在的重复「使用指南」分类
        await deduplicateUsageGuide()

        const cats = await getCategories()
        // 如果已有分类（本地或云端同步后的），不再种子
        if (cats.length > 0) {
          localStorage.setItem(SEED_KEY, 'true')
          return
        }

        // 无任何分类 → 创建使用指南
        const result = await seedUsageGuide()
        if (result.success) {
          localStorage.setItem(SEED_KEY, 'true')
          // 种子创建后需要刷新 AppContext 中的分类列表
          const freshCats = await getCategories()
          window.dispatchEvent(new CustomEvent('categories-updated', { detail: freshCats }))
        }
      } catch (e) {
        console.warn('[AppShell] 种子数据初始化失败:', e)
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [state.isLoggedIn, state.user])

  // 首次进入弹出 AI 服务配置公告
  useEffect(function () {
    const NOTICE_KEY = 'app_welcome_notice_shown'
    const shown = localStorage.getItem(NOTICE_KEY)
    if (shown) return

    const timer = setTimeout(() => {
      setWelcomeNoticeVisible(true)
    }, 800)

    return () => clearTimeout(timer)
  }, [])

  const handleCloseWelcomeNotice = () => {
    localStorage.setItem('app_welcome_notice_shown', 'true')
    setWelcomeNoticeVisible(false)
  }

  const handleGoToSettings = () => {
    localStorage.setItem('app_welcome_notice_shown', 'true')
    setWelcomeNoticeVisible(false)
    navigate('/settings/ai-service')
  }

  useEffect(function () {
    function handleContextMenu(e) {
      const tag = (e.target && e.target.tagName) || ''
      const editable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target && e.target.isContentEditable)
      if (!editable) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', handleContextMenu, { passive: false })
    document.addEventListener('selectstart', handleContextMenu, { passive: false })
    return function () {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('selectstart', handleContextMenu)
    }
  }, [])

  // Tailscale VPN 自动连接：应用启动时如果用户已开启"启动时自动连接"，自动恢复引擎
  useEffect(function () {
    const autoConnect = localStorage.getItem('tailscale_auto_connect') === 'true'
    if (!autoConnect) return

    const isNative = typeof window !== 'undefined' &&
      (window.Capacitor?.getPlatform?.() !== 'web')
    if (!isNative) return

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { isAvailable, start, getStatus } = await import('./services/tailscale')
        // 先检查引擎是否已在运行
        const available = await isAvailable()
        if (available?.running) {
          const status = await getStatus()
          if (status) {
            // 引擎已运行，检查是否需要恢复隧道
            const backendState = status.BackendState || status.backendState
            if (backendState === 'Running' || backendState === 'Stopped') {
              return // 一切正常
            }
          }
        }
        // 引擎未运行或状态异常，调用 start() 恢复（携带已保存的 Auth Key）
        const savedAuthKey = localStorage.getItem('tailscale_auth_key') || ''
        await start(savedAuthKey || undefined)
      } catch (e) {
        console.warn('[Tailscale AutoConnect] 恢复失败:', e)
      }
    }, 3000) // 延迟 3 秒，等应用完全启动

    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  // PC 引擎自动连接：启动时检测配置并连接
  useEffect(function () {
    console.log('[PC引擎] 自动连接检查启动')
    const isNative = typeof window !== 'undefined' &&
      (window.Capacitor?.getPlatform?.() !== 'web')
    if (!isNative) {
      console.log('[PC引擎] 非原生环境，跳过自动连接')
      return
    }

    let pcCancelled = false
    let retryCount = 0
    const MAX_RETRIES = 3

    const tryConnect = async () => {
      try {
        console.log('[PC引擎] 读取配置...')
        const configStr = localStorage.getItem('pc_engine_config')
        console.log('[PC引擎] 配置:', configStr ? '已找到' : '未找到')
        if (!configStr) return
        const config = JSON.parse(configStr)
        if (!config.host || !config.token) {
          console.log('[PC引擎] 配置不完整:', config.host ? '有host缺token' : '缺host')
          return
        }

        console.log('[PC引擎] 正在连接:', config.host)
        const baseUrl = `http://${config.host.replace(/^https?:\/\//, '').replace(/\/$/, '')}:19000`
        // 方式1：直连 fetch（走系统 VPN）
        let connected = false
        try {
          const res = await fetch(baseUrl + '/api/health', { method: 'GET', signal: AbortSignal.timeout(5000) })
          if (res.ok) connected = true
        } catch (_) {}
        // 方式2：fetchViaTailscale（走 Tailscale 原生 netstack）
        if (!connected) {
          try {
            const { healthCheck } = await import('./services/pcEngine')
            const result = await healthCheck()
            if (result) {
              console.log('[PC引擎] 自动连接成功:', result.name)
              connected = true
              try {
                const { listEngines } = await import('./services/pcEngine')
                await listEngines()
              } catch (_) {}
            }
          } catch (_) {}
        }
        if (connected) {
          setPcEngineConnected(true)
          return
        }

        console.log('[PC引擎] healthCheck 返回空（第' + (retryCount + 1) + '次）')
        if (!pcCancelled && retryCount < MAX_RETRIES) {
          retryCount++
          setTimeout(tryConnect, 5000)
        } else {
          setPcEngineConnected(false)
        }
      } catch (e) {
        console.warn('[PC引擎] 自动连接失败:', e.message)
        if (!pcCancelled && retryCount < MAX_RETRIES) {
          retryCount++
          setTimeout(tryConnect, 5000)
        } else {
          setPcEngineConnected(false)
        }
      }
    }

    const timer = setTimeout(tryConnect, 5000)

    // 心跳检测（10 秒间隔）：独立检测 PC 引擎和 Tailscale 状态
    // 无论 PC 引擎是否连接成功都启动，确保 Tailscale 状态也能被监测
    let heartbeatTimer = null
    let heartbeatImmediate = null

    const doHeartbeat = async () => {
      if (pcCancelled) return
      // PC 引擎心跳：同时尝试直连 fetch 和 Tailscale fetchViaTailscale
      // 任一成功即视为已连接
      try {
        const configStr = localStorage.getItem('pc_engine_config')
        let connected = false
        if (configStr) {
          const config = JSON.parse(configStr)
          if (config.host) {
            const baseUrl = `http://${config.host.replace(/^https?:\/\//, '').replace(/\/$/, '')}:19000`
            const token = config.token || ''
            // 方式1：直连 fetch（走系统 VPN）
            try {
              const res = await fetch(baseUrl + '/api/health', { method: 'GET', signal: AbortSignal.timeout(5000) })
              if (res.ok) connected = true
            } catch (_) {}
            // 方式2：fetchViaTailscale（走 Tailscale 原生 netstack）
            if (!connected) {
              try {
                const { healthCheck } = await import('./services/pcEngine')
                const ok = await healthCheck()
                if (ok) connected = true
              } catch (_) {}
            }
          }
        }
        setPcEngineConnected(connected)
      } catch (_) {
        setPcEngineConnected(false)
      }
      // Tailscale 状态检测 + 自动重连
      try {
        const { isAvailable, up } = await import('./services/tailscale')
        const avail = await isAvailable()
        const connected = !!(avail && avail.running)
        if (!connected && avail && avail.available !== false) {
          // 已安装但未运行，尝试自动重连
          try {
            await up()
            console.log('[Tailscale] 自动重连成功')
            setTailscaleConnected(true)
          } catch (reconnectErr) {
            console.warn('[Tailscale] 自动重连失败:', reconnectErr.message)
            setTailscaleConnected(false)
          }
        } else {
          setTailscaleConnected(connected)
        }
      } catch (_) {
        setTailscaleConnected(false)
      }
    }

    const startHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = setInterval(doHeartbeat, 10000)
      // 启动后 1 秒立即执行一次初检，不等 10 秒
      heartbeatImmediate = setTimeout(doHeartbeat, 1000)
    }

    // 立即启动心跳（不管 PC 引擎是否连上），确保 Tailscale 状态被监测
    startHeartbeat()

    return () => {
      pcCancelled = true
      clearTimeout(timer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (heartbeatImmediate) clearTimeout(heartbeatImmediate)
    }
  }, [])

  return (
    <div className="app-container flex flex-col">
      <Routes>
        {/* 系统悬浮窗独立页面：不挂 TabBarLayout，避免 TabBar 占用悬浮窗空间 */}
        <Route path="/floating-window" element={<FloatingWindowPage />} />
        <Route element={<TabBarLayout />}>
          <Route path="/account" element={<Account />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/memorize" element={<RequireAuth><Memorize /></RequireAuth>} />
          <Route path="/memorize/plan" element={<RequireAuth><StudyPlan /></RequireAuth>} />
          <Route path="/unit-test" element={<RequireAuth><UnitTestMain /></RequireAuth>} />
          <Route path="/test/unit" element={<RequireAuth><UnitTestPage /></RequireAuth>} />
          <Route path="/test/result" element={<RequireAuth><UnitTestResult /></RequireAuth>} />
          <Route path="/test/question-bank" element={<RequireAuth><QuestionBankPage /></RequireAuth>} />
          <Route path="/link-question-bank" element={<RequireAuth><LinkQuestionBank /></RequireAuth>} />
          <Route path="/test/wrong" element={<RequireAuth><WrongQuestionsPage /></RequireAuth>} />
          <Route path="/test/answer-records" element={<RequireAuth><AnswerRecordPage /></RequireAuth>} />
          <Route path="/test/knowledge-points" element={<RequireAuth><KnowledgePointsView /></RequireAuth>} />
          <Route path="/settings" element={<SettingsMain />} />
          <Route path="/settings/ai-service" element={<SettingsAiService />} />
          <Route path="/settings/speech" element={<SettingsSpeech />} />
          <Route path="/settings/ocr" element={<SettingsOcr />} />
          <Route path="/settings/display" element={<SettingsDisplay />} />
          <Route path="/settings/display/background" element={<SettingsBackground />} />
          
          <Route path="/settings/developer" element={<SettingsDeveloper />} />
          <Route path="/settings/pc-engine" element={<SettingsPcEngine />} />
          <Route path="/settings/tailscale" element={<SettingsTailscale />} />
          <Route path="/category/:id" element={<RequireAuth><Category /></RequireAuth>} />
          <Route path="/stats/:type" element={<RequireAuth><StatsDetail /></RequireAuth>} />
          <Route path="/stats/longterm" element={<RequireAuth><StatsLongTerm /></RequireAuth>} />
          <Route path="/cloud-data" element={<RequireAuth><CloudData /></RequireAuth>} />
          <Route path="/cloud-data/:table" element={<RequireAuth><CloudDataDetail /></RequireAuth>} />
          <Route path="/test-db" element={<RequireAuth><TestDb /></RequireAuth>} />
          <Route path="/sql-tool" element={<RequireAuth><SqlTool /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminPanel /></RequireAuth>} />
        </Route>
      </Routes>

      <ToastView />
      <FloatingTaskPanel onResumeFlow={handleResumeFlow} />
      <WelcomeNoticeModal
        visible={welcomeNoticeVisible}
        onClose={handleCloseWelcomeNotice}
        onGoToSettings={handleGoToSettings}
      />
    </div>
  )
}

function TabBarLayout() {
  const { state } = useApp()
  return (
    <React.Fragment>
      <TabBar />
      <div className="page-wrapper" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <Outlet />
      
      <ConnectionStatusBar />
</div>
      {/* 全局悬浮窗：仅在 floating 模式下渲染 */}
      {state.inputBarMode === 'floating' && <FloatingInputBar />}
    </React.Fragment>
  )
}

export default function App() {
  // 启动闪屏页：3 秒固定时长，用于后台应用加载
  const [showSplash, setShowSplash] = useState(true)

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false)
  }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppShell />
        {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
      </BrowserRouter>
    </ErrorBoundary>
  )
}
