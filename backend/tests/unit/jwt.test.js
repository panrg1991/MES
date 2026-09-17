/**
 * 单元测试：src/utils/jwt.js
 * ---------------------------------------------------------------------------
 * 覆盖认证基础设施的关键安全属性：
 *   · Access / Refresh 双 Token 的签发与验证往返
 *   · 被篡改的 Token 必须验证失败（返回 null 而非抛异常）
 *   · 两种 Token 的密钥相互隔离（Access 不能当 Refresh 用，反之亦然）
 *   · 过期 Token 验证失败
 */

const jsonwebtoken = require('jsonwebtoken');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signTokenPair,
} = require('../../src/utils/jwt');
const { config } = require('../../src/config/env');

/** 测试用 payload */
const PAYLOAD = {
  userId: 1,
  username: 'admin',
  permissions: ['system:user:view', 'production:order:view'],
};

describe('src/utils/jwt - Access Token', () => {
  test('签发的 Token 可被正确验证并还原载荷', () => {
    const token = signAccessToken(PAYLOAD);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded.userId).toBe(1);
    expect(decoded.username).toBe('admin');
    expect(decoded.permissions).toEqual(PAYLOAD.permissions);
  });

  test('被篡改的 Token 验证失败返回 null', () => {
    const token = signAccessToken(PAYLOAD);
    const tampered = `${token.slice(0, -3)}abc`;
    expect(verifyAccessToken(tampered)).toBeNull();
  });

  test('使用其他密钥签发的 Token 验证失败', () => {
    const foreign = jsonwebtoken.sign(PAYLOAD, 'another-secret', {
      expiresIn: '1h',
    });
    expect(verifyAccessToken(foreign)).toBeNull();
  });

  test('过期 Token 验证失败返回 null', () => {
    const expired = jsonwebtoken.sign(PAYLOAD, config.jwtSecret, {
      expiresIn: '-10s',
    });
    expect(verifyAccessToken(expired)).toBeNull();
  });

  test('非 Token 字符串与空值不抛异常', () => {
    expect(verifyAccessToken('not-a-token')).toBeNull();
    expect(verifyAccessToken('')).toBeNull();
  });
});

describe('src/utils/jwt - Refresh Token', () => {
  test('签发的 Refresh Token 可被正确验证', () => {
    const token = signRefreshToken({ userId: 2, username: 'operator' });
    const decoded = verifyRefreshToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded.userId).toBe(2);
    expect(decoded.username).toBe('operator');
  });

  test('Refresh Token 无效时返回 null', () => {
    expect(verifyRefreshToken('broken.token.value')).toBeNull();
  });
});

describe('src/utils/jwt - 双 Token 隔离性', () => {
  test('Access Token 不能通过 Refresh 验证（密钥不同）', () => {
    const accessToken = signAccessToken(PAYLOAD);
    expect(verifyRefreshToken(accessToken)).toBeNull();
  });

  test('Refresh Token 不能通过 Access 验证（密钥不同）', () => {
    const refreshToken = signRefreshToken({ userId: 1, username: 'admin' });
    expect(verifyAccessToken(refreshToken)).toBeNull();
  });

  test('两个密钥在配置层确实不同', () => {
    expect(config.jwtSecret).not.toBe(config.jwtRefreshSecret);
  });
});

describe('src/utils/jwt - signTokenPair', () => {
  test('返回成对的 token 与 refreshToken', () => {
    const pair = signTokenPair({ id: 7, username: 'tester' }, ['a:view']);

    expect(pair).toHaveProperty('token');
    expect(pair).toHaveProperty('refreshToken');
    expect(pair.token).not.toBe(pair.refreshToken);

    const accessPayload = verifyAccessToken(pair.token);
    expect(accessPayload.userId).toBe(7);
    expect(accessPayload.username).toBe('tester');
    expect(accessPayload.permissions).toEqual(['a:view']);

    // Refresh Token 只携带身份，不携带权限（最小权限原则）
    const refreshPayload = verifyRefreshToken(pair.refreshToken);
    expect(refreshPayload.userId).toBe(7);
    expect(refreshPayload.permissions).toBeUndefined();
  });

  test('权限为空数组时也能正常签发', () => {
    const pair = signTokenPair({ id: 3, username: 'guest' }, []);
    expect(verifyAccessToken(pair.token).permissions).toEqual([]);
  });
});
