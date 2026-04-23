# JetScope

> 可持续航空燃料 (SAF) 价格分析与竞争力评估工具
> Sustainable Aviation Fuel Price Analysis & Competitiveness Dashboard

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)]()

---

## 快速开始

### 前置要求

- **Node.js** 22+ (推荐 24 LTS)
- **Python** 3.13+ (3.14 与 pydantic-core 暂不兼容)
- **PostgreSQL** 15+ (可选，默认 SQLite)
- **uv** (Python 包管理器，可选但推荐)

### 安装

```bash
# 克隆仓库
git clone https://github.com/wyl2607/jetscope.git
cd jetscope

# 安装 Node 依赖
npm install

# 安装 Python 依赖
cd apps/api
uv venv --python python3.13 .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### 运行

**前端** (Next.js 16):
```bash
cd apps/web
npm run dev
# 打开 http://localhost:3000
```

**后端** (FastAPI):
```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload
# API 文档 http://localhost:8000/docs
```

**数据库** (Docker，可选):
```bash
cd infra
docker compose up -d
```

**一键验证**:
```bash
npm run preflight    # check + test + build + api-check + smoke
```

---

## 功能特性

| 功能 | 状态 | 说明 |
|------|------|------|
| 实时燃油价格监控 | ✅ | Brent / Jet Fuel / Rotterdam ARA |
| EU ETS 碳价追踪 | ✅ | EEX 市场数据 |
| SAF 竞争力分析 | ✅ | 7 条 SAF 路线盈亏平衡计算 |
| 交互式盈亏平衡计算器 | ✅ | 可调节油价/SAF 价/碳价/Blend 率 |
| 德国航空税溢价 | ✅ | 动态计算德国能源税影响 |
| 场景管理 | ✅ | 保存/加载/对比分析场景 |
| 多语言支持 | ✅ | 中文 / 英文 / 德文 |
| 危机监控看板 | ✅ | EU 航空燃油储备预警 |

### 数据来源

- **Brent**: FRED `DCOILBRENTEU` / EIA Daily Prices
- **Jet Fuel**: FRED `DJFUELUSGULF` / ARA Rotterdam
- **EU ETS**: European Energy Exchange (EEX)
- **Carbon Proxy**: EU CBAM + ECB EUR/USD
- **SAF Costs**: 可编辑研究基线 (公开 API 稀缺，保留本地调整能力)

---

## 技术栈

```
Frontend:    Next.js 16 + TypeScript 6 + Tailwind CSS 4
Backend:     FastAPI + SQLAlchemy 2 + Pydantic 2
Database:    SQLite (开发) / PostgreSQL (生产)
API Style:   REST + OpenAPI 3.0
Deployment:  Docker Compose + Nginx
```

### 项目结构

```
jetscope/
├── apps/
│   ├── web/              # Next.js 前端
│   │   ├── app/          # App Router (pages, API routes)
│   │   ├── components/   # React 组件
│   │   └── lib/          # 工具函数
│   └── api/              # FastAPI 后端
│       ├── app/          # 路由、模型、服务
│       ├── adapters/     # 数据源适配器
│       └── tests/        # 单元测试
├── packages/core/        # 共享核心库
├── infra/                # Docker Compose + Nginx
└── docs/                 # API 契约 + 部署指南
```

---

## API 概览

启动后端后访问 `http://localhost:8000/docs` 查看完整 OpenAPI 文档。

核心端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/market` | 市场数据快照 |
| POST | `/market/refresh` | 强制刷新市场数据 |
| GET | `/market/history` | 历史价格趋势 |
| GET | `/scenarios` | 已保存场景列表 |
| POST | `/scenarios` | 保存新场景 |
| GET | `/pathways` | SAF 路线基线数据 |
| GET | `/policies/refuel-eu` | ReFuelEU 政策时间线 |

---

## 可复用组件

### 价格分析小工具

前端核心计算逻辑位于 `packages/core/industry/`，可独立复用：

```typescript
import { calculateBreakeven } from 'packages/core/industry/readiness';

const result = calculateBreakeven({
  oilPrice: 115,        // Brent USD/bbl
  safPrice: 1.75,       // SAF USD/L
  euEtsPrice: 92.5,     // EUR/tCO2
  blendRate: 6,         // SAF blend %
  germanyPremium: 2.5,  // DE tax premium %
});
// result: { blendedCost, premiumVsJet, isCompetitive }
```

### 数据源适配器

`apps/api/adapters/` 包含多个公开数据源的抓取适配器，可独立使用：

- `euets.py` — EU ETS 价格抓取
- `rotterdam.py` — ARA Rotterdam Jet Fuel
- `contract.py` — 市场数据聚合

---

## 部署

### 开发环境
```bash
npm run preflight    # 完整验证
```

### 生产部署 (Docker)
```bash
cd infra
docker compose -f docker-compose.prod.yml up -d
```

详见 [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)

---

## 贡献

欢迎 PR 和 Issue！

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/xxx`
3. 提交前运行：`npm run preflight`
4. 提交 PR

---

## 许可证

MIT License — 详见 LICENSE 文件

---

**JetScope** © 2026 — 让 SAF 价格透明化
