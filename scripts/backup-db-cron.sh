#!/bin/bash

# SQLite Backup Script for SAFvsOil
# Automatically backs up market.db every 6 hours and maintains latest 7 backups
# Install in crontab: 0 */6 * * * /path/to/backup-db-cron.sh

set -e

# Configuration
DB_PATH="${SAFVSOIL_DB_PATH:-/opt/safvsoil/data/market.db}"
BACKUP_DIR="${SAFVSOIL_BACKUP_DIR:-/opt/safvsoil/backups}"
RETENTION_DAYS=7
MAX_BACKUPS=7
LOG_FILE="${SAFVSOIL_LOG_DIR:-/var/log}/safvsoil_backup.log"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Function to check database integrity
check_db_integrity() {
    if [ ! -f "$DB_PATH" ]; then
        log "ERROR: Database file not found at $DB_PATH"
        return 1
    fi

    # Run PRAGMA integrity_check
    result=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1)
    if [ "$result" != "ok" ]; then
        log "ERROR: Database integrity check failed. Result: $result"
        return 1
    fi

    log "INFO: Database integrity check passed"
    return 0
}

# Function to perform backup
perform_backup() {
    timestamp=$(date +"%Y%m%d_%H%M%S")
    backup_file="$BACKUP_DIR/market_${timestamp}.db"

    log "INFO: Starting backup to $backup_file"

    # Use sqlite3 backup mechanism for atomic backup
    sqlite3 "$DB_PATH" ".backup '$backup_file'" 2>&1

    if [ $? -eq 0 ]; then
        log "INFO: Backup completed successfully: $backup_file ($(du -h "$backup_file" | cut -f1))"
        return 0
    else
        log "ERROR: Backup failed for $backup_file"
        return 1
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    log "INFO: Cleaning up old backups (keeping last $MAX_BACKUPS)"

    # Get list of backup files sorted by modification time (newest first)
    backups=$(ls -t "$BACKUP_DIR"/market_*.db 2>/dev/null || true)

    if [ -z "$backups" ]; then
        log "INFO: No backups found to clean up"
        return
    fi

    # Count total backups
    backup_count=$(echo "$backups" | wc -l)

    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        # Delete oldest backups, keeping MAX_BACKUPS
        echo "$backups" | tail -n +$((MAX_BACKUPS + 1)) | while read -r old_backup; do
            log "INFO: Removing old backup: $old_backup"
            rm -f "$old_backup"
        done
    fi

    # Also remove backups older than RETENTION_DAYS
    find "$BACKUP_DIR" -name "market_*.db" -mtime +"$RETENTION_DAYS" -exec rm -f {} \; -print | while read -r removed; do
        log "INFO: Removed backup older than $RETENTION_DAYS days: $removed"
    done
}

# Main backup routine
main() {
    log "=== SQLite Backup Started ==="

    # Check database integrity
    if ! check_db_integrity; then
        log "ERROR: Database integrity check failed. Aborting backup."
        exit 1
    fi

    # Perform backup
    if ! perform_backup; then
        log "ERROR: Backup failed"
        exit 1
    fi

    # Cleanup old backups
    cleanup_old_backups

    log "=== SQLite Backup Completed Successfully ==="
}

# Run main routine
main
