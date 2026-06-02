# JetScope Quickstart

This guide gets an outside reviewer from a clean checkout to a local demo in about 10 minutes without secrets or production infrastructure.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Python 3.13 or newer
- `git`
- Optional: Docker if you want local PostgreSQL support from `infra/docker-compose.yml`

## Clone And Install

```bash
git clone <repo-url>
cd jetscope
npm install
```

## API Virtual Environment

Create a local Python virtual environment for the FastAPI app:

```bash
cd apps/api
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

Windows PowerShell:

```powershell
cd apps\api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..\..
```

## Environment Setup

1. Default reviewer runs do not require an environment file.
2. If you need to change API settings, copy `.env.example` to `apps/api/.env`; the root `npm run api:dev` script starts FastAPI from `apps/api`.
3. If a value must be visible to both web and API processes, export it in the shell before running `npm run dev`.
4. Do not add real provider credentials for the quickstart; the demo works in mock-first mode.
5. If you need a local admin token for protected write routes, set `JETSCOPE_ADMIN_TOKEN` in `apps/api/.env` or export it in your shell.

Key values in `.env.example` are already aligned to local development defaults:

- `JETSCOPE_DATABASE_URL=sqlite:///./data/market.db`
- `JETSCOPE_API_PREFIX=/v1`
- `JETSCOPE_API_BASE_URL=http://127.0.0.1:8000`
- `JETSCOPE_AI_RESEARCH_ENABLED=false`
- `JETSCOPE_AI_RESEARCH_MOCK_MODE=true`

Optional keys are commented in `.env.example` and can stay unset for a reviewer run.

## Run Web And API

Run both services from the repo root:

```bash
npm run dev
```

If you prefer separate terminals:

```bash
npm run api:dev
npm run web:dev
```

Expected local ports:

- API: `http://127.0.0.1:8000`
- Web: `http://localhost:3000`

## Smoke Checks

Use these as the minimal reviewer smoke path:

1. Open the web app at `http://localhost:3000` and confirm the market dashboard loads.
2. Hit the health endpoint:

```bash
curl http://127.0.0.1:8000/v1/health
```

3. Check the market snapshot:

```bash
curl http://127.0.0.1:8000/v1/market/snapshot
```

4. Check the tipping-point analysis endpoint with a sample input:

```bash
curl "http://127.0.0.1:8000/v1/analysis/tipping-point?fossil_jet_usd_per_l=0.9&carbon_price_eur_per_t=90"
```

5. Check research signals in mock-first mode:

```bash
curl http://127.0.0.1:8000/v1/research/signals
```

6. If you need to verify the API contract surface, compare the responses against [`docs/API_CONTRACT_V1.md`](./API_CONTRACT_V1.md), [`docs/DATA_CONTRACT_V1.md`](./DATA_CONTRACT_V1.md), and [`docs/AI_PIPELINE.md`](./AI_PIPELINE.md).

## Common Failures

- `npm run dev` fails because the API virtual environment is missing: create `apps/api/.venv` and install `requirements.txt`.
- Port `8000` or `3000` is already in use: stop the other process or change the local port in your shell session.
- The API starts but returns SQLite path errors: ensure `apps/api/.env` or your shell environment points at a writable SQLite path.
- `curl` returns empty research data: this is expected if no local seed data exists and `JETSCOPE_AI_RESEARCH_MOCK_MODE=true` is still the default.
- Protected write routes return `401` or `403`: set a non-empty `JETSCOPE_ADMIN_TOKEN` in `apps/api/.env` or your shell and send it as `x-admin-token`.

## Timeboxed Reviewer Path

If you only have a few minutes, do this in order:

1. Start `npm run dev`.
2. Open the web UI and check that the market snapshot renders.
3. Call `/v1/market/snapshot`, `/v1/analysis/tipping-point`, and `/v1/research/signals`.
4. Confirm the mock-first AI behavior from [`docs/AI_PIPELINE.md`](./AI_PIPELINE.md).
