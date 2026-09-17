/**
 * MES 系统 - 数据看板聚合查询服务层
 * 功能：看板总览、工单进度、设备状态汇总、产量趋势、质量摘要
 * 聚合多张业务表数据，为前端看板提供实时统计指标
 */

const { prisma } = require('../config/database');
// 【T10 修改】低库存口径统一：调用 material.service.evaluateWarning（架构文档 §8.2）
const { evaluateWarning } = require('./material.service');

/**
 * 看板总览数据
 * 汇总：当前进行中工单数、设备状态分布、今日产量、不良率、低库存预警数
 * @returns {Promise<object>} { productionProgress, equipmentStatus, outputToday, defectRate, lowStockCount, maintenanceDueCount }
 */
async function getOverview() {
  // ==================== 当前进行中工单数 ====================
  const productionProgress = await prisma.workOrder.count({
    where: { status: 'in_progress' },
  });

  // ==================== 设备状态汇总 ====================
  const equipments = await prisma.equipment.findMany({
    select: { status: true },
  });

  const equipmentStatus = {
    running: 0,
    idle: 0,
    stopped: 0,
    fault: 0,
    total: equipments.length,
  };

  for (const eq of equipments) {
    if (equipmentStatus[eq.status] !== undefined) {
      equipmentStatus[eq.status]++;
    }
  }

  // ==================== 今日产量 + 不良率 ====================
  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const endOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  );

  const todayReports = await prisma.productionReport.findMany({
    where: {
      reportTime: { gte: startOfDay, lt: endOfDay },
    },
    select: { completedQty: true, defectQty: true },
  });

  const outputToday = todayReports.reduce(
    (sum, r) => sum + r.completedQty,
    0,
  );
  const defectToday = todayReports.reduce(
    (sum, r) => sum + r.defectQty,
    0,
  );
  const totalToday = outputToday + defectToday;
  const defectRate =
    totalToday > 0
      ? Math.round((defectToday / totalToday) * 1000) / 10
      : 0;

  // ==================== 低库存预警数 ====================
  // 【T10 修改】统一口径：直接复用 material.service.evaluateWarning（§8.2），
  // 与库存页 / 预警页同源，消除 P0 的 `quantity < safetyStock` 双口径（PRD 风险 R2 消解）
  const inventories = await prisma.inventory.findMany({
    select: { quantity: true, safetyStock: true },
  });
  const lowStockCount = inventories.filter(
    (inv) => evaluateWarning(inv).isLowStock,
  ).length;

  // ==================== 待维保数量（P1 新增 I7） ====================
  // 与维保到期提醒同口径：status=active 且 nextDate <= now + 7 天
  const now = new Date();
  const dueDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const maintenanceDueCount = await prisma.maintenancePlan.count({
    where: {
      status: 'active',
      nextDate: { lte: dueDeadline },
    },
  });

  return {
    productionProgress,
    equipmentStatus,
    outputToday,
    defectRate,
    lowStockCount,
    maintenanceDueCount,
  };
}

/**
 * 当前进行中工单进度列表
 * 返回所有 in_progress 状态工单的完成进度
 * @returns {Promise<{list: Array}>} { list: [{ orderNo, productName, completedQty, quantity, progress }] }
 */
async function getProductionProgress() {
  const orders = await prisma.workOrder.findMany({
    where: { status: 'in_progress' },
    select: {
      orderNo: true,
      productName: true,
      completedQty: true,
      quantity: true,
      priority: true,
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });

  const list = orders.map((order) => ({
    orderNo: order.orderNo,
    productName: order.productName,
    completedQty: order.completedQty,
    quantity: order.quantity,
    progress:
      order.quantity > 0
        ? Math.round((order.completedQty / order.quantity) * 1000) / 10
        : 0,
  }));

  return { list };
}

/**
 * 设备状态汇总（含设备详情列表）
 * @returns {Promise<object>} { running, idle, stopped, fault, total, details }
 */
async function getEquipmentStatus() {
  const equipments = await prisma.equipment.findMany({
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: 'asc' },
  });

  const summary = {
    running: 0,
    idle: 0,
    stopped: 0,
    fault: 0,
    total: equipments.length,
    details: equipments.map((eq) => ({
      id: eq.id,
      code: eq.code,
      name: eq.name,
      status: eq.status,
    })),
  };

  for (const eq of equipments) {
    if (summary[eq.status] !== undefined) {
      summary[eq.status]++;
    }
  }

  return summary;
}

/**
 * 近N天产量趋势
 * 按天聚合报工记录中的完成数量和不良数量
 * @param {number} days - 统计天数（默认 7）
 * @returns {Promise<object>} { dates: string[], outputs: number[], defects: number[] }
 */
async function getOutputTrend(days = 7) {
  const today = new Date();
  const startDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - days + 1,
  );
  const endDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  );

  // 查询时间范围内的所有报工记录
  const reports = await prisma.productionReport.findMany({
    where: {
      reportTime: { gte: startDate, lt: endDate },
    },
    select: { completedQty: true, defectQty: true, reportTime: true },
  });

  // 初始化日期数组和每日产量/不良数组
  const dates = [];
  const outputs = [];
  const defects = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + i,
    );
    const dateStr =
      `${date.getFullYear()}-` +
      `${String(date.getMonth() + 1).padStart(2, '0')}-` +
      `${String(date.getDate()).padStart(2, '0')}`;
    dates.push(dateStr);
    outputs.push(0);
    defects.push(0);
  }

  // 将报工记录按日期分组累加
  for (const report of reports) {
    const reportDate = new Date(report.reportTime);
    const dateStr =
      `${reportDate.getFullYear()}-` +
      `${String(reportDate.getMonth() + 1).padStart(2, '0')}-` +
      `${String(reportDate.getDate()).padStart(2, '0')}`;
    const index = dates.indexOf(dateStr);
    if (index !== -1) {
      outputs[index] += report.completedQty;
      defects[index] += report.defectQty;
    }
  }

  return { dates, outputs, defects };
}

/**
 * 质量摘要
 * 统计指定日期的总产量、不良数、不良率、合格率
 * @param {string} date - 日期字符串（YYYY-MM-DD），不传则默认今天
 * @returns {Promise<object>} { totalOutput, defectCount, defectRate, passRate }
 */
async function getQualitySummary(date) {
  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  const endOfDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate() + 1,
  );

  const reports = await prisma.productionReport.findMany({
    where: {
      reportTime: { gte: startOfDay, lt: endOfDay },
    },
    select: { completedQty: true, defectQty: true },
  });

  const totalOutput = reports.reduce(
    (sum, r) => sum + r.completedQty,
    0,
  );
  const defectCount = reports.reduce(
    (sum, r) => sum + r.defectQty,
    0,
  );
  const total = totalOutput + defectCount;
  const defectRate =
    total > 0
      ? Math.round((defectCount / total) * 1000) / 10
      : 0;
  const passRate =
    total > 0
      ? Math.round((totalOutput / total) * 1000) / 10
      : 0;

  return { totalOutput, defectCount, defectRate, passRate };
}

module.exports = {
  getOverview,
  getProductionProgress,
  getEquipmentStatus,
  getOutputTrend,
  getQualitySummary,
};
