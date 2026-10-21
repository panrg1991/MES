/**
 * MES 系统 - 认证服务层
 * 功能：登录验证、JWT 签发、密码校验、刷新令牌、修改密码
 */

const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { signTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { logger } = require('../utils/logger');

// ==================== 登录暴破防护（P0） ====================
// 策略：同一账号 15 分钟内失败满 5 次 → 锁定 15 分钟（429）
// 说明：状态保存在进程内存，重启后清零；单实例部署下可有效阻断在线暴破。
//      多实例部署时应改为 Redis / 数据库计数（与限流中间件配合）。
const MAX_LOGIN_FAILURES = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

// 用户不存在时也做一次 bcrypt 比对，避免通过响应耗时枚举有效用户名
const DUMMY_PASSWORD_HASH =
  '$2a$10$1DM/L0eYS7wcQCaGUELl4umXmdUmWA9owEowiDHyviPmUtW9NHMkq';

/** username → { count, firstAt, lockedUntil } */
const loginFailures = new Map();

/**
 * 构造带状态码的业务异常
 * @param {string} message 错误信息
 * @param {number} statusCode HTTP 状态码
 * @returns {Error}
 */
function createBusinessError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * 读取账号当前失败状态（超过统计窗口则自动清理）
 * @param {string} username 用户名
 * @returns {{count: number, firstAt: number, lockedUntil: number}|null}
 */
function getLoginFailureState(username) {
  const state = loginFailures.get(username);
  if (!state) return null;

  const now = Date.now();
  if (state.lockedUntil > now) return state;
  if (now - state.firstAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailures.delete(username);
    return null;
  }
  return state;
}

/**
 * 登录前置检查：账号是否处于锁定期
 * @param {string} username 用户名
 * @throws {Error} 429 账号已锁定
 */
function assertLoginAllowed(username) {
  const state = getLoginFailureState(username);
  if (state && state.lockedUntil > Date.now()) {
    const minutes = Math.ceil((state.lockedUntil - Date.now()) / 60000);
    throw createBusinessError(
      `登录失败次数过多，账号已临时锁定，请 ${minutes} 分钟后再试`,
      429,
    );
  }
}

/**
 * 记录一次登录失败（达到阈值则锁定）
 * @param {string} username 用户名
 */
function recordLoginFailure(username) {
  const now = Date.now();
  const state = getLoginFailureState(username) || {
    count: 0,
    firstAt: now,
    lockedUntil: 0,
  };

  state.count += 1;
  if (state.count >= MAX_LOGIN_FAILURES) {
    state.lockedUntil = now + LOGIN_LOCK_MS;
  }
  loginFailures.set(username, state);

  // 简单清扫，避免大量随机用户名导致 Map 无限增长
  if (loginFailures.size > 1000) {
    for (const [key, value] of loginFailures) {
      if (value.lockedUntil <= now && now - value.firstAt > LOGIN_FAILURE_WINDOW_MS) {
        loginFailures.delete(key);
      }
    }
  }
}

/**
 * 清除账号失败计数（登录成功后调用）
 * @param {string} username 用户名
 */
function clearLoginFailures(username) {
  loginFailures.delete(username);
}

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {{requestId?: string, ip?: string}} [context] - 审计上下文（requestId / 来源 IP）
 * @returns {Promise<{token: string, refreshToken: string, user: object, permissions: string[]}>}
 * @throws {Error} 用户名或密码错误 / 账号停用 / 登录锁定
 */
async function login(username, password, context = {}) {
  // 0. 账号是否因连续失败被临时锁定
  try {
    assertLoginAllowed(username);
  } catch (error) {
    // 安全审计：锁定期间仍尝试登录，记录以便发现持续暴破
    logger.warn('login_locked', {
      username,
      ...context,
    });
    throw error;
  }

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

  // 2. 用户不存在：仍执行一次哈希比对，避免响应耗时差异泄露用户名是否存在
  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    recordLoginFailure(username);
    logger.warn('login_failed', {
      username,
      reason: 'user_not_found',
      ...context,
    });
    throw createBusinessError('用户名或密码错误', 401);
  }

  // 3. 账号已停用（不计入失败次数，避免误锁）
  if (!user.status) {
    logger.warn('login_failed', {
      username,
      userId: user.id,
      reason: 'user_disabled',
      ...context,
    });
    throw createBusinessError('账号已停用，请联系管理员', 403);
  }

  // 4. 校验密码（异步，避免同步 bcrypt 阻塞事件循环）
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    recordLoginFailure(username);
    logger.warn('login_failed', {
      username,
      userId: user.id,
      reason: 'bad_password',
      ...context,
    });
    throw createBusinessError('用户名或密码错误', 401);
  }

  // 5. 登录成功：清除失败计数并记录审计日志
  clearLoginFailures(username);
  logger.info('login_success', {
    username,
    userId: user.id,
    ...context,
  });

  // 6. 提取权限编码列表
  const permissions = extractPermissionCodes(user.userRoles);

  // 7. 签发 JWT
  const { token, refreshToken } = signTokenPair(
    { id: user.id, username: user.username },
    permissions,
  );

  // 8. 构造用户信息（不含敏感数据）
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
  const isOldPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
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

  // 4. 更新密码（异步哈希，避免阻塞事件循环）
  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  logger.info('password_changed', { userId });
}

/**
 * 哈希密码（异步，避免阻塞事件循环）
 * @param {string} password - 原始密码
 * @returns {Promise<string>} 哈希后的密码
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
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
