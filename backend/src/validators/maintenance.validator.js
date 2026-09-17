/**
 * MES 系统 - 设备维保 Zod 校验 Schema【T07 新增】
 * 校验：维保计划创建/更新/查询、到期提醒查询、维保记录创建/更新/查询
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500；
 * dueQuerySchema.days 空串兜底为默认 7
 */

const { z } = require('zod');
const {
  emptyToUndefined,
  optionalQueryEnum,
  optionalQueryId,
  paginationQuery,
} = require('../utils/zod-helpers');

/** 维保周期类型五档枚举 */
const CYCLE_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

/** 维保类型枚举 */
const MAINTENANCE_TYPES = ['preventive', 'corrective', 'emergency'];

/** 维保计划状态枚举 */
const PLAN_STATUSES = ['active', 'inactive'];

/**
 * 可空 ID 预处理：null / '' / undefined → null，否则转数字
 * （前端「临时保养」会把 planId 传 null，maintainerId 可为空）
 */
const nullableId = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : Number(v)),
  z
    .number({ invalid_type_error: '必须为数字' })
    .int('必须为整数')
    .positive('必须为正整数')
    .nullable(),
);

/**
 * 可空日期预处理：null / '' / undefined → null，否则转 Date
 * （z.coerce.date() 会把 null 转成 epoch，必须先行短路）
 */
const nullableDate = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.coerce.date().nullable(),
);

/** ID 路由参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID 必须为正整数'),
});

/** 创建维保计划 Schema */
const createPlanSchema = z.object({
  equipmentId: z.coerce
    .number({ required_error: '设备不能为空' })
    .int()
    .positive('设备不能为空'),
  planName: z
    .string({ required_error: '计划名称不能为空' })
    .min(1, '计划名称不能为空')
    .max(100, '计划名称最多 100 个字符'),
  cycleType: z.enum(CYCLE_TYPES, {
    required_error: '维保周期类型不能为空',
    invalid_type_error: '维保周期类型不合法',
  }),
  cycleDays: z.coerce.number().int().positive('周期天数必须为正整数').optional(),
  nextDate: z.coerce.date({ required_error: '下次维保日期不能为空' }),
  status: z.enum(PLAN_STATUSES).optional().default('active'),
});

/** 更新维保计划 Schema（部分字段） */
const updatePlanSchema = z.object({
  planName: z.string().min(1, '计划名称不能为空').max(100).optional(),
  cycleType: z.enum(CYCLE_TYPES).optional(),
  cycleDays: z.coerce.number().int().positive('周期天数必须为正整数').optional(),
  nextDate: z.coerce.date().optional(),
  status: z.enum(PLAN_STATUSES).optional(),
});

/** 维保计划分页查询 Schema */
const planQuerySchema = z.object({
  ...paginationQuery(),
  equipmentId: optionalQueryId(),
  status: optionalQueryEnum(PLAN_STATUSES),
  cycleType: optionalQueryEnum(CYCLE_TYPES),
});

/** 到期提醒查询 Schema（提前天数 1~90，默认 7；空串/null 视为未传取默认） */
const dueQuerySchema = z.object({
  days: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(90).default(7),
  ),
});

/** 维保记录分页查询 Schema */
const recordQuerySchema = z.object({
  ...paginationQuery(),
  equipmentId: optionalQueryId(),
  maintenanceType: optionalQueryEnum(MAINTENANCE_TYPES),
  planId: optionalQueryId(),
});

/** 登记维保记录 Schema（planId 可选：为空即临时保养，只记录不顺延） */
const createRecordSchema = z
  .object({
    planId: nullableId.optional(),
    equipmentId: z.coerce
      .number({ required_error: '设备不能为空' })
      .int()
      .positive('设备不能为空'),
    maintenanceType: z.enum(MAINTENANCE_TYPES, {
      required_error: '维保类型不能为空',
      invalid_type_error: '维保类型不合法',
    }),
    maintainerId: nullableId.optional(),
    startTime: z.coerce.date({ required_error: '维保开始时间不能为空' }),
    endTime: nullableDate.optional(),
    content: z.string().max(1000, '维保内容最多 1000 个字符').optional().default(''),
  })
  .superRefine((data, ctx) => {
    // 结束时间早于等于开始时间 → 拒绝
    if (data.endTime && data.startTime && data.endTime <= data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: '维保结束时间必须晚于开始时间',
      });
    }
  });

/** 更新维保记录 Schema（部分字段） */
const updateRecordSchema = z
  .object({
    maintenanceType: z.enum(MAINTENANCE_TYPES).optional(),
    maintainerId: nullableId.optional(),
    startTime: z.coerce.date().optional(),
    endTime: nullableDate.optional(),
    content: z.string().max(1000, '维保内容最多 1000 个字符').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endTime && data.startTime && data.endTime <= data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: '维保结束时间必须晚于开始时间',
      });
    }
  });

module.exports = {
  createPlanSchema,
  updatePlanSchema,
  planQuerySchema,
  dueQuerySchema,
  recordQuerySchema,
  createRecordSchema,
  updateRecordSchema,
  idParamSchema,
};
