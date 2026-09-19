# Vosk 模型下载加速 - 国内镜像源 + 重排默认顺序

## Why
当前已实现多连接分片下载（4 连接）但速度仍慢，根本原因是所有现有源本身在国内访问就慢：
- `alphacephei.com`（主源）服务器在欧洲，国内访问带宽低
- `github.com`（备用源）国内访问不稳定，常被限速到几十 KB/s
- 4 个连接打同一个慢服务器，提升有限（最多 4 倍 × 慢 = 仍然慢）

真正的解法是**换更快的源**：
1. 新增 GitHub 代理镜像（kkgithub.com、bgithub.xyz、ghproxy.com 等），这些镜像走国内 CDN，速度可达 MB/s 级
2. 默认源顺序改为：**蓝奏云 → GitHub 代理镜像 → GitHub 直连 → alphacephei 主源**（蓝奏云国内最快、解析后直链支持 Range 分片下载）
3. 对没有蓝奏云源的大模型，GitHub 代理镜像排第一

## What Changes
- **voskService.js**：
  - 为每个模型新增 `mirrorUrls` 数组，包含多个 GitHub 代理镜像 URL
  - 调整 `downloadVoskModelWithFallback` 调用时的源顺序：蓝奏云优先，GitHub 代理其次，主源最后
  - 新增镜像源常量：`VOSK_MIRROR_KKGITHUB`、`VOSK_MIRROR_BGITHUB`、`VOSK_MIRROR_GHPROXY`
- **SettingsSpeech.jsx**：
  - 下载源选择器增加"GitHub 代理（kkgithub）"、"GitHub 代理（bgithub）"、"GitHub 代理（ghproxy）"选项
  - 默认下载源改为 `lanzou`（蓝奏云优先），小模型无蓝奏云时默认 `mirror_kkgithub`
  - 显示当前镜像源名称，方便用户切换
- **VoskASRPlugin.java**：
  - 无需新增逻辑，现有 `downloadModelWithFallback` + `downloadWithMultipleConnections` 已支持任意 URL
  - 仅需确认代理镜像 URL 的 Range 请求支持（kkgithub/bgithub 是 GitHub 完整镜像，支持 Range；ghproxy 透传也支持）

## Impact
- Affected code:
  - `src/services/voskService.js`（新增镜像 URL 常量、调整源顺序）
  - `src/pages/SettingsSpeech.jsx`（更新源选择器 UI、默认源）
  - `android/app/src/main/java/com/eggli/flashcards/plugins/VoskASRPlugin.java`（无功能改动，仅验证代理 URL 兼容性）
- 不影响：识别功能、导入功能、其他设置项
- 不影响：APK 体积（不预置模型）
- 兼容性：现有蓝奏云解析逻辑保留，GitHub 代理走标准 HTTPS 直链，无需特殊解析

## ADDED Requirements

### Requirement: GitHub 代理镜像下载源
系统 SHALL 提供 GitHub 代理镜像下载源，通过国内 CDN 加速 GitHub Release 资源下载。

#### Scenario: 通过 kkgithub 镜像下载
- **WHEN** 用户选择 "GitHub 代理（kkgithub）" 下载源
- **THEN** 系统使用 `https://kkgithub.com/alphacep/vosk-api/releases/download/0.3.45/<model>.zip` 下载
- **THEN** 下载速度应显著提升（预期 1-5 MB/s，相比原 GitHub 直连的几十 KB/s）

#### Scenario: 通过 ghproxy 镜像下载
- **WHEN** 用户选择 "GitHub 代理（ghproxy）" 下载源
- **THEN** 系统使用 `https://ghproxy.com/https://github.com/alphacep/vosk-api/releases/download/0.3.45/<model>.zip` 下载
- **THEN** 该源作为 kkgithub 不可用时的备选

#### Scenario: 代理镜像失败自动切换
- **WHEN** 某个 GitHub 代理镜像下载失败（超时/404/5xx）
- **THEN** 系统自动切换到下一个代理镜像或其他源
- **THEN** 切换时发送 `sourceChanged` 事件通知前端

### Requirement: 默认下载源顺序优化
系统 SHALL 按国内用户网络环境优化默认下载源顺序。

#### Scenario: 小模型默认下载顺序
- **WHEN** 用户首次下载小模型（small-cn），未手动选择下载源
- **THEN** 系统按以下顺序尝试：蓝奏云 → kkgithub → bgithub → ghproxy → GitHub 直连 → alphacephei 主源
- **THEN** 蓝奏云优先（国内最快），失败自动切换

#### Scenario: 大模型默认下载顺序
- **WHEN** 用户下载大模型（big-cn，无蓝奏云源）
- **THEN** 系统按以下顺序尝试：kkgithub → bgithub → ghproxy → GitHub 直连 → alphacephei 主源
- **THEN** GitHub 代理镜像优先（大模型没有蓝奏云源）

### Requirement: 下载源选择器 UI
系统 SHALL 在下载源选择器中显示所有可用镜像源。

#### Scenario: 显示所有镜像源
- **WHEN** 用户打开下载源选择器
- **THEN** 选择器显示：蓝奏云（仅小模型）、kkgithub、bgithub、ghproxy、GitHub 直连、主源
- **THEN** 每个选项标注预计速度（如 "蓝奏云（国内最快）"、"kkgithub（国内镜像）"）
- **THEN** 默认选中蓝奏云（小模型）或 kkgithub（大模型）

## MODIFIED Requirements

### Requirement: 多源 fallback 下载
[原需求]：按顺序尝试每个下载源，失败自动切换下一个
[修改后]：在原有 fallback 基础上，源列表扩展为包含所有 GitHub 代理镜像；默认顺序按国内网络环境优化（蓝奏云/GitHub 代理优先）
