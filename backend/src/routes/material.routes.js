/**
 * MES 系统 - 物料管理路由
 * 路由：物料 CRUD、BOM CRUD、库存查询、出入库事务
 * 需要 authMiddleware 认证 + requirePermission 权限校验
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const materialController = require('../controllers/material.controller');
const {
  createMaterialSchema,
  updateMaterialSchema,
  materialQuerySchema,
  createBOMSchema,
  updateBOMSchema,
  bomQuerySchema,
  createTransactionSchema,
  transactionQuerySchema,
  inventoryQuerySchema,
  inventoryWarningQuerySchema,
  createBatchSchema,
  updateBatchSchema,
  batchQuerySchema,
  batchNoQuerySchema,
  workOrderNoQuerySchema,
  idParamSchema,
} = require('../validators/material.validator');

const router = express.Router();

// 所有物料管理路由都需要登录认证
router.use(authMiddleware);

// ==================== 物料主数据路由 ====================

/**
 * GET /api/material/materials
 * 物料列表（分页）- 需要 material:items:view 权限
 */
router.get(
  '/materials',
  requirePermission('material:items:view'),
  validate({ query: materialQuerySchema }),
  materialController.getMaterials,
);

/**
 * GET /api/material/materials/:id
 * 物料详情 - 需要 material:items:view 权限
 */
router.get(
  '/materials/:id',
  requirePermission('material:items:view'),
  validate({ params: idParamSchema }),
  materialController.getMaterialById,
);

/**
 * POST /api/material/materials
 * 创建物料 - 需要 material:items:create 权限
 */
router.post(
  '/materials',
  requirePermission('material:items:create'),
  validate({ body: createMaterialSchema }),
  materialController.createMaterial,
);

/**
 * PUT /api/material/materials/:id
 * 更新物料 - 需要 material:items:edit 权限
 */
router.put(
  '/materials/:id',
  requirePermission('material:items:edit'),
  validate({ params: idParamSchema, body: updateMaterialSchema }),
  materialController.updateMaterial,
);

/**
 * DELETE /api/material/materials/:id
 * 删除物料 - 需要 material:items:delete 权限
 */
router.delete(
  '/materials/:id',
  requirePermission('material:items:delete'),
  validate({ params: idParamSchema }),
  materialController.deleteMaterial,
);

// ==================== BOM 管理路由 ====================

/**
 * GET /api/material/bom
 * BOM 列表（分页）- 需要 material:bom:view 权限
 */
router.get(
  '/bom',
  requirePermission('material:bom:view'),
  validate({ query: bomQuerySchema }),
  materialController.getBOMs,
);

/**
 * GET /api/material/bom/:id
 * BOM 详情（含明细项）- 需要 material:bom:view 权限
 */
router.get(
  '/bom/:id',
  requirePermission('material:bom:view'),
  validate({ params: idParamSchema }),
  materialController.getBOMById,
);

/**
 * POST /api/material/bom
 * 创建 BOM - 需要 material:bom:create 权限
 */
router.post(
  '/bom',
  requirePermission('material:bom:create'),
  validate({ body: createBOMSchema }),
  materialController.createBOM,
);

/**
 * PUT /api/material/bom/:id
 * 更新 BOM - 需要 material:bom:edit 权限
 */
router.put(
  '/bom/:id',
  requirePermission('material:bom:edit'),
  validate({ params: idParamSchema, body: updateBOMSchema }),
  materialController.updateBOM,
);

/**
 * DELETE /api/material/bom/:id
 * 删除 BOM - 需要 material:bom:delete 权限
 */
router.delete(
  '/bom/:id',
  requirePermission('material:bom:delete'),
  validate({ params: idParamSchema }),
  materialController.deleteBOM,
);

// ==================== 库存管理路由 ====================

/**
 * GET /api/material/inventory/warnings
 * 【P1-08】库存预警列表（quantity < safetyStock）- 需要 material:warning:view 权限
 * 注意：静态段 /inventory/warnings 必须注册在任何 /inventory/:id 类动态路由之前
 */
router.get(
  '/inventory/warnings',
  requirePermission('material:warning:view'),
  validate({ query: inventoryWarningQuerySchema }),
  materialController.getInventoryWarnings,
);

/**
 * GET /api/material/inventory
 * 库存列表（分页，含安全库存预警标识；P1 支持 warning=true 只看预警）
 * - 需要 material:inventory:view 权限
 */
router.get(
  '/inventory',
  requirePermission('material:inventory:view'),
  validate({ query: inventoryQuerySchema }),
  materialController.getInventoryList,
);

/**
 * GET /api/material/inventory/transactions
 * 出入库流水记录（分页）- 需要 material:inventory:view 权限
 * 注意：此路由需放在 /:id 类路由之前（当前无 /inventory/:id 路由，但为安全起见提前）
 */
router.get(
  '/inventory/transactions',
  requirePermission('material:inventory:view'),
  validate({ query: transactionQuerySchema }),
  materialController.getTransactions,
);

/**
 * POST /api/material/inventory/transactions
 * 创建出入库事务 - 需要 material:inventory:transact 权限
 */
router.post(
  '/inventory/transactions',
  requirePermission('material:inventory:transact'),
  validate({ body: createTransactionSchema }),
  materialController.createTransaction,
);

// ==================== 批次管理路由（P1-07） ====================

/**
 * GET /api/material/batches
 * 批次列表（分页）- 需要 material:batch:view 权限
 */
router.get(
  '/batches',
  requirePermission('material:batch:view'),
  validate({ query: batchQuerySchema }),
  materialController.getBatches,
);

/**
 * POST /api/material/batches
 * 创建批次（batchNo 全局重复 → 409）- 需要 material:batch:create 权限
 */
router.post(
  '/batches',
  requirePermission('material:batch:create'),
  validate({ body: createBatchSchema }),
  materialController.createBatch,
);

/**
 * PUT /api/material/batches/:id
 * 更新批次 - 需要 material:batch:edit 权限
 */
router.put(
  '/batches/:id',
  requirePermission('material:batch:edit'),
  validate({ params: idParamSchema, body: updateBatchSchema }),
  materialController.updateBatch,
);

/**
 * DELETE /api/material/batches/:id
 * 删除批次 - 需要 material:batch:delete 权限
 */
router.delete(
  '/batches/:id',
  requirePermission('material:batch:delete'),
  validate({ params: idParamSchema }),
  materialController.deleteBatch,
);

// ==================== 物料追溯路由（P1-07） ====================

/**
 * GET /api/material/trace/forward?batchNo=
 * 正向追溯（批次 → 去向工单）- 需要 material:trace:view 权限
 */
router.get(
  '/trace/forward',
  requirePermission('material:trace:view'),
  validate({ query: batchNoQuerySchema }),
  materialController.getForwardTrace,
);

/**
 * GET /api/material/trace/backward?workOrderNo=
 * 反向追溯（工单 → 来源批次）- 需要 material:trace:view 权限
 */
router.get(
  '/trace/backward',
  requirePermission('material:trace:view'),
  validate({ query: workOrderNoQuerySchema }),
  materialController.getBackwardTrace,
);

module.exports = router;
