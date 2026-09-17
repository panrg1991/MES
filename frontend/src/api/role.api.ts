/**
 * MES 系统 - 角色权限 API 接口
 * 对接后端 /api/roles/* 和 /api/permissions 路由
 */

import { get, post, put, del } from './request';
import type { Role, Permission } from '@/types';
import type { PaginatedData } from '@/types/api';

/** 角色列表项（含统计信息） */
export interface RoleListItem extends Role {
  userCount: number;
  permissionCount: number;
}

/** 角色详情（含权限列表） */
export interface RoleDetail extends Role {
  permissions: Permission[];
}

/** 创建角色请求体 */
export interface CreateRoleRequest {
  name: string;
  code: string;
  description?: string;
}

/** 更新角色请求体 */
export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  status?: boolean;
}

/** 角色分页查询参数 */
export interface RoleQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
}

/**
 * 获取角色列表（分页）
 */
export function getRoles(params: RoleQueryParams): Promise<PaginatedData<RoleListItem>> {
  return get<PaginatedData<RoleListItem>>('/roles', params as unknown as Record<string, unknown>);
}

/**
 * 获取角色详情（含权限列表）
 */
export function getRoleById(id: number): Promise<RoleDetail> {
  return get<RoleDetail>(`/roles/${id}`);
}

/**
 * 创建角色
 */
export function createRole(data: CreateRoleRequest): Promise<Role> {
  return post<Role>('/roles', data as unknown as Record<string, unknown>);
}

/**
 * 更新角色
 */
export function updateRole(id: number, data: UpdateRoleRequest): Promise<Role> {
  return put<Role>(`/roles/${id}`, data as unknown as Record<string, unknown>);
}

/**
 * 删除角色
 */
export function deleteRole(id: number): Promise<void> {
  return del<void>(`/roles/${id}`);
}

/**
 * 获取角色的权限 ID 列表
 */
export function getRolePermissions(id: number): Promise<{ permissionIds: number[] }> {
  return get<{ permissionIds: number[] }>(`/roles/${id}/permissions`);
}

/**
 * 分配权限给角色
 */
export function assignPermissions(id: number, permissionIds: number[]): Promise<void> {
  return put<void>(`/roles/${id}/permissions`, { permissionIds });
}

/**
 * 获取所有权限（树形结构）
 */
export function getAllPermissions(): Promise<Permission[]> {
  return get<Permission[]>('/permissions');
}
