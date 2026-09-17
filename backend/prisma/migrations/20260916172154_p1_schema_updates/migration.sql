-- =====================================================
-- MES 系统 P1 增量迁移：Schema 微调（5 处）
-- 生成方式：npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
-- 说明：均为「加列 / 加约束 / 加索引」，无新表。SQLite 加唯一约束需重建表，Prisma 自动处理。
-- ① MaintenanceRecord.planId  Int -> Int?（可选），relation onDelete Cascade -> SetNull，并补 createdAt/updatedAt
-- ② PersonnelSchedule  新增 @@unique([userId, scheduleDate, shiftId])
-- ③ ProductionSchedule  补 createdAt/updatedAt + @@index([equipmentId, plannedStart, plannedEnd])
-- ④ BreakdownRecord  补 createdAt/updatedAt + @@index([equipmentId, occurredAt])
-- ⑤ InventoryTransaction  新增 @@index([batchNo])
-- =====================================================

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_breakdown_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equipmentId" INTEGER NOT NULL,
    "faultType" TEXT NOT NULL,
    "faultDescription" TEXT NOT NULL DEFAULT '',
    "occurredAt" DATETIME NOT NULL,
    "repairedAt" DATETIME,
    "repairerId" INTEGER,
    "repairMethod" TEXT NOT NULL DEFAULT '',
    "downtimeDuration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "breakdown_records_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "breakdown_records_repairerId_fkey" FOREIGN KEY ("repairerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_breakdown_records" ("downtimeDuration", "equipmentId", "faultDescription", "faultType", "id", "occurredAt", "repairMethod", "repairedAt", "repairerId") SELECT "downtimeDuration", "equipmentId", "faultDescription", "faultType", "id", "occurredAt", "repairMethod", "repairedAt", "repairerId" FROM "breakdown_records";
DROP TABLE "breakdown_records";
ALTER TABLE "new_breakdown_records" RENAME TO "breakdown_records";
CREATE INDEX "breakdown_records_equipmentId_occurredAt_idx" ON "breakdown_records"("equipmentId", "occurredAt");
CREATE TABLE "new_maintenance_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER,
    "equipmentId" INTEGER NOT NULL,
    "maintenanceType" TEXT NOT NULL,
    "maintainerId" INTEGER,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maintenance_records_planId_fkey" FOREIGN KEY ("planId") REFERENCES "maintenance_plans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "maintenance_records_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "maintenance_records_maintainerId_fkey" FOREIGN KEY ("maintainerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_maintenance_records" ("content", "endTime", "equipmentId", "id", "maintainerId", "maintenanceType", "planId", "startTime") SELECT "content", "endTime", "equipmentId", "id", "maintainerId", "maintenanceType", "planId", "startTime" FROM "maintenance_records";
DROP TABLE "maintenance_records";
ALTER TABLE "new_maintenance_records" RENAME TO "maintenance_records";
CREATE TABLE "new_production_schedules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workOrderId" INTEGER NOT NULL,
    "equipmentId" INTEGER,
    "plannedStart" DATETIME NOT NULL,
    "plannedEnd" DATETIME NOT NULL,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "production_schedules_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "production_schedules_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_production_schedules" ("actualEnd", "actualStart", "equipmentId", "id", "plannedEnd", "plannedStart", "status", "workOrderId") SELECT "actualEnd", "actualStart", "equipmentId", "id", "plannedEnd", "plannedStart", "status", "workOrderId" FROM "production_schedules";
DROP TABLE "production_schedules";
ALTER TABLE "new_production_schedules" RENAME TO "production_schedules";
CREATE INDEX "production_schedules_equipmentId_plannedStart_plannedEnd_idx" ON "production_schedules"("equipmentId", "plannedStart", "plannedEnd");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "inventory_transactions_batchNo_idx" ON "inventory_transactions"("batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_schedules_userId_scheduleDate_shiftId_key" ON "personnel_schedules"("userId", "scheduleDate", "shiftId");
