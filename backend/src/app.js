/**
 * MES 系统 - Express 应用配置
 * 配置中间件：CORS / Helmet / Body Parser / Morgan 日志 / 路由 / 错误处理
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { config } = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/** Express 应用实例 */
const app = express();

// ==================== 安全中间件 ====================

// Helmet：设置安全相关的 HTTP 头
app.use(helmet());

// CORS：跨域资源共享
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

// ==================== 日志中间件 ====================

// HTTP 请求日志
app.use(morgan(config.isDev ? 'dev' : 'combined'));

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
      version: '1.0.0',
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
