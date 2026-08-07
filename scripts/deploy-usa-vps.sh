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

if ! DEPLOY_COMMIT="$(git -C "$ROOT" rev-parse --verify "HEAD^{commit}")"; then
  echo "ERROR: deploy source is not a Git checkout" >&2
  exit 1
fi
if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "ERROR: deploy source tree is dirty; commit or discard changes before deploying" >&2
  exit 1
fi

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

echo "==> Record deployment provenance ($DEPLOY_COMMIT)"
ssh "$HOST" bash -s -- "$REMOTE_DIR" "$DEPLOY_COMMIT" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
DEPLOY_COMMIT="$2"
printf '%s\n' "$DEPLOY_COMMIT" > "$REMOTE_DIR/.deploy-commit"
chmod 0644 "$REMOTE_DIR/.deploy-commit"
REMOTE

if [[ "$REBUILD" -eq 1 ]]; then
  echo "==> Rebuild + restart api / web / nginx containers on $HOST"
  ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
test -f docker-compose.prod.yml
test -f .env || { echo "ERROR: missing $REMOTE_DIR/.env"; exit 1; }
test -f infra/nginx.prod.conf || { echo "ERROR: missing $REMOTE_DIR/infra/nginx.prod.conf"; exit 1; }
# The nginx service bind-mounts this directory read-only. Docker would create it
# root-owned if absent, which works but leaves a directory nobody put there.
mkdir -p infra/tls
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.prod.yml up -d --build api web nginx
  else
    docker-compose -f docker-compose.prod.yml down || true
    for svc in api web nginx; do
      while IFS= read -r container_id; do
        [ -n "\$container_id" ] || continue
        docker rm -f "\$container_id" || true
      done < <(docker ps -aq --filter label=com.docker.compose.service=\$svc)
    done
    # A stale container that outlives its service label still holds the name and
    # keeps serving the previous build.
    docker rm -f jetscope-api jetscope-web jetscope-nginx || true
    docker-compose -f docker-compose.prod.yml up -d --build api web nginx
  fi
  docker ps --filter name=jetscope- --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
else
  echo "ERROR: docker not installed on remote"
  exit 1
fi
REMOTE
else
  echo "==> Skip container rebuild (pass --rebuild to rebuild api/web/nginx)"
fi

echo "==> Remote smoke"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
echo "cwd=\$(pwd)"
echo "deployed_commit=\$(cat .deploy-commit 2>/dev/null || echo unknown)"
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

# --- Web -------------------------------------------------------------------
# A status code proves nothing here. Every page is force-dynamic and fetches on
# the server; if the web container starts without JETSCOPE_API_BASE_URL, every
# server-side fetch fails, every read model returns its fallback, and the site
# serves a cheerful 200 full of invented constants.
#
# /sources renders \`asOf={readModel.isFallback ? null : readModel.generatedAt}\`,
# and PageHeader emits data-testid="page-as-of" only when that is non-null. So
# the presence of that stamp is proof the server-side fetch reached the API.
# This is the check that actually matters.
if curl -fsS --max-time 20 http://127.0.0.1:3000/ >/dev/null 2>&1; then
  echo "WEB responding on :3000"
else
  echo "WEB not responding on :3000 — check: docker logs jetscope-web"
  exit 1
fi

for probe in "http://127.0.0.1:3000/sources|direct" "http://127.0.0.1/sources|via nginx"; do
  url="\${probe%%|*}"
  label="\${probe##*|}"
  body="\$(curl -fsS --max-time 25 "\$url" 2>/dev/null || true)"
  if [ -z "\$body" ]; then
    echo "FAIL /sources \$label — no response"
    exit 1
  fi
  if printf '%s' "\$body" | grep -q 'data-testid="page-as-of"'; then
    echo "OK /sources \$label — renders a real as-of stamp, server-side API reachable"
  else
    echo "FAIL /sources \$label — served HTML but no as-of stamp."
    echo "     The page is on its fallback: the web container reached no API."
    echo "     Check JETSCOPE_API_BASE_URL in docker-compose.prod.yml (must be http://api:8000)."
    exit 1
  fi
done

# nginx must not let the catch-all swallow the API prefix.
if curl -fsS --max-time 10 http://127.0.0.1/v1/health >/dev/null 2>&1; then
  echo "OK /v1/health via nginx"
else
  echo "FAIL /v1/health via nginx — check the location order in infra/nginx.prod.conf"
  exit 1
fi
REMOTE

echo "==> Deploy finished for $HOST:$REMOTE_DIR (rebuild=$REBUILD)"
