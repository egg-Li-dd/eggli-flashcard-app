import { useState, useEffect, useRef, useMemo, Component } from 'react'
import { simpleTextSimilarity } from '../utils/helpers'

class NewCardPanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || '卡片预览出现异常' }
  }
  componentDidCatch(error) {
    console.error('[NewCardPanel] 渲染错误:', error, error?.stack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="dialog-overlay"
          onClick={() => this.props.onCancel && this.props.onCancel()}
          style={{ zIndex: 100 }}
        >
          <div className="dialog" style={{ maxWidth: 420, width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12, textAlign: 'center' }}>
              卡片预览出现异常
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              {this.state.errorMsg || 'AI 生成的卡片数据格式异常，请重试。'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { this.props.onCancel && this.props.onCancel() }}
                className="btn btn-secondary btn-sm"
                style={{ minHeight: 44 }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function NewCardPanel({
  visible,
  cards: initialCards,
  existingUnits,
  existingChapters,
  onCancel,
  onBack,
  onConfirm,
  showToast,
}) {
  const [cards, setCards] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [editingCard, setEditingCard] = useState(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editKnowledgePoint, setEditKnowledgePoint] = useState('')
  const [unitPickerCardId, setUnitPickerCardId] = useState(null)
  const menuRef = useRef(null)
  const [batchUnitPickerOpen, setBatchUnitPickerOpen] = useState(false)
  const [newUnitInput, setNewUnitInput] = useState('')
  const [busy, setBusy] = useState(false)
  const longPressTimerRef = useRef(null)
  const [expandedUnits, setExpandedUnits] = useState(new Set())
  const [expandedChapters, setExpandedChapters] = useState(new Set())
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSuggestions, setMergeSuggestions] = useState({ chapters: [], units: [] })

  const safeCards = Array.isArray(cards) ? cards : []
  const safeExistingUnits = Array.isArray(existingUnits) ? existingUnits : []
  const safeExistingChapters = Array.isArray(existingChapters) ? existingChapters : []

  // 章节名称查找映射
  const chapterNameMap = useMemo(() => {
    const map = {}
    for (const ch of safeExistingChapters) {
      map[ch.id] = ch.name
    }
    return map
  }, [safeExistingChapters])

  // 章节下的单元映射
  const chapterUnitsMap = useMemo(() => {
    if (safeExistingChapters.length === 0) return null
    const map = {}
    for (const ch of safeExistingChapters) {
      map[ch.id] = safeExistingUnits.filter(u => u.chapterId === ch.id)
    }
    return map
  }, [safeExistingChapters, safeExistingUnits])

  useEffect(() => {
    if (visible) {
      setCards(Array.isArray(initialCards) ? initialCards.map(c => ({ ...c })) : [])
      setSelectionMode(false)
      setSelectedIds(new Set())
      setEditingCard(null)
      setUnitPickerCardId(null)
      setBatchUnitPickerOpen(false)
      setNewUnitInput('')
      setMergeMode(false)
      setMergeSuggestions({ chapters: [], units: [] })
      // 默认展开所有单元
      setExpandedUnits(new Set(['__all__']))
    }
  }, [visible])

  // 计算智能合并建议
  useEffect(() => {
    if (!mergeMode) return
    
    // 基于章节名称相似度计算合并建议
    const chapterSuggestions = []
    
    // 从 cards 计算 chapterGroups（与 useMemo 中的逻辑保持一致）
    const chapterMap = new Map()
    const getChapterKey = (card) => {
      if (card.chapterId) return 'existing_' + card.chapterId
      if (card.chapterName) return 'new_' + card.chapterName
      return 'no_chapter'
    }
    const getChapterName = (card) => {
      if (card.chapterName) return card.chapterName
      if (card.chapterId && chapterNameMap[card.chapterId]) return chapterNameMap[card.chapterId]
      return null
    }
    for (const c of safeCards) {
      const chKey = getChapterKey(c)
      if (!chapterMap.has(chKey)) {
        chapterMap.set(chKey, {
          key: chKey,
          chapterName: getChapterName(c),
          chapterId: c.chapterId || null,
          isNewChapter: !c.chapterId && !!c.chapterName,
          units: [],
        })
      }
      const chGroup = chapterMap.get(chKey)
      const isNewUnit = c.isNewUnit || !c.unitId
      if (!isNewUnit && c.unitId) {
        const existingUnitIdx = chGroup.units.findIndex(u => u.unitId === c.unitId)
        if (existingUnitIdx >= 0) {
          chGroup.units[existingUnitIdx].cards.push(c)
        } else {
          const u = safeExistingUnits.find(x => x.id === c.unitId)
          chGroup.units.push({
            key: 'existing_' + c.unitId,
            unitName: u ? u.name : (c.unitName || '未命名单元'),
            unitId: c.unitId,
            isNewUnit: false,
            cards: [c],
          })
        }
      } else {
        const unitName = c.unitName || '未命名单元'
        const existingNewUnitIdx = chGroup.units.findIndex(u => u.isNewUnit && u.unitName === unitName)
        if (existingNewUnitIdx >= 0) {
          chGroup.units[existingNewUnitIdx].cards.push(c)
        } else {
          chGroup.units.push({
            key: 'new_' + unitName,
            unitName: unitName,
            unitId: null,
            isNewUnit: true,
            cards: [c],
          })
        }
      }
    }
    const computedChapterGroups = Array.from(chapterMap.values())
    
    for (let i = 0; i < computedChapterGroups.length; i++) {
      for (let j = i + 1; j < computedChapterGroups.length; j++) {
        const ch1 = computedChapterGroups[i]
        const ch2 = computedChapterGroups[j]
        if (!ch1.chapterName || !ch2.chapterName) continue
        const sim = simpleTextSimilarity(ch1.chapterName, ch2.chapterName)
        if (sim > 0.6) {
          chapterSuggestions.push({
            key1: ch1.key,
            key2: ch2.key,
            name1: ch1.chapterName,
            name2: ch2.chapterName,
            similarity: sim,
            cardsCount: ch1.units.reduce((s, u) => s + u.cards.length, 0) + ch2.units.reduce((s, u) => s + u.cards.length, 0),
          })
        }
      }
    }
    
    // 基于单元名称和内容计算合并建议
    const unitSuggestions = []
    const allUnits = []
    for (const ch of computedChapterGroups) {
      for (const u of ch.units) {
        allUnits.push({ ...u, chapterKey: ch.key, chapterName: ch.chapterName })
      }
    }
    for (let i = 0; i < allUnits.length; i++) {
      for (let j = i + 1; j < allUnits.length; j++) {
        const u1 = allUnits[i]
        const u2 = allUnits[j]
        const nameSim = simpleTextSimilarity(u1.name, u2.name)
        const content1 = u1.cards.map(c => c.front + c.back).join(' ')
        const content2 = u2.cards.map(c => c.front + c.back).join(' ')
        const contentSim = simpleTextSimilarity(content1, content2)
        const avgSim = (nameSim + contentSim) / 2
        if (avgSim > 0.65) {
          unitSuggestions.push({
            key1: u1.key,
            key2: u2.key,
            name1: u1.name,
            name2: u2.name,
            chapterName1: u1.chapterName,
            chapterName2: u2.chapterName,
            similarity: avgSim,
            cardsCount: u1.cards.length + u2.cards.length,
          })
        }
      }
    }
    
    setMergeSuggestions({ chapters: chapterSuggestions, units: unitSuggestions })
  }, [mergeMode, cards])

  // 点击菜单外部时关闭菜单
  useEffect(() => {
    if (!unitPickerCardId) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUnitPickerCardId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [unitPickerCardId])

  const updateCard = (tempId, patch) => {
    setCards((prev) => prev.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c)))
  }

  const handleLongPressStart = (tempId) => {
    if (selectionMode) return
    longPressTimerRef.current = setTimeout(() => {
      setSelectionMode(true)
      const s = new Set()
      s.add(tempId)
      setSelectedIds(s)
    }, 300)
  }
  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleCardClick = (card) => {
    if (selectionMode) {
      setSelectedIds((prev) => {
        const s = new Set(prev)
        if (s.has(card.tempId)) s.delete(card.tempId)
        else s.add(card.tempId)
        return s
      })
    }
  }

  const handleClearSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleOpenEdit = (card) => {
    setEditingCard(card)
    setEditFront(card.front || '')
    setEditBack(card.back || '')
    setEditKnowledgePoint(card.knowledge_point || '')
  }
  const handleSaveEdit = () => {
    if (!editingCard) return
    const f = editFront.trim()
    const b = editBack.trim()
    if (!f || !b) {
      if (showToast) showToast('问题与答案都不能为空', 'error')
      return
    }
    const kp = editKnowledgePoint.trim() || null
    updateCard(editingCard.tempId, { front: f, back: b, knowledge_point: kp })
    setEditingCard(null)
  }

  const handleAssignToExisting = (cardIds, unitId, unitName) => {
    setCards((prev) =>
      prev.map((c) =>
        cardIds.includes(c.tempId)
          ? { ...c, unitId, unitName, isNewUnit: false }
          : c,
      ),
    )
  }

  const handleAssignToChapter = (cardIds, chapterId, chapterName) => {
    setCards((prev) =>
      prev.map((c) =>
        cardIds.includes(c.tempId)
          ? { ...c, chapterId, chapterName, isNewChapter: false }
          : c,
      ),
    )
  }

  const handleAssignToNew = (cardIds, newUnitNameSuggested) => {
    const name = (newUnitNameSuggested || '新单元').trim()
    setCards((prev) =>
      prev.map((c) =>
        cardIds.includes(c.tempId)
          ? { ...c, unitId: null, unitName: name, isNewUnit: true }
          : c,
      ),
    )
  }

  const handleConfirm = async () => {
    if (busy) return
    if (cards.length === 0) {
      if (showToast) showToast('没有卡片可添加', 'error')
      return
    }
    setBusy(true)
    try {
      const existingMap = new Map()
      const newUnitMap = new Map()

      for (const c of cards) {
        if (c.isNewUnit) {
          const key = `${c.chapterId || 'no_chapter'}||${c.unitName || '新单元'}`
          if (!newUnitMap.has(key)) newUnitMap.set(key, { chapterId: c.chapterId || null, chapterName: c.chapterName || null, cards: [] })
          newUnitMap.get(key).cards.push({
            front: c.front,
            back: c.back,
            knowledge_point: c.knowledge_point || null,
            chapterId: c.chapterId || null,
            chapterName: c.chapterName || null,
          })
        } else if (c.unitId) {
          if (!existingMap.has(c.unitId)) existingMap.set(c.unitId, { chapterId: c.chapterId || null, chapterName: c.chapterName || null, cards: [] })
          existingMap.get(c.unitId).cards.push({
            front: c.front,
            back: c.back,
            knowledge_point: c.knowledge_point || null,
            chapterId: c.chapterId || null,
            chapterName: c.chapterName || null,
          })
        } else {
          const key = `${c.chapterId || 'no_chapter'}||${c.unitName || '未命名单元'}`
          if (!newUnitMap.has(key)) newUnitMap.set(key, { chapterId: c.chapterId || null, chapterName: c.chapterName || null, cards: [] })
          newUnitMap.get(key).cards.push({
            front: c.front,
            back: c.back,
            knowledge_point: c.knowledge_point || null,
            chapterId: c.chapterId || null,
            chapterName: c.chapterName || null,
          })
        }
      }

      const unitDataList = []
      let currentCatUnits = safeExistingUnits
      for (const [unitId, data] of existingMap.entries()) {
        const u = currentCatUnits.find(x => x.id === unitId)
        unitDataList.push({
          name: u ? u.name : '未命名单元',
          matchedUnitId: unitId,
          chapterId: data.chapterId,
          chapterName: data.chapterName || null,
          cards: data.cards,
        })
      }
      if (newUnitMap.size > 0) {
        for (const [key, data] of newUnitMap.entries()) {
          const unitName = key.split('||')[1]
          unitDataList.push({
            name: unitName,
            matchedUnitId: null,
            chapterId: data.chapterId,
            chapterName: data.chapterName || null,
            cards: data.cards,
          })
        }
      }

      if (onConfirm) await onConfirm(unitDataList)
    } catch (e) {
      if (showToast) showToast('添加失败: ' + (e.message || '未知错误'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return
    setCards((prev) => prev.filter((c) => !selectedIds.has(c.tempId)))
    handleClearSelection()
  }
  const handleBatchAssignExisting = (unitId, unitName) => {
    handleAssignToExisting(Array.from(selectedIds), unitId, unitName)
    setBatchUnitPickerOpen(false)
    handleClearSelection()
  }
  const handleBatchAssignNew = () => {
    const name = newUnitInput.trim()
    if (!name) {
      if (showToast) showToast('请输入新单元名称', 'error')
      return
    }
    handleAssignToNew(Array.from(selectedIds), name)
    setNewUnitInput('')
    setBatchUnitPickerOpen(false)
    handleClearSelection()
  }

  // 合并两个章节（将 key2 的单元合并到 key1，保持 key1 的章节名）
  const handleMergeChapters = (key1, key2) => {
    setCards(prev => {
      return prev.map(c => {
        // 如果卡片属于 key2 章节，改为 key1 章节
        const chKey = c.chapterId ? 'existing_' + c.chapterId : (c.chapterName ? 'new_' + c.chapterName : 'no_chapter')
        if (chKey === key2) {
          // 继承 key1 的章节信息
          if (key1.startsWith('existing_')) {
            const newChapterId = key1.replace('existing_', '')
            return { ...c, chapterId: parseInt(newChapterId) || newChapterId, chapterName: c.chapterName }
          } else {
            const newChapterName = key1.replace('new_', '')
            return { ...c, chapterId: null, chapterName: newChapterName }
          }
        }
        return c
      })
    })
    // 重新计算合并建议
    setTimeout(() => {
      setMergeSuggestions(prev => ({
        chapters: prev.chapters.filter(s => s.key1 !== key1 && s.key1 !== key2 && s.key2 !== key1 && s.key2 !== key2),
        units: prev.units.filter(s => s.key1 !== key1 && s.key1 !== key2 && s.key2 !== key1 && s.key2 !== key2)
      }))
    }, 50)
  }

  // 合并两个单元（将 key2 的卡片合并到 key1，保持 key1 的单元名）
  const handleMergeUnits = (key1, key2) => {
    setCards(prev => {
      return prev.map(c => {
        const unitKey = c.unitId ? 'existing_' + c.unitId : (c.unitName ? 'new_' + c.unitName : 'no_unit')
        if (unitKey === key2) {
          // 继承 key1 的单元信息
          if (key1.startsWith('existing_')) {
            const newUnitId = key1.replace('existing_', '')
            return { ...c, unitId: parseInt(newUnitId) || newUnitId, unitName: c.unitName, isNewUnit: false }
          } else {
            const newUnitName = key1.replace('new_', '')
            return { ...c, unitId: null, unitName: newUnitName, isNewUnit: true }
          }
        }
        return c
      })
    })
    // 重新计算合并建议
    setTimeout(() => {
      setMergeSuggestions(prev => ({
        chapters: prev.chapters,
        units: prev.units.filter(s => s.key1 !== key1 && s.key1 !== key2 && s.key2 !== key1 && s.key2 !== key2)
      }))
    }, 50)
  }

  const stats = useMemo(() => {
    const existingCount = safeCards.filter((c) => !c.isNewUnit && c.unitId).length
    const newCount = safeCards.filter((c) => c.isNewUnit || !c.unitId).length
    return { existingCount, newCount, total: safeCards.length }
  }, [safeCards])

  // 按章节→单元分组：现有单元 / 新单元
  const { chapterGroups } = useMemo(() => {
    const chapterMap = new Map()

    const getChapterKey = (card) => {
      if (card.chapterId) return 'existing_' + card.chapterId
      if (card.chapterName) return 'new_' + card.chapterName
      return 'no_chapter'
    }

    const getChapterName = (card) => {
      if (card.chapterName) return card.chapterName
      if (card.chapterId && chapterNameMap[card.chapterId]) return chapterNameMap[card.chapterId]
      return null
    }

    for (const c of safeCards) {
      const chKey = getChapterKey(c)
      if (!chapterMap.has(chKey)) {
        chapterMap.set(chKey, {
          key: chKey,
          chapterName: getChapterName(c),
          chapterId: c.chapterId || null,
          isNewChapter: !c.chapterId && !!c.chapterName,
          units: [],
        })
      }

      const chGroup = chapterMap.get(chKey)
      const isNewUnit = c.isNewUnit || !c.unitId

      if (!isNewUnit && c.unitId) {
        const existingUnitIdx = chGroup.units.findIndex(u => u.unitId === c.unitId)
        if (existingUnitIdx >= 0) {
          chGroup.units[existingUnitIdx].cards.push(c)
        } else {
          const u = safeExistingUnits.find(x => x.id === c.unitId)
          chGroup.units.push({
            key: 'existing_' + c.unitId,
            unitName: u ? u.name : (c.unitName || '未命名单元'),
            unitId: c.unitId,
            isNewUnit: false,
            cards: [c],
          })
        }
      } else {
        const unitName = c.unitName || '未命名单元'
        const existingNewUnitIdx = chGroup.units.findIndex(u => u.isNewUnit && u.unitName === unitName)
        if (existingNewUnitIdx >= 0) {
          chGroup.units[existingNewUnitIdx].cards.push(c)
        } else {
          chGroup.units.push({
            key: 'new_' + unitName,
            unitName: unitName,
            unitId: null,
            isNewUnit: true,
            cards: [c],
          })
        }
      }
    }

    return {
      chapterGroups: Array.from(chapterMap.values()),
    }
  }, [safeCards, safeExistingUnits, chapterNameMap])

  const existingUnitGroups = useMemo(() => {
    const groups = []
    for (const ch of chapterGroups) {
      groups.push(...ch.units.filter(u => !u.isNewUnit))
    }
    return groups
  }, [chapterGroups])

  const newUnitGroups = useMemo(() => {
    const groups = []
    for (const ch of chapterGroups) {
      groups.push(...ch.units.filter(u => u.isNewUnit))
    }
    return groups
  }, [chapterGroups])

  const allUnitGroups = useMemo(() => {
    return [...existingUnitGroups, ...newUnitGroups]
  }, [existingUnitGroups, newUnitGroups])

  const toggleUnit = (key) => {
    setExpandedUnits((prev) => {
      const s = new Set(prev)
      s.delete('__all__')
      if (s.has(key)) s.delete(key)
      else s.add(key)
      return s
    })
  }

  const isUnitExpanded = (key) => {
    if (expandedUnits.has('__all__')) return true
    return expandedUnits.has(key)
  }

  const toggleChapter = (key) => {
    setExpandedChapters((prev) => {
      const s = new Set(prev)
      if (s.has(key)) s.delete(key)
      else s.add(key)
      return s
    })
  }

  const isChapterExpanded = (key) => {
    return expandedChapters.has(key)
  }

  // 获取卡片的章节名称
  const getChapterNameForCard = (card) => {
    if (card.chapterName) return card.chapterName
    if (card.chapterId && chapterNameMap[card.chapterId]) return chapterNameMap[card.chapterId]
    return null
  }

  // 渲染单个卡片
  const renderCard = (card, groupKey) => {
    const isSelected = selectedIds.has(card.tempId)
    const chapterName = getChapterNameForCard(card)

    return (
      <div
        key={card.tempId}
        style={{
          padding: 10,
          marginBottom: 6,
          background: isSelected ? 'var(--color-primary-light)' : 'var(--color-bg-offset)',
          borderRadius: 8,
          border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border-light)',
          position: 'relative',
        }}
        onTouchStart={() => handleLongPressStart(card.tempId)}
        onTouchEnd={handleLongPressEnd}
        onTouchMove={handleLongPressEnd}
        onClick={() => handleCardClick(card)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {chapterName && (
              <div style={{
                fontSize: 11,
                color: 'var(--color-primary)',
                fontWeight: 600,
                marginBottom: 4,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'var(--color-primary-light)',
                display: 'inline-block',
              }}>
                {chapterName}
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500, lineHeight: 1.4, marginBottom: 3, wordBreak: 'break-word' }}>
              {card.front}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>
              {card.back}
            </div>
          </div>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setUnitPickerCardId(unitPickerCardId === card.tempId ? null : card.tempId)
              }}
              className="icon-btn"
              style={{ width: 38, height: 38, background: 'transparent', color: 'var(--color-text-secondary)' }}
              aria-label="菜单"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {unitPickerCardId === card.tempId && (
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 42,
                  zIndex: 10,
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border-light)',
                  borderRadius: 10,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                  padding: 4,
                  minWidth: 160,
                }}
              >
                <MenuItemButton onClick={() => { setUnitPickerCardId(null); handleOpenEdit(card) }}>
                  ✏️ 编辑内容
                </MenuItemButton>

                {/* 章节选择 - 仅当有章节时显示 */}
                {safeExistingChapters.length > 0 && (
                  <>
                    <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      更改章节
                    </div>
                    <MenuItemButton
                      onClick={() => { updateCard(card.tempId, { chapterId: null, chapterName: null }); setUnitPickerCardId(null) }}
                    >
                      📁 无章节
                    </MenuItemButton>
                    {safeExistingChapters.map((ch) => (
                      <MenuItemButton
                        key={ch.id}
                        onClick={() => { updateCard(card.tempId, { chapterId: ch.id, chapterName: ch.name }); setUnitPickerCardId(null) }}
                      >
                        📖 {ch.name}
                      </MenuItemButton>
                    ))}
                  </>
                )}

                <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  更改单元
                </div>
                {safeExistingUnits.map((u) => (
                  <MenuItemButton
                    key={u.id}
                    onClick={() => { handleAssignToExisting([card.tempId], u.id, u.name); setUnitPickerCardId(null) }}
                  >
                    📂 {u.name}
                  </MenuItemButton>
                ))}
                <MenuItemButton
                  onClick={() => { handleAssignToNew([card.tempId], '新单元_' + String(card.front || '').slice(0, 6)); setUnitPickerCardId(null) }}
                >
                  🆕 作为新单元
                </MenuItemButton>
                <div style={{ height: 1, background: 'var(--color-border-light)', margin: '4px 0' }} />
                <MenuItemButton
                  onClick={() => { setCards((prev) => prev.filter((c) => c.tempId !== card.tempId)); setUnitPickerCardId(null) }}
                  style={{ color: 'var(--color-danger)' }}
                >
                  🗑️ 移除卡片
                </MenuItemButton>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 所有 hooks 已调用完毕，不可见时提前返回（必须在所有 hooks 之后）
  if (!visible) return null

  return (
    <NewCardPanelErrorBoundary onCancel={onCancel}>
      <div
        className="dialog-overlay"
        onClick={() => {
          if (editingCard) return
          if (unitPickerCardId) { setUnitPickerCardId(null); return }
          if (batchUnitPickerOpen) { setBatchUnitPickerOpen(false); return }
          if (mergeMode) { setMergeMode(false); return }
          onCancel && onCancel()
        }}
        style={{ zIndex: 100 }}
      >
        <div
          className="dialog"
          style={{
            maxWidth: 560,
            width: '92%',
            maxHeight: '86vh',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
        >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text)' }}>
            新卡片预览 ({stats.total} 张)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setMergeMode(!mergeMode)}
              className={`btn btn-sm ${mergeMode ? 'btn-primary' : 'btn-secondary'}`}
              style={{ minHeight: 36, fontSize: 13 }}
            >
              {mergeMode ? '取消合并' : '🔗 智能合并'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              加入现有 {stats.existingCount} · 新 {stats.newCount}
            </div>
          </div>
        </div>

        {selectionMode && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            marginBottom: 10,
            background: 'var(--color-primary-light)',
            borderRadius: 10,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', flex: '1 1 auto' }}>
              已选 {selectedIds.size} 张
            </span>
            <button
              onClick={() => setBatchUnitPickerOpen(true)}
              className="btn btn-secondary btn-sm"
              style={{ minHeight: 44 }}
            >
              批量改单元
            </button>
            <button
              onClick={handleBatchDelete}
              className="btn btn-sm"
              style={{ minHeight: 44, background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}
            >
              删除
            </button>
            <button
              onClick={handleClearSelection}
              className="btn btn-secondary btn-sm"
              style={{ minHeight: 44 }}
            >
              退出
            </button>
          </div>
        )}

        {mergeMode && (mergeSuggestions.chapters.length > 0 || mergeSuggestions.units.length > 0) && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 12px',
            marginBottom: 10,
            background: 'var(--color-accent-light)',
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-dark)', marginBottom: 4 }}>
              发现可合并的章节/单元（共 {mergeSuggestions.chapters.length + mergeSuggestions.units.length} 处）
            </div>
            
            {mergeSuggestions.chapters.slice(0, 3).map((s, idx) => (
              <div key={'ch-' + idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text)' }}>
                  📚 <b>{s.name1}</b> ↔ <b>{s.name2}</b>
                  <span style={{ color: 'var(--color-text-secondary)', marginLeft: 6 }}>相似度 {Math.round(s.similarity * 100)}%</span>
                </span>
                <button
                  onClick={() => handleMergeChapters(s.key1, s.key2)}
                  className="btn btn-xs btn-primary"
                  style={{ minHeight: 32, fontSize: 12 }}
                >
                  合并
                </button>
              </div>
            ))}
            
            {mergeSuggestions.units.slice(0, 5).map((s, idx) => (
              <div key={'un-' + idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text)' }}>
                  📂 <b>{s.name1}（{s.chapterName1}）</b> ↔ <b>{s.name2}（{s.chapterName2}）</b>
                  <span style={{ color: 'var(--color-text-secondary)', marginLeft: 6 }}>相似度 {Math.round(s.similarity * 100)}%</span>
                </span>
                <button
                  onClick={() => handleMergeUnits(s.key1, s.key2)}
                  className="btn btn-xs btn-primary"
                  style={{ minHeight: 32, fontSize: 12 }}
                >
                  合并
                </button>
              </div>
            ))}
            
            {(mergeSuggestions.chapters.length > 3 || mergeSuggestions.units.length > 5) && (
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                还有更多建议可滚动查看
              </div>
            )}
          </div>
        )}

        {mergeMode && mergeSuggestions.chapters.length === 0 && mergeSuggestions.units.length === 0 && (
          <div style={{
            padding: '16px 12px',
            marginBottom: 10,
            background: 'var(--color-accent-light)',
            borderRadius: 10,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--color-accent-dark)',
          }}>
            未发现可合并的章节/单元，当前章节和单元结构已合理
          </div>
        )}

        <div style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          paddingRight: 4,
          marginBottom: 12,
        }}>
          {safeCards.length === 0 && (
            <div style={{
              padding: 32, textAlign: 'center',
              color: 'var(--color-text-secondary)', fontSize: 14,
            }}>
              暂无卡片
            </div>
          )}

          {chapterGroups.map((chGroup) => {
            const chExpanded = isChapterExpanded(chGroup.key)
            const totalCards = chGroup.units.reduce((sum, u) => sum + u.cards.length, 0)
            return (
              <div
                key={chGroup.key}
                style={{
                  marginBottom: 12,
                  borderRadius: 12,
                  border: '1px solid var(--color-border-light)',
                  background: 'var(--color-bg-card)',
                  overflow: 'hidden',
                }}
              >
                {(chGroup.chapterName || chapterGroups.length > 1) && (
                  <div
                    onClick={() => toggleChapter(chGroup.key)}
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: chGroup.isNewChapter ? 'var(--color-info-light)' : 'var(--color-primary-light)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: chGroup.isNewChapter ? 'var(--color-info)' : 'var(--color-primary)',
                        color: '#fff',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {chGroup.isNewChapter ? '📚 新章节' : '📖 章节'}
                      </span>
                      <span style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {chGroup.chapterName || '无章节'}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                      {chGroup.units.length} 单元 · {totalCards} 张 {chExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                )}
                {chExpanded && (
                  <div style={{ padding: chGroup.chapterName ? '0 0 8px 0' : '8px' }}>
                    {chGroup.units.map((unit) => {
                      const uExpanded = isUnitExpanded(unit.key)
                      return (
                        <div
                          key={unit.key}
                          style={{
                            marginBottom: chGroup.chapterName ? 8 : 0,
                            borderRadius: chGroup.chapterName ? 10 : 0,
                            border: chGroup.chapterName ? '1px solid var(--color-border-light)' : 'none',
                            background: chGroup.chapterName ? 'var(--color-bg-offset)' : 'transparent',
                            overflow: 'hidden',
                            marginLeft: chGroup.chapterName ? 12 : 0,
                            marginRight: chGroup.chapterName ? 12 : 0,
                          }}
                        >
                          <div
                            onClick={() => toggleUnit(unit.key)}
                            style={{
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              background: unit.isNewUnit ? 'var(--color-warning-light)' : 'var(--color-success-light)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 8,
                                background: unit.isNewUnit ? 'var(--color-warning)' : 'var(--color-success)',
                                color: '#fff',
                                fontWeight: 600,
                                flexShrink: 0,
                              }}>
                                {unit.isNewUnit ? '🆕' : '📍'}
                              </span>
                              <span style={{
                                fontSize: 14,
                                fontWeight: 500,
                                color: 'var(--color-text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {unit.unitName}
                              </span>
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                              {unit.cards.length} 张 {uExpanded ? '▲' : '▼'}
                            </span>
                          </div>
                          {uExpanded && (
                            <div style={{ padding: 6 }}>
                              {unit.cards.map((card) => renderCard(card, unit.key))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {batchUnitPickerOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: 16, right: 16, bottom: 80,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border-light)',
              borderRadius: 12,
              boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
              padding: 14,
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--color-text)' }}>
              选择目标单元（已选 {selectedIds.size} 张）
            </div>
            {safeExistingChapters.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6, fontWeight: 600 }}>
                  章节
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {safeExistingChapters.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => {
                        handleAssignToChapter(Array.from(selectedIds), ch.id, ch.name)
                        setBatchUnitPickerOpen(false)
                        handleClearSelection()
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 12, minHeight: 40, padding: '4px 10px' }}
                    >
                      📖 {ch.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 140, overflowY: 'auto' }}>
              {safeExistingUnits.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleBatchAssignExisting(u.id, u.name)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 13, minHeight: 44 }}
                >
                  {u.name}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newUnitInput}
                onChange={(e) => setNewUnitInput(e.target.value)}
                placeholder="或输入新单元名称"
                style={{
                  flex: '1 1 160px',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: 14,
                  minWidth: 120,
                  minHeight: 44,
                }}
              />
              <button
                onClick={handleBatchAssignNew}
                disabled={!newUnitInput.trim()}
                className="btn btn-primary btn-sm"
                style={{ minHeight: 44 }}
              >
                新建并指派
              </button>
            </div>
            <button
              onClick={() => { setBatchUnitPickerOpen(false); setNewUnitInput('') }}
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 10, width: '100%', minHeight: 44 }}
            >
              取消
            </button>
          </div>
        )}

        {editingCard && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: 12, right: 12, top: 12,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border-light)',
              borderRadius: 12,
              boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
              padding: 16,
              zIndex: 11,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--color-text)' }}>
              编辑卡片
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>问题 (正面)</div>
              <textarea
                value={editFront}
                onChange={(e) => setEditFront(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>答案 (背面)</div>
              <textarea
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>原始知识点（可选，用于分类参考）</div>
              <input
                type="text"
                value={editKnowledgePoint}
                onChange={(e) => setEditKnowledgePoint(e.target.value)}
                placeholder="如：CPU主频参数"
                style={{
                  width: '100%',
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  boxSizing: 'border-box',
                  minHeight: 44,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingCard(null)} className="btn btn-secondary btn-sm" style={{ minHeight: 44 }}>
                取消
              </button>
              <button onClick={handleSaveEdit} className="btn btn-primary btn-sm" style={{ minHeight: 44 }}>
                保存
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid var(--color-border-light)' }}>
          <button
            onClick={() => { onBack && onBack() }}
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 44, minWidth: 80, fontSize: 14 }}
          >
            ← 上一步
          </button>
          <button
            onClick={() => { onCancel && onCancel() }}
            disabled={busy}
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 44, minWidth: 80, fontSize: 14 }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || cards.length === 0}
            className="btn btn-primary btn-sm"
            style={{ minHeight: 44, minWidth: 80, fontSize: 14, fontWeight: 600 }}
          >
            {busy ? '添加中...' : `确定 (${cards.length} 张)`}
          </button>
        </div>
        </div>
      </div>
    </NewCardPanelErrorBoundary>
  )
}

function MenuItemButton({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        minHeight: 44,
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--color-text)',
        ...(style || {}),
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-border-light)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}