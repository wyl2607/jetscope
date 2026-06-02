# OpenAI Codex for OSS Use

JetScope can use Codex safely for public, reviewable maintenance work when the scope stays read-only or otherwise side-effect-free.

## Safe Use Cases

### PR Review

Use Codex for read-only review of public diffs: security posture, missing tests,
documentation drift, unsafe claims, and changed-file scope. Codex should report
findings for a maintainer to accept or reject; it should not approve or merge
changes on its own.

### CI Failure Triage

Use Codex to inspect failing public CI logs, classify the failure, and suggest
the smallest safe repair. For code fixes, the output should be a reviewable
local patch or PR draft, not a hidden remote mutation.

### Release Workflow

Use Codex to draft release notes, changelog entries, validation summaries, and
risk notes from public commits and local checks. It should respect the release
dry-run path and never bypass approval-token release controls.

### Data-Source Maintenance

Use Codex to check public source parser drift, source freshness assumptions,
fallback semantics, and documentation alignment. It must not commit secrets,
access unauthorized systems, or imply paid/private data access.

## Operating Rules

- Do not expose secrets, tokens, credentials, private hostnames, or local operator state.
- Do not push, publish, deploy, SSH, rsync, merge, or mutate remote state without explicit approval.
- Prefer local diagnostics and reviewable docs over hidden automation.
- Keep Codex work grounded in repository files that are safe to publish.

## What Codex Should Not Claim

- Do not claim OpenAI selection, credits, sponsorship, or special program access unless it is explicitly documented in public project materials.
- Do not imply configured automation or remote actions beyond what is publicly documented and locally present in the repository.

## Good OSS Maintenance Tasks

- Summarize proposed release risk from local diffs.
- Flag missing tests or missing documentation for public maintainer trust.
- Compare generated docs or parser outputs against checked-in source of truth.
- Draft release notes from public commits without modifying protected release paths.

## Guardrails

Codex may help with release readiness only when the work stays within the public repository and respects the approval-token flow described in `OPERATIONS.md`.

If a task requires side effects, use the approved release path and the operator-controlled gates instead of inventing a new shortcut.
