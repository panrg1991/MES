/**
 * MES 系统 - 质量追溯控制器【T09 实现】
 * 端点：GET /api/quality/traceability?workOrderNo=xxx | ?batchNo=xxx（二选一）
 * 工单维度返回单条链路；批次维度反查工单后返回 entries 数组。
 */

const traceService = require('../services/trace.service');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * GET /api/quality/traceability?workOrderNo= | ?batchNo=
 * 追溯链路查询（工单号 / 批次号二选一）
 */
async function getTraceability(req, res, next) {
  try {
    const { workOrderNo, batchNo } = req.query;
    const hasWorkOrderNo =
      typeof workOrderNo === 'string' && workOrderNo.trim() !== '';
    const hasBatchNo = typeof batchNo === 'string' && batchNo.trim() !== '';

    // 参数校验：二选一
    if (hasWorkOrderNo && hasBatchNo) {
      return sendError(res, 'workOrderNo 与 batchNo 参数只能二选一', 400);
    }
    if (!hasWorkOrderNo && !hasBatchNo) {
      return sendError(
        res,
        '请提供 workOrderNo（工单号）或 batchNo（批次号）查询参数',
        400,
      );
    }

    const data = hasWorkOrderNo
      ? {
          entries: [await traceService.buildWorkOrderChain(workOrderNo.trim())],
        }
      : await traceService.buildBatchEntries(batchNo.trim());

    return sendSuccess(res, data, '追溯查询成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getTraceability,
};
