/**
 * MES 系统 - 物料管理服务层
 * 功能：物料 CRUD（含库存自动初始化）、BOM CRUD（含明细树形展开）、
 *       库存查询（安全库存预警统一口径 evaluateWarning + warning 筛选 I8）、
 *       出入库事务（$transaction 确保库存与流水一致）、
 *       【P1 新增】批次 CRUD、库存预警列表、正向/反向物料追溯
 */

const { prisma } = require('../config/database');

// ==================== 物料主数据 ====================

/**
 * 获取物料列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（编码/名称/规格）
 * @param {string} type - 物料类型过滤
 * @param {string} category - 物料分类过滤
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getMaterials(page, pageSize, keyword, type, category) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { code: { contains: keyword } },
        { name: { contains: keyword } },
        { specification: { contains: keyword } },
      ],
    });
  }

  if (type) {
    where.AND.push({ type });
  }

  if (category) {
    where.AND.push({ category: { contains: category } });
  }

  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.material.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        inventory: {
          select: {
            id: true,
            quantity: true,
            safetyStock: true,
            maxStock: true,
            warehouse: true,
            location: true,
          },
        },
      },
    }),
    prisma.material.count({ where }),
  ]);

  return { list, total };
}

/**
 * 根据 ID 获取物料详情（含库存信息）
 * @param {number} id - 物料 ID
 * @returns {Promise<object>} 物料详情
 * @throws {Error} 物料不存在
 */
async function getMaterialById(id) {
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      inventory: true,
    },
  });

  if (!material) {
    const error = new Error('物料不存在');
    error.statusCode = 404;
    throw error;
  }

  return material;
}

/**
 * 创建物料（自动初始化库存记录）
 * @param {object} data - 物料数据
 * @returns {Promise<object>} 创建后的物料（含库存）
 * @throws {Error} 物料编码已存在
 */
async function createMaterial(data) {
  // 检查编码唯一性
  const existing = await prisma.material.findUnique({
    where: { code: data.code },
  });
  if (existing) {
    const error = new Error('物料编码已存在');
    error.statusCode = 409;
    throw error;
  }

  // 使用事务：创建物料 + 初始化库存记录
  const material = await prisma.$transaction(async (tx) => {
    const created = await tx.material.create({
      data: {
        code: data.code,
        name: data.name,
        specification: data.specification,
        unit: data.unit,
        category: data.category,
        type: data.type,
        description: data.description || '',
      },
    });

    // 自动创建库存记录（默认值为 0）
    await tx.inventory.create({
      data: {
        materialId: created.id,
        warehouse: '默认仓库',
        location: '默认库位',
        quantity: 0,
        safetyStock: 0,
        maxStock: 0,
      },
    });

    return created;
  });

  // 重新查询以包含库存信息
  return getMaterialById(material.id);
}

/**
 * 更新物料
 * @param {number} id - 物料 ID
 * @param {object} data - 更新数据
 * @returns {Promise<object>} 更新后的物料
 * @throws {Error} 物料不存在
 */
async function updateMaterial(id, data) {
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('物料不存在');
    error.statusCode = 404;
    throw error;
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.specification !== undefined) updateData.specification = data.specification;
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.description !== undefined) updateData.description = data.description;

  const material = await prisma.material.update({
    where: { id },
    data: updateData,
    include: { inventory: true },
  });

  return material;
}

/**
 * 删除物料（级联删除库存和出入库记录）
 * @param {number} id - 物料 ID
 * @throws {Error} 物料不存在
 */
async function deleteMaterial(id) {
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('物料不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.material.delete({ where: { id } });
}

// ==================== BOM 管理 ====================

/**
 * 获取 BOM 列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（产品编码/名称）
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getBOMs(page, pageSize, keyword) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { productCode: { contains: keyword } },
        { productName: { contains: keyword } },
      ],
    });
  }

  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.bOM.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { items: true },
        },
      },
    }),
    prisma.bOM.count({ where }),
  ]);

  return { list, total };
}

/**
 * 根据 ID 获取 BOM 详情（含明细项和物料信息，树形展开）
 * @param {number} id - BOM ID
 * @returns {Promise<object>} BOM 详情（含明细项+物料信息）
 * @throws {Error} BOM 不存在
 */
async function getBOMById(id) {
  const bom = await prisma.bOM.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          material: {
            select: {
              id: true,
              code: true,
              name: true,
              specification: true,
              unit: true,
              type: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!bom) {
    const error = new Error('BOM 不存在');
    error.statusCode = 404;
    throw error;
  }

  return bom;
}

/**
 * 创建 BOM（含明细项，使用事务）
 * @param {object} data - BOM 数据（含 items 数组）
 * @returns {Promise<object>} 创建后的 BOM
 */
async function createBOM(data) {
  const bom = await prisma.$transaction(async (tx) => {
    const created = await tx.bOM.create({
      data: {
        productCode: data.productCode,
        productName: data.productName,
        version: data.version,
        remark: data.remark || '',
        items: {
          create: data.items.map((item) => ({
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            remark: item.remark || '',
          })),
        },
      },
      include: {
        items: {
          include: {
            material: {
              select: {
                id: true,
                code: true,
                name: true,
                specification: true,
                unit: true,
              },
            },
          },
        },
      },
    });

    return created;
  });

  return bom;
}

/**
 * 更新 BOM（含明细项替换，使用事务）
 * @param {number} id - BOM ID
 * @param {object} data - 更新数据（可选含 items 数组，若提供则全量替换明细）
 * @returns {Promise<object>} 更新后的 BOM
 * @throws {Error} BOM 不存在
 */
async function updateBOM(id, data) {
  const existing = await prisma.bOM.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('BOM 不存在');
    error.statusCode = 404;
    throw error;
  }

  const bom = await prisma.$transaction(async (tx) => {
    const updateData = {};
    if (data.productName !== undefined) updateData.productName = data.productName;
    if (data.version !== undefined) updateData.version = data.version;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.remark !== undefined) updateData.remark = data.remark;

    // 如果提供了 items 数组，全量替换明细项
    if (data.items !== undefined) {
      // 先删除旧的明细项
      await tx.bOMItem.deleteMany({ where: { bomId: id } });
      // 创建新的明细项
      if (data.items.length > 0) {
        updateData.items = {
          create: data.items.map((item) => ({
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            remark: item.remark || '',
          })),
        };
      }
    }

    const updated = await tx.bOM.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            material: {
              select: {
                id: true,
                code: true,
                name: true,
                specification: true,
                unit: true,
              },
            },
          },
        },
      },
    });

    return updated;
  });

  return bom;
}

/**
 * 删除 BOM（级联删除明细项）
 * @param {number} id - BOM ID
 * @throws {Error} BOM 不存在
 */
async function deleteBOM(id) {
  const existing = await prisma.bOM.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('BOM 不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.bOM.delete({ where: { id } });
}

// ==================== 库存管理 ====================

/**
 * 【P1 共享函数】库存预警统一评估（架构文档 §8.2 唯一口径）
 * 预警列表 / 库存列表 isLowStock 标识 / 看板 lowStockCount 三处必须同源调用本函数。
 * 口径：
 *   safetyStock <= 0 或 quantity >= safetyStock → 无预警
 *   shortage      = safetyStock - quantity
 *   shortageRatio = shortage / safetyStock
 *   level         = (quantity <= 0 || quantity < safetyStock * 0.5) ? 'critical' : 'warning'
 * @param {object} inventory - 库存记录（需含 quantity / safetyStock）
 * @returns {{isLowStock: boolean, level: string|null, shortage: number, shortageRatio: number}}
 */
function evaluateWarning(inventory) {
  const quantity = Number(inventory.quantity) || 0;
  const safetyStock = Number(inventory.safetyStock) || 0;
  if (safetyStock <= 0 || quantity >= safetyStock) {
    return { isLowStock: false, level: null, shortage: 0, shortageRatio: 0 };
  }
  const shortage = safetyStock - quantity;
  const shortageRatio = shortage / safetyStock;
  const level =
    quantity <= 0 || quantity < safetyStock * 0.5 ? 'critical' : 'warning';
  return { isLowStock: true, level, shortage, shortageRatio };
}

/**
 * 为库存记录附加统一口径的预警字段
 * @param {object} item - 库存记录（含 material 关联）
 * @returns {object} 附加 isLowStock / level / shortage / shortageRatio 后的记录
 */
function withWarningFlag(item) {
  const warning = evaluateWarning(item);
  return { ...item, ...warning };
}

/**
 * 获取库存列表（分页，含物料信息和安全库存预警标识）
 * SQLite + Prisma 不支持字段间比较（quantity < safetyStock），
 * 因此 isLowStock 在应用层通过共享函数 evaluateWarning 计算（P1 统一口径）。
 * P1 扩展（I8）：warning=true 时只返回预警行（应用层过滤后内存分页，保证 total 正确）。
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（物料编码/名称）
 * @param {boolean} [warning=false] - 是否只看预警
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getInventoryList(page, pageSize, keyword, warning = false) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { material: { code: { contains: keyword } } },
        { material: { name: { contains: keyword } } },
      ],
    });
  }

  if (where.AND.length === 0) {
    delete where.AND;
  }

  const include = {
    material: {
      select: {
        id: true,
        code: true,
        name: true,
        specification: true,
        unit: true,
        type: true,
      },
    },
  };

  // 只看预警：字段间比较无法下推到 SQLite 查询，取全量后应用层过滤 + 内存分页
  if (warning === true) {
    const allRows = await prisma.inventory.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include,
    });
    const warningRows = allRows
      .map(withWarningFlag)
      .filter((item) => item.isLowStock);
    const start = (page - 1) * pageSize;
    return {
      list: warningRows.slice(start, start + pageSize),
      total: warningRows.length,
    };
  }

  const [list, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { updatedAt: 'desc' },
      include,
    }),
    prisma.inventory.count({ where }),
  ]);

  // 应用层计算低库存标识（统一口径：evaluateWarning 共享函数）
  const listWithFlag = list.map(withWarningFlag);

  return { list: listWithFlag, total };
}

/**
 * 【P1-08】获取库存预警列表（quantity < safetyStock）
 * 排序口径：level（critical 先）→ shortageRatio 倒序，最紧急的排最前。
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 物料编码/名称关键字
 * @param {string} [level] - 预警等级过滤（critical | warning）
 * @returns {Promise<{list: Array, total: number}>} 每项含 shortage / shortageRatio / level
 */
async function getInventoryWarnings(page, pageSize, keyword, level) {
  const where = { AND: [] };

  if (keyword) {
    where.AND.push({
      OR: [
        { material: { code: { contains: keyword } } },
        { material: { name: { contains: keyword } } },
      ],
    });
  }
  if (where.AND.length === 0) {
    delete where.AND;
  }

  const allRows = await prisma.inventory.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      material: {
        select: {
          id: true,
          code: true,
          name: true,
          specification: true,
          unit: true,
          type: true,
        },
      },
    },
  });

  // 统一口径评估 + 等级过滤
  let warningRows = allRows
    .map(withWarningFlag)
    .filter((item) => item.isLowStock);
  if (level) {
    warningRows = warningRows.filter((item) => item.level === level);
  }

  // 排序：critical 先 → 缺口比例倒序
  const levelOrder = { critical: 0, warning: 1 };
  warningRows.sort((a, b) => {
    const levelDiff =
      (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9);
    if (levelDiff !== 0) return levelDiff;
    return b.shortageRatio - a.shortageRatio;
  });

  const start = (page - 1) * pageSize;
  return {
    list: warningRows.slice(start, start + pageSize),
    total: warningRows.length,
  };
}

/**
 * 创建出入库事务（使用事务确保库存与流水一致）
 * @param {object} data - 事务数据
 * @param {number} operatorId - 操作员 ID
 * @returns {Promise<object>} 创建后的出入库记录
 * @throws {Error} 物料不存在 / 库存不足（出库时）
 */
async function createTransaction(data, operatorId) {
  // 验证物料存在
  const material = await prisma.material.findUnique({
    where: { id: data.materialId },
    include: { inventory: true },
  });
  if (!material) {
    const error = new Error('物料不存在');
    error.statusCode = 404;
    throw error;
  }

  // 如果没有库存记录，报错
  if (!material.inventory) {
    const error = new Error('该物料尚未初始化库存记录');
    error.statusCode = 400;
    throw error;
  }

  // 出库时检查库存是否充足
  if (data.transactionType === 'out') {
    if (Number(material.inventory.quantity) < data.quantity) {
      const error = new Error(
        `库存不足：当前库存 ${Number(material.inventory.quantity)}，需出库 ${data.quantity}`,
      );
      error.statusCode = 400;
      throw error;
    }
  }

  // 使用事务：创建出入库记录 + 更新库存数量
  const transaction = await prisma.$transaction(async (tx) => {
    // 创建出入库流水记录
    const record = await tx.inventoryTransaction.create({
      data: {
        materialId: data.materialId,
        transactionType: data.transactionType,
        quantity: data.quantity,
        batchNo: data.batchNo,
        operatorId: operatorId || null,
        relatedOrder: data.relatedOrder || '',
        remark: data.remark || '',
      },
    });

    // 更新库存数量
    const delta =
      data.transactionType === 'in' ? data.quantity : -data.quantity;
    await tx.inventory.update({
      where: { materialId: data.materialId },
      data: {
        quantity: { increment: delta },
      },
    });

    return record;
  });

  return transaction;
}

/**
 * 获取物料出入库记录列表（分页）
 * @param {number} materialId - 物料 ID
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getTransactions(materialId, page, pageSize) {
  const where = {};
  if (materialId) {
    where.materialId = materialId;
  }

  const [list, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { transactionTime: 'desc' },
      include: {
        material: {
          select: { id: true, code: true, name: true, unit: true },
        },
        operator: {
          select: { id: true, name: true, department: true },
        },
      },
    }),
    prisma.inventoryTransaction.count({ where }),
  ]);

  return { list, total };
}

// ==================== 批次管理（P1-07） ====================

/**
 * 获取批次列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {object} filters - 过滤条件 { materialId, batchNo, supplier, status }
 * @returns {Promise<{list: Array, total: number}>} 列表项含 material 关联信息
 */
async function getBatches(page, pageSize, filters = {}) {
  const where = { AND: [] };

  if (filters.materialId) {
    where.AND.push({ materialId: filters.materialId });
  }
  if (filters.batchNo) {
    where.AND.push({ batchNo: { contains: filters.batchNo } });
  }
  if (filters.supplier) {
    where.AND.push({ supplier: { contains: filters.supplier } });
  }
  if (filters.status) {
    where.AND.push({ status: filters.status });
  }
  if (where.AND.length === 0) {
    delete where.AND;
  }

  const [list, total] = await Promise.all([
    prisma.materialBatch.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { receivedDate: 'desc' },
      include: {
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            specification: true,
            unit: true,
          },
        },
      },
    }),
    prisma.materialBatch.count({ where }),
  ]);

  return { list, total };
}

/**
 * 创建批次档案（batchNo 应用层全局唯一，重复返回 409）
 * 口径（架构文档 §8.3）：Prisma 层不加 @unique 以防历史脏数据，唯一性由应用层保证。
 * @param {object} data - 批次数据 { materialId, batchNo, supplier, receivedDate, quantity, status }
 * @returns {Promise<object>} 创建后的批次（含物料信息）
 * @throws {Error} 物料不存在（404）/ 批次号重复（409）
 */
async function createBatch(data) {
  // 校验物料存在
  const material = await prisma.material.findUnique({
    where: { id: data.materialId },
  });
  if (!material) {
    const error = new Error('物料不存在');
    error.statusCode = 404;
    throw error;
  }

  // batchNo 全局唯一校验（应用层 409）
  const existing = await prisma.materialBatch.findFirst({
    where: { batchNo: data.batchNo },
  });
  if (existing) {
    const error = new Error(`批次号已存在：${data.batchNo}`);
    error.statusCode = 409;
    throw error;
  }

  const batch = await prisma.materialBatch.create({
    data: {
      materialId: data.materialId,
      batchNo: data.batchNo,
      supplier: data.supplier,
      receivedDate: data.receivedDate,
      quantity: data.quantity,
      status: data.status || 'active',
    },
    include: {
      material: {
        select: {
          id: true,
          code: true,
          name: true,
          specification: true,
          unit: true,
        },
      },
    },
  });

  return batch;
}

/**
 * 更新批次档案（batchNo 变更时校验全局唯一）
 * @param {number} id - 批次 ID
 * @param {object} data - 更新数据（batchNo/supplier/receivedDate/quantity/status 可选）
 * @returns {Promise<object>} 更新后的批次
 * @throws {Error} 批次不存在（404）/ 批次号重复（409）
 */
async function updateBatch(id, data) {
  const existing = await prisma.materialBatch.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('批次不存在');
    error.statusCode = 404;
    throw error;
  }

  // batchNo 变更时校验唯一（排除自身）
  if (data.batchNo !== undefined && data.batchNo !== existing.batchNo) {
    const dup = await prisma.materialBatch.findFirst({
      where: { batchNo: data.batchNo, id: { not: id } },
    });
    if (dup) {
      const error = new Error(`批次号已存在：${data.batchNo}`);
      error.statusCode = 409;
      throw error;
    }
  }

  const updateData = {};
  if (data.batchNo !== undefined) updateData.batchNo = data.batchNo;
  if (data.supplier !== undefined) updateData.supplier = data.supplier;
  if (data.receivedDate !== undefined) updateData.receivedDate = data.receivedDate;
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.status !== undefined) updateData.status = data.status;

  const batch = await prisma.materialBatch.update({
    where: { id },
    data: updateData,
    include: {
      material: {
        select: {
          id: true,
          code: true,
          name: true,
          specification: true,
          unit: true,
        },
      },
    },
  });

  return batch;
}

/**
 * 删除批次档案
 * 口径：出入库流水按 batchNo 字符串关联，删除批次不影响流水数据。
 * @param {number} id - 批次 ID
 * @throws {Error} 批次不存在（404）
 */
async function deleteBatch(id) {
  const existing = await prisma.materialBatch.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('批次不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.materialBatch.delete({ where: { id } });
}

// ==================== 物料追溯（P1-07，链路组装复用 trace.service.buildMaterialChain） ====================

/**
 * 正向追溯：批次 → 去向（按 batchNo 查 out 流水按 relatedOrder 分组汇总）
 * @param {string} batchNo - 批次号
 * @returns {Promise<object>} { batch, usages: [{ relatedOrder, workOrderId?, quantity, transactionTime }] }
 * @throws {Error} 批次不存在且无出入库记录（404）
 */
async function getForwardTrace(batchNo) {
  const [batch, transactions] = await Promise.all([
    prisma.materialBatch.findFirst({
      where: { batchNo },
      include: {
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            specification: true,
            unit: true,
          },
        },
      },
    }),
    prisma.inventoryTransaction.findMany({
      where: { batchNo, transactionType: 'out' },
      orderBy: { transactionTime: 'asc' },
    }),
  ]);

  if (!batch && transactions.length === 0) {
    const error = new Error('未找到该批次，或该批次尚未发生出入库');
    error.statusCode = 404;
    throw error;
  }

  // 按 relatedOrder 分组汇总领用数量，transactionTime 取该工单最后一次领用时间
  const usageMap = new Map();
  for (const tx of transactions) {
    const key = tx.relatedOrder || '-';
    const existing = usageMap.get(key);
    if (existing) {
      existing.quantity += Number(tx.quantity);
      existing.transactionTime = tx.transactionTime; // 流水按时间升序，覆盖为最新
    } else {
      usageMap.set(key, {
        relatedOrder: tx.relatedOrder || '-',
        quantity: Number(tx.quantity),
        transactionTime: tx.transactionTime,
      });
    }
  }

  // 关联工单 ID（relatedOrder ↔ WorkOrder.orderNo 字符串关联），命中时前端可跳工单详情
  const orderNos = [...usageMap.keys()].filter((no) => no !== '-');
  const workOrders =
    orderNos.length > 0
      ? await prisma.workOrder.findMany({
          where: { orderNo: { in: orderNos } },
          select: { id: true, orderNo: true },
        })
      : [];
  const orderIdMap = new Map(workOrders.map((wo) => [wo.orderNo, wo.id]));

  const usages = [...usageMap.values()].map((usage) => ({
    ...usage,
    workOrderId: orderIdMap.get(usage.relatedOrder) ?? null,
  }));

  return { batch, usages };
}

/**
 * 反向追溯：工单 → 来源批次（按 orderNo 查 out 流水的 batchNo 去重后 join 批次档案）
 * @param {string} workOrderNo - 工单号
 * @returns {Promise<object>} { batches: [{ batchNo, materialCode, materialName, supplier, receivedDate, quantity }] }
 * @throws {Error} 工单不存在（404）
 */
async function getBackwardTrace(workOrderNo) {
  // 校验工单存在（给出明确 404 而非空列表歧义）
  const workOrder = await prisma.workOrder.findFirst({
    where: { orderNo: workOrderNo },
  });
  if (!workOrder) {
    const error = new Error(`未找到工单：${workOrderNo}`);
    error.statusCode = 404;
    throw error;
  }

  const transactions = await prisma.inventoryTransaction.findMany({
    where: { relatedOrder: workOrderNo, transactionType: 'out' },
    orderBy: { transactionTime: 'asc' },
  });

  const batchNos = [...new Set(transactions.map((tx) => tx.batchNo))];
  const batches =
    batchNos.length > 0
      ? await prisma.materialBatch.findMany({
          where: { batchNo: { in: batchNos } },
          include: {
            material: {
              select: {
                id: true,
                code: true,
                name: true,
                specification: true,
                unit: true,
              },
            },
          },
        })
      : [];

  return {
    batches: batches.map((batch) => ({
      batchNo: batch.batchNo,
      materialCode: batch.material?.code || '-',
      materialName: batch.material?.name || '-',
      supplier: batch.supplier,
      receivedDate: batch.receivedDate,
      quantity: Number(batch.quantity),
    })),
  };
}

module.exports = {
  getMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getBOMs,
  getBOMById,
  createBOM,
  updateBOM,
  deleteBOM,
  getInventoryList,
  getInventoryWarnings,
  evaluateWarning,
  createTransaction,
  getTransactions,
  getBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  getForwardTrace,
  getBackwardTrace,
};
