/**
 * MES 系统 - API 响应与请求类型定义
 */

import type { UserInfo } from '@/types';

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码：200=成功，400=参数错误，401=未认证，403=无权限，404=不存在，409=业务冲突，500=服务器错误 */
  code: number;
  /** 业务数据，错误时为 null */
  data: T | null;
  /** 提示信息 */
  message: string;
  /** 仅 400 时存在，字段级校验错误明细 */
  errors?: ApiFieldError[];
}

/**
 * 字段级校验错误
 */
export interface ApiFieldError {
  field: string;
  message: string;
}

/**
 * 分页响应数据
 */
export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 登录请求体
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应数据
 */
export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: UserInfo;
  permissions: string[];
}

/**
 * 刷新 Token 请求体
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * 刷新 Token 响应数据
 */
export interface RefreshTokenResponse {
  token: string;
}

