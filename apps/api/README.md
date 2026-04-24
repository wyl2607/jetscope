# JetScope API

FastAPI backend for JetScope product surfaces (`/v1/*`), including:

- market snapshot persistence and refresh status tracking
- workspace preferences and scenario CRUD
- pathway and policy admin upsert routes
- health capability reporting for phase migration visibility
- EU reserve stress, tipping point, and AI research signal routes

## Local setup

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run API

```bash
uvicorn app.main:app --reload
```

Defaults:

- API prefix: `/v1`
- DB: `sqlite:///./data/market.db`
- admin token: empty by default; must be configured before using protected write routes
- schema bootstrap mode: `alembic`

## Key environment variables

- `JETSCOPE_DATABASE_URL`
- `JETSCOPE_API_PREFIX`
- `JETSCOPE_ADMIN_TOKEN`
- `JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS`
- `JETSCOPE_ENABLE_SQLITE_ROUTES` (`false` by default; opt-in for local SQLite integration routes)
- `JETSCOPE_SCHEMA_BOOTSTRAP_MODE` (`alembic` or `create_all`)
- `JETSCOPE_PHASE0_DEPRECATION_GATE`
- `JETSCOPE_AI_RESEARCH_ENABLED` (`false` by default)
- `JETSCOPE_AI_RESEARCH_MOCK_MODE` (`true` by default)
- `JETSCOPE_ANTHROPIC_API_KEY`
- `JETSCOPE_NEWSAPI_KEY`

Selected legacy `SAFVSOIL_*` variables may still be accepted by older compatibility code. New deployments should prefer `JETSCOPE_*` names.

## Migrations

```bash
cd apps/api
alembic upgrade head
```

Or from repo root:

```bash
npm run api:migrate
```

## Auth behavior (write routes)

These routes require header `x-admin-token` matching `JETSCOPE_ADMIN_TOKEN`:

- `POST /v1/market/refresh`
- `PUT /v1/pathways`
- `PUT /v1/policies/refuel-eu`
- `POST/PUT/DELETE /v1/workspaces/{workspace_slug}/scenarios*`
- `PUT/DELETE /v1/workspaces/{workspace_slug}/preferences`

## Runtime note

Use the project virtual environment for API commands. The root `npm run api:check` wrapper auto-detects `JETSCOPE_PYTHON_BIN`, `PYTHON_BIN`, `.venv/Scripts/python.exe`, `.venv/bin/python`, or the platform default interpreter.
