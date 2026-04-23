#!/bin/bash

################################################################################
# Webhook Verification Script
# 
# Verifies all webhook components are correctly set up
# Run before deployment
################################################################################

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== SAFvsOil Webhook Verification ===${NC}\n"

# Counter for checks
passed=0
failed=0

# Helper function
check_file() {
  local file="$1"
  local description="$2"
  
  if [[ -f "$file" ]]; then
    echo -e "${GREEN}✓${NC} $description"
    ((passed++))
    return 0
  else
    echo -e "${RED}✗${NC} $description (not found: $file)"
    ((failed++))
    return 1
  fi
}

# Check all required files
echo "Checking files..."
check_file "$PROJECT_ROOT/scripts/webhook-server.js" "Webhook server"
check_file "$PROJECT_ROOT/scripts/auto-sync-cluster.sh" "Auto-sync script"
check_file "$PROJECT_ROOT/scripts/start-webhook.sh" "Start script"
check_file "$PROJECT_ROOT/ecosystem.config.js" "PM2 config"
check_file "$PROJECT_ROOT/.env.webhook.example" "Environment template"
check_file "$PROJECT_ROOT/docs/GITHUB_WEBHOOK_SETUP.md" "Setup guide"
check_file "$PROJECT_ROOT/test/webhook-server.test.js" "Test suite"

echo ""
echo "Checking dependencies..."

# Check Node.js
if command -v node &> /dev/null; then
  node_version=$(node -v)
  echo -e "${GREEN}✓${NC} Node.js installed: $node_version"
  ((passed++))
else
  echo -e "${RED}✗${NC} Node.js not installed (required: 20+)"
  ((failed++))
fi

# Check if express is available (optional check)
if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  if grep -q '"express"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Express in package.json"
    ((passed++))
  else
    echo -e "${YELLOW}⚠${NC}  Express not listed in package.json (install with: npm install express)"
  fi
fi

echo ""
echo "Checking file permissions..."

# Check if scripts have correct permissions (not required, but recommended)
if [[ -x "$PROJECT_ROOT/scripts/webhook-server.js" ]]; then
  echo -e "${GREEN}✓${NC} webhook-server.js is executable"
  ((passed++))
else
  echo -e "${YELLOW}⚠${NC}  webhook-server.js not executable (fix: chmod +x scripts/webhook-server.js)"
fi

if [[ -x "$PROJECT_ROOT/scripts/auto-sync-cluster.sh" ]]; then
  echo -e "${GREEN}✓${NC} auto-sync-cluster.sh is executable"
  ((passed++))
else
  echo -e "${YELLOW}⚠${NC}  auto-sync-cluster.sh not executable (fix: chmod +x scripts/auto-sync-cluster.sh)"
fi

if [[ -x "$PROJECT_ROOT/scripts/start-webhook.sh" ]]; then
  echo -e "${GREEN}✓${NC} start-webhook.sh is executable"
  ((passed++))
else
  echo -e "${YELLOW}⚠${NC}  start-webhook.sh not executable (fix: chmod +x scripts/start-webhook.sh)"
fi

echo ""
echo "Checking environment setup..."

if [[ -f "$PROJECT_ROOT/.env.webhook" ]]; then
  echo -e "${GREEN}✓${NC} .env.webhook exists"
  ((passed++))
  
  if grep -q "GITHUB_WEBHOOK_SECRET=" "$PROJECT_ROOT/.env.webhook" 2>/dev/null; then
    if ! grep -q "your_secret_here" "$PROJECT_ROOT/.env.webhook" 2>/dev/null; then
      echo -e "${GREEN}✓${NC} GITHUB_WEBHOOK_SECRET is configured"
      ((passed++))
    else
      echo -e "${YELLOW}⚠${NC}  GITHUB_WEBHOOK_SECRET not set (still using placeholder)"
    fi
  fi
else
  echo -e "${YELLOW}⚠${NC}  .env.webhook not configured (copy from .env.webhook.example)"
fi

echo ""
echo "File size verification..."

files_to_check=(
  "scripts/webhook-server.js"
  "scripts/auto-sync-cluster.sh"
  "scripts/start-webhook.sh"
  "test/webhook-server.test.js"
)

for file in "${files_to_check[@]}"; do
  if [[ -f "$PROJECT_ROOT/$file" ]]; then
    size=$(wc -c < "$PROJECT_ROOT/$file")
    if [[ $size -gt 100 ]]; then
      echo -e "${GREEN}✓${NC} $file: $size bytes"
      ((passed++))
    else
      echo -e "${RED}✗${NC} $file: Too small ($size bytes)"
      ((failed++))
    fi
  fi
done

echo ""
echo "Quick code validation..."

# Check for syntax errors (basic validation)
if grep -q "express" "$PROJECT_ROOT/scripts/webhook-server.js" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} webhook-server.js contains express import"
  ((passed++))
else
  echo -e "${RED}✗${NC} webhook-server.js missing express"
  ((failed++))
fi

if grep -q "auto-sync-cluster.sh" "$PROJECT_ROOT/scripts/webhook-server.js" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} webhook-server references sync script"
  ((passed++))
else
  echo -e "${RED}✗${NC} webhook-server missing sync script reference"
  ((failed++))
fi

if grep -q "git checkout" "$PROJECT_ROOT/scripts/auto-sync-cluster.sh" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} auto-sync-cluster.sh contains git checkout"
  ((passed++))
else
  echo -e "${RED}✗${NC} auto-sync-cluster.sh missing git checkout"
  ((failed++))
fi

if grep -q "GITHUB_WEBHOOK_SECRET" "$PROJECT_ROOT/scripts/webhook-server.js" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} webhook-server validates secret"
  ((passed++))
else
  echo -e "${RED}✗${NC} webhook-server missing secret validation"
  ((failed++))
fi

# Summary
echo ""
echo -e "${BLUE}=== Verification Summary ===${NC}"
echo -e "Passed: ${GREEN}$passed${NC}"
echo -e "Failed: ${RED}$failed${NC}"

if [[ $failed -eq 0 ]]; then
  echo ""
  echo -e "${GREEN}✓ All checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Configure .env.webhook with your GITHUB_WEBHOOK_SECRET"
  echo "2. Run: ./scripts/start-webhook.sh"
  echo "3. Test: curl http://localhost:3001/health"
  echo "4. Configure GitHub webhook to: https://your-domain.com/webhook/push"
  echo ""
  exit 0
else
  echo ""
  echo -e "${YELLOW}⚠  Some checks failed. Review items marked with ✗${NC}"
  exit 1
fi
