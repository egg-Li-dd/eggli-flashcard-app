# 背诵页面分类切换与图标重构计划

## 问题分析

### 问题 1：分类栏自动隐藏导致无法切换
底部分类栏通过 `showCategoryBar` 状态控制，当用户向下滚动时自动隐藏（`handleScroll` L420-L428）。这导致用户看不到分类选择按钮，实际表现就是"不能切换分类"。

**文件**：[Memorize.jsx L420-L428](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Memorize.jsx#L420-L428), [L865](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Memorize.jsx#L865)

### 问题 2：分类栏布局拥挤，手机端体验差
底部栏 `padding: 12px` + `safe-area`，分类标签横向滚动，但没有足够的视觉提示。已经进入背诵状态后想切换分类，还需要滚动到顶部点击"切换模式"中重新选。

### 问题 3：未能在背诵中便捷切换分类
用户希望在背诵卡片时就能切换分类，而不是回到"未选择"状态再重新选模式和分类。

## 修复方案

### 修改 1：底部分类栏始终可见
- 移除 `showCategoryBar` 状态和滚动监听中的自动隐藏逻辑
- 分类栏固定在底部，始终显示

### 修改 2：添加顶部下拉分类选择器
在卡片上方的进度行中，新增一个分类下拉选择器（Picker / Dropdown），显示当前分类名称，点击展开所有可选分类。这样用户不用滚动到页面底部就能切换。
- 位置：进度信息行（"第X/Y张" 左侧或上方）
- 样式：内联下拉，适合手机端

### 修改 3：重构图标区域布局，手机端自适应
- 缩小卡片操作按钮尺寸（收藏、移动），避免挤占卡片空间
- 底部操作栏按钮（已掌握/待复习/移动）重新排列，确保小屏可见
- 卡片区域 `touchAction: manipulation` 保持触控优化

## 修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/pages/Memorize.jsx` | ① 移除 `showCategoryBar` 状态及 `handleScroll` 中的隐藏逻辑（L90, L420-L428） |
| `src/pages/Memorize.jsx` | ② 在顶部进度行上方添加分类下拉选择器（L507-L536 区域前插入） |
| `src/pages/Memorize.jsx` | ③ 切换分类时直接加载新分类卡片（修改 `handleSelectCategory`） |
| `src/pages/Memorize.jsx` | ④ 缩小卡片右上角图标按钮尺寸，优化底部操作按钮间距 |
| `src/pages/Memorize.jsx` | ⑤ 底部栏始终显示，移除 `transform` 动画（L865） |

## 详细修改

### 修改 1：移除分类栏自动隐藏

**改动 1a**：删除 `showCategoryBar` 状态声明（L90）
```diff
- const [showCategoryBar, setShowCategoryBar] = useState(true)
```

**改动 1b**：`handleScroll` 中删除分类栏隐藏逻辑（L424-L427）
```diff
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const st = el.scrollTop
-   if (st > lastScrollY.current && st > 60) {
-     setShowCategoryBar(false)
-   } else {
-     setShowCategoryBar(true)
-   }
    lastScrollY.current = st
    setShowBackTop(st > 200)
  }, [])
```

**改动 1c**：底部栏移除 `transform` 动画（L865）
```diff
- transform: showCategoryBar ? 'translateY(0)' : 'translateY(100%)',
- transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
```

### 修改 2：添加顶部分类下拉选择器

在背诵主内容区 .animate-page-in 内、进度信息行上方新增，选择新分类时切换：
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>分类</span>
  <select
    value={selectedCategoryId || ''}
    onChange={(e) => {
      const newId = e.target.value
      if (newId && newId !== selectedCategoryId) {
        setSelectedCategoryId(newId)
        localStorage.setItem('memorize_category', newId)
        loadCards(newId)
      }
    }}
    style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-text)', appearance: 'auto' }}
  >
    {state.categories.map(c => (
      <option key={c.id} value={c.id}>{c.name}</option>
    ))}
  </select>
</div>
```

### 修改 3：缩小卡片右上角图标

卡片正/背面右上角的收藏和移动按钮当前为 `44x44` 的 `.icon-btn`，在较小手机上过于显眼。改为内联样式 `32x32`：

**卡片正面右上角** L617-L649：
```jsx
// 收藏按钮 size: 32x32, icon 18x18
// 移动按钮 size: 32x32, icon 18x18
```

**卡片背面右上角** L695-L727（同理）：
```
// 同上调整
```

### 修改 4：底部操作按钮间距优化

底部分类栏固定在卡片内容下方，确保滚动区域 `padding-bottom` 足够容纳底部栏高度。

## 验证步骤

1. 进入背诵页 → 底部分类栏始终可见
2. 选择分类和模式 → 卡⽚正常显示
3. 滚动卡片 → 分类栏不消失
4. 点击顶部下拉 → 切换分类 → 卡片立即切换
5. 小屏手机（360px 宽）上所有图标可点击、不重叠
6. `vite build` 编译通过
