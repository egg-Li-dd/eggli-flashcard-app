/**
 * 统一 HTTP 客户端
 * 设计目标：
 *   1) Capacitor Android/iOS 原生平台 → 使用 @capacitor/http（静态 import，保证打包可用）
 *   2) Web 浏览器（PWA 模式）→ 使用 fetch
 * 原生平台 + fetch 的组合在 Android WebView 中会遇到 CORS/SSL 问题，
 * 所以必须优先走原生插件，只有真正的浏览器环境才用 fetch。
 *
 * 关键改进（针对生产环境 APK 连接失败问题）：
 *   - 原生请求时对 data 进行显式 JSON 序列化
 *   - 增强错误类型识别（SSL、证书、CLEARTEXT 等）
 *   - 添加多级降级策略
 *   - 优化 @capacitor/http 参数传递
 */

import { Capacitor } from '@capacitor/core';
// 静态 import：确保 @capacitor/http 被打包到产物中，避免 Android 上动态加载失败
import { Http } from '@capacitor/http';

export function isNativePlatform() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    console.warn('[http] 检测平台失败:', e?.message);
    return false;
  }
}

// 标记 @capacitor/http 是否可正常使用（启动时一次性评估）
let _httpPluginAvailable = null;
let _httpPluginChecked = false;

function getHttpPlugin() {
  if (!_httpPluginChecked) {
    _httpPluginChecked = true;
    try {
      if (!Http || typeof Http.request !== 'function') {
        console.warn('[http] @capacitor/http 未导出 request 方法');
        _httpPluginAvailable = false;
      } else {
        _httpPluginAvailable = true
      }
    } catch (e) {
      console.warn('[http] @capacitor/http 插件不可用:', e?.message);
      _httpPluginAvailable = false;
    }
  }
  return _httpPluginAvailable ? Http : null;
}

/**
 * 标准化请求头：确保 Content-Type 存在且格式正确
 */
function normalizeHeaders(headers) {
  const normalized = {};
  // 先复制所有 headers
  if (headers && typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      normalized[key] = headers[key];
    }
  }
  // 确保 Content-Type 存在
  let hasContentType = false;
  for (const key of Object.keys(normalized)) {
    if (key.toLowerCase() === 'content-type') {
      hasContentType = true;
      break;
    }
  }
  if (!hasContentType) {
    normalized['Content-Type'] = 'application/json';
  }
  return normalized;
}

/**
 * 判断错误类型并返回友好描述
 */
function classifyNativeError(err) {
  const rawMsg = String(err?.message || err?.error || '').toLowerCase();
  const rawJson = JSON.stringify(err || '').toLowerCase();
  const combined = rawMsg + '|' + rawJson;

  if (combined.includes('cleartext') || combined.includes('明文')) {
    return { type: 'CLEARTEXT', detail: '明文 HTTP 请求被系统策略阻止，请检查 network_security_config' };
  }
  if (combined.includes('ssl') || combined.includes('tls') || combined.includes('证书') || combined.includes('handshake')) {
    return { type: 'SSL', detail: 'SSL/TLS 握手失败或证书问题，请检查系统时间或网络' };
  }
  if (combined.includes('dns') || combined.includes('resolve host') || combined.includes('unable to resolve')) {
    return { type: 'DNS', detail: 'DNS 解析失败，请检查网络连接' };
  }
  if (combined.includes('connection refused') || combined.includes('connect')) {
    return { type: 'CONNECTION', detail: '无法连接到服务器，请检查网络或服务器状态' };
  }
  if (combined.includes('timeout') || combined.includes('超时')) {
    return { type: 'TIMEOUT', detail: '请求超时，请稍后重试' };
  }
  if (combined.includes('unknownhost')) {
    return { type: 'DNS', detail: '未知主机名，DNS 解析失败' };
  }
  return { type: 'UNKNOWN', detail: err?.message || '网络请求失败' };
}

export async function httpPost(url, options = {}) {
  const { headers = {}, data = null, timeout = 15000 } = options;

  if (isNativePlatform()) {
    const plugin = getHttpPlugin();
    if (plugin) {
      try {
        // 策略 1：使用原生插件请求，确保 data 为正确格式
        return await nativePost(plugin, url, headers, data, timeout);
      } catch (err) {
        const classification = classifyNativeError(err);
        console.warn('[http] 原生插件请求失败 (' + classification.type + '):', classification.detail);

        // 策略 2：尝试调整参数后重试（仅针对 SSL/未知错误）
        if (classification.type === 'SSL' || classification.type === 'UNKNOWN') {
          try {
            return await nativePost(plugin, url, headers, data, timeout, {
              forceStringify: true,
              forceTextResponse: true,
            });
          } catch (retryErr) {
            console.warn('[http] 重试也失败:', retryErr?.message);
          }
        }

        // 策略 3：降级到 fetch（注意：Android WebView 可能遇到 CORS）
        console.warn('[http] 降级到 fetch 请求方式...');
      }
    } else {
      console.warn('[http] 原生插件不可用，降级到 fetch（Android 可能遇到 CORS 问题）');
    }
  }
  return fetchPost(url, headers, data, timeout);
}

/**
 * 原生插件 POST 请求
 * @param plugin - @capacitor/http 插件实例
 * @param url - 请求 URL
 * @param headers - 请求头
 * @param data - 请求体（可以是对象或字符串）
 * @param timeout - 超时
 * @param options - 高级选项（forceStringify, forceTextResponse 等）
 */
async function nativePost(plugin, url, headers, data, timeout, options = {}) {
  try {
    let requestData = data;
    if (options.forceStringify) {
      requestData = JSON.stringify(data);
    }

    const normalizedHeaders = normalizeHeaders(headers);

    const requestParams = {
      method: 'POST',
      url: url,
      headers: normalizedHeaders,
      data: requestData,
      responseType: options.forceTextResponse ? 'text' : 'json',
      connectTimeout: timeout,
      readTimeout: timeout,
    };

    const response = await plugin.request(requestParams);

    let parsedData = response?.data;
    if (typeof parsedData === 'string' && parsedData.trim().length > 0) {
      // 兼容 Capacitor Http：响应体可能放在 data 或 response 属性中
      try {
        parsedData = JSON.parse(parsedData);
      } catch (parseErr) {
        console.warn('[http] 响应体非 JSON，保留原文（前100字符）:', String(parsedData).slice(0, 100));
        // 某些版本可能放在 .response 属性
        try {
          const alt = response?.response;
          if (alt && typeof alt === 'string') {
            parsedData = JSON.parse(alt);
          } else if (alt && typeof alt === 'object') {
            parsedData = alt;
          }
        } catch (_) { /* 保留原文 */ }
      }
    } else if (!parsedData && response?.response) {
      // 另一个常见属性位置
      parsedData = response.response;
      if (typeof parsedData === 'string' && parsedData.trim()) {
        try { parsedData = JSON.parse(parsedData); } catch (_) { /* 保留原文 */ }
      }
    }

    return {
      status: response?.status ?? 200,
      ok: typeof response?.status === 'number' && response.status >= 200 && response.status < 300,
      data: parsedData,
      headers: response?.headers || {},
      json: async () => parsedData,
      text: async () => typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData),
    };
  } catch (err) {
    // 关键：Capacitor Http 插件对非 2xx 响应有时会抛异常，
    // 这里尝试从 err 中提取 status / data，如果能识别为 HTTP 错误，
    // 转为结构化返回 {ok:false, status, data}，而不是直接当成网络失败。
    const maybeStatus = err?.status || err?.statusCode || (err?.data?.status);
    const hasHttpStatus = typeof maybeStatus === 'number' && maybeStatus > 0;
    const rawResponseData = err?.data || err?.body || err?.response || null;

    if (hasHttpStatus) {
      const status = Number(maybeStatus);
      let parsedData = rawResponseData;
      if (typeof rawResponseData === 'string' && rawResponseData.trim().length > 0) {
        try { parsedData = JSON.parse(rawResponseData); } catch (parseErr) { /* 保留原文 */ }
      }
      console.warn('[http] Capacitor 捕获 HTTP 错误:', status, 'data:', typeof parsedData === 'string' ? parsedData.slice(0, 150) : JSON.stringify(parsedData).slice(0, 150));
      return {
        status: status,
        ok: false,
        data: parsedData,
        headers: err?.headers || {},
        json: async () => parsedData,
        text: async () => typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData),
      };
    }

    // 真正的网络层错误
    const classification = classifyNativeError(err);
    const message = err?.message || err?.error || '网络请求失败';
    const code = err?.code || classification.type || 'UNKNOWN_ERROR';
    console.error('[http] nativePost 网络层错误, type:', classification.type, 'code:', code, 'message:', message, 'detail:', classification.detail, 'err:', JSON.stringify(err).slice(0, 300));
    throw new Error('网络请求失败: ' + message + ' (' + code + ') - ' + classification.detail);
  }
}

/**
 * 检查是否为 FormData（简单判断，避免在 WebView 中出错）
 */
function isFormData(data) {
  if (!data) return false;
  try {
    return typeof FormData !== 'undefined' && data instanceof FormData;
  } catch (_) {
    return false;
  }
}

async function fetchPost(url, headers, data, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: normalizeHeaders(headers),
      body: typeof data === 'string' ? data : JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const textData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (parseErr) {
      jsonData = textData;
    }

    return {
      status: response.status,
      ok: response.ok,
      data: jsonData,
      headers: Object.fromEntries(response.headers.entries()),
      json: async () => jsonData,
      text: async () => textData,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      console.error('[http] fetch 请求超时');
      throw new Error('请求超时');
    }

    let errorType = '网络请求失败';
    let errorDetail = err?.message || '未知错误';

    if (err?.message?.includes('Failed to fetch')) {
      errorType = '网络连接失败';
      errorDetail = '无法连接到服务器，请检查网络连接';
    } else if (err?.message?.includes('DNS')) {
      errorType = 'DNS 解析失败';
      errorDetail = '无法解析服务器地址';
    } else if (err?.message?.includes('SSL')) {
      errorType = 'SSL 错误';
      errorDetail = '安全连接失败';
    }

    console.error('[http] fetchPost 错误:', errorType, errorDetail);
    throw new Error(errorType + ': ' + errorDetail);
  }
}

export async function httpPostJson(url, headers, data, timeout) {
  return httpPost(url, { headers, data, timeout });
}

export async function httpFileUpload(url, { headers = {}, formData, timeout = 30000 }) {
  if (isNativePlatform()) {
    const plugin = getHttpPlugin();
    if (plugin) return nativeFileUpload(plugin, url, headers, formData, timeout);
  }
  return fetchFileUpload(url, headers, formData, timeout);
}

async function nativeFileUpload(Http, url, headers, formData, timeout) {
  try {
    const response = await Http.request({
      method: 'POST',
      url: url,
      headers: headers,
      data: formData,
      responseType: 'text',
      connectTimeout: timeout,
      readTimeout: timeout,
    });

    return {
      status: response?.status ?? 200,
      ok: typeof response?.status === 'number' && response.status >= 200 && response.status < 300,
      data: response?.data,
      headers: response?.headers || {},
      json: async () => response?.data,
      text: async () => typeof response?.data === 'string' ? response.data : JSON.stringify(response?.data),
    };
  } catch (err) {
    const maybeStatus = err?.status || err?.statusCode;
    if (typeof maybeStatus === 'number' && maybeStatus > 0) {
      const parsed = err?.data || err?.body;
      return {
        status: Number(maybeStatus),
        ok: false,
        data: parsed,
        headers: err?.headers || {},
        json: async () => parsed,
        text: async () => typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
      };
    }
    const message = err?.message || err?.error || '文件上传失败';
    console.error('[http] nativeFileUpload 错误:', message);
    throw new Error('文件上传失败: ' + message);
  }
}

async function fetchFileUpload(url, headers, formData, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const textData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (parseErr) {
      jsonData = textData;
    }

    return {
      status: response.status,
      ok: response.ok,
      data: jsonData,
      headers: Object.fromEntries(response.headers.entries()),
      json: async () => jsonData,
      text: async () => textData,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      throw new Error('请求超时');
    }
    console.error('[http] fetchFileUpload 错误:', err?.message);
    throw new Error('文件上传失败: ' + (err?.message || '未知错误'));
  }
}
