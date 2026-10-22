#!/usr/bin/env bash
# Containerized regression test for the JetScope usa nginx templates.
#
# It runs nginx 1.24 in docker together with two fake upstreams (oci, usa) on
# one private docker network and asserts the behaviour the cutover relies on:
# path/query preservation, read failover, writes never failing over, Basic Auth
# on /admin, the maintenance gate and X-JetScope-Served-By. It never connects
# to oci-a1 or usa-vps; docker on the local host is the only requirement.
#
# Usage (any working directory):
#   bash scripts/oci-a1/nginx-smoke.sh            # run, then remove everything
#   bash scripts/oci-a1/nginx-smoke.sh --keep     # keep containers/dir for debugging
#   bash scripts/oci-a1/nginx-smoke.sh --dry-run  # print the plan; no docker, no network
#   bash scripts/oci-a1/nginx-smoke.sh --help
#
# Environment:
#   NGINX_IMAGE  nginx image used for the edge and both backends
#                (default: nginx:1.24, matching usa-vps 1.24.0)
#
# Exits non-zero when any assertion fails or a container command fails. Test
# certificates, the Basic Auth file and the rendered configs live under a
# mktemp directory that is removed on exit unless --keep is given.
set -Eeuo pipefail

NGINX_IMAGE="${NGINX_IMAGE:-nginx:1.24}"
CURL_IMAGE="curlimages/curl"

KEEP=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
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

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
NGINX_SRC="$REPO_ROOT/infra/server/oci-a1/nginx"

if (( DRY_RUN )); then
  cat <<EOF
==> DRY-RUN: no docker, no network, no remote hosts
would: read templates from $NGINX_SRC
would: use $NGINX_IMAGE for the edge and for the oci/usa fake backends
would: create a private docker network and pull/run $CURL_IMAGE as the client
would: generate a self-signed cert for saf.test, a 2048-bit dhparam and an apr1 htpasswd
would: render jetscope-upstream.conf with the backend container IPs and
would: render jetscope-site.conf with saf.test, test cert/htpasswd/snippet paths
would: assert a-g over https://saf.test with --resolve inside the docker network
would: remove the containers, the network and the temp dir (kept with --keep)
EOF
  exit 0
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}
need docker
need openssl
need awk
need sed
need tr

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not reachable (is it running, and is this user in the docker group?)" >&2
  exit 1
fi

if [[ ! -f "$NGINX_SRC/jetscope-upstream.conf" || ! -f "$NGINX_SRC/jetscope-site.conf" || ! -f "$NGINX_SRC/jetscope-maintenance.conf" ]]; then
  echo "missing templates under $NGINX_SRC" >&2
  exit 1
fi

NAME="jetscope-nginx-smoke-$$"
NET="$NAME-net"
NGINX_C="$NAME-nginx"
OCI_C="$NAME-oci"
USA_C="$NAME-usa"
T=$(mktemp -d "${TMPDIR:-/tmp}/jetscope-nginx-smoke.XXXXXX")
FAILS=0

cleanup() {
  local rc=$?
  trap - EXIT
  if (( KEEP )); then
    printf '\nkept for debugging:\n  dir=%s\n  containers=%s %s %s\n  network=%s\n' \
      "$T" "$NGINX_C" "$OCI_C" "$USA_C" "$NET" >&2
  else
    docker rm -f "$NGINX_C" "$OCI_C" "$USA_C" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    rm -rf "$T"
  fi
  exit "$rc"
}
trap cleanup EXIT

log() { printf '%s\n' "$*"; }
pass() { printf 'PASS  %s\n' "$*"; }
fail() {
  printf 'FAIL  %s\n' "$*"
  FAILS=$((FAILS + 1))
}

container_ip() {
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$1"
}

STATUS=""
HEADERS=""
BODY=""

request() {
  local path=$1
  shift
  local out="$T/last-response"
  local rc=0
  : > "$out"
  docker run --rm --network "$NET" "$CURL_IMAGE" \
    -sS -k --resolve "saf.test:443:$NGINX_IP" -i "$@" "https://saf.test$path" \
    >"$out" 2>"$T/curl.err" || rc=$?
  if (( rc != 0 )); then
    STATUS=000
    HEADERS=""
    BODY="curl rc=$rc: $(tr '\n' ' ' < "$T/curl.err")"
    return 0
  fi
  STATUS=$(awk 'NR==1 {print $2; exit}' "$out")
  HEADERS=$(awk 'NR==1 {next} {sub(/\r$/, ""); if ($0 == "") exit; print}' "$out")
  BODY=$(awk '{sub(/\r$/, "")} f {print} !f && $0 == "" {f=1}' "$out")
}

header_value() {
  local name=$1
  local line
  local lower_line
  local lower_name
  local val
  lower_name=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
  while IFS= read -r line; do
    line=${line%$'\r'}
    lower_line=$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')
    if [[ "$lower_line" == "$lower_name:"* ]]; then
      val=${line#*:}
      val=${val#"${val%%[![:space:]]*}"}
      printf '%s' "$val"
      return 0
    fi
  done <<< "$HEADERS"
  return 1
}

expect_status() {
  local label=$1
  local want=$2
  if [[ "$STATUS" == "$want" ]]; then
    pass "$label: status $STATUS"
  else
    fail "$label: status ${STATUS:-none}, want $want"
  fi
}

expect_body_has() {
  local label=$1
  local needle=$2
  if [[ "$BODY" == *"$needle"* ]]; then
    pass "$label: body has '$needle'"
  else
    fail "$label: body '$BODY' lacks '$needle'"
  fi
}

expect_header_eq() {
  local label=$1
  local name=$2
  local want=$3
  local got
  got=$(header_value "$name" || true)
  if [[ "$got" == "$want" ]]; then
    pass "$label: $name=$got"
  else
    fail "$label: $name='$got', want '$want'"
  fi
}

expect_header_present() {
  local label=$1
  local name=$2
  local got
  got=$(header_value "$name" || true)
  if [[ -n "$got" ]]; then
    pass "$label: $name=$got"
  else
    fail "$label: $name missing"
  fi
}

nginx_test() {
  local label=$1
  if docker exec "$NGINX_C" nginx -t >/dev/null 2>"$T/nginx-t.err"; then
    pass "$label: nginx -t"
  else
    fail "$label: nginx -t: $(tr '\n' ' ' < "$T/nginx-t.err")"
  fi
}

wait_http() {
  local url=$1
  local i
  for ((i = 0; i < 60; i++)); do
    if docker run --rm --network "$NET" "$CURL_IMAGE" -fsS -o /dev/null "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

render_backend() {
  local name=$1
  local out=$2
  cat > "$out" <<EOF
server {
    listen 8000;
    location / {
        default_type text/plain;
        return 200 "backend=$name method=\$request_method uri=\$request_uri";
    }
}

server {
    listen 3000;
    location / {
        default_type text/plain;
        return 200 "backend=$name method=\$request_method uri=\$request_uri";
    }
}
EOF
}

render_upstream() {
  local rendered
  OCI_IP_RE=${OCI_IP//./\\.}
  rendered=$(<"$NGINX_SRC/jetscope-upstream.conf")
  rendered=${rendered//__OCI_IP_RE__/$OCI_IP_RE}
  rendered=${rendered//__OCI_IP__/$OCI_IP}
  rendered=${rendered//127.0.0.1:8000/$USA_IP:8000}
  rendered=${rendered//127.0.0.1:3000/$USA_IP:3000}
  printf '%s\n' "$rendered" > "$T/conf.d/jetscope-upstream.conf"
}

start_edge() {
  docker run -d --name "$NGINX_C" --network "$NET" \
    -v "$T:$T" \
    -v "$T/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "$T/conf.d:/etc/nginx/conf.d:ro" \
    -v "$T/sites-enabled:/etc/nginx/sites-enabled:ro" \
    "$NGINX_IMAGE" >/dev/null
}

docker run --rm "$CURL_IMAGE" --version >/dev/null

mkdir -p "$T/conf.d" "$T/sites-enabled" "$T/snippets" "$T/certs"
chmod 755 "$T"
docker network create "$NET" >/dev/null

render_backend oci "$T/backend-oci.conf"
render_backend usa "$T/backend-usa.conf"

docker run -d --name "$OCI_C" --network "$NET" \
  -v "$T/backend-oci.conf:/etc/nginx/conf.d/backend.conf:ro" \
  "$NGINX_IMAGE" >/dev/null
docker run -d --name "$USA_C" --network "$NET" \
  -v "$T/backend-usa.conf:/etc/nginx/conf.d/backend.conf:ro" \
  "$NGINX_IMAGE" >/dev/null

OCI_IP=$(container_ip "$OCI_C")
USA_IP=$(container_ip "$USA_C")
if [[ -z "$OCI_IP" || -z "$USA_IP" ]]; then
  echo "could not read backend container IPs" >&2
  exit 1
fi

if ! wait_http "http://$OCI_IP:8000/"; then
  echo "oci fake backend did not come up" >&2
  exit 1
fi
if ! wait_http "http://$USA_IP:8000/"; then
  echo "usa fake backend did not come up" >&2
  exit 1
fi

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$T/certs/privkey.pem" -out "$T/certs/fullchain.pem" \
  -days 1 -subj "/CN=saf.test" >/dev/null 2>&1
openssl dhparam -dsaparam -out "$T/certs/dh.pem" 2048 >/dev/null 2>&1
: > "$T/certs/options-ssl-nginx.conf"
printf 'tester:%s\n' "$(openssl passwd -apr1 testpass 2>/dev/null)" > "$T/htpasswd"
chmod 644 "$T/htpasswd"

render_upstream

sed \
  -e "s|/etc/letsencrypt/live/saf.meichen.beauty/|$T/certs/|g" \
  -e "s|/etc/letsencrypt/options-ssl-nginx.conf|$T/certs/options-ssl-nginx.conf|g" \
  -e "s|/etc/letsencrypt/ssl-dhparams.pem|$T/certs/dh.pem|g" \
  -e "s|/etc/nginx/.htpasswd_jetscope_admin|$T/htpasswd|g" \
  -e "s|/etc/nginx/snippets/|$T/snippets/|g" \
  -e "s|/var/log/nginx/saf-access.log|/dev/stdout|g" \
  -e "s|server_name saf.meichen.beauty;|server_name saf.test;|g" \
  "$NGINX_SRC/jetscope-site.conf" > "$T/sites-enabled/jetscope"

cat > "$T/conf.d/00-http.conf" <<'EOF'
log_format main_host '$remote_addr - $remote_user [$time_local] host=$host "$request" $status $body_bytes_sent';
limit_req_zone  $binary_remote_addr zone=saf_req:10m rate=30r/s;
limit_conn_zone $binary_remote_addr zone=saf_conn:10m;
EOF

cat > "$T/nginx.conf" <<'EOF'
user nginx;
worker_processes 1;
error_log /dev/stderr warn;
pid /tmp/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;

    include /etc/nginx/conf.d/*.conf;
    access_log /dev/stdout main_host;

    include /etc/nginx/sites-enabled/*;
}
EOF

if docker run --rm \
    -v "$T:$T" \
    -v "$T/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "$T/conf.d:/etc/nginx/conf.d:ro" \
    -v "$T/sites-enabled:/etc/nginx/sites-enabled:ro" \
    "$NGINX_IMAGE" nginx -t >/dev/null 2>"$T/nginx-t.err"; then
  pass "g: nginx -t on rendered config"
else
  fail "g: nginx -t on rendered config: $(tr '\n' ' ' < "$T/nginx-t.err")"
  log "refusing to start the edge with an invalid config"
  exit 1
fi

start_edge
NGINX_IP=$(container_ip "$NGINX_C")
if [[ -z "$NGINX_IP" ]]; then
  echo "could not read edge container IP" >&2
  exit 1
fi

edge_up=0
for ((i = 0; i < 60; i++)); do
  request /v1/health
  if [[ "$STATUS" != "000" ]]; then
    edge_up=1
    break
  fi
  sleep 0.5
done
if (( ! edge_up )); then
  echo "edge nginx did not answer" >&2
  exit 1
fi
nginx_test "g: edge started"

log ""
log "a) GET /v1/health?x=1 keeps path and query and reaches oci"
request "/v1/health?x=1"
expect_status "a" 200
expect_body_has "a" "backend=oci"
expect_body_has "a" "uri=/v1/health?x=1"

log ""
log "b) GET /sources reaches oci web and is labelled oci-a1"
request "/sources"
expect_status "b" 200
expect_body_has "b" "backend=oci"
expect_header_eq "b" "X-JetScope-Served-By" "oci-a1"

log ""
log "c) POST /v1/scenarios reaches the oci api"
request "/v1/scenarios" -X POST
expect_status "c" 200
expect_body_has "c" "backend=oci"

log ""
log "d) /admin requires Basic Auth"
request "/admin"
expect_status "d" 401
request "/admin" -u tester:testpass
expect_status "d" 200
expect_body_has "d" "backend=oci"

log ""
log "e) with oci stopped reads fall back to usa, writes return 502"
docker stop "$OCI_C" >/dev/null
request "/v1/health"
expect_status "e" 200
expect_body_has "e" "backend=usa"
expect_header_eq "e" "X-JetScope-Served-By" "usa"
request "/v1/scenarios" -X POST
expect_status "e" 502
request "/api/pathways" -X PUT
expect_status "e" 502
request "/admin" -u tester:testpass
expect_status "e" 502
nginx_test "g: while oci is down"

log ""
log "f) restart oci, wait for recovery, then enable the maintenance gate"
docker start "$OCI_C" >/dev/null
NEW_IP=$(container_ip "$OCI_C")
if [[ -n "$NEW_IP" && "$NEW_IP" != "$OCI_IP" ]]; then
  OCI_IP=$NEW_IP
  render_upstream
  nginx_test "g: after backend IP change"
  docker exec "$NGINX_C" nginx -s reload
fi

recovered=0
for ((i = 0; i < 20; i++)); do
  request "/v1/health"
  if [[ "$STATUS" == "200" && "$BODY" == *"backend=oci"* ]]; then
    recovered=1
    break
  fi
  sleep 2
done
if (( recovered )); then
  pass "f: oci recovered (status $STATUS)"
else
  fail "f: oci did not recover within 40s (status ${STATUS:-none}, body '$BODY')"
fi

cp "$NGINX_SRC/jetscope-maintenance.conf" "$T/snippets/jetscope-maintenance.conf"
nginx_test "g: maintenance snippet installed"
docker exec "$NGINX_C" nginx -s reload
sleep 1
request "/v1/scenarios" -X POST
expect_status "f" 503
expect_header_present "f" "Retry-After"
request "/v1/health"
expect_status "f" 200
nginx_test "g: maintenance active"

log ""
if (( FAILS > 0 )); then
  printf '%d assertion(s) failed\n' "$FAILS" >&2
  exit 1
fi
log "all assertions passed"
