# 📋 SAFvsOil SQLite 部署快速参考

## 🚀 一键部署

在 mac-mini 上执行：

```bash
cd /Users/yumei/SAFvsOil
bash deploy-safvsoil.sh prod  # 生产模式

# 或
bash deploy-safvsoil.sh dev   # 开发模式 (hot-reload)

# 或
bash deploy-safvsoil.sh pm2   # PM2 后台运行
```

---

## ✅ 部署检查清单

完成每一项后打勾：

### 环境准备
- [ ] SSH 到 mac-mini: `ssh user@192.168.1.100`
- [ ] Python 3.11+: `python3 --version`
- [ ] pip 更新: `pip install --upgrade pip`

### 依赖安装
- [ ] 创建虚拟环境: `python3 -m venv venv`
- [ ] 激活虚拟环境: `source venv/bin/activate`
- [ ] 安装依赖: `pip install -r requirements.txt`
- [ ] 验证包: `pip list | grep fastapi`

### 数据库初始化
- [ ] 运行初始化: `python3 scripts/init-sqlite-db.py`
- [ ] 验证数据库: `ls -lh /opt/safvsoil/data/market.db`
- [ ] 检查表: `sqlite3 /opt/safvsoil/data/market.db ".tables"`

### 服务启动
- [ ] 启动 FastAPI: `bash deploy-safvsoil.sh prod`
- [ ] 检查端口: `lsof -i :8000`
- [ ] 查看日志: `tail -f pm2-sqlite-api.log`

### API 验证
- [ ] 健康检查: `curl http://192.168.1.100:8000/health`
- [ ] API 文档: `curl http://192.168.1.100:8000/docs`
- [ ] 市场数据: `curl http://192.168.1.100:8000/v1/sqlite/markets/latest`

### 备份配置
- [ ] 添加 Cron: `crontab -e`
- [ ] 验证 Cron: `crontab -l | grep backup`
- [ ] 测试备份: `bash /Users/yumei/SAFvsOil/scripts/backup-db-cron.sh`

### 远程验证
- [ ] 从另一台机器: `curl http://192.168.1.100:8000/health`
- [ ] API 文档: 在浏览器打开 `http://192.168.1.100:8000/docs`

---

## 🧪 API 测试命令

### 1. 健康检查
```bash
curl http://192.168.1.100:8000/health
# 预期: {"status":"ok"}
```

### 2. 查看 API 文档
```bash
# 浏览器
http://192.168.1.100:8000/docs

# 或命令行
curl http://192.168.1.100:8000/openapi.json | jq .
```

### 3. 获取市场价格 (GET)
```bash
curl http://192.168.1.100:8000/v1/sqlite/markets/latest
# 预期: {"data":[],"count":0}
```

### 4. 创建市场数据 (POST)
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
# 预期: {"id":"...","timestamp":"...","market_type":"ARA",...}
```

### 5. 验证缓存
```bash
curl http://192.168.1.100:8000/v1/sqlite/markets/latest
# 预期: 返回刚创建的数据
```

---

## 🔧 启动模式对比

| 模式 | 命令 | 用途 | 自动重启 |
|------|------|------|---------|
| **开发** | `bash deploy-safvsoil.sh dev` | 本地调试，hot-reload | ❌ |
| **生产** | `bash deploy-safvsoil.sh prod` | 4 workers，性能优化 | ❌ |
| **PM2** | `bash deploy-safvsoil.sh pm2` | 后台运行，自动重启 | ✅ |

### 开发模式启动
```bash
cd /Users/yumei/SAFvsOil/apps/api
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 生产模式启动
```bash
cd /Users/yumei/SAFvsOil/apps/api
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### PM2 启动
```bash
cd /Users/yumei/SAFvsOil/apps/api
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4" --name sqlite-api
pm2 save
```

---

## 📊 数据库查询

### 检查数据库状态
```bash
# 连接数据库
sqlite3 /opt/safvsoil/data/market.db

# 列出所有表
.tables

# 查看 market_prices 表结构
PRAGMA table_info(market_prices);

# 查看数据
SELECT * FROM market_prices LIMIT 5;

# 查看表行数
SELECT COUNT(*) FROM market_prices;

# 退出
.quit
```

### 备份数据库
```bash
# 手动备份
cp /opt/safvsoil/data/market.db /opt/safvsoil/backups/market.db.backup.$(date +%Y%m%d_%H%M%S)

# 查看备份
ls -lh /opt/safvsoil/backups/
```

---

## 🚨 故障排查

### 问题: 无法连接到服务
```bash
# 检查端口
lsof -i :8000

# 检查防火墙
sudo pfctl -s nat

# 检查网络
ping 192.168.1.100
```

### 问题: 依赖安装失败
```bash
# 清除缓存
pip cache purge

# 重新安装
pip install -r requirements.txt -v
```

### 问题: 数据库初始化失败
```bash
# 检查目录权限
ls -ld /opt/safvsoil/data

# 检查 SQL 文件
cat /Users/yumei/SAFvsOil/apps/api/migrations/001_init_sqlite_schema.sql
```

### 问题: FastAPI 无法启动
```bash
# 检查应用语法
python3 -c "from app.main import app; print('✓ App OK')"

# 查看详细错误
uvicorn app.main:app --reload --port 8000 (不后台运行)
```

---

## 📝 日志位置

- **FastAPI 日志** (PM2): `/Users/yumei/SAFvsOil/pm2-sqlite-api.log`
- **部署日志**: `/Users/yumei/SAFvsOil/deploy-*.log`
- **数据库**: `/opt/safvsoil/data/market.db`
- **备份**: `/opt/safvsoil/backups/`

---

## 🔄 完整部署流程 (一行代码)

```bash
cd /Users/yumei/SAFvsOil && bash deploy-safvsoil.sh prod && \
sleep 2 && bash verify-safvsoil-deployment.sh 192.168.1.100
```

---

## 📌 重要路径

| 项目 | 路径 |
|------|------|
| 项目根目录 | `/Users/yumei/SAFvsOil` |
| API 应用 | `/Users/yumei/SAFvsOil/apps/api` |
| 初始化脚本 | `/Users/yumei/SAFvsOil/scripts/init-sqlite-db.py` |
| 备份脚本 | `/Users/yumei/SAFvsOil/scripts/backup-db-cron.sh` |
| 数据库 | `/opt/safvsoil/data/market.db` |
| 备份目录 | `/opt/safvsoil/backups/` |
| 虚拟环境 | `/Users/yumei/SAFvsOil/apps/api/venv` |

---

## 🎯 部署完成标准

- ✅ Python 3.11+ 已验证
- ✅ 依赖安装成功
- ✅ 数据库初始化成功
- ✅ FastAPI 启动成功
- ✅ 所有 CRUD 端点通过测试
- ✅ 可从其他节点访问 (curl http://192.168.1.100:8000/health)
- ✅ 备份 Cron 已配置

**部署状态**: 🟢 READY FOR PRODUCTION

**部署耗时**: ~10 分钟

---

## 📞 支持命令

```bash
# 部署指南
cat /Users/yumei/SAFvsOil/DEPLOY_SAFVSOIL_SQLITE.md

# 自动化部署
bash /Users/yumei/SAFvsOil/deploy-safvsoil.sh prod

# 验证部署
bash /Users/yumei/SAFvsOil/verify-safvsoil-deployment.sh 192.168.1.100

# 查看 PM2 状态
pm2 status

# 查看日志
pm2 logs sqlite-api

# 重启服务
pm2 restart sqlite-api

# 停止服务
pm2 stop sqlite-api
```
