# Automation Loop Guardrails

JetScope allows parallel AI-assisted development, but automation must stay bounded, reviewable, and local-first. This document defines the safe controller loop for deciding whether more work is needed, planning tasks, opening PRs, diagnosing CI, and stopping when risk or ambiguity appears.

## Default Policy

- Detect and plan automatically.
- Dispatch only low-risk, disjoint, local-only tasks.
- Require pull requests for all changes to `main`.
- Require `Verify web and API` to pass before `main` can update.
- Do not use VPS, deploy, sync, rollout, pullback, SSH, rsync, install, uninstall, or cleanup flows without explicit approval.
- Do not publish, push, merge, auto-merge, or update `main` without explicit approval and the repository gates required by `AGENTS.md`.
- Do not touch secrets, `.env*`, private runtime ledgers, `.automation/`, `.omx/`, local databases, logs, or build artifacts.
- Default to human/controller merge for anything beyond pre-approved low-risk maintenance.

## State Machine

```text
IDLE
  -> PREFLIGHT
  -> PROJECT_SCAN
  -> TASK_PLANNING
  -> TASK_REVIEW_GATE
  -> DISPATCH
  -> IMPLEMENTATION_RUNNING
  -> COLLECT_RESULTS
  -> OPEN_PR
  -> WAIT_FOR_CI
  -> CI_DIAGNOSE
  -> REQUEST_FIX
  -> READY_FOR_MERGE
  -> AWAIT_HUMAN_MERGE or MERGE
  -> POST_MERGE_VERIFY
  -> IDLE or BACKLOG
```

### PREFLIGHT

The controller confirms the run is allowed.

Required checks:

- The target repo is known and clean enough for the requested operation.
- The task is local-only unless explicit remote approval is present.
- The run has max task, retry, PR, and wall-clock limits.
- Existing open PRs and active branches do not overlap the planned work.
- Worker lanes are eligible for the specific project.
- `main` baseline is understood before CI failures are attributed to a PR.

Stop if:

- Work requires remote state changes without approval.
- The worktree has unknown changes in target files.
- Required context, verification commands, or GitHub access are missing.

### PROJECT_SCAN

The controller decides whether the project genuinely needs work.

Valid signals:

- Failing CI or local gates.
- Security advisories or dependency alerts.
- Open issues or explicit user requests.
- Missing operational readiness checks.
- Contract drift, docs drift, stale public copy, or test gaps.
- High-confidence product hardening opportunities with clear verification.

Invalid signals:

- Broad style churn.
- Speculative refactors.
- Dependency upgrades without a reason.
- Cosmetic changes without product, security, or maintenance value.

### TASK_PLANNING

Every generated task must follow `docs/AUTOMATION_TASK_SPEC.md` and include:

- Goal and expected outcome.
- Allowed paths and forbidden paths.
- Risk level.
- Conflict group.
- Verification commands.
- Max attempts.
- PR and merge policy.
- Stop conditions.

### TASK_REVIEW_GATE

The controller rejects tasks that are vague, high-risk, unverifiable, or overlapping.

Automated dispatch is allowed only when:

- Risk is low.
- File scopes are disjoint.
- No forbidden path is touched.
- No release, deploy, sync, VPS, SSH, rsync, auth, billing, secrets, or migration work is required.
- The task can be validated with existing commands.

### DISPATCH

Agents receive a bounded task and a file-scope lease. Agents may not edit outside their lease. Multiple agents must not edit the same file, generated artifact set, migration sequence, lockfile, or shared ledger unless explicitly serialized.

### COLLECT_RESULTS

Before a PR is opened, the controller checks:

- Changed files match the lease.
- No secrets or private artifacts are present.
- Verification ran or failure is classified.
- Diff size is reasonable for the task.
- Generated files are expected.
- No off-scope edits or destructive operations occurred.

### WAIT_FOR_CI And CI_DIAGNOSE

CI failures must be classified before repair.

Supported classifications:

- `typecheck`
- `test`
- `build`
- `dependency-install`
- `security-audit`
- `openapi-drift`
- `flaky-timeout`
- `missing-secret`
- `permission`
- `baseline-failure`
- `merge-conflict`
- `unknown`

Safe automatic fixes are limited to deterministic failures caused by changed files. Missing secrets, permissions, deploy failures, remote access failures, and unknown failures must stop or escalate.

### READY_FOR_MERGE

Before merge:

- Required status checks passed.
- Branch is up to date under the repository ruleset.
- PR scope still matches the task.
- No blocked labels or unresolved review threads exist.
- High-risk files were not changed unless explicitly approved.
- Verification is listed in the PR body.

Default outcome is `AWAIT_HUMAN_MERGE`. Auto-merge is reserved for pre-approved low-risk maintenance categories.

Use `scripts/pr-approval-gate.mjs` to produce a fail-closed merge readiness report. Default mode is read-only and must not merge:

```bash
npm run pr:approval:gate -- --pr <number>
```

Actual merge is approval-gated and requires both `--execute` and a matching one-time `APPROVE_JETSCOPE_PR_MERGE` token:

```bash
APPROVE_JETSCOPE_PR_MERGE=<approval-token> \
  npm run pr:approval:gate -- --pr <number> --execute --approval-token <approval-token>
```

Do not provide the approval token until the controller report says the PR is ready, the human approver has reviewed the PR, and the repository gates required by `AGENTS.md` are satisfied. The gate blocks draft PRs, non-`main` base branches, unapproved reviews, non-mergeable PRs, failed or pending checks, high-risk file changes, and missing local push gates.

## Stop Conditions

Stop immediately when any of these are true:

- A task requires VPS, deploy, sync, rollout, pullback, SSH, rsync, install, uninstall, or cleanup without explicit approval.
- A task requires publish, push, merge, auto-merge, or direct `main` updates without explicit approval and required repository gates.
- A task touches `.env*`, credentials, private personal artifacts, `.automation/`, `.omx/`, runtime ledgers, local databases, logs, or build output.
- Two agents need the same file or conflict group.
- The same task fails more than two repair attempts.
- CI failure cannot be attributed to the PR.
- The controller sees a permission, missing secret, rate limit, or environment failure.
- The agent edits outside its allowed paths.
- The PR changes release, sync, deploy, auth, billing, or migration code without explicit approval.
- The generated task has no clear verification path.

## Current JetScope Backlog

High-value follow-up tasks, in priority order:

1. Run the first bounded safe-local documentation task using `docs/automation-safe-local-task-example.json` as the task contract.
2. Add repository PR/security labels.
3. Add automation scope validation to CI once task specs are attached to automation PRs.

## First Safe-Local Trial

The first autonomous write trial should use `docs/automation-safe-local-task-example.json` as the task contract. It is intentionally limited to documentation paths and local deterministic validation so the controller can verify the loop without release, deploy, sync, SSH, rsync, publish, push, or merge actions.

Before dispatch, the controller must snapshot any pre-existing ignored local artifacts that match forbidden patterns (`.env*`, `.automation/`, `.omx/`, `apps/api/data/`, `*.log`). The task should fail only if new forbidden artifacts appear or existing forbidden artifacts are modified by the task; pre-existing local state is not a cleanup request.

Minimum verification:

```bash
python3 -m json.tool docs/automation-safe-local-task-example.json >/dev/null
test -f docs/AUTOMATION_LOOP.md
(git diff --name-only HEAD; git ls-files --others --exclude-standard) \
  | sort -u \
  | grep -Ev '^(PROJECT_PROGRESS.md|docs/AUTOMATION_LOOP.md|docs/automation-safe-local-task-example.json)$' >/tmp/jetscope-safe-local-scope.err \
  && exit 1 || test $? -eq 1
```

The task must not weaken automation guardrails, stop conditions, or forbidden operation coverage.

## Verification Commands

Use the smallest relevant verification for the touched area. Full repository confidence is:

```bash
npm test
npm run api:check
npm run api:openapi:check
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
npm run audit:security
npm run audit:python
cd apps/api && python -m pytest
```
