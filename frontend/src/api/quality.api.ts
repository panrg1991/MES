/**
 * MES 系统 - 质量管理 API 接口
 * 对接后端 /api/quality/* 路由
 */

import { get, post, put, del } from './request';
import type {
  QualityInspection,
  InspectionItem,
  DefectRecord,
  InspectionResult,
  DefectHandlingMethod,
} from '@/types';
import type { PaginatedData } from '@/types/api';

/** 检验记录列表项（含工单和检验员信息） */
export interface InspectionListItem extends Omit<QualityInspection, 'workOrder' | 'inspector' | 'items'> {
  workOrder?: {
    id: number;
    orderNo: string;
    productName: string;
    productCode: string;
  };
  inspector?: { id: number; name: string; department: string };
  items: Pick<
    InspectionItem,
    'id' | 'itemName' | 'standardValue' | 'actualValue' | 'unit' | 'result'
  >[];
}

/** 检验记录详情（含完整检验项明细） */
export interface InspectionDetail extends Omit<QualityInspection, 'workOrder' | 'inspector' | 'items'> {
  workOrder?: {
    id: number;
    orderNo: string;
    productName: string;
    productCode: string;
    quantity: number;
    completedQty: number;
    defectQty: number;
  };
  inspector?: { id: number; name: string; department: string };
  items: InspectionItem[];
}

/** 不良品列表项（含工单、设备、处理人信息） */
export interface DefectListItem extends Omit<DefectRecord, 'workOrder' | 'equipment' | 'handler'> {
  workOrder?: {
    id: number;
    orderNo: string;
    productName: string;
  };
  equipment?: { id: number; code: string; name: string };
  handler?: { id: number; name: string; department: string };
}

/** 不良品详情 */
export interface DefectDetail extends DefectListItem {
  workOrder?: {
    id: number;
    orderNo: string;
    productName: string;
    productCode: string;
  };
}

/** 创建检验记录请求体 */
export interface CreateInspectionRequest {
  workOrderId: number;
  inspectionType: 'first_article' | 'process' | 'final';
  remark?: string;
  items: Array<{
    itemName: string;
    standardValue: string;
    actualValue: string;
    unit?: string;
    result: InspectionResult;
    remark?: string;
  }>;
}

/** 检验记录查询参数 */
export interface InspectionQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  result?: InspectionResult;
  inspectionType?: 'first_article' | 'process' | 'final';
  workOrderId?: number;
}

/** 创建不良品记录请求体 */
export interface CreateDefectRequest {
  workOrderId: number;
  equipmentId?: number;
  defectType: string;
  defectReason?: string;
  quantity: number;
  remark?: string;
}

/** 更新不良品请求体（处理不良品） */
export interface UpdateDefectRequest {
  handlingMethod?: DefectHandlingMethod;
  remark?: string;
}

/** 不良品查询参数 */
export interface DefectQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  defectType?: string;
  handlingMethod?: DefectHandlingMethod;
  workOrderId?: number;
}

// ==================== 检验记录 API ====================

/** 获取检验记录列表（分页） */
export function getInspections(
  params: InspectionQueryParams,
): Promise<PaginatedData<InspectionListItem>> {
  return get<PaginatedData<InspectionListItem>>(
    '/quality/inspections',
    params as unknown as Record<string, unknown>,
  );
}

/** 获取检验记录详情 */
export function getInspectionById(id: number): Promise<InspectionDetail> {
  return get<InspectionDetail>(`/quality/inspections/${id}`);
}

/** 创建检验记录（含检验项明细） */
export function createInspection(
  data: CreateInspectionRequest,
): Promise<QualityInspection> {
  return post<QualityInspection>(
    '/quality/inspections',
    data as unknown as Record<string, unknown>,
  );
}

/** 删除检验记录 */
export function deleteInspection(id: number): Promise<void> {
  return del<void>(`/quality/inspections/${id}`);
}

// ==================== 不良品 API ====================

/** 获取不良品记录列表（分页） */
export function getDefects(
  params: DefectQueryParams,
): Promise<PaginatedData<DefectListItem>> {
  return get<PaginatedData<DefectListItem>>(
    '/quality/defects',
    params as unknown as Record<string, unknown>,
  );
}

/** 获取不良品记录详情 */
export function getDefectById(id: number): Promise<DefectDetail> {
  return get<DefectDetail>(`/quality/defects/${id}`);
}

/** 创建不良品记录 */
export function createDefect(
  data: CreateDefectRequest,
): Promise<DefectRecord> {
  return post<DefectRecord>(
    '/quality/defects',
    data as unknown as Record<string, unknown>,
  );
}

/** 处理不良品（更新处理方式） */
export function updateDefect(
  id: number,
  data: UpdateDefectRequest,
): Promise<DefectRecord> {
  return put<DefectRecord>(
    `/quality/defects/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/** 删除不良品记录 */
export function deleteDefect(id: number): Promise<void> {
  return del<void>(`/quality/defects/${id}`);
}
