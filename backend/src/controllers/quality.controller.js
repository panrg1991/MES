/**
 * MES 系统 - 质量管理控制器
 * 处理：检验记录列表/详情/创建/删除、不良品列表/详情/创建/处理/删除
 */

const qualityService = require('../services/quality.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/**
 * GET /api/quality/inspections?page=&pageSize=&keyword=&result=&inspectionType=&workOrderId=
 * 检验记录列表（分页）
 */
async function getInspections(req, res, next) {
  try {
    const { page, pageSize, keyword, result, inspectionType, workOrderId } =
      req.query;
    const { list, total } = await qualityService.getInspections(
      page,
      pageSize,
      keyword,
      result,
      inspectionType,
      workOrderId,
    );
    return sendPaginated(res, list, total, page, pageSize, '查询检验记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/quality/inspections/:id
 * 检验记录详情
 */
async function getInspectionById(req, res, next) {
  try {
    const { id } = req.params;
    const inspection = await qualityService.getInspectionById(Number(id));
    return sendSuccess(res, inspection, '查询检验详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/quality/inspections
 * 创建检验记录（含检验项明细，自动判定结果）
 */
async function createInspection(req, res, next) {
  try {
    const inspectorId = req.user?.userId;
    const inspection = await qualityService.createInspection(
      req.body,
      inspectorId,
    );
    return sendCreated(res, inspection, '创建检验记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/quality/inspections/:id
 * 删除检验记录
 */
async function deleteInspection(req, res, next) {
  try {
    const { id } = req.params;
    await qualityService.deleteInspection(Number(id));
    return sendSuccess(res, null, '删除检验记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/quality/defects?page=&pageSize=&keyword=&defectType=&handlingMethod=&workOrderId=
 * 不良品记录列表（分页）
 */
async function getDefects(req, res, next) {
  try {
    const { page, pageSize, keyword, defectType, handlingMethod, workOrderId } =
      req.query;
    const { list, total } = await qualityService.getDefects(
      page,
      pageSize,
      keyword,
      defectType,
      handlingMethod,
      workOrderId,
    );
    return sendPaginated(res, list, total, page, pageSize, '查询不良品列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/quality/defects/:id
 * 不良品记录详情
 */
async function getDefectById(req, res, next) {
  try {
    const { id } = req.params;
    const defect = await qualityService.getDefectById(Number(id));
    return sendSuccess(res, defect, '查询不良品详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/quality/defects
 * 创建不良品记录
 */
async function createDefect(req, res, next) {
  try {
    const defect = await qualityService.createDefect(req.body);
    return sendCreated(res, defect, '创建不良品记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/quality/defects/:id
 * 处理不良品（更新处理方式）
 */
async function updateDefect(req, res, next) {
  try {
    const { id } = req.params;
    const handlerId = req.user?.userId;
    const defect = await qualityService.updateDefect(
      Number(id),
      req.body,
      handlerId,
    );
    return sendSuccess(res, defect, '处理不良品成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/quality/defects/:id
 * 删除不良品记录
 */
async function deleteDefect(req, res, next) {
  try {
    const { id } = req.params;
    await qualityService.deleteDefect(Number(id));
    return sendSuccess(res, null, '删除不良品记录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getInspections,
  getInspectionById,
  createInspection,
  deleteInspection,
  getDefects,
  getDefectById,
  createDefect,
  updateDefect,
  deleteDefect,
};
