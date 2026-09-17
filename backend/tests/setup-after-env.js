/**
 * MES 系统 - 测试收尾钩子（setupFilesAfterEnv）
 * ---------------------------------------------------------------------------
 * 每个测试文件执行完毕后释放 Prisma 连接，避免 Jest 因句柄未关闭而挂起
 * （表现为 "Jest did not exit one second after..." 警告）。
 */

afterAll(async () => {
  try {
    const { prisma } = require('../src/config/database');
    await prisma.$disconnect();
  } catch (error) {
    // 单元测试可能未触及数据库模块，忽略即可
  }
});
