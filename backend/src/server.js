/**
 * MES 系统 - 服务启动入口
 * 功能：启动 Express 服务、连接数据库、注册优雅关闭
 */

const app = require('./app');
const { config } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');

/** 服务实例 */
let server = null;

/**
 * 启动服务
 */
async function startServer() {
  try {
    // 1. 连接数据库
    await connectDatabase();

    // 2. 启动 HTTP 服务
    server = app.listen(config.port, () => {
      console.log('========================================');
      console.log(`  MES 制造执行系统 API`);
      console.log(`  环境: ${config.nodeEnv}`);
      console.log(`  端口: ${config.port}`);
      console.log(`  地址: http://localhost:${config.port}`);
      console.log(`  健康检查: http://localhost:${config.port}/api/health`);
      console.log('========================================');
    });

    // 3. 注册优雅关闭
    registerGracefulShutdown();
  } catch (error) {
    console.error('[启动] 服务启动失败:', error.message);
    process.exit(1);
  }
}

/**
 * 注册优雅关闭
 * 收到 SIGTERM / SIGINT 信号时：关闭 HTTP 服务 → 断开数据库连接 → 退出进程
 */
function registerGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n[关闭] 收到 ${signal} 信号，正在优雅关闭...`);

    if (server) {
      server.close(async () => {
        console.log('[关闭] HTTP 服务已停止');
        await disconnectDatabase();
        console.log('[关闭] 服务已完全关闭');
        process.exit(0);
      });

      // 强制超时退出（5 秒）
      setTimeout(() => {
        console.error('[关闭] 优雅关闭超时，强制退出');
        process.exit(1);
      }, 5000);
    } else {
      await disconnectDatabase();
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // 未捕获异常处理
  process.on('uncaughtException', (err) => {
    console.error('[异常] 未捕获的异常:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[异常] 未处理的 Promise 拒绝:', reason);
  });
}

// 启动服务
startServer();
