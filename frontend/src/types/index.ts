/**
 * MES 系统 - 业务实体类型定义
 * 与后端 Prisma Schema 字段一一对应
 */

// ==================== 系统设置模块 ====================

/**
 * 用户实体
 */
export interface UserInfo {
  id: number;
  username: string;
  name: string;
  department: string;
  status: boolean;
  createdAt: string;
  updatedAt: string;
  roles?: Role[];
}

/**
 * 角色实体
 */
export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  status: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: Permission[];
}

/**
 * 权限实体
 */
export interface Permission {
  id: number;
  name: string;
  code: string;
  type: 'menu' | 'button';
  parentId: number | null;
  path: string;
  sort: number;
  children?: Permission[];
}

/**
 * 车间实体
 */
export interface Workshop {
  id: number;
  name: string;
  code: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 生产管理模块 ====================

/**
 * 工单状态枚举
 */
export type WorkOrderStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'closed';

/**
 * 工单优先级枚举
 */
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * 工单实体
 */
export interface WorkOrder {
  id: number;
  orderNo: string;
  productName: string;
  productCode: string;
  quantity: number;
  completedQty: number;
  defectQty: number;
  status: WorkOrderStatus;
  workshopId: number;
  priority: WorkOrderPriority;
  planStart: string | null;
  planEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  remark: string;
  createdAt: string;
  updatedAt: string;
  workshop?: Workshop;
}

/**
 * 报工记录实体
 */
export interface ProductionReport {
  id: number;
  workOrderId: number;
  completedQty: number;
  defectQty: number;
  operatorId: number;
  reportTime: string;
  remark: string;
  operator?: UserInfo;
}

/**
 * 工单状态流转日志
 */
export interface WorkOrderStatusLog {
  id: number;
  workOrderId: number;
  fromStatus: WorkOrderStatus;
  toStatus: WorkOrderStatus;
  operatorId: number;
  changedAt: string;
  remark: string;
  operator?: UserInfo;
}

// ==================== 设备管理模块 ====================

/**
 * 设备状态枚举
 */
export type EquipmentStatus = 'running' | 'idle' | 'stopped' | 'fault';

/**
 * 设备实体
 */
export interface Equipment {
  id: number;
  code: string;
  name: string;
  type: string;
  location: string;
  status: EquipmentStatus;
  workshopId: number;
  manufacturer: string;
  model: string;
  purchaseDate: string | null;
  remark: string;
  createdAt: string;
  updatedAt: string;
  workshop?: Workshop;
}

/**
 * 设备状态变更日志
 */
export interface EquipmentStatusLog {
  id: number;
  equipmentId: number;
  oldStatus: EquipmentStatus;
  newStatus: EquipmentStatus;
  changedById: number;
  changedAt: string;
  remark: string;
  changedBy?: UserInfo;
}

/**
 * 维保周期类型枚举（P1）
 */
export type MaintenanceCycleType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * 维保类型枚举（P1）
 */
export type MaintenanceType = 'preventive' | 'corrective' | 'emergency';

/**
 * 维保计划状态枚举（P1）
 */
export type MaintenancePlanStatus = 'active' | 'inactive';

/**
 * 维保计划实体（P1）
 */
export interface MaintenancePlan {
  id: number;
  equipmentId: number;
  planName: string;
  cycleType: MaintenanceCycleType;
  cycleDays: number;
  nextDate: string;
  status: MaintenancePlanStatus;
  createdAt: string;
  updatedAt: string;
  /** 关联设备（列表接口返回） */
  equipment?: Equipment;
  /** 是否已到期（nextDate <= 当前时间），后端派生字段 */
  isDue?: boolean;
  /** 是否即将到期（nextDate <= 当前时间 + 7 天），后端派生字段 */
  dueSoon?: boolean;
  /** 逾期天数（到期提醒接口返回，未逾期为 0） */
  overdueDays?: number;
}

/**
 * 维保记录实体（P1）
 */
export interface MaintenanceRecord {
  id: number;
  /** 关联维保计划（可选，为空表示临时保养，不顺延任何计划） */
  planId: number | null;
  equipmentId: number;
  maintenanceType: MaintenanceType;
  /** 维保人员 ID（可为空） */
  maintainerId: number | null;
  startTime: string;
  endTime: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  plan?: MaintenancePlan;
  equipment?: Equipment;
  maintainer?: UserInfo;
}

/**
 * 故障维修记录实体（P1）
 * 待维修判定：repairedAt === null
 */
export interface BreakdownRecord {
  id: number;
  equipmentId: number;
  faultType: string;
  faultDescription: string;
  occurredAt: string;
  repairedAt: string | null;
  repairerId: number | null;
  repairMethod: string;
  /** 故障停机时长（分钟，服务端计算） */
  downtimeDuration: number;
  createdAt: string;
  updatedAt: string;
  equipment?: Equipment;
  repairer?: UserInfo;
}

/**
 * 故障统计结果（P1）
 */
export interface BreakdownStatistics {
  /** 故障频次 TopN 设备 */
  topFaultEquipments: Array<{
    equipmentId: number;
    equipmentCode: string;
    equipmentName: string;
    faultCount: number;
    totalDowntime: number;
  }>;
  /** 累计停机时长（分钟） */
  totalDowntime: number;
  /** 按故障类型分布 */
  byFaultType: Array<{
    faultType: string;
    count: number;
    totalDowntime: number;
  }>;
}

// ==================== 质量管理模块 ====================

/**
 * 检验结果枚举
 */
export type InspectionResult = 'pass' | 'fail' | 'concession';

/**
 * 质量检验记录实体
 */
export interface QualityInspection {
  id: number;
  workOrderId: number;
  inspectionType: string;
  inspectorId: number;
  inspectionTime: string;
  result: InspectionResult;
  remark: string;
  workOrder?: WorkOrder;
  inspector?: UserInfo;
  items?: InspectionItem[];
}

/**
 * 检验项明细实体
 */
export interface InspectionItem {
  id: number;
  inspectionId: number;
  itemName: string;
  standardValue: string;
  actualValue: string;
  unit: string;
  result: InspectionResult;
  remark: string;
}

/**
 * 不良处理方式枚举
 */
export type DefectHandlingMethod = 'rework' | 'scrap' | 'concession';

/**
 * 不良品记录实体
 */
export interface DefectRecord {
  id: number;
  workOrderId: number;
  equipmentId: number | null;
  defectType: string;
  defectReason: string;
  quantity: number;
  handlingMethod: DefectHandlingMethod | null;
  handledBy: number | null;
  handledAt: string | null;
  remark: string;
  workOrder?: WorkOrder;
  equipment?: Equipment;
  handler?: UserInfo;
}

// ==================== 物料管理模块 ====================

/**
 * 物料类型枚举
 */
export type MaterialType = 'raw' | 'semi' | 'finished';

/**
 * 物料主数据实体
 */
export interface Material {
  id: number;
  code: string;
  name: string;
  specification: string;
  unit: string;
  category: string;
  type: MaterialType;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * BOM 实体
 */
export interface BOM {
  id: number;
  productCode: string;
  productName: string;
  version: string;
  status: boolean;
  remark: string;
  createdAt: string;
  updatedAt: string;
  items?: BOMItem[];
}

/**
 * BOM 明细实体
 */
export interface BOMItem {
  id: number;
  bomId: number;
  materialId: number;
  quantity: number;
  unit: string;
  remark: string;
  material?: Material;
}

/**
 * 库存实体
 */
export interface Inventory {
  id: number;
  materialId: number;
  warehouse: string;
  location: string;
  quantity: number;
  safetyStock: number;
  maxStock: number;
  material?: Material;
}

/**
 * 出入库类型枚举
 */
export type TransactionType = 'in' | 'out';

/**
 * 出入库记录实体
 */
export interface InventoryTransaction {
  id: number;
  materialId: number;
  transactionType: TransactionType;
  quantity: number;
  batchNo: string;
  operatorId: number;
  transactionTime: string;
  relatedOrder: string;
  remark: string;
  material?: Material;
  operator?: UserInfo;
}

/**
 * 批次状态枚举（P1）
 * P1.0 由手工维护，自动过期需补充保质期字段（P1.1）
 */
export type BatchStatus = 'active' | 'consumed' | 'expired';

/**
 * 物料批次实体（P1）
 */
export interface MaterialBatch {
  id: number;
  materialId: number;
  batchNo: string;
  supplier: string;
  receivedDate: string;
  quantity: number;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  material?: Material;
}

/**
 * 库存预警等级（P1）
 * critical：quantity <= 0 或 quantity < safetyStock * 0.5
 * warning ：quantity < safetyStock
 */
export type WarningLevel = 'critical' | 'warning';

/**
 * 库存预警项（P1）
 */
export interface InventoryWarningItem extends Inventory {
  /** 缺口量 = safetyStock - quantity */
  shortage: number;
  /** 缺口比例 = shortage / safetyStock */
  shortageRatio: number;
  /** 预警等级 */
  level: WarningLevel;
}

/**
 * 批次正向追溯结果（批次 → 去向工单，P1）
 */
export interface BatchTraceForwardResult {
  batch: MaterialBatch | null;
  usages: Array<{
    relatedOrder: string;
    quantity: number;
    transactionTime: string;
  }>;
}

/**
 * 批次反向追溯结果（工单 → 来源批次，P1）
 */
export interface BatchTraceBackwardResult {
  batches: Array<{
    batchNo: string;
    materialCode: string;
    materialName: string;
    supplier: string;
    receivedDate: string;
    quantity: number;
  }>;
}

// ==================== 人员管理模块（P1） ====================

/**
 * 班次实体
 */
export interface Shift {
  id: number;
  name: string;
  /** 开始时间 HH:mm */
  startTime: string;
  /** 结束时间 HH:mm（早于 startTime 表示跨夜班次） */
  endTime: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 人员排班实体
 */
export interface PersonnelSchedule {
  id: number;
  userId: number;
  shiftId: number;
  workStation: string;
  scheduleDate: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
  user?: UserInfo;
  shift?: Shift;
}

/**
 * 排班日历单元格（P1）
 */
export interface ScheduleCalendarCell {
  date: string;
  items: Array<{
    id: number;
    userId: number;
    userName: string;
    shiftId: number;
    shiftName: string;
    shiftTimeRange: string;
    workStation: string;
  }>;
}

/**
 * 工时记录实体
 */
export interface WorkHoursRecord {
  id: number;
  /** 操作员 ID（可为空，汇总时归入「未指定」） */
  userId: number | null;
  workOrderId: number;
  /** 班次 ID（可为空，汇总时归入「未指定」） */
  shiftId: number | null;
  workDate: string;
  startTime: string;
  endTime: string | null;
  /** 工时（小时，服务端计算；endTime 为空时为 0） */
  hours: number;
  createdAt: string;
  updatedAt: string;
  user?: UserInfo;
  workOrder?: WorkOrder;
  shift?: Shift;
}

/**
 * 工时汇总行（P1）
 */
export interface WorkHoursSummaryRow {
  dimensionKey: string;
  dimensionName: string;
  totalHours: number;
  recordCount: number;
  /** 按人员维度：参与工单数 */
  workOrderCount?: number;
  /** 按人员维度：日均工时 */
  avgHoursPerDay?: number;
  /** 按班次维度：平均单条时长 */
  avgHoursPerRecord?: number;
  /** 按班次维度：涉及人数 */
  userCount?: number;
  /** 按工单维度：单位产品工时 */
  hoursPerUnit?: number;
}

/**
 * 工时效率行（P1）
 */
export interface WorkHoursEfficiencyRow {
  userName: string;
  totalHours: number;
  totalOutput: number;
  outputPerHour: number;
}

/**
 * 排程状态枚举（P1）
 */
export type ScheduleStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

/**
 * 排程冲突项（P1）
 */
export interface ScheduleConflict {
  id: number;
  workOrder?: { orderNo: string; productName: string };
  plannedStart: string;
  plannedEnd: string;
}

/**
 * 甘特图任务（自绘甘特数据结构，架构文档 §8.5）
 */
export interface GanttTask {
  id: number;
  workOrderId: number;
  orderNo: string;
  productName: string;
  equipmentId: number | null;
  equipmentCode: string;
  /** ISO 字符串 */
  plannedStart: string;
  /** ISO 字符串 */
  plannedEnd: string;
  status: ScheduleStatus;
  /** 冲突的其他排程 id（用于红色高亮） */
  conflicts?: number[];
}

/**
 * 甘特图行（按设备分组）
 */
export interface GanttRow {
  equipmentId: number;
  label: string;
  tasks: GanttTask[];
}

// ==================== 看板模块 ====================

/**
 * 看板总览数据
 * 【P1 扩展 I7】新增 maintenanceDueCount（待维保数量）
 */
export interface DashboardOverview {
  productionProgress: number;
  equipmentStatus: {
    running: number;
    idle: number;
    stopped: number;
    fault: number;
    total: number;
  };
  outputToday: number;
  defectRate: number;
  lowStockCount: number;
  /** 待维保数量（P1 新增，T07 后端提供；未实现时前端按 0 兜底） */
  maintenanceDueCount: number;
}

/**
 * 看板工单进度项
 */
export interface DashboardProgressItem {
  orderNo: string;
  productName: string;
  completedQty: number;
  quantity: number;
  progress: number;
}

/**
 * 看板设备状态汇总
 */
export interface DashboardEquipmentStatus {
  running: number;
  idle: number;
  stopped: number;
  fault: number;
  total: number;
  details: Array<{
    id: number;
    code: string;
    name: string;
    status: EquipmentStatus;
  }>;
}

/**
 * 看板产量趋势
 */
export interface DashboardOutputTrend {
  dates: string[];
  outputs: number[];
  defects: number[];
}

/**
 * 看板质量摘要
 */
export interface DashboardQualitySummary {
  totalOutput: number;
  defectCount: number;
  defectRate: number;
  passRate: number;
}

// ==================== 报表中心模块（P1） ====================

/**
 * OEE 汇总指标（P1-05）
 * 三分量与 OEE 均为百分数（2 位小数）；无数据分量为 null（前端展示 '-'）
 */
export interface OeeMetrics {
  /** 时间稼动率（%） */
  availability: number | null;
  /** 性能稼动率（%，已按 1 截断，>1 时明细标注「超产」） */
  performance: number | null;
  /** 良品率（%） */
  quality: number | null;
  /** OEE = A × P × Q（%） */
  oee: number | null;
  /** 计划生产时间（小时） */
  plannedTime: number;
  /** 停机时间（小时） */
  downtime: number;
  /** 实际产量 */
  actualQty: number;
  /** 理论产量（基于计划数据估算） */
  theoreticalQty: number;
  /** 良品数 */
  goodQty: number;
  /** 是否数据不足（分母为 0 等） */
  insufficientData: boolean;
}

/**
 * OEE 趋势点（P1-05）
 */
export interface OeeTrendPoint {
  date: string;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
}

/**
 * OEE 明细行（设备 × 班次，P1-05）
 */
export interface OeeDetailItem {
  equipmentId: number | null;
  equipmentCode: string;
  equipmentName: string;
  shiftId: number | null;
  shiftName: string;
  plannedTime: number;
  downtime: number;
  availability: number | null;
  actualQty: number;
  theoreticalQty: number;
  performance: number | null;
  completedQty: number;
  defectQty: number;
  quality: number | null;
  oee: number | null;
  /** 是否超产（performance > 1 被截断） */
  overProduced: boolean;
}

/**
 * 生产报表行（P1-06）
 */
export interface ProductionReportRow {
  period: string;
  orderCount: number;
  plannedQty: number;
  completedQty: number;
  defectQty: number;
  /** 达成率（%） */
  achieveRate: number | null;
  /** 不良率（%） */
  defectRate: number | null;
}

/**
 * 质量报表结果（P1-06）
 */
export interface QualityReportResult {
  list: Array<{
    period: string;
    inspectionCount: number;
    passCount: number;
    failCount: number;
    concessionCount: number;
    passRate: number | null;
  }>;
  /** 整体合格率（%） */
  passRate: number | null;
  /** 不良 TopN */
  defectTop: Array<{
    defectType: string;
    quantity: number;
    ratio: number;
  }>;
  /** 处理方式分布 */
  handlingDist: Array<{
    handlingMethod: string;
    quantity: number;
  }>;
}

/**
 * 库存报表结果（P1-06）
 */
export interface InventoryReportResult {
  list: Array<{
    materialCode: string;
    materialName: string;
    specification: string;
    unit: string;
    category: string;
    warehouse: string;
    location: string;
    quantity: number;
    safetyStock: number;
    maxStock: number;
  }>;
  warnings: InventoryWarningItem[];
}

// ==================== 质量追溯模块（P1-04） ====================

/**
 * 追溯链路 - 物料来源段
 */
export interface TraceMaterialItem {
  batchNo: string;
  materialCode: string;
  materialName: string;
  supplier: string;
  receivedDate: string;
  quantity: number;
  transactionType: TransactionType;
  quantityUsed: number;
  relatedOrder: string;
}

/**
 * 追溯链路 - 生产执行段（报工 + 人员 + 工时）
 */
export interface TraceExecutionItem {
  reportTime: string;
  completedQty: number;
  defectQty: number;
  operatorName: string;
  workDate: string;
  hours: number;
  shiftName: string;
}

/**
 * 追溯链路 - 设备与排程段
 */
export interface TraceEquipmentItem {
  equipmentCode: string;
  equipmentName: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  breakdown: Array<{
    occurredAt: string;
    faultType: string;
    faultDescription: string;
    repairedAt: string | null;
    downtimeDuration: number;
  }>;
}

/**
 * 追溯链路 - 检验段
 */
export interface TraceQualityItem {
  inspectionType: string;
  inspectionTime: string;
  inspectorName: string;
  result: InspectionResult;
  items: Array<{
    itemName: string;
    standardValue: string;
    actualValue: string;
    unit: string;
    result: InspectionResult;
  }>;
}

/**
 * 追溯链路 - 不良品段
 */
export interface TraceDefectItem {
  defectType: string;
  defectReason: string;
  quantity: number;
  handlingMethod: DefectHandlingMethod | null;
  handledByName: string;
  handledAt: string | null;
  equipmentCode: string;
}

/**
 * 单工单完整追溯链路（P1-04）
 */
export interface TraceChain {
  workOrder: {
    id: number;
    orderNo: string;
    productName: string;
    quantity: number;
    completedQty: number;
    defectQty: number;
    status: WorkOrderStatus;
    planStart: string | null;
    planEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
  };
  materialChain: TraceMaterialItem[];
  executionChain: TraceExecutionItem[];
  equipmentChain: TraceEquipmentItem[];
  qualityChain: TraceQualityItem[];
  defectChain: TraceDefectItem[];
}

/**
 * 追溯接口响应（工单维度 entries 长度 1；批次维度可能多条）
 */
export interface TraceabilityResult {
  entries: TraceChain[];
}

