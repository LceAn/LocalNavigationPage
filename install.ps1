# install.ps1 — Local Navigation Page 一键安装脚本（Windows PowerShell）
#
# 用法：
#   irm https://raw.githubusercontent.com/LceAn/LocalNavigationPage/main/install.ps1 | iex
#   或下载后: powershell -ExecutionPolicy Bypass -File install.ps1
#
# 选项（参数）：
#   -Port 8080              指定端口
#   -InstallDir "$env:USERPROFILE\.lnp"  指定安装目录
#   -Mode online            online（git clone）| offline（本地包）
#   -OfflinePackage "C:\lnp.zip"         离线包路径

param(
    [int]$Port = 8080,
    [string]$InstallDir = "$env:USERPROFILE\.lnp",
    [ValidateSet('online', 'offline')]
    [string]$Mode = 'online',
    [string]$OfflinePackage = ''
)

$ErrorActionPreference = 'Stop'
$appName = 'Local Navigation Page'
$repoUrl = 'https://github.com/LceAn/LocalNavigationPage.git'

function Msg($text) { Write-Host "  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "  $text" -ForegroundColor Red; exit 1 }
function Info($text) { Write-Host "  $text" -ForegroundColor Cyan }

Write-Host ""
Write-Host "  $appName 一键安装" -ForegroundColor Cyan
Write-Host "  系统: Windows ($env:PROCESSOR_ARCHITECTURE)"
Write-Host "  模式: $Mode"
Write-Host "  端口: $Port"
Write-Host "  目录: $InstallDir"
Write-Host ""

# ================= 前置检查 =================
function Check-Node {
    try {
        $version = (node --version 2>$null) -replace 'v', ''
        if (-not $version) { throw }
        $major = [int]($version -split '\.')[0]
        if ($major -lt 18) {
            Fail "Node.js 版本过低（v$version < 18）。请升级: https://nodejs.org/"
        }
        Msg "Node.js v$version"
    } catch {
        Fail "未找到 Node.js。请先安装: https://nodejs.org/"
    }
}

function Check-Git {
    if ($Mode -eq 'online') {
        try { git --version | Out-Null } catch {
            Fail "在线安装需要 Git。请先安装: https://git-scm.com/"
        }
    }
}

# ================= 安装 =================
function Install-Online {
    Info "在线安装（git clone）..."

    if (Test-Path "$InstallDir\.git") {
        Warn "目录已存在，拉取最新代码..."
        Set-Location $InstallDir
        git pull origin main
    } else {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        git clone --depth 1 $repoUrl $InstallDir
    }
    Msg "代码已就绪"
}

function Install-Offline {
    Info "离线安装（本地包）..."

    if (-not $OfflinePackage) {
        # 自动查找
        $candidates = @(
            Join-Path $PWD 'lnp.zip',
            Join-Path $PWD 'local-navigation-page.zip',
            Join-Path $PWD 'lnp.tar.gz'
        ) | Where-Object { Test-Path $_ }

        if ($candidates) {
            $OfflinePackage = $candidates[0]
        } else {
            Fail "未找到离线包。请用 -OfflinePackage 参数指定。"
        }
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $ext = [System.IO.Path]::GetExtension($OfflinePackage)

    if ($ext -eq '.zip') {
        Expand-Archive -Path $OfflinePackage -DestinationPath $InstallDir -Force
        # 如果解压后有一层子目录，把内容移上来
        $subDirs = Get-ChildItem $InstallDir -Directory
        if ($subDirs.Count -eq 1 -and (Test-Path "$($subDirs[0].FullName)\HTML")) {
            Get-ChildItem $subDirs[0].FullName | Move-Item -Destination $InstallDir
            Remove-Item $subDirs[0].FullName -Recurse
        }
    } else {
        Fail "不支持的离线包格式（$ext）。请使用 .zip 格式。"
    }
    Msg "离线包已解压"
}

# ================= 防火墙 =================
function Add-FirewallRule {
    $ruleName = $appName
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        try {
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
            Msg "防火墙规则已添加（端口 $Port）"
        } catch {
            Warn "无法添加防火墙规则（可能需要管理员权限）"
            Warn "如需局域网访问，请手动放行端口 $Port"
        }
    }
}

# ================= 注册服务 =================
function Register-Service {
    Set-Location $InstallDir
    node scripts/manage.mjs install --port $Port
    Add-FirewallRule
}

# ================= 主流程 =================
Check-Node
Check-Git

if ($Mode -eq 'online') { Install-Online } else { Install-Offline }

Register-Service

Write-Host ""
Msg "安装完成！"
Info "访问: http://127.0.0.1:$Port"
Write-Host "  目录: $InstallDir" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  管理命令:" -ForegroundColor DarkGray
Write-Host "    node $InstallDir\scripts\manage.mjs status    # 状态" -ForegroundColor DarkGray
Write-Host "    node $InstallDir\scripts\manage.mjs stop      # 停止" -ForegroundColor DarkGray
Write-Host "    node $InstallDir\scripts\manage.mjs update    # 更新" -ForegroundColor DarkGray
Write-Host "    node $InstallDir\scripts\manage.mjs uninstall # 卸载" -ForegroundColor DarkGray
Write-Host ""
