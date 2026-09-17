/**
 * MES 系统 - 设备故障维修路由【T07 填充完成】
 * 挂载点：/api/equipment/breakdowns（见 routes/index.js，注意需在 /equipment 之前挂载，
 * 否则会被 P0 的 /equipment/:id 动态段吞掉）
 *
 * 端点结构与权限码由 T06 固化，T07 追加 Zod validate 中间件。
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const breakdownController = require('../controllers/breakdown.controller');
const {
  breakdownQuerySchema,
  statisticsQuerySchema,
  createBreakdownSchema,
  repairBreakdownSchema,
  updateBreakdownSchema,
  idParamSchema,
} = require('../validators/breakdown.validator');

const router = express.Router();

// 所有故障维修路由都需要登录认证
router.use(authMiddleware);

/**
 * GET /api/equipment/breakdowns/statistics
 * 设备故障统计（故障频次 TopN / 累计停机时长 / 故障类型分布）
 * 注意：必须放在 /:id 类路由之前，避免 'statistics' 被当作 ID
 * 需要 equipment:breakdown:view 权限
 */
router.get(
  '/statistics',
  requirePermission('equipment:breakdown:view'),
  validate({ query: statisticsQuerySchema }),
  breakdownController.getBreakdownStatistics,
);

/**
 * GET /api/equipment/breakdowns
 * 故障记录列表（分页，repairedAt == null 即待维修）
 * 需要 equipment:breakdown:view 权限
 */
router.get(
  '/',
  requirePermission('equipment:breakdown:view'),
  validate({ query: breakdownQuerySchema }),
  breakdownController.getBreakdowns,
);

/**
 * POST /api/equipment/breakdowns
 * 故障报修（事务：写记录 + 设备置 fault + 状态日志）
 * 需要 equipment:breakdown:create 权限
 */
router.post(
  '/',
  requirePermission('equipment:breakdown:create'),
  validate({ body: createBreakdownSchema }),
  breakdownController.createBreakdown,
);

/**
 * PATCH /api/equipment/breakdowns/:id/repair
 * 维修完成（计算 downtimeDuration + 恢复设备状态）
 * 需要 equipment:breakdown:repair 权限
 */
router.patch(
  '/:id/repair',
  requirePermission('equipment:breakdown:repair'),
  validate({ params: idParamSchema, body: repairBreakdownSchema }),
  breakdownController.completeRepair,
);

/**
 * PUT /api/equipment/breakdowns/:id
 * 更新故障记录
 * 需要 equipment:breakdown:repair 权限
 */
router.put(
  '/:id',
  requirePermission('equipment:breakdown:repair'),
  validate({ params: idParamSchema, body: updateBreakdownSchema }),
  breakdownController.updateBreakdown,
);

/**
 * DELETE /api/equipment/breakdowns/:id
 * 删除故障记录
 * 需要 equipment:breakdown:delete 权限
 */
router.delete(
  '/:id',
  requirePermission('equipment:breakdown:delete'),
  validate({ params: idParamSchema }),
  breakdownController.deleteBreakdown,
);

module.exports = router;
