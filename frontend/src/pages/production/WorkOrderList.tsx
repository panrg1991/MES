/**
 * MES 系统 - 工单列表页面
 * 功能：工单列表（分页+搜索+筛选）、创建/编辑弹窗、状态流转、删除、跳转详情
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Select,
  Popconfirm,
  Tag,
  Card,
  Progress,
  Dropdown,
  App,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  EyeOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { WorkOrderStatus, WorkOrderPriority } from '@/types';
import {
  getWorkOrders,
  deleteWorkOrder,
  transitionStatus,
  type WorkOrderListItem,
  type WorkOrderQueryParams,
} from '@/api/production.api';
import {
  formatDateTime,
  getWorkOrderStatusInfo,
  getWorkOrderPriorityInfo,
} from '@/utils/format';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  WORK_ORDER_STATUS_TRANSITIONS,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';
import WorkOrderForm from './WorkOrderForm';

/** 状态流转目标状态的按钮标签 */
const TRANSITION_LABELS: Record<WorkOrderStatus, string> = {
  pending: '开始',
  in_progress: '继续',
  paused: '暂停',
  completed: '完成',
  closed: '关闭',
};

/** 状态筛选选项 */
const STATUS_OPTIONS = [
  { label: '待开始', value: 'pending' },
  { label: '进行中', value: 'in_progress' },
  { label: '已暂停', value: 'paused' },
  { label: '已完成', value: 'completed' },
  { label: '已关闭', value: 'closed' },
];

/** 优先级筛选选项 */
const PRIORITY_OPTIONS = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' },
];

/** 工单列表页面组件 */
function WorkOrderList() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // 列表查询参数
  const [queryParams, setQueryParams] = useState<WorkOrderQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
    status: undefined,
    priority: undefined,
  });

  // 弹窗状态
  const [formVisible, setFormVisible] = useState(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrderListItem | null>(null);

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['workOrders', queryParams],
    queryFn: () => getWorkOrders(queryParams),
  });

  // ==================== Mutation 操作 ====================

  /** 删除工单 */
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteWorkOrder(id),
    onSuccess: () => {
      message.success('删除工单成功');
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    },
  });

  /** 状态流转 */
  const transitionMutation = useMutation({
    mutationFn: ({ id, toStatus }: { id: number; toStatus: WorkOrderStatus }) =>
      transitionStatus(id, { toStatus }),
    onSuccess: () => {
      message.success('状态流转成功');
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    },
  });

  // ==================== 事件处理 ====================

  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  const handleStatusFilter = useCallback((value: WorkOrderStatus | undefined) => {
    setQueryParams((prev) => ({ ...prev, page: 1, status: value }));
  }, []);

  const handlePriorityFilter = useCallback(
    (value: WorkOrderPriority | undefined) => {
      setQueryParams((prev) => ({ ...prev, page: 1, priority: value }));
    },
    [],
  );

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    setQueryParams((prev) => ({ ...prev, page, pageSize }));
  }, []);

  const handleAdd = () => {
    setEditingOrder(null);
    setFormVisible(true);
  };

  const handleEdit = (record: WorkOrderListItem) => {
    setEditingOrder(record);
    setFormVisible(true);
  };

  /** 获取状态流转菜单项 */
  const getTransitionItems = (record: WorkOrderListItem) => {
    const allowed = WORK_ORDER_STATUS_TRANSITIONS[record.status] || [];
    return allowed.map((target) => ({
      key: target,
      label: (
        <Popconfirm
          title="确认操作"
          description={`确定将工单状态变更为「${
            getWorkOrderStatusInfo(target).label
          }」吗？`}
          onConfirm={() =>
            transitionMutation.mutate({ id: record.id, toStatus: target })
          }
          okText="确定"
          cancelText="取消"
        >
          <span>{TRANSITION_LABELS[target]}</span>
        </Popconfirm>
      ),
    }));
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<WorkOrderListItem> = [
    {
      title: '工单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
      render: (text: string, record: WorkOrderListItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/production/orders/${record.id}`)}
        >
          {text}
        </Button>
      ),
    },
    {
      title: '产品名称',
      dataIndex: 'productName',
      key: 'productName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '产品编码',
      dataIndex: 'productCode',
      key: 'productCode',
      width: 120,
      ellipsis: true,
    },
    {
      title: '计划量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'center',
    },
    {
      title: '已完成',
      dataIndex: 'completedQty',
      key: 'completedQty',
      width: 80,
      align: 'center',
    },
    {
      title: '进度',
      key: 'progress',
      width: 140,
      render: (_, record: WorkOrderListItem) => (
        <Progress
          percent={record.progress}
          size="small"
          status={
            record.progress >= 100
              ? 'success'
              : record.status === 'closed'
                ? 'normal'
                : 'active'
          }
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: WorkOrderStatus) => {
        const info = getWorkOrderStatusInfo(status);
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority: WorkOrderPriority) => {
        const info = getWorkOrderPriorityInfo(priority);
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '计划开始',
      dataIndex: 'planStart',
      key: 'planStart',
      width: 170,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '计划结束',
      dataIndex: 'planEnd',
      key: 'planEnd',
      width: 170,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: WorkOrderListItem) => {
        const transitionItems = getTransitionItems(record);
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              disabled={!hasPermission('production:order:edit')}
            >
              编辑
            </Button>
            <Dropdown
              menu={{ items: transitionItems }}
              trigger={['click']}
              disabled={
                transitionItems.length === 0 ||
                !hasPermission('production:order:status')
              }
            >
              <Button type="link" size="small">
                状态 <DownOutlined />
              </Button>
            </Dropdown>
            <Popconfirm
              title="确认删除"
              description={`确定要删除工单「${record.orderNo}」吗？`}
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText="确定"
              cancelText="取消"
              disabled={!hasPermission('production:order:delete')}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={
                  !hasPermission('production:order:delete') ||
                  record.status !== 'pending'
                }
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  // ==================== 渲染 ====================

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索工单号/产品名称/编码"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
            onPressEnter={(e) =>
              handleSearch((e.target as HTMLInputElement).value)
            }
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            options={STATUS_OPTIONS}
            onChange={(v: WorkOrderStatus | undefined) => handleStatusFilter(v)}
          />
          <Select
            placeholder="优先级筛选"
            allowClear
            style={{ width: 120 }}
            options={PRIORITY_OPTIONS}
            onChange={(v: WorkOrderPriority | undefined) =>
              handlePriorityFilter(v)
            }
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            disabled={!hasPermission('production:order:create')}
          >
            新增工单
          </Button>
        </Space>
      </Card>

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
          onChange: handlePageChange,
        }}
        scroll={{ x: 1460 }}
      />

      <WorkOrderForm
        editingOrder={editingOrder}
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['workOrders'] })
        }
      />
    </div>
  );
}

export default WorkOrderList;
