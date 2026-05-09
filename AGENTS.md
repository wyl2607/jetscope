# AGENTS.md - Workspace AI Entry

This repository has a dual role during the workspace transition. Treat this
file as the public, repository-local AI entrypoint.

## Canonical Flow

- Read this file before editing.
- `CLAUDE.md` imports and extends this file for Claude-specific behavior.
- Product work for JetScope belongs in `/Users/yumei/projects/jetscope`.
- Workspace governance work belongs in `/Users/yumei/tools/automation` during
  the transition and must stay local-first unless explicitly promoted.

## Repository Boundary

`/Users/yumei` is not a normal single-purpose product repo:

| Area | Paths | Default action |
| --- | --- | --- |
| JetScope product mirror | `apps/`, `infra/`, `packages/`, `test/`, product docs/scripts | Read-only here; develop in `/Users/yumei/projects/jetscope` |
| Workspace governance | `tools/automation/`, guard scripts, AI maintenance docs | Local-first; classify before any publish |
| Runtime/private state | `runtime/`, `.claude/`, `.codex/`, `.omx/`, vaults, logs, caches | Never publish |

See `NOTICE.md` when deciding whether a file belongs to product, governance,
runtime, private, or public-candidate zones.

## Safety Rules

- No push, PR, merge, release, deploy, sync, SSH, rsync, launchd mutation, or
  destructive Git operation without explicit approval.
- Do not read, print, stage, or store secrets.
- Keep runtime/cache/log/tool-state/temp/archive/nested-repo artifacts out of
  commits.
- Split commits by purpose and risk surface.
- If the worktree is dirty, classify changes before staging.
- Unknown, private, generated, runtime, or deploy-adjacent files block publish.

## Required Gates

Before local commits, run the smallest relevant validation plus:

```bash
scripts/security_check.sh
```

Before any push or PR preparation, also run:

```bash
scripts/review_push_guard.sh origin/main
```

Do not bypass hooks or guards.

## Maintenance Pipeline

The repo-evolver direction is intentionally conservative:

- Daily automation should produce low-risk, reviewable maintenance candidates.
- Codex GitHub Action runs must be read-only unless explicitly approved.
- Static gates should report Semgrep, Vale, and markdownlint issues without
  mutating files.
- `.evolver/` stores small public-safe metadata and policy contracts only.
- Runtime memory, raw reports, local queues, vault-derived notes, and secrets
  remain outside `.evolver/` and outside public commits.

## Cross-AI Traceability

For non-trivial implementation or debugging, search local trace ledgers first:

```bash
bash /Users/yumei/tools/automation/scripts/ai-trace.sh find "<keyword>"
```

Stable reusable findings should be written back with the same script.

## Codex Goal Packet

Use this shape for bounded delegated work:

```text
/goal 完成 <task>

目标：
<one sentence>

上下文：
<repo, current state, relevant files>

允许修改：
<exact allowlist>

禁止修改：
<private/runtime/generated/deploy paths and all unrelated files>

执行方式：
CLI-first. No push/PR/deploy/sync/SSH/rsync/delete/reset.

验证：
<focused commands>

完成标准：
<checkable done criteria>

交付：
changed files, validation, remaining risk.
```
