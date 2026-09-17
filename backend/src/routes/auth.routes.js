/**
 * MES 系统 - 认证路由
 * 路由：登录、刷新令牌、登出、修改密码、获取个人信息
 */

const express = require('express');
const { validate } = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const authController = require('../controllers/auth.controller');
const {
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} = require('../validators/auth.validator');

const router = express.Router();

/**
 * POST /api/auth/login
 * 用户登录（无需认证）
 */
router.post('/login', validate({ body: loginSchema }), authController.login);

/**
 * POST /api/auth/refresh
 * 刷新令牌（无需认证，使用 refreshToken）
 */
router.post('/refresh', validate({ body: refreshTokenSchema }), authController.refresh);

/**
 * POST /api/auth/logout
 * 用户登出（无需认证，前端清除 Token）
 */
router.post('/logout', authController.logout);

/**
 * 以下路由需要登录认证
 */
router.use(authMiddleware);

/**
 * GET /api/auth/profile
 * 获取当前用户信息
 */
router.get('/profile', authController.getProfile);

/**
 * POST /api/auth/change-password
 * 修改密码
 */
router.post('/change-password', validate({ body: changePasswordSchema }), authController.changePassword);

module.exports = router;
