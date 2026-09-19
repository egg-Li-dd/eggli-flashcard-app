/**
 * 讯飞星火 API 认证工具
 * 按官方文档（https://spark-api-open.xf-yun.com/v1/chat/completions），
 * 只需在请求头设置：
 *   Content-Type: application/json
 *   Authorization: Bearer <APIPassword>
 *
 * APIPassword 为控制台对应模型页面中的接口认证信息字符串。
 */

/**
 * 将输入规范化为可用的 APIPassword（去除首尾空白）。
 * APIPassword 是控制台"接口认证信息"中的完整字符串，可能包含特殊字符。
 */
export function normalizeSparkApiPassword(apiPassword) {
  return String(apiPassword || '').trim()
}

/**
 * 生成 Authorization 头值：Bearer <APIPassword>
 */
export function buildSparkAuthorization(apiPassword) {
  const password = normalizeSparkApiPassword(apiPassword)
  if (!password) return ''
  return 'Bearer ' + password
}

// === 以下为向后兼容的别名，供存量代码过渡使用 ===
export function generateSparkBearerToken(apiPassword, _apiSecret) {
  return normalizeSparkApiPassword(apiPassword)
}

export function parseSparkToken(apiPassword, _apiSecret) {
  return { apiPassword: normalizeSparkApiPassword(apiPassword) }
}

export function validateSparkCredentials(apiPassword) {
  const password = normalizeSparkApiPassword(apiPassword)
  if (!password) {
    return { valid: false, message: '请填写讯飞星火 APIPassword' }
  }
  return { valid: true, message: '凭证格式正确' }
}

/**
 * 主入口：按当前规范直接返回 Bearer 认证信息。
 */
export function generateSparkAuth(apiPassword) {
  const password = normalizeSparkApiPassword(apiPassword)
  return {
    authorization: password ? 'Bearer ' + password : '',
    useBearer: true,
    apiPassword: password,
  }
}
