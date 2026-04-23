-- SQLite Schema Initialization for SAFvsOil
-- Version: 001_init_schema
-- Created: 2026-04-22

-- Market prices table: Historical market data for different market types
CREATE TABLE IF NOT EXISTS market_prices (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    market_type TEXT NOT NULL,
    price REAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_market_prices_timestamp ON market_prices(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_prices_market_type ON market_prices(market_type);
CREATE INDEX IF NOT EXISTS idx_market_prices_timestamp_market_type ON market_prices(timestamp, market_type);

-- User scenarios table: Store user configuration parameters
CREATE TABLE IF NOT EXISTS user_scenarios (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    scenario_name TEXT NOT NULL,
    description TEXT,
    parameters JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_scenarios_user_id ON user_scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_user_scenarios_created_at ON user_scenarios(created_at);

-- Market alerts table: Price threshold configurations
CREATE TABLE IF NOT EXISTS market_alerts (
    id TEXT PRIMARY KEY,
    market_type TEXT NOT NULL,
    threshold_type TEXT NOT NULL,
    threshold_value REAL NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    last_triggered DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_alerts_market_type ON market_alerts(market_type);
CREATE INDEX IF NOT EXISTS idx_market_alerts_status ON market_alerts(status);
CREATE INDEX IF NOT EXISTS idx_market_alerts_market_type_status ON market_alerts(market_type, status);

-- Price cache table: In-memory cache state tracking
CREATE TABLE IF NOT EXISTS price_cache (
    id TEXT PRIMARY KEY,
    market_type TEXT NOT NULL UNIQUE,
    cached_data JSON NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_cache_market_type ON price_cache(market_type);
CREATE INDEX IF NOT EXISTS idx_price_cache_expires_at ON price_cache(expires_at);

-- Create triggers for updated_at timestamp updates
CREATE TRIGGER IF NOT EXISTS user_scenarios_updated_at_trigger
AFTER UPDATE ON user_scenarios
FOR EACH ROW
BEGIN
  UPDATE user_scenarios SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS market_alerts_updated_at_trigger
AFTER UPDATE ON market_alerts
FOR EACH ROW
BEGIN
  UPDATE market_alerts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Enable foreign keys
PRAGMA foreign_keys = ON;
