import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    host: '0.0.0.0',  // 允许局域网访问（手机热更新）
    port: 5173,
    strictPort: true,
    proxy: {
      // 讯飞星火 API 代理，解决浏览器 CORS 限制
      '/api/spark': {
        target: 'https://spark-api-open.xf-yun.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/spark/, ''),
        secure: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        floatingWindow: fileURLToPath(new URL('./floating-window.html', import.meta.url)),
      },
    },
  },
})
