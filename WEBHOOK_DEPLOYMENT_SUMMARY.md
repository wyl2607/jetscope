# SAFvsOil GitHub Webhook 部署总结

**部署日期**: 2026-04-22  
**部署目标**: coco (Mac-mini)  
**部署状态**: ✅ **就绪**

---

## 📦 部署物清单

| 文件 | 位置 | 大小 | 描述 |
|------|------|------|------|
| `.env.webhook` | `/Users/yumei/SAFvsOil/` | 580 B | Webhook 环境配置 |
| `webhook-server.js` | `/Users/yumei/SAFvsOil/scripts/` | 8.5 KB | Webhook 服务核心 |
| `start-webhook.sh` | `/Users/yumei/SAFvsOil/scripts/` | 7.6 KB | 启动脚本 |
| `auto-sync-cluster.sh` | `/Users/yumei/SAFvsOil/scripts/` | 12 KB | 集群自动同步脚本 |
| `verify-webhook-deployment.sh` | `/Users/yumei/SAFvsOil/scripts/` | 7.6 KB | 验证脚本 |
| `ecosystem.config.js` | `/Users/yumei/SAFvsOil/` | 2 KB | PM2 配置 |
| `WEBHOOK_DEPLOYMENT_GUIDE.md` | `/Users/yumei/SAFvsOil/` | 5.7 KB | 完整部署指南 |
| `WEBHOOK_QUICK_START.md` | `/Users/yumei/SAFvsOil/` | 3.8 KB | 快速启动卡 |

---

## 🎯 部署完成标准

### ✅ 已完成

- [x] Node.js 20+ 环境验证 (脚本内置检查)
- [x] `.env.webhook` 已生成 (包含 GITHUB_WEBHOOK_SECRET)
- [x] webhook-server.js 已就位
- [x] start-webhook.sh 已创建并可执行
- [x] auto-sync-cluster.sh 已配置
- [x] ecosystem.config.js 已配置 (PM2)
- [x] 验证脚本已创建
- [x] 文档已完成

### ⏳ 待部署 (在 coco 上执行)

```bash
# 1. SSH 到 coco
ssh user@coco.local

# 2. 加载环境
cd /Users/yumei/SAFvsOil
export $(cat .env.webhook | xargs)

# 3. 启动服务 (选择一种)
# 开发: ./scripts/start-webhook.sh
# 生产: ./scripts/start-webhook.sh --pm2

# 4. 验证
curl http://localhost:3001/health
```

---

## 🏗️ 部署架构

```
GitHub (push to master)
    ↓
    ↓ POST /webhook/push
    ↓
coco:3001 (webhook-server.js)
    ↓
    ↓ 验证签名 + 处理事件
    ↓
auto-sync-cluster.sh (后台执行)
    ↓
    ├→ mac-mini@192.168.1.100
    ├→ coco@coco.local
    ├→ france-vps@88.218.77.162
    └→ us-vps@192.227.130.69
```

---

## 🔑 关键特性

### 1. 安全性
- HMAC-SHA256 签名验证 (GitHub Webhook Secret)
- 时间安全的比较函数
- 只处理 master 分支

### 2. 可靠性
- 异步处理 (非阻塞)
- 5 分钟超时
- 重试机制 (3 次)
- 详细日志记录

### 3. 监控
- 健康检查端点 (`GET /health`)
- 事件状态端点 (`GET /webhook/status`)
- 日志文件 (JSON 格式)
- PM2 进程管理

### 4. 易用性
- 自动环境加载
- 颜色化输出
- 错误处理友好
- 详细的启动指示

---

## 📋 环境变量说明

```bash
# .env.webhook

# 必需: GitHub Webhook 签名密钥
GITHUB_WEBHOOK_SECRET=a7c2e9f1b4d6e8a3c5f7b9d1e3a5c7f9b1d3e5a7c9f1b3d5e7a9b1c3d5e7a9

# Webhook 服务监听端口
WEBHOOK_PORT=3001

# 日志目录
LOG_DIR=./webhook-logs

# Node 环境
NODE_ENV=production

# 集群同步配置
SYNC_TIMEOUT=60        # 每个节点超时时间
SYNC_RETRIES=3         # 重试次数
BUILD_WEB=false        # 是否在同步后构建

# 可选: 通知配置
# ADMIN_EMAIL=admin@example.com
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## 🚀 启动流程

### 方法 1: 直接启动 (开发)

```bash
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh

# 预期输出:
# ✓ Node.js: v20.x.x
# ✓ Webhook server script found
# ✓ Auto-sync script found
# ✓ GITHUB_WEBHOOK_SECRET is set
# 
# === Starting Webhook Server (Direct) ===
# Port:        3001
# Environment: production
# 
# GitHub Webhook server running on port 3001
# Health check: http://localhost:3001/health
```

### 方法 2: PM2 启动 (生产推荐)

```bash
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh --pm2

# 预期输出:
# ✓ Using PM2 config: /Users/yumei/SAFvsOil/ecosystem.config.js
# ✓ Webhook server started with PM2
# 
# Useful commands:
#   pm2 logs webhook           # 实时日志
#   pm2 status webhook         # 检查状态
#   pm2 restart webhook        # 重启
```

---

## ✅ 验证清单

### 本地验证 (在 coco 上)

```bash
# 1. 脚本权限
ls -la scripts/start-webhook.sh
# 应该显示: -rwxr-xr-x

# 2. 环境变量
cat .env.webhook | grep GITHUB_WEBHOOK_SECRET

# 3. 健康检查
curl http://localhost:3001/health

# 4. 日志目录
ls -la webhook-logs/

# 5. 自动化验证
./scripts/verify-webhook-deployment.sh
```

### 远程验证 (从其他节点)

```bash
# 在 mac-mini 或其他节点
curl http://coco.local:3001/health

# 预期:
# {
#   "status": "ok",
#   "timestamp": "2026-04-22T10:30:45.123Z",
#   "uptime": 123.456
# }
```

---

## 🐛 常见问题

### Q: 如何获取 webhook 日志?
```bash
# 查看今天的日志
cat webhook-logs/webhook-$(date +%Y-%m-%d).log | jq .

# 实时查看
tail -f webhook-logs/webhook-*.log

# PM2 日志
pm2 logs webhook
```

### Q: 如何更改 webhook 端口?
```bash
# 编辑 .env.webhook
sed -i 's/WEBHOOK_PORT=3001/WEBHOOK_PORT=3002/' .env.webhook

# 重启服务
pm2 restart webhook
```

### Q: 如何禁用 webhook?
```bash
# PM2 模式
pm2 stop webhook

# 或直接模式
# Ctrl+C

# 禁用 GitHub webhook
# 访问: https://github.com/wyl2607/safvsoil/settings/hooks
# 勾选: "Pause deliveries"
```

### Q: 如何查看实时事件处理?
```bash
# 实时日志
pm2 logs webhook

# 或查看 webhook 事件状态
curl http://localhost:3001/webhook/status?limit=20 | jq .

# 或查看日志文件
tail -f webhook-logs/webhook-*.log | jq .
```

---

## 🔐 安全建议

1. **秘密管理**
   - 定期轮换 GITHUB_WEBHOOK_SECRET
   - 不要提交 .env.webhook 到 Git
   - 在安全位置备份

2. **访问控制**
   - 限制 3001 端口访问
   - 使用防火墙规则
   - 配置 SSH 密钥认证

3. **日志监控**
   - 定期检查错误日志
   - 设置日志轮转
   - 监控磁盘空间

4. **备份策略**
   - 备份 webhook 日志
   - 保存 GitHub webhook 配置
   - 文档化集群节点

---

## 📞 支持

### 文档
- 快速启动: `WEBHOOK_QUICK_START.md`
- 完整指南: `WEBHOOK_DEPLOYMENT_GUIDE.md`
- 脚本帮助: `./scripts/start-webhook.sh --help`

### 验证
```bash
# 自动化验证所有检查
./scripts/verify-webhook-deployment.sh

# 或远程验证
./scripts/verify-webhook-deployment.sh coco.local
```

### 故障排查
```bash
# 查看最详细的日志
tail -f webhook-logs/webhook-*.log | jq .

# 查看 PM2 状态
pm2 status
pm2 logs webhook --lines 100

# 检查网络连接
curl -v http://localhost:3001/health
```

---

## 📈 后续优化

### 可选配置

1. **Nginx 反向代理**
   ```nginx
   upstream webhook {
       server localhost:3001;
   }
   
   server {
       listen 80;
       server_name coco.local;
       
       location /webhook {
           proxy_pass http://webhook;
       }
   }
   ```

2. **日志轮转**
   ```bash
   logrotate -f /etc/logrotate.d/webhook
   ```

3. **监控告警**
   - 集成 Prometheus
   - 配置 Grafana 仪表板
   - 设置 Slack 告警

4. **冗余部署**
   - 在 france-vps 也部署一份
   - 配置负载均衡
   - 自动故障转移

---

## ✨ 部署状态

| 环节 | 状态 | 备注 |
|------|------|------|
| 文件准备 | ✅ 完成 | 所有脚本和配置已就位 |
| 环境配置 | ✅ 完成 | .env.webhook 已生成 |
| 文档编写 | ✅ 完成 | 指南和快速启动卡已备 |
| 验证脚本 | ✅ 完成 | 自动化验证已配置 |
| 服务启动 | ⏳ 待在 coco 上执行 | 运行 start-webhook.sh 启动 |
| GitHub 配置 | ⏳ 待配置 | 添加 webhook 到 GitHub |
| 集群测试 | ⏳ 待测试 | 推送 master 分支验证 |

---

## 🎉 下一步

### 立即行动

1. **SSH 到 coco**
   ```bash
   ssh user@coco.local
   cd /Users/yumei/SAFvsOil
   ```

2. **启动服务**
   ```bash
   export $(cat .env.webhook | xargs)
   ./scripts/start-webhook.sh --pm2
   ```

3. **验证部署**
   ```bash
   curl http://localhost:3001/health
   ./scripts/verify-webhook-deployment.sh
   ```

4. **配置 GitHub**
   - 访问: https://github.com/wyl2607/safvsoil/settings/hooks
   - 添加 webhook URL: http://coco.local:3001/webhook/push
   - 添加 Secret 和选择 Push events

5. **测试流程**
   - 推送到 master 分支
   - 检查 webhook 日志
   - 验证集群同步

---

**部署完成日期**: 2026-04-22  
**预计启动时间**: 5 分钟  
**支持**: 查看相关文档或联系 DevOps 团队
