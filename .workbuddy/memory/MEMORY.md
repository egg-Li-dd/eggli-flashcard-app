# eggLi 背诵卡片应用 — 项目长期笔记

## 项目现状（2026-09-19）

- 技术栈：React 19 + Vite 8 + Capacitor 8（Android）+ 腾讯云 CloudBase（PostgreSQL）
- 规模：`src/` 159 个源文件 / 11.1 万行
- **无 Git 仓库**，无版本历史与回滚点
- 数据层走腾讯云 CloudBase 远程，无自建后端（除本地 OCR 服务）
- `.env` 内含真实 `VITE_CLOUDBASE_ACCESS_KEY`，对外分享前需脱敏

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
