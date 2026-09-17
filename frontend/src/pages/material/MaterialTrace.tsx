/**
 * MES 系统 - 物料追溯页面【T09 实现，替换 T06 占位页】
 * 路由：/material/trace 菜单：物料管理
 * 功能：正向追溯（批次 → 去向工单）+ 反向追溯（工单 → 来源批次）双 Tab
 * 口径：批次号 / 工单号均为字符串精确匹配（MaterialBatch.batchNo ↔ InventoryTransaction.batchNo、
 *       InventoryTransaction.relatedOrder ↔ WorkOrder.orderNo，无外键关联）
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Tabs,
  Input,
  Button,
  Table,
  Descriptions,
  Tag,
  Alert,
  Space,
  Typography,
} from 'antd';
import { SearchOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import {
  getForwardTrace,
  getBackwardTrace,
} from '@/api/material.api';
import { BATCH_STATUS_MAP } from '@/utils/constants';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import type { BatchStatus } from '@/types';

// ==================== 正向追溯（批次 → 去向） ====================

/** 正向追溯 Tab 页组件 */
function ForwardTraceTab() {
  const navigate = useNavigate();
  const [batchNoInput, setBatchNoInput] = useState('');
  const [submittedBatchNo, setSubmittedBatchNo] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['forward-trace', submittedBatchNo],
    queryFn: () => getForwardTrace({ batchNo: submittedBatchNo as string }),
    enabled: submittedBatchNo !== null,
  });

  /** 发起查询 */
  const handleSearch = () => {
    const value = batchNoInput.trim();
    if (value) {
      setSubmittedBatchNo(value);
    }
  };

  /** 去向工单表格列（含跳转工单详情） */
  const usageColumns: ColumnsType<{
    relatedOrder: string;
    workOrderId: number | null;
    quantity: number;
    transactionTime: string;
  }> = [
    { title: '关联工单号', dataIndex: 'relatedOrder', key: 'relatedOrder', width: 170 },
    {
      title: '领用数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      align: 'right',
      render: (val: number) => formatNumber(val, 2),
    },
    {
      title: '最近领用时间',
      dataIndex: 'transactionTime',
      key: 'transactionTime',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) =>
        record.workOrderId ? (
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => navigate(`/production/orders/${record.workOrderId}`)}
          >
            工单详情
          </Button>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          style={{ width: 280 }}
          placeholder="请输入批次号，如 B20260801-001"
          allowClear
          prefix={<SearchOutlined />}
          value={batchNoInput}
          onChange={(e) => setBatchNoInput(e.target.value)}
          onPressEnter={handleSearch}
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          disabled={!batchNoInput.trim()}
          onClick={handleSearch}
        >
          正向追溯
        </Button>
      </Space>

      {!submittedBatchNo ? (
        <Alert
          type="info"
          showIcon
          message="输入批次号查询该批次的去向（被哪些工单领用）"
          description="聚合口径：InventoryTransaction 中 transactionType='out' 的流水按 relatedOrder（工单号）分组汇总。"
        />
      ) : isLoading ? (
        <Card loading style={{ minHeight: 200 }} />
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="追溯查询失败"
          description={error instanceof Error ? error.message : '未找到该批次，或该批次尚未发生出入库'}
        />
      ) : data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* 批次档案信息（批次未建档时 batch 为 null，仅展示流水汇总） */}
          {data.batch ? (
            <Descriptions
              title="批次档案"
              bordered
              size="small"
              column={3}
              items={[
                { key: 'batchNo', label: '批次号', children: data.batch.batchNo },
                {
                  key: 'material',
                  label: '物料',
                  children: data.batch.material
                    ? `${data.batch.material.code} ${data.batch.material.name}`
                    : '-',
                },
                {
                  key: 'status',
                  label: '状态',
                  children: (() => {
                    const info =
                      BATCH_STATUS_MAP[data.batch.status as BatchStatus] ?? {
                        label: data.batch.status,
                        color: 'default',
                      };
                    return <Tag color={info.color}>{info.label}</Tag>;
                  })(),
                },
                { key: 'supplier', label: '供应商', children: data.batch.supplier },
                {
                  key: 'receivedDate',
                  label: '入库日期',
                  children: formatDate(data.batch.receivedDate),
                },
                {
                  key: 'quantity',
                  label: '批次数量',
                  children: formatNumber(data.batch.quantity, 2),
                },
              ]}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="该批次号有出入库流水，但尚未在批次档案中建档"
              description="建议前往「物料批次」页面补建档案，否则追溯无法展示供应商与入库日期。"
            />
          )}

          <Card size="small" title={`去向工单（${data.usages.length} 个）`}>
            {data.usages.length > 0 ? (
              <Table
                rowKey="relatedOrder"
                columns={usageColumns}
                dataSource={data.usages}
                pagination={false}
                size="small"
              />
            ) : (
              <Alert type="info" showIcon message="该批次暂无出库领用记录" />
            )}
          </Card>
        </Space>
      ) : null}
    </div>
  );
}

// ==================== 反向追溯（工单 → 来源批次） ====================

/** 反向追溯 Tab 页组件 */
function BackwardTraceTab() {
  const [workOrderNoInput, setWorkOrderNoInput] = useState('');
  const [submittedWorkOrderNo, setSubmittedWorkOrderNo] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['backward-trace', submittedWorkOrderNo],
    queryFn: () => getBackwardTrace({ workOrderNo: submittedWorkOrderNo as string }),
    enabled: submittedWorkOrderNo !== null,
  });

  /** 发起查询 */
  const handleSearch = () => {
    const value = workOrderNoInput.trim();
    if (value) {
      setSubmittedWorkOrderNo(value);
    }
  };

  /** 来源批次表格列 */
  const batchColumns: ColumnsType<{
    batchNo: string;
    materialCode: string;
    materialName: string;
    supplier: string;
    receivedDate: string;
    quantity: number;
  }> = [
    { title: '批次号', dataIndex: 'batchNo', key: 'batchNo', width: 150 },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 160,
      ellipsis: true,
    },
    { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 140, ellipsis: true },
    {
      title: '入库日期',
      dataIndex: 'receivedDate',
      key: 'receivedDate',
      width: 110,
      render: (val: string) => formatDate(val),
    },
    {
      title: '批次数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (val: number) => formatNumber(val, 2),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          style={{ width: 280 }}
          placeholder="请输入工单号，如 WO20260819001"
          allowClear
          prefix={<SearchOutlined />}
          value={workOrderNoInput}
          onChange={(e) => setWorkOrderNoInput(e.target.value)}
          onPressEnter={handleSearch}
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          disabled={!workOrderNoInput.trim()}
          onClick={handleSearch}
        >
          反向追溯
        </Button>
      </Space>

      {!submittedWorkOrderNo ? (
        <Alert
          type="info"
          showIcon
          message="输入工单号查询该工单领用的全部批次（供应商来料异常时精准圈定受影响范围）"
          description="聚合口径：InventoryTransaction 中 transactionType='out' 且 relatedOrder=工单号 的流水，批次号去重后关联批次档案补全供应商信息。"
        />
      ) : isLoading ? (
        <Card loading style={{ minHeight: 200 }} />
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="追溯查询失败"
          description={error instanceof Error ? error.message : '查询失败'}
        />
      ) : data ? (
        <Card size="small" title={`来源批次（${data.batches.length} 个）`}>
          {data.batches.length > 0 ? (
            <Table
              rowKey="batchNo"
              columns={batchColumns}
              dataSource={data.batches}
              pagination={false}
              size="small"
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="该工单暂无领用批次记录"
              description="可能尚未领料，或领料出库流水未填写批次号。"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

/** 物料追溯页面组件 */
function MaterialTrace() {
  return (
    <Card>
      <Tabs
        defaultActiveKey="forward"
        items={[
          {
            key: 'forward',
            label: '正向追溯（批次 → 去向）',
            children: <ForwardTraceTab />,
          },
          {
            key: 'backward',
            label: '反向追溯（工单 → 来源）',
            children: <BackwardTraceTab />,
          },
        ]}
      />
    </Card>
  );
}

export default MaterialTrace;
