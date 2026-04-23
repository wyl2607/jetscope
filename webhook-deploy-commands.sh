#!/bin/bash

################################################################################
# SAFvsOil Webhook 部署 - 快速命令集合
#
# 用法: 复制以下命令逐条在 coco 上执行
# 或者将整个脚本保存并运行: bash webhook-deploy-commands.sh
################################################################################

# =============================================================================
# 交互式部署菜单
# =============================================================================

show_menu() {
  cat << 'EOF'

╔══════════════════════════════════════════════════════════════╗
║    SAFvsOil Webhook 部署 - 快速命令集                      ║
╚══════════════════════════════════════════════════════════════╝

请选择操作:

  1) 执行完整部署 (推荐)
  2) 仅启动服务
  3) 停止并清理
  4) 查看状态和日志
  5) 验证健康检查
  6) 配置 GitHub webhook (显示说明)
  7) 故障排查
  8) 退出

请输入选项 (1-8): 
EOF
}

# =============================================================================
# 部署函数
# =============================================================================

deploy_full() {
  echo "▶ 执行完整部署..."
  cd /Users/yumei/SAFvsOil
  bash run-webhook-deployment.sh
}

start_service() {
  echo "▶ 启动 Webhook 服务..."
  
  cd /Users/yumei/SAFvsOil
  export $(cat .env.webhook | xargs)
  
  if ! command -v pm2 &> /dev/null; then
    echo "安装 PM2..."
    npm install -g pm2 --silent
  fi
  
  pm2 delete webhook 2>/dev/null || true
  sleep 1
  
  echo "启动服务..."
  WEBHOOK_PORT="$WEBHOOK_PORT" NODE_ENV=production \
    pm2 start scripts/webhook-server.js \
      --name webhook \
      --max-memory-restart 500M
  
  pm2 save
  
  sleep 3
  echo ""
  echo "✓ 服务已启动"
  pm2 list
}

stop_service() {
  echo "▶ 停止服务并清理..."
  
  pm2 stop webhook 2>/dev/null || echo "服务未运行"
  pm2 delete webhook 2>/dev/null || echo "进程未找到"
  
  echo "✓ 清理完成"
}

show_status() {
  echo "▶ 服务状态和日志..."
  echo ""
  echo "=== PM2 进程状态 ==="
  pm2 list
  
  echo ""
  echo "=== 最新 20 行日志 ==="
  pm2 logs webhook --lines 20 2>/dev/null || echo "无日志"
}

health_check() {
  echo "▶ 执行健康检查..."
  
  echo ""
  echo "测试连接到 http://localhost:3001/health"
  echo ""
  
  for i in {1..10}; do
    if curl -s http://localhost:3001/health | jq . > /dev/null 2>&1; then
      echo "✓ 健康检查成功！"
      curl -s http://localhost:3001/health | jq .
      return 0
    fi
    
    echo "等待服务启动... ($i/10)"
    sleep 1
  done
  
  echo "✗ 健康检查失败"
  echo ""
  echo "故障排查:"
  echo "  1. 检查服务状态: pm2 list"
  echo "  2. 查看日志: pm2 logs webhook"
  echo "  3. 检查端口: lsof -i :3001"
}

github_webhook_guide() {
  cat << 'EOF'

▶ GitHub Webhook 配置指南

步骤 1: 访问 GitHub
--------
在浏览器中打开:
  https://github.com/wyl2607/safvsoil/settings/hooks

步骤 2: 添加 Webhook
--------
1. 点击 "Add webhook" 按钮
2. 填写以下配置:

   Payload URL: http://coco.local:3001/webhook/push
   
   Content type: application/json
   
   Secret: [需要从 .env.webhook 复制]
           执行以下命令查看:
           cat /Users/yumei/SAFvsOil/.env.webhook | grep GITHUB_WEBHOOK_SECRET
   
   Which events would you like to trigger this webhook?
   选择: Just the push event
   
   Active: ✓ (打勾)

3. 点击 "Add webhook"

步骤 3: 验证
--------
1. 在 GitHub 页面看到 Webhook 条目
2. 在 "Recent Deliveries" 中应该看到绿色 ✓ (HTTP 200/202)
3. 点击条目查看请求/响应详情

步骤 4: 测试
--------
1. 推送到 master 分支:
   git push origin master

2. 检查 Webhook 执行:
   - GitHub "Recent Deliveries" 中应有新条目
   - 响应状态应该是 200 或 202
   - 点击查看请求体和响应

3. 检查服务日志:
   pm2 logs webhook

预期日志内容:
  - "Valid webhook received"
  - "Processing master branch push"
  - "Cluster sync completed" 或类似信息

EOF
  read -p "按 Enter 继续..."
}

troubleshoot() {
  cat << 'EOF'

▶ 故障排查工具

常见问题和解决方案:

1️⃣  服务无法启动
   ▪ 检查 Node.js: node --version
   ▪ 检查 npm: npm --version
   ▪ 检查 .env.webhook: ls -l .env.webhook
   ▪ 查看错误: pm2 logs webhook --lines 100

2️⃣  端口被占用 (3001)
   ▪ 查看占用进程: lsof -i :3001
   ▪ 杀死进程: kill -9 <PID>
   ▪ 检查其他 Webhook 进程: pm2 list

3️⃣  环境变量未加载
   ▪ 重新加载: export $(cat .env.webhook | xargs)
   ▪ 验证: echo $WEBHOOK_PORT
   ▪ 应该输出: 3001

4️⃣  PM2 未安装
   ▪ 安装 PM2: npm install -g pm2
   ▪ 验证: pm2 -v

5️⃣  健康检查失败
   ▪ 等待几秒: sleep 5
   ▪ 重试健康检查: curl http://localhost:3001/health
   ▪ 查看详细日志: pm2 describe webhook

6️⃣  GitHub Webhook 不工作
   ▪ 验证 URL 格式: 应该是 http://coco.local:3001/webhook/push
   ▪ 验证 Secret: cat .env.webhook | grep GITHUB_WEBHOOK_SECRET
   ▪ 检查防火墙: 确保可以从 GitHub 访问 coco

🔧 完整诊断命令:

  # 验证环境
  cd /Users/yumei/SAFvsOil && pwd
  node --version && npm --version
  
  # 验证配置
  ls -l .env.webhook
  cat .env.webhook
  
  # 检查服务
  pm2 list
  pm2 describe webhook
  
  # 测试连接
  curl -v http://localhost:3001/health
  
  # 查看日志
  pm2 logs webhook --lines 100
  tail -f ./webhook-logs/webhook-*.log
  
  # 运行验证脚本
  ./scripts/verify-webhook-deployment.sh

💡 提示:
  - 如果多个命令失败，请从头开始完整部署
  - 使用 "bash run-webhook-deployment.sh" 进行自动诊断
  - 保存日志以便分析问题

EOF
  read -p "按 Enter 返回菜单..."
}

# =============================================================================
# 主程序
# =============================================================================

main() {
  while true; do
    clear
    show_menu
    read -p "请输入: " choice
    
    case $choice in
      1)
        clear
        deploy_full
        read -p "按 Enter 继续..."
        ;;
      2)
        clear
        start_service
        read -p "按 Enter 继续..."
        ;;
      3)
        clear
        stop_service
        read -p "按 Enter 继续..."
        ;;
      4)
        clear
        show_status
        read -p "按 Enter 继续..."
        ;;
      5)
        clear
        health_check
        read -p "按 Enter 继续..."
        ;;
      6)
        clear
        github_webhook_guide
        ;;
      7)
        clear
        troubleshoot
        ;;
      8)
        echo "再见！"
        exit 0
        ;;
      *)
        echo "无效选项，请重试"
        sleep 1
        ;;
    esac
  done
}

# 检查是否在 coco 上
if ! grep -q "coco" <<< "$(hostname)" && [[ ! -d "/Users/yumei/SAFvsOil" ]]; then
  echo "⚠ 警告: 看起来不在 coco 上运行"
  echo "请确保在 Mac-mini (coco) 上执行此脚本"
  echo ""
  read -p "继续吗? (y/n): " -n 1
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# 运行主程序
main
