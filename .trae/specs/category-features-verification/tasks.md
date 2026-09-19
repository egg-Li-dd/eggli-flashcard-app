# 分类页面四项功能验证 - 任务列表

> 所有任务均为代码审查/验证任务，无需编写新代码。

## [x] Task 1: 验证功能一 — 单元概览文字编辑
- **Priority**: P0
- **Depends On**: None
- **Description**: 审查 Category.jsx L1144-L1248 确认单元编辑功能完整性
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 确认 `renamingUnitId` 状态存在 (L44)
  - `programmatic` TR-1.2: 确认编辑按钮(铅笔图标)存在 (L1227-1246)
  - `programmatic` TR-1.3: 确认 `updateUnit(unit.id, { name: newName })` 调用 (L1182)
  - `programmatic` TR-1.4: 确认 Enter/Escape 键盘处理 (L1189-1196)

## [x] Task 2: 验证功能二 — 概览点击自动跳转展开
- **Priority**: P0
- **Depends On**: None
- **Description**: 审查 Category.jsx L1157-L1168 确认跳转展开逻辑
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 确认 `forceExpandUnitId` 状态存在 (L53)
  - `programmatic` TR-2.2: 确认 `scrollIntoView` 调用 (L1161)
  - `programmatic` TR-2.3: 确认 `setForceExpandUnitId(unit.id)` (L1163)
  - `programmatic` TR-2.4: 确认 500ms 后复位 (L1164-1166)
  - `programmatic` TR-2.5: 确认关闭概览面板 (L1167)
  - `programmatic` TR-2.6: 确认 `forceExpanded` prop 传递给 UnitGroup (L1315)

## [x] Task 3: 验证功能三 — 长按卡片多选操作
- **Priority**: P0
- **Depends On**: None
- **Description**: 审查 Category.jsx L761-L1105 确认多选操作完整性
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 确认 300ms 长按定时器 (L763)
  - `programmatic` TR-3.2: 确认多选工具栏有：批量收藏 (L1045)、批量移动 (L1061)、批量删除 (L1078)、退出 (L1094)
  - `programmatic` TR-3.3: 确认批量移动默认目标=当前分类 (L861)
  - `programmatic` TR-3.4: 确认批量删除有二次确认 (L789-794)
  - `programmatic` TR-3.5: 确认批量收藏支持切换 (L814-835)

## [x] Task 4: 验证功能四 — 新卡片管理弹窗（NewCardPanel）
- **Priority**: P0
- **Depends On**: None
- **Description**: 审查 Category.jsx + NewCardPanel.jsx 确认完整流程
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 确认 AI 语义归类调用 `classifyCardsByCategoryContent` (L223-237)
  - `programmatic` TR-4.2: 确认去重逻辑 (L279-315)
  - `programmatic` TR-4.3: 确认 NewCardPanel 三个点菜单按钮 (NewCardPanel.jsx L325-339)
  - `programmatic` TR-4.4: 确认菜单项：编辑内容、归类已有单元、新单元、移除 (L357-382)
  - `programmatic` TR-4.5: 确认编辑弹窗 front/back textarea (L458-521)
  - `programmatic` TR-4.6: 确认批量操作工具栏 (L226-261)
  - `programmatic` TR-4.7: 确认底部确定按钮 (L533-539)
  - `programmatic` TR-4.8: 确认 commitPanelToDB 回调 (Category.jsx L429-440)
  - `programmatic` TR-4.9: 确认 safeCards/safeExistingUnits 防御 (NewCardPanel.jsx L23-24)

## 验证汇总

所有代码审查任务均已完成，无需代码变更。