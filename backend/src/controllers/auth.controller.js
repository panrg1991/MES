/**
 * MES 系统 - 认证控制器
 * 处理：登录、刷新令牌、登出、修改密码、获取个人信息
 */

const authService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * POST /api/auth/login
 * 用户登录
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    return sendSuccess(res, result, '登录成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/auth/refresh
 * 刷新令牌
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    return sendSuccess(res, result, '令牌刷新成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/auth/logout
 * 用户登出（无状态 JWT，前端清除 Token 即可）
 */
function logout(req, res) {
  // JWT 无状态认证：登出仅需前端清除 Token，后端返回成功即可
  // （如需服务端 Token 黑名单机制，可在此扩展）
  return sendSuccess(res, null, '已退出登录');
}

/**
 * GET /api/auth/profile
 * 获取当前登录用户信息（含角色和权限）
 */
async function getProfile(req, res, next) {
  try {
    const { userId } = req.user;
    const result = await authService.getProfile(userId);
    return sendSuccess(res, result, '获取用户信息成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/auth/change-password
 * 修改密码（需要登录）
 */
async function changePassword(req, res, next) {
  try {
    const { userId } = req.user;
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(userId, oldPassword, newPassword);
    return sendSuccess(res, null, '密码修改成功，请重新登录');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  getProfile,
  changePassword,
};
