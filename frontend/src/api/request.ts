/**
 * MES 系统 - Axios 请求封装
 * 包含：请求拦截器（JWT 注入）、响应拦截器（统一错误处理、Token 刷新）
 */

import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { message } from 'antd';
import { STORAGE_KEYS } from '@/utils/constants';
import type { ApiResponse } from '@/types/api';

/** Axios 实例 */
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** 是否正在刷新 Token */
let isRefreshing = false;
/** 等待 Token 刷新的请求队列 */
let pendingRequests: Array<() => void> = [];

/** 从 localStorage 获取 Token */
function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

/** 从 localStorage 获取 Refresh Token */
function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

/** 清除认证信息并跳转登录页 */
function clearAuthAndRedirect(): void {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.PERMISSIONS);
  // 同步清除 Zustand persist 存储，防止页面刷新后 rehydrate 到旧的认证状态
  localStorage.removeItem(STORAGE_KEYS.AUTH_STORE);
  window.location.href = '/login';
}

// ==================== 请求拦截器 ====================
// 自动注入 JWT Authorization 头
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

// ==================== 响应拦截器 ====================
// 统一处理业务错误码、Token 过期自动刷新
// 【P1 改造 I9】导出接口（responseType='blob'）返回二进制流，必须短路 JSON 解析，
//  否则会把 xlsx 二进制当 JSON 解析报错；错误场景（400 超行数 / 403 无权限）响应体也是 blob，
//  需先读回文本再解析 JSON 才能取到后端 message。
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // ① blob 请求短路：直接返回原始 AxiosResponse，交由 utils/download.ts 处理
    if (response.config.responseType === 'blob') {
      return response;
    }

    const { code, message: apiMessage, data } = response.data;

    // HTTP 200 但业务码非 200，属于业务错误
    if (code && code !== 200 && code !== 201) {
      message.error(apiMessage || '请求失败');
      return Promise.reject(new Error(apiMessage || '请求失败'));
    }

    // 成功返回业务数据
    return data as unknown as AxiosResponse;
  },
  async (error: AxiosError<ApiResponse>) => {
    const { response } = error;

    // ② 导出接口的错误体是 blob，需还原为 JSON 提取 message（400/403 等）
    let blobErrorMessage = '';
    if (error.config?.responseType === 'blob' && response?.data instanceof Blob) {
      try {
        const body = JSON.parse(await response.data.text()) as ApiResponse;
        blobErrorMessage = body?.message || '';
      } catch {
        // 非 JSON 内容（如网关 HTML 错误页）：保留默认错误文案
      }
      if (blobErrorMessage) {
        error.message = blobErrorMessage;
      }
    }

    if (!response) {
      // 网络错误
      message.error('网络异常，请检查网络连接');
      return Promise.reject(error);
    }

    const { status, data } = response;

    // 401：Token 过期，尝试刷新
    if (status === 401) {
      const originalConfig = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      if (!originalConfig._retry) {
        // 如果已经在刷新中，将请求加入队列等待
        if (isRefreshing) {
          return new Promise((resolve) => {
            pendingRequests.push(() => {
              resolve(request(originalConfig));
            });
          });
        }

        originalConfig._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = getRefreshToken();
          if (!refreshToken) {
            throw new Error('No refresh token');
          }

          // 调用刷新 Token 接口
          const refreshResponse = await axios.post<ApiResponse<{ token: string }>>(
            `${import.meta.env.VITE_API_BASE_URL || '/api'}/auth/refresh`,
            { refreshToken },
          );

          const newToken = refreshResponse.data.data?.token;
          if (!newToken) {
            throw new Error('Failed to refresh token');
          }

          localStorage.setItem(STORAGE_KEYS.TOKEN, newToken);

          // 重放队列中的等待请求
          pendingRequests.forEach((callback) => callback());
          pendingRequests = [];

          // 重放当前请求
          return request(originalConfig);
        } catch {
          clearAuthAndRedirect();
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // 其他错误码
    // 优先使用从 blob 还原出的后端文案（导出接口），其次使用响应体文案
    const errorMessage =
      blobErrorMessage || data?.message || `请求错误 (${status})`;
    message.error(errorMessage);

    return Promise.reject(error);
  },
);

// ==================== 便捷请求方法 ====================
// 注意：响应拦截器已将 response.data.data（业务数据）作为 Promise 的 resolve 值返回
// 因此以下方法的返回值即为业务数据本身，无需再访问 .data

/**
 * 清洗查询参数：剔除 undefined / null / 空串，保留 0 与 false 等合法值
 * 目的：筛选条件被清空时（如 equipmentId='' / status=''）不应把空值送到后端，
 *      否则会触发后端 Zod 参数校验失败（400「参数校验失败」）。
 * @param params 原始查询参数
 * @returns 清洗后的查询参数；全部被剔除时返回 undefined（不带 query string）
 */
function cleanParams(
  params?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

/**
 * GET 请求
 * @param url 请求地址
 * @param params 查询参数（发送前会剔除 undefined / null / 空串，避免空值参数到达后端触发 Zod 校验失败）
 * @param config 额外配置
 * @returns 业务数据 T
 */
export async function get<T = unknown>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await request.get(url, { ...config, params: cleanParams(params) });
  return response as unknown as T;
}

/**
 * POST 请求
 * @param url 请求地址
 * @param data 请求体
 * @param config 额外配置
 * @returns 业务数据 T
 */
export async function post<T = unknown>(
  url: string,
  data?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await request.post(url, data, config);
  return response as unknown as T;
}

/**
 * PUT 请求
 * @param url 请求地址
 * @param data 请求体
 * @param config 额外配置
 * @returns 业务数据 T
 */
export async function put<T = unknown>(
  url: string,
  data?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await request.put(url, data, config);
  return response as unknown as T;
}

/**
 * PATCH 请求
 * @param url 请求地址
 * @param data 请求体
 * @param config 额外配置
 * @returns 业务数据 T
 */
export async function patch<T = unknown>(
  url: string,
  data?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await request.patch(url, data, config);
  return response as unknown as T;
}

/**
 * DELETE 请求
 * @param url 请求地址
 * @param config 额外配置
 * @returns 业务数据 T
 */
export async function del<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await request.delete(url, config);
  return response as unknown as T;
}

export default request;
