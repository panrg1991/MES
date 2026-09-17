/**
 * MES 系统 - 工时统计页面（P1-10，T08 实现，替换 T06 占位）
 *
 * 功能：汇总卡（总工时/记录数）+ 三维度汇总 Tabs（按人员/按班次/按日期，后端另支持按工单）
 *      + BarChart 工时排行 + 明细列表（筛选/录入/编辑/删除）。
 * 权限：personnel:workhours:view / :create / :edit
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsOption } from 'echarts';
import BarChart from '@/components/charts/BarChart';
import {
  deleteWorkHours,
  getShifts,
  getWorkHours,
  getWorkHoursSummary,
  type WorkHoursItem,
  type WorkHoursSummaryDimension,
  type WorkHoursSummaryItem,
} from '@/api/personnel.api';
import { getUsers } from '@/api/user.api';
import { formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import WorkHoursFormModal from './WorkHoursFormModal';
import { DROPDOWN_PAGE_SIZE } from '@/utils/constants';

/** 汇总维度 Tab 定义（人员 / 班次 / 日期 / 工单） */
const DIMENSION_TABS: Array<{ key: WorkHoursSummaryDimension; label: string }> = [
  { key: 'user', label: '按人员' },
  { key: 'shift', label: '按班次' },
  { key: 'date', label: '按日期' },
  { key: 'workOrder', label: '按工单' },
];

/** 工时统计页面组件 */
function WorkHours() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // ==================== 状态 ====================
  const [dimension, setDimension] = useState<WorkHoursSummaryDimension>('user');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined);
  const [filterShiftId, setFilterShiftId] = useState<number | undefined>(undefined);
  const [detailPage, setDetailPage] = useState(1);
  const [formVisible, setFormVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<WorkHoursItem | null>(null);

  // ==================== 查询参数 ====================

  const rangeParams = useMemo(
    () => ({
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD'),
    }),
    [dateRange],
  );

  // ==================== 数据查询 ====================

  // 汇总（多维度）
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['workHoursSummary', rangeParams, dimension],
    queryFn: () => getWorkHoursSummary({ ...rangeParams, dimension }),
  });

  // 明细（分页 + 筛选）
  const detailParams = useMemo(
    () => ({ ...rangeParams, userId: filterUserId, shiftId: filterShiftId, page: detailPage, pageSize: 20 }),
    [rangeParams, filterUserId, filterShiftId, detailPage],
  );
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['workHours', detailParams],
    queryFn: () => getWorkHours(detailParams),
  });

  // 人员 / 班次下拉
  const { data: userData } = useQuery({
    queryKey: ['users', 'workhours-page-options'],
    queryFn: () => getUsers({ page: 1, pageSize: DROPDOWN_PAGE_SIZE, status: 'true' }),
    staleTime: 5 * 60 * 1000,
  });
  const { data: shiftData } = useQuery({
    queryKey: ['shifts', 'workhours-page-options'],
    queryFn: () => getShifts(),
    staleTime: 5 * 60 * 1000,
  });

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteWorkHours(id),
    onSuccess: () => {
      message.success('删除工时记录成功');
      queryClient.invalidateQueries({ queryKey: ['workHours'] });
      queryClient.invalidateQueries({ queryKey: ['workHoursSummary'] });
    },
  });

  // ==================== 汇总表格列（按维度动态） ====================

  const summaryColumns: ColumnsType<WorkHoursSummaryItem> = useMemo(() => {
    const base: ColumnsType<WorkHoursSummaryItem> = [
      { title: '分组', dataIndex: 'dimensionName', key: 'dimensionName' },
      {
        title: '总工时（h）',
        dataIndex: 'totalHours',
        key: 'totalHours',
        width: 120,
        align: 'right',
        sorter: (a, b) => a.totalHours - b.totalHours,
      },
      {
        title: '记录数',
        dataIndex: 'recordCount',
        key: 'recordCount',
        width: 100,
        align: 'right',
      },
    ];
    if (dimension === 'user') {
      base.push(
        {
          title: '参与工单数',
          dataIndex: 'workOrderCount',
          key: 'workOrderCount',
          width: 120,
          align: 'right',
        },
        {
          title: '日均工时（h）',
          dataIndex: 'avgHoursPerDay',
          key: 'avgHoursPerDay',
          width: 120,
          align: 'right',
        },
      );
    }
    if (dimension === 'shift') {
      base.push(
        {
          title: '涉及人数',
          dataIndex: 'userCount',
          key: 'userCount',
          width: 100,
          align: 'right',
        },
        {
          title: '平均单条时长（h）',
          dataIndex: 'avgHoursPerRecord',
          key: 'avgHoursPerRecord',
          width: 140,
          align: 'right',
        },
      );
    }
    if (dimension === 'workOrder') {
      base.push({
        title: '单位产品工时（h/件）',
        dataIndex: 'hoursPerUnit',
        key: 'hoursPerUnit',
        width: 160,
        align: 'right',
        render: (value: number | null | undefined) =>
          value === null || value === undefined ? '-' : value.toFixed(2),
      });
    }
    return base;
  }, [dimension]);

  /** 工时排行柱状图（Top 10） */
  const rankOption: EChartsOption = useMemo(() => {
    const top10 = (summaryData?.list ?? []).slice(0, 10);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 80, right: 24, top: 24, bottom: 48 },
      xAxis: {
        type: 'value',
        name: '工时(h)',
      },
      yAxis: {
        type: 'category',
        data: top10.map((item) => item.dimensionName),
        inverse: true,
      },
      series: [
        {
          type: 'bar',
          data: top10.map((item) => item.totalHours),
          itemStyle: { color: '#1677ff' },
          barMaxWidth: 24,
        },
      ],
    };
  }, [summaryData]);

  // ==================== 明细表格列 ====================

  const detailColumns: ColumnsType<WorkHoursItem> = [
    {
      title: '人员',
      key: 'user',
      width: 100,
      render: (_, record) => record.user?.name ?? <Tag>未指定</Tag>,
    },
    {
      title: '工单',
      key: 'workOrder',
      width: 200,
      render: (_, record) =>
        record.workOrder ? `${record.workOrder.orderNo} · ${record.workOrder.productName}` : '-',
    },
    {
      title: '班次',
      key: 'shift',
      width: 120,
      render: (_, record) => record.shift?.name ?? <Tag>未指定</Tag>,
    },
    {
      title: '工作日期',
      dataIndex: 'workDate',
      key: 'workDate',
      width: 110,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
    },
    {
      title: '起止时间',
      key: 'timeRange',
      width: 240,
      render: (_, record) =>
        `${formatDateTime(record.startTime)} ~ ${record.endTime ? formatDateTime(record.endTime) : '进行中'}`,
    },
    {
      title: '工时（h）',
      dataIndex: 'hours',
      key: 'hours',
      width: 100,
      align: 'right',
      render: (value: number) => value.toFixed(2),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            disabled={!hasPermission('personnel:workhours:edit')}
            onClick={() => {
              setEditingRecord(record);
              setFormVisible(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该工时记录？"
            okText="删除"
            cancelText="取消"
            disabled={!hasPermission('personnel:workhours:edit')}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              disabled={!hasPermission('personnel:workhours:edit')}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 汇总卡 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size={48} wrap>
          <Statistic title="总工时" value={summaryData?.totalHours ?? 0} suffix="h" precision={2} />
          <Statistic title="工时记录数" value={summaryData?.recordCount ?? 0} />
          <Statistic
            title="参与人数"
            value={
              dimension === 'shift'
                ? (summaryData?.list ?? []).reduce((sum, item) => sum + (item.userCount ?? 0), 0)
                : (summaryData?.list ?? []).length
            }
          />
        </Space>
      </Card>

      {/* 三维度汇总 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <span>统计范围：</span>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(values) => {
              if (values && values[0] && values[1]) {
                setDateRange([values[0], values[1]]);
              }
            }}
            allowClear={false}
          />
        </Space>
        <Tabs
          activeKey={dimension}
          onChange={(key) => setDimension(key as WorkHoursSummaryDimension)}
          items={DIMENSION_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            children: (
              <div>
                <Table
                  rowKey="dimensionKey"
                  size="small"
                  columns={summaryColumns}
                  dataSource={summaryData?.list ?? []}
                  loading={summaryLoading}
                  pagination={false}
                  locale={{ emptyText: '统计范围内暂无工时数据' }}
                />
                {(summaryData?.list ?? []).length > 0 && (
                  <BarChart option={rankOption} height={Math.max((summaryData?.list ?? []).slice(0, 10).length * 36 + 80, 240)} />
                )}
              </div>
            ),
          }))}
        />
      </Card>

      {/* 明细列表 */}
      <Card
        title="工时明细"
        extra={
          <Space wrap>
            <Select
              placeholder="全部人员"
              style={{ width: 140 }}
              allowClear
              value={filterUserId}
              onChange={(value) => {
                setFilterUserId(value);
                setDetailPage(1);
              }}
              options={(userData?.list ?? []).map((user) => ({ value: user.id, label: user.name }))}
            />
            <Select
              placeholder="全部班次"
              style={{ width: 160 }}
              allowClear
              value={filterShiftId}
              onChange={(value) => {
                setFilterShiftId(value);
                setDetailPage(1);
              }}
              options={(shiftData?.list ?? []).map((shift) => ({
                value: shift.id,
                label: `${shift.name}（${shift.startTime}-${shift.endTime}）`,
              }))}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => queryClient.invalidateQueries({ queryKey: ['workHours'] })}
            >
              刷新
            </Button>
            {hasPermission('personnel:workhours:create') && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingRecord(null);
                  setFormVisible(true);
                }}
              >
                录入工时
              </Button>
            )}
          </Space>
        }
        size="small"
      >
        <Table
          rowKey="id"
          size="small"
          columns={detailColumns}
          dataSource={detailData?.list ?? []}
          loading={detailLoading}
          pagination={{
            current: detailData?.page ?? detailPage,
            pageSize: detailData?.pageSize ?? 20,
            total: detailData?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page) => setDetailPage(page),
          }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          提示：人员或班次为空的记录归入「未指定」分组，不会被丢弃；工时由服务端计算，不支持手工修改。
        </Typography.Text>
      </Card>

      {/* 录入 / 编辑弹窗 */}
      <WorkHoursFormModal
        visible={formVisible}
        editingRecord={editingRecord}
        onClose={() => setFormVisible(false)}
        onSuccess={() => setFormVisible(false)}
      />
    </div>
  );
}

export default WorkHours;
