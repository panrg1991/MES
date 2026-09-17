import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';
import path from 'path';

// Vite 构建配置：开发代理 / 路径别名 / 生产压缩
export default defineConfig({
  plugins: [
    react(),
    compression({
      threshold: 10240, // 仅压缩大于 10KB 的文件
      algorithm: 'gzip',
      ext: '.gz',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      // 开发环境代理后端 API，避免跨域
      // 注意：显式使用 127.0.0.1 而非 localhost，避免被 IPv6(::1) 上的其他服务占用
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // 第三方依赖分包，优化首屏加载
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          charts: ['echarts', 'echarts-for-react'],
        },
      },
    },
  },
});
