import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useBackgroundTask, TASK_TYPE } from '../context/BackgroundTaskContext'
import {
  getCategories, getUnitsByCategory, getChaptersByCategory, getUnitsByChapter,
  getTestQuestionsByCategory, deleteTestQuestion, updateTestQuestion,
} from '../services/db'
import { addManualQuestion, editQuestion, removeQuestion, isStrongModel } from '../services/testQuestionService'
import { DIFFICULTY_LABELS } from '../services/testGradingService'
import ConfirmDialog from '../components/ConfirmDialog'
import TestCardItem from '../components/TestCardItem'
import QuestionDistributionView from '../components/QuestionDistributionView'
import GenerationFlowReport from '../components/GenerationFlowReport'
import {
  runLinkGeneration,
  analyzeCurrentLinkDistribution,
  analyzeCurrentUnitDistribution,
  LINK_STRENGTH_LEVELS,
  LINK_QUESTION_TYPES,
  LINK_DIFFICULTY_LEVELS,
} from '../services/linkQuestionGeneration'

const BackArrow = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

const QUESTION_TYPES = [
  { value: 'single_choice', label: '单选题' },
  { value: 'multi_choice', label: '多选题' },
  { value: 'true_false', label: '判断题' },
  { value: 'fill_blank', label: '填空题' },
  { value: 'short_answer', label: '简答题' },
]

const TYPE_LABELS = {
  single_choice: '单选题', multi_choice: '多选题',
  true_false: '判断题', fill_blank: '填空题', short_answer: '简答题',
  single: '单选题', multi: '多选题', judge: '判断题',
}

const DIFFICULTY_OPTIONS = [
  { value: 1, label: '简易' },
  { value: 2, label: '中等' },
  { value: 3, label: '困难' },
]

function diffLevel(v) {
  const d = Number(v) || 2
  return Math.max(1, Math.min(3, Math.round(d)))
}

function diffLabel(v) {
  const d = Number(v) || 2
  const normalized = Math.max(1, Math.min(3, Math.round(d)))
  const labels = { 1: '简易', 2: '中等', 3: '困难' }
  return labels[normalized] || '中等'
}

function parseOptions(text) {
  if (!text || !text.trim()) return []
  const lines = text.trim().split('\n').filter(Boolean)
  return lines.map((line, i) => {
    const match = line.match(/^([A-Zａ-ｚＡ-Ｚ])\s*[.．、]?\s*(.+)/)
    if (match) {
      return { label: match[1].toUpperCase(), text: match[2].trim() }
    }
    const label = String.fromCharCode(65 + i)
    return { label, text: line.trim() }
  })
}

function optionsToText(opts) {
  if (!Array.isArray(opts) || opts.length === 0) return ''
  return opts.map(o => (o.label || '') + '. ' + (o.text || '')).join('\n')
}

// 章节选择器组件
function ChapterSelector({ chapters, selectedCategoryId, categories, onSelectChapter, onBack, expandedChapters, onToggleExpand, questionsByUnit, onSelectUnit }) {
  const hasChapters = chapters.length > 0

  if (!hasChapters) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
        <div className="empty-state-title">暂无章节</div>
        <div className="empty-state-desc">该分类下没有章节，请先在分类管理中添加章节</div>
      </div>
    )
  }

  return (
    <>
      <div className="qb-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 36, minWidth: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={onBack}
        >
          <BackArrow />
        </button>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
          {categories.find(c => c.id === selectedCategoryId)?.name || '选择章节'}
        </span>
      </div>
      {chapters.map((chapter) => (
        <div key={chapter.id} style={{ marginBottom: 10 }}>
          <div
            className="qb-chapter-card"
            onClick={() => {
              if (chapter.units.length > 0) {
                onToggleExpand(chapter.id)
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && chapter.units.length > 0) {
                e.preventDefault()
                onToggleExpand(chapter.id)
              }
            }}
          >
            <div className="qb-chapter-card-bar" />
            <div className="qb-chapter-card-body">
              <div className="qb-chapter-card-name">{chapter.name}</div>
              <div className="qb-chapter-card-meta">
                <span className="qb-stat-badge">{chapter.units.length} 个单元</span>
                <span className="qb-stat-badge qb-stat-badge--primary">{chapter.questionCount} 题</span>
              </div>
            </div>
            {chapter.units.length > 0 ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="2"
                style={{
                  flexShrink: 0,
                  marginRight: 12,
                  transition: 'transform 0.2s',
                  transform: expandedChapters.has(chapter.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" style={{ flexShrink: 0, marginRight: 12, opacity: 0.4 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
              </svg>
            )}
          </div>
          {expandedChapters.has(chapter.id) && chapter.units.length > 0 && (
            <div style={{ paddingLeft: 24, marginTop: -6 }}>
              {chapter.units.map((unit) => {
                const unitQuestions = questionsByUnit[unit.id] || []
                return (
                  <div
                    key={unit.id}
                    className="card qb-unit-card"
                    onClick={() => onSelectUnit(unit.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectUnit(unit.id) } }}
                    style={{
                      marginBottom: 8,
                      cursor: 'pointer',
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>{unit.name}</span>
                      <span className="qb-stat-badge" style={{ fontSize: 10, padding: '1px 6px' }}>{unitQuestions.length} 题</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

// 单元选择器组件
function UnitSelector({ units, questionsByUnit, otherQuestions, totalQuestions, selectedCategoryId, categories, chapters, chapterId, onSelectUnit, onBack, onClearCategory }) {
  // 若有章节，只展示该章节下的单元
  const displayUnits = chapterId
    ? units.filter(u => u.chapterId === chapterId)
    : units

  // 若该章节下无单元且无其他题目
  if (chapterId && displayUnits.length === 0 && otherQuestions.length === 0) {
    return (
      <>
        <div className="qb-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 36, minWidth: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            onClick={onBack}
          >
            <BackArrow />
          </button>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
            {chapters.find(c => c.id === chapterId)?.name || '单元列表'}
          </span>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <div className="empty-state-title">该章节下暂无单元</div>
          <div className="empty-state-desc">请先在分类管理中为该章节添加单元</div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="qb-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 36, minWidth: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={onBack}
        >
          <BackArrow />
        </button>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
          {chapterId ? (chapters.find(c => c.id === chapterId)?.name || '单元列表') : '选择单元'}
        </span>
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-sm)' }}>
          共 <strong>{chapterId ? displayUnits.reduce((s, u) => s + (questionsByUnit[u.id] || []).length, 0) + otherQuestions.length : totalQuestions}</strong> 道题目 · {displayUnits.length} 个单元
        </span>
        {totalQuestions > 0 && !chapterId && (
          <button className="btn btn-danger btn-sm" style={{ minHeight: 32, fontSize: 'var(--text-xs)' }}
            onClick={onClearCategory}>
            清空分类
          </button>
        )}
      </div>

      {displayUnits.length === 0 && otherQuestions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <div className="empty-state-title">暂无题目</div>
          <div className="empty-state-desc">该分类下还没有 AI 生成的题目，请先执行出题操作</div>
        </div>
      ) : (
        <>
          {displayUnits.map((unit) => {
            const count = (questionsByUnit[unit.id] || []).length
            return (
              <div
                key={unit.id}
                className="card"
                style={{
                  padding: '14px 16px',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onClick={() => onSelectUnit(unit.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectUnit(unit.id) } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {unit.name}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span className="badge badge-primary" style={{ fontSize: '11px' }}>{count}题</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </div>
            )
          })}

          {otherQuestions.length > 0 && (
            <div
              className="card"
              style={{
                padding: '14px 16px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                opacity: 0.85,
              }}
              onClick={() => onSelectUnit('__other__')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectUnit('__other__') } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    其他题目（未归属单元）
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span className="badge" style={{ fontSize: '11px', background: 'var(--color-bg-offset)', color: 'var(--color-text-secondary)' }}>{otherQuestions.length}题</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

// 题目列表组件
function QuestionList({ unitId, unitName, questions, totalQuestions, selectedCategoryId, categories, chapters, onBack, onClearCategory, onAdd, onClearUnit, onViewQuestion, onEditQuestion, onDeleteQuestion, getTypeLabel, getDiffLabel, getDiffLevel, compact }) {
  return (
    <>
      {!compact && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <button
              className="btn btn-ghost"
              style={{ minHeight: 36, minWidth: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              onClick={onBack}
            >
              <BackArrow />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {unitName}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                {questions.length} 道题目
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {unitId !== '__other__' && (
              <button className="btn btn-primary btn-sm" style={{ minHeight: 32, fontSize: 'var(--text-xs)' }}
                onClick={onAdd}>添加</button>
            )}
            {questions.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ minHeight: 32, fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}
                onClick={onClearUnit}>清空</button>
            )}
          </div>
        </div>
      )}

      {compact && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
            {unitName} · {questions.length} 题
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {unitId !== '__other__' && (
              <button className="btn btn-primary btn-sm" style={{ minHeight: 32, fontSize: 'var(--text-xs)' }}
                onClick={onAdd}>添加</button>
            )}
            {questions.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ minHeight: 32, fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}
                onClick={onClearUnit}>清空</button>
            )}
          </div>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <div className="empty-state-title">暂无题目</div>
          <div className="empty-state-desc">该单元暂无 AI 题目
            {unitId !== '__other__' && <button className="btn btn-link" style={{ fontSize: 'var(--text-sm)', padding: '4px 8px', minHeight: 'auto' }} onClick={onAdd}>手动添加</button>}
          </div>
        </div>
      ) : (
        questions.map((q) => (
          <div key={q.id} className="card question-bank-card-item"
            onClick={() => onViewQuestion(q)}
            style={{ cursor: 'pointer', marginBottom: 8, display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '12px 14px' }}>
              <div className="question-bank-card-header" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span className="question-bank-type-badge">{getTypeLabel(q)}</span>
                <span className={`question-bank-difficulty-badge question-bank-difficulty-badge--${getDiffLevel(q.difficulty) === 1 ? 'easy' : getDiffLevel(q.difficulty) === 3 ? 'medium' : 'hard'}`}>
                  {getDiffLabel(q.difficulty)}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-muted)' }}>点击答题 →</span>
              </div>
              <div className="question-bank-card-front" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>{q.stem}</div>
              <div className="question-bank-card-back" style={{ fontSize: '12px', marginTop: 4 }}>
                答案: {q.answer}
                {q.analysis && (
                  <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontSize: '11px' }}>
                    | 解析: {q.analysis.slice(0, 50)}{q.analysis.length > 50 ? '...' : ''}
                  </span>
                )}
              </div>
              {q.knowledgePoint && (
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  知识点: {q.knowledgePoint}
                </div>
              )}
            </div>
            <div className="question-bank-card-actions" style={{ borderTop: '1px solid var(--color-border-light)', padding: '8px 14px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}
              onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-ghost btn-sm" style={{ minHeight: 32, fontSize: 'var(--text-xs)' }}
                onClick={() => onEditQuestion(q, unitId)}>编辑</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)', minHeight: 32, fontSize: 'var(--text-xs)' }}
                onClick={() => onDeleteQuestion(q)}>删除</button>
            </div>
          </div>
        ))
      )}
    </>
  )
}

export default function QuestionBankPage() {
  const navigate = useNavigate()
  const { id: categoryId } = useParams()
  const { state, showToast } = useApp()

  // 视图模式：'normal' = 原有的题库管理；'link' = 联结题库
  const [viewMode, setViewMode] = useState('normal')

  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId || '')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const categoryDropdownRef = useRef(null)
  const [selectedChapterId, setSelectedChapterId] = useState(null) // null=未选章节
  const [selectedUnitId, setSelectedUnitId] = useState(null) // null=未选单元, '__other__'=其他题目
  const [chapterDropdownOpen, setChapterDropdownOpen] = useState(false)
  const chapterDropdownRef = useRef(null)
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false)
  const unitDropdownRef = useRef(null)
  const [units, setUnits] = useState([])
  const [chapters, setChapters] = useState([]) // { id, name, units: [...], questionCount }
  const [questionsByUnit, setQuestionsByUnit] = useState({})
  const [loading, setLoading] = useState(true)
  const [expandedChapters, setExpandedChapters] = useState(new Set())

  const [editMode, setEditMode] = useState(null)
  const [editQuestion, setEditQuestion] = useState(null)
  const [editUnitId, setEditUnitId] = useState('')

  const [formStem, setFormStem] = useState('')
  const [formAnswer, setFormAnswer] = useState('')
  const [formType, setFormType] = useState('single_choice')
  const [formOptions, setFormOptions] = useState('')
  const [formDifficulty, setFormDifficulty] = useState(3)
  const [formAnalysis, setFormAnalysis] = useState('')
  const [formKnowledgePoint, setFormKnowledgePoint] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [clearTarget, setClearTarget] = useState(null)

  const [viewQuestion, setViewQuestion] = useState(null)
  const [viewAnswer, setViewAnswer] = useState(null)
  const [viewFeedback, setViewFeedback] = useState(null)
  const [viewSubmitting, setViewSubmitting] = useState(false)

  const [selectedDifficulty, setSelectedDifficulty] = useState(null)

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  const loadData = useCallback(async (catId) => {
    if (!catId) return
    setLoading(true)
    try {
      const us = await getUnitsByCategory(catId)
      setUnits(us)

      // 加载章节
      const chs = await getChaptersByCategory(catId)
      const allQuestions = await getTestQuestionsByCategory(catId)
      const unitIdSet = new Set(us.map(u => u.id))

      // 计算每个章节的单元和题目
      const chaptersWithData = await Promise.all(chs.map(async (ch) => {
        const chapterUnits = await getUnitsByChapter(ch.id)
        let qCount = 0
        for (const cu of chapterUnits) {
          qCount += allQuestions.filter(q => q.unitId === cu.id).length
        }
        return {
          id: ch.id,
          name: ch.name,
          units: chapterUnits,
          questionCount: qCount,
        }
      }))
      setChapters(chaptersWithData)

      // 默认展开所有章节，显示全部题目
      if (chaptersWithData.length > 0) {
        setExpandedChapters(new Set(chaptersWithData.map(ch => ch.id)))
      }

      // 按 unitId 分组（无 unitId 或不在该分类下的归入"其他"）
      const map = {}
      for (const q of allQuestions) {
        const uid = q.unitId && unitIdSet.has(q.unitId) ? q.unitId : '__other__'
        if (!map[uid]) map[uid] = []
        map[uid].push(q)
      }

      for (const u of us) {
        if (!map[u.id]) map[u.id] = []
      }

      setQuestionsByUnit(map)

      const dist = us.map(u => `${u.name}:${(map[u.id] || []).length}`).join(', ')
      const otherCount = (map['__other__'] || []).length
      const totalCount = allQuestions.length
      if (totalCount === 0) {
        console.warn(`[QuestionBank] 分类 ${catId} 没有可显示的题目，请确认是否成功执行了出题`)
      }
    } catch (e) {
      console.warn('[QuestionBank] 加载失败:', e?.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedCategoryId) loadData(selectedCategoryId)
  }, [selectedCategoryId, loadData])

  // 切换分类时重置章节和单元选择
  useEffect(() => {
    setSelectedChapterId(null)
    setSelectedUnitId(null)
  }, [selectedCategoryId])

  // 分类下拉框点击外部关闭
  useEffect(() => {
    const handler = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false)
      }
    }
    if (categoryDropdownOpen) {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler)
    }
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [categoryDropdownOpen])

  // 章节下拉框点击外部关闭
  useEffect(() => {
    const handler = (e) => {
      if (chapterDropdownRef.current && !chapterDropdownRef.current.contains(e.target)) {
        setChapterDropdownOpen(false)
      }
    }
    if (chapterDropdownOpen) {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler)
    }
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [chapterDropdownOpen])

  // 单元下拉框点击外部关闭
  useEffect(() => {
    const handler = (e) => {
      if (unitDropdownRef.current && !unitDropdownRef.current.contains(e.target)) {
        setUnitDropdownOpen(false)
      }
    }
    if (unitDropdownOpen) {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler)
    }
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [unitDropdownOpen])

  const openEdit = (q, unitId) => {
    setEditMode('edit')
    setEditQuestion(q)
    setEditUnitId(unitId)
    setFormStem(q.stem || '')
    setFormAnswer(q.answer || '')
    setFormType(q.type || 'single_choice')
    setFormOptions(optionsToText(q.options))
    setFormDifficulty(diffLevel(q.difficulty))
    setFormAnalysis(q.analysis || '')
    setFormKnowledgePoint(q.knowledgePoint || '')
  }

  const openAdd = (unitId) => {
    setEditMode('add')
    setEditQuestion(null)
    setEditUnitId(unitId)
    setFormStem('')
    setFormAnswer('')
    setFormType('single_choice')
    setFormOptions('')
    setFormDifficulty(3)
    setFormAnalysis('')
    setFormKnowledgePoint('')
  }

  const closeEdit = () => {
    setEditMode(null)
    setEditQuestion(null)
  }

  const handleSave = async () => {
    if (!formStem.trim()) { showToast('请输入题干内容', 'error'); return }
    if (!formAnswer.trim()) { showToast('请输入正确答案', 'error'); return }

    const options = parseOptions(formOptions)

    try {
      if (editMode === 'edit' && editQuestion) {
        await editQuestion(editQuestion.id, {
          stem: formStem.trim(),
          answer: formAnswer.trim(),
          type: formType,
          options,
          difficulty: formDifficulty,
          analysis: formAnalysis.trim(),
          knowledgePoint: formKnowledgePoint.trim(),
        }, showToast)
      } else if (editMode === 'add') {
        const unit = units.find(u => u.id === editUnitId)
        await addManualQuestion({
          userId: state.user?.id || '',
          testType: 'unit',
          targetId: editUnitId,
          categoryId: selectedCategoryId,
          unitId: editUnitId,
          type: formType,
          stem: formStem.trim(),
          answer: formAnswer.trim(),
          options,
          difficulty: formDifficulty,
          analysis: formAnalysis.trim(),
          knowledgePoint: formKnowledgePoint.trim(),
        }, showToast)
      }
      closeEdit()
      loadData(selectedCategoryId)
    } catch (e) {
      showToast('保存失败: ' + (e?.message || '未知错误'), 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await removeQuestion(deleteTarget.id, showToast)
      setDeleteTarget(null)
      loadData(selectedCategoryId)
    } catch (e) { showToast('删除失败', 'error') }
  }

  const handleClear = async () => {
    if (!clearTarget) return
    try {
      if (clearTarget.type === 'unit') {
        const qs = questionsByUnit[clearTarget.id] || []
        for (const q of qs) { await deleteTestQuestion(q.id) }
        showToast('已清空单元"' + clearTarget.name + '"的所有题目')
      } else if (clearTarget.type === 'category') {
        for (const uid of Object.keys(questionsByUnit)) {
          const qs = questionsByUnit[uid] || []
          for (const q of qs) { await deleteTestQuestion(q.id) }
        }
        showToast('已清空分类的所有题目')
      }
      setClearTarget(null)
      loadData(selectedCategoryId)
    } catch (e) { showToast('清空失败', 'error') }
  }

  const openView = (q) => {
    setViewQuestion(q)
    setViewAnswer(null)
    setViewFeedback(null)
    setViewSubmitting(false)
  }

  const closeView = () => {
    setViewQuestion(null)
    setViewAnswer(null)
    setViewFeedback(null)
  }

  const checkViewAnswer = () => {
    if (!viewQuestion || !viewAnswer) return
    setViewSubmitting(true)

    setTimeout(() => {
      const qType = (viewQuestion.type || '').toLowerCase()
      let isCorrect = false

      if (qType === 'single_choice' || qType === 'single') {
        const opt = (viewQuestion.options || [])[viewAnswer.selectedIndex]
        isCorrect = (opt && String(opt.label || '') === String(viewQuestion.answer || ''))
      } else if (qType === 'multi_choice' || qType === 'multi') {
        const sel = (viewAnswer.selectedIndices || []).map(i => {
          const o = (viewQuestion.options || [])[i]
          return o ? String(o.label || '').trim().toUpperCase() : ''
        }).filter(s => /^[A-Z]$/.test(s)).sort().join('')
        const normAns = (String(viewQuestion.answer || '').toUpperCase().match(/[A-Z]/g) || []).sort().join('')
        isCorrect = sel === normAns
      } else if (qType === 'fill_blank') {
        isCorrect = String(viewAnswer.answerText || '').trim().toLowerCase() === String(viewQuestion.answer || '').trim().toLowerCase()
      } else if (qType === 'true_false' || qType === 'judge') {
        const ua = viewAnswer.answer
        const userTrue = ua === true || ua === 'true' || ua === '正确' || ua === '对'
        const correctTrue = String(viewQuestion.answer || '') === 'true' || String(viewQuestion.answer || '') === '正确' || String(viewQuestion.answer || '') === '对'
        isCorrect = userTrue === correctTrue
      }

      setViewFeedback({
        isCorrect,
        correctAnswer: viewQuestion.answer,
        explanation: viewQuestion.analysis,
      })
      setViewSubmitting(false)
    }, 300)
  }

  const handleViewAnswerChange = (ans) => {
    setViewAnswer(ans)
    setViewFeedback(null)
  }

  const totalQuestions = Object.values(questionsByUnit).reduce((sum, qs) => sum + qs.length, 0)
  const showsOptions = formType === 'single_choice' || formType === 'multi_choice'
  const otherQuestions = questionsByUnit['__other__'] || []

  // 判断当前分类是否有章节
  const hasChapters = chapters.length > 0

  // 根据选中章节过滤单元
  const chapterUnits = selectedChapterId
    ? units.filter(u => u.chapterId === selectedChapterId)
    : units

  // 章节切换处理
  const handleSelectChapter = (chId) => {
    setSelectedChapterId(chId)
    setSelectedUnitId(null)
  }

  // 判断当前渲染哪个层级
  const renderContent = () => {
    if (loading) {
      return <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-secondary)' }}>加载中...</div>
    }

    if (!selectedCategoryId) {
      return (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div className="empty-state-title">选择分类和单元</div>
          <div className="empty-state-desc">请通过上方下拉选择器选择分类和单元，查看题库</div>
        </div>
      )
    }

    // 已选单元，直接展示题目列表（compact 模式，无返回按钮/卡片头）
    if (selectedUnitId !== null) {
      const unitQuestions = questionsByUnit[selectedUnitId] || []
      const filteredQuestions = selectedDifficulty !== null
        ? unitQuestions.filter(q => diffLevel(q.difficulty) === selectedDifficulty)
        : unitQuestions

      // 计算当前分布
      const currentDistribution = (selectedUnitId && selectedUnitId !== '__other__' && selectedUnitId !== '')
        ? analyzeCurrentUnitDistribution(unitQuestions)
        : null

      // 目标分布：(4题型 × 3难度 × 3) = 36 作为参考
      const types = ['single_choice', 'multi_choice', 'true_false', 'fill_blank']
      const difficulties = [1, 2, 3]
      const TARGET = 3
      const targetMatrix = {}
      for (const t of types) for (const d of difficulties) targetMatrix[`${t}_${d}`] = TARGET
      const targetDistribution = {
        byType: types.map(t => ({ type: t, count: 3 * TARGET })),
        byDifficulty: difficulties.map(d => ({ difficulty: d, count: 4 * TARGET })),
        matrix: targetMatrix,
        total: 12 * TARGET,
      }

      return (
        <div>
          {currentDistribution && (
            <QuestionDistributionView
              currentDistribution={currentDistribution}
              targetDistribution={targetDistribution}
              title="当前单元分布 vs 目标分布"
              compact
              onFilterByType={(type) => {
                const filteredByType = type === 'all' ? unitQuestions : unitQuestions.filter(q => q.type === type)
                showToast(`已高亮 ${filteredByType.length} 道${TYPE_LABELS[type] || '题目'}`, 'success')
              }}
            />
          )}
          <QuestionList
            unitId={selectedUnitId}
            unitName={selectedUnitId === '__other__' ? '其他题目' : (units.find(u => u.id === selectedUnitId)?.name || '未知单元')}
            questions={filteredQuestions}
            totalQuestions={totalQuestions}
            selectedCategoryId={selectedCategoryId}
            categories={categories}
            chapters={chapters}
            onBack={() => setSelectedUnitId(null)}
            onClearCategory={() => setClearTarget({ type: 'category', id: selectedCategoryId, name: categories.find(c => c.id === selectedCategoryId)?.name || '' })}
            onAdd={() => openAdd(selectedUnitId === '__other__' ? '' : selectedUnitId)}
            onClearUnit={() => setClearTarget({ type: 'unit', id: selectedUnitId, name: selectedUnitId === '__other__' ? '其他题目' : (units.find(u => u.id === selectedUnitId)?.name || '') })}
            onViewQuestion={openView}
            onEditQuestion={openEdit}
            onDeleteQuestion={setDeleteTarget}
            getTypeLabel={(q) => TYPE_LABELS[q.type] || q.type || '未知'}
            getDiffLabel={diffLabel}
            getDiffLevel={diffLevel}
            compact
          />
        </div>
      )
    }

    // 未选单元：占位提示
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32, marginTop: 12 }}>
        <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div className="empty-state-title">选择单元</div>
        <div className="empty-state-desc">请通过上方下拉选择器选择一个单元，查看该单元下的题库</div>
      </div>
    )
  }

  // 视图切换标签
  const renderViewSwitcher = () => (
    <div style={{
      display: 'flex', background: 'var(--color-bg-offset)', padding: 4,
      margin: '0 16px', borderRadius: 8, marginTop: 8,
    }}>
      <button
        onClick={() => setViewMode('normal')}
        style={{
          flex: 1, padding: '10px 12px', fontSize: 13, fontWeight: 600,
          background: viewMode === 'normal' ? 'var(--color-bg-card)' : 'transparent',
          color: viewMode === 'normal' ? 'var(--color-text)' : 'var(--color-text-secondary)',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          minHeight: 40,
        }}
      >
        📚 单元题库
      </button>
      <button
        onClick={() => navigate('/link-question-bank')}
        style={{
          flex: 1, padding: '10px 12px', fontSize: 13, fontWeight: 600,
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          minHeight: 40,
        }}
      >
        🔗 联结题库
      </button>
    </div>
  )

  return (
    <div className="page-animate-in" style={{ height: '100vh', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="app-header">
        <div className="app-header-inner">
          <button className="settings-back-btn" onClick={() => navigate('/')}>
            <BackArrow />
          </button>
          <span className="app-title" style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>题库管理</span>
          <span style={{ width: 48 }} />
        </div>
      </div>

      {renderViewSwitcher()}

      {viewMode === 'normal' && (
        <>
      {/* 三合一筛选栏 - 固定在顶部 */}
      <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
        <div className="qb-selector-card" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          {/* 分类下拉 */}
          <div ref={categoryDropdownRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <button
              type="button"
              className={`memorize-filter-trigger ${selectedCategoryId ? 'has-value' : ''}`}
              onClick={() => { setCategoryDropdownOpen(!categoryDropdownOpen); setChapterDropdownOpen(false); setUnitDropdownOpen(false) }}
            >
              <span className="memorize-filter-trigger-label">
                {selectedCategoryId
                  ? (categories.find(c => c.id === selectedCategoryId)?.name || '全部分类')
                  : '全部分类'}
              </span>
              <svg
                className={`memorize-filter-chevron ${categoryDropdownOpen ? 'open' : ''}`}
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {categoryDropdownOpen && (
              <div className="memorize-filter-dropdown">
                <button
                  type="button"
                  className={`memorize-filter-option ${!selectedCategoryId ? 'selected' : ''}`}
                  onClick={() => { setSelectedCategoryId(''); setCategoryDropdownOpen(false) }}
                >
                  <span>全部分类</span>
                  {!selectedCategoryId && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                {categories.map(c => {
                  const isSelected = selectedCategoryId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`memorize-filter-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => { setSelectedCategoryId(c.id); setCategoryDropdownOpen(false) }}
                    >
                      <span>{c.name}</span>
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 章节下拉 */}
          <div ref={chapterDropdownRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <button
                type="button"
                className={`memorize-filter-trigger ${selectedCategoryId && selectedChapterId ? 'has-value' : ''} ${!selectedCategoryId ? 'disabled' : ''}`}
                disabled={!selectedCategoryId}
                onClick={() => { if (!selectedCategoryId) return; setChapterDropdownOpen(!chapterDropdownOpen); setCategoryDropdownOpen(false); setUnitDropdownOpen(false) }}
              >
                <span className="memorize-filter-trigger-label">
                  {selectedChapterId
                    ? (chapters.find(c => c.id === selectedChapterId)?.name || '全部章节')
                    : '全部章节'}
                </span>
                <svg
                  className={`memorize-filter-chevron ${chapterDropdownOpen ? 'open' : ''}`}
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {chapterDropdownOpen && (
                <div className="memorize-filter-dropdown">
                  <button
                    type="button"
                    className={`memorize-filter-option ${!selectedChapterId ? 'selected' : ''}`}
                    onClick={() => { handleSelectChapter(null); setChapterDropdownOpen(false) }}
                  >
                    <span>全部章节</span>
                    {!selectedChapterId && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  {chapters.map(ch => {
                    const isSelected = selectedChapterId === ch.id
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className={`memorize-filter-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => { handleSelectChapter(ch.id); setChapterDropdownOpen(false) }}
                      >
                        <span>{ch.name} ({ch.questionCount})</span>
                        {isSelected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

          {/* 单元下拉 */}
          <div ref={unitDropdownRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <button
                type="button"
                className={`memorize-filter-trigger ${selectedCategoryId && selectedUnitId ? 'has-value' : ''} ${!selectedCategoryId ? 'disabled' : ''}`}
                disabled={!selectedCategoryId}
                onClick={() => { if (!selectedCategoryId) return; setUnitDropdownOpen(!unitDropdownOpen); setCategoryDropdownOpen(false); setChapterDropdownOpen(false) }}
              >
                <span className="memorize-filter-trigger-label">
                  {selectedUnitId
                    ? (selectedUnitId === '__other__' ? '其他题目' : (units.find(u => u.id === selectedUnitId)?.name || '全部单元'))
                    : '全部单元'}
                </span>
                <svg
                  className={`memorize-filter-chevron ${unitDropdownOpen ? 'open' : ''}`}
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {unitDropdownOpen && (
                <div className="memorize-filter-dropdown">
                  {chapterUnits.map((unit) => {
                    const count = (questionsByUnit[unit.id] || []).length
                    const isSelected = selectedUnitId === unit.id
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        className={`memorize-filter-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => { setSelectedUnitId(unit.id); setUnitDropdownOpen(false) }}
                      >
                        <span>{unit.name} ({count})</span>
                        {isSelected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                  {otherQuestions.length > 0 && (
                    <button
                      type="button"
                      className={`memorize-filter-option ${selectedUnitId === '__other__' ? 'selected' : ''}`}
                      onClick={() => { setSelectedUnitId('__other__'); setUnitDropdownOpen(false) }}
                    >
                      <span>其他题目 ({otherQuestions.length})</span>
                      {selectedUnitId === '__other__' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )}
                  {chapterUnits.length === 0 && otherQuestions.length === 0 && (
                    <div style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      暂无单元
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 难度筛选 */}
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <select
                value={selectedDifficulty || ''}
                onChange={(e) => setSelectedDifficulty(e.target.value ? Number(e.target.value) : null)}
                className={`memorize-filter-trigger ${selectedDifficulty !== null ? 'has-value' : ''}`}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  minHeight: 44,
                  appearance: 'none',
                  background: 'var(--color-bg-secondary)',
                  border: 'none',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text)',
                }}
              >
                <option value="">全部难度</option>
                <option value="1">简易</option>
                <option value="2">中等</option>
                <option value="3">困难</option>
              </select>
            </div>
        </div>
      </div>

      {/* 内容区域 - 可滚动 */}
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px' }}>
        {renderContent()}
      </div>
        </>
      )}

      {/* 编辑/添加弹窗 */}
      {(editMode === 'edit' || editMode === 'add') && (
        <div className="dialog-overlay" onClick={(e) => { e.preventDefault(); closeEdit() }}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
            <p className="dialog-title" style={{ marginBottom: 16 }}>
              {editMode === 'edit' ? '编辑题目' : '添加题目'}
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>题型</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value)}
                className="input" style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', minHeight: 44 }}>
                {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>难度</label>
              <select value={formDifficulty} onChange={(e) => setFormDifficulty(Number(e.target.value))}
                className="input" style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', minHeight: 44 }}>
                {DIFFICULTY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>题干</label>
              <textarea value={formStem} onChange={(e) => setFormStem(e.target.value)}
                className="input" style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 'var(--radius-md)', resize: 'vertical' }}
                placeholder="输入题干内容..." />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                {formType === 'short_answer' ? '参考答案/评分要点' : '正确答案'}
              </label>
              <textarea value={formAnswer} onChange={(e) => setFormAnswer(e.target.value)}
                className="input" style={{ width: '100%', minHeight: formType === 'short_answer' ? 120 : 60, padding: 10, borderRadius: 'var(--radius-md)', resize: 'vertical' }}
                placeholder={formType === 'short_answer' ? '输入参考答案或评分要点...' : '输入正确答案...'} />
            </div>

            {showsOptions && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>选项（每行一个，格式：A. 选项内容）</label>
                <textarea value={formOptions} onChange={(e) => setFormOptions(e.target.value)}
                  className="input" style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 'var(--radius-md)', resize: 'vertical' }}
                  placeholder={'A. 选项1\nB. 选项2\nC. 选项3\nD. 选项4'} />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>解析（可选）</label>
              <textarea value={formAnalysis} onChange={(e) => setFormAnalysis(e.target.value)}
                className="input" style={{ width: '100%', minHeight: 60, padding: 10, borderRadius: 'var(--radius-md)', resize: 'vertical' }}
                placeholder="输入题目解析..." />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>知识点（可选）</label>
              <input value={formKnowledgePoint} onChange={(e) => setFormKnowledgePoint(e.target.value)}
                className="input" style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', minHeight: 44 }}
                placeholder="关联的知识点..." />
            </div>

            {formType === 'true_false' && (
              <div style={{ marginBottom: 12, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                正确答案请填写"正确"或"错误"
              </div>
            )}

            {formType === 'short_answer' && (
              <div style={{ marginBottom: 12, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                简答题由AI根据参考答案进行语义评分，AI不可用时使用关键词匹配
              </div>
            )}

            <div className="dialog-actions">
              <button className="btn btn-secondary btn-sm" onClick={closeEdit} style={{ minHeight: 44 }}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} style={{ minHeight: 44 }}>
                {editMode === 'edit' ? '保存修改' : '添加题目'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 题目详情弹窗 */}
      {viewQuestion && (
        <div className="dialog-overlay" onClick={closeView}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{
            maxWidth: '640px', width: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto',
            padding: 0, borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--color-border-light)',
              position: 'sticky', top: 0, zIndex: 2, backgroundColor: 'var(--color-surface)',
            }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                {TYPE_LABELS[viewQuestion.type] || viewQuestion.type || '题目'}详情
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {viewQuestion.knowledgePoint && (
                  <span className="badge badge-muted" style={{ fontSize: '10px', padding: '3px 10px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={viewQuestion.knowledgePoint}>
                    知识点: {viewQuestion.knowledgePoint}
                  </span>
                )}
                <button className="btn btn-ghost" onClick={closeView}
                  style={{ minHeight: 36, minWidth: 36, padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ padding: '16px' }}>
              <TestCardItem
                question={viewQuestion}
                selectedAnswer={viewAnswer}
                onAnswerChange={handleViewAnswerChange}
                showFeedback={!!viewFeedback}
                feedbackResult={viewFeedback}
                disabled={viewSubmitting}
              />

              {!viewFeedback && !viewSubmitting && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button className="btn btn-secondary" onClick={closeView}
                    style={{ flex: 1, minHeight: '48px' }}>
                    关闭
                  </button>
                  <button className="btn btn-primary" onClick={checkViewAnswer}
                    disabled={!viewAnswer || viewSubmitting}
                    style={{ flex: 1, minHeight: '48px' }}>
                    提交答案
                  </button>
                </div>
              )}

              {viewSubmitting && (
                <div style={{ textAlign: 'center', marginTop: '16px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  评判中...
                </div>
              )}

              {viewFeedback && !viewSubmitting && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button className="btn btn-secondary" onClick={closeView}
                    style={{ flex: 1, minHeight: '48px' }}>
                    关闭
                  </button>
                  <button className="btn btn-primary" onClick={() => {
                    setViewAnswer(null)
                    setViewFeedback(null)
                  }}
                    style={{ flex: 1, minHeight: '48px' }}>
                    重新作答
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog visible={!!deleteTarget} title="删除题目"
        message={`确定要删除题目"${String(deleteTarget?.stem || '').slice(0, 30)}"吗？`}
        confirmText="删除" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />

      <ConfirmDialog visible={!!clearTarget} title="清空确认"
        message={clearTarget?.type === 'unit'
          ? `确定要清空单元"${clearTarget?.name}"的所有 AI 题目吗？此操作不可撤销。`
          : '确定要清空此分类的所有 AI 题目吗？此操作不可撤销。'}
        confirmText="确认清空" onConfirm={handleClear} onCancel={() => setClearTarget(null)} />
    </div>
  )
}