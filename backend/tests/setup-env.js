/**
 * MES 系统 - 测试环境变量注入（setupFiles，在测试框架加载前执行）
 * ---------------------------------------------------------------------------
 * 必须最先执行：src/config/env.js 在模块加载时就会读取这些变量，
 * 因此不能等到 beforeAll 才设置。
 *
 * 关键约定：
 *   · DB_TYPE=sqlite + DATABASE_URL=file:./test.db → 使用独立测试库，不动 dev.db
 *   · dotenv 默认不覆盖已存在的 process.env，故此处注入的值优先级最高
 *   · 本文件只做副作用赋值，不导出内容
 */

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
// 路径相对 backend/prisma/ 目录（与 Prisma 的 SQLite 路径规则一致）
process.env.DATABASE_URL = 'file:./test.db';

// 固定密钥，保证测试可复现（与生产密钥无关）
process.env.JWT_SECRET = 'test-access-secret-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest';
process.env.JWT_REFRESH_EXPIRES_IN = '1d';

// 关闭启动时自动 seed，避免与 globalSetup 重复
process.env.AUTO_SEED = 'false';
