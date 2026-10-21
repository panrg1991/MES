# MES 车间制造执行系统

> 面向离散制造车间的制造执行系统（MES），覆盖生产工单、设备维护、质量检验、物料库存、排班考勤、人员资质、产品追溯与统计报表全流程。
>
> 本仓库为**前后端完全分离的双代码库**结构：`backend/` 与 `frontend/` 各自独立安装、独立构建、独立部署。

---

## 一、技术栈总览

| 层 | 技术选型 |
|----|----------|
| 前端 | React 18 + TypeScript 5 + Vite 5 + Ant Design 5 + React Router 6 + Zustand + TanStack Query + Axios + ECharts |
| 后端（双实现，可切换） | **A. Node.js 18+ + Express 4 + Prisma 5 + Zod + JWT**（默认，功能基准）<br>**B. PHP 7.2+ 原生实现**（PDO + JWT + XlsxWriter），接口路径、权限码、响应结构与 A 完全一致 |
| 数据库 | **SQLite 3（默认）** / **MySQL 8.0+ / MariaDB 10.3+**，由 `DB_TYPE` 运行时动态切换；两套后端共用同一个库 |
| 部署 | 前端静态资源（Nginx / IIS）；后端 Node（PM2 / NSSM / Docker）或 PHP（Apache / Nginx + PHP-FPM / 内置服务器） |

---

## 二、目录结构

```
managementsystem/
├── backend/                      # 后端代码库（独立可部署、独立运行）
│   ├── src/                      # 源码：config / middleware / routes / controllers / services / validators / utils
│   │   └── config/env.js         # 环境变量解析：HOST / PORT / CORS_ORIGIN / TRUST_PROXY / DB_TYPE
│   ├── prisma/                   # schema.prisma（唯一真源）+ 派生 schema + generated/（按库类型生成）
│   ├── scripts/                  # db-setup.js（数据库一键配置）/ backup-db.js（备份）
│   ├── deploy/                   # Dockerfile / docker-compose.yml / start-backend.bat（Windows 生产启动）
│   ├── docs/DATABASE.md          # ★ 数据库配置说明书
│   ├── ecosystem.config.js       # PM2 配置
│   ├── .env.example              # 环境变量模板
│   └── README.md                 # ★ 后端部署与操作说明
│
├── frontend/                     # 前端代码库（独立可部署、纯静态）
│   ├── src/                      # 源码：api / pages / components / router / stores / layouts / config
│   │   └── config/runtime.ts     # 运行时配置解析（config.js > 构建期 VITE_* > 默认值）
│   ├── public/config.js          # ★ 运行时配置：部署后改后端地址/子路径，免重新构建
│   ├── public/favicon.svg        # 站点图标
│   ├── deploy/                   # Nginx / IIS 配置示例与一键启动脚本
│   ├── .env.example              # 环境变量模板（VITE_API_BASE_URL / VITE_BASE_PATH）
│   └── README.md                 # ★ 前端部署与操作说明
│
├── php-backend/                  # PHP 后端（与 Node 后端二选一部署，接口完全兼容）
│   ├── public/index.php          # 入口 + 路由表 + 全局限流
│   ├── src/                      # Config / Db / Jwt / Auth / Router / Xlsx / Controllers
│   ├── .env.example              # 配置模板（缺省自动复用 backend/.env）
│   └── start.bat                 # Windows 一键启动（默认 :8080）
│
├── start-all.bat                 # Windows 一键启动前后端（开发 / 单机演示）
├── switch-backend.bat            # 双后端切换：修改前端 runtime config（node | php）
├── switch-backend.ps1            # 切换脚本主体（支持自定义 PHP 地址）
│
├── database/                     # 数据库脚本（MySQL 建库 + 校验）
│   ├── mes-mysql-init.sql        # MySQL 一键建库：27 张表 DDL + 种子数据
│   └── verify-mysql-init.js      # 建库结果校验脚本
│
├── DEPLOYMENT.md                 # ★ 整体部署总纲（前后端协同、Nginx、备份、故障排查）
└── README.md                     # 本文件
```

---

## 三、快速开始

> **Windows 一键启动（开发/单机演示）**：双击根目录 `start-all.bat`，脚本会检查依赖并分别打开
> 「后端 :3000」「前端 :5173」两个窗口。首次运行前仍需执行一次 `cd backend && npm run db:setup:sqlite` 初始化数据库。

### 3.1 启动后端

```bash
cd backend
npm install

# 环境变量（默认 SQLite，开箱即用）
copy .env.example .env          # Linux/Mac: cp .env.example .env

# 生成 Prisma Client + 建表 + 写入种子数据
npm run db:setup:sqlite

# 启动（默认监听 0.0.0.0:3000，同网段其他电脑可通过 http://<本机IP>:3000 访问）
npm run dev
```

验证：

```bash
curl http://127.0.0.1:3000/api/health
```

默认账号：`admin / admin123`（详见 `backend/prisma/seed.js`）。

### 3.2 启动前端

```bash
cd frontend
npm install
copy .env.example .env          # Linux/Mac: cp .env.example .env
npm run dev                     # 默认 http://localhost:5173
```

前端 Vite 已配置 `/api` 代理到 `http://127.0.0.1:3000`，本地开发无需额外配置跨域。

### 3.3 运行测试（可选）

前后端各自独立，均无需外部服务即可跑通：

```bash
cd backend && npm test            # 156 个用例：单元 + 集成（含并发/幂等/越权/错误映射回归）
cd frontend && npm test           # 77 个用例：单元 + 组件（含路由守卫与运行时配置）
```

> 后端测试库为 `backend/prisma/test.db`，每次运行前重建，**不会影响开发库 `dev.db` 或生产库**。
> 详细说明见 **[TESTING.md](TESTING.md)**。

---

## 四、数据库动态配置（核心特性）

系统支持 **SQLite** 与 **MySQL** 两种数据库，**切换只需修改 `.env` 的 `DB_TYPE` 并重启服务**，业务代码零改动。

### 4.1 原理

Prisma 的 `datasource.provider` 只能是编译期字面量，无法用环境变量在运行时切换。
因此本项目为每种数据库**预生成独立的 Prisma Client**，运行时按配置动态加载：

```
prisma/schema.prisma（唯一真源，27 张表）
        │  scripts/db-setup.js 派生
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      │
schema.sqlite.prisma    schema.mysql.prisma           │
        ▼ generate             ▼ generate             │
prisma/generated/sqlite/  prisma/generated/mysql/     │
        └──────────┬───────────┘                      │
                   │ src/config/database.js           │
                   │ 按 DB_TYPE 动态 require ──────────┘
                   ▼
           业务层（services）零改动
```

### 4.2 常用命令（在 `backend/` 目录执行）

| 命令 | 作用 |
|------|------|
| `npm run db:status` | 查看当前库类型、连接串与各 Client 生成状态 |
| `npm run db:setup:all` | 一次生成两种 Client（推荐，便于随时切换） |
| `npm run db:setup:sqlite` | SQLite 全流程：生成 Client + 建表 + 种子数据 |
| `npm run db:setup:mysql` | MySQL 全流程：生成 Client + 建表 + 种子数据 |
| `npm run db:push` | 仅把表结构推送到当前库 |
| `npm run db:seed` | 仅写入种子数据（幂等） |
| `npm run db:backup` | 备份当前数据库 |

### 4.3 配置示例

```ini
# ---- SQLite（默认）----
DB_TYPE=sqlite
DB_PATH=./dev.db

# ---- MySQL ----
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=mes_app            # 运行账号，仅 SELECT/INSERT/UPDATE/DELETE
DB_PASSWORD=your_password
DB_NAME=mes_workshop
# 账号分层：建表/迁移用 mes_migrate 或 root，见 database/mes-mysql-grants.sql
```

完整说明（含 MySQL 建库两条路径、迁移策略、备份恢复、FAQ）见
**[backend/docs/DATABASE.md](backend/docs/DATABASE.md)**。

---

## 五、部署文档索引

| 文档 | 面向 | 内容 |
|------|------|------|
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | 运维 / 项目负责人 | 整体部署总纲：架构图、端口约定、环境清单、前后端协同、Nginx 反代、备份与回滚、故障排查 |
| **[backend/README.md](backend/README.md)** | 后端部署人员 | 环境要求、目录职责、快速开始、环境变量清单、PM2 / NSSM / Docker、日志与健康检查、常见问题 |
| **[backend/docs/DATABASE.md](backend/docs/DATABASE.md)** | 后端部署 / DBA | SQLite 与 MySQL 动态配置原理、配置项、一键初始化、互切验证、迁移策略、备份恢复、FAQ |
| **[frontend/README.md](frontend/README.md)** | 前端部署人员 | 技术栈、命令速查、本地开发、环境变量、生产打包、Nginx / IIS 部署、验证清单、排错 |
| **[TESTING.md](TESTING.md)** | 开发 / 测试 | 前后端测试体系、运行方式、覆盖重点、测试库隔离机制、CI 流水线、编写约定 |

### 5.1 前后端独立部署的三种拓扑

| 拓扑 | 前端 | 后端 | 关键配置 |
|------|------|------|----------|
| **A. 同机同源（推荐）** | Nginx 托管 `dist` 并反代 `/api` | `127.0.0.1:3000` | 前端 `API_BASE_URL=/api`；后端 `CORS_ORIGIN=http://<前端地址>` |
| **B. 前后端分机** | 任意静态服务器 / Nginx | 独立服务器 `:3000` | 部署后改 `dist/config.js` 的 `API_BASE_URL=http://<后端IP>:3000/api`；后端 `HOST=0.0.0.0`、`CORS_ORIGIN=http://<前端地址>` |
| **C. 子路径部署** | `http://host/mes/` | 同 A | 构建时 `VITE_BASE_PATH=/mes/`；部署后 `config.js` 的 `BASE_PATH=/mes/`、`API_BASE_URL=/mes/api` |

前后端**没有构建期耦合**：后端不托管前端文件，前端产物为纯静态文件，两者可分别升级、分别重启、分别部署到不同机器。

### 5.2 前端运行时配置（换后端地址不必重新构建）

前端产物中的 `dist/config.js` 会原样保留，部署后在服务器上直接编辑即可：

```js
window.__MES_CONFIG__ = {
  API_BASE_URL: 'http://192.168.1.100:3000/api', // 留空 = 同源 /api
  APP_TITLE: '',                                 // 留空 = 默认标题
  BASE_PATH: '',                                 // 子目录部署填 '/mes/'
};
```

优先级：`config.js` > 构建期 `VITE_*` > 内置默认值。改完刷新页面（Ctrl+F5）生效，
现场排障时可在右上角用户菜单 →「系统信息」中直接确认当前 API 地址与后端/数据库连通状态。

### 5.3 双后端部署与切换（Node.js / PHP）

项目提供两套**接口契约完全一致**的后端，可任选其一部署；两套代码互不依赖，均保持可运行：

| 项 | Node 后端（`backend/`） | PHP 后端（`php-backend/`） |
|----|------------------------|---------------------------|
| 默认端口 | `3000` | `8080` |
| 运行时 | Node.js 18+ | PHP 7.2+（推荐 7.4/8.x） |
| 数据访问 | Prisma 5（SQLite / MySQL） | PDO（MySQL；SQLite 需 `pdo_sqlite`） |
| 接口前缀 | `/api` | `/api`（路径、方法、参数、权限码一致） |
| 认证 | JWT HS256 + RBAC + 登录锁定 | 同左（共用 `JWT_SECRET`，令牌互通） |
| Excel 导出 | ExcelJS | 内置轻量 XLSX 生成器（依赖 `zip` 扩展） |
| 数据库结构 | 负责建表 / 迁移 / 种子 | **只读写、不建表**；沿用 Node 初始化的同一个库 |

**关键约束（保证可切换）**：

1. 两套后端必须连接**同一个数据库**（SQLite 同一 `.db` 文件，或 MySQL 同一库）；
2. 两套后端必须使用**同一组** `JWT_SECRET` / `JWT_REFRESH_SECRET`，否则切换后需重新登录；
3. 表结构与种子数据由 Node 侧 `npm run db:setup:*` 维护，PHP 侧不执行 DDL；
4. PHP 侧登录锁定 / 限流为**单机文件存储**（`php-backend/runtime/state.json`），多实例部署请改为 Redis 等集中存储。

**启动 PHP 后端**：

```bash
cd php-backend
# 可选：独立配置（不建 .env 时自动复用 backend/.env）
copy .env.example .env

# 方式一：Windows 一键启动
start.bat

# 方式二：PHP 内置服务器
php -S 0.0.0.0:8080 -t public public/index.php

# SQLite 且 php.ini 未启用 pdo_sqlite 时，可临时加载扩展
php -d extension=pdo_sqlite -S 0.0.0.0:8080 -t public public/index.php
```

启动后访问 `http://<IP>:8080/api/health`，应返回 `status: ok` 且 `service.node` 为 `PHP x.y.z`。

**前端切换（无需重新构建）**：

```bat
:: 切到 PHP 后端（默认 http://127.0.0.1:8080/api）
switch-backend.bat php

:: 切到 Node 后端（同源 /api）
switch-backend.bat node

:: 指定 PHP 所在服务器与端口
switch-backend.bat php http://192.168.1.100:8080/api
```

脚本会改写 `frontend/public/config.js` 与 `frontend/dist/config.js` 中的 `API_BASE_URL`；
也可手工编辑部署目录下的 `config.js`，改完 `Ctrl+F5` 刷新即可。切换前后端**不影响已有数据**，
两套后端签发的 Token 也可互相识别。

---

## 六、主要功能模块

| 模块 | 说明 |
|------|------|
| 系统管理 | 用户、角色、权限（RBAC，109 条权限 / 3 个内置角色） |
| 生产管理 | 生产工单、派工、报工、进度跟踪 |
| 设备管理 | 设备台账、点检、保养计划 |
| 设备维护 | 维修工单、故障处理流程 |
| 设备故障 | 故障上报、原因分类、停机统计 |
| 质量管理 | 检验单、检验项、不良品处理 |
| 物料管理 | 物料台账、出入库、库存预警 |
| 排班管理 | 班组、班次、排班计划 |
| 人员管理 | 员工档案、资质证书、有效期预警 |
| 产品追溯 | 按批次 / 工单追溯生产全过程 |
| 统计报表 | 产量、稼动率、质量合格率、停机分析 |
| 数据看板 | 车间实时概览（ECharts 可视化） |

---

## 七、测试与持续集成

两端各自拥有独立的测试体系，无需外部服务即可跑通；后端使用**独立 SQLite 测试库**，
运行测试不会影响开发库 `dev.db` 与生产库。

| 端 | 框架 | 用例数 | 命令 |
|----|------|--------|------|
| 后端 | Jest + Supertest | 156 | `cd backend && npm test` |
| 前端 | Vitest + Testing Library | 77 | `cd frontend && npm test` |

覆盖率门禁：`npm run test:coverage`（两端均配置了阈值，低于阈值即失败）。

覆盖重点（摘要）：

| 端 | 覆盖内容 |
|----|----------|
| 后端 | 数据库动态配置解析（`DB_TYPE` 推断 / MySQL 连接串拼装 / 密码特殊字符编码）、JWT 双 Token 与密钥隔离、查询参数空值兼容、登录鉴权与 RBAC、27 张表与种子数据完整性、双 Client 预生成；**报工超量/幂等/并发、库存并发扣减、状态机并发流转、管理员保护、登录锁定、Prisma 错误映射、日志脱敏、互斥器串行性** |
| 前端 | 格式化函数空值兜底、工单与排程状态机自洽性、导出文件名解析与异常处理、认证 store 与 `localStorage` 的对称性、运行时配置解析、**路由级权限守卫（403/登录跳转）**、组件渲染 |

CI 由 `.github/workflows/ci.yml` 驱动，**两个 Job 并行执行**：

| Job | 步骤 |
|-----|------|
| 后端 | `npm ci` → `db:setup:all`（生成两套 Client）→ `lint` → `test` |
| 前端 | `npm ci` → `lint` → `build`（含 `tsc` 类型检查）→ `test` |

> 触发条件：推送到 `main` / `master` / `develop`、所有 Pull Request，以及手工触发。

完整的测试说明、测试库隔离机制与编写约定见 **[TESTING.md](TESTING.md)**。

---

## 八、环境要求速查

| 项 | 要求 |
|----|------|
| Node.js | ≥ 18.0（后端推荐 22 LTS；前端 ≥ 18.18，推荐 20 LTS） |
| npm | ≥ 9 |
| PHP（可选后端） | ≥ 7.2（推荐 7.4 / 8.x），扩展：`pdo_mysql`（MySQL）、`pdo_sqlite`（SQLite）、`zip`（Excel 导出）、`mbstring` |
| 数据库 | SQLite（零安装）或 MySQL 8.0+ / MariaDB 10.3+（需 utf8mb4） |
| 静态服务器 | Nginx 1.18+ 或 IIS（前端） |
| 进程守护 | PM2 / NSSM（Node）或 Apache / Nginx + PHP-FPM（PHP），可选 |
