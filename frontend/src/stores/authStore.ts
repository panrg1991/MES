/**
 * MES 系统 - 认证状态管理（Zustand）
 * 管理：token / refreshToken / user / permissions
 * Actions: setAuth / clearAuth / hasPermission
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserInfo } from '@/types';
import { STORAGE_KEYS } from '@/utils/constants';

/** 认证状态接口 */
interface AuthState {
  /** Access Token */
  token: string | null;
  /** Refresh Token */
  refreshToken: string | null;
  /** 当前登录用户信息 */
  user: UserInfo | null;
  /** 权限编码列表 */
  permissions: string[];

  /** 设置认证信息（登录成功后调用） */
  setAuth: (token: string, refreshToken: string, user: UserInfo, permissions: string[]) => void;
  /** 更新 Token（刷新 Token 时调用） */
  updateToken: (token: string) => void;
  /** 更新用户信息 */
  updateUser: (user: UserInfo) => void;
  /** 清除认证信息（登出时调用） */
  clearAuth: () => void;
  /** 检查是否拥有指定权限 */
  hasPermission: (code: string) => boolean;
  /** 检查是否已登录 */
  isAuthenticated: () => boolean;
}

/** 认证状态 Store */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      permissions: [],

      setAuth: (token, refreshToken, user, permissions) => {
        // 同步写入 localStorage（供 axios 拦截器读取）
        localStorage.setItem(STORAGE_KEYS.TOKEN, token);
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(permissions));

        set({ token, refreshToken, user, permissions });
      },

      updateToken: (token) => {
        localStorage.setItem(STORAGE_KEYS.TOKEN, token);
        set({ token });
      },

      updateUser: (user) => {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        set({ user });
      },

      clearAuth: () => {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.PERMISSIONS);

        set({ token: null, refreshToken: null, user: null, permissions: [] });
      },

      hasPermission: (code) => {
        const { permissions } = get();
        return permissions.includes(code);
      },

      isAuthenticated: () => {
        return get().token !== null;
      },
    }),
    {
      name: STORAGE_KEYS.AUTH_STORE,
      storage: createJSONStorage(() => localStorage),
      // 仅持久化 token 和 user，不持久化 actions
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        permissions: state.permissions,
      }),
    },
  ),
);

export default useAuthStore;
