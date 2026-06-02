# Release Process

JetScope release discipline is intentionally split into three different paths:

1. Local dry-run readiness checks.
2. Publish to GitHub from an approved commit.
3. Production deployment from the published commit.

This document is public guidance for reviewers and contributors. It does not replace the operator-owned release memory in `OPERATIONS.md`.

## 1. Local Dry Run

Use the dry-run entrypoint to verify local readiness without triggering any side effects:

```bash
./scripts/release-dry-run.sh
```

Default checks:

- `npm run preflight`
- `scripts/security_check.sh`
- `scripts/review_push_guard.sh origin/main`
- `git diff --check`

For faster iteration, contributors can skip expensive gates individually:

```bash
./scripts/release-dry-run.sh --skip-preflight
```

The dry run is conservative by default. It does not push, publish, deploy, SSH, rsync, or mutate remote state.

## 2. Publish

The canonical publish and deploy path remains approval-gated in `OPERATIONS.md` and `scripts/release.sh`.

Publish operations require an operator-supplied approval token flow. That flow is described in `OPERATIONS.md`; the token itself is never stored in this repository and should be treated as short-lived, one-time authorization for the specific action it approves.

Publish validation is still local-first. The repository-local push gates are:

- `scripts/security_check.sh`
- `scripts/review_push_guard.sh origin/main`

These gates are designed to fail closed before any push occurs.

## 3. Deploy

Production deployment is not performed by the dry run.

The canonical deploy command remains the approval-gated release path in `OPERATIONS.md`. That path uses the published commit, approval-token checks, and the VPS deploy flow described there.

Do not duplicate private hostnames, credentials, SSH identities, or service commands in this document.

## NPM Publishing

`package.json` sets `private: true`, so npm publishing is intentionally disabled for this application monorepo. Release readiness here is about GitHub publication and operator-controlled deployment, not npm registry distribution.

## Reviewer Checklist

- Run `./scripts/release-dry-run.sh` before requesting release review.
- Confirm the working tree is clean before any publish attempt.
- Verify the approval-token flow in `OPERATIONS.md` for any real publish or deploy action.
- Keep secrets, private hostnames, and runtime state out of committed release docs.
