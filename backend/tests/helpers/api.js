/**
 * 集成测试公共助手
 * ---------------------------------------------------------------------------
 * 封装 supertest 实例与登录流程，避免各测试文件重复拼装鉴权头。
 */

const request = require('supertest');
const app = require('../../src/app');

/** 种子数据中的管理员账号（见 prisma/seed.js） */
const ADMIN_CREDENTIALS = { username: 'admin', password: 'admin123' };

/**
 * 以指定账号登录并返回完整登录数据
 * @param {{username: string, password: string}} [credentials] 登录凭据
 * @returns {Promise<{token: string, refreshToken: string, user: object, permissions: string[]}>}
 * @throws {Error} 登录失败时抛出，携带响应体便于定位
 */
async function login(credentials = ADMIN_CREDENTIALS) {
  const res = await request(app).post('/api/auth/login').send(credentials);
  if (res.status !== 200) {
    throw new Error(`登录失败（${res.status}）: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/**
 * 发送带 Bearer Token 的 GET 请求
 * @param {string} url 接口路径
 * @param {string} token Access Token
 * @returns {Promise<import('supertest').Response>} 响应
 */
function getWithToken(url, token) {
  return request(app).get(url).set('Authorization', `Bearer ${token}`);
}

module.exports = { app, request, ADMIN_CREDENTIALS, login, getWithToken };
