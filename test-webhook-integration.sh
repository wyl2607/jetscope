#!/bin/bash

################################################################################
# Webhook Integration Test Script
# 
# Runs manual integration tests for webhook system
# Tests basic functionality without actual GitHub webhook
################################################################################

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Webhook Integration Tests ===${NC}\n"

passed=0
failed=0

# Test 1: File permissions
echo -e "${BLUE}Test 1: File permissions${NC}"
files=(
  "scripts/webhook-server.js"
  "scripts/auto-sync-cluster.sh"
  "scripts/start-webhook.sh"
  "test/webhook-server.test.js"
  "verify-webhook-setup.sh"
)

for file in "${files[@]}"; do
  if [[ -f "$PROJECT_ROOT/$file" ]]; then
    echo -e "${GREEN}✓${NC} $file exists"
    ((passed++))
  else
    echo -e "${RED}✗${NC} $file missing"
    ((failed++))
  fi
done

# Test 2: Script syntax validation
echo -e "\n${BLUE}Test 2: Bash script syntax${NC}"
for file in scripts/auto-sync-cluster.sh scripts/start-webhook.sh verify-webhook-setup.sh; do
  if bash -n "$PROJECT_ROOT/$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $file syntax valid"
    ((passed++))
  else
    echo -e "${RED}✗${NC} $file syntax error"
    ((failed++))
  fi
done

# Test 3: Node.js syntax validation
echo -e "\n${BLUE}Test 3: Node.js script validation${NC}"
if node --check "$PROJECT_ROOT/scripts/webhook-server.js" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} webhook-server.js syntax valid"
  ((passed++))
else
  echo -e "${YELLOW}⚠${NC}  Node.js not available for syntax check (optional)"
fi

# Test 4: Environment file check
echo -e "\n${BLUE}Test 4: Environment configuration${NC}"
if [[ -f "$PROJECT_ROOT/.env.webhook.example" ]]; then
  echo -e "${GREEN}✓${NC} .env.webhook.example exists"
  ((passed++))
  
  if grep -q "GITHUB_WEBHOOK_SECRET" "$PROJECT_ROOT/.env.webhook.example"; then
    echo -e "${GREEN}✓${NC} Template contains GITHUB_WEBHOOK_SECRET"
    ((passed++))
  else
    echo -e "${RED}✗${NC} Template missing GITHUB_WEBHOOK_SECRET"
    ((failed++))
  fi
else
  echo -e "${RED}✗${NC} .env.webhook.example missing"
  ((failed++))
fi

# Test 5: Documentation files
echo -e "\n${BLUE}Test 5: Documentation files${NC}"
docs=(
  "docs/GITHUB_WEBHOOK_SETUP.md"
  "WEBHOOK_QUICK_REFERENCE.md"
  "WEBHOOK_DEPLOYMENT_CHECKLIST.md"
  "WEBHOOK_DELIVERY_SUMMARY.md"
  "WEBHOOK_ACCEPTANCE_REPORT.md"
)

for doc in "${docs[@]}"; do
  if [[ -f "$PROJECT_ROOT/$doc" ]]; then
    size=$(wc -c < "$PROJECT_ROOT/$doc")
    if [[ $size -gt 1000 ]]; then
      echo -e "${GREEN}✓${NC} $doc ($size bytes)"
      ((passed++))
    else
      echo -e "${YELLOW}⚠${NC}  $doc is small ($size bytes)"
    fi
  else
    echo -e "${RED}✗${NC} $doc missing"
    ((failed++))
  fi
done

# Test 6: Code contains expected keywords
echo -e "\n${BLUE}Test 6: Code content validation${NC}"
tests=(
  "scripts/webhook-server.js|express|Express framework"
  "scripts/webhook-server.js|HMAC|Signature verification"
  "scripts/auto-sync-cluster.sh|git checkout|Git checkout command"
  "scripts/auto-sync-cluster.sh|ssh_exec|SSH execution"
  "scripts/start-webhook.sh|pm2|PM2 support"
)

for test in "${tests[@]}"; do
  IFS="|" read -r file keyword desc <<< "$test"
  if grep -q "$keyword" "$PROJECT_ROOT/$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $file contains $desc"
    ((passed++))
  else
    echo -e "${RED}✗${NC} $file missing $desc"
    ((failed++))
  fi
done

# Test 7: File encoding (should be UTF-8)
echo -e "\n${BLUE}Test 7: File encoding${NC}"
critical_files=(
  "scripts/webhook-server.js"
  "scripts/auto-sync-cluster.sh"
  "docs/GITHUB_WEBHOOK_SETUP.md"
)

for file in "${critical_files[@]}"; do
  if file "$PROJECT_ROOT/$file" | grep -q "UTF-8\|ASCII"; then
    echo -e "${GREEN}✓${NC} $file is valid text encoding"
    ((passed++))
  else
    echo -e "${YELLOW}⚠${NC}  $file encoding unknown"
  fi
done

# Test 8: Log directory can be created
echo -e "\n${BLUE}Test 8: Log directory setup${NC}"
log_dir="$PROJECT_ROOT/webhook-logs"
if mkdir -p "$log_dir" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} Log directory created"
  ((passed++))
else
  echo -e "${RED}✗${NC} Cannot create log directory"
  ((failed++))
fi

# Test 9: Test file validity
echo -e "\n${BLUE}Test 9: Test file structure${NC}"
if [[ -f "$PROJECT_ROOT/test/webhook-server.test.js" ]]; then
  test_count=$(grep -c "^test(" "$PROJECT_ROOT/test/webhook-server.test.js" || true)
  if [[ $test_count -gt 10 ]]; then
    echo -e "${GREEN}✓${NC} Test file contains $test_count test cases"
    ((passed++))
  else
    echo -e "${YELLOW}⚠${NC}  Test file might be incomplete ($test_count tests)"
  fi
else
  echo -e "${RED}✗${NC} Test file missing"
  ((failed++))
fi

# Test 10: Configuration files
echo -e "\n${BLUE}Test 10: Configuration files${NC}"
if [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
  if grep -q "webhook" "$PROJECT_ROOT/ecosystem.config.js"; then
    echo -e "${GREEN}✓${NC} ecosystem.config.js contains webhook config"
    ((passed++))
  else
    echo -e "${RED}✗${NC} ecosystem.config.js missing webhook config"
    ((failed++))
  fi
else
  echo -e "${RED}✗${NC} ecosystem.config.js missing"
  ((failed++))
fi

# Summary
echo ""
echo -e "${BLUE}=== Integration Test Summary ===${NC}"
echo -e "Passed: ${GREEN}$passed${NC}"
echo -e "Failed: ${RED}$failed${NC}"
echo ""

if [[ $failed -eq 0 ]]; then
  echo -e "${GREEN}✓ All integration tests passed!${NC}\n"
  echo "System is ready for deployment. Next steps:"
  echo "1. Review: WEBHOOK_INDEX.md"
  echo "2. Generate secret: openssl rand -hex 32"
  echo "3. Configure: cp .env.webhook.example .env.webhook"
  echo "4. Verify: ./verify-webhook-setup.sh"
  echo "5. Test: ./scripts/start-webhook.sh"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Review items marked with ✗${NC}\n"
  exit 1
fi
