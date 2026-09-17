/**
 * MES 系统 - 数据看板控制器
 * 处理：看板总览、工单进度、设备状态汇总、产量趋势、质量摘要
 */

const dashboardService = require('../services/dashboard.service');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * GET /api/dashboard/overview
 * 看板总览数据（进行中工单数、设备状态、今日产量、不良率、低库存预警数）
 */
async function getOverview(req, res, next) {
  try {
    const data = await dashboardService.getOverview();
    return sendSuccess(res, data, '查询看板总览成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/dashboard/production-progress
 * 当前进行中工单进度列表
 */
async function getProductionProgress(req, res, next) {
  try {
    const data = await dashboardService.getProductionProgress();
    return sendSuccess(res, data, '查询工单进度成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/dashboard/equipment-status
 * 设备状态汇总（含设备详情列表）
 */
async function getEquipmentStatus(req, res, next) {
  try {
    const data = await dashboardService.getEquipmentStatus();
    return sendSuccess(res, data, '查询设备状态成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/dashboard/output-trend?days=7
 * 近N天产量趋势（产量 + 不良数量）
 */
async function getOutputTrend(req, res, next) {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const data = await dashboardService.getOutputTrend(days);
    return sendSuccess(res, data, '查询产量趋势成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/dashboard/quality-summary?date=YYYY-MM-DD
 * 质量摘要（总产量、不良数、不良率、合格率）
 */
async function getQualitySummary(req, res, next) {
  try {
    const { date } = req.query;
    const data = await dashboardService.getQualitySummary(date);
    return sendSuccess(res, data, '查询质量摘要成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getOverview,
  getProductionProgress,
  getEquipmentStatus,
  getOutputTrend,
  getQualitySummary,
};
