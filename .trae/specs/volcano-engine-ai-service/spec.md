# 讯飞星火连通性修复 + 火山引擎豆包接入 Spec

## Why

讯飞星火 API 在手机端持续报"网络请求失败"，历史 4 轮修复（v3.5/v3.6/v3.7 及更早 `iflytek-connection-fix`）均未打通。经过分析：

- Android 网络权限（INTERNET / usesCleartextTraffic / network_security_config）已正确配置
- Java 编译错误（`PluginRequestCodes`/`savedCall.error()`）已修复
- 但用户尚未重新构建包含修复的 APK

与此同时，用户明确表示倾向接入**火山引擎（ByteDance）豆包/Ark 大模型**作为备选 AI 服务，国内直连稳定，不需要代理。

## What Changes

### 路径 A：验证讯飞星火修复（快速）

- 用户重新构建 APK（`npm run build && npx cap sync android && cd android && .\gradlew assembleDebug`）
- 在手机端重新安装测试
- 若仍报"网络请求失败"，则转向路径 B

### 路径 B：接入火山引擎 Ark 大模型（主推）

- 在 `constants.js` 中添加火山引擎 Ark API 端点和支持的模型列表
- 新建 `src/services/volcanoEngine.js` 封装 Ark API 调用（生成卡片/语音整理/图片 OCR）
- 在 `AppContext.jsx` 中添加 `aiServiceMode` 对 `volcano` 的支持
- 在 `SettingsAiService.jsx` 中添加火山引擎配置 UI（API Key 输入 + 模型选择 + 测试连接）
- 在 `aiService.js` 中添加火山引擎路由（类似于 DeepSeek / 讯飞星火的调用分发）
- 火山引擎 API 采用 OpenAI 兼容格式（`Authorization: Bearer <APIKey>`），国内可直接访问

## Impact

- Affected specs: `iflytek-spark-config-fix`、`v3.7-iflytek-spark-network-fix`（历史遗留）
- Affected code:
  - `src/utils/constants.js` — 新增火山引擎端点和模型常量
  - `src/services/volcanoEngine.js` — 新建
  - `src/services/aiService.js` — 添加火山引擎路由分发
  - `src/context/AppContext.jsx` — 添加 volcano 服务模式
  - `src/pages/SettingsAiService.jsx` — 添加火山引擎配置 UI

## ADDED Requirements

### Requirement: 讯飞星火 APK 重建验证

用户 SHALL 在修复 Java 编译错误后重新构建 APK，否则修复不会生效。

### Requirement: 火山引擎 Ark 大模型接入

系统 SHALL 支持将火山引擎 Ark 大模型作为第三 AI 服务选项，与 DeepSeek / 讯飞星火并列。

#### Scenario: 用户选择火山引擎作为 AI 服务

- **WHEN** 用户在设置页选择"火山引擎"作为 AI 服务提供商
- **THEN** 显示火山引擎配置输入区（API Key + 模型选择 + 测试连接按钮）

#### Scenario: 使用火山引擎生成卡片

- **WHEN** 用户使用 AI 生成卡片功能且当前 AI 服务为火山引擎
- **THEN** 调用火山引擎 Ark API，返回卡片内容

#### Scenario: 火山引擎 API 测试连接

- **WHEN** 用户填写 API Key 并点击"测试连接"
- **THEN** 向火山引擎 API 发送一个简单请求，根据返回判断凭证是否有效

## MODIFIED Requirements

### Requirement: AI 服务模式选择

`AI_SERVICE_MODES` SHALL 新增火山引擎选项 `{ value: 'volcano', label: '火山引擎 (豆包/Ark)' }`。

### Requirement: aiService.js 路由分发

`callAiService` / `testAiConnection` SHALL 支持 `'volcano'` 模式，分发到 `volcanoEngine.js`。

## API 规格（火山引擎 Ark）

```
端点: https://ark.cn-beijing.volces.com/api/v3/chat/completions
认证: Authorization: Bearer <APIKey>
格式: OpenAI 兼容 (messages array)
模型示例:
  - doubao-pro-32k (豆包 Pro 32K, 免费额度高)
  - doubao-pro-4k (豆包 Pro 4K)
  - doubao-lite-32k (豆包 Lite 32K)
```

火山引擎 API 支持国内直连，不需要代理，延迟低，Token 价格合理。
