/**
 * MES 系统 - 用户管理 Zod 校验 Schema
 * 校验：创建用户、更新用户、分页查询、状态切换、重置密码
 * 【P1 BugFix】可选 query 字段改用 zod-helpers（空串/null 视为未传），pageSize 上限放宽至 500
 */

const { z } = require('zod');
const {
  optionalQueryEnum,
  optionalQueryString,
  paginationQuery,
} = require('../utils/zod-helpers');

/** 创建用户 Schema */
const createUserSchema = z.object({
  username: z
    .string({ required_error: '用户名不能为空' })
    .min(2, '用户名至少 2 个字符')
    .max(50, '用户名最多 50 个字符'),
  name: z
    .string({ required_error: '姓名不能为空' })
    .min(1, '姓名不能为空')
    .max(50, '姓名最多 50 个字符'),
  department: z
    .string({ required_error: '部门不能为空' })
    .min(1, '部门不能为空')
    .max(100, '部门最多 100 个字符'),
  password: z
    .string({ required_error: '密码不能为空' })
    .min(6, '密码至少 6 个字符')
    .max(100, '密码最多 100 个字符'),
  roleIds: z
    .array(z.number().int().positive(), { required_error: '角色不能为空' })
    .min(1, '至少选择一个角色'),
});

/** 更新用户 Schema */
const updateUserSchema = z.object({
  name: z.string().min(1, '姓名不能为空').max(50, '姓名最多 50 个字符').optional(),
  department: z.string().min(1, '部门不能为空').max(100, '部门最多 100 个字符').optional(),
  roleIds: z
    .array(z.number().int().positive())
    .optional(),
});

/** 用户分页查询 Schema */
const userQuerySchema = z.object({
  ...paginationQuery(),
  keyword: optionalQueryString(),
  status: optionalQueryEnum(['true', 'false']),
});

/** ID 参数 Schema */
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** 状态切换 Schema */
const toggleStatusSchema = z.object({
  status: z.boolean({ required_error: '状态不能为空' }),
});

/** 重置密码 Schema */
const resetPasswordSchema = z.object({
  newPassword: z
    .string({ required_error: '新密码不能为空' })
    .min(6, '新密码至少 6 个字符')
    .max(100, '新密码最多 100 个字符'),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  userQuerySchema,
  idParamSchema,
  toggleStatusSchema,
  resetPasswordSchema,
};
