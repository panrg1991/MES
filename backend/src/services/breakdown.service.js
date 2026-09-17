/**
 * MES 系统 - 设备故障维修服务层【T07 实现】
 * 业务：故障维修 P1-03（报修 → 置 fault → 维修 → 复机恢复 + 停机时长 + 统计）
 *
 * 关键业务口径（架构文档 §4.2 / §8）：
 *  ① 报修事务：写故障记录 + 调用 equipment.service.changeStatusWithLog(→fault)（交互点 I6，不自建状态日志逻辑）
 *  ② 复机事务：downtimeDuration = round((repairedAt - occurredAt) / 60000) 分钟，**服务端计算，禁止前端传入**
 *  ③ 状态恢复：默认恢复 idle；若该设备存在 in_progress 排程则恢复 running（架构文档 A2）
 *  ④ repairedAt <= occurredAt → 400（停机时长不可为负）
 *  ⑤ 待维修判定：repairedAt == null（不新增 status 字段）
 */

const { prisma } = require('../config/database');
const equipmentService = require('./equipment.service');

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

/** 故障记录关联查询的公共 include（列表 / 详情复用） */
const BREAKDOWN_INCLUDE = {
  equipment: { select: { id: true, code: true, name: true } },
  repairer: { select: { id: true, name: true, department: true } },
};

// ==================== 查询 ====================

/**
 * 故障记录列表（分页；status=pending → repairedAt 为空，repaired → repairedAt 非空）
 * @param {object} query - { page, pageSize, equipmentId, status, startDate, endDate }
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getBreakdowns(query) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;

  const where = { AND: [] };
  if (query.equipmentId) {
    where.AND.push({ equipmentId: Number(query.equipmentId) });
  }
  if (query.status === 'pending') {
    where.AND.push({ repairedAt: null });
  } else if (query.status === 'repaired') {
    where.AND.push({ repairedAt: { not: null } });
  }
  if (query.startDate || query.endDate) {
    const occurredAt = {};
    if (query.startDate) occurredAt.gte = query.startDate;
    if (query.endDate) occurredAt.lte = query.endDate;
    where.AND.push({ occurredAt });
  }
  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.breakdownRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { occurredAt: 'desc' },
      include: BREAKDOWN_INCLUDE,
    }),
    prisma.breakdownRecord.count({ where }),
  ]);

  return { list, total };
}

/**
 * 故障统计（故障频次 TopN / 累计停机时长 / 故障类型分布）
 * @param {object} query - { startDate, endDate, equipmentId }
 * @returns {Promise<{topFaultEquipments: Array, totalDowntime: number, byFaultType: Array}>}
 */
async function getStatistics(query) {
  const where = { AND: [] };
  if (query.equipmentId) {
    where.AND.push({ equipmentId: Number(query.equipmentId) });
  }
  if (query.startDate || query.endDate) {
    const occurredAt = {};
    if (query.startDate) occurredAt.gte = query.startDate;
    if (query.endDate) occurredAt.lte = query.endDate;
    where.AND.push({ occurredAt });
  }
  if (where.AND.length === 0) {
    delete where.AND;
  }

  const records = await prisma.breakdownRecord.findMany({
    where,
    select: {
      equipmentId: true,
      faultType: true,
      downtimeDuration: true,
      equipment: { select: { code: true, name: true } },
    },
  });

  const totalDowntime = records.reduce(
    (sum, r) => sum + r.downtimeDuration,
    0,
  );

  // 按设备聚合故障频次（Top 5）
  const equipmentMap = new Map();
  for (const r of records) {
    if (!equipmentMap.has(r.equipmentId)) {
      equipmentMap.set(r.equipmentId, {
        equipmentId: r.equipmentId,
        equipmentCode: r.equipment?.code || '',
        equipmentName: r.equipment?.name || '',
        faultCount: 0,
        totalDowntime: 0,
      });
    }
    const item = equipmentMap.get(r.equipmentId);
    item.faultCount += 1;
    item.totalDowntime += r.downtimeDuration;
  }
  const topFaultEquipments = Array.from(equipmentMap.values())
    .sort(
      (a, b) =>
        b.faultCount - a.faultCount || b.totalDowntime - a.totalDowntime,
    )
    .slice(0, 5);

  // 按故障类型聚合
  const typeMap = new Map();
  for (const r of records) {
    if (!typeMap.has(r.faultType)) {
      typeMap.set(r.faultType, {
        faultType: r.faultType,
        count: 0,
        totalDowntime: 0,
      });
    }
    const item = typeMap.get(r.faultType);
    item.count += 1;
    item.totalDowntime += r.downtimeDuration;
  }
  const byFaultType = Array.from(typeMap.values()).sort(
    (a, b) => b.count - a.count,
  );

  return { topFaultEquipments, totalDowntime, byFaultType };
}

// ==================== 报修 / 复机 ====================

/**
 * 故障报修（事务：写记录 + 设备置 fault + 状态日志）
 * 若设备已处于 fault 状态（如此前已有人工置故障），仅写记录不再重复切状态
 * @param {object} data - { equipmentId, faultType, faultDescription?, occurredAt }
 * @param {number} operatorId - 操作人 ID（来自 JWT）
 * @returns {Promise<object>} 新建故障记录
 */
async function reportBreakdown(data, operatorId) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: data.equipmentId },
    select: { id: true, status: true },
  });
  if (!equipment) {
    throw bizError('设备不存在', 404);
  }

  const record = await prisma.$transaction(async (tx) => {
    // ① 写故障记录（repairedAt 为空即待维修）
    const created = await tx.breakdownRecord.create({
      data: {
        equipmentId: data.equipmentId,
        faultType: data.faultType,
        faultDescription: data.faultDescription || '',
        occurredAt: data.occurredAt,
        repairedAt: null,
        repairerId: null,
        repairMethod: '',
        downtimeDuration: 0,
      },
    });

    // ② 设备置 fault + 状态日志（复用 I6 公共函数，事务内传递 tx）
    if (equipment.status !== 'fault') {
      await equipmentService.changeStatusWithLog(
        data.equipmentId,
        'fault',
        operatorId,
        '故障报修',
        tx,
      );
    }

    return created;
  });

  return record;
}

/**
 * 维修完成（事务：更新记录 + 服务端计算 downtimeDuration + 恢复设备状态）
 * 恢复目标状态（架构 A2）：存在 in_progress 排程 → running，否则 idle；
 * 仅当设备当前仍为 fault 时切换，避免覆盖期间的人工状态变更。
 * @param {number} id - 故障记录 ID
 * @param {object} data - { repairerId, repairMethod, repairedAt }
 * @param {number} operatorId - 操作人 ID（来自 JWT）
 * @returns {Promise<object>} 更新后故障记录
 */
async function completeRepair(id, data, operatorId) {
  const record = await prisma.breakdownRecord.findUnique({
    where: { id },
    include: { equipment: { select: { id: true, status: true } } },
  });
  if (!record) {
    throw bizError('故障记录不存在', 404);
  }
  if (record.repairedAt) {
    throw bizError('该故障已完成维修，请勿重复提交', 400);
  }

  // 停机时长不可为负：修复时间必须晚于发生时间
  const repairedAt = data.repairedAt;
  if (repairedAt <= record.occurredAt) {
    throw bizError('修复时间必须晚于故障发生时间（停机时长不可为负）', 400);
  }

  // ② 服务端计算停机时长（分钟），禁止使用前端传值
  const downtimeDuration = Math.round(
    (repairedAt.getTime() - record.occurredAt.getTime()) / 60000,
  );

  // ③ 恢复目标状态：存在 in_progress 排程 → running，否则 idle（架构 A2）
  const activeSchedule = await prisma.productionSchedule.findFirst({
    where: { equipmentId: record.equipmentId, status: 'in_progress' },
    select: { id: true },
  });
  const restoreStatus = activeSchedule ? 'running' : 'idle';

  const updated = await prisma.$transaction(async (tx) => {
    // ① 更新故障记录
    const result = await tx.breakdownRecord.update({
      where: { id },
      data: {
        repairerId: data.repairerId || null,
        repairMethod: data.repairMethod || '',
        repairedAt,
        downtimeDuration,
      },
      include: BREAKDOWN_INCLUDE,
    });

    // ③ 设备恢复状态 + 状态日志（复用 I6 公共函数）；仅当仍为 fault 时切换
    if (record.equipment && record.equipment.status === 'fault') {
      await equipmentService.changeStatusWithLog(
        record.equipmentId,
        restoreStatus,
        operatorId,
        '维修完成复机',
        tx,
      );
    }

    return result;
  });

  return updated;
}

// ==================== 编辑 / 删除 ====================

/**
 * 更新故障记录（部分字段；downtimeDuration / repairedAt 由复机流程维护，
 * 若修改 occurredAt 且已有修复时间则同步重算停机时长，保证口径一致）
 * @param {number} id - 故障记录 ID
 * @param {object} data - 部分字段
 * @returns {Promise<object>} 更新后故障记录
 */
async function updateBreakdown(id, data) {
  const record = await prisma.breakdownRecord.findUnique({ where: { id } });
  if (!record) {
    throw bizError('故障记录不存在', 404);
  }

  const updateData = {};
  if (data.faultType !== undefined) updateData.faultType = data.faultType;
  if (data.faultDescription !== undefined) {
    updateData.faultDescription = data.faultDescription;
  }
  if (data.occurredAt !== undefined) updateData.occurredAt = data.occurredAt;
  if (data.repairerId !== undefined) updateData.repairerId = data.repairerId;
  if (data.repairMethod !== undefined) {
    updateData.repairMethod = data.repairMethod;
  }

  // 修改了发生时间且已复机 → 重算停机时长（不可为负）
  if (updateData.occurredAt !== undefined && record.repairedAt) {
    const diff = Math.round(
      (record.repairedAt.getTime() - updateData.occurredAt.getTime()) / 60000,
    );
    if (diff < 0) {
      throw bizError('修复时间必须晚于故障发生时间（停机时长不可为负）', 400);
    }
    updateData.downtimeDuration = diff;
  }

  const updated = await prisma.breakdownRecord.update({
    where: { id },
    data: updateData,
    include: BREAKDOWN_INCLUDE,
  });

  return updated;
}

/**
 * 删除故障记录
 * @param {number} id - 故障记录 ID
 * @returns {Promise<void>}
 */
async function deleteBreakdown(id) {
  const existing = await prisma.breakdownRecord.findUnique({ where: { id } });
  if (!existing) {
    throw bizError('故障记录不存在', 404);
  }
  await prisma.breakdownRecord.delete({ where: { id } });
}

module.exports = {
  getBreakdowns,
  getStatistics,
  reportBreakdown,
  completeRepair,
  updateBreakdown,
  deleteBreakdown,
};
