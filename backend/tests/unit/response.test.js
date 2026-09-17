/**
 * 单元测试：src/utils/response.js
 * ---------------------------------------------------------------------------
 * 统一响应封装是全站接口契约的基础，用例锁定 { code, data, message } 结构
 * 与各语义化状态码，防止后续改动破坏前端对响应的解析。
 */

const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendNotImplemented,
} = require('../../src/utils/response');

/**
 * 构造 Express Response 的替身，记录 status 与 json 调用
 * @returns {{res: object, capture: object}} 替身与捕获结果
 */
function createMockRes() {
  const capture = { statusCode: null, body: null };
  const res = {
    status(code) {
      capture.statusCode = code;
      return res;
    },
    json(payload) {
      capture.body = payload;
      return res;
    },
  };
  return { res, capture };
}

describe('src/utils/response - 成功类响应', () => {
  test('sendSuccess 默认 200 并返回标准结构', () => {
    const { res, capture } = createMockRes();
    sendSuccess(res, { id: 1 });

    expect(capture.statusCode).toBe(200);
    expect(capture.body).toEqual({
      code: 200,
      data: { id: 1 },
      message: '操作成功',
    });
  });

  test('sendSuccess 支持自定义状态码与消息', () => {
    const { res, capture } = createMockRes();
    sendSuccess(res, null, '自定义消息', 202);

    expect(capture.statusCode).toBe(202);
    expect(capture.body.code).toBe(202);
    expect(capture.body.message).toBe('自定义消息');
  });

  test('sendCreated 固定返回 201', () => {
    const { res, capture } = createMockRes();
    sendCreated(res, { id: 9 });

    expect(capture.statusCode).toBe(201);
    expect(capture.body.message).toBe('创建成功');
    expect(capture.body.data).toEqual({ id: 9 });
  });

  test('sendPaginated 输出 list/total/page/pageSize 且页码转为数字', () => {
    const { res, capture } = createMockRes();
    sendPaginated(res, [{ id: 1 }], 42, '2', '20');

    expect(capture.statusCode).toBe(200);
    expect(capture.body.data).toEqual({
      list: [{ id: 1 }],
      total: 42,
      page: 2,
      pageSize: 20,
    });
    expect(typeof capture.body.data.page).toBe('number');
  });
});

describe('src/utils/response - 错误类响应', () => {
  test('sendError 默认 400 且 data 为 null', () => {
    const { res, capture } = createMockRes();
    sendError(res);

    expect(capture.statusCode).toBe(400);
    expect(capture.body).toEqual({
      code: 400,
      data: null,
      message: '操作失败',
    });
    // 无字段级错误时不输出 errors 字段
    expect(capture.body.errors).toBeUndefined();
  });

  test('sendError 携带字段级错误明细', () => {
    const { res, capture } = createMockRes();
    const errors = [{ field: 'username', message: '不能为空' }];
    sendError(res, '参数校验失败', 400, errors);

    expect(capture.body.errors).toEqual(errors);
  });

  test('errors 为空数组时不输出该字段', () => {
    const { res, capture } = createMockRes();
    sendError(res, '失败', 400, []);

    expect(capture.body.errors).toBeUndefined();
  });

  test.each([
    ['sendUnauthorized', sendUnauthorized, 401],
    ['sendForbidden', sendForbidden, 403],
    ['sendNotFound', sendNotFound, 404],
    ['sendConflict', sendConflict, 409],
    ['sendNotImplemented', sendNotImplemented, 501],
  ])('%s 使用正确的语义状态码', (_name, fn, expectedCode) => {
    const { res, capture } = createMockRes();
    fn(res);

    expect(capture.statusCode).toBe(expectedCode);
    expect(capture.body.code).toBe(expectedCode);
    expect(capture.body.data).toBeNull();
    expect(typeof capture.body.message).toBe('string');
  });

  test('语义化方法支持自定义消息', () => {
    const { res, capture } = createMockRes();
    sendUnauthorized(res, '自定义未认证提示');

    expect(capture.body.message).toBe('自定义未认证提示');
  });
});
