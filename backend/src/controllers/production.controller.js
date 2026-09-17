/**
 * MES 系统 - 生产管理控制器
 * 处理：工单列表、详情、创建、更新、删除、状态流转、报工
 */

const productionService = require('../services/production.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/**
 * GET /api/production?page=&pageSize=&keyword=&status=&priority=
 * 工单列表（分页）
 */
async function getWorkOrders(req, res, next) {
  try {
    const { page, pageSize, keyword, status, priority } = req.query;
    const { list, total } = await productionService.getWorkOrders(
      page,
      pageSize,
      keyword,
      status,
      priority,
    );
    return sendPaginated(res, list, total, page, pageSize, '查询工单列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/production/:id
 * 工单详情（含报工记录、状态日志）
 */
async function getWorkOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const order = await productionService.getWorkOrderById(Number(id));
    return sendSuccess(res, order, '查询工单详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/production
 * 创建工单
 */
async function createWorkOrder(req, res, next) {
  try {
    const order = await productionService.createWorkOrder(req.body);
    return sendCreated(res, order, '创建工单成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/production/:id
 * 更新工单
 */
async function updateWorkOrder(req, res, next) {
  try {
    const { id } = req.params;
    const order = await productionService.updateWorkOrder(Number(id), req.body);
    return sendSuccess(res, order, '更新工单成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/production/:id
 * 删除工单
 */
async function deleteWorkOrder(req, res, next) {
  try {
    const { id } = req.params;
    await productionService.deleteWorkOrder(Number(id));
    return sendSuccess(res, null, '删除工单成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PATCH /api/production/:id/status
 * 工单状态流转
 */
async function transitionStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { toStatus, remark } = req.body;
    const operatorId = req.user?.userId;
    const order = await productionService.transitionStatus(
      Number(id),
      toStatus,
      operatorId,
      remark,
    );
    return sendSuccess(res, order, '状态流转成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/production/:id/reports
 * 报工录入
 */
async function createReport(req, res, next) {
  try {
    const { id } = req.params;
    const { completedQty, defectQty, remark } = req.body;
    const operatorId = req.user?.userId;
    const report = await productionService.createReport(
      Number(id),
      completedQty,
      defectQty,
      operatorId,
      remark,
    );
    return sendCreated(res, report, '报工成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getWorkOrders,
  getWorkOrderById,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  transitionStatus,
  createReport,
};
