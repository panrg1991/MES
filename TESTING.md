# MES 车间制造执行系统 · 测试与持续集成说明书

> 本文说明**前后端两套测试体系的运行方式、覆盖重点与编写约定**，以及 CI 流水线的构成。
> 所有命令、目录、脚本均与仓库实际文件一致（`backend/jest.config.js`、`frontend/vitest.config.ts`、`.github/workflows/ci.yml`）。

---

## 目录

- [1. 测试体系总览](#1-测试体系总览)
- [2. 后端测试](#2-后端测试)
- [3. 前端测试](#3-前端测试)
- [4. 测试数据库的隔离机制](#4-测试数据库的隔离机制)
- [5. 持续集成（CI）](#5-持续集成ci)
- [6. 编写新测试的约定](#6-编写新测试的约定)
- [7. 常见问题](#7-常见问题)

---

## 1. 测试体系总览

| 端 | 框架 | 环境 | 用例位置 | 命令 |
|----|------|------|----------|------|
| 后端 | Jest 29 + Supertest 7 | Node | `backend/tests/` | `npm test` |
| 前端 | Vitest 1 + Testing Library + jsdom | jsdom | `src/**/*.test.{ts,tsx}` | `npm test` |

两端**各自独立**运行，互不依赖；后端测试自带 SQLite 数据库，无需任何外部服务。

---

## 2. 后端测试

### 2.1 目录结构

```
backend/tests/
├── setup-env.js           # 注入测试环境变量（最先执行）
├── setup-after-env.js     # 每个测试文件结束释放 Prisma 连接
├── global-setup.js        # 全局准备：生成 Client → 重建 test.db → 建表 → 种子数据
├── global-teardown.js     # 全局清理：删除 test.db
├── helpers/
│   └── api.js             # supertest 实例与登录封装
├── unit/                  # 单元测试（不访问数据库/网络）
│   ├── env.test.js            # ★ 数据库动态配置解析（核心改造点）
│   ├── jwt.test.js            # Token 签发/验证与密钥隔离
│   ├── zod-helpers.test.js    # 查询参数空值兼容与分页边界
│   └── response.test.js       # 统一响应封装契约
└── integration/           # 集成测试（走真实 HTTP 与数据库）
    ├── health.test.js         # 健康检查与数据库状态暴露
    ├── auth.test.js           # 登录、鉴权、RBAC 权限校验、令牌刷新
    └── database.test.js       # 动态配置生效性、表结构、种子数据完整性
```

### 2.2 运行方式

```bash
cd backend

npm test                  # 全部测试
npm run test:unit         # 仅单元测试（快，约 2 秒）
npm run test:integration  # 仅集成测试
npm run test:coverage     # 生成覆盖率报告（coverage/）

# 排查失败用例时保留测试库
KEEP_TEST_DB=1 npm test           # Linux/macOS
$env:KEEP_TEST_DB=1; npm test     # Windows PowerShell
```

### 2.3 覆盖重点

| 测试文件 | 锁定的能力 |
|----------|-----------|
| `unit/env.test.js` | `DB_TYPE` 显式声明/自动推断/非法值回退；MySQL 分散参数拼装；**密码特殊字符 URL 编码**；`DATABASE_URL` 与 `DB_TYPE` 冲突时的取舍 |
| `unit/jwt.test.js` | 双 Token 往返、篡改检测、过期检测、**Access 与 Refresh 密钥隔离** |
| `unit/zod-helpers.test.js` | 空串/`null`/`'null'` 视为未传；分页上限 500；布尔不误判 |
| `unit/response.test.js` | `{code,data,message}` 结构、各语义状态码、`errors` 字段仅在非空时输出 |
| `integration/health.test.js` | `/api/health` 返回 `database.type/connected/latencyMs`；免认证可访问 |
| `integration/auth.test.js` | 登录成功/失败、**响应不含密码哈希**、无/伪造 Token 被拒、refresh 换发新 Token、Access 不能当 Refresh 用 |
| `integration/database.test.js` | 运行时确实加载了 SQLite Client（用 `sqlite_master` 求证）、**两种 Client 均已预生成**、27 张表齐备、种子数据可支撑 RBAC |

### 2.4 关键设计说明

- **测试库固定为 `backend/prisma/test.db`**，与开发库 `dev.db`、生产库 `prod.db` 完全隔离；
- `globalSetup` 在测试开始前重建测试库，因此**测试结果不受本地数据影响，可重复执行**；
- 首次运行若缺少派生 schema 或 Prisma Client，会自动调用 `scripts/db-setup.js` 补齐，
  因此**克隆仓库后直接 `npm test` 即可跑通**；
- `maxWorkers: 1` 串行执行：SQLite 单写者特性下并发会触发写锁冲突。

---

## 3. 前端测试

### 3.1 目录结构

```
frontend/
├── vitest.config.ts               # Vitest 配置（独立于 vite.config.ts）
└── src/
    ├── test/setup.ts              # 注册 jest-dom 断言 + 用例间清理
    ├── utils/
    │   ├── format.test.ts         # 日期/数字/百分比格式化与空值兜底
    │   ├── constants.test.ts      # 状态机自洽性与枚举映射完整性
    │   └── download.test.ts       # 导出文件名解析、兜底命名、异常响应处理
    ├── stores/
    │   └── authStore.test.ts      # 登录态写入/清理、权限判定
    └── components/common/
        └── WarningTag.test.tsx    # 组件测试示例（Testing Library 链路）
```

### 3.2 运行方式

```bash
cd frontend

npm test                  # 单次运行全部测试
npm run test:watch        # 监听模式（开发时使用）
npm run test:coverage     # 生成覆盖率报告（coverage/）
```

### 3.3 覆盖重点

| 测试文件 | 锁定的能力 |
|----------|-----------|
| `format.test.ts` | 空值统一显示 `-`、千分位、百分比、**进度除零保护**、未知状态兜底 |
| `constants.test.ts` | 工单/排程**状态机目标合法且终态不可再流转**、映射表覆盖全部枚举、甘特图配色格式 |
| `download.test.ts` | `Content-Disposition` 中文/编码/普通三种解析、兜底文件名、**JSON 响应时给出可读报错** |
| `authStore.test.ts` | store 与 `localStorage` **写入/清理对称性**、权限判定、部分更新不串字段 |
| `WarningTag.test.tsx` | 预警文案与颜色取自单一数据源、未知等级不崩栈 |

### 3.4 关键设计说明

- `vitest.config.ts` 独立于 `vite.config.ts`，**不污染生产构建配置**；
- 复用与构建一致的 `@` 别名，测试导入路径与源码写法保持一致；
- 不使用全局注入（`globals: false`），测试文件显式 `import { describe, it, expect } from 'vitest'`，
  避免为 `tsc -b` 额外维护 global 类型声明；
- 测试文件位于 `src/` 下，会被 `npm run build` 的 `tsc -b` **一并做类型检查**，
  因此测试代码类型必须正确（CI 的构建步骤会拦住类型错误）；
- 依赖浏览器 API 时在 `src/test/setup.ts` 补齐最小实现（如 `URL.createObjectURL`、`window.matchMedia`），
  避免各测试文件重复打桩。

---

## 4. 测试数据库的隔离机制

| 场景 | 数据库 | 来源 |
|------|--------|------|
| 开发调试 | `prisma/dev.db` | `npm run db:setup:sqlite` |
| 生产运行 | `prisma/prod.db` 或 MySQL | `.env.production` 配置 |
| **自动化测试** | **`prisma/test.db`** | `tests/global-setup.js` 每次重建 |

隔离由三层保证：

1. `tests/setup-env.js` 在模块加载前写入 `DATABASE_URL=file:./test.db`；
2. `src/config/env.js` 中 `dotenv` 不覆盖已存在的环境变量，故测试值优先级最高；
3. `globalTeardown` 在测试结束后删除 `test.db`（含 `-wal`/`-shm`）。

> 因此**运行测试永远不会改动开发或生产数据**。

---

## 5. 持续集成（CI）

配置文件：`.github/workflows/ci.yml`（GitHub Actions）

**触发条件**：推送到 `main`/`master`/`develop`、所有 Pull Request、手工触发。

两个 Job **并行执行**，与「前后端双代码库」的交付形态一致：

```
backend（ubuntu-latest, Node 20）
  ├─ npm ci
  ├─ npm run db:setup:all     生成 SQLite + MySQL 两套 Prisma Client
  ├─ npm run lint             ESLint
  └─ npm test                 单元 + 集成测试（SQLite，无需外部服务）

frontend（ubuntu-latest, Node 20）
  ├─ npm ci
  ├─ npm run lint             ESLint（max-warnings 0）
  ├─ npm run build            tsc -b && vite build（含类型检查）
  └─ npm test                 Vitest（jsdom）
```

**为什么 CI 使用 SQLite**：零外部依赖、启动快、结果稳定。
MySQL 侧的关键产物（Prisma Client）由 `db:setup:all` 一并生成，
`integration/database.test.js` 会断言「双 Client 预生成」，从而在 CI 中守护动态切换能力。

---

## 6. 编写新测试的约定

1. **文件命名**：后端 `tests/{unit,integration}/<模块>.test.js`；前端与源码同目录 `<模块>.test.ts(x)`。
2. **测试语言**：用例描述使用中文，与项目文档风格一致。
3. **断言聚焦行为**：断言对外可见的结果（HTTP 状态码、响应结构、返回值），不耦合内部实现。
4. **不依赖执行顺序**：每个用例独立可重复，需要前置数据时在 `beforeEach` 内构造。
5. **数据库用例**：集成测试直接使用 `tests/global-setup.js` 建好的测试库，不要另行连接其他库。
6. **新增枚举或状态**：若修改了 `src/utils/constants.ts` 的状态机，`constants.test.ts` 会自动校验自洽性；
   若新增了数据库表，需同步更新 `tests/integration/database.test.js` 中的表数量与抽查清单。

---

## 7. 常见问题

**Q1：`npm test` 报「尚未生成 xxx 对应的 Prisma Client」？**

执行 `npm run db:setup:all` 生成两套 Client。CI 中已包含该步骤。

**Q2：后端测试卡住不退出？**

`tests/setup-after-env.js` 已统一 `$disconnect`。若自定义测试直接 new PrismaClient，请自行断开连接。

**Q3：测试库想保留下来人工排查？**

```bash
KEEP_TEST_DB=1 npm test        # Linux/macOS
$env:KEEP_TEST_DB=1; npm test  # Windows PowerShell
```

之后可用 `npx prisma studio` 连接 `prisma/test.db` 查看（需在 `.env` 临时指向该文件）。

**Q4：前端测试提示 `matchMedia is not a function`？**

antd 部分组件依赖 `window.matchMedia`。若新增此类组件测试，在 `src/test/setup.ts` 中补充对应的 polyfill。

**Q5：Windows 下 `npm test` 报 EPERM / 依赖目录被占用？**

先停止正在运行的后端服务或 Vite 开发服务器（它们会占用 `node_modules` 内的文件），再重试。
