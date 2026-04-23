#!/bin/bash
# SAFvSoil Environment Self-Discovery (Windows/PowerShell version)
# Usage: . .\scripts\safenv.ps1

# 1. 如果已设置 SAFVSOIL_ROOT，直接使用
if ($env:SAFVSOIL_ROOT -and (Test-Path $env:SAFVSOIL_ROOT)) {
    $SAFVSOIL_ROOT = $env:SAFVSOIL_ROOT
}
# 2. 检查常见路径
elseif (Test-Path "$env:USERPROFILE\SAFvsOil") {
    $SAFVSOIL_ROOT = "$env:USERPROFILE\SAFvsOil"
}
elseif (Test-Path "$env:USERPROFILE\safvsoil") {
    $SAFVSOIL_ROOT = "$env:USERPROFILE\safvsoil"
}
# 3. 通过 marker 文件搜索（向上递归）
else {
    $current = $PWD.Path
    while ($current -ne (Split-Path $current -Parent)) {
        if (Test-Path "$current\.safvsoil-root") {
            $SAFVSOIL_ROOT = $current
            break
        }
        $current = Split-Path $current -Parent
    }
}

# 验证并导出子路径
if ($SAFVSOIL_ROOT -and (Test-Path $SAFVSOIL_ROOT)) {
    $env:SAFVSOIL_ROOT = $SAFVSOIL_ROOT
    $env:SAFVSOIL_WEB = "$SAFVSOIL_ROOT\apps\web"
    $env:SAFVSOIL_API = "$SAFVSOIL_ROOT\apps\api"
    $env:SAFVSOIL_SCRIPTS = "$SAFVSOIL_ROOT\scripts"
    Write-Host "✅ SAFVSOIL_ROOT=$SAFVSOIL_ROOT"
} else {
    Write-Host "❌ SAFvSoil 项目未找到"
    Write-Host "提示: 设置 SAFVSOIL_ROOT 环境变量或创建 .safvsoil-root marker 文件"
}
