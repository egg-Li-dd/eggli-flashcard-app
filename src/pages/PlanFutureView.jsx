import { useState, useMemo } from 'react'
import { predictFutureDueCards } from '../utils/planCalculator'
import PlanSettingsModal from './PlanSettingsModal'

// 未来预测柱状图
function FutureBarChart({ data, dailyLimit = 50 }) {
  const maxCount = useMemo(() => {
    return Math.max(...data.map(d => d.count), 10)
  }, [data])
  
  return (
    <div className="future-bar-chart">
      {data.map(day => (
        <div key={day.dayIndex} className="bar-container">
          <div 
            className={`bar ${day.count > dailyLimit ? 'over-limit' : ''}`}
            style={{ height: `${(day.count / maxCount) * 100}%` }}
          >
            <span className="bar-value">{day.count}</span>
          </div>
          <span className="bar-label">
            {day.dayIndex === 0 ? '今天' : day.dayIndex === 1 ? '明天' : `+${day.dayIndex}`}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PlanFutureView({
  categories,
  cardsByCategory,
  chaptersByCategory,
  statusesByCard,
  studyPlans,
  futureDueCards,
  activeMode,
}) {
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsCategoryId, setSettingsCategoryId] = useState('')
  const [settingsCategoryName, setSettingsCategoryName] = useState('')
  const [settingsChapterId, setSettingsChapterId] = useState('')
  const [settingsChapterName, setSettingsChapterName] = useState('')
  const now = useMemo(() => Date.now(), [])

  // 构建章节下拉选项（所有分类的章节汇总）
  const allChapterOptions = useMemo(() => {
    const options = []
    chaptersByCategory?.forEach((chapters, categoryId) => {
      const category = categories.find(c => c.id === categoryId)
      if (!category || !chapters || chapters.length === 0) return
      chapters.forEach(ch => {
        // 统计该章节的卡片数
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

  // 计算选中章节的未来预测
  const chapterFutureDue = useMemo(() => {
    if (!selectedChapterId) return null
    const option = allChapterOptions.find(o => o.chapterId === selectedChapterId)
    if (!option || option.cards.length === 0) return null
    return predictFutureDueCards(option.cards, statusesByCard, 7, now)
  }, [selectedChapterId, allChapterOptions, statusesByCard, now])

  // 当前选中的章节信息
  const selectedChapter = useMemo(() => {
    if (!selectedChapterId) return null
    return allChapterOptions.find(o => o.chapterId === selectedChapterId)
  }, [selectedChapterId, allChapterOptions])

  // 获取章节级学习计划的上限（用于超限警告）
  const chapterDailyLimit = useMemo(() => {
    if (!selectedChapterId || !studyPlans) return 50
    const plan = studyPlans.find(p => p.chapterId === selectedChapterId)
    return plan?.dailyReviewLimit || 50
  }, [selectedChapterId, studyPlans])

  // 总览模式
  if (activeMode === 'overview') {
    return (
      <div className="plan-future-view overview">
        <div className="mode-header">
          <h2>📅 未来 7 天预测</h2>
          <p className="mode-desc">🔵 基于艾宾浩斯计划（已云端同步）</p>
        </div>

        {/* 章节筛选 */}
        {allChapterOptions.length > 0 && (
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
        )}

        {selectedChapterId && chapterFutureDue ? (
          <>
            <FutureBarChart data={chapterFutureDue} />
            <div className="future-note" style={{ padding: '0 16px', marginTop: '8px' }}>
              📖 {selectedChapter?.categoryName} / {selectedChapter?.chapterName}（{selectedChapter?.cardCount}张卡片）
            </div>
          </>
        ) : (
          <>
            <FutureBarChart data={futureDueCards} />
            <div className="future-note">
              ⚠️ 顺序/活跃/薄弱模式无长期预测功能，这些模式的数据不会同步到云端
            </div>
          </>
        )}

        {allChapterOptions.length > 0 && !selectedChapterId && (
          <div style={{ padding: '0 16px', marginTop: '12px' }}>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              💡 选择上方章节可查看该章节的独立预测
            </p>
          </div>
        )}
      </div>
    )
  }
  
  // 艾宾浩斯模式
  if (activeMode === 'ebbinghaus') {
    return (
      <div className="plan-future-view ebbinghaus">
        <div className="mode-header">
          <h2>🔵 艾宾浩斯预测</h2>
          <p className="mode-desc">未来 7 天到期卡片数量</p>
        </div>

        {/* 章节筛选 */}
        {allChapterOptions.length > 0 && (
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
        )}

        {selectedChapterId && chapterFutureDue ? (
          <>
            <FutureBarChart data={chapterFutureDue} dailyLimit={chapterDailyLimit} />
            <div className="over-limit-warning" style={{ display: chapterFutureDue.some(d => d.count > chapterDailyLimit) ? 'block' : 'none' }}>
              ⚠️ 部分日期到期卡片数超过每日上限（{chapterDailyLimit}张），建议调整计划
            </div>
            <div style={{ padding: '0 16px', marginTop: '8px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              📖 {selectedChapter?.categoryName} / {selectedChapter?.chapterName}
            </div>
          </>
        ) : (
          <>
            <FutureBarChart data={futureDueCards} dailyLimit={50} />
            <div className="over-limit-warning" style={{ display: futureDueCards.some(d => d.count > 50) ? 'block' : 'none' }}>
              ⚠️ 部分日期到期卡片数超过每日上限（50张），建议调整计划
            </div>
          </>
        )}
      </div>
    )
  }
  
  // 进度追踪模式
  if (activeMode === 'progress') {
    return (
      <div className="plan-future-view progress">
        <div className="mode-header">
          <h2>📊 预计完成时间</h2>
          <p className="mode-desc">按当前速度估算</p>
        </div>
        
        <div className="completion-estimate">
          <p>根据您的学习速度，预计还需要一段时间完成所有卡片。</p>
          <p className="note">继续每日复习即可稳步推进。</p>
        </div>
      </div>
    )
  }
  
  // 薄弱模式
  if (activeMode === 'weak') {
    return (
      <div className="plan-future-view weak">
        <div className="mode-header">
          <h2>💪 薄弱卡片趋势</h2>
          <p className="mode-desc">薄弱卡片占比变化</p>
        </div>
        
        <div className="weak-trend">
          <p>薄弱卡片占比趋势显示区域</p>
          <p className="note">持续复习薄弱卡片可逐步减少待掌握数量</p>
        </div>
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