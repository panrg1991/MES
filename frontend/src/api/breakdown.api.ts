/**
 * MES 系统 - 设备故障维修 API 接口【T07 新增】
 * 对接后端 /api/equipment/breakdowns/* 路由
 */

import { get, post, patch, put, del } from './request';
import type { BreakdownRecord, BreakdownStatistics } from '@/types';
import type { PaginatedData } from '@/types/api';

/** 故障记录列表项（含设备 / 维修人摘要） */
export interface BreakdownListItem
  extends Omit<BreakdownRecord, 'equipment' | 'repairer'> {
  equipment?: { id: number; code: string; name: string };
  repairer?: { id: number; name: string; department: string };
}

/** 故障列表查询参数（status=pending 待维修 / repaired 已修复） */
export interface BreakdownQueryParams {
  page: number;
  pageSize: number;
  equipmentId?: number;
  status?: 'pending' | 'repaired';
  startDate?: string;
  endDate?: string;
}

/** 故障报修请求体 */
export interface ReportBreakdownRequest {
  equipmentId: number;
  faultType: string;
  faultDescription?: string;
  occurredAt: string;
}

/** 维修完成请求体（downtimeDuration 由服务端计算，禁止传入） */
export interface CompleteRepairRequest {
  repairerId: number;
  repairMethod: string;
  repairedAt: string;
}

/** 更新故障记录请求体 */
export interface UpdateBreakdownRequest {
  faultType?: string;
  faultDescription?: string;
  occurredAt?: string;
  repairerId?: number;
  repairMethod?: string;
}

/** 故障统计查询参数 */
export interface BreakdownStatisticsQueryParams {
  startDate?: string;
  endDate?: string;
  equipmentId?: number;
}

/**
 * 获取故障记录列表（分页，repairedAt == null 即待维修）
 */
export function getBreakdowns(
  params: BreakdownQueryParams,
): Promise<PaginatedData<BreakdownListItem>> {
  return get<PaginatedData<BreakdownListItem>>(
    '/equipment/breakdowns',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取设备故障统计（故障频次 TopN / 累计停机时长 / 故障类型分布）
 */
export function getBreakdownStatistics(
  params: BreakdownStatisticsQueryParams = {},
): Promise<BreakdownStatistics> {
  return get<BreakdownStatistics>(
    '/equipment/breakdowns/statistics',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 故障报修（事务：写记录 + 设备置 fault + 状态日志）
 */
export function reportBreakdown(
  data: ReportBreakdownRequest,
): Promise<BreakdownListItem> {
  return post<BreakdownListItem>(
    '/equipment/breakdowns',
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 维修完成（服务端计算 downtimeDuration + 恢复设备状态）
 */
export function completeBreakdownRepair(
  id: number,
  data: CompleteRepairRequest,
): Promise<BreakdownListItem> {
  return patch<BreakdownListItem>(
    `/equipment/breakdowns/${id}/repair`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 更新故障记录
 */
export function updateBreakdown(
  id: number,
  data: UpdateBreakdownRequest,
): Promise<BreakdownListItem> {
  return put<BreakdownListItem>(
    `/equipment/breakdowns/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 删除故障记录
 */
export function deleteBreakdown(id: number): Promise<void> {
  return del<void>(`/equipment/breakdowns/${id}`);
}
