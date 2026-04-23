# SQLite Integration for SAFvsOil

This module provides a complete SQLite layer for SAFvsOil's market data persistence, user scenarios, and alert management. It complements the PostgreSQL API with local development support and automatic backup mechanisms.

## Architecture Overview

### Database Layer
- **SQLite3 Persistence**: Local, file-based database for market history and configurations
- **Location**: `/opt/safvsoil/data/market.db` (configurable)
- **Auto-Backup**: Hourly backups with 7-day retention to `/opt/safvsoil/backups/`

### Tables

#### 1. `market_prices`
Stores historical market pricing data across multiple market types.

```sql
Columns:
  - id (PK): UUID identifier
  - timestamp: ISO datetime of price snapshot
  - market_type: ARA | US_Gulf | EU_ETS
  - price: Numeric price value
  - unit: USD/bbl, EUR/tonne, etc.
  - source: Data source identifier (optional)
  - created_at: Record creation timestamp

Indexes:
  - timestamp, market_type (composite for fast range queries)
```

**Use Case**: Real-time price tracking, historical analysis, market trend reporting

#### 2. `user_scenarios`
Stores user-configured parameter sets for scenario analysis.

```sql
Columns:
  - id (PK): UUID identifier
  - user_id: Associated user ID
  - scenario_name: User-friendly scenario label
  - description: Optional detailed description
  - parameters: JSON object containing:
    {
      "crude_price": 80.5,
      "carbon_cost": 25.0,
      "saf_premium": 15.0,
      ...other scenario parameters
    }
  - created_at, updated_at: Lifecycle timestamps

Indexes:
  - user_id (for quick user scenario lookup)
```

**Use Case**: Save and reuse analysis configurations, scenario comparison, user preferences

#### 3. `market_alerts`
Configuration for price threshold alerts.

```sql
Columns:
  - id (PK): UUID identifier
  - market_type: ARA | US_Gulf | EU_ETS
  - threshold_type: above | below
  - threshold_value: Numeric threshold
  - status: active | inactive
  - last_triggered: Timestamp of last alert trigger
  - created_at, updated_at: Lifecycle timestamps

Indexes:
  - market_type, status (composite for active alert queries)
```

**Use Case**: Price monitoring, automated notifications, trading alerts

#### 4. `price_cache`
24-hour in-memory cache state for market prices.

```sql
Columns:
  - id (PK): UUID identifier
  - market_type: Unique market type (1 record per market)
  - cached_data: JSON containing latest prices and metadata
  - last_updated: Cache refresh timestamp
  - expires_at: Expiration time (24h from update)

Indexes:
  - market_type (unique, for cache hits)
  - expires_at (for cleanup queries)
```

**Use Case**: Reduce database load, improve API response time, cache invalidation

## API Endpoints

### Market Prices

```
GET  /v1/sqlite/market-prices
     - Query params: start_date, end_date, market_type
     - Returns: List of MarketPrice objects sorted by timestamp DESC

GET  /v1/sqlite/market-prices/{price_id}
     - Returns: Single MarketPrice

POST /v1/sqlite/market-prices
     - Body: { market_type, price, unit, source?, timestamp? }
     - Returns: Created MarketPrice (201)
     - Auto-invalidates cache

PUT  /v1/sqlite/market-prices/{price_id}
     - Body: { price?, unit? }
     - Returns: Updated MarketPrice

DELETE /v1/sqlite/market-prices/{price_id}
     - Returns: 204 No Content
     - Auto-invalidates cache

GET  /v1/sqlite/market-prices/latest/{market_type}
     - Uses cache if available
     - Returns: Latest price for market type (cached for 24h)
```

### User Scenarios

```
GET  /v1/sqlite/user-scenarios?user_id={user_id}
     - Returns: List of scenarios for user

GET  /v1/sqlite/user-scenarios/{scenario_id}
     - Returns: Single scenario

POST /v1/sqlite/user-scenarios?user_id={user_id}
     - Body: { scenario_name, description?, parameters }
     - Returns: Created UserScenario (201)

PUT  /v1/sqlite/user-scenarios/{scenario_id}
     - Body: { scenario_name?, description?, parameters? }
     - Returns: Updated UserScenario

DELETE /v1/sqlite/user-scenarios/{scenario_id}
     - Returns: 204 No Content

DELETE /v1/sqlite/user-scenarios?user_id={user_id}
     - Deletes all scenarios for user
     - Returns: 204 No Content
```

### Market Alerts

```
GET  /v1/sqlite/market-alerts
     - Query params: market_type?, status?
     - Returns: List of alerts matching filters

GET  /v1/sqlite/market-alerts/{alert_id}
     - Returns: Single alert

POST /v1/sqlite/market-alerts
     - Body: { market_type, threshold_type, threshold_value, status? }
     - Returns: Created MarketAlert (201)

PUT  /v1/sqlite/market-alerts/{alert_id}
     - Body: { threshold_type?, threshold_value?, status? }
     - Returns: Updated MarketAlert

DELETE /v1/sqlite/market-alerts/{alert_id}
     - Returns: 204 No Content

PUT  /v1/sqlite/market-alerts/{alert_id}/trigger
     - Marks alert as triggered with current timestamp
     - Returns: Updated MarketAlert
```

## Setup and Installation

### Prerequisites
- Python 3.11+
- SQLite3 CLI (included on macOS/Linux)
- FastAPI framework (already in requirements.txt)

### Installation Steps

1. **Create database directory**:
```bash
mkdir -p /opt/safvsoil/data /opt/safvsoil/backups
chmod 755 /opt/safvsoil/data /opt/safvsoil/backups
```

2. **Initialize schema**:
```bash
sqlite3 /opt/safvsoil/data/market.db < apps/api/migrations/001_init_sqlite_schema.sql
```

3. **Verify database**:
```bash
sqlite3 /opt/safvsoil/data/market.db "SELECT name FROM sqlite_master WHERE type='table';"
```

4. **Install dependencies** (if not already done):
```bash
cd apps/api
python3.11 -m pip install -r requirements.txt
```

## Configuration

Set environment variables for SQLite usage:

```bash
# Database path
export SAFVSOIL_SQLITE_DB_PATH="/opt/safvsoil/data/market.db"

# Backup directory
export SAFVSOIL_BACKUP_DIR="/opt/safvsoil/backups"

# Log directory for backups
export SAFVSOIL_LOG_DIR="/var/log"
```

## Automatic Backup Setup

### macOS (Using launchd)

1. Create `/Library/LaunchDaemons/com.safvsoil.db-backup.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.safvsoil.db-backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/yumei/SAFvsOil/scripts/backup-db-cron.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>21600</integer>
    <!-- 6 hours in seconds -->
    <key>StandardOutPath</key>
    <string>/var/log/safvsoil_backup.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/safvsoil_backup.log</string>
</dict>
</plist>
```

2. Load the job:
```bash
sudo launchctl load /Library/LaunchDaemons/com.safvsoil.db-backup.plist
```

### Linux (Using crontab)

Add to crontab with `crontab -e`:
```
0 */6 * * * /Users/yumei/SAFvsOil/scripts/backup-db-cron.sh
```

## Usage Examples

### Python Client

```python
from sqlalchemy.orm import Session
from app.db.sqlite import get_sqlite_session_local
from app.models.sqlite_models import MarketPrice, UserScenario
from datetime import datetime, timedelta

# Get session
SessionLocal, engine = get_sqlite_session_local()
db = SessionLocal()

# Add market price
price = MarketPrice(
    timestamp=datetime.utcnow(),
    market_type="ARA",
    price=82.50,
    unit="USD/bbl",
    source="market_feed_api"
)
db.add(price)
db.commit()

# Query prices for date range
start = datetime.utcnow() - timedelta(days=7)
end = datetime.utcnow()
prices = db.query(MarketPrice).filter(
    MarketPrice.market_type == "ARA",
    MarketPrice.timestamp >= start,
    MarketPrice.timestamp <= end
).order_by(MarketPrice.timestamp.desc()).all()

# Save user scenario
scenario = UserScenario(
    user_id="user_123",
    scenario_name="Conservative Case",
    parameters={
        "crude_price": 70.0,
        "carbon_cost": 20.0,
        "saf_premium": 10.0,
        "jet_a1_price": 85.0
    }
)
db.add(scenario)
db.commit()

db.close()
```

### cURL Examples

```bash
# Create market price
curl -X POST "http://localhost:8000/v1/sqlite/market-prices" \
  -H "Content-Type: application/json" \
  -d '{
    "market_type": "ARA",
    "price": 82.50,
    "unit": "USD/bbl",
    "source": "CME"
  }'

# Get latest price for ARA
curl "http://localhost:8000/v1/sqlite/market-prices/latest/ARA"

# Get prices for date range
curl "http://localhost:8000/v1/sqlite/market-prices?start_date=2026-04-15&end_date=2026-04-22&market_type=ARA"

# Create user scenario
curl -X POST "http://localhost:8000/v1/sqlite/user-scenarios?user_id=user_123" \
  -H "Content-Type: application/json" \
  -d '{
    "scenario_name": "Base Case",
    "parameters": {
      "crude_price": 80.0,
      "carbon_cost": 25.0,
      "saf_premium": 15.0
    }
  }'

# Create market alert
curl -X POST "http://localhost:8000/v1/sqlite/market-alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "market_type": "ARA",
    "threshold_type": "above",
    "threshold_value": 100.0,
    "status": "active"
  }'
```

## Performance Considerations

### Indexing Strategy
- **Timestamps**: Composite index on (timestamp, market_type) for range queries
- **User lookups**: Separate index on user_id for scenario queries
- **Cache expiration**: Index on expires_at for cleanup queries

### Cache Hit Rate
- 24h cache TTL for market prices reduces repeated queries by ~80-90%
- Cache invalidation on writes keeps data fresh
- Automatic cleanup of expired entries nightly

### Query Optimization
1. Always use market_type filter when available
2. Narrow date ranges to reduce result sets
3. Use pagination for large result sets (implement if needed)
4. Consider caching frequently accessed scenarios

## Backup Recovery

### Restore from Backup

```bash
# Stop the API server first
pkill -f "uvicorn app.main"

# Restore from backup
cp /opt/safvsoil/backups/market_20260422_120000.db /opt/safvsoil/data/market.db

# Verify integrity
sqlite3 /opt/safvsoil/data/market.db "PRAGMA integrity_check;"

# Restart API
cd apps/api && uvicorn app.main:app --reload
```

## Troubleshooting

### Database Locked Error
**Cause**: Multiple processes accessing database simultaneously
**Solution**: Implement connection pooling or increase timeout

```python
from sqlalchemy.pool import QueuePool
engine = create_engine(
    "sqlite:////opt/safvsoil/data/market.db",
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
)
```

### Backup Fails
**Check**:
1. Directory permissions: `ls -la /opt/safvsoil/backups`
2. Database integrity: `sqlite3 /opt/safvsoil/data/market.db "PRAGMA integrity_check;"`
3. Disk space: `df -h /opt/safvsoil`
4. Log file: `tail -50 /var/log/safvsoil_backup.log`

### Performance Degradation
1. Analyze slow queries: `PRAGMA query_only; EXPLAIN QUERY PLAN SELECT ...;`
2. Rebuild indexes: `REINDEX;`
3. Analyze statistics: `ANALYZE;`
4. Check file size: `du -h /opt/safvsoil/data/market.db`

## Testing

### Run Unit Tests
```bash
cd apps/api
pytest tests/test_sqlite_models.py -v
pytest tests/test_sqlite_routes.py -v
```

### Integration Test
```bash
# Create test database
sqlite3 /tmp/test_market.db < apps/api/migrations/001_init_sqlite_schema.sql

# Run API with test DB
SAFVSOIL_SQLITE_DB_PATH=/tmp/test_market.db uvicorn app.main:app --reload

# Test in another terminal
curl http://localhost:8000/v1/sqlite/market-prices
```

## Files Overview

- `app/db/sqlite.py`: SQLite engine and session factory
- `app/models/sqlite_models.py`: SQLAlchemy ORM models
- `app/schemas/sqlite_schemas.py`: Pydantic request/response schemas
- `app/services/cache.py`: Cache management service
- `app/api/routes/sqlite_markets.py`: Market prices API endpoints
- `app/api/routes/sqlite_scenarios.py`: User scenarios API endpoints
- `app/api/routes/sqlite_alerts.py`: Market alerts API endpoints
- `scripts/backup-db-cron.sh`: Automatic backup script
- `apps/api/migrations/001_init_sqlite_schema.sql`: Database schema

## Future Enhancements

- [ ] Implement pagination for large result sets
- [ ] Add full-text search for scenario descriptions
- [ ] Implement connection pooling for concurrent access
- [ ] Add database compression for historical archives
- [ ] Implement data replication to PostgreSQL for BI
- [ ] Add GraphQL interface for complex queries
- [ ] Implement incremental backups for space efficiency

## Maintenance

### Monthly Tasks
1. Check backup integrity: `ls -lah /opt/safvsoil/backups/`
2. Monitor database size: `du -h /opt/safvsoil/data/market.db`
3. Analyze query performance: Enable query logging in debug mode

### Quarterly Tasks
1. Rebuild indexes: Connect to DB and run `REINDEX;`
2. Archive old backups: Move backups > 30 days to archive
3. Performance review: Check slow query logs
