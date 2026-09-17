/**
 * MES 系统 - BOM 管理页面
 * 功能：BOM 列表（分页+搜索）、新增/编辑弹窗（含明细项管理）、
 *       查看明细（展示 BOM 物料构成）、删除
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Modal,
  Form,
  InputNumber,
  Select,
  Popconfirm,
  Tag,
  Card,
  App,
  Divider,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  EyeOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getBOMs,
  getBOMById,
  createBOM,
  updateBOM,
  deleteBOM,
  type BOMListItem,
  type BOMDetail,
  type BOMQueryParams,
  type CreateBOMRequest,
  type UpdateBOMRequest,
} from '@/api/material.api';
import { getMaterials, type MaterialListItem } from '@/api/material.api';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';

// ==================== BOM 表单弹窗 ====================

/** BOM 表单数据 */
interface BOMFormData {
  productCode: string;
  productName: string;
  version: string;
  remark?: string;
  items: Array<{
    materialId: number;
    quantity: number;
    unit: string;
    remark?: string;
  }>;
}

function BOMForm({
  editingBOM,
  visible,
  onClose,
  onSuccess,
}: {
  editingBOM: BOMDetail | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BOMFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  const canEdit = editingBOM
    ? hasPermission('material:bom:edit')
    : hasPermission('material:bom:create');

  /** 弹窗打开时加载物料列表 + 填充表单 */
  useEffect(() => {
    if (visible) {
      // 加载物料列表
      setLoadingMaterials(true);
      getMaterials({ page: 1, pageSize: DEFAULT_PAGE_SIZE * 5 })
        .then((res) => setMaterials(res.list))
        .catch(() => message.error('加载物料列表失败'))
        .finally(() => setLoadingMaterials(false));

      // 填充表单
      if (editingBOM) {
        form.setFieldsValue({
          productCode: editingBOM.productCode,
          productName: editingBOM.productName,
          version: editingBOM.version,
          remark: editingBOM.remark || undefined,
          items: editingBOM.items.map((item) => ({
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            remark: item.remark || undefined,
          })),
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, editingBOM, form, message]);

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingBOM) {
        const data: UpdateBOMRequest = {
          productName: values.productName,
          version: values.version,
          remark: values.remark || '',
          items: values.items.map((item) => ({
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            remark: item.remark || '',
          })),
        };
        await updateBOM(editingBOM.id, data);
        message.success('更新 BOM 成功');
      } else {
        const data: CreateBOMRequest = {
          productCode: values.productCode,
          productName: values.productName,
          version: values.version,
          remark: values.remark || '',
          items: values.items.map((item) => ({
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            remark: item.remark || '',
          })),
        };
        await createBOM(data);
        message.success('创建 BOM 成功');
      }
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误
    }
  };

  /** 物料选项 */
  const materialOptions = materials.map((m) => ({
    label: `${m.code} - ${m.name} (${m.specification})`,
    value: m.id,
  }));

  return (
    <Modal
      title={editingBOM ? '编辑 BOM' : '新增 BOM'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canEdit }}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
      width={800}
    >
      <Form<BOMFormData>
        form={form}
        layout="vertical"
        initialValues={{ items: [{}] }}
      >
        <Space style={{ display: 'flex' }}>
          <Form.Item
            label="产品编码"
            name="productCode"
            rules={[
              { required: true, message: '请输入产品编码' },
              { max: 100, message: '产品编码最多 100 个字符' },
            ]}
            style={{ flex: 1, minWidth: 200 }}
          >
            <Input
              placeholder="请输入产品编码"
              disabled={!!editingBOM}
            />
          </Form.Item>
          <Form.Item
            label="版本"
            name="version"
            rules={[
              { required: true, message: '请输入版本号' },
              { max: 20, message: '版本号最多 20 个字符' },
            ]}
            style={{ width: 120 }}
          >
            <Input placeholder="如 V1.0" />
          </Form.Item>
        </Space>

        <Form.Item
          label="产品名称"
          name="productName"
          rules={[
            { required: true, message: '请输入产品名称' },
            { max: 200, message: '产品名称最多 200 个字符' },
          ]}
        >
          <Input placeholder="请输入产品名称" />
        </Form.Item>

        <Divider>BOM 明细项</Divider>

        <Form.List name="items" initialValue={[{}]}>
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    border: '1px solid #f0f0f0',
                    padding: 12,
                    marginBottom: 12,
                    borderRadius: 4,
                  }}
                >
                  <Space wrap align="baseline">
                    <Form.Item
                      {...field}
                      name={[field.name, 'materialId']}
                      rules={[{ required: true, message: '请选择物料' }]}
                      style={{ minWidth: 280 }}
                    >
                      {loadingMaterials ? (
                        <Spin size="small" />
                      ) : (
                        <Select
                          showSearch
                          placeholder="选择物料"
                          options={materialOptions}
                          filterOption={(input, option) =>
                            (option?.label ?? '')
                              .toLowerCase()
                              .includes(input.toLowerCase())
                          }
                          style={{ width: '100%' }}
                        />
                      )}
                    </Form.Item>
                    {fields.length > 1 ? (
                      <MinusCircleOutlined
                        onClick={() => remove(field.name)}
                        style={{ color: '#ff4d4f', fontSize: 18 }}
                      />
                    ) : null}
                  </Space>

                  <Space wrap align="baseline" style={{ marginTop: 4 }}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'quantity']}
                      rules={[
                        { required: true, message: '请输入用量' },
                        {
                          type: 'number',
                          min: 0.001,
                          message: '用量必须大于 0',
                        },
                      ]}
                    >
                      <InputNumber
                        placeholder="用量"
                        min={0.001}
                        step={0.1}
                        precision={3}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'unit']}
                      rules={[{ required: true, message: '请输入单位' }]}
                    >
                      <Input
                        placeholder="单位"
                        style={{ width: 80 }}
                      />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'remark']}>
                      <Input
                        placeholder="备注（可选）"
                        style={{ width: 200 }}
                      />
                    </Form.Item>
                  </Space>
                </div>
              ))}

              <Button
                type="dashed"
                onClick={() => add({})}
                icon={<PlusOutlined />}
                block
              >
                添加 BOM 明细项
              </Button>
            </>
          )}
        </Form.List>

        <Form.Item
          label="备注"
          name="remark"
          style={{ marginTop: 16 }}
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <Input.TextArea rows={2} placeholder="请输入备注（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ==================== BOM 明细查看弹窗 ====================

/** BOM 明细查看弹窗 */
function BOMDetailModal({
  bomId,
  visible,
  onClose,
}: {
  bomId: number | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { data: bom, isLoading } = useQuery({
    queryKey: ['bom', bomId],
    queryFn: () => getBOMById(bomId!),
    enabled: !!bomId,
  });

  /** 明细项表格列 */
  const columns: ColumnsType<NonNullable<BOMDetail>['items'][number]> = [
    {
      title: '物料编码',
      key: 'code',
      width: 120,
      render: (_, record) => record.material?.code || '-',
    },
    {
      title: '物料名称',
      key: 'name',
      width: 150,
      render: (_, record) => record.material?.name || '-',
    },
    {
      title: '规格',
      key: 'spec',
      width: 140,
      render: (_, record) => record.material?.specification || '-',
    },
    {
      title: '用量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center',
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      align: 'center',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },
  ];

  return (
    <Modal
      title={`BOM 明细 - ${bom?.productName ?? ''}`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : bom ? (
        <div>
          <Space style={{ marginBottom: 16 }}>
            <span>
              产品编码: <strong>{bom.productCode}</strong>
            </span>
            <span>版本: {bom.version}</span>
            <Tag color={bom.status ? 'success' : 'default'}>
              {bom.status ? '启用' : '停用'}
            </Tag>
          </Space>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={bom.items}
            pagination={false}
            size="small"
            scroll={{ y: 400 }}
          />
        </div>
      ) : (
        <div>暂无数据</div>
      )}
    </Modal>
  );
}

// ==================== BOM 管理主页面 ====================

/** BOM 管理页面组件 */
function BOMManagement() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [queryParams, setQueryParams] = useState<BOMQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
  });

  const [formVisible, setFormVisible] = useState(false);
  const [editingBOM, setEditingBOM] = useState<BOMDetail | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['boms', queryParams],
    queryFn: () => getBOMs(queryParams),
  });

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBOM(id),
    onSuccess: () => {
      message.success('删除 BOM 成功');
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });

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

  const handleAdd = () => {
    setEditingBOM(null);
    setFormVisible(true);
  };

  const handleEdit = (record: BOMListItem) => {
    // 使用 fetch 获取完整 BOM 详情用于回填
    getBOMById(record.id).then((detail) => {
      setEditingBOM(detail);
      setFormVisible(true);
    });
  };

  const handleView = (record: BOMListItem) => {
    setDetailId(record.id);
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<BOMListItem> = [
    {
      title: '产品编码',
      dataIndex: 'productCode',
      key: 'productCode',
      width: 140,
    },
    {
      title: '产品名称',
      dataIndex: 'productName',
      key: 'productName',
      width: 180,
      ellipsis: true,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      align: 'center',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (val: boolean) => (
        <Tag color={val ? 'success' : 'default'}>
          {val ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '明细项数',
      key: 'itemCount',
      width: 100,
      align: 'center',
      render: (_, record: BOMListItem) => record._count?.items ?? 0,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: true,
      render: (val: string) => val || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: unknown, record: BOMListItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          >
            查看明细
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            disabled={!hasPermission('material:bom:edit')}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除 BOM「${record.productName}」吗？`}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={!hasPermission('material:bom:delete')}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!hasPermission('material:bom:delete')}
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
            placeholder="搜索产品编码/名称"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
            onPressEnter={(e) =>
              handleSearch((e.target as HTMLInputElement).value)
            }
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            disabled={!hasPermission('material:bom:create')}
          >
            新增 BOM
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
        scroll={{ x: 1000 }}
      />

      <BOMForm
        editingBOM={editingBOM}
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['boms'] })
        }
      />

      <BOMDetailModal
        bomId={detailId}
        visible={!!detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

export default BOMManagement;
