/**
 * MES 系统 - 设备维保服务层【T07 实现】
 * 业务：维保计划 P1-02（计划 CRUD / 到期提醒 / 事务内顺延 nextDate）
 *
 * 关键业务口径（架构文档 §4.1 / §8）：
 *  ① 到期判定：isDue = nextDate <= now；dueSoon = nextDate <= now + 7d；仅 status === 'active' 参与到期提醒
 *  ② 周期顺延：登记记录后 nextDate = plan.nextDate + cycleDays（**以 nextDate 为基准，避免漂移**）
 *  ③ planId 可选：为空表示临时保养，**只记录不顺延任何计划**
 *  ④ 周期天数映射：daily=1 / weekly=7 / monthly=30 / quarterly=90 / yearly=365
 */

const { prisma } = require('../config/database');

/** 维保周期类型 → 天数映射（唯一权威口径，T07 复用） */
const CYCLE_DAYS_MAP = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

/** 一天的毫秒数 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 维保记录关联查询的公共 include（列表 / 详情复用） */
const RECORD_INCLUDE = {
  plan: { select: { id: true, planName: true, cycleType: true } },
  equipment: { select: { id: true, code: true, name: true } },
  maintainer: { select: { id: true, name: true, department: true } },
};

/** 维保计划关联查询的公共 include */
const PLAN_INCLUDE = {
  equipment: { select: { id: true, code: true, name: true } },
};

/**
 * 构造业务异常（带 statusCode，controller 据此短路返回）
 * @param {string} message - 错误信息
 * @param {number} statusCode - HTTP 状态码
 * @returns {Error} 业务异常
 */
function bizError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * 计算周期类型对应天数
 * @param {string} cycleType - daily | weekly | monthly | quarterly | yearly
 * @returns {number} 周期天数（未知类型返回 0）
 */
function getCycleDays(cycleType) {
  return CYCLE_DAYS_MAP[cycleType] || 0;
}

// ==================== 维保计划 ====================

/**
 * 维保计划列表（分页，含 isDue / dueSoon 派生字段）
 * @param {object} query - { page, pageSize, equipmentId, status, cycleType }
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getPlans(query) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;

  const where = { AND: [] };
  if (query.equipmentId) {
    where.AND.push({ equipmentId: Number(query.equipmentId) });
  }
  if (query.status) {
    where.AND.push({ status: query.status });
  }
  if (query.cycleType) {
    where.AND.push({ cycleType: query.cycleType });
  }
  if (where.AND.length === 0) {
    delete where.AND;
  }

  const now = new Date();
  const dueSoonDeadline = new Date(now.getTime() + 7 * DAY_MS);

  const [plans, total] = await Promise.all([
    prisma.maintenancePlan.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { nextDate: 'asc' },
      include: PLAN_INCLUDE,
    }),
    prisma.maintenancePlan.count({ where }),
  ]);

  const list = plans.map((plan) => ({
    ...plan,
    isDue: plan.nextDate <= now,
    dueSoon: plan.nextDate <= dueSoonDeadline,
  }));

  return { list, total };
}

/**
 * 到期提醒列表（仅 status=active 且 nextDate <= now + days，含 overdueDays）
 * @param {number} days - 提前提醒天数（默认 7）
 * @returns {Promise<{list: Array}>}
 */
async function getDueList(days = 7) {
  const aheadDays = Number(days) || 7;
  const now = new Date();
  const deadline = new Date(now.getTime() + aheadDays * DAY_MS);

  const plans = await prisma.maintenancePlan.findMany({
    where: {
      status: 'active',
      nextDate: { lte: deadline },
    },
    include: PLAN_INCLUDE,
    orderBy: { nextDate: 'asc' },
  });

  const list = plans.map((plan) => {
    // 逾期天数：nextDate 已过 → 向上取整天数（至少 1）；未逾期为 0
    const overdueDays =
      plan.nextDate < now
        ? Math.max(1, Math.ceil((now.getTime() - plan.nextDate.getTime()) / DAY_MS))
        : 0;
    return {
      ...plan,
      isDue: plan.nextDate <= now,
      dueSoon: true,
      overdueDays,
    };
  });

  return { list };
}

/**
 * 创建维保计划
 * @param {object} data - { equipmentId, planName, cycleType, cycleDays?, nextDate, status? }
 * @returns {Promise<object>} 创建后的计划
 */
async function createPlan(data) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: data.equipmentId },
    select: { id: true },
  });
  if (!equipment) {
    throw bizError('设备不存在', 404);
  }

  // cycleDays 未传时按周期类型自动补齐默认天数
  const cycleDays =
    data.cycleDays && data.cycleDays > 0
      ? data.cycleDays
      : getCycleDays(data.cycleType);

  const plan = await prisma.maintenancePlan.create({
    data: {
      equipmentId: data.equipmentId,
      planName: data.planName,
      cycleType: data.cycleType,
      cycleDays,
      nextDate: data.nextDate,
      status: data.status || 'active',
    },
    include: PLAN_INCLUDE,
  });

  return plan;
}

/**
 * 更新维保计划（部分字段；改周期类型时自动同步默认 cycleDays，除非显式传入）
 * @param {number} id - 计划 ID
 * @param {object} data - 部分字段
 * @returns {Promise<object>} 更新后的计划
 */
async function updatePlan(id, data) {
  const existing = await prisma.maintenancePlan.findUnique({ where: { id } });
  if (!existing) {
    throw bizError('维保计划不存在', 404);
  }

  const updateData = {};
  if (data.planName !== undefined) updateData.planName = data.planName;
  if (data.cycleType !== undefined) updateData.cycleType = data.cycleType;
  if (data.nextDate !== undefined) updateData.nextDate = data.nextDate;
  if (data.status !== undefined) updateData.status = data.status;

  if (data.cycleDays !== undefined) {
    updateData.cycleDays = data.cycleDays;
  } else if (data.cycleType !== undefined) {
    // 切换周期类型时自动同步默认周期天数（可被显式 cycleDays 覆盖）
    updateData.cycleDays = getCycleDays(data.cycleType) || existing.cycleDays;
  }

  const plan = await prisma.maintenancePlan.update({
    where: { id },
    data: updateData,
    include: PLAN_INCLUDE,
  });

  return plan;
}

/**
 * 删除维保计划（历史维保记录保留，planId 由数据库 onDelete: SetNull 置空）
 * @param {number} id - 计划 ID
 * @returns {Promise<void>}
 */
async function deletePlan(id) {
  const existing = await prisma.maintenancePlan.findUnique({ where: { id } });
  if (!existing) {
    throw bizError('维保计划不存在', 404);
  }
  await prisma.maintenancePlan.delete({ where: { id } });
}

// ==================== 维保记录 ====================

/**
 * 维保记录列表（分页）
 * @param {object} query - { page, pageSize, equipmentId, maintenanceType, planId }
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getRecords(query) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;

  const where = { AND: [] };
  if (query.equipmentId) {
    where.AND.push({ equipmentId: Number(query.equipmentId) });
  }
  if (query.maintenanceType) {
    where.AND.push({ maintenanceType: query.maintenanceType });
  }
  if (query.planId) {
    where.AND.push({ planId: Number(query.planId) });
  }
  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [records, total] = await Promise.all([
    prisma.maintenanceRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { startTime: 'desc' },
      include: RECORD_INCLUDE,
    }),
    prisma.maintenanceRecord.count({ where }),
  ]);

  return { list: records, total };
}

/**
 * 登记维保记录（事务：写记录 → planId 非空时以原 nextDate 为基准顺延）
 * @param {object} data - { planId?, equipmentId, maintenanceType, maintainerId?, startTime, endTime?, content? }
 * @returns {Promise<{record: object, plan: object|null}>}
 */
async function createRecord(data) {
  // 前置校验：设备必须存在；关联的计划 / 人员如传入也必须存在
  const equipment = await prisma.equipment.findUnique({
    where: { id: data.equipmentId },
    select: { id: true },
  });
  if (!equipment) {
    throw bizError('设备不存在', 404);
  }
  if (data.planId) {
    const plan = await prisma.maintenancePlan.findUnique({
      where: { id: data.planId },
      select: { id: true },
    });
    if (!plan) {
      throw bizError('关联的维保计划不存在', 404);
    }
  }
  if (data.maintainerId) {
    const user = await prisma.user.findUnique({
      where: { id: data.maintainerId },
      select: { id: true },
    });
    if (!user) {
      throw bizError('维保人员不存在', 404);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // ① 创建维保记录
    const record = await tx.maintenanceRecord.create({
      data: {
        planId: data.planId || null,
        equipmentId: data.equipmentId,
        maintenanceType: data.maintenanceType,
        maintainerId: data.maintainerId || null,
        startTime: data.startTime,
        endTime: data.endTime || null,
        content: data.content || '',
      },
      include: RECORD_INCLUDE,
    });

    // ②③④ planId 非空时顺延计划：nextDate = 原nextDate + cycleDays（以原 nextDate 为基准，避免漂移）
    let updatedPlan = null;
    if (data.planId) {
      const plan = await tx.maintenancePlan.findUnique({
        where: { id: data.planId },
      });
      if (plan) {
        const cycleDays =
          plan.cycleDays > 0 ? plan.cycleDays : getCycleDays(plan.cycleType);
        const nextDate = new Date(
          plan.nextDate.getTime() + cycleDays * DAY_MS,
        );
        updatedPlan = await tx.maintenancePlan.update({
          where: { id: plan.id },
          data: { nextDate },
          include: PLAN_INCLUDE,
        });
      }
    }

    return { record, plan: updatedPlan };
  });

  return result;
}

/**
 * 更新维保记录（部分字段；编辑不重复触发计划顺延）
 * @param {number} id - 记录 ID
 * @param {object} data - 部分字段
 * @returns {Promise<object>} 更新后的记录
 */
async function updateRecord(id, data) {
  const existing = await prisma.maintenanceRecord.findUnique({ where: { id } });
  if (!existing) {
    throw bizError('维保记录不存在', 404);
  }

  const updateData = {};
  if (data.maintenanceType !== undefined) {
    updateData.maintenanceType = data.maintenanceType;
  }
  if (data.maintainerId !== undefined) {
    updateData.maintainerId = data.maintainerId;
  }
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.content !== undefined) updateData.content = data.content;

  const record = await prisma.maintenanceRecord.update({
    where: { id },
    data: updateData,
    include: RECORD_INCLUDE,
  });

  return record;
}

/**
 * 删除维保记录
 * @param {number} id - 记录 ID
 * @returns {Promise<void>}
 */
async function deleteRecord(id) {
  const existing = await prisma.maintenanceRecord.findUnique({ where: { id } });
  if (!existing) {
    throw bizError('维保记录不存在', 404);
  }
  await prisma.maintenanceRecord.delete({ where: { id } });
}

module.exports = {
  CYCLE_DAYS_MAP,
  getPlans,
  getDueList,
  createPlan,
  updatePlan,
  deletePlan,
  getRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  getCycleDays,
};
