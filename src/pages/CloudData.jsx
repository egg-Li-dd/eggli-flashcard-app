import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { dbInstance } from '../services/db'
import { supabase } from '../services/cloudbase'
import {
  syncEngine,
  uploadTableToCloud,
  getCloudTableData,
  pullTableFromCloud,
} from '../services/sync'
import {
  saveCloudSettingsStructured,
  fetchCloudSettingsStructured,
  extractSettingsForApp,
  SYNCED_SETTING_KEYS,
} from '../services/settingsSync'
import { saveUserProfile, getUserProfile } from '../services/userProfile'

const DATA_ITEMS = [
  { key: 'knowledge_tree', table: 'knowledge_tree', name: '知识树', desc: '分类、主题、章节、单元、知识点的统一树形结构', priority: 1 },
  { key: 'cards', table: 'cards', name: '卡片', desc: '核心卡片数据（正面、背面、记忆参数等）' },
  { key: 'card_status', table: 'card_status', name: '学习状态', desc: '已掌握/学习中及艾宾浩斯计划状态' },
  { key: 'bookmarks', table: 'bookmarks', name: '书签', desc: '收藏的卡片' },
  { key: 'wrong_answers', table: 'wrong_answers', name: '错题记录', desc: '错题本的错误记录' },
  { key: 'test_questions', table: 'test_questions', name: '检测题目', desc: '单元检测题库（单选/多选/判断/填空）' },
  { key: 'test_records', table: 'test_records', name: '答题记录', desc: '每次检测的成绩、耗时、详情' },
  { key: 'test_sessions', table: 'test_sessions', name: '答题会话', desc: '未完成的答题进度（断点续考）' },
  { key: 'review_history', table: 'review_history', name: '复习历史', desc: '每次复习的操作来源、结果、时间等记录' },
  { key: 'study_plans', table: 'study_plans', name: '学习计划', desc: '每日复习上限、每日新学上限等配置' },
  { key: 'drafts', table: 'drafts', name: '草稿', desc: '悬浮窗快速录入的待生成草稿' },
  { key: 'link_generation_runs', table: 'link_generation_runs', name: '联结题库记录', desc: '联结题库历史记录' },
  { key: 'user_settings', table: 'user_settings', name: '设置', desc: 'AI 服务、语音识别、显示偏好等配置', kind: 'settings' },
  { key: 'user_profiles', table: 'user_profiles', name: '用户资料', desc: '昵称、头像、个人标签', kind: 'profile' },
]

function formatTime(ts) {
  if (!ts) return '从未同步'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ConfirmDialog({ open, title, message, onCancel, onConfirm, confirmText, danger }) {
  if (!open) return null
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--color-surface)', borderRadius: 12, padding: 20, margin: 16,
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
          }}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

export default function CloudData() {
  const {
    state,
    showToast,
    loadCategories,
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
    setPaddleocrLanguage,
    setUserProfile,
    loadUserProfile,
  } = useApp()
  const navigate = useNavigate()

  const [globalOp, setGlobalOp] = useState(null) // 'upload' | 'download' | null
  const [itemOps, setItemOps] = useState({})
  const [localCounts, setLocalCounts] = useState({})
  const [cloudCounts, setCloudCounts] = useState({})
  const [cloudErrors, setCloudErrors] = useState({}) // 记录各表云端查询错误原因
  const [lastSync, setLastSync] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, title: '', message: '', onConfirm: null, danger: false })
  const [isLoading, setIsLoading] = useState(true) // 统一加载状态：防止永远停在"加载中"
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '', visible: false })
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefreshTime, setLastRefreshTime] = useState(null)

  useEffect(() => {
    refreshStats()
  }, [])

  // 自动刷新：每 30 秒刷新一次（仅在开启时）
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      refreshStats()
    }, 30000)
    return () => clearInterval(timer)
  }, [autoRefresh])

  async function refreshStats() {
    // 分别获取本地 & 云端计数，任何一侧失败都不应阻塞另一侧
    try {
      await Promise.all([refreshLocalCounts(), refreshCloudCounts()])
      setLastSync(syncEngine.getLastSyncTime())
      setLastRefreshTime(Date.now())
    } catch (err) {
      console.error('[CloudData] refreshStats error', err)
    } finally {
      setIsLoading(false) // 关键：无论成功失败都关闭加载状态
    }
  }

  // 本地 Dexie 计数：并行多个 table 的 count()，单个失败记 0。
  // 注意：本地表名是 camelCase（cardStatus），云端表名是 snake_case（card_status）。
  // 设置和用户资料使用 state 而非 Dexie。
  async function refreshLocalCounts() {
    try {
      const tables = [
        { key: 'knowledge_tree', table: dbInstance.table('knowledgeTree') },
        { key: 'card_status', table: dbInstance.table('cardStatus') },
        { key: 'bookmarks', table: dbInstance.table('bookmarks') },
        { key: 'wrong_answers', table: dbInstance.table('wrongAnswers') },
        { key: 'test_questions', table: dbInstance.table('testQuestions') },
        { key: 'test_records', table: dbInstance.table('testRecords') },
        { key: 'test_sessions', table: dbInstance.table('testSessions') },
        { key: 'review_history', table: dbInstance.table('reviewHistory') },
        { key: 'study_plans', table: dbInstance.table('studyPlans') },
      ]
      const results = await Promise.allSettled(
        tables.map((t) => t.table.count()),
      )
      const counts = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          counts[tables[i].key] = r.value ?? 0
        } else {
          console.warn('[CloudData] local count failed for', tables[i].key, r.reason)
          counts[tables[i].key] = 0
        }
      })
      // —— 设置和用户资料的本地计数 ——
      // 设置：只要有至少一个同步字段有非默认值，就计为 1
      const hasSettings = SYNCED_SETTING_KEYS.some(function (k) {
        const v = state[k]
        return typeof v === 'string' ? v.length > 0 : v != null
      })
      counts.user_settings = hasSettings ? 1 : 0
      // 用户资料：昵称非空或头像非默认，就计为 1
      const profile = state.userProfile || {}
      const hasProfile = (profile.nickname && profile.nickname.length > 0) || (profile.avatarUrl && profile.avatarUrl !== 'avatar_1')
      counts.user_profiles = hasProfile ? 1 : 0
      setLocalCounts(counts)
    } catch (err) {
      console.error('[CloudData] refreshLocalCounts error', err)
    }
  }

  // 云端计数：并行查询所有表，单个失败记 null 并记录错误原因
  async function refreshCloudCounts() {
    try {
      const results = await Promise.allSettled(
        DATA_ITEMS.map((item) => getCloudTableData(item.table, 1)),
      )
      const cloudMap = {}
      const errorMap = {}
      results.forEach((r, i) => {
        const key = DATA_ITEMS[i].key
        if (r.status === 'fulfilled' && r.value && r.value.success) {
          cloudMap[key] = r.value.total ?? 0
          errorMap[key] = null // 成功时清除错误
        } else {
          // 记录具体错误原因，针对 Bad gateway 提供解决建议
          let errorReason = '未连接'
          let errorMsg = ''
          if (r.status === 'rejected') {
            console.warn('[CloudData] cloud count failed for', key, r.reason)
            errorReason = '网络错误'
            errorMsg = String(r.reason?.message || r.reason || '')
          } else if (r.value) {
            if (r.value.reason === 'not_logged_in') {
              errorReason = '请先登录'
            } else if (r.value.reason === 'not_configured') {
              errorReason = '未配置云端'
            } else if (r.value.reason === 'network_slow' || r.value.reason === 'network_error') {
              errorReason = '网络较慢'
            } else {
              console.warn('[CloudData] cloud count returned error for', key, r.value.error)
              errorMsg = String(r.value.error || '')
              // 针对 Bad gateway 错误提供友好提示
              if (errorMsg.includes('Bad gateway') || errorMsg.includes('BAD_GATEWAY')) {
                errorReason = '数据库未配置 RLS 策略'
              } else if (errorMsg.includes('permission') || errorMsg.includes('RLS') || errorMsg.includes('42501')) {
                errorReason = '权限不足'
              } else if (errorMsg.includes('relation') || errorMsg.includes('42P01')) {
                errorReason = '表未创建'
              } else {
                errorReason = errorMsg.slice(0, 30) || '查询失败'
              }
            }
          }
          cloudMap[key] = null
          errorMap[key] = errorReason
        }
      })
      setCloudCounts(cloudMap)
      setCloudErrors(errorMap)
    } catch (err) {
      console.error('[CloudData] refreshCloudCounts error', err)
      // 即使整体失败，也要把 cloudMap 设为 null 以关闭"加载中"
      const fallback = {}
      const errorFallback = {}
      DATA_ITEMS.forEach((item) => {
        fallback[item.key] = null
        errorFallback[item.key] = '查询失败'
      })
      setCloudCounts(fallback)
      setCloudErrors(errorFallback)
    }
  }

  function showConfirm(title, message, onConfirm, danger) {
    setConfirm({ open: true, title, message, onConfirm, danger })
  }

  async function handleGlobalUpload() {
    if (!state.isLoggedIn || state.user?.local) {
      showToast('请先登录云端账号', 'error')
      return
    }
    showConfirm('确认一键上传？', '将把本地所有数据（知识树、学习状态、书签）覆盖上传到云端，云端原有对应数据将被替换。此操作不可撤销。',
      async () => {
        setConfirm({ ...confirm, open: false })
        setGlobalOp('upload')

        try {
          const uploadItems = DATA_ITEMS.filter(item => !item.noUpload && !item.kind)
          const uploadResults = []
          setProgress({ current: 0, total: uploadItems.length + 1, currentName: '开始上传', visible: true })

          for (let i = 0; i < uploadItems.length; i++) {
            const item = uploadItems[i]
            setProgress({ current: i, total: uploadItems.length + 1, currentName: `正在上传${item.name}...`, visible: true })
            const r = await uploadTableToCloud(dbInstance, item.table)
            if (!r.success) throw new Error(r.error || `${item.name}上传失败`)
            uploadResults.push({ name: item.name, count: r.count })
          }

          // 同时上传云端设置
          setProgress({ current: uploadItems.length, total: uploadItems.length + 1, currentName: '正在上传设置...', visible: true })
          try {
            const settingsData = {}
            for (const k of SYNCED_SETTING_KEYS) settingsData[k] = state[k]
            await saveCloudSettingsStructured(supabase, settingsData)
          } catch (e) {
            console.warn('[CloudData] 全量上传时云端设置同步失败:', e.message)
          }

          setProgress({ current: uploadItems.length + 1, total: uploadItems.length + 1, currentName: '完成', visible: false })
          // 显示详细的同步统计
          const details = uploadResults.map(r => `${r.count}个${r.name}`)
          const detailText = details.length > 0 ? `（${details.join('、')}）` : ''
          showToast('全量上传成功' + detailText, 'success')
          await loadCategories()
          refreshStats()
        } catch (err) {
          setProgress(p => ({ ...p, visible: false }))
          // 针对不同错误类型提供更友好的提示
          let errorMsg = err.message || '未知错误'
          if (err.reason === 'network_slow' || err.reason === 'timeout_error') {
            errorMsg = '网络连接超时，请检查网络后重试'
          } else if (err.reason === 'not_logged_in') {
            errorMsg = '请先登录云端账号'
          } else if (err.reason === 'not_configured') {
            errorMsg = '请先配置 CloudBase 环境'
          } else if (errorMsg.includes('Bad gateway') || errorMsg.includes('BAD_GATEWAY')) {
            errorMsg = '数据库未配置 RLS 策略，请在 CloudBase 控制台执行 RLS 策略 SQL'
          }
          showToast('上传失败：' + errorMsg, 'error')
        } finally {
          setGlobalOp(null)
          setProgress(p => ({ ...p, visible: false }))
        }
      }, true)
  }

  async function handleGlobalDownload() {
    if (!state.isLoggedIn || state.user?.local) {
      showToast('请先登录云端账号', 'error')
      return
    }
    showConfirm('确认从云端下载？', '将把云端所有数据下载覆盖到本地，本地现有数据将被替换。',
      async () => {
        setConfirm({ ...confirm, open: false })
        setGlobalOp('download')

        try {
          setProgress({ current: 0, total: 2, currentName: '正在下载数据...', visible: true })
          const result = await syncEngine.pullFromCloud(dbInstance)
          if (!result.success) throw new Error(result.error || '下载失败')

          setProgress({ current: 1, total: 2, currentName: '正在下载设置...', visible: true })
          // 同时下载云端设置
          try {
            const settingsResult = await fetchCloudSettingsStructured(supabase)
            if (settingsResult.success && settingsResult.data) {
              const extracted = extractSettingsForApp(settingsResult.data)
              const setterMap = {
                apiKey: setApiKey, model: setModel, fontSize: setFontSize,
                eyeProtection: setEyeProtection, speechMode: setSpeechMode,
                speechApiUrl: setSpeechApiUrl, speechApiKey: setSpeechApiKey,
                inputBarMode: setInputBarMode, iflytekAppId: setIflytekAppId,
                iflytekApiSecret: setIflytekApiSecret, aiServiceMode: setAiServiceMode,
                iflytekSparkModel: setIflytekSparkModel, iflytekSparkApiKey: setIflytekSparkApiKey,
                iflytekSparkApiSecret: setIflytekSparkApiSecret, whisperApiUrl: setWhisperApiUrl,
                whisperApiKey: setWhisperApiKey, iflytekIatAppId: setIflytekIatApiKey,
                iflytekIatApiKey: setIflytekIatApiKey, iflytekIatApiSecret: setIflytekIatApiSecret,
                volcanoApiKey: setVolcanoApiKey, volcanoModel: setVolcanoModel,
                dashscopeApiKey: setDashscopeApiKey, dashscopeModel: setDashscopeModel,
                ocrAutoGenerate: setOcrAutoGenerate, ocrEngine: setOcrEngine,
              }
              for (const [k, v] of Object.entries(extracted)) {
                if (setterMap[k]) {
                  setterMap[k](v)
                } else if (k === 'pcEngineConfig' && typeof v === 'object') {
                  localStorage.setItem('pc_engine_config', JSON.stringify(v))
                }
              }
            }
          } catch (e) {
            console.warn('[CloudData] 全量下载时云端设置同步失败:', e.message)
          }

          setProgress({ current: 2, total: 2, currentName: '完成', visible: false })
          // 显示详细的同步统计
          const stats = result.stats || {}
          const details = []
          if (stats.knowledgeTree) details.push(`${stats.knowledgeTree}条知识树记录`)
          if (stats.statuses) details.push(`${stats.statuses}条学习状态`)
          if (stats.bookmarks) details.push(`${stats.bookmarks}个书签`)
          if (stats.wrongAnswers) details.push(`${stats.wrongAnswers}条错题`)
          const detailText = details.length > 0 ? `（${details.join('、')}）` : ''
          showToast('全量下载成功' + detailText, 'success')
          await loadCategories()
          refreshStats()
        } catch (err) {
          setProgress(p => ({ ...p, visible: false }))
          // 针对不同错误类型提供更友好的提示
          let errorMsg = err.message || '未知错误'
          if (err.reason === 'network_slow' || err.reason === 'timeout_error') {
            errorMsg = '网络连接超时，请检查网络后重试'
          } else if (err.reason === 'not_logged_in') {
            errorMsg = '请先登录云端账号'
          } else if (err.reason === 'not_configured') {
            errorMsg = '请先配置 CloudBase 环境'
          } else if (errorMsg.includes('Bad gateway') || errorMsg.includes('BAD_GATEWAY')) {
            errorMsg = '数据库未配置 RLS 策略，请在 CloudBase 控制台执行 RLS 策略 SQL'
          }
          showToast('下载失败：' + errorMsg, 'error')
        } finally {
          setGlobalOp(null)
          setProgress(p => ({ ...p, visible: false }))
        }
      }, false)
  }

  async function handleItemUpload(item) {
    if (!state.isLoggedIn || state.user?.local) {
      showToast('请先登录云端账号', 'error')
      return
    }

    // —— 设置上传 ——
    if (item.kind === 'settings') {
      showConfirm(`覆盖上传「${item.name}」？`, `将用本地设置替换云端配置。此操作不可撤销。`,
        async () => {
          setConfirm({ ...confirm, open: false })
          setItemOps((s) => ({ ...s, [item.key]: 'upload' }))
          try {
            const settingsData = {}
            for (const k of SYNCED_SETTING_KEYS) settingsData[k] = state[k]
            const r = await saveCloudSettingsStructured(supabase, settingsData)
            if (!r.success) throw new Error(r.error || '上传失败')
            showToast(item.name + '上传成功', 'success')
            refreshStats()
          } catch (err) {
            showToast('上传失败：' + (err.message || '未知错误'), 'error')
          } finally {
            setItemOps((s) => ({ ...s, [item.key]: null }))
          }
        }, true)
      return
    }

    // —— 用户资料上传 ——
    if (item.kind === 'profile') {
      showConfirm(`覆盖上传「${item.name}」？`, `将用本地昵称/头像替换云端资料。此操作不可撤销。`,
        async () => {
          setConfirm({ ...confirm, open: false })
          setItemOps((s) => ({ ...s, [item.key]: 'upload' }))
          try {
            const profile = state.userProfile || {}
            const r = await saveUserProfile({
              nickname: profile.nickname || '',
              avatarUrl: profile.avatarUrl || 'avatar_1',
              avatarType: profile.avatarType || 'preset',
              tags: profile.tags || [],
            })
            if (!r.success) throw new Error(r.error?.message || '上传失败')
            showToast(item.name + '上传成功', 'success')
            refreshStats()
          } catch (err) {
            showToast('上传失败：' + (err.message || '未知错误'), 'error')
          } finally {
            setItemOps((s) => ({ ...s, [item.key]: null }))
          }
        }, true)
      return
    }

    // —— 普通 Dexie 数据 ——
    showConfirm(`覆盖上传「${item.name}」？`, `将用本地${item.name}数据替换云端对应数据。此操作不可撤销。`,
      async () => {
        setConfirm({ ...confirm, open: false })
        setItemOps((s) => ({ ...s, [item.key]: 'upload' }))

        try {
          const r = await uploadTableToCloud(dbInstance, item.table)
          if (!r.success) throw new Error(r.error || '上传失败')
          showToast(item.name + '上传成功（' + r.count + '条）', 'success')
          refreshStats()
        } catch (err) {
          showToast('上传失败：' + (err.message || '未知错误'), 'error')
        } finally {
          setItemOps((s) => ({ ...s, [item.key]: null }))
        }
      }, true)
  }

  async function handleItemDownload(item) {
    if (!state.isLoggedIn || state.user?.local) {
      showToast('请先登录云端账号', 'error')
      return
    }

    // —— 设置下载 ——
    if (item.kind === 'settings') {
      showConfirm(`确认从云端下载「${item.name}」？`, '将用云端设置覆盖本地配置。',
        async () => {
          setItemOps((s) => ({ ...s, [item.key]: 'download' }))
          try {
            const r = await fetchCloudSettingsStructured(supabase)
            if (!r.success) throw new Error(r.error || '下载失败')
            if (!r.data) {
              showToast('云端暂无保存的设置', 'error')
            } else {
              const extracted = extractSettingsForApp(r.data)
              const setterMap = {
                apiKey: setApiKey, model: setModel, fontSize: setFontSize,
                eyeProtection: setEyeProtection, speechMode: setSpeechMode,
                speechApiUrl: setSpeechApiUrl, speechApiKey: setSpeechApiKey,
                inputBarMode: setInputBarMode, iflytekAppId: setIflytekAppId,
                iflytekApiSecret: setIflytekApiSecret, aiServiceMode: setAiServiceMode,
                iflytekSparkModel: setIflytekSparkModel, iflytekSparkApiKey: setIflytekSparkApiKey,
                iflytekSparkApiSecret: setIflytekSparkApiSecret, whisperApiUrl: setWhisperApiUrl,
                whisperApiKey: setWhisperApiKey, iflytekIatAppId: setIflytekIatApiKey,
                iflytekIatApiKey: setIflytekIatApiKey, iflytekIatApiSecret: setIflytekIatApiSecret,
                volcanoApiKey: setVolcanoApiKey, volcanoModel: setVolcanoModel,
                dashscopeApiKey: setDashscopeApiKey, dashscopeModel: setDashscopeModel,
                ocrAutoGenerate: setOcrAutoGenerate, ocrEngine: setOcrEngine,
              }
              for (const [k, v] of Object.entries(extracted)) {
                if (setterMap[k]) {
                  setterMap[k](v)
                } else if (k === 'pcEngineConfig' && typeof v === 'object') {
                  localStorage.setItem('pc_engine_config', JSON.stringify(v))
                }
              }
              showToast(item.name + '下载成功', 'success')
            }
            refreshStats()
          } catch (err) {
            showToast('下载失败：' + (err.message || '未知错误'), 'error')
          } finally {
            setItemOps((s) => ({ ...s, [item.key]: null }))
          }
        }, false)
      return
    }

    // —— 用户资料下载 ——
    if (item.kind === 'profile') {
      showConfirm(`确认从云端下载「${item.name}」？`, '将用云端昵称/头像覆盖本地资料。',
        async () => {
          setItemOps((s) => ({ ...s, [item.key]: 'download' }))
          try {
            const profile = await getUserProfile()
            if (!profile) throw new Error('云端暂无用户资料')
            await setUserProfile(profile)
            showToast(item.name + '下载成功', 'success')
            refreshStats()
          } catch (err) {
            showToast('下载失败：' + (err.message || '未知错误'), 'error')
          } finally {
            setItemOps((s) => ({ ...s, [item.key]: null }))
          }
        }, false)
      return
    }

    // —— 普通 Dexie 数据 ——
    showConfirm(`确认从云端下载「${item.name}」？`, '将用云端数据覆盖本地数据。',
      async () => {
        setItemOps((s) => ({ ...s, [item.key]: 'download' }))
        try {
          const r = await pullTableFromCloud(dbInstance, item.table)
          if (!r.success) throw new Error(r.error || '下载失败')
          showToast(item.name + '下载成功（' + r.count + '条）', 'success')
          await loadCategories()
          refreshStats()
        } catch (err) {
          showToast('下载失败：' + (err.message || '未知错误'), 'error')
        } finally {
          setItemOps((s) => ({ ...s, [item.key]: null }))
        }
      }, false)
  }

  function handleItemView(item) {
    navigate('/cloud-data/' + item.table)
  }

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: 'var(--color-bg)', WebkitUserSelect: 'none', userSelect: 'none' }}
      onContextMenu={preventTextMenu}
      
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-light)', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, minWidth: 36 }} aria-label="返回">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>云端数据处理</h2>
      </div>

      <div className="anim-slide-in-up" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {/* 云端状态展示区域 */}
        <div style={{
          padding: 14, marginBottom: 14, borderRadius: 12,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-light)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
              云端状态
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* 自动刷新开关 */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11,
                  border: `1px solid ${autoRefresh ? 'var(--color-success)' : 'var(--color-border-light)'}`,
                  background: autoRefresh ? 'var(--color-success-light)' : 'transparent',
                  color: autoRefresh ? 'var(--color-success-dark)' : 'var(--color-text-secondary)',
                  cursor: 'pointer', minHeight: 28,
                }}
              >
                {autoRefresh ? '自动刷新 ON' : '自动刷新 OFF'}
              </button>
              {/* 手动刷新按钮 */}
              <button
                onClick={() => refreshStats()}
                disabled={isLoading}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11,
                  border: '1px solid var(--color-border-light)',
                  background: 'transparent', color: 'var(--color-primary)',
                  cursor: isLoading ? 'not-allowed' : 'pointer', minHeight: 28,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {isLoading ? (
                  <><span style={{ width: 12, height: 12, border: '1.5px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />刷新中</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>刷新</>
                )}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {state.user?.local ? (
              <span style={{ color: 'var(--color-warning-dark)' }}>当前为本地模式，无法使用云端功能，请先登录/注册账号。</span>
            ) : (
              <>
                <div>账号：{state.user?.email || '—'}</div>
                <div>最后同步：{formatTime(lastSync)}</div>
                <div>最后刷新：{lastRefreshTime ? formatTime(lastRefreshTime) : '从未'}</div>
              </>
            )}
          </div>
          {/* 统计概览 */}
          {!state.user?.local && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border-light)' }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>
                  {Object.values(localCounts).reduce((a, b) => a + (b || 0), 0)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>本地数据</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-success)' }}>
                  {Object.values(cloudCounts).reduce((a, b) => a + (b || 0), 0)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>云端数据</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  {DATA_ITEMS.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>数据表</div>
              </div>
            </div>
          )}
        </div>

        {/* 进度条显示 */}
        {progress.visible && (
          <div style={{
            padding: 12, marginBottom: 14, borderRadius: 10,
            backgroundColor: 'var(--color-primary-light)',
            border: '1px solid var(--color-primary)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary-dark)' }}>
                {progress.currentName}
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {progress.current}/{progress.total}
              </span>
            </div>
            <div style={{
              height: 6, borderRadius: 3, backgroundColor: 'var(--color-bg-offset)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                backgroundColor: 'var(--color-primary)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* 错误提示（当所有云端查询都失败时显示） */}
        {!state.user?.local && Object.values(cloudErrors).some(e => e && e.includes('RLS')) && (
          <div style={{
            padding: 12, marginBottom: 14, borderRadius: 10,
            backgroundColor: 'var(--color-danger-light)',
            border: '1px solid var(--color-danger)',
            fontSize: 12, color: 'var(--color-danger-dark)', lineHeight: 1.6,
          }}>
            <strong>云端数据库未配置 RLS 策略</strong>
            <br />
            请在 CloudBase 控制台 → 数据库 → SQL 编辑器中执行 cloudbase-postgresql-schema.sql 中的 RLS 策略部分（第 259 行之后），为所有表启用行级安全策略。
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={handleGlobalUpload} disabled={!!globalOp} style={{
            flex: 1, minHeight: 56, border: 'none', borderRadius: 12,
            background: globalOp === 'upload' ? 'var(--color-accent)' : 'var(--color-accent)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: globalOp ? 'not-allowed' : 'pointer',
            opacity: globalOp && globalOp !== 'upload' ? 0.55 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            {globalOp === 'upload' ? (
              <><span style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />上传中...</>
            ) : (
              <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>一键上传</>
            )}
          </button>

          <button onClick={handleGlobalDownload} disabled={!!globalOp} style={{
            flex: 1, minHeight: 56, border: 'none', borderRadius: 12,
            background: 'var(--color-primary)', color: '#fff', fontSize: 15, fontWeight: 700,
            cursor: globalOp ? 'not-allowed' : 'pointer',
            opacity: globalOp && globalOp !== 'download' ? 0.55 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            {globalOp === 'download' ? (
              <><span style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />下载中...</>
            ) : (
              <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>一键下载</>
            )}
          </button>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 10, paddingLeft: 4 }}>分项数据管理</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DATA_ITEMS.map((item) => {
            const busy = itemOps[item.key]
            const local = localCounts[item.key]
            const cloud = cloudCounts[item.key]
            const cloudError = cloudErrors[item.key]
            // 根据错误类型显示不同提示
            const cloudDisplay = cloud === null
              ? (cloudError || '未连接')
              : (isLoading && cloud === undefined)
                ? '加载中'
                : `${cloud} 条`
            return (
              <div key={item.key} className="card-interactive" style={{
                backgroundColor: 'var(--color-surface)', borderRadius: 12, padding: 14,
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)', border: '1px solid var(--color-border-light)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>{item.desc}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>本地：{local !== undefined ? local : 0} 条</span>
                  <span>·</span>
                  <span style={{ color: cloud === null ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>云端：{cloudDisplay}</span>
                  <span>·</span>
                  <span>同步：{formatTime(lastSync)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleItemUpload(item)} disabled={item.noUpload || !!busy || !!globalOp} style={{
                    flex: 1, minHeight: 44, border: '1px solid var(--color-border-light)',
                    background: item.noUpload ? 'var(--color-bg)' : (busy === 'upload' ? 'var(--color-accent)' : 'transparent'),
                    color: item.noUpload ? 'var(--color-text-muted)' : (busy === 'upload' ? '#fff' : 'var(--color-accent)'),
                    borderRadius: 8, fontSize: 14, fontWeight: 600,
                    cursor: item.noUpload || busy || globalOp ? 'not-allowed' : 'pointer',
                    opacity: item.noUpload || (busy && busy !== 'upload') ? 0.55 : 1,
                  }}>{item.noUpload ? '不可上传' : (busy === 'upload' ? '上传中…' : '数据上传')}</button>

                  <button onClick={() => handleItemDownload(item)} disabled={!!busy || !!globalOp} style={{
                    flex: 1, minHeight: 44, border: '1px solid var(--color-primary)',
                    background: busy === 'download' ? 'var(--color-primary)' : 'transparent',
                    color: busy === 'download' ? '#fff' : 'var(--color-primary)',
                    borderRadius: 8, fontSize: 14, fontWeight: 600,
                    cursor: busy || globalOp ? 'not-allowed' : 'pointer',
                    opacity: busy && busy !== 'download' ? 0.55 : 1,
                  }}>{busy === 'download' ? '下载中…' : '数据下载'}</button>

                  <button onClick={() => handleItemView(item)} disabled={!!globalOp} style={{
                    flex: 1, minHeight: 44, border: '1px solid var(--color-border-light)',
                    background: 'transparent', color: 'var(--color-text)',
                    borderRadius: 8, fontSize: 14, fontWeight: 600,
                    cursor: globalOp ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>云端数据
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ height: 24 }} />
      </div>

      <ConfirmDialog open={confirm.open} title={confirm.title} message={confirm.message} danger={confirm.danger} confirmText={confirm.danger ? '确认覆盖/删除' : '确定'} onCancel={() => setConfirm({ ...confirm, open: false })} onConfirm={() => confirm.onConfirm && confirm.onConfirm()} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
