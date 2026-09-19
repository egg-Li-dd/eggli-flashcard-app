# AI 图片识别后白屏问题修复 - 验证清单（Checklist）

## Task 1: NewCardPanel 数组防御验证
- [ ] Ck1.1: NewCardPanel.jsx 中 `cards.map()` 调用前有 `Array.isArray(cards)` 检查
- [ ] Ck1.2: NewCardPanel.jsx 中 `existingUnits.map()` 调用前有 `Array.isArray(existingUnits)` 检查（两处：L360 和 L407）
- [ ] Ck1.3: NewCardPanel.jsx 中 `useMemo` 计算 `stats` 前有 `Array.isArray(cards)` 检查
- [ ] Ck1.4: NewCardPanel.jsx 中 `handleConfirm` 函数内 `existingUnits` 使用前有防御
- [ ] Ck1.5: 手动测试 — 传入 `existingUnits={undefined}` 时 NewCardPanel 正常打开
- [ ] Ck1.6: 手动测试 — 传入 `cards={undefined}` 时 NewCardPanel 正常打开且显示空列表

## Task 2: handleGenerate 依赖列表验证
- [ ] Ck2.1: Category.jsx handleGenerate 的 useCallback 依赖列表包含 `state.iflytekSparkApiKey`
- [ ] Ck2.2: Category.jsx handleGenerate 的 useCallback 依赖列表包含 `state.volcanoApiKey`
- [ ] Ck2.3: Category.jsx handleGenerate 的 useCallback 依赖列表包含 `state.dashscopeApiKey`
- [ ] Ck2.4: Category.jsx handleGenerate 的 useCallback 依赖列表包含 `generating`
- [ ] Ck2.5: Category.jsx handleGenerate 的 useCallback 依赖列表包含 `ocrLoading`
- [ ] Ck2.6: Category.jsx handleImageOCR 的依赖列表完整

## Task 3: classifyCardsByCategoryContent 降级验证
- [ ] Ck3.1: aiService.js classifyCardsByCategoryContent 最外层有 try-catch
- [ ] Ck3.2: classifyCardsByCategoryContent catch 块正确调用 fallbackClassify
- [ ] Ck3.3: fallbackClassify 中 `existingUnits` 为空数组时能正确返回
- [ ] Ck3.4: deepseek.js generateCards 在 apiKey 为 undefined 时抛出明确错误

## Task 4: Error Boundary 验证
- [ ] Ck4.1: src/components/ErrorBoundary.jsx 文件存在
- [ ] Ck4.2: ErrorBoundary 是类组件，实现 getDerivedStateFromError
- [ ] Ck4.3: ErrorBoundary 实现 componentDidCatch 记录错误
- [ ] Ck4.4: App.jsx 中 ErrorBoundary 包裹主内容区域
- [ ] Ck4.5: 手动测试 — 在 NewCardPanel 中故意引入渲染错误，ErrorBoundary 捕获并显示错误页（非白屏）
- [ ] Ck4.6: 错误提示页按钮最小高度 44px（检查 style 属性或 CSS）

## Task 5: CSS 变量验证
- [ ] Ck5.1: index.css `:root` 块中定义了 `--color-bg-offset`
- [ ] Ck5.2: index.css `body.theme-classic` 块中定义了 `--color-bg-offset`
- [ ] Ck5.3: NewCardPanel 卡片列表背景色正常显示（视觉检查）

## Task 6: 移动端按钮尺寸验证
- [ ] Ck6.1: NewCardPanel "确认"按钮最小高度 ≥ 44px
- [ ] Ck6.2: NewCardPanel "取消"按钮最小高度 ≥ 44px
- [ ] Ck6.3: NewCardPanel 菜单项（已有单元列表）点击区域足够
- [ ] Ck6.4: NewCardPanel front/back 编辑框高度足够

## 集成测试（完整流程）
- [ ] Ck7.1: 断网状态下上传图片 → 显示错误提示而非白屏
- [ ] Ck7.2: 空分类（没有任何单元）下上传图片 → 正常打开 NewCardPanel
- [ ] Ck7.3: 分类有多个单元下上传图片 → 正常打开 NewCardPanel 并正确归类
- [ ] Ck7.4: NewCardPanel 编辑 front/back 后确认 → 卡片正确保存到数据库
- [ ] Ck7.5: NewCardPanel 批量改单元功能正常
- [ ] Ck7.6: 分类页面其他功能（单元编辑、长按多选等）正常，不受本次修复影响

## 移动端体验验证
- [ ] Ck8.1: Android 手机端（debug-apk）测试 — 上传图片流程不白屏
- [ ] Ck8.2: Android 手机端 — NewCardPanel 弹窗大小合适，不超出屏幕
- [ ] Ck8.3: Android 手机端 — 所有可点击元素易于手指点击
