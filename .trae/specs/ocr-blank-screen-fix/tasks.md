# AI 图片识别后白屏问题修复 - 实施计划（Tasks）

## [ ] Task 1: 修复 NewCardPanel.jsx 中直接使用非数组 props 的崩溃风险
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在 `NewCardPanel.jsx` 中添加 props 防御：
    - L276 `cards.map()` 前：确保 `cards` 是数组，使用 `const safeCards = Array.isArray(cards) ? cards : []`
    - L360 `existingUnits.map()` 前：确保 `existingUnits` 是数组，使用 `const safeUnits = Array.isArray(existingUnits) ? existingUnits : []`
    - L407 `existingUnits.map()` 前：同样的防御
    - L186 `useMemo` 中的 `cards.filter()` 前：同样的防御
  - 在 useEffect 初始化时，对 `initialCards` 进行 `Array.isArray` 检查（已存在，确保正确）
  - 在 `handleConfirm` 中，L110 `existingUnits` 确保使用 `const safeUnits = Array.isArray(existingUnits) ? existingUnits : []`
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 手动测试 — 当 `existingUnits` 为 `undefined`/`null`/`{}` 时，NewCardPanel 正常打开且不崩溃
  - `programmatic` TR-1.2: 手动测试 — 当 `cards` 为 `undefined`/`null`/`{}` 时，NewCardPanel 正常打开且显示空列表
  - `programmatic` TR-1.3: 手动测试 — `handleConfirm` 在 existingUnits 为非数组时不崩溃
  - `human-judgement` TR-1.4: 代码审查 — 确保所有 `.map()` / `.filter()` 调用前都有防御检查
- **Notes**: 这是最高优先级任务，最可能是白屏的直接原因

## [ ] Task 2: 修复 Category.jsx 中 handleGenerate 的 useCallback 依赖列表
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 在 `Category.jsx` L363 的 `handleGenerate` useCallback 依赖列表中，添加缺失的依赖项：
    - `state.iflytekSparkApiKey`
    - `state.volcanoApiKey`
    - `state.dashscopeApiKey`
    - `generating`
    - `ocrLoading`
    - `state.dashscopeApiKey`
    - `state.dashscopeModel`
  - 同时检查 `handleImageOCR`（L488）的依赖列表是否完整
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 代码审查 — 确保依赖列表与函数内访问的 state 字段一致
  - `human-judgement` TR-2.2: 手动测试 — 在移动端反复切换 AI 服务模式后发送图片，不出现异常
- **Notes**: 依赖不完整可能导致使用过期的 API 密钥，导致 API 请求失败

## [ ] Task 3: 确保 classifyCardsByCategoryContent 降级保护完整
- **Priority**: P1
- **Depends On**: None
- **Description**:
  - 在 `aiService.js` 的 `classifyCardsByCategoryContent` 中：
    - 确认最外层 try-catch 能捕获所有异常（包括内部 generateCards 抛出的异常）
    - 在内部 JSON 解析（`JSON.parse`）处添加额外的 try-catch（已存在，确保正确）
    - `fallbackClassify` 中确保 `existingUnits` 为空数组时也能正确返回（已有 `existingUnits || []` 防御，确认）
  - 检查 `deepseek.js` 的 `generateCards` 函数，确认当 apiKey 为 undefined 时抛出明确错误消息，而不是静默失败
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 手动测试 — 断网状态下调用 AI 归类，确保降级到关键词匹配且流程继续
  - `programmatic` TR-3.2: 代码审查 — 确认 classifyCardsByCategoryContent 的 catch 块正确调用 fallbackClassify
  - `programmatic` TR-3.3: 代码审查 — 确认 fallbackClassify 在 existingUnits 为空数组时不崩溃
- **Notes**: 虽然这个问题本身不会直接导致白屏（有 try-catch），但降级后的结果可能导致后续 unitDataList 构建异常

## [ ] Task 4: 添加应用级 Error Boundary
- **Priority**: P1
- **Depends On**: None
- **Description**:
  - 在 `src/components/` 目录下创建 `ErrorBoundary.jsx` 组件：
    - 使用类组件（class component）实现 getDerivedStateFromError 和 componentDidCatch
    - 错误时显示友好提示（图标 + 错误消息 + "刷新重试"按钮）
    - 记录错误到 console.error 方便调试
  - 在 `App.jsx` 中用 ErrorBoundary 包裹主内容区域（main-content / Router 内容）
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 手动测试 — 在 NewCardPanel 中故意引入渲染错误（如 undefined.map），确认 ErrorBoundary 捕获并显示错误页，而非白屏
  - `human-judgement` TR-4.2: 视觉检查 — 错误提示页按钮最小高度 44px，符合移动端标准
- **Notes**: 这是最后一道防线，即使有未知错误也不会导致白屏

## [ ] Task 5: 修复 CSS 变量 --color-bg-offset
- **Priority**: P2
- **Depends On**: None
- **Description**:
  - 在 `src/index.css` 的 `:root` 和 `body.theme-classic` 两个 CSS 变量定义块中添加 `--color-bg-offset`：
    - 默认主题：`--color-bg-offset: #F8FAFC;`（或与现有浅色背景一致）
    - 经典主题：`--color-bg-offset: #F5EEDF;`
  - 或者在 `NewCardPanel.jsx` 中替换 `--color-bg-offset` 为已定义的 `--color-border-light`
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgement` TR-5.1: 视觉检查 — NewCardPanel 卡片列表背景色正常显示
- **Notes**: 这是次要问题，不会导致崩溃，但影响用户体验

## [ ] Task 6: 验证移动端按钮尺寸合规
- **Priority**: P2
- **Depends On**: Task 1
- **Description**:
  - 检查 NewCardPanel.jsx 中所有可点击元素的最小高度：
    - 确认按钮（确认、取消、批量改单元）有 `minHeight: 44` 或 `min-height: 44px`
    - 确认菜单项（已有单元列表）有足够的点击区域
    - 确认输入框（front/back 编辑区域）有足够的高度
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `human-judgement` TR-6.1: 手动测试（手机端）— 所有按钮、输入框、菜单项易于点击
- **Notes**: 这是移动端体验检查，非崩溃修复

## 实施顺序建议
1. 先做 Task 1（NewCardPanel 数组防御）— 最可能是白屏直接原因
2. 同时做 Task 4（Error Boundary）— 作为最后防线
3. 然后 Task 2（依赖列表修复）
4. 最后 Task 3/5/6（次要问题）
