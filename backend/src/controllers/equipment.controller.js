/**
 * MES 系统 - 设备管理控制器
 * 处理：设备列表、详情、创建、更新、删除、状态切换、状态统计
 */

const equipmentService = require('../services/equipment.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/**
 * GET /api/equipment?page=&pageSize=&keyword=&status=&type=
 * 设备列表（分页）
 */
async function getEquipments(req, res, next) {
  try {
    const { page, pageSize, keyword, status, type } = req.query;
    const { list, total } = await equipmentService.getEquipments(
      page,
      pageSize,
      keyword,
      status,
      type,
    );
    return sendPaginated(res, list, total, page, pageSize, '查询设备列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/equipment/status-summary
 * 设备状态统计（用于状态总览卡片）
 */
async function getStatusSummary(req, res, next) {
  try {
    const summary = await equipmentService.getStatusSummary();
    return sendSuccess(res, summary, '查询设备状态统计成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/equipment/:id
 * 设备详情（含状态历史日志）
 */
async function getEquipmentById(req, res, next) {
  try {
    const { id } = req.params;
    const equipment = await equipmentService.getEquipmentById(Number(id));
    return sendSuccess(res, equipment, '查询设备详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/equipment
 * 创建设备
 */
async function createEquipment(req, res, next) {
  try {
    const equipment = await equipmentService.createEquipment(req.body);
    return sendCreated(res, equipment, '创建设备成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/equipment/:id
 * 更新设备
 */
async function updateEquipment(req, res, next) {
  try {
    const { id } = req.params;
    const equipment = await equipmentService.updateEquipment(
      Number(id),
      req.body,
    );
    return sendSuccess(res, equipment, '更新设备成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/equipment/:id
 * 删除设备
 */
async function deleteEquipment(req, res, next) {
  try {
    const { id } = req.params;
    await equipmentService.deleteEquipment(Number(id));
    return sendSuccess(res, null, '删除设备成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PATCH /api/equipment/:id/status
 * 切换设备状态
 */
async function changeStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { newStatus, remark } = req.body;
    const changedBy = req.user?.userId;
    const equipment = await equipmentService.changeStatus(
      Number(id),
      newStatus,
      changedBy,
      remark,
    );
    return sendSuccess(res, equipment, '设备状态切换成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getEquipments,
  getStatusSummary,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  changeStatus,
};
