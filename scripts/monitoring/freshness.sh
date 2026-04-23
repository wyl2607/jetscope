#!/bin/bash
# Monitor data freshness (last update time)
# Alert if data is stale beyond thresholds
# Cross-platform: works on macOS and Linux

set -euo pipefail

SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
API_ENDPOINT="${API_ENDPOINT:-http://localhost:8000/v1/market/snapshot}"

# Thresholds (in minutes)
GREEN_THRESHOLD=60      # < 1h = green
YELLOW_THRESHOLD=240    # 1-4h = yellow

check_freshness() {
    local response
    response=$(curl -s "$API_ENDPOINT" || echo "{}")
    
    if [[ -z "$response" ]] || [[ "$response" == "{}" ]]; then
        alert "red" "❌ Failed to fetch snapshot"
        return 1
    fi
    
    local generated_at
    generated_at=$(echo "$response" | jq -r '.generated_at // empty' 2>/dev/null || echo "")
    
    if [[ -z "$generated_at" ]]; then
        alert "red" "❌ No generated_at in response"
        return 1
    fi
    
    # Cross-platform ISO-8601 parsing using Python (avoids macOS/Linux date differences)
    local now_epoch generated_epoch freshness_minutes
    now_epoch=$(date +%s)
    generated_epoch=$(python3 -c "
from datetime import datetime, timezone
try:
    dt = datetime.fromisoformat('${generated_at}'.replace('Z', '+00:00'))
    print(int(dt.timestamp()))
except Exception:
    print(0)
" 2>/dev/null || echo 0)
    
    if [[ "$generated_epoch" -eq 0 ]]; then
        alert "red" "❌ Could not parse timestamp: $generated_at"
        return 1
    fi
    
    freshness_minutes=$(( (now_epoch - generated_epoch) / 60 ))
    
    local status color
    if [[ $freshness_minutes -lt $GREEN_THRESHOLD ]]; then
        status="green"
        color="✅"
    elif [[ $freshness_minutes -lt $YELLOW_THRESHOLD ]]; then
        status="yellow"
        color="⚠️"
    else
        status="red"
        color="❌"
    fi
    
    alert "$status" "${color} Freshness: ${freshness_minutes}m | Status: $status"
    
    return 0
}

alert() {
    local status="$1"
    local message="$2"
    
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $message"
    
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        local color
        case "$status" in
            green) color="#36a64f" ;;
            yellow) color="#ff9900" ;;
            red) color="#cc0000" ;;
            *) color="#999999" ;;
        esac
        
        local payload
        payload=$(jq -n \
            --arg color "$color" \
            --arg msg "$message" \
            '{attachments: [{color: $color, title: "Data Freshness", text: $msg, ts: (now | floor)}]}')
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "$payload" "$SLACK_WEBHOOK_URL" > /dev/null || true
    fi
}

check_freshness
