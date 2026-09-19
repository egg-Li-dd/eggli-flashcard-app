# AI 图片识别后白屏问题修复 - 产品需求文档（PRD）

## Overview
- **Summary**: 修复用户在分类页面上传图片并发送后，经历"正在识别图片 → AI 正在拆解"流程后直接白屏，无法打开新卡片管理弹窗（NewCardPanel）的问题。
- **Purpose**: 确保 OCR 识别 + AI 生成 + 语义归类的完整流程能够稳定执行，并正确弹出新卡片管理弹窗，让用户在提交到数据库前可以预览和编辑生成的卡片。
- **Target Users**: 在移动端（Android debug-apk）使用 AI 服务上传图片生成学习卡片的考研用户。

## Goals
1. 确保上传图片后的完整 OCR → 生成 → 归类 → 弹窗流程不崩溃、不白屏
2. 确保 NewCardPanel 在任何情况下都能正确渲染，不出现 undefined 导致的 map 崩溃
3. 确保 classifyCardsByCategoryContent 的 AI 归类流程能正确降级，不破坏后续流程
4. 添加应用级 Error Boundary，防止单组件崩溃导致整个应用白屏
5. 修正 handleGenerate 的闭包依赖问题，避免使用过期的 state 快照

## Non-Goals (Out of Scope)
- 不重构整个 AI 服务架构
- 不改变 OCR 识别服务的配置逻辑
- 不添加新的业务功能（只做稳定性修复）
- 不改变卡片生成的 UI 样式（除了必要的防御性代码）
- 不重构数据库结构

## Background & Context
### 问题现象
用户在分类页面配置好 AI 服务后，上传一张图片并发送：
1. 界面显示"正在识别图片"（OCR 阶段）
2. 识别成功后显示"AI 正在拆解"（卡片生成阶段）
3. 预期：弹出新卡片管理弹窗（NewCardPanel），让用户编辑/确认新卡片
4. 实际：直接白屏，无法继续操作

### 代码结构概览
- **入口流程**: `src/pages/Category.jsx` → `handleImageOCR(file)` → `handleGenerate(text)`
- **AI 服务路由**: `src/services/aiService.js` → `generateCards(...)` → 分发到 `deepseek.js` / `iflytekAi.js` / `volcanoEngine.js`
- **AI 语义归类**: `aiService.js` → `classifyCardsByCategoryContent(...)`（内部再次调用 `generateCards`）
- **弹窗组件**: `src/components/NewCardPanel.jsx`

### 关键发现（通过代码审查）
1. **NewCardPanel 渲染时直接使用 `existingUnits.map()`**（L360, L407）：如果 `existingUnits` props 不是数组（undefined/null），直接抛出 `Cannot read properties of undefined (reading 'map')`，导致整个 React 应用崩溃白屏
2. **NewCardPanel 渲染时直接使用 `cards.map()`**（L276）：如果 `cards` props 不是数组，同样崩溃
3. **`classifyCardsByCategoryContent` 内部调用 `generateCards(prompt, ...)` 时**，`deepseek.js` 的 `generateCards` 函数会在 prompt 前加上 `CARD_GENERATION_PROMPT_BY_LEVEL[summaryLevel]` 前缀，导致"生成 JSON 数组"的归类指令被污染为"生成卡片"的指令，AI 可能返回意外格式
4. **Category.jsx handleGenerate 的 useCallback 依赖列表不完整**（L363）：缺少 `state.iflytekSparkApiKey`、`state.volcanoApiKey`、`state.dashscopeApiKey`、`generating`、`ocrLoading` 等，可能导致使用过期闭包变量
5. **应用无 Error Boundary**：任何组件渲染时的未捕获同步异常都会卸载整个组件树，呈现白屏
6. **NewCardPanel 中 `useMemo` 计算 stats**（L186）：使用 `cards.filter(...)`，如果 cards 非数组，崩溃
7. **NewCardPanel 中使用 CSS 变量 `--color-bg-offset`**（L284）：在 `index.css` 中未定义，可能导致视觉异常（虽然不会崩溃）

## Functional Requirements
### FR-1: NewCardPanel 防御性渲染
- NewCardPanel 在渲染主卡片列表 `cards.map()` 前，确保 `cards` 是数组
- NewCardPanel 在渲染已有单元下拉列表 `existingUnits.map()` 前，确保 `existingUnits` 是数组
- NewCardPanel 的 `useMemo` stats 计算前，确保 `cards` 是数组

### FR-2: handleGenerate 依赖修复
- Category.jsx 的 `handleGenerate` useCallback 依赖列表包含所有在函数内访问的 state 字段
- 确保闭包变量始终是最新的

### FR-3: classifyCardsByCategoryContent 降级保护
- 当 AI 归类返回格式异常或 API 失败时，正确降级到基于关键词匹配的 fallbackClassify
- 不允许 classifyCardsByCategoryContent 抛出未捕获的异常

### FR-4: 应用级 Error Boundary
- 在 App.jsx 或根组件添加 Error Boundary，捕获子组件渲染异常
- 异常时显示友好的错误提示（而非白屏），并允许用户刷新/重试

### FR-5: CSS 变量修复
- 在 `index.css` 中定义 `--color-bg-offset` 变量或移除对它的引用

## Non-Functional Requirements
### NFR-1: 移动端适配
- 所有修复后的界面在 Android 手机端（debug-apk）正常显示
- 按钮、输入框最小高度 44px（符合移动端标准）

### NFR-2: 性能
- 修复不应引入额外的网络请求或显著的计算开销
- Error Boundary 不应影响正常渲染性能

### NFR-3: 代码质量
- 不破坏现有功能和界面
- 遵循现有代码风格（缩进、变量命名等）

## Constraints
- **技术栈**: React 18 + JavaScript（非 TypeScript）+ Capacitor（Android 打包）
- **数据库**: IndexedDB（Dexie.js）本地存储 + Supabase 云端同步
- **AI 服务**: DeepSeek / 讯飞星火 / 火山引擎 / DashScope（多路由）
- **平台**: Android 手机端（debug-apk）
- **Gradle**: Android Studio Gradle（Wrapper），Java_HOME: Amazon Corretto 26.0.1

## Assumptions
1. 用户的 AI 服务配置正确（API 密钥有效）
2. 网络连接正常（能访问 AI 服务）
3. IndexedDB 本地数据库可用
4. 图片上传格式支持（JPEG/PNG）
5. 用户报告的"白屏"是 React 组件渲染异常导致的应用崩溃，而非网络超时导致的长时间 loading

## Acceptance Criteria

### AC-1: NewCardPanel 不会因 props 为非数组崩溃
- **Given**: 用户完成图片 OCR 和 AI 生成，打开 NewCardPanel
- **When**: props `cards` 或 `existingUnits` 因为某种原因传入非数组值（undefined/null/对象）
- **Then**: NewCardPanel 正常渲染（显示空列表或已有单元列表为空），不崩溃
- **Verification**: `programmatic`
- **Notes**: 在 L276, L360, L407 三处 `.map()` 调用前添加 `Array.isArray()` 检查

### AC-2: handleGenerate 依赖列表完整
- **Given**: 用户在分类页面使用输入功能
- **When**: 相关的 state 字段（iflytekSparkApiKey, volcanoApiKey 等）改变后调用 handleGenerate
- **Then**: handleGenerate 内部访问到的始终是最新的 state 值
- **Verification**: `programmatic`
- **Notes**: 使用 ESLint exhaustive-deps 规则验证

### AC-3: classifyCardsByCategoryContent 降级可靠
- **Given**: AI 归类的网络请求失败或返回格式异常
- **When**: handleGenerate 继续执行
- **Then**: 调用 fallbackClassify 进行关键词匹配归类，流程继续执行并打开 NewCardPanel
- **Verification**: `programmatic`
- **Notes**: 确认 catch 块正确捕获且 fallbackClassify 不抛异常

### AC-4: Error Boundary 捕获组件异常
- **Given**: 某个子组件（如 NewCardPanel）渲染时抛出同步异常
- **When**: 应用尝试渲染该组件
- **Then**: Error Boundary 捕获异常，显示错误信息和"刷新重试"按钮，而不是白屏
- **Verification**: `human-judgment`
- **Notes**: 在 App.jsx 中添加 ErrorBoundary 组件包裹主要路由内容

### AC-5: CSS 变量 --color-bg-offset 已定义
- **Given**: 用户打开 NewCardPanel
- **When**: 查看卡片列表背景色
- **Then**: 背景色正确显示，不是透明/默认色
- **Verification**: `human-judgment`

### AC-6: 移动端按钮尺寸合规
- **Given**: 用户在手机端打开 NewCardPanel
- **When**: 点击编辑框、下拉菜单、确认/取消按钮
- **Then**: 所有可点击元素最小高度 44px，易于手指点击
- **Verification**: `human-judgment`

## Open Questions
- [ ] 用户报告的白屏是否确实在 AI 生成完成后发生，还是在 OCR 阶段？
- [ ] 在发生白屏前，用户的分类下是否有至少一个已创建的单元？
- [ ] 用户使用的是哪个 AI 服务（DeepSeek/讯飞星火/火山引擎）？不同服务的行为可能不同
- [ ] 是否有控制台的错误日志（例如在 Chrome DevTools 或 Android Studio Logcat 中）？
