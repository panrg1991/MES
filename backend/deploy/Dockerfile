# =============================================================================
# MES 后端镜像（Node 22 + Express + Prisma，多阶段构建）
# -----------------------------------------------------------------------------
# 构建（在 backend/ 目录下执行；context 必须是 backend/，因为 Dockerfile 在 deploy/ 子目录）：
#   docker build -f deploy/Dockerfile -t mes-backend:1.0.0 .
#   # 指定数据库类型生成对应的 Prisma Client（默认 sqlite）：
#   docker build -f deploy/Dockerfile --build-arg DB_TYPE=mysql -t mes-backend:mysql .
#
# 构建上下文排除文件（加快构建）：本仓库把 .dockerignore 放在 deploy/ 目录，
#   使用 BuildKit 的 --ignore-file 指定：
#   docker buildx build --ignore-file deploy/.dockerignore -f deploy/Dockerfile -t mes-backend:1.0.0 .
#   （docker-compose 方式见 docker-compose.yml，已配置好 context/dockerfile）
#   说明：本 Dockerfile 只显式 COPY 必要目录，即使 .dockerignore 未生效也不会把
#         node_modules / *.db / *.log 打进镜像。
#
# 运行（SQLite 演示，数据目录挂载出来持久化）：
#   docker run -d --name mes-backend -p 3000:3000 \
#     -e NODE_ENV=production -e JWT_SECRET=xxx -e JWT_REFRESH_SECRET=yyy \
#     -e DB_TYPE=sqlite -e DB_PATH=/data/prod.db -v mes-data:/data mes-backend:1.0.0
#
# 运行（MySQL）：
#   docker run -d --name mes-backend -p 3000:3000 \
#     -e NODE_ENV=production -e JWT_SECRET=xxx -e JWT_REFRESH_SECRET=yyy \
#     -e DB_TYPE=mysql -e DB_HOST=mysql-host -e DB_PORT=3306 \
#     -e DB_USER=mes_user -e DB_PASSWORD=mes_password -e DB_NAME=mes_workshop \
#     mes-backend:mysql
# =============================================================================

# ---------------------------- 阶段 1：依赖安装 + Prisma Client 生成 ----------------------------
FROM node:22-slim AS builder

# Prisma 引擎依赖 openssl；ca-certificates 用于拉取引擎校验
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用层缓存：只要 package*.json 不变就复用）
COPY package.json package-lock.json ./
RUN npm ci

# 生成 Prisma Client（DB_TYPE 决定 provider：sqlite / mysql）
# 输出目录：prisma/generated/<类型>，运行时由 src/config/database.js 按 DB_TYPE 加载
# 注意：必须与运行时 -e DB_TYPE 保持一致，否则启动时找不到对应 Client
ARG DB_TYPE=sqlite
COPY prisma ./prisma
COPY scripts ./scripts
RUN node scripts/db-setup.js ${DB_TYPE}

# 复制业务代码
COPY src ./src

# ---------------------------- 阶段 2：运行时 ----------------------------
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 仅安装生产依赖（devDependencies 中的 prisma CLI / nodemon / eslint 不进镜像）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 运行时依赖（prisma/generated/<类型> 随下方 `COPY --from=builder /app/prisma` 一并带入）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# 业务代码 + Prisma schema（运行时用于 prisma db push / migrate 等运维命令时可挂载覆盖）
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma ./prisma

# PM2 配置（可选：容器内用 pm2-runtime 时使用，默认直接用 node 启动）
COPY ecosystem.config.js ./

# 数据目录（SQLite 场景请把 DB_PATH 指向 /data/xxx.db 并挂载该卷）
RUN mkdir -p /data /app/logs /app/backups

EXPOSE 3000

# 健康检查：与后端 /api/health 一致
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
