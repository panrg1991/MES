/**
 * MES 系统 - 角色权限路由
 * 路由：角色 CRUD、权限分配、权限树查询
 * 需要 authMiddleware 认证 + requirePermission 权限校验
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const roleController = require('../controllers/role.controller');
const {
  createRoleSchema,
  updateRoleSchema,
  roleQuerySchema,
  assignPermissionsSchema,
  idParamSchema,
} = require('../validators/role.validator');

const router = express.Router();

// 所有角色管理路由都需要登录认证
router.use(authMiddleware);

/**
 * GET /api/roles
 * 角色列表（分页）- 需要 system:roles:view 权限
 */
router.get(
  '/',
  requirePermission('system:roles:view'),
  validate({ query: roleQuerySchema }),
  roleController.getRoles,
);

/**
 * GET /api/roles/:id
 * 角色详情 - 需要 system:roles:view 权限
 */
router.get(
  '/:id',
  requirePermission('system:roles:view'),
  validate({ params: idParamSchema }),
  roleController.getRoleById,
);

/**
 * POST /api/roles
 * 创建角色 - 需要 system:roles:create 权限
 */
router.post(
  '/',
  requirePermission('system:roles:create'),
  validate({ body: createRoleSchema }),
  roleController.createRole,
);

/**
 * PUT /api/roles/:id
 * 更新角色 - 需要 system:roles:edit 权限
 */
router.put(
  '/:id',
  requirePermission('system:roles:edit'),
  validate({ params: idParamSchema, body: updateRoleSchema }),
  roleController.updateRole,
);

/**
 * DELETE /api/roles/:id
 * 删除角色 - 需要 system:roles:delete 权限
 */
router.delete(
  '/:id',
  requirePermission('system:roles:delete'),
  validate({ params: idParamSchema }),
  roleController.deleteRole,
);

/**
 * GET /api/roles/:id/permissions
 * 获取角色权限 - 需要 system:roles:view 权限
 */
router.get(
  '/:id/permissions',
  requirePermission('system:roles:view'),
  validate({ params: idParamSchema }),
  roleController.getRolePermissions,
);

/**
 * PUT /api/roles/:id/permissions
 * 分配权限 - 需要 system:roles:assign 权限
 */
router.put(
  '/:id/permissions',
  requirePermission('system:roles:assign'),
  validate({ params: idParamSchema, body: assignPermissionsSchema }),
  roleController.assignPermissions,
);

module.exports = router;
