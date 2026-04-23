# JetScope GitHub 发布规范

> **版本**: v1.0  
> **日期**: 2026-04-23  
> **本地开发**: `~/projects/jetscope`  
> **GitHub 发布**: `https://github.com/wyl2607/jetscope`

---

## 分离原则

| 维度 | 本地开发 (`jetscope/`) | GitHub 公开 (`wyl2607/jetscope`) |
|------|------------------------|----------------------------------|
| **目标用户** | 开发团队 | 外部开发者、复刻者 |
| **内容** | 完整代码 + 内部规划 + 历史文档 | 可运行代码 + 部署指南 + API 文档 |
| **敏感信息** | 含 `.env`, API keys, 集群 IP | **零敏感信息** |
| **内部文档** | CLUSTER*, LANE*, WEBHOOK*, DELIVERY* | **不含** |
| **README** | 开发指引 | 复刻安装指南 |

---

## 本地保留（不推 GitHub）

### 1. 开发规划文档
```
docs/archive/           # 全部不推
├── cluster/            # CLUSTER_*.md — 集群配置（含 IP）
├── lanes/              # LANE*.md — 开发 lane 规划
├── webhook/            # WEBHOOK_*.md — 内部部署流程
├── delivery/           # DELIVERY/COMPLETION/FINAL — 交付报告
├── deploy/             # DEPLOY*.md — 内部部署细节
└── onboarding/         # START_HERE, FAQ, SQLITE 历史
```

### 2. 敏感配置
```
.env.webhook            # Webhook 密钥
.env.api-keys           # API 密钥
.env                    # 本地环境变量
scripts/auto-sync-cluster.sh   # 含集群 IP
```

### 3. 开发进展文档
```
PROJECT_PROGRESS*.md
PROJECT_AUDIT*.md
SAF_DEVELOPMENT_ANALYSIS_REPORT.md
DAY*_*                  # 每日任务记录
EXECUTE*                # 执行计划
```

### 4. 内部工具
```
scripts/deploy/         # 内部部署脚本
scripts/verify/         # 内部验证脚本
scripts/auto-sync-cluster.sh
scripts/publish-to-github.sh   # 仅本机使用
```

---

## GitHub 保留（公开可复刻）

### 1. 核心代码
```
apps/web/               # Next.js 前端（完整）
apps/api/               # FastAPI 后端（完整）
packages/core/          # 共享核心库
infra/                  # Docker Compose + nginx
```

### 2. 公共文档
```
docs/
├── API_CONTRACT_V1.md         # API 契约
├── DEPLOYMENT_GUIDE.md        # 部署指南（对外版）
└── product-architecture.md    # 产品架构
```

### 3. 复刻指南
```
README.md               # 对外 README：安装、运行、复用
CHANGELOG.md            # 版本历史
LICENSE                 # 开源协议（待添加）
```

### 4. 可复用工具
```
scripts/
├── safenv              # 环境自发现
├── backup-coco.sh      # 备份脚本（通用）
└── health_check.sh     # 健康检查
```

---

## 发布流程

```bash
# 1. 本地开发完成，验证通过
cd ~/projects/jetscope
npm run preflight

# 2. 执行发布脚本（自动去敏）
./scripts/publish-to-github.sh

# 3. 脚本自动执行：
#    - rsync 到 ~/projects/jetscope-publish/
#    - 排除所有内部文档
#    - 验证 build
#    - push 到 GitHub
```

---

## 对外 README 结构

```markdown
# JetScope

> 可持续航空燃料 (SAF) 价格分析与竞争力评估工具

## 快速开始

### 前置要求
- Node.js 22+
- Python 3.13+
- PostgreSQL 15+ (可选，默认 SQLite)

### 安装
```bash
git clone https://github.com/wyl2607/jetscope.git
cd jetscope
npm install
cd apps/api && pip install -r requirements.txt
```

### 运行
```bash
# 前端
cd apps/web && npm run dev

# 后端
cd apps/api && uvicorn app.main:app --reload
```

## 功能
- [x] 实时燃油价格监控
- [x] SAF 竞争力分析
- [x] 交互式盈亏平衡计算器
- [x] EU ETS 碳价追踪

## 技术栈
- Next.js 16 + TypeScript + Tailwind
- FastAPI + SQLAlchemy
- SQLite / PostgreSQL

## 许可证
MIT
```

---

**维护**: 本规范随项目变化更新，更新位置：`~/projects/jetscope/docs/GITHUB_PUBLISH_POLICY.md`
