#!/usr/bin/env bash
# Cut JetScope over from usa-vps to oci-a1, or roll it back.
#
# Run this from the MacBook. Every remote change is made over SSH; secrets and
# database contents are never printed (only byte sizes, row counts and sha256
# prefixes). Each phase logs START/DONE/FAIL with a UTC timestamp under
# /var/lib/jetscope-cutover/<UTC ts>/ on usa-vps, next to a manifest of every
# backup path and its sha256. If any phase fails the script stops, prints the
# current state and the recovery commands, and exits 1. It never rolls back on
# its own (RFC review A3); the one exception is a failed `nginx -t`, where the
# site symlink is restored immediately so the edge stays serving.
#
# Usage:
#   bash scripts/oci-a1/cutover.sh              # cut over to oci-a1
#   bash scripts/oci-a1/cutover.sh --rollback   # roll back to usa-vps
#   bash scripts/oci-a1/cutover.sh --resume-smoke  # cutover phases 5-6 only
#   bash scripts/oci-a1/cutover.sh --dry-run    # print the plan for the above
#   bash scripts/oci-a1/cutover.sh --rollback --dry-run
#   bash scripts/oci-a1/cutover.sh --resume-smoke --dry-run
#   bash scripts/oci-a1/cutover.sh --help
#
# Cutover phases (all idempotent):
#   0. read-only preflight: oci-a1 health, /sources page-as-of, tailscale
#      serve/funnel empty, JETSCOPE_API_BIND in .env, usa nginx -t, usa can
#      reach oci-a1, usa is not already cut over;
#   1. back up usa nginx to /root/nginx-backup-jetscope-<ts> (manifest+sha256);
#   2. enable the maintenance gate: install the snippet, derive
#      sites-available/jetscope.maint from the live file with the include
#      inserted, point sites-enabled/jetscope at it, reload, expect POST 503;
#   3. final DB sync (same mechanics as seed.sh): usa sqlite3 .backup -> oci-a1,
#      integrity_check + per-table row counts, stop oci api (a hot
#      market.db-journal aborts), keep the old DB as market.db.pre-cutover-<ts>,
#      swap, start, wait up to 60s for /v1/health;
#   4. install conf.d/jetscope-upstream.conf and sites-available/jetscope.oci-a1,
#      atomically switch the symlink, nginx -t (restore .maint on failure),
#      reload;
#   5. remove the maintenance snippet and reload;
#   6. public smoke from this Mac (cache-busted, a Cloudflare HIT fails): 200 +
#      X-JetScope-Served-By: oci-a1 on /v1/health and /sources, page-as-of on
#      /sources, 401 on /admin without credentials;
#   7. print the summary and the rollback command, then remove jetscope.maint.
#
# --resume-smoke runs only phases 5 and 6 (remove the maintenance snippet if it
# is still there, then the public smoke). Use it when the edge is already on
# oci-a1 and only phase 5 or a false-negative phase 6 failed.
#
# Rollback phases:
#   0. read-only preflight: usa has the original site file and is not already
#      back on it;
#   1. enable the maintenance gate and expect POST 503;
#   2. stop the usa api with docker-compose v1;
#   3. oci sqlite3 .backup -> usa, integrity_check + row counts, stop is already
#      done (a hot market.db-journal aborts), keep the old DB as
#      market.db.pre-rollback-<ts>, swap, start the api,
#      wait up to 60s for 127.0.0.1:8000/v1/health;
#   4. switch the symlink back to the original site, reload, remove the upstream
#      file only after nginx -t still passes;
#   5. remove the maintenance snippet, reload, public smoke (no served-by or usa).
#
# Environment:
#   JETSCOPE_USA_HOST     usa-vps SSH host, run as root (default: usa-vps)
#   JETSCOPE_OCI_HOST     oci-a1 SSH host, ubuntu with sudo (default: oci-a1-ts)
#   JETSCOPE_OCI_IP       oci-a1 tailnet IPv4 (default: 100.81.227.79)
#   JETSCOPE_PUBLIC_HOST  public hostname for the smoke test
#                         (default: saf.meichen.beauty)
#
# --dry-run never opens an SSH connection and never touches the network.
set -Eeuo pipefail

OCI="${JETSCOPE_OCI_HOST:-oci-a1-ts}"
OCI_IP="${JETSCOPE_OCI_IP:-100.81.227.79}"
USA="${JETSCOPE_USA_HOST:-usa-vps}"
PUBLIC_HOST="${JETSCOPE_PUBLIC_HOST:-saf.meichen.beauty}"

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
NGINX_SRC="$REPO_ROOT/infra/server/oci-a1/nginx"
TPL_MAINT="$NGINX_SRC/jetscope-maintenance.conf"
TPL_UPSTREAM="$NGINX_SRC/jetscope-upstream.conf"
TPL_SITE="$NGINX_SRC/jetscope-site.conf"

NGINX_AVAIL=/etc/nginx/sites-available
NGINX_ENABLED=/etc/nginx/sites-enabled
SITE_ORIG="$NGINX_AVAIL/jetscope"
SITE_MAINT="$NGINX_AVAIL/jetscope.maint"
SITE_NEW="$NGINX_AVAIL/jetscope.oci-a1"
SITE_LINK="$NGINX_ENABLED/jetscope"
UPSTREAM_CONF=/etc/nginx/conf.d/jetscope-upstream.conf
MAINT_SNIPPET=/etc/nginx/snippets/jetscope-maintenance.conf

USA_ROOT=/opt/jetscope
USA_DB="$USA_ROOT/data/market.db"
USA_COMPOSE="$USA_ROOT/docker-compose.prod.yml"
OCI_ROOT=/opt/jetscope
OCI_DB="$OCI_ROOT/data/market.db"

MODE=cutover
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --rollback) MODE=rollback ;;
    --resume-smoke) MODE=resume ;;
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

if [[ ! "$OCI_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "ABORT: JETSCOPE_OCI_IP must be an IPv4 address, got: $OCI_IP" >&2
  exit 1
fi

if (( DRY_RUN )); then
  echo "==> DRY-RUN: no SSH, no network, no remote changes"
  echo "mode=$MODE usa=$USA oci=$OCI ($OCI_IP) public=$PUBLIC_HOST"
  echo "templates: $NGINX_SRC"
  echo "log on $USA: /var/lib/jetscope-cutover/<UTC ts>/{phases.log,manifest}"
  if [[ "$MODE" == resume ]]; then
    cat <<EOF
==> 5/7 lift the maintenance gate
would: rm $MAINT_SNIPPET if present; nginx -t && systemctl reload nginx
==> 6/7 public smoke from this Mac
would: same checks as cutover phase 6 (cache-busted, served-by oci-a1 on /v1/health and /sources)
EOF
  elif [[ "$MODE" == cutover ]]; then
    cat <<EOF
==> 0/7 preflight (read-only)
would: ssh $USA true and ssh $OCI true
would: on $OCI: curl -fsS http://$OCI_IP:8000/v1/health
would: on $OCI: curl -fsS http://$OCI_IP:3000/sources contains data-testid="page-as-of"
would: on $OCI: sudo tailscale serve status / funnel status empty or "No serve config"
would: on $OCI: $OCI_ROOT/.env exists and contains JETSCOPE_API_BIND=
would: on $USA: nginx -t
would: on $USA: curl -fsS http://$OCI_IP:8000/v1/health
would: on $USA: $SITE_ORIG exists and $SITE_LINK does not already point at $SITE_NEW
==> 1/7 backup usa nginx
would: mkdir /root/nginx-backup-jetscope-<ts>/{sites-available,conf.d,snippets}
would: copy $SITE_ORIG, /etc/nginx/conf.d/ and /etc/nginx/snippets/ into it
would: write every copied file and its sha256 into the manifest
==> 2/7 maintenance gate
would: install $TPL_MAINT as $MAINT_SNIPPET (644)
would: copy $SITE_ORIG to $SITE_MAINT and insert
would:   include /etc/nginx/snippets/jetscope-maintenance*.conf;
would:   before the first location block, then atomically point $SITE_LINK at it
would: nginx -t && systemctl reload nginx (restore the symlink if nginx -t fails)
would: on $USA: curl -k --resolve $PUBLIC_HOST:443:127.0.0.1 -X POST
would:   https://$PUBLIC_HOST/v1/scenarios returns 503
==> 3/7 final market.db sync -> $OCI
would: on $USA: mktemp /root/jetscope-cutover.XXXXXX.db, then sqlite3 $USA_DB ".backup" into it
would: stream it to a mktemp file $OCI:$OCI_ROOT/data/.cutover-snap.XXXXXX
would: on $OCI: PRAGMA integrity_check must return ok
would: compare per-table count(*) of the usa snapshot and the oci copy
would: on $OCI: docker stop jetscope-api, assert State.Running is false
would: abort if $OCI_DB-journal exists and is non-empty (hot journal)
would: rename $OCI_DB and any -wal/-shm/-journal to $OCI_DB.pre-cutover-<ts>
would: install the new db (640 ubuntu:ubuntu), docker start jetscope-api
would: wait up to 60s for http://$OCI_IP:8000/v1/health
would: rm -f the snapshot files on $USA and $OCI
==> 4/7 upstream and site
would: render $TPL_UPSTREAM (__OCI_IP_RE__ -> $(printf '%s' "$OCI_IP" | sed 's/\./\\./g'), __OCI_IP__ -> $OCI_IP)
would: install it as $UPSTREAM_CONF
would: render $TPL_SITE and install it as $SITE_NEW
would: atomically point $SITE_LINK at $SITE_NEW
would: nginx -t; on failure restore $SITE_MAINT, remove $UPSTREAM_CONF, nginx -t
would: systemctl reload nginx
==> 5/7 lift the maintenance gate
would: rm $MAINT_SNIPPET; nginx -t && systemctl reload nginx
==> 6/7 public smoke from this Mac
would: GET https://$PUBLIC_HOST/v1/health?cb=<rand> -> 200 and X-JetScope-Served-By: oci-a1
would: GET https://$PUBLIC_HOST/sources?cb=<rand> -> 200, X-JetScope-Served-By: oci-a1,
would:   contains data-testid="page-as-of"
would: any cf-cache-status: HIT fails the smoke
would: GET https://$PUBLIC_HOST/admin without credentials -> 401
==> 7/7 summary
would: print the summary and "bash scripts/oci-a1/cutover.sh --rollback"
would: rm $SITE_MAINT
EOF
  else
    cat <<EOF
==> 0/5 preflight (read-only)
would: ssh $USA true and ssh $OCI true
would: on $USA: $SITE_ORIG exists, nginx -t passes, $SITE_LINK points at $SITE_NEW
would:   (refuse if it is still on the original site or never reached the cutover site)
==> 1/5 maintenance gate
would: install $TPL_MAINT as $MAINT_SNIPPET (644) and reload
would: on $USA: POST https://$PUBLIC_HOST/v1/scenarios via 127.0.0.1 returns 503
==> 2/5 stop the usa api
would: on $USA: cd /opt/jetscope && docker-compose -f $USA_COMPOSE stop api
would: assert docker inspect -f '{{.State.Running}}' jetscope-api is false
==> 3/5 market.db sync -> $USA
would: on $OCI: mktemp $OCI_ROOT/data/.cutover-snap.XXXXXX, then sqlite3 $OCI_DB ".backup" into it
would: stream it to a mktemp file $USA:$USA_ROOT/data/.cutover-snap.XXXXXX
would: on $USA: PRAGMA integrity_check must return ok
would: compare per-table count(*) of the oci snapshot and the usa copy
would: abort if $USA_DB-journal exists and is non-empty (hot journal)
would: rename $USA_DB and any -wal/-shm/-journal to $USA_DB.pre-rollback-<ts>
would: install the new db (640), docker-compose -f $USA_COMPOSE start api
would: wait up to 60s for http://127.0.0.1:8000/v1/health
would: rm -f the snapshot files on $OCI and $USA
==> 4/5 restore the original site
would: atomically point $SITE_LINK at $SITE_ORIG; nginx -t, restore on failure
would: systemctl reload nginx
would: move $UPSTREAM_CONF aside, nginx -t, delete it only if the test passes,
would: otherwise put it back; systemctl reload nginx
==> 5/5 lift the gate and smoke
would: rm $MAINT_SNIPPET; nginx -t && systemctl reload nginx
would: GET https://$PUBLIC_HOST/v1/health?cb=<rand> -> 200, no cf-cache-status HIT
would: X-JetScope-Served-By must be absent or usa (never oci-a1)
EOF
  fi
  exit 0
fi

for tpl in "$TPL_MAINT" "$TPL_UPSTREAM" "$TPL_SITE"; do
  [[ -f "$tpl" ]] || { echo "ABORT: missing template $tpl" >&2; exit 1; }
done

TS=$(date -u +%Y%m%dT%H%M%SZ)
LOG_DIR=""
PHASES=""
MANIFEST=""
STATE="no changes made"
RECOVERY="  nothing to undo; inspect both hosts by hand"
PHASE=startup
FAILED=0

USA_DUMP=""
USA_INCOMING=""
OCI_DUMP=""
OCI_INCOMING=""

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

usa_run() { ssh -o BatchMode=yes -o ConnectTimeout=12 "$USA" "cd / && $*"; }
oci_run() { ssh -o BatchMode=yes -o ConnectTimeout=12 "$OCI" "cd / && $*"; }
usa_bash() { local a; a=$(printf ' %q' "$@"); usa_run "bash -s --$a"; }
oci_bash() { local a; a=$(printf ' %q' "$@"); oci_run "bash -s --$a"; }

# Command run in the remote shell that moves $1 (pre-swap backup) and its
# -wal/-shm/-journal companions back over $2 (the live db).
restore_db_cmd() {
  printf 'for s in "" -wal -shm -journal; do [ -e %s$s ] && mv -f %s$s %s$s; done' "$1" "$1" "$2"
}

phase_start() {
  PHASE=$1
  usa_run "printf '%s START %s\n' '$(now)' '$PHASE' >> $(printf %q "$PHASES")"
  printf '==> %s\n' "$PHASE"
}

phase_done() {
  usa_run "printf '%s DONE %s\n' '$(now)' '$PHASE' >> $(printf %q "$PHASES")"
  printf 'ok: %s\n' "$PHASE"
}

phase_fail() {
  local msg=$1
  if [[ -n "$PHASES" ]]; then
    usa_run "printf '%s FAIL %s: %s\n' '$(now)' '${PHASE:-unknown}' $(printf %q "$msg") >> $(printf %q "$PHASES")" || true
  fi
}

fail() {
  local msg=$1
  trap - ERR
  FAILED=1
  phase_fail "$msg"
  printf 'FAIL: %s\n' "$msg" >&2
  printf 'current state: %s\n' "$STATE" >&2
  printf 'recovery:\n' >&2
  printf '%s\n' "$RECOVERY" >&2
  if [[ -n "$PHASES" ]]; then
    printf 'log: %s:%s\n' "$USA" "$PHASES" >&2
  fi
  exit 1
}

on_err() {
  local rc=$?
  local line=$1
  if [[ "$FAILED" -eq 1 ]]; then
    exit "$rc"
  fi
  fail "command failed at line $line (exit $rc)"
}

cleanup() {
  local rc=$?
  trap - EXIT
  if [[ -n "$USA_DUMP" ]]; then
    usa_run "rm -f $(printf %q "$USA_DUMP")" >/dev/null 2>&1 || true
  fi
  if [[ -n "$USA_INCOMING" ]]; then
    usa_run "rm -f $(printf %q "$USA_INCOMING")" >/dev/null 2>&1 || true
  fi
  if [[ -n "$OCI_DUMP" ]]; then
    oci_run "rm -f $(printf %q "$OCI_DUMP")" >/dev/null 2>&1 || true
  fi
  if [[ -n "$OCI_INCOMING" ]]; then
    oci_run "rm -f $(printf %q "$OCI_INCOMING")" >/dev/null 2>&1 || true
  fi
  exit "$rc"
}

trap 'on_err $LINENO' ERR
trap cleanup EXIT

manifest_add() {
  usa_run "printf '%s  %s\n' $(printf %q "$1") $(printf %q "$2") >> $(printf %q "$MANIFEST")"
}

put_usa() {
  local dest=$1
  local mode=$2
  usa_run "umask 022; t=$(printf %q "$dest").cutover.$$; cat > \"\$t\" && chmod $mode \"\$t\" && mv -f \"\$t\" $(printf %q "$dest")"
}

remote_sha() {
  local run=$1
  local path=$2
  "$run" "sha256sum $(printf %q "$path")" | awk '{print $1}'
}

table_counts() {
  local run=$1
  local db=$2
  "$run" "bash -s -- $(printf %q "$db")" <<'REMOTE'
set -Eeuo pipefail
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

check_ssh() {
  usa_run true || { echo "ABORT: cannot ssh to $USA" >&2; exit 1; }
  oci_run true || { echo "ABORT: cannot ssh to $OCI" >&2; exit 1; }
  printf 'ok: ssh %s and %s\n' "$USA" "$OCI"
}

prepare_log() {
  LOG_DIR="/var/lib/jetscope-cutover/$TS"
  PHASES="$LOG_DIR/phases.log"
  MANIFEST="$LOG_DIR/manifest"
  usa_run "mkdir -p $(printf %q "$LOG_DIR") && touch $(printf %q "$PHASES") $(printf %q "$MANIFEST")"
  printf 'ok: log %s:%s\n' "$USA" "$LOG_DIR"
}

write_maint_snippet() {
  put_usa "$MAINT_SNIPPET" 644 < "$TPL_MAINT"
}

expect_gate_503() {
  local code
  code=$(usa_run "curl -s -o /dev/null -w '%{http_code}' -k --resolve $(printf %q "$PUBLIC_HOST:443:127.0.0.1") -X POST $(printf %q "https://$PUBLIC_HOST/v1/scenarios") --max-time 15") \
    || fail "could not check the maintenance gate on $USA"
  [[ "$code" == 503 ]] || fail "maintenance gate returned $code for POST /v1/scenarios, want 503"
  printf 'ok: POST /v1/scenarios returns 503\n'
}

wait_http() {
  local run=$1
  local url=$2
  local i
  for ((i = 0; i < 30; i++)); do
    if "$run" "curl -fsS --max-time 5 $(printf %q "$url")" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

public_get() {
  curl -sS -i --max-time 30 "https://$PUBLIC_HOST$1"
}

public_status() {
  local resp=$1
  printf '%s\n' "$resp" | awk 'NR==1 {print $2; exit}'
}

public_cb() {
  printf '%s?cb=%s%s' "$1" "$RANDOM" "$RANDOM"
}

public_no_cache_hit() {
  local resp=$1
  local what=$2
  local h
  h=$(public_header "$resp" cf-cache-status)
  [[ "$h" != *[Hh][Ii][Tt]* ]] || fail "public $what was served from the Cloudflare cache ($h); the smoke result is not trustworthy"
}

public_header() {
  local resp=$1
  local name=$2
  printf '%s\n' "$resp" | grep -i "^$name:" | head -n 1 | tr -d '\r' || true
}

lift_gate_cutover() {
  phase_start "5/7-lift-gate"
  STATE="edge on oci-a1; maintenance snippet being removed"
  RECOVERY="  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'
  # then, to re-run only the public smoke: bash scripts/oci-a1/cutover.sh --resume-smoke"
  usa_bash "$MAINT_SNIPPET" <<'REMOTE'
set -Eeuo pipefail
rm -f "$1"
nginx -t
systemctl reload nginx
echo "ok: maintenance gate removed"
REMOTE
  STATE="edge on oci-a1; writes and reads go to oci-a1"
  RECOVERY="  bash scripts/oci-a1/cutover.sh --rollback"
  phase_done
}

smoke_cutover() {
  local health sources status served admin_code
  phase_start "6/7-public-smoke"
  STATE="edge on oci-a1; public smoke in progress"
  RECOVERY="  bash scripts/oci-a1/cutover.sh --resume-smoke   # if the smoke result looks like a false alarm
  bash scripts/oci-a1/cutover.sh --rollback"
  health=$(public_get "$(public_cb /v1/health)") || fail "public GET https://$PUBLIC_HOST/v1/health failed"
  status=$(public_status "$health")
  [[ "$status" == 200 ]] || fail "public /v1/health returned $status, want 200"
  public_no_cache_hit "$health" /v1/health
  printf 'ok: public /v1/health 200\n'
  served=$(public_header "$health" X-JetScope-Served-By)
  [[ "$served" == *"oci-a1"* ]] || fail "public /v1/health X-JetScope-Served-By='$served', want oci-a1"
  printf 'ok: %s\n' "$served"

  sources=$(public_get "$(public_cb /sources)") || fail "public GET https://$PUBLIC_HOST/sources failed"
  status=$(public_status "$sources")
  [[ "$status" == 200 ]] || fail "public /sources returned $status, want 200"
  public_no_cache_hit "$sources" /sources
  served=$(public_header "$sources" X-JetScope-Served-By)
  [[ "$served" == *"oci-a1"* ]] || fail "public /sources X-JetScope-Served-By='$served', want oci-a1"
  printf '%s' "$sources" | grep -q 'data-testid="page-as-of"' \
    || fail "public /sources lacks data-testid=\"page-as-of\""
  printf 'ok: public /sources has page-as-of, %s\n' "$served"

  admin_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "https://$PUBLIC_HOST/admin") \
    || fail "public GET https://$PUBLIC_HOST/admin failed"
  [[ "$admin_code" == 401 ]] || fail "public /admin without credentials returned $admin_code, want 401"
  printf 'ok: public /admin without credentials 401\n'
  phase_done
}

run_resume_smoke() {
  STATE="no changes made"
  RECOVERY="  nothing to undo"
  check_ssh
  cur=$(usa_run "readlink -f $(printf %q "$SITE_LINK")") || fail "could not read $SITE_LINK on $USA"
  [[ "$cur" == "$SITE_NEW" ]] \
    || fail "--resume-smoke needs $SITE_LINK -> $SITE_NEW, found '$cur'; the cutover did not reach the site switch, follow the recovery from that run instead"
  prepare_log
  lift_gate_cutover
  smoke_cutover
  printf '\nresume-smoke complete\n'
  printf '  log: %s:%s\n' "$USA" "$LOG_DIR"
}

run_cutover() {
  STATE="no changes made"
  RECOVERY="  nothing to undo (preflight is read-only)"
  check_ssh
  prepare_log

  phase_start "0/7-preflight"
  oci_bash "$OCI_IP" "$OCI_ROOT" <<'REMOTE'
set -Eeuo pipefail
ip=$1
root=$2
env="$root/.env"
[[ -f "$env" ]] || { echo "missing $env" >&2; exit 1; }
grep -q '^JETSCOPE_API_BIND=' "$env" || { echo "$env has no JETSCOPE_API_BIND=" >&2; exit 1; }
for kind in serve funnel; do
  out="$(sudo tailscale "$kind" status 2>&1 || true)"
  if [[ -n "${out//[[:space:]]/}" && "$out" != *"No serve config"* ]]; then
    echo "tailscale $kind is configured on this host; RFC SEC-02 requires it empty" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
done
curl -fsS --max-time 10 "http://$ip:8000/v1/health" >/dev/null \
  || { echo "GET http://$ip:8000/v1/health failed" >&2; exit 1; }
sources="$(curl -fsS --max-time 10 "http://$ip:3000/sources")" \
  || { echo "GET http://$ip:3000/sources failed" >&2; exit 1; }
printf '%s' "$sources" | grep -q 'data-testid="page-as-of"' \
  || { echo "/sources lacks data-testid=\"page-as-of\"" >&2; exit 1; }
echo "ok: oci-a1 health, sources, serve/funnel, .env"
REMOTE
  usa_bash "$SITE_ORIG" "$SITE_NEW" "$OCI_IP" <<'REMOTE'
set -Eeuo pipefail
orig=$1
new=$2
ip=$3
[[ -f "$orig" ]] || { echo "missing $orig" >&2; exit 1; }
nginx -t >/dev/null
cur="$(readlink -f /etc/nginx/sites-enabled/jetscope || true)"
if [[ "$cur" == "$new" ]]; then
  echo "already cut over to $new; use --rollback, or --resume-smoke if only phase 5 or 6 failed" >&2
  exit 1
fi
curl -fsS --max-time 10 "http://$ip:8000/v1/health" >/dev/null \
  || { echo "usa cannot reach http://$ip:8000/v1/health" >&2; exit 1; }
echo "ok: usa nginx -t, $orig present, oci reachable"
REMOTE
  phase_done

  phase_start "1/7-backup-nginx"
  STATE="nginx backed up; no live change"
  RECOVERY="  nothing to undo (only a backup was written)"
  usa_bash "$TS" "/root/nginx-backup-jetscope-$TS" "$SITE_ORIG" "$MANIFEST" <<'REMOTE'
set -Eeuo pipefail
ts=$1
bk=$2
orig=$3
manifest=$4
mkdir -p "$bk/sites-available" "$bk/conf.d" "$bk/snippets"
cp -a "$orig" "$bk/sites-available/jetscope"
cp -a /etc/nginx/conf.d/. "$bk/conf.d/"
cp -a /etc/nginx/snippets/. "$bk/snippets/"
{
  printf '# nginx backup %s\n' "$ts"
  printf '# backup dir %s\n' "$bk"
  find "$bk" -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 sha256sum
} > "$bk/manifest.sha256"
cat "$bk/manifest.sha256" >> "$manifest"
n=$(find "$bk" -type f ! -name manifest.sha256 | wc -l)
printf 'ok: %s files backed up to %s\n' "$n" "$bk"
REMOTE
  phase_done

  phase_start "2/7-maintenance"
  STATE="edge may be switching to jetscope.maint; writes should return 503"
  RECOVERY="  ssh $USA 'ln -sfn $SITE_ORIG $SITE_LINK.restore && mv -T $SITE_LINK.restore $SITE_LINK'
  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'"
  write_maint_snippet
  usa_bash "$SITE_ORIG" "$SITE_MAINT" "$SITE_LINK" "$TS" <<'REMOTE' || fail "could not enable the maintenance gate (see the remote message above)"
set -Eeuo pipefail
orig=$1
maint=$2
link=$3
ts=$4
tmp="$maint.tmp.$ts"
cp -a "$orig" "$tmp"
if ! grep -q 'jetscope-maintenance\*\.conf' "$tmp"; then
  awk -v inc='    include /etc/nginx/snippets/jetscope-maintenance*.conf;' '
    !done && $0 ~ /^[[:space:]]*location[[:space:]]/ { print inc; done=1 }
    { print }
    END { if (!done) exit 42 }
  ' "$tmp" > "$tmp.new" || { rm -f "$tmp" "$tmp.new"; echo "no location block found in $orig" >&2; exit 1; }
  mv "$tmp.new" "$tmp"
fi
grep -q 'jetscope-maintenance\*\.conf' "$tmp" || { echo "include was not inserted" >&2; exit 1; }
mv -f "$tmp" "$maint"
ln -sfn "$maint" "$link.swap.$ts"
mv -T "$link.swap.$ts" "$link"
if ! nginx -t; then
  ln -sfn "$orig" "$link.restore.$ts"
  mv -T "$link.restore.$ts" "$link"
  echo "nginx -t failed after switching to maintenance; symlink restored to $orig" >&2
  exit 10
fi
systemctl reload nginx
printf 'ok: %s -> %s\n' "$link" "$(readlink "$link")"
REMOTE
  expect_gate_503
  STATE="maintenance gate on: writes 503, reads still from usa; usa config backed up"
  RECOVERY="  ssh $USA 'ln -sfn $SITE_ORIG $SITE_LINK.restore && mv -T $SITE_LINK.restore $SITE_LINK'
  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'"
  phase_done

  phase_start "3/7-db-sync"
  USA_DUMP=$(usa_run "mktemp /root/jetscope-cutover.XXXXXX.db") || fail "could not create a snapshot file on $USA"
  OCI_INCOMING=$(oci_run "mktemp $(printf %q "$OCI_ROOT/data")/.cutover-snap.XXXXXX") || fail "could not create a snapshot file on $OCI"
  usa_bash "$USA_DB" "$USA_DUMP" <<'REMOTE'
set -Eeuo pipefail
db=$1
dump=$2
[[ -f "$db" ]] || { echo "missing $db" >&2; exit 1; }
sqlite3 "$db" ".backup '$dump'" || { echo "sqlite3 .backup failed" >&2; exit 1; }
chmod 600 "$dump"
printf 'ok: snapshot %s bytes sha256=%s\n' "$(stat -c %s "$dump")" "$(sha256sum "$dump" | cut -c1-8)"
REMOTE

  usa_run "cat $(printf %q "$USA_DUMP")" \
    | oci_run "umask 077; cat > $(printf %q "$OCI_INCOMING")" \
    || fail "snapshot transfer from $USA to $OCI failed"
  oci_run "chmod 640 $(printf %q "$OCI_INCOMING")"

  integrity=$(oci_run "sqlite3 -readonly $(printf %q "$OCI_INCOMING") 'PRAGMA integrity_check;'") \
    || fail "could not run PRAGMA integrity_check on $OCI"
  [[ "$integrity" == "ok" ]] || fail "PRAGMA integrity_check on $OCI returned: $integrity"
  printf 'ok: PRAGMA integrity_check: ok\n'

  usa_counts=$(table_counts usa_run "$USA_DUMP") || fail "could not count rows on the usa snapshot"
  oci_counts=$(table_counts oci_run "$OCI_INCOMING") || fail "could not count rows on the oci copy"
  if [[ "$usa_counts" != "$oci_counts" ]]; then
    printf 'usa snapshot:\n%s\noci copy:\n%s\n' "$usa_counts" "$oci_counts" >&2
    fail "row counts differ between the usa snapshot and the oci copy"
  fi
  printf 'ok: row counts match for %s tables\n' "$(printf '%s\n' "$usa_counts" | wc -l | tr -d '[:space:]')"

  OCI_PRE_DB="$OCI_DB.pre-cutover-$TS"
  STATE="maintenance gate on; oci api is being stopped and its db replaced"
  RECOVERY="  ssh $OCI 'docker start jetscope-api && curl -fsS http://$OCI_IP:8000/v1/health'
  # if the swap already happened, restore the pre-cutover db (incl. -wal/-shm/-journal):
  ssh $OCI 'docker stop jetscope-api && $(restore_db_cmd "$OCI_PRE_DB" "$OCI_DB"); docker start jetscope-api'"
  oci_bash "$OCI_DB" "$OCI_INCOMING" "$OCI_PRE_DB" "$OCI_IP" <<'REMOTE'
set -Eeuo pipefail
db=$1
incoming=$2
pre=$3
ip=$4
[[ -f "$incoming" ]] || { echo "missing $incoming" >&2; exit 1; }
docker stop jetscope-api >/dev/null || { echo "docker stop jetscope-api failed" >&2; exit 1; }
stopped=1
restart() {
  if [[ "${stopped:-0}" == 1 ]]; then
    docker start jetscope-api >/dev/null 2>&1 || true
  fi
}
trap restart EXIT
running=$(docker inspect -f '{{.State.Running}}' jetscope-api) || { echo "docker inspect jetscope-api failed" >&2; exit 1; }
[[ "$running" == false ]] || { echo "jetscope-api is still running after docker stop" >&2; exit 1; }
[[ -e "$db" ]] || { echo "missing $db" >&2; exit 1; }
if [[ -s "$db-journal" ]]; then
  echo "hot journal $db-journal present: the db may hold an unfinished transaction; start the API once normally, then retry" >&2
  exit 1
fi
mv "$db" "$pre"
for sfx in -wal -shm -journal; do
  if [[ -e "$db$sfx" ]]; then mv "$db$sfx" "$pre$sfx"; fi
done
if ! mv "$incoming" "$db"; then
  mv "$pre" "$db"
  for sfx in -wal -shm -journal; do
    if [[ -e "$pre$sfx" ]]; then mv "$pre$sfx" "$db$sfx"; fi
  done
  echo "could not move the new db into place; previous db restored" >&2
  exit 1
fi
chmod 640 "$db"
chown ubuntu:ubuntu "$db"
docker start jetscope-api >/dev/null || { echo "docker start jetscope-api failed" >&2; exit 1; }
stopped=0
trap - EXIT
ok=0
for ((i = 0; i < 30; i++)); do
  if curl -fsS --max-time 5 "http://$ip:8000/v1/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" != 1 ]]; then
  echo "oci api did not answer /v1/health within 60s (previous db at $pre)" >&2
  exit 1
fi
printf 'ok: oci api healthy after swap; previous db at %s\n' "$pre"
REMOTE
  usa_run "rm -f $(printf %q "$USA_DUMP")" || fail "could not delete the snapshot $USA_DUMP on $USA"
  oci_run "rm -f $(printf %q "$OCI_INCOMING")" || fail "could not delete the snapshot $OCI_INCOMING on $OCI"
  OCI_INCOMING=""
  USA_DUMP=""
  pre_sha=$(remote_sha oci_run "$OCI_PRE_DB") || fail "could not hash $OCI_PRE_DB on $OCI"
  manifest_add "$pre_sha" "$OCI:$OCI_PRE_DB"
  STATE="maintenance gate on; oci api is running on the synced db"
  RECOVERY="  ssh $OCI 'docker start jetscope-api && curl -fsS http://$OCI_IP:8000/v1/health'
  ssh $OCI 'docker stop jetscope-api && $(restore_db_cmd "$OCI_PRE_DB" "$OCI_DB"); docker start jetscope-api'"
  phase_done

  phase_start "4/7-upstream-and-site"
  STATE="maintenance gate on; edge may be switching to jetscope.oci-a1"
  RECOVERY="  ssh $USA 'ln -sfn $SITE_MAINT $SITE_LINK.swap && mv -T $SITE_LINK.swap $SITE_LINK'
  ssh $USA 'rm -f $UPSTREAM_CONF && nginx -t && systemctl reload nginx'"
  OCI_IP_RE=${OCI_IP//./\\.}
  upstream_text=$(<"$TPL_UPSTREAM")
  upstream_text=${upstream_text//__OCI_IP_RE__/$OCI_IP_RE}
  upstream_text=${upstream_text//__OCI_IP__/$OCI_IP}
  site_text=$(<"$TPL_SITE")
  site_text=${site_text//__OCI_IP_RE__/$OCI_IP_RE}
  site_text=${site_text//__OCI_IP__/$OCI_IP}
  case "$upstream_text" in
    *__OCI_IP*) fail "jetscope-upstream.conf still has an __OCI_IP placeholder after rendering" ;;
  esac
  case "$site_text" in
    *__OCI_IP*) fail "jetscope-site.conf still has an __OCI_IP placeholder after rendering" ;;
  esac
  printf '%s\n' "$upstream_text" | put_usa "$UPSTREAM_CONF" 644
  printf '%s\n' "$site_text" | put_usa "$SITE_NEW" 644
  usa_bash "$SITE_NEW" "$SITE_MAINT" "$SITE_ORIG" "$UPSTREAM_CONF" "$SITE_LINK" "$TS" <<'REMOTE' || fail "could not switch the edge to the oci-a1 site (see the remote message above)"
set -Eeuo pipefail
new=$1
maint=$2
orig=$3
upstream=$4
link=$5
ts=$6
ln -sfn "$new" "$link.swap.$ts"
mv -T "$link.swap.$ts" "$link"
if ! nginx -t; then
  ln -sfn "$maint" "$link.swap.$ts"
  mv -T "$link.swap.$ts" "$link"
  rm -f "$upstream"
  if nginx -t; then systemctl reload nginx; fi
  echo "nginx -t failed with the oci-a1 site; restored $maint and removed $upstream" >&2
  exit 10
fi
systemctl reload nginx
printf 'ok: %s -> %s\n' "$link" "$(readlink "$link")"
REMOTE
  STATE="maintenance gate on; edge points at jetscope.oci-a1"
  RECOVERY="  ssh $USA 'ln -sfn $SITE_MAINT $SITE_LINK.swap && mv -T $SITE_LINK.swap $SITE_LINK && nginx -t && systemctl reload nginx'
  ssh $USA 'rm -f $UPSTREAM_CONF'"
  phase_done

  lift_gate_cutover
  smoke_cutover

  phase_start "7/7-summary"
  usa_run "rm -f $(printf %q "$SITE_MAINT")"
  STATE="cutover complete: edge on oci-a1, oci db authoritative, usa hot standby"
  RECOVERY="  bash scripts/oci-a1/cutover.sh --rollback"
  phase_done

  printf '\ncutover complete\n'
  printf '  edge:        %s -> oci-a1 (%s)\n' "$USA" "$OCI_IP"
  printf '  reads:       oci-a1 with usa as backup; writes: oci-a1 only\n'
  printf '  nginx backup: %s:/root/nginx-backup-jetscope-%s\n' "$USA" "$TS"
  printf '  db backup:   %s:%s\n' "$OCI" "$OCI_PRE_DB"
  printf '  log:         %s:%s\n' "$USA" "$LOG_DIR"
  printf 'rollback: bash scripts/oci-a1/cutover.sh --rollback\n'
}

run_rollback() {
  STATE="no changes made"
  RECOVERY="  nothing to undo (preflight is read-only)"
  check_ssh
  prepare_log

  phase_start "0/5-preflight"
  usa_bash "$SITE_ORIG" "$SITE_NEW" "$SITE_LINK" <<'REMOTE'
set -Eeuo pipefail
orig=$1
new=$2
link=$3
[[ -f "$orig" ]] || { echo "missing $orig; cannot roll back" >&2; exit 1; }
nginx -t >/dev/null
cur="$(readlink -f "$link" || true)"
if [[ "$cur" == "$orig" ]]; then
  echo "already rolled back: $link -> $orig" >&2
  exit 1
fi
if [[ "$cur" != "$new" ]]; then
  echo "refusing to roll back: $link -> ${cur:-nothing}, not $new" >&2
  echo "the oci-a1 db may never have been made authoritative; restore the edge by hand" >&2
  exit 1
fi
echo "ok: usa nginx -t, $orig present, current target $cur"
REMOTE
  phase_done

  phase_start "1/5-maintenance"
  STATE="maintenance gate being enabled; writes should return 503"
  RECOVERY="  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'"
  write_maint_snippet
  usa_run "nginx -t && systemctl reload nginx"
  expect_gate_503
  STATE="maintenance gate on; reads from oci-a1, writes 503"
  RECOVERY="  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'"
  phase_done

  phase_start "2/5-stop-usa-api"
  STATE="maintenance gate on; stopping the usa api"
  RECOVERY="  ssh $USA 'cd /opt/jetscope && docker-compose -f $USA_COMPOSE start api'
  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'"
  usa_run "cd /opt/jetscope && docker-compose -f $(printf %q "$USA_COMPOSE") stop api"
  running=$(usa_run "docker inspect -f '{{.State.Running}}' jetscope-api") || fail "could not inspect jetscope-api on $USA"
  [[ "$running" == false ]] || fail "jetscope-api on $USA is still running after docker-compose stop (State.Running=$running)"
  STATE="maintenance gate on; usa api stopped; oci db is authoritative"
  RECOVERY="  ssh $USA 'cd /opt/jetscope && docker-compose -f $USA_COMPOSE start api'
  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'"
  phase_done

  phase_start "3/5-db-sync"
  OCI_DUMP=$(oci_run "mktemp $(printf %q "$OCI_ROOT/data")/.cutover-snap.XXXXXX") || fail "could not create a snapshot file on $OCI"
  USA_INCOMING=$(usa_run "mktemp $(printf %q "$USA_ROOT/data")/.cutover-snap.XXXXXX") || fail "could not create a snapshot file on $USA"
  oci_bash "$OCI_DB" "$OCI_DUMP" <<'REMOTE'
set -Eeuo pipefail
db=$1
dump=$2
[[ -f "$db" ]] || { echo "missing $db" >&2; exit 1; }
sqlite3 "$db" ".backup '$dump'" || { echo "sqlite3 .backup failed" >&2; exit 1; }
chmod 600 "$dump"
printf 'ok: snapshot %s bytes sha256=%s\n' "$(stat -c %s "$dump")" "$(sha256sum "$dump" | cut -c1-8)"
REMOTE

  oci_run "cat $(printf %q "$OCI_DUMP")" \
    | usa_run "umask 077; cat > $(printf %q "$USA_INCOMING")" \
    || fail "snapshot transfer from $OCI to $USA failed"
  usa_run "chmod 640 $(printf %q "$USA_INCOMING")"

  integrity=$(usa_run "sqlite3 -readonly $(printf %q "$USA_INCOMING") 'PRAGMA integrity_check;'") \
    || fail "could not run PRAGMA integrity_check on $USA"
  [[ "$integrity" == "ok" ]] || fail "PRAGMA integrity_check on $USA returned: $integrity"
  printf 'ok: PRAGMA integrity_check: ok\n'

  oci_counts=$(table_counts oci_run "$OCI_DUMP") || fail "could not count rows on the oci snapshot"
  usa_counts=$(table_counts usa_run "$USA_INCOMING") || fail "could not count rows on the usa copy"
  if [[ "$oci_counts" != "$usa_counts" ]]; then
    printf 'oci snapshot:\n%s\nusa copy:\n%s\n' "$oci_counts" "$usa_counts" >&2
    fail "row counts differ between the oci snapshot and the usa copy"
  fi
  printf 'ok: row counts match for %s tables\n' "$(printf '%s\n' "$oci_counts" | wc -l | tr -d '[:space:]')"

  USA_PRE_DB="$USA_DB.pre-rollback-$TS"
  STATE="maintenance gate on; usa api stopped; swapping the usa db"
  RECOVERY="  ssh $USA 'cd /opt/jetscope && docker-compose -f $USA_COMPOSE start api'
  # if the swap already happened, restore the pre-rollback db (incl. -wal/-shm/-journal):
  ssh $USA 'cd /opt/jetscope && docker-compose -f $USA_COMPOSE stop api && $(restore_db_cmd "$USA_PRE_DB" "$USA_DB"); docker-compose -f $USA_COMPOSE start api'"
  usa_bash "$USA_DB" "$USA_INCOMING" "$USA_PRE_DB" <<'REMOTE'
set -Eeuo pipefail
db=$1
incoming=$2
pre=$3
[[ -f "$incoming" ]] || { echo "missing $incoming" >&2; exit 1; }
[[ -e "$db" ]] || { echo "missing $db" >&2; exit 1; }
if [[ -s "$db-journal" ]]; then
  echo "hot journal $db-journal present: the db may hold an unfinished transaction; start the API once normally, then retry" >&2
  exit 1
fi
mv "$db" "$pre"
for sfx in -wal -shm -journal; do
  if [[ -e "$db$sfx" ]]; then mv "$db$sfx" "$pre$sfx"; fi
done
if ! mv "$incoming" "$db"; then
  mv "$pre" "$db"
  for sfx in -wal -shm -journal; do
    if [[ -e "$pre$sfx" ]]; then mv "$pre$sfx" "$db$sfx"; fi
  done
  echo "could not move the new db into place; previous db restored" >&2
  exit 1
fi
chmod 640 "$db"
printf 'ok: %s installed; previous db at %s\n' "$db" "$pre"
REMOTE
  oci_run "rm -f $(printf %q "$OCI_DUMP")" || fail "could not delete the snapshot $OCI_DUMP on $OCI"
  usa_run "rm -f $(printf %q "$USA_INCOMING")" || fail "could not delete the snapshot $USA_INCOMING on $USA"
  USA_INCOMING=""
  OCI_DUMP=""
  pre_sha=$(remote_sha usa_run "$USA_PRE_DB") || fail "could not hash $USA_PRE_DB on $USA"
  manifest_add "$pre_sha" "$USA:$USA_PRE_DB"

  usa_run "cd /opt/jetscope && docker-compose -f $(printf %q "$USA_COMPOSE") start api"
  wait_http usa_run "http://127.0.0.1:8000/v1/health" \
    || fail "usa api did not answer 127.0.0.1:8000/v1/health within 60s (previous db at $USA_PRE_DB)"
  printf 'ok: usa api healthy\n'
  STATE="maintenance gate on; usa api running on the synced db"
  RECOVERY="  ssh $USA 'cd /opt/jetscope && docker-compose -f $USA_COMPOSE start api'
  ssh $USA 'cd /opt/jetscope && docker-compose -f $USA_COMPOSE stop api && $(restore_db_cmd "$USA_PRE_DB" "$USA_DB"); docker-compose -f $USA_COMPOSE start api'"
  phase_done

  phase_start "4/5-restore-site"
  STATE="maintenance gate on; edge may be switching back to the original site"
  RECOVERY="  ssh $USA 'ln -sfn $SITE_NEW $SITE_LINK.swap && mv -T $SITE_LINK.swap $SITE_LINK'
  ssh $USA 'nginx -t && systemctl reload nginx'"
  usa_bash "$SITE_ORIG" "$SITE_NEW" "$UPSTREAM_CONF" "$SITE_LINK" "$TS" <<'REMOTE' || fail "could not restore the original usa site (see the remote message above)"
set -Eeuo pipefail
orig=$1
new=$2
upstream=$3
link=$4
ts=$5
ln -sfn "$orig" "$link.swap.$ts"
mv -T "$link.swap.$ts" "$link"
if ! nginx -t; then
  ln -sfn "$new" "$link.swap.$ts"
  mv -T "$link.swap.$ts" "$link"
  echo "nginx -t failed with the original site; restored $new" >&2
  exit 10
fi
systemctl reload nginx
if [[ -f "$upstream" ]]; then
  mv "$upstream" "$upstream.removed.$ts"
  if ! nginx -t; then
    mv "$upstream.removed.$ts" "$upstream"
    echo "removing $upstream broke nginx -t; restored it" >&2
    exit 11
  fi
  rm -f "$upstream.removed.$ts"
fi
systemctl reload nginx
printf 'ok: %s -> %s\n' "$link" "$(readlink "$link")"
REMOTE
  STATE="edge points at the original usa site, which has no maintenance include; writes are already back on usa (the snippet file is unused until removed)"
  RECOVERY="  ssh $USA 'rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx'"
  phase_done

  phase_start "5/5-lift-gate-and-smoke"
  STATE="edge restored; removing the maintenance gate"
  RECOVERY="  ssh $USA 'nginx -t && systemctl reload nginx'"
  usa_bash "$MAINT_SNIPPET" <<'REMOTE'
set -Eeuo pipefail
rm -f "$1"
nginx -t
systemctl reload nginx
echo "ok: maintenance gate removed"
REMOTE
  STATE="edge on usa, maintenance gate removed; public smoke pending"
  RECOVERY="  check by hand: curl -sI https://$PUBLIC_HOST/v1/health (expect 200, no X-JetScope-Served-By: oci-a1)"

  health=$(public_get "$(public_cb /v1/health)") || fail "public GET https://$PUBLIC_HOST/v1/health failed"
  status=$(public_status "$health")
  [[ "$status" == 200 ]] || fail "public /v1/health returned $status, want 200"
  public_no_cache_hit "$health" /v1/health
  printf 'ok: public /v1/health 200\n'
  served=$(public_header "$health" X-JetScope-Served-By)
  if [[ "$served" == *"oci-a1"* ]]; then
    fail "public /v1/health still reports '$served'"
  fi
  printf 'ok: served-by is absent or usa (%s)\n' "${served:-none}"
  phase_done

  STATE="rollback complete: usa serves directly again"
  RECOVERY="  bash scripts/oci-a1/cutover.sh"
  printf '\nrollback complete\n'
  printf '  edge:      %s serving %s directly again\n' "$USA" "$PUBLIC_HOST"
  printf '  db backup: %s:%s\n' "$USA" "$USA_PRE_DB"
  printf '  log:       %s:%s\n' "$USA" "$LOG_DIR"
  printf 'cutover: bash scripts/oci-a1/cutover.sh\n'
}

case "$MODE" in
  rollback) run_rollback ;;
  resume) run_resume_smoke ;;
  *) run_cutover ;;
esac
