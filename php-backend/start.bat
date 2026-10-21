@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  MES 管理系统 - PHP 后端
echo  http://localhost:8080/api/health
echo ============================================

php -S 0.0.0.0:8080 -t public public/index.php
