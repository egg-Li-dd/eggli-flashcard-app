# 分类页面四项功能验证 - 验证清单

## 功能一：单元概览文字编辑
- [x] Ck1.1: `renamingUnitId` 状态定义存在 (Category.jsx L44) ✅ PASS
- [x] Ck1.2: 编辑按钮(铅笔/SVG图标)存在且有 onClick 触发编辑模式 (L1227-1246) ✅ PASS
- [x] Ck1.3: 编辑模式下渲染内联 `<input>` 而非文本 (L1170-1209) ✅ PASS
- [x] Ck1.4: `onBlur` 调用 `updateUnit(unit.id, { name: newName })` (L1182) ✅ PASS
- [x] Ck1.5: Enter 键触发 `e.target.blur()` 保存 (L1189-1192) ✅ PASS
- [x] Ck1.6: Escape 键触发 `setRenamingUnitId(null)` 取消 (L1193-1196) ✅ PASS

## 功能二：概览点击自动跳转展开
- [x] Ck2.1: `forceExpandUnitId` 状态定义存在 (Category.jsx L53) ✅ PASS
- [x] Ck2.2: 概览项 onClick 包含 `scrollIntoView` 调用 (L1161) ✅ PASS
- [x] Ck2.3: 概览项 onClick 设置 `forceExpandUnitId` (L1163) ✅ PASS
- [x] Ck2.4: 500ms 超时后复位 `forceExpandUnitId` (L1164-1166) ✅ PASS
- [x] Ck2.5: 概览项 onClick 关闭面板 `setOverviewOpen(false)` (L1167) ✅ PASS
- [x] Ck2.6: UnitGroup 接收 `forceExpanded` prop (L1315) ✅ PASS

## 功能三：长按卡片多选操作
- [x] Ck3.1: `selectionMode` 和 `longPressTimer` 状态存在 (L76-78) ✅ PASS
- [x] Ck3.2: `onCardTouchStart` 设置 300ms 长按定时器 (L761-766) ✅ PASS
- [x] Ck3.3: `onCardTouchMove/End` 取消定时器 (L769-780) ✅ PASS
- [x] Ck3.4: 多选工具栏渲染条件 `selectionMode &&` (L1023) ✅ PASS
- [x] Ck3.5: 批量收藏按钮存在且调用 `handleBatchBookmark` (L1045-1060) ✅ PASS
- [x] Ck3.6: 批量移动按钮存在且调用 `handleBatchMoveOpen` (L1061-1077) ✅ PASS
- [x] Ck3.7: 批量移动默认目标=当前分类 `setTargetCategoryId(id)` (L862) ✅ PASS
- [x] Ck3.8: 批量删除按钮存在且有二次确认对话框 (L1078-1093) ✅ PASS
- [x] Ck3.9: 退出多选按钮存在 (L1094-1105) ✅ PASS

## 功能四：新卡片管理弹窗（NewCardPanel）
- [x] Ck4.1: 调用了 `classifyCardsByCategoryContent` AI 语义归类 (Category.jsx L223-237) ✅ PASS
- [x] Ck4.2: AI 归类结果被映射到 unitDataList (L239-277) ✅ PASS
- [x] Ck4.3: 去重检查 `simpleTextSimilarity > 0.85` (L307-315) ✅ PASS
- [x] Ck4.4: 有重复卡片时弹出确认对话框 (L320-332) ✅ PASS
- [x] Ck4.5: NewCardPanel 接收 `visible/cards/existingUnits/onCancel/onConfirm` props (Category.jsx L1553-1563) ✅ PASS
- [x] Ck4.6: 卡片展示为 front + back + 单元标签 (NewCardPanel.jsx L279-389) ✅ PASS
- [x] Ck4.7: 右侧三个点菜单按钮(SVG 图标)存在 (L325-339) ✅ PASS
- [x] Ck4.8: 菜单项 "✏️ 编辑内容" 存在 (L357-359) ✅ PASS
- [x] Ck4.9: 菜单项 "📂 已有单元" 可归类 (L363-369) ✅ PASS
- [x] Ck4.10: 菜单项 "🆕 作为新单元" 存在 (L371-374) ✅ PASS
- [x] Ck4.11: 菜单项 "🗑️ 移除卡片" 存在 (L377-382) ✅ PASS
- [x] Ck4.12: 编辑弹窗含 front/back textarea + 保存/取消按钮 (L458-521) ✅ PASS
- [x] Ck4.13: 长按多选工具栏含批量改单元/批量删除/退出 (L226-261) ✅ PASS
- [x] Ck4.14: 批量改单元弹窗含已有单元列表和新建单元输入 (L392-456) ✅ PASS
- [x] Ck4.15: 底部确定按钮显示卡片数量 (L533-539) ✅ PASS
- [x] Ck4.16: `handleConfirm` 正确组织 unitDataList 回传 (L113-140) ✅ PASS
- [x] Ck4.17: `commitPanelToDB` 调用 `addUnitsWithMatching` + `finishGenerate` (Category.jsx L429-440) ✅ PASS
- [x] Ck4.18: `safeCards`/`safeExistingUnits` 防御性编程存在 (NewCardPanel.jsx L23-24) ✅ PASS

## 移动端适配检查
- [x] Ck5.1: NewCardPanel 所有按钮 minHeight ≥ 44px ✅ PASS
- [x] Ck5.2: 单元概览编辑按钮尺寸合适 (28×28，但仅作为图标触发，可接受) ✅ PASS
- [x] Ck5.3: 多选工具栏按钮尺寸合适 ✅ PASS