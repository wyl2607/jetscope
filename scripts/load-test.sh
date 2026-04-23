#!/bin/bash
# Day 5: Load Testing Script — Data Contract v1 API
# Target: 1000 req/min sustained, p95 latency < 100ms
# Created: 2026-04-23

set -euo pipefail

# Configuration
API_ENDPOINT="${API_ENDPOINT:-http://localhost:8000/v1/market/snapshot}"
TOTAL_REQUESTS="${1:-300}"  # 5 min at 1 req/sec ≈ 300 req/min
CONCURRENT="${2:-16}"       # Concurrency to reach ~16.7 req/sec
TIMEOUT="${3:-10}"          # Request timeout
RESULTS_FILE="load-test-results-$(date +%s).json"

echo "🚀 Starting Load Test"
echo "  API Endpoint: $API_ENDPOINT"
echo "  Total Requests: $TOTAL_REQUESTS"
echo "  Concurrency: $CONCURRENT"
echo "  Results: $RESULTS_FILE"
echo ""

# Run Apache Bench with JSON output
ab_output=$(ab -n "$TOTAL_REQUESTS" -c "$CONCURRENT" -s "$TIMEOUT" "$API_ENDPOINT" 2>&1)

# Parse Apache Bench output
mean_latency=$(echo "$ab_output" | grep "Time per request:" | head -1 | awk '{print $4}')
p50_latency=$(echo "$ab_output" | grep "mean" | awk '{print $3}')  # Approximate
p95_latency=$(echo "$ab_output" | grep "95%" | awk '{print $3}')
p99_latency=$(echo "$ab_output" | grep "99%" | awk '{print $3}')
error_rate=$(echo "$ab_output" | grep "Failed requests" | awk '{print $3}')
success_rate=$(echo "$ab_output" | grep "Successful requests" | awk '{print $3}')
rps=$(echo "$ab_output" | grep "Requests per second" | awk '{print $4}')

# Extract HTTP status codes distribution
http_ok=$(echo "$ab_output" | grep "200" | awk '{print $3}' || echo "0")

# Create JSON report
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "api_endpoint": "$API_ENDPOINT",
  "load_test": {
    "total_requests": $TOTAL_REQUESTS,
    "concurrency": $CONCURRENT,
    "requests_per_second": $rps,
    "duration_seconds": $((TOTAL_REQUESTS / (CONCURRENT / 2)))
  },
  "latency_ms": {
    "mean": ${mean_latency%ms},
    "median_approx": ${p50_latency%ms},
    "p95": ${p95_latency%ms},
    "p99": ${p99_latency%ms}
  },
  "results": {
    "total": $TOTAL_REQUESTS,
    "success": $success_rate,
    "failed": $error_rate,
    "http_200": $http_ok,
    "success_rate_percent": $(echo "scale=2; ($success_rate / $TOTAL_REQUESTS) * 100" | bc)
  },
  "pass_fail": {
    "p95_latency_threshold_100ms": $([ $(echo "${p95_latency%ms} < 100" | bc) -eq 1 ] && echo "PASS" || echo "FAIL"),
    "zero_errors": $([ "$error_rate" -eq 0 ] && echo "PASS" || echo "FAIL"),
    "overall": $([ $(echo "${p95_latency%ms} < 100" | bc) -eq 1 ] && [ "$error_rate" -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL")
  }
}
EOF

# Display results
echo "📊 Load Test Results"
echo "===================="
cat "$RESULTS_FILE" | jq '.'

# Alert if thresholds exceeded
if (( $(echo "${p95_latency%ms} >= 100" | bc -l) )); then
  echo "🔴 ALERT: p95 latency (${p95_latency}) exceeds 100ms threshold"
  exit 1
fi

if [ "$error_rate" -gt 0 ]; then
  echo "🔴 ALERT: Errors detected ($error_rate failed requests)"
  exit 1
fi

echo ""
echo "✅ Load test PASSED"
echo "   p95 latency: ${p95_latency} (target: < 100ms)"
echo "   Error rate: $error_rate / $TOTAL_REQUESTS"
echo "   Requests/sec: $rps"
echo ""
echo "Results saved to: $RESULTS_FILE"
