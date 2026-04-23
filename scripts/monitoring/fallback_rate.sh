#!/bin/bash
# Monitor fallback rate (percentage of data sources using fallback)
# Alert if fallback rate exceeds thresholds
# Cross-platform: works on macOS and Linux

set -euo pipefail

SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
API_ENDPOINT="${API_ENDPOINT:-http://localhost:8000/v1/market/snapshot}"

# Thresholds (in percent)
GREEN_THRESHOLD=10      # < 10% = green
YELLOW_THRESHOLD=50     # 10-50% = yellow, > 50% = red

check_fallback_rate() {
    local response
    response=$(curl -s "$API_ENDPOINT" || echo "{}")
    
    if [[ -z "$response" ]] || [[ "$response" == "{}" ]]; then
        alert "red" "❌ Failed to fetch snapshot"
        return 1
    fi
    
    # Calculate fallback rate from source_details (fallback_used=true / total sources)
    local total fallback fallback_rate
    total=$(echo "$response" | jq '[.source_details | values | length] | add // 0')
    fallback=$(echo "$response" | jq '[.source_details | values[] | select(.fallback_used == true)] | length')
    
    if [[ "$total" -eq 0 ]]; then
        fallback_rate="0"
    else
        fallback_rate=$(python3 -c "print(round(${fallback} / ${total} * 100, 2))" 2>/dev/null || echo "0")
    fi
    
    local status color
    # Use Python for float comparison to avoid bc dependency
    local cmp_green cmp_yellow
    cmp_green=$(python3 -c "print(1 if ${fallback_rate} < ${GREEN_THRESHOLD} else 0)")
    cmp_yellow=$(python3 -c "print(1 if ${fallback_rate} < ${YELLOW_THRESHOLD} else 0)")
    
    if [[ "$cmp_green" == "1" ]]; then
        status="green"
        color="✅"
    elif [[ "$cmp_yellow" == "1" ]]; then
        status="yellow"
        color="⚠️"
    else
        status="red"
        color="❌"
    fi
    
    alert "$status" "${color} Fallback rate: ${fallback_rate}% (${fallback}/${total} sources) | Status: $status"
    
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
            '{attachments: [{color: $color, title: "Fallback Rate Monitor", text: $msg, ts: (now | floor)}]}')
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "$payload" "$SLACK_WEBHOOK_URL" > /dev/null || true
    fi
}

check_fallback_rate
