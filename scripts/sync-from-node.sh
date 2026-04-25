#!/bin/bash

set -euo pipefail

NODE="${1:-}"
[[ -n "$NODE" ]] || { echo "Usage: $0 [mac-mini|coco|windows-pc|usa-vps]"; exit 1; }
case "$NODE" in
  mac-mini|coco|windows-pc|usa-vps)
    ;;
  *)
    echo "Invalid node: $NODE" >&2
    echo "Usage: $0 [mac-mini|coco|windows-pc|usa-vps]" >&2
    exit 2
    ;;
esac

DEST="/Users/yumei/projects/jetscope/"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUS_WRITE="/Users/yumei/tools/script-core/bin/sc-bus-write"
PRODUCER="jetscope/scripts/sync-from-node.sh"

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
RSYNC_ARGS=(-avz)
WINDOWS_TAR_EXCLUDE_TEXT="${SYNC_EXCLUDES[*]}"

cleanup_windows_pull_tar() {
  if [ -n "${TAR_FILE:-}" ]; then
    rm -f "$TAR_FILE"
  fi
}

start=$(date +%s)

if [[ "$NODE" == "windows-pc" ]]; then
  emit_sync "$NODE" "started" "pull" "tar+scp" 0 ""
  TAR_FILE="/tmp/jetscope-windows-pull.tar.gz"
  trap cleanup_windows_pull_tar EXIT
  if ssh windows-pc "cd C:\Users\wyl26\jetscope; tar -czf jetscope-windows-pull.tar.gz $WINDOWS_TAR_EXCLUDE_TEXT ." \
    && scp windows-pc:C:/Users/wyl26/jetscope/jetscope-windows-pull.tar.gz "$TAR_FILE" \
    && ssh windows-pc "Remove-Item C:\Users\wyl26\jetscope\jetscope-windows-pull.tar.gz" \
    && cd "$DEST" \
    && tar -xzf "$TAR_FILE"; then
    rm -f "$TAR_FILE"
    trap - EXIT
    end=$(date +%s)
    emit_sync "$NODE" "success" "pull" "tar+scp" $(((end-start)*1000)) ""
  else
    rm -f "$TAR_FILE"
    ssh windows-pc "Remove-Item C:\Users\wyl26\jetscope\jetscope-windows-pull.tar.gz -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
    trap - EXIT
    end=$(date +%s)
    emit_sync "$NODE" "failed" "pull" "tar+scp" $(((end-start)*1000)) "windows tar+scp pull failed"
    exit 1
  fi
else
  emit_sync "$NODE" "started" "pull" "rsync" 0 ""
  if rsync "${RSYNC_ARGS[@]}" "${SYNC_EXCLUDES[@]}" "$NODE:~/jetscope/" "$DEST"; then
    end=$(date +%s)
    emit_sync "$NODE" "success" "pull" "rsync" $(((end-start)*1000)) ""
  else
    end=$(date +%s)
    emit_sync "$NODE" "failed" "pull" "rsync" $(((end-start)*1000)) "rsync failed"
    exit 1
  fi
fi

echo "Pull complete from $NODE"
