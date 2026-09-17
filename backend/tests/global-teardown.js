/**
 * MES 系统 - Jest 全局清理（globalTeardown，整个测试会话结束后执行一次）
 * ---------------------------------------------------------------------------
 * 删除测试库文件，避免残留数据影响下次运行或被误提交。
 * 如需保留测试库以便人工排查，设置环境变量 KEEP_TEST_DB=1。
 */

const fs = require('fs');
const path = require('path');

/** backend 根目录 */
const BACKEND_DIR = path.resolve(__dirname, '..');
/** 测试库文件 */
const TEST_DB = path.join(BACKEND_DIR, 'prisma', 'test.db');

module.exports = async () => {
  if (String(process.env.KEEP_TEST_DB || '') === '1') {
    console.log('[test] KEEP_TEST_DB=1，保留测试库以便排查');
    return;
  }

  [TEST_DB, `${TEST_DB}-journal`, `${TEST_DB}-wal`, `${TEST_DB}-shm`].forEach(
    (file) => {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    },
  );
};
