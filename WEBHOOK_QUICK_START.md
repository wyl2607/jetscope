# SAFvsOil Webhook 部署快速启动卡

**目标**: 在 coco (Mac-mini) 上启动 GitHub Webhook 自动同步服务

---

## ⚡ 5 分钟快速部署

### 第 1 步: SSH 到 coco

```bash
ssh user@coco.local
cd /Users/yumei/SAFvsOil
```

### 第 2 步: 加载环境变量

```bash
export $(cat .env.webhook | xargs)
```

### 第 3 步: 选择启动方式

#### 开发模式 (直接启动)
```bash
./scripts/start-webhook.sh
# Ctrl+C 停止
```

#### 生产模式 (PM2 推荐)
```bash
./scripts/start-webhook.sh --pm2
```

### 第 4 步: 验证部署

```bash
# 健康检查
curl http://localhost:3001/health

# 预期输出
{
  "status": "ok",
  "timestamp": "2026-04-22T10:30:45.123Z",
  "uptime": 123.456
}
```

✅ **部署完成！** Webhook 服务运行在 `coco:3001`

---

## 📋 完整部署检查清单

| 步骤 | 检查项 | 命令 | 预期结果 |
|------|--------|------|---------|
| 1 | Node.js 版本 | `node --version` | v20.x+ |
| 2 | npm 版本 | `npm --version` | 10.x+ |
| 3 | 项目目录 | `ls -la /Users/yumei/SAFvsOil` | 显示项目文件 |
| 4 | 环境配置 | `cat .env.webhook \| head -3` | 显示配置值 |
| 5 | webhook-server.js | `ls -la scripts/webhook-server.js` | 文件存在 |
| 6 | start-webhook.sh | `ls -la scripts/start-webhook.sh` | 文件存在 |
| 7 | auto-sync-cluster.sh | `ls -la scripts/auto-sync-cluster.sh` | 文件存在 |
| 8 | 启动服务 | `./scripts/start-webhook.sh --pm2` | 服务启动 |
| 9 | 健康检查 | `curl http://localhost:3001/health` | HTTP 200 |
| 10 | 远程访问 | `curl http://coco.local:3001/health` | HTTP 200 |

---

## 🔧 PM2 管理命令

```bash
# 查看状态
pm2 status webhook

# 查看日志 (实时)
pm2 logs webhook

# 查看最后 100 行
pm2 logs webhook --lines 100

# 重启服务
pm2 restart webhook

# 停止服务
pm2 stop webhook

# 启动服务
pm2 start webhook

# 删除服务
pm2 delete webhook

# 开机自启
pm2 startup
pm2 save

# 取消开机自启
pm2 unstartup
```

---

## 🐛 故障排查

### 问题 1: 端口被占用
```bash
lsof -i :3001         # 查找占用进程
kill -9 <PID>         # 杀死进程 (如果需要)
```

### 问题 2: 无法启动服务
```bash
# 检查日志
pm2 logs webhook --lines 50

# 检查权限
chmod +x scripts/start-webhook.sh
chmod +x scripts/auto-sync-cluster.sh

# 检查依赖
npm install
```

### 问题 3: 环境变量未加载
```bash
# 重新加载
source .env.webhook          # 不推荐 (不会导出)
export $(cat .env.webhook | xargs)  # 推荐

# 验证
echo $GITHUB_WEBHOOK_SECRET
```

### 问题 4: 无法从其他节点访问
```bash
# 检查防火墙
sudo ufw status              # UFW

# 允许 3001 端口
sudo ufw allow 3001/tcp

# 检查 DNS
nslookup coco.local
ping coco.local
```

---

## 📝 日志文件位置

```bash
# Webhook 事件日志
/Users/yumei/SAFvsOil/webhook-logs/webhook-YYYY-MM-DD.log

# PM2 输出日志
/Users/yumei/SAFvsOil/webhook-logs/pm2-out.log

# PM2 错误日志
/Users/yumei/SAFvsOil/webhook-logs/pm2-error.log

# 实时查看
tail -f /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log
pm2 logs webhook
```

---

## 🔐 GitHub 配置

### 1. 添加 Webhook

访问: `https://github.com/wyl2607/safvsoil/settings/hooks`

| 字段 | 值 |
|------|-----|
| Payload URL | `http://coco.local:3001/webhook/push` |
| Content type | `application/json` |
| Secret | (从 .env.webhook 中复制) |
| Events | `Push events` ✓ |
| Active | ✓ |

### 2. 测试 Webhook

- GitHub 页面 → Webhook → "Recent Deliveries"
- 应该看到 **200** 或 **202** 状态码
- 点击查看请求和响应详情

### 3. 验证集群同步

- 推送到 master 分支
- 检查日志中的 sync 记录
- 验证其他节点是否同步

---

## 📊 API 端点

```bash
# 健康检查
GET http://coco.local:3001/health
# 响应: {"status":"ok","timestamp":"...","uptime":123.456}

# Webhook 事件状态
GET http://coco.local:3001/webhook/status?limit=20
# 响应: {"events":[...], "total":5}

# Webhook 事件 (GitHub POST)
POST http://coco.local:3001/webhook/push
# 需要有效的 X-Hub-Signature-256 头
```

---

## ✅ 验证脚本

自动化验证所有部署检查:

```bash
cd /Users/yumei/SAFvsOil

# 本地验证
./scripts/verify-webhook-deployment.sh

# 远程验证 (从其他节点)
./scripts/verify-webhook-deployment.sh coco.local
```

---

## 📚 相关文档

- 完整部署指南: `WEBHOOK_DEPLOYMENT_GUIDE.md`
- Webhook 服务: `scripts/webhook-server.js`
- 启动脚本: `scripts/start-webhook.sh`
- 集群同步脚本: `scripts/auto-sync-cluster.sh`
- 生态配置: `ecosystem.config.js`

---

## 🎯 下一步

1. ✅ 部署 webhook 服务到 coco
2. ✅ 配置 GitHub webhook
3. ✅ 测试端到端流程
4. ✅ 配置 PM2 开机自启
5. ✅ 设置日志告警 (可选)

---

**状态**: 部署就绪  
**最后更新**: 2026-04-22  
**维护者**: DevOps Team
