import { useMemo, useState } from 'react'
import { getStageName, getStageColor, computeCategoryProgress } from '../utils/planCalculator'
import PlanSettingsModal from './PlanSettingsModal'

// 今日视图分类卡片
function CategoryCard({ category, distribution, cards, chapters, statuses, studyPlan, onStartReview, onOpenSettings }) {
  const progress = useMemo(() => {
    return computeCategoryProgress(cards, statuses)
  }, [cards, statuses])
  
  const newSuggestion = Math.min(studyPlan?.dailyNewLimit || 20, cards.length - progress.masteredCount)
  const chapterCount = chapters?.length || 0
  
  return (
    <div className="category-card">
      <div className="category-header">
        <div className="category-info">
          <span className="category-name">{category.name}</span>
          <span className="mode-badge ebbinghaus">🔵 艾宾浩斯</span>
        </div>
        <button
          className="plan-settings-btn"
          onClick={(e) => { e.stopPropagation(); onOpenSettings(category.id, category.name); }}
          title="学习计划设置"
          style={{
            width: '36px',
            height: '36px',
            border: 'none',
            background: 'var(--color-surface)',
            borderRadius: '50%',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          ⚙️
        </button>
      </div>
      
      <div className="category-stats">
        <div className="stat-item due">
          <span className="stat-value">{distribution.due}</span>
          <span className="stat-label">到期</span>
        </div>
        <div className="stat-item new">
          <span className="stat-value">{newSuggestion}</span>
          <span className="stat-label">新学建议</span>
        </div>
        <div className="stat-item progress">
          <span className="stat-value">{progress.progressPercent}%</span>
          <span className="stat-label">已掌握</span>
        </div>
        {chapterCount > 0 && (
          <div className="stat-item chapters">
            <span className="stat-value">{chapterCount}</span>
            <span className="stat-label">章节</span>
          </div>
        )}
      </div>
      
      <div className="category-progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>
      
      <button 
        className="start-review-btn"
        onClick={() => onStartReview(category.id, 'ebbinghaus')}
      >
        进入复习
      </button>
    </div>
  )
}

// 模式汇总卡片
function ModeSummaryCard({ mode, stats, onClick }) {
  const modeConfig = {
    ebbinghaus: { label: '艾宾浩斯', icon: '🔵', color: '#4A90D9', sync: true },
    sequential: { label: '顺序浏览', icon: '⚪', color: '#999', sync: false },
    active: { label: '活跃学习', icon: '⚪', color: '#999', sync: false },
    weak: { label: '薄弱卡片', icon: '⚪', color: '#999', sync: false },
  }
  
  const config = modeConfig[mode] || modeConfig.ebbinghaus
  
  return (
    <div className="mode-summary-card" onClick={onClick}>
      <div className="mode-icon" style={{ color: config.color }}>{config.icon}</div>
      <div className="mode-label">{config.label}</div>
      <div className="mode-stats">{stats}</div>
      {config.sync ? (
        <div className="sync-badge synced">🔵 已同步</div>
      ) : (
        <div className="sync-badge local">⚪ 仅本地</div>
      )}
    </div>
  )
}

export default function PlanTodayView({
  categories,
  cardsByCategory,
  chaptersByCategory,
  statusesByCard,
  stageDistributions,
  studyPlans,
  activeMode,
  totalDue,
  wrongAnswers,
  onStartReview,
  onSelectCategory,
  selectedCategoryId,
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [settingsCategoryId, setSettingsCategoryId] = useState('')
  const [settingsCategoryName, setSettingsCategoryName] = useState('')
  const [settingsChapterId, setSettingsChapterId] = useState('')
  const [settingsChapterName, setSettingsChapterName] = useState('')

  const handleOpenSettings = (categoryId, categoryName, chapterId = '', chapterName = '') => {
    setSettingsCategoryId(categoryId)
    setSettingsCategoryName(categoryName)
    setSettingsChapterId(chapterId)
    setSettingsChapterName(chapterName)
    setShowSettings(true)
  }

  const handleCloseSettings = () => {
    setShowSettings(false)
    setSettingsChapterId('')
    setSettingsChapterName('')
  }

  // 总览模式
  if (activeMode === 'overview') {
    return (
      <div className="plan-today-view overview">
        {/* 汇总统计 */}
        <div className="today-summary">
          <div className="summary-title">今日任务</div>
          <div className="summary-stats">
            <div className="summary-stat">
              <span className="stat-num due">{totalDue}</span>
              <span className="stat-desc">张卡片到期</span>
            </div>
            <div className="summary-stat">
              <span className="stat-num">{categories.length}</span>
              <span className="stat-desc">个分类</span>
            </div>
          </div>
        </div>
        
        {/* 模式汇总卡片 */}
        <div className="mode-summary-grid">
          <ModeSummaryCard mode="ebbinghaus" stats={`${totalDue} 张到期`} />
          <ModeSummaryCard mode="weak" stats="待掌握" />
        </div>
        
        {/* 分类卡片列表 */}
        <div className="category-list">
          {categories.map(cat => {
            const dist = stageDistributions.get(cat.id) || {}
            const cards = cardsByCategory.get(cat.id) || []
            const plan = studyPlans.find(p => p.categoryId === cat.id && (!p.chapterId || p.chapterId === ''))
            const chapters = chaptersByCategory?.get(cat.id) || []
            return (
              <CategoryCard
                key={cat.id}
                category={cat}
                distribution={dist}
                cards={cards}
                chapters={chapters}
                statuses={statusesByCard}
                studyPlan={plan}
                onStartReview={onStartReview}
                onOpenSettings={handleOpenSettings}
              />
            )
          })}
        </div>
      </div>
    )
  }
  
  // 艾宾浩斯模式
  if (activeMode === 'ebbinghaus') {
    return (
      <div className="plan-today-view ebbinghaus">
        <div className="mode-header">
          <h2>🔵 艾宾浩斯计划</h2>
          <p className="mode-desc">基于记忆曲线的智能复习计划</p>
        </div>
        
        <div className="today-summary">
          <div className="summary-stat large">
            <span className="stat-num due">{totalDue}</span>
            <span className="stat-desc">张卡片今日到期</span>
          </div>
        </div>
        
        <div className="category-list">
          {categories.map(cat => {
            const dist = stageDistributions.get(cat.id) || {}
            const cards = cardsByCategory.get(cat.id) || []
            const plan = studyPlans.find(p => p.categoryId === cat.id && (!p.chapterId || p.chapterId === ''))
            const chapters = chaptersByCategory?.get(cat.id) || []
            return (
              <CategoryCard
                key={cat.id}
                category={cat}
                distribution={dist}
                cards={cards}
                chapters={chapters}
                statuses={statusesByCard}
                studyPlan={plan}
                onStartReview={onStartReview}
                onOpenSettings={handleOpenSettings}
              />
            )
          })}
        </div>
      </div>
    )
  }
  
  // 进度追踪模式
  if (activeMode === 'progress') {
    return (
      <div className="plan-today-view progress">
        <div className="mode-header">
          <h2>📊 进度追踪</h2>
          <p className="mode-desc">查看您的学习进度</p>
        </div>
        
        <div className="category-list">
          {categories.map(cat => {
            const dist = stageDistributions.get(cat.id) || {}
            const cards = cardsByCategory.get(cat.id) || []
            const progress = computeCategoryProgress(cards, statusesByCard)
            return (
              <div key={cat.id} className="progress-card">
                <div className="progress-header">
                  <span className="category-name">{cat.name}</span>
                  <span className="progress-text">{progress.masteredCount}/{progress.totalCount}</span>
                </div>
                <div className="category-progress-bar large">
                  <div className="progress-fill" style={{ width: `${progress.progressPercent}%` }} />
                </div>
                <span className="progress-percent">{progress.progressPercent}%</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  
  // 薄弱模式
  if (activeMode === 'weak') {
    // 薄弱卡片来源：1. 测试中答错的卡片（wrongAnswers 表）2. cardStatus.status === 'review' 的卡片
    const weakCardIds = new Set()
    
    // 添加测试答错的卡片
    if (wrongAnswers && wrongAnswers.length > 0) {
      wrongAnswers.forEach(wa => {
        if (wa.cardId) weakCardIds.add(wa.cardId)
      })
    }
    
    // 添加 status='review' 的卡片
    statusesByCard.forEach((status, cardId) => {
      if (status && status.status === 'review') {
        weakCardIds.add(cardId)
      }
    })
    
    const weakCards = Array.from(weakCardIds).map(cardId => ({
      cardId,
      status: statusesByCard.get(cardId),
    }))
    
    return (
      <div className="plan-today-view weak">
        <div className="mode-header">
          <h2>💪 薄弱卡片</h2>
          <p className="mode-desc">需要加强复习的卡片</p>
        </div>
        
        <div className="weak-summary">
          <span className="weak-count">{weakCards.length}</span>
          <span className="weak-label">张待掌握卡片</span>
        </div>
        
        {weakCards.length > 0 && (
          <button 
            className="start-review-btn large"
            onClick={() => onStartReview(null, 'weak')}
          >
            进入薄弱复习
          </button>
        )}
      </div>
    )
  }
  
  return (
    <>
      {showSettings && (
        <PlanSettingsModal
          categoryId={settingsCategoryId}
          categoryName={settingsCategoryName}
          chapterId={settingsChapterId}
          chapterName={settingsChapterName}
          onClose={handleCloseSettings}
        />
      )}
      {null}
    </>
  )
}
