/**
 * MES 系统 - 质量管理路由
 * 路由：检验记录 CRUD、不良品 CRUD
 * 需要 authMiddleware 认证 + requirePermission 权限校验
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const qualityController = require('../controllers/quality.controller');
const {
  createInspectionSchema,
  inspectionQuerySchema,
  createDefectSchema,
  updateDefectSchema,
  defectQuerySchema,
  idParamSchema,
} = require('../validators/quality.validator');

const router = express.Router();

// 所有质量管理路由都需要登录认证
router.use(authMiddleware);

// ==================== 检验记录路由 ====================

/**
 * GET /api/quality/inspections
 * 检验记录列表（分页）- 需要 quality:inspection:view 权限
 */
router.get(
  '/inspections',
  requirePermission('quality:inspection:view'),
  validate({ query: inspectionQuerySchema }),
  qualityController.getInspections,
);

/**
 * GET /api/quality/inspections/:id
 * 检验记录详情 - 需要 quality:inspection:view 权限
 */
router.get(
  '/inspections/:id',
  requirePermission('quality:inspection:view'),
  validate({ params: idParamSchema }),
  qualityController.getInspectionById,
);

/**
 * POST /api/quality/inspections
 * 创建检验记录（含检验项明细）- 需要 quality:inspection:create 权限
 */
router.post(
  '/inspections',
  requirePermission('quality:inspection:create'),
  validate({ body: createInspectionSchema }),
  qualityController.createInspection,
);

/**
 * DELETE /api/quality/inspections/:id
 * 删除检验记录 - 需要 quality:inspection:delete 权限
 */
router.delete(
  '/inspections/:id',
  requirePermission('quality:inspection:delete'),
  validate({ params: idParamSchema }),
  qualityController.deleteInspection,
);

// ==================== 不良品记录路由 ====================

/**
 * GET /api/quality/defects
 * 不良品记录列表（分页）- 需要 quality:defect:view 权限
 */
router.get(
  '/defects',
  requirePermission('quality:defect:view'),
  validate({ query: defectQuerySchema }),
  qualityController.getDefects,
);

/**
 * GET /api/quality/defects/:id
 * 不良品记录详情 - 需要 quality:defect:view 权限
 */
router.get(
  '/defects/:id',
  requirePermission('quality:defect:view'),
  validate({ params: idParamSchema }),
  qualityController.getDefectById,
);

/**
 * POST /api/quality/defects
 * 创建不良品记录 - 需要 quality:defect:create 权限
 */
router.post(
  '/defects',
  requirePermission('quality:defect:create'),
  validate({ body: createDefectSchema }),
  qualityController.createDefect,
);

/**
 * PUT /api/quality/defects/:id
 * 处理不良品（更新处理方式）- 需要 quality:defect:handle 权限
 */
router.put(
  '/defects/:id',
  requirePermission('quality:defect:handle'),
  validate({ params: idParamSchema, body: updateDefectSchema }),
  qualityController.updateDefect,
);

/**
 * DELETE /api/quality/defects/:id
 * 删除不良品记录 - 需要 quality:defect:delete 权限
 */
router.delete(
  '/defects/:id',
  requirePermission('quality:defect:delete'),
  validate({ params: idParamSchema }),
  qualityController.deleteDefect,
);

module.exports = router;
