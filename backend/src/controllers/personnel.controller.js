/**
 * MES 系统 - 人员管理控制器（P1-09 排班 + P1-10 工时，T08 实现）
 *
 * 端点：
 *  GET    /api/personnel/shifts               班次列表
 *  POST   /api/personnel/shifts               创建班次（HH:mm 校验，开始 != 结束）
 *  PUT    /api/personnel/shifts/:id           更新班次
 *  DELETE /api/personnel/shifts/:id           删除班次
 *  GET    /api/personnel/schedules/calendar   排班日历矩阵
 *  GET    /api/personnel/schedules            排班列表（分页）
 *  POST   /api/personnel/schedules            新增排班（重复 → 409）
 *  PUT    /api/personnel/schedules/:id        换班/调班（冲突 → 409）
 *  DELETE /api/personnel/schedules/:id        删除排班
 *  GET    /api/personnel/workhours            工时列表（分页）
 *  GET    /api/personnel/workhours/summary    工时汇总（多维度）
 *  POST   /api/personnel/workhours            录入工时（hours 服务端计算）
 *  PUT    /api/personnel/workhours/:id        更新工时
 *  DELETE /api/personnel/workhours/:id        删除工时
 */

const personnelService = require('../services/personnel.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/**
 * 统一错误分发：带 statusCode 的业务异常直接返回，其余交给全局 errorHandler
 * @param {object} res - Express Response
 * @param {Error} error - 错误对象
 * @param {Function} next - Express next
 */
function dispatchError(res, error, next) {
  if (error.statusCode) {
    return sendError(res, error.message, error.statusCode);
  }
  return next(error);
}

// ==================== 班次 ====================

/**
 * GET /api/personnel/shifts
 * 班次列表
 */
async function getShifts(req, res, next) {
  try {
    const { list } = await personnelService.getShifts();
    return sendSuccess(res, { list }, '查询班次列表成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * POST /api/personnel/shifts
 * 创建班次
 */
async function createShift(req, res, next) {
  try {
    const shift = await personnelService.createShift(req.body);
    return sendCreated(res, { shift }, '创建班次成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * PUT /api/personnel/shifts/:id
 * 更新班次
 */
async function updateShift(req, res, next) {
  try {
    const { id } = req.params;
    const shift = await personnelService.updateShift(Number(id), req.body);
    return sendSuccess(res, { shift }, '更新班次成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * DELETE /api/personnel/shifts/:id
 * 删除班次
 */
async function deleteShift(req, res, next) {
  try {
    const { id } = req.params;
    await personnelService.deleteShift(Number(id));
    return sendSuccess(res, null, '删除班次成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

// ==================== 排班 ====================

/**
 * GET /api/personnel/schedules/calendar
 * 排班日历矩阵（按日期分组）
 */
async function getScheduleCalendar(req, res, next) {
  try {
    const { matrix } = await personnelService.getScheduleCalendar(req.query);
    return sendSuccess(res, { matrix }, '查询排班日历成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * GET /api/personnel/schedules
 * 排班列表（分页）
 */
async function getSchedules(req, res, next) {
  try {
    const { list, total, page, pageSize } = await personnelService.getSchedules(req.query);
    return sendPaginated(res, list, total, page, pageSize, '查询排班列表成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * POST /api/personnel/schedules
 * 新增排班（同人 + 同日 + 同班次 → 409）
 */
async function createSchedule(req, res, next) {
  try {
    const schedule = await personnelService.createSchedule(req.body);
    return sendCreated(res, { schedule }, '新增排班成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * PUT /api/personnel/schedules/:id
 * 换班 / 调班（冲突 → 409）
 */
async function updateSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const schedule = await personnelService.updateSchedule(Number(id), req.body);
    return sendSuccess(res, { schedule }, '调整排班成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * DELETE /api/personnel/schedules/:id
 * 删除排班
 */
async function deleteSchedule(req, res, next) {
  try {
    const { id } = req.params;
    await personnelService.deleteSchedule(Number(id));
    return sendSuccess(res, null, '删除排班成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

// ==================== 工时 ====================

/**
 * GET /api/personnel/workhours
 * 工时列表（分页）
 */
async function getWorkHours(req, res, next) {
  try {
    const { list, total, page, pageSize } = await personnelService.getWorkHours(req.query);
    return sendPaginated(res, list, total, page, pageSize, '查询工时列表成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * GET /api/personnel/workhours/summary
 * 工时汇总（多维度：user / shift / date / workOrder）
 */
async function getWorkHoursSummary(req, res, next) {
  try {
    const result = await personnelService.getWorkHoursSummary(req.query);
    return sendSuccess(res, result, '查询工时汇总成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * POST /api/personnel/workhours
 * 录入工时（hours 服务端自动计算，跨夜 +24h）
 */
async function createWorkHours(req, res, next) {
  try {
    const record = await personnelService.createWorkHours(req.body);
    return sendCreated(res, { record }, '录入工时成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * PUT /api/personnel/workhours/:id
 * 更新工时（hours 重新计算）
 */
async function updateWorkHours(req, res, next) {
  try {
    const { id } = req.params;
    const record = await personnelService.updateWorkHours(Number(id), req.body);
    return sendSuccess(res, { record }, '更新工时成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

/**
 * DELETE /api/personnel/workhours/:id
 * 删除工时记录
 */
async function deleteWorkHours(req, res, next) {
  try {
    const { id } = req.params;
    await personnelService.deleteWorkHours(Number(id));
    return sendSuccess(res, null, '删除工时记录成功');
  } catch (error) {
    return dispatchError(res, error, next);
  }
}

module.exports = {
  getShifts,
  createShift,
  updateShift,
  deleteShift,
  getScheduleCalendar,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getWorkHours,
  getWorkHoursSummary,
  createWorkHours,
  updateWorkHours,
  deleteWorkHours,
};
