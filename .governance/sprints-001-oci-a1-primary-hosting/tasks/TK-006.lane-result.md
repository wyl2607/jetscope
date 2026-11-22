# TK-006 result — install-units.sh

## Changed files

| File | Note |
| --- | --- |
| `scripts/oci-a1/install-units.sh` | New: scp unit files to a remote `mktemp -d`, `systemd-analyze verify`, per-file `sudo cmp -s` + `sudo install`, change-only `daemon-reload`, and `enable --now` for the two timers only (web installed but not enabled). |
| `TK-RESULT.md` | This report. |

Not touched: `~/oci-a1-deploy/oci-backup.sh` (outside the repo, owned by the Coordinator), `.governance/**`, `apps/**`, `scripts/release.sh`, `scripts/auto-deploy.sh`.

## Validation (verbatim)

```text
$ bash -n scripts/oci-a1/install-units.sh && echo "bash -n OK"; command -v shellcheck >/dev/null && shellcheck -S warning scripts/oci-a1/install-units.sh; echo "shellcheck exit=$?"
bash -n OK
shellcheck exit=0
```

```text
$ bash scripts/oci-a1/install-units.sh --dry-run
==> DRY-RUN: no SSH, no network, no remote changes
host=oci-a1-ts ip=100.81.227.79
would: ssh -o BatchMode=yes oci-a1-ts true
would: preflight (read-only, abort on the first two failures):
would:   test -d /opt/jetscope (abort if missing)
would:   test -x /opt/node-22/bin/node (abort if missing)
would:   test -x /usr/local/bin/oci-tg-alert (warn only if missing)
would: stage=$(ssh oci-a1-ts mktemp -d /tmp/jetscope-units.XXXXXX)
would: scp -q these files to $stage:
would:   /Users/yumei/fleet/jr-oci-rev/TK-006/infra/server/oci-a1/systemd/jetscope-web.service
would:   /Users/yumei/fleet/jr-oci-rev/TK-006/infra/server/oci-a1/systemd/jetscope-sqlite-backup.service
would:   /Users/yumei/fleet/jr-oci-rev/TK-006/infra/server/oci-a1/systemd/jetscope-sqlite-backup.timer
would:   /Users/yumei/fleet/jr-oci-rev/TK-006/infra/server/oci-a1/systemd/jetscope-health-check.service
would:   /Users/yumei/fleet/jr-oci-rev/TK-006/infra/server/oci-a1/systemd/jetscope-health-check.timer
would:   /Users/yumei/fleet/jr-oci-rev/TK-006/infra/server/oci-a1/health-alert-on-change.sh
would: sudo systemd-analyze verify $stage/*.service $stage/*.timer
would: for each unit: sudo cmp -s $stage/<name> /etc/systemd/system/<name>; install -o root -g root -m 644 when different
would: sudo cmp -s $stage/health-alert-on-change.sh /usr/local/bin/jetscope-health-alert-on-change; install -o root -g root -m 755 when different
would: sudo systemctl daemon-reload (only if any installed file changed)
would: sudo systemctl enable --now jetscope-sqlite-backup.timer jetscope-health-check.timer
would: sudo systemctl list-timers --all (filter jetscope-sqlite-backup.timer jetscope-health-check.timer)
would: print is-enabled/is-active for jetscope-sqlite-backup.timer, jetscope-health-check.timer and jetscope-web.service
would: remove $stage
note: jetscope-web.service is installed but not enabled; enable it manually before the first deploy:
note:   sudo systemctl enable --now jetscope-web.service
dry-run exit=0
```

No `ssh`/`scp`/`rsync`/`curl` was executed against any host during this task.

## Done criteria

| Criterion | Status |
| --- | --- |
| Installs web, backup timer, health-check timer, alert script to `/usr/local/bin` | Done — the five units go to `/etc/systemd/system` (root:root 644), `health-alert-on-change.sh` to `/usr/local/bin/jetscope-health-alert-on-change` (root:root 755). |
| Every file has a `cmp` decision and the script is re-runnable | Done — `sudo cmp -s` per file; identical files print `ok: … unchanged`; `enable --now` is idempotent. |
| Web is never enabled by this script; only the two timers are enabled | Done — `enable --now` lists only `jetscope-sqlite-backup.timer` and `jetscope-health-check.timer`, plus the printed manual-enable hint. |
| Preflight: `/opt/jetscope` and `/opt/node-22/bin/node` required, `oci-tg-alert` warning only | Done — first two abort, missing alert command prints `warn:` and continues. |
| `--dry-run` performs no SSH and no network I/O | Done — early exit before any connection; only local file existence checks. |
| Prints `systemctl list-timers` for both timers and web enabled/active state | Done — filtered `list-timers --all` plus `is-enabled`/`is-active` for both timers and `jetscope-web.service`. |
| Temp staging dir cleaned up | Done — remote `trap cleanup EXIT`, plus a local best-effort `ssh … rm -rf` trap. |
| Secret values never printed | N/A — the script handles no secrets. |
| `oci-backup.sh` jetscope segment + install/rollback commands | Out of scope for this TK lane (Coordinator edits `~/oci-a1-deploy/oci-backup.sh`). |

## Known residual risks

- `systemd-analyze verify` runs against the staged copies in `/tmp`; timer `Requires=` units are passed in the same invocation, but a future unit edit that references something outside that set would surface as a verify failure (intentional fail-fast).
- `enable --now` is executed on every run even when nothing changed; this is idempotent but will restart a timer's schedule only if it was inactive.
- `scp` staging assumes `$OCI` resolves as an SSH host alias and that the remote `/tmp` is writable by `ubuntu`; both match bootstrap.sh's assumptions.
- Real remote behaviour (sudo prompts, systemd version differences) can only be confirmed when a human runs the script on oci-a1.
