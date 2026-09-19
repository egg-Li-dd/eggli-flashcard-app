import { useState } from 'react'

/**
 * 生成流程报告组件
 * 展示：
 *  - 生成步骤（选择范围 → 模型校验 → 知识点收集 → 分批规划 → 串行生成 → 入库）
 *  - 每次生成的批次详情
 *  - 最终题目分布统计
 *
 * Props:
 *  - flowReport: { steps: [{title, detail, status}], parameters: {...} }
 *  - stats: { byType: {...}, byDifficulty: {...}, knowledgePointsCount: number, totalGenerated: number, totalTarget: number }
 *  - isStrongModel: 是否强模型
 */

const STATUS_COLOR = {
  ok: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  pending: '#BDBDBD',
}

const TYPE_LABEL_MAP = {
  single_choice: '单选题',
  multi_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
}

const DIFFICULTY_LABELS = { 1: '简易', 2: '中等', 3: '困难' }

export default function GenerationFlowReport({ flowReport, stats, isStrongModel = true }) {
  const [expanded, setExpanded] = useState(true)

  if (!flowReport && !stats) {
    return (
      <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        <div style={{ fontSize: 13 }}>尚未执行生成操作</div>
        <div style={{ fontSize: 11, marginTop: 4, color: 'var(--color-text-muted)' }}>
          完成题目生成后，此处将展示详细的流程报告
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
          生成流程报告
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {expanded ? '收起 ▲' : '展开 ▼'}
        </div>
      </div>

      {expanded && (
        <>
          {/* 模型提示 */}
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 6,
            background: isStrongModel ? '#E8F5E9' : '#FFEBEE',
            color: isStrongModel ? '#2E7D32' : '#C62828',
            fontSize: 12,
          }}>
            {isStrongModel
              ? '✓ 当前使用强模型，可进行高质量联结出题'
              : '⚠ 当前使用弱模型（如讯飞 Lite），不支持联结出题，请切换为强模型'}
          </div>

          {/* 步骤 */}
          {flowReport?.steps && flowReport.steps.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>执行步骤</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {flowReport.steps.map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '8px 10px', borderRadius: 6,
                    background: step.status === 'warning' ? '#FFF8E1' : 'var(--color-bg-offset)',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                      background: STATUS_COLOR[step.status] || STATUS_COLOR.pending,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                        {step.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', marginTop: 2 }}>
                        {step.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 参数 */}
          {flowReport?.parameters && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>生成参数</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                <div style={{ fontSize: 12, padding: '6px 10px', background: 'var(--color-bg-offset)', borderRadius: 4 }}>
                  模式：{flowReport.parameters.mode === 'unit' ? '单元联结' : '章节联结'}
                </div>
                <div style={{ fontSize: 12, padding: '6px 10px', background: 'var(--color-bg-offset)', borderRadius: 4 }}>
                  难度：{flowReport.parameters.difficulty
                    ? DIFFICULTY_LABELS[flowReport.parameters.difficulty] || '混合'
                    : '混合难度'}
                </div>
                <div style={{ fontSize: 12, padding: '6px 10px', background: 'var(--color-bg-offset)', borderRadius: 4 }}>
                  联结强度：{{ low: '弱', medium: '中', high: '强' }[flowReport.parameters.linkStrength] || '中'}
                </div>
                <div style={{ fontSize: 12, padding: '6px 10px', background: 'var(--color-bg-offset)', borderRadius: 4 }}>
                  目标题量：约 {flowReport.parameters.totalTarget} 题
                </div>
              </div>
            </div>
          )}

          {/* 结果统计 */}
          {stats && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>生成结果</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ padding: '10px 14px', background: 'var(--color-primary)', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                  共生成 {stats.totalGenerated ?? 0} 题
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--color-bg-offset)', color: 'var(--color-text)', borderRadius: 6, fontSize: 12 }}>
                  知识点覆盖：{stats.stats?.knowledgePointsCount || 0} 条
                </div>
              </div>
              {stats.stats?.byType && Object.keys(stats.stats.byType).length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(stats.stats.byType).map(([type, count]) => (
                    <div key={type} style={{
                      fontSize: 11, padding: '4px 10px', background: '#E3F2FD', color: '#1565C0', borderRadius: 12,
                    }}>
                      {TYPE_LABEL_MAP[type] || type} × {count}
                    </div>
                  ))}
                </div>
              )}
              {stats.stats?.byDifficulty && Object.keys(stats.stats.byDifficulty).length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(stats.stats.byDifficulty).map(([d, count]) => (
                    <div key={d} style={{
                      fontSize: 11, padding: '4px 10px', background: '#F3E5F5', color: '#6A1B9A', borderRadius: 12,
                    }}>
                      {DIFFICULTY_LABELS[Number(d)] || d} × {count}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
