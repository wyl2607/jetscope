# Deploy JetScope to USA VPS

**Target host**: `usa-vps` → `racknerd-483e137` (`192.227.130.69`, also on Tailscale)
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
curl -fsS http://127.0.0.1:8000/v1/events/lufthansa-q2-2026-earnings | head
curl -fsS http://127.0.0.1:8000/v1/market/health | head
```

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
| `GET /v1/events/lufthansa-q2-2026-earnings` | Curated LH payload (not 404) |
| `GET /v1/sources/coverage` | Metrics + completeness/degraded |
| `GET /v1/reserves/eu` | No invented IATA claim |
| Dashboard `/dashboard` | Live strip + LH event card when web is served |

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
