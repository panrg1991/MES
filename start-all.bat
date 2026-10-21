@echo off
chcp 65001 >nul
title MES 一键启动（开发/演示）

REM =============================================================================
REM MES 车间制造执行系统 - 本地一键启动
REM -----------------------------------------------------------------------------
REM 作用：自动检查依赖 → 分别打开「后端 3000」「前端 5173」两个窗口
REM 适用：开发联调、单机演示；生产部署请按 DEPLOYMENT.md 用 PM2 / Nginx
REM 停止：直接关闭两个命令行窗口（或 Ctrl+C）
REM =============================================================================

set "ROOT=%~dp0"

if not exist "%ROOT%backend\node_modules" (
  echo [1/2] 未检测到后端依赖，正在安装...
  pushd "%ROOT%backend" && call npm install && popd
) else (
  echo [1/2] 后端依赖已就绪
)

if not exist "%ROOT%frontend\node_modules" (
  echo [2/2] 未检测到前端依赖，正在安装...
  pushd "%ROOT%frontend" && call npm install && popd
) else (
  echo [2/2] 前端依赖已就绪
)

echo.
echo 启动后端 http://127.0.0.1:3000 与前端 http://localhost:5173 ...
echo 首次运行请先在后端执行：npm run db:setup:sqlite
echo.

start "MES 后端 :3000" /D "%ROOT%backend" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul
start "MES 前端 :5173" /D "%ROOT%frontend" cmd /k "npm run dev"

echo 已分别打开后端/前端窗口，关闭窗口即停止服务。
