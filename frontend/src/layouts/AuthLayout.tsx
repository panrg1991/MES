/**
 * MES 系统 - 认证布局组件
 * 用于登录页面：居中卡片式布局，渐变背景
 */

import { Outlet } from 'react-router-dom';
import { Typography } from 'antd';

const { Title, Text } = Typography;

/** 认证布局：居中卡片 */
function AuthLayout() {
  return (
    <div className="auth-layout">
      <div style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
        <div style={{ marginBottom: 32 }}>
          <Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
            MES 车间制造执行系统
          </Title>
          <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14 }}>
            Manufacturing Execution System
          </Text>
        </div>
        {/* 登录表单渲染出口（由子路由 Login 页面填充） */}
        <Outlet />
      </div>
    </div>
  );
}

export default AuthLayout;
