/**
 * MES 系统 - 角色权限 Zod 校验 Schema
 * 校验：创建角色、更新角色、分页查询、权限分配
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500
 */

const { z } = require('zod');
const {
  optionalQueryString,
  paginationQuery,
} = require('../utils/zod-helpers');

/** 创建角色 Schema */
const createRoleSchema = z.object({
  name: z
    .string({ required_error: '角色名称不能为空' })
    .min(1, '角色名称不能为空')
    .max(50, '角色名称最多 50 个字符'),
  code: z
    .string({ required_error: '角色编码不能为空' })
    .min(1, '角色编码不能为空')
    .max(50, '角色编码最多 50 个字符'),
  description: z
    .string()
    .max(200, '描述最多 200 个字符')
    .optional()
    .default(''),
});

/** 更新角色 Schema */
const updateRoleSchema = z.object({
  name: z.string().min(1, '角色名称不能为空').max(50, '角色名称最多 50 个字符').optional(),
  description: z.string().max(200, '描述最多 200 个字符').optional(),
  status: z.boolean().optional(),
});

/** 角色分页查询 Schema */
const roleQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
});

/** 权限分配 Schema */
const assignPermissionsSchema = z.object({
  permissionIds: z
    .array(z.number().int().positive())
    .refine((arr) => arr.length > 0, {
      message: '至少选择一个权限',
    }),
});

/** ID 参数 Schema（复用用户模块的，但独立定义避免循环依赖） */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createRoleSchema,
  updateRoleSchema,
  roleQuerySchema,
  assignPermissionsSchema,
  idParamSchema,
};
