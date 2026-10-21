import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';
import path from 'path';

// Vite 构建配置：部署基路径 / 开发代理 / 路径别名 / 生产压缩
//
// 环境变量（优先级：命令行 > .env.[mode] > .env）：
//   VITE_BASE_PATH         部署基路径，默认 '/'；子目录部署填 '/mes/'
//   VITE_DEV_PROXY_TARGET  开发期 /api 代理目标，默认 http://127.0.0.1:3000
//   VITE_API_BASE_URL      构建期默认 API 地址（部署后可用 public/config.js 覆盖）
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/';
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3000';

  return {
    base: basePath,
    // 版本号注入（npm run build 时由 npm 注入 npm_package_version）
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
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
        // 后端不在本机时，在 .env 里设置 VITE_DEV_PROXY_TARGET=http://<后端IP>:3000
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      host: true,
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
  };
});
