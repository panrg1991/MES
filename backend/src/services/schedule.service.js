/**
 * MES 系统 - 生产排程服务层（P1-01 甘特排程，T08 实现）
 *
 * 关键业务口径（架构文档 §4.3、§8.5）：
 *  ① 冲突判定：同一 equipmentId 下 `newStart < otherEnd && otherStart < newEnd` 即冲突；
 *     **端点相接（newStart == otherEnd）不冲突**；status === 'cancelled' 不参与冲突检测
 *  ② 冲突校验前后端双做：前端本地预判即时反馈，后端事务内复检（检出 → 409 并返回冲突明细）
 *  ③ 时间窗默认值：未传 startDate/endDate 时取「今天起 14 天」
 *  ④ equipmentId 为空的排程（未指定设备）不参与冲突检测
 *  ⑤ 支持按 workOrderId 查询（工单详情页「生产排程」区块消费），此时不施加默认时间窗
 */

const { prisma } = require('../config/database');

/**
 * 排程状态流转规则（状态机）
 * key: 当前状态, value: 允许流转的目标状态列表
 */
const SCHEDULE_STATUS_TRANSITIONS = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** 排程列表关联查询（工单号 + 产品名、设备编码 + 设备名） */
const SCHEDULE_INCLUDE = {
  workOrder: {
    select: { id: true, orderNo: true, productName: true, status: true },
  },
  equipment: {
    select: { id: true, code: true, name: true },
  },
};

/**
 * 构造业务异常（带 HTTP 状态码）
 * @param {string} message - 错误信息
 * @param {number} statusCode - HTTP 状态码
 * @param {Array} [conflicts] - 冲突明细（409 时携带）
 * @returns {Error}
 */
function createBusinessError(message, statusCode, conflicts) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (conflicts) {
    error.conflicts = conflicts;
  }
  return error;
}

/**
 * 解析时间窗参数：默认「今天 00:00 起 14 天」
 * @param {Date|string} [startDate]
 * @param {Date|string} [endDate]
 * @returns {{windowStart: Date, windowEnd: Date}}
 */
function resolveTimeWindow(startDate, endDate) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const windowStart = startDate ? new Date(startDate) : todayStart;
  const windowEnd = endDate
    ? new Date(endDate)
    : new Date(windowStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  return { windowStart, windowEnd };
}

/**
 * 查询同设备时段重叠的排程（冲突检测核心）
 * 口径：newStart < otherEnd && otherStart < newEnd（端点相接不冲突）
 * @param {object} params
 * @param {object} [params.client] - Prisma 客户端（事务内传 tx，默认全局 prisma）
 * @param {number} params.equipmentId - 设备 ID
 * @param {Date} params.plannedStart
 * @param {Date} params.plannedEnd
 * @param {number} [params.excludeId] - 排除的排程 ID（更新时排除自身）
 * @returns {Promise<Array>} 冲突排程列表（含工单号）
 */
async function findOverlappingSchedules({
  client,
  equipmentId,
  plannedStart,
  plannedEnd,
  excludeId,
}) {
  const db = client || prisma;
  const where = {
    equipmentId,
    status: { not: 'cancelled' },
    // 区间重叠：已有记录的开始 < 新结束 且 已有记录的结束 > 新开始
    plannedStart: { lt: plannedEnd },
    plannedEnd: { gt: plannedStart },
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }

  return db.productionSchedule.findMany({
    where,
    include: SCHEDULE_INCLUDE,
    orderBy: { plannedStart: 'asc' },
  });
}

/**
 * 排程列表（时间窗查询）
 * @param {object} query - { startDate?, endDate?, equipmentId?, status?, workOrderId? }
 *   - 传 workOrderId 时（工单详情页场景）不施加默认时间窗
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getSchedules(query) {
  const { startDate, endDate, equipmentId, status, workOrderId } = query;

  const where = {};

  // 时间窗过滤：与窗口有交集（plannedStart < windowEnd && plannedEnd > windowStart）
  // 传 workOrderId 时未显式传时间窗则不限制时间，便于展示工单全部排程
  const hasWindow = Boolean(startDate || endDate);
  if (hasWindow || !workOrderId) {
    const { windowStart, windowEnd } = resolveTimeWindow(startDate, endDate);
    where.plannedStart = { lt: windowEnd };
    where.plannedEnd = { gt: windowStart };
  }

  if (equipmentId) {
    where.equipmentId = equipmentId;
  }
  if (status) {
    where.status = status;
  }
  if (workOrderId) {
    where.workOrderId = workOrderId;
  }

  const [list, total] = await Promise.all([
    prisma.productionSchedule.findMany({
      where,
      include: SCHEDULE_INCLUDE,
      orderBy: { plannedStart: 'asc' },
    }),
    prisma.productionSchedule.count({ where }),
  ]);

  return { list, total };
}

/**
 * 冲突检测（辅助查询，供前端高亮）
 * @param {object} params - { equipmentId, plannedStart, plannedEnd, excludeId? }
 * @returns {Promise<{conflicts: Array}>}
 */
async function checkConflicts(params) {
  const { equipmentId, plannedStart, plannedEnd, excludeId } = params;

  const conflicts = await findOverlappingSchedules({
    equipmentId,
    plannedStart: new Date(plannedStart),
    plannedEnd: new Date(plannedEnd),
    excludeId,
  });

  return { conflicts };
}

/**
 * 创建排程（事务内冲突复检 → create，冲突返回 409）
 * @param {object} data - { workOrderId, equipmentId, plannedStart, plannedEnd }
 * @returns {Promise<object>} 新建排程（含 workOrder / equipment）
 */
async function createSchedule(data) {
  const { workOrderId, equipmentId, plannedStart, plannedEnd } = data;

  // 前置存在性校验（404 友好提示，避免外键错误 500）
  const [workOrder, equipment] = await Promise.all([
    prisma.workOrder.findUnique({ where: { id: workOrderId } }),
    equipmentId
      ? prisma.equipment.findUnique({ where: { id: equipmentId } })
      : Promise.resolve(null),
  ]);
  if (!workOrder) {
    throw createBusinessError('工单不存在', 404);
  }
  if (equipmentId && !equipment) {
    throw createBusinessError('设备不存在', 404);
  }

  const result = await prisma.$transaction(async (tx) => {
    // 冲突复检（事务内，防并发窗口）
    if (equipmentId) {
      const conflicts = await findOverlappingSchedules({
        client: tx,
        equipmentId,
        plannedStart,
        plannedEnd,
      });
      if (conflicts.length > 0) {
        throw createBusinessError(
          `排程冲突：与工单 ${conflicts.map((c) => c.workOrder?.orderNo || c.id).join('、')} 在同一设备时段重叠`,
          409,
          conflicts,
        );
      }
    }

    return tx.productionSchedule.create({
      data: {
        workOrderId,
        equipmentId: equipmentId || null,
        plannedStart,
        plannedEnd,
        status: 'planned',
      },
      include: SCHEDULE_INCLUDE,
    });
  });

  return result;
}

/**
 * 调整排程时段（事务内冲突复检 → update，返回 { schedule, conflicts: [] }）
 * @param {number} id - 排程 ID
 * @param {object} data - { plannedStart?, plannedEnd?, equipmentId? }
 * @returns {Promise<{schedule: object, conflicts: Array}>}
 */
async function updateSchedule(id, data) {
  const existing = await prisma.productionSchedule.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('排程不存在', 404);
  }

  // 合并字段：未传字段沿用原值
  const equipmentId =
    data.equipmentId !== undefined ? data.equipmentId || null : existing.equipmentId;
  const plannedStart = data.plannedStart || existing.plannedStart;
  const plannedEnd = data.plannedEnd || existing.plannedEnd;

  if (plannedStart >= plannedEnd) {
    throw createBusinessError('计划开始时间必须早于计划结束时间', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    // 冲突复检（事务内，排除自身；cancelled 不参与冲突）
    if (equipmentId) {
      const conflicts = await findOverlappingSchedules({
        client: tx,
        equipmentId,
        plannedStart,
        plannedEnd,
        excludeId: id,
      });
      if (conflicts.length > 0) {
        throw createBusinessError(
          `排程冲突：与工单 ${conflicts.map((c) => c.workOrder?.orderNo || c.id).join('、')} 在同一设备时段重叠`,
          409,
          conflicts,
        );
      }
    }

    return tx.productionSchedule.update({
      where: { id },
      data: {
        equipmentId,
        plannedStart,
        plannedEnd,
      },
      include: SCHEDULE_INCLUDE,
    });
  });

  return { schedule: result, conflicts: [] };
}

/**
 * 排程状态流转（planned → in_progress → completed / cancelled）
 * 进入 in_progress 时写入 actualStart；completed 时写入 actualEnd
 * @param {number} id - 排程 ID
 * @param {string} status - 目标状态
 * @returns {Promise<object>} 更新后排程
 */
async function updateScheduleStatus(id, status) {
  const existing = await prisma.productionSchedule.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('排程不存在', 404);
  }

  const allowed = SCHEDULE_STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(status)) {
    throw createBusinessError(
      `非法状态流转：${existing.status} 不能变更为 ${status}`,
      400,
    );
  }

  const now = new Date();
  const data = { status };
  if (status === 'in_progress' && !existing.actualStart) {
    data.actualStart = now;
  }
  if (status === 'completed') {
    data.actualEnd = now;
  }

  return prisma.productionSchedule.update({
    where: { id },
    data,
    include: SCHEDULE_INCLUDE,
  });
}

/**
 * 删除排程
 * @param {number} id - 排程 ID
 * @returns {Promise<void>}
 */
async function deleteSchedule(id) {
  const existing = await prisma.productionSchedule.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('排程不存在', 404);
  }
  await prisma.productionSchedule.delete({ where: { id } });
}

module.exports = {
  SCHEDULE_STATUS_TRANSITIONS,
  getSchedules,
  checkConflicts,
  createSchedule,
  updateSchedule,
  updateScheduleStatus,
  deleteSchedule,
};
