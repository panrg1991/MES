/**
 * MES 系统 - 生产管理服务层
 * 功能：工单 CRUD、分页查询、状态流转、报工录入、进度自动更新
 */

const { prisma } = require('../config/database');

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
 * @returns {Promise<string>} 工单编号
 */
async function generateOrderNo() {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  // 查询今天已创建的工单数量
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const count = await prisma.workOrder.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
  });

  const seq = String(count + 1).padStart(3, '0');
  return `WO-${dateStr}-${seq}`;
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
 * 创建工单
 * @param {object} data - 工单数据
 * @returns {Promise<object>} 创建后的工单
 */
async function createWorkOrder(data) {
  const orderNo = await generateOrderNo();

  const order = await prisma.workOrder.create({
    data: {
      orderNo,
      productName: data.productName,
      productCode: data.productCode,
      quantity: data.quantity,
      priority: data.priority || 'medium',
      workshopId: data.workshopId || null,
      planStart: data.planStart || null,
      planEnd: data.planEnd || null,
      remark: data.remark || '',
    },
  });

  return order;
}

/**
 * 更新工单
 * @param {number} id - 工单 ID
 * @param {object} data - 更新数据
 * @returns {Promise<object>} 更新后的工单
 * @throws {Error} 工单不存在 / 工单已关闭不可编辑
 */
async function updateWorkOrder(id, data) {
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

  const updateData = {};
  if (data.productName !== undefined) updateData.productName = data.productName;
  if (data.productCode !== undefined) updateData.productCode = data.productCode;
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.workshopId !== undefined) updateData.workshopId = data.workshopId;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.planStart !== undefined) updateData.planStart = data.planStart;
  if (data.planEnd !== undefined) updateData.planEnd = data.planEnd;
  if (data.remark !== undefined) updateData.remark = data.remark;

  const order = await prisma.workOrder.update({
    where: { id },
    data: updateData,
  });

  return order;
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

  // 使用事务：更新工单状态 + 记录日志 + 更新时间字段
  const order = await prisma.$transaction(async (tx) => {
    // 构造更新数据
    const updateData = { status: toStatus };

    // 状态流转时自动更新时间字段
    if (fromStatus === 'pending' && toStatus === 'in_progress') {
      updateData.actualStart = new Date();
    }
    if (toStatus === 'completed') {
      updateData.actualEnd = new Date();
    }

    // 更新工单状态
    const updated = await tx.workOrder.update({
      where: { id },
      data: updateData,
    });

    // 记录状态流转日志
    await tx.workOrderStatusLog.create({
      data: {
        workOrderId: id,
        fromStatus,
        toStatus,
        operatorId: operatorId || null,
        remark: remark || '',
      },
    });

    return updated;
  });

  return order;
}

/**
 * 报工录入
 * @param {number} workOrderId - 工单 ID
 * @param {number} completedQty - 本次完成数量
 * @param {number} defectQty - 本次不良数量
 * @param {number} operatorId - 操作员 ID
 * @param {string} remark - 备注
 * @returns {Promise<object>} 报工记录
 * @throws {Error} 工单不存在 / 工单状态不允许报工
 */
async function createReport(workOrderId, completedQty, defectQty, operatorId, remark) {
  const order = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!order) {
    const error = new Error('工单不存在');
    error.statusCode = 404;
    throw error;
  }

  // 只有进行中的工单可以报工
  if (order.status !== 'in_progress') {
    const error = new Error('只有进行中的工单可以报工');
    error.statusCode = 400;
    throw error;
  }

  // 使用事务：创建报工记录 + 更新工单累计数量
  const report = await prisma.$transaction(async (tx) => {
    // 创建报工记录
    const newReport = await tx.productionReport.create({
      data: {
        workOrderId,
        completedQty,
        defectQty,
        operatorId: operatorId || null,
        remark: remark || '',
      },
      include: {
        operator: {
          select: { id: true, name: true, department: true },
        },
      },
    });

    // 累加工单已完成数量和不良数量
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        completedQty: { increment: completedQty },
        defectQty: { increment: defectQty },
      },
    });

    return newReport;
  });

  return report;
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
