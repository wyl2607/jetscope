#!/bin/bash

set -euo pipefail

NODE="${1:-}"
[[ -n "$NODE" ]] || { echo "Usage: $0 [mac-mini|coco|windows-pc|usa-vps]"; exit 1; }

DEST="/Users/yumei/projects/jetscope/"
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

RSYNC_OPTS="-avz --exclude=.git --exclude=node_modules --exclude=apps/web/.next --exclude=apps/web/dist --exclude=apps/api/.venv --exclude=.omx --exclude=.automation --exclude=test-results --exclude=*.tar.gz --exclude=apps/web/tsconfig.tsbuildinfo --exclude=apps/web/next-env.d.ts"

start=$(date +%s)

if [[ "$NODE" == "windows-pc" ]]; then
  emit_sync "$NODE" "started" "pull" "tar+scp" 0 ""
  TAR_FILE="/tmp/jetscope-windows-pull.tar.gz"
  ssh windows-pc "cd C:\Users\wyl26\jetscope; tar -czf jetscope-windows-pull.tar.gz --exclude='node_modules' --exclude='apps/web/.next' --exclude='apps/web/dist' --exclude='apps/api/.venv' --exclude='.omx' --exclude='.automation' --exclude='test-results' --exclude='*.tar.gz' --exclude='apps/web/tsconfig.tsbuildinfo' --exclude='apps/web/next-env.d.ts' ."
  scp windows-pc:C:/Users/wyl26/jetscope/jetscope-windows-pull.tar.gz "$TAR_FILE"
  ssh windows-pc "Remove-Item C:\Users\wyl26\jetscope\jetscope-windows-pull.tar.gz"
  cd "$DEST"
  tar -xzf "$TAR_FILE"
  rm -f "$TAR_FILE"
  end=$(date +%s)
  emit_sync "$NODE" "success" "pull" "tar+scp" $(((end-start)*1000)) ""
else
  emit_sync "$NODE" "started" "pull" "rsync" 0 ""
  if rsync $RSYNC_OPTS "$NODE:~/jetscope/" "$DEST"; then
    end=$(date +%s)
    emit_sync "$NODE" "success" "pull" "rsync" $(((end-start)*1000)) ""
  else
    end=$(date +%s)
    emit_sync "$NODE" "failed" "pull" "rsync" $(((end-start)*1000)) "rsync failed"
    exit 1
  fi
fi

echo "Pull complete from $NODE"
