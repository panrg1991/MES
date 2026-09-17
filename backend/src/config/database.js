/**
 * MES 系统 - 数据库动态适配器
 * ---------------------------------------------------------------------------
 * 设计要点（本次重构的核心改造）：
 *   ① Prisma 的 datasource.provider 是编译期字面量，无法用环境变量在运行时切换；
 *      因此为每种数据库维护一份独立 schema，并生成到**各自独立的 Client 目录**：
 *          prisma/schema.sqlite.prisma → prisma/generated/sqlite
 *          prisma/schema.mysql.prisma  → prisma/generated/mysql
 *   ② 启动时按 config.dbType 动态 require 对应 Client，实现「改 .env 即切库」，
 *      两种 Client 都预生成后，切换数据库**无需重新 generate**，重启即生效。
 *   ③ 对外仍导出全局唯一的 `prisma` 实例，业务层（services）零改动。
 *   ④ 未生成 Client 时抛出带明确修复指引的错误，避免晦涩的模块找不到异常。
 */

const path = require('path');
const { config } = require('./env');

/** Prisma Client 生成根目录（相对 backend/prisma/） */
const GENERATED_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'generated');

/** 各数据库类型对应的 Prisma Client 入口目录 */
const CLIENT_DIRS = {
  sqlite: path.join(GENERATED_DIR, 'sqlite'),
  mysql: path.join(GENERATED_DIR, 'mysql'),
};

/** Prisma 客户端实例（单例） */
let prismaInstance = null;

/**
 * 加载指定数据库类型对应的 PrismaClient 构造器
 * @param {'sqlite'|'mysql'} dbType 数据库类型
 * @returns {Function} PrismaClient 构造器
 * @throws {Error} Client 未生成时抛出带修复指引的错误
 */
function loadPrismaClient(dbType) {
  const clientDir = CLIENT_DIRS[dbType];
  if (!clientDir) {
    throw new Error(
      `[数据库] 不支持的数据库类型: ${dbType}（仅支持 ${Object.keys(CLIENT_DIRS).join(' / ')}）`,
    );
  }

  try {
    // 按运行时配置动态加载（路径由 DB_TYPE 决定，故不能使用静态 import）
    const clientModule = require(clientDir);
    const Client = clientModule.PrismaClient;
    if (typeof Client !== 'function') {
      throw new Error(`导出的 PrismaClient 不是构造函数：${clientDir}`);
    }
    return Client;
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        [
          `[数据库] 尚未生成 ${dbType} 对应的 Prisma Client。`,
          '请先执行（二选一）：',
          `  npm run db:setup:${dbType}   # 仅生成当前库类型的 Client`,
          '  npm run db:setup:all       # 生成全部库类型的 Client（推荐，便于随时切换）',
        ].join('\n'),
      );
    }
    throw error;
  }
}

/**
 * 获取 Prisma 客户端单例
 * 开发环境开启 SQL 日志，生产环境仅记录 error
 * @returns {object} Prisma 客户端实例
 */
function getPrismaClient() {
  if (prismaInstance) {
    return prismaInstance;
  }

  const PrismaClientCtor = loadPrismaClient(config.dbType);

  prismaInstance = new PrismaClientCtor({
    log: config.isDev ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: config.databaseUrl,
      },
    },
  });

  return prismaInstance;
}

/** 全局 Prisma 客户端实例 */
const prisma = getPrismaClient();

/**
 * 连接数据库
 * 在服务启动时调用，确保数据库连接可用
 * @returns {Promise<void>}
 */
async function connectDatabase() {
  try {
    await prisma.$connect();
    const { describeDatabase } = require('./env');
    console.log(
      `[数据库] 已连接 ${config.dbType.toUpperCase()}：${describeDatabase()}`,
    );
  } catch (error) {
    console.error(`[数据库] 连接失败(${config.dbType}):`, error.message);
    if (config.dbType === 'mysql') {
      console.error(
        '[数据库] 请确认 MySQL 已启动、库已创建（utf8mb4）、账号密码正确。',
      );
    }
    throw error;
  }
}

/**
 * 断开数据库连接
 * 在服务关闭时调用，优雅释放资源
 * @returns {Promise<void>}
 */
async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log('[数据库] 已断开连接');
  } catch (error) {
    console.error('[数据库] 断开连接失败:', error.message);
  }
}

/**
 * 数据库健康检查（供 /api/health 与运维探活使用）
 * @returns {Promise<{dbType: string, connected: boolean, latencyMs: number|null, error: string|null}>}
 */
async function checkDatabaseHealth() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return {
      dbType: config.dbType,
      connected: true,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      dbType: config.dbType,
      connected: false,
      latencyMs: null,
      error: error.message,
    };
  }
}

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth,
};
