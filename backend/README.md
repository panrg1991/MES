# MES 车间制造执行系统 · 后端服务部署说明书

> 本文档是 **backend 服务的权威部署与运维说明**，所有命令均与 `backend/package.json`、`backend/src/`、
> `backend/prisma/` 的实际内容核对过，可直接照做。
>
> 相关文档：
> - 项目总览 → [`../README.md`](../README.md)
> - 测试与持续集成 → [`../TESTING.md`](../TESTING.md)
> - 多数据库切换与迁移/备份的深入说明 → [`docs/DATABASE.md`](docs/DATABASE.md)
> - 前后端整体上线流程 → [`../DEPLOYMENT.md`](../DEPLOYMENT.md)
> - 前端部署说明 → [`../frontend/README.md`](../frontend/README.md)
> - MySQL 建库脚本（27 表 DDL + 中文注释 + 种子数据）→ [`../database/mes-mysql-init.sql`](../database/mes-mysql-init.sql)
> - MySQL 建库脚本静态自检工具 → `../database/verify-mysql-init.js`

---

## 一、技术栈与运行环境

| 项目 | 要求 | 说明 |
|------|------|------|
| Node.js | **>= 18**（实测 v22.22.2） | Prisma 5 / Express 4 要求 |
| npm | >= 9（实测 10.9.7） | 随 Node.js 安装 |
| 操作系统 | Windows Server 2016+ / Windows 10+ / Linux（CentOS 7+、Ubuntu 20.04+） | 迁移文件与脚本跨平台可用 |
| 数据库 | SQLite（默认，零安装）/ MySQL 8.0+ 或 MariaDB 10.3+ | 见「四、数据库配置与切换」，由 `DB_TYPE` 动态切换 |
| 端口 | **3000**（可通过 `PORT` 修改） | 内网部署需放行该端口 |
| 内存 | 建议 >= 512 MB（PM2 配置 `max_memory_restart: 600M`） | 报表导出（ExcelJS 流式）占用较高 |
| 反向代理 | Nginx（推荐）或直接用后端端口 | 见「七、反向代理要点」 |

核心依赖（`package.json`）：`express` 4.18 · `@prisma/client` + `prisma` 5.9 · `jsonwebtoken` 9 ·
`bcryptjs` 2.4 · `zod` 3.22 · `express-rate-limit` 7.1 · `helmet` 7.1 · `cors` 2.8 · `morgan` 1.10 ·
`exceljs` 4.4（报表导出）· `dotenv` 16.4。

开发依赖：`eslint` 8（含 `.eslintrc.json`）· `jest` 29 + `supertest` 7（测试）· `nodemon` 3 · `prisma` 5.9（CLI）。

---

## 二、目录结构（各目录职责）

```
backend/
├── src/
│   ├── app.js                 # Express 应用装配：helmet → cors → rateLimit(/api) → bodyParser → morgan → 路由 → 错误处理
│   ├── server.js              # 启动入口：连库 → 监听端口 → 注册 SIGINT/SIGTERM 优雅关闭（最多等 5s）
│   ├── config/
│   │   ├── env.js             # 环境变量读取与校验（解析 DB_TYPE、拼装连接串；生产加载 .env.production）
│   │   └── database.js        # 数据库动态适配器：按 DB_TYPE 加载 prisma/generated/<类型> 的 Client
│   ├── routes/                # 路由聚合（index.js）+ 15 个模块路由
│   ├── controllers/           # 请求解析 / 响应封装（sendSuccess / sendError），不含业务规则
│   ├── services/              # 业务逻辑层（工单、设备、质量、物料、人员、报表 OEE、导出）
│   ├── validators/            # Zod 校验 Schema（query / params / body）
│   ├── middleware/
│   │   ├── auth.js            # JWT 校验（authMiddleware）+ 权限校验（requirePermission）
│   │   ├── validate.js        # Zod 校验中间件（失败统一返回 400 参数校验失败）
│   │   └── errorHandler.js    # 404 与全局错误处理（含 Prisma 错误码映射）
│   └── utils/                 # response（统一响应）· jwt · excel（ExcelJS 封装）· zod-helpers
├── prisma/
│   ├── schema.prisma          # ★ 唯一真源：27 张表定义（手工维护）
│   ├── schema.sqlite.prisma   # SQLite 派生 schema（脚本生成，勿手工编辑）
│   ├── schema.mysql.prisma    # MySQL 派生 schema（脚本生成，勿手工编辑）
│   ├── generated/             # 按库类型生成的 Prisma Client（gitignore，由 db:setup 重建）
│   ├── migrations/            # **SQLite 方言**迁移历史（2 个）+ migration_lock.toml
│   ├── seed.js                # 种子数据：109 权限 / 3 角色 / 150 角色权限 / 2 用户 / 1 车间 / 5 设备（幂等）
│   └── dev.db                 # 开发用 SQLite 库（.gitignore 已忽略 *.db）
├── scripts/
│   ├── db-setup.js            # ★ 数据库一键配置：同步派生 schema → 生成 Client → 建表 → 种子数据
│   └── backup-db.js           # 按当前库类型自动备份（SQLite 复制文件 / MySQL 生成或执行 mysqldump）
├── tests/                     # Jest 测试（单元不碰库；集成走真实 HTTP 与独立测试库）
│   ├── setup-env.js           # 注入测试环境变量（最先执行，决定走测试库）
│   ├── setup-after-env.js     # 每个测试文件结束释放 Prisma 连接
│   ├── global-setup.js        # 全局准备：生成 Client → 重建 prisma/test.db → 建表 → 种子
│   ├── global-teardown.js     # 全局清理：删除测试库（KEEP_TEST_DB=1 可保留）
│   ├── helpers/api.js         # supertest 实例与登录封装
│   ├── unit/                  # env（数据库配置）· jwt · zod-helpers · response
│   └── integration/           # health · auth · database（表结构 / 种子 / 双 Client）
├── docs/DATABASE.md           # ★ 数据库配置说明书（切换原理 / 建库两条路径 / 备份恢复 / FAQ）
├── deploy/                    # Dockerfile · docker-compose.yml · .dockerignore
├── jest.config.js             # Jest 配置（独立测试库 prisma/test.db、串行执行、覆盖率）
├── .eslintrc.json             # ESLint 配置（含 Jest 测试文件的全局变量环境）
├── ecosystem.config.js        # PM2 进程守护配置（生产推荐）
├── .env                       # 开发环境变量（不入库）
├── .env.production            # 生产环境变量（不入库）
├── .env.example               # 环境变量模板（入库，仅占位值）
└── package.json               # 依赖与脚本
```

> **路由挂载顺序约定（改路由时务必遵守）**：`/api/production/schedules`、`/api/equipment/maintenance`、
> `/api/equipment/breakdowns`、`/api/quality/traceability` 必须先于各自的 P0 模块挂载，
> 否则静态段会被 `/:id` 动态段吞掉（详见 `src/routes/index.js` 头部注释）。

---

## 三、快速开始（开发模式）

```bash
# 1) 安装依赖（首次或依赖变更后）
cd backend
npm install

# 2) 准备环境变量
copy .env.example .env          # Windows；Linux 用 cp .env.example .env

# 3) 生成 Prisma Client（每次改 schema / 切 provider 后都要跑）
npx prisma generate

# 4) 建库并应用迁移（SQLite：生成 prisma/dev.db 与全部 27 张表）
npx prisma migrate deploy

# 5) 写入种子数据（幂等，可重复执行）
npm run db:seed

# 6) 启动（开发模式，热重载）
npm run dev
# 或生产模式启动：npm start
```

启动成功输出：

```
[数据库] Prisma 已连接到数据库: file:./dev.db
========================================
  MES 制造执行系统 API
  环境: development
  端口: 3000
  健康检查: http://localhost:3000/api/health
========================================
```

冒烟验证（3 条命令即可确认服务与鉴权链路正常）：

```bash
# ① 健康检查 → 期望 HTTP 200
curl -s http://127.0.0.1:3000/api/health
# {"code":200,"data":{"status":"ok","timestamp":"...","uptime":8.5},"message":"服务运行正常"}

# ② 登录 → 期望 HTTP 200 并返回 token（admin/admin123 为种子账号，上线后请立即改密）
curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"

# ③ 带 token 拉工单列表（注意：列表端点是 /api/production，不是 /api/production/orders）
curl -s -H "Authorization: Bearer <上一步返回的 token>" \
  "http://127.0.0.1:3000/api/production?page=1&pageSize=5"
```

> 默认账号（`prisma/seed.js` 写入）：`admin / admin123`（系统管理员，109 权限）、
> `operator / operator123`（生产操作员，18 权限）。**投产前必须修改。**

---

## 四、数据库配置与切换（核心章节）

### 4.1 两种数据库对比与选型建议

| 维度 | SQLite（默认） | MySQL 8.0 / MariaDB 10.3+ |
|------|----------------|---------------------------|
| 安装成本 | 零安装（单文件） | 需数据库服务 |
| 并发写 | **单写者**（多进程写会锁库） | 强 |
| 适用场景 | 单车间内网、20 台设备以内、单实例部署 | 多实例 / 并发写 / 企业已有 MySQL 运维体系 |
| 备份方式 | 复制 `.db` 文件 | `mysqldump` |
| 迁移方式 | `prisma migrate dev`（方言为 SQLite） | `prisma db push` |

**结论**：单机内网小规模部署用 SQLite 最省事；一旦出现「多进程/多实例」「并发写压力」「需要独立 DBA 运维」，
换 MySQL（本项目已提供完整建库 SQL，见 4.4）。

> 当前版本仅支持 `sqlite` 与 `mysql`。`DB_TYPE` 传入其他值会回退为 `sqlite`。

### 4.2 切换机制：每种库一份独立 Client，运行时按配置加载

Prisma 的 `datasource.provider` **只能是字面量**，无法写成 `env("DB_TYPE")`。
因此本项目采用「**预生成多份 Client + 运行时动态加载**」的方案：

```
prisma/schema.prisma（唯一真源，27 张表）
        │  scripts/db-setup.js 派生（仅改 provider + output）
        ├──────────────────────────┬──────────────────────────┐
        ▼                          ▼                          │
schema.sqlite.prisma        schema.mysql.prisma               │
        │                          │                          │
        ▼ prisma generate          ▼ prisma generate          │
prisma/generated/sqlite/    prisma/generated/mysql/           │
        └──────────────┬───────────┘                          │
                       │ src/config/database.js               │
                       │ 按 .env 的 DB_TYPE 动态 require ──────┘
                       ▼
              业务层（services）零改动
```

**切换数据库只需两步**：改 `.env` 的 `DB_TYPE` → 重启服务。
（前提是对应 Client 已生成，建议首次用 `npm run db:setup:all` 一次生成两种。）

```bash
# 查看当前配置：库类型 / 解析后的连接串 / 两个 Client 的生成状态
npm run db:status

# 一键初始化（生成 Client + 建表 + 写种子数据）
npm run db:setup:sqlite      # SQLite 全流程
npm run db:setup:mysql       # MySQL 全流程

# 一次生成两种 Client（推荐，便于随时切换）
npm run db:setup:all

# 仅生成 Client / 仅建表 / 仅写种子
npm run db:setup
npm run db:push
npm run db:seed
```

### 4.3 切库的标准流程

**切到 SQLite：**

```bash
# ① .env 设置
DB_TYPE=sqlite
DB_PATH=./dev.db

# ② 建表 + 种子（首次切换时执行；已建过可跳过）
npm run db:setup:sqlite

# ③ 重启并验证
npm start
curl -s http://127.0.0.1:3000/api/health
```

**切到 MySQL：**

```bash
# ① 创建 utf8mb4 空库，或导入建库脚本（二选一，见下文）
# ② .env 设置
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=mes_user
DB_PASSWORD=your_password
DB_NAME=mes_workshop

# ③ 建表 + 种子（若用 init SQL 建库则已含种子数据，只生成 Client 即可）
npm run db:setup:mysql     # 或 npm run db:setup（仅生成 Client）

# ④ 重启并验证
npm start
curl -s http://127.0.0.1:3000/api/health
```

响应中 `data.database.type` 即为当前生效的库类型，`connected` 为 `false` 时返回 503。

> 详细的配置项、MySQL 建库两条路径、备份恢复与迁移策略见
> [`docs/DATABASE.md`](docs/DATABASE.md)。

### 4.4 MySQL 建库的两条路径（**不要混用**）

#### 路径 a：导入手写建库脚本（含种子数据，适合全新环境）

```bash
mysql -h 127.0.0.1 -u root -p < ../database/mes-mysql-init.sql
```

该脚本内容：建库 `mes_workshop` + **27 张表 DDL（表/字段全中文注释、38 条外键、唯一约束与索引齐全）**
+ 种子数据（109 权限、3 角色、150 角色权限、2 用户、1 车间、5 设备）+ 空表说明 + 文末校验 SQL。
已实测：导入 MariaDB 10.3 零报错；16 项校验值与期望全部一致；重复导入幂等无重复。

#### 路径 b：由 Prisma 建表（适合希望由 Prisma 统管表结构的环境）

```bash
# 先建空库
mysql -h 127.0.0.1 -u root -p -e "CREATE DATABASE mes_workshop DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# 再由脚本推送表结构并写入种子（自动注入连接串给 Prisma CLI）
npm run db:setup:mysql
```

实测结果：空库执行后 **27 张表全部创建**；列类型为 Prisma 的 MySQL 规范映射
（`Int→int(11)`、`String→varchar(191)`、`DateTime→datetime(3)`、`Boolean→tinyint(1)`）。

#### ⚠️ 两条路径不要混用（drift 实测）

`database/mes-mysql-init.sql` 对整型列使用 **BIGINT**（比 Prisma 的 `Int→INT` 更宽）。若先用路径 a 建库，
再执行 `prisma db push`，Prisma 会列出大量列类型收窄的改动并**默认拒绝执行**，实测输出（节选）：

```
• You are about to alter the column `id` on the `users` table, which contains 2 non-null values.
  The data in that column will be cast from `BigInt` to `Int`.
• You are about to alter the column `passwordHash` on the `users` table ...
  cast from `VarChar(255)` to `VarChar(191)`.
Error: Use the --accept-data-loss flag to ignore the data loss warnings like prisma db push --accept-data-loss
```

**兼容性结论（已实测）**：BIGINT 列 + Prisma `Int` 字段在运行期**完全兼容**——增删改查、中文文本、
DateTime、DECIMAL、关联与级联删除全部正常，读回的值是 JS `number`。
所以选路径 a 的环境，**只要不再执行 `prisma migrate` / `prisma db push` 就不会有任何问题**。

#### ⚠️ MySQL 下不能用 `prisma migrate deploy`

项目现有 `prisma/migrations` 是 **SQLite 方言**的迁移历史（`migration_lock.toml` 记录 `provider = "sqlite"`）。
在 MySQL provider 下执行迁移命令会直接报错（实测原文）：

```
Error: P3019
The datasource provider `mysql` specified in your schema does not match the one specified in the
migration_lock.toml, `sqlite`. Please remove your current migration directory and start a new
migration history with prisma migrate dev.
```

因此 **MySQL 环境请使用「路径 a」或「路径 b（`db push`）」**；`prisma migrate deploy` 仅用于 SQLite 环境。

### 4.5 切换 provider 后的注意事项

1. **必须生成对应类型的 Client**——运行 `npm run db:setup:<类型>`（或一次 `npm run db:setup:all`），
   否则启动时会提示「尚未生成 xxx 对应的 Prisma Client」；
2. Windows 下若后端服务正在运行，`prisma generate` 可能因引擎 DLL 被占用而报 `EPERM`，
   **先停掉后端服务**再执行（见 10.2 处置）；
3. `DB_TYPE` 与 `DATABASE_URL` 必须匹配：`DATABASE_URL` 类型不一致时会被忽略并按 `DB_TYPE` 重新拼装，
   避免「改了类型却仍连旧库」；
4. 切换完成并验证后，请用 `npm run db:status` 复核，并访问 `/api/health` 确认
   `data.database.type` 与 `connected`，同时确保生产 `.env.production` 同步改好。

---

## 五、生产部署

### 5.1 安装与初始化

```bash
cd backend

# 1) 仅安装生产依赖（prisma CLI 在 devDependencies，装完可用 npx 调用；若报找不到 prisma 则去掉 --omit=dev）
npm ci --omit=dev

# 2) 环境变量
copy .env.example .env.production      # 再编辑：DB_TYPE、DB_* / DB_PATH、JWT 密钥、CORS_ORIGIN
set NODE_ENV=production                # Linux：export NODE_ENV=production

# 3) 生成 Client + 建库 / 升级表结构
#    SQLite：npm run db:setup:sqlite
#    MySQL ：导入 ../database/mes-mysql-init.sql，然后 npm run db:setup
#            或由 Prisma 建表：npm run db:setup:mysql
npm run db:setup:sqlite

# 5) 种子数据（幂等）
npm run db:seed

# 6) 启动
npm start
```

### 5.2 PM2 守护（推荐，配置见 `ecosystem.config.js`）

```bash
npm install -g pm2
pm2 start ecosystem.config.js     # 按配置启动（NODE_ENV=production，日志写入 backend/logs/）
pm2 status
pm2 logs mes-backend
pm2 reload mes-backend            # 零停机重载
pm2 save                          # 保存进程列表
pm2 startup                       # 生成开机自启脚本（按提示执行它输出的那条命令）
```

等价的命令行方式：`pm2 start src/server.js --name mes-backend --env production && pm2 save && pm2 startup`。

> 切换数据库 provider 前请先 `pm2 stop mes-backend`，切换并 `npx prisma generate` 完成后再
> `pm2 start ecosystem.config.js`（避免引擎文件被占用）。

### 5.3 Windows 原生服务（NSSM，可选）

```powershell
# 以管理员身份运行
nssm install MES-Backend "C:\Program Files\nodejs\node.exe" "D:\mes\backend\src\server.js"
nssm set MES-Backend AppDirectory "D:\mes\backend"
nssm set MES-Backend AppEnvironmentExtra NODE_ENV=production
nssm start MES-Backend
```

---

## 六、环境变量清单

来源：`src/config/env.js`（`dotenv` 按 `NODE_ENV` 选择 `.env` 或 `.env.production`）。
**命令行传入的同名变量优先于文件值**（dotenv 不覆盖已存在的环境变量）。

| 变量 | 默认值 | 作用 | 生产是否必须修改 |
|------|--------|------|------------------|
| `PORT` | `3000` | HTTP 监听端口 | 按需（改动后同步 Nginx / 防火墙） |
| `NODE_ENV` | `development` | 决定加载哪个 env 文件；影响 Prisma 日志与 morgan 格式 | **必须**设为 `production`（在启动命令/PM2 里设置，写在 .env 内无效） |
| `DB_TYPE` | `sqlite` | 数据库类型：`sqlite` \| `mysql`，运行时按此加载对应 Client | **必须**明确指定（生产建议 `mysql`） |
| `DB_PATH` | `./dev.db` | SQLite 库文件路径（相对 `prisma/`），`DB_TYPE=sqlite` 时生效 | 生产改为 `./prod.db` 等 |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `127.0.0.1` / `3306` / `root` / 空 / `mes_workshop` | MySQL 连接参数，`DB_TYPE=mysql` 时生效 | **必须**填写真实账号（密码含特殊字符会自动编码） |
| `DATABASE_URL` | 空 | 整串连接串（可选）。**仅当类型与 `DB_TYPE` 一致时生效**，否则以 `DB_TYPE` 为准重新拼装 | 使用分散参数时可留空 |
| `JWT_SECRET` | `default-jwt-secret` | Access Token 签名密钥 | **必须**替换为强随机值 |
| `JWT_EXPIRES_IN` | `2h` | Access Token 有效期 | 建议保持或按安全策略收紧 |
| `JWT_REFRESH_SECRET` | `default-refresh-secret` | Refresh Token 签名密钥 | **必须**替换为强随机值 |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh Token 有效期 | 建议保持 |
| `CORS_ORIGIN` | `http://localhost:5173` | 允许的前端来源；逗号分隔多个；`*` 表示不限制 | **必须**收敛为实际访问地址（不要留 `*`） |
| `BODY_LIMIT` | `10` | 请求体上限（MB） | 按需 |

生成强随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 七、反向代理要点

Nginx 只需把 `/api` 转发到本服务，前端静态资源由 Nginx 直接托管（完整示例见
[`../DEPLOYMENT.md`](../DEPLOYMENT.md)）：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;      # ★ 限流与审计需要真实 IP
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;                              # 报表导出可能较慢
    client_max_body_size 10m;                             # 与 BODY_LIMIT 对齐
}
```

> **限流与真实 IP 的注意事项（重要）**：`src/app.js` 中的 `express-rate-limit` 使用请求来源 IP 计数，
> 但应用当前**未设置 `app.set('trust proxy', 1)`**。放在 Nginx 之后时：
> - 所有请求会被视为来自代理 IP（`127.0.0.1`），限流变成「全站共享 500 次/15 分钟」；
> - `express-rate-limit` 检测到 `X-Forwarded-For` 而未信任代理时会打印告警（`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`）。
>
> 内网单车间场景影响很小；若需要按真实客户端 IP 限流，请在 `src/app.js` 顶层补一行
> `app.set('trust proxy', 1);`（属代码改动，需回归验证后上线）。

---

## 八、日志、健康检查与限流

| 项目 | 现状 | 位置 / 调整方式 |
|------|------|-----------------|
| HTTP 访问日志 | 开发 `dev` 格式 / 生产 `combined` 格式 | `src/app.js`（morgan）；PM2 下写入 `logs/pm2-out.log` |
| 应用日志 | `console.log` 输出到 stdout | PM2 日志 / NSSM 重定向 |
| Prisma 日志 | 开发 `query,info,warn,error`；生产仅 `error` | `src/config/database.js` |
| 健康检查 | `GET /api/health` → `{code:200,data:{status:'ok',timestamp,uptime}}` | `src/routes/index.js`；可用于负载均衡探活与监控 |
| 限流 | **500 次 / 15 分钟 / IP**，仅作用于 `/api` 前缀 | `src/app.js` 中 `rateLimit({windowMs, max})`；**无环境变量**，调整需改代码后重启 |
| 优雅关闭 | SIGINT/SIGTERM → 关服务 → 断库 → 退出（最长 5s） | `src/server.js`，与 PM2 `kill_timeout: 5000` 配合 |

---

## 九、备份与回滚

### 9.1 备份（`scripts/backup-db.js`）

```bash
npm run db:backup                                      # 备份到 backend/backups/
node scripts/backup-db.js --out-dir=D:/mes-backup      # 指定输出目录
node scripts/backup-db.js --env=production             # 读 .env.production 指向的库
node scripts/backup-db.js --execute                    # MySQL 真正执行导出（默认只打印命令）
node scripts/backup-db.js --keep=7                     # 按 mtime 仅保留最近 7 个备份
node scripts/backup-db.js --dump-bin=<绝对路径>         # 指定 mysqldump 可执行文件
```

行为：按当前库类型自动识别——SQLite 复制 `.db`（如启用 WAL，`-wal/-shm` 一并复制）；
MySQL **默认只打印命令（避免误连生产库）**，加 `--execute` 才真正导出 `.sql`。
建议每日低峰执行并保留 ≥ 7 天（可用 `--keep` 自动清理）。

### 9.2 回滚

| 场景 | 操作 |
|------|------|
| SQLite 数据损坏 / 误操作 | 停服务 → 用 `backups/` 中的备份覆盖 `prisma/*.db` → 重启 |
| MySQL 数据回滚 | `mysql -u mes_user -p mes_workshop < backups/mes_workshop-<时间戳>.sql` |
| 代码回滚 | 切回上一版本目录（或 `git checkout <tag>`）→ `npm ci` → `npx prisma generate` → 重启；**若表结构有变更，先备份再回滚** |

---

## 十、常见问题排查

### 10.1 `Cannot find module '@prisma/client'` 或类型报错
未生成客户端。执行 `npx prisma generate` 后重启；每次修改 schema 或切换 provider 都要重跑。

### 10.2 `prisma generate` 报 `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
Windows 下 node 进程正在占用 Prisma 引擎文件（后端服务仍在运行）。处置：

```bash
pm2 stop mes-backend      # 或停止 node 进程 / 关闭 npm run dev 窗口
npx prisma generate
pm2 start ecosystem.config.js
```

> 注意：该报错下 Prisma CLI 仍可能返回退出码 0，请检查输出中是否出现 `EPERM` 字样，勿只看退出码。

### 10.3 端口被占用（`EADDRINUSE`）

```bash
netstat -ano | findstr :3000        # Windows；Linux: lsof -i:3000
# 终止占用进程，或用其他端口启动：
PORT=3020 node src/server.js        # Windows CMD: set PORT=3020 && node src/server.js
```

### 10.4 SQLite 报 `SQLITE_BUSY` / 无法写入
SQLite 单写者模型：同一 `.db` 被多个进程同时写会锁库。处置：只保留单实例（PM2 `instances: 1`），
或切换到 MySQL；确认数据库文件所在目录可写（Linux 需注意 `www-data`/`node` 用户权限）。

### 10.5 MySQL 连接失败

| 报错 | 原因与处置 |
|------|-----------|
| `P1000 Authentication failed` / `ERROR 1045` | 用户名/密码错误，或该用户无远程登录权限（需 `CREATE USER ... @'%'` + `GRANT`） |
| `P1001 Can't reach database server` | 主机/端口不通（云上注意安全组、Windows 防火墙放行 3306） |
| `P1012 the URL must start with the protocol 'mysql://'` | `DB_TYPE` 与 `DATABASE_URL` 类型不匹配 → 让二者一致（或删掉 `DATABASE_URL` 改用分散参数），再 `npm run db:setup` |
| `P3019 provider does not match migration_lock.toml` | 在 MySQL 下误用 `prisma migrate deploy` → 改用 init SQL 或 `prisma db push`（见 4.4） |
| `ERROR 1146 Table 'xxx' doesn't exist` | 库选错（URL 里的库名）或尚未建表 → 执行 4.4 的建库路径 |

连接串中的密码如含 `@ : / ?` 等字符必须做 URL 编码（`@` → `%40`）。

### 10.6 时区偏差
数据库存 DATETIME，Prisma 按 UTC 与本地时区转换。若报表出现 8 小时偏移：服务器保持
`Asia/Shanghai`，MySQL 连接串可加 `?timezone=+08:00`，并确认操作系统时区一致。

### 10.7 种子数据重复执行
`prisma/seed.js` 全部使用 `upsert`（权限/角色/用户/车间/设备按唯一键幂等），重复执行安全；
若发现重复的权限行，说明有人手工插入过，请清理后重跑 `npm run db:seed`。

### 10.8 前后端联调 404 / 跨域
- 开发：前端 Vite 代理 `/api → http://127.0.0.1:3000`（`frontend/vite.config.ts`），确认后端已启动；
- 生产：`CORS_ORIGIN` 必须是浏览器实际访问的地址（含端口），否则登录接口会被浏览器拦截。

---

## 十一、测试与验收

### 11.1 自动化测试（Jest + Supertest）

```bash
npm test                  # 全部测试（单元 + 集成）
npm run test:unit         # 仅单元测试（秒级，不访问数据库）
npm run test:integration  # 仅集成测试（走真实 HTTP 与数据库）
npm run test:coverage     # 生成覆盖率报告（coverage/）
```

测试使用**独立 SQLite 测试库 `prisma/test.db`**，由 `tests/global-setup.js` 在每次运行前重建，
因此在任何环境下执行都**不会改动开发库 `dev.db` 或生产库**。
首次运行若缺少 Prisma Client 会自动补齐，克隆仓库后可直接 `npm test`。

| 用例范围 | 锁定的能力 |
|----------|-----------|
| 单元 · env | `DB_TYPE` 推断与回退、MySQL 连接串拼装、密码特殊字符 URL 编码 |
| 单元 · jwt | 双 Token 往返、篡改/过期检测、Access 与 Refresh 密钥隔离 |
| 单元 · zod-helpers | 空串/null 视为未传、分页上限、布尔不误判 |
| 单元 · response | 响应结构与各语义状态码 |
| 集成 · health | `/api/health` 暴露库类型与连通性 |
| 集成 · auth | 登录、鉴权拦截、RBAC 权限、令牌刷新、不外泄密码哈希 |
| 集成 · database | 双 Client 预生成、27 张表齐备、种子数据支撑 RBAC |

完整说明见 **[../TESTING.md](../TESTING.md)**。

### 11.2 数据库脚本自检

```bash
npm run db:status                        # 当前库类型 / 连接串 / Client 生成状态
node ../database/verify-mysql-init.js    # MySQL 建库脚本静态自检（表数/外键/语法等）
```

### 11.3 代码风格检查

```bash
npm run lint
```

---

## 十二、常用命令速查

| 场景 | 命令（在 `backend/` 下执行） |
|------|--------------------------------|
| 安装依赖 / 仅生产依赖 | `npm install` / `npm ci --omit=dev` |
| 启动（开发 / 生产） | `npm run dev` / `npm start` |
| 数据库配置查询 | `npm run db:status` |
| 生成 Client（按 DB_TYPE / 两套都生成） | `npm run db:setup` / `npm run db:setup:all` |
| SQLite 一键初始化（建表 + 种子） | `npm run db:setup:sqlite` |
| MySQL 一键初始化（建表 + 种子） | `npm run db:setup:mysql` |
| MySQL 建表（导入 SQL 脚本路径） | `mysql -u root -p < ../database/mes-mysql-init.sql` |
| 仅建表 / 仅写种子数据 | `npm run db:push` / `npm run db:seed` |
| SQLite 迁移升级 | `npx prisma migrate deploy` |
| 备份数据库 | `npm run db:backup` |
| 运行测试（全部 / 单元 / 覆盖率） | `npm test` / `npm run test:unit` / `npm run test:coverage` |
| 代码检查 | `npm run lint` |
| PM2 守护 | `pm2 start ecosystem.config.js` |
| 打开数据管理界面 | `npm run prisma:studio` |

---

*最后更新：2026-09-17 · 维护：后端工程师（软件工程师角色）*
