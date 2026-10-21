/**
 * MES 系统 - 请求上下文与访问日志中间件
 * =============================================================================
 * 职责：
 *  ① 为每个请求生成 requestId（优先复用网关传入的 X-Request-Id），并回写响应头，
 *     便于「用户报障 → 后端日志」精准定位；
 *  ② 请求结束后输出结构化访问日志：method / path / status / durationMs / userId / ip；
 *  ③ 5xx 记为 error、4xx 记为 warn、慢请求（>1s）附加 slow 标记；
 *  ④ 探活与测试环境不输出，避免日志噪声。
 *
 * 注意：只记录 path（不含 query string），避免搜索关键字、工单号等进入日志。
 */

const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');

/** 慢请求阈值（毫秒） */
const SLOW_REQUEST_MS = 1000;

/** 不记录访问日志的路径（负载均衡/监控探活） */
const SKIP_PATHS = new Set(['/api/health']);

/**
 * 请求上下文中间件
 * @param {import('express').Request} req 请求
 * @param {import('express').Response} res 响应
 * @param {import('express').NextFunction} next 下一个中间件
 */
function requestContext(req, res, next) {
  const incomingId = req.get('X-Request-Id');
  req.id = incomingId && incomingId.length <= 64 ? incomingId : randomUUID();
  res.setHeader('X-Request-Id', req.id);

  // 测试环境保持安静，但仍保留 requestId 能力
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    if (SKIP_PATHS.has(path)) return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    logger[level]('http_request', {
      requestId: req.id,
      method: req.method,
      path,
      status,
      durationMs: Math.round(durationMs),
      userId: req.user?.userId,
      ip: req.ip,
      slow: durationMs >= SLOW_REQUEST_MS ? true : undefined,
    });
  });

  next();
}

module.exports = { requestContext };
