# JetScope

> European aviation fuel transition intelligence for SAF timing, reserve stress, policy exposure, and procurement decisions.

[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.13+-blue.svg)](https://python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-teal.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Languages

- [English](#english)
- [中文](#中文)
- [Deutsch](#deutsch)

---

## English

### What Is JetScope?

JetScope is a market intelligence platform for the European aviation fuel transition. It helps airlines, fuel procurement teams, analysts, and policy observers answer one practical question: when does Sustainable Aviation Fuel (SAF) become the economically rational choice compared with fossil jet fuel?

The product connects market prices, EU policy, carbon costs, reserve coverage, SAF pathway economics, and AI-assisted research signals into a single decision surface.

### Product Capabilities

| Capability | Purpose |
| --- | --- |
| Market dashboard | Tracks aviation fuel, Brent proxy, EU ETS carbon price, German premium, Rotterdam proxy, SAF proxy, freshness, and source health. |
| SAF tipping point analysis | Models when fossil jet fuel plus carbon exposure crosses SAF effective cost. |
| Airline decision matrix | Combines fuel price, reserve stress, carbon exposure, and SAF pathway cost into procurement signals. |
| EU reserve stress view | Shows European reserve coverage pressure and crisis indicators. |
| Scenario registry | Saves and compares procurement assumptions and route edits. |
| Source coverage panel | Makes data provenance, confidence, fallback state, and freshness visible. |
| AI research pipeline | Fetches fuel-transition news and extracts structured ESG/research signals with a mock-first Claude pipeline. |
| Multilingual web surface | Includes English, German, and Chinese locale assets for selected product pages. |

### Architecture

```text
jetscope/
├── apps/
│   ├── web/                  # Next.js 16, React 19, TypeScript, Tailwind CSS
│   ├── api/                  # FastAPI, SQLAlchemy, Alembic, market and research services
│   └── db/                   # SQL migration artifacts
├── packages/core/            # Shared aviation and industry domain models
├── data/                     # Small checked-in sample/baseline datasets only
├── docs/                     # Product, API, data-contract, AI-pipeline, and deployment docs
├── infra/                    # Docker Compose, nginx, and production service examples
├── scripts/                  # Release, preflight, sync, deploy, and smoke-check scripts
└── test/                     # Node contract and read-model tests
```

### Core API Surface

| Endpoint | Method | Description |
| --- | --- | --- |
| `/v1/health` | GET | API health and capability status. |
| `/v1/market/snapshot` | GET | Current market values, source status, and source detail metadata. |
| `/v1/market/history` | GET | Historical market series used by dashboard and trend views. |
| `/v1/market/refresh` | POST | Admin-protected market refresh. |
| `/v1/analysis/tipping-point` | GET | SAF/fossil tipping point calculation. |
| `/v1/analysis/airline-decision` | GET | Procurement decision analysis for an airline-style scenario. |
| `/v1/analysis/tipping-point/events` | GET | Persisted tipping event timeline. |
| `/v1/reserves/eu` | GET | EU reserve stress signal. |
| `/v1/research/signals` | GET | Structured AI research signals with filters for time, type, and limit. |
| `/v1/sources/coverage` | GET | Source coverage, quality, and provenance status. |
| `/v1/workspaces/{workspace_slug}/scenarios` | GET/POST | Scenario list and creation. Write operations require an admin token. |

More detail lives in `docs/API_CONTRACT_V1.md`, `docs/DATA_CONTRACT_V1.md`, `docs/AI_PIPELINE.md`, and `docs/REFACTORING_STRATEGY.md`.

### Prerequisites

- Node.js 22+
- npm 10+
- Python 3.13+
- SQLite for local development
- PostgreSQL 16+ for production-style deployment, if configured
- Docker optional for infrastructure workflows

### Local Setup

```bash
git clone https://github.com/wyl2607/jetscope.git
cd jetscope

npm install

cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

On Windows PowerShell, activate the API environment with:

```powershell
apps\api\.venv\Scripts\Activate.ps1
```

### Configuration

The API uses `JETSCOPE_` environment variables by default. Important variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `JETSCOPE_API_PREFIX` | `/v1` | API prefix. |
| `JETSCOPE_DATABASE_URL` | `sqlite:///./data/market.db` | SQLAlchemy database URL. |
| `JETSCOPE_ADMIN_TOKEN` | empty | Required for admin-protected write routes. |
| `JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS` | `600` | Background market refresh interval. |
| `JETSCOPE_SCHEMA_BOOTSTRAP_MODE` | `alembic` | Database bootstrap strategy. |
| `JETSCOPE_AI_RESEARCH_ENABLED` | `false` | Enables daily AI research ingestion loop. |
| `JETSCOPE_AI_RESEARCH_MOCK_MODE` | `true` | Keeps Claude extraction deterministic and cost-safe by default. |
| `JETSCOPE_ANTHROPIC_API_KEY` | empty | Anthropic key for live extraction. |
| `JETSCOPE_NEWSAPI_KEY` | empty | Optional NewsAPI key; Reuters RSS fallback is used otherwise. |

Selected legacy `SAFVSOIL_*` variables may still be accepted for compatibility with older deployments. New deployments should prefer `JETSCOPE_*` where supported.

### Running Locally

```bash
npm run dev
```

This starts the FastAPI backend on port `8000` and the Next.js frontend on port `3000`.

Separate terminals are also supported:

```bash
npm run api:dev
npm run web:dev
```

### Database Migrations

```bash
npm run api:migrate
```

### Verification

```bash
npm test
npm run web:typecheck
npm run web:build
cd apps/api && python -m compileall app && python -m pytest tests/test_ai_research.py
```

The full operational gate is:

```bash
npm run preflight
```

`npm run api:check` auto-detects `JETSCOPE_PYTHON_BIN`, `PYTHON_BIN`, the API virtual environment, or the platform default Python interpreter.

```bash
npm run web:build      # Build Next.js for production
npm run web:lint       # Run ESLint
npm run web:typecheck  # TypeScript type checking
npm run api:check      # Python syntax check
npm run api:test       # Backend pytest suite via apps/api/.venv
npm run api:openapi:check # OpenAPI drift check
npm run api:migrate    # Run database migrations
npm run docker:up      # Start PostgreSQL in Docker
npm run preflight:e2e  # E2E tests (requires running app/build)
```

### Deployment

The canonical release path is documented in `OPERATIONS.md`:

```bash
cd ~/projects/jetscope
source scripts/jetscope-env
APPROVE_JETSCOPE_RELEASE=<approval-token> ./scripts/release.sh --approval-token <approval-token>
```

This release entrypoint now standardizes the expected sequence after a successful improvement:
- run full local `preflight`
- publish `main` to GitHub
- trigger `usa-vps` deployment from `/opt/jetscope` via `bash ./scripts/auto-deploy.sh`
- require the VPS to deploy the exact local `HEAD` commit, not just “latest when checked”

Development worker sync is opt-in and is not part of the default release path.

Project deployment memory now lives in `OPERATIONS.md`. Future work should treat that file as the default operational source of truth.

Production-style Docker and nginx examples are in `infra/` and `docker-compose.prod.yml`.

### Repository Hygiene

Tracked files should be product code, tests, public documentation, small sample datasets, infrastructure templates, and deterministic migration artifacts. Do not commit secrets, local databases, logs, generated build output, node_modules, private automation ledgers, or internal handoff archives.

### License

MIT. See `LICENSE`.

---

## 中文

### JetScope 是什么？

JetScope 是面向欧洲航空燃料转型的市场情报平台。它帮助航空公司、燃料采购团队、行业分析师和政策观察者判断一个核心问题：在什么条件下，可持续航空燃料（SAF）相对传统化石航煤会成为经济上合理的选择？

平台把市场价格、欧盟政策、碳成本、燃料储备压力、SAF 路径成本和 AI 辅助研究信号整合到同一个决策界面中。

### 核心能力

| 能力 | 作用 |
| --- | --- |
| 市场仪表盘 | 跟踪航空燃料、Brent 代理指标、EU ETS 碳价、德国溢价、Rotterdam 代理指标、SAF 代理价格、数据新鲜度和来源健康状态。 |
| SAF 拐点分析 | 建模化石航煤加碳成本后，何时与 SAF 有效成本交叉。 |
| 航司采购决策矩阵 | 综合燃料价格、储备压力、碳成本和 SAF 路径成本，输出采购判断信号。 |
| 欧盟储备压力视图 | 展示欧洲燃料储备覆盖压力和危机指标。 |
| 情景注册表 | 保存、加载和比较采购假设与航线调整。 |
| 数据来源覆盖面板 | 明确展示数据来源、置信度、fallback 状态和新鲜度。 |
| AI 研究流水线 | 抓取燃料转型相关新闻，并通过默认 mock 安全模式的 Claude 流水线提取结构化 ESG/研究信号。 |
| 多语言界面 | 维护英文、德文和中文的部分产品页面语言资产。 |

### 技术结构

```text
jetscope/
├── apps/web       # Next.js 16、React 19、TypeScript、Tailwind CSS
├── apps/api       # FastAPI、SQLAlchemy、Alembic、市场与研究服务
├── packages/core  # 共享航空和行业领域模型
├── data           # 小型样例和基线数据
├── docs           # 产品、API、数据合同、AI 流水线和部署文档
├── infra          # Docker Compose、nginx 和生产服务模板
├── scripts        # 发布、预检、同步、部署和 smoke check 脚本
└── test           # Node 合同测试和 read-model 测试
```

### 快速开始

```bash
git clone https://github.com/wyl2607/jetscope.git
cd jetscope

npm install

cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..

npm run dev
```

打开 `http://localhost:3000` 查看前端，FastAPI 默认运行在 `http://localhost:8000`。

### 配置说明

新配置应优先使用 `JETSCOPE_*` 环境变量，例如：

- `JETSCOPE_DATABASE_URL`
- `JETSCOPE_ADMIN_TOKEN`
- `JETSCOPE_AI_RESEARCH_ENABLED`
- `JETSCOPE_AI_RESEARCH_MOCK_MODE`
- `JETSCOPE_ANTHROPIC_API_KEY`
- `JETSCOPE_NEWSAPI_KEY`

为了兼容旧部署，部分 `SAFVSOIL_*` 变量仍可能被接受。新的部署和文档应使用 `JETSCOPE_*`。

### 验证命令

```bash
npm test
npm run web:typecheck
npm run web:build
cd apps/api && python -m compileall app && python -m pytest tests/test_ai_research.py
```

完整发布前建议运行：

```bash
npm run preflight
```

### 仓库整理原则

仓库中应该保留产品代码、测试、公开文档、小型样例数据、基础设施模板和确定性的迁移文件。不应该提交密钥、`.env` 文件、本地数据库、日志、构建产物、`node_modules`、私人自动化 ledger 或内部交接归档。

---

## Deutsch

### Was Ist JetScope?

JetScope ist eine Market-Intelligence-Plattform für die europäische Transformation von Flugkraftstoffen. Sie unterstützt Airlines, Einkaufsteams, Analysten und Policy-Teams bei der Frage, wann Sustainable Aviation Fuel (SAF) gegenüber fossilem Jet Fuel wirtschaftlich sinnvoll wird.

Die Plattform verbindet Marktpreise, EU-Regulierung, CO2-Kosten, Reserveabdeckung, SAF-Pfadkosten und KI-gestützte Research-Signale in einer gemeinsamen Entscheidungsoberfläche.

### Kernfunktionen

| Funktion | Nutzen |
| --- | --- |
| Markt-Dashboard | Überwacht Aviation-Fuel-Preise, Brent-Proxy, EU-ETS-CO2-Preis, Deutschland-Premium, Rotterdam-Proxy, SAF-Proxy, Datenfrische und Quellenstatus. |
| SAF-Tipping-Point | Modelliert, wann fossiler Jet Fuel inklusive CO2-Exponierung die effektiven SAF-Kosten erreicht oder übersteigt. |
| Airline-Entscheidungsmatrix | Kombiniert Fuel Price, Reserve Stress, CO2-Kosten und SAF-Pfadkosten zu Beschaffungssignalen. |
| EU-Reserve-Stress | Zeigt Reserveabdeckung und Krisensignale für Europa. |
| Szenario-Registry | Speichert und vergleicht Beschaffungsannahmen und Routenanpassungen. |
| Quellenabdeckung | Macht Provenienz, Konfidenz, Fallback-Status und Aktualität transparent. |
| KI-Research-Pipeline | Erfasst Nachrichten zur Fuel Transition und extrahiert strukturierte ESG-/Research-Signale mit einer standardmäßig sicheren Claude-Mock-Pipeline. |
| Mehrsprachige Oberfläche | Enthält englische, deutsche und chinesische Sprachressourcen für ausgewählte Produktseiten. |

### Technische Struktur

```text
jetscope/
├── apps/web       # Next.js 16, React 19, TypeScript, Tailwind CSS
├── apps/api       # FastAPI, SQLAlchemy, Alembic, Markt- und Research-Services
├── packages/core  # Gemeinsame Aviation- und Industry-Domain-Modelle
├── data           # Kleine Beispiel- und Baseline-Datensätze
├── docs           # Produkt-, API-, Datenvertrag-, KI-Pipeline- und Deployment-Dokumente
├── infra          # Docker Compose, nginx und Produktions-Templates
├── scripts        # Release-, Preflight-, Sync-, Deploy- und Smoke-Test-Skripte
└── test           # Node Contract Tests und Read-Model Tests
```

### Schnellstart

```bash
git clone https://github.com/wyl2607/jetscope.git
cd jetscope

npm install

cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..

npm run dev
```

Die Web-App läuft standardmäßig unter `http://localhost:3000`, die API unter `http://localhost:8000`.

### Konfiguration

Neue Deployments sollten bevorzugt `JETSCOPE_*` Umgebungsvariablen verwenden:

- `JETSCOPE_DATABASE_URL`
- `JETSCOPE_ADMIN_TOKEN`
- `JETSCOPE_AI_RESEARCH_ENABLED`
- `JETSCOPE_AI_RESEARCH_MOCK_MODE`
- `JETSCOPE_ANTHROPIC_API_KEY`
- `JETSCOPE_NEWSAPI_KEY`

Einige ältere `SAFVSOIL_*` Variablen können aus Kompatibilitätsgründen noch akzeptiert werden. Neue Dokumentation und Deployments sollten `JETSCOPE_*` verwenden.

### Validierung

```bash
npm test
npm run web:typecheck
npm run web:build
cd apps/api && python -m compileall app && python -m pytest tests/test_ai_research.py
```

Vor einem vollständigen Release:

```bash
npm run preflight
```

### Repository-Hygiene

Im Repository sollten Produktcode, Tests, öffentliche Dokumentation, kleine Beispieldaten, Infrastrukturvorlagen und deterministische Migrationen liegen. Secrets, `.env` Dateien, lokale Datenbanken, Logs, Build-Artefakte, `node_modules`, private Automation-Ledger und interne Übergabearchive gehören nicht in Git.
