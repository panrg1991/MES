/**
 * MES 系统 - 生产管理服务层
 * 功能：工单 CRUD、分页查询、状态流转、报工录入、进度自动更新
 *
 * 并发控制：工单的状态流转、编辑、报工均按 `work-order:<id>` 串行执行，
 * 保证「查询校验 + 写入」原子化（单进程部署前提，见 utils/mutex.js）。
 */

const { prisma } = require('../config/database');
const { runExclusive } = require('../utils/mutex');

/**
 * 工单状态流转规则（状态机）
 * key: 当前状态, value: 允许流转的目标状态列表
 */
const STATUS_TRANSITIONS = {
  pending: ['in_progress', 'closed'],
  in_progress: ['paused', 'completed', 'closed'],
  paused: ['in_progress', 'closed'],
  completed: ['closed'],
  closed: [],
};

/**
 * 生成工单编号：WO-YYYYMMDD-XXX
 *
 * 口径说明：
 *  ① 取「当天已有工单号的最大序号 + 1」，而不是 count+1 —— 删除历史工单后不会复用编号；
 *  ② 并发场景仍可能撞号，由 createWorkOrder 捕获唯一约束冲突后重试（最多 3 次）。
 *
 * @returns {Promise<string>} 工单编号
 */
async function generateOrderNo() {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const rows = await prisma.workOrder.findMany({
    where: {
      createdAt: { gte: startOfDay, lt: endOfDay },
    },
    select: { orderNo: true },
  });

  const prefix = `WO-${dateStr}-`;
  let maxSeq = 0;
  for (const row of rows) {
    if (!row.orderNo.startsWith(prefix)) continue;
    const seq = Number.parseInt(row.orderNo.slice(prefix.length), 10);
    if (Number.isInteger(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

/**
 * 获取工单列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（工单号/产品名称/产品编码）
 * @param {string} status - 状态过滤
 * @param {string} priority - 优先级过滤
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getWorkOrders(page, pageSize, keyword, status, priority) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { orderNo: { contains: keyword } },
        { productName: { contains: keyword } },
        { productCode: { contains: keyword } },
      ],
    });
  }

  if (status) {
    where.AND.push({ status });
  }

  if (priority) {
    where.AND.push({ priority });
  }

  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        workshop: {
          select: { id: true, name: true, code: true },
        },
      },
    }),
    prisma.workOrder.count({ where }),
  ]);

  // 计算进度百分比
  const formattedList = list.map((order) => ({
    ...order,
    progress:
      order.quantity > 0
        ? Math.round((order.completedQty / order.quantity) * 1000) / 10
        : 0,
  }));

  return { list: formattedList, total };
}

/**
 * 根据 ID 获取工单详情（含报工记录、状态日志、车间信息）
 * @param {number} id - 工单 ID
 * @returns {Promise<object>} 工单详情
 * @throws {Error} 工单不存在
 */
async function getWorkOrderById(id) {
  const order = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      workshop: {
        select: { id: true, name: true, code: true },
      },
      reports: {
        include: {
          operator: {
            select: { id: true, name: true, department: true },
          },
        },
        orderBy: { reportTime: 'desc' },
      },
      statusLogs: {
        include: {
          operator: {
            select: { id: true, name: true, department: true },
          },
        },
        orderBy: { changedAt: 'desc' },
      },
    },
  });

  if (!order) {
    const error = new Error('工单不存在');
    error.statusCode = 404;
    throw error;
  }

  // 计算进度百分比
  const progress =
    order.quantity > 0
      ? Math.round((order.completedQty / order.quantity) * 1000) / 10
      : 0;

  return { ...order, progress };
}

/**
 * 创建工单（工单号冲突时自动重试，最多 3 次）
 * @param {object} data - 工单数据
 * @returns {Promise<object>} 创建后的工单
 * @throws {Error} 工单号连续冲突（409）
 */
async function createWorkOrder(data) {
  const payload = {
    productName: data.productName,
    productCode: data.productCode,
    quantity: data.quantity,
    priority: data.priority || 'medium',
    workshopId: data.workshopId || null,
    planStart: data.planStart || null,
    planEnd: data.planEnd || null,
    remark: data.remark || '',
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const orderNo = await generateOrderNo();
    try {
      // 唯一约束是最终防线：并发撞号时由数据库拒绝，再生成下一个序号重试
      return await prisma.workOrder.create({
        data: { ...payload, orderNo },
      });
    } catch (error) {
      if (error.code !== 'P2002' || attempt === 2) {
        if (error.code === 'P2002') {
          const conflict = new Error('工单编号生成冲突，请稍后重试');
          conflict.statusCode = 409;
          throw conflict;
        }
        throw error;
      }
    }
  }

  const error = new Error('工单编号生成冲突，请稍后重试');
  error.statusCode = 409;
  throw error;
}

/**
 * 更新工单
 * @param {number} id - 工单 ID
 * @param {object} data - 更新数据
 * @returns {Promise<object>} 更新后的工单
 * @throws {Error} 工单不存在 / 工单已关闭不可编辑
 */
async function updateWorkOrder(id, data) {
  return runExclusive(`work-order:${id}`, async () => {
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing) {
      const error = new Error('工单不存在');
      error.statusCode = 404;
      throw error;
    }

    // 已关闭的工单不允许编辑
    if (existing.status === 'closed') {
      const error = new Error('已关闭的工单不允许编辑');
      error.statusCode = 400;
      throw error;
    }

    // 计划数量不得小于「已完成 + 不良」的累计数量，否则进度会超过 100%
    if (data.quantity !== undefined) {
      const reported = existing.completedQty + existing.defectQty;
      if (data.quantity < reported) {
        const error = new Error(
          `计划数量不能小于已报数量（已完成 ${existing.completedQty} + 不良 ${existing.defectQty} = ${reported}）`,
        );
        error.statusCode = 400;
        throw error;
      }
    }

    const updateData = {};
    if (data.productName !== undefined) updateData.productName = data.productName;
    if (data.productCode !== undefined) updateData.productCode = data.productCode;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.workshopId !== undefined) updateData.workshopId = data.workshopId;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.planStart !== undefined) updateData.planStart = data.planStart;
    if (data.planEnd !== undefined) updateData.planEnd = data.planEnd;
    if (data.remark !== undefined) updateData.remark = data.remark;

    return prisma.workOrder.update({
      where: { id },
      data: updateData,
    });
  });
}

/**
 * 删除工单（级联删除报工记录和状态日志）
 * @param {number} id - 工单 ID
 * @throws {Error} 工单不存在
 */
async function deleteWorkOrder(id) {
  const existing = await prisma.workOrder.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('工单不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.workOrder.delete({ where: { id } });
}

/**
 * 工单状态流转
 * @param {number} id - 工单 ID
 * @param {string} toStatus - 目标状态
 * @param {number} operatorId - 操作人 ID
 * @param {string} remark - 备注
 * @returns {Promise<object>} 更新后的工单
 * @throws {Error} 工单不存在 / 不允许的状态流转
 */
async function transitionStatus(id, toStatus, operatorId, remark) {
  return runExclusive(`work-order:${id}`, async () => {
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing) {
      const error = new Error('工单不存在');
      error.statusCode = 404;
      throw error;
    }

    const fromStatus = existing.status;

    // 校验状态流转是否合法
    const allowedTargets = STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowedTargets.includes(toStatus)) {
      const error = new Error(
        `不允许从状态「${fromStatus}」流转到「${toStatus}」`,
      );
      error.statusCode = 400;
      throw error;
    }

    // 事务：条件更新（CAS）+ 记录日志
    return prisma.$transaction(async (tx) => {
      const updateData = { status: toStatus };

      // 状态流转时自动更新时间字段
      if (fromStatus === 'pending' && toStatus === 'in_progress') {
        updateData.actualStart = new Date();
      }
      if (toStatus === 'completed') {
        updateData.actualEnd = new Date();
      }

      // CAS：仅当状态仍为读取时的值时更新，防止并发重复流转
      const updated = await tx.workOrder.updateMany({
        where: { id, status: fromStatus },
        data: updateData,
      });
      if (updated.count === 0) {
        const error = new Error('工单状态已被其他操作修改，请刷新后重试');
        error.statusCode = 409;
        throw error;
      }

      await tx.workOrderStatusLog.create({
        data: {
          workOrderId: id,
          fromStatus,
          toStatus,
          operatorId: operatorId || null,
          remark: remark || '',
        },
      });

      return tx.workOrder.findUnique({ where: { id } });
    });
  });
}

/**
 * 报工录入
 *
 * 关键约束（P0 修复）：
 *  ① 幂等：传入 requestId 时，同一 requestId 的重试只落一条记录（唯一约束兜底）；
 *  ② 上限：本次「完成 + 不良」不得超过工单剩余可报数量，杜绝进度 > 100%；
 *  ③ 状态：仅进行中的工单可报工，且事务内用 CAS 复核状态，防止并发下写入已完工单；
 *  ④ 串行：同一工单的报工在进程内串行，保证「读取余量 + 写入」原子。
 *
 * @param {number} workOrderId - 工单 ID
 * @param {number} completedQty - 本次完成数量
 * @param {number} defectQty - 本次不良数量
 * @param {number} operatorId - 操作员 ID
 * @param {string} remark - 备注
 * @param {string} [requestId] - 客户端幂等键（可选）
 * @returns {Promise<object>} 报工记录
 * @throws {Error} 工单不存在 / 状态不允许 / 数量超限 / 数量全为 0
 */
async function createReport(
  workOrderId,
  completedQty,
  defectQty,
  operatorId,
  remark,
  requestId,
) {
  return runExclusive(`work-order:${workOrderId}`, async () => {
    // ① 幂等重放：同一次提交的重试直接返回已有记录，不再累加产量
    if (requestId) {
      const existed = await prisma.productionReport.findUnique({
        where: { requestId },
        include: {
          operator: { select: { id: true, name: true, department: true } },
        },
      });
      if (existed) {
        // requestId 属于其他工单时不能直接返回，否则会串单（也避免被用来探测他人报工）
        if (existed.workOrderId !== workOrderId) {
          const error = new Error('requestId 已被其他工单使用，请重新提交');
          error.statusCode = 409;
          throw error;
        }
        return existed;
      }
    }

    const order = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });
    if (!order) {
      const error = new Error('工单不存在');
      error.statusCode = 404;
      throw error;
    }

    // ③ 只有进行中的工单可以报工
    if (order.status !== 'in_progress') {
      const error = new Error('只有进行中的工单可以报工');
      error.statusCode = 400;
      throw error;
    }

    // ② 数量边界：完成与不良不能同时为 0，且不得超过剩余可报数量
    const totalQty = completedQty + defectQty;
    if (totalQty <= 0) {
      const error = new Error('完成数量与不良数量不能同时为 0');
      error.statusCode = 400;
      throw error;
    }

    const reported = order.completedQty + order.defectQty;
    const remaining = order.quantity - reported;
    if (totalQty > remaining) {
      const error = new Error(
        `报工数量超出剩余可报数量：本次 ${totalQty}，剩余 ${remaining > 0 ? remaining : 0}（计划 ${order.quantity}，已报 ${reported}）`,
      );
      error.statusCode = 400;
      throw error;
    }

    try {
      // 事务：CAS 复核状态 + 累加数量 + 写报工记录
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.workOrder.updateMany({
          where: { id: workOrderId, status: 'in_progress' },
          data: {
            completedQty: { increment: completedQty },
            defectQty: { increment: defectQty },
          },
        });
        if (updated.count === 0) {
          const error = new Error('工单状态已变更，报工失败，请刷新后重试');
          error.statusCode = 409;
          throw error;
        }

        return tx.productionReport.create({
          data: {
            workOrderId,
            completedQty,
            defectQty,
            operatorId: operatorId || null,
            remark: remark || '',
            requestId: requestId || null,
          },
          include: {
            operator: {
              select: { id: true, name: true, department: true },
            },
          },
        });
      });
    } catch (error) {
      // 并发下唯一约束兜底：若同 requestId 已被其他请求写入，返回已有记录（幂等）
      if (error.code === 'P2002' && requestId) {
        const existed = await prisma.productionReport.findUnique({
          where: { requestId },
          include: {
            operator: { select: { id: true, name: true, department: true } },
          },
        });
        if (existed && existed.workOrderId === workOrderId) {
          return existed;
        }
      }
      throw error;
    }
  });
}

module.exports = {
  getWorkOrders,
  getWorkOrderById,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  transitionStatus,
  createReport,
  STATUS_TRANSITIONS,
};
