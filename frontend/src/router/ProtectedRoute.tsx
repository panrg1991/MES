/**
 * MES 系统 - 权限路由守卫组件
 * 功能：未登录跳转 /login，已登录但无权限显示 403 提示
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Result, Button } from 'antd';
import { useAuthStore } from '@/stores/authStore';

interface ProtectedRouteProps {
  /** 子路由 */
  children: React.ReactNode;
  /** 需要的权限编码，不传则仅校验登录状态 */
  permission?: string;
}

/** 路由守卫：检查登录状态和权限 */
function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const location = useLocation();
  const { token, hasPermission } = useAuthStore();

  // 未登录 → 跳转登录页，携带来源路径
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // 已登录但无权限 → 显示 403 页面
  if (permission && !hasPermission(permission)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="抱歉，您没有权限访问此页面。"
        extra={
          <Button type="primary" onClick={() => window.history.back()}>
            返回上一页
          </Button>
        }
      />
    );
  }

  // 权限校验通过，渲染子组件
  return <>{children}</>;
}

export default ProtectedRoute;
