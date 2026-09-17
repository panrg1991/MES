/**
 * MES 系统 - 质量追溯 API 接口
 * 对接后端 /api/quality/traceability 路由（P1-04，T09）
 */

import { get } from './request';
import type { TraceabilityResult } from '@/types';

/** 追溯查询参数（workOrderNo / batchNo 二选一） */
export interface TraceabilityQueryParams {
  /** 工单号（工单维度追溯） */
  workOrderNo?: string;
  /** 批次号（批次维度追溯，反查全部领用工单） */
  batchNo?: string;
}

/**
 * 追溯链路查询
 * 工单维度：entries 长度为 1；批次维度：entries 为该批次领用的全部工单链路数组
 * 后端 404（工单/批次不存在）由 request.ts 统一 message.error 提示
 */
export function getTraceability(
  params: TraceabilityQueryParams,
): Promise<TraceabilityResult> {
  return get<TraceabilityResult>(
    '/quality/traceability',
    params as unknown as Record<string, unknown>,
  );
}
