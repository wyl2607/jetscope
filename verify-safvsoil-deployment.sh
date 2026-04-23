#!/bin/bash
# SAFvsOil 部署验证脚本
# 验证所有 7 项部署检查
# 用法: bash verify-safvsoil-deployment.sh [host]

set -e

HOST="${1:-192.168.1.100}"
PORT="8000"
API_URL="http://$HOST:$PORT"
DB_PATH="/opt/safvsoil/data/market.db"
PROJECT_ROOT="/Users/yumei/SAFvsOil"

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check_count=0
pass_count=0

log_check() {
    check_count=$((check_count + 1))
    echo -e "${BLUE}[检查 $check_count]${NC} $1"
}

log_pass() {
    pass_count=$((pass_count + 1))
    echo -e "${GREEN}✅ 通过${NC} $1"
}

log_fail() {
    echo -e "${RED}❌ 失败${NC} $1"
}

log_info() {
    echo -e "${YELLOW}ℹ️${NC} $1"
}

echo -e "${BLUE}========== SAFvsOil 部署验证 ==========${NC}\n"

# ============================================================================
# 检查 1: Python 版本
# ============================================================================

log_check "Python 版本验证"
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
if [[ "$PYTHON_VERSION" > "3.10" ]]; then
    log_pass "Python $PYTHON_VERSION >= 3.11"
else
    log_fail "Python $PYTHON_VERSION < 3.11"
fi

# ============================================================================
# 检查 2: 依赖验证
# ============================================================================

log_check "依赖包验证"

cd "$PROJECT_ROOT/apps/api"
source venv/bin/activate 2>/dev/null || log_info "虚拟环境未激活，跳过依赖检查"

packages=("fastapi" "uvicorn" "sqlalchemy" "aiosqlite")
all_installed=true

for pkg in "${packages[@]}"; do
    if pip show "$pkg" > /dev/null 2>&1; then
        version=$(pip show "$pkg" | grep Version | awk '{print $2}')
        log_info "  $pkg: $version"
    else
        log_fail "$pkg 未安装"
        all_installed=false
    fi
done

if [ "$all_installed" = true ]; then
    log_pass "所有依赖已安装"
else
    log_fail "某些依赖缺失"
fi

# ============================================================================
# 检查 3: 数据库验证
# ============================================================================

log_check "数据库初始化验证"

if [ -f "$DB_PATH" ]; then
    db_size=$(ls -lh "$DB_PATH" | awk '{print $5}')
    log_info "数据库文件: $DB_PATH ($db_size)"
    
    # 检查表
    tables=$(sqlite3 "$DB_PATH" ".tables" 2>/dev/null)
    if [[ "$tables" == *"market_prices"* ]] && [[ "$tables" == *"user_scenarios"* ]]; then
        log_pass "数据库表已创建: $tables"
    else
        log_fail "数据库表不完整"
    fi
    
    # 完整性检查
    integrity=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null)
    if [ "$integrity" = "ok" ]; then
        log_pass "数据库完整性检查通过"
    else
        log_fail "数据库完整性检查失败: $integrity"
    fi
else
    log_fail "数据库文件不存在: $DB_PATH"
fi

# ============================================================================
# 检查 4: FastAPI 启动验证
# ============================================================================

log_check "FastAPI 服务启动验证"

if nc -z "$HOST" "$PORT" 2>/dev/null; then
    log_info "端口 $PORT 已开放"
else
    log_info "端口 $PORT 未响应 (可能服务未启动)"
fi

# ============================================================================
# 检查 5: 健康检查端点
# ============================================================================

log_check "FastAPI 健康检查 ($API_URL/health)"

response=$(curl -s -w "\n%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    log_info "响应状态: $http_code"
    log_info "响应体: $body"
    log_pass "健康检查通过"
else
    log_info "响应状态: $http_code (预期: 200)"
    log_fail "服务未响应或返回错误"
fi

# ============================================================================
# 检查 6: 市场价格 API 端点
# ============================================================================

log_check "市场价格 API 端点 ($API_URL/v1/sqlite/markets/latest)"

response=$(curl -s -w "\n%{http_code}" "$API_URL/v1/sqlite/markets/latest" 2>/dev/null || echo "000")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    log_info "响应状态: $http_code"
    log_info "响应体: $body"
    log_pass "市场价格 API 可访问"
else
    log_info "响应状态: $http_code"
    log_fail "市场价格 API 无法访问"
fi

# ============================================================================
# 检查 7: 备份 Cron 配置
# ============================================================================

log_check "备份 Cron 配置验证"

if crontab -l 2>/dev/null | grep -q "backup-db-cron"; then
    log_info "Cron 任务:"
    crontab -l | grep backup-db-cron | while read -r line; do
        log_info "  $line"
    done
    log_pass "备份 Cron 已配置"
else
    log_info "备份 Cron 未配置"
    log_fail "请运行: (crontab -l 2>/dev/null; echo '0 */6 * * * /Users/yumei/SAFvsOil/scripts/backup-db-cron.sh') | crontab -"
fi

# ============================================================================
# 总结
# ============================================================================

echo ""
echo -e "${BLUE}========== 验证总结 ==========${NC}"
echo -e "完成: ${GREEN}$check_count${NC} / $pass_count 检查通过"

if [ $pass_count -eq $check_count ]; then
    echo -e "\n${GREEN}🎉 所有检查通过！部署成功！${NC}"
    echo -e "${BLUE}部署状态: 🟢 READY FOR PRODUCTION${NC}\n"
    exit 0
else
    echo -e "\n${RED}⚠️  有 $((check_count - pass_count)) 项检查失败${NC}"
    echo -e "请查看上面的失败信息并修复\n"
    exit 1
fi
