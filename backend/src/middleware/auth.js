/**
 * MES 系统 - JWT 认证中间件
 * 功能：从 Authorization 头提取 Token → 验证 → 注入 req.user
 */

const { verifyAccessToken } = require('../utils/jwt');
const { sendUnauthorized } = require('../utils/response');

/**
 * JWT 认证中间件
 * 验证 Authorization 头中的 Bearer Token
 * 成功：req.user = { userId, username, permissions }
 * 失败：返回 401
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return sendUnauthorized(res, '未提供认证令牌');
  }

  // 解析 Bearer Token
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return sendUnauthorized(res, '认证令牌格式错误');
  }

  const token = parts[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return sendUnauthorized(res, '认证令牌已过期或无效');
  }

  // 注入用户信息到请求对象
  req.user = {
    userId: decoded.userId,
    username: decoded.username,
    permissions: decoded.permissions || [],
  };

  next();
}

/**
 * 权限校验中间件工厂函数
 * @param {string} permissionCode - 需要的权限编码（格式：module:action）
 * @returns {function} Express 中间件
 */
function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, '未认证');
    }

    const { permissions } = req.user;

    if (!permissions.includes(permissionCode)) {
      return res.status(403).json({
        code: 403,
        data: null,
        message: `无权限：需要 ${permissionCode} 权限`,
      });
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  requirePermission,
};
