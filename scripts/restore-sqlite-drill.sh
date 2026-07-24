#!/bin/bash
# JetScope SQLite restore drill (NON-DESTRUCTIVE).
# Proves a backup is actually restorable without ever touching the live DB: it
# decompresses/restores a backup into a throwaway temp dir, runs an integrity
# check, and sanity-checks that user tables exist.
#
# Usage: ./scripts/restore-sqlite-drill.sh [path/to/market-<ts>.db.gz]
#   With no argument, the newest market-*.db.gz in JETSCOPE_BACKUP_DIR is used.
#
# Env:
#   JETSCOPE_BACKUP_DIR  backup dir to search when no arg is given (default ./data/backups)

set -euo pipefail

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'error: required binary not found on PATH: %s\n' "$1" >&2
    exit 1
  fi
}

require_bin sqlite3
require_bin gzip

BACKUP_DIR="${JETSCOPE_BACKUP_DIR:-./data/backups}"
SRC="${1:-}"

if [ -z "$SRC" ]; then
  SRC="$(ls -1t "$BACKUP_DIR"/market-*.db.gz 2>/dev/null | head -n 1 || true)"
  if [ -z "$SRC" ]; then
    printf 'error: no backup specified and no market-*.db.gz found in %s\n' "$BACKUP_DIR" >&2
    exit 1
  fi
  printf 'No backup arg given; using newest: %s\n' "$SRC"
fi

if [ ! -f "$SRC" ]; then
  printf 'error: backup file not found: %s\n' "$SRC" >&2
  exit 1
fi

TMPDIR_DRILL="$(mktemp -d "${TMPDIR:-/tmp}/jetscope-restore-drill.XXXXXX")"
STATUS=1
SUMMARY_MSG="FAIL: restore drill did not complete"

cleanup() {
  if [ -n "${TMPDIR_DRILL:-}" ] && [ -d "$TMPDIR_DRILL" ]; then
    rm -rf "$TMPDIR_DRILL"
  fi
  printf '%s\n' "$SUMMARY_MSG"
  exit "$STATUS"
}
trap cleanup EXIT

printf 'Restore drill (non-destructive; live DB never touched)\n'
printf 'Source backup: %s\n' "$SRC"
printf 'Temp dir: %s\n' "$TMPDIR_DRILL"

RESTORED="$TMPDIR_DRILL/restored.db"

case "$SRC" in
  *.db.gz)
    printf 'Decompressing gzip backup...\n'
    gzip -dc "$SRC" > "$RESTORED"
    ;;
  *.db)
    printf 'Copying uncompressed backup into temp dir...\n'
    cp "$SRC" "$RESTORED"
    ;;
  *)
    SUMMARY_MSG="FAIL: unsupported backup extension (expect .db.gz or .db): $SRC"
    exit 1
    ;;
esac

if [ ! -s "$RESTORED" ]; then
  SUMMARY_MSG="FAIL: restored file is missing or empty"
  exit 1
fi

printf 'Running PRAGMA integrity_check...\n'
INTEGRITY="$(sqlite3 "$RESTORED" "PRAGMA integrity_check;")"
if [ "$INTEGRITY" != "ok" ]; then
  SUMMARY_MSG="FAIL: integrity_check returned: $INTEGRITY"
  exit 1
fi
printf 'integrity_check: ok\n'

printf 'Enumerating user tables...\n'
TABLES="$(sqlite3 "$RESTORED" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")"
if [ -z "$TABLES" ]; then
  SUMMARY_MSG="FAIL: no user tables found in restored database"
  exit 1
fi

TABLE_COUNT=0
TOTAL_ROWS=0
while IFS= read -r t; do
  [ -n "$t" ] || continue
  TABLE_COUNT=$((TABLE_COUNT + 1))
  # best-effort row count; skip tables that fail to query
  if RC="$(sqlite3 "$RESTORED" "SELECT COUNT(*) FROM \"$t\";" 2>/dev/null)"; then
    case "$RC" in
      ''|*[!0-9]*) ;;
      *) TOTAL_ROWS=$((TOTAL_ROWS + RC)) ;;
    esac
  fi
done <<EOF
$TABLES
EOF

printf 'User tables: %s\n' "$TABLE_COUNT"
printf 'Total rows (best-effort across user tables): %s\n' "$TOTAL_ROWS"

SUMMARY_MSG="PASS: restore drill ok (tables=$TABLE_COUNT rows~$TOTAL_ROWS source=$SRC)"
STATUS=0
exit 0
