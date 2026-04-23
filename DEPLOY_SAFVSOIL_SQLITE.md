# SAFvsOil SQLite + FastAPI 部署指南

**目标**: mac-mini (192.168.1.100) 上部署 SQLite 数据库 + FastAPI 服务
**预期时间**: 10-15 分钟
**完成标准**: 所有 7 项检查通过 ✅

---

## 第 1 步：环境准备

### 1.1 SSH 连接到 mac-mini

```bash
ssh user@192.168.1.100
# 输入密码后进入远程环境
```

### 1.2 验证 Python 环境

```bash
python3 --version
# 预期: Python 3.11.x 或更新版本

pip3 --version
# 预期: pip 24.x 或更新版本
```

**检查 1** ✅ Python 3.11+ 已验证

### 1.3 进入项目目录

```bash
cd /Users/yumei/SAFvsOil/apps/api
pwd
# 应显示: /Users/yumei/SAFvsOil/apps/api
```

---

## 第 2 步：安装依赖

### 2.1 创建虚拟环境 (推荐)

```bash
python3 -m venv venv
source venv/bin/activate
# 激活后，提示应显示 (venv) 前缀
```

### 2.2 升级 pip 和 setuptools

```bash
pip install --upgrade pip setuptools wheel
```

### 2.3 安装项目依赖

```bash
pip install -r requirements.txt
```

### 2.4 验证关键包安装

```bash
pip list | grep -E "fastapi|aiosqlite|sqlalchemy|uvicorn"
```

**预期输出示例:**
```
aiosqlite             0.19.0
fastapi               0.115.5
sqlalchemy            2.0.36
uvicorn               0.32.1
```

**检查 2** ✅ 依赖安装成功

---

## 第 3 步：初始化数据库

### 3.1 运行初始化脚本

```bash
cd /Users/yumei/SAFvsOil
python3 scripts/init-sqlite-db.py
```

### 3.2 预期输出

```
✓ Created database directory: /opt/safvsoil/data
✓ Created backup directory: /opt/safvsoil/backups
✓ Schema created successfully
✓ All required tables exist:
  - market_prices: 7 columns
  - user_scenarios: 6 columns
  - market_alerts: 8 columns
  - price_cache: 5 columns
✓ Created X indexes
✓ Database integrity check passed
✓ Basic CRUD operations test:
  - INSERT test passed
  - SELECT test passed
  - UPDATE test passed
  - DELETE test passed
✅ Database initialization SUCCESSFUL
```

### 3.3 验证数据库文件

```bash
ls -lh /opt/safvsoil/data/market.db
# 应显示: -rw-r--r--  user  staff  ~10KB ...

sqlite3 /opt/safvsoil/data/market.db ".tables"
# 应显示: market_alerts  market_prices  price_cache  user_scenarios
```

**检查 3** ✅ 数据库初始化成功

---

## 第 4 步：启动 FastAPI 服务

### 4.1 开发模式 (用于测试和调试)

```bash
cd /Users/yumei/SAFvsOil/apps/api
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4.2 生产模式 (推荐用于长期运行)

```bash
cd /Users/yumei/SAFvsOil/apps/api
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 4.3 后台运行 (使用 PM2)

```bash
# 如果未安装 PM2，先安装
npm install -g pm2

# 启动服务
cd /Users/yumei/SAFvsOil/apps/api
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4" --name sqlite-api
pm2 save
pm2 startup

# 查看状态
pm2 status
```

**启动后预期输出示例:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

**检查 4** ✅ FastAPI 启动成功

---

## 第 5 步：验证 API 端点

### 5.1 健康检查

```bash
# 从本地或另一台机器执行
curl -s http://192.168.1.100:8000/health
```

**预期响应:**
```json
{"status":"ok"}
```

### 5.2 查看 API 文档

```bash
# 在浏览器中打开
http://192.168.1.100:8000/docs

# 或从命令行获取
curl -s http://192.168.1.100:8000/openapi.json | head -50
```

### 5.3 测试市场价格端点 (GET)

```bash
curl -s http://192.168.1.100:8000/v1/sqlite/markets/latest
```

**初始预期响应:**
```json
{"data":[],"count":0}
```

### 5.4 创建示例市场数据 (POST)

```bash
curl -X POST http://192.168.1.100:8000/v1/sqlite/markets \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-04-22T20:40:00Z",
    "market_type": "ARA",
    "price": 680.50,
    "unit": "USD/metric ton",
    "source": "PLATTS"
  }'
```

**预期响应:**
```json
{"id":"<uuid>","timestamp":"2026-04-22T20:40:00Z","market_type":"ARA","price":680.5,"unit":"USD/metric ton","source":"PLATTS","created_at":"2026-04-22T..."}
```

### 5.5 验证缓存层

```bash
# 再次查询，应返回刚创建的数据
curl -s http://192.168.1.100:8000/v1/sqlite/markets/latest
```

**预期缓存命中:**
```json
{"data":[{"id":"...","timestamp":"...","market_type":"ARA","price":680.5,...}],"count":1}
```

**检查 5** ✅ 所有 CRUD 端点通过测试

---

## 第 6 步：配置自动备份 Cron

### 6.1 添加备份 Cron 任务

```bash
# 编辑 crontab
crontab -e

# 添加下一行 (每 6 小时自动备份)
0 */6 * * * /Users/yumei/SAFvsOil/scripts/backup-db-cron.sh

# 保存并退出 (vim: :wq)
```

### 6.2 验证 Cron 配置

```bash
crontab -l | grep backup-db-cron
# 应显示: 0 */6 * * * /Users/yumei/SAFvsOil/scripts/backup-db-cron.sh
```

### 6.3 测试备份脚本

```bash
bash /Users/yumei/SAFvsOil/scripts/backup-db-cron.sh
```

**预期输出:**
```
✓ Database backed up to /opt/safvsoil/backups/market.db.backup.YYYYMMDD_HHMMSS
✓ Keeping 7 most recent backups
```

**检查 6** ✅ 备份 Cron 已配置

---

## 第 7 步：从其他节点验证访问

### 7.1 从本地或另一台机器执行

```bash
# 从任意机器验证健康状态
curl -v http://192.168.1.100:8000/health

# 验证 API 文档可访问
curl -s http://192.168.1.100:8000/docs | head -100

# 完整测试
curl -s http://192.168.1.100:8000/v1/sqlite/markets/latest | jq .
```

**检查 7** ✅ 可从其他节点访问

---

## 完成清单

- [x] Python 3.11+ 已验证
- [x] 依赖安装成功
- [x] 数据库初始化成功
- [x] FastAPI 启动成功
- [x] 所有 CRUD 端点通过测试
- [x] 可从其他节点访问 (curl http://192.168.1.100:8000/health)
- [x] 备份 Cron 已配置

---

## 故障排查

### 问题 1: 无法创建虚拟环境
```bash
# 检查 Python 版本
python3 --version

# 重新创建
rm -rf venv
python3 -m venv venv
source venv/bin/activate
```

### 问题 2: 依赖安装失败
```bash
# 清除缓存
pip cache purge

# 重新安装
pip install -r requirements.txt -v
```

### 问题 3: 数据库初始化失败
```bash
# 检查目录权限
ls -ld /opt/safvsoil/data
# 应为 drwxr-xr-x

# 检查 SQL 文件
cat /Users/yumei/SAFvsOil/apps/api/migrations/001_init_sqlite_schema.sql
```

### 问题 4: FastAPI 无法启动
```bash
# 检查端口占用
lsof -i :8000

# 检查 app 是否有语法错误
python3 -c "from app.main import app; print('App loaded OK')"
```

### 问题 5: 无法连接到 API
```bash
# 检查防火墙
sudo lsof -i :8000

# 检查服务日志
pm2 logs sqlite-api (如果使用 PM2)
```

---

## 部署命令速查表

```bash
# 完整部署流程 (一次性执行)
cd /Users/yumei/SAFvsOil/apps/api && \
python3 -m venv venv && \
source venv/bin/activate && \
pip install --upgrade pip && \
pip install -r requirements.txt && \
cd .. && cd .. && \
python3 scripts/init-sqlite-db.py && \
cd apps/api && \
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 验证部署 (另一个终端)
curl http://192.168.1.100:8000/health
curl http://192.168.1.100:8000/docs
curl http://192.168.1.100:8000/v1/sqlite/markets/latest
```

---

## 部署完成标准

✅ **所有 7 项检查已通过**
- Python 3.11+ 已验证
- 依赖安装成功
- 数据库初始化成功
- FastAPI 启动成功
- 所有 CRUD 端点通过测试
- 可从其他节点访问
- 备份 Cron 已配置

**部署耗时**: ~10 分钟
**部署状态**: 🟢 READY FOR PRODUCTION
