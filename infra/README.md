# Infra Notes

This directory contains local infrastructure examples for JetScope. It is intended for workstation or reviewer use, not for production deployment instructions.

## What It Is For

- local Docker support for services defined in `infra/docker-compose.yml`
- nginx and app config examples used by local infrastructure experiments
- developer understanding of how the app is wired together off the host machine

## What It Is Not For

- production deployment guidance
- remote server access
- SSH, rsync, or publish workflows
- secrets management

## Local Docker Path

Before any local `up` workflow, run the quick smoke validator:

```bash
./scripts/docker-quickstart-smoke.sh
```

The script only runs compose config rendering with placeholder local env values. It does not deploy, publish, push, SSH, or rsync.

The repository root already exposes convenience scripts:

- `npm run docker:up`
- `npm run docker:down`

The compose stack in `infra/docker-compose.yml` currently includes:

- PostgreSQL
- the FastAPI API container
- the web container
- nginx

> The PostgreSQL service here is **local/reviewer-only and is not the production
> database**. Production is frozen on SQLite (`docker-compose.prod.yml`); see
> `../OPERATIONS.md` → Data Store & Backup.

For a quick reviewer demo, Docker is optional. The normal quickstart path is to run the API and web locally with the defaults in `.env.example`.

## Notes For Reviewers

- Keep `POSTGRES_PASSWORD` and `JETSCOPE_ADMIN_TOKEN` local-only if you use the compose stack.
- The compose file uses local service names and bridge networking only.
- If you are evaluating the product, prefer the local SQLite quickstart first and only use Docker when you need to inspect infrastructure wiring.
