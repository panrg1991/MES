/**
 * MES 系统 - 工单详情页面
 * 功能：基本信息 + 进度条 + 状态操作 + 报工录入 + 报工记录表格 + 状态流转时间线
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Tag,
  Progress,
  Table,
  Timeline,
  Tabs,
  Spin,
  App,
  Row,
  Col,
} from 'antd';
import {
  ArrowLeftOutlined,
  ThunderboltOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { WorkOrderStatus } from '@/types';
import {
  getWorkOrderById,
  transitionStatus,
} from '@/api/production.api';
import { getSchedules, type ScheduleListItem } from '@/api/schedule.api';
import {
  formatDateTime,
  getWorkOrderStatusInfo,
  getWorkOrderPriorityInfo,
} from '@/utils/format';
import { SCHEDULE_STATUS_MAP, WORK_ORDER_STATUS_TRANSITIONS } from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';
import ProductionReport from './ProductionReport';

/** 状态流转按钮标签 */
const TRANSITION_LABELS: Record<WorkOrderStatus, string> = {
  pending: '开始生产',
  in_progress: '继续生产',
  paused: '暂停',
  completed: '完成生产',
  closed: '关闭工单',
};

/** 报工记录列表项 */
interface ReportItem {
  id: number;
  completedQty: number;
  defectQty: number;
  reportTime: string;
  remark: string;
  operator?: { id: number; name: string; department: string };
}

/** 工单详情页面组件 */
function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [reportVisible, setReportVisible] = useState(false);

  // ==================== 数据查询 ====================

  const { data: order, isLoading } = useQuery({
    queryKey: ['workOrder', id],
    queryFn: () => getWorkOrderById(Number(id)),
    enabled: !!id,
  });

  // 【P1-I2 排程区块】该工单的排程信息（传 workOrderId 时不限时间窗，展示全部排程）
  const canViewSchedule = hasPermission('production:schedule:view');
  const { data: scheduleData } = useQuery({
    queryKey: ['schedules', { workOrderId: Number(id) }],
    queryFn: () => getSchedules({ workOrderId: Number(id) }),
    enabled: !!id && canViewSchedule,
  });

  // ==================== Mutation ====================

  const transitionMutation = useMutation({
    mutationFn: ({ toStatus }: { toStatus: WorkOrderStatus }) =>
      transitionStatus(Number(id), { toStatus }),
    onSuccess: () => {
      message.success('状态流转成功');
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    },
  });

  // ==================== 渲染 ====================

  if (isLoading || !order) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="加载中...">
          <div style={{ minHeight: 60 }} />
        </Spin>
      </div>
    );
  }

  const statusInfo = getWorkOrderStatusInfo(order.status);
  const priorityInfo = getWorkOrderPriorityInfo(order.priority);
  const allowedTransitions = WORK_ORDER_STATUS_TRANSITIONS[order.status] || [];

  /** 报工记录表格列 */
  const reportColumns: ColumnsType<ReportItem> = [
    {
      title: '报工时间',
      dataIndex: 'reportTime',
      key: 'reportTime',
      width: 180,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '完成数量',
      dataIndex: 'completedQty',
      key: 'completedQty',
      width: 100,
      align: 'center',
    },
    {
      title: '不良数量',
      dataIndex: 'defectQty',
      key: 'defectQty',
      width: 100,
      align: 'center',
      render: (val: number) => (val > 0 ? <Tag color="error">{val}</Tag> : val),
    },
    {
      title: '操作人',
      key: 'operator',
      width: 120,
      render: (_, record: ReportItem) => record.operator?.name || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },
  ];

  /** 【P1-I2 排程区块】排程信息表格列 */
  const scheduleColumns: ColumnsType<ScheduleListItem> = [
    {
      title: '设备',
      key: 'equipment',
      width: 140,
      render: (_, record) =>
        record.equipment ? `${record.equipment.code} · ${record.equipment.name}` : '未指定设备',
    },
    {
      title: '计划开始',
      dataIndex: 'plannedStart',
      key: 'plannedStart',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '计划结束',
      dataIndex: 'plannedEnd',
      key: 'plannedEnd',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '实际开始',
      dataIndex: 'actualStart',
      key: 'actualStart',
      width: 170,
      render: (val: string | null) => formatDateTime(val),
    },
    {
      title: '实际结束',
      dataIndex: 'actualEnd',
      key: 'actualEnd',
      width: 170,
      render: (val: string | null) => formatDateTime(val),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val: ScheduleListItem['status']) => (
        <Tag color={SCHEDULE_STATUS_MAP[val].color}>{SCHEDULE_STATUS_MAP[val].label}</Tag>
      ),
    },
  ];

  return (
    <div>
      {/* 页头 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/production/orders')}
          >
            返回列表
          </Button>
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>
            工单详情：{order.orderNo}
          </span>
          <Tag color={statusInfo.color} style={{ fontSize: 14 }}>
            {statusInfo.label}
          </Tag>
        </Space>
      </div>

      {/* 基本信息 + 进度 */}
      <Row gutter={16}>
        <Col span={16}>
          <Card title="基本信息" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="工单号">
                {order.orderNo}
              </Descriptions.Item>
              <Descriptions.Item label="产品名称">
                {order.productName}
              </Descriptions.Item>
              <Descriptions.Item label="产品编码">
                {order.productCode}
              </Descriptions.Item>
              <Descriptions.Item label="优先级">
                <Tag color={priorityInfo.color}>{priorityInfo.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="计划数量">
                {order.quantity}
              </Descriptions.Item>
              <Descriptions.Item label="已完成数量">
                {order.completedQty}
              </Descriptions.Item>
              <Descriptions.Item label="不良数量">
                {order.defectQty > 0 ? (
                  <Tag color="error">{order.defectQty}</Tag>
                ) : (
                  order.defectQty
                )}
              </Descriptions.Item>
              <Descriptions.Item label="所属车间">
                {order.workshop?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="计划开始">
                {formatDateTime(order.planStart)}
              </Descriptions.Item>
              <Descriptions.Item label="计划结束">
                {formatDateTime(order.planEnd)}
              </Descriptions.Item>
              <Descriptions.Item label="实际开始">
                {formatDateTime(order.actualStart)}
              </Descriptions.Item>
              <Descriptions.Item label="实际结束">
                {formatDateTime(order.actualEnd)}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {order.remark || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="生产进度" size="small">
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Progress
                type="circle"
                percent={order.progress}
                size={120}
                status={
                  order.progress >= 100
                    ? 'success'
                    : order.status === 'closed'
                      ? 'normal'
                      : 'active'
                }
              />
              <div style={{ marginTop: 12, color: '#8c8c8c' }}>
                {order.completedQty} / {order.quantity}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 操作按钮区 */}
      <Card size="small" style={{ marginTop: 16 }}>
        <Space wrap>
          {allowedTransitions.map((target) => (
            <Button
              key={target}
              type={
                target === 'completed' || target === 'closed'
                  ? 'primary'
                  : 'default'
              }
              danger={target === 'closed'}
              icon={<ThunderboltOutlined />}
              onClick={() => transitionMutation.mutate({ toStatus: target })}
              loading={transitionMutation.isPending}
              disabled={!hasPermission('production:order:status')}
            >
              {TRANSITION_LABELS[target]}
            </Button>
          ))}
          <Button
            type="dashed"
            onClick={() => setReportVisible(true)}
            disabled={
              order.status !== 'in_progress' ||
              !hasPermission('production:order:report')
            }
          >
            报工
          </Button>
          {/* 【P1-I2 追溯入口，T10】跳转质量追溯页并自动按工单号查询（T09 已支持带参查询） */}
          {hasPermission('quality:traceability:view') && (
            <Button
              type="dashed"
              icon={<FileSearchOutlined />}
              onClick={() =>
                navigate(`/quality/traceability?workOrderNo=${order.orderNo}`)
              }
            >
              质量追溯
            </Button>
          )}
        </Space>
      </Card>

      {/* 报工记录 + 状态日志 */}
      <Card style={{ marginTop: 16 }}>
        <Tabs
          items={[
            {
              key: 'reports',
              label: `报工记录 (${order.reports.length})`,
              children: (
                <Table
                  rowKey="id"
                  columns={reportColumns}
                  dataSource={order.reports}
                  pagination={false}
                  size="small"
                  scroll={{ y: 300 }}
                />
              ),
            },
            {
              key: 'logs',
              label: `状态流转 (${order.statusLogs.length})`,
              children: (
                <Timeline
                  items={order.statusLogs.map((log) => {
                    const fromInfo = getWorkOrderStatusInfo(log.fromStatus);
                    const toInfo = getWorkOrderStatusInfo(log.toStatus);
                    return {
                      children: (
                        <div>
                          <p style={{ marginBottom: 4 }}>
                            <Tag color={fromInfo.color}>{fromInfo.label}</Tag>
                            →
                            <Tag color={toInfo.color} style={{ marginLeft: 4 }}>
                              {toInfo.label}
                            </Tag>
                          </p>
                          <p style={{ marginBottom: 4, color: '#8c8c8c' }}>
                            {formatDateTime(log.changedAt)} ·{' '}
                            {log.operator?.name || '系统'}
                          </p>
                          {log.remark && (
                            <p style={{ marginBottom: 0, color: '#8c8c8c' }}>
                              {log.remark}
                            </p>
                          )}
                        </div>
                      ),
                    };
                  })}
                />
              ),
            },
            // 【P1-I2 排程区块，T08】该工单的排程信息（需 production:schedule:view 权限）
            ...(canViewSchedule
              ? [
                  {
                    key: 'schedules',
                    label: `生产排程 (${scheduleData?.total ?? 0})`,
                    children: (
                      <Table
                        rowKey="id"
                        columns={scheduleColumns}
                        dataSource={scheduleData?.list ?? []}
                        pagination={false}
                        size="small"
                        locale={{ emptyText: '该工单暂无排程，可在「生产排程」页面创建' }}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      {/* 报工弹窗 */}
      <ProductionReport
        workOrderId={Number(id)}
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['workOrder', id] })
        }
      />
    </div>
  );
}

export default WorkOrderDetail;
