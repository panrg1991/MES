/**
 * MES 系统 - 认证服务层
 * 功能：登录验证、JWT 签发、密码校验、刷新令牌、修改密码
 */

const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { signTokenPair, verifyRefreshToken } = require('../utils/jwt');

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<{token: string, refreshToken: string, user: object, permissions: string[]}>}
 * @throws {Error} 用户名或密码错误
 */
async function login(username, password) {
  // 1. 查询用户（含角色和权限）
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // 2. 用户不存在
  if (!user) {
    const error = new Error('用户名或密码错误');
    error.statusCode = 401;
    throw error;
  }

  // 3. 账号已停用
  if (!user.status) {
    const error = new Error('账号已停用，请联系管理员');
    error.statusCode = 403;
    throw error;
  }

  // 4. 校验密码
  const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
  if (!isPasswordValid) {
    const error = new Error('用户名或密码错误');
    error.statusCode = 401;
    throw error;
  }

  // 5. 提取权限编码列表
  const permissions = extractPermissionCodes(user.userRoles);

  // 6. 签发 JWT
  const { token, refreshToken } = signTokenPair(
    { id: user.id, username: user.username },
    permissions,
  );

  // 7. 构造用户信息（不含敏感数据）
  const userInfo = {
    id: user.id,
    username: user.username,
    name: user.name,
    department: user.department,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { token, refreshToken, user: userInfo, permissions };
}

/**
 * 刷新令牌
 * @param {string} refreshToken - 刷新令牌
 * @returns {Promise<{token: string}>}
 * @throws {Error} 刷新令牌无效
 */
async function refreshToken(refreshTokenStr) {
  // 1. 验证刷新令牌
  const decoded = verifyRefreshToken(refreshTokenStr);
  if (!decoded) {
    const error = new Error('刷新令牌已过期或无效');
    error.statusCode = 401;
    throw error;
  }

  // 2. 查询用户确保仍然有效
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.status) {
    const error = new Error('用户不存在或已停用');
    error.statusCode = 401;
    throw error;
  }

  // 3. 提取最新权限并签发新令牌
  const permissions = extractPermissionCodes(user.userRoles);

  const { signAccessToken } = require('../utils/jwt');
  const newToken = signAccessToken({
    userId: user.id,
    username: user.username,
    permissions,
  });

  return { token: newToken };
}

/**
 * 获取当前用户信息（含角色和权限）
 * @param {number} userId - 用户 ID
 * @returns {Promise<{user: object, roles: string[], permissions: string[]}>}
 * @throws {Error} 用户不存在
 */
async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    const error = new Error('用户不存在');
    error.statusCode = 404;
    throw error;
  }

  const roles = user.userRoles.map((ur) => ur.role.name);
  const permissions = extractPermissionCodes(user.userRoles);

  const userInfo = {
    id: user.id,
    username: user.username,
    name: user.name,
    department: user.department,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { user: userInfo, roles, permissions };
}

/**
 * 修改密码
 * @param {number} userId - 用户 ID
 * @param {string} oldPassword - 旧密码
 * @param {string} newPassword - 新密码
 * @throws {Error} 旧密码错误
 */
async function changePassword(userId, oldPassword, newPassword) {
  // 1. 查询用户
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    const error = new Error('用户不存在');
    error.statusCode = 404;
    throw error;
  }

  // 2. 校验旧密码
  const isOldPasswordValid = bcrypt.compareSync(oldPassword, user.passwordHash);
  if (!isOldPasswordValid) {
    const error = new Error('旧密码错误');
    error.statusCode = 400;
    throw error;
  }

  // 3. 新旧密码不能相同
  if (oldPassword === newPassword) {
    const error = new Error('新密码不能与旧密码相同');
    error.statusCode = 400;
    throw error;
  }

  // 4. 更新密码
  const newHash = bcrypt.hashSync(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });
}

/**
 * 哈希密码
 * @param {string} password - 原始密码
 * @returns {string} 哈希后的密码
 */
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

/**
 * 从用户角色关联中提取权限编码列表
 * @param {Array} userRoles - 用户角色关联数组
 * @returns {string[]} 权限编码列表
 */
function extractPermissionCodes(userRoles) {
  const codes = new Set();
  for (const ur of userRoles) {
    if (ur.role && ur.role.status) {
      for (const rp of ur.role.rolePermissions) {
        if (rp.permission) {
          codes.add(rp.permission.code);
        }
      }
    }
  }
  return Array.from(codes);
}

module.exports = {
  login,
  refreshToken,
  getProfile,
  changePassword,
  hashPassword,
  extractPermissionCodes,
};
