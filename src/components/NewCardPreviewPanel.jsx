import { useState, useEffect, Component, useMemo, useCallback } from 'react'
import { getUnitsByCategory } from '../services/db'
import MathText from './MathText'
import { checkCardsQuality, autoFixCards } from '../utils/cardQualityChecker'

/**
 * [fix-P2-6] NewCardPreviewPanel 错误边界
 * 防止 AI 返回的数据格式异常导致整个应用白屏
 */
class NewCardPreviewPanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || '卡片预览出现异常' }
  }
  componentDidCatch(error) {
    console.error('[NewCardPreviewPanel] 渲染错误:', error, error?.stack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          onClick={() => this.props.onBack && this.props.onBack()}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1001, padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
              maxWidth: '420px', width: '100%', padding: '20px',
            }}
          >
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text)', marginBottom: '12px', textAlign: 'center' }}>
              卡片预览出现异常
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
              {this.state.errorMsg || 'AI 生成的卡片数据格式异常，请返回重试。'}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => this.props.onBack && this.props.onBack()}
                style={{ minHeight: 44, padding: '8px 24px', fontSize: 'var(--text-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
              >
                返回上一步
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * 新卡片预览面板 - 三下滑栏结构
 * 
 * 第一层：章节列表（按 chapterName 分组）
 * 第二层：单元列表（按 unitName 分组）
 * 第三层：卡片列表（正面/背面可编辑）
 * 
 * Props:
 *   unitDataList     - [{ chapterName, name, cards, matchedUnitId, chapterId }]
 *   categoryId       - 分类 ID
 *   onConfirm        - 确认保存回调
 *   onBack           - 上一步回调
 *   isFirstStep      - 是否第一步
 *   pointsToUse      - 知识点数组
 *   showToast        - Toast 回调
 *   addUnitsWithMatching - 保存函数
 */
// [fix-P2-6] 用 ErrorBoundary 包裹，防止 AI 数据异常导致白屏
function NewCardPreviewPanelInner({
  unitDataList = [],
  categoryId,
  onConfirm,
  onBack,
  isFirstStep = false,
  pointsToUse = [],
  showToast,
  addUnitsWithMatching,
}) {
  const [expandedChapters, setExpandedChapters] = useState({})
  const [expandedUnits, setExpandedUnits] = useState({})
  const [editedCards, setEditedCards] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [autoFixed, setAutoFixed] = useState(false)

  const toggleChapter = (chapterName) => {
    setExpandedChapters(prev => ({
      ...prev,
      [chapterName]: !prev[chapterName],
    }))
  }

  const toggleUnit = (key) => {
    setExpandedUnits(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleCardEdit = (cardIndex, field, value) => {
    setEditedCards(prev => ({
      ...prev,
      [cardIndex]: {
        ...(prev[cardIndex] || {}),
        [field]: value,
      },
    }))
  }

  // [UX Enhancement] 一键自动修复卡片质量问题
  const handleAutoFix = useCallback(() => {
    const allCards = []
    for (const unitData of unitDataList) {
      if (unitData.cards && Array.isArray(unitData.cards)) {
        allCards.push(...unitData.cards)
      }
    }
    
    const result = autoFixCards(allCards)
    const newEditedCards = { ...editedCards }
    
    result.fixes.forEach(({ index, fixes }) => {
      const fixedCard = result.cards[index]
      if (fixedCard) {
        newEditedCards[index] = {
          ...(newEditedCards[index] || {}),
          front: fixedCard.front,
          back: fixedCard.back,
          hint: fixedCard.hint,
          explanation: fixedCard.explanation,
          options: fixedCard.options,
          type: fixedCard.type,
        }
      }
    })
    
    setEditedCards(newEditedCards)
    setAutoFixed(true)
    
    if (result.fixes.length > 0) {
      const totalFixes = result.fixes.reduce((sum, f) => sum + f.fixes.length, 0)
      showToast?.(`已自动修复 ${totalFixes} 个问题`, 'success')
    } else {
      showToast?.('没有需要修复的问题', 'info')
    }
  }, [unitDataList, editedCards, showToast])

  const getCardFront = (card, index) => {
    if (editedCards[index]?.front !== undefined) return editedCards[index].front
    return card.front || ''
  }

  const getCardBack = (card, index) => {
    if (editedCards[index]?.back !== undefined) return editedCards[index].back
    return card.back || ''
  }

  // 按章节分组
  const chapterGroups = {}
  for (const unitData of unitDataList) {
    const chName = unitData.chapterName || '未归类'
    if (!chapterGroups[chName]) {
      chapterGroups[chName] = { chapterName: chName, units: [] }
    }
    chapterGroups[chName].units.push(unitData)
  }

  // 扁平化卡片索引
  // [fix-P1-2] 修复内容匹配错乱：为每张卡片注入稳定唯一标识 _panelIdx，避免重复内容卡片编辑错乱
  // [P3-7] 使用 useMemo 避免每次渲染重建
  const cardIndexMap = useMemo(() => {
    let cardGlobalIndex = 0
    const map = []

    for (const unitData of unitDataList) {
      for (let i = 0; i < (unitData.cards || []).length; i++) {
        const panelIdx = cardGlobalIndex
        // 为原卡片对象注入稳定标识（不可变），用于渲染和保存时精确定位
        if (unitData.cards[i] && typeof unitData.cards[i] === 'object') {
          unitData.cards[i]._panelIdx = panelIdx
        }
        map.push({
          ...unitData.cards[i],
          unitName: unitData.name || '未命名单元',
          chapterName: unitData.chapterName || '未归类',
          globalIndex: panelIdx,
        })
        cardGlobalIndex++
      }
    }
    return map
  }, [unitDataList])

  // [UX Enhancement] 卡片质量报告
  const qualityReport = useMemo(() => {
    const allCards = []
    for (const unitData of unitDataList) {
      if (unitData.cards && Array.isArray(unitData.cards)) {
        allCards.push(...unitData.cards)
      }
    }
    return checkCardsQuality(allCards)
  }, [unitDataList])

  const handleConfirm = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      // 应用编辑过的卡片内容
      // [fix-P1-2] 使用 _panelIdx 稳定标识查找，替代内容匹配
      const updatedUnitDataList = unitDataList.map(unitData => ({
        ...unitData,
        cards: (unitData.cards || []).map((card) => {
          // [fix-P1-3] 过滤空卡片：front 和 back 都为空时跳过
          const frontVal = (editedCards[card._panelIdx]?.front ?? card.front ?? '').trim()
          const backVal = (editedCards[card._panelIdx]?.back ?? card.back ?? '').trim()
          if (!frontVal && !backVal) {
            return null
          }
          if (card._panelIdx !== undefined && editedCards[card._panelIdx]) {
            return {
              ...card,
              front: editedCards[card._panelIdx].front ?? card.front,
              back: editedCards[card._panelIdx].back ?? card.back,
            }
          }
          return card
        }).filter(Boolean),  // [fix-P1-3] 移除被过滤的 null 卡片
      }))

      // 获取最新 units
      const freshUnits = await getUnitsByCategory(categoryId)
      if (addUnitsWithMatching) {
        await addUnitsWithMatching(categoryId, updatedUnitDataList, freshUnits)
      }
      onConfirm()
    } catch (e) {
      showToast?.('保存失败: ' + (e?.message || '未知错误'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const totalCards = unitDataList.reduce((sum, u) => sum + (u.cards?.length || 0), 0)
  const totalChapters = Object.keys(chapterGroups).length
  const totalUnits = unitDataList.length

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1001, padding: '12px',
      boxSizing: 'border-box',
    }}>
      <div style={{
        background: 'var(--color-surface)', borderRadius: '16px',
        width: '100%', maxWidth: '440px',
        height: 'min(calc(100dvh - 24px), 800px)',
        maxHeight: 'none',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-light)', flexShrink: 0 }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            新卡片预览
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px', margin: 0 }}>
            {totalChapters} 章节 · {totalUnits} 单元 · {totalCards} 卡片
          </p>
          
          {/* [UX Enhancement] 质量评分 */}
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: qualityReport.stats.errors > 0 ? '#fef2f2' : (qualityReport.stats.warnings > 0 ? '#fffbeb' : '#f0fdf4'),
              color: qualityReport.stats.errors > 0 ? '#dc2626' : (qualityReport.stats.warnings > 0 ? '#d97706' : '#16a34a'),
            }}>
              {qualityReport.stats.errors > 0 ? `⚠️ ${qualityReport.stats.errors} 个错误` : 
               qualityReport.stats.warnings > 0 ? `⚠️ ${qualityReport.stats.warnings} 个警告` : '✓ 质量良好'}
            </div>
          </div>
          
          {/* O-8：步骤进度指示器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
            <div style={{
              flex: 1, height: '4px', borderRadius: '2px',
              backgroundColor: 'var(--color-primary)',
            }} />
            <div style={{
              flex: 1, height: '4px', borderRadius: '2px',
              backgroundColor: 'var(--color-primary)',
            }} />
            <div style={{
              flex: 1, height: '4px', borderRadius: '2px',
              backgroundColor: 'var(--color-border)',
            }} />
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '4px', whiteSpace: 'nowrap' }}>
              3/3
            </span>
          </div>
        </div>

        {/* Scrollable Content - Three Level Accordion */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '12px 14px', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {Object.values(chapterGroups).map((chapter, chIdx) => {
            const chKey = chapter.chapterName
            const isChExpanded = expandedChapters[chKey] !== false // 默认展开
            const chCardCount = chapter.units.reduce((sum, u) => sum + (u.cards?.length || 0), 0)

            return (
              <div key={chIdx} style={{
                marginBottom: '12px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: isChExpanded ? '1px solid var(--color-primary)' : '1px solid transparent',
                overflow: 'hidden',
              }}>
                {/* 第一层：章节头部 */}
                <div
                  onClick={() => toggleChapter(chKey)}
                  style={{
                    padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  <span style={{
                    fontSize: 'var(--text-sm)',
                    transition: 'transform 0.2s',
                    transform: isChExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    color: 'var(--color-text-secondary)',
                  }}>
                    ▶
                  </span>
                  <span style={{ fontSize: 'var(--text-base)' }}>📚</span>
                  <span style={{ fontWeight: 600, flex: 1, fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
                    {chapter.chapterName}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {chCardCount} 卡片 · {chapter.units.length} 单元
                  </span>
                </div>

                {/* 第二层：单元列表 */}
                {isChExpanded && (
                  <div style={{ padding: '0 12px 8px 12px' }}>
                    {chapter.units.map((unit, uIdx) => {
                      const unitKey = `${chKey}||${unit.name}`
                      const isUnitExpanded = expandedUnits[unitKey] !== false // 默认展开
                      const unitCards = unit.cards || []

                      return (
                        <div key={uIdx} style={{
                          marginBottom: '8px',
                          background: 'var(--color-surface)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                          overflow: 'hidden',
                        }}>
                          {/* 单元头部 */}
                          <div
                            onClick={() => toggleUnit(unitKey)}
                            style={{
                              padding: '8px 12px',
                              display: 'flex', alignItems: 'center', gap: '6px',
                              cursor: 'pointer',
                              minHeight: 40,
                              background: 'var(--color-primary-light)',
                            }}
                          >
                            <span style={{
                              fontSize: 'var(--text-xs)',
                              transition: 'transform 0.2s',
                              transform: isUnitExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              color: 'var(--color-primary)',
                            }}>
                              ▶
                            </span>
                            <span style={{ fontSize: 'var(--text-sm)' }}>📋</span>
                            <span style={{ fontWeight: 600, flex: 1, fontSize: 'var(--text-sm)', color: 'var(--color-primary)' }}>
                              {unit.name || '未命名单元'}
                            </span>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                              {unitCards.length} 张卡片
                            </span>
                          </div>

                          {/* 第三层：卡片列表 */}
                          {isUnitExpanded && (
                            <div style={{ padding: '0 8px 8px 8px' }}>
                              {unitCards.map((card, cIdx) => {
                                // [fix-P1-2] 使用 _panelIdx 稳定标识，替代内容匹配
                                const displayIdx = (card._panelIdx !== undefined) ? card._panelIdx : cIdx
                                
                                // [UX Enhancement] 获取当前卡片的质量问题
                                const cardQuality = qualityReport.cardResults[displayIdx]
                                const hasErrors = cardQuality && !cardQuality.valid
                                const hasWarnings = cardQuality && cardQuality.issues.some(i => i.severity === 'warning')

                                return (
                                  <div key={cIdx} style={{
                                    padding: '10px 12px',
                                    marginTop: '6px',
                                    background: hasErrors ? '#fef2f2' : (hasWarnings ? '#fffbeb' : 'var(--color-bg)'),
                                    borderRadius: 'var(--radius-sm)',
                                    border: hasErrors ? '1px solid #fecaca' : (hasWarnings ? '1px solid #fde68a' : '1px solid var(--color-border)'),
                                  }}>
                                    {/* [UX Enhancement] 质量问题提示 */}
                                    {(hasErrors || hasWarnings) && cardQuality && (
                                      <div style={{
                                        marginBottom: '8px',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        backgroundColor: hasErrors ? '#fee2e2' : '#fef3c7',
                                        fontSize: 'var(--text-xs)',
                                        color: hasErrors ? '#dc2626' : '#d97706',
                                        lineHeight: 1.4,
                                      }}>
                                        <span style={{ fontWeight: 600 }}>{hasErrors ? '⚠️ 有错误' : 'ℹ️ 有警告'}:</span>
                                        {cardQuality.issues.slice(0, 2).map((issue, idx) => (
                                          <span key={idx} style={{ marginLeft: idx > 0 ? '6px' : '4px' }}>
                                            {issue.message}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    {/* 知识点 */}
                                    {card.knowledge_point && (
                                      <div style={{
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--color-text-secondary)',
                                        marginBottom: '8px',
                                        padding: '2px 6px',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: '3px',
                                        display: 'inline-block',
                                      }}>
                                        <MathText>{card.knowledge_point}</MathText>
                                      </div>
                                    )}

                                    {/* 正面 */}
                                    <div style={{ marginBottom: '8px' }}>
                                      <div style={{
                                        fontSize: 'var(--text-xs)',
                                        fontWeight: 600,
                                        color: 'var(--color-text-secondary)',
                                        marginBottom: '4px',
                                      }}>
                                        正面（问题）
                                      </div>
                                      <textarea
                                        value={getCardFront(card, displayIdx)}
                                        onChange={(e) => handleCardEdit(displayIdx, 'front', e.target.value)}
                                        style={{
                                          width: '100%',
                                          minHeight: '44px',
                                          padding: '8px 10px',
                                          fontSize: 'var(--text-sm)',
                                          lineHeight: 1.5,
                                          color: 'var(--color-text)',
                                          background: 'var(--color-surface)',
                                          border: '1px solid var(--color-border)',
                                          borderRadius: 'var(--radius-sm)',
                                          resize: 'vertical',
                                          outline: 'none',
                                          fontFamily: 'inherit',
                                          boxSizing: 'border-box',
                                        }}
                                      />
                                    </div>

                                    {/* 背面 */}
                                    <div>
                                      <div style={{
                                        fontSize: 'var(--text-xs)',
                                        fontWeight: 600,
                                        color: 'var(--color-text-secondary)',
                                        marginBottom: '4px',
                                      }}>
                                        背面（答案）
                                      </div>
                                      <textarea
                                        value={getCardBack(card, displayIdx)}
                                        onChange={(e) => handleCardEdit(displayIdx, 'back', e.target.value)}
                                        style={{
                                          width: '100%',
                                          minHeight: '44px',
                                          padding: '8px 10px',
                                          fontSize: 'var(--text-sm)',
                                          lineHeight: 1.5,
                                          color: 'var(--color-text)',
                                          background: 'var(--color-surface)',
                                          border: '1px solid var(--color-border)',
                                          borderRadius: 'var(--radius-sm)',
                                          resize: 'vertical',
                                          outline: 'none',
                                          fontFamily: 'inherit',
                                          boxSizing: 'border-box',
                                        }}
                                      />
                                    </div>

                                    {/* 公式渲染预览区 */}
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '8px 10px',
                                      background: 'var(--color-bg-secondary)',
                                      borderRadius: 'var(--radius-sm)',
                                      border: '1px dashed var(--color-border)',
                                    }}>
                                      <div style={{
                                        fontSize: 'var(--text-xs)',
                                        fontWeight: 600,
                                        color: 'var(--color-text-secondary)',
                                        marginBottom: '4px',
                                      }}>
                                        渲染预览（含公式）
                                      </div>
                                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', lineHeight: 1.5, marginBottom: '4px' }}>
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>正面：</span>
                                        <MathText>{getCardFront(card, displayIdx)}</MathText>
                                      </div>
                                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', lineHeight: 1.5 }}>
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>背面：</span>
                                        <MathText>{getCardBack(card, displayIdx)}</MathText>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {unitDataList.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)',
            }}>
              没有可预览的卡片
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0,
          padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid var(--color-border-light)',
          display: 'flex', gap: '8px',
          background: 'var(--color-surface)',
          boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.04)',
        }}>
          {/* [UX Enhancement] 自动修复按钮 */}
          {(qualityReport.stats.errors > 0 || qualityReport.stats.warnings > 0) && !autoFixed && (
            <button
              onClick={handleAutoFix}
              disabled={isSaving}
              style={{
                flex: 1, padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #fbbf24',
                background: '#fffbeb',
                color: '#d97706',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSaving ? 'default' : 'pointer',
                minHeight: 42,
                opacity: isSaving ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              ✨ 修复
            </button>
          )}
          
          <button
            onClick={onBack}
            disabled={isSaving}
            style={{
              flex: 1, padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              fontSize: '13px',
              cursor: isSaving ? 'default' : 'pointer',
              minHeight: 42,
              opacity: isSaving ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            ← 上一步
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            style={{
              flex: 2, padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--color-primary)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isSaving ? 'default' : 'pointer',
              minHeight: 42,
              opacity: isSaving ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {isSaving ? '保存中...' : '确认保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// [fix-P2-6] 导出包裹 ErrorBoundary 的组件
export default function NewCardPreviewPanel(props) {
  return (
    <NewCardPreviewPanelErrorBoundary onBack={props.onBack}>
      <NewCardPreviewPanelInner {...props} />
    </NewCardPreviewPanelErrorBoundary>
  )
}