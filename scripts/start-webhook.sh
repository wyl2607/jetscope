#!/bin/bash

################################################################################
# Start GitHub Webhook Server
# 
# This script starts the webhook server using Node.js
# It can run standalone or be managed by PM2
#
# Usage:
#   ./start-webhook.sh              # Start with default settings
#   ./start-webhook.sh --pm2        # Start with PM2
#   ./start-webhook.sh --port 3001  # Start on specific port
#   ./start-webhook.sh --help       # Show help
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBHOOK_SERVER="$SCRIPT_DIR/webhook-server.js"
LOG_DIR="$PROJECT_ROOT/webhook-logs"

# Default values
PORT=${WEBHOOK_PORT:-3001}
USE_PM2=false
NODE_ENV=${NODE_ENV:-production}

# Color codes
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

################################################################################
# Helper Functions
################################################################################

print_help() {
  cat <<EOF
${BLUE}GitHub Webhook Server - Start Script${NC}

Usage:
  ./start-webhook.sh [OPTIONS]

Options:
  --pm2              Use PM2 for process management
  --port PORT        Custom port (default: 3001)
  --env ENV          Node environment (default: production)
  --help             Show this help message

Environment Variables:
  WEBHOOK_PORT              Port to listen on (default: 3001)
  GITHUB_WEBHOOK_SECRET     Signing secret for webhook verification (REQUIRED)
  LOG_DIR                   Log directory (default: ./webhook-logs)
  NODE_ENV                  Node environment (default: production)

Examples:
  # Start webhook server
  ./start-webhook.sh

  # Start with PM2 process manager
  ./start-webhook.sh --pm2

  # Start on custom port with custom secret
  GITHUB_WEBHOOK_SECRET=my_secret WEBHOOK_PORT=4000 ./start-webhook.sh

EOF
}

check_prerequisites() {
  echo -e "${BLUE}Checking prerequisites...${NC}"
  
  # Check Node.js
  if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed${NC}"
    echo "Please install Node.js 20+ from https://nodejs.org/"
    exit 1
  fi
  
  local node_version=$(node -v)
  echo -e "${GREEN}✓${NC} Node.js: $node_version"
  
  # Check webhook server script
  if [[ ! -f "$WEBHOOK_SERVER" ]]; then
    echo -e "${RED}ERROR: Webhook server script not found: $WEBHOOK_SERVER${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} Webhook server script found"
  
  # Check auto-sync script
  local sync_script="$SCRIPT_DIR/auto-sync-cluster.sh"
  if [[ ! -f "$sync_script" ]]; then
    echo -e "${RED}ERROR: Auto-sync script not found: $sync_script${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} Auto-sync script found"
  
  # Create log directory
  mkdir -p "$LOG_DIR"
  echo -e "${GREEN}✓${NC} Log directory: $LOG_DIR"
  
  # Warn about missing GITHUB_WEBHOOK_SECRET
  if [[ -z "$GITHUB_WEBHOOK_SECRET" ]]; then
    echo -e "${YELLOW}⚠${NC}  GITHUB_WEBHOOK_SECRET not set (webhook signature verification disabled)"
  else
    echo -e "${GREEN}✓${NC} GITHUB_WEBHOOK_SECRET is set"
  fi
}

start_direct() {
  echo ""
  echo -e "${BLUE}=== Starting Webhook Server (Direct) ===${NC}"
  echo "Port:        $PORT"
  echo "Environment: $NODE_ENV"
  echo "Log Dir:     $LOG_DIR"
  echo ""
  
  export WEBHOOK_PORT="$PORT"
  export NODE_ENV="$NODE_ENV"
  export LOG_DIR="$LOG_DIR"
  
  echo -e "${YELLOW}→${NC} Press Ctrl+C to stop"
  echo ""
  
  node "$WEBHOOK_SERVER"
}

start_with_pm2() {
  echo ""
  echo -e "${BLUE}=== Starting Webhook Server (PM2) ===${NC}"
  
  # Check if PM2 is installed
  if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  PM2 not installed. Installing..."
    npm install -g pm2
  fi
  
  local pm2_config="$PROJECT_ROOT/ecosystem.config.js"
  
  if [[ -f "$pm2_config" ]]; then
    echo -e "${GREEN}✓${NC} Using PM2 config: $pm2_config"
    WEBHOOK_PORT="$PORT" NODE_ENV="$NODE_ENV" LOG_DIR="$LOG_DIR" \
      pm2 start "$pm2_config" --name webhook
  else
    echo -e "${YELLOW}⚠${NC}  PM2 config not found. Using direct start with pm2-runtime"
    WEBHOOK_PORT="$PORT" NODE_ENV="$NODE_ENV" LOG_DIR="$LOG_DIR" \
      pm2 start "$WEBHOOK_SERVER" --name webhook --node-args="--enable-source-maps"
  fi
  
  echo ""
  echo -e "${GREEN}✓${NC} Webhook server started with PM2"
  echo ""
  echo "Useful commands:"
  echo "  pm2 logs webhook           # View real-time logs"
  echo "  pm2 status webhook         # Check status"
  echo "  pm2 stop webhook           # Stop webhook"
  echo "  pm2 restart webhook        # Restart webhook"
  echo "  pm2 delete webhook         # Remove webhook"
  echo ""
}

################################################################################
# Parse Arguments
################################################################################

while [[ $# -gt 0 ]]; do
  case $1 in
    --pm2)
      USE_PM2=true
      shift
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --env)
      NODE_ENV="$2"
      shift 2
      ;;
    --help)
      print_help
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      print_help
      exit 1
      ;;
  esac
done

################################################################################
# Main
################################################################################

check_prerequisites

if [[ "$USE_PM2" == "true" ]]; then
  start_with_pm2
else
  start_direct
fi
