/**
 * MES 系统 - 设备维保路由【T07 填充完成】
 * 挂载点：/api/equipment/maintenance（见 routes/index.js，注意需在 /equipment 之前挂载，
 * 否则会被 P0 的 /equipment/:id 动态段吞掉）
 *
 * 端点结构与权限码由 T06 固化，T07 追加 Zod validate 中间件。
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const maintenanceController = require('../controllers/maintenance.controller');
const {
  planQuerySchema,
  dueQuerySchema,
  recordQuerySchema,
  createPlanSchema,
  updatePlanSchema,
  createRecordSchema,
  updateRecordSchema,
  idParamSchema,
} = require('../validators/maintenance.validator');

const router = express.Router();

// 所有维保路由都需要登录认证
router.use(authMiddleware);

// ==================== 维保计划 ====================

/**
 * GET /api/equipment/maintenance/due?days=7
 * 到期提醒列表（仅 status=active 且 nextDate <= now + days，含逾期天数）
 * 需要 equipment:maintenance:view 权限
 */
router.get(
  '/due',
  requirePermission('equipment:maintenance:view'),
  validate({ query: dueQuerySchema }),
  maintenanceController.getDuePlans,
);

/**
 * GET /api/equipment/maintenance/plans
 * 维保计划列表（分页，含 isDue / dueSoon）
 * 需要 equipment:maintenance:view 权限
 */
router.get(
  '/plans',
  requirePermission('equipment:maintenance:view'),
  validate({ query: planQuerySchema }),
  maintenanceController.getPlans,
);

/**
 * POST /api/equipment/maintenance/plans
 * 创建维保计划
 * 需要 equipment:maintenance:create 权限
 */
router.post(
  '/plans',
  requirePermission('equipment:maintenance:create'),
  validate({ body: createPlanSchema }),
  maintenanceController.createPlan,
);

/**
 * PUT /api/equipment/maintenance/plans/:id
 * 更新维保计划（周期 / 下次日期 / 启停）
 * 需要 equipment:maintenance:edit 权限
 */
router.put(
  '/plans/:id',
  requirePermission('equipment:maintenance:edit'),
  validate({ params: idParamSchema, body: updatePlanSchema }),
  maintenanceController.updatePlan,
);

/**
 * DELETE /api/equipment/maintenance/plans/:id
 * 删除维保计划（历史维保记录保留，planId 置空）
 * 需要 equipment:maintenance:delete 权限
 */
router.delete(
  '/plans/:id',
  requirePermission('equipment:maintenance:delete'),
  validate({ params: idParamSchema }),
  maintenanceController.deletePlan,
);

// ==================== 维保记录 ====================

/**
 * GET /api/equipment/maintenance/records
 * 维保记录列表（分页）
 * 需要 equipment:maintenance:view 权限
 */
router.get(
  '/records',
  requirePermission('equipment:maintenance:view'),
  validate({ query: recordQuerySchema }),
  maintenanceController.getRecords,
);

/**
 * POST /api/equipment/maintenance/records
 * 登记维保记录（事务内顺延 nextDate；planId 为空即临时保养，不顺延）
 * 需要 equipment:maintenance:complete 权限
 */
router.post(
  '/records',
  requirePermission('equipment:maintenance:complete'),
  validate({ body: createRecordSchema }),
  maintenanceController.createRecord,
);

/**
 * PUT /api/equipment/maintenance/records/:id
 * 更新维保记录
 * 需要 equipment:maintenance:complete 权限
 */
router.put(
  '/records/:id',
  requirePermission('equipment:maintenance:complete'),
  validate({ params: idParamSchema, body: updateRecordSchema }),
  maintenanceController.updateRecord,
);

/**
 * DELETE /api/equipment/maintenance/records/:id
 * 删除维保记录
 * 需要 equipment:maintenance:delete 权限
 */
router.delete(
  '/records/:id',
  requirePermission('equipment:maintenance:delete'),
  validate({ params: idParamSchema }),
  maintenanceController.deleteRecord,
);

module.exports = router;
