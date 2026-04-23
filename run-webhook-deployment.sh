#!/bin/bash

################################################################################
# Webhook 部署执行脚本 - 完整自动化
# 在 coco (Mac-mini) 上运行此脚本以一键完成部署
#
# 使用: bash run-webhook-deployment.sh
################################################################################

set -e

# 颜色代码
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 配置
PROJECT_ROOT="${PROJECT_ROOT:-/Users/yumei/SAFvsOil}"
DEPLOY_METHOD="pm2"
WEBHOOK_PORT="3001"

# 计数器
STEP=0
PASSED=0
FAILED=0

# 日志输出
log_step() {
  ((STEP++))
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║ [Step $STEP] $1${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
}

log_success() {
  echo -e "${GREEN}✓ $1${NC}"
  ((PASSED++))
}

log_error() {
  echo -e "${RED}✗ $1${NC}"
  ((FAILED++))
}

log_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

log_info() {
  echo -e "${CYAN}ℹ $1${NC}"
}

# ============================================================================
# 执行步骤
# ============================================================================

# Step 1: 验证项目目录
step_verify_directory() {
  log_step "验证项目目录"
  
  if [[ ! -d "$PROJECT_ROOT" ]]; then
    log_error "项目目录不存在: $PROJECT_ROOT"
    return 1
  fi
  
  if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    log_error "package.json 不存在"
    return 1
  fi
  
  log_success "项目目录验证通过"
  log_info "项目路径: $PROJECT_ROOT"
}

# Step 2: 检查 Node.js
step_check_nodejs() {
  log_step "检查 Node.js 环境"
  
  if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装"
    return 1
  fi
  
  local node_version=$(node -v)
  local node_major=$(echo "$node_version" | cut -d'.' -f1 | sed 's/v//')
  
  if [[ $node_major -lt 20 ]]; then
    log_error "Node.js 版本过低 (需要 v20+，当前: $node_version)"
    return 1
  fi
  
  if ! command -v npm &> /dev/null; then
    log_error "npm 未安装"
    return 1
  fi
  
  local npm_version=$(npm -v)
  
  log_success "Node.js $node_version 已安装"
  log_success "npm $npm_version 已安装"
}

# Step 3: 检查环境配置文件
step_check_env_file() {
  log_step "检查 .env.webhook 配置"
  
  local env_file="$PROJECT_ROOT/.env.webhook"
  
  if [[ ! -f "$env_file" ]]; then
    log_error ".env.webhook 不存在"
    return 1
  fi
  
  if ! grep -q "GITHUB_WEBHOOK_SECRET=" "$env_file"; then
    log_error "GITHUB_WEBHOOK_SECRET 未配置"
    return 1
  fi
  
  local secret=$(grep "GITHUB_WEBHOOK_SECRET=" "$env_file" | cut -d'=' -f2)
  local port=$(grep "WEBHOOK_PORT=" "$env_file" | cut -d'=' -f2 || echo "3001")
  
  log_success ".env.webhook 配置有效"
  log_info "端口: $port"
  log_info "Secret 已配置: ${secret:0:16}...${secret: -8}"
}

# Step 4: 检查脚本文件
step_check_scripts() {
  log_step "检查脚本文件"
  
  local scripts=(
    "scripts/webhook-server.js"
    "scripts/deploy-webhook.sh"
    "scripts/auto-sync-cluster.sh"
    "scripts/verify-webhook-deployment.sh"
  )
  
  for script in "${scripts[@]}"; do
    if [[ ! -f "$PROJECT_ROOT/$script" ]]; then
      log_error "脚本缺失: $script"
      return 1
    fi
  done
  
  # 确保脚本可执行
  chmod +x "$PROJECT_ROOT"/scripts/*.sh 2>/dev/null || true
  
  log_success "所有脚本文件完整"
  for script in "${scripts[@]}"; do
    log_info "  ✓ $script"
  done
}

# Step 5: 加载环境变量
step_load_env() {
  log_step "加载环境变量"
  
  export $(cat "$PROJECT_ROOT/.env.webhook" | xargs)
  
  if [[ -z "$WEBHOOK_PORT" ]]; then
    log_warning "WEBHOOK_PORT 未设置，使用默认值 3001"
    export WEBHOOK_PORT=3001
  fi
  
  log_success "环境变量已加载"
  log_info "  WEBHOOK_PORT=$WEBHOOK_PORT"
  log_info "  NODE_ENV=${NODE_ENV:-production}"
  log_info "  LOG_DIR=${LOG_DIR:-.webhook-logs}"
}

# Step 6: 检查 Node 模块
step_check_dependencies() {
  log_step "检查依赖模块"
  
  if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
    log_warning "node_modules 不存在，正在安装..."
    cd "$PROJECT_ROOT"
    npm install --silent
  else
    log_success "node_modules 已存在"
  fi
}

# Step 7: 创建日志目录
step_create_log_dir() {
  log_step "创建日志目录"
  
  local log_dir="${LOG_DIR:-.webhook-logs}"
  if [[ ! "$log_dir" = /* ]]; then
    log_dir="$PROJECT_ROOT/$log_dir"
  fi
  
  mkdir -p "$log_dir"
  
  log_success "日志目录已创建: $log_dir"
}

# Step 8: 安装 PM2（如需）
step_install_pm2() {
  log_step "检查 PM2"
  
  if ! command -v pm2 &> /dev/null; then
    log_warning "PM2 未安装，正在安装..."
    npm install -g pm2 --silent
    log_success "PM2 已安装"
  else
    local pm2_version=$(pm2 -v)
    log_success "PM2 $pm2_version 已安装"
  fi
}

# Step 9: 停止旧进程（如存在）
step_cleanup_old_process() {
  log_step "清理旧进程"
  
  if pm2 list 2>/dev/null | grep -q "webhook"; then
    log_warning "检测到现有 webhook 进程，正在停止..."
    pm2 stop webhook 2>/dev/null || true
    pm2 delete webhook 2>/dev/null || true
    sleep 2
  fi
  
  log_success "旧进程已清理"
}

# Step 10: 部署 Webhook 服务
step_deploy_webhook() {
  log_step "部署 Webhook 服务到 PM2"
  
  cd "$PROJECT_ROOT"
  
  WEBHOOK_PORT="$WEBHOOK_PORT" \
  NODE_ENV=production \
  pm2 start scripts/webhook-server.js \
    --name webhook \
    --node-args="--enable-source-maps" \
    --max-memory-restart 500M \
    --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
    2>&1 | head -20
  
  # 保存 PM2 配置
  pm2 save
  
  sleep 3
  
  log_success "Webhook 服务已启动"
}

# Step 11: 验证服务状态
step_verify_service() {
  log_step "验证服务状态"
  
  # 检查 PM2 进程
  if ! pm2 list 2>/dev/null | grep -q "webhook"; then
    log_error "webhook 进程未找到"
    return 1
  fi
  
  local status=$(pm2 list 2>/dev/null | grep webhook | grep -oE "(online|stopped|failed)" || echo "unknown")
  
  if [[ "$status" != "online" ]]; then
    log_error "webhook 进程状态异常: $status"
    return 1
  fi
  
  log_success "webhook 进程状态: $status"
  
  # 检查进程信息
  log_info "进程详情:"
  pm2 list | grep webhook || true
}

# Step 12: 健康检查
step_health_check() {
  log_step "执行健康检查"
  
  local max_retries=15
  local retry=0
  
  while [[ $retry -lt $max_retries ]]; do
    if curl -s http://localhost:$WEBHOOK_PORT/health > /dev/null 2>&1; then
      local response=$(curl -s http://localhost:$WEBHOOK_PORT/health)
      
      log_success "健康检查通过"
      log_info "响应数据:"
      echo "$response" | jq . 2>/dev/null || echo "$response"
      return 0
    fi
    
    ((retry++))
    if [[ $retry -lt $max_retries ]]; then
      log_info "等待服务启动... (重试 $retry/$max_retries)"
      sleep 1
    fi
  done
  
  log_error "健康检查失败 (超时)"
  return 1
}

# Step 13: 验证日志
step_verify_logs() {
  log_step "验证日志系统"
  
  local log_dir="${LOG_DIR:-.webhook-logs}"
  if [[ ! "$log_dir" = /* ]]; then
    log_dir="$PROJECT_ROOT/$log_dir"
  fi
  
  if [[ ! -d "$log_dir" ]]; then
    log_error "日志目录不存在: $log_dir"
    return 1
  fi
  
  log_success "日志目录已验证: $log_dir"
  
  if ls "$log_dir"/*.log > /dev/null 2>&1; then
    log_info "日志文件:"
    ls -lh "$log_dir"/*.log | tail -5 || true
  fi
}

# Step 14: 显示完成信息
step_show_completion() {
  log_step "部署完成"
  
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Webhook 服务部署成功！              ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
  echo ""
  
  echo "📊 部署统计:"
  echo "  总步骤数: $STEP"
  echo -e "  ${GREEN}成功: $PASSED${NC}"
  if [[ $FAILED -gt 0 ]]; then
    echo -e "  ${RED}失败: $FAILED${NC}"
  fi
  echo ""
  
  echo "🌐 服务访问:"
  echo "  本地: http://localhost:$WEBHOOK_PORT"
  echo "  远程: http://coco.local:$WEBHOOK_PORT"
  echo ""
  
  echo "📝 关键端点:"
  echo "  健康检查: GET http://localhost:$WEBHOOK_PORT/health"
  echo "  Webhook: POST http://localhost:$WEBHOOK_PORT/webhook/push"
  echo "  状态: GET http://localhost:$WEBHOOK_PORT/webhook/status"
  echo ""
  
  echo "📋 管理命令:"
  echo "  pm2 list              # 查看进程列表"
  echo "  pm2 logs webhook      # 查看实时日志"
  echo "  pm2 restart webhook   # 重启服务"
  echo "  pm2 stop webhook      # 停止服务"
  echo ""
  
  echo "🔧 下一步:"
  echo "  1. 配置 GitHub webhook:"
  echo "     https://github.com/wyl2607/safvsoil/settings/hooks"
  echo "  2. Payload URL: http://coco.local:$WEBHOOK_PORT/webhook/push"
  echo "  3. Secret: (见 .env.webhook)"
  echo "  4. 推送到 master 分支测试"
  echo ""
  
  echo "📚 文档:"
  echo "  - WEBHOOK_QUICK_START.md"
  echo "  - WEBHOOK_DEPLOYMENT_GUIDE.md"
  echo "  - WEBHOOK_DEPLOYMENT_CHECKLIST.md"
  echo ""
}

# ============================================================================
# 主程序
# ============================================================================

main() {
  echo -e "${BLUE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║     SAFvsOil GitHub Webhook 服务 - 完整部署执行           ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  
  echo ""
  echo "📍 项目路径: $PROJECT_ROOT"
  echo "🎯 部署方式: $DEPLOY_METHOD"
  echo "🔌 端口: $WEBHOOK_PORT"
  echo ""
  
  # 执行所有步骤
  step_verify_directory || { log_error "验证目录失败"; exit 1; }
  step_check_nodejs || { log_error "检查 Node.js 失败"; exit 1; }
  step_check_env_file || { log_error "检查配置文件失败"; exit 1; }
  step_check_scripts || { log_error "检查脚本文件失败"; exit 1; }
  step_load_env || { log_error "加载环境变量失败"; exit 1; }
  step_check_dependencies || { log_error "检查依赖失败"; exit 1; }
  step_create_log_dir || { log_error "创建日志目录失败"; exit 1; }
  step_install_pm2 || { log_error "安装 PM2 失败"; exit 1; }
  step_cleanup_old_process
  step_deploy_webhook || { log_error "部署失败"; exit 1; }
  step_verify_service || { log_error "服务状态异常"; exit 1; }
  step_health_check || { log_error "健康检查失败"; exit 1; }
  step_verify_logs
  step_show_completion
  
  exit 0
}

# 运行主程序
main
