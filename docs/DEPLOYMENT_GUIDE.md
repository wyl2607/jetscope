# Deployment Guide — Data Contract v1 Reference

**Version**: 1.0.0
**Last Updated**: 2026-04-25
**Status**: Historical reference / not the canonical release procedure

> Canonical release and deployment behavior lives in `../OPERATIONS.md`.
> Use this document only as background for data-contract infrastructure notes, not as an executable production runbook.

## Overview

This document is a non-canonical reference for Data Contract v1 infrastructure concepts:

- **Postgres** production-style data store notes
- **SQLite** development/testing local database notes
- **Generic remote host** examples using placeholder environment variables

For real JetScope release and deployment operations, follow `../OPERATIONS.md`.
Do not treat the examples below as a production runbook, and do not add private hostnames,
personal home-directory paths, internal node aliases, webhook URLs, or secrets to this file.

## Phase 0: Reference Checklist

This checklist is informational only. The canonical release gate is the
approval-gated release command documented in `../OPERATIONS.md`.

- [ ] Public API contract reviewed: `docs/API_CONTRACT_V1.md`
- [ ] Local quality gate passes where applicable: `npm run preflight`
- [ ] Database credentials are provided through a secret manager or deployment environment, not committed documentation
- [ ] Remote host aliases, private IPs, internal node names, and webhook URLs are kept out of public docs
- [ ] Production release follows `../OPERATIONS.md`, not the examples in this file

## Phase 1: SQLite Development Setup

**Use for**: Local testing, development, and fallback checks during data-store work.

### Step 1a: Create SQLite Database

```bash
cd apps/db/migrations
sqlite3 "${TMPDIR:-/tmp}/jetscope_dev.sqlite3" < sqlite_001_create_market_contract_v1.sql
```

### Step 1b: Verify Tables

```bash
sqlite3 "${TMPDIR:-/tmp}/jetscope_dev.sqlite3" ".tables"
```

### Step 1c: Configure Local Environment

```bash
export JETSCOPE_DATABASE_URL="sqlite:///${TMPDIR:-/tmp}/jetscope_dev.sqlite3"
export JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS="600"
```

### Step 1d: Run Local Checks

```bash
npm run api:check
npm run api:test
```

## Phase 2: Postgres Production-Style Setup

**Use for**: Production-style deployments where an operator has already provisioned
PostgreSQL and secrets outside the repository.

Do not grant the application database user superuser privileges. Do not write real
passwords, hostnames, or connection strings into this document.

### Step 2a: Provision Database

Provision the database using your platform's normal DBA or infrastructure process.
A least-privilege application role should have only the permissions required by the
JetScope schema and migrations.

Example placeholders only:

```bash
export JETSCOPE_DATABASE_URL="postgresql+psycopg://jetscope:<password>@<postgres-host>:5432/jetscope_production"
npm run api:migrate
```

### Step 2b: Verify Schema

```bash
psql "$JETSCOPE_DATABASE_URL" -c "\dt"
```

### Step 2c: Replication and Failover

Replication and failover are operator-managed concerns and are intentionally not
documented as executable commands here. Use your hosting provider, DBA runbook, or
infrastructure-as-code templates. Keep private hostnames, IPs, credentials, and
replication secrets out of this repository.

## Phase 3: Migration Notes

This section is conceptual. Do not treat it as an executable zero-downtime migration
plan unless a current implementation and operator-approved runbook exist.

Recommended minimum approach:

1. Take a verified backup of the current database.
2. Apply migrations in a staging or production-style environment.
3. Run `npm run preflight` and API contract checks.
4. Compare expected market metric keys against `GET /v1/market/snapshot`.
5. Follow the canonical release flow in `../OPERATIONS.md`.

The current public API snapshot shape is documented in `docs/API_CONTRACT_V1.md`.
Avoid adding dual-write pseudocode or one-off SQL checks here unless they are backed
by tested code in the repository.

## Phase 4: Release and Remote Deployment

The canonical release and deployment procedure is maintained in `../OPERATIONS.md`.

Use:

```bash
cd <jetscope-repo>
source scripts/jetscope-env
APPROVE_JETSCOPE_RELEASE=<approval-token> npm run release -- --approval-token <approval-token>
```

Do not duplicate private SSH configuration, personal usernames, host aliases, IPs,
identity-file paths, or service restart commands in this document. Development worker
sync and production deployment are separate concerns; worker sync is opt-in and not
part of the default production release path.

## Phase 5: Monitoring & Alerts

Monitoring is deployment-environment specific. Keep webhook URLs, alert routing,
private hostnames, and on-call details outside this public document.

Minimum public checks can use documented API endpoints:

```bash
export JETSCOPE_API_BASE_URL="https://<your-api-host>"
curl -fsS "$JETSCOPE_API_BASE_URL/v1/health"
curl -fsS "$JETSCOPE_API_BASE_URL/v1/market/snapshot"
```

If alerting is configured, store webhook URLs and credentials in the deployment
environment or secret manager, not in repository documentation.

## Phase 6: Post-Deployment Validation

### Step 6a: Smoke Tests

```bash
export JETSCOPE_API_BASE_URL="https://<your-api-host>"

# 1. API health check
curl -fsS "$JETSCOPE_API_BASE_URL/v1/health" | jq '.'

# 2. All 7 market values present
curl -fsS "$JETSCOPE_API_BASE_URL/v1/market/snapshot" | jq '.values | keys | length'
# Expected: 7

# 3. Source status exposed
curl -fsS "$JETSCOPE_API_BASE_URL/v1/market/snapshot" | jq '.source_status'

# 4. Source detail metadata exposed
curl -fsS "$JETSCOPE_API_BASE_URL/v1/market/snapshot" | jq '.source_details | keys'
```

### Step 6b: Load Test

Load testing is optional and environment-specific. Choose thresholds in the operator
runbook; do not treat this document as the SLO source.

```bash
ab -n 500 -c 10 "$JETSCOPE_API_BASE_URL/v1/market/snapshot"
```

### Step 6c: Failover Test

Failover testing is operator-managed and should use an approved environment-specific
runbook. Do not place destructive service-stop commands or private node names in this
public document.

## Recovery / Rollback Notes

Recovery is operator-managed. The current operational source of truth is
`../OPERATIONS.md`, which notes that auto-deploy failure handling is fail-closed and
observable but not transactional rollback.

Minimum public guidance:

1. Inspect deployment and application logs in the target environment.
2. Verify the published commit and deployment target.
3. Use an approved operator recovery runbook for rollback or forward-fix.
4. Keep webhook URLs, private node names, and service-management commands out of this file.
5. Re-run public smoke checks after recovery:

```bash
curl -fsS "$JETSCOPE_API_BASE_URL/v1/health" | jq '.'
curl -fsS "$JETSCOPE_API_BASE_URL/v1/market/snapshot" | jq '.source_status'
```

## Environment Variables Checklist

Use placeholders only in documentation. Real credentials and webhook URLs must live
in the deployment environment or secret manager, never in committed files.

```bash
export JETSCOPE_API_BASE_URL="https://<your-api-host>"
export JETSCOPE_DATABASE_URL="postgresql+psycopg://<user>:<password>@<postgres-host>:5432/<database>"
export JETSCOPE_ADMIN_TOKEN="<provided-by-secret-manager>"
export JETSCOPE_SCHEMA_BOOTSTRAP_MODE="alembic"
```

## Maintenance Notes

- Keep API examples aligned with `docs/API_CONTRACT_V1.md`.
- Keep release instructions aligned with `../OPERATIONS.md`.
- Do not add SLA, compliance, or production-readiness claims unless they are backed by current operator-approved documentation.

## Support & Escalation

For public documentation, use repository-visible support paths:

- API contract questions: see `docs/API_CONTRACT_V1.md`
- Release/deployment behavior: see `../OPERATIONS.md`
- Product or code issues: create a GitHub issue with reproducible steps

Environment-specific log paths, alert channels, private network tooling, and on-call
contacts belong in private operator runbooks, not this repository document.

**Reference Review Checklist**:

- [ ] API examples match `docs/API_CONTRACT_V1.md`
- [ ] Release instructions point to `../OPERATIONS.md`
- [ ] No secrets, private hostnames, private IPs, personal paths, webhook URLs, or internal on-call details are present
- [ ] Public smoke checks use existing `/v1/*` endpoints
