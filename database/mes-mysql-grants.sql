-- =============================================================================
-- MES 系统 - MySQL 账号最小权限脚本
-- -----------------------------------------------------------------------------
-- 目的：
--   应用账号（Node / PHP 后端共用）只保留 DML 权限（SELECT/INSERT/UPDATE/DELETE），
--   不持有 CREATE / ALTER / DROP / INDEX / REFERENCES 等 DDL 权限。
--   这样即使发生 SQL 注入或越权写，也无法建表、改表、删表。
--
-- 责任划分：
--   mes_app      → 运行时应用账号，仅 DML（本脚本授予）
--   mes_migrate  → 结构升级账号，仅运维执行 Prisma migrate / 初始化脚本时使用
--   root         → 仅数据库初始化与账号维护，禁止写入应用配置
--
-- 使用方式：
--   1) 全新安装（非 Docker）：先按下方「账号创建」注释创建账号并改强口令，再执行本脚本；
--   2) Docker 部署：`backend/deploy/docker-compose.yml` 已把本文件挂载为 initdb 脚本，
--      在容器首次初始化时自动执行（此时 mes_app 已由 MYSQL_USER 创建）；
--   3) 已有数据卷：账号不会自动重建，需手工执行本脚本；
--   4) 验证：SHOW GRANTS FOR 'mes_app'@'%';  应只有 SELECT/INSERT/UPDATE/DELETE。
--
-- 注意：下列口令为占位符，必须在服务器上改为强口令后再执行 / 部署。
-- =============================================================================

-- ---------- 账号创建（全新安装、非 Docker 场景手动执行；Docker 由镜像入口创建）----------
-- CREATE USER IF NOT EXISTS 'mes_app'@'%'         IDENTIFIED BY 'CHANGE_ME_APP_PASSWORD';
-- CREATE USER IF NOT EXISTS 'mes_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_APP_PASSWORD';
-- CREATE USER IF NOT EXISTS 'mes_migrate'@'%'     IDENTIFIED BY 'CHANGE_ME_MIGRATE_PASSWORD';

-- ---------- 应用账号：先收回全部权限，再只授予 DML（幂等，可重复执行）----------
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mes_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE ON `mes_workshop`.* TO 'mes_app'@'%';

-- 非 Docker 场景若创建了 localhost 账号，取消下面两行注释；Docker 内不存在该账号，保持注释以免报错中断
-- REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mes_app'@'localhost';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON `mes_workshop`.* TO 'mes_app'@'localhost';

-- ---------- 迁移账号：DDL 权限（仅在已创建 mes_migrate 时取消注释）----------
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
--   ON `mes_workshop`.* TO 'mes_migrate'@'%';

FLUSH PRIVILEGES;

-- ---------- 验证（预期仅 1 条 USAGE + 1 条 DML）----------
-- SHOW GRANTS FOR 'mes_app'@'%';
