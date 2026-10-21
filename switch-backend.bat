@echo off
chcp 65001 >nul
setlocal
if "%~1"=="" (
  echo 用法: switch-backend.bat node^|php [phpBaseUrl]
  echo   例: switch-backend.bat php
  echo   例: switch-backend.bat node
  exit /b 1
)
if "%~2"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch-backend.ps1" -Backend %~1
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch-backend.ps1" -Backend %~1 -PhpBaseUrl %~2
)
endlocal
