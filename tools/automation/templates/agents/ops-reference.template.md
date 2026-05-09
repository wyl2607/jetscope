# Ops Reference

## Purpose

This document holds runtime, queue, VPS, automation, and operational reference for `{{PROJECT_NAME}}`.

Shared long-running/VPS execution standard:

- `.automation/shared/cloud-task-standard.md` (fallback: `/Users/yumei/tools/automation/workspace-guides/cloud-task-standard.md`)

Shared review/audit standard for runtime-sensitive work:

- `.automation/shared/review-auditor-standard.md` (fallback: `/Users/yumei/tools/automation/workspace-guides/review-auditor-standard.md`)

## Project Records

- Current phase: `PROJECT_PROGRESS.md`
- Incident ledger: `INCIDENT_LOG.md`

Rules:

- Real runtime/build/deploy/script incidents must be appended to `INCIDENT_LOG.md`.
- Do not treat ad hoc notes or chat history as the only incident ledger.

## Entry Points

```bash
{{FIRST_COMMANDS}}
{{ROUNDTRIP_CMD}}
```

## Runtime Rules

- Define the default SOP and repair commands here.
- Define remote host and remote working directory here.
- If the project has both a live app and a worker, define separate live/worker directories here.
- Define when pushing is allowed and when it must wait.
- Keep runtime artifacts out of normal feature docs.
- Define which machine-readable state files are the source of truth here.
- Define stale-lock/stale-state recovery, reviewer requirements, and incident-prone risk boundaries here.
- Keep explanation and history here, not in `AGENTS.md`.

## Remote Targets

- Remote host: `{{REMOTE_HOST}}`
- Remote dir: `{{REMOTE_DIR}}`

## Automation Scripts

- List the project's actual queue, worker, report, and deployment scripts here.

## Operational Backlog

- Put infra-only or runtime-only backlog here.
- Keep product feature backlog out of this file unless it is directly operational.

## AI Guidance Sync And OMX Rollout

When project guidance changes:

1. sync the project layer with the established project promotion flow
2. sync workspace-entry files with `bash <template-local-path:workspace-ai-rollout.sh> sync-entrypoints`
3. refresh Codex/OMX on the target nodes with `bash <template-local-path:workspace-ai-rollout.sh> install-omx`
4. verify versions and remote readback
