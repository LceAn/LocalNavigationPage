#!/usr/bin/env bash
# install.sh — Local Navigation Page 一键安装脚本（Linux / macOS）
#
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/LceAn/LocalNavigationPage/main/install.sh | bash
#   或下载后: bash install.sh
#
# 选项（环境变量）：
#   INSTALL_PORT=8080       指定端口
#   INSTALL_DIR=~/.lnp      指定安装目录
#   INSTALL_MODE=online     online（git clone）| offline（本地包）
#   OFFLINE_PACKAGE=./lnp.tar.gz  离线包路径

set -euo pipefail

# ================= 配置 =================
APP_NAME="Local Navigation Page"
APP_ID="local-navigation-page"
REPO_URL="https://github.com/LceAn/LocalNavigationPage.git"
PORT="${INSTALL_PORT:-8080}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.lnp}"
MODE="${INSTALL_MODE:-online}"
OFFLINE_PKG="${OFFLINE_PACKAGE:-}"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

msg()  { echo -e "${GREEN}✅ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $1${RESET}"; }
err()  { echo -e "${RED}❌ $1${RESET}"; exit 1; }
info() { echo -e "${CYAN}ℹ️  $1${RESET}"; }

# ================= 检测 =================
OS="$(uname -s)"
ARCH="$(uname -m)"

echo ""
echo -e "${CYAN}📦 $APP_NAME 一键安装${RESET}"
echo -e "   系统: $OS ($ARCH)"
echo -e "   模式: $MODE"
echo -e "   端口: $PORT"
echo -e "   目录: $INSTALL_DIR"
echo ""

# ================= 前置检查 =================
check_node() {
    if ! command -v node &>/dev/null; then
        err "未找到 Node.js。请先安装 Node.js 18+：
  https://nodejs.org/
  或: brew install node / sudo apt install nodejs"
    fi
    local version=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$version" -lt 18 ]; then
        err "Node.js 版本过低（v$version < 18）。请升级。"
    fi
    msg "Node.js $(node --version)"
}

check_git() {
    if [ "$MODE" = "online" ] && ! command -v git &>/dev/null; then
        err "在线安装需要 git。请先安装：
  sudo apt install git / brew install git"
    fi
}

# ================= 安装 =================
install_online() {
    info "在线安装（git clone）..."

    if [ -d "$INSTALL_DIR/.git" ]; then
        warn "目录已存在，拉取最新代码..."
        cd "$INSTALL_DIR"
        git pull origin main
    else
        mkdir -p "$INSTALL_DIR"
        git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    fi
    msg "代码已就绪"
}

install_offline() {
    info "离线安装（本地包）..."

    if [ -z "$OFFLINE_PKG" ]; then
        # 自动查找当前目录下的离线包
        for f in lnp.tar.gz lnp.zip local-navigation-page.tar.gz; do
            if [ -f "$f" ]; then
                OFFLINE_PKG="$f"
                break
            fi
        done
    fi

    if [ -z "$OFFLINE_PKG" ]; then
        err "未找到离线包。请设置 OFFLINE_PACKAGE=路径 指定离线包位置。"
    fi

    mkdir -p "$INSTALL_DIR"
    tar -xzf "$OFFLINE_PKG" -C "$INSTALL_DIR" --strip-components=1
    msg "离线包已解压"
}

# ================= 注册服务 =================
register_service() {
    cd "$INSTALL_DIR"
    node scripts/manage.mjs install --port "$PORT"
}

# ================= 主流程 =================
main() {
    check_node
    check_git

    if [ "$MODE" = "online" ]; then
        install_online
    else
        install_offline
    fi

    register_service

    echo ""
    msg "安装完成！"
    echo -e "   访问: ${CYAN}http://127.0.0.1:$PORT${RESET}"
    echo -e "   目录: $INSTALL_DIR"
    echo ""
    echo -e "${DIM}管理命令:${RESET}"
    echo -e "  node $INSTALL_DIR/scripts/manage.mjs status   # 状态"
    echo -e "  node $INSTALL_DIR/scripts/manage.mjs stop     # 停止"
    echo -e "  node $INSTALL_DIR/scripts/manage.mjs update   # 更新"
    echo -e "  node $INSTALL_DIR/scripts/manage.mjs uninstall # 卸载"
    echo ""
}

main "$@"
