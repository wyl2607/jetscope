#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_REF="${1:-origin/main}"

cd "$ROOT"

fail() {
  echo "review_push_guard: ERROR: $1" >&2
  exit 1
}

python3 "$ROOT/scripts/dirty_tree_guard.py" --repo "$ROOT" --mode publish

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  fail "base ref not found: $BASE_REF"
fi

staged_files="$(git diff --name-only --cached)"
if [ -n "$staged_files" ]; then
  staged_blocked=()
  while IFS= read -r path; do
    case "$path" in
      .claude/projects/*/dev-harness/*|*/.claude/projects/*/dev-harness/*)
        staged_blocked+=("$path")
        ;;
    esac
  done <<< "$staged_files"
  if [ "${#staged_blocked[@]}" -gt 0 ]; then
    printf 'review_push_guard: blocked staged dev-harness files:\n' >&2
    printf '  %s\n' "${staged_blocked[@]}" | sort -u >&2
    exit 1
  fi
  fail "staged changes present; review and unstage or commit intentionally before push"
fi

if [ -n "$(git status --porcelain)" ]; then
  fail "worktree is dirty; publish only from a clean reviewed commit"
fi

changed_files=()
while IFS= read -r path; do
  [ -n "$path" ] && changed_files+=("$path")
done < <(git diff --name-only "$BASE_REF"...HEAD)

if [ "${#changed_files[@]}" -eq 0 ]; then
  echo "review_push_guard: ok (no outgoing file changes vs $BASE_REF)"
  exit 0
fi

blocked=()
credential_named=()
for path in "${changed_files[@]}"; do
  case "$path" in
    .env|*/.env|.env.local|*/.env.local|.envrc|*/.envrc|.env.*|*/.env.*|.automation/*|.harness/*|.omx/*|.guard/*|.next/*|apps/web/.next/*|apps/web/dist/*|*.tsbuildinfo|__pycache__/*|*/__pycache__/*|*.pyc|*.pyo|*.egg-info/*|.venv/*|apps/api/.venv/*|.pytest_cache/*|.ruff_cache/*|apps/api/data/*|data/local-preferences.json|data/market.db|infra/postgres-data/*|logs/*|webhook-logs/*|test-results/*|playwright-report/*|coverage/*|htmlcov/*|archive/*|docs/archive/*|obsidian-audit-output/*|*.log|*.tar.gz|*.zip)
      case "$path" in
        .env.example|*/.env.example|.env.*.example|*/.env.*.example)
          ;;
        *)
          blocked+=("$path")
          ;;
      esac
      ;;
  esac

  case "$path" in
    .claude/projects/*/dev-harness/*|*/.claude/projects/*/dev-harness/*)
      blocked+=("$path")
      ;;
  esac

  case "$path" in
    .env.example|*/.env.example|.env.*.example|*/.env.*.example)
      ;;
    scripts/approval-token-ledger.sh)
      ;;
    */.env|.env|*/.env.*|.env.*|*credentials*|*secret*|*token*|*private-key*)
      credential_named+=("$path")
      ;;
  esac
done

if [ "${#blocked[@]}" -gt 0 ]; then
  printf 'review_push_guard: blocked outgoing files vs %s:\n' "$BASE_REF" >&2
  printf '  %s\n' "${blocked[@]}" | sort -u >&2
  exit 1
fi

if [ "${#credential_named[@]}" -gt 0 ]; then
  printf 'review_push_guard: credential-like outgoing file names vs %s:\n' "$BASE_REF" >&2
  printf '  %s\n' "${credential_named[@]}" | sort -u >&2
  exit 1
fi

echo "review_push_guard: ok (${#changed_files[@]} outgoing files vs $BASE_REF)"
