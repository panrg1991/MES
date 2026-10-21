/**
 * MES 系统 - 登录页面
 * 功能：用户名/密码表单 → 调用登录 API → 存储认证信息 → 跳转看板
 *
 * 现场易用性改造：
 *  ① 「记住用户名」：仅缓存用户名（不缓存密码），减少车间电脑重复输入
 *  ② 后端连通性检测：进入页面即探测 /health，失败时直接提示接口地址与排查方向
 *  ③ 显示当前 API 地址：部署后改 config.js 是否生效一眼可见
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert, Button, Card, Checkbox, Form, Input, Space, Tag, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import { login } from '@/api/auth.api';
import { useAuthStore } from '@/stores/authStore';
import { buildHealthUrl, runtimeConfig } from '@/config/runtime';
import { STORAGE_KEYS } from '@/utils/constants';
import type { LoginRequest } from '@/types/api';

const { Title, Text } = Typography;

/** 登录表单（含「记住用户名」） */
interface LoginFormValues extends LoginRequest {
  remember?: boolean;
}

/** 后端连通状态 */
type ServiceStatus = 'checking' | 'online' | 'offline';

/** 登录页面组件 */
function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('checking');

  /** 已记住的用户名（仅本地缓存，不含密码） */
  const rememberedUsername =
    localStorage.getItem(STORAGE_KEYS.REMEMBER_USERNAME) || '';

  /** 来源路径（登录后跳转回原页面，默认看板） */
  const fromPath = (location.state as { from?: string } | null)?.from || '/dashboard';

  /**
   * 检测后端连通性（直连 axios，不触发全局错误提示）
   */
  const checkService = useCallback(async () => {
    setServiceStatus('checking');
    try {
      await axios.get(buildHealthUrl(), { timeout: 5000 });
      setServiceStatus('online');
    } catch {
      setServiceStatus('offline');
    }
  }, []);

  useEffect(() => {
    void checkService();
  }, [checkService]);

  /** 处理登录提交 */
  const handleLogin = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const result = await login({ username: values.username, password: values.password });

      // 记住 / 清除用户名
      if (values.remember) {
        localStorage.setItem(
          STORAGE_KEYS.REMEMBER_USERNAME,
          values.username.trim(),
        );
      } else {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_USERNAME);
      }

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

      <Form<LoginFormValues>
        name="login"
        size="large"
        onFinish={handleLogin}
        autoComplete="off"
        initialValues={{
          username: rememberedUsername,
          password: '',
          remember: Boolean(rememberedUsername),
        }}
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

        <Form.Item style={{ marginBottom: 12 }}>
          <Form.Item name="remember" valuePropName="checked" noStyle>
            <Checkbox>记住用户名</Checkbox>
          </Form.Item>
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form.Item>
      </Form>

      {serviceStatus === 'offline' ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="无法连接后端服务"
          description={
            <div style={{ fontSize: 12 }}>
              <div>
                接口地址：<Text code>{runtimeConfig.apiBaseUrl}</Text>
              </div>
              <div style={{ marginTop: 4 }}>
                请确认后端已启动、地址配置正确（可修改部署目录下的 config.js）。
              </div>
              <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={() => void checkService()}>
                重新检测
              </Button>
            </div>
          }
        />
      ) : (
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Space size={6}>
            {serviceStatus === 'online' ? (
              <Tag color="success">服务已连接</Tag>
            ) : (
              <Tag>检测中…</Tag>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {runtimeConfig.apiBaseUrl}
            </Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            默认账号：admin / admin123
          </Text>
        </div>
      )}
    </Card>
  );
}

export default Login;
