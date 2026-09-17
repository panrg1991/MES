/**
 * MES 系统 - 库存预警页面【T09 实现，替换 T06 占位页】
 * 路由：/material/inventory-warning 菜单：物料管理
 * 功能：低于安全库存的物料集中展示（critical/warning 分级标识 + 缺口排序）
 *       + 「去补料」一键入库（补料后预警列表/库存列表/看板 lowStockCount 即时刷新）
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  Alert,
  App,
  Statistic,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  WarningOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getInventoryWarnings,
  createTransaction,
} from '@/api/material.api';
import { WARNING_LEVEL_MAP, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants';
import { formatNumber, formatPercent } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import type { InventoryWarningItem, WarningLevel } from '@/types';
import WarningTag from '@/components/common/WarningTag';

/** 预警列表项类型（含物料信息，与后端返回一致） */
type WarningRow = InventoryWarningItem;

/** 补料表单数据 */
interface ReplenishFormData {
  quantity: number;
  batchNo: string;
  remark?: string;
}

// ==================== 去补料弹窗 ====================

/** 补料弹窗属性 */
interface ReplenishModalProps {
  visible: boolean;
  /** 目标预警行 */
  target: WarningRow | null;
  onClose: () => void;
}

/** 去补料弹窗（一键入库，复用 P0 出入库接口 POST /material/inventory/transactions） */
function ReplenishModal({ visible, target, onClose }: ReplenishModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReplenishFormData>();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canOperate = hasPermission('material:inventory:transact');

  // 打开时预填建议补料量 = 缺口量（向上取整）
  useEffect(() => {
    if (visible && target) {
      form.resetFields();
      form.setFieldsValue({
        quantity: Math.ceil(target.shortage),
        batchNo: '',
        remark: '',
      });
    }
  }, [visible, target, form]);

  const mutation = useMutation({
    mutationFn: (values: ReplenishFormData) =>
      createTransaction({
        materialId: target?.materialId ?? 0,
        transactionType: 'in',
        quantity: values.quantity,
        batchNo: values.batchNo,
        relatedOrder: '',
        remark: values.remark || '库存预警补料',
      }),
    onSuccess: () => {
      message.success('补料入库成功，预警状态已刷新');
      // 补料后：预警列表 / 库存列表 / 看板 lowStockCount 即时刷新（统一口径同源）
      queryClient.invalidateQueries({ queryKey: ['inventory-warnings'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  /** 提交补料 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      mutation.mutate(values);
    } catch {
      // 表单校验失败
    }
  };

  return (
    <Modal
      title={`去补料 - ${target?.material?.code ?? ''} ${target?.material?.name ?? ''}`}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={mutation.isPending}
      okText="确认入库"
      cancelText="取消"
      okButtonProps={{ disabled: !canOperate }}
      destroyOnClose
      width={520}
    >
      {target && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={`当前库存 ${formatNumber(target.quantity, 2)} / 安全库存 ${formatNumber(target.safetyStock, 2)}`}
          description={`缺口 ${formatNumber(target.shortage, 2)}（缺口比例 ${formatPercent(target.shortageRatio * 100)}），建议补料 ${Math.ceil(target.shortage)} 以上以解除预警。`}
        />
      )}
      <Form<ReplenishFormData> form={form} layout="vertical">
        <Form.Item
          label="补料数量"
          name="quantity"
          rules={[{ required: true, message: '请输入补料数量' }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0.001}
            precision={2}
            addonAfter={target?.material?.unit ?? ''}
          />
        </Form.Item>
        <Form.Item
          label="批次号"
          name="batchNo"
          rules={[
            { required: true, message: '请输入批次号' },
            { max: 50, message: '批次号最多 50 个字符' },
          ]}
          extra="批次号将作为追溯链路的关联依据，建议填写供应商来料批次号"
        >
          <Input placeholder="如：B20260801-001" />
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={2} placeholder="备注（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ==================== 库存预警主页面 ====================

/** 库存预警页面组件 */
function InventoryWarning() {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [queryParams, setQueryParams] = useState<{
    page: number;
    pageSize: number;
    keyword?: string;
    level?: WarningLevel;
  }>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [keywordInput, setKeywordInput] = useState('');
  const [replenishVisible, setReplenishVisible] = useState(false);
  const [replenishTarget, setReplenishTarget] = useState<WarningRow | null>(null);

  // 预警列表查询
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['inventory-warnings', queryParams],
    queryFn: () => getInventoryWarnings(queryParams),
  });

  /** 严重缺料条数（当前页统计，用于顶部概览） */
  const criticalCount =
    data?.list?.filter((item) => item.level === 'critical').length ?? 0;

  /** 提交关键字筛选 */
  const handleSearch = useCallback(() => {
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      keyword: keywordInput.trim() || undefined,
    }));
  }, [keywordInput]);

  /** 重置 */
  const handleReset = useCallback(() => {
    setKeywordInput('');
    setQueryParams({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  }, []);

  /** 去补料 */
  const handleReplenish = (record: WarningRow) => {
    setReplenishTarget(record);
    setReplenishVisible(true);
  };

  // 预警表格列定义
  const columns: ColumnsType<WarningRow> = [
    {
      title: '物料编码',
      key: 'code',
      width: 120,
      render: (_, record) => record.material?.code ?? '-',
    },
    {
      title: '物料名称',
      key: 'name',
      width: 160,
      ellipsis: true,
      render: (_, record) =>
        record.material ? `${record.material.name}（${record.material.specification}）` : '-',
    },
    {
      title: '单位',
      key: 'unit',
      width: 60,
      align: 'center',
      render: (_, record) => record.material?.unit ?? '-',
    },
    {
      title: '仓库/库位',
      key: 'warehouse',
      width: 150,
      ellipsis: true,
      render: (_, record) => `${record.warehouse} / ${record.location}`,
    },
    {
      title: '当前库存',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.quantity - b.quantity,
      render: (val: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
          {formatNumber(val, 2)}
        </span>
      ),
    },
    {
      title: '安全库存',
      dataIndex: 'safetyStock',
      key: 'safetyStock',
      width: 100,
      align: 'right',
      render: (val: number) => formatNumber(val, 2),
    },
    {
      title: '缺口量',
      dataIndex: 'shortage',
      key: 'shortage',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.shortage - b.shortage,
      render: (val: number) => (
        <span style={{ color: '#fa8c16', fontWeight: 600 }}>
          {formatNumber(val, 2)}
        </span>
      ),
    },
    {
      title: '缺口比例',
      dataIndex: 'shortageRatio',
      key: 'shortageRatio',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.shortageRatio - b.shortageRatio,
      render: (val: number) => formatPercent(val * 100, 1),
    },
    {
      title: '预警等级',
      dataIndex: 'level',
      key: 'level',
      width: 110,
      align: 'center',
      filters: [
        { text: WARNING_LEVEL_MAP.critical.label, value: 'critical' },
        { text: WARNING_LEVEL_MAP.warning.label, value: 'warning' },
      ],
      onFilter: (value, record) => record.level === value,
      render: (val: WarningLevel) => <WarningTag level={val} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right' as const,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<ThunderboltOutlined />}
          disabled={!hasPermission('material:inventory:transact')}
          onClick={() => handleReplenish(record)}
        >
          去补料
        </Button>
      ),
    },
  ];

  return (
    <div>
      {/* 概览统计 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size={48} wrap>
          <Statistic
            title="预警总数"
            value={data?.total ?? 0}
            prefix={<WarningOutlined style={{ color: '#faad14' }} />}
          />
          <Statistic
            title="严重缺料（当前页）"
            value={criticalCount}
            valueStyle={{ color: criticalCount > 0 ? '#ff4d4f' : undefined }}
          />
        </Space>
      </Card>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索物料编码/名称"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 240 }}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onPressEnter={handleSearch}
          />
          <Select
            placeholder="预警等级"
            allowClear
            style={{ width: 140 }}
            value={queryParams.level}
            onChange={(value) =>
              setQueryParams((prev) => ({ ...prev, page: 1, level: value }))
            }
            options={(Object.keys(WARNING_LEVEL_MAP) as WarningLevel[]).map(
              (value) => ({
                value,
                label: WARNING_LEVEL_MAP[value].label,
              }),
            )}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            查询
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={() => refetch()}
            loading={isFetching}
          >
            刷新
          </Button>
        </Space>
      </Card>

      {/* 预警列表（排序口径与后端一致：critical 先 → 缺口比例倒序） */}
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
        scroll={{ x: 1150 }}
        locale={{
          emptyText: (
            <Alert
              type="success"
              showIcon
              message="库存状态良好"
              description="当前没有低于安全库存的物料。"
            />
          ),
        }}
      />

      {/* 去补料弹窗 */}
      <ReplenishModal
        visible={replenishVisible}
        target={replenishTarget}
        onClose={() => setReplenishVisible(false)}
      />
    </div>
  );
}

export default InventoryWarning;
