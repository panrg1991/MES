/**
 * MES 系统 - 生产管理路由
 * 路由：工单 CRUD、状态流转、报工录入
 * 需要 authMiddleware 认证 + requirePermission 权限校验
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const productionController = require('../controllers/production.controller');
const {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderQuerySchema,
  transitionStatusSchema,
  createReportSchema,
  idParamSchema,
} = require('../validators/production.validator');

const router = express.Router();

// 所有生产管理路由都需要登录认证
router.use(authMiddleware);

/**
 * GET /api/production
 * 工单列表（分页）- 需要 production:order:view 权限
 */
router.get(
  '/',
  requirePermission('production:order:view'),
  validate({ query: workOrderQuerySchema }),
  productionController.getWorkOrders,
);

/**
 * GET /api/production/:id
 * 工单详情 - 需要 production:order:view 权限
 */
router.get(
  '/:id',
  requirePermission('production:order:view'),
  validate({ params: idParamSchema }),
  productionController.getWorkOrderById,
);

/**
 * POST /api/production
 * 创建工单 - 需要 production:order:create 权限
 */
router.post(
  '/',
  requirePermission('production:order:create'),
  validate({ body: createWorkOrderSchema }),
  productionController.createWorkOrder,
);

/**
 * PUT /api/production/:id
 * 更新工单 - 需要 production:order:edit 权限
 */
router.put(
  '/:id',
  requirePermission('production:order:edit'),
  validate({ params: idParamSchema, body: updateWorkOrderSchema }),
  productionController.updateWorkOrder,
);

/**
 * DELETE /api/production/:id
 * 删除工单 - 需要 production:order:delete 权限
 */
router.delete(
  '/:id',
  requirePermission('production:order:delete'),
  validate({ params: idParamSchema }),
  productionController.deleteWorkOrder,
);

/**
 * PATCH /api/production/:id/status
 * 工单状态流转 - 需要 production:order:status 权限
 */
router.patch(
  '/:id/status',
  requirePermission('production:order:status'),
  validate({ params: idParamSchema, body: transitionStatusSchema }),
  productionController.transitionStatus,
);

/**
 * POST /api/production/:id/reports
 * 报工录入 - 需要 production:order:report 权限
 */
router.post(
  '/:id/reports',
  requirePermission('production:order:report'),
  validate({ params: idParamSchema, body: createReportSchema }),
  productionController.createReport,
);

module.exports = router;
