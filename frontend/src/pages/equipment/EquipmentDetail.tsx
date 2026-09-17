/**
 * MES 系统 - 设备详情页面
 * 功能：基本信息 + 状态操作 + 状态变更历史时间线 + 维保记录 / 故障记录 Tabs（P1 I1）
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
  Timeline,
  Spin,
  App,
  Row,
  Col,
  Result,
  Modal,
  Form,
  Select,
  Input,
  Tabs,
  Empty,
  Table,
  Statistic,
} from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { EquipmentStatus, MaintenanceType } from '@/types';
import {
  getEquipmentById,
  changeEquipmentStatus,
} from '@/api/equipment.api';
import {
  getMaintenanceRecords,
  type MaintenanceRecordListItem,
} from '@/api/maintenance.api';
import {
  getBreakdowns,
  type BreakdownListItem,
} from '@/api/breakdown.api';
import {
  formatDateTime,
  formatDate,
  getEquipmentStatusInfo,
} from '@/utils/format';
import {
  EQUIPMENT_STATUS_MAP,
  MAINTENANCE_TYPE_MAP,
  BREAKDOWN_LEVEL_MAP,
  getBreakdownLevel,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';

const { TextArea } = Input;

/** 状态切换表单数据 */
interface StatusChangeFormData {
  newStatus: EquipmentStatus;
  remark?: string;
}

/** 设备详情页面组件 */
function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // 状态切换弹窗
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [statusForm] = Form.useForm<StatusChangeFormData>();

  // ==================== 数据查询 ====================

  const {
    data: equipment,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['equipment', id],
    queryFn: () => getEquipmentById(Number(id)),
    enabled: !!id,
  });

  // 【P1 I1】该设备维保记录 / 故障记录（Tab 数据源 + 累计统计值）
  const { data: maintenanceData } = useQuery({
    queryKey: ['maintenanceRecords', 'equipment', id],
    queryFn: () =>
      getMaintenanceRecords({ equipmentId: Number(id), page: 1, pageSize: 100 }),
    enabled: !!id,
  });

  const { data: breakdownData } = useQuery({
    queryKey: ['breakdowns', 'equipment', id],
    queryFn: () =>
      getBreakdowns({ equipmentId: Number(id), page: 1, pageSize: 100 }),
    enabled: !!id,
  });

  const maintenanceRecords = maintenanceData?.list ?? [];
  const breakdownRecords = breakdownData?.list ?? [];
  const totalDowntime = breakdownRecords.reduce(
    (sum, r) => sum + r.downtimeDuration,
    0,
  );

  // ==================== Mutation ====================

  /** 切换设备状态 */
  const statusMutation = useMutation({
    mutationFn: ({
      newStatus,
      remark,
    }: {
      newStatus: EquipmentStatus;
      remark: string;
    }) => changeEquipmentStatus(Number(id), { newStatus, remark }),
    onSuccess: () => {
      message.success('设备状态切换成功');
      queryClient.invalidateQueries({ queryKey: ['equipment', id] });
      queryClient.invalidateQueries({
        queryKey: ['equipments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['equipmentStatusSummary'],
      });
      setStatusModalVisible(false);
      statusForm.resetFields();
    },
  });

  // ==================== 事件处理 ====================

  /** 打开状态切换弹窗 */
  const handleOpenStatusModal = () => {
    statusForm.resetFields();
    setStatusModalVisible(true);
  };

  /** 提交状态切换 */
  const handleSubmitStatus = async () => {
    try {
      const values = await statusForm.validateFields();
      statusMutation.mutate({
        newStatus: values.newStatus,
        remark: values.remark || '',
      });
    } catch {
      // 校验失败
    }
  };

  // ==================== 加载/错误状态处理 ====================

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="加载中...">
          <div style={{ minHeight: 60 }} />
        </Spin>
      </div>
    );
  }

  if (isError || !equipment) {
    return (
      <Result
        status="error"
        title="设备信息加载失败"
        subTitle="无法获取设备详情，请检查设备是否存在或稍后重试。"
        extra={
          <Button type="primary" onClick={() => navigate('/equipment/list')}>
            返回列表
          </Button>
        }
      />
    );
  }

  // ==================== 派生数据 ====================

  const statusInfo = getEquipmentStatusInfo(equipment.status);

  /** 可切换的目标状态列表（排除当前状态） */
  const statusOptions = (
    Object.keys(EQUIPMENT_STATUS_MAP) as EquipmentStatus[]
  )
    .filter((s) => s !== equipment.status)
    .map((s) => ({
      label: EQUIPMENT_STATUS_MAP[s].label,
      value: s,
    }));

  /** 维保记录 Tab 列定义 */
  const maintenanceColumns: ColumnsType<MaintenanceRecordListItem> = [
    {
      title: '维保类型',
      dataIndex: 'maintenanceType',
      key: 'maintenanceType',
      width: 110,
      render: (type: MaintenanceType) => {
        const info = MAINTENANCE_TYPE_MAP[type];
        return <Tag color={info?.color ?? 'default'}>{info?.label ?? type}</Tag>;
      },
    },
    {
      title: '关联计划',
      key: 'plan',
      width: 150,
      ellipsis: true,
      render: (_, record) =>
        record.plan ? record.plan.planName : <Tag>临时保养</Tag>,
    },
    {
      title: '维保人员',
      key: 'maintainer',
      width: 100,
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
  ];

  /** 故障记录 Tab 列定义 */
  const breakdownColumns: ColumnsType<BreakdownListItem> = [
    {
      title: '故障类型',
      dataIndex: 'faultType',
      key: 'faultType',
      width: 110,
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
      width: 90,
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
      width: 120,
      render: (val: number, record) => {
        if (!record.repairedAt) return '-';
        const levelInfo = BREAKDOWN_LEVEL_MAP[getBreakdownLevel(val)];
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
      width: 90,
      render: (_, record) => record.repairer?.name ?? '-',
    },
    {
      title: '修复时间',
      dataIndex: 'repairedAt',
      key: 'repairedAt',
      width: 160,
      render: (val: string | null) => (val ? formatDateTime(val) : '-'),
    },
  ];

  // ==================== 渲染 ====================

  return (
    <div>
      {/* 页头 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/equipment/list')}
          >
            返回列表
          </Button>
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>
            设备详情：{equipment.name}
          </span>
          <Tag color={statusInfo.color} style={{ fontSize: 14 }}>
            {statusInfo.label}
          </Tag>
        </Space>
      </div>

      {/* 基本信息 + 状态操作 */}
      <Row gutter={16}>
        <Col span={16}>
          <Card title="基本信息" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="设备编码">
                {equipment.code}
              </Descriptions.Item>
              <Descriptions.Item label="设备名称">
                {equipment.name}
              </Descriptions.Item>
              <Descriptions.Item label="设备类型">
                {equipment.type}
              </Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="所属车间">
                {equipment.workshop?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="存放位置">
                {equipment.location}
              </Descriptions.Item>
              <Descriptions.Item label="制造商">
                {equipment.manufacturer || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="设备型号">
                {equipment.model || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="采购日期">
                {formatDate(equipment.purchaseDate)}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {formatDateTime(equipment.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {equipment.remark || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="状态操作" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handleOpenStatusModal}
                disabled={!hasPermission('equipment:list:status')}
                block
              >
                切换设备状态
              </Button>
              <div style={{ marginTop: 8 }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="运行中">
                    <Tag color="success">运行</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="待机">
                    <Tag color="default">待机</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="停机">
                    <Tag color="warning">停机</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="故障">
                    <Tag color="error">故障</Tag>
                  </Descriptions.Item>
                </Descriptions>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 状态变更历史 + 维保信息 */}
      <Card style={{ marginTop: 16 }}>
        <Tabs
          items={[
            {
              key: 'statusLogs',
              label: `状态变更记录 (${equipment.statusLogs.length})`,
              children:
                equipment.statusLogs.length > 0 ? (
                  <Timeline
                    items={equipment.statusLogs.map((log) => {
                      const fromInfo = getEquipmentStatusInfo(
                        log.oldStatus,
                      );
                      const toInfo = getEquipmentStatusInfo(log.newStatus);
                      return {
                        color: toInfo.color === 'error' ? 'red' : 'blue',
                        children: (
                          <div>
                            <p style={{ marginBottom: 4 }}>
                              <Tag color={fromInfo.color}>
                                {fromInfo.label}
                              </Tag>
                              →
                              <Tag
                                color={toInfo.color}
                                style={{ marginLeft: 4 }}
                              >
                                {toInfo.label}
                              </Tag>
                            </p>
                            <p
                              style={{ marginBottom: 4, color: '#8c8c8c' }}
                            >
                              {formatDateTime(log.changedAt)} ·{' '}
                              {log.changedBy?.name || '系统'}
                            </p>
                            {log.remark && (
                              <p
                                style={{
                                  marginBottom: 0,
                                  color: '#8c8c8c',
                                }}
                              >
                                {log.remark}
                              </p>
                            )}
                          </div>
                        ),
                      };
                    })}
                  />
                ) : (
                  <Empty description="暂无状态变更记录" />
                ),
            },
            {
              key: 'maintenanceRecords',
              label: `维保记录 (${maintenanceData?.total ?? 0})`,
              children: (
                <div>
                  {/* 累计统计值（P1 I1） */}
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={6}>
                      <Statistic title="累计维保次数" value={maintenanceData?.total ?? 0} suffix="次" />
                    </Col>
                    <Col span={6}>
                      <Statistic title="累计故障次数" value={breakdownData?.total ?? 0} suffix="次" />
                    </Col>
                    <Col span={6}>
                      <Statistic title="累计停机时长" value={totalDowntime} suffix="分钟" />
                    </Col>
                  </Row>

                  <Table
                    rowKey="id"
                    columns={maintenanceColumns}
                    dataSource={maintenanceRecords}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: '暂无维保记录' }}
                  />
                </div>
              ),
            },
            {
              key: 'breakdownRecords',
              label: `故障记录 (${breakdownData?.total ?? 0})`,
              children: (
                <Table
                  rowKey="id"
                  columns={breakdownColumns}
                  dataSource={breakdownRecords}
                  pagination={false}
                  size="small"
                  locale={{ emptyText: '暂无故障记录' }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 状态切换弹窗 */}
      <Modal
        title={`切换设备状态 - ${equipment.name}`}
        open={statusModalVisible}
        onOk={handleSubmitStatus}
        onCancel={() => setStatusModalVisible(false)}
        confirmLoading={statusMutation.isPending}
        okButtonProps={{
          disabled: !hasPermission('equipment:list:status'),
        }}
        okText="确认"
        cancelText="取消"
        destroyOnHidden
        width={450}
      >
        <Form<StatusChangeFormData>
          form={statusForm}
          layout="vertical"
        >
          <Form.Item label="当前状态">
            <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
          </Form.Item>
          <Form.Item
            label="目标状态"
            name="newStatus"
            rules={[{ required: true, message: '请选择目标状态' }]}
          >
            <Select
              options={statusOptions}
              placeholder="请选择目标状态"
            />
          </Form.Item>
          <Form.Item
            label="备注"
            name="remark"
            rules={[{ max: 500, message: '备注最多 500 个字符' }]}
          >
            <TextArea
              rows={3}
              placeholder="请输入状态切换原因（可选）"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default EquipmentDetail;
