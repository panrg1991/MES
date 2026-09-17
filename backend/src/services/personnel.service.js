/**
 * MES 系统 - 人员管理服务层（P1-09 排班 + P1-10 工时，T08 实现）
 *
 * 关键业务口径（架构文档 §8.6）：
 *  ① 班次时间格式 'HH:mm'，开始 == 结束 → 400；endTime < startTime 表示跨夜班次
 *  ② 排班唯一性：同 userId + scheduleDate + shiftId 重复 → 409
 *     （Service 校验 + DB 唯一约束兜底，Prisma P2002 错误转换为 409）
 *  ③ scheduleDate 口径：前端传 'YYYY-MM-DD'，后端存当日 00:00:00 本地时区
 *  ④ 工时 hours 服务端计算：endTime <= startTime 视为跨夜（+24h）；endTime 为空 → hours = 0
 *  ⑤ 汇总维度（user/shift/date/workOrder）中 userId / shiftId 为空的记录归入「未指定」分组，不得丢弃
 *  ⑥ 排班归属 scheduleDate 当天，跨夜班次不跨日拆分
 */

const { prisma } = require('../config/database');

/** 排班列表关联查询 */
const SCHEDULE_INCLUDE = {
  user: { select: { id: true, name: true, department: true } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true } },
};

/** 工时列表关联查询 */
const WORKHOURS_INCLUDE = {
  user: { select: { id: true, name: true, department: true } },
  workOrder: { select: { id: true, orderNo: true, productName: true, completedQty: true } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true } },
};

/**
 * 构造业务异常（带 HTTP 状态码）
 * @param {string} message - 错误信息
 * @param {number} statusCode - HTTP 状态码
 * @returns {Error}
 */
function createBusinessError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * 判断 Prisma 唯一约束冲突错误（P2002）
 * @param {Error} error
 * @returns {boolean}
 */
function isUniqueConstraintError(error) {
  return error && error.code === 'P2002';
}

/**
 * 将 'YYYY-MM-DD' 解析为本地时区当日 00:00:00
 * 避免使用 ISO UTC 午夜导致时区偏移一天（架构文档 A3 项口径）
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Date}
 */
function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * 灵活解析日期时间字符串（兼容 ISO 'YYYY-MM-DDTHH:mm' 与 'YYYY-MM-DD HH:mm'）
 * @param {string} value
 * @returns {Date}
 */
function parseDateTime(value) {
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
  return new Date(normalized);
}

/**
 * 四舍五入保留 2 位小数
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 计算工时（小时）
 * 口径：endTime 为空 → 0；endTime <= startTime → 跨夜（+24h）；保留 2 位小数
 * @param {Date} startTime
 * @param {Date|null} endTime
 * @returns {number}
 */
function computeHours(startTime, endTime) {
  if (!endTime) {
    return 0;
  }
  let diffMs = endTime.getTime() - startTime.getTime();
  if (diffMs <= 0) {
    diffMs += 24 * 60 * 60 * 1000; // 跨夜：+24h
  }
  return round2(diffMs / (60 * 60 * 1000));
}

// ==================== 班次（P1-09） ====================

/**
 * 班次列表（按开始时间升序）
 * @returns {Promise<{list: Array}>}
 */
async function getShifts() {
  const list = await prisma.shift.findMany({
    orderBy: { startTime: 'asc' },
  });
  return { list };
}

/**
 * 创建班次
 * @param {object} data - { name, startTime, endTime, description? }
 * @returns {Promise<object>}
 */
async function createShift(data) {
  const { name, startTime, endTime, description } = data;
  return prisma.shift.create({
    data: { name, startTime, endTime, description: description || '' },
  });
}

/**
 * 更新班次
 * @param {number} id - 班次 ID
 * @param {object} data - 部分字段 { name?, startTime?, endTime?, description? }
 * @returns {Promise<object>}
 */
async function updateShift(id, data) {
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('班次不存在', 404);
  }

  // 合并后校验开始 != 结束（校验层校验单个请求体，这里兜底合并场景）
  const startTime = data.startTime || existing.startTime;
  const endTime = data.endTime || existing.endTime;
  if (startTime === endTime) {
    throw createBusinessError('班次开始时间与结束时间不能相同', 400);
  }

  return prisma.shift.update({ where: { id }, data });
}

/**
 * 删除班次（有排班/工时引用时由外键 Cascade 处理，此处允许直接删除）
 * @param {number} id - 班次 ID
 * @returns {Promise<void>}
 */
async function deleteShift(id) {
  // 仅判断存在性，无需带出关联计数（关联数据的级联由数据库外键处理）
  const existing = await prisma.shift.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw createBusinessError('班次不存在', 404);
  }
  await prisma.shift.delete({ where: { id } });
}

// ==================== 排班（P1-09） ====================

/**
 * 校验排班引用的用户与班次存在
 * @param {number} userId
 * @param {number} shiftId
 */
async function ensureUserAndShiftExist(userId, shiftId) {
  const [user, shift] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.shift.findUnique({ where: { id: shiftId } }),
  ]);
  if (!user) {
    throw createBusinessError('用户不存在', 404);
  }
  if (!shift) {
    throw createBusinessError('班次不存在', 404);
  }
}

/**
 * 排班列表（分页）
 * @param {object} query - { page, pageSize, userId?, shiftId?, startDate?, endDate? }
 * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
 */
async function getSchedules(query) {
  const { page, pageSize, userId, shiftId, startDate, endDate } = query;

  const where = {};
  if (userId) {
    where.userId = userId;
  }
  if (shiftId) {
    where.shiftId = shiftId;
  }
  if (startDate || endDate) {
    where.scheduleDate = {};
    if (startDate) {
      // [startDate 当日 00:00, endDate 当日次日 00:00) 区间
      where.scheduleDate.gte = parseLocalDate(startDate);
    }
    if (endDate) {
      const endExclusive = parseLocalDate(endDate);
      endExclusive.setDate(endExclusive.getDate() + 1);
      where.scheduleDate.lt = endExclusive;
    }
  }

  const [list, total] = await Promise.all([
    prisma.personnelSchedule.findMany({
      where,
      include: SCHEDULE_INCLUDE,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ scheduleDate: 'desc' }, { shiftId: 'asc' }],
    }),
    prisma.personnelSchedule.count({ where }),
  ]);

  return { list, total, page, pageSize };
}

/**
 * 排班日历矩阵（按日期分组，供日历渲染）
 * @param {object} query - { startDate, endDate, userId?, shiftId? }
 * @returns {Promise<{matrix: Array<{date: string, items: Array}>}>}
 */
async function getScheduleCalendar(query) {
  const { startDate, endDate, userId, shiftId } = query;

  const where = {
    scheduleDate: {
      gte: parseLocalDate(startDate),
      // endDate 含当日（取次日 00:00 为开区间上界）
      lt: (() => {
        const endExclusive = parseLocalDate(endDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return endExclusive;
      })(),
    },
  };
  if (userId) {
    where.userId = userId;
  }
  if (shiftId) {
    where.shiftId = shiftId;
  }

  const records = await prisma.personnelSchedule.findMany({
    where,
    include: SCHEDULE_INCLUDE,
    orderBy: { scheduleDate: 'asc' },
  });

  // 按本地日期分组（YYYY-MM-DD），跨夜班次同样归属排班日当天
  const grouped = new Map();
  for (const record of records) {
    const dateKey = `${record.scheduleDate.getFullYear()}-${String(
      record.scheduleDate.getMonth() + 1,
    ).padStart(2, '0')}-${String(record.scheduleDate.getDate()).padStart(2, '0')}`;

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey).push({
      id: record.id,
      userId: record.userId,
      userName: record.user?.name || `用户#${record.userId}`,
      shiftId: record.shiftId,
      shiftName: record.shift?.name || `班次#${record.shiftId}`,
      shiftTimeRange: record.shift
        ? `${record.shift.startTime}-${record.shift.endTime}`
        : '',
      workStation: record.workStation,
    });
  }

  const matrix = Array.from(grouped.entries())
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return { matrix };
}

/**
 * 新增排班（同人 + 同日 + 同班次重复 → 409）
 * @param {object} data - { userId, shiftId, workStation?, scheduleDate, remark? }
 * @returns {Promise<object>}
 */
async function createSchedule(data) {
  const { userId, shiftId, workStation, scheduleDate, remark } = data;
  const scheduleDateLocal = parseLocalDate(scheduleDate);

  await ensureUserAndShiftExist(userId, shiftId);

  try {
    return await prisma.personnelSchedule.create({
      data: {
        userId,
        shiftId,
        workStation: workStation || '',
        scheduleDate: scheduleDateLocal,
        remark: remark || '',
      },
      include: SCHEDULE_INCLUDE,
    });
  } catch (error) {
    // DB 唯一约束兜底（并发窗口）：P2002 → 409
    if (isUniqueConstraintError(error)) {
      throw createBusinessError('该人员在当日同班次已存在排班，请勿重复排班', 409);
    }
    throw error;
  }
}

/**
 * 换班 / 调班（部分字段更新；修改后若与他人记录冲突 → 409）
 * @param {number} id - 排班 ID
 * @param {object} data - { userId?, shiftId?, workStation?, scheduleDate?, remark? }
 * @returns {Promise<object>}
 */
async function updateSchedule(id, data) {
  const existing = await prisma.personnelSchedule.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('排班记录不存在', 404);
  }

  const userId = data.userId || existing.userId;
  const shiftId = data.shiftId || existing.shiftId;
  const scheduleDate = data.scheduleDate
    ? parseLocalDate(data.scheduleDate)
    : existing.scheduleDate;

  await ensureUserAndShiftExist(userId, shiftId);

  // Service 层冲突预检（排除自身）
  const duplicate = await prisma.personnelSchedule.findFirst({
    where: {
      userId,
      shiftId,
      scheduleDate,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw createBusinessError('该人员在当日同班次已存在排班，无法调整', 409);
  }

  try {
    return await prisma.personnelSchedule.update({
      where: { id },
      data: {
        userId,
        shiftId,
        workStation: data.workStation !== undefined ? data.workStation : undefined,
        scheduleDate,
        remark: data.remark !== undefined ? data.remark : undefined,
      },
      include: SCHEDULE_INCLUDE,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw createBusinessError('该人员在当日同班次已存在排班，无法调整', 409);
    }
    throw error;
  }
}

/**
 * 删除排班
 * @param {number} id - 排班 ID
 * @returns {Promise<void>}
 */
async function deleteSchedule(id) {
  const existing = await prisma.personnelSchedule.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('排班记录不存在', 404);
  }
  await prisma.personnelSchedule.delete({ where: { id } });
}

// ==================== 工时（P1-10） ====================

/**
 * 工时列表（分页）
 * @param {object} query - { page, pageSize, userId?, workOrderId?, shiftId?, startDate?, endDate? }
 * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
 */
async function getWorkHours(query) {
  const { page, pageSize, userId, workOrderId, shiftId, startDate, endDate } = query;

  const where = {};
  if (userId) {
    where.userId = userId;
  }
  if (workOrderId) {
    where.workOrderId = workOrderId;
  }
  if (shiftId) {
    where.shiftId = shiftId;
  }
  if (startDate || endDate) {
    where.workDate = {};
    if (startDate) {
      where.workDate.gte = parseLocalDate(startDate);
    }
    if (endDate) {
      const endExclusive = parseLocalDate(endDate);
      endExclusive.setDate(endExclusive.getDate() + 1);
      where.workDate.lt = endExclusive;
    }
  }

  const [list, total] = await Promise.all([
    prisma.workHoursRecord.findMany({
      where,
      include: WORKHOURS_INCLUDE,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ workDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.workHoursRecord.count({ where }),
  ]);

  return { list, total, page, pageSize };
}

/**
 * 录入工时（hours 服务端自动计算，禁止前端传入防篡改）
 * @param {object} data - { userId?, workOrderId, shiftId?, workDate, startTime, endTime? }
 * @returns {Promise<object>}
 */
async function createWorkHours(data) {
  const { userId, workOrderId, shiftId, workDate, startTime, endTime } = data;

  // 前置存在性校验
  const [user, workOrder, shift] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId } }) : Promise.resolve(null),
    prisma.workOrder.findUnique({ where: { id: workOrderId } }),
    shiftId ? prisma.shift.findUnique({ where: { id: shiftId } }) : Promise.resolve(null),
  ]);
  if (userId && !user) {
    throw createBusinessError('用户不存在', 404);
  }
  if (!workOrder) {
    throw createBusinessError('工单不存在', 404);
  }
  if (shiftId && !shift) {
    throw createBusinessError('班次不存在', 404);
  }

  const startTimeDate = parseDateTime(startTime);
  const endTimeDate = endTime ? parseDateTime(endTime) : null;
  const hours = computeHours(startTimeDate, endTimeDate);

  return prisma.workHoursRecord.create({
    data: {
      userId: userId || null,
      workOrderId,
      shiftId: shiftId || null,
      workDate: parseLocalDate(workDate),
      startTime: startTimeDate,
      endTime: endTimeDate,
      hours,
    },
    include: WORKHOURS_INCLUDE,
  });
}

/**
 * 更新工时（startTime / endTime 变化时重新计算 hours）
 * @param {number} id - 工时记录 ID
 * @param {object} data - { userId?, workOrderId?, shiftId?, workDate?, startTime?, endTime? }
 * @returns {Promise<object>}
 */
async function updateWorkHours(id, data) {
  const existing = await prisma.workHoursRecord.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('工时记录不存在', 404);
  }

  const startTime = data.startTime ? parseDateTime(data.startTime) : existing.startTime;
  // endTime 传 null（清空）表示进行中 → hours 置 0
  const endTime =
    data.endTime === undefined
      ? existing.endTime
      : data.endTime
        ? parseDateTime(data.endTime)
        : null;
  const hours = computeHours(startTime, endTime);

  return prisma.workHoursRecord.update({
    where: { id },
    data: {
      userId: data.userId !== undefined ? data.userId || null : undefined,
      workOrderId: data.workOrderId !== undefined ? data.workOrderId : undefined,
      shiftId: data.shiftId !== undefined ? data.shiftId || null : undefined,
      workDate: data.workDate ? parseLocalDate(data.workDate) : undefined,
      startTime,
      endTime,
      hours,
    },
    include: WORKHOURS_INCLUDE,
  });
}

/**
 * 删除工时记录
 * @param {number} id - 工时记录 ID
 * @returns {Promise<void>}
 */
async function deleteWorkHours(id) {
  const existing = await prisma.workHoursRecord.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('工时记录不存在', 404);
  }
  await prisma.workHoursRecord.delete({ where: { id } });
}

/**
 * 工时汇总（多维度：按人 user / 按班次 shift / 按日期 date / 按工单 workOrder）
 * userId / shiftId 为空的记录归入「未指定」分组，不得丢弃
 * @param {object} query - { startDate?, endDate?, dimension }
 * @returns {Promise<{list: Array, totalHours: number, recordCount: number}>}
 */
async function getWorkHoursSummary(query) {
  const { startDate, endDate, dimension } = query;

  const where = {};
  if (startDate || endDate) {
    where.workDate = {};
    if (startDate) {
      where.workDate.gte = parseLocalDate(startDate);
    }
    if (endDate) {
      const endExclusive = parseLocalDate(endDate);
      endExclusive.setDate(endExclusive.getDate() + 1);
      where.workDate.lt = endExclusive;
    }
  }

  const records = await prisma.workHoursRecord.findMany({
    where,
    include: WORKHOURS_INCLUDE,
    orderBy: { workDate: 'asc' },
  });

  /** 汇总分组容器 */
  const groups = new Map();

  for (const record of records) {
    let key = '';
    let name = '';
    switch (dimension) {
      case 'user':
        key = record.userId === null ? 'unspecified' : `user-${record.userId}`;
        name = record.user?.name || '未指定人员';
        break;
      case 'shift':
        key = record.shiftId === null ? 'unspecified' : `shift-${record.shiftId}`;
        name = record.shift?.name || '未指定班次';
        break;
      case 'date': {
        const d = record.workDate;
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
        name = key;
        break;
      }
      case 'workOrder':
      default:
        key = `wo-${record.workOrderId}`;
        name = record.workOrder?.orderNo || `工单#${record.workOrderId}`;
        break;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        dimensionKey: key,
        dimensionName: name,
        totalHours: 0,
        recordCount: 0,
        userIds: new Set(),
        workOrderIds: new Set(),
        dates: new Set(),
        totalOutput: 0, // 工单维度按组内最新 completedQty 口径：累计组内记录对应工单产量（工单维度直接取工单值）
        completedQty: 0,
      });
    }
    const group = groups.get(key);
    // hours 为 Decimal 字段，Prisma 返回 Decimal 对象，参与算术前需转为 number
    group.totalHours = round2(group.totalHours + Number(record.hours));
    group.recordCount += 1;
    if (record.userId !== null) {
      group.userIds.add(record.userId);
    }
    group.workOrderIds.add(record.workOrderId);
    group.dates.add(record.workDate.toDateString());
    if (dimension === 'workOrder') {
      // 工单维度：产量取该工单的 completedQty（同工单记录只计一次）
      group.completedQty = record.workOrder?.completedQty || 0;
    } else {
      group.completedQty += record.workOrder?.completedQty || 0;
    }
  }

  const list = Array.from(groups.values()).map((group) => {
    const row = {
      dimensionKey: group.dimensionKey,
      dimensionName: group.dimensionName,
      totalHours: group.totalHours,
      recordCount: group.recordCount,
    };
    if (dimension === 'user') {
      row.workOrderCount = group.workOrderIds.size;
      row.avgHoursPerDay = group.dates.size > 0 ? round2(group.totalHours / group.dates.size) : 0;
    }
    if (dimension === 'shift') {
      row.avgHoursPerRecord =
        group.recordCount > 0 ? round2(group.totalHours / group.recordCount) : 0;
      row.userCount = group.userIds.size;
    }
    if (dimension === 'workOrder') {
      row.hoursPerUnit = group.completedQty > 0 ? round2(group.totalHours / group.completedQty) : null;
    }
    return row;
  });

  // 按总工时倒序排列（排行优先展示工时最多的分组）
  list.sort((a, b) => b.totalHours - a.totalHours);

  const totalHours = round2(records.reduce((sum, r) => sum + Number(r.hours), 0));
  return { list, totalHours, recordCount: records.length };
}

module.exports = {
  // 班次
  getShifts,
  createShift,
  updateShift,
  deleteShift,
  // 排班
  getSchedules,
  getScheduleCalendar,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  // 工时
  getWorkHours,
  createWorkHours,
  updateWorkHours,
  deleteWorkHours,
  getWorkHoursSummary,
};
