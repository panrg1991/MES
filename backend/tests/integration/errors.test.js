/**
 * 集成测试：统一错误响应与请求上下文（P1 可观测性回归）
 * ---------------------------------------------------------------------------
 * 覆盖：
 *  ① 每个响应都有 X-Request-Id（支持网关透传），错误响应体携带 requestId
 *  ② 非法 JSON 请求体返回 400（而非 500）
 *  ③ 404 路由包含 requestId
 * 说明：Prisma 错误码映射在 tests/unit/errorHandler.test.js 中单测覆盖。
 */

const { app, request } = require('../helpers/api');

describe('统一错误响应与请求号', () => {
  test('透传网关传入的 X-Request-Id，并写入错误响应体', async () => {
    const requestId = 'req-fixed-123456';

    const res = await request(app)
      .get('/api/not-exist-endpoint')
      .set('X-Request-Id', requestId);

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe(requestId);
    expect(res.body.requestId).toBe(requestId);
  });

  test('未传入 X-Request-Id 时自动生成 UUID', async () => {
    const res = await request(app).get('/api/not-exist-endpoint');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  test('非法 JSON 请求体返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": "admin", ');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('请求体格式错误');
  });
});
