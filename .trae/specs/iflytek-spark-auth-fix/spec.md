# 讯飞星火 API 连接修复计划

> **问题分析**：
1. 报错显示"Failed to fetch"，表明网络层失败，可能是认证方式不正确
2. **切换讯飞星火模型时，输入框内的凭证数据不变化**，但不同模型可能需要不同凭证

**Goal:** 修复讯飞星火 API 连接问题，包括认证方式和模型切换时的凭证管理

**Architecture:** 对照官方文档检查并修复认证机制，同时为每个模型提供独立的凭证存储

**Tech Stack:** JavaScript/TypeScript, Capacitor Http, 讯飞星火 Web API

---

## 问题诊断

### 问题 1: 认证方式错误
根据官方文档，讯飞星火 Web API 需要 HMAC-SHA256 签名认证，当前使用的 `Bearer <APIKey:APISecret>` 是错误的。

### 问题 2: 模型切换时凭证不变
当前实现中，所有讯飞星火模型共用同一套 APIKey/APISecret，但用户可能为不同模型配置了不同的凭证。

---

## 任务分解

### Task 1: 实现讯飞星火官方认证签名算法

**Files:**
- Create: `src/utils/sparkAuth.js`
- Modify: `src/services/iflytekAi.js`

实现官方要求的 HMAC-SHA256 签名认证。

### Task 2: 为每个星火模型提供独立的凭证存储

**Files:**
- Modify: `src/utils/constants.js` - 为每个模型添加独立存储键
- Modify: `src/context/AppContext.jsx` - 添加模型级别的凭证状态
- Modify: `src/pages/SettingsAiService.jsx` - 切换模型时加载对应凭证

### Task 3: 增强错误处理和日志

**Files:**
- Modify: `src/services/iflytekAi.js`
- Modify: `src/utils/httpClient.js`

添加详细的错误类型识别。

### Task 4: 构建测试验证

**Files:**
- Test: Android APK

---

## 代码修改清单

### 新增文件
- `src/utils/sparkAuth.js` - 签名生成工具

### 修改文件
- `src/services/iflytekAi.js` - 更新认证方式和请求格式
- `src/utils/constants.js` - 添加模型级别的存储键
- `src/context/AppContext.jsx` - 添加模型级别的凭证状态
- `src/pages/SettingsAiService.jsx` - 切换模型时加载对应凭证
- `src/utils/httpClient.js` - 增强错误处理