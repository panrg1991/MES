/**
 * MES 系统 - 物料管理 API 接口
 * 对接后端 /api/material/* 路由
 */

import { get, post, put, del } from './request';
import type {
  Material,
  BOM,
  BOMItem,
  Inventory,
  InventoryTransaction,
  InventoryWarningItem,
  MaterialBatch,
  BatchStatus,
  WarningLevel,
  BatchTraceForwardResult,
  BatchTraceBackwardResult,
  MaterialType,
  TransactionType,
} from '@/types';
import type { PaginatedData } from '@/types/api';

// ==================== 物料主数据 ====================

/** 物料列表项（含库存信息） */
export interface MaterialListItem extends Material {
  inventory?: Pick<
    Inventory,
    'id' | 'quantity' | 'safetyStock' | 'maxStock' | 'warehouse' | 'location'
  >;
}

/** 创建物料请求体 */
export interface CreateMaterialRequest {
  code: string;
  name: string;
  specification: string;
  unit: string;
  category: string;
  type: MaterialType;
  description?: string;
}

/** 更新物料请求体 */
export interface UpdateMaterialRequest {
  name?: string;
  specification?: string;
  unit?: string;
  category?: string;
  type?: MaterialType;
  description?: string;
}

/** 物料查询参数 */
export interface MaterialQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  type?: MaterialType;
  category?: string;
}

// ==================== BOM ====================

/** BOM 明细项（含物料信息） */
export interface BOMItemWithMaterial extends Omit<BOMItem, 'material'> {
  material?: Pick<
    Material,
    'id' | 'code' | 'name' | 'specification' | 'unit' | 'type'
  >;
}

/** BOM 列表项（含明细项数量） */
export interface BOMListItem extends BOM {
  _count?: { items: number };
}

/** BOM 详情（含完整明细项和物料信息） */
export interface BOMDetail extends Omit<BOM, 'items'> {
  items: BOMItemWithMaterial[];
}

/** 创建 BOM 请求体 */
export interface CreateBOMRequest {
  productCode: string;
  productName: string;
  version: string;
  remark?: string;
  items: Array<{
    materialId: number;
    quantity: number;
    unit: string;
    remark?: string;
  }>;
}

/** 更新 BOM 请求体 */
export interface UpdateBOMRequest {
  productName?: string;
  version?: string;
  status?: boolean;
  remark?: string;
  items?: Array<{
    materialId: number;
    quantity: number;
    unit: string;
    remark?: string;
  }>;
}

/** BOM 查询参数 */
export interface BOMQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
}

// ==================== 库存 ====================

/** 库存列表项（含物料信息、低库存标识与 P1 统一口径预警等级） */
export interface InventoryListItem extends Omit<Inventory, 'material'> {
  material?: Pick<
    Material,
    'id' | 'code' | 'name' | 'specification' | 'unit' | 'type'
  >;
  /** 是否低于安全库存（后端 evaluateWarning 计算） */
  isLowStock?: boolean;
  /** 预警等级（P1 统一口径：critical / warning；无预警为 null） */
  level?: WarningLevel | null;
  /** 缺口量（P1） */
  shortage?: number;
  /** 缺口比例（P1） */
  shortageRatio?: number;
}

/** 出入库流水记录（含物料和操作员信息） */
export interface TransactionListItem extends Omit<InventoryTransaction, 'material' | 'operator'> {
  material?: Pick<Material, 'id' | 'code' | 'name' | 'unit'>;
  operator?: { id: number; name: string; department: string };
}

/** 创建出入库请求体 */
export interface CreateTransactionRequest {
  materialId: number;
  transactionType: TransactionType;
  quantity: number;
  batchNo: string;
  relatedOrder?: string;
  remark?: string;
}

/** 库存查询参数（P1 扩展 I8：warning=true 只看预警） */
export interface InventoryQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  /** 只看预警（'true'/'false' 字符串传给后端） */
  warning?: boolean;
}

/** 出入库流水查询参数 */
export interface TransactionQueryParams {
  materialId?: number;
  page: number;
  pageSize: number;
}

// ==================== 物料 API 函数 ====================

/** 获取物料列表（分页） */
export function getMaterials(
  params: MaterialQueryParams,
): Promise<PaginatedData<MaterialListItem>> {
  return get<PaginatedData<MaterialListItem>>(
    '/material/materials',
    params as unknown as Record<string, unknown>,
  );
}

/** 获取物料详情 */
export function getMaterialById(id: number): Promise<MaterialListItem> {
  return get<MaterialListItem>(`/material/materials/${id}`);
}

/** 创建物料（自动初始化库存） */
export function createMaterial(
  data: CreateMaterialRequest,
): Promise<MaterialListItem> {
  return post<MaterialListItem>(
    '/material/materials',
    data as unknown as Record<string, unknown>,
  );
}

/** 更新物料 */
export function updateMaterial(
  id: number,
  data: UpdateMaterialRequest,
): Promise<MaterialListItem> {
  return put<MaterialListItem>(
    `/material/materials/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/** 删除物料 */
export function deleteMaterial(id: number): Promise<void> {
  return del<void>(`/material/materials/${id}`);
}

// ==================== BOM API 函数 ====================

/** 获取 BOM 列表（分页） */
export function getBOMs(
  params: BOMQueryParams,
): Promise<PaginatedData<BOMListItem>> {
  return get<PaginatedData<BOMListItem>>(
    '/material/bom',
    params as unknown as Record<string, unknown>,
  );
}

/** 获取 BOM 详情（含明细项） */
export function getBOMById(id: number): Promise<BOMDetail> {
  return get<BOMDetail>(`/material/bom/${id}`);
}

/** 创建 BOM */
export function createBOM(data: CreateBOMRequest): Promise<BOMDetail> {
  return post<BOMDetail>(
    '/material/bom',
    data as unknown as Record<string, unknown>,
  );
}

/** 更新 BOM */
export function updateBOM(
  id: number,
  data: UpdateBOMRequest,
): Promise<BOMDetail> {
  return put<BOMDetail>(
    `/material/bom/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/** 删除 BOM */
export function deleteBOM(id: number): Promise<void> {
  return del<void>(`/material/bom/${id}`);
}

// ==================== 库存 API 函数 ====================

/** 获取库存列表（分页，含低库存标识；warning=true 只看预警） */
export function getInventoryList(
  params: InventoryQueryParams,
): Promise<PaginatedData<InventoryListItem>> {
  return get<PaginatedData<InventoryListItem>>('/material/inventory', {
    ...params,
    warning: params.warning ? 'true' : undefined,
  } as unknown as Record<string, unknown>);
}

/**
 * 【P1-08】获取库存预警列表（quantity < safetyStock）
 * 返回缺口量 / 缺口比例 / 预警等级，排序：critical 先 → 缺口比例倒序
 */
export function getInventoryWarnings(
  params: InventoryWarningQueryParams,
): Promise<PaginatedData<InventoryWarningItem & { material?: InventoryListItem['material'] }>> {
  return get<
    PaginatedData<
      InventoryWarningItem & { material?: InventoryListItem['material'] }
    >
  >(
    '/material/inventory/warnings',
    params as unknown as Record<string, unknown>,
  );
}

/** 创建出入库事务 */
export function createTransaction(
  data: CreateTransactionRequest,
): Promise<InventoryTransaction> {
  return post<InventoryTransaction>(
    '/material/inventory/transactions',
    data as unknown as Record<string, unknown>,
  );
}

/** 获取出入库流水记录（分页） */
export function getTransactions(
  params: TransactionQueryParams,
): Promise<PaginatedData<TransactionListItem>> {
  return get<PaginatedData<TransactionListItem>>(
    '/material/inventory/transactions',
    params as unknown as Record<string, unknown>,
  );
}

// ==================== 批次管理（P1-07） ====================

/** 批次列表项（含物料摘要信息） */
export interface BatchListItem extends Omit<MaterialBatch, 'material'> {
  material?: Pick<
    Material,
    'id' | 'code' | 'name' | 'specification' | 'unit'
  >;
}

/** 批次查询参数 */
export interface BatchQueryParams {
  page: number;
  pageSize: number;
  materialId?: number;
  batchNo?: string;
  supplier?: string;
  status?: BatchStatus;
}

/** 创建批次请求体 */
export interface CreateBatchRequest {
  materialId: number;
  batchNo: string;
  supplier: string;
  /** YYYY-MM-DD */
  receivedDate: string;
  quantity: number;
  status?: BatchStatus;
}

/** 更新批次请求体（materialId 建档后不允许变更） */
export interface UpdateBatchRequest {
  batchNo?: string;
  supplier?: string;
  receivedDate?: string;
  quantity?: number;
  status?: BatchStatus;
}

/** 获取批次列表（分页） */
export function getBatches(
  params: BatchQueryParams,
): Promise<PaginatedData<BatchListItem>> {
  return get<PaginatedData<BatchListItem>>(
    '/material/batches',
    params as unknown as Record<string, unknown>,
  );
}

/** 创建批次（batchNo 全局重复时后端返回 409） */
export function createBatch(data: CreateBatchRequest): Promise<BatchListItem> {
  return post<BatchListItem>(
    '/material/batches',
    data as unknown as Record<string, unknown>,
  );
}

/** 更新批次 */
export function updateBatch(
  id: number,
  data: UpdateBatchRequest,
): Promise<BatchListItem> {
  return put<BatchListItem>(
    `/material/batches/${id}`,
    data as unknown as Record<string, unknown>,
  );
}

/** 删除批次 */
export function deleteBatch(id: number): Promise<void> {
  return del<void>(`/material/batches/${id}`);
}

// ==================== 库存预警（P1-08） ====================

/** 库存预警查询参数 */
export interface InventoryWarningQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  level?: WarningLevel;
}

// ==================== 物料追溯（P1-07） ====================

/** 正向追溯查询参数（批次 → 去向工单） */
export interface ForwardTraceQueryParams {
  batchNo: string;
}

/** 反向追溯查询参数（工单 → 来源批次） */
export interface BackwardTraceQueryParams {
  workOrderNo: string;
}

/**
 * 正向追溯（批次 → 去向）
 * usages 项的 workOrderId 为后端经 relatedOrder ↔ orderNo 字符串关联补全，
 * 命中时前端可跳工单详情，未命中（工单已删除/未关联）为 null
 */
export function getForwardTrace(
  params: ForwardTraceQueryParams,
): Promise<
  BatchTraceForwardResult & {
    usages: Array<{
      relatedOrder: string;
      workOrderId: number | null;
      quantity: number;
      transactionTime: string;
    }>;
  }
> {
  return get<
    BatchTraceForwardResult & {
      usages: Array<{
        relatedOrder: string;
        workOrderId: number | null;
        quantity: number;
        transactionTime: string;
      }>;
    }
  >(
    '/material/trace/forward',
    params as unknown as Record<string, unknown>,
  );
}

/** 反向追溯（工单 → 来源批次） */
export function getBackwardTrace(
  params: BackwardTraceQueryParams,
): Promise<BatchTraceBackwardResult> {
  return get<BatchTraceBackwardResult>(
    '/material/trace/backward',
    params as unknown as Record<string, unknown>,
  );
}
