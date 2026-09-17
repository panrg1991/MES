/**
 * MES 系统 - 生产排程 API 接口（P1-01，T08）
 * 对接后端 /api/production/schedules/* 路由
 */

import { get, post, patch, del } from './request';
import type { GanttTask, ScheduleConflict, ScheduleStatus } from '@/types';

/** 排程列表项（含工单与设备信息，后端 include 返回） */
export interface ScheduleListItem extends GanttTask {
  /** 计划开始时间（ISO） */
  actualStart: string | null;
  actualEnd: string | null;
  workOrder?: { id: number; orderNo: string; productName: string; status: string };
  equipment?: { id: number; code: string; name: string } | null;
}

/** 排程列表响应（非分页，时间窗查询） */
export interface ScheduleListResult {
  list: ScheduleListItem[];
  total: number;
}

/** 排程列表查询参数 */
export interface ScheduleQueryParams {
  startDate?: string;
  endDate?: string;
  equipmentId?: number;
  status?: ScheduleStatus;
  /** 工单维度查询（工单详情页排程区块），此时不施加默认时间窗 */
  workOrderId?: number;
}

/** 创建排程请求体 */
export interface CreateScheduleRequest {
  workOrderId: number;
  equipmentId?: number;
  plannedStart: string;
  plannedEnd: string;
}

/** 调整排程请求体（拖拽提交） */
export interface UpdateScheduleRequest {
  plannedStart?: string;
  plannedEnd?: string;
  equipmentId?: number;
}

/**
 * 获取排程列表（时间窗查询，默认今天起 14 天）
 */
export function getSchedules(
  params: ScheduleQueryParams,
): Promise<ScheduleListResult> {
  return get<ScheduleListResult>('/production/schedules', params as unknown as Record<string, unknown>);
}

/**
 * 冲突检测（辅助查询，供前端高亮冲突对）
 */
export function getScheduleConflicts(params: {
  equipmentId: number;
  plannedStart: string;
  plannedEnd: string;
  excludeId?: number;
}): Promise<{ conflicts: ScheduleConflict[] }> {
  return get<{ conflicts: ScheduleConflict[] }>(
    '/production/schedules/conflicts',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 创建排程（同设备时段重叠 → 409）
 */
export function createSchedule(
  data: CreateScheduleRequest,
): Promise<{ schedule: ScheduleListItem }> {
  return post<{ schedule: ScheduleListItem }>(
    '/production/schedules',
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 调整排程时段（拖拽提交；返回冲突检测结果，被拒 → 409）
 */
export function updateSchedule(
  id: number,
  data: UpdateScheduleRequest,
): Promise<{ schedule: ScheduleListItem; conflicts: ScheduleConflict[] }> {
  return patch<{ schedule: ScheduleListItem; conflicts: ScheduleConflict[] }>(
    `/production/schedules/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 排程状态流转（planned → in_progress → completed / cancelled）
 */
export function updateScheduleStatus(
  id: number,
  status: ScheduleStatus,
): Promise<{ schedule: ScheduleListItem }> {
  return patch<{ schedule: ScheduleListItem }>(
    `/production/schedules/${id}/status`,
    { status } as unknown as Record<string, unknown>,
  );
}

/**
 * 删除排程
 */
export function deleteSchedule(id: number): Promise<void> {
  return del<void>(`/production/schedules/${id}`);
}
