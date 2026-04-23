# SAFvsOil Postgres Zero-Downtime Migration Guide

## Overview

This migration implements **zero-downtime dual-write** pattern to safely transition from legacy SQLite API to Postgres v1 schema with unified data contract.

**Key Features**:
- ✅ Async dual-write (legacy + new schema in parallel)
- ✅ Automatic fallback if new write fails
- ✅ Rollback capability with timestamp-based checkpoints
- ✅ 2-phase commit verification
- ✅ Connection pooling for high throughput
- ✅ Comprehensive logging and audit trail

## Prerequisites

1. **Postgres 14+** running with replication configured
   ```bash
   psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d postgres -c "SELECT version();"
   ```

2. **v1 schema initialized** in target Postgres database
   ```bash
   # Run Alembic migrations first
   cd /path/to/esg-research-toolkit
   alembic upgrade head
   ```

3. **Legacy API accessible** and healthy
   ```bash
   curl ${LEGACY_API_URL}/health
   ```

4. **Python 3.9+** with required dependencies
   ```bash
   pip install psycopg2-binary pydantic pyyaml aiohttp
   ```

## Setup

### 1. Environment Configuration

Copy and customize the environment template:

```bash
cp scripts/migration_config.env.example .env.migration
# Edit .env.migration with your Postgres credentials
```

**Important Security Notes**:
- Never commit `.env.migration` to git
- Use AWS Secrets Manager or similar for production credentials
- All credentials must be loaded from environment variables (not hardcoded)

### 2. Pre-Migration Checks

Run the preflight checklist:

```bash
python3 scripts/postgres-dualwrite-migration.py --mode=verify
```

Expected output:
```
✓ Postgres connectivity: OK
✓ v1 schema exists: OK
✓ Legacy API health: OK
✓ Migration log table: OK
✓ Rollback checkpoint table: OK
```

## Migration Process

### Step 1: Create Rollback Checkpoint

Before starting, create a named rollback point:

```bash
# Load environment
source .env.migration

# Create checkpoint
python3 scripts/postgres-dualwrite-migration.py \
  --mode=migrate \
  --batch-size=1000 \
  --checkpoint="pre_migration_$(date +%Y%m%d_%H%M%S)"
```

A rollback checkpoint is created automatically at migration start.

### Step 2: Run Migration

**Dry-Run First** (recommended):

```bash
export MIGRATION_DRY_RUN=true
python3 scripts/postgres-dualwrite-migration.py \
  --mode=migrate \
  --batch-size=1000
```

**Full Migration**:

```bash
export MIGRATION_DRY_RUN=false
python3 scripts/postgres-dualwrite-migration.py \
  --mode=migrate \
  --batch-size=1000 2>&1 | tee migration-$(date +%Y%m%d_%H%M%S).log
```

**Expected Timeline**:
- Legacy data fetch: ~2-5 minutes (depends on data volume)
- Postgres writes: ~10-30 minutes (depends on batch size + network latency)
- Verification: ~5 minutes
- **Total: 15-40 minutes** (zero downtime maintained)

### Step 3: Verify Migration

After successful migration:

```bash
python3 scripts/postgres-dualwrite-migration.py --mode=verify
```

Check results:

```bash
# Query Postgres for success rate
psql ${POSTGRES_DB} -U ${POSTGRES_USER} -h ${POSTGRES_HOST} << EOF
SELECT table_name,
       COUNT(*) as total,
       COUNT(CASE WHEN migration_status = 'migrated' THEN 1 END) as migrated,
       COUNT(CASE WHEN migration_status = 'failed' THEN 1 END) as failed,
       ROUND(100.0 * COUNT(CASE WHEN migration_status = 'migrated' THEN 1 END) / COUNT(*), 2) || '%' as success_rate
FROM (
  SELECT 'market_prices' as table_name, migration_status FROM v1_market_price
  UNION ALL
  SELECT 'carbon_intensities', migration_status FROM v1_carbon_intensity
  UNION ALL
  SELECT 'eu_ets_prices', migration_status FROM v1_eu_ets_price
) t
GROUP BY table_name;
EOF
```

**Success Criteria**:
- ✅ All 7 metrics migrated
- ✅ Success rate ≥ 99.9%
- ✅ No migration_status = 'failed'
- ✅ Data integrity verified

### Step 4: Cutover & Switch Traffic

After verification:

```bash
# Update API routing to use v1 schema
# 1. Update main.py routers to point to v1_* tables
# 2. Verify dual-write logs show 100% new-schema success
# 3. Gradually shift traffic (5% → 25% → 50% → 100%)
# 4. Monitor legacy API fallback rate (should stay <1%)
```

## Rollback Procedure

### Option 1: Rollback to Checkpoint (Recommended)

If migration failed or needs reverting:

```bash
python3 scripts/postgres-dualwrite-migration.py \
  --mode=rollback \
  --checkpoint="pre_migration_20260423_110000"
```

This restores Postgres tables to pre-migration state.

### Option 2: Fallback to Legacy API

If issues detected after cutover:

```bash
# Revert API routing to use legacy SQLite
# The dual-write system will automatically redirect writes back to legacy
# Monitor: curl http://localhost:8000/metrics/fallback_rate
```

### Option 3: Point-in-Time Recovery

For data loss or corruption:

```bash
psql ${POSTGRES_DB} -U ${POSTGRES_USER} -h ${POSTGRES_HOST} << EOF
-- Restore from backup taken before migration start
RESTORE DATABASE safvsoil_v1 FROM 'backup_20260423_110000.sql';
EOF
```

## Monitoring & Troubleshooting

### Real-Time Migration Status

```bash
# Watch migration progress in real-time
tail -f migration.log | grep "Processing\|Insert\|Verify"
```

### Common Issues

#### Issue 1: Postgres Connection Timeout

```
Error: Failed to connect to Postgres: connection timeout
```

**Solution**:
```bash
# Check Postgres is running
psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -c "SELECT 1"

# Increase timeout
export MIGRATION_TIMEOUT=60
```

#### Issue 2: Legacy API Unavailable

```
Error: Failed to fetch from legacy API: Connection refused
```

**Solution**:
```bash
# Check legacy API health
curl -v http://localhost:8000/health

# Restart legacy API service
systemctl restart esg-research-toolkit
```

#### Issue 3: High Conflict Rate

```
Insert failed: Unique constraint violation on id
```

**Solution**:
- Check for duplicate IDs in legacy data
- Increase `MIGRATION_MAX_RETRIES` to 5
- Review migration.log for specific conflict entries

### Performance Tuning

To improve migration speed:

```bash
# Increase batch size (more memory, fewer round-trips)
export MIGRATION_BATCH_SIZE=5000

# Reduce timeout for faster failure detection
export MIGRATION_TIMEOUT=10

# Increase connection pool size in code (edit postgres-dualwrite-migration.py)
# Change: psycopg2.pool.SimpleConnectionPool(1, 5, ...)
# To:     psycopg2.pool.SimpleConnectionPool(5, 20, ...)
```

## Post-Migration Checklist

- [ ] All 7 metrics fully migrated (100% success rate)
- [ ] Postgres replication lag < 1 second
- [ ] Legacy API fallback rate < 1%
- [ ] Performance benchmarks passed (p95 < 100ms)
- [ ] Monitoring alerts configured
- [ ] Runbook updated with new schema info
- [ ] v1.0.0-data-contract tag created
- [ ] Release notes published

## References

- **Data Contract**: `/Users/yumei/SAFvsOil/DATA_CONTRACT_V1.md`
- **Schema DDL**: `/Users/yumei/SAFvsOil/scripts/schema-v1.sql`
- **Monitoring**: `/Users/yumei/SAFvsOil/scripts/monitoring/`
- **API Documentation**: `/Users/yumei/projects/esg-research-toolkit/docs/api/`

## Support

For issues or questions:

1. Check migration.log for detailed error traces
2. Run verification: `python3 postgres-dualwrite-migration.py --mode=verify`
3. Review rollback procedure if needed
4. Contact: [your-team-email]
