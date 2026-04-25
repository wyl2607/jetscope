#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

fail() {
  echo "security_check: ERROR: $1" >&2
  exit 1
}

tracked_blocked_patterns=(
  '.env'
  '.env.local'
  '.envrc'
  '**/.env'
  '**/.env.local'
  '**/.envrc'
  '.automation/*'
  '.omx/*'
  '.guard/*'
  '.next/*'
  'apps/web/.next/*'
  'apps/web/dist/*'
  '*.tsbuildinfo'
  '__pycache__/*'
  '**/__pycache__/*'
  '*.pyc'
  '*.pyo'
  '*.egg-info/*'
  '.venv/*'
  'apps/api/.venv/*'
  '.pytest_cache/*'
  '.ruff_cache/*'
  'apps/api/data/*'
  'data/local-preferences.json'
  'data/market.db'
  'infra/postgres-data/*'
  'logs/*'
  'webhook-logs/*'
  'test-results/*'
  'playwright-report/*'
  'coverage/*'
  'htmlcov/*'
  'archive/*'
  'docs/archive/*'
  '*.log'
  '*.tar.gz'
  '*.zip'
)

tracked_env_files=()
while IFS= read -r path; do
  case "$path" in
    .env.example|*/.env.example|.env.*.example|*/.env.*.example)
      ;;
    .env.*|*/.env.*)
      tracked_env_files+=("$path")
      ;;
  esac
done < <(git ls-files '**/.env.*' '.env.*')

if [ "${#tracked_env_files[@]}" -gt 0 ]; then
  printf 'security_check: blocked tracked env files:\n' >&2
  printf '  %s\n' "${tracked_env_files[@]}" >&2
  exit 1
fi

tracked_blocked=()
for pattern in "${tracked_blocked_patterns[@]}"; do
  while IFS= read -r path; do
    [ -n "$path" ] && tracked_blocked+=("$path")
  done < <(git ls-files "$pattern")
done

if [ "${#tracked_blocked[@]}" -gt 0 ]; then
  printf 'security_check: blocked tracked files:\n' >&2
  printf '  %s\n' "${tracked_blocked[@]}" | sort -u >&2
  exit 1
fi

untracked_sensitive=()
while IFS= read -r path; do
  case "$path" in
    .env.example|*/.env.example|.env.*.example|*/.env.*.example)
      ;;
    .env|*/.env|.env.local|*/.env.local|.envrc|*/.envrc|.env.*|*/.env.*|*.log|*.tar.gz|*.zip|apps/api/data/*|data/market.db|data/local-preferences.json|.automation/*|.omx/*|.guard/*)
      untracked_sensitive+=("$path")
      ;;
  esac
done < <(git ls-files --others --exclude-standard)

if [ "${#untracked_sensitive[@]}" -gt 0 ]; then
  printf 'security_check: sensitive untracked files are present; keep them ignored/local before publishing:\n' >&2
  printf '  %s\n' "${untracked_sensitive[@]}" | sort -u >&2
  exit 1
fi

credential_named=()
while IFS= read -r path; do
  case "$path" in
    .env.example|*/.env.example|.env.*.example|*/.env.*.example)
      ;;
    */.env|.env|*/.env.*|.env.*|*credentials*|*secret*|*token*|*private-key*)
      credential_named+=("$path")
      ;;
  esac
done < <(git diff --cached --name-only --diff-filter=ACMR)

if [ "${#credential_named[@]}" -gt 0 ]; then
  printf 'security_check: staged file names look credential-related:\n' >&2
  printf '  %s\n' "${credential_named[@]}" | sort -u >&2
  exit 1
fi

echo "security_check: ok"
