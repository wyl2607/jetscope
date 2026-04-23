#!/bin/bash

################################################################################
# SAFvsOil Webhook Deployment - One-Command Setup
# 
# This script performs a complete webhook deployment in one go
# 
# Usage:
#   # Full deployment
#   curl https://raw.githubusercontent.com/wyl2607/safvsoil/master/scripts/deploy-webhook.sh | bash
#   
#   # Or local execution
#   ./scripts/deploy-webhook.sh [--method=direct|pm2] [--port=3001]
#
# Prerequisites:
#   - Node.js v20+
#   - .env.webhook configured (see .env.webhook.example)
#   - Being on coco (Mac-mini)
################################################################################

set -e

# Configuration
DEPLOY_METHOD=${1:-pm2}  # direct or pm2
WEBHOOK_PORT=${2:-3001}
PROJECT_ROOT="${PROJECT_ROOT:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
STEP=0

step() {
  ((STEP++))
  echo ""
  echo -e "${BLUE}[Step $STEP] $1${NC}"
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

error() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# Helper: Check Node.js
check_node() {
  step "Checking Node.js"
  
  if ! command -v node &> /dev/null; then
    error "Node.js not found. Please install Node.js v20+"
  fi
  
  local node_version=$(node -v)
  echo "Node.js version: $node_version"
  
  local major=$(echo "$node_version" | cut -d'.' -f1 | sed 's/v//')
  if [[ $major -lt 20 ]]; then
    error "Node.js v20+ required (found: $node_version)"
  fi
  
  success "Node.js is compatible"
}

# Helper: Check .env.webhook
check_env() {
  step "Checking .env.webhook"
  
  local env_file="$PROJECT_ROOT/.env.webhook"
  
  if [[ ! -f "$env_file" ]]; then
    error ".env.webhook not found at $env_file"
  fi
  
  if ! grep -q "GITHUB_WEBHOOK_SECRET=" "$env_file"; then
    error "GITHUB_WEBHOOK_SECRET not found in .env.webhook"
  fi
  
  success ".env.webhook is configured"
}

# Helper: Create log directory
setup_logs() {
  step "Setting up log directory"
  
  local log_dir="$PROJECT_ROOT/webhook-logs"
  mkdir -p "$log_dir"
  
  success "Log directory ready: $log_dir"
}

# Helper: Install dependencies
install_deps() {
  step "Installing dependencies"
  
  # Check if node_modules exists
  if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
    echo "Running: npm install"
    cd "$PROJECT_ROOT"
    npm install --silent
  else
    success "Dependencies already installed"
  fi
}

# Helper: Make scripts executable
make_executable() {
  step "Making scripts executable"
  
  chmod +x "$PROJECT_ROOT/scripts/webhook-server.js" 2>/dev/null || true
  chmod +x "$PROJECT_ROOT/scripts/start-webhook.sh" 2>/dev/null || true
  chmod +x "$PROJECT_ROOT/scripts/auto-sync-cluster.sh" 2>/dev/null || true
  
  success "Scripts are executable"
}

# Helper: Deploy with method
deploy() {
  step "Deploying webhook service ($DEPLOY_METHOD mode)"
  
  # Load environment
  export $(cat "$PROJECT_ROOT/.env.webhook" | xargs)
  
  if [[ "$DEPLOY_METHOD" == "pm2" ]]; then
    deploy_pm2
  elif [[ "$DEPLOY_METHOD" == "direct" ]]; then
    deploy_direct
  else
    error "Unknown deployment method: $DEPLOY_METHOD"
  fi
}

# Deploy with PM2
deploy_pm2() {
  # Check if PM2 is installed
  if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2 --silent
  fi
  
  # Start with PM2
  cd "$PROJECT_ROOT"
  
  # Remove existing webhook process if present
  pm2 delete webhook 2>/dev/null || true
  
  echo "Starting webhook with PM2..."
  WEBHOOK_PORT="$WEBHOOK_PORT" NODE_ENV=production pm2 start \
    "$PROJECT_ROOT/scripts/webhook-server.js" \
    --name webhook \
    --node-args="--enable-source-maps" \
    --max-memory-restart 500M \
    --log-date-format "YYYY-MM-DD HH:mm:ss Z"
  
  # Save PM2 config
  pm2 save
  
  success "Webhook service started with PM2"
  success "Process is managed by PM2"
}

# Deploy direct (for testing)
deploy_direct() {
  echo "Starting webhook server directly..."
  echo "Press Ctrl+C to stop"
  echo ""
  
  cd "$PROJECT_ROOT"
  WEBHOOK_PORT="$WEBHOOK_PORT" NODE_ENV=production \
    node "$PROJECT_ROOT/scripts/webhook-server.js"
}

# Verify deployment
verify_deployment() {
  step "Verifying deployment"
  
  if [[ "$DEPLOY_METHOD" != "pm2" ]]; then
    warning "Skipping verification in direct mode (service running in foreground)"
    return 0
  fi
  
  # Wait for service to start
  sleep 2
  
  # Check PM2 status
  if pm2 list 2>/dev/null | grep -q "webhook"; then
    local status=$(pm2 list 2>/dev/null | grep webhook | grep -oE "(online|stopped|failed)")
    
    if [[ "$status" == "online" ]]; then
      success "Webhook process is online"
    else
      warning "Webhook process status: $status"
    fi
  else
    error "Webhook process not found in PM2"
  fi
  
  # Try health check (with retries)
  echo "Waiting for health endpoint to be available..."
  
  for i in {1..10}; do
    if curl -s http://localhost:$WEBHOOK_PORT/health | grep -q '"status"'; then
      success "Health endpoint is responding"
      echo "Endpoint: http://localhost:$WEBHOOK_PORT/health"
      return 0
    fi
    
    if [[ $i -lt 10 ]]; then
      echo "Retry $i/10..."
      sleep 1
    fi
  done
  
  error "Health endpoint not responding after 10 retries"
}

# Show completion info
show_completion() {
  step "Deployment Complete!"
  
  echo ""
  echo -e "${GREEN}✅ Webhook service is ready${NC}"
  echo ""
  
  if [[ "$DEPLOY_METHOD" == "pm2" ]]; then
    echo "Useful PM2 commands:"
    echo "  pm2 logs webhook             # View real-time logs"
    echo "  pm2 status webhook           # Check process status"
    echo "  pm2 restart webhook          # Restart the service"
    echo "  pm2 stop webhook             # Stop the service"
    echo "  pm2 startup && pm2 save      # Enable auto-start on reboot"
    echo ""
  fi
  
  echo "Next steps:"
  echo "  1. Verify deployment:"
  echo "     curl http://localhost:$WEBHOOK_PORT/health"
  echo ""
  echo "  2. Configure GitHub webhook:"
  echo "     https://github.com/wyl2607/safvsoil/settings/hooks"
  echo "     Payload URL: http://coco.local:$WEBHOOK_PORT/webhook/push"
  echo "     Secret: (see .env.webhook)"
  echo ""
  echo "  3. Test by pushing to master branch"
  echo ""
  
  echo "Documentation:"
  echo "  - Quick start: WEBHOOK_QUICK_START.md"
  echo "  - Full guide: WEBHOOK_DEPLOYMENT_GUIDE.md"
  echo "  - Verification: ./scripts/verify-webhook-deployment.sh"
  echo ""
}

# Main
main() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  SAFvsOil GitHub Webhook Deployment${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Project: $PROJECT_ROOT"
  echo "Method:  $DEPLOY_METHOD"
  echo "Port:    $WEBHOOK_PORT"
  echo ""
  
  # Run deployment steps
  check_node
  check_env
  setup_logs
  install_deps
  make_executable
  
  # Skip verification if using direct method
  if [[ "$DEPLOY_METHOD" != "direct" ]]; then
    deploy
    verify_deployment
    show_completion
  else
    deploy  # This runs forever in direct mode
  fi
}

# Parse arguments
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
  cat <<EOF
SAFvsOil Webhook Deployment Script

Usage:
  ./scripts/deploy-webhook.sh [OPTIONS]

Options:
  --method=pm2      Use PM2 for process management (default)
  --method=direct   Start directly (for development/testing)
  --port=PORT       Port to listen on (default: 3001)
  --help            Show this help message

Examples:
  # Deploy with PM2 (recommended for production)
  ./scripts/deploy-webhook.sh --method=pm2

  # Deploy directly (for testing)
  ./scripts/deploy-webhook.sh --method=direct

  # Deploy on custom port
  ./scripts/deploy-webhook.sh --method=pm2 --port=3002

Environment Variables:
  PROJECT_ROOT      Project directory (default: current directory)
  NODE_ENV          Node environment (default: production)

EOF
  exit 0
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --method=*)
      DEPLOY_METHOD="${1#*=}"
      shift
      ;;
    --port=*)
      WEBHOOK_PORT="${1#*=}"
      shift
      ;;
    *)
      error "Unknown option: $1"
      ;;
  esac
done

# Run deployment
main
