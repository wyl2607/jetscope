#!/bin/bash

set -euo pipefail

SRC="/Users/yumei/projects/jetscope/"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUS_WRITE="/Users/yumei/tools/script-core/bin/sc-bus-write"
PRODUCER="jetscope/scripts/sync-to-nodes.sh"
DRY_RUN=0
RUN_WORKERS=1
RUN_WINDOWS=0
INCLUDE_VPS=0
APPROVAL_TOKEN=""

source "$SCRIPT_DIR/approval-token-ledger.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/sync-to-nodes.sh [options]

Default:
  Sync JetScope to development workers only: mac-mini and coco.

Options:
  --approval-token  Required for any non-dry-run node sync side effect
  --workers      Sync development workers mac-mini and coco (default)
  --no-workers   Do not sync mac-mini/coco; use with --windows or --include-vps
  --windows      Also sync windows-pc via tar+scp
  --include-vps  Also sync usa-vps:~/jetscope as a non-production workdir
  --all-dev      Sync development workers and windows-pc, excluding usa-vps
  --dry-run      Preview rsync changes without writing Unix targets; skip Windows packaging
  --help         Show this help

Notes:
  APPROVE_JETSCOPE_SYNC must match --approval-token for non-dry-run sync.
  Production deploy uses usa-vps:/opt/jetscope through scripts/auto-deploy.sh.
  Do not use usa-vps:~/jetscope as the production source of truth.
EOF
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
    --workers)
      RUN_WORKERS=1
      ;;
    --no-workers)
      RUN_WORKERS=0
      ;;
    --windows)
      RUN_WINDOWS=1
      ;;
    --include-vps)
      INCLUDE_VPS=1
      ;;
    --all-dev)
      RUN_WORKERS=1
      RUN_WINDOWS=1
      INCLUDE_VPS=0
      ;;
    --dry-run)
      DRY_RUN=1
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

assert_sync_approval() {
  if [ "$DRY_RUN" -eq 1 ]; then
    return
  fi
  if [[ -z "$APPROVAL_TOKEN" ]]; then
    echo "ERROR: sync requires --approval-token and matching APPROVE_JETSCOPE_SYNC." >&2
    exit 1
  fi
  if [[ "${APPROVE_JETSCOPE_SYNC:-}" != "$APPROVAL_TOKEN" ]]; then
    echo "ERROR: APPROVE_JETSCOPE_SYNC must match --approval-token." >&2
    exit 1
  fi
}

assert_sync_approval

emit_sync() {
  local node="$1"
  local status="$2"
  local direction="$3"
  local transport="$4"
  local duration_ms="$5"
  local error_text="${6:-}"
  local payload
  payload=$(cat <<EOF
{"project":"jetscope","node":"$node","status":"$status","direction":"$direction","transport":"$transport","duration_ms":$duration_ms,"error":"$error_text"}
EOF
)
  "$BUS_WRITE" node-sync-event --key "${node}-${direction}" --producer "$PRODUCER" --payload "$payload" >/dev/null || true
}

source "$SCRIPT_DIR/sync-excludes.sh"

cleanup_windows_tar() {
  if [ -n "${TAR_FILE:-}" ]; then
    rm -f "$TAR_FILE"
  fi
}

verify_unix_blocked_paths_absent() {
  local node="$1"
  ssh "$node" 'bash -s' <<'EOF'
set -euo pipefail
root="$HOME/jetscope"
blocked=(
  ".env"
  ".env.local"
  ".envrc"
  ".omx"
  ".automation"
  ".guard"
  "apps/api/data"
  "data/local-preferences.json"
  "data/market.db"
  "infra/postgres-data"
  "logs"
  "webhook-logs"
  "Obsidian"
  ".obsidian"
  "30-AI-Ingest"
  "workspace-project-index.md"
)
hits=()
for item in "${blocked[@]}"; do
  if [ -e "$root/$item" ]; then
    hits+=("$item")
  fi
done
while IFS= read -r env_file; do
  [ -n "$env_file" ] && hits+=("${env_file#"$root/"}")
done < <(find "$root" -type f -name '.env.*' ! -name '.env.example' ! -name '*.example' 2>/dev/null || true)
while IFS= read -r local_only_path; do
  [ -n "$local_only_path" ] && hits+=("${local_only_path#"$root/"}")
done < <(find "$root" \( -path "$root/Documents/Obsidian*" -o -name '.obsidian' -o -name '30-AI-Ingest' -o -name 'obsidian-*.md' -o -name 'obsidian-*.json' -o -name 'obsidian-*.log' -o -name 'obsidian-*.txt' -o -name 'Obsidian_*.md' \) 2>/dev/null || true)
if [ "${#hits[@]}" -gt 0 ]; then
  printf 'Blocked paths remain after sync:\n' >&2
  printf '  %s\n' "${hits[@]}" >&2
  exit 1
fi
EOF
}

UNIX_NODES=()
if [ "$RUN_WORKERS" -eq 1 ]; then
  UNIX_NODES+=("mac-mini" "coco")
fi
if [ "$INCLUDE_VPS" -eq 1 ]; then
  UNIX_NODES+=("usa-vps")
fi

RSYNC_ARGS=(-avz --delete)
if [ "$DRY_RUN" -eq 1 ]; then
  RSYNC_ARGS+=(--dry-run)
fi

if [ "$DRY_RUN" -eq 0 ] && { [ "${#UNIX_NODES[@]}" -gt 0 ] || [ "$RUN_WINDOWS" -eq 1 ]; }; then
  approval_token_record_once "sync-push" "$APPROVAL_TOKEN" "workers=$RUN_WORKERS windows=$RUN_WINDOWS vps=$INCLUDE_VPS"
fi

if [ "${#UNIX_NODES[@]}" -gt 0 ]; then
  for node in "${UNIX_NODES[@]}"; do
    start=$(date +%s)
    emit_sync "$node" "started" "push" "rsync" 0 ""
    if rsync "${RSYNC_ARGS[@]}" "${SYNC_EXCLUDES[@]}" "$SRC" "$node:~/jetscope/" \
      && { [ "$DRY_RUN" -eq 1 ] || verify_unix_blocked_paths_absent "$node"; }; then
      end=$(date +%s)
      emit_sync "$node" "success" "push" "rsync" $(((end-start)*1000)) ""
    else
      end=$(date +%s)
      emit_sync "$node" "failed" "push" "rsync" $(((end-start)*1000)) "rsync failed"
      exit 1
    fi
  done
fi

if [ "$RUN_WINDOWS" -eq 1 ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Skipping windows-pc sync in --dry-run mode; tar+scp has no safe remote preview."
  else
    start=$(date +%s)
    emit_sync "windows-pc" "started" "push" "tar+scp" 0 ""
    TAR_FILE="/tmp/jetscope-windows.tar.gz"
    trap cleanup_windows_tar EXIT
    cd "$SRC"
    tar -czf "$TAR_FILE" "${SYNC_EXCLUDES[@]}" .
    if scp "$TAR_FILE" windows-pc:C:/Users/wyl26/jetscope/ \
      && ssh windows-pc "cd C:\Users\wyl26\jetscope; tar -xzf jetscope-windows.tar.gz; Remove-Item jetscope-windows.tar.gz" \
      && ssh windows-pc "\$root = 'C:\Users\wyl26\jetscope'; \$blocked = @('.env','.env.local','.envrc','.omx','.automation','apps\\api\\data','data\\local-preferences.json','data\\market.db','infra\\postgres-data','logs','webhook-logs','.guard','Obsidian','.obsidian','30-AI-Ingest','workspace-project-index.md'); \$hits = @(); foreach (\$item in \$blocked) { if (Test-Path (Join-Path \$root \$item)) { \$hits += \$item } }; \$envHits = @(Get-ChildItem -LiteralPath \$root -Force -Recurse -File -Filter '.env.*' -ErrorAction SilentlyContinue | Where-Object { \$_.Name -ne '.env.example' -and \$_.Name -notlike '*.example' } | ForEach-Object { \$_.FullName.Substring(\$root.Length).TrimStart('\\') }); \$localOnlyHits = @(Get-ChildItem -LiteralPath \$root -Force -Recurse -ErrorAction SilentlyContinue | Where-Object { \$_.FullName -like (Join-Path \$root 'Documents\\Obsidian*') -or \$_.Name -eq '.obsidian' -or \$_.Name -eq '30-AI-Ingest' -or \$_.Name -like 'obsidian-*.md' -or \$_.Name -like 'obsidian-*.json' -or \$_.Name -like 'obsidian-*.log' -or \$_.Name -like 'obsidian-*.txt' -or \$_.Name -like 'Obsidian_*.md' } | ForEach-Object { \$_.FullName.Substring(\$root.Length).TrimStart('\\') }); \$hits += \$envHits; \$hits += \$localOnlyHits; if (\$hits.Count -gt 0) { Write-Error ('Blocked paths remain after sync: ' + ((\$hits | Sort-Object -Unique) -join ', ')); exit 1 }"; then
      rm -f "$TAR_FILE"
      trap - EXIT
      end=$(date +%s)
      emit_sync "windows-pc" "success" "push" "tar+scp" $(((end-start)*1000)) ""
    else
      rm -f "$TAR_FILE"
      ssh windows-pc "Remove-Item C:\Users\wyl26\jetscope\jetscope-windows.tar.gz -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
      trap - EXIT
      end=$(date +%s)
      emit_sync "windows-pc" "failed" "push" "tar+scp" $(((end-start)*1000)) "windows tar+scp sync failed"
      exit 1
    fi
  fi
fi

echo "All nodes synced"
