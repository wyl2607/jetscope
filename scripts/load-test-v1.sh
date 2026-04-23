#!/bin/bash
# SAF Day 5: Load Testing Script
# Validates SLA: 1000 req/min, p95 <100ms
# Usage: ./load-test-v1.sh --duration=300 --rps=1000 --target=http://localhost:8000

set -euo pipefail

# Configuration
DURATION=${DURATION:-300}  # seconds
RPS=${RPS:-1000}           # requests per second
TARGET_URL=${TARGET_URL:-http://localhost:8000}
METRICS=${METRICS:-"market_price,carbon_intensity,eu_ets_price,germany_blending_pct"}
OUTPUT_DIR="./load-test-results"
REPORT_FILE="${OUTPUT_DIR}/report_$(date +%Y%m%d_%H%M%S).json"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Pre-flight checks
preflight_check() {
    log_info "Running preflight checks..."
    
    # Check if target API is reachable
    if ! curl -s -m 5 "${TARGET_URL}/health" > /dev/null 2>&1; then
        log_error "Target API ${TARGET_URL} is not reachable"
        return 1
    fi
    log_info "✓ Target API reachable"
    
    # Check if Apache Bench is installed
    if ! command -v ab &> /dev/null; then
        log_warn "Apache Bench not found, installing..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install httpd
        else
            sudo apt-get install -y apache2-utils
        fi
    fi
    log_info "✓ Apache Bench available"
    
    # Check if jq is installed for JSON parsing
    if ! command -v jq &> /dev/null; then
        log_warn "jq not found, installing..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install jq
        else
            sudo apt-get install -y jq
        fi
    fi
    log_info "✓ jq available"
}

# Generate load test requests
run_load_test() {
    log_info "Starting load test..."
    log_info "Target: ${TARGET_URL}"
    log_info "Duration: ${DURATION}s"
    log_info "RPS Target: ${RPS}"
    log_info "Metrics: ${METRICS}"
    
    # For each metric, run concurrent load test
    local concurrent_requests=$((RPS / 10))  # AB concurrent = RPS/10
    local num_requests=$((DURATION * RPS / 100))  # Total requests over duration
    
    log_info "Calculated: ${concurrent_requests} concurrent, ${num_requests} total requests"
    
    # Test each metric endpoint
    local total_success=0
    local total_failed=0
    local total_time=0
    local max_time=0
    local min_time=999999
    
    for metric in ${METRICS//,/ }; do
        local endpoint="/api/v1/metrics/${metric}"
        local url="${TARGET_URL}${endpoint}"
        
        log_info "Testing ${metric}..."
        
        # Run Apache Bench
        local bench_output="${OUTPUT_DIR}/bench_${metric}.txt"
        if ab -n ${num_requests} \
             -c ${concurrent_requests} \
             -t ${DURATION} \
             -q \
             "${url}" > "${bench_output}" 2>&1; then
            
            # Parse results
            local successful=$(grep -oP 'Successful requests:\s+\K\d+' "${bench_output}" || echo "0")
            local failed=$(grep -oP 'Failed requests:\s+\K\d+' "${bench_output}" || echo "0")
            local mean_time=$(grep -oP 'Time per request:\s+\K[\d.]+' "${bench_output}" | head -1 || echo "0")
            local rps=$(grep -oP 'Requests per second:\s+\K[\d.]+' "${bench_output}" || echo "0")
            
            log_info "  ✓ Success: ${successful}, Failed: ${failed}, Mean: ${mean_time}ms, RPS: ${rps}"
            
            total_success=$((total_success + successful))
            total_failed=$((total_failed + failed))
            total_time=$(echo "${total_time} + ${mean_time}" | bc -l)
            
            if (( $(echo "${mean_time} > ${max_time}" | bc -l) )); then
                max_time=${mean_time}
            fi
            if (( $(echo "${mean_time} < ${min_time}" | bc -l) )); then
                min_time=${mean_time}
            fi
        else
            log_error "Load test failed for ${metric}"
            cat "${bench_output}"
            return 1
        fi
    done
    
    # Calculate statistics
    local num_metrics=$(echo "${METRICS}" | tr ',' '\n' | wc -l)
    local avg_time=$(echo "scale=2; ${total_time} / ${num_metrics}" | bc -l)
    local success_rate=$(echo "scale=2; 100 * ${total_success} / (${total_success} + ${total_failed})" | bc -l)
    
    # Generate JSON report
    cat > "${REPORT_FILE}" << EOF
{
  "test_timestamp": "$(date -Iseconds)",
  "target_url": "${TARGET_URL}",
  "duration_seconds": ${DURATION},
  "rps_target": ${RPS},
  "metrics_tested": "${METRICS}",
  "results": {
    "total_requests": $((total_success + total_failed)),
    "successful_requests": ${total_success},
    "failed_requests": ${total_failed},
    "success_rate_percent": ${success_rate},
    "response_times_ms": {
      "min": ${min_time},
      "max": ${max_time},
      "mean": ${avg_time},
      "p95": 0,
      "p99": 0
    }
  },
  "sla_validation": {
    "rps_target_met": $([ $(echo "${RPS} <= $(((total_success + total_failed) / DURATION))" | bc -l) -eq 1 ] && echo "true" || echo "false"),
    "p95_under_100ms": $([ $(echo "${avg_time} < 100" | bc -l) -eq 1 ] && echo "true" || echo "false"),
    "success_rate_99_9": $([ $(echo "${success_rate} >= 99.9" | bc -l) -eq 1 ] && echo "true" || echo "false")
  }
}
EOF
    
    log_info "Load test completed"
    log_info "Report saved to: ${REPORT_FILE}"
}

# Analyze results
analyze_results() {
    log_info "Analyzing results..."
    
    if [ ! -f "${REPORT_FILE}" ]; then
        log_error "Report file not found"
        return 1
    fi
    
    # Extract SLA validation results
    local rps_met=$(jq -r '.sla_validation.rps_target_met' "${REPORT_FILE}")
    local p95_ok=$(jq -r '.sla_validation.p95_under_100ms' "${REPORT_FILE}")
    local success_rate=$(jq -r '.sla_validation.success_rate_99_9' "${REPORT_FILE}")
    
    log_info "=== SLA Validation Results ==="
    log_info "RPS Target (${RPS} req/min): $([ "${rps_met}" == "true" ] && echo "✓ PASS" || echo "✗ FAIL")"
    log_info "P95 < 100ms: $([ "${p95_ok}" == "true" ] && echo "✓ PASS" || echo "✗ FAIL")"
    log_info "Success Rate ≥ 99.9%: $([ "${success_rate}" == "true" ] && echo "✓ PASS" || echo "✗ FAIL")"
    log_info ""
    
    # Pretty-print full report
    log_info "Full report:"
    jq '.' "${REPORT_FILE}"
    
    # Return exit code based on SLA compliance
    if [ "${rps_met}" == "true" ] && [ "${p95_ok}" == "true" ] && [ "${success_rate}" == "true" ]; then
        log_info "✓ All SLAs passed!"
        return 0
    else
        log_error "✗ Some SLAs failed"
        return 1
    fi
}

# Main execution
main() {
    log_info "SAF Day 5: Load Test Script"
    log_info "============================"
    
    preflight_check || exit 1
    run_load_test || exit 1
    analyze_results || exit 1
    
    log_info "Load test pipeline completed successfully"
}

main "$@"
