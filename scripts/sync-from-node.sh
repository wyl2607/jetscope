#!/bin/bash

set -euo pipefail

NODE="${1:-}"
ALLOW_VPS=0
APPROVAL_TOKEN=""

usage() {
  echo "Usage: $0 [mac-mini|coco|windows-pc|usa-vps] --approval-token <token> [--allow-vps-workdir]"
  echo "Requires APPROVE_JETSCOPE_SYNC to match --approval-token before pulling from a node."
}

[[ -n "$NODE" ]] || { usage; exit 1; }
if [ "$NODE" = "--help" ] || [ "$NODE" = "-h" ]; then
  usage
  exit 0
fi
shift || true

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
    --allow-vps-workdir)
      ALLOW_VPS=1
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

if [[ -z "$APPROVAL_TOKEN" ]]; then
  echo "ERROR: pull sync requires --approval-token and matching APPROVE_JETSCOPE_SYNC." >&2
  exit 1
fi
if [[ "${APPROVE_JETSCOPE_SYNC:-}" != "$APPROVAL_TOKEN" ]]; then
  echo "ERROR: APPROVE_JETSCOPE_SYNC must match --approval-token." >&2
  exit 1
fi

case "$NODE" in
  mac-mini|coco|windows-pc|usa-vps)
    ;;
  *)
    echo "Invalid node: $NODE" >&2
    echo "Usage: $0 [mac-mini|coco|windows-pc|usa-vps]" >&2
    exit 2
    ;;
esac

if [ "$NODE" = "usa-vps" ] && [ "$ALLOW_VPS" -ne 1 ]; then
  echo "Refusing to pull from usa-vps:~/jetscope without --allow-vps-workdir." >&2
  echo "That path is a non-production workdir and may be stale; production deploy uses usa-vps:/opt/jetscope." >&2
  exit 2
fi

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
