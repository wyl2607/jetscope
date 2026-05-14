# AGENTS.md - JetScope AI Entry

Treat this file as the public, repository-local AI entrypoint for JetScope
product work.

## Canonical Flow

- Read this file before editing.
- `CLAUDE.md`, when present locally, may extend this file for Claude-specific
  behavior.
- Product work belongs in this repository checkout.
- Workspace governance, private automation ledgers, local AI tool state, and
  operator-specific maintenance scripts belong outside this public product
  repository.

## Repository Boundary

This repository should stay a normal single-purpose product repo:

| Area | Paths | Default action |
| --- | --- | --- |
| JetScope product | `apps/`, `infra/`, `packages/`, `test/`, product docs/scripts | Normal product work |
| Workspace governance | external automation repos and local operator notes | Do not add here |
| Runtime/private state | `runtime/`, `.claude/`, `.codex/`, `.omx/`, vaults, logs, caches | Never publish |

If a file describes local machines, personal paths, private operators, or
workspace-wide governance, keep it out of this repository.

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
