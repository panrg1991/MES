# MES 车间制造执行系统 — 前端部署说明书

> 本文档面向**部署/运维人员**，目标是「照做即可把前端部署到服务器」。
> 所有命令、路径、端口均以本工程实际文件为准（`package.json` / `vite.config.ts` / `.env*` / `src/api/request.ts` / `src/router/index.tsx`）。
>
> 配套文件（同目录 `deploy/`）：
> - [`deploy/nginx.conf.example`](./deploy/nginx.conf.example) —— Nginx 站点配置（推荐方案，含 /api 反代 + history fallback + 缓存/压缩策略）
> - [`deploy/web.config.example`](./deploy/web.config.example) —— Windows IIS 配置（URL Rewrite 回退 + 缓存策略）
> - [`deploy/start-nginx.bat`](./deploy/start-nginx.bat) + [`deploy/start-nginx.ps1`](./deploy/start-nginx.ps1) —— **Windows 一键启动脚本**（定位 nginx → 生成配置 → `nginx -t` 校验 → 启动/重载）
> - [`.env.example`](./.env.example) —— 环境变量模板与取值策略说明
> - [`vitest.config.ts`](./vitest.config.ts) —— 测试配置（jsdom 环境 + `@` 别名 + 覆盖率）
> - [`src/test/setup.ts`](./src/test/setup.ts) —— 测试前置（jest-dom 断言、浏览器 API 补桩、用例间清理）
>
> 关联文档：
> - 项目总览 → [`../README.md`](../README.md)
> - 整体部署总纲 → [`../DEPLOYMENT.md`](../DEPLOYMENT.md)
> - 测试与持续集成 → [`../TESTING.md`](../TESTING.md)
>
> 命名约定：`*.example` 为**模板文件，不会自动生效**（需人工复制/引用），避免被误当作生效配置。

---

## 目录

- [1. 技术栈与运行环境要求](#1-技术栈与运行环境要求)
- [2. 目录结构说明](#2-目录结构说明)
  - [布局滚动模型（切页行为约定）](#布局滚动模型切页行为约定)
- [3. 命令速查](#3-命令速查)
- [4. 本地开发](#4-本地开发)
- [5. 环境变量说明](#5-环境变量说明)
- [6. 生产打包](#6-生产打包)
- [7. 部署方式](#7-部署方式)
- [8. 部署后验证清单](#8-部署后验证清单)
- [9. 常见问题排查](#9-常见问题排查)
- [10. 与后端的接口约定摘要](#10-与后端的接口约定摘要)
- [11. 自动化测试](#11-自动化测试)

---

## 1. 技术栈与运行环境要求

| 类别 | 技术 | 版本（取自 `package.json`） |
|------|------|------------------------------|
| 框架 | React | `^18.2.0` |
| 语言 | TypeScript | `^5.3.3` |
| 构建 | Vite | `^5.1.4`（含 `@vitejs/plugin-react` `^4.2.1`） |
| UI | Ant Design | `^5.14.0` + `@ant-design/icons` `^5.3.0` + `@ant-design/pro-layout` `^7.19.0` |
| 路由 | React Router | `^6.22.0`（**history 模式**） |
| 状态 | Zustand | `^4.5.0`（配合 persist 持久化认证态） |
| 数据层 | TanStack React Query | `^5.25.0` |
| HTTP | Axios | `^1.6.7` |
| 图表 | ECharts | `^5.5.0` + `echarts-for-react` `^3.0.2` |
| 日期 | dayjs | `^1.11.10` |
| 校验 | zod | `^3.22.4` |
| 构建期压缩 | vite-plugin-compression | `^0.5.1`（gzip，>10KB 生成 `.gz`） |
| 测试 | Vitest `^1.6.0` + @testing-library/react `^14.2.1` + jsdom `^24.0.0` | 单元 / 组件测试；覆盖率用 @vitest/coverage-v8 |

### 运行环境要求

| 项 | 要求 | 说明 |
|----|------|------|
| **Node.js** | **≥ 18.18**（**推荐 20 LTS**） | Vite 5 要求 Node `^18.0.0 \|\| >=20.0.0`；本项目构建期还用到 `@types/node` `^20.11.0`。Node 16 及以下会直接报错 |
| npm | ≥ 9（随 Node 20 自带 10.x） | 工程使用 `package-lock.json`，**CI/生产构建推荐 `npm ci`** |
| 磁盘 | 源码 + `node_modules` 约 400MB；`dist/` 约 5–10MB | — |
| 部署环境 | 仅需一个静态服务器（Nginx / IIS / 任意静态托管） | 产物是纯静态文件，**运行期不需要 Node**（Node 只在构建机使用） |

### 浏览器兼容性

Vite 5 默认构建目标为 `modules`（约 es2020），对应最低版本：

- Chrome / Edge **≥ 87**
- Firefox **≥ 78**
- Safari **≥ 14**

实际使用建议 Chrome 100+ / Edge 100+（Ant Design 5 与 ECharts 5 的推荐环境）。不支持 IE。

---

## 2. 目录结构说明

```
frontend/
├── ├── index.html                # SPA 入口 HTML（标题：MES 车间制造执行系统；挂载点 #root）
├── package.json              # 依赖与脚本（dev / build / preview / test / lint）
├── vite.config.ts            # Vite 配置：dev 端口 5173、/api 代理、@ 别名、分包、gzip
├── vitest.config.ts          # Vitest 配置：jsdom 环境、@ 别名、覆盖率（独立于构建配置）
├── tsconfig.json             # TS 主配置（含 tsconfig.node.json 覆盖 vite/vitest 配置本身；
│                             #   TS 编译缓存输出到 node_modules/.tmp，不污染根目录）
├── .eslintrc.cjs / .prettierrc
├── .env                      # 通用环境变量（VITE_API_BASE_URL=/api）
├── .env.production           # 生产环境变量（同名变量覆盖 .env）
├── .env.example              # 环境变量模板（部署时参考，勿放敏感值）
├── deploy/
│   ├── nginx.conf.example    # Nginx 站点配置示例（推荐）
│   ├── web.config.example    # IIS 配置示例（Windows）
│   ├── start-nginx.bat       # Windows 一键启动入口（薄封装，ASCII 内容）
│   └── start-nginx.ps1       # Windows 一键启动实现（生成配置 + nginx -t + 启动）
└── src/
    ├── main.tsx              # 应用入口：挂载 React、配置 React Query / AntD / Router
    ├── App.tsx               # 根组件（主题、全局 Provider、错误边界）
    ├── api/                  # 接口层：按模块拆分，统一走 request.ts
    │   ├── request.ts        # axios 封装：baseURL 取 VITE_API_BASE_URL、JWT 注入、
    │   │                     #   401 自动刷新重放、blob 导出短路、GET 空参数清洗
    │   ├── auth.api.ts / user.api.ts / role.api.ts / dashboard.ts
    │   ├── production.api.ts / equipment.api.ts / quality.api.ts / material.api.ts
    │   ├── maintenance.api.ts / breakdown.api.ts       # P1 设备维保 / 故障
    │   ├── schedule.api.ts / trace.api.ts / personnel.api.ts / report.ts
    │   └── （共 15 个文件：request.ts + 14 个业务接口模块）
    ├── components/           # 跨页面复用的业务/通用组件
    │   ├── EquipmentStatusCard.tsx
    │   ├── charts/           # BarChart / LineChart / PieChart / GaugeChart（ECharts 封装）
    │   ├── common/           # ExportButton / WarningTag / PageLoading（导出按钮 / 预警标签 / 加载占位）
    │   ├── gantt/            # SimpleGantt（自绘甘特图）
    │   ├── personnel/        # ScheduleCalendar（排班日历）
    │   └── trace/            # TraceChain（质量追溯链路）
    ├── layouts/              # AuthLayout（登录页外壳）、MainLayout（侧边菜单 + 顶栏 + 内容区）
    ├── pages/                # 页面，按业务模块分组（见下表）
    ├── router/               # index.tsx（路由表，全部懒加载）、ProtectedRoute.tsx（登录+权限守卫）
    ├── stores/               # Zustand：authStore.ts（token/用户/权限、hasPermission）
    ├── styles/               # global.css（全局样式、布局滚动模型、工具类）
    ├── test/                 # 测试前置：setup.ts（jest-dom 断言 + ObjectURL 补桩 + 用例间清理）
    ├── types/                # index.ts（业务实体类型）、api.ts（统一响应/分页类型）
    └── utils/                # constants.ts（枚举映射/状态机）、format.ts（日期/数字格式化）、
                              #   download.ts（blob 下载，用于 Excel 导出）
                              #   单元测试与源码同目录命名：*.test.ts / *.test.tsx
```

### `src/pages/` 按模块分组

| 分组 | 页面文件 | 路由（浏览器地址） |
|------|----------|--------------------|
| **dashboard 数据看板** | `Dashboard.tsx`、`EquipmentStatusCard.tsx`、`OutputTrendChart.tsx`、`ProductionProgressCard.tsx`、`QualitySummaryCard.tsx` | `/dashboard` |
| **production 生产管理** | `WorkOrderList.tsx`、`WorkOrderDetail.tsx`、`WorkOrderForm.tsx`、`ProductionSchedule.tsx`（甘特排程）、`ScheduleFormModal.tsx`、`ProductionReport.tsx` | `/production/orders`、`/production/orders/:id`、`/production/schedule` |
| **equipment 设备管理** | `EquipmentList.tsx`、`EquipmentDetail.tsx`、`MaintenancePlan.tsx`（维保计划）、`MaintenancePlanFormModal.tsx`、`MaintenanceRecordModal.tsx`、`BreakdownList.tsx`（故障维修）、`BreakdownReportModal.tsx`、`BreakdownRepairModal.tsx` | `/equipment/list`、`/equipment/:id`、`/equipment/maintenance`、`/equipment/breakdown` |
| **quality 质量管理** | `InspectionList.tsx`、`InspectionForm.tsx`、`DefectList.tsx`、`DefectForm.tsx`、`Traceability.tsx`（追溯） | `/quality/inspection`、`/quality/defects`、`/quality/traceability` |
| **material 物料管理** | `MaterialList.tsx`、`BOMManagement.tsx`、`InventoryManagement.tsx`、`BatchManagement.tsx`、`BatchFormModal.tsx`、`MaterialTrace.tsx`、`InventoryWarning.tsx` | `/material/items`、`/material/bom`、`/material/inventory`、`/material/batches`、`/material/trace`、`/material/inventory-warning` |
| **personnel 人员管理** | `ShiftManagement.tsx`、`ShiftFormModal.tsx`、`ScheduleManagement.tsx`、`ScheduleFormModal.tsx`、`WorkHours.tsx`、`WorkHoursFormModal.tsx` | `/personnel/shifts`、`/personnel/schedule`、`/personnel/work-hours` |
| **reports 报表中心** | `OeeAnalysis.tsx`、`ProductionReport.tsx` | `/reports/oee`、`/reports/production` |
| **system 系统设置** | `UserManagement.tsx`、`RoleManagement.tsx`、`RolePermissionAssign.tsx` | `/system/users`、`/system/roles`、`/system/settings` |
| **auth 认证** | `Login.tsx`、`ChangePassword.tsx` | `/login`（`/system/settings` 复用修改密码页） |

> **路由特性（部署必须知道）**：全部页面在 `src/router/index.tsx` 中通过 `React.lazy` 懒加载，最终产物是 `dist/assets/` 下**每个页面一个 chunk**，首屏只加载当前页所需代码。
> 未知路径（含 404 兜底）统一 `Navigate` 重定向到 `/dashboard`，因此**不会出现前端自己渲染的空白页**，但服务器侧仍必须配置 history fallback（见 §7）。

### 布局滚动模型（切页行为约定）

后台布局采用「**整体固定 · 分区独立滚动**」，规则定义在 `src/styles/global.css`：

```
┌─────────────────────────────────────────────┐
│ 顶栏（固定）                                 │
├───────────────┬─────────────────────────────┤
│ 侧边菜单       │ 内容区                      │
│ 独立滚动       │ 独立滚动                     │
│ 切页后位置保留 │ 切页后回到顶部               │
└───────────────┴─────────────────────────────┘
```

| 区域 | 滚动行为 | 切换页面后的表现 |
|------|----------|------------------|
| 侧边菜单 | 菜单项超出视口时在**侧边栏内部**滚动 | **滚动位置保持不变**，不会跳回顶部 |
| 右侧内容区 | 页面内容超出时在**内容区内部**滚动 | **回到顶部**，新页面从头展示 |
| 整页 | `height: 100vh` + `overflow: hidden`，**不产生整页滚动条** | — |

**为什么这样设计**：早期实现中侧边栏为 `position: fixed` 但菜单内容溢出且 `overflow: visible`，
菜单底部分组（人员管理 / 报表中心 / 系统设置）**无法滚动到**；同时整页滚动位置会随新页面高度变化被清零，
导致每次切换菜单都要重新滑动。

**新增页面时的注意事项**：

- 页面**不要**依赖 `window` 滚动（如 `window.scrollTo`、锚点跳转），滚动容器是 `.ant-layout-content`；
- 页面容器用 `min-height: 100%` 而非 `min-height: 100vh`，避免把布局撑高后被 `overflow: hidden` 裁切；
- 页面懒加载由 `MainLayout` 内的 `<Suspense>` **就近捕获**；
  ⚠️ **不要**在 `src/router/index.tsx` 的 `<Routes>` 外层包 Suspense，否则加载期间会卸载整个布局，
  上述滚动状态与菜单展开状态都会丢失。

---

## 3. 命令速查

> 以下命令均在 **`frontend/` 目录下**执行，与 `package.json` 的 `scripts` 完全一致。

| 命令 | 实际执行 | 用途 |
|------|----------|------|
| `npm install` | 按 `package-lock.json` 安装依赖（可更新 lock） | 首次开发环境准备 |
| `npm ci` | 严格按 lock 文件安装，删除已有 `node_modules` | **CI / 生产构建推荐** |
| `npm run dev` | `vite` | 启动开发服务器：`http://localhost:5173`，自动打开浏览器，`/api` 代理到后端 3000 |
| `npm run build` | `tsc -b && vite build` | **生产打包**：先做全量 TS 类型检查，再产出 `dist/` |
| `npm run preview` | `vite preview` | 本地预览 `dist/` 产物（默认 `http://localhost:4173`），**仅用于验证，无 /api 代理** |
| `npm run lint` | `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0` | 代码检查（**任何 warning 都视为失败**，`--max-warnings 0`） |
| `npm test` | `vitest run` | 单次运行全部测试（单元 + 组件） |
| `npm run test:watch` | `vitest` | 监听模式，开发时使用 |
| `npm run test:coverage` | `vitest run --coverage` | 生成覆盖率报告（`coverage/`） |
| `npx tsc -b --force` | TypeScript 强制全量类型检查（不产出） | 只验证类型、不打包（排查类型错误时用） |

**注意**：
- `npm run build` 中的 `tsc -b` **有错即中断打包**（TypeScript 类型错误会导致整个构建失败），这是刻意的质量门禁。
- 只想跳过类型检查快速出包（**不推荐用于正式部署**）：`npx vite build`。

---

## 4. 本地开发

### 4.1 步骤

```bash
# 1) 进入前端目录
cd mes-workshop-system/frontend

# 2) 安装依赖（首次或依赖变更时）
npm ci            # 或 npm install

# 3) 确认/编辑环境变量（开发默认即可，见 .env）
#    VITE_API_BASE_URL=/api
cat .env

# 4) 启动开发服务器（自动打开 http://localhost:5173）
npm run dev
```

### 4.2 与后端的依赖关系

开发环境下，前端所有 `/api/**` 请求会被 **Vite 开发服务器代理**到后端，因此：

- **必须先启动后端**（默认监听 **3000** 端口），否则登录等接口会 502/连接失败。
  验证后端是否就绪：

  ```bash
  curl http://127.0.0.1:3000/api/health
  # 期望返回：{"code":200,"data":{"status":"ok",...},"message":"服务运行正常"}
  ```

- 代理配置位置：`vite.config.ts` 的 `server.proxy`：

  ```ts
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      // 显式使用 127.0.0.1 而非 localhost，避免被 IPv6(::1) 上的其他服务占用
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  }
  ```

- **如何修改后端地址**（后端不在本机 3000 端口时）：
  1. 改 `vite.config.ts` 中 `server.proxy['/api'].target` 为实际后端地址（如 `http://192.168.1.100:8080`）；
  2. **重启 `npm run dev`**（Vite 配置变更不会热更新）。

  > 开发环境**不要**通过改 `.env` 的 `VITE_API_BASE_URL` 来切换后端：那会让浏览器直连后端而绕过 Vite 代理，从而触发跨域问题。代理目标才是开发期的正确切换点。

### 4.3 开发期排错小贴士

- 修改 `.env` 后需**重启 dev server**（Vite 在启动期读取环境变量）。
- 开发服务器端口被占用时，Vite 会自动改用 5174、5175…（以终端输出为准）。

---

## 5. 环境变量说明

### 5.1 现有文件

| 文件 | 内容 | 生效场景 |
|------|------|----------|
| `.env` | `VITE_API_BASE_URL=/api`、`VITE_APP_TITLE=MES 车间制造执行系统` | 所有模式的基线（`dev` 与 `build` 都会加载） |
| `.env.production` | 同上（值一致） | **`npm run build` 时覆盖 `.env` 的同名变量** |
| `.env.example` | 模板 + 取值策略说明（**不含敏感值**） | 供部署时复制参考，不被 Vite 加载 |

### 5.2 唯一必需变量：`VITE_API_BASE_URL`

前端 axios 实例的 `baseURL` 取自该变量（`src/api/request.ts`）：

```ts
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',   // 未设置时兜底为 '/api'
  timeout: 30000,
  ...
});
```

**取值策略（推荐度由高到低）**：

| 方案 | 取值 | 说明 |
|------|------|------|
| ① **推荐** | `/api` | **同源方案**：前端与接口同域同端口，由 Nginx（或 IIS+ARR）把 `/api` 反代到后端。**天然无跨域**；换服务器/域名/端口都不用重新打包 |
| ② 临时验证 | `http://192.168.1.100:3000/api` | 浏览器直连后端：**属于跨域请求**，须后端开启 CORS 允许该来源；IP 硬编码，换环境要重新打包，**不建议生产使用** |
| ③ 留空 | 不设置 | 前端兜底为 `/api`，效果同 ①，但仍建议在 `.env.production` 显式声明，便于排查 |

### 5.3 必须知道的四条规则

1. **变量名必须以 `VITE_` 前缀开头**，否则 Vite 不会注入，代码里读到的是 `undefined`。
2. **变量在「构建期」注入**（Vite 会把值静态替换进 JS），因此**改完环境变量必须重新 `npm run build`**；重启静态服务器或刷新浏览器都不生效。
3. **优先级（后者覆盖前者）**：
   `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`
   其中 `mode` 由命令决定：`npm run dev` = `development`，`npm run build` = `production`。
   例：`.env.production` 会覆盖 `.env`；`.env.production.local` 优先级最高（本工程未使用 `.local`）。
4. **不要放敏感信息**：所有 `VITE_` 变量最终都会打包进浏览器可见的 JS，等于公开。

### 5.4 典型场景怎么改

```bash
# 场景 A：Nginx 同源反代（生产推荐，也是默认值）——无需改动
# .env.production
VITE_API_BASE_URL=/api

# 场景 B：后端另起域名/端口，前端直连（临时）
# .env.production
VITE_API_BASE_URL=http://192.168.1.100:3000/api
# 改完务必重新构建：
npm run build
```

---

## 6. 生产打包

### 6.1 构建步骤

```bash
cd mes-workshop-system/frontend

# 1) 按 lock 文件干净安装（推荐；生产机无 npm 缓存时首次会稍慢）
npm ci

# 2) 确认生产环境变量（默认 /api 即为推荐值）
cat .env.production

# 3) 打包（先 tsc 类型检查，再 vite build）
npm run build
```

> **构建机要求**：Node ≥ 18.18（推荐 20 LTS）、能访问 npm 源。**部署机（跑 Nginx 的那台）不需要 Node**。

### 6.2 产物结构（`dist/`）

```
dist/
├── index.html                  # 入口 HTML（引用带哈希的 JS/CSS，绝不缓存）
├── vite.svg                    # 说明：index.html 中引用了 /vite.svg 作为 favicon，
│                               #   但工程当前没有 public/ 目录，因此该请求会 404
│                               #   （仅控制台一条 404，不影响功能；如需消除可建 public/vite.svg）
└── assets/
    ├── index-<hash>.js         # 应用入口 chunk
    ├── index-<hash>.css        # 全局样式
    ├── react-<hash>.js         # 分包：react + react-dom + react-router-dom
    ├── antd-<hash>.js          # 分包：antd + @ant-design/icons
    ├── charts-<hash>.js        # 分包：echarts + echarts-for-react
    ├── Dashboard-<hash>.js     # 各页面独立 chunk（懒加载，按需加载）
    ├── EquipmentList-<hash>.js
    ├── MaintenancePlan-<hash>.js
    ├── BreakdownList-<hash>.js
    ├── ... （每个页面一个 chunk）
    └── *.js.gz / *.css.gz      # vite-plugin-compression 生成：>10KB 资源的 gzip 预压缩文件
```

### 6.3 构建配置解读（`vite.config.ts`）

| 配置 | 值 | 影响 |
|------|-----|------|
| `build.outDir` | `dist` | 产物目录 |
| `build.sourcemap` | `false` | 不产出 sourcemap（体积小、不暴露源码）；如需排查线上问题可临时改 `true` 重新构建 |
| `rollupOptions.output.manualChunks` | `react` / `antd` / `charts` | 三方依赖分包：这三包体积最大且极少变动，可被浏览器长期缓存，业务代码更新时用户只需重新下载变化的页面 chunk |
| `vite-plugin-compression` | `threshold: 10240`、`algorithm: gzip`、`ext: '.gz'` | 对 >10KB 的资源额外产出 `.gz`；Nginx 开 `gzip_static` 可直接命中（见 `deploy/nginx.conf.example`） |
| `base` | **未配置**（默认 `/`） | 产物按「部署在域名根路径」生成（**已实测**：`index.html` 引用为绝对路径 `/assets/...`，见 §6.5）。**若需部署到子路径**（如 `https://host/mes/`），必须在 `vite.config.ts` 增加 `base: '/mes/'` 并重新构建，否则资源 404 白屏 |
| `resolve.alias` | `@` → `./src` | 仅影响源码 import，与部署无关 |

### 6.4 体积与首屏优化建议

- **已具备的优化**：① 全部页面路由级懒加载；② 三方库分包；③ 构建期 gzip。
- 首屏（登录页 / 看板）只需加载 `index` + `react` + `antd` 相关 chunk；ECharts 仅在含图表的页面（看板、报表、OEE）才被加载。
- 若需进一步压缩：
  - 用 `vite build --mode production` 后的 `dist/assets/*.js` 大小排序，重点看 `antd-*.js` 与 `charts-*.js`；
  - 开启 Nginx `gzip_static on;`（直接使用 `.gz`，省 CPU）与 Brotli（若模块可用）；
  - 静态资源长缓存（`deploy/nginx.conf.example` 已配置 `assets/` 1 年 immutable）。

### 6.5 构建实测记录（本次交付环境实测，供对照）

| 项 | 实测值 |
|----|--------|
| 构建机 | Node **v22.22.2**、npm **10.9.7**（满足「≥18.18，推荐 20 LTS」要求） |
| 类型检查 | `npx tsc -b --force` → **exit code 0**（无类型错误） |
| 生产构建 | `npx vite build` → vite **v5.4.21**，**4206 个模块**转换，**built in 27.44s**，**exit code 0** |
| 未压缩（minified）总体积 | 约 **2.8 MB**（其中 antd ≈ 1.17 MB、charts ≈ 1.05 MB） |
| gzip 后总体积 | 约 **0.86 MB**（antd 365 KB、charts 350 KB、index 85.7 KB、react 53.3 KB） |
| 预压缩文件 | 已为 >10KB 的 8 个 chunk 生成 `.gz`（`index / react / antd / charts / request / useQuery / MaintenancePlan / ProductionSchedule`） |
| 构建告警 | ⚠️ `Some chunks are larger than 500 kB after minification`（指向 `antd-*.js` 1.17 MB、`charts-*.js` 1.05 MB）——**属预期**：这两个是 manualChunks 显式拆出的第三方依赖包，已独立长缓存且首屏不必全量加载（ECharts 仅在图表页加载）。如需消除告警可调 `build.chunkSizeWarningLimit`，**但不建议为此牺牲分包策略** |
| 产物资源引用形式 | `index.html` 中为**绝对路径** `/assets/index-<hash>.js`、`/assets/*.css`（相对路径 0 处） |
| `base` 实测结论 | `vite.config.ts` **未设置 `base`**，即默认 `/` → 产物按「部署在**域名根路径**」生成。**结论：Nginx `root <dist>` 可直接托管，无需额外改动**；若要部署到子路径（如 `https://host/mes/`），**必须**在 `vite.config.ts` 增加 `base: '/mes/'` 并**重新构建**，否则资源 404、页面白屏 |

> 复现命令（本次即用该方式验证，输出目录与常规 `dist` 隔离，避免与并行任务冲突）：
>
> ```bash
> npx tsc -b --force && npx vite build --outDir dist-deploy
> ```

---

## 7. 部署方式

> **核心结论（务必先读）**：前端是 **SPA + History 路由**，部署时有两件事必须做对：
> 1. **History fallback**：任何「不是真实文件」的路径都返回 `index.html`，否则用户在 `/equipment/list` 这类子页面按 F5 会 404；
> 2. **`/api` 反向代理到后端 3000**（配合 `VITE_API_BASE_URL=/api`），实现同源、免跨域。
> 以下三种方式任选其一，**方式一（Nginx）为推荐**。

### 7.1 方式一：Nginx 静态托管 + /api 反代（推荐）

**步骤**

```bash
# ① 在构建机上打包
cd mes-workshop-system/frontend && npm ci && npm run build

# ② 将 dist/ 上传到服务器（示例路径 /opt/mes/frontend/dist）
#    Linux（rsync）
rsync -avz --delete dist/ user@server:/opt/mes/frontend/dist/
#    Linux（scp，无 rsync 时）
scp -r dist/* user@server:/opt/mes/frontend/dist/
#    Windows → Windows：直接复制 dist 文件夹到目标机，如 D:/mes/frontend/dist

# ③ 在服务器上安装站点配置
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/mes-frontend.conf
#    并把文件里的 root 改为实际 dist 路径，例如：
#      root /opt/mes/frontend/dist;
sudo nginx -t          # 语法检查，必须显示 successful
sudo nginx -s reload   # 平滑生效
```

**配置校验（务必先校验再 reload）**

```bash
# 若 nginx.conf.example 是作为站点配置片段放在 conf.d 下（推荐）：
sudo nginx -t && sudo nginx -s reload

# 若指定独立配置文件方式校验：
nginx -t -c /etc/nginx/conf.d/mes-frontend.conf
```

> **本次交付环境的说明**：交付机为 Windows 开发机，**未安装 nginx**（`nginx -v` 不可用），因此无法执行真实的 `nginx -t`。
> 已对该配置做了**结构化自检**（等价性校验，逐项通过）：花括号配对 6/6、指令拼写白名单（23 种指令）、指令终止符完备性、必填指令存在性（`listen` / `server_name` / `root` / `index` / `try_files $uri $uri/ /index.html` / `location /api/` / `proxy_pass`）、`proxy_pass` 末尾无斜杠、`root` 路径与文档一致。
> **上生产前请在服务器上执行一次 `nginx -t` 完成最终确认**（Nginx 自身校验是唯一权威）。

**配置要点**（完整可复制版本见 [`deploy/nginx.conf.example`](./deploy/nginx.conf.example)）：

```nginx
server {
    listen 80;
    server_name _;
    root /opt/mes/frontend/dist;      # ← 改成实际 dist 绝对路径
    index index.html;

    # ① History fallback：非文件、非目录 → index.html（放在子页面刷新不 404）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ② index.html 禁止缓存：避免引用到已失效的旧哈希资源（白屏根因之一）
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        expires -1;
    }

    # ③ 带内容哈希的静态资源长期强缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        # gzip_static on;   # 若 Nginx 编译含该模块，可直接使用构建期生成的 .gz
    }

    # ④ /api 反向代理到后端（同源方案核心）
    #    ⚠️ proxy_pass 末尾“不要”加斜杠：加了会把 /api 前缀剥掉，后端全部 404
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 后端有限流（按客户端 IP），上述 IP 相关头必须透传，否则会被识别为同一代理 IP
        proxy_read_timeout 60s;           # 报表导出等耗时接口
    }

    gzip on;
    gzip_min_length 1024;
    gzip_types text/css text/javascript application/javascript application/json image/svg+xml;
}
```

**端口一致性**：`deploy/nginx.conf.example` 与本地开发代理 (`vite.config.ts`) 都指向**后端 3000**，三者必须与后端实际监听端口一致：

| 环境 | 代理目标位置 | 值 |
|------|--------------|-----|
| 本地开发 | `vite.config.ts` → `server.proxy['/api'].target` | `http://127.0.0.1:3000` |
| 生产 | `deploy/nginx.conf.example` → `location /api/` → `proxy_pass` | `http://127.0.0.1:3000` |

### 7.2 方式二：Windows 内网（IIS 或 Nginx for Windows）

**方案 A：IIS（静态托管 + URL Rewrite）**

1. 安装 IIS 角色（含「静态内容」），并**单独安装 [URL Rewrite 2.0](https://www.iis.net/downloads/microsoft/url-rewrite)**（IIS 不自带，缺它无法做 history fallback）。
2. 新建网站，物理路径指向 `dist` 目录（如 `D:\mes\frontend\dist`），绑定端口（如 8080）。
3. 把 [`deploy/web.config.example`](./deploy/web.config.example) 重命名为 **`web.config`**，放到 `dist` 目录下（与 `index.html` 同级），然后 `iisreset` 或重启站点。

`web.config` 关键片段（完整版见示例文件）：

```xml
<rewrite>
  <rules>
    <!-- /api 请求不回退（交给后端或 ARR 代理） -->
    <rule name="ExcludeApi" stopProcessing="true">
      <match url="^api/.*" />
      <action type="None" />
    </rule>
    <!-- SPA 回退：非文件、非目录 → index.html -->
    <rule name="SPA History Fallback" stopProcessing="true">
      <match url=".*" />
      <conditions logicalGrouping="MatchAll">
        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
      </conditions>
      <action type="Rewrite" url="/index.html" />
    </rule>
  </rules>
</rewrite>
```

**IIS 若要同时反代 /api**：需额外安装 **ARR (Application Request Routing)**，在「Server Proxy Settings」勾选 `Enable proxy`，再放开 `web.config.example` 末尾注释掉的 `ProxyApiToBackend` 规则（示例已保留 `/api` 前缀）。

**方案 B：Nginx for Windows**

与 §7.1 完全相同，只是路径用 Windows 写法且用正斜杠：

```nginx
root  D:/mes/frontend/dist;
```

> ⚠️ **注意**：`deploy/nginx.conf.example` 是 **`server {}` 片段**（不含 `events{}` / `http{}`），
> 不能直接 `nginx -c` 启动，必须**嵌入某份 `http{}` 块内**（或 `include` 进去）。

**一键启动（推荐，省去手工拼接）**

```cmd
:: 1) 先构建（若尚未构建）
cd mes-workshop-system\frontend
npm ci && npm run build

:: 2) 下载 nginx/Windows 并解压，例如 D:\nginx-1.25.4
::    https://nginx.org/en/download.html

:: 3) 一键启动（自动完成：定位 nginx → 生成独立配置 → nginx -t 校验 → 启动/重载）
deploy\start-nginx.bat D:\nginx-1.25.4

:: 若 nginx 已在 PATH 或设置了 NGINX_HOME 环境变量，可省略参数：
deploy\start-nginx.bat
```

脚本做了这些事（见 [`deploy/start-nginx.ps1`](./deploy/start-nginx.ps1)）：

1. 定位 `nginx.exe`（参数 `> NGINX_HOME > PATH > 常见目录 C:\nginx 等`），并校验 `dist\index.html` 存在；
2. 生成 `deploy/nginx.windows.gen.conf`：`events{}` + `http{}` 包裹 [nginx.conf.example](./deploy/nginx.conf.example)，并**把文档中的 Linux 路径 `root  /opt/mes/frontend/dist;` 自动替换为本机 `dist` 实际路径**（正斜杠），同时 `include` nginx 自带的 `conf/mime.types`；
3. 执行 `nginx -p <nginx目录> -t -c <生成配置>` 做**真实语法校验**（失败即中止）；
4. nginx 未运行则启动、已在运行则 `-s reload`（不会重复占用端口）。

> 脚本与生成的 `nginx.windows.gen.conf` 内容均为 ASCII 注释，避免 Windows 控制台编码问题；生成物**不应提交到版本库**（可随手删除，重新运行脚本会再生成）。
> 端口冲突提示：默认 `listen 80`，若 80 被占用（常见于已装 IIS），请先编辑 `deploy/nginx.conf.example` 的 `listen 80;`（如改 `8080`）再运行脚本。

**手工方式启动/重载**（在 nginx 安装目录）：

```cmd
nginx -t             :: 检查配置（需先把 server 片段并入 conf\nginx.conf 的 http{} 内）
start nginx          :: 启动
nginx -s reload      :: 重载
nginx -s stop        :: 停止
```

> Windows 下 Nginx 作为前台服务不方便自启，可用 `winsw` / 任务计划程序注册为服务。

### 7.3 方式三：临时验证（不上正式服务器）

```bash
# ① Vite 自带预览服务器：验证产物能否正常打开
npm run preview
#    默认 http://localhost:4173
#    ⚠️ preview 只提供静态文件，没有 /api 代理：
#       - 若 VITE_API_BASE_URL=/api（默认），页面能打开但接口会 404
#       - 临时联调可改 .env.production 为后端绝对地址后重新 build：
#           VITE_API_BASE_URL=http://127.0.0.1:3000/api
#           npm run build && npm run preview
#         （此时属于跨域，需后端允许该来源）

# ② 或用任意静态服务器托管 dist（示例：Node 官方 http-server / Python）
npx http-server dist -p 8080          # 需 npm 联网拉取
python -m http.server 8080 -d dist    # Python 3 环境
#    ⚠️ 这类简易服务器不带 history fallback，刷新子路由会 404，仅适合快速看首页。
```

**结论**：临时验证只用于「确认打包产物本身可用」。要完整验证业务（登录、导出等），请用 §7.1 的 Nginx 方案。

### 7.4 本次交付已完成的部署语义验证（等价验证，供参考）

交付机（Windows 开发机）**未安装 nginx**，无法直接执行 nginx 端到端；为覆盖「最容易配错的两点」，用 Node 原生 `http` 模块按 nginx 示例配置的**语义**做了一次自包含验证（临时静态服务端口 8099，未占用运行中的后端 3000 与前端 5173，验证后即关闭）：

| 验证项 | 方法（等价 nginx 配置） | 结果 |
|--------|------------------------|------|
| 首页可访问 | `GET /` | ✅ 200 + 返回 `index.html`（含 `#root`） |
| **刷新子路由不 404** | `GET /equipment/list`、`/equipment/maintenance`、`/reports/oee`、`/material/inventory-warning`、`/personnel/work-hours`（等价 `try_files $uri $uri/ /index.html`） | ✅ 全部 200 返回 `index.html` |
| 真实静态资源命中 | `GET /assets/index-<hash>.js` | ✅ 200，259458 字节（未被 fallback 顶替） |
| 深层不存在路径 | `GET /a/b/c/does-not-exist` | ✅ 200 回退 `index.html`（由前端路由兜底跳转 `/dashboard`） |
| **/api 前缀保留反代** | `GET /api/health` → 转发 `http://127.0.0.1:3000/api/health`（等价 `proxy_pass http://127.0.0.1:3000;`） | ✅ 200，`code=200, message="服务运行正常"`（后端真实响应） |
| 反向对照 | 直连后端 `GET /health`（去掉 `/api`） | ✅ 404 —— 证明 `proxy_pass` **必须保留 `/api` 前缀**（末尾加 `/` 会全站 404） |

> 说明：该验证复现的是**配置语义**（回退规则 + 前缀保留），`nginx -t` 的真实语法校验仍需在安装 nginx 的服务器上执行（见 §7.1「配置校验」）。

---

## 8. 部署后验证清单

按顺序逐项验证（每项都对应上文某个配置点）：

| # | 验证项 | 操作 | 期望结果 | 失败时排查 |
|---|--------|------|----------|------------|
| 1 | 首页可打开 | 浏览器访问 `http://<host>/` | 自动跳转到 `/login`（登录页渲染正常，样式完整） | 白屏 → 看控制台 chunk 加载失败/资源 404，检查 `base` 与 `dist` 路径（§9） |
| 2 | **刷新子路由不 404** | 登录后进入任一子页面（如 `/equipment/list`），按 **F5** | 页面正常刷新，不出现 Nginx/IIS 404 | history fallback 未配置（§7.1 ①） |
| 3 | 静态资源缓存策略生效 | F12 → Network 看 `assets/*.js` 与 `index.html` 响应头 | `assets/*` 带 `Cache-Control: max-age=31536000, immutable`；`index.html` 为 `no-cache`/`no-store` | 缓存段未生效（§7.1 ②③） |
| 4 | 登录能拿到 token | 用有效账号登录 | 请求 `POST /api/auth/login` 返回 200；浏览器 localStorage 出现 `mes_token`、`mes_refresh_token`、`mes_user`、`mes_permissions`、`mes-auth-store` | 接口 502/404 → 代理配置或后端未启动（§9） |
| 5 | 鉴权头正常 | 登录后任意列表接口的 Request Headers | 带 `Authorization: Bearer <token>` | 未登录/清过缓存需重新登录 |
| 6 | **P1 四个页面正常** | 依次打开：设备维保 `/equipment/maintenance`、故障维修 `/equipment/breakdown`、库存预警 `/material/inventory-warning`、质量追溯 `/quality/traceability` | 页面渲染正常、列表有数据或空态提示、无报错 | 403 → 当前账号无对应权限；接口 404 → 代理路径被剥前缀（§9） |
| 7 | 导出功能可下载 xlsx | 报表中心 → 生产报表/OEE → 「导出 Excel」 | 浏览器直接下载 `.xlsx`，用 Excel/WPS 能打开且中文不乱码 | 下载到 JSON 文本 → `responseType: 'blob'` 拦截失效；403 → 无 `:export` 权限 |
| 8 | 图表渲染 | 打开看板 `/dashboard`、报表 `/reports/oee` | ECharts 图形正常显示 | `charts` chunk 加载失败（静态资源 404） |
| 9 | 权限菜单正确 | 用不同角色账号登录 | 侧边菜单只显示该角色有权限的项（前端菜单按权限过滤，后端接口二次校验） | — |
| 10 | 刷新后保持登录 | 登录后 F5 | 仍为登录态（Zustand persist + token 有效期内） | 清空了 localStorage 或 token 过期（会自动跳登录页） |
| 11 | 切页滚动行为 | 在侧边菜单滚动到靠下位置（如「系统设置」），再点击其他菜单项 | 左侧菜单**位置保持不动**、右侧内容区**回到顶部**，且整页不出现滚动条 | 样式未生效 → 确认 `src/styles/global.css` 的「布局滚动模型」段存在且未被覆盖（§2） |

---

## 9. 常见问题排查

| 现象 | 根因 | 解决 |
|------|------|------|
| **刷新子路由 404**（`/equipment/list` 直接访问报 Nginx 404） | 未配置 SPA history fallback | Nginx 加 `try_files $uri $uri/ /index.html;`；IIS 配 URL Rewrite 回退规则（§7.1 ①、§7.2） |
| **接口 404（路径带 /api 但后端收不到）** | `proxy_pass` 末尾多写了 `/`，把 `/api` 前缀剥掉了 | 改为 `proxy_pass http://127.0.0.1:3000;`（**末尾无斜杠、无路径**）；后端所有路由都挂在 `/api` 下 |
| **接口 502 / 连不上** | 后端未启动或端口不符 | `curl http://127.0.0.1:3000/api/health` 确认；核对后端实际端口与 `proxy_pass` / `vite.config.ts` 的 3000 是否一致 |
| **跨域错误（CORS）** | 前端 `VITE_API_BASE_URL` 写了后端绝对地址，绕过了同源代理 | 改为 `/api` 并用 Nginx 反代（§5.2 方案①），改完**重新 build** |
| **改了环境变量不生效** | Vite 在**构建期**注入变量；只改了文件没重新打包 | `npm ci && npm run build` 重新打包并重新上传 `dist/` |
| **打包后资源 404 / 白屏** | ① 部署在子路径但 `base` 仍是默认 `/`；② 只上传了 index.html 没上传 assets；③ 服务器 MIME 类型缺失（`application/javascript`） | ① 加 `base: '/子路径/'` 并重新构建；② 完整上传 `dist/` 目录；③ 补 Nginx `include mime.types;`（IIS 补 MIME 映射） |
| **白屏（无 404）** | 浏览器控制台报 chunk 加载失败 / JS 语法错误 | F12 Console + Network 定位；确认浏览器版本 ≥ Chrome 87；确认 `index.html` 与 `assets/` 来自同一次构建（混用新旧产物会因哈希不匹配而失败） |
| **一直是旧版本页面** | `index.html` 被缓存 | 配置 `index.html` 不缓存（`deploy/nginx.conf.example` ②已含）；CDN/代理层也要放行 |
| **刷新后又被踢回登录页** | token 过期或刷新失败（`POST /api/auth/refresh` 未通） | 确认 `/api/auth/refresh` 也能正常反代（同属 `/api/`）；检查后端 JWT 配置 |
| **导出下载到的是 JSON 文本** | 响应拦截器把二进制当 JSON 解析（`responseType: 'blob'` 未生效） | 确认 `src/api/request.ts` 的 blob 短路逻辑存在（本工程已实现），且代理未改写 `Content-Type` |
| **favicon 404（`/vite.svg`）** | 工程没有 `public/` 目录，但 `index.html` 引用了 `/vite.svg` | 属已知无害项：仅控制台一条 404，不影响功能。如需消除，新建 `frontend/public/vite.svg` 后重新 build |
| **Nginx 报 `unknown directive "gzip_static"`** | Nginx 未编译 `ngx_http_gzip_static_module` | 删除 `gzip_static on;` 一行（仅少一层预压缩优化，`gzip on` 仍生效） |
| **Windows 上 `nginx -t` 路径报错** | 使用了反斜杠或路径含空格未加引号 | 路径统一用正斜杠（`D:/mes/frontend/dist`） |
| **接口偶发 429（限流）** | 反代未透传真实客户端 IP，所有请求被后端识别为同一 IP | 确保 `proxy_set_header X-Real-IP / X-Forwarded-For` 已配置（示例已含） |

---

## 10. 与后端的接口约定摘要

前端所有请求经 `src/api/request.ts` 统一处理，与后端的约定如下（部署排查时的判断依据）：

| 项 | 约定 |
|----|------|
| **基础地址** | `baseURL = import.meta.env.VITE_API_BASE_URL \|\| '/api'`；所有接口路径以 `/api` 开头 |
| **统一响应体** | `{ code: number, data: T \| null, message: string, errors?: [{ field, message }] }`；业务成功为 `code = 200`（创建为 201） |
| **业务错误** | HTTP 200 但 `code ≠ 200/201` 视为业务失败，前端弹出 `message` 并 reject |
| **鉴权** | 请求头 `Authorization: Bearer <token>`；token 存于 localStorage 的 `mes_token` |
| **Token 刷新** | 任意接口返回 **401** 时，前端自动 `POST /api/auth/refresh`（body 含 `refreshToken`）取新 token，并**重放**期间排队的请求；刷新失败则清空本地认证信息并跳 `/login` |
| **导出接口** | 报表导出返回**二进制流**（`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`），不套 `{code,data,message}`；前端以 `responseType: 'blob'` 请求并由 `src/utils/download.ts` 触发下载。**错误时（400/403）响应体也是 blob，前端会读回文本还原 JSON 取 message** |
| **GET 空参数** | 前端发送前会剔除 `undefined / null / ''` 的参数（保留 `0`、`false`），避免后端 Zod 校验报 400 |
| **超时** | 30s（axios `timeout: 30000`，导出等长耗时接口在后端侧限制数据量） |
| **状态码语义** | 400 参数错误 / 401 未认证 / 403 无权限 / 404 不存在 / 409 业务冲突 / 500 服务器错误 |
| **权限码（易错）** | 按钮/菜单的权限判断码必须与后端 `backend/prisma/seed.js` 的 `permission.code` **逐字一致**（**区分单复数与用词**，如 `material:items:create`、`material:inventory:transact`）。拼写不一致时 `hasPermission()` 恒为 `false`，表现为**按钮永久置灰且点击无反应**，且不会报错，极难察觉 |

**后端就绪自检**：

```bash
curl http://127.0.0.1:3000/api/health
```

---

## 11. 自动化测试

前端使用 **Vitest + Testing Library + jsdom**，测试文件与源码**同目录**（`*.test.ts` / `*.test.tsx`）。

| 命令 | 说明 |
|------|------|
| `npm test` | 单次运行全部测试 |
| `npm run test:watch` | 监听模式（开发时使用） |
| `npm run test:coverage` | 生成覆盖率报告（`coverage/`） |

**当前覆盖范围**：

| 测试文件 | 锁定的能力 |
|----------|-----------|
| `src/utils/format.test.ts` | 日期 / 数字 / 百分比格式化、空值统一兜底、未知状态不崩栈 |
| `src/utils/constants.test.ts` | 工单与排程**状态机自洽性**（流转目标合法、终态不可再流转）、枚举映射完整性 |
| `src/utils/download.test.ts` | `Content-Disposition` 中文与编码文件名解析、兜底命名、非文件流响应的可读报错 |
| `src/stores/authStore.test.ts` | 登录态写入 / 清理与 `localStorage` 的对称性、权限判定、部分更新不串字段 |
| `src/components/common/WarningTag.test.tsx` | 组件渲染与预警文案口径（Testing Library 链路示例） |

**约定与注意**：

- 测试文件**不进生产构建**：`vitest.config.ts` 通过 `include` 匹配，`vite build` 只打包被引用的模块；
- `npm run build` 中的 `tsc -b` 会**对测试文件做类型检查**，测试代码类型错误会直接导致构建失败；
- 组件测试若需 `window.matchMedia` 等浏览器 API，在 `src/test/setup.ts` 中补齐；
- 前后端完整测试说明见仓库根目录 [`../TESTING.md`](../TESTING.md)。

---

## 附：部署速查（TL;DR）

```bash
# === 构建机 ===
cd mes-workshop-system/frontend
npm ci
npm run build                     # 产物在 dist/

# === 部署机（Linux 示例）===
# 1. 上传 dist
rsync -avz --delete dist/ user@server:/opt/mes/frontend/dist/
# 2. 配置 Nginx（root 指向 dist；try_files 回退；/api 反代 127.0.0.1:3000）
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/mes-frontend.conf
sudo nginx -t && sudo nginx -s reload
# 3. 验证
curl -I http://server/                    # 200
curl http://server/api/health             # {"code":200,...}
# 浏览器：登录 → 进子页面按 F5（不 404）→ 打开 P1 四页面 → 导出 xlsx
```

三个最容易踩的坑，再强调一次：

1. **`proxy_pass http://127.0.0.1:3000;` 末尾不要加 `/`**（加了会剥掉 `/api` 前缀，全站接口 404）。
2. **必须有 history fallback**（`try_files $uri $uri/ /index.html`），否则子路由刷新 404。
3. **改了任何 `VITE_*` 变量都要重新 `npm run build`**（构建期注入）。
