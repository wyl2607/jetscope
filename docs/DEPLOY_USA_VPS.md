# Deploy JetScope to USA VPS

**Target host**: SSH alias `usa-vps` → `<usa-vps-hostname>` (`<usa-vps-public-ip>`; Tailscale optional). Do not put the public address in this repo.
**Production path**: `/opt/jetscope`
**Running services (verified 2026-08-05)**: Docker Compose `jetscope-api` on `127.0.0.1:8000`; systemd-owned Next.js on `127.0.0.1:3000`; nginx serves `saf.meichen.beauty`
**Legacy path**: `~/jetscope` (older rsync snapshot; prefer `/opt/jetscope`)

## V1 demo readiness checklist

| Gate | Status (PR #246) |
|------|------------------|
| CI green (web + API + OpenAPI + E2E smoke) | Yes |
| Live market strip + trust center UI | Yes |
| Curated LH Q2 2026 event API | Yes |
| `/v1/market/health` | Yes |
| Honest reserve / source labels | Yes |
| Deploy script + this doc | Yes |
| Merge to `main` | Yes — production is pinned to the merged commit |
| SSH from this machine | Working (`ssh usa-vps`) |
| Full public web frontend | Yes — Next.js is systemd-owned and nginx proxies the public domain |

**Verdict**: **Demo stability verified on the USA VPS after commit-pinned deploy, bounded-load testing, and a reboot drill.**
Not a claim of “finished commercial product” — seed/fallback honesty and live feed quality still matter.

## Preconditions

1. SSH works:
   ```bash
   ssh usa-vps "hostname && curl -fsS http://127.0.0.1:8000/v1/health"
   ```
2. Remote `/opt/jetscope/.env` already has `JETSCOPE_ADMIN_TOKEN` (script **never** overwrites `.env` or `data/*.db`).
3. Local package verified (or GitHub CI green on the commit you deploy).

## Recommended deploy

From a machine with `rsync` + `ssh` (Git Bash / WSL / Mac / Linux):

```bash
# 1) Sync code only (safe; keeps .env and DB)
bash scripts/deploy-usa-vps.sh

# 2) Rebuild API container so new routes (events, market/health) load
bash scripts/deploy-usa-vps.sh --rebuild
```

Override path if needed:

```bash
JETSCOPE_REMOTE_DIR=/opt/jetscope bash scripts/deploy-usa-vps.sh --rebuild
```

### Manual equivalent on the VPS

```bash
ssh usa-vps
cd /opt/jetscope
# after rsync
docker compose -f docker-compose.prod.yml up -d --build api
# or: docker-compose -f docker-compose.prod.yml up -d --build api
curl -fsS http://127.0.0.1:8000/v1/health
curl -fsS http://127.0.0.1:8000/v1/events | head
curl -fsS http://127.0.0.1:8000/v1/events/lufthansa-q2-2026-earnings | head
curl -fsS http://127.0.0.1:8000/v1/market/health | head
```

## Curated events in the API image

`apps/api/app/services/curated_events.py` picks the first directory that exists, in this order:

1. `JETSCOPE_CURATED_DIR`
2. `/app/data/curated`
3. a monorepo checkout path, which is not present inside the image

The API image is built from the repository root (`docker build -f apps/api/Dockerfile .`). That build copies `data/curated/*.json` to `/app/curated` and to `/app/data/curated`. Compose sets `JETSCOPE_CURATED_DIR=/app/curated`. The SQLite bind mount replaces `/app/data`, so the process must not depend on `/app/data/curated` at runtime. `/app/curated` stays in the image, and `GET /v1/events` can return the Lufthansa case (`count` ≥ 1) with the volume mounted.

`.dockerignore` still keeps database files out of the build context. It re-includes only `data/curated`.

## SQLite host volume

`docker-compose.prod.yml` bind-mounts a host directory over the API data directory:

```yaml
${JETSCOPE_HOST_DATA_DIR:-/opt/jetscope/data}:/app/data
```

`WORKDIR` is `/app` and `JETSCOPE_DATABASE_URL` is `sqlite:///./data/market.db`, so the database file is `/app/data/market.db` in the container and `$JETSCOPE_HOST_DATA_DIR/market.db` on the host. The deploy script exports `JETSCOPE_HOST_DATA_DIR` to `$JETSCOPE_REMOTE_DIR/data` (default `/opt/jetscope/data`).

### First switch off a container-local database

Older containers may have `market.db` only in the container writable layer. Starting a new container with an empty host directory would hide that file. `scripts/deploy-usa-vps.sh --rebuild` does the copy itself, before it replaces the container:

1. Build the API image while the current `jetscope-api` container is still running.
2. If the host `market.db` already exists and is non-empty, skip the copy. A later run does not overwrite it.
3. If the host file is missing or empty, and `jetscope-api` has a non-empty `/app/data/market.db`, run `PRAGMA wal_checkpoint(FULL)`, stop that container, then `docker cp` `market.db` plus non-empty `market.db-wal` and `market.db-shm` into the host directory.
4. If there is no container, or it has no database file, skip the copy. The new container creates a database on the host volume.
5. Start the API service with `docker compose -f docker-compose.prod.yml up -d api` so the mount is in effect.

Preview the same steps without SSH, rsync, or docker:

```bash
bash scripts/deploy-usa-vps.sh --dry-run
bash scripts/deploy-usa-vps.sh --rebuild --dry-run
```

Manual equivalent, and only when `/opt/jetscope/data/market.db` is missing or empty and the old container still exists. Do not copy over a non-empty host file.

```bash
mkdir -p /opt/jetscope/data
docker exec jetscope-api python -c 'import sqlite3; c=sqlite3.connect("/app/data/market.db"); c.execute("PRAGMA wal_checkpoint(FULL)"); c.close()'
docker stop jetscope-api
docker cp jetscope-api:/app/data/market.db /opt/jetscope/data/market.db
docker cp jetscope-api:/app/data/market.db-wal /opt/jetscope/data/market.db-wal || true
docker cp jetscope-api:/app/data/market.db-shm /opt/jetscope/data/market.db-shm || true
JETSCOPE_HOST_DATA_DIR=/opt/jetscope/data docker compose -f /opt/jetscope/docker-compose.prod.yml up -d api
```

`infra/server/docker-compose.prod.yml` and `infra/docker-compose.yml` still build with context `apps/api`. This Dockerfile now expects the repository root. Production deploys use the root `docker-compose.prod.yml` only.

## Runtime ownership and reboot recovery

The 1.9 GiB VPS keeps the API and web processes under separate supervisors:

- API: Docker Compose owns `jetscope-api`; `restart: unless-stopped`, `mem_limit: 512m`, `mem_reservation: 256m`, and `cpus: "1.0"` are defined in `docker-compose.prod.yml`.
- Web: systemd owns Next.js through `infra/server/jetscope-web.service`; the unit waits for Docker/network readiness, restarts on failure, and caps Node/systemd memory at 512 MiB.
- Provenance: `/opt/jetscope/.deploy-commit` and Git `HEAD` are checked against `origin/main` after commit-pinned deployment.
- Do not add a second PM2 supervisor for the same Next.js process.

After syncing a reviewed tree to `/opt/jetscope`, install and enable the web unit once:

```bash
sudo install -m 0644 /opt/jetscope/infra/server/jetscope-web.service /etc/systemd/system/jetscope-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now jetscope-web.service
sudo systemctl is-enabled jetscope-web.service
sudo systemctl is-enabled docker
docker compose -f /opt/jetscope/docker-compose.prod.yml ps
```

Install and enable the daily SQLite backup timer once:

```bash
sudo install -m 0644 /opt/jetscope/infra/server/jetscope-sqlite-backup.service /etc/systemd/system/jetscope-sqlite-backup.service
sudo install -m 0644 /opt/jetscope/infra/server/jetscope-sqlite-backup.timer /etc/systemd/system/jetscope-sqlite-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now jetscope-sqlite-backup.timer
sudo systemctl start jetscope-sqlite-backup.service
sudo systemctl status jetscope-sqlite-backup.timer --no-pager
```

The timer keeps local online-consistent backups under `/opt/jetscope/data/backups`.
Copy a verified backup to off-host storage for disaster recovery; local retention alone
does not protect against VPS or volume loss.

Rollback is limited to the supervisor layer: restore the previous unit file, run
`systemctl daemon-reload`, and restart `jetscope-web.service`; restore the
previous known-good Compose tree and run `docker compose ... up -d api`. The
deploy script still excludes `.env` and `data/*.db` and does not use `rsync --delete`.

## Post-deploy smoke

| Check | Expect |
|-------|--------|
| `GET /v1/health` | `ok: true` |
| `GET /v1/market/health` | JSON with refresh interval / healthy flag |
| `GET /v1/events` | JSON `count` ≥ 1 (Lufthansa case is in the image) |
| `GET /v1/events/lufthansa-q2-2026-earnings` | Curated LH payload (not 404) |
| `GET /v1/market/snapshot` | No seed constants `0.64` or `80.38`. A missing metric may be `null` in `values`. |
| `GET /v1/sources/coverage` | Metrics + completeness/degraded |
| `GET /v1/reserves/eu` | No invented IATA claim |
| Dashboard `/dashboard` | Live strip + LH event card when web is served |

## Admin UI edge gate (host nginx)

The public admin pages (`/admin`, `/de/admin`, `/en/admin`) show operational
detail and write controls. Mutating API calls already require `x-admin-token`.
Edge Basic Auth is the first gate for the HTML. `infra/server/nginx.conf` puts
it on the existing admin location:

```nginx
location ~ ^/(?:en/|de/)?admin(?:/|$) {
    auth_basic "JetScope admin";
    auth_basic_user_file /etc/nginx/secrets/jetscope-admin.htpasswd;
}
```

That regex covers `/admin`, `/de/admin`, and `/en/admin`, including subpaths,
and does not match `/administrator`. Do not replace it with a bare
`location /admin` prefix: that prefix also matches `/administrator`. The
container edge in `infra/nginx.prod.conf` uses the same location with
`auth_basic_user_file /etc/nginx/secrets/admin.htpasswd`, so a later cutover
does not drop the gate. This host also serves unrelated products; only touch
the `saf.meichen.beauty` vhost.

Create the credential file on the VPS before reloading nginx. nginx refuses
to start or reload if `auth_basic_user_file` is missing. Never commit the
file, the password, or the hash.

```bash
ssh usa-vps
sudo mkdir -p /etc/nginx/secrets
sudo chmod 750 /etc/nginx/secrets
# First user: -c creates the file. Additional users: omit -c.
sudo htpasswd -c /etc/nginx/secrets/jetscope-admin.htpasswd <username>
sudo chmod 640 /etc/nginx/secrets/jetscope-admin.htpasswd
sudo chown root:www-data /etc/nginx/secrets/jetscope-admin.htpasswd
sudo nginx -t && sudo systemctl reload nginx
```

If the live vhost is still a hand-edited copy under `/etc/nginx/sites-enabled/`
rather than this file, add those two `auth_basic` lines to its existing
`location ~ ^/(?:en/|de/)?admin(?:/|$)` block. Do not add a second set of
`location = /admin` blocks beside that regex.

`X-Robots-Tag: noindex, nofollow` is set on the same nginx location and again
in `apps/web/next.config.mjs`, so the tag still holds if a request reaches
Next without this edge. Installing the htpasswd file and reloading host nginx
is a human production step; this change does not do it.

## Notes / risks

- Compose owns the API; systemd owns Next.js; nginx proxies the public Host `saf.meichen.beauty`. A naked IP request is expected to hit the default nginx server and return 404.
- The VPS currently uses Docker Compose 1.29.2. The deploy helpers remove only stale containers carrying the API service label before a rebuild; they do not use `rsync --delete`.
- Market snapshot/history reads are bounded; still use the liveness endpoint as the watchdog signal and the external public smoke workflow for ingress/latency detection.
- Keep off-host copies of verified SQLite backups; local timer retention does not protect against VPS or volume loss.
- Deploy only a reviewed commit from `main` and verify the `.deploy-commit` marker after rollout.

## Rollback

```bash
ssh usa-vps
cd /opt/jetscope
git status   # if deployed via git
# or re-rsync previous known-good tree, then:
docker compose -f docker-compose.prod.yml up -d --build api
```
