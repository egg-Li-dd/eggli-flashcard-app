import { useState, useRef, useEffect } from 'react'
import { getPresetAvatars, getPresetAvatarById, uploadCustomAvatar } from '../services/userProfile'

export default function ProfileEditDialog({
  visible,
  profile,
  onSave,
  onCancel,
  showToast,
}) {
  const [nickname, setNickname] = useState('')
  const [avatarId, setAvatarId] = useState('avatar_1')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarType, setAvatarType] = useState('preset')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)
  const dialogRef = useRef(null)

  // 初始化表单数据
  useEffect(() => {
    if (visible && profile) {
      setNickname(profile.nickname || '')
      setAvatarId(profile.avatarUrl || 'avatar_1')
      setAvatarUrl(profile.avatarUrl || '')
      setAvatarType(profile.avatarType || 'preset')
      setTags(profile.tags || [])
      setTagInput('')
    }
  }, [visible, profile])

  // ESC 键关闭
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && visible) {
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [visible, onCancel])

  if (!visible) return null

  const presetAvatars = getPresetAvatars()

  // 处理预设头像选择
  const handleSelectPreset = (id) => {
    setAvatarId(id)
    setAvatarType('preset')
  }

  // 处理自定义头像上传
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const base64 = await uploadCustomAvatar(file)
      setAvatarUrl(base64)
      setAvatarType('custom')
    } catch (err) {
      showToast(err.message, 'error')
    }
    // 清空 input，允许重复选择同一文件
    e.target.value = ''
  }

  // 添加标签
  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (!tag) return
    if (tags.length >= 5) {
      showToast('最多添加5个标签', 'error')
      return
    }
    if (tag.length > 10) {
      showToast('每个标签最多10个字符', 'error')
      return
    }
    if (tags.includes(tag)) {
      showToast('标签已存在', 'error')
      return
    }
    setTags([...tags, tag])
    setTagInput('')
  }

  // 删除标签
  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  // 处理标签输入回车
  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  // 保存
  const handleSave = async () => {
    if (saving) return

    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) {
      showToast('请输入昵称', 'error')
      return
    }
    if (trimmedNickname.length > 20) {
      showToast('昵称最多20个字符', 'error')
      return
    }

    setSaving(true)
    try {
      const finalAvatarUrl = avatarType === 'preset' ? avatarId : avatarUrl
      await onSave({
        nickname: trimmedNickname,
        avatarUrl: finalAvatarUrl,
        avatarType,
        tags,
      })
    } finally {
      setSaving(false)
    }
  }

  // 计算当前头像显示
  const getCurrentAvatar = () => {
    if (avatarType === 'custom' && avatarUrl) {
      return avatarUrl
    }
    const preset = getPresetAvatarById(avatarId)
    return preset?.emoji || '😀'
  }

  return (
    <div className="dialog-overlay" onClick={(e) => { e.preventDefault(); onCancel() }}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        style={{
          width: '90%',
          maxWidth: '400px',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* 标题 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text)' }}>
            编辑资料
          </h3>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 昵称输入 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            marginBottom: '6px',
          }}>
            昵称
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="输入你的昵称"
            maxLength={20}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 12px',
              fontSize: '15px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            textAlign: 'right',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            marginTop: '4px',
          }}>
            {nickname.length}/20
          </div>
        </div>

        {/* 头像选择 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            marginBottom: '10px',
          }}>
            头像
          </label>

          {/* 当前头像预览 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '12px',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              flexShrink: 0,
              overflow: 'hidden',
            }}>
              {avatarType === 'custom' && avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="当前头像"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                getCurrentAvatar()
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary btn-sm"
              style={{ minHeight: '40px', fontSize: '13px' }}
            >
              上传自定义头像
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* 预设头像网格 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
          }}>
            {presetAvatars.map((avatar) => (
              <button
                key={avatar.id}
                onClick={() => handleSelectPreset(avatar.id)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 'var(--radius-md)',
                  border: avatarType === 'preset' && avatarId === avatar.id
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                  backgroundColor: avatarType === 'preset' && avatarId === avatar.id
                    ? 'var(--color-primary-light)'
                    : 'var(--color-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  transition: 'all 0.2s',
                }}
                title={avatar.label}
              >
                {avatar.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* 标签管理 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            marginBottom: '10px',
          }}>
            标签（{tags.length}/5）
          </label>

          {/* 已有标签 */}
          {tags.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '10px',
            }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    borderRadius: 'var(--radius-lg)',
                    fontSize: '13px',
                  }}
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '2px',
                      cursor: 'pointer',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 标签输入 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder={tags.length >= 5 ? '已达上限' : '输入标签后回车添加'}
              disabled={tags.length >= 5}
              maxLength={10}
              style={{
                flex: 1,
                minHeight: '40px',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleAddTag}
              disabled={tags.length >= 5 || !tagInput.trim()}
              className="btn btn-secondary btn-sm"
              style={{ minHeight: '40px', minWidth: '60px' }}
            >
              添加
            </button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginTop: '8px',
        }}>
          <button
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: '48px', fontSize: '15px' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ flex: 1, minHeight: '48px', fontSize: '15px', fontWeight: 600 }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
