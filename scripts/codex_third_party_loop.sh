#!/usr/bin/env bash
set -euo pipefail

LOOPS="${1:-5}"
PROMPT="${2:-Reply with exactly OK}"
CODEX_BIN="${CODEX_BIN:-codex}"

if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
  echo "ERROR: codex binary not found: $CODEX_BIN" >&2
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "ERROR: OPENAI_API_KEY is not set" >&2
  exit 1
fi

printf 'codex_bin=%s\n' "$CODEX_BIN"
printf 'loops=%s\n' "$LOOPS"
printf 'provider_base_url=%s\n' "https://relay.nf.video/v1"
printf 'started_at=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

pass_count=0
fail_count=0

for ((i = 1; i <= LOOPS; i++)); do
  started_epoch="$(date +%s)"
  output_file="$(mktemp)"
  error_file="$(mktemp)"

  if "$CODEX_BIN" exec --skip-git-repo-check "$PROMPT" >"$output_file" 2>"$error_file"; then
    ended_epoch="$(date +%s)"
    elapsed="$((ended_epoch - started_epoch))"
    result="$(tail -n 1 "$output_file" | tr -d '\r')"
    printf '[PASS] run=%s elapsed=%ss result=%s\n' "$i" "$elapsed" "$result"
    pass_count="$((pass_count + 1))"
  else
    ended_epoch="$(date +%s)"
    elapsed="$((ended_epoch - started_epoch))"
    printf '[FAIL] run=%s elapsed=%ss\n' "$i" "$elapsed"
    sed -n '1,40p' "$error_file"
    fail_count="$((fail_count + 1))"
  fi

  rm -f "$output_file" "$error_file"
done

printf 'finished_at=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf 'summary pass=%s fail=%s\n' "$pass_count" "$fail_count"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
