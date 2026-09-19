# 分类页面四项功能验证 - 产品规范文档

## Why
用户在之前确认有三项功能（单元编辑、多选、新卡片弹窗）已实现，一项（概览跳转展开）未确认。需要全面审查代码确认四项功能是否都已完整实现。

## What Changes
无代码变更 — 纯验证任务。检查 Category.jsx + NewCardPanel.jsx 中四项功能的实现完整性。

## Impact
- Affected specs: 无（纯验证）
- Affected code: `src/pages/Category.jsx`, `src/components/NewCardPanel.jsx`, `src/services/aiService.js`

---

## 功能一：单元概览文字编辑

**Requirements**: 允许用户在分类页面的单元概览中进行单元内容的文字编辑

### 代码位置
- [src/pages/Category.jsx L1144-L1248](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Category.jsx#L1144-L1248)

### 实现细节
| 组件 | 行号 | 说明 |
|------|------|------|
| `renamingUnitId` 状态 | L44 | 控制哪个单元处于编辑模式 |
| 编辑按钮(铅笔图标) | L1227-1246 | `onClick` → `setRenamingUnitId(unit.id)` |
| 行内 input 编辑框 | L1170-1209 | 当 `isEditingThis` 为 true 时渲染 |
| `onBlur` 保存 | L1178-1186 | 调用 `updateUnit(unit.id, { name: newName })` → `loadUnits()` |
| Enter 确认 | L1189-1192 | `e.target.blur()` 触发 onBlur 保存 |
| Escape 取消 | L1193-1196 | `setRenamingUnitId(null)` 不保存 |

### 结论
✅ **已完整实现**。用户可点击铅笔图标编辑单元名，Enter 确认 / Escape 取消 / 失焦保存，均通过 `updateUnit` 写入本地数据库。

---

## 功能二：概览点击单元自动跳转展开

**Requirements**: 在概览中点击单元时自动跳转到此单元页面，并自动展开

### 代码位置
- [src/pages/Category.jsx L53, L1157-1168, L1315](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Category.jsx#L1157-L1168)

### 实现细节
| 组件 | 行号 | 说明 |
|------|------|------|
| `forceExpandUnitId` 状态 | L53 | 记录需要强制展开的单元 ID |
| 点击概览项 → 滚动到目标 | L1159-1161 | `el.scrollIntoView({ behavior: 'smooth', block: 'start' })` |
| 强制展开 | L1163 | `setForceExpandUnitId(unit.id)` |
| 500ms 后复位 | L1164-1166 | `setTimeout → setForceExpandUnitId(null)` |
| 关闭概览面板 | L1167 | `setOverviewOpen(false)` |
| 传递给 UnitGroup | L1315 | `forceExpanded={forceExpandUnitId === unit.id}` |

### 结论
✅ **已完整实现**。点击概览项后：(1)滚动到对应单元 (2)强制展开 (3)关闭概览面板 (4)500ms 后释放强制展开状态。

---

## 功能三：长按卡片多选操作

**Requirements**: 允许用户在进入分类界面后长按卡片进行多选操作，包括：
- 移动（本分类的其他单元）
- 删除
- 收藏

### 代码位置
- [src/pages/Category.jsx L761-1105](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Category.jsx#L761-L1105)

### 实现细节
| 组件 | 行号 | 说明 |
|------|------|------|
| 长按检测 | L761-780 | 300ms `setTimeout` 触发 `handleStartSelection(cardId)` |
| 触摸移动/结束取消 | L769-780 | `clearTimeout` 防止误触发 |
| 点击切换选中 | L783-786 | 多选模式下点击切换选中状态 |
| 多选工具栏 | L1022-1105 | 蓝色背景条显示选中数 + 操作按钮 |
| 批量收藏 | L1045-1060 | `handleBatchBookmark` — 支持收藏/取消收藏 |
| 批量移动 | L1061-1077 | `handleBatchMoveOpen` → 目标分类默认=当前分类 (L861) |
| 批量删除 | L1078-1093 | `handleBatchDeleteOpen` → 确认对话框 |
| 退出多选 | L1094-1105 | `handleClearSelection` |
| 移动支持新建单元 | L1434 | 移动对话框中支持在目标分类直接创建新单元 |

### 结论
✅ **已完整实现**。三个操作均已覆盖：收藏 (L814-835)、移动 (L855-868, 目标默认当前分类)、删除 (L789-811)。

---

## 功能四：新卡片管理弹窗（NewCardPanel）

**Requirements**: 允许用户在输入内容后，弹出弹窗用于管理即将新添加进来的卡片：
- 以卡片形式展示（正面/背面/单元标签）
- 右侧三个点菜单按钮
- 菜单包含：修改内容、归类到本分类其他单元、作为新单元、移除卡片
- AI 根据本分类所有单元/卡片内容做语义归类
- 长按卡片进入多选模式（批量改单元/批量删除）
- 弹窗底部确定按钮
- 确定后按用户和 AI 的归类结果归类到对应单元

### 代码位置
- 入口：[src/pages/Category.jsx L223-354](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Category.jsx#L223-L354)
- 弹窗组件：[src/components/NewCardPanel.jsx](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/NewCardPanel.jsx)

### 实现细节

#### 入口流程（Category.jsx）
| 步骤 | 行号 | 说明 |
|------|------|------|
| AI 语义归类 | L223-237 | `classifyCardsByCategoryContent(existingUnits, existingCards, newCards, config)` |
| 组装 unitDataList | L239-277 | AI 归类结果 → existingUnitIdToCards + newUnitNameToCards |
| 去重检查 | L279-315 | `simpleTextSimilarity` 85% 阈值 |
| 重复卡片确认 | L320-332 | 有重复 → `setShowDuplicateConfirm(true)` |
| 打开 NewCardPanel | L334-354 | 不直接入库，交给用户确认编辑 |
| 确定回调 | L429-440 | `commitPanelToDB` → `addUnitsWithMatching` → `finishGenerate` |

#### NewCardPanel 弹窗（NewCardPanel.jsx）
| 功能 | 行号 | 说明 |
|------|------|------|
| 卡片展示 | L279-389 | 每张卡片显示 front + back + 单元标签（📍/🆕） |
| 三个点菜单按钮 | L325-339 | SVG 竖排三点图标，点击展开菜单 |
| ✏️ 编辑内容 | L357-359 | 打开编辑弹窗（L458-521），含 front/back textarea |
| 📂 归类到已有单元 | L363-369 | 遍历 `safeExistingUnits` 列出所有可选项 |
| 🆕 作为新单元 | L371-374 | 自动命名 |
| 🗑️ 移除卡片 | L377-382 | 从列表中删除 |
| 长按多选 | L226-261 | 蓝底工具栏：批量改单元 / 批量删除 / 退出 |
| 批量改单元弹窗 | L392-456 | 选择目标单元（已有单元列表 + 新建单元输入） |
| 底部确定按钮 | L533-539 | "确定 (N 张)"，调用 `handleConfirm` 组织 unitDataList |
| 数据回传 | L113-140 | `handleConfirm` → 按 isNewUnit/unitId 分组 → `onConfirm(unitDataList)` |

### 结论
✅ **已完整实现**。完整流程：AI 语义归类 → 去重 → 弹出 NewCardPanel → 用户编辑/归类/删除/批量操作 → 确定 → 入库。

---

## 验证总结

| # | 功能 | 状态 | 关键文件 |
|---|------|------|----------|
| 1 | 单元概览文字编辑 | ✅ 已实现 | Category.jsx L1170-1246 |
| 2 | 概览点击自动跳转展开 | ✅ 已实现 | Category.jsx L1157-1168 |
| 3 | 长按多选（移动/删除/收藏） | ✅ 已实现 | Category.jsx L761-1105 |
| 4 | 新卡片管理弹窗（全流程） | ✅ 已实现 | Category.jsx + NewCardPanel.jsx |

**四项功能均已完整实现，无需代码变更。**