#!/usr/bin/env bash
# Seed oci-a1 with the configuration and SQLite snapshot that live on usa-vps.
#
# Run this from the MacBook. It streams secrets from usa-vps through this
# process into oci-a1 over SSH. File contents are never printed, logged, or
# written to local disk; only line counts, byte sizes and the first 8 hex
# characters of a sha256 are shown.
#
# Usage:
#   bash scripts/oci-a1/seed.sh                       # preflight + apply
#   bash scripts/oci-a1/seed.sh --dry-run             # print the plan; no SSH, no network
#   bash scripts/oci-a1/seed.sh --rotate-admin-token  # also rotate JETSCOPE_ADMIN_TOKEN
#   bash scripts/oci-a1/seed.sh --force-db            # replace a non-empty market.db on oci-a1
#
# What it does (every step is idempotent):
#   1. read-only preflight: both hosts reachable, usa files and oci sqlite3 present;
#   2. chmod 600 on usa's .env and apps/api/.env.api-keys (owners unchanged);
#   3. stream both env files to /opt/jetscope on oci-a1 (mode 600) and make the
#      oci .env carry JETSCOPE_API_BIND=<tailnet IP> (replace, else append);
#   4. --rotate-admin-token: openssl rand -hex 32 on oci-a1, atomically replace
#      JETSCOPE_ADMIN_TOKEN= in both .env files, compare length and sha prefix;
#   5. online sqlite3 .backup on usa-vps -> stream to oci-a1 -> integrity_check
#      -> compare per-table row counts -> keep or replace the existing market.db;
#   6. list (names only) the third-party keys that should be rotated.
#
# Environment:
#   JETSCOPE_OCI_HOST  SSH host for oci-a1       (default: oci-a1-ts)
#   JETSCOPE_OCI_IP    oci-a1 tailnet IP         (default: 100.81.227.79)
#   JETSCOPE_USA_HOST  usa-vps SSH host, standby (default: usa-vps)
#
# --dry-run never opens an SSH connection and never touches the network.
set -Eeuo pipefail

OCI="${JETSCOPE_OCI_HOST:-oci-a1-ts}"
OCI_IP="${JETSCOPE_OCI_IP:-100.81.227.79}"
USA="${JETSCOPE_USA_HOST:-usa-vps}"

USA_ROOT=/opt/jetscope
OCI_ROOT=/opt/jetscope
USA_ENV="$USA_ROOT/.env"
USA_KEYS="$USA_ROOT/apps/api/.env.api-keys"
USA_DB="$USA_ROOT/data/market.db"
OCI_ENV="$OCI_ROOT/.env"
OCI_KEYS="$OCI_ROOT/apps/api/.env.api-keys"
OCI_DB="$OCI_ROOT/data/market.db"
OCI_INCOMING="$OCI_ROOT/data/.market.db.incoming"

DRY_RUN=0
ROTATE=0
FORCE_DB=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --rotate-admin-token) ROTATE=1 ;;
    --force-db) FORCE_DB=1 ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> DRY-RUN: no SSH, no network, no local or remote changes"
  echo "hosts: usa=$USA oci=$OCI ($OCI_IP)"
  echo "flags: rotate_admin_token=$ROTATE force_db=$FORCE_DB"
  echo "==> 1/6 preflight (read-only)"
  echo "would: ssh -o BatchMode=yes $USA -> check $USA_ENV, $USA_KEYS, $USA_DB exist"
  echo "would: ssh -o BatchMode=yes $OCI -> check $OCI_ROOT exists, is writable, sqlite3 is on PATH"
  echo "would: abort on the first missing prerequisite"
  echo "==> 2/6 usa permissions"
  echo "would: on $USA: chmod 600 $USA_ENV $USA_KEYS (owners unchanged)"
  echo "would: print mode and owner before and after each chmod"
  echo "==> 3/6 env files -> oci-a1"
  echo "would: ssh $USA cat $USA_ENV | ssh $OCI 'mkdir -p ... && install -m 600 /dev/stdin <tmp> && mv <tmp> $OCI_ENV'"
  echo "would: verify the copied file's sha256 against the source before mv"
  echo "would: on $OCI: replace or append JETSCOPE_API_BIND=$OCI_IP in $OCI_ENV (mode 600)"
  echo "would: ssh $USA cat $USA_KEYS | ssh $OCI 'mkdir -p ... && install -m 600 /dev/stdin <tmp> && mv <tmp> $OCI_KEYS'"
  echo "would: print line count and sha256 prefix for both oci files"
  if [[ "$ROTATE" -eq 1 ]]; then
    echo "==> 4/6 rotate JETSCOPE_ADMIN_TOKEN"
    echo "would: on $OCI: openssl rand -hex 32, atomically replace JETSCOPE_ADMIN_TOKEN= in $OCI_ENV (mode 600)"
    echo "would: ssh $OCI 'cat <token temp>' | ssh $USA 'atomically replace JETSCOPE_ADMIN_TOKEN= in $USA_ENV (mode 600)'"
    echo "would: print both token lengths and sha256 prefixes, assert they match"
    echo "would: note that the usa api needs 'docker compose -f docker-compose.prod.yml up -d api' and oci takes effect at deploy"
  else
    echo "==> 4/6 rotate JETSCOPE_ADMIN_TOKEN: skipped (--rotate-admin-token not given)"
  fi
  echo "==> 5/6 market.db snapshot"
  echo "would: on $USA: sqlite3 $USA_DB '.backup /tmp/<random>.db'"
  echo "would: ssh $USA cat <snapshot> | ssh $OCI 'cat > $OCI_INCOMING'"
  echo "would: on $OCI: PRAGMA integrity_check must return ok"
  echo "would: list every table from sqlite_master on both the usa snapshot and the oci copy, count(*) each, abort on any difference"
  if [[ "$FORCE_DB" -eq 1 ]]; then
    echo "would: --force-db: if $OCI_DB is non-empty, rename it to $OCI_DB.pre-seed-<UTC timestamp>"
  else
    echo "would: if $OCI_DB is non-empty, abort and ask for --force-db (old db is never overwritten silently)"
  fi
  echo "would: on $OCI: mv $OCI_INCOMING $OCI_DB, mode 640, owner ubuntu:ubuntu"
  echo "would: remove the usa snapshot and $OCI_INCOMING"
  echo "==> 6/6 third-party keys"
  echo "would: read key names from $OCI_KEYS and list only those containing KEY, TOKEN or SECRET (no values)"
  exit 0
fi

abort() {
  echo "ABORT: $*" >&2
  exit 1
}

ssh_run() {
  local host=$1
  shift
  ssh -o BatchMode=yes -o ConnectTimeout=12 "$host" "$@"
}

USA_DUMP=""
TOKEN_FILE=""
cleanup() {
  local rc=$?
  if [[ -n "$TOKEN_FILE" ]]; then
    ssh_run "$OCI" "rm -f $(printf %q "$TOKEN_FILE")" >/dev/null 2>&1 || true
    TOKEN_FILE=""
  fi
  if [[ -n "$USA_DUMP" ]]; then
    ssh_run "$USA" "rm -f $(printf %q "$USA_DUMP")" >/dev/null 2>&1 || true
    USA_DUMP=""
  fi
  if [[ -n "${OCI_INCOMING_CREATED:-}" ]]; then
    ssh_run "$OCI" "rm -f $(printf %q "$OCI_INCOMING")" >/dev/null 2>&1 || true
    OCI_INCOMING_CREATED=""
  fi
  exit "$rc"
}
trap cleanup EXIT

echo "==> 1/6 preflight (read-only)"
ssh_run "$USA" true || abort "cannot ssh to $USA"
echo "ok: ssh $USA"
ssh_run "$OCI" true || abort "cannot ssh to $OCI"
echo "ok: ssh $OCI"

usa_problem=$(ssh_run "$USA" bash -s -- "$USA_ENV" "$USA_KEYS" "$USA_DB" <<'REMOTE'
set -euo pipefail
cd /
for f in "$@"; do
  [[ -e "$f" ]] || echo "missing $f"
done
REMOTE
) || abort "preflight on $USA failed"
[[ -z "$usa_problem" ]] || abort "$USA: $usa_problem"
echo "ok: usa has $USA_ENV, $USA_KEYS, $USA_DB"

oci_problem=$(ssh_run "$OCI" bash -s -- "$OCI_ROOT" <<'REMOTE'
set -euo pipefail
cd /
root=$1
[[ -d "$root" ]] || echo "missing $root"
[[ -w "$root" ]] || echo "$root is not writable by $(id -un)"
command -v sqlite3 >/dev/null 2>&1 || echo "sqlite3 not found"
REMOTE
) || abort "preflight on $OCI failed"
[[ -z "$oci_problem" ]] || abort "$OCI: $oci_problem"
echo "ok: oci has writable $OCI_ROOT and sqlite3"

echo "==> 2/6 usa env permissions"
ssh_run "$USA" bash -s -- "$USA_ENV" "$USA_KEYS" <<'REMOTE'
set -euo pipefail
cd /
for f in "$@"; do
  before=$(stat -c '%a %U:%G' "$f")
  chmod 600 "$f"
  after=$(stat -c '%a %U:%G' "$f")
  printf 'ok: %s %s -> %s\n' "$f" "$before" "$after"
done
REMOTE

transfer_file() {
  local src=$1
  local dest=$2
  local src_hash got_hash tmp
  src_hash=$(ssh_run "$USA" "sha256sum $(printf %q "$src")" | awk '{print $1}')
  [[ -n "$src_hash" ]] || abort "could not hash $src on $USA"

  tmp=$(ssh_run "$USA" "cat $(printf %q "$src")" \
    | ssh_run "$OCI" "cd / && mkdir -p $(printf %q "$(dirname "$dest")") && tmp=\$(mktemp $(printf %q "$dest").seed.XXXXXX) && install -m 600 /dev/stdin \"\$tmp\" && printf '%s\\n' \"\$tmp\"") \
    || abort "transfer failed: $src -> $dest"

  got_hash=$(ssh_run "$OCI" "sha256sum $(printf %q "$tmp")" | awk '{print $1}')
  if [[ "$got_hash" != "$src_hash" ]]; then
    ssh_run "$OCI" "rm -f $(printf %q "$tmp")" || true
    abort "sha256 mismatch while copying $src to $dest"
  fi
  ssh_run "$OCI" "mv $(printf %q "$tmp") $(printf %q "$dest")" \
    || abort "could not install $dest on $OCI"
}

report_file() {
  local path=$1
  local lines hash
  lines=$(ssh_run "$OCI" "wc -l < $(printf %q "$path")" | tr -d '[:space:]')
  hash=$(ssh_run "$OCI" "sha256sum $(printf %q "$path")" | cut -c1-8)
  printf 'ok: %s lines=%s sha256=%s...\n' "$path" "$lines" "$hash"
}

echo "==> 3/6 env files -> $OCI"
transfer_file "$USA_ENV" "$OCI_ENV"
ssh_run "$OCI" bash -s -- "$OCI_ENV" "$OCI_IP" <<'REMOTE'
set -euo pipefail
cd /
env=$1 ip=$2
tmp=$(mktemp "$env.bind.XXXXXX")
awk -v ip="$ip" '
  /^JETSCOPE_API_BIND=/ { print "JETSCOPE_API_BIND=" ip; found=1; next }
  { print }
  END { if (!found) print "JETSCOPE_API_BIND=" ip }
' "$env" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$env"
printf 'ok: %s JETSCOPE_API_BIND -> %s\n' "$env" "$ip"
REMOTE
report_file "$OCI_ENV"

transfer_file "$USA_KEYS" "$OCI_KEYS"
report_file "$OCI_KEYS"

if [[ "$ROTATE" -eq 1 ]]; then
  echo "==> 4/6 rotate JETSCOPE_ADMIN_TOKEN"
  rotate_out=$(ssh_run "$OCI" bash -s -- "$OCI_ENV" <<'REMOTE'
set -euo pipefail
cd /
env=$1
command -v openssl >/dev/null 2>&1 || { echo "ABORT: openssl not found on $(id -un)@$(hostname)" >&2; exit 1; }
umask 077
tok=$(openssl rand -hex 32)
tokfile=$(mktemp /opt/jetscope/.admin-token.seed.XXXXXX)
printf '%s' "$tok" > "$tokfile"
tmp=$(mktemp "$env.rotate.XXXXXX")
T="$tok" awk '
  /^JETSCOPE_ADMIN_TOKEN=/ { print "JETSCOPE_ADMIN_TOKEN=" ENVIRON["T"]; found=1; next }
  { print }
  END { if (!found) print "JETSCOPE_ADMIN_TOKEN=" ENVIRON["T"] }
' "$env" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$env"
printf 'token-file=%s\n' "$tokfile"
printf 'oci length=%s sha256=%s\n' "${#tok}" "$(printf '%s' "$tok" | sha256sum | cut -c1-8)"
REMOTE
) || abort "token rotation failed on $OCI"
  TOKEN_FILE=$(printf '%s\n' "$rotate_out" | sed -n 's/^token-file=//p')
  [[ -n "$TOKEN_FILE" ]] || abort "$OCI did not report the token temp file"

  USA_ROTATE=$(cat <<'REMOTE'
set -euo pipefail
cd /
env=$1
token=$(cat)
[[ "$token" =~ ^[0-9a-f]{64}$ ]] || { echo "ABORT: token on stdin is not 64 lowercase hex chars" >&2; exit 1; }
tmp=$(mktemp "$env.rotate.XXXXXX")
T="$token" awk '
  /^JETSCOPE_ADMIN_TOKEN=/ { print "JETSCOPE_ADMIN_TOKEN=" ENVIRON["T"]; found=1; next }
  { print }
  END { if (!found) print "JETSCOPE_ADMIN_TOKEN=" ENVIRON["T"] }
' "$env" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$env"
printf 'usa length=%s sha256=%s\n' "${#token}" "$(printf '%s' "$token" | sha256sum | cut -c1-8)"
REMOTE
)
  usa_out=$(ssh_run "$OCI" "cat $(printf %q "$TOKEN_FILE")" \
    | ssh_run "$USA" "bash -c $(printf '%q' "$USA_ROTATE") seed $(printf '%q' "$USA_ENV")") \
    || abort "could not write the new token on $USA"

  ssh_run "$OCI" "rm -f $(printf %q "$TOKEN_FILE")" || true
  TOKEN_FILE=""

  oci_len=$(printf '%s\n' "$rotate_out" | sed -n 's/^oci length=\([0-9]*\) sha256=.*/\1/p')
  oci_hash=$(printf '%s\n' "$rotate_out" | sed -n 's/^oci length=[0-9]* sha256=\([0-9a-f]*\)$/\1/p')
  usa_len=$(printf '%s\n' "$usa_out" | sed -n 's/^usa length=\([0-9]*\) sha256=.*/\1/p')
  usa_hash=$(printf '%s\n' "$usa_out" | sed -n 's/^usa length=[0-9]* sha256=\([0-9a-f]*\)$/\1/p')
  printf 'ok: oci token length=%s sha256=%s...\n' "$oci_len" "$oci_hash"
  printf 'ok: usa token length=%s sha256=%s...\n' "$usa_len" "$usa_hash"
  [[ -n "$oci_len" && "$oci_len" == "$usa_len" && -n "$oci_hash" && "$oci_hash" == "$usa_hash" ]] \
    || abort "token length or sha256 prefix differs between hosts"
  echo "ok: token length and sha256 prefix match on both hosts"
  echo "note: restart the usa api to load the new token:"
  echo "note:   ssh $USA 'cd /opt/jetscope && docker compose -f docker-compose.prod.yml up -d api'"
  echo "note: oci-a1 picks it up at deploy time; update any other client that holds the old token."
else
  echo "==> 4/6 rotate JETSCOPE_ADMIN_TOKEN: skipped (--rotate-admin-token not given)"
fi

echo "==> 5/6 market.db snapshot"
USA_DUMP="/tmp/jetscope-seed.$$.$RANDOM.db"
ssh_run "$USA" bash -s -- "$USA_DB" "$USA_DUMP" <<'REMOTE'
set -euo pipefail
cd /
db=$1 dump=$2
[[ -f "$db" ]] || { echo "ABORT: $db not found" >&2; exit 1; }
rm -f "$dump"
sqlite3 "$db" ".backup '$dump'" || { echo "ABORT: sqlite3 .backup failed" >&2; exit 1; }
chmod 600 "$dump"
printf 'ok: snapshot %s bytes\n' "$(stat -c %s "$dump")"
REMOTE

echo " -> streaming snapshot to $OCI"
OCI_INCOMING_CREATED=1
ssh_run "$USA" "cat $(printf %q "$USA_DUMP")" \
  | ssh_run "$OCI" "cd / && umask 077 && cat > $(printf %q "$OCI_INCOMING")" \
  || abort "snapshot transfer failed"
ssh_run "$OCI" "chmod 640 $(printf %q "$OCI_INCOMING")" || abort "could not chmod $OCI_INCOMING"

integrity=$(ssh_run "$OCI" "sqlite3 -readonly $(printf %q "$OCI_INCOMING") 'PRAGMA integrity_check;'") \
  || abort "could not run PRAGMA integrity_check on $OCI"
[[ "$integrity" == "ok" ]] || abort "PRAGMA integrity_check on $OCI returned: $integrity"
echo "ok: PRAGMA integrity_check: ok"

table_counts() {
  local host=$1
  local db=$2
  ssh_run "$host" bash -s -- "$db" <<'REMOTE'
set -euo pipefail
cd /
db=$1
tables=$(sqlite3 -readonly "$db" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
[[ -n "$tables" ]] || { echo "ABORT: no tables in $db" >&2; exit 1; }
while IFS= read -r t; do
  q=${t//\"/\"\"}
  n=$(sqlite3 -readonly "$db" "SELECT count(*) FROM \"$q\"")
  printf '%s\t%s\n' "$t" "$n"
done <<< "$tables"
REMOTE
}

usa_counts=$(table_counts "$USA" "$USA_DUMP")
oci_counts=$(table_counts "$OCI" "$OCI_INCOMING")
if [[ "$usa_counts" != "$oci_counts" ]]; then
  printf 'usa snapshot:\n%s\noci copy:\n%s\n' "$usa_counts" "$oci_counts" >&2
  abort "row counts differ between the usa snapshot and the oci copy"
fi
echo "ok: row counts match for $(printf '%s\n' "$usa_counts" | wc -l | tr -d '[:space:]') tables"

existing_bytes=0
if ssh_run "$OCI" "test -e $(printf %q "$OCI_DB")"; then
  existing_bytes=$(ssh_run "$OCI" "stat -c %s $(printf %q "$OCI_DB")")
fi
if (( existing_bytes > 0 )); then
  if [[ "$FORCE_DB" -eq 0 ]]; then
    abort "$OCI already has a non-empty $OCI_DB ($existing_bytes bytes); rerun with --force-db to replace it"
  fi
  old_name=$(ssh_run "$OCI" bash -s -- "$OCI_DB" <<'REMOTE'
set -euo pipefail
cd /
db=$1
ts=$(date -u +%Y%m%dT%H%M%SZ)
dest="$db.pre-seed-$ts"
i=1
while [[ -e "$dest" ]]; do
  dest="$db.pre-seed-$ts.$i"
  i=$((i + 1))
done
mv "$db" "$dest"
printf '%s\n' "$dest"
REMOTE
)
  echo "ok: previous db kept at $old_name"
fi

ssh_run "$OCI" bash -s -- "$OCI_INCOMING" "$OCI_DB" <<'REMOTE'
set -euo pipefail
cd /
incoming=$1 db=$2
mv "$incoming" "$db"
chmod 640 "$db"
chown ubuntu:ubuntu "$db"
printf 'ok: %s %s bytes %s\n' "$db" "$(stat -c %s "$db")" "$(stat -c '%U:%G %a' "$db")"
REMOTE
OCI_INCOMING_CREATED=""

echo "==> 6/6 third-party keys: rotate at the provider (names only)"
key_names=$(ssh_run "$OCI" bash -s -- "$OCI_KEYS" <<'REMOTE'
set -euo pipefail
cd /
f=$1
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/ && toupper($1) ~ /(KEY|TOKEN|SECRET)/ { print " - " $1 }' "$f"
REMOTE
)
if [[ -n "$key_names" ]]; then
  printf '%s\n' "$key_names"
else
  echo " - none matched KEY/TOKEN/SECRET"
fi
