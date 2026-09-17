/**
 * MES 系统 - 主布局组件
 * 基于 ProLayout 实现：侧边栏菜单 + 顶部导航 + 用户操作区 + 内容区
 *
 * 【P1 扩展 I13】菜单新增 2 个顶级分组（人员管理 / 报表中心）与 10 个子菜单，
 * 并按权限过滤菜单（菜单项权限码 = 后端 permission.code）。
 *
 * 权限过滤口径（与 P0 的 ProtectedRoute / authStore.hasPermission 一致）：
 *  ① 叶子菜单：拥有该菜单权限码，或拥有其下任意 `:view` 按钮权限即可见
 *     （这样「只读用户 viewer」仅持有 `*:view` 也能正常看到菜单，避免菜单全空）
 *  ② 分组菜单：其下至少一个叶子菜单可见时才展示
 *  ③ 未登录 / 权限未加载完成时不隐藏菜单，等待权限注入后自动刷新
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ProLayout, type MenuDataItem } from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  ProfileOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { Dropdown, Avatar, message, MenuProps } from 'antd';
import { useAuthStore } from '@/stores/authStore';
import PageLoading from '@/components/common/PageLoading';

/**
 * 菜单项配置
 * 说明：不直接 extends ProLayout 的 MenuDataItem，因为其 `routes` 被声明为
 * `undefined`（联合类型收窄），无法承载嵌套子菜单；渲染时统一断言为 MenuDataItem。
 */
interface MenuConfigItem {
  path: string;
  name: string;
  icon?: ReactNode;
  /** 对应后端权限编码（菜单权限码，如 production:schedule） */
  permission?: string;
  /** 子菜单 */
  routes?: MenuConfigItem[];
}

/** 菜单配置（permission 与后端 seed 的权限码一一对应） */
const menuData: MenuConfigItem[] = [
  {
    path: '/dashboard',
    name: '数据看板',
    icon: <DashboardOutlined />,
    permission: 'dashboard',
  },
  {
    path: '/production',
    name: '生产管理',
    icon: <ProfileOutlined />,
    routes: [
      {
        path: '/production/orders',
        name: '工单管理',
        permission: 'production:order',
      },
      {
        path: '/production/schedule',
        name: '生产排程',
        permission: 'production:schedule',
      },
    ],
  },
  {
    path: '/equipment',
    name: '设备管理',
    icon: <ToolOutlined />,
    routes: [
      {
        path: '/equipment/list',
        name: '设备台账',
        permission: 'equipment:list',
      },
      {
        path: '/equipment/maintenance',
        name: '设备维保计划',
        permission: 'equipment:maintenance',
      },
      {
        path: '/equipment/breakdown',
        name: '故障维修',
        permission: 'equipment:breakdown',
      },
    ],
  },
  {
    path: '/quality',
    name: '质量管理',
    icon: <SafetyCertificateOutlined />,
    routes: [
      {
        path: '/quality/inspection',
        name: '质量检验',
        permission: 'quality:inspection',
      },
      {
        path: '/quality/defects',
        name: '不良品管理',
        permission: 'quality:defect',
      },
      {
        path: '/quality/traceability',
        name: '质量追溯',
        permission: 'quality:traceability',
      },
    ],
  },
  {
    path: '/material',
    name: '物料管理',
    icon: <DatabaseOutlined />,
    routes: [
      {
        path: '/material/items',
        name: '物料主数据',
        permission: 'material:items',
      },
      {
        path: '/material/bom',
        name: 'BOM 管理',
        permission: 'material:bom',
      },
      {
        path: '/material/inventory',
        name: '库存管理',
        permission: 'material:inventory',
      },
      {
        path: '/material/batches',
        name: '物料批次',
        permission: 'material:batch',
      },
      {
        path: '/material/trace',
        name: '物料追溯',
        permission: 'material:trace',
      },
      {
        path: '/material/inventory-warning',
        name: '库存预警',
        permission: 'material:warning',
      },
    ],
  },
  {
    // 【P1 新增顶级菜单】人员管理
    path: '/personnel',
    name: '人员管理',
    icon: <TeamOutlined />,
    routes: [
      {
        path: '/personnel/shifts',
        name: '班次管理',
        permission: 'personnel:shift',
      },
      {
        path: '/personnel/schedule',
        name: '人员排班',
        permission: 'personnel:schedule',
      },
      {
        path: '/personnel/work-hours',
        name: '工时统计',
        permission: 'personnel:workhours',
      },
    ],
  },
  {
    // 【P1 新增顶级菜单】报表中心
    path: '/reports',
    name: '报表中心',
    icon: <BarChartOutlined />,
    routes: [
      {
        path: '/reports/oee',
        name: 'OEE 分析',
        permission: 'reports:oee',
      },
      {
        path: '/reports/production',
        name: '生产报表',
        permission: 'reports:production',
      },
    ],
  },
  {
    path: '/system',
    name: '系统设置',
    icon: <SettingOutlined />,
    routes: [
      {
        path: '/system/users',
        name: '用户管理',
        permission: 'system:users',
      },
      {
        path: '/system/roles',
        name: '角色权限',
        permission: 'system:roles',
      },
      {
        path: '/system/settings',
        name: '系统配置',
        permission: 'system:settings',
      },
    ],
  },
];

/**
 * 侧边栏菜单可滚动容器的候选选择器
 * ProLayout 各版本的滚动容器类名略有差异，按序探测「当前确实可滚动」的那个
 */
const SIDER_SCROLL_SELECTORS = [
  '.ant-pro-sider-menu',
  '.ant-pro-sider-scroll',
  '.ant-layout-sider-children',
];

/**
 * 查找侧边栏菜单的滚动容器
 * 说明：ProLayout 中 `ant-pro-sider-menu` 可能落在菜单本体（<ul>）上，
 *      而真正的滚动区是其父级容器，因此两者都需要探测。
 * @returns 可滚动元素；均不可滚动时返回 null
 */
function findSiderScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  for (const selector of SIDER_SCROLL_SELECTORS) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    );

    for (const element of candidates) {
      if (element.scrollHeight > element.clientHeight) {
        return element;
      }
      const parent = element.parentElement;
      if (parent && parent.scrollHeight > parent.clientHeight) {
        return parent;
      }
    }
  }

  return null;
}

/** 主布局组件 */
function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth, hasPermission, permissions } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  /** 侧边栏菜单滚动位置（切换页面时恢复，避免每次都要重新滑动） */
  const siderScrollTopRef = useRef(0);

  // 记录侧边栏滚动位置
  useEffect(() => {
    const container = findSiderScrollContainer();
    if (!container) {
      return undefined;
    }

    const handleScroll = () => {
      siderScrollTopRef.current = container.scrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 路由变化后：
  //   · 左侧 —— 恢复菜单滚动位置（等两帧，确保菜单已完成本次渲染）
  //   · 右侧 —— 内容区回到顶部，让新页面从头展示
  useEffect(() => {
    const restoreSiderScroll = () => {
      const container = findSiderScrollContainer();
      if (container && container.scrollTop !== siderScrollTopRef.current) {
        container.scrollTop = siderScrollTopRef.current;
      }
    };

    restoreSiderScroll();
    const rafId = requestAnimationFrame(() => {
      restoreSiderScroll();
      requestAnimationFrame(restoreSiderScroll);
    });

    const content = document.querySelector<HTMLElement>('.ant-layout-content');
    if (content) {
      content.scrollTop = 0;
    }

    return () => cancelAnimationFrame(rafId);
  }, [location.pathname]);

  /**
   * 按权限过滤后的菜单
   * @returns 可展示的菜单数组（分组内无可见子项时整组隐藏）
   */
  const visibleMenuData = useMemo((): MenuConfigItem[] => {
    // 权限列表为空视为「尚未加载」或「无任何权限」：
    // 无权限时按显隐规则过滤结果必然为空，但登录后菜单区域为空会误导用户，
    // 因此仅在确实已加载到权限（permissions.length > 0）时执行过滤。
    const permissionLoaded = permissions.length > 0;

    /** 判断单个菜单权限码是否可见（兼容仅持有 `:view` 的角色） */
    const canSee = (permission?: string): boolean => {
      if (!permission) {
        return true;
      }
      if (!permissionLoaded) {
        return true;
      }
      return hasPermission(permission) || hasPermission(`${permission}:view`);
    };

    /** 递归过滤菜单 */
    const filterMenu = (items: MenuConfigItem[]): MenuConfigItem[] => {
      const result: MenuConfigItem[] = [];

      for (const item of items) {
        if (item.routes && item.routes.length > 0) {
          const visibleChildren = filterMenu(item.routes);
          if (visibleChildren.length > 0) {
            result.push({ ...item, routes: visibleChildren });
          }
          continue;
        }

        if (canSee(item.permission)) {
          result.push(item);
        }
      }

      return result;
    };

    return filterMenu(menuData);
  }, [permissions, hasPermission]);

  /** 处理退出登录 */
  const handleLogout = () => {
    clearAuth();
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  /** 用户下拉菜单项 */
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  /**
   * 提供菜单数据
   * 必须稳定引用（useCallback）：否则每次渲染都产生新函数，ProLayout 会重新
   * 计算菜单数据并重建菜单项，进而重置侧边栏滚动位置。
   */
  const renderMenuData = useCallback(
    () => visibleMenuData as unknown as MenuDataItem[],
    [visibleMenuData],
  );

  /**
   * 自定义菜单项渲染
   * 同样需要稳定引用，避免菜单项 DOM 被不必要地重建（会丢失滚动位置）。
   */
  const renderMenuItem = useCallback(
    (item: MenuDataItem, dom: ReactNode) => {
      // ProLayout 的 MenuDataItem 未声明 routes，这里按运行时结构判断是否分组节点
      const childRoutes = (item as unknown as { routes?: unknown[] }).routes;
      const isGroup = Array.isArray(childRoutes) && childRoutes.length > 0;

      return (
        <div
          onClick={() => {
            // 仅叶子菜单可点击跳转，分组节点点击用于展开/收起
            if (item.path && !isGroup) {
              navigate(item.path);
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          {dom}
        </div>
      );
    },
    [navigate],
  );

  /** 顶部/侧边栏定位信息（保持引用稳定，避免 ProLayout 无谓重算） */
  const layoutLocation = useMemo(
    () => ({ pathname: location.pathname }),
    [location.pathname],
  );

  return (
    <ProLayout
      title="MES 制造执行系统"
      logo={null}
      layout="mix"
      collapsed={collapsed}
      onCollapse={setCollapsed}
      location={layoutLocation}
      menu={{ type: 'group' }}
      menuDataRender={renderMenuData}
      menuItemRender={renderMenuItem}
      avatarProps={{
        title: user?.name || '用户',
        render: (_, dom) => (
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ marginRight: 8 }} />
              {dom}
            </div>
          </Dropdown>
        ),
      }}
      fixSiderbar
      fixedHeader
    >
      {/*
        子路由渲染出口
        就近使用 Suspense 捕获页面懒加载：若交由最外层 <Routes> 的 Suspense 处理，
        fallback 会替换整棵路由子树（含本布局），导致侧边栏被卸载重建、
        菜单滚动位置回到顶部。此处包裹后，布局始终保持挂载。
      */}
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </ProLayout>
  );
}

export default MainLayout;
