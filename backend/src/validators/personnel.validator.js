/**
 * MES 系统 - 人员管理 Zod 校验 Schema（P1-09 排班 + P1-10 工时，T08）
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500；
 * createWorkHoursSchema 的 userId/shiftId/endTime 补 .nullable()（null=未指定 / 进行中）
 */

const { z } = require('zod');
const {
  emptyToUndefined,
  optionalQueryId,
  paginationQuery,
} = require('../utils/zod-helpers');

/** HH:mm 时间格式 */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
/** YYYY-MM-DD 日期格式 */
const YYYYMMDD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** 日期时间字符串（兼容 ISO 'YYYY-MM-DDTHH:mm' 与 'YYYY-MM-DD HH:mm'） */
const dateTimeString = z
  .string({ required_error: '时间不能为空' })
  .min(1, '时间不能为空')
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, '时间格式应为 YYYY-MM-DD HH:mm');

/** 可选日期字符串查询参数（YYYY-MM-DD，空串/null 视为未传） */
const optionalQueryDateString = () =>
  z.preprocess(
    emptyToUndefined,
    z.string().regex(YYYYMMDD_REGEX, '日期格式应为 YYYY-MM-DD').optional(),
  );

// ==================== 班次（P1-09） ====================

/** 班次基础字段（startTime != endTime，允许跨夜如 22:00-06:00） */
const shiftTimeRefine = (data) => data.startTime !== data.endTime;

/** 创建班次 Schema */
const createShiftSchema = z
  .object({
    name: z
      .string({ required_error: '班次名称不能为空' })
      .min(1, '班次名称不能为空')
      .max(50, '班次名称最多 50 个字符'),
    startTime: z
      .string({ required_error: '开始时间不能为空' })
      .regex(HHMM_REGEX, '开始时间格式应为 HH:mm'),
    endTime: z
      .string({ required_error: '结束时间不能为空' })
      .regex(HHMM_REGEX, '结束时间格式应为 HH:mm'),
    description: z.string().max(200, '描述最多 200 个字符').optional().default(''),
  })
  .refine(shiftTimeRefine, {
    message: '班次开始时间与结束时间不能相同',
    path: ['endTime'],
  });

/** 更新班次 Schema（部分字段；合并后由 Service 兜底校验开始 != 结束） */
const updateShiftSchema = z
  .object({
    name: z.string().min(1, '班次名称不能为空').max(50).optional(),
    startTime: z.string().regex(HHMM_REGEX, '开始时间格式应为 HH:mm').optional(),
    endTime: z.string().regex(HHMM_REGEX, '结束时间格式应为 HH:mm').optional(),
    description: z.string().max(200).optional(),
  })
  .refine(
    (data) => !(data.startTime !== undefined && data.endTime !== undefined && data.startTime === data.endTime),
    { message: '班次开始时间与结束时间不能相同', path: ['endTime'] },
  );

// ==================== 排班（P1-09） ====================

/** 排班列表查询 Schema */
const scheduleQuerySchema = z.object({
  ...paginationQuery(),
  userId: optionalQueryId(),
  shiftId: optionalQueryId(),
  startDate: optionalQueryDateString(),
  endDate: optionalQueryDateString(),
});

/** 排班日历查询 Schema（日期必填） */
const calendarQuerySchema = z.object({
  startDate: z.string({ required_error: '开始日期不能为空' }).regex(YYYYMMDD_REGEX, '日期格式应为 YYYY-MM-DD'),
  endDate: z.string({ required_error: '结束日期不能为空' }).regex(YYYYMMDD_REGEX, '日期格式应为 YYYY-MM-DD'),
  userId: optionalQueryId(),
  shiftId: optionalQueryId(),
});

/** 新增排班 Schema */
const createScheduleSchema = z.object({
  userId: z.number({ required_error: '人员不能为空' }).int().positive(),
  shiftId: z.number({ required_error: '班次不能为空' }).int().positive(),
  workStation: z.string().max(50, '工位最多 50 个字符').optional().default(''),
  scheduleDate: z
    .string({ required_error: '排班日期不能为空' })
    .regex(YYYYMMDD_REGEX, '排班日期格式应为 YYYY-MM-DD'),
  remark: z.string().max(500, '备注最多 500 个字符').optional().default(''),
});

/** 换班 / 调班 Schema（部分字段可选） */
const updateScheduleSchema = z.object({
  userId: z.number().int().positive().optional(),
  shiftId: z.number().int().positive().optional(),
  workStation: z.string().max(50).optional(),
  scheduleDate: z.string().regex(YYYYMMDD_REGEX, '排班日期格式应为 YYYY-MM-DD').optional(),
  remark: z.string().max(500).optional(),
});

// ==================== 工时（P1-10） ====================

/** 工时列表查询 Schema */
const workHoursQuerySchema = z.object({
  ...paginationQuery(),
  userId: optionalQueryId(),
  workOrderId: optionalQueryId(),
  shiftId: optionalQueryId(),
  startDate: optionalQueryDateString(),
  endDate: optionalQueryDateString(),
});

/** 工时汇总查询 Schema（dimension 默认 user，空串/null 视为未传取默认） */
const workHoursSummaryQuerySchema = z.object({
  startDate: optionalQueryDateString(),
  endDate: optionalQueryDateString(),
  dimension: z.preprocess(
    emptyToUndefined,
    z.enum(['user', 'shift', 'date', 'workOrder'], {
      required_error: '汇总维度不能为空',
    }).default('user'),
  ),
});

/**
 * 录入工时 Schema（hours 服务端计算，不接受前端传入）
 * userId / shiftId 可传 null = 未指定；endTime 可传 null = 进行中（hours = 0）
 */
const createWorkHoursSchema = z
  .object({
    userId: z.number().int().positive().nullable().optional(),
    workOrderId: z.number({ required_error: '工单不能为空' }).int().positive(),
    shiftId: z.number().int().positive().nullable().optional(),
    workDate: z
      .string({ required_error: '工作日期不能为空' })
      .regex(YYYYMMDD_REGEX, '工作日期格式应为 YYYY-MM-DD'),
    startTime: dateTimeString,
    endTime: dateTimeString.nullable().optional(),
  })
  .refine(
    (data) => !data.endTime || !data.startTime || data.startTime !== data.endTime,
    { message: '开始时间与结束时间不能相同', path: ['endTime'] },
  );

/** 更新工时 Schema（userId / shiftId / endTime 可传 null 清空） */
const updateWorkHoursSchema = z.object({
  userId: z.number().int().positive().nullable().optional(),
  workOrderId: z.number().int().positive().optional(),
  shiftId: z.number().int().positive().nullable().optional(),
  workDate: z.string().regex(YYYYMMDD_REGEX, '工作日期格式应为 YYYY-MM-DD').optional(),
  startTime: dateTimeString.optional(),
  endTime: dateTimeString.nullable().optional(),
});

/** ID 参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createShiftSchema,
  updateShiftSchema,
  scheduleQuerySchema,
  calendarQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  workHoursQuerySchema,
  workHoursSummaryQuerySchema,
  createWorkHoursSchema,
  updateWorkHoursSchema,
  idParamSchema,
};
