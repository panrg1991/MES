/**
 * MES 系统 - 设备管理 Zod 校验 Schema
 * 校验：创建设备、更新设备、设备查询、状态切换
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500
 */

const { z } = require('zod');
const {
  optionalQueryEnum,
  optionalQueryString,
  paginationQuery,
} = require('../utils/zod-helpers');

/** 创建设备 Schema */
const createEquipmentSchema = z.object({
  code: z
    .string({ required_error: '设备编码不能为空' })
    .min(1, '设备编码不能为空')
    .max(50, '设备编码最多 50 个字符'),
  name: z
    .string({ required_error: '设备名称不能为空' })
    .min(1, '设备名称不能为空')
    .max(100, '设备名称最多 100 个字符'),
  type: z
    .string({ required_error: '设备类型不能为空' })
    .min(1, '设备类型不能为空')
    .max(50, '设备类型最多 50 个字符'),
  location: z
    .string({ required_error: '设备位置不能为空' })
    .min(1, '设备位置不能为空')
    .max(100, '设备位置最多 100 个字符'),
  workshopId: z.number().int().positive().optional(),
  manufacturer: z.string().max(100, '制造商最多 100 个字符').optional().default(''),
  model: z.string().max(100, '设备型号最多 100 个字符').optional().default(''),
  purchaseDate: z.coerce.date().optional(),
  remark: z.string().max(500, '备注最多 500 个字符').optional().default(''),
});

/** 更新设备 Schema */
const updateEquipmentSchema = z.object({
  name: z.string().min(1, '设备名称不能为空').max(100).optional(),
  type: z.string().min(1, '设备类型不能为空').max(50).optional(),
  location: z.string().min(1, '设备位置不能为空').max(50).optional(),
  workshopId: z.number().int().positive().optional(),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  purchaseDate: z.coerce.date().optional(),
  remark: z.string().max(500).optional(),
});

/** 设备分页查询 Schema */
const equipmentQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  status: optionalQueryEnum(['running', 'idle', 'stopped', 'fault']),
  type: optionalQueryString(),
});

/** 设备状态切换 Schema */
const changeStatusSchema = z.object({
  newStatus: z.enum(
    ['running', 'idle', 'stopped', 'fault'],
    { required_error: '目标状态不能为空' },
  ),
  remark: z.string().max(500, '备注最多 500 个字符').optional().default(''),
});

/** ID 参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createEquipmentSchema,
  updateEquipmentSchema,
  equipmentQuerySchema,
  changeStatusSchema,
  idParamSchema,
};
