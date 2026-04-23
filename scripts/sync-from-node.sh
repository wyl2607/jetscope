#!/bin/bash
# SAF 并行开发 — 从节点同步回本机
# 用法: ./scripts/sync-from-node.sh [mac-mini|coco|windows-pc|usa-vps]

set -e

NODE="${1:-}"
if [[ -z "$NODE" ]]; then
  echo "Usage: $0 [mac-mini|coco|windows-pc|usa-vps]"
  exit 1
fi

DEST="/Users/yumei/SAFvsOil/"

echo "=== Pull from $NODE ==="
echo "Dest: $DEST"
echo ""

RSYNC_OPTS="-avz \
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

if [[ "$NODE" == "windows-pc" ]]; then
  # Windows 节点: tar + scp
  echo "[windows-pc] Pulling via tar+scp..."
  TAR_FILE="/tmp/safvsoil-windows-pull.tar.gz"
  ssh windows-pc "cd C:\Users\wyl26\safvsoil; tar -czf safvsoil-windows-pull.tar.gz \
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
    ."
  scp windows-pc:C:/Users/wyl26/safvsoil/safvsoil-windows-pull.tar.gz "$TAR_FILE"
  ssh windows-pc "Remove-Item C:\Users\wyl26\safvsoil\safvsoil-windows-pull.tar.gz"
  cd "$DEST"
  tar -xzf "$TAR_FILE"
  rm -f "$TAR_FILE"
  echo "[windows-pc] ✅ Pull complete"
else
  # Unix 节点: rsync
  SRC="$NODE:~/safvsoil/"
  echo "[$NODE] Pulling via rsync..."
  if rsync $RSYNC_OPTS "$SRC" "$DEST"; then
    echo "[$NODE] ✅ Pull complete"
  else
    echo "[$NODE] ❌ Pull failed"
    exit 1
  fi
fi

echo ""
echo "=== Done ==="
echo "Next: run 'npm run preflight' to verify merged code"
