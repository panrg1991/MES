/**
 * MES 系统 - 人员管理路由（P1-09 排班 + P1-10 工时，T08 填充校验中间件）
 * 挂载点：/api/personnel（见 routes/index.js）
 *
 * 端点结构与权限码沿用 T06 固化契约，T08 追加 Zod validate 中间件与工时汇总端点。
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const personnelController = require('../controllers/personnel.controller');
const {
  createShiftSchema,
  updateShiftSchema,
  scheduleQuerySchema,
  calendarQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  workHoursQuerySchema,
  workHoursSummaryQuerySchema,
  createWorkHoursSchema,
  updateWorkHoursSchema,
  idParamSchema,
} = require('../validators/personnel.validator');

const router = express.Router();

// 所有人员管理路由都需要登录认证
router.use(authMiddleware);

// ==================== 班次管理（P1-09） ====================

/**
 * GET /api/personnel/shifts
 * 班次列表
 * 需要 personnel:shift:view 权限
 */
router.get(
  '/shifts',
  requirePermission('personnel:shift:view'),
  personnelController.getShifts,
);

/**
 * POST /api/personnel/shifts
 * 创建班次（HH:mm；开始 == 结束 → 400）
 * 需要 personnel:shift:create 权限
 */
router.post(
  '/shifts',
  requirePermission('personnel:shift:create'),
  validate({ body: createShiftSchema }),
  personnelController.createShift,
);

/**
 * PUT /api/personnel/shifts/:id
 * 更新班次
 * 需要 personnel:shift:edit 权限
 */
router.put(
  '/shifts/:id',
  requirePermission('personnel:shift:edit'),
  validate({ params: idParamSchema, body: updateShiftSchema }),
  personnelController.updateShift,
);

/**
 * DELETE /api/personnel/shifts/:id
 * 删除班次
 * 需要 personnel:shift:delete 权限
 */
router.delete(
  '/shifts/:id',
  requirePermission('personnel:shift:delete'),
  validate({ params: idParamSchema }),
  personnelController.deleteShift,
);

// ==================== 排班（P1-09） ====================

/**
 * GET /api/personnel/schedules/calendar
 * 排班日历矩阵（按日期 × 人员）
 * 注意：必须放在 /schedules/:id 类路由之前，避免 'calendar' 被当作 ID
 * 需要 personnel:schedule:view 权限
 */
router.get(
  '/schedules/calendar',
  requirePermission('personnel:schedule:view'),
  validate({ query: calendarQuerySchema }),
  personnelController.getScheduleCalendar,
);

/**
 * GET /api/personnel/schedules
 * 排班列表（分页）
 * 需要 personnel:schedule:view 权限
 */
router.get(
  '/schedules',
  requirePermission('personnel:schedule:view'),
  validate({ query: scheduleQuerySchema }),
  personnelController.getSchedules,
);

/**
 * POST /api/personnel/schedules
 * 新增排班（同人 + 同日 + 同班次 → 409）
 * 需要 personnel:schedule:create 权限
 */
router.post(
  '/schedules',
  requirePermission('personnel:schedule:create'),
  validate({ body: createScheduleSchema }),
  personnelController.createSchedule,
);

/**
 * PUT /api/personnel/schedules/:id
 * 换班 / 调班
 * 需要 personnel:schedule:edit 权限
 */
router.put(
  '/schedules/:id',
  requirePermission('personnel:schedule:edit'),
  validate({ params: idParamSchema, body: updateScheduleSchema }),
  personnelController.updateSchedule,
);

/**
 * DELETE /api/personnel/schedules/:id
 * 删除排班
 * 需要 personnel:schedule:delete 权限
 */
router.delete(
  '/schedules/:id',
  requirePermission('personnel:schedule:delete'),
  validate({ params: idParamSchema }),
  personnelController.deleteSchedule,
);

// ==================== 工时（P1-10） ====================

/**
 * GET /api/personnel/workhours
 * 工时列表（分页）
 * 需要 personnel:workhours:view 权限
 */
router.get(
  '/workhours',
  requirePermission('personnel:workhours:view'),
  validate({ query: workHoursQuerySchema }),
  personnelController.getWorkHours,
);

/**
 * GET /api/personnel/workhours/summary
 * 工时汇总（多维度：user / shift / date / workOrder）
 * 注意：必须放在 /workhours/:id 类路由之前（P1 静态段优先惯例）
 * 需要 personnel:workhours:view 权限
 */
router.get(
  '/workhours/summary',
  requirePermission('personnel:workhours:view'),
  validate({ query: workHoursSummaryQuerySchema }),
  personnelController.getWorkHoursSummary,
);

/**
 * POST /api/personnel/workhours
 * 录入工时（hours 服务端自动计算）
 * 需要 personnel:workhours:create 权限
 */
router.post(
  '/workhours',
  requirePermission('personnel:workhours:create'),
  validate({ body: createWorkHoursSchema }),
  personnelController.createWorkHours,
);

/**
 * PUT /api/personnel/workhours/:id
 * 更新工时（hours 重新计算）
 * 需要 personnel:workhours:edit 权限
 */
router.put(
  '/workhours/:id',
  requirePermission('personnel:workhours:edit'),
  validate({ params: idParamSchema, body: updateWorkHoursSchema }),
  personnelController.updateWorkHours,
);

/**
 * DELETE /api/personnel/workhours/:id
 * 删除工时记录
 * 需要 personnel:workhours:edit 权限
 */
router.delete(
  '/workhours/:id',
  requirePermission('personnel:workhours:edit'),
  validate({ params: idParamSchema }),
  personnelController.deleteWorkHours,
);

module.exports = router;
