# Automation Source And Runtime Classification

Last updated: 2026-04-24
Scope: `/Users/yumei/tools/automation`

## Purpose

This document defines which parts of `tools/automation` are source, local runtime, generated evidence, handoff material, or high-risk remote-control tooling.

Use it before syncing, publishing, committing, or handing this package to another AI or machine.

## Classification Summary

| Path | Classification | Default action |
| --- | --- | --- |
| `AGENTS.md` | Source policy | Keep, sync only when handoff needs it |
| `README.md` | Source documentation | Keep, safe to review/share after secret scan |
| `PROJECT_PROGRESS.md` | Source/status documentation | Keep local canonical, sync only when needed |
| `workspace-guides/*.md` | Source/handoff documentation | Keep, selected files may sync to Windows |
| `workspace-guides/*.json` | Machine-readable registry/config metadata | Keep, review for secrets before sharing |
| `scripts/*.sh` | Source tooling | Keep, verify before execution |
| `scripts/*.py` | Source tooling | Keep, verify before execution |
| `auto-refactor-loop/*` | Source pipeline | Keep, local verification required after edits |
| `templates/*` | Source templates | Keep, generally safe after secret scan |
| `config/*.template` | Source templates | Keep, safe only if placeholders are non-secret |
| `runtime/*` | Local runtime/generated state | Local-only by default |
| `runtime/skill-chains/dashboard/{index.html,app.js,styles.css,i18n.json,i18n.js,modules/*.js,modules/*.css}` | Source exception: maintained static dashboard UI assets | Keep local; validate like source; generated dashboard data remains runtime |
| `runtime/ai-trace/*.jsonl` | Local trace ledger | Local canonical; do not let multiple workers append concurrently |
| `runtime/auto-refactor/*` | Local execution state/logs | Local-only by default |
| `reports/*` | Generated reports | Local-only until classified |
| `*.log`, `*.tmp`, backups | Generated/local artifacts | Do not publish by default |

## Source Files

Source files are the only default candidates for long-term maintenance or future project extraction.

Examples:

- `AGENTS.md`
- `README.md`
- `PROJECT_PROGRESS.md`
- `workspace-guides/parallel-dev-vps-handbook.md`
- `workspace-guides/windows-opencode-handoff.md`
- `workspace-guides/ai-collaboration-traceability-standard.md`
- `scripts/ai-trace.sh`
- `scripts/refresh_ai_systems_registry.py`
- `auto-refactor-loop/daily-runner.sh`
- `auto-refactor-loop/task-router.py`
- `parallel-codex-builder.sh`
- `templates/`

## Local Runtime Files

Runtime files record current machine state and should not be treated as portable source.

Decision: keep the skill-chain dashboard static UI as a bounded `source-exception` for now instead of moving files. The maintained UI assets live beside generated dashboard data for local serving simplicity and because existing fixtures and static UI tests read them in place.

Source-exception assets:

- `runtime/skill-chains/dashboard/index.html`
- `runtime/skill-chains/dashboard/app.js`
- `runtime/skill-chains/dashboard/styles.css`
- `runtime/skill-chains/dashboard/i18n.json`
- `runtime/skill-chains/dashboard/i18n.js`
- `runtime/skill-chains/dashboard/modules/*.js`
- `runtime/skill-chains/dashboard/modules/*.css`

Generated/local-only assets in the same directory:

- `runtime/skill-chains/dashboard/data.json`
- `runtime/skill-chains/dashboard/data.js`
- `runtime/skill-chains/dashboard/skills.json`
- `runtime/skill-chains/dashboard/skills.js`
- `runtime/skill-chains/dashboard/latest.{json,md,html}`
- `runtime/skill-chains/dashboard/watch-log.jsonl`
- `runtime/skill-chains/dashboard/dedupe/**`
- `runtime/skill-chains/dashboard/qa/**`

Generation and maintenance relationship:

- `scripts/skill-chain-dashboard.py` generates dashboard data into `runtime/skill-chains/dashboard/`.
- `scripts/skill-library.py` generates skill-library data consumed by the dashboard.
- `tests/test_skill_chain_dashboard_static_ui.py` and `workspace-guides/skill-chains/fixtures/dashboard/run-dashboard.sh` intentionally validate the maintained static UI assets in place.
- `scripts/source-runtime-manifest.py` must classify the maintained UI assets as `source-exception` and keep generated dashboard data under `local-only-runtime`.

Future migration trigger: move the maintained static UI to a source/template directory only when the dashboard becomes a reusable package, needs publication, or the runtime directory stops being the local serving root. Until then, do not move these files as incidental cleanup.

Examples:

- `runtime/auto-refactor/.build-state.json`
- `runtime/auto-refactor/dispatch-events.jsonl`
- `runtime/auto-refactor/build-logs/`
- `runtime/auto-refactor/build-report.md`
- `runtime/ai-trace/*.jsonl`
- generated audit reports under `runtime/` or `reports/`

Default rule: local-only unless a task explicitly classifies a specific file as shareable evidence.

## Handoff Files

Handoff files can be copied to Windows workers after review:

- `workspace-guides/parallel-dev-vps-handbook.md`
- `workspace-guides/windows-opencode-handoff.md`
- selected registry and policy files listed in the handoff document

Current Windows target:

```text
windows-pc:C:/Users/wyl26/yumei/tools/automation/workspace-guides/
```

Do not use `windows-pc:~/` as the durable target.

## High-Risk Tooling

These files can change remote/shared state and require explicit approval before execution beyond read-only checks:

- `vps-roundtrip.sh`
- `parallel-sync.sh`
- `parallel-dispatch.sh`
- `scripts/vps-post-change-sop.sh`
- scripts that call `ssh`, `rsync`, `launchctl start`, deploy, rollout, pullback, cleanup, install, or uninstall paths

Safe checks usually include `bash -n`, documentation review, and dry-run review. Dry-run is still not the same as approval to run remote actions.

## Publication Rules

- Do not publish `runtime/`, generated reports, logs, backups, or local machine state by default.
- Do not publish any file that contains secrets, credentials, tokens, private host details beyond already-approved aliases, or personal artifacts.
- Do not publish Windows or VPS operational details unless the destination is trusted and the user approved the handoff.
- Before any future commit/push decision, classify changed files as source, handoff, runtime, generated, sensitive, or local-only.

## Validation Checklist

Before treating automation changes as ready:

1. Read `AGENTS.md` and this classification file.
2. Confirm changed files are source or explicitly classified handoff files.
3. Run the smallest safe verification for touched scripts.
4. Update `PROJECT_PROGRESS.md` if operating state changed.
5. Write an AI trace session entry.
