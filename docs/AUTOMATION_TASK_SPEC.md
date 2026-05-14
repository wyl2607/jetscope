# Automation Task Spec

Every autonomous or parallel-development task must be represented by a bounded task spec before implementation begins.

## Required Fields

```json
{
  "task_id": "jetscope-readiness-001",
  "project": "jetscope",
  "goal": "Add a /v1/readiness endpoint without changing /v1/health behavior.",
  "mode": "write",
  "risk": "low",
  "conflict_group": "api-readiness",
  "allowed_paths": [
    "apps/api/app/api/routes/**",
    "apps/api/app/schemas/**",
    "apps/api/tests/**",
    "apps/api/openapi.json"
  ],
  "forbidden_paths": [
    ".env*",
    ".automation/**",
    ".omx/**",
    "scripts/release.sh",
    "private workspace node sync scripts",
    "prisma/dev.db",
    "**/*.log"
  ],
  "verification": [
    "npm run api:check",
    "npm run api:openapi:check",
    "cd apps/api && python -m pytest"
  ],
  "max_attempts": 2,
  "pr_policy": "required",
  "merge_policy": "human-or-controller-after-ci",
  "stop_conditions": [
    "requires remote deploy",
    "touches forbidden path",
    "CI failure is missing-secret or permission",
    "more than two repair attempts"
  ]
}
```

## Risk Levels

- `low`: Additive docs, tests, UI copy, isolated endpoint, or isolated script with deterministic verification.
- `medium`: Runtime behavior changes, dependency updates, data contract changes, generated artifacts, or cross-cutting UI state.
- `high`: Auth, billing, secrets, migrations, release, deploy, sync, remote/VPS, destructive operations, or broad refactors.

Only `low` tasks can be dispatched automatically by default.

## Modes

- `read-only`: Search, review, classify, or propose a plan. No file changes.
- `write`: Implement within `allowed_paths` only.
- `review`: Inspect a branch or PR and return findings.
- `verification`: Run approved local verification commands only.

## File Leases

Parallel agents must receive non-overlapping leases. A lease includes:

```json
{
  "task_id": "jetscope-readiness-001",
  "owner": "worker-id",
  "allowed_paths": ["apps/api/app/api/routes/**", "apps/api/tests/**"],
  "blocked_paths": [".env*", ".automation/**", ".omx/**"],
  "conflict_group": "api-readiness",
  "expires_at": "2026-04-24T23:00:00Z"
}
```

The controller must serialize tasks that touch:

- The same files.
- The same lockfile.
- The same generated artifact set.
- The same migration sequence.
- Shared JSONL ledgers.
- Release, sync, deploy, or infrastructure scripts.

## PR Body Requirements

Automation-created PRs must include:

- Summary.
- Verification commands and results.
- Risk level.
- Rollback plan.
- Whether forbidden operations were avoided.
- Whether generated artifacts were expected.
- Linked task ID.

## Merge Rules

- `main` must only update through a PR.
- `Verify web and API` must pass.
- High-risk tasks require human approval.
- Dependabot and low-risk maintenance may use auto-merge only when explicitly allowlisted.
- Do not force push, amend, or bypass checks unless explicitly approved.

## Scope Check

Use the task spec to verify PR scope before merge:

```bash
npm run automation:plan:check -- docs/automation-task.example.json
npm run automation:scope:check -- docs/automation-task.example.json origin/main
```

The scope check compares `git diff --name-only <base>...HEAD` with each task's `allowed_paths` and `forbidden_paths`. A changed file must match `allowed_paths` and must not match `forbidden_paths`.

## Forbidden By Default

- Reading, printing, or writing secrets.
- Committing `.env*`, credentials, local databases, logs, or build outputs.
- Running VPS, deploy, sync, rollout, pullback, SSH, rsync, install, uninstall, or cleanup commands.
- Editing shared ledgers concurrently.
- Disabling tests or security gates to make CI pass.
- Broad refactors without a task-specific verification plan.
