# Tasks

- [x] Task 1: 在 voskService.js 中新增 GitHub 代理镜像源常量与模型镜像 URL
  - [ ] SubTask 1.1: 新增镜像源基础常量：`VOSK_MIRROR_KKGITHUB = 'https://kkgithub.com'`、`VOSK_MIRROR_BGITHUB = 'https://bgithub.xyz'`、`VOSK_MIRROR_GHPROXY = 'https://ghproxy.com'`
  - [ ] SubTask 1.2: 为 VOSK_MODELS 中每个模型新增 `mirrorUrls` 数组，包含 kkgithub、bgithub、ghproxy 三个代理 URL（基于 GitHub release 路径生成）
  - [ ] SubTask 1.3: 导出 `getOrderedSources(modelId, userSelectedKey)` 辅助函数，按"用户选中 → 蓝奏云 → kkgithub → bgithub → ghproxy → GitHub 直连 → 主源"顺序返回源列表（过滤掉 null）

- [x] Task 2: 修改 SettingsSpeech.jsx 的下载源选择器和默认顺序
  - [ ] SubTask 2.1: `downloadSource` 默认值改为 `'lanzou'`（小模型）或 `'mirror_kkgithub'`（大模型无蓝奏云时），并在切换模型时自动调整默认源
  - [ ] SubTask 2.2: 下载源选择器 options 增加 `mirror_kkgithub`、`mirror_bgithub`、`mirror_ghproxy` 三项，每项标注说明（如 "kkgithub（国内镜像）"）；小模型时保留 `lanzou` 选项并标注"国内最快"
  - [ ] SubTask 2.3: `handleDownloadModel` 中使用 Task 1 的 `getOrderedSources` 构建下载源列表，传给 `downloadVoskModelWithFallback`
  - [ ] SubTask 2.4: 当前下载源显示文案优化，区分 "GitHub 代理（kkgithub）" 与原 "GitHub 备用"

- [x] Task 3: 验证 GitHub 代理镜像 URL 在原生端的兼容性
  - [ ] SubTask 3.1: 确认 VoskASRPlugin.java 的 `downloadZipFromSingleSource` 和 `downloadWithMultipleConnections` 能正确处理 kkgithub/bgithub 的 HTTPS 直链（无需特殊解析，走标准 OkHttp 请求）
  - [ ] SubTask 3.2: 确认 ghproxy 的 URL 格式（`https://ghproxy.com/https://github.com/...`）能被 OkHttp 正确解析（注意 URL 中嵌套 https:// 的处理）
  - [ ] SubTask 3.3: 确认代理镜像服务器支持 Range 请求（kkgithub/bgithub 是完整 GitHub 镜像应支持；ghproxy 透传 GitHub 的 Range 头）
  - [ ] SubTask 3.4: 若 ghproxy 嵌套 URL 解析有问题，对 ghproxy URL 做一次 URI 编码或使用 HttpUrl.Builder 构建

- [x] Task 4: 编译验证与打包
  - [ ] SubTask 4.1: 前端构建验证（`npm run build`）
  - [ ] SubTask 4.2: Android 编译验证（`npx cap sync android` + `gradlew assembleDebug`）
  - [ ] SubTask 4.3: 打包 Debug APK 供真机测试

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] 独立，可与 [Task 1][Task 2] 并行
- [Task 4] depends on [Task 1] and [Task 2] and [Task 3]
