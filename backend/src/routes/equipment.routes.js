/**
 * MES 系统 - 设备管理路由
 * 路由：设备 CRUD、状态切换、状态统计
 * 需要 authMiddleware 认证 + requirePermission 权限校验
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const equipmentController = require('../controllers/equipment.controller');
const {
  createEquipmentSchema,
  updateEquipmentSchema,
  equipmentQuerySchema,
  changeStatusSchema,
  idParamSchema,
} = require('../validators/equipment.validator');

const router = express.Router();

// 所有设备管理路由都需要登录认证
router.use(authMiddleware);

/**
 * GET /api/equipment/status-summary
 * 设备状态统计（需放在 /:id 路由之前，避免路由冲突）
 * 需要 equipment:list:view 权限
 */
router.get(
  '/status-summary',
  requirePermission('equipment:list:view'),
  equipmentController.getStatusSummary,
);

/**
 * GET /api/equipment
 * 设备列表（分页）- 需要 equipment:list:view 权限
 */
router.get(
  '/',
  requirePermission('equipment:list:view'),
  validate({ query: equipmentQuerySchema }),
  equipmentController.getEquipments,
);

/**
 * GET /api/equipment/:id
 * 设备详情 - 需要 equipment:list:view 权限
 */
router.get(
  '/:id',
  requirePermission('equipment:list:view'),
  validate({ params: idParamSchema }),
  equipmentController.getEquipmentById,
);

/**
 * POST /api/equipment
 * 创建设备 - 需要 equipment:list:create 权限
 */
router.post(
  '/',
  requirePermission('equipment:list:create'),
  validate({ body: createEquipmentSchema }),
  equipmentController.createEquipment,
);

/**
 * PUT /api/equipment/:id
 * 更新设备 - 需要 equipment:list:edit 权限
 */
router.put(
  '/:id',
  requirePermission('equipment:list:edit'),
  validate({ params: idParamSchema, body: updateEquipmentSchema }),
  equipmentController.updateEquipment,
);

/**
 * DELETE /api/equipment/:id
 * 删除设备 - 需要 equipment:list:delete 权限
 */
router.delete(
  '/:id',
  requirePermission('equipment:list:delete'),
  validate({ params: idParamSchema }),
  equipmentController.deleteEquipment,
);

/**
 * PATCH /api/equipment/:id/status
 * 切换设备状态 - 需要 equipment:list:status 权限
 */
router.patch(
  '/:id/status',
  requirePermission('equipment:list:status'),
  validate({ params: idParamSchema, body: changeStatusSchema }),
  equipmentController.changeStatus,
);

module.exports = router;
