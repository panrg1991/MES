/**
 * MES 系统 - 全局错误处理中间件
 * ---------------------------------------------------------------------------
 * 统一出口，负责：
 *  ① Zod 参数校验错误 → 400 + 字段级明细；
 *  ② 业务自定义错误（带 statusCode）→ 原样返回；
 *  ③ Prisma 已知错误（唯一冲突/记录不存在/外键约束/连接失败）→ 语义化状态码，
 *     不再一律 500「服务器内部错误」；
 *  ④ 请求体解析错误 → 400；
 *  ⑤ 未知错误 → 500，生产环境隐藏细节，并记录带 requestId 的错误日志。
 */

const { config } = require('../config/env');
const { logger } = require('../utils/logger');

/**
 * Prisma 错误码 → HTTP 状态与用户可读文案
 * 只映射「调用方可处理」的错误，其余仍按未知异常处理。
 */
const PRISMA_ERROR_MAP = {
  P2002: { status: 409, message: '数据已存在，请勿重复提交' },
  P2003: { status: 400, message: '存在关联数据，无法完成该操作' },
  P2014: { status: 400, message: '存在关联数据，无法完成该操作' },
  P2025: { status: 404, message: '记录不存在或已被删除' },
  P2034: { status: 409, message: '数据已被其他操作修改，请刷新后重试' },
  P1001: { status: 503, message: '数据库暂时不可用，请稍后重试' },
  P1002: { status: 503, message: '数据库连接超时，请稍后重试' },
  P1008: { status: 503, message: '数据库操作超时，请稍后重试' },
  P1017: { status: 503, message: '数据库连接已断开，请稍后重试' },
};

/**
 * 把 Prisma 的 target（字段数组/字符串）转成可读文案
 * @param {unknown} target Prisma meta.target
 * @returns {string} 字段描述
 */
function formatTarget(target) {
  if (Array.isArray(target)) return target.join('、');
  if (typeof target === 'string' && target) return target;
  return '未知字段';
}

/**
 * 判断是否为 Prisma 已知请求错误
 * @param {Error} err 错误对象
 * @returns {boolean} 是否 Prisma 错误
 */
function isPrismaError(err) {
  return typeof err.code === 'string' && /^P\d{4}$/.test(err.code);
}

/**
 * 404 路由不存在处理
 */
function notFoundHandler(req, res) {
  return res.status(404).json({
    code: 404,
    data: null,
    message: `路由不存在: ${req.method} ${req.path}`,
    requestId: req.id,
  });
}

/**
 * 全局错误处理中间件
 * 必须有 4 个参数（err, req, res, next），Express 才能识别为错误处理器
 */
function errorHandler(err, req, res, _next) {
  // 1. Zod 校验错误
  if (err.name === 'ZodError') {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    return res.status(400).json({
      code: 400,
      data: null,
      message: '参数校验失败',
      errors,
      requestId: req.id,
    });
  }

  // 2. 请求体解析错误（body-parser 会带 statusCode，需优先于通用业务错误处理）
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    const status = err.type === 'entity.too.large' ? 413 : 400;
    return res.status(status).json({
      code: status,
      data: null,
      message:
        err.type === 'entity.too.large'
          ? '请求体过大，请减少提交内容'
          : '请求体格式错误（非法 JSON）',
      requestId: req.id,
    });
  }

  // 3. 业务逻辑错误（自定义 Error：service 中显式设置 statusCode）
  if (err.statusCode) {
    if (err.statusCode >= 500) {
      logger.error('business_error', {
        requestId: req.id,
        userId: req.user?.userId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: err.statusCode,
        message: err.message,
        stack: config.isDev ? err.stack : undefined,
      });
    }

    const body = {
      code: err.statusCode,
      data: null,
      message: err.message || '操作失败',
      requestId: req.id,
    };
    // 排程冲突等场景需要前端展示冲突明细
    if (Array.isArray(err.conflicts) && err.conflicts.length > 0) {
      body.conflicts = err.conflicts;
    }
    return res.status(err.statusCode).json(body);
  }

  // 4. Prisma 已知错误：转换为语义化状态码（避免唯一冲突等一律 500）
  if (isPrismaError(err)) {
    const mapped = PRISMA_ERROR_MAP[err.code];
    if (mapped) {
      const message =
        err.code === 'P2002'
          ? `${mapped.message}（${formatTarget(err.meta?.target)}）`
          : mapped.message;

      logger.warn('prisma_error', {
        requestId: req.id,
        userId: req.user?.userId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        prismaCode: err.code,
        target: err.meta?.target,
        status: mapped.status,
        message: err.message,
      });

      return res.status(mapped.status).json({
        code: mapped.status,
        data: null,
        message,
        requestId: req.id,
      });
    }
  }

  // 5. 未知服务器错误
  logger.error('unhandled_error', {
    requestId: req.id,
    userId: req.user?.userId,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    message: err.message,
    stack: err.stack,
  });

  return res.status(500).json({
    code: 500,
    data: null,
    message: config.isDev ? err.message : '服务器内部错误',
    requestId: req.id,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
