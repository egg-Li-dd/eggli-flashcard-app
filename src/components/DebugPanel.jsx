import { useState } from 'react'
import { useApp } from '../context/AppContext'

// 调试条目组件（单个可折叠条目）
function DebugEntry({ entry, index }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      marginBottom: 6,
      background: 'var(--color-card)',
      overflow: 'hidden',
    }}>
      {/* 条目头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          cursor: 'pointer',
          background: expanded ? 'var(--color-bg)' : 'transparent',
          gap: 8,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{
            background: 'var(--color-primary)',
            color: '#fff',
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: 11,
            flexShrink: 0,
          }}>{index + 1}</span>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{entry.step}</span>
        </div>
        <span style={{
          fontSize: 12,
          color: entry.status === 'success' ? 'var(--color-success)' :
                 entry.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-muted)',
          flexShrink: 0,
        }}>
          {entry.status === 'success' ? '✅' : entry.status === 'error' ? '❌' : '⏳'}
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.2s',
          flexShrink: 0,
        }}>▶</span>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 10px' }}>
          {/* 输入 */}
          {entry.input && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-primary)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}>📥 Input</div>
              <div style={{
                fontSize: 11,
                color: 'var(--color-text)',
                background: 'var(--color-bg)',
                borderRadius: 4,
                padding: '6px 8px',
                maxHeight: 150,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                lineHeight: 1.5,
                userSelect: 'text',
                WebkitUserSelect: 'text',
              }}>
                {String(entry.input)}
              </div>
            </div>
          )}

          {/* 输出 */}
          {entry.output && (
            <div>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-success)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}>📤 Output</div>
              <div style={{
                fontSize: 11,
                color: 'var(--color-text)',
                background: 'var(--color-bg)',
                borderRadius: 4,
                padding: '6px 8px',
                maxHeight: 150,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                lineHeight: 1.5,
                userSelect: 'text',
                WebkitUserSelect: 'text',
              }}>
                {String(entry.output)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 调试面板主组件
export default function DebugPanel({ entries, onClear }) {
  const { state } = useApp()
  const [collapsed, setCollapsed] = useState(false)

  // 开发者模式关闭时不渲染
  if (!state.developerMode || !entries || entries.length === 0) {
    return null
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 999,
      maxHeight: '50vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-surface)',
      borderTop: '1px solid var(--color-border)',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
    }}>
      {/* 面板头部 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
            🔧 AI 调试面板
          </span>
          <span style={{
            fontSize: 11,
            color: '#fff',
            background: 'var(--color-primary)',
            borderRadius: 10,
            padding: '1px 6px',
          }}>
            {entries.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClear}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: 'var(--color-card)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            清空
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: 'var(--color-card)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            {collapsed ? '展开' : '收起'}
          </button>
        </div>
      </div>

      {/* 调试内容 */}
      {!collapsed && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}>
          {entries.map((entry, index) => (
            <DebugEntry key={entry.id || index} entry={entry} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
