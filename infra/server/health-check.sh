#!/bin/bash
# JetScope Health Check & Auto-Restart
# Runs every minute via cron

set -uo pipefail

WEB_URL="https://saf.meichen.beauty/"
API_URL="http://127.0.0.1:8000/v1/health"
LOG="/var/log/jetscope-health.log"

log() {
    echo "[$(date -Iseconds)] $1" | tee -a "$LOG"
}

# Check API (Docker)
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL" --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")
if [ "$API_STATUS" != "200" ]; then
    log "API unhealthy (status: $API_STATUS). Restarting..."
    cd /opt/jetscope && docker-compose -f docker-compose.prod.yml restart api >> "$LOG" 2>&1
    sleep 5
fi

# Check Web serves real HTML (Systemd)
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL" --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")
WEB_CT=$(curl -sI "$WEB_URL" --connect-timeout 5 --max-time 10 2>/dev/null | grep -i "content-type:" | head -1 || echo "")
if [ "$WEB_STATUS" != "200" ] || ! echo "$WEB_CT" | grep -qi "text/html"; then
    log "Web unhealthy (status: $WEB_STATUS, content-type: $WEB_CT). Restarting..."
    systemctl restart jetscope-web.service
    sleep 5
fi

# Log OK status occasionally (every 10 minutes)
MINUTE=$(date +%M)
if [ "${MINUTE:1:1}" = "0" ]; then
    log "Health check OK (API: $API_STATUS, Web: $WEB_STATUS)"
fi
