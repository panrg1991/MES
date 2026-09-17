/**
 * MES 系统 - 生产排程 Zod 校验 Schema（T08）
 * 校验：排程查询、创建、调整、状态流转、冲突检测查询
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传）；
 * create/update 的 equipmentId 补 .nullable()（null=未指定设备，与甘特「未指定设备」分组一致）
 */

const { z } = require('zod');
const {
  optionalQueryDate,
  optionalQueryEnum,
  optionalQueryId,
} = require('../utils/zod-helpers');

/** 排程状态枚举 */
const SCHEDULE_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

/** 排程列表查询 Schema（时间窗 + 设备/状态/工单过滤；全部可选字段空值安全） */
const scheduleQuerySchema = z.object({
  startDate: optionalQueryDate(),
  endDate: optionalQueryDate(),
  equipmentId: optionalQueryId(),
  status: optionalQueryEnum(SCHEDULE_STATUSES),
  workOrderId: optionalQueryId(),
});

/** 冲突检测查询 Schema（equipmentId 为冲突检测的必要条件，必填） */
const conflictQuerySchema = z.object({
  equipmentId: z.coerce.number({ required_error: '设备 ID 不能为空' }).int().positive(),
  plannedStart: z.coerce.date({ required_error: '计划开始时间不能为空' }),
  plannedEnd: z.coerce.date({ required_error: '计划结束时间不能为空' }),
  excludeId: z.coerce.number().int().positive().optional(),
});

/** 创建排程 Schema */
const createScheduleSchema = z
  .object({
    workOrderId: z.number({ required_error: '工单 ID 不能为空' }).int().positive(),
    // 可空外键：null = 未指定设备（排程可先建后指派设备）
    equipmentId: z.number().int().positive().nullable().optional(),
    plannedStart: z.coerce.date({ required_error: '计划开始时间不能为空' }),
    plannedEnd: z.coerce.date({ required_error: '计划结束时间不能为空' }),
  })
  .refine((data) => data.plannedEnd > data.plannedStart, {
    message: '计划结束时间必须晚于计划开始时间',
    path: ['plannedEnd'],
  });

/** 调整排程 Schema（部分字段可选，拖拽提交场景；equipmentId 可传 null 表示移除设备） */
const updateScheduleSchema = z
  .object({
    plannedStart: z.coerce.date().optional(),
    plannedEnd: z.coerce.date().optional(),
    equipmentId: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (data) =>
      data.plannedStart === undefined ||
      data.plannedEnd === undefined ||
      data.plannedEnd > data.plannedStart,
    { message: '计划结束时间必须晚于计划开始时间', path: ['plannedEnd'] },
  );

/** 排程状态流转 Schema */
const updateScheduleStatusSchema = z.object({
  status: z.enum(SCHEDULE_STATUSES, {
    required_error: '目标状态不能为空',
  }),
});

/** ID 参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  scheduleQuerySchema,
  conflictQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  updateScheduleStatusSchema,
  idParamSchema,
};
