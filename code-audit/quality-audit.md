# Quality Audit — jetscope

Generated: 2026-05-28T17:20:00+02:00 (Berlin)
Auditor: Codex (relay/gpt-5.5) via yilinmac-mini-2, salvaged from log by Claude controller
Scope: HEAD as of 28710d8c (main, last commit 2026-05-27)
Provenance: `/tmp/codex-dispatch-2026-05-28/goal-2-macmini.log` — codex completed analysis but could not write here directly due to `/Volumes/Mac扩容` sandbox barrier on mac mini.

## Summary
- Findings count: 3 (initial seed; future overnight runs should expand)
- Highest priority: rollback / deploy / migration scripts have no focused test coverage — these are production-critical paths
- Estimated next-session work: 3 codex tasks, one per finding, ~30 min each

## Findings

### F1 — rollback.py lacks focused test coverage [P1]
- **Where**: `apps/api/scripts/rollback.py:175`
- **What**: The rollback orchestration logic at this line region is reachable from `scripts/release.sh` and operator workflows but has no co-located `tests/` file exercising the rollback path (no `apps/api/tests/test_rollback*.py` or equivalent).
- **Why it matters**: Rollback is the production safety net. A regression here would only surface during an actual incident, when restoring service is time-critical.
- **Proposed fix**: Add `apps/api/tests/test_rollback.py` covering at minimum (a) target validation, (b) backup branch creation, (c) the "wait for green" loop, (d) failure-mode exits. Keep scope ≤ 1 new test file, mock subprocess/git calls. Single overnight codex task.

### F2 — auto-deploy.sh lacks coverage at orchestration boundary [P1]
- **Where**: `scripts/auto-deploy.sh:102`
- **What**: Shell-level deploy orchestration around line 102 has no `tests/test_auto_deploy*.sh` or equivalent harness. Recent commit `28710d8c` ("harden rollback.sh — explicit target, backup branch, wait") hardened the sibling but not this caller.
- **Why it matters**: Same risk class as F1 — deploy automation behavior change goes unverified until a real deploy attempt.
- **Proposed fix**: Add a small `bash`-level smoke test under `test/` (project already uses Node-based contract tests; pick whichever convention is closest). Mock `gh`, `git push`, `ssh` boundaries.

### F3 — migration_zero_downtime.py lacks direct tests [P2]
- **Where**: `apps/api/scripts/migration_zero_downtime.py:74`
- **What**: Zero-downtime migration helper has no co-located unit test exercising its branching logic.
- **Why it matters**: Lower priority than F1/F2 because migrations are pre-validated by `npm run preflight`, but the helper's branching logic is non-trivial.
- **Proposed fix**: Add `apps/api/tests/test_migration_zero_downtime.py`, focus on the branching decision around line 74 and the rollback-on-failure path.

## Audit notes (not yet promoted to findings)

- jetscope is the most active repo this fortnight (7 commits / 14 days) — periodic audit refresh is appropriate.
- Audit was attempted from yilinmac-mini-2 (paired clone at `/Volumes/Mac扩容/workspace-sync/dev-roots/projects/jetscope`) but blocked by sandbox at write time. Code findings themselves are valid against this local checkout (verified file:line refs exist).

## Next session

If the next overnight burn picks any of F1/F2/F3, the codex packet should:
- Set `allowed_files = ["apps/api/tests/test_<target>.py"]` (and only that path)
- Set `forbidden_paths` to include `apps/`, `scripts/` source code (read-only context)
- Provide the target file's relevant section as inline context to reduce read-budget burn
