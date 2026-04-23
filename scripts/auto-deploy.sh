#!/bin/bash
# JetScope Auto-Deploy Script
# Runs on production server (usa-vps) via cron every minute
# Pulls latest code from GitHub, builds, and restarts services

set -euo pipefail

DEPLOY_DIR="/opt/jetscope"
LOG="/var/log/jetscope-deploy.log"
BUILD_LOG="/var/log/jetscope-build.log"
LOCK_FILE="/tmp/jetscope-deploy.lock"
BUS_WRITE="/Users/yumei/tools/script-core/bin/sc-bus-write"
PRODUCER="jetscope/scripts/auto-deploy.sh"
FORCE_DEPLOY="${JETSCOPE_FORCE_DEPLOY:-0}"
EXPECTED_COMMIT="${JETSCOPE_EXPECT_COMMIT:-}"

fail_deploy() {
    local summary="$1"
    local error_text="${2:-}"
    echo "[$(date -Iseconds)] ERROR: ${summary}${error_text:+ ($error_text)}" | tee -a "$LOG"
    emit_publish_event "failed" "$summary" "$error_text" "$LOCAL_COMMIT" "$REMOTE_COMMIT"
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

cd "$DEPLOY_DIR"

# Prevent concurrent deployments
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "[$(date -Iseconds)] Deploy already running (PID $LOCK_PID). Skipping." >> "$LOG"
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Check if GitHub has new commits
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git ls-remote origin main | awk '{print $1}')

if [ -n "$EXPECTED_COMMIT" ] && [ "$REMOTE_COMMIT" != "$EXPECTED_COMMIT" ]; then
    fail_deploy "expected commit not yet visible on origin/main" "expected $EXPECTED_COMMIT got $REMOTE_COMMIT"
fi

if [ "$FORCE_DEPLOY" != "1" ] && [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
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

# Pull latest
echo "[$(date -Iseconds)] Pulling origin/main..." | tee -a "$LOG"
git pull origin main >> "$LOG" 2>&1
DEPLOYED_COMMIT=$(git rev-parse HEAD)

if [ "$DEPLOYED_COMMIT" != "$REMOTE_COMMIT" ]; then
    fail_deploy "deploy tree did not advance to requested commit" "head $DEPLOYED_COMMIT remote $REMOTE_COMMIT"
fi

# Build API (Docker) - force recreate to avoid ContainerConfig bug
echo "[$(date -Iseconds)] Building API..." | tee -a "$LOG"
docker-compose -f docker-compose.prod.yml down >> "$LOG" 2>&1 || true
docker rm -f jetscope-api >> "$LOG" 2>&1 || true
docker-compose -f docker-compose.prod.yml up --build -d api >> "$LOG" 2>&1

# Wait for API to be ready
sleep 5
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/v1/health --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")
if [ "$API_STATUS" != "200" ]; then
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
systemctl restart jetscope-web.service
sleep 3

# Verify Web serves real HTML (not API proxy)
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://saf.meichen.beauty/ --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")
WEB_CT=$(curl -sI https://saf.meichen.beauty/ --connect-timeout 5 --max-time 10 2>/dev/null | grep -i "content-type:" | head -1 || echo "")
if [ "$WEB_STATUS" = "200" ] && echo "$WEB_CT" | grep -qi "text/html"; then
    echo "[$(date -Iseconds)] Deploy SUCCESS! Web: $WEB_STATUS (HTML), API: $API_STATUS" | tee -a "$LOG"
    emit_publish_event "success" "auto-deploy completed successfully" "" "$LOCAL_COMMIT" "$REMOTE_COMMIT"
else
    fail_deploy "web health check failed after auto-deploy" "web status $WEB_STATUS content-type '$WEB_CT'"
fi

echo "[$(date -Iseconds)] Deploy complete." | tee -a "$LOG"
