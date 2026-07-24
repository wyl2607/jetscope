#!/bin/bash
# JetScope SQLite backup.
# Takes an online-consistent backup of the frozen-production SQLite database using
# the sqlite3 .backup API (safe while the API is writing), verifies integrity,
# compresses, and applies a retention window.
#
# Env:
#   JETSCOPE_SQLITE_DB        DB path or sqlite:/// URL (default ./data/market.db)
#   JETSCOPE_BACKUP_DIR       backup output dir (default ./data/backups)
#   JETSCOPE_BACKUP_RETENTION number of backups to keep (default 14)
#
# For real disaster recovery point JETSCOPE_BACKUP_DIR at off-host storage; the
# default lives on the same volume as the DB and only guards against corruption.

set -euo pipefail

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'error: required binary not found on PATH: %s\n' "$1" >&2
    exit 1
  fi
}

require_bin sqlite3
require_bin gzip

resolve_db_path() {
  local raw="${JETSCOPE_SQLITE_DB:-./data/market.db}"
  case "$raw" in
    sqlite:///*) printf '%s\n' "${raw#sqlite:///}" ;;
    *)           printf '%s\n' "$raw" ;;
  esac
}

DB="$(resolve_db_path)"
BACKUP_DIR="${JETSCOPE_BACKUP_DIR:-./data/backups}"
RETENTION="${JETSCOPE_BACKUP_RETENTION:-14}"

if [ ! -f "$DB" ]; then
  printf 'error: database file does not exist: %s\n' "$DB" >&2
  exit 1
fi

case "$RETENTION" in
  ''|*[!0-9]*)
    printf 'error: JETSCOPE_BACKUP_RETENTION must be a non-negative integer (got: %s)\n' "$RETENTION" >&2
    exit 1
    ;;
esac

mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL_GZ="${BACKUP_DIR}/market-${TS}.db.gz"
TMP_DB="$(mktemp "${TMPDIR:-/tmp}/jetscope-backup.XXXXXX")"
TMP_GZ="$(mktemp "${TMPDIR:-/tmp}/jetscope-backup-gz.XXXXXX")"

cleanup() {
  rm -f "$TMP_DB" "$TMP_GZ"
}
trap cleanup EXIT

printf 'Backing up %s (online-consistent via .backup)...\n' "$DB"
sqlite3 "$DB" ".backup '$TMP_DB'"

printf 'Verifying backup integrity...\n'
INTEGRITY="$(sqlite3 "$TMP_DB" "PRAGMA integrity_check;")"
if [ "$INTEGRITY" != "ok" ]; then
  printf 'error: integrity_check failed: %s\n' "$INTEGRITY" >&2
  exit 1
fi

printf 'Compressing to %s...\n' "$FINAL_GZ"
gzip -c "$TMP_DB" > "$TMP_GZ"
mv "$TMP_GZ" "$FINAL_GZ"
TMP_GZ=""

# Retention: keep newest N market-*.db.gz only.
printf 'Applying retention (keep newest %s)...\n' "$RETENTION"
# shellcheck disable=SC2012
OLD_LIST="$(ls -1t "$BACKUP_DIR"/market-*.db.gz 2>/dev/null | sed -n "$((RETENTION + 1)),\$p" || true)"
if [ -n "$OLD_LIST" ]; then
  printf '%s\n' "$OLD_LIST" | while IFS= read -r old; do
    [ -n "$old" ] || continue
    printf '  deleting old backup: %s\n' "$old"
    rm -f "$old"
  done
fi

RETAINED="$(ls -1 "$BACKUP_DIR"/market-*.db.gz 2>/dev/null | wc -l | tr -d ' ')"
SIZE="$(wc -c < "$FINAL_GZ" | tr -d ' ')"

printf 'Backup written: %s\n' "$FINAL_GZ"
printf 'Summary: size=%s bytes retained=%s\n' "$SIZE" "$RETAINED"
