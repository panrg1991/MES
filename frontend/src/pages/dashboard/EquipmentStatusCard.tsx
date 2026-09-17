/**
 * MES 系统 - 设备状态卡片组件（看板版）
 * 使用 ECharts 饼图展示设备状态分布，辅以设备详情列表
 */

import { Card, Row, Col, Tag, Empty, Statistic } from 'antd';
import {
  DesktopOutlined,
} from '@ant-design/icons';
import PieChart from '@/components/charts/PieChart';
import type { EChartsOption } from 'echarts';
import type { DashboardEquipmentStatus, EquipmentStatus } from '@/types';
import { EQUIPMENT_STATUS_MAP } from '@/utils/constants';

interface EquipmentStatusCardProps {
  /** 设备状态汇总数据 */
  data: DashboardEquipmentStatus | undefined;
  /** 是否加载中 */
  loading: boolean;
}

/** 设备状态饼图数据项颜色配置 */
const STATUS_PIE_ITEMS: Array<{
  key: keyof Pick<DashboardEquipmentStatus, 'running' | 'idle' | 'stopped' | 'fault'>;
  name: string;
  color: string;
}> = [
  { key: 'running', name: '运行中', color: '#52c41a' },
  { key: 'idle', name: '待机', color: '#8c8c8c' },
  { key: 'stopped', name: '停机', color: '#faad14' },
  { key: 'fault', name: '故障', color: '#ff4d4f' },
];

/**
 * 构建设备状态饼图 ECharts 配置
 */
function buildPieOption(
  data: DashboardEquipmentStatus | undefined,
): EChartsOption {
  if (!data) {
    return {} as EChartsOption;
  }

  const pieData = STATUS_PIE_ITEMS.filter(
    (item) => data[item.key] > 0,
  ).map((item) => ({
    value: data[item.key],
    name: item.name,
    itemStyle: { color: item.color },
  }));

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} 台 ({d}%)',
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['50%', '40%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: true,
          position: 'center',
          formatter: () => `共\n${data.total}台`,
          fontSize: 14,
          fontWeight: 'bold',
          lineHeight: 20,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
          },
        },
        labelLine: { show: false },
        data: pieData,
      },
    ],
  };
}

/**
 * 设备状态卡片组件
 */
function EquipmentStatusCard({
  data,
  loading,
}: EquipmentStatusCardProps) {
  const details = data?.details || [];
  const hasData = data && data.total > 0;

  return (
    <Card
      title={
        <span>
          <DesktopOutlined style={{ marginRight: 8 }} />
          设备状态
        </span>
      }
      loading={loading}
      bodyStyle={{ padding: '12px 16px' }}
    >
      {!hasData && !loading ? (
        <Empty description="暂无设备数据" />
      ) : (
        <Row gutter={16}>
          {/* 左侧：饼图 */}
          <Col span={12}>
            <PieChart
              option={buildPieOption(data)}
              height={220}
            />
          </Col>
          {/* 右侧：状态统计 + 设备列表 */}
          <Col span={12}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 12,
              }}
            >
              {STATUS_PIE_ITEMS.map((item) => (
                <Statistic
                  key={item.key}
                  title={item.name}
                  value={data?.[item.key] ?? 0}
                  valueStyle={{
                    color: item.color,
                    fontSize: 18,
                  }}
                />
              ))}
            </div>
            {/* 设备详情列表 */}
            <div
              style={{
                maxHeight: 120,
                overflowY: 'auto',
                borderTop: '1px solid #f0f0f0',
                paddingTop: 8,
              }}
            >
              {details.slice(0, 10).map((eq) => {
                const statusInfo = EQUIPMENT_STATUS_MAP[eq.status as EquipmentStatus];
                return (
                  <div
                    key={eq.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '2px 0',
                      fontSize: 12,
                    }}
                  >
                    <span>{eq.code} - {eq.name}</span>
                    <Tag
                      color={statusInfo?.color ?? 'default'}
                      style={{ fontSize: 11, marginRight: 0 }}
                    >
                      {statusInfo?.label ?? eq.status}
                    </Tag>
                  </div>
                );
              })}
              {details.length > 10 && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: '#8c8c8c',
                    paddingTop: 4,
                  }}
                >
                  共 {details.length} 台设备
                </div>
              )}
            </div>
          </Col>
        </Row>
      )}
    </Card>
  );
}

export default EquipmentStatusCard;
