/**
 * MES 系统 - 数据看板路由
 * 路由：看板总览、工单进度、设备状态、产量趋势、质量摘要
 * 权限：登录认证 + dashboard:view（与前端菜单权限码一致，避免"登录即可看全厂数据"）
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

// 所有看板路由都需要登录认证 + 看板查看权限
router.use(authMiddleware);
router.use(requirePermission('dashboard:view'));

/**
 * GET /api/dashboard/overview
 * 看板总览数据
 */
router.get('/overview', dashboardController.getOverview);

/**
 * GET /api/dashboard/production-progress
 * 当前进行中工单进度列表
 */
router.get(
  '/production-progress',
  dashboardController.getProductionProgress,
);

/**
 * GET /api/dashboard/equipment-status
 * 设备状态汇总（含设备详情列表）
 */
router.get(
  '/equipment-status',
  dashboardController.getEquipmentStatus,
);

/**
 * GET /api/dashboard/output-trend?days=7
 * 近N天产量趋势
 */
router.get('/output-trend', dashboardController.getOutputTrend);

/**
 * GET /api/dashboard/quality-summary?date=YYYY-MM-DD
 * 质量摘要
 */
router.get('/quality-summary', dashboardController.getQualitySummary);

module.exports = router;
