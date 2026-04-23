# Deployment Guide — Data Contract v1

**Version**: 1.0.0  
**Last Updated**: 2026-04-23  
**Status**: Production Ready

---

## Overview

This guide covers deploying the Data Contract v1 API infrastructure across:
- **Postgres** (production primary data store)
- **SQLite** (development/testing local database)
- **Cluster nodes** (configured in ~/.ssh/config with Tailscale or SSH keys)

All infrastructure references use environment variables or ~/.ssh/config aliases.

---

## Phase 0: Pre-Deployment Checklist

- [ ] All 20 E2E tests passing locally: `cd apps/api && pytest tests/test_lane_c_e2e.py -v`
- [ ] Data Contract v1 frozen and documented (docs/API_CONTRACT_V1.md)
- [ ] Cluster node SSH access verified: `ssh ${PRIMARY_NODE} 'echo OK'`
- [ ] Slack webhook URL configured: `export SLACK_WEBHOOK_URL="..."`
- [ ] Database passwords rotated and stored securely
- [ ] Monitoring scripts deployed to crontab (scripts/monitoring/*.sh)

---

## Phase 1: SQLite Development Setup

**Use for**: Local testing, development, fallback during Postgres maintenance

### Step 1a: Create SQLite Database

```bash
cd apps/db/migrations
sqlite3 /tmp/safvsoil_dev.sqlite3 < sqlite_001_create_market_contract_v1.sql
```

**Verify**:
```bash
sqlite3 /tmp/safvsoil_dev.sqlite3 ".tables"
# Output: carbon_intensities data_freshness eu_ets_volumes germany_premiums 
#         market_prices migration_audit rotterdam_emissions source_status
```

### Step 1b: Configure Local Environment

```bash
export DATABASE_URL="sqlite:////tmp/safvsoil_dev.sqlite3"
export DATA_CACHE_TTL="86400"  # 24 hours
export FALLBACK_ENABLED="true"
```

### Step 1c: Run Tests Against SQLite

```bash
cd apps/api
pytest tests/test_lane_c_e2e.py::test_market_snapshot_has_all_7_metrics -v
```

---

## Phase 2: Postgres Production Setup

**Use for**: Production data store, cluster primary, persistent storage

### Step 2a: Connect to Postgres Server

```bash
# On Postgres host (e.g., via SSH to production node):
ssh ${PRIMARY_NODE} 'bash -s' <<'EOF'
  # Create database and user
  sudo -u postgres psql <<SQL
  CREATE DATABASE safvsoil_production;
  CREATE USER safvsoil WITH PASSWORD '${DB_PASSWORD}';
  ALTER USER safvsoil WITH SUPERUSER;
  GRANT ALL PRIVILEGES ON DATABASE safvsoil_production TO safvsoil;
SQL
EOF
```

### Step 2b: Deploy DDL Schema

```bash
export PGHOST="${PRIMARY_NODE}"
export PGPORT="5432"
export PGUSER="safvsoil"
export PGDATABASE="safvsoil_production"

# Run Postgres migrations
psql -h ${PGHOST} -U ${PGUSER} -d ${PGDATABASE} -f apps/db/migrations/001_create_market_contract_v1.sql

# Verify schema created
psql -h ${PGHOST} -U ${PGUSER} -d ${PGDATABASE} -c "\dt"
```

### Step 2c: Create Standby Replica (Optional)

For zero-downtime failover:

```bash
# On replica node:
ssh ${REPLICA_NODE} 'bash -s' <<'EOF'
  pg_basebackup -h ${PRIMARY_NODE} -D /var/lib/postgresql/data -U safvsoil -v -P

  # Start standby and configure streaming replication
  echo "primary_conninfo = 'host=${PRIMARY_NODE} user=safvsoil password=${DB_PASSWORD}'" >> /var/lib/postgresql/data/recovery.conf
  systemctl start postgresql
EOF
```

---

## Phase 3: Zero-Downtime Migration Strategy

**Sequence** (requires ~30 min downtime for cutover):

1. **Day Before**: Create shadow Postgres instance with dual-write pattern
2. **Migration Window** (02:00-03:00 UTC):
   - Stop API servers
   - Run migration: SQLite → Postgres
   - Validate row counts
   - Update DATABASE_URL to Postgres
   - Start API servers
   - Run smoke tests

### Step 3a: Dual-Write Pattern

```python
# In apps/api/app/services/market.py:
class DataContractWriter:
  def save_market_snapshot(self, snapshot):
    # Write to both databases during migration
    self.sqlite_writer.save(snapshot)  # Current
    self.postgres_writer.save(snapshot)  # New
    return snapshot
```

### Step 3b: Validate Data Consistency

```bash
# Run consistency check:
export API_ENDPOINT="http://${PRIMARY_NODE}:8000/v1/market/snapshot"

for metric in market_price carbon_intensity germany_premium rotterdam_port eu_ets_volume; do
  sqlite_value=$(sqlite3 /tmp/safvsoil_dev.sqlite3 "SELECT value FROM market_prices LIMIT 1")
  postgres_value=$(psql -h ${PRIMARY_NODE} -U safvsoil -d safvsoil_production -c "SELECT value FROM market_prices LIMIT 1")
  
  if [ "$sqlite_value" == "$postgres_value" ]; then
    echo "✅ $metric: Consistent"
  else
    echo "❌ $metric: Mismatch (SQLite=$sqlite_value, Postgres=$postgres_value)"
  fi
done

echo "Data consistency check: $([ $? -eq 0 ] && echo 'PASS (100.0% match)' || echo 'FAIL')"
```

---

## Phase 4: Cluster Deployment

**Targets**: Primary node + Replica nodes (France VPS + US VPS)

### Step 4a: Deploy to Primary Node

```bash
# Configure via ~/.ssh/config (use Tailscale IPs or direct SSH):
Host primary-node
  User yilinwang
  IdentityFile ~/.ssh/cluster_unified
  # HostName <Tailscale or public IP>

# Copy application code:
ssh primary-node <<'EOF'
  cd /opt/safvsoil
  git pull origin main
  cd apps/api
  python -m pip install -r requirements.txt
  systemctl restart safvsoil-api
  
  # Wait for health check
  sleep 5
  curl http://localhost:8000/health | jq '.status'
EOF
```

### Step 4b: Deploy to Replica Nodes

```bash
# Replica 1 & 2 deployment (parallel):
for node in replica-1 replica-2; do
  ssh ${node} <<'EOF' &
    cd /opt/safvsoil
    git pull origin main
    cd apps/api
    python -m pip install -r requirements.txt
    systemctl restart safvsoil-api
EOF
done
wait

# Verify all nodes healthy
for node in primary-node replica-1 replica-2; do
  status=$(ssh ${node} 'curl -s http://localhost:8000/health | jq ".status"')
  echo "$node: $status"
done
```

### Step 4c: Update Load Balancer

```bash
# If using HAProxy or similar:
ssh ${LB_NODE} <<'EOF'
  # Point all cluster nodes to Postgres primary
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://safvsoil:${DB_PASSWORD}@${PRIMARY_NODE}:5432/safvsoil_production|g" /etc/safvsoil/api.env
  systemctl reload haproxy
EOF
```

---

## Phase 5: Monitoring & Alerts

### Step 5a: Deploy Monitoring Scripts

```bash
# Copy scripts to monitoring node:
scp scripts/monitoring/*.sh ${MONITORING_NODE}:/usr/local/bin/
chmod +x /usr/local/bin/{freshness,fallback_rate,confidence_score}.sh

# Test each script:
export API_ENDPOINT="http://${PRIMARY_NODE}:8000/v1/market/snapshot"
export SLACK_WEBHOOK_URL="${SLACK_URL}"

./freshness.sh
./fallback_rate.sh
./confidence_score.sh
```

### Step 5b: Setup Cron Monitoring

```bash
# Add to crontab:
(crontab -l 2>/dev/null; cat <<'EOF'
# Data freshness (every hour)
0 * * * * export API_ENDPOINT="http://${PRIMARY_NODE}:8000/v1/market/snapshot" && /usr/local/bin/freshness.sh

# Fallback rate (every 30 min)
*/30 * * * * export API_ENDPOINT="http://${PRIMARY_NODE}:8000/v1/market/snapshot" && /usr/local/bin/fallback_rate.sh

# Confidence score (every 15 min)
*/15 * * * * export API_ENDPOINT="http://${PRIMARY_NODE}:8000/v1/market/snapshot" && /usr/local/bin/confidence_score.sh
EOF
) | crontab -
```

### Step 5c: Verify Monitoring

```bash
# Test Slack integration:
curl -X POST ${SLACK_WEBHOOK_URL} \
  -H 'Content-type: application/json' \
  -d '{"text":"✅ Monitoring connected and working"}'
```

---

## Phase 6: Post-Deployment Validation

### Step 6a: Smoke Tests

```bash
# 1. API health check
curl http://${PRIMARY_NODE}:8000/health | jq '.'

# 2. All 7 metrics present
curl http://${PRIMARY_NODE}:8000/v1/market/snapshot | jq '.data | keys | length'
# Expected: 7

# 3. Confidence scoring working
curl http://${PRIMARY_NODE}:8000/v1/confidence/score | jq '.average_confidence'
# Expected: > 0.5

# 4. Freshness tracking active
curl http://${PRIMARY_NODE}:8000/v1/freshness/check | jq '.overall_status'
# Expected: "green" or "yellow"
```

### Step 6b: Load Test

```bash
# Simulate 1000 req/min for 5 min:
ab -n 5000 -c 50 http://${PRIMARY_NODE}:8000/v1/market/snapshot

# Expected: < 100ms latency, 0 errors
```

### Step 6c: Failover Test

```bash
# Simulate primary node failure:
ssh ${PRIMARY_NODE} 'systemctl stop safvsoil-api'

# Verify replicas handle traffic:
for i in {1..5}; do
  curl http://${REPLICA_1}:8000/v1/market/snapshot | jq '.source_status.confidence'
done

# Restart primary:
ssh ${PRIMARY_NODE} 'systemctl start safvsoil-api'
```

---

## Rollback Procedure

### If Issues Detected

```bash
# 1. Immediate stop
ssh ${PRIMARY_NODE} 'systemctl stop safvsoil-api'

# 2. Revert to previous version
ssh ${PRIMARY_NODE} <<'EOF'
  cd /opt/safvsoil
  git checkout v1.0.0-pre  # Last known stable
  cd apps/api
  systemctl start safvsoil-api
EOF

# 3. Monitor health
watch -n 5 'curl -s http://${PRIMARY_NODE}:8000/health | jq ".status"'

# 4. Notify team
curl -X POST ${SLACK_WEBHOOK_URL} \
  -H 'Content-type: application/json' \
  -d '{"text":"🚨 Deployment rolled back to v1.0.0-pre"}'
```

---

## Environment Variables Checklist

Set before deployment:

```bash
export PRIMARY_NODE="..."           # Tailscale/SSH alias for primary
export REPLICA_1="..."              # Replica 1 alias
export REPLICA_2="..."              # Replica 2 alias
export MONITORING_NODE="..."        # Monitoring/cron host
export LB_NODE="..."                # Load balancer (optional)
export DB_PASSWORD="..."            # Postgres password (store securely!)
export SLACK_WEBHOOK_URL="..."      # Slack channel webhook
export API_ENDPOINT="http://${PRIMARY_NODE}:8000/v1/market/snapshot"
```

---

## Next Steps

1. **Day 5**: Load testing & performance tuning (target: < 100ms p95 latency)
2. **Day 6**: Security audit & compliance check (PCI DSS, data privacy)
3. **Day 7**: Production release & monitoring handoff (SLA: 99.5% uptime)

---

## Support & Escalation

- **Database Issues**: Contact DBA team; check `/var/log/postgresql/`
- **API Errors**: Check `/var/log/safvsoil/api.log`
- **Network Issues**: Verify Tailscale connectivity: `tailscale status`
- **Monitoring Alerts**: Check Slack #data-reliability-alerts
- **On-Call**: Page @data-reliability-team

**For questions**: See docs/API_CONTRACT_V1.md or create GitHub issue

---

**Deployment Approvals**:
- [ ] Data Engineer: Data Contract v1 validated
- [ ] DevOps Lead: Infrastructure ready
- [ ] Security: No sensitive data in logs
- [ ] QA: All smoke tests passing
