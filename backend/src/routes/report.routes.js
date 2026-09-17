/**
 * MES 系统 - 报表中心路由【T06 骨架】
 * 挂载点：/api/reports（见 routes/index.js）
 *
 * 查询端点走统一 JSON 包装；导出端点返回 xlsx 二进制流（不套 JSON 包装），
 * 由 T10 使用 utils/excel.js 实现。导出权限独立于查看权限（view ≠ export）。
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const reportController = require('../controllers/report.controller');

const router = express.Router();

// 所有报表路由都需要登录认证
router.use(authMiddleware);

// ==================== OEE 分析（P1-05） ====================

/**
 * GET /api/reports/oee/summary
 * OEE 汇总（时间稼动率 × 性能稼动率 × 良品率）
 * 需要 reports:oee:view 权限
 */
router.get(
  '/oee/summary',
  requirePermission('reports:oee:view'),
  reportController.getOeeSummary,
);

/**
 * GET /api/reports/oee/trend?dimension=day|week|month
 * OEE 趋势
 * 需要 reports:oee:view 权限
 */
router.get(
  '/oee/trend',
  requirePermission('reports:oee:view'),
  reportController.getOeeTrend,
);

/**
 * GET /api/reports/oee/details
 * OEE 明细（设备 × 班次，含超产标注）
 * 需要 reports:oee:view 权限
 */
router.get(
  '/oee/details',
  requirePermission('reports:oee:view'),
  reportController.getOeeDetails,
);

/**
 * GET /api/reports/oee/export
 * OEE 导出（xlsx 二进制）
 * 需要 reports:oee:export 权限
 */
router.get(
  '/oee/export',
  requirePermission('reports:oee:export'),
  reportController.exportOee,
);

// ==================== 生产报表（P1-06） ====================

/**
 * GET /api/reports/production?type=daily|weekly|monthly
 * 生产报表查询
 * 需要 reports:production:view 权限
 */
router.get(
  '/production',
  requirePermission('reports:production:view'),
  reportController.getProductionReport,
);

/**
 * GET /api/reports/production/export
 * 生产报表导出（xlsx 二进制）
 * 需要 reports:production:export 权限
 */
router.get(
  '/production/export',
  requirePermission('reports:production:export'),
  reportController.exportProductionReport,
);

// ==================== 质量报表（P1-06） ====================

/**
 * GET /api/reports/quality
 * 质量报表查询（合格率 / 不良 TopN / 处理方式分布）
 * 需要 reports:production:view 权限
 */
router.get(
  '/quality',
  requirePermission('reports:production:view'),
  reportController.getQualityReport,
);

/**
 * GET /api/reports/quality/export
 * 质量报表导出（xlsx 二进制）
 * 需要 reports:production:export 权限
 */
router.get(
  '/quality/export',
  requirePermission('reports:production:export'),
  reportController.exportQualityReport,
);

// ==================== 库存报表（P1-06） ====================

/**
 * GET /api/reports/inventory
 * 库存报表查询（明细 + 预警清单）
 * 需要 reports:production:view 权限
 */
router.get(
  '/inventory',
  requirePermission('reports:production:view'),
  reportController.getInventoryReport,
);

/**
 * GET /api/reports/inventory/export
 * 库存报表导出（xlsx 二进制）
 * 需要 reports:production:export 权限
 */
router.get(
  '/inventory/export',
  requirePermission('reports:production:export'),
  reportController.exportInventoryReport,
);

// ==================== 工时报表（P1-10） ====================

/**
 * GET /api/reports/workhours?dimension=user|shift|workOrder
 * 工时汇总报表
 * 需要 personnel:workhours:view 权限
 */
router.get(
  '/workhours',
  requirePermission('personnel:workhours:view'),
  reportController.getWorkHoursReport,
);

/**
 * GET /api/reports/workhours/efficiency
 * 工时效率报表（人均产出 / 单位产品工时）
 * 需要 personnel:workhours:view 权限
 */
router.get(
  '/workhours/efficiency',
  requirePermission('personnel:workhours:view'),
  reportController.getWorkHoursEfficiency,
);

/**
 * GET /api/reports/workhours/export
 * 工时报表导出（xlsx 二进制）
 * 需要 personnel:workhours:export 权限
 */
router.get(
  '/workhours/export',
  requirePermission('personnel:workhours:export'),
  reportController.exportWorkHours,
);

module.exports = router;
