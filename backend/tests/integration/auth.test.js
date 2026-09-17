/**
 * 集成测试：认证与权限
 * ---------------------------------------------------------------------------
 * 覆盖登录 → 鉴权 → 权限校验的完整链路，并关注安全细节
 * （不泄露密码哈希、非法 Token 被拒、刷新令牌不可当访问令牌使用）。
 */

const { app, request, ADMIN_CREDENTIALS, login } = require('../helpers/api');
const { verifyAccessToken } = require('../../src/utils/jwt');

describe('POST /api/auth/login - 登录', () => {
  test('使用正确凭据登录成功并返回双 Token 与权限列表', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send(ADMIN_CREDENTIALS);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.message).toBe('登录成功');

    const data = res.body.data;
    expect(typeof data.token).toBe('string');
    expect(typeof data.refreshToken).toBe('string');
    expect(data.token).not.toBe(data.refreshToken);
    expect(Array.isArray(data.permissions)).toBe(true);
    expect(data.permissions.length).toBeGreaterThan(0);
    expect(data.user).toBeDefined();
  });

  test('响应中不包含密码哈希等敏感字段', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send(ADMIN_CREDENTIALS);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('$2a$');
    expect(serialized).not.toContain('$2b$');
  });

  test('密码错误返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
  });

  test('用户不存在返回 401（不泄露账号是否存在）', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost-user', password: 'whatever123' });

    expect(res.status).toBe(401);
  });

  test('缺少必填字段返回 400 且给出字段级错误', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('参数校验失败');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
  });

  test('用户名过短返回 400（校验规则为至少 2 字符）', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'a', password: 'admin123' });

    expect(res.status).toBe(400);
  });
});

describe('认证中间件 - 受保护接口的访问控制', () => {
  test('缺少 Token 访问受保护接口返回 401', async () => {
    const res = await request(app).get('/api/auth/profile');

    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
  });

  test('伪造 Token 返回 401', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer forged.token.value');

    expect(res.status).toBe(401);
  });

  test('Authorization 头格式错误返回 401', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Token without-scheme');

    expect(res.status).toBe(401);
  });

  test('携带合法 Token 可获取个人信息', async () => {
    const { token, user } = await login();
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user?.id ?? res.body.data.id).toBe(user.id);
  });
});

describe('权限校验（RBAC）', () => {
  test('管理员可访问用户列表', async () => {
    const { token } = await login();
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data.list)).toBe(true);
  });

  test('分页参数生效', async () => {
    const { token } = await login();
    const res = await request(app)
      .get('/api/users?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(1);
    expect(res.body.data.list.length).toBeLessThanOrEqual(1);
  });

  test('超出上限的 pageSize 返回 400', async () => {
    const { token } = await login();
    const res = await request(app)
      .get('/api/users?page=1&pageSize=999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('权限列表接口可用且包含权限编码', async () => {
    const { token } = await login();
    const res = await request(app)
      .get('/api/permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('POST /api/auth/refresh - 刷新令牌', () => {
  test('使用 Refresh Token 换取可用的新 Access Token', async () => {
    const { refreshToken, user } = await login();

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');

    // 新 Token 必须能被验证，且身份与原用户一致
    // （同一秒内签发的 JWT 字符串可能完全相同，故不断言字符串不等）
    const decoded = verifyAccessToken(res.body.data.token);
    expect(decoded).not.toBeNull();
    expect(decoded.userId).toBe(user.id);

    // 新 Token 可直接用于访问受保护接口
    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${res.body.data.token}`);
    expect(profile.status).toBe(200);
  });

  test('使用非法 Refresh Token 返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-refresh-token' });

    expect(res.status).toBe(401);
  });

  test('Access Token 不能用于刷新（双 Token 密钥隔离）', async () => {
    const { token } = await login();

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: token });

    expect(res.status).toBe(401);
  });

  test('缺少 refreshToken 字段返回 400', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout - 登出', () => {
  test('登出接口返回成功（Token 由前端清除）', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });
});
