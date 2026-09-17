/**
 * MES 系统 - 生产管理 API 接口
 * 对接后端 /api/production/* 路由
 */

import { get, post, put, patch, del } from './request';
import type {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  ProductionReport,
  WorkOrderStatusLog,
} from '@/types';
import type { PaginatedData } from '@/types/api';

/** 工单列表项（含进度和车间信息） */
export interface WorkOrderListItem extends Omit<WorkOrder, 'workshop'> {
  progress: number;
  workshop?: { id: number; name: string; code: string };
}

/** 工单详情（含报工记录和状态日志） */
export interface WorkOrderDetail extends WorkOrderListItem {
  reports: Array<
    ProductionReport & {
      operator?: { id: number; name: string; department: string };
    }
  >;
  statusLogs: Array<
    WorkOrderStatusLog & {
      operator?: { id: number; name: string; department: string };
    }
  >;
}

/** 创建工单请求体 */
export interface CreateWorkOrderRequest {
  productName: string;
  productCode: string;
  quantity: number;
  workshopId?: number;
  priority: WorkOrderPriority;
  planStart?: string;
  planEnd?: string;
  remark?: string;
}

/** 更新工单请求体 */
export interface UpdateWorkOrderRequest {
  productName?: string;
  productCode?: string;
  quantity?: number;
  workshopId?: number;
  priority?: WorkOrderPriority;
  planStart?: string;
  planEnd?: string;
  remark?: string;
}

/** 工单分页查询参数 */
export interface WorkOrderQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
}

/** 状态流转请求体 */
export interface TransitionStatusRequest {
  toStatus: WorkOrderStatus;
  remark?: string;
}

/** 报工录入请求体 */
export interface CreateReportRequest {
  completedQty: number;
  defectQty?: number;
  remark?: string;
}

/**
 * 获取工单列表（分页）
 */
export function getWorkOrders(
  params: WorkOrderQueryParams,
): Promise<PaginatedData<WorkOrderListItem>> {
  return get<PaginatedData<WorkOrderListItem>>(
    '/production',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取工单详情
 */
export function getWorkOrderById(id: number): Promise<WorkOrderDetail> {
  return get<WorkOrderDetail>(`/production/${id}`);
}

/**
 * 创建工单
 */
export function createWorkOrder(
  data: CreateWorkOrderRequest,
): Promise<WorkOrder> {
  return post<WorkOrder>('/production', data as unknown as Record<string, unknown>);
}

/**
 * 更新工单
 */
export function updateWorkOrder(
  id: number,
  data: UpdateWorkOrderRequest,
): Promise<WorkOrder> {
  return put<WorkOrder>(
    `/production/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 删除工单
 */
export function deleteWorkOrder(id: number): Promise<void> {
  return del<void>(`/production/${id}`);
}

/**
 * 工单状态流转
 */
export function transitionStatus(
  id: number,
  data: TransitionStatusRequest,
): Promise<WorkOrder> {
  return patch<WorkOrder>(
    `/production/${id}/status`,
    data as unknown as Record<string, unknown>,
  );
}

/**
 * 报工录入
 */
export function createReport(
  id: number,
  data: CreateReportRequest,
): Promise<ProductionReport> {
  return post<ProductionReport>(
    `/production/${id}/reports`,
    data as unknown as Record<string, unknown>,
  );
}
