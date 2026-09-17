/**
 * MES 系统 - OEE 分析报表页面【T10 实现】
 * 路由：/reports/oee 菜单：报表中心
 * 权限：reports:oee（菜单）/ reports:oee:export（导出）
 *
 * 功能：4 个指标卡（OEE 仪表盘 + 三分量 Statistic）+ 趋势折线（day/week/month 切换）
 *       + 设备柱状对比 + 按设备分组明细表（可下钻设备详情）+ 导出 + 口径标注。
 * 口径（架构文档 §8.1）：OEE = 时间稼动率 × 性能稼动率 × 良品率；
 *       性能稼动率基于计划数据估算（PRD 风险 R3）；无数据显示 '-'。
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { EChartsOption } from 'echarts';
import GaugeChart from '@/components/charts/GaugeChart';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import ExportButton from '@/components/common/ExportButton';
import {
  getOeeSummary,
  getOeeTrend,
  getOeeDetails,
  type OeeSummaryParams,
} from '@/api/report';
import { getEquipments, type EquipmentListItem } from '@/api/equipment.api';
import { DROPDOWN_PAGE_SIZE, NULL_PLACEHOLDER } from '@/utils/constants';
import type { OeeDetailItem, OeeTrendPoint } from '@/types';

const { RangePicker } = DatePicker;
const { Text } = Typography;

/** OEE 趋势维度选项 */
const TREND_DIMENSIONS = [
  { value: 'day', label: '按日' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
] as const;

type TrendDimension = (typeof TREND_DIMENSIONS)[number]['value'];

/** 页面筛选状态 */
interface FilterState {
  range: [Dayjs, Dayjs];
  equipmentId?: number;
}

/** 已提交的查询参数 */
interface CommittedParams {
  startDate: string;
  endDate: string;
  equipmentId?: number;
}

/** 百分数渲染（null → '-'） */
function renderPercent(value: number | null): string {
  return value === null ? NULL_PLACEHOLDER : `${value.toFixed(2)}%`;
}

/** 明细表列定义 */
const detailColumns: ColumnsType<OeeDetailItem> = [
  {
    title: '设备',
    key: 'equipment',
    width: 150,
    render: (_, record) => (
      <Link to={`/equipment/${record.equipmentId}`}>
        {record.equipmentCode} · {record.equipmentName}
      </Link>
    ),
  },
  {
    title: '计划时间(h)',
    dataIndex: 'plannedTime',
    key: 'plannedTime',
    width: 110,
    align: 'right',
    render: (val: number) => val.toFixed(2),
  },
  {
    title: '停机时间(h)',
    dataIndex: 'downtime',
    key: 'downtime',
    width: 110,
    align: 'right',
    render: (val: number) => val.toFixed(2),
  },
  {
    title: '时间稼动率',
    dataIndex: 'availability',
    key: 'availability',
    width: 110,
    align: 'right',
    render: (val: number | null) => renderPercent(val),
  },
  {
    title: '实际/理论产量',
    key: 'qty',
    width: 120,
    align: 'right',
    render: (_, record) => `${record.actualQty} / ${record.theoreticalQty.toFixed(2)}`,
  },
  {
    title: '性能稼动率',
    dataIndex: 'performance',
    key: 'performance',
    width: 120,
    align: 'right',
    render: (val: number | null, record) => (
      <Space size={4}>
        {renderPercent(val)}
        {record.overProduced && (
          <Tooltip title="实际产量超过理论产量，性能稼动率已按 100% 截断">
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
              超产
            </Tag>
          </Tooltip>
        )}
      </Space>
    ),
  },
  {
    title: '良品率',
    dataIndex: 'quality',
    key: 'quality',
    width: 100,
    align: 'right',
    render: (val: number | null) => renderPercent(val),
  },
  {
    title: 'OEE',
    dataIndex: 'oee',
    key: 'oee',
    width: 100,
    align: 'right',
    render: (val: number | null) => (
      <Text strong={val !== null}>{renderPercent(val)}</Text>
    ),
  },
];

/** 趋势折线图配置（null 点断开，不做补零） */
function buildTrendOption(points: OeeTrendPoint[]): EChartsOption {
  const seriesNames: Array<{
    key: 'availability' | 'performance' | 'quality' | 'oee';
    name: string;
    color: string;
  }> = [
    { key: 'availability', name: '时间稼动率', color: '#1677ff' },
    { key: 'performance', name: '性能稼动率', color: '#52c41a' },
    { key: 'quality', name: '良品率', color: '#722ed1' },
    { key: 'oee', name: 'OEE', color: '#fa8c16' },
  ];

  return {
    title: { text: 'OEE 趋势', left: 'left', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? `${value.toFixed(2)}%` : '-',
    },
    legend: { data: seriesNames.map((s) => s.name), right: 0, top: 0 },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((p) => p.date),
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%' },
    },
    series: seriesNames.map((series) => ({
      name: series.name,
      type: 'line' as const,
      smooth: true,
      connectNulls: false,
      symbol: 'circle',
      symbolSize: 6,
      data: points.map((point) => point[series.key]),
      itemStyle: { color: series.color },
    })),
  };
}

/** 设备柱状对比图配置（仅展示有 OEE 数据的设备） */
function buildEquipmentOption(list: OeeDetailItem[]): EChartsOption {
  const withOee = list.filter((item) => item.oee !== null);
  return {
    title: { text: '设备 OEE 对比', left: 'left', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? `${value.toFixed(2)}%` : '-',
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: withOee.map((item) => item.equipmentCode),
      axisLabel: { rotate: withOee.length > 6 ? 30 : 0 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%' },
    },
    series: [
      {
        name: 'OEE',
        type: 'bar' as const,
        barMaxWidth: 40,
        data: withOee.map((item) => item.oee),
        itemStyle: { color: '#1677ff' },
        label: {
          show: withOee.length <= 12,
          position: 'top' as const,
          formatter: '{c}%',
        },
      },
    ],
  };
}

/** OEE 分析页面组件 */
function OeeAnalysis() {
  /** 默认查询近 7 天 */
  const [filter, setFilter] = useState<FilterState>({
    range: [dayjs().subtract(6, 'day'), dayjs()],
  });
  const [committed, setCommitted] = useState<CommittedParams>(() => ({
    startDate: dayjs().subtract(6, 'day').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
  }));
  const [trendDimension, setTrendDimension] = useState<TrendDimension>('day');
  const [detailPage, setDetailPage] = useState({ page: 1, pageSize: 10 });

  /** 构造提交参数（与筛选状态同步） */
  const buildParams = (state: FilterState): CommittedParams => ({
    startDate: state.range[0].format('YYYY-MM-DD'),
    endDate: state.range[1].format('YYYY-MM-DD'),
    ...(state.equipmentId !== undefined ? { equipmentId: state.equipmentId } : {}),
  });

  const handleSearch = () => {
    setCommitted(buildParams(filter));
    setDetailPage((prev) => ({ ...prev, page: 1 }));
  };

  const handleReset = () => {
    const initial: FilterState = {
      range: [dayjs().subtract(6, 'day'), dayjs()],
      equipmentId: undefined,
    };
    setFilter(initial);
    setCommitted(buildParams(initial));
    setDetailPage((prev) => ({ ...prev, page: 1 }));
  };

  // ==================== 数据查询 ====================

  /** 设备选项（下拉选择，最多取 200 台） */
  const { data: equipmentData } = useQuery({
    queryKey: ['equipments-for-report'],
    queryFn: () => getEquipments({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
  });

  /** OEE 汇总 */
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['oee-summary', committed],
    queryFn: () => getOeeSummary(committed as OeeSummaryParams),
  });

  /** OEE 趋势 */
  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['oee-trend', committed, trendDimension],
    queryFn: () =>
      getOeeTrend({ ...committed, dimension: trendDimension }),
  });

  /** OEE 明细（设备分组，服务端分页） */
  const { data: detailsData, isLoading: detailsLoading } = useQuery({
    queryKey: ['oee-details', committed, detailPage],
    queryFn: () =>
      getOeeDetails({
        ...committed,
        page: detailPage.page,
        pageSize: detailPage.pageSize,
      }),
  });

  /** 设备柱状对比数据（独立取 100 条，避免受明细分页影响） */
  const { data: chartData } = useQuery({
    queryKey: ['oee-details-chart', committed],
    queryFn: () => getOeeDetails({ ...committed, page: 1, pageSize: 100 }),
  });

  const equipmentOptions = (equipmentData?.list ?? []).map((item: EquipmentListItem) => ({
    value: item.id,
    label: `${item.code} · ${item.name}`,
  }));

  // ==================== 渲染 ====================

  return (
    <div>
      {/* 筛选区 */}
      <Card size="small">
        <Space wrap>
          <RangePicker
            value={filter.range}
            onChange={(value) =>
              setFilter((prev) => ({
                ...prev,
                range: value && value[0] && value[1] ? [value[0], value[1]] : prev.range,
              }))
            }
            allowClear={false}
          />
          <Select
            style={{ width: 220 }}
            placeholder="全部设备"
            allowClear
            showSearch
            optionFilterProp="label"
            options={equipmentOptions}
            value={filter.equipmentId}
            onChange={(value) =>
              setFilter((prev) => ({ ...prev, equipmentId: value }))
            }
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            查询
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
          <ExportButton
            url="/reports/oee/export"
            params={committed as unknown as Record<string, unknown>}
            permission="reports:oee:export"
            fallbackPrefix="OEE分析报表"
          />
        </Space>
      </Card>

      {/* OEE 仪表盘 + 三分量指标卡 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card
            loading={summaryLoading}
            title="OEE 总值"
            size="small"
            bodyStyle={{ padding: '8px 16px' }}
          >
            <GaugeChart value={summary?.oee ?? null} title="OEE" height={240} />
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card loading={summaryLoading} title="三因子指标" size="small">
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Statistic
                  title="时间稼动率 Availability"
                  value={summary?.availability ?? NULL_PLACEHOLDER}
                  suffix={summary?.availability !== null ? '%' : ''}
                  precision={summary?.availability !== null ? 2 : undefined}
                  valueStyle={{ color: '#1677ff' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  计划 {summary?.plannedTime.toFixed(2) ?? '0.00'}h / 停机{' '}
                  {summary?.downtime.toFixed(2) ?? '0.00'}h
                </Text>
              </Col>
              <Col span={8}>
                <Statistic
                  title="性能稼动率 Performance"
                  value={summary?.performance ?? NULL_PLACEHOLDER}
                  suffix={summary?.performance !== null ? '%' : ''}
                  precision={summary?.performance !== null ? 2 : undefined}
                  valueStyle={{ color: '#52c41a' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  实际 {summary?.actualQty ?? 0} / 理论{' '}
                  {summary?.theoreticalQty.toFixed(2) ?? '0.00'}
                </Text>
              </Col>
              <Col span={8}>
                <Statistic
                  title="良品率 Quality"
                  value={summary?.quality ?? NULL_PLACEHOLDER}
                  suffix={summary?.quality !== null ? '%' : ''}
                  precision={summary?.quality !== null ? 2 : undefined}
                  valueStyle={{ color: '#722ed1' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  良品 {summary?.goodQty ?? 0}
                </Text>
              </Col>
            </Row>
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              message="性能稼动率基于计划数据估算（标准节拍 = 计划工期 / 计划数量，PRD 风险 R3）；停机时间由设备状态日志成对推导；无数据显示 '-'。"
            />
          </Card>
        </Col>
      </Row>

      {/* 趋势 + 设备对比 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            bodyStyle={{ padding: '12px 16px' }}
            extra={
              <Segmented
                size="small"
                options={TREND_DIMENSIONS.map((item) => item.label)}
                value={TREND_DIMENSIONS.find((item) => item.value === trendDimension)?.label}
                onChange={(label) => {
                  const matched = TREND_DIMENSIONS.find((item) => item.label === label);
                  if (matched) {
                    setTrendDimension(matched.value);
                  }
                }}
              />
            }
          >
            {trendData && trendData.points.length > 0 ? (
              <LineChart option={buildTrendOption(trendData.points)} height={300} />
            ) : (
              !trendLoading && (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8c8c8c' }}>
                  暂无趋势数据
                </div>
              )
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" bodyStyle={{ padding: '12px 16px' }}>
            {chartData && chartData.list.some((item) => item.oee !== null) ? (
              <BarChart option={buildEquipmentOption(chartData.list)} height={300} />
            ) : (
              !detailsLoading && (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8c8c8c' }}>
                  暂无设备对比数据
                </div>
              )
            )}
          </Card>
        </Col>
      </Row>

      {/* 明细表（按设备分组，可下钻设备详情） */}
      <Card size="small" style={{ marginTop: 16 }} title="OEE 明细（按设备分组）">
        <Table
          rowKey={(record) => `${record.equipmentId}-${record.shiftId ?? 'all'}`}
          columns={detailColumns}
          dataSource={detailsData?.list ?? []}
          loading={detailsLoading}
          size="small"
          pagination={{
            current: detailPage.page,
            pageSize: detailPage.pageSize,
            total: detailsData?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 台设备`,
            onChange: (page, pageSize) => setDetailPage({ page, pageSize }),
          }}
        />
      </Card>
    </div>
  );
}

export default OeeAnalysis;
