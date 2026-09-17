/**
 * MES 系统 - 通用导出按钮【T10 新增】
 * 统一消费 utils/download.ts 的 downloadExcel（blob 下载），
 * 内置 loading 态与权限码判断（无 export 权限不渲染，§8.4 约定 ⑤：
 * 前端一律经本组件导出，禁止各页面手写 blob 逻辑）。
 */

import { useState } from 'react';
import { App, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';
import { downloadExcel, buildExportFilename } from '@/utils/download';

interface ExportButtonProps {
  /** 导出接口路径（相对 /api，如 /reports/production/export） */
  url: string;
  /** 查询参数（与页面筛选条件保持一致） */
  params?: Record<string, unknown>;
  /** 导出权限码（如 reports:production:export）；无权限时不渲染 */
  permission: string;
  /** 按钮文案（默认「导出 Excel」） */
  label?: string;
  /** 后端未返回文件名时的兜底文件名前缀 */
  fallbackPrefix?: string;
  /** 按钮类型（默认 dashed，与页内主操作区分） */
  type?: 'default' | 'primary' | 'dashed' | 'link' | 'text';
}

/**
 * 通用导出按钮组件
 */
function ExportButton({
  url,
  params = {},
  permission,
  label = '导出 Excel',
  fallbackPrefix = '导出数据',
  type = 'dashed',
}: ExportButtonProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [exporting, setExporting] = useState(false);
  const { message } = App.useApp();

  // 无导出权限：不渲染（后端 requirePermission 仍会拦截直接调用 → 403）
  if (!hasPermission(permission)) {
    return null;
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const filename = await downloadExcel(
        url,
        params,
        buildExportFilename(fallbackPrefix),
      );
      message.success(`导出成功：${filename}`);
    } catch {
      // 失败提示由 request.ts 拦截器统一弹出（含 blob 还原的后端 message）
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button type={type} icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
      {label}
    </Button>
  );
}

export default ExportButton;
