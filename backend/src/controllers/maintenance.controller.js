/**
 * MES 系统 - 设备维保控制器【T07 实现】
 * 端点（挂载于 /api/equipment/maintenance，路由骨架由 T06 固化）：
 *  GET    /plans                 维保计划列表（含 isDue/dueSoon）
 *  GET    /due                   到期提醒列表（status=active 且 nextDate<=now+days）
 *  POST   /plans                 创建计划
 *  PUT    /plans/:id             更新计划
 *  DELETE /plans/:id             删除计划（记录保留，planId 置空）
 *  GET    /records               维保记录列表
 *  POST   /records               登记记录（事务内顺延 nextDate，planId 可选）
 *  PUT    /records/:id           更新记录
 *  DELETE /records/:id           删除记录
 */

const maintenanceService = require('../services/maintenance.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/** 日期格式化：YYYY-MM-DD（用于顺延提示文案） */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * GET /api/equipment/maintenance/plans
 * 维保计划列表（分页，含 isDue/dueSoon）
 */
async function getPlans(req, res, next) {
  try {
    const { list, total } = await maintenanceService.getPlans(req.query);
    return sendPaginated(
      res,
      list,
      total,
      req.query.page,
      req.query.pageSize,
      '查询维保计划列表成功',
    );
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/equipment/maintenance/due?days=7
 * 到期提醒列表（仅 active 计划，含 overdueDays）
 */
async function getDuePlans(req, res, next) {
  try {
    const days = req.query.days || 7;
    const { list } = await maintenanceService.getDueList(days);
    return sendSuccess(res, { list }, '查询维保到期提醒成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/equipment/maintenance/plans
 * 创建维保计划
 */
async function createPlan(req, res, next) {
  try {
    const plan = await maintenanceService.createPlan(req.body);
    return sendCreated(res, plan, '创建维保计划成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/equipment/maintenance/plans/:id
 * 更新维保计划
 */
async function updatePlan(req, res, next) {
  try {
    const { id } = req.params;
    const plan = await maintenanceService.updatePlan(Number(id), req.body);
    return sendSuccess(res, plan, '更新维保计划成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/equipment/maintenance/plans/:id
 * 删除维保计划（历史维保记录保留，planId 置空）
 */
async function deletePlan(req, res, next) {
  try {
    const { id } = req.params;
    await maintenanceService.deletePlan(Number(id));
    return sendSuccess(res, null, '删除维保计划成功（历史维保记录已保留）');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/equipment/maintenance/records
 * 维保记录列表（分页）
 */
async function getRecords(req, res, next) {
  try {
    const { list, total } = await maintenanceService.getRecords(req.query);
    return sendPaginated(
      res,
      list,
      total,
      req.query.page,
      req.query.pageSize,
      '查询维保记录列表成功',
    );
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/equipment/maintenance/records
 * 登记维保记录（事务内顺延 nextDate；planId 为空即临时保养，不顺延）
 */
async function createRecord(req, res, next) {
  try {
    const { record, plan } = await maintenanceService.createRecord(req.body);
    const message = plan
      ? `维保记录登记成功，下次维保日期已顺延至 ${formatDate(plan.nextDate)}`
      : '临时保养记录登记成功（未关联计划，不顺延）';
    return sendCreated(res, { record, plan }, message);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/equipment/maintenance/records/:id
 * 更新维保记录
 */
async function updateRecord(req, res, next) {
  try {
    const { id } = req.params;
    const record = await maintenanceService.updateRecord(Number(id), req.body);
    return sendSuccess(res, record, '更新维保记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/equipment/maintenance/records/:id
 * 删除维保记录
 */
async function deleteRecord(req, res, next) {
  try {
    const { id } = req.params;
    await maintenanceService.deleteRecord(Number(id));
    return sendSuccess(res, null, '删除维保记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getPlans,
  getDuePlans,
  createPlan,
  updatePlan,
  deletePlan,
  getRecords,
  createRecord,
  updateRecord,
  deleteRecord,
};
