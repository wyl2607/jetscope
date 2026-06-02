# Evolver Memory

## Current Contract

- Keep the maintenance pipeline reviewable and low risk.
- Prefer daily read-only audits over autonomous mutation.
- Store raw runtime truth under local runtime directories, not `.evolver/`.
- Treat Obsidian as a local metadata sink unless a privacy review explicitly
  promotes content.
- Keep `.evolver/` small enough to review in a normal pull request.

## Next Candidate Work

- Convert recurring audit findings into bounded issues or local task packets.
- Add tests before expanding `.evolver/` schema fields.
- Keep provider routing, cooldown, and model health state in runtime dashboards,
  not in public metadata.

## 2026-06-01 OSS Readiness Operating Memory

Source: user-provided Codex/Open Source readiness plan, condensed into
public-safe project memory rather than stored as a raw transcript.

Future OSS-readiness work should optimize for honest maintainer signals, not
feature volume:

- Maintainership: show the primary maintainer role, triage, PR review, release,
  CI, and security responsibilities without inventing a team.
- Contributor trust: make setup, issue reporting, PR review, and vulnerability
  reporting clear enough for an outside contributor.
- Ecosystem value: keep JetScope framed around European aviation fuel transition
  intelligence, SAF tipping-point analysis, EU ETS/carbon exposure, source
  provenance, reserve stress, and procurement scenario support.
- Maintenance evidence: prefer reviewable docs, tests, security checks, release
  dry-runs, changelog entries, and maintenance logs over speculative features.
- Codex usage: use automation for read-only PR review, CI failure triage,
  release notes/changelog/risk notes, and public-source parser drift checks.

Preferred near-term work packets:

- OSS trust pack: `CONTRIBUTING.md`, `MAINTAINERS.md`, `SECURITY.md`,
  `ROADMAP.md`, `CHANGELOG.md`, `docs/MAINTENANCE_LOG.md`, GitHub issue
  templates, PR template, and README links.
- Release readiness: side-effect-free release dry-run, release process docs,
  changelog/README updates, and clear explanation that npm publishing is
  intentionally disabled for this application monorepo if `package.json`
  remains private.
- Demo reproducibility: README quickstart links, `docs/QUICKSTART.md`,
  `docs/DEMO.md`, `.env.example`, and Docker/infra docs so reviewers can run
  the project quickly.
- Maintenance evidence: public-safe maintenance log and real issue plan only;
  do not create artificial activity.
- CI/security polish: scripts, workflows, and README surfacing of existing
  gates without claiming services or coverage that are not configured.

Parallel maintenance work rule:

- For substantive OSS-readiness work, split into at most five bounded
  reviewable workstreams, each on its own branch and exact file allowlist.
- Suggested lanes: `codex/oss-trust-pack`, `codex/release-readiness`,
  `codex/quickstart-demo`, `codex/maintenance-evidence`, and
  `codex/ci-security-polish`.
- Every lane must forbid push, deploy, publish, SSH, rsync, delete, reset,
  merge, secrets, runtime files, private notes, logs, caches, local machine
  state, and generated artifacts.
- Every lane should deliver changed files, why the change improves public
  maintainer signal, commands run, known risks, and whether human review is
  required before merge.
- Validation defaults: smallest relevant validation plus
  `scripts/security_check.sh`, `git diff --check`, and task-specific tests or
  docs checks.

Memory-first rule:

- Before future public-maintenance work, read this file, `OPERATIONS.md`, and
  relevant docs before rediscovering the project shape.
- Before creating new code, scripts, docs, or workflows, search for existing
  implementations, scripts, SOPs, and documentation to reuse; only add the
  smallest new increment after confirming there is no suitable reusable path.
- Re-verify any time-sensitive external program requirements before making
  public claims about eligibility, credits, or selection criteria.
