/**
 * 集成测试：数据库动态配置与数据层连通性
 * ---------------------------------------------------------------------------
 * 这是本次重构核心能力的验收用例：
 *   · 运行时确实按 DB_TYPE 加载了对应库类型的 Prisma Client
 *   · 两种库类型的 Client 都已预生成，支持改 .env 后重启即切换
 *   · 通过 db-setup 建出的表结构与种子数据完整可用
 */

const fs = require('fs');
const path = require('path');
const { prisma } = require('../../src/config/database');
const { config } = require('../../src/config/env');

/** Prisma Client 生成根目录 */
const GENERATED_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'generated');

describe('运行时加载的数据库类型', () => {
  test('当前生效类型为测试环境约定的 sqlite', () => {
    expect(config.dbType).toBe('sqlite');
    expect(config.databaseUrl).toBe('file:./test.db');
  });

  test('确实连到 SQLite（能用 sqlite_master 查询系统表）', async () => {
    // 若误加载了 MySQL 版 Client，此查询会在语法/连接层面失败
    const rows = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  test('基础连通性查询返回 1', async () => {
    const rows = await prisma.$queryRawUnsafe('SELECT 1 AS ok');
    expect(Number(rows[0].ok)).toBe(1);
  });
});

describe('双库类型 Client 预生成（动态切换的前提）', () => {
  test('sqlite 与 mysql 两份 Client 均已生成并导出 PrismaClient', () => {
    ['sqlite', 'mysql'].forEach((driver) => {
      const entry = path.join(GENERATED_DIR, driver, 'index.js');
      expect(fs.existsSync(entry)).toBe(true);

      // eslint-disable-next-line global-require
      const clientModule = require(entry);
      expect(typeof clientModule.PrismaClient).toBe('function');
    });
  });

  test('当前配置对应的 Client 目录由 DB_TYPE 唯一决定', () => {
    const expectedDir = path.join(GENERATED_DIR, config.dbType);
    expect(fs.existsSync(expectedDir)).toBe(true);
    expect(['sqlite', 'mysql']).toContain(config.dbType);
  });
});

describe('表结构完整性', () => {
  test('27 张业务表全部建成', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_prisma%'`,
    );
    const tableNames = rows.map((row) => row.name);

    expect(tableNames.length).toBe(27);
    // 抽查各业务域的核心表（表名以 schema.prisma 的 @@map 为准）
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'users',
        'roles',
        'permissions',
        'user_roles',
        'role_permissions',
        'workshops',
        'work_orders',
        'production_reports',
        'production_schedules',
        'equipment',
        'maintenance_plans',
        'breakdown_records',
        'quality_inspections',
        'defect_records',
        'materials',
        'inventory',
        'material_batches',
        'shifts',
        'personnel_schedules',
        'work_hours_records',
      ]),
    );
  });
});

describe('种子数据可用性', () => {
  test('用户、角色、权限数据齐备', async () => {
    const [userCount, roleCount, permissionCount] = await Promise.all([
      prisma.user.count(),
      prisma.role.count(),
      prisma.permission.count(),
    ]);

    expect(userCount).toBeGreaterThanOrEqual(2);
    expect(roleCount).toBeGreaterThanOrEqual(3);
    expect(permissionCount).toBeGreaterThanOrEqual(100);
  });

  test('角色与权限的关联关系已建立', async () => {
    const rolePermissionCount = await prisma.rolePermission.count();
    expect(rolePermissionCount).toBeGreaterThan(0);
  });

  test('车间与设备基础数据存在', async () => {
    const [workshopCount, equipmentCount] = await Promise.all([
      prisma.workshop.count(),
      prisma.equipment.count(),
    ]);

    expect(workshopCount).toBeGreaterThanOrEqual(1);
    expect(equipmentCount).toBeGreaterThanOrEqual(1);
  });

  test('管理员具备权限集合（可支撑 RBAC 鉴权）', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    expect(admin).not.toBeNull();
    expect(admin.status).toBeDefined();

    const codes = admin.userRoles.flatMap((ur) =>
      ur.role.rolePermissions.map((rp) => rp.permission.code),
    );
    expect(codes.length).toBeGreaterThan(0);
    expect(codes).toContain('system:users:view');
  });
});
