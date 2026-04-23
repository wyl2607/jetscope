#!/bin/bash
# Monitor confidence score (average data quality across all sources)
# Alert if average confidence drops below thresholds
# Cross-platform: works on macOS and Linux

set -euo pipefail

SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
API_ENDPOINT="${API_ENDPOINT:-http://localhost:8000/v1/market/snapshot}"

# Thresholds (confidence score 0-1)
GREEN_THRESHOLD=0.9     # > 0.9 = green (high confidence)
YELLOW_THRESHOLD=0.5    # 0.5-0.9 = yellow, < 0.5 = red (low confidence)

check_confidence() {
    local response
    response=$(curl -s "$API_ENDPOINT" || echo "{}")
    
    if [[ -z "$response" ]] || [[ "$response" == "{}" ]]; then
        alert "red" "❌ Failed to fetch snapshot"
        return 1
    fi
    
    # Calculate average confidence from source_details
    local confidence
    confidence=$(echo "$response" | jq '
        [.source_details | values[] | .confidence_score] 
        | if length > 0 then (add / length) else 1.0 end
    ')
    
    # Round to 3 decimal places using Python
    confidence=$(python3 -c "print(round(${confidence}, 3))" 2>/dev/null || echo "1.0")
    
    local status color
    local cmp_green cmp_yellow
    cmp_green=$(python3 -c "print(1 if ${confidence} > ${GREEN_THRESHOLD} else 0)")
    cmp_yellow=$(python3 -c "print(1 if ${confidence} > ${YELLOW_THRESHOLD} else 0)")
    
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
    
    alert "$status" "${color} Confidence: ${confidence} | Status: $status"
    
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
            '{attachments: [{color: $color, title: "Confidence Score Monitor", text: $msg, ts: (now | floor)}]}')
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "$payload" "$SLACK_WEBHOOK_URL" > /dev/null || true
    fi
}

check_confidence
