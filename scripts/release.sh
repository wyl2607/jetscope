#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${JETSCOPE_VPS_HOST:-}"
VPS_DEPLOY_DIR="${JETSCOPE_VPS_DEPLOY_DIR:-/opt/jetscope}"
EXPECTED_COMMIT=""
APPROVAL_TOKEN=""
RELEASE_RECORDED=0

RUN_PREFLIGHT=1
RUN_SYNC_WORKERS=0
RUN_SYNC_WINDOWS=0
RUN_SYNC_VPS_WORKDIR=0
RUN_PUBLISH=1
RUN_VPS_DEPLOY=1

source "$ROOT/scripts/approval-token-ledger.sh"

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
  3. ssh <production-host> "cd /opt/jetscope && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT=<HEAD> APPROVE_JETSCOPE_DEPLOY=<token> bash ./scripts/auto-deploy.sh --approval-token <token>"

Options:
  --approval-token  Required for publish, sync, or VPS deploy side effects
  --skip-preflight   Skip local preflight
  --sync-workers     Deprecated; worker sync is handled outside this public repo
  --sync-windows     Deprecated; worker sync is handled outside this public repo
  --sync-vps-workdir Deprecated; worker sync is handled outside this public repo
  --skip-sync        Legacy no-op; sync is opt-in by default
  --skip-publish     Skip publish-to-github
  --skip-vps-deploy  Skip remote VPS deploy trigger
  --help             Show this help

Environment overrides:
  APPROVE_JETSCOPE_RELEASE must match --approval-token when release has side effects
  JETSCOPE_VPS_HOST
  JETSCOPE_VPS_DEPLOY_DIR
EOF
}

requires_approval() {
  [[ "$RUN_PUBLISH" -eq 1 || "$RUN_VPS_DEPLOY" -eq 1 || "$RUN_SYNC_WORKERS" -eq 1 || "$RUN_SYNC_WINDOWS" -eq 1 || "$RUN_SYNC_VPS_WORKDIR" -eq 1 ]]
}

assert_release_approval() {
  if ! requires_approval; then
    return
  fi
  if [[ -z "$APPROVAL_TOKEN" ]]; then
    echo "ERROR: publish, sync, or deploy requires --approval-token and matching APPROVE_JETSCOPE_RELEASE." >&2
    exit 1
  fi
  if [[ "${APPROVE_JETSCOPE_RELEASE:-}" != "$APPROVAL_TOKEN" ]]; then
    echo "ERROR: APPROVE_JETSCOPE_RELEASE must match --approval-token." >&2
    exit 1
  fi
}

record_release_approval_once() {
  if [[ "$RELEASE_RECORDED" -eq 1 ]]; then
    return
  fi
  approval_token_record_once "release" "$APPROVAL_TOKEN" "publish=$RUN_PUBLISH sync_workers=$RUN_SYNC_WORKERS sync_windows=$RUN_SYNC_WINDOWS sync_vps=$RUN_SYNC_VPS_WORKDIR deploy=$RUN_VPS_DEPLOY head=$(git rev-parse HEAD)"
  RELEASE_RECORDED=1
}

assert_safe_remote_arg() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[A-Za-z0-9._/@:=,+-]+$ ]]; then
    echo "ERROR: $name contains unsupported characters for remote release command." >&2
    exit 1
  fi
}

assert_safe_ssh_host() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo "ERROR: JETSCOPE_VPS_HOST must name the approved production host." >&2
    exit 1
  fi
}

while (($# > 0)); do
  case "$1" in
    --approval-token)
      APPROVAL_TOKEN="${2:-}"
      if [[ -z "$APPROVAL_TOKEN" ]]; then
        echo "ERROR: --approval-token requires a non-empty value" >&2
        exit 1
      fi
      shift
      ;;
    --skip-preflight)
      RUN_PREFLIGHT=0
      ;;
    --sync-workers)
      echo "ERROR: worker sync scripts moved to private workspace operations." >&2
      exit 1
      ;;
    --sync-windows)
      echo "ERROR: worker sync scripts moved to private workspace operations." >&2
      exit 1
      ;;
    --sync-vps-workdir)
      echo "ERROR: worker sync scripts moved to private workspace operations." >&2
      exit 1
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

assert_release_approval

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
  echo "ERROR: worker sync scripts moved to private workspace operations." >&2
  exit 1
fi

EXPECTED_COMMIT="$(git rev-parse HEAD)"

if [[ "$RUN_PUBLISH" -eq 1 ]]; then
  echo
  echo ">>> Step 2/3: publish to GitHub"
  record_release_approval_once
  PUBLISH_TOKEN=$(approval_token_derive "$APPROVAL_TOKEN" "publish" "main:$EXPECTED_COMMIT")
  APPROVE_JETSCOPE_PUBLISH="$PUBLISH_TOKEN" ./scripts/publish-to-github.sh --approval-token "$PUBLISH_TOKEN"
fi

if [[ "$RUN_VPS_DEPLOY" -eq 1 ]]; then
  echo
  echo ">>> Step 3/3: trigger VPS deploy"
  record_release_approval_once
  DEPLOY_TOKEN=$(approval_token_derive "$APPROVAL_TOKEN" "deploy" "${VPS_HOST}:${VPS_DEPLOY_DIR}:${EXPECTED_COMMIT}")
  assert_safe_ssh_host "$VPS_HOST"
  assert_safe_remote_arg "JETSCOPE_VPS_DEPLOY_DIR" "$VPS_DEPLOY_DIR"
  assert_safe_remote_arg "deploy approval token" "$DEPLOY_TOKEN"
  ssh "$VPS_HOST" "cd '$VPS_DEPLOY_DIR' && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT='$EXPECTED_COMMIT' APPROVE_JETSCOPE_DEPLOY='$DEPLOY_TOKEN' bash ./scripts/auto-deploy.sh --approval-token '$DEPLOY_TOKEN'"
fi

echo
echo "Release flow completed"
