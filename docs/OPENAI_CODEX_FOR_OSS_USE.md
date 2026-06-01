# OpenAI Codex for OSS Use

JetScope can use Codex safely for public, reviewable maintenance work when the scope stays read-only or otherwise side-effect-free.

## Safe Use Cases

- Read-only PR review and code review.
- CI failure triage and log interpretation.
- Release notes, changelog drafts, and risk notes.
- Public-source parser drift checks and documentation alignment.

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
