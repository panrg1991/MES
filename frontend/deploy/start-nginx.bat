@echo off
rem ============================================================================
rem  MES Frontend - Windows one-click Nginx launcher (entry point)
rem
rem  This .bat is intentionally a THIN WRAPPER: Windows cmd is fragile when a
rem  config file contains characters like  >  |  &  (our nginx.conf.example does,
rem  e.g. "gzip (> 10KB assets)"), so the real generation / validation / startup
rem  logic lives in start-nginx.ps1 (PowerShell ships with every supported
rem  Windows). Both files are ASCII-only to avoid cmd/PS 5.1 encoding issues.
rem
rem  Usage:
rem    deploy\start-nginx.bat                  (nginx from PATH or NGINX_HOME)
rem    deploy\start-nginx.bat D:\nginx-1.25.4  (explicit nginx directory)
rem
rem  See README.md section "7.2 Windows 内网" for the Chinese documentation.
rem ============================================================================

setlocal EnableExtensions
chcp 65001 >nul 2>&1

if not exist "%~dp0start-nginx.ps1" (
  echo [MES][ERROR] "%~dp0start-nginx.ps1" is missing. Keep both files together.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-nginx.ps1" %*
set "RC=%ERRORLEVEL%"

endlocal & exit /b %RC%
