/**
 * MES 系统 - 报表中心控制器【T10 实现】
 *
 * 查询端点走统一 JSON 包装（sendSuccess）；导出端点走二进制流（utils/excel.js），
 * 成功时**不套** { code, data, message }（架构文档 §8.4），
 * 失败仍走全局 errorHandler（前端从 blob 还原 message）。
 *
 * 端点清单：
 *  GET /api/reports/oee/summary             OEE 汇总（三分量 + 总值）
 *  GET /api/reports/oee/trend               OEE 趋势（day|week|month）
 *  GET /api/reports/oee/details             OEE 明细（按设备分组）
 *  GET /api/reports/oee/export              OEE 导出（xlsx）
 *  GET /api/reports/production              生产报表（daily|weekly|monthly）
 *  GET /api/reports/production/export       生产报表导出（xlsx）
 *  GET /api/reports/quality                 质量报表
 *  GET /api/reports/quality/export          质量报表导出（xlsx）
 *  GET /api/reports/inventory               库存报表
 *  GET /api/reports/inventory/export        库存报表导出（xlsx）
 *  GET /api/reports/workhours               工时汇总（user|shift|workOrder）
 *  GET /api/reports/workhours/efficiency    工时效率（人均产出）
 *  GET /api/reports/workhours/export        工时导出（xlsx）
 */

const reportService = require('../services/report.service');
const { sendSuccess } = require('../utils/response');
const { setDownloadHeaders } = require('../utils/excel');

// ==================== OEE 分析（P1-05） ====================

/** GET /api/reports/oee/summary - OEE 汇总 */
async function getOeeSummary(req, res, next) {
  try {
    const data = await reportService.getOeeSummary(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/oee/trend - OEE 趋势 */
async function getOeeTrend(req, res, next) {
  try {
    const data = await reportService.getOeeTrend(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/oee/details - OEE 明细（按设备分组，含超产标注） */
async function getOeeDetails(req, res, next) {
  try {
    const data = await reportService.getOeeDetails(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/oee/export - OEE 导出（xlsx 二进制） */
async function exportOee(req, res, next) {
  try {
    const { buffer, filename } = await reportService.buildOeeExcel(req.query);
    setDownloadHeaders(res, filename);
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
}

// ==================== 生产报表（P1-06） ====================

/** GET /api/reports/production - 生产报表查询 */
async function getProductionReport(req, res, next) {
  try {
    const data = await reportService.getProductionReport(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/production/export - 生产报表导出（xlsx 二进制） */
async function exportProductionReport(req, res, next) {
  try {
    const { buffer, filename } = await reportService.buildProductionExcel(req.query);
    setDownloadHeaders(res, filename);
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
}

// ==================== 质量报表（P1-06） ====================

/** GET /api/reports/quality - 质量报表查询 */
async function getQualityReport(req, res, next) {
  try {
    const data = await reportService.getQualityReport(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/quality/export - 质量报表导出（xlsx 二进制） */
async function exportQualityReport(req, res, next) {
  try {
    const { buffer, filename } = await reportService.buildQualityExcel(req.query);
    setDownloadHeaders(res, filename);
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
}

// ==================== 库存报表（P1-06） ====================

/** GET /api/reports/inventory - 库存报表查询 */
async function getInventoryReport(req, res, next) {
  try {
    const data = await reportService.getInventoryReport(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/inventory/export - 库存报表导出（xlsx 二进制） */
async function exportInventoryReport(req, res, next) {
  try {
    const { buffer, filename } = await reportService.buildInventoryExcel(req.query);
    setDownloadHeaders(res, filename);
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
}

// ==================== 工时报表（P1-06 / P1-10） ====================

/** GET /api/reports/workhours - 工时汇总查询 */
async function getWorkHoursReport(req, res, next) {
  try {
    const data = await reportService.getWorkHoursReport(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/workhours/efficiency - 工时效率查询 */
async function getWorkHoursEfficiency(req, res, next) {
  try {
    const data = await reportService.getWorkHoursEfficiency(req.query);
    return sendSuccess(res, data, '查询成功');
  } catch (error) {
    return next(error);
  }
}

/** GET /api/reports/workhours/export - 工时报表导出（xlsx 二进制） */
async function exportWorkHours(req, res, next) {
  try {
    const { buffer, filename } = await reportService.buildWorkHoursExcel(req.query);
    setDownloadHeaders(res, filename);
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getOeeSummary,
  getOeeTrend,
  getOeeDetails,
  exportOee,
  getProductionReport,
  exportProductionReport,
  getQualityReport,
  exportQualityReport,
  getInventoryReport,
  exportInventoryReport,
  getWorkHoursReport,
  getWorkHoursEfficiency,
  exportWorkHours,
};
