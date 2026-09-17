/**
 * MES 系统 - 报表中心服务层【T10 实现】
 *
 * OEE 计算口径（架构文档 §8.1 为唯一权威定义）：
 *  plannedTime  = Σ ProductionSchedule（status ≠ cancelled，与查询区间取交集）时长
 *  downtime     = EquipmentStatusLog 成对推导（stopped/fault 起 → 下一条非停机态止；未闭合以 rangeEnd 为止）
 *  availability = (plannedTime - downtime) / plannedTime            // 分母 0 → null
 *  tactTime     = WorkOrder.quantity / (planEnd - planStart) 小时数   // 无计划时间工单不参与
 *  theoreticalQty = Σ（排程切片时长 / tactTime）
 *  performance  = min(actualQty / theoreticalQty, 1)                // >1 截断并标注「超产」
 *  quality      = (completedQty - defectQty) / completedQty          // 分母 0 → null
 *  oee          = availability × performance × quality              // 任一分量 null → 整体 null
 *  所有比率保留 2 位小数；trend 分桶后桶内重算，不做桶间平均
 *
 * 班次维度说明（PRD Q5）：ProductionSchedule 未关联 Shift，班次归属需对排程时段做
 * 时间窗切片（P1 未实现），因此明细按「设备」分组，shiftId/shiftName 统一返回
 * null / '全部班次'（保留字段结构，P1.1 实现切片后填充）。
 *
 * 导出约定（架构文档 §8.4）：构建 Excel 走 utils/excel.js，行数上限 10000（超出 400），
 * 成功响应不走 JSON 包装，由 controller 直接写二进制。
 */

const { prisma } = require('../config/database');
const {
  MAX_EXPORT_ROWS,
  assertRowLimit,
  createWorkbookWriter,
  writeSheet,
  createHttpError,
} = require('../utils/excel');
const { evaluateWarning } = require('./material.service');
const { getWorkHoursSummary } = require('./personnel.service');

// ==================== 通用工具 ====================

/** 保留 2 位小数 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

const pad2 = (value) => String(value).padStart(2, '0');

/** 格式化日期为 YYYY-MM-DD（本地时区） */
function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 当日零点（本地时区） */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 增加 n 天（不修改原对象） */
function addDays(date, n) {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

/** 所在周的周一（周起始口径：周一） */
function mondayOf(date) {
  const day = (startOfDay(date).getDay() + 6) % 7; // 周日=6
  return addDays(startOfDay(date), -day);
}

/**
 * 解析 YYYY-MM-DD 为本地零点日期
 * @param {string} value - 日期字符串
 * @param {string} fieldName - 字段名（错误提示用）
 * @returns {Date} 本地零点
 */
function parseLocalDate(value, fieldName) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) {
    throw createHttpError(`${fieldName} 格式应为 YYYY-MM-DD`, 400);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * 解析查询区间
 * @param {object} query - { startDate?, endDate? }（YYYY-MM-DD，含头含尾）
 * @param {number} [defaultDays] - 未传时的默认区间天数
 * @returns {{rangeStart: Date, rangeEnd: Date}} [rangeStart, rangeEnd) 左闭右开
 */
function parseRange(query, defaultDays = 7) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const rangeStart = query.startDate
    ? parseLocalDate(query.startDate, 'startDate')
    : addDays(todayStart, -(defaultDays - 1));
  const rangeEnd = query.endDate
    ? addDays(parseLocalDate(query.endDate, 'endDate'), 1)
    : addDays(todayStart, 1);

  if (rangeStart >= rangeEnd) {
    throw createHttpError('startDate 不能晚于 endDate', 400);
  }
  return { rangeStart, rangeEnd };
}

// ==================== OEE 核心（§8.1 口径） ====================

/** 停机状态集合（开启停机区间） */
const DOWNTIME_STATES = new Set(['stopped', 'fault']);
/** 运行状态集合（闭合停机区间） */
const UPTIME_STATES = new Set(['running', 'idle']);

/**
 * 由设备状态日志成对推导停机区间（架构文档 §8.1 ②~⑤）
 * @param {Array<{newStatus: string, changedAt: Date|string}>} logs - 单设备日志（changedAt 升序）
 * @param {Date} rangeStart - 查询区间起点
 * @param {Date} rangeEnd - 查询区间终点
 * @returns {Array<[Date, Date]>} 与查询区间取交集后的停机区间列表
 */
function deriveDowntimeSegments(logs, rangeStart, rangeEnd) {
  const segments = [];
  let openStart = null;

  for (const log of logs) {
    const changedAt = new Date(log.changedAt);
    if (DOWNTIME_STATES.has(log.newStatus)) {
      // 已在停机中（如 stopped → fault 连续停机）保持最早起点
      if (openStart === null) {
        openStart = changedAt;
      }
    } else if (UPTIME_STATES.has(log.newStatus)) {
      if (openStart !== null) {
        segments.push([openStart, changedAt]);
        openStart = null;
      }
    }
  }

  // 未闭合（查询区间末仍在停机）→ 以 rangeEnd 为终点
  if (openStart !== null) {
    segments.push([openStart, rangeEnd]);
  }

  // 与查询区间取交集
  return segments
    .map(([segStart, segEnd]) => [
      segStart < rangeStart ? rangeStart : segStart,
      segEnd > rangeEnd ? rangeEnd : segEnd,
    ])
    .filter(([segStart, segEnd]) => segEnd > segStart);
}

/**
 * 一次性拉取 OEE 计算的基础数据（summary / trend / details 共用，避免分桶重复查询）
 * @param {number[]|null} equipmentIds - 设备范围（null = 全部设备）
 * @param {Date} rangeStart - 查询区间起点
 * @param {Date} rangeEnd - 查询区间终点
 * @returns {Promise<object>} 基础数据集合
 */
async function fetchOeeBase(equipmentIds, rangeStart, rangeEnd) {
  const hasScope = Array.isArray(equipmentIds) && equipmentIds.length > 0;

  const scheduleWhere = {
    status: { not: 'cancelled' },
    plannedStart: { lt: rangeEnd },
    plannedEnd: { gt: rangeStart },
  };
  const logWhere = { changedAt: { lte: rangeEnd } };
  if (hasScope) {
    scheduleWhere.equipmentId = { in: equipmentIds };
    logWhere.equipmentId = { in: equipmentIds };
  }

  const [schedules, logs, reports, equipmentList] = await Promise.all([
    prisma.productionSchedule.findMany({
      where: scheduleWhere,
      include: {
        workOrder: {
          select: { id: true, quantity: true, planStart: true, planEnd: true },
        },
      },
      orderBy: [{ plannedStart: 'asc' }],
    }),
    prisma.equipmentStatusLog.findMany({
      where: logWhere,
      orderBy: [{ equipmentId: 'asc' }, { changedAt: 'asc' }],
      select: { equipmentId: true, newStatus: true, changedAt: true },
    }),
    prisma.productionReport.findMany({
      where: { reportTime: { gte: rangeStart, lt: rangeEnd } },
      select: {
        workOrderId: true,
        completedQty: true,
        defectQty: true,
        reportTime: true,
      },
    }),
    prisma.equipment.findMany({
      ...(hasScope ? { where: { id: { in: equipmentIds } } } : {}),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  // 停机区间按设备分组
  const logsByEquipment = new Map();
  for (const log of logs) {
    if (!logsByEquipment.has(log.equipmentId)) {
      logsByEquipment.set(log.equipmentId, []);
    }
    logsByEquipment.get(log.equipmentId).push(log);
  }
  const downtimeSegments = new Map();
  for (const [equipmentId, equipmentLogs] of logsByEquipment) {
    const segments = deriveDowntimeSegments(equipmentLogs, rangeStart, rangeEnd);
    if (segments.length > 0) {
      downtimeSegments.set(equipmentId, segments);
    }
  }

  // 工单 → 设备集合（报工无设备字段，经工单排程归属设备）
  const orderEquipmentMap = new Map();
  for (const schedule of schedules) {
    if (schedule.equipmentId === null) {
      continue;
    }
    if (!orderEquipmentMap.has(schedule.workOrderId)) {
      orderEquipmentMap.set(schedule.workOrderId, new Set());
    }
    orderEquipmentMap.get(schedule.workOrderId).add(schedule.equipmentId);
  }

  return { schedules, downtimeSegments, reports, equipmentList, orderEquipmentMap };
}

/**
 * 标准节拍（小时/件）= 计划工期 / 计划数量；无计划时间或数量非法 → null（该工单不参与理论产量）
 * @param {object} workOrder - { quantity, planStart, planEnd }
 * @returns {number|null} 节拍（小时/件）
 */
function getTactTimeHours(workOrder) {
  if (!workOrder.planStart || !workOrder.planEnd) {
    return null;
  }
  const durationHours =
    (new Date(workOrder.planEnd) - new Date(workOrder.planStart)) / 3600000;
  if (!(durationHours > 0) || !workOrder.quantity || workOrder.quantity <= 0) {
    return null;
  }
  return durationHours / workOrder.quantity;
}

/**
 * 在任意子区间上按 §8.1 口径计算 OEE 指标（桶内重算，不做桶间平均）
 * @param {object} base - fetchOeeBase 返回的基础数据
 * @param {Date} start - 子区间起点
 * @param {Date} end - 子区间终点
 * @param {number[]|null} equipmentIds - 设备范围
 * @returns {object} 指标集合（比率已转百分数并保留 2 位小数；无数据分量为 null）
 */
function computeMetricsInRange(base, start, end, equipmentIds) {
  const hasScope = Array.isArray(equipmentIds) && equipmentIds.length > 0;
  const scopeSet = hasScope ? new Set(equipmentIds) : null;

  // ---- 计划生产时间 + 理论产量（按排程切片与区间求交） ----
  let plannedTime = 0;
  let theoreticalQty = 0;

  for (const schedule of base.schedules) {
    if (
      scopeSet &&
      (schedule.equipmentId === null || !scopeSet.has(schedule.equipmentId))
    ) {
      continue;
    }
    const segStart =
      schedule.plannedStart < start ? start : schedule.plannedStart;
    const segEnd = schedule.plannedEnd > end ? end : schedule.plannedEnd;
    const hours = (segEnd - segStart) / 3600000;
    if (hours <= 0) {
      continue;
    }
    plannedTime += hours;
    const tact = getTactTimeHours(schedule.workOrder);
    if (tact !== null) {
      theoreticalQty += hours / tact;
    }
  }

  // ---- 停机时间（成对推导区间与子区间求交） ----
  let downtime = 0;
  for (const [equipmentId, segments] of base.downtimeSegments) {
    if (scopeSet && !scopeSet.has(equipmentId)) {
      continue;
    }
    for (const [segStart, segEnd] of segments) {
      const clippedStart = segStart < start ? start : segStart;
      const clippedEnd = segEnd > end ? end : segEnd;
      if (clippedEnd > clippedStart) {
        downtime += (clippedEnd - clippedStart) / 3600000;
      }
    }
  }

  // ---- 实际产量 / 良品数（报工按工单排程归属设备） ----
  let actualQty = 0;
  let completedQty = 0;
  let defectQty = 0;
  for (const report of base.reports) {
    const reportTime = new Date(report.reportTime);
    if (reportTime < start || reportTime >= end) {
      continue;
    }
    if (scopeSet) {
      const equipmentSet = base.orderEquipmentMap.get(report.workOrderId);
      const matched =
        equipmentSet &&
        Array.from(equipmentSet).some((id) => scopeSet.has(id));
      if (!matched) {
        continue;
      }
    }
    actualQty += report.completedQty;
    completedQty += report.completedQty;
    defectQty += report.defectQty;
  }

  // ---- 三分量 + OEE（分母 0 → null；performance 上限截断） ----
  const availability =
    plannedTime > 0 ? round2(((plannedTime - downtime) / plannedTime) * 100) : null;
  const performance =
    theoreticalQty > 0
      ? round2(Math.min(actualQty / theoreticalQty, 1) * 100)
      : null;
  const quality =
    completedQty > 0 ? round2(((completedQty - defectQty) / completedQty) * 100) : null;
  const oee =
    availability === null || performance === null || quality === null
      ? null
      : round2((availability / 100) * (performance / 100) * (quality / 100) * 100);

  return {
    availability,
    performance,
    quality,
    oee,
    plannedTime: round2(plannedTime),
    downtime: round2(downtime),
    actualQty,
    theoreticalQty: round2(theoreticalQty),
    completedQty,
    defectQty,
    goodQty: completedQty - defectQty,
    // 超产标注：未截断前 actualQty > theoreticalQty
    overProduced: theoreticalQty > 0 && actualQty > theoreticalQty,
    insufficientData:
      availability === null || performance === null || quality === null,
  };
}

/**
 * OEE 汇总
 * @param {object} query - { startDate?, endDate?, equipmentId?, shiftId? }
 * @returns {Promise<object>} { availability, performance, quality, oee, plannedTime, downtime, actualQty, theoreticalQty, goodQty, insufficientData }
 */
async function getOeeSummary(query) {
  const { rangeStart, rangeEnd } = parseRange(query, 7);
  const equipmentIds = query.equipmentId ? [Number(query.equipmentId)] : null;
  // shiftId 参数：排程未关联班次（PRD Q5），P1 未实现切片，参数保留但暂不参与过滤
  const base = await fetchOeeBase(equipmentIds, rangeStart, rangeEnd);
  const metrics = computeMetricsInRange(base, rangeStart, rangeEnd, equipmentIds);

  return {
    availability: metrics.availability,
    performance: metrics.performance,
    quality: metrics.quality,
    oee: metrics.oee,
    plannedTime: metrics.plannedTime,
    downtime: metrics.downtime,
    actualQty: metrics.actualQty,
    theoreticalQty: metrics.theoreticalQty,
    goodQty: metrics.goodQty,
    insufficientData: metrics.insufficientData,
  };
}

/**
 * 构建分桶（day / week / month，桶内与查询区间取交集）
 * @param {Date} rangeStart - 查询区间起点
 * @param {Date} rangeEnd - 查询区间终点
 * @param {string} dimension - day | week | month
 * @returns {Array<{start: Date, end: Date, label: string}>} 桶列表
 */
function buildBuckets(rangeStart, rangeEnd, dimension) {
  const buckets = [];

  if (dimension === 'month') {
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor < rangeEnd) {
      const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      buckets.push({
        start: cursor < rangeStart ? rangeStart : new Date(cursor),
        end: bucketEnd > rangeEnd ? rangeEnd : bucketEnd,
        label: `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`,
      });
      cursor = bucketEnd;
    }
  } else if (dimension === 'week') {
    let cursor = mondayOf(rangeStart);
    while (cursor < rangeEnd) {
      const bucketEnd = addDays(cursor, 7);
      buckets.push({
        start: cursor < rangeStart ? rangeStart : cursor,
        end: bucketEnd > rangeEnd ? rangeEnd : bucketEnd,
        label: formatDate(cursor),
      });
      cursor = bucketEnd;
    }
  } else {
    let cursor = startOfDay(rangeStart);
    while (cursor < rangeEnd) {
      const bucketEnd = addDays(cursor, 1);
      buckets.push({
        start: cursor < rangeStart ? rangeStart : cursor,
        end: bucketEnd > rangeEnd ? rangeEnd : bucketEnd,
        label: formatDate(cursor),
      });
      cursor = bucketEnd;
    }
  }

  return buckets;
}

/**
 * OEE 趋势（按 day / week / month 分桶，桶内重算公式）
 * @param {object} query - { startDate?, endDate?, dimension, equipmentId? }
 * @returns {Promise<{points: Array<{date, availability, performance, quality, oee}>}>}
 */
async function getOeeTrend(query) {
  const dimension = query.dimension || 'day';
  if (!['day', 'week', 'month'].includes(dimension)) {
    throw createHttpError('dimension 仅支持 day / week / month', 400);
  }

  const { rangeStart, rangeEnd } = parseRange(query, 7);
  const equipmentIds = query.equipmentId ? [Number(query.equipmentId)] : null;
  const base = await fetchOeeBase(equipmentIds, rangeStart, rangeEnd);

  const points = buildBuckets(rangeStart, rangeEnd, dimension).map((bucket) => {
    const metrics = computeMetricsInRange(
      base,
      bucket.start,
      bucket.end,
      equipmentIds,
    );
    return {
      date: bucket.label,
      availability: metrics.availability,
      performance: metrics.performance,
      quality: metrics.quality,
      oee: metrics.oee,
    };
  });

  return { points };
}

/**
 * OEE 明细（按设备分组，含超产标注；shift 字段保留，P1 未实现班次切片）
 * @param {object} query - { startDate?, endDate?, equipmentId?, page?, pageSize? }
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getOeeDetails(query) {
  const { rangeStart, rangeEnd } = parseRange(query, 7);
  const equipmentIds = query.equipmentId ? [Number(query.equipmentId)] : null;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 10));

  const base = await fetchOeeBase(equipmentIds, rangeStart, rangeEnd);

  const rows = base.equipmentList.map((equipment) => {
    const metrics = computeMetricsInRange(
      base,
      rangeStart,
      rangeEnd,
      [equipment.id],
    );
    return {
      equipmentId: equipment.id,
      equipmentCode: equipment.code,
      equipmentName: equipment.name,
      // 班次切片（PRD Q5）P1 未实现：统一「全部班次」
      shiftId: null,
      shiftName: '全部班次',
      plannedTime: metrics.plannedTime,
      downtime: metrics.downtime,
      availability: metrics.availability,
      actualQty: metrics.actualQty,
      theoreticalQty: metrics.theoreticalQty,
      performance: metrics.performance,
      completedQty: metrics.completedQty,
      defectQty: metrics.defectQty,
      quality: metrics.quality,
      oee: metrics.oee,
      overProduced: metrics.overProduced,
    };
  });

  rows.sort((a, b) => a.equipmentCode.localeCompare(b.equipmentCode));

  return {
    list: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
  };
}

// ==================== 生产报表（P1-06） ====================

/**
 * 生产报表（daily / weekly / monthly）
 * 口径：达成率 = 完成量 / 计划量；不良率 = 不良量 / 完成量（分母 0 → null）
 * @param {object} query - { type?, startDate?, endDate? }
 * @returns {Promise<{list: Array<{period, orderCount, plannedQty, completedQty, defectQty, achieveRate, defectRate}>}>}
 */
async function getProductionReport(query) {
  const type = query.type || 'daily';
  if (!['daily', 'weekly', 'monthly'].includes(type)) {
    throw createHttpError('type 仅支持 daily / weekly / monthly', 400);
  }

  const { rangeStart, rangeEnd } = parseRange(query, 30);

  const [orders, reports] = await Promise.all([
    prisma.workOrder.findMany({
      where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
      select: { quantity: true, createdAt: true },
    }),
    prisma.productionReport.findMany({
      where: { reportTime: { gte: rangeStart, lt: rangeEnd } },
      select: { completedQty: true, defectQty: true, reportTime: true },
    }),
  ]);

  const list = buildBuckets(rangeStart, rangeEnd, type).map((bucket) => {
    const bucketOrders = orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt >= bucket.start && createdAt < bucket.end;
    });
    const plannedQty = bucketOrders.reduce((sum, order) => sum + order.quantity, 0);

    let completedQty = 0;
    let defectQty = 0;
    for (const report of reports) {
      const reportTime = new Date(report.reportTime);
      if (reportTime >= bucket.start && reportTime < bucket.end) {
        completedQty += report.completedQty;
        defectQty += report.defectQty;
      }
    }

    return {
      period: bucket.label,
      orderCount: bucketOrders.length,
      plannedQty,
      completedQty,
      defectQty,
      achieveRate: plannedQty > 0 ? round2((completedQty / plannedQty) * 100) : null,
      defectRate: completedQty > 0 ? round2((defectQty / completedQty) * 100) : null,
    };
  });

  return { list };
}

// ==================== 质量报表（P1-06） ====================

/**
 * 质量报表（按日检验统计 + 整体合格率 + 不良 TopN + 处理方式分布）
 * @param {object} query - { startDate?, endDate? }
 * @returns {Promise<object>} { list, passRate, defectTop, handlingDist }
 */
async function getQualityReport(query) {
  const { rangeStart, rangeEnd } = parseRange(query, 30);

  const [inspections, defects] = await Promise.all([
    prisma.qualityInspection.findMany({
      where: { inspectionTime: { gte: rangeStart, lt: rangeEnd } },
      select: { result: true, inspectionTime: true },
    }),
    prisma.defectRecord.findMany({
      where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
      select: { defectType: true, quantity: true, handlingMethod: true },
    }),
  ]);

  // 按日汇总检验结果
  const list = buildBuckets(rangeStart, rangeEnd, 'day').map((bucket) => {
    let passCount = 0;
    let failCount = 0;
    let concessionCount = 0;
    for (const inspection of inspections) {
      const inspectionTime = new Date(inspection.inspectionTime);
      if (inspectionTime >= bucket.start && inspectionTime < bucket.end) {
        if (inspection.result === 'pass') passCount += 1;
        else if (inspection.result === 'fail') failCount += 1;
        else concessionCount += 1;
      }
    }
    const total = passCount + failCount + concessionCount;
    return {
      period: bucket.label,
      inspectionCount: total,
      passCount,
      failCount,
      concessionCount,
      passRate: total > 0 ? round2((passCount / total) * 100) : null,
    };
  });

  const totalInspections = inspections.length;
  const passTotal = inspections.filter((i) => i.result === 'pass').length;
  const passRate =
    totalInspections > 0 ? round2((passTotal / totalInspections) * 100) : null;

  // 不良类型 TopN
  const defectByType = new Map();
  let totalDefectQty = 0;
  for (const defect of defects) {
    defectByType.set(
      defect.defectType,
      (defectByType.get(defect.defectType) || 0) + defect.quantity,
    );
    totalDefectQty += defect.quantity;
  }
  const defectTop = Array.from(defectByType.entries())
    .map(([defectType, quantity]) => ({
      defectType,
      quantity,
      ratio: totalDefectQty > 0 ? round2((quantity / totalDefectQty) * 100) : 0,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // 处理方式分布（未处理 → '未处理'）
  const handlingByMethod = new Map();
  for (const defect of defects) {
    const method = defect.handlingMethod || '未处理';
    handlingByMethod.set(method, (handlingByMethod.get(method) || 0) + defect.quantity);
  }
  const handlingDist = Array.from(handlingByMethod.entries()).map(
    ([handlingMethod, quantity]) => ({ handlingMethod, quantity }),
  );

  return { list, passRate, defectTop, handlingDist };
}

// ==================== 库存报表（P1-06） ====================

/**
 * 库存报表（明细 + 预警清单，预警口径与 material.service.evaluateWarning 同源）
 * @param {object} query - { category?, warehouse? }
 * @returns {Promise<object>} { list, warnings }
 */
async function getInventoryReport(query) {
  const where = {};
  if (query.category) {
    where.material = { category: query.category };
  }
  if (query.warehouse) {
    where.warehouse = query.warehouse;
  }

  const inventories = await prisma.inventory.findMany({
    where,
    include: {
      material: {
        select: {
          code: true,
          name: true,
          specification: true,
          unit: true,
          category: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const list = inventories.map((inventory) => {
    const warning = evaluateWarning(inventory);
    return {
      materialCode: inventory.material?.code || '-',
      materialName: inventory.material?.name || '-',
      specification: inventory.material?.specification || '-',
      unit: inventory.material?.unit || '-',
      category: inventory.material?.category || '-',
      warehouse: inventory.warehouse,
      location: inventory.location,
      quantity: inventory.quantity,
      safetyStock: inventory.safetyStock,
      maxStock: inventory.maxStock,
      level: warning.level,
      isLowStock: warning.isLowStock,
    };
  });

  // 预警排序：critical 优先 → shortageRatio 倒序（§8.2 口径）
  const warnings = list
    .filter((item) => item.isLowStock)
    .map((item) => {
      const evaluated = evaluateWarning({
        quantity: item.quantity,
        safetyStock: item.safetyStock,
      });
      return { ...item, shortage: evaluated.shortage, shortageRatio: evaluated.shortageRatio };
    })
    .sort((a, b) => {
      if (a.level !== b.level) {
        return a.level === 'critical' ? -1 : 1;
      }
      return b.shortageRatio - a.shortageRatio;
    });

  return { list, warnings };
}

// ==================== 工时报表（P1-06 / P1-10） ====================

/**
 * 工时汇总报表（复用 T08 的 personnel.service.getWorkHoursSummary，避免双口径）
 * @param {object} query - { startDate?, endDate?, dimension? }
 * @returns {Promise<{list: Array, totalHours: number, recordCount: number}>}
 */
async function getWorkHoursReport(query) {
  return getWorkHoursSummary({
    startDate: query.startDate,
    endDate: query.endDate,
    dimension: query.dimension || 'user',
  });
}

/**
 * 工时效率（人均产出 = 报工完成量 / 工时；工时为 0 → null）
 * @param {object} query - { startDate?, endDate? }
 * @returns {Promise<{list: Array<{userName, totalHours, totalOutput, outputPerHour}>}>}
 */
async function getWorkHoursEfficiency(query) {
  const { rangeStart, rangeEnd } = parseRange(query, 30);

  const [records, reports] = await Promise.all([
    prisma.workHoursRecord.findMany({
      where: {
        userId: { not: null },
        workDate: { gte: rangeStart, lt: rangeEnd },
      },
      include: { user: { select: { name: true } } },
    }),
    prisma.productionReport.findMany({
      where: {
        operatorId: { not: null },
        reportTime: { gte: rangeStart, lt: rangeEnd },
      },
      select: { operatorId: true, completedQty: true },
    }),
  ]);

  const groups = new Map();
  for (const record of records) {
    const key = record.userId;
    if (!groups.has(key)) {
      groups.set(key, { userName: record.user?.name || '未指定人员', totalHours: 0 });
    }
    // hours 为 Decimal 字段，需先转 number 再做累加
    groups.get(key).totalHours += Number(record.hours);
  }

  for (const report of reports) {
    const group = groups.get(report.operatorId);
    if (group) {
      group.totalOutput = (group.totalOutput || 0) + report.completedQty;
    }
  }

  const list = Array.from(groups.values())
    .map((group) => ({
      userName: group.userName,
      totalHours: round2(group.totalHours),
      totalOutput: group.totalOutput || 0,
      outputPerHour:
        group.totalHours > 0
          ? round2((group.totalOutput || 0) / group.totalHours)
          : null,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  return { list };
}

// ==================== Excel 导出（P1-06，§8.4 约定） ====================

/** 导出文件名日期部分（YYYYMMDD） */
function exportDateTag() {
  const now = new Date();
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
}

/**
 * 构建多 Sheet 工作簿 Buffer（每个 Sheet 独立校验行数上限）
 * @param {Array<object>} sheets - writeSheet 参数数组（sheetName/columns/rows/title）
 * @returns {Promise<Buffer>} xlsx 二进制内容
 */
async function buildWorkbookBuffer(sheets) {
  for (const sheet of sheets) {
    assertRowLimit(sheet.rows.length, MAX_EXPORT_ROWS);
  }
  const { workbook, toBuffer } = createWorkbookWriter();
  for (const sheet of sheets) {
    writeSheet(workbook, sheet);
  }
  await workbook.commit();
  return toBuffer();
}

/** OEE 指标行（汇总 Sheet 通用） */
function buildOeeSummaryRows(summary) {
  return [
    { name: '计划生产时间（小时）', value: summary.plannedTime },
    { name: '停机时间（小时）', value: summary.downtime },
    { name: '时间稼动率 Availability（%）', value: summary.availability },
    { name: '理论产量（基于计划估算）', value: summary.theoreticalQty },
    { name: '实际产量', value: summary.actualQty },
    { name: '性能稼动率 Performance（%）', value: summary.performance },
    { name: '良品数', value: summary.goodQty },
    { name: '良品率 Quality（%）', value: summary.quality },
    { name: 'OEE（%）', value: summary.oee },
  ];
}

/**
 * 构建 OEE 导出 Excel（Sheet1 汇总 + Sheet2 明细）
 * @param {object} query - 同 getOeeSummary
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function buildOeeExcel(query) {
  const summary = await getOeeSummary(query);
  const details = await getOeeDetails({
    ...query,
    page: 1,
    pageSize: MAX_EXPORT_ROWS,
  });

  const buffer = await buildWorkbookBuffer([
    {
      sheetName: 'OEE汇总',
      title: 'OEE 汇总（OEE = 时间稼动率 × 性能稼动率 × 良品率；性能稼动率基于计划数据估算）',
      columns: [
        { header: '指标', key: 'name', width: 32 },
        { header: '数值', key: 'value', width: 16, type: 'number' },
      ],
      rows: buildOeeSummaryRows(summary),
    },
    {
      sheetName: 'OEE明细',
      title: 'OEE 明细（按设备分组）',
      columns: [
        { header: '设备编码', key: 'equipmentCode', width: 14 },
        { header: '设备名称', key: 'equipmentName', width: 18 },
        { header: '班次', key: 'shiftName', width: 12 },
        { header: '计划时间(h)', key: 'plannedTime', width: 14, type: 'number' },
        { header: '停机时间(h)', key: 'downtime', width: 14, type: 'number' },
        { header: '时间稼动率(%)', key: 'availability', width: 14, type: 'number' },
        { header: '实际产量', key: 'actualQty', width: 12, type: 'number' },
        { header: '理论产量', key: 'theoreticalQty', width: 12, type: 'number' },
        { header: '性能稼动率(%)', key: 'performance', width: 14, type: 'number' },
        { header: '完成数量', key: 'completedQty', width: 12, type: 'number' },
        { header: '不良数量', key: 'defectQty', width: 12, type: 'number' },
        { header: '良品率(%)', key: 'quality', width: 12, type: 'number' },
        { header: 'OEE(%)', key: 'oee', width: 12, type: 'number' },
        { header: '备注', key: 'remark', width: 10 },
      ],
      rows: details.list.map((row) => ({
        ...row,
        remark: row.overProduced ? '超产' : '',
      })),
    },
  ]);

  return { buffer, filename: `OEE分析报表_${exportDateTag()}.xlsx` };
}

/**
 * 构建生产报表导出 Excel
 * @param {object} query - 同 getProductionReport
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function buildProductionExcel(query) {
  const data = await getProductionReport(query);

  const buffer = await buildWorkbookBuffer([
    {
      sheetName: '生产报表',
      title: '生产报表（达成率 = 完成量 / 计划量；不良率 = 不良量 / 完成量）',
      columns: [
        { header: '期间', key: 'period', width: 16 },
        { header: '工单数', key: 'orderCount', width: 12, type: 'number' },
        { header: '计划量', key: 'plannedQty', width: 12, type: 'number' },
        { header: '完成量', key: 'completedQty', width: 12, type: 'number' },
        { header: '不良量', key: 'defectQty', width: 12, type: 'number' },
        { header: '达成率(%)', key: 'achieveRate', width: 12, type: 'number' },
        { header: '不良率(%)', key: 'defectRate', width: 12, type: 'number' },
      ],
      rows: data.list,
    },
  ]);

  return { buffer, filename: `生产报表_${exportDateTag()}.xlsx` };
}

/**
 * 构建质量报表导出 Excel（日报 + 不良Top + 处理分布，共 3 个 Sheet）
 * @param {object} query - 同 getQualityReport
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function buildQualityExcel(query) {
  const data = await getQualityReport(query);

  const buffer = await buildWorkbookBuffer([
    {
      sheetName: '质量日报',
      title: '质量检验日报',
      columns: [
        { header: '日期', key: 'period', width: 16 },
        { header: '检验次数', key: 'inspectionCount', width: 12, type: 'number' },
        { header: '合格', key: 'passCount', width: 10, type: 'number' },
        { header: '不合格', key: 'failCount', width: 10, type: 'number' },
        { header: '让步接收', key: 'concessionCount', width: 12, type: 'number' },
        { header: '合格率(%)', key: 'passRate', width: 12, type: 'number' },
      ],
      rows: data.list,
    },
    {
      sheetName: '不良Top5',
      title: '不良类型 Top5',
      columns: [
        { header: '不良类型', key: 'defectType', width: 20 },
        { header: '数量', key: 'quantity', width: 12, type: 'number' },
        { header: '占比(%)', key: 'ratio', width: 12, type: 'number' },
      ],
      rows: data.defectTop,
    },
    {
      sheetName: '处理方式分布',
      title: '不良处理方式分布',
      columns: [
        { header: '处理方式', key: 'handlingMethod', width: 16 },
        { header: '数量', key: 'quantity', width: 12, type: 'number' },
      ],
      rows: data.handlingDist,
    },
  ]);

  return { buffer, filename: `质量报表_${exportDateTag()}.xlsx` };
}

/**
 * 构建库存报表导出 Excel（明细 + 预警清单，共 2 个 Sheet）
 * @param {object} query - 同 getInventoryReport
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function buildInventoryExcel(query) {
  const data = await getInventoryReport(query);

  const inventoryColumns = [
    { header: '物料编码', key: 'materialCode', width: 16 },
    { header: '物料名称', key: 'materialName', width: 18 },
    { header: '规格', key: 'specification', width: 16 },
    { header: '单位', key: 'unit', width: 8 },
    { header: '分类', key: 'category', width: 12 },
    { header: '仓库', key: 'warehouse', width: 12 },
    { header: '库位', key: 'location', width: 12 },
    { header: '当前库存', key: 'quantity', width: 12, type: 'number' },
    { header: '安全库存', key: 'safetyStock', width: 12, type: 'number' },
    { header: '最大库存', key: 'maxStock', width: 12, type: 'number' },
  ];

  const levelText = (level) =>
    level === 'critical' ? '严重缺料' : level === 'warning' ? '库存预警' : '无预警';

  const buffer = await buildWorkbookBuffer([
    {
      sheetName: '库存明细',
      title: '库存明细报表',
      columns: inventoryColumns,
      rows: data.list,
    },
    {
      sheetName: '库存预警',
      title: '库存预警清单（口径：quantity < safetyStock；critical 优先）',
      columns: [
        ...inventoryColumns,
        { header: '缺口量', key: 'shortage', width: 12, type: 'number' },
        { header: '缺口比例(%)', key: 'shortageRatio', width: 14, type: 'number' },
        { header: '预警等级', key: 'levelText', width: 12 },
      ],
      rows: data.warnings.map((row) => ({
        ...row,
        shortageRatio: round2(row.shortageRatio * 100),
        levelText: levelText(row.level),
      })),
    },
  ]);

  return { buffer, filename: `库存报表_${exportDateTag()}.xlsx` };
}

/**
 * 构建工时报表导出 Excel
 * @param {object} query - 同 getWorkHoursReport
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function buildWorkHoursExcel(query) {
  const dimension = query.dimension || 'user';
  const dimensionLabel =
    { user: '按人员', shift: '按班次', workOrder: '按工单', date: '按日期' }[dimension] ||
    '按人员';
  const data = await getWorkHoursReport(query);

  const buffer = await buildWorkbookBuffer([
    {
      sheetName: '工时报表',
      title: `工时报表（${dimensionLabel}）`,
      columns: [
        { header: '分组名称', key: 'dimensionName', width: 20 },
        { header: '总工时(h)', key: 'totalHours', width: 14, type: 'number' },
        { header: '记录条数', key: 'recordCount', width: 12, type: 'number' },
        { header: '参与工单数', key: 'workOrderCount', width: 14, type: 'number' },
        { header: '日均工时(h)', key: 'avgHoursPerDay', width: 14, type: 'number' },
        { header: '平均单条时长(h)', key: 'avgHoursPerRecord', width: 16, type: 'number' },
        { header: '单位产品工时(h)', key: 'hoursPerUnit', width: 16, type: 'number' },
      ],
      rows: data.list,
    },
  ]);

  return { buffer, filename: `工时报表_${exportDateTag()}.xlsx` };
}

module.exports = {
  getOeeSummary,
  getOeeTrend,
  getOeeDetails,
  getProductionReport,
  getQualityReport,
  getInventoryReport,
  getWorkHoursReport,
  getWorkHoursEfficiency,
  buildOeeExcel,
  buildProductionExcel,
  buildQualityExcel,
  buildInventoryExcel,
  buildWorkHoursExcel,
};
