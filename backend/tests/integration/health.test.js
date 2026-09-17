/**
 * 集成测试：健康检查端点
 * ---------------------------------------------------------------------------
 * /api/health 是运维探活与「数据库动态配置是否生效」的验收口，
 * 因此需要同时验证 HTTP 语义与数据库状态字段。
 */

const { app, request } = require('../helpers/api');
const { config } = require('../../src/config/env');

describe('GET /api/health', () => {
  test('数据库正常时返回 200 与标准化响应结构', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.message).toBe('服务运行正常');
    expect(res.body.data.status).toBe('ok');
  });

  test('返回的数据库类型与当前配置一致（本次为 sqlite）', async () => {
    const res = await request(app).get('/api/health');

    expect(res.body.data.database).toBeDefined();
    expect(res.body.data.database.type).toBe(config.dbType);
    expect(res.body.data.database.type).toBe('sqlite');
  });

  test('数据库连通且给出可用的耗时指标', async () => {
    const res = await request(app).get('/api/health');

    expect(res.body.data.database.connected).toBe(true);
    expect(res.body.data.database.error).toBeNull();
    expect(typeof res.body.data.database.latencyMs).toBe('number');
    expect(res.body.data.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('附带服务运行时间与时间戳', async () => {
    const res = await request(app).get('/api/health');

    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.body.data.uptime).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(res.body.data.timestamp))).toBe(false);
  });

  test('健康检查不需要认证即可访问', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('未匹配路由的兜底行为', () => {
  test('访问不存在的接口返回 404 且结构统一', async () => {
    const res = await request(app).get('/api/not-exist-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message');
  });
});
