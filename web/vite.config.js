import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发模式下把 /api 代理到后端；生产构建产物由后端 Express 直接托管。
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
