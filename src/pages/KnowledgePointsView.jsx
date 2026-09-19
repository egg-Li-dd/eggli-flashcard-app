import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getKnowledgePointsByRecordId } from '../services/db'

function formatDate(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getTypeLabel(type) {
  if (type === 'unit' || type === 'unit_test') return '单元检测'
  if (type === 'category' || type === 'category_test') return '分类检测'
  if (type === 'review') return '复习模式'
  if (type === 'wrong') return '错题重做'
  return '测试'
}

export default function KnowledgePointsView() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const recordId = searchParams.get('recordId') || ''

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [data, setData] = useState(null)
  const [recordMeta, setRecordMeta] = useState({ type: '', categoryName: '', unitName: '', createdAt: 0 })

  const [selectedChapters, setSelectedChapters] = useState(new Set())
  const [selectedUnits, setSelectedUnits] = useState(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [expandedChapters, setExpandedChapters] = useState(new Set())
  const [expandedUnits, setExpandedUnits] = useState(new Set())

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setErrorMsg('')
      try {
        if (!recordId) {
          setErrorMsg('缺少记录参数，无法加载知识点')
          setLoading(false)
          return
        }
        const result = await getKnowledgePointsByRecordId(recordId)
        if (!result || !result.chapters || result.chapters.length === 0) {
          setData(null)
          if (alive) setLoading(false)
          return
        }
        const r = result.record
        if (r) {
          setRecordMeta({
            type: r.type || '',
            categoryName: r.categoryName || '',
            unitName: r.unitName || '',
            createdAt: r.createdAt || 0,
          })
        }
        const chSet = new Set()
        const unSet = new Set()
        for (const ch of result.chapters) {
          const chKey = ch.chapter?.id || '__no_chapter__'
          chSet.add(chKey)
          for (const u of ch.units) {
            const unitId = u.unit?.id || '__no_unit__'
            unSet.add(unitId)
          }
        }
        setSelectedChapters(chSet)
        setSelectedUnits(unSet)
        setExpandedChapters(chSet)
        setExpandedUnits(unSet)
        setData(result)
      } catch (e) {
        console.error('加载知识点失败:', e)
        setErrorMsg('加载失败，请重试')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [recordId])

  const unitsByChapter = useMemo(() => {
    if (!data?.chapters) return {}
    const map = {}
    data.chapters.forEach((ch) => {
      const chKey = ch.chapter?.id || '__no_chapter__'
      map[chKey] = ch.units.map((u) => u.unit?.id || '__no_unit__')
    })
    return map
  }, [data])

  const filteredData = useMemo(() => {
    if (!data?.chapters) return []
    return data.chapters
      .filter((ch) => selectedChapters.has(ch.chapter?.id || '__no_chapter__'))
      .map((ch) => ({
        ...ch,
        units: ch.units.filter((u) => selectedUnits.has(u.unit?.id || '__no_unit__')),
      }))
      .filter((ch) => ch.units.length > 0)
  }, [data, selectedChapters, selectedUnits])

  const statsText = useMemo(() => {
    if (!data?.meta) return ''
    const { chapterCount, unitCount, kpCount } = data.meta
    return `${chapterCount} 章节 / ${unitCount} 单元 / ${kpCount} 知识点`
  }, [data])

  const toggleChapterInFilter = (chKey) => {
    const wasSelected = selectedChapters.has(chKey)
    const nextCh = new Set(selectedChapters)
    const nextUn = new Set(selectedUnits)
    if (wasSelected) {
      nextCh.delete(chKey)
      const unitIds = unitsByChapter[chKey] || []
      for (const u of unitIds) nextUn.delete(u)
    } else {
      nextCh.add(chKey)
      const unitIds = unitsByChapter[chKey] || []
      for (const u of unitIds) nextUn.add(u)
    }
    setSelectedChapters(nextCh)
    setSelectedUnits(nextUn)
  }

  const toggleUnitInFilter = (uKey) => {
    const next = new Set(selectedUnits)
    if (next.has(uKey)) next.delete(uKey)
    else next.add(uKey)
    setSelectedUnits(next)
  }

  const toggleChapter = (chKey) => {
    const next = new Set(expandedChapters)
    if (next.has(chKey)) next.delete(chKey)
    else next.add(chKey)
    setExpandedChapters(next)
  }

  const toggleUnit = (uKey) => {
    const next = new Set(expandedUnits)
    if (next.has(uKey)) next.delete(uKey)
    else next.add(uKey)
    setExpandedUnits(next)
  }

  const allChapterKeys = useMemo(() => {
    if (!data?.chapters) return []
    return data.chapters.map((ch) => ch.chapter?.id || '__no_chapter__')
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: 'var(--color-bg)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '14px 16px',
        borderBottom: '1px solid var(--color-border-light)',
      }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="返回"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px', marginLeft: '-8px',
            minWidth: '44px', minHeight: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--color-text)' }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>知识点</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {recordMeta.categoryName || recordMeta.unitName
              ? `${getTypeLabel(recordMeta.type)} · ${recordMeta.categoryName}${recordMeta.unitName ? ' / ' + recordMeta.unitName : ''}`
              : getTypeLabel(recordMeta.type) || '答题记录'}
          </div>
        </div>
        <button
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="筛选章节和单元"
          style={{
            background: filterOpen ? 'var(--color-primary-light)' : 'transparent',
            border: '1px solid var(--color-border-light)',
            borderRadius: '10px',
            minWidth: '44px', minHeight: '44px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--color-primary)' }}>
            <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
          </svg>
        </button>
      </div>

      <div style={{
        flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
        padding: '16px 16px 120px',
      }}>
        <div style={{
          padding: '12px 14px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-light)',
          borderRadius: 'var(--radius-lg)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
          marginBottom: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>答题时间 {formatDate(recordMeta.createdAt)}</span>
            <span>{statsText}</span>
          </div>
        </div>

        {loading && (
          <div className="empty-state" style={{ minHeight: '200px' }}>
            <div className="empty-state-title">加载中…</div>
          </div>
        )}

        {!loading && errorMsg && (
          <div className="empty-state" style={{ minHeight: '200px' }}>
            <div className="empty-state-title">{errorMsg}</div>
          </div>
        )}

        {!loading && !errorMsg && (!filteredData || filteredData.length === 0) && (
          <div className="empty-state" style={{ minHeight: '240px' }}>
            <div className="empty-state-icon" style={{
              width: '88px', height: '88px', borderRadius: '24px',
              backgroundColor: 'var(--color-surface)',
              border: '1.5px dashed var(--color-border)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--color-text-muted)' }}>
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <p className="empty-state-title">暂无知识点</p>
            <p className="empty-state-desc">本次测试涉及的题目可能暂未关联知识点或未命中卡片</p>
          </div>
        )}

        {!loading && !errorMsg && filteredData && filteredData.length > 0 && (
          <div>
            {filteredData.map((ch) => {
              const chKey = ch.chapter?.id || '__no_chapter__'
              const chExpanded = expandedChapters.has(chKey)
              return (
                <div key={chKey} style={{ marginBottom: '10px' }}>
                  <button
                    onClick={() => toggleChapter(chKey)}
                    style={{
                      width: '100%', padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: 'var(--radius-lg)',
                      cursor: 'pointer', textAlign: 'left',
                      minHeight: '48px',
                    }}
                  >
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      backgroundColor: 'var(--color-primary-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '14px', color: 'var(--color-primary-dark)', fontWeight: 700 }}>{ch.units.length}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                        {ch.chapter?.name || '未分类章节'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {ch.units.length} 个单元 · {ch.units.reduce((acc, u) => acc + (u.kps?.length || 0), 0)} 个知识点
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: chExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {chExpanded && (
                    <div style={{
                      marginTop: '6px', marginLeft: '14px',
                      borderLeft: '2px solid var(--color-border-light)',
                      paddingLeft: '10px',
                    }}>
                      {ch.units.map((u) => {
                        const uKey = u.unit?.id || '__no_unit__'
                        const uExpanded = expandedUnits.has(uKey)
                        const kps = u.kps || []
                        const totalQ = kps.reduce((acc, k) => acc + (Number(k.total) || 0), 0)
                        const totalCorrect = kps.reduce((acc, k) => acc + (Number(k.correct) || 0), 0)
                        const ratePct = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0
                        return (
                          <div key={uKey} style={{ marginBottom: '8px' }}>
                            <button
                              onClick={() => toggleUnit(uKey)}
                              style={{
                                width: '100%', padding: '10px 12px',
                                display: 'flex', alignItems: 'center', gap: '10px',
                                background: 'transparent',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '8px',
                                cursor: 'pointer', textAlign: 'left',
                                minHeight: '44px',
                              }}
                            >
                              <div style={{
                                width: '24px', height: '24px', borderRadius: '6px',
                                backgroundColor: 'var(--color-accent-light)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                <span style={{ fontSize: '12px', color: 'var(--color-accent-dark)', fontWeight: 600 }}>{kps.length}</span>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>
                                  {u.unit?.name || '未分类单元'}
                                </div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                  {kps.length} 个知识点 · 正确率 {ratePct}%
                                </div>
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: uExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>

                            {uExpanded && (
                              <div style={{ marginTop: '6px', marginLeft: '6px' }}>
                                {kps.length === 0 && (
                                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', padding: '8px 12px' }}>
                                    暂无知识点
                                  </div>
                                )}
                                {kps.map((kp, kIdx) => {
                                  const t = Number(kp.total) || 0
                                  const c = Number(kp.correct) || 0
                                  const r = t > 0 ? Math.round((c / t) * 100) : 0
                                  let color = 'var(--color-success)'
                                  if (r < 80 && r >= 60) color = '#f59e0b'
                                  else if (r < 60) color = 'var(--color-danger)'
                                  return (
                                    <div key={kp.cardId || kIdx} style={{
                                      padding: '10px 12px',
                                      marginBottom: '6px',
                                      backgroundColor: 'var(--color-bg-offset, #f8f8f8)',
                                      border: '1px solid var(--color-border-light)',
                                      borderRadius: '6px',
                                      fontSize: 'var(--text-sm)',
                                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                                    }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                          fontSize: 'var(--text-sm)',
                                          fontWeight: 600,
                                          color: 'var(--color-text)',
                                          wordBreak: 'break-word',
                                          whiteSpace: 'pre-wrap',
                                        }}>{kp.text || '未设置知识点'}</div>
                                        {kp.front && (
                                          <div style={{
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--color-text-secondary)',
                                            marginTop: '4px',
                                            wordBreak: 'break-word',
                                          }}>题干示例：{kp.front}</div>
                                        )}
                                      </div>
                                      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '70px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color }}>{r}%</div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{c}/{t}</div>
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
          </div>
        )}
      </div>

      {filterOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          backgroundColor: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'flex-end',
        }} onClick={() => setFilterOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '80vh',
              backgroundColor: 'var(--color-surface)',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 -10px 30px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{
              padding: '14px 16px 8px',
              display: 'flex', alignItems: 'center', gap: '8px',
              borderBottom: '1px solid var(--color-border-light)',
            }}>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
                筛选章节 / 单元
              </div>
              <button
                onClick={() => {
                  const allCh = new Set(allChapterKeys)
                  const allUn = new Set()
                  for (const k of Object.keys(unitsByChapter)) for (const u of unitsByChapter[k]) allUn.add(u)
                  setSelectedChapters(allCh)
                  setSelectedUnits(allUn)
                }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 'var(--text-xs)', minHeight: '36px', color: 'var(--color-primary)' }}
              >全选</button>
              <button
                onClick={() => { setSelectedChapters(new Set()); setSelectedUnits(new Set()) }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 'var(--text-xs)', minHeight: '36px', color: 'var(--color-danger)' }}
              >清空</button>
              <button
                onClick={() => setFilterOpen(false)}
                className="btn btn-primary btn-sm"
                style={{ fontSize: 'var(--text-xs)', minHeight: '36px' }}
              >完成</button>
            </div>
            <div style={{ padding: '8px 16px 24px', overflowY: 'auto', maxHeight: '70vh' }}>
              {(!data?.chapters || data.chapters.length === 0) && (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '30px 0' }}>
                  暂无可筛选内容
                </div>
              )}
              {data?.chapters?.map((ch, idx) => {
                const chKey = ch.chapter?.id || '__no_chapter__'
                const checked = selectedChapters.has(chKey)
                return (
                  <div key={chKey} style={{ marginBottom: idx === data.chapters.length - 1 ? 0 : '10px' }}>
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px',
                      backgroundColor: 'var(--color-bg-offset, #f8f8f8)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: '10px',
                      cursor: 'pointer', minHeight: '44px',
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChapterInFilter(chKey)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                          {ch.chapter?.name || '未分类章节'}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {ch.units.length} 个单元
                        </div>
                      </div>
                    </label>
                    <div style={{ marginTop: '6px', marginLeft: '16px' }}>
                      {ch.units.map((u) => {
                        const uKey = u.unit?.id || '__no_unit__'
                        const uChecked = selectedUnits.has(uKey)
                        return (
                          <label key={uKey} style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 12px', marginBottom: '6px',
                            cursor: 'pointer', minHeight: '40px',
                          }}>
                            <input
                              type="checkbox"
                              checked={uChecked}
                              onChange={() => toggleUnitInFilter(uKey)}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', flex: 1, minWidth: 0 }}>
                              {u.unit?.name || '未分类单元'}
                            </span>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                              {u.kps?.length || 0} 知识点
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
