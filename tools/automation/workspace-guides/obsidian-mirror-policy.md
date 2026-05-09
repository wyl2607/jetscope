# Obsidian Mirror Policy

Last updated: 2026-05-08
Scope: `/Users/yumei/tools/automation`

## Purpose

This policy defines how `tools/automation` may propose, review, and maintain Obsidian mirrors.

This is not a new sync platform. It reuses the existing repo-evolver evidence already in this package:

- `workspace-guides/automation-source-runtime-classification.md`
- `workspace-guides/evolution-registry.json`
- `scripts/mirror-drift-scan.py`
- `runtime/self-evolution/mirror-drift-scan.{json,md}`
- `PROJECT_PROGRESS.md`

Git-tracked project files remain the canonical truth. Obsidian may mirror or derive knowledge from those files, but Obsidian must not become a second independent source of truth for this package unless a human explicitly promotes a note back into the project.

## Current Registered Mirrors

| Pair | Status | Relationship | Direction | Rule |
|---|---|---|---|---|
| `workspace-project-index-derived` | `active` | `derived-index` | `project-to-obsidian-derived` | One-way index; do not merge derived output back. |
| `tools-automation-progress-obsidian-mirror` | `active` | `mirror` | `project-to-obsidian` | 1:1 mirror; drift is review-first until intentionally synchronized from source. |

Current registered mirror targets:

```text
/Users/yumei/Obsidian/MyKnowledgeVault/30-AI-Ingest/tools-automation-progress.md
```

For any new proposed mirror, scanners may report required approval but must not create, overwrite, or sync an Obsidian file before approval.

## Canonical Truth

- Project source files are canonical for `tools/automation` operating state.
- `PROJECT_PROGRESS.md` is the local canonical progress record.
- `workspace-guides/*.md` are source/handoff documents and may be mirror candidates after review.
- `runtime/**` contains local generated evidence and machine state; it is not canonical public knowledge.
- Obsidian mirror notes are reading and retrieval surfaces, not autonomous write-back surfaces.

## Eligibility Matrix

| Surface | Default mirror eligibility | Reason |
|---|---|---|
| `PROJECT_PROGRESS.md` | Eligible only after explicit approval | High-value progress mirror, but may contain local state and needs privacy review. |
| Selected `workspace-guides/*.md` | Eligible after review | Source/handoff docs can be useful in Obsidian when classified and current. |
| `plan.md` and selected planning docs | Eligible after review | Architecture plans can be mirrored if they do not expose private runtime details. |
| Derived project index notes | Eligible as one-way derived output | Useful for navigation, but must not be reverse-merged automatically. |
| `runtime/**` | Never mirror by default | Generated local evidence, logs, queues, caches, and machine state. |
| `runtime/ai-trace/**` | Never mirror by default | Local trace ledger, potentially dense operational context. |
| Dashboard generated data such as `data.json`, `skills.json`, `latest.*`, `watch-log.jsonl`, `dedupe/**`, `qa/**` | Never mirror by default | Generated runtime output, not canonical source. |
| Dashboard static UI source exceptions | Not mirror targets by default | `source-exception` means maintainable source in place, not Obsidian eligibility. |
| Backups, temp files, logs, cache files | Never mirror | Local-only artifacts. |
| Secrets, tokens, credentials, private host details | Never mirror | Sensitive material. |
| VPS, Windows, deploy, sync, or launchd handoff docs | Approval-required | Operationally risky; mirror only after privacy and command-risk review. |

## Approval Gate

Proposed mirror creation is approval-required.

Before approval, allowed work is read-only:

- inspect `workspace-guides/evolution-registry.json`
- run `python3 /Users/yumei/tools/automation/scripts/mirror-drift-scan.py`
- review `runtime/self-evolution/mirror-drift-scan.{json,md}`
- prepare an approval packet

Before approval, forbidden work is:

- create, overwrite, or sync an Obsidian mirror target
- reverse-merge Obsidian content into the project
- run broad sync, deploy, SSH, rsync, launchd mutation, push, PR, or destructive Git action as part of mirror creation
- read or copy secrets

After approval, the allowed first action is narrow:

1. Create the approved mirror target from the project source.
2. Keep the project file as canonical truth.
3. Re-run `python3 /Users/yumei/tools/automation/scripts/mirror-drift-scan.py`.
4. Re-run `scripts/automationctl manifest --check`.
5. Record the result in `PROJECT_PROGRESS.md` and AI trace.

## Conflict Policy

For one-to-one mirrors:

- project wins by default
- Obsidian edits are review input only
- no automatic reverse merge
- a human may promote an Obsidian edit into the project source through a normal reviewed patch

For derived indexes:

- derived output is one-way
- hash differences are expected
- the policy must remain `do-not-merge-derived-output-back`

## Scanner Expectations

`scripts/mirror-drift-scan.py` should remain read-only.

Expected behavior:

- active missing mirrors are blocking approval-required findings
- proposed missing mirrors are non-blocking but must include an approval packet
- active one-to-one hash drift is review-first
- derived indexes must be one-way and must not be merged back
- reports must state that no Obsidian sync or file rewrite happened

## Acceptance Criteria

This policy is satisfied when:

- every mirror pair is registered in `workspace-guides/evolution-registry.json`
- proposed mirrors have approval packets before any write
- runtime and generated evidence stay out of Obsidian mirrors by default
- project files remain canonical truth
- derived indexes are one-way
- Phase 3 mirror governance can be audited without creating a second source of truth

This policy does not approve any mirror creation by itself.
