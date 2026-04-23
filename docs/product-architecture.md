# SAFvsOil Product Architecture

## Product stack

- **Frontend:** Next.js + TypeScript + Tailwind
- **Backend:** FastAPI
- **Database:** PostgreSQL
- **Scheduler:** cron / scheduled jobs
- **Admin:** built into the product, not optional

## Repo shape

```text
apps/
  web/        # Next.js product frontend
  api/        # FastAPI product backend
infra/
  docker-compose.yml
docs/
  product-architecture.md
```

## First product APIs

- `GET /v1/health`
- `GET /v1/market/snapshot`
- `POST /v1/market/refresh`
- `GET /v1/workspaces/{workspace_slug}/preferences`
- `PUT /v1/workspaces/{workspace_slug}/preferences`
- `DELETE /v1/workspaces/{workspace_slug}/preferences`
- `GET /v1/workspaces/{workspace_slug}/scenarios`
- `POST /v1/workspaces/{workspace_slug}/scenarios`
- `PUT /v1/workspaces/{workspace_slug}/scenarios/{scenario_id}`
- `DELETE /v1/workspaces/{workspace_slug}/scenarios/{scenario_id}`

## First DB tables

- `workspaces`
- `workspace_preferences`
- `scenarios`
- `market_snapshots`
- `route_catalog`
- `refuel_eu_targets`

## Migration rule

Current Node prototype remains Phase 0 reference.

1. Freeze current prototype payloads and behaviors.
2. Port backend semantics into FastAPI.
3. Seed PostgreSQL from current JS baselines and targets.
4. Port UI to Next.js incrementally.
5. Retire the Node prototype only after parity is demonstrated.
