/**
 * MES 系统 - 常量定义
 * 包含：状态枚举映射、标签颜色、路由路径、菜单配置
 */

import type {
  WorkOrderStatus,
  WorkOrderPriority,
  EquipmentStatus,
  InspectionResult,
  DefectHandlingMethod,
  TransactionType,
  ScheduleStatus,
  MaintenanceCycleType,
  MaintenanceType,
  MaintenancePlanStatus,
  WarningLevel,
  BatchStatus,
} from '@/types';

// ==================== 状态枚举映射 ====================

/** 工单状态映射：value -> { label, color } */
export const WORK_ORDER_STATUS_MAP: Record<
  WorkOrderStatus,
  { label: string; color: string }
> = {
  pending: { label: '待开始', color: 'default' },
  in_progress: { label: '进行中', color: 'processing' },
  paused: { label: '已暂停', color: 'warning' },
  completed: { label: '已完成', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
};

/** 工单优先级映射 */
export const WORK_ORDER_PRIORITY_MAP: Record<
  WorkOrderPriority,
  { label: string; color: string }
> = {
  low: { label: '低', color: 'default' },
  medium: { label: '中', color: 'processing' },
  high: { label: '高', color: 'warning' },
  urgent: { label: '紧急', color: 'error' },
};

/** 设备状态映射 */
export const EQUIPMENT_STATUS_MAP: Record<
  EquipmentStatus,
  { label: string; color: string }
> = {
  running: { label: '运行', color: 'success' },
  idle: { label: '待机', color: 'default' },
  stopped: { label: '停机', color: 'warning' },
  fault: { label: '故障', color: 'error' },
};

/** 检验结果映射 */
export const INSPECTION_RESULT_MAP: Record<
  InspectionResult,
  { label: string; color: string }
> = {
  pass: { label: '合格', color: 'success' },
  fail: { label: '不合格', color: 'error' },
  concession: { label: '让步接收', color: 'warning' },
};

/** 不良处理方式映射 */
export const DEFECT_HANDLING_MAP: Record<
  DefectHandlingMethod,
  { label: string; color: string }
> = {
  rework: { label: '返工', color: 'processing' },
  scrap: { label: '报废', color: 'error' },
  concession: { label: '让步', color: 'warning' },
};

/** 出入库类型映射 */
export const TRANSACTION_TYPE_MAP: Record<
  TransactionType,
  { label: string; color: string }
> = {
  in: { label: '入库', color: 'success' },
  out: { label: '出库', color: 'error' },
};

/** 物料类型映射 */
export const MATERIAL_TYPE_MAP: Record<
  string,
  { label: string; color: string }
> = {
  raw: { label: '原材料', color: 'default' },
  semi: { label: '半成品', color: 'processing' },
  finished: { label: '成品', color: 'success' },
};

// ==================== 工单状态流转规则 ====================

/** 工单状态流转允许的目标状态映射（状态机） */
export const WORK_ORDER_STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pending: ['in_progress', 'closed'],
  in_progress: ['paused', 'completed', 'closed'],
  paused: ['in_progress', 'closed'],
  completed: ['closed'],
  closed: [],
};

// ==================== P1 新增枚举映射 ====================

/**
 * 排程状态映射（P1-01）
 * 流转：planned → in_progress → completed / cancelled
 */
export const SCHEDULE_STATUS_MAP: Record<
  ScheduleStatus,
  { label: string; color: string }
> = {
  planned: { label: '已计划', color: 'default' },
  in_progress: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
};

/** 排程状态流转允许的目标状态映射（状态机，与后端一致） */
export const SCHEDULE_STATUS_TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** 甘特图条块颜色（按排程状态） */
export const GANTT_BAR_COLOR_MAP: Record<ScheduleStatus, string> = {
  planned: '#1677ff',
  in_progress: '#52c41a',
  completed: '#8c8c8c',
  cancelled: '#d9d9d9',
};

/**
 * 维保周期类型映射（P1-02）
 * 周期天数口径：daily=1 / weekly=7 / monthly=30 / quarterly=90 / yearly=365
 */
export const MAINTENANCE_CYCLE_MAP: Record<
  MaintenanceCycleType,
  { label: string; color: string; days: number }
> = {
  daily: { label: '每日', color: 'default', days: 1 },
  weekly: { label: '每周', color: 'processing', days: 7 },
  monthly: { label: '每月', color: 'blue', days: 30 },
  quarterly: { label: '每季', color: 'purple', days: 90 },
  yearly: { label: '每年', color: 'gold', days: 365 },
};

/** 维保周期下拉选项 */
export const MAINTENANCE_CYCLE_OPTIONS = (
  Object.keys(MAINTENANCE_CYCLE_MAP) as MaintenanceCycleType[]
).map((value) => ({
  value,
  label: MAINTENANCE_CYCLE_MAP[value].label,
}));

/**
 * 维保类型映射（P1-02）
 */
export const MAINTENANCE_TYPE_MAP: Record<
  MaintenanceType,
  { label: string; color: string }
> = {
  preventive: { label: '预防性维保', color: 'processing' },
  corrective: { label: '纠正性维保', color: 'warning' },
  emergency: { label: '紧急维保', color: 'error' },
};

/** 维保类型下拉选项 */
export const MAINTENANCE_TYPE_OPTIONS = (
  Object.keys(MAINTENANCE_TYPE_MAP) as MaintenanceType[]
).map((value) => ({
  value,
  label: MAINTENANCE_TYPE_MAP[value].label,
}));

/**
 * 维保计划状态映射（P1-02）
 */
export const MAINTENANCE_PLAN_STATUS_MAP: Record<
  MaintenancePlanStatus,
  { label: string; color: string }
> = {
  active: { label: '启用', color: 'success' },
  inactive: { label: '停用', color: 'default' },
};

/**
 * 故障影响等级映射（P1-03）
 * 口径：按停机时长（分钟）分档，用于故障列表的严重度提示
 */
export const BREAKDOWN_LEVEL_MAP: Record<
  'minor' | 'moderate' | 'severe',
  { label: string; color: string; minMinutes: number }
> = {
  minor: { label: '轻微', color: 'default', minMinutes: 0 },
  moderate: { label: '一般', color: 'warning', minMinutes: 30 },
  severe: { label: '严重', color: 'error', minMinutes: 180 },
};

/** 按停机时长推导故障影响等级 */
export function getBreakdownLevel(downtimeMinutes: number): 'minor' | 'moderate' | 'severe' {
  if (downtimeMinutes >= BREAKDOWN_LEVEL_MAP.severe.minMinutes) {
    return 'severe';
  }
  if (downtimeMinutes >= BREAKDOWN_LEVEL_MAP.moderate.minMinutes) {
    return 'moderate';
  }
  return 'minor';
}

/**
 * 库存预警等级映射（P1-08）
 * critical：quantity <= 0 或 quantity < safetyStock * 0.5
 * warning ：quantity < safetyStock
 */
export const WARNING_LEVEL_MAP: Record<
  WarningLevel,
  { label: string; color: string }
> = {
  critical: { label: '严重缺料', color: 'error' },
  warning: { label: '库存预警', color: 'warning' },
};

/**
 * 批次状态映射（P1-07）
 */
export const BATCH_STATUS_MAP: Record<
  BatchStatus,
  { label: string; color: string }
> = {
  active: { label: '正常', color: 'success' },
  consumed: { label: '已用完', color: 'default' },
  expired: { label: '已过期', color: 'error' },
};

/** OEE 等报表无数据时的占位符（避免展示 NaN / Infinity） */
export const NULL_PLACEHOLDER = '-';

// ==================== 路由路径常量 ====================

export const ROUTE_PATHS = {
  // 认证
  LOGIN: '/login',
  // 看板
  DASHBOARD: '/dashboard',
  // 生产管理
  PRODUCTION_ORDERS: '/production/orders',
  PRODUCTION_ORDER_DETAIL: '/production/orders/:id',
  // 设备管理
  EQUIPMENT_LIST: '/equipment/list',
  EQUIPMENT_DETAIL: '/equipment/:id',
  // 质量管理
  QUALITY_INSPECTION: '/quality/inspection',
  QUALITY_DEFECTS: '/quality/defects',
  // 物料管理
  MATERIAL_ITEMS: '/material/items',
  MATERIAL_BOM: '/material/bom',
  MATERIAL_INVENTORY: '/material/inventory',
  // 系统设置
  SYSTEM_USERS: '/system/users',
  SYSTEM_ROLES: '/system/roles',
  SYSTEM_SETTINGS: '/system/settings',

  // ==================== P1 新增路由（T06 注册） ====================
  // 生产管理
  PRODUCTION_SCHEDULE: '/production/schedule',
  // 设备管理
  EQUIPMENT_MAINTENANCE: '/equipment/maintenance',
  EQUIPMENT_BREAKDOWN: '/equipment/breakdown',
  // 质量管理
  QUALITY_TRACEABILITY: '/quality/traceability',
  // 物料管理
  MATERIAL_BATCHES: '/material/batches',
  MATERIAL_TRACE: '/material/trace',
  MATERIAL_INVENTORY_WARNING: '/material/inventory-warning',
  // 人员管理（P1 新增顶级菜单）
  PERSONNEL_SHIFTS: '/personnel/shifts',
  PERSONNEL_SCHEDULE: '/personnel/schedule',
  PERSONNEL_WORK_HOURS: '/personnel/work-hours',
  // 报表中心（P1 新增顶级菜单）
  REPORTS_OEE: '/reports/oee',
  REPORTS_PRODUCTION: '/reports/production',
} as const;

// ==================== 通用常量 ====================

/** 默认分页大小 */
export const DEFAULT_PAGE_SIZE = 20;

/** 分页大小选项 */
export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];

/**
 * 下拉选项「取全量」时的分页大小
 * 口径说明：后端分页校验器 pageSize 上限为 max(100)，
 *          传 200 会直接返回 400「参数校验失败」。
 *          所有用于下拉框（人员/设备/工单等）的选项查询统一使用本常量，避免魔法数字再次越界。
 */
export const DROPDOWN_PAGE_SIZE = 100;

/** Token 在 localStorage 中的键名 */
export const STORAGE_KEYS = {
  TOKEN: 'mes_token',
  REFRESH_TOKEN: 'mes_refresh_token',
  USER: 'mes_user',
  PERMISSIONS: 'mes_permissions',
  /** Zustand persist 持久化键名（authStore 使用） */
  AUTH_STORE: 'mes-auth-store',
} as const;

/** 看板数据刷新间隔（毫秒，30 秒） */
export const DASHBOARD_REFRESH_INTERVAL = 30 * 1000;
