# Deploy JetScope to USA VPS

**Target host**: `usa-vps` → `racknerd-483e137` (`192.227.130.69`, also on Tailscale)
**Production path**: `/opt/jetscope`
**Running service (observed 2026-08)**: Docker container `jetscope-api` on `127.0.0.1:8000`
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
| Merge to `main` | Open — merge before long-lived prod pin |
| SSH from this machine | Working (`ssh usa-vps`) |
| Full public web frontend container | API-only compose today; web may need separate nginx/static path |

**Verdict**: **Enough for a USA VPS demo deploy of the V1 API + dashboard stack after merge (or direct branch deploy).**
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

- Compose file currently ships **API only** (`jetscope-api`). Public nginx today may still point other apps (e.g. ESG on `:8001`). Wire JetScope web explicitly before promising a public URL.
- Do **not** rsync `--delete` against `/opt/jetscope` unless you intend to wipe ops files.
- Market snapshot can be slow if upstream feeds hang; health endpoint is the operational signal.
- Prefer: **merge PR #246 → deploy that commit** so prod matches `main`.

## Rollback

```bash
ssh usa-vps
cd /opt/jetscope
git status   # if deployed via git
# or re-rsync previous known-good tree, then:
docker compose -f docker-compose.prod.yml up -d --build api
```
