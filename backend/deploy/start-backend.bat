@echo off
chcp 65001 >nul
title MES 后端服务（生产模式）

REM =============================================================================
REM MES 后端 - Windows 前台启动脚本（生产模式）
REM -----------------------------------------------------------------------------
REM 前置条件（首次部署，在 backend 目录执行）：
REM   1) npm ci --omit=dev
REM   2) copy .env.example .env.production   并填写数据库/密钥/CORS_ORIGIN
REM   3) npm run db:setup                     生成当前 DB_TYPE 对应的 Prisma Client
REM   4) npm run db:setup:sqlite              或 db:setup:mysql（建表 + 种子数据）
REM
REM 常驻运行建议改用 PM2（见 ecosystem.config.js）：
REM   pm2 start ecosystem.config.js && pm2 save
REM =============================================================================

cd /d "%~dp0.."

if not exist ".env.production" (
  echo [错误] 未找到 .env.production，请先执行：
  echo         copy .env.example .env.production
  echo         并按实际情况填写数据库、JWT 密钥与 CORS_ORIGIN
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [错误] 未安装依赖，请先执行：npm ci --omit=dev
  pause
  exit /b 1
)

set NODE_ENV=production
echo 正在启动 MES 后端（生产模式）...
node src/server.js

echo.
echo 服务已退出（退出码 %ERRORLEVEL%），请检查上方日志。
pause
