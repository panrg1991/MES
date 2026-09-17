/**
 * MES 系统 - 全局错误处理中间件
 * 捕获所有未处理的异常，返回统一的错误响应
 */

const { config } = require('../config/env');

/**
 * 404 路由不存在处理
 */
function notFoundHandler(req, res) {
  return res.status(404).json({
    code: 404,
    data: null,
    message: `路由不存在: ${req.method} ${req.path}`,
  });
}

/**
 * 全局错误处理中间件
 * 必须有 4 个参数（err, req, res, next），Express 才能识别为错误处理器
 */
function errorHandler(err, req, res, _next) {
  // Zod 校验错误
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
    });
  }

  // 业务逻辑错误（自定义 Error）
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      code: err.statusCode,
      data: null,
      message: err.message || '操作失败',
    });
  }

  // 未知服务器错误
  console.error('[错误处理] 未捕获异常:', err);

  return res.status(500).json({
    code: 500,
    data: null,
    message: config.isDev ? err.message : '服务器内部错误',
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
