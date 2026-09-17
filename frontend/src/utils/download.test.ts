/**
 * 单元测试：src/utils/download.ts
 * ---------------------------------------------------------------------------
 * 导出功能是全站统一的文件下载入口，重点覆盖：
 *   · Content-Disposition 文件名解析（中文/编码/普通三种形态）
 *   · 后端异常返回 JSON 时的可读报错
 *   · 兜底文件名与日期后缀命名
 *
 * 说明：jsdom 未实现 ObjectURL 与真实下载行为，故在文件级 beforeEach 中
 *       统一打桩 URL.createObjectURL / revokeObjectURL 与 <a>.click()。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from '@/api/request';
import {
  parseFilename,
  saveBlob,
  downloadExcel,
  buildExportFilename,
} from './download';

vi.mock('@/api/request', () => ({
  default: { get: vi.fn() },
}));

const mockedGet = vi.mocked(request.get);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
  // 拦截 <a>.click()，避免 jsdom 尝试真实导航
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  // 恢复所有被 spy 的 DOM 方法，避免用例间相互影响
  vi.restoreAllMocks();
});

describe('parseFilename - Content-Disposition 解析', () => {
  it('优先解析 RFC 5987 编码文件名（中文）', () => {
    const disposition =
      "attachment; filename*=UTF-8''%E7%94%9F%E4%BA%A7%E6%97%A5%E6%8A%A5.xlsx";
    expect(parseFilename(disposition)).toBe('生产日报.xlsx');
  });

  it('兼容普通 filename="xxx" 形式', () => {
    expect(parseFilename('attachment; filename="report.xlsx"')).toBe('report.xlsx');
  });

  it('兼容不带引号的 filename=xxx 形式', () => {
    expect(parseFilename('attachment; filename=report.xlsx')).toBe('report.xlsx');
  });

  it('编码文件名仍可完整还原（含空格与中文）', () => {
    const disposition =
      "attachment; filename*=UTF-8''%E8%AE%BE%E5%A4%87%E6%8A%A5%E8%A1%A8%202026.xlsx";
    expect(parseFilename(disposition)).toBe('设备报表 2026.xlsx');
  });

  it('无法解析时返回空字符串', () => {
    expect(parseFilename('')).toBe('');
    expect(parseFilename('attachment')).toBe('');
  });
});

describe('saveBlob', () => {
  it('创建临时链接触发下载并回收资源', () => {
    const blob = new Blob(['data'], { type: 'text/plain' });
    saveBlob(blob, 'demo.txt');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(vi.mocked(HTMLAnchorElement.prototype.click)).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    // 链接不应残留在 DOM 中
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
});

describe('downloadExcel', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('使用后端返回的文件名下载', async () => {
    const blob = new Blob(['xlsx'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    mockedGet.mockResolvedValue({
      data: blob,
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition':
          "attachment; filename*=UTF-8''%E6%8A%A5%E8%A1%A8.xlsx",
      },
    } as never);

    const filename = await downloadExcel('/reports/production/export', {
      type: 'daily',
    });

    expect(filename).toBe('报表.xlsx');
    expect(mockedGet).toHaveBeenCalledWith('/reports/production/export', {
      params: { type: 'daily' },
      responseType: 'blob',
    });
  });

  it('后端未给出文件名时使用兜底名', async () => {
    const blob = new Blob(['xlsx']);
    mockedGet.mockResolvedValue({ data: blob, headers: {} } as never);

    const filename = await downloadExcel('/reports/quality/export');
    expect(filename).toBe('导出数据.xlsx');
  });

  it('支持自定义兜底文件名', async () => {
    const blob = new Blob(['xlsx']);
    mockedGet.mockResolvedValue({ data: blob, headers: {} } as never);

    const filename = await downloadExcel('/x', {}, '质量报表.xlsx');
    expect(filename).toBe('质量报表.xlsx');
  });

  it('响应不是文件流时抛出可读错误', async () => {
    mockedGet.mockResolvedValue({
      data: { message: '服务器内部错误' },
      headers: {},
    } as never);

    await expect(downloadExcel('/x')).rejects.toThrow(
      '导出失败：响应内容不是文件流',
    );
  });
});

describe('buildExportFilename', () => {
  it('按「前缀_YYYYMMDD.xlsx」生成文件名', () => {
    const filename = buildExportFilename('生产日报');
    expect(filename).toMatch(/^生产日报_\d{8}\.xlsx$/);
  });

  it('支持自定义扩展名', () => {
    expect(buildExportFilename('设备清单', '.csv')).toMatch(/^设备清单_\d{8}\.csv$/);
  });

  it('日期部分与当前日期一致', () => {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    const expected = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

    expect(buildExportFilename('报表')).toContain(expected);
  });
});
