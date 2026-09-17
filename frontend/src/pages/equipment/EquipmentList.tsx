/**
 * MES 系统 - 设备台账列表页面
 * 功能：设备状态总览卡片 + 设备列表（分页+搜索+筛选）+ 新增/编辑弹窗 + 状态切换 + 删除
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Select,
  Modal,
  Form,
  DatePicker,
  Popconfirm,
  Tag,
  Card,
  App,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { EquipmentStatus } from '@/types';
import {
  getEquipments,
  getEquipmentStatusSummary,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  changeEquipmentStatus,
  type EquipmentListItem,
  type EquipmentQueryParams,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
} from '@/api/equipment.api';
import EquipmentStatusCard from '@/components/EquipmentStatusCard';
import { formatDate, getEquipmentStatusInfo } from '@/utils/format';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  EQUIPMENT_STATUS_MAP,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';

const { TextArea } = Input;

// ==================== 表单数据类型 ====================

/** 设备表单数据（日期为 Dayjs 对象） */
interface EquipmentFormData {
  code: string;
  name: string;
  type: string;
  location: string;
  manufacturer?: string;
  model?: string;
  purchaseDate?: Dayjs;
  remark?: string;
}

// ==================== 状态切换弹窗 ====================

/** 状态切换弹窗属性 */
interface StatusChangeModalProps {
  equipment: EquipmentListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 状态切换弹窗数据 */
interface StatusChangeFormData {
  newStatus: EquipmentStatus;
  remark?: string;
}

/** 状态切换弹窗组件 */
function StatusChangeModal({
  equipment,
  visible,
  onClose,
  onSuccess,
}: StatusChangeModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<StatusChangeFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  /** 弹窗打开时重置表单 */
  useEffect(() => {
    if (visible) {
      form.resetFields();
    }
  }, [visible, form]);

  /** 提交状态切换 */
  const handleSubmit = async () => {
    if (!equipment) return;
    try {
      const values = await form.validateFields();
      await changeEquipmentStatus(equipment.id, {
        newStatus: values.newStatus,
        remark: values.remark || '',
      });
      message.success('设备状态切换成功');
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误（错误信息由拦截器处理）
    }
  };

  /** 可切换的目标状态列表（排除当前状态） */
  const statusOptions = (
    Object.keys(EQUIPMENT_STATUS_MAP) as EquipmentStatus[]
  )
    .filter((s) => s !== equipment?.status)
    .map((s) => ({
      label: EQUIPMENT_STATUS_MAP[s].label,
      value: s,
    }));

  return (
    <Modal
      title={`切换设备状态 - ${equipment?.name ?? ''}`}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !hasPermission('equipment:list:status') }}
      okText="确认"
      cancelText="取消"
      destroyOnClose
      width={450}
    >
      <Form<StatusChangeFormData> form={form} layout="vertical">
        <Form.Item
          label="当前状态"
        >
          {equipment ? (
            <Tag color={getEquipmentStatusInfo(equipment.status).color}>
              {getEquipmentStatusInfo(equipment.status).label}
            </Tag>
          ) : (
            '-'
          )}
        </Form.Item>
        <Form.Item
          label="目标状态"
          name="newStatus"
          rules={[{ required: true, message: '请选择目标状态' }]}
        >
          <Select options={statusOptions} placeholder="请选择目标状态" />
        </Form.Item>
        <Form.Item
          label="备注"
          name="remark"
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <TextArea rows={3} placeholder="请输入状态切换原因（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ==================== 设备新增/编辑弹窗 ====================

/** 设备表单弹窗属性 */
interface EquipmentFormProps {
  editingEquipment: EquipmentListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 设备类型选项 */
const EQUIPMENT_TYPE_OPTIONS = [
  { label: 'CNC 机床', value: 'CNC 机床' },
  { label: '注塑机', value: '注塑机' },
  { label: '装配线', value: '装配线' },
  { label: '检测设备', value: '检测设备' },
  { label: '焊接设备', value: '焊接设备' },
  { label: '包装设备', value: '包装设备' },
  { label: '输送设备', value: '输送设备' },
  { label: '其他', value: '其他' },
];

/** 设备新增/编辑弹窗组件 */
function EquipmentForm({
  editingEquipment,
  visible,
  onClose,
  onSuccess,
}: EquipmentFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<EquipmentFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canEdit = editingEquipment
    ? hasPermission('equipment:list:edit')
    : hasPermission('equipment:list:create');

  /** 弹窗打开时填充表单 */
  useEffect(() => {
    if (visible) {
      if (editingEquipment) {
        form.setFieldsValue({
          code: editingEquipment.code,
          name: editingEquipment.name,
          type: editingEquipment.type,
          location: editingEquipment.location,
          manufacturer: editingEquipment.manufacturer || undefined,
          model: editingEquipment.model || undefined,
          purchaseDate: editingEquipment.purchaseDate
            ? dayjs(editingEquipment.purchaseDate)
            : undefined,
          remark: editingEquipment.remark || undefined,
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, editingEquipment, form]);

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // 转换 Dayjs 为 ISO 字符串
      const data: CreateEquipmentRequest | UpdateEquipmentRequest = {
        name: values.name,
        type: values.type,
        location: values.location,
        manufacturer: values.manufacturer || '',
        model: values.model || '',
        purchaseDate: values.purchaseDate
          ? values.purchaseDate.toISOString()
          : undefined,
        remark: values.remark || '',
      };

      if (editingEquipment) {
        await updateEquipment(editingEquipment.id, data);
        message.success('更新设备成功');
      } else {
        // 新增时需要 code 字段
        await createEquipment({
          ...data,
          code: values.code,
        } as CreateEquipmentRequest);
        message.success('创建设备成功');
      }
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误
    }
  };

  return (
    <Modal
      title={editingEquipment ? '编辑设备' : '新增设备'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canEdit }}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      width={600}
    >
      <Form<EquipmentFormData>
        form={form}
        layout="vertical"
        initialValues={{ type: 'CNC 机床' }}
      >
        <Form.Item
          label="设备编码"
          name="code"
          rules={[
            { required: true, message: '请输入设备编码' },
            { max: 50, message: '设备编码最多 50 个字符' },
          ]}
        >
          <Input
            placeholder="请输入设备编码"
            disabled={!!editingEquipment}
          />
        </Form.Item>

        <Form.Item
          label="设备名称"
          name="name"
          rules={[
            { required: true, message: '请输入设备名称' },
            { max: 100, message: '设备名称最多 100 个字符' },
          ]}
        >
          <Input placeholder="请输入设备名称" />
        </Form.Item>

        <Form.Item
          label="设备类型"
          name="type"
          rules={[{ required: true, message: '请选择设备类型' }]}
        >
          <Select
            options={EQUIPMENT_TYPE_OPTIONS}
            placeholder="请选择设备类型"
            showSearch
          />
        </Form.Item>

        <Form.Item
          label="存放位置"
          name="location"
          rules={[
            { required: true, message: '请输入存放位置' },
            { max: 200, message: '存放位置最多 200 个字符' },
          ]}
        >
          <Input placeholder="请输入存放位置" />
        </Form.Item>

        <Form.Item
          label="制造商"
          name="manufacturer"
          rules={[{ max: 100, message: '制造商名称最多 100 个字符' }]}
        >
          <Input placeholder="请输入制造商名称（可选）" />
        </Form.Item>

        <Form.Item
          label="设备型号"
          name="model"
          rules={[{ max: 100, message: '设备型号最多 100 个字符' }]}
        >
          <Input placeholder="请输入设备型号（可选）" />
        </Form.Item>

        <Form.Item label="采购日期" name="purchaseDate">
          <DatePicker
            style={{ width: '100%' }}
            placeholder="选择采购日期"
          />
        </Form.Item>

        <Form.Item
          label="备注"
          name="remark"
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <TextArea rows={3} placeholder="请输入备注（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ==================== 设备列表主页面 ====================

/** 状态筛选选项 */
const STATUS_FILTER_OPTIONS = (
  Object.keys(EQUIPMENT_STATUS_MAP) as EquipmentStatus[]
).map((s) => ({
  label: EQUIPMENT_STATUS_MAP[s].label,
  value: s,
}));

/** 设备类型筛选选项 */
const TYPE_FILTER_OPTIONS = [...EQUIPMENT_TYPE_OPTIONS];

/** 设备列表页面组件 */
function EquipmentList() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // 列表查询参数
  const [queryParams, setQueryParams] = useState<EquipmentQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
    status: undefined,
    type: undefined,
  });

  // 弹窗状态
  const [formVisible, setFormVisible] = useState(false);
  const [editingEquipment, setEditingEquipment] =
    useState<EquipmentListItem | null>(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [statusTarget, setStatusTarget] = useState<EquipmentListItem | null>(
    null,
  );

  // ==================== 数据查询 ====================

  /** 设备列表 */
  const { data, isLoading } = useQuery({
    queryKey: ['equipments', queryParams],
    queryFn: () => getEquipments(queryParams),
  });

  /** 设备状态统计 */
  const { data: statusSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['equipmentStatusSummary'],
    queryFn: () => getEquipmentStatusSummary(),
  });

  // ==================== Mutation 操作 ====================

  /** 删除设备 */
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEquipment(id),
    onSuccess: () => {
      message.success('删除设备成功');
      queryClient.invalidateQueries({ queryKey: ['equipments'] });
      queryClient.invalidateQueries({
        queryKey: ['equipmentStatusSummary'],
      });
    },
  });

  // ==================== 事件处理 ====================

  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  const handleStatusFilter = useCallback(
    (value: EquipmentStatus | undefined) => {
      setQueryParams((prev) => ({ ...prev, page: 1, status: value }));
    },
    [],
  );

  const handleTypeFilter = useCallback((value: string | undefined) => {
    setQueryParams((prev) => ({ ...prev, page: 1, type: value }));
  }, []);

  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      setQueryParams((prev) => ({ ...prev, page, pageSize }));
    },
    [],
  );

  const handleAdd = () => {
    setEditingEquipment(null);
    setFormVisible(true);
  };

  const handleEdit = (record: EquipmentListItem) => {
    setEditingEquipment(record);
    setFormVisible(true);
  };

  const handleStatusChange = (record: EquipmentListItem) => {
    setStatusTarget(record);
    setStatusModalVisible(true);
  };

  /** 刷新列表相关缓存 */
  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['equipments'] });
    queryClient.invalidateQueries({
      queryKey: ['equipmentStatusSummary'],
    });
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<EquipmentListItem> = [
    {
      title: '设备编码',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (text: string, record: EquipmentListItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/equipment/${record.id}`)}
        >
          {text}
        </Button>
      ),
    },
    {
      title: '设备名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
    },
    {
      title: '设备类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: EquipmentStatus) => {
        const info = getEquipmentStatusInfo(status);
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '所属车间',
      key: 'workshop',
      width: 120,
      render: (_, record: EquipmentListItem) =>
        record.workshop?.name || '-',
    },
    {
      title: '存放位置',
      dataIndex: 'location',
      key: 'location',
      width: 140,
      ellipsis: true,
    },
    {
      title: '制造商',
      dataIndex: 'manufacturer',
      key: 'manufacturer',
      width: 120,
      ellipsis: true,
      render: (val: string) => val || '-',
    },
    {
      title: '采购日期',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      width: 120,
      render: (val: string | null) => formatDate(val),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: EquipmentListItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            disabled={!hasPermission('equipment:list:edit')}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleStatusChange(record)}
            disabled={!hasPermission('equipment:list:status')}
          >
            状态切换
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除设备「${record.name}」吗？删除后不可恢复。`}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={!hasPermission('equipment:list:delete')}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!hasPermission('equipment:list:delete')}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ==================== 渲染 ====================

  return (
    <div>
      {/* 设备状态总览 */}
      <EquipmentStatusCard
        summary={statusSummary}
        loading={summaryLoading}
      />

      {/* 筛选区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索设备编码/名称"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 240 }}
            onPressEnter={(e) =>
              handleSearch((e.target as HTMLInputElement).value)
            }
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            options={STATUS_FILTER_OPTIONS}
            onChange={(v: EquipmentStatus | undefined) =>
              handleStatusFilter(v)
            }
          />
          <Select
            placeholder="类型筛选"
            allowClear
            style={{ width: 140 }}
            options={TYPE_FILTER_OPTIONS}
            onChange={(v: string | undefined) => handleTypeFilter(v)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            disabled={!hasPermission('equipment:list:create')}
          >
            新增设备
          </Button>
        </Space>
      </Card>

      {/* 设备列表表格 */}
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

      {/* 新增/编辑弹窗 */}
      <EquipmentForm
        editingEquipment={editingEquipment}
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={handleSuccess}
      />

      {/* 状态切换弹窗 */}
      <StatusChangeModal
        equipment={statusTarget}
        visible={statusModalVisible}
        onClose={() => setStatusModalVisible(false)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

export default EquipmentList;
