/**
 * 组件测试：src/router/ProtectedRoute.tsx
 * ---------------------------------------------------------------------------
 * 目的：锁定「前端路由级权限守卫」的行为（P0 越权修复的前端部分）。
 *  ① 未登录 → 跳转登录页
 *  ② 有菜单权限码 → 允许进入
 *  ③ 只有配套的 `xxx:view` 按钮权限 → 也允许进入（与菜单口径一致）
 *  ④ 无权限 → 展示 403，而不是渲染空页面
 *  ⑤ 支持多权限码（任一命中即可）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '@/stores/authStore';

/** 渲染受保护路由（/login 用于观察未登录跳转） */
function renderProtected(permission?: string | string[]) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>登录页</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute permission={permission}>
              <div>受保护内容</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** 重置认证状态 */
function setAuthState(token: string | null, permissions: string[]) {
  useAuthStore.setState({ token, refreshToken: null, permissions });
}

describe('ProtectedRoute - 路由级权限守卫', () => {
  beforeEach(() => {
    setAuthState(null, []);
  });

  it('未登录时跳转登录页', () => {
    renderProtected('production:order');
    expect(screen.getByText('登录页')).toBeInTheDocument();
  });

  it('拥有菜单权限码时可进入页面', () => {
    setAuthState('token', ['production:order']);
    renderProtected('production:order');

    expect(screen.getByText('受保护内容')).toBeInTheDocument();
  });

  it('仅拥有 xxx:view 权限时也可进入（与菜单判定口径一致）', () => {
    setAuthState('token', ['production:order:view']);
    renderProtected('production:order');

    expect(screen.getByText('受保护内容')).toBeInTheDocument();
  });

  it('无权限时展示 403，而不是渲染空页面', () => {
    setAuthState('token', ['material:items']);
    renderProtected('production:order');

    expect(screen.queryByText('受保护内容')).not.toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
  });

  it('支持多个权限码：任一命中即可进入', () => {
    setAuthState('token', ['reports:oee:view']);
    renderProtected(['reports:oee', 'reports:production']);

    expect(screen.getByText('受保护内容')).toBeInTheDocument();
  });

  it('未传权限码时只校验登录状态', () => {
    setAuthState('token', []);
    renderProtected();

    expect(screen.getByText('受保护内容')).toBeInTheDocument();
  });
});
