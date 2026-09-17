/**
 * MES 系统 - 环境变量配置
 * ---------------------------------------------------------------------------
 * 职责：加载 .env、推导数据库类型（DB_TYPE）、拼装连接串、暴露统一配置对象。
 *
 * 数据库动态配置口径（本重构的核心）：
 *   ① 支持的库类型：sqlite（默认） / mysql
 *   ② DB_TYPE 可显式声明；未声明时由 DATABASE_URL 前缀自动推断（file: → sqlite）
 *   ③ 连接串可用两种方式提供，分散参数优先于整串，便于容器化按项注入：
 *        - 整串：DATABASE_URL="mysql://user:pass@127.0.0.1:3306/mes_workshop"
 *        - 分散：DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME（MySQL）
 *                DB_PATH（SQLite，相对 prisma/ 目录）
 *   ④ 切换数据库只需改 .env 并重启，无需改动任何业务代码
 */

const dotenv = require('dotenv');

// 根据环境加载对应的 .env 文件
const envFile =
  process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: envFile });

/** 支持的数据库类型 */
const SUPPORTED_DB_TYPES = ['sqlite', 'mysql'];

/**
 * 由连接串前缀推断数据库类型
 * @param {string} url 连接串
 * @returns {'sqlite'|'mysql'|null} 推断结果（无法识别时返回 null）
 */
function detectDbTypeFromUrl(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (value.startsWith('file:')) return 'sqlite';
  if (value.startsWith('mysql:')) return 'mysql';
  return null;
}

/**
 * 归一化并校验数据库类型
 * @param {string|undefined} value 原始值
 * @returns {'sqlite'|'mysql'} 归一化后的类型（非法值回退 sqlite）
 */
function normalizeDbType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'mariadb') return 'mysql';
  return SUPPORTED_DB_TYPES.includes(normalized) ? normalized : 'sqlite';
}

/**
 * 对连接串中的用户名/密码做百分号编码（避免特殊字符破坏 URL 结构）
 * @param {string} value 原始字符串
 * @returns {string} 编码后的字符串
 */
function encodeUrlPart(value) {
  return encodeURIComponent(String(value ?? ''));
}

/**
 * 拼装 MySQL 连接串
 * @returns {string} mysql://user:pass@host:port/db 形式的连接串
 */
function buildMysqlUrl() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '3306';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const name = process.env.DB_NAME || 'mes_workshop';
  const credentials = password
    ? `${encodeUrlPart(user)}:${encodeUrlPart(password)}`
    : encodeUrlPart(user);
  return `mysql://${credentials}@${host}:${port}/${name}`;
}

/**
 * 拼装 SQLite 连接串（文件路径相对于 backend/prisma/ 目录）
 * @returns {string} file:./xxx.db 形式的连接串
 */
function buildSqliteUrl() {
  const dbPath = process.env.DB_PATH || './dev.db';
  return dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;
}

/** 显式声明或推断出的数据库类型 */
const dbType = normalizeDbType(
  process.env.DB_TYPE || detectDbTypeFromUrl(process.env.DATABASE_URL),
);

/**
 * 解析最终连接串：显式 DATABASE_URL 优先，否则按 DB_TYPE 由分散参数拼装
 * 说明：若显式 DATABASE_URL 与 DB_TYPE 不一致，以 DB_TYPE 为准重新拼装，
 *      避免「改了 DB_TYPE 但 URL 仍是旧库」导致的静默连错库。
 */
function resolveDatabaseUrl() {
  const explicitUrl = (process.env.DATABASE_URL || '').trim();
  const explicitType = detectDbTypeFromUrl(explicitUrl);
  if (explicitUrl && explicitType === dbType) {
    return explicitUrl;
  }
  return dbType === 'mysql' ? buildMysqlUrl() : buildSqliteUrl();
}

/**
 * 环境变量配置对象
 * 所有配置项均有默认值，确保服务可启动
 */
const config = {
  /** 服务端口 */
  port: parseInt(process.env.PORT || '3000', 10),

  /** 数据库类型：sqlite | mysql */
  dbType,

  /** 数据库连接字符串 */
  databaseUrl: resolveDatabaseUrl(),

  /** JWT Access Token 密钥 */
  jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',

  /** Access Token 有效期 */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',

  /** JWT Refresh Token 密钥 */
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',

  /** Refresh Token 有效期 */
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  /** CORS 允许来源（多个用英文逗号分隔） */
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  /** 请求体大小限制（MB） */
  bodyLimit: parseInt(process.env.BODY_LIMIT || '10', 10),

  /** 当前环境 */
  nodeEnv: process.env.NODE_ENV || 'development',

  /** 是否为开发环境 */
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  /** 是否在启动时自动执行 seed（空库初始化，默认关闭） */
  autoSeed: String(process.env.AUTO_SEED || 'false').toLowerCase() === 'true',
};

/**
 * 校验关键环境变量是否合法
 * 缺少关键变量时抛出错误，避免运行时故障
 */
function validateConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (!config.jwtRefreshSecret) missing.push('JWT_REFRESH_SECRET');
  if (!SUPPORTED_DB_TYPES.includes(config.dbType)) {
    throw new Error(
      `不支持的数据库类型: ${config.dbType}，仅支持 ${SUPPORTED_DB_TYPES.join(' / ')}`,
    );
  }
  if (missing.length > 0) {
    throw new Error(`环境变量缺失: ${missing.join(', ')}，请检查 .env 文件`);
  }
}

/**
 * 打印当前数据库配置摘要（脱敏，不输出密码）
 * @returns {string} 摘要文本
 */
function describeDatabase() {
  if (config.dbType === 'mysql') {
    const host = process.env.DB_HOST || '127.0.0.1';
    const port = process.env.DB_PORT || '3306';
    const name = process.env.DB_NAME || 'mes_workshop';
    return `mysql://***@${host}:${port}/${name}`;
  }
  return config.databaseUrl;
}

module.exports = { config, validateConfig, describeDatabase, SUPPORTED_DB_TYPES };
