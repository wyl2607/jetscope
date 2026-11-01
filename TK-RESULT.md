# TK-RESULT — Sprint 001 Round 4 (Repairer): CR-006 C1, C2

- Date: 2026-10-22
- Scope: `scripts/oci-a1/install-units.sh` only
- No SSH, no remote commands, no git commit/push.

## Changed files

| File | Change |
| --- | --- |
| `scripts/oci-a1/install-units.sh` | C1: skip `systemd-analyze verify` for `jetscope-web.service` when `/opt/jetscope/node_modules/.bin/next` is not executable, print the warning, still install the unit. C2: always `enable --now` the sqlite-backup timer; enable `jetscope-health-check.timer` only when `systemctl is-active --quiet jetscope-web.service`, otherwise print the re-run note. Dry-run plan and header comments updated for both behaviors. |

## Validation (verbatim)

```console
$ bash -n scripts/oci-a1/install-units.sh && shellcheck -S warning scripts/oci-a1/install-units.sh && echo SHELLCHECK_OK
SHELLCHECK_OK

$ bash scripts/oci-a1/install-units.sh --dry-run
==> DRY-RUN: no SSH, no network, no remote changes
host=oci-a1-ts ip=100.81.227.79
would: ssh -o BatchMode=yes oci-a1-ts true
would: preflight (read-only, abort on the first two failures):
would:   test -d /opt/jetscope (abort if missing)
would:   test -x /opt/node-22/bin/node (abort if missing)
would:   test -x /usr/local/bin/oci-tg-alert (warn only if missing)
would:   test -x /opt/jetscope/node_modules/.bin/next (read-only)
would: stage=$(ssh oci-a1-ts mktemp -d /tmp/jetscope-units.XXXXXX)
would: scp -q these files to $stage:
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R4/infra/server/oci-a1/systemd/jetscope-alert@.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R4/infra/server/oci-a1/systemd/jetscope-health-check.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R4/infra/server/oci-a1/systemd/jetscope-health-check.timer
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R4/infra/server/oci-a1/systemd/jetscope-sqlite-backup.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R4/infra/server/oci-a1/systemd/jetscope-sqlite-backup.timer
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R4/infra/server/oci-a1/systemd/jetscope-web.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R4/infra/server/oci-a1/health-alert-on-change.sh
would: sudo systemd-analyze verify $stage/*.service $stage/*.timer
would:   if /opt/jetscope/node_modules/.bin/next is missing, leave jetscope-web.service out of verify:
would:     warn: jetscope-web.service not verified (next not deployed yet)
would:   jetscope-web.service is still installed below
would: template units (*@.service) are verified through a test instance name
would: for each unit: sudo cmp -s $stage/<name> /etc/systemd/system/<name>; install -o root -g root -m 644 when different
would: sudo cmp -s $stage/health-alert-on-change.sh /usr/local/bin/jetscope-health-alert-on-change; install -o root -g root -m 755 when different
would: sudo systemctl daemon-reload (only if any installed file changed)
would: sudo systemctl enable --now jetscope-sqlite-backup.timer
would: if systemctl is-active --quiet jetscope-web.service: sudo systemctl enable --now jetscope-health-check.timer
would: else: note: jetscope-health-check.timer not enabled yet; after the first deploy run: bash scripts/oci-a1/install-units.sh
would: sudo systemctl list-timers --all (filter jetscope-sqlite-backup.timer jetscope-health-check.timer)
would: print is-enabled/is-active for jetscope-sqlite-backup.timer, jetscope-health-check.timer and jetscope-web.service
would: remove $stage
note: template units such as jetscope-alert@.service are installed but never enabled
note: jetscope-web.service is installed but not enabled; enable it manually before the first deploy:
note:   sudo systemctl enable --now jetscope-web.service
note: re-run this script after the first deploy to enable jetscope-health-check.timer
```

## CR-006 criteria

- [x] C1: remote check `[[ -x /opt/jetscope/node_modules/.bin/next ]]`; when false, `jetscope-web.service` is removed from the verify set, `warn: jetscope-web.service not verified (next not deployed yet)` is printed, every other unit is verified, and the web unit is still installed (loop over `units` for install is unchanged).
- [x] C2: `jetscope-sqlite-backup.timer` is always `enable --now`; `jetscope-health-check.timer` is `enable --now` only inside `systemctl is-active --quiet jetscope-web.service`; otherwise the required note is printed. Re-running after the first deploy enables it; all file installs remain cmp/idempotent.
- [x] Dry-run plan reflects both behaviors and still never SSHes.

## TK-006 Done criteria (this round's file)

- [x] Installs web unit, backup timer, health-check timer, and the alert hook to `/usr/local/bin`; every file gated by `cmp -s`; idempotent.
- [x] Never enables/starts `jetscope-web.service`.
- [~] "only enable two timers": intentionally narrowed by CR-006 C2 to backup timer unconditional + health-check timer conditional on web being active.
- [ ] `oci-backup.sh` jetscope section and its install/rollback instructions: out of scope for this round (coordinator-owned, already completed per TK-006 status history).

## Known residual risks

- If `/opt/jetscope/node_modules/.bin/next` exists but is stale/broken, the web unit is verified as before; C1 only covers the pre-first-deploy state.
- If `jetscope-web.service` is active but the health-check script/paths are not yet valid, the health-check timer is enabled immediately; this matches the requested "active means deployed" rule.
- `systemctl is-active --quiet` is run as the SSH user (no sudo); it is a read-only query and works for unprivileged users.
- Real remote behavior (first install on oci-a1) was not executed here by design; only local static checks and dry-run were run.
