#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_PREFLIGHT=1
RUN_SECURITY=1
RUN_PUSH_GUARD=1
RUN_DIFF_CHECK=1

usage() {
  cat <<'EOF'
Usage: ./scripts/release-dry-run.sh [options]

Side-effect-free readiness checks for local release review.

Default checks:
  1. npm run preflight
  2. scripts/security_check.sh
  3. scripts/review_push_guard.sh origin/main
  4. git diff --check

Options:
  --skip-preflight   Skip npm run preflight for a faster local-only pass
  --skip-security    Skip scripts/security_check.sh
  --skip-push-guard  Skip scripts/review_push_guard.sh origin/main
  --skip-diff-check  Skip git diff --check
  --help             Show this help

Notes:
  - This command never pushes, publishes, deploys, SSHs, rsyncs, or mutates remote state.
  - Because package.json sets private: true, npm publishing is intentionally disabled.
EOF
}

while (($# > 0)); do
  case "$1" in
    --skip-preflight)
      RUN_PREFLIGHT=0
      ;;
    --skip-security)
      RUN_SECURITY=0
      ;;
    --skip-push-guard)
      RUN_PUSH_GUARD=0
      ;;
    --skip-diff-check)
      RUN_DIFF_CHECK=0
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

echo "=== JetScope Release Dry Run ==="
echo "Root: $ROOT"

if [[ "$RUN_PREFLIGHT" -eq 1 ]]; then
  echo
  echo ">>> Local gate 1/4: npm run preflight"
  npm run preflight
fi

if [[ "$RUN_SECURITY" -eq 1 ]]; then
  echo
  echo ">>> Local gate 2/4: scripts/security_check.sh"
  "$ROOT/scripts/security_check.sh"
fi

if [[ "$RUN_PUSH_GUARD" -eq 1 ]]; then
  echo
  echo ">>> Local gate 3/4: scripts/review_push_guard.sh origin/main"
  "$ROOT/scripts/review_push_guard.sh" origin/main
fi

if [[ "$RUN_DIFF_CHECK" -eq 1 ]]; then
  echo
  echo ">>> Local gate 4/4: git diff --check"
  git diff --check
fi

echo
echo "Dry run complete"
