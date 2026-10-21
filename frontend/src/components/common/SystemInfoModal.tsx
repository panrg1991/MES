/**
 * MES 系统 - 系统信息弹窗
 * ---------------------------------------------------------------------------
 * 用途：现场排障时无需打开浏览器 F12 / 服务器命令行，即可确认
 *   ① 前端版本、当前 API 基地址、部署基路径（部署后是否读到 config.js）
 *   ② 后端是否连通、后端版本/环境、数据库类型与连通状态
 *
 * 实现要点：直接使用 axios 请求 /health（不走 api/request.ts 的拦截器），
 *          避免后端不可达时弹出全局错误提示干扰用户。
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Modal, Space, Tag, Typography } from 'antd';
import axios from 'axios';
import { buildHealthUrl, runtimeConfig } from '@/config/runtime';

const { Text } = Typography;

/** 后端 /api/health 返回的 data 结构（仅声明本组件用到的字段） */
interface HealthInfo {
  status?: string;
  uptime?: number;
  service?: {
    name?: string;
    version?: string;
    env?: string;
    node?: string;
  };
  database?: {
    type?: string;
    connected?: boolean;
    latencyMs?: number | null;
  };
  /** 后端是否仍使用默认 JWT 密钥 */
  insecureSecrets?: boolean;
}

interface SystemInfoModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 把秒级运行时长格式化为「x 天 x 小时 x 分」
 * @param seconds 秒数
 * @returns 可读文本
 */
function formatUptime(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '-';
  }
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时 ${minutes} 分`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分 ${total % 60} 秒`;
}

/** 系统信息弹窗 */
function SystemInfoModal({ open, onClose }: SystemInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [error, setError] = useState('');

  /** 拉取后端健康信息 */
  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get<{ data: HealthInfo }>(buildHealthUrl(), {
        timeout: 5000,
      });
      setHealth(response.data?.data ?? null);
    } catch (err) {
      setHealth(null);
      setError(
        axios.isAxiosError(err)
          ? `无法连接后端接口：${buildHealthUrl()}`
          : '获取后端信息失败',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次打开时刷新一次，保证看到的是当前状态
  useEffect(() => {
    if (open) {
      void fetchHealth();
    }
  }, [open, fetchHealth]);

  const connected = health?.database?.connected === true;
  const backendReachable = Boolean(health) && !error;

  return (
    <Modal
      title="系统信息"
      open={open}
      onCancel={onClose}
      width={640}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" loading={loading} onClick={() => void fetchHealth()}>
            重新检测
          </Button>
        </Space>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="后端服务不可达"
          description={
            <div>
              <div>{error}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                请确认：① 后端进程已启动；② 前端 dist/config.js 的 API_BASE_URL 指向正确；
                ③ 跨机部署时后端 CORS_ORIGIN 已包含本页地址。
              </Text>
            </div>
          }
        />
      ) : null}

      {health?.insecureSecrets ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="安全提示：后端仍在使用默认 JWT 密钥"
          description="请在 backend/.env.production 中更换 JWT_SECRET 与 JWT_REFRESH_SECRET 后重启服务。"
        />
      ) : null}

      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="前端版本">
          {runtimeConfig.version}
        </Descriptions.Item>
        <Descriptions.Item label="API 地址">
          <Text code>{runtimeConfig.apiBaseUrl}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="部署基路径">
          <Text code>{runtimeConfig.basePath}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="后端状态">
          {loading ? (
            <Tag>检测中…</Tag>
          ) : backendReachable ? (
            <Tag color="success">已连接</Tag>
          ) : (
            <Tag color="error">不可达</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="后端版本">
          {health?.service?.version || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="运行环境">
          {health?.service?.env || '-'}
          {health?.service?.node ? `（Node ${health.service.node}）` : ''}
        </Descriptions.Item>
        <Descriptions.Item label="数据库">
          {health?.database?.type ? (
            <Space size={8}>
              <Text>{health.database.type.toUpperCase()}</Text>
              {connected ? (
                <Tag color="success">
                  连接正常
                  {typeof health.database.latencyMs === 'number'
                    ? ` · ${health.database.latencyMs}ms`
                    : ''}
                </Tag>
              ) : (
                <Tag color="error">连接失败</Tag>
              )}
            </Space>
          ) : (
            '-'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="服务已运行">
          {formatUptime(health?.uptime)}
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
}

export default SystemInfoModal;
