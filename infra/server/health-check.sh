#!/bin/bash
# JetScope Health Check & Auto-Restart
# Runs every minute via cron
#
# Design:
# - This script NEVER exits on error (set -u but not -e) because a single
#   failed check should not kill the cron job.
# - Restart actions are logged to both /var/log and the workspace data bus.
# - After restart, we re-verify. If still unhealthy, we emit a "failed"
#   event so upstream monitoring can escalate.

set -uo pipefail

WEB_URL="https://saf.meichen.beauty/"
API_URL="http://127.0.0.1:8000/v1/health"
LOG="/var/log/jetscope-health.log"
BUS_WRITE="/Users/yumei/tools/script-core/bin/sc-bus-write"
PRODUCER="infra/server/health-check.sh"
ALLOW_RESTART="${JETSCOPE_HEALTH_ALLOW_RESTART:-0}"
RESTART_TOKEN="${JETSCOPE_HEALTH_RESTART_TOKEN:-}"
LEDGER_HELPER="/opt/jetscope/scripts/approval-token-ledger.sh"
RESTART_APPROVED=0

if [ -f "$LEDGER_HELPER" ]; then
    # shellcheck source=/dev/null
    source "$LEDGER_HELPER"
fi

restart_allowed() {
    [ "$ALLOW_RESTART" = "1" ] && [ -n "$RESTART_TOKEN" ] && [ "${APPROVE_JETSCOPE_HEALTH_RESTART:-}" = "$RESTART_TOKEN" ] || return 1
    if [ "$RESTART_APPROVED" = "1" ]; then
        return 0
    fi
    if ! type approval_token_record_once >/dev/null 2>&1; then
        log "Restart token matched, but approval token ledger is unavailable; refusing restart."
        emit_event "failed" "health restart ledger unavailable" "helper=$LEDGER_HELPER"
        return 1
    fi
    approval_token_record_once "health-restart" "$RESTART_TOKEN" "$(date -u +%Y-%m-%dT%H:%MZ)" || return 1
    RESTART_APPROVED=1
}

log() {
    echo "[$(date -Iseconds)] $1" | tee -a "$LOG"
}

emit_event() {
    local status="$1"
    local summary="$2"
    local error_text="${3:-}"
    local payload
    payload=$(cat <<EOF
{"producer":"$PRODUCER","status":"$status","summary":"$summary","error":"$error_text"}
EOF
)
    if [ -x "$BUS_WRITE" ]; then
        "$BUS_WRITE" health-check --producer "$PRODUCER" --payload "$payload" >/dev/null 2>&1 || true
    fi
}

# --- API check ---
api_status() {
    curl -s -o /dev/null -w "%{http_code}" "$API_URL" --connect-timeout 5 --max-time 10 2>/dev/null || echo "000"
}

API_STATUS=$(api_status)
if [ "$API_STATUS" != "200" ]; then
    if ! restart_allowed; then
        log "API unhealthy (status: $API_STATUS). Restart disabled or unapproved; emitting failure only."
        emit_event "failed" "api unhealthy, restart disabled" "status=$API_STATUS"
    else
    log "API unhealthy (status: $API_STATUS). Restarting..."
    emit_event "recovering" "api unhealthy, restarting" "status=$API_STATUS"
    cd /opt/jetscope && docker-compose -f docker-compose.prod.yml restart api >> "$LOG" 2>&1
    sleep 5
    API_STATUS=$(api_status)
    if [ "$API_STATUS" != "200" ]; then
        log "API still unhealthy after restart (status: $API_STATUS)."
        emit_event "failed" "api restart did not recover" "status=$API_STATUS"
    else
        log "API recovered after restart."
        emit_event "recovered" "api recovered after restart" ""
    fi
    fi
fi

# --- Web check ---
web_status() {
    curl -s -o /dev/null -w "%{http_code}" "$WEB_URL" --connect-timeout 5 --max-time 10 2>/dev/null || echo "000"
}

web_content_type() {
    curl -sI "$WEB_URL" --connect-timeout 5 --max-time 10 2>/dev/null | grep -i "content-type:" | head -1 || echo ""
}

WEB_STATUS=$(web_status)
WEB_CT=$(web_content_type)
if [ "$WEB_STATUS" != "200" ] || ! echo "$WEB_CT" | grep -qi "text/html"; then
    if ! restart_allowed; then
        log "Web unhealthy (status: $WEB_STATUS, content-type: $WEB_CT). Restart disabled or unapproved; emitting failure only."
        emit_event "failed" "web unhealthy, restart disabled" "status=$WEB_STATUS ct=$WEB_CT"
    else
    log "Web unhealthy (status: $WEB_STATUS, content-type: $WEB_CT). Restarting..."
    emit_event "recovering" "web unhealthy, restarting" "status=$WEB_STATUS ct=$WEB_CT"
    systemctl restart jetscope-web.service
    sleep 5
    WEB_STATUS=$(web_status)
    WEB_CT=$(web_content_type)
    if [ "$WEB_STATUS" != "200" ] || ! echo "$WEB_CT" | grep -qi "text/html"; then
        log "Web still unhealthy after restart (status: $WEB_STATUS, content-type: $WEB_CT)."
        emit_event "failed" "web restart did not recover" "status=$WEB_STATUS ct=$WEB_CT"
    else
        log "Web recovered after restart."
        emit_event "recovered" "web recovered after restart" ""
    fi
    fi
fi

# Log OK status occasionally (every 10 minutes)
MINUTE=$(date +%M)
if [ "${MINUTE:1:1}" = "0" ]; then
    log "Health check OK (API: $API_STATUS, Web: $WEB_STATUS)"
    emit_event "ok" "health check ok" "api=$API_STATUS web=$WEB_STATUS"
fi
