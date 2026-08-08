#!/usr/bin/env bash
# Deploy JetScope code to usa-vps and optionally rebuild the running services.
# Requires working SSH: ssh usa-vps "echo OK"
#
# Production topology (verified 2026-08-07, see docs/DEPLOY_USA_VPS.md):
#   compose  jetscope-api        127.0.0.1:8000
#   systemd  jetscope-web.service 127.0.0.1:3000   <- the frontend, NOT a container
#   host     nginx                :80 / :443       <- serves saf.meichen.beauty
#
# The web container and compose nginx exist in docker-compose.prod.yml but are
# NOT started by this script. They would collide with the systemd unit on :3000
# and with host nginx on :80/:443. Cutting over is a separate, deliberate
# operation - see docs/DEPLOY_WEB_VPS.md.
#
# Usage:
#   bash scripts/deploy-usa-vps.sh              # rsync + smoke only
#   bash scripts/deploy-usa-vps.sh --rebuild    # rsync + rebuild api container + rebuild/restart systemd web + smoke
#   bash scripts/deploy-usa-vps.sh --rebuild --api-only   # skip the web rebuild
#   bash scripts/deploy-usa-vps.sh --rebuild --allow-unmerged  # source not on origin/main
#   JETSCOPE_REMOTE_DIR=/opt/jetscope bash scripts/deploy-usa-vps.sh --rebuild
#
# The deploy source must be a clean tree AND a commit that is on origin/main.
# Pipe the output at your peril: `deploy.sh | tail` reports tail's exit code,
# which is how a smoke failure reads as a successful deploy.
set -euo pipefail

HOST="${JETSCOPE_DEPLOY_HOST:-usa-vps}"
# Production on racknerd-483e137 currently lives under /opt/jetscope (docker jetscope-api).
REMOTE_DIR="${JETSCOPE_REMOTE_DIR:-/opt/jetscope}"
# The public vhost host nginx serves. The smoke check sends it as a Host header,
# because a naked-IP request lands on nginx's default server and proves nothing
# about the entrypoint readers actually use.
PUBLIC_HOST="${JETSCOPE_PUBLIC_HOST:-saf.meichen.beauty}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REBUILD=0
API_ONLY=0
ALLOW_UNMERGED=0

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
    --api-only) API_ONLY=1 ;;
    --allow-unmerged) ALLOW_UNMERGED=1 ;;
    --help|-h)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# What gets deployed is the working tree, so "which commit" is decided by
# whatever happens to be checked out. A clean tree is not the same as a
# reviewed one: a local branch, an unpushed commit, or a half-finished
# experiment all pass the check above and all rsync straight to production.
#
# --is-ancestor rather than an equality test, so rolling back to an older
# merged commit still works; the thing being refused is source that is not on
# origin/main at all.
if [[ "$ALLOW_UNMERGED" -eq 0 ]]; then
  git -C "$ROOT" fetch origin main --quiet 2>/dev/null || true
  if ! git -C "$ROOT" merge-base --is-ancestor "$DEPLOY_COMMIT" origin/main 2>/dev/null; then
    echo "ERROR: $DEPLOY_COMMIT is not on origin/main." >&2
    echo "       Production deploys only commits that were merged and passed CI." >&2
    echo "       Check out a merged commit, or pass --allow-unmerged deliberately." >&2
    exit 1
  fi
fi

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
  echo "==> Rebuild + restart the API container on $HOST"
  # Only `api`. The `web` and `nginx` services in docker-compose.prod.yml are
  # prepared for a future cutover and would collide with the systemd unit on
  # :3000 and host nginx on :80/:443 if started here. Naming them explicitly is
  # what keeps a bare `up -d --build` from taking the site down.
  ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
test -f docker-compose.prod.yml
test -f .env || { echo "ERROR: missing $REMOTE_DIR/.env"; exit 1; }
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.prod.yml up -d --build api
  else
    docker-compose -f docker-compose.prod.yml down || true
    while IFS= read -r container_id; do
      [ -n "\$container_id" ] || continue
      docker rm -f "\$container_id" || true
    done < <(docker ps -aq --filter label=com.docker.compose.service=api)
    docker rm -f jetscope-api || true
    docker-compose -f docker-compose.prod.yml up -d --build api
  fi
  docker ps --filter name=jetscope-api --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
else
  echo "ERROR: docker not installed on remote"
  exit 1
fi
REMOTE

  if [[ "$API_ONLY" -eq 1 ]]; then
    echo "==> Skip web rebuild (--api-only); systemd keeps serving the previous build"
  else
    echo "==> Rebuild the Next.js app and restart jetscope-web.service on $HOST"
    # The frontend is systemd-owned, not containerised, so new source on disk
    # changes nothing until it is rebuilt and the unit restarted. Skipping this
    # is how the public site sat on a pre-page-template build while main moved
    # seventeen commits ahead of it.
    ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
test -f apps/web/package.json || { echo "ERROR: missing $REMOTE_DIR/apps/web"; exit 1; }
systemctl list-unit-files jetscope-web.service >/dev/null 2>&1 || {
  echo "ERROR: jetscope-web.service is not installed on this host."
  echo "       Install it per docs/DEPLOY_USA_VPS.md, or pass --api-only."
  exit 1
}

# NOT --omit=dev. tailwindcss, @tailwindcss/postcss, postcss and typescript are
# all devDependencies and \`next build\` needs every one of them. --omit=dev
# installs cleanly and exits 0, so a \`|| npm ci\` fallback never fires and the
# failure lands on the build instead, where it reads like a source problem.
#
# npm ci, not npm install: the lockfile is the deployed contract, and a host
# that silently resolves a different tree is a host serving something nobody
# reviewed.
#
# But npm ci removes node_modules before reinstalling, and the LIVE server needs
# it - \`next start\` loads route chunks on demand. So it runs only when the
# lockfile actually changed since the last deploy, which keeps the usual
# source-only deploy from taking the site down for the length of an install.
LOCK_HASH="\$(sha256sum package-lock.json | cut -d' ' -f1)"
PREV_LOCK_HASH="\$(cat .deploy-lock-hash 2>/dev/null || echo none)"
if [ ! -d node_modules ] || [ "\$LOCK_HASH" != "\$PREV_LOCK_HASH" ]; then
  echo "--> dependencies changed (or absent); running npm ci"
  echo "    the site is degraded until the rebuild finishes"
  npm ci
  printf '%s\n' "\$LOCK_HASH" > .deploy-lock-hash
else
  echo "--> lockfile unchanged since last deploy; skipping npm ci"
fi

# The build is the memory-hungry step on a 1.9 GiB host. Cap it the same way the
# unit caps the server, so an OOM kills the build with a clear error. Note the
# ordering: the restart below only happens if this succeeds, so a failed build
# leaves the previous version running.
NODE_OPTIONS=--max-old-space-size=768 npm run web:build

systemctl restart jetscope-web.service
sleep 3
systemctl is-active --quiet jetscope-web.service && echo "jetscope-web.service active" || {
  echo "ERROR: jetscope-web.service did not come back up"
  journalctl -u jetscope-web.service -n 40 --no-pager || tail -n 40 /var/log/jetscope-web.log || true
  exit 1
}
REMOTE
  fi
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
# the server; if the web process runs without a reachable JETSCOPE_API_BASE_URL,
# every server-side fetch fails, every read model returns its fallback, and the
# site serves a cheerful 200 full of invented constants.
#
# /sources renders \`asOf={readModel.isFallback ? null : readModel.generatedAt}\`,
# and PageHeader emits data-testid="page-as-of" only when that is non-null. So
# the presence of that stamp is proof the server-side fetch reached the API.
# This is the check that actually matters.
#
# The second probe carries the public Host header on purpose: host nginx serves
# a named vhost and answers naked-IP requests from its default server, so an
# unadorned http://127.0.0.1/ proves nothing about the public entrypoint.
if curl -fsS --max-time 20 http://127.0.0.1:3000/ >/dev/null 2>&1; then
  echo "WEB responding on :3000"
else
  echo "WEB not responding on :3000 — check: systemctl status jetscope-web.service"
  exit 1
fi

for probe in "http://127.0.0.1:3000/sources||direct :3000" "|$PUBLIC_HOST|via nginx as $PUBLIC_HOST"; do
  url="\$(printf '%s' "\$probe" | cut -d'|' -f1)"
  host_header="\$(printf '%s' "\$probe" | cut -d'|' -f2)"
  label="\$(printf '%s' "\$probe" | cut -d'|' -f3)"
  if [ -n "\$host_header" ]; then
    # Probe the vhost over TLS, with the name pinned to this host.
    #
    # The previous form asked for http://127.0.0.1/ with a Host header. The
    # public vhost answers :80 with a 301 to https, so the probe read the
    # 178-byte nginx redirect page, found no as-of stamp, and reported a live,
    # correct site as broken. A check that cries wolf is worse than no check.
    #
    # Following the redirect with -L is not the fix either: the Location points
    # at the public name, which is Cloudflare-proxied, so the probe would leave
    # the box and come back through the CDN - testing DNS and Cloudflare rather
    # than the nginx this deploy just touched. --resolve keeps it local; -k
    # because pinning the name to 127.0.0.1 is exactly what a cert cannot cover.
    body="\$(curl -fsS -k --max-time 25 --resolve "\$host_header:443:127.0.0.1" \
      "https://\$host_header/sources" 2>/dev/null || true)"
  else
    body="\$(curl -fsS --max-time 25 "\$url" 2>/dev/null || true)"
  fi
  if [ -z "\$body" ]; then
    echo "FAIL /sources \$label — no response"
    exit 1
  fi
  if printf '%s' "\$body" | grep -q 'data-testid="page-as-of"'; then
    echo "OK /sources \$label — renders a real as-of stamp, server-side API reachable"
  else
    echo "FAIL /sources \$label — served HTML but no as-of stamp."
    echo "     Either the page is on its fallback (the web process reached no API:"
    echo "     check JETSCOPE_API_BASE_URL in jetscope-web.service), or the build"
    echo "     being served predates the page template and the deploy did not"
    echo "     actually rebuild it."
    exit 1
  fi
done

# nginx must not let its catch-all swallow the API prefix.
if curl -fsS --max-time 10 -H "Host: $PUBLIC_HOST" http://127.0.0.1/v1/health >/dev/null 2>&1; then
  echo "OK /v1/health via nginx as $PUBLIC_HOST"
else
  echo "FAIL /v1/health via nginx — check the /v1 location order in the active nginx config"
  exit 1
fi
REMOTE

echo "==> Deploy finished for $HOST:$REMOTE_DIR (rebuild=$REBUILD)"
