# TK-RESULT — Round 5, cutover.sh (CR-007 C1, F1-F8)

Changed file: `scripts/oci-a1/cutover.sh` (only). No ssh/curl to any remote host was run; only bash -n, shellcheck, --dry-run.

## Per finding (line numbers refer to the file after the change)

- F1: new helper `restore_db_cmd` (L248-250) prints `for s in "" -wal -shm -journal; do [ -e PRE$s ] && mv -f PRE$s DB$s; done`. Used in the step 3 RECOVERY (L619-620, L682) as `ssh $OCI 'docker stop jetscope-api && <restore>; docker start jetscope-api'`, direction pre -> live. The rollback side (L832-833, L873) uses the same helper with `docker-compose ... stop api && <restore>; ... start api` (the old text was already pre->live but only for the bare file; now includes companions).
- F2: companion suffix lists are `-wal -shm -journal` in both swap scripts (L644, L649 oci; L846, L851 usa), in the dry-run text (L162, L203) and in the recovery commands. Hot-journal abort after the container is stopped and before the swap: oci L639-642 (the existing EXIT trap restarts the api), usa rollback L841-844 (message: hot journal present, start the API once normally, retry).
- F3: step 5 RECOVERY now contains `rm -f $MAINT_SNIPPET && nginx -t && systemctl reload nginx` (L416-417). Phases 5/6 are now functions `lift_gate_cutover` / `smoke_cutover` (L412-460), called from `run_cutover`. New option `--resume-smoke` (L102, `run_resume_smoke` L462-470, dispatch L946, usage/help text, dry-run branch L125) runs only 5 and 6 (`rm -f` makes the snippet removal a no-op if already gone). Preflight "already cut over" message (L512) points to `--resume-smoke`.
- F4: after a successful swap, `rm -f` of the snapshot on usa (`$USA_DUMP`) and oci (`$OCI_INCOMING`) before clearing the variables (cutover, near L695-698); same for rollback (`$OCI_DUMP`, `$USA_INCOMING`, just before `USA_INCOMING=""`). rm failure -> `fail` (variables stay set so the EXIT cleanup retries).
- F5: `public_cb` adds `?cb=$RANDOM$RANDOM` (L395); `public_no_cache_hit` fails on a `cf-cache-status` containing HIT (L399-405); applied to /v1/health and /sources in the cutover smoke and /v1/health in the rollback smoke. /sources now also asserts `X-JetScope-Served-By` contains oci-a1 (L449-451).
- F6: rollback step 4 STATE (after the restore-site phase) now says the original site has no maintenance include, so writes are already back on usa and the snippet file is unused until removed.
- F7: rollback step 2 asserts `docker inspect -f '{{.State.Running}}' jetscope-api` == `false` after `docker-compose stop api` (L791-792); oci swap script asserts the same after `docker stop` (L636-637). Dry-run text updated.
- F8: usa snapshot `mktemp /root/jetscope-cutover.XXXXXX.db` (L586); oci `mktemp $OCI_ROOT/data/.cutover-snap.XXXXXX` (L587); rollback: oci dump (L799) and usa incoming (L800) the same way, path returned to the local shell. The old `rm -f "$dump"` before `.backup` was removed (the mktemp file is the target). All remote-interpolated variables use `printf %q`: PUBLIC_HOST in `expect_gate_503`, USA_COMPOSE in the compose calls, `table_counts` db arg, and `usa_bash`/`oci_bash` now `%q`-quote every positional arg (previously `$*` was spliced raw into the remote shell, which was the actual injection path for OCI_IP/TS).
- C1: same as F8 for the usa side (`/tmp/jetscope-cutover*` no longer appears anywhere, including the dry-run text).
- OCI_IP validation: `^([0-9]{1,3}\.){3}[0-9]{1,3}$` right after option parsing (before --dry-run), exit 1 with ABORT message (L107-110 region).

## Gate output (rc of each command; the `!` ones print rc=0 when the negated command behaved as required)

```
bash -n + shellcheck -S warning ........ rc=0 (no output)
--dry-run ............................... rc=0
--rollback --dry-run .................... rc=0
--resume-smoke --dry-run ................ rc=0
! JETSCOPE_OCI_IP="1.2.3.4;id" --dry-run  rc=0 (script exited non-zero: "ABORT: JETSCOPE_OCI_IP must be an IPv4 address, got: 1.2.3.4;id")
grep -c -- "-journal" >= 3 .............. count=18, rc=0
! grep -q "/tmp/jetscope-cutover" ....... rc=0 (no match)
```

## Uncertain / residual
- `mktemp /root/x.XXXXXX.db` relies on GNU mktemp accepting a suffix after the X's (true on Ubuntu/Debian coreutils); not run remotely.
- `.backup` now writes into an existing empty mktemp file (no pre-`rm`); standard sqlite3 behaviour but unverified on the hosts.
- `--resume-smoke` does not re-check the symlink target or remove jetscope.maint (phase 7 is not part of it).
- Restore command does not delete a stale `-journal`/`-wal` of the *new* db that has no counterpart in the pre backup; restoring happens with the api stopped, so a leftover journal would be a hot-journal risk only if the new db had an interrupted write.
