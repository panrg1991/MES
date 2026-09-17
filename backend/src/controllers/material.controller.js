/**
 * MES 系统 - 物料管理控制器
 * 处理：物料 CRUD、BOM CRUD、库存查询、出入库事务、出入库流水
 */

const materialService = require('../services/material.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

// ==================== 物料主数据 ====================

/**
 * GET /api/material/materials?page=&pageSize=&keyword=&type=&category=
 * 物料列表（分页）
 */
async function getMaterials(req, res, next) {
  try {
    const { page, pageSize, keyword, type, category } = req.query;
    const { list, total } = await materialService.getMaterials(
      page,
      pageSize,
      keyword,
      type,
      category,
    );
    return sendPaginated(res, list, total, page, pageSize, '查询物料列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/material/materials/:id
 * 物料详情（含库存信息）
 */
async function getMaterialById(req, res, next) {
  try {
    const { id } = req.params;
    const material = await materialService.getMaterialById(Number(id));
    return sendSuccess(res, material, '查询物料详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/material/materials
 * 创建物料（自动初始化库存）
 */
async function createMaterial(req, res, next) {
  try {
    const material = await materialService.createMaterial(req.body);
    return sendCreated(res, material, '创建物料成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/material/materials/:id
 * 更新物料
 */
async function updateMaterial(req, res, next) {
  try {
    const { id } = req.params;
    const material = await materialService.updateMaterial(
      Number(id),
      req.body,
    );
    return sendSuccess(res, material, '更新物料成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/material/materials/:id
 * 删除物料
 */
async function deleteMaterial(req, res, next) {
  try {
    const { id } = req.params;
    await materialService.deleteMaterial(Number(id));
    return sendSuccess(res, null, '删除物料成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

// ==================== BOM 管理 ====================

/**
 * GET /api/material/bom?page=&pageSize=&keyword=
 * BOM 列表（分页）
 */
async function getBOMs(req, res, next) {
  try {
    const { page, pageSize, keyword } = req.query;
    const { list, total } = await materialService.getBOMs(
      page,
      pageSize,
      keyword,
    );
    return sendPaginated(res, list, total, page, pageSize, '查询 BOM 列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/material/bom/:id
 * BOM 详情（含明细项+物料信息）
 */
async function getBOMById(req, res, next) {
  try {
    const { id } = req.params;
    const bom = await materialService.getBOMById(Number(id));
    return sendSuccess(res, bom, '查询 BOM 详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/material/bom
 * 创建 BOM（含明细项）
 */
async function createBOM(req, res, next) {
  try {
    const bom = await materialService.createBOM(req.body);
    return sendCreated(res, bom, '创建 BOM 成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/material/bom/:id
 * 更新 BOM（含明细项替换）
 */
async function updateBOM(req, res, next) {
  try {
    const { id } = req.params;
    const bom = await materialService.updateBOM(Number(id), req.body);
    return sendSuccess(res, bom, '更新 BOM 成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/material/bom/:id
 * 删除 BOM
 */
async function deleteBOM(req, res, next) {
  try {
    const { id } = req.params;
    await materialService.deleteBOM(Number(id));
    return sendSuccess(res, null, '删除 BOM 成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

// ==================== 库存管理 ====================

/**
 * GET /api/material/inventory?page=&pageSize=&keyword=&warning=
 * 库存列表（分页，含物料信息和安全库存预警标识；warning=true 只看预警，I8）
 */
async function getInventoryList(req, res, next) {
  try {
    const { page, pageSize, keyword, warning } = req.query;
    const { list, total } = await materialService.getInventoryList(
      page,
      pageSize,
      keyword,
      warning === 'true',
    );
    return sendPaginated(res, list, total, page, pageSize, '查询库存列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/material/inventory/warnings?page=&pageSize=&keyword=&level=
 * 【P1-08】库存预警列表（quantity < safetyStock，统一口径 evaluateWarning）
 */
async function getInventoryWarnings(req, res, next) {
  try {
    const { page, pageSize, keyword, level } = req.query;
    const { list, total } = await materialService.getInventoryWarnings(
      page,
      pageSize,
      keyword,
      level,
    );
    return sendPaginated(
      res,
      list,
      total,
      page,
      pageSize,
      '查询库存预警列表成功',
    );
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/material/inventory/transactions
 * 创建出入库事务（更新库存+记录流水）
 */
async function createTransaction(req, res, next) {
  try {
    const operatorId = req.user?.userId;
    const transaction = await materialService.createTransaction(
      req.body,
      operatorId,
    );
    return sendCreated(res, transaction, '出入库操作成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/material/inventory/transactions?materialId=&page=&pageSize=
 * 出入库流水记录列表（分页）
 */
async function getTransactions(req, res, next) {
  try {
    const { materialId, page, pageSize } = req.query;
    const { list, total } = await materialService.getTransactions(
      materialId ? Number(materialId) : undefined,
      page,
      pageSize,
    );
    return sendPaginated(
      res,
      list,
      total,
      page,
      pageSize,
      '查询出入库流水成功',
    );
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

// ==================== 批次管理（P1-07） ====================

/**
 * GET /api/material/batches?page=&pageSize=&materialId=&batchNo=&supplier=&status=
 * 批次列表（分页）
 */
async function getBatches(req, res, next) {
  try {
    const { page, pageSize, materialId, batchNo, supplier, status } = req.query;
    const { list, total } = await materialService.getBatches(
      page,
      pageSize,
      {
        materialId: materialId ? Number(materialId) : undefined,
        batchNo,
        supplier,
        status,
      },
    );
    return sendPaginated(res, list, total, page, pageSize, '查询批次列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/material/batches
 * 创建批次（batchNo 全局重复 → 409）
 */
async function createBatch(req, res, next) {
  try {
    const batch = await materialService.createBatch(req.body);
    return sendCreated(res, batch, '创建批次成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/material/batches/:id
 * 更新批次
 */
async function updateBatch(req, res, next) {
  try {
    const { id } = req.params;
    const batch = await materialService.updateBatch(Number(id), req.body);
    return sendSuccess(res, batch, '更新批次成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/material/batches/:id
 * 删除批次
 */
async function deleteBatch(req, res, next) {
  try {
    const { id } = req.params;
    await materialService.deleteBatch(Number(id));
    return sendSuccess(res, null, '删除批次成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

// ==================== 物料追溯（P1-07） ====================

/**
 * GET /api/material/trace/forward?batchNo=
 * 正向追溯：批次 → 去向工单（out 流水按 relatedOrder 分组汇总）
 */
async function getForwardTrace(req, res, next) {
  try {
    const { batchNo } = req.query;
    const result = await materialService.getForwardTrace(batchNo);
    return sendSuccess(res, result, '正向追溯查询成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/material/trace/backward?workOrderNo=
 * 反向追溯：工单 → 来源批次（out 流水 batchNo 去重后关联批次档案）
 */
async function getBackwardTrace(req, res, next) {
  try {
    const { workOrderNo } = req.query;
    const result = await materialService.getBackwardTrace(workOrderNo);
    return sendSuccess(res, result, '反向追溯查询成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
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
  createTransaction,
  getTransactions,
  getBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  getForwardTrace,
  getBackwardTrace,
};
