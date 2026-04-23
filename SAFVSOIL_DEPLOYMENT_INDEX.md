# 🎯 SAFvsOil 部署资源索引

**部署日期**: 2026-04-22  
**目标**: mac-mini (192.168.1.100)  
**状态**: ✅ 已准备好部署  

---

## 📚 文档资源

### 主要指南

| 文档 | 描述 | 何时使用 |
|------|------|---------|
| **SAFVSOIL_DEPLOYMENT_COMPLETE.md** | 📘 完整部署指南 (9.7 KB) | 第一次读这个，全面了解部署 |
| **DEPLOY_SAFVSOIL_SQLITE.md** | 📋 分步部署指南 (6 KB) | 逐步按照指示执行 |
| **DEPLOY_QUICK_REFERENCE.md** | 📝 快速参考卡片 (5 KB) | 已经懂的人快速查阅 |
| **DEPLOY_COMPLETION_REPORT.md** | 📊 部署完成报告模板 (6 KB) | 部署完成后填写 |

### 快速查找

```bash
# 查看完整指南
cat SAFVSOIL_DEPLOYMENT_COMPLETE.md

# 查看快速参考
cat DEPLOY_QUICK_REFERENCE.md

# 查看分步指南
cat DEPLOY_SAFVSOIL_SQLITE.md
```

---

## 🔧 部署脚本

### 执行顺序

```
1️⃣  precheck-deployment.sh       (本地预检查)
    ↓
2️⃣  deploy-safvsoil.sh          (自动化部署到 mac-mini)
    ↓
3️⃣  verify-safvsoil-deployment.sh (验证部署成功)
```

### 脚本说明

| 脚本 | 大小 | 功能 | 用途 |
|------|------|------|------|
| **precheck-deployment.sh** | 2.8 KB | ✓ 检查项目结构 ✓ 验证 Python ✓ 检查依赖 | 部署前本地验证 |
| **deploy-safvsoil.sh** | 4.2 KB | ✓ 环境准备 ✓ 依赖安装 ✓ 数据库初始化 ✓ 服务启动 | 完整自动化部署 |
| **verify-safvsoil-deployment.sh** | 5.3 KB | ✓ 7 项检查 ✓ 详细验证 ✓ 生成报告 | 部署后验证 |

### 脚本执行

```bash
# 本地预检查 (在本机执行)
cd /Users/yumei/SAFvsOil
bash precheck-deployment.sh

# SSH 到 mac-mini
ssh user@192.168.1.100

# 自动化部署 (在 mac-mini 执行)
cd /Users/yumei/SAFvsOil
bash deploy-safvsoil.sh prod      # 生产模式 (推荐)
# 或
bash deploy-safvsoil.sh dev       # 开发模式
# 或
bash deploy-safvsoil.sh pm2       # PM2 后台运行

# 验证部署 (在任意机器执行)
bash verify-safvsoil-deployment.sh 192.168.1.100
```

---

## ⚡ 快速部署 (5 分钟)

### 方式 1: 完全自动化

```bash
# 一键执行
cd /Users/yumei/SAFvsOil && \
bash precheck-deployment.sh && \
ssh user@192.168.1.100 "cd /Users/yumei/SAFvsOil && bash deploy-safvsoil.sh prod" && \
bash verify-safvsoil-deployment.sh 192.168.1.100
```

### 方式 2: 分步执行

```bash
# 步骤 1: 本地预检查
bash precheck-deployment.sh

# 步骤 2: SSH 到 mac-mini 并部署
ssh user@192.168.1.100
cd /Users/yumei/SAFvsOil
bash deploy-safvsoil.sh prod

# 步骤 3: 验证 (在另一个终端)
bash verify-safvsoil-deployment.sh 192.168.1.100
```

### 方式 3: 手动执行

参考 **DEPLOY_SAFVSOIL_SQLITE.md** 中的"步骤 1-7"部分。

---

## ✅ 完成检查清单

### 部署前

- [ ] 已阅读 **SAFVSOIL_DEPLOYMENT_COMPLETE.md**
- [ ] 已检查网络连接 (`ping 192.168.1.100`)
- [ ] 已验证 SSH 密钥 (`ssh user@192.168.1.100`)
- [ ] 已确认 Python 3.11+ 可用 (`python3 --version`)

### 部署中

- [ ] 已运行 `precheck-deployment.sh`
- [ ] 已运行 `bash deploy-safvsoil.sh prod`
- [ ] 没有遇到 ERROR (查看日志如果有)

### 部署后

- [ ] ✅ 检查 1: Python 3.11+ 已验证
- [ ] ✅ 检查 2: 依赖安装成功
- [ ] ✅ 检查 3: 数据库初始化成功
- [ ] ✅ 检查 4: FastAPI 启动成功
- [ ] ✅ 检查 5: 所有 CRUD 端点通过测试
- [ ] ✅ 检查 6: 可从其他节点访问
- [ ] ✅ 检查 7: 备份 Cron 已配置

---

## 🧪 API 测试命令速查

### 基础测试

```bash
# 健康检查
curl http://192.168.1.100:8000/health

# API 文档
curl http://192.168.1.100:8000/docs

# OpenAPI 规范
curl http://192.168.1.100:8000/openapi.json
```

### 市场数据操作

```bash
# GET 最新市场价格
curl http://192.168.1.100:8000/v1/sqlite/markets/latest

# POST 创建市场数据
curl -X POST http://192.168.1.100:8000/v1/sqlite/markets \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-04-22T20:40:00Z","market_type":"ARA","price":680.50,"unit":"USD/metric ton","source":"PLATTS"}'

# PUT 更新市场数据
curl -X PUT http://192.168.1.100:8000/v1/sqlite/markets/{id} \
  -H "Content-Type: application/json" \
  -d '{"price":690.00}'

# DELETE 删除市场数据
curl -X DELETE http://192.168.1.100:8000/v1/sqlite/markets/{id}
```

---

## 📊 文件清单

### 创建的文件 (此次部署)

```
/Users/yumei/SAFvsOil/
├── 📘 SAFVSOIL_DEPLOYMENT_COMPLETE.md      (9.7 KB) ← 完整指南
├── 📋 DEPLOY_SAFVSOIL_SQLITE.md            (6.0 KB) ← 分步指南
├── 📝 DEPLOY_QUICK_REFERENCE.md            (5.1 KB) ← 快速参考
├── 📊 DEPLOY_COMPLETION_REPORT.md          (6.2 KB) ← 完成报告
├── 📑 SAFVSOIL_DEPLOYMENT_INDEX.md         (本文件)
├── 🔧 deploy-safvsoil.sh                   (4.2 KB) ← 部署脚本
├── ✅ verify-safvsoil-deployment.sh        (5.3 KB) ← 验证脚本
└── 🧪 precheck-deployment.sh               (2.8 KB) ← 预检查脚本
```

### 现有项目文件

```
/Users/yumei/SAFvsOil/
├── apps/api/                               (FastAPI 应用)
│   ├── app/main.py                         (应用入口)
│   ├── requirements.txt                    (依赖)
│   └── migrations/001_init_sqlite_schema.sql (数据库表定义)
├── scripts/
│   ├── init-sqlite-db.py                   (数据库初始化)
│   └── backup-db-cron.sh                   (备份脚本)
└── ... (其他项目文件)
```

### 部署后生成的文件

```
/Users/yumei/SAFvsOil/
├── venv/                                   (虚拟环境)
├── deploy-20260422_*.log                   (部署日志)
└── pm2-sqlite-api.log                      (PM2 日志)

/opt/safvsoil/
├── data/
│   └── market.db                           (SQLite 数据库)
└── backups/
    └── market.db.backup.*                  (数据库备份)
```

---

## 🚀 启动模式选择

### 开发模式

```bash
bash deploy-safvsoil.sh dev
```

**特点**: hot-reload, 详细错误  
**用途**: 本地开发调试  

### 生产模式 ⭐ 推荐

```bash
bash deploy-safvsoil.sh prod
```

**特点**: 4 workers, 优化性能  
**用途**: 生产部署  

### PM2 后台模式

```bash
bash deploy-safvsoil.sh pm2
```

**特点**: 后台运行, 自动重启  
**用途**: 持久化运行, 需要重启保护  

---

## 📌 重要路径速查

| 项目 | 路径 |
|------|------|
| 项目根目录 | `/Users/yumei/SAFvsOil` |
| API 应用 | `/Users/yumei/SAFvsOil/apps/api` |
| 虚拟环境 | `/Users/yumei/SAFvsOil/apps/api/venv` |
| 初始化脚本 | `/Users/yumei/SAFvsOil/scripts/init-sqlite-db.py` |
| 备份脚本 | `/Users/yumei/SAFvsOil/scripts/backup-db-cron.sh` |
| **SQLite 数据库** | `/opt/safvsoil/data/market.db` |
| **备份目录** | `/opt/safvsoil/backups/` |

---

## 🔗 文档导航

### 新手入门

1. 📘 阅读 **SAFVSOIL_DEPLOYMENT_COMPLETE.md** (本网站全面指南)
2. 🧪 运行 `precheck-deployment.sh`
3. 🚀 运行 `deploy-safvsoil.sh prod`
4. ✅ 运行 `verify-safvsoil-deployment.sh 192.168.1.100`

### 具体操作

- **一步步执行?** → 看 **DEPLOY_SAFVSOIL_SQLITE.md**
- **快速查命令?** → 看 **DEPLOY_QUICK_REFERENCE.md**
- **记录完成情况?** → 看 **DEPLOY_COMPLETION_REPORT.md**

### 排查问题

- **无法连接?** → SAFVSOIL_DEPLOYMENT_COMPLETE.md 的"Q1"
- **依赖失败?** → SAFVSOIL_DEPLOYMENT_COMPLETE.md 的"Q3"
- **数据库问题?** → SAFVSOIL_DEPLOYMENT_COMPLETE.md 的"Q4"
- **API 无法访问?** → SAFVSOIL_DEPLOYMENT_COMPLETE.md 的"Q6"

---

## 📞 支持信息

### 快速命令

```bash
# 查看完整指南
cat /Users/yumei/SAFvsOil/SAFVSOIL_DEPLOYMENT_COMPLETE.md

# 查看部署日志
tail -f /Users/yumei/SAFvsOil/deploy-*.log

# 查看 PM2 日志
pm2 logs sqlite-api

# 查看数据库状态
sqlite3 /opt/safvsoil/data/market.db ".tables"

# 查看备份
ls -lh /opt/safvsoil/backups/

# 测试健康检查
curl http://192.168.1.100:8000/health
```

### PM2 管理

```bash
pm2 status              # 查看所有应用状态
pm2 logs sqlite-api     # 查看应用日志
pm2 restart sqlite-api  # 重启应用
pm2 stop sqlite-api     # 停止应用
pm2 delete sqlite-api   # 删除应用
pm2 info sqlite-api     # 查看应用详情
```

---

## 🎯 部署成功标准

✅ **所有 7 项检查通过**

1. ✅ Python 3.11+ 已验证
2. ✅ 依赖安装成功
3. ✅ 数据库初始化成功
4. ✅ FastAPI 启动成功
5. ✅ 所有 CRUD 端点通过测试
6. ✅ 可从其他节点访问
7. ✅ 备份 Cron 已配置

**状态**: 🟢 **READY FOR PRODUCTION**

---

## 📋 版本信息

| 项目 | 版本 |
|------|------|
| Python | 3.11+ |
| FastAPI | 0.115.5 |
| Uvicorn | 0.32.1 |
| SQLAlchemy | 2.0.36 |
| aiosqlite | 0.19.0 |
| Pydantic | 2.11.7 |

---

## 🎉 最后

祝部署顺利！所有文件和脚本已准备好，可立即开始部署。

**下一步**: 按照上面的"快速部署 (5 分钟)"部分执行！

---

**文档版本**: 1.0  
**创建日期**: 2026-04-22  
**最后更新**: 2026-04-22  
**状态**: ✅ 已就绪
