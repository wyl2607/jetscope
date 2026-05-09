# Project Records Standard

## Purpose

This standard defines how to use `PROJECT_PROGRESS.md` and `INCIDENT_LOG.md` across the workspace.

Use it to avoid two common failures:

- important operational knowledge living only in chat history
- progress files turning into noisy, low-signal historical dumps

## Required Files

For any meaningful project, create:

- `PROJECT_PROGRESS.md`
- `INCIDENT_LOG.md`

For workspace-global work, also keep:

- `~/PROJECT_PROGRESS.md`
- `~/INCIDENT_LOG.md`

## Local Sedimentation Rule

All AI development zones must leave a local record of meaningful work before the work is promoted to GitHub, public docs, or a generated website.

Use the nearest available local record surface:

- `.local/PROJECT_PLAN.md` for private project planning and current direction
- `.local/DEVLOG.md` for chronological development notes
- `.local/*_PROGRESS.md` for platform, feature, or subsystem-specific progress
- `.local/THREAT_NOTES.md` for private risk, security, LAN, file access, sample-data, or service-startup concerns
- `PROJECT_PROGRESS.md` for compact operator-facing project state
- `INCIDENT_LOG.md` for failures and prevention rules

Promotion rule:

- raw progress, uncertain plans, private paths, Obsidian bridge notes, backups, AI runtime observations, and sensitive architecture notes stay local
- stable and desensitized conclusions may be promoted into `README.md`, `docs/`, `CHANGELOG.md`, or future GitHub Pages sources
- if a platform-specific variant is affected, such as Windows, update that variant's local progress record in the same session
- do not treat local sedimentation as permission to push or publish; normal classification and guard checks still apply

## File Roles

### `PROJECT_PROGRESS.md`

Use this file for:

- one compact checklist near the top for current major tasks
- current phase
- current status
- active shape of the system
- major completed changes
- short verification evidence

Do not use it for:

- full incident narratives
- long chronological logs
- every tiny action taken during a session
- every completed micro-step or sub-bullet from a repair loop

### `INCIDENT_LOG.md`

Use this file for:

- real errors
- repeated regressions
- config/runtime/build/deploy incidents
- root causes
- prevention rules

Each real incident should answer:

1. What broke?
2. Why did it matter?
3. What was the real root cause?
4. What files or systems were involved?
5. What fixed it?
6. What rule should stop it happening again?

## When To Update

Update `PROJECT_PROGRESS.md` when:

- a phase changes
- the current system state materially changes
- a major task closes
- the day closes or a major work session closes

If new runtime rules are added, also record:

- what invariant changed
- what future implementations must now do differently
- whether the change is docs-only or already enforced in code

Update `INCIDENT_LOG.md` when:

- a real failure occurs
- the same low-level mistake recurs
- an agent or automation loop causes damage or drift
- runtime truth and docs diverge in a way that can mislead future work

## Daily Summary Rule

- Daily summaries should be written automatically into the relevant `PROJECT_PROGRESS.md` files without asking the user again.
- At daily closeout, summarize the day's meaningful work even if it came from multiple AI lanes or chat sessions.
- If the work affects multiple projects or shared control-plane/tooling behavior, also write a workspace-level summary to `~/PROJECT_PROGRESS.md`.
- If the work is project-specific, write the summary into that project's local `PROJECT_PROGRESS.md`.
- Do not leave the day's important truth only in chat history.

## Multi-Agent Consolidation Rule

- If the same day's work is split across Copilot, Claude Code, Hermes, Codex, or other AI agents, write **one consolidated dated summary** in the relevant `PROJECT_PROGRESS.md`.
- The summary should merge:
  - the actual outcome
  - the important touched surfaces
  - the verification evidence
  - the next-step consequence
- Do not keep disconnected per-agent mini-logs when one merged operator-facing summary is enough.
- If the same day's AI work spans multiple projects, keep project-local summaries in each repo and add one short roll-up to `~/PROJECT_PROGRESS.md`.
- Daily closeout should explicitly cover every AI lane that materially contributed that day, even if one lane only changed config/runtime/tooling.
- The durable truth is the merged project/workspace record, not whichever assistant chat happened to perform the last step.

## Compact Progress Rule

`PROJECT_PROGRESS.md` is a compressed operator surface, not a full diary.

Use this default shape:

1. **Top checklist**
   - Keep one short “current task / completion board” near the beginning of the file.
   - Track only meaningful items such as:
     - active tasks
     - recently completed major tasks
     - blocked tasks
     - waiting-for-push / waiting-for-remote-readback tasks
2. **Short dated entries**
   - Record only the durable outcome, the key verification proof, and the next-step consequence.
   - Do not dump every small completed sub-item into the dated entry.
3. **Detailed execution belongs elsewhere**
   - If the detail matters later, move it to:
     - `docs/automation-log.md`
     - review artifacts
     - runtime logs
     - plan/backlog docs
     - project-specific reports

When updating a progress file:

- prefer a short checklist delta over a long prose block
- compress older “completed” micro-items into one summary line when they stop being operationally useful
- keep only the minimum evidence needed to prove the current truth

If a `PROJECT_PROGRESS.md` file becomes noisy:

- keep the top checklist
- keep the latest state-changing entries
- collapse or archive older low-value detail instead of continuing to append verbosely

## Size Guardrail Rule (Anti-Duplication)

Treat record files as compact operator surfaces with hard size limits.

Default caps:

- `PROJECT_PROGRESS.md`
  - target: `<= 120` lines
  - hard cap: `<= 200` lines
- `INCIDENT_LOG.md`
  - target: `<= 120` lines
  - hard cap: `<= 220` lines

When target is exceeded:

- stop appending long narrative blocks
- archive older detail to `docs/*-archive-YYYY-MM-DD.md` (or workspace guide archive path)
- keep only:
  - current task board
  - unfinished/blocking items
  - latest high-value verified truth

When hard cap is exceeded:

- archive and compact in the same session before further updates
- do not claim record maintenance complete until line count is back under cap

## Active-Development Exception + Completion Trigger

- During active development, files may temporarily exceed the **target** line count.
- Hard caps still apply at all times.
- When a project is marked as a phase close / milestone complete / release-ready, run a mandatory same-session compact pass:
  1. archive detailed history
  2. compress to current-state operator view
  3. verify with strict check

Mandatory verification command on completion:

```bash
bash /Users/yumei/tools/automation/scripts/check-records-compact.sh --strict-target <project-dir>
```

If the strict check fails, completion cannot be declared yet.

## Canonical-Only Rule

- One truth item should have one canonical home.
- If the same state is needed in multiple files, keep full detail in one file and link from others.
- Never duplicate unchanged status paragraphs across workspace and project ledgers.
- If state did not change, do not write a new dated block.

## Status Marker Rule

When writing daily summaries, use these status markers exactly:

- `完成`
- `未完成`
- `新出现`
- `待推送`

Meaning:

- `完成`: work that is verified done in the current environment
- `未完成`: active work that still needs follow-up before it can be treated as closed
- `新出现`: newly discovered work, risks, or rules that changed today's plan
- `待推送`: work already prepared locally but still waiting for sync/promotion/deployment to other machines or environments

## Automation Rule

If a project has worker/queue/VPS/runner entry scripts, make those prompts read:

- `AGENTS.md`
- `PROJECT_PROGRESS.md`
- `INCIDENT_LOG.md`
- the project's relevant ops/review docs

## Doc Split Rule

- `PROJECT_PROGRESS.md` is a current-state view.
- `INCIDENT_LOG.md` is a failure-prevention ledger.
- long execution history belongs in longer docs such as `docs/automation-log.md`, `docs/runtime-notes.md`, or project-specific reports.

For background-task systems specifically:

- keep full command output in runtime logs / artifacts
- keep `PROJECT_PROGRESS.md` to the rule change, outcome summary, and verification proof
- use `INCIDENT_LOG.md` only when async completion, notification drain, status truth, or artifact linkage failed in a way that could mislead future runs
- if repeated loop attempts generate many small completions, summarize them as one task-level result instead of listing every micro-fix

## Template Source

Base templates live in:

- `tools/automation/templates/project-records/`

Optional compaction checker:

- `tools/automation/scripts/check-records-compact.sh`
- strict mode (target overflow also non-zero): `tools/automation/scripts/check-records-compact.sh --strict-target <project-dir>`
