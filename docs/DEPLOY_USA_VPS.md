# Deploy JetScope to USA VPS

**Target**: `usa-vps` → `root@192.227.130.69`
**Goal path**: `~/jetscope` (or `/opt/jetscope` if you standardize later)

## Preconditions

1. SSH works from your machine:
   ```bash
   ssh usa-vps "echo OK && hostname"
   ```
2. This Windows host currently offers `~/.ssh/id_rsa` only; **server must authorize that public key** (or you use another IdentityFile).
3. Development package is verified locally:
   - API: `pytest apps/api/tests/test_realtime_aviation_updates.py apps/api/tests/test_analysis_routes.py`
   - Node: `node --test test/resolve-live-jet.test.mjs` and `npm test`

## What was completed before deploy (dev package)

| Area | Status |
|------|--------|
| Curated LH Q2 2026 facts | `data/curated/lufthansa_q2_2026.json` + `/v1/events/*` |
| Jet–Brent derived arithmetic | snapshot.`derived` |
| Reserve source honesty | no fake IATA claim; gap default null |
| Dashboard event bar + residual | `/dashboard` |
| LH playbook one-click | `/crisis/saf-tipping-point?lh=1` + button |
| Live jet for analysis | Rotterdam → EU proxy → US jet |

## Deploy steps (manual / script)

### A. Sync code

From a machine that **can** SSH (often coco / yumei Mac):

```bash
# Option 1: rsync single node
rsync -avz --delete \
  --exclude=.git --exclude=node_modules --exclude=apps/web/.next \
  --exclude=apps/api/.venv --exclude=.omx --exclude=.automation \
  ./ usa-vps:~/jetscope/

# Option 2: existing multi-node script (from coco path)
# bash scripts/sync-to-nodes.sh
```

### B. On the VPS

```bash
ssh usa-vps
cd ~/jetscope

# Node
node -v   # need >= 22
npm install
cd apps/web && npm install && cd ../..

# Python
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..

# Env
cp .env.example .env   # set JETSCOPE_ADMIN_TOKEN, API URLs if needed
# Ensure data/curated is present (rsync should bring it)

# Migrate / seed
npm run api:migrate || true

# Docker prod path (if preferred)
# docker compose -f docker-compose.prod.yml up -d --build
```

### C. Process model (minimal)

```bash
# API
cd ~/jetscope/apps/api && source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000

# Web (another session / pm2)
cd ~/jetscope && npm run web:build && npm run web:start
# default Next port 3000
```

Recommend **nginx** reverse proxy: `:80` → web `:3000`, `/v1` → api `:8000`.

### D. Smoke checks (V1)

```bash
curl -sS http://127.0.0.1:8000/v1/health
curl -sS http://127.0.0.1:8000/v1/market/health
curl -sS http://127.0.0.1:8000/v1/events/lufthansa-q2-2026-earnings | head
curl -sS http://127.0.0.1:8000/v1/market/snapshot | head
curl -sS http://127.0.0.1:8000/v1/reserves/eu | head
curl -sS http://127.0.0.1:8000/v1/sources/coverage | head
# browser (Tailscale or public):
#   http://<vps-ip>/           → product map
#   http://<vps-ip>/dashboard  → Live strip + LH event
#   http://<vps-ip>/sources    → Trust center
```

Expect:

- `/v1/market/health` returns `refresh_interval_seconds`, `recent_runs`, `healthy`
- events payload `as_of: 2026-08-04`
- reserves `estimated_supply_gap_pct: null` (unless env set)
- snapshot includes `derived.jet_vs_brent_*`
- dashboard Live strip + LH event bar
- sources matrix columns: As of, Fallback, Status

## Blocker on this Windows agent (2026-08-04 session)

```
ssh root@192.227.130.69
→ Permission denied (publickey)
```

**Action needed from you**: add this machine’s public key to VPS `authorized_keys`, or run deploy from coco/mac-mini that already has access.

```powershell
# Show public key to install on VPS
Get-Content $env:USERPROFILE\.ssh\id_rsa.pub
```

On VPS (from a working session):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'PASTE_PUBKEY_HERE' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Then re-run:

```bash
ssh usa-vps "echo OK"
# or
bash scripts/deploy-usa-vps.sh
```

## Security notes

- Do not commit `.env` or admin tokens.
- Bind API to `127.0.0.1` if nginx fronts it.
- Prefer HTTPS (Let’s Encrypt) before public demo.
