#!/bin/bash

################################################################################
# Webhook 部署快速检查脚本
# 在 coco 上运行此脚本快速验证部署状态
#
# 使用: bash check-webhook-status.sh
################################################################################

set -e

# 颜色代码
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 计数器
PASSED=0
FAILED=0

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Webhook 部署状态检查                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# 检查函数
# ============================================================================

check_test() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
  fi
}

# ============================================================================
# 系统检查
# ============================================================================

echo -e "${CYAN}System Checks${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 Node.js
node --version > /dev/null 2>&1
check_test "Node.js 已安装"

# 检查 npm
npm --version > /dev/null 2>&1
check_test "npm 已安装"

# 检查 PM2
pm2 --version > /dev/null 2>&1
check_test "PM2 已安装"

# ============================================================================
# 项目检查
# ============================================================================

echo ""
echo -e "${CYAN}Project Structure${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd /Users/yumei/SAFvsOil 2>/dev/null
check_test "项目目录存在"

[ -f package.json ] && check_test "package.json 存在" || echo -e "${RED}✗${NC} package.json 不存在"

[ -f .env.webhook ] && check_test ".env.webhook 存在" || echo -e "${RED}✗${NC} .env.webhook 不存在"

[ -f run-webhook-deployment.sh ] && check_test "部署脚本存在" || echo -e "${RED}✗${NC} 部署脚本不存在"

[ -f scripts/webhook-server.js ] && check_test "Webhook 服务存在" || echo -e "${RED}✗${NC} Webhook 服务不存在"

# ============================================================================
# 依赖检查
# ============================================================================

echo ""
echo -e "${CYAN}Dependencies${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d node_modules ]; then
  echo -e "${GREEN}✓${NC} node_modules 已安装"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠${NC} node_modules 未安装 (需要运行: npm install)"
fi

# ============================================================================
# 服务检查
# ============================================================================

echo ""
echo -e "${CYAN}Service Status${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if pm2 list 2>/dev/null | grep -q "webhook"; then
  STATUS=$(pm2 list 2>/dev/null | grep webhook | awk '{print $8}')
  if [ "$STATUS" = "online" ]; then
    echo -e "${GREEN}✓${NC} Webhook 服务正在运行 (状态: $STATUS)"
    ((PASSED++))
    
    # 健康检查
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} 健康检查通过 (HTTP 200)"
      ((PASSED++))
      
      RESPONSE=$(curl -s http://localhost:3001/health)
      echo -e "  响应: $RESPONSE"
    else
      echo -e "${YELLOW}⚠${NC} 健康检查失败 (无响应)"
    fi
  else
    echo -e "${YELLOW}⚠${NC} Webhook 服务存在但未运行 (状态: $STATUS)"
  fi
else
  echo -e "${YELLOW}⚠${NC} Webhook 服务未启动"
  echo -e "  运行部署: ${BLUE}bash run-webhook-deployment.sh${NC}"
fi

# ============================================================================
# 端口检查
# ============================================================================

echo ""
echo -e "${CYAN}Port Status${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if lsof -i :3001 > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} 端口 3001 被占用 (正常)"
  ((PASSED++))
  lsof -i :3001 | tail -1 | awk '{print "  进程: " $1 " (PID: " $2 ")"}'
else
  echo -e "${YELLOW}⚠${NC} 端口 3001 未被占用 (服务未运行)"
fi

# ============================================================================
# 日志检查
# ============================================================================

echo ""
echo -e "${CYAN}Logs${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d webhook-logs ]; then
  echo -e "${GREEN}✓${NC} 日志目录存在"
  ((PASSED++))
  
  LOG_FILES=$(find webhook-logs -name "*.log" 2>/dev/null | wc -l)
  if [ "$LOG_FILES" -gt 0 ]; then
    echo -e "  日志文件数: $LOG_FILES"
    LATEST_LOG=$(ls -t webhook-logs/*.log 2>/dev/null | head -1)
    if [ -n "$LATEST_LOG" ]; then
      LINES=$(wc -l < "$LATEST_LOG")
      echo -e "  最新日志: $(basename $LATEST_LOG) ($LINES 行)"
    fi
  fi
else
  echo -e "${YELLOW}⚠${NC} 日志目录不存在"
fi

# ============================================================================
# 配置检查
# ============================================================================

echo ""
echo -e "${CYAN}Configuration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f .env.webhook ]; then
  WEBHOOK_PORT=$(grep "WEBHOOK_PORT" .env.webhook | cut -d'=' -f2)
  NODE_ENV=$(grep "NODE_ENV" .env.webhook | cut -d'=' -f2)
  HAS_SECRET=$(grep -c "GITHUB_WEBHOOK_SECRET" .env.webhook || echo 0)
  
  echo "  WEBHOOK_PORT: $WEBHOOK_PORT"
  echo "  NODE_ENV: $NODE_ENV"
  if [ "$HAS_SECRET" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} GITHUB_WEBHOOK_SECRET 已配置"
    ((PASSED++))
  fi
fi

# ============================================================================
# 总结
# ============================================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  检查完成                             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ 所有检查通过 ($PASSED/$(($PASSED + $FAILED)))${NC}"
else
  echo -e "检查结果: ${GREEN}✓ $PASSED 通过${NC}, ${RED}✗ $FAILED 失败${NC}"
fi

echo ""

if [ $FAILED -eq 0 ] && pm2 list 2>/dev/null | grep -q "webhook"; then
  echo -e "${GREEN}Webhook 服务已部署并正常运行！${NC}"
  echo ""
  echo "下一步:"
  echo "  1. 测试 Webhook: curl http://localhost:3001/health"
  echo "  2. 查看日志: pm2 logs webhook"
  echo "  3. 配置 GitHub: 访问 GitHub Settings > Webhooks"
else
  echo -e "${YELLOW}需要执行部署步骤${NC}"
  echo ""
  echo "下一步:"
  echo "  1. 运行部署: bash run-webhook-deployment.sh"
  echo "  2. 等待完成"
  echo "  3. 重新运行此脚本验证"
fi

echo ""
