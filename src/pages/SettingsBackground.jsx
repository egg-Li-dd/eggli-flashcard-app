import { useRef, useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const BG_PRESETS = [
  { value: 'default-light', label: '默认浅色', desc: '清爽蓝白', colors: ['#FFFFFF', '#F8FAFC', '#3B82F6'] },
  { value: 'default-dark', label: '默认深色', desc: '深邃暗夜', colors: ['#0F172A', '#1E293B', '#60A5FA'] },
  { value: 'eye-care', label: '护眼米色', desc: '温暖柔和', colors: ['#F5EFE0', '#FFF8EC', '#D97706'] },
  { value: 'fresh-blue', label: '清新蓝调', desc: '渐变清透', colors: ['#EFF6FF', '#E0F2FE', '#0EA5E9'] },
  { value: 'soft-purple', label: '柔和紫霞', desc: '梦幻优雅', colors: ['#FAF5FF', '#F3E8FF', '#A855F7'] },
  { value: 'minimal-gray', label: '极简灰白', desc: '高对比', colors: ['#F1F5F9', '#E2E8F0', '#475569'] },
]

const BG_IMAGE_MODES = [
  { value: 'cover', label: '填充' },
  { value: 'contain', label: '适应' },
  { value: 'repeat', label: '平铺' },
  { value: 'center', label: '居中' },
]

const CARD_SHADOW_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'light', label: '轻微' },
  { value: 'medium', label: '中等' },
  { value: 'strong', label: '明显' },
]

const CARD_BORDER_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'thin', label: '细线' },
  { value: 'thick', label: '粗线' },
]

const Arrow = () => (
  <svg className="settings-row-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
  </svg>
)

const BackArrow = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const MoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

function getSchemeColors(scheme) {
  const preset = BG_PRESETS.find((p) => p.value === scheme.bgPreset)
  if (preset) return preset.colors
  return ['#FFFFFF', '#F8FAFC', '#3B82F6']
}

export default function SettingsBackground() {
  const {
    state,
    setBgPreset,
    setActiveStyleScheme,
    setBgImage,
    setBgImageMode,
    setBgBlur,
    setBgMaskOpacity,
    setCardRadius,
    setCardShadow,
    setCardBorder,
    setCardOpacity,
    setBtnPrimaryOpacity,
    setBtnSecondaryOpacity,
    showToast,
    saveStyleScheme,
    deleteStyleScheme,
    renameStyleScheme,
    applyStyleScheme,
    resetBackgroundStyle,
    presetStyleSchemes,
  } = useApp()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const schemesScrollRef = useRef(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameId, setRenameId] = useState('')
  const [renameName, setRenameName] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteId, setDeleteId] = useState('')
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState(null)
  const menuRef = useRef(null)

  const allSchemes = [...presetStyleSchemes, ...state.styleSchemes]

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null)
      }
    }
    if (activeMenuId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [activeMenuId])

  const handlePresetClick = (value) => {
    setBgPreset(value)
    setActiveStyleScheme(`preset-${value}`)
  }

  const handleSelectImage = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result === 'string') {
        setBgImage(result)
        // 上传图片后自动设置遮罩透明度，确保图片可见
        if (state.bgMaskOpacity === 0) {
          setBgMaskOpacity(50)
        }
        showToast('背景图片已设置')
      }
    }
    reader.onerror = () => {
      showToast('图片读取失败', 'error')
    }
    reader.readAsDataURL(file)

    e.target.value = ''
  }

  const handleClearBg = () => {
    setBgImage('')
    showToast('背景图片已清除')
  }

  const handleSaveScheme = () => {
    setShowSaveDialog(true)
    setSaveName('')
  }

  const confirmSaveScheme = () => {
    const name = saveName.trim()
    if (!name) {
      showToast('请输入方案名称', 'error')
      return
    }
    const newScheme = saveStyleScheme(name)
    showToast('方案已保存')
    setShowSaveDialog(false)
    setSaveName('')
    setTimeout(() => {
      if (schemesScrollRef.current) {
        schemesScrollRef.current.scrollLeft = schemesScrollRef.current.scrollWidth
      }
    }, 100)
  }

  const handleApplyScheme = (scheme) => {
    applyStyleScheme(scheme)
    setActiveMenuId(null)
  }

  const handleRenameScheme = (scheme) => {
    setRenameId(scheme.id)
    setRenameName(scheme.name)
    setShowRenameDialog(true)
    setActiveMenuId(null)
  }

  const confirmRenameScheme = () => {
    const name = renameName.trim()
    if (!name) {
      showToast('请输入方案名称', 'error')
      return
    }
    renameStyleScheme(renameId, name)
    showToast('方案已重命名')
    setShowRenameDialog(false)
    setRenameId('')
    setRenameName('')
  }

  const handleDeleteScheme = (scheme) => {
    setDeleteId(scheme.id)
    setShowDeleteDialog(true)
    setActiveMenuId(null)
  }

  const confirmDeleteScheme = () => {
    deleteStyleScheme(deleteId)
    showToast('方案已删除')
    setShowDeleteDialog(false)
    setDeleteId('')
  }

  const handleReset = () => {
    setShowResetDialog(true)
  }

  const confirmReset = () => {
    resetBackgroundStyle()
    showToast('已恢复默认设置')
    setShowResetDialog(false)
  }

  const preventTextMenu = (e) => {
    const t = (e && e.target) || null
    const tag = (t && t.tagName) || ''
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t && t.isContentEditable) && e && e.preventDefault) {
      e.preventDefault()
    }
  }

  const handleMenuClick = (e, schemeId) => {
    e.stopPropagation()
    setActiveMenuId(activeMenuId === schemeId ? null : schemeId)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'transparent',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      onContextMenu={preventTextMenu}
    >
      <div className="settings-sub-header">
        <button className="settings-back-btn" onClick={() => navigate('/settings/display')}>
          <BackArrow />
        </button>
        <span className="settings-sub-title">背景与风格</span>
        <div style={{ width: '44px' }} />
      </div>

      <div className="settings-scroll anim-slide-in-up">
        <div className="settings-section">
          <div className="settings-block">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>我的方案</div>
              <button
                onClick={handleSaveScheme}
                style={{
                  fontSize: 13,
                  color: 'var(--color-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                }}
              >
                + 保存
              </button>
            </div>
            <div
              ref={schemesScrollRef}
              style={{
                display: 'flex',
                gap: '12px',
                overflowX: 'auto',
                padding: '4px 2px 8px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {allSchemes.map((scheme) => {
                const isActive = state.activeStyleScheme === scheme.id
                const colors = getSchemeColors(scheme)
                return (
                  <div
                    key={scheme.id}
                    onClick={() => handleApplyScheme(scheme)}
                    style={{
                      flexShrink: 0,
                      width: '120px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-surface)',
                      border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--color-border-light)',
                      boxShadow: isActive ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : 'var(--shadow-sm)',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        height: '70px',
                        background: scheme.bgImage
                          ? `url(${scheme.bgImage}) center/cover`
                          : `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          left: '8px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '5px',
                          backgroundColor: colors[2],
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        }}
                      />
                      {isActive && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            backgroundColor: 'var(--color-primary)',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 500,
                          }}
                        >
                          使用中
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px', position: 'relative' }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--color-text)',
                          marginBottom: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          paddingRight: scheme.type === 'custom' ? '24px' : '0',
                        }}
                      >
                        {scheme.name}
                      </div>
                      {scheme.type === 'preset' ? (
                        <div
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--color-bg-offset)',
                            color: 'var(--color-text-muted)',
                            fontSize: '10px',
                          }}
                        >
                          预设
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--color-primary-light)',
                            color: 'var(--color-primary)',
                            fontSize: '10px',
                          }}
                        >
                          自定义
                        </div>
                      )}
                      {scheme.type === 'custom' && (
                        <div
                          ref={activeMenuId === scheme.id ? menuRef : null}
                          style={{
                            position: 'absolute',
                            right: '6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                          }}
                        >
                          <button
                            onClick={(e) => handleMenuClick(e, scheme.id)}
                            style={{
                              width: '24px',
                              height: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-text-muted)',
                              borderRadius: '4px',
                            }}
                          >
                            <MoreIcon />
                          </button>
                          {activeMenuId === scheme.id && (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: '28px',
                                backgroundColor: 'var(--color-surface)',
                                borderRadius: 'var(--radius-sm)',
                                boxShadow: 'var(--shadow-md)',
                                border: '1px solid var(--color-border-light)',
                                overflow: 'hidden',
                                zIndex: 100,
                                minWidth: '100px',
                              }}
                            >
                              <button
                                onClick={() => handleRenameScheme(scheme)}
                                style={{
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '13px',
                                  color: 'var(--color-text)',
                                  cursor: 'pointer',
                                }}
                              >
                                重命名
                              </button>
                              <button
                                onClick={() => handleDeleteScheme(scheme)}
                                style={{
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '13px',
                                  color: 'var(--color-error)',
                                  cursor: 'pointer',
                                }}
                              >
                                删除
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-block">
            <div className="settings-mb-10" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>预设背景</div>
            {state.bgImage && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: '12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-warning-light)',
                  fontSize: 12,
                  color: 'var(--color-warning)',
                  lineHeight: 1.5,
                }}
              >
                当前已设置自定义背景图片，预设主题的背景色会被图片覆盖。
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
              }}
            >
              {BG_PRESETS.map((preset) => {
                const isSelected = state.bgPreset === preset.value
                return (
                  <div
                    key={preset.value}
                    onClick={() => handlePresetClick(preset.value)}
                    style={{
                      position: 'relative',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-surface)',
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border-light)',
                      boxShadow: isSelected ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : 'var(--shadow-sm)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      overflow: 'hidden',
                      transform: 'scale(1)',
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = 'scale(0.97)'
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    <div
                      style={{
                        height: '80px',
                        background: `linear-gradient(135deg, ${preset.colors[0]} 0%, ${preset.colors[1]} 100%)`,
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '10px',
                          left: '10px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          backgroundColor: preset.colors[2],
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        }}
                      />
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' }}>
                        {preset.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {preset.desc}
                      </div>
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '8px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-primary)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 6px rgba(59, 130, 246, 0.4)',
                          animation: 'bg-preset-check-pop 0.3s ease',
                        }}
                      >
                        <CheckIcon />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-block">
            <div className="settings-mb-10" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>自定义背景</div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {state.bgImage ? (
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    width: '100%',
                    height: '120px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-light)',
                    overflow: 'hidden',
                    marginBottom: '12px',
                    backgroundImage: `url(${state.bgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSelectImage}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      minHeight: '44px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-primary)',
                      color: '#fff',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    更换图片
                  </button>
                  <button
                    onClick={handleClearBg}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      minHeight: '44px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    清除背景
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleSelectImage}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  minHeight: '48px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg-offset)',
                  border: '1px solid var(--color-border-light)',
                  color: 'var(--color-text)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  marginBottom: '16px',
                }}
              >
                选择图片
              </button>
            )}

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                图片显示模式
              </div>
              <div className="settings-segmented">
                {BG_IMAGE_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setBgImageMode(mode.value)}
                    className={'settings-segmented-item' + (state.bgImageMode === mode.value ? ' active' : '')}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>背景模糊度</span>
                <span style={{ fontSize: 14, color: 'var(--color-primary)', fontWeight: 500 }}>{state.bgBlur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={state.bgBlur}
                onChange={(e) => setBgBlur(parseInt(e.target.value, 10))}
                className="settings-slider"
              />
            </div>

            <div style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>背景遮罩透明度</span>
                <span style={{ fontSize: 14, color: 'var(--color-primary)', fontWeight: 500 }}>{state.bgMaskOpacity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                step="5"
                value={state.bgMaskOpacity}
                onChange={(e) => setBgMaskOpacity(parseInt(e.target.value, 10))}
                className="settings-slider"
              />
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                提高遮罩透明度可增强文字可读性
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-block">
            <div className="settings-mb-10" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>卡片风格</div>
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--color-bg-offset)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
              }}
            >
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ fontSize: 15, color: 'var(--color-text)', fontWeight: 600, marginBottom: '8px' }}>卡片标题</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
                  这是卡片正文内容，展示卡片的真实效果。调节下方参数可实时预览。
                </div>
                <button
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  示例按钮
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>卡片圆角</span>
                <span style={{ fontSize: 14, color: 'var(--color-primary)', fontWeight: 500 }}>{state.cardRadius}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                step="2"
                value={state.cardRadius}
                onChange={(e) => setCardRadius(parseInt(e.target.value, 10))}
                className="settings-slider"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                卡片阴影
              </div>
              <div className="settings-segmented">
                {CARD_SHADOW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCardShadow(option.value)}
                    className={'settings-segmented-item' + (state.cardShadow === option.value ? ' active' : '')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                卡片边框
              </div>
              <div className="settings-segmented">
                {CARD_BORDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCardBorder(option.value)}
                    className={'settings-segmented-item' + (state.cardBorder === option.value ? ' active' : '')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>卡片透明度</span>
                <span style={{ fontSize: 14, color: 'var(--color-primary)', fontWeight: 500 }}>{state.cardOpacity}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="100"
                step="5"
                value={state.cardOpacity}
                onChange={(e) => setCardOpacity(parseInt(e.target.value, 10))}
                className="settings-slider"
              />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-block">
            <div className="settings-mb-10" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>按钮透明度</div>
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--color-bg-offset)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" style={{ flex: 1, padding: '10px 16px', fontSize: 14 }}>
                  主按钮
                </button>
                <button className="btn btn-ghost" style={{ flex: 1, padding: '10px 16px', fontSize: 14 }}>
                  次按钮
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>主按钮透明度</span>
                <span style={{ fontSize: 14, color: 'var(--color-primary)', fontWeight: 500 }}>{state.btnPrimaryOpacity}%</span>
              </div>
              <input
                type="range"
                min="80"
                max="100"
                step="5"
                value={state.btnPrimaryOpacity}
                onChange={(e) => setBtnPrimaryOpacity(parseInt(e.target.value, 10))}
                className="settings-slider"
              />
            </div>

            <div style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>次按钮透明度</span>
                <span style={{ fontSize: 14, color: 'var(--color-primary)', fontWeight: 500 }}>{state.btnSecondaryOpacity}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="100"
                step="5"
                value={state.btnSecondaryOpacity}
                onChange={(e) => setBtnSecondaryOpacity(parseInt(e.target.value, 10))}
                className="settings-slider"
              />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-block">
            <button
              onClick={handleReset}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--color-error)',
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              恢复默认设置
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0 24px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          AI 背诵卡片
        </div>
      </div>

      {showSaveDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '320px',
              padding: '20px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: '16px' }}>
              保存方案
            </div>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="请输入方案名称"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: 14,
                marginBottom: '20px',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSaveScheme()
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowSaveDialog(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-bg-offset)',
                  color: 'var(--color-text)',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmSaveScheme}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowRenameDialog(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '320px',
              padding: '20px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: '16px' }}>
              重命名方案
            </div>
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="请输入新名称"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: 14,
                marginBottom: '20px',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRenameScheme()
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowRenameDialog(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-bg-offset)',
                  color: 'var(--color-text)',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmRenameScheme}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowDeleteDialog(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '320px',
              padding: '20px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: '12px' }}>
              确认删除
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              确定要删除这个风格方案吗？此操作不可恢复。
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowDeleteDialog(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-bg-offset)',
                  color: 'var(--color-text)',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDeleteScheme}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-error)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowResetDialog(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '320px',
              padding: '20px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: '12px' }}>
              恢复默认设置
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              确定要恢复所有背景和风格设置为默认值吗？已保存的风格方案不会被删除。
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowResetDialog(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-bg-offset)',
                  color: 'var(--color-text)',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmReset}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-error)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
