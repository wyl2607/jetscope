# JetScope Incident Log

This file records real failures, repeated regressions, root causes, fixes, and prevention rules for JetScope.

## Recording Rule

- Record incidents that affect development, release, deployment, data safety, or repeated AI handoff behavior.
- Keep routine progress in `PROJECT_PROGRESS.md`.
- Include symptom, impact, root cause, affected surfaces, fix, verification, and prevention rule.

## Current Incidents

### 2026-11-07 Public HTTPS unreachable — Cloudflare 301 self-loop

- **Symptom**: The last successful public smoke run was `42393936815` at 2026-11-07T16:58Z. Every later smoke run fails (for example `43395791910`); a direct `curl` against the public host aborts with `(47) Maximum redirects followed`, i.e. a 301 redirect that keeps pointing back at itself.
- **Impact**: The public site became unreachable sometime after 2026-11-07T16:58Z (first failing smoke run `42452214650` at 2026-11-08T05:48Z), and the scheduled `Public Smoke Monitor` workflow has been red on every run since. GitHub ran the schedule only a few times a day in this period, so the exact start is not known.
- **Root cause**: Suspected, unverified: Cloudflare SSL/TLS mode is set to Flexible, so Cloudflare talks to the origin over port 80 while the repository's reference edge config `infra/server/nginx.conf:62-66` 301-redirects port 80 back to `https://` (the live vhost on the host is a separately edited copy and was not inspected), producing an endless redirect loop.
- **Affected surfaces**: Public HTTPS edge for `saf.meichen.beauty` (all `/v1/*` and `/dashboard` paths); the `Public Smoke Monitor` workflow `.github/workflows/public-smoke.yml`.
- **Fix**: Pending: operator sets the Cloudflare SSL/TLS mode to Full (strict) so the edge reaches the origin over 443.
- **Verification**: `curl -fsS --location https://saf.meichen.beauty/v1/health` — must stop redirecting and return a healthy JSON body instead of `(47) Maximum redirects followed`.
- **Prevention**: Have the smoke workflow print the response headers on failure, so a redirect chain is visible in the workflow log rather than only as a bare curl exit code.
