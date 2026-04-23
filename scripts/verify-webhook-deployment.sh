#!/bin/bash

################################################################################
# Webhook Deployment Verification Script
# 
# Verifies that the GitHub Webhook server is properly deployed and running
# 
# Usage:
#   ./scripts/verify-webhook-deployment.sh              # Local verification
#   ./scripts/verify-webhook-deployment.sh coco.local   # Remote verification
#
# Expected output: ✓ All checks passed
################################################################################

set -e

# Configuration
WEBHOOK_HOST="${1:-localhost}"
WEBHOOK_PORT="${WEBHOOK_PORT:-3001}"
CHECK_INTERVAL=5
MAX_RETRIES=12

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Helper functions
print_header() {
  echo ""
  echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASSED++))
}

print_error() {
  echo -e "${RED}✗${NC} $1"
  ((FAILED++))
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

check_environment() {
  print_header "Environment Check"
  
  # Check if running on coco or locally
  if [[ "$WEBHOOK_HOST" != "localhost" && "$WEBHOOK_HOST" != "127.0.0.1" ]]; then
    echo "Verifying remote deployment on: $WEBHOOK_HOST"
  else
    echo "Verifying local deployment"
  fi
  
  # Check Node.js
  if command -v node &> /dev/null; then
    local node_version=$(node -v)
    echo "Node.js: $node_version"
    
    # Check if v20+
    local major_version=$(echo "$node_version" | cut -d'.' -f1 | sed 's/v//')
    if [[ $major_version -ge 20 ]]; then
      print_success "Node.js v20+ installed"
    else
      print_error "Node.js version should be v20+ (found: $node_version)"
    fi
  else
    print_warning "Node.js not found in PATH"
  fi
  
  # Check npm
  if command -v npm &> /dev/null; then
    local npm_version=$(npm -v)
    echo "npm: $npm_version"
    print_success "npm installed"
  else
    print_warning "npm not found in PATH"
  fi
}

check_project_files() {
  print_header "Project Files Check"
  
  local project_root="/Users/yumei/SAFvsOil"
  
  # Check key files
  local files=(
    ".env.webhook"
    "scripts/webhook-server.js"
    "scripts/start-webhook.sh"
    "scripts/auto-sync-cluster.sh"
    "ecosystem.config.js"
  )
  
  for file in "${files[@]}"; do
    local full_path="$project_root/$file"
    if [[ -f "$full_path" ]]; then
      local size=$(stat -f%z "$full_path" 2>/dev/null || echo "N/A")
      print_success "$file ($size bytes)"
    else
      print_error "$file not found"
    fi
  done
  
  # Check log directory
  if [[ -d "$project_root/webhook-logs" ]]; then
    print_success "Log directory exists"
  else
    print_warning "Log directory not created yet (will be created on first run)"
  fi
}

check_port_availability() {
  print_header "Port Availability Check"
  
  if command -v lsof &> /dev/null; then
    if lsof -i :$WEBHOOK_PORT &>/dev/null; then
      print_success "Port $WEBHOOK_PORT is in use (webhook service running)"
    else
      print_warning "Port $WEBHOOK_PORT is available (webhook service not running)"
    fi
  else
    print_warning "lsof not available, skipping port check"
  fi
}

check_health_endpoint() {
  print_header "Health Endpoint Check"
  
  echo "Connecting to http://$WEBHOOK_HOST:$WEBHOOK_PORT/health"
  
  for attempt in $(seq 1 $MAX_RETRIES); do
    if response=$(curl -s -m 5 "http://$WEBHOOK_HOST:$WEBHOOK_PORT/health" 2>/dev/null); then
      if echo "$response" | grep -q '"status"'; then
        print_success "Health endpoint responded"
        echo "Response: $response" | head -c 100
        echo ""
        return 0
      fi
    fi
    
    if [[ $attempt -lt $MAX_RETRIES ]]; then
      echo "Retry $attempt/$MAX_RETRIES... waiting ${CHECK_INTERVAL}s"
      sleep $CHECK_INTERVAL
    fi
  done
  
  print_error "Health endpoint not responding (tried $MAX_RETRIES times)"
  return 1
}

check_webhook_status() {
  print_header "Webhook Status Check"
  
  echo "Checking recent webhook events..."
  
  if response=$(curl -s -m 5 "http://$WEBHOOK_HOST:$WEBHOOK_PORT/webhook/status?limit=5" 2>/dev/null); then
    if echo "$response" | grep -q '"events"'; then
      print_success "Webhook status endpoint responded"
      echo "Response: $response" | head -c 100
      echo ""
      return 0
    fi
  fi
  
  print_warning "Webhook status endpoint not responding (service may not have received events yet)"
  return 0
}

check_env_webhook() {
  print_header ".env.webhook Configuration Check"
  
  local env_file="/Users/yumei/SAFvsOil/.env.webhook"
  
  if [[ ! -f "$env_file" ]]; then
    print_error ".env.webhook not found"
    return 1
  fi
  
  # Check required variables
  local required_vars=(
    "GITHUB_WEBHOOK_SECRET"
    "WEBHOOK_PORT"
  )
  
  for var in "${required_vars[@]}"; do
    if grep -q "^${var}=" "$env_file"; then
      local value=$(grep "^${var}=" "$env_file" | cut -d'=' -f2 | cut -c1-20)...
      print_success "$var is configured (value: $value)"
    else
      print_error "$var not found in .env.webhook"
    fi
  done
}

check_pm2_status() {
  print_header "PM2 Status Check"
  
  if command -v pm2 &> /dev/null; then
    if pm2 list 2>/dev/null | grep -q "webhook"; then
      print_success "PM2 process 'webhook' is registered"
      
      local status=$(pm2 list 2>/dev/null | grep webhook | grep -oE "(online|stopped|failed)")
      if [[ "$status" == "online" ]]; then
        print_success "PM2 webhook process is online"
      else
        print_warning "PM2 webhook process status: $status"
      fi
    else
      print_warning "PM2 webhook process not found (service may be running directly)"
    fi
  else
    print_warning "PM2 not installed (consider: npm install pm2 -g)"
  fi
}

generate_report() {
  print_header "Deployment Verification Report"
  
  local total=$((PASSED + FAILED))
  local percentage=$((PASSED * 100 / total))
  
  echo "Results: $PASSED/$total checks passed ($percentage%)"
  echo ""
  
  if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All checks passed! Webhook service is ready.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure GitHub webhook at: https://github.com/wyl2607/safvsoil/settings/hooks"
    echo "  2. Add webhook URL: http://coco.local:$WEBHOOK_PORT/webhook/push"
    echo "  3. Set Secret to value from .env.webhook"
    echo "  4. Select 'Push events' only"
    echo "  5. Test webhook by pushing to master branch"
    return 0
  else
    echo -e "${RED}✗ $FAILED check(s) failed. See details above.${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if webhook service is running: pm2 status"
    echo "  2. Review logs: pm2 logs webhook"
    echo "  3. Verify .env.webhook is configured correctly"
    echo "  4. Ensure port 3001 is not blocked by firewall"
    return 1
  fi
}

main() {
  echo ""
  echo -e "${BLUE}GitHub Webhook Deployment Verification${NC}"
  echo "Host: $WEBHOOK_HOST"
  echo "Port: $WEBHOOK_PORT"
  echo "Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  
  check_environment
  check_project_files
  check_env_webhook
  check_port_availability
  check_pm2_status
  
  # Only check endpoints if we're doing local checks or have connectivity
  if [[ "$WEBHOOK_HOST" == "localhost" || "$WEBHOOK_HOST" == "127.0.0.1" ]]; then
    check_health_endpoint || true
    check_webhook_status || true
  else
    echo ""
    echo "Remote health checks disabled for non-local hosts"
    echo "Run this script on coco for full verification:"
    echo "  ssh user@coco.local"
    echo "  cd /Users/yumei/SAFvsOil"
    echo "  ./scripts/verify-webhook-deployment.sh"
  fi
  
  generate_report
}

main "$@"
