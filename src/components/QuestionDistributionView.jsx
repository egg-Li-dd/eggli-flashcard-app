import { useState, useEffect, useMemo } from 'react'

/**
 * 题目分布可视化组件
 * - 展示当前单元/分类下各题型×难度的题目数量
 * - 展示预设目标数量，快速识别缺口
 * - 支持悬停显示具体数值、点击按题型筛选
 *
 * Props:
 *  - currentDistribution: { byType: [{type, label, count}], byDifficulty: [{difficulty, count}], matrix: {type_difficulty: count} }
 *  - targetDistribution: 与 currentDistribution 结构相同（目标值）
 *  - title: 组件标题
 *  - onFilterByType(type): 点击筛选回调
 */

const TYPE_COLORS = {
  single_choice: '#4A90E2',
  multi_choice: '#7ED321',
  true_false: '#F5A623',
  fill_blank: '#BD10E0',
}

const TYPE_LABEL_MAP = {
  single_choice: '单选',
  multi_choice: '多选',
  true_false: '判断',
  fill_blank: '填空',
}

const DIFFICULTY_LABELS = {
  1: '简易',
  2: '中等',
  3: '困难',
}

function Bar({ value, maxValue, color, label, target }) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0
  const targetPct = target && maxValue > 0 ? Math.min(100, (target / maxValue) * 100) : 0

  return (
    <div className="qb-dist-row" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px',
      borderBottom: '1px solid var(--color-border-light)',
    }}>
      <div style={{ width: 72, fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>
        {label}
      </div>
      <div style={{ flex: 1, position: 'relative', height: 28 }}>
        {/* 目标条（浅色背景） */}
        {targetPct > 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${targetPct}%`,
            background: color + '30',
            borderRadius: 4,
          }} title={`目标：${target}`} />
        )}
        {/* 当前值条（深色前景） */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: color,
          borderRadius: 4,
          transition: 'width 0.4s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }} title={`当前：${value}`} />
        {/* 目标线 */}
        {targetPct > 0 && targetPct <= 100 && (
          <div style={{
            position: 'absolute', left: `${targetPct}%`, top: -4, bottom: -4,
            width: 2, background: color, opacity: 0.8,
          }} />
        )}
      </div>
      <div style={{ width: 90, textAlign: 'right', fontSize: 12 }}>
        <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{value}</span>
        {target && target > 0 && (
          <span style={{ color: 'var(--color-text-secondary)', marginLeft: 4 }}>
            / {target}
          </span>
        )}
      </div>
    </div>
  )
}

function HeatmapCell({ value, target, maxValue, label, color, onClick, type, difficulty }) {
  const ratio = target > 0 ? value / target : (maxValue > 0 ? value / maxValue : 0)
  // 颜色强度 0-1：缺得越多越红
  let bg = '#f5f5f5'
  if (target > 0) {
    if (ratio < 0.33) bg = '#FFE8E8'
    else if (ratio < 0.66) bg = '#FFF4DE'
    else if (ratio < 1) bg = '#E8F5E9'
    else bg = '#C8E6C9'
  } else if (value > 0) {
    bg = '#E3F2FD'
  }

  return (
    <div
      onClick={() => onClick && onClick({ type, difficulty, value, target })}
      style={{
        background: bg,
        padding: '14px 8px',
        borderRadius: 6,
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s',
        border: `1px solid ${color}40`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
      title={`${label}：当前 ${value} / 目标 ${target || '—'}`}
    >
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>{value}</div>
      {target > 0 && (
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>
          目标 {target}
          {value < target && (
            <span style={{ color: '#E53935', marginLeft: 4 }}>缺 {target - value}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function QuestionDistributionView({
  currentDistribution,
  targetDistribution,
  title = '题目分布',
  onFilterByType,
  compact = false,
}) {
  const [hoveredCell, setHoveredCell] = useState(null)
  const [activeFilter, setActiveFilter] = useState(null)

  // 计算全局最大值（用于柱状图归一化）
  const globalMax = useMemo(() => {
    let max = 0
    if (currentDistribution?.byType) {
      for (const t of currentDistribution.byType) if (t.count > max) max = t.count
    }
    if (targetDistribution?.byType) {
      for (const t of targetDistribution.byType) if (t.count > max) max = t.count
    }
    return Math.max(5, max)
  }, [currentDistribution, targetDistribution])

  if (!currentDistribution) {
    return (
      <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        暂无分布数据
      </div>
    )
  }

  const byType = currentDistribution.byType || []
  const byDiff = currentDistribution.byDifficulty || []
  const targetByType = targetDistribution?.byType || []
  const targetMatrix = targetDistribution?.matrix || {}
  const currentMatrix = currentDistribution.matrix || {}
  const types = ['single_choice', 'multi_choice', 'true_false', 'fill_blank']
  const difficulties = [1, 2, 3]

  const handleTypeClick = (type) => {
    const next = activeFilter === type ? null : type
    setActiveFilter(next)
    if (onFilterByType) onFilterByType(next)
  }

  const handleCellClick = ({ type, difficulty }) => {
    handleTypeClick(type)
  }

  // 缺口统计
  let totalGap = 0
  let totalCurrent = 0
  let totalTarget = 0
  for (const t of types) for (const d of difficulties) {
    const cur = currentMatrix[`${t}_${d}`] || 0
    const tgt = targetMatrix[`${t}_${d}`] || 0
    totalCurrent += cur
    totalTarget += tgt
    totalGap += Math.max(0, tgt - cur)
  }

  return (
    <div className="card" style={{ padding: compact ? 12 : 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{title}</div>
        {totalTarget > 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            现有 {totalCurrent} 题 · 目标 {totalTarget} 题 · 缺口 {totalGap} 题
          </div>
        )}
      </div>

      {/* 按题型分布（柱状对比） */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>按题型分布（当前 vs 目标）</div>
        {types.map((t) => {
          const curItem = byType.find(x => x.type === t) || { count: 0 }
          const tgtItem = targetByType.find(x => x.type === t) || { count: 0 }
          const color = TYPE_COLORS[t] || '#4A90E2'
          const isActive = activeFilter === t
          return (
            <div
              key={t}
              onClick={() => handleTypeClick(t)}
              style={{
                cursor: onFilterByType ? 'pointer' : 'default',
                background: isActive ? color + '15' : 'transparent',
                borderRadius: 6,
                padding: '2px 6px',
                margin: '2px 0',
                transition: 'background 0.15s',
              }}
            >
              <Bar
                value={curItem.count}
                target={tgtItem.count || null}
                maxValue={Math.max(globalMax, tgtItem.count || 0)}
                color={color}
                label={TYPE_LABEL_MAP[t] || t}
              />
            </div>
          )
        })}
      </div>

      {/* 热力图：题型 × 难度 */}
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>题型 × 难度（点击筛选）</div>
        <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${types.length}, 1fr)`, gap: 6 }}>
          <div style={{ padding: 8, textAlign: 'right', fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>难度 \ 题型</div>
          {types.map(t => (
            <div key={`h-${t}`} style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600, padding: 4 }}>
              {TYPE_LABEL_MAP[t]}
            </div>
          ))}
          {difficulties.map((d) => (
            <>
              <div key={`l-${d}`} style={{ padding: 8, textAlign: 'right', fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {DIFFICULTY_LABELS[d]}
              </div>
              {types.map((t) => {
                const key = `${t}_${d}`
                const val = currentMatrix[key] || 0
                const tgt = targetMatrix[key] || 0
                const color = TYPE_COLORS[t] || '#4A90E2'
                return (
                  <HeatmapCell
                    key={key}
                    value={val}
                    target={tgt}
                    maxValue={globalMax}
                    label={`${TYPE_LABEL_MAP[t]} · ${DIFFICULTY_LABELS[d]}`}
                    color={color}
                    onClick={onFilterByType ? handleCellClick : null}
                    type={t}
                    difficulty={d}
                  />
                )
              })}
            </>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: 'var(--color-text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: '#C8E6C9', borderRadius: 2, display: 'inline-block' }}></span>达标
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: '#E8F5E9', borderRadius: 2, display: 'inline-block' }}></span>接近目标
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: '#FFF4DE', borderRadius: 2, display: 'inline-block' }}></span>部分覆盖
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: '#FFE8E8', borderRadius: 2, display: 'inline-block' }}></span>缺口大
        </div>
      </div>
    </div>
  )
}
