/**
 * MES 系统 - 人员管理 API 接口（P1-09 排班 + P1-10 工时，T08）
 * 对接后端 /api/personnel/* 路由
 */

import { get, post, put, del } from './request';
import type {
  ScheduleCalendarCell,
  Shift,
  PersonnelSchedule,
  WorkHoursRecord,
} from '@/types';
import type { PaginatedData } from '@/types/api';

// ==================== 班次（P1-09） ====================

/** 创建/更新班次请求体（HH:mm；endTime < startTime 表示跨夜班次） */
export interface SaveShiftRequest {
  name: string;
  startTime: string;
  endTime: string;
  description?: string;
}

/**
 * 获取班次列表
 */
export function getShifts(): Promise<{ list: Shift[] }> {
  return get<{ list: Shift[] }>('/personnel/shifts');
}

/**
 * 创建班次
 */
export function createShift(data: SaveShiftRequest): Promise<{ shift: Shift }> {
  return post<{ shift: Shift }>('/personnel/shifts', data as unknown as Record<string, unknown>);
}

/**
 * 更新班次
 */
export function updateShift(id: number, data: SaveShiftRequest): Promise<{ shift: Shift }> {
  return put<{ shift: Shift }>(`/personnel/shifts/${id}`, data as unknown as Record<string, unknown>);
}

/**
 * 删除班次
 */
export function deleteShift(id: number): Promise<void> {
  return del<void>(`/personnel/shifts/${id}`);
}

// ==================== 排班（P1-09） ====================

/** 排班列表项（含用户与班次信息） */
export interface PersonnelScheduleItem
  extends Omit<PersonnelSchedule, 'user' | 'shift'> {
  user?: { id: number; name: string; department: string };
  shift?: { id: number; name: string; startTime: string; endTime: string };
}

/** 排班列表查询参数 */
export interface PersonnelScheduleQueryParams {
  page?: number;
  pageSize?: number;
  userId?: number;
  shiftId?: number;
  startDate?: string;
  endDate?: string;
}

/** 新增排班请求体 */
export interface CreatePersonnelScheduleRequest {
  userId: number;
  shiftId: number;
  workStation?: string;
  scheduleDate: string;
  remark?: string;
}

/** 换班/调班请求体 */
export interface UpdatePersonnelScheduleRequest {
  userId?: number;
  shiftId?: number;
  workStation?: string;
  scheduleDate?: string;
  remark?: string;
}

/**
 * 获取排班列表（分页）
 */
export function getPersonnelSchedules(
  params: PersonnelScheduleQueryParams,
): Promise<PaginatedData<PersonnelScheduleItem>> {
  return get<PaginatedData<PersonnelScheduleItem>>(
    '/personnel/schedules',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取排班日历矩阵（按日期分组，供日历渲染）
 */
export function getScheduleCalendar(params: {
  startDate: string;
  endDate: string;
  userId?: number;
  shiftId?: number;
}): Promise<{ matrix: ScheduleCalendarCell[] }> {
  return get<{ matrix: ScheduleCalendarCell[] }>(
    '/personnel/schedules/calendar',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 新增排班（同人 + 同日 + 同班次重复 → 409）
 */
export function createPersonnelSchedule(
  data: CreatePersonnelScheduleRequest,
): Promise<{ schedule: PersonnelScheduleItem }> {
  return post<{ schedule: PersonnelScheduleItem }>(
    '/personnel/schedules',
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 换班 / 调班（冲突 → 409）
 */
export function updatePersonnelSchedule(
  id: number,
  data: UpdatePersonnelScheduleRequest,
): Promise<{ schedule: PersonnelScheduleItem }> {
  return put<{ schedule: PersonnelScheduleItem }>(
    `/personnel/schedules/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 删除排班
 */
export function deletePersonnelSchedule(id: number): Promise<void> {
  return del<void>(`/personnel/schedules/${id}`);
}

// ==================== 工时（P1-10） ====================

/** 工时列表项（含用户、工单、班次信息） */
export interface WorkHoursItem
  extends Omit<WorkHoursRecord, 'user' | 'workOrder' | 'shift'> {
  user?: { id: number; name: string; department: string };
  workOrder?: { id: number; orderNo: string; productName: string; completedQty: number };
  shift?: { id: number; name: string; startTime: string; endTime: string };
}

/** 工时列表查询参数 */
export interface WorkHoursQueryParams {
  page?: number;
  pageSize?: number;
  userId?: number;
  workOrderId?: number;
  shiftId?: number;
  startDate?: string;
  endDate?: string;
}

/** 录入/更新工时请求体（hours 由服务端计算，前端只填起止） */
export interface SaveWorkHoursRequest {
  userId?: number | null;
  workOrderId: number;
  shiftId?: number | null;
  workDate: string;
  startTime: string;
  /** ISO 字符串；为空/null 表示进行中（hours = 0） */
  endTime?: string | null;
}

/** 工时汇总维度（T08 页面：按人员 / 按班次 / 按日期；后端另支持 workOrder） */
export type WorkHoursSummaryDimension = 'user' | 'shift' | 'date' | 'workOrder';

/** 工时汇总行 */
export interface WorkHoursSummaryItem {
  dimensionKey: string;
  dimensionName: string;
  totalHours: number;
  recordCount: number;
  /** 按人员维度：参与工单数 */
  workOrderCount?: number;
  /** 按人员维度：日均工时 */
  avgHoursPerDay?: number;
  /** 按班次维度：平均单条时长 */
  avgHoursPerRecord?: number;
  /** 按班次维度：涉及人数 */
  userCount?: number;
  /** 按工单维度：单位产品工时 */
  hoursPerUnit?: number | null;
}

/** 工时汇总响应 */
export interface WorkHoursSummaryResult {
  list: WorkHoursSummaryItem[];
  totalHours: number;
  recordCount: number;
}

/**
 * 获取工时列表（分页）
 */
export function getWorkHours(
  params: WorkHoursQueryParams,
): Promise<PaginatedData<WorkHoursItem>> {
  return get<PaginatedData<WorkHoursItem>>(
    '/personnel/workhours',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取工时汇总（多维度）
 */
export function getWorkHoursSummary(params: {
  startDate?: string;
  endDate?: string;
  dimension: WorkHoursSummaryDimension;
}): Promise<WorkHoursSummaryResult> {
  return get<WorkHoursSummaryResult>(
    '/personnel/workhours/summary',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 录入工时（hours 服务端自动计算，跨夜 +24h）
 */
export function createWorkHours(
  data: SaveWorkHoursRequest,
): Promise<{ record: WorkHoursItem }> {
  return post<{ record: WorkHoursItem }>(
    '/personnel/workhours',
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 更新工时（hours 重新计算）
 */
export function updateWorkHours(
  id: number,
  data: Partial<SaveWorkHoursRequest>,
): Promise<{ record: WorkHoursItem }> {
  return put<{ record: WorkHoursItem }>(
    `/personnel/workhours/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 删除工时记录
 */
export function deleteWorkHours(id: number): Promise<void> {
  return del<void>(`/personnel/workhours/${id}`);
}
