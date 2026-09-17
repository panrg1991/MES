# MES 后端 · 数据库配置说明书（SQLite / MySQL 动态切换）

> 本文是**数据库配置的权威说明**，覆盖：动态切换原理、配置项、从零初始化、切换验证、备份恢复、常见问题。
> 所有命令均以 `backend/package.json` 与 `backend/scripts/db-setup.js` 的实际实现为准。

---

## 目录

- [1. 设计原理：为什么这样实现动态配置](#1-设计原理为什么这样实现动态配置)
- [2. 配置项速查](#2-配置项速查)
- [3. 一键命令](#3-一键命令)
- [4. 场景一：使用 SQLite（默认）](#4-场景一使用-sqlite默认)
- [5. 场景二：使用 MySQL](#5-场景二使用-mysql)
- [6. 两种数据库互切](#6-两种数据库互切)
- [7. 验证与排障](#7-验证与排障)
- [8. 备份与恢复](#8-备份与恢复)
- [9. 模型变更与迁移策略](#9-模型变更与迁移策略)
- [10. 数量与工时字段的精度约定（Decimal）](#10-数量与工时字段的精度约定decimal)
- [11. 常见问题 FAQ](#11-常见问题-faq)

---

## 1. 设计原理：为什么这样实现动态配置

### 1.1 约束

Prisma 的 `datasource.provider` **只能是字面量**，不能写成 `env("DB_TYPE")`：

```prisma
datasource db {
  provider = "sqlite"      // ✅ 合法
  // provider = env("DB_TYPE")   ❌ Prisma 不支持
  url      = env("DATABASE_URL")
}
```

因此「运行时用一个 Client 切换两种库」在 Prisma 中不可行。

### 1.2 本项目的解法：每种库一份独立 Client，运行时按配置加载

```
prisma/schema.prisma          ← 唯一真源：27 张表的模型定义（手工维护）
        │
        │  scripts/db-setup.js 派生（仅改 provider + output）
        ├──────────────────────────────────────────────┐
        ▼                                              ▼
prisma/schema.sqlite.prisma                  prisma/schema.mysql.prisma
（provider = "sqlite"）                      （provider = "mysql"）
output = generated/sqlite                    output = generated/mysql
        │                                              │
        │ prisma generate                              │ prisma generate
        ▼                                              ▼
prisma/generated/sqlite/                     prisma/generated/mysql/
（SQLite 版 Prisma Client）                  （MySQL 版 Prisma Client）
        └──────────────────┬───────────────────────────┘
                           │ src/config/database.js 按 DB_TYPE 动态 require
                           ▼
                    业务层（services）零改动
```

**核心收益**：两种 Client 预生成后，切换数据库**只需改 `.env` 的 `DB_TYPE` 并重启**，无需重新 `generate`、无需改动任何业务代码。

### 1.3 相关文件职责

| 文件 | 职责 |
|------|------|
| `prisma/schema.prisma` | **唯一真源**的模型定义（27 张表），手工维护 |
| `prisma/schema.sqlite.prisma` | 派生文件，**自动生成**，勿手工编辑 |
| `prisma/schema.mysql.prisma` | 派生文件，**自动生成**，勿手工编辑 |
| `prisma/generated/<类型>/` | 生成的 Prisma Client，**已 gitignore**，由脚本重建 |
| `src/config/env.js` | 解析 `DB_TYPE`、拼装连接串、暴露 `config` |
| `src/config/database.js` | 按 `DB_TYPE` 动态加载 Client，导出 `prisma` 单例 |
| `scripts/db-setup.js` | 一键脚本：同步 schema → 生成 Client → 建表 → 种子数据 |

> `schema.sqlite.prisma` / `schema.mysql.prisma` / `generated/` 均为派生产物，已在 `.gitignore` 中忽略；
> 克隆仓库后执行 `npm run db:setup` 即可重建。

---

## 2. 配置项速查

配置文件：`.env`（开发）或 `.env.production`（`NODE_ENV=production` 时读取）。

### 2.1 数据库类型

| 变量 | 取值 | 默认值 | 说明 |
|------|------|--------|------|
| `DB_TYPE` | `sqlite` \| `mysql` | `sqlite` | **切换开关**。未设置时按 `DATABASE_URL` 前缀推断（`file:` → sqlite） |

### 2.2 SQLite 参数

| 变量 | 说明 | 默认 |
|------|------|------|
| `DB_PATH` | 数据库文件路径，相对 `backend/prisma/` | `./dev.db` |

### 2.3 MySQL 参数

| 变量 | 说明 | 默认 |
|------|------|------|
| `DB_HOST` | 主机 | `127.0.0.1` |
| `DB_PORT` | 端口 | `3306` |
| `DB_USER` | 用户名 | `root` |
| `DB_PASSWORD` | 密码（含特殊字符会自动 URL 编码） | 空 |
| `DB_NAME` | 库名 | `mes_workshop` |

### 2.4 整串连接串（可选）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 直接给出完整连接串。**仅当类型与 `DB_TYPE` 一致时才生效**，否则以 `DB_TYPE` 为准重新拼装（避免改了 `DB_TYPE` 却仍连旧库） |

示例：

```bash
# SQLite
DATABASE_URL="file:./dev.db"

# MySQL
DATABASE_URL="mysql://mes_user:password@127.0.0.1:3306/mes_workshop"
```

> **注意**：`DATABASE_URL` 会被 `db-setup.js` 注入给 Prisma CLI。
> 若使用分散参数（`DB_HOST` 等）而未设置 `DATABASE_URL`，脚本会自动拼装后传给 CLI，无需手工填写。

---

## 3. 一键命令

| 命令 | 作用 |
|------|------|
| `npm run db:status` | 查看当前库类型、解析后的连接串、两个 Client 的生成状态 |
| `npm run db:setup` | 按 `.env` 的 `DB_TYPE` 生成对应 Client（不含建表/种子） |
| `npm run db:setup:sqlite` | SQLite 全流程：生成 Client + 建表 + 写种子数据 |
| `npm run db:setup:mysql` | MySQL 全流程：生成 Client + 建表 + 写种子数据 |
| `npm run db:setup:all` | 生成**两种** Client（推荐，便于随时切换） |
| `npm run db:push` | 仅把表结构推送到当前库 |
| `npm run db:seed` | 仅写入种子数据（幂等，可重复执行） |
| `npm run db:backup` | 数据库备份 |

脚本直连用法（更灵活）：

```bash
node scripts/db-setup.js sqlite --push --seed
node scripts/db-setup.js mysql  --push
node scripts/db-setup.js all
node scripts/db-setup.js --status
```

---

## 4. 场景一：使用 SQLite（默认）

适合：单机部署、内网小规模（20 台终端以内）、无 DBA 运维能力。

```bash
cd backend
npm install

# 生成 .env（若还没有）
copy .env.example .env      # Linux/Mac: cp .env.example .env

# 确认 .env 内容
#   DB_TYPE=sqlite
#   DB_PATH=./dev.db

# 一键初始化：生成 Client + 建表 + 写入种子数据
npm run db:setup:sqlite

# 启动
npm run dev                 # 开发
npm start                   # 生产
```

数据库文件位于 `backend/prisma/dev.db`（已在 `.gitignore` 中忽略）。

种子数据（幂等，可重复执行）：109 条权限、3 个角色、150 条角色权限、2 个用户、1 个车间、5 台设备。

---

## 5. 场景二：使用 MySQL

适合：多实例部署、已有 MySQL 环境、需要并发写入与集中备份。

### 5.1 准备数据库

**方式 A：导入建库脚本（含种子数据，推荐新环境）**

```bash
mysql -u root -p < ../database/mes-mysql-init.sql
```

该脚本创建 `mes_workshop` 库、27 张表，并内置种子数据。
导入后**不要再执行 `db push`**（会因整型宽度差异被判定为 drift）。

**方式 B：由 Prisma 建表**

```sql
CREATE DATABASE mes_workshop
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

```bash
npm run db:setup:mysql      # 生成 Client + 建表 + 写入种子数据
```

> 两种方式**只能选一种并长期保持**，混用会触发 Prisma drift 告警。

### 5.2 配置 .env

```bash
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=mes_user
DB_PASSWORD=your_password
DB_NAME=mes_workshop
```

若采用方式 A（已导入脚本自带种子数据），则只生成 Client，不建表、不写种子：

```bash
npm run db:setup            # 仅生成 MySQL Client
npm start
```

### 5.3 字符集要求

必须使用 `utf8mb4`，否则中文与 emoji 会乱码：

```ini
[mysqld]
character-set-server = utf8mb4
collation-server     = utf8mb4_unicode_ci
```

---

## 6. 两种数据库互切

### 6.1 前提

建议先执行 `npm run db:setup:all`，一次性把两种 Client 都生成好。

### 6.2 切换步骤

1. 修改 `.env` 的 `DB_TYPE`（`sqlite` ⇄ `mysql`）及对应连接参数；
2. 若目标库尚未建表，执行对应的一键初始化命令；
3. 重启服务。

```bash
# 例：从 SQLite 切到 MySQL
# ① 改 .env：DB_TYPE=mysql，填写 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME
# ② 建表（目标库为空时）
npm run db:setup:mysql
# ③ 重启
npm start
```

> **两种库的数据不会自动同步**。切换后看到的是目标库自己的数据；
> 如需迁移历史数据，请先备份再导入（见第 8 节）。

### 6.3 验证切换结果

```bash
curl http://127.0.0.1:3000/api/health
```

响应中的 `data.database.type` 即为当前生效的数据库类型：

```json
{
  "code": 200,
  "data": {
    "status": "ok",
    "database": {
      "type": "sqlite",
      "connected": true,
      "latencyMs": 3,
      "error": null
    }
  },
  "message": "服务运行正常"
}
```

`connected` 为 `false` 时返回 **503**，`error` 字段给出失败原因。

---

## 7. 验证与排障

### 7.1 标准检查清单

```bash
npm run db:status      # 确认 DB_TYPE、连接串、Client 生成状态
curl http://127.0.0.1:3000/api/health   # 确认 type 与 connected
```

### 7.2 常见错误

| 现象 | 原因 | 处理 |
|------|------|------|
| `尚未生成 xxx 对应的 Prisma Client` | 对应 Client 未生成 | `npm run db:setup:<类型>` |
| `Environment variable not found: DATABASE_URL`（P1012） | 直接手工调用 `npx prisma` 时未注入连接串 | 改用 `npm run db:*` 脚本（会自动注入） |
| `Can't reach database server` | MySQL 未启动 / 地址端口不通 | 确认服务已启动、端口放通、账号有远程权限 |
| `P3009 migrate found failed migrations` | 对 MySQL 执行了 SQLite 方言的迁移 | 见第 9 节：MySQL 使用 `db push`，不要 `migrate deploy` |
| 中文乱码 | 字符集非 utf8mb4 | 按 5.3 节配置字符集后重建库 |
| Windows 下 `prisma generate` 报 EPERM | 有 node 进程占用引擎 dll | 停掉后端服务后重试 |

---

## 8. 备份与恢复

### 8.1 SQLite

```bash
# 备份（直接复制文件，建议先停服以保证一致性）
cp prisma/dev.db prisma/dev.db.bak-$(date +%Y%m%d)

# 恢复
cp prisma/dev.db.bak-20260101 prisma/dev.db
```

### 8.2 MySQL

```bash
# 备份
mysqldump -u mes_user -p --single-transaction --routines mes_workshop > mes_workshop_$(date +%Y%m%d).sql

# 恢复
mysql -u mes_user -p mes_workshop < mes_workshop_20260101.sql
```

### 8.3 内置备份脚本

```bash
npm run db:backup
```

---

## 9. 模型变更与迁移策略

| 数据库 | 迁移方式 | 说明 |
|--------|----------|------|
| SQLite | `npx prisma migrate dev --name <名称>` | 生成 `prisma/migrations/`（**SQLite 方言**） |
| MySQL | `npx prisma db push` | **不要**对 MySQL 执行 `migrate deploy` |

原因：`prisma/migrations/migration_lock.toml` 记录的 provider 是 `sqlite`，
在 MySQL 下执行 `migrate deploy` 会直接报 `P3019`（provider 不匹配）。

**统一做法（推荐）**：

1. 修改 `prisma/schema.prisma`（唯一真源）；
2. 同步派生文件并重新生成 Client：

   ```bash
   npm run db:setup:all
   ```

3. 对 SQLite：`npx prisma migrate dev --name <名称>`；
4. 对 MySQL：`npm run db:push`。

> 若 MySQL 侧采用方式 A（导入 `mes-mysql-init.sql`）建库，模型变更需同步修改该 SQL 脚本。

---

## 10. 数量与工时字段的精度约定（Decimal）

数量与工时属于**业务关键数值**，浮点误差不可接受，因此统一使用定点小数。

### 10.1 字段清单与落地类型

| 表.字段 | schema 定义 | MySQL 落地 | SQLite 落地 |
|---------|-------------|-----------|-------------|
| `bom_items.quantity` | `Decimal @db.Decimal(12, 2)` | `DECIMAL(12,2)` | `DECIMAL` |
| `inventory.quantity` / `safetyStock` / `maxStock` | 同上 | `DECIMAL(12,2)` | `DECIMAL` |
| `inventory_transactions.quantity` | 同上 | `DECIMAL(12,2)` | `DECIMAL` |
| `material_batches.quantity` | 同上 | `DECIMAL(12,2)` | `DECIMAL` |
| `work_hours_records.hours` | 同上 | `DECIMAL(12,2)` | `DECIMAL` |

> `schema.prisma` 是**唯一真源**。SQLite connector 不支持 `@db.*` 原生类型注解，
> 因此 `scripts/db-setup.js` 在生成 SQLite 变体时会**自动剥离**该注解（MySQL 变体保留）。
> 两边的 `database/mes-mysql-init.sql` 与此约定保持一致。

### 10.2 代码层约定（重要）

Prisma Client 对 `Decimal` 字段返回的是 **Decimal 对象**，而不是 number。
若直接 `JSON.stringify` 会变成**字符串**（如 `"12.34"`），破坏前端「数值即 number」的契约
（前端会调用 `value.toFixed(2)`、直接参与算术，拿到字符串会报错或产生拼接）。

两条必须遵守的规则：

1. **响应出口统一转换**：`src/utils/response.js` 提供 `toPlainNumber()`，
   递归把 Decimal / BigInt 转成 number；`sendSuccess` / `sendCreated` / `sendPaginated`
   已自动应用 —— **新增接口只要走统一响应封装即可，无需额外处理**。
2. **参与算术前显式转 number**：service 内对 Decimal 字段做加减、比较时写 `Number(field)`。
   已适配的位置：
   - `personnel.service.js`：工时汇总累加与总计
   - `report.service.js`：工时报表聚合
   - `material.service.js`：库存充足性判断与提示文案

### 10.3 一致性校验

```bash
node database/verify-mysql-init.js
```

该脚本会比对 `schema.prisma` 与 `mes-mysql-init.sql` 的：

- 表数量 / 表名 / 字段名 / 字段数量
- **全字段类型语义族**（227 项）
- **全字段可空性**（227 项）
- 唯一约束 / 索引 / 外键 / 种子数据 / 语法

共 **932 项断言**。修改任何一侧的字段定义后，请执行一次以确保未发生漂移。

---

## 11. 常见问题 FAQ

**Q1：切换 `DB_TYPE` 后需要重新 `npm install` 吗？**

不需要。只需保证对应 Client 已生成（`npm run db:setup:all`），改 `.env` 重启即可。

**Q2：为什么同时保留 `schema.prisma` 和两份派生 schema？**

`schema.prisma` 是唯一真源，避免多份模型定义各自漂移；
两份派生文件由脚本生成，仅 provider 与 output 不同，模型定义逐字一致。

**Q3：可以用 PostgreSQL 吗？**

当前版本仅支持 `sqlite` 与 `mysql`。`DB_TYPE` 传入其他值会回退为 `sqlite`。

**Q4：容器内如何配置？**

用环境变量注入即可，无需挂载 `.env`：

```yaml
environment:
  DB_TYPE: mysql
  DB_HOST: mysql
  DB_PORT: 3306
  DB_USER: mes_user
  DB_PASSWORD: xxx
  DB_NAME: mes_workshop
```

**Q5：密码含 `@`、`:`、`/` 等特殊字符会连不上吗？**

不会。`env.js` 与 `db-setup.js` 均会对用户名/密码做 URL 百分号编码。
