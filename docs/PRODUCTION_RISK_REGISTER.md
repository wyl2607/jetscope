# JetScope Production Risk Register

Status review: 2026-08-05 UTC stability close-out

This register is intentionally conservative. A successful HTTP smoke test is
not treated as proof of recovery, security, backup, or sustained performance.

| ID | Risk | Current evidence | Status | Closure evidence / residual |
| --- | --- | --- | --- | --- |
| R-001 | No independent recurring public probe or alert route. | .github/workflows/public-smoke.yml runs every 15 minutes with bounded curl timeouts and read-only permissions. A prior manual workflow run passed, and the post-reboot public probe passed all critical paths. | Mitigated | The GitHub Actions schedule is an external detection route. It has repository notifications, not a dedicated pager/SMS escalation. |
| R-002 | Reboot recovery is configured but has not been exercised on the production host. | Controlled reboot completed on racknerd-483e137; after startup, Docker API, Next systemd service, nginx, and the SQLite backup timer were active. API liveness returned 200 and public smoke passed. | Closed | Re-run after material host or supervisor changes. |
| R-003 | SQLite disaster recovery depends on local storage unless off-host copying is automated. | Daily jetscope-sqlite-backup.timer is enabled. A non-destructive integrity/restore drill passed, and a verified backup was copied off-host with matching SHA-256. | Partial | Local scheduled backup and one off-host copy are proven. Automated off-host retention/rotation and restore alerting remain follow-ups. |
| R-004 | Production checkout identity can drift if deployment metadata is not maintained. | /opt/jetscope/.deploy-commit, /opt/jetscope HEAD, and origin/main all equal 4a686fe39980feb219678f077daf337acdd6b976; tracked diff is clean. .env and data/*.db were preserved. | Closed | Keep using the commit-pinned deploy path and retain explicit legacy backup artifacts. |
| R-005 | Shared-host security boundaries and firewall policy remain broader than JetScope. | nginx syntax passes; TLS 1.0 is rejected and TLS 1.2 succeeds; HSTS, nosniff, same-origin framing, referrer, and permissions headers are present. SSH X11 forwarding is off with keepalives. Naked-IP HTTP returns 404 because Host routing is intentional. | Mitigated | JetScope ingress is hardened. The shared host still has unrelated public services and a permissive host firewall policy; changing those is outside this app-only rollout. |
| R-006 | Sustained-load performance has no long-duration production baseline. | After #264, real HTTPS 20-concurrent probes were 20/20 for health, market health, snapshot, source coverage, and dashboard. The final #268 deployment recheck was 20/20 for dashboard (max 5.35s) and liveness (max 0.35s); API usage was 93.72 MiB / 512 MiB with restart=0 and OOM=false. | Mitigated | The bounded demo load is stable. Long-duration load testing, p95/p99 time-series, and capacity planning remain open. |
| R-007 | Dependency updates could reintroduce a vulnerable sharp downgrade. | #251 is merged with CI/security audit green; #267 now replaces the previously closed, unmerged #247 and raises root undici to 8.10.0 with CI, CodeQL, Maintenance Gates, and Release Dry Run green. The old Next #238 patch was closed because it downgraded sharp. | Monitored | Continue Dependabot review and require the security/audit gates for future upgrades. |
| R-008 | Single-node capacity and failure domain remain. | API is capped at 512 MiB/1 CPU; API and Next share a roughly 1.9 GiB VPS; there is no HA or external database. | Accepted for Demo | This is suitable for a bounded demo, not HA/commercial production. Keep ceilings, backups, external smoke, and the documented rollback path. |
| R-009 | Strict readiness is not green while optional capabilities are disabled or market sources are degraded. | `/v1/readiness` is `not_ready` with database healthy, market/source checks nonblocking but degraded, and AI research disabled. `/v1/health` remains 200; the default watchdog intentionally gates on liveness. | Accepted for Demo | Keep readiness advisory for this demo. If strict readiness is required, enable the configured AI pipeline and resolve source degradation before changing the watchdog gate. |
| R-010 | In-process Alembic bootstrap could disable application loggers and hide refresh-loop errors. | #268 changes Alembic `fileConfig` to preserve existing loggers, reapplies application logging after bootstrap, and adds five regression tests. The deployed API startup log shows Alembic context and application startup completion. | Closed | Error records are no longer silently discarded by the migration bootstrap. External log aggregation and pager escalation remain covered by R-001. |

## Verification log

- 2026-08-04: Recorded the initial risk register in PR #252 before remediation.
- 2026-08-04: #253/#260/#261/#262/#263/#264 fixed the market read path in stages: covering latest-row index, bounded refresh-run read, payload-free history read, and bounded history points/baseline seeks.
- 2026-08-04: #254 made readiness advisory by default so the liveness watchdog no longer restarts a healthy API for an optional disabled AI capability.
- 2026-08-04: #255 added the external 15-minute public smoke workflow.
- 2026-08-04: #256/#257/#258/#259 applied SSH/nginx hardening, scheduled SQLite backup, deploy provenance, and the Compose v1 stale-container guard.
- 2026-08-04: #251 dependency/security gates passed; #247/#242/#244/#245 were superseded/closed and #238 was closed because of the sharp downgrade risk.
- 2026-08-04: #267 merged the previously missed undici update to 8.10.0; all required CI, CodeQL, Maintenance Gates, and Release Dry Run checks passed.
- 2026-08-04: #268 fixed the in-process migration logging blind spot; CI, CodeQL, Maintenance Gates, and Release Dry Run passed after rebasing to current main.
- 2026-08-05: Production provenance was advanced to 4a686fe39980feb219678f077daf337acdd6b976; the API was rebuilt without touching .env or data/*.db.
- 2026-08-05: Final public smoke returned 200 for health, market health, snapshot, source coverage, curated Lufthansa events, and dashboard; 20-concurrent dashboard and liveness probes passed without API restart or cgroup OOM.
- 2026-08-05: Readiness was rechecked and remains advisory `not_ready`; this is recorded separately from healthy liveness and does not claim strict readiness.
