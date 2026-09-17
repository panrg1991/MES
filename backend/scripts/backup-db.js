#!/usr/bin/env node
/**
 * MES 系统 - 数据库备份脚本（按当前配置自动识别类型）
 * ---------------------------------------------------------------------------
 * 支持两种数据库（由 .env 的 DB_TYPE 决定）：
 *   · SQLite → 复制 .db 文件到备份目录（带时间戳；如存在 -wal / -shm 一并复制）
 *   · MySQL  → 生成并（可选）执行 mysqldump 命令，输出 .sql
 *
 * 用法（在 backend/ 目录下执行）：
 *   node scripts/backup-db.js                       # SQLite 直接备份；MySQL 只打印命令（安全默认）
 *   node scripts/backup-db.js --execute             # MySQL 也真正执行导出命令
 *   node scripts/backup-db.js --out-dir=D:/mes-backup   # 指定输出目录（默认 backend/backups）
 *   node scripts/backup-db.js --url="file:./dev.db" # 覆盖连接串（不改 .env）
 *   node scripts/backup-db.js --env=production      # 读取 .env.production 的数据库配置
 *   node scripts/backup-db.js --keep=7              # 仅保留最近 7 个备份（按 mtime 清理，可选）
 *
 * 说明：
 *   1. SQLite 备份是「文件级快照」，服务运行中执行通常安全（Prisma 使用 rollback journal）；
 *      若数据库启用了 WAL，本脚本会把 -wal / -shm 一起复制；
 *   2. MySQL 备份默认只打印命令（避免误连生产库），加 --execute 才真正执行；
 *      需要 mysqldump 已在 PATH 中，或用 --dump-bin=<绝对路径> 指定；
 *   3. 恢复方式见 docs/DATABASE.md「备份与恢复」章节。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/** backend 根目录 */
const BACKEND_DIR = path.resolve(__dirname, '..');
/** 默认备份输出目录 */
const DEFAULT_OUT_DIR = path.join(BACKEND_DIR, 'backups');

/**
 * 解析命令行参数
 * @param {string[]} argv process.argv
 * @returns {{outDir: string, execute: boolean, url: string|null, env: string, keep: number, dumpBin: string|null}}
 */
function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    execute: false,
    url: null,
    env: 'development',
    keep: 0,
    dumpBin: null,
  };
  argv.slice(2).forEach((arg) => {
    if (arg.startsWith('--out-dir=')) options.outDir = arg.slice('--out-dir='.length);
    else if (arg === '--execute') options.execute = true;
    else if (arg.startsWith('--url=')) options.url = arg.slice('--url='.length);
    else if (arg.startsWith('--env=')) options.env = arg.slice('--env='.length);
    else if (arg.startsWith('--keep=')) options.keep = parseInt(arg.slice('--keep='.length), 10) || 0;
    else if (arg.startsWith('--dump-bin=')) options.dumpBin = arg.slice('--dump-bin='.length);
  });
  return options;
}

/**
 * 从 env 文件读取 DATABASE_URL
 * @param {string} envName development | production
 * @returns {string} 连接串
 */
function readDatabaseUrl(envName) {
  const envFile = envName === 'production' ? '.env.production' : '.env';
  const envPath = path.join(BACKEND_DIR, envFile);
  if (!fs.existsSync(envPath)) {
    throw new Error(`未找到 ${envFile}，请先创建（可参考 .env.example）或用 --url 指定连接串`);
  }
  // 复用 src/config/env.js 的解析逻辑：支持 DB_TYPE + 分散参数（DB_HOST/DB_PATH 等），也支持整串 DATABASE_URL
  process.env.NODE_ENV = envName === 'production' ? 'production' : 'development';
  // 延迟 require：需先确定 NODE_ENV，config 才会加载对应的 .env 文件
  const { config } = require('../src/config/env');
  if (!config.databaseUrl) {
    throw new Error(`${envFile} 中未配置数据库连接信息（DB_TYPE + DB_* / DB_PATH 或 DATABASE_URL）`);
  }
  return config.databaseUrl;
}

/**
 * 生成时间戳（YYYYMMDD-HHmmss）
 * @returns {string} 时间戳字符串
 */
function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * 解析 MySQL / PostgreSQL 连接串
 * @param {string} url 连接串
 * @returns {{user: string, password: string, host: string, port: string, database: string}} 连接参数
 */
function parseServerUrl(url) {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    host: parsed.hostname || '127.0.0.1',
    port: parsed.port || '',
    database: parsed.pathname.replace(/^\//, ''),
  };
}

/**
 * 备份 SQLite：复制 .db（以及可能存在的 -wal / -shm）文件
 * @param {string} url file: 连接串
 * @param {string} outDir 输出目录
 * @returns {string[]} 生成的文件路径列表
 */
function backupSqlite(url, outDir) {
  const relative = url.replace(/^file:/, '');
  // Prisma 的 SQLite 相对路径基准是 schema.prisma 所在目录（backend/prisma/）
  const dbPath = path.isAbsolute(relative)
    ? relative
    : path.resolve(BACKEND_DIR, 'prisma', relative);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite 数据库文件不存在: ${dbPath}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = timestamp();
  const base = path.basename(dbPath).replace(/\.db$/, '');
  const created = [];
  [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((source) => {
    if (!fs.existsSync(source)) return;
    const suffix = source === dbPath ? '' : source.slice(dbPath.length);
    const target = path.join(outDir, `${base}${suffix}-${stamp}.db`);
    fs.copyFileSync(source, target);
    created.push(target);
  });
  return created;
}

/**
 * 备份 MySQL / PostgreSQL：生成 dump 命令（可选执行）
 * @param {'mysql'|'postgresql'} type 数据库类型
 * @param {string} url 连接串
 * @param {{outDir: string, execute: boolean, dumpBin: string|null}} options 选项
 * @returns {{command: string, executed: boolean, file: string|null, stderr: string}} 执行结果
 */
function backupServerDb(type, url, options) {
  const info = parseServerUrl(url);
  fs.mkdirSync(options.outDir, { recursive: true });
  const stamp = timestamp();
  const file = path.join(options.outDir, `${info.database}-${stamp}.sql`);
  const defaultBin = type === 'mysql' ? 'mysqldump' : 'pg_dump';
  const bin = options.dumpBin || defaultBin;

  const args =
    type === 'mysql'
      ? [
          `--host=${info.host}`,
          `--port=${info.port || '3306'}`,
          `--user=${info.user}`,
          '--single-transaction',
          '--default-character-set=utf8mb4',
          '--routines',
          '--events',
          info.database,
        ]
      : [
          `--host=${info.host}`,
          `--port=${info.port || '5432'}`,
          `--username=${info.user}`,
          '--no-owner',
          '--no-privileges',
          info.database,
        ];

  const quoted = [bin, ...args].map((token) => (token.includes(' ') ? `"${token}"` : token)).join(' ');
  const humanCommand =
    type === 'mysql'
      ? `${quoted} > "${file}"      # 密码通过 MYSQL_PWD 环境变量提供（避免出现在命令行历史）`
      : `${quoted} > "${file}"      # 密码通过 PGPASSWORD 环境变量提供`;

  if (!options.execute) {
    return { command: humanCommand, executed: false, file: null, stderr: '' };
  }

  const env = { ...process.env };
  if (type === 'mysql') {
    env.MYSQL_PWD = info.password;
  } else {
    env.PGPASSWORD = info.password;
  }
  const result = spawnSync(bin, args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    return {
      command: humanCommand,
      executed: false,
      file: null,
      stderr: `执行失败（${bin} 是否在 PATH 中？可用 --dump-bin= 指定绝对路径）: ${result.error.message}`,
    };
  }
  if (result.status !== 0) {
    return {
      command: humanCommand,
      executed: false,
      file: null,
      stderr: `导出命令返回码 ${result.status}: ${(result.stderr || '').trim().split('\n').slice(-1)[0]}`,
    };
  }
  fs.writeFileSync(file, result.stdout, 'utf8');
  return { command: humanCommand, executed: true, file, stderr: '' };
}

/**
 * 按 mtime 清理旧备份（--keep=N 时生效）
 * @param {string} outDir 备份目录
 * @param {number} keep 保留数量
 * @returns {string[]} 被删除的文件名
 */
function pruneOldBackups(outDir, keep) {
  if (!keep || keep <= 0 || !fs.existsSync(outDir)) return [];
  const files = fs
    .readdirSync(outDir)
    .map((name) => path.join(outDir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const removed = [];
  files.slice(keep).forEach((file) => {
    fs.unlinkSync(file);
    removed.push(path.basename(file));
  });
  return removed;
}

/**
 * 主流程
 */
function main() {
  const options = parseArgs(process.argv);
  const url = options.url || readDatabaseUrl(options.env);

  console.log('========== MES 数据库备份 ==========');
  console.log(`DATABASE_URL : ${url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@')}`);
  console.log(`输出目录     : ${options.outDir}`);

  if (url.startsWith('file:')) {
    const created = backupSqlite(url, options.outDir);
    created.forEach((file) => console.log(`[SQLite] 已备份 → ${file}`));
    const removed = pruneOldBackups(options.outDir, options.keep);
    if (removed.length) console.log(`[清理] 已删除旧备份: ${removed.join(', ')}`);
    console.log('结果: SUCCESS（SQLite 文件快照）');
    return;
  }

  const type = url.startsWith('mysql://') ? 'mysql' : 'postgresql';
  const result = backupServerDb(type, url, options);
  if (result.executed) {
    console.log(`[${type}] 已导出 → ${result.file}`);
  } else {
    console.log(`[${type}] 请执行以下命令完成备份（或加 --execute 由本脚本直接执行）:`);
    console.log(`  ${result.command}`);
    if (result.stderr) {
      console.log(`  ${result.stderr}`);
    }
  }
  const removed = pruneOldBackups(options.outDir, options.keep);
  if (removed.length) console.log(`[清理] 已删除旧备份: ${removed.join(', ')}`);
  console.log(`结果: ${result.executed ? 'SUCCESS（已导出 sql 文件）' : 'COMMAND_ONLY（未执行，仅输出命令）'}`);
}

main();
