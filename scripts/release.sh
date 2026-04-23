#!/bin/bash

set -euo pipefail

ROOT="/Users/yumei/projects/jetscope"
VPS_HOST="${JETSCOPE_VPS_HOST:-usa-vps}"
VPS_DEPLOY_DIR="${JETSCOPE_VPS_DEPLOY_DIR:-/opt/jetscope}"
EXPECTED_COMMIT=""

RUN_PREFLIGHT=1
RUN_SYNC=1
RUN_PUBLISH=1
RUN_VPS_DEPLOY=1

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh [options]

Default flow:
  1. npm run preflight
  2. ./scripts/sync-to-nodes.sh
  3. ./scripts/publish-to-github.sh
  4. ssh usa-vps "cd /opt/jetscope && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT=<HEAD> ./scripts/auto-deploy.sh"

Options:
  --skip-preflight   Skip local preflight
  --skip-sync        Skip sync-to-nodes
  --skip-publish     Skip publish-to-github
  --skip-vps-deploy  Skip remote VPS deploy trigger
  --help             Show this help

Environment overrides:
  JETSCOPE_VPS_HOST
  JETSCOPE_VPS_DEPLOY_DIR
EOF
}

while (($# > 0)); do
  case "$1" in
    --skip-preflight)
      RUN_PREFLIGHT=0
      ;;
    --skip-sync)
      RUN_SYNC=0
      ;;
    --skip-publish)
      RUN_PUBLISH=0
      ;;
    --skip-vps-deploy)
      RUN_VPS_DEPLOY=0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT"

echo "=== JetScope Release ==="
echo "Root: $ROOT"
echo "VPS: $VPS_HOST:$VPS_DEPLOY_DIR"

if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
  echo
  echo ">>> Step 1/4: local preflight"
  npm run preflight
fi

if [[ "$RUN_SYNC" -eq 1 ]]; then
  echo
  echo ">>> Step 2/4: sync workspace to nodes"
  ./scripts/sync-to-nodes.sh
fi

if [[ "$RUN_PUBLISH" -eq 1 ]]; then
  echo
  echo ">>> Step 3/4: publish to GitHub"
  ./scripts/publish-to-github.sh
fi

EXPECTED_COMMIT="$(git rev-parse HEAD)"

if [[ "$RUN_VPS_DEPLOY" -eq 1 ]]; then
  echo
  echo ">>> Step 4/4: trigger VPS deploy"
  ssh "$VPS_HOST" "cd '$VPS_DEPLOY_DIR' && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT='$EXPECTED_COMMIT' ./scripts/auto-deploy.sh"
fi

echo
echo "Release flow completed"
