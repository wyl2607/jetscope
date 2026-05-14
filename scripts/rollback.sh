#!/bin/bash
# JetScope Rollback Script
# Reverts to the previous git commit and rebuilds

set -euo pipefail

DEPLOY_DIR="/opt/jetscope"
LOG="/var/log/jetscope-deploy.log"
BUILD_LOG="/var/log/jetscope-build.log"
BUS_WRITE="${JETSCOPE_BUS_WRITE:-}"
PRODUCER="jetscope/scripts/rollback.sh"
APPROVAL_TOKEN=""

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/approval-token-ledger.sh"

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
        --help|-h)
            cat <<'EOF'
Usage: ./scripts/rollback.sh --approval-token <token>

Requires APPROVE_JETSCOPE_ROLLBACK to match --approval-token before mutating production.
Production checkout must already be clean. Rollback never stashes or reapplies local state.
EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
    shift
done

if [[ -z "$APPROVAL_TOKEN" ]]; then
    echo "ERROR: rollback requires --approval-token and matching APPROVE_JETSCOPE_ROLLBACK." >&2
    exit 1
fi
if [[ "${APPROVE_JETSCOPE_ROLLBACK:-}" != "$APPROVAL_TOKEN" ]]; then
    echo "ERROR: APPROVE_JETSCOPE_ROLLBACK must match --approval-token." >&2
    exit 1
fi

emit_publish_event() {
    local status="$1"
    local summary="$2"
    local error_text="${3:-}"
    local commit_before="${4:-}"
    local commit_after="${5:-}"

    if [ -x "$BUS_WRITE" ]; then
        "$BUS_WRITE" publish-event \
            --key "jetscope-rollback" \
            --producer "$PRODUCER" \
            --payload "{\"project\":\"jetscope\",\"source_path\":\"$DEPLOY_DIR\",\"remote\":\"origin\",\"git_ref\":\"main\",\"status\":\"$status\",\"commit_before\":\"$commit_before\",\"commit_after\":\"$commit_after\",\"summary\":\"$summary\",\"error\":\"$error_text\"}" \
            >/dev/null 2>&1 || true
    fi
}

cd "$DEPLOY_DIR"

CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERROR: rollback requires production checkout on main; current branch is ${CURRENT_BRANCH:-detached HEAD}." >&2
    exit 1
fi

COMMIT_BEFORE=$(git rev-parse HEAD)
ROLLBACK_TARGET=$(git rev-parse HEAD~1)

if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: rollback requires a clean production checkout; refusing to stash or reapply local state." >&2
    git status --short >&2
    emit_publish_event "failed" "rollback checkout dirty" "local modifications detected" "$COMMIT_BEFORE" "$COMMIT_BEFORE"
    exit 1
fi

emit_publish_event "started" "rollback initiated" "" "$COMMIT_BEFORE" "$ROLLBACK_TARGET"

echo "[$(date -Iseconds)] ROLLBACK initiated..." | tee -a "$LOG"

# Show current and previous commit
echo "Current commit: $(git log --oneline -1)" | tee -a "$LOG"
echo "Rolling back to: $(git log --oneline -2 | tail -1)" | tee -a "$LOG"

approval_token_record_once "rollback" "$APPROVAL_TOKEN" "$COMMIT_BEFORE->$ROLLBACK_TARGET"

# Roll back one commit
git reset --hard HEAD~1 >> "$LOG" 2>&1

# Rebuild API
echo "[$(date -Iseconds)] Rebuilding API..." | tee -a "$LOG"
docker-compose -f docker-compose.prod.yml down >> "$LOG" 2>&1 || true
docker rm -f jetscope-api >> "$LOG" 2>&1 || true
docker-compose -f docker-compose.prod.yml up --build -d api >> "$LOG" 2>&1
sleep 5

# Rebuild Web
echo "[$(date -Iseconds)] Rebuilding Web..." | tee -a "$LOG"
cd apps/web
rm -rf .next
nohup "$DEPLOY_DIR/node_modules/.bin/next" build --webpack > "$BUILD_LOG" 2>&1 &
BUILD_PID=$!

# Wait for build
while kill -0 "$BUILD_PID" 2>/dev/null; do
    sleep 10
done

if [ ! -f ".next/BUILD_ID" ]; then
    echo "[$(date -Iseconds)] ERROR: Rollback build failed!" | tee -a "$LOG"
    emit_publish_event "failed" "rollback build failed" "missing .next/BUILD_ID" "$COMMIT_BEFORE" "$ROLLBACK_TARGET"
    exit 1
fi

systemctl restart jetscope-web.service
sleep 3

# Verify
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://saf.meichen.beauty --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")
echo "[$(date -Iseconds)] Rollback complete. Web status: $WEB_STATUS" | tee -a "$LOG"

if [ "$WEB_STATUS" = "200" ] || [ "$WEB_STATUS" = "307" ]; then
    emit_publish_event "success" "rollback completed successfully" "" "$COMMIT_BEFORE" "$ROLLBACK_TARGET"
else
    emit_publish_event "failed" "rollback completed but health check failed" "web status $WEB_STATUS" "$COMMIT_BEFORE" "$ROLLBACK_TARGET"
fi
