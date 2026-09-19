import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBackgroundTask, TASK_TYPE } from '../context/BackgroundTaskContext'
import { useApp } from '../context/AppContext'
import {
  runLinkGeneration,
  analyzeCurrentLinkDistribution,
  analyzeCombinedDistribution,
  LINK_STRENGTH_LEVELS,
  LINK_QUESTION_TYPES,
  LINK_DIFFICULTY_LEVELS,
} from '../services/linkQuestionGeneration'
import {
  getCategories,
  getUnitsByCategory,
  getChaptersByCategory,
  getTestQuestionsByCategory,
  updateTestQuestion,
  getLinkGenerationRunsByCategory,
  deleteLinkGenerationRun,
} from '../services/db'
import { isStrongModel } from '../services/testQuestionService'
import QuestionDistributionView from '../components/QuestionDistributionView'
import GenerationFlowReport from '../components/GenerationFlowReport'

const STORAGE_KEY = 'link_question_bank_prefs_v1'
const DIFF_LABEL = { 1: '简易', 2: '中等', 3: '困难' }

const BackArrow = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

/**
 * 联结题库主界面
 * - 选择分类；持久化上次选择
 * - 单元/章节两种联结模式
 * - 联结强度、目标难度配置
 * - 目标分布矩阵、当前整体分布矩阵可视化
 * - 后台任务（悬浮按钮）出题，出错自动重试 2 次
 * - 生成流程报告 + 题目可标记为"待人工审核 / 已审核"
 * - 历史记录 Tab：展示本分类下历次出题的批次信息
 */

function loadPrefs() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return null
    return JSON.parse(raw)
  } catch (_) { return null }
}

function savePrefs(prefs) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    }
  } catch (_) { /* ignore */ }
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function LinkQuestionBank() {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const { startTask } = useBackgroundTask()

  const prefs = useMemo(() => loadPrefs(), [])

  // 分类
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(prefs?.categoryId || '')

  // 联结模式：'unit' 或 'chapter'
  const [linkMode, setLinkMode] = useState(prefs?.linkMode || 'unit')

  // 单元/章节列表
  const [units, setUnits] = useState([])
  const [chapters, setChapters] = useState([])

  // 选中项（单元 id 或章节 id）—— 从 localStorage 恢复（如果仍存在）
  const [selectedIds, setSelectedIds] = useState(() => {
    if (prefs?.selectedIds && Array.isArray(prefs.selectedIds)) return new Set(prefs.selectedIds)
    return new Set()
  })

  // 联结强度 / 难度 / 题量配置（升级版：支持多题型与多难度选择）
  const [linkStrength, setLinkStrength] = useState(prefs?.linkStrength || 'medium')
  const [difficulty, setDifficulty] = useState(prefs?.difficulty ?? null)
  const [targetPerCell, setTargetPerCell] = useState(prefs?.targetPerCell ?? 3)
  const [selectedTypes, setSelectedTypes] = useState(Array.isArray(prefs?.selectedTypes) && prefs.selectedTypes.length > 0
    ? new Set(prefs.selectedTypes)
    : new Set(LINK_QUESTION_TYPES.map(t => t.value)))
  const [selectedDifficulties, setSelectedDifficulties] = useState(Array.isArray(prefs?.selectedDifficulties) && prefs.selectedDifficulties.length > 0
    ? new Set(prefs.selectedDifficulties)
    : new Set([1, 2, 3]))
  const [similarityThreshold, setSimilarityThreshold] = useState(Number(prefs?.similarityThreshold ?? 0.7))

  const [isGenerating, setIsGenerating] = useState(false)
  const [lastFlowReport, setLastFlowReport] = useState(null)
  const [lastStats, setLastStats] = useState(null)

  // 视图切换：'generate' / 'history'
  const [tab, setTab] = useState('generate')

  // 当前已有分布
  const [currentDistribution, setCurrentDistribution] = useState(null)
  // 已选单元的整体分布（用于"已选范围现有覆盖度"提示）
  const [combinedDistribution, setCombinedDistribution] = useState(null)

  // 待审核题目列表
  const [pendingQuestions, setPendingQuestions] = useState([])

  // 历史记录
  const [historyRuns, setHistoryRuns] = useState([])

  // 加载分类
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  // 选择分类后加载单元/章节
  useEffect(() => {
    if (!selectedCategoryId) {
      setUnits([])
      setChapters([])
      setSelectedIds(new Set())
      setCurrentDistribution(null)
      setCombinedDistribution(null)
      setPendingQuestions([])
      setHistoryRuns([])
      return
    }
    getUnitsByCategory(selectedCategoryId).then(setUnits).catch(() => {})
    getChaptersByCategory(selectedCategoryId).then((chs) => {
      const normalized = Array.isArray(chs)
        ? chs.map((c, i) => ({ id: c.id || `ch_${i}`, name: c.name || `章节 ${i + 1}`, ...c }))
        : []
      setChapters(normalized)
    }).catch(() => {})

    analyzeCurrentLinkDistribution(selectedCategoryId)
      .then(setCurrentDistribution)
      .catch(() => {})

    // 待审核题目
    getTestQuestionsByCategory(selectedCategoryId)
      .then((qs) => qs.filter(q => q.testType === 'link_test' && q.pendingReview === true))
      .then(setPendingQuestions)
      .catch(() => {})

    // 历史记录
    getLinkGenerationRunsByCategory(selectedCategoryId)
      .then(runs => runs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
      .then(setHistoryRuns)
      .catch(() => {})
  }, [selectedCategoryId])

  // 持久化选项
  useEffect(() => {
    savePrefs({
      categoryId: selectedCategoryId,
      linkMode,
      selectedIds: Array.from(selectedIds),
      linkStrength,
      difficulty,
      targetPerCell,
    })
  }, [selectedCategoryId, linkMode, selectedIds, linkStrength, difficulty, targetPerCell])

  // 选中项变化时 → 重新计算已选范围的整体分布
  useEffect(() => {
    if (!selectedCategoryId) return
    analyzeCombinedDistribution(selectedCategoryId, Array.from(selectedIds))
      .then(setCombinedDistribution)
      .catch(() => {})
  }, [selectedCategoryId, selectedIds])

  const availableItems = linkMode === 'unit' ? units : chapters

  // 目标分布计算：基于配置 (题型 × 难度 × targetPerCell) （升级版：支持多选题型 / 难度）
  const targetDistribution = useMemo(() => {
    const types = selectedTypes.size > 0 ? LINK_QUESTION_TYPES.filter(t => selectedTypes.has(t.value)).map(t => t.value) : LINK_QUESTION_TYPES.map(t => t.value)
    const difficulties = selectedDifficulties.size > 0 ? Array.from(selectedDifficulties).map(Number).sort() : [1, 2, 3]
    const matrix = {}
    for (const t of types) for (const d of difficulties) matrix[`${t}_${d}`] = targetPerCell
    const byType = types.map(t => ({ type: t, count: difficulties.length * targetPerCell }))
    const byDifficulty = difficulties.map(d => ({ difficulty: d, count: types.length * targetPerCell }))
    return { byType, byDifficulty, matrix, total: types.length * difficulties.length * targetPerCell, types, difficulties }
  }, [selectedTypes, selectedDifficulties, targetPerCell])

  const toggleSelect = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectAll = () => {
    const allIds = availableItems.map(i => i.id)
    if (allIds.every(id => selectedIds.has(id))) setSelectedIds(new Set())
    else setSelectedIds(new Set(allIds))
  }

  const handleGenerate = async () => {
    if (!selectedCategoryId) { showToast('请先选择分类', 'error'); return }
    if (selectedIds.size < 2) { showToast('请至少选择 2 个项目（单元或章节）', 'error'); return }
    if (selectedTypes.size === 0) { showToast('请至少选择 1 种题型', 'error'); return }
    if (selectedDifficulties.size === 0) { showToast('请至少选择 1 个难度', 'error'); return }

    let config = {}
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('aiConfig') : null
      config = raw ? JSON.parse(raw) : {}
    } catch (_) { config = {} }

    if (!isStrongModel(config)) {
      showToast('当前 AI 不是强模型，联结题库需要强模型支持。请在设置中切换为 DeepSeek / 星火 Pro+ / 火山引擎 / 千问。', 'error')
      return
    }

    setIsGenerating(true)

    const taskType = TASK_TYPE.QUESTION_BANK_UPDATE
    const idsArray = Array.from(selectedIds)
    const explicitTypes = Array.from(selectedTypes)
    const explicitDifficulties = Array.from(selectedDifficulties).map(Number)

    startTask({
      type: taskType,
      title: `${linkMode === 'unit' ? '单元' : '章节'}联结出题（${selectedIds.size}个）`,
      cancelable: true,
      taskFn: async (updateProgress, isCancelled) => {
        try {
          const result = await runLinkGeneration({
            mode: linkMode,
            ids: idsArray,
            categoryId: selectedCategoryId,
            difficulty: null,
            linkStrength,
            config,
            targetPerCell,
            explicitTypes,
            explicitDifficulties,
            similarityThreshold,
            onProgress: (progress, detail) => { updateProgress(progress, detail) },
            isCancelled,
          })

          setLastFlowReport(result.flowReport)
          setLastStats({
            totalGenerated: result.totalGenerated,
            totalTarget: result.totalTarget,
            totalExisting: result.totalExisting,
            similarityThreshold: result.similarityThreshold,
            dupVsExistingExact: result.quality?.dupVsExistingExact,
            dupVsExistingSimilar: result.quality?.dupVsExistingSimilar,
            dupVsExistingTotal: result.quality?.dupVsExistingTotal,
            duplicateRate: result.quality?.duplicateRate,
            stats: result.stats,
            quality: result.quality,
            coverage: result.coverage,
          })

          const fresh = await analyzeCurrentLinkDistribution(selectedCategoryId)
          setCurrentDistribution(fresh)
          const combined = await analyzeCombinedDistribution(selectedCategoryId, Array.from(selectedIds))
          setCombinedDistribution(combined)

          const qs = await getTestQuestionsByCategory(selectedCategoryId)
          setPendingQuestions(qs.filter(q => q.testType === 'link_test' && q.pendingReview === true))
          const runs = await getLinkGenerationRunsByCategory(selectedCategoryId)
          setHistoryRuns(runs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))

          showToast(`成功生成 ${result.totalGenerated} 道题目`, 'success')
          return { success: true, generated: result.totalGenerated }
        } catch (err) {
          showToast('生成失败：' + (err?.message || err || '未知错误'), 'error')
          throw err
        }
      },
    })

    setIsGenerating(false)
  }

  const handleToggleReview = async (q) => {
    try {
      const next = !(q.pendingReview === true)
      await updateTestQuestion(q.id, { pendingReview: next, reviewedAt: next ? Date.now() : null })
      // 更新本地 state
      setPendingQuestions(prev => {
        if (next) return [...prev.filter(x => x.id !== q.id), { ...q, pendingReview: next }]
        return prev.filter(x => x.id !== q.id)
      })
      showToast(next ? '已标记为「待人工审核」' : '已标记为「已审核」', 'success')
    } catch (err) {
      showToast('操作失败：' + (err?.message || err || ''), 'error')
    }
  }

  const handleDeleteRun = async (run) => {
    if (!confirm('确定删除该历史记录？题目本身保留')) return
    try {
      await deleteLinkGenerationRun(run.id)
      const fresh = await getLinkGenerationRunsByCategory(selectedCategoryId)
      setHistoryRuns(fresh.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
      showToast('已删除历史记录', 'success')
    } catch (err) {
      showToast('删除失败：' + (err?.message || err || ''), 'error')
    }
  }

  // 预览题目摘要
  const renderQuestionSummary = (q) => {
    const stem = String(q.stem || '').slice(0, 80)
    const typeLabel = LINK_QUESTION_TYPES.find(t => t.value === q.type)?.label || q.type
    const diffLabel = DIFF_LABEL[Number(q.difficulty)] || `${q.difficulty}`
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--color-text)' }}>[{typeLabel} · {diffLabel}]</strong>
        {stem || '（无题干）'}
      </div>
    )
  }

  return (
    <div className="page-animate-in" style={{
      height: '100vh', height: '100dvh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg)',
    }}>
      <div className="app-header">
        <div className="app-header-inner">
          <button className="settings-back-btn" onClick={() => navigate('/test/question-bank')}>
            <BackArrow />
          </button>
          <span className="app-title" style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>联结题库</span>
          <span style={{ width: 48 }} />
        </div>
      </div>

      {/* Tab 切换 */}
      <div style={{
        display: 'flex', background: 'var(--color-bg-offset)', padding: 4,
        margin: '8px 16px 0', borderRadius: 8,
      }}>
        <button
          onClick={() => setTab('generate')}
          style={{
            flex: 1, padding: '10px 12px', fontSize: 13, fontWeight: 600,
            background: tab === 'generate' ? 'var(--color-bg-card)' : 'transparent',
            color: tab === 'generate' ? 'var(--color-text)' : 'var(--color-text-secondary)',
            border: 'none', borderRadius: 6, cursor: 'pointer', minHeight: 40,
          }}
        >
          🧠 出题配置
        </button>
        <button
          onClick={() => setTab('history')}
          style={{
            flex: 1, padding: '10px 12px', fontSize: 13, fontWeight: 600,
            background: tab === 'history' ? 'var(--color-bg-card)' : 'transparent',
            color: tab === 'history' ? 'var(--color-text)' : 'var(--color-text-secondary)',
            border: 'none', borderRadius: 6, cursor: 'pointer', minHeight: 40,
            position: 'relative',
          }}
        >
          📜 历史记录 {historyRuns.length > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 11,
              color: '#fff', background: 'var(--color-primary)',
              padding: '1px 6px', borderRadius: 10, fontWeight: 700,
            }}>{historyRuns.length}</span>
          )}
        </button>
        {pendingQuestions.length > 0 && (
          <button
            onClick={() => setTab('pending')}
            style={{
              flex: 1, padding: '10px 12px', fontSize: 13, fontWeight: 600,
              background: tab === 'pending' ? 'var(--color-bg-card)' : 'transparent',
              color: tab === 'pending' ? 'var(--color-text)' : 'var(--color-text-secondary)',
              border: 'none', borderRadius: 6, cursor: 'pointer', minHeight: 40,
            }}
          >
            ⚠ 待审核 ({pendingQuestions.length})
          </button>
        )}
      </div>

      {tab === 'generate' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* 1. 选择分类 */}
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
              1. 选择分类
            </div>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 6,
                border: '1px solid var(--color-border-light)', background: 'var(--color-bg-card)',
                color: 'var(--color-text)', minHeight: 44,
              }}
            >
              <option value="">-- 请选择分类 --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedCategoryId && (
            <>
              {/* 2. 联结模式切换 */}
              <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
                  2. 选择联结模式
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setLinkMode('unit')}
                    className="btn"
                    style={{
                      flex: 1, fontSize: 13, minHeight: 44,
                      background: linkMode === 'unit' ? 'var(--color-primary)' : 'var(--color-bg-offset)',
                      color: linkMode === 'unit' ? '#fff' : 'var(--color-text)',
                      border: 'none',
                    }}
                  >
                    单元联结
                  </button>
                  <button
                    onClick={() => setLinkMode('chapter')}
                    className="btn"
                    style={{
                      flex: 1, fontSize: 13, minHeight: 44,
                      background: linkMode === 'chapter' ? 'var(--color-primary)' : 'var(--color-bg-offset)',
                      color: linkMode === 'chapter' ? '#fff' : 'var(--color-text)',
                      border: 'none',
                    }}
                  >
                    章节联结
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                  {linkMode === 'unit'
                    ? '选择两个以上的单元，将它们内部的知识点进行跨单元关联出题'
                    : '选择两个以上的章节，将它们所属单元的知识点进行跨章节关联出题'}
                </div>
              </div>

              {/* 3. 选择具体的单元/章节 */}
              {availableItems.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                      3. 选择 {linkMode === 'unit' ? '单元' : '章节'}（至少 2 个）
                    </div>
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 12, minHeight: 32 }}
                      onClick={selectAll}
                    >
                      全选/取消
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {availableItems.map((item) => {
                      const id = item.id
                      const checked = selectedIds.has(id)
                      return (
                        <div
                          key={id}
                          onClick={() => toggleSelect(id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 6,
                            border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border-light)'}`,
                            background: checked ? 'var(--color-primary)10' : 'var(--color-bg-card)',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: 'var(--color-text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'all 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }}
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name || '(未命名)'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                    已选择 <strong style={{ color: 'var(--color-primary)' }}>{selectedIds.size}</strong> 个{linkMode === 'unit' ? '单元' : '章节'}
                  </div>
                </div>
              )}

              {/* 4. 出题配置（升级版：多选题型 + 多选难度 + 去重阈值） */}
              <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
                  4. 出题配置
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>联结强度</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {LINK_STRENGTH_LEVELS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setLinkStrength(s.value)}
                        className="btn btn-sm"
                        style={{
                          flex: 1, fontSize: 12, minHeight: 40,
                          background: linkStrength === s.value ? 'var(--color-primary)' : 'var(--color-bg-offset)',
                          color: linkStrength === s.value ? '#fff' : 'var(--color-text)',
                          border: 'none',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                    {LINK_STRENGTH_LEVELS.find(s => s.value === linkStrength)?.description || ''}
                  </div>
                </div>

                {/* 题型多选 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                    题型（可多选，已选 <strong style={{ color: 'var(--color-primary)' }}>{selectedTypes.size}</strong> 种）
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {LINK_QUESTION_TYPES.map(t => {
                      const isOn = selectedTypes.has(t.value)
                      return (
                        <button
                          key={t.value}
                          onClick={() => {
                            const next = new Set(selectedTypes)
                            if (isOn) next.delete(t.value); else next.add(t.value)
                            if (next.size === 0) return // 至少保留 1 种
                            setSelectedTypes(next)
                          }}
                          className="btn btn-sm"
                          style={{
                            flex: '1 1 100px', fontSize: 12, minHeight: 40,
                            background: isOn ? 'var(--color-primary)' : 'var(--color-bg-offset)',
                            color: isOn ? '#fff' : 'var(--color-text)',
                            border: 'none',
                          }}
                        >{t.label}</button>
                      )
                    })}
                  </div>
                </div>

                {/* 难度多选 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                    难度（可多选，已选 <strong style={{ color: 'var(--color-primary)' }}>{selectedDifficulties.size}</strong> 档）
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {LINK_DIFFICULTY_LEVELS.map(d => {
                      const isOn = selectedDifficulties.has(d.value)
                      return (
                        <button
                          key={d.value}
                          onClick={() => {
                            const next = new Set(selectedDifficulties)
                            if (isOn) next.delete(d.value); else next.add(d.value)
                            if (next.size === 0) return
                            setSelectedDifficulties(next)
                          }}
                          className="btn btn-sm"
                          style={{
                            flex: 1, fontSize: 12, minHeight: 40,
                            background: isOn ? 'var(--color-primary)' : 'var(--color-bg-offset)',
                            color: isOn ? '#fff' : 'var(--color-text)',
                            border: 'none',
                          }}
                        >{d.label}</button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                    简易：基础概念；中等：理解应用；困难：综合分析。
                  </div>
                </div>

                {/* 去重阈值 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                    重复判定阈值（与已有题库 stem 相似度 ≥ <strong>{similarityThreshold.toFixed(2)}</strong> 视为重复）
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={1.0}
                    step={0.05}
                    value={similarityThreshold}
                    onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    越高越严格去重；0.7 是经验值，适合绝大多数场景。
                  </div>
                </div>

                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                    每（题型×难度）目标题数：<strong>{targetPerCell}</strong>（合计约 {targetDistribution.total} 题）
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={targetPerCell}
                    onChange={(e) => setTargetPerCell(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {targetDistribution.types?.length || 0} 题型 × {targetDistribution.difficulties?.length || 3} 难度 × {targetPerCell} 题 = {targetDistribution.total} 题
                  </div>
                </div>
              </div>

              {/* 5. 分布可视化（目标 + 已选范围覆盖度 + 分类整体） */}
              <QuestionDistributionView
                title="目标分布（本次计划生成）"
                currentDistribution={targetDistribution}
                targetDistribution={targetDistribution}
                compact
              />

              {combinedDistribution && (
                <QuestionDistributionView
                  title="当前题库分布（已选范围内）"
                  currentDistribution={combinedDistribution}
                  targetDistribution={targetDistribution}
                  compact
                />
              )}

              {currentDistribution && (
                <QuestionDistributionView
                  title="本分类整体分布"
                  currentDistribution={currentDistribution}
                  targetDistribution={targetDistribution}
                  compact
                />
              )}

              {/* 6. 生成按钮 */}
              <div style={{ position: 'sticky', bottom: 0, padding: '8px 0 16px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedIds.size < 2}
                  style={{
                    width: '100%', fontSize: 15, minHeight: 52,
                    fontWeight: 700,
                    opacity: (isGenerating || selectedIds.size < 2) ? 0.6 : 1,
                    border: 'none',
                  }}
                >
                  {isGenerating ? '生成中…' : `开始生成题目（约 ${targetDistribution.total} 题）`}
                </button>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: 6 }}>
                  题目生成在后台进行，可通过右下角悬浮按钮查看进度；出错将自动重试最多 2 次。
                </div>
              </div>

              {/* 7. 流程报告（上次生成结果） */}
              {(lastFlowReport || lastStats) && (
                <GenerationFlowReport
                  flowReport={lastFlowReport}
                  stats={lastStats}
                  isStrongModel={true}
                />
              )}
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!selectedCategoryId ? (
            <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              请先在「出题配置」中选择分类
            </div>
          ) : historyRuns.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>📜</div>
              <div>当前分类下暂无出题历史记录</div>
              <div style={{ fontSize: 11, marginTop: 6 }}>完成一次联结出题后将在此展示</div>
            </div>
          ) : (
            historyRuns.map((run) => (
              <div key={run.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                      {run.mode === 'chapter' ? '章节联结' : '单元联结'}（{run.generatedCount ?? 0} 题）
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      {formatTime(run.createdAt)} · 联结强度：{{ low: '弱', medium: '中', high: '强' }[run.linkStrength] || run.linkStrength} · 难度：{run.difficulty ? DIFF_LABEL[run.difficulty] : '混合'} · 目标：{run.totalTarget ?? '-'}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleDeleteRun(run)}
                    style={{ fontSize: 11, minHeight: 28, color: 'var(--color-danger)', background: 'transparent', border: '1px solid var(--color-border-light)' }}
                  >
                    删除
                  </button>
                </div>
                {run.distributionByType && Object.keys(run.distributionByType).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {Object.entries(run.distributionByType).map(([type, count]) => (
                      <span key={type} style={{
                        fontSize: 11, padding: '4px 10px', background: '#E3F2FD', color: '#1565C0', borderRadius: 12,
                      }}>
                        {LINK_QUESTION_TYPES.find(t => t.value === type)?.label || type} × {count}
                      </span>
                    ))}
                  </div>
                )}
                {run.distributionByDifficulty && Object.keys(run.distributionByDifficulty).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {Object.entries(run.distributionByDifficulty).map(([d, count]) => (
                      <span key={d} style={{
                        fontSize: 11, padding: '4px 10px', background: '#F3E5F5', color: '#6A1B9A', borderRadius: 12,
                      }}>
                        {DIFF_LABEL[Number(d)] || d} × {count}
                      </span>
                    ))}
                  </div>
                )}
                {run.errorMessage && (
                  <div style={{ fontSize: 11, color: '#D84315', marginTop: 8, padding: '6px 10px', background: '#FBE9E7', borderRadius: 6 }}>
                    批次错误：{String(run.errorMessage)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'pending' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {pendingQuestions.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <div>目前没有待审核题目</div>
              <div style={{ fontSize: 11, marginTop: 6 }}>联结合成的题目默认进入待审核状态，可在此快速核对后批量标记为已审核。</div>
            </div>
          ) : (
            pendingQuestions.map((q) => (
              <div key={q.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
                {renderQuestionSummary(q)}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {formatTime(q.createdAt)}
                  </div>
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 11, minHeight: 30, background: '#2E7D32', color: '#fff', border: 'none' }}
                    onClick={() => handleToggleReview(q)}
                  >
                    标记为已审核
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
