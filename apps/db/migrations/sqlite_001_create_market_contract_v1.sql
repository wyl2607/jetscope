-- SQLite DDL — Data Contract v1
-- NOTE: SQLite 不支持 TIMESTAMPTZ，改用 TEXT (ISO-8601)
-- NOTE: SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT
-- NOTE: CHECK constraints 语法相同，但执行宽松

CREATE TABLE IF NOT EXISTS market_prices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_date   TEXT    NOT NULL UNIQUE,   -- YYYY-MM-DD
    price_eur       REAL    NOT NULL,
    source          TEXT,
    confidence      REAL    NOT NULL DEFAULT 1.0,
    freshness_minutes INTEGER,
    error_code      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS carbon_intensities (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_datetime   TEXT NOT NULL,         -- ISO-8601
    intensity_gco2_kwh  REAL NOT NULL,
    country_code        TEXT NOT NULL DEFAULT 'DE',
    source              TEXT,
    confidence          REAL NOT NULL DEFAULT 1.0,
    freshness_minutes   INTEGER,
    error_code          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(recorded_datetime, country_code)
);

CREATE TABLE IF NOT EXISTS germany_premiums (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_date  TEXT    NOT NULL,
    airline_code TEXT,
    route_code   TEXT,
    subsidy_eur  REAL    NOT NULL,
    source       TEXT,
    confidence   REAL    NOT NULL DEFAULT 1.0,
    valid_from   TEXT,
    valid_to     TEXT,
    error_code   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(policy_date, airline_code, route_code)
);

CREATE TABLE IF NOT EXISTS rotterdam_emissions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_date      TEXT NOT NULL UNIQUE,
    emissions_tons     REAL NOT NULL,
    calculation_method TEXT,
    source_1           TEXT,
    source_2           TEXT,
    confidence         REAL NOT NULL DEFAULT 1.0,
    error_code         TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eu_ets_volumes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    trading_date     TEXT  NOT NULL UNIQUE,
    volume_contracts INTEGER NOT NULL,
    price_eur        REAL,
    source           TEXT,
    confidence       REAL NOT NULL DEFAULT 1.0,
    error_code       TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_freshness (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name  TEXT NOT NULL UNIQUE,
    last_refresh TEXT NOT NULL,
    next_refresh TEXT,
    status       TEXT NOT NULL DEFAULT 'green',
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_status (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name      TEXT NOT NULL UNIQUE,
    status           TEXT NOT NULL DEFAULT 'ok',
    error_code       TEXT,
    last_error_time  TEXT,
    confidence_score REAL NOT NULL DEFAULT 1.0,
    quota_used       INTEGER,
    quota_limit      INTEGER,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS migration_audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type     TEXT NOT NULL,
    phase          INTEGER,
    table_name     TEXT,
    rows_written   INTEGER DEFAULT 0,
    rows_verified  INTEGER DEFAULT 0,
    error_detail   TEXT,
    recorded_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
