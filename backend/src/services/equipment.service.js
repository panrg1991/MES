/**
 * MES 系统 - 设备管理服务层
 * 功能：设备 CRUD、分页查询、状态切换（含状态日志记录）、状态历史查询
 */

const { prisma } = require('../config/database');

/**
 * 获取设备列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（编码/名称/位置）
 * @param {string} status - 状态过滤
 * @param {string} type - 类型过滤
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getEquipments(page, pageSize, keyword, status, type) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { code: { contains: keyword } },
        { name: { contains: keyword } },
        { location: { contains: keyword } },
      ],
    });
  }

  if (status) {
    where.AND.push({ status });
  }

  if (type) {
    where.AND.push({ type: { contains: type } });
  }

  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.equipment.findMany({
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
    prisma.equipment.count({ where }),
  ]);

  return { list, total };
}

/**
 * 获取设备状态统计（用于状态总览卡片）
 * @returns {Promise<object>} 各状态数量统计
 */
async function getStatusSummary() {
  const equipments = await prisma.equipment.findMany({
    select: { status: true },
  });

  const summary = {
    running: 0,
    idle: 0,
    stopped: 0,
    fault: 0,
    total: equipments.length,
  };

  for (const eq of equipments) {
    if (summary[eq.status] !== undefined) {
      summary[eq.status]++;
    }
  }

  return summary;
}

/**
 * 根据 ID 获取设备详情（含状态历史日志、车间信息）
 * @param {number} id - 设备 ID
 * @returns {Promise<object>} 设备详情
 * @throws {Error} 设备不存在
 */
async function getEquipmentById(id) {
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    include: {
      workshop: {
        select: { id: true, name: true, code: true },
      },
      statusLogs: {
        include: {
          changedBy: {
            select: { id: true, name: true, department: true },
          },
        },
        orderBy: { changedAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!equipment) {
    const error = new Error('设备不存在');
    error.statusCode = 404;
    throw error;
  }

  return equipment;
}

/**
 * 创建设备
 * @param {object} data - 设备数据
 * @returns {Promise<object>} 创建后的设备
 * @throws {Error} 设备编码已存在
 */
async function createEquipment(data) {
  // 检查编码唯一性
  const existing = await prisma.equipment.findUnique({
    where: { code: data.code },
  });
  if (existing) {
    const error = new Error('设备编码已存在');
    error.statusCode = 409;
    throw error;
  }

  const equipment = await prisma.equipment.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      location: data.location,
      workshopId: data.workshopId || null,
      manufacturer: data.manufacturer || '',
      model: data.model || '',
      purchaseDate: data.purchaseDate || null,
      remark: data.remark || '',
    },
  });

  return equipment;
}

/**
 * 更新设备
 * @param {number} id - 设备 ID
 * @param {object} data - 更新数据
 * @returns {Promise<object>} 更新后的设备
 * @throws {Error} 设备不存在
 */
async function updateEquipment(id, data) {
  const existing = await prisma.equipment.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('设备不存在');
    error.statusCode = 404;
    throw error;
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.workshopId !== undefined) updateData.workshopId = data.workshopId;
  if (data.manufacturer !== undefined) updateData.manufacturer = data.manufacturer;
  if (data.model !== undefined) updateData.model = data.model;
  if (data.purchaseDate !== undefined) updateData.purchaseDate = data.purchaseDate;
  if (data.remark !== undefined) updateData.remark = data.remark;

  const equipment = await prisma.equipment.update({
    where: { id },
    data: updateData,
  });

  return equipment;
}

/**
 * 删除设备（级联删除状态日志）
 * @param {number} id - 设备 ID
 * @throws {Error} 设备不存在
 */
async function deleteEquipment(id) {
  const existing = await prisma.equipment.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('设备不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.equipment.delete({ where: { id } });
}

/**
 * 【P1 抽取 I6】状态变更 + 状态日志写入的公共事务函数
 * P0 手动状态切换与 P1 故障报修/复机共同调用，保证「更新状态 + 写日志」永不分叉。
 * 支持传入外部事务客户端 tx（breakdown.service 在自身 $transaction 内调用），
 * 默认使用全局 prisma。
 * @param {number} equipmentId - 设备 ID
 * @param {string} newStatus - 新状态
 * @param {number} changedBy - 操作人 ID
 * @param {string} remark - 备注（切换原因）
 * @param {object} tx - Prisma 事务客户端（默认全局 prisma）
 * @returns {Promise<object>} 更新后的设备
 * @throws {Error} 设备不存在 / 状态与当前相同
 */
async function changeStatusWithLog(equipmentId, newStatus, changedBy, remark, tx = prisma) {
  const existing = await tx.equipment.findUnique({
    where: { id: equipmentId },
  });
  if (!existing) {
    const error = new Error('设备不存在');
    error.statusCode = 404;
    throw error;
  }

  const oldStatus = existing.status;

  // 状态与当前相同，无需切换
  if (oldStatus === newStatus) {
    const error = new Error('设备状态与当前相同，无需切换');
    error.statusCode = 400;
    throw error;
  }

  // 更新设备状态 + 记录状态变更日志（同一事务客户端内执行）
  const equipment = await tx.equipment.update({
    where: { id: equipmentId },
    data: { status: newStatus },
  });

  await tx.equipmentStatusLog.create({
    data: {
      equipmentId,
      oldStatus,
      newStatus,
      changedById: changedBy || null,
      remark: remark || '',
    },
  });

  return equipment;
}

/**
 * 切换设备状态（记录状态变更日志）
 * P0 入口：内部委托给 changeStatusWithLog（I6 抽取后复用同一实现）
 * @param {number} id - 设备 ID
 * @param {string} newStatus - 新状态
 * @param {number} changedBy - 操作人 ID
 * @param {string} remark - 备注（切换原因）
 * @returns {Promise<object>} 更新后的设备
 * @throws {Error} 设备不存在 / 状态与当前相同
 */
async function changeStatus(id, newStatus, changedBy, remark) {
  return changeStatusWithLog(id, newStatus, changedBy, remark);
}

module.exports = {
  getEquipments,
  getStatusSummary,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  changeStatus,
  changeStatusWithLog,
};
