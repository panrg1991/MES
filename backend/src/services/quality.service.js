/**
 * MES 系统 - 质量管理服务层
 * 功能：检验记录 CRUD（含检验项明细事务创建）、不良品 CRUD（含处理方式更新）
 * 检验结果自动判定逻辑：所有检验项 pass → pass；任意 fail → fail；否则 → concession
 */

const { prisma } = require('../config/database');

/**
 * 根据检验项列表自动判定检验总结果
 * 规则：全部 pass → pass；任意 fail → fail；其余 → concession
 * @param {Array} items - 检验项数组
 * @returns {string} 检验结果：pass | fail | concession
 */
function determineInspectionResult(items) {
  const hasFail = items.some((item) => item.result === 'fail');
  if (hasFail) return 'fail';

  const allPass = items.every((item) => item.result === 'pass');
  if (allPass) return 'pass';

  return 'concession';
}

/**
 * 获取检验记录列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（工单号/产品名称）
 * @param {string} result - 结果过滤
 * @param {string} inspectionType - 检验类型过滤
 * @param {number} workOrderId - 工单 ID 过滤
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getInspections(
  page,
  pageSize,
  keyword,
  result,
  inspectionType,
  workOrderId,
) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { workOrder: { orderNo: { contains: keyword } } },
        { workOrder: { productName: { contains: keyword } } },
      ],
    });
  }

  if (result) {
    where.AND.push({ result });
  }

  if (inspectionType) {
    where.AND.push({ inspectionType });
  }

  if (workOrderId) {
    where.AND.push({ workOrderId });
  }

  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.qualityInspection.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { inspectionTime: 'desc' },
      include: {
        workOrder: {
          select: {
            id: true,
            orderNo: true,
            productName: true,
            productCode: true,
          },
        },
        inspector: {
          select: { id: true, name: true, department: true },
        },
        items: {
          select: {
            id: true,
            itemName: true,
            standardValue: true,
            actualValue: true,
            unit: true,
            result: true,
          },
        },
      },
    }),
    prisma.qualityInspection.count({ where }),
  ]);

  return { list, total };
}

/**
 * 根据 ID 获取检验记录详情（含检验项明细、工单、检验员）
 * @param {number} id - 检验记录 ID
 * @returns {Promise<object>} 检验详情
 * @throws {Error} 检验记录不存在
 */
async function getInspectionById(id) {
  const inspection = await prisma.qualityInspection.findUnique({
    where: { id },
    include: {
      workOrder: {
        select: {
          id: true,
          orderNo: true,
          productName: true,
          productCode: true,
          quantity: true,
          completedQty: true,
          defectQty: true,
        },
      },
      inspector: {
        select: { id: true, name: true, department: true },
      },
      items: {
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!inspection) {
    const error = new Error('检验记录不存在');
    error.statusCode = 404;
    throw error;
  }

  return inspection;
}

/**
 * 创建检验记录（含检验项明细），使用事务
 * 自动判定检验结果：根据各检验项的 result 字段
 * @param {object} data - 检验数据（含 items 数组）
 * @param {number} inspectorId - 检验员 ID（从 req.user 获取）
 * @returns {Promise<object>} 创建后的检验记录
 * @throws {Error} 工单不存在
 */
async function createInspection(data, inspectorId) {
  // 验证工单存在
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: data.workOrderId },
  });
  if (!workOrder) {
    const error = new Error('关联工单不存在');
    error.statusCode = 404;
    throw error;
  }

  // 自动判定检验结果
  const result = determineInspectionResult(data.items);

  // 使用事务：创建检验记录 + 检验项明细
  const inspection = await prisma.$transaction(async (tx) => {
    const created = await tx.qualityInspection.create({
      data: {
        workOrderId: data.workOrderId,
        inspectionType: data.inspectionType,
        inspectorId: inspectorId || null,
        result,
        remark: data.remark || '',
        items: {
          create: data.items.map((item) => ({
            itemName: item.itemName,
            standardValue: item.standardValue,
            actualValue: item.actualValue,
            unit: item.unit || '',
            result: item.result || 'pass',
            remark: item.remark || '',
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return created;
  });

  return inspection;
}

/**
 * 删除检验记录（级联删除检验项明细）
 * @param {number} id - 检验记录 ID
 * @throws {Error} 检验记录不存在
 */
async function deleteInspection(id) {
  const existing = await prisma.qualityInspection.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('检验记录不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.qualityInspection.delete({ where: { id } });
}

/**
 * 获取不良品记录列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（工单号/不良类型）
 * @param {string} defectType - 不良类型过滤
 * @param {string} handlingMethod - 处理方式过滤
 * @param {number} workOrderId - 工单 ID 过滤
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getDefects(
  page,
  pageSize,
  keyword,
  defectType,
  handlingMethod,
  workOrderId,
) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { workOrder: { orderNo: { contains: keyword } } },
        { defectType: { contains: keyword } },
        { defectReason: { contains: keyword } },
      ],
    });
  }

  if (defectType) {
    where.AND.push({ defectType: { contains: defectType } });
  }

  if (handlingMethod) {
    where.AND.push({ handlingMethod });
  }

  if (workOrderId) {
    where.AND.push({ workOrderId });
  }

  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.defectRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        workOrder: {
          select: {
            id: true,
            orderNo: true,
            productName: true,
          },
        },
        equipment: {
          select: { id: true, code: true, name: true },
        },
        handler: {
          select: { id: true, name: true, department: true },
        },
      },
    }),
    prisma.defectRecord.count({ where }),
  ]);

  return { list, total };
}

/**
 * 根据 ID 获取不良品记录详情
 * @param {number} id - 不良品记录 ID
 * @returns {Promise<object>} 不良品详情
 * @throws {Error} 不良品记录不存在
 */
async function getDefectById(id) {
  const defect = await prisma.defectRecord.findUnique({
    where: { id },
    include: {
      workOrder: {
        select: {
          id: true,
          orderNo: true,
          productName: true,
          productCode: true,
        },
      },
      equipment: {
        select: { id: true, code: true, name: true },
      },
      handler: {
        select: { id: true, name: true, department: true },
      },
    },
  });

  if (!defect) {
    const error = new Error('不良品记录不存在');
    error.statusCode = 404;
    throw error;
  }

  return defect;
}

/**
 * 创建不良品记录
 * @param {object} data - 不良品数据
 * @returns {Promise<object>} 创建后的不良品记录
 * @throws {Error} 工单不存在
 */
async function createDefect(data) {
  // 验证工单存在
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: data.workOrderId },
  });
  if (!workOrder) {
    const error = new Error('关联工单不存在');
    error.statusCode = 404;
    throw error;
  }

  // 如果关联设备，验证设备存在
  if (data.equipmentId) {
    const equipment = await prisma.equipment.findUnique({
      where: { id: data.equipmentId },
    });
    if (!equipment) {
      const error = new Error('关联设备不存在');
      error.statusCode = 404;
      throw error;
    }
  }

  const defect = await prisma.defectRecord.create({
    data: {
      workOrderId: data.workOrderId,
      equipmentId: data.equipmentId || null,
      defectType: data.defectType,
      defectReason: data.defectReason || '',
      quantity: data.quantity,
      handlingMethod: null,
      remark: data.remark || '',
    },
  });

  return defect;
}

/**
 * 处理不良品（更新处理方式）
 * @param {number} id - 不良品记录 ID
 * @param {object} data - 更新数据（handlingMethod, remark）
 * @param {number} handlerId - 处理人 ID（从 req.user 获取）
 * @returns {Promise<object>} 更新后的不良品记录
 * @throws {Error} 不良品记录不存在 / 已处理
 */
async function updateDefect(id, data, handlerId) {
  const existing = await prisma.defectRecord.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('不良品记录不存在');
    error.statusCode = 404;
    throw error;
  }

  if (existing.handlingMethod) {
    const error = new Error('该不良品已处理，不可重复处理');
    error.statusCode = 400;
    throw error;
  }

  const updateData = {};
  if (data.handlingMethod !== undefined) {
    updateData.handlingMethod = data.handlingMethod;
  }
  if (data.remark !== undefined) {
    updateData.remark = data.remark;
  }
  // 设置处理人和处理时间
  updateData.handledBy = handlerId || null;
  updateData.handledAt = new Date();

  const defect = await prisma.defectRecord.update({
    where: { id },
    data: updateData,
  });

  return defect;
}

/**
 * 删除不良品记录
 * @param {number} id - 不良品记录 ID
 * @throws {Error} 不良品记录不存在
 */
async function deleteDefect(id) {
  const existing = await prisma.defectRecord.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('不良品记录不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.defectRecord.delete({ where: { id } });
}

module.exports = {
  getInspections,
  getInspectionById,
  createInspection,
  deleteInspection,
  getDefects,
  getDefectById,
  createDefect,
  updateDefect,
  deleteDefect,
};
