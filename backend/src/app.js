/**
 * MES 系统 - Express 应用配置
 * 配置中间件：CORS / Helmet / Body Parser / 请求上下文与访问日志 / 路由 / 错误处理
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { config } = require('./config/env');
const routes = require('./routes');
const { requestContext } = require('./middleware/requestContext');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const packageInfo = require('../package.json');

/** Express 应用实例 */
const app = express();

// ==================== 安全中间件 ====================

// 不暴露服务端技术栈信息
app.disable('x-powered-by');

// 反向代理支持：Nginx / IIS ARR 前置时，按 X-Forwarded-For 识别真实客户端 IP
// 未开启时所有请求会被限流器视为同一 IP（车间多终端并发时容易误触发 429）
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

// Helmet：设置安全相关的 HTTP 头
app.use(helmet());

/**
 * CORS 允许来源判断
 * - 无 Origin（同源请求 / curl / 服务端调用）：放行
 * - 配置为 '*' 或命中白名单：放行
 * - 其他：不返回 CORS 头（由浏览器拦截，不抛 500，避免影响其他正常请求）
 * @param {string|undefined} origin 请求来源
 * @param {(err: Error|null, allow?: boolean) => void} callback 回调
 */
function corsOriginMatcher(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }
  if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
}

// CORS：跨域资源共享（支持前后端分机/分端口独立部署）
app.use(
  cors({
    origin: corsOriginMatcher,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'], // 导出文件名需要前端读取
    maxAge: 600, // 预检结果缓存 10 分钟，减少 OPTIONS 请求
  }),
);

// 请求频率限制：防止暴力破解和 DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: 500, // 每个 IP 最多 500 次请求
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 429,
    data: null,
    message: '请求过于频繁，请稍后再试',
  },
});
app.use('/api', limiter);

// ==================== 解析中间件 ====================

// 请求体解析（JSON + URL编码）
app.use(express.json({ limit: `${config.bodyLimit}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${config.bodyLimit}mb` }));

// ==================== 请求上下文与访问日志 ====================

// 为每个请求生成 requestId（回写 X-Request-Id），结束时输出结构化访问日志
// 说明：替代 morgan；生产为 JSON 行，开发为人可读格式，探活接口不记录
app.use(requestContext);

// ==================== 静态资源 ====================
// 如需提供上传文件访问，可在此配置静态目录
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ==================== 路由挂载 ====================

// 所有 API 路由挂载到 /api 前缀
app.use('/api', routes);

// 根路径欢迎信息
app.get('/', (req, res) => {
  res.status(200).json({
    code: 200,
    data: {
      name: 'MES 车间制造执行系统 API',
      version: packageInfo.version,
      docs: '/api/health',
    },
    message: '欢迎使用 MES 制造执行系统',
  });
});

// ==================== 错误处理 ====================

// 404 路由不存在
app.use(notFoundHandler);

// 全局错误处理（必须最后注册）
app.use(errorHandler);

module.exports = app;
