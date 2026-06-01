# OSS Issue Backlog

This is a public-safe, maintainer-drafted issue plan. It is not a substitute
for GitHub issues; it keeps the next issues concrete until a maintainer opens
them in the tracker.

## 1. Harden Public SAF Price Source Fallback Semantics

- Labels: `data-source`, `good first issue`
- Purpose: create an external contributor entry point around provenance and
  fallback behavior.
- Scope: document and test how SAF proxy values are labelled when live/public
  sources are stale, unavailable, or derived.
- Acceptance criteria:
  - fallback state is visible in the API response
  - source confidence semantics remain aligned with `docs/DATA_CONTRACT_V1.md`
  - a regression test covers stale-source behavior

## 2. Add Source Freshness Regression Tests

- Labels: `testing`, `maintenance`
- Purpose: show quality maintenance around source health and freshness.
- Scope: add focused tests for freshness timestamps, confidence ranges, and
  fallback flags in market/source responses.
- Acceptance criteria:
  - tests fail if freshness metadata disappears
  - tests cover at least one live/proxy path and one fallback path

## 3. Document EU ETS Carbon Cost Assumptions

- Labels: `docs`, `domain-model`
- Purpose: make the domain model understandable to reviewers and contributors.
- Scope: document carbon-price assumptions used by tipping-point and decision
  surfaces, with source/proxy caveats.
- Acceptance criteria:
  - docs link to the relevant API/data contract fields
  - assumptions distinguish implemented behavior from future validation work

## 4. Add Docker Quickstart Smoke Test

- Labels: `devex`, `ci`
- Purpose: improve reproducibility beyond the local virtualenv path.
- Scope: add a non-deploy smoke check for `infra/docker-compose.yml` or a
  documented local substitute if Docker is unavailable in CI.
- Acceptance criteria:
  - smoke path does not require production secrets
  - failure output points contributors to setup remediation

## 5. Add Release Dry-Run Workflow

- Labels: `release`, `automation`
- Purpose: show release-management maturity without publish/deploy side effects.
- Scope: add or harden a local dry-run path for preflight, security, review
  guard, and diff hygiene.
- Acceptance criteria:
  - dry-run does not push, publish, deploy, SSH, or rsync
  - docs explain the difference between dry-run and approval-gated release

## 6. Validate AI Research Mock/Live Boundary

- Labels: `ai-pipeline`, `safety`
- Purpose: make AI cost and safety boundaries testable.
- Scope: test or document how mock mode avoids external LLM calls and how live
  mode requires explicit keys and budget guards.
- Acceptance criteria:
  - mock mode remains deterministic and key-free
  - live mode setup is documented without exposing secrets

## 7. Add Public Sample Scenario Pack

- Labels: `demo`, `domain-model`
- Purpose: make the product easier to inspect without private data.
- Scope: add small public-safe scenario fixtures for SAF timing, reserve stress,
  and carbon-cost comparison.
- Acceptance criteria:
  - sample data is deterministic and safe to commit
  - demo docs explain how to load or compare scenarios

## 8. Review Dependency/Security Audit Posture

- Labels: `security`, `maintenance`
- Purpose: keep dependency and static-check posture visible to reviewers.
- Scope: review `npm audit`, Python audit, CodeQL, Semgrep, Vale, and
  markdownlint gates for clear failure modes and public-safe outputs.
- Acceptance criteria:
  - audit commands are documented
  - missing tools or skipped checks are explicit, not silent
