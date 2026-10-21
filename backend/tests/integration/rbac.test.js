/**
 * 集成测试：权限边界（P0 越权修复回归）
 * ---------------------------------------------------------------------------
 * 覆盖本次修复：
 *  ① 看板接口需要 dashboard:view（不再"登录即可看全厂数据"）
 *  ② 系统管理员角色的权限不可被修改（防止把系统锁死）
 *  ③ 不能停用/删除当前登录账号，不能删除最后一个管理员
 *  ④ 用户必须至少保留一个角色
 */

const { app, request, login } = require('../helpers/api');

/** 构造鉴权头 */
function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

/** 唯一后缀 */
function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * 查询指定编码的角色
 * @param {string} token 管理员 Token
 * @param {string} code 角色编码
 * @returns {Promise<object>} 角色
 */
async function findRoleByCode(token, code) {
  const res = await request(app)
    .get('/api/roles?page=1&pageSize=100')
    .set(auth(token));
  expect(res.status).toBe(200);
  const role = res.body.data.list.find((item) => item.code === code);
  if (!role) {
    throw new Error(`未找到角色：${code}`);
  }
  return role;
}

describe('RBAC - 接口权限与管理员保护（P0）', () => {
  let adminToken;
  let adminUser;
  let operatorToken;

  beforeAll(async () => {
    const admin = await login();
    adminToken = admin.token;
    adminUser = admin.user;

    const operator = await login({ username: 'operator', password: 'operator123' });
    operatorToken = operator.token;
  });

  test('看板接口对拥有 dashboard:view 的操作员开放', async () => {
    const res = await request(app)
      .get('/api/dashboard/overview')
      .set(auth(operatorToken));

    expect(res.status).toBe(200);
  });

  test('无 system:users:view 权限的操作员访问用户列表返回 403', async () => {
    const res = await request(app)
      .get('/api/users')
      .set(auth(operatorToken));

    expect(res.status).toBe(403);
  });

  test('无 dashboard:view 权限的用户访问看板返回 403', async () => {
    const suffix = uniqueSuffix();

    // 1. 创建一个不含任何权限的角色
    const roleRes = await request(app)
      .post('/api/roles')
      .set(auth(adminToken))
      .send({ name: `无权限角色-${suffix}`, code: `test:noaccess-${suffix}` });
    expect(roleRes.status).toBe(201);

    // 2. 创建用户并只分配该角色
    const userRes = await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        username: `noaccess-${suffix}`,
        name: '无权限用户',
        department: '测试部',
        password: 'test123456',
        roleIds: [roleRes.body.data.id],
      });
    expect(userRes.status).toBe(201);

    // 3. 用该用户登录并访问看板
    const noAccess = await login({
      username: `noaccess-${suffix}`,
      password: 'test123456',
    });
    expect(noAccess.permissions).toEqual([]);

    const res = await request(app)
      .get('/api/dashboard/overview')
      .set(auth(noAccess.token));

    expect(res.status).toBe(403);
  });

  test('不允许修改系统管理员角色的权限', async () => {
    const adminRole = await findRoleByCode(adminToken, 'system:admin');

    const res = await request(app)
      .put(`/api/roles/${adminRole.id}/permissions`)
      .set(auth(adminToken))
      .send({ permissionIds: [1] });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('不允许修改系统管理员角色');
  });

  test('不能停用当前登录账号', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminUser.id}/status`)
      .set(auth(adminToken))
      .send({ status: false });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('不能停用当前登录账号');
  });

  test('不能删除当前登录账号', async () => {
    const res = await request(app)
      .delete(`/api/users/${adminUser.id}`)
      .set(auth(adminToken));

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('不能删除当前登录账号');
  });

  test('更新用户角色时不允许传空数组', async () => {
    const suffix = uniqueSuffix();

    const roleRes = await request(app)
      .post('/api/roles')
      .set(auth(adminToken))
      .send({ name: `临时角色-${suffix}`, code: `test:temp-${suffix}` });
    expect(roleRes.status).toBe(201);

    const userRes = await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        username: `tempuser-${suffix}`,
        name: '临时用户',
        department: '测试部',
        password: 'test123456',
        roleIds: [roleRes.body.data.id],
      });
    expect(userRes.status).toBe(201);

    const res = await request(app)
      .put(`/api/users/${userRes.body.data.id}`)
      .set(auth(adminToken))
      .send({ roleIds: [] });

    expect(res.status).toBe(400);
  });
});
