/**
 * 集成测试：库存出入库（P0 并发正确性回归）
 * ---------------------------------------------------------------------------
 * 覆盖本次修复：
 *  ① 并发出库不能产生负库存（条件扣减替代「先查后扣」）
 *  ② 出库超过库存返回 400，且不产生流水
 *  ③ 入库/出库后库存与流水一致
 */

const { app, request, login } = require('../helpers/api');

/** 构造鉴权头 */
function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

/** 唯一后缀，避免编码/批次号冲突 */
function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * 创建测试物料（同时自动创建库存记录，初始为 0）
 * @param {string} token 管理员 Token
 * @returns {Promise<object>} 物料（含 inventory）
 */
async function createMaterial(token) {
  const suffix = uniqueSuffix();
  const res = await request(app)
    .post('/api/material/materials')
    .set(auth(token))
    .send({
      code: `MAT-${suffix}`,
      name: `测试物料-${suffix}`,
      specification: '10mm',
      unit: '件',
      category: '原材料',
      type: 'raw',
    });

  if (res.status !== 201) {
    throw new Error(`创建物料失败（${res.status}）: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/**
 * 读取物料当前库存数量
 * @param {string} token 管理员 Token
 * @param {number} materialId 物料 ID
 * @returns {Promise<number>} 库存数量
 */
async function getStock(token, materialId) {
  const res = await request(app)
    .get(`/api/material/materials/${materialId}`)
    .set(auth(token));
  expect(res.status).toBe(200);
  return Number(res.body.data.inventory.quantity);
}

/**
 * 提交出入库
 * @param {string} token Token
 * @param {object} payload 事务数据
 */
function transact(token, payload) {
  return request(app)
    .post('/api/material/inventory/transactions')
    .set(auth(token))
    .send(payload);
}

describe('库存出入库 - 并发扣减与边界（P0）', () => {
  let token;

  beforeAll(async () => {
    ({ token } = await login());
  });

  test('入库后库存累加，出库后库存减少', async () => {
    const material = await createMaterial(token);

    const inbound = await transact(token, {
      materialId: material.id,
      transactionType: 'in',
      quantity: 10,
      batchNo: `BATCH-${uniqueSuffix()}`,
    });
    expect(inbound.status).toBe(201);
    expect(await getStock(token, material.id)).toBe(10);

    const outbound = await transact(token, {
      materialId: material.id,
      transactionType: 'out',
      quantity: 4,
      batchNo: `BATCH-${uniqueSuffix()}`,
    });
    expect(outbound.status).toBe(201);
    expect(await getStock(token, material.id)).toBe(6);
  });

  test('出库数量超过库存返回 400，且库存与流水不变', async () => {
    const material = await createMaterial(token);
    await transact(token, {
      materialId: material.id,
      transactionType: 'in',
      quantity: 5,
      batchNo: `BATCH-${uniqueSuffix()}`,
    });

    const res = await transact(token, {
      materialId: material.id,
      transactionType: 'out',
      quantity: 6,
      batchNo: `BATCH-${uniqueSuffix()}`,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('库存不足');
    expect(await getStock(token, material.id)).toBe(5);

    const list = await request(app)
      .get(`/api/material/inventory/transactions?materialId=${material.id}&page=1&pageSize=20`)
      .set(auth(token));
    expect(list.body.data.total).toBe(1);
  });

  test('并发出库不会产生负库存', async () => {
    const material = await createMaterial(token);
    await transact(token, {
      materialId: material.id,
      transactionType: 'in',
      quantity: 10,
      batchNo: `BATCH-${uniqueSuffix()}`,
    });

    // 两笔各出 8，合计 16 > 10：只允许一笔成功
    const [a, b] = await Promise.all([
      transact(token, {
        materialId: material.id,
        transactionType: 'out',
        quantity: 8,
        batchNo: `BATCH-${uniqueSuffix()}`,
      }),
      transact(token, {
        materialId: material.id,
        transactionType: 'out',
        quantity: 8,
        batchNo: `BATCH-${uniqueSuffix()}`,
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);

    const stock = await getStock(token, material.id);
    expect(stock).toBeGreaterThanOrEqual(0);
    expect(stock).toBe(2);

    const list = await request(app)
      .get(`/api/material/inventory/transactions?materialId=${material.id}&page=1&pageSize=20`)
      .set(auth(token));
    expect(list.body.data.total).toBe(2); // 1 入库 + 1 成功出库
  });
});
