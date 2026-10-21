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

端口约定：Nginx `80`（或 `5173` 直用前端开发端口）、Node 后端 `3000`、PHP 后端 `8080`、MySQL `3306`、前端开发服务器 `5173`。

> **双后端说明**：`/api/*` 可由 Node 后端（`backend/`，:3000）或 PHP 后端（`php-backend/`，:8080）提供，
> 两者接口路径、权限码、响应结构、JWT 密钥完全一致，连接同一个数据库，可随时切换（见「第 5 步」）。

---

## 二、环境要求

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 18（推荐 22 LTS） | 前端构建 + Node 后端运行 |
| npm | 随 Node（推荐 10+） | 依赖安装（生产用 `npm ci`） |
| PHP（可选） | >= 7.2（推荐 7.4 / 8.x） | 仅部署 PHP 后端时需要；扩展 `pdo_mysql` / `pdo_sqlite` / `zip` / `mbstring` |
| 数据库 | 无需安装（SQLite）/ MySQL 8.0+ | 默认 SQLite，仅需文件权限；MySQL 需 utf8mb4 库 |
| Nginx | 1.18+（可选但推荐） | 静态资源 + API 反代 |
| PM2 或 NSSM | 最新 | Node 后端常驻与开机自启 |
| Apache 2.4 / PHP-FPM | 最新 | PHP 后端常驻（也可用 `php -S` 做单机演示） |

验证：

```bash
node -v && npm -v
php -v && php -m | findstr /i "pdo_mysql pdo_sqlite zip mbstring"   # 仅 PHP 后端需要
```

---

## 三、需要拷贝 / 上传的内容

**需要**：

```
mes-workshop-system/
├── backend/                 # 后端源码（含 prisma/schema*.prisma、scripts/、deploy/、ecosystem.config.js）
├── php-backend/             # PHP 后端源码（可选，与 Node 二选一部署）
├── frontend/                # 前端源码（构建产物在服务器上生成）
├── database/                # mes-mysql-init.sql（用 MySQL 时必需）+ mes-mysql-grants.sql + verify-mysql-init.js
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

# B+) MySQL 账号分层（强烈建议，最小权限）
#     运行账号 mes_app 只有 DML 权限；建库/迁移/备份使用 root 或 mes_migrate
mysql -u root -p -e "CREATE USER IF NOT EXISTS 'mes_app'@'%' IDENTIFIED BY '<强口令>';"
mysql -u root -p < ../database/mes-mysql-grants.sql
#     随后把 .env.production 的 DB_USER 改为 mes_app、DB_PASSWORD 改为上面的强口令

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

> **反向代理下的真实 IP**：Nginx 前置时请在 `backend/.env.production` 设置 `TRUST_PROXY=true`（已内置支持，无需改代码），
> 否则限流会把全部客户端视为同一 IP（详见 backend/README.md 第七章）。

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
| 10 | 自动化测试（可选） | `npm test` / `npm run test:coverage`（两端） | 后端 156 用例、前端 77 用例全部通过，覆盖率门禁通过 |
| 11 | 权限隔离（可选） | 用 `operator/operator123` 登录 | 看不到系统设置等无权限菜单，越权请求返回 403 |
| 12 | 备份可用 | `npm run db:backup` | 生成备份文件（SQLite）或 dump 命令（MySQL） |

> 上线后请立即修改默认账号密码（`admin/admin123`、`operator/operator123`），并更换 `JWT_SECRET` / `JWT_REFRESH_SECRET`。

### 第 5 步：PHP 后端部署（可选，与 Node 二选一）

PHP 后端位于 `php-backend/`，实现与 Node 后端**完全相同的 100+ 个接口**（含 OEE、追溯、Excel 导出、RBAC、
登录锁定、并发扣减、报工幂等等），无需 Node 环境，适合已有 Apache/PHP 主机或无法安装 Node 的现场。

**前置条件**

| 项 | 要求 |
|----|------|
| PHP | ≥ 7.2（推荐 7.4 / 8.x），关闭 `display_errors`，开启 `pdo_mysql`（MySQL）或 `pdo_sqlite`（SQLite） |
| 扩展 | `zip`（Excel 导出必需）、`mbstring`、`json`、`openssl` |
| 数据库 | 已由 Node 侧执行过 `npm run db:setup:all`（PHP **不建表**，只读写同一个库） |
| 配置 | **选文件规则与 Node 一致**：`NODE_ENV=production` 读 `.env.production`，其他读 `.env`；先找 `php-backend/`，再找 `backend/`。生产缺少 `.env.production` 时 PHP 返回 **503 拒绝启动**（防止连错库/用弱密钥） |
| 账号权限 | 生产使用最小权限账号（仅 `SELECT/INSERT/UPDATE/DELETE`），建表/改表由迁移账号或 root 执行，见 `database/mes-mysql-grants.sql` |
| 目录权限 | `php-backend/runtime/` 可写（限流、登录锁定、令牌吊销、日志、启动时间） |

**方式 A：单机演示 / 内网小规模（PHP 内置服务器）**

```bat
cd php-backend
start.bat
:: 或
php -S 0.0.0.0:8080 -t public public/index.php
:: SQLite 且 php.ini 未启用 pdo_sqlite 时
php -d extension=pdo_sqlite -S 0.0.0.0:8080 -t public public/index.php
```

**方式 B：Apache（推荐 Windows + Apache 现场）**

1. Apache 站点 `DocumentRoot` 指向 `php-backend/public`；
2. 确认 `mod_rewrite` 已启用（仓库已内置 `public/.htaccess`）；
3. 将 `php-backend` 目录授予 Apache 运行账号读取权限，`runtime/` 授予写权限；
4. 若使用 SQLite，`backend/prisma/*.db` 所在目录需授予读写权限。

**方式 C：Nginx + PHP-FPM**

```nginx
server {
    listen 8080;
    root  /path/to/php-backend/public;

    location /api/ {
        include        fastcgi_params;
        fastcgi_param  SCRIPT_FILENAME $document_root/index.php;
        fastcgi_param  SCRIPT_NAME     /index.php;
        fastcgi_param  REQUEST_URI     $request_uri;
        fastcgi_pass   127.0.0.1:9000;
    }
}
```

**启动后验证**

```bash
curl http://127.0.0.1:8080/api/health
curl -X POST http://127.0.0.1:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

`/api/health` 应返回 `status: ok`、`database.connected: true`，且 `service.node` 为 `PHP x.y.z`。

**切换前端到 PHP 后端（无需重新构建）**

```bat
:: 默认切到 http://127.0.0.1:8080/api
switch-backend.bat php

:: PHP 与前端不同机时指定地址（需同步修改 php-backend/.env 的 CORS_ORIGIN）
switch-backend.bat php http://192.168.1.100:8080/api

:: 回切 Node 后端
switch-backend.bat node
```

也可直接编辑部署目录下的 `frontend/dist/config.js`：`API_BASE_URL: 'http://<PHP服务器>:8080/api'`，
保存后浏览器 `Ctrl+F5`。切换只影响请求地址，不迁移、不修改任何业务数据。

**PHP 后端上线检查清单**

| # | 检查项 | 期望结果 |
|---|--------|----------|
| 1 | `GET /api/health` | 200，`database.connected=true`，`database.type` 与实际库一致 |
| 2 | 登录 `admin/admin123` | 返回 `token` + `permissions`（管理员 109 项） |
| 3 | Token 互通 | 用 Node 签发的 Token 请求 PHP `/api/auth/profile`，返回同一用户（反之亦然） |
| 4 | 七大模块列表 | 生产 / 排程 / 设备 / 维保 / 故障 / 质量 / 物料 / 人员 / 报表均无 500 |
| 5 | OEE 汇总 | 与 Node 后端同一时间范围结果一致 |
| 6 | 报工幂等 | 同一 `requestId` 重复提交返回同一条记录，超量报工返回 400 |
| 7 | 库存扣减 | 出库量 > 库存返回 400，库存不为负 |
| 8 | 排程冲突 | 同设备重叠时段返回 409，响应 `data.conflicts` 非空 |
| 9 | Excel 导出 | OEE / 生产 / 质量 / 库存 / 工时 5 类文件均可下载并用 Excel 打开 |
| 10 | 越权访问 | `operator/operator123` 访问系统设置接口返回 403 |
| 11 | 登录锁定 | 同一账号连续 5 次密码错误后返回 429（15 分钟后自动解锁） |
| 12 | 回切验证 | `switch-backend.bat node` 后刷新页面，系统仍正常可用 |

**生产配置（`php-backend/.env.production`）**

```ini
NODE_ENV=production              # 必须在系统环境变量/php-fpm env 中设置，决定读 .env.production
APP_DEBUG=false                  # 生产保持 false，异常详情不回显
TRUST_PROXY=true                 # Nginx/Apache 前置时必须为 true，否则限流与审计 IP 全是 127.0.0.1
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_USER=mes_app                  # 最小权限账号（仅 DML）
DB_PASSWORD=<强口令>
DB_NAME=mes_workshop
JWT_SECRET=<与 Node 端一致，≥32 位>
JWT_REFRESH_SECRET=<与 Node 端一致，另一把 ≥32 位>
CORS_ORIGIN=http://<前端实际地址>
```

> **启动自检（503 拒绝启动）**：生产环境（`NODE_ENV=production`）下若
> ① 找不到 `.env.production`、② `NODE_ENV` 未明确为 production、③ JWT 密钥为默认值/占位值/短于 32 位/两把相同，
> 后端会直接返回 `503 服务配置不安全：…` 并在 `runtime/app.log` 记录 `config_insecure`。
> 这是刻意设计的 fail-fast：避免静默连到开发库或使用弱密钥上线。

> PHP 后端注意事项：
> 1. 登录锁定与限流使用 `php-backend/runtime/state.json`（文件锁），令牌吊销名单使用 `runtime/denylist.json`，**多实例/多机部署需替换为 Redis 等集中存储**；
> 2. PHP 不做数据库迁移，升级表结构仍由 Node 侧 Prisma 执行，执行后再启动 PHP 即可；
> 3. PHP 端 `JWT_SECRET` 必须与 Node 端一致，否则切换后旧 Token 失效（重新登录即可）；
> 4. 鉴权以数据库为准：账号停用/删除、角色权限回收**立即生效**，无需等待 Token 过期；登出会把当前 Token 的 `jti` 加入吊销名单，剩余有效期内立即失效；
> 5. 若使用 SQLite，请确保 Web 进程与 Node 进程不会同时长时间持有写事务（SQLite 单写者模型）；
> 6. 数据库账号请使用 `database/mes-mysql-grants.sql` 收敛为 DML 权限，DDL 交给迁移账号/root。

---

## 六、回滚与备份

### 6.1 备份

| 数据库 | 方式 | 命令 |
|--------|------|------|
| SQLite | 文件快照（脚本自动带时间戳） | `npm run db:backup`（→ `backend/backups/dev-YYYYMMDD-HHmmss.db`）或直接复制 `prisma/dev.db` |
| MySQL | 逻辑备份 | `mysqldump --single-transaction --default-character-set=utf8mb4 -u mes_migrate -p mes_workshop > mes_workshop.sql`（或 `npm run db:backup -- --execute`；备份用迁移账号/root，应用账号仅 DML） |

建议：SQLite 每日定时 `npm run db:backup -- --keep=14`（任务计划/cron）；MySQL 每日全量 + binlog 增量；备份文件与代码分盘存放。

### 6.2 回滚

```bash
# 1) 应用回滚（Node 后端）
pm2 stop mes-backend
#   切回上一版本代码（Git: git checkout <上一个 tag/commit> 或还原上一份发布包）
npm ci --omit=dev && npm run db:setup
pm2 start ecosystem.config.js

# 2) 前端回滚：把上一版 frontend/dist 换回去（Nginx 无需改动，必要时 nginx -s reload）

# 3) 数据库回滚
#    SQLite：停服务 → 用备份覆盖 prisma/dev.db → 启服务
copy backups\dev-<时间戳>.db prisma\dev.db
#    MySQL：
mysql -u mes_app -p mes_workshop < mes_workshop-<时间戳>.sql
```

**PHP 后端回滚（与 Node 二选一部署时）**

```bash
# ① 先回切前端（避免前端继续请求已下线的 PHP 地址）
switch-backend.bat node

# ② 停 PHP：Apache → 注释站点/Stop-Service Apache2.4；Nginx+FPM → nginx -s stop / 停 php-fpm
#    临时演示（php -S）→ 结束对应 php 进程

# ③ 回退代码：git checkout <上一个 tag/commit> 或还原上一份发布包（php-backend/ 整目录）

# ④ 清理与核对（重要）
#    · runtime/denylist.json 可保留（只影响已登出的 Token）；
#    · runtime/state.json 建议删除：旧版本的登录锁定/限流计数会把账号继续锁住；
#      del php-backend\runtime\state.json
#    · 确认 php-backend/.env.production 仍在（不属于代码包，禁止随包回滚覆盖）

# ⑤ 启 PHP → 访问 /api/health 确认 200、database.type 与实际库一致、service.node 为 PHP x.y.z

# ⑥ 若本次发布包含表结构变更：PHP 不支持迁移，必须先按第 1 步把 Node 代码回滚到
#    与旧表结构匹配的版本并恢复数据库备份，再启动 PHP（否则旧 PHP + 新表结构会 500）
```

> **回滚判定依据**：`/api/health` 的 `service.version` 两套后端都取 `backend/package.json`，
> 无法区分 PHP 代码版本。回滚后请以「发布包/Git tag + 进程启动时间 + `/api/health` 的 `service.node`」共同确认，
> 并在发布记录中登记每个版本的 Git commit。

### 6.3 注意事项

1. **结构变更与数据回滚要成对**：若新版做过 `prisma migrate deploy` / `db push`，回滚代码后也要把数据库恢复到变更前备份（或准备对应的逆向 SQL）。
2. **切库前务必备份**：切换 provider 不迁移数据；跨库迁移需自行导出导入（以 UTF-8 为准，注意时区与大小写）。
3. **SQLite 单进程约束**：不要同时运行两个指向同一 `.db` 的后端进程（含 nodemon 双进程），否则报 `database is locked`。
4. **生产密钥不进仓库**：`.env.production` 只放在服务器上，权限收紧（Linux `chmod 600`）；PHP 与 Node 读同一个文件，回滚时不要用发布包覆盖它。
5. **双后端切换前留痕**：`switch-backend.bat/ps1` 会直接改写 `frontend/dist/config.js`，切换前先复制一份
   （`copy config.js config.js.bak`），并在发布记录中写明当前指向哪套后端；回滚时按第 6.2 节「先回切前端」执行。
6. **数据库账号分层**：应用账号（`mes_app`）仅 DML，迁移/备份用 `mes_migrate` 或 root；
   已有数据卷/已有库不会自动重建授权：可新建 `mes_app` 并把 `DB_USER` 切过去后执行
   `database/mes-mysql-grants.sql`，也可直接对现有 `mes_user` 执行该脚本收回 DDL（脚本中把账号名换成 `mes_user` 即可）。

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

## 十、前后端异地独立部署（推荐拓扑 B）

适用场景：已有前端静态站点服务器（Nginx/IIS/对象存储），后端单独跑在应用服务器或容器平台。
两端**只通过 HTTP API 通信**，无构建期/运行期文件依赖。

```
┌────────────────────────────┐            ┌──────────────────────────────┐
│ 前端服务器（任意静态托管）  │            │ 后端服务器（Node.js 22）      │
│  http://192.168.1.101      │  /api/*    │  http://192.168.1.100:3000    │
│  dist/（含 config.js）      │ ─────────► │  Express + Prisma            │
└────────────────────────────┘   跨域     └───────────────┬──────────────┘
                                                          │
                                                   SQLite / MySQL
```

### 10.1 后端侧配置（`backend/.env.production`）

```ini
NODE_ENV=production
HOST=0.0.0.0                 # 允许前端服务器/车间终端访问
PORT=3000
CORS_ORIGIN=http://192.168.1.101   # 前端实际访问地址（多个用逗号分隔，需带协议与端口）
TRUST_PROXY=true                    # 若后端前还有 Nginx 则设为 true
DB_TYPE=sqlite                      # 或 mysql
JWT_SECRET=<强随机值>
JWT_REFRESH_SECRET=<另一个强随机值>
```

启动：`npm run db:setup` → `npm start`（或 `deploy/start-backend.bat` / PM2）。
验证：`curl http://192.168.1.100:3000/api/health` 返回 `service.version` 与 `database.connected: true`。

### 10.2 前端侧配置（部署后改 `dist/config.js`，无需重新构建）

```js
window.__MES_CONFIG__ = {
  API_BASE_URL: 'http://192.168.1.100:3000/api',
  APP_TITLE: 'MES 车间制造执行系统',
  BASE_PATH: '',
};
```

同机 Nginx 反代场景则保持 `API_BASE_URL: ''`（沿用构建期的 `/api`）。
改完强制刷新浏览器（Ctrl+F5）即可；登录页会显示当前 API 地址与连接状态。

### 10.3 子路径部署（如 `http://host/mes/`）

1. 构建：`VITE_BASE_PATH=/mes/ npm run build`（Windows：`set VITE_BASE_PATH=/mes/ && npm run build`）
2. 部署后 `config.js`：`BASE_PATH: '/mes/'`，`API_BASE_URL: '/mes/api'`（若 Nginx 按此路径反代）
3. Nginx 增加 `location /mes/api/ { proxy_pass http://127.0.0.1:3000/api/; }` 与 `location /mes/ { alias .../dist/; try_files $uri $uri/ /mes/index.html; }`

### 10.4 排障入口（现场无需登录服务器）

登录页会实时探测 `/api/health` 并显示接口地址；登录后右上角用户菜单 →「系统信息」可查看：
前端版本、API 地址、部署基路径、后端版本/环境/Node 版本、数据库类型与连通延迟、服务运行时长。

---

*最后更新：2026-10-21（部署总览；细节以 backend/README.md、backend/docs/DATABASE.md、frontend/README.md 为准）*
