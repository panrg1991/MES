/**
 * MES 系统 - 质量管理 Zod 校验 Schema
 * 校验：创建检验记录、检验查询、不良品创建、不良品处理、不良品查询
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），
 * pageSize 上限放宽至 500；createDefectSchema.equipmentId 补 .nullable()（null=未指定设备）
 */

const { z } = require('zod');
const {
  optionalQueryEnum,
  optionalQueryId,
  optionalQueryString,
  paginationQuery,
} = require('../utils/zod-helpers');

/** 检验项明细 Schema（嵌套在创建检验中） */
const inspectionItemSchema = z.object({
  itemName: z
    .string({ required_error: '检验项名称不能为空' })
    .min(1, '检验项名称不能为空')
    .max(100, '检验项名称最多 100 个字符'),
  standardValue: z
    .string({ required_error: '标准值不能为空' })
    .max(100, '标准值最多 100 个字符'),
  actualValue: z
    .string({ required_error: '实测值不能为空' })
    .max(100, '实测值最多 100 个字符'),
  unit: z.string().max(50, '计量单位最多 50 个字符').optional().default(''),
  result: z
    .enum(['pass', 'fail', 'concession'], {
      required_error: '检验结果不能为空',
    }),
  remark: z
    .string()
    .max(500, '备注最多 500 个字符')
    .optional()
    .default(''),
});

/** 创建检验记录 Schema */
const createInspectionSchema = z.object({
  workOrderId: z
    .number({ required_error: '工单 ID 不能为空' })
    .int('工单 ID 必须为整数')
    .positive('工单 ID 必须大于 0'),
  inspectionType: z
    .enum(['first_article', 'process', 'final'], {
      required_error: '检验类型不能为空',
    }),
  remark: z
    .string()
    .max(500, '备注最多 500 个字符')
    .optional()
    .default(''),
  items: z
    .array(inspectionItemSchema)
    .min(1, '至少添加一个检验项'),
});

/** 检验记录分页查询 Schema */
const inspectionQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  result: optionalQueryEnum(['pass', 'fail', 'concession']),
  inspectionType: optionalQueryEnum(['first_article', 'process', 'final']),
  workOrderId: optionalQueryId(),
});

/** 创建不良品记录 Schema */
const createDefectSchema = z.object({
  workOrderId: z
    .number({ required_error: '工单 ID 不能为空' })
    .int('工单 ID 必须为整数')
    .positive('工单 ID 必须大于 0'),
  // 可空外键：null = 未指定设备（前端「不良设备」可清空提交）
  equipmentId: z.number().int().positive().nullable().optional(),
  defectType: z
    .string({ required_error: '不良类型不能为空' })
    .min(1, '不良类型不能为空')
    .max(100, '不良类型最多 100 个字符'),
  defectReason: z
    .string()
    .max(500, '不良原因最多 500 个字符')
    .optional()
    .default(''),
  quantity: z
    .number({ required_error: '不良数量不能为空' })
    .int('不良数量必须为整数')
    .min(1, '不良数量必须大于 0'),
  remark: z
    .string()
    .max(500, '备注最多 500 个字符')
    .optional()
    .default(''),
});

/** 处理不良品 Schema（更新处理方式） */
const updateDefectSchema = z.object({
  handlingMethod: z
    .enum(['rework', 'scrap', 'concession'])
    .optional(),
  remark: z.string().max(500).optional(),
});

/** 不良品分页查询 Schema */
const defectQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  defectType: optionalQueryString(),
  handlingMethod: optionalQueryEnum(['rework', 'scrap', 'concession']),
  workOrderId: optionalQueryId(),
});

/** ID 参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createInspectionSchema,
  inspectionQuerySchema,
  createDefectSchema,
  updateDefectSchema,
  defectQuerySchema,
  idParamSchema,
};
