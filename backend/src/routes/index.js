/**
 * MES 系统 - 路由聚合器
 * 将所有模块路由挂载到 /api 前缀下
 *
 * ⚠️ 挂载顺序约定（P1 新增，务必保持）：
 *  P0 的 /production、/equipment 模块内部含 `/:id` 动态段路由，
 *  P1 新增的静态段路由（/production/schedules、/equipment/maintenance、/equipment/breakdowns）
 *  **必须挂载在对应 P0 模块之前**，否则 'schedules' / 'maintenance' 会被当作 :id 吞掉。
 */

const express = require('express');

const router = express.Router();

/**
 * 健康检查路由
 * GET /api/health
 * 附带当前数据库类型（dbType）与连通性，便于验证「动态数据库配置」是否生效
 */
router.get('/health', async (req, res) => {
  const { checkDatabaseHealth } = require('../config/database');
  const { config } = require('../config/env');

  const dbHealth = await checkDatabaseHealth();
  const healthy = dbHealth.connected;

  res.status(healthy ? 200 : 503).json({
    code: healthy ? 200 : 503,
    data: {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        type: config.dbType,
        connected: dbHealth.connected,
        latencyMs: dbHealth.latencyMs,
        error: dbHealth.error,
      },
    },
    message: healthy ? '服务运行正常' : '服务运行异常：数据库连接失败',
  });
});

// ==================== 模块路由挂载 ====================

// 认证模块（T02）
const authRoutes = require('./auth.routes');
router.use('/auth', authRoutes);

// 用户管理模块（T02）
const userRoutes = require('./user.routes');
router.use('/users', userRoutes);

// 角色权限模块（T02）
const roleRoutes = require('./role.routes');
router.use('/roles', roleRoutes);

// 权限查询路由（T02）— 需要登录但不限定具体权限
const { authMiddleware } = require('../middleware/auth');
const roleController = require('../controllers/role.controller');
router.get('/permissions', authMiddleware, roleController.getAllPermissions);

// ==================== P1 模块路由（T06 已挂载骨架，T07~T10 填充） ====================

// 生产排程模块（P1-01，T08）— 必须在 /production 之前挂载
const scheduleRoutes = require('./schedule.routes');
router.use('/production/schedules', scheduleRoutes);

// 生产管理模块（T03）
const productionRoutes = require('./production.routes');
router.use('/production', productionRoutes);

// 设备维保模块（P1-02，T07）— 必须在 /equipment 之前挂载
const maintenanceRoutes = require('./maintenance.routes');
router.use('/equipment/maintenance', maintenanceRoutes);

// 设备故障维修模块（P1-03，T07）— 必须在 /equipment 之前挂载
const breakdownRoutes = require('./breakdown.routes');
router.use('/equipment/breakdowns', breakdownRoutes);

// 设备管理模块（T03）
const equipmentRoutes = require('./equipment.routes');
router.use('/equipment', equipmentRoutes);

// 质量追溯模块（P1-04，T09）— 放在 /quality 之前，避免静态段被动态段影响
const traceRoutes = require('./trace.routes');
router.use('/quality/traceability', traceRoutes);

// 质量管理模块（T04）
const qualityRoutes = require('./quality.routes');
router.use('/quality', qualityRoutes);

// 物料管理模块（T04）
const materialRoutes = require('./material.routes');
router.use('/material', materialRoutes);

// 人员管理模块（P1-09 / P1-10，T08）
const personnelRoutes = require('./personnel.routes');
router.use('/personnel', personnelRoutes);

// 报表中心模块（P1-05 / P1-06，T10）
const reportRoutes = require('./report.routes');
router.use('/reports', reportRoutes);

// 数据看板模块（T05）
const dashboardRoutes = require('./dashboard.routes');
router.use('/dashboard', dashboardRoutes);

module.exports = router;
