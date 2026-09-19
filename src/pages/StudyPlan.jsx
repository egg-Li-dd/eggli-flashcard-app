import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getCategories, getAllCardsByCategory, getAllCardStatuses, getAllStudyPlans, getAllWrongAnswers, getChaptersByCategory } from '../services/db'
import { computeStageDistributionByCategory, predictFutureDueCards } from '../utils/planCalculator'
import { getSyncStatus, synchronize } from '../services/sync'
import PlanTodayView from './PlanTodayView'
import PlanFutureView from './PlanFutureView'
import PlanAnalysisView from './PlanAnalysisView'
import './StudyPlan.css'

// 同步状态指示器组件
function SyncIndicator({ status, onManualSync }) {
  const formatTime = (ts) => {
    if (!ts) return '从未同步'
    const date = new Date(ts)
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  
  return (
    <button 
      className="sync-indicator"
      onClick={onManualSync}
      disabled={status.syncInProgress}
    >
      {status.syncInProgress ? (
        <>
          <span className="sync-icon spinning">🔄</span>
          <span className="sync-text">同步中</span>
        </>
      ) : (
        <>
          <span className="sync-icon">✅</span>
          <span className="sync-text">{formatTime(status.lastSyncAt)}</span>
        </>
      )}
    </button>
  )
}

// 主视图 Tab
const MAIN_TABS = [
  { key: 'today', label: '今日计划' },
  { key: 'future', label: '未来预测' },
  { key: 'analysis', label: '学习分析' },
]

export default function StudyPlan() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const entryType = searchParams.get('entryType') || ''
  const initialCategoryId = searchParams.get('categoryId') || ''
  
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [cardsByCategory, setCardsByCategory] = useState(new Map())
  const [chaptersByCategory, setChaptersByCategory] = useState(new Map())
  const [statusesByCard, setStatusesByCard] = useState(new Map())
  const [studyPlans, setStudyPlans] = useState([])
  const [activeTab, setActiveTab] = useState('today') // today | future | analysis
  const [activeMode, setActiveMode] = useState('overview') // overview | ebbinghaus | progress | weak
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId)
  const [syncStatus, setSyncStatus] = useState({ lastSyncAt: null, syncInProgress: false })
  const [hasLocalOnlyData, setHasLocalOnlyData] = useState(false)
  const [wrongAnswers, setWrongAnswers] = useState([]) // 错题列表（薄弱卡片来源）
  
  const now = useMemo(() => Date.now(), [])
  
  // 加载数据
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [cats, allStatuses, plans, wrongList] = await Promise.all([
          getCategories(),
          getAllCardStatuses(),
          getAllStudyPlans(),
          getAllWrongAnswers(),
        ])
        
        // 按分类加载卡片
        const cardMap = new Map()
        const chapterMap = new Map()
        const statusMap = new Map()
        
        for (const cat of cats) {
          const cards = await getAllCardsByCategory(cat.id)
          cardMap.set(cat.id, cards)
          const chapters = await getChaptersByCategory(cat.id)
          chapterMap.set(cat.id, chapters)
        }
        
        // allStatuses 是完整数组 [{ id, cardId, categoryId, repetitions, ... }]
        // 构建 cardId -> 完整 status 对象的映射
        for (const s of allStatuses) {
          if (s && s.cardId) {
            statusMap.set(s.cardId, s)
          }
        }
        
        setCategories(cats)
        setStatusesByCard(statusMap)
        setStudyPlans(plans)
        setCardsByCategory(cardMap)
        setChaptersByCategory(chapterMap)
        setWrongAnswers(wrongList || [])
        
        // 加载同步状态
        const syncStatus = getSyncStatus()
        setSyncStatus(syncStatus)
        
        // 检查是否有仅本地模式数据
        const localOnly = allStatuses.filter(s =>
          s.mode && ['sequential', 'active', 'weak', 'test'].includes(s.mode)
        )
        setHasLocalOnlyData(localOnly.length > 0)
      } catch (err) {
        console.error('[StudyPlan] loadData error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])
  
  // 计算各分类的阶段分布
  const stageDistributions = useMemo(() => {
    return computeStageDistributionByCategory(categories, cardsByCategory, statusesByCard, now)
  }, [categories, cardsByCategory, statusesByCard, now])
  
  // 计算未来 7 天到期预测
  const futureDueCards = useMemo(() => {
    const allCards = []
    cardsByCategory.forEach(cards => allCards.push(...cards))
    return predictFutureDueCards(allCards, statusesByCard, 7, now)
  }, [cardsByCategory, statusesByCard, now])
  
  // 计算总到期数
  const totalDue = useMemo(() => {
    let sum = 0
    stageDistributions.forEach(dist => {
      sum += dist.due
    })
    return sum
  }, [stageDistributions])
  
  // 跳转到背诵页面
  const handleStartReview = (categoryId, mode = 'ebbinghaus') => {
    const params = new URLSearchParams()
    if (categoryId) params.set('categoryId', categoryId)
    params.set('mode', mode)
    if (entryType) params.set('fromPlan', 'true')
    navigate(`/memorize?${params.toString()}`)
  }
  
  // 手动同步处理函数
  const handleManualSync = async () => {
    if (syncStatus.syncInProgress) return
    
    setSyncStatus(prev => ({ ...prev, syncInProgress: true }))
    try {
      await synchronize()
      setSyncStatus({ lastSyncAt: Date.now(), syncInProgress: false })
    } catch (err) {
      console.error('[StudyPlan] sync error:', err)
      setSyncStatus(prev => ({ ...prev, syncInProgress: false }))
    }
  }
  
  if (loading) {
    return (
      <div className="study-plan-page">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="study-plan-page">
      {/* 顶部导航 */}
      <div className="plan-header">
        <button className="back-btn" onClick={() => navigate(-1)}>←</button>
        <h1 className="plan-title">背诵计划</h1>
        <SyncIndicator 
          status={syncStatus} 
          onManualSync={handleManualSync} 
        />
      </div>
      
      {/* 仅本地数据警告条 */}
      {hasLocalOnlyData && (
        <div className="local-only-warning">
          ⚠️ 部分标记仅本设备记录
          <p>顺序浏览、活跃学习、薄弱模式的标记不会同步到云端。艾宾浩斯计划已云端同步，换设备可无缝继续。</p>
        </div>
      )}
      
      {/* 主视图 Tab */}
      <div className="main-tabs">
        {MAIN_TABS.map(tab => (
          <button
            key={tab.key}
            className={`main-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* 背诵模式 Tab */}
      <div className="mode-tabs">
        {['overview', 'ebbinghaus', 'progress', 'weak'].map(mode => (
          <button
            key={mode}
            className={`mode-tab ${activeMode === mode ? 'active' : ''}`}
            onClick={() => setActiveMode(mode)}
          >
            {mode === 'overview' ? '总览' :
             mode === 'ebbinghaus' ? '艾宾浩斯' :
             mode === 'progress' ? '进度追踪' : '薄弱'}
          </button>
        ))}
      </div>
      
      {/* 内容区域 */}
      <div className="plan-content">
        {activeTab === 'today' && (
          <PlanTodayView
            categories={categories}
            cardsByCategory={cardsByCategory}
            chaptersByCategory={chaptersByCategory}
            statusesByCard={statusesByCard}
            stageDistributions={stageDistributions}
            studyPlans={studyPlans}
            activeMode={activeMode}
            totalDue={totalDue}
            wrongAnswers={wrongAnswers}
            onStartReview={handleStartReview}
            onSelectCategory={setSelectedCategoryId}
            selectedCategoryId={selectedCategoryId}
          />
        )}
        
        {activeTab === 'future' && (
          <PlanFutureView
            categories={categories}
            cardsByCategory={cardsByCategory}
            chaptersByCategory={chaptersByCategory}
            statusesByCard={statusesByCard}
            studyPlans={studyPlans}
            futureDueCards={futureDueCards}
            activeMode={activeMode}
          />
        )}
        
        {activeTab === 'analysis' && (
          <PlanAnalysisView
            categories={categories}
            cardsByCategory={cardsByCategory}
            chaptersByCategory={chaptersByCategory}
            statusesByCard={statusesByCard}
            stageDistributions={stageDistributions}
            activeMode={activeMode}
            wrongAnswers={wrongAnswers}
          />
        )}
      </div>
    </div>
  )
}
