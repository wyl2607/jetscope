#!/bin/bash
set -euo pipefail

# SAFvsOil Data Source Validation Script
# Validates 7 critical metrics from /api/v1/sources endpoint
# Generates CSV and JSON reports

# ============================================================================
# Configuration
# ============================================================================

# Primary API endpoint (usually FastAPI on mac-mini)
# Set via environment variable: API_ENDPOINT=http://<tailscale-ip>:8000
API_ENDPOINT="${API_ENDPOINT:-http://localhost:8000}"
TIMEOUT_SECONDS=10
LOG_DIR="${LOG_DIR:-/var/log/safvsoil}"
REPORT_DIR="${REPORT_DIR:-${LOG_DIR}/reports}"

# Validation thresholds
MIN_MARKET_PRICE=0
MIN_CARBON_INTENSITY=0
MIN_ROTTERDAM_EMISSIONS=0
MIN_EU_ETS_VOLUME=0
MIN_GERMANY_PREMIUM=0
MAX_FALLBACK_RATE=10  # percentage

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

# Extract JSON field value (simple jq alternative)
json_get() {
  local json="$1"
  local key="$2"
  echo "$json" | grep -o "\"${key}\"[^,}]*" | cut -d':' -f2- | sed 's/[",]//g' | xargs
}

validate_metric() {
  local metric_name="$1"
  local metric_value="$2"
  local min_threshold="${3:-0}"
  
  # Handle empty values
  if [[ -z "$metric_value" ]] || [[ "$metric_value" == "null" ]]; then
    echo "MISSING"
    return 1
  fi
  
  # Numeric validation
  if ! [[ "$metric_value" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    echo "INVALID"
    return 1
  fi
  
  # Threshold validation
  local numeric_value=$(echo "$metric_value" | awk '{print $1}')
  if (( $(echo "$numeric_value < $min_threshold" | bc -l) )); then
    echo "BELOW_THRESHOLD"
    return 1
  fi
  
  echo "VALID"
  return 0
}

# ============================================================================
# Main Validation
# ============================================================================

main() {
  create_log_dir
  
  local log_file="${LOG_DIR}/validate.log"
  local report_json="${REPORT_DIR}/validate_$(date +%Y%m%d_%H%M%S).json"
  local report_csv="${REPORT_DIR}/validate_$(date +%Y%m%d_%H%M%S).csv"
  
  log "INFO" "Starting data source validation for ${API_ENDPOINT}..."
  
  rotate_logs "${log_file}"
  
  # Fetch data from API
  local response
  if ! response=$(curl -s --max-time "$TIMEOUT_SECONDS" \
    --connect-timeout 2 \
    "${API_ENDPOINT}/api/v1/sources" 2>/dev/null); then
    log "ERROR" "Failed to reach API endpoint: ${API_ENDPOINT}"
    return 1
  fi
  
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  # Extract metrics
  local market_price=$(json_get "$response" "market_price" || echo "0")
  local carbon_intensity=$(json_get "$response" "carbon_intensity" || echo "0")
  local rotterdam_emissions=$(json_get "$response" "rotterdam_emissions" || echo "0")
  local eu_ets_volume=$(json_get "$response" "eu_ets_volume" || echo "0")
  local germany_premium=$(json_get "$response" "germany_premium" || echo "0")
  local fallback_rate=$(json_get "$response" "fallback_rate" || echo "0")
  local data_freshness=$(json_get "$response" "data_freshness_seconds" || echo "-1")
  
  log "INFO" "Raw metrics extracted:"
  log "INFO" "  market_price: ${market_price}"
  log "INFO" "  carbon_intensity: ${carbon_intensity}"
  log "INFO" "  rotterdam_emissions: ${rotterdam_emissions}"
  log "INFO" "  eu_ets_volume: ${eu_ets_volume}"
  log "INFO" "  germany_premium: ${germany_premium}"
  log "INFO" "  fallback_rate: ${fallback_rate}%"
  log "INFO" "  data_freshness: ${data_freshness}s"
  
  # Validate each metric
  declare -a validation_results
  local all_valid=true
  
  declare -A metrics=(
    ["market_price"]="$market_price"
    ["carbon_intensity"]="$carbon_intensity"
    ["rotterdam_emissions"]="$rotterdam_emissions"
    ["eu_ets_volume"]="$eu_ets_volume"
    ["germany_premium"]="$germany_premium"
  )
  
  for metric_name in "${!metrics[@]}"; do
    local metric_value="${metrics[$metric_name]}"
    local min_val=0
    
    if [[ "$metric_name" == "fallback_rate" ]]; then
      min_val=0
    fi
    
    local validation_status=$(validate_metric "$metric_name" "$metric_value" "$min_val")
    
    if [[ "$validation_status" != "VALID" ]]; then
      all_valid=false
      log "WARN" "Metric ${metric_name}: ${validation_status}"
    else
      log "INFO" "✅ Metric ${metric_name}: VALID (${metric_value})"
    fi
    
    validation_results+=("${metric_name}|${metric_value}|${validation_status}")
  done
  
  # Validate fallback rate
  if (( $(echo "$fallback_rate > $MAX_FALLBACK_RATE" | bc -l 2>/dev/null || echo 0) )); then
    log "WARN" "Fallback rate too high: ${fallback_rate}% (threshold: ${MAX_FALLBACK_RATE}%)"
    all_valid=false
    validation_results+=("fallback_rate|${fallback_rate}|THRESHOLD_EXCEEDED")
  else
    log "INFO" "✅ Fallback rate acceptable: ${fallback_rate}%"
    validation_results+=("fallback_rate|${fallback_rate}|VALID")
  fi
  
  # Generate JSON report
  local json_report=$(cat <<EOF
{
  "timestamp": "${timestamp}",
  "api_endpoint": "${API_ENDPOINT}",
  "metrics": {
    "market_price": ${market_price},
    "carbon_intensity": ${carbon_intensity},
    "rotterdam_emissions": ${rotterdam_emissions},
    "eu_ets_volume": ${eu_ets_volume},
    "germany_premium": ${germany_premium},
    "fallback_rate": ${fallback_rate},
    "data_freshness_seconds": ${data_freshness}
  },
  "validation_summary": {
    "all_valid": $(if [[ "$all_valid" == true ]]; then echo "true"; else echo "false"; fi),
    "total_metrics": 6,
    "failed_metrics": $(( ! all_valid ))
  }
}
EOF
)
  
  echo "${json_report}" > "${report_json}"
  log "INFO" "JSON report saved to ${report_json}"
  
  # Generate CSV report
  {
    echo "timestamp,metric,value,status"
    for entry in "${validation_results[@]}"; do
      local metric=$(echo "$entry" | cut -d'|' -f1)
      local value=$(echo "$entry" | cut -d'|' -f2)
      local status=$(echo "$entry" | cut -d'|' -f3)
      echo "${timestamp},${metric},${value},${status}"
    done
  } > "${report_csv}"
  
  log "INFO" "CSV report saved to ${report_csv}"
  
  # Log report
  echo "" >> "${log_file}" 2>&1
  echo "${json_report}" >> "${log_file}" 2>&1
  
  if [[ "$all_valid" == true ]]; then
    log "INFO" "All metrics validation PASSED ✅"
    return 0
  else
    log "WARN" "Some metrics validation FAILED ❌"
    return 1
  fi
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
exit_code=$?

exit $exit_code
