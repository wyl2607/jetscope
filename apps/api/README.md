# SAFvsOil API

FastAPI backend for SAFvsOil product surfaces (`/v1/*`), including:

- market snapshot persistence and refresh status tracking
- workspace preferences and scenario CRUD
- pathway and policy admin upsert routes
- health capability reporting for phase migration visibility

## Local setup

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run API

```bash
uvicorn app.main:app --reload
```

Defaults:

- API prefix: `/v1`
- DB: `postgresql+psycopg://postgres:postgres@localhost:5432/safvsoil`
- admin token: `dev-admin-token-change-me`
- schema bootstrap mode: `alembic`

## Key environment variables

- `SAFVSOIL_DATABASE_URL`
- `SAFVSOIL_API_PREFIX`
- `SAFVSOIL_ADMIN_TOKEN`
- `SAFVSOIL_MARKET_REFRESH_INTERVAL_SECONDS`
- `SAFVSOIL_ENABLE_SQLITE_ROUTES` (`false` by default; opt-in for local SQLite integration routes)
- `SAFVSOIL_SCHEMA_BOOTSTRAP_MODE` (`alembic` or `create_all`)
- `SAFVSOIL_PHASE0_DEPRECATION_GATE`

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

These routes require header `x-admin-token` matching `SAFVSOIL_ADMIN_TOKEN`:

- `POST /v1/market/refresh`
- `PUT /v1/pathways`
- `PUT /v1/policies/refuel-eu`
- `POST/PUT/DELETE /v1/workspaces/{workspace_slug}/scenarios*`
- `PUT/DELETE /v1/workspaces/{workspace_slug}/preferences`

## Runtime note

On this machine, use the project venv (`apps/api/.venv/bin/python`) for API commands.
System Python 3.14 may not include required packages for this stack.
