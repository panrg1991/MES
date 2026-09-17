/**
 * MES 系统 - 生产管理 Zod 校验 Schema
 * 校验：创建工单、更新工单、工单查询、状态流转、报工录入
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500
 */

const { z } = require('zod');
const {
  optionalQueryEnum,
  optionalQueryString,
  paginationQuery,
} = require('../utils/zod-helpers');

/** 创建工单 Schema */
const createWorkOrderSchema = z.object({
  productName: z
    .string({ required_error: '产品名称不能为空' })
    .min(1, '产品名称不能为空')
    .max(200, '产品名称最多 200 个字符'),
  productCode: z
    .string({ required_error: '产品编码不能为空' })
    .min(1, '产品编码不能为空')
    .max(100, '产品编码最多 100 个字符'),
  quantity: z
    .number({ required_error: '计划数量不能为空' })
    .int('计划数量必须为整数')
    .positive('计划数量必须大于 0'),
  workshopId: z.number().int().positive().optional(),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .optional()
    .default('medium'),
  planStart: z.coerce.date().optional(),
  planEnd: z.coerce.date().optional(),
  remark: z.string().max(500, '备注最多 500 个字符').optional().default(''),
});

/** 更新工单 Schema */
const updateWorkOrderSchema = z.object({
  productName: z.string().min(1, '产品名称不能为空').max(200).optional(),
  productCode: z.string().min(1, '产品编码不能为空').max(100).optional(),
  quantity: z.number().int().positive('计划数量必须大于 0').optional(),
  workshopId: z.number().int().positive().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  planStart: z.coerce.date().optional(),
  planEnd: z.coerce.date().optional(),
  remark: z.string().max(500).optional(),
});

/** 工单分页查询 Schema */
const workOrderQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  status: optionalQueryEnum(['pending', 'in_progress', 'paused', 'completed', 'closed']),
  priority: optionalQueryEnum(['low', 'medium', 'high', 'urgent']),
});

/** 状态流转 Schema */
const transitionStatusSchema = z.object({
  toStatus: z.enum(
    ['pending', 'in_progress', 'paused', 'completed', 'closed'],
    { required_error: '目标状态不能为空' },
  ),
  remark: z.string().max(500, '备注最多 500 个字符').optional().default(''),
});

/** 报工录入 Schema */
const createReportSchema = z.object({
  completedQty: z
    .number({ required_error: '完成数量不能为空' })
    .int('完成数量必须为整数')
    .min(0, '完成数量不能为负数'),
  defectQty: z
    .number()
    .int('不良数量必须为整数')
    .min(0, '不良数量不能为负数')
    .optional()
    .default(0),
  remark: z.string().max(500, '备注最多 500 个字符').optional().default(''),
});

/** ID 参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderQuerySchema,
  transitionStatusSchema,
  createReportSchema,
  idParamSchema,
};
