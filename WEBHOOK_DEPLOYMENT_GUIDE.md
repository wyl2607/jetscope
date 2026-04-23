# SAFvsOil GitHub Webhook 部署指南

**目标**: 在 coco (Mac-mini) 上部署 webhook 服务，实现自动集群同步

**部署时间**: 5-10 分钟  
**难度**: ⭐⭐ (中等)

---

## 快速部署 (5 分钟)

### 1. SSH 到 coco

```bash
ssh user@coco.local
cd /Users/yumei/SAFvsOil
```

### 2. 验证环境

```bash
node --version    # 应为 v20.x+
npm --version     # 应为 10.x+
```

### 3. 配置 webhook 密钥

```bash
# .env.webhook 已生成 (位置: /Users/yumei/SAFvsOil/.env.webhook)
# 验证配置
cat .env.webhook
```

**输出示例**:
```
GITHUB_WEBHOOK_SECRET=a7c2e9f1b4d6e8a3c5f7b9d1e3a5c7f9b1d3e5a7c9f1b3d5e7a9b1c3d5e7a9
WEBHOOK_PORT=3001
LOG_DIR=./webhook-logs
NODE_ENV=production
```

### 4. 启动 webhook 服务

#### 方法 A: 直接启动 (开发)

```bash
export $(cat .env.webhook | xargs)
cd /Users/yumei/SAFvsOil
./scripts/start-webhook.sh
```

**预期输出**:
```
✓ Node.js: v20.x.x
✓ Webhook server script found
✓ Auto-sync script found
✓ Log directory: ./webhook-logs
✓ GITHUB_WEBHOOK_SECRET is set

=== Starting Webhook Server (Direct) ===
Port:        3001
Environment: production
Log Dir:     ./webhook-logs

→ Press Ctrl+C to stop

GitHub Webhook server running on port 3001
Health check: http://localhost:3001/health
Webhook endpoint: POST http://localhost:3001/webhook/push
Status endpoint: GET http://localhost:3001/webhook/status
```

#### 方法 B: 使用 PM2 (生产推荐)

```bash
# 安装 PM2 (如果未安装)
npm install pm2 -g

# 启动服务
cd /Users/yumei/SAFvsOil
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh --pm2
```

**预期输出**:
```
✓ Using PM2 config: /Users/yumei/SAFvsOil/ecosystem.config.js
✓ Webhook server started with PM2

Useful commands:
  pm2 logs webhook           # 查看实时日志
  pm2 status webhook         # 检查状态
  pm2 stop webhook           # 停止 webhook
  pm2 restart webhook        # 重启 webhook
  pm2 delete webhook         # 删除 webhook
```

---

## 验证部署

### 健康检查

```bash
# 在 coco 本地
curl http://localhost:3001/health

# 预期响应
{
  "status": "ok",
  "timestamp": "2026-04-22T10:30:45.123Z",
  "uptime": 123.456
}
```

### 从其他节点访问

```bash
# 从 mac-mini 或其他节点
curl http://coco.local:3001/health

# 预期响应 (同上)
```

### 检查日志

#### PM2 模式
```bash
pm2 logs webhook

# 或查看特定的日志文件
tail -f /Users/yumei/SAFvsOil/webhook-logs/webhook-$(date +%Y-%m-%d).log
```

#### 直接启动模式
```bash
# 日志直接输出到终端
# 或查看日志文件
tail -f /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log
```

### 检查端口监听

```bash
lsof -i :3001
# 预期: node ... (LISTEN)

# 或
netstat -an | grep 3001
```

### 查看最近的 webhook 事件

```bash
curl http://localhost:3001/webhook/status?limit=10
# 或
curl http://coco.local:3001/webhook/status?limit=10

# 预期响应
{
  "events": [
    {
      "timestamp": "2026-04-22T10:30:45.123Z",
      "level": "info",
      "message": "Valid webhook received",
      "ip": "192.168.1.100",
      "ref": "refs/heads/master",
      "repository": "wyl2607/safvsoil"
    }
  ],
  "total": 1
}
```

---

## 故障排查

### 问题 1: 端口已被占用

```bash
# 查找占用 3001 的进程
lsof -i :3001

# 杀死该进程 (如果确认无需)
kill -9 <PID>

# 或在 .env.webhook 中更改端口
WEBHOOK_PORT=3002
```

### 问题 2: GITHUB_WEBHOOK_SECRET 未设置

```bash
# 检查环境变量
echo $GITHUB_WEBHOOK_SECRET

# 如果为空，重新加载
export $(cat .env.webhook | xargs)
echo $GITHUB_WEBHOOK_SECRET
```

### 问题 3: 权限问题

```bash
# 确保脚本可执行
chmod +x /Users/yumei/SAFvsOil/scripts/start-webhook.sh
chmod +x /Users/yumei/SAFvsOil/scripts/auto-sync-cluster.sh

# 确保日志目录可写
mkdir -p /Users/yumei/SAFvsOil/webhook-logs
chmod 755 /Users/yumei/SAFvsOil/webhook-logs
```

### 问题 4: Node 模块缺失

```bash
cd /Users/yumei/SAFvsOil
npm install

# 检查 express 是否安装
npm list express
```

---

## 配置 GitHub Webhook

### GitHub 上的配置步骤

1. 访问: https://github.com/wyl2607/safvsoil/settings/hooks
2. 点击 "Add webhook"
3. 填写表单:

| 字段 | 值 |
|------|-----|
| Payload URL | `http://coco.local:3001/webhook/push` |
| Content type | `application/json` |
| Secret | (从 .env.webhook 中的 GITHUB_WEBHOOK_SECRET 复制) |
| Events | `Push events` only |
| Active | ✓ (勾选) |

4. 点击 "Add webhook"

### 测试 Webhook

GitHub 页面 → Webhook → "Recent Deliveries" 标签
- 应该看到 200 或 202 状态码
- 点击每个 delivery 查看详情

---

## 安全建议

1. **定期轮换密钥**
   ```bash
   # 生成新密钥
   openssl rand -hex 32
   
   # 更新 .env.webhook 和 GitHub
   ```

2. **限制网络访问**
   - 如果有防火墙，只允许特定 IP 访问 3001
   - GitHub 的 webhook 发起 IP: https://api.github.com/meta

3. **监控日志**
   ```bash
   # 定期检查错误
   grep '"level":"error"' /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log
   ```

4. **备份配置**
   ```bash
   # 备份 .env.webhook (放在安全位置)
   cp .env.webhook ~/.ssh/safvsoil-webhook-backup.env
   chmod 600 ~/.ssh/safvsoil-webhook-backup.env
   ```

---

## PM2 进程管理

### 常用命令

```bash
# 查看所有进程
pm2 list

# 查看 webhook 状态
pm2 status webhook

# 实时日志
pm2 logs webhook

# 显示最后 100 行
pm2 logs webhook --lines 100

# 重启 webhook
pm2 restart webhook

# 停止 webhook
pm2 stop webhook

# 启动已停止的 webhook
pm2 start webhook

# 删除 webhook (从 PM2 管理中移除)
pm2 delete webhook

# 保存进程列表 (开机自启)
pm2 save
pm2 startup

# 取消开机自启
pm2 unstartup
```

### 监控 webhook

```bash
# 使用 PM2 自带的监控工具
pm2 monit

# 或定期检查
watch -n 5 'pm2 list'
```

---

## 生产检查清单

- [ ] Node.js v20+ 已验证
- [ ] .env.webhook 已配置
- [ ] 日志目录 (./webhook-logs) 已创建
- [ ] webhook-server.js 可执行
- [ ] auto-sync-cluster.sh 可执行
- [ ] 健康检查通过 (HTTP 200)
- [ ] PM2 进程已启动
- [ ] PM2 开机自启已配置 (pm2 startup && pm2 save)
- [ ] GitHub webhook 已配置
- [ ] GitHub webhook 测试成功
- [ ] 防火墙规则已配置 (如需)
- [ ] 日志轮转已配置 (可选)

---

## 回滚计划

如果 webhook 导致问题:

```bash
# 1. 停止 webhook
pm2 stop webhook
# 或
kill <PID>

# 2. 禁用 GitHub webhook
# 访问: https://github.com/wyl2607/safvsoil/settings/hooks
# 点击 webhook，勾选 "Pause deliveries"

# 3. 检查日志确定问题
tail -f /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log

# 4. 修复问题后重启
pm2 restart webhook
```

---

## 下一步

1. ✅ 验证 webhook 服务运行正常
2. ✅ 在 GitHub 上配置 webhook
3. ✅ 测试 webhook 端到端
4. ✅ 配置 PM2 开机自启
5. ✅ 设置日志监控告警 (可选)

---

**支持联系**: 如有问题，查看日志文件或联系运维团队

**最后更新**: 2026-04-22
