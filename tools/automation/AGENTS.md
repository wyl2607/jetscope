# AGENTS.md — tools/automation

Scope: `/Users/yumei/tools/automation`

This directory is the local workspace automation package for `/Users/yumei`. It controls or documents cross-AI traceability, parallel development, Windows handoff, local worker routing, and VPS boundaries.

## Read First

Before non-trivial work in this directory, read:

1. `/Users/yumei/AGENTS.md`
2. `/Users/yumei/tools/automation/workspace-guides/ai-entry-map.json`
3. `/Users/yumei/tools/automation/PROJECT_PROGRESS.md`
4. `/Users/yumei/tools/automation/plan.md`
5. `/Users/yumei/tools/automation/README.md`
6. `/Users/yumei/tools/automation/workspace-guides/automation-source-runtime-classification.md`
7. `/Users/yumei/tools/automation/workspace-guides/automation-project-split-decision.md`
8. `/Users/yumei/tools/automation/workspace-guides/parallel-dev-vps-handbook.md`
9. `/Users/yumei/tools/automation/workspace-guides/windows-opencode-handoff.md`

Use `/Users/yumei/tools/automation/workspace-guides/ai-entry-map.md` for the
human-readable progressive-discovery rules. Keep this file short; add deeper
subsystem guidance to the entry map and linked guides instead.

Then search trace ledgers for related prior work:

```bash
bash /Users/yumei/tools/automation/scripts/ai-trace.sh find "<keyword>"
```

## Current Boundary

`tools/automation` is not yet an independent reusable project. Treat it as a local workspace automation package tightly coupled to `/Users/yumei`, Windows path mappings, launchd, `.omx`, and runtime ledgers.

Do not split it into a new repo/package unless the split criteria in `workspace-guides/automation-project-split-decision.md` are satisfied and the user explicitly approves.

## Safety Rules

- No commit or push unless explicitly requested.
- No destructive Git operations.
- No remote sync, rollout, pullback, install, uninstall, or VPS cleanup without explicit approval.
- Do not read, print, or store secrets.
- Do not write secrets into guides, ledgers, reports, or handoff files.
- Treat `runtime/`, generated reports, local backups, and machine state as local-only unless explicitly classified otherwise.
- Treat VPS scripts and sync scripts as high risk even when they support `--dry-run`.

## Editing Rules

- Prefer the smallest correct change.
- Keep source/runtime boundaries explicit when adding files.
- If a change affects `daily-runner.sh`, `parallel-codex-builder.sh`, `vps-roundtrip.sh`, sync scripts, release scripts, or launchd, document the risk and run the smallest safe local verification.
- If a change affects handoff guides, update Windows copy only after explicit approval or direct user request.

## Self-Healing Flywheel

- Default delivery loop for every non-trivial task is: detect issue -> make the smallest bounded fix -> run the relevant smoke/validation -> inspect evidence -> repeat until green or blocked.
- Do not declare completion after a single fix if the smoke exposes a new failure; write the new failure to trace and keep repairing within the approved safety boundary.
- Telegram/OpenCode control-plane changes should use `scripts/smoke-telegram-opencode-flywheel.sh` when UI smoke is appropriate, plus the normal offline validators.
- Flywheel repairs must not bypass existing gates: no push, PR, merge, deploy, remote mutation, secret access, or broad sync unless explicitly approved.
- When a stable fix pattern is found, write it to `solution-ledger.jsonl`, not only to chat.

## Verification

For shell script changes, prefer:

```bash
bash -n /Users/yumei/tools/automation/auto-refactor-loop/daily-runner.sh \
  /Users/yumei/tools/automation/parallel-codex-builder.sh \
  /Users/yumei/tools/automation/vps-roundtrip.sh \
  /Users/yumei/tools/automation/parallel-dispatch.sh \
  /Users/yumei/tools/automation/parallel-sync.sh
```

For auto-refactor Python changes, prefer:

```bash
python3 -m py_compile \
  /Users/yumei/tools/automation/auto-refactor-loop/project-scanner.py \
  /Users/yumei/tools/automation/auto-refactor-loop/task-router.py \
  /Users/yumei/tools/automation/auto-refactor-loop/knowledge-fetcher.py \
  /Users/yumei/tools/automation/auto-refactor-loop/self-updater.py
```

For old launchd/system Python compatibility, also check:

```bash
grep -R "| None\|dict | list\|list\\[\|dict\\[\|tuple\\[" /Users/yumei/tools/automation/auto-refactor-loop
```

## Trace Write-Back

Write a session trace after meaningful changes:

```bash
bash /Users/yumei/tools/automation/scripts/ai-trace.sh session "tools/automation" "<summary>" "<next_step>" "<linked_issue>"
```

If a reusable fix is verified, also write a solution trace.
