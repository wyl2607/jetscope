# SAFvsOil Automation Framework - Lane E DevOps

Complete automated health monitoring and validation system for the 3-node SAFvsOil cluster.

## Overview

This framework provides:

- **Health Check Script** - Monitors 6 endpoints (3 nodes × 2 services) across Tailscale network
- **Data Validation Script** - Validates 7 critical metrics from data sources
- **Cron Automation** - Scheduled health checks and data validation
- **Slack Alerts** - Real-time notifications on failures
- **Structured Reporting** - JSON and CSV output for monitoring dashboards

## Architecture

### Cluster Topology

```
Mac Mini (Local)          France VPS              US VPS
├─ FastAPI:8000         ├─ FastAPI:8000         ├─ FastAPI:8000
└─ Webhook:3001         └─ Webhook:3001         └─ Webhook:3001

All connected via Tailscale VPN (see .env.example for endpoint configuration)
```

## Installation

### Prerequisites

- Bash 4.0+
- curl (for HTTP requests)
- Access to all 6 cluster endpoints
- (Optional) Slack webhook URL for alerts
- Log directory: `/var/log/safvsoil`

### Quick Start

```bash
# 1. Set up log directory
sudo mkdir -p /var/log/safvsoil /var/log/safvsoil/reports
sudo chmod 755 /var/log/safvsoil

# 2. Make scripts executable
cd ~/SAFvsOil/scripts
chmod +x health_check.sh validate.sh setup_cron.sh

# 3. Test scripts manually
./health_check.sh
./validate.sh

# 4. Configure Slack webhook (optional)
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# 5. Install cron jobs (requires sudo)
sudo bash setup_cron.sh install

# 6. Verify installation
sudo bash setup_cron.sh verify
```

## Usage

### Health Check Script

**Purpose:** Monitors all 6 cluster endpoints for availability, health status, and git synchronization.

```bash
# Run health check
~/SAFvsOil/scripts/health_check.sh

# With custom environment
API_ENDPOINT=http://custom:8000 ~/SAFvsOil/scripts/health_check.sh

# View logs
tail -f /var/log/safvsoil/health_check.log

# View latest report
cat /var/log/safvsoil/reports/health_check_*.json | tail -1
```

**Checks Performed:**

1. ✅ HTTP GET `/health` endpoint (5s timeout)
2. ✅ Response status code = 200
3. ✅ JSON response contains `{"status": "healthy"}`
4. ✅ Git branch synchronization (commit hash verification)
5. ✅ Process running verification (ps/lsof checks)
6. ✅ Endpoint latency measurement

**Output:**

```
✅ mac-mini-fastapi healthy
✅ mac-mini-webhook healthy
❌ france-fastapi timeout (waited 5s)
⚠️  us-webhook json-invalid
```

**JSON Report:**

```json
{
  "timestamp": "2026-04-22T22:35:00Z",
  "summary": "5/6 nodes healthy",
  "total_nodes": 6,
  "healthy_nodes": 5,
  "failed_nodes": 1,
  "checks": {
    "mac-mini-fastapi": {
      "endpoint": "<tailscale-endpoint>:8000",
      "status": "healthy",
      "healthy": true
    },
    ...
  }
}
```

### Data Validation Script

**Purpose:** Validates 7 critical metrics from the data source API.

```bash
# Run validation
~/SAFvsOil/scripts/validate.sh

# With custom API endpoint
API_ENDPOINT=http://france:8000 ~/SAFvsOil/scripts/validate.sh

# View logs
tail -f /var/log/safvsoil/validate.log

# View CSV report
cat /var/log/safvsoil/reports/validate_*.csv
```

**Metrics Validated:**

| Metric | Min Threshold | Description |
|--------|---------------|-------------|
| market_price | > 0 | Current SAF market price |
| carbon_intensity | > 0 | Grid carbon intensity (g CO2/kWh) |
| rotterdam_emissions | ≥ 0 | Rotterdam refinery emissions |
| eu_ets_volume | ≥ 0 | EU ETS trading volume |
| germany_premium | ≥ 0 | German SAF premium |
| fallback_rate | < 10% | Data fallback percentage |
| data_freshness | < threshold | Seconds since last update |

**Output:**

```csv
timestamp,metric,value,status
2026-04-22T22:35:00Z,market_price,850.25,VALID
2026-04-22T22:35:00Z,carbon_intensity,320.5,VALID
2026-04-22T22:35:00Z,fallback_rate,2.3,VALID
```

### Cron Configuration

**Default Schedule:**

```
# Daily health check at 8:00 AM (UTC)
0 8 * * * /Users/yumei/SAFvsOil/scripts/health_check.sh

# 6-hourly data validation (0:00, 6:00, 12:00, 18:00)
0 0,6,12,18 * * * /Users/yumei/SAFvsOil/scripts/validate.sh

# 2-hourly database backup
0 */2 * * * /Users/yumei/SAFvsOil/scripts/backup-db-cron.sh
```

**Installation:**

```bash
# Install cron jobs (requires sudo)
sudo ~/SAFvsOil/scripts/setup_cron.sh install

# Verify installation
sudo ~/SAFvsOil/scripts/setup_cron.sh verify

# Uninstall cron jobs
sudo ~/SAFvsOil/scripts/setup_cron.sh uninstall
```

**View Current Cron Jobs:**

```bash
crontab -l | grep safvsoil
```

## Slack Integration

### Setup

1. Create a Slack webhook:
   - Go to Slack App Directory → Incoming Webhooks
   - Click "Create New"
   - Select channel and authorize
   - Copy webhook URL

2. Set environment variable:

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX"

# Persist in ~/.bashrc or ~/.zshrc
echo 'export SLACK_WEBHOOK_URL="https://..."' >> ~/.zshrc
source ~/.zshrc
```

3. Test webhook:

```bash
~/SAFvsOil/scripts/health_check.sh
# Should send alert if any endpoint fails
```

### Alert Format

```
:warning: SAFvsOil Health Check Failed
Cluster health check detected failures

Timestamp: 2026-04-22 22:35
Host: mac-mini
Summary: 5/6 healthy, 1 timeout
Failed Endpoints:
• france-fastapi: timeout
```

## Log Management

### Log Files

```
/var/log/safvsoil/
├── health_check.log       # Health check execution log
├── validate.log           # Data validation log
├── backup.log             # Database backup log
└── reports/
    ├── health_check_20260422_223500.json
    ├── validate_20260422_223500.json
    └── validate_20260422_223500.csv
```

### Log Rotation

- Automatic rotation when file exceeds 10MB
- Old logs compressed to .gz
- Retention: Keep current + 5 recent (adjust in scripts)

### View Logs

```bash
# Real-time monitoring
tail -f /var/log/safvsoil/health_check.log

# Last 100 lines
tail -100 /var/log/safvsoil/health_check.log

# Search for failures
grep "FAILED\|ERROR\|WARN" /var/log/safvsoil/health_check.log

# View reports
ls -lh /var/log/safvsoil/reports/
```

## Configuration

### Environment Variables

```bash
# API Endpoint (default: http://<mac-mini-tailscale>:8000, see .env.example)
export API_ENDPOINT="http://<mac-mini-endpoint>:8000"

# Slack Webhook URL (optional)
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."

# Log Directory (default: /var/log/safvsoil)
export LOG_DIR="/var/log/safvsoil"

# Report Directory (default: /var/log/safvsoil/reports)
export REPORT_DIR="/var/log/safvsoil/reports"

# Health check timeout (default: 5 seconds)
export TIMEOUT_SECONDS=5

# Max retries (default: 1)
export MAX_RETRIES=1
```

### Custom Configuration

Edit scripts directly to modify:

- Timeout values
- Retry logic
- Endpoint list
- Validation thresholds
- Log retention

## Troubleshooting

### Health Check Timeouts

**Problem:** Frequent timeout errors on remote VPS nodes

**Solutions:**
1. Check network connectivity: `ping <france-tailscale-endpoint>`
2. Verify Tailscale connection: `tailscale status`
3. Check firewall rules: `sudo ufw status`
4. Increase timeout: `TIMEOUT_SECONDS=10 ./health_check.sh`

### Validation Metric Failures

**Problem:** `fallback_rate > 10%` or metric values invalid

**Solutions:**
1. Verify API endpoint is responding: `curl http://<mac-mini-endpoint>:8000/api/v1/sources`
2. Check data source status in logs
3. Review fallback policy configuration
4. Check data freshness: `data_freshness_seconds < 3600`

### Slack Alert Not Sending

**Problem:** Health check runs but no Slack alert

**Solutions:**
1. Verify webhook URL: `echo $SLACK_WEBHOOK_URL`
2. Test webhook: 
   ```bash
   curl -X POST "$SLACK_WEBHOOK_URL" \
     -H 'Content-Type: application/json' \
     -d '{"text":"Test"}'
   ```
3. Check script logs: `tail -f /var/log/safvsoil/health_check.log`

### Cron Jobs Not Running

**Problem:** Cron jobs installed but not executing

**Solutions:**
1. Verify crontab: `crontab -l | grep safvsoil`
2. Check cron daemon: `sudo launchctl list | grep cron`
3. Check permissions: `ls -l /Users/yumei/SAFvsOil/scripts/*.sh`
4. Monitor cron logs: `log stream --predicate 'eventMessage contains[cd] "cron"'`

## Monitoring Dashboard Integration

### Export Metrics to Prometheus

Add to cron job:

```bash
0 * * * * ~/SAFvsOil/scripts/health_check.sh && \
  curl -X POST http://prometheus:9091/metrics/job/safvsoil \
    -d @/var/log/safvsoil/reports/health_check_latest.txt
```

### Query via Grafana

```promql
# Health check pass rate
increase(safvsoil_health_check_passed[1h]) / increase(safvsoil_health_check_total[1h])

# Data validation failures
increase(safvsoil_validation_failed[1h])
```

## Maintenance

### Weekly Tasks

- Review health check logs for patterns
- Verify Slack alerts are being received
- Check data freshness trend
- Monitor fallback rate

### Monthly Tasks

- Archive old logs: `gzip /var/log/safvsoil/*.log.*`
- Review and update timeout values
- Check cron job execution frequency
- Update git hashes for branch tracking

## Development

### Testing Scripts Locally

```bash
# Mock API response for testing
export API_ENDPOINT="http://localhost:8000"

# Run with verbose output
bash -x ./health_check.sh

# Test JSON parsing
echo '{"status":"healthy"}' | jq .status
```

### Adding New Metrics

Edit `validate.sh`:

1. Add metric extraction:
   ```bash
   local new_metric=$(json_get "$response" "new_metric_name" || echo "0")
   ```

2. Add validation:
   ```bash
   local validation_status=$(validate_metric "new_metric" "$new_metric" 0)
   ```

3. Add to report

### Debugging Cron Issues

```bash
# Run cron manually with full environment
env -i HOME=$HOME /bin/sh -c 'exec -a -bash /bin/bash' << 'EOF'
source ~/.bashrc
/Users/yumei/SAFvsOil/scripts/health_check.sh
EOF

# Check cron logs on macOS
log stream --predicate 'process == "cron"'
```

## Support

### Contact

- Slack: #safvsoil-ops
- On-Call: Check rotation schedule
- Documentation: See PROJECT_PROGRESS.md

### Incident Response

1. Check `/var/log/safvsoil/health_check.log` for recent failures
2. Verify endpoint availability: `curl -I http://endpoint/health`
3. Check network: `ping -c 1 endpoint` and `traceroute endpoint`
4. Escalate to cluster admin if persistent
5. Document in incident log: `/var/log/safvsoil/incidents.log`

## License

Internal Use Only - SAFvsOil Project

## Changelog

### v1.0 - Initial Release (2026-04-22)

- ✅ Health check script (6 endpoints)
- ✅ Data validation script (7 metrics)
- ✅ Cron automation framework
- ✅ Slack alert integration
- ✅ Structured JSON/CSV reporting
- ✅ Log rotation and management

---

**Last Updated:** 2026-04-22  
**Maintained By:** DevOps Team  
**Next Review:** 2026-05-22
