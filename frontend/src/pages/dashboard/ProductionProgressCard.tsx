/**
 * MES 系统 - 工单进度卡片组件
 * 展示当前进行中工单的完成进度列表，含进度条
 */

import { Card, Progress, Empty, Tag } from 'antd';
import {
  ScheduleOutlined,
} from '@ant-design/icons';
import type { DashboardProgressItem } from '@/types';

interface ProductionProgressCardProps {
  /** 工单进度列表 */
  data: DashboardProgressItem[] | undefined;
  /** 是否加载中 */
  loading: boolean;
}

/** 进度条颜色阈值 */
function getProgressColor(progress: number): string {
  if (progress >= 90) return '#52c41a';
  if (progress >= 50) return '#1890ff';
  if (progress >= 20) return '#faad14';
  return '#ff4d4f';
}

/**
 * 工单进度卡片组件
 */
function ProductionProgressCard({
  data,
  loading,
}: ProductionProgressCardProps) {
  const list = data || [];

  return (
    <Card
      title={
        <span>
          <ScheduleOutlined style={{ marginRight: 8 }} />
          工单进度
        </span>
      }
      loading={loading}
      bodyStyle={{ maxHeight: 320, overflowY: 'auto', padding: '8px 16px' }}
    >
      {list.length === 0 && !loading ? (
        <Empty description="暂无进行中工单" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((item) => (
            <div key={item.orderNo}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {item.productName}
                  <Tag
                    style={{ marginLeft: 8, fontSize: 11 }}
                    color="default"
                  >
                    {item.orderNo}
                  </Tag>
                </span>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {item.completedQty} / {item.quantity}
                </span>
              </div>
              <Progress
                percent={item.progress}
                size="small"
                strokeColor={getProgressColor(item.progress)}
                format={(percent) => `${percent}%`}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default ProductionProgressCard;
