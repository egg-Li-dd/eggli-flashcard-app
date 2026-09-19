/**
 * 连接状态指示器 — 固定在窗口左上角
 * 显示 Tailscale VPN + PC 引擎的实时连接状态
 */
import { useApp } from '../context/AppContext'

const DOT_SIZE = 8
const DOT_GAP = 4

const dotStyle = (connected) => ({
  width: DOT_SIZE,
  height: DOT_SIZE,
  borderRadius: '50%',
  backgroundColor: connected ? '#22c55e' : '#9ca3af',
  boxShadow: connected ? '0 0 4px rgba(34,197,94,0.5)' : 'none',
  transition: 'background-color 0.3s ease',
  flexShrink: 0,
})

export default function ConnectionStatusBar() {
  const { state } = useApp()
  const { pcEngineConnected, tailscaleConnected } = state

  // 没有任何连接配置时隐藏
  const pcEngineConfigured = !!localStorage.getItem('pc_engine_config')
  const tailscaleConfigured = localStorage.getItem('tailscale_auto_connect') === 'true' || !!localStorage.getItem('tailscale_auth_key')
  if (!pcEngineConfigured && !tailscaleConfigured) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 4,
        left: 4,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: DOT_GAP,
        padding: '3px 6px',
        background: 'rgba(0,0,0,0.45)',
        borderRadius: 10,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        pointerEvents: 'none',
      }}
      title={
        (tailscaleConnected ? '✅ Tailscale 已连接' : '❌ Tailscale 未连接') +
        ' | ' +
        (pcEngineConnected ? '✅ PC 引擎已连接' : '❌ PC 引擎未连接')
      }
    >
      {/* Tailscale 状态 */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={dotStyle(tailscaleConnected)} />
        <span style={{
          fontSize: 9,
          color: '#fff',
          fontWeight: 500,
          lineHeight: '14px',
        }}>TS</span>
      </span>
      {/* PC 引擎状态 */}
      {pcEngineConfigured && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={dotStyle(pcEngineConnected)} />
          <span style={{
            fontSize: 9,
            color: '#fff',
            fontWeight: 500,
            lineHeight: '14px',
          }}>PC</span>
        </span>
      )}
    </div>
  )
}
