/**
 * MES 系统 - 用户管理页面
 * 功能：用户列表（分页+搜索）、创建/编辑用户弹窗、状态切换、重置密码、删除
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Select,
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
  KeyOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  resetPassword,
  deleteUser,
  type UserListItem,
  type CreateUserRequest,
  type UpdateUserRequest,
} from '@/api/user.api';
import { getRoles } from '@/api/role.api';
import { formatDateTime } from '@/utils/format';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants';
import type { Role } from '@/types';

/** 创建/编辑表单数据 */
interface UserFormData {
  username: string;
  name: string;
  department: string;
  password?: string;
  roleIds: number[];
}

/** 用户管理页面组件 */
function UserManagement() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  // 列表查询参数
  const [queryParams, setQueryParams] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
    status: undefined as string | undefined,
  });

  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [form] = Form.useForm<UserFormData>();
  const [resetForm] = Form.useForm<{ newPassword: string }>();

  // ==================== 数据查询 ====================

  /** 用户列表查询 */
  const { data, isLoading } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: () => getUsers(queryParams),
  });

  /** 角色列表（用于下拉选择） */
  const { data: rolesData } = useQuery({
    queryKey: ['roles-for-select'],
    queryFn: () => getRoles({ page: 1, pageSize: 100 }),
  });

  /** 角色选项 */
  const roleOptions: { label: string; value: number }[] = (rolesData?.list || []).map(
    (role: Role) => ({ label: role.name, value: role.id }),
  );

  // ==================== Mutation 操作 ====================

  /** 创建用户 */
  const createMutation = useMutation({
    mutationFn: (data: CreateUserRequest) => createUser(data),
    onSuccess: () => {
      message.success('创建用户成功');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalVisible(false);
    },
  });

  /** 更新用户 */
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserRequest }) =>
      updateUser(id, data),
    onSuccess: () => {
      message.success('更新用户成功');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalVisible(false);
    },
  });

  /** 切换状态 */
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: boolean }) =>
      toggleUserStatus(id, status),
    onSuccess: () => {
      message.success('状态更新成功');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  /** 重置密码 */
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      resetPassword(id, newPassword),
    onSuccess: () => {
      message.success('密码重置成功');
      setResetModalVisible(false);
      resetForm.resetFields();
    },
  });

  /** 删除用户 */
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      message.success('删除用户成功');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  // ==================== 事件处理 ====================

  /** 搜索 */
  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  /** 状态筛选 */
  const handleStatusFilter = useCallback((value: string | undefined) => {
    setQueryParams((prev) => ({ ...prev, page: 1, status: value }));
  }, []);

  /** 分页变更 */
  const handlePageChange = useCallback((page: number, pageSize: number) => {
    setQueryParams((prev) => ({ ...prev, page, pageSize }));
  }, []);

  /** 打开新增弹窗 */
  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  /** 打开编辑弹窗 */
  const handleEdit = (record: UserListItem) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      name: record.name,
      department: record.department,
      roleIds: record.roles.map((r) => r.id),
    });
    setModalVisible(true);
  };

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        // 编辑模式：不修改密码，只更新基本信息和角色
        updateMutation.mutate({
          id: editingUser.id,
          data: {
            name: values.name,
            department: values.department,
            roleIds: values.roleIds,
          },
        });
      } else {
        // 新增模式：包含密码
        createMutation.mutate(values as CreateUserRequest);
      }
    } catch {
      // 表单校验失败
    }
  };

  /** 打开重置密码弹窗 */
  const handleResetPassword = (userId: number) => {
    setResetUserId(userId);
    resetForm.resetFields();
    setResetModalVisible(true);
  };

  /** 提交重置密码 */
  const handleResetPasswordSubmit = async () => {
    try {
      const values = await resetForm.validateFields();
      if (resetUserId) {
        resetPasswordMutation.mutate({
          id: resetUserId,
          newPassword: values.newPassword,
        });
      }
    } catch {
      // 校验失败
    }
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<UserListItem> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 150,
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 200,
      render: (roles: Role[]) =>
        roles && roles.length > 0
          ? roles.map((role) => (
              <Tag key={role.id} color="blue">
                {role.name}
              </Tag>
            ))
          : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: boolean, record: UserListItem) => (
        <Switch
          checked={status}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) =>
            toggleStatusMutation.mutate({ id: record.id, status: checked })
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
      render: (_: unknown, record: UserListItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => handleResetPassword(record.id)}
          >
            重置密码
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除用户 "${record.name}" 吗？`}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.username === 'admin'}
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
            placeholder="搜索用户名/姓名/部门"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 250 }}
            onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            options={[
              { label: '启用', value: 'true' },
              { label: '停用', value: 'false' },
            ]}
            onChange={handleStatusFilter}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增用户
          </Button>
        </Space>
      </Card>

      {/* 用户表格 */}
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

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={480}
      >
        <Form<UserFormData>
          form={form}
          layout="vertical"
          initialValues={{ roleIds: [] }}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 2, message: '用户名至少 2 个字符' },
              { max: 50, message: '用户名最多 50 个字符' },
            ]}
          >
            <Input placeholder="请输入用户名" disabled={!!editingUser} />
          </Form.Item>

          <Form.Item
            label="姓名"
            name="name"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <Form.Item
            label="部门"
            name="department"
            rules={[{ required: true, message: '请输入部门' }]}
          >
            <Input placeholder="请输入部门" />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 个字符' },
              ]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          )}

          <Form.Item
            label="角色"
            name="roleIds"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择角色"
              options={roleOptions}
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title="重置密码"
        open={resetModalVisible}
        onOk={handleResetPasswordSubmit}
        onCancel={() => setResetModalVisible(false)}
        confirmLoading={resetPasswordMutation.isPending}
        okText="确认重置"
        cancelText="取消"
        destroyOnClose
        width={400}
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 个字符' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default UserManagement;
