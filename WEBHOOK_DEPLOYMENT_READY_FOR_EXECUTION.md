# Webhook 部署 - 执行总结报告

**日期**: 2026-04-22  
**环境**: coco (Mac-mini)  
**项目**: SAFvsOil / esg-research-toolkit  
**状态**: 🟡 部署脚本就绪，等待在 coco 上执行  

---

## 📋 部署前检查清单

### ✅ 已完成的准备工作

- [x] 项目目录结构完整
  - `/Users/yumei/SAFvsOil/` 存在
  - `package.json` 已配置
  - `run-webhook-deployment.sh` 已准备

- [x] 脚本文件完整
  - `scripts/webhook-server.js` - Webhook 服务主程序
  - `scripts/auto-sync-cluster.sh` - 集群同步脚本
  - `scripts/deploy-webhook.sh` - 部署辅助脚本
  - `scripts/verify-webhook-deployment.sh` - 验证脚本

- [x] 环境配置已准备
  - `.env.webhook` 已创建并配置
  - `GITHUB_WEBHOOK_SECRET` 已设置
  - `WEBHOOK_PORT=3001` 已配置

- [x] 文档已准备
  - `WEBHOOK_DEPLOYMENT_EXECUTION_GUIDE.md` - 详细执行指南
  - `verify-webhook-local.mjs` - 本地验证脚本

---

## 🚀 部署执行步骤

### 在 coco 上执行以下命令：

#### 方式 A：一键部署（推荐）

```bash
cd /Users/yumei/SAFvsOil
bash run-webhook-deployment.sh
```

这将自动完成：
1. ✅ 验证项目目录
2. ✅ 检查 Node.js (v20+) 和 npm
3. ✅ 验证 .env.webhook 配置
4. ✅ 安装 npm 依赖
5. ✅ 创建日志目录
6. ✅ 安装 PM2
7. ✅ 启动 Webhook 服务
8. ✅ 验证服务状态
9. ✅ 执行健康检查
10. ✅ 显示部署完成信息

#### 方式 B：先验证再部署

```bash
# 第一步：本地验证
cd /Users/yumei/SAFvsOil
node verify-webhook-local.mjs

# 第二步：执行部署
bash run-webhook-deployment.sh
```

#### 方式 C：手动分步部署（如脚本出现问题）

参考 `WEBHOOK_DEPLOYMENT_EXECUTION_GUIDE.md` 中的"方式 B：手动分步部署"部分。

---

## ✅ 验证部署成功的标志

### 1. PM2 进程状态
```bash
pm2 list
```
预期：webhook 进程显示 `online` 状态

### 2. 健康检查（本地）
```bash
curl -s http://localhost:3001/health | jq .
```
预期：
```json
{
  "status": "ok",
  "timestamp": "2026-04-22T20:15:30.123Z",
  "uptime": 15.234
}
```

### 3. 健康检查（远程）
从本地 Mac 执行：
```bash
curl -s http://coco.local:3001/health | jq .
```

### 4. 查看实时日志
```bash
pm2 logs webhook --lines 20
```
预期：
```
webhook-0 | [INFO] 2026-04-22 20:15:15 - Webhook server started
webhook-0 | [INFO] 2026-04-22 20:15:15 - Health check: http://localhost:3001/health
```

### 5. Webhook 事件状态
```bash
curl -s http://localhost:3001/webhook/status | jq .
```

---

## 🔧 部署脚本详解

### run-webhook-deployment.sh

**位置**: `/Users/yumei/SAFvsOil/run-webhook-deployment.sh`  
**功能**: 完整的一键部署脚本  
**包含**: 14 个执行步骤，覆盖从验证到健康检查的全过程

**主要步骤**:
1. `step_verify_directory` - 验证项目目录
2. `step_check_nodejs` - 检查 Node.js 版本
3. `step_check_env_file` - 验证 .env.webhook
4. `step_check_scripts` - 检查必要脚本
5. `step_load_env` - 加载环境变量
6. `step_check_dependencies` - 检查/安装依赖
7. `step_create_log_dir` - 创建日志目录
8. `step_install_pm2` - 安装 PM2
9. `step_cleanup_old_process` - 清理旧进程
10. `step_deploy_webhook` - 部署到 PM2
11. `step_verify_service` - 验证服务状态
12. `step_health_check` - 执行健康检查
13. `step_verify_logs` - 验证日志系统
14. `step_show_completion` - 显示完成信息

### scripts/webhook-server.js

**位置**: `/Users/yumei/SAFvsOil/scripts/webhook-server.js`  
**语言**: JavaScript (Node.js)  
**依赖**: express, crypto (内置)

**功能**:
- 监听 GitHub webhook 事件
- 验证 HMAC-SHA256 签名
- 仅处理 master 分支推送
- 触发集群同步脚本
- 提供健康检查端点
- 记录所有事件到日志文件

**端点**:
- `GET /health` - 健康检查
- `POST /webhook/push` - GitHub webhook 接收
- `GET /webhook/status` - Webhook 事件查询

---

## 🔐 安全配置

### GitHub Webhook 设置

在 GitHub 仓库设置中配置：

1. **Repository Settings** → **Webhooks** → **Add webhook**

2. **Payload URL**
   ```
   http://coco.local:3001/webhook/push
   ```

3. **Content type**
   ```
   application/json
   ```

4. **Secret**
   从 `.env.webhook` 中的 `GITHUB_WEBHOOK_SECRET` 复制：
   ```
   a7c2e9f1b4d6e8a3c5f7b9d1e3a5c7f9b1d3e5a7c9f1b3d5e7a9b1c3d5e7a9
   ```

5. **Events**
   - [x] Push events
   - [ ] (其他不需要)

6. **Active**
   - [x] 勾选激活

---

## 📊 部署统计

| 项目 | 状态 | 详情 |
|-----|------|------|
| 脚本准备 | ✅ 完成 | run-webhook-deployment.sh 已准备 |
| 环境配置 | ✅ 完成 | .env.webhook 已配置完整 |
| 依赖声明 | ✅ 完成 | package.json 已准备 |
| 文档 | ✅ 完成 | 执行指南和验证脚本已生成 |
| 实际部署 | ⏳ 待执行 | 需在 coco 上运行部署脚本 |
| 服务验证 | ⏳ 待执行 | 部署后执行健康检查 |
| GitHub 配置 | ⏳ 待执行 | 部署后在 GitHub 配置 webhook |

---

## 🎯 下一步

### 1. 立即执行部署（在 coco 上）
```bash
cd /Users/yumei/SAFvsOil
bash run-webhook-deployment.sh
```

### 2. 验证部署完成
```bash
pm2 status
curl http://localhost:3001/health
```

### 3. 配置 GitHub Webhook
访问 GitHub 仓库 Settings，添加 webhook：
- URL: `http://coco.local:3001/webhook/push`
- Secret: (从 .env.webhook)

### 4. 测试部署
推送到 master 分支并检查日志：
```bash
pm2 logs webhook
```

---

## 📚 相关文档

| 文件 | 说明 |
|-----|------|
| `WEBHOOK_DEPLOYMENT_EXECUTION_GUIDE.md` | 详细的执行指南和故障排查 |
| `verify-webhook-local.mjs` | 本地验证脚本 |
| `run-webhook-deployment.sh` | 一键部署脚本 |
| `scripts/webhook-server.js` | Webhook 服务主程序 |
| `scripts/auto-sync-cluster.sh` | 集群同步脚本 |
| `.env.webhook` | 环境配置文件 |

---

## 💬 快速参考

### 常用命令

```bash
# 查看服务状态
pm2 status

# 查看实时日志
pm2 logs webhook

# 重启服务
pm2 restart webhook

# 停止服务
pm2 stop webhook

# 健康检查
curl http://localhost:3001/health

# 查看 webhook 事件
curl http://localhost:3001/webhook/status
```

### 关键环境变量

```bash
WEBHOOK_PORT=3001              # 服务端口
GITHUB_WEBHOOK_SECRET=...      # GitHub 签名密钥
LOG_DIR=./webhook-logs         # 日志目录
NODE_ENV=production            # 运行环境
```

---

## ❓ 常见问题

**Q: 脚本需要什么权限？**  
A: 标准用户权限即可，部分操作（如 PM2 自启动）可能需要 sudo。

**Q: 如果部署失败怎么办？**  
A: 检查 `WEBHOOK_DEPLOYMENT_EXECUTION_GUIDE.md` 中的故障排查章节。

**Q: 如何查看部署日志？**  
A: 
```bash
pm2 logs webhook
# 或
tail -f webhook-logs/webhook-*.log
```

**Q: 如何重新部署？**  
A: 
```bash
pm2 stop webhook
pm2 delete webhook
bash run-webhook-deployment.sh
```

**Q: 服务会自动重启吗？**  
A: 是，运行 `pm2 save` 后，服务会在系统重启时自动启动。

---

## 📞 支持

如需帮助，请检查：
1. `WEBHOOK_DEPLOYMENT_EXECUTION_GUIDE.md` 的故障排查章节
2. PM2 日志: `pm2 logs webhook`
3. 应用日志: `tail webhook-logs/*.log`

---

**准备状态**: ✅ 所有准备工作完成，等待 coco 上的执行  
**下一步**: 在 coco 上执行 `bash run-webhook-deployment.sh`
