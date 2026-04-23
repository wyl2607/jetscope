#!/bin/bash

set -euo pipefail

SRC="/Users/yumei/projects/jetscope/"
BUS_WRITE="/Users/yumei/tools/script-core/bin/sc-bus-write"
PRODUCER="jetscope/scripts/sync-to-nodes.sh"

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

RSYNC_OPTS="-avz --delete --exclude=.git --exclude=node_modules --exclude=apps/web/.next --exclude=apps/web/dist --exclude=apps/api/.venv --exclude=.omx --exclude=.automation --exclude=test-results --exclude=*.tar.gz --exclude=apps/web/tsconfig.tsbuildinfo --exclude=apps/web/next-env.d.ts"

UNIX_NODES=("mac-mini" "coco" "usa-vps")
for node in "${UNIX_NODES[@]}"; do
  start=$(date +%s)
  emit_sync "$node" "started" "push" "rsync" 0 ""
  if rsync $RSYNC_OPTS "$SRC" "$node:~/jetscope/"; then
    end=$(date +%s)
    emit_sync "$node" "success" "push" "rsync" $(((end-start)*1000)) ""
  else
    end=$(date +%s)
    emit_sync "$node" "failed" "push" "rsync" $(((end-start)*1000)) "rsync failed"
    exit 1
  fi
done

start=$(date +%s)
emit_sync "windows-pc" "started" "push" "tar+scp" 0 ""
TAR_FILE="/tmp/jetscope-windows.tar.gz"
cd "$SRC"
tar -czf "$TAR_FILE" --exclude='.git' --exclude='node_modules' --exclude='apps/web/.next' --exclude='apps/web/dist' --exclude='apps/api/.venv' --exclude='.omx' --exclude='.automation' --exclude='test-results' --exclude='*.tar.gz' --exclude='apps/web/tsconfig.tsbuildinfo' --exclude='apps/web/next-env.d.ts' .
if scp "$TAR_FILE" windows-pc:C:/Users/wyl26/jetscope/; then
  ssh windows-pc "cd C:\Users\wyl26\jetscope; tar -xzf jetscope-windows.tar.gz; Remove-Item jetscope-windows.tar.gz"
  rm -f "$TAR_FILE"
  end=$(date +%s)
  emit_sync "windows-pc" "success" "push" "tar+scp" $(((end-start)*1000)) ""
else
  rm -f "$TAR_FILE"
  end=$(date +%s)
  emit_sync "windows-pc" "failed" "push" "tar+scp" $(((end-start)*1000)) "scp failed"
  exit 1
fi

echo "All nodes synced"
