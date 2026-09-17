/**
 * MES 系统 - 质量追溯路由【T06 骨架】
 * 挂载点：/api/quality/traceability（见 routes/index.js）
 *
 * 追溯为只读聚合，仅 1 个 view 权限，不拆 create / edit（PRD P1-04 权限口径）。
 * 端点结构与权限码已固化，T09 只需填充 controller/service 逻辑。
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const traceController = require('../controllers/trace.controller');

const router = express.Router();

// 所有追溯路由都需要登录认证
router.use(authMiddleware);

/**
 * GET /api/quality/traceability?workOrderNo=xxx | ?batchNo=xxx（二选一）
 * 工单维度 / 批次维度追溯链路
 * 需要 quality:traceability:view 权限
 */
router.get(
  '/',
  requirePermission('quality:traceability:view'),
  traceController.getTraceability,
);

module.exports = router;
