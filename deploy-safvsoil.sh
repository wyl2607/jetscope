#!/bin/bash
# SAFvsOil SQLite + FastAPI 自动化部署脚本
# 在 mac-mini (192.168.1.100) 上执行此脚本
# 用法: bash deploy-safvsoil.sh [dev|prod|pm2]

set -e  # 任何错误停止脚本

PROJECT_ROOT="/Users/yumei/SAFvsOil"
API_DIR="$PROJECT_ROOT/apps/api"
DB_PATH="/opt/safvsoil/data/market.db"
VENV_DIR="$API_DIR/venv"
DEPLOY_MODE="${1:-prod}"  # 默认生产模式
LOG_FILE="$PROJECT_ROOT/deploy-$(date +%Y%m%d_%H%M%S).log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

# ============================================================================
# 步骤 1: 验证环境
# ============================================================================

log "========== 部署步骤 1: 验证环境 =========="

# 检查 Python 版本
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
log "Python 版本: $PYTHON_VERSION"

# 检查是否为 3.11+
MIN_VERSION="3.11"
if [ "$(printf '%s\n' "$MIN_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" = "$MIN_VERSION" ]; then
    log "✅ Python 版本检查通过 ($PYTHON_VERSION >= $MIN_VERSION)"
else
    error "❌ 需要 Python 3.11+ (当前: $PYTHON_VERSION)"
fi

# 检查项目目录
[ -d "$PROJECT_ROOT" ] || error "项目目录不存在: $PROJECT_ROOT"
[ -d "$API_DIR" ] || error "API 目录不存在: $API_DIR"
log "✅ 项目目录验证通过"

# ============================================================================
# 步骤 2: 创建/更新虚拟环境
# ============================================================================

log "========== 部署步骤 2: 虚拟环境设置 =========="

if [ -d "$VENV_DIR" ]; then
    log "虚拟环境已存在，跳过创建"
else
    log "创建虚拟环境: $VENV_DIR"
    python3 -m venv "$VENV_DIR" || error "❌ 虚拟环境创建失败"
fi

source "$VENV_DIR/bin/activate" || error "❌ 虚拟环境激活失败"
log "✅ 虚拟环境激活成功"

# ============================================================================
# 步骤 3: 安装依赖
# ============================================================================

log "========== 部署步骤 3: 安装依赖 =========="

log "升级 pip..."
pip install --upgrade pip setuptools wheel --quiet

log "安装项目依赖..."
cd "$API_DIR"
if pip install -r requirements.txt > /dev/null 2>&1; then
    log "✅ 依赖安装成功"
else
    error "❌ 依赖安装失败"
fi

# 验证关键包
log "验证关键依赖..."
for pkg in fastapi uvicorn sqlalchemy aiosqlite; do
    if pip show "$pkg" > /dev/null 2>&1; then
        version=$(pip show "$pkg" | grep Version | awk '{print $2}')
        log "  ✓ $pkg ($version)"
    else
        error "❌ 缺少必要包: $pkg"
    fi
done

# ============================================================================
# 步骤 4: 初始化数据库
# ============================================================================

log "========== 部署步骤 4: 初始化数据库 =========="

cd "$PROJECT_ROOT"
if python3 scripts/init-sqlite-db.py 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ 数据库初始化成功"
else
    error "❌ 数据库初始化失败"
fi

# 验证数据库
if [ -f "$DB_PATH" ]; then
    db_size=$(ls -lh "$DB_PATH" | awk '{print $5}')
    log "✅ 数据库文件已创建 ($db_size)"
else
    error "❌ 数据库文件不存在: $DB_PATH"
fi

# ============================================================================
# 步骤 5: 启动 FastAPI 服务
# ============================================================================

log "========== 部署步骤 5: 启动 FastAPI 服务 =========="

cd "$API_DIR"

case "$DEPLOY_MODE" in
    dev)
        log "🔧 启动开发模式 (hot-reload)..."
        exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
        ;;
    prod)
        log "🚀 启动生产模式 (4 workers)..."
        exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
        ;;
    pm2)
        log "📦 使用 PM2 启动..."
        
        # 检查 PM2
        if ! command -v pm2 &> /dev/null; then
            warn "PM2 未安装，尝试安装..."
            npm install -g pm2 || error "❌ PM2 安装失败"
        fi
        
        # 启动 PM2 应用
        pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4" \
            --name sqlite-api \
            --log "$PROJECT_ROOT/pm2-sqlite-api.log"
        pm2 save
        pm2 startup
        
        log "✅ PM2 应用已启动"
        pm2 status
        ;;
    *)
        error "❌ 未知的启动模式: $DEPLOY_MODE (支持: dev, prod, pm2)"
        ;;
esac
