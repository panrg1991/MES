/**
 * MES 系统 - 设备维保 API 接口【T07 新增】
 * 对接后端 /api/equipment/maintenance/* 路由
 */

import { get, post, put, del } from './request';
import type {
  MaintenancePlan,
  MaintenanceRecord,
  MaintenanceCycleType,
  MaintenancePlanStatus,
  MaintenanceType,
} from '@/types';
import type { PaginatedData } from '@/types/api';

/** 维保计划列表项（含设备摘要与到期派生字段） */
export interface MaintenancePlanListItem
  extends Omit<MaintenancePlan, 'equipment'> {
  equipment?: { id: number; code: string; name: string };
}

/** 维保计划分页查询参数 */
export interface MaintenancePlanQueryParams {
  page: number;
  pageSize: number;
  equipmentId?: number;
  status?: MaintenancePlanStatus;
  cycleType?: MaintenanceCycleType;
}

/** 创建维保计划请求体 */
export interface CreateMaintenancePlanRequest {
  equipmentId: number;
  planName: string;
  cycleType: MaintenanceCycleType;
  cycleDays?: number;
  nextDate: string;
  status?: MaintenancePlanStatus;
}

/** 更新维保计划请求体 */
export interface UpdateMaintenancePlanRequest {
  planName?: string;
  cycleType?: MaintenanceCycleType;
  cycleDays?: number;
  nextDate?: string;
  status?: MaintenancePlanStatus;
}

/** 到期提醒列表响应（含 overdueDays 派生字段） */
export interface MaintenanceDueList {
  list: MaintenancePlanListItem[];
}

/** 维保记录列表项（含计划 / 设备 / 维保人摘要） */
export interface MaintenanceRecordListItem
  extends Omit<MaintenanceRecord, 'plan' | 'equipment' | 'maintainer'> {
  plan?: { id: number; planName: string; cycleType: MaintenanceCycleType } | null;
  equipment?: { id: number; code: string; name: string };
  maintainer?: { id: number; name: string; department: string };
}

/** 维保记录分页查询参数 */
export interface MaintenanceRecordQueryParams {
  page: number;
  pageSize: number;
  equipmentId?: number;
  maintenanceType?: MaintenanceType;
  planId?: number;
}

/** 登记维保记录请求体（planId 为空即临时保养） */
export interface CreateMaintenanceRecordRequest {
  planId?: number | null;
  equipmentId: number;
  maintenanceType: MaintenanceType;
  maintainerId?: number | null;
  startTime: string;
  endTime?: string | null;
  content?: string;
}

/** 更新维保记录请求体 */
export interface UpdateMaintenanceRecordRequest {
  maintenanceType?: MaintenanceType;
  maintainerId?: number | null;
  startTime?: string;
  endTime?: string | null;
  content?: string;
}

/** 登记维保记录响应（plan 非空表示已顺延计划） */
export interface CreateMaintenanceRecordResult {
  record: MaintenanceRecordListItem;
  plan: MaintenancePlanListItem | null;
}

/**
 * 获取维保计划列表（分页，含 isDue / dueSoon）
 */
export function getMaintenancePlans(
  params: MaintenancePlanQueryParams,
): Promise<PaginatedData<MaintenancePlanListItem>> {
  return get<PaginatedData<MaintenancePlanListItem>>(
    '/equipment/maintenance/plans',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取到期提醒列表（仅 active 计划，nextDate <= now + days，含 overdueDays）
 */
export function getDueMaintenancePlans(days = 7): Promise<MaintenanceDueList> {
  return get<MaintenanceDueList>('/equipment/maintenance/due', { days });
}

/**
 * 创建维保计划
 */
export function createMaintenancePlan(
  data: CreateMaintenancePlanRequest,
): Promise<MaintenancePlanListItem> {
  return post<MaintenancePlanListItem>(
    '/equipment/maintenance/plans',
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 更新维保计划
 */
export function updateMaintenancePlan(
  id: number,
  data: UpdateMaintenancePlanRequest,
): Promise<MaintenancePlanListItem> {
  return put<MaintenancePlanListItem>(
    `/equipment/maintenance/plans/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 删除维保计划（历史维保记录保留，planId 置空）
 */
export function deleteMaintenancePlan(id: number): Promise<void> {
  return del<void>(`/equipment/maintenance/plans/${id}`);
}

/**
 * 获取维保记录列表（分页）
 */
export function getMaintenanceRecords(
  params: MaintenanceRecordQueryParams,
): Promise<PaginatedData<MaintenanceRecordListItem>> {
  return get<PaginatedData<MaintenanceRecordListItem>>(
    '/equipment/maintenance/records',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 登记维保记录（事务内顺延计划 nextDate；planId 为空即临时保养）
 */
export function createMaintenanceRecord(
  data: CreateMaintenanceRecordRequest,
): Promise<CreateMaintenanceRecordResult> {
  return post<CreateMaintenanceRecordResult>(
    '/equipment/maintenance/records',
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 更新维保记录
 */
export function updateMaintenanceRecord(
  id: number,
  data: UpdateMaintenanceRecordRequest,
): Promise<MaintenanceRecordListItem> {
  return put<MaintenanceRecordListItem>(
    `/equipment/maintenance/records/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 删除维保记录
 */
export function deleteMaintenanceRecord(id: number): Promise<void> {
  return del<void>(`/equipment/maintenance/records/${id}`);
}
