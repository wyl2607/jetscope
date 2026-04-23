# Webhook 部署执行指南 - coco (Mac-mini)

此文档提供了在 coco 上完整部署 GitHub Webhook 服务的逐步指南。

## 📋 前置条件检查

在执行部署前，请确认以下条件：

### 1. 系统要求
- **操作系统**: macOS (在 Mac-mini coco 上)
- **Node.js 版本**: v20+ (脚本要求 v20+)
- **npm 版本**: 10+
- **PM2**: 将通过 npm -g 安装
- **网络**: coco 可访问 internet（用于 npm install）

### 2. 项目文件检查
```bash
# 检查项目目录
ls -la /Users/yumei/SAFvsOil/

# 应该包含以下关键文件:
# - run-webhook-deployment.sh (部署脚本)
# - scripts/webhook-server.js (Webhook 服务)
# - scripts/auto-sync-cluster.sh (集群同步脚本)
# - .env.webhook (配置文件)
# - package.json (依赖文件)
```

### 3. 验证环境配置
```bash
# 检查 .env.webhook
cat /Users/yumei/SAFvsOil/.env.webhook

# 输出应该包含:
# GITHUB_WEBHOOK_SECRET=a7c2e9f1b4d6e8a3c5f7b9d1e3a5c7f9b1d3e5a7c9f1b3d5e7a9b1c3d5e7a9
# WEBHOOK_PORT=3001
# LOG_DIR=./webhook-logs
# NODE_ENV=production
```

## 🚀 完整部署步骤

### 方式 A：使用一键部署脚本（推荐）

在 coco 上执行：

```bash
cd /Users/yumei/SAFvsOil
bash run-webhook-deployment.sh
```

这个脚本将自动执行以下所有步骤。

### 方式 B：手动分步部署

如果一键脚本出现问题，可以按以下步骤手动部署：

#### Step 1: 验证项目目录
```bash
cd /Users/yumei/SAFvsOil
pwd
ls -la package.json
```

#### Step 2: 检查 Node.js
```bash
node --version
npm --version
# 验证版本 >= v20 和 npm >= 10
```

#### Step 3: 检查环境文件
```bash
cat .env.webhook | grep GITHUB_WEBHOOK_SECRET
cat .env.webhook | grep WEBHOOK_PORT
```

#### Step 4: 安装依赖
```bash
npm install --silent
```

#### Step 5: 创建日志目录
```bash
mkdir -p webhook-logs
```

#### Step 6: 安装 PM2（如果未安装）
```bash
which pm2 || npm install -g pm2
```

#### Step 7: 停止旧进程（如存在）
```bash
pm2 stop webhook 2>/dev/null || true
pm2 delete webhook 2>/dev/null || true
sleep 2
```

#### Step 8: 启动 Webhook 服务
```bash
export WEBHOOK_PORT=3001
export NODE_ENV=production
export LOG_DIR=./webhook-logs

pm2 start scripts/webhook-server.js \
  --name webhook \
  --node-args="--enable-source-maps" \
  --max-memory-restart 500M \
  --log-date-format "YYYY-MM-DD HH:mm:ss Z"
```

#### Step 9: 保存 PM2 配置
```bash
pm2 save
```

#### Step 10: 验证服务状态
```bash
pm2 list
# 应该显示 webhook 状态为 "online"
```

## ✅ 验证部署成功

### 1. 检查 PM2 进程
```bash
pm2 status

# 预期输出示例:
# ┌────┬────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
# │ id │ name       │ mode     │ ↺    │ status    │ cpu      │ memory   │
# ├────┼────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
# │ 0  │ webhook    │ fork     │ 0    │ online    │ 0%       │ 45.4mb   │
# └────┴────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

### 2. 执行本地健康检查
```bash
curl -s http://localhost:3001/health | jq .

# 预期响应:
# {
#   "status": "ok",
#   "timestamp": "2026-04-22T20:15:30.123Z",
#   "uptime": 15.234
# }
```

### 3. 查看实时日志
```bash
pm2 logs webhook --lines 30

# 预期日志:
# webhook-0  | [INFO] 2026-04-22 20:15:15 - Webhook server started
# webhook-0  | [INFO] 2026-04-22 20:15:15 - Health check: http://localhost:3001/health
```

### 4. 远程访问验证（从本地 Mac）
```bash
# 在本地 Mac 上执行
curl -s http://coco.local:3001/health | jq .
```

### 5. 测试 Webhook POST 端点
```bash
# 测试签名验证（应返回 403 因为签名无效）
curl -X POST http://localhost:3001/webhook/push \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=invalid" \
  -d '{"ref":"refs/heads/master","repository":{"name":"esg-research-toolkit"},"after":"abc123def456"}'

# 预期: HTTP 403 {"error":"Invalid signature"}
```

### 6. 查看 Webhook 日志
```bash
# 查看今天的日志
ls -lh webhook-logs/

# 查看最近的日志条目
tail -20 webhook-logs/webhook-$(date +%Y-%m-%d).log

# 或通过 HTTP API
curl -s http://localhost:3001/webhook/status | jq .
```

## 🔧 故障排查

### 问题 1: Node.js 版本太低
```bash
node --version  # 检查版本

# 如需升级，使用 nvm:
nvm install 20
nvm use 20
```

### 问题 2: PM2 进程启动失败
```bash
# 查看详细错误日志
pm2 logs webhook --err

# 或查看完整进程状态
pm2 describe webhook

# 尝试手动运行脚本查看错误
node scripts/webhook-server.js
```

### 问题 3: 端口被占用
```bash
# 检查谁在使用 3001 端口
lsof -i :3001

# 如需使用不同端口，修改 .env.webhook:
# WEBHOOK_PORT=3002
```

### 问题 4: 权限错误
```bash
# 确保脚本可执行
chmod +x run-webhook-deployment.sh
chmod +x scripts/*.sh

# 检查日志目录权限
chmod 755 webhook-logs
```

### 问题 5: npm 依赖安装失败
```bash
# 清除 npm 缓存
npm cache clean --force

# 重新安装
npm install

# 或使用离线模式（如果之前安装过）
npm ci
```

## 📊 部署完成检查清单

部署成功的标志：

- [ ] `pm2 status` 显示 webhook 为 online
- [ ] `curl http://localhost:3001/health` 返回 HTTP 200
- [ ] 日志文件在 `webhook-logs/` 目录中创建
- [ ] PM2 已配置自启动：`pm2 startup` 和 `pm2 save`
- [ ] `pm2 logs webhook` 显示 "Webhook server started"
- [ ] 远程可访问：`curl http://coco.local:3001/health` 成功

## 🔗 下一步

### 1. 配置 GitHub Webhook
在 GitHub 仓库设置中：
- URL: `http://coco.local:3001/webhook/push`
- Secret: (从 .env.webhook 中的 GITHUB_WEBHOOK_SECRET)
- Events: Push events
- Active: ✓ Checked

### 2. 测试部署
推送到 master 分支：
```bash
git push origin master
```

检查 webhook 日志是否记录了事件：
```bash
curl http://localhost:3001/webhook/status | jq .
```

### 3. 设置自启动
```bash
# 生成启动脚本
pm2 startup

# 复制输出的命令并执行（需要 sudo）
# 例如: sudo env PATH=$PATH:/usr/local/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u yumei --hp /Users/yumei

# 保存配置
pm2 save
```

## 📚 文档参考

- `WEBHOOK_DEPLOYMENT_GUIDE.md` - 详细部署指南
- `WEBHOOK_QUICK_START.md` - 快速开始
- `WEBHOOK_DEPLOYMENT_CHECKLIST.md` - 完整检查清单
- `scripts/webhook-server.js` - 服务源代码

## 💬 关键命令速查

```bash
# 启动服务
pm2 start scripts/webhook-server.js --name webhook

# 重启服务
pm2 restart webhook

# 停止服务
pm2 stop webhook

# 删除服务
pm2 delete webhook

# 查看日志
pm2 logs webhook

# 查看进程详情
pm2 describe webhook

# 列出所有进程
pm2 list

# 保存配置（用于自启动）
pm2 save

# 健康检查
curl http://localhost:3001/health

# 查看 Webhook 事件
curl http://localhost:3001/webhook/status
```

---

**最后更新**: 2026-04-22  
**部署环境**: Mac-mini (coco)  
**服务端口**: 3001  
**Log 目录**: ./webhook-logs
