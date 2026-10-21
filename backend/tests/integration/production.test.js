/**
 * 集成测试：生产工单 / 报工（P0 数据正确性回归）
 * ---------------------------------------------------------------------------
 * 覆盖本次修复的关键缺陷：
 *  ① 报工数量不得超过剩余可报数量（进度不可 > 100%）
 *  ② 同一 requestId 重复提交只累加一次（幂等）
 *  ③ 并发报工不会击穿上限
 *  ④ 状态机并发流转只成功一次，且只写一条日志
 *  ⑤ 计划数量不可改到小于已报数量
 */

const { app, request, login } = require('../helpers/api');

/** 构造鉴权头 */
function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

/** 生成唯一后缀，避免与种子/其他用例数据冲突 */
function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * 创建测试工单
 * @param {string} token 管理员 Token
 * @param {number} quantity 计划数量
 * @returns {Promise<object>} 工单
 */
async function createWorkOrder(token, quantity = 10) {
  const suffix = uniqueSuffix();
  const res = await request(app)
    .post('/api/production')
    .set(auth(token))
    .send({
      productName: `测试产品-${suffix}`,
      productCode: `TEST-${suffix}`,
      quantity,
    });

  if (res.status !== 201) {
    throw new Error(`创建工单失败（${res.status}）: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/**
 * 把工单推进到「进行中」
 * @param {string} token 管理员 Token
 * @param {number} id 工单 ID
 */
async function startWorkOrder(token, id) {
  const res = await request(app)
    .patch(`/api/production/${id}/status`)
    .set(auth(token))
    .send({ toStatus: 'in_progress' });
  expect(res.status).toBe(200);
}

describe('工单报工 - 数量边界与幂等（P0）', () => {
  let token;

  beforeAll(async () => {
    ({ token } = await login());
  });

  test('正常报工累加数量并返回记录', async () => {
    const order = await createWorkOrder(token, 10);
    await startWorkOrder(token, order.id);

    const res = await request(app)
      .post(`/api/production/${order.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 4, defectQty: 1, remark: '首件报工' });

    expect(res.status).toBe(201);
    expect(res.body.data.completedQty).toBe(4);
    expect(res.body.data.defectQty).toBe(1);

    const detail = await request(app)
      .get(`/api/production/${order.id}`)
      .set(auth(token));
    expect(detail.body.data.completedQty).toBe(4);
    expect(detail.body.data.defectQty).toBe(1);
  });

  test('报工数量超过剩余可报数量时返回 400，且不写库', async () => {
    const order = await createWorkOrder(token, 5);
    await startWorkOrder(token, order.id);

    const res = await request(app)
      .post(`/api/production/${order.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 6, defectQty: 0 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('超出剩余可报数量');

    const detail = await request(app)
      .get(`/api/production/${order.id}`)
      .set(auth(token));
    expect(detail.body.data.completedQty).toBe(0);
    expect(detail.body.data.reports).toHaveLength(0);
  });

  test('完成数量与不良数量同时为 0 时返回 400', async () => {
    const order = await createWorkOrder(token, 5);
    await startWorkOrder(token, order.id);

    const res = await request(app)
      .post(`/api/production/${order.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 0, defectQty: 0 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('不能同时为 0');
  });

  test('同一 requestId 重复提交只落一条记录、只累加一次', async () => {
    const order = await createWorkOrder(token, 10);
    await startWorkOrder(token, order.id);
    const requestId = `req-${uniqueSuffix()}`;

    const first = await request(app)
      .post(`/api/production/${order.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 3, defectQty: 0, requestId });
    const replay = await request(app)
      .post(`/api/production/${order.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 3, defectQty: 0, requestId });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);

    const detail = await request(app)
      .get(`/api/production/${order.id}`)
      .set(auth(token));
    expect(detail.body.data.completedQty).toBe(3);
    expect(detail.body.data.reports).toHaveLength(1);
  });

  test('同一 requestId 不能跨工单复用（防止串单）', async () => {
    const orderA = await createWorkOrder(token, 5);
    const orderB = await createWorkOrder(token, 5);
    await startWorkOrder(token, orderA.id);
    await startWorkOrder(token, orderB.id);
    const requestId = `req-${uniqueSuffix()}`;

    const first = await request(app)
      .post(`/api/production/${orderA.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 1, requestId });
    expect(first.status).toBe(201);

    const reused = await request(app)
      .post(`/api/production/${orderB.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 1, requestId });
    expect(reused.status).toBe(409);
    expect(reused.body.message).toContain('requestId');
  });

  test('并发两笔报工不能超过计划数量', async () => {
    const order = await createWorkOrder(token, 10);
    await startWorkOrder(token, order.id);

    // 两笔各 6，合计 12 > 10：只允许一笔成功
    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/production/${order.id}/reports`)
        .set(auth(token))
        .send({ completedQty: 6, defectQty: 0 }),
      request(app)
        .post(`/api/production/${order.id}/reports`)
        .set(auth(token))
        .send({ completedQty: 6, defectQty: 0 }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);

    const detail = await request(app)
      .get(`/api/production/${order.id}`)
      .set(auth(token));
    const total = detail.body.data.completedQty + detail.body.data.defectQty;
    expect(total).toBeLessThanOrEqual(10);
    expect(detail.body.data.reports).toHaveLength(1);
  });

  test('非进行中工单不允许报工', async () => {
    const order = await createWorkOrder(token, 5);

    const res = await request(app)
      .post(`/api/production/${order.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('只有进行中的工单');
  });
});

describe('工单状态机 - 并发流转与编辑边界（P0）', () => {
  let token;

  beforeAll(async () => {
    ({ token } = await login());
  });

  test('并发执行同一流转只成功一次，且只写一条状态日志', async () => {
    const order = await createWorkOrder(token, 5);

    const [a, b] = await Promise.all([
      request(app)
        .patch(`/api/production/${order.id}/status`)
        .set(auth(token))
        .send({ toStatus: 'in_progress' }),
      request(app)
        .patch(`/api/production/${order.id}/status`)
        .set(auth(token))
        .send({ toStatus: 'in_progress' }),
    ]);

    const successCount = [a.status, b.status].filter((s) => s === 200).length;
    expect(successCount).toBe(1);

    const detail = await request(app)
      .get(`/api/production/${order.id}`)
      .set(auth(token));
    expect(detail.body.data.status).toBe('in_progress');
    expect(detail.body.data.statusLogs).toHaveLength(1);
  });

  test('计划数量不能改到小于已报数量', async () => {
    const order = await createWorkOrder(token, 10);
    await startWorkOrder(token, order.id);

    const report = await request(app)
      .post(`/api/production/${order.id}/reports`)
      .set(auth(token))
      .send({ completedQty: 6 });
    expect(report.status).toBe(201);

    const res = await request(app)
      .put(`/api/production/${order.id}`)
      .set(auth(token))
      .send({ quantity: 5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('计划数量不能小于已报数量');
  });

  test('非法状态流转返回 400', async () => {
    const order = await createWorkOrder(token, 5);

    const res = await request(app)
      .patch(`/api/production/${order.id}/status`)
      .set(auth(token))
      .send({ toStatus: 'completed' });

    expect(res.status).toBe(400);
  });
});
