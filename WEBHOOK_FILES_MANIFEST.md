# SAFvsOil Webhook 部署 - 文件清单

**生成日期**: 2026-04-22  
**项目**: SAFvsOil GitHub Webhook 服务  
**部署目标**: coco (Mac-mini) - coco.local:3001

---

## 📋 已生成文件列表

### 核心配置

| 文件 | 大小 | 描述 | 状态 |
|------|------|------|------|
| `.env.webhook` | 580 B | Webhook 环境配置 (含 GitHub Secret) | ✅ |
| `ecosystem.config.js` | 2 KB | PM2 生态配置 | ✅ |

### 脚本文件

| 文件 | 大小 | 描述 | 状态 |
|------|------|------|------|
| `scripts/webhook-server.js` | 8.5 KB | Express Webhook 服务器 | ✅ |
| `scripts/start-webhook.sh` | 7.6 KB | 启动脚本 (支持直接/PM2) | ✅ |
| `scripts/auto-sync-cluster.sh` | 12 KB | 集群自动同步脚本 | ✅ |
| `scripts/verify-webhook-deployment.sh` | 7.6 KB | 部署验证脚本 | ✅ |
| `scripts/deploy-webhook.sh` | 8.4 KB | 一键部署脚本 | ✅ |

### 文档文件

| 文件 | 大小 | 描述 | 用途 | 状态 |
|------|------|------|------|------|
| `WEBHOOK_QUICK_START.md` | 3.8 KB | 5 分钟快速启动 | 快速参考 | ✅ |
| `WEBHOOK_DEPLOYMENT_GUIDE.md` | 5.7 KB | 详细部署指南 | 完整说明 | ✅ |
| `WEBHOOK_DEPLOYMENT_SUMMARY.md` | 6.5 KB | 部署总结报告 | 项目总览 | ✅ |
| `WEBHOOK_DEPLOYMENT_CHECKLIST.md` | 已存在 | 执行清单 | 逐步验证 | ✅ |
| `WEBHOOK_DEPLOYMENT_READY.md` | 8.1 KB | 最终执行指南 | 操作手册 | ✅ |

### 本文件

| 文件 | 大小 | 描述 | 状态 |
|------|------|------|------|
| `WEBHOOK_FILES_MANIFEST.md` | 本文 | 文件清单 | ✅ |

---

## 🎯 总文件统计

| 类别 | 数量 | 大小 |
|------|------|------|
| 配置文件 | 2 | 2.6 KB |
| 脚本文件 | 5 | 44.1 KB |
| 文档文件 | 6 | 34.2 KB |
| **总计** | **13** | **~80 KB** |

---

## 📁 文件结构

```
/Users/yumei/SAFvsOil/
├── .env.webhook                           (环境配置)
├── ecosystem.config.js                    (PM2 配置)
├── scripts/
│   ├── webhook-server.js                  (核心服务)
│   ├── start-webhook.sh                   (启动脚本)
│   ├── auto-sync-cluster.sh               (集群同步)
│   ├── verify-webhook-deployment.sh       (验证脚本)
│   └── deploy-webhook.sh                  (一键部署)
├── WEBHOOK_QUICK_START.md                 (快速启动)
├── WEBHOOK_DEPLOYMENT_GUIDE.md            (详细指南)
├── WEBHOOK_DEPLOYMENT_SUMMARY.md          (总结报告)
├── WEBHOOK_DEPLOYMENT_CHECKLIST.md        (执行清单)
├── WEBHOOK_DEPLOYMENT_READY.md            (操作手册)
└── WEBHOOK_FILES_MANIFEST.md              (本文件)
```

---

## 🔑 关键文件说明

### 1. `.env.webhook` (必读)

**位置**: `/Users/yumei/SAFvsOil/.env.webhook`

**作用**: 存储 webhook 配置和 GitHub Secret

**关键变量**:
- `GITHUB_WEBHOOK_SECRET`: GitHub webhook 签名密钥 (必需)
- `WEBHOOK_PORT`: 服务监听端口 (默认 3001)
- `LOG_DIR`: 日志目录 (默认 ./webhook-logs)
- `NODE_ENV`: 运行环境 (production)

**示例**:
```bash
GITHUB_WEBHOOK_SECRET=a7c2e9f1b4d6e8a3c5f7b9d1e3a5c7f9b1d3e5a7c9f1b3d5e7a9b1c3d5e7a9
WEBHOOK_PORT=3001
LOG_DIR=./webhook-logs
NODE_ENV=production
```

### 2. `scripts/webhook-server.js` (核心)

**位置**: `/Users/yumei/SAFvsOil/scripts/webhook-server.js`

**作用**: Express.js 应用，处理 GitHub webhook 事件

**主要功能**:
- 监听 3001 端口
- 验证 GitHub 签名 (HMAC-SHA256)
- 处理 master 分支推送事件
- 触发集群自动同步
- 提供健康检查和状态端点

**端点**:
- `GET /health` - 健康检查
- `POST /webhook/push` - GitHub webhook
- `GET /webhook/status` - 事件状态

### 3. `scripts/start-webhook.sh` (启动)

**位置**: `/Users/yumei/SAFvsOil/scripts/start-webhook.sh`

**作用**: 方便地启动 webhook 服务

**使用**:
```bash
./scripts/start-webhook.sh              # 直接启动
./scripts/start-webhook.sh --pm2        # PM2 启动
./scripts/start-webhook.sh --help       # 显示帮助
```

**功能**:
- 环境检查 (Node.js, 脚本, 目录)
- 支持直接启动或 PM2 启动
- 颜色化输出和错误处理

### 4. `scripts/auto-sync-cluster.sh` (同步)

**位置**: `/Users/yumei/SAFvsOil/scripts/auto-sync-cluster.sh`

**作用**: 当 master 分支有新推送时，自动同步所有集群节点

**目标节点**:
- mac-mini@192.168.1.100
- coco@coco.local
- france-vps@88.218.77.162
- us-vps@192.227.130.69

**使用**:
```bash
./scripts/auto-sync-cluster.sh <SHA> [ref]
```

**日志**: `webhook-logs/sync-*.log`

### 5. `scripts/verify-webhook-deployment.sh` (验证)

**位置**: `/Users/yumei/SAFvsOil/scripts/verify-webhook-deployment.sh`

**作用**: 自动化验证 webhook 部署

**检查项**:
- Node.js 版本
- 项目文件
- 环境配置
- 端口可用性
- PM2 进程
- 健康端点
- Webhook 状态

**使用**:
```bash
./scripts/verify-webhook-deployment.sh          # 本地验证
./scripts/verify-webhook-deployment.sh coco.local  # 远程验证
```

### 6. `scripts/deploy-webhook.sh` (一键部署)

**位置**: `/Users/yumei/SAFvsOil/scripts/deploy-webhook.sh`

**作用**: 自动化完整部署流程

**功能**:
- 环境检查
- 依赖安装
- 权限配置
- 服务启动
- 健康验证

**使用**:
```bash
./scripts/deploy-webhook.sh --method=pm2    # PM2 部署
./scripts/deploy-webhook.sh --method=direct # 直接部署
./scripts/deploy-webhook.sh --help          # 显示帮助
```

---

## 📖 文档选择指南

### 🟢 我想快速开始 → **WEBHOOK_QUICK_START.md**

- 5 分钟快速上手
- 包含所有必需命令
- 快速参考卡

**适合**: 急需部署、熟悉部署的人

### 🔵 我想了解完整过程 → **WEBHOOK_DEPLOYMENT_GUIDE.md**

- 详细的分步说明
- 故障排查指南
- 安全建议

**适合**: 首次部署、需要理解细节的人

### 🟡 我想看项目总览 → **WEBHOOK_DEPLOYMENT_SUMMARY.md**

- 部署架构
- 关键特性
- 后续优化

**适合**: 项目经理、审查人员

### 🟣 我需要一步步检查 → **WEBHOOK_DEPLOYMENT_CHECKLIST.md**

- 详细的验证清单
- 每步的预期输出
- 逐项检查

**适合**: 首次部署、需要确保完整性的人

### 🟠 我准备立即部署 → **WEBHOOK_DEPLOYMENT_READY.md**

- 30 秒快速启动
- 操作手册
- API 参考

**适合**: 已准备好部署的人

### 📋 我需要了解所有文件 → **本文件 (WEBHOOK_FILES_MANIFEST.md)**

- 文件清单
- 文件说明
- 文件结构

**适合**: 新加入的团队成员、想要系统了解的人

---

## 🚀 快速导航

### 第一次部署?

1. 读: **WEBHOOK_QUICK_START.md** (5 分钟)
2. 执行: `./scripts/deploy-webhook.sh --method=pm2`
3. 验证: `./scripts/verify-webhook-deployment.sh`
4. 配置: GitHub webhook 设置

### 需要详细说明?

1. 读: **WEBHOOK_DEPLOYMENT_GUIDE.md**
2. 按: **WEBHOOK_DEPLOYMENT_CHECKLIST.md** 逐步验证
3. 参考: **WEBHOOK_DEPLOYMENT_READY.md** 的 API 部分

### 遇到问题?

1. 查: **WEBHOOK_DEPLOYMENT_GUIDE.md** 的故障排查
2. 运: `./scripts/verify-webhook-deployment.sh`
3. 看: `pm2 logs webhook`
4. 读: **WEBHOOK_DEPLOYMENT_READY.md** 的调试技巧

---

## ✅ 验证清单

### 文件检查

```bash
cd /Users/yumei/SAFvsOil

# 检查所有必需文件
for file in .env.webhook ecosystem.config.js \
  scripts/webhook-server.js scripts/start-webhook.sh \
  scripts/auto-sync-cluster.sh scripts/verify-webhook-deployment.sh \
  scripts/deploy-webhook.sh WEBHOOK_*.md; do
  if [[ -f "$file" ]]; then
    echo "✓ $file"
  else
    echo "✗ $file (缺失)"
  fi
done
```

### 权限检查

```bash
# 脚本应该可执行
ls -la scripts/*.sh | grep -E '^-rwx'
```

### 内容检查

```bash
# 检查关键变量
grep GITHUB_WEBHOOK_SECRET .env.webhook
grep "3001" ecosystem.config.js
grep "function verifyGitHubSignature" scripts/webhook-server.js
```

---

## 🎯 部署流程

```
准备阶段
├── 阅读 WEBHOOK_QUICK_START.md
├── SSH 到 coco
├── 验证环境 (Node.js v20+)
└── 加载 .env.webhook

部署阶段
├── 运行 deploy-webhook.sh
├── 或手动运行 start-webhook.sh
└── 验证健康检查 (HTTP 200)

配置阶段
├── 添加 GitHub webhook
├── 填入 coco.local:3001 URL
└── 设置 Secret 和事件类型

测试阶段
├── 推送到 master
├── 检查 webhook 日志
├── 验证集群同步
└── 确认其他节点更新

完成阶段
├── 配置 PM2 开机自启
├── 设置日志告警 (可选)
├── 共享文档给团队
└── 记录在案
```

---

## 📚 相关资源

### 官方文档

- [GitHub Webhooks](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
- [Express.js](https://expressjs.com/)
- [PM2](https://pm2.keymetrics.io/)
- [Bash 脚本](https://www.gnu.org/software/bash/manual/)

### 本地文档

- 所有文档位于项目根目录
- 查看 `WEBHOOK_QUICK_START.md` 了解快速启动
- 查看 `WEBHOOK_DEPLOYMENT_GUIDE.md` 了解完整指南

---

## 🔧 维护

### 定期检查

```bash
# 每周
pm2 logs webhook --lines 100    # 检查日志
pm2 status webhook               # 检查进程

# 每月
ls -la webhook-logs/             # 检查磁盘使用
tail webhook-logs/webhook-*.log  # 查看是否有错误
```

### 日志轮转

```bash
# 手动清理旧日志
find webhook-logs/ -name "webhook-*.log" -mtime +30 -delete

# 或配置 logrotate (可选)
```

---

## 💡 常见问题

**Q: 如何查看 webhook 事件?**  
A: `tail -f webhook-logs/webhook-$(date +%Y-%m-%d).log | jq .`

**Q: 如何更改 webhook 端口?**  
A: 编辑 `.env.webhook` 中的 `WEBHOOK_PORT` 后重启服务

**Q: 如何禁用 webhook?**  
A: `pm2 stop webhook` 或在 GitHub 上勾选 "Pause deliveries"

**Q: 如何重新启动服务?**  
A: `pm2 restart webhook`

**Q: 如何查看所有 webhook 日志?**  
A: `cat webhook-logs/webhook-*.log | jq . | grep -i error`

---

## 📞 支持

- 📖 文档: 见本目录下的所有 WEBHOOK_*.md 文件
- 🔧 验证: 运行 `./scripts/verify-webhook-deployment.sh`
- 📊 日志: 查看 `pm2 logs webhook` 或 `webhook-logs/` 目录
- 🆘 故障排查: 查看 WEBHOOK_DEPLOYMENT_GUIDE.md 的故障排查部分

---

## ✨ 部署状态

| 项目 | 状态 | 备注 |
|------|------|------|
| 文件生成 | ✅ | 所有文件已创建 |
| 环境配置 | ✅ | .env.webhook 已生成 |
| 脚本验证 | ✅ | 所有脚本已测试 |
| 文档完成 | ✅ | 6 个 markdown 文档 |
| 部署就绪 | ✅ | 可立即在 coco 上部署 |

---

**总结**: ✅ **完全就绪** - 所有文件已准备好，可立即在 coco 上部署

**最后更新**: 2026-04-22  
**版本**: 1.0  
**维护者**: DevOps Team
