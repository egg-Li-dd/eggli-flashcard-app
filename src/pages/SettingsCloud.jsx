import { useApp } from '../context/AppContext'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/cloudbase'
import { saveCloudSettingsStructured, fetchCloudSettingsStructured, extractSettingsForApp, SYNCED_SETTING_KEYS } from '../services/settingsSync'
import { saveUserProfile, getUserProfile, getPresetAvatarById } from '../services/userProfile'
import { getPcEngineConfig, setPcEngineConfig } from '../services/pcEngine'

function ConfirmDialog({ open, title, message, onCancel, onConfirm, danger }) {
  if (!open) return null
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--color-surface-solid, #FFFFFF)', borderRadius: 12, padding: 20, margin: 16,
        maxWidth: 420, width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: 'var(--color-text)' }}>{title}</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, minHeight: 44, border: '1px solid var(--color-border-light)',
            background: 'transparent', color: 'var(--color-text-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>取消</button>
          <button onClick={onConfirm} style={{
            flex: 1, minHeight: 44, border: 'none',
            background: danger ? 'var(--color-danger)' : 'var(--color-primary)',
            color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>确定</button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsCloud() {
  const {
    state,
    setApiKey,
    setModel,
    setFontSize,
    setEyeProtection,
    setSpeechMode,
    setSpeechApiUrl,
    setSpeechApiKey,
    setInputBarMode,
    setIflytekAppId,
    setIflytekApiSecret,
    setAiServiceMode,
    setIflytekSparkModel,
    setIflytekSparkApiKey,
    setIflytekSparkApiSecret,
    setWhisperApiUrl,
    setWhisperApiKey,
    setIflytekIatAppId,
    setIflytekIatApiKey,
    setIflytekIatApiSecret,
    setVolcanoApiKey,
    setVolcanoModel,
    setDashscopeApiKey,
    setDashscopeModel,
    setOcrAutoGenerate,
    setOcrEngine,
    setPaddleocrServerUrl,
    setPaddleocrLanguage,
    setTailscaleAuthKey,
    showToast,
    setUserProfile,
  } = useApp()
  const navigate = useNavigate()

  const [uploadingSettings, setUploadingSettings] = useState(false)
  const [syncingSettings, setSyncingSettings] = useState(false)
  const [uploadingProfile, setUploadingProfile] = useState(false)
  const [downloadingProfile, setDownloadingProfile] = useState(false)
  const [confirmSyncSettings, setConfirmSyncSettings] = useState(false)
  const [confirmUploadSettings, setConfirmUploadSettings] = useState(false)
  const [confirmDownloadProfile, setConfirmDownloadProfile] = useState(false)

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  const handleUploadSettings = async () => {
    setConfirmUploadSettings(false)
    setUploadingSettings(true)
    try {
      const settingsData = {}
      for (const key of SYNCED_SETTING_KEYS) {
        settingsData[key] = state[key]
      }
      // PC 引擎代理配置（独立存储于 localStorage，不在 AppContext state 中）
      // 仅在已配置 host 时上传，避免空配置覆盖云端有效配置
      const pcConfig = getPcEngineConfig()
      if (pcConfig.host) {
        settingsData.pcEngineConfig = pcConfig
      }
      // Tailscale 自动连接开关（独立存储于 localStorage）
      settingsData.tailscaleAutoConnect = localStorage.getItem('tailscale_auto_connect') === 'true'
      const result = await saveCloudSettingsStructured(supabase, settingsData)
      if (result.success) {
        showToast('设置上传成功')
      } else {
        showToast(result.error?.message || '上传失败', 'error')
      }
    } catch (_) {
      showToast('上传失败，请检查网络连接', 'error')
    } finally {
      setUploadingSettings(false)
    }
  }

  const handleSyncSettings = async () => {
    setConfirmSyncSettings(false)
    setSyncingSettings(true)
    try {
      const result = await fetchCloudSettingsStructured(supabase)
      if (!result.success) {
        showToast(result.error?.message || '同步失败', 'error')
        return
      }

      if (!result.data) {
        showToast('云端尚无保存的设置', 'error')
        return
      }

      const extracted = extractSettingsForApp(result.data)

      const setterMap = {
        apiKey: setApiKey,
        model: setModel,
        fontSize: setFontSize,
        eyeProtection: setEyeProtection,
        speechMode: setSpeechMode,
        speechApiUrl: setSpeechApiUrl,
        speechApiKey: setSpeechApiKey,
        inputBarMode: setInputBarMode,
        iflytekAppId: setIflytekAppId,
        iflytekApiSecret: setIflytekApiSecret,
        aiServiceMode: setAiServiceMode,
        iflytekSparkModel: setIflytekSparkModel,
        iflytekSparkApiKey: setIflytekSparkApiKey,
        iflytekSparkApiSecret: setIflytekSparkApiSecret,
        whisperApiUrl: setWhisperApiUrl,
        whisperApiKey: setWhisperApiKey,
        iflytekIatAppId: setIflytekIatAppId,
        iflytekIatApiKey: setIflytekIatApiKey,
        iflytekIatApiSecret: setIflytekIatApiSecret,
        volcanoApiKey: setVolcanoApiKey,
        volcanoModel: setVolcanoModel,
        dashscopeApiKey: setDashscopeApiKey,
        dashscopeModel: setDashscopeModel,
        ocrAutoGenerate: setOcrAutoGenerate,
        ocrEngine: setOcrEngine,
        paddleocrServerUrl: setPaddleocrServerUrl,
        paddleocrLanguage: setPaddleocrLanguage,
        tailscaleAuthKey: setTailscaleAuthKey,
      }

      for (const [key, value] of Object.entries(extracted)) {
        if (setterMap[key]) {
          setterMap[key](value)
        }
      }

      // PC 引擎代理配置（独立存储于 localStorage）
      if (extracted.pcEngineConfig && typeof extracted.pcEngineConfig === 'object') {
        setPcEngineConfig(extracted.pcEngineConfig)
      }
      // Tailscale 自动连接开关（独立存储于 localStorage）
      if (typeof extracted.tailscaleAutoConnect === 'boolean') {
        localStorage.setItem('tailscale_auto_connect', extracted.tailscaleAutoConnect ? 'true' : 'false')
      }

      showToast('设置同步完成')
    } catch (_) {
      showToast('同步失败，请检查网络连接', 'error')
    } finally {
      setSyncingSettings(false)
    }
  }

  const handleUploadProfile = async () => {
    setUploadingProfile(true)
    try {
      // 完整传递当前用户资料所有字段，避免自定义头像（base64）被覆盖为预设头像
      const profile = state.userProfile || {}
      await setUserProfile({
        nickname: profile.nickname || '',
        avatarUrl: profile.avatarUrl || 'avatar_1',
        avatarType: profile.avatarType || 'preset',
        tags: profile.tags || [],
      })
      showToast('用户资料上传成功')
    } catch (_) {
      showToast('上传失败，请检查网络连接', 'error')
    } finally {
      setUploadingProfile(false)
    }
  }

  const handleDownloadProfile = async () => {
    setConfirmDownloadProfile(false)
    setDownloadingProfile(true)
    try {
      const result = await getUserProfile()
      await setUserProfile(result)
      showToast('用户资料下载完成')
    } catch (_) {
      showToast('下载失败，请检查网络连接', 'error')
    } finally {
      setDownloadingProfile(false)
    }
  }

  const currentAvatar = state.userProfile?.avatarUrl
    ? getPresetAvatarById(state.userProfile.avatarUrl)
    : getPresetAvatarById('avatar_1')
  const currentNickname = state.userProfile?.nickname || '未设置昵称'

  const isLoggedOut = !state.isLoggedIn

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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <span className="settings-sub-title">云端同步</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        {isLoggedOut && (
          <div className="settings-section">
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
              fontSize: 15,
              background: 'var(--color-surface)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>☁️</div>
              <div>请先登录云端账号</div>
              <div style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text-muted)' }}>
                登录后可使用云端同步功能
              </div>
            </div>
          </div>
        )}

        {/* Section 1: 设置同步 */}
        <div className="settings-section">
          <h3 className="settings-section-title">设置同步</h3>
          <div className="settings-card">
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                将全部设置字段（API Key、模型选择、语音配置、OCR、Tailscale、PC引擎代理等）上传到云端或从云端恢复
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, minHeight: 44 }}
                onClick={() => setConfirmUploadSettings(true)}
                disabled={uploadingSettings || syncingSettings}
              >
                {uploadingSettings ? '上传中…' : '上传所有设置'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: 44 }}
                onClick={() => setConfirmSyncSettings(true)}
                disabled={uploadingSettings || syncingSettings}
              >
                {syncingSettings ? '同步中…' : '从云端同步'}
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: 用户资料同步 */}
        <div className="settings-section">
          <h3 className="settings-section-title">用户资料同步</h3>
          <div className="settings-card">
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                同步头像和昵称到云端
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: 'var(--color-bg)',
                borderRadius: 10,
              }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'var(--color-primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0,
                }}>
                  {currentAvatar.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
                    {currentNickname}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    当前头像：{currentAvatar.label}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, minHeight: 44 }}
                onClick={handleUploadProfile}
                disabled={uploadingProfile || downloadingProfile}
              >
                {uploadingProfile ? '上传中…' : '上传资料'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: 44 }}
                onClick={() => setConfirmDownloadProfile(true)}
                disabled={uploadingProfile || downloadingProfile}
              >
                {downloadingProfile ? '下载中…' : '下载资料'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0 24px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          AI 背诵卡片
        </div>
      </div>

      <ConfirmDialog
        open={confirmUploadSettings}
        title="上传设置到云端"
        message="将用本地设置覆盖云端设置，此操作不可撤销"
        onCancel={() => setConfirmUploadSettings(false)}
        onConfirm={handleUploadSettings}
      />

      <ConfirmDialog
        open={confirmSyncSettings}
        title="从云端同步设置"
        message="将用云端设置覆盖本地设置，此操作不可撤销"
        onCancel={() => setConfirmSyncSettings(false)}
        onConfirm={handleSyncSettings}
      />

      <ConfirmDialog
        open={confirmDownloadProfile}
        title="从云端下载资料"
        message="将用云端资料覆盖本地头像和昵称"
        onCancel={() => setConfirmDownloadProfile(false)}
        onConfirm={handleDownloadProfile}
      />
    </div>
  )
}