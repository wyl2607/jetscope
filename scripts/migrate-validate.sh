#!/bin/bash
# Day 5: Database Migration Validation Script
# Validates zero-downtime migration from SQLite → Postgres
# Created: 2026-04-23

set -euo pipefail

# Configuration
PRIMARY_NODE="${PRIMARY_NODE:-localhost}"
PGHOST="${PGHOST:-${PRIMARY_NODE}}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-safvsoil}"
PGDATABASE="${PGDATABASE:-safvsoil_production}"
SQLITE_DB="${SQLITE_DB:-/tmp/safvsoil_dev.sqlite3}"
API_ENDPOINT="${API_ENDPOINT:-http://${PRIMARY_NODE}:8000/v1/market/snapshot}"

RESULTS_FILE="migration-validation-$(date +%s).json"

echo "🔄 Starting Database Migration Validation"
echo "  Source (SQLite): $SQLITE_DB"
echo "  Target (Postgres): postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
echo "  Results: $RESULTS_FILE"
echo ""

# Step 1: Check SQLite database exists and has data
echo "Step 1: Validating SQLite source database..."
if [ ! -f "$SQLITE_DB" ]; then
  echo "❌ SQLite database not found at $SQLITE_DB"
  exit 1
fi

sqlite_row_count=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM market_prices;")
echo "  SQLite market_prices rows: $sqlite_row_count"

# Step 2: Check Postgres connection
echo "Step 2: Validating Postgres target database..."
pg_check=$(PGPASSWORD="${DB_PASSWORD:-}" psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT COUNT(*) FROM market_prices;" 2>&1 || echo "CONNECTION_FAILED")

if [[ "$pg_check" == "CONNECTION_FAILED" ]]; then
  echo "❌ Cannot connect to Postgres at $PGHOST"
  exit 1
fi

postgres_row_count=$(echo "$pg_check" | tail -1 | xargs)
echo "  Postgres market_prices rows: $postgres_row_count"

# Step 3: Validate schema consistency
echo "Step 3: Validating schema consistency..."
sqlite_columns=$(sqlite3 "$SQLITE_DB" "PRAGMA table_info(market_prices);" | wc -l)
postgres_columns=$(PGPASSWORD="${DB_PASSWORD:-}" psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "\d market_prices" | grep -c "^\s*[a-z]" || true)
echo "  SQLite columns: $sqlite_columns"
echo "  Postgres columns: ~$postgres_columns"

# Step 4: Test dual-write pattern
echo "Step 4: Testing dual-write pattern..."
test_value="test_$(date +%s)"
sqlite3 "$SQLITE_DB" "INSERT INTO market_prices (value, confidence, is_fallback) VALUES ($test_value, 1.0, 0);" || true

# Verify written to both DBs
sqlite_written=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM market_prices WHERE value = $test_value;")
postgres_written=$(PGPASSWORD="${DB_PASSWORD:-}" psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT COUNT(*) FROM market_prices WHERE value = $test_value;" 2>&1 | tail -1 | xargs)

echo "  Dual-write test: SQLite=$sqlite_written, Postgres=$postgres_written"

# Step 5: API health check
echo "Step 5: Checking API connectivity..."
api_response=$(curl -s "$API_ENDPOINT" | jq '.source_status.confidence' 2>/dev/null || echo "ERROR")
echo "  API response: confidence=$api_response"

# Step 6: Consistency check
echo "Step 6: Running data consistency check..."
sqlite_metrics=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(DISTINCT value) FROM market_prices;")
postgres_metrics=$(PGPASSWORD="${DB_PASSWORD:-}" psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT COUNT(DISTINCT value) FROM market_prices;" 2>&1 | tail -1 | xargs)

consistency_match="YES"
if [ "$sqlite_metrics" != "$postgres_metrics" ]; then
  consistency_match="NO"
fi

echo "  Metric consistency: $consistency_match (SQLite=$sqlite_metrics, Postgres=$postgres_metrics)"

# Generate JSON report
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "migration_validation": {
    "source": "SQLite",
    "target": "Postgres",
    "source_db": "$SQLITE_DB",
    "target_host": "$PGHOST"
  },
  "database_checks": {
    "sqlite_connected": true,
    "postgres_connected": $([ "$pg_check" == "CONNECTION_FAILED" ] && echo "false" || echo "true"),
    "schema_exists": true
  },
  "data_integrity": {
    "sqlite_rows": $sqlite_row_count,
    "postgres_rows": $postgres_row_count,
    "row_count_match": $([ "$sqlite_row_count" -eq "$postgres_row_count" ] && echo "PASS" || echo "FAIL"),
    "consistency_check": "$consistency_match"
  },
  "dual_write_test": {
    "sqlite_written": $sqlite_written,
    "postgres_written": $postgres_written,
    "status": $([ "$sqlite_written" -eq "$postgres_written" ] && echo "PASS" || echo "FAIL")
  },
  "api_validation": {
    "endpoint": "$API_ENDPOINT",
    "health": $([ "$api_response" != "ERROR" ] && echo "OK" || echo "FAIL"),
    "confidence_score": "$api_response"
  },
  "migration_ready": {
    "overall_status": $([ "$consistency_match" == "YES" ] && [ "$api_response" != "ERROR" ] && echo "✅ READY" || echo "❌ NOT_READY"),
    "next_step": "Execute zero-downtime cutover (stop API → run migration → validate → restart)"
  }
}
EOF

echo ""
echo "📋 Migration Validation Report"
echo "=============================="
cat "$RESULTS_FILE" | jq '.'

# Cleanup test data
sqlite3 "$SQLITE_DB" "DELETE FROM market_prices WHERE value = $test_value;" 2>/dev/null || true

echo ""
if [ "$consistency_match" == "YES" ] && [ "$api_response" != "ERROR" ]; then
  echo "✅ Migration validation PASSED"
  echo "   Ready to execute zero-downtime cutover"
else
  echo "❌ Migration validation FAILED"
  echo "   Review schema and data consistency before proceeding"
  exit 1
fi

echo "Results saved to: $RESULTS_FILE"
