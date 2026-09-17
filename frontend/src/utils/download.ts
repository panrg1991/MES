/**
 * MES 系统 - 文件下载工具
 * 【P1 新增 I9】统一 Excel 导出下载入口，所有导出按钮必须经此函数，
 * 禁止各页面手写 blob 逻辑（架构文档 §8.4 约定 ⑤）。
 *
 * 依赖 api/request.ts 对 `responseType === 'blob'` 的短路处理：
 *  - 成功：拦截器返回原始 AxiosResponse（含 headers/content-type 的 blob）
 *  - 失败：拦截器从 blob 还原 JSON message 并 message.error 提示
 */

import type { AxiosResponse } from 'axios';
import request from '@/api/request';

/** 导出接口默认文件名（后端未返回 Content-Disposition 时使用） */
const DEFAULT_FALLBACK_NAME = '导出数据.xlsx';

/**
 * 从 Content-Disposition 头解析文件名
 * 优先解析编码文件名（filename*=UTF-8''xxx），兼容普通 filename="xxx"
 * @param disposition - Content-Disposition 头内容
 * @returns 解析出的文件名，未匹配返回空字符串
 */
export function parseFilename(disposition: string): string {
  if (!disposition) {
    return '';
  }

  // 优先：filename*=UTF-8''<percent-encoded>
  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1].trim());
    } catch {
      return encodedMatch[1].trim();
    }
  }

  // 兜底：filename="<name>" 或 filename=<name>
  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
  if (plainMatch) {
    return plainMatch[1].trim();
  }

  return '';
}

/**
 * 触发浏览器下载 Blob
 * @param blob - 文件内容
 * @param filename - 下载文件名
 * @returns void
 */
export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

/**
 * 下载导出接口返回的 Excel 文件
 * @param url - 导出接口路径（相对 baseURL，如 `/reports/production/export`）
 * @param params - 查询参数（与页面筛选条件保持一致）
 * @param fallbackName - 后端未给出文件名时的兜底文件名
 * @returns 实际使用的文件名
 * @throws {Error} 导出失败时抛出（拦截器已弹出错误提示）
 */
export async function downloadExcel(
  url: string,
  params: Record<string, unknown> = {},
  fallbackName: string = DEFAULT_FALLBACK_NAME,
): Promise<string> {
  const response = (await request.get(url, {
    params,
    responseType: 'blob',
  })) as unknown as AxiosResponse<Blob>;

  const blobData = response.data;

  // 防御：若后端异常返回了 JSON（未走 blob 短路），给出可读错误
  if (!(blobData instanceof Blob)) {
    throw new Error('导出失败：响应内容不是文件流');
  }

  const contentType =
    (response.headers?.['content-type'] as string | undefined) ||
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const disposition =
    (response.headers?.['content-disposition'] as string | undefined) || '';
  const filename = parseFilename(disposition) || fallbackName;

  const blob = new Blob([blobData], { type: contentType });
  saveBlob(blob, filename);

  return filename;
}

/**
 * 生成带日期后缀的导出文件名（如 生产日报_20260916.xlsx）
 * @param prefix - 文件名前缀（中文）
 * @param suffix - 扩展名（默认 .xlsx）
 * @returns 文件名
 */
export function buildExportFilename(prefix: string, suffix = '.xlsx'): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `${prefix}_${datePart}${suffix}`;
}
