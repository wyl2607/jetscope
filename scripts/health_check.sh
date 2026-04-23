#!/bin/bash
set -euo pipefail

# SAFvsOil Cluster Health Check Script
# Monitors 6 endpoints (3 nodes × 2 services) across Tailscale network
# Sends Slack alerts on failures

# ============================================================================
# Configuration
# ============================================================================

# Node endpoints (IP:PORT pairs)
# Configure with actual Tailscale addresses from environment or .env
declare -A NODES
NODES["mac-mini-fastapi"]="${MAC_MINI_ENDPOINT:-localhost}:8000"
NODES["mac-mini-webhook"]="${MAC_MINI_ENDPOINT:-localhost}:3001"
NODES["france-fastapi"]="${FRANCE_ENDPOINT:-localhost}:8000"
NODES["france-webhook"]="${FRANCE_ENDPOINT:-localhost}:3001"
NODES["us-fastapi"]="${US_ENDPOINT:-localhost}:8000"
NODES["us-webhook"]="${US_ENDPOINT:-localhost}:3001"

# Health check settings
TIMEOUT_SECONDS=5
MAX_RETRIES=1
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
LOG_DIR="${LOG_DIR:-/var/log/safvsoil}"
REPORT_DIR="${REPORT_DIR:-${LOG_DIR}/reports}"

# Paths for git tracking
MAC_MINI_REPO="/Users/yumei/SAFvsOil"
FRANCE_REPO="/root/SAFvsOil"  # adjust as needed
US_REPO="/root/SAFvsOil"      # adjust as needed

# ============================================================================
# Helper Functions
# ============================================================================

log() {
  local level="$1"
  shift
  local msg="$*"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${timestamp}] [${level}] ${msg}"
}

create_log_dir() {
  mkdir -p "${LOG_DIR}" "${REPORT_DIR}"
}

rotate_logs() {
  local log_file="$1"
  if [[ -f "${log_file}" ]] && [[ $(stat -f%z "${log_file}" 2>/dev/null || stat -c%s "${log_file}") -gt 10485760 ]]; then
    mv "${log_file}" "${log_file}.$(date +%s)"
    gzip "${log_file}".* 2>/dev/null || true
  fi
}

check_endpoint() {
  local name="$1"
  local endpoint="$2"
  local attempt=1
  local response_time_ms=0
  local http_status=0
  local response_body=""

  while [[ $attempt -le $((MAX_RETRIES + 1)) ]]; do
    if response_body=$(curl -s -w "\n%{http_code}\n%{time_total}" \
        --max-time "$TIMEOUT_SECONDS" \
        --connect-timeout 2 \
        "http://${endpoint}/health" 2>/dev/null); then
      
      http_status=$(echo "${response_body}" | tail -1)
      response_time_ms=$(echo "${response_body}" | tail -1 | awk '{print int($1 * 1000)}')
      response_body=$(echo "${response_body}" | head -n -1)
      
      if [[ "$http_status" == "200" ]]; then
        # Verify JSON response contains "status": "healthy"
        if echo "${response_body}" | grep -q '"status"\s*:\s*"healthy"'; then
          echo "✅"
          return 0
        else
          echo "⚠️  json-invalid"
          return 1
        fi
      else
        if [[ $attempt -lt $((MAX_RETRIES + 1)) ]]; then
          ((attempt++))
          sleep 1
          continue
        fi
        echo "❌ http-${http_status}"
        return 1
      fi
    else
      if [[ $attempt -lt $((MAX_RETRIES + 1)) ]]; then
        ((attempt++))
        sleep 1
        continue
      fi
      echo "❌ timeout"
      return 1
    fi
  done

  return 1
}

get_git_branch_hash() {
  local repo_path="$1"
  
  if [[ ! -d "${repo_path}/.git" ]]; then
    echo "unknown"
    return
  fi
  
  (cd "${repo_path}" && git rev-parse HEAD 2>/dev/null || echo "unknown")
}

check_process_running() {
  local node_name="$1"
  local port="$2"
  local service_type="$3"  # fastapi or webhook
  
  # Check if process is listening on port
  if lsof -Pi ":${port}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    return 0
  fi
  
  # Remote check via SSH (if configured)
  if [[ "${node_name}" =~ ^(france|us) ]]; then
    # This would require SSH setup; for now just return 0 (assume running)
    return 0
  fi
  
  return 1
}

send_slack_alert() {
  local failures="$1"
  local summary="$2"
  
  if [[ -z "${SLACK_WEBHOOK}" ]]; then
    log "WARN" "SLACK_WEBHOOK not configured; skipping Slack alert"
    return
  fi
  
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local hostname=$(hostname)
  local color="danger"  # red for failures
  
  # Build failure message
  local failure_lines=$(echo "${failures}" | sed 's/^/• /')
  
  local payload=$(cat <<EOF
{
  "attachments": [
    {
      "color": "${color}",
      "title": ":warning: SAFvsOil Health Check Failed",
      "text": "Cluster health check detected failures",
      "fields": [
        {
          "title": "Timestamp",
          "value": "${timestamp}",
          "short": true
        },
        {
          "title": "Host",
          "value": "${hostname}",
          "short": true
        },
        {
          "title": "Summary",
          "value": "${summary}",
          "short": false
        },
        {
          "title": "Failed Endpoints",
          "value": "${failure_lines}",
          "short": false
        }
      ]
    }
  ]
}
EOF
)
  
  curl -s -X POST "${SLACK_WEBHOOK}" \
    -H 'Content-Type: application/json' \
    -d "${payload}" >/dev/null 2>&1 || log "WARN" "Failed to send Slack alert"
}

# ============================================================================
# Main Health Check
# ============================================================================

main() {
  create_log_dir
  
  local log_file="${LOG_DIR}/health_check.log"
  local report_file="${REPORT_DIR}/health_check_$(date +%Y%m%d_%H%M%S).json"
  
  log "INFO" "Starting SAFvsOil cluster health check..."
  
  rotate_logs "${log_file}"
  
  # Results tracking
  declare -A results
  declare -a failures
  local total=0
  local healthy=0
  
  # Git hashes for branch checking
  local mac_hash=$(get_git_branch_hash "${MAC_MINI_REPO}")
  
  # Check each endpoint
  for node_name in "${!NODES[@]}"; do
    local endpoint="${NODES[$node_name]}"
    local port="${endpoint##*:}"
    
    ((total++))
    
    local status=$(check_endpoint "${node_name}" "${endpoint}")
    results["${node_name}"]="${status}"
    
    if [[ "$status" == "✅" ]]; then
      ((healthy++))
      log "INFO" "${node_name} (${endpoint}) - HEALTHY"
    else
      failures+=("${node_name}: ${status}")
      log "WARN" "${node_name} (${endpoint}) - FAILED: ${status}"
    fi
  done
  
  # Generate JSON report
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local summary="${healthy}/${total} nodes healthy"
  
  local json_report=$(cat <<EOF
{
  "timestamp": "${timestamp}",
  "summary": "${summary}",
  "total_nodes": ${total},
  "healthy_nodes": ${healthy},
  "failed_nodes": $((total - healthy)),
  "checks": {
EOF
)
  
  local first=true
  for node_name in "${!NODES[@]}"; do
    if [[ "$first" == false ]]; then
      json_report+=","
    fi
    first=false
    local status="${results[$node_name]}"
    local endpoint="${NODES[$node_name]}"
    json_report+=$(cat <<EOF

    "${node_name}": {
      "endpoint": "${endpoint}",
      "status": "$(echo $status | sed 's/^[✅❌⚠️ ]*//')",
      "healthy": $(if [[ "$status" == "✅" ]]; then echo "true"; else echo "false"; fi)
    }
EOF
)
  done
  
  json_report+=$(cat <<EOF

  }
}
EOF
)
  
  # Write report
  echo "${json_report}" > "${report_file}"
  log "INFO" "Health check report saved to ${report_file}"
  
  # Log summary
  log "INFO" "Health check summary: ${summary}"
  echo "" >> "${log_file}" 2>&1
  echo "${json_report}" >> "${log_file}" 2>&1
  
  # Send Slack alert if failures detected
  if [[ ${#failures[@]} -gt 0 ]]; then
    local failure_text=$(printf '%s\n' "${failures[@]}")
    send_slack_alert "${failure_text}" "${summary}"
    log "WARN" "Sent Slack alert for ${#failures[@]} failed endpoints"
  fi
  
  return $(( total - healthy ))
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
exit_code=$?

if [[ $exit_code -eq 0 ]]; then
  log "INFO" "All health checks passed ✅"
else
  log "WARN" "Health check completed with ${exit_code} failures"
fi

exit $exit_code
