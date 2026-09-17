/**
 * 单元测试：src/utils/constants.ts
 * ---------------------------------------------------------------------------
 * 重点校验「状态机」与「枚举映射」的自洽性：
 *   · 流转目标必须是合法状态，终态不可再流转
 *   · 映射表必须覆盖全部枚举值（否则页面会显示 undefined）
 * 这类问题一旦出现会直接影响页面交互，故用测试锁死。
 */

import { describe, it, expect } from 'vitest';
import {
  WORK_ORDER_STATUS_MAP,
  WORK_ORDER_STATUS_TRANSITIONS,
  WORK_ORDER_PRIORITY_MAP,
  EQUIPMENT_STATUS_MAP,
  INSPECTION_RESULT_MAP,
  DEFECT_HANDLING_MAP,
  TRANSACTION_TYPE_MAP,
  SCHEDULE_STATUS_MAP,
  SCHEDULE_STATUS_TRANSITIONS,
  GANTT_BAR_COLOR_MAP,
  MAINTENANCE_CYCLE_MAP,
  MAINTENANCE_CYCLE_OPTIONS,
  MAINTENANCE_TYPE_MAP,
} from './constants';
import type { WorkOrderStatus, ScheduleStatus } from '@/types';

describe('工单状态机', () => {
  const statuses = Object.keys(WORK_ORDER_STATUS_MAP) as WorkOrderStatus[];

  it('每个状态都有流转规则定义', () => {
    statuses.forEach((status) => {
      expect(WORK_ORDER_STATUS_TRANSITIONS).toHaveProperty(status);
    });
  });

  it('流转目标均为合法状态', () => {
    Object.entries(WORK_ORDER_STATUS_TRANSITIONS).forEach(([, targets]) => {
      targets.forEach((target) => {
        expect(statuses).toContain(target);
      });
    });
  });

  it('终态不允许再流转', () => {
    expect(WORK_ORDER_STATUS_TRANSITIONS.closed).toEqual([]);
  });

  it('不允许流转到自身', () => {
    Object.entries(WORK_ORDER_STATUS_TRANSITIONS).forEach(([from, targets]) => {
      expect(targets).not.toContain(from);
    });
  });

  it('进行中可暂停、可完成、可关闭', () => {
    expect(WORK_ORDER_STATUS_TRANSITIONS.in_progress).toEqual(
      expect.arrayContaining(['paused', 'completed', 'closed']),
    );
  });
});

describe('排程状态机', () => {
  const statuses = Object.keys(SCHEDULE_STATUS_MAP) as ScheduleStatus[];

  it('每个状态都有流转规则且目标合法', () => {
    statuses.forEach((status) => {
      expect(SCHEDULE_STATUS_TRANSITIONS).toHaveProperty(status);
      SCHEDULE_STATUS_TRANSITIONS[status].forEach((target) => {
        expect(statuses).toContain(target);
      });
    });
  });

  it('completed 与 cancelled 为终态', () => {
    expect(SCHEDULE_STATUS_TRANSITIONS.completed).toEqual([]);
    expect(SCHEDULE_STATUS_TRANSITIONS.cancelled).toEqual([]);
  });

  it('每个状态都有甘特图配色', () => {
    statuses.forEach((status) => {
      expect(GANTT_BAR_COLOR_MAP[status]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});

describe('枚举映射完整性', () => {
  it('各状态映射的每一项都含 label 与 color', () => {
    const maps = {
      WORK_ORDER_STATUS_MAP,
      WORK_ORDER_PRIORITY_MAP,
      EQUIPMENT_STATUS_MAP,
      INSPECTION_RESULT_MAP,
      DEFECT_HANDLING_MAP,
      TRANSACTION_TYPE_MAP,
      SCHEDULE_STATUS_MAP,
      MAINTENANCE_TYPE_MAP,
    };

    Object.entries(maps).forEach(([mapName, map]) => {
      Object.entries(map).forEach(([key, value]) => {
        const info = value as { label: string; color: string };
        expect(info.label, `${mapName}.${key}.label`).toBeTruthy();
        expect(info.color, `${mapName}.${key}.color`).toBeTruthy();
      });
    });
  });

  it('维保周期映射给出正确的周期天数', () => {
    expect(MAINTENANCE_CYCLE_MAP.daily.days).toBe(1);
    expect(MAINTENANCE_CYCLE_MAP.weekly.days).toBe(7);
    expect(MAINTENANCE_CYCLE_MAP.monthly.days).toBe(30);
  });

  it('维保周期下拉选项与映射表一一对应', () => {
    expect(MAINTENANCE_CYCLE_OPTIONS).toHaveLength(
      Object.keys(MAINTENANCE_CYCLE_MAP).length,
    );
    MAINTENANCE_CYCLE_OPTIONS.forEach((option) => {
      expect(MAINTENANCE_CYCLE_MAP[option.value]).toBeDefined();
      expect(option.label).toBe(MAINTENANCE_CYCLE_MAP[option.value].label);
    });
  });
});
