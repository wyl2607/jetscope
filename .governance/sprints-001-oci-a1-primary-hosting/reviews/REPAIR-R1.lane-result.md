# TK-RESULT — Sprint 001 Round 1 (Repairer)

Scope: only the 4 confirmed findings (R1–R4). No other files touched, no remote
access, no commit. Temporary test data lived under `.tmp/` and was removed.

Changed files:

- `infra/server/oci-a1/health-alert-on-change.sh`
- `scripts/oci-a1/bootstrap.sh`
- `scripts/oci-a1/seed.sh`

## R1 — CR-002 C1 (major): status=ok no longer fakes recovery

`infra/server/oci-a1/health-alert-on-change.sh`

- `:107` added `http_code_from_error()`, which splits the payload `error`
  field into `name=code` tokens and prints the numeric code for one name.
- `:131-155` `status=ok` now derives components solely from
  `api=<code>`, `readiness=<code>`, `web=<code>` in `error`:
  - `api` is healthy only when **both** `api` and `readiness` are `200`
    (`:138-142`); otherwise the api state is left unchanged this round.
  - `web` is healthy only when `web` is `200` (`:143-148`); otherwise the
    web state is left unchanged.
- `:149-155` `failed` / `recovered` keep the previous summary+error inference,
  unchanged. `recovering` is still log-only.
- `:156` message adjusted because the ok path no longer infers from summary.
- Header comment records the per-component contract (`:28-32`).

Simulation (temp state dir + fake alert command), events in order:
failed(api) → failed(api) → ok(`api=000 readiness=000 web=200`) →
failed(api) → ok(`api=200 readiness=200 web=200`):

```text
--- event 1: failed(api)
jetscope-health-alert: alerted: [localhost] jetscope-api ok -> failed: status=failed producer=infra/server/health-check.sh summary=api unhealthy, restart disabled error=liveness=000 readiness=000
--- event 2: failed(api)
jetscope-health-alert: api still failed (status=failed); no alert
--- event 3: ok(api=000 readiness=000 web=200)
jetscope-health-alert: status=ok but api=000 readiness=000; api state unchanged
jetscope-health-alert: web still ok (status=ok); no alert
--- event 4: failed(api)
jetscope-health-alert: api still failed (status=failed); no alert
--- event 5: ok(api=200 readiness=200 web=200)
jetscope-health-alert: alerted: [localhost] jetscope-api failed -> ok: status=ok producer=infra/server/health-check.sh summary=health check ok error=api=200 readiness=200 web=200
jetscope-health-alert: web still ok (status=ok); no alert
=== alerts (2 total) ===
ALERT [localhost] jetscope-api ok -> failed: status=failed producer=infra/server/health-check.sh summary=api unhealthy, restart disabled error=liveness=000 readiness=000
ALERT [localhost] jetscope-api failed -> ok: status=ok producer=infra/server/health-check.sh summary=health check ok error=api=200 readiness=200 web=200
```

Alert count = **2**: one ok→failed (event 1) and one failed→ok (event 5).
The event-3 `ok` no longer produces a fake recovery.

## R2 — CR-004 C1 (major, security): pin the Node release signer

`scripts/oci-a1/bootstrap.sh`

- `:38-42` new `NODE_SIGNER_FPRS` allowlist (space separated), defaulting to
  `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`; the comment states this is the
  primary key that signed the `v22.23.4` `SHASUMS256.txt.sig` and must be
  updated when `NODE_VERSION` changes.
- `:62-63` dry-run plan shows the allowlist and the new remote invocation.
- `:78-80` dry-run plan describes the `--status-fd` verification and that the
  `VALIDSIG` primary fingerprint must be allowlisted.
- `:92` passes the allowlist to the remote shell as `$2`; `:96` reads it there.
- `:195-207` verification is now
  `gpg --batch --status-fd 1 --verify ...`; the signer is the last field of the
  `[GNUPG:] VALIDSIG` line (`:199-200`). An empty fingerprint or a fingerprint
  outside `NODE_SIGNER_FPRS` aborts before `sha256sum -c` (`:201-207`).

Logic check against a synthetic gpg status stream and the allowlist:

```text
accept 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
abort 0000000000000000000000000000000000000000 (not allowed)
```

## R3 — CR-004 C2 (minor, security): validate keys.list fingerprints

`scripts/oci-a1/bootstrap.sh:185-186`

Before the fingerprint is interpolated into the download URL or the
`$work/<fingerprint>.asc` path, it must match `^[A-F0-9]{40}$`, else `abort`.

```text
accept 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
abort 5be8a3f6c8a5c01d106c0ad820b1a390b168d356
abort ../../etc/passwd
abort ABC
```

## R4 — CR-005 C1 (minor, security): keep the admin token out of argv

`scripts/oci-a1/seed.sh`

- `:239` oci side: `T="$tok" awk '... ENVIRON["T"] ...'` instead of
  `awk -v t="$tok"`.
- `:260` usa side: `T="$token" awk '... ENVIRON["T"] ...'` instead of
  `awk -v t="$token"`.

The token is now passed in the command environment, not in argv, so a
non-root `ps` on the host cannot read it. Replacement logic is otherwise
identical.

## Verification

```text
$ bash -n infra/server/oci-a1/health-alert-on-change.sh scripts/oci-a1/bootstrap.sh scripts/oci-a1/seed.sh
bash -n: OK
$ shellcheck -S warning infra/server/oci-a1/health-alert-on-change.sh scripts/oci-a1/bootstrap.sh scripts/oci-a1/seed.sh
shellcheck: OK
```

```text
$ bash scripts/oci-a1/bootstrap.sh --dry-run
==> DRY-RUN: no SSH, no network, no remote changes
host=oci-a1-ts ip=100.81.227.79 standby=usa-vps node_version=v22.23.4
node signer fingerprints (NODE_SIGNER_FPRS): 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
would: ssh -o BatchMode=yes oci-a1-ts bash -s -- v22.23.4 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
would: cd / (ubuntu home is 750)
would: preflight (read-only, abort on any failure):
would:   sudo tailscale serve status  -> empty or contains 'No serve config'
would:   sudo tailscale funnel status -> empty or contains 'No serve config'
would:   df -Pk / -> available KiB >= 5242880 (5 GiB)
would:   docker compose version
would:   sudo -n true
would: ensure /opt/jetscope and /opt/jetscope/data are ubuntu:ubuntu 750
would: if /opt/node-22/bin/node --version != v22.23.4:
would:   download https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-arm64.tar.xz
would:   download https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
would:   download https://nodejs.org/dist/v22.23.4/SHASUMS256.txt.sig
would:   download https://raw.githubusercontent.com/nodejs/release-keys/main/keys.list
would:   import each https://raw.githubusercontent.com/nodejs/release-keys/main/keys/<fingerprint>.asc
would:   into a temporary GNUPGHOME, then gpg --batch --status-fd 1 --verify SHASUMS256.txt.sig SHASUMS256.txt
would:   read the primary key fingerprint (last field of the [GNUPG:] VALIDSIG line)
would:   abort unless that fingerprint is one of: 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
would:   grep ' node-v22.23.4-linux-arm64.tar.xz$' SHASUMS256.txt | sha256sum -c -
would:   extract to /opt/node-22.new, keep the old tree as /opt/node-22.prev, then rename
would:   assert /opt/node-22/bin/node --version == v22.23.4
would: else print ok: node v22.23.4 already installed
would: if sqlite3 is missing: sudo apt-get install -y sqlite3
would: else print ok: sqlite3 already installed
would: print summary: node version, /opt/jetscope modes, serve/funnel status
```

```text
$ bash scripts/oci-a1/seed.sh --dry-run --rotate-admin-token --force-db
seed dry-run: OK (exit 0)
$ grep -n 'awk -v t=' scripts/oci-a1/seed.sh
(no output, exit 1)
```

## Remaining risk

- The R2 `VALIDSIG` primary-key field (last field) requires GPG that emits the
  primary fingerprint there (GPG >= 2.2.12, Ubuntu 24.04 ships 2.4). On older
  GPG the check aborts rather than trusting the signature.
- `NODE_SIGNER_FPRS` is pinned to the `v22.23.4` signer; bumping
  `NODE_VERSION` without updating it will abort verification by design.
- R1 assumes the `status=ok` payload keeps the `api=/readiness=/web=` layout
  that `infra/server/health-check.sh` emits today. Any other `ok` payload now
  changes no state and only logs.
