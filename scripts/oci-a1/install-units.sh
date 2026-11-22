#!/usr/bin/env bash
# Install the JetScope systemd units and the alert hook on oci-a1.
#
# Run this from the MacBook after bootstrap.sh and seed.sh. It is idempotent:
# files are staged over scp, verified with systemd-analyze, compared with cmp
# and only installed when they differ. daemon-reload runs only when something
# changed. jetscope-web.service is installed but never enabled or started here.
# The backup timer is enabled and started; the health-check timer is enabled
# only when jetscope-web.service is already active, so a first install cannot
# alert before the first deploy.
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
#      oci-a1, sudo systemd-analyze verify the units (jetscope-web.service is
#      left out of the verify when /opt/jetscope/node_modules/.bin/next does
#      not exist yet), then install each file only when sudo cmp -s reports a
#      difference;
#   3. daemon-reload when any unit changed, then enable --now the
#      sqlite-backup timer; the health-check timer is enabled --now only when
#      jetscope-web.service is active (re-run after the first deploy);
#   4. print the two timers from systemctl list-timers plus the enabled/active
#      state of every JetScope unit.
#
# Installed files:
#   every infra/server/oci-a1/systemd/*.service and *.timer (template units
#     such as jetscope-alert@.service included)
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

# Every unit in the source directory, template units included. The list is not
# hard-coded so a new unit cannot be silently left out of an install.
UNIT_FILES=()
while IFS= read -r unit_path; do
  UNIT_FILES+=("$(basename "$unit_path")")
done < <(find "$UNIT_SRC" -maxdepth 1 -type f \
  \( -name '*.service' -o -name '*.timer' \) -print | LC_ALL=C sort)
(( ${#UNIT_FILES[@]} > 0 )) || { echo "no units found in $UNIT_SRC" >&2; exit 1; }
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
  echo "would:   test -x /opt/jetscope/node_modules/.bin/next (read-only)"
  echo "would: stage=\$(ssh $OCI mktemp -d /tmp/jetscope-units.XXXXXX)"
  echo "would: scp -q these files to \$stage:"
  for name in "${UNIT_FILES[@]}"; do
    echo "would:   $UNIT_SRC/$name"
  done
  echo "would:   $ALERT_SRC"
  echo "would: sudo systemd-analyze verify \$stage/*.service \$stage/*.timer"
  echo "would:   if /opt/jetscope/node_modules/.bin/next is missing, leave jetscope-web.service out of verify:"
  echo "would:     warn: jetscope-web.service not verified (next not deployed yet)"
  echo "would:   jetscope-web.service is still installed below"
  echo "would: template units (*@.service) are verified through a test instance name"
  echo "would: for each unit: sudo cmp -s \$stage/<name> $UNIT_DIR/<name>; install -o root -g root -m 644 when different"
  echo "would: sudo cmp -s \$stage/$ALERT_NAME $ALERT_DEST; install -o root -g root -m 755 when different"
  echo "would: sudo systemctl daemon-reload (only if any installed file changed)"
  echo "would: sudo systemctl enable --now ${TIMERS[0]}"
  echo "would: if systemctl is-active --quiet jetscope-web.service: sudo systemctl enable --now ${TIMERS[1]}"
  echo "would: else: note: ${TIMERS[1]} not enabled yet; after the first deploy run: bash scripts/oci-a1/install-units.sh"
  echo "would: sudo systemctl list-timers --all (filter ${TIMERS[0]} ${TIMERS[1]})"
  echo "would: print is-enabled/is-active for ${TIMERS[0]}, ${TIMERS[1]} and jetscope-web.service"
  echo "would: remove \$stage"
  echo "note: template units such as jetscope-alert@.service are installed but never enabled"
  echo "note: jetscope-web.service is installed but not enabled; enable it manually before the first deploy:"
  echo "note:   sudo systemctl enable --now jetscope-web.service"
  echo "note: re-run this script after the first deploy to enable ${TIMERS[1]}"
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
# jetscope-web.service points at /opt/jetscope/node_modules/.bin/next, which
# only exists after the first deploy. Verifying it before that fails with
# "not executable"; skip only that unit, install it as usual.
if [[ -x /opt/jetscope/node_modules/.bin/next ]]; then
  verify_web=1
else
  verify_web=0
  echo "warn: jetscope-web.service not verified (next not deployed yet)"
fi
verify_paths=()
for name in "${units[@]}"; do
  if [[ "$name" == "jetscope-web.service" && "$verify_web" -eq 0 ]]; then
    continue
  fi
  case "$name" in
    *@.service)
      # systemd-analyze cannot verify a template file under its literal name;
      # verify a throwaway instance instead. The instance is never installed.
      instance="${name%@.service}@test.service"
      cp "$stage/$name" "$stage/$instance"
      sudo systemd-analyze verify "$stage/$instance" \
        || abort "systemd-analyze verify failed for $name; nothing was installed"
      rm -f "$stage/$instance"
      echo "ok: systemd-analyze verify passed for $name (as $instance)"
      ;;
    *)
      verify_paths+=("$stage/$name")
      ;;
  esac
done
if (( ${#verify_paths[@]} > 0 )); then
  sudo systemd-analyze verify "${verify_paths[@]}" \
    || abort "systemd-analyze verify failed; nothing was installed"
  echo "ok: systemd-analyze verify passed"
fi

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

echo "==> enable timers"
sudo systemctl enable --now jetscope-sqlite-backup.timer \
  || abort "could not enable jetscope-sqlite-backup.timer"
echo "ok: jetscope-sqlite-backup.timer enabled"

# Enabling the health-check timer before the first deploy would fire a failure
# alert for a service that is not running yet. It stays disabled until a second
# run of this script sees jetscope-web.service active.
if systemctl is-active --quiet jetscope-web.service; then
  sudo systemctl enable --now jetscope-health-check.timer \
    || abort "could not enable jetscope-health-check.timer"
  echo "ok: jetscope-health-check.timer enabled"
else
  echo "note: jetscope-health-check.timer not enabled yet; after the first deploy run: bash scripts/oci-a1/install-units.sh"
fi

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
