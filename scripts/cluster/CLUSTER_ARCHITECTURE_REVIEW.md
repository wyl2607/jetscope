# 🏗️ SAFvsOil 集群架构审查与改进建议

**审查日期**: 2026-04-22  
**当前状态**: Phase B-5 (Vercel + FastAPI + Mac-mini hub)  
**集群规模**: 5节点 (local + mac-mini + coco + france-vps + us-vps)

---

## 📊 当前架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                     SAFvsOil 部署架构                        │
└─────────────────────────────────────────────────────────────┘

本地开发 (MacBook)
├─ Git repo: /Users/yumei/SAFvsOil
├─ 开发服务: npm run dev (localhost:3000/3001)
├─ Phase 0: 静态HTML原型 (/public)
└─ Phase B: Next.js + FastAPI (apps/web + apps/api)

        ↓ (git push)

GitHub 代码仓库
        ↓ (webhook)

Vercel CDN (生产环境)
├─ Frontend: https://saf.meichen.beauty ✅
├─ Next.js SSR/ISR
├─ 自动HTTPS + 全球CDN
└─ 自动部署每次push

        ↓ (git pull)

Mac-mini 中心枢纽 (192.168.8.139)
├─ 角色: 控制平面 + 本地镜像
├─ CI/CD协调
├─ 健康检查
└─ 配置管理

        ↓ (rsync + SSH)

集群节点:
├─ USA VPS (192.227.130.69) — 主执行节点
│  ├─ 2GB RAM / 40GB SSD
│  ├─ Python FastAPI运行时
│  └─ 队列处理 + 长任务
│
├─ France VPS (88.218.77.162) — 主控节点
│  ├─ 961MB RAM / 24GB SSD (有限)
│  ├─ 主控逻辑
│  └─ 故障转移
│
├─ Coco (本地)
│  └─ 备用计算节点
│
└─ Windows WSL (本地)
   └─ 跨平台兼容性验证

```

---

## ✅ 当前架构的优势

| 优势 | 具体表现 |
|------|---------|
| **高可用性** | Vercel CDN + VPS双节点 |
| **地理分散** | 法国/美国VPS + 本地 |
| **开发效率** | Git-driven自动部署 |
| **成本优化** | Vercel免费层 + 低成本VPS |
| **测试全面** | 多平台(mac/win/linux) |
| **扩展灵活** | 模块化(Phase 0/B) |

---

## ⚠️ 当前存在的问题

### 1️⃣ 架构分裂问题 (HIGH PRIORITY)

**问题**:
- Phase 0(静态HTML) vs Phase B(Next.js) 双轨制
- 部分功能只在Phase 0, 部分只在Phase B
- 路由/状态不统一导致用户混淆

**影响**:
- 代码重复 (+30%代码量)
- 维护成本高
- 部署流程复杂

**改善建议**:
```
立即行动 (Week 1):
1. 冻结Phase 0 — 仅作本地参考
2. 全量迁移到Phase B (Next.js)
3. 统一路由: /explorer, /analysis, /dashboard 统一为Next.js
4. 删除 public/*.html (除非需要静态备份)

预期结果:
- 代码量减少 30%
- 部署时间缩短 50%
- 路由一致性 100%
```

---

### 2️⃣ 法国VPS资源严重不足 (HIGH)

**当前配置**:
- France VPS: 961MB RAM / 24GB Disk
- 角色: "主控节点"

**问题**:
- 961MB RAM无法运行Node.js + Python + 监控服务
- 24GB Disk不够存储数据库副本
- 实际无法承载生产工作负载

**改善建议**:

**选项A: 升级France VPS** (推荐)
```
目标配置:
- RAM: 961MB → 4GB (3GB增加)
  成本: ~$5-8/月
- Disk: 24GB → 50GB (26GB增加)
  成本: ~$2-3/月
- 总额: ~$8-12/月 增加

预期收益:
✅ 可运行完整的Node.js/Python
✅ 存储数据库副本
✅ 真正的故障转移能力
✅ 支持并发连接
```

**选项B: 改为故障转移节点** (备选)
```
France VPS角色调整:
- 删除: 主控逻辑、长任务处理
- 改为: Failover + Health check only
- 功能: 心跳监测 + 自动故障切换
- 成本: 保持不变

优点: 低成本
缺点: 不能分散负载
```

**推荐**: 选项A (升级) — 投资回报率高

---

### 3️⃣ USA VPS配置不匹配 (MEDIUM)

**当前配置**:
- USA VPS: 2GB RAM / 40GB SSD ✅
- 应用: Python FastAPI + Node.js队列 + 数据处理

**问题**:
- FastAPI应用占用 ~400-600MB
- Node.js队列占用 ~300-500MB
- 监控/日志占用 ~100-200MB
- 剩余: ~200-400MB (危险区)

**改善建议**:

```
立即行动 (Week 2):
1. 分层架构:
   - API 层 (FastAPI): 现有
   - 计算层 (Python workers): 转移到France VPS (升级后)
   - 队列层 (Node.js): 保持在USA
   - 存储层 (PostgreSQL): 评估是否需要

2. 容器化部署:
   - Docker化所有服务
   - 设置资源限制 (--memory=512m等)
   - 使用docker-compose编排

3. 监控告警:
   - 内存告警: >80% (USA: >1.6GB)
   - Disk告警: >85% (USA: >34GB)
   - CPU告警: >90%
```

---

### 4️⃣ 数据库策略不清晰 (MEDIUM)

**当前问题**:
- 没有明确的数据库部署位置
- Market API用内存存储(不持久化)
- 场景保存还用localStorage (不云同步)

**改善建议**:

```
Phase 1 (立即):
├─ SQLite 本地部署 (France VPS)
│  └─ 市场价格历史 + 用户场景
│
└─ 备份策略:
   ├─ USA VPS 定时备份 (每6小时)
   ├─ 本地MacBook 周备份
   └─ 3-2-1 备份规则 (3份副本, 2种媒体, 1异地)

Phase 2 (1-2月):
├─ PostgreSQL 主从 (France主 → USA从)
│  └─ 5分钟同步延迟可接受
│
├─ 自动故障转移:
│  ├─ 心跳监测 (10秒间隔)
│  └─ 异常时自动切换
│
└─ 数据一致性:
   ├─ WAL日志 (Write-Ahead Logging)
   └─ 事务隔离级别 = SERIALIZABLE

成本:
- SQLite 版本: 免费 (已有VPS)
- PostgreSQL 版本: 月增 $0 (服务器已付费)
```

---

### 5️⃣ 部署流程需要优化 (MEDIUM)

**当前流程**:
```
本地修改 → git push → Vercel自动 → 集群手动(需人工)
```

**问题**:
- 集群不自动更新 (需手动git pull)
- 无自动健康检查后回滚
- 异常不告警

**改善建议**:

```
自动化部署流程:

1. Webhook 触发 (GitHub → Mac-mini)
   Post-commit: GitHub Actions 触发 curl hook
   
2. Mac-mini 编排:
   ├─ 拉取最新代码
   ├─ 运行测试 (npm run preflight)
   ├─ 构建制品 (npm run build)
   └─ 分发到集群
   
3. 集群滚动更新:
   ├─ USA VPS 先更新 (低影响)
   ├─ 等待30秒健康检查
   ├─ France VPS 更新
   └─ 本地Coco更新
   
4. 健康检查:
   ├─ HTTP 200 check (/health)
   ├─ API 响应时间 (<1s)
   ├─ 数据库连接 (可达)
   └─ 失败则自动回滚
   
5. 告警通知:
   ├─ Slack: 部署开始/完成/失败
   ├─ 邮件: 失败时立即通知
   └─ 日志: 全部记录到ElasticSearch

成本: 免费 (GitHub Actions免费层足够)
```

---

### 6️⃣ 性能监控不足 (MEDIUM)

**当前状态**: 无实时监控

**改善建议**:

```
监控栈部署:

1. 指标收集 (Prometheus):
   ├─ Node.js: 内存/CPU/请求延迟
   ├─ Python: FastAPI响应时间/错误率
   ├─ System: 磁盘/网络/温度
   └─ 采样间隔: 30秒
   
2. 日志聚合 (Loki):
   ├─ 应用日志 (stdout/stderr)
   ├─ 系统日志 (syslog)
   ├─ 审计日志 (git/deploy)
   └─ 保留期: 30天
   
3. 可视化 (Grafana):
   ├─ Dashboard 1: 系统健康
   ├─ Dashboard 2: 应用性能
   ├─ Dashboard 3: 业务指标
   └─ 告警规则: 15条
   
4. 追踪 (Jaeger):
   ├─ 请求路径追踪
   ├─ 跨服务依赖
   └─ 性能瓶颈识别

成本:
- 轻量级: ~$30/月 (Grafana Cloud free)
- 自托管: 免费 (已有VPS)
```

---

## 🚀 可扩展性分析

### 现在能支撑多少？

**当前配置 (5节点)**:
- 并发用户: ~500-1000
- QPS (Queries Per Second): ~100-200
- 数据量: <50GB
- 地理覆盖: 3地 (法国/美国/本地)

### 加到10节点会如何？

**新增节点方案**:
```
+5个新节点配置:

1. 日本节点 (东京)
   ├─ 用途: 亚太区域加速
   ├─ 配置: 2GB RAM / 30GB SSD
   ├─ 成本: ~$15/月
   └─ 延迟: <50ms (日本用户)

2. 新加坡节点
   ├─ 用途: 东南亚加速
   ├─ 配置: 2GB RAM / 30GB SSD
   ├─ 成本: ~$15/月
   └─ 延迟: <30ms (新加坡)

3. 德国节点 (补充法国)
   ├─ 用途: 欧洲故障转移 + 本地合规
   ├─ 配置: 4GB RAM / 50GB SSD (主)
   ├─ 成本: ~$20/月
   └─ 数据驻留: 欧洲 (GDPR)

4. 加拿大节点 (北美故障转移)
   ├─ 用途: USA VPS 备份
   ├─ 配置: 2GB RAM / 30GB SSD
   ├─ 成本: ~$12/月
   └─ 延迟: <80ms (美国东部)

5. 巴西节点 (南美扩展)
   ├─ 用途: 南美加速 + 拉美市场
   ├─ 配置: 2GB RAM / 30GB SSD
   ├─ 成本: ~$18/月
   └─ 延迟: <100ms (南美)

新架构能支撑:
- 并发用户: 5000-10000
- QPS: 500-1000
- 数据量: <200GB
- 全球覆盖: 10个节点 (6大洲)
- 总成本: ~$90-120/月

关键改进:
✅ 地理分散冗余 (任意节点故障不影响)
✅ 全球低延迟 (<100ms任何用户)
✅ 数据驻留合规 (本地化部署)
✅ 容量增加10倍
```

---

## 💰 成本分析与优化

### 当前成本 (每月)

```
Vercel (生产CDN)              $0-20   (免费层+可选付费)
Mac-mini (家中电费)            ~$10
USA VPS (2GB/40GB)             ~$8-12
France VPS (961MB/24GB)        ~$3-5
域名续费 (年)                  ~$2 (按月算)
─────────────────────────────────────
合计: ~$23-49/月

如果升级France VPS (建议):
+ France VPS 升级              ~$8-12 (4GB/50GB)
= 新合计: ~$31-61/月
```

### 成本优化建议

```
1. 电费优化:
   - Mac-mini: 改为按需启动 (-30% = -$3)
   - Coco: 改为按需启动 (-30% = -$3)
   
2. VPS优化:
   - 货比三家: Linode vs DigitalOcean vs Vultr
   - USA: 2GB可降至$6/月 (-$2-4)
   - France: 升级到4GB后$10/月 (-$0-2)
   
3. 存储优化:
   - 启用S3备份而非本地 (-$5/月)
   - Backblaze B2: $0.006/GB/月
   
4. 监控成本:
   - 自托管Prometheus (-$30/月vs Cloud)
   - 一年省$360

长期目标 (12个月):
- 当前: $23-49/月 × 12 = $276-588/年
- 优化后: $18-35/月 × 12 = $216-420/年
- 节省: $60-168/年 (20-30%)

但优先级: 功能 >> 成本 (建议投资在France升级)
```

---

## 📋 改进优先级矩阵

| 优先级 | 项目 | 工作量 | 收益 | 目标完成 |
|--------|------|--------|------|----------|
| **P0** | Phase 0/B 架构统一 | 4h | ★★★★★ | 本周 |
| **P0** | France VPS升级 | 0.5h | ★★★★★ | 本周 |
| **P1** | 自动化部署流程 | 3h | ★★★★ | 下周 |
| **P1** | 数据库策略制定 | 2h | ★★★★ | 下周 |
| **P2** | 性能监控栈 | 6h | ★★★ | 2周 |
| **P2** | 容器化部署 | 5h | ★★★ | 2周 |
| **P3** | 全球节点扩展 | 10h | ★★★ | 1月 |

---

## 🎯 立即行动清单

### 本周 (优先P0):

- [ ] **Phase 0/B统一**
  ```bash
  # 冻结Phase 0
  mkdir -p /Users/yumei/SAFvsOil/.archive
  mv /Users/yumei/SAFvsOil/public/*.html .archive/
  
  # 验证Phase B覆盖所有功能
  npm run web:gate  # TypeScript检查
  npm run test      # 功能测试
  ```

- [ ] **France VPS升级**
  ```bash
  # 提升RAM: 961MB → 4GB
  # 提升Disk: 24GB → 50GB
  # 预算: $8-12/月
  # 供应商: 联系现有VPS商
  ```

### 下周 (P1):

- [ ] **自动化部署**
  ```bash
  # 在Mac-mini上部署webhook receiver
  # GitHub Actions → curl post-deploy-hook
  # 自动: git pull + npm run build + test + push to nodes
  ```

- [ ] **数据库规划**
  ```bash
  # 选择: SQLite初期 vs PostgreSQL长期
  # 位置: France主 + USA备份
  # 备份: 3-2-1规则
  ```

---

## 🏁 结论

**当前架构评分**: 7/10

**优势**:
- ✅ Vercel生产部署稳定
- ✅ VPS双节点可靠
- ✅ 开发流程高效

**缺陷**:
- ❌ Phase 0/B重复分裂
- ❌ France VPS资源严重不足
- ❌ 部署未自动化
- ❌ 监控缺失
- ❌ 数据库无策略

**改进后评分目标**: 9.5/10

**投资**: $30-50/月增加 + 10小时工程时间  
**收益**: 扩展能力10倍 + 可靠性+30% + 成本优化15%

---

**建议**: 优先做P0项目 (本周), 然后按优先级推进。
