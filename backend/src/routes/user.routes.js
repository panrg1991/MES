/**
 * MES 系统 - 用户管理路由
 * 需要 authMiddleware 认证 + requirePermission 权限校验
 */

const express = require('express');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const userController = require('../controllers/user.controller');
const {
  createUserSchema,
  updateUserSchema,
  userQuerySchema,
  idParamSchema,
  toggleStatusSchema,
  resetPasswordSchema,
} = require('../validators/user.validator');

const router = express.Router();

// 所有用户管理路由都需要登录认证
router.use(authMiddleware);

/**
 * GET /api/users
 * 用户列表（分页）- 需要 system:users:view 权限
 */
router.get(
  '/',
  requirePermission('system:users:view'),
  validate({ query: userQuerySchema }),
  userController.getUsers,
);

/**
 * GET /api/users/:id
 * 用户详情 - 需要 system:users:view 权限
 */
router.get(
  '/:id',
  requirePermission('system:users:view'),
  validate({ params: idParamSchema }),
  userController.getUserById,
);

/**
 * POST /api/users
 * 创建用户 - 需要 system:users:create 权限
 */
router.post(
  '/',
  requirePermission('system:users:create'),
  validate({ body: createUserSchema }),
  userController.createUser,
);

/**
 * PUT /api/users/:id
 * 更新用户 - 需要 system:users:edit 权限
 */
router.put(
  '/:id',
  requirePermission('system:users:edit'),
  validate({ params: idParamSchema, body: updateUserSchema }),
  userController.updateUser,
);

/**
 * PATCH /api/users/:id/status
 * 切换用户状态 - 需要 system:users:status 权限
 */
router.patch(
  '/:id/status',
  requirePermission('system:users:status'),
  validate({ params: idParamSchema, body: toggleStatusSchema }),
  userController.toggleStatus,
);

/**
 * PATCH /api/users/:id/password
 * 重置密码 - 需要 system:users:edit 权限
 */
router.patch(
  '/:id/password',
  requirePermission('system:users:edit'),
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  userController.resetPassword,
);

/**
 * DELETE /api/users/:id
 * 删除用户 - 需要 system:users:delete 权限
 */
router.delete(
  '/:id',
  requirePermission('system:users:delete'),
  validate({ params: idParamSchema }),
  userController.deleteUser,
);

module.exports = router;
