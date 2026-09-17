/**
 * MES 系统 - 质量追溯服务层【T09 实现】
 * 功能：工单维度 6 段链路追溯（P1-04）+ 批次维度反查追溯 + 公共物料链路构造（P1-07 复用）
 *
 * 关键业务口径（架构文档 §8.3，必须遵循）：
 *  ① 批次关联为**字符串关联**（无外键）：
 *     MaterialBatch.batchNo ↔ InventoryTransaction.batchNo
 *     InventoryTransaction.relatedOrder ↔ WorkOrder.orderNo
 *  ② buildMaterialChain(orderNoList) 为 P1-04 与 P1-07 **共用的公共函数**，禁止两处各写一套
 *  ③ 组装使用 Promise.all 并行查询（6~8 条），单次响应目标 < 500ms
 *  ④ 空数据友好：各段返回空数组（前端显示「暂无记录」），不抛异常
 */

const { prisma } = require('../config/database');

// ==================== 内部工具 ====================

/**
 * 构造带状态码的业务异常
 * @param {string} message - 错误信息
 * @param {number} statusCode - HTTP 状态码
 * @returns {Error} 带 statusCode 的业务异常
 */
function bizError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * DateTime → 本地日期字符串 YYYY-MM-DD（工时与报工按本地日期配对，避免 UTC 偏移）
 * @param {Date} date - 日期对象
 * @returns {string} YYYY-MM-DD
 */
function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ==================== 公共物料链路（P1-04 / P1-07 共用） ====================

/**
 * 公共物料链路构造函数（P1-04 追溯页与 P1-07 物料追溯共用）
 * 按工单号列表查询出入库流水（字符串关联 relatedOrder ↔ orderNo），
 * 再经 batchNo 关联 MaterialBatch 补全供应商/入库日期（批次未建档时给出占位信息）。
 * @param {string[]} orderNoList - 工单号列表
 * @returns {Promise<Record<string, Array>>} 以工单号为键的物料链路映射
 *   每项：{ batchNo, materialCode, materialName, supplier, receivedDate, quantity,
 *           transactionType, quantityUsed, relatedOrder }
 */
async function buildMaterialChain(orderNoList) {
  const validOrders = (orderNoList || []).filter(
    (no) => typeof no === 'string' && no.trim() !== '',
  );
  if (validOrders.length === 0) {
    return {};
  }

  // ① 查询关联到这些工单的全部出入库流水（relatedOrder 为字符串关联字段，已建索引）
  const transactions = await prisma.inventoryTransaction.findMany({
    where: { relatedOrder: { in: validOrders } },
    include: {
      material: {
        select: { id: true, code: true, name: true, specification: true, unit: true },
      },
    },
    orderBy: { transactionTime: 'asc' },
  });

  // ② 按批次号（字符串精确匹配）关联批次档案，补全供应商与入库日期
  const batchNos = [...new Set(transactions.map((tx) => tx.batchNo))];
  const batches =
    batchNos.length > 0
      ? await prisma.materialBatch.findMany({
          where: { batchNo: { in: batchNos } },
        })
      : [];
  const batchMap = new Map(batches.map((b) => [b.batchNo, b]));

  // ③ 按工单号分组组装链路
  const chainMap = {};
  for (const orderNo of validOrders) {
    chainMap[orderNo] = [];
  }
  for (const tx of transactions) {
    const batch = batchMap.get(tx.batchNo) || null;
    const list = chainMap[tx.relatedOrder];
    if (!list) {
      continue; // relatedOrder 不在查询列表内（理论上不会发生），防御性跳过
    }
    list.push({
      batchNo: tx.batchNo,
      materialCode: tx.material?.code || '-',
      materialName: tx.material?.name || '-',
      supplier: batch?.supplier || '批次未建档',
      receivedDate: batch?.receivedDate || null,
      // 批次档案数量（入库时的批次量）
      quantity: batch ? Number(batch.quantity) : 0,
      transactionType: tx.transactionType,
      quantityUsed: Number(tx.quantity),
      relatedOrder: tx.relatedOrder,
    });
  }

  return chainMap;
}

// ==================== 工单维度追溯（P1-04） ====================

/**
 * 工单维度追溯链路（6 段：物料来源 / 生产执行 / 设备与排程 / 检验 / 不良 / 工单）
 * 使用 Promise.all 并行 6 条查询，避免 N+1。
 * @param {string} orderNo - 工单号
 * @returns {Promise<object>} { workOrder, materialChain, executionChain, equipmentChain, qualityChain, defectChain }
 * @throws {Error} 工单不存在（404）
 */
async function buildWorkOrderChain(orderNo) {
  // 工单主记录（不存在则 404，避免空白页）
  const workOrder = await prisma.workOrder.findFirst({
    where: { orderNo },
  });
  if (!workOrder) {
    throw bizError(`未找到工单：${orderNo}`, 404);
  }

  // Promise.all 并行 6 段链路查询
  const [
    materialChainMap,
    reports,
    workHours,
    schedules,
    inspections,
    defects,
  ] = await Promise.all([
    buildMaterialChain([orderNo]),
    // 生产执行段：报工记录 + 操作员
    prisma.productionReport.findMany({
      where: { workOrderId: workOrder.id },
      include: {
        operator: { select: { id: true, name: true, department: true } },
      },
      orderBy: { reportTime: 'asc' },
    }),
    // 生产执行段：工时记录（与报工按 操作员+本地日期 配对）
    prisma.workHoursRecord.findMany({
      where: { workOrderId: workOrder.id },
      include: { shift: { select: { id: true, name: true } } },
      orderBy: { workDate: 'asc' },
    }),
    // 设备与排程段
    prisma.productionSchedule.findMany({
      where: { workOrderId: workOrder.id },
      include: { equipment: { select: { id: true, code: true, name: true } } },
      orderBy: { plannedStart: 'asc' },
    }),
    // 检验段（含检验项明细）
    prisma.qualityInspection.findMany({
      where: { workOrderId: workOrder.id },
      include: {
        inspector: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { inspectionTime: 'asc' },
    }),
    // 不良品段
    prisma.defectRecord.findMany({
      where: { workOrderId: workOrder.id },
      include: {
        equipment: { select: { id: true, code: true, name: true } },
        handler: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // ---- 设备与排程段：补充排程时段内的故障记录 ----
  const equipmentIds = [
    ...new Set(
      schedules
        .map((s) => s.equipmentId)
        .filter((id) => typeof id === 'number'),
    ),
  ];
  const breakdowns =
    equipmentIds.length > 0
      ? await prisma.breakdownRecord.findMany({
          where: { equipmentId: { in: equipmentIds } },
          orderBy: { occurredAt: 'asc' },
        })
      : [];

  const equipmentChain = schedules.map((schedule) => {
    // 只关联落在该排程时段内的故障（无排程时间边界时展示全部该设备故障）
    const related = breakdowns.filter((b) => {
      if (b.equipmentId !== schedule.equipmentId) return false;
      if (!schedule.plannedStart || !schedule.plannedEnd) return true;
      return (
        b.occurredAt >= schedule.plannedStart && b.occurredAt <= schedule.plannedEnd
      );
    });
    return {
      equipmentId: schedule.equipmentId,
      equipmentCode: schedule.equipment?.code || '-',
      equipmentName: schedule.equipment?.name || '-',
      plannedStart: schedule.plannedStart,
      plannedEnd: schedule.plannedEnd,
      actualStart: schedule.actualStart,
      actualEnd: schedule.actualEnd,
      breakdown: related.map((b) => ({
        occurredAt: b.occurredAt,
        faultType: b.faultType,
        faultDescription: b.faultDescription,
        repairedAt: b.repairedAt,
        downtimeDuration: b.downtimeDuration,
      })),
    };
  });

  // ---- 生产执行段：报工 + 工时配对（操作员 + 本地日期 匹配，配对成功的工时记录消耗掉）----
  const hoursPool = workHours.map((w) => ({
    userId: w.userId,
    date: toLocalDateString(w.workDate),
    hours: Number(w.hours),
    shiftName: w.shift?.name || '-',
  }));

  const executionChain = reports.map((report) => {
    const reportDate = toLocalDateString(report.reportTime);
    const matchedIdx = hoursPool.findIndex(
      (w) =>
        (w.userId ?? null) === (report.operatorId ?? null) &&
        w.date === reportDate,
    );
    let hours = 0;
    let shiftName = '-';
    let workDate = reportDate;
    if (matchedIdx >= 0) {
      const matched = hoursPool[matchedIdx];
      hoursPool.splice(matchedIdx, 1); // 消耗已配对记录，避免重复计入
      hours = matched.hours;
      shiftName = matched.shiftName;
      workDate = matched.date;
    }
    return {
      reportTime: report.reportTime,
      completedQty: report.completedQty,
      defectQty: report.defectQty,
      operatorName: report.operator?.name || '未记录操作员',
      workDate,
      hours,
      shiftName,
    };
  });

  // ---- 检验段 ----
  const qualityChain = inspections.map((inspection) => ({
    inspectionType: inspection.inspectionType,
    inspectionTime: inspection.inspectionTime,
    inspectorName: inspection.inspector?.name || '未记录检验员',
    result: inspection.result,
    items: (inspection.items || []).map((item) => ({
      itemName: item.itemName,
      standardValue: item.standardValue,
      actualValue: item.actualValue,
      unit: item.unit,
      result: item.result,
    })),
  }));

  // ---- 不良品段 ----
  const defectChain = defects.map((defect) => ({
    defectType: defect.defectType,
    defectReason: defect.defectReason,
    quantity: defect.quantity,
    handlingMethod: defect.handlingMethod,
    handledByName: defect.handler?.name || '未处理',
    handledAt: defect.handledAt,
    equipmentCode: defect.equipment?.code || '-',
  }));

  return {
    workOrder: {
      id: workOrder.id,
      orderNo: workOrder.orderNo,
      productName: workOrder.productName,
      quantity: workOrder.quantity,
      completedQty: workOrder.completedQty,
      defectQty: workOrder.defectQty,
      status: workOrder.status,
      planStart: workOrder.planStart,
      planEnd: workOrder.planEnd,
      actualStart: workOrder.actualStart,
      actualEnd: workOrder.actualEnd,
    },
    materialChain: materialChainMap[orderNo] || [],
    executionChain,
    equipmentChain,
    qualityChain,
    defectChain,
  };
}

// ==================== 批次维度追溯（P1-04） ====================

/**
 * 批次维度追溯（反查领用该批次的工单列表后逐单组装链路）
 * 口径：InventoryTransaction.batchNo 精确匹配 + transactionType='out' + relatedOrder 非空，
 *      relatedOrder ↔ WorkOrder.orderNo 字符串关联。
 * @param {string} batchNo - 批次号
 * @returns {Promise<{entries: Array}>} entries 为多工单链路数组（无领用记录但批次已建档时为空数组）
 * @throws {Error} 批次不存在且无出入库记录（404）
 */
async function buildBatchEntries(batchNo) {
  // 反查该批次的全部领用（out）流水
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      batchNo,
      transactionType: 'out',
      relatedOrder: { not: '' },
    },
    orderBy: { transactionTime: 'asc' },
  });

  const orderNos = [...new Set(transactions.map((tx) => tx.relatedOrder))];

  if (orderNos.length === 0) {
    // 区分「批次已建档但无领用」与「批次完全不存在」两种提示
    const batchExists = await prisma.materialBatch.findFirst({
      where: { batchNo },
    });
    if (!batchExists) {
      throw bizError('未找到该批次，或该批次尚未发生出入库', 404);
    }
    return { entries: [] };
  }

  // 逐工单并行组装链路
  const entries = await Promise.all(
    orderNos.map((orderNo) => buildWorkOrderChain(orderNo)),
  );

  return { entries };
}

module.exports = {
  buildWorkOrderChain,
  buildBatchEntries,
  buildMaterialChain,
};
