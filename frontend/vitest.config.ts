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
      include: ['src/utils/**', 'src/stores/**', 'src/config/**', 'src/api/**'],
      exclude: ['**/*.test.{ts,tsx}', 'src/test/**'],
      reporter: ['text-summary', 'html'],
      // 覆盖率门禁（npm run test:coverage 时生效）
      // 说明：utils/stores/config 已有充足单测，设高门槛；api 包装层与页面由联调/验收覆盖，
      //      仅保留全局低门槛防止「测试被删后无人发现」，后续补 hooks/组件测试再上调。
      thresholds: {
        global: {
          statements: 18,
          branches: 60,
          functions: 50,
          lines: 18,
        },
        'src/utils/**': {
          statements: 95,
          branches: 85,
          functions: 90,
          lines: 95,
        },
        'src/stores/**': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        'src/config/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
