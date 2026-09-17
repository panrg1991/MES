/**
 * MES 系统 - 用户管理 API 接口
 * 对接后端 /api/users/* 路由
 */

import { get, post, put, patch, del } from './request';
import type { UserInfo, Role } from '@/types';
import type { PaginatedData } from '@/types/api';

/** 用户列表项（含角色信息） */
export interface UserListItem extends UserInfo {
  roles: Role[];
}

/** 创建用户请求体 */
export interface CreateUserRequest {
  username: string;
  name: string;
  department: string;
  password: string;
  roleIds: number[];
}

/** 更新用户请求体 */
export interface UpdateUserRequest {
  name?: string;
  department?: string;
  roleIds?: number[];
}

/** 用户分页查询参数 */
export interface UserQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
}

/**
 * 获取用户列表（分页）
 */
export function getUsers(params: UserQueryParams): Promise<PaginatedData<UserListItem>> {
  return get<PaginatedData<UserListItem>>('/users', params as unknown as Record<string, unknown>);
}

/**
 * 获取用户详情
 */
export function getUserById(id: number): Promise<UserListItem> {
  return get<UserListItem>(`/users/${id}`);
}

/**
 * 创建用户
 */
export function createUser(data: CreateUserRequest): Promise<UserListItem> {
  return post<UserListItem>('/users', data as unknown as Record<string, unknown>);
}

/**
 * 更新用户
 */
export function updateUser(id: number, data: UpdateUserRequest): Promise<UserListItem> {
  return put<UserListItem>(`/users/${id}`, data as unknown as Record<string, unknown>);
}

/**
 * 切换用户状态
 */
export function toggleUserStatus(id: number, status: boolean): Promise<UserListItem> {
  return patch<UserListItem>(`/users/${id}/status`, { status });
}

/**
 * 重置密码
 */
export function resetPassword(id: number, newPassword: string): Promise<void> {
  return patch<void>(`/users/${id}/password`, { newPassword });
}

/**
 * 删除用户
 */
export function deleteUser(id: number): Promise<void> {
  return del<void>(`/users/${id}`);
}
