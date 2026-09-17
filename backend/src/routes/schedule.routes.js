/**
 * MES 系统 - 生产排程路由（P1-01，T08 填充校验中间件）
 * 挂载点：/api/production/schedules（见 routes/index.js，注意需在 /production 之前挂载，
 * 否则会被 P0 的 /production/:id 动态段吞掉）
 *
 * 端点结构与权限码沿用 T06 固化契约，T08 追加 Zod validate 中间件。
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const scheduleController = require('../controllers/schedule.controller');
const {
  scheduleQuerySchema,
  conflictQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  updateScheduleStatusSchema,
  idParamSchema,
} = require('../validators/schedule.validator');

const router = express.Router();

// 所有排程路由都需要登录认证
router.use(authMiddleware);

/**
 * GET /api/production/schedules/conflicts
 * 冲突检测（辅助查询）
 * 注意：必须放在 /:id 类路由之前，避免 'conflicts' 被当作 ID
 * 需要 production:schedule:view 权限
 */
router.get(
  '/conflicts',
  requirePermission('production:schedule:view'),
  validate({ query: conflictQuerySchema }),
  scheduleController.getConflicts,
);

/**
 * GET /api/production/schedules
 * 排程列表（时间窗查询，默认今天起 14 天）
 * 需要 production:schedule:view 权限
 */
router.get(
  '/',
  requirePermission('production:schedule:view'),
  validate({ query: scheduleQuerySchema }),
  scheduleController.getSchedules,
);

/**
 * POST /api/production/schedules
 * 创建排程（同设备时段重叠 → 409）
 * 需要 production:schedule:create 权限
 */
router.post(
  '/',
  requirePermission('production:schedule:create'),
  validate({ body: createScheduleSchema }),
  scheduleController.createSchedule,
);

/**
 * PATCH /api/production/schedules/:id/status
 * 排程状态流转（planned → in_progress → completed / cancelled）
 * 需要 production:schedule:edit 权限
 */
router.patch(
  '/:id/status',
  requirePermission('production:schedule:edit'),
  validate({ params: idParamSchema, body: updateScheduleStatusSchema }),
  scheduleController.updateScheduleStatus,
);

/**
 * PATCH /api/production/schedules/:id
 * 调整排程时段（拖拽提交，返回冲突检测结果；被拒 → 409）
 * 需要 production:schedule:edit 权限
 */
router.patch(
  '/:id',
  requirePermission('production:schedule:edit'),
  validate({ params: idParamSchema, body: updateScheduleSchema }),
  scheduleController.updateSchedule,
);

/**
 * DELETE /api/production/schedules/:id
 * 删除排程
 * 需要 production:schedule:delete 权限
 */
router.delete(
  '/:id',
  requirePermission('production:schedule:delete'),
  validate({ params: idParamSchema }),
  scheduleController.deleteSchedule,
);

module.exports = router;
