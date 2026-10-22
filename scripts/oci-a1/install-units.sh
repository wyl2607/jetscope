#!/usr/bin/env bash
# Install the JetScope systemd units and the alert hook on oci-a1.
#
# Run this from the MacBook after bootstrap.sh and seed.sh. It is idempotent:
# files are staged over scp, verified with systemd-analyze, compared with cmp
# and only installed when they differ. daemon-reload runs only when something
# changed. The two timers are enabled and started; jetscope-web.service is
# installed but never enabled or started here.
#
# Usage:
#   bash scripts/oci-a1/install-units.sh             # preflight + apply
#   bash scripts/oci-a1/install-units.sh --dry-run   # print the plan; no SSH, no network
#   bash scripts/oci-a1/install-units.sh --help
#
# What it does:
#   1. read-only preflight: /opt/jetscope exists, /opt/node-22/bin/node exists,
#      /usr/local/bin/oci-tg-alert exists (missing alert command is a warning,
#      not an abort);
#   2. stage the unit files and the alert hook in a mktemp -d directory on
#      oci-a1, sudo systemd-analyze verify the units, then install each file
#      only when sudo cmp -s reports a difference;
#   3. daemon-reload when any unit changed, then enable --now the sqlite-backup
#      and health-check timers (never jetscope-web.service);
#   4. print the two timers from systemctl list-timers plus the enabled/active
#      state of every JetScope unit.
#
# Installed files:
#   infra/server/oci-a1/systemd/{jetscope-web.service,
#     jetscope-sqlite-backup.service,jetscope-sqlite-backup.timer,
#     jetscope-health-check.service,jetscope-health-check.timer}
#     -> /etc/systemd/system/ (root:root 644)
#   infra/server/oci-a1/health-alert-on-change.sh
#     -> /usr/local/bin/jetscope-health-alert-on-change (root:root 755)
#
# Environment:
#   JETSCOPE_OCI_HOST  SSH host for oci-a1  (default: oci-a1-ts)
#   JETSCOPE_OCI_IP    oci-a1 tailnet IP    (default: 100.81.227.79)
#
# --dry-run never opens an SSH connection and never touches the network.
set -Eeuo pipefail

OCI="${JETSCOPE_OCI_HOST:-oci-a1-ts}"
OCI_IP="${JETSCOPE_OCI_IP:-100.81.227.79}"

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
UNIT_SRC="$REPO_ROOT/infra/server/oci-a1/systemd"
ALERT_SRC="$REPO_ROOT/infra/server/oci-a1/health-alert-on-change.sh"

UNIT_DIR=/etc/systemd/system
ALERT_NAME=health-alert-on-change.sh
ALERT_DEST=/usr/local/bin/jetscope-health-alert-on-change

UNIT_FILES=(
  jetscope-web.service
  jetscope-sqlite-backup.service
  jetscope-sqlite-backup.timer
  jetscope-health-check.service
  jetscope-health-check.timer
)
TIMERS=(
  jetscope-sqlite-backup.timer
  jetscope-health-check.timer
)

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      awk 'NR==1 {next} /^set -Eeuo pipefail$/ {exit} {print}' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

for name in "${UNIT_FILES[@]}"; do
  [[ -f "$UNIT_SRC/$name" ]] || { echo "missing source file: $UNIT_SRC/$name" >&2; exit 1; }
done
[[ -f "$ALERT_SRC" ]] || { echo "missing source file: $ALERT_SRC" >&2; exit 1; }

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> DRY-RUN: no SSH, no network, no remote changes"
  echo "host=$OCI ip=$OCI_IP"
  echo "would: ssh -o BatchMode=yes $OCI true"
  echo "would: preflight (read-only, abort on the first two failures):"
  echo "would:   test -d /opt/jetscope (abort if missing)"
  echo "would:   test -x /opt/node-22/bin/node (abort if missing)"
  echo "would:   test -x /usr/local/bin/oci-tg-alert (warn only if missing)"
  echo "would: stage=\$(ssh $OCI mktemp -d /tmp/jetscope-units.XXXXXX)"
  echo "would: scp -q these files to \$stage:"
  for name in "${UNIT_FILES[@]}"; do
    echo "would:   $UNIT_SRC/$name"
  done
  echo "would:   $ALERT_SRC"
  echo "would: sudo systemd-analyze verify \$stage/*.service \$stage/*.timer"
  echo "would: for each unit: sudo cmp -s \$stage/<name> $UNIT_DIR/<name>; install -o root -g root -m 644 when different"
  echo "would: sudo cmp -s \$stage/$ALERT_NAME $ALERT_DEST; install -o root -g root -m 755 when different"
  echo "would: sudo systemctl daemon-reload (only if any installed file changed)"
  echo "would: sudo systemctl enable --now ${TIMERS[0]} ${TIMERS[1]}"
  echo "would: sudo systemctl list-timers --all (filter ${TIMERS[0]} ${TIMERS[1]})"
  echo "would: print is-enabled/is-active for ${TIMERS[0]}, ${TIMERS[1]} and jetscope-web.service"
  echo "would: remove \$stage"
  echo "note: jetscope-web.service is installed but not enabled; enable it manually before the first deploy:"
  echo "note:   sudo systemctl enable --now jetscope-web.service"
  exit 0
fi

abort() {
  echo "ABORT: $*" >&2
  exit 1
}

ssh_run() {
  ssh -o BatchMode=yes -o ConnectTimeout=12 "$OCI" "$@"
}

STAGE=""
cleanup() {
  local rc=$?
  if [[ -n "$STAGE" ]]; then
    ssh_run "rm -rf $(printf %q "$STAGE")" >/dev/null 2>&1 || true
    STAGE=""
  fi
  exit "$rc"
}
trap cleanup EXIT

echo "==> connecting to $OCI (tailnet $OCI_IP)"
ssh_run true || abort "cannot ssh to $OCI"

echo "==> preflight (read-only)"
ssh_run bash -s <<'REMOTE'
set -Eeuo pipefail
cd /

abort() {
  echo "ABORT: $*" >&2
  exit 1
}

[[ -d /opt/jetscope ]] || abort "/opt/jetscope is missing; run bootstrap.sh first"
echo "ok: /opt/jetscope exists"

[[ -x /opt/node-22/bin/node ]] || abort "/opt/node-22/bin/node is missing; run bootstrap.sh first"
echo "ok: /opt/node-22/bin/node exists"

if [[ -x /usr/local/bin/oci-tg-alert ]]; then
  echo "ok: /usr/local/bin/oci-tg-alert exists"
else
  echo "warn: /usr/local/bin/oci-tg-alert is missing; health alerts will be logged but not sent" >&2
fi
REMOTE

echo "==> staging files on $OCI"
STAGE=$(ssh_run "mktemp -d /tmp/jetscope-units.XXXXXX") \
  || abort "could not create the staging directory on $OCI"
[[ -n "$STAGE" ]] || abort "$OCI returned an empty staging directory"

STAGED_FILES=()
for name in "${UNIT_FILES[@]}"; do
  STAGED_FILES+=("$UNIT_SRC/$name")
done
STAGED_FILES+=("$ALERT_SRC")
scp -q -o BatchMode=yes -o ConnectTimeout=12 "${STAGED_FILES[@]}" "$OCI:$STAGE/" \
  || abort "scp to $OCI:$STAGE failed"
echo "ok: staged ${#STAGED_FILES[@]} files in $STAGE"

ssh_run bash -s -- "$STAGE" "$ALERT_NAME" "$UNIT_DIR" "$ALERT_DEST" "${UNIT_FILES[@]}" <<'REMOTE'
set -Eeuo pipefail
cd /

stage=$1 alert_name=$2 unit_dir=$3 alert_dest=$4
shift 4
units=("$@")

abort() {
  echo "ABORT: $*" >&2
  exit 1
}

cleanup() {
  rm -rf "$stage"
}
trap cleanup EXIT

for name in "${units[@]}" "$alert_name"; do
  [[ -f "$stage/$name" ]] || abort "staged file is missing: $stage/$name"
done

echo "==> systemd-analyze verify"
verify_paths=()
for name in "${units[@]}"; do
  verify_paths+=("$stage/$name")
done
sudo systemd-analyze verify "${verify_paths[@]}" \
  || abort "systemd-analyze verify failed; nothing was installed"
echo "ok: systemd-analyze verify passed"

echo "==> units -> $unit_dir"
changed=0
for name in "${units[@]}"; do
  dest="$unit_dir/$name"
  if sudo cmp -s "$stage/$name" "$dest"; then
    echo "ok: $dest unchanged"
    continue
  fi
  sudo install -o root -g root -m 644 "$stage/$name" "$dest" \
    || abort "could not install $dest"
  echo "ok: $dest installed (root:root 644)"
  changed=1
done

echo "==> alert hook -> $alert_dest"
if sudo cmp -s "$stage/$alert_name" "$alert_dest"; then
  echo "ok: $alert_dest unchanged"
else
  sudo install -o root -g root -m 755 "$stage/$alert_name" "$alert_dest" \
    || abort "could not install $alert_dest"
  echo "ok: $alert_dest installed (root:root 755)"
  changed=1
fi

if [[ "$changed" -eq 1 ]]; then
  echo "==> systemctl daemon-reload"
  sudo systemctl daemon-reload || abort "systemctl daemon-reload failed"
  echo "ok: daemon-reload done"
else
  echo "ok: nothing changed; daemon-reload not needed"
fi

echo "==> enable --now timers"
sudo systemctl enable --now jetscope-sqlite-backup.timer jetscope-health-check.timer \
  || abort "could not enable the timers"
echo "ok: jetscope-sqlite-backup.timer and jetscope-health-check.timer enabled"

echo "==> status"
sudo systemctl list-timers --all --no-pager \
  | grep -E 'jetscope-(sqlite-backup|health-check)\.timer' || true
for unit in jetscope-sqlite-backup.timer jetscope-health-check.timer jetscope-web.service; do
  enabled=$(systemctl is-enabled "$unit" 2>/dev/null || true)
  active=$(systemctl is-active "$unit" 2>/dev/null || true)
  printf '%s: enabled=%s active=%s\n' "$unit" "${enabled:-unknown}" "${active:-unknown}"
done

echo "note: jetscope-web.service is installed but not enabled or started."
echo "note: enable it before the first deploy:"
echo "note:   sudo systemctl enable --now jetscope-web.service"
echo "note: (run it before deploy-oci-a1.sh --rebuild)"
REMOTE

STAGE=""
echo "==> done"
