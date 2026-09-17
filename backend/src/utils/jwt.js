/**
 * MES 系统 - JWT 工具
 * 包含：Access Token 签发/验证、Refresh Token 签发/验证
 */

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

/** JWT Payload 结构 */
// {
//   userId: number,
//   username: string,
//   permissions: string[]
// }

/**
 * 签发 Access Token
 * @param {object} payload - JWT Payload（userId, username, permissions）
 * @returns {string} Access Token
 */
function signAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * 签发 Refresh Token
 * @param {object} payload - JWT Payload（userId, username）
 * @returns {string} Refresh Token
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn,
  });
}

/**
 * 验证 Access Token
 * @param {string} token - Access Token
 * @returns {object|null} 解码后的 Payload，验证失败返回 null
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return null;
  }
}

/**
 * 验证 Refresh Token
 * @param {string} token - Refresh Token
 * @returns {object|null} 解码后的 Payload，验证失败返回 null
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, config.jwtRefreshSecret);
  } catch (error) {
    return null;
  }
}

/**
 * 签发 Token 对（Access + Refresh）
 * @param {object} user - 用户信息（id, username）
 * @param {string[]} permissions - 权限编码列表
 * @returns {{ token: string, refreshToken: string }} Token 对
 */
function signTokenPair(user, permissions) {
  const payload = {
    userId: user.id,
    username: user.username,
    permissions,
  };

  return {
    token: signAccessToken(payload),
    refreshToken: signRefreshToken({
      userId: user.id,
      username: user.username,
    }),
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signTokenPair,
};
