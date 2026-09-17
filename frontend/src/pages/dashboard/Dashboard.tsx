/**
 * MES 系统 - 数据看板主页面
 * 布局：顶部统计卡片 + 产量趋势图/质量摘要 + 工单进度/设备状态
 * 使用 React Query 实现 30 秒自动刷新
 * 【P1-I4 T10】新增「待维保提醒」入口卡片（跳 /equipment/maintenance?tab=due），
 *             「低库存预警」卡片可点击跳转库存预警页
 */

import { Row, Col, Card, Statistic, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ScheduleOutlined,
  RiseOutlined,
  WarningOutlined,
  AlertOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  getDashboardOverview,
  getDashboardProductionProgress,
  getDashboardEquipmentStatus,
  getDashboardOutputTrend,
  getDashboardQualitySummary,
} from '@/api/dashboard';
import {
  DASHBOARD_REFRESH_INTERVAL,
  ROUTE_PATHS,
} from '@/utils/constants';
import { formatNumber } from '@/utils/format';
import OutputTrendChart from './OutputTrendChart';
import ProductionProgressCard from './ProductionProgressCard';
import EquipmentStatusCard from './EquipmentStatusCard';
import QualitySummaryCard from './QualitySummaryCard';

const { Title } = Typography;

/** 统计卡片配置 */
interface StatCardConfig {
  title: string;
  value: number | string;
  prefix: React.ReactNode;
  valueStyle: { color: string };
  suffix?: string;
  /** 【P1-I4】可选点击跳转（卡片可点击时展示 hover 效果） */
  onClick?: () => void;
}

/**
 * 数据看板主页面组件
 */
function Dashboard() {
  const navigate = useNavigate();

  // ==================== 数据查询（30秒自动刷新） ====================

  /** 看板总览 */
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: getDashboardOverview,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });

  /** 工单进度列表 */
  const { data: progressData, isLoading: progressLoading } = useQuery({
    queryKey: ['dashboard-production-progress'],
    queryFn: getDashboardProductionProgress,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });

  /** 设备状态汇总 */
  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ['dashboard-equipment-status'],
    queryFn: getDashboardEquipmentStatus,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });

  /** 产量趋势 */
  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['dashboard-output-trend'],
    queryFn: () => getDashboardOutputTrend(7),
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });

  /** 质量摘要 */
  const { data: qualityData, isLoading: qualityLoading } = useQuery({
    queryKey: ['dashboard-quality-summary'],
    queryFn: () => getDashboardQualitySummary(),
    refetchInterval: DASHBOARD_REFRESH_INTERVAL,
  });

  // ==================== 顶部统计卡片配置 ====================

  const statCards: StatCardConfig[] = [
    {
      title: '进行中工单',
      value: overview?.productionProgress ?? 0,
      prefix: <ScheduleOutlined style={{ color: '#1890ff' }} />,
      valueStyle: { color: '#1890ff' },
    },
    {
      title: '今日产量',
      value: formatNumber(overview?.outputToday ?? 0),
      prefix: <RiseOutlined style={{ color: '#52c41a' }} />,
      valueStyle: { color: '#52c41a' },
    },
    {
      title: '不良率',
      value: overview?.defectRate ?? 0,
      suffix: '%',
      prefix: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      valueStyle: { color: '#ff4d4f' },
    },
    {
      // 【P1-I4】低库存预警入口卡片：点击跳转库存预警页（口径与预警页同源 evaluateWarning）
      title: '低库存预警',
      value: overview?.lowStockCount ?? 0,
      prefix: <AlertOutlined style={{ color: '#faad14' }} />,
      valueStyle: { color: '#faad14' },
      onClick: () => navigate(ROUTE_PATHS.MATERIAL_INVENTORY_WARNING),
    },
    {
      // 【P1-I4】待维保提醒入口卡片：跳转维保页并定位「到期提醒」Tab（?tab=due）
      title: '待维保提醒',
      value: overview?.maintenanceDueCount ?? 0,
      prefix: <ToolOutlined style={{ color: '#fa8c16' }} />,
      valueStyle: { color: '#fa8c16' },
      onClick: () => navigate(`${ROUTE_PATHS.EQUIPMENT_MAINTENANCE}?tab=due`),
    },
  ];

  // ==================== 渲染 ====================

  return (
    <div>
      {/* 页面标题 */}
      <Title level={4} style={{ marginBottom: 16 }}>
        数据看板
      </Title>

      {/* 顶部统计卡片（5 张：进行中工单 / 今日产量 / 不良率 / 低库存预警 / 待维保提醒） */}
      <Row gutter={[16, 16]}>
        {statCards.map((card) => (
          <Col key={card.title} xs={24} sm={12} lg={6}>
            <Card
              loading={overviewLoading}
              bodyStyle={{ padding: 20 }}
              hoverable={!!card.onClick}
              onClick={card.onClick}
              style={card.onClick ? { cursor: 'pointer' } : undefined}
            >
              <Statistic
                title={card.title}
                value={card.value}
                prefix={card.prefix}
                suffix={card.suffix}
                valueStyle={{ fontSize: 28, ...card.valueStyle }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 产量趋势 + 质量摘要 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <OutputTrendChart data={trendData} loading={trendLoading} />
        </Col>
        <Col xs={24} lg={8}>
          <QualitySummaryCard data={qualityData} loading={qualityLoading} />
        </Col>
      </Row>

      {/* 工单进度 + 设备状态 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ProductionProgressCard
            data={progressData?.list}
            loading={progressLoading}
          />
        </Col>
        <Col xs={24} lg={12}>
          <EquipmentStatusCard
            data={equipmentData}
            loading={equipmentLoading}
          />
        </Col>
      </Row>
    </div>
  );
}

export default Dashboard;
