# JetScope Production Risk Register

Status review: 2026-08-04 stability follow-up

This register is intentionally conservative. A successful HTTP smoke test is
not treated as proof of recovery, security, backup, or sustained performance.

| ID | Risk | Current evidence | Status | Closure evidence |
| --- | --- | --- | --- | --- |
| R-001 | No independent recurring public probe or alert route. | Public endpoints were tested manually from the VPS; no external scheduler has been verified. | Open | An independent probe records bounded latency/status and alerts on repeated failures. |
| R-002 | Reboot recovery is configured but has not been exercised on the production host. | `docker` and `jetscope-web.service` are enabled and active; no reboot drill has been run. | Open | Controlled reboot drill, service recovery, and public smoke all pass. |
| R-003 | SQLite backup/restore and off-host retention are not proven for this deployment. | Database is mounted from `/opt/jetscope/data`; local rollback container and lock backup exist, but no restore drill is recorded. | Open | Integrity-checked backup, non-destructive restore drill, and off-host copy are verified. |
| R-004 | Production checkout identity is not commit-pinned. | Code was synchronized without replacing `/opt/jetscope/.git`; deployed content matches main, but remote Git metadata is stale/dirty. | Open | Deployment records the exact main commit and remote checkout/status agree without touching `.env` or DB files. |
| R-005 | Nginx/SSH/TLS hardening has only been spot-checked. | TLS and Host routing work for `saf.meichen.beauty`; naked-IP behavior, headers, certificate renewal, SSH policy, and firewall need a recorded audit. | Open | Read-only security audit has no critical finding; safe config fixes pass `nginx -t` and external checks. |
| R-006 | Slow-path performance has no sustained-load baseline. | `market/health` is fast after the event-loop fix; snapshot and coverage are around 1–2 seconds in light tests. | Open | Bounded concurrency test records p50/p95, error rate, memory, and no timeout regression. |
| R-007 | Dependency updates are clean today, but Next.js patching must not reintroduce a vulnerable `sharp` downgrade. | #251 is merged with CI/security audit green; the old Next #238 patch was closed because it downgraded `sharp`. | Monitored | Dependabot/CI remains green and a compatible Next update retains the safe sharp line. |
| R-008 | Single-node capacity and failure domain remain. | API is capped at 512 MiB/1 CPU and the VPS has about 1.9 GiB RAM; there is no HA or external database. | Accepted for Demo | Keep resource ceilings, backups, health monitoring, and document that this is not HA production. |

## Verification log

- 2026-08-04: PR #250 merged and deployed; API direct and public-IP/SNI smoke passed.
- 2026-08-04: PR #251 merged; CI, CodeQL, Maintenance Gates, Release Dry Run, and security audit passed.
- 2026-08-04: Docker API and systemd web ownership verified active; public smoke passed for health, market health, snapshot, curated event, and dashboard.
