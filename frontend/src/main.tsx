import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { applyRuntimeConfig, routerBasename } from './config/runtime';
import './styles/global.css';

// 应用运行时配置（标题等）：读取 public/config.js，部署后可改
applyRuntimeConfig();

// React Query 客户端实例：配置全局默认值
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // 失败重试 1 次
      refetchOnWindowFocus: false, // 窗口聚焦时不自动刷新
      staleTime: 30 * 1000, // 数据 30 秒内视为新鲜
    },
  },
});

// Ant Design 主题令牌
const themeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    fontSize: 14,
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          {/* basename：支持部署在子路径（如 /mes/），由运行时配置 BASE_PATH 决定 */}
          <BrowserRouter basename={routerBasename}>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
