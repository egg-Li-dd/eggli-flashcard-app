import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { manualOverrideGrading, recalculateScore, formatTimeUsed, DIFFICULTY_WEIGHTS, DIFFICULTY_LABELS } from '../services/testGradingService'

const TYPE_NAMES = {
  single_choice: '单选题', multi_choice: '多选题',
  true_false: '判断题', fill_blank: '填空题', short_answer: '简答题',
}

const TYPE_ICONS = {
  single_choice: '○', multi_choice: '□',
  true_false: '✓', fill_blank: '—', short_answer: '✎',
}

function ScoreRing({ accuracy, size = 120, strokeWidth = 10 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (accuracy / 100) * circumference
  const fillClass = accuracy >= 80 ? 'test-result-score-ring-fill--high'
    : accuracy >= 60 ? 'test-result-score-ring-fill--mid'
    : 'test-result-score-ring-fill--low'

  return (
    <div className="test-result-score-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="test-result-score-ring-bg"
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={strokeWidth} />
        <circle className={`test-result-score-ring-fill ${fillClass}`}
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset} />
      </svg>
      <div className="test-result-score-value">
        <span className="test-result-score-value-percent">{accuracy}%</span>
        <span className="test-result-score-value-label">正确率</span>
      </div>
    </div>
  )
}

export default function UnitTestResult() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state: appState } = useApp()
  const resultData = location.state?.resultData

  if (!resultData) {
    return (
      <div className="page-animate-in" style={{ height: '100vh', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="app-header">
          <div className="app-header-inner">
            <button className="nav-link" onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              ← 返回
            </button>
            <span className="app-title" style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>检测结果</span>
            <span style={{ width: 48 }} />
          </div>
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <div className="empty-state-title">暂无检测结果</div>
            <div className="empty-state-desc">请先完成一次检测再查看结果</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>返回首页</button>
          </div>
        </div>
      </div>
    )
  }

  const {
    totalScore, correctCount, totalCount, accuracy,
    weightedScore, maxPossibleScore, timeUsed,
    gradingResults: initialResults, weakPoints, typeStats, questions,
  } = resultData

  const [gradingResults, setGradingResults] = useState(initialResults || [])
  const [score, setScore] = useState({
    totalScore, correctCount, totalCount, accuracy,
    weightedScore: weightedScore || totalScore,
    maxPossibleScore: maxPossibleScore || totalCount,
  })
  const [expandedIndex, setExpandedIndex] = useState(null)

  const questionMap = {}
  if (questions) questions.forEach(q => { questionMap[q.id] = q })

  const handleManualOverride = (index, newIsCorrect) => {
    const updated = [...gradingResults]
    const r = updated[index]
    if (r.type === 'multi_choice' || r.type === 'short_answer') {
      manualOverrideGrading(r, newIsCorrect, newIsCorrect ? 1 : 0.5)
    } else {
      manualOverrideGrading(r, newIsCorrect)
    }
    setGradingResults(updated)
    const newScore = recalculateScore(updated, questions)
    setScore(newScore)
  }

  const getQuestionItemClass = (r) => {
    if (r.isCorrect) return 'test-result-question-item--correct'
    if (r.partial || (r.score > 0 && r.score < 1)) return 'test-result-question-item--partial'
    return 'test-result-question-item--wrong'
  }

  const getIconClass = (r) => {
    if (r.isCorrect) return 'test-result-question-icon--correct'
    if (r.partial || (r.score > 0 && r.score < 1)) return 'test-result-question-icon--partial'
    return 'test-result-question-icon--wrong'
  }

  return (
    <div className="page-animate-in" style={{ height: '100vh', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="app-header">
        <div className="app-header-inner">
          <button className="nav-link" onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            ← 返回
          </button>
          <span className="app-title" style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>检测结果</span>
          <span style={{ width: 48 }} />
        </div>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px' }}>
        {/* 成绩概览 */}
        <div className="card test-result-score-card">
          <ScoreRing accuracy={score.accuracy} />
          <div className="test-result-score-meta">
            {score.correctCount}/{score.totalCount} 正确 · 用时 {formatTimeUsed(timeUsed || 0)}
          </div>
          {typeof score.weightedScore === 'number' && score.maxPossibleScore !== score.totalCount && (
            <div className="test-result-score-meta" style={{ marginTop: 4 }}>
              加权得分: {score.weightedScore} / {score.maxPossibleScore}
            </div>
          )}
          <div className="test-result-score-bar">
            <div className={`test-result-score-bar-fill ${score.accuracy >= 80 ? 'test-result-score-bar-fill--high' : score.accuracy >= 60 ? 'test-result-score-bar-fill--mid' : 'test-result-score-bar-fill--low'}`}
              style={{ width: `${score.accuracy}%` }} />
          </div>
        </div>

        {/* 各题型正确率 */}
        {typeStats && typeStats.length > 0 && (
          <div className="card test-result-type-stats">
            <div className="test-result-section-title">各题型正确率</div>
            {typeStats.map((ts) => (
              <div key={ts.type} className="test-result-type-row">
                <span className="test-result-type-name">{ts.name}</span>
                <div className="test-result-type-bar">
                  <div className={`test-result-type-bar-fill ${ts.accuracy >= 80 ? 'test-result-type-bar-fill--high' : ts.accuracy >= 60 ? 'test-result-type-bar-fill--mid' : 'test-result-type-bar-fill--low'}`}
                    style={{ width: `${ts.accuracy}%` }} />
                </div>
                <span className="test-result-type-stat">{ts.correct}/{ts.total} ({ts.accuracy}%)</span>
              </div>
            ))}
          </div>
        )}

        {/* 薄弱知识点 TOP5 */}
        {weakPoints && weakPoints.length > 0 && (
          <div className="card test-result-weakpoints">
            <div className="test-result-section-title">需加强的知识点</div>
            {weakPoints.map((wp, i) => (
              <div key={i} className="test-result-weakpoint-item">
                <span className={`test-result-weakpoint-rank ${i < 3 ? 'test-result-weakpoint-rank--top' : 'test-result-weakpoint-rank--normal'}`}>
                  {String.fromCharCode(10102 + i)}
                </span>
                <span className="test-result-weakpoint-name">{wp.name}</span>
                <span className="test-result-weakpoint-count">{wp.count}次错误</span>
              </div>
            ))}
          </div>
        )}

        {/* 答题详情 */}
        <div className="card test-result-detail">
          <div className="test-result-section-title">答题详情</div>
          {gradingResults.map((r, i) => {
            const q = questionMap[r.questionId] || {}
            const isExpanded = expandedIndex === i
            const qDifficulty = q?.difficulty || 'easy'
            const weight = DIFFICULTY_WEIGHTS[qDifficulty] || 1.0

            return (
              <div key={r.questionId || i} className={`test-result-question-item ${getQuestionItemClass(r)}`}>
                <button className="test-result-question-header"
                  onClick={() => setExpandedIndex(isExpanded ? null : i)}>
                  <span className={`test-result-question-icon ${getIconClass(r)}`}>
                    {r.isCorrect ? '✓' : r.partial || (r.score > 0 && r.score < 1) ? '~' : '✗'}
                  </span>
                  <span className="test-result-question-type-badge">
                    {TYPE_ICONS[r.type] || '?'} {TYPE_NAMES[r.type] || r.type}
                  </span>
                  {weight !== 1.0 && (
                    <span className={`question-bank-difficulty-badge question-bank-difficulty-badge--${qDifficulty}`}
                      style={{ fontSize: 10, padding: '1px 4px', flexShrink: 0 }}>
                      {DIFFICULTY_LABELS[qDifficulty]} ×{weight}
                    </span>
                  )}
                  <span className="test-result-question-front">
                    {String(q.front || '').slice(0, 40)}
                  </span>
                  <span className="test-result-question-graded-by">
                    {r.gradedBy === 'ai' ? 'AI' : r.gradedBy === 'manual' ? '手动' : '自动'}
                  </span>
                  <svg className={`test-result-question-arrow ${isExpanded ? 'test-result-question-arrow--expanded' : ''}`}
                    width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="test-result-question-body">
                    <div className="test-result-question-field">
                      <span className="test-result-question-field-label">题目：</span>
                      <span className="test-result-question-field-value">{String(q.front || '（无题目）')}</span>
                    </div>
                    <div className="test-result-question-field">
                      <span className="test-result-question-field-label">你的答案：</span>
                      <span className={`test-result-question-field-value ${r.isCorrect ? 'test-result-question-field-value--correct' : 'test-result-question-field-value--wrong'}`}>
                        {formatUserAnswer(r, q)}
                      </span>
                    </div>
                    <div className="test-result-question-field">
                      <span className="test-result-question-field-label">正确答案：</span>
                      <span className="test-result-question-field-value test-result-question-field-value--correct">
                        {String(r.correctAnswer || q.back || '')}
                      </span>
                    </div>
                    {r.explanation && (
                      <div className="test-result-question-explanation">
                        <span className="test-result-question-field-label">解析：</span>
                        {r.explanation}
                      </div>
                    )}
                    {(r.type === 'short_answer' && r.keywords && r.keywords.length > 0) && (
                      <div className="short-answer-feedback">
                        <div className="short-answer-keywords">
                          <span className="short-answer-keywords-label">关键词匹配：</span>
                          {r.keywords.map((kw, ki) => (
                            <span key={ki} className={`short-answer-keyword-tag ${kw.matched ? 'short-answer-keyword-tag--matched' : 'short-answer-keyword-tag--missed'}`}>
                              {kw.word}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="test-result-override-btns">
                      <button className={`test-result-override-btn ${r.isCorrect ? 'test-result-override-btn--active' : ''}`}
                        onClick={() => handleManualOverride(i, true)}>
                        标记为正确
                      </button>
                      <button className={`test-result-override-btn ${!r.isCorrect ? 'test-result-override-btn--inactive' : ''}`}
                        onClick={() => handleManualOverride(i, false)}>
                        标记为错误
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ height: 80 }} />
      </div>

      {/* 底部操作栏 */}
      <div className="test-result-actions">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>
          ← 返回首页
        </button>
        <button className="btn btn-primary btn-retry" onClick={() => navigate(-1)}>
          重做本次测试
        </button>
        <button className="btn btn-outline btn-wrong" onClick={() => navigate('/wrong-questions')}>
          查看错题
        </button>
      </div>
    </div>
  )
}

function formatUserAnswer(r, q) {
  if (!r.userAnswer) return '（未作答）'
  const ua = r.userAnswer
  const qType = r.type

  if (qType === 'single_choice') {
    const idx = ua.selectedIndex
    if (typeof idx === 'number' && q.options && q.options[idx]) {
      return `${String.fromCharCode(65 + idx)}. ${q.options[idx]}`
    }
    return String(ua.selectedText || (ua.selectedIndex ?? ''))
  }

  if (qType === 'multi_choice') {
    const indices = ua.selectedIndices || []
    if (indices.length === 0) return '（未选择）'
    return indices.map(i => q.options?.[i] ? `${String.fromCharCode(65 + i)}. ${q.options[i]}` : '').join('、')
  }

  if (qType === 'true_false') {
    const v = ua.answer
    if (typeof v === 'boolean') return v ? '正确' : '错误'
    return String(v || '')
  }

  return String(ua.answerText || '')
}