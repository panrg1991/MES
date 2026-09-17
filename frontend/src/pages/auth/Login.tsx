/**
 * MES 系统 - 登录页面
 * 功能：用户名/密码表单 → 调用登录 API → 存储认证信息 → 跳转看板
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { login } from '@/api/auth.api';
import { useAuthStore } from '@/stores/authStore';
import type { LoginRequest } from '@/types/api';

const { Title, Text } = Typography;

/** 登录页面组件 */
function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);

  /** 来源路径（登录后跳转回原页面，默认看板） */
  const fromPath = (location.state as { from?: string } | null)?.from || '/dashboard';

  /** 处理登录提交 */
  const handleLogin = async (values: LoginRequest) => {
    setLoading(true);
    try {
      const result = await login(values);
      // 存储认证信息到 Zustand Store + localStorage
      setAuth(result.token, result.refreshToken, result.user, result.permissions);
      message.success('登录成功');
      navigate(fromPath, { replace: true });
    } catch {
      // 错误信息已由 Axios 拦截器统一提示
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ width: 400, margin: '0 auto', borderRadius: 8 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ marginBottom: 8 }}>
          欢迎登录
        </Title>
        <Text type="secondary">请输入您的账号和密码</Text>
      </div>

      <Form<LoginRequest>
        name="login"
        size="large"
        onFinish={handleLogin}
        autoComplete="off"
        initialValues={{ username: '', password: '' }}
      >
        <Form.Item
          name="username"
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder="用户名"
            autoComplete="username"
          />
        </Form.Item>

        <Form.Item
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="密码"
            autoComplete="current-password"
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
          >
            登录
          </Button>
        </Form.Item>
      </Form>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          默认账号：admin / admin123
        </Text>
      </div>
    </Card>
  );
}

export default Login;
