/**
 * 单元测试：src/utils/format.ts
 * ---------------------------------------------------------------------------
 * 格式化函数被全部列表页复用，重点覆盖空值兜底（统一显示 '-'）
 * 与百分比/进度的边界（除零、小数位）。
 */

import { describe, it, expect } from 'vitest';
import {
  formatDateTime,
  formatDate,
  formatTime,
  formatNumber,
  formatPercent,
  formatProgress,
  getWorkOrderStatusInfo,
  getWorkOrderPriorityInfo,
  getEquipmentStatusInfo,
  getInspectionResultInfo,
  getDefectHandlingInfo,
  getTransactionTypeInfo,
} from './format';

describe('formatDateTime / formatDate / formatTime', () => {
  it('按标准格式输出日期时间', () => {
    expect(formatDateTime('2026-09-17 10:30:45')).toBe('2026-09-17 10:30:45');
    expect(formatDate('2026-09-17 10:30:45')).toBe('2026-09-17');
    expect(formatTime('2026-09-17 10:30:45')).toBe('10:30:45');
  });

  it('接受 Date 对象', () => {
    const date = new Date(2026, 8, 17, 8, 5, 3); // 2026-09-17 08:05:03
    expect(formatDate(date)).toBe('2026-09-17');
    expect(formatTime(date)).toBe('08:05:03');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['空字符串', ''],
  ])('%s 统一显示为 "-"', (_label, value) => {
    expect(formatDateTime(value)).toBe('-');
    expect(formatDate(value)).toBe('-');
    expect(formatTime(value)).toBe('-');
  });
});

describe('formatNumber', () => {
  it('默认按千分位输出整数', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-1234)).toBe('-1,234');
  });

  it('支持指定小数位', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
    expect(formatNumber(1.5, 3)).toBe('1.500');
  });

  it('null / undefined 显示为 "-"（0 必须保留）', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatPercent / formatProgress', () => {
  it('按指定小数位补全百分号', () => {
    expect(formatPercent(95)).toBe('95.0%');
    expect(formatPercent(95.456, 2)).toBe('95.46%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('null / undefined 显示为 "-"', () => {
    expect(formatPercent(null)).toBe('-');
    expect(formatPercent(undefined)).toBe('-');
  });

  it('进度按 完成数/总数 计算', () => {
    expect(formatProgress(3, 4)).toBe('75.0%');
    expect(formatProgress(1, 3)).toBe('33.3%');
    expect(formatProgress(5, 5)).toBe('100.0%');
  });

  it('总数为 0 时避免除零，返回 0%', () => {
    expect(formatProgress(0, 0)).toBe('0%');
    // 边界：完成数不为 0 但总数为 0，同样不应产生 NaN/Infinity
    expect(formatProgress(5, 0)).toBe('0%');
  });
});

describe('状态标签映射', () => {
  it('返回已登记状态的文案与颜色', () => {
    expect(getWorkOrderStatusInfo('pending')).toEqual({
      label: '待开始',
      color: 'default',
    });
    expect(getWorkOrderStatusInfo('in_progress')).toEqual({
      label: '进行中',
      color: 'processing',
    });
    expect(getWorkOrderPriorityInfo('urgent')).toEqual({
      label: '紧急',
      color: 'error',
    });
    expect(getEquipmentStatusInfo('fault')).toEqual({
      label: '故障',
      color: 'error',
    });
    expect(getInspectionResultInfo('concession')).toEqual({
      label: '让步接收',
      color: 'warning',
    });
    expect(getDefectHandlingInfo('rework')).toEqual({
      label: '返工',
      color: 'processing',
    });
    expect(getTransactionTypeInfo('in')).toEqual({
      label: '入库',
      color: 'success',
    });
  });

  it('未知取值兜底为「未知」而非抛错', () => {
    // 后端新增枚举值、前端尚未同步时，页面不应崩栈
    expect(getWorkOrderStatusInfo('brand_new' as never)).toEqual({
      label: '未知',
      color: 'default',
    });
    expect(getEquipmentStatusInfo('unknown' as never)).toEqual({
      label: '未知',
      color: 'default',
    });
  });
});
