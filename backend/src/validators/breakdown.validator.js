/**
 * MES 系统 - 设备故障维修 Zod 校验 Schema【T07 新增】
 * 校验：故障列表查询、报修、维修完成、故障记录更新、统计查询
 * 注意：repairedAt > occurredAt 的跨字段校验在 service 层执行（返回 400 业务错误）
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500
 */

const { z } = require('zod');
const {
  optionalQueryDate,
  optionalQueryEnum,
  optionalQueryId,
  paginationQuery,
} = require('../utils/zod-helpers');

/** ID 路由参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID 必须为正整数'),
});

/** 故障记录分页查询 Schema（status=pending 待维修 / repaired 已修复） */
const breakdownQuerySchema = z.object({
  ...paginationQuery(),
  equipmentId: optionalQueryId(),
  status: optionalQueryEnum(['pending', 'repaired']),
  startDate: optionalQueryDate(),
  endDate: optionalQueryDate(),
});

/** 故障统计查询 Schema */
const statisticsQuerySchema = z.object({
  startDate: optionalQueryDate(),
  endDate: optionalQueryDate(),
  equipmentId: optionalQueryId(),
});

/** 故障报修 Schema */
const createBreakdownSchema = z.object({
  equipmentId: z.coerce
    .number({ required_error: '设备不能为空' })
    .int()
    .positive('设备不能为空'),
  faultType: z
    .string({ required_error: '故障类型不能为空' })
    .min(1, '故障类型不能为空')
    .max(50, '故障类型最多 50 个字符'),
  faultDescription: z
    .string()
    .max(500, '故障描述最多 500 个字符')
    .optional()
    .default(''),
  occurredAt: z.coerce.date({ required_error: '故障发生时间不能为空' }),
});

/** 维修完成 Schema（downtimeDuration 服务端计算，禁止前端传入） */
const repairBreakdownSchema = z.object({
  repairerId: z.coerce
    .number({ required_error: '维修人员不能为空' })
    .int()
    .positive('维修人员不能为空'),
  repairMethod: z
    .string({ required_error: '维修方法不能为空' })
    .min(1, '维修方法不能为空')
    .max(500, '维修方法最多 500 个字符'),
  repairedAt: z.coerce.date({ required_error: '修复时间不能为空' }),
});

/** 更新故障记录 Schema（部分字段；repairedAt / downtimeDuration 不允许直接编辑） */
const updateBreakdownSchema = z.object({
  faultType: z.string().min(1, '故障类型不能为空').max(50).optional(),
  faultDescription: z.string().max(500, '故障描述最多 500 个字符').optional(),
  occurredAt: z.coerce.date().optional(),
  repairerId: z.coerce.number().int().positive().optional(),
  repairMethod: z.string().max(500, '维修方法最多 500 个字符').optional(),
});

module.exports = {
  idParamSchema,
  breakdownQuerySchema,
  statisticsQuerySchema,
  createBreakdownSchema,
  repairBreakdownSchema,
  updateBreakdownSchema,
};
