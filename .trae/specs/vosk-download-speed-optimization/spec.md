# Vosk 模型下载速度优化 - 多连接分片下载

## Why
当前 Vosk 模型下载使用单连接 OkHttp 下载，速度仅约 20KB/s，而相同网络环境下其他应用可达 25MB/s。根本原因是服务器对单连接限速，需要通过多连接分片下载突破限制。

## What Changes
- 原生端实现多连接分片下载（4 个并行连接，每个连接下载文件的不同部分）
- 下载前发送 HEAD 请求检测服务器是否支持 Range 请求
- 支持 Range 的服务器：多连接并行下载，完成后合并
- 不支持 Range 的服务器：自动回退到单连接下载
- 前端显示总体进度、当前速度、各分片进度
- 蓝奏云链接优先使用（国内最快源），解析后直接用多连接下载

## Impact
- Affected code: `VoskASRPlugin.java`（新增分片下载逻辑）、`voskService.js`（新增分片下载接口）、`SettingsSpeech.jsx`（UI 速度显示）
- 不影响导入功能、识别功能、其他设置功能

## ADDED Requirements

### Requirement: 多连接分片下载
系统 SHALL 支持使用多个并行 HTTP 连接下载 Vosk 模型文件，突破服务器单连接限速。

#### Scenario: 服务器支持 Range 请求
- **WHEN** 用户点击下载模型，且服务器响应 `Accept-Ranges: bytes`
- **THEN** 系统将文件分为 4 个分片，使用 4 个并行线程下载
- **THEN** 下载完成后合并为完整文件
- **THEN** 下载速度应显著提升（预期 4 倍以上）

#### Scenario: 服务器不支持 Range 请求
- **WHEN** 服务器不返回 `Accept-Ranges: bytes` 头
- **THEN** 系统自动回退到单连接下载
- **THEN** UI 显示"服务器不支持分片下载，使用单连接模式"

#### Scenario: 单个分片下载失败
- **WHEN** 某个分片下载失败（超时/网络错误）
- **THEN** 该分片自动重试 3 次
- **THEN** 重试仍失败则整个下载失败并提示错误

### Requirement: 下载速度实时显示
系统 SHALL 在下载过程中实时显示当前下载速度。

#### Scenario: 下载中显示速度
- **WHEN** 下载正在进行
- **THEN** UI 显示当前速度（如 "2.3 MB/s"）
- **THEN** UI 显示已下载大小和总大小
- **THEN** 速度每秒更新一次

### Requirement: 分片进度合并
系统 SHALL 将多个分片的下载进度合并为统一的进度显示。

#### Scenario: 多分片同时下载
- **WHEN** 4 个分片并行下载
- **THEN** UI 显示总进度百分比（所有分片已下载字节 / 总大小）
- **THEN** 用户不需要知道分片细节
