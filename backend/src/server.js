/**
 * MES 系统 - 服务启动入口
 * 功能：启动 Express 服务、连接数据库、注册优雅关闭
 */

const app = require('./app');
const {
  config,
  validateConfig,
  hasInsecureSecrets,
} = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { logger } = require('./utils/logger');

/** 服务实例 */
let server = null;

/**
 * 启动服务
 */
async function startServer() {
  try {
    // 0. 配置自检（端口/数据库类型/密钥等），启动即失败优于运行期出错
    validateConfig();

    // 1. 连接数据库
    await connectDatabase();

    // 2. 启动 HTTP 服务（host 决定是否允许局域网其他电脑访问）
    server = app.listen(config.port, config.host, () => {
      logger.info('server_started', {
        env: config.nodeEnv,
        host: config.host,
        port: config.port,
        dbType: config.dbType,
        corsOrigins: config.corsOrigins,
        node: process.version,
      });

      if (config.nodeEnv === 'production' && hasInsecureSecrets()) {
        logger.warn('insecure_jwt_secret', {
          hint: '请更换 JWT_SECRET / JWT_REFRESH_SECRET 后重启',
        });
      }
      if (config.corsOrigins.includes('*')) {
        logger.warn('cors_allow_all', {
          hint: 'CORS_ORIGIN=* 仅建议内网可信环境使用',
        });
      }
    });

    // 3. 注册优雅关闭
    registerGracefulShutdown();
  } catch (error) {
    logger.error('server_start_failed', { message: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * 注册优雅关闭
 * 收到 SIGTERM / SIGINT 信号时：关闭 HTTP 服务 → 断开数据库连接 → 退出进程
 */
function registerGracefulShutdown() {
  const shutdown = async (signal) => {
    logger.info('server_shutdown_started', { signal });

    if (server) {
      server.close(async () => {
        await disconnectDatabase();
        logger.info('server_shutdown_completed');
        process.exit(0);
      });

      // 强制超时退出（5 秒）
      setTimeout(() => {
        logger.error('server_shutdown_timeout', { timeoutMs: 5000 });
        process.exit(1);
      }, 5000);
    } else {
      await disconnectDatabase();
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // 未捕获异常：进程状态可能已不一致，记录后退出，由 PM2/容器重启（避免带病运行）
  process.on('uncaughtException', (err) => {
    logger.error('uncaught_exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });

  // 未处理的 Promise 拒绝：记录完整堆栈，便于定位遗漏的 await
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

// 启动服务
startServer();
