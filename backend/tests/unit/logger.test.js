/**
 * 单元测试：src/utils/logger.js
 * ---------------------------------------------------------------------------
 * 重点验证「日志脱敏」——密码与 Token 一旦进入日志，等同于凭据泄露；
 * 同时覆盖生产 JSON 输出与级别过滤分支。
 */

const { describe, test, expect, afterEach } = require('@jest/globals');
const { sanitize, logger } = require('../../src/utils/logger');

describe('logger.sanitize - 敏感字段脱敏', () => {
  test('对 password / token / authorization / secret 字段脱敏', () => {
    const result = sanitize({
      username: 'admin',
      password: 'admin123',
      token: 'jwt-token',
      authorization: 'Bearer x',
      refreshSecret: 's3cret',
    });

    expect(result).toEqual({
      username: 'admin',
      password: '***',
      token: '***',
      authorization: '***',
      refreshSecret: '***',
    });
  });

  test('递归处理嵌套对象与数组', () => {
    const result = sanitize({
      user: { name: '张三', password: 'pwd' },
      list: [{ accessToken: 'a' }, { name: 'ok' }],
    });

    expect(result.user.password).toBe('***');
    expect(result.list[0].accessToken).toBe('***');
    expect(result.list[1].name).toBe('ok');
  });

  test('Error 对象被转换为可序列化结构', () => {
    const result = sanitize({ error: new Error('boom') });
    expect(result.error).toEqual({ name: 'Error', message: 'boom' });
  });

  test('超过 3 层的嵌套对象原样返回，避免深递归与循环引用', () => {
    const deep = { a: { b: { c: { d: { password: 'x' } } } } };
    const result = sanitize(deep);
    expect(result.a.b.c.d).toEqual({ password: 'x' });
  });

  test('不修改非对象值', () => {
    expect(sanitize(123)).toBe(123);
    expect(sanitize('text')).toBe('text');
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });
});

describe('logger - 级别过滤与输出格式', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogLevel = process.env.LOG_LEVEL;
  const spies = ['log', 'warn', 'error'].map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined),
  );

  /** 统计 console 调用总数 */
  function outputCount() {
    return spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
  }

  afterEach(() => {
    spies.forEach((spy) => spy.mockClear());
    process.env.NODE_ENV = originalNodeEnv;
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  test('开发环境输出人可读格式，四个级别均可用', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;

    logger.info('test_info', { requestId: 'r1' });
    logger.warn('test_warn', { status: 403 });
    logger.error('test_error', { message: 'boom' });
    logger.debug('test_debug', { a: 1 });

    expect(outputCount()).toBe(4);
    expect(spies[0].mock.calls[0][0]).toContain('test_info');
  });

  test('生产环境输出 JSON 行并包含 level / msg / time', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_LEVEL;

    logger.info('http_request', { status: 200, requestId: 'r2' });

    const line = spies[0].mock.calls[0][0];
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('http_request');
    expect(parsed.status).toBe(200);
    expect(typeof parsed.time).toBe('string');
  });

  test('LOG_LEVEL=error 时过滤 info/warn/debug', () => {
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'error';

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(outputCount()).toBe(1);
    expect(spies[2]).toHaveBeenCalledTimes(1);
  });
});
