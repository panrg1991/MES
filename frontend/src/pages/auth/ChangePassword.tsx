/**
 * MES 系统 - 修改密码页面
 * 功能：旧密码 + 新密码 + 确认密码 → 调用修改密码 API → 提示重新登录
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, App } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { changePassword } from '@/api/auth.api';
import { useAuthStore } from '@/stores/authStore';

const { Title, Text } = Typography;

interface ChangePasswordForm {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** 修改密码页面组件 */
function ChangePassword() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);

  /** 处理修改密码提交 */
  const handleSubmit = async (values: ChangePasswordForm) => {
    setLoading(true);
    try {
      await changePassword(
        values.oldPassword,
        values.newPassword,
        values.confirmPassword,
      );
      message.success('密码修改成功，请重新登录');
      // 清除认证信息，跳转登录页
      clearAuth();
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch {
      // 错误信息已由 Axios 拦截器统一提示
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <Card>
        <div style={{ marginBottom: 24 }}>
          <Title level={4} style={{ marginBottom: 8 }}>
            修改密码
          </Title>
          <Text type="secondary">
            修改密码后需要重新登录，请确保新密码的安全性。
          </Text>
        </div>

        <Form<ChangePasswordForm>
          name="changePassword"
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="旧密码"
            name="oldPassword"
            rules={[{ required: true, message: '请输入旧密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入旧密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 个字符' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default ChangePassword;
