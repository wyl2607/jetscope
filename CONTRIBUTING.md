# Contributing to JetScope

JetScope welcomes small, reviewable contributions that improve data quality, provenance, release maturity, and contributor clarity.

## What This Repository Is For

JetScope is a market intelligence product for European aviation fuel transition analysis. Contributions should stay within the implemented product surface: market snapshots, SAF tipping-point analysis, reserve stress, source coverage, AI research signals, and supporting documentation.

Do not add claims about production usage, paid data coverage, security certification, or external adoption unless they are already verifiable in the repository.

## Local Setup

Prerequisites:

- Node.js 22+
- npm 10+
- Python 3.13+
- SQLite for local development
- Docker only if you need infrastructure workflows

Setup:

```bash
npm install
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

Windows PowerShell activation:

```powershell
apps\api\.venv\Scripts\Activate.ps1
```

## Run Commands

Use the smallest command that exercises the surface you changed:

```bash
npm run dev
npm run web:dev
npm run api:dev
npm run web:lint
npm run web:typecheck
npm run web:build
npm run web:gate
npm run api:check
npm run api:test
npm run api:openapi:check
npm test
npm run preflight
npm run audit:security
npm run audit:python
```

If you changed API behavior, run `npm run api:check`, `npm run api:test`, and `npm run api:openapi:check` at minimum. If you changed web behavior, run the web lint/typecheck/build path. For docs-only edits, run `git diff --check` and the security gate.

## Preflight Expectations

Before asking for review, verify the relevant local gate passes and keep the scope narrow:

- confirm the change only touches the intended files
- keep generated artifacts out of commits
- include test or validation evidence in the PR body
- call out residual risk when data or external services are involved

The repo-level default gate is:

```bash
scripts/security_check.sh
```

## Branch And PR Expectations

- Work on a short-lived branch tied to one purpose.
- Keep commits small and easy to review.
- Do not mix unrelated cleanup, feature work, and docs changes unless they are required for the same trust-pack slice.
- Avoid force-pushes unless a maintainer asks for one.

PRs should include:

- what changed
- why it changed
- what validation was run
- whether the change is docs-only, behavior-changing, or security-sensitive
- any follow-up work that remains

## Public-Safe Issue And PR Workflow

When opening issues or pull requests, keep the report public-safe:

- describe the problem without secrets, tokens, internal hosts, or local file paths outside the repository
- include exact reproduction steps when possible
- include the relevant command output or failing test name
- mention data freshness, source provenance, or fallback behavior when applicable
- note whether the issue affects public documentation, contributor workflow, or runtime behavior

If the issue involves a security concern, use the security reporting process in `SECURITY.md` instead of posting details publicly.
