/**
 * MES 系统 - PM2 进程守护配置
 * ---------------------------------------------------------------------------
 * 用法（在 backend/ 目录下执行）：
 *   npm i -g pm2                     # 安装 pm2（一次性）
 *   pm2 start ecosystem.config.js    # 按本配置启动
 *   pm2 status                       # 查看状态
 *   pm2 logs mes-backend             # 查看日志
 *   pm2 reload mes-backend           # 零停机重载
 *   pm2 save                         # 保存进程列表
 *   pm2 startup                      # 生成开机自启脚本（按提示执行输出的命令）
 *
 * 注意：切换数据库（改 .env 的 DB_TYPE）后需先 `pm2 stop mes-backend`，再执行
 *       `npm run db:setup`（Windows 下进程会占用 query_engine dll，不停止会报 EPERM），
 *       最后 `pm2 start ecosystem.config.js`。
 */

module.exports = {
  apps: [
    {
      /** 进程名（pm2 命令中引用此名） */
      name: 'mes-backend',
      /** 入口文件（与 package.json 的 main / start 一致） */
      script: 'src/server.js',
      /** 运行目录（backend/），保证相对路径 .env、prisma/dev.db 解析正确 */
      cwd: __dirname,
      /** 单实例；如需多实例请先切换到 MySQL（DB_TYPE=mysql，SQLite 不支持多进程并发写） */
      instances: 1,
      exec_mode: 'fork',
      /** 生产环境标识：src/config/env.js 据此读取 .env.production */
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      /** 开发/调试用（pm2 start ecosystem.config.js --env development） */
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      /** 内存超限自动重启（MES 报表导出等大内存场景留足余量） */
      max_memory_restart: '600M',
      /** 异常退出自动拉起 */
      autorestart: true,
      /** 崩溃重启间隔与上限，避免无限重启刷日志 */
      restart_delay: 3000,
      max_restarts: 10,
      /** 优雅关闭：与 src/server.js 的 SIGINT/SIGTERM 处理配合，最长等待 5s */
      kill_timeout: 5000,
      /** 日志文件（backend/logs/ 目录需存在；pm2 会自动创建文件） */
      output: './logs/pm2-out.log',
      error: './logs/pm2-err.log',
      /** 日志时间戳，便于与 morgan 请求日志对齐 */
      time: true,
      /** 合并日志（不按进程 ID 加后缀） */
      merge_logs: true,
    },
  ],
};
