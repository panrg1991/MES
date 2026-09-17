/**
 * MES 系统 - Vitest 测试配置（前端）
 * ---------------------------------------------------------------------------
 * 独立于 vite.config.ts，避免测试相关配置影响生产构建产物。
 * 关键点：
 *   · jsdom 环境：测试 store / 组件时可用 localStorage、document
 *   · 复用与构建一致的 '@' 别名，保证测试导入路径与源码一致
 *   · setup 文件统一注册 jest-dom 断言并清理 DOM 与 localStorage
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    // 不使用全局注入：测试文件显式 import { describe, it, expect } from 'vitest'
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // 覆盖率仅统计业务代码，排除类型声明与测试自身
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/utils/**', 'src/stores/**', 'src/api/**'],
      exclude: ['**/*.test.{ts,tsx}', 'src/test/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
