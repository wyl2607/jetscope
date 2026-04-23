# SAFvsOil Webhook 部署 - 最终执行指南

**发布日期**: 2026-04-22  
**部署主机**: coco (Mac-mini)  
**状态**: ✅ **完全就绪**

---

## 🚀 30 秒快速启动

```bash
# 1. SSH 到 coco
ssh user@coco.local

# 2. 进入项目并加载环境
cd /Users/yumei/SAFvsOil
export $(cat .env.webhook | xargs)

# 3. 启动服务 (选一个)
./scripts/start-webhook.sh --pm2        # 推荐: PM2 模式
# 或
./scripts/start-webhook.sh              # 开发: 直接模式

# 4. 验证
curl http://localhost:3001/health
# 预期: {"status":"ok",...}
```

---

## 📦 部署物一览

| 文件 | 描述 | 状态 |
|------|------|------|
| `.env.webhook` | 环境配置 (含 GitHub Secret) | ✅ |
| `scripts/webhook-server.js` | Webhook 核心服务 | ✅ |
| `scripts/start-webhook.sh` | 启动脚本 | ✅ |
| `scripts/auto-sync-cluster.sh` | 集群同步 | ✅ |
| `scripts/verify-webhook-deployment.sh` | 验证脚本 | ✅ |
| `scripts/deploy-webhook.sh` | 一键部署 | ✅ |
| `ecosystem.config.js` | PM2 配置 | ✅ |
| 文档 (4 个 markdown) | 指南和清单 | ✅ |

---

## ⚡ 完整部署流程 (5 步)

### 步骤 1: SSH 连接

```bash
ssh user@coco.local
cd /Users/yumei/SAFvsOil

# 验证
pwd                          # 显示当前目录
ls .env.webhook             # 文件存在
node --version              # 应为 v20+
```

### 步骤 2: 加载环境

```bash
export $(cat .env.webhook | xargs)

# 验证
echo $GITHUB_WEBHOOK_SECRET  # 显示密钥
echo $WEBHOOK_PORT           # 显示 3001
```

### 步骤 3: 启动服务

#### 选项 A: PM2 (生产推荐)

```bash
./scripts/deploy-webhook.sh --method=pm2
```

#### 选项 B: 直接启动 (开发)

```bash
./scripts/start-webhook.sh
# Ctrl+C 停止
```

#### 选项 C: PM2 手动启动

```bash
./scripts/start-webhook.sh --pm2
```

### 步骤 4: 验证部署

```bash
# 本地健康检查
curl http://localhost:3001/health
# 预期: {"status":"ok","timestamp":"...","uptime":...}

# 自动化验证
./scripts/verify-webhook-deployment.sh
# 预期: ✓ All checks passed!

# 查看 PM2 状态
pm2 list              # 看到 webhook 进程 online
pm2 logs webhook      # 查看启动日志
```

### 步骤 5: 远程验证

```bash
# 从其他节点 (例如 mac-mini)
curl http://coco.local:3001/health
# 应该返回相同的 OK 响应
```

---

## 🔐 配置 GitHub Webhook

### 在 GitHub 上

1. 访问: https://github.com/wyl2607/safvsoil/settings/hooks
2. 点击 "Add webhook"
3. 填写:

```
Payload URL:    http://coco.local:3001/webhook/push
Content type:   application/json
Secret:         [从 .env.webhook 中复制 GITHUB_WEBHOOK_SECRET]
Events:         Push events (只选此项)
Active:         ✓ (勾选)
```

4. 点击 "Add webhook"

### 测试 Webhook

在 GitHub webhook 页面:
- "Recent Deliveries" 标签
- 应该看到绿色 ✓ (状态 200 或 202)
- 点击可查看请求和响应

---

## 🧪 端到端测试

### 推送测试

```bash
cd /Users/yumei/SAFvsOil

# 做个小改动
echo "# Webhook test" >> README.md

# 提交并推送
git add README.md
git commit -m "test: webhook"
git push origin master
```

### 验证同步

```bash
# 查看 webhook 事件日志
tail -f ./webhook-logs/webhook-$(date +%Y-%m-%d).log

# 预期: 看到 "Valid webhook received" 和 "Processing master branch push"
# 然后: 看到 "Cluster sync completed"

# 或查询 webhook 状态
curl http://localhost:3001/webhook/status?limit=10

# 或 PM2 日志
pm2 logs webhook --lines 50
```

### 检查其他节点同步

```bash
# 在其他集群节点上
# 检查是否同步到新的 commit
git log --oneline -1

# 应该显示刚推送的 commit
```

---

## 📊 PM2 进程管理

### 常用命令

```bash
# 查看状态
pm2 list                    # 所有进程
pm2 status webhook          # webhook 状态
pm2 describe webhook        # 详细信息

# 日志
pm2 logs webhook            # 实时日志
pm2 logs webhook --lines 50 # 最后 50 行
pm2 save                    # 保存日志

# 控制
pm2 restart webhook         # 重启
pm2 stop webhook            # 停止
pm2 start webhook           # 启动
pm2 delete webhook          # 删除

# 开机自启
pm2 startup                 # 配置开机自启
pm2 save                    # 保存进程列表
pm2 unstartup               # 取消开机自启
```

### 监控

```bash
# 实时监控
pm2 monit

# 或定期检查
watch -n 5 'pm2 list'
```

---

## 📂 日志文件

### 位置

```bash
# Webhook 事件日志 (每日一个)
/Users/yumei/SAFvsOil/webhook-logs/webhook-YYYY-MM-DD.log

# PM2 输出日志
/Users/yumei/SAFvsOil/webhook-logs/pm2-out.log

# PM2 错误日志
/Users/yumei/SAFvsOil/webhook-logs/pm2-error.log

# 集群同步日志
/Users/yumei/SAFvsOil/webhook-logs/sync-*.log
```

### 查看日志

```bash
# 最后 100 行
tail -100 /Users/yumei/SAFvsOil/webhook-logs/webhook-2026-04-22.log

# 实时跟踪
tail -f /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log

# JSON 格式查看
tail -f /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log | jq .

# 搜索错误
grep error /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log | jq .
```

---

## 🆘 故障排查

| 问题 | 解决方案 |
|------|---------|
| **无法连接到 coco** | `ping coco.local` 或 `ssh -v user@coco.local` |
| **Node.js 版本过低** | 升级到 v20+ (https://nodejs.org/) |
| **端口 3001 被占用** | 改用其他端口或 `kill -9 <PID>` |
| **权限拒绝** | `chmod +x scripts/*.sh` |
| **环境变量未加载** | `export $(cat .env.webhook \| xargs)` |
| **PM2 未安装** | `npm install -g pm2` |
| **Webhook 不响应** | 检查 GitHub 配置或查看日志 |
| **集群不同步** | 检查 auto-sync-cluster.sh 日志 |

### 调试技巧

```bash
# 查看完整错误
pm2 logs webhook --lines 100

# 测试健康检查
curl -v http://localhost:3001/health

# 检查端口监听
lsof -i :3001

# 检查防火墙
sudo ufw status

# 测试网络连接
nc -zv coco.local 3001
```

---

## 🎯 下一步

### 立即行动

- [ ] SSH 到 coco
- [ ] 加载环境变量
- [ ] 运行 `./scripts/deploy-webhook.sh --method=pm2`
- [ ] 验证: `curl http://localhost:3001/health`
- [ ] 配置 GitHub webhook
- [ ] 推送到 master 分支测试

### 生产检查

- [ ] 配置 PM2 开机自启 (`pm2 startup && pm2 save`)
- [ ] 配置日志轮转
- [ ] 设置监控告警
- [ ] 备份 .env.webhook (安全位置)
- [ ] 记录 webhook secret (1Password 或类似)

### 文档

- [ ] 共享本指南给团队
- [ ] 更新 runbook
- [ ] 记录任何定制配置
- [ ] 建立告警规则

---

## 📚 文档导航

| 文档 | 内容 | 用途 |
|------|------|------|
| **WEBHOOK_QUICK_START.md** | 5 分钟快速启动 | 快速参考 |
| **WEBHOOK_DEPLOYMENT_GUIDE.md** | 详细部署指南 | 完整说明 |
| **WEBHOOK_DEPLOYMENT_SUMMARY.md** | 部署总结 | 概览和背景 |
| **WEBHOOK_DEPLOYMENT_CHECKLIST.md** | 执行清单 | 一步步验证 |
| **本文件** | 最终执行指南 | 操作手册 |

---

## 🔗 API 参考

### 端点

```bash
# 健康检查
GET http://coco.local:3001/health
# 响应: {"status":"ok","timestamp":"...","uptime":123.456}

# Webhook 状态 (最近事件)
GET http://coco.local:3001/webhook/status?limit=20
# 响应: {"events":[...], "total":5}

# Webhook 事件处理 (GitHub POST)
POST http://coco.local:3001/webhook/push
# 必需头: X-Hub-Signature-256 (GitHub 自动添加)
# 必需头: Content-Type: application/json
# 仅处理: refs/heads/master 推送
```

### 示例

```bash
# 手动测试 (需要有效的签名)
curl -X POST http://localhost:3001/webhook/push \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=abc..." \
  -d '{
    "ref": "refs/heads/master",
    "after": "abc123def456...",
    "repository": {
      "full_name": "wyl2607/safvsoil"
    }
  }'
```

---

## 💾 备份和恢复

### 备份

```bash
# 备份 webhook 配置
cp /Users/yumei/SAFvsOil/.env.webhook ~/backup/.env.webhook.bak

# 备份 webhook 日志
tar czf ~/backup/webhook-logs-$(date +%Y%m%d).tar.gz \
  /Users/yumei/SAFvsOil/webhook-logs/

# 备份 PM2 配置
pm2 save
cp ~/.pm2/dump.pm2 ~/backup/pm2-dump.pm2.bak
```

### 恢复

```bash
# 恢复 .env.webhook
cp ~/backup/.env.webhook.bak /Users/yumei/SAFvsOil/.env.webhook

# 恢复 PM2 配置
cp ~/backup/pm2-dump.pm2.bak ~/.pm2/dump.pm2
pm2 resurrect
```

---

## ⚙️ 高级配置

### 自定义端口

```bash
# 编辑 .env.webhook
sed -i 's/WEBHOOK_PORT=3001/WEBHOOK_PORT=3002/' .env.webhook

# 重启服务
pm2 restart webhook
```

### 自定义同步脚本

编辑 `scripts/auto-sync-cluster.sh`:
- 修改 NODES 数组 (添加/删除节点)
- 修改 REPO_PATH (如果项目路径不同)
- 修改 TIMEOUT 和 RETRIES

### 启用通知

在 .env.webhook 中配置:

```bash
# Slack 通知
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# 邮件通知
ADMIN_EMAIL=admin@example.com
```

---

## 🎓 学习资源

- [Express.js 文档](https://expressjs.com/)
- [GitHub Webhooks](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
- [PM2 文档](https://pm2.keymetrics.io/)
- [Bash 脚本教程](https://www.gnu.org/software/bash/manual/)

---

## 📞 支持

### 遇到问题?

1. 查看日志: `pm2 logs webhook --lines 100`
2. 运行验证: `./scripts/verify-webhook-deployment.sh`
3. 检查清单: `WEBHOOK_DEPLOYMENT_CHECKLIST.md`
4. 读完整指南: `WEBHOOK_DEPLOYMENT_GUIDE.md`

### 联系方式

- 团队 Slack: #infrastructure
- 邮件: devops@example.com
- 文档: https://wiki.example.com

---

## ✅ 部署检查清单 (最终版)

在声明部署"完成"前，检查以下所有项目:

- [ ] 服务在 coco:3001 运行
- [ ] 健康检查通过 (HTTP 200)
- [ ] 可从其他节点访问
- [ ] PM2 进程在线
- [ ] 日志目录创建
- [ ] GitHub webhook 已配置
- [ ] 测试推送成功
- [ ] 集群同步验证
- [ ] PM2 开机自启已配置
- [ ] 文档已共享给团队

---

**状态**: ✅ 完全就绪，可立即部署  
**最后更新**: 2026-04-22  
**维护者**: DevOps Team

---

**开始部署** 🚀

```bash
ssh user@coco.local
cd /Users/yumei/SAFvsOil
export $(cat .env.webhook | xargs)
./scripts/deploy-webhook.sh --method=pm2
```
