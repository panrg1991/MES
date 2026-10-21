/**
 * MES 系统 - 路由配置
 * 所有页面路由在此注册，使用懒加载优化首屏性能
 * T02 已实现：登录/用户管理/角色管理/修改密码
 * T03 已实现：工单管理/工单详情/设备台账/设备详情
 * T04 已实现：质量检验/不良品管理/物料主数据/BOM 管理/库存管理
 * T05 已实现：数据看板
 * T06 已实现：P1 全部 12 条路由注册（指向占位页，T07~T10 只替换页面文件内容）
 *
 * ⚠️ 关于静态段与动态段的匹配优先级（PRD 风险 R1）：
 *  P0 存在动态路由 `/equipment/:id`，P1 新增静态路由 `/equipment/maintenance`、`/equipment/breakdown`。
 *  React Router 6 采用「按具体度排序」的匹配策略，**静态段始终优先于动态段**，
 *  因此无需调整声明顺序，`maintenance` 不会被当作设备 ID。此处保持分组书写仅为可读性。
 */

import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';
import PageLoading from '@/components/common/PageLoading';
import ProtectedRoute from './ProtectedRoute';

// ==================== 懒加载页面组件（T02 已实现） ====================

const Login = lazy(() => import('@/pages/auth/Login'));
const ChangePassword = lazy(() => import('@/pages/auth/ChangePassword'));
const UserManagement = lazy(() => import('@/pages/system/UserManagement'));
const RoleManagement = lazy(() => import('@/pages/system/RoleManagement'));

// ==================== 懒加载页面组件（T03 已实现） ====================

const WorkOrderList = lazy(() => import('@/pages/production/WorkOrderList'));
const WorkOrderDetail = lazy(
  () => import('@/pages/production/WorkOrderDetail'),
);
const EquipmentList = lazy(() => import('@/pages/equipment/EquipmentList'));
const EquipmentDetail = lazy(
  () => import('@/pages/equipment/EquipmentDetail'),
);

// ==================== 懒加载页面组件（T04 已实现） ====================

const InspectionList = lazy(() => import('@/pages/quality/InspectionList'));
const DefectList = lazy(() => import('@/pages/quality/DefectList'));
const MaterialList = lazy(() => import('@/pages/material/MaterialList'));
const BOMManagement = lazy(() => import('@/pages/material/BOMManagement'));
const InventoryManagement = lazy(
  () => import('@/pages/material/InventoryManagement'),
);

// ==================== 懒加载页面组件（T05 已实现） ====================

const Dashboard = lazy(() => import('@/pages/dashboard/Dashboard'));

// ==================== 懒加载页面组件（T06 占位，T07~T10 替换文件内容） ====================

// 生产管理（T08）
const ProductionSchedule = lazy(
  () => import('@/pages/production/ProductionSchedule'),
);
// 设备管理（T07）
const MaintenancePlan = lazy(
  () => import('@/pages/equipment/MaintenancePlan'),
);
const BreakdownList = lazy(() => import('@/pages/equipment/BreakdownList'));
// 质量管理（T09）
const Traceability = lazy(() => import('@/pages/quality/Traceability'));
// 物料管理（T09）
const BatchManagement = lazy(
  () => import('@/pages/material/BatchManagement'),
);
const MaterialTrace = lazy(() => import('@/pages/material/MaterialTrace'));
const InventoryWarning = lazy(
  () => import('@/pages/material/InventoryWarning'),
);
// 人员管理（T08）
const ShiftManagement = lazy(
  () => import('@/pages/personnel/ShiftManagement'),
);
const ScheduleManagement = lazy(
  () => import('@/pages/personnel/ScheduleManagement'),
);
const WorkHours = lazy(() => import('@/pages/personnel/WorkHours'));
// 报表中心（T10）
const OeeAnalysis = lazy(() => import('@/pages/reports/OeeAnalysis'));
const ProductionReportPage = lazy(
  () => import('@/pages/reports/ProductionReport'),
);

// ==================== 路由配置 ====================

/**
 * 路由级权限包装
 * 目的：菜单隐藏只是"看不见"，直接用 URL 访问仍需拦截，避免无权限用户进入空白页。
 * 权限码与后端 requirePermission、菜单 code 保持一致（`code:view` 亦可命中）。
 * @param permission 权限编码
 * @param element 页面元素
 * @returns 带权限守卫的元素
 */
function guarded(permission: string, element: ReactNode) {
  return <ProtectedRoute permission={permission}>{element}</ProtectedRoute>;
}

/**
 * 应用路由组件
 * 结构：AuthLayout（登录页） + MainLayout（ProtectedRoute 包裹的业务页面）
 */
function AppRouter() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        {/* 认证相关路由：不经过权限守卫 */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
        </Route>

        {/* 业务路由：需要登录 + 权限守卫 */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* T02 已实现（修改密码对所有登录用户开放，不加权限码） */}
          <Route
            path="/system/users"
            element={guarded('system:users', <UserManagement />)}
          />
          <Route
            path="/system/roles"
            element={guarded('system:roles', <RoleManagement />)}
          />
          <Route path="/system/settings" element={<ChangePassword />} />

          {/* T03 已实现 */}
          <Route
            path="/production/orders"
            element={guarded('production:order', <WorkOrderList />)}
          />
          <Route
            path="/production/orders/:id"
            element={guarded('production:order', <WorkOrderDetail />)}
          />
          <Route
            path="/equipment/list"
            element={guarded('equipment:list', <EquipmentList />)}
          />
          <Route
            path="/equipment/:id"
            element={guarded('equipment:list', <EquipmentDetail />)}
          />

          {/* T04 已实现 */}
          <Route
            path="/quality/inspection"
            element={guarded('quality:inspection', <InspectionList />)}
          />
          <Route
            path="/quality/defects"
            element={guarded('quality:defect', <DefectList />)}
          />
          <Route
            path="/material/items"
            element={guarded('material:items', <MaterialList />)}
          />
          <Route
            path="/material/bom"
            element={guarded('material:bom', <BOMManagement />)}
          />
          <Route
            path="/material/inventory"
            element={guarded('material:inventory', <InventoryManagement />)}
          />

          {/* T05 已实现 */}
          <Route
            path="/dashboard"
            element={guarded('dashboard', <Dashboard />)}
          />

          {/* ==================== T06 注册的 P1 路由（当前指向占位页） ==================== */}

          {/* 生产管理（P1-01，T08 替换页面内容） */}
          <Route
            path="/production/schedule"
            element={guarded('production:schedule', <ProductionSchedule />)}
          />

          {/* 设备管理（P1-02 / P1-03，T07 替换页面内容）
              注意：静态段 /equipment/maintenance、/equipment/breakdown 与 P0 动态段
              /equipment/:id 共存，RR6 中静态段优先匹配（PRD 风险 R1） */}
          <Route
            path="/equipment/maintenance"
            element={guarded('equipment:maintenance', <MaintenancePlan />)}
          />
          <Route
            path="/equipment/breakdown"
            element={guarded('equipment:breakdown', <BreakdownList />)}
          />

          {/* 质量管理（P1-04，T09 替换页面内容） */}
          <Route
            path="/quality/traceability"
            element={guarded('quality:traceability', <Traceability />)}
          />

          {/* 物料管理（P1-07 / P1-08，T09 替换页面内容） */}
          <Route
            path="/material/batches"
            element={guarded('material:batch', <BatchManagement />)}
          />
          <Route
            path="/material/trace"
            element={guarded('material:trace', <MaterialTrace />)}
          />
          <Route
            path="/material/inventory-warning"
            element={guarded('material:warning', <InventoryWarning />)}
          />

          {/* 人员管理（P1-09 / P1-10，T08 替换页面内容） */}
          <Route
            path="/personnel/shifts"
            element={guarded('personnel:shift', <ShiftManagement />)}
          />
          <Route
            path="/personnel/schedule"
            element={guarded('personnel:schedule', <ScheduleManagement />)}
          />
          <Route
            path="/personnel/work-hours"
            element={guarded('personnel:workhours', <WorkHours />)}
          />

          {/* 报表中心（P1-05 / P1-06，T10 替换页面内容） */}
          <Route
            path="/reports/oee"
            element={guarded('reports:oee', <OeeAnalysis />)}
          />
          <Route
            path="/reports/production"
            element={guarded('reports:production', <ProductionReportPage />)}
          />
        </Route>

        {/* 根路径重定向到看板 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* 404 兜底 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default AppRouter;
export { AppRouter };
