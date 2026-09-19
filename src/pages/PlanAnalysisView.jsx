import { useState, useMemo } from 'react'
import { getStageName, getStageColor, computeCategoryStageDistribution } from '../utils/planCalculator'
import PlanSettingsModal from './PlanSettingsModal'

// 环形图组件
function DonutChart({ data, total }) {
  const colors = ['#FF6B6B', '#FFA94D', '#FFD93D', '#6BCB77', '#C0C0C0']
  const stages = ['due', 'short', 'medium', 'long', 'unstarted']
  
  let currentAngle = 0
  const segments = stages.map((stage, i) => {
    const count = data[stage] || 0
    const percent = total > 0 ? count / total : 0
    const angle = percent * 360
    const segment = {
      stage,
      count,
      percent,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: colors[i],
    }
    currentAngle += angle
    return segment
  }).filter(s => s.count > 0)
  
  return (
    <div className="donut-chart">
      <svg viewBox="0 0 100 100">
        {segments.map((seg, i) => {
          const start = polarToCartesian(50, 50, 40, seg.startAngle)
          const end = polarToCartesian(50, 50, 40, seg.endAngle)
          const largeArcFlag = seg.endAngle - seg.startAngle > 180 ? 1 : 0
          
          const d = [
            `M 50 50`,
            `L ${start.x} ${start.y}`,
            `A 40 40 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
            `Z`
          ].join(' ')
          
          return <path key={i} d={d} fill={seg.color} />
        })}
        <circle cx="50" cy="50" r="25" fill="white" />
      </svg>
      <div className="donut-center">
        <span className="donut-total">{total}</span>
        <span className="donut-label">总卡片</span>
      </div>
    </div>
  )
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = (angle - 90) * Math.PI / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

export default function PlanAnalysisView({
  categories,
  cardsByCategory,
  chaptersByCategory,
  statusesByCard,
  stageDistributions,
  activeMode,
  wrongAnswers,
}) {
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsCategoryId, setSettingsCategoryId] = useState('')
  const [settingsCategoryName, setSettingsCategoryName] = useState('')
  const [settingsChapterId, setSettingsChapterId] = useState('')
  const [settingsChapterName, setSettingsChapterName] = useState('')
  const now = useMemo(() => Date.now(), [])

  // 汇总数据
  const totalDistribution = useMemo(() => {
    const result = { due: 0, short: 0, medium: 0, long: 0, unstarted: 0, regressed: 0, total: 0 }
    stageDistributions.forEach(dist => {
      result.due += dist.due || 0
      result.short += dist.short || 0
      result.medium += dist.medium || 0
      result.long += dist.long || 0
      result.unstarted += dist.unstarted || 0
      result.regressed += dist.regressed || 0
      result.total += dist.total || 0
    })
    return result
  }, [stageDistributions])

  // 构建章节下拉选项
  const allChapterOptions = useMemo(() => {
    const options = []
    chaptersByCategory?.forEach((chapters, categoryId) => {
      const category = categories.find(c => c.id === categoryId)
      if (!category || !chapters || chapters.length === 0) return
      chapters.forEach(ch => {
        const cards = (cardsByCategory.get(categoryId) || []).filter(c => c.chapterId === ch.id)
        if (cards.length > 0) {
          options.push({
            chapterId: ch.id,
            chapterName: ch.name,
            categoryName: category.name,
            cardCount: cards.length,
            cards,
          })
        }
      })
    })
    return options
  }, [chaptersByCategory, categories, cardsByCategory])

  // 计算选中章节的阶段分布
  const chapterDistribution = useMemo(() => {
    if (!selectedChapterId) return null
    const option = allChapterOptions.find(o => o.chapterId === selectedChapterId)
    if (!option || option.cards.length === 0) return null
    return computeCategoryStageDistribution(option.cards, statusesByCard, now)
  }, [selectedChapterId, allChapterOptions, statusesByCard, now])

  const selectedChapter = useMemo(() => {
    if (!selectedChapterId) return null
    return allChapterOptions.find(o => o.chapterId === selectedChapterId)
  }, [selectedChapterId, allChapterOptions])

  // 渲染章节下拉选择器
  const renderChapterSelector = () => {
    if (allChapterOptions.length === 0) return null
    return (
      <div style={{ padding: '0 16px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select
          value={selectedChapterId}
          onChange={(e) => setSelectedChapterId(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid var(--color-border)',
            fontSize: 'var(--text-sm)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            minHeight: '44px',
          }}
        >
          <option value="">全部章节（总计）</option>
          {allChapterOptions.map(opt => (
            <option key={opt.chapterId} value={opt.chapterId}>
              {opt.categoryName} / {opt.chapterName} ({opt.cardCount}张)
            </option>
          ))}
        </select>
        {selectedChapterId && (
          <button
            onClick={() => {
              if (!chaptersByCategory) return
              let foundCategoryId = ''
              let foundCategoryName = ''
              for (const [cid, chs] of chaptersByCategory.entries()) {
                const found = chs.find(ch => ch.id === selectedChapterId)
                if (found) {
                  foundCategoryId = cid
                  const catObj = categories.find(c => c.id === cid)
                  foundCategoryName = catObj?.name || ''
                  break
                }
              }
              const opt = allChapterOptions.find(o => o.chapterId === selectedChapterId)
              setSettingsCategoryId(foundCategoryId)
              setSettingsCategoryName(foundCategoryName)
              setSettingsChapterId(selectedChapterId)
              setSettingsChapterName(opt?.chapterName || '')
              setShowSettings(true)
            }}
            style={{
              width: '44px',
              height: '44px',
              minWidth: '44px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              borderRadius: '10px',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="章节计划设置"
          >
            ⚙️
          </button>
        )}
      </div>
    )
  }

  // 渲染阶段分布图例
  const renderStageLegend = (distribution, showRegressed = false) => {
    const keys = Object.keys(distribution).filter(key => 
      key !== 'total' && (showRegressed || key !== 'regressed')
    )
    return (
      <div className="stage-legend">
        {keys.map(stage => (
          <div key={stage} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: getStageColor(stage) }} />
            <span className="legend-label">{getStageName(stage)}</span>
            <span className="legend-count">{distribution[stage]}</span>
          </div>
        ))}
      </div>
    )
  }
  
  // 总览模式
  if (activeMode === 'overview') {
    const displayDist = selectedChapterId && chapterDistribution ? chapterDistribution : totalDistribution
    return (
      <div className="plan-analysis-view overview">
        <div className="mode-header">
          <h2>📊 学习分析</h2>
        </div>

        {renderChapterSelector()}

        {selectedChapterId && chapterDistribution && (
          <div style={{ padding: '0 16px', marginBottom: '8px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            📖 {selectedChapter?.categoryName} / {selectedChapter?.chapterName}（{selectedChapter?.cardCount}张卡片）
          </div>
        )}
        
        <div className="analysis-section">
          <h3>掌握进度</h3>
          <DonutChart data={displayDist} total={displayDist.total} />
        </div>
        
        {renderStageLegend(displayDist, false)}
      </div>
    )
  }
  
  // 艾宾浩斯模式
  if (activeMode === 'ebbinghaus') {
    const displayDist = selectedChapterId && chapterDistribution ? chapterDistribution : totalDistribution
    const masteredCount = (displayDist.medium || 0) + (displayDist.long || 0)
    const masteredPercent = displayDist.total > 0 
      ? Math.round((masteredCount / displayDist.total) * 100) 
      : 0
    
    return (
      <div className="plan-analysis-view ebbinghaus">
        <div className="mode-header">
          <h2>🔵 艾宾浩斯分析</h2>
        </div>

        {renderChapterSelector()}

        {selectedChapterId && chapterDistribution && (
          <div style={{ padding: '0 16px', marginBottom: '8px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            📖 {selectedChapter?.categoryName} / {selectedChapter?.chapterName}（{selectedChapter?.cardCount}张卡片）
          </div>
        )}
        
        <div className="analysis-section">
          <h3>记忆阶段分布</h3>
          <DonutChart data={displayDist} total={displayDist.total} />
        </div>
        
        {renderStageLegend(displayDist, true)}
        
        <div className="mastery-summary">
          <span className="mastery-percent">{masteredPercent}%</span>
          <span className="mastery-label">已建立中期以上记忆</span>
        </div>
      </div>
    )
  }
  
  // 进度追踪模式
  if (activeMode === 'progress') {
    return (
      <div className="plan-analysis-view progress">
        <div className="mode-header">
          <h2>📊 进度分析</h2>
        </div>
        
        {renderChapterSelector()}

        {selectedChapterId && chapterDistribution ? (
          <div className="category-progress-list">
            <div className="progress-item">
              <div className="progress-header">
                <span className="category-name">{selectedChapter?.categoryName} / {selectedChapter?.chapterName}</span>
                <span className="progress-percent">
                  {chapterDistribution.total > 0 
                    ? Math.round(((chapterDistribution.medium || 0) + (chapterDistribution.long || 0)) / chapterDistribution.total * 100) 
                    : 0}%
                </span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ 
                  width: `${chapterDistribution.total > 0 
                    ? Math.round(((chapterDistribution.medium || 0) + (chapterDistribution.long || 0)) / chapterDistribution.total * 100) 
                    : 0}%` 
                }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="category-progress-list">
            {categories.map(cat => {
              const dist = stageDistributions.get(cat.id) || {}
              const total = dist.total || 0
              const mastered = (dist.medium || 0) + (dist.long || 0)
              const percent = total > 0 ? Math.round((mastered / total) * 100) : 0
              
              return (
                <div key={cat.id} className="progress-item">
                  <div className="progress-header">
                    <span className="category-name">{cat.name}</span>
                    <span className="progress-percent">{percent}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
  
  // 薄弱模式
  if (activeMode === 'weak') {
    // 薄弱卡片来源：1. 测试中答错的卡片（wrongAnswers 表）2. cardStatus.status === 'review' 的卡片
    const weakCardIds = new Set()
    
    if (wrongAnswers && wrongAnswers.length > 0) {
      wrongAnswers.forEach(wa => {
        if (wa.cardId) weakCardIds.add(wa.cardId)
      })
    }
    
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
      <div className="plan-analysis-view weak">
        <div className="mode-header">
          <h2>💪 薄弱分析</h2>
        </div>
        
        <div className="weak-summary">
          <span className="weak-count">{weakCards.length}</span>
          <span className="weak-label">张薄弱卡片待加强</span>
        </div>
        
        <p className="weak-tip">持续在薄弱模式下复习这些卡片，逐步提升掌握程度。</p>
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
          onClose={() => setShowSettings(false)}
        />
      )}
      {null}
    </>
  )
}