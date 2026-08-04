#!/usr/bin/env bash
# Deploy JetScope code to usa-vps and run remote smoke checks.
# Requires working SSH: ssh usa-vps "echo OK"
set -euo pipefail

HOST="${JETSCOPE_DEPLOY_HOST:-usa-vps}"
REMOTE_DIR="${JETSCOPE_REMOTE_DIR:-~/jetscope}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Preflight SSH"
if ! ssh -o BatchMode=yes -o ConnectTimeout=12 "$HOST" "echo OK"; then
  echo "ERROR: cannot SSH to $HOST (publickey?). Fix authorized_keys first."
  echo "See docs/DEPLOY_USA_VPS.md"
  exit 1
fi

echo "==> Rsync $ROOT -> $HOST:$REMOTE_DIR"
RSYNC_OPTS=(
  -avz --delete
  --exclude=.git
  --exclude=node_modules
  --exclude=apps/web/.next
  --exclude=apps/web/dist
  --exclude=apps/api/.venv
  --exclude=.omx
  --exclude=.automation
  --exclude=test-results
  --exclude='*.tar.gz'
)
rsync "${RSYNC_OPTS[@]}" "$ROOT/" "$HOST:$REMOTE_DIR/"

echo "==> Remote install + smoke (best-effort)"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd ~/jetscope || cd /root/jetscope
echo "cwd=$(pwd)"
if command -v node >/dev/null; then node -v; else echo "WARN: node missing"; fi
if command -v python3 >/dev/null; then python3 -V; else echo "WARN: python3 missing"; fi

# Bring curated data path
test -f data/curated/lufthansa_q2_2026.json && echo "OK curated LH event present" || echo "MISSING curated LH event"

# Optional: start/restart only if docker compose prod exists and docker available
if command -v docker >/dev/null 2>&1 && [[ -f docker-compose.prod.yml ]]; then
  echo "Docker present — not auto-restarting (manual: docker compose -f docker-compose.prod.yml up -d --build)"
fi

# If API already listening, smoke it
if curl -fsS --max-time 5 http://127.0.0.1:8000/v1/health >/dev/null 2>&1; then
  echo "API health OK"
  curl -fsS --max-time 5 http://127.0.0.1:8000/v1/market/health | head -c 400 || true
  echo
  curl -fsS --max-time 5 http://127.0.0.1:8000/v1/events/lufthansa-q2-2026-earnings | head -c 200 || true
  echo
  curl -fsS --max-time 5 http://127.0.0.1:8000/v1/reserves/eu | head -c 300 || true
  echo
else
  echo "API not running on :8000 — sync done. Start with uvicorn or docker compose (see docs/DEPLOY_USA_VPS.md)"
fi
REMOTE

echo "==> Deploy sync finished for $HOST"
