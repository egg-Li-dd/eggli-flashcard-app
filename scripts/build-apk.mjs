/**
 * 自动化打包 APK 脚本
 * 用途：临时移除 capacitor.config.json 的 server.url，
 *       构建 web、同步到 Android，最后恢复 server.url
 * 用法：node scripts/build-apk.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const configPath = resolve(rootDir, 'capacitor.config.json');

// 1. 读取并备份原始配置
console.log('[build-apk] 读取 capacitor.config.json...');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const originalServer = config.server ? { ...config.server } : null;

if (!originalServer) {
  console.log('[build-apk] 未检测到 server.url 配置，直接构建。');
}

// 2. 移除 server 配置
if (config.server) {
  console.log('[build-apk] 临时移除 server.url 配置...');
  delete config.server;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

try {
  // 3. 构建 web
  console.log('[build-apk] 执行 npm run build...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

  // 4. 同步到 Android
  console.log('[build-apk] 执行 npx cap sync android...');
  execSync('npx cap sync android', { cwd: rootDir, stdio: 'inherit' });

  console.log('\n✅ APK 构建准备完成！\n');
  console.log('接下来请在 Android Studio 中：');
  console.log('  Build → Build Bundle(s) / APK(s) → Build APK(s)\n');
} finally {
  // 5. 恢复 server 配置
  if (originalServer) {
    console.log('[build-apk] 恢复 server.url 配置...');
    config.server = originalServer;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }
}