-- =============================================================================
-- MES 车间制造执行系统 —— MySQL 初始化脚本（建库 + 27 张表 DDL + 默认种子数据）
-- =============================================================================
-- 文件名称：mes-mysql-init.sql
-- 适用版本：MySQL 8.0+（同时兼容 MariaDB 10.3+，本脚本未使用 MySQL 8 专属语法）
-- 字符集　：utf8mb4 / utf8mb4_unicode_ci
-- 存储引擎：InnoDB（支持事务与外键）
--
-- 【数据来源（权威）】
--   1) 表结构：backend/prisma/schema.prisma —— 共 27 个 model（P0 19 张 + P1 8 张）
--   2) 种子数据：backend/prisma/seed.js —— 109 项权限 / 3 个角色 / 2 个账号 / 1 个车间 / 5 台设备
--   3) 参考库　：backend/prisma/dev.db（仅用于核对，已剔除 QA / E2E / test 等测试脏数据）
--
-- 【默认种子数据清单】
--   permissions        109 行（P0 59 项 + P1 50 项；P1 的 50 项 = 14 菜单 + 36 按钮）
--                      全库合计 30 个菜单权限 + 79 个按钮权限
--   roles                3 行（system:admin / production:operator / viewer）
--   role_permissions   150 行（管理员 109 + 操作员 18 + 只读 23）
--   users                2 行（admin / operator，bcrypt 哈希密码）
--   user_roles           2 行（admin→系统管理员，operator→生产操作员）
--   workshops            1 行（WS-001 一号车间）
--   equipment            5 行（EQ-001 ~ EQ-005）
--   其余 20 张业务表保持空表（不写入任何演示/测试数据，见文末「空表说明」）
--
-- 【Prisma 类型 → MySQL 类型映射】
--   String   → VARCHAR(n)（长文本用 TEXT）
--   Int      → BIGINT（含主键 id：BIGINT NOT NULL AUTO_INCREMENT）
--   Boolean  → TINYINT(1)（1 = true，0 = false）
--   DateTime → DATETIME（createdAt 默认 CURRENT_TIMESTAMP；updatedAt 带 ON UPDATE CURRENT_TIMESTAMP）
--   Float    → DECIMAL(12,2)
--   @id / @@id          → PRIMARY KEY
--   @unique / @@unique  → UNIQUE KEY
--   @@index             → KEY（另为全部外键列显式建索引，便于非 Prisma 场景运维）
--
-- 【执行方式】
--   方式一（命令行）：mysql -u root -p < database/mes-mysql-init.sql
--   方式二（客户端）：mysql> SOURCE database/mes-mysql-init.sql;
--
-- 【幂等性】
--   建表使用 CREATE TABLE IF NOT EXISTS / CREATE DATABASE IF NOT EXISTS；
--   种子数据使用 INSERT IGNORE 与 INSERT IGNORE ... SELECT（依赖唯一键），
--   因此脚本可重复执行而不会产生重复数据。
--
-- 【切换到 MySQL 运行后端】（详见 backend/docs/DATABASE.md）
--   1) backend/.env：DB_TYPE=mysql，并填写 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
--      （也可用整串 DATABASE_URL="mysql://<user>:<password>@127.0.0.1:3306/mes_workshop"，
--        注意其类型需与 DB_TYPE 一致）
--   2) cd backend && npm run db:setup
--      作用：同步 MySQL 变体 schema + 生成 MySQL 版 Prisma Client（不建表、不写种子，
--            因为本脚本已含表结构与种子数据）
--   3) npm start（重启服务）；访问 /api/health 确认 data.database.type 为 mysql
--
--   注意：导入本脚本后请勿再执行 npm run db:push，否则会因整型宽度差异触发 drift 告警。
--
-- 【如需要「全新安装」并清空旧库】请取消注释本脚本开头的「可选：清空重建」段落后执行。
-- =============================================================================

SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =============================================================================
-- 0. 建库
-- =============================================================================
CREATE DATABASE IF NOT EXISTS `mes_workshop`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `mes_workshop`;

-- -----------------------------------------------------------------------------
-- 【可选：清空重建】如为空库首次初始化，可跳过；如需覆盖既有库，请取消下方注释。
-- -----------------------------------------------------------------------------
-- SET FOREIGN_KEY_CHECKS = 0;
-- DROP TABLE IF EXISTS `work_hours_records`;
-- DROP TABLE IF EXISTS `personnel_schedules`;
-- DROP TABLE IF EXISTS `shifts`;
-- DROP TABLE IF EXISTS `material_batches`;
-- DROP TABLE IF EXISTS `inventory_transactions`;
-- DROP TABLE IF EXISTS `inventory`;
-- DROP TABLE IF EXISTS `bom_items`;
-- DROP TABLE IF EXISTS `boms`;
-- DROP TABLE IF EXISTS `materials`;
-- DROP TABLE IF EXISTS `defect_records`;
-- DROP TABLE IF EXISTS `inspection_items`;
-- DROP TABLE IF EXISTS `quality_inspections`;
-- DROP TABLE IF EXISTS `breakdown_records`;
-- DROP TABLE IF EXISTS `maintenance_records`;
-- DROP TABLE IF EXISTS `maintenance_plans`;
-- DROP TABLE IF EXISTS `equipment_status_logs`;
-- DROP TABLE IF EXISTS `production_schedules`;
-- DROP TABLE IF EXISTS `work_order_status_logs`;
-- DROP TABLE IF EXISTS `production_reports`;
-- DROP TABLE IF EXISTS `work_orders`;
-- DROP TABLE IF EXISTS `equipment`;
-- DROP TABLE IF EXISTS `workshops`;
-- DROP TABLE IF EXISTS `role_permissions`;
-- DROP TABLE IF EXISTS `user_roles`;
-- DROP TABLE IF EXISTS `permissions`;
-- DROP TABLE IF EXISTS `roles`;
-- DROP TABLE IF EXISTS `users`;
-- SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- 1. 系统设置模块（P0）—— users / roles / permissions / user_roles / role_permissions
-- =============================================================================

-- 1.1 用户账号表
CREATE TABLE IF NOT EXISTS `users` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `username`     VARCHAR(50)  NOT NULL                             COMMENT '登录账号（最长 50 字符）',
  `passwordHash` VARCHAR(255) NOT NULL                             COMMENT 'bcrypt 哈希密码',
  `name`         VARCHAR(100) NOT NULL                             COMMENT '用户姓名',
  `department`   VARCHAR(100) NOT NULL                             COMMENT '所属部门',
  `status`       TINYINT(1)   NOT NULL DEFAULT 1                   COMMENT '启用/停用：1=启用，0=停用',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户账号表';

-- 1.2 角色定义表
CREATE TABLE IF NOT EXISTS `roles` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `name`        VARCHAR(100) NOT NULL                             COMMENT '角色名称',
  `code`        VARCHAR(100) NOT NULL                             COMMENT '角色编码',
  `description` VARCHAR(500) NOT NULL                             COMMENT '角色描述',
  `status`      TINYINT(1)   NOT NULL DEFAULT 1                   COMMENT '启用/停用：1=启用，0=停用',
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roles_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色定义表';

-- 1.3 权限表（菜单/按钮，自关联形成权限树）
CREATE TABLE IF NOT EXISTS `permissions` (
  `id`       BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  `name`     VARCHAR(100) NOT NULL                COMMENT '权限名称',
  `code`     VARCHAR(100) NOT NULL                COMMENT '权限编码（格式：module:action）',
  `type`     VARCHAR(20)  NOT NULL                COMMENT '权限类型：menu=菜单，button=按钮',
  `parentId` BIGINT       NULL     DEFAULT NULL   COMMENT '父权限 ID（顶级菜单为 NULL）',
  `path`     VARCHAR(255) NOT NULL DEFAULT ''     COMMENT '前端路由路径（按钮权限为空串）',
  `sort`     BIGINT       NOT NULL DEFAULT 0      COMMENT '排序序号（同级升序）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permissions_code` (`code`),
  KEY `idx_permissions_parentId` (`parentId`),
  CONSTRAINT `fk_permissions_parentId`
    FOREIGN KEY (`parentId`) REFERENCES `permissions` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表（菜单/按钮）';

-- 1.4 用户-角色关联表（多对多）
CREATE TABLE IF NOT EXISTS `user_roles` (
  `userId` BIGINT NOT NULL COMMENT '用户 ID',
  `roleId` BIGINT NOT NULL COMMENT '角色 ID',
  PRIMARY KEY (`userId`, `roleId`),
  KEY `idx_user_roles_roleId` (`roleId`),
  CONSTRAINT `fk_user_roles_userId`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_roles_roleId`
    FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-角色关联表（多对多）';

-- 1.5 角色-权限关联表（多对多）
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `roleId`       BIGINT NOT NULL COMMENT '角色 ID',
  `permissionId` BIGINT NOT NULL COMMENT '权限 ID',
  PRIMARY KEY (`roleId`, `permissionId`),
  KEY `idx_role_permissions_permissionId` (`permissionId`),
  CONSTRAINT `fk_role_permissions_roleId`
    FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role_permissions_permissionId`
    FOREIGN KEY (`permissionId`) REFERENCES `permissions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色-权限关联表（多对多）';

-- 1.6 车间表（预留多车间扩展，MVP 默认单车间）
CREATE TABLE IF NOT EXISTS `workshops` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `name`        VARCHAR(100) NOT NULL                             COMMENT '车间名称',
  `code`        VARCHAR(100) NOT NULL                             COMMENT '车间编码',
  `description` VARCHAR(500) NOT NULL                             COMMENT '车间描述',
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workshops_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='车间表（预留多车间扩展）';

-- =============================================================================
-- 2. 生产管理模块（P0 + P1）
-- =============================================================================

-- 2.1 生产工单表
CREATE TABLE IF NOT EXISTS `work_orders` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `orderNo`      VARCHAR(100) NOT NULL                             COMMENT '工单编号',
  `productName`  VARCHAR(200) NOT NULL                             COMMENT '产品名称',
  `productCode`  VARCHAR(100) NOT NULL                             COMMENT '产品编码',
  `quantity`     BIGINT       NOT NULL                             COMMENT '计划数量',
  `completedQty` BIGINT       NOT NULL DEFAULT 0                   COMMENT '已完成数量',
  `defectQty`    BIGINT       NOT NULL DEFAULT 0                   COMMENT '不良数量',
  `status`       VARCHAR(20)  NOT NULL DEFAULT 'pending'           COMMENT '状态：pending=待生产，in_progress=生产中，paused=暂停，completed=已完成，closed=已关闭',
  `workshopId`   BIGINT       NULL     DEFAULT NULL                COMMENT '所属车间 ID',
  `priority`     VARCHAR(20)  NOT NULL DEFAULT 'medium'            COMMENT '优先级：low / medium / high / urgent',
  `planStart`    DATETIME     NULL     DEFAULT NULL                COMMENT '计划开始时间',
  `planEnd`      DATETIME     NULL     DEFAULT NULL                COMMENT '计划结束时间',
  `actualStart`  DATETIME     NULL     DEFAULT NULL                COMMENT '实际开始时间',
  `actualEnd`    DATETIME     NULL     DEFAULT NULL                COMMENT '实际结束时间',
  `remark`       VARCHAR(500) NOT NULL DEFAULT ''                  COMMENT '备注',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_orders_orderNo` (`orderNo`),
  KEY `idx_work_orders_workshopId` (`workshopId`),
  CONSTRAINT `fk_work_orders_workshopId`
    FOREIGN KEY (`workshopId`) REFERENCES `workshops` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产工单表';

-- 2.2 报工记录表
CREATE TABLE IF NOT EXISTS `production_reports` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT            COMMENT '主键 ID',
  `workOrderId`  BIGINT       NOT NULL                           COMMENT '所属工单 ID',
  `completedQty` BIGINT       NOT NULL                           COMMENT '本次完成数量',
  `defectQty`    BIGINT       NOT NULL DEFAULT 0                 COMMENT '本次不良数量',
  `operatorId`   BIGINT       NULL     DEFAULT NULL              COMMENT '报工操作员 ID',
  `reportTime`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报工时间',
  `remark`       VARCHAR(500) NOT NULL DEFAULT ''                COMMENT '备注',
  PRIMARY KEY (`id`),
  KEY `idx_production_reports_workOrderId` (`workOrderId`),
  KEY `idx_production_reports_operatorId` (`operatorId`),
  CONSTRAINT `fk_production_reports_workOrderId`
    FOREIGN KEY (`workOrderId`) REFERENCES `work_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_production_reports_operatorId`
    FOREIGN KEY (`operatorId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报工记录表';

-- 2.3 工单状态流转日志表
CREATE TABLE IF NOT EXISTS `work_order_status_logs` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT            COMMENT '主键 ID',
  `workOrderId` BIGINT       NOT NULL                           COMMENT '所属工单 ID',
  `fromStatus`  VARCHAR(20)  NOT NULL                           COMMENT '变更前状态',
  `toStatus`    VARCHAR(20)  NOT NULL                           COMMENT '变更后状态',
  `operatorId`  BIGINT       NULL     DEFAULT NULL              COMMENT '操作人 ID',
  `changedAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
  `remark`      VARCHAR(500) NOT NULL DEFAULT ''                COMMENT '备注',
  PRIMARY KEY (`id`),
  KEY `idx_wosl_workOrderId` (`workOrderId`),
  KEY `idx_wosl_operatorId` (`operatorId`),
  CONSTRAINT `fk_wosl_workOrderId`
    FOREIGN KEY (`workOrderId`) REFERENCES `work_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_wosl_operatorId`
    FOREIGN KEY (`operatorId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工单状态流转日志表';

-- 2.4 设备台账表（注：本表提前到生产排程之前创建，因 production_schedules 外键依赖 equipment）
CREATE TABLE IF NOT EXISTS `equipment` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `code`         VARCHAR(100) NOT NULL                             COMMENT '设备编码',
  `name`         VARCHAR(100) NOT NULL                             COMMENT '设备名称',
  `type`         VARCHAR(50)  NOT NULL                             COMMENT '设备类型（车床/铣床/注塑机等）',
  `location`     VARCHAR(100) NOT NULL                             COMMENT '设备位置',
  `status`       VARCHAR(20)  NOT NULL DEFAULT 'idle'              COMMENT '状态：running=运行，idle=空闲，stopped=停机，fault=故障',
  `workshopId`   BIGINT       NULL     DEFAULT NULL                COMMENT '所属车间 ID',
  `manufacturer` VARCHAR(100) NOT NULL DEFAULT ''                  COMMENT '制造商',
  `model`        VARCHAR(100) NOT NULL DEFAULT ''                  COMMENT '设备型号',
  `purchaseDate` DATETIME     NULL     DEFAULT NULL                COMMENT '购买日期',
  `remark`       VARCHAR(500) NOT NULL DEFAULT ''                  COMMENT '备注',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_equipment_code` (`code`),
  KEY `idx_equipment_workshopId` (`workshopId`),
  CONSTRAINT `fk_equipment_workshopId`
    FOREIGN KEY (`workshopId`) REFERENCES `workshops` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备台账表';

-- 2.5 生产排程表（P1）
CREATE TABLE IF NOT EXISTS `production_schedules` (
  `id`           BIGINT      NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `workOrderId`  BIGINT      NOT NULL                             COMMENT '所属工单 ID',
  `equipmentId`  BIGINT      NULL     DEFAULT NULL                COMMENT '排程设备 ID',
  `plannedStart` DATETIME    NOT NULL                             COMMENT '计划开始时间',
  `plannedEnd`   DATETIME    NOT NULL                             COMMENT '计划结束时间',
  `actualStart`  DATETIME    NULL     DEFAULT NULL                COMMENT '实际开始时间',
  `actualEnd`    DATETIME    NULL     DEFAULT NULL                COMMENT '实际结束时间',
  `status`       VARCHAR(20) NOT NULL DEFAULT 'planned'           COMMENT '状态：planned / in_progress / completed / cancelled',
  `createdAt`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间（P1 新增审计字段）',
  `updatedAt`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（P1 新增审计字段）',
  PRIMARY KEY (`id`),
  KEY `idx_production_schedules_workOrderId` (`workOrderId`),
  KEY `idx_production_schedules_equipmentId` (`equipmentId`),
  -- P1 复合索引：覆盖「同设备时段重叠」冲突检测查询
  KEY `idx_production_schedules_equipment_time` (`equipmentId`, `plannedStart`, `plannedEnd`),
  CONSTRAINT `fk_production_schedules_workOrderId`
    FOREIGN KEY (`workOrderId`) REFERENCES `work_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_production_schedules_equipmentId`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipment` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产排程表（P1）';

-- =============================================================================
-- 3. 设备管理模块（P0 + P1）
-- =============================================================================

-- 说明：设备台账表 `equipment` 的 DDL 见 2.4（生产排程表外键依赖设备表，故提前创建）

-- 3.1 设备状态变更日志表
CREATE TABLE IF NOT EXISTS `equipment_status_logs` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT            COMMENT '主键 ID',
  `equipmentId` BIGINT       NOT NULL                           COMMENT '设备 ID',
  `oldStatus`   VARCHAR(20)  NOT NULL                           COMMENT '变更前状态',
  `newStatus`   VARCHAR(20)  NOT NULL                           COMMENT '变更后状态',
  `changedById` BIGINT       NULL     DEFAULT NULL              COMMENT '操作人 ID',
  `changedAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
  `remark`      VARCHAR(500) NOT NULL DEFAULT ''                COMMENT '备注',
  PRIMARY KEY (`id`),
  KEY `idx_esl_equipmentId` (`equipmentId`),
  KEY `idx_esl_changedById` (`changedById`),
  CONSTRAINT `fk_esl_equipmentId`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipment` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_esl_changedById`
    FOREIGN KEY (`changedById`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备状态变更日志表';

-- 3.2 维保计划表（P1）
CREATE TABLE IF NOT EXISTS `maintenance_plans` (
  `id`          BIGINT      NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `equipmentId` BIGINT      NOT NULL                             COMMENT '设备 ID',
  `planName`    VARCHAR(200) NOT NULL                            COMMENT '维保计划名称',
  `cycleType`   VARCHAR(20) NOT NULL                             COMMENT '维保周期类型：daily / weekly / monthly / quarterly / yearly',
  `cycleDays`   BIGINT      NOT NULL                             COMMENT '维保周期天数',
  `nextDate`    DATETIME    NOT NULL                             COMMENT '下次维保日期',
  `status`      VARCHAR(20) NOT NULL DEFAULT 'active'            COMMENT '状态：active=启用，inactive=停用',
  `createdAt`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_maintenance_plans_equipmentId` (`equipmentId`),
  CONSTRAINT `fk_maintenance_plans_equipmentId`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipment` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='维保计划表（P1）';

-- 3.4 维保记录表（P1；planId 可选，删除计划时保留历史记录）
CREATE TABLE IF NOT EXISTS `maintenance_records` (
  `id`              BIGINT      NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `planId`          BIGINT      NULL     DEFAULT NULL                COMMENT '关联维保计划 ID（可为空，支持临时保养）',
  `equipmentId`     BIGINT      NOT NULL                             COMMENT '设备 ID',
  `maintenanceType` VARCHAR(20) NOT NULL                             COMMENT '维保类型：preventive=预防性，corrective=纠正性，emergency=紧急',
  `maintainerId`    BIGINT      NULL     DEFAULT NULL                COMMENT '维保人员 ID',
  `startTime`       DATETIME    NOT NULL                             COMMENT '维保开始时间',
  `endTime`         DATETIME    NULL     DEFAULT NULL                COMMENT '维保结束时间',
  `content`         TEXT        NULL                                 COMMENT '维保内容',
  `createdAt`       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间（P1 新增审计字段）',
  `updatedAt`       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（P1 新增审计字段）',
  PRIMARY KEY (`id`),
  KEY `idx_maintenance_records_planId` (`planId`),
  KEY `idx_maintenance_records_equipmentId` (`equipmentId`),
  KEY `idx_maintenance_records_maintainerId` (`maintainerId`),
  CONSTRAINT `fk_maintenance_records_planId`
    FOREIGN KEY (`planId`) REFERENCES `maintenance_plans` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_records_equipmentId`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipment` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_records_maintainerId`
    FOREIGN KEY (`maintainerId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='维保记录表（P1）';

-- 3.5 故障维修记录表（P1）
CREATE TABLE IF NOT EXISTS `breakdown_records` (
  `id`               BIGINT      NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `equipmentId`      BIGINT      NOT NULL                             COMMENT '设备 ID',
  `faultType`        VARCHAR(100) NOT NULL                            COMMENT '故障类型',
  `faultDescription` TEXT        NULL                                 COMMENT '故障描述',
  `occurredAt`       DATETIME    NOT NULL                             COMMENT '故障发生时间',
  `repairedAt`       DATETIME    NULL     DEFAULT NULL                COMMENT '修复时间',
  `repairerId`       BIGINT      NULL     DEFAULT NULL                COMMENT '维修人员 ID',
  `repairMethod`     TEXT        NULL                                 COMMENT '维修方法',
  `downtimeDuration` BIGINT      NOT NULL DEFAULT 0                   COMMENT '故障停机时长（分钟）',
  `createdAt`        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间（P1 新增审计字段）',
  `updatedAt`        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（P1 新增审计字段）',
  PRIMARY KEY (`id`),
  KEY `idx_breakdown_records_repairerId` (`repairerId`),
  -- P1 复合索引：设备维度故障历史查询
  KEY `idx_breakdown_records_equipment_occurred` (`equipmentId`, `occurredAt`),
  CONSTRAINT `fk_breakdown_records_equipmentId`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipment` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_breakdown_records_repairerId`
    FOREIGN KEY (`repairerId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='故障维修记录表（P1）';

-- =============================================================================
-- 4. 质量管理模块（P0）
-- =============================================================================

-- 4.1 质量检验记录表
CREATE TABLE IF NOT EXISTS `quality_inspections` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT            COMMENT '主键 ID',
  `workOrderId`    BIGINT       NOT NULL                           COMMENT '所属工单 ID',
  `inspectionType` VARCHAR(20)  NOT NULL                           COMMENT '检验类型：first_article=首件，process=过程，final=最终',
  `inspectorId`    BIGINT       NULL     DEFAULT NULL              COMMENT '检验员 ID',
  `inspectionTime` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '检验时间',
  `result`         VARCHAR(20)  NOT NULL                           COMMENT '检验结果：pass=合格，fail=不合格，concession=让步接收',
  `remark`         VARCHAR(500) NOT NULL DEFAULT ''                COMMENT '备注',
  `createdAt`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_quality_inspections_workOrderId` (`workOrderId`),
  KEY `idx_quality_inspections_inspectorId` (`inspectorId`),
  CONSTRAINT `fk_quality_inspections_workOrderId`
    FOREIGN KEY (`workOrderId`) REFERENCES `work_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_quality_inspections_inspectorId`
    FOREIGN KEY (`inspectorId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='质量检验记录表';

-- 4.2 检验项明细表
CREATE TABLE IF NOT EXISTS `inspection_items` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  `inspectionId`  BIGINT       NOT NULL                COMMENT '所属检验记录 ID',
  `itemName`      VARCHAR(200) NOT NULL                COMMENT '检验项名称',
  `standardValue` VARCHAR(100) NOT NULL                COMMENT '标准值',
  `actualValue`   VARCHAR(100) NOT NULL                COMMENT '实际值',
  `unit`          VARCHAR(50)  NOT NULL                COMMENT '计量单位',
  `result`        VARCHAR(20)  NOT NULL                COMMENT '检验结果：pass / fail / concession',
  `remark`        VARCHAR(500) NOT NULL DEFAULT ''     COMMENT '备注',
  PRIMARY KEY (`id`),
  KEY `idx_inspection_items_inspectionId` (`inspectionId`),
  CONSTRAINT `fk_inspection_items_inspectionId`
    FOREIGN KEY (`inspectionId`) REFERENCES `quality_inspections` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='检验项明细表';

-- 4.3 不良品记录表
CREATE TABLE IF NOT EXISTS `defect_records` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `workOrderId`    BIGINT       NOT NULL                             COMMENT '所属工单 ID',
  `equipmentId`    BIGINT       NULL     DEFAULT NULL                COMMENT '关联设备 ID（可选）',
  `defectType`     VARCHAR(100) NOT NULL                             COMMENT '不良类型',
  `defectReason`   TEXT         NULL                                 COMMENT '不良原因',
  `quantity`       BIGINT       NOT NULL                             COMMENT '不良数量',
  `handlingMethod` VARCHAR(20)  NULL     DEFAULT NULL                COMMENT '处理方式：rework=返工，scrap=报废，concession=让步接收',
  `handledBy`      BIGINT       NULL     DEFAULT NULL                COMMENT '处理人 ID',
  `handledAt`      DATETIME     NULL     DEFAULT NULL                COMMENT '处理时间',
  `remark`         VARCHAR(500) NOT NULL DEFAULT ''                  COMMENT '备注',
  `createdAt`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_defect_records_workOrderId` (`workOrderId`),
  KEY `idx_defect_records_equipmentId` (`equipmentId`),
  KEY `idx_defect_records_handledBy` (`handledBy`),
  CONSTRAINT `fk_defect_records_workOrderId`
    FOREIGN KEY (`workOrderId`) REFERENCES `work_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_defect_records_equipmentId`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipment` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_defect_records_handledBy`
    FOREIGN KEY (`handledBy`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='不良品记录表';

-- =============================================================================
-- 5. 物料管理模块（P0 + P1）
-- =============================================================================

-- 5.1 物料主数据表
CREATE TABLE IF NOT EXISTS `materials` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `code`          VARCHAR(100) NOT NULL                             COMMENT '物料编码',
  `name`          VARCHAR(200) NOT NULL                             COMMENT '物料名称',
  `specification` VARCHAR(200) NOT NULL                             COMMENT '规格',
  `unit`          VARCHAR(50)  NOT NULL                             COMMENT '计量单位',
  `category`      VARCHAR(100) NOT NULL                             COMMENT '物料分类',
  `type`          VARCHAR(20)  NOT NULL                             COMMENT '物料类型：raw=原材料，semi=半成品，finished=成品',
  `description`   TEXT         NULL                                 COMMENT '描述',
  `createdAt`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_materials_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料主数据表';

-- 5.2 物料清单（BOM）表
CREATE TABLE IF NOT EXISTS `boms` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `productCode` VARCHAR(100) NOT NULL                             COMMENT '产品编码',
  `productName` VARCHAR(200) NOT NULL                             COMMENT '产品名称',
  `version`     VARCHAR(50)  NOT NULL                             COMMENT 'BOM 版本',
  `status`      TINYINT(1)   NOT NULL DEFAULT 1                   COMMENT '启用/停用：1=启用，0=停用',
  `remark`      VARCHAR(500) NOT NULL DEFAULT ''                  COMMENT '备注',
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料清单（BOM）表';

-- 5.3 BOM 明细表
CREATE TABLE IF NOT EXISTS `bom_items` (
  `id`         BIGINT         NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  `bomId`      BIGINT         NOT NULL                COMMENT '所属 BOM ID',
  `materialId` BIGINT         NOT NULL                COMMENT '物料 ID',
  `quantity`   DECIMAL(12,2)  NOT NULL                COMMENT '用量',
  `unit`       VARCHAR(50)    NOT NULL                COMMENT '计量单位',
  `remark`     VARCHAR(500)   NOT NULL DEFAULT ''     COMMENT '备注',
  PRIMARY KEY (`id`),
  KEY `idx_bom_items_bomId` (`bomId`),
  KEY `idx_bom_items_materialId` (`materialId`),
  CONSTRAINT `fk_bom_items_bomId`
    FOREIGN KEY (`bomId`) REFERENCES `boms` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bom_items_materialId`
    FOREIGN KEY (`materialId`) REFERENCES `materials` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BOM 明细表';

-- 5.4 库存表（一个物料一条库存记录）
CREATE TABLE IF NOT EXISTS `inventory` (
  `id`          BIGINT         NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `materialId`  BIGINT         NOT NULL                             COMMENT '物料 ID（唯一）',
  `warehouse`   VARCHAR(100)   NOT NULL                             COMMENT '仓库',
  `location`    VARCHAR(100)   NOT NULL                             COMMENT '库位',
  `quantity`    DECIMAL(12,2)  NOT NULL DEFAULT 0.00                COMMENT '当前库存量',
  `safetyStock` DECIMAL(12,2)  NOT NULL DEFAULT 0.00                COMMENT '安全库存',
  `maxStock`    DECIMAL(12,2)  NOT NULL DEFAULT 0.00                COMMENT '最大库存',
  `updatedAt`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inventory_materialId` (`materialId`),
  CONSTRAINT `fk_inventory_materialId`
    FOREIGN KEY (`materialId`) REFERENCES `materials` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存表';

-- 5.5 出入库记录表
CREATE TABLE IF NOT EXISTS `inventory_transactions` (
  `id`              BIGINT         NOT NULL AUTO_INCREMENT            COMMENT '主键 ID',
  `materialId`      BIGINT         NOT NULL                           COMMENT '物料 ID',
  `transactionType` VARCHAR(20)    NOT NULL                           COMMENT '出入库类型：in=入库，out=出库',
  `quantity`        DECIMAL(12,2)  NOT NULL                           COMMENT '出入库数量',
  `batchNo`         VARCHAR(100)   NOT NULL                           COMMENT '批次号',
  `operatorId`      BIGINT         NULL     DEFAULT NULL              COMMENT '操作员 ID',
  `transactionTime` DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '出入库时间',
  `relatedOrder`    VARCHAR(100)   NOT NULL DEFAULT ''                COMMENT '关联单据（工单号等）',
  `remark`          VARCHAR(500)   NOT NULL DEFAULT ''                COMMENT '备注',
  PRIMARY KEY (`id`),
  KEY `idx_inventory_transactions_materialId` (`materialId`),
  KEY `idx_inventory_transactions_operatorId` (`operatorId`),
  -- P1 索引：批次号高频查询（质量追溯 / 物料追溯链路）
  KEY `idx_inventory_transactions_batchNo` (`batchNo`),
  CONSTRAINT `fk_inventory_transactions_materialId`
    FOREIGN KEY (`materialId`) REFERENCES `materials` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_inventory_transactions_operatorId`
    FOREIGN KEY (`operatorId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出入库记录表';

-- 5.6 物料批次表（P1）
CREATE TABLE IF NOT EXISTS `material_batches` (
  `id`           BIGINT         NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `materialId`   BIGINT         NOT NULL                             COMMENT '物料 ID',
  `batchNo`      VARCHAR(100)   NOT NULL                             COMMENT '批次号',
  `supplier`     VARCHAR(100)   NOT NULL                             COMMENT '供应商',
  `receivedDate` DATETIME       NOT NULL                             COMMENT '入库日期',
  `quantity`     DECIMAL(12,2)  NOT NULL                             COMMENT '批次数量',
  `status`       VARCHAR(20)    NOT NULL DEFAULT 'active'            COMMENT '状态：active=在库，consumed=已消耗，expired=已过期',
  `createdAt`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_material_batches_materialId` (`materialId`),
  CONSTRAINT `fk_material_batches_materialId`
    FOREIGN KEY (`materialId`) REFERENCES `materials` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料批次表（P1）';

-- =============================================================================
-- 6. 人员管理模块（P1）
-- =============================================================================

-- 6.1 班次定义表
CREATE TABLE IF NOT EXISTS `shifts` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `name`        VARCHAR(100) NOT NULL                             COMMENT '班次名称（如：早班、白班、夜班）',
  `startTime`   VARCHAR(10)  NOT NULL                             COMMENT '开始时间 HH:mm',
  `endTime`     VARCHAR(10)  NOT NULL                             COMMENT '结束时间 HH:mm',
  `description` VARCHAR(500) NOT NULL DEFAULT ''                  COMMENT '班次描述',
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班次定义表（P1）';

-- 6.2 人员排班表
CREATE TABLE IF NOT EXISTS `personnel_schedules` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `userId`       BIGINT       NOT NULL                             COMMENT '用户 ID',
  `shiftId`      BIGINT       NOT NULL                             COMMENT '班次 ID',
  `workStation`  VARCHAR(100) NOT NULL                             COMMENT '工位',
  `scheduleDate` DATETIME     NOT NULL                             COMMENT '排班日期',
  `remark`       VARCHAR(500) NOT NULL DEFAULT ''                  COMMENT '备注',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  -- P1 唯一约束：同人 + 同日 + 同班次不可重复排班
  UNIQUE KEY `uk_personnel_schedules_user_date_shift` (`userId`, `scheduleDate`, `shiftId`),
  KEY `idx_personnel_schedules_shiftId` (`shiftId`),
  CONSTRAINT `fk_personnel_schedules_userId`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_personnel_schedules_shiftId`
    FOREIGN KEY (`shiftId`) REFERENCES `shifts` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='人员排班表（P1）';

-- 6.3 工时记录表
CREATE TABLE IF NOT EXISTS `work_hours_records` (
  `id`          BIGINT         NOT NULL AUTO_INCREMENT              COMMENT '主键 ID',
  `userId`      BIGINT         NULL     DEFAULT NULL                COMMENT '操作员 ID',
  `workOrderId` BIGINT         NOT NULL                             COMMENT '所属工单 ID',
  `shiftId`     BIGINT         NULL     DEFAULT NULL                COMMENT '班次 ID',
  `workDate`    DATETIME       NOT NULL                             COMMENT '工作日期',
  `startTime`   DATETIME       NOT NULL                             COMMENT '开始时间',
  `endTime`     DATETIME       NULL     DEFAULT NULL                COMMENT '结束时间',
  `hours`       DECIMAL(12,2)  NOT NULL DEFAULT 0.00                COMMENT '工时（小时）',
  `createdAt`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP   COMMENT '创建时间',
  `updatedAt`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_work_hours_records_userId` (`userId`),
  KEY `idx_work_hours_records_workOrderId` (`workOrderId`),
  KEY `idx_work_hours_records_shiftId` (`shiftId`),
  CONSTRAINT `fk_work_hours_records_userId`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_work_hours_records_workOrderId`
    FOREIGN KEY (`workOrderId`) REFERENCES `work_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_work_hours_records_shiftId`
    FOREIGN KEY (`shiftId`) REFERENCES `shifts` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工时记录表（P1）';

-- =============================================================================
-- 7. 默认种子数据（与 backend/prisma/seed.js 完全对齐）
-- =============================================================================

-- 7.1 权限数据：109 项（P0 59 + P1 50；共 30 个菜单 + 79 个按钮）
--     说明：按 seed.js 定义顺序插入，父级一定先于子级出现；parentId 先置 NULL，
--           随后由 7.2 段按 parentCode 统一回填，避免因自增 ID 变动导致权限树断链。
INSERT IGNORE INTO `permissions` (`name`, `code`, `type`, `path`, `sort`) VALUES
  -- 数据看板（P0）
  ('数据看板', 'dashboard', 'menu', '/dashboard', 1),
  ('查看看板', 'dashboard:view', 'button', '', 1),
  -- 生产管理（P0）
  ('生产管理', 'production', 'menu', '/production/orders', 2),
  ('工单管理', 'production:order', 'menu', '/production/orders', 1),
  ('查看工单', 'production:order:view', 'button', '', 1),
  ('创建工单', 'production:order:create', 'button', '', 2),
  ('编辑工单', 'production:order:edit', 'button', '', 3),
  ('删除工单', 'production:order:delete', 'button', '', 4),
  ('流转状态', 'production:order:status', 'button', '', 5),
  ('提交报工', 'production:order:report', 'button', '', 6),
  -- 生产排程（P1-01，5 项）
  ('生产排程', 'production:schedule', 'menu', '/production/schedule', 2),
  ('查看排程', 'production:schedule:view', 'button', '', 1),
  ('创建排程', 'production:schedule:create', 'button', '', 2),
  ('调整排程', 'production:schedule:edit', 'button', '', 3),
  ('删除排程', 'production:schedule:delete', 'button', '', 4),
  -- 设备管理（P0）
  ('设备管理', 'equipment', 'menu', '/equipment/list', 3),
  ('设备台账', 'equipment:list', 'menu', '/equipment/list', 1),
  ('查看设备', 'equipment:list:view', 'button', '', 1),
  ('创建设备', 'equipment:list:create', 'button', '', 2),
  ('编辑设备', 'equipment:list:edit', 'button', '', 3),
  ('删除设备', 'equipment:list:delete', 'button', '', 4),
  ('切换状态', 'equipment:list:status', 'button', '', 5),
  -- 设备维保（P1-02，6 项）
  ('设备维保', 'equipment:maintenance', 'menu', '/equipment/maintenance', 2),
  ('查看维保', 'equipment:maintenance:view', 'button', '', 1),
  ('创建维保计划', 'equipment:maintenance:create', 'button', '', 2),
  ('编辑维保计划', 'equipment:maintenance:edit', 'button', '', 3),
  ('登记维保记录', 'equipment:maintenance:complete', 'button', '', 4),
  ('删除维保计划', 'equipment:maintenance:delete', 'button', '', 5),
  -- 故障维修（P1-03，5 项）
  ('故障维修', 'equipment:breakdown', 'menu', '/equipment/breakdown', 3),
  ('查看故障', 'equipment:breakdown:view', 'button', '', 1),
  ('故障报修', 'equipment:breakdown:create', 'button', '', 2),
  ('维修处理', 'equipment:breakdown:repair', 'button', '', 3),
  ('删除故障', 'equipment:breakdown:delete', 'button', '', 4),
  -- 质量管理（P0）
  ('质量管理', 'quality', 'menu', '/quality/inspection', 4),
  ('质量检验', 'quality:inspection', 'menu', '/quality/inspection', 1),
  ('查看检验', 'quality:inspection:view', 'button', '', 1),
  ('创建检验', 'quality:inspection:create', 'button', '', 2),
  ('编辑检验', 'quality:inspection:edit', 'button', '', 3),
  ('删除检验', 'quality:inspection:delete', 'button', '', 4),
  ('不良品管理', 'quality:defect', 'menu', '/quality/defects', 2),
  ('查看不良品', 'quality:defect:view', 'button', '', 1),
  ('登记不良品', 'quality:defect:create', 'button', '', 2),
  ('处理不良品', 'quality:defect:handle', 'button', '', 3),
  ('删除不良品', 'quality:defect:delete', 'button', '', 4),
  -- 质量追溯（P1-04，2 项）
  ('质量追溯', 'quality:traceability', 'menu', '/quality/traceability', 3),
  ('查看追溯', 'quality:traceability:view', 'button', '', 1),
  -- 物料管理（P0）
  ('物料管理', 'material', 'menu', '/material/items', 5),
  ('物料主数据', 'material:items', 'menu', '/material/items', 1),
  ('查看物料', 'material:items:view', 'button', '', 1),
  ('创建物料', 'material:items:create', 'button', '', 2),
  ('编辑物料', 'material:items:edit', 'button', '', 3),
  ('删除物料', 'material:items:delete', 'button', '', 4),
  ('BOM管理', 'material:bom', 'menu', '/material/bom', 2),
  ('查看BOM', 'material:bom:view', 'button', '', 1),
  ('创建BOM', 'material:bom:create', 'button', '', 2),
  ('编辑BOM', 'material:bom:edit', 'button', '', 3),
  ('删除BOM', 'material:bom:delete', 'button', '', 4),
  ('库存管理', 'material:inventory', 'menu', '/material/inventory', 3),
  ('查看库存', 'material:inventory:view', 'button', '', 1),
  ('编辑库存', 'material:inventory:edit', 'button', '', 2),
  ('出入库操作', 'material:inventory:transact', 'button', '', 3),
  -- 物料批次 / 物料追溯（P1-07，7 项）
  ('物料批次', 'material:batch', 'menu', '/material/batches', 4),
  ('查看批次', 'material:batch:view', 'button', '', 1),
  ('创建批次', 'material:batch:create', 'button', '', 2),
  ('编辑批次', 'material:batch:edit', 'button', '', 3),
  ('删除批次', 'material:batch:delete', 'button', '', 4),
  ('物料追溯', 'material:trace', 'menu', '/material/trace', 5),
  ('查看物料追溯', 'material:trace:view', 'button', '', 1),
  -- 库存预警（P1-08，2 项）
  ('库存预警', 'material:warning', 'menu', '/material/inventory-warning', 6),
  ('查看库存预警', 'material:warning:view', 'button', '', 1),
  -- 系统设置（P0）
  ('系统设置', 'system', 'menu', '/system/users', 6),
  ('用户管理', 'system:users', 'menu', '/system/users', 1),
  ('查看用户', 'system:users:view', 'button', '', 1),
  ('创建用户', 'system:users:create', 'button', '', 2),
  ('编辑用户', 'system:users:edit', 'button', '', 3),
  ('删除用户', 'system:users:delete', 'button', '', 4),
  ('启停用户', 'system:users:status', 'button', '', 5),
  ('角色权限', 'system:roles', 'menu', '/system/roles', 2),
  ('查看角色', 'system:roles:view', 'button', '', 1),
  ('创建角色', 'system:roles:create', 'button', '', 2),
  ('编辑角色', 'system:roles:edit', 'button', '', 3),
  ('删除角色', 'system:roles:delete', 'button', '', 4),
  ('分配权限', 'system:roles:assign', 'button', '', 5),
  ('系统配置', 'system:settings', 'menu', '/system/settings', 3),
  ('查看配置', 'system:settings:view', 'button', '', 1),
  ('修改配置', 'system:settings:edit', 'button', '', 2),
  -- 报表中心（P1 新增顶级菜单，7 项）
  ('报表中心', 'reports', 'menu', '/reports/oee', 7),
  ('OEE 分析', 'reports:oee', 'menu', '/reports/oee', 1),
  ('查看 OEE', 'reports:oee:view', 'button', '', 1),
  ('导出 OEE', 'reports:oee:export', 'button', '', 2),
  ('生产报表', 'reports:production', 'menu', '/reports/production', 2),
  ('查看生产报表', 'reports:production:view', 'button', '', 1),
  ('导出生产报表', 'reports:production:export', 'button', '', 2),
  -- 人员管理（P1 新增顶级菜单，16 项）
  ('人员管理', 'personnel', 'menu', '/personnel/schedule', 8),
  ('班次管理', 'personnel:shift', 'menu', '/personnel/shifts', 1),
  ('查看班次', 'personnel:shift:view', 'button', '', 1),
  ('创建班次', 'personnel:shift:create', 'button', '', 2),
  ('编辑班次', 'personnel:shift:edit', 'button', '', 3),
  ('删除班次', 'personnel:shift:delete', 'button', '', 4),
  ('人员排班', 'personnel:schedule', 'menu', '/personnel/schedule', 2),
  ('查看排班', 'personnel:schedule:view', 'button', '', 1),
  ('新建排班', 'personnel:schedule:create', 'button', '', 2),
  ('调整排班', 'personnel:schedule:edit', 'button', '', 3),
  ('删除排班', 'personnel:schedule:delete', 'button', '', 4),
  ('工时统计', 'personnel:workhours', 'menu', '/personnel/work-hours', 3),
  ('查看工时', 'personnel:workhours:view', 'button', '', 1),
  ('录入工时', 'personnel:workhours:create', 'button', '', 2),
  ('编辑工时', 'personnel:workhours:edit', 'button', '', 3),
  ('导出工时', 'personnel:workhours:export', 'button', '', 4);

-- 7.2 回填权限父子关系（101 条子级：childCode → parentCode）
UPDATE `permissions` AS `p`
  JOIN (
        SELECT 'dashboard:view'                  AS `childCode`, 'dashboard'                AS `parentCode`
  UNION ALL SELECT 'production:order'            , 'production'
  UNION ALL SELECT 'production:order:view'       , 'production:order'
  UNION ALL SELECT 'production:order:create'     , 'production:order'
  UNION ALL SELECT 'production:order:edit'       , 'production:order'
  UNION ALL SELECT 'production:order:delete'     , 'production:order'
  UNION ALL SELECT 'production:order:status'     , 'production:order'
  UNION ALL SELECT 'production:order:report'     , 'production:order'
  UNION ALL SELECT 'production:schedule'         , 'production'
  UNION ALL SELECT 'production:schedule:view'    , 'production:schedule'
  UNION ALL SELECT 'production:schedule:create'  , 'production:schedule'
  UNION ALL SELECT 'production:schedule:edit'    , 'production:schedule'
  UNION ALL SELECT 'production:schedule:delete'  , 'production:schedule'
  UNION ALL SELECT 'equipment:list'              , 'equipment'
  UNION ALL SELECT 'equipment:list:view'         , 'equipment:list'
  UNION ALL SELECT 'equipment:list:create'       , 'equipment:list'
  UNION ALL SELECT 'equipment:list:edit'         , 'equipment:list'
  UNION ALL SELECT 'equipment:list:delete'       , 'equipment:list'
  UNION ALL SELECT 'equipment:list:status'       , 'equipment:list'
  UNION ALL SELECT 'equipment:maintenance'       , 'equipment'
  UNION ALL SELECT 'equipment:maintenance:view'  , 'equipment:maintenance'
  UNION ALL SELECT 'equipment:maintenance:create', 'equipment:maintenance'
  UNION ALL SELECT 'equipment:maintenance:edit'  , 'equipment:maintenance'
  UNION ALL SELECT 'equipment:maintenance:complete', 'equipment:maintenance'
  UNION ALL SELECT 'equipment:maintenance:delete', 'equipment:maintenance'
  UNION ALL SELECT 'equipment:breakdown'         , 'equipment'
  UNION ALL SELECT 'equipment:breakdown:view'    , 'equipment:breakdown'
  UNION ALL SELECT 'equipment:breakdown:create'  , 'equipment:breakdown'
  UNION ALL SELECT 'equipment:breakdown:repair'  , 'equipment:breakdown'
  UNION ALL SELECT 'equipment:breakdown:delete'  , 'equipment:breakdown'
  UNION ALL SELECT 'quality:inspection'          , 'quality'
  UNION ALL SELECT 'quality:inspection:view'     , 'quality:inspection'
  UNION ALL SELECT 'quality:inspection:create'   , 'quality:inspection'
  UNION ALL SELECT 'quality:inspection:edit'     , 'quality:inspection'
  UNION ALL SELECT 'quality:inspection:delete'   , 'quality:inspection'
  UNION ALL SELECT 'quality:defect'              , 'quality'
  UNION ALL SELECT 'quality:defect:view'         , 'quality:defect'
  UNION ALL SELECT 'quality:defect:create'       , 'quality:defect'
  UNION ALL SELECT 'quality:defect:handle'       , 'quality:defect'
  UNION ALL SELECT 'quality:defect:delete'       , 'quality:defect'
  UNION ALL SELECT 'quality:traceability'        , 'quality'
  UNION ALL SELECT 'quality:traceability:view'   , 'quality:traceability'
  UNION ALL SELECT 'material:items'              , 'material'
  UNION ALL SELECT 'material:items:view'         , 'material:items'
  UNION ALL SELECT 'material:items:create'       , 'material:items'
  UNION ALL SELECT 'material:items:edit'         , 'material:items'
  UNION ALL SELECT 'material:items:delete'       , 'material:items'
  UNION ALL SELECT 'material:bom'                , 'material'
  UNION ALL SELECT 'material:bom:view'           , 'material:bom'
  UNION ALL SELECT 'material:bom:create'         , 'material:bom'
  UNION ALL SELECT 'material:bom:edit'           , 'material:bom'
  UNION ALL SELECT 'material:bom:delete'         , 'material:bom'
  UNION ALL SELECT 'material:inventory'          , 'material'
  UNION ALL SELECT 'material:inventory:view'     , 'material:inventory'
  UNION ALL SELECT 'material:inventory:edit'     , 'material:inventory'
  UNION ALL SELECT 'material:inventory:transact' , 'material:inventory'
  UNION ALL SELECT 'material:batch'              , 'material'
  UNION ALL SELECT 'material:batch:view'         , 'material:batch'
  UNION ALL SELECT 'material:batch:create'       , 'material:batch'
  UNION ALL SELECT 'material:batch:edit'         , 'material:batch'
  UNION ALL SELECT 'material:batch:delete'       , 'material:batch'
  UNION ALL SELECT 'material:trace'              , 'material'
  UNION ALL SELECT 'material:trace:view'         , 'material:trace'
  UNION ALL SELECT 'material:warning'            , 'material'
  UNION ALL SELECT 'material:warning:view'       , 'material:warning'
  UNION ALL SELECT 'system:users'                , 'system'
  UNION ALL SELECT 'system:users:view'           , 'system:users'
  UNION ALL SELECT 'system:users:create'         , 'system:users'
  UNION ALL SELECT 'system:users:edit'           , 'system:users'
  UNION ALL SELECT 'system:users:delete'         , 'system:users'
  UNION ALL SELECT 'system:users:status'         , 'system:users'
  UNION ALL SELECT 'system:roles'                , 'system'
  UNION ALL SELECT 'system:roles:view'           , 'system:roles'
  UNION ALL SELECT 'system:roles:create'         , 'system:roles'
  UNION ALL SELECT 'system:roles:edit'           , 'system:roles'
  UNION ALL SELECT 'system:roles:delete'         , 'system:roles'
  UNION ALL SELECT 'system:roles:assign'         , 'system:roles'
  UNION ALL SELECT 'system:settings'             , 'system'
  UNION ALL SELECT 'system:settings:view'        , 'system:settings'
  UNION ALL SELECT 'system:settings:edit'        , 'system:settings'
  UNION ALL SELECT 'reports:oee'                 , 'reports'
  UNION ALL SELECT 'reports:oee:view'            , 'reports:oee'
  UNION ALL SELECT 'reports:oee:export'          , 'reports:oee'
  UNION ALL SELECT 'reports:production'          , 'reports'
  UNION ALL SELECT 'reports:production:view'     , 'reports:production'
  UNION ALL SELECT 'reports:production:export'   , 'reports:production'
  UNION ALL SELECT 'personnel:shift'             , 'personnel'
  UNION ALL SELECT 'personnel:shift:view'        , 'personnel:shift'
  UNION ALL SELECT 'personnel:shift:create'      , 'personnel:shift'
  UNION ALL SELECT 'personnel:shift:edit'        , 'personnel:shift'
  UNION ALL SELECT 'personnel:shift:delete'      , 'personnel:shift'
  UNION ALL SELECT 'personnel:schedule'          , 'personnel'
  UNION ALL SELECT 'personnel:schedule:view'     , 'personnel:schedule'
  UNION ALL SELECT 'personnel:schedule:create'   , 'personnel:schedule'
  UNION ALL SELECT 'personnel:schedule:edit'     , 'personnel:schedule'
  UNION ALL SELECT 'personnel:schedule:delete'   , 'personnel:schedule'
  UNION ALL SELECT 'personnel:workhours'         , 'personnel'
  UNION ALL SELECT 'personnel:workhours:view'    , 'personnel:workhours'
  UNION ALL SELECT 'personnel:workhours:create'  , 'personnel:workhours'
  UNION ALL SELECT 'personnel:workhours:edit'    , 'personnel:workhours'
  UNION ALL SELECT 'personnel:workhours:export'  , 'personnel:workhours'
  ) AS `m` ON `m`.`childCode` = `p`.`code`
  JOIN `permissions` AS `pp` ON `pp`.`code` = `m`.`parentCode`
SET `p`.`parentId` = `pp`.`id`;

-- 7.3 角色数据：3 个
INSERT IGNORE INTO `roles` (`name`, `code`, `description`, `status`) VALUES
  ('系统管理员', 'system:admin',         '拥有全部权限，可管理所有模块', 1),
  ('生产操作员', 'production:operator',  '可查看工单和提交报工',         1),
  ('只读用户',   'viewer',               '仅查看权限，不可操作',         1);

-- 7.4 角色-权限关联
--     (1) 系统管理员：全部 109 项权限
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT `r`.`id`, `p`.`id`
FROM `roles` AS `r`
CROSS JOIN `permissions` AS `p`
WHERE `r`.`code` = 'system:admin';

--     (2) 生产操作员：18 项（PRD §5.9：看板 + 工单查看/报工 + P1 排程/维保/故障/追溯/排班/工时）
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT `r`.`id`, `p`.`id`
FROM `roles` AS `r`
CROSS JOIN `permissions` AS `p`
WHERE `r`.`code` = 'production:operator'
  AND `p`.`code` IN (
    'dashboard',
    'dashboard:view',
    'production',
    'production:order',
    'production:order:view',
    'production:order:report',
    'equipment',
    'equipment:list',
    'equipment:list:view',
    'production:schedule:view',
    'equipment:maintenance:view',
    'equipment:breakdown:create',
    'equipment:breakdown:view',
    'quality:traceability',
    'quality:traceability:view',
    'personnel:schedule:view',
    'personnel:workhours:create',
    'personnel:workhours:view'
  );

--     (3) 只读用户：全部 *:view 权限（23 项，不含任何 create/edit/delete/export）
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT `r`.`id`, `p`.`id`
FROM `roles` AS `r`
CROSS JOIN `permissions` AS `p`
WHERE `r`.`code` = 'viewer'
  AND `p`.`code` LIKE '%:view';

-- 7.5 用户账号：2 个（bcrypt cost=10 哈希，明文分别为 admin123 / operator123）
INSERT IGNORE INTO `users` (`username`, `passwordHash`, `name`, `department`, `status`) VALUES
  ('admin',    '$2a$10$HIZtgb84neOYC1m1IwiQcOweUqyBdO8LyKlrW7rqCeUxFRILiG56e', '系统管理员', '信息中心',     1),
  ('operator', '$2a$10$abHXZ3QZLkaK8TEL1H97WeL6gdL.mQZ5f20Ix5prElMaTUgYF7U5m', '张操作',     '生产一车间',   1);

-- 7.6 用户-角色关联
INSERT IGNORE INTO `user_roles` (`userId`, `roleId`)
SELECT `u`.`id`, `r`.`id`
FROM `users` AS `u`
CROSS JOIN `roles` AS `r`
WHERE (`u`.`username` = 'admin'    AND `r`.`code` = 'system:admin')
   OR (`u`.`username` = 'operator' AND `r`.`code` = 'production:operator');

-- 7.7 车间：WS-001
INSERT IGNORE INTO `workshops` (`name`, `code`, `description`) VALUES
  ('一号车间', 'WS-001', '主要生产车间，包含机加工和装配产线');

-- 7.8 设备：5 台（挂到 WS-001 车间）
SET @workshopId = (SELECT `id` FROM `workshops` WHERE `code` = 'WS-001');

INSERT IGNORE INTO `equipment`
  (`code`, `name`, `type`, `location`, `status`, `workshopId`, `manufacturer`, `model`, `purchaseDate`, `remark`)
VALUES
  ('EQ-001', '数控车床 A',     '车床',     'A区-01工位', 'running', @workshopId, '沈阳机床',   'CK6140',   '2024-01-15 00:00:00', ''),
  ('EQ-002', '立式铣床 B',     '铣床',     'A区-02工位', 'idle',    @workshopId, '济南二机床', 'X5032',    '2024-01-15 00:00:00', ''),
  ('EQ-003', '注塑机 C',       '注塑机',   'B区-01工位', 'running', @workshopId, '海天塑机',   'HTF160X',  '2024-01-15 00:00:00', ''),
  ('EQ-004', '数控加工中心 D', '加工中心', 'A区-03工位', 'stopped', @workshopId, '大连机床',   'VDM-800',  '2024-01-15 00:00:00', ''),
  ('EQ-005', '装配线 E',       '装配线',   'C区-01工位', 'running', @workshopId, '自研',       'ASSY-01',  '2024-01-15 00:00:00', '');

-- =============================================================================
-- 8. 空表说明（以下 20 张业务表按设计保持空表，由业务运行时写入，不含任何演示/测试数据）
--    work_orders               生产工单
--    production_reports        报工记录
--    work_order_status_logs    工单状态流转日志
--    production_schedules      生产排程（P1）
--    equipment_status_logs     设备状态变更日志
--    maintenance_plans         维保计划（P1）
--    maintenance_records       维保记录（P1）
--    breakdown_records         故障维修记录（P1）
--    quality_inspections       质量检验记录
--    inspection_items          检验项明细
--    defect_records            不良品记录
--    materials                 物料主数据
--    boms                      物料清单（BOM）
--    bom_items                 BOM 明细
--    inventory                 库存
--    inventory_transactions    出入库记录
--    material_batches          物料批次（P1）
--    shifts                    班次定义（P1）
--    personnel_schedules       人员排班（P1）
--    work_hours_records        工时记录（P1）
-- =============================================================================

-- =============================================================================
-- 9. 导入校验（可选执行：逐项核对「实际值」与「期望值」是否一致）
-- =============================================================================
SELECT '数据表总数'      AS `校验项`, (SELECT COUNT(*) FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_TYPE` = 'BASE TABLE') AS `实际值`, 27  AS `期望值`
UNION ALL SELECT '权限总数',       (SELECT COUNT(*) FROM `permissions`),      109
UNION ALL SELECT '顶级菜单数',     (SELECT COUNT(*) FROM `permissions` WHERE `parentId` IS NULL), 8
UNION ALL SELECT '菜单权限数',     (SELECT COUNT(*) FROM `permissions` WHERE `type` = 'menu'),   30
UNION ALL SELECT '按钮权限数',     (SELECT COUNT(*) FROM `permissions` WHERE `type` = 'button'), 79
UNION ALL SELECT '孤儿按钮（应为0）', (SELECT COUNT(*) FROM `permissions` WHERE `type` = 'button' AND `parentId` IS NULL), 0
UNION ALL SELECT '角色数',         (SELECT COUNT(*) FROM `roles`),             3
UNION ALL SELECT '角色权限关联数', (SELECT COUNT(*) FROM `role_permissions`),  150
UNION ALL SELECT '管理员权限数',   (SELECT COUNT(*) FROM `role_permissions` `rp` JOIN `roles` `r` ON `r`.`id` = `rp`.`roleId` WHERE `r`.`code` = 'system:admin'), 109
UNION ALL SELECT '操作员权限数',   (SELECT COUNT(*) FROM `role_permissions` `rp` JOIN `roles` `r` ON `r`.`id` = `rp`.`roleId` WHERE `r`.`code` = 'production:operator'), 18
UNION ALL SELECT '只读用户权限数', (SELECT COUNT(*) FROM `role_permissions` `rp` JOIN `roles` `r` ON `r`.`id` = `rp`.`roleId` WHERE `r`.`code` = 'viewer'), 23
UNION ALL SELECT '用户数',         (SELECT COUNT(*) FROM `users`),             2
UNION ALL SELECT '用户角色关联数', (SELECT COUNT(*) FROM `user_roles`),        2
UNION ALL SELECT '车间数',         (SELECT COUNT(*) FROM `workshops`),         1
UNION ALL SELECT '设备数',         (SELECT COUNT(*) FROM `equipment`),         5
UNION ALL SELECT '业务表空表数',   (
  (SELECT COUNT(*) FROM `work_orders`) + (SELECT COUNT(*) FROM `production_reports`)
  + (SELECT COUNT(*) FROM `work_order_status_logs`) + (SELECT COUNT(*) FROM `production_schedules`)
  + (SELECT COUNT(*) FROM `equipment_status_logs`) + (SELECT COUNT(*) FROM `maintenance_plans`)
  + (SELECT COUNT(*) FROM `maintenance_records`) + (SELECT COUNT(*) FROM `breakdown_records`)
  + (SELECT COUNT(*) FROM `quality_inspections`) + (SELECT COUNT(*) FROM `inspection_items`)
  + (SELECT COUNT(*) FROM `defect_records`) + (SELECT COUNT(*) FROM `materials`)
  + (SELECT COUNT(*) FROM `boms`) + (SELECT COUNT(*) FROM `bom_items`)
  + (SELECT COUNT(*) FROM `inventory`) + (SELECT COUNT(*) FROM `inventory_transactions`)
  + (SELECT COUNT(*) FROM `material_batches`) + (SELECT COUNT(*) FROM `shifts`)
  + (SELECT COUNT(*) FROM `personnel_schedules`) + (SELECT COUNT(*) FROM `work_hours_records`)
), 0;

-- 9.1 查看全部表清单与中文注释
SELECT `TABLE_NAME` AS `表名`, `TABLE_COMMENT` AS `表说明`, `TABLE_ROWS` AS `参考行数`
FROM `information_schema`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_TYPE` = 'BASE TABLE'
ORDER BY `TABLE_NAME`;

-- 9.2 查看权限树（前两级）
SELECT `p`.`id`, `p`.`name` AS `权限名称`, `p`.`code` AS `权限编码`, `p`.`type` AS `类型`,
       `pp`.`code` AS `父级编码`, `p`.`path` AS `路由`, `p`.`sort` AS `排序`
FROM `permissions` AS `p`
LEFT JOIN `permissions` AS `pp` ON `pp`.`id` = `p`.`parentId`
ORDER BY `p`.`id`;

-- =============================================================================
-- 初始化脚本结束
-- =============================================================================
