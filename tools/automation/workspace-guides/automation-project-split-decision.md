# Automation Project Split Decision

Last updated: 2026-04-24
Scope: `/Users/yumei/tools/automation`

## Superseded Note

This document is the original baseline decision for keeping `tools/automation` local while source/runtime boundaries were still unstable.

It is superseded by `docs/decisions/phase5-split-decision.md` for Phase 5: the split direction is now accepted, local review-ready closure may pass, and actual split execution remains deferred behind human approval, restore rehearsal, and explicit Git/remote decisions.

## Current Decision

Historical baseline: do not split `tools/automation` into an independent project yet.

Current Phase 5 status: accepted ADR, deferred execution. Keep `/Users/yumei/tools/automation` as the operational working copy until the approved split execution plan is performed separately.

## Why Not Split Now

- The package still depends on `/Users/yumei` absolute paths.
- Windows handoff paths are workspace-specific: `C:/Users/wyl26/yumei/...`.
- Launchd behavior, `.omx` cluster state, Mac controller assumptions, and trace ledgers are local runtime concerns.
- VPS scripts are high-risk and project/workspace-specific.
- Runtime state and source files still live under the same package tree.
- A separate repo now would increase sync, publication, and sensitivity-classification overhead before the interface is stable.

## Split Criteria

Reconsider an independent repo/package only after these are true:

- Source files and local runtime files are clearly separated and documented.
- Runtime directories are excluded from publication by default.
- Machine-specific paths are either configurable or isolated in local config files.
- Windows handoff files are generated or copied from a documented source list.
- High-risk remote scripts have explicit dry-run/help behavior and documented approval gates.
- Tests or validation scripts exist for the core local-only functions.
- Trace ledger write-back rules are stable and do not require chat context.
- The user explicitly wants a repo/package boundary and approves the publication/sync model.

## Candidate Future Package Shape

If split later, the portable subset should likely include:

- `README.md`
- `AGENTS.md`
- selected `workspace-guides/*.md`
- selected `scripts/*.sh` and `scripts/*.py`
- `auto-refactor-loop/` after path assumptions are parameterized
- `templates/`
- tests or validation scripts

The non-portable subset should remain local-only:

- `runtime/`
- generated `reports/`
- local launchd state
- machine-specific cluster snapshots
- private host/user mappings that are not meant for broader sharing
- any secrets or credentials-adjacent files

## Migration Plan When Ready

1. Freeze a source file manifest.
2. Freeze a local-only/runtime ignore manifest.
3. Parameterize hard-coded workspace paths where practical.
4. Add validation commands for docs, shell scripts, and Python scripts.
5. Create a private repo first, not public.
6. Run security and local-only classification checks before any push.
7. Keep `/Users/yumei/tools/automation` as the operational working copy until the new repo proves stable.

## Current Next Step

Operate inside `/Users/yumei/tools/automation` and improve classification, validation, and handoff reliability before any split.
