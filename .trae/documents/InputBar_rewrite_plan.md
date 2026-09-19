# InputBar.jsx 重写计划

## 目标概述
重写 `src/components/InputBar.jsx`，使其更紧凑、更适合移动端使用，把 AI 总结密度选择移入底部抽屉菜单，增强语音输入的错误反馈。

## 主要变更

### 1. 布局与定位
- 输入栏改为 `position: fixed` 位于视口底部
- `bottom: 0; left: 0; right: 0; z-index: 20`
- `padding-bottom: env(safe-area-inset-bottom, 0px)` 适配 iPhone 安全区
- 主容器背景色 `var(--color-surface)`
- 顶部加 `1px solid var(--color-border-light)` 细边框
- 顶部阴影 `box-shadow: 0 -4px 12px rgba(15,23,42,0.06)`
- 在组件主体上方增加 `padding-bottom: Xpx` 占位空间，避免遮挡页面底部内容

### 2. 样式方式
- 完全使用 inline style，与 `CardItem.jsx` 保持一致的风格
- 不使用 Tailwind class，不使用外部 CSS 类（除了 className 用于可能存在的动画 keyframes 引用，但尽量只用 inline style）
- 按钮固定 44x44px，圆角

### 3. 主输入区（紧凑高度 ~60-80px）
- `textarea` rows=2，背景色 `var(--color-border-light)`，边框 `var(--color-border)`
- 左侧：展开更多操作的 + 按钮（44x44px）
- 中间：textarea（自适应高度）
- 右侧：麦克风按钮 + 发送按钮（44x44px 各 1 个）
- 使用 flex 布局，`align-items: flex-end`

### 4. 录音/识别状态条（可选浮层）
- 录音状态条：`flex` 居中，`var(--color-primary-light)` 背景，显示「正在录音中...」+ 动画波形（用 inline style 动画或 CSS keyframes）
- 识别状态条：`flex` 居中，`var(--color-primary-light)` 背景，显示「正在识别图片文字...」+ 加载 spinner
- 仅在相应状态时显示，位于主输入区**上方**，作为浮层

### 5. 麦克风按钮交互
- 未录音时：蓝色背景 + 麦克风 SVG 图标
- 录音时：红色背景 + 停止/方波图标
- 点击时切换录音状态

### 6. 弹出操作菜单（showActions）- bottom sheet 结构
- 半透明遮罩 `position: fixed; inset: 0; z-index: 30; background-color: rgba(15,23,42,0.45)`
- 白色卡片：`position: fixed; bottom: 0; left: 0; right: 0; z-index: 40; background-color: var(--color-surface); border-radius: 20px 20px 0 0; padding: 12px 0 calc(env(safe-area-inset-bottom, 0px) + 16px); box-shadow: 0 -4px 20px rgba(15,23,42,0.12); animation: slideUp 0.25s ease-out`
- 灰色小把手：`width: 44px; height: 5px; border-radius: 3px; background-color: var(--color-border); margin: 0 auto 12px`
- padding: 16px

### 7. 操作菜单内容
1. **顶部标题**：选择录入方式（加粗字体）
2. **拍照识别按钮**（图标+文字）：左侧相机图标，背景 `var(--color-border-light)`
3. **从相册选取按钮**（图标+文字）：左侧图片图标，背景 `var(--color-border-light)`
4. **AI 总结密度分组**（新增）：
   - 小标题：「AI 总结密度」
   - segmented control 三选一：
     - 当前选中项高亮（`var(--color-primary)` 背景 + 白色文字）
     - 其他项（`var(--color-border-light)` 背景 + 次级文字色）
     - 点击调用 `onSummaryLevelChange` 并立即更新视觉高亮
5. **取消按钮**（底部独立分组，`var(--color-border-light)` 背景）

### 8. 增强语音输入错误反馈
- **环境检测**：
  - 检测浏览器是否支持 SpeechRecognition API
  - 检测是否在 HTTPS 或 localhost 环境（语音识别需要）
  - 检测是否为移动端 iOS Safari（特殊提示）

- **权限提示**：
  - 使用前先检测 `navigator.permissions` API（如可用）
  - `not-allowed` / `service-not-allowed` → 提示麦克风权限被拒绝，指引用户到浏览器设置
  - `no-speech` → 提示未检测到语音，请靠近麦克风
  - `audio-capture` → 提示未检测到麦克风设备
  - `network` → 提示需要网络连接
  - 其他错误 → 给出具体错误码

- **Capacitor 原生语音识别**：
  - 在支持时优先使用
  - 调用前调用 `requestSpeechPermission` 检查权限

### 9. 导入与接口
- **导入**：
  - `import { useState, useRef, useCallback, useEffect } from 'react'`
  - `import { isCapacitorSpeechAvailable, createNativeSpeechRecognition, requestSpeechPermission } from '../services/speech'`
  - `import { SUMMARY_LEVELS } from '../utils/constants'`
  - 注意：`createSpeechRecognition` 在原文件中是从 speech.js 导入的，但当前 `speech.js` 中导出的是 `createSpeechRecognition`。同时要使用 `window.SpeechRecognition || window.webkitSpeechRecognition` 做浏览器原生检测
  - 从 `'../services/speech'` 也需要导入 `isAnySpeechAvailable` 用于支持检测

- **保持不变的 props**：
  - `value: string`
  - `onChange: (v: string) => void`
  - `onSubmit: (text: string) => void`
  - `onImageOCR: (file: File) => void`
  - `onAudioRecord: (transcript: string) => void`
  - `ocrLoading: boolean`
  - `summaryLevel: string` ('detailed'|'standard'|'concise')
  - `onSummaryLevelChange: (level: string) => void`
  - `disabled: boolean`

### 10. 实现细节
- **防遮挡占位**：在组件最外层渲染一个 `div`（非 fixed），`height` 等于输入栏高度 + 安全区，给页面底部留空间
- **SVG 图标**：全部使用内联 SVG（从原文件保留风格，参考现有代码中的 SVG 图标）
- **textarea 回车处理**：Enter 发送，Shift+Enter 换行
- **录音波形动画**：用 5 个 span，inline style 动画延迟不同时间实现波形
- **spinner 动画**：用 CSS `@keyframes` 或 inline style `animation`

### 11. 文件结构
```
src/components/InputBar.jsx
```

## 交付物
- 完整的 `InputBar.jsx` 文件，替换原有内容
- 确保所有导入正确、所有 props 都使用到
- `npm run build` 编译通过
