/**
 * MES 系统 - 生产报表页面【T10 实现】
 * 路由：/reports/production 菜单：报表中心
 * 权限：reports:production（菜单）/ reports:production:export（导出）
 *
 * 功能：daily / weekly / monthly 切换 + 日期范围筛选 + 汇总表
 *       （工单数/计划量/完成量/不良量/达成率/不良率）+ Excel 导出。
 * 口径：达成率 = 完成量 / 计划量；不良率 = 不良量 / 完成量（分母 0 显示 '-'）。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  DatePicker,
  Segmented,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import ExportButton from '@/components/common/ExportButton';
import { getProductionReport } from '@/api/report';
import { NULL_PLACEHOLDER } from '@/utils/constants';
import type { ProductionReportRow } from '@/types';

const { RangePicker } = DatePicker;
const { Text } = Typography;

/** 报表类型选项 */
const REPORT_TYPES = [
  { value: 'daily', label: '日报' },
  { value: 'weekly', label: '周报' },
  { value: 'monthly', label: '月报' },
] as const;

type ReportType = (typeof REPORT_TYPES)[number]['value'];

/** 已提交的查询参数 */
interface CommittedParams {
  type: ReportType;
  startDate: string;
  endDate: string;
}

/** 达成率 / 不良率渲染（null → '-'） */
function renderRate(value: number | null): string {
  return value === null ? NULL_PLACEHOLDER : `${value.toFixed(2)}%`;
}

/** 汇总表列定义 */
const reportColumns: ColumnsType<ProductionReportRow> = [
  { title: '期间', dataIndex: 'period', key: 'period', width: 140 },
  {
    title: '工单数',
    dataIndex: 'orderCount',
    key: 'orderCount',
    width: 100,
    align: 'right',
  },
  {
    title: '计划量',
    dataIndex: 'plannedQty',
    key: 'plannedQty',
    width: 110,
    align: 'right',
  },
  {
    title: '完成量',
    dataIndex: 'completedQty',
    key: 'completedQty',
    width: 110,
    align: 'right',
  },
  {
    title: '不良量',
    dataIndex: 'defectQty',
    key: 'defectQty',
    width: 110,
    align: 'right',
    render: (val: number) => (val > 0 ? <Text type="danger">{val}</Text> : val),
  },
  {
    title: '达成率',
    dataIndex: 'achieveRate',
    key: 'achieveRate',
    width: 110,
    align: 'right',
    render: (val: number | null) => renderRate(val),
  },
  {
    title: '不良率',
    dataIndex: 'defectRate',
    key: 'defectRate',
    width: 110,
    align: 'right',
    render: (val: number | null) => renderRate(val),
  },
];

/** 生产报表页面组件 */
function ProductionReport() {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(29, 'day'),
    dayjs(),
  ]);
  const [committed, setCommitted] = useState<CommittedParams>(() => ({
    type: 'daily',
    startDate: dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
  }));

  const handleSearch = () => {
    setCommitted({
      type: reportType,
      startDate: range[0].format('YYYY-MM-DD'),
      endDate: range[1].format('YYYY-MM-DD'),
    });
  };

  const handleReset = () => {
    const initialRange: [Dayjs, Dayjs] = [dayjs().subtract(29, 'day'), dayjs()];
    setRange(initialRange);
    setReportType('daily');
    setCommitted({
      type: 'daily',
      startDate: initialRange[0].format('YYYY-MM-DD'),
      endDate: initialRange[1].format('YYYY-MM-DD'),
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['production-report', committed],
    queryFn: () => getProductionReport(committed),
  });

  return (
    <div>
      {/* 筛选 + 导出 */}
      <Card size="small">
        <Space wrap>
          <Segmented
            options={REPORT_TYPES.map((item) => item.label)}
            value={REPORT_TYPES.find((item) => item.value === reportType)?.label}
            onChange={(label) => {
              const matched = REPORT_TYPES.find((item) => item.label === label);
              if (matched) {
                setReportType(matched.value);
              }
            }}
          />
          <RangePicker
            value={range}
            onChange={(value) =>
              setRange(
                value && value[0] && value[1] ? [value[0], value[1]] : range,
              )
            }
            allowClear={false}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            查询
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
          <ExportButton
            url="/reports/production/export"
            params={committed as unknown as Record<string, unknown>}
            permission="reports:production:export"
            fallbackPrefix="生产报表"
          />
        </Space>
      </Card>

      {/* 汇总表 */}
      <Card size="small" style={{ marginTop: 16 }}>
        <Table
          rowKey="period"
          columns={reportColumns}
          dataSource={data?.list ?? []}
          loading={isLoading}
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          口径：达成率 = 完成量 / 计划量；不良率 = 不良量 / 完成量；计划量为期间内新建工单的计划数量之和。
        </Text>
      </Card>
    </div>
  );
}

export default ProductionReport;
