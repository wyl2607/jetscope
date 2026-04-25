#!/bin/bash
# JetScope Auto-Deploy Script
# Runs on production server (usa-vps) via cron every minute
# Pulls latest code from GitHub, builds, and restarts services

set -euo pipefail

DEPLOY_DIR="/opt/jetscope"
LOG="/var/log/jetscope-deploy.log"
BUILD_LOG="/var/log/jetscope-build.log"
DEPLOY_STATE_DIR="${JETSCOPE_DEPLOY_STATE_DIR:-/var/lib/jetscope/deploy-state}"
LOCK_DIR="$DEPLOY_STATE_DIR/deploy.lock"
LAST_SUCCESS_FILE="$DEPLOY_STATE_DIR/last-success-commit"
LAST_FAILURE_FILE="$DEPLOY_STATE_DIR/last-failure-commit"
BUS_WRITE="/Users/yumei/tools/script-core/bin/sc-bus-write"
PRODUCER="jetscope/scripts/auto-deploy.sh"
FORCE_DEPLOY="${JETSCOPE_FORCE_DEPLOY:-0}"
EXPECTED_COMMIT="${JETSCOPE_EXPECT_COMMIT:-}"
API_HEALTH_URL="${JETSCOPE_API_HEALTH_URL:-http://127.0.0.1:8000/v1/health}"
WEB_HEALTH_URL="${JETSCOPE_WEB_HEALTH_URL:-https://saf.meichen.beauty/}"
HEALTH_TIMEOUT_SECONDS="${JETSCOPE_HEALTH_TIMEOUT_SECONDS:-120}"
HEALTH_INTERVAL_SECONDS="${JETSCOPE_HEALTH_INTERVAL_SECONDS:-5}"
CURL_MAX_TIME_SECONDS="${JETSCOPE_CURL_MAX_TIME_SECONDS:-10}"
LOCAL_COMMIT=""
REMOTE_COMMIT=""
API_STATUS="000"
WEB_STATUS="000"
WEB_CT=""
SHOULD_RECORD_FAILURE=1

ensure_deploy_state_dir() {
    if ! mkdir -p "$DEPLOY_STATE_DIR"; then
        echo "[$(date -Iseconds)] ERROR: cannot create deploy state dir $DEPLOY_STATE_DIR" | tee -a "$LOG"
        exit 1
    fi
}

acquire_deploy_lock() {
    ensure_deploy_state_dir
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        printf '%s\n' "$$" > "$LOCK_DIR/pid"
        trap 'rm -rf "$LOCK_DIR"' EXIT
        return 0
    fi

    local lock_pid=""
    if [ -f "$LOCK_DIR/pid" ]; then
        lock_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
    fi
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
        echo "[$(date -Iseconds)] Deploy already running (PID $lock_pid). Skipping." >> "$LOG"
        exit 0
    fi

    echo "[$(date -Iseconds)] Removing stale deploy lock $LOCK_DIR" | tee -a "$LOG"
    rm -rf "$LOCK_DIR"
    if ! mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "[$(date -Iseconds)] ERROR: could not acquire deploy lock $LOCK_DIR" | tee -a "$LOG"
        exit 1
    fi
    printf '%s\n' "$$" > "$LOCK_DIR/pid"
    trap 'rm -rf "$LOCK_DIR"' EXIT
}

write_state_file() {
    local path="$1"
    local value="$2"
    local tmp
    ensure_deploy_state_dir
    tmp=$(mktemp "$DEPLOY_STATE_DIR/.state.XXXXXX") || return 1
    printf '%s\n' "$value" > "$tmp" || {
        rm -f "$tmp"
        return 1
    }
    mv "$tmp" "$path"
}

record_deploy_failure() {
    if [ "$SHOULD_RECORD_FAILURE" -eq 1 ] && [ -n "${REMOTE_COMMIT:-}" ]; then
        if ! write_state_file "$LAST_FAILURE_FILE" "$REMOTE_COMMIT"; then
            echo "[$(date -Iseconds)] ERROR: failed to record deploy failure state for $REMOTE_COMMIT" | tee -a "$LOG"
        fi
    fi
}

record_deploy_success() {
    if ! write_state_file "$LAST_SUCCESS_FILE" "$REMOTE_COMMIT"; then
        fail_deploy "failed to record deploy success state" "could not write $LAST_SUCCESS_FILE"
    fi
    rm -f "$LAST_FAILURE_FILE" 2>/dev/null || true
}

fail_deploy() {
    local summary="$1"
    local error_text="${2:-}"
    echo "[$(date -Iseconds)] ERROR: ${summary}${error_text:+ ($error_text)}" | tee -a "$LOG"
    record_deploy_failure
    emit_publish_event "failed" "$summary" "$error_text" "${LOCAL_COMMIT:-}" "${REMOTE_COMMIT:-}"
    exit 1
}

emit_publish_event() {
    local status="$1"
    local summary="$2"
    local error_text="${3:-}"
    local commit_before="${4:-}"
    local commit_after="${5:-}"

    if [ -x "$BUS_WRITE" ]; then
        "$BUS_WRITE" publish-event \
            --key "jetscope-auto-deploy" \
            --producer "$PRODUCER" \
            --payload "{\"project\":\"jetscope\",\"source_path\":\"$DEPLOY_DIR\",\"remote\":\"origin\",\"git_ref\":\"main\",\"status\":\"$status\",\"commit_before\":\"$commit_before\",\"commit_after\":\"$commit_after\",\"summary\":\"$summary\",\"error\":\"$error_text\"}" \
            >/dev/null 2>&1 || true
    fi
}

resolve_origin_main() {
    git rev-parse origin/main
}

validate_positive_integer() {
    local name="$1"
    local value="$2"
    if ! [[ "$value" =~ ^[1-9][0-9]*$ ]]; then
        fail_deploy "invalid deploy configuration" "$name must be a positive integer, got '$value'"
    fi
}

validate_health_config() {
    validate_positive_integer "JETSCOPE_HEALTH_TIMEOUT_SECONDS" "$HEALTH_TIMEOUT_SECONDS"
    validate_positive_integer "JETSCOPE_HEALTH_INTERVAL_SECONDS" "$HEALTH_INTERVAL_SECONDS"
    validate_positive_integer "JETSCOPE_CURL_MAX_TIME_SECONDS" "$CURL_MAX_TIME_SECONDS"
    if [ "$HEALTH_INTERVAL_SECONDS" -gt "$HEALTH_TIMEOUT_SECONDS" ]; then
        fail_deploy "invalid deploy configuration" "JETSCOPE_HEALTH_INTERVAL_SECONDS must be <= JETSCOPE_HEALTH_TIMEOUT_SECONDS"
    fi
    if [ "$CURL_MAX_TIME_SECONDS" -gt "$HEALTH_TIMEOUT_SECONDS" ]; then
        fail_deploy "invalid deploy configuration" "JETSCOPE_CURL_MAX_TIME_SECONDS must be <= JETSCOPE_HEALTH_TIMEOUT_SECONDS"
    fi
}

sleep_until_next_health_attempt() {
    local deadline="$1"
    local remaining=$((deadline - SECONDS))
    if [ "$remaining" -le 0 ]; then
        return 0
    fi
    if [ "$remaining" -lt "$HEALTH_INTERVAL_SECONDS" ]; then
        sleep "$remaining"
    else
        sleep "$HEALTH_INTERVAL_SECONDS"
    fi
}

curl_timeout_for_deadline() {
    local deadline="$1"
    local remaining=$((deadline - SECONDS))
    if [ "$remaining" -le 0 ]; then
        echo 1
    elif [ "$remaining" -lt "$CURL_MAX_TIME_SECONDS" ]; then
        echo "$remaining"
    else
        echo "$CURL_MAX_TIME_SECONDS"
    fi
}

check_api_health_once() {
    local max_time="$1"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$API_HEALTH_URL" --connect-timeout 5 --max-time "$max_time" 2>/dev/null || true)
    API_STATUS="${status:-000}"
    [ "$API_STATUS" = "200" ]
}

check_web_health_once() {
    local max_time="$1"
    local headers
    local status
    headers=$(mktemp) || {
        WEB_STATUS="000"
        WEB_CT=""
        return 1
    }
    status=$(curl -s -D "$headers" -o /dev/null -w "%{http_code}" "$WEB_HEALTH_URL" --connect-timeout 5 --max-time "$max_time" 2>/dev/null || true)
    WEB_STATUS="${status:-000}"
    WEB_CT=$(grep -i "content-type:" "$headers" | head -1 || true)
    rm -f -- "$headers"
    [ "$WEB_STATUS" = "200" ] && echo "$WEB_CT" | grep -qi "text/html"
}

current_deploy_is_healthy() {
    check_api_health_once 5 && check_web_health_once 5
}

wait_for_api_health() {
    local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
    local status="000"

    while [ "$SECONDS" -lt "$deadline" ]; do
        if check_api_health_once "$(curl_timeout_for_deadline "$deadline")"; then
            return 0
        fi
        echo "[$(date -Iseconds)] Waiting for API health: status $API_STATUS" | tee -a "$LOG"
        sleep_until_next_health_attempt "$deadline"
    done

    return 1
}

wait_for_web_health() {
    local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
    local status="000"
    local content_type=""

    while [ "$SECONDS" -lt "$deadline" ]; do
        if check_web_health_once "$(curl_timeout_for_deadline "$deadline")"; then
            return 0
        fi
        echo "[$(date -Iseconds)] Waiting for web health: status $WEB_STATUS content-type '$WEB_CT'" | tee -a "$LOG"
        sleep_until_next_health_attempt "$deadline"
    done

    return 1
}

cd "$DEPLOY_DIR"

acquire_deploy_lock

CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [ "$CURRENT_BRANCH" != "main" ]; then
    fail_deploy "wrong deploy branch" "expected main got ${CURRENT_BRANCH:-detached HEAD}"
fi

# Check if GitHub has new commits. Fetch first so deploy only advances to the
# locally resolved origin/main object and can enforce fast-forward semantics.
LOCAL_COMMIT=$(git rev-parse HEAD)
validate_health_config
echo "[$(date -Iseconds)] Fetching origin/main..." | tee -a "$LOG"
if ! git fetch origin main:refs/remotes/origin/main >> "$LOG" 2>&1; then
    fail_deploy "failed to fetch origin/main" "git fetch origin main:refs/remotes/origin/main failed"
fi
REMOTE_COMMIT=$(resolve_origin_main)

if [ -n "$EXPECTED_COMMIT" ] && [ "$REMOTE_COMMIT" != "$EXPECTED_COMMIT" ]; then
    SHOULD_RECORD_FAILURE=0
    fail_deploy "expected commit not yet visible on origin/main" "expected $EXPECTED_COMMIT got $REMOTE_COMMIT"
fi

LAST_SUCCESS=""
LAST_FAILURE=""
if [ -f "$LAST_SUCCESS_FILE" ]; then
    LAST_SUCCESS=$(cat "$LAST_SUCCESS_FILE" 2>/dev/null || true)
fi
if [ -f "$LAST_FAILURE_FILE" ]; then
    LAST_FAILURE=$(cat "$LAST_FAILURE_FILE" 2>/dev/null || true)
fi

if [ "$FORCE_DEPLOY" != "1" ] && [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ] && [ "$LAST_SUCCESS" = "$REMOTE_COMMIT" ] && [ "$LAST_FAILURE" != "$REMOTE_COMMIT" ] && current_deploy_is_healthy; then
    # No changes, exit silently (unless it's the 10-minute mark for a heartbeat)
    MINUTE=$(date +%M)
    if [ "${MINUTE:1:1}" = "0" ]; then
        echo "[$(date -Iseconds)] No changes. Local: ${LOCAL_COMMIT:0:8} = Remote: ${REMOTE_COMMIT:0:8}" >> "$LOG"
    fi
    emit_publish_event "skipped" "auto-deploy found no upstream changes" "" "$LOCAL_COMMIT" "$REMOTE_COMMIT"
    exit 0
fi

emit_publish_event "started" "auto-deploy detected new upstream commit" "" "$LOCAL_COMMIT" "$REMOTE_COMMIT"
echo "[$(date -Iseconds)] New commits detected! Local: ${LOCAL_COMMIT:0:8} → Remote: ${REMOTE_COMMIT:0:8}" | tee -a "$LOG"

# Strict: fail if deploy directory has local modifications.
# Production must be a clean checkout of the target commit.
if [ -n "$(git status --porcelain)" ]; then
    fail_deploy "deploy directory is dirty" "local modifications detected in $DEPLOY_DIR"
fi

# Advance production checkout only by fast-forwarding to fetched origin/main.
echo "[$(date -Iseconds)] Fast-forwarding to origin/main..." | tee -a "$LOG"
if ! git merge-base --is-ancestor "$LOCAL_COMMIT" "$REMOTE_COMMIT" >> "$LOG" 2>&1; then
    fail_deploy "deploy checkout cannot fast-forward to origin/main" "local $LOCAL_COMMIT remote $REMOTE_COMMIT"
fi
if ! git merge --ff-only origin/main >> "$LOG" 2>&1; then
    fail_deploy "failed to fast-forward deploy checkout" "git merge --ff-only origin/main failed"
fi
DEPLOYED_COMMIT=$(git rev-parse HEAD)

if [ "$DEPLOYED_COMMIT" != "$REMOTE_COMMIT" ]; then
    fail_deploy "deploy tree did not advance to requested commit" "head $DEPLOYED_COMMIT remote $REMOTE_COMMIT"
fi

# Build API (Docker) - force recreate to avoid ContainerConfig bug
echo "[$(date -Iseconds)] Building API..." | tee -a "$LOG"
if systemctl is-active --quiet jetscope-api.service 2>/dev/null; then
    fail_deploy "conflicting legacy API service is active" "jetscope-api.service must stay inactive; API is owned by docker-compose.prod.yml"
fi
docker-compose -f docker-compose.prod.yml down >> "$LOG" 2>&1 || true
docker rm -f jetscope-api >> "$LOG" 2>&1 || true
if ! docker-compose -f docker-compose.prod.yml up --build -d api >> "$LOG" 2>&1; then
    fail_deploy "api container build/start failed during auto-deploy" "docker-compose up --build -d api failed"
fi

# Wait for API to be ready
if ! wait_for_api_health; then
    fail_deploy "api health check failed after auto-deploy" "api status $API_STATUS"
fi

# Build Web
echo "[$(date -Iseconds)] Building Web..." | tee -a "$LOG"
cd apps/web
rm -rf .next
nohup "$DEPLOY_DIR/node_modules/.bin/next" build --webpack > "$BUILD_LOG" 2>&1 &
BUILD_PID=$!

# Wait for build (max 10 minutes)
BUILD_TIMEOUT=600
BUILD_ELAPSED=0
while kill -0 "$BUILD_PID" 2>/dev/null; do
    sleep 10
    BUILD_ELAPSED=$((BUILD_ELAPSED + 10))
    if [ "$BUILD_ELAPSED" -ge "$BUILD_TIMEOUT" ]; then
        echo "[$(date -Iseconds)] ERROR: Web build timeout (${BUILD_TIMEOUT}s). Killing..." | tee -a "$LOG"
        kill -9 "$BUILD_PID" 2>/dev/null || true
        fail_deploy "web build timed out during auto-deploy" "build timeout ${BUILD_TIMEOUT}s"
    fi
done

# Check if build succeeded
if [ ! -f ".next/BUILD_ID" ]; then
    fail_deploy "web build failed during auto-deploy" "missing .next/BUILD_ID"
fi

echo "[$(date -Iseconds)] Web build OK. Restarting service..." | tee -a "$LOG"
if ! systemctl restart jetscope-web.service >> "$LOG" 2>&1; then
    fail_deploy "web service restart failed during auto-deploy" "systemctl restart jetscope-web.service failed"
fi

# Verify Web serves real HTML (not API proxy)
if wait_for_web_health; then
    echo "[$(date -Iseconds)] Deploy SUCCESS! Web: $WEB_STATUS (HTML), API: $API_STATUS" | tee -a "$LOG"
    record_deploy_success
    emit_publish_event "success" "auto-deploy completed successfully" "" "$LOCAL_COMMIT" "$REMOTE_COMMIT"
else
    fail_deploy "web health check failed after auto-deploy" "web status $WEB_STATUS content-type '$WEB_CT'"
fi

echo "[$(date -Iseconds)] Deploy complete." | tee -a "$LOG"
