# AGENTS.md - JetScope AI Entry

Treat this file as the public, repository-local AI entrypoint for JetScope
product work.

## Start here for frontend work

| Question | File |
| --- | --- |
| What are the rules? | `docs/UI_CONTRACT.md` — the single source of frontend style, structure and data honesty |
| Where does the work stand, and what is next? | `docs/PROJECT_STATE.md` |
| How is bounded work delegated, and what has gone wrong before? | `docs/task-packets/` |
| How does the frontend reach production? | `docs/DEPLOY_WEB_VPS.md` |

Two rules from the contract that govern every frontend change:

- The contract is read-only inside a feature PR. Changing it is its own PR.
- Consistency is held by gates, not by intent. `npm run web:gate` runs two
  ratchets — `design-system-lint` and `figure-contract-lint`. Both only turn one
  way. Do not raise a baseline.

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

## Portfolio maintenance mode (2026-07-30)

After the portfolio optim campaign: **product development is the default**;
maintenance runs on a clock. Do not reopen whole-portfolio scan/reshape work
unless the user asks.

| Mode | When | What |
|------|------|------|
| **Develop** | Default | Ship features for this repo only; touch only task-needed files |
| **Code quality** | Blocks delivery, or explicit debt slice | Bounded refactor — no full-repo reshape campaigns |
| **Data sources** | Schedule / failing gate / product need | Use existing freshness gates and pipelines; no ad-hoc full re-audit |
| **Review** | Weekly digest + before merge | Read `wyl2607/automation` issue *Portfolio digest*; do not manually re-scan all repos |

Cross-repo weekly scan: `wyl2607/automation` workflow **Portfolio scan** (secret `PORTFOLIO_SCAN_TOKEN`).
Deferred majors (product-driven only): Tailwind 4, eslint 10, fastapi+pydantic co-upgrade, ruff 0.16 modernization.
Shared rules: Obsidian `Codex记忆/决策/portfolio-post-optim-operating-mode-2026-07-30.md`.
