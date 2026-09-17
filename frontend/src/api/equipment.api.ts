/**
 * MES 系统 - 设备管理 API 接口
 * 对接后端 /api/equipment/* 路由
 */

import { get, post, put, patch, del } from './request';
import type { Equipment, EquipmentStatus, EquipmentStatusLog } from '@/types';
import type { PaginatedData } from '@/types/api';

/** 设备列表项（含车间信息） */
export interface EquipmentListItem extends Omit<Equipment, 'workshop'> {
  workshop?: { id: number; name: string; code: string };
}

/** 设备详情（含状态变更日志） */
export interface EquipmentDetail extends EquipmentListItem {
  statusLogs: Array<
    EquipmentStatusLog & {
      changedBy?: { id: number; name: string; department: string };
    }
  >;
}

/** 设备状态统计 */
export interface EquipmentStatusSummary {
  running: number;
  idle: number;
  stopped: number;
  fault: number;
  total: number;
}

/** 创建设备请求体 */
export interface CreateEquipmentRequest {
  code: string;
  name: string;
  type: string;
  location: string;
  workshopId?: number;
  manufacturer?: string;
  model?: string;
  purchaseDate?: string;
  remark?: string;
}

/** 更新设备请求体 */
export interface UpdateEquipmentRequest {
  name?: string;
  type?: string;
  location?: string;
  workshopId?: number;
  manufacturer?: string;
  model?: string;
  purchaseDate?: string;
  remark?: string;
}

/** 设备分页查询参数 */
export interface EquipmentQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: EquipmentStatus;
  type?: string;
}

/** 状态切换请求体 */
export interface ChangeStatusRequest {
  newStatus: EquipmentStatus;
  remark?: string;
}

/**
 * 获取设备列表（分页）
 */
export function getEquipments(
  params: EquipmentQueryParams,
): Promise<PaginatedData<EquipmentListItem>> {
  return get<PaginatedData<EquipmentListItem>>(
    '/equipment',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取设备状态统计
 */
export function getEquipmentStatusSummary(): Promise<EquipmentStatusSummary> {
  return get<EquipmentStatusSummary>('/equipment/status-summary');
}

/**
 * 获取设备详情
 */
export function getEquipmentById(id: number): Promise<EquipmentDetail> {
  return get<EquipmentDetail>(`/equipment/${id}`);
}

/**
 * 创建设备
 */
export function createEquipment(
  data: CreateEquipmentRequest,
): Promise<Equipment> {
  return post<Equipment>('/equipment', data as unknown as Record<string, unknown>);
}

/**
 * 更新设备
 */
export function updateEquipment(
  id: number,
  data: UpdateEquipmentRequest,
): Promise<Equipment> {
  return put<Equipment>(
    `/equipment/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 删除设备
 */
export function deleteEquipment(id: number): Promise<void> {
  return del<void>(`/equipment/${id}`);
}

/**
 * 切换设备状态
 */
export function changeEquipmentStatus(
  id: number,
  data: ChangeStatusRequest,
): Promise<Equipment> {
  return patch<Equipment>(
    `/equipment/${id}/status`,
    data as unknown as Record<string, unknown>,
  );
}
