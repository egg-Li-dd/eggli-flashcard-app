# 语音输入无法工作修复计划

## 问题诊断

经过全面代码审查，语音输入无法工作有**三个可能的根因**，取决于用户当前的使用环境：

### 根因 1：默认模式自动降级到 whisper-api，用户无感知

默认语音模式为 `web-speech`，但移动内置浏览器（Android WebView、微信浏览器等）**不支持** `window.SpeechRecognition`。`resolveAvailableMode()` 会静默降级到 `whisper-api` 模式。用户看到语音按钮但不知道实际运行的是录音模式，如果 API Key 未配置就会卡住。

**代码路径**：[recorder.js L58-L71](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/recorder.js#L58-L71) → [InputBar.jsx L164-L166](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/InputBar.jsx#L164-L166)

### 根因 2：HTTP 部署导致 `isSecureContextForMic()` 返回 false

[recorder.js L34-L43](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/recorder.js#L34-L43):

```javascript
export const isSecureContextForMic = () => {
  if (typeof window === 'undefined') return false
  try {
    const host = location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '') return true
    return !!window.isSecureContext
  } catch (_) { return false }
}
```

如果通过 `http://192.168.x.x:5173`（非 localhost IP）访问，`window.isSecureContext` 为 `false`，返回 `false` → 录音被拒绝 → 显示"录音需要 HTTPS 环境"。

**注意**：在 Capacitor APK 中，`location.hostname` 为 `localhost`（本地资源加载），所以 APK 不受此影响。

### 根因 3：Capacitor APK 中 web-speech 模式的原生插件检测可能失败

`isTrueCapacitor()` ([InputBar.jsx L171-L178](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/InputBar.jsx#L171-L178)) 检查 `window.Capacitor?.isNativePlatform`。部分 Android 版本或 WebView 实现中此标记可能缺失，导致 Capacitor 环境检测失败，进而不使用原生语音插件。

## 修复方案

### 修改 1：`isSecureContextForMic()` 增加 Capacitor 环境白名单

**文件**：[recorder.js L34-L43](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/recorder.js#L34-L43)

当运行在 Capacitor 原生环境或 `localhost` 时，始终返回 `true`（本地资源通过 `androidScheme: "https"` 加载，强制安全上下文）：

```javascript
export const isSecureContextForMic = () => {
  if (typeof window === 'undefined') return false
  try {
    const host = location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '') return true
    if (window.Capacitor?.isNativePlatform) return true
    return !!window.isSecureContext
  } catch (_) {
    return false
  }
}
```

### 修改 2：`isTrueCapacitor()` 检测逻辑加固

**文件**：[InputBar.jsx L171-L178](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/InputBar.jsx#L171-L178)

增加 `location.hostname === 'localhost' && location.protocol === 'https:'` 作为 Capacitor 环境的辅助判断：

```javascript
const isTrueCapacitor = () => {
  if (typeof window === 'undefined') return false
  return !!(
    window.Capacitor?.isNativePlatform ||
    window.Capacitor?.isPluginAvailable?.('SpeechRecognition') ||
    window.webkit?.messageHandlers?.bridge ||
    (window.location && window.location.protocol === 'capacitor:') ||
    (window.location.hostname === 'localhost' && window.location.protocol === 'https:')
  )
}
```

### 修改 3：模式降级时显示 toast 提示

**文件**：[InputBar.jsx L164-L166](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/InputBar.jsx#L164-L166)

当 `resolveAvailableMode` 返回的模式与用户首选不一致时（首次降级），通过 `showMsg` 提示：

```javascript
const preferredMode = state?.speechMode || 'web-speech'
const effectiveMode = resolveAvailableMode(preferredMode)
// 降级提示（仅首次）
const downgradedRef = useRef(false)
if (effectiveMode !== null && effectiveMode !== preferredMode && !downgradedRef.current) {
  downgradedRef.current = true
  // 延迟显示避免与组件渲染冲突
  setTimeout(() => {
    showMsg('当前浏览器不支持所选语音模式，已自动切换', 'info')
  }, 500)
}
```

### 修改 4：whisper-api 模式下增加更清晰的提示

**文件**：[InputBar.jsx L340-L343](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/InputBar.jsx#L340-L343)

当 API Key 未配置时，提示更明确地说明需要配置什么、去哪里配置。

## 修改清单

| 文件 | 修改 |
|------|------|
| `src/services/recorder.js` | `isSecureContextForMic()` 增加 `window.Capacitor?.isNativePlatform` 判断 |
| `src/components/InputBar.jsx` | `isTrueCapacitor()` 增加 `localhost+https` 判断 |
| `src/components/InputBar.jsx` | 模式降级时显示 toast 提示 |
| `src/components/InputBar.jsx` | whisper-api 缺 API Key 提示优化 |

## 验证步骤

1. 在 Capacitor APK 中点击语音按钮 → 原生语音插件启动
2. 在 HTTP 部署的网页中点击语音按钮 → 有明确的降级提示
3. 在 HTTPS 部署的 Chrome 中 → web-speech 正常工作
4. `vite build` 编译通过
