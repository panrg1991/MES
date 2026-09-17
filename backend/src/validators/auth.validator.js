/**
 * MES 系统 - 认证模块 Zod 校验 Schema
 * 校验：登录请求、刷新令牌、修改密码
 */

const { z } = require('zod');

/** 登录请求 Schema */
const loginSchema = z.object({
  username: z
    .string({ required_error: '用户名不能为空' })
    .min(2, '用户名至少 2 个字符')
    .max(50, '用户名最多 50 个字符'),
  password: z
    .string({ required_error: '密码不能为空' })
    .min(6, '密码至少 6 个字符')
    .max(100, '密码最多 100 个字符'),
});

/** 刷新令牌 Schema */
const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: '刷新令牌不能为空' })
    .min(1, '刷新令牌不能为空'),
});

/** 修改密码 Schema */
const changePasswordSchema = z
  .object({
    oldPassword: z
      .string({ required_error: '旧密码不能为空' })
      .min(1, '旧密码不能为空'),
    newPassword: z
      .string({ required_error: '新密码不能为空' })
      .min(6, '新密码至少 6 个字符')
      .max(100, '新密码最多 100 个字符'),
    confirmPassword: z
      .string({ required_error: '确认密码不能为空' })
      .min(1, '确认密码不能为空'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

module.exports = {
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
};
