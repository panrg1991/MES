/**
 * MES 系统 - 前端运行时配置解析
 * =============================================================================
 * 目标：同一份 `dist` 产物可部署到任意环境（同源反代 / 前后端分机 / 子路径），
 *      后端地址在**部署后**通过 `public/config.js` 修改，无需重新构建。
 *
 * 解析优先级：window.__MES_CONFIG__（运行时） > import.meta.env.VITE_*（构建期） > 内置默认值
 *
 * 说明：本模块在应用启动早期（main.tsx / api/request.ts）被引用，
 *      必须保持无副作用、无外部依赖，便于单元测试。
 */

/** 默认后端 API 基地址（同源反代） */
export const DEFAULT_API_BASE_URL = '/api';

/** 默认应用标题 */
export const DEFAULT_APP_TITLE = 'MES 车间制造执行系统';

/** 运行时配置对象 */
export interface RuntimeConfig {
  /** 后端 API 基地址（不含末尾斜杠） */
  apiBaseUrl: string;
  /** 应用标题 */
  appTitle: string;
  /** 前端路由基路径（始终以 / 开头、以 / 结尾） */
  basePath: string;
  /** 前端版本号（构建期注入） */
  version: string;
}

/** window.__MES_CONFIG__ 的原始结构（部署后可手改，字段允许缺失/为空） */
export interface RawRuntimeConfig {
  API_BASE_URL?: unknown;
  APP_TITLE?: unknown;
  BASE_PATH?: unknown;
}

/** 读取部署后手改的运行时配置（无 window 环境返回空对象） */
export function readRawRuntimeConfig(): RawRuntimeConfig {
  if (typeof window === 'undefined') {
    return {};
  }
  const raw = (window as Window & { __MES_CONFIG__?: RawRuntimeConfig })
    .__MES_CONFIG__;
  return raw && typeof raw === 'object' ? raw : {};
}

/** 取非空字符串（非字符串或全空白视为未配置） */
function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 归一化后端 API 基地址
 * - 未配置时回退构建期 VITE_API_BASE_URL，再回退 '/api'
 * - 去掉末尾多余斜杠
 * - 只填了「协议 + 主机 + 端口」时自动补 '/api'，降低手工配置出错概率
 * @param value 运行时配置值（window.__MES_CONFIG__.API_BASE_URL）
 * @param buildTimeValue 构建期变量（默认取 VITE_API_BASE_URL）
 * @returns 归一化后的基地址
 */
export function normalizeApiBaseUrl(
  value?: unknown,
  buildTimeValue?: string,
): string {
  const raw =
    toTrimmedString(value) ||
    toTrimmedString(buildTimeValue ?? import.meta.env.VITE_API_BASE_URL) ||
    DEFAULT_API_BASE_URL;

  // 去掉末尾斜杠（保留 '/' 之外的路径结构）
  const trimmed = raw.replace(/\/+$/, '') || DEFAULT_API_BASE_URL;

  // 仅协议+主机（如 http://192.168.1.100:3000）→ 自动补 /api
  if (/^https?:\/\/[^/]+$/i.test(trimmed)) {
    return `${trimmed}${DEFAULT_API_BASE_URL}`;
  }

  return trimmed;
}

/**
 * 归一化前端路由基路径
 * 约定：根路径返回 '/'；子路径统一为 '/xxx/'（首尾均带斜杠）
 * @param value 运行时配置值（window.__MES_CONFIG__.BASE_PATH）
 * @param buildTimeValue 构建期变量（默认取 VITE_BASE_PATH）
 * @returns 归一化后的基路径
 */
export function normalizeBasePath(
  value?: unknown,
  buildTimeValue?: string,
): string {
  const raw =
    toTrimmedString(value) ||
    toTrimmedString(buildTimeValue ?? import.meta.env.VITE_BASE_PATH);

  if (!raw || raw === '/' || raw === './') {
    return '/';
  }

  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * 把应用内路径（如 '/login'）转换为带部署基路径的完整路径
 * @param path 以 / 开头的应用内路径
 * @returns 浏览器可直接跳转的绝对路径
 */
export function resolveAppPath(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${runtimeConfig.basePath}${normalized}`;
}

/** 前端版本号（构建期通过 vite define 注入；测试环境回退 dev） */
const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** 解析后的运行时配置（模块加载时求值一次，配置变更需刷新页面） */
export const runtimeConfig: RuntimeConfig = (() => {
  const raw = readRawRuntimeConfig();
  return {
    apiBaseUrl: normalizeApiBaseUrl(raw.API_BASE_URL),
    appTitle:
      toTrimmedString(raw.APP_TITLE) ||
      toTrimmedString(import.meta.env.VITE_APP_TITLE) ||
      DEFAULT_APP_TITLE,
    basePath: normalizeBasePath(raw.BASE_PATH),
    version: APP_VERSION,
  };
})();

/** React Router 的 basename（根路径返回 undefined，避免多余的 '/' 前缀） */
export const routerBasename: string | undefined =
  runtimeConfig.basePath === '/'
    ? undefined
    : runtimeConfig.basePath.replace(/\/+$/, '');

/**
 * 应用运行时配置到 DOM（当前仅同步浏览器标题）
 * 在 main.tsx 渲染前调用一次即可。
 */
export function applyRuntimeConfig(): void {
  if (typeof document !== 'undefined') {
    document.title = runtimeConfig.appTitle;
  }
}

/**
 * 后端健康检查地址（供「系统信息」与登录页连通性检测复用）
 * @returns 完整健康检查 URL
 */
export function buildHealthUrl(): string {
  return `${runtimeConfig.apiBaseUrl}/health`;
}
