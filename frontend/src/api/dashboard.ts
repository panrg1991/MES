/**
 * MES 系统 - 数据看板 API 接口
 * 对接后端 /api/dashboard/* 路由
 */

import { get } from './request';
import type {
  DashboardOverview,
  DashboardProgressItem,
  DashboardEquipmentStatus,
  DashboardOutputTrend,
  DashboardQualitySummary,
} from '@/types';

/** 工单进度列表响应 */
export interface ProductionProgressResponse {
  list: DashboardProgressItem[];
}

/**
 * 获取看板总览数据
 * 包含：进行中工单数、设备状态汇总、今日产量、不良率、低库存预警数
 */
export function getDashboardOverview(): Promise<DashboardOverview> {
  return get<DashboardOverview>('/dashboard/overview');
}

/**
 * 获取当前进行中工单进度列表
 */
export function getDashboardProductionProgress(): Promise<ProductionProgressResponse> {
  return get<ProductionProgressResponse>('/dashboard/production-progress');
}

/**
 * 获取设备状态汇总（含设备详情列表）
 */
export function getDashboardEquipmentStatus(): Promise<DashboardEquipmentStatus> {
  return get<DashboardEquipmentStatus>('/dashboard/equipment-status');
}

/**
 * 获取近N天产量趋势
 * @param days 天数，默认 7
 */
export function getDashboardOutputTrend(
  days = 7,
): Promise<DashboardOutputTrend> {
  return get<DashboardOutputTrend>('/dashboard/output-trend', { days });
}

/**
 * 获取指定日期的质量摘要
 * @param date 日期字符串（YYYY-MM-DD），不传则默认今天
 */
export function getDashboardQualitySummary(
  date?: string,
): Promise<DashboardQualitySummary> {
  return get<DashboardQualitySummary>(
    '/dashboard/quality-summary',
    date ? { date } : undefined,
  );
}
