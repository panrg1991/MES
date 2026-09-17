/**
 * MES 系统 - 报表中心 API 接口【T10 新增】
 * 对接后端 /api/reports/* 路由
 *
 * 查询接口走 JSON（get 快捷方法）；导出接口不走此文件，
 * 统一经 utils/download.ts + components/common/ExportButton（blob 下载，§8.4 约定 ⑤）。
 */

import { get } from './request';
import type {
  OeeMetrics,
  OeeTrendPoint,
  OeeDetailItem,
  ProductionReportRow,
  QualityReportResult,
  InventoryReportResult,
  WorkHoursSummaryRow,
  WorkHoursEfficiencyRow,
} from '@/types';

// ==================== 请求参数 ====================

/** OEE 汇总查询参数 */
export interface OeeSummaryParams {
  /** 开始日期 YYYY-MM-DD（默认近 7 天） */
  startDate?: string;
  /** 结束日期 YYYY-MM-DD（含当天） */
  endDate?: string;
  /** 设备 ID（不传为全部设备） */
  equipmentId?: number;
}

/** OEE 趋势查询参数 */
export interface OeeTrendParams extends OeeSummaryParams {
  /** 分桶维度：day | week | month（默认 day） */
  dimension: 'day' | 'week' | 'month';
}

/** OEE 明细查询参数 */
export interface OeeDetailsParams extends OeeSummaryParams {
  page?: number;
  pageSize?: number;
}

/** 生产报表查询参数 */
export interface ProductionReportParams {
  /** 报表类型：daily | weekly | monthly（默认 daily） */
  type: 'daily' | 'weekly' | 'monthly';
  startDate?: string;
  endDate?: string;
}

/** 质量报表查询参数 */
export interface QualityReportParams {
  startDate?: string;
  endDate?: string;
}

/** 库存报表查询参数 */
export interface InventoryReportParams {
  /** 物料分类 */
  category?: string;
  /** 仓库 */
  warehouse?: string;
}

/** 工时报表查询参数 */
export interface WorkHoursReportParams {
  startDate?: string;
  endDate?: string;
  /** 汇总维度：user | shift | workOrder（默认 user） */
  dimension: 'user' | 'shift' | 'workOrder';
}

// ==================== 响应类型 ====================

/** OEE 明细分页响应 */
export interface OeeDetailsResponse {
  list: OeeDetailItem[];
  total: number;
}

/** 工时汇总报表响应（复用 T08 的汇总行结构） */
export interface WorkHoursReportResponse {
  list: WorkHoursSummaryRow[];
  totalHours: number;
  recordCount: number;
}

/** 工时效率响应 */
export interface WorkHoursEfficiencyResponse {
  list: WorkHoursEfficiencyRow[];
}

// ==================== API 方法 ====================

/**
 * 获取 OEE 汇总（三分量 + 总值，百分数 2 位小数；无数据分量为 null）
 */
export function getOeeSummary(params: OeeSummaryParams): Promise<OeeMetrics> {
  return get<OeeMetrics>('/reports/oee/summary', params as unknown as Record<string, unknown>);
}

/**
 * 获取 OEE 趋势（按 day / week / month 分桶）
 */
export function getOeeTrend(params: OeeTrendParams): Promise<{ points: OeeTrendPoint[] }> {
  return get<{ points: OeeTrendPoint[] }>(
    '/reports/oee/trend',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取 OEE 明细（按设备分组，含超产标注，分页）
 */
export function getOeeDetails(params: OeeDetailsParams): Promise<OeeDetailsResponse> {
  return get<OeeDetailsResponse>(
    '/reports/oee/details',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取生产报表（daily / weekly / monthly 聚合）
 */
export function getProductionReport(
  params: ProductionReportParams,
): Promise<{ list: ProductionReportRow[] }> {
  return get<{ list: ProductionReportRow[] }>(
    '/reports/production',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取质量报表（按日检验统计 + 合格率 + 不良 TopN + 处理分布）
 */
export function getQualityReport(params: QualityReportParams): Promise<QualityReportResult> {
  return get<QualityReportResult>(
    '/reports/quality',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取库存报表（明细 + 预警清单，预警口径与库存页同源）
 */
export function getInventoryReport(params: InventoryReportParams): Promise<InventoryReportResult> {
  return get<InventoryReportResult>(
    '/reports/inventory',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取工时汇总报表（user / shift / workOrder 维度）
 */
export function getWorkHoursReport(
  params: WorkHoursReportParams,
): Promise<WorkHoursReportResponse> {
  return get<WorkHoursReportResponse>(
    '/reports/workhours',
    params as unknown as Record<string, unknown>,
  );
}

/**
 * 获取工时效率（人均产出 = 报工完成量 / 工时）
 */
export function getWorkHoursEfficiency(
  params: Pick<WorkHoursReportParams, 'startDate' | 'endDate'>,
): Promise<WorkHoursEfficiencyResponse> {
  return get<WorkHoursEfficiencyResponse>(
    '/reports/workhours/efficiency',
    params as unknown as Record<string, unknown>,
  );
}
