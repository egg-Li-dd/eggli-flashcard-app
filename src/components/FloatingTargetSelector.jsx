import { useState, useEffect, useCallback } from 'react'
import { getCategories, getChaptersByCategory, getUnitsByChapter } from '../services/db'

/**
 * 三级归属选择器（分类 ▸ 章节 ▸ 单元）
 * 覆盖在悬浮窗输入区上，选择后回调
 * 默认全部折叠（符合用户选择A）
 */
export default function FloatingTargetSelector({
  currentTarget,
  onSelect,
  onClose,
  recentTargets = [],
}) {
  const [categories, setCategories] = useState([])
  const [expandedCats, setExpandedCats] = useState({})
  const [chaptersMap, setChaptersMap] = useState({})
  const [unitsMap, setUnitsMap] = useState({})
  const [keyword, setKeyword] = useState('')

  // 加载分类列表
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  // 展开/折叠分类
  const toggleCat = useCallback(async (catId) => {
    setExpandedCats(prev => {
      const next = { ...prev, [catId]: !prev[catId] }
      return next
    })
    if (!chaptersMap[catId]) {
      try {
        const chapters = await getChaptersByCategory(catId)
        setChaptersMap(prev => ({ ...prev, [catId]: chapters }))
      } catch (_) {}
    }
  }, [chaptersMap])

  // 展开/折叠章节
  const toggleChapter = useCallback(async (chId) => {
    setExpandedCats(prev => ({ ...prev, ['ch_' + chId]: !prev['ch_' + chId] }))
    if (!unitsMap[chId]) {
      try {
        const units = await getUnitsByChapter(chId)
        setUnitsMap(prev => ({ ...prev, [chId]: units }))
      } catch (_) {}
    }
  }, [unitsMap])

  // 选中单元
  const handleSelectUnit = (cat, ch, unit) => {
    onSelect({ categoryId: cat.id, categoryName: cat.name, chapterId: ch.id, chapterName: ch.name, unitId: unit.id, unitName: unit.name })
  }

  // 选中章节（不指定单元）
  const handleSelectChapter = (cat, ch) => {
    onSelect({ categoryId: cat.id, categoryName: cat.name, chapterId: ch.id, chapterName: ch.name, unitId: null, unitName: null })
  }

  // 选中分类（不指定章节/单元）
  const handleSelectCategory = (cat) => {
    onSelect({ categoryId: cat.id, categoryName: cat.name, chapterId: null, chapterName: null, unitId: null, unitName: null })
  }

  // 关键词过滤
  const matchesKeyword = (text) => {
    if (!keyword) return true
    return (text || '').toLowerCase().includes(keyword.toLowerCase())
  }

  return (
    <div className="floating-target-overlay">
      <div className="floating-target-header">
        <span className="floating-target-title">📍 选择归属</span>
        <button className="floating-target-close" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div className="floating-target-search">
        <input
          type="text"
          className="floating-target-search-input"
          placeholder="🔍 检索分类/章节/单元..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />
      </div>

      <div className="floating-target-list">
        {categories.length === 0 && (
          <div className="floating-target-empty">暂无分类，请先在主页新建</div>
        )}

        {categories.map(cat => (
          <div key={cat.id} className="floating-target-cat">
            <div
              className={'floating-target-row floating-target-row-cat' + (currentTarget?.categoryId === cat.id && !currentTarget?.chapterId ? ' floating-target-row-active' : '')}
              onClick={() => expandedCats[cat.id] ? null : toggleCat(cat.id)}
            >
              <span
                className="floating-target-arrow"
                onClick={(e) => { e.stopPropagation(); toggleCat(cat.id) }}
              >
                {expandedCats[cat.id] ? '▼' : '▶'}
              </span>
              <span className="floating-target-icon">📁</span>
              <span
                className="floating-target-label"
                onClick={(e) => { e.stopPropagation(); if (matchesKeyword(cat.name)) handleSelectCategory(cat) }}
              >
                {cat.name}
              </span>
            </div>

            {expandedCats[cat.id] && chaptersMap[cat.id]?.map(ch => (
              <div key={ch.id} className="floating-target-chapter">
                <div
                  className={'floating-target-row floating-target-row-chapter' + (currentTarget?.chapterId === ch.id && !currentTarget?.unitId ? ' floating-target-row-active' : '')}
                  onClick={() => expandedCats['ch_' + ch.id] ? null : toggleChapter(ch.id)}
                >
                  <span
                    className="floating-target-arrow"
                    onClick={(e) => { e.stopPropagation(); toggleChapter(ch.id) }}
                  >
                    {expandedCats['ch_' + ch.id] ? '▼' : '▶'}
                  </span>
                  <span className="floating-target-icon floating-target-icon-indent">📂</span>
                  <span
                    className="floating-target-label"
                    onClick={(e) => { e.stopPropagation(); if (matchesKeyword(ch.name)) handleSelectChapter(cat, ch) }}
                  >
                    {ch.name}
                  </span>
                </div>

                {expandedCats['ch_' + ch.id] && unitsMap[ch.id]?.map(unit => (
                  <div
                    key={unit.id}
                    className={'floating-target-row floating-target-row-unit' + (currentTarget?.unitId === unit.id ? ' floating-target-row-active' : '')}
                    onClick={() => matchesKeyword(unit.name) && handleSelectUnit(cat, ch, unit)}
                  >
                    <span className="floating-target-icon floating-target-icon-indent2">📄</span>
                    <span className="floating-target-label">{unit.name}</span>
                  </div>
                ))}

                {expandedCats['ch_' + ch.id] && unitsMap[ch.id]?.length === 0 && (
                  <div className="floating-target-empty-sub">暂无单元</div>
                )}
              </div>
            ))}

            {expandedCats[cat.id] && chaptersMap[cat.id]?.length === 0 && (
              <div className="floating-target-empty-sub">暂无章节</div>
            )}
          </div>
        ))}
      </div>

      {recentTargets.length > 0 && (
        <div className="floating-target-recent">
          <div className="floating-target-recent-title">⭐ 最近使用</div>
          {recentTargets.map((t, i) => (
            <div
              key={i}
              className="floating-target-recent-item"
              onClick={() => onSelect(t)}
            >
              {t.categoryName} ▸ {t.chapterName || '未指定章节'} ▸ {t.unitName || '未指定单元'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
