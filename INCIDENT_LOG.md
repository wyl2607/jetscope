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
- **Root cause**: Verified 2026-11-24 (read-only). Cloudflare reaches the origin (usa-vps nginx) over plain HTTP on port 80: a request sent through Cloudflare to `https://saf.meichen.beauty/api/health` was logged in the host's port-80 log (`/var/log/nginx/access.log`, client IP restored by `conf.d/cloudflare-realip.conf`) as `GET /api/health HTTP/1.1 301`. The live port-80 server block for this host only does `return 301 https://$host$request_uri;`, so every edge request is sent back to the same URL. The origin itself is healthy: HTTPS pinned to the origin returns 200, and the live nginx files are unchanged since 2026-08-05 (jetscope) and 2026-10-22 (esg), so the change was on the Cloudflare side. `esg.meichen.beauty` and the apex `meichen.beauty` loop the same way, which points at the zone-wide SSL/TLS encryption mode (Flexible) rather than a per-host rule.
- **Affected surfaces**: Public HTTPS edge for `saf.meichen.beauty` (all `/v1/*` and `/dashboard` paths); the `Public Smoke Monitor` workflow `.github/workflows/public-smoke.yml`.
- **Fix**: Pending: operator sets Cloudflare → `meichen.beauty` → SSL/TLS → Overview → encryption mode to Full (strict) so the edge reaches the origin over 443 (the origin certificates are valid Let's Encrypt certificates). If that is already Full (strict), look for a Configuration Rule or Origin Rule that sets SSL to Flexible or the origin port to 80.
- **Verification**: `curl -fsS --location https://saf.meichen.beauty/v1/health` — must stop redirecting and return a healthy JSON body instead of `(47) Maximum redirects followed`.
- **Prevention**: Have the smoke workflow print the response headers on failure, so a redirect chain is visible in the workflow log rather than only as a bare curl exit code.
