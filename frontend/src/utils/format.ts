/**
 * MES 系统 - 格式化工具函数
 * 包含：日期格式化、数字格式化、百分比计算、状态标签获取
 */

import dayjs from 'dayjs';
import {
  WORK_ORDER_STATUS_MAP,
  EQUIPMENT_STATUS_MAP,
  INSPECTION_RESULT_MAP,
  DEFECT_HANDLING_MAP,
  TRANSACTION_TYPE_MAP,
  WORK_ORDER_PRIORITY_MAP,
} from './constants';
import type {
  WorkOrderStatus,
  EquipmentStatus,
  InspectionResult,
  DefectHandlingMethod,
  TransactionType,
  WorkOrderPriority,
} from '@/types';

/** 日期时间格式化：YYYY-MM-DD HH:mm:ss */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
}

/** 日期格式化：YYYY-MM-DD */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD');
}

/** 时间格式化：HH:mm:ss */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return dayjs(value).format('HH:mm:ss');
}

/** 数字千分位格式化 */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 百分比格式化 */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
}

/** 计算并格式化进度百分比 */
export function formatProgress(completed: number, total: number): string {
  if (total === 0) return '0%';
  return formatPercent((completed / total) * 100, 1);
}

/** 获取工单状态标签信息 */
export function getWorkOrderStatusInfo(status: WorkOrderStatus) {
  return WORK_ORDER_STATUS_MAP[status] ?? { label: '未知', color: 'default' };
}

/** 获取工单优先级标签信息 */
export function getWorkOrderPriorityInfo(priority: WorkOrderPriority) {
  return WORK_ORDER_PRIORITY_MAP[priority] ?? { label: '未知', color: 'default' };
}

/** 获取设备状态标签信息 */
export function getEquipmentStatusInfo(status: EquipmentStatus) {
  return EQUIPMENT_STATUS_MAP[status] ?? { label: '未知', color: 'default' };
}

/** 获取检验结果标签信息 */
export function getInspectionResultInfo(result: InspectionResult) {
  return INSPECTION_RESULT_MAP[result] ?? { label: '未知', color: 'default' };
}

/** 获取不良处理方式标签信息 */
export function getDefectHandlingInfo(method: DefectHandlingMethod) {
  return DEFECT_HANDLING_MAP[method] ?? { label: '未知', color: 'default' };
}

/** 获取出入库类型标签信息 */
export function getTransactionTypeInfo(type: TransactionType) {
  return TRANSACTION_TYPE_MAP[type] ?? { label: '未知', color: 'default' };
}
