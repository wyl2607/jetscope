#!/bin/bash
set -euo pipefail

# SAFvsOil Cron Setup Script
# Installs/manages cron jobs for automated health checks and validation
# Run as: sudo bash scripts/setup_cron.sh

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CRON_CONFIG="${SCRIPT_DIR}/cron_config.txt"
LOG_DIR="/var/log/safvsoil"
CRON_IDENTIFIER="safvsoil-automation"

# ============================================================================
# Helper Functions
# ============================================================================

log() {
  local level="$1"
  shift
  local msg="$*"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] ${msg}"
}

check_requirements() {
  log "INFO" "Checking requirements..."
  
  # Check if running as root or with sudo
  if [[ $EUID -ne 0 ]]; then
    log "ERROR" "This script must be run as root (use sudo)"
    return 1
  fi
  
  # Check if cron config file exists
  if [[ ! -f "$CRON_CONFIG" ]]; then
    log "ERROR" "Cron config file not found: $CRON_CONFIG"
    return 1
  fi
  
  # Check if scripts are executable
  if [[ ! -x "${PROJECT_ROOT}/scripts/health_check.sh" ]]; then
    log "ERROR" "health_check.sh not executable"
    return 1
  fi
  
  if [[ ! -x "${PROJECT_ROOT}/scripts/validate.sh" ]]; then
    log "ERROR" "validate.sh not executable"
    return 1
  fi
  
  log "INFO" "✅ All requirements met"
  return 0
}

setup_log_directory() {
  log "INFO" "Setting up log directory: $LOG_DIR"
  
  mkdir -p "$LOG_DIR"
  touch "${LOG_DIR}/health_check.log"
  touch "${LOG_DIR}/validate.log"
  touch "${LOG_DIR}/backup.log"
  
  # Set permissions
  chmod 755 "$LOG_DIR"
  chmod 644 "${LOG_DIR}"/*.log
  
  # Create reports subdirectory
  mkdir -p "${LOG_DIR}/reports"
  chmod 755 "${LOG_DIR}/reports"
  
  log "INFO" "✅ Log directory configured"
}

install_cron_jobs() {
  log "INFO" "Installing cron jobs..."
  
  # Read cron config, filter out comments and empty lines
  local cron_entries=$(grep -v '^#' "$CRON_CONFIG" | grep -v '^$')
  
  if [[ -z "$cron_entries" ]]; then
    log "ERROR" "No cron entries found in config file"
    return 1
  fi
  
  # Get current crontab (if it exists)
  local current_crontab=""
  if crontab -l 2>/dev/null; then
    current_crontab=$(crontab -l)
  fi
  
  # Create temporary file with header
  local temp_crontab=$(mktemp)
  echo "# SAFvsOil Automation Cron Jobs" >> "$temp_crontab"
  echo "# Last updated: $(date)" >> "$temp_crontab"
  echo "" >> "$temp_crontab"
  
  # Add environment variables
  cat >> "$temp_crontab" << 'EOF'
# Environment
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SHELL=/bin/bash
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}
LOG_DIR=/var/log/safvsoil
REPORT_DIR=/var/log/safvsoil/reports
API_ENDPOINT=${API_ENDPOINT:-http://localhost:8000}
MAC_MINI_ENDPOINT=${MAC_MINI_ENDPOINT:-localhost}
FRANCE_ENDPOINT=${FRANCE_ENDPOINT:-localhost}
US_ENDPOINT=${US_ENDPOINT:-localhost}

EOF
  
  # Add existing cron entries (excluding any safvsoil entries)
  if [[ -n "$current_crontab" ]]; then
    echo "$current_crontab" | grep -v "safvsoil" | grep -v "^#.*$" >> "$temp_crontab" || true
  fi
  
  # Add new cron entries
  echo "" >> "$temp_crontab"
  echo "# SAFvsOil Health Checks and Validation" >> "$temp_crontab"
  echo "$cron_entries" >> "$temp_crontab"
  
  # Install new crontab
  crontab "$temp_crontab"
  rm "$temp_crontab"
  
  log "INFO" "✅ Cron jobs installed"
}

verify_installation() {
  log "INFO" "Verifying cron installation..."
  
  local crontab_list=$(crontab -l)
  
  if echo "$crontab_list" | grep -q "health_check.sh"; then
    log "INFO" "✅ health_check.sh cron job found"
  else
    log "WARN" "health_check.sh cron job NOT found"
    return 1
  fi
  
  if echo "$crontab_list" | grep -q "validate.sh"; then
    log "INFO" "✅ validate.sh cron job found"
  else
    log "WARN" "validate.sh cron job NOT found"
    return 1
  fi
  
  log "INFO" "Current cron jobs:"
  echo "$crontab_list" | grep -E "(health_check|validate|backup)" || true
  
  log "INFO" "✅ Installation verified"
  return 0
}

uninstall_cron_jobs() {
  log "INFO" "Uninstalling SAFvsOil cron jobs..."
  
  local current_crontab=$(crontab -l 2>/dev/null || echo "")
  
  if [[ -z "$current_crontab" ]]; then
    log "INFO" "No crontab found"
    return 0
  fi
  
  # Remove safvsoil entries
  local temp_crontab=$(mktemp)
  echo "$current_crontab" | grep -v "safvsoil" > "$temp_crontab" || true
  
  # Install updated crontab
  if [[ -s "$temp_crontab" ]]; then
    crontab "$temp_crontab"
  else
    crontab -r 2>/dev/null || true
  fi
  
  rm "$temp_crontab"
  
  log "INFO" "✅ Cron jobs uninstalled"
}

# ============================================================================
# Main
# ============================================================================

main() {
  local action="${1:-install}"
  
  log "INFO" "SAFvsOil Cron Setup Script"
  log "INFO" "Project root: $PROJECT_ROOT"
  log "INFO" "Action: $action"
  
  case "$action" in
    install)
      check_requirements || return 1
      setup_log_directory || return 1
      install_cron_jobs || return 1
      verify_installation || return 1
      log "INFO" "✅ Setup completed successfully"
      ;;
    verify)
      verify_installation || return 1
      ;;
    uninstall)
      uninstall_cron_jobs || return 1
      log "INFO" "✅ Uninstall completed"
      ;;
    *)
      log "ERROR" "Unknown action: $action"
      echo "Usage: $0 {install|verify|uninstall}"
      return 1
      ;;
  esac
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
exit $?
