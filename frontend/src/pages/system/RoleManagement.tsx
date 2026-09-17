/**
 * MES 系统 - 角色管理页面
 * 功能：角色列表（分页+搜索）、创建/编辑角色弹窗、状态切换、权限分配、删除
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Modal,
  Form,
  Switch,
  Popconfirm,
  Tag,
  Card,
  App,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  type RoleListItem,
  type CreateRoleRequest,
  type UpdateRoleRequest,
} from '@/api/role.api';
import { formatDateTime } from '@/utils/format';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants';
import RolePermissionAssign from './RolePermissionAssign';

/** 创建/编辑表单数据 */
interface RoleFormData {
  name: string;
  code: string;
  description: string;
}

/** 角色管理页面组件 */
function RoleManagement() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  // 列表查询参数
  const [queryParams, setQueryParams] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
  });

  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleListItem | null>(null);
  const [form] = Form.useForm<RoleFormData>();

  // 权限分配弹窗
  const [permAssignVisible, setPermAssignVisible] = useState(false);
  const [permAssignRoleId, setPermAssignRoleId] = useState<number>(0);
  const [permAssignRoleName, setPermAssignRoleName] = useState('');

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['roles', queryParams],
    queryFn: () => getRoles(queryParams),
  });

  // ==================== Mutation 操作 ====================

  const createMutation = useMutation({
    mutationFn: (data: CreateRoleRequest) => createRole(data),
    onSuccess: () => {
      message.success('创建角色成功');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalVisible(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRoleRequest }) =>
      updateRole(id, data),
    onSuccess: () => {
      message.success('更新角色成功');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalVisible(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      message.success('删除角色成功');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  // ==================== 事件处理 ====================

  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    setQueryParams((prev) => ({ ...prev, page, pageSize }));
  }, []);

  const handleAdd = () => {
    setEditingRole(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: RoleListItem) => {
    setEditingRole(record);
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      description: record.description,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingRole) {
        updateMutation.mutate({
          id: editingRole.id,
          data: {
            name: values.name,
            description: values.description,
          },
        });
      } else {
        createMutation.mutate(values as CreateRoleRequest);
      }
    } catch {
      // 校验失败
    }
  };

  const handleAssignPermissions = (record: RoleListItem) => {
    setPermAssignRoleId(record.id);
    setPermAssignRoleName(record.name);
    setPermAssignVisible(true);
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<RoleListItem> = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
      width: 160,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
    },
    {
      title: '用户数',
      dataIndex: 'userCount',
      key: 'userCount',
      width: 80,
      align: 'center',
      render: (count: number) => <Tag color={count > 0 ? 'blue' : 'default'}>{count}</Tag>,
    },
    {
      title: '权限数',
      dataIndex: 'permissionCount',
      key: 'permissionCount',
      width: 80,
      align: 'center',
      render: (count: number) => <Tag color={count > 0 ? 'green' : 'default'}>{count}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: boolean, record: RoleListItem) => (
        <Switch
          checked={status}
          checkedChildren="启用"
          unCheckedChildren="停用"
          disabled={record.code === 'system:admin'}
          onChange={(checked) =>
            updateMutation.mutate({
              id: record.id,
              data: { status: checked },
            })
          }
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: unknown, record: RoleListItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<SafetyOutlined />}
            onClick={() => handleAssignPermissions(record)}
          >
            分配权限
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除角色 "${record.name}" 吗？`}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={record.code === 'system:admin'}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.code === 'system:admin'}
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
      {/* 工具栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索角色名称/编码"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 250 }}
            onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增角色
          </Button>
        </Space>
      </Card>

      {/* 角色表格 */}
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

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={480}
      >
        <Form<RoleFormData> form={form} layout="vertical">
          <Form.Item
            label="角色名称"
            name="name"
            rules={[
              { required: true, message: '请输入角色名称' },
              { max: 50, message: '角色名称最多 50 个字符' },
            ]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>

          <Form.Item
            label="角色编码"
            name="code"
            rules={[
              { required: true, message: '请输入角色编码' },
              { max: 50, message: '角色编码最多 50 个字符' },
            ]}
          >
            <Input placeholder="请输入角色编码（如 system:admin）" disabled={!!editingRole} />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
            rules={[{ max: 200, message: '描述最多 200 个字符' }]}
          >
            <Input.TextArea placeholder="请输入角色描述" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 权限分配弹窗 */}
      <RolePermissionAssign
        roleId={permAssignRoleId}
        roleName={permAssignRoleName}
        visible={permAssignVisible}
        onClose={() => setPermAssignVisible(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['roles'] })
        }
      />
    </div>
  );
}

export default RoleManagement;
