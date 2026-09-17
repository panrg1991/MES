/**
 * MES 系统 - 页面级加载占位组件
 * ---------------------------------------------------------------------------
 * 由路由层（页面懒加载）复用。
 *
 * 【重要】放置位置约定：
 *   该组件必须作为 **离页面组件最近** 的 Suspense 的 fallback。
 *   若把 Suspense 放在 <Routes> 外层，页面 chunk 加载期间 fallback 会替换整棵
 *   路由子树（含 MainLayout），导致侧边栏被卸载重建 —— 表现为「切换菜单后
 *   左侧菜单滚动位置回到顶部、需要重新滑动」。
 *   因此 MainLayout 会在 <Outlet /> 外层再包一层 Suspense，就近捕获页面加载，
 *   使布局保持挂载。
 */

import { Spin } from 'antd';

/** 页面加载中占位 */
function PageLoading() {
  return (
    <div className="flex-center" style={{ height: '50vh' }}>
      <Spin size="large" tip="页面加载中...">
        <div style={{ minHeight: 60 }} />
      </Spin>
    </div>
  );
}

export default PageLoading;
