# Tasks

## 路径 A：验证讯飞星火 APK 重建

- [ ] Task 1: 用户重新构建 APK 并测试讯飞星火连接
  - [ ] 在 Android Studio 或命令行执行 `npm run build && npx cap sync android && cd android && .\gradlew assembleDebug`
  - [ ] 安装新 APK 到手机
  - [ ] 在设置页配置讯飞星火凭证并测试连接
  - [ ] 若仍报"网络请求失败"，记录错误详情（Chrome DevTools remote debug 或 logcat）
  - [ ] 判定：转向路径 B 或继续排查

## 路径 B：接入火山引擎豆包大模型

- [x] Task 2: 在 constants.js 添加火山引擎端点和模型常量
  - [x] 添加 `VOLCANO_ENGINE_API_URL`
  - [x] 添加 `VOLCANO_ENGINE_MODELS` 模型列表
  - [x] 在 `AI_SERVICE_MODES` 添加 volcano 选项
  - [x] 在 `STORAGE_KEYS` 添加 volcano_api_key 存储键

- [x] Task 3: 新建 volcanoEngine.js 服务封装
  - [x] 实现 `generateCardsWithVolcano(text, apiKey, model, summaryLevel)`
  - [x] 实现 `cleanUpSpeechTextWithVolcano(rawText, apiKey, model)`
  - [x] 实现 `extractTextFromImageWithVolcano(base64Image, apiKey, model)`
  - [x] 实现 `testVolcanoConnection(apiKey, model)` 测试连接函数
  - [x] 所有函数使用火山引擎 Ark API 端点和 OpenAI 兼容格式

- [x] Task 4: 在 aiService.js 添加火山引擎路由分发
  - [x] 在 `callAiService` 中添加 `'volcano'` 分支
  - [x] 在 `testAiConnection` 中添加 `'volcano'` 分支
  - [x] 确保函数签名与 DeepSeek / 讯飞星火保持一致

- [x] Task 5: 在 AppContext.jsx 添加 volcano 服务模式
  - [x] 在 `initialState` 添加 `volcanoApiKey` 状态
  - [x] 在 `SETTINGS_STATE` reducer 添加对应字段
  - [x] 提供 `setVolcanoApiKey` action

- [x] Task 6: 在 SettingsAiService.jsx 添加火山引擎配置 UI
  - [x] 当 `aiServiceMode === 'volcano'` 时渲染火山引擎配置区
  - [x] API Key 输入框（密码模式 + 显示切换）
  - [x] 模型选择器（点击切换）
  - [x] 测试连接按钮（调用 testVolcanoConnection）
  - [x] 测试结果状态显示
  - [x] 更新 AI 服务提供商切换逻辑（三种选项循环）

- [x] Task 7: 构建测试
  - [x] `npm run build` 成功
  - [x] 浏览器预览模式测试火山引擎配置 UI 正常显示
  - [x] API Key 保存和加载正确

# Task Dependencies

- Task 3 depends on Task 2
- Task 4 depends on Task 3
- Task 5 depends on Task 4
- Task 6 depends on Task 5
- Task 7 depends on Task 6
