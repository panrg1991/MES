/**
 * MES 系统 - 库存管理页面
 * 功能：库存列表（分页+搜索）、安全库存预警、出入库操作弹窗、出入库流水记录
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Modal,
  Form,
  InputNumber,
  Select,
  Tag,
  Card,
  Tooltip,
  App,
  Divider,
  Spin,
  Empty,
  Switch,
  Alert,
  Typography,
} from 'antd';
import {
  WarningOutlined,
  SwapOutlined,
  HistoryOutlined,
  SearchOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type { TransactionType } from '@/types';
import {
  getInventoryList,
  getInventoryWarnings,
  createTransaction,
  getTransactions,
  type InventoryListItem,
  type InventoryQueryParams,
  type TransactionListItem,
  type TransactionQueryParams,
  type CreateTransactionRequest,
} from '@/api/material.api';
import { formatNumber, formatDateTime } from '@/utils/format';
import {
  TRANSACTION_TYPE_MAP,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  ROUTE_PATHS,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';
import WarningTag from '@/components/common/WarningTag';

// ==================== 出入库操作弹窗 ====================

/** 出入库表单数据 */
interface TransactionFormData {
  materialId: number;
  transactionType: TransactionType;
  quantity: number;
  batchNo: string;
  relatedOrder?: string;
  remark?: string;
}

function TransactionModal({
  inventory,
  visible,
  onClose,
  onSuccess,
}: {
  inventory: InventoryListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<TransactionFormData>();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canOperate = hasPermission('material:inventory:transact');

  /** 当前库存量（用于出库校验提示） */
  const currentQuantity = inventory?.quantity ?? 0;

  useEffect(() => {
    if (visible && inventory) {
      form.resetFields();
      form.setFieldsValue({
        materialId: inventory.materialId,
        transactionType: 'in',
        quantity: 1,
        batchNo: '',
        relatedOrder: '',
        remark: '',
      });
    }
  }, [visible, inventory, form]);

  /** 提交出入库 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // 出库数量校验
      if (
        values.transactionType === 'out' &&
        values.quantity > currentQuantity
      ) {
        message.error(
          `出库数量（${values.quantity}）不能超过当前库存（${currentQuantity}）`,
        );
        return;
      }
      const data: CreateTransactionRequest = {
        materialId: values.materialId,
        transactionType: values.transactionType,
        quantity: values.quantity,
        batchNo: values.batchNo,
        relatedOrder: values.relatedOrder || '',
        remark: values.remark || '',
      };
      await createTransaction(data);
      message.success(
        values.transactionType === 'in' ? '入库成功' : '出库成功',
      );
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误
    }
  };

  return (
    <Modal
      title={
        inventory
          ? `出入库 - ${inventory.material?.code ?? ''} ${inventory.material?.name ?? ''}`
          : '出入库'
      }
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canOperate }}
      okText="确认"
      cancelText="取消"
      destroyOnClose
      width={520}
    >
      {inventory && (
        <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 4 }}>
          <Space direction="vertical" size={4}>
            <span>
              物料编码：<strong>{inventory.material?.code ?? '-'}</strong>
            </span>
            <span>
              物料名称：{inventory.material?.name ?? '-'}（
              {inventory.material?.specification ?? '-'}）
            </span>
            <span>
              当前库存：<strong>{formatNumber(currentQuantity, 2)}</strong>{' '}
              {inventory.material?.unit ?? ''}
              {'  安全库存：'}
              {formatNumber(inventory.safetyStock, 2)}
              {'  最大库存：'}
              {formatNumber(inventory.maxStock, 2)}
            </span>
            <span>
              仓库/库位：{inventory.warehouse} / {inventory.location}
            </span>
          </Space>
        </div>
      )}

      <Form<TransactionFormData>
        form={form}
        layout="vertical"
        initialValues={{ transactionType: 'in', quantity: 1 }}
      >
        <Form.Item name="materialId" hidden>
          <InputNumber />
        </Form.Item>

        <Form.Item
          label="出入库类型"
          name="transactionType"
          rules={[{ required: true, message: '请选择出入库类型' }]}
        >
          <Select
            options={[
              { label: '入库', value: 'in' },
              { label: '出库', value: 'out' },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="数量"
          name="quantity"
          rules={[
            { required: true, message: '请输入数量' },
            {
              type: 'number',
              min: 0.001,
              message: '数量必须大于 0',
            },
          ]}
        >
          <InputNumber
            placeholder="请输入数量"
            min={0.001}
            step={1}
            precision={3}
            style={{ width: '100%' }}
            addonAfter={inventory?.material?.unit ?? ''}
          />
        </Form.Item>

        <Form.Item
          label="批次号"
          name="batchNo"
          rules={[
            { required: true, message: '请输入批次号' },
            { max: 50, message: '批次号最多 50 个字符' },
          ]}
        >
          <Input placeholder="如：BAT-2026-001" />
        </Form.Item>

        <Form.Item
          label="关联工单号"
          name="relatedOrder"
          rules={[{ max: 50, message: '关联工单号最多 50 个字符' }]}
        >
          <Input placeholder="关联的工单编号（可选）" />
        </Form.Item>

        <Form.Item
          label="备注"
          name="remark"
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <Input.TextArea rows={2} placeholder="备注（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ==================== 出入库流水记录弹窗 ====================

function TransactionHistoryModal({
  inventory,
  visible,
  onClose,
}: {
  inventory: InventoryListItem | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [queryParams, setQueryParams] = useState<TransactionQueryParams>({
    materialId: inventory?.materialId ?? 0,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  useEffect(() => {
    if (visible && inventory) {
      setQueryParams({
        materialId: inventory.materialId,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    }
  }, [visible, inventory]);

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => getTransactions(queryParams),
    enabled: visible && !!inventory?.materialId,
  });

  /** 流水记录表格列 */
  const columns: ColumnsType<TransactionListItem> = [
    {
      title: '时间',
      dataIndex: 'transactionTime',
      key: 'transactionTime',
      width: 160,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '类型',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 80,
      align: 'center',
      render: (val: TransactionType) => {
        const info = TRANSACTION_TYPE_MAP[val] ?? {
          label: '未知',
          color: 'default',
        };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'center',
      render: (val: number) =>
        `${val >= 0 ? '+' : ''}${formatNumber(val, 2)}`,
    },
    {
      title: '批次号',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 120,
      ellipsis: true,
    },
    {
      title: '关联工单',
      dataIndex: 'relatedOrder',
      key: 'relatedOrder',
      width: 120,
      ellipsis: true,
      render: (val: string) => val || '-',
    },
    {
      title: '操作员',
      key: 'operator',
      width: 100,
      render: (_: unknown, record: TransactionListItem) =>
        record.operator?.name ?? '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 180,
      ellipsis: true,
      render: (val: string) => val || '-',
    },
  ];

  return (
    <Modal
      title={
        inventory
          ? `出入库流水 - ${inventory.material?.code ?? ''} ${inventory.material?.name ?? ''}`
          : '出入库流水'
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : data && data.list.length > 0 ? (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data.list}
          pagination={{
            current: data.page || queryParams.page,
            pageSize: data.pageSize || queryParams.pageSize,
            total: data.total || 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onChange: (page, pageSize) =>
              setQueryParams((prev) => ({ ...prev, page, pageSize })),
          }}
          scroll={{ x: 850 }}
          size="small"
        />
      ) : (
        <Empty description="暂无出入库流水记录" />
      )}
    </Modal>
  );
}

// ==================== 库存管理主页面 ====================

/** 库存管理页面组件 */
function InventoryManagement() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const navigate = useNavigate();

  const [queryParams, setQueryParams] = useState<InventoryQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
  });

  const [transactionVisible, setTransactionVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedInventory, setSelectedInventory] =
    useState<InventoryListItem | null>(null);

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', queryParams],
    queryFn: () => getInventoryList(queryParams),
  });

  // ==================== 【I3】库存预警总数（与预警页同源接口，统一口径） ====================

  const { data: warningCountData } = useQuery({
    queryKey: ['inventory-warnings', 'entry-count'],
    queryFn: () => getInventoryWarnings({ page: 1, pageSize: 1 }),
  });
  const totalWarnings = warningCountData?.total ?? 0;

  // ==================== 统计：低库存预警数量 ====================

  const lowStockCount =
    data?.list?.filter((item) => item.isLowStock).length ?? 0;

  // ==================== 事件处理 ====================

  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      setQueryParams((prev) => ({ ...prev, page, pageSize }));
    },
    [],
  );

  const handleTransaction = (record: InventoryListItem) => {
    setSelectedInventory(record);
    setTransactionVisible(true);
  };

  const handleHistory = (record: InventoryListItem) => {
    setSelectedInventory(record);
    setHistoryVisible(true);
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<InventoryListItem> = [
    {
      title: '物料编码',
      key: 'code',
      width: 120,
      render: (_, record) => record.material?.code ?? '-',
    },
    {
      title: '物料名称',
      key: 'name',
      width: 140,
      ellipsis: true,
      render: (_, record) => record.material?.name ?? '-',
    },
    {
      title: '规格',
      key: 'spec',
      width: 140,
      ellipsis: true,
      render: (_, record) => record.material?.specification ?? '-',
    },
    {
      title: '单位',
      key: 'unit',
      width: 60,
      align: 'center',
      render: (_, record) => record.material?.unit ?? '-',
    },
    {
      title: '仓库',
      dataIndex: 'warehouse',
      key: 'warehouse',
      width: 100,
      ellipsis: true,
    },
    {
      title: '库位',
      dataIndex: 'location',
      key: 'location',
      width: 100,
      ellipsis: true,
    },
    {
      title: '当前库存',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center',
      sorter: (a, b) => a.quantity - b.quantity,
      render: (val: number, record) => {
        const isLow = record.isLowStock;
        return isLow ? (
          <Tooltip title={`低于安全库存（${record.safetyStock}）`}>
            <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
              <WarningOutlined /> {formatNumber(val, 2)}
            </span>
          </Tooltip>
        ) : (
          formatNumber(val, 2)
        );
      },
    },
    {
      title: '安全库存',
      dataIndex: 'safetyStock',
      key: 'safetyStock',
      width: 90,
      align: 'center',
      render: (val: number) => formatNumber(val, 2),
    },
    {
      title: '最大库存',
      dataIndex: 'maxStock',
      key: 'maxStock',
      width: 90,
      align: 'center',
      render: (val: number) => formatNumber(val, 2),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      align: 'center',
      render: (_, record) => {
        // 【I3】预警标识与后端 evaluateWarning 统一口径：level 由后端派生
        if (record.isLowStock && record.level) {
          return <WarningTag level={record.level} />;
        }
        if (record.isLowStock) {
          return (
            <Tag icon={<WarningOutlined />} color="error">
              库存不足
            </Tag>
          );
        }
        if (record.maxStock > 0 && record.quantity > record.maxStock) {
          return <Tag color="warning">超量</Tag>;
        }
        return <Tag color="success">正常</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right' as const,
      render: (_: unknown, record: InventoryListItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<SwapOutlined />}
            onClick={() => handleTransaction(record)}
            disabled={!hasPermission('material:inventory:transact')}
          >
            出入库
          </Button>
          <Button
            type="link"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => handleHistory(record)}
          >
            流水
          </Button>
        </Space>
      ),
    },
  ];

  // ==================== 渲染 ====================

  return (
    <div>
      {/* 【I3】库存预警入口条：数量与预警页/看板同源（统一口径），点击跳转预警页 */}
      {totalWarnings > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 12 }}
          message={`库存预警 ${totalWarnings} 条：存在物料低于安全库存`}
          action={
            <Button
              size="small"
              type="primary"
              ghost
              onClick={() => navigate(ROUTE_PATHS.MATERIAL_INVENTORY_WARNING)}
            >
              去处理 <RightOutlined />
            </Button>
          }
        />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索物料编码/名称"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
            onPressEnter={(e) =>
              handleSearch((e.target as HTMLInputElement).value)
            }
          />
          {/* 【I3】只看预警开关（对应后端 warning=true 参数，I8） */}
          <Space size={8}>
            <Typography.Text>只看预警</Typography.Text>
            <Switch
              checked={queryParams.warning === true}
              onChange={(checked) =>
                setQueryParams((prev) => ({
                  ...prev,
                  page: 1,
                  warning: checked || undefined,
                }))
              }
            />
          </Space>
          {lowStockCount > 0 && (
            <Tag icon={<WarningOutlined />} color="error">
              当前页 {lowStockCount} 项低于安全库存
            </Tag>
          )}
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
        scroll={{ x: 1200 }}
      />

      <Divider style={{ margin: '16px 0 0' }} />

      <TransactionModal
        inventory={selectedInventory}
        visible={transactionVisible}
        onClose={() => setTransactionVisible(false)}
        onSuccess={() =>
          setQueryParams((prev) => ({ ...prev }))
        }
      />

      <TransactionHistoryModal
        inventory={selectedInventory}
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
      />
    </div>
  );
}

export default InventoryManagement;
