/**
 * 单元测试：src/config/env.js
 * ---------------------------------------------------------------------------
 * 覆盖「数据库动态配置」的核心逻辑：
 *   · DB_TYPE 显式声明 / 由 DATABASE_URL 前缀推断 / 非法值回退
 *   · MySQL 分散参数拼装连接串、密码特殊字符 URL 编码
 *   · DATABASE_URL 与 DB_TYPE 冲突时的取舍规则
 *   · 其他配置项的默认值
 *
 * 测试手法：mock dotenv 阻断 .env 文件干扰，通过改 process.env + resetModules
 *           反复重新加载模块，验证不同配置下的解析结果。
 */

// 阻断 .env 文件读取，保证测试只受 process.env 控制（不受本地 .env 影响）
jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }));

/** 会参与 env.js 解析、且需要在用例间重置的环境变量 */
const MANAGED_KEYS = [
  'NODE_ENV',
  'PORT',
  'DB_TYPE',
  'DB_PATH',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_EXPIRES_IN',
  'CORS_ORIGIN',
  'BODY_LIMIT',
  'AUTO_SEED',
];

/**
 * 在指定环境变量下重新加载 env 模块
 * @param {Record<string, string|undefined>} env 环境变量（undefined 表示删除该变量）
 * @returns {object} env 模块导出
 */
function loadEnv(env = {}) {
  jest.resetModules();
  MANAGED_KEYS.forEach((key) => delete process.env[key]);
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  return require('../../src/config/env');
}

describe('src/config/env - 数据库类型解析', () => {
  test('未配置 DB_TYPE 与 DATABASE_URL 时默认使用 sqlite', () => {
    const { config } = loadEnv();
    expect(config.dbType).toBe('sqlite');
    expect(config.databaseUrl).toBe('file:./dev.db');
  });

  test('由 DATABASE_URL 的 file: 前缀推断 sqlite', () => {
    const { config } = loadEnv({ DATABASE_URL: 'file:./custom.db' });
    expect(config.dbType).toBe('sqlite');
    expect(config.databaseUrl).toBe('file:./custom.db');
  });

  test('由 DATABASE_URL 的 mysql: 前缀推断 mysql', () => {
    const { config } = loadEnv({
      DATABASE_URL: 'mysql://root:root@10.0.0.5:3307/mes',
    });
    expect(config.dbType).toBe('mysql');
    expect(config.databaseUrl).toBe('mysql://root:root@10.0.0.5:3307/mes');
  });

  test('DB_TYPE 为非法值时回退 sqlite', () => {
    const { config } = loadEnv({ DB_TYPE: 'postgresql' });
    expect(config.dbType).toBe('sqlite');
  });

  test('DB_TYPE=mariadb 归一化为 mysql', () => {
    const { config } = loadEnv({ DB_TYPE: 'MariaDB' });
    expect(config.dbType).toBe('mysql');
  });

  test('DB_TYPE 大小写与前后空格可容错', () => {
    const { config } = loadEnv({ DB_TYPE: '  MySQL  ' });
    expect(config.dbType).toBe('mysql');
  });
});

describe('src/config/env - SQLite 连接串', () => {
  test('DB_PATH 覆盖默认库文件路径', () => {
    const { config } = loadEnv({ DB_TYPE: 'sqlite', DB_PATH: './prod.db' });
    expect(config.databaseUrl).toBe('file:./prod.db');
  });

  test('DB_PATH 已带 file: 前缀时不再重复拼接', () => {
    const { config } = loadEnv({
      DB_TYPE: 'sqlite',
      DB_PATH: 'file:./already.db',
    });
    expect(config.databaseUrl).toBe('file:./already.db');
  });
});

describe('src/config/env - MySQL 连接串拼装', () => {
  test('由分散参数拼装标准连接串', () => {
    const { config } = loadEnv({
      DB_TYPE: 'mysql',
      DB_HOST: '10.1.2.3',
      DB_PORT: '3307',
      DB_USER: 'mes_user',
      DB_PASSWORD: 'secret',
      DB_NAME: 'mes_workshop',
    });
    expect(config.databaseUrl).toBe(
      'mysql://mes_user:secret@10.1.2.3:3307/mes_workshop',
    );
  });

  test('密码含特殊字符时自动 URL 编码', () => {
    const { config } = loadEnv({
      DB_TYPE: 'mysql',
      DB_USER: 'mes_user',
      DB_PASSWORD: 'p@ss:w/rd#1',
      DB_NAME: 'mes',
    });
    // @ : / # 均需编码，避免破坏 URL 结构
    expect(config.databaseUrl).toContain('p%40ss%3Aw%2Frd%231');
    expect(config.databaseUrl).not.toContain('p@ss:w/rd#1');
  });

  test('用户名含特殊字符时同样编码', () => {
    const { config } = loadEnv({
      DB_TYPE: 'mysql',
      DB_USER: 'user@corp',
      DB_PASSWORD: 'x',
      DB_NAME: 'mes',
    });
    expect(config.databaseUrl).toContain('user%40corp:x@');
  });

  test('密码为空时不输出冒号占位', () => {
    const { config } = loadEnv({
      DB_TYPE: 'mysql',
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: 'mes',
    });
    expect(config.databaseUrl).toBe('mysql://root@127.0.0.1:3306/mes');
  });

  test('未提供的参数使用默认值', () => {
    const { config } = loadEnv({ DB_TYPE: 'mysql' });
    expect(config.databaseUrl).toBe('mysql://root@127.0.0.1:3306/mes_workshop');
  });
});

describe('src/config/env - DATABASE_URL 与 DB_TYPE 的冲突取舍', () => {
  test('两者类型一致时优先使用显式 DATABASE_URL', () => {
    const { config } = loadEnv({
      DB_TYPE: 'mysql',
      DATABASE_URL: 'mysql://explicit:pass@explicit-host:3308/explicit_db',
      DB_HOST: 'ignored-host',
      DB_NAME: 'ignored_db',
    });
    expect(config.databaseUrl).toBe(
      'mysql://explicit:pass@explicit-host:3308/explicit_db',
    );
  });

  test('类型冲突时以 DB_TYPE 为准重新拼装（避免静默连错库）', () => {
    const { config } = loadEnv({
      DB_TYPE: 'mysql',
      DATABASE_URL: 'file:./stale.db',
      DB_HOST: '10.0.0.9',
      DB_NAME: 'target_db',
    });
    expect(config.dbType).toBe('mysql');
    expect(config.databaseUrl).toBe('mysql://root@10.0.0.9:3306/target_db');
  });

  test('切到 sqlite 时遗留的 mysql 连接串不会生效', () => {
    const { config } = loadEnv({
      DB_TYPE: 'sqlite',
      DATABASE_URL: 'mysql://root:root@127.0.0.1:3306/mes',
      DB_PATH: './local.db',
    });
    expect(config.databaseUrl).toBe('file:./local.db');
  });
});

describe('src/config/env - 其他配置项与对外方法', () => {
  test('默认值符合预期', () => {
    const { config } = loadEnv();
    expect(config.port).toBe(3000);
    expect(config.bodyLimit).toBe(10);
    expect(config.corsOrigin).toBe('http://localhost:5173');
    expect(config.jwtExpiresIn).toBe('2h');
    expect(config.jwtRefreshExpiresIn).toBe('7d');
    expect(config.autoSeed).toBe(false);
  });

  test('端口与请求体上限按数字解析', () => {
    const { config } = loadEnv({ PORT: '8080', BODY_LIMIT: '50' });
    expect(config.port).toBe(8080);
    expect(config.bodyLimit).toBe(50);
  });

  test('NODE_ENV=production 时 isDev 为 false', () => {
    const { config } = loadEnv({ NODE_ENV: 'production' });
    expect(config.isDev).toBe(false);
  });

  test('AUTO_SEED 仅 true 字符串时开启', () => {
    expect(loadEnv({ AUTO_SEED: 'true' }).config.autoSeed).toBe(true);
    expect(loadEnv({ AUTO_SEED: 'TRUE' }).config.autoSeed).toBe(true);
    expect(loadEnv({ AUTO_SEED: '1' }).config.autoSeed).toBe(false);
  });

  test('SUPPORTED_DB_TYPES 仅包含 sqlite 与 mysql', () => {
    const { SUPPORTED_DB_TYPES } = loadEnv();
    expect(SUPPORTED_DB_TYPES).toEqual(['sqlite', 'mysql']);
  });

  test('validateConfig 在合法配置下不抛错', () => {
    const { validateConfig } = loadEnv({ DB_TYPE: 'sqlite' });
    expect(() => validateConfig()).not.toThrow();
  });

  test('describeDatabase 不泄露密码', () => {
    const { describeDatabase } = loadEnv({
      DB_TYPE: 'mysql',
      DB_HOST: '10.1.2.3',
      DB_PORT: '3307',
      DB_PASSWORD: 'super-secret-password',
      DB_NAME: 'mes_workshop',
    });
    const summary = describeDatabase();
    expect(summary).toContain('10.1.2.3');
    expect(summary).toContain('mes_workshop');
    expect(summary).not.toContain('super-secret-password');
    expect(summary).toContain('***');
  });
});
