#!/bin/bash

set -euo pipefail

ROOT="/Users/yumei/projects/jetscope"
VPS_HOST="${JETSCOPE_VPS_HOST:-usa-vps}"
VPS_DEPLOY_DIR="${JETSCOPE_VPS_DEPLOY_DIR:-/opt/jetscope}"
EXPECTED_COMMIT=""

RUN_PREFLIGHT=1
RUN_SYNC_WORKERS=0
RUN_SYNC_WINDOWS=0
RUN_SYNC_VPS_WORKDIR=0
RUN_PUBLISH=1
RUN_VPS_DEPLOY=1

assert_skip_publish_deploy_safe() {
  local current_branch
  local local_commit
  local remote_commit

  current_branch="$(git branch --show-current)"
  if [[ "$current_branch" != "main" ]]; then
    echo "ERROR: --skip-publish deploy requires main branch; current branch is '${current_branch:-detached HEAD}'." >&2
    exit 1
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    echo "ERROR: --skip-publish deploy requires a clean working tree." >&2
    git status --short >&2
    exit 1
  fi

  git fetch origin main:refs/remotes/origin/main

  local_commit="$(git rev-parse HEAD)"
  remote_commit="$(git rev-parse origin/main)"
  if [[ "$local_commit" != "$remote_commit" ]]; then
    echo "ERROR: --skip-publish deploy requires HEAD to match origin/main." >&2
    echo "       HEAD:        $local_commit" >&2
    echo "       origin/main: $remote_commit" >&2
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh [options]

Default flow:
  1. npm run preflight
  2. ./scripts/publish-to-github.sh
  3. ssh usa-vps "cd /opt/jetscope && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT=<HEAD> ./scripts/auto-deploy.sh"

Options:
  --skip-preflight   Skip local preflight
  --sync-workers     Sync mac-mini/coco before publish
  --sync-windows     Sync windows-pc before publish without implicitly syncing workers
  --sync-vps-workdir Sync usa-vps:~/jetscope before publish without implicitly syncing workers
  --skip-sync        Legacy no-op; sync is opt-in by default
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
    --sync-workers)
      RUN_SYNC_WORKERS=1
      ;;
    --sync-windows)
      RUN_SYNC_WINDOWS=1
      ;;
    --sync-vps-workdir)
      RUN_SYNC_VPS_WORKDIR=1
      ;;
    --skip-sync)
      echo "Note: --skip-sync is a legacy no-op; node sync is opt-in by default."
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

if [[ "$RUN_PUBLISH" -eq 0 && "$RUN_VPS_DEPLOY" -eq 1 ]]; then
  echo
  echo ">>> Safety check: skip-publish deploy must match origin/main"
  assert_skip_publish_deploy_safe
fi

if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
  echo
  echo ">>> Step 1/3: local preflight"
  npm run preflight
fi

if [[ "$RUN_SYNC_WORKERS" -eq 1 || "$RUN_SYNC_WINDOWS" -eq 1 || "$RUN_SYNC_VPS_WORKDIR" -eq 1 ]]; then
  echo
  echo ">>> Optional: sync workspace to selected nodes"
  SYNC_ARGS=()
  if [[ "$RUN_SYNC_WORKERS" -eq 1 ]]; then
    SYNC_ARGS+=(--workers)
  else
    SYNC_ARGS+=(--no-workers)
  fi
  if [[ "$RUN_SYNC_WINDOWS" -eq 1 ]]; then
    SYNC_ARGS+=(--windows)
  fi
  if [[ "$RUN_SYNC_VPS_WORKDIR" -eq 1 ]]; then
    SYNC_ARGS+=(--include-vps)
  fi
  ./scripts/sync-to-nodes.sh "${SYNC_ARGS[@]}"
fi

if [[ "$RUN_PUBLISH" -eq 1 ]]; then
  echo
  echo ">>> Step 2/3: publish to GitHub"
  ./scripts/publish-to-github.sh
fi

EXPECTED_COMMIT="$(git rev-parse HEAD)"

if [[ "$RUN_VPS_DEPLOY" -eq 1 ]]; then
  echo
  echo ">>> Step 3/3: trigger VPS deploy"
  ssh "$VPS_HOST" "cd '$VPS_DEPLOY_DIR' && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT='$EXPECTED_COMMIT' ./scripts/auto-deploy.sh"
fi

echo
echo "Release flow completed"
