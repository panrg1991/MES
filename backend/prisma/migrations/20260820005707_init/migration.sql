-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "roles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" INTEGER,
    "path" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "permissions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "permissions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "roleId"),
    CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workshops" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNo" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "completedQty" INTEGER NOT NULL DEFAULT 0,
    "defectQty" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "workshopId" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "planStart" DATETIME,
    "planEnd" DATETIME,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "work_orders_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "production_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workOrderId" INTEGER NOT NULL,
    "completedQty" INTEGER NOT NULL,
    "defectQty" INTEGER NOT NULL DEFAULT 0,
    "operatorId" INTEGER,
    "reportTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "production_reports_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "production_reports_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "work_order_status_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workOrderId" INTEGER NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "operatorId" INTEGER,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "work_order_status_logs_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "work_order_status_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "production_schedules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workOrderId" INTEGER NOT NULL,
    "equipmentId" INTEGER,
    "plannedStart" DATETIME NOT NULL,
    "plannedEnd" DATETIME NOT NULL,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'planned',
    CONSTRAINT "production_schedules_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "production_schedules_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "workshopId" INTEGER,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purchaseDate" DATETIME,
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "equipment_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "equipment_status_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equipmentId" INTEGER NOT NULL,
    "oldStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "changedById" INTEGER,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "equipment_status_logs_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "equipment_status_logs_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equipmentId" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "cycleType" TEXT NOT NULL,
    "cycleDays" INTEGER NOT NULL,
    "nextDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maintenance_plans_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "equipmentId" INTEGER NOT NULL,
    "maintenanceType" TEXT NOT NULL,
    "maintainerId" INTEGER,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "content" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "maintenance_records_planId_fkey" FOREIGN KEY ("planId") REFERENCES "maintenance_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "maintenance_records_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "maintenance_records_maintainerId_fkey" FOREIGN KEY ("maintainerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "breakdown_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equipmentId" INTEGER NOT NULL,
    "faultType" TEXT NOT NULL,
    "faultDescription" TEXT NOT NULL DEFAULT '',
    "occurredAt" DATETIME NOT NULL,
    "repairedAt" DATETIME,
    "repairerId" INTEGER,
    "repairMethod" TEXT NOT NULL DEFAULT '',
    "downtimeDuration" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "breakdown_records_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "breakdown_records_repairerId_fkey" FOREIGN KEY ("repairerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "quality_inspections" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workOrderId" INTEGER NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "inspectorId" INTEGER,
    "inspectionTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "quality_inspections_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quality_inspections_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inspection_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inspectionId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "standardValue" TEXT NOT NULL,
    "actualValue" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "inspection_items_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "quality_inspections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "defect_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workOrderId" INTEGER NOT NULL,
    "equipmentId" INTEGER,
    "defectType" TEXT NOT NULL,
    "defectReason" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "handlingMethod" TEXT,
    "handledBy" INTEGER,
    "handledAt" DATETIME,
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "defect_records_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "defect_records_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "defect_records_handledBy_fkey" FOREIGN KEY ("handledBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "materials" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "boms" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bom_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bomId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "bom_items_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bom_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialId" INTEGER NOT NULL,
    "warehouse" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "safetyStock" REAL NOT NULL DEFAULT 0,
    "maxStock" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialId" INTEGER NOT NULL,
    "transactionType" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "batchNo" TEXT NOT NULL,
    "operatorId" INTEGER,
    "transactionTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedOrder" TEXT NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "inventory_transactions_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_transactions_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "material_batches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "receivedDate" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "material_batches_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "personnel_schedules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "workStation" TEXT NOT NULL,
    "scheduleDate" DATETIME NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "personnel_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "personnel_schedules_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "work_hours_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "workOrderId" INTEGER NOT NULL,
    "shiftId" INTEGER,
    "workDate" DATETIME NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "hours" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "work_hours_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "work_hours_records_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "work_hours_records_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workshops_code_key" ON "workshops"("code");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_orderNo_key" ON "work_orders"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_code_key" ON "equipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_materialId_key" ON "inventory"("materialId");
