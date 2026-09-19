import { useState, useRef } from 'react'
import MathText from './MathText'

// 截断 label 使其适合 28x28 圆形显示（防止 "正确/错误/待掌握" 等长 label 竖向堆叠）
function truncateLabel(label, maxLen = 1) {
  if (!label) return ''
  const s = String(label)
  // 单选/多选：只允许 A-Z
  if (s.length === 1) return s.toUpperCase()
  // 判断题：用 ✓/✗ 符号代替"正/错"，语义更清晰（D-5）
  if (s === '正确') return '✓'
  if (s === '错误') return '✗'
  // 其它超长 label：取首字
  return s.slice(0, maxLen)
}

/**
 * 通用答题卡片组件 — 100% 复用 CardItem.jsx 的样式和 className
 * 支持四种题型：单选题、多选题、填空题、判断题
 * 
 * Props:
 *   question: { id, type, stem, options, answer, analysis, difficulty, knowledgePoint }
 *   selectedAnswer: 用户当前答案
 *   onAnswerChange: (answer) => void
 *   showFeedback: boolean - 是否显示即时反馈
 *   feedbackResult: { isCorrect, score, correctAnswer, explanation } | null
 *   disabled: boolean - 是否禁用交互
 */
export default function TestCardItem({
  question,
  selectedAnswer,
  onAnswerChange,
  showFeedback = false,
  feedbackResult = null,
  disabled = false,
  onRedo = null,
}) {
  const safeQ = (question && typeof question === 'object')
    ? question
    : { id: null, stem: '', type: 'single_choice', options: [], answer: '', analysis: '', difficulty: 3, knowledgePoint: '' }

  const qType = (safeQ.type || 'single_choice').toLowerCase()
  const options = Array.isArray(safeQ.options) ? safeQ.options : []
  const stem = String(safeQ.stem || '（无题干）')

  // 已锁定：一旦显示反馈，该题选项不可再修改（统一所有答题模式）
  const isLocked = showFeedback && !!feedbackResult

  // 填空题：跟踪空格输入文本
  const [fillText, setFillText] = useState(
    selectedAnswer?.answerText || ''
  )

  // 判断题：跟踪是否选择了"错误"并标记错误位置
  const [errorMarked, setErrorMarked] = useState(false)
  const [errorPosition, setErrorPosition] = useState(null) // { start, end }
  const stemRef = useRef(null)
  const [selectionMode, setSelectionMode] = useState(false) // 是否正在选择文本

  // 知识点展开状态：默认收起，点击展开
  const [kpExpanded, setKpExpanded] = useState(false)

  // 从 stem 元素中捕获文本选区
  const captureSelection = (evt) => {
    if (evt && typeof evt.preventDefault === 'function') {
      try { evt.preventDefault() } catch (_) { /* noop */ }
    }
    if (!stemRef.current) return
    // 给浏览器一点时间完成选区（尤其移动端）
    setTimeout(() => {
      if (!stemRef.current) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) return

      const range = sel.getRangeAt(0)
      if (!stemRef.current.contains(range.commonAncestorContainer)) return

      const fullText = stem
      try {
        const preRange = document.createRange()
        preRange.selectNodeContents(stemRef.current)
        preRange.setEnd(range.startContainer, range.startOffset)
        const start = preRange.toString().length
        preRange.setEnd(range.endContainer, range.endOffset)
        const end = preRange.toString().length

        if (start < end && start >= 0 && end <= fullText.length) {
          setErrorPosition({ start, end })
          setErrorMarked(true)
          setSelectionMode(false)
          onAnswerChange({ answer: false, errorPosition: { start, end } })
          // 清除高亮选择，避免移动端继续出现复制菜单
          try { sel.removeAllRanges() } catch (_) { /* noop */ }
        }
      } catch {
        // 选区计算失败，忽略
      }
    }, 0)
  }

  // ==================== 单选题 ====================
  const renderSingleChoice = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
      {options.map((opt, idx) => {
        const isSelected = selectedAnswer?.selectedIndex === idx
        const isCorrectOption = showFeedback && feedbackResult && String(feedbackResult.correctAnswer) === opt.label
        const isWrongSelected = showFeedback && feedbackResult && isSelected && !feedbackResult.isCorrect

        let optStyle = {
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          border: '2px solid',
          borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
          backgroundColor: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'all 0.15s ease',
          minHeight: '48px',
          opacity: disabled ? 0.7 : 1,
        }

        if (showFeedback && feedbackResult) {
          if (isCorrectOption) {
            optStyle.borderColor = 'var(--color-success)'
            optStyle.backgroundColor = 'var(--color-success-light)'
          } else if (isWrongSelected) {
            optStyle.borderColor = 'var(--color-danger)'
            optStyle.backgroundColor = 'var(--color-danger-light)'
          }
        }

        return (
          <button
            key={idx}
            style={optStyle}
            onClick={() => {
              if (disabled || isLocked) return
              onAnswerChange({ selectedIndex: idx, selectedText: opt.text || opt.label })
            }}
            disabled={disabled || isLocked}
          >
            <span style={{
              width: '28px', height: '28px', borderRadius: '50%',
              border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
              color: isSelected ? '#fff' : 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)', fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {showFeedback && isCorrectOption ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : showFeedback && isWrongSelected ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                truncateLabel(opt.label, 1)
              )}
            </span>
            <span style={{
              flex: 1,
              fontSize: 'var(--text-base)',
              color: 'var(--color-text)',
              textAlign: 'left',
              lineHeight: 1.5,
            }}>
              <MathText>{opt.text || opt.label}</MathText>
            </span>
          </button>
        )
      })}
    </div>
  )

  // ==================== 多选题 ====================
  const renderMultiChoice = () => {
    const selectedIndices = Array.isArray(selectedAnswer?.selectedIndices)
      ? selectedAnswer.selectedIndices
      : []

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 12px', borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-warning-light)',
          color: 'var(--color-warning-dark)',
          fontSize: 'var(--text-xs)', fontWeight: 600,
          marginBottom: '2px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          多选题（可多选）
        </div>
        {options.map((opt, idx) => {
          const isSelected = selectedIndices.includes(idx)
          // 多选题：从 correctAnswer 提取字母集合再判断，避免 includes 模糊匹配
          let isCorrectOption = false
          if (showFeedback && feedbackResult && feedbackResult.correctAnswer !== undefined && feedbackResult.correctAnswer !== null) {
            if (qType === 'multi_choice' || qType === 'multi') {
              const ansLetters = (String(feedbackResult.correctAnswer || '').toUpperCase().match(/[A-Z]/g) || [])
              const correctSet = new Set(ansLetters)
              const label = String(opt.label || '').trim().toUpperCase()
              isCorrectOption = correctSet.has(label)
            } else {
              isCorrectOption = String(feedbackResult.correctAnswer) === String(opt.label)
            }
          }

          let optStyle = {
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            border: '2px solid',
            borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
            cursor: disabled ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
            minHeight: '48px',
            opacity: disabled ? 0.7 : 1,
          }

          if (showFeedback && feedbackResult) {
            if (isCorrectOption) {
              optStyle.borderColor = 'var(--color-success)'
              optStyle.backgroundColor = 'var(--color-success-light)'
            } else if (isSelected && !isCorrectOption) {
              optStyle.borderColor = 'var(--color-danger)'
              optStyle.backgroundColor = 'var(--color-danger-light)'
            }
          }

          return (
            <button
              key={idx}
              style={optStyle}
              onClick={() => {
                if (disabled || isLocked) return
                const next = isSelected
                  ? selectedIndices.filter(i => i !== idx)
                  : [...selectedIndices, idx]
                onAnswerChange({ selectedIndices: next })
              }}
              disabled={disabled || isLocked}
            >
              <span style={{
                width: '28px', height: '28px', borderRadius: '6px',
                border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                color: '#fff',
                fontSize: 'var(--text-sm)', fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {isSelected ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  truncateLabel(opt.label, 1)
                )}
              </span>
              <span style={{
                flex: 1,
                fontSize: 'var(--text-base)',
                color: 'var(--color-text)',
                textAlign: 'left',
                lineHeight: 1.5,
              }}>
                <MathText>{opt.text || opt.label}</MathText>
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  // ==================== 填空题 ====================
  const renderFillBlank = () => (
    <div style={{ marginTop: '16px' }}>
      <div style={{
        position: 'relative',
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-border-light)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          fontWeight: 500,
          marginBottom: '8px',
        }}>
          请在下方输入你的答案：
        </div>
        <input
          type="text"
          value={fillText}
          onChange={(e) => {
            if (disabled || isLocked) return
            const v = e.target.value
            setFillText(v)
            onAnswerChange({ answerText: v })
          }}
          disabled={disabled || isLocked}
          placeholder="在此输入答案..."
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: 'var(--text-base)',
            borderRadius: 'var(--radius-md)',
            border: showFeedback && feedbackResult
              ? (feedbackResult.isCorrect ? '2px solid var(--color-success)' : '2px solid var(--color-danger)')
              : '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            outline: 'none',
            boxSizing: 'border-box',
            minHeight: '48px',
            transition: 'border-color 0.15s ease',
          }}
        />
      </div>
      {showFeedback && feedbackResult && !feedbackResult.isCorrect && (
        <div style={{
          marginTop: '10px',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-danger-light)',
          color: 'var(--color-danger)',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.5,
        }}>
          正确答案：<span style={{ fontWeight: 600 }}>{String(feedbackResult.correctAnswer || '')}</span>
        </div>
      )}
    </div>
  )

  // ==================== 判断题 ====================
  const renderTrueFalse = () => {
    const userVal = selectedAnswer?.answer
    const isCorrectAnswer = showFeedback && feedbackResult?.isCorrect

    return (
      <div style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { label: '正确', value: true, color: 'var(--color-success)', lightColor: 'var(--color-success-light)' },
            { label: '错误', value: false, color: 'var(--color-danger)', lightColor: 'var(--color-danger-light)' },
          ].map((btn) => {
            const selected = userVal === btn.value
            let bg = selected ? btn.lightColor : 'var(--color-surface)'
            let bd = selected ? btn.color : 'var(--color-border)'
            let textColor = selected ? btn.color : 'var(--color-text-secondary)'

            if (showFeedback && feedbackResult) {
              const correctVal = String(feedbackResult.correctAnswer || '').trim()
              const correctBool = correctVal === 'true' || correctVal === '正确' || correctVal === '对'
              if (btn.value === correctBool) {
                bg = 'var(--color-success-light)'
                bd = 'var(--color-success)'
                textColor = 'var(--color-success)'
              } else if (selected && !feedbackResult.isCorrect) {
                bg = 'var(--color-danger-light)'
                bd = 'var(--color-danger)'
                textColor = 'var(--color-danger)'
              }
            }

            return (
              <button
                key={btn.value}
                onClick={() => {
                  if (disabled || isLocked) return
                  onAnswerChange({ answer: btn.value })
                  if (!btn.value) {
                    setErrorMarked(false)
                    setErrorPosition(null)
                  }
                }}
                disabled={disabled || isLocked}
                style={{
                  flex: 1,
                  minHeight: '56px',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${bd}`,
                  backgroundColor: bg,
                  color: textColor,
                  fontSize: 'var(--text-lg)',
                  fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: disabled ? 0.7 : 1,
                }}
              >
                {btn.value ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
                {btn.label}
              </button>
            )
          })}
        </div>

        {/* 判断题选择"错误"时，标记错误位置 */}
        {userVal === false && !showFeedback && (
          <div style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-danger-light)',
            border: '1px solid var(--color-danger)',
          }}>
            {selectionMode ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', color: 'var(--color-danger)', fontWeight: 500 }}>
                  请在上方题干中用手指长按并拖动，选中你认为错误的文字片段
                </p>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  （选中文本后将自动记录）
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setSelectionMode(false); setErrorMarked(false); setErrorPosition(null) }}
                    style={{
                      minHeight: '40px', padding: '8px 16px', borderRadius: '8px',
                      border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                      color: 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >取消选择</button>
                </div>
              </div>
            ) : errorMarked && errorPosition ? (
              <div>
                <div style={{
                  marginBottom: '8px', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-surface)', fontSize: 'var(--text-sm)',
                  color: 'var(--color-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {String(stem).slice(0, errorPosition.start)}
                  </span>
                  <span style={{ color: 'var(--color-danger)', textDecoration: 'underline', textDecorationColor: 'var(--color-danger)', textUnderlineOffset: '3px', fontWeight: 600 }}>
                    {String(stem).slice(errorPosition.start, errorPosition.end)}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {String(stem).slice(errorPosition.end)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setSelectionMode(true); setErrorMarked(false); setErrorPosition(null) }}
                    style={{
                      flex: 1, minHeight: '40px', padding: '8px 14px', borderRadius: '8px',
                      border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                      color: 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >重新标记</button>
                  <button
                    onClick={() => {
                      setErrorMarked(false)
                      setErrorPosition(null)
                      onAnswerChange({ answer: false, errorPosition: null })
                    }}
                    style={{
                      flex: 1, minHeight: '40px', padding: '8px 14px', borderRadius: '8px',
                      border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                      color: 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >清除标记</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setSelectionMode(true)}
                disabled={disabled}
                style={{
                  width: '100%', minHeight: '52px', padding: '10px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--color-danger)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-danger)',
                  fontSize: 'var(--text-sm)', fontWeight: 500,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  touchAction: 'manipulation',
                }}
              >
                标记题干中错误位置
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ==================== 反馈信息 ====================
  // 格式化正确答案文本：判断题的 boolean/英文值转为中文显示
  const formatCorrectAnswer = () => {
    const raw = feedbackResult.correctAnswer
    if (raw === undefined || raw === null || raw === '') return ''
    if (qType === 'true_false' || qType === 'judge') {
      const v = String(raw).trim().toLowerCase()
      if (v === 'true' || raw === true) return '正确'
      if (v === 'false' || raw === false) return '错误'
      if (raw === '正确' || raw === '对') return '正确'
      if (raw === '错误' || raw === '错') return '错误'
    }
    return String(raw)
  }

  const renderFeedback = () => {
    if (!showFeedback || !feedbackResult) return null

    const correctAnswerText = !feedbackResult.isCorrect ? formatCorrectAnswer() : ''

    return (
      <div style={{
        marginTop: '16px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: feedbackResult.isCorrect ? 'var(--color-success-light)' : 'var(--color-danger-light)',
        border: `1px solid ${feedbackResult.isCorrect ? 'var(--color-success)' : 'var(--color-danger)'}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: 'var(--text-base)', fontWeight: 600,
          color: feedbackResult.isCorrect ? 'var(--color-success)' : 'var(--color-danger)',
          marginBottom: (feedbackResult.explanation || correctAnswerText) ? '8px' : 0,
        }}>
          {feedbackResult.isCorrect ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          {feedbackResult.isCorrect ? '回答正确！' : '回答错误'}
        </div>
        {/* 解析 */}
        {feedbackResult.explanation && (
          <div style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 1.6,
            marginBottom: correctAnswerText ? '8px' : 0,
          }}>
            <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>解析：</span>
            {feedbackResult.explanation}
          </div>
        )}
        {/* 正确答案：答错时统一强制显示（填空题保留独立区块，判题/单选/多选在反馈框内显示） */}
        {correctAnswerText && qType !== 'fill_blank' && (
          <div style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 1.6,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>正确答案：</span>
            <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{correctAnswerText}</span>
          </div>
        )}
        {/* 重新作答按钮：仅在答错时提供，避免答对时无意义解锁 */}
        {!feedbackResult.isCorrect && typeof onRedo === 'function' && (
          <button
            onClick={() => onRedo()}
            style={{
              marginTop: '12px',
              minHeight: '44px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-primary)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-primary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            重新作答
          </button>
        )}
      </div>
    )
  }

  // ==================== 难度标签 ====================
  const difficultyLabel = (() => {
    const d = safeQ.difficulty || 3
    if (d <= 2) return { text: '简单', color: 'var(--color-success)' }
    if (d <= 3) return { text: '中等', color: 'var(--color-warning)' }
    return { text: '困难', color: 'var(--color-danger)' }
  })()

  // ==================== 主渲染 ====================
  return (
    <div
      className="card"
      style={{
        cursor: 'default',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-light)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}
    >
      {/* 顶部：题型标签 + 难度 */}
      <div
        className="flex-between"
        style={{ padding: '14px 16px 10px', gap: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="badge badge-primary" style={{ fontSize: '10px', padding: '3px 10px' }}>
            {{ single_choice: '单选题', single: '单选题', multi_choice: '多选题', multi: '多选题', fill_blank: '填空题', true_false: '判断题', judge: '判断题' }[qType] || '单选题'}
          </span>
          <span className="badge badge-muted" style={{
            fontSize: '10px', padding: '3px 10px',
            backgroundColor: difficultyLabel.color === 'var(--color-success)' ? 'var(--color-success-light)' :
              difficultyLabel.color === 'var(--color-warning)' ? 'var(--color-warning-light)' : 'var(--color-danger-light)',
            color: difficultyLabel.color,
          }}>
            {difficultyLabel.text}
          </span>
        </div>
      </div>

      {/* 题干 */}
      <div style={{ padding: '6px 16px 16px' }}>
        <p
          ref={stemRef}
          onMouseUp={selectionMode ? captureSelection : undefined}
          onTouchEnd={selectionMode ? captureSelection : undefined}
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 500,
            color: 'var(--color-text)',
            lineHeight: 1.75,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            userSelect: selectionMode ? 'text' : 'none',
            WebkitUserSelect: selectionMode ? 'text' : 'none',
            cursor: selectionMode ? 'text' : 'default',
            padding: selectionMode ? '8px' : '0',
            borderRadius: selectionMode ? '8px' : '0',
            backgroundColor: selectionMode ? 'var(--color-bg)' : 'transparent',
            border: selectionMode ? '1px dashed var(--color-primary)' : 'none',
            transition: 'all 0.15s',
          }}>
          <MathText>{stem}</MathText>
        </p>
        {safeQ.knowledgePoint && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setKpExpanded(v => !v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKpExpanded(v => !v) } }}
            style={{
              marginTop: '10px',
              paddingTop: '10px',
              borderTop: '1px dashed var(--color-border-light)',
              cursor: 'pointer',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
            title={kpExpanded ? '点击收起' : '点击展开：关联此知识点的其他卡片/学习提示'}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              fontWeight: 500,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--color-primary)' }}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>知识点：<MathText>{safeQ.knowledgePoint}</MathText></span>
              <svg
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={{
                  transition: 'transform 0.2s ease',
                  transform: kpExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  flexShrink: 0,
                  color: 'var(--color-text-muted)',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {kpExpanded && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg, #f8fafc)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text)',
                  lineHeight: 1.6,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontWeight: 500, marginBottom: '6px', color: 'var(--color-primary)' }}>
                  学习提示
                </div>
                <div>
                  本题考察的是「<MathText>{safeQ.knowledgePoint}</MathText>」。结合题干与选项，识别核心考点并对比正确选项的陈述要点；
                  答错时可点击查看「正确答案」与「解析」巩固理解。
                </div>
                {safeQ.cardId && (
                  <div style={{ marginTop: '6px', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                    关联卡片 ID：{String(safeQ.cardId).slice(0, 8)}…
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 题型专区 */}
      <div style={{ padding: '0 16px 16px' }}>
        {qType === 'single_choice' || qType === 'single' ? renderSingleChoice() :
         qType === 'multi_choice' || qType === 'multi' ? renderMultiChoice() :
         qType === 'fill_blank' ? renderFillBlank() :
         qType === 'true_false' || qType === 'judge' ? renderTrueFalse() :
         renderSingleChoice()}

        {/* 即时反馈 */}
        {renderFeedback()}
      </div>
    </div>
  )
}