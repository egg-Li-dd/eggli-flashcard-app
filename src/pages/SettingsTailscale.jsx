import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useApp } from '../context/AppContext'
import {
  isAvailable,
  prepare,
  start,
  stop,
  getStatus,
  startLoginInteractive,
  getLastNotification,
  getPrefs,
  editPrefs,
  logout,
  listPeers,
  fetchViaTailscale,
  callLocalAPI,
} from '../services/tailscale'

const BackArrow = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
  </svg>
)

export default function SettingsTailscale() {
  const navigate = useNavigate()
  const [available, setAvailable] = useState(false)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState(null)
  const [prefs, setPrefs] = useState(null)
  const [peers, setPeers] = useState([])
  const [loginURL, setLoginURL] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoConnect, setAutoConnect] = useState(
    localStorage.getItem('tailscale_auto_connect') === 'true'
  )
  const [fetchUrl, setFetchUrl] = useState('')
  const [fetchMethod, setFetchMethod] = useState('GET')
  const [fetchBody, setFetchBody] = useState('')
  const [fetchResult, setFetchResult] = useState(null)
  const [fetchLoading, setFetchLoading] = useState(false)
  const loginPollRef = useRef(null)

  const isNative = Capacitor.isNativePlatform()
  const { state: appState, setTailscaleAuthKey, showToast } = useApp()
  const [authKey, setAuthKey] = useState(appState.tailscaleAuthKey || '')

  useEffect(() => {
    checkAvailability()
    return () => {
      if (loginPollRef.current) {
        clearInterval(loginPollRef.current)
        loginPollRef.current = null
      }
    }
  }, [])

  const checkAvailability = async () => {
    try {
      const info = await isAvailable()
      setAvailable(info.available)
      setRunning(info.running)
      if (info.running) {
        // getStatus() 在 tailscale.js 中 catch 了错误返回 null，不会 throw
        // 所以需要检查返回值是否为 null 来判断引擎是否可访问
        const s = await getStatus()
        if (s) {
          // 引擎可访问，刷新完整状态
          await refreshStatus()
          // 常态化：如果配置了 Auth Key 但引擎未登录，自动尝试登录
          if (authKey && s.BackendState === 'NeedsLogin') {
            console.log('[Tailscale] Auth key configured, auto-login...')
            setError('正在使用 Auth Key 自动登录...')
            try {
              await start(authKey)
              for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 2000))
                const s2 = await getStatus()
                if (s2 && s2.BackendState && s2.BackendState !== 'NeedsLogin' && s2.BackendState !== 'Starting') {
                  setStatus(s2)
                  setError('')
                  showToast('Tailscale 自动登录成功！', 'success')
                  break
                }
              }
              await refreshStatus()
            } catch (autoErr) {
              console.warn('[Tailscale] Auto-login failed:', autoErr)
              setError('')
            }
          }
        } else {
          // running=true 但 getStatus 返回 null，说明 tailscaleApp=null
          // 调用 start() 恢复引擎（handleStart 中 isRunning=true 但 tailscaleApp=null 时会重新初始化）
          console.log('Status is null, attempting to restore engine...')
          setError('正在恢复 Tailscale 引擎...')
          try {
            await start()
            // 引擎重新初始化后，需要等待状态稳定再获取
            let restored = false
            for (let i = 0; i < 6; i++) {
              await new Promise(r => setTimeout(r, 2000))
              try {
                const retryStatus = await getStatus()
                if (retryStatus) {
                  await refreshStatus()
                  restored = true
                  setError('')
                  break
                }
              } catch (retryErr) {
                console.log(`Retry ${i + 1}/6 failed:`, retryErr.message)
              }
            }
            if (!restored) {
              setError('引擎已恢复，状态获取中，请点击刷新状态')
            }
          } catch (e2) {
            console.error('Engine restore failed:', e2)
            setError('引擎恢复失败: ' + (e2.message || '未知错误'))
          }
        }
      }
    } catch (e) {
      console.error('checkAvailability failed:', e)
      setError('检查可用性失败: ' + (e.message || '未知错误'))
    }
  }

  const refreshStatus = async () => {
    try {
      const [s, p, pl] = await Promise.all([
        getStatus(),
        getPrefs(),
        listPeers(),
      ])
      setStatus(s)
      setPrefs(p)
      // peers 可能是数组或对象
      if (Array.isArray(pl)) {
        setPeers(pl)
      } else if (pl && typeof pl === 'object' && pl.Peer) {
        setPeers(Object.values(pl.Peer))
      } else {
        setPeers([])
      }
    } catch (e) {
      console.error('refreshStatus failed:', e)
    }
  }

  const handleStart = async () => {
    setLoading(true)
    setError('')
    try {
      // 第一步：获取VPN权限
      const prepResult = await prepare()
      if (!prepResult.prepared) {
        // prepare() 返回 prepared=false 说明用户拒绝了权限
        setError(prepResult.error || 'VPN 权限未授予')
        setLoading(false)
        return
      }

      // 第二步：启动引擎
      const ok = await start()
      if (ok) {
        setRunning(true)
        setTimeout(async () => {
          try {
            const s = await getStatus()
            if (s) setStatus(s)
          } catch (e) {
            console.error('auto status fetch failed:', e)
          }
        }, 3000)
      } else {
        setError('启动失败，请检查权限设置')
      }
    } catch (e) {
      setError(e.message || '启动失败')
    }
    setLoading(false)
  }

  const handleStop = async () => {
    setLoading(true)
    setError('')
    try {
      const ok = await stop()
      if (ok) {
        setRunning(false)
        setStatus(null)
        setPeers([])
      }
    } catch (e) {
      setError(e.message || '停止失败')
    }
    setLoading(false)
  }

  const handleGetLoginURL = async () => {
    setLoading(true)
    setError('')
    try {
      console.log('[Tailscale] handleGetLoginURL started')

      // 先检查 status 中是否已有登录链接（服务启动时可能已生成）
      const initialStatus = await getStatus()
      let loginUrl = ''
      if (initialStatus && (initialStatus.AuthURL || initialStatus.LoginURL || initialStatus.BrowseToURL)) {
        loginUrl = initialStatus.AuthURL || initialStatus.LoginURL || initialStatus.BrowseToURL
        console.log('[Tailscale] login URL already exists in status:', loginUrl)
      } else {
        // 第一步：确保 WantRunning=true 且 LoggedOut=false
        const editResult = await editPrefs({ WantRunning: true, LoggedOut: false })
        console.log('[Tailscale] editPrefs result:', editResult)

        // 第二步：调用 login-interactive
        const loginResult = await startLoginInteractive()
        console.log('[Tailscale] startLoginInteractive result:', loginResult)

        // 从 login-interactive 响应中提取 URL
        // Tailscale 本地方 API 可能返回纯文本 URL（如 "https://login.tailscale.com/a/..."）
        // 也可能是 JSON {"url":"..."}，分别处理
        if (loginResult && loginResult.body) {
          const body = loginResult.body.trim()
          if (body.startsWith('https://')) {
            loginUrl = body
            console.log('[Tailscale] login URL from body text:', loginUrl)
          } else {
            try {
              const bodyObj = JSON.parse(body)
              loginUrl = bodyObj.url || bodyObj.loginUrl || bodyObj.authUrl || ''
              console.log('[Tailscale] login URL from JSON:', loginUrl)
            } catch (parseErr) {
              console.warn('[Tailscale] login body is not JSON nor URL:', body.substring(0, 100))
            }
          }
        }
        
        // 如果响应中没有，再轮询 status（兜底）
        if (!loginUrl) {
          for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 1500))
            const s = await getStatus()
            if (s && (s.AuthURL || s.LoginURL || s.BrowseToURL)) {
              loginUrl = s.AuthURL || s.LoginURL || s.BrowseToURL
              break
            }
          }
        }
      }
      
      if (loginUrl) {
        setLoginURL(loginUrl)
        setStatus(await getStatus())
        window.open(loginUrl, '_blank')
        
        // 启动登录状态轮询：检测用户在浏览器中完成登录后自动刷新界面
        // 当 BackendState 从 NeedsLogin 变为 Running/Stopped 等，说明登录成功
        if (loginPollRef.current) clearInterval(loginPollRef.current)
        loginPollRef.current = setInterval(async () => {
          try {
            const s = await getStatus()
            if (s && s.BackendState && s.BackendState !== 'NeedsLogin') {
              // 登录成功，状态已变化
              setStatus(s)
              setLoginURL('')
              setLoading(false)
              if (loginPollRef.current) {
                clearInterval(loginPollRef.current)
                loginPollRef.current = null
              }
              // 刷新完整状态（包括 peers）
              refreshStatus()
            }
          } catch (e) {
            console.error('login poll failed:', e)
          }
        }, 2000)
        // 5 分钟后自动停止轮询
        setTimeout(() => {
          if (loginPollRef.current) {
            clearInterval(loginPollRef.current)
            loginPollRef.current = null
          }
        }, 300000)
      } else {
        setLoginURL('请在浏览器中访问 https://login.tailscale.com 完成登录')
        setError('未获取到登录链接，请检查网络后点击刷新状态重试')
      }
    } catch (e) {
      console.error('[Tailscale] handleGetLoginURL error:', e)
      setError(e.message || '获取登录链接失败')
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    if (!window.confirm('确定要登出 Tailscale 吗？')) return
    setLoading(true)
    try {
      await logout()
      setStatus(null)
      setLoginURL('')
      setTimeout(refreshStatus, 1000)
    } catch (e) {
      setError(e.message || '登出失败')
    }
    setLoading(false)
  }

  const handleToggleAutoConnect = (checked) => {
    setAutoConnect(checked)
    localStorage.setItem('tailscale_auto_connect', checked ? 'true' : 'false')
  }

  const handleFetch = async () => {
    if (!fetchUrl) return
    setFetchLoading(true)
    setFetchResult(null)
    try {
      const result = await fetchViaTailscale(fetchUrl, {
        method: fetchMethod,
        body: fetchMethod === 'POST' ? fetchBody : '',
        timeout: 30000,
      })
      setFetchResult(result)
    } catch (e) {
      setFetchResult({
        statusCode: 0,
        body: e.message || '请求失败',
        headers: '{}',
      })
    }
    setFetchLoading(false)
  }

  const isLoggedIn = status && status.Self && status.Self.ID

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      onContextMenu={preventTextMenu}
      onSelectStart={preventTextMenu}
    >
      <div className="settings-sub-header">
        <button className="settings-back-btn" onClick={() => navigate('/settings')}>
          <BackArrow />
        </button>
        <span className="settings-sub-title">🌐 Tailscale VPN</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        {!isNative && (
          <div style={{
            background: 'var(--color-warning-light)',
            color: 'var(--color-warning-dark)',
            padding: '12px 16px',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            Tailscale VPN 功能仅支持 Android APP，请在手机端使用
          </div>
        )}

        {isNative && !available && (
          <div style={{
            background: 'var(--color-info-light, #E3F2FD)',
            color: 'var(--color-info-dark, #1565C0)',
            padding: '12px 16px',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            请先安装官方 Tailscale App 并确保正在运行，本应用将通过 LocalAPI 与其通信。
          </div>
        )}

        {/* 连接状态卡片 */}
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '20px 16px',
          marginBottom: 12,
          textAlign: 'center',
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: running
              ? (isLoggedIn ? 'var(--color-success-light)' : 'var(--color-warning-light)')
              : 'var(--color-bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 32,
          }}>
            {running ? (isLoggedIn ? '✅' : '🔐') : '🔌'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
            {running ? (isLoggedIn ? '已连接' : '运行中 - 未登录') : '未连接'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            {running
              ? (isLoggedIn
                  ? `IP: ${status?.Self?.TailscaleIPs?.[0] || '获取中...'}`
                  : '请登录 Tailscale 账户')
              : '点击下方按钮启动 Tailscale'}
          </div>

          {!running ? (
            <button
              onClick={handleStart}
              disabled={loading || !isNative}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '10px 20px',
                fontSize: 15,
                fontWeight: 600,
                background: loading ? 'var(--color-border-light)' : 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '启动中...' : '启动 Tailscale'}
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={loading}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '10px 20px',
                fontSize: 15,
                fontWeight: 600,
                background: loading ? 'var(--color-border-light)' : 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                border: 'none',
                borderRadius: 10,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '停止中...' : '停止 Tailscale'}
            </button>
          )}
        </div>

        {error && (
          <div style={{
            background: 'var(--color-danger-light)',
            color: 'var(--color-danger)',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {/* 登录区域 */}
        {running && !isLoggedIn && (
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>
              🔐 登录 Tailscale
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              使用 Tailscale 账户登录，访问你的私有网络设备
            </div>
            <button
              onClick={handleGetLoginURL}
              disabled={loading}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary-dark)',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '生成链接中...' : '获取登录链接'}
            </button>
            {loginURL && (
              <div style={{
                marginTop: 10,
                fontSize: 11,
                color: 'var(--color-text-muted)',
                wordBreak: 'break-all',
                padding: '8px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 6,
              }}>
                {loginURL}
              </div>
            )}
          </div>
        )}

        {/* 设备信息 */}
        {isLoggedIn && status && (
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 12 }}>
              📱 本设备信息
            </div>
            <InfoRow label="主机名" value={status.Self?.HostName || '-'} />
            <InfoRow label="Tailscale IP" value={status.Self?.TailscaleIPs?.[0] || '-'} />
            <InfoRow label="DNS 名称" value={status.Self?.DNSName || '-'} />
            <InfoRow label="在线状态" value={status.Self?.Online ? '在线' : '离线'} />
          </div>
        )}

        {/* 网络节点列表 */}
        {isLoggedIn && peers.length > 0 && (
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 12 }}>
              🌍 网络节点 ({peers.length})
            </div>
            {peers.slice(0, 20).map((peer, idx) => (
              <div key={idx} style={{
                padding: '10px 0',
                borderBottom: idx < peers.slice(0, 20).length - 1 ? '1px solid var(--color-border-light)' : 'none',
              }}>
                <div style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500 }}>
                  {peer.HostName || peer.Name || '未知设备'}
                  <span style={{
                    fontSize: 11,
                    marginLeft: 8,
                    color: peer.Online ? 'var(--color-success)' : 'var(--color-text-muted)',
                  }}>
                    {peer.Online ? '● 在线' : '○ 离线'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {peer.TailscaleIPs?.[0] || ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tailnet 服务请求测试 */}
        {isLoggedIn && (
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>
              🔗 Tailnet 服务请求
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              通过 Tailscale 网络栈访问 Tailnet 中的 HTTP 服务（如 100.x.x.x 或 MagicDNS 名称）
            </div>
            <input
              className="input"
              type="text"
              value={fetchUrl}
              onChange={(e) => setFetchUrl(e.target.value)}
              placeholder="http://100.101.102.103:8080/api"
              style={{
                width: '100%',
                minHeight: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                marginBottom: 10,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {['GET', 'POST'].map((m) => (
                <button
                  key={m}
                  onClick={() => setFetchMethod(m)}
                  style={{
                    flex: 1,
                    minHeight: 36,
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    background: fetchMethod === m ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                    color: fetchMethod === m ? 'white' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            {fetchMethod === 'POST' && (
              <textarea
                className="input"
                value={fetchBody}
                onChange={(e) => setFetchBody(e.target.value)}
                placeholder='{"key": "value"}'
                style={{
                  width: '100%',
                  minHeight: 60,
                  padding: '8px 12px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  marginBottom: 10,
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            )}
            <button
              onClick={handleFetch}
              disabled={fetchLoading || !fetchUrl}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: fetchLoading ? 'var(--color-border-light)' : 'var(--color-primary-light)',
                color: fetchLoading ? 'var(--color-text-muted)' : 'var(--color-primary-dark)',
                border: 'none',
                borderRadius: 8,
                cursor: fetchLoading || !fetchUrl ? 'not-allowed' : 'pointer',
              }}
            >
              {fetchLoading ? '请求中...' : '发送请求'}
            </button>
            {fetchResult && (
              <div style={{
                marginTop: 12,
                padding: '10px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  状态码:{' '}
                  <span style={{
                    color: fetchResult.statusCode >= 200 && fetchResult.statusCode < 300
                      ? 'var(--color-success)'
                      : fetchResult.statusCode === 0
                        ? 'var(--color-danger)'
                        : 'var(--color-warning)',
                  }}>
                    {fetchResult.statusCode}
                  </span>
                </div>
                <div style={{
                  maxHeight: 200,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: 'var(--color-text-secondary)',
                }}>
                  {fetchResult.body}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 设置选项 */}
        {running && (
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 12 }}>
              ⚙️ 设置
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text)' }}>认证密钥 (Auth Key)</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  用于新设备自动登录，在 Tailscale 管理后台生成。保存后云端同步
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="password"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                placeholder="tskey-auth-..."
                style={{
                  flex: 1, minHeight: 40, padding: '8px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                  color: 'var(--color-text)', outline: 'none', fontFamily: 'monospace',
                }}
              />
              <button
                onClick={() => {
                  setTailscaleAuthKey(authKey)
                  showToast('Auth Key 已保存', 'success')
                }}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 500,
                  background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >保存</button>
            </div>
            {authKey && (
              <button
                onClick={async () => {
                  setLoading(true)
                  setError('')
                  try {
                    // 1. 启动 Tailscale 引擎并传递 Auth Key（原生层会自动完成登录）
                    showToast('正在使用 Auth Key 启动 Tailscale...', 'info')
                    await start(authKey)
                    // 2. 等待引擎重新初始化（start 返回后引擎可能在重启）
                    let engineReady = false
                    for (let i = 0; i < 15; i++) {
                      await new Promise(r => setTimeout(r, 2000))
                      const s = await getStatus()
                      if (s) {
                        engineReady = true
                        if (s.BackendState && s.BackendState !== 'NeedsLogin' && s.BackendState !== 'Starting') {
                          setStatus(s)
                          showToast('Tailscale 登录成功！', 'success')
                          break
                        }
                      }
                    }
                    // 3. 确保刷新完整状态
                    await refreshStatus()
                  } catch (e) {
                    setError('Auth Key 登录失败: ' + (e.message || e))
                  }
                  setLoading(false)
                }}
                disabled={loading}
                style={{
                  width: '100%', minHeight: 40, padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  background: 'var(--color-success)', color: '#fff', border: 'none', borderRadius: 8,
                  cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 12, opacity: loading ? 0.6 : 1,
                }}
              >{loading ? '登录中...' : '🔑 使用 Auth Key 自动登录'}</button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--color-text)' }}>启动时自动连接</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  应用启动时自动连接 Tailscale
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autoConnect}
                  onChange={(e) => handleToggleAutoConnect(e.target.checked)}
                />
                <span className="switch-slider" />
              </label>
            </div>

            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                minHeight: 40,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              登出账户
            </button>
          </div>
        )}

        {/* 刷新按钮 */}
        {running && (
          <button
            onClick={refreshStatus}
            disabled={loading}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-light)',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 20,
            }}
          >
            🔄 刷新状态
          </button>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid var(--color-border-light)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  )
}
