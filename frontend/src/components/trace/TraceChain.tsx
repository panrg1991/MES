/**
 * MES 系统 - 追溯链路展示组件（P1-04，T09）
 * 展示形态（PRD 建议）：antd Steps（纵向）+ Descriptions + Table 组合，不做关系图谱。
 * 步骤顺序：工单信息 → 领料批次 → 生产排程/设备 → 报工与人员 → 质量检验 → 不良处理。
 * 各段空数据显示「暂无记录」占位；记录提供跳转到对应 P0 模块页面的链接。
 */

import { Table, Steps, Descriptions, Tag, Button, Empty, Typography } from 'antd';
import {
  LinkOutlined,
  ExperimentOutlined,
  AlertOutlined,
  UserOutlined,
  ClusterOutlined,
  InboxOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type {
  TraceChain,
  TraceMaterialItem,
  TraceExecutionItem,
  TraceQualityItem,
  TraceDefectItem,
  InspectionResult,
  DefectHandlingMethod,
  TransactionType,
  WorkOrderStatus,
} from '@/types';
import {
  WORK_ORDER_STATUS_MAP,
  INSPECTION_RESULT_MAP,
  DEFECT_HANDLING_MAP,
  TRANSACTION_TYPE_MAP,
} from '@/utils/constants';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';

/** 设备链路项（后端附加 equipmentId 供跳转，类型定义中为可选扩展字段） */
interface TraceEquipmentItemEx {
  equipmentId: number | null;
  equipmentCode: string;
  equipmentName: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  breakdown: Array<{
    occurredAt: string;
    faultType: string;
    faultDescription: string;
    repairedAt: string | null;
    downtimeDuration: number;
  }>;
}

/** 段落空数据占位 */
function EmptySection({ text }: { text: string }) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={text}
      style={{ margin: '8px 0' }}
    />
  );
}

/** 检验结果 Tag */
function ResultTag({ result }: { result: InspectionResult }) {
  const info = INSPECTION_RESULT_MAP[result] ?? {
    label: result,
    color: 'default',
  };
  return <Tag color={info.color}>{info.label}</Tag>;
}

/** 追溯链路展示组件属性 */
interface TraceChainProps {
  /** 单工单完整追溯链路 */
  chain: TraceChain;
}

/** 追溯链路展示组件（纵向 Steps：领料批次 → 排程/设备 → 报工人员 → 检验 → 不良） */
function TraceChainView({ chain }: TraceChainProps) {
  const navigate = useNavigate();
  const { workOrder } = chain;
  const equipmentChain = chain.equipmentChain as TraceEquipmentItemEx[];

  const statusInfo =
    WORK_ORDER_STATUS_MAP[workOrder.status as WorkOrderStatus] ?? {
      label: workOrder.status,
      color: 'default',
    };

  // ---- ① 物料来源（领料批次） ----
  const materialColumns: ColumnsType<TraceMaterialItem> = [
    { title: '批次号', dataIndex: 'batchNo', key: 'batchNo', width: 140 },
    {
      title: '物料',
      key: 'material',
      width: 180,
      ellipsis: true,
      render: (_, record) =>
        `${record.materialCode} ${record.materialName}`,
    },
    { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 120, ellipsis: true },
    {
      title: '入库日期',
      dataIndex: 'receivedDate',
      key: 'receivedDate',
      width: 110,
      render: (val: string | null) => (val ? formatDate(val) : '-'),
    },
    {
      title: '类型',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 80,
      align: 'center',
      render: (val: TransactionType) => {
        const info = TRANSACTION_TYPE_MAP[val] ?? { label: val, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '发生数量',
      dataIndex: 'quantityUsed',
      key: 'quantityUsed',
      width: 100,
      align: 'right',
      render: (val: number) => formatNumber(val, 2),
    },
    { title: '关联工单', dataIndex: 'relatedOrder', key: 'relatedOrder', width: 140 },
  ];

  // ---- ② 生产排程 / 设备 ----
  const equipmentColumns: ColumnsType<TraceEquipmentItemEx> = [
    {
      title: '设备编码',
      dataIndex: 'equipmentCode',
      key: 'equipmentCode',
      width: 120,
      render: (val: string, record) =>
        record.equipmentId ? (
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            style={{ padding: 0 }}
            onClick={() => navigate(`/equipment/${record.equipmentId}`)}
          >
            {val}
          </Button>
        ) : (
          val
        ),
    },
    { title: '设备名称', dataIndex: 'equipmentName', key: 'equipmentName', width: 140 },
    {
      title: '计划时段',
      key: 'planned',
      width: 300,
      render: (_, record) =>
        `${formatDateTime(record.plannedStart)} ~ ${formatDateTime(record.plannedEnd)}`,
    },
    {
      title: '实际时段',
      key: 'actual',
      width: 300,
      render: (_, record) =>
        record.actualStart
          ? `${formatDateTime(record.actualStart)} ~ ${formatDateTime(record.actualEnd)}`
          : '-',
    },
    {
      title: '时段内故障',
      key: 'breakdown',
      width: 120,
      align: 'center',
      render: (_, record) =>
        record.breakdown.length > 0 ? (
          <Tag color="error">{record.breakdown.length} 次故障</Tag>
        ) : (
          <Tag color="success">无</Tag>
        ),
    },
  ];

  // ---- ③ 报工与人员 ----
  const executionColumns: ColumnsType<TraceExecutionItem> = [
    {
      title: '报工时间',
      dataIndex: 'reportTime',
      key: 'reportTime',
      width: 160,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '操作员',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 110,
    },
    {
      title: '完成数量',
      dataIndex: 'completedQty',
      key: 'completedQty',
      width: 100,
      align: 'right',
    },
    {
      title: '不良数量',
      dataIndex: 'defectQty',
      key: 'defectQty',
      width: 100,
      align: 'right',
      render: (val: number) =>
        val > 0 ? <span style={{ color: '#ff4d4f' }}>{val}</span> : val,
    },
    { title: '工作日期', dataIndex: 'workDate', key: 'workDate', width: 110 },
    {
      title: '工时(h)',
      dataIndex: 'hours',
      key: 'hours',
      width: 90,
      align: 'right',
      render: (val: number) => formatNumber(val, 2),
    },
    { title: '班次', dataIndex: 'shiftName', key: 'shiftName', width: 100 },
  ];

  // ---- ④ 质量检验 ----
  const qualityColumns: ColumnsType<TraceQualityItem> = [
    { title: '检验类型', dataIndex: 'inspectionType', key: 'inspectionType', width: 110 },
    {
      title: '检验时间',
      dataIndex: 'inspectionTime',
      key: 'inspectionTime',
      width: 160,
      render: (val: string) => formatDateTime(val),
    },
    { title: '检验员', dataIndex: 'inspectorName', key: 'inspectorName', width: 110 },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 100,
      align: 'center',
      render: (val: InspectionResult) => <ResultTag result={val} />,
    },
    {
      title: '检验项数',
      key: 'itemCount',
      width: 90,
      align: 'center',
      render: (_, record) => record.items.length,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: () => (
        <Button
          type="link"
          size="small"
          icon={<ExperimentOutlined />}
          onClick={() => navigate('/quality/inspection')}
        >
          检验记录
        </Button>
      ),
    },
  ];

  /** 检验项明细展开表格 */
  const expandedInspectionRow = (record: TraceQualityItem) => (
    <Table
      rowKey={(item) => `${record.inspectionTime}-${item.itemName}`}
      columns={[
        { title: '检验项', dataIndex: 'itemName', key: 'itemName' },
        { title: '标准值', dataIndex: 'standardValue', key: 'standardValue' },
        { title: '实际值', dataIndex: 'actualValue', key: 'actualValue' },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
        {
          title: '结果',
          dataIndex: 'result',
          key: 'result',
          width: 100,
          render: (val: InspectionResult) => <ResultTag result={val} />,
        },
      ]}
      dataSource={record.items}
      pagination={false}
      size="small"
    />
  );

  // ---- ⑤ 不良处理 ----
  const defectColumns: ColumnsType<TraceDefectItem> = [
    { title: '不良类型', dataIndex: 'defectType', key: 'defectType', width: 120 },
    {
      title: '不良原因',
      dataIndex: 'defectReason',
      key: 'defectReason',
      width: 180,
      ellipsis: true,
      render: (val: string) => val || '-',
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right',
    },
    {
      title: '处理方式',
      dataIndex: 'handlingMethod',
      key: 'handlingMethod',
      width: 100,
      align: 'center',
      render: (val: DefectHandlingMethod | null) => {
        if (!val) return <Tag>未处理</Tag>;
        const info = DEFECT_HANDLING_MAP[val] ?? { label: val, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: '处理人', dataIndex: 'handledByName', key: 'handledByName', width: 100 },
    {
      title: '处理时间',
      dataIndex: 'handledAt',
      key: 'handledAt',
      width: 160,
      render: (val: string | null) => formatDateTime(val),
    },
    { title: '关联设备', dataIndex: 'equipmentCode', key: 'equipmentCode', width: 110 },
  ];

  /** 段落小表格统一配置 */
  const tableProps = {
    size: 'small' as const,
    pagination: false as const,
    scroll: { x: 900 },
  };

  return (
    <div>
      {/* 工单概要 */}
      <Descriptions
        title={
          <Typography.Title level={5} style={{ margin: 0 }}>
            工单信息
          </Typography.Title>
        }
        bordered
        size="small"
        column={3}
        style={{ marginBottom: 24 }}
        items={[
          { key: 'orderNo', label: '工单号', children: workOrder.orderNo },
          { key: 'productName', label: '产品名称', children: workOrder.productName },
          {
            key: 'status',
            label: '状态',
            children: <Tag color={statusInfo.color}>{statusInfo.label}</Tag>,
          },
          { key: 'quantity', label: '计划数量', children: formatNumber(workOrder.quantity) },
          { key: 'completedQty', label: '完成数量', children: formatNumber(workOrder.completedQty) },
          { key: 'defectQty', label: '不良数量', children: formatNumber(workOrder.defectQty) },
          {
            key: 'plan',
            label: '计划时段',
            children: `${formatDateTime(workOrder.planStart)} ~ ${formatDateTime(workOrder.planEnd)}`,
          },
          {
            key: 'actual',
            label: '实际时段',
            children:
              workOrder.actualStart
                ? `${formatDateTime(workOrder.actualStart)} ~ ${formatDateTime(workOrder.actualEnd)}`
                : '-',
          },
          {
            key: 'jump',
            label: '操作',
            children: (
              <Button
                type="link"
                size="small"
                icon={<ProfileOutlined />}
                onClick={() => navigate(`/production/orders/${workOrder.id}`)}
              >
                查看工单详情
              </Button>
            ),
          },
        ]}
      />

      {/* 六段链路：纵向 Steps */}
      <Steps
        direction="vertical"
        size="small"
        current={5}
        items={[
          {
            title: '领料批次（物料来源）',
            icon: <InboxOutlined />,
            description:
              chain.materialChain.length > 0 ? (
                <Table
                  rowKey={(item) => `${item.batchNo}-${item.relatedOrder}-${item.transactionType}`}
                  columns={materialColumns}
                  dataSource={chain.materialChain}
                  {...tableProps}
                />
              ) : (
                <EmptySection text="暂无领料批次记录" />
              ),
          },
          {
            title: '生产排程与设备',
            icon: <ClusterOutlined />,
            description:
              equipmentChain.length > 0 ? (
                <Table
                  rowKey={(item) => `${item.equipmentCode}-${item.plannedStart}`}
                  columns={equipmentColumns}
                  dataSource={equipmentChain}
                  {...tableProps}
                />
              ) : (
                <EmptySection text="暂无排程与设备记录" />
              ),
          },
          {
            title: '报工与人员（含工时）',
            icon: <UserOutlined />,
            description:
              chain.executionChain.length > 0 ? (
                <Table
                  rowKey={(item) => `${item.reportTime}-${item.operatorName}`}
                  columns={executionColumns}
                  dataSource={chain.executionChain}
                  {...tableProps}
                />
              ) : (
                <EmptySection text="暂无报工记录" />
              ),
          },
          {
            title: '质量检验',
            icon: <ExperimentOutlined />,
            description:
              chain.qualityChain.length > 0 ? (
                <Table
                  rowKey={(item) => `${item.inspectionTime}-${item.inspectionType}`}
                  columns={qualityColumns}
                  dataSource={chain.qualityChain}
                  expandable={{
                    expandedRowRender: expandedInspectionRow,
                    rowExpandable: (record) => record.items.length > 0,
                  }}
                  {...tableProps}
                />
              ) : (
                <EmptySection text="暂无检验记录" />
              ),
          },
          {
            title: '不良处理',
            icon: <AlertOutlined />,
            description:
              chain.defectChain.length > 0 ? (
                <Table
                  rowKey={(item) => `${item.defectType}-${item.handledAt ?? 'pending'}`}
                  columns={defectColumns}
                  dataSource={chain.defectChain}
                  {...tableProps}
                />
              ) : (
                <EmptySection text="暂无不良记录" />
              ),
          },
        ]}
      />
    </div>
  );
}

export default TraceChainView;
