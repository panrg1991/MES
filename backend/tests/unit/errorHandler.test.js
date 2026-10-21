/**
 * 单元测试：src/middleware/errorHandler.js
 * ---------------------------------------------------------------------------
 * 锁定错误码映射规则（P1 修复）：Prisma 错误不再一律 500，且响应体统一带 requestId。
 */

const { describe, test, expect } = require('@jest/globals');
const { z } = require('zod');
const { errorHandler } = require('../../src/middleware/errorHandler');

/** 构造最小响应对象 */
function createRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

/** 构造最小请求对象 */
function createReq(overrides = {}) {
  return {
    id: 'req-test-1',
    method: 'POST',
    originalUrl: '/api/test?secret=should-not-be-logged',
    user: { userId: 9 },
    ...overrides,
  };
}

/**
 * 调用错误处理中间件
 * @param {Error} err 错误
 * @param {object} [reqOverrides] 请求覆盖字段
 * @returns {{statusCode: number, body: object}}
 */
function handle(err, reqOverrides) {
  const res = createRes();
  errorHandler(err, createReq(reqOverrides), res, () => undefined);
  return res;
}

describe('errorHandler - Prisma 错误映射', () => {
  test('P2002 唯一约束冲突 → 409 并带字段名', () => {
    const err = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['code'] },
    });

    const res = handle(err);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain('数据已存在');
    expect(res.body.message).toContain('code');
    expect(res.body.requestId).toBe('req-test-1');
  });

  test('P2025 记录不存在 → 404', () => {
    const res = handle(Object.assign(new Error('Record not found'), { code: 'P2025' }));
    expect(res.statusCode).toBe(404);
  });

  test('P2003 外键约束 → 400', () => {
    const res = handle(Object.assign(new Error('FK failed'), { code: 'P2003' }));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('关联数据');
  });

  test('P2034 事务写冲突 → 409', () => {
    const res = handle(Object.assign(new Error('Write conflict'), { code: 'P2034' }));
    expect(res.statusCode).toBe(409);
  });

  test('P1001 数据库不可用 → 503', () => {
    const res = handle(Object.assign(new Error('DB down'), { code: 'P1001' }));
    expect(res.statusCode).toBe(503);
  });
});

describe('errorHandler - 其他错误类型', () => {
  test('ZodError → 400 且返回字段级明细', () => {
    let zodError;
    try {
      z.object({ name: z.string().min(1, '名称不能为空') }).parse({ name: '' });
    } catch (error) {
      zodError = error;
    }

    const res = handle(zodError);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('参数校验失败');
    expect(res.body.errors).toEqual([{ field: 'name', message: '名称不能为空' }]);
  });

  test('业务错误（statusCode）保留状态码与冲突明细', () => {
    const err = Object.assign(new Error('排程冲突'), {
      statusCode: 409,
      conflicts: [{ id: 1 }],
    });

    const res = handle(err);
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicts).toEqual([{ id: 1 }]);
    expect(res.body.requestId).toBe('req-test-1');
  });

  test('未知错误 → 500 且生产/测试环境不泄露内部信息', () => {
    const res = handle(new Error('数据库密码错误 mysql://root:pwd@host'));
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe('服务器内部错误');
  });
});
