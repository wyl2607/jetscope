#!/bin/bash
# SAF 并行开发 — 从本机同步到所有节点
# 节点: mac-mini | coco | windows-pc | usa-vps
# 用法: ./scripts/sync-to-nodes.sh

set -e

SRC="/Users/yumei/SAFvsOil/"

echo "=== SAF Cluster Sync (5 Nodes) ==="
echo "Source: $SRC"
echo "Nodes:  mac-mini | coco | windows-pc | usa-vps"
echo ""

RSYNC_OPTS="-avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='apps/web/.next' \
  --exclude='apps/web/dist' \
  --exclude='apps/api/.venv' \
  --exclude='.omx' \
  --exclude='.automation' \
  --exclude='test-results' \
  --exclude='*.tar.gz' \
  --exclude='apps/web/tsconfig.tsbuildinfo' \
  --exclude='apps/web/next-env.d.ts'"

# Unix 节点 (rsync)
UNIX_NODES=("mac-mini" "coco" "usa-vps")
for node in "${UNIX_NODES[@]}"; do
  echo "[$node] Syncing via rsync..."
  if rsync $RSYNC_OPTS "$SRC" "$node:~/safvsoil/"; then
    echo "[$node] ✅ Sync complete"
  else
    echo "[$node] ❌ Sync failed"
    exit 1
  fi
  echo ""
done

# Windows 节点 (tar + scp)
echo "[windows-pc] Syncing via tar+scp..."
TAR_FILE="/tmp/safvsoil-windows.tar.gz"
cd "$SRC"
tar -czf "$TAR_FILE" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='apps/web/.next' \
  --exclude='apps/web/dist' \
  --exclude='apps/api/.venv' \
  --exclude='.omx' \
  --exclude='.automation' \
  --exclude='test-results' \
  --exclude='*.tar.gz' \
  --exclude='apps/web/tsconfig.tsbuildinfo' \
  --exclude='apps/web/next-env.d.ts' \
  .

if scp "$TAR_FILE" windows-pc:C:/Users/wyl26/safvsoil/; then
  ssh windows-pc "cd C:\Users\wyl26\safvsoil; tar -xzf safvsoil-windows.tar.gz; Remove-Item safvsoil-windows.tar.gz"
  echo "[windows-pc] ✅ Sync complete"
else
  echo "[windows-pc] ❌ Sync failed"
  exit 1
fi
rm -f "$TAR_FILE"

echo ""
echo "=== All 4 nodes synced ==="
