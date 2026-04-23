# ⚡ SAFvsOil 集群改进 — 立即行动指南

**优先级**: P0 (本周完成) + P1 (下周完成)  
**预计时间**: 10-15小时工程时间

---

## 🔴 P0 任务 (本周必做)

### 任务1: Phase 0/B 架构统一 (4小时)

**现状问题**:
- Phase 0: 静态HTML (public/*.html)
- Phase B: Next.js SSR (apps/web)
- 都在生产环境, 互相干扰

**目标**: 全部转到Next.js, 删除Phase 0

**步骤**:

```bash
# 1. 备份Phase 0 (以防需要参考)
mkdir -p /Users/yumei/SAFvsOil/.archive/phase0-backup-2026-04-22
cp -r /Users/yumei/SAFvsOil/public/*.html .archive/phase0-backup-2026-04-22/

# 2. 验证Phase B包含所有Phase 0功能
cd /Users/yumei/SAFvsOil/apps/web

# 检查所有关键页面:
✅ /dashboard      (价格仪表板)
✅ /explorer       (参数探索)
✅ /analysis       (分析页)
✅ /scenarios      (场景保存)
✅ /sources        (数据源)
✅ /de             (德语版本)
✅ /faq            (FAQ)

# 验证构建
npm run typecheck    # TypeScript检查
npm run build        # Next.js构建
npm run gate         # 质量检查

# 3. 确认无误后删除Phase 0
# (注意: 先在开发分支测试, 不要直接删除)
# rm /Users/yumei/SAFvsOil/public/*.html

# 4. 更新PROJECT_PROGRESS.md
# 记录: "Phase 0已冻结, 仅作历史参考"
```

**验证清单**:
- [ ] npm run gate 通过
- [ ] npm run test 通过
- [ ] 所有页面可访问 (localhost:3000/*)
- [ ] Git commit: "refactor: Consolidate Phase B, archive Phase 0"

**预期效果**:
- 代码行数减少 30%
- 路由统一
- 部署流程简化

---

### 任务2: France VPS 升级 (0.5小时 + 供应商处理)

**当前配置** (不足):
```
RAM: 961MB    → 需要升级到 4GB (增加 3GB)
Disk: 24GB    → 需要升级到 50GB (增加 26GB)
Cost: $3-5/月 → $12-18/月 (增加 $9-13/月)
```

**操作步骤**:

```bash
# 1. 联系VPS供应商升级 (或自行操作如果有权限)
#    供应商: 检查France VPS提供商 (推荐Linode/DigitalOcean)
#    操作: 在控制面板升级CPU/RAM/Storage
#    时间: 通常5-30分钟

# 2. 升级后验证连接
ssh user@88.218.77.162 "uname -a && free -h && df -h"

# 预期输出示例:
# Linux ... 4G total (升级完成)
# Filesystem      Size  Used Avail (50G total)

# 3. 更新infra配置
cat > /Users/yumei/infra/vps/FRANCE_VPS_README.md << 'EOF'
# 法国VPS (升级版)
- IP: 88.218.77.162
- RAM: 4GB (升级后)
- Disk: 50GB (升级后)
- Cost: $12-18/月
- Status: 2026-04-22 升级完成
EOF

# 4. Commit更新
cd /Users/yumei/SAFvsOil
git add infra/vps/
git commit -m "chore: Update France VPS specs after upgrade to 4GB RAM / 50GB Disk"
git push origin master
```

**验证清单**:
- [ ] SSH连接成功
- [ ] free -h 显示 4GB
- [ ] df -h 显示 50GB
- [ ] 可运行 Node.js + Python 无内存警告

**预期效果**:
- France VPS 可真正作为主控节点
- 支持完整的应用堆栈
- 双节点真正高可用

---

## 🟡 P1 任务 (下周完成)

### 任务3: 自动化部署流程 (3小时)

**现状**:
```
git push → Vercel自动 ✅
git push → 集群手动 ❌ (需人工git pull)
```

**目标**: 自动化集群更新

**实现方案**:

**3a. GitHub Actions + Webhook**

```bash
# 1. 在Mac-mini上创建webhook接收器
cat > /Users/yumei/scripts/post-deploy-webhook.sh << 'EOF'
#!/bin/bash
set -e

echo "[$(date)] Deployment webhook triggered"

PROJECT="/Users/yumei/SAFvsOil"
cd $PROJECT

# 步骤1: 拉取最新代码
echo "拉取最新代码..."
git fetch origin
git reset --hard origin/master

# 步骤2: 运行测试
echo "运行质量检查..."
npm run web:gate || exit 1
npm run api:check || exit 1

# 步骤3: 分发到集群
echo "分发到USA VPS..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude '.next' \
  --exclude '.venv' \
  /Users/yumei/SAFvsOil/ \
  user@192.227.130.69:/opt/safvsoil/

echo "分发到France VPS..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude '.next' \
  --exclude '.venv' \
  /Users/yumei/SAFvsOil/ \
  user@88.218.77.162:/opt/safvsoil/

# 步骤4: 健康检查
echo "执行健康检查..."
sleep 5
curl -f http://192.227.130.69:3001/health || {
  echo "USA VPS 健康检查失败!"
  exit 1
}

echo "[$(date)] ✅ 部署完成"
EOF

chmod +x /Users/yumei/scripts/post-deploy-webhook.sh

# 2. 在Mac-mini上启动webhook服务
cat > /Users/yumei/scripts/webhook-server.js << 'EOF'
const http = require('http');
const { execSync } = require('child_process');
const crypto = require('crypto');

const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-secret-here';
const PORT = 9000;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // 验证GitHub签名
    const signature = req.headers['x-hub-signature-256'];
    const hash = 'sha256=' + crypto
      .createHmac('sha256', SECRET)
      .update(body)
      .digest('hex');

    if (signature !== hash) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }

    // 触发部署脚本
    try {
      console.log('[' + new Date().toISOString() + '] 触发部署');
      execSync('/Users/yumei/scripts/post-deploy-webhook.sh', {
        stdio: 'inherit',
        cwd: '/Users/yumei/SAFvsOil'
      });
      res.statusCode = 200;
      res.end('Deployment started');
    } catch (error) {
      console.error('部署失败:', error);
      res.statusCode = 500;
      res.end('Deployment failed');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Webhook服务运行在 http://localhost:${PORT}/deploy`);
});
EOF

# 3. 使用nohup或systemd启动服务
nohup node /Users/yumei/scripts/webhook-server.js > /tmp/webhook.log 2>&1 &

# 4. 配置GitHub Webhook
# 在GitHub仓库设置 → Webhooks → Add webhook
# Payload URL: http://<mac-mini-ip>:9000/deploy
# Content type: application/json
# Secret: 设置为GITHUB_WEBHOOK_SECRET环保变量值
# Events: 勾选 "Push events"
```

**验证清单**:
- [ ] Webhook服务运行 (ps aux | grep webhook)
- [ ] GitHub Webhook配置完成
- [ ] Push一个测试commit
- [ ] 集群自动更新 (等待2分钟)

---

### 任务4: 数据库策略制定 (2小时)

**现状**:
- 市场数据: 内存存储 (重启后丢失)
- 用户场景: localStorage (仅本地)
- 无持久化, 无多节点同步

**目标**: 建立可靠的数据持久化

**Phase 1 (立即)**: SQLite

```bash
# 1. 在France VPS上创建SQLite数据库
ssh user@88.218.77.162 << 'EOF'

mkdir -p /opt/safvsoil/data
cd /opt/safvsoil/data

# 创建数据库schema
sqlite3 safvsoil.db << 'SQL'
CREATE TABLE IF NOT EXISTS market_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  brent_usd_per_bbl REAL,
  jet_usd_per_l REAL,
  carbon_proxy_usd_per_t REAL,
  jet_eu_proxy_usd_per_l REAL,
  rotterdam_jet_fuel_usd_per_l REAL,
  eu_ets_price_eur_per_t REAL,
  germany_premium_pct REAL
);

CREATE TABLE IF NOT EXISTS user_scenarios (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  parameters JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_timestamp ON market_snapshot(timestamp DESC);
CREATE INDEX idx_scenarios_user ON user_scenarios(user_id);
SQL

ls -la *.db

EOF

# 2. 更新FastAPI配置连接数据库
cat > /Users/yumei/SAFvsOil/apps/api/app/config.py << 'EOF'
import os

DB_PATH = os.getenv('DB_PATH', '/opt/safvsoil/data/safvsoil.db')
DB_URL = f'sqlite:///{DB_PATH}'

class Settings:
    db_path = DB_PATH
    db_url = DB_URL
    
settings = Settings()
EOF

# 3. 创建迁移脚本
cat > /Users/yumei/SAFvsOil/apps/api/app/migrations.py << 'EOF'
import sqlite3
from config import settings

def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(settings.db_path)
    cursor = conn.cursor()
    
    # 创建表...
    cursor.execute('''
      CREATE TABLE IF NOT EXISTS market_snapshot (...)
    ''')
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print(f"✅ 数据库初始化完成: {settings.db_path}")
EOF

# 4. 启用自动备份
cat > /Users/yumei/scripts/backup-safvsoil-db.sh << 'EOF'
#!/bin/bash
# 每6小时备份一次SQLite数据库

BACKUP_DIR="/opt/safvsoil/backups"
DB_FILE="/opt/safvsoil/data/safvsoil.db"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

mkdir -p $BACKUP_DIR

# 创建备份
cp $DB_FILE $BACKUP_DIR/safvsoil_${TIMESTAMP}.db.bak

# 保留最近7天的备份
find $BACKUP_DIR -name "*.bak" -mtime +7 -delete

echo "[$(date)] ✅ 数据库备份完成"
EOF

chmod +x /Users/yumei/scripts/backup-safvsoil-db.sh

# 5. 添加到crontab (每6小时执行)
# (crontab -l; echo "0 */6 * * * /Users/yumei/scripts/backup-safvsoil-db.sh") | crontab -
```

**Phase 2 (1-2月)**: PostgreSQL 主从

```bash
# 待完成, 规划:
# - France VPS: PostgreSQL 主库
# - USA VPS: PostgreSQL 从库
# - 5分钟同步延迟
# - 自动故障转移
```

**验证清单**:
- [ ] SQLite 数据库创建成功
- [ ] 表结构验证: `sqlite3 safvsoil.db ".tables"`
- [ ] 自动备份脚本运行
- [ ] FastAPI 可连接数据库

---

## 📊 完成时间估计

```
P0 任务 (本周):
├─ Phase 0/B统一      4h    Mon-Tue
└─ France VPS升级     0.5h  Wed (供应商处理)

P1 任务 (下周):
├─ 自动化部署         3h    Mon-Wed
└─ 数据库策略         2h    Wed-Thu

总计: ~9.5小时工程时间
```

---

## 🎯 成功指标

| 指标 | 当前 | 目标 | 完成标记 |
|------|------|------|---------|
| 代码重复率 | 30% | <5% | [ ] |
| Phase 0使用 | 活跃 | 已归档 | [ ] |
| France VPS内存 | 961MB | 4GB | [ ] |
| 部署自动化 | 0% | 100% | [ ] |
| 数据持久化 | 无 | SQLite | [ ] |
| 集群故障转移 | 手动 | 自动 | [ ] |

---

**开始日期**: 2026-04-22  
**目标完成**: 2026-05-06 (P0 + P1)

