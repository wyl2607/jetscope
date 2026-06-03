# Maintenance Log

This log records public-safe maintenance evidence for the JetScope repository.

## 2026-06-03

- Added focused source freshness regression coverage for issue #77.
- Strengthened API contract tests so `/v1/market/snapshot` must expose
  `source_status.freshness_minutes`, confidence, fallback rate, and explicit
  fallback state.
- Added source coverage unit assertions for live/proxy and fallback quality
  metadata, including confidence, lag, source type, fallback flags, and degraded
  coverage state.
- Updated the Lane C freshness canary to read `source_status.freshness_minutes`
  directly instead of silently defaulting from a missing `values.data_freshness`
  key.
- Validation: `apps/api/.venv/bin/python -m pytest
  apps/api/tests/test_market_contract_v1.py apps/api/tests/test_sources_units.py
  apps/api/tests/test_lane_c_e2e.py -q` passed with 33 tests; full
  `apps/api/.venv/bin/python -m pytest apps/api/tests -q` passed with 317
  tests and 3 pre-existing deprecation warnings; `git diff --check` and
  `scripts/security_check.sh` passed.

## 2026-06-01

- Reviewed the public repository entry files, product README, API contract, data contract, AI pipeline, and PR template before making documentation changes.
- Added contributor-facing trust-pack documentation for onboarding, maintainer responsibilities, security reporting, roadmap framing, and changelog history.
- Kept the OSS trust-pack wave within public documentation and issue/PR
  template files only.
- Avoided adding claims about production adoption, external team size, private automation, or security guarantees not supported by the repository.
- Added release-readiness and reviewer reproducibility documentation: a local
  dry-run release script, release process notes, Codex-for-OSS use guidance,
  quickstart, demo path, `.env.example`, and infrastructure notes.
- Prepared public-safe next-step artifacts: `docs/OSS_ISSUE_BACKLOG.md`,
  `docs/RELEASE_NOTES_V0_1_0_ALPHA.md`, and the goal-refactor execution record
  in `docs/exec-plans/2026-06-01-oss-readiness-goal-refactor.md`.
- Validation evidence for the local OSS-readiness branch: `bash -n
  scripts/release-dry-run.sh`, `git diff --check origin/main..HEAD`, and
  `scripts/security_check.sh` passed. `gitleaks` was not installed, so the
  security gate used its built-in high-signal secret pattern scan.
- No push, PR, merge, deploy, publish, SSH, rsync, reset, delete, or remote
  mutation was performed during this maintenance pass.

## Maintenance Posture

- Public documentation should stay aligned with the implemented API, data, and AI pipeline contracts.
- Maintenance notes should remain reviewable and free of secrets, raw runtime logs, local machine paths, and private automation internals.
- Validation for docs-only changes should remain lightweight but real.
