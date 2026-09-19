import { useState, useMemo } from 'react'

export default function TopicGroupConfirm({ topics, knowledgePoints, cards, onConfirm, onCancel, loading }) {
  const [expandedTopics, setExpandedTopics] = useState(() => new Set(topics.map((t, i) => i)))
  const [selectedPoints, setSelectedPoints] = useState(new Set())
  const [editingTopic, setEditingTopic] = useState(null)
  const [topicNameCache, setTopicNameCache] = useState({})
  const [showAllSelected, setShowAllSelected] = useState(false)

  const totalPoints = useMemo(() => knowledgePoints?.length || 0, [knowledgePoints])
  const assignedPoints = useMemo(() => {
    const count = topics.reduce((sum, t) => sum + (t.pointIndices?.length || 0), 0)
    return count
  }, [topics])

  function toggleTopicExpand(index) {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function togglePointSelection(topicIndex, pointIndex) {
    const globalPointIndex = topics[topicIndex]?.pointIndices?.[pointIndex]
    if (globalPointIndex === undefined) return

    setSelectedPoints((prev) => {
      const next = new Set(prev)
      if (next.has(globalPointIndex)) {
        next.delete(globalPointIndex)
      } else {
        next.add(globalPointIndex)
      }
      return next
    })
  }

  function toggleTopicSelection(topicIndex) {
    const topic = topics[topicIndex]
    if (!topic?.pointIndices) return

    setSelectedPoints((prev) => {
      const next = new Set(prev)
      const allSelected = topic.pointIndices.every((idx) => next.has(idx))

      if (allSelected) {
        topic.pointIndices.forEach((idx) => next.delete(idx))
      } else {
        topic.pointIndices.forEach((idx) => next.add(idx))
      }
      return next
    })
  }

  function selectAll() {
    const allIndices = []
    topics.forEach((t) => {
      t.pointIndices?.forEach((idx) => allIndices.push(idx))
    })
    setSelectedPoints(new Set(allIndices))
  }

  function deselectAll() {
    setSelectedPoints(new Set())
  }

  function handleTopicNameChange(topicIndex, newName) {
    setTopicNameCache((prev) => ({
      ...prev,
      [topicIndex]: newName
    }))
  }

  function handleTopicNameSave(topicIndex) {
    const newName = topicNameCache[topicIndex]
    if (newName && newName.trim()) {
      topics[topicIndex].name = newName.trim()
    }
    setTopicNameCache((prev) => {
      const next = { ...prev }
      delete next[topicIndex]
      return next
    })
    setEditingTopic(null)
  }

  function handleTopicNameCancel(topicIndex) {
    setTopicNameCache((prev) => {
      const next = { ...prev }
      delete next[topicIndex]
      return next
    })
    setEditingTopic(null)
  }

  function handleDeleteTopic(topicIndex) {
    if (topics.length <= 1) return
    const topic = topics[topicIndex]
    topic.pointIndices?.forEach((idx) => {
      setSelectedPoints((prev) => {
        const next = new Set(prev)
        next.delete(idx)
        return next
      })
    })
    topics.splice(topicIndex, 1)
    const newExpanded = new Set(expandedTopics)
    newExpanded.delete(topicIndex)
    setExpandedTopics(newExpanded)
  }

  function handleSubmit() {
    const confirmedTopics = topics.map((t) => ({
      name: t.name,
      pointIndices: t.pointIndices || [],
      units: t.units || []
    })).filter((t) => t.pointIndices.length > 0)

    if (confirmedTopics.length === 0) return
    onConfirm(confirmedTopics)
  }

  return (
    <div
      className="dialog-overlay topic-group-confirm-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        padding: '12px',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
      onClick={onCancel}
    >
      <div
        className="dialog topic-group-confirm-dialog"
        style={{
          maxWidth: 480,
          width: '100%',
          height: 'min(calc(100dvh - 24px), 820px)',
          maxHeight: 'none',
          margin: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '14px 16px 0',
          boxSizing: 'border-box',
          borderRadius: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--color-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
              确认主题分组
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
              共 {topics.length} 个主题，{assignedPoints}/{totalPoints} 个知识点已分配
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={(e) => { e.stopPropagation(); selectAll(); }}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            全选
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deselectAll(); }}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            反选
          </button>
          {selectedPoints.size > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowAllSelected(!showAllSelected); }}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--color-primary)',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                fontSize: 12,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              已选 {selectedPoints.size}
            </button>
          )}
        </div>

        <div
          className="topic-group-confirm-list"
          style={{
            flex: '1 1 0',
            minHeight: 0,
            height: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: 4,
            paddingBottom: 12,
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          {showAllSelected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  padding: 12,
                  background: 'var(--color-primary-light)',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 10,
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-primary)', margin: '0 0 8px' }}>
                  已选择的知识点 ({selectedPoints.size})
                </p>
                {[...selectedPoints].map((idx) => {
                  const kp = knowledgePoints?.[idx]
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 10px',
                        marginBottom: 4,
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'var(--color-text)',
                      }}
                    >
                      {kp?.content || kp || `知识点 ${idx + 1}`}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topics.map((topic, topicIndex) => {
                const isExpanded = expandedTopics.has(topicIndex)
                const topicPointCount = topic.pointIndices?.length || 0
                const selectedCount = topic.pointIndices?.filter((idx) => selectedPoints.has(idx)).length || 0
                const isAllSelected = topicPointCount > 0 && selectedCount === topicPointCount

                return (
                  <div
                    key={topicIndex}
                    style={{
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleTopicExpand(topicIndex); }}
                      style={{
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        touchAction: 'manipulation',
                      }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleTopicSelection(topicIndex); }}
                        style={{
                          flexShrink: 0,
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: `2px solid ${isAllSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: isAllSelected ? 'var(--color-primary)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {isAllSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>

                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-text-secondary)"
                        strokeWidth="2"
                        style={{
                          flexShrink: 0,
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingTopic === topicIndex ? (
                          <input
                            type="text"
                            value={topicNameCache[topicIndex] || topic.name}
                            onChange={(e) => handleTopicNameChange(topicIndex, e.target.value)}
                            onBlur={() => handleTopicNameSave(topicIndex)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleTopicNameSave(topicIndex)
                              if (e.key === 'Escape') handleTopicNameCancel(topicIndex)
                            }}
                            autoFocus
                            style={{
                              width: '100%',
                              padding: '4px 0',
                              fontSize: 15,
                              fontWeight: 600,
                              color: 'var(--color-text)',
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              borderBottom: '2px solid var(--color-primary)',
                            }}
                          />
                        ) : (
                          <p
                            onClick={(e) => { e.stopPropagation(); setEditingTopic(topicIndex); }}
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: 'var(--color-text)',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'text',
                            }}
                          >
                            {topic.name}
                          </p>
                        )}
                        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                          {topicPointCount} 个知识点 {selectedCount > 0 && `· 已选 ${selectedCount}`}
                        </p>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTopic(topicIndex); }}
                        disabled={topics.length <= 1}
                        style={{
                          flexShrink: 0,
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: 'none',
                          background: 'var(--color-danger-light)',
                          color: 'var(--color-danger)',
                          fontSize: 16,
                          cursor: topics.length <= 1 ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: topics.length <= 1 ? 0.3 : 1,
                          touchAction: 'manipulation',
                        }}
                      >
                        ×
                      </button>
                    </div>

                    {isExpanded && topic.pointIndices && topic.pointIndices.length > 0 && (
                      <div
                        style={{
                          padding: '0 14px 12px',
                          borderTop: '1px solid var(--color-border)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                          {topic.pointIndices.map((pointIndex, localIndex) => {
                            const kp = knowledgePoints?.[pointIndex]
                            const isSelected = selectedPoints.has(pointIndex)
                            const card = cards?.[pointIndex]

                            return (
                              <div
                                key={pointIndex}
                                onClick={(e) => { e.stopPropagation(); togglePointSelection(topicIndex, localIndex); }}
                                style={{
                                  padding: '10px 12px',
                                  background: isSelected ? 'var(--color-primary-light)' : 'var(--color-bg)',
                                  border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                  borderRadius: 8,
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 10,
                                  cursor: 'pointer',
                                  touchAction: 'manipulation',
                                }}
                              >
                                <button
                                  onClick={(e) => { e.stopPropagation(); togglePointSelection(topicIndex, localIndex); }}
                                  style={{
                                    flexShrink: 0,
                                    width: 18,
                                    height: 18,
                                    borderRadius: 5,
                                    border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                    background: isSelected ? 'var(--color-primary)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginTop: 2,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isSelected && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </button>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p
                                    style={{
                                      fontSize: 14,
                                      lineHeight: 1.5,
                                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                                      margin: 0,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                    }}
                                  >
                                    {kp?.content || kp || `知识点 ${pointIndex + 1}`}
                                  </p>
                                  {card && (
                                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                                      卡片 #{pointIndex + 1}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          className="dialog-actions topic-group-confirm-actions"
          style={{
            flexShrink: 0,
            margin: '8px -16px 0',
            padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))',
            background: 'var(--color-surface)',
            borderTop: '1px solid var(--color-border-light)',
            boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.04)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 42, fontSize: '13px', borderRadius: '10px' }}
            disabled={loading}
          >
            取消
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
            className="btn btn-primary btn-sm"
            style={{ minHeight: 42, fontSize: '13px', borderRadius: '10px', fontWeight: 600 }}
            disabled={loading || assignedPoints === 0}
          >
            {loading ? '处理中...' : `确认分组 (${topics.length})`}
          </button>
        </div>
      </div>
    </div>
