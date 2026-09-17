/**
 * MES 系统 - 生产排程控制器（P1-01 甘特排程，T08 实现）
 *
 * 端点：
 *  GET    /api/production/schedules            排程列表（时间窗查询）
 *  GET    /api/production/schedules/conflicts  冲突检测（辅助查询）
 *  POST   /api/production/schedules            创建排程（同设备重叠 → 409）
 *  PATCH  /api/production/schedules/:id        调整时段（返回冲突检测结果）
 *  PATCH  /api/production/schedules/:id/status 状态流转
 *  DELETE /api/production/schedules/:id        删除排程
 */

const scheduleService = require('../services/schedule.service');
const {
  sendSuccess,
  sendCreated,
  sendError,
} = require('../utils/response');

/**
 * 409 冲突统一响应：data 携带冲突明细（供前端条块回弹后高亮冲突对）
 * @param {object} res - Express Response
 * @param {Error} error - 带 conflicts 属性的业务异常
 */
function sendConflictWithDetails(res, error) {
  return res.status(409).json({
    code: 409,
    data: { conflicts: error.conflicts || [] },
    message: error.message,
  });
}

/**
 * 统一错误分发：带 statusCode 的业务异常直接返回，其余交给全局 errorHandler
 * @param {object} res - Express Response
 * @param {Error} error - 错误对象
 * @param {Function} next - Express next
 */
function dispatchError(res, error, next) {
  if (error.statusCode === 409 && error.conflicts) {
    return sendConflictWithDetails(res, error);
  }
  if (error.statusCode) {
    return sendError(res, error.message, error.statusCode);
  }
  return next(error);
}

/**
 * GET /api/production/schedules
 * 排程列表（时间窗查询，默认今天起 14 天；支持 workOrderId 过滤）
 */
async function getSchedules(req, res, next) {
  try {
    const { list, total } = await scheduleService.getSchedules(req.query);
    return sendSuccess(res, { list, total }, '查询排程列表成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * GET /api/production/schedules/conflicts
 * 冲突检测（辅助查询，供前端高亮冲突对）
 */
async function getConflicts(req, res, next) {
  try {
    const { conflicts } = await scheduleService.checkConflicts(req.query);
    return sendSuccess(res, { conflicts }, '冲突检测完成');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * POST /api/production/schedules
 * 创建排程（同设备时段重叠 → 409）
 */
async function createSchedule(req, res, next) {
  try {
    const schedule = await scheduleService.createSchedule(req.body);
    return sendCreated(res, { schedule }, '创建排程成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * PATCH /api/production/schedules/:id
 * 调整排程时段（拖拽提交，返回冲突检测结果；被拒 → 409）
 */
async function updateSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const result = await scheduleService.updateSchedule(Number(id), req.body);
    return sendSuccess(res, result, '调整排程成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * PATCH /api/production/schedules/:id/status
 * 排程状态流转（planned → in_progress → completed / cancelled）
 */
async function updateScheduleStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const schedule = await scheduleService.updateScheduleStatus(Number(id), status);
    return sendSuccess(res, { schedule }, '排程状态流转成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * DELETE /api/production/schedules/:id
 * 删除排程
 */
async function deleteSchedule(req, res, next) {
  try {
    const { id } = req.params;
    await scheduleService.deleteSchedule(Number(id));
    return sendSuccess(res, null, '删除排程成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

module.exports = {
  getSchedules,
  getConflicts,
  createSchedule,
  updateSchedule,
  updateScheduleStatus,
  deleteSchedule,
};
