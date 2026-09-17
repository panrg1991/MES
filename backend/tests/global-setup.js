/**
 * MES 系统 - Jest 全局准备（globalSetup，整个测试会话仅执行一次）
 * ---------------------------------------------------------------------------
 * 职责：把测试库准备到「可直接跑集成测试」的状态
 *   ① 注入测试环境变量（globalSetup 与测试文件不在同一上下文）
 *   ② 确保 SQLite 派生 schema 与 Prisma Client 已生成（缺失则调用 db-setup）
 *   ③ 删除遗留的 test.db，保证每次从干净状态开始
 *   ④ prisma db push 建表
 *   ⑤ 写入种子数据（admin/admin123 等）
 *
 * 注意：测试库固定为 prisma/test.db，与开发库 dev.db、生产库 prod.db 完全隔离。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** backend 根目录 */
const BACKEND_DIR = path.resolve(__dirname, '..');
/** 测试库文件 */
const TEST_DB = path.join(BACKEND_DIR, 'prisma', 'test.db');
/** SQLite 派生 schema */
const SQLITE_SCHEMA = path.join(BACKEND_DIR, 'prisma', 'schema.sqlite.prisma');
/** SQLite 版 Prisma Client 入口 */
const SQLITE_CLIENT = path.join(
  BACKEND_DIR,
  'prisma',
  'generated',
  'sqlite',
  'index.js',
);
/** MySQL 版 Prisma Client 入口 */
const MYSQL_CLIENT = path.join(
  BACKEND_DIR,
  'prisma',
  'generated',
  'mysql',
  'index.js',
);

/** Windows 下 npx 需要带 .cmd 后缀 */
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/**
 * 同步执行外部命令（失败时抛出，携带完整输出便于排障）
 * @param {string} command 命令
 * @param {string[]} args 参数
 */
function run(command, args) {
  execFileSync(command, args, {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: process.env,
  });
}

module.exports = async () => {
  // ① 注入测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.DB_TYPE = 'sqlite';
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.JWT_SECRET = 'test-access-secret-for-jest';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest';
  process.env.JWT_REFRESH_EXPIRES_IN = '1d';
  process.env.AUTO_SEED = 'false';

  // ② 派生 schema 与 Client 缺失时补生成（首次克隆仓库后直接 npm test 也能跑通）
  //    两种库类型的 Client 都要就绪：测试会断言「双 Client 预生成、可随时切换」这一设计约束
  if (!fs.existsSync(SQLITE_SCHEMA) || !fs.existsSync(SQLITE_CLIENT)) {
    console.log('[test] 首次运行：生成 SQLite 派生 schema 与 Prisma Client ...');
    run(process.execPath, [path.join('scripts', 'db-setup.js'), 'sqlite']);
  }
  if (!fs.existsSync(MYSQL_CLIENT)) {
    console.log('[test] 首次运行：生成 MySQL 版 Prisma Client ...');
    run(process.execPath, [path.join('scripts', 'db-setup.js'), 'mysql']);
  }

  // ③ 清理上一次遗留的测试库（含 WAL/SHM 附属文件）
  [TEST_DB, `${TEST_DB}-journal`, `${TEST_DB}-wal`, `${TEST_DB}-shm`].forEach(
    (file) => {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    },
  );

  // ④ 建表
  console.log('[test] 正在创建测试库表结构（prisma/test.db）...');
  run(NPX, [
    'prisma',
    'db',
    'push',
    '--schema=prisma/schema.sqlite.prisma',
    '--skip-generate',
  ]);

  // ⑤ 写入种子数据（幂等）
  console.log('[test] 正在写入测试库种子数据 ...');
  run(process.execPath, [path.join('prisma', 'seed.js')]);

  console.log('[test] 测试库已就绪\n');
};
