import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  getAllTestRecords,
  getAllUnfinishedTestSessions,
  deleteTestRecord,
  deleteTestSession,
  getTestRecord,
  getTestSession,
  getCategory,
  getUnit,
  getRedoHistoryByRecordId,
} from '../services/db'

// 根据类型和名称构建答题记录显示标题
// 单元检测/复习模式/错题重做：(分类名)(单元名) + 类型标签
// 分类检测：(分类名) + 类型标签
function buildRecordTitle(testType, categoryName, unitName) {
  const typeLabel = testType === 'unit' || testType === 'unit_test' ? '单元检测'
    : testType === 'category' || testType === 'category_test' ? '分类检测'
    : testType === 'review' ? '复习模式'
    : testType === 'wrong' ? '错题重做'
    : '检测'
  if (testType === 'category' || testType === 'category_test') {
    if (categoryName) return `(${String(categoryName)})${typeLabel}`
    return typeLabel
  }
  // 单元检测/复习模式/错题重做
  let title = ''
  if (categoryName) title += `(${String(categoryName)})`
  if (unitName) title += `(${String(unitName)})`
  title += typeLabel
  return title || '检测'
}

const TYPE_LABELS = {
  unit_test: '单元检测',
  category_test: '分类检测',
  review: '复习模式',
  wrong: '错题重做',
  unit: '单元检测',
  category: '分类检测',
}

const SESSION_LABELS = {
  unit: '单元检测',
  category: '分类检测',
  review: '复习模式',
  wrong: '错题重做',
}

function formatTime(seconds) {
  if (seconds == null) return '--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDate(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 计算会话已答题数：优先按 answers 字典，其次按 userAnswers 数组非空项
function countAnswered(session) {
  if (!session) return 0
  if (session.answers && typeof session.answers === 'object') {
    let n = 0
    for (const k of Object.keys(session.answers)) {
      const v = session.answers[k]
      if (v && (v.answer != null || v.answerText || v.selectedIndex != null || (Array.isArray(v.selectedIndices) && v.selectedIndices.length > 0))) {
        n += 1
      }
    }
    return n
  }
  if (Array.isArray(session.userAnswers)) {
    return session.userAnswers.filter(a => a != null).length
  }
  return 0
}

function getSessionQuestionsLength(session) {
  if (Array.isArray(session?.questions)) return session.questions.length
  return 0
}

export default function AnswerRecordPage() {
  const navigate = useNavigate()
  const { state } = useApp()
  const [records, setRecords] = useState([])
  const [unfinishedSessions, setUnfinishedSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [expandedDetail, setExpandedDetail] = useState(null)
  // 弹窗控制：null | { kind: 'session'|'record'|'redo', session, record, action: 'continue'|'restart'|'delete'|'redo' }
  const [confirmTarget, setConfirmTarget] = useState(null)
  // 单条未完成会话的展开详情
  const [expandedSessionId, setExpandedSessionId] = useState(null)
  const [expandedSession, setExpandedSession] = useState(null)
  // 每条已完成记录的重做历史（recordId -> history[]）
  const [redoHistory, setRedoHistory] = useState({})
  const [loadingHistory, setLoadingHistory] = useState({})

  const userId = state?.user?.id || state?.user?.uid || 'local_user'

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [recordsData, sessionsData] = await Promise.all([
        getAllTestRecords(),
        getAllUnfinishedTestSessions(userId),
      ])

      // 收集所有分类和单元 ID，为旧记录补齐名称
      const categoryIds = new Set()
      const unitIds = new Set()
      recordsData.forEach(r => {
        if (r.categoryId && !r.categoryName) categoryIds.add(r.categoryId)
        if (r.unitId && !r.unitName) unitIds.add(r.unitId)
      })
      sessionsData.forEach(s => {
        if (s.categoryId && !s.categoryName) categoryIds.add(s.categoryId)
        if (s.unitId && !s.unitName) unitIds.add(s.unitId)
      })

      // 并行查询名称（数量较少时直接查）
      const nameLookups = {}
      if (categoryIds.size > 0) {
        const catPromises = [...categoryIds].map(async (id) => {
          try {
            const c = await getCategory(id)
            if (c && c.name) nameLookups[`c_${id}`] = c.name
          } catch { /* 忽略 */ }
        })
        await Promise.all(catPromises)
      }
      if (unitIds.size > 0) {
        const unitPromises = [...unitIds].map(async (id) => {
          try {
            const u = await getUnit(id)
            if (u && u.name) nameLookups[`u_${id}`] = u.name
          } catch { /* 忽略 */ }
        })
        await Promise.all(unitPromises)
      }

      // 为缺少名称的记录补齐
      const enrichedRecords = recordsData.map(r => {
        if (!r.categoryName && r.categoryId && nameLookups[`c_${r.categoryId}`]) {
          r.categoryName = nameLookups[`c_${r.categoryId}`]
        }
        if (!r.unitName && r.unitId && nameLookups[`u_${r.unitId}`]) {
          r.unitName = nameLookups[`u_${r.unitId}`]
        }
        // 如果是单元检测/复习模式但没有 categoryName，尝试从 unit 对象取
        return r
      })
      const enrichedSessions = sessionsData.map(s => {
        if (!s.categoryName && s.categoryId && nameLookups[`c_${s.categoryId}`]) {
          s.categoryName = nameLookups[`c_${s.categoryId}`]
        }
        if (!s.unitName && s.unitId && nameLookups[`u_${s.unitId}`]) {
          s.unitName = nameLookups[`u_${s.unitId}`]
        }
        return s
      })

      setRecords(enrichedRecords || [])
      setUnfinishedSessions(enrichedSessions || [])
    } catch (e) {
      console.error('加载答题记录失败:', e)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { loadAll() }, [loadAll])

  // ==================== 已完成记录操作 ====================
  const handleDeleteRecord = async (id, e) => {
    e.stopPropagation()
    if (!confirm('确定删除这条答题记录吗？')) return
    try {
      await deleteTestRecord(id)
      setRecords(prev => prev.filter(r => r.id !== id))
      if (expandedId === id) {
        setExpandedId(null)
        setExpandedDetail(null)
      }
    } catch (e) {
      console.error('删除失败:', e)
    }
  }

  const handleExpandRecord = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedDetail(null)
      return
    }
    setExpandedId(id)
    try {
      const detail = await getTestRecord(id)
      setExpandedDetail(detail)
      // 异步加载该记录的重做历史
      if (!loadingHistory[id] && !redoHistory[id]) {
        setLoadingHistory(prev => ({ ...prev, [id]: true }))
        try {
          const history = await getRedoHistoryByRecordId(id)
          setRedoHistory(prev => ({ ...prev, [id]: history || [] }))
        } catch {
          setRedoHistory(prev => ({ ...prev, [id]: [] }))
        } finally {
          setLoadingHistory(prev => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        }
      }
    } catch {
      setExpandedDetail(null)
    }
  }

  // 触发"检测重做"确认弹窗（对已完成记录）
  const handleRequestRedoRecord = (record) => {
    setConfirmTarget({ kind: 'redo', record, action: 'redo' })
  }

  // 触发未完成会话的检测重做（基于该会话的 questions 快照）：
  // 目前未完成会话没有完整的 testRecords 表条目，因此直接走常规会话入口。
  // 若此 session 在 testRecords 中有对应记录，则把它当作普通记录处理。

  // 跳转到知识点浏览页
  const handleViewKnowledgePoints = (record) => {
    navigate(`/test/knowledge-points?recordId=${encodeURIComponent(record.id)}`)
  }

  // ==================== 未完成会话操作 ====================
  // 点击"继续答题" → 弹窗
  const handleContinueSession = (session) => {
    setConfirmTarget({ kind: 'session', session, action: 'continue' })
  }

  // 点击"重新开始" → 弹窗
  const handleRestartSession = (session) => {
    setConfirmTarget({ kind: 'session', session, action: 'restart' })
  }

  // 点击"删除" → 弹窗
  const handleDeleteSession = (session) => {
    setConfirmTarget({ kind: 'session', session, action: 'delete' })
  }

  // 展开查看未完成会话的题目明细
  const handleExpandSession = async (session) => {
    if (expandedSessionId === session.id) {
      setExpandedSessionId(null)
      setExpandedSession(null)
      return
    }
    setExpandedSessionId(session.id)
    try {
      const detail = await getTestSession(session.id)
      setExpandedSession(detail)
    } catch {
      setExpandedSession(null)
    }
  }

  // ==================== 弹窗确认 ====================
  const handleConfirmAction = async () => {
    if (!confirmTarget) return
    const { session, record, action } = confirmTarget
    setConfirmTarget(null)

    if (action === 'delete' && session) {
      try {
        await deleteTestSession(session.id)
        setUnfinishedSessions(prev => prev.filter(s => s.id !== session.id))
        if (expandedSessionId === session.id) {
          setExpandedSessionId(null)
          setExpandedSession(null)
        }
      } catch (e) {
        console.error('删除未完成测试失败:', e)
      }
      return
    }

    // 【重做】基于某条已完成记录的 questions 快照启动检测
    if (action === 'redo' && record) {
      const sourceType = record.type || 'unit_test'
      // 归一化：如果记录无 unitId/categoryId，使用空值，后续从快照加载
      const unitIdParam = record.unitId || ''
      const categoryIdParam = record.categoryId || ''
      const params = new URLSearchParams()
      params.set('mode', sourceType === 'category_test' ? 'category' : (sourceType === 'review' ? 'review' : 'unit'))
      params.set('redoFrom', record.id)
      if (record.redoCount && !isNaN(Number(record.redoCount))) {
        params.set('redoCount', String(Number(record.redoCount)))
      }
      if (unitIdParam) params.set('unitId', unitIdParam)
      if (categoryIdParam) params.set('categoryId', categoryIdParam)
      navigate(`/test/unit?${params.toString()}`)
      return
    }

    if ((action === 'continue' || action === 'restart') && session) {
      const testType = session.testType || 'unit'
      const params = new URLSearchParams()
      params.set('mode', testType)
      params.set('resume', action)
      const sessionUnitId = session.unitId || ''
      const sessionCategoryId = session.categoryId || ''
      if (testType === 'unit') {
        params.set('unitId', sessionUnitId || session.typeId)
      } else if (testType === 'category') {
        params.set('categoryId', sessionCategoryId || session.typeId)
      } else if (testType === 'review') {
        if (sessionUnitId) params.set('unitId', sessionUnitId)
        else if (sessionCategoryId) params.set('categoryId', sessionCategoryId)
        else if (session.typeId && session.typeId !== 'review') params.set('unitId', session.typeId)
      }
      navigate(`/test/unit?${params.toString()}`)
    }
  }

  // 取消弹窗
  const handleCancelConfirm = () => {
    setConfirmTarget(null)
  }

  const getAccuracy = (r) => {
    if (!r.totalCount || r.totalCount === 0) return '--'
    return Math.round((r.correctCount / r.totalCount) * 100) + '%'
  }

  const getScoreColor = (r) => {
    if (!r.totalCount || r.totalCount === 0) return 'var(--color-text-secondary)'
    const rate = r.correctCount / r.totalCount
    if (rate >= 0.8) return 'var(--color-success)'
    if (rate >= 0.6) return '#f59e0b'
    return 'var(--color-danger)'
  }

  // 弹窗文案
  const confirmDialogText = useMemo(() => {
    if (!confirmTarget) return null
    const { session, record, action } = confirmTarget
    if (action === 'redo' && record) {
      const label = TYPE_LABELS[record.type] || '测试'
      const dateStr = formatDate(record.createdAt)
      return {
        title: '确认重做该测试？',
        desc: `将基于本次${label}（${dateStr}）的相同题目重新答题。原始记录不会修改，新记录会被保存为一条重做记录。`,
        confirmText: '开始重做',
        confirmClass: 'btn-primary',
      }
    }
    const total = getSessionQuestionsLength(session)
    const answered = countAnswered(session)
    const label = SESSION_LABELS[session.testType] || '测试'
    if (action === 'continue') {
      return {
        title: '继续旧测试？',
        desc: `您有未完成的${label}，已答 ${answered}/${total} 题，最后保存于 ${formatDate(session.lastSavedAt)}。继续后将从上次中断处继续。`,
        confirmText: '继续旧测试',
        confirmClass: 'btn-primary',
      }
    }
    if (action === 'restart') {
      return {
        title: '继续新测试？',
        desc: `将清空${label}的答题进度并保留题库，新测试将从第1题开始，已答 ${answered}/${total} 题的旧记录将被清空，但不会影响已保存的题库。`,
        confirmText: '继续新测试',
        confirmClass: 'btn-primary',
      }
    }
    if (action === 'delete') {
      return {
        title: '删除未完成测试？',
        desc: `将永久删除该${label}的进度记录（已答 ${answered}/${total} 题），此操作不可撤销。`,
        confirmText: '删除',
        confirmClass: 'btn-danger',
      }
    }
    return null
  }, [confirmTarget])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%',
      backgroundColor: 'var(--color-bg)',
      overflow: 'hidden',
    }}>
      <div className="page-container" style={{
        flex: '1 1 auto', minHeight: 0,
        overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '20px 16px 120px', width: '100%',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{
            fontSize: 'var(--text-xl)', fontWeight: 700,
            color: 'var(--color-text)', marginBottom: '6px',
            letterSpacing: '-0.01em',
          }}>答题记录</h1>
          <p style={{
            fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
          }}>
            未完成 {unfinishedSessions.length} 条 · 已完成 {records.length} 条
          </p>
        </div>

        {loading && (
          <div className="empty-state" style={{ minHeight: '200px' }}>
            <div className="empty-state-title">加载中...</div>
          </div>
        )}

        {/* ========== 未完成测试分组 ========== */}
        {!loading && unfinishedSessions.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '12px', padding: '0 4px',
            }}>
              <div style={{
                width: '4px', height: '16px',
                backgroundColor: '#f59e0b',
                borderRadius: '2px',
              }} />
              <h2 style={{
                fontSize: 'var(--text-base)', fontWeight: 600,
                color: 'var(--color-text)', margin: 0,
              }}>未完成测试</h2>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '1px 8px', borderRadius: '999px',
                backgroundColor: '#fff7e6', color: '#b45309',
                fontSize: '11px', fontWeight: 600,
              }}>{unfinishedSessions.length}</span>
            </div>

            {unfinishedSessions.map((s) => {
              const total = getSessionQuestionsLength(s)
              const answered = countAnswered(s)
              const progress = total > 0 ? Math.round((answered / total) * 100) : 0
              const isExpanded = expandedSessionId === s.id
              const sessionDetail = isExpanded ? expandedSession : null
              const sessionLabel = buildRecordTitle(s.testType, s.categoryName, s.unitName)
              return (
                <div key={s.id} style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid #fcd9a1',
                  marginBottom: '12px',
                  overflow: 'hidden',
                }}>
                  {/* 头部：徽章 + 标题 + 进度 */}
                  <button
                    onClick={() => handleExpandSession(s)}
                    style={{
                      width: '100%', padding: '14px 16px',
                      display: 'flex', alignItems: 'center',
                      gap: '12px',
                      background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      minHeight: '44px',
                    }}
                  >
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      backgroundColor: '#fff7e6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#b45309' }}>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                          {sessionLabel}
                        </span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '1px 6px', borderRadius: '4px',
                          backgroundColor: '#fff7e6', color: '#b45309',
                          fontSize: '10px', fontWeight: 600,
                        }}>未完成</span>
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        已答 {answered}/{total} 题 · 最后保存 {formatDate(s.lastSavedAt)}
                      </div>
                      <div style={{
                        marginTop: '8px',
                        height: '4px', width: '100%',
                        backgroundColor: 'var(--color-border-light)',
                        borderRadius: '2px', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${progress}%`,
                          backgroundColor: '#f59e0b',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>

                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        color: 'var(--color-text-muted)', flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* 展开：题目概览 + 三个操作按钮 */}
                  {isExpanded && sessionDetail && (
                    <div style={{
                      padding: '0 16px 16px',
                      borderTop: '1px solid #fcd9a1',
                    }}>
                      <div style={{
                        padding: '10px 0', fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-secondary)',
                        display: 'flex', gap: '12px', flexWrap: 'wrap',
                      }}>
                        <span>用时 {formatTime(sessionDetail.elapsed || 0)}</span>
                        <span>当前第 {Math.min((sessionDetail.currentIndex || 0) + 1, total)}/{total} 题</span>
                      </div>

                      {Array.isArray(sessionDetail.questions) && sessionDetail.questions.length > 0 && (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{
                            fontSize: 'var(--text-sm)', fontWeight: 600,
                            marginBottom: '6px', color: 'var(--color-text)',
                          }}>题目预览</div>
                          {sessionDetail.questions.slice(0, 5).map((q, idx) => {
                            const isAnswered = sessionDetail.answers && sessionDetail.answers[q.id] != null
                            return (
                              <div key={q.id || idx} style={{
                                padding: '8px 12px', marginBottom: '6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: isAnswered ? 'var(--color-success-light)' : 'var(--color-bg-offset, #f5f5f5)',
                                fontSize: 'var(--text-xs)',
                                display: 'flex', gap: '6px', alignItems: 'flex-start',
                              }}>
                                <span style={{
                                  fontWeight: 600, color: isAnswered ? 'var(--color-success-dark, #15803d)' : 'var(--color-text-muted)',
                                  flexShrink: 0,
                                }}>{isAnswered ? '✓' : `${idx + 1}`}</span>
                                <span style={{ color: 'var(--color-text)', wordBreak: 'break-word' }}>
                                  {String(q.stem || q.title || '').slice(0, 60)}
                                </span>
                              </div>
                            )
                          })}
                          {sessionDetail.questions.length > 5 && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '4px' }}>
                              还有 {sessionDetail.questions.length - 5} 题…
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{
                        marginTop: '14px',
                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                      }}>
                        <button
                          onClick={() => handleRestartSession(s)}
                          className="btn btn-secondary"
                          style={{ minHeight: '44px', fontSize: 'var(--text-sm)' }}
                        >
                          继续新测试
                        </button>
                        <button
                          onClick={() => handleContinueSession(s)}
                          className="btn btn-primary"
                          style={{ minHeight: '44px', fontSize: 'var(--text-sm)' }}
                        >
                          继续答题
                        </button>
                      </div>

                      {/* 未完成会话：检测重做 / 知识点 */}
                      <div style={{
                        marginTop: '10px',
                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                      }}>
                        {/* 未完成会话无 testRecord，但仍可尝试基于已有 questions 重做 */}
                        <button
                          onClick={() => navigate(`/test/unit?mode=${encodeURIComponent(s.testType || 'unit')}${s.unitId ? '&unitId=' + encodeURIComponent(s.unitId) : ''}${s.categoryId ? '&categoryId=' + encodeURIComponent(s.categoryId) : ''}`)}
                          className="btn btn-outline"
                          style={{
                            minHeight: '44px', fontSize: 'var(--text-sm)',
                            color: 'var(--color-primary)',
                            border: '1px solid var(--color-primary)',
                            background: 'transparent',
                          }}
                        >
                          检测重做
                        </button>
                        <button
                          onClick={() => {
                            if (s.id) navigate(`/test/knowledge-points?recordId=${encodeURIComponent(s.id)}&mode=session`)
                          }}
                          className="btn btn-outline"
                          style={{
                            minHeight: '44px', fontSize: 'var(--text-sm)',
                            color: 'var(--color-primary)',
                            border: '1px solid var(--color-primary)',
                            background: 'transparent',
                          }}
                        >
                          知识点
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteSession(s)}
                        className="btn btn-ghost btn-sm"
                        style={{
                          marginTop: '10px', minHeight: '44px',
                          width: '100%', fontSize: 'var(--text-sm)',
                          color: 'var(--color-danger)',
                        }}
                      >
                        删除测试
                      </button>
                    </div>
                  )}

                  {/* 未展开状态下也显示操作按钮（避免必须先展开） */}
                  {!isExpanded && (
                    <div style={{
                      padding: '0 16px 12px',
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                    }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleContinueSession(s) }}
                        className="btn btn-primary"
                        style={{ minHeight: '44px', fontSize: 'var(--text-sm)' }}
                      >
                        继续答题
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(s) }}
                        className="btn btn-ghost"
                        style={{
                          minHeight: '44px', fontSize: 'var(--text-sm)',
                          color: 'var(--color-danger)',
                        }}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ========== 已完成记录分组 ========== */}
        {!loading && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '12px', padding: '0 4px',
            }}>
              <div style={{
                width: '4px', height: '16px',
                backgroundColor: 'var(--color-primary)',
                borderRadius: '2px',
              }} />
              <h2 style={{
                fontSize: 'var(--text-base)', fontWeight: 600,
                color: 'var(--color-text)', margin: 0,
              }}>已完成记录</h2>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '1px 8px', borderRadius: '999px',
                backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
                fontSize: '11px', fontWeight: 600,
              }}>{records.length}</span>
            </div>

            {records.length === 0 && (
              <div className="empty-state" style={{ minHeight: '200px' }}>
                <div className="empty-state-icon" style={{
                  width: '88px', height: '88px', borderRadius: '24px',
                  backgroundColor: 'var(--color-surface)',
                  border: '1.5px dashed var(--color-border)',
                }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <p className="empty-state-title">暂无答题记录</p>
                <p className="empty-state-desc">完成一次检测后自动记录</p>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '16px', minHeight: '44px' }}
                  onClick={() => navigate('/unit-test')}
                >
                  去检测
                </button>
              </div>
            )}

            {records.map((r) => {
              const isExpanded = expandedId === r.id
              const accuracy = getAccuracy(r)
              const scoreColor = getScoreColor(r)

              return (
                <div key={r.id} style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border-light)',
                  marginBottom: '12px',
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => handleExpandRecord(r.id)}
                    style={{
                      width: '100%', padding: '14px 16px',
                      display: 'flex', alignItems: 'center',
                      gap: '12px',
                      background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      minHeight: '44px',
                    }}
                  >
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      backgroundColor: r.type === 'review' ? 'var(--color-accent-light)' : 'var(--color-primary-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ color: r.type === 'review' ? 'var(--color-accent-dark)' : 'var(--color-primary-dark)' }}>
                        {r.type === 'review' ? (
                          <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                        ) : (
                          <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>
                        )}
                      </svg>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                        {buildRecordTitle(r.type, r.categoryName, r.unitName)}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {formatDate(r.createdAt)}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: scoreColor }}>
                        {accuracy}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {r.correctCount}/{r.totalCount} 正确
                      </div>
                    </div>

                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        color: 'var(--color-text-muted)', flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isExpanded && expandedDetail && (
                    <div style={{
                      padding: '0 16px 16px',
                      borderTop: '1px solid var(--color-border-light)',
                    }}>
                      <div style={{
                        display: 'flex', gap: '16px', padding: '12px 0',
                        fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
                      }}>
                        <span>用时 {formatTime(expandedDetail.timeUsed)}</span>
                        <span>得分 {expandedDetail.totalScore ?? '--'}</span>
                        {expandedDetail.parentRecordId && (
                          <span style={{ color: 'var(--color-primary)' }}>重做第 {(Number(expandedDetail.redoCount) || 0)} 次</span>
                        )}
                      </div>

                      {expandedDetail.gradingResults && expandedDetail.gradingResults.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text)' }}>
                            答题详情
                          </div>
                          {expandedDetail.gradingResults.map((gr, idx) => {
                            const q = expandedDetail.questions?.[idx] || {}
                            return (
                              <div key={idx} style={{
                                padding: '8px 12px', marginBottom: '6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: gr.isCorrect ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                                fontSize: 'var(--text-xs)',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <span style={{
                                    fontWeight: 600,
                                    color: gr.isCorrect ? 'var(--color-success)' : 'var(--color-danger)',
                                  }}>
                                    {gr.isCorrect ? '✓' : '✗'}
                                  </span>
                                  <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                                    {idx + 1}. {String(q.stem || q.front || '').slice(0, 50)}
                                  </span>
                                </div>
                                <div style={{ color: 'var(--color-text-secondary)', paddingLeft: '22px' }}>
                                  正确: {String(gr.correctAnswer || q.back || q.answer || '--')}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* 【检测重做 + 知识点 */}
                      <div style={{
                        marginTop: '16px',
                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                      }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRequestRedoRecord(expandedDetail) }}
                          className="btn btn-primary"
                          style={{ minHeight: '44px', fontSize: 'var(--text-sm)' }}
                        >
                          检测重做
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleViewKnowledgePoints(expandedDetail) }}
                          className="btn btn-secondary"
                          style={{ minHeight: '44px', fontSize: 'var(--text-sm)' }}
                        >
                          知识点
                        </button>
                      </div>

                      {/* 重做历史：若有则展示 */}
                      {redoHistory[r.id] && redoHistory[r.id].length > 0 && (
                        <div style={{ marginTop: '14px' }}>
                          <div style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            color: 'var(--color-text)',
                            marginBottom: '8px',
                          }}>
                            重做历史（{redoHistory[r.id].length}）
                          </div>
                          {redoHistory[r.id].map((rh, hIdx) => (
                            <div key={rh.id || hIdx} style={{
                              display: 'flex', alignItems: 'center',
                              padding: '8px 12px',
                              marginBottom: '6px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--color-bg-offset, #f8f8f8)',
                              fontSize: 'var(--text-xs)',
                              gap: '12px',
                            }}>
                              <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>
                                {formatDate(rh.createdAt)}
                              </span>
                              <span style={{ fontWeight: 600, color: getScoreColor(rh) }}>
                                {Math.round(((Number(rh.correctCount || 0) / (rh.totalCount || 1)) * 100) || 0)}%
                              </span>
                              <span style={{ color: 'var(--color-text-secondary)' }}>
                                {(rh.correctCount || 0)}/{rh.totalCount || 0} 正确
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRequestRedoRecord(rh) }}
                                className="btn btn-ghost btn-sm"
                                style={{ minHeight: '28px', fontSize: 'var(--text-xs)', padding: '0 8px', color: 'var(--color-primary)' }}
                              >
                                再重做
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {loadingHistory[r.id] && (
                        <div style={{
                          marginTop: '12px',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-secondary)',
                          textAlign: 'center',
                        }}>加载重做历史中…</div>
                      )}

                      <button
                        onClick={(e) => handleDeleteRecord(expandedDetail.id, e)}
                        className="btn btn-ghost btn-sm"
                        style={{
                          marginTop: '12px', minHeight: '44px',
                          color: 'var(--color-danger)', width: '100%',
                        }}
                      >
                        删除此记录
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ========== 确认弹窗 ========== */}
      {confirmTarget && confirmDialogText && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}>
          <div className="modal-center-panel" style={{ margin: '16px', maxWidth: '360px' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: '8px' }}>
              {confirmDialogText.title}
            </h3>
            <p style={{
              fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
              marginBottom: '20px', lineHeight: 1.55,
            }}>
              {confirmDialogText.desc}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleCancelConfirm}
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: '44px' }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmAction}
                className={`btn ${confirmDialogText.confirmClass}`}
                style={{ flex: 1, minHeight: '44px' }}
              >
                {confirmDialogText.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
