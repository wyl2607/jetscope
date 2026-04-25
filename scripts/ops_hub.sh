#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/yumei"
AUTOMATION="$ROOT/tools/automation"
RUNTIME="$AUTOMATION/runtime"
JOURNAL_DIR="$RUNTIME/ops-daily-journal"

usage() {
  cat <<'EOF'
Usage:
  bash /Users/yumei/scripts/ops_hub.sh ai-tools check
  bash /Users/yumei/scripts/ops_hub.sh ai-tools update [-- script args]
  bash /Users/yumei/scripts/ops_hub.sh run-profile daily
  bash /Users/yumei/scripts/ops_hub.sh run-profile weekly
  bash /Users/yumei/scripts/ops_hub.sh run-profile ai-tools-update
  bash /Users/yumei/scripts/ops_hub.sh run-profile ai-tools-update -- --targets windows-pc --dry-run

Profiles are local orchestration wrappers. They do not remediate remote state.
EOF
}

log() {
  printf '[ops-hub] %s\n' "$*"
}

run_task() {
  local name="$1"
  shift
  log "start $name at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local rc=0
  if "$@"; then
    rc=0
    log "done $name"
  else
    rc=$?
    log "failed $name rc=$rc"
  fi
  TASK_RESULTS+=("$name:$rc")
  return 0
}

write_journal() {
  local run_id="$1"
  local profile="$2"
  local checked_at
  checked_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  mkdir -p "$JOURNAL_DIR/$run_id"
  local json="$JOURNAL_DIR/$run_id/daily-log.json"
  local md="$JOURNAL_DIR/$run_id/daily-log.md"
  TASK_RESULTS_JOINED="$(IFS=,; printf '%s' "${TASK_RESULTS[*]:-}")" CHECKED_AT="$checked_at" PROFILE="$profile" python3 - <<'PY' > "$json"
import json, os
items=[]
for raw in os.environ.get("TASK_RESULTS_JOINED", "").split(","):
    if not raw:
        continue
    name, rc = raw.rsplit(":", 1)
    items.append({"task": name, "rc": int(rc), "status": "ok" if int(rc) == 0 else "failed"})
print(json.dumps({"checked_at": os.environ["CHECKED_AT"], "profile": os.environ["PROFILE"], "tasks": items}, ensure_ascii=False, indent=2))
PY
  {
    printf '# Ops Daily Journal\n\n'
    printf -- '- Checked at: `%s`\n' "$checked_at"
    printf -- '- Profile: `%s`\n\n' "$profile"
    printf '| Task | RC | Status |\n|---|---:|---|\n'
    local item name rc status
    for item in "${TASK_RESULTS[@]:-}"; do
      name="${item%:*}"
      rc="${item##*:}"
      status="ok"
      [[ "$rc" == "0" ]] || status="failed"
      printf '| `%s` | %s | %s |\n' "$name" "$rc" "$status"
    done
  } > "$md"
  cp "$json" "$JOURNAL_DIR/latest-daily-log.json"
  cp "$md" "$JOURNAL_DIR/latest-daily-log.md"
  log "journal-json=$json"
  log "journal-md=$md"
}

run_profile() {
  local profile="$1"
  shift || true
  local run_id
  run_id="$(date -u '+%Y%m%d-%H%M%S')"
  TASK_RESULTS=()
  case "$profile" in
    daily)
      run_task registry-refresh python3 "$AUTOMATION/scripts/refresh_ai_systems_registry.py" --write
      run_task ai-check python3 "$ROOT/scripts/daily_ai_tools_update_check.py"
      write_journal "$run_id" "$profile"
      ;;
    weekly)
      run_task registry-refresh python3 "$AUTOMATION/scripts/refresh_ai_systems_registry.py" --write
      run_task ai-check python3 "$ROOT/scripts/daily_ai_tools_update_check.py"
      write_journal "$run_id" "$profile"
      ;;
    ai-tools-update)
      run_task ai-tools-update python3 "$ROOT/scripts/internal_device_update_orchestrator.py" --verify-after "$@"
      run_task registry-refresh python3 "$AUTOMATION/scripts/refresh_ai_systems_registry.py" --write
      run_task ai-check python3 "$ROOT/scripts/daily_ai_tools_update_check.py"
      write_journal "$run_id" "$profile"
      ;;
    *)
      printf 'Unknown profile: %s\n' "$profile" >&2
      usage
      return 2
      ;;
  esac
}

run_ai_tools() {
  local action="${1:-}"
  shift || true
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  case "$action" in
    check)
      run_profile daily "$@"
      ;;
    update)
      run_profile ai-tools-update "$@"
      ;;
    *)
      printf 'Unknown ai-tools action: %s\n' "$action" >&2
      usage
      return 2
      ;;
  esac
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    return 0
  fi
  if [[ "${1:-}" == "ai-tools" ]]; then
    shift
    run_ai_tools "$@"
    return $?
  fi
  if [[ "${1:-}" != "run-profile" || -z "${2:-}" ]]; then
    usage
    return 2
  fi
  local profile="$2"
  shift 2
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  run_profile "$profile" "$@"
}

main "$@"
