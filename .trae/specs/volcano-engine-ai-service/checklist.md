# Checklist

## 路径 A

- [ ] 用户重新构建 APK 后讯飞星火测试连接成功（手机端验证）
- [ ] 或：记录讯飞星火"网络请求失败"的具体错误详情（确认是 Capacitor Http 插件问题还是 fetch CORS 问题）

## 路径 B

- [x] constants.js 新增火山引擎端点、模型列表、AI 服务选项、存储键
- [x] volcanoEngine.js 实现了 generateCardsWithVolcano / cleanUpSpeechTextWithVolcano / extractTextFromImageWithVolcano / testVolcanoConnection
- [x] volcanoEngine.js 使用火山引擎 Ark API 端点和 OpenAI 兼容格式
- [x] aiService.js 支持 'volcano' 模式路由分发
- [x] AppContext.jsx 添加 volcanoApiKey 状态和 setVolcanoApiKey action
- [x] SettingsAiService.jsx 渲染火山引擎配置 UI（API Key 输入 + 模型选择 + 测试连接）
- [x] AI 服务提供商切换支持三种模式（DeepSeek / 讯飞星火 / 火山引擎）
- [x] npm run build 成功，无语法错误
