# JetScope

> **Sustainable Aviation Fuel Market Intelligence**
> 
> Real-time price benchmarking, carbon cost analysis, and procurement decision support for European aviation operators.

[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.13+-blue.svg)](https://python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-teal.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What is JetScope?

JetScope helps aviation operators and fuel procurement teams make data-driven decisions about Sustainable Aviation Fuel (SAF) adoption. It combines real-time market data with policy analysis to answer:

- **When** is the right time to switch from fossil jet fuel to SAF?
- **Which** SAF pathway offers the best cost-competitiveness?
- **How much** carbon cost savings can be expected?

### Key Features

| Feature | Description |
|---------|-------------|
| **Real-time Market Snapshot** | Live Brent crude, jet fuel, EU ETS carbon prices, and Germany premium |
| **SAF Route Analysis** | Cost comparison across 6 SAF pathways (HEFA, AtJ, FT-SPK, etc.) |
| **Breakeven Calculator** | Interactive tool to find oil price thresholds where SAF becomes competitive |
| **Policy Integration** | ReFuelEU targets and timeline visualization |
| **Scenario Management** | Save, load, and compare procurement scenarios |
| **Multi-language** | English, German, and Chinese (中文) support |

---

## Quick Start

### Prerequisites

- **Node.js** 22+ (with npm)
- **Python** 3.13+ (3.14 not yet compatible with pydantic-core)
- **PostgreSQL** 16+ (optional, SQLite works for development)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/wyl2607/jetscope.git
cd jetscope

# 2. Install Node.js dependencies
npm install
cd apps/web && npm install && cd ../..

# 3. Set up Python environment
cd apps/api
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ../..

# 4. Configure environment
cp .env.example .env
# Edit .env with your settings (admin token, database URL, etc.)

# 5. Initialize database
npm run api:migrate
```

### Running the Application

**Option A: Full stack (recommended)**
```bash
npm run dev
```
This starts both the Next.js frontend (port 3000) and FastAPI backend (port 8000).

**Option B: Separate terminals**
```bash
# Terminal 1 - Backend
npm run api:dev

# Terminal 2 - Frontend
npm run web:dev
```

**Option C: Docker (production-like)**
```bash
cd infra
docker-compose up -d
```

Then open http://localhost:3000

---

## Architecture

```
jetscope/
├── apps/
│   ├── web/              # Next.js 16 + TypeScript + Tailwind CSS
│   │   ├── app/          # App router pages
│   │   ├── components/   # Reusable UI components
│   │   └── lib/          # Utilities and data fetching
│   └── api/              # FastAPI + SQLAlchemy + Alembic
│       ├── app/          # Application code
│       │   ├── api/      # API routers
│       │   ├── core/     # Market data pipeline
│       │   ├── db/       # Database models
│       │   └── services/ # Business logic
│       └── migrations/   # Database migrations
├── packages/core/        # Shared industry models and logic
├── infra/                # Docker Compose + nginx config
├── docs/                 # API contracts and deployment guides
├── scripts/              # Preflight checks and testing
└── test/                 # E2E and contract tests
```

---

## API Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/health` | GET | Service health check |
| `/v1/market/snapshot` | GET | Current market prices (7 metrics) |
| `/v1/market/refresh` | POST | Force refresh market data (admin) |
| `/v1/scenarios` | GET/POST | List/create scenarios |
| `/v1/scenarios/{id}` | GET/PUT/DELETE | Manage specific scenario |
| `/v1/pathways` | GET | SAF pathway cost data |
| `/v1/policies/refuel-eu` | GET | ReFuelEU policy targets |

Full API documentation: `docs/API_CONTRACT_V1.md`

---

## Data Sources

| Metric | Source | Update Frequency |
|--------|--------|------------------|
| Brent Crude | FRED / EIA | Daily |
| Jet Fuel Spot | FRED / EIA Gulf Coast | Daily |
| EU ETS Carbon | EEX / European Commission | Hourly |
| Germany Premium | Energy Tax Directive | Daily |
| Rotterdam Jet | Investing.com | 4 hours |
| SAF Proxy | EASA ReFuelEU Annual Report | Annual |

---

## Development

### Running Tests

```bash
# Unit tests
npm test

# E2E tests (requires running app)
npm run preflight:e2e

# Full preflight (build + typecheck + lint + test + smoke)
npm run preflight
```

### Project Scripts

```bash
npm run web:build      # Build Next.js for production
npm run web:lint       # Run ESLint
npm run web:typecheck  # TypeScript type checking
npm run api:check      # Python syntax check
npm run api:migrate    # Run database migrations
npm run docker:up      # Start PostgreSQL in Docker
```

---

## Deployment

### Docker Compose (Recommended)

```bash
cd infra
cp ../.env.example .env  # Configure production values
docker-compose up -d --build
```

See `docs/DEPLOYMENT_GUIDE.md` for detailed instructions including:
- SSL certificate setup (Let's Encrypt / Cloudflare Origin CA)
- Environment configuration
- Database backup strategies
- Monitoring and alerting

### Unified Release Flow

```bash
cd ~/projects/jetscope
source scripts/safenv
npm run release
```

This release entrypoint now standardizes the expected sequence after a successful improvement:
- run full local `preflight`
- sync the workspace to configured nodes
- publish `main` to GitHub
- trigger `usa-vps` deployment via `/opt/jetscope/scripts/auto-deploy.sh`
- require the VPS to deploy the exact local `HEAD` commit, not just “latest when checked”

Project deployment memory now lives in `OPERATIONS.md`. Future work should treat that file as the default operational source of truth.

---

## Contributing

This is a research and development project. Contributions welcome:

1. Fork the repository
2. Create a feature branch
3. Run `npm run preflight` to ensure quality
4. Submit a pull request

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Market data from [FRED](https://fred.stlouisfed.org/), [EIA](https://www.eia.gov/), [EEX](https://www.eex.com/)
- Policy data from [EASA ReFuelEU](https://www.easa.europa.eu/)
- Built with [Next.js](https://nextjs.org/), [FastAPI](https://fastapi.tiangolo.com/), [Tailwind CSS](https://tailwindcss.com/)
