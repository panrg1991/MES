# MES 车间制造执行系统 — 部署总览

> 本文件是**前后端整体部署入口**（架构、上线顺序、验证清单、备份回滚）。
> 各端细节请看对应文档（本文件只做汇总，不重复长内容）：
>
> | 文档 | 内容 |
> |------|------|
> | **[README.md](README.md)** | 项目总览：技术栈、目录结构、快速开始、数据库动态配置、功能模块、文档索引 |
> | **[backend/README.md](backend/README.md)** | 后端部署说明：环境要求、目录职责、快速开始、环境变量清单、PM2/NSSM、Nginx 要点、日志与健康检查、常见问题 |
> | **[backend/docs/DATABASE.md](backend/docs/DATABASE.md)** | 多数据库（SQLite / MySQL）动态配置：切换原理、配置项、从零初始化、互切命令、迁移策略、备份恢复 |
> | **[frontend/README.md](frontend/README.md)** | 前端部署说明：构建、环境变量、Nginx/静态资源、布局滚动模型、自动化测试、常见问题 |
> | **[TESTING.md](TESTING.md)** | 测试与持续集成：前后端测试体系、测试库隔离机制、CI 流水线、编写约定 |
>
> 相关交付物：`database/mes-mysql-init.sql`（MySQL 建库 + 27 表 DDL + 中文注释 + 种子数据）、`database/verify-mysql-init.js`（该 SQL 的静态自检）、`backend/deploy/`（Dockerfile / docker-compose.yml / .dockerignore）、`.github/workflows/ci.yml`（CI 流水线）。

---

## 一、系统架构总览

```
                    ┌───────────────────────────────┐
   车间电脑 浏览器    │  http://<服务器IP>/           │
   （20 台左右）      └───────────────┬───────────────┘
                                    │ HTTP :80
                          ┌─────────▼─────────┐
                          │      Nginx        │  ① 静态资源：frontend/dist（SPA，try_files → index.html）
                          │  （推荐前置）      │  ② /api/ 反向代理 → 127.0.0.1:3000
                          └────┬─────────┬────┘
                               │         │
              静态文件 /         │         │  /api/*
              index.html        │         ▼
                    ┌──────────▼───┐  ┌──────────────────────────────┐
                    │ frontend/dist │  │  后端 Node.js + Express      │
                    │ (Vite 构建)   │  │  PORT=3000，入口 src/server.js│
                    └──────────────┘  │  路由 /api/*，健康检查        │
                                      │  /api/health                  │
                                      └───────────┬──────────────────┘
                                                  │ Prisma Client
                        ┌─────────────────────────┴─────────────────────────┐
                        │                      数据库                        │
                        │  SQLite（默认，单机单文件）                        │
                        │  MySQL 8.0 / MariaDB（推荐多实例/已有环境）        │
                        │  —— 由 .env 的 DB_TYPE 动态切换                    │
                        └───────────────────────────────────────────────────┘
```

端口约定：Nginx `80`（或 `5173` 直用前端开发端口）、后端 `3000`、MySQL `3306`、前端开发服务器 `5173`。

---

## 二、环境要求

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 18（推荐 22 LTS） | 前端构建 + 后端运行 |
| npm | 随 Node（推荐 10+） | 依赖安装（生产用 `npm ci`） |
| 数据库 | 无需安装（SQLite）/ MySQL 8.0+ | 默认 SQLite，仅需文件权限；MySQL 需 utf8mb4 库 |
| Nginx | 1.18+（可选但推荐） | 静态资源 + API 反代 |
| PM2 或 NSSM | 最新 | 后端常驻与开机自启 |

验证：

```bash
node -v && npm -v
```

---

## 三、需要拷贝 / 上传的内容

**需要**：

```
mes-workshop-system/
├── backend/                 # 后端源码（含 prisma/schema*.prisma、scripts/、deploy/、ecosystem.config.js）
├── frontend/                # 前端源码（构建产物在服务器上生成）
├── database/                # mes-mysql-init.sql（用 MySQL 时必需）+ verify-mysql-init.js
├── DEPLOYMENT.md            # 本文件
└── .gitignore               # 可选
```

**不要拷贝（目标机重新生成/安装，或属于本机数据）**：

| 路径 | 原因 |
|------|------|
| `backend/node_modules/`、`frontend/node_modules/` | 目标机 `npm ci` 安装 |
| `frontend/dist/`（以及 dist-verify / dist-t10 等临时产物） | 目标机 `npm run build` 生成 |
| `backend/prisma/*.db`（dev.db / prod.db） | 数据库文件，按需初始化或从备份恢复 |
| `backend/.env`、`backend/.env.production` | 含本机密钥，目标机按 `.env.example` 重新配置 |
| `backend/logs/`、`backend/backups/` | 运行时产物 |
| `backend/.tmp-*`、各类 `*-result.txt` | 本机验证临时文件 |

---

## 四、数据库选型建议

| 场景 | 推荐 | 说明 |
|------|------|------|
| **20 台设备内网单机（默认）** | **SQLite** | 零运维、备份即复制文件；注意只允许**一个后端进程**写库 |
| 多实例后端 / 并发写较多 / 已有 MySQL 运维体系 | **MySQL 8.0（含 MariaDB 10.3+）** | 用 `database/mes-mysql-init.sql` 一键建库（含种子数据），或 `npm run db:setup:mysql` |

切换方式（后端目录内，详见 [backend/docs/DATABASE.md](backend/docs/DATABASE.md)）：
**改 `.env` 的 `DB_TYPE` 并重启服务即可**，业务代码零改动。

```bash
npm run db:status              # 查看当前库类型 / 连接串 / 各 Client 生成状态
npm run db:setup:all           # 一次生成两种 Client（推荐，便于随时切换）
npm run db:setup:sqlite        # SQLite 全流程：生成 Client + 建表 + 种子
npm run db:setup:mysql         # MySQL 全流程：生成 Client + 建表 + 种子
# 切换后重启服务，并访问 /api/health 确认 data.database.type
```

---

## 五、完整上线步骤

### 第 1 步：后端（详见 [backend/README.md](backend/README.md)）

```bash
cd backend
npm ci --omit=dev                 # 生产依赖（如需 prisma CLI 运维命令：npm i -D prisma）
npm run db:setup                  # 必做：生成当前 DB_TYPE 对应的 Prisma Client
copy .env.example .env.production # 配置生产变量：NODE_ENV/DB_TYPE/DB_*/JWT_*/CORS_ORIGIN/BODY_LIMIT

# 建库（二选一）
npx prisma migrate deploy                                  # A) SQLite：应用仓库内迁移
mysql -u root -p < ../database/mes-mysql-init.sql          # B) MySQL：导入建库脚本（含种子）

npm run db:seed                   # 种子数据（幂等；方式 B 已自带，可跳过）
set NODE_ENV=production && npm start    # 先前台试跑，确认健康

# 常驻
npm i -g pm2
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

Docker 路线（可选）：

```bash
cd backend/deploy && docker compose up -d --build     # 自动起 mysql:8.0 并执行 database/mes-mysql-init.sql
```

### 第 2 步：前端（详见 frontend/README.md）

```bash
cd frontend
npm ci
npm run build                     # 产物：frontend/dist/
```

> 前端的环境变量（如 `VITE_API_BASE_URL`）与构建参数以 **frontend/README.md** 为准；生产建议保持 `VITE_API_BASE_URL=/api`，由 Nginx 同源反代，避免跨域。

### 第 3 步：Nginx

```nginx
server {
    listen 80;
    server_name 192.168.1.100;      # 或内网域名

    root /opt/mes/frontend/dist;    # 第 2 步的构建产物
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;        # SPA 路由回退
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;   # 限流需要真实 IP
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;                            # 报表导出较慢
        client_max_body_size 10m;                           # 与 BODY_LIMIT 一致
    }
}
```

后端 `CORS_ORIGIN` 设为前端实际访问来源（如 `http://192.168.1.100`）；同源部署时也可留默认值不影响。

【注意】`backend/src/app.js` 未开启 `trust proxy`，反代后限流会把所有客户端视为同一 IP；如需按真实 IP 限流，请在 `app.js` 中 `const app = express();` 后加 `app.set('trust proxy', 1);`（详见 backend/README.md 第七章）。

防火墙放行（Windows 示例）：

```powershell
netsh advfirewall firewall add rule name="MES Web" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="MES API" dir=in action=allow protocol=TCP localport=3000
```

### 第 4 步：上线验证清单

| # | 检查项 | 命令 / 操作 | 期望结果 |
|---|--------|-------------|----------|
| 1 | 后端进程 | `pm2 status` | `mes-backend` 为 `online`，重启次数不持续增长 |
| 2 | 后端健康 | `curl http://127.0.0.1:3000/api/health` | `{"code":200,"data":{"status":"ok",...}}` |
| 3 | 数据库连通 | 后端启动日志 / `curl .../api/health` | 日志出现 `[数据库] 已连接 SQLITE：...`；health 返回 `database.connected: true` 且 `database.type` 与实际库一致 |
| 4 | 数据库结构 | `npm run db:status` + `npm test`（backend 目录） | 库类型与连接串正确；测试中「27 张表 / 种子数据 / 双 Client」用例全部通过 |
| 5 | 登录（直连后端） | `curl -X POST http://127.0.0.1:3000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin123\"}"` | 返回 `token` |
| 6 | 前端静态 | 浏览器打开 `http://<服务器IP>/` | 登录页正常显示，无 404（刷新任意子路由也不应 404） |
| 7 | 前端 → API（经 Nginx） | 浏览器登录 `admin/admin123` | 进入看板；浏览器 Network 中 `/api/*` 均为 200 |
| 8 | 关键模块 | 依次打开 生产排程 / 人员排班 / 工时统计 / OEE 分析 | 页面数据正常，无「参数校验失败」类报错 |
| 9 | 导出 | OEE 分析页点「导出」 | 下载 xlsx，文件名中文正常 |
| 10 | 自动化测试（可选） | `npm test`（backend）/ `npm test`（frontend） | 后端 112 用例、前端 52 用例全部通过 |
| 11 | 权限隔离（可选） | 用 `operator/operator123` 登录 | 看不到系统设置等无权限菜单，越权请求返回 403 |
| 12 | 备份可用 | `npm run db:backup` | 生成备份文件（SQLite）或 dump 命令（MySQL） |

> 上线后请立即修改默认账号密码（`admin/admin123`、`operator/operator123`），并更换 `JWT_SECRET` / `JWT_REFRESH_SECRET`。

---

## 六、回滚与备份

### 6.1 备份

| 数据库 | 方式 | 命令 |
|--------|------|------|
| SQLite | 文件快照（脚本自动带时间戳） | `npm run db:backup`（→ `backend/backups/dev-YYYYMMDD-HHmmss.db`）或直接复制 `prisma/dev.db` |
| MySQL | 逻辑备份 | `mysqldump --single-transaction --default-character-set=utf8mb4 -u mes_user -p mes_workshop > mes_workshop.sql`（或 `npm run db:backup -- --execute`） |

建议：SQLite 每日定时 `npm run db:backup -- --keep=14`（任务计划/cron）；MySQL 每日全量 + binlog 增量；备份文件与代码分盘存放。

### 6.2 回滚

```bash
# 1) 应用回滚（后端）
pm2 stop mes-backend
#   切回上一版本代码（Git: git checkout <上一个 tag/commit> 或还原上一份发布包）
npm ci --omit=dev && npm run db:setup
pm2 start ecosystem.config.js

# 2) 前端回滚：把上一版 frontend/dist 换回去（Nginx 无需改动，必要时 nginx -s reload）

# 3) 数据库回滚
#    SQLite：停服务 → 用备份覆盖 prisma/dev.db → 启服务
copy backups\dev-<时间戳>.db prisma\dev.db
#    MySQL：
mysql -u mes_user -p mes_workshop < mes_workshop-<时间戳>.sql
```

### 6.3 注意事项

1. **结构变更与数据回滚要成对**：若新版做过 `prisma migrate deploy` / `db push`，回滚代码后也要把数据库恢复到变更前备份（或准备对应的逆向 SQL）。
2. **切库前务必备份**：切换 provider 不迁移数据；跨库迁移需自行导出导入（以 UTF-8 为准，注意时区与大小写）。
3. **SQLite 单进程约束**：不要同时运行两个指向同一 `.db` 的后端进程（含 nodemon 双进程），否则报 `database is locked`。
4. **生产密钥不进仓库**：`.env.production` 只放在服务器上，权限收紧（Linux `chmod 600`）。

---

## 七、常用运维命令速查

| 场景 | 目录 | 命令 |
|------|------|------|
| 后端日志（PM2） | 任意 | `pm2 logs mes-backend --lines 200` |
| 后端重启 | 任意 | `pm2 reload mes-backend` |
| 健康检查 | 任意 | `curl http://127.0.0.1:3000/api/health` |
| 数据库状态 | backend | `npm run db:status` |
| 生成 Client / 初始化库 | backend | `npm run db:setup` / `db:setup:sqlite` / `db:setup:mysql` / `db:setup:all` |
| 备份 | backend | `npm run db:backup -- --execute` |
| 种子数据（幂等） | backend | `npm run db:seed` |
| 后端测试 / 前端测试 | backend / frontend | `npm test` |
| 代码检查 | backend / frontend | `npm run lint` |
| 前端构建 | frontend | `npm ci && npm run build` |
| Nginx 重载 | 任意 | `nginx -s reload` |

---

## 八、常见问题

**Q1 其他电脑打不开页面**：检查 Nginx 是否监听 80、防火墙是否放行、`try_files` 是否配置（否则刷新子路由 404）。

**Q2 页面能开但接口全 401/跨域**：后端 `CORS_ORIGIN` 与实际来源不一致；或 Nginx 未代理 `/api/`（前端仍在直连 3000 而端口未放行）。

**Q3 后端启动即退出**：看 `pm2 logs` / 控制台；常见原因是 `.env.production` 缺失、`DB_TYPE` 与连接串不匹配（跑 `npm run db:status`）、未生成对应 Client（跑 `npm run db:setup`）。

**Q4 时间差 8 小时**：SQLite 存 UTC；MySQL `DATETIME` 无时区。服务器与容器统一 `TZ=Asia/Shanghai`（compose 已带），MySQL 端确认 `SELECT @@global.time_zone;`。

**Q5 导出大报表超时**：调大 Nginx `proxy_read_timeout`（示例 120s）；后端单次导出上限 10000 行、超限返回 400（前端有提示）。

**Q6 想用 MySQL 但不想装 MySQL 客户端**：可用 `backend/deploy/docker-compose.yml` 起 `mysql:8.0`，并把 `database/mes-mysql-init.sql` 作为 initdb 脚本自动执行。

更细的后端问题（EPERM、seed 重跑、P3019、drift、时区、权限）见 [backend/README.md](backend/README.md) 第十章与 [backend/docs/DATABASE.md](backend/docs/DATABASE.md) 第九章。

---

## 九、默认账号与种子数据

初始化（`backend/prisma/seed.js` 或 `database/mes-mysql-init.sql`）后包含：

| 数据 | 数量 | 说明 |
|------|------|------|
| 权限 | **109 项**（30 菜单 + 79 按钮） | P0 59 项 + P1 新增 50 项 |
| 角色 | 3 个 | 系统管理员（109 权限）/ 生产操作员（18 权限）/ 只读用户（23 权限） |
| 用户 | 2 个 | `admin/admin123`、`operator/operator123`（bcrypt 哈希存储） |
| 车间 | 1 个 | 一号车间 `WS-001` |
| 设备 | 5 台 | `EQ-001`~`EQ-005`（数控车床 / 立式铣床 / 注塑机 / 加工中心 / 装配线） |
| 业务表 | 20 张空表 | 工单 / 报工 / 检验 / 物料 / 库存 / 排班 / 工时等，由业务运行时写入 |

> **上线必做**：修改两个默认账号的密码；更换 `JWT_SECRET` 与 `JWT_REFRESH_SECRET`。

---

*最后更新：2026-09-17（部署总览；细节以 backend/README.md、backend/docs/DATABASE.md、frontend/README.md 为准）*
