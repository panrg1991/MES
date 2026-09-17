/**
 * 单元测试：src/stores/authStore.ts
 * ---------------------------------------------------------------------------
 * 认证态是全站路由守卫与按钮权限的依据，重点覆盖：
 *   · 登录写入 / 登出清空的对称性（store 与 localStorage 同步）
 *   · 权限判定与登录态判定
 *   · 部分更新（换 Token、更新用户信息）不影响其他字段
 */

import { describe, it, expect, beforeEach } from 'vitest';
import useAuthStore from './authStore';
import { STORAGE_KEYS } from '@/utils/constants';
import type { UserInfo } from '@/types';

/** 测试用户（字段与 types/index.ts 的 UserInfo 保持一致） */
const MOCK_USER: UserInfo = {
  id: 1,
  username: 'admin',
  name: '系统管理员',
  department: '生产部',
  status: true,
  createdAt: '2026-01-01 00:00:00',
  updatedAt: '2026-01-01 00:00:00',
};

const PERMISSIONS = ['system:users:view', 'production:order:view'];

/** 将 store 重置为未登录状态 */
function resetAuthState(): void {
  useAuthStore.setState({
    token: null,
    refreshToken: null,
    user: null,
    permissions: [],
  });
}

describe('authStore - 初始状态', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthState();
  });

  it('未登录时无 Token、无用户、无权限', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.permissions).toEqual([]);
  });

  it('isAuthenticated 依据 token 判定', () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it('hasPermission 在无权限时恒为 false', () => {
    expect(useAuthStore.getState().hasPermission('system:users:view')).toBe(false);
  });
});

describe('authStore - setAuth 登录写入', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthState();
  });

  it('同步写入 store 与 localStorage', () => {
    useAuthStore.getState().setAuth('token-abc', 'refresh-xyz', MOCK_USER, PERMISSIONS);

    const state = useAuthStore.getState();
    expect(state.token).toBe('token-abc');
    expect(state.refreshToken).toBe('refresh-xyz');
    expect(state.user).toEqual(MOCK_USER);
    expect(state.permissions).toEqual(PERMISSIONS);

    // axios 拦截器直接读 localStorage，必须同步落盘
    expect(localStorage.getItem(STORAGE_KEYS.TOKEN)).toBe('token-abc');
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('refresh-xyz');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) as string)).toEqual(MOCK_USER);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PERMISSIONS) as string)).toEqual(
      PERMISSIONS,
    );
  });

  it('写入后登录态与权限判定生效', () => {
    useAuthStore.getState().setAuth('token-abc', 'refresh-xyz', MOCK_USER, PERMISSIONS);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated()).toBe(true);
    expect(state.hasPermission('system:users:view')).toBe(true);
    expect(state.hasPermission('system:users:delete')).toBe(false);
  });
});

describe('authStore - 部分更新', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setAuth('old-token', 'refresh-xyz', MOCK_USER, PERMISSIONS);
  });

  it('updateToken 仅替换 Access Token', () => {
    useAuthStore.getState().updateToken('new-token');

    const state = useAuthStore.getState();
    expect(state.token).toBe('new-token');
    // 其他字段不受影响
    expect(state.refreshToken).toBe('refresh-xyz');
    expect(state.user).toEqual(MOCK_USER);
    expect(state.permissions).toEqual(PERMISSIONS);
    expect(localStorage.getItem(STORAGE_KEYS.TOKEN)).toBe('new-token');
  });

  it('updateUser 仅替换用户信息', () => {
    const nextUser: UserInfo = { ...MOCK_USER, name: '新姓名' };
    useAuthStore.getState().updateUser(nextUser);

    const state = useAuthStore.getState();
    expect(state.user?.name).toBe('新姓名');
    expect(state.token).toBe('old-token');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) as string).name).toBe('新姓名');
  });
});

describe('authStore - clearAuth 登出', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setAuth('token-abc', 'refresh-xyz', MOCK_USER, PERMISSIONS);
  });

  it('清空 store 中的全部认证信息', () => {
    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.permissions).toEqual([]);
  });

  it('同步清理 localStorage，避免残留 Token 被复用', () => {
    useAuthStore.getState().clearAuth();

    expect(localStorage.getItem(STORAGE_KEYS.TOKEN)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PERMISSIONS)).toBeNull();
  });

  it('登出后权限判定全部失效', () => {
    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated()).toBe(false);
    expect(state.hasPermission('system:users:view')).toBe(false);
  });
});
