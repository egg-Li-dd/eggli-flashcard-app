/**
 * 讯飞星火 API 连接验证脚本（ESM）
 * 用法: node scripts\verify-spark-api.mjs <APIPassword> [model]
 *   例如: node scripts\verify-spark-api.mjs xxxxxxxxxxxxxxxx lite
 */

import https from 'https';
import url from 'url';

const API_URL = 'https://spark-api-open.xf-yun.com/v1/chat/completions';
const args = process.argv.slice(2);
const apiPassword = args[0];
const model = args[1] || 'lite';

if (!apiPassword || apiPassword === '<APIPassword>') {
  console.error('❌ 用法: node scripts\\verify-spark-api.mjs <你的APIPassword> [模型名]');
  console.error('   模型名可选: lite, generalv3, generalv3.5, 4.0Ultra, max-32k, pro-128k');
  process.exit(1);
}

const requestBody = JSON.stringify({
  model: model,
  messages: [{ role: 'user', content: 'Hi' }],
  max_tokens: 10,
});

const parsedUrl = url.parse(API_URL);
const options = {
  hostname: parsedUrl.hostname,
  port: 443,
  path: parsedUrl.path,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiPassword,
    'Content-Length': Buffer.byteLength(requestBody),
  },
};

console.log('────────────────────────────────────────');
console.log('🔗 请求地址:', API_URL);
console.log('🔐 认证头: Bearer ' + apiPassword.slice(0, 8) + '... (长度:' + apiPassword.length + ')');
console.log('📋 请求体:', requestBody);
console.log('────────────────────────────────────────');
console.log('⏳ 正在发送请求...');
console.log('');

const req = https.request(options, (res) => {
  console.log('✅ HTTP 状态码:', res.statusCode);
  console.log('📦 响应头:', JSON.stringify(res.headers));
  console.log('────────────────────────────────────────');

  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('📄 响应体:');
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(body);
    }
    console.log('────────────────────────────────────────');

    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.code === 0) {
          console.log('🎉 认证成功，API 可用！');
        } else {
          console.log('⚠️  API 返回错误码:', parsed.code, '消息:', parsed.message || parsed.msg || '未知');
        }
      } catch (e) {
        console.log('⚠️  响应体不是 JSON（可能是 Nginx/Cloudflare 拦截页或证书问题）');
      }
    } else if (res.statusCode === 401) {
      console.log('❌ 401: APIPassword 无效，请在控制台确认密码是否正确');
    } else if (res.statusCode === 403) {
      console.log('❌ 403: 当前模型未开通权限，请在控制台开通对应模型');
    } else if (res.statusCode === 400) {
      console.log('❌ 400: 请求参数错误，请检查模型名是否正确');
    } else {
      console.log('❌ HTTP 错误:', res.statusCode);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ 网络连接失败:', err.message);
  console.error('   可能原因: 网络中断 / DNS 解析失败 / 防火墙拦截 / SSL 证书问题');
  process.exit(1);
});

req.write(requestBody);
req.end();
