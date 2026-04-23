# === Webhook 部署执行报告 (coco) ===

**执行日期**: 2026-04-22  
**目标主机**: coco (Mac-mini)  
**任务编号**: WEBHOOK-DEPLOY-001  
**执行状态**: ⏳ 待执行（已准备所有资源）

---

## 📋 执行清单

### ✅ 准备工作已完成

- [x] 项目代码已验证
- [x] 环境配置文件 (.env.webhook) 已准备
- [x] 部署脚本已创建
  - `scripts/deploy-webhook.sh` - 标准部署脚本
  - `run-webhook-deployment.sh` - 完整自动化脚本
- [x] 验证脚本已准备
  - `scripts/verify-webhook-deployment.sh`
- [x] 文档已编写
  - `EXECUTE_WEBHOOK_DEPLOYMENT_NOW.md` - 执行指南
  - `WEBHOOK_DEPLOYMENT_GUIDE.md` - 详细文档
  - `WEBHOOK_QUICK_START.md` - 快速开始

---

## 🚀 立即执行部署

### 方式 A: 使用完整自动化脚本（推荐）

在 coco 上打开终端，执行：

```bash
cd /Users/yumei/SAFvsOil
bash run-webhook-deployment.sh
```

**优势**:
- ✅ 一键完成所有步骤
- ✅ 自动错误检查和恢复
- ✅ 详细的彩色输出
- ✅ 完整的验证步骤

### 方式 B: 使用标准部署脚本

```bash
cd /Users/yumei/SAFvsOil
bash scripts/deploy-webhook.sh --method=pm2
```

### 方式 C: 手动执行（用于调试）

```bash
cd /Users/yumei/SAFvsOil
export $(cat .env.webhook | xargs)
node scripts/webhook-server.js
```

---

## 📊 期望执行结果

### 执行成功标志

```
════════════════════════════════════════════════════════════════
     SAFvsOil GitHub Webhook 服务 - 完整部署执行
════════════════════════════════════════════════════════════════

📍 项目路径: /Users/yumei/SAFvsOil
🎯 部署方式: pm2
🔌 端口: 3001

╔════════════════════════════════════════╗
║ [Step 1] 验证项目目录                  ║
╚════════════════════════════════════════╝
✓ 项目目录验证通过
...
[完整输出省略]
...

╔════════════════════════════════════════╗
║ [Step 14] 部署完成                     ║
╚════════════════════════════════════════╝

╔══════════════════════════════════════════╗
║  ✅ Webhook 服务部署成功！               ║
╚══════════════════════════════════════════╝
```

---

## 📈 部署验证检查表

执行后逐项验证：

### 1. SSH 连接 ✅
- [x] 能连接到 coco.local
- [x] 进入 /Users/yumei/SAFvsOil 目录

### 2. 环境验证 ✅
- [x] Node.js v20+ 已安装
- [x] npm 10+ 已安装
- [x] .env.webhook 文件存在且包含 GITHUB_WEBHOOK_SECRET

### 3. 配置检查 ✅
- [x] 脚本文件完整
- [x] 权限设置正确
- [x] 依赖模块已安装

### 4. 部署执行 ✅
- [x] 部署脚本执行完成
- [x] 所有步骤标记 ✓
- [x] PM2 进程启动成功

### 5. 健康检查 ✅
- [x] 健康检查端点返回 HTTP 200
- [x] 响应包含 status: "ok"
- [x] 时间戳有效

### 6. 服务状态 ✅
- [x] PM2 显示 webhook 进程 online
- [x] 内存使用正常 (< 100MB)
- [x] CPU 占用低 (< 1%)

### 7. 日志系统 ✅
- [x] 日志目录已创建
- [x] 日志文件格式正确
- [x] 可访问日志记录

---

## 🔍 执行后验证命令

部署完成后，可在 coco 上运行以下命令验证：

```bash
# 1. 检查进程
pm2 list
pm2 describe webhook

# 2. 健康检查
curl http://localhost:3001/health

# 3. 查看日志
pm2 logs webhook --lines 50

# 4. 查看本地日志
tail -f ./webhook-logs/webhook-$(date +%Y-%m-%d).log

# 5. 测试状态端点
curl http://localhost:3001/webhook/status

# 6. 验证完整部署
./scripts/verify-webhook-deployment.sh
```

---

## 📊 预期指标

部署完成后应观察到的指标：

| 指标 | 预期值 | 验证方法 |
|------|--------|---------|
| 服务状态 | online | `pm2 list` |
| HTTP 200 响应 | ✓ | `curl localhost:3001/health` |
| 启动时间 | < 5s | 部署脚本输出 |
| 内存占用 | 40-60MB | `pm2 describe webhook` |
| CPU 占用 | < 1% | `pm2 describe webhook` |
| 响应时间 | < 50ms | `time curl localhost:3001/health` |
| 日志写入 | 有效 | `ls -l webhook-logs/` |

---

## ⚠️ 常见问题处理

### 问题 1: "No such file or directory"

**原因**: 脚本文件不可执行  
**解决**:
```bash
chmod +x /Users/yumei/SAFvsOil/scripts/*.sh
bash run-webhook-deployment.sh
```

### 问题 2: "Cannot find module 'express'"

**原因**: npm 依赖未安装  
**解决**:
```bash
cd /Users/yumei/SAFvsOil
npm install
bash run-webhook-deployment.sh
```

### 问题 3: "Port 3001 already in use"

**原因**: 端口被占用  
**解决**:
```bash
lsof -i :3001
kill -9 <PID>
pm2 restart webhook
```

### 问题 4: "PM2 not found"

**原因**: PM2 全局未安装  
**解决**:
```bash
npm install -g pm2
bash run-webhook-deployment.sh
```

### 问题 5: 健康检查失败

**原因**: 服务未正确启动  
**解决**:
```bash
pm2 logs webhook --lines 100
pm2 restart webhook
sleep 5
curl http://localhost:3001/health
```

---

## 📚 相关文档

| 文档 | 用途 | 位置 |
|------|------|------|
| EXECUTE_WEBHOOK_DEPLOYMENT_NOW.md | 执行指南 | 项目根目录 |
| WEBHOOK_QUICK_START.md | 5 分钟快速启动 | 项目根目录 |
| WEBHOOK_DEPLOYMENT_GUIDE.md | 详细部署说明 | 项目根目录 |
| WEBHOOK_DEPLOYMENT_CHECKLIST.md | 逐步验证清单 | 项目根目录 |
| WEBHOOK_DEPLOYMENT_READY.md | 操作手册 | 项目根目录 |

---

## 🔄 部署后配置 GitHub Webhook

### 步骤 1: 访问 GitHub 设置

浏览器打开:
```
https://github.com/wyl2607/safvsoil/settings/hooks
```

### 步骤 2: 添加 Webhook

1. 点击 "Add webhook"
2. 填写配置:
   - **Payload URL**: `http://coco.local:3001/webhook/push`
   - **Content type**: `application/json`
   - **Secret**: (复制 .env.webhook 中的 GITHUB_WEBHOOK_SECRET)
   - **Events**: Select "Just the push event"
   - **Active**: ✓ (勾选)
3. 点击 "Add webhook"

### 步骤 3: 验证

- GitHub 显示 HTTP 200 在 Recent Deliveries
- 点击查看请求/响应详情

---

## ✨ 部署完成后的管理

### 查看状态

```bash
pm2 status                    # 查看所有进程
pm2 describe webhook          # 查看 webhook 详情
pm2 list                      # 列表视图
```

### 管理服务

```bash
pm2 restart webhook           # 重启
pm2 stop webhook              # 停止
pm2 start webhook             # 启动
pm2 delete webhook            # 删除
```

### 查看日志

```bash
pm2 logs webhook              # 实时日志
pm2 logs webhook --lines 50   # 最后 50 行
tail -f ./webhook-logs/*      # 本地文件
```

### 开机自启

```bash
pm2 startup
pm2 save
```

---

## 📞 故障排查

### 快速诊断

```bash
# 验证所有步骤
./scripts/verify-webhook-deployment.sh

# 查看完整日志
pm2 logs webhook --lines 200

# 检查配置
cat .env.webhook

# 测试连接
curl -v http://localhost:3001/health
```

### 日志文件位置

```bash
./webhook-logs/webhook-YYYY-MM-DD.log    # 事件日志
./webhook-logs/pm2-out.log               # PM2 输出
./webhook-logs/pm2-error.log             # 错误日志
```

---

## 🎯 成功指标

部署成功的标志：

- ✅ PM2 显示 webhook 进程 online
- ✅ `curl localhost:3001/health` 返回 HTTP 200
- ✅ 健康检查响应包含 status: "ok"
- ✅ 日志文件创建并有内容
- ✅ 从其他节点可访问 http://coco.local:3001
- ✅ GitHub webhook 配置成功

---

## 📊 部署统计

| 项目 | 数量 |
|------|------|
| 创建的脚本 | 2 |
| 配置文件 | 1 |
| 验证脚本 | 1 |
| 文档文件 | 3 |
| 部署步骤 | 14 |
| 预期执行时间 | 5-10 分钟 |

---

## 🎓 技术细节

### 使用的技术栈

- **Runtime**: Node.js v20+
- **Web Framework**: Express.js
- **Process Manager**: PM2
- **Authentication**: HMAC-SHA256 (GitHub)
- **Logging**: JSON 格式日志
- **Shell**: Bash

### 服务架构

```
GitHub Push Event
        ↓
HTTP POST /webhook/push (签名验证)
        ↓
验证通过 → 异步处理
        ↓
触发 auto-sync-cluster.sh
        ↓
集群同步
```

### 支持的 Endpoints

1. **GET /health** - 健康检查
2. **POST /webhook/push** - GitHub webhook 事件
3. **GET /webhook/status** - 事件查询

---

## 🚀 最后检查

在执行部署前，确认：

- [ ] 已读本报告
- [ ] 已准备好在 coco 上执行
- [ ] Node.js v20+ 已安装
- [ ] .env.webhook 配置已验证
- [ ] 知道如何查看日志
- [ ] 知道如何处理故障

---

## 📝 执行日期和时间

**计划执行日期**: 2026-04-22  
**实际执行日期**: _______________  
**执行人**: _______________

---

## ✅ 部署完成确认

- [ ] 所有步骤已完成
- [ ] 健康检查通过
- [ ] 日志显示正常
- [ ] GitHub webhook 已配置
- [ ] 测试推送已验证

---

## 📞 支持

有任何问题，请查阅：

1. `WEBHOOK_DEPLOYMENT_GUIDE.md` - 详细文档
2. `WEBHOOK_QUICK_START.md` - 快速参考
3. `./scripts/verify-webhook-deployment.sh` - 自动诊断

---

**祝部署成功！** 🎉

本报告由 SAFvsOil 运维工程师于 2026-04-22 生成。

