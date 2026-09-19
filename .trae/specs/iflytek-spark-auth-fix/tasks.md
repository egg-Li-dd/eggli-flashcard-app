# 讯飞星火 API 连接修复 - 实现计划

## [ ] Task 1: 为每个星火模型提供独立的凭证存储

**Priority**: P0
**Depends On**: None
**Description**: 
  - 当前所有讯飞星火模型共用同一套 APIKey/APISecret
  - 需要为每个模型提供独立的凭证存储
  - 切换模型时自动加载对应模型的凭证

**Acceptance Criteria Addressed**: 切换模型时显示对应模型的凭证，不同模型可配置不同凭证

**Test Requirements**:
  - `programmatic`: 不同模型的凭证能独立保存和加载
  - `human-judgment`: 切换模型时输入框内容正确更新

**Files:**
- Modify: `src/utils/constants.js` - 添加动态存储键生成函数
- Modify: `src/context/AppContext.jsx` - 使用模型名作为存储键的一部分
- Modify: `src/pages/SettingsAiService.jsx` - 切换模型时加载对应凭证

- [ ] **Step 1: 在 constants.js 中添加动态存储键生成函数**

```javascript
export function getSparkCredentialKeys(model) {
  return {
    apiKey: `iflytek_spark_${model}_api_key`,
    apiSecret: `iflytek_spark_${model}_api_secret`
  };
}
```

- [ ] **Step 2: 更新 AppContext.jsx 使用模型级别的存储**

修改状态管理，根据当前模型动态读取/保存凭证

- [ ] **Step 3: 更新 SettingsAiService.jsx 切换模型时加载凭证**

监听模型变化，切换时加载对应模型的凭证

## [ ] Task 2: 实现讯飞星火官方认证签名算法

**Priority**: P0
**Depends On**: None
**Description**: 
  - 根据讯飞星火 Web API 官方文档实现正确的 HMAC-SHA256 签名认证
  - 当前使用的 `Bearer <APIKey:APISecret>` 是错误的认证方式

**Acceptance Criteria Addressed**: 修复认证方式，使 API 请求能通过认证

**Test Requirements**:
  - `programmatic`: 签名生成函数能正确生成符合格式的 authorization 字符串
  - `human-judgment`: 请求头格式符合官方文档要求

**Files:**
- Create: `src/utils/sparkAuth.js` (签名生成工具)
- Modify: `src/services/iflytekAi.js`

- [ ] **Step 1: 创建签名生成工具**

```javascript
// src/utils/sparkAuth.js
export async function generateSparkAuth(apiKey, apiSecret, url, method = 'POST') {
  const urlObj = new URL(url);
  const host = urlObj.host;
  const path = urlObj.pathname;
  const date = new Date().toUTCString();
  const requestLine = `${method} ${path} HTTP/1.1`;
  
  const signingStr = `host: ${host}\ndate: ${date}\n${requestLine}`;
  
  const encoder = new TextEncoder();
  const secretData = encoder.encode(apiSecret);
  const data = encoder.encode(signingStr);
  
  const key = await crypto.subtle.importKey(
    'raw', secretData, 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  
  const signature = await crypto.subtle.sign({ name: 'HMAC', hash: 'SHA-256' }, key, data);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return {
    host,
    date,
    authorization: `api_key="${apiKey}",algorithm="hmac-sha256",headers="host date request-line",signature="${signatureBase64}"`
  };
}
```

- [ ] **Step 2: 更新 iflytekAi.js 使用正确的认证**

修改请求函数，使用签名认证而非 Bearer token

## [ ] Task 3: 增强错误处理和日志

**Priority**: P1
**Depends On**: Task 2
**Description**: 
  - 添加更详细的错误类型识别
  - 改进错误提示信息

**Acceptance Criteria Addressed**: 用户能看到具体的错误原因

**Test Requirements**:
  - `programmatic`: 不同错误类型能正确识别
  - `human-judgment`: 错误提示信息清晰易懂

**Files:**
- Modify: `src/services/iflytekAi.js`
- Modify: `src/utils/httpClient.js`

- [ ] **Step 1: 添加错误类型常量并更新错误处理逻辑**

## [ ] Task 4: 构建测试验证

**Priority**: P0
**Depends On**: Task 1, 2, 3
**Description**: 
  - 构建项目验证代码无语法错误
  - 在 Android 真机上测试连接

**Acceptance Criteria Addressed**: 讯飞星火连接测试能正常工作，模型切换时凭证正确更新

**Test Requirements**:
  - `programmatic`: npm run build 成功
  - `human-judgment`: 手机端测试连接能显示具体结果，切换模型时凭证正确变化

---

## 代码修改汇总

### 新增文件
- `src/utils/sparkAuth.js` - 讯飞星火签名生成工具

### 修改文件
- `src/utils/constants.js` - 添加动态存储键生成函数
- `src/context/AppContext.jsx` - 使用模型级别的凭证存储
- `src/pages/SettingsAiService.jsx` - 切换模型时加载对应凭证
- `src/services/iflytekAi.js` - 更新认证方式和请求格式
- `src/utils/httpClient.js` - 增强错误处理

### 预期效果
修复后：
- 切换讯飞星火模型时，输入框显示对应模型的凭证
- 讯飞星火连接测试能显示具体结果（成功或具体错误原因）