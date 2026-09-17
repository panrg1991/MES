/**
 * Vitest 全局测试前置（由 vitest.config.ts 的 setupFiles 引用）
 * ---------------------------------------------------------------------------
 * ① 注册 @testing-library/jest-dom 断言（toBeInTheDocument 等）
 * ② 每个用例结束后卸载组件、清理 localStorage，保证用例互相隔离
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 未实现 ObjectURL API，提供最小可用实现，避免文件下载相关用例报 TypeError
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock-url';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
