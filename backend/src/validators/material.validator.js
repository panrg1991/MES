/**
 * MES 系统 - 物料管理 Zod 校验 Schema
 * 校验：物料 CRUD、BOM CRUD、库存查询、出入库事务
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500
 */

const { z } = require('zod');
const {
  optionalQueryEnum,
  optionalQueryId,
  optionalQueryString,
  paginationQuery,
} = require('../utils/zod-helpers');

/** 创建物料 Schema */
const createMaterialSchema = z.object({
  code: z
    .string({ required_error: '物料编码不能为空' })
    .min(1, '物料编码不能为空')
    .max(50, '物料编码最多 50 个字符'),
  name: z
    .string({ required_error: '物料名称不能为空' })
    .min(1, '物料名称不能为空')
    .max(100, '物料名称最多 100 个字符'),
  specification: z
    .string({ required_error: '规格不能为空' })
    .min(1, '规格不能为空')
    .max(200, '规格最多 200 个字符'),
  unit: z
    .string({ required_error: '计量单位不能为空' })
    .min(1, '计量单位不能为空')
    .max(20, '计量单位最多 20 个字符'),
  category: z
    .string({ required_error: '物料分类不能为空' })
    .min(1, '物料分类不能为空')
    .max(50, '物料分类最多 50 个字符'),
  type: z.enum(['raw', 'semi', 'finished'], {
    required_error: '物料类型不能为空',
  }),
  description: z
    .string()
    .max(500, '描述最多 500 个字符')
    .optional()
    .default(''),
});

/** 更新物料 Schema */
const updateMaterialSchema = z.object({
  name: z.string().min(1, '物料名称不能为空').max(100).optional(),
  specification: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(20).optional(),
  category: z.string().min(1).max(50).optional(),
  type: z.enum(['raw', 'semi', 'finished']).optional(),
  description: z.string().max(500).optional(),
});

/** 物料分页查询 Schema */
const materialQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  type: optionalQueryEnum(['raw', 'semi', 'finished']),
  category: optionalQueryString(),
});

/** BOM 明细项 Schema（嵌套在创建 BOM 中） */
const bomItemSchema = z.object({
  materialId: z
    .number({ required_error: '物料 ID 不能为空' })
    .int('物料 ID 必须为整数')
    .positive('物料 ID 必须大于 0'),
  quantity: z
    .number({ required_error: '用量不能为空' })
    .positive('用量必须大于 0'),
  unit: z
    .string({ required_error: '计量单位不能为空' })
    .min(1, '计量单位不能为空')
    .max(20, '计量单位最多 20 个字符'),
  remark: z
    .string()
    .max(500, '备注最多 500 个字符')
    .optional()
    .default(''),
});

/** 创建 BOM Schema */
const createBOMSchema = z.object({
  productCode: z
    .string({ required_error: '产品编码不能为空' })
    .min(1, '产品编码不能为空')
    .max(100, '产品编码最多 100 个字符'),
  productName: z
    .string({ required_error: '产品名称不能为空' })
    .min(1, '产品名称不能为空')
    .max(200, '产品名称最多 200 个字符'),
  version: z
    .string({ required_error: '版本不能为空' })
    .min(1, '版本不能为空')
    .max(20, '版本最多 20 个字符'),
  remark: z
    .string()
    .max(500, '备注最多 500 个字符')
    .optional()
    .default(''),
  items: z
    .array(bomItemSchema)
    .min(1, '至少添加一个 BOM 明细项'),
});

/** 更新 BOM Schema */
const updateBOMSchema = z.object({
  productName: z.string().min(1).max(200).optional(),
  version: z.string().min(1).max(20).optional(),
  status: z.boolean().optional(),
  remark: z.string().max(500).optional(),
  items: z.array(bomItemSchema).optional(),
});

/** BOM 分页查询 Schema */
const bomQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
});

/** 创建出入库事务 Schema */
const createTransactionSchema = z.object({
  materialId: z
    .number({ required_error: '物料 ID 不能为空' })
    .int('物料 ID 必须为整数')
    .positive('物料 ID 必须大于 0'),
  transactionType: z.enum(['in', 'out'], {
    required_error: '出入库类型不能为空',
  }),
  quantity: z
    .number({ required_error: '数量不能为空' })
    .positive('数量必须大于 0'),
  batchNo: z
    .string({ required_error: '批次号不能为空' })
    .min(1, '批次号不能为空')
    .max(50, '批次号最多 50 个字符'),
  relatedOrder: z
    .string()
    .max(100, '关联单据最多 100 个字符')
    .optional()
    .default(''),
  remark: z
    .string()
    .max(500, '备注最多 500 个字符')
    .optional()
    .default(''),
});

/** 库存分页查询 Schema（P1 扩展 I8：warning=true 只看预警） */
const inventoryQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  // 字符串布尔（'true'/'false'），Controller 层判断 === 'true'；空串/null 视为未传
  warning: optionalQueryEnum(['true', 'false']),
});

/** 库存预警查询 Schema（P1-08） */
const inventoryWarningQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  level: optionalQueryEnum(['critical', 'warning']),
});

/** 创建批次 Schema（P1-07） */
const createBatchSchema = z.object({
  materialId: z
    .number({ required_error: '物料 ID 不能为空' })
    .int('物料 ID 必须为整数')
    .positive('物料 ID 必须大于 0'),
  batchNo: z
    .string({ required_error: '批次号不能为空' })
    .min(1, '批次号不能为空')
    .max(50, '批次号最多 50 个字符'),
  supplier: z
    .string({ required_error: '供应商不能为空' })
    .min(1, '供应商不能为空')
    .max(100, '供应商最多 100 个字符'),
  receivedDate: z.coerce.date({
    required_error: '入库日期不能为空',
    invalid_type_error: '入库日期格式不正确',
  }),
  quantity: z
    .number({ required_error: '批次数量不能为空' })
    .nonnegative('批次数量不能为负数'),
  status: z.enum(['active', 'consumed', 'expired']).optional().default('active'),
});

/** 更新批次 Schema（P1-07，materialId 建档后不允许变更） */
const updateBatchSchema = z.object({
  batchNo: z.string().min(1, '批次号不能为空').max(50).optional(),
  supplier: z.string().min(1, '供应商不能为空').max(100).optional(),
  receivedDate: z.coerce.date().optional(),
  quantity: z.number().nonnegative('批次数量不能为负数').optional(),
  status: z.enum(['active', 'consumed', 'expired']).optional(),
});

/** 批次分页查询 Schema（P1-07） */
const batchQuerySchema = z.object({
  ...paginationQuery(),
  materialId: optionalQueryId(),
  batchNo: optionalQueryString(),
  supplier: optionalQueryString(),
  status: optionalQueryEnum(['active', 'consumed', 'expired']),
});

/** 正向追溯查询 Schema（批次号必填，P1-07） */
const batchNoQuerySchema = z.object({
  batchNo: z
    .string({ required_error: '批次号不能为空' })
    .min(1, '批次号不能为空')
    .max(100, '批次号最多 100 个字符'),
});

/** 反向追溯查询 Schema（工单号必填，P1-07） */
const workOrderNoQuerySchema = z.object({
  workOrderNo: z
    .string({ required_error: '工单号不能为空' })
    .min(1, '工单号不能为空')
    .max(100, '工单号最多 100 个字符'),
});

/** ID 参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createMaterialSchema,
  updateMaterialSchema,
  materialQuerySchema,
  createBOMSchema,
  updateBOMSchema,
  bomQuerySchema,
  createTransactionSchema,
  inventoryQuerySchema,
  inventoryWarningQuerySchema,
  createBatchSchema,
  updateBatchSchema,
  batchQuerySchema,
  batchNoQuerySchema,
  workOrderNoQuerySchema,
  idParamSchema,
};
