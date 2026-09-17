/**
 * MES 系统 - 认证 API 接口
 * 对接后端 /api/auth/* 路由
 */

import { get, post } from './request';
import type { LoginRequest, LoginResponse } from '@/types/api';
import type { UserInfo } from '@/types';

/** 当前用户信息响应 */
export interface ProfileResponse {
  user: UserInfo;
  roles: string[];
  permissions: string[];
}

/**
 * 用户登录
 * @param data 登录请求体
 * @returns 登录响应（token + 用户信息 + 权限）
 */
export function login(data: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', data as unknown as Record<string, unknown>);
}

/**
 * 刷新令牌
 * @param refreshToken 刷新令牌
 * @returns 新的 Access Token
 */
export function refreshToken(refreshToken: string): Promise<{ token: string }> {
  return post<{ token: string }>('/auth/refresh', { refreshToken });
}

/**
 * 用户登出
 */
export function logout(): Promise<void> {
  return post<void>('/auth/logout');
}

/**
 * 获取当前用户信息
 * @returns 用户信息 + 角色名称列表 + 权限编码列表
 */
export function getProfile(): Promise<ProfileResponse> {
  return get<ProfileResponse>('/auth/profile');
}

/**
 * 修改密码
 * @param oldPassword 旧密码
 * @param newPassword 新密码
 * @param confirmPassword 确认密码
 */
export function changePassword(
  oldPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  return post<void>('/auth/change-password', {
    oldPassword,
    newPassword,
    confirmPassword,
  });
}
