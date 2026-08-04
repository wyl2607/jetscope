#!/usr/bin/env bash
# Deploy JetScope code to usa-vps and optionally rebuild the Docker API.
# Requires working SSH: ssh usa-vps "echo OK"
#
# Usage:
#   bash scripts/deploy-usa-vps.sh              # rsync + smoke only
#   bash scripts/deploy-usa-vps.sh --rebuild    # rsync + docker compose build/up + smoke
#   JETSCOPE_REMOTE_DIR=/opt/jetscope bash scripts/deploy-usa-vps.sh --rebuild
set -euo pipefail

HOST="${JETSCOPE_DEPLOY_HOST:-usa-vps}"
# Production on racknerd-483e137 currently lives under /opt/jetscope (docker jetscope-api).
REMOTE_DIR="${JETSCOPE_REMOTE_DIR:-/opt/jetscope}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REBUILD=0

for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
    --help|-h)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

echo "==> Preflight SSH ($HOST)"
if ! ssh -o BatchMode=yes -o ConnectTimeout=12 "$HOST" "echo OK && hostname"; then
  echo "ERROR: cannot SSH to $HOST (publickey?). Fix authorized_keys first."
  echo "See docs/DEPLOY_USA_VPS.md"
  exit 1
fi

echo "==> Rsync $ROOT -> $HOST:$REMOTE_DIR"
RSYNC_OPTS=(
  -avz
  --exclude=.git
  --exclude=node_modules
  --exclude=apps/web/.next
  --exclude=apps/web/dist
  --exclude=apps/api/.venv
  --exclude=.omx
  --exclude=.automation
  --exclude=test-results
  --exclude='*.tar.gz'
  --exclude=.env
  --exclude=data/market.db
  --exclude=data/*.db
  --exclude=data/*.sqlite
)
# Avoid --delete by default so production DB/env and untracked ops files stay put.
rsync "${RSYNC_OPTS[@]}" "$ROOT/" "$HOST:$REMOTE_DIR/"

if [[ "$REBUILD" -eq 1 ]]; then
  echo "==> Rebuild + restart API container on $HOST"
  ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
test -f docker-compose.prod.yml
test -f .env || { echo "ERROR: missing $REMOTE_DIR/.env"; exit 1; }
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.prod.yml up -d --build api
  else
    docker-compose -f docker-compose.prod.yml up -d --build api
  fi
  docker ps --filter name=jetscope-api --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
else
  echo "ERROR: docker not installed on remote"
  exit 1
fi
REMOTE
else
  echo "==> Skip container rebuild (pass --rebuild to rebuild jetscope-api)"
fi

echo "==> Remote smoke"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
echo "cwd=\$(pwd)"
test -f data/curated/lufthansa_q2_2026.json && echo "OK curated LH event present" || echo "MISSING curated LH event"

if curl -fsS --max-time 8 http://127.0.0.1:8000/v1/health >/dev/null 2>&1; then
  echo "API health OK"
  curl -fsS --max-time 8 http://127.0.0.1:8000/v1/market/health | head -c 500 || echo "market/health not yet deployed"
  echo
  curl -fsS --max-time 8 http://127.0.0.1:8000/v1/events/lufthansa-q2-2026-earnings | head -c 300 || echo "events route not yet deployed"
  echo
  curl -fsS --max-time 8 http://127.0.0.1:8000/v1/reserves/eu | head -c 300 || true
  echo
else
  echo "API not healthy on :8000 — start/rebuild with: bash scripts/deploy-usa-vps.sh --rebuild"
  exit 1
fi
REMOTE

echo "==> Deploy finished for $HOST:$REMOTE_DIR (rebuild=$REBUILD)"
