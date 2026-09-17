#!/usr/bin/env node
/**
 * MES 系统 - 数据库一键配置脚本（SQLite / MySQL 动态配置）
 * ---------------------------------------------------------------------------
 * 做什么：
 *   1) 由主模型文件 prisma/schema.prisma 同步生成各库类型的 schema 变体
 *      （仅改写 datasource.provider 与 generator.output，model 定义逐字一致）
 *   2) 为每个库类型生成独立的 Prisma Client（输出到 prisma/generated/<类型>）
 *   3) 可选：把表结构推送到目标库（--push）
 *   4) 可选：写入种子数据（--seed，幂等可重复执行）
 *
 * 为什么这么做：
 *   Prisma 的 datasource.provider 只能是字面量，无法在运行时用环境变量切换。
 *   本脚本把「每一种数据库」预生成为独立的 Client，运行时由 src/config/database.js
 *   按 DB_TYPE 动态加载 → 切换数据库只需改 .env 的 DB_TYPE 并重启。
 *
 * 用法：
 *   node scripts/db-setup.js                    # 按 .env 的 DB_TYPE 生成 Client
 *   node scripts/db-setup.js sqlite  --push --seed
 *   node scripts/db-setup.js mysql   --push --seed
 *   node scripts/db-setup.js all     --push     # 同时准备两种库
 *   node scripts/db-setup.js --status           # 查看当前配置与各 Client 生成状态
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

/** backend 根目录 */
const BACKEND_DIR = path.resolve(__dirname, '..');

// 与 src/config/env.js 保持一致的读取规则：生产读 .env.production，其余读 .env
dotenv.config({
  path: path.join(
    BACKEND_DIR,
    process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
  ),
});
/** 主模型文件（唯一真源，所有变体由它派生） */
const BASE_SCHEMA = path.join(BACKEND_DIR, 'prisma', 'schema.prisma');
/** Prisma Client 生成根目录 */
const GENERATED_DIR = path.join(BACKEND_DIR, 'prisma', 'generated');

/** 支持的数据库类型及其 Prisma provider */
const DRIVERS = {
  sqlite: { provider: 'sqlite', urlHint: 'file:./dev.db' },
  mysql: { provider: 'mysql', urlHint: 'mysql://user:pass@127.0.0.1:3306/mes_workshop' },
};

/** 各库类型 schema 变体的文件头说明 */
const SCHEMA_HEADERS = {
  sqlite: `// =====================================================
// MES 车间制造执行系统 - Prisma 数据模型（SQLite 变体）
// 数据库：SQLite 3（开发 / 单机 / 内网小规模部署首选）
//
// 【自动生成】本文件由 scripts/db-setup.js 依据 prisma/schema.prisma 派生，
//            请勿手工编辑；模型定义以 prisma/schema.prisma 为准。
// 【差异点】仅 datasource.provider 与 generator.output 与 MySQL 变体不同。
// =====================================================
`,
  mysql: `// =====================================================
// MES 车间制造执行系统 - Prisma 数据模型（MySQL 变体）
// 数据库：MySQL 8.0+ / MariaDB 10.3+
//
// 【自动生成】本文件由 scripts/db-setup.js 依据 prisma/schema.prisma 派生，
//            请勿手工编辑；模型定义以 prisma/schema.prisma 为准。
// 【类型映射】由 Prisma 按 MySQL 规则落库（无需 @db.* 注解）：
//            Int → INT、String → VARCHAR(191)、Boolean → TINYINT(1)、
//            DateTime → DATETIME(3)、Float → DOUBLE
//
// 【建库方式二选一，勿混用】
//   a) 导入 database/mes-mysql-init.sql（含种子数据）→ 之后不要再执行 db push；
//   b) 由 Prisma 建表：先建 utf8mb4 空库，再执行本脚本的 --push。
//      注意：prisma/migrations 是 SQLite 方言，MySQL 下执行 migrate deploy 会报 P3019。
// =====================================================
`,
};

/**
 * 读取 .env 中的指定键
 * @param {string} key 键名
 * @returns {string|null} 值（未配置返回 null）
 */
function readEnvValue(key) {
  const value = process.env[key];
  return value === undefined || value === '' ? null : value;
}

/**
 * URL 百分号编码（用户名/密码可能含 @ : / 等特殊字符）
 * @param {string} value 原始值
 * @returns {string} 编码结果
 */
function encodeUrlPart(value) {
  return encodeURIComponent(String(value ?? ''));
}

/**
 * 按目标库类型解析连接串（供 Prisma CLI 使用）
 * 优先使用类型匹配的 DATABASE_URL，否则用分散参数拼装
 * @param {'sqlite'|'mysql'} driver 数据库类型
 * @returns {string} 连接串
 */
function resolveUrlFor(driver) {
  const explicit = (process.env.DATABASE_URL || '').trim();
  if (driver === 'mysql' && explicit.startsWith('mysql:')) return explicit;
  if (driver === 'sqlite' && explicit.startsWith('file:')) return explicit;

  if (driver === 'mysql') {
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

  const dbPath = process.env.DB_PATH || './dev.db';
  return dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;
}

/**
 * 确定当前使用的数据库类型（命令行 > .env 的 DB_TYPE > DATABASE_URL 推断 > sqlite）
 * @param {string[]} args 命令行参数
 * @returns {'sqlite'|'mysql'} 数据库类型
 */
function resolveDbType(args) {
  const explicit = args.find((arg) => !arg.startsWith('--'));
  if (explicit && DRIVERS[explicit]) return explicit;

  const fromEnv = (readEnvValue('DB_TYPE') || '').toLowerCase();
  if (DRIVERS[fromEnv]) return fromEnv;

  const url = readEnvValue('DATABASE_URL') || '';
  if (url.startsWith('mysql:')) return 'mysql';
  return 'sqlite';
}

/**
 * 由主 schema 派生指定库类型的 schema 变体
 * @param {'sqlite'|'mysql'} driver 数据库类型
 * @returns {string} 生成的 schema 文件路径
 */
function syncSchema(driver) {
  if (!fs.existsSync(BASE_SCHEMA)) {
    throw new Error(`缺少主模型文件：${BASE_SCHEMA}`);
  }
  const base = fs.readFileSync(BASE_SCHEMA, 'utf8');
  const generatorIndex = base.indexOf('generator client {');
  if (generatorIndex < 0) {
    throw new Error('主模型文件缺少 generator client 块');
  }
  // 丢弃主 schema 的文件头注释，保留 generator 及其后的全部内容
  const body = base.slice(generatorIndex);

  // 注意：Prisma 的 output 相对 schema 文件所在目录（prisma/），故此处直接写 generated/<driver>
  const output = path.posix.join('generated', driver);
  const nextBody = body
    // 重写 generator：指向该库类型专属的输出目录
    .replace(
      /generator\s+client\s*\{[\s\S]*?\}/,
      `generator client {\n  provider = "prisma-client-js"\n  output   = "${output}"\n}`,
    )
    // 重写 datasource provider
    .replace(
      /(datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*")[^"]+(")/,
      `$1${DRIVERS[driver].provider}$2`,
    );

  const targetPath = path.join(
    BACKEND_DIR,
    'prisma',
    `schema.${driver}.prisma`,
  );
  fs.writeFileSync(
    targetPath,
    `${SCHEMA_HEADERS[driver]}\n${nextBody}`,
    'utf8',
  );
  return targetPath;
}

/**
 * 执行外部命令（继承 stdio，实时输出）
 * @param {string} command 命令
 * @param {string[]} args 参数
 * @returns {number} 退出码
 */
function run(command, args, extraEnv) {
  const result = spawnSync(command, args, {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  });
  return result.status === null ? 1 : result.status;
}

/**
 * 生成指定库类型的 Prisma Client
 * @param {'sqlite'|'mysql'} driver 数据库类型
 * @returns {boolean} 是否成功
 */
function generateClient(driver) {
  const schemaPath = syncSchema(driver);
  console.log(
    `\n[db-setup] 已同步 schema：prisma/schema.${driver}.prisma（provider=${DRIVERS[driver].provider}）`,
  );
  console.log(`[db-setup] 正在生成 ${driver} 的 Prisma Client ...`);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const code = run(
    npx,
    ['prisma', 'generate', `--schema=${schemaPath}`],
    { DATABASE_URL: resolveUrlFor(driver) },
  );
  if (code !== 0) {
    console.error(`[db-setup] ${driver} 的 Prisma Client 生成失败`);
    return false;
  }
  console.log(
    `[db-setup] ${driver} 的 Prisma Client 已生成：prisma/generated/${driver}`,
  );
  return true;
}

/**
 * 把表结构推送到目标数据库
 * @param {'sqlite'|'mysql'} driver 数据库类型
 * @returns {boolean} 是否成功
 */
function pushSchema(driver) {
  console.log(`\n[db-setup] 正在将表结构推送到 ${driver} ...`);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const schemaPath = path.join(BACKEND_DIR, 'prisma', `schema.${driver}.prisma`);
  const code = run(
    npx,
    ['prisma', 'db', 'push', `--schema=${schemaPath}`, '--skip-generate'],
    { DATABASE_URL: resolveUrlFor(driver) },
  );
  if (code !== 0) {
    console.error(
      `[db-setup] 表结构推送失败。请确认：\n` +
        `  - ${driver === 'mysql' ? 'MySQL 已启动、空库已创建（utf8mb4）且账号有建表权限' : 'SQLite 文件路径可写'}\n` +
        `  - .env 中 DB_TYPE / 连接配置正确（${DRIVERS[driver].urlHint}）`,
    );
    return false;
  }
  console.log(`[db-setup] ${driver} 表结构已就绪`);
  return true;
}

/**
 * 写入种子数据
 * @returns {boolean} 是否成功
 */
function seed() {
  console.log('\n[db-setup] 正在写入种子数据 ...');
  const code = run(
    process.execPath,
    [path.join(BACKEND_DIR, 'prisma', 'seed.js')],
    { DATABASE_URL: resolveUrlFor(resolveDbType([])) },
  );
  if (code !== 0) {
    console.error('[db-setup] 种子数据写入失败');
    return false;
  }
  console.log('[db-setup] 种子数据已就绪');
  return true;
}

/**
 * 打印当前配置与各 Client 的生成状态
 */
function printStatus() {
  const dbType = resolveDbType([]);
  console.log('=========== 数据库配置状态 ===========');
  console.log(`当前 DB_TYPE        : ${dbType}`);
  console.log(`当前连接串(解析后)  : ${resolveUrlFor(dbType)}`);
  if (dbType === 'mysql') {
    console.log(
      `MySQL 连接参数      : ${readEnvValue('DB_HOST') || '127.0.0.1'}:${readEnvValue('DB_PORT') || '3306'}/${readEnvValue('DB_NAME') || 'mes_workshop'}`,
    );
  }
  Object.keys(DRIVERS).forEach((driver) => {
    const clientPath = path.join(GENERATED_DIR, driver, 'index.js');
    const ready = fs.existsSync(clientPath);
    console.log(
      `Prisma Client ${driver.padEnd(6)}: ${ready ? '已生成' : '未生成'} (prisma/generated/${driver})`,
    );
  });
  console.log('======================================');
}

/**
 * 主流程
 */
function main() {
  const args = process.argv.slice(2);
  const wantsPush = args.includes('--push');
  const wantsSeed = args.includes('--seed');

  if (args.includes('--status')) {
    printStatus();
    return;
  }

  const target = args.find((arg) => !arg.startsWith('--'));
  const targets =
    target === 'all' ? Object.keys(DRIVERS) : [resolveDbType(args)];

  console.log(`[db-setup] 目标数据库类型：${targets.join(', ')}`);

  for (const driver of targets) {
    if (!generateClient(driver)) {
      process.exitCode = 1;
      return;
    }
    if (wantsPush && !pushSchema(driver)) {
      process.exitCode = 1;
      return;
    }
  }

  if (wantsSeed && !seed()) {
    process.exitCode = 1;
    return;
  }

  console.log('\n[db-setup] 全部完成。接下来：');
  console.log('  1) 确认 .env 中 DB_TYPE 与目标库一致');
  console.log('  2) npm run dev（开发）或 npm start（生产）');
  console.log('  3) 访问 http://127.0.0.1:3000/api/health 验证数据库连接');
}

main();
