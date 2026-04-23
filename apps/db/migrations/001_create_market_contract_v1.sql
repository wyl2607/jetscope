-- ============================================================
-- Data Contract v1 — PostgreSQL DDL
-- Generated: 2026-04-22  Status: FROZEN
-- ============================================================

-- 1. market_prices
CREATE TABLE IF NOT EXISTS market_prices (
    id            SERIAL PRIMARY KEY,
    recorded_date DATE        NOT NULL,
    price_eur     NUMERIC(10,2) NOT NULL,
    source        VARCHAR(50),
    confidence    FLOAT       NOT NULL DEFAULT 1.0
                  CHECK (confidence BETWEEN 0.0 AND 1.0),
    freshness_minutes INT,
    error_code    VARCHAR(20),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ,
    CONSTRAINT uq_market_prices_date UNIQUE (recorded_date)
);
CREATE INDEX IF NOT EXISTS idx_market_prices_date ON market_prices (recorded_date DESC);
COMMENT ON TABLE  market_prices IS 'SAF market price EUR/L — Data Contract v1';
COMMENT ON COLUMN market_prices.confidence IS '1.0=authoritative, 0.5=cached, 0.0=hardcoded_fallback';

-- 2. carbon_intensities
CREATE TABLE IF NOT EXISTS carbon_intensities (
    id                   SERIAL PRIMARY KEY,
    recorded_datetime    TIMESTAMPTZ NOT NULL,
    intensity_gco2_kwh   NUMERIC(8,1) NOT NULL,
    country_code         CHAR(2)     NOT NULL DEFAULT 'DE',
    source               VARCHAR(50),
    confidence           FLOAT       NOT NULL DEFAULT 1.0
                         CHECK (confidence BETWEEN 0.0 AND 1.0),
    freshness_minutes    INT,
    error_code           VARCHAR(20),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_carbon_datetime_country UNIQUE (recorded_datetime, country_code)
);
CREATE INDEX IF NOT EXISTS idx_carbon_datetime ON carbon_intensities (recorded_datetime DESC);

-- 3. germany_premiums
CREATE TABLE IF NOT EXISTS germany_premiums (
    id           SERIAL PRIMARY KEY,
    policy_date  DATE        NOT NULL,
    airline_code CHAR(3),                    -- NULL means all airlines
    route_code   VARCHAR(10),                -- NULL means all routes
    subsidy_eur  NUMERIC(10,2) NOT NULL,
    source       VARCHAR(50),
    confidence   FLOAT       NOT NULL DEFAULT 1.0
                 CHECK (confidence BETWEEN 0.0 AND 1.0),
    valid_from   DATE,
    valid_to     DATE,
    error_code   VARCHAR(20),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_germany_premiums UNIQUE (policy_date, airline_code, route_code)
);
CREATE INDEX IF NOT EXISTS idx_germany_premiums_date ON germany_premiums (policy_date DESC);

-- 4. rotterdam_emissions
CREATE TABLE IF NOT EXISTS rotterdam_emissions (
    id                 SERIAL PRIMARY KEY,
    recorded_date      DATE        NOT NULL,
    emissions_tons     NUMERIC(12,2) NOT NULL,
    calculation_method VARCHAR(50),           -- openaq_ecmwf | historical_avg | fallback
    source_1           VARCHAR(50),
    source_2           VARCHAR(50),
    confidence         FLOAT NOT NULL DEFAULT 1.0
                       CHECK (confidence BETWEEN 0.0 AND 1.0),
    error_code         VARCHAR(20),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rotterdam_date UNIQUE (recorded_date)
);

-- 5. eu_ets_volumes
CREATE TABLE IF NOT EXISTS eu_ets_volumes (
    id               SERIAL PRIMARY KEY,
    trading_date     DATE        NOT NULL,
    volume_contracts BIGINT      NOT NULL,
    price_eur        NUMERIC(8,2),
    source           VARCHAR(50),
    confidence       FLOAT NOT NULL DEFAULT 1.0
                     CHECK (confidence BETWEEN 0.0 AND 1.0),
    error_code       VARCHAR(20),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eu_ets_date UNIQUE (trading_date)
);

-- 6. data_freshness  (one row per metric — UPSERT target)
CREATE TABLE IF NOT EXISTS data_freshness (
    id           SERIAL PRIMARY KEY,
    metric_name  VARCHAR(50)  NOT NULL,
    last_refresh TIMESTAMPTZ  NOT NULL,
    next_refresh TIMESTAMPTZ,
    status       VARCHAR(10)  NOT NULL DEFAULT 'green'
                 CHECK (status IN ('green','yellow','red')),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_freshness_metric UNIQUE (metric_name)
);

-- 7. source_status  (one row per external source — UPSERT target)
CREATE TABLE IF NOT EXISTS source_status (
    id               SERIAL PRIMARY KEY,
    source_name      VARCHAR(50)  NOT NULL,
    status           VARCHAR(20)  NOT NULL DEFAULT 'ok'
                     CHECK (status IN ('ok','error','rate_limited','stale','unknown')),
    error_code       VARCHAR(20),
    last_error_time  TIMESTAMPTZ,
    confidence_score FLOAT        NOT NULL DEFAULT 1.0
                     CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    quota_used       INT,
    quota_limit      INT,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_source_name UNIQUE (source_name)
);
CREATE INDEX IF NOT EXISTS idx_source_status_non_ok ON source_status (status)
    WHERE status != 'ok';

-- 8. migration_audit  (tracks Postgres↔SQLite sync events)
CREATE TABLE IF NOT EXISTS migration_audit (
    id           SERIAL PRIMARY KEY,
    event_type   VARCHAR(30) NOT NULL,  -- phase_start | row_sync | verify_ok | rollback
    phase        SMALLINT,              -- 1 | 2 | 3
    table_name   VARCHAR(50),
    rows_written BIGINT DEFAULT 0,
    rows_verified BIGINT DEFAULT 0,
    error_detail TEXT,
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
