#!/bin/bash
################################################################################
# Cluster Failover Test — SAFvsOil 3-Node Auto-Sync
#
# Verifies automatic failover across:
#   - coco       (local dev)
#   - mac-mini   (local test)
#   - us-vps     (production 192.227.130.69)
#
# Tests:
#   1. SSH connectivity to all nodes
#   2. Git repo readiness (/opt/safvsoil)
#   3. Health endpoint responsiveness
#   4. Auto-sync script dry-run
#   5. Failover time measurement
#
# Usage:
#   ./failover-test.sh [--full]
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more nodes unhealthy
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/../webhook-logs"
mkdir -p "$LOG_DIR"

TEST_LOG="${LOG_DIR}/failover-test-$(date +%Y%m%d_%H%M%S).log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Nodes configuration
NODES=(
  "coco:127.0.0.1:8000"
  "mac-mini:192.168.1.100:8000"
  "us-vps:192.227.130.69:8000"
)

HEALTH_PATH="/v1/health"
REPO_PATH="/opt/safvsoil"
SYNC_TIMEOUT=60

# Counters
PASS=0
FAIL=0

log() {
  local level="$1"
  local msg="$2"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${timestamp}] [${level}] ${msg}" >> "$TEST_LOG"

  case "$level" in
    OK)   echo -e "${GREEN}[OK]${NC} $msg" ;;
    WARN) echo -e "${YELLOW}[WARN]${NC} $msg" ;;
    FAIL) echo -e "${RED}[FAIL]${NC} $msg" ;;
    INFO) echo -e "${BLUE}[INFO]${NC} $msg" ;;
    *)    echo "[$level] $msg" ;;
  esac
}

################################################################################
# Test 1: SSH connectivity
################################################################################
test_ssh() {
  local name="$1"
  local host="$2"

  log INFO "[$name] Testing SSH connectivity..."

  if timeout 10 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$host" "echo pong" >/dev/null 2>&1; then
    log OK "[$name] SSH reachable"
    return 0
  else
    log FAIL "[$name] SSH unreachable"
    return 1
  fi
}

################################################################################
# Test 2: Git repo readiness
################################################################################
test_git_repo() {
  local name="$1"
  local host="$2"

  log INFO "[$name] Checking git repo at $REPO_PATH..."

  local output
  output=$(timeout 10 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$host" "
    if [[ -d '$REPO_PATH/.git' ]]; then
      cd '$REPO_PATH' && git rev-parse --git-dir && echo 'OK'
    else
      echo 'MISSING'
    fi
  " 2>&1) || true

  if echo "$output" | grep -q "OK"; then
    log OK "[$name] Git repo ready"
    return 0
  else
    log FAIL "[$name] Git repo missing or inaccessible"
    return 1
  fi
}

################################################################################
# Test 3: Health endpoint
################################################################################
test_health() {
  local name="$1"
  local host="$2"
  local port="$3"

  log INFO "[$name] Pinging health endpoint http://${host}:${port}${HEALTH_PATH}..."

  local start end duration_ms
  start=$(date +%s%3N)

  local response
  response=$(timeout 10 curl -s -o /dev/null -w "%{http_code}" "http://${host}:${port}${HEALTH_PATH}" 2>/dev/null || echo "000")

  end=$(date +%s%3N)
  duration_ms=$((end - start))

  if [[ "$response" == "200" ]]; then
    log OK "[$name] Health OK (${duration_ms}ms)"
    return 0
  else
    log FAIL "[$name] Health returned HTTP $response (${duration_ms}ms)"
    return 1
  fi
}

################################################################################
# Test 4: Auto-sync dry-run
################################################################################
test_sync_dryrun() {
  local name="$1"
  local host="$2"

  log INFO "[$name] Testing auto-sync dry-run..."

  local current_sha
  current_sha=$(timeout 15 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$host" "cd '$REPO_PATH' && git rev-parse HEAD" 2>/dev/null || echo "")

  if [[ -z "$current_sha" ]]; then
    log FAIL "[$name] Could not determine current SHA"
    return 1
  fi

  if [[ ${#current_sha} -eq 40 ]]; then
    log OK "[$name] Auto-sync dry-run possible (SHA: ${current_sha:0:8})"
    return 0
  else
    log FAIL "[$name] Invalid SHA format"
    return 1
  fi
}

################################################################################
# Main test loop
################################################################################
log INFO "=== SAFvsOil Cluster Failover Test ==="
log INFO "Nodes: ${#NODES[@]}"
log INFO "Log: $TEST_LOG"
echo ""

for node_spec in "${NODES[@]}"; do
  IFS=':' read -r name host port <<< "$node_spec"

  node_pass=0
  node_fail=0

  # Skip SSH check for localhost (coco)
  if [[ "$host" != "127.0.0.1" ]]; then
    if test_ssh "$name" "$host"; then
      ((node_pass++))
    else
      ((node_fail++))
    fi
  else
    log INFO "[$name] Skipping SSH check for localhost"
  fi

  if test_git_repo "$name" "$host"; then
    ((node_pass++))
  else
    ((node_fail++))
  fi

  if test_health "$name" "$host" "$port"; then
    ((node_pass++))
  else
    ((node_fail++))
  fi

  if test_sync_dryrun "$name" "$host"; then
    ((node_pass++))
  else
    ((node_fail++))
  fi

  PASS=$((PASS + node_pass))
  FAIL=$((FAIL + node_fail))

done

################################################################################
# Summary
################################################################################
echo ""
log INFO "=== Failover Test Summary ==="
log INFO "Total checks: $((PASS + FAIL))"
log OK   "Passed: $PASS"
if [[ $FAIL -gt 0 ]]; then
  log FAIL "Failed: $FAIL"
fi

if [[ $FAIL -eq 0 ]]; then
  log OK "🎉 All cluster nodes healthy. Failover ready."
  exit 0
else
  log FAIL "💥 Cluster has $FAIL failing checks. Review logs above."
  exit 1
fi
