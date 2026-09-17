/**
 * MES 系统 - 设备维保计划页面【T07 实现】
 * 路由：/equipment/maintenance 菜单：设备管理
 * 功能：Tabs（计划列表 / 维保记录 / 到期提醒）
 *  - 计划列表：筛选 + 计划表单弹窗 + 登记维保记录弹窗 + 到期标识 Tag（已逾期红 / 即将到期橙）
 *  - 维保记录：按设备/维保类型筛选，登记入口
 *  - 到期提醒：仅 active 且 nextDate <= now + 7 天，含逾期天数
 */

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Tabs,
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
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  FormOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type {
  MaintenanceCycleType,
  MaintenancePlanStatus,
  MaintenanceType,
} from '@/types';
import {
  getMaintenancePlans,
  getDueMaintenancePlans,
  getMaintenanceRecords,
  deleteMaintenancePlan,
  deleteMaintenanceRecord,
  type MaintenancePlanListItem,
  type MaintenancePlanQueryParams,
  type MaintenanceRecordListItem,
  type MaintenanceRecordQueryParams,
} from '@/api/maintenance.api';
import MaintenancePlanFormModal from './MaintenancePlanFormModal';
import MaintenanceRecordModal from './MaintenanceRecordModal';
import {
  formatDate,
  formatDateTime,
} from '@/utils/format';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  MAINTENANCE_CYCLE_MAP,
  MAINTENANCE_CYCLE_OPTIONS,
  MAINTENANCE_TYPE_MAP,
  MAINTENANCE_TYPE_OPTIONS,
  MAINTENANCE_PLAN_STATUS_MAP,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';

/** 到期提醒标识：已逾期（红）/ 即将到期（橙）/ 正常 */
function DueTag({ plan }: { plan: MaintenancePlanListItem }) {
  if (!plan.status || plan.status !== 'active') {
    return <Tag>停用</Tag>;
  }
  if (plan.isDue) {
    return <Tag color="error">已逾期</Tag>;
  }
  if (plan.dueSoon) {
    return <Tag color="warning">即将到期</Tag>;
  }
  return <Tag color="success">正常</Tag>;
}

/** 维保计划页面组件 */
function MaintenancePlan() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [searchParams] = useSearchParams();

  // 当前 Tab（支持看板「待维保」卡片 ?tab=due 跳入）
  const [activeTab, setActiveTab] = useState<string>(
    searchParams.get('tab') === 'due' ? 'due' : 'plans',
  );

  // ==================== 弹窗状态 ====================
  const [planFormVisible, setPlanFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlanListItem | null>(null);
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [recordInitialPlan, setRecordInitialPlan] =
    useState<MaintenancePlanListItem | null>(null);

  // ==================== 计划列表查询参数 ====================
  const [planQuery, setPlanQuery] = useState<MaintenancePlanQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // ==================== 记录列表查询参数 ====================
  const [recordQuery, setRecordQuery] = useState<MaintenanceRecordQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // ==================== 数据查询 ====================

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['maintenancePlans', planQuery],
    queryFn: () => getMaintenancePlans(planQuery),
  });

  const { data: recordData, isLoading: recordLoading } = useQuery({
    queryKey: ['maintenanceRecords', recordQuery],
    queryFn: () => getMaintenanceRecords(recordQuery),
    enabled: activeTab === 'records' || activeTab === 'plans',
  });

  // 到期提醒（Tab 角标同源）
  const { data: dueData, isLoading: dueLoading } = useQuery({
    queryKey: ['maintenanceDue', 7],
    queryFn: () => getDueMaintenancePlans(7),
  });

  const dueList = dueData?.list ?? [];
  const overdueCount = dueList.filter((p) => p.overdueDays && p.overdueDays > 0).length;
  const dueSoonCount = dueList.length - overdueCount;

  // ==================== Mutation ====================

  const deletePlanMutation = useMutation({
    mutationFn: (id: number) => deleteMaintenancePlan(id),
    onSuccess: () => {
      message.success('删除维保计划成功');
      queryClient.invalidateQueries({ queryKey: ['maintenancePlans'] });
      queryClient.invalidateQueries({ queryKey: ['maintenanceDue'] });
      queryClient.invalidateQueries({ queryKey: ['maintenancePlanOptions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const deleteRecordMutation = useMutation({
    mutationFn: (id: number) => deleteMaintenanceRecord(id),
    onSuccess: () => {
      message.success('删除维保记录成功');
      queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
    },
  });

  // ==================== 事件处理 ====================

  /** 刷新全部相关缓存 */
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['maintenancePlans'] });
    queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
    queryClient.invalidateQueries({ queryKey: ['maintenanceDue'] });
    queryClient.invalidateQueries({ queryKey: ['maintenancePlanOptions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  /** 打开计划新增/编辑弹窗 */
  const handleOpenPlanForm = (plan: MaintenancePlanListItem | null) => {
    setEditingPlan(plan);
    setPlanFormVisible(true);
  };

  /** 打开登记维保记录弹窗（可预关联计划） */
  const handleOpenRecordModal = (plan: MaintenancePlanListItem | null) => {
    setRecordInitialPlan(plan);
    setRecordModalVisible(true);
  };

  // ==================== 表格列定义 ====================

  const planColumns: ColumnsType<MaintenancePlanListItem> = useMemo(
    () => [
      {
        title: '计划名称',
        dataIndex: 'planName',
        key: 'planName',
        width: 180,
        ellipsis: true,
      },
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
        title: '维保周期',
        dataIndex: 'cycleType',
        key: 'cycleType',
        width: 130,
        render: (type: MaintenanceCycleType, record) => {
          const info = MAINTENANCE_CYCLE_MAP[type] ?? {
            label: type,
            color: 'default',
            days: record.cycleDays,
          };
          return (
            <Space size={4}>
              <Tag color={info.color}>{info.label}</Tag>
              <span style={{ color: '#8c8c8c' }}>{record.cycleDays}天</span>
            </Space>
          );
        },
      },
      {
        title: '下次维保日期',
        dataIndex: 'nextDate',
        key: 'nextDate',
        width: 130,
        render: (val: string) => formatDate(val),
      },
      {
        title: '到期状态',
        key: 'due',
        width: 110,
        render: (_, record) => <DueTag plan={record} />,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (status: MaintenancePlanStatus) => {
          const info = MAINTENANCE_PLAN_STATUS_MAP[status];
          return <Tag color={info?.color ?? 'default'}>{info?.label ?? status}</Tag>;
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 220,
        fixed: 'right',
        render: (_, record) => (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<FormOutlined />}
              onClick={() => handleOpenRecordModal(record)}
              disabled={!hasPermission('equipment:maintenance:complete')}
            >
              登记
            </Button>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenPlanForm(record)}
              disabled={!hasPermission('equipment:maintenance:edit')}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认删除"
              description={`确定要删除计划「${record.planName}」吗？历史维保记录将保留。`}
              onConfirm={() => deletePlanMutation.mutate(record.id)}
              okText="确定"
              cancelText="取消"
              disabled={!hasPermission('equipment:maintenance:delete')}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!hasPermission('equipment:maintenance:delete')}
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

  const recordColumns: ColumnsType<MaintenanceRecordListItem> = useMemo(
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
        title: '关联计划',
        key: 'plan',
        width: 160,
        ellipsis: true,
        render: (_, record) =>
          record.plan ? (
            record.plan.planName
          ) : (
            <Tag>临时保养</Tag>
          ),
      },
      {
        title: '维保类型',
        dataIndex: 'maintenanceType',
        key: 'maintenanceType',
        width: 120,
        render: (type: MaintenanceType) => {
          const info = MAINTENANCE_TYPE_MAP[type];
          return <Tag color={info?.color ?? 'default'}>{info?.label ?? type}</Tag>;
        },
      },
      {
        title: '维保人员',
        key: 'maintainer',
        width: 110,
        render: (_, record) => record.maintainer?.name ?? '-',
      },
      {
        title: '开始时间',
        dataIndex: 'startTime',
        key: 'startTime',
        width: 160,
        render: (val: string) => formatDateTime(val),
      },
      {
        title: '结束时间',
        dataIndex: 'endTime',
        key: 'endTime',
        width: 160,
        render: (val: string | null) => (val ? formatDateTime(val) : '进行中'),
      },
      {
        title: '维保内容',
        dataIndex: 'content',
        key: 'content',
        ellipsis: true,
        render: (val: string) => val || '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 90,
        fixed: 'right',
        render: (_, record) => (
          <Popconfirm
            title="确认删除"
            description="确定要删除该维保记录吗？"
            onConfirm={() => deleteRecordMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={!hasPermission('equipment:maintenance:delete')}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!hasPermission('equipment:maintenance:delete')}
            >
              删除
            </Button>
          </Popconfirm>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPermission],
  );

  const dueColumns: ColumnsType<MaintenancePlanListItem> = useMemo(
    () => [
      {
        title: '计划名称',
        dataIndex: 'planName',
        key: 'planName',
        width: 180,
        ellipsis: true,
      },
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
        title: '下次维保日期',
        dataIndex: 'nextDate',
        key: 'nextDate',
        width: 130,
        render: (val: string) => formatDate(val),
      },
      {
        title: '提醒状态',
        key: 'due',
        width: 150,
        render: (_, record) =>
          record.overdueDays && record.overdueDays > 0 ? (
            <Tag color="error" icon={<WarningOutlined />}>
              已逾期 {record.overdueDays} 天
            </Tag>
          ) : (
            <Tag color="warning" icon={<ClockCircleOutlined />}>
              {dayjs(record.nextDate).diff(dayjs(), 'day')} 天内到期
            </Tag>
          ),
      },
      {
        title: '操作',
        key: 'action',
        width: 110,
        render: (_, record) => (
          <Button
            type="link"
            size="small"
            icon={<FormOutlined />}
            onClick={() => handleOpenRecordModal(record)}
            disabled={!hasPermission('equipment:maintenance:complete')}
          >
            登记维保
          </Button>
        ),
      },
    ],
    [hasPermission],
  );

  // ==================== 渲染 ====================

  const tabItems = [
    {
      key: 'plans',
      label: '计划列表',
      children: (
        <div>
          {/* 筛选 + 操作区 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              <Select
                placeholder="周期类型筛选"
                allowClear
                style={{ width: 130 }}
                options={MAINTENANCE_CYCLE_OPTIONS}
                onChange={(v: MaintenanceCycleType | undefined) =>
                  setPlanQuery((prev) => ({ ...prev, page: 1, cycleType: v }))
                }
              />
              <Select
                placeholder="状态筛选"
                allowClear
                style={{ width: 110 }}
                options={(
                  Object.keys(MAINTENANCE_PLAN_STATUS_MAP) as MaintenancePlanStatus[]
                ).map((s) => ({
                  label: MAINTENANCE_PLAN_STATUS_MAP[s].label,
                  value: s,
                }))}
                onChange={(v: MaintenancePlanStatus | undefined) =>
                  setPlanQuery((prev) => ({ ...prev, page: 1, status: v }))
                }
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleOpenPlanForm(null)}
                disabled={!hasPermission('equipment:maintenance:create')}
              >
                新增计划
              </Button>
              <Button
                icon={<FormOutlined />}
                onClick={() => handleOpenRecordModal(null)}
                disabled={!hasPermission('equipment:maintenance:complete')}
              >
                登记维保记录
              </Button>
            </Space>
          </Card>

          <Table
            rowKey="id"
            columns={planColumns}
            dataSource={planData?.list || []}
            loading={planLoading}
            pagination={{
              current: planData?.page || planQuery.page,
              pageSize: planData?.pageSize || planQuery.pageSize,
              total: planData?.total || 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              onChange: (page, pageSize) =>
                setPlanQuery((prev) => ({ ...prev, page, pageSize })),
            }}
            scroll={{ x: 1100 }}
          />
        </div>
      ),
    },
    {
      key: 'records',
      label: '维保记录',
      children: (
        <div>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              <Select
                placeholder="维保类型筛选"
                allowClear
                style={{ width: 150 }}
                options={MAINTENANCE_TYPE_OPTIONS}
                onChange={(v: MaintenanceType | undefined) =>
                  setRecordQuery((prev) => ({ ...prev, page: 1, maintenanceType: v }))
                }
              />
              <Button
                type="primary"
                icon={<FormOutlined />}
                onClick={() => handleOpenRecordModal(null)}
                disabled={!hasPermission('equipment:maintenance:complete')}
              >
                登记维保记录
              </Button>
            </Space>
          </Card>

          <Table
            rowKey="id"
            columns={recordColumns}
            dataSource={recordData?.list || []}
            loading={recordLoading}
            pagination={{
              current: recordData?.page || recordQuery.page,
              pageSize: recordData?.pageSize || recordQuery.pageSize,
              total: recordData?.total || 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              onChange: (page, pageSize) =>
                setRecordQuery((prev) => ({ ...prev, page, pageSize })),
            }}
            scroll={{ x: 1100 }}
          />
        </div>
      ),
    },
    {
      key: 'due',
      label: `到期提醒 (${dueList.length})`,
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="已逾期"
                  value={overdueCount}
                  valueStyle={{ color: '#cf1322' }}
                  suffix="项"
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="7 天内到期"
                  value={dueSoonCount}
                  valueStyle={{ color: '#d46b08' }}
                  suffix="项"
                />
              </Card>
            </Col>
          </Row>

          <Table
            rowKey="id"
            columns={dueColumns}
            dataSource={dueList}
            loading={dueLoading}
            pagination={false}
            locale={{ emptyText: '暂无到期维保任务，设备状态良好' }}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      {/* 维保计划新增/编辑弹窗 */}
      <MaintenancePlanFormModal
        editingPlan={editingPlan}
        visible={planFormVisible}
        onClose={() => setPlanFormVisible(false)}
        onSuccess={refreshAll}
      />

      {/* 登记维保记录弹窗 */}
      <MaintenanceRecordModal
        initialPlan={recordInitialPlan}
        visible={recordModalVisible}
        onClose={() => setRecordModalVisible(false)}
        onSuccess={refreshAll}
      />
    </div>
  );
}

export default MaintenancePlan;
