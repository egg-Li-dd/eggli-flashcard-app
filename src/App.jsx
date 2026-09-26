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
  const { state, showToast } = useApp()
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
