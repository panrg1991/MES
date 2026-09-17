/**
 * MES 系统 - 设备故障维修控制器【T07 实现】
 * 端点（挂载于 /api/equipment/breakdowns，路由骨架由 T06 固化）：
 *  GET    /                故障记录列表（repairedAt==null 即待维修）
 *  GET    /statistics      故障统计（TopN/累计停机/故障类型分布）
 *  POST   /                报修（事务：写记录 + 设备置 fault + 状态日志）
 *  PATCH  /:id/repair      维修完成（算 downtimeDuration + 状态恢复）
 *  PUT    /:id             更新故障记录
 *  DELETE /:id             删除故障记录
 */

const breakdownService = require('../services/breakdown.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/**
 * GET /api/equipment/breakdowns
 * 故障记录列表（分页）
 */
async function getBreakdowns(req, res, next) {
  try {
    const { list, total } = await breakdownService.getBreakdowns(req.query);
    return sendPaginated(
      res,
      list,
      total,
      req.query.page,
      req.query.pageSize,
      '查询故障记录列表成功',
    );
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/equipment/breakdowns/statistics
 * 设备故障统计（故障频次 TopN / 累计停机时长 / 故障类型分布）
 */
async function getBreakdownStatistics(req, res, next) {
  try {
    const statistics = await breakdownService.getStatistics(req.query);
    return sendSuccess(res, statistics, '查询故障统计成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/equipment/breakdowns
 * 故障报修（事务：写记录 + 设备置 fault + 状态日志）
 */
async function createBreakdown(req, res, next) {
  try {
    const operatorId = req.user?.userId;
    const breakdown = await breakdownService.reportBreakdown(
      req.body,
      operatorId,
    );
    return sendCreated(res, breakdown, '故障报修成功，设备状态已置为故障');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PATCH /api/equipment/breakdowns/:id/repair
 * 维修完成（服务端计算 downtimeDuration + 恢复设备状态）
 */
async function completeRepair(req, res, next) {
  try {
    const { id } = req.params;
    const operatorId = req.user?.userId;
    const breakdown = await breakdownService.completeRepair(
      Number(id),
      req.body,
      operatorId,
    );
    return sendSuccess(
      res,
      breakdown,
      `维修完成，停机时长 ${breakdown.downtimeDuration} 分钟，设备已复机`,
    );
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/equipment/breakdowns/:id
 * 更新故障记录
 */
async function updateBreakdown(req, res, next) {
  try {
    const { id } = req.params;
    const breakdown = await breakdownService.updateBreakdown(
      Number(id),
      req.body,
    );
    return sendSuccess(res, breakdown, '更新故障记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/equipment/breakdowns/:id
 * 删除故障记录
 */
async function deleteBreakdown(req, res, next) {
  try {
    const { id } = req.params;
    await breakdownService.deleteBreakdown(Number(id));
    return sendSuccess(res, null, '删除故障记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getBreakdowns,
  getBreakdownStatistics,
  createBreakdown,
  completeRepair,
  updateBreakdown,
  deleteBreakdown,
};
