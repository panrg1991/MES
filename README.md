# MES 车间制造执行系统

> 面向离散制造车间的制造执行系统（MES），覆盖生产工单、设备维护、质量检验、物料库存、排班考勤、人员资质、产品追溯与统计报表全流程。
>
> 本仓库为**前后端完全分离的双代码库**结构：`backend/` 与 `frontend/` 各自独立安装、独立构建、独立部署。

---

## 一、技术栈总览

| 层 | 技术选型 |
|----|----------|
| 前端 | React 18 + TypeScript 5 + Vite 5 + Ant Design 5 + React Router 6 + Zustand + TanStack Query + Axios + ECharts |
| 后端 | Node.js 18+ + Express 4 + Prisma 5 + Zod 校验 + JWT 认证 |
| 数据库 | **SQLite 3（默认）** / **MySQL 8.0+ / MariaDB 10.3+**，由 `DB_TYPE` 运行时动态切换 |
| 部署 | 前端静态资源（Nginx / IIS）；后端 PM2 / NSSM / Docker |

---

## 二、目录结构

```
managementsystem/
├── backend/                      # 后端代码库（独立可部署）
│   ├── src/                      # 源码：config / middleware / routes / controllers / services / validators / utils
│   ├── prisma/                   # schema.prisma（唯一真源）+ 派生 schema + generated/（按库类型生成）
│   ├── scripts/                  # db-setup.js（数据库一键配置）/ backup-db.js（备份）
│   ├── deploy/                   # Dockerfile / docker-compose.yml
│   ├── docs/DATABASE.md          # ★ 数据库配置说明书
│   ├── ecosystem.config.js       # PM2 配置
│   ├── .env.example              # 环境变量模板
│   └── README.md                 # ★ 后端部署与操作说明
│
├── frontend/                     # 前端代码库（独立可部署）
│   ├── src/                      # 源码：api / pages / components / router / store / layouts / types
│   ├── deploy/                   # Nginx / IIS 配置示例与一键启动脚本
│   ├── .env.example              # 环境变量模板（VITE_API_BASE_URL）
│   └── README.md                 # ★ 前端部署与操作说明
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

### 3.1 启动后端

```bash
cd backend
npm install

# 环境变量（默认 SQLite，开箱即用）
copy .env.example .env          # Linux/Mac: cp .env.example .env

# 生成 Prisma Client + 建表 + 写入种子数据
npm run db:setup:sqlite

# 启动（默认 http://127.0.0.1:3000）
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
cd backend && npm test            # 112 个用例：单元 + 集成（使用独立 SQLite 测试库）
cd frontend && npm test           # 52 个用例：单元 + 组件
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
DB_USER=mes_user
DB_PASSWORD=your_password
DB_NAME=mes_workshop
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
| 后端 | Jest + Supertest | 112 | `cd backend && npm test` |
| 前端 | Vitest + Testing Library | 52 | `cd frontend && npm test` |

覆盖重点（摘要）：

| 端 | 覆盖内容 |
|----|----------|
| 后端 | 数据库动态配置解析（`DB_TYPE` 推断 / MySQL 连接串拼装 / 密码特殊字符编码）、JWT 双 Token 与密钥隔离、查询参数空值兼容、登录鉴权与 RBAC、27 张表与种子数据完整性、双 Client 预生成 |
| 前端 | 格式化函数空值兜底、工单与排程状态机自洽性、导出文件名解析与异常处理、认证 store 与 `localStorage` 的对称性、组件渲染 |

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
| 数据库 | SQLite（零安装）或 MySQL 8.0+ / MariaDB 10.3+（需 utf8mb4） |
| 静态服务器 | Nginx 1.18+ 或 IIS（前端） |
| 进程守护 | PM2 或 NSSM（后端，可选） |
