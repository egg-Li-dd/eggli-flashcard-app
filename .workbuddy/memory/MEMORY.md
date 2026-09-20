# eggLi 背诵卡片应用 — 项目长期笔记

## 项目现状（2026-09-19）

- 技术栈：React 19 + Vite 8 + Capacitor 8（Android）+ 腾讯云 CloudBase（PostgreSQL）
- 规模：`src/` 159 个源文件 / 11.1 万行
- 已建立 Git 仓库并推送 GitHub 私有基线（2026-09-20，见下节）
- 数据层走腾讯云 CloudBase 远程，无自建后端（除本地 OCR 服务）
- `.env` 内含真实 `VITE_CLOUDBASE_ACCESS_KEY`，对外分享前需脱敏

## Git 基线与推送（2026-09-20 建立）

- 本地仓库：项目根目录，分支 `main`；远端 `origin → https://github.com/egg-Li-dd/eggli-flashcard-app`（私有）
- 基线提交 `744f166`「清理前基线快照 v2.1」：**525 文件 / 33.8 MB / 密钥命中 0**；远端 `main` = `b92ae18`（合并提交在上）
- **`.gitignore` 已加固**：排除 `dist/`、`android/app/build`、`.gradle`、`android/app/src/main/assets/`（Capacitor 同步产物）、`*.aar`/`*.apk`、`.env`、keystore、根目录 `*.mjs` 运维脚本（**15 个脚本含明文 `service_role` 密钥**，必须保持排除）
- **推送必须走本地 git 直推，不要用 MCP 的 `publish_local_project`**（`/git/trees` 稳定 403）。四个必须项：本机代理 `127.0.0.1:65532`、`-c http.sslVerify=false`、`-c credential.helper="store --file=<Windows 路径>"` 注入令牌（`git credential fill` 可取到 `gho_` OAuth）、`GIT_TERMINAL_PROMPT=0`
- 完整配方与根因分析见根目录 `上传失败诊断说明.md`

## 架构要点

- 真实 AI 逻辑全在 `src/services/aiService.js`（13731 行），是单文件巨石
- `src/services/ai/` 目录（3344 行）是未接入的平行架构，仅测试引用
- 数据访问：`src/services/db.js`（4620 行）+ `cloudbase.js`
- `cloudbase.js` 中保留 `isValidSupabaseUrl` 等 Supabase 命名，是兼容性命名，**不要改**

## 关键词对照（避免误判）

- 「PC 引擎」= 跑在用户电脑上的 OCR/AI 引擎管理台，端口 19000，经 Tailscale 或局域网访问
- 「自建 PaddleOCR」= Python FastAPI 服务，端口 8000，在 `paddleocr_server/`
- `paddleOcrLocal.js` = **前端** WebView 内离线推理，与后端无关，勿删

## 文件操作约定

删前备份 → 移入回收站（不硬删）→ 改后重建索引。批量删除单批 ≤10 个文件，逐批验证。
