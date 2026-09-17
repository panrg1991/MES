/**
 * MES 系统 - 设备故障维修列表页面【T07 实现】
 * 路由：/equipment/breakdown 菜单：设备管理
 * 功能：统计卡片（待维修 / 已修复 / 累计停机时长）+ 故障列表（设备/状态/时间范围筛选）
 *       + 一键报修弹窗 + 维修处理弹窗（停机时长实时预览）+ 删除
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Table,
  Button,
  Space,
  Select,
  Tag,
  Popconfirm,
  App,
  Statistic,
  Row,
  Col,
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import {
  getBreakdowns,
  getBreakdownStatistics,
  deleteBreakdown,
  type BreakdownListItem,
  type BreakdownQueryParams,
} from '@/api/breakdown.api';
import BreakdownReportModal from './BreakdownReportModal';
import BreakdownRepairModal from './BreakdownRepairModal';
import { formatDateTime } from '@/utils/format';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  getBreakdownLevel,
  BREAKDOWN_LEVEL_MAP,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';

/** 故障列表页面组件 */
function BreakdownList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // ==================== 弹窗状态 ====================
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [repairModalVisible, setRepairModalVisible] = useState(false);
  const [repairTarget, setRepairTarget] = useState<BreakdownListItem | null>(null);

  // ==================== 列表查询参数 ====================
  const [queryParams, setQueryParams] = useState<BreakdownQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['breakdowns', queryParams],
    queryFn: () => getBreakdowns(queryParams),
  });

  // 统计：累计停机时长 / 故障类型分布
  const { data: statistics } = useQuery({
    queryKey: ['breakdownStatistics'],
    queryFn: () => getBreakdownStatistics(),
  });

  // 待维修数量（统计卡片同源：repairedAt 为空）
  const { data: pendingData } = useQuery({
    queryKey: ['breakdowns', 'pendingCount'],
    queryFn: () => getBreakdowns({ page: 1, pageSize: 1, status: 'pending' }),
  });

  const pendingCount = pendingData?.total ?? 0;

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBreakdown(id),
    onSuccess: () => {
      message.success('删除故障记录成功');
      queryClient.invalidateQueries({ queryKey: ['breakdowns'] });
      queryClient.invalidateQueries({ queryKey: ['breakdownStatistics'] });
    },
  });

  // ==================== 事件处理 ====================

  /** 刷新全部相关缓存（报修/维修成功后设备状态与看板联动） */
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['breakdowns'] });
    queryClient.invalidateQueries({ queryKey: ['breakdownStatistics'] });
    queryClient.invalidateQueries({ queryKey: ['equipments'] });
    queryClient.invalidateQueries({ queryKey: ['equipmentStatusSummary'] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  /** 打开维修处理弹窗 */
  const handleOpenRepair = (record: BreakdownListItem) => {
    setRepairTarget(record);
    setRepairModalVisible(true);
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<BreakdownListItem> = useMemo(
    () => [
      {
        title: '设备',
        key: 'equipment',
        width: 170,
        render: (_, record) =>
          record.equipment
            ? `${record.equipment.code} - ${record.equipment.name}`
            : '-',
      },
      {
        title: '故障类型',
        dataIndex: 'faultType',
        key: 'faultType',
        width: 120,
        ellipsis: true,
      },
      {
        title: '故障描述',
        dataIndex: 'faultDescription',
        key: 'faultDescription',
        ellipsis: true,
        render: (val: string) => val || '-',
      },
      {
        title: '发生时间',
        dataIndex: 'occurredAt',
        key: 'occurredAt',
        width: 160,
        render: (val: string) => formatDateTime(val),
      },
      {
        title: '状态',
        key: 'status',
        width: 100,
        render: (_, record) =>
          record.repairedAt ? (
            <Tag color="success">已修复</Tag>
          ) : (
            <Tag color="error">待维修</Tag>
          ),
      },
      {
        title: '停机时长',
        dataIndex: 'downtimeDuration',
        key: 'downtimeDuration',
        width: 130,
        render: (val: number, record) => {
          if (!record.repairedAt) return '-';
          const level = getBreakdownLevel(val);
          const levelInfo = BREAKDOWN_LEVEL_MAP[level];
          return (
            <Space size={4}>
              <span>{val} 分钟</span>
              <Tag color={levelInfo.color}>{levelInfo.label}</Tag>
            </Space>
          );
        },
      },
      {
        title: '维修人',
        key: 'repairer',
        width: 100,
        render: (_, record) => record.repairer?.name ?? '-',
      },
      {
        title: '修复时间',
        dataIndex: 'repairedAt',
        key: 'repairedAt',
        width: 160,
        render: (val: string | null) => (val ? formatDateTime(val) : '-'),
      },
      {
        title: '维修方法',
        dataIndex: 'repairMethod',
        key: 'repairMethod',
        ellipsis: true,
        render: (val: string) => val || '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 150,
        fixed: 'right',
        render: (_, record) => (
          <Space size="small">
            {!record.repairedAt && (
              <Button
                type="link"
                size="small"
                icon={<ToolOutlined />}
                onClick={() => handleOpenRepair(record)}
                disabled={!hasPermission('equipment:breakdown:repair')}
              >
                维修处理
              </Button>
            )}
            <Popconfirm
              title="确认删除"
              description="确定要删除该故障记录吗？"
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText="确定"
              cancelText="取消"
              disabled={!hasPermission('equipment:breakdown:delete')}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!hasPermission('equipment:breakdown:delete')}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPermission],
  );

  // ==================== 渲染 ====================

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="待维修"
              value={pendingCount}
              valueStyle={{ color: pendingCount > 0 ? '#cf1322' : undefined }}
              suffix="条"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="累计停机时长"
              value={statistics?.totalDowntime ?? 0}
              suffix="分钟"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="最高频故障类型"
              value={
                statistics?.byFaultType?.[0]
                  ? `${statistics.byFaultType[0].faultType}`
                  : '-'
              }
              suffix={
                statistics?.byFaultType?.[0]
                  ? `(${statistics.byFaultType[0].count} 次)`
                  : ''
              }
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选 + 操作区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="维修状态"
            allowClear
            style={{ width: 120 }}
            options={[
              { label: '待维修', value: 'pending' },
              { label: '已修复', value: 'repaired' },
            ]}
            onChange={(v: 'pending' | 'repaired' | undefined) =>
              setQueryParams((prev) => ({ ...prev, page: 1, status: v }))
            }
          />
          <DatePicker.RangePicker
            showTime
            onChange={(
              dates: [Dayjs | null, Dayjs | null] | null,
            ) => {
              setQueryParams((prev) => ({
                ...prev,
                page: 1,
                startDate: dates?.[0] ? dates[0].toISOString() : undefined,
                endDate: dates?.[1] ? dates[1].toISOString() : undefined,
              }));
            }}
          />
          <Button
            type="primary"
            danger
            icon={<PlusOutlined />}
            onClick={() => setReportModalVisible(true)}
            disabled={!hasPermission('equipment:breakdown:create')}
          >
            一键报修
          </Button>
        </Space>
      </Card>

      {/* 故障列表表格 */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.list || []}
        loading={isLoading}
        pagination={{
          current: data?.page || queryParams.page,
          pageSize: data?.pageSize || queryParams.pageSize,
          total: data?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          onChange: (page, pageSize) =>
            setQueryParams((prev) => ({ ...prev, page, pageSize })),
        }}
        scroll={{ x: 1300 }}
      />

      {/* 一键报修弹窗 */}
      <BreakdownReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSuccess={refreshAll}
      />

      {/* 维修处理弹窗 */}
      <BreakdownRepairModal
        record={repairTarget}
        visible={repairModalVisible}
        onClose={() => setRepairModalVisible(false)}
        onSuccess={refreshAll}
      />
    </div>
  );
}

export default BreakdownList;
