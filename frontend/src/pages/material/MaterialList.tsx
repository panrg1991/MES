/**
 * MES 系统 - 物料主数据列表页面
 * 功能：物料列表（分页+搜索+筛选）、新增/编辑弹窗、删除
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Select,
  Modal,
  Form,
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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MaterialType } from '@/types';
import {
  getMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  type MaterialListItem,
  type MaterialQueryParams,
  type CreateMaterialRequest,
  type UpdateMaterialRequest,
} from '@/api/material.api';
import { formatNumber } from '@/utils/format';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  MATERIAL_TYPE_MAP,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';

const { TextArea } = Input;

/** 物料类型选项 */
const TYPE_OPTIONS = [
  { label: '原材料', value: 'raw' },
  { label: '半成品', value: 'semi' },
  { label: '成品', value: 'finished' },
];

/** 物料表单数据 */
interface MaterialFormData {
  code: string;
  name: string;
  specification: string;
  unit: string;
  category: string;
  type: MaterialType;
  description?: string;
}

/** 物料新增/编辑弹窗 */
function MaterialForm({
  editingMaterial,
  visible,
  onClose,
  onSuccess,
}: {
  editingMaterial: MaterialListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MaterialFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canEdit = editingMaterial
    ? hasPermission('material:items:edit')
    : hasPermission('material:items:create');

  useEffect(() => {
    if (visible) {
      if (editingMaterial) {
        form.setFieldsValue({
          code: editingMaterial.code,
          name: editingMaterial.name,
          specification: editingMaterial.specification,
          unit: editingMaterial.unit,
          category: editingMaterial.category,
          type: editingMaterial.type,
          description: editingMaterial.description || undefined,
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, editingMaterial, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingMaterial) {
        const data: UpdateMaterialRequest = {
          name: values.name,
          specification: values.specification,
          unit: values.unit,
          category: values.category,
          type: values.type,
          description: values.description || '',
        };
        await updateMaterial(editingMaterial.id, data);
        message.success('更新物料成功');
      } else {
        const data: CreateMaterialRequest = {
          code: values.code,
          name: values.name,
          specification: values.specification,
          unit: values.unit,
          category: values.category,
          type: values.type,
          description: values.description || '',
        };
        await createMaterial(data);
        message.success('创建物料成功');
      }
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误
    }
  };

  return (
    <Modal
      title={editingMaterial ? '编辑物料' : '新增物料'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canEdit }}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
      width={600}
    >
      <Form<MaterialFormData>
        form={form}
        layout="vertical"
        initialValues={{ type: 'raw' }}
      >
        <Form.Item
          label="物料编码"
          name="code"
          rules={[
            { required: true, message: '请输入物料编码' },
            { max: 50, message: '物料编码最多 50 个字符' },
          ]}
        >
          <Input placeholder="请输入物料编码" disabled={!!editingMaterial} />
        </Form.Item>

        <Form.Item
          label="物料名称"
          name="name"
          rules={[
            { required: true, message: '请输入物料名称' },
            { max: 100, message: '物料名称最多 100 个字符' },
          ]}
        >
          <Input placeholder="请输入物料名称" />
        </Form.Item>

        <Form.Item
          label="规格"
          name="specification"
          rules={[
            { required: true, message: '请输入规格' },
            { max: 200, message: '规格最多 200 个字符' },
          ]}
        >
          <Input placeholder="请输入规格" />
        </Form.Item>

        <Space style={{ display: 'flex' }}>
          <Form.Item
            label="计量单位"
            name="unit"
            rules={[{ required: true, message: '请输入计量单位' }]}
            style={{ flex: 1, minWidth: 120 }}
          >
            <Input placeholder="如：个/kg/m" />
          </Form.Item>
          <Form.Item
            label="物料分类"
            name="category"
            rules={[{ required: true, message: '请输入物料分类' }]}
            style={{ flex: 1, minWidth: 120 }}
          >
            <Input placeholder="如：电子件/结构件" />
          </Form.Item>
        </Space>

        <Form.Item
          label="物料类型"
          name="type"
          rules={[{ required: true, message: '请选择物料类型' }]}
        >
          <Select options={TYPE_OPTIONS} />
        </Form.Item>

        <Form.Item
          label="描述"
          name="description"
          rules={[{ max: 500, message: '描述最多 500 个字符' }]}
        >
          <TextArea rows={3} placeholder="请输入描述（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** 物料列表页面组件 */
function MaterialList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [queryParams, setQueryParams] = useState<MaterialQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
    type: undefined,
    category: undefined,
  });

  const [formVisible, setFormVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] =
    useState<MaterialListItem | null>(null);

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['materials', queryParams],
    queryFn: () => getMaterials(queryParams),
  });

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMaterial(id),
    onSuccess: () => {
      message.success('删除物料成功');
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  // ==================== 事件处理 ====================

  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  const handleTypeFilter = useCallback(
    (value: MaterialType | undefined) => {
      setQueryParams((prev) => ({ ...prev, page: 1, type: value }));
    },
    [],
  );

  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      setQueryParams((prev) => ({ ...prev, page, pageSize }));
    },
    [],
  );

  const handleAdd = () => {
    setEditingMaterial(null);
    setFormVisible(true);
  };

  const handleEdit = (record: MaterialListItem) => {
    setEditingMaterial(record);
    setFormVisible(true);
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<MaterialListItem> = [
    {
      title: '物料编码',
      dataIndex: 'code',
      key: 'code',
      width: 120,
    },
    {
      title: '物料名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      ellipsis: true,
    },
    {
      title: '规格',
      dataIndex: 'specification',
      key: 'specification',
      width: 140,
      ellipsis: true,
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 60,
      align: 'center',
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (val: MaterialType) => {
        const info = MATERIAL_TYPE_MAP[val] ?? {
          label: '未知',
          color: 'default',
        };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '库存量',
      key: 'quantity',
      width: 90,
      align: 'center',
      render: (_, record: MaterialListItem) =>
        record.inventory
          ? formatNumber(record.inventory.quantity, 2)
          : '-',
    },
    {
      title: '库位',
      key: 'location',
      width: 120,
      render: (_, record: MaterialListItem) =>
        record.inventory
          ? `${record.inventory.warehouse}/${record.inventory.location}`
          : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: MaterialListItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            disabled={!hasPermission('material:items:edit')}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除物料「${record.name}」吗？`}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={!hasPermission('material:items:delete')}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!hasPermission('material:items:delete')}
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
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索编码/名称/规格"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
            onPressEnter={(e) =>
              handleSearch((e.target as HTMLInputElement).value)
            }
          />
          <Select
            placeholder="类型筛选"
            allowClear
            style={{ width: 120 }}
            options={TYPE_OPTIONS}
            onChange={(v: MaterialType | undefined) => handleTypeFilter(v)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            disabled={!hasPermission('material:items:create')}
          >
            新增物料
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
        scroll={{ x: 1100 }}
      />

      <MaterialForm
        editingMaterial={editingMaterial}
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['materials'] })
        }
      />
    </div>
  );
}

export default MaterialList;
