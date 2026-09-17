/**
 * MES 系统 - 设备状态卡片组件
 * 展示设备各状态数量总览（运行/待机/停机/故障）
 * 使用颜色映射直观展示设备状态分布
 */

import { Card, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { EquipmentStatusSummary } from '@/api/equipment.api';

interface EquipmentStatusCardProps {
  /** 设备状态统计数据 */
  summary: EquipmentStatusSummary | undefined;
  /** 是否加载中 */
  loading?: boolean;
}

/** 状态卡片配置 */
const STATUS_CARDS: Array<{
  key: keyof Omit<EquipmentStatusSummary, 'total'>;
  label: string;
  color: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'running',
    label: '运行中',
    color: '#52c41a',
    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  },
  {
    key: 'idle',
    label: '待机',
    color: '#8c8c8c',
    icon: <ClockCircleOutlined style={{ color: '#8c8c8c' }} />,
  },
  {
    key: 'stopped',
    label: '停机',
    color: '#faad14',
    icon: <PauseCircleOutlined style={{ color: '#faad14' }} />,
  },
  {
    key: 'fault',
    label: '故障',
    color: '#ff4d4f',
    icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
  },
];

/** 设备状态卡片组件 */
function EquipmentStatusCard({ summary, loading }: EquipmentStatusCardProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}
    >
      {STATUS_CARDS.map((card) => (
        <Card key={card.key} size="small" loading={loading}>
          <Statistic
            title={card.label}
            value={summary?.[card.key] ?? 0}
            prefix={card.icon}
            valueStyle={{ color: card.color }}
          />
        </Card>
      ))}
      <Card size="small" loading={loading}>
        <Statistic
          title="设备总数"
          value={summary?.total ?? 0}
          valueStyle={{ fontWeight: 'bold' }}
        />
      </Card>
    </div>
  );
}

export default EquipmentStatusCard;
