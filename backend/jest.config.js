/**
 * MES 系统 - Jest 测试配置（后端）
 * ---------------------------------------------------------------------------
 * 设计要点：
 *   ① 测试使用独立的 SQLite 库（prisma/test.db），不碰开发/生产的 dev.db / prod.db；
 *   ② setupFiles 在测试框架加载前注入环境变量（DB_TYPE / DATABASE_URL / JWT 密钥），
 *      确保 src/config/env.js 与 src/config/database.js 走「测试档」配置；
 *   ③ globalSetup 负责一次性准备测试库（建表 + 种子数据），供集成测试共用；
 *   ④ 单元测试不打库，集成测试才通过 supertest 访问 Express 应用。
 */

module.exports = {
  testEnvironment: 'node',

  // 测试用例位置
  testMatch: ['<rootDir>/tests/**/*.test.js'],

  // 在测试框架（describe/it）加载前注入测试环境变量
  setupFiles: ['<rootDir>/tests/setup-env.js'],

  // 每个测试文件跑完后释放 Prisma 连接
  setupFilesAfterEnv: ['<rootDir>/tests/setup-after-env.js'],

  // 全局准备/清理：只执行一次（建测试库、写种子、跑完删库）
  globalSetup: '<rootDir>/tests/global-setup.js',
  globalTeardown: '<rootDir>/tests/global-teardown.js',

  // 串行执行：集成测试共用同一个 SQLite 文件，并发会触发写锁冲突
  maxWorkers: 1,

  // 集成测试含建库与多条 HTTP 请求，放宽超时
  testTimeout: 30000,

  // 覆盖率（npm run test:coverage 时输出）
  collectCoverageFrom: [
    'src/**/*.js',
    'scripts/**/*.js',
    '!src/generated/**',
    '!prisma/generated/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'html'],

  // 覆盖率门禁（npm run test:coverage 时生效）
  // 说明：当前基线约 30% 语句 / 16% 分支（业务 Service 仍在补测试），门禁先设在基线略下方，
  //      用于阻止「越改越低」；后续随业务测试补齐再逐步上调。
  coverageThreshold: {
    global: {
      statements: 28,
      branches: 14,
      functions: 22,
      lines: 28,
    },
    // 核心并发工具必须有高覆盖：一旦回归会直接影响数据一致性
    './src/utils/mutex.js': {
      statements: 95,
      branches: 90,
      functions: 100,
      lines: 95,
    },
    // 日志脱敏属于安全要求，单独设门槛
    './src/utils/logger.js': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },

  // 控制台保持简洁，失败时打印详细信息
  verbose: false,
  clearMocks: true,
};
