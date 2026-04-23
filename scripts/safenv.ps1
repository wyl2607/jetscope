# JetScope Environment Self-Discovery (Windows/PowerShell version)
# Usage: . .\scripts\safenv.ps1

if ($env:JETSCOPE_ROOT -and (Test-Path $env:JETSCOPE_ROOT)) {
    $JETSCOPE_ROOT = $env:JETSCOPE_ROOT
}
elseif (Test-Path "$env:USERPROFILE\projects\jetscope") {
    $JETSCOPE_ROOT = "$env:USERPROFILE\projects\jetscope"
}
elseif (Test-Path "$env:USERPROFILE\jetscope") {
    $JETSCOPE_ROOT = "$env:USERPROFILE\jetscope"
}
else {
    $current = $PWD.Path
    while ($current -ne (Split-Path $current -Parent)) {
        if (Test-Path "$current\.jetscope-root") {
            $JETSCOPE_ROOT = $current
            break
        }
        $current = Split-Path $current -Parent
    }
}

if ($JETSCOPE_ROOT -and (Test-Path $JETSCOPE_ROOT)) {
    $env:JETSCOPE_ROOT = $JETSCOPE_ROOT
    $env:JETSCOPE_WEB = "$JETSCOPE_ROOT\apps\web"
    $env:JETSCOPE_API = "$JETSCOPE_ROOT\apps\api"
    $env:JETSCOPE_SCRIPTS = "$JETSCOPE_ROOT\scripts"
    Write-Host "✅ JETSCOPE_ROOT=$JETSCOPE_ROOT"
} else {
    Write-Host "❌ JetScope 项目未找到"
    Write-Host "提示: 设置 JETSCOPE_ROOT 环境变量或创建 .jetscope-root marker 文件"
}
