<#
.SYNOPSIS
    MES 管理系统 - 前端后端接口切换脚本

.DESCRIPTION
    修改前端运行时配置文件 config.js 中的 API_BASE_URL，
    在 Node.js 后端与 PHP 后端之间切换，无需重新构建前端。
    同时更新 frontend/public/config.js 与已构建的 frontend/dist/config.js（若存在）。

.EXAMPLE
    .\switch-backend.ps1 -Backend php
    .\switch-backend.ps1 -Backend node
    .\switch-backend.ps1 -Backend php -PhpBaseUrl http://192.168.1.100:8080/api
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('node', 'php')]
    [string]$Backend,

    [string]$PhpBaseUrl = 'http://127.0.0.1:8080/api',

    [string]$NodeBaseUrl = '/api',

    [string]$FrontendDir = ''
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($FrontendDir)) {
    $FrontendDir = Join-Path $root 'frontend'
}

$baseUrl = if ($Backend -eq 'php') { $PhpBaseUrl } else { $NodeBaseUrl }

$targets = @(
    (Join-Path $FrontendDir 'public/config.js'),
    (Join-Path $FrontendDir 'dist/config.js')
) | Where-Object { Test-Path $_ }

if ($targets.Count -eq 0) {
    Write-Error "未找到 config.js：$FrontendDir"
    exit 1
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($file in $targets) {
    $content = [System.IO.File]::ReadAllText($file, $utf8)
    $updated = [regex]::Replace(
        $content,
        "(API_BASE_URL\s*:\s*)'[^']*'",
        "`$1'$baseUrl'"
    )
    if ($updated -eq $content) {
        Write-Warning "未匹配到 API_BASE_URL：$file"
        continue
    }
    [System.IO.File]::WriteAllText($file, $updated, $utf8)
    Write-Output "[$Backend] $baseUrl"
    Write-Output "  $file"
}

Write-Output 'DONE - 浏览器 Ctrl+F5 刷新后生效'
